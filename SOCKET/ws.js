'use strict';

/*
 *
 * Copyright(c) 2011 Vladimir Dronnikov <dronnikov@gmail.com>
 * MIT Licensed
 *
 */

//
// depends on _ to normalize JS engines
// we recommend you to look at ender.js
//

(function(undefined) {

//
// in browser?
//
var CLIENT_SIDE = typeof window !== 'undefined';

//
// simple nonce generator
//
function nonce() {
	//return Math.random().toString().substring(2);
	return (Date.now() & 0x7fff).toString(36) + Math.floor(Math.random() * 1e9).toString(36) + Math.floor(Math.random() * 1e9).toString(36) + Math.floor(Math.random() * 1e9).toString(36);
}

//
// safely determine whether `prop` is an own property of `obj`
//
function has(obj, prop) {
	return Object.prototype.hasOwnProperty.call(obj, prop);
}

//
// safely get a deep property of `obj` descending using elements in `path`
//
function drill(obj, path) {
	if (_.isArray(path)) {
		for (var i = 0, l = path.length; i < l; i++) {
			part = path[i];
			obj = obj && has(obj, part) && obj[part] || null;
		}
		return obj;
	} else if (path == null) {
		return obj;
	} else {
		return obj && has(obj, path) && obj[path] || null;
	}
}

//
// invoke deep method of `this` identified by `path` with optional parameters
//
function caller(path) {
	var fn = drill(this, path);
	_.isFunction(fn) && fn.apply(null, Array.prototype.slice.call(arguments, 1));
}

//
// invoke `caller` for each element of `list` filtered with `filter`
//
function invoke(list, filter, path) {
	var args = Array.prototype.slice.call(arguments, 2);
	if (_.isFunction(filter)) list = _.filter(list, filter);
	_.each(list, function(item) {
		caller.apply(item.context, args);
	});
}

//
// constants
//
var SERVER_SID = nonce();

var THIS_IS_FUNC = '~-=(){}=-~';
var THIS_IS_FUNC_LEN = THIS_IS_FUNC.length;

//
// make server and client sides of socket.io more symmetric
// FIXME: remove debugging console.log()s
//
function normalize(options) {

	this.context = {};
	this.fns = {};
	this.cbs = {};

	//console.log('JOINED');

	//
	// `this` has been connected
	// N.B. introduced to normalize client/server
	//
	this.on('connect', function() {
		//console.log('CONNN');
	});

	//
	// `this` has been disconnected
	//
	this.on('disconnect', function() {
		//console.log('LEFT');
		// flush `this` capability
		this.context = {};
		this.fns = {};
		this.cbs = {};
	});

	//
	// message for `this` arrived
	//
	this.on('message', _.bind(handler, this));
}

//
// use custom stringifier with replacer to replace functions by THIS_IS_FUNC signature.
// also assign an unique id to any function in `msg`
//
function sendExt(msg) {
	var self = this;
	function replacer(k, v) {
		// N.B. reparsed functions no pasaran
		if (_.isFunction(v) && !v.id) {
			// FIXME: should not prepend with `k` in production
			var fid = k + '_' + nonce();
			//var fid = nonce();
			self.fns[fid] = v;
			v = THIS_IS_FUNC + fid;
			//v = {__call: fid};
		}
		return v;
	}
	var s = '~j~'+JSON.stringify(msg, replacer);
	//console.log('SENDEXT', s);
	self.send(s);
}

//
// register a uniquely identified wrapper to a remote function
//
function registerRemoteFunction(fid) {
	var self = this;
	var fn = function(callback/*, params...*/) {
		var args = Array.prototype.slice.call(arguments);
		// register callback
		if (_.isFunction(callback)) {
			// consume one argument
			args.shift();
			// N.B. callbacks are deleted once they are fired. unless a callback is fired, it holds the memory.
			// we should introduce expiration for callbacks
			var id = nonce();
			self.cbs[id] = callback;
		}
		// RPC
		var msg = {cmd: 'call', id: id, method: fid, params: args};
		sendExt.call(self, msg);
		//self.send(msg);
	};
	// mark function as remote, to inhibit passing to the remote end
	fn.id = fid;
	return fn;
}

//
// reparse message with custom reviver to honor functions stringified as THIS_IS_FUNC signatures
//
function reparse(msg) {
	var self = this;
	var reparsed = JSON.parse(JSON.stringify(msg), function(k, v) {
		// register each function in the context
		// FIXME: shouldn't it be done in lazy way via getters?
		// FIXME: how portable is it in browsers then?
		if (v && typeof v === 'string' && v.substring(0, THIS_IS_FUNC_LEN) === THIS_IS_FUNC) {
			// extract function id
			var fid = v.substring(THIS_IS_FUNC_LEN);
			// register the wrapper function
			v = registerRemoteFunction.call(self, fid);
		}
		return v;
	});
	return reparsed;
}

//
// send uniquely identified reply to the remote end
//
function respond(id) {
	console.log('RESPONDED', arguments);
	if (!id) return;
	this.send({
		cmd: 'reply',
		id: id,
		params: Array.prototype.slice.call(arguments, 1)
	});
}

function respondExt(id) {
	console.log('RESPONDEDEXT', arguments);
	if (!id) return;
	sendExt.call(this, {
		cmd: 'reply',
		id: id,
		params: Array.prototype.slice.call(arguments, 1)
	});
}

//
// websocket message handler
//
function handler(message) {
	var self = this;
	// sanity checks
	if (!message) return;
	console.log('MESSAGE', message.cmd, 'ID', message.id, 'METH', message.method, 'DATA', message.data, message);
	var fn;
	// remote side calls this side wrapper function
	//if (message.cmd === 'call' && typeof message.method === 'string' && (fn = drill(self.context, message.method))) {
	if (message.cmd === 'call' && typeof message.method === 'string' && (fn = self.fns[message.method])) {
		// the signature is fixed: function(callback[, arg1[, arg2[, ...]]])
		// N.B. we will reply to caller only if message.id is given
		var args = [_.bind(respondExt, self, message.id)];
		// optional arguments come from message.params
		if (message.params) Array.prototype.push.apply(args, message.params);
		fn.apply(self.context, args);
	// this side receives uniquely identified reply from the remote side
	// given id, lookup callback corresponding to the reply
	} else if (message.cmd === 'reply' && message.id && (fn = self.cbs[message.id])) {
		// remove the callback to please GC
		// FIXME: remove only anon callbacks? i.e. guard with if (!fn.name)
		//delete self.cbs[message.id];
		if (message.id !== 'context') delete self.cbs[message.id];
		fn.apply(self.context, message.params);
	}
}

//
// setup websocket communication
//

if (CLIENT_SIDE) {

	//
	// browser
	//

	// N.B. we export constructor, not singleton, to allow having multiple instances

	window.Comm = function Comm(host, options) {
		var self = this;
		// set default options
		if (!options) options = {};
		_.defaults(options, {
			port: location.port,
			secure: location.protocol === 'https:',
			rememberTransport: false
		});
		// create socket
		var comm = new io.Socket(host, options);
		normalize.call(comm, {});
		// N.B. we assign to comm.context, do not overwite, only mangle!
		comm.context = self;

		// FIXME: won't be needed in production
		//
		Object.defineProperties(self, {
			comm: {
				get: function() {
					return comm;
				}
			}
		});
		//

		// register 'context' callback
		comm.cbs.context = function(error, context) {
			// reparse to honor functions
			context = reparse.call(comm, context);
			// setup context
			for (var i in self) delete self[i];
			_.extend(self, context);
			//// fire 'ready' callback
			_.isFunction(options.ready) && options.ready.call(self);
			//// fire 'context' event
			//$(self).emit('context');
		};

		// make connection
		comm.connect();
	};
	Comm.prototype.take = function(sid) {
		// N.B. to authorize the client we reuse 'sid' cookie from the HTTP request
		// N.B. this allows for any kind of external authentication
		//var sid = document.cookie.match(new RegExp('(?:^|;) *' + 'sid' + '=([^;]*)')); sid = sid && sid[1] || '';
		var sid = '123';
		this.login(function() {
			console.log('LOGGED', this, arguments);
		}, sid);
	};
	Comm.prototype.set = function(changes) {
		if (changes) {
			_.extend(this, changes);
			//this.update(changes);
			respondExt.call(this.comm, 'context', null, this);
		}
	};

} else {

	//
	// server
	//

	var listen = function(server, getContext) {

		var io = require('socket.io');
		var ws = io.listen(server);

		// TODO: consider making a class?

		ws.on('connection', function(comm) {
			normalize.call(comm, {});
			// deal with shared context
			// N.B. this should be the only place which honors passing/receiving functions over the wire
			function register(context) {
				//console.log('REGISTER', context);
				// augment the context with unforgeable service methods
				Object.defineProperties(context, {
					login: {
						value: function(next, sid) {
							take(sid);
							_.isFunction(next) && next();
						},
						enumerable: true
					}
				});
				// reset functions
				comm.fns = {};
				// set the context
				comm.context = context;
				// fire 'context' callback
				respondExt.call(comm, 'context', null, context);
			}
			//
			// given session id, register the context
			// N.B. getContext can rely on DB to fetch the context!
			//
			function take(sid) {
				// getter is a function?
				if (_.isFunction(getContext)) {
					// getter's arity is > 1? --> assume it's async
					if (getContext.length > 1) {
						getContext.call(comm, sid, function(err, result) {
							// set this side context and send it to remote side
							register(result);
						});
					// else assume it's sync
					} else {
						register(getContext.call(comm, sid));
					}
				// context is already baked
				// N.B. in this case there's no means to pass self into context's closures
				} else {
					register(getContext);
				}
			}
			//
			take();
			// FIXME: this is too much
			// kinda safer broadcaster is needed
			comm.invoke = ws.invoke;

			// register 'context' callback
			comm.cbs.context = function(error, context) {
				// reparse to honor functions
				context = reparse.call(comm, context);
				// setup context
				_.extend(comm.context, context);
			};

		});

		// FIXME: do we need this?
		Object.defineProperties(ws, {
			everyone: {
				get: function() {
					return _.toArray(this.clients);
				}
			},
			fc: {
				get: function() {
					return this.everyone[0].context;
				}
			}
		});

		// remote function invocation helper
		// invoke(filterFunc, path-to-method, arg1, arg2, ...)
		ws.invoke = _.bind(invoke, ws, ws.clients);

		return ws;
	};

	module.exports = {
		listen: listen,
		reparse: reparse
	};

}

})();
