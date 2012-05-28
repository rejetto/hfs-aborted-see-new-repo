require('./common');

exports.Vfs = Vfs = function(){
    this.root = new FileNode(NK.FIXED);
    this.root.name = '/';
}; // Vfs

Vfs.prototype.fromUrl = function(url, cb) {
    assert(cb, 'no cb');
    assert( typeof url == 'string', 'url');
    var separator = 0;
    var run = this.root;
    while (separator < url.length-1) {
        var from = separator+1;
        var nextSep = url.indexOf('/', from);
        if (nextSep < 0) {
            nextSep = url.length;
        }
        var piece = url.substring(from, nextSep);
        if (piece && !run.isFolder() // something has left but we cannot go deeper
        || run.hasDeleted(piece)) { 
            cb(false);
            return this;
        }
        var child = run.getChildByName(piece);
        if (!child && run.isOnDisk()) { // if not in the VFS tree, try to fill the gap with the disk
            run.createFileNodeFromRelativeUri(url.substring(from), function(newNode){
                cb(newNode || false);
            });
            return this;
        }
        if (!child) { // we did our best
            cb(false);
            return this;
        }
        run = child; 
        separator = nextSep;
    }
    cb(run);
    return this;
}; // fromUrl


exports.FileNode = FileNode = function(nodeKind/*, name*/) {
    this.nodeKind = nodeKind;
    this.itemKind = FK.VIRTUAL_FOLDER;
    this.set(arguments[1] || '');
    //this.children = []; // as a list. An object with fast access by name would be nice, but it would not work for case-sensitive OSs  
    this.deleted = [];
    this.permissions = {};
}; // FileNode

NK = FileNode.NODE_KIND = Enum('FIXED TEMP SEMITEMP MOD');
FK = FileNode.FILE_KIND = Enum('FILE FOLDER VIRTUAL_FILE VIRTUAL_FOLDER LINK');

FileNode.prototype.__defineSetter__('name', function(v){
    this.customName = (v == this.getExpectedName()) ? null : v;
});
FileNode.prototype.__defineGetter__('name', function(){
    return this.customName || this.getExpectedName();
});

FileNode.prototype.getExpectedName = function() {
    return !this.isUnit() ? path.basename(this.resource) : this.resource; 
};

FileNode.prototype.isRoot = function() { return !this.parent };
FileNode.prototype.isFolder = function() { return this.itemKind.isIn(FK.FOLDER, FK.VIRTUAL_FOLDER) };
FileNode.prototype.isFile = function() { return this.itemKind.isIn(FK.FILE, FK.VIRTUAL_FILE) };
FileNode.prototype.isLink = function() { return this.itemKind == FK.LINK };
FileNode.prototype.isOnDisk = function() { return this.itemKind.isIn(FK.FILE, FK.FOLDER) };
FileNode.prototype.isVirtual = function() { return this.itemKind.isIn(FK.VIRTUAL_FILE, FK.VIRTUAL_FOLDER) };

FileNode.prototype.toString = function() { return "FileNode({name})".format(this) };

FileNode.prototype.isUnit = function() {
    return misc.isWindows()
        && this.resource
        && this.resource.length == 2
        && this.resource[1] == ':';
};

FileNode.prototype.setPath = function(what, cb/*optional*/) {
    this.resource = path.normalize(what);
    this.stats = null; // 'null' stands for non-calculated
    this.itemKind = null; // we don't know yet
    var x = this;
    fs.stat(this.resource, function onStat(err,stats){
        x.stats = err ? false : stats; // 'false' stands for 'error'
        x.itemKind = (!err && stats.isDirectory()) ? FK.FOLDER : FK.FILE;
        if (cb) cb(x);
    });

    return this;
}; // setPath

FileNode.prototype.set = function(what, cb/*optional*/) {
    if (what.match(/[\\\/]/)) { // we know it's a path because of the slashes
        this.setPath(what, cb);
    }
    else {
        this.name = what;
        this.resource = null;
        this.itemKind = FK.VIRTUAL_FOLDER; 
        if (cb) cb(this);
    }
    return this;
}; // set

