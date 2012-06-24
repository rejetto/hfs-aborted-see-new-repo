var socket = io.connect(window.location.origin);

var tpl = {
    item: "<li>"
        +"<span class='expansion-button'></span>"
        +"<span class='icon'></span>"
        +"<span class='label'></span>"
    +"</li>",
    noChildren: "<span class='no-children'>nothing</span>",
};

var virtualFocus = 'vfs'; 

$(function(){ // dom ready
    $(tpl.item).appendTo($('<ul>').appendTo('#vfs')); // create the root element

    // hide expansion button
    var style = document.styleSheets[0];
    style.addRule('#vfs .expansion-button','opacity:0');
    expansionCss = style.rules[style.rules.length-1].style;
    
    vfsUpdateButtons();
    setupEventHandlers();
    socket.on('connect', function(){ // socket ready
        reloadVFS();
    });
    socket.on('vfs.changed', function(data){
        if (!log(data)) return; // something wrong
        var folder = data.uri.substr(0, data.uri.lastIndexOf('/')+1);
        var it = getItemFromURI(folder);
        if (!it) return; // not in the visible tree: ignore
        if (!isExpanded(it)) return; // not expanded, we don't see its content, no need to reload
        reloadVFS(it);
    });
});

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

function bindItem() { 
    var it = getFirstSelectedFolder();
    if (!it) return;
    inputBox('Enter path', function(s){
        if (!s) return;    
        socket.emit('vfs.set', { uri:getURI(it), resource:s }, function(result){
            result.ok   
                ? reloadVFS(it)
                : msgBox(result.error);
        });
    });
} // bindItem

function renameItem() {    
    var it = getFirstSelectedItem();
    if (!it || isRoot(it)) return;
    inputBox('Enter new name', it.name, function(s){
        s = $.trim(s);
        if (!s || s == it.name) return; // no change
        socket.emit('vfs.set', { uri:getURI(it), name:s }, function(result){
            if (!result.ok) {
                msgBox(result.error);
                return;
            }
            it.name = s; // update object
            bindItemToDOM(it, it.element); // update GUI
        });                
    });
} // renameItem

function deleteItem() {    
    var it = getFirstSelectedItem();
    if (!it || isRoot(it) || it.deleting) return;
    it.deleting = true;
    asLI(it).attr('deleting',1);    
    socket.emit('vfs.delete', { uri:getURI(it) }, function(result){
        if (!result.ok) {
            it.deleting = false;
            asLI(it).removeAttr('deleting');
            msgBox(result.error);
            return;
        }
        li.fadeOut(200, function(){
            var p = getParent(li); 
            if (!getFirstChild(p).size()) { // deleted last item of a folder
                p.find('ul:first').append(tpl.noChildren);
            }            
            li.remove();
        })        
    });                
    var noMoreChildren = false;
    var li = asLI(it);
    var go = li.next(':not([deleting])');
    if (!go.size()) {
        go = li.prev(':not([deleting])');            
    }
    if (!go.size()) {            
        noMoreChildren = true;
        go = getParent(li);
    }
    vfsSelect(go.log());
} // deleteItem

function addItem() {
    var it = getFirstSelectedFolder() || getRootItem();
    inputBox('Enter name or path', function(s){
        if (!s) return;    
        socket.emit('vfs.add', { uri:getURI(it), resource:s }, function(result){
            if (!result.ok) {
                msgBox(result.error);
                return;
            }
            setExpanded(it);
            addItemUnder(it, result.item);
            vfsSelect(result.item);
        });
    });
} // addItem

function hideExpansionButtons() { animate(expansionCss, 'opacity', 0) }

function showExpansionButtons(state /** optional */) {
    if (typeof state !== 'undefined' && !state) {
        hideExpansionButtons();
        return;
    }
    animate(expansionCss, 'opacity', 1, {duration:0.2});
} // showExpansionButtons              

