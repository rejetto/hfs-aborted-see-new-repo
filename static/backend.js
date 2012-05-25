var socket = io.connect(window.location.origin);

$(function(){ // dom ready
    $('#bind, #addFolder').attr({disabled:true});
    setupEventHandlers();
    socket.on('connect', function(){ // socket ready
        showVFS();
    });
});

function getParentFromItem(it) {
    $(it.element).parent().data('item');
} // getParentFromItem

function getURIfromItem(it) {
    getParentFromItem(it);
} // getURIfromItem

function setupEventHandlers() {
    $('#vfs').click(function(){
        vfsSelect(null); // deselect
    });
    $('#bind').click(function(){
        inputBox({text:'Enter path', do:function(s){
            var it = log(getSelectedItems());
            if (!it) return;
            it = it[0];
            ** we need to get the uri for the item, but this information is currently not in the item.
            * Una possibilità è calcolarla per ogni elemento quando viene inserito nell'albero, ma se poi
            * c'è un rename o un drag&drop bisogna aggiornarlo.
            * Un'altra possibilità è puntare al padre, ma va aggiornato se c'è un drag&drop.                                       
            socket.emit('vfs.set', { uri:'/', resource:s }, function(ok){
                log(ok);
            });
        });
    });
    $('#vfs li').live({
        click: function(ev){
            log(this);
            ev.stopImmediatePropagation();
            vfsSelect(this);
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

function vfsUpdateButtons() {
    var it = getSelectedItems()[0]; //** do it on just one item for now
    enableButton('bind', it && it.itemKind == 'virtual folder'); 
    enableButton('addFolder', it && 'folder'.in(it.itemKind)); 
} // vfsUpdateButtons 

function enableButton(name, condition) {
    $('#'+name).attr({disabled: !condition});
} // enableButton

function showVFS() {
    var e = $('#vfs').empty();
    socket.emit('vfs.get', { uri:'/' }, function(data){
        log(data);
        // make a one-item list, for the root
        e = $('<ul>').appendTo(e);
        e = addItem(e, data);
        // children
        e = $('<ul>').appendTo(e);
        data.children.forEach(function(it){
            addItem(e, it);            
        });
    });    
} // showVFS

function addItem(under, item) { 
    return $('<li>').data({item:item}).appendTo(under).text(item.name);
} // addItem
