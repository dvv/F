'use strict';

global._ = require('underscore');
var Path = require('path');
var Fs = require('fs');
var Ws = require('./ws');

//
// given session id, return the context
//
function getContext(sid) {
	// `self` will reference the client
	var self = this;
	//
	var caps = {
		user: {
			id: 'anonymous',
		},
		Foo: {
			get: function(next, index) {
				console.log('Foo.get', arguments);
				typeof next === 'function' && next(null, 'resulting');
			},
			Bar: {
				deep: function(next, index) {
					console.log('Foo.Bar.deep', arguments);
					typeof next === 'function' && next('erroring');
				}
			}
		},
		post: function(next, msg) {
			//console.log('POST');
			console.log('Post', self.invoke(null, 'ping', this.name + ' ['+_.keys(this.groups).join()+']' + ' says ' + msg), arguments);
			typeof next === 'function' && next(null, 'ack');
		},
		groups: {},
		join: function(next, group) {
			// `this` -- context
			// `self` -- socket
			this.groups[group] = {};
			// FIXME: weird effects... don't work...
			self.expose({groups: this.groups});
			typeof next === 'function' && next(null, 'ack');
		},
		leave: function(next, group) {
			_.each(Array.prototype.slice.call(arguments, 1), function(g) {
				delete this.groups[g];
			}, this);
			self.expose({groups: this.groups});
			typeof next === 'function' && next(null, 'ack');
		}
	};
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
	var ws = Ws(http, getContext);
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
	var wss = Ws(https, getContext);
	repl.context.wss = wss;
}
