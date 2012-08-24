function sameFileName(a,b) {
    return serverInfo.caseSensitiveFileNames ? a === b : a.same(b);
} // sameFileName

function bindItem() { 
    var it = getFirstSelectedFolder();
    if (!it) return;
    inputBox('Enter path', function(s){
        if (!s) return;    
        socket.emit('vfs.set', ioData({ uri:getURI(it), resource:s }), function(result){
            result.ok   
                ? reloadVFS(it)
                : msgBox(result.error);
        });
    });
} // bindItem

function renameItem() {    
    var it = getFirstSelectedItem();
    if (!it || isRoot(it) || isDeleted(it)) return;
    inputBox('Enter new name', it.name, function(s){
        s = $.trim(s);
        if (!s || s == it.name) return; // no change
        socket.emit('vfs.set', ioData({ uri:getURI(it), name:s }), function(result){
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
    // who's gonna be deleted?
    var li = getFirstSelected();
    if (isDeleted(li)) { // this a deleted one, what we really want is restore it
        restoreItem();
        return;
    }
    if (li.hasClass('deleted-items')) {
        if (!confirmBox('Restore all items?')) return;
        restoreAllItems(li);        
        return;
    }
    // we're not going to delete items that are root, or we are already deleting, or that are not! (special items)
    var it = asItem(li);
    if (!it || isRoot(it) || it.deleting) return;
    it.deleting = true; // mark it, so we avoid overlapping operations
    var parent = getParent(li); 
    var oldNumber = asItem(parent).deletedItems.length; // we'll use this to see if the number has changed at the end
    li.attr('deleting',1).fadeTo(100, 0.5); // mark it visually and at DOM level  
    vfsSelectNearby(li); // renew selection
    // server, please do it
    socket.emit('vfs.delete', ioData({ uri:getURI(it) }), function(result){
        if (!log('vfs.delete',result).ok) { // something went wrong
            // ugh, forget it.... (unmark)
            it.deleting = false;
            li.removeAttr('deleting').fadeIn(100);
            // let the user know
            msgBox(result.error);
            return;
        }
        // if this number has changed, then we need to do a little extra work: the item became a deleted item.
        if (log('old',oldNumber) !== log('now',result.folderDeletedCount)) {
            updateDeletedItems(parent, {adding:result.dynamicItem});
        }
        // GUI refresh
        li.fadeOut(100, function(){
            li.remove();
            if (!getFirstChild(parent).length) { 
                parent.find('ul:first').append(tpl.noChildren); // deleted last item of a folder
            }
        })        
    });
} // deleteItem

function restoreItem(it) {
    if (it === undefined)
        it = getFirstSelectedItem();
    if (!it || !isDeleted(it)) return;
    var li = $(it.element); 
    var folder = li.closest('li.item');
    vfsSelectNearby(li);
    socket.emit('vfs.restore', ioData({ uri:getURI(folder), resource:it.name }), function(result){
        if (!result.ok) return;
        // do the job locally: remove the element from the array
        removeFromDeletedItems(asItem(folder), it.name);
        // refresh GUI
        li.remove();
        updateDeletedItems(folder);
        addItemUnder(folder, result.item);
        // we are not going to automatically select the restored item, so it's easier to restore more files 
    });
} // restoreItem

function restoreAllItems(li) {
    assert(li, 'li');
    li = li.closest('li.item');
    socket.emit('vfs.restore', ioData({ uri:getURI(li), resource:'*' }), function(result){
        if (!result.ok) return;
        reloadVfs(li);
    });    
} // restoreAllItems

function addItem() {
    var it = getFirstSelectedFolder() || getRootItem();
    inputBox('Enter name or path', function(s){
        if (!s) return;    
        socket.emit('vfs.add', ioData({ uri:getURI(it), resource:s }), function(result){
            if (!log('vfs.add',result).ok) {
                msgBox(result.error);
                return;
            }
            if (result.item.nodeKind === 'temp') { // this is a dynamic element, was actually restored from the "deleted" list
                updateDeletedItems(it, { removing:basename(s) });
            }
            setExpanded(it);
            addItemUnder(it, result.item);
            vfsSelect(result.item);
        });
    });
} // addItem

function vfsSelectNearby(li) {
    var selector = 'li:not([deleting])';
    var go = li.next(selector);
    if (!go.length) {
        go = li.prev(selector);
    }
    if (!go.length) {            
        go = getParent(li);
    }
    vfsSelect(go);
} // vfsSelectNearby

function hideExpansionButtons() { animate(expansionCss, 'opacity', 0) }

function showExpansionButtons(state /** optional */) {
    if (typeof state !== 'undefined' && !state) {
        hideExpansionButtons();
        return;
    }
    animate(expansionCss, 'opacity', 1, {duration:0.2});
} // showExpansionButtons              

function expandOrCollapseFolder(li) {
    isExpanded(li) ? setExpanded(li, false) : expandAndLoad(li);
} // expandOrCollapseFolder

// some event handlers
$(function(){
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
            var it = getFirstSelected();
            if (isFolder(it)) {
                expandOrCollapseFolder(it);
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
            expandOrCollapseFolder(li);
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
    $('#bindItem').click(bindItem);
    $('#addItem').click(addItem);
    $('#renameItem').click(renameItem);
    $('#deleteItem').click(deleteItem);
});

function eventHandler_vfs_keydown(ev) {
    var sel = getFirstSelected();  
    var go;
    switch (ev.keyCode) {
        case 38: // up
            go = sel.prev();
            if (go.length) break;
            go = getParent(sel);
            break;                
        case 40: // down
            if (!sel.length) { // initialize with root
                go = getRoot(); 
                break;
            }
            if (isExpanded(sel)) { // try first child 
                go = getFirstChild(sel);
                if (go.length) break;
            }
            go = sel.next(); // try the sibling
            if (go.length) break;
            // try the parent's sibling
            var v = sel;
            while ((v = getParent(v)).length) {
                if (v.next().length) {
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
            if (sel.length && !isRoot(sel)) {
                go = getFirstChild(getParent(sel));
                if (go.length && !go.is(sel)) break;
            }
            go = getRoot();
            break;
        case 35: // end
            go = getLastChild(getParent(sel));
            if (go.length && !go.is(sel)) break;
            go = getRoot();
            // go down till it's possible
            while ((v = getLastChild(go)).length) {
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
            //log(ev.keyCode); 
            return; // unsupported key, don't handle                        
    }
    if (go && go.length) {
        showExpansionButtons();
        vfsSelect(go);
    }
    return false;
} // eventHandler_vfs_keydown

function vfsSelect(el) {
    $('#vfs .selected').removeClass('selected');
    asLI(el).addClass('selected').scrollToMe({duration:'fast'});
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

function getSelected() { return $('#vfs .selected') }

function getFirstSelected() { return $('#vfs .selected:first') }

function getFirstSelectedItem() { return getFirstSelected().data('item') } 

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
    var children = $(x.element || x).find('ul:first>li');
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
    assert(parent.length, 'parent');
    assert(!pattern || typeof pattern == 'object', 'pattern');
    var res = false;
    parent.find('ul:first>li').each(function(idx,el){    
        var child = asItem(el)
        if (pattern) { // do we have a pattern?
            if (!child) return;
            // does it match?
            for (var k in pattern) {
                if (!pattern.hasOwnProperty(k)) continue;
                var match = (k === 'name')
                    ? sameFileName(pattern[k], child[k])
                    : pattern[k] === child[k];
                if (!match) return; // ...nope, skip
            }
        } 
        res = el; // found! mark it
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
    if (asLI(it).hasClass('deleted-items')) {
        return true;
    }
    it = asItem(it);
    return it && it.itemKind.endsBy('folder');
} // isFolder

function isRoot(it) { return getURI(it) == '/' }

function isExpanded(x) { return asLI(x).hasClass('expanded') }

function isDeleted(x) { return asLI(x).closest('.deleted-items').length }

function getURI(item) {
    item = asItem(item);
    if (!item) return false;
    var p = getParent(item);
    return (p ? getURI(p) : '') // recursion
        + encodeURI(item.name)
        + (p && isFolder(item) ? '/' : '');
} // getURI

/** get the item from the uri, but only if it's currently in our tree */
function getItemFromURI(uri, from) {
    var run = asItem(from) || getRootItem();
    for (var i=0, a=uri.split('/'), l=a.length; i<l; ++i) {
        var name = a[i];
        if (!name) continue;
        run = getFirstChild(run, {name:name});
        if (!run) return false;
    }
    return run;  
} // getItemFromURI 

function vfsUpdateButtons() {
    var li = getFirstSelected();
    var it = asItem(li);
    enableButton('addItem', !li.length || it && !it.deleted); 
    enableButton('bindItem', it && it.itemKind === 'virtual folder');
    enableButton('renameItem', it && !isRoot(it) && !isDeleted(it)); 
    enableButton('deleteItem', it && !isRoot(it)); 
} // vfsUpdateButtons 

function enableButton(name, condition) {
    $('#'+name).attr({disabled: !condition});
} // enableButton

function reloadVFS(item, cb) {
    var e = item ? asLI(item) : getRoot();
    socket.emit('vfs.get', ioData({ uri:item ? getURI(item) : '/', depth:1 }), function(data){
        if (!log('vfs.get',data)) return;
        var ul = e.find('ul').empty();  // remove possible children
        bindItemToDOM(data, e);
        setExpanded(e);
        updateDeletedItems(e);
        if (data.children.length) {
            data.children.forEach(function(it){
                addItemUnder(e, it);            
            });
        }
        else if (!ul.children().length) {
            ul.append(tpl.noChildren);
        }
        if (cb) cb();
    });    
} // reloadVFS

/** util function for those functions who want to accept several types but work with the $(LI)  */
function asLI(x) { return toType('jquery', x).closest('li') }

/** util function for those functions who want to accept several types but work with the $(LI)  */
function asItem(x) { return toType('item', x) }

function setExpanded(item, state) {
    if (state === undefined) state = true;
    var li = asLI(item);
    if (!li.length) return;
    item = asItem(item);
    var button = li.find('.expansion-button:first');
    button.text(state ? '▲' : '▷');
    if (!isFolder(li) 
    || item && item.deleted) {  // deleted folders are not expandable
        button.css({visibility:'hidden'});
        return;        
    }
    if (isExpanded(li) == state) return;
    li.addClass(state ? 'expanded' : 'collapsed')
        .removeClass(!state ? 'expanded' : 'collapsed');
    updateDeletedItems(li);
    // deal with the container of children    
    var ul = li.find('ul:first');
    if (state) { // expanded
        if (!ul.length)
            ul = $('<ul>').appendTo(li);
    } 
    else {
        ul.remove();
    }        
    return true;
} // setExpanded

function expandAndLoad(li) {
    li = asLI(li);
    setExpanded(li);
    if (li.hasClass('item'))
        return reloadVFS(li);
    if (li.hasClass('deleted-items')) {
        asItem(getParent(li)).deletedItems.forEach(function(name){            
            addItemUnder(li, name);
        });
    }
} // expandAndLoad

function bindItemToDOM(item, element) {
    var li = asLI(element);
    item.element = li[0];  // bind the item to the html element, so we can get to it
    if (isFolder(item) && !item.deletedItems) {
        item.deletedItems = []; // having this always present will ease the rest of the code
    }   
    li.data({item:item});
    li.find('.label:first').text(item.name);
    var icon = isFolder(item) ? 'folder' : item.itemKind;
    if (icon=='file') {
        icon = nameToType(item.name) || icon;
    } 
    li.find('.icon:first').html("<img src='"+getIconURI(icon)+"' />");
    if (isFolder(item) && isExpanded(item)) {
        updateDeletedItems(item);
    }
    return element;
} // bindItemToDOM

/** updates the pseudo-folder containing removed temp items */
function updateDeletedItems(it, options) {
    options = options||{};
    var folder = asLI(it);
    var ul = folder.children('ul');
    it = asItem(it);
    if (!it) return; // this folder has not bound an item, it must be a special folder

    if (options.adding) {
        it.deletedItems.push(options.adding);
    }
    if (options.removing) {
        removeFromDeletedItems(it, options.removing);
    }

    if (!it.deletedItems || !it.deletedItems.length) { // no items?
        if (!ul.length) return;
        var li = ul.children('li.deleted-items');
        if (!li.length) return;
        if (getFirstSelected().is(li)) { 
            vfsSelectNearby(li);
        }
        li.remove();
        // if there is no more children in the containing folder, remove the UL as well
        if (!ul.children().length) {
            ul.remove();
        }
        return;
    }
    // ensure there's a UL for the containing folder
    if (!ul.length) {
        ul = $('<ul>').appendTo(folder);
    }
    // ensure there's a LI of the pseudo-folder 
    var li = ul.children('li.deleted-items');
    if (!li.length) {  
        li = $(tpl.item).addClass('deleted-items').prependTo(ul); 
        li.find('.icon:first').html("<img src='{0}' style='position:absolute;'><img src='{1}'>".format(getPicURI("cross"), getIconURI('folder')));
        setExpanded(li, false);
    }
    // update the label                
    li.find('.label:first').text('Deleted: {0} item(s)'.format(it.deletedItems.length));
    // some more work if the pseudo-folder is expanded    
    if (!isExpanded(li)) return; 
    if (options.adding) {
        addItemUnder(li, options.adding); 
    }
    if (options.removing) {
        getFirstChild(li, {name:options.removing}).remove();        
    }
} // updateDeletedItems

/** put a new element under $under with bound object $item 
 * @position {undefined|string} admitted values: 'sorted' (default), 'top', 'bottom'
 */
function addItemUnder(under, item, position) {
    if (!item) return false;
    if (position === undefined) position = 'sorted';
    under = asLI(under);
    if (under.hasClass('deleted-items')
    && typeof item == 'string') { // automatic construction of the special item
        item = {
            deleted: true,
            itemKind: item.endsBy('/') ? 'folder' : 'file',
            name: item.excludeTrailing('/'),
        };
    }

    // the UL element is the place for children, have one or create it  
    var x = under.children('ul'); 
    under = x.length ? x : $('<ul>').appendTo(under);
    
     
    under.children('span.no-children').remove(); // remove any place holder
    var el = $(tpl.item).addClass(item.deleted ? 'deleted' : 'item');
    var beforeThis; // where to put the new item
    if (position.isIn('top','sorted')) { // both require to put the item after special items (so skip them)
        beforeThis = getFirstChild(under); // go down one level
        // skip special items
        while (beforeThis.length && !beforeThis.hasClass('item')) { 
            beforeThis = beforeThis.next();
        }
    }
    if (position === 'sorted') {
        // skip elements until we find one that has a "higher" name (case-insensitively)
        var name = item.name.low(); 
        while (beforeThis.length
            && beforeThis.hasClass('item')
            && beforeThis.find('.label').text().low() < name) {
            beforeThis = beforeThis.next();
        }
    }
    // add the item at the calculated position, or at the end
    (beforeThis && beforeThis.length)
        ? el.insertBefore(beforeThis)
        : el.appendTo(under);
    // do the final setup
    bindItemToDOM(item, el);
    setExpanded(el, false);    
} // addItemUnder

function removeFromDeletedItems(item, name) {
    item = asItem(item);
    if (!item) return false;
    var a = item.deletedItems;
    var i = a.length;
    name = name.excludeTrailing('/');
    while (i--) {
        if (sameFileName(a[i].excludeTrailing('/'), name)) {
            a.splice(i,1);
            return true;
        }
    }
} // removeFromDeletedItems
