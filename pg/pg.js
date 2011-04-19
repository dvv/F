var pg = require('pg').native;
var conString = 'postgres://postgres:1Xticrjt2Gbdj3@localhost/postgres';
var client = new pg.Client(conString);
client.on('drain', client.end.bind(client));
client.connect();

var n = 1000000;

client.query("DROP TABLE foo");
client.query("CREATE TABLE foo(name varchar(10), height integer, birthday timestamptz)");

//var rec = ['Ringo', 67, new Date()];
var rec = ['Ringo', 67, new Date()];

if (false) {
var ts1 = new Date();
function insert(i) {
	/*client.query("INSERT INTO foo(name, height, birthday) values($1, $2, $3)", rec, function(err, result) {
		console.log(err, result);
		if (--i) insert(i);
		else {
			var ts2 = new Date();
			console.log('DONE', n*1000/(ts2-ts1));
		}
	});*/
	
	client.query({
		name: 'Foo.add',
		text: 'INSERT INTO foo(name, height, birthday) values($1, $2, $3)',
		values: rec
	}).on('row', function(row) {
		console.log('ROW', arguments);
	}).on('end', function() {
		//console.log('END', arguments);
		if (--i) insert(i);
		else {
			var ts2 = new Date();
			console.log('DONE', n*1000/(ts2-ts1));
		}
	}).on('error', function(error) {
		console.log('ERROR', arguments);
	});
}
insert(n);
}

global._ = require('underscore');

function Store() {
	this.entity = 'foo';
	this.fields = {
		name: String,
		height: Number,
		birthday: Date
	};
}

/*

fields: {
	a,
	b,
	c,
	d
}

record: {
	a: 1,
	b: 2,
	d: 3
}

*/

Store.prototype.add = function(ctx, record, callback) {
	var query = client.query({
		name: this.entity + '.add',
		text: 'insert into ' + this.entity + '(' + _.keys(this.fields).join() + ') values($1, $2, $3)',
		values: record
	});
	if (typeof callback === 'function') query.on('end', callback);
	/*query.on('end', function(err, result) {
		console.log('ADD', arguments);
		if (typeof callback === 'function') callback(err, result);
	});*/
}

Store.prototype.query = function(ctx, conditions, callback) {
	var query = client.query({
		name: this.entity + '.query',
		text: 'select * from ' + this.entity + ' where 1=1'
	});
	if (typeof callback === 'function') query.on('row', callback);
	/*query.on('end', function(err, result) {
		console.log('ADD', arguments);
		if (typeof callback === 'function') callback(err, result);
	});*/
}

var Foo = new Store();

n = 2;
var ts1 = new Date();
function insert(i) {
	Foo.add(null, rec, function() {
		//console.log('END', arguments);
		if (--i) insert(i);
		else {
			var ts2 = new Date();
			console.log('DONE', n*1000/(ts2-ts1));
			Foo.query(null, null, function() {
				console.log('QUERIED', arguments);
			});
		}
	});
}
insert(n);
