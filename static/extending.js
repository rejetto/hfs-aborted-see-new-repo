/**
 * @author Massimo Melina <a@rejetto.com>
 */
if (typeof GLOBAL === 'undefined') GLOBAL=window;

if (!GLOBAL.assert)
function assert(condition, message) {
    if (!condition) throw 'ASSERT failed'+ (message ? ': '+message : '');
} // assert

GLOBAL.L = lmbd;

/**
 * Build a function made by an expression. All exceptions in it are catched and undefined is returned.
 * First parameter can be accessed directly as "$1" (and so on), or with single capital letters (that will be passed in alphabetical order, not by appearance).
 * Local variables are in the form "$A" (single capital letter). Local vars are useful with the comma operator.
 * The local closure can be extended with more variables by passing $inject, and it can be accessed as "P0". If it's an object, all it's values are accessed directly by the keys (e.g. passing {a:1} you get "a" in the scope, and its value is 1)
 */
function lmbd(f, inject) {
    if ((typeof f)._among('undefined','function')) return f; // already a function
    if (typeof f != 'string') return function(){ return f }; // anything that's not a string is returned as a "constant" function
    // efficient support for inner lambda functions, defined by the literal L"expression". We must do this before the rest, so the inner simbols don't get parsed by this level.
    var inners = f.match(/L(['"])[^'"]+\1/g); // parse
    if (inners) {
        var innerLambdas = [];
        for (var a=inners, i=0; i<a.length; i++) {
            innerLambdas[i] = lmbd(a[i].ss(2,-1)); // create the local function
            f=f.replace(a[i], 'innerLambdas['+i+']'); // refer to it
        }
    }
    var fNoStrings = f.replace(/'(?:\\'|[^'])*'|"(?:\\"|[^"])*"/g, ''); // get a version with all strings removed
    var pars = fNoStrings.match(/(^|\b)[A-Z]($|\b)/g); // gather parameters in the form of single capital letter.
    pars = pars ? pars.unique() : ''; // this also sorts the array, as a side effect, and we like it because order is determined by alphabetical order, not appearance in the body
    var localVars = (fNoStrings.match(/\$[A-Z]($|\b)/g) ||[]).unique(); // gather local variables in the form of a $ followed by single capital letter.
    try { localVars.append(fNoStrings.match(/\$[1-9]($|\b)/g).map('A+"=arguments["+(A[1]-1)+"]"')) }catch(e){}; // translate parameters in the ordinal form: "$1" is first parameter, "$2" etc
    localVars = localVars.length ? 'var '+localVars+';' : '';

    var injectVars = [];
    if (inject) injectVars.push('P0=inject');
    if (inject instanceof Array) injectVars.append((fNoStrings.match(/(^|\b)P[1-9]($|\b)/g) || []).map('A+"=P0["+(A[1]-1)+"]"')); // P1 will access first item of P0, and so on...
    else if (inject instanceof Object) injectVars.append(inject._mapToArray('$2+"=inject."+$2'));
    injectVars = injectVars.length ? 'var '+injectVars+';' : '';

    f = '(function(){ '+injectVars+' return (function('+pars+'){ try { '+localVars+' return '+f+' } catch(e){} }) })()';
    try { return eval(f) }
    catch(e) {
        if (e instanceof SyntaxError)
            log('SyntaxError in lambda: '+arguments[0]);
        throw e;
    }
}// lmbd

/////////////// FUNCTION

Function.prototype.extend = function(key, value) {
    var pr = this.prototype;
    var a = (key instanceof Array ? key : [key]);
    for (var i=a.length; i--;) {
        Object.defineProperty(pr, a[i], {
            enumerable: false,
            writable: true,
            value: value
        });
    }
}; // Class.extend

Function.prototype.bind ||
Function.extend('bind', function(){
    var args = arguments._toArray();
    var scope = args.shift();
    var fun = this;
    return function(){
        fun.apply(scope, args.concat(arguments._toArray()));
    };
}); // Function.bind

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

/////////////// ARRAY

Array.prototype.forEach ||
Array.extend('forEach', function(fun) {
    if (typeof fun != "function")
        throw new TypeError();
    for (var i=0, l=this.length; i<l; ++i) {
        fun.call(this[i], this[i], i, this);
    }
}); // Array.forEach

Array.prototype.some ||
Array.extend('some', function(cb) {
    for (var i=0, l=this.length; i<l; ++i) {
        if (cb ? cb(this[i]) : this[i]) {
            return true;
        }
    }
    return false;
});  // Array.some

// as map(), but overwrite elements instead of creating a new array
Array.extend('remap', function(cb){
    for (var i=0, n=this.length; i<n; i++) {
        this[i] = cb.call(this, this[i], i, this);
    }
    return this;
});

// like remap(), but recursively over arrays and objects
Array.extend('remapRecur', function(cb){
    for (var i=0; i<this.length; i++) {
        var v = this[i];
        var w = cb.call(this, v, i, this);
        if (w !== undefined) {
            this[i] = v = w;
        }
        if (v.remapRecur) {
            v.remapRecur(cb);
        }
        else if (typeof v == 'object') {
            v._remapRecur(cb);
        }
    }
    return this;
});

// array values become the keys, and you pass the values as parameter (in case of a function is treated as a callback, use noCB to change this behaviour)
Array.extend('toObjectKeys', function(val, noCB){
    var ret = {};
    for (var i= 0, n=this.length; i<n; i++) {
        var k = this[i];
        ret[k] = (typeof val == 'function' && !noCB) ? val(k,i,this) : val; // yes, if you don't pass it you'll get undefined. Acceptable.
    }
    return ret;
}); // toObjectKeys

/* create an object, the keys are provided by the callback, and the values are the array values.
    If you want to provide the whole pair key/value, you can return an array [key,value], or an object {key:value}.
    Please note in this latter case, you may provide as many pairs you want.
 */
Array.extend('toObject', function(cb/*v,k*/){
    var ret = {};
    for (var i= 0, n=this.length; i<n; i++) {
        var v = cb.call(this, this[i], i, this);
        if (v instanceof Array && v.length>=2) ret[v[0]] = v[1];
        else if (v instanceof Object) ret._expand(v);
        else ret[v] = this[i];
    }
    return ret;
});

// all Array methods with a callback parameter will accept also a string that will be converted to function via L()
L && ['toObject','toObjectKeys','remap','remapRecur','map','every','filter','reduce','reduceRight','some'].forEach(function(k){
    var old = Array.prototype[k];
    Array.extend(k, function(){
        var a = arguments._toArray();
        a[0] = L(a[0]);
        return old.apply(this, a);
    });
});

/* A better sort. It accepts same parameters as original one, plus you can pass the sorting criteria as a single string.
 If the string begins with a "." the rest is the property determining the order. A final "!" will invert the order.
 If the string doesn't begin with a "." then it's passed to L() to build a lambda function.
 */
L && (function(){
    var old = Array.prototype.sort;
    Array.extend('sort', function(f){
        if (typeof f == 'string' && f[0] === '.') {
            if (f.ss(-1) === '!') {
                var invert = true;
                f = f.ss(0, -1); // remove character
            }
            f = 'A{0}<B{0} ? -1 : A{0}>B{0} ? +1 : 0'.x(f);
            if (invert) f = '-('+f+')';
        }
        f = L(f);
        return old.call(this,f);
    })
})();

// return first element accepted by the callback. In case of non-boolean returned value, the value is returned instead of the element.
Array.extend('first', function(cb){
   cb = L(cb);
   for (var i= 0, n=this.length; i!==n; i++) {
        var res = cb.call(this, this[i], i);
        if (res) return res===true ? this[i] : res;
   }
}); // Array.first

// like splice, but supports negative indexes and returns the final array instead of the removed elements
Array.extend('remove', function(from, to) {
    if (from < 0) from += this.length;
    if (to < 0) to += this.length;
    this.splice(from, to ? to-from+1 : Infinity);
    return this;
}); // Array.remove

// remove any occurrence of the specified parameter. If an array is supplied, its single values are considered.
Array.extend('removeItems', function(it, returnRemoved) {
    var i = this.length; // cursor
    var n = 0; // counter of items to delete at cursor position
    var removed = [];
    while (i--) {
        if (it instanceof Function ? it.call(this, this[i], i) : (this[i] === it || it instanceof Array && it.contains(this[i]))) {
            n++;
        }
        else if (n) {
            var a = this.splice(i+1,n);
            if (returnRemoved) removed.append(a);
            n = 0;
        }
    }
    a = n && this.splice(i+1,n);
    if (a && returnRemoved) removed.append(a);
    return returnRemoved ? removed : this;
}); // Array.removeItems

// keeps only elements that appears in the $otherArray
Array.extend('intersect', function(otherArray) {
    if (!otherArray) return this;
    assert(otherArray instanceof Array, 'bad args');
    this.removeItems(function(it){
        return !otherArray.contains(it)
    });
    return this;
}); // Array.intersect

Array.extend('clone', function() { return this.slice() });

// new array with elements belonging to just one of the two arrays
Array.extend('xor', function(otherArray) {
    return this.clone().removeItems(otherArray).concat(otherArray.clone().removeItems(this));
});

Array.extend('unique', function() {
    return this.sort().filter( function(v,i,o){ return v!==o[i-1] })
});

Array.extend('addUnique', function(v){
    if (!this.contains(v)) this.push(v);
    return this;
}) // addUnique

Array.extend('contains', function(v) { return this.indexOf(v) >= 0 });

Array.extend('last', function(){
    return this.length ? this[this.length-1] : undefined
});

Array.extend('for', function(cb){
    if (!cb) return this;
    cb = L(cb);
    if (cb.length > 1) {
        for (var i= 0, last=this.length; i<=last; i++) {
            if (cb.call(this, this[i], i, i===last) === false) break;
        }
    }
    else {
        this.forEach(cb);
    }
    return this;
});

Array.extend('move', function(from, to) {
    this.splice(to, 0, this.splice(from, 1)[0]);
    return this;
}); // Array.move

Array.extend('replace', function(other) {
    if (other instanceof Array) {
        this.splice.apply(this, [0,Infinity].concat(other));
    }
    return this;
}); // Array.replace

// like concat() but affects this instance
Array.extend('append', function(other) {
    if (other instanceof Array) {
        for (var i=0, a=other, n=a.length; i<n; i++) {
            this.push(a[i]);
        }
    }
    else {
        this.push(other);
    }
    return this;
}); // Array.append

/////////////// STRING

/* return a new string filling "this" with arguments' values.
 The filling is done in place of strings in this form {key} or this other form {key|parameter}.
 If the key is a number, then it is to be replaced with corresponding indexed argument (zero-based).
 If the key is not a number, then it's a short form for {0.key}, thus accessing the first argument.
 Keys can have subfields in the form {0.sub1.sub2}, to access objects' properties.
 As stated before, keys can have a parameter. If such parameter is in the form \d*-\d* then these numbers
 denote a range of characters to extract (i.e. a substring). Otherwise the parameter is a property name for
 the value (that must be an object or an array in this case).
 */
String.extend(['format','x'], function(){
    var args = arguments;
    var me = this;
    return this.replace(/\{([-._ a-z0-9]+)(?:\|([^}]+))?\}/gi, function(whole,key,parameter){
        // {key} accesses arguments at any depth
        var ret = args;
        for (var i=0, a=key.split('.'), n=a.length; ret && i<n; i++) {
            var k = a[i];
            if (i==0 && isNaN(parseInt(k))) ret = args[0]; // if {key} it doesn't start with a number, then it's equivalent to {0.key}
            var next = ret[k];
            ret = (next instanceof Function) ? next.call(ret) : next;
        }
        if (parameter && ret) {
            var v = /(\d*)-(\d*)/.exec(parameter); // range form?
            if (v) {
                ret = String(ret);
                ret = ret.substring(v[1]-1 || 0, v[2] || ret.length) // extract the substring in range
            }
        }
        return (ret === undefined) ? (me.skipUndefined ? whole : '')
            : (ret === null || ret === false) ? ''
            : ret;
    });
});

// like 'x', but will leave untouched all symbols resulting undefined
String.extend('xDefined', function(){
    this.skipUndefined = true;
    var ret = this.x.apply(this, arguments);
    delete this.skipUndefined;
    return ret;
}); // xDefined

// case insensitive test
String.extend('same', function(s){
    var threshold=100, sample=10; // not sure this is going to speed things up, benchmarks are welcome 
    return typeof s === 'string'
        && this.length === s.length
        && (s.length<threshold || this.substr(0,sample).low() === s.substr(0,sample).low())
        && this.low() === s.low()
}); // String.same

String.extend('contains', function(substring) { return this.indexOf(substring) >= 0 });
String.extend('startsWith', function(substring) { return this.indexOf(substring) === 0 });
String.extend('endsWith', function(substring) { return this.substr(-substring.length) === substring });
String.extend('low', ''.toLowerCase);
String.extend('up', ''.toUpperCase);
String.extend('capital', function(){
    var v = this;
    if (!v.length) return '';
    if (v[1] < 'a') v = v.low(); // examine last letter to see if the string is all caps
    return v[0].up()+v.slice(1);
});
String.extend('includeLeading', function(sub) { return this.startsWith(sub) ? this : sub+this });
String.extend('includeTrailing', function(substring) { return this.endsWith(substring) ? this.toString() : this+substring });
// if in the following function the casting to string is not made, the resulting typeof is 'object' instead of 'string' (causing problems in some cases, e.g. using path.join)
String.extend('excludeLeading', function(sub) { return this.startsWith(sub) ? this.slice(sub.length) : ''+this });
String.extend('excludeTrailing', function(sub) { return this.endsWith(sub) ? this.slice(0,-sub.length) : ''+this });

String.extend('toUnderscores', function(){
    var s = this.low();
    for (var i=s.length; --i > 1; ) {
        if (s[i] != this[i]) { // case changed in the middle
            s = s.substr(0,i)+'_'+ s.substr(i);
        }
    }
    return s;
}); // String.toUnderscores

String.extend('toCamel', function(){
    var s = this;
    for (var i=s.length-1; --i > 0;) {
        if (s[i] == '_') {
            s = s.substr(0,i)+ s[i+1].up() +s.substr(i+2);
        }
    }
    return s.valueOf();
}); // String.toCamel

String.extend('toHTML', function(){
    var x = String;
    if (!x.div) x.div = document.createElement('div');
    x.div.innerText = this;
    return x.div.innerHTML;
}); // String.toHTML

String.extend('limit', function(max, options){
    var o = (options || {});
    if (typeof o == 'string') o = { ending:o };
    return this.substr(0, max)
        + (this.length > max ? (o.ending||'...') : '');
});

String.extend('ss', function(from, to) {
    return (to === undefined)
        ? this.substr(from)
        : this.substring(from<0 ? this.length-from : from, to<0 ? this.length+to : to);
});

String.extend('pad', function(lngt, filler) {
    return (filler || ' ').repeat(Math.max(0,lngt - this.length)) + this;
});

String.extend('escapeRegExp', function() {
    return this.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
});

String.extend('till', function(pattern){ return this.ss(0, 1+this.indexOf(pattern)) });

String.extend('toDate', function(){ return renderers.date(this) });
String.extend('toDateTime', function(){ return renderers.datetime(this) });
String.extend('toTime', function(){ return renderers.time(this) });

/* Split the string on separator substring, but only up to $max pieces.
 * Differently from calling split(separator, max), the rest of the string is not discarded but left glued in the last token.
 * Returns:
 *      an array with the string split in pieces. The array length is minimum 1 and max $max.
 *      Can be shorter than $max if there are not enough separators in the string.
 * Parameters:
 *      padding(optional|function|*): if $padding is specified, then the returned array will always be $max long. Missing
 *         values will be filled with $padding, unless it's a function, in that case the value is calculated using
 *         the function, which is called passing following parameters:
 *             1) the array that will be returned by splitMax
 *             2) current length of the first parameter. Of course you could just calculate this parameter from the first
 *                parameter. This is both a convenience and a way to optimize: if your function will take just one parameter
 *                then it will be called just once, and its value duplicated for every padded element. When the second
 *                parameter is accepted instead, the function will be called for every padded element.
 */
String.extend('splitMax', function(separator, max, padding){
    assert(separator && max, 'bad args');
    var ret = [];
    var s = this.valueOf();
    while (--max) {
        var i = s.indexOf(separator);
        if (i < 0) break;
        ret.push(s.substr(0,i));
        s = s.substr(i+separator.length);
    }
    ret.push(s);
    if (max && padding !== undefined) {
        // optimization: the function doesn't care the the index (second parameter), so we can calculate it only once
        if (padding instanceof Function && padding.length < 2) padding = padding(ret);
        // do the padding
        while (max--) {
            ret.push( padding instanceof Function ? padding(ret, ret.length) : padding );
        }
    }
    return ret;
}); // splitMax

String.extend('repeat', function(n){ return Array(n+1).join(this) });

String.extend('count', function(sub) {
    return this.split(sub).length-1;
});

/////////////// NUMBER

Number.extend('for', function(cb/*index,isLast*/){
    cb = L(cb);
    var n = this;
    for (var i=0; i<n; i++) cb(i, i===n);
});

////////////// MULTIEXEC

RegExp.extend('multiExec', function(s){
    var m, ret=[];
    while (m = this.exec(s))
        ret.push(m);
    return ret.length ? ret : null; // like exec() does
}); // multiExec

/////////////// DATE

Date.SECOND = 1000;
Date.MINUTE = 60*Date.SECOND;
Date.HOUR = 60*Date.MINUTE;
Date.DAY = 24*Date.HOUR;

/////////////// OBJECT

// remove some properties
Object.extend('_remove', function(keys) {
    var a = arguments;
    if (a.length > 1) keys = a._toArray();
    else if (typeof keys == 'string' && keys[0]===',') {
        keys = keys.split(',').slice(1);
    }
    else keys = [keys];
    for (var i=keys.length; i--;)
        delete this[keys[i]];
    return this;
}); // Object._remove

// filter properties of this object, leaving only some of them. Accepted: array of keys, callback(value,key), string(lambda expression), string(csv starting with a comma to distinguish from lambda)
Object.extend('_filter', function(what) {
    if (typeof what == 'string') {
        what = (what.startsWith(',')) ? what.ss(1).split(',') : L(what);
    }
    if (what instanceof Array) {
        var arr = what; // need closure
        what = function(v,k){ return arr.contains(k) };
    }
    assert(typeof what == 'function', 'bad args');
    for (var k in this) {
        if (!what.call(this, this[k], k)) {
            delete this[k];
        }
    }
    return this;
}); // Object._filter

// return first element accepted by the callback. In case of non-boolean returned value, the value is returned instead of the element.
Object.extend('_first', function(cb){
    cb = L(cb);
    for (var i in this) {
        var res = cb.call(this, this[i], i);
        if (res) return res===true ? this[i] : res;
    }
}); // Object._first

// if $properties is not passed, the whole object is cloned
Object.extend('_clone', function(properties){
    if (!properties) {
        return (this instanceof Array) ? this.slice()
            : (this instanceof Date) ? new Date(this)
            : ({})._expand(this);
    }
    var ret = {};
    if (properties instanceof Function) {
        var cb = properties;
        for (var k in this) {
            if (cb.call(this,this[k],k,this)) {
                ret[k] = this[k];
            }
        }
        return ret;
    }
    if (typeof properties == 'string') properties = properties.split(',');
    for (var a=properties, i=a.length; i--;) {
        var k = a[i];
        if (k in this) {
            ret[k] = this[k];
        }
    }
    return ret;
}); // Object._clone

// returns a new object made by merging this and another
Object.extend('_plus', function(another){ return this._clone()._expand(another) });

Object.extend('_expand', function(another){
    switch (typeof another) {
        case 'object':
            if (GLOBAL.Ext) Ext.apply(this, another)
            else if (GLOBAL.jQuery) jQuery.extend(this, another)
            else if (GLOBAL.ceLib) ceLib.extend(this, another)
            else throw 'N/A';
            break;
        case 'string':
            this[another] = arguments[1];
            break;
        case 'undefined':
            break;
        default: assert(0, 'bad args');
    }
    return this;
}); // Object._expand

Object.extend('_expandIf', function(another){
    for (var k in another) {
        if (!this.hasOwnProperty(k)) {
            this[k] = another[k];
        }
    }
    return this;
}); // Object._expandIf

Object.extend('_count', function(){ return Object.keys(this).length });

Object.extend('_keys', function(){ return Object.keys(this) });

/*
    Parameters
        filter (csv,array,object,callback(k,v)): as Object._filter, it is meant to keep only the values giving positive results.
            In case of csv and array, you specify the keys to keep. Same with object, we keep the keys that have positive values.
            With callback you have to return positive value as well. System will tell CSVs from lambdas by a starting comma.
 */
Object.extend('_values', function(filter){
    var res = [];
    if (typeof filter === 'string') {
        filter = (filter[0]===',') ? filter.split(',').slice(1).toObjectKeys(1) : L(filter);
    }
    for (var i in this) {
        if (!this.hasOwnProperty(i)
        || filter instanceof Function && !filter.call(this,this[i],i,this)
        || filter instanceof Array && !filter.contains(i)
        || filter instanceof Object && !filter[i]) continue;
        res.push(this[i]);
    }
    return res;
}); // Object._values

Object.extend('_isEmpty', function () {
    for (var k in this) return false;
    return true;
}); // Object._isEmpty

Object.extend('_for', function(cb) {
    cb = L(cb);
    for (var k in this ) {
        if (this.hasOwnProperty(k)) {
            if (cb.call(this, this[k], k) === false) break;
        }
    }
    return this;
}); // Object._for

// returns a new object with same keys but mapped values
Object.extend('_map', function(cb/*v,k*/, filter){
    if (typeof cb==='string' && cb.endsWith('||SKIP')) {
        filter = true;
        cb = cb.ss(0,-6);
    }
    cb = L(cb);
    var ret = {};
    for (var k in this) {
        var v = cb.call(this, this[k], k);
        if (!filter || filter && v) ret[k] = v;
    }
    return ret;
}); // Object._map

// returns a new array with values obtained from a callback
Object.extend('_mapToArray', function(cb/*v,k*/, filter){
    if (typeof cb==='string' && cb.endsWith('||SKIP')) {
        filter = true;
        cb = cb.ss(0,-6);
    }
    cb = L(cb);
    var ret = [];
    for (var k in this) {
        try {
            var v = cb.call(this, this[k], k)
            if (!filter || filter && v) ret.push(v);
        }catch(e){}
    }
    return ret;
}); // Object._mapToArray

// often useful with "arguments"
Object.extend('_toArray', function() { return Array.prototype.slice.call(this) });

// as map(), but overwrite elements instead of creating a new object
Object.extend('_remap', function(cb){
    cb = L(cb);
    for (var k in this) {
        this[k] = cb.call(this, this[k], k);
    }
    return this;
}); // Object._remap

// like remap, but recursively over arrays and objects
Object.extend('_remapRecur', function(cb){
    cb = L(cb);
    for (var k in this) {
        var v = cb.call(this, this[k], k);
        if (v  === undefined) v = this[k];
        if (v.remapRecur) {
            v.remapRecur(cb);
        }
        else if (typeof v == 'object') {
            v._remapRecur(cb);
        }
    }
    return this;
}); // Object._remapRecur

// as remap(), but overwrite keys instead of values. Callback should return the new key name as string, or an array if you want the value to be associated to multiple keys. You can also return an object ( newKey:newValue, more:more }. Returning undefined or the same key will leave it unchanged, while null will delete the entry.
Object.extend('_remapKeys', function(cb){
    cb = L(cb);
    for (var k in this) {
        var v = this[k];
        var r = cb.call(this, v, k);
        if (r instanceof Array) {
            r = r.toObjectKeys(v, true);
        }
        if (r instanceof Object) {
            if (!(k in r)) delete this[k];
            this._expand(r);
            continue;
        }
        if (r === undefined) continue;
        if (r === k) continue;
        if (r !== null) this[r] = v;
        delete this[k];
    }
    return this;
}); // Object._remapKeys

Object.extend('_among', function(values){
    if (arguments.length > 1) {
        values = arguments._toArray();
    }
    if (!values) return false;
    assert(values instanceof Array, 'bad args');
    return values.contains(this.valueOf());
}); // Object._among

// same as log(), but syntactically useful because you don't have to surround the code with parenthesis, just append ._log()
Object.extend('_log', function(){
    if (arguments.length) log(arguments[0]);
    return log(this.valueOf());
});

//Object.extend('_same', function(other){ return JSON.stringify(this) == JSON.stringify(other) });

// $strict is true by default. Without strict comparison ""==false && 3=="3"
Object.extend('_same', function(other, strict){
    if (strict === undefined) strict = true; // default value
    // if $other is a primitive, then try to compare with the primitive version of $this. Someone may instead like to convert $other into an object and continue, because $this may be for example a modified Number.
    if (!(other instanceof Object))
        return this.valueOf() === other;
    // ok, $other is an object too, we must have all its properties
    for (p in other) {
        if (!(p in this))
            return false;
    }

    for(var p in this) {
        // it must have all our properties
        if (!(p in other)) return false;
        var mine = this[p];
        var its = other[p];
        if (mine === its) continue; // strictly equal is enough
        if (strict && typeof mine !== typeof its) return false; // type check in strict mode
        switch (typeof mine) {
            case 'object':
                if (!mine._same(its, strict))
                    return false;
                break;
            case 'function':
                if (mine.toString() !== its.toString())
                    return false;
                break;
            default: // primitive types
                if (strict || mine != its) return false; // in strict mode it already failed the strict-comparison above. In loose mode we check the loose way.
        }
    }

    return true;
});

Object.extend('_indexOf', function(value){
    for (var k in this) {
        if (this[k] == value) {
            return k;
        }
    }
}); // Object._indexOf

Object.extend('_some', function(cb){
    cb = L(cb);
    for (var k in this) {
        if (cb.call(this, this[k], k))
            return true;
    }
    return false;
}); // Object._some

Object.extend('_every', function(cb){
    cb = L(cb);
    for (var k in this) {
        if (!cb.call(this, this[k], k))
            return false;
    }
    return true;
}); // Object._every

Object.extend('_apply', function(cb){
    L(cb).call(this);
    return this;
}); // Object._apply

Object.extend('_flatten', function(separator, maxDepth){
    if (separator === undefined) separator = '.';
    if (maxDepth === undefined) maxDepth = Infinity;
    var ret = arguments[2]||{};
    var prefix = arguments[3];
    for (var k in this) {
        var v = this[k];
        if (prefix) k = prefix+separator+k;
        if (maxDepth && v instanceof Object) v._flatten(separator, maxDepth-1, ret, k);
        else ret[k] = v;
    }
    return ret;
}); // Object._flatten

// returns an object with all items of this object, except those with same key/value in $other
Object.extend('_diff', function(other){
    var ret = {};
    for (var k in this) {
        if (other[k] !== this[k])
            ret[k] = this[k];
    }
    return ret;
}); // Object._diff

Object.extend('_invert', function(separator){
    var ret = {};
    for (var k in this) {
        if (this.hasOwnProperty(k)) {
            ret[this[k]] = k;
        }
    }
    return ret;
}); // Object._invert

/* search for objects that will meet $condition, recurring on keys. It's mainly an utility for debugging.
 * Returns an object where values are the objects found, and the keys are paths.
 * $condition(json|lambda|function)
 * $options(optional|object) supports
 *      first(boolean): will stop at first result
 *      timeout(numeric): a timeout in ms
 *      depth(numeric): limit depth of recursion
 *      exclude(array of string): keys to not recur on
 */
Object.extend('_find', function(condition, options){
    if (typeof condition === 'string') { // json or lambda
        try {
            var search = JSON.parse(condition);
            condition = function(){
                for (var k in this) {
                    if (this.hasOwnProperty(k)
                        && this[k]===search
                        && !(options.exclude && options.exclude.contains(k)))
                        return true;
                }
                return false;
            };
        }
        catch(e) {
            condition = L(condition);
        }
    }
    assert(condition instanceof Function, 'bad args');
    // data to carry on on recursion
    var carryOn = arguments[2];
    if (!carryOn) {
        carryOn = { depth:0, path:'', res:{}, noRecur:[], start:new Date() };
        if (!options) options = {};
        if (options.exclude && !(options.exclude instanceof Array)) {
            options.exclude = [options.exclude];
        }
    }
    var path = carryOn.path;
    var res = carryOn.res;
    var noRecur = carryOn.noRecur; // keep track of what we already worked

    // search here
    if (condition.call(this, this)) {
        res[path] = this;
        if (options.first) return res;
    }

    // search inside
    noRecur.push(this);
    var tout = tryGet(options,'timeout',1000);
    for (var k in this) {
        if (tout && ((new Date()-carryOn.start) > tout)) {
            if (!res._ERROR) res._ERROR = { msg:'timeout', path:path, obj:this };
            return res;
        }
        if (carryOn.depth > options.depth) continue;
        if (!this.hasOwnProperty(k)) continue;
        if (options.exclude && options.exclude.contains(k)) continue;
        var v = this[k];
        if (!(v instanceof Object)) continue;
        if (noRecur.contains(v)) continue;
        carryOn.path = (path ? path+' / ' : '')+k;
        ++carryOn.depth;
        if (v._find(condition, options, carryOn)
            && (options.first || res._ERROR))
            return res;
        --carryOn.depth;
        carryOn.path = path; // restore
    }
    return res._isEmpty() ? false : res;
}); // Object._find

Object.extend('_setHidden', function(key,value){
    Object.defineProperty(this, key, {
        enumerable: false,
        writable: true,
        value: value
    });
}); // Object._setHidden

Object.extend('_splitKeys', function(splitter){
    if (!splitter) splitter = ',';
    return this._remapKeys(function(v,k){
        return k.split(splitter);
    });
}); // Object._splitKeys
