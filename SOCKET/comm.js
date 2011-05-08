'use strict';

/*
 *
 * Copyright(c) 2011 Vladimir Dronnikov <dronnikov@gmail.com>
 * MIT Licensed
 *
 */

//
// depends on _ to normalize JS engines
// we recommend you to look at ender.js for client side
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
// if a property of `src` is set to null then remove corresponding
// `dst` property
// TODO: more elaborate version, may be even deep merge?
//
function extend123(dst, src) {
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
// safely get a deep property of `obj` descending
// using elements in `path`
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
// invoke deep method of `this` identified by `path` with
// optional parameters
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
// upgrade `this` socket to support functions calls over the wire
//
function createContext() {

	var socket = this;

	// constants
	var THIS_IS_FUNC = '~-=(){}=-~';
	var THIS_IS_FUNC_LEN = THIS_IS_FUNC.length;

	// create shared context
	function Context() {};
	// N.B. anything put in prototype won't be shared with remote end
	Context.prototype.extend = function(changes, reset) {
		socket.update(changes, reset, true);
	};
	// ???
	Context.prototype.validate = function(changes, reset) {
		return undefined;
	};
	// FIXME: debugging only
	Context.prototype.fns = function() {
		return socket.fns;
	};
	this.context = new Context();

	// exposed functions
	this.fns = {};
	// callbacks
	this.cbs = {};

	//
	// register a uniquely identified wrapper which calls a remote function
	//
	function registerRemoteFunction(fid) {
		var self = this;
		var fn = function(callback /*, args...*/) {
			var args = slice.call(arguments);
			// register callback
			if (_.isFunction(callback)) {
				// consume `callback` argument
				args.shift();
				// N.B. callbacks are deleted once they are fired.
				// unless a callback is fired, it holds the memory.
				// we should introduce expiration for callbacks
				var id = nonce();
				self.cbs[id] = callback;
			}
			// RPC
			var msg = {cmd: 'call', id: id, method: fid, params: args};
			self.send(msg);
		};
		// give function an ID to mark it as remote and
		// inhibit passing back to the remote end
		fn.id = fid;
		return fn;
	}

	//
	// replace functions in `msg` with THIS_IS_FUNC signatures
	// and assign unique ids to them
	//
	this.sendWithFunctions = function(msg) {
		var self = this;
		function replacer(k, v) {
			// N.B. reparsed functions (having ids) no pasaran
			if (_.isFunction(v) && !v.id) {
				// FIXME: should not prepend with `k` in production
				var fid = k + '_' + nonce();
				self.fns[fid] = v;
				v = THIS_IS_FUNC + fid;
			}
			return v;
		}
		var s = '~j~'+JSON.stringify(msg, replacer);
		this.send(s);
	}

	//
	// revive functions from THIS_IS_FUNC signatures
	// N.B. see the issue we've opened to ease reparsing at
	// https://github.com/LearnBoost/Socket.IO-node/issues/198#issuecomment-1116199
	//
	this.parseWithFunctions = function(msg) {
		var self = this;
		var result = JSON.parse(JSON.stringify(msg), function(k, v) {
			// register each function in the context
			// FIXME: shouldn't it be done in lazy way via getters?
			// FIXME: how portable is it in browsers then?
			if (v && typeof v === 'string' &&
				v.substring(0, THIS_IS_FUNC_LEN) === THIS_IS_FUNC) {
				// extract function id
				var fid = v.substring(THIS_IS_FUNC_LEN);
				// register the wrapper function
				v = registerRemoteFunction.call(self, fid);
			}
			return v;
		});
		return result;
	};

	//
	// send the reply to remote side
	//
	this.reply = function(id /*, args... */) {
		var args = slice.call(arguments, 1);
		if (!id) return;
		this.send({
			cmd: 'reply',
			id: id,
			params: args
		});
	};

	function extend(dst, src) {
		if (!src) return dst;
		for (var prop in src) if (has(src, prop)) {
			var v = src[prop];
			/*if (Object(v) === v) {
				if (!has(dst, prop)) {
					if (_.isArray(v)) {
						dst[prop] = [];
					} else if (typeof v === 'object') {
						dst[prop] = {};
					}
				}
				extend(dst[prop], v);
			} else*/ {
				if (v == null) {
					delete dst[prop];
				} else {
					dst[prop] = v;
				}
			}
		}
		return dst;
	}

	//
	// update the context
	//
	this.update = function(changes, reset, send) {
		var context = this.context;
		// validate the changes
		// FIXME: ease overriding of context.constructor.prototype.validate
		if (context.validate(changes, reset) !== undefined) {
			// FIXME: exceptions are evil in async environment
			return new Error('Changes not passed validation!');
		}
		// N.B. do not overwrite `context`, only mangle!
		if (reset) {
			this.fns = {};
			for (var i in context) delete context[i];
		} else {
			// FIXME: LEAK is possible if changes contain nulls
			// (which order to remove _functions_ from the context),
			// they must be purged from `this.fns` as well!
			// ...
		}
		extend(context, changes);
		// notify remote end that context has changed
		if (send) {
			this.sendWithFunctions({
				cmd: 'context',
				// FIXME: if we pass changes only, we should watch `this.fns`!
				params: reset ? [context, reset] : [changes]
			});
		}
	};

	//
	// attach message handler
	//
	this.on('message', function(message) {
		if (!message) return;
		console.log('MESSAGE', message);
		var fn;
		// remote side calls this side method
		if (message.cmd === 'call' && typeof message.method === 'string' &&
			(fn = this.fns[message.method])) {
			// the signature is function(callback[, arg1[, arg2[, ...]]])
			// N.B. we will reply to caller only if message.id is given
			var args = [_.bind(this.reply, this, message.id)];
			// optional arguments come from message.params
			if (message.params) {
				push.apply(args, message.params);
			}
			fn.apply(this.context, args);
		// uniquely identified reply from the remote side arrived
		// given reply id, lookup and call corresponding callback
		} else if (message.cmd === 'reply' && message.id &&
			(fn = this.cbs[message.id])) {
			// remove the callback to please GC
			delete this.cbs[message.id];
			// callback
			fn.apply(this.context, message.params);
		// remote context has changed
		// N.B. for security reasons, should be the only branch
		// which honors receiving functions
		} else if (message.cmd === 'context') {
			if (message.params) {
				message.params = this.parseWithFunctions(message.params);
			}
			this.update.apply(this, message.params);
			// fire 'ready' callback
			if (CLIENT_SIDE) {
				_.isFunction(this.options.ready) &&
					this.options.ready.call(this, message.params[1]);
			}
		}
	});

	// export the context
	return this.context;
}

//
// setup websocket communication
//

if (CLIENT_SIDE) {

	//
	// browser
	//

	// N.B. we export constructor, not singleton,
	// to allow having multiple instances

	window.Comm = function Comm(host, options) {
		// set default options
		if (!options) options = {};
		_.defaults(options, {
			port: location.port,
			secure: location.protocol === 'https:',
			rememberTransport: false
		});
		// create socket
		var socket = new io.Socket(host, options);
		// upgrade socket to context
		var ctx = createContext.call(socket);
		// make connection
		socket.connect();
		// return context
		return ctx;
	};

} else {

	//
	// server
	//

	var listen = function(server, options) {

		var io = require('socket.io');
		var ws = io.listen(server, options);

		ws.on('connection', function(socket) {
			// upgrade socket to context
			createContext.call(socket);
			// initialize the context
			_.isFunction(socket.listener.options.ready) &&
				socket.listener.options.ready.call(socket, true);
			// FIXME: this is _really_ too much
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
			ctx: {
				get: function() {
					return _.pluck(this.everyone, 'context');
				}
			},
			fc: {
				get: function() {
					return this.ctx[0];
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
