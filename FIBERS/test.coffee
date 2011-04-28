global._ = require 'underscore'
S = require 'sync'

redis = require 'redis'
db = redis.createClient()
db.on 'error', (err) ->
	console.log 'REDISERR', err

Crypto = require 'crypto'
sha1 = (data, key) ->
	hmac = Crypto.createHmac 'sha1', ''
	hmac.update data
	hmac.digest 'hex'

nonce = -> (Date.now() & 0x7fff).toString(36) + Math.floor(Math.random() * 1e9).toString(36) + Math.floor(Math.random() * 1e9).toString(36) + Math.floor(Math.random() * 1e9).toString(36)

sanitize = (id) ->
	# N.B. we sanitize id to not contain '/'
	id = id.replace('/', '.') if id
	id

exec = (args) ->
	if exec.log then console.log 'ARGS', args
	m = db.multi args
	result = m.exec.sync m
	if exec.log then console.log 'RESULT', result
	result

exec.log = true

class Obj

	type: @type = 0

	constructor: (id, @data = {}) ->
		id = sanitize id
		id = nonce() unless id
		@id = "#{@type}/#{id}"

	save: () ->
		if db.setnx.sync db, @id, JSON.stringify @data
			date = Date.now()
			args = []
			args.push ['zadd', 'index', date, @id]
			args.push ['set', "#{@id}:ctime", date]
			args.push ['zadd', 'typed', @type, @id]
			args.push ['set', "#{@id}:type", @type]
			exec args
		else
			undefined

	@load: (id) ->
		reply = db.mget.sync db, "#{id}", "#{id}:user", "#{id}:ctime"
		{
			data: if reply[0] then JSON.parse reply[0] else {}
			user: reply[1]
			ctime: reply[2]
			id: id
		}

	tag: (tags) ->
		args = []
		_.each tags, (tag) ->
			id = sha1 tag
			args.push.apply args, [
				['set', "tag:#{id}", tag]
				['sadd', "#{@id}:tags", id]
				['sadd', "tags:#{id}", @id]
			]
		, @
		exec args

	untag: (tags) ->
		args = []
		_.each tags, (tag) ->
			id = sha1 tag
			args.push.apply args, [
				['srem', "tags:#{id}", @id]
				['srem', "#{@id}:tags", id]
				['del', "tag:#{id}"]
			]
		, @
		exec args

	tags: () ->
		tags = db.smembers.sync db, "#{@id}:tags"
		tags = db.mget.sync db, _.map tags, (tag) -> "tag:#{tag}"

	# get ids of users which have voted for this object
	votes: (min = 0, max = '+inf') ->
		db.zrangebyscore.sync db, "#{@id}:votes", min, max #, 'withscores'

	# get ids of users which liked this object
	likes: () ->
		db.smembers.sync db, "#{@id}:likes"

	# get this object 'likes' counter
	rating: (min = 0, max = '+inf') ->
		###
		cached = db.get.sync db, "#{@id}:rating"
		unless cached
			#cached = db.zinterstore.sync db, "#{@id}:rating", 1, "#{@id}:votes", 'aggregate'
			cached = db.zrangebyscore.sync db, "#{@id}:votes", min, max, 'withscores'
			# TODO: sum every second element, divide the sum over the count
			db.set.sync db, "#{@id}:rating", cached
		cached
		###
		db.scard "#{@id}:likes"

	owner: () ->
		db.get.sync db, "#{@id}:user"

	@findByAllTags: (tags) ->
		db.sinter.sync db, _.map tags, (tag) -> "tags:#{sha1(tag)}"

	@findByAnyTag: (tags) ->
		db.sunion.sync db, _.map tags, (tag) -> "tags:#{sha1(tag)}"

	@findByDate: (date1, date2 = date1) ->
		db.zrangebyscore.sync db, 'index', date1, date2

	@findByType: (type1, type2 = type1) ->
		db.zrangebyscore.sync db, 'typed', type1, type2

	@filter: (date, type, access, tags, options = {}) ->
		sets = []
		if date?
			sets.push "obd:#{date}"
		if type?
			sets.push "obt:#{type}"
		if access?
			sets.push "oba:#{access}"
		if Array.isArray tags
			sets.push.apply sets, _.map tags, (tag) -> "tags:#{sha1(tag)}"
		options.op ?= 'and'
		console.log 'FILTER', sets
		db[if options.op is 'and' then 'sinter' else 'sunion'].sync db, sets

