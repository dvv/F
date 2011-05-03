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

function sendExt(msg) {
	var self = this;
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
		if (typeof v === 'function' && !v.id) {
			var fid = k.substring(7); // strip 'result.'
			self.fns[fid] = v;
			v = THIS_IS_FUNC + fid;
			//console.log('REPL!', k, p, o);
		}
		return v;
	}
	/*function replacer(k, v) {
		if (_.isFunction(v) && !v.id) {
			var fid = nonce();
			self.fns[fid] = v;
			if (!self.all) self.all = {};
			self.all[fid] = k;
			v = THIS_IS_FUNC + fid;
		}
		return v;
	}*/
	self.send('~j~'+JSON.stringify(msg, replacer));
}


//
// send uniquely identified reply to the remote end
//
function respond(id, error, result) {
	console.log('RESPONDED', arguments);
	if (!id) return;
	sendExt.call(this, {
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
function registerContext(changes, flush) {
	if (!changes) changes = {};
	var self = this;
	// reset exposed functions
	self.fns = {};
	// reset or extend the context
	if (flush) {
		self.context = changes;
	} else {
		// TODO: deep merge?
		_.extend(self.context, changes);
	}
	respond.call(self, 'bootstrap', null, self.context);
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
	};
	// mark function as remote, to inhibit passing to the remote end
	fn.id = fid;
	return fn;
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
	if (message.cmd === 'call' && typeof message.method === 'string' && (fn = self.fns[message.method])) {
		// the signature is fixed: function(callback[, arg1[, arg2[, ...]]])
		// N.B. we will reply to caller only if message.id is given
		//var args = [message.id ? _.bind(respond, self, message.id) : nop];
		var args = [_.bind(respond, self, message.id)];
		// optional arguments come from message.params
		if (message.params) Array.prototype.push.apply(args, message.params);
		fn.apply(self.context, args);
	// this side receives uniquely identified reply from the remote side
	} else if (message.cmd === 'reply' && message.id) {
		// given id, lookup callback corresponding to the reply
		if (fn = self.cbs[message.id]) {
			// remove the callback to please GC
			// FIXME: remove only anon callbacks? i.e. guard with if (!fn.name)
			delete self.cbs[message.id];
			// reparse message data with custom reviver to honor functions stringified as THIS_IS_FUNC signatures
			try {
				var reparsed = JSON.parse(JSON.stringify(message.result), function(k, v) {
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
				// apply received changes to the context
				message.result = reparsed;
			// N.B. JSON.parse() can throw
			} catch(err) {
				// something wrong? don't touch anything
			}
			// call the callback passing error and result
			// FIXME: shouldn't it be the single hash {error: ..., result: ...}?
			fn.call(null, message.error, message.result);
		}
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
			rememberTransport: false,
			sessionCookieName: 'sid'
		});
		// create socket
		var comm = this.comm = new io.Socket(host, options);
		// TODO: make a constructor
		normalize.call(comm, {});
		comm.cbs.bootstrap = function(error, result) {
			//console.log('BOOT', arguments);
			self.context = result;
			_.isFunction(options.bootstrap) && options.bootstrap.call(self.context);
		};

		this.publish = function(next, name, fn) {
			console.log('PUBLISH', name, fn);
			if (this.hasOwnProperty(name) && !this[name].id) {
				typeof next === 'function' && next('forbidden');
			} else {
				typeof next === 'function' && next(null, [name, fn]);
			}
		};

		// request context once connected, unless explicitly disabled
		// N.B. to request the context again one should reconnect
		if (options.sessionCookieName !== false) {
			comm.on('connect', function() {
				// request context from remote end
				//self.getContext(options.onConnect, sid)
				//this.send({cmd: 'get context', sid: sid});
				/*var cid = nonce();
				this.cbs[cid] = options.onConnect;
				this.send({cmd: 'call', id: cid, method: 'get', params: [sid]});*/
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
			var self = this;
			//
			normalize.call(comm, {});
			// session id
			// N.B. to authorize the client we reuse 'sid' cookie from the HTTP request
			// N.B. this allows for any kind of external authentication
			var sid = comm.request.headers.cookie && comm.request.headers.cookie.match(new RegExp('(?:^|;) *' + 'sid' + '=([^;]*)')); sid = sid && sid[1] || '';
			// request the context
			// getter is a function?
			if (_.isFunction(getContext)) {
				// if getter's arity is >1, assume it's async
				if (getContext.length > 1) {
					getContext.call(comm, sid, function(err, result) {
						// set this side context and send it to remote side
						registerContext.call(comm, result, true);
					});
				// else assume it's sync
				} else {
					registerContext.call(comm, getContext.call(comm, sid), true);
				}
			// context is already baked
			// N.B. in this case there's no means to pass self into context's closures
			} else {
				registerContext.call(comm, getContext, true);
			}
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
