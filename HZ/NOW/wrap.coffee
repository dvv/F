'use strict'

Proxy = require 'node-proxy'

hasProp = Object::hasOwnProperty
own = (obj, prop) -> hasProp.call obj, prop

module.exports.wrap = (store, sessions, clientId) ->

	taint = {}
	taintedFqns = {}
	set = if store then (store.set or store.save).bind(store) else null

	update = (key, fqn) ->

		if not taint[key] and store
			taintedFqns[key] = {}
			process.nextTick () ->
				if own session, key
					# FIXME: set can be null!
					set key, sessions[key], (err) ->
						console.error err if err
					, taintedFqns[key]
				else
					store.remove key
				taint[key] = undefined
				taintedFqns[key] = undefined
		taint[key] = true
		val = getVarAtFqn fqn, sessions[key]
		fqn = 'now.' + convertToDotNotation fqn
		taintedFqns[key][fqn] = if val?.toFqn? then val.toFqn() else val

	wrapRoot = (rootKey, obj, path, nowObject) ->
		return obj if typeof obj isnt 'object' or obj is null
		setTaint = update.bind {}, rootKey
		wrap = wrapRoot.bind {}, rootKey

		Proxy.create
			get: (recv, name) ->
				if name is 'toJSON' and not own obj, name
					return () -> obj
				else if name is 'toFqn' and not own obj, name
					return () -> {$ref: "$#{path}"}
				else
					returnObj = obj[name]
					if typeof returnObj is 'function'
						if clientId
							returnObj = returnObj.bind now: nowObject, user: {clientId: clientId}
						else
							returnObj = returnObj.bind now: nowObject
				  wrap returnObj, "#{path}[\"#{name}\"]"
			set: (recv, name, value) ->
				obj[name] = value
				setTaint "#{path}[\"#{name}\"]"
				wrap obj[name], "#{path}[\"#{name}\"]"
			enumerate: () ->
				Object.keys obj
			hasOwn: (name) ->
				own obj, name
			delete: (name) ->
				if obj.propertyIsEnumerable name
					setTaint path
				delete obj[name]
			fix: () ->
				undefined
		, Object.getPrototypeOf obj

	theProxy = Proxy.create
		get: (recv, name) ->
			if name is 'toJSON' and not own sessions, name
				return () -> sessions
			else
				returnObj = wrapRoot name, sessions[name], '["'+name+'"]', theProxy
				if typeof returnObj is 'function' and own sessions, name
					if clientId
						returnObj = returnObj.bind now: theProxy, user: {clientId: clientId}
					else
						returnObj = returnObj.bind now: theProxy
				returnObj
		set: (recv, name, value) ->
			sessions[name] = value
			update name, '["'+name+'"]'
			wrapRoot name, value, name, theProxy
		enumerate: () ->
			if sessions then Object.keys sessions else []
		hasOwn: (name) ->
			own sessions, name
		delete: (name) ->
			update name, '["'+name+'"]'
			delete session[name]
		fix: () ->
			undefined
	, Object.getPrototypeOf sessions

convertToDotNotation = (lameFqn) ->
	fqn = String(lameFqn or '').replace '"', ''
	fqn = fqn.substring 1, fqn.length - 1
	fqn = fqn.replace /\]\[/g, '.'

getVarAtFqn = (fqn, scope) ->
	path = String(fqn or '').split('.').slice(1)
	currVar = scope
	for prop in path
		break unless currVar
		currVar = currVar[prop]
	currVar
