'use strict';

global._ = require('underscore');
var Path = require('path');
var Fs = require('fs');
var Ws = require('./wscomm');

//
// given session id, return the context
// N.B. it can be reused in vanilla middleware
//
function getContext(sid) {

	// memorize the socket
	var socket = this;

	// N.B. in functions:
	// `this` === context

	// anonymous user capability
	var caps = {
		signin: function(next, sid) {
			var self = this;
			function register(context) {
				// reset the context
				self.extend(context, true);
				_.isFunction(next) && next();
			}
			// context getter is a function?
			if (_.isFunction(getContext)) {
				// getter's arity is > 1? --> assume it's node-style async
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
		},
		user: {
		}
	};

	// authenticated user capability
	if (sid) _.extend(caps, {
		user: {
			id: sid
		},
		Foo: {
			get: function(next, index) {
				console.log('Foo.get', arguments);
				_.isFunction(next) && next({result: 'resulting'});
			},
			Bar: {
				deep: function(next, index) {
					console.log('Foo.Bar.deep', arguments);
					_.isFunction(next) && next({error: 'erroring'});
				}
			}
		},
		post: function(next, msg) {
			var groups = _.keys(this.groups || {});
			var r = socket.invoke(function(client) {
				//console.log('POSTCLIENT', client.context);
				if (!client.context.groups) return false;
				var g = _.keys(client.context.groups);
				return _.intersect(groups, g).length;
			}, 'ping', this.name + ' ['+groups.join()+']' + ' says ' + msg);
			//console.log('Post', r, arguments);
			_.isFunction(next) && next();
		},
		groups: {},
		join: function(next, group) {
			var groups = this.groups;
			groups[group] = {};
			this.extend({groups: groups});
			_.isFunction(next) && next();
		},
		leave: function(next, group) {
			var groups = this.groups;
			_.each(Array.prototype.slice.call(arguments, 1), function(g) {
				delete groups[g];
			}, this);
			this.extend({groups: groups});
			_.isFunction(next) && next();
		}
	});

	return caps;
}

//
// setup middleware
//
function middleware(req, res) {
	req.url = Path.normalize(req.url);
	if (req.url === '/') req.url = '/index.html';
	Fs.readFile(__dirname + req.url, 'utf8', function(err, text) {
		if (err) {
			res.writeHead(404);
			res.end();
		} else {
			var mime = req.url.slice(-3) === '.js' ? 'text/javascript' : 'text/html';
			res.writeHead(200, {'content-type': mime});
			res.end(text);
		}
	});
}

// REPL for tests
var repl = require('repl').start('node> ');
process.stdin.on('close', process.exit);

//
// run HTTP server
//
if (true) {
	var http = require('http').createServer();
	http.on('request', middleware);
	http.listen(3000);
	// websocket
	var ws = Ws.listen(http, {
		ready: function() {
			// `this` is the socket; here is the only place to memo it
			// setup initial context
			this.context.extend(getContext.call(this));
		}
	});
	repl.context.ws = ws;
}

//
// reuse the middleware and context for HTTPS server
//
if (true) {
	var https = require('https').createServer({
		key: require('fs').readFileSync('key.pem', 'utf8'),
		cert: require('fs').readFileSync('cert.pem', 'utf8'),
		//ca: ...
	});
	https.on('request', middleware);
	https.listen(4000);
	// secure websocket
	var wss = Ws.listen(https, {
		ready: function() {
			// `this` is the socket; here is the only place to memo it
			// setup initial context
			this.context.extend(getContext.call(this));
		}
	});
	repl.context.wss = wss;
}
