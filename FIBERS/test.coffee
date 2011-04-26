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

	constructor: (id, uid) ->
		id = sanitize id
		id = nonce() unless id
		@id = "#{@type}:#{id}"
		@uid = uid

	save: (data = {}) ->
		if db.setnx.sync db, @id, JSON.stringify data
			date = Date.now()
			args = []
			args.push ['zadd', 'o.index', date, @id]
			args.push ['zadd', 'o.type', @type, @id]
			args.push ['set', "#{@id}:uid", @uid]
			args.push ['zadd', "#{@uid}:o.index", date, @id]
			args.push ['zadd', "#{@uid}:o.type", @type, @id]
			exec args
		else
			undefined

	load: (uid) ->
		# TODO: determine if its owner then load all, else forbid
		reply = exec [
			['mget', @id, "#{@id}:uid"]
		]
		data = if data then JSON.parse data else {}

	setAccess: (access) ->
		args = [
			['zadd', 'o.access', access, @id]
			['zadd', "#{@uid}:o.access", access, @id]
		]
		exec args

	tag: (tags) ->
		args = []
		_.each tags, (tag) ->
			id = sha1 tag
			args.push.apply args, [
				['set', "tag:#{id}", tag]
				['sadd', "#{@id}:tags", id]
				['sadd', "o.tags:#{id}", @id]
			]
		, @
		exec args

	untag: (tags) ->
		args = []
		_.each tags, (tag) ->
			id = sha1 tag
			args.push.apply args, [
				['srem', "o.tags:#{id}", @id]
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

	vote: (value) ->
		args = [
			if value then ['zadd', "vote:#{@id}", value, @uid] else ['zrem', "vote:#{@id}", @uid]
			if value then ['zadd', "#{@id}:votes", value, @uid] else ['zrem', "#{@id}:votes", @uid]
		]
		exec args

	getTags: () ->
		tags = db.smembers.sync db, "#{@id}:tags"
		tags = db.mget.sync db, _.map tags, (tag) -> "tag:#{tag}"

	getVotes: (min = 0, max = '+inf') ->
		db.zrangebyscore.sync db, "#{@id}:votes", min, max, 'withscores'

	@index: () ->
		db.zrangebyscore.sync db, 'o.type', @type, @type

	@findByAllTags: (tags) ->
		db.sinter.sync db, _.map tags, (tag) -> "o.tags:#{sha1(tag)}"

	@findByAnyTag: (tags) ->
		db.sunion.sync db, _.map tags, (tag) -> "o.tags:#{sha1(tag)}"

class Foo extends Obj

	type: @type = 1

class User extends Obj

	type: @type = 9

	constructor: (id) ->
		id = sanitize id
		id = nonce() unless id
		@id = "#{@type}:#{id}"
		@uid = 0

	follow: (uid) ->
		exec [
			['sadd', "#{@id}:follows", uid]
			['sadd', "#{uid}:followers", @id]
		]

	unfollow: (uid) ->
		exec [
			['srem', "#{@id}:follows", uid]
			['srem', "#{uid}:followers", @id]
		]

	follows: () ->
		db.smembers.sync db, "#{@id}:follows"

	followers: () ->
		db.smembers.sync db, "#{@id}:followers"

	friends: () ->
		db.sinter.sync db, "#{@id}:follows", "#{@id}:followers"

S () ->

	db.flushall.sync db

	user1 = new User 'aaa'
	user1.save()

	user2 = new User 'aaa'
	user2.save()

	obj1 = new Foo null, 'u:hz'
	obj1.save foo: 'bar'
	obj1.tag ['bar', 'baz', 'sole']
	#console.log obj1.getTags()
	obj1.untag ['baz', 'foo']
	#console.log obj1.getTags()
	obj1.vote 1
	obj1.vote()
	#exec [['zrange', ]]

	obj2 = new Obj null, 'u:hz'
	obj2.save bar: 'baz'
	obj2.tag ['bar', 'fubar']
	obj2.vote 1
	obj2.vote 9
	obj2.vote 2
	obj2.vote 3

	#exec [ ['smembers', 'tags'] ]

	#obj1.load 'u:a'
	#Obj.index()
	console.log 'AAA', Obj.findByAllTags ['sole']
	console.log 'III', Obj.findByAnyTag ['sole', 'bar']
	console.log obj2.getVotes()
