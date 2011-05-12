'use strict';

var server = DNode(function (client, callback) {
    this.echo = function (message, callback) {
        console.log(message)
        callback('Hello you too.')
    }

    this.hello = function (callback) {
        callback('Hello, world!')
    }
}).listen(9999)

var dnode = require('dnode');
var server = dnode({
    zing : function (n, cb) { cb(n * 100) }
});
server.listen(app);
