require.paths.unshift '/home/dvv/node_modules'

global._ = require 'underscore'
async = require 'async'
require '../lib/helpers'

nonce = -> (Date.now() & 0x7fff).toString(36) + Math.floor(Math.random() * 1e9).toString(36) + Math.floor(Math.random() * 1e9).toString(36) + Math.floor(Math.random() * 1e9).toString(36)

redis = require 'redis'
db = redis.createClient()
db.on 'error', (err) ->
	console.log 'REDISERR', err
redis2json = require 'redis2json'
redis2json.client = db

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

###
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
###

###

users						{ u:* }	# all users
u:UID:
			email			string
			obyt			{ o:*, type }	# own objects by type
			obyd			{ o:*, date }	# own objects by date
			obya			{ o:*, acc }	# own objects by access level
			watch			{ o:* }	# watched objects
			contacts	{ u:*, level }	# related users with levels

obyt						{ o:*, type }	# all objects by type
obyd						{ o:*, date }	# all objects by date
obya						{ o:*, acc }	# all objects by access level
o:UID:
			uid				u:*			# owner user key
			parent		o:*			# parent object
			children	{ o:*, date }	# subordinate objects by date
			acc				-999-999		# access level

#######################

#
# notify of various events
#
notify = (data) ->
	data.date = new Date()
	db.rpush 'events', JSON.stringify data
	console.error JSON.stringify data
	# TODO: emit

#
# hydrate keys into objects
#
load = (schema, keys..., next) ->
	if keys.length is 1
		keys = keys[0]
	#console.log 'LOAD', keys
	async.map keys, (key, cb) ->
		redis2json.load schema, {id: key}, cb
	, next
	return

#
# Object class
#
class Obj

	constructor: (T, @id) ->

	load: (next) ->
		redis2json.load object, {id: @id}, (err, result) ->
			console.log 'LOADED', err, result
			next? err, result

ObjSchema =
	id: ':{id}'
	$uid: 'o:{id}:uid',
	type: 'o:{id}:type'
	user:
		id: ':{uid}'
		#email: 'u:{uid}:email'
	#$$refs:
	#	variable: 'rid', cmd: 'smembers', key: 'o:{id}:refs', args: []
	#refs: [':{rid}']
	#sss: 'o:{id}:refs'


