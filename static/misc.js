$.support.touch = ('ontouchstart' in window) // works on most browsers
    || ('onmsgesturechange' in window) // works on ie10
    || window.DocumentTouch && document instanceof DocumentTouch;

$.support.hover = !$.support.touch; // of course this is not necessarily true. We'll find something better in the future.

$('html').addClass($.support.hover ? 'hover' : 'no-hover');

jQuery.fn.log = function (msg) {
    if (typeof window.console != 'undefined' && console.log)
        if (msg) console.log(msg+": %o", this);
        else console.log(this);
    return this;
};

// it says if any element of the set is exceeding its clipping area 
jQuery.fn.isOverflowed = function(HorV) {
    var res = false;
    if (HorV) HorV = HorV[0].toUpperCase(); // so it accepts even 'horizontally'
	this.each(function(){
	    var v = this.clientHeight < this.scrollHeight-1;
        var h = this.clientWidth < this.scrollWidth-1;
        return res = (!HorV ? h||v : (HorV == 'H' ? h : v));
    });
    return res;
}; // isOverflowed

/** ensure the element is verticaly visible */ 
jQuery.fn.scrollToMe = function(options){
    var go = this.offScreen();
    if (go !== false) {
        $('html,body').stop(true).animate({ scrollTop: go }, options);
    }
    return this;
}; // scrollToMe

/** is the element verticaly visible? */
jQuery.fn.offScreen = function(options){
    if (!this.size()) return false;
    var top = this.offset().top;
    var bottom = top+this.outerHeight();
    var scrollY = jQuery(document).scrollTop();
    if (top < scrollY) {
        return top; // on top?
    }
    else if (bottom > scrollY+innerHeight) { // below?
        return Math.min(top, bottom-innerHeight);
    }
    return false;
}; // offScreen

jQuery.fn.sameSize = function(other){
    other = $(other);
    return this.width(other.outerWidth()).height(other.outerHeight());
};

var log = function() {
    if (typeof window.console != 'undefined' && console.log) {
        var last;
        for (var k in arguments)
            console.log(last = arguments[k]);
    }
    return last;
}; // log

function isTransparent(color) {
    if (!color || color == "transparent") return true;
    var m = color.match(/rgba *\( *(\d+) *, *(\d+) *, *(\d+) *, *(\d+) *\)/);
    return m && !Number(m[4]);
} // isTransparent

// returns the supposed background color of the item, traversing upward the DOM and skipping transparent elements  
jQuery.fn.getClosestBackgroundColor = function() {
    var el = this.first();
    while (el.size()) {
        try { // try, because it comes to the point the element is not an HTMLelement, and css() explodes 
            var c = el.css('background-color');
            if (!isTransparent(c)) return c;
            el = el.parent();
        } 
        catch(err) { break }
    }
    return '';
} // getClosestBackgroundColor
        
function setCookie(name,value,days) {
	if (days) {
		var date = new Date();
		date.setTime(date.getTime()+(days*24*60*60*1000));
		var expires = "; expires="+date.toGMTString();
	}
	else var expires = "";
	document.cookie = name+"="+value+expires+"; path=/";
} // setCookie

function getCookie(name) {    
    var a = document.cookie.match(new RegExp('(^|; *)('+name+'=)([^;]*)'));
    return (a && a[2]) ? a[3] : null;
} // getCookie

function delCookie(name) {
	setCookie(name,"",-1);
} // delCookie

function getFileExt(path) {
    var v = path.match(/\.([^/.]+)$/);
    return v ? v[1] : '';       
} // getFileExt

function nameToType(name) {
    switch (getFileExt(name).low()) {
        case 'jpg': case 'jpeg': case 'gif': case 'png':
            return 'image';
        case 'avi': case 'mpg': case 'mp4': case 'mov':
            return 'video';
        default:
            return ''; 
    }
} // nameToType

function assert(condition, message) {
    if (!condition) alert('ASSERTION ERROR: '+message);
    return !condition;
} // assert
 
