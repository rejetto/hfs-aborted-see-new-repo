require('./common');
var mime = require('./mime');
var url = require('url');

exports.serveFile = serveFile = function(file, httpRes, size, mime_) {
    fs.exists(file, function(exists) {
        if (!exists) {
            serve404(httpRes);
            return;
        }
        var stream = fs.createReadStream(file);
        var headers = {
            'Content-Type': mime_ || mime.fromFile(file) || 'application/octet-stream'
        };
        if (size) {
            headers['Content-Length'] = size;
        }
        httpRes.writeHead(200, headers);
        stream.pipe(httpRes);
    });
}; // serveFile

exports.serve404 = serve404 = function(httpRes) {
    httpRes.writeHead(404);
    httpRes.end();
} // serve404

exports.serveStatic = function(httpReq, httpRes) {
    if (httpReq.uri.substr(0,3) === '/~/') {
        serveFile('static'+httpReq.uri.substr(2), httpRes);
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
exports.ioError = function(message, cb, more) {
    if (!cb) return;
    assert(typeof cb === 'function', 'cb');
    if (message) {
        var data = {ok:false, error:message}.extend(more||{}); 
        if (cb) cb(ioData(data));
        return true;
    }
    return false;    
}; // ioError 

exports.ioOk = ioOk = function(cb, more) {
    if (!cb) return;
    assert(typeof cb === 'function', 'cb');
    var data = {ok:true}.extend(more||{});
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
