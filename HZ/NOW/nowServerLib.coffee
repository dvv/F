Proxy = require './wrap'
Io = require 'socket.io'
nowUtil = require('./nowUtil').nowUtil

socket = undefined
everyone = undefined

fileServer = require './fileServer'
ClientGroup = require('./clientGroup').ClientGroup

hasProp = Object::hasOwnProperty
own = (obj, prop) -> hasProp.call obj, prop

nowCore =
	scopes: {}
	proxies: {}
	closures: {}
	clientGroups: {}
	groups: {}
	defaultScopes:
		everyone:{}
	options:
		clientWrite: true
		socketio: {}

	messageHandlers: {

		remoteCall: (client, data) ->
			nowUtil.debug 'handleRemoteCall', data.callId
			clientScope = nowCore.proxies[client.sessionId]
			if data.fqn.split('_')[0] is 'closure'
				func = nowCore.closures[data.fqn]
			else
				func = nowUtil.getVarFromFqn data.fqn, clientScope
			for arg, i in data.args
				if arg and own(arg, 'type') and arg.type is 'function'
					data.args[i] = nowCore.constructRemoteFunction client, arg.fqn
			callId = data.callId
			func?.apply? {
				now: clientScope
				user:
					clientId: client.sessionId
			}, data.args
			nowUtil.debug 'handleRemoteCall' , "completed #{callId}"

		createScope: (client, data) ->
			scope = nowUtil.retrocycle data.scope, nowCore.constructHandleFunctionForClientScope client
			nowUtil.debug 'handleCreateScope', ''
			nowUtil.print scope
			# Create proxy object
			sid = client.sessionId
			nowCore.proxies[sid] = proxy.wrap nowCore.constructClientScopeStore(client), scope, sid
			nowCore.scopes[sid] = scope
			nowCore.clientGroups[sid] = []
			everyone.addUser sid

		replaceVar: (client, data) ->
			if nowCore.options.clientWrite
				newVal = nowUtil.retrocycle {key: data.value}, nowCore.constructHandleFunctionForClientScope client
				nowUtil.debug 'handleReplaceVar', data.key + ' => ' + data.value
				nowUtil.print data.value
				scope = nowCore.scopes[client.sessionId]
				obj = {}
				obj[data.key] = newVal.key
				nowUtil.multiMergeFunctionsToMulticallers nowCore.clientGroups[client.sessionId], obj
				scope[data.key] = newVal.key
			else
				nowUtil.debug 'handleReplaceVar', 'preventing client write'
	}

	handleDisconnection: (client) ->
		# Remove scope and other functions
		unless client.connected
			sid = client.sessionId
			everyone.removeUser sid
			delete nowCore.scopes[sid]
			delete nowCore.proxies[sid]
			delete nowCore.closures[sid]
		return

	constructHandleFunctionForClientScope: (client) ->
		(funcObj) ->
			multiCaller = everyone.generateMultiCaller funcObj.fqn
			nowUtil.createVarAtFqn funcObj.fqn, everyone.nowScope, multiCaller
			nowCore.constructRemoteFunction client, funcObj.fqn

	constructRemoteFunction: (client, fqn) ->
		nowUtil.debug 'constructRemoteFunction', fqn
		remoteFn = (args...) ->
			callId = fqn + '_' + nowUtil.generateRandomString()
			nowUtil.debug 'executeRemoteFunction', fqn + ', ' + callId
			for arg, i in args
				if typeof arg is 'function'
					closureId = 'closure_' + arg.name + '_' + nowUtil.generateRandomString()
					nowCore.closures[closureId] = arg
					args[i] = type: 'function', fqn: closureId
			process.nextTick () ->
				client.send
					type: 'remoteCall'
					data:
						callId: callId
						fqn: fqn
						args: args
		remoteFn

	constructClientScopeStore: (client) ->
		{
			set: (key, val, callback, changes) ->
				nowUtil.debug 'clientScopeStore', "#{key} => #{val}"
				data =	nowUtil.decycle val, "now.#{key}", [nowUtil.serializeFunction, everyone.generateMultiCaller]
				# data[0] = For client
				# data[1] = For everyone
				client.send type: 'replaceVar', data: {key: key, value: data[0]}
				everyone.nowScope[key] = data[1]
				obj = {}
				obj[key] = val
				nowUtil.multiMergeFunctionsToMulticallers nowCore.clientGroups[client.sessionId], obj
				callback?()
			remove: (key) ->
				#console.log "remove #{key}"
		}

handleNewConnection = (client) ->
	client.on 'message', (message) ->
		if message and own(message, type) and own(nowCore.messageHandlers, message.type)
			nowCore.messageHandlers[message.type] client, message.data
	client.on 'disconnect', () ->
		nowCore.handleDisconnection client

exports.getGroup = (groupName) ->
	if not own nowCore.groups, groupName
		nowCore.defaultScopes[groupName] = {}
		nowCore.groups[groupName] = new ClientGroup nowCore, socket, groupName
	nowCore.groups[groupName]

exports.initialize = (server, options) ->
	# Merge user and default options
	nowUtil.mergeScopes nowCore.options, options
	# Override the default HTTP server listeners
	fileServer.wrapServer server, nowCore.options
	socket = Io.listen server, nowCore.options.socketio or {}
	everyone = new ClientGroup nowCore, socket, 'everyone'
	everyone.setAsSuperGroup()
	socket.on 'connection', (client) ->
		nowUtil.initializeScope nowCore.defaultScopes.everyone, client
		handleNewConnection client
	everyone

# Handle uncaught exceptions
process.on 'uncaughtException', (err) -> nowUtil.error err
