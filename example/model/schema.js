'use strict';

module.exports = function(db) {

//
// generic testing entity
//
return {
	type: 'object',
	additionalProperties: false,
	properties: {
		id: {
			type: 'string',
			pattern: '^[a-zA-Z0-9_]+$',
			veto: {
				update: true
			}
		},
		name: {
			type: 'string'
		},
		localName: {
			type: 'string',
			optional: true,
			veto: {
				query: true
			}
		}
	}
};

};
