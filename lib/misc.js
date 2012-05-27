//// PROJECT-WIDE FUNCTIONS

ceLib = require('cloneextend');

////// FIRST, UTILITIES WE WANT TO BE GLOBAL

GLOBAL.ABCifB = function(a,b,c) { return b ? ''+a+b+(c||'') : ''; } 

// like console.log but better: outputs multiple parameters and returns first one, so you can concatenate
GLOBAL.log = function() {
    for (var k in arguments)
        console.log(arguments[k]);
    for (var k in arguments)
        return arguments[k];
}; // log

// outputs to console and to a file (that's cleared at first writing). If 2 parameters are supplied, the first is a label to the data. 
GLOBAL.dbg = function(/*pre, */s) {
    var pre = '';
    if (arguments.length == 2) {
        pre = arguments[0]+': ';
        s = arguments[1];
    }
    var self = arguments.callee;
    if (!self.once) {
        self.once = 1;
        self.fn = 'dbg.txt';
        try { fs.unlinkSync(self.fn); } // this happens only once, who cares if it's blocking
        catch(err) {}
    }
    fs.createWriteStream(self.fn, {flags:'a'}).write(pre+s+"\n");
    console.log('DBG) %s%j', pre, s);
    return s;
}; // dbg

// used as a weaker assert() that doesn't stop execution
GLOBAL.warning = function(condition, message){ if (!condition) dbg('Condition not met',message) };

/*
meant to implement Enum's. You can pass every value as a separate parameter, or as a single parameter with space as a separator.
It returns an object with enum's values as keys, and coupled values are a "nicer".
*/
GLOBAL.Enum = function() {
    var a = (arguments.length == 1) ? arguments[0].split(' ') : arguments;
    var res = {};
    for (var i=0,l=a.length; i<l; ++i) {
        res[a[i]] = a[i].toLowerCase().replace('_',' '); // valore descrittivo, utile per eventuali output
    }
    return res; 
}; // Enum

// type-independent size calculation (currently accepting array's and object's)
GLOBAL.sizeOf = function(o) {
    if (util.isArray(o))
        return o.length;
    return Object.keys(o).length;  
}; // sizeOf

// a standardized way to report an assertions' errors over socket.io
GLOBAL.socketIoError = function(message, cb) {
    assert(!cb || typeof cb == 'function', 'cb');
    if (message) {
        if (cb) cb({error: message});
        return true;
    }
    return false;    
}; // socketIoError 

GLOBAL.ioOk = function(cb) {
    if (!cb) return;
    assert(typeof cb == 'function', 'cb');
    cb({ok:true});
};

GLOBAL.ioError = function(cb, error) {
    if (!cb) return;
    assert(typeof cb == 'function', 'cb');
    cb({ok:false, error:error});
};

exports.clone = ceLib.clone; 
exports.extend = ceLib.extend; 

exports.isWindows = function(){ return os.platform() == 'win32' };

exports.round = function(v, decimals) {
    decimals = Math.pow(10, decimals||0);
    return Math.round(v*decimals)/decimals;
} // round

exports.time = function() { return (new Date()).getTime() }

// incapsula una funzione, per evitare che venga richiamata troppo spesso
exports.delayedCall = function(delay, fun, options) {
    options = options||{};
    var res = function(){
        var args = arguments, _this = this;
        if (!res.last) {
            if (typeof options.start == 'function') options.start();
        }
        else {
            clearTimeout(res.last);
            res.last = 0;
        }
        res.last = setTimeout(function(){ 
            res.last = 0; 
            if (typeof options.over == 'function') options.over();
            fun.apply(_this, args);
        }, delay);
    };
    return res; 
}; // delayedCall

exports.setupSocketIO = function(io) {
    io.enable('browser client minification');  // send minified client
    io.enable('browser client etag');          // apply etag caching logic based on version number
    io.enable('browser client gzip');          // gzip the file
    io.set('log level', 1);                    // reduce logging
    /*io.set('transports', [                     // enable all transports (optional if you want flashsocket)
        'websocket'
      , 'flashsocket'
      , 'htmlfile'
      , 'xhr-polling'
      , 'jsonp-polling'
    ]);*/
}; // setupSocketIO 