FileNode.prototype.add = function(what, cb/*optional*/) {
    // create child
    var fn = new FileNode(NK.FIXED);
    // link back and forth
    if (!this.children) this.children = []; 
    this.children.push(fn);
    fn.parent = this;
    // init
    var x = this;
    fn.set(what, function onSet(){
        if (cb) cb(fn);                
    });
    
    return this;    
}; // add

FileNode.prototype.getChildByName = function(name) {
    if (!this.children) return false;
    for (var i=0, a=this.children, l=a.length; i<l; ++i) {
        var v = a[i];
        if (name.same(v.name)) {
            return v;
        }
    }
    return false;
}; // getChildByName

// return children as an array. This is not only to ensure it's a copy (to protect the real property) but also to hide the detail that children is an array (in case this changes in the future)
FileNode.prototype.getChildren = function() { 
    var a = this.children;
    return a ? a.slice() : [];
}; // getChildren

// compares filenames accordingly to the operating system's case policy
FileNode.prototype.testName = function(name) {
    return misc.isWindows() ? name.same(this.name) : name == this.name;
}; // testName

FileNode.prototype.hasDeleted = function(name) {
    for (var i=0, a=this.deleted, l=a.length; i<l; ++i) {
        if (this.name.same(a[i].name)) {
            return true;
        }
    }
    return false;
}; // testName

FileNode.prototype.createFileNodeFromRelativeUri = function(uri, cb) {
    warning(cb, 'no cb');
    var p = path.join(this.resource, decodeURI(uri).excludeTrailing('/'));
    path.exists(p, function(yes){
        if (yes) {
            var fn = new FileNode(NK.TEMP);
            fn.set(p, cb.bind(fn));
            return;
        }
        cb(null);
    });

    return this;
}; // createFileNodeFromRelativeUri
 
// used for serialization
FileNode.prototype.toJSON = function(){
    var o = misc.clone(this);
    delete o.parent; // avoid circular reference
    o.name = this.name;
    if (this.children) { 
        // children will be replaced by an array of names  
        var names = [];
        for (var i=0, a=this.children, l=a.length; i<l; ++i) { // must work on this.children and not on o.children, that's not cloned correctly
            names.push(a[i].name);
        }
        o.children = names;            
    }
    return o;
}; // toJSON


FileNode.prototype.dir = function(cb) {
    var _this = this; // used inside some callbacks that override this
    var directoryLoaded = arguments[1]; // used internally
    if (!directoryLoaded) {
        if (this.isOnDisk()) { // for real folders we must first load files
            fs.readdir(this.resource, function onReaddir(err, files) { // read them
                assert(!err, 'err'); // ** handle it!
                _this.dir(cb, files); // restart
            });
            return; // recurring, break this flow
        }
        directoryLoaded = []; // this is a virtual this, so there is no directory to load from disk
    }


    // create FileNodes for every file found in the directory
    var toNode = function(filename,cb){ _this.createFileNodeFromRelativeUri(filename, cb.bind(this,null)) }; // our createFileNodeFromRelativeUri doesn't comply to the standard "cb(err,result)" form, so we need to encapsulate it 
    async.map(directoryLoaded, toNode, function(err, fnodes){
        // collect all items in an object to avoid duplicates
        var items = {};
        // first the items from the disk
        for (var i=0, a=directoryLoaded, l=a.length; i<l; ++i) {
            var fn = fnodes[i];
            if (fn) {
                items[a[i]] = fn;
            }
        }
        // then items from the VFS, so they eventually overwrite
        if (_this.children) {
            _this.children.forEach(function(e){
                items[e.name] = e;
            });
        }
        // now collect more data about items (through fs.stat)
        async.forEach(items.getProperties(), function(it,cb) { 
            if (!it.isOnDisk()) return; // no need
            fs.stat(it.resource, function onStat(err,stats){
                if (err) { // if we can't stat() it ...
                    delete items[it.name]; // ... we don't want it
                }
                else {
                    it.stats = stats; // bind the data
                    it.itemKind = stats.isDirectory() ? FK.FOLDER : FK.FILE; // determine item's nature
                }
                cb(); // notify async
            });//stat
        }, cb.bind(this, items)); // finally returns (asynchronously)
    });
} // dir
