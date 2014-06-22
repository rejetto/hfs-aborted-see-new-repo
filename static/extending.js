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
 * The local closure can be extended with more variables by passing $inject, and it can be accessed as "P0".
 *      If it's an object, all it's values are accessed directly by the keys (e.g. passing {a:1} you get "a" in the scope, and its value is 1).
 *      If it's an array instead, the components can be accessed as P1, P2, etc.
 * "this." can be shortened in "@".
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

    var stringsRE = /'(?:\\'|[^'])*'|"(?:\\"|[^"])*"/g;
    var fNoStrings = f.replace(stringsRE, ''); // get a version with all strings removed
    var pars = fNoStrings.match(/(^|\b)[A-Z]($|\b)/g); // gather parameters in the form of single capital letter.
    pars = pars ? pars.unique() : ''; // this also sorts the array, as a side effect, and we like it because order is determined by alphabetical order, not appearance in the body
    var localVars = (fNoStrings.match(/\$[A-Z]($|\b)/g) ||[]).unique(); // gather local variables in the form of a $ followed by single capital letter.
    try { localVars.append(fNoStrings.match(/\$[1-9]($|\b)/g).map('A+"=arguments["+(A[1]-1)+"]"')) }catch(e){}; // translate parameters in the ordinal form: "$1" is first parameter, "$2" etc
    localVars = localVars.length ? 'var '+localVars+';' : '';

    var injectVars = [];
    var pVars = fNoStrings.match(/(^|\b)P\d($|\b)/g); // gather P# symbols: they are used to access $inject as a whole (P0) or as a 1-based array (P1,P2)
    if (pVars) {
        if (!inject) inject = arguments.callee.caller.arguments._castToArray().first(L('A===P0 && this[B+1]',f)); // Pvars are defined but $inject was not passed: try to access it through the callers' parameters
        if (inject) {
            injectVars.push('P0=inject');
            if (inject instanceof Array) injectVars.append(pVars.unique().removeItems('P0').map('A+"=P0["+(A[1]-1)+"]"')); // P1 will access first item of P0, and so on...
        }
    }
    if (inject instanceof Object && !(inject instanceof Array))  // explode the object into the local scope
        injectVars.append(inject._mapToArray('$2+"=inject."+$2'));
    injectVars = injectVars.length ? 'var '+injectVars+';' : '';

    // replace "@" in "this."
    if (~f.indexOf('@')) { // optimization
        var stringsFound = stringsRE.multiExec(f);
        function inString(idx){ return stringsFound && stringsFound.some('P0>=A.index && P0<A.index+A[0].length', idx) }
        f = f.replace(/@(?:([a-zA-Z])|(.)|$)/g, function(all,letter,other,pos){ return inString(pos) ? all : (letter) ? 'this.'+letter : 'this'+(other||'') });
    }

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
    var args = arguments._castToArray();
    var scope = args.shift();
    var fun = this;
    return function(){
        fun.apply(scope, args.concat(arguments._castToArray()));
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

// as Function.bind, but doesn't require a scope (for when you don't care)
Function.extend('bind_', function(){
    var args = arguments._castToArray();
    var fun = this;
    return function(){
        fun.apply(GLOBAL, args.concat(arguments._castToArray()));
    };
}); // Function.bind

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
    var filter = (typeof cb==='string' && cb.endsWith('||SKIP'));
    cb = L(cb);
    for (var i=0, n=this.length; i<n; i++) {
        this[i] = cb.call(this, this[i], i, this);
    }
    if (filter) this.removeItems();
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
        ret[k] = (val instanceof Function && !noCB) ? val(k,i,this) : val; // yes, if you don't pass it you'll get undefined. Acceptable.
    }
    return ret;
}); // toObjectKeys

/* create an object, the keys are provided by the callback, and the values are the array values.
 If you want to provide the whole pair key/value, you can return an array [key,value], or an object {key:value}.
 Please note in this latter case, you may provide as many pairs you want.
 */
