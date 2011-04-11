'use strict';

/*
 *
 * Copyright(c) 2011 Vladimir Dronnikov <dronnikov@gmail.com>
 * MIT Licensed
 *
*/

var Url = require('url'),
		Fs = require('fs'),
		Path = require('path');

//
// ReST resource routing
//
module.exports = function setup(root, options) {

	// setup
	options = options || {};

	// normalize mount points to always end in /
	if (root[root.length - 1] !== '/') { root += '/'; }

	// whether to PUT /Foo/_new calls Foo.add()
	var brandNewID = options.putNew ? options.putNew : {};

	// handler
	return function handler(req, res, next) {
		// parse out pathname if it's not there already (other middleware may have done it already)
		//if (!req.hasOwnProperty('uri')) { req.uri = Url.parse(req.url); }

		// mount relative to the given root
		var path = req.uri.pathname;
		if (path.substr(0, root.length) !== root) { return next(); }

		// get the requested controller and method
		var parts = path.substr(root.length).split('/').map(function(p){return decodeURIComponent(p);});
		if (parts[parts.length - 1] === '') { parts.pop(); } // N.B. trailing slash is noop

		//process.log('PARTS', parts);

		// find the resource name/id pair
		var resource = parts[0];
		var id = parts[1];

		//
		// determine the handler method and parameters
		//
		Next(null, function(err, result, step) {
			var context = req.context || {};
			//console.log('CAPS', context, req.session);
			var verb = req.method;
			var method;
			var params;
			//
			// query resource
			//
			if (verb === 'GET') {
				method = 'get';
				// get by ID
				if (id && id !== brandNewID) {
					params = [id];
				// query
				} else {
					method = 'query';
					// bulk get via POST X-HTTP-Method-Override: GET
					if (Array.isArray(req.body)) {
						params = [req.body];
					// query by RQL
					} else {
						params = [req.uri.search];
					}
				}
			//
			// create new / update resource
			//
			} else if (verb === 'PUT') {
				method = 'update';
				if (id) {
					// add new
					if (id === brandNewID) {
						method = 'add';
						params = [req.body];
					// update by ID
					} else {
						params = [id, req.body];
					}
				} else {
					// bulk update via POST X-HTTP-Method-Override: PUT
					if (Array.isArray(req.body) && Array.isArray(req.body[0])) {
						params = [req.body[0], req.body[1]];
					// update by RQL
					} else {
						params = [req.uri.search, req.body];
					}
				}
			//
			// remove resource
			//
			} else if (verb === 'DELETE') {
				method = 'remove';
				if (id && id !== brandNewID) {
					params = [id];
				} else {
					// bulk remove via POST X-HTTP-Method-Override: DELETE
					if (Array.isArray(req.body)) {
						params = [req.body];
					// remove by RQL
					} else {
						params = [req.uri.search];
					}
				}
			//
			// arbitrary RPC to resource
			//
			} else if (verb === 'POST') {
				// if creation is via PUT, POST is solely for RPC
				// if `req.body` has truthy `jsonrpc` key -- try RPC
				if (options.putNew || req.body.jsonrpc) {
					// RPC
					method = req.body.method;
					params = [req.body.params];
				// else POST is solely for creation
				} else {
					// add
					method = 'add';
					params = [req.body];
				}
			//
			// get capabilities of resource
			//
			} else if (verb === 'OPTIONS') {
				// enlist resource own methods
				/*
				resource = resource ? context[resource] : context;
				var methods = [];
				for (var key in resource) {
					var value = resource[key];
					process.log(parts[0], key);
					if (resource.hasOwnProperty(key) && value) {// && typeof value.apply === 'function') {
						// TODO: filter out 'private' methods?
						methods.push(key);
					}
				}
				return step(null, methods);
				*/
			//
			// unsupported verb
			//
			} else {
			}

			// debug
			//return res.send([resource, method, params]);

			//
			// find the resource
			//
			// bail out unless resource is found
			if (!context.hasOwnProperty(resource)) {
				return next();
			}
			resource = context[resource];
			// bail out if method is unsupported
			if (!resource.hasOwnProperty(method)) {
				return step((options.jsonrpc || req.body.jsonrpc) ? 'notsupported' : 405);
			}
			//
			// call the handler. signature is fn(context, params..., step)
			//
			params.unshift(context);
			params.push(step);
			resource[method].apply(null, params);
		//
		// wrap the response to JSONRPC format, if specified by `options.jsonrpc` or `req.body.jsonrpc`
		//
		}, function(err, result, step) {
			if (options.jsonrpc || req.body.jsonrpc) {
				var response = {
					result: null,
					error: null,
					//id: req.body.id
				};
				if (err) {
					response.error = err.message || err;
				} else if (result === undefined) {
					response.result = true;
				} else {
					response.result = result;
				}
				res.send(response);
			// plain response
			} else {
				if (err) {
					res.send(err.message || err, null, 406);
				} else {
					res.send(result);
				}
			}
		});

	};

};
