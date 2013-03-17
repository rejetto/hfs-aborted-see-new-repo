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

// calls 'fun' if it's a function.
GLOBAL.call = function(fun) {
    var a = Array.prototype.slice.call(arguments, 1);
    var This = this;
    if (typeof fun == 'object' && typeof a[0] == 'function') {
        This = fun;
        fun = a.shift();
    }
    if (typeof fun != 'function') return;
    fun.apply(This, a);
} // call

// just accessing an object by index. It's merely for improving readability, by moving the index in front of a map of choices.
GLOBAL.choose = function(index, object, defVal) {
    return (index in object) ? object[index] : defVal;
}

/**
 * Build a function made by an expression.
 * First parameter can be accessed directly as "$1" (and so on), or with single capital letters (that will be passed in alphabetical order, not by appearance).
 * Local variables are in the form "$A" (single capital letter). Local vars are useful with the comma operator.
 */
GLOBAL.L = lmbd;
function lmbd(f) {
    if ((typeof f)._among('undefined','function')) return f; // already a function
    if (typeof f != 'string') return function(){ return f }; // anything that's not a string is returned as is
    var pars = f.match(/(^|\b)([A-Z])($|\b)/g); // gather parameters in the form of single capital letter. Order is determined by alphabetical order, not appearance in the body.
    pars = pars ? pars.unique().join(',') : ''; // this is also sorting
    var localVars = f.match(/(\$[A-Z])($|\b)/g); // gather local variables in the form of a $ followed by single capital letter.
    localVars = localVars ? 'var '+localVars.unique().join(',')+';' : '';
    f = f.replace(/\$\d\b/g, function(v) { return 'arguments['+(v.substr(1)-1)+']' }); // translate parameters in the ordinal form: "$1" is first parameter, "$2" etc
    return eval('(function('+pars+'){ '+localVars+' return '+f+' })');
}// lmbd



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
