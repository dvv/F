'use strict'

proxy = require './wrap.js'
nowUtil = require('./nowUtil.js').nowUtil
EventEmitter = require('events').EventEmitter

own = (obj, prop) -> __hasProp.call obj, prop

class ClientGroup extends EventEmitter

	constructor: (@nowCore, @socket, @groupName) ->

		@groupScopes = {}
		@nowScope = {}
		@count = 0
		#@isSuperGroup = false

		store =
			set: (key, val, callback, changes) ->
				nowUtil.debug "#{groupName}Store", "#{key} => #{val}"
				# put all relevant @nowCore.scopes in array so we traverse only once
				# TODO: _.values
				currScopes = []
				for k, v of groupScopes
					currScopes.push v
				currScopes.push @nowCore.defaultScopes[groupName]
				nowUtil.mergeChanges currScopes, changes

				if @isSuperGroup
					obj = {}
					obj[key] = val
					nowUtil.multiMergeFunctionsToMulticallers @nowCore.groups, obj

				self = @
				data = nowUtil.decycle val, "now.#{key}", [(fqn, func) ->
					multiCaller = self.generateMultiCaller fqn
					nowUtil.createVarAtFqn fqn, @nowScope, multiCaller
					nowUtil.serializeFunction fqn, func
				]

				clients = socket.clients
				for clientId, v of @groupScopes
					clients[clientId].send
						type: 'replaceVar'
						data:
							key: key
							value: data[0]
				callback?()
			remove: (key) ->
				# console.log "remove #{key}"

		@now = proxy.wrap store, nowScope

	connected: (func) ->
		@on 'connect', func

	disconnected: (func) ->
		@on 'disconnect', func

	setAsSuperGroup: () ->
		@isSuperGroup = true

	addUser: (clientId) ->
		if clientId of @nowCore.scopes
			if not @isSuperGroup
				nowUtil.multiMergeFunctionsToMulticallers [@], @nowCore.scopes[clientId]
				@nowCore.clientGroups[clientId].push @
				nowUtil.mergeScopes @nowCore.proxies[clientId], @nowCore.defaultScopes[groupName]
			else
				nowUtil.mergeScopes @nowCore.scopes[clientId], @nowCore.defaultScopes[groupName]
			@groupScopes[clientId] = @nowCore.scopes[clientId]
			@count += 1
			@emit.apply
				_events: @_events
				now: @nowCore.proxies[clientId]
				user:
					clientId: clientId
			, ['connect', clientId]
		else
			throw new Error 'Invalid client id'

	removeUser: (clientId) ->
		if clientId of @groupScopes
			@count -= 1
			@emit.apply
				_events: @_events
				now: @nowCore.proxies[clientId]
				user:
					clientId: clientId
			, ['disconnect', clientId]
			delete @groupScopes[clientId]

	generateMultiCaller: (fqn) ->
		nowUtil.debug 'generateMultiCaller', fqn
		() ->
			for clientId, clientScope of @groupScopes
				nowUtil.debug 'Multicaller', "Calling #{fqn} on client #{clientId}"
				func = nowUtil.getVarFromFqn fqn, clientScope
				if typeof func?.apply is 'function'
					func.apply
						now: clientScope
						user:
							clientId: clientId
					, arguments
				else
					nowUtil.debug 'Multicaller', "No function found for client #{clientId}"

module.exports = ClientGroup
