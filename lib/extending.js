///////// EXTENDING FUNCTION

Function.prototype.extend = function(key, value) {
    if (!(key instanceof Array)) key = [key];
    for (var i=0; i<key.length; i++) {
        Object.defineProperty(this.prototype, key[i], {
            enumerable: false,
            writable: true,
            value: value
        });
    }
} // extendObject


/** as function.bind(), but additional parameters are prepended instead of appended 
 * @return {function} proxied function
 */ 
Function.extend('prebind', function(){
    var args = Array.prototype.slice.call(arguments);
    var scope = args.shift();
    var fun = this;  
    return function(){
        var moreArgs = Array.prototype.slice.call(arguments);
        fun.apply(scope, moreArgs.concat(args));
    };
}); // Function.prebind

if (!Function.prototype.bind)
Function.extend('bind', function(){
    var args = Array.prototype.slice.call(arguments);
    var scope = args.shift();
    var fun = this;  
    return function(){
        var moreArgs = Array.prototype.slice.call(arguments);
        fun.apply(scope, args.concat(moreArgs));
    };
}); // Function.bind

///////// EXTENDING STRING

/* return a new string filling "this" with arguments' values.
    The filling is done in place of strings in this form {key} or this other form {key|parameter}.
    If first argument is an object, then "key" is used as field name (i.e. property) of the object.
    Otherwise "key" should be a number, and it's the argument's index (zero-based).  
    As stated before, keys can have a parameter. If such parameter is in the form \d*-\d* then these numbers
    denote a range of characters to extract (i.e. a substring). Otherwise the parameter is a property name for
    the value (that must be an object or an array in this case).
*/
String.extend(['format','x'], function() {
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
});

String.extend('repeat', function(n) {
    var r = '';
    for (var i=0; i<n; i++) r += this;
    return r;
});

String.extend('count', function(sub) {
    return this.split(sub).length-1;
});

String.extend('ss', function(from, to) {
    return this.substring(from<0 ? this.length-from : from, to<0 ? this.length+to : to);
});

String.extend('pad', function(lngt, filler) {
    return (filler || ' ').repeat(Math.max(0,lngt - this.length)) + this;
});

String.extend('escapeRegExp', function() {
    return this.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
});

String.extend('startsWith', function(sub, caseInsensitive) {
    return 0 <= this.search(new RegExp('^'+sub.escapeRegExp(), caseInsensitive ? 'i' : ''));  
});
 
String.extend('endsWith', function(sub, caseInsensitive) {
    return 0 <= this.search(new RegExp(sub.escapeRegExp()+'$', caseInsensitive ? 'i' : ''));  
});

String.extend('includeLeading', function(sub) { return this.startsWith(sub) ? this : sub+this });
String.extend('includeTrailing', function(sub) { return this.endsWith(sub) ? this : this+sub });
// if in the following function the casting to string is not made, the resulting typeof is 'object' instead of 'string' (causing problems in some cases, e.g. using path.join)
String.extend('excludeLeading', function(sub) { return this.startsWith(sub) ? this.slice(sub.length) : ''+this });
String.extend('excludeTrailing', function(sub) { return this.endsWith(sub) ? this.slice(0,-sub.length) : ''+this });

// handy shortcuts
String.prototype.low = String.prototype.toLowerCase;
String.prototype.up = String.prototype.toUpperCase;

// case insensitive test
String.extend('same', function(s){
    var threshold = 10;
    return typeof s === 'string' 
        && this.length === s.length 
        && this.substr(0,threshold).low() === s.substr(0,threshold).low()
        && this.substr(threshold).low() === s.substr(threshold).low()
}); // String.same

String.extend('in', function(s) {
    switch (typeof s) {
        case 'array':
        case 'string': return s.indexOf(this) >= 0;
        default: return false;
    }    
}); // String.in

///////// EXTENDING ARRAY

if (!Array.prototype.forEach)
Array.extend('forEach', function(fun) {
    if (typeof fun != "function")
        throw new TypeError();
    for (var i=0, l=this.length; i<l; ++i) {
        fun.call(this[i], this[i], i, this);
    }
}); // Array.forEach

if (!Array.prototype.some)
Array.extend('some', function(cb) {
    for (var i=0, l=this.length; i<l; ++i) {
        if (cb ? cb(this[i]) : this[i]) {
            return true;
        }
    }
    return false;
});  // Array.some

Array.extend('last', function(){
    return this.length ? this[this.length-1] : undefined
});

Array.extend('unique', function() {
    return this.sort().filter( function(v,i,o){ return v!==o[i-1] })
});

// as map(), but overwrite elements instead of creating a new array
Array.extend('remap', function(cb){
    for (var i=0, n=this.length; i<n; i++) {
        this[i] = cb.call(this, this[i], i, this);
    }
    return this;
});

///////// EXTENDING OBJECT

Object.extend('_getKeyOf', function(value) {
    for (var i in this)
        if (this.hasOwnProperty(i) 
        && this[i] === value)
            return i;
    return null; 
}); // Object._getKeyOf

Object.extend('_for', function(cb) {
    for (var i in this)
        if (this.hasOwnProperty(i))
            cb(this[i], i);
}); // Object._for

Object.extend('_among', function(vals) {
    if (arguments.length == 1) {
        return Array.isArray(vals)
            ? vals.indexOf(this) >= 0
            : vals.keyOf(this) !== null;   
    }
    for (var i in arguments)    
        if (arguments[i] == this)
            return true;
    return false;    
}); // Object._among

Object.extend('_expand', function(from) {
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
}); // Object._expand

Object.extend('_values', function(){
    var res = [];
    for (var i in this)
        if (this.hasOwnProperty(i))
            res.push(this[i]);
    return res; 
}); // Object._values

Object.extend('_log', function(){
    var a = [this];
    if (arguments.length) a.unshift(arguments[0]);
    return log.apply(this, a);
});

// often useful with "arguments"
Object.extend('_toArray', function() { return Array.prototype.slice.call(this) });
