'use strict';

/*
 *
 * Copyright(c) 2011 Vladimir Dronnikov <dronnikov@gmail.com>
 * MIT Licensed
 *
*/

//
// simple mailer
//
var Mailer = require('emailjs');

module.exports = function(config) { return {

	mail: function(to, subj, body, callback) {
		var msg = Mailer.message.create({
			text: body,
			from: config.from,
			to: to,
			subject: subj
		});
		var server = Mailer.server.connect(config);
		server.send(msg, callback);
	}

}};
