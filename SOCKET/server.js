'use strict';

global._ = require('underscore');
var Path = require('path');
var Fs = require('fs');
var Ws = require('./comm');

//
// given session id, return the context
//
function getContext(sid) {
	// `self` will reference the client
	var self = this;

	// N.B. in functions:
	// `this` -- context
	// `self` -- socket
	// FIXME: ideally, we should not be needing `self` socket

	// anonymous user capability
	var caps = {
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
				_.isFunction(next) && next(null, 'resulting');
			},
			Bar: {
				deep: function(next, index) {
					console.log('Foo.Bar.deep', arguments);
					_.isFunction(next) && next('erroring');
				}
			}
		},
		post: function(next, msg) {
			var groups = _.keys(this.groups || {});
			var r = self.invoke(function(client) {
				//console.log('POSTCLIENT', client.context);
				if (!client.context.groups) return false;
				var g = _.keys(client.context.groups);
				return _.intersect(groups, g).length;
			}, 'ping', this.name + ' ['+groups.join()+']' + ' says ' + msg);
			//console.log('Post', r, arguments);
			_.isFunction(next) && next(null, 'ack');
		},
		groups: {},
		join: function(next, group) {
			this.groups[group] = {};
			_.isFunction(next) && next(null, this.groups);
		},
		leave: function(next, group) {
			_.each(Array.prototype.slice.call(arguments, 1), function(g) {
				delete this.groups[g];
			}, this);
			_.isFunction(next) && next(null, this.groups);
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
	var ws = Ws.listen(http, getContext);
	repl.context.ws = ws;
}

//
// reuse the middleware for HTTPS server
//
if (true) {
	var https = require('https').createServer({
		key: require('fs').readFileSync('key.pem', 'utf8'),
		cert: require('fs').readFileSync('cert.pem', 'utf8'),
		//ca: ...
	});
	https.on('request', middleware);
	https.listen(4000);
	// websocket
	var wss = Ws.listen(https, getContext);
	repl.context.wss = wss;
}
