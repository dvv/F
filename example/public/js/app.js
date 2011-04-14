'use strict';

/*
 *
 * Copyright(c) 2011 Vladimir Dronnikov <dronnikov@gmail.com>
 * MIT Licensed
 *
*/

/*

http://stackoverflow.com/questions/4776261/views-within-views-how-to-generating-lists-of-items-with-backbone-js

*/

// augment IE. for how long?!
if (typeof console == 'undefined') console = {log: alert};

//
// --------------------------------------------------------------------
//
// misc helpers
//
_.mixin({
	partial: function(name, data) {
		console.log('PART', name, data);
		return kite($(name).html()||'', data);
	},
	compile: function(name) {
		return kite($(name).html()||'');
	},
	// i18n helper
	T: function(str) {
		return str;
	}
});

//
// --------------------------------------------------------------------
//
// setup the model
//
var ChromeModel = Backbone.Model.extend({
	//
	initialize: function() {
		this.bind('change:entity', function() {
			console.log('CHENT', this, arguments);
		});
		this.bind('change:error', function() {
			console.log('CHERR', this, arguments);
		});
		this.bind('change:result', function() {
			console.log('CHRES', this, arguments);
		});
	},
	// setup RPC helper
	rpc: function(entity, method /*, params */) {
		var self = this;
		self.set({entity: entity});
		var params = Array.prototype.slice.call(arguments, 2);
		var promise = $.Deferred();
		params.push(function(err, result) {
			//console.log('RET', err, result);
			self.set({error: err||null, result: err ? null : (result||null)});
			promise.resolve();
		});
		try {
			self.get('context')[entity][method].apply(null, params);
		} catch (err) {
			//console.log('ERR', err);
			if (err instanceof TypeError) {
				err = 'Forbidden';
			} else {
				err = err.message || err;
			}
			self.set({error: err, result: null});
			promise.resolve();
		}
		return promise;
	},
	// view helper: given model attribute name and HTML element id
	getViewForAttribute: function(attr, id, getter) {
		var model = this;
		var view = Backbone.View.extend({
			el: $('#'+id),
			template: _.compile('#tmpl-'+id+',#tmpl-missing'),
			initialize: function() {
				_.bindAll(this, 'render');
				model.bind('change:'+attr, this.render);
			},
			render: function() {
				var data = model.toJSON();
				if (getter) data = getter.call(model, data);
				//this.el.html(this.template(data));
				this.el.html(_.partial('#tmpl-'+id+',#tmpl-missing', data));
				return this;
			}
		});
		return view;
	}
});

// initially model is empty
var model = new ChromeModel({
});

//
// --------------------------------------------------------------------
//
// setup UI
//
var ViewError = model.getViewForAttribute('error', 'errors', function(data) {
	// normalize errors
	var error = data.error;
	if (error) {
		if (typeof error === 'string') error = {message: error};
		if (!Array.isArray(error)) error = [error];
	} else {
		error = [];
	}
	return error;
});

var ViewMenu = model.getViewForAttribute('context', 'menu', function(data) {
	// list entities
	var entities = [];
	_.each(data.context, function(methods, entity) {
		if (methods.query) entities.push(entity);
	});
	return entities;
});

var ViewUser = model.getViewForAttribute('user', 'profile');

var ViewList = model.getViewForAttribute('result', 'list', function(data) {
	var entity = this.get('entity');
	var context = this.get('context');
	var props = this.get('schema')[entity] || {
		type: 'object', properties: {id: {}}
	};
	//console.log('A', entity, context[entity], props);
	var context = {
		entity: entity,
		actions: _.reduce(context[entity], function(acc, v, k) {acc[k] = !!v; return acc;}, {}),
		items: data.result || [],
		props: props,
		query: {
			limit: []
		},
		selected: [],
		partials: {
			actions: _.partial('#tmpl-'+entity+'-actions,#tmpl-actions', context)
		}
	};
	return context;
});

//
// --------------------------------------------------------------------
//
// setup controller
//
var Controller = Backbone.Controller.extend({
	initialize: function(config) {
		var self = this;
		//
		// define entity routes
		//
		// list: #list/<Entity>[?querystring]
		this.route(/^list\/(\w+)(?:\?(.*))?$/, 'list', function(entity, query) {
			if (!query) query = '';
			console.log('ROUTE: list', entity, query);
			model.rpc(entity, 'query', query).then(function() {
				model.set({query: query});
			});
		});
		// add: #add/<Entity>
		this.route(/^add\/(\w+)$/, 'add', function(entity) {
			console.log('ROUTE: add', entity);
			model.rpc(entity, 'add', {}).then(function() {
				model.unset('query');
			});
		});
	},
	routes: {
		'help':										'help',    // #help
		'search/:query':					'search',  // #search/kiwis
		'add/:entity':						'add',
		/***
		#admin/list/Foo?asdasd
		#admin/add/Foo
		#admin/edit/Foo
		***/
	}
});

//
//
//
$(document).ready(function() {
	console.log('DOMREADY');
	//
	// N.B. we rely on server-side logic which sets secure signed cookie called sid which holds the session
	// ugly hack -- we fetch the sid cookie and pass it as parameter to `getContext` to get the user context
	// FIXME: beautify, they work on now.js exposing the request object -- this would allow for pure server-side login
	//
	var sid = document.cookie.match(new RegExp('(?:^|;) *' + 'sid' + '=([^;]*)')); sid = sid && sid[1] || '';
	// establish nowjs connection
	now.ready(function() {
		// connection established ok
		console.log('NOWREADY');
		// disconnect nullifies context
		now.core.on('disconnect', function() {
			console.log('DISCONNECTED');
			model.unset('context');
			// TODO: display reconnect link
		});
		// given sid, server should set now.context which holds the user capabilities
		now.getContext(sid, function(response) {
			//
			// instantiate UI
			//
			new ViewError();
			new ViewMenu();
			new ViewUser();
			new ViewList();
			// update model, to cause initial render
			model.set({
				user: response.user,
				context: now.context, // user caps
				schema: response.schema,
				entity: null,
				error: null,
				//result: null
			});
			// run application
			new Controller();
			Backbone.history.start();
		});
		//
		// define `now` client-side functions, they will be called by server
		//
		now.flash = function(s) {
			$.Growl.show(s, {
				icon: false,
				title: false,
				cls: '',
				speed: 1000,
				timeout: 50000
			});
		};
		now.msg = function(s) {
			now.act(s);
		};
		now.receiveMessage = function(name, message) {
			$("#messages").append("<br>" + name + ": " + message);
		};
	});
	//
	// other initialization
	//
	// ...
});
