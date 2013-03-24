/**
 * @author Massimo Melina <a@rejetto.com> 
 */ 
require('./libs');

exports.Vfs = Vfs = function(){
    this.root = new FileNode(NK.FIXED);
    this.root.name = '/';
}; // Vfs

Vfs.prototype.fromUrl = function(url, cb) {
    assert(cb, 'no cb');
    assert( typeof url === 'string', 'url');
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
            var relativePath = decodeURI(url.substring(from)).excludeTrailing('/');
            run.createChildRelatively(relativePath, function(err, newNode){
                cb(err ? false : newNode);
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

exports.FileNode = FileNode = function(nodeKind, name, more/*optional|object*/, cb/*optional|function(err,filenode)*/) {
    if (more instanceof Function) cb=more, more=undefined;
    this.nodeKind = nodeKind;
    this.itemKind = FK.VIRTUAL_FOLDER;
    //this.children = []; // as an array. An object with fast by-name access would be nice, but it would not work for case-insensitive OSs
    this.deletedItems = [];
    this.permissions = {};
    this.set( name||'', cb );
    if (more) for (var k in more) {
        this[k] = more[k];
    }
}; // FileNode

/* Node kinds
    FIXED: is a node manually entered in the tree.
    MOD: it was a TEMP or SEMITEMP node, then modified some way (name, permissions, etc).  
    SEMITEMP: it's a folder between 2 non-temp nodes. It's just storing the file structure between these two.          
    TEMP: a node created on the fly, from the disk, for occasional usage. 
*/
NK = FileNode.NODE_KIND = Enum('FIXED TEMP SEMITEMP MOD');
FK = FileNode.FILE_KIND = Enum('FILE FOLDER VIRTUAL_FILE VIRTUAL_FOLDER LINK');

FileNode.prototype.__defineSetter__('name', function(v){
    this.customName = (v === this.getExpectedName()) ? null : v;
    this.reconsiderNodeKind(); 
});
FileNode.prototype.__defineGetter__('name', function(){
    return this.customName || this.getExpectedName();
});

FileNode.prototype.__defineSetter__('parent', function(v){
    var p = this._parent;
    if (p && p.children) {
        var idx = p.children.indexOf(this);
        p.children.splice(idx, idx+1); // unbind from old parent
    }
    this._parent = v; // bind this way    
    if (!v || this.isTemp()) return; // TEMP are linked one-way 
    if (!v.children) v.children = [];
    v.children.push(this); // bind other way 
});
FileNode.prototype.__defineGetter__('parent', function(){
    return this._parent;
});

FileNode.extend('getExpectedName', function(){
    return this.isUnit() ? this.resource
        : path.basename(this.resource); 
});

FileNode.extend('resourceAncestorOf', function(child){
    return isPathAndSubpath(this.resource, child.resource);
});

function isPathAndSubpath(path_, sub) {
    path_ = path.resolve(path_); 
    sub = path.resolve(sub); 
    return misc.sameFileName(path_, sub.substr(0, path_.length));
} // isPathAndSubpath

// be careful, because if the folder is a temp node, any change will actually be lost, unless you reconsiderNodeKind() 
FileNode.prototype.getFolder = function(cb){
    var p = this.parent;
    var parentTreeIsNotParentFolder = false;
    if (this.isTemp()) {
        var rel = this.resourceOnlyRelativeTo(p);
        parentTreeIsNotParentFolder = rel && isPath(rel);  
    }  
    if (parentTreeIsNotParentFolder) {
        return new FileNode(NK.TEMP, path.dirname(this.resource), {parent:p}, cb); // we must create a temp node
    }     
    if (cb) cb(p);
    return p;
};

/** calculates the path relative to other, but only if other is an ancestor 
 * @param {FileNode}
 * @return {string} relative path
 */
FileNode.prototype.resourceOnlyRelativeTo = function(other){
    return other.resourceAncestorOf(this)
        ? this.resource.substr(other.resource.length+1)
        : false;  
}; // resourceOnlyRelativeTo

/** calculates the path relative to other, or return the absolute path if they are not related 
 * @param {FileNode}
 * @return {string} path, possibly relative
 */
FileNode.prototype.resourceRelativeTo = function(other){ 
    return this.resourceOnlyRelativeTo(other) || this.resource
}; // resourceRelativeTo

FileNode.prototype.isRoot = function() { return !this.parent };
FileNode.prototype.isFolder = function() { return this.itemKind._among(FK.FOLDER, FK.VIRTUAL_FOLDER) };
FileNode.prototype.isFile = function() { return this.itemKind._among(FK.FILE, FK.VIRTUAL_FILE) };
FileNode.prototype.isLink = function() { return this.itemKind === FK.LINK };
FileNode.prototype.isOnDisk = function() { return this.itemKind._among(FK.FILE, FK.FOLDER) };
FileNode.prototype.isVirtual = function() { return this.itemKind._among(FK.VIRTUAL_FILE, FK.VIRTUAL_FOLDER) };
FileNode.prototype.isTemp = function() { return this.nodeKind === NK.TEMP };

FileNode.prototype.toString = function() { return "FileNode({name})".format(this) };

FileNode.prototype.isUnit = function() {
    return misc.isWindows
        && this.resource
        && this.resource.length === 2
        && this.resource[1] === ':';
};

FileNode.prototype.setPath = function(what, cb/*optional|function(error,filenode)*/) {
    what = path.normalize(what);
    var x = this;
    fs.stat(what, function onStat(err,stats){
        if (err) {
            return call(cb, err);
        }
        x.resource = what;
        x.stats = stats;
        x.itemKind = stats.isDirectory() ? FK.FOLDER : stats.isFile() ? FK.FILE : null;
        call(cb, null, x);
    });

    return this;
}; // setPath

function isPath(s) { return s.match(/[\\\/]/) } // we know it's a path because of the slashes

FileNode.prototype.set = function(what, cb/*optional|function(error,filenode)*/) {
    if (isPath(what)) {
        this.setPath(what, cb);
    }
    else {
        this.name = what;
        this.resource = null;
        this.itemKind = FK.VIRTUAL_FOLDER; 
        call(cb, null, this);
    }
    return this;
}; // set

FileNode.prototype.add = function(what, cb/*optional*/) {
    var restored = isPath(what)
        && this.deletedItems
        && this.deletedItems.length
        && isPathAndSubpath(this.resource, what)
        && this.restoreDeleted(path.basename(what));
    new FileNode(restored ? NK.TEMP : NK.FIXED, what, {parent:this}, cb); // create child
    return this;    
}; // add

// return child as it is in the tree. Temp items will not be created. 
FileNode.prototype.getChildByName = function(name) {
    if (!this.children) return false;
    for (var i=0, a=this.children, l=a.length; i<l; ++i) {
        var v = a[i];
        if (v.testName(name)) {
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
    if (name instanceof FileNode) {
        name = name.name;
    }
    assert(typeof name === 'string', 'bad name');
    return misc.sameFileName(name, this.name);
}; // testName

FileNode.prototype.idxDeleted = function(name) {
    if (!this.deletedItems) return false;
    name = name.excludeTrailing('/');
    for (var i=0, a=this.deletedItems, l=a.length; i<l; ++i) {
        if (misc.sameFileName(name, a[i].excludeTrailing('/'))) {
            return i;
        }
    }
    return false;
}; // idxDeleted

FileNode.prototype.hasDeleted = function(name) { 
    return this.idxDeleted(name) !== false;
}; // hasDeleted

FileNode.prototype.restoreDeleted = function(name) {
    var i = this.idxDeleted(name);
    if (i === false) {
        return false;
    }
    this.deletedItems.splice(i,1); // remove from the array
    return true;
}; // restoreDeleted

FileNode.prototype.createChildRelatively = function(path_, kind, cb) {
    if (kind instanceof Function) cb=kind, kind=undefined;
    return this.createChild(path.join(this.resource, path_), kind, cb);
}; // createChildRelatively

FileNode.prototype.createChild = function(path_, kind, cb) {
    if (kind instanceof Function) cb=kind, kind=undefined;
    assert(cb, 'cb');
    var This = this;
    new FileNode(kind||NK.TEMP, path_, {parent:This}, cb);
    return this;
}; // createChild
 
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
    var This = this;
    var directoryLoaded = arguments[1]; // used internally
    if (!directoryLoaded) {
        if (this.isOnDisk()) { // for real folders we must first load files
            fs.realpath(this.resource, function onRealpath(err, resolvedPath){
                if (err) throw err;
                fs.readdir(resolvedPath, function onReadDir(err, files) { // read them
                    if (err) throw err;
                    This.dir(cb, files); // restart, by recurring
                });
            });
            return; // recurring, break this flow, we'll continue asynchronously
        }
        directoryLoaded = []; // this is a virtual this, so there is no directory to load from disk
    }

    // create FileNodes for every file found in the directory, except the deleted ones
    var toNode = function(filename, cb){
        This.hasDeleted(filename)
            ? cb(null,false) // don't create a filenode, so this file will be skipped
            : This.createChildRelatively(filename, cb); // the just-created filenode is appended as parameter to the cb's calling
    };  
    async.map(directoryLoaded, toNode, function(err, fnodes){
        // collect all items in an object to avoid duplicates (by using filename as key)
        var fname2idx = {};
        for (var a=fnodes, i=a.length; i--;) {
            var v = a[i];
            if (v) fname2idx[v.name] = i;
        }
        // then add items from the VFS, eventually overwriting
        if (This.children) {
            This.children.forEach(function(e){
                if (e.nodeKind._among(NK.TEMP, NK.SEMITEMP)) return; // ignore these
                var idx = fname2idx[e.name]; // search an element with same name...
                fnodes[idx || fnodes.length] = e; // and overwrite, or add
            });
        }

        // remove files that didn't work for some reason. As possible optimization, use empty places to put the VFS items instead of enlarging $fnodes
        fnodes = fnodes.filter(L('A'));

        cb(fnodes); // finally returns (asynchronously)
    });
}; // dir

FileNode.prototype.reconsiderNodeKind = function() {
    var anyMod = this.resource && (this.customName || this.permissions || this.deletedItems); // is this node storing any modification
    
    switch (this.nodeKind) {
        case NK.FIXED:
            return; // we'll never change this
        case NK.MOD:
            if (anyMod) return; // no change needed
            // we should not be MOD anymore. We must be SEMITEMP if any child is non-temp, otherwise TEMP.
            anyNonTemp = false;
            for (var i=0, a=this.children, l=a.length; i<l; ++i) {
                if (anyNonTemp = (!a[i].isTemp())) break;
            }
            if (anyNonTemp) {
                this.nodeKind = NK.SEMITEMP;
                return;
            }        
            this.nodeKind = NK.TEMP;
            // becoming TEMP, we must remove the reference hold by the parent
            var v = this.parent;
            if (!v) return;
            v = v.children;
            var i = v && v.indexOf(this);
            assert(v && i>=0, 'mod-nodes should be always linked to their parents');
            v.splice(i, 1);
            this.parent.reconsiderNodeKind();
            return;
        case NK.TEMP:
        case NK.SEMITEMP:
            if (!anyMod) return;   
            this.nodeKind = NK.MOD; // we got some mods, so this is now a MOD
            // create a filenode for each subfolder between "this" and its parent 
            var p = this.parent; 
            assert(p, 'parent');
            var v = this.resourceRelativeTo(p); // path relative to the parent
            v = v.split(/[\\/]/); // to pieces
            v.pop(); // take out last piece, already incarnated by "this"
            v.forEach(function(v) {
                p = new FileNode(NK.SEMITEMP, v, {parent:p}); // make a new node, and link it to the last one
            });
            this.parent = p; // now link to the last node
            if (p.isTemp()) {
                p.nodeKind = NK.SEMITEMP;
            }
            return;
        default:
            assert(0, 'bad nodeKind');             
    }    
}; // reconsiderNodeKind

FileNode.prototype.getURI = function(trailingSlashForFolders) {
    if (this.isRoot()) return '/';
    return this.parent.getURI()
        + encodeURI(this.name)
        + (this.isFolder() ? '/' : '');
}; // getURI 

FileNode.prototype.delete = function(cb){
    switch (this.nodeKind) {
        case NK.TEMP:
            var _this = this;
            this.getFolder(function(fldr){
                assert(fldr, 'root?');                
                if (!fldr.hasDeleted(_this.resource)) { // don't do it twice                  
                    fldr.deletedItems.push(
                        path.basename(_this.resource) + (_this.isFolder() ? '/' : '')
                    );
                    fldr.reconsiderNodeKind();
                }
                cb(fldr);
            });
            break;
        case NK.MOD:
        case NK.FIXED:
            var folder = this.parent;
            this.parent = null;
            cb(folder);
            break;
        default:
            assert(0, 'bad nodeKind');             
    }
}; // delete
