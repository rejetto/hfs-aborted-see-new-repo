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
    var rules = style.rules || style.cssRules;
    // append
    style.addRule ? style.addRule(selector, declaration)   
        : style.insertRule(selector+'{ '+declaration+' }', rules.length);    
    return rules[rules.length-1].style;
} // addStyleRule 

$(function(){ // dom ready
    socket = io.connect(window.location.origin)
    
    $(tpl.item).addClass('item').appendTo($('<ul>').appendTo('#vfs')); // create the root element

    // hide expansion button
    expansionCss = addStyleRule('#vfs .expansion-button','opacity:0');
    
    vfsUpdateButtons();
    setupEventHandlers();
    socket.on('connect', function(){ // socket ready
        socket.emit('info.get', ioData({}), function(data){
            serverInfo = data||{};
            reloadVFS();
        });
    });
    socket.on('vfs.changed', function(data){
        ioData(data);
        if (!log('vfs.changed',data)) return; // something wrong
        var folder = data.uri.substr(0, data.uri.lastIndexOf('/')+1);
        var it = getItemFromURI(folder);
        if (!it) return; // not in the visible tree: ignore
        if (!isExpanded(it)) return; // not expanded, we don't see its content, no need to reload
        reloadVFS(it);
    });
});

var tpl = {
    item: "<li>"
        +"<span class='expansion-button'></span>"
        +"<span class='icon'></span>"
        +"<span class='label'></span>"
    +"</li>",
    noChildren: "<span class='no-children'>nothing</span>",
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
