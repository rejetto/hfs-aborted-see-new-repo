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

    var res = fnode._clone()._expand({ name:fnode.name }); // make a copy of the whole object without recurring, and overwriting the getter 'name'
    var s = fnode.stats; // cannot use _clone on this one
    if (s) {
        res.ctime = s.ctime.toJSON();
        res.mtime = s.mtime.toJSON();
        if (res.mtime===res.ctime)
            delete res.mtime;
        if (fnode.isFile())
            res.size = s.size;
    }
    delete res._parent;  // this makes a circular reference
    delete res.children; // in case we want the true listing, not just the children
    if (!res.customName) {
        delete res.name;
    }
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
        async.forEach(items._values(), function(e, doneThis){
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
            if (!fnode)
                return serving.ioError(cb, 'not found');
            nodeToObjectForStreaming(fnode, Math.min(2,data.depth), function(res){
                serving.ioOk(cb, { item:res });
            });
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
            if (serving.ioError(cb, !fnode ? 'not found'
                : 'name' in data && !isString(data.name) ? 'name'
                : 'resource' in data && !isString(data.resource) ? 'resource'
                : null)) return;
            if ('name' in data)
                fnode.name = data.name;
            async.series([
                function(pathSet){
                    if ('resource' in data)
                        return fnode.setPath(data.resource, function(err){
                            serving.ioError(cb, err && choose(err.code,{ ENOENT:'resource not found' },err.code))
                            || pathSet();
                        });
                    pathSet();
                },
                function(overlapRefreshed){
                    fnode.refreshOverlapping(overlapRefreshed);
                },
                function(){
                    serving.ioOk(cb, { item:nodeToObjectForStreaming(fnode) });
                    notifyVfsChange(socket, fnode.getURI().excludeTrailing('/'));
                }
            ]);
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
            fnode.add(data.resource, function(err, newNode){
                serving.ioOk(cb, {item:nodeToObjectForStreaming(newNode)});
                notifyVfsChange(socket, newNode.getURI().excludeTrailing('/'));
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
                    dynamicItem: fnode.nodeKind!==NK.FIXED && path.basename(fnode.resource)+(fnode.isFolder() ? '/' : ''), // a trailing slash denotes folders
                    folderDeletedCount: folder.deletedItems ? folder.deletedItems.length : 0
                });
                notifyVfsChange(socket, folder.getURI()); 
            });
        });
    },

    // move an item within the vfs
    'vfs.move': function onMove(data, cb){
        var socket = this;
        // assertions
        if (serving.ioError(cb, !data ? 'data'
            : !isString(data.from) ? 'from'
            : !isString(data.to) ? 'to'
            : null)) return;

        vfs.fromUrl(data.to, function(destination){
            if (serving.ioError(cb, !destination && 'destination not found')) return;

            vfs.fromUrl(data.from, function(source){
                if (serving.ioError(cb, !source ? 'source not found'
                    : destination.getChildByName(source.name) ? 'already exists'
                    : null)) return;

                var originalSourceFolder = source.getURI().excludeTrailing('/').split('/').slice(0,-1).join('/')+'/'; // one level above

                if (source.isFixed()) {
                    source.parent = destination;
                    return done(source);
                }
                source.delete(function(){
                    destination.add(source.resource, function(err,addition){
                        serving.ioError(cb, err)
                        || done(addition);
                    });
                });

                function done(item){
                    item.refreshOverlapping(function(){
                        vfs.fromUrl(data.from, function(updatedFrom){
                            serving.ioOk(cb, { from:updatedFrom||null, to:nodeToObjectForStreaming(item) });
                        });
                        notifyVfsChange(socket, originalSourceFolder);
                        notifyVfsChange(socket, data.from);
                    });
                }
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
                if (serving.ioError(cb, err)) return;
                serving.ioOk(cb, {item:child});
                notifyVfsChange(socket, fnode.getURI());
            });
        });
    },

    'vfs.export': function onExport(data, cb){
        serving.ioOk(cb, { data: vfs.toString() });
    },
    'vfs.import': function onImport(data, cb){
        if (serving.ioError(cb, !data.root ? 'root' : null)) return;
        var socket = this;
        vfs.fromString(data.root, function(err){
            if (serving.ioError(cb, err)) return;
            serving.ioOk(cb);
            notifyVfsChange(socket, vfs.root.getURI());
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
    dbg('vfs.changed '+uri);
    var evt = 'vfs.changed', data={uri:uri||'/'};
    require('./file-server').sockets.broadcast(evt, data);
    socket.broadcast.emit(evt, data);
}; // notifyVfsChange

