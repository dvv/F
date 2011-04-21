global._ = require 'underscore'
require '../lib/helpers'

nonce = -> (Date.now() & 0x7fff).toString(36) + Math.floor(Math.random() * 1e9).toString(36) + Math.floor(Math.random() * 1e9).toString(36) + Math.floor(Math.random() * 1e9).toString(36)

redis = require 'redis'
db = redis.createClient()
db.on 'error', (err) ->
	console.log 'REDISERR', err

ERR_FORBIDDEN = 'forbidden'

nonNull = (obj) ->
	result = {}
	_.each obj, (v, k) ->
		result[k] = v if v?
	if _.isEmpty result
		result = hz: 'fake'
	result

class User
	constructor: () ->
	register0: (uid = nonce(), email, password, callback) ->
		id = "u:#{uid}"
		Next {}, (err, result, next) ->
			db.setnx "#{id}:id", uid, next
		, (err, result, next) ->
			if err or not result then return callback? ERR_FORBIDDEN
			db.hmset "#{id}:cred", {
				email: email
				pass: password
			}, next
		, (err, result, next) ->
			if err or not result then return callback? ERR_FORBIDDEN
			callback?()
	register: (uid = nonce(), email, password, callback) ->
		id = "u:#{uid}"
		db.multi([
			['setnx', "#{id}:id", uid]
			['hmset', "#{id}:cred", {
				email: email
				pass: password
			}]
		]).exec callback
		###
		db.multi().setnx("#{id}:id", uid).hmset("#{id}:cred",
			email: email
			pass: password
		).exec callback
		###

user = new User
user.register null, nonce() + '@foo.bar', null, console.log

#db.hmset 'aaa', {}
