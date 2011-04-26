require.paths.unshift '/home/dvv/node_modules'

Sync = require 'sync'
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

users						{ u:* }	# all users
u:UID:
			email			string
			objs			{ o:* }	# own objects
			watch			{ o:* }	# watched objects
			l0				{ u:* }	# users related as access level 0
			l1				{ u:* } # ...
			l2				{ u:* }
			l3				{ u:* }
			l4				{ u:* }

objs						{ o:* }	# all objects
o:UID:
			type			string
			uid				u:*			# owner user ley
			acc				-999-999		# access level
			parent		o:*			# parent object
			children	{ o:* }	# subordinate objects

#######################

ACCESS_LEVELS = [0, 1, 2, 3, 4]

###
load = (schema, keys..., next) ->
	if keys.length is 1
		keys = keys[0]
	#console.log 'LOAD', keys
	db.mget keys, (err, reply) ->
		console.log 'LOADED', arguments
		next? err, reply
	return
###

#
# notify of various events
#
notify = (data) ->
	data.date = new Date()
	db.rpush 'events', JSON.stringify data

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

	constructor: (@id) ->
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
				['sadd', 'users', id]
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
	# create new user
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
		# prune any old relations
		ACCESS_LEVELS.forEach (l) ->
			return if l is level
			cmds.push ['srem', "#{u1}:l#{l}", u2]
			cmds.push ['srem', "#{u2}:l#{l}", u1]
		# add new relation
		cmds.push ['sadd', "#{u1}:l#{level}", u2]
		cmds.push ['sadd', "#{u2}:l#{level}", u1]
		#console.log cmds
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
	# get relation of this user to another user
	# TODO: will be the bottleneck and should be optimized!
	#
	getRelation: (uid, next) ->
		# this user key
		who = "u:#{@id}"
		# target user key
		to = "u:#{uid}"
		# find of which access level is this user to the target user
		async.detect ACCESS_LEVELS
			, (level, cb) ->
				db.sismember "#{to}:l#{level}", who, (err, reply) -> cb reply
			, (relation) ->
				next? null, relation
		return

	#
	# create new object
	#
	addObject: (oid, type, acc, parent, next) ->
		# TODO: via new Obj
		#obj = new Obj oid
		#obj.type = type
		#obj.acc = acc
		id = "o:#{oid}"
		db.multi([
			['setnx', "#{id}:uid", "u:#{@id}"]
			['set', "#{id}:type", type]
			['set', "#{id}:acc", acc]
			['set', "#{id}:parent", "o:#{parent}"] # FIXME: ensure parent exists?
			['sadd', 'objs', id]
			if parent then ['sadd', "o:#{parent}:children", id] else ['dbsize'] # FIXME: noop
			['sadd', "u:#{@id}:objs", id]
		]).exec next
		return

	#
	# get owned objects
	#
	getOwnedObjects: (next) ->
		db.smembers "u:#{@id}:objs", next
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
			return next? err if err
			[owner, access] = reply
			#console.log 'OWNER', owner, user, access
			# get the user to the owner relation
			self.getRelation owner.substring(2), (relation) ->
				# user is of `relation` to the owner
				# N.B. access is granted iff:
				# 1. object level is negative and modulo equals to relation
				# 2. object level is non-negative and less or equal to relation
				### test suite
				for acc in [-2..2]
					for rel in [undefined, 0, 1, 2]
						console.log 'CAN?', acc, rel, (acc + rel is 0 or 0 <= acc <= rel)
				###
				next? null, (access + relation is 0 or 0 <= access <= relation)
		return

	#
	# set access level of an owned object
	#
	setAccessToObj: (oid, acc, next) ->
		self = @
		db.mget "o:#{oid}:uid", "u:#{self.id}", (err, result) ->
			return next? err if err
			if result[0] is result[1]
				db.set "o:#{oid}:acc", acc, (err, reply) ->
					# notify
					notify
						what: 'setAccessToObj'
						who: self.id
						target: oid
						value: acc
					next? null
			else
				next? ERR_FORBIDDEN
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

db.flushall()

aaa = bbb = ccc = null
async.series [
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
		aaa.addObject 'oaaa1', 'post', 0
		aaa.addObject 'oaaa2', 'post', 0
		aaa.addObject 'oaaa3', 'post', 0
		bbb.addObject 'obbb1', 'post', 0
		bbb.addObject 'obbb2', 'post', 0
		bbb.addObject 'obbb3', 'post', 0
		cb()
	(cb) ->
		ccc = new User 'bbb'
		ccc.email = 'ccc@foo.bar'
		ccc.register cb
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

#aaa.load console.log
