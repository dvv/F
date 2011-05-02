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
// invoke deep method identified by `path` for each element of `list` filtered with `filter`
//
function invoke(list, filter, path) {
	var args = Array.prototype.slice.call(arguments, 3);
	if (filter && filter.call) list = _.filter(list, filter);
	_.each(list, function(item) {
		if (item && item.context) {
			var fn = drill(item.context, path);
			if (fn && fn.apply) fn.apply(null, args);
		}
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

	this.context = this.fns = this.cbs = {};

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
		this.context = this.fns = this.cbs = {};
	});

	//
	// message for `this` arrived
	//
	this.on('message', _.bind(handler, this));

	//
	// `this` context is set
	//
	this.on('context', function() {
		//console.log('CONTEXT', this.context);
	});

	//
	//
	//
	this.expose = _.bind(registerContext, this);

	return this;
}

//
// empty function
//
function nop() {
	console.log('CONTINUE', arguments);
}

//
// send uniquely identified reply to the remote end
//
function respond(id, error, result) {
	console.log('RESPONDED', arguments);
	if (!id) return;
	this.send({
		cmd: 'reply',
		id: id,
		error: error || null,
		result: result
	});
}

//
// share the context between both sides.
// expose any encountered function as a uniquely identified wrapper
//
function registerContext(context, flush) {
	var self = this;
	// reset exposed functions
	self.fns = {};
	// reset or extend the context
	if (flush) {
		self.context = context || {};
	} else {
		// TODO: deep merge?
		_.extend(self.context, context || {});
	}
	// use custom stringifier with replacer to replace functions by THIS_IS_FUNC signature.
	// also assign an unique id to any function in the context.

	var p = [];
	var o = [];

	function replacer(k, v) {
		var i = o.indexOf(this);
		if (k) {
			if (i < 0) {
				//console.log('PUSHING 1', k, v);
				o.push(v);
				p.push(k);
			} else {
				k = p[i] + '.' + k;
				i = o.indexOf(v);
				if (i < 0) {
					//console.log('PUSHING 2', k, v);
					o.push(v);
					p.push(k);
				}
			}
		}
		if (typeof v === 'function') {
			var fid = k.substring(5); // strip 'data.'
			self.fns[fid] = v;
			v = THIS_IS_FUNC + fid;
			//console.log('REPL!', k, p, o);
		}
		return v;
	}
	/*function replacer(k, v) {
		if (_.isFunction(v)) {
			var fid = nonce();
			self.fns[fid] = v;
			if (!self.all) self.all = {};
			self.all[fid] = k;
			v = THIS_IS_FUNC + fid;
		}
		return v;
	}*/
	// send the context to remote end
	self.send('~j~'+JSON.stringify({
		cmd: 'set context',
		data: self.context
	}, replacer));
}

//
// register a uniquely identified wrapper to a remote function
//
function registerFunction(fid) {
	var self = this;
	return function(callback/*, params...*/) {
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
		self.send(msg);
	};
}

