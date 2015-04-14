/**
 * @author Massimo Melina <a@rejetto.com>
 */

LOTS_OF_FILE_IN_FOLDER = 1000;

tpl.item = "<li draggable='true'>"
    +"<div class='item-row'><span class='expansion-button'></span><span class='icon'></span><span class='label'></span></div>"
    +"</li>";
tpl.itemMarker = "<svg xmlns='http://www.w3.org/2000/svg' version='1.1' style='width:1.5em; height:1.5em; position:absolute;' viewBox='0 0 100 100'>"
    +"<circle cx='0' cy='0' r='35' stroke='#000' stroke-width='2' fill='{color}'/>"
    +"<line x1='0' y1='0' x2='35' y2='0' stroke='#000' stroke-width='2' />"
    +"<line x1='0' y1='0' x2='0' y2='35' stroke='#000' stroke-width='2' />"
    +"</svg>";
tpl.markerMod = tpl.itemMarker.x({ color:'rgba(200,200,0,0.5)' });
tpl.markerOverlapping = tpl.itemMarker.x({ color:'rgba(255,0,0,0.3)' });
tpl.markerFixed = tpl.itemMarker.x({ color:'rgba(0,0,255,0.5)' });

tpl.noChildren = "<span class='no-children'>nothing</span>";
tpl.loader = "<img src='/~/pics/loader.gif' class='near-text loader' />";

tpl._remap('$(A)'); // precompile, so we clone, no parsing

var vfsClipboard;

$(function(){

    tpl.item.clone().addClass('item').attr('id','root').appendTo($('<ul>').appendTo('#vfs')); // create the root element

    // hide expansion button
    expansionCss = addStyleRule('#vfs .expansion-button','opacity:0');

    vfsUpdateButtons();

    socket.on('vfs.changed', function(data){
        ioData(data);
        if (!log('vfs.changed',data)) return; // something's wrong
        var folder = data.uri.substr(0, data.uri.lastIndexOf('/')+1);
        var it = getItemFromURI(folder);
        if (!it) return; // not in the visible tree: ignore
        if (!isExpanded(it)) return; // not expanded, we don't see its content, no need to reload
        reloadVFS(it);
    });

    // some event handlers
    $('#vfs').click(function(){
        vfsSelect(null); // deselect
    });
    // drag&drop
    var dragging, destination;
    $('#vfs').on({
        click: function(ev){
            vfsSelect(this);
            return false;
        },
        dblclick: function(ev){
            var it = getFirstSelected();
            if (isFolder(it)) {
                toggleExpanded(it);
            }
            return false;
        },
        dragstart:function(event){
            dragging = asLI(event.target);
            event.stopPropagation();
        },
        drop:function(event){
            event.preventDefault();
            event.stopPropagation();
            moveItem(dragging, destination);
        },
        dragover:function(event) {
            destination = asLI(event.target);
            if (!destination.length) return;
            while (!isFolder(destination)) // only folders are a destination (for now)
                destination = getParent(destination);

            if (!dragging._parent)
                dragging._parent = getParent(dragging); // cache it
            if (destination[0]===dragging._parent[0]) return; // going nowhere
            if (destination.closest(dragging).length) return; // nothing within us

            event.preventDefault();
        }
    }, 'li');

    $('#vfs').on({
        click: function(ev){
            toggleExpanded($(this).closest('li'));
        }
    }, '.expansion-button');
    $('#vfs').hover(showExpansionButtons, hideExpansionButtons);
    $('#bindItem').click(bindItem);
    $('#addItem').click(addItem);
    $('#renameItem').click(renameItem);
    $('#deleteItem').click(deleteItem);
    $('#save').click(save);
    makeItFileSelector('#load', load);

    $('body').keydown(function(ev){
        if (!ev.target.tagName.up()._among('BODY','BUTTON','A')) return; // these kinds of element should not interfere with the VFS controls
        if (vfsKeydown(ev) === false) { // it can decide to interrupt the event handling
            ev.stopImmediatePropagation();
            return false;
        }
    });
});

