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
    var it = getFirstSelectedFolder();
    if (!it) return;
    inputBox('Enter path', function(s){
        if (!s) return;    
        socket.emit('vfs.set', { uri:getURIfromItem(it), resource:s }, function(result){
            result.ok ? reloadVFS(it) : msgBox(result.error);
        });
    });
} // itemBind

function addFolder() {
    var it = getFirstSelectedFolder() || getRootItem();
    inputBox('Enter name or path', function(s){
        if (!s) return;    
        socket.emit('vfs.add', { uri:getURIfromItem(it), resource:s }, function(result){
            if (result.ok) {
                addItemUnder(it, result.item);
                vfsSelect(result.item);
            }
            else {
                msgBox(result.error);
            }
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
    if (el && el.element) {
        el = el.element; // support items
    }
    $(el).addClass('selected');
    vfsUpdateButtons();                
} // vfsSelect

function getSelectedItems() {
    var res = [];
    $('#vfs .selected').each(function(i,e){
        var it = $(e).data('item');
        res.push(it);
    });
    return res;
} // getSelectedItems

function getFirstSelectedItem() {
    var res = getSelectedItems();
    return res ? res[0] : false;
} // getFirstSelectedItem

function getFirstSelectedFolder() {
    var res = getSelectedItems();
    for (var i=0, l=res.length; i<l; ++i) {
        if (isFolder(res[i])) {
            return res[i];
        }
    }
    return false;
} // getFirstSelectedFolder

function getRootItem() { return $('#vfs li:first').data('item'); }

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
        if (!e.size()) { // we haven't created the root item yet
            e = $('<li>').appendTo($('<ul>').appendTo('#vfs'));
        }
    }
    e.empty(); // remove possible children
    socket.emit('vfs.get', { uri:item ? getURIfromItem(item) : '/', depth:1 }, function(data){
        setItem(e, data);
        // children
        e = $('<ul>').appendTo(e);
        data.children.forEach(function(it){
            addItemUnder(e, it);            
        });
    });    
} // reloadVFS

function setItem(element, item) {
    item.element = element;  // bind the item to the html element, so we can get to it 
    return $(element)
        .data({item:item})
        .text(item.name);
} // setItem

function addItemUnder(under, item) {
    if (under.element) { // it's an item
        under = under.element; // we want the element
        assert(under, 'under'); // we only work with items linked to elements
        // the UL element is the place for children, have one or create it  
        var x = $(under).find('ul'); 
        under = x.size() ? x : $('<ul>').appendTo(under); 
    }
    var el = $('<li>').appendTo(under);                 
    return setItem(el, item);
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
