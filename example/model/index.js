'use strict';

// TODO: beautify
global._ = require('underscore');
require('underscore-data');
var db = require('../../lib/database');

//
// collect entities schemas
// TODO: consider DB-ify
//
var schema = require('./schema')(db);
//console.log('SCHEMA', schema);

//
// N.B. User entity is bundled. Think twice before change anything here
//

// TODO: move to db as helpers?
var REGEXP_ID = /^[a-zA-Z0-9_]+$/;
var REGEXP_IP = /^\d{1,3}.\d{1,3}.\d{1,3}.\d{1,3}$/;
var REGEXP_EMAIL = /^([\w\!\#$\%\&\'\*\+\-\/\=\?\^\`{\|\}\~]+\.)*[\w\!\#$\%\&\'\*\+\-\/\=\?\^\`{\|\}\~]+@((((([a-z0-9]{1}[a-z0-9\-]{0,62}[a-z0-9]{1})|[a-z])\.)+[a-z]{2,6})|(\d{1,3}\.){3}\d{1,3}(\:\d{1,5})?)$/i;
//'

//
// standard roles priority: a role can delegate only roles of higher index
//
var rolePriority = ['editor', 'author', 'creator', 'reader', 'viewer'];

//
// generic user entity
//

schema.User = {
	type: 'object',
	properties: {
		// primary key, "login"
		id: {
			type: 'string',
			pattern: REGEXP_ID,
			veto: {
				update: true
			}
		},
		// subdivision, to denote user flavor
		type: {
			type: 'string',
			'enum': ['admin', 'affiliate']
		},
		// array of role names, which define the access level to a certain entity
		// role name is <Entity>-<level>
		roles: {
			type: 'array',
			items: {
				type: 'string',
				// TODO: beautify, and externalize
				'enum': function(value) {
					//if (!value) return false;
					//console.log('VALIDATEROLE', value, this);
					// honor roles hierarchy
					var has = this.user && this.user.roles || [];
					var parts = value.split('-', 2);
					var prefix = new RegExp('^' + parts[0] + '-');
					//has = _.filter(has, function(r){return r.match(prefix)});
					var ret = false;
					_.each(has, function(r) {
						var hasParts = r.split('-', 2);
						if (parts[0] === hasParts[0]) {
							var priority = rolePriority.indexOf(parts[1]);
							var hasPriority = rolePriority.indexOf(hasParts[1]);
							//console.log('HAS', hasPriority, 'GRANTS', priority);
							if (~priority && ~hasPriority && priority >= hasPriority) {
								ret = true;
								// TODO: break the loop
							}
						}
					});
					return ret;
				}
			},
			default: []
		},
		// blocking status, non-empty string
		blocked: {
			type: 'string',
			optional: true
		},
		// user approval status, to help self-registration
		status: {
			type: 'string',
			'enum': ['pending', 'approved', 'declined'],
			default: 'pending'
		},
		// authentication secret, hashed by SHA1 with the salt
		password: {
			type: 'string'
		},
		// salt for password
		salt: {
			type: 'string'
		},
		// secret token, to ask from a user who wants to recover
		secret: {
			type: 'string',
			optional: true
		},
		// array of arbitrary strings to tag the user
		tags: {
			type: 'array',
			items: {
				type: 'string'
			},
			default: []
		},
		// user human name
		name: {
			type: 'string',
			optional: true
		},
		// user email, to communicate
		email: {
			type: 'string',
			pattern: REGEXP_EMAIL,
			optional: true
		},
		// user time zone
		timezone: {
			type: 'string',
			// TODO: from simple-geo
			'enum': ['UTC-11', 'UTC-10', 'UTC-09', 'UTC-08', 'UTC-07', 'UTC-06', 'UTC-05', 'UTC-04', 'UTC-03', 'UTC-02', 'UTC-01', 'UTC+00', 'UTC+01', 'UTC+02', 'UTC+03', 'UTC+04', 'UTC+05', 'UTC+06', 'UTC+07', 'UTC+08', 'UTC+09', 'UTC+10', 'UTC+11', 'UTC+12'],
			default: 'UTC+04'
		}
	}
};

//
// Admin
//
schema.Admin = {
	type: 'object',
	properties: {
		id: schema.User.properties.id,
		// type is always 'admin'
		type: db.fix(schema.User.properties.type, 'admin'),
		// default role is to author new admins
		roles: db.def(schema.User.properties.roles, ['Admin-author']),
		// admin can block users
		blocked: schema.User.properties.blocked,
		// admin can control approval status
		status: schema.User.properties.status,
		// admin can set initial user password
		password: db.co(schema.User.properties.password),
		// admin can salt initial user password
		salt: db.co(schema.User.properties.salt),
		// admin can tag users
		tags: schema.User.properties.tags,
		// admin can read user name
		name: db.ro(schema.User.properties.name),
		// admin can read user email
		email: db.ro(schema.User.properties.email),
		// admin can read user time zone
		timezone: db.ro(schema.User.properties.timezone)
	},
	// admins are stored in User collection
	collection: 'User',
	// additional conditions imposed on all accessors
	constraints: [
		{key: 'type', value: 'admin', op: 'eq'}
	]
};

//
// Affiliate
//
schema.Affiliate = {
	type: 'object',
	properties: {
		id: schema.User.properties.id,
		// type is always 'affiliate'
		type: db.fix(schema.User.properties.type, 'affiliate'),
		// default affiliate role is nothing
		roles: db.def(schema.User.properties.roles, []),
		// affiliate can block subordinates
		blocked: schema.User.properties.blocked,
		// affiliate can approve subordinates
		status: schema.User.properties.status,
		// affiliate can set initial subordinate password
		password: db.co(schema.User.properties.password),
		// affiliate can salt initial subordinate password
		salt: db.co(schema.User.properties.salt),
		// affiliate can tag subordinates
		tags: schema.User.properties.tags,
		// affiliate can read subordinate name
		name: db.ro(schema.User.properties.name),
		// affiliate can read subordinate email
		email: db.ro(schema.User.properties.email),
		// affiliate can read subordinate time zone
		timezone: db.ro(schema.User.properties.timezone)
	},
	// affiliates are stored in User collection
	collection: 'User',
	// additional conditions imposed on all accessors
	constraints: [
		{key: 'type', value: 'affiliate', op: 'eq'}
	]
};

//
// User as seen by himself
//
schema.Self = {
	type: 'object',
	properties: {
		id: schema.User.properties.id,
		// user can read his type
		type: db.ro(schema.User.properties.type),
		// user can read his roles
		roles: db.ro(schema.User.properties.roles),
		// user can set his password
		password: db.wo(schema.User.properties.password),
		// user can salt his password
		salt: db.wo(schema.User.properties.salt),
		// user can read/write his secret
		secret: schema.User.properties.secret,
		// user can rename himself
		name: schema.User.properties.name,
		// user can control his email
		email: schema.User.properties.email,
		// user can control his time zone
		timezone: schema.User.properties.timezone
	},
	// users are stored in User collection
	collection: 'User'
};

//
//
//
module.exports = function(config, callback) {

//
// secrets helpers
//
var Crypto = require('crypto');
function nonce() {
	return (Date.now() & 0x7fff).toString(36) + Math.floor(Math.random() * 1e9).toString(36) + Math.floor(Math.random() * 1e9).toString(36) + Math.floor(Math.random() * 1e9).toString(36);
}
function sha1(data, key) {
	var hmac = Crypto.createHmac('sha1', '');
	hmac.update(data);
	return hmac.digest('hex');
}
function encryptPassword(password, salt) {
	return sha1(salt + password + config.security.secret);
}

////////////////////////////////////////////////////////////
Next({}, function(err, result, next) {

	//
	// connect to MongoDB instance, register entities
	//
	new db.Database(config.database.url, schema, next);

////////////////////////////////////////////////////////////
}, function(err, model, next) {

	//
	// set the model
	//
	if (!model) model = {};
	//console.log('MODEL', err&&err.stack, model);

	//
	// redefine User accessors, to obey security
	//
	var Self = model.Self;
	var Admin = model.Admin;
	_.each(model, function(entity, name) {
		if (entity.schema.collection !== 'User') return;
		var orig = entity;
		var store = {
			schema: orig.schema
		};
		//
		// get -- when getting the data for context.user we must use another schema
		//
		store.getOwn = function(context, id, next) {
			if (!id) return next();
			// determine if id is equal to the context user' id
			var isSelf = id === context.user.id;
			// if so, return private view of the user record
			if (isSelf) {
				orig._getOwn(schema.Self, context, id, next);
			// else return admin's view
			} else {
				orig.getOwn(context, id, next);
			}
		};
		store.getAny = function(context, id, next) {
			if (!id) return next();
			// determine if id is equal to the context user' id
			var isSelf = id === context.user.id;
			// if so, return private view of the user record
			if (isSelf) {
				orig._getAny(schema.Self, context, id, next);
			// else return admin's view
			} else {
				orig.getAny(context, id, next);
			}
		};
		//
		// add -- assign crypted password and salt
		// handle self-registration
		//
		store.add = function(context, data, next) {
			if (!data) data = {};
			// N.B. setting password w/o email leads to bricked user
			// so if user has email, password will be set to a nonce, and mailed
			// if user has no email, password will be set to uid
			// FIXME: this is a hole
			if (!data.password) {
				data.password = data.email ? nonce() : data.id;
				//data.password = nonce().substring(0, 7);
			}
			var salt = nonce();
			var password = encryptPassword(data.password, salt);
			Next(null, function(err, result, step) {
				// the very first user of type 'admin' becomes the root
				// N.B. typically at bootstrap you need to enable config.security.bypass,
				// create the first admin user by PUTting to /Admin/_new, and
				// to re-disable config.security.bypass
				Admin.queryAny(context, 'select(id,roles)&limit(1)', step);
			}, function(err, admins, step) {
				//console.log('ADMINS', arguments);
				if (err) return next(err);
				// if no admins so far -> the very first user being added will be the root
				if (!admins.length) {
					// if no context provided -> self-registration is meant,
					// context should mention root's id and full roles
					// parent's id should be fake
					if (!context) context = {user: {id: nonce()+nonce()+nonce(), roles: fullRole}};
					// add admin user
					Admin.add(context, {
						id: data.id,
						email: data.email,
						password: password,
						salt: salt,
						roles: fullRole,
						status: 'approved'
					}, step);
					return;
				// if no context provided -> self-registration is meant,
				// context should mention root's id, root is the first admin
				} else if (!context) {
					context = {user: admins[0]};
					// use default role
					delete data.roles;
					// use default status
					delete data.status;
				// authorized user creates new user
				} else {
					// set status to 'approved'
					data.status = 'approved';
				}
				console.log('ADD?', data);//, context, password);
				// add typed user
				orig.add(context, {
					id: data.id,
					email: data.email,
					password: password,
					salt: salt,
					type: data.type,
					roles: data.roles,
					status: data.status
				}, step);
			}, function(err, user, step) {
				console.log('USERADDED', err, user);
				if (err) return next(err);
				// TODO: node-mailer data.id, data.password
				if (user.email) {
					require('../lib/email').mail('dvv854@gmail.com', 'signup', 'signedupfrom', function(err) {
						if (err) console.log('MAILERR', err.stack||err);
						step(null, user);
					});
				} else {
					step(null, user);
				}
			}, function(err, user, step) {
				if (next) next(err, user);
			});
		};
		//
		// query -- goes intact
		//
		store.queryOwn = orig.queryOwn;
		store.queryAny = orig.queryAny;
		//
		//
		// update -- act differently upon context.user (because of schema);
		// also take care of updating salt and crypted password
		//
		store.updateOwn = function(context, query, changes, next) {
			// update others
			orig.updateOwn(context, _.rql(query).ne('id', context.user.id), changes, next);
		};
		store.updateAny = function(context, query, changes, next) {
			Next({}, function(err, result, step) {
				// update self, if in query
				var profileChanges = _.clone(changes);
				// salt password, and hash it, before shipping to the db
				if (profileChanges.password) {
					this.password = String(profileChanges.password);
					profileChanges.salt = nonce();
					profileChanges.password = encryptPassword(this.password, profileChanges.salt);
				}
				orig._updateAny(schema.Self, context, _.rql(query).eq('id', context.user.id), profileChanges, step);
			}, function(err, result, step) {
				// TODO: report changes (email?) `this.password` holds plain password
				// ...
				delete this.password;
				step();
			}, function(err, result, step) {
				// update others
				orig.updateAny(context, _.rql(query).ne('id', context.user.id), changes, step);
			}, function(err) {
				if (next) next(err);
			});
		};
		//
		// remove -- forbid self-removal
		//
		store.removeOwn = function(context, query, next) {
			orig.removeOwn(context, _.rql(query).ne('id', context.user.id), next);
		};
		store.removeAny = function(context, query, next) {
			orig.removeAny(context, _.rql(query).ne('id', context.user.id), next);
		};
		//
		// delete -- forbid self-removal
		//
		if (orig.deleteOwn) {
			store.deleteOwn = function(context, query, next) {
				orig.deleteOwn(context, _.rql(query).ne('id', context.user.id), next);
			};
		}
		if (orig.deleteAny) {
			store.deleteAny = function(context, query, next) {
				orig.deleteAny(context, _.rql(query).ne('id', context.user.id), next);
			};
		}
		//
		// undelete -- forbid self-restoral
		//
		if (orig.undeleteOwn) {
			store.undeleteOwn = function(context, query, next) {
				orig.undeleteOwn(context, _.rql(query).ne('id', context.user.id), next);
			};
		}
		if (orig.undeleteAny) {
			store.undeleteAny = function(context, query, next) {
				orig.undeleteAny(context, _.rql(query).ne('id', context.user.id), next);
			};
		}
		//
		// purge -- forbid self-purge
		//
		if (orig.purgeOwn) {
			store.purgeOwn = function(context, query, next) {
				orig.purgeOwn(context, _.rql(query).ne('id', context.user.id), next);
			};
		}
		if (orig.purgeAny) {
			store.purgeAny = function(context, query, next) {
				orig.purgeAny(context, _.rql(query).ne('id', context.user.id), next);
			};
		}
		//
		// ???
		//
		store.foo = function(context, params, next) {
			console.log('User.foo(' + JSON.stringify(params) + ') called!');
			if (next) next();
		}
		//
		// replace the entity
		//
		model[name] = store;
	});

	// save model.Self.updateAny -- it's reused when updating context user profile
	var modelSelfUpdate = model.Self.updateAny;
	// N.B. forget Self model, it's pure helper one
	delete model.Self;

	//
	// derive standard roles from model
	//
	var roles = {};
	var fullRole = [];
	_.each(model, function(store, name) {
		function prop(value) {
			var r = {};
			r[name]= value;
			return r;
		}
		roles['' + name + '-viewer'] = prop({
			schema: store.schema,
			query: store.queryAny
		});
		roles['' + name + '-reader'] = prop({
			schema: store.schema,
			query: store.queryAny,
			get: store.getAny
		});
		roles['' + name + '-creator'] = prop({
			schema: store.schema,
			query: store.queryAny,
			add: store.add
		});
		roles['' + name + '-author'] = prop({
			schema: store.schema,
			query: store.queryOwn,
			get: store.getOwn,
			add: store.add,
			update: store.updateOwn,
			remove: store.removeOwn
		});
		// full access role
		var full = '' + name + '-editor';
		// collect the full access role
		fullRole.push(full);
		roles[full] = prop({
			schema: store.schema,
			query: store.queryAny,
			get: store.getAny,
			add: store.add,
			update: store.updateAny,
			remove: store.removeAny,
			foo: store.foo
		});
		if (store.deleteOwn) {
			_.extend(roles['' + name + '-author'], prop({
				delete: store.deleteOwn,
				undelete: store.undeleteOwn,
				purge: store.purgeOwn
			}));
		}
		if (store.deleteAny) {
			_.extend(roles['' + name + '-editor'], prop({
				delete: store.deleteAny,
				undelete: store.undeleteAny,
				purge: store.purgeAny
			}));
		}
	});
	//this.roles = roles;
	//console.log(roles);

	//
	// fetch custom roles
	//
	//model.Role.query(null, '', next);
	//next(null, require('./roles'));

	//
	// default capability
	//
	var selfCaps = {
		//
		// acting on self
		//
		Self: {
			// get profile
			getProfile: function(ctx, callback) {
				// we don't wnant to hit db, since ctx.user already have the data
				var profile = _.extend({}, ctx.user);
				_.validate(profile, schema.Self, {veto: true, removeAdditionalProps: true, flavor: 'get'});
				if (callback) callback(null, profile);
			},
			// set profile
			setProfile: function(ctx, changes, callback) {
				// delegate to model.Self.updateAny, to keep the logic in single place
				modelSelfUpdate(ctx, [ctx.user.id], changes, callback);
			}
		}
	};

	//
	// get capability of a user uid
	//
	function getCapability(uid, callback) {
		Next(null, function(err, result, next) {
			Self._getAny(null, null, uid, next);
		}, function(err, user) {
			//console.log('USER', err, user, uid);
			// bad user defaults to a guest
			if (!user) user = {};
			// context is a superposition of user roles
			if (config.security.bypass) user.roles = fullRole;
			var caps = _.extend.apply(null, [{}, selfCaps].concat(_.map(user.roles, function(x){return roles[x] || {};})));
			// set context user
			Object.defineProperty(caps, 'user', {value: user});
			//console.log('CAPS', user, caps);
			if (callback) callback(null, caps);
		});
	}

	//
	// verify provided credentials
	// used in auth middleware
	//
	function checkCredentials(uid, password, callback) {
		Next(null, function(err, result, next) {
			Self._getAny(null, null, uid, next);
		}, function(err, user, next) {
			console.log('USER', arguments);
			// user not found
			if (!user) {
				// logout
				if (!uid) {
					next();
				// no such user
				} else {
					next('usernotfound');
				}
			} else {
				if (!user.password || user.blocked) {
					next('userblocked');
				} else if (user.password !== encryptPassword(password, user.salt)) {
					//console.log('CREDS???', user.password, user.salt, encryptPassword(password, user.salt));
					next('userinvalid');
				} else {
					//console.log('CREDS!!!', uid);
					next(null, uid);
				}
			}
		}, function(err, result, next) {
			if (callback) callback(err, result);
		});
	}

	//
	// signup new user
	// used in auth middleware
	//
	function signup(data, callback) {
		// no context means to use root's one
		model.Affiliate.add(null, data, callback);
	}

	//
	// return security provider
	//
	callback(null, {
		getCapability: getCapability,
		checkCredentials: checkCredentials,
		signup: signup
	});
});

};
