'use strict'

global._ = require 'underscore'
pg = require('pg').native
connectionStr = 'tcp://dvv:Gfexjr@localhost/dvv'
#connectionStr = 'tcp://postgres:1Xticrjt2Gbdj3@localhost/postgres'
db = new pg.Client connectionStr
db.on 'drain', db.end.bind db
db.connect()

query = (sql, params..., callback) ->
	#console.log 'EXEC', sql, params, callback
	db.query(
		name: sql
		text: sql
		values: params
	).on('error', (err) ->
		callback? err and err.message or err
	).on('end', () ->
		callback? null
	)

query1 = (sql, params..., callback) ->
	console.log 'EXEC', sql, params, callback
	db.query {
		name: sql
		text: sql
		values: params
	}, callback

getObjects0 = (level) ->
	db.query(
		name: 'getObjects'
		text: """
-- $1 - user access level
WITH RECURSIVE obj_tree AS (
  SELECT o.*, ARRAY[o.id] AS path
    FROM objects o
    WHERE o.ref_id IS NULL AND o.access <= $1
  UNION ALL
  SELECT t.*, tt.path || t.id AS path
    FROM objects t
    JOIN obj_tree tt ON t.ref_id = tt.id
    WHERE t.access <= $1
)
SELECT id, user_id, path FROM obj_tree;
	"""
		values: [level]
	).on 'end', () ->
		console.log arguments

getObjects = (level) ->
	db.query {
		name: 'getObjects'
		text: """
-- $1 - user access level
WITH RECURSIVE obj_tree AS (
  SELECT o.*, ARRAY[o.id] AS path
    FROM objects o
    WHERE o.ref_id IS NULL AND o.access <= $1
  UNION ALL
  SELECT t.*, tt.path || t.id AS path
    FROM objects t
    JOIN obj_tree tt ON t.ref_id = tt.id
    WHERE t.access <= $1
)
SELECT id, user_id, path FROM obj_tree;
	"""
		values: [level]
	}, () ->
		console.log arguments

#getObjects 0

vote = (user_id, obj_id) ->
	query 'insert into votes(ref_id, user_id) values($1, $2)', obj_id, user_id, () ->
		console.log 'VOTE', arguments

unvote = (user_id, obj_id) ->
	query 'delete from votes where ref_id = $1 and user_id = $2', obj_id, user_id, () ->
		console.log 'UNVOTE', arguments

unvote 1, 3
vote 1, 3

setRel = (uid, tid, value) ->
	query 'select set_rel($1,$2,$3)', uid, tid, value, () ->
		console.log 'SETREL', arguments

setRel 2, 3, 2

#query("select * from get_objects(0)").on 'row', () ->
#	console.log arguments

