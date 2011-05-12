var server = require('http').createServer(function(req, res) {
	res.writeHead(200);
	res.end('Bienvenuto!');
});

var cluster = require('cluster');
var live = require('cluster-live');

cluster(server)
	.set('workers', 4)
	.use(cluster.debug())
	.use(cluster.stats({ connections: true, lightRequests: true }))
	.use(live())
	.listen(3000);
