require('./common');
var http = require('http');
var serving = require('./serving');
var socket_io = require('socket.io');

exports.start = function(listenOn) {
    srv.listen(listenOn.port, listenOn.ip, function(){
        dbg('listening on port '+listenOn.port);
    });
}

var srv = http.createServer(function(httpReq,httpRes){
    if (!serving.parseUrl(httpReq)) return;

    var peer = httpReq.socket.address();
    dbg('BE: serving '+peer.address+':'+peer.port+' '+httpReq.url);

    if (serving.serveStatic(httpReq, httpRes)) return;
    if (httpReq.uri == '/') {
        serving.serveFile('static/backend.html', httpRes);
        return;
    }
    serve404(httpRes);
});

srv.on('error', function(err){
    switch (err.code) {
        case 'EADDRINUSE':
            return dbg('port '+listenOn.port+' busy');
    }
});

function nodeToObject(fnode) {
    var res = misc.extend({name:fnode.name}, fnode);
    delete res.parent;
    if (res.deleted && !res.deleted.length) {
        delete res.deleted; // save on it
    }
    return res;
} // nodeToObject

/*
    SET UP SOCKET.IO
*/

var io = socket_io.listen(srv);
misc.setupSocketIO(io);
io.sockets.on('connection', function(socket){
    
    socket.on('vfs.get', function onGet(data, cb) {
        vfs.fromUrl(data.uri, function(fnode) {
            fnode.dir(function(items){
                // 'fnode' and 'items' are expected by the client in a different form, so we clone them before we treat them
                var res = nodeToObject(fnode);
                res.children = [];
                items.forEach(function(e){
                    res.children.push(nodeToObject(e));                    
                });
                cb(res);
            });
        });
    });

    // set properties of a vfs item
    socket.on('vfs.set', function onSet(data, cb){
        if (!data) return;
        vfs.fromUrl(data.uri, function(fnode) {
            fnode.set(data.resource, ioOk(cb));  
        });
    });

    // add an item to the vfs
    socket.on('vfs.add', function onAdd(data, cb){
        // assertions
        if (socketIoError(!data ? 'data'
            : typeof data.uri != 'string' ? 'uri'
            : typeof data.resource != 'string' ? 'resource'
            : null, cb)) return;

        vfs.fromUrl(data.uri, function(fnode) {
            fnode.add(data.resource, ioOk(cb));  
        });
    });
    
});
