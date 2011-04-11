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
		// stereo
		watch: ['*.js', 'public', 'views', 'lib'],
		//workers: 2,
		shutdownTimeout: 10000,
		repl: true,
		//
		stackTrace: true
	},
	security: {
		//bypass: true,
		session: {
			session_key: 'sid',			// cookie name
			secret: 'your secret here',	// application secret
			timeout: 24*60*60*1000		// cookie expiry timeout
		},
		mount: '/auth',
		signinURL: 'http://dvv.dyndns.org:3000/auth',
		loginza: true,
		selfSignup: true,
		userTypes: {
			admin: 'Admin',
			affiliate: 'Affiliate'
		},
		recaptcha: {
			pubkey: '6LcYML4SAAAAAMrP_hiwsXJo3FtI21gKiZ1Jun7U',
			privkey: '6LcYML4SAAAAAPby-ghBSDpi97JP1LYI71O-J6kx'
		}
	},
	database: {
		url: ''	// default
	},
	upload: {
		dir: 'upload'
	},
	smtp: {
		user: 'admin',
		pass: 'admin-pass',
		host: 'smtp-host',
		port: 25,
		ssl: false,
		tls: false,
		from: 'admin@localhost.com'
	},
	defaults: {
		nls: 'en',
		currency: 'usd'
	}
};
