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
// well-known useful functions
//
var slice = Array.prototype.slice;
var push = Array.prototype.push;

//
// simple nonce generator
//
function rnd() {
	return Math.floor(Math.random() * 1e9).toString(36);
}
function nonce() {
	return (Date.now() & 0x7fff).toString(36) + rnd() + rnd() + rnd();
}

//
// safely determine whether `prop` is an own property of `obj`
//
function has(obj, prop) {
	return Object.prototype.hasOwnProperty.call(obj, prop);
}

//
// shallow extend the `dst` with properties of `src`
// if a property of `src` is set to null then remove corresponding `dst` property
// TODO: more elaborate version, may be even deep merge?
//
function extend(dst, src) {
	if (!src) return dst;
	for (var prop in src) if (has(src, prop)) {
		if (src[prop] === null) {
			delete dst[prop];
		} else {
			dst[prop] = src[prop];
		}
	}
	return dst;
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
	_.isFunction(fn) && fn.apply(this, slice.call(arguments, 1));
}

//
// invoke `caller` for each element of `list` filtered with `filter`
//
function invoke(list, filter, path) {
	var args = slice.call(arguments, 2);
	if (_.isFunction(filter)) list = _.filter(list, filter);
	_.each(list, function(item) {
		caller.apply(item.context, args);
	});
}

//
// normalize `this` socket to support passing contexts with functions over the wire
//
function honorFunctions(context) {

	var socket = this;

	// constants
	var THIS_IS_FUNC = '~-=(){}=-~';
	var THIS_IS_FUNC_LEN = THIS_IS_FUNC.length;

	// shared context
	this.context = context || {};
	// exposed functions
	this.fns = {};
	// callbacks
	this.cbs = {};

	//
	// register a uniquely identified wrapper to a remote function
	//
	function registerRemoteFunction(fid) {
		var self = this;
		var fn = function(callback /*, params...*/) {
			var args = slice.call(arguments);
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
			self.sendWithFunctions(msg);
		};
		// mark function as remote, to inhibit passing to the remote end
		fn.id = fid;
		return fn;
	}

	//
	// replace functions with THIS_IS_FUNC signatures
	// and assign unique ids to functions in `msg`
	//
	this.sendWithFunctions = function(msg) {
		var self = this;
		function replacer(k, v) {
			// N.B. reparsed functions (having ids) no pasaran
			// N.B. `extend` is not transmitted also
			if (_.isFunction(v) && !v.id && k !== 'extend') {
				// FIXME: should not prepend with `k` in production
				var fid = k + '_' + nonce();
				self.fns[fid] = v;
				v = THIS_IS_FUNC + fid;
			}
			return v;
		}
		var s = '~j~'+JSON.stringify(msg, replacer);
		console.log('SEND', s);
		this.send(s);
	}

	//
	// revive functions from THIS_IS_FUNC signatures
	//
	this.parseWithFunctions = function(msg) {
		var self = this;
		var result = JSON.parse(JSON.stringify(msg), function(k, v) {
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
		//console.log('REPARSED', msg, result);
		return result;
	};

	//
	// send the reply to remote side
	//
	this.reply = function(id /*, args */) {
		console.log('SENDREPLY', arguments);
		var args = slice.call(arguments, 1);
		if (!id) return;
		this.sendWithFunctions({
			cmd: 'reply',
			id: id,
			params: args
		});
	};

	//
	// attach message handler
	//
	this.on('message', function(message) {
		if (!message) return;
		console.log('MESSAGE', message);
		var fn;
		// remote side calls this side method
		if (message.cmd === 'call' && typeof message.method === 'string' && (fn = this.fns[message.method])) {
			// the signature is fixed: function(callback[, arg1[, arg2[, ...]]])
			// N.B. we will reply to caller only if message.id is given
			var args = [_.bind(this.reply, this, message.id)];
			// optional arguments come from message.params
			if (message.params) {
				message.params = this.parseWithFunctions(message.params);
				push.apply(args, message.params);
			}
			fn.apply(this.context, args);
		// uniquely identified reply from the remote side arrived
		// given reply id, lookup and call corresponding callback
		} else if (message.cmd === 'reply' && message.id && (fn = this.cbs[message.id])) {
			// remove the callback to please GC
			//delete this.cbs[message.id];
			if (message.id !== 'context') delete this.cbs[message.id];
			// callback
			message.params = this.parseWithFunctions(message.params);
			fn.apply(this.context, message.params);
		}
	});

	//
	// define 'context' callback
	// FIXME: consider move out of `this.cbs` and simplify `this.cbs` flush logic
	//
	this.cbs.context = function(context, reset) {
		// update the context
		// N.B. do not overwrite socket.context, only mangle!
		if (reset) {
			socket.fns = {};
			for (var i in socket.context) if (i !== 'extend') delete socket.context[i];
		}
		extend(socket.context, context);
		// notify remote end that context has changed
		//socket.reply('context', context, reset);
		// fire 'ready' callback
		if (CLIENT_SIDE) {
			_.isFunction(socket.options.ready) && socket.options.ready.call(this, reset);
		}
	};

	//
	// update shared context
	//
	this.context.extend = function(changes) {
		extend(this, changes);
		// notify remote end that context has changed
		socket.reply('context', this);
	};

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
		var socket = new io.Socket(host, options);
		// upgrade socket to honor functions
		honorFunctions.call(socket, this);
		// make connection
		socket.connect();
	};

} else {

	//
	// server
	//

	var listen = function(server, getContext) {

		var io = require('socket.io');
		var ws = io.listen(server);

		ws.on('connection', function(socket) {
			// upgrade socket to honor functions
			honorFunctions.call(socket);
			// register the shared context locally and pass it to remote side
			function register(context) {
				//console.log('REGISTER', context);
				// augment the context with unforgeable service methods
				Object.defineProperties(context, {
					signin: {
						value: function(next, sid) {
							init(sid);
							_.isFunction(next) && next();
						},
						enumerable: true
					}
				});
				// reset the context
				socket.cbs.context(context, true);
				socket.reply('context', context, true);
			}
			//
			// given session id, initialize the context
			// N.B. getContext can rely on DB to fetch the context!
			//
			function init(sid) {
				// getter is a function?
				if (_.isFunction(getContext)) {
					// getter's arity is > 1? --> assume it's async
					if (getContext.length > 1) {
						getContext.call(socket, sid, function(err, result) {
							register(result);
						});
					// else assume it's sync
					} else {
						register(getContext.call(socket, sid));
					}
				// context is already baked
				// N.B. in this case there's no means to pass the socket into context's closures
				} else {
					register(getContext || {});
				}
			}
			//
			init();
			// FIXME: this is too much
			// kinda safer broadcaster is needed
			socket.invoke = ws.invoke;
		});

		// FIXME: purely debugging helpers
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
			},
			ctx: {
				get: function() {
					return _.pluck(this.everyone, 'context');
				}
			}
		});

		// remote function invocation helper
		// invoke(filterFunc, path-to-method, arg1, arg2, ...)
		ws.invoke = _.bind(invoke, ws, ws.clients);

		return ws;
	};

	module.exports = {
		listen: listen
	};

}

})();