function setupEventHandlers() {

    $('#vfs').click(function(){
        vfsSelect(null); // deselect
    });
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
            $('#vfs .expansion-button').fadeIn();
        },
        mouseout: function(ev){
            ev.stopImmediatePropagation();
            $(this).removeClass('hovered');
        }
    });
    $('#vfs .expansion-button').live({
        click: function(ev){
            ev.stopImmediatePropagation();
            removeBrowserSelection();
            var li = $(ev.target).closest('li');
            isExpanded(li) ? setExpanded(li, false) : expandAndLoad(li);
        },
        mouseover: function(ev){
            $('#vfs .expansion-button.hovered').removeClass('hovered');
            $(this).addClass('hovered');
        },
        mouseout: function(ev){
            $(this).removeClass('hovered');
        }
    });
    $('#vfs').hover(showExpansionButtons, hideExpansionButtons);
    $('body').keydown(function(ev){
        if (!(ev.target instanceof HTMLBodyElement)) return; // focused elsewhere, but the event propagated till here
        if (virtualFocusEventHandler(ev) === false) {
            ev.stopImmediatePropagation();
            return false;
        }
    });
    $('#bindItem').click(bindItem);
    $('#addItem').click(addItem);
    $('#renameItem').click(renameItem);
    $('#deleteItem').click(deleteItem);
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

function eventHandler_vfs_keydown(ev) {
    var sel = asLI(getFirstSelectedItem());  
    var go;
    switch (ev.keyCode) {
        case 38: // up
            go = sel.prev();
            if (go.size()) break;
            go = getParent(sel);
            break;                
        case 40: // down
            if (!sel.size()) { // initialize with root
                go = getRoot(); 
                break;
            }
            if (isExpanded(sel)) { // try first child 
                go = getFirstChild(sel);
                if (go.size()) break;
            }
            go = sel.next() // try the sibling
            if (go.size()) break;
            // try the parent's sibling
            var v = sel;
            while ((v = getParent(v)).size()) {
                if (v.next().size()) {
                    go = v.next();
                    break;
                } 
            }  
            break;                
        case 37: // left
            isFolder(sel) && isExpanded(sel)
                ? setExpanded(sel, false)
                : go = getParent(sel);
            break;
        case 39: // right
            if (!isFolder(sel)) break;
            isExpanded(sel)
                ? go = getFirstChild(sel)
                : expandAndLoad(sel);
            break;
        case 36: // home
            go = getRoot();
            break;
        case 35: // end
            go = getLastChild(getParent(sel));
            if (go.size() && !go.is(sel)) break;
            go = getRoot();
            // go down till it's possible
            while ((v = getLastChild(go)).size()) {
                go = v;
            }
            break;
        case 113: // F2
            renameItem();
            break;
        case 46: // delete
            deleteItem();
            break;
        default:
            log(ev.keyCode); 
            return; // unsupported key, don't handle                        
    }
    if (go && go.size()) {
        showExpansionButtons();
        vfsSelect(go);
    }
    return false;
} // eventHandler_vfs_keydown

