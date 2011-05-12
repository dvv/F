'use strict';

var Proxy = require('node-proxy');

var obj = {
	a: 1,
	b: 2,
	c: 3
};

function proxify(obj) { return {
	get: function(recv, name) {
		return obj[name];
	},
	set: function(recv, name, value) {
		obj[name] = value;
		return value;
	},
	has: function(name) {
		return name in obj;
	},
	hasOwn: function(name) {
		return Object.prototype.hasOwnProperty.call(obj, name);
	},
	enumerate: function() {
		var r = [];
		for (var i in obj) r.push(i);
		return r;
	},
	keys: function() {
		return Object.keys(obj);
	},
	delete: function(name) {
		return delete obj[name];
	},
	fix: function() {
		return undefined;
	},
	length1: function() {
		return Object.keys(obj).length;
	}
};}

var proxy = Proxy.create(proxify(obj), Array.prototype);
console.log(proxy, proxy.length1, proxy.filter(function(v, k){console.log('F', k, v);return v;}));
