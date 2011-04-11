'use strict';

/*
 *
 * Copyright(c) 2011 Vladimir Dronnikov <dronnikov@gmail.com>
 * MIT Licensed
 *
*/

//
// simplified version of creationix/Step
//
var __slice = Array.prototype.slice;
global.Next = function Next(context /*, steps*/) {
	var steps = __slice.call(arguments, 1);
	var next = function(err, result) {
		var fn = steps.shift();
		if (fn) {
			try {
				fn.call(context, err, result, next);
			} catch (err) {
				next(err);
			}
		} else {
			if (err) {
				console.error(err.stack || err.message || err);
				throw err;
			}
		}
	};
	next();
};
Next.nop = function() {};

//
// typeof quirks
//
global.typeOf = function typeOf(value) {
	var s = typeof value;
	if (s === 'object') {
		if (value) {
			if (value instanceof Array) {
				s = 'array';
			}
		} else {
			s = 'null';
		}
	// RegExp in V8 is function!
	} else if (s === 'function' && value.prototype.match) {
		s = 'object';
	}
	return s;
}

// Extend a given object with all the properties in passed-in object(s).
// From underscore.js (http://documentcloud.github.com/underscore/)
global.extend = function extend(obj) {
	__slice.call(arguments).forEach(function(source) {
		for (var prop in source) obj[prop] = source[prop];
	});
	return obj;
};

//
// naive deep copy
//
global.deepCopy = function deepCopy(source, target, overwrite){
	var k, v;
	for (k in source) if (source.hasOwnProperty(k)) {
		v = source[k];
		if (typeOf(v) === 'object' && typeOf(target[k]) === 'object') {
			deepCopy(v, target[k], overwrite);
		} else if (overwrite || !target.hasOwnProperty(k)) {
			target[k] = v;
		}
	}
	return target;
}

//
// thanks senchalabs/connect/utils
//
// before data is read from request, every async functions must be wrapped as follows:
//
// var standby = pause(req);
// doAsync(..., function(err, result) {
//   next();
//   standby.resume();
// });
//
global.pause = function(obj) {
	var onData;
	var onEnd;
	var events = [];

	// buffer data
	obj.on('data', onData = function(data, encoding){
		events.push(['data', data, encoding]);
	});

	// buffer end
	obj.on('end', onEnd = function(data, encoding){
		events.push(['end', data, encoding]);
	});

	return {
		end: function(){
			obj.removeListener('data', onData);
			obj.removeListener('end', onEnd);
		},
		resume: function(){
			this.end();
			for (var i = 0, len = events.length; i < len; ++i) {
				obj.emit.apply(obj, events[i]);
			}
		}
	};
};
