/**
 * @fileOverview This serves the back-end GUI and all it needs to perform server-side actions. 
 * @author Massimo Melina <a@rejetto.com> 
 */ 
var http = require('http');
var socket_io = require('socket.io');
var serving = require('./lib/serving');

exports.start = function(listenOn) {
    srv.listenOn = listenOn;
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
        serving.serveFile('static/backend/index.html', httpReq, httpRes);
        return;
    }
    serving.serve(httpRes, 404); // we serve nothing else
});

srv.on('error', function(err){
    switch (err.code) {
        case 'EADDRINUSE':
            return dbg('port '+srv.listenOn.port+' busy');
    }
});

/* converts FileNode to an object that's ready to be streamed to the back-end.
    @param {number} depth specifies how many levels of children should be included in the structure.
    @param {function} cb is necessary if you specify a depth that's more than zero
    @return the object representing the FileNode if no depth is specified. Otherwise the returning turns into
        an async fashion and you need to specify a callback to retrieve the result.    
*/
function nodeToObjectForStreaming(fnode, depth, cb, isRecurring) {
    assert(!cb || isFunction(cb), 'cb'); // this is necessarily an async procedure: require a callback
    if (!fnode) {
        if (cb) cb(false);
        return false;
    }
    assert(fnode instanceof vfsLib.FileNode, 'fnode');

    var res = ceLib.extenduptolevel({name:fnode.name}, fnode, 1); // make a copy of the whole object without recurring, and overwriting the getter 'name'
    delete res._parent;  // this makes a circular reference
    delete res.children; // in case we want the true listing, not just the children
    if (!res.customName) delete res.name;
    delete res.customName;
    // save bandwidth by not sending some empty properties
    if (res.deletedItems
    && !res.deletedItems.length) {
        delete res.deletedItems; 
    }
    if (isRecurring && res.resource) {
        res.resource = fnode.resourceRelativeTo(fnode.parent);
    }
    if (!res.resource) {
        delete res.resource;
    }
    // depth is not required, or not possible, our job ends here
    if (!depth
    || !fnode.isFolder()) {
        if (cb) cb(res);
        return res;    
    }
    // recur on children
    fnode.dir(function(items,bads){
        res.children = [];
        async.forEach(items, function(e, doneThis){
            nodeToObjectForStreaming(e, depth-1, function(obj){
                res.children.push(obj);
                doneThis();
            }, true);
        }, cb.bind_(res,bads));
    });
} // nodeToObjectForStreaming

/*
    SET UP SOCKET.IO
*/

var sockets = serving.sockets(srv, {
    
    'vfs.get': function onGet(data, cb) {
        if (serving.ioError(cb, !data ? 'data'
            : !isString(data.uri) ? 'uri'
            : null)) return;
            
        vfs.fromUrl(data.uri, function(fnode) {
            if (!fnode) serving.ioError(cb, 'not found');
            else nodeToObjectForStreaming(fnode, Math.min(2,data.depth), serving.ioOk.bind_(cb));
        });
    },

    // set properties of a vfs item
    'vfs.set': function onSet(data, cb){
        var socket = this;
        // assertions
        if (serving.ioError(cb, !data ? 'data'
            : !isString(data.uri) ? 'uri'
            : null)) return;
            
        vfs.fromUrl(data.uri, function(fnode) {
            if (!fnode) {
                serving.ioError(cb, 'not found');
                return;
            }
            if (data.name) {
                if (serving.ioError(cb, isString(data.name) ? null : 'name')) return;
                fnode.name = data.name;
                serving.ioOk(cb);
                notifyVfsChange(socket, fnode.getURI().excludeTrailing('/'));
                return;
            }
            if (data.resource) {
                if (serving.ioError(cb, isString(data.resource) ? null : 'resource')) return;
                fnode.set(data.resource, function(){
                    serving.ioOk(cb);
                    notifyVfsChange(socket, fnode.getURI().excludeTrailing('/'));
                });
            }
        });
    },
    
    // add an item to the vfs
    'vfs.add': function onAdd(data, cb){
        var socket = this;
        // assertions
        if (serving.ioError(cb, !data ? 'data'
            : !isString(data.uri) ? 'uri'
            : !isString(data.resource) ? 'resource'
            : null)) return;

        vfs.fromUrl(data.uri, function(fnode) {
            if (!fnode) {
                serving.ioError(cb, 'uri not found');
                return;
            }
            var already = fnode.getChildByName(path.basename(data.resource)); // check if it already exists
            if (already) {
                serving.ioError(cb, 'already exists');
                return;
            }            
            fnode.add(data.resource, function(newNode){
                serving.ioOk(cb, {item:nodeToObjectForStreaming(newNode)});
                notifyVfsChange(socket, data.uri);
            });  
        });
    },
    
    // delete item, make it non-existent in the VFS
    'vfs.delete': function onRemove(data, cb){
        var socket = this;
        // assertions
        if (serving.ioError(cb, !data ? 'data'
            : !isString(data.uri) ? 'uri'
            : null)) return;

        vfs.fromUrl(data.uri, function(fnode){
            if (!fnode) {
                serving.ioError(cb, 'uri not found')
                return;
            }
            fnode.delete(function(folder){
                // if we just deleted a dynamic item, the GUI may need an extra refresh
                serving.ioOk(cb, {
                    dynamicItem: fnode.isTemp() && path.basename(fnode.resource)+(fnode.isFolder() ? '/' : ''), // a trailing slash denotes folders
                    folderDeletedCount: folder.deletedItems ? folder.deletedItems.length : 0
                });
                notifyVfsChange(socket, folder.getURI()); 
            });
        });
    },

    // restore a temp item that was deleted
    'vfs.restore': function onRestore(data, cb){
        var socket = this;
        // assertions
        if (serving.ioError(cb, !data ? 'data'
            : !isString(data.uri) ? 'uri'
            : !isString(data.resource) ? 'resource'
            : null)) return;

        vfs.fromUrl(data.uri, function(fnode){
            if (!fnode) {
                serving.ioError(cb, 'uri not found');
                return;
            }
            if (data.resource === '*') { // special case, restore all
                fnode.deletedItems = [];
                serving.ioOk(cb);
                notifyVfsChange(socket, fnode.getURI());
                return;
            }
            if (!fnode.restoreDeleted(data.resource)) {
                serving.ioError(cb, 'failed');
                return;
            }
            fnode.createChildRelatively(data.resource, function(err, child){
                if (err) {
                    serving.ioError(err);
                    return;
                }
                serving.ioOk(cb, {item:child});
                notifyVfsChange(socket, fnode.getURI());
            });
        });
    },

    'info.get': function onInfo(data, cb){
        serving.ioOk(cb, {
            caseSensitiveFileNames: caseSensitiveFileNames,
            frontEnd: log(GLOBAL.fileServer.listeningOn)
        });
    }
    
});

notifyVfsChange = function(socket, uri) {
    dbg('vfs.changed');
    var evt = 'vfs.changed', data={uri:uri};
    require('./file-server').sockets.broadcast(evt, data);
    socket.broadcast.emit(evt, data);
}; // notifyVfsChange