function makeItFileSelector(el, cb) {
    el = $(el);
    // cover the real button to intercept the click
    var f = $('<input type="file">').css({ position:'absolute', opacity:0.001 }).sameSize(el).insertBefore(el);

    f.change(function(){
        if (!this.files.length) return;
        var sel = this.files;
        cb(sel);
        f.val(''); // so that the user can reload the same files
    });
}//makeItFileSelector

function save() {
    sendCommand('vfs.export', {}, function(res){
        var blob = new Blob([res.data], { type:'application/octect-stream' });
        saveAs(blob, 'hfs.vfs');
    });
}//save

function load(sel) {
    readFile(sel[0], function(data){
        if (!isString(data)) return;
        sendCommand('vfs.import', { root:data }, function(res){
            if (res.ok)
                reloadVFS();
        });
    });
}//load

function readFile(src, cb){
    var reader = new FileReader();
    reader.onload = function(event) {
        cb(event.target.result);
    };
    reader.readAsText(src);
}//readFile

function sameFileName(a,b) {
    return serverInfo.caseSensitiveFileNames ? a === b : a.same(b);
} // sameFileName

function sendCommand(cmd, data, cb) {
    socket.emit(cmd, ioData(data), function(result){
        ioData(result);
        log(cmd, result);
        cb && cb(result);
    })
} // sendCommand

function bindItem() { 
    var it = getFirstSelected();
    if (!it) return;
    inputBox('Enter path', function(s){
        if (!s) return;
        sendCommand('vfs.set', { uri:getURI(it), resource:s }, function(result){
            result.ok
                ? reloadVFS(it)
                : msgBox(result.error);
        });
    });
} // bindItem

function moveItem(what, where) {
    sendCommand('vfs.move', { from:getURI(what), to:getURI(where) }, function(result){
        if (!result.ok)
            return msgBox(result.error);
        var v = result.from;
        if (v) {
            treatFileData(v);
            addItemUnder(getParent(what), v);
        }
        asLI(what).remove();
        treatFileData(v=result.to);
        if (!isExpanded(where)) return;
        if (v.overlapping)
            asLI(getItemFromURI(v.name, where)).remove(); // remove overlapped one
        addItemUnder(where, v);
    });
}//moveItem

