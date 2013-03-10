function loadJS(libs) {
    libs = libs.split('|');
    for (var i=libs.length; i--;) {
        document.write("<script src='/~/"+libs[i]+".js'></script>");
    } 
}

loadJS('extending|misc');

var socket;

var virtualFocus = 'vfs'; 

function addStyleRule(selector, declaration) {
    var style = document.styleSheets[0];
    style.insertRule(selector+' { '+declaration+' }', 0); // prepend    
    return style.cssRules[0].style;
} // addStyleRule 

$(function(){ // dom ready
    socket = io.connect(window.location.origin);
    
    setupEventHandlers();
    socket.on('connect', function(){ // socket ready
        socket.emit('info.get', ioData({}), function(data){
            serverInfo = data||{};
            $('#frontend-link').attr('href', '//localhost:{0}'.x(serverInfo.frontEnd.port));
            reloadVFS();
        });
    });
});

var tpl = {
};

/* display a dialog for input.
    Currently just a wrapper of prompt().
    Arguments:
        text, callback
*/ 
function inputBox() {
    var a = arguments, text = a[0], def, cb;
    switch (typeof a[1]) {
        case 'function':
            cb = a[1];
            break;
        case 'string':
            def = a[1];
            cb = a[2];
            break;
        default:
            return false;
    }
    cb(prompt(text, def));
} // inputBox

function msgBox(message) { alert(message) }

function confirmBox(message) { return confirm(message) }

function setupEventHandlers() {
    $('body').keydown(function(ev){
        if (!(ev.target instanceof HTMLBodyElement)) return; // focused elsewhere, but the event propagated till here
        if (virtualFocusEventHandler(ev) === false) {
            ev.stopImmediatePropagation();
            return false;
        }
    });
} // setupEventHandlers
    
function virtualFocusEventHandler(ev) {
    // there's a couple of possible event handlers to be called
    var v = 'eventHandler_'+virtualFocus;
    var fns = [v+'_'+ev.type, v];
     
    for (var i=0, l=fns.length; i<l; ++i) {        
        var fn = window[fns[i]]; // try to get it
        if (typeof fn == 'function') { // if it exists, run it
            if (fn(ev) === false) return false; // it can decide to interrupt the event handling
        }
    }
} // virtualFocusEventHandler

loadJS('backend/vfs');
