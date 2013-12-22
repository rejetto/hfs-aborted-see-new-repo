/**
 * @fileOverview This serves the front-end GUI and all it needs to perform server-side actions. 
 * @author Massimo Melina <a@rejetto.com> 
 */ 
var http = require('http');
var socket_io = require('socket.io');
var serving = require('./lib/serving');
var listeningOn; // keep track of the tcp coordinates we are currently accepting requests

exports.start = function(listenOn) {
    listeningOn = listenOn;
    exports.listeningOn = listeningOn;
    srv.listen(listenOn.port, listenOn.ip, function onListen(){
        dbg('listening on port '+listenOn.port);
    });
};

/*
   SET UP THE HTTP SERVER
*/

var srv = http.createServer(function(httpReq,httpRes){
    if (!serving.parseUrl(httpReq)) return;        

    var peer = httpReq.socket.address();
    dbg('requested '+peer.address+':'+peer.port+' '+httpReq.url+su(' ',httpReq.headers.range));

    serving.serveStatic(httpReq, httpRes)
        || serveFromVFS(httpReq, httpRes);

});

srv.on('error', function(err){
    switch (err.code) {
        case 'EADDRINUSE':
            return dbg('port '+listeningOn.port+' busy');
    }
});

/*
    SET UP SOCKET.IO
*/

var io = exports.io = socket_io.listen(srv);
serving.setupSocketIO(io);
io.sockets.on('connection', function(socket){
    //** sequences like these may be better with Step(). Try 
    socket.on('get list', function onGetList(data, cb){
        vfs.fromUrl(data.path, function(fnode) {
            getReplyForFolder(fnode, serving.ioOk.bind(this,cb));  
        });
    });
});

//////////////////////////////

function getReplyForFolder(folder, cb) {
    if (!folder) {
        return cb({error:'not found'});
    }
    folder.dir(function(items, bads){
        assert(items, 'items');                
        // convert items to a simpler format
        items.remap(function(f){
            // we'll use short key names to save bandwidth on common fieldnames.
            var it = {
                n: f.name,
                t: f.itemKind.replace('virtual ','') // this is a quick and dirty method to get value as file|folder|link
            };
            // size
            if (f.isOnDisk() && !f.isFolder())
                it.s = f.stats.size;
            return it;
        });

        cb({items:items, bads:bads});
    });//dir
} // getReplyForFolder

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
