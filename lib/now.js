'use strict';

/*
 *
 * Copyright(c) 2011 Vladimir Dronnikov <dronnikov@gmail.com>
 * MIT Licensed
 *
*/

//
// user capability wrapper for now.js
//
module.exports = function(getCapability, config) {

	var Cookie = require('cookie-sessions');

	var nowjs = require('now');
	nowjs.client = {

		getContext: function getContext(sid, callback) {
			// parse auth cookie to get the current user
			// TODO: better to get them from the request, if any ever exposed
			var options = config.security.session;
			var session;
			try {
				session = Cookie.deserialize(options.secret, options.timeout, sid);
			} catch (err) {}
			// push capabilities to the client
			var that = this;
			var client = this.now;
			if (session && session.uid) {
				getCapability(session.uid, function(err, context) {
					//console.log('CTX', arguments);
					var schema = {};
					// bind caps to the user context
					_.each(context, function(obj, name) {
						var x = _.clone(obj);
						_.each(_.functions(x), function(f) { x[f] = x[f].bind(null, result); });
						schema[name] = x.schema; delete x.schema;
						context[name] = x;
					});
					// push to the client the sanitized user profile
					client.user = {
						id: context.user.id,
						name: context.user.name,
						email: context.user.email,
						roles: context.user.roles
					};
					// push to the client the user context
					client.context = context;
					// push profile stuff
					client.getProfile = function(callback) {
						//var id = result.user.id;
						context.Self.getProfile(function(err, result) {
							if (callback) callback(err, result);
						});
					};
					client.setProfile = function(changes, callback) {
						var id = context.user.id;
						context.Self.setProfile(changes, function(err) {
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
				client.getProfile = client.setProfile = false;
				if (callback) callback({});
			}
		},

		login: function(callback) {
			//
			// N.B. we rely on server-side logic which sets secure signed cookie called sid which holds the session
			// ugly hack -- we fetch the sid cookie and pass it as parameter to `getContext` to get the user context
			// FIXME: beautify, they work on now.js exposing the request object -- this would allow for pure server-side login
			//
			var sid = document.cookie.match(new RegExp('(?:^|;) *' + 'sid' + '=([^;]*)')); sid = sid && sid[1] || '';
			console.log('SID', sid);
		}

	};

	return nowjs;

};
