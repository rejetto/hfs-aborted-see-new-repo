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
	    var v = this.clientHeight < this.scrollHeight;
        var h = this.clientWidth < this.scrollWidth;       
        return res = (!HorV ? h||v : (HorV == 'H' ? h : v));
    });
    return res;
}; // isOverflowed

var log = function() {
    for (var k in arguments)
        console.log(arguments[k]);
    for (var k in arguments)
        return arguments[k];
}; // log

function isTransparent(color) {
    if (!color || color == "transparent") return true;
    var m = color.match(/rgba *\( *(\d+) *, *(\d+) *, *(\d+) *, *(\d+) *\)/);
    return m && !Number(m[4]);
} // isTransparent

// returns the supposed background color of the item, traversing upward the DOM and skipping transparent elements  
jQuery.fn.getClosestBackgroundColor = function() {
    if (!this.size()) return '';
    var el = this.first();
    while (1) {
        try { // try, because it comes to the point the element is not an HTMLelement, and css() explodes 
            var c = el.css('background-color');
            if (!isTransparent(c)) return c;
            el = el.parent();
        } 
        catch(err) { return '' }
    }
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

// tries to access a deep property of object, following array "path" as for properties names   
function getDeep(obj, path) {
    for (var i=0, a=path, l=a.length; obj && i<l; ++i) {
        obj = obj[a[i]];
    }
    return obj;         
} // getDeep

function assert(condition, message) {
    if (!condition) alert(message);
    return !condition;
} // assert
 
function formatBytes(n) {
    if (isNaN(Number(n))) return 'N/A';
    var x = [ '', 'K', 'M', 'G', 'T' ];
    var prevMul = 1;
    var mul = prevMul<<10;
    for (var i=0, l=x.length; i<l && n > mul; ++i) {
        prevMul = mul
        mul <<= 10;
    }
    n /= prevMul;
    var c = x[i];
    if (c) c = ' '+c;
    return round(n,1)+c;
} // formatBytes

round = function(v, decimals) {
    decimals = Math.pow(10, decimals||0);
    return Math.round(v*decimals)/decimals;
} // round

function cmp(a,b) { return a>b ? 1 : a<b ? -1 : 0 }

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
