var socket = io.connect(window.location.origin);

$(function(){ // dom ready
    vfsUpdateButtons();
    setupEventHandlers();
    socket.on('connect', function(){ // socket ready
        reloadVFS();
    });
});

/* display a dialog for input.
    Currently just a wrapper of prompt().
    Arguments:
        text, callback
*/ 
function inputBox() {
    var text, cb, a = arguments;
    switch (typeof a[0]) {
        case 'string':
            text = a[0];
            break;
        default:
            return false;
    }        
    switch (typeof a[1]) {
        case 'function':
            cb = a[1];
            break;
        default:
            return false;
    }
    cb(prompt(text));
} // inputBox

function msgBox(message) { alert(message) }

function itemBind() { 
    var it = getFirstSelectedItem();
    if (!it) return;
    inputBox('Enter path', function(s){
        if (!s) return;    
        socket.emit('vfs.set', { uri:getURIfromItem(it), resource:s }, function(result){
            result.ok ? reloadVFS() : msgBox(result.error);
        });
    });
} // itemBind

function addFolder() {
    var it = getFirstSelectedItem() || getRootItem();
    inputBox('Enter name or path', function(s){
        if (!s) return;    
        socket.emit('vfs.add', { uri:getURIfromItem(it), resource:s }, function(result){
            result.ok ? reloadVFS() : msgBox(result.error);
        });
    });
} // addFolder

function setupEventHandlers() {
    $('#vfs').click(function(){
        vfsSelect(null); // deselect
    });
    $('#bind').click(itemBind);
    $('#addFolder').click(addFolder);
    $('#vfs li').live({
        click: function(ev){
            ev.stopImmediatePropagation();
            vfsSelect(this);
        },
        dblclick: function(ev){
            ev.stopImmediatePropagation();
            removeSelection();
            var it = getFirstSelectedItem();
            if (isFolder(it)) {
                reloadVFS(it);
            }
        },
        mouseover: function(ev){
            ev.stopImmediatePropagation();
            $('#vfs .hovered').removeClass('hovered');
            $(this).addClass('hovered');
        },
        mouseout: function(ev){
            ev.stopImmediatePropagation();
            $(this).removeClass('hovered');
        }
    });
} // setupEventHandlers

function vfsSelect(el) {
    $('#vfs .selected').removeClass('selected');
    $(el).addClass('selected');
    vfsUpdateButtons();                
} // vfsSelect

function getSelectedItems() {
    var res = [];
    $('#vfs .selected').each(function(i,e){
        var it = $(e).data('item');
        it.element = e; // bind the item to the html element, so we can get to it
        res.push(it);
    });
    return res;
} // getSelectedItems

function getFirstSelectedItem() {
    var res = getSelectedItems();
    return res ? res[0] : false;
} // getFirstSelectedItem

function getRootItem() {
    var e = $('#vfs li:first');  
    var it = e.data('item');
    it.element = e; // bind the item to the html element, so we can get to it
    return it;
} // getRootItem

function getParentFromItem(it) {
    return $(it.element).parent().closest('li').data('item');
} // getParentFromItem

function isFolder(it) { return it.itemKind.endsBy('folder') }

function getURIfromItem(it) {
    var p = getParentFromItem(it);
    return (p ? getURIfromItem(p) : '')
        + encodeURI(it.name)
        + (p && isFolder(it) ? '/' : '');
} // getURIfromItem

function vfsUpdateButtons() {
    var it = getFirstSelectedItem();
    enableButton('bind', it && it.itemKind == 'virtual folder'); 
} // vfsUpdateButtons 

function enableButton(name, condition) {
    $('#'+name).attr({disabled: !condition});
} // enableButton

function reloadVFS(item) {
    var e;
    if (item) { 
        e = $(item.element);
    } else {
        e = $('#vfs li:first');
        if (!e.size()) {
            e = $('<li>').appendTo($('<ul>').appendTo('#vfs'));
        }
    }
    e.empty(); // remove possible children
    socket.emit('vfs.get', { uri:item ? getURIfromItem(item) : '/', depth:1 }, function(data){
        log('VFS.GET', data);
        setItem(e, data);
        // children
        e = $('<ul>').appendTo(e);
        data.children.forEach(function(it){
            addItemUnder(e, it);            
        });
    });    
} // reloadVFS

function setItem(element, item) { 
    return $(element)
        .data({item:item})
        .text(item.name);
} // setItem

function addItemUnder(under, item) { 
    return setItem($('<li>').appendTo(under), item);
} // addItemUnder

function removeSelection() {
    if (window.getSelection) {  // all browsers, except IE before version 9
        return getSelection().removeAllRanges();
    }
    if (document.selection.createRange) {        // Internet Explorer
        var range = document.selection.createRange();
        document.selection.empty();
    }
} // removeSelection
