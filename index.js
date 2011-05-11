'use strict';

global._ = require('underscore');
require('underscore-data');
require('./lib/helpers');

module.exports = {
	stack: require('./middleware'),
	email: require('./lib/email'),
	wscomm: require('./lib/wscomm'),
	model: require('./lib/model'),
};
