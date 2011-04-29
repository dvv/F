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

//
// --------------------------------------------------------------------
//
// misc helpers
//

// pop a notification
function flash(s) {
	$.Growl.show(s, {
		icon: false,
		title: false,
		cls: '',
		speed: 1000,
		timeout: 50000
	});
}

// Escape special HTML entities
function escapeHTML(x) {
	return (x == null) ? '' :
		String(x)
		.replace(/&(?!\w+;|#\d+;|#x[\da-f]+;)/gi, '&amp;')
		.replace(/</g, '&lt;').replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		// FIXME: single quotes?!
	;
}

// define template syntax
var templateSettings = {
	//evaluate: /\{\{([\s\S]+?)\}\}/g,
	//interpolate: /\$\$\{([\s\S]+?)\}/g,
	//escape: /\#\{([\s\S]+?)\}/g,
	evaluate: /<%([\s\S]+?)%>/g,
	//arrayify: /<%[([\s\S]+?)]%>/g,
	interpolate: /<%-([\s\S]+?)%>/g,
	escape: /<%=([\s\S]+?)%>/g,
};

// template parser
function template(str, data, settings) {
	var c	= settings || templateSettings;
	var tmpl = 'var __p=[],print=function(){__p.push.apply(__p,arguments);};' +
		'if(obj==null)obj={};__p.push(\'' +
		str.replace(/\\/g, '\\\\')
		.replace(/'/g, "\\'")
		//.replace(c.arrayify || null, function(match, code) {
		//	return '<%_.each(' + code + ',function(value, key){%>' + '<%});%>';
		//})
		.replace(c.interpolate, function(match, code) {
			return "'," + code.replace(/\\'/g, "'") + ",'";
		})
		.replace(c.escape || null, function(match, code) {
			return "'," + escapeHTML(code.replace(/\\'/g, "'")) + ",'";
		})
		.replace(c.evaluate || null, function(match, code) {
			return "');" + code.replace(/\\'/g, "'")
													.replace(/[\r\n\t]/g, ' ') + "__p.push('";
		})
		.replace(/\r/g, '\\r')
		.replace(/\n/g, '\\n')
		.replace(/\t/g, '\\t')
		+ "');return __p.join('');";
	//console.log('\n\n\n' + tmpl + '\n\n\n');
	var func;
	try {
		func = new Function('obj', tmpl);
	} catch (err) {
		func = function() {
			return err.stack || err.message;
		}
	}
	return data ? func(data) : func;
}


$.ender({
	partial: function(name, data) {
		//console.log('PART', name, data);
		return template($(name).html()||'', data);
		//return dust.compile($(name).html()||'', data);
		//return kite($(name).html()||'', data);
	},
	compile: function(name) {
		return template($(name).html()||'');
		//return dust.compile($(name).html()||'');
		//return kite($(name).html()||'');
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
	/*rpc0: function(entity, method) {
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
	},*/
	// setup RPC helper
	rpc: function(entity, method, callback /*, params */) {
		var self = this;
		// memorize the entity
		self.set({entity: entity});
		// extract params
		var params = Array.prototype.slice.call(arguments, 3);
		// extract handler
		var handler = self.get('context')[entity][method];
		try {
			// handler is function?
			if (typeof handler === 'function') {
				// now.js case
				// great RPC -- RPC by namely call the remote function
				params.push(function(error, result) {
					//console.log('RET', err, result);
					self.set({error: error||null, result: error ? null : (result||null)});
					if (callback) callback();
				});
				handler.apply(null, params);
			// handler is exposed
			} else if (handler === true) {
				// fallback to vanilla JSON-RPC via XHR
				$.ajax({
					method: 'POST',
					type: 'json',
					url: entity,
					data: JSON.stringify({jsonrpc: '2.0', method: method, params: params}),
					headers: {'Content-Type': 'application/json; charset=UTF-8'},
					success: function(response) {
						//console.log('SUCCESS', arguments);
						self.set({error: response.error||null, result: response.error ? null : (response.result||null)});
					},
					error: function() {
						//console.log('ERROR', arguments);
						// communication failed
						self.set({error: 'failed', result: null});
					},
					complete: function() {
						//console.log('COMPLETE', arguments);
					}
				});
			// no handler for this RPC
			} else {
				self.set({error: 'notsupported', result: null});
			}
		} catch (err) {
			//console.log('ERR', err);
			if (err instanceof TypeError) {
				err = 'notsupported';
			} else {
				err = err.message || err;
			}
			self.set({error: err, result: null});
			if (callback) callback();
		}
	},
	// view helper: given model attribute name and HTML element id
	getViewForAttribute: function(attr, id, getter) {
		var model = this;
		var view = Backbone.View.extend({
			el: $('#'+id),
			template: $.compile('#tmpl-'+id+',#tmpl-missing'),
			initialize: function() {
				$.bindAll(this, 'render');
				if (Array.isArray(attr)) {
					for (var i = 0; i < attr.length; ++i) {
						model.bind('change:'+attr[i], this.render);
					}
				} else {
					model.bind('change:'+attr, this.render);
				}
			},
			render: function() {
				var data = model.toJSON();
				if (getter) {
					data = getter.call(model, data);
				} else if (typeof attr == 'string') {
					data = data[attr];
				} else {
					//data = data;
				}
				this.el.html(this.template(data));
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
	$.each(data.context, function(methods, entity) {
		if (methods.query) entities.push(entity);
	});
	return entities;
});

var ViewUser = model.getViewForAttribute('user', 'profile');

var ViewList = model.getViewForAttribute(['result', 'query'], 'list', function(data) {
	var entity = this.get('entity');
	var context = this.get('context');
	var props = this.get('schema')[entity] || {
		type: 'object', properties: {id: {}}
	};
	var query = this.get('query');
	//console.log('A', entity, context[entity], props);
	// FIXME: fixture
	//data = {result: [{"type":"admin","roles":["Admin-author"],"status":"approved","tags":[],"timezone":"UTC+04","id":"4da18079d76e77d629000001"},{"type":"admin","roles":["Admin-author"],"status":"approved","tags":[],"timezone":"UTC+04","id":"4da1807cd76e77d629000002"},{"type":"admin","roles":["Admin-author"],"status":"approved","tags":[],"timezone":"UTC+04","id":"aaa1"},{"type":"admin","roles":["Admin-author"],"status":"approved","tags":[],"timezone":"UTC+04","id":"aaa2"},{"email":"foo@bar.com","roles":["Admin-editor","Affiliate-editor","Foo-editor"],"status":"approved","tags":[],"timezone":"UTC+04","type":"admin","id":"root"}]};
	//var props = {"type":"object","properties":{"id":{"type":"string","veto":{"update":true}},"type":{"type":"string","enum":["admin","affiliate"],"value":"affiliate"},"roles":{"type":"array","items":{"type":"string"},"default":[]},"blocked":{"type":"string","optional":true},"status":{"type":"string","enum":["pending","approved","declined"],"default":"pending"},"password":{"type":"string","veto":{"query":true,"get":true,"update":true}},"salt":{"type":"string","veto":{"query":true,"get":true,"update":true}},"tags":{"type":"array","items":{"type":"string"},"default":[]},"name":{"type":"string","optional":true,"veto":{"update":true}},"email":{"type":"string","optional":true,"veto":{"update":true}},"timezone":{"type":"string","enum":["UTC-11","UTC-10","UTC-09","UTC-08","UTC-07","UTC-06","UTC-05","UTC-04","UTC-03","UTC-02","UTC-01","UTC+00","UTC+01","UTC+02","UTC+03","UTC+04","UTC+05","UTC+06","UTC+07","UTC+08","UTC+09","UTC+10","UTC+11","UTC+12"],"default":"UTC+04","veto":{"update":true}}},"collection":"User","constraints":[{"key":"type","value":"affiliate","op":"eq"}]};
	var context = {
		entity: entity,
		actions: $.reduce(context[entity], function(acc, v, k) {acc[k] = !!v; return acc;}, {}),
		items: data.result || [],
		props: props.properties,
		query: $.rql(query).toMongo(),
		selected: []
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
			/*model.rpc(entity, 'query', query).then(function() {
				model.set({query: query});
			});*/
			model.set({query: query});
			model.rpc(entity, 'query', function() {
				// ...
			}, query);
		});
		// add: #add/<Entity>
		this.route(/^add\/(\w+)$/, 'add', function(entity) {
			console.log('ROUTE: add', entity);
			model.unset('query');
			model.rpc(entity, 'add', function() {
				// ...
			}, {});
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
$.domReady(function() {
	console.log('DOMREADY');
	//
	// instantiate UI
	//
	new ViewError();
	new ViewMenu();
	new ViewUser();
	new ViewList();
	//
	// update model, to cause initial render
	//
	model.set({
		user: context.user,
		context: context.caps, // user caps
		schema: context.schema,
		entity: null,
		error: null,
		//result: null
	});
	//
	// run application
	//
	new Controller();
	console.log('STARTING!');
	Backbone.history.start();
});

/*
function ready() {
	console.log('READY');
	//
	// try to upgrade context to now.js
	//
	//
	// N.B. we rely on server-side logic which sets secure signed cookie called sid which holds the session
	// ugly hack -- we fetch the sid cookie and pass it as parameter to `getContext` to get the user context
	// FIXME: beautify, they work on now.js exposing the request object -- this would allow for pure server-side login
	//
	var sid = document.cookie.match(new RegExp('(?:^|;) *' + 'sid' + '=([^;]*)')); sid = sid && sid[1] || '';
	// establish nowjs connection
	if (false) now.ready(function() {
		// connection established ok
		console.error('NOWREADY');
		// disconnect nullifies context
		now.core.on('disconnect', function() {
			console.log('DISCONNECTED');
			model.unset('context');
			// TODO: display reconnect link
		});
		// given sid, server should set now.context which holds the user capabilities
		now.getContext(sid, function(response) {
			console.log('GOT CONTEXT', response, now.context);
			model.set({context: now.context});
			// FIXME: should emit change event, to rerender
		});
		//
		// define `now` client-side functions, they will be called by server
		//
		now.flash = function(s) {
			flash(s);
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
};
*/

function upgradeToNowJS() {
	console.log('NOWJSREADY');
	//
	// try to upgrade context to now.js
	//
	//
	// N.B. we rely on server-side logic which sets secure signed cookie called sid which holds the session.
	// ugly hack -- we fetch the sid cookie and pass it as parameter to `getContext` to get the user context
	// FIXME: beautify, they work on now.js exposing the request object -- this would allow for pure server-side login
	//
	var sid = document.cookie.match(new RegExp('(?:^|;) *' + 'sid' + '=([^;]*)')); sid = sid && sid[1] || '';
	// disconnect nullifies context
	now.core.on('disconnect', function() {
		console.log('DISCONNECTED');
		model.unset('context');
		// TODO: display reconnect link
	});
	// given sid, server should set now.context which holds the user capabilities
	now.getContext(sid, function(response) {
		console.log('GOT CONTEXT', response, now.context);
		model.set({context: now.context});
		// FIXME: should emit change event, to rerender
	});
	//
	// define `now` client-side functions, they will be called by server
	//
	now.flash = function(s) {
		flash(s);
	};
	now.msg = function(s) {
		now.act(s);
	};
	now.receiveMessage = function(name, message) {
		$("#messages").append("<br>" + name + ": " + message);
	};
};
