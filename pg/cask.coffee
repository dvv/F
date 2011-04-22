require.paths.unshift '/home/dvv/node_modules'

global._ = require 'underscore'
require '../lib/helpers'

msgpack = require 'node-msgpack'

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
		db.set "#{id}",
			#id: id
			email: email
			password: password

db = require('./cask').open './tiny.db'
user = new User

user.register 'aaa', new Date(), false #'foo@bar.baz', 0
s = db.get 'u:aaa'
console.log 'GET', s

#process.exit 0
t1 = new Date
n = 10000
for i in [0...n]
	user.register null, nonce(), nonce()
	undefined
t2 = new Date
console.log 'DONE', n*1000/(t2-t1)

t1 = new Date
n = 10000
for i in [0...n]
	index = db.find (x) -> x.slice(-1) is 'a'
	undefined
t2 = new Date
console.log 'DONE', n*1000/(t2-t1), index.length

#console.log 'INDEX', index
