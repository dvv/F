'use strict';

module.exports = function(db) {

//
// expose entities
//
return {
	Foo: require('./schema')(db),
};

};