#
# User class
#
class User

	constructor: (id) ->
		# N.B. we sanitize id to not contain ':'
		if id
			@id = id.replace ':', '-'
		else
			@id = nonce()

	#
	# load this user
	#
	load: (next) ->
		load
			oops: 'u:{id}:email'
		, [@id], (err, result) -> next? err, result[0] or {}

	#
	# create new user
	#
	register: (next) ->
		self = @
		id = "u:#{self.id}"
		db.sismember 'users', id, (err, exists) ->
			return next? ERR_FORBIDDEN if exists
			cmds = [
				# append user to user list
				['zadd', 'users', Date.now(), id]
				# store user data
				# FIXME: shouldn't it be spread by keys?
				['hmset', "#{id}", self]
			]
			db.multi(cmds).exec (err, reply) ->
				return next? err if err
				# notify
				notify
					what: 'addUser'
					who: self.id
					target: self.id
				next? null
		return

	#
	# securely set this user password
	# TODO: sha1sum, notify
	#
	setPassword: (newPassword, confirmPassword, next) ->
		self = @
		id = "u:#{self.id}"
		db.mset "#{id}:salt", salt, "#{id}:passwd", passwd, (err, reply) ->
			next? err, reply

	#
	# set relation of this user to another user
	# TODO: this should be in two steps, because we require target user confirmation
	#
	setRelation: (uid, level, next) ->
		self = @
		u1 = "u:#{self.id}"
		u2 = "u:#{uid}"
		cmds = []
		# add relations
		cmds.push ['zadd', "#{u1}:contacts", level, u2]
		cmds.push ['zadd', "#{u2}:contacts", level, u1]
		db.multi(cmds).exec (err, reply) ->
			return next? err if err
			# notify both sides
			notify
				what: 'setRelation'
				who: self.id
				target: uid
				value: level
			notify
				what: 'setRelation'
				who: uid
				target: self.id
				value: level
			next? null
		return

	#
	# remove relation of this user to another user
	# TODO: this should be in two steps, because we require target user confirmation
	#
	unsetRelation: (uid, next) ->
		self = @
		u1 = "u:#{self.id}"
		u2 = "u:#{uid}"
		cmds = []
		# remove relations
		cmds.push ['zrem', "#{u1}:contacts", u2]
		cmds.push ['zrem', "#{u2}:contacts", u1]
		db.multi(cmds).exec (err, reply) ->
			return next? err if err
			# notify both sides
			notify
				what: 'unsetRelation'
				who: self.id
				target: uid
			notify
				what: 'unsetRelation'
				who: uid
				target: self.id
			next? null
		return

	#
	# get relation of this user to another user
	#
	getRelation: (uid, next) ->
		db.zscore "u:#{uid}:contacts", "u:#{@id}", next
		return

	#
	# create new object
	#
	addObject: (oid, type, acc, parent, next) ->
		self = @
		# TODO: via new Obj
		#obj = new Obj oid
		#obj.type = type
		#obj.acc = acc
		id = "o:#{oid}"
		date = Date.now()
		db.multi([
			['setnx', "#{id}:uid", "u:#{self.id}"]
			if parent then ['set', "#{id}:parent", "o:#{parent}"] else ['dbsize'] # FIXME: ensure parent exists?
			if parent then ['zadd', "o:#{parent}:children", date, id] else ['dbsize']
			['zadd', 'obyt', type, id]
			['zadd', 'obyd', date, id]
			['zadd', 'obya', acc, id]
			['zadd', "u:#{self.id}:obyt", type, id]
			['zadd', "u:#{self.id}:obyd", date, id]
			['zadd', "u:#{self.id}:obya", acc, id]
		]).exec (err, reply) ->
			return next? err if err
			# notify
			notify
				what: 'addObject'
				who: self.id
				target: oid
				parent: parent
			next? null
		return

	#
	# remove an owned object
	#
	removeObject: (oid, next) ->
		self = @
		id = "o:#{oid}"
		db.get "#{id}:parent", (err, parent) ->
			db.multi([
				if parent then ['zrem', "o:#{parent}:children", id] else ['dbsize']
				['zrem', "u:#{self.id}:obyt", id]
				['zrem', "u:#{self.id}:obyd", id]
				['zrem', "u:#{self.id}:obya", id]
				['zrem', 'obyt', id]
				['zrem', 'obyd', id]
				['zrem', 'obya', id]
				['del', "#{id}:parent", "#{id}:uid"]
			]).exec (err, reply) ->
				return next? err if err
				# notify
				notify
					what: 'removeObject'
					who: self.id
					target: oid
					parent: parent
				next? null
		return

	#
	# set access level of an owned object
	#
	setObjectAccess: (oid, access, next) ->
		self = @
		id = "o:#{oid}"
		db.mget "o:#{oid}:uid", "u:#{self.id}", (err, result) ->
			return next? err if err
			if result[0] is result[1]
				db.multi([
					['zadd', 'obya', access, id]
					['zadd', "u:#{self.id}:obya", access, id]
				]).exec (err, reply) ->
					# notify
					notify
						what: 'setObjectAccess'
						who: self.id
						target: oid
						value: access
					next? null
			else
				next? ERR_FORBIDDEN
		return

	#
	# get user owned objects from key `key` honoring `privacy` access level
	#
	getObjects: (key, privacy, options = {}, next) ->
		# TODO: limit start, end
		if privacy < 0
			min = max = -privacy
		else
			min = 0
			max = privacy
		if options.schema
			db.zrangebyscore "u:#{@id}:#{key}", min, max, (err, keys) ->
				load options.schema, keys, next
		else
			db.zrangebyscore "u:#{@id}:#{key}", min, max, next
		return

	#
	# determine is object is accessible to this user
	#
	canAccessObject: (oid, next) ->
		self = @
		# object key
		id = "o:#{oid}"
		# get the object owner
		db.mget "o:#{oid}:uid", "o:#{oid}:acc", (err, reply) ->
			return next? null, false if err
			[owner, access] = reply
			#console.log 'OWNER', owner, user, access
			# get the user to the owner relation
			self.getRelation owner.substring(2), (relation) ->
				# user is of `relation` to the owner
				next? null, (access + relation is 0 or 0 <= access <= relation)
		return

	#
	# subscribe to an object
	#
	subscribeToObject: (oid, next) ->
		self = @
		self.canAccessObject oid, (err, can) ->
			if can
				db.sadd "u:#{self.id}:watch", "o:#{oid}", (err, reply) ->
					return next? err if err
					# notify
					notify
						what: 'unsubscribeFromObject'
						who: self.id
						target: oid
					next? null
			else
				next? err, false
		return

	#
	# unsubscribe from an object
	#
	unsubscribeFromObject: (oid, next) ->
		self = @
		db.srem "u:#{self.id}:watch", "o:#{oid}", (err, reply) ->
			return next? err if err
			# notify
			notify
				what: 'unsubscribeFromObject'
				who: self.id
				target: oid
			next? null
		return

	#
	# subscribe to an user activity
	#
	follow: (uid, next) ->
		self = @
		db.sadd "u:#{self.id}:watch", "u:#{uid}", (err, reply) ->
			return next? err if err
			# notify
			notify
				what: 'follow'
				who: self.id
				target: uid
			next? null
		return

	#
	# unsubscribe from an user activity
	#
	unfollow: (uid, next) ->
		db.srem "u:#{@id}:watch", "u:#{uid}", (err, reply) ->
			return next? err if err
			# notify
			notify
				what: 'unfollow'
				who: self.id
				target: uid
			next? null
		return

	#
	# get the set of watched objects
	# TODO: introduce slice of the latest objects
	#
	getWatchedObjects: (hydrate, next) ->
		db.smembers "u:#{@id}:watch", (err, reply) -> next? err, reply
		return

