var pg = require('pg').native;
var conString = 'postgres://dvv:Gfexjr@localhost/postgres';
var client = new pg.Client(conString);
client.on('drain', client.end.bind(client));
client.connect();

console.error('NODE: ', process.version);

client.query('drop table foo');
client.query('create table foo(id serial)');
client.query({
	name: 'select * from foo where id = $1',
	text: 'select * from foo where id = $1'
});
