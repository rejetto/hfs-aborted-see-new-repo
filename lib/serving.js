require('./libs');
var mime = require('./mime');
var url = require('url');

exports.serveFile = serveFile = function(file, httpReq, httpRes, options) {
    assert(file && httpReq && httpRes, 'bad args');
    var o = options||{}; // shortcut
    //TODO avoid calling fs.stat if o.stats
    fs.stat(file, function onStat(err,stats){
        if (!err) {
            var stream = fs.createReadStream(file); // autoClose is documented as being by-default, but without this the file is actually left open (tested on Win7)
            if (!stream) err = 'no input stream';
        }

        if (err) { // stat or open failed
            var code = choose(err, { // try specific response code
                ENOENT: 404
            }, 500); // default code
            httpRes.writeHead(code);
            httpRes.end();
            if (stream) stream.close();
            return;
        }

        stats = (o.stats || stats);

        // browser cache support, by timestamp
        var v;
        if (v = httpReq.headers['if-modified-since']) {
            v = new Date(v);
            if (!(v-stats.mtime)) {
                httpRes.writeHead(304);
                httpRes.end();
                stream.close();
                return;
            }
        }

        // header part
        var headers = {
            'Content-Disposition': o.download && 'attachment; filename="{0}"'.x(o.name || path.basename(file)),
            'Content-Type': o.mime || mime.fromFile(file) || 'application/octet-stream',
            'Content-Length': stats.size,
            'Last-Modified': stats.mtime.toGMTString()
        }._filter('A !== undefined');
        httpRes.writeHead(200, headers);

        // body part
        stream.pipe(httpRes);
    });
}; // serveFile

exports.serve404 = serve404 = function(httpRes) {
    httpRes.writeHead(404);
    httpRes.end();
} // serve404

exports.serveStatic = function(httpReq, httpRes) {
    if (httpReq.uri.substr(0,3) === '/~/') {
        serveFile('static'+httpReq.uri.substr(2), httpReq, httpRes);
        return true;
    }
    return false;
}; // serveStatic

exports.parseUrl = function(httpReq) {
    httpReq.parsedUrl = url.parse(httpReq.url, true);
    with (httpReq.parsedUrl) pathname = decodeURI(pathname);
    httpReq.uri = httpReq.parsedUrl.pathname; // a shortcut, since this is often accessed 

    // check for directory crossing
    if (httpReq.uri.indexOf('..') >= 0) {
        httpRes.writeHead(500);
        httpRes.end('Xdir');
        return false;
    }
    
    return true;
}; // parseUrl

// a standardized way to report an assertions' errors over socket.io
exports.ioError = function(cb, message, more) {
    assert(typeof cb === 'function', 'cb');
    if (!message) return false;
    var data = {ok:false, error:message}._expand(more||{});
    if (cb) cb(ioData(data));
    return true;
}; // ioError

exports.ioOk = ioOk = function(cb, more) {
    if (!cb) return;
    assert(typeof cb === 'function', 'cb');
    var data = {ok:true}._expand(more||{});
    cb(ioData(data));
}; // ioOk

exports.setupSocketIO = function(io) {
    io.enable('browser client minification');  // send minified client
    io.enable('browser client etag');          // apply etag caching logic based on version number
    io.enable('browser client gzip');          // gzip the file
    io.set('log level', 1);                    // reduce logging
    // this next command is giving a warning. Disabled for now.
    /*io.set('transports', [                     // enable all transports (optional if you want flashsocket)
        'websocket'
      , 'flashsocket'
      , 'htmlfile'
      , 'xhr-polling'
      , 'jsonp-polling'
    ]);*/
}; // setupSocketIO 

/** for now it's only a place-holder. We'll be able to transform data in a way to optimize socket.io communications */  
exports.ioData = ioData = function(x) { return x }
