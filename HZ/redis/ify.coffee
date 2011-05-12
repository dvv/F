require.paths.unshift '/home/dvv/node_modules'

global._ = require 'underscore'
async = require 'async'
redisify = require 'redisify'
#require '../lib/helpers'

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
	result

class Redis
	db: redisify db
Redis::db.log = console.log

class User extends Redis
	constructor: (id) ->
		# N.B. we sanitize id to not contain ':'
		if id
			@id = String(id).replace ':', '-'
		else
			@id = nonce()
		@key = "u:#{@id}"

user = new User '42'

db.flushall()
user.db('zadd', '', Date.now(), user.key)
#.db 'set', 'name', 'dvv', (val) ->