function renameItem() {
    var it = getFirstSelectedItem();
    if (!it || isRoot(it) || isDeleted(it)) return;
    inputBox('Enter new name', it.name, function(s){
        if (!isString(s)) return; // canceled
        s = $.trim(s);
        if (s == it.name) return; // no change
        sendCommand('vfs.set', { uri:getURI(it), name:s }, function(result){
            if (!result.ok) {
                msgBox(result.error);
                return;
            }
            var will = result.item;
            treatFileData(will);
            addItemUnder(getParent(it), will); // update GUI
            $(it.element).remove();
            vfsSelect(will);
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
    sendCommand('vfs.delete', { uri:getURI(it) }, function(result){
        if (!result.ok) { // something went wrong
            // ugh, forget it.... (unmark)
            it.deleting = false;
            li.removeAttr('deleting').fadeIn(100);
            // let the user know
            msgBox(result.error);
            return;
        }
        // if this number has changed, then we need to do a little extra work: the item became a deleted item.
        if (oldNumber !== result.folderDeletedCount) {
            updateDeletedItems(parent, {adding:result.dynamicItem});
        }
        removeTreeItem(li);
    });
} // deleteItem

function removeTreeItem(li) {
    li = asLI(li);
    li.fadeOut(100, function(){
        var parent = getParent(li);
        li.remove();
        if (!getFirstChild(parent).length) {
            parent.find('ul:first').append(tpl.noChildren.clone()); // deleted last item of a folder
        }
    })
}//removeTreeItem

function restoreItem(it) {
    if (it === undefined)
        it = getFirstSelectedItem();
    if (!it || !isDeleted(it)) return;
    var li = $(it.element); 
    var folder = li.closest('li.item');
    vfsSelectNearby(li);
    sendCommand('vfs.restore', { uri:getURI(folder), resource:it.name }, function(result){
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
    sendCommand('vfs.restore', { uri:getURI(li), resource:'*' }, function(result){
        if (!result.ok) return;
        reloadVFS(li);
    });    
} // restoreAllItems

function addItem() {
    var it = getFirstSelectedFolder() || asItem(getRoot());
    inputBox('Enter name or path (you need to be on the server machine)', function(s){
        if (!s) return;
        sendCommand('vfs.add', { uri:getURI(it), resource:s }, function(result){
            if (!result.ok) {
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

function toggleExpanded(li) {
    isExpanded(li) ? setExpanded(li, false) : expandAndLoad(li);
} // toggleExpanded

function virtualFocusEventHandler(ev) {
    // there's a couple of possible event handlers to be called
    var v = 'eventHandler_vfs';
    var fns = [v+'_'+ev.type, v];

    for (var i=0, l=fns.length; i<l; ++i) {
        var fn = window[fns[i]]; // try to get it
        if (typeof fn == 'function') { // if it exists, run it
            if (fn(ev) === false) return false; // it can decide to interrupt the event handling
        }
    }
} // virtualFocusEventHandler

function vfsKeydown(ev) {
    var go;
    var sel = getFirstSelected();
    // letter keys
    var k = ev.keyCode;
    if (between(65,k,90) || between(48,k,57)) // alphanumeric
        k = String.fromCharCode(k);
    switch (k) {
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
        case 'X':
            if (ev.ctrlKey)
                vfsClipboard = sel;
            break;
        case 'V':
            if (ev.ctrlKey && vfsClipboard)
                moveItem(vfsClipboard, sel);
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
} // vfsKeydown

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

function getRoot() { return $('#root'); }

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
    var res = false;
    parent.find('ul:first>li').each(function(idx,el){    
        if (pattern) { // do we have a pattern?
            var child = asItem(el);
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
    if ('itemKind' in x) return 'item';
    if (x instanceof HTMLElement) return 'html';
    if (x instanceof jQuery) return 'jquery';
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
    return it && it.itemKind==='folder';
} // isFolder

function isRoot(it) { return asItem(it).isRoot }

function isExpanded(x) { return asLI(x).hasClass('expanded') }

function isDeleted(x) { return asLI(x).parent().closest('.deleted-items').length }

function getURI(item) {
    item = asItem(item);
    if (!item) return false;
    if (isRoot(item)) return '/';
    var p = getParent(item);
    return (p ? getURI(p) : '') // recursion
        + encodeURI(item.name)
        + (p && isFolder(item) ? '/' : '');
} // getURI

/** get the item from the uri, but only if it's currently in our tree */
function getItemFromURI(uri, from) {
    var run = asItem(from || getRoot());
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
    enableButton('bindItem', it);
    enableButton('renameItem', it && !isRoot(it) && !isDeleted(it)); 
    enableButton('deleteItem', it && !isRoot(it)); 
} // vfsUpdateButtons 

function enableButton(name, condition) {
    $('#'+name).attr({disabled: !condition});
} // enableButton

function getExpectedName(item) {
    return item.resource ? basename(item.resource) : item.name;
}//getExpectedName

function treatFileData(item) {
    if (!item.name)
        item.name = getExpectedName(item);
    else if (item.name==='/')
        item._expand({ name:'home', isRoot:true });
    if (isString(item.ctime))
        item.ctime = new Date(item.ctime);
    if (isString(item.mtime))
        item.mtime = new Date(item.mtime);
    if (!item.children) return;
    item.children.forEach(treatFileData);
} // treatFileData

function reloadVFS(item, cb) {
    var e = item ? asLI(item) : getRoot();
    var loader = e.find('.label:first .loader');
    if (!loader.length)
        loader = tpl.loader.clone().appendTo( e.find('.label:first') );
    sendCommand('vfs.get', { uri:item ? getURI(item) : '/', depth:1 }, function(res){
        try {
            if (!res || !res.ok) return;
            var it = res.item;
            var n = tryGet(it, 'children.length');
            if (n > LOTS_OF_FILE_IN_FOLDER
            && !confirm('This folder contains {0} items. It may slow down your computer. Continue?'.x(n))) {
                setExpanded(e, false);
                return;
            }
            treatFileData(it);
            bindItemToDOM(it, e);
            setExpanded(e);
            var ul = e.find('ul:first');
            ul.empty();  // clean, first
            updateDeletedItems(e);
            if (n) {
                ul.hide();
                it.children.forEach(function(it){
                    addItemUnder(e, it);
                });
                ul.slideDown(100);
                delete it.children; // no more needed
            }
            else if (!ul.children().length) { // there may be special items making UL non-empty
                ul.append(tpl.noChildren.clone());
            }
            if (cb) cb();
        }
        finally {
            loader.remove();
        }
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
    if (!state)
        li.find('.label:first .loader').remove();
    updateDeletedItems(li);
    // deal with the container of children    
    var ul = li.find('ul:first');
    if (state) { // expanded
        if (!ul.length)
            ul = $('<ul>').appendTo(li);
    } 
    else {
        ul.slideUp(100, function(){
            ul.remove();
        });
    }
    return true;
} // setExpanded

function expandAndLoad(li) {
    if (isDeleted(li)) return false;
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
    var icon = isRoot(item) ? getPicURI('home')
        : getIconURI(isFolder(item) ? 'folder'
            : item.itemKind=='file' && nameToType(item.name) || item.itemKind
        );
    li.find('.icon:first').html("<img src='"+icon+"' />");
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
        li = tpl.item.clone().addClass('deleted-items').prependTo(ul);
        li.find('.icon:first').html("<img src='{0}' style='position:absolute; z-index:1; opacity:0.6;'><img src='{1}'>".format(getPicURI("cross"), getIconURI('folder')));
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
    if (position === undefined)
        position = 'sorted';
    under = asLI(under);
    if (under.hasClass('deleted-items')
    && isString(item)) { // automatic construction of the special item
        item = {
            deleted: true,
            itemKind: item.endsWith('/') ? 'folder' : 'file',
            nodeKind: 'temp',
            name: item.excludeTrailing('/')
        };
    }
    if (item && !isString(item))
        item = asItem(item);

    // the UL element is the place for children, have one or create it
    var x = under.children('ul'); 
    under = x.length ? x : $('<ul>').appendTo(under);

    under.children('span.no-children').remove(); // remove any place holder
    var el = $(item.element || tpl.item.clone().addClass(item.deleted ? 'deleted' : 'item'));
    el.attr({
        title: [su("Size: ", formatBytes(item.size)),
            item.ctime && "Created: {ctime.toLocaleString}",
            item.mtime && "Modified: {mtime.toLocaleString}",
            item.deleted ? "This item is deleted"
                : item.overlapping ? "This item is fixed and overlapping another one with the same name."
                : choose(item.nodeKind, {
                    mod: "This item has been renamed.\nWas: {0|getExpectedName}",
                    fixed: "This item is a fixed" // shitty description. Any better?
                }, '')
        ].filter().join('\n').x(item) ||null
    });
    // overlay
    el.find('.icon-overlay').remove();
    if (!item.deleted)
        if (x=tpl['marker'+(item.overlapping ? 'Overlapping' : item.nodeKind.capital())])
            x.clone().addClass('icon-overlay').insertBefore(el.find('.icon'));

    var beforeThis; // where to put the new item
    if (position._among('top','sorted')) { // both require to put the item after special items (so skip them)
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
