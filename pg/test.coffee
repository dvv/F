'use strict'

global._ = require 'underscore'
pg = require('pg') #.native
#connectionStr = 'tcp://dvv:Gfexjr@localhost/postgres'
connectionStr = 'tcp://postgres:1Xticrjt2Gbdj3@localhost/postgres'
db = new pg.Client connectionStr
db.on 'drain', db.end.bind db
db.connect()

assert = require 'assert'
db.query("CREATE TEMP TABLE foo(id bigint, num bigint)")
db.query("INSERT INTO foo(id) values(1)")
q = db.query('SELECT * FROM foo').on 'row', (row) ->
	console.log arguments
	assert.equal row.id, 1
	assert.ok row.num is null
