var types = exports.types = {
    'jpg,jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'png': 'image/png',
    'css': 'text/css',
    'js' : 'text/javascript',
    'avi': 'video/avi',
    'html': 'text/html', 
};

exports.fromFile = function(file){
    var ext = path.extname(file).substr(1).low();
    for (var w in types) {
        if (w.split(',').indexOf(ext) >= 0) {
            return types[w];
        }
    }
    return false;
}; // fromFile
