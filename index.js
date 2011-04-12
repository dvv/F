global._ = require('underscore');
require('underscore-data');
require('./lib/helpers');

module.exports = {
	stack: require('./middleware'),
	email: require('./lib/email'),
	now: require('./lib/now'),
	model: require('./lib/model'),
};
