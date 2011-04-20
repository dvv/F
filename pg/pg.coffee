'use strict'

global._ = require 'underscore'
pg = require('pg').native
connectionStr = 'tcp://dvv:Gfexjr@localhost/postgres'
#connectionStr = 'tcp://postgres:1Xticrjt2Gbdj3@localhost/postgres'
db = new pg.Client connectionStr
db.on 'drain', db.end.bind db
db.connect()


nonce = () ->
	(Date.now() & 0x7fff).toString(36) + Math.floor(Math.random() * 1e9).toString(36) + Math.floor(Math.random() * 1e9).toString(36) + Math.floor(Math.random() * 1e9).toString(36)

#
# operators
#
operatorMap =
	eq: '='
	ne: '<>'
	not: '<>'
	gt: '>'
	lt: '<'
	gte: '>='
	lte: '<='
	like: 'like'
	nlike: 'not like'
	ilike: 'ilike'
	nilike: 'not ilike'
	in: 'in'
	nin: 'not in'

cond2where = (cond = {}, params, options = {}) ->
	options.prmIndex ?= 0
	where = []
	order = []
	limit = undefined
	offset = 0
	for own k, v of cond
		[field, op] = k.split '.'
		op ?= 'eq'
		# special case: key starting with dot
		if field is ''
			# limit
			if op is 'limit'
				limit = v
			else if op is 'offset'
				offset = v
			continue
		# sorting
		if op is 'asort'
			order.push "#{field} asc"
			continue
		if op is 'dsort'
			order.push "#{field} desc"
			continue
		# special case: array
		if op in ['in', 'nin']
			enclose = true
			# empty set results in fake falsy condition
			unless v
				where.push "1=0"
				continue
		op = operatorMap[op]
		params.push(if v? then v else 'NULL')
		# FIXME: sanitize `field`
		if enclose
			where.push "#{field} #{op} ($#{params.length})"
		else
			where.push "#{field} #{op} $#{params.length}"
	where.push '1=1'
	result =
		where: where
		params: params
		order: order
		limit: limit

class Store

	constructor: (@schema = {}) ->
		@name = schema.collection
		@schema.fields ?= {}
		@fields =
			get: @schema.fields.get or ['*']
			query: @schema.fields.query or ['*']
			update: @schema.fields.update

	exec: (sql, params) ->
		#console.log 'EXEC', arguments
		#return
		db.query(
			name: sql
			text: sql
			values: params
		).on 'error', (err) -> console.log 'ERREXEC', err

	add: (record) ->
		keys = []
		values = []
		params = []
		for own k, v of rec
			params.push v
			keys.push k
			values.push "$#{params.length}"
		sql = "insert into #{@name}(#{keys.join(',')}) values(#{values.join(',')}) returning id"
		@exec sql, params

	delete: (cond) ->
		parsed = cond2where cond, []
		sql = "delete from #{@name} where (#{parsed.where.join(' and ')})"
		@exec sql, parsed.params

	update: (cond, changes) ->
		updates = []
		params = []
		fields = @fields.update
		for own k, v of changes
			continue if fields and k not in fields
			params.push v
			updates.push "#{k}=$#{params.length}"
		# what to do if no updates are sheduled?
		if not updates.length
			sql = 'select 0'
		else
			parsed = cond2where cond, params, prmIndex: params.length
			sql = "update #{@name} set #{updates.join(',')} where (#{parsed.where.join(' and ')})"
		@exec sql, params

	get: (id) ->
		params = [id]
		sql = "select #{@fields.get.join(',')} from #{@name} where (id=$1) limit 1"
		@exec sql, params

	query: (cond) ->
		parsed = cond2where cond, []
		sql = "select #{@fields.query.join(',')} from #{@name} where (#{parsed.where.join(' and ')}) order by #{parsed.order.join(',')||1}"
		if parsed.limit?
			sql += " limit #{parsed.limit}"
		if parsed.offset
			sql += " offset #{parsed.offset}"
		@exec sql, parsed.params

	#
	# stream all records
	#
	stream: (filterFn) ->
		sql = "select #{@fields.query.join(',')} from #{@name}"
		@exec sql, []
		#@exec(sql, []).on('row', () ->
		#).on('end', () ->
		#)

	#
	# return an unforgeable set of this entity accessor methods
	#
	facet: () ->
		store =
			add: @add.bind(this)
			get: @get.bind(this)
			query: @query.bind(this)
			update: @update.bind(this)
			delete: @delete.bind(this)
		Object.defineProperties store,
			id:
				value: @name
				enumerable: true
			schema:
				value: @schema
				enumerable: true
		Object.freeze store

rec = {name: 'Ringo', height: 67, dob: new Date()}

User = new Store
	collection: 'users'
	fields:
		#get: ['dob']
		update: ['height', 'foo']

###
User.add rec
User.get 1
User.query 'name.ilike': 'hz', '.limit': 10
User.update 'id.in': null,
	name: 'Starr'
	foo: 'Bar'
User.delete 'height.gt': 60
process.exit()
###

#db.query 'DROP TABLE users CASCADE', console.log
#db.query 'CREATE TABLE users(id serial not null primary key, name varchar(10), height integer, dob timestamptz)', console.log

###
n = 10000
ts1 = new Date()
insert = (i) ->
	User.add(rec
	).on('end', () ->
		#console.log 'END', arguments
		if --i
			insert i
		else
			ts2 = new Date()
			console.log 'DONE', n*1000/(ts2-ts1)
		return
	)
insert n

n = 10000
ts1 = new Date()
fetch = (i) ->
	User.get(Math.floor(Math.random() * 10000)).on('row', () -> 
		#console.log 'ROW', arguments
	).on('end', () ->
		#console.log 'END', arguments
		if --i
			fetch i
		else
			ts2 = new Date()
			console.log 'DONE', n*1000/(ts2-ts1)
		return
	)
fetch n

n = 10000
ts1 = new Date()
fetch = (i) ->
	User.query({id: Math.floor(Math.random() * 10000)}).on('row', () -> 
		#console.log 'ROW', arguments
	).on('end', () ->
		#console.log 'END', arguments
		if --i
			fetch i
		else
			ts2 = new Date()
			console.log 'DONE', n*1000/(ts2-ts1)
		return
	)
fetch n
###

#db.query 'select * from v_object_tree', console.log
