var db = require('FastLegS');
db.connect('tcp://postgres:1Xticrjt2Gbdj3@localhost/postgres');

var Post = db.Base.extend({
  tableName: 'posts',
  primaryKey: 'id',
  fields: {
    id: {
      type: 'serial'
    },
    created: {
      type: 'date',
      default: new Date()
    },
    title: {
      type: 'string',
      maxLength: 128
    },
    body: {
      type: 'string',
      optional: true
    }
  }
});

console.log(Post.make(), db.client);
db.client.emit('query', Post.make(), function(err, result) {
	console.log('CR', err, result);
});

/*

.getStore();
//console.log(Post);
//Post.delete();

var Comment = db.Base.extend({
  tableName: 'comments',
  primaryKey: 'id',
}).getStore();
//console.log(Comment);
//Comment.delete();

db.client.query('create table posts(id serial, title text, body text)');

Post.add.call(null, { id: Math.random()*10000, title: 'Some Title 1', body: 'Some body 1' }, function(err, results) {
 	console.log('CREATE', arguments);
  Post.query.call(null, { 'title.ilike': '%title%' }, { only: ['id', 'body'] }, function(err, post) {
  	console.log('FIND', arguments);
    // Hooray!
  });
});
*/