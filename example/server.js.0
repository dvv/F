'use strict';

/*
 *
 * Copyright(c) 2011 Vladimir Dronnikov <dronnikov@gmail.com>
 * MIT Licensed
 *
*/

////////////////////////////////////////////////////////////

require('./lib/helpers');

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

	//
	// setup middleware
	//
	var Middleware = require('./middleware');
	deepCopy({
		// signup function
		signup: config.security.selfSignup ? model.signup : undefined,
		// get capability
		getCapability: this.getCapability = model.getCapability,
		// native authentication
		checkCredentials: model.checkCredentials
	}, config.security);
	//
	// expose schema.Self for now.js getContext
	//
	//this.Self = model.Self.schema;
	//
	function ordinary(req, res, next) {
		var user = req.context.user;
		user = {
			id: user.id,
			type: user.type,
			email: user.email,
			name: user.name,
			roles: user.roles
		};

		if (req.method === 'POST') {
			res.render('index', {user: user, fields: req.body, files: req.files, captcha: res.captcha()});
		} else {
			res.render('index', {user: user, fields: req.body, files: req.files, captcha: res.captcha()});
		}
	}
	var routes = [
		['/', {get: ordinary, post: ordinary}],
		['GET', '/profile', ordinary],
		['GET', '/admin', function(req, res, next) {
			res.render('admin', res.context);
		}],
		['POST', '/captcha', function(req, res, next) {
			console.log('CAPTURED', req.headers, req.body);
			res.send('false\nfock!');
		}],
		['GET', '/chat', function(req, res, next) {
			res.render('chat', res.context);
		}],
	];
	config.routes = routes;
	var middleware = Middleware.vanilla(__dirname, config);
	next(null, middleware);

}, function(err, middleware, next) {

	if (err) console.log('S2', err.stack);

	/***
	var http = require('http').createServer();
	http.on('request', middleware);

	var cluster = require('cluster');
	cluster(http)
		.set('workers', 2)
		.use(cluster.debug())
		.use(cluster.reload([__filename, 'lib', 'middleware']))
		.use(cluster.stats())
		.use(cluster.repl())
		.listen(3000);
	return;
	***/

	//
	// run both HTTP(S) servers with the same middleware
	//
	var http = require('http').createServer();
	http.on('request', middleware);
	http.listen(3000);
	//require('./now')(http);

	// TODO: make this lib/websocket standard

	var everyone = require('now').initialize(http);
	everyone.connected(function() {
		// TODO: lookup sid cookie, auto-call setContext if found
		//console.log("Joined: " + this.now.name);
	});
	everyone.disconnected(function() {
		//console.log("Left: " + this.now.name);
	});

	var self = this;
	/***
	// TODO: may be auth page as usual sets sid, and then `connected` may autologin and autoset context?
	everyone.now.setContext = function(uid, password, callback) {
		var client = this.now;
		self.checkCredentials(uid, password, function(err, result) {
			// authenticated?
			if (result) {
				// push capabilities to the client
				self.getCapability(uid, function(err, result) {
					//console.log('CTX', arguments);
					// bind caps to the user
					_.each(result, function(obj, name) {
						_.each(_.functions(obj), function(f) { obj[f] = _.bind(obj[f], obj, result); });
						result[name] = obj;
					});
					// push to the client the sanitized user profile
					client.user = {
						id: result.user.id,
						email: result.user.email,
						roles: result.user.roles
					};
					// push to the client the user context
					client.context = result;
					callback({error: err || null, result: err ? undefined : true});
				});
			// invalid user, or just signed out 
			} else {
				// revoke capabilities from the client
				client.user = {};
				client.context = {};
				callback({error: err || null, result: err ? undefined : true});
			}
		});
	};
	***/

	var Cookie = require('cookie-sessions');
	everyone.now.getContext = function getContext(sid, callback) {
		// parse auth cookie to get the current user
		// TODO: better to get them from the request, if any exposed
		var options = config.security.session;
		var session;
		try {
			session = Cookie.deserialize(options.secret, options.timeout, sid);
		} catch (err) {}
		// push capabilities to the client
		var that = this;
		var client = this.now;
		if (session && session.uid) {
			self.getCapability(session.uid, function(err, result) {
				//console.log('CTX', arguments);
				var schema = {};
				// bind caps to the user context
				_.each(result, function(obj, name) {
					var x = _.clone(obj);
					_.each(_.functions(x), function(f) { x[f] = x[f].bind(null, result); });
					schema[name] = x.schema; delete x.schema;
					result[name] = x;
				});
				// push to the client the sanitized user profile
				client.user = {
					id: result.user.id,
					name: result.user.name,
					email: result.user.email,
					roles: result.user.roles
				};
				// push to the client the user context
				client.context = result;
				// push profile stuff
				client.get = function(callback) {
					//var id = result.user.id;
					result.Self.getProfile(function(err, result) {
						if (callback) callback(err, result);
					});
				};
				client.update = function(changes, callback) {
					var id = result.user.id;
					result.Self.setProfile(changes, function(err) {
						if (err && callback) return callback({error: err});
						getContext.call(that, sid, callback);
					});
				};
				// return db schema
				if (callback) callback({schema: schema});
			});
		// invalid user, or just signed out 
		} else {
			// revoke capabilities from the client
			client.user = {};
			client.context = {};
			client.get = client.update = false;
			if (callback) callback({});
		}
	};

	everyone.now.distributeMessage = function(message) {
		everyone.now.receiveMessage(this.now.name, message);
	};

	/*
	var https = require('https').createServer({
		key: require('fs').readFileSync('key.pem', 'utf8'),
		cert: require('fs').readFileSync('cert.pem', 'utf8')
	});
	https.on('request', middleware);
	https.listen(4000);
	*/
	return;

	//
	// run cluster
	//
	var server = require('stereo')(null, config.server);

	//
	// worker process
	//
	if (server) {

		// inter-workers message arrives
		process.on('message', function(message){
			process.log(JSON.stringify(message));
		});

		// attach middleware
		server.on('request', middleware);

	//
	// master process
	//
	} else {

		// broadcast a message
		setTimeout(function(){process.publish({sos: 'to all, all, all'});}, 2000);

	}

});
