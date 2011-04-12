'use strict';

/*
 *
 * Copyright(c) 2011 Vladimir Dronnikov <dronnikov@gmail.com>
 * MIT Licensed
 *
*/

require('../lib/helpers');

// improve HTTP reponse
require('./response');

//
// error handler uses res.send
//
function errorHandler(req, res, err) {
	if (err) {
		console.error('\n' + (err.stack || err) + '\n');
		res.send(err);
	} else {
		// 404 = not found
		res.send(null);
	}
};

//
// bundled creationix/Stack
//
var Middleware = function Stack(/*layers*/) {
	var error = errorHandler;
	var handle = error;
	Array.prototype.slice.call(arguments).reverse().forEach(function (layer) {
		var child = handle;
		handle = function (req, res) {
			try {
				layer(req, res, function (err) {
					if (err) { return error(req, res, err); }
					child(req, res);
				});
			} catch (err) {
				error(req, res, err);
			}
		};
	});
	return handle;
}

//
// plugin middleware helpers
//
_.extend(Middleware, {

	// fill req.context with current user capability
	caps: require('./caps'),

	// parse the body into req.body
	body: require('./body'),

	// manage secure signed cookie which holds logged user id
	session: require('cookie-sessions'),

	// handle form/OpenID auth
	auth: require('./auth').form,
	// handle basic authentication
	authBasic: require('./auth').basic,

	// mount a handler onto a URI (and optionally HTTP verb)
	mount: require('./mount'),

	// serve static stuff
	'static': require('./static'),

	// MVC style controllers
	mvc: require('./mvc'),

	// ReST resource controller
	rest: require('./rest'),

	// log the request and corresponding response
	log: require('./log'),

	// checks captcha validity in POST requests
	captcha: require('./captcha'),

});

//
// generate standard middleware stack
//
Middleware.vanilla = function vanilla(root, options) {

	if (!options) options = {};

	// setup views renderer
	require('./render')({
		path: root + '/views',
		ext: '.html',
		cache: false // true to cache rendered templates
	});

	// collect stack
	var layers = [];
	function use(layer) {
		layers.push.apply(layers, Array.isArray(layer) ? layer : [layer]);
	}

	// security
	if (options.security && options.security.session) {
		// manage cookie-based secure sessions
		use(Middleware.session(options.security.session));
		// fill req.context with current user capability
		use(Middleware.caps(options.security.getCapability));
	}

	//use(Middleware.log());

	// parse the body to req.body, req.files; parse req.url to req.uri
	// TODO: csrf https://github.com/hanssonlarsson/express-csrf
	// TODO: if we have mutating sid cookie, couldn't it be csrf token?
	use(Middleware.body());

	// FIXME: captcha uses parsed req.body, but to prohibit, say, robotic
	// uploads captcha should go prior to body parser...
	if (options.security.recaptcha) {
		use(Middleware.captcha(options.security.recaptcha));
	}

	//use(function(req, res, next) { res.send(req.body); });

	// handle manually defined routes
	if (options.routes) {
		use(Middleware.mount(options.routes));
	}

	// ReST/JSON-RPC handler
	use(Middleware.rest('', {
		putNew: '_new',
		jsonrpc: true
	}));

	// serve static stuff under ./public
	if (options.server.static) {
		use(Middleware.static('/', root + '/' + (options.server.static.dir || 'public'), null, {
			cacheThreshold: options.server.static.cache
		}));
	}

	// handle authentication
	if (options.security) {
		use(Middleware.auth(options.security.mount, {
			// auth URL
			signinURL: options.security.signinURL,
			// signup function
			signup: options.security.signup,
			// native authentication
			validate: options.security.checkCredentials,
			// loginza.ru authentication
			loginza: options.security.loginza,
			// janrain.com authentication
			janrain: options.security.janrain
		}));
	}

	//
	return Middleware.apply(Middleware, layers);

};

//
// expose
//
module.exports = Middleware;
