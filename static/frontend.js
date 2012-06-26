var socket = io.connect(window.location.origin);
var currentFolder, listFromServer, foldersBefore=1;

// this object will hold all the customizable stuff, that is added in file "tpl.js"  
var TPL = function(event) {
    var fun = TPL[currentMode+'_'+event] || TPL[event];
    if (!fun) return;
    var newArgs = [];                               
    for (var i=1,a=arguments,l=a.length; i<l; ++i)
        newArgs.push(a[i]);         
    fun.apply(this, newArgs);
};

// understand the requested folder from the URL
function getURLfolder() {
    var sub = location.hash.substr(1);
    return sub.startsBy('/') ? sub : location.pathname+sub;
} // getURLfolder

$(function onJQ(){ // dom ready
    socket.on('connect', function onIO(){ // socket ready
        // try to restore last options
        updateOrder(getCookie('order'));
        updateMode(getCookie('mode'));
        // change things at user will
        $('#order').change(function(){ updateOrder(); redrawItems(); }); 
        $('#mode').change(function(){ updateMode(); redrawItems(); });        
         
        loadFolder(getURLfolder(), function onFolder(){ // folder ready

            /* support for the BACK button: when the user clicks the BACK button, the address bar changes going out of   
                sync with the view. We fix it ASAP. I don't know an event for the address bar, so i'm using an setInterval. */         
            setInterval(function onBackSupport(){
                var shouldBe = getURLfolder(); 
                if (currentFolder != shouldBe) {
                    loadFolder(shouldBe);        
                } 
            }, 300);

        }); // don't redraw        
    });//socket connect
    
    socket.on('vfs.changed', function(data){
        log(data);
        // it would be nicer to update only the changed item, but for now easily reload the whole dir  
        var folder = data.uri.substr(0, data.uri.lastIndexOf('/', data.uri.length-2)+1);
        if (folder === currentFolder) {
            loadFolder();            
        }
    });

    // item hovering
    $('.item-link').live({
        mouseenter: function(){
            if (!$(this).isOverflowed()) return; // fine!
            // our label is clipped
            var lbl = $(this).find('.item-label');
            // make some changes so it's hopefully fully visible  
            lbl.addClass('full-label');
            // if no bg was assigned, the enlarged label may overlap other elements, and its transparency may cause very bad readability 
            if (isTransparent(lbl.css('background-color'))) {
                lbl.css('background-color', lbl.getClosestBackgroundColor() || '#fff')
                    .data('remove bg', true);
            }
        },
        mouseleave: function(){
            // undo changes made few lines above
            var lbl = $(this).find('.full-label');
            lbl.removeClass('full-label');
            if (lbl.data('remove bg')) {
                lbl.css('background-color','');
                lbl.removeData('remove bg',null);
            }
        },
    });//live

});//dom ready

// ask the server for the items list of the specified folder, then sort and display
function loadFolder(path /** optional */, cb /** optional */) {
    if (path) currentFolder = path;
    $('#folder').text(currentFolder);                
    socket.emit('get list', { path:currentFolder }, function onGetList(reply){
        listFromServer = reply; // hold it in a global variable, to not loose it
        convertList(reply);
        $('#folder-info').html("number of items: "+reply.items.length);
        sortItems();                
        redrawItems();
        if (typeof cb == 'function') {
            cb();
        }
    });
} // loadFolder

// convert the data: from object to array, so it can be sorted, and expands some field-names
function convertList(serverReply) {
    var a = serverReply.items;
    var clientFormat = [];
    for (var k in a) {
        var o = a[k];
        renameProperties(o, {t:'type', s:'size'});
        o.label = k;            
        switch (o.type) {
            case undefined: // no type is default type: file
                o.type = 'file';
            case 'file': // for files, calculate specific type
                o.type = nameToType(k) || o.type;
                break;
            case 'link':
                o.url = o.resource; 
                break;  
        }
        o.url = o.url || encodeURI(currentFolder)+encodeURI(k)+(o.type == 'folder' ? '/' : '');
        
        clientFormat.push(o);
    }
    serverReply.items = clientFormat;
} // convertList

// takes an object and renames some of its properties to the mapped names
function renameProperties(o, map) {
    for (var from in map) {
        var to = map[from];
        if (!(from in o)) continue;
        o[to] = o[from];
        delete o[from];
    }
} // renameProperties

// rebuild the DOM of items
function redrawItems() {    
    var x = $('#items').empty();

    if (!listFromServer) return;

    // add a link to the parent folder
    var cf = currentFolder; // shortcut
    if (cf > '/') {
        addItem({
            label: '&uarr;&uarr;',
            url: cf.substr(0, 1+cf.lastIndexOf('/',cf.length-2)), 
            type: 'folder',
            icon: 'folder'
        });
    }
    
    // put all the items. We don't support pagination yet
    for (var i=0, a=listFromServer.items, l=a.length; i<l; ++i) {
        var o = $.extend({}, a[i]); // clone. The item will be manipulated (also inside addItem), and we don't want to make this changes persistant over changes of the view mode
        o.icon = o.type;
        addItem(o); 
    }
} // redrawItems

// build the DOM for the single item, applying possible filtering functions 
function addItem(it) {
    it.extend({'icon-file':getIconURI(it.icon)}); // make this additions before the hook, so it can change these too
    TPL('onObjectItem', it); // custom treatment, especially mode-based
    $('<li>').append(TPL.item.format(it))
        .appendTo('#items')        
        .find('a.item-link').click(itemClickHandler);
} // addItem            

// called when an item is clicked
function itemClickHandler() {
    var x = $(this); 
    var h = x.attr('href');
    if (h.substr(-1) == '/') {
        if (location.pathname != '/') { // reloads the page to have a neater URL
            location = '/#'+h.substr(1);
            return false;
        }
                
        location.hash = (h.startsBy(location.pathname)) ? h.substr(location.pathname.length) : h;
        loadFolder(h);
        return false;
    }
    if (!x.attr('target')) {
        x.attr('target', 'preview'); // open the file in a new window so the app doesn't stop
    }
    return true;
} // itemClickHandler

function updateMode(v){
    // if no value is passed, then read it from the DOM, otherwise write it in the DOM
    if (!v || !v.length) v = $('#mode').val(); 
    else $('#mode').val(v);
    
    currentMode = v; // global 
    setCookie('mode', v); // remember 
    $('body').attr('mode', v);
} // updateMode

function updateOrder(v) {
    // if no value is passed, then read it from the DOM, otherwise write it in the DOM
    if (!v || !v.length) v = $('#order').val();
    else $('#order').val(v);
    
    currentOrder = v; // global
    setCookie('order', v);  // remember
    if (v) {
        $('#order option[value=]').remove(); // after we have sorted the items there's no way to return to the original order, so let's hide this option
    }
    sortItems();
} // updateOrder

function sortItems() {
    if (!currentOrder || !listFromServer) return; // no job
    
    listFromServer.items.sort(function cb(a,b,field){
        field = field || currentOrder;
        if (field != 'type' && foldersBefore) { // if field is 'type', then the folders are always put at the top
            var res = -cmp(a['type'] == 'folder', b['type'] == 'folder');
            if (res) return res;
        }
        var va = a[field];
        var vb = b[field];
        switch (field) {
            case 'label':
                va=va.low(), vb=vb.low(); 
                break;
            case 'type':
                if (va == 'folder') va=''; // trick to get folders at the top
                if (vb == 'folder') vb='';
                break;  
        }
        return cmp(va,vb) || (field=='label' ? 0 : cb(a,b,'label'));
    });
} // sortItems

