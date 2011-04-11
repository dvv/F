'use strict';

/*
 *
 * Copyright(c) 2011 Vladimir Dronnikov <dronnikov@gmail.com>
 * MIT Licensed
 *
*/

////////////////////////////////////////////////////////////

var F = require('../');

////////////////////////////////////////////////////////////

//
// setup application
//
var config = require('./config');
Next({}, function(err, result, next) {

	//
	// get the data model
	//
	require('./model')(config, next);

}, function(err, model, next) {

	if (err) console.log('S1', err.stack);
	//console.log('MODEL', model);

	//
	// setup middleware
	//
	// augment security options to handle authentication
	deepCopy({
		// signup function
		signup: config.security.selfSignup ? model.signup : undefined,
		// get capability
		getCapability: this.getCapability = model.getCapability,
		// native authentication
		checkCredentials: model.checkCredentials
	}, config.security);
	// custom routes
	config.routes = [
		['GET', '/', function(req, res, next) {
			//console.log('HERE', req.context);
			res.render('index', req.context);
		}],
	];
	// generate middleware
	var middleware = F.vanilla(__dirname, config);
	next(null, middleware);

}, function(err, middleware, next) {

	if (err) console.log('S2', err.stack);
	//console.log('MIDDLE', middleware);

	//
	// setup now.js
	//
	var nowjs = require('../lib/now')(this.getCapability, config);

	//
	// run HTTP server
	//
	if (config.server.port) {
		var http = require('http').createServer();
		http.on('request', middleware);
		http.listen(config.server.port);
		var now_http = nowjs.initialize(http);
		now_http.now.demo = function(callback) {
			console.log('DEMOHTTP');
		}
		now_http.connected(function() {
			//console.log("Joined: " + this.now);
		});
		now_http.disconnected(function() {
			//console.log("Left: " + this.now);
		});
		extend(now_http.now, nowjs.client);
	}

	//
	// reuse the middleware for HTTPS server
	//
	if (config.server.ssl) {
		var https = require('https').createServer({
			key: require('fs').readFileSync(config.server.ssl.key, 'utf8'),
			cert: require('fs').readFileSync(config.server.ssl.cert, 'utf8'),
			//ca: ...
		});
		https.on('request', middleware);
		https.listen(config.server.ssl.port);
		var now_https = nowjs.initialize(https);
		now_https.now.demo = function(callback) {
			console.log('DEMOHTTPS');
		}
		extend(now_https.now, nowjs.client);
	}

});
