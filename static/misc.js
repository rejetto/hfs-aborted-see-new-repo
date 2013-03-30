/**
 * jQuery.browser.mobile (http://detectmobilebrowser.com/)
 *
 * jQuery.browser.mobile will be true if the browser is a mobile device
 *
 **/
(function(a){(jQuery.browser=jQuery.browser||{}).mobile=/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows (ce|phone)|xda|xiino/i.test(a)||/1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0,4))})(navigator.userAgent||navigator.vendor||window.opera);

$.browser.hovering = !$.browser.mobile;

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

/** ensure the element is verticaly visible */ 
jQuery.fn.scrollToMe = function(options){
    var go = this.offScreen();
    if (go !== fales) {
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

// tries to access a deep property of object, following array "path" as for properties names   
function getDeep(obj, path) {
    for (var i=0, a=path, l=a.length; obj && i<l; ++i) {
        obj = obj[a[i]];
    }
    return obj;         
} // getDeep

function assert(condition, message) {
    if (!condition) alert('ASSERTION ERROR: '+message);
    return !condition;
} // assert
 
function formatBytes(n) {
    if (isNaN(Number(n))) return 'N/A';
    var x = [ '', 'K', 'M', 'G', 'T' ];
    var prevMul = 1;
    var mul = prevMul*1024;
    for (var i=0, l=x.length; i<l && n > mul; ++i) {
        prevMul = mul;
        mul *= 1024;
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

function getPicURI(file) { return "/~/pics/"+file+".png"; }

function getIconURI(icon) { return "/~/pics/files/"+icon+".png"; }

function animate(object, property, endValue, options) {
    options = options||{};
    var freq = options.freq||30; // Hz
    var duration = options.duration||0.5; // seconds
    var steps = freq*duration; // number of steps to the end
    if (!object || !property || !steps) return;
    var trackingKey = 'animation_running_'+property;
    var endParameter = { canceling:1 }; // at this stage, calling end() will inform the callback that we have been canceled by another animation 
    
    var end = function(){        
        object[property] = endValue;
        clearInterval(object[trackingKey]);
        delete object[trackingKey];
        if (typeof options.onEnd == 'function') {
            options.onEnd(endParameter);
        }
    };
    
    if (object[trackingKey]) {
        end(); // terminate previous        
    }    
    // we passed the stage of the cancellation
    delete endParameter.canceling;
    if (Object.keys(endParameter).length === 0) {
        endParameter = undefined;
    }
    
    var from;
    var current;
    var inc;
    // track this operation. It would be nice to do it without touching, but we'd need an hash/id of the object, and i don't know a way to get it.            
    object[trackingKey] = setInterval(function(){
        if (typeof from === 'undefined') { // initialize
            from = current = Number(object[property]);
            inc = (endValue-from)/steps;
        }
        object[property] = current += inc;
        if (! --steps) end();
    }, 1000/freq);
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
