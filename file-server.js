/**
 * @fileOverview This serves the front-end GUI and all it needs to perform server-side actions. 
 * @author Massimo Melina <a@rejetto.com> 
 */ 
var http = require('http');
var serving = require('./lib/serving');
var listeningOn; // keep track of the tcp coordinates we are currently accepting requests

exports.start = function(listenOn, cb) {
    listeningOn = listenOn;
    exports.listeningOn = listeningOn;
    try {
        srv.listen(listenOn.port, listenOn.ip, function onListen(){
            dbg('listening on port '+listenOn.port);
            cb && cb(null);
        });
    }
    catch(e){
        cb && cb(e);
    }
};

// Set up the HTTP server

var srv = http.createServer(function(httpReq,httpRes){
    if (!serving.parseUrl(httpReq)) return;        

    var peer = httpReq.socket.address();
    dbg('Req '+peer.address+':'+peer.port+' '+httpReq.url+su(' ',httpReq.headers.range));

    serving.serveStatic(httpReq, httpRes)
        || serveFromVFS(httpReq, httpRes);

});

srv.on('error', function(err){
    switch (err.code) {
        case 'EADDRINUSE':
            return dbg('port '+listeningOn.port+' busy');
    }
});

exports.sockets = serving.sockets(srv, {
    'get list': function onGetList(data, cb){
        vfs.fromUrl(data.path, function(fnode) {
            if (serving.ioError(cb, !fnode ? 'not found'
                : !fnode.isFolder() ? 'not a folder'
                : false)) return;
            fnode.dir(function(items, bads){
                assert(items, 'items');
                // convert items to a simpler format
                items.remap(function(f){
                    // we'll use short key names to save bandwidth on common fieldnames.
                    var it = {
                        n: f.name,
                        t: f.itemKind
                    };
                    // size
                    if (f.isOnDisk() && !f.isFolder())
                        it.s = f.stats.size;
                    return it;
                });

                serving.ioOk(cb, {items:items, bads:bads});
            });//dir
        });

    }
});

//////////////////////////////

function serveFromVFS(httpReq, httpRes, cb) {
    vfs.fromUrl(httpReq.uri, function urlCB(node){
        if (!node) {
            httpRes.writeHead(404);
            httpRes.end();
            call(cb, false);
            return;
        }

        if (node.isFile()) {
            serving.serveFile(node.resource, httpReq, httpRes, { download:1, stats:node.stats, name:node.name });
            call(cb, node);
            return;
        }
        
        assert(node.isFolder(), 'must be folder');
        // force trailing slash
        if (httpReq.url.substr(-1) != '/') { 
            httpRes.writeHead(301, {
                'Location': httpReq.url+'/'
            });
            httpRes.end();
            call(cb, false);
            return;
        }
        
        serving.serveFile('static/frontend/index.html', httpReq, httpRes);
        call(cb, 1);
    });
} // serveFromVFS
