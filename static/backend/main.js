/**
 * @author Massimo Melina <a@rejetto.com>
 */

function loadJS(libs) {
    libs = libs.split('|');
    for (var i=libs.length; i--;) {
        document.write("<script src='/~/"+libs[i]+".js'></script>");
    } 
}

loadJS('extending|cs-shared|misc');

var socket;

function addStyleRule(selector, declaration) {
    var style = document.styleSheets[0];
    style.insertRule(selector+' { '+declaration+' }', 0); // prepend    
    return style.cssRules[0].style;
} // addStyleRule 

$(function(){ // dom ready
    socket = io.connect(window.location.origin);
    
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

loadJS('backend/vfs');