//
// websocket message handler
//
function handler(message) {
	var self = this;
	console.log('MESSAGE', message);
	// sanity checks
	if (!message) return;
	var fn;
	// remote side calls this side wrapper function
	if (message.cmd === 'call' && typeof message.method === 'string' && (fn = self.fns[message.method])) {
		// the signature is fixed: function(callback[, arg1[, arg2[, ...]]])
		// N.B. we will reply to caller only if message.id is given
		//var args = [message.id ? _.bind(respond, self, message.id) : nop];
		var args = [_.bind(respond, self, message.id)];
		// optional arguments come from message.params
		if (message.params) Array.prototype.push.apply(args, message.params);
		console.log('CALL', message.method, args);
		fn.apply(self.context, args);
	// this side receives uniquely identified reply from the remote side
	} else if (message.cmd === 'reply' && message.id) {
		// given id, lookup callback corresponding to the reply
		if (fn = self.cbs[message.id]) {
			// remove the callback to please GC
			// FIXME: remove only anon callbacks? i.e. guard with if (!fn.name)
			delete self.cbs[message.id];
			// call the callback passing error and result
			// FIXME: shouldn't it be the single hash {error: ..., result: ...}?
			fn.call(null, message.error, message.result);
		}
	// remote side requests the context from this side
	} else if (message.cmd === 'get context' && self.getContext) {
		// getter is a function?
		if (_.isFunction(self.getContext)) {
			// if getter's arity is >1, assume it's async
			if (self.getContext.length > 1) {
				self.getContext(message.sid, function(err, result) {
					// set this side context and send it to remote side
					registerContext.call(self, result, true);
				});
			// else assume it's sync
			} else {
				registerContext.call(self, self.getContext(message.sid), true);
			}
		// context is already baked
		// N.B. in this case there's no means to pass self into context's closures
		} else {
			registerContext.call(self, self.getContext, true);
		}
	// this side receives the requested context from the remote side
	} else if (message.cmd === 'set context') {
		// reparse message data with custom reviver to honor functions stringified as THIS_IS_FUNC signatures
		try {
			self.context = JSON.parse(JSON.stringify(message.data), function(k, v) {
				// register each function in the context
				// FIXME: shouldn't it be done in lazy way via getters?
				// FIXME: how portable is it in browsers then?
				if (v && typeof v === 'string' && v.substring(0, THIS_IS_FUNC_LEN) === THIS_IS_FUNC) {
					// extract function id
					var fid = v.substring(THIS_IS_FUNC_LEN);
					// register the wrapper function
					v = registerFunction.call(self, fid);
				}
				return v;
			});
		// N.B. JSON.parse() can throw
		} catch(err) {
			// something wrong? just set empty context
			self.context = {};
		}
		// signal 'context is ready'
		// N.B. arguments go in array
		self.emit('context', [self.context]);
	}
}

//
// setup websocket communication
//

if (typeof window !== 'undefined') {

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
			rememberTransport: false,
			sessionCookieName: 'sid'
		});
		// create socket
		var comm = this.comm = new io.Socket(host, options);
		// TODO: make a constructor
		normalize.call(comm, {});
		// plugin the context once it's received
		comm.on('context', function(context) {
			self.context = context;
			_.isFunction(self.contextChanged) && self.contextChanged();
		});
		// exposed interface
		//this.on = _.bind(comm.on, comm);
		this.expose = _.bind(comm.expose, comm);
		// call this to obtain the shared context for this client identified by `sid`.
		this.giveMeMyContext = function(sid) {
			comm.send({cmd: 'get context', sid: sid});
		}
		// request context once connected, unless explicitly disabled
		if (options.sessionCookieName !== false) {
			comm.on('connect', function() {
				// request context from remote end
				// N.B. to authorize the client we reuse 'sid' cookie from the HTTP request
				// N.B. this allows for any kind of external authentication
				var sid = document.cookie.match(new RegExp('(?:^|;) *' + options.sessionCookieName + '=([^;]*)')); sid = sid && sid[1] || '';
				self.giveMeMyContext(sid);
			});
		}
		// make connection
		comm.connect();
	}

} else {

	//
	// server
	//

	module.exports = function(server, getContext) {

		var io = require('socket.io');
		var ws = io.listen(server);

		// TODO: consider making a class?

		ws.on('connection', function(comm) {
			normalize.call(comm, {});
			comm.getContext = getContext;
			// FIXME: this is too much, in fact
			// FIXME: a kind of safe broadcaster is needed
			comm.invoke = _.bind(invoke, this, this.clients);
		});

		// FIXME: do we need this?
		Object.defineProperties(ws, {
			everyone: {
				get: function() {
					return _.toArray(this.clients);
				}
			}
		});

		// simplest client filter: by context.group
		ws.group = function(name) {
			return _.filter(this.clients, function(client, cid) {
				return client.context.group === name;
			});
		};

		// remote function invocation helper
		// invoke(filterFunc, path-to-method, arg1, arg2, ...)
		ws.invoke = _.bind(invoke, ws, ws.clients);

		return ws;
	};

}

})();
