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
			res.render('index', req.context);//fallbackContext(req.context));
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
	// setup wscomm
	//
	var WSComm = F.wscomm(config.security.getCapability, config);

	//
	// run HTTP server
	//
	if (config.server.port) {
		var http = require('http').createServer();
		http.on('request', middleware);
		http.listen(config.server.port);
		// websocket
		var ws = WSComm.listen(http, {
			ready: function() {
				// `this` is the socket; here is the only place to memo it
				// setup initial context
				this.context.extend(getContext.call(this));
			}
		});
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
		// websocket
		var ws = WSComm.listen(https, {
			ready: function() {
				// `this` is the socket; here is the only place to memo it
				// setup initial context
				this.context.extend(getContext.call(this));
			}
		});
	}

});
