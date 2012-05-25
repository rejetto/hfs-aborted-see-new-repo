assert(TPL, 'tpl');

TPL.item = 
    "<a href='{url}' class='item-link'><img src='/~/icons/files/{icon}.png' /><span class='item-label'>{label}</span></a>"
    +"<div class='item-details'><div class='item-details-wrapper'>"
        +"<div class='item-type'>{type}</div>"
        +"<div class='item-size'>{size}</div>"
    +"</div></div>";
    
TPL.list_onObjectItem = function(item) {
    item.size = item.size ? formatBytes(item.size)+'B' : 'folder';
};

TPL.tiles_onObjectItem = function(item) {
    item.type = 'Type: '+item.type;
    item.size = item.size ? 'Size: '+formatBytes(item.size)+'B' : '';
};