Array.extend('toObject', function(cb/*v,k*/){
    assert(cb, 'bad args');
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
['toObject','toObjectKeys','remapRecur','map','every','filter','reduce','reduceRight','some'].forEach(function(k){
    var old = Array.prototype[k];
    Array.extend(k, function(){
        var a = arguments._castToArray();
        if (a.length) {
            if (typeof a[0]==='string') a[0] = L(a[0], a[1]);
        }
        else if (k==='filter') a[0] = function(x){ return x };

        var v = old.apply(this, a);

        if (k==='map' && typeof arguments[0]==='string' && arguments[0].endsWith('||SKIP')) {
            v.removeItems();
        }

        return v;
    });
});

/* A better sort. It accepts same parameters as original one, plus you can pass the sorting criteria as a single string.
 If the string begins with a "." the rest is the property determining the order. A final "!" will invert the order.
 If the string doesn't begin with a "." then it's passed to L() to build a lambda function.
 */
(function(){
    var old = Array.prototype.sort;
    Array.extend('sort', function(f){
        if (typeof f == 'string' && (f[0]==='.' || f[0]==='[')) {
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

// as indexOf, but items are tested by a callback instead
Array.extend('search', function(cb, ofs){
    cb = L(cb);
    for (var i=ofs||0, n=this.length; i!==n; i++) {
        if (cb.call(this, this[i], i)) return i;
    }
    return -1;
}); // Array.search

Array.extend('insert', function(idx, item){
    this.splice(idx,0,item);
    return this;
}); // Array.insert

Array.extend('sum', function(subfield){
    return this.reduce('A+B'+(subfield||'') ,0);
}); // Array.sum

Array.extend('multiply', function(subfield){
    return this.reduce('A*B'+(subfield||'') ,1);
}); // Array.multiply

Array.extend('reduceArrays', function(subfield){
    return this.reduce('A.concat(B{0})'.x(subfield||''), []);
}); // Array.reduceArrays

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
    if (arguments.length===0) it = function(x){ return !x }; // remove all falsish items
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
    return this.removeItems(L('!P0.contains(A)',otherArray));
}); // Array.intersect

// as intersect, but returns a new array
Array.extend('commonWith', function(otherArray) {
    if (!otherArray) return [];
    assert(otherArray instanceof Array, 'bad args');
    return this.filter('P0.contains(A)',otherArray);
}); // Array.commonWith

Array.extend('clone', function(deep) {
    var v = this.slice();
    if (deep) {
        v.remap('A instanceof Array ? A.clone() : A instanceof Object ? A._clone() : A');
    }
    return v;
}); // Array.clone

// new array with elements belonging to just one of the two arrays
Array.extend('xor', function(otherArray) {
    return this.clone().removeItems(otherArray).concat(otherArray.clone().removeItems(this));
});

Array.extend('unique', function() {
    return this.sort().filter( function(v,i,o){ return v!==o[i-1] })
});

Array.extend('addUnique', function(v){
    if (!(v instanceof Array)) v = [v];
    for (var i=0, n=v.length; i<n; i++) {
        if (!this.contains(v[i])) this.push(v[i]);
    }
    return this;
}) // addUnique

Array.extend('contains', function(v) { return this.indexOf(v) >= 0 });

Array.extend('last', function(){
    return this.length ? this[this.length-1] : undefined
});

Array.extend('for', function(cb, inject){
    if (!cb) return this;
    cb = L(cb, inject);
    if (cb.length > 1) {
        for (var i= 0, last=this.length-1; i<=last; i++) {
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

// build a new array with $n elements and $v as value. If $v is a function, then it is used as callback(idx) returning the value.
Array.make = function(n, v) {
    var ret = [];
    ret.length = n;
    if (v instanceof Function)
        ret.remap(v);
    else for (var i=0; i<ret.length; i++)
        ret[i] = v;
    return ret;
}; // Array.make

// like append() but put items in front
Array.extend('prepend', function(other) {
    if (other instanceof Array) {
        for (var i=0, a=other, n=a.length; i<n; i++) {
            this.unshift(a[i]);
        }
    }
    else {
        this.unshift(other);
    }
    return this;
}); // Array.prepend

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
            var v;
            if (v = /(\d*)-(\d*)/.exec(parameter)) { // range form?
                ret = String(ret);
                ret = ret.substring(v[1]-1 || 0, v[2] || ret.length) // extract the substring in range
            }
            else if (v = /ƒ ?(.+)/.exec(parameter)) { // lambda syntax
                ret = L(v[1])(ret);
            }
            else if ((v=GLOBAL[parameter]) instanceof Function) { // global function
                ret = v(ret);
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

////////////// REGEXP

RegExp.extend('multiExec', function(s){
    var m, ret=[];
    assert(this.global, 'global regexp required');
    while (m = this.exec(s))
        ret.push(m);
    return ret.length ? ret : null; // like exec() does
}); // multiExec

RegExp.csv = function(subexp,sep){
    return subexp && RegExp('^(?![ ,])(('+(sep||' *, *')+'|^)('+(subexp.source||subexp)+'))*$')
};

/////////////// DATE

Date.SECOND = 1000;
Date.MINUTE = 60*Date.SECOND;
Date.HOUR = 60*Date.MINUTE;
Date.DAY = 24*Date.HOUR;
Date.extend('shift', function(ms){
    var months = ms/Date.DAY/30;
    if (months === Math.round(months)) // this is hopely a smart move: we understand you are talking about months (or years). This is different because months have variable days. Hoping this is the expected result.
        this.setMonth(this.getMonth() + months);
    else
        this.setMilliseconds(this.getMilliseconds() + ms);
    return this;
});
Date.extend('plus', function(ms){
    return (new Date(this)).shift(ms)
});
Date.extend('elapsed', function(unit, since){
    return ((since||Date.now())-this)/(unit||1)
});
Date.elapsed = function(since, unit){
    return Date.now()-since/(unit||1);
}
if (!Date.now)
Date.now = function now() { return +new Date() };

/////////////// OBJECT

// remove some properties
Object.extend('_remove', function(keys, returnRemoved) {
    var a = arguments;
    if (typeof keys == 'string' && keys[0]===',') {
        keys = keys.split(',').slice(1);
    }
    else if (!(keys instanceof Array)) keys = [keys];
    var ret = {};
    for (var i=keys.length; i--;) {
        var k = keys[i];
        if (!(k in this)) continue;
        if (returnRemoved) ret[k] = this[k];
        delete this[k];
    }
    return returnRemoved ? ret : this;
}); // Object._remove

// transfer some properties from another object
Object.extend('_steal', function(other, keys) {
    return this._expand(other._remove(keys, true));
}); // Object._steal

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

Object.extend('_filterCopy', function(what) {
    if (typeof what == 'string' && what.startsWith(','))
        what = what.ss(1).split(',');
    return (what instanceof Array) ? this._map('P0.contains(B) && A ||SKIP', what)
        : this._map('({0}) && A ||SKIP'.x(what))
}); // Object._filterCopy

// return first element accepted by the callback. In case of non-boolean returned value, the value is returned instead of the element.
Object.extend('_first', function(cb){
    cb = L(cb);
    for (var i in this) {
        var res = cb.call(this, this[i], i);
        if (res) return res===true ? this[i] : res;
    }
}); // Object._first

// if $properties is not passed, the whole object is cloned
Object.extend('_clone', function(properties, deep){
    if (properties === true) {
        deep = true;
        properties = undefined;
    }
    if (!properties) {
        return (this instanceof Array) ? this.clone(deep)
            : (this instanceof Date) ? new Date(this)
            : (this instanceof Function) ? this
            : deep ? ({})._expand(this)._remap('A instanceof Object ? A._clone(true) : A')
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

// returns a new object made by removing some keys from this
Object.extend('_minus', function(keys){
    return this._clone(this._keys().removeItems(keys instanceof Array ? keys : keys.split(',')))
}); // Object._minus

Object.extend('_expand', function(another, keys){
    switch (typeof another) {
        case 'object':
            if (keys) another = another._clone(keys);
            if (another === null) break;
            if (GLOBAL.Ext) Ext.apply(this, another)
            else if (GLOBAL.jQuery) jQuery.extend(this, another)
            else if (GLOBAL.ceLib) ceLib.extend(this, another)
            else throw 'N/A';
            break;
        case 'string':
            this[another] = arguments[1];
            break;
        case 'undefined':
        case 'boolean':
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
Object.extend('_map', function(cb/*v,k*/){
    var filter = (typeof cb==='string' && cb.endsWith('||SKIP'));
    cb = L(cb);
    var ret = {};
    for (var k in this) {
        var v = cb.call(this, this[k], k);
        if (!filter || filter && v) ret[k] = v;
    }
    return ret;
}); // Object._map

// as _map, but lets you specifies both keys and values in the form [key,value] or {key:value}
Object.extend('_mapKeys', function(cb/*v,k*/){
    var ret = {};
    var filter = (typeof cb==='string' && cb.endsWith('||SKIP'));

    var map = cb._isBaseObject() && cb;
    if (!map) cb = L(cb);
    for (var k in this) {
        var v = this[k];
        if (map) {
            ret[k in map ? map[k] : k] = v;
            continue;
        }
        v = cb.call(this, v, k);
        if (filter && !v) continue;
        if (v instanceof Array) ret[ v[0] ] = v[1];
        else ret._expand(v);
    }
    return ret;
}); // Object._mapKeys

// returns a new array with values obtained from a callback
Object.extend('_mapToArray', function(cb/*v,k*/){
    var filter = (typeof cb==='string' && cb.endsWith('||SKIP'));
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
Object.extend('_castToArray', function() { return Array.prototype.slice.call(this) });

// as map(), but overwrite elements instead of creating a new object
Object.extend('_remap', function(cb){
    if (cb === undefined) return this;
    cb = L(cb);
    for (var k in this) {
        this[k] = cb.call(this, this[k], k);
    }
    return this;
}); // Object._remap

// like remap, but recursively over arrays and objects
Object.extend('_remapRecur', function(cb){
    if (cb === undefined) return this;
    cb = L(cb);
    for (var k in this) {
        var v = cb.call(this, this[k], k);
        if (v  === undefined) v = this[k];
        else this[k] = v;
        if (v.remapRecur) { // arrays
            v.remapRecur(cb);
        }
        else if (typeof v == 'object') {
            v._remapRecur(cb);
        }
    }
    return this;
}); // Object._remapRecur

/* as remap(), but overwrite keys instead of values.
    Callback should return the new key name as string, or an array if you want the value to be associated to multiple keys.
    You can also return an object ( newKey:newValue, more:more }.
    Returning undefined or the same key will leave it unchanged, while null will delete the entry.
    If $cb is an object then it's in the form { oldKey: newKey }
 */
Object.extend('_remapKeys', function(cb){
    if (cb._isBaseObject()) {
        for (var old in cb) {
            var new_ = cb[old];
            if (new_ !== null) this[new_] = this[old];
            if (new_ === undefined) continue;
            delete this[old];
        }
        return this;
    }
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
        values = arguments._castToArray();
    }
    if (!values) return false;
    assert(values instanceof Array, 'bad args');
    return values.contains(this.valueOf());
}); // Object._among

// same as log(), but syntactically useful because you don't have to surround the code with parenthesis, just append ._log()
Object.extend('_log', function(){
    console.debug.apply(console, arguments._castToArray().append(this.valueOf()));
    return this.valueOf();
});

//Object.extend('_same', function(other){ return JSON.stringify(this) == JSON.stringify(other) });

// $strict is true by default. Without strict comparison ""==false && 3=="3"
Object.extend('_same', function(other, strict, options){
    if (strict === undefined) strict = true; // default value
    // if $other is a primitive, then try to compare with the primitive version of $this. Someone may instead like to convert $other into an object and continue, because $this may be for example a modified Number.
    if (!(other instanceof Object))
        return this.valueOf() === other;

    if (!options)
        options = {};
    var ignore = options.ignore; // array of fields to ignore
    ignore = (!ignore) ? {} : (ignore instanceof Array) ? ignore.toObjectKeys(1) : ignore;

    // ok, $other is an object too, we must have all its properties
    for (var p in other) {
        if (!ignore[p] && !(p in this))
            return false;
    }

    for(p in this) {
        if (ignore[p]) continue;
        // it must have all our properties
        if (!(p in other)) return false;
        var mine = this[p];
        var its = other[p];
        if (mine === its) continue; // strictly equal is enough
        if (strict && typeof mine !== typeof its) return false; // type check in strict mode
        switch (typeof mine) {
            case 'object':
                if (mine===null)
                    if (its===null) break;
                    else return false;
                else
                    if (its===null)
                        return false;
                if (mine instanceof Date)
                    if (its instanceof Date && +mine===+its) break;
                    else return false;
                if (mine instanceof Array && mine.length!==its.length
                || !mine._same(its, strict))
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

Object.extend('_flatten', function(separator, maxDepth, prefix){
    if (separator === undefined) separator = '.';
    if (maxDepth === undefined) maxDepth = Infinity;
    var ret = arguments[3]||{};
    for (var k in this) {
        var v = this[k];
        if (prefix) k = prefix+separator+k;
        if (maxDepth && v instanceof Object && v._isBaseObject())
            v._flatten(separator, maxDepth-1, k, ret);
        else
            ret[k] = v;
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

Object.extend('_invert', function(){
    var ret = {};
    for (var k in this) {
        if (this.hasOwnProperty(k)) {
            ret[this[k]] = k;
        }
    }
    return ret;
}); // Object._invert

/* search for values that will meet $condition, recurring on keys.
 * Returns an object with findings and the keys are paths.
 * $condition(json|lambda|function)
 * $options(optional|object) supports
 *      first(boolean): will stop at first result
 *      timeout(numeric): a timeout in ms
 *      depth(numeric): limit depth of recursion
 *      exclude(array of string): keys to not recur on
 */
Object.extend('_find', function(condition, options){
    if (typeof condition === 'string') { // json or lambda
        try { condition = JSON.parse(condition); }
        catch(e) { condition = L(condition); }
    }
    if (condition._isBaseObject()) {
        var serach = condition;
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

    assert(condition instanceof Function, 'bad args');
    // data to carry on on recursion
    var carryOn = arguments[2];
    if (!carryOn) {
        carryOn = { depth:0, path:'', res:{}, noRecur:[], start:new Date() };
        if (!options) options = {};
        if (options.exclude && !(options.exclude instanceof Array)) {
            options.exclude = [options.exclude];
        }
        options._expandIf({ glue:' / ' });
    }
    var path = carryOn.path;
    var res = carryOn.res;
    var noRecur = carryOn.noRecur; // keep track of what we already worked

    // search here
    if (!carryOn.depth && condition.call(this, this, carryOn)) {
        res[path] = this;
        if (options.first) return res;
    }

    // search inside
    noRecur.push(this);
    var tout = options.timeout||1000;
    for (var k in this) {
        if (tout && ((new Date()-carryOn.start) > tout)) {
            if (!res._ERROR) res._ERROR = { msg:'timeout', path:path, obj:this };
            return res;
        }
        if (carryOn.depth > options.depth) continue;
        if (!this.hasOwnProperty(k)) continue;
        if (options.exclude && options.exclude.contains(k)) continue;
        var v = this[k];
        if (v instanceof Object && noRecur.contains(v)) continue;
        var subpath = (path ? path+options.glue : '')+k;
        carryOn.key = k;
        carryOn.parent = this;
        if (condition.call(this, v, carryOn)) {
            res[subpath] = v;
            if (options.first) return res;
        }
        if (!(v instanceof Object)) continue;
        carryOn.path = subpath;
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

Object.extend('_isBaseObject', function(){
    return this.__proto__.constructor === Object
}); // Object._isBaseObject

// like _expand but keys are meant to be
Object.extend('_merge', function(another, options){
    if (!options) options = {};
    else if (typeof options === 'string') options = { split:options };

    for (var k in another) {
        var run = this;
        k.split(options.split||'.').for(function(part,i,last){
            if (last) {
                run[part] = another[k];
                return;
            }
            if (!(part in run)) {
                run[part] = {}; //
            }
            run = run[part];
        });
    }
    return this;
}); // Object._merge
