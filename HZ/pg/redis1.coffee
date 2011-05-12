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

class User
	constructor: () ->
	register: (uid = nonce(), email, password, callback) ->
		id = "u:#{uid}"
		db.setnx "#{id}:id", uid, (err, reply) ->
			if reply
				db.multi([
					['hmset', "#{id}:cred", nonNull {
						email: email
						pass: password
					}]
				]).exec callback
			else
				callback ERR_FORBIDDEN

class Obj
	constructor: (props) ->
		@id = nonce()
		for own k, v of props when typeOf v isnt 'function'
			@[k] = v
	save: (callback) ->
		self = @
		id = "o:#{@id}"
		args_mset = ['mset']
		args_sadd = []
		Object.keys(self).forEach (k) ->
			v = self[k]
			return unless v?
			if Array.isArray v
				v.forEach (e) ->
					args_sadd.push ['sadd', "#{id}:#{k}", e]
			else
				args_mset.push "#{id}:#{k}"
				args_mset.push v
		return callback? null unless args_mset.length > 2
		args = [['sadd', 'objs', @id]].concat([args_mset]).concat(args_sadd)
		console.log args
		#return
		db.multi(args).exec callback
	create: (uid = nonce(), email, password, callback) ->
Obj.get = (id) ->
	db.keys "o:#{id}:*", console.log

user = new User
#user.register null, null, null, console.log
#user.register null, null, null, console.log
#user.register null, nonce() + '@foo.bar', null, console.log

user.register 'bbb', 'bbb@bar.baz', 'secret0', console.log
#user.register 'bbb', 'bbb1@bar.baz', '1secret', console.log

#db.hmset 'aaa', {a: 1}

obj = new Obj
	id: 'obj'
	uid: 'bbb'
	foo: 'bar'
	bar: 'baz'
	ref: undefined
	refs: [1,true,null,false]
obj.save()

#Obj.get 'obj'

r2j = require 'redis2json'
r2j.client = db

vars =
	id: 'obj'

map =
	id: ':{id}'
	foo: 'o:{id}:foo'
	$uid: 'o:{id}:uid',
	user:
		id: 'u:{uid}:id'
		email: 'u:{uid}:cred'
	$$refs:
		variable: 'rid', cmd: 'smembers', key: 'o:{id}:refs', args: []
	refs: [':{rid}']
	sss: 'o:{id}:refs'

#r2j.debugMode = true


r2j.load map, vars, (err, result) ->
	console.log 'LOADED', err, result

t1 = new Date
n = 10000
iter = (i) ->
	#console.log i
	r2j.load map, vars, (err, result) ->
		if --i
			iter i
		else
			t2 = new Date
			console.log 'DONE', n*1000/(t2-t1), result
iter n


###
id = 'obj'
db.multi([
	['mget', 'o:#{id}:foo', 'o:#{id}:uid']
]).exec console.log
###
