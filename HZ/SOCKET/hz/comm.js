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

if (!this._ && this.ender) this._ = this.ender;

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
// safely get a deep property of `obj` descending
// using elements in `path`
//
function drill(obj, path) {
	var part;
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
	// filter the list if the filtering function is given
	if (_.isFunction(filter)) list = _.filter(list, filter);
	// return the filtered list unless arguments to make call are given
	if (!args.length) return list;
	_.each(list, function(item) {
		//caller.apply(item.context, args);
		item.context.rpc.apply(item.context, args);
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
	// extend shared context
	Context.prototype.extend = function(changes, reset) {
		socket.update(changes, reset, true);
	};
	// called at client-side when server-side sets the context
	Context.prototype.ready = this.options.ready;
	// called before change occurs in to property
	// signature is function(prop, oldvalue, newvalue)
	// return something other than undefined to inhibit assigning to
	// the `prop`
	Context.prototype.change = this.options.change;
	// called before updating the shared context.
	// return value other than undefined means validation is rejected
	Context.prototype.validate = function(changes, reset) {
		if (_.isFunction(changes)) {
			this.constructor.prototype.validate = changes;
			return;
		}
		return undefined;
	};
	// invoke a remote function by `path`
	Context.prototype.rpc = function(path, callback /*, args...*/) {
		var args = slice.call(arguments, 1);
		// register callback, if any
		if (_.isFunction(callback)) {
			// consume `callback` argument
			args.shift();
			// N.B. callbacks are deleted once they are fired.
			// unless a callback is fired, it holds the memory.
			// we should introduce expiration for callbacks
			var id = nonce();
			socket.cbs[id] = callback;
		}
		// RPC
		var msg = {cmd: 'call', id: id, method: path, params: args};
		socket.send(msg);
	};
	this.context = new Context();

	// callbacks
	this.cbs = {};

	//
	// replace functions in `msg` with THIS_IS_FUNC signatures
	//
	this.sendWithFunctions = function(msg) {
		var self = this;
		function replacer(k, v) {
			if (_.isFunction(v)) {
				v = THIS_IS_FUNC;
			}
			return v;
		}
		var s = '~j~'+JSON.stringify(msg, replacer);
		this.send(s);
	}

	//
	// send the reply to remote side
	//
	function reply(id /*, args... */) {
		var args = slice.call(arguments, 1);
		if (!id) return;
		this.send({
			cmd: 'reply',
			id: id,
			params: args
		});
	};

	//
	// shallow extend the `dst` with properties of `src`
	// if a property of `src` is set to null then remove corresponding
	// `dst` property
	// TODO: more elaborate version, may be even deep merge?
	//
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
				var d = dst[prop];
				// report changes in properties
				if (_.isFunction(socket.context.change) &&
					socket.context.change(prop, v, d) !== undefined)
					continue;
				// assign new value
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
		var errors = context.validate(changes, reset);
		if (errors !== undefined) {
			// N.B.: exceptions are evil in async environment
			return new Error('Changes not passed validation: ' + errors);
		}
		// N.B. do not overwrite `context`, only mangle! That's why
		// this way of purging old context
		if (reset) {
			for (var i in context) delete context[i];
		}
		extend(context, changes);
		// notify remote end that context has changed
		if (send ) {
			this.sendWithFunctions({
				cmd: 'context',
				// N.B. no changes means to force sending the whole context
				params: reset || !changes ? [context, true] : [changes]
			});
		}
	};

	//
	// attach message handler
	//
	this.on('message', function(message) {
		if (!message) return;
		//console.log('MESSAGE', message);
		var fn;
		// remote side calls this side method
		if (message.cmd === 'call' &&
			(fn = drill(this.context, message.method))) {
			// the signature is function(callback[, arg1[, arg2[, ...]]])
			// N.B. we will reply to caller only if message.id is given
			var args = [_.bind(reply, this, message.id)];
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
		} else if (message.cmd === 'context') {
			this.update.apply(this, message.params);
			// fire 'ready' callback
			if (CLIENT_SIDE && _.isFunction(this.context.ready)) {
				this.context.ready.call(this, message.params[1]);
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

	// ender.js shim
  (typeof module !== 'undefined') && module.exports && (module.exports = Comm);

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
		//
		//
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
		//
		//
		//

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
