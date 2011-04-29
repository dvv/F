'use strict';

module.exports = {
	server: {
		port: 3000,
		ssl: {
			port: 4000,
			key: 'key.pem',
			cert: 'cert.pem'
		},
		'static': {
			dir: 'public',
			//cache: 32768 // set to limit the size of cacheable file
		},
	},
	security: {
		bypass: true,
		session: {
			session_key: 'sid',			// cookie name
			secret: 'your secret here',	// application secret
			timeout: 24*60*60*1000		// cookie expiry timeout
		},
	},
	database: {
		url: ''	// default
	},
	upload: {
		dir: 'upload'
	},
	defaults: {
		nls: 'en',
		currency: 'usd'
	}
};
