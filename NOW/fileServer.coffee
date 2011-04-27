'use strict'

Fs = require 'fs'

fileCache = {}
nowFileCache = undefined

defaultListeners = undefined
server = undefined
options = undefined

hasProp = Object::hasOwnProperty
own = (obj, prop) -> hasProp.call obj, prop

serveFile = (filename, request, response, options = {}) ->
	if own fileCache, filename
		response.writeHead 200
		response.write fileCache[filename]
		response.end()
	else
		if ~filename.indexOf '/now.js'
			if nowFileCache is undefined
				Fs.readFile filename, 'utf8', (err, text) ->
					host = request.headers.host.split ':'
					hostServer = options.host or host[0]
					hostPort = if host.length > 1 then host[1] else 80
					hostPort = options.port or hostPort
					text = text.replace /\*\*SERVER\*\*/g, hostServer
					text = text.replace /\*\*PORT\*\*/g, hostPort
					Fs.readFile __dirname + '/nowUtil.js', 'utf8', (err, textUtil) ->
						nowFileCache = nowUtil: textUtil, now: text
						serveFile filename, request, response
						return
					return
			else
				response.writeHead 200, 'content-type': 'text/javascript'
				response.write nowFileCache.nowUtil
				response.write nowFileCache.now
				response.end()
		else
			Fs.readFile filename, 'utf8', (err, text) ->
				fileCache[filename] = text
				serveFile filename, request, response
				return
			return

module.exports.wrapServer = (httpServer, serverOptions) ->
	server = httpServer
	options = serverOptions
	defaultListeners = server.listeners 'request'
	server.removeAllListeners 'request'
	server.on 'request', (request, response) ->
		# Handle only GET requests for /nowjs/* files. Pass all other requests through
		if request.method is 'GET' and request.url.split('?')[0] is '/nowjs/now.js'
			serveFile __dirname + '/now.js', request, response, options
			return
		for k, v of defaultListeners
			v.call server, request, response
		return
