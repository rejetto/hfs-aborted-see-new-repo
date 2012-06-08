var socket = io.connect(window.location.origin);

var tpl = {
    item: "<li><span class='expand-button'></span><span class='label'></span></li>",
    noChildren: "<span class='no-children'>nothing</span>",
};

$(function(){ // dom ready
    $(tpl.item).appendTo($('<ul>').appendTo('#vfs')); // create the root element
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
            removeBrowserSelection();
            vfsSelect(this);
        },
        dblclick: function(ev){
            ev.stopImmediatePropagation();
            removeBrowserSelection();
            var it = getFirstSelectedItem();
            if (isFolder(it)) {
                reloadVFS(it);
            }
        },
        mouseover: function(ev){
            ev.stopImmediatePropagation();
            $('#vfs li.hovered').removeClass('hovered');
            $(this).addClass('hovered');
        },
        mouseout: function(ev){
            ev.stopImmediatePropagation();
            $(this).removeClass('hovered');
        }
    });
    $('#vfs .expand-button').live({
        click: function(ev){
            ev.stopImmediatePropagation();
            removeBrowserSelection();
            var li = $(ev.target).closest('li');
            var collapse = li.hasClass('expanded');
            setCollapsed(li, collapse);
            if (!collapse) {
                reloadVFS(li);
            }
        },
        mouseover: function(ev){
            $('#vfs .expand-button.hovered').removeClass('hovered');
            $(this).addClass('hovered');
        },
        mouseout: function(ev){
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

function getRoot() { return $('#vfs li:first'); } 

function getRootItem() { return getRoot().data('item'); }

function getParentFromItem(it) {
    return $(it.element).parent().closest('li').data('item');
} // getParentFromItem

function isFolder(it) { return it && it.itemKind.endsBy('folder') }

function getURIfromItem(item) {
    item = asItem(item);
    var p = getParentFromItem(item);
    return (p ? getURIfromItem(p) : '')
        + encodeURI(item.name)
        + (p && isFolder(item) ? '/' : '');
} // getURIfromItem

function vfsUpdateButtons() {
    var it = getFirstSelectedItem();
    enableButton('bind', it && it.itemKind == 'virtual folder'); 
} // vfsUpdateButtons 

function enableButton(name, condition) {
    $('#'+name).attr({disabled: !condition});
} // enableButton

function reloadVFS(item) {
    var e = item ? asLI(item) : getRoot();
    e.find('ul').remove(); // remove possible children
    socket.emit('vfs.get', { uri:item ? getURIfromItem(item) : '/', depth:1 }, function(data){
        if (!data) return;
        setItem(e, data);
        setCollapsed(e, false);
        var ul = e.find('ul');
        if (!data.children.length) {
            $(tpl.noChildren).appendTo(ul);
            return;
        }
        data.children.forEach(function(it){
            addItemUnder(ul, it);            
        });
    });    
} // reloadVFS

/** util function for those functions who want to accept several types but work with the $(LI)
 */
function asLI(x) {
    x = !x ? null
        : x.element ? x.element
        : (x instanceof HTMLElement || x instanceof $) ? x
        : null;
    return x ? $(x) : x;
} // asLI

/** util function for those functions who want to accept several types but work with the $(LI)
 */
function asItem(x) {
    return !x ? null
        : x.element ? x
        : (x instanceof HTMLElement || x instanceof $) ? $(x).closest('li').data('item')
        : null;
} // asItem

function setCollapsed(item, state) {
    var li = asLI(item);
    if (!li) return;
    if (state == undefined) state = true;
    li.addClass(state ? 'collapsed' : 'expanded')
        .removeClass(!state ? 'collapsed' : 'expanded')
        .find('.expand-button:first').text(state ? '▷' : '▲');
    // deal with the container of children
    var ul = li.find('ul:first');
    if (state) {
        ul.remove();
    } 
    else { 
        if (!ul.size())
            ul = $('<ul>').appendTo(li);
    }        
    return true;
} // setCollapsed

function setItem(element, item) {
    var li = asLI(element);
    item.element = li[0];  // bind the item to the html element, so we can get to it 
    li.data({item:item});
    li.find('.label:first').text(item.name);
    setCollapsed(li);
    return element;
} // setItem

function addItemUnder(under, item) {
    if (under.element) { // it's an item
        under = under.element; // we want the element
        assert(under, 'under'); // we only work with items linked to elements
        // the UL element is the place for children, have one or create it  
        var x = $(under).find('ul'); 
        under = x.size() ? x : $('<ul>').appendTo(under); 
    }
    var el = $(tpl.item).appendTo(under);                 
    return setItem(el, item);
} // addItemUnder

function removeBrowserSelection() {
    if (window.getSelection) {  // all browsers, except IE before version 9
        return getSelection().removeAllRanges();
    }
    if (document.selection.createRange) {        // Internet Explorer
        var range = document.selection.createRange();
        document.selection.empty();
    }
} // removeBrowserSelection
