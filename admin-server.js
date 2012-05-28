var http = require('http');
var socket_io = require('socket.io');
var serving = require('./lib/serving');

exports.start = function(listenOn) {
    srv.listen(listenOn.port, listenOn.ip, function(){
        dbg('listening on port '+listenOn.port);
    });
}

var srv = http.createServer(function(httpReq,httpRes){
    if (!serving.parseUrl(httpReq)) return;

    var peer = httpReq.socket.address();
    dbg('BE: serving '+peer.address+':'+peer.port+' '+httpReq.url);

    if (serving.serveStatic(httpReq, httpRes)) return; // access to the special 'static' folder
    if (httpReq.uri == '/') {
        serving.serveFile('static/backend.html', httpRes);
        return;
    }
    serve404(httpRes); // we serve nothing else
});

srv.on('error', function(err){
    switch (err.code) {
        case 'EADDRINUSE':
            return dbg('port '+listenOn.port+' busy');
    }
});

/* converts FileNode to an object that's ready to be streamed to the back-end.
    @param depth specifies how many levels of children should be included in the structure.
    @param cb is necessary if you specify a depth that's more than zero
    @return the object representing the FileNode if no depth is specified. Otherwise the returning turns into
        an async fashion and you need to specify a callback to retrieve the result.    
*/
function nodeToObject(fnode, depth, cb) {
    assert(!cb || typeof cb == 'function', 'cb');
    if (!fnode) {
        if (cb) cb(false);
        return false;
    }
    assert(fnode instanceof vfsLib.FileNode, 'fnode');
     
    var res = ceLib.extenduptolevel({name:fnode.name}, fnode, 1); // make a copy of the whole object without recurring, and overwriting the getter 'name' 
    delete res.parent;  // this makes a circular reference
    delete res.children; // in case we want the true listing, not just the children  
    delete res.customName;
    if (res.deleted && !res.deleted.length) {
        delete res.deleted; // save on it
    }
    if (!res.resource) {
        delete res.resource;
    }

    if (!depth) {
        if (cb) cb(res);
        return res;    
    }
    assert(cb, 'cb');
    fnode.dir(function(items){
        res.children = [];
        items.forEach(function(e){
            res.children.push(nodeToObject(e, depth-1));                    
        });
        cb(res);
    });
} // nodeToObject

/*
    SET UP SOCKET.IO
*/

var io = socket_io.listen(srv);
misc.setupSocketIO(io);
io.sockets.on('connection', function(socket){
    
    socket.on('vfs.get', function onGet(data, cb) {
        vfs.fromUrl(dbg('VFS.GET', data.uri), function(fnode) {
            nodeToObject(fnode, data.depth, cb);                
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
            if (!fnode) {
                ioError(cb, 'uri not found');
                return;
            }
            fnode.add(data.resource, ioOk(cb));  
        });
    });
    
});
