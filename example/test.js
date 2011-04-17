'use strict';

/*
 *
 * Copyright(c) 2011 Vladimir Dronnikov <dronnikov@gmail.com>
 * MIT Licensed
 *
*/

////////////////////////////////////////////////////////////

var config = require('./config');
var F = require('../');

////////////////////////////////////////////////////////////

//
// setup application
//
Next({}, function(err, result, next) {

	//
	// get the data model
	//
	config.model = __dirname + '/model';
	F.model(config, next);

}, function(err, model, next) {

	if (err) console.log('S1', err.stack);
	//console.log('MODEL', model);

	//
	// augment security options to handle authentication
	//
	// signup function
	if (config.security.selfSignup) {
		config.security.signup = model.signup;
	}
	// get capability
	config.security.getCapability = model.getCapability;
	// native authentication
	config.security.checkCredentials = model.checkCredentials;
	// custom routes


// FIXME: beautify
var fallbackContext = function(context) {
	var schema = {};
	_.each(context, function(obj, name) {
		var x = _.clone(obj);
		_.each(_.functions(x), function(f) { x[f] = true; });
		schema[name] = x.schema; delete x.schema;
		context[name] = x;
	});
	return {
		// functions
		context: context,
		// db schema
		schema: schema,
		// sanitized user profile
		user: {
			id: context.user.id,
			name: context.user.name,
			email: context.user.email,
			roles: context.user.roles
		}
	};
};

	config.routes = [
		['GET', '/', function(req, res, next) {
			//console.log('HERE', req.context);
			res.render('index', fallbackContext(req.context));
		}],
	];
	//
	// setup middleware
	//
	var middleware = F.stack.vanilla(__dirname, config);
	next(null, middleware);

}, function(err, middleware, next) {

	if (err) console.log('S2', err.stack);
	//console.log('MIDDLE', middleware);

	//
	// setup now.js
	//
	var nowjs = F.now(config.security.getCapability, config);
	//
	/*extend(nowjs.client, {
		act: function(s) {
			this.now.flash(s);
		}
	});*/

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
		_.extend(now_http.now, nowjs.client);
	}
	_.extend(now_http.now, {
		act: function(s) {
			this.now.flash(s);
		}
	});

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
		_.extend(now_https.now, nowjs.client);
	}

});
