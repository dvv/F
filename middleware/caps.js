'use strict';

/*
 *
 * Copyright(c) 2011 Vladimir Dronnikov <dronnikov@gmail.com>
 * MIT Licensed
 *
*/

//
// fill req.context with capability of the current user
//
module.exports = function setup(getCapability) {

	// setup

	// handler
	return function handler(req, res, next) {

		// N.B. map all falsy user ids to uid=''
		var standby = pause(req);
		getCapability(req.session && req.session.uid || '', function(err, context) {
			req.context = context || {};
			next();
			standby.resume();
		});

	};

};
