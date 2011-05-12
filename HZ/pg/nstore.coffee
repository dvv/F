require.paths.unshift '/home/dvv/node_modules'

global._ = require 'underscore'
require '../lib/helpers'

nonce = -> (Date.now() & 0x7fff).toString(36) + Math.floor(Math.random() * 1e9).toString(36) + Math.floor(Math.random() * 1e9).toString(36) + Math.floor(Math.random() * 1e9).toString(36)

ERR_FORBIDDEN = 'forbidden'

db = undefined

nonNull = (obj) ->
	result = {}
	_.each obj, (v, k) ->
		result[k] = v if v?
	result

class User
	constructor: () ->
	register: (uid = nonce(), email, password, callback) ->
		id = "u:#{uid}"
		db.save "#{id}",
			#id: id
			email: email
			password: password
		, (err, reply) ->
			callback? err, reply
			#console.log 'SET', arguments

require('nstore').new './nstore.db', (err, result) ->
	db = result
	console.log err, db
	user = new User

	user.register null, undefined, 0 #'foo@bar.baz', 0
	t1 = new Date
	n = 0
	iter = (i) ->
		#console.log i
		user.register null, nonce(), nonce(), (err, result) ->
			#console.log i, arguments
			if --i
				iter i
			else
				t2 = new Date
				console.log 'DONE', n*1000/(t2-t1), result
	iter n

	###
	db.find(
		$or: [ 
			email:
				$lte: 'a'
			email:
				$gte: 'a'
		]
	).desc('password').select('email').limit(3) (err, result) ->
		console.log 'RESULTS:', err, result
	###
