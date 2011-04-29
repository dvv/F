/*
var server = require('http').createServer(function(req, res) {
	res.writeHead(200);
	res.end('Bienvenuto!');
});
server.listen(3000);
*/

var F = require('../');
var config = require('./config');
//config.model = __dirname + '/model';
//var model = F.model.sync(F, config);
//console.log(model);


//
// given uid, return its capability
//
config.security.getCapability = function getCapability(uid, next) {
	next(null, {
		user: {
			id: uid,
		},
		Foo: {
			get: function() {
				console.log('GET FOO', arguments);
			}
		}
	});
};

//
// anonymous is welcome
//
config.security.checkCredentials = function checkCredentials(uid, pass, next) {
	next(null, uid);
};

//
// routes
//
config.routes = [
	['GET', '/', function(req, res, next) {
		//console.log('HERE', req.context);
		res.render('index', req.context);
	}],
];

//
// setup middleware
//
var middleware = F.stack.vanilla(__dirname, config);

//
// run HTTP server
//
if (config.server.port) {
	var http = require('http').createServer();
	http.on('request', middleware);
	http.listen(config.server.port);
	//var now_http = nowjs.initialize(http);
	/*now_http.now.demo = function(callback) {
		console.log('DEMOHTTP');
	}
	now_http.connected(function() {
		//console.log("Joined: " + this.now);
	});
	now_http.disconnected(function() {
		//console.log("Left: " + this.now);
	});
	_.extend(now_http.now, nowjs.client);*/
}
