//// PROJECT-WIDE FUNCTIONS

ceLib = require('cloneextend');

////// FIRST, UTILITIES WE WANT TO BE GLOBAL

GLOBAL.ABCifB = function(a,b,c) { return b ? ''+a+b+(c||'') : ''; } 

// like console.log but better: outputs multiple parameters and returns first one, so you can concatenate
GLOBAL.log = function() {
    var last;
    for (var k in arguments) {
        console.log(last = arguments[k]);
    }
    return last;
}; // log

// outputs to console and to a file (that's cleared at first writing). If 2 parameters are supplied, the first is a label to the data. 
GLOBAL.dbg = function(/*pre, */s) {
    var pre = '';
    if (arguments.length === 2) {
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
    var stream = fs.createWriteStream(self.fn, {flags:'a'});
    stream.write(pre+s+"\n");
    stream.end();
    console.log('DBG) ', pre, s);
    return s;
}; // dbg

// used as a weaker assert() that doesn't stop execution
GLOBAL.warning = function(condition, message){ if (!condition) dbg('Condition not met',message) };

/*
meant to implement Enum's. You can pass every value as a separate parameter, or as a single parameter with space as a separator.
It returns an object with enum's values as keys, and coupled values are a "nicer".
*/
GLOBAL.Enum = function() {
    var a = (arguments.length === 1) ? arguments[0].split(' ') : arguments;
    var res = {};
    for (var i=0,l=a.length; i<l; ++i) {
        res[a[i]] = a[i].toLowerCase().replace('_',' '); // we give a descriptive value, useful when outputting
    }
    return res; 
}; // Enum

// type-independent size calculation (currently accepting array's and object's)
GLOBAL.sizeOf = function(o) {
    if (util.isArray(o))
        return o.length;
    return Object.keys(o).length;  
}; // sizeOf


exports.clone = ceLib.clone; 
//exports.extend = ceLib.extend.bind(ceLib);   we are currently using {}.extend instead of this 

exports.isWindows = os.platform() === 'win32';
exports.caseSensitiveFileNames = !exports.isWindows;

exports.sameFileName = function(a,b) {
    return exports.caseSensitiveFileNames ? a === b : a && a.same(b);
}; // sameFileName

exports.round = function(v, decimals) {
    decimals = Math.pow(10, decimals||0);
    return Math.round(v*decimals)/decimals;
} // round
