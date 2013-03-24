/**
 * @fileOverview command line interface to the server 
 * @author Massimo Melina <a@rejetto.com> 
 */ 
require('./lib/libs');
var socket_io = require('socket.io-client');

// read arguments
var v = process.argv;
if (v.length < 3) { // quick help
    log('Usage: node '+path.basename(v[1])+' <path>');
    return;
}  
var fpath = v[2];
var under = v.length < 4 ? '/' : v[3];

// connect to admin-server 
var socket = socket_io.connect('http://localhost:88'); 
socket.on('connect', function () {
    // ask to add this file
    socket.emit('vfs.add', {uri:under, resource:fpath, depth:1}, function(data){
        if (!data) {
            log('communication error');
            process.exit(2);
        }
        if (!data.ok) {
            log('error: '+(data.error || 'generic'));
            process.exit(3);
        } 
        socket.disconnect();
        process.exit(0);
    });
});

socket.socket.on('error', function(err){
    log('Server unreachable');
    process.exit(1);
});
