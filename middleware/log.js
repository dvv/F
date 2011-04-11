'use strict';

/*
 *
 * Copyright(c) 2011 Vladimir Dronnikov <dronnikov@gmail.com>
 * MIT Licensed
 *
*/

//
// log request and corresponding response
//
module.exports = function setup(options) {

	// setup
	if (!options) options = {};

	// handler
	return function(req, res, next) {
		var end = res.end;
		res.end = function() {
			console.log(('REQUEST ' + req.method + ' ' + req.url + ' ') + JSON.stringify(req.body) + ' -- RESPONSE ' + JSON.stringify(arguments));
			res.end = end;
			res.end.apply(this, arguments);
		};
		next();
	};

};