#######################

aaa = bbb = ccc = null
###
async.series [
	(cb) ->
		db.flushall cb
	(cb) ->
		aaa = new User 'aaa'
		aaa.email = 'aaa@foo.bar'
		aaa.foo = 'bar'
		aaa.register cb
	(cb) ->
		bbb = new User 'bbb'
		bbb.email = 'bbb@foo.bar'
		bbb.bar = 'baz'
		bbb.register cb
	(cb) ->
		aaa.addObject 'oaaa1', 1, 0
		aaa.addObject 'oaaa2', 2, 0
		aaa.addObject 'oaaa3', 3, 0
		bbb.addObject 'obbb1', 1, 0
		bbb.addObject 'obbb2', 2, 0
		bbb.addObject 'obbb3', 3, 0
		cb()
	(cb) ->
		aaa.setRelation 'bbb', 1, cb
	(cb) ->
		aaa.getRelation 'bbb', cb
	(cb) ->
		aaa.getObjects 'obyt', -2, {}, cb
	(cb) ->
		bbb.getObjects 'obyt', 2, {}, cb
	(cb) ->
		ccc = new User 'bbb'
		ccc.email = 'ccc@foo.bar'
		ccc.register cb
], (err, results) ->
	console.log arguments
###

async.series [
	(cb) ->
		db.flushall cb
	(cb) ->
		aaa = new User 'aaa'
		aaa.email = 'aaa@foo.bar'
		aaa.foo = 'bar'
		aaa.register cb
	(cb) ->
		aaa.addObject 'oaaa1', 1, 0
		aaa.addObject 'oaaa2', 2, 0
		aaa.addObject 'oaaa3', 3, 0
		cb()
	(cb) ->
		aaa.getObjects 'obyt', -2, {}, cb
	(cb) ->
		aaa.getObjects 'obya', 0, {}, cb
	(cb) ->
		aaa.getObjects 'obyd', Date.now(), {}, cb
	(cb) ->
		aaa.removeObject 'oaaa1', cb
	(cb) ->
		aaa.getObjects 'obyt', -2, {schema: ObjSchema}, (err, result) ->
			console.log 'OBJ', result
			cb()
	(cb) ->
		aaa.getObjects 'obya', 0, {}, cb
	(cb) ->
		aaa.getObjects 'obyd', Date.now(), {}, cb
], (err, results) ->
	console.log arguments

if false
	n = 10000
	t1 = new Date
	iter = (i) ->
		if i--
			#bbb.canAccessObject 'oaaa1', () ->
			#	iter i
			aaa.getOwnedObjects (err, keys) ->
				load ObjSchema, keys, (err, result) ->
					iter i
		else
			t2 = new Date
			console.log 'DONE', 1000*n/(t2-t1)
	iter n

###
aaa.setRelation 'bbb', 1, () ->
	async.parallel
		a2b: (cb) -> aaa.getRelation 'bbb', cb
		b2a: (cb) -> bbb.getRelation 'aaa', cb
	, () -> console.log arguments

aaa.getOwnedObjects (err, keys) ->
	load ObjSchema, keys, (err, result) ->
		console.log 'OBJECTS', err, result
###

