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
	# N.B. we sanitize id to not contain ':'
	id = id.replace(':', '-') if id
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

	constructor: (id, user) ->
		id = sanitize id
		id = nonce() unless id
		@id = "#{@type}:#{id}"
		@user = user

	save: (data = {}) ->
		if db.setnx.sync db, @id, JSON.stringify data
			date = Date.now()
			args = []
			args.push ['zadd', 'index', date, @id]
			args.push ['zadd', 'typed', @type, @id]
			if @user
				args.push ['set', "#{@id}:user", @user]
				args.push ['sadd', "#{@user}:index", @id]
				#args.push ['zadd', "#{@user}:index", date, @id]
				#args.push ['zadd', "#{@user}:typed", @type, @id]
			exec args
		else
			undefined

	load: (asUser) ->
		# TODO: determine if its owner then load all, else forbid
		reply = exec [
			['mget', @id, "#{@id}:user"]
		]
		data = if data then JSON.parse data else {}

	setAccess: (access) ->
		args = []
		args.push ['zadd', 'access', access, @id]
		if @user
			args.push ['zadd', "#{@user}:access", access, @id]
		exec args

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
		args = []
		tags = db.smembers.sync db, "#{@id}:tags"
		#console.log 'TAGSHA1', tags
		tags = db.mget.sync db, _.map tags, (tag) -> "tag:#{tag}"
		#console.log 'TAGS', tags

	# get ids of users which have voted for this object
	votes: (min = 0, max = '+inf') ->
		db.zrangebyscore.sync db, "#{@id}:votes", min, max

	# get this object rating == average of all user votes for this object
	rating: (min = 0, max = '+inf') ->
		cached = db.get.sync db, "#{@id}:rating"
		unless cached
			#cached = db.zinterstore.sync db, "#{@id}:rating", 1, "#{@id}:votes", 'aggregate'
			cached = db.zrangebyscore.sync db, "#{@id}:votes", min, max, 'withscores'
			# TODO: sum every second element, divide the sum over the count
			db.set.sync db, "#{@id}:rating", cached
		cached

	getUser: () ->
		user = db.get.sync db, "#{@id}:user"

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

	constructor: (id, user) ->
		super id, user

	# vote for object `oid` with value `value`
	vote: (oid, value) ->
		if value
			# TODO: reduce to 2?
			args = [
				['zadd', "vote:#{oid}", value, @id]
				['zadd', "#{oid}:votes", value, @id]
				['zadd', "vote:#{id}", value, oid]
				['zadd', "#{id}:votes", value, oid]
			]
		else
			args = [
				['zrem', "#{id}:votes", oid]
				['zrem', "vote:#{id}", oid]
				['zrem', "#{oid}:votes", @id]
				['zrem', "vote:#{oid}", @id]
			]
		exec args

	# get ids of objects for which this user has voted
	votes: (min = 0, max = '+inf') ->
		db.zrangebyscore.sync db, "vote:#{id}", min, max #, 'withscores'

	follow: (user) ->
		exec [
			['sadd', "#{@id}:follows", user]
			['sadd', "#{user}:followers", @id]
		]

	unfollow: (user) ->
		exec [
			['srem', "#{@id}:follows", user]
			['srem', "#{user}:followers", @id]
		]

	follows: () ->
		db.smembers.sync db, "#{@id}:follows"

	followers: () ->
		db.smembers.sync db, "#{@id}:followers"

	friends: () ->
		db.sinter.sync db, "#{@id}:follows", "#{@id}:followers"

	createObj: (id) ->
		obj = new Obj id, @id

	createFoo: (id) ->
		obj = new Foo id, @id

	createUser: (id) ->
		obj = new User id, @id

class Foo extends Obj

	type: @type = 1

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
