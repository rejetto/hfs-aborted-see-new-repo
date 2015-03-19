require('./libs');
var mime = require('./mime');
var url = require('url');

exports.serveFile = serveFile = function(file, httpReq, httpRes, options) {
    assert(file && httpReq && httpRes, 'bad args');
    var o = options||{}; // shortcut
    var v, code, firstByte, lastByte;
    try {
        var stats = o.stats; // cached stat result
        if (!stats) { // or ask now
            try { stats = fs.statSync(file) } //TODO make it async
            catch(err) {
                return code=choose(err.code, { // try specific response code
                    ENOENT: 404 // not found
                }, 500); // default code: internal server error
            }
        }
        if (!stats.isFile()) return code=403;

        // browser cache support, by timestamp
        var etag = '"'+(+stats.mtime+'')+'"'; // more accurate than GMT string
        if (v = httpReq.headers['if-none-match']) {
            if (v===etag)
                return code=304;
        }
        else if (v = httpReq.headers['if-modified-since']) { // this can be misleading, so let's trust the etag check
            v = new Date(v);
            if (!(v-stats.mtime))
                return code=304; // not modified
        }

        var fileOptions = { flags:'r' };
        var replyHeaders = {};

        var size = stats.size;
        if (v = httpReq.headers['range']) {
            v = v.match(/bytes=(\d+)?-(\d+)?/); // parse
            if (!v) return code=416; // range not satisfiable
            if (v[1]) {
                fileOptions.start = 1*v[1];
            }
            if (v[2]) {
                if (v[1] === undefined) {
                    fileOptions.start = size-v[2];
                }
                else {
                    fileOptions.end = 1*v[2];
                }
            }
            if (fileOptions.start > size
            || fileOptions.end > size) return code=416;
            code = 206;
            replyHeaders['Content-Range'] = 'bytes {start}-{end}/{1}'.x(fileOptions, size);
        }
        var firstByte = fileOptions.start || 0;
        var lastByte = ('end' in fileOptions) ? fileOptions.end : size-1;

        var stream = fs.createReadStream(file, fileOptions);
        if (!stream) return code=403;

        // finish header
        replyHeaders._expand({
            'Content-Disposition': o.download && 'attachment; filename="{0}"'.x(o.name || path.basename(file)),
            'Content-Type': o.mime || mime.fromFile(file) || 'application/octet-stream',
            'Content-Length': lastByte-firstByte+1,
            'ETag': etag,
            'Last-Modified': stats.mtime.toGMTString()
        })._filter('A !== undefined');
        httpRes.writeHead(code||200, replyHeaders);

        // start body
        stream.pipe(httpRes);
        httpRes = null; // inform below that we did it
    }
    finally {
        if (!httpRes) return;
        httpRes.writeHead(code||500); // code may be undefined if an exception arose
        httpRes.end();
        if (stream)
            stream.close();
    }
}; // serveFile

exports.serve = serve= function(httpRes, code, body/*optional*/) {
    httpRes.writeHead(code);
    httpRes.end(body);
}; // serve

exports.serveStatic = function(httpReq, httpRes) {
    var u = httpReq.uri;
    if (u.substr(0,3) === '/~/') {
        serveFile('static'+u.substr(2), httpReq, httpRes);
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

/** for now it's only a place-holder. We'll be able to transform data in a way to optimize socket.io communications */
exports.ioData = ioData = function(x) { return x }

exports.sockets = function(httpSrv, events) {
    var io = require('socket.io')(httpSrv);
    // this next command is giving a warning. Disabled for now.
    io.on('connection', function(sk){
        events._for(function(h, ev) {
            sk.on(ev, function(data, cb){
                ioData(data);
                dbg(ev, data);
                h.apply(this, arguments);
            });
        });
    });
    return {
        broadcast: function(event, data) {
            io.sockets.emit(event, ioData(data));
        }
    }
} // sockets

/*
 var srv = require('sockjs').createServer();
 srv.installHandlers(httpSrv);
 var dnode = require('dnode');
 srv.on('connection', function(sk){
 var d = dnode(events);
 d.pipe(sk).pipe(d);
 });
 */