class User extends Obj

	type: @type = 9

	constructor: (id, data) ->
		super id, data

	# vote for object `oid` with value `value`
	vote: (oid, value) ->
		if value > 0
			exec [
				['zadd', "#{oid}:votes", value, @id]
				['zadd', "#{id}:votes", value, oid]
			]

	# revoke this user's vote for object `oid`
	unvote: (oid) ->
		exec [
			['zrem', "#{id}:votes", oid]
			['zrem', "#{oid}:votes", @id]
		]

	# get ids of objects for which this user has voted
	votes: (min = 0, max = '+inf') ->
		db.zrangebyscore.sync db, "#{@id}:votes", min, max #, 'withscores'

	# 'like' the object `oid`
	like: (oid) ->
		exec [
			['sadd', "#{oid}:likes", @id]
			['sadd', "#{@id}:likes", oid]
		]

	# 'unlike' the object `oid`
	unlike: (oid) ->
		exec [
			['srem', "#{@id}:likes", oid]
			['srem', "#{oid}:likes", @id]
		]

	# get ids of object this user likes
	likes: () ->
		db.smembers.sync db, "#{id}:likes"

	# follow user `uid`
	follow: (uid) ->
		exec [
			['sadd', "#{@id}:follows", uid]
			['sadd', "#{uid}:followers", @id]
		]

	# stop following user `uid`
	unfollow: (uid) ->
		exec [
			['srem', "#{@id}:follows", uid]
			['srem', "#{uid}:followers", @id]
		]

	# get ids of users this user follows
	follows: () ->
		db.smembers.sync db, "#{@id}:follows"

	# get ids of users following this user
	followers: () ->
		db.smembers.sync db, "#{@id}:followers"

	# get ids of users which both follow this user and this user follows
	friends: () ->
		db.sinter.sync db, "#{@id}:follows", "#{@id}:followers"

	# publish an object
	publish: (obj, access) ->
		return undefined unless obj.save()
		oid = obj.id
		exec [
			# set object owner
			['set', "#{oid}:user", @id]
			['sadd', "#{@id}:index", oid]
			# add to this user's timeline
			['lpush', "#{@id}:timeline", oid]
			# add to global timeline
			['lpush', 'timeline', oid]
			# set access level
			['zadd', 'access', access, oid]
			['zadd', "#{@id}:access", access, oid]
		]
		# async-ly notify followers
		# TODO: filter by access, so that not all followers should receive oid
		db.lpush "#{f}:timeline", oid for f in @followers()

	# get ids of this user owned objects
	objects: () ->
		db.smembers.sync db, "#{@id}:index"

	# get this user timeline
	timeline: () ->
		oids = db.lrange.sync db, "#{@id}:timeline", 0, 9
		objs = _.map oids, (oid) -> Obj.load oid

	# create an owned object
	createObj: (id) ->
		obj = new Obj id, @id

	createFoo: (id) ->
		obj = new Foo id, @id

	# create a subordinate user
	createUser: (id) ->
		obj = new User id, @id

class Foo extends Obj

	type: @type = 1

###
S () ->

	db.flushall.sync db

	user1 = new User 'aaa'
	user1.save()

	user2 = new User 'bbb'
	user2.save()

	user3 = user1.createUser 'ccc'
	user3.save()

	user3.vote user2.id, 5
	user3.tag ['mysub', 'user3']

	#console.log Obj.findByAnyTag ['mysub']
	#console.log Obj.filter null, 9, null, null #['mysub']
	console.log Obj.filter null, 9, null, null #['mysub']
###

#
# test
#
S () ->

	db.flushall.sync db

	user1 = new User 'aaa'
	user1.save()

	user2 = new User 'bbb'
	user2.save()

	user1.follow user2.id
	user2.follow user1.id

	obj1 = user1.createObj()
	user1.publish obj1, 2

	obj2 = user1.createFoo()
	user1.publish obj2, 1

	console.log user1.timeline()
