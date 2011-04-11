'use strict';

/*
 *
 * Copyright(c) 2011 Vladimir Dronnikov <dronnikov@gmail.com>
 * MIT Licensed
 *
*/

var Http = require('http');
var Wget = require('../lib/wget');
var Qs = require('querystring');

// validator URL w/o protocol portion
var RECAPTCHA_API = 'www.google.com/recaptcha/api/';

//
// check for captcha validity
//
// @options {Object} {
//   pubkey: recaptcha-pubkey,
//   privkey: recaptcha-privkey,
//   strict: whether to stop the request (true) or just void the body,
//   theme: 'clean',
//   lang: 'en',
// }
//
module.exports = function setup(options) {

	// setup
	function getProtocol(stream) {
		return stream.connection.encrypted ? 'https://' : 'http://';
	}

	//
	// augment ServerResponse with captcha widget generation helper
	//
	Http.ServerResponse.prototype.captcha = function() {
		var protocol = getProtocol(this);
		return '' +
			'<script type="text/javascript">var RecaptchaOptions = {theme: "' + (options.theme || 'clean') + '", lang: "' + (options.lang || 'en')  + '"};</script>' +
			'<script type="text/javascript" src="' + protocol + RECAPTCHA_API + 'challenge?k=' + options.pubkey + '"></script>' +
			'<noscript><iframe src="' + protocol + RECAPTCHA_API + 'noscript?k=' + options.pubkey + '" height="300" width="500" frameborder="0"></iframe><br/>' +
			'<textarea name="recaptcha_challenge_field" rows="3" cols="40"></textarea>' +
			'<input type="hidden" name="recaptcha_response_field" value="manual_challenge" /></noscript>';
	};

	// handler
	return function handler(req, res, next) {

		// for GET requests we augment `res` with captcha widget helper
		if (req.method === 'GET') {
			//res.
		}

		// check we are in business
		if (req.method !== 'POST') return next();
		var body = req.body;
		if (!body.recaptcha_challenge_field) return next();

		// stringify validation params
		var qry = Qs.stringify({
			privatekey: options.privkey,
			remoteip: req.socket.remoteAddress,
			challenge: body.recaptcha_challenge_field,
			response: body.recaptcha_response_field
		});

		// validate the input
		// N.B. should obey protocol used for this request
		var protocol = getProtocol(req);
		//
		// FIXME: problem with ISA proxy for HTTPS -- returns just <html></html>
		protocol = 'http://';
		//
		Wget.post(protocol + RECAPTCHA_API + 'verify', qry, function(err, result) {
			// bot?
			if (err || result !== 'true\nsuccess') {
				//console.log('CAPTCHA FAILED', arguments);
				//
				// N.B. in case of result is one of
				//'false\nverify-params-incorrect'
				//'false\nincorrect-captcha-sol'
				// we can append '&error='+result.split('\n')[1] to captcha renderer. ajax case?
				//
				// strict mode?
				if (options.strict) {
					// respond failure
					return res.send(403);
				// soft mode?
				} else {
					// void request body
					req.body = {};
				}
			// human?
			} else {
				// prune recaptcha fields
				delete body.recaptcha_challenge_field;
				delete body.recaptcha_response_field;
			}
			// proceed
			next();
		});

	};

};