function formatBytes(n,post) {
    if (isNaN(Number(n))) return '';
    if (post===undefined) post='B';
    var x = [ '', 'K', 'M', 'G', 'T' ];
    var prevMul = 1;
    var mul = prevMul*1024;
    for (var i=0, l=x.length; i<l && n > mul; ++i) {
        prevMul = mul;
        mul *= 1024;
    }
    n /= prevMul;
    x = x[i];
    x = x ? ' '+x+post : ' '+post;
    return round(n,1)+x;
} // formatBytes

function round(v, decimals) {
    decimals = Math.pow(10, decimals||0);
    return Math.round(v*decimals)/decimals;
} // round

function cmp(a,b) { return a>b ? 1 : a<b ? -1 : 0 }

function getIconURI(icon) { return getPicURI("files/"+icon) }

function animate(object, property, endValue, options) {
    options = options||{};
    var freq = options.freq||15; // Hz
    var duration = options.duration||0.5; // seconds
    var steps = freq*duration; // number of steps to the end
    if (!object || !property || !steps) return;
    var trackingKey = 'animation_running_'+property;
    var endParameter = { canceling:1 }; // at this stage, calling end() will inform the callback that we have been canceled by another animation 
    
    function end(){
        object[property] = object[trackingKey].endValue;
        clearInterval(object[trackingKey].h);
        delete object[trackingKey];
        call(options.onEnd, endParameter);
    }

    if (trackingKey in object) {
        if (object[trackingKey].endValue === endValue) return; // don't do it twice
        end(); // terminate previous
    }    
    // we passed the stage of the cancellation
    delete endParameter.canceling;

    var from = current = Number(object[property]);
    var inc = (endValue-from)/steps;
    // start animation, and keep track inside the object itself
    object._setHidden(trackingKey, {
        endValue: endValue,
        h: setInterval(step, 1000/freq)
    });
    function step(){
        --steps>0 ? (object[property] = current+=inc) : end()
    }

} // animate

function removeBrowserSelection() {
    if (window.getSelection) {  // all browsers, except IE before version 9
        return getSelection().removeAllRanges();
    }
    if (document.selection.createRange) {        // Internet Explorer
        var range = document.selection.createRange();
        document.selection.empty();
    }
} // removeBrowserSelection

function basename(path) {
    path = path.excludeTrailing('/');
    var i = path.length-1;
    i = Math.max(path.lastIndexOf('/',i), path.lastIndexOf('\\',i));
    return path.substr(i+1);
} // basename

function dirname(path) {
    path = path.excludeTrailing('/');
    return path.substr(0, path.length-basename(path).length);
} // dirname

/** for now it's only a place-holder. We'll be able to transform data in a way to optimize socket.io communications */  
function ioData(x) { return x }

// useful when you want to do something only once
function once(scope) {
    scope = scope || 'global';
    if (!once.flags) once.flags = {};
    if (once.flags[scope]) return false;
    return once.flags[scope] = 1;
} // once

// a performance index. Smaller is faster. E.g. ~50 for a Core2duo@2.1ghz 
function benchmark() {
    t = new Date(); 
    for (var i=100000; i--;) t[i] = i; 
    return (new Date())-t;
} // benchmark

function repeat(delay, f, rightNow){
    if (rightNow && f() === false) return;
    setTimeout(function(){
        if (f() !== false)
            repeat(delay, f);
    }, delay);
} // repeat

/* CURRENTLY UNUSED

// reports how many pixels the element is exceeding the viewport, on the right side
jQuery.fn.overRightEdge = function() {
	var w = $(window),
        v = this.offset().left - w.scrollLeft() + this.outerWidth() - w.width();
    return Math.max(0, v);  
}; // overRightEdge

// reports how many pixels the element is exceeding the viewport, on the bottom side
jQuery.fn.overBottomEdge = function() {
	var w = $(window),
        v = this.offset().top - w.scrollTop() + this.outerHeight() - w.height();
    return Math.max(0, v);  
}; // overBottomEdge

*/
