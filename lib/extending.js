///////// EXTENDING FUNCTION

/** as function.bind(), but additional parameters are prepended instead of appended 
 * @return {function} proxied function
 */ 
Function.prototype.prebind = function(){
    var args = Array.prototype.slice.call(arguments);
    var scope = args.shift();
    var fun = this;  
    return function(){
        var moreArgs = Array.prototype.slice.call(arguments);
        fun.apply(scope, moreArgs.concat(args));
    };
};

///////// EXTENDING STRING

/* return a new string filling "this" with arguments' values.
    The filling is done in place of strings in this form {key} or this other form {key|parameter}.
    If first argument is an object, then "key" is used as field name (i.e. property) of the object.
    Otherwise "key" should be a number, and it's the argument's index (zero-based).  
    As stated before, keys can have a parameter. If such parameter is in the form \d*-\d* then these numbers
    denote a range of characters to extract (i.e. a substring). Otherwise the parameter is a property name for
    the value (that must be an object or an array in this case).
*/
String.prototype.format = function() {
    var args = arguments;
    if (typeof args[0] == 'object')
        args = args[0];
    return this.replace(/\{([-_ a-z0-9]+)(\|([^}]+))?\}/gi, function(){
        var ret = args[arguments[1]];
        var par = arguments[3]; 
        if (par) {
            var v = /(\d*)-(\d*)/.exec(par); // is it in the "range" form?
            if (v) ret = ret.substring(v[1]-1 || 0, v[2] || ret.length); // extract the substring in range 
            else ret = ret[par]; // get property
        }
        return ret; 
    });
};

String.prototype.repeat = function(n) {
    var r = '';
    for (var i=0; i<n; i++) r += this;
    return r;
};

String.prototype.count = function(sub) {
    return this.split(sub).length-1;
};

String.prototype.ss = function(from, to) {
    return this.substring(from<0 ? this.length-from : from, to<0 ? this.length+to : to);
};

String.prototype.pad = function(lngt, filler) {
    return (filler || ' ').repeat(Math.max(0,lngt - this.length)) + this;
};

String.prototype.escapeRegExp = function() {
    return this.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
};

String.prototype.startsBy = function(sub, caseInsensitive) {
    return 0 <= this.search(new RegExp('^'+sub.escapeRegExp(), caseInsensitive ? 'i' : ''));  
};
 
String.prototype.endsBy = function(sub, caseInsensitive) {
    return 0 <= this.search(new RegExp(sub.escapeRegExp()+'$', caseInsensitive ? 'i' : ''));  
};

String.prototype.includeLeading = function(sub) { return this.startsBy(sub) ? this : sub+this }; 
String.prototype.includeTrailing = function(sub) { return this.endsBy(sub) ? this : this+sub };
// if in the following function the casting to string is not made, the resulting typeof is 'object' instead of 'string' (causing problems in some cases, e.g. using path.join)
String.prototype.excludeLeading = function(sub) { return this.startsBy(sub) ? this.slice(sub.length) : ''+this }; 
String.prototype.excludeTrailing = function(sub) { return this.endsBy(sub) ? this.slice(0,-sub.length) : ''+this }; 

// handy shortcuts
String.prototype.low = String.prototype.toLowerCase;
String.prototype.up = String.prototype.toUpperCase;

// case insensitive test
String.prototype.same = function(s){
    var threshold = 10;
    return typeof s === 'string' 
        && this.length === s.length 
        && this.substr(0,threshold).low() === s.substr(0,threshold).low()
        && this.substr(threshold).low() === s.substr(threshold).low()
}; // String.same

String.prototype.in = function(s) {
    switch (typeof s) {
        case 'array':
        case 'string': return s.indexOf(this) >= 0;
        default: return false;
    }    
}; // String.in  

///////// EXTENDING OBJECT

function extendObject(key, value) {
    Object.defineProperty(Object.prototype, key, {
        enumerable: false,    
        value: value
    });
} // extendObject

extendObject('getKeyOf', function(value) {
    for (var i in this)
        if (this.hasOwnProperty(i) 
        && this[i] === value)
            return i;
    return null; 
}); // Object.getKeyOf

extendObject('forEach', function(cb) {
    for (var i in this)
        if (this.hasOwnProperty(i))
            cb(this[i], i);
}); // Object.forEach

extendObject('isIn', function(vals) {
    if (arguments.length == 1) {
        return Array.isArray(vals)
            ? vals.indexOf(this) >= 0
            : vals.keyOf(this) !== null;   
    }
    for (var i in arguments)    
        if (arguments[i] == this)
            return true;
    return false;    
}); // Object.isIn

extendObject('extend', function(from) {
    var props = Object.getOwnPropertyNames(from);
    var dest = this;
    props.forEach(function(name) {
        if (name in dest) {
            var destination = Object.getOwnPropertyDescriptor(from, name);
            Object.defineProperty(dest, name, destination);
        }
        else {
            dest[name] = from[name];
        }
    });
    return this;
}); // Object.extend


extendObject('getProperties', function(){
    var res = [];
    for (var i in this)
        if (this.hasOwnProperty(i))
            res.push(this[i]);
    return res; 
}); // Object.getProperties