function vfsSelect(el) {
    $('#vfs .selected').removeClass('selected');
    asLI(el).addClass('selected').scrollToSee({duration:'fast'});
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

/** return children in the same format of the parameter: jQuery, array of items or array of HTMLElements */
function getChildren(x) {
    if (!x) return false;
    var item = !!x.element;
    var children = $(x.element || x).find('ul>li');
    if (x instanceof $) return children; 
    var res = [];
    children.each(function(idx,el){
        res.push(item ? asItem(el) : el);         
    });
    return res;
} // getChildren

/** return first child of "parent" matching "pattern" */
function getFirstChild(parent, pattern /** optional */) {
    var inputType = getType(parent); 
    parent = asLI(parent);
    assert(parent.size(), 'parent');
    assert(!pattern || typeof pattern == 'object', 'pattern');
    var res = false;
    parent.find('ul>li').each(function(idx,el){    
        var child = asItem(el)
        if (pattern) { // do we have a pattern?
            // does it match?
            for (var k in pattern) { 
                if (pattern.hasOwnProperty(k)
                && pattern[k] !== child[k]) return; // ...nope, skip
            }
        } 
        res = child; // found! mark it
        return false; // stop it 
    });
    return toType(inputType, res); // convert output to the same type of the input
} // getFirstChild

function getLastChild(parent) {
    var e = asLI(parent).find('ul:first>li:last');
    return toType(getType(parent), e);
} // getLastChild

/** determine the type of the element */
function getType(x) {
    if (!x) return false;
    if (x.element) return 'item';
    if (x instanceof HTMLElement) return 'html';
    if (x instanceof $) return 'jquery';
    return false;
} // getType

/** convert the element to the specified type */
function toType(to, x) {
    if (!to) return false; // bad
    var from = getType(x);
    if (from == to) return x; // no need for conversion
    switch (from) {
        case false:
            return (to == 'jquery') ? $('') : false;
        case 'item':
            if (to == 'html') return x.element;
            // to == 'jquery'
            return $(x.element);
        case 'html':
            if (to == 'jquery') return $(x).closest('li');
            // to == 'item'
            return $(x).closest('li').data('item');
        case 'jquery':
            if (to == 'html') return x[0];
            // to == 'item'
            return x.data('item');
        default:
            assert('unsupported type: '+from);
    }
} // setType

function getParent(it) {
    var p = asLI(it).parent().closest('li');
    return toType(getType(it), p); 
} // getParent

function isFolder(it) {
    it = asItem(it);
    return it && it.itemKind.endsBy('folder');
} // isFolder

function isRoot(it) { return getURI(it) == '/' }

function isExpanded(x) { return asLI(x).hasClass('expanded') }

function getURI(item) {
    item = asItem(item);
    var p = getParent(item);
    return (p ? getURI(p) : '') // recursion
        + encodeURI(item.name)
        + (p && isFolder(item) ? '/' : '');
} // getURI

/** get the item from the uri, but only if it's currently in our tree */
function getItemFromURI(uri) {    
    var run = getRootItem();
    for (var i=0, a=uri.split('/'), l=a.length; i<l; ++i) {
        var name = a[i];
        if (!name) continue;
        run = getFirstChild(run, {name:name});
        if (!run) return false;
    }
    return run;  
} // getItemFromURI 

function vfsUpdateButtons() {
    var it = getFirstSelectedItem();
    enableButton('bindItem', it && it.itemKind == 'virtual folder');
    enableButton('renameItem', it && !isRoot(it)); 
    enableButton('deleteItem', it && !isRoot(it)); 
} // vfsUpdateButtons 

function enableButton(name, condition) {
    $('#'+name).attr({disabled: !condition});
} // enableButton

function reloadVFS(item) {
    var e = item ? asLI(item) : getRoot();
    e.find('ul').remove(); // remove possible children
    socket.emit('vfs.get', { uri:item ? getURI(item) : '/', depth:1 }, function(data){
        if (!log(data)) return;
        bindItemToDOM(data, e);
        setExpanded(e);
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

/** util function for those functions who want to accept several types but work with the $(LI)  */
function asLI(x) { return toType('jquery', x) }

/** util function for those functions who want to accept several types but work with the $(LI)  */
function asItem(x) { return toType('item', x) }

function setExpanded(item, state) {
    var li = asLI(item);
    if (!li.size()) return;
    var button = li.find('.expansion-button:first');
    if (state == undefined) state = true;
    button.text(state ? '▲' : '▷');
    if (!isFolder(li)) {
        button.css({visibility:'hidden'});
        return;        
    }
    if (isExpanded(li) == state) return;
    li.addClass(state ? 'expanded' : 'collapsed')
        .removeClass(!state ? 'expanded' : 'collapsed');
    // deal with the container of children
    var ul = li.find('ul:first');
    if (state) {
        if (!ul.size())
            ul = $('<ul>').appendTo(li);
    } 
    else { 
        ul.remove();
    }        
    return true;
} // setExpanded

function expandAndLoad(li) {
    setExpanded(li);
    reloadVFS(li);
} // expandAndLoad

function bindItemToDOM(item, element) {
    var li = asLI(element);
    item.element = li[0];  // bind the item to the html element, so we can get to it 
    li.data({item:item});
    li.find('.label:first').text(item.name);
    var icon = isFolder(item) ? 'folder' : item.itemKind;
    if (icon=='file') {
        icon = nameToType(item.name) || icon;
    } 
    li.find('.icon:first').html("<img src='"+getIconURI(icon)+"' />");
    setExpanded(li, false);
    return element;
} // bindItemToDOM

function addItemUnder(under, item) {
    if (under.element) { // it's an item
        under = under.element; // we want the element
        assert(under, 'under'); // we only work with items linked to elements
        // the UL element is the place for children, have one or create it  
        var x = $(under).find('ul'); 
        under = x.size() ? x : $('<ul>').appendTo(under); 
    }
    under.children('span.no-children').remove(); // remove any place holder
    var el = $(tpl.item).appendTo(under);                 
    return bindItemToDOM(item, el);
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
