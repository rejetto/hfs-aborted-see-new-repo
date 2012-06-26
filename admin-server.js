/**
 * @fileOverview This serves the back-end GUI and all it needs to perform server-side actions. 
 * @author Massimo Melina <a@rejetto.com> 
 */ 
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

    /*
    var peer = httpReq.socket.address(); //  bug: currently peer.port is our listening port, while we want to show the port of the socket serving the connection 
    dbg('serving '+peer.address+':'+peer.port+' '+httpReq.url);
    */

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
    @param {number} depth specifies how many levels of children should be included in the structure.
    @param {function} cb is necessary if you specify a depth that's more than zero
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
    delete res._parent;  // this makes a circular reference
    delete res.children; // in case we want the true listing, not just the children  
    delete res.customName;
    if (res.deleted && !res.deleted.length) {
        delete res.deleted; // save on it
    }
    if (!res.resource) {
        delete res.resource;
    }

    if (!depth
    || !fnode.isFolder()) {
        if (cb) cb(res);
        return res;    
    }
    assert(cb, 'cb');
    fnode.dir(function(items){
        res.children = [];
        async.forEach(items.getProperties(), function(e, doneThis){
            nodeToObject(e, depth-1, function(obj){
                res.children.push(obj);
                doneThis();
            });                    
        }, cb.bind(this,res));
    });
} // nodeToObject

/*
    SET UP SOCKET.IO
*/

var io = exports.io = socket_io.listen(srv);
serving.setupSocketIO(io);
io.sockets.on('connection', function(socket){
    
    socket.on('vfs.get', function onGet(data, cb) {
        vfs.fromUrl(data.uri, function(fnode) {
            nodeToObject(fnode, data.depth, cb);                
        });
    });

    // set properties of a vfs item
    socket.on('vfs.set', function onSet(data, cb){
        // assertions
        if (serving.ioError(!data ? 'data'
            : typeof data.uri != 'string' ? 'uri'
            : null, cb)) return;
            
        vfs.fromUrl(data.uri, function(fnode) {
            if (!fnode) {
                serving.ioError('not found');
                return;
            }
            if (data.name) {
                if (serving.ioError(typeof data.name != 'string' ? 'name' : null, cb)) return;
                fnode.name = data.name;
                serving.ioOk(cb);
            }
            else if (data.resource) {
                if (serving.ioError(typeof data.resource != 'string' ? 'resource' : null, cb)) return;
                fnode.set(data.resource, serving.ioOk.bind(this,cb));
            }
            notifyVfsChange(socket, fnode.getURI().excludeTrailing('/'));
        });
    });
    
    // add an item to the vfs
    socket.on('vfs.add', function onAdd(data, cb){
        // assertions
        if (serving.ioError(!data ? 'data'
            : typeof data.uri != 'string' ? 'uri'
            : typeof data.resource != 'string' ? 'resource'
            : null, cb)) return;

        vfs.fromUrl(data.uri, function(fnode) {
            if (!fnode) {
                serving.ioError('uri not found', cb);
                return;
            }
            var already = fnode.getChildByName(path.basename(data.resource)); // check if it already exists
            if (already) {
                serving.ioError('already exists', cb);
                return;
            }            
            fnode.add(data.resource, function(newNode){
                serving.ioOk(cb, {item:nodeToObject(newNode)});
                notifyVfsChange(socket, data.uri);
            });  
        });
    });
    
    // delete item, make it non-existent in the VFS
    socket.on('vfs.delete', function onRemove(data, cb){
        deleteUrl(data.uri, socket, function(err, fnode){
            err ? serving.ioError(err, cb)
                : serving.ioOk(cb, {dynamicItem: fnode.isTemp() && path.basename(fnode.resource) }) // if we just deleted a dynamic item, the GUI may need an extra refresh
        });
    });
    
    socket.on('info.get', function onInfo(data, cb){
        serving.ioOk(cb, {caseSensitiveFileNames:misc.caseSensitiveFileNames});
    });
    
});

deleteUrl = function(url, socket, cb) {
    vfs.fromUrl(url, function(fnode){
        if (!fnode) {
            cb('uri not found');
            return;
        }
        fnode.delete();
        notifyVfsChange(socket, url);
        cb(null, fnode);
    });
}; // deleteUrl

notifyVfsChange = function(socket, uri) {
    dbg('vfs.changed');
    [socket.broadcast, require('./file-server').io.sockets].forEach(function(o){
        o.emit('vfs.changed', {uri:uri});
    });
}; // notifyVfsChange

