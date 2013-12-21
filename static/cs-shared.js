// unify enviroment
if (typeof window != 'undefined') {
    GLOBAL = exports = window;
}

/** try to get a nested value, without rising exception in case of non-existent property in the middle of the path to the result
 * Possible parameters:
 *      context (object, optional): where to extract data, if not specified then global object (window) is used
 *      dotted property (string | array of strings): sequence of properties separated by dots, actually the path to the data.
 *          A key may also be a method call, just postpone the ()
 *      default (optional): what to extract if the property is not present. If the property is present and its value is undefined, undefined will be returned
 */
exports.tryGet = function() {
    var a = arguments;
    var run = GLOBAL;
    var path, def;
    var first = a[0];
    var type = typeof first;
    if (type == 'undefined') {
        return (a.length > 2) ? a[a.length-1] : undefined;
    }
    if (type == 'string') {
        path = first;
        def = a[1];
    }
    else if (type == 'object') {
        run = first;
        path = a[1];
        def = a[2];
    }
    else assert(0, 'bad args');
    try {
        run = eval('run.'+path)
        return (run === undefined) ? def : run;
    }
    catch(e) { return def }
} // tryGet


// calls 'fun' if it's a function.
exports.call = function(fun) {
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
exports.choose = function(index, object, defVal) {
    return (index in object) ? object[index] : defVal;
}
// surround $b with $a and $c, but only if $b is true
exports.su = function(a,b,c) { return b ? a+b+(c||'') : '' }

exports.idFun = function(a) { return a }

exports.assert = function(condition, message) {
    if (!condition) throw 'ASSERT failed'+ (message ? ': '+message : '');
} // assert

