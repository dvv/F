var db = require('FastLegS');
db.connect('tcp://dvv:Gfexjr@localhost/postgres');

var User = db.Base.extend({
  tableName: 'users',
  primaryKey: 'id'
}).getStore();

var Post = db.Base.extend({
  tableName: 'posts',
  primaryKey: 'id'
}).getStore();

console.log(Post);
//Post.delete();

User.add({email: 'aaa'});//, function() {});

Post.add({ user_: 1, title: 'Some Title 1', body: 'Some body 1' }, function(err, results) {
 	console.log('CREATE', arguments);
  Post.query({ 'title.ilike': '%title%' }, { only: ['id', 'body'] }, function(err, post) {
  	console.log('FIND', arguments);
    // Hooray!
  });
});
