require.paths.unshift '/home/dvv/node_modules'

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
	result

###
t1 = new Date
n = 10000
for i in [0...n]
	db.set nonce(), JSON.stringify(email: nonce(), date: new Date())
t2 = new Date
console.log 'WRITTEN', n*1000/(t2-t1)
###

###
db.set 'a', JSON.stringify({a:1,b:'2'}), console.log
db.set 'b', JSON.stringify({b:'2',c:false}), console.log
db.mget ['a','b'], (err, reply) ->
	console.log 'MGET', reply.map (x) -> JSON.parse x
###

#process.exit 0

index = {}
t1 = new Date
n = 100
iter = (i) ->
	if i--
		db.keys '*aa', (err, keys) ->
			db.mget keys, (err, result) ->
				#console.log arguments
				index = result.map (x) -> JSON.parse x if x
				iter i
	else
		t2 = new Date
		console.log 'READ', n*1000/(t2-t1) #, index
iter n
