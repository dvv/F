'use static';

/*
 *
 * Copyright(c) 2011 Vladimir Dronnikov <dronnikov@gmail.com>
 * MIT Licensed
 *
*/

var Path = require('path');
var Url = require('url');
var Fs = require('fs');
var getMime = require('simple-mime')('application/octet-stream');

//
// serve static content from `root`
//
// options.cacheThreshold:
//   null/undefined - don't cache
//   0 - cache file stat
//   N>0 - cache both file stat and file contents for files of length <= N
//
module.exports = function setup(mount, root, index, options) {

	// setup
	if (!options) options = {};
	var ENOENT = require('constants').ENOENT;
	var mlength = mount.length;

	// N.B. we aggressively cache since we rely on watch/reload
	var statCache = {};
	var fileCache = {};

	// handler
	return function handler(req, res, next) {

		// we only support GET
		if (req.method !== 'GET') return next();

		// check if we are in business
		// FIXME: do we need unescaping?
		var path = unescape(req.uri.pathname).replace(/\.\.+/g, '.');
		if (!path || path.substr(0, mlength) !== mount) return next();
		path = Path.join(root, path.substr(mlength));
		if (path[path.length - 1] === '/') path = path.substr(0, path.length - 1);

		// check if file stats is cached
		if (options.cacheThreshold != null && statCache.hasOwnProperty(path)) {
			onStat(null, statCache[path]);
		// get file stats
		} else {
			Fs.stat(path, function(err, stat) {
				//console.log('STAT!', path, err, stat);
				// do not cache failed stat
				if (options.cacheThreshold != null && !err) {
					statCache[path] = stat;
				}
				onStat(err, stat);
			});
		}

		// file statistics obtained
		function onStat(err, stat) {

			// file not found -> bail out
			if (err) return next(err.errno === ENOENT ? null : err);

			// file is directory -> try to server its index
			if (index && stat.isDirectory()) {
				path = Path.join(path, index);
				Fs.stat(path, onStat);
				return;
			}

			// file isn't a vanilla file -> bail out
			if (!stat.isFile()) return next(err);

			// setup response headers
			var headers = {
				'Date': (new Date()).toUTCString(),
				'Last-Modified': stat.mtime.toUTCString(),
				'Content-Type': getMime(path)
			};
			// no need to serve if browser has the file in its cache
			if (headers['Last-Modified'] === req.headers['if-modified-since']) {
				res.send(304, headers);
				return;
			}

			// handle the Range:, if any
			var start = 0;
			var end = stat.size - 1;
			var code = 200;
			if (req.headers.range) {
				var p = req.headers.range.indexOf('=');
				var parts = req.headers.range.substr(p + 1).split('-');
				if (parts[0].length) {
					start = +parts[0];
					if (parts[1].length) end = +parts[1];
				} else {
					if (parts[1].length) start = end + 1 - +parts[1];
				}
				// range is invalid -> bail out
				if (end < start || start < 0 || end >= stat.size) {
					res.send(416, headers);
					return;
				}
				code = 206;
				headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + stat.size;
			}
			headers['Content-Length'] = end - start + 1;

			// file is empty -> send empty response
			if (stat.size === 0) {
				return res.send(code, headers);
			}

			// stream the file contents to the response
			if (!options.cacheThreshold || options.cacheThreshold < stat.size) {
				var stream = Fs.createReadStream(path, {
					start: start,
					end: end
				});
				stream.once('data', function(chunk) {
					res.writeHead(code, headers);
				});
				stream.pipe(res);
				stream.on('error', next);
			// serve cached contents
			} else {
				// cached?
				if (fileCache.hasOwnProperty(path)) {
					var cached = fileCache[path];
					res.end((start > 0 || end != stat.size-1) ? cached.slice(start, end+1) : cached);
				// read and cache
				} else {
					Fs.readFile(path, function(err, data) {
						if (err) return next(err);
						fileCache[path] = data;
						onStat(null, stat);
					});
				}
			}

		}
	};

};
