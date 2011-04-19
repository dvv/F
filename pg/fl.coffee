'use strict'

#
# bite coffee quirks
#
process.argv.shift()
require.paths.unshift '/home/dvv/node_modules'

#
# reach db
#
db = require 'FastLegS'
db.connect 'tcp://dvv:Gfexjr@localhost/postgres'

#
# mimick IndexedDB api
#
db.Base.constructor::toStore = (schema) ->
	# TODO: introduce validation against schema: dvv/underscore-data
	#
	# return an unforgeable set of this entity accessor methods
	#
	store =
		add: this.create.bind(this)
		get: this.findOne.bind(this)
		query: this.find.bind(this)
		update: this.update.bind(this)
		delete: this.destroy.bind(this)
	Object.defineProperties store,
		id:
			value: this.tableName
			enumerable: true
		schema:
			value: schema
			enumerable: true
	Object.freeze store

#
# entities
#
User = db.Base.extend(
	tableName: 'users'
	primaryKey: 'id'
).toStore()

Post = db.Base.extend(
	tableName: 'posts'
	primaryKey: 'id'
).toStore()

console.log Post

nonce = () ->
	(Date.now() & 0x7fff).toString(36) + Math.floor(Math.random() * 1e9).toString(36) + Math.floor(Math.random() * 1e9).toString(36) + Math.floor(Math.random() * 1e9).toString(36)

n = 1000
t1 = new Date()
for i in [0...n]
	do (i) ->
		User.add
			email: nonce()
		, () ->
			#console.log 'ADDED', i, arguments
			if i is n-1
				t2 = new Date()
				console.log 'DONE', n*1000/(t2-t1)

#User.query {'email.ilike': '%o%'}, console.log

###
Post.add({ user_: 1, title: 'Some Title 1', body: 'Some body 1' }, function(err, results) {
 	console.log('CREATE', arguments);
  Post.query({ 'title.ilike': '%title%' }, { only: ['id', 'body'] }, function(err, post) {
  	console.log('FIND', arguments);
    // Hooray!
  });
});
###
