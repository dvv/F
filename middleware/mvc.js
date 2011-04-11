'use strict';

/*
 *
 * Copyright(c) 2011 Vladimir Dronnikov <dronnikov@gmail.com>
 * MIT Licensed
 *
*/

//
// thanks creationix/creationix/controller
//

var Url = require('url');
var Fs = require('fs');
var Path = require('path');

//
// MVC style controller routing
//
module.exports = function setup(root, controllerFolder) {

	// setup

	// Normalize mount points to always end in /
	if (root[root.length - 1] !== '/') { root += '/'; }
	// Normalize controller folder so require understands it
	controllerFolder = Fs.realpathSync(controllerFolder);

	// Load the controllers at startup
	var controllers = {};
	Fs.readdirSync(controllerFolder).forEach(function (name) {
		var ext = Path.extname(name);
		if (ext === '.js') {
			controllers[Path.basename(name, '.js')] = require(Path.join(controllerFolder, name));
		}
	});

	// handler
	return function handler(req, res, next) {
		// parse out pathname if it's not there already (other middleware may have done it already)
		//if (!req.hasOwnProperty('uri')) { req.uri = Url.parse(req.url); }

		// Mount relative to the given root
		var path = req.uri.pathname;
		if (path.substr(0, root.length) !== root) { return next(); }

		// Get the requested controller and method
		var parts = path.substr(root.length).split('/').map(function(p){return decodeURIComponent(p)});
		if (parts[parts.length - 1] === '') { parts.pop(); } // Trailing slash is noop
		if (parts.length === 0) { parts[0] = 'index'; } // Default module to "index"
		if (parts.length === 1) { parts[1] = 'index'; } // Default method to "index"

		// Find the controller
		var controller = parts.shift();
		if (!controllers.hasOwnProperty(controller)) { return next(); }
		controller = controllers[controller];

		// Find the method
		var method = parts.shift();
		if (!controller.hasOwnProperty(method)) { return next(); }

		// Call the controller's method
		var args = [req, res, next];
		args.push.apply(args, parts);
		controller[method].apply(controller, args);
	};

};
