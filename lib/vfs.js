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

Vfs.prototype.writeTo = function(stream) {
    if (typeof stream == 'string') {
        stream = fs.createWriteStream(stream);
        var created = true;
    }
    /*// make a writable version
    var tw = this.root._clone();
    (function recur(n){
        delete n.stats;
        if (n.children) n.children.forEach(recur);
    })(tw);*/

    stream.write(yaml.dump(this.root));

    if (created) {
        stream.close();
    }
}; // writeTo

Vfs.prototype.readFrom = function(stream) {
    this.root = yaml.load(fs.readFileSync(stream));
}; // readFrom

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
    // bind this way
    this._setHidden('_parent', v);

    if (!v || this.isTemp()) return; // TEMP is linked one-way
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
    path_ = path_ && path.resolve(path_);
    sub = sub && path.resolve(sub);
    return path_ && sub && sameFileName(path_, sub.substr(0, path_.length));
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
    return other && other.resourceAncestorOf && other.resourceAncestorOf(this)
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
    return isWindows
        && this.resource
        && this.resource.length === 2
        && this.resource[1] === ':';
};

FileNode.prototype.setPath = function(what, cb/*optional|function(error,filenode)*/) {
    what = path.normalize(what);
    var x = this; // closure
    fs.stat(what, function onStat(err,stats){
        if (err) {
            return call(cb, err);
        }
        x.resource = what;
        x._setHidden('stats', stats);
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
    return sameFileName(name, this.name);
}; // testName

FileNode.prototype.idxDeleted = function(name) {
    if (!this.deletedItems) return false;
    name = name.excludeTrailing('/');
    for (var i=0, a=this.deletedItems, l=a.length; i<l; ++i) {
        if (sameFileName(name, a[i].excludeTrailing('/'))) {
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
    var o = this._clone();
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


FileNode.prototype.dir = function(cb/*filenodes,bads*/) {
    var This = this;
    var fnodes=[], bads=[];

    if (!this.isOnDisk()) return addVirtuals(); // virtual folder, nothing to load, skip to next phase

    fs.realpath(this.resource, onRealpath);
    function onRealpath(err, resolvedPath){
        if (err) throw err;
        fs.readdir(resolvedPath, onReadDir);
    }
    function onReadDir(err, files) { // read them
        if (err) throw err;

        async.map(files, toNode, function(err, nodes){
            if (err) throw err;
            // remove hidden files
            nodes.removeItems(L('!A'));
            // remove files that didn't work for some reason
            bads = nodes.removeItems(L('typeof A==="string"'), true);

            fnodes = nodes;
            addVirtuals();
        });

        // create FileNodes for every file found in the directory, except the deleted ones
        function toNode(filename, cb){
            This.hasDeleted(filename)
                ? cb(null,false) // don't create a filenode, so this file will be skipped
                : This.createChildRelatively(filename, function(err,res){
                cb(null,err?filename:res) // async.map stops working at first error. We want it all instead, so we move the error inside the result. More: we keep track of the bad filenames.
            });
        }
    }

    function addVirtuals(){
        if (!This.children) return Return();
        // to avoid other entries with same name, build an object to find them quickly
        var fname2idx = fnodes.toObject('[normalizeFileName(A.name), B]');
        // then add items from the VFS, if any, overwriting if necessary
        This.children.forEach(function(vnode){ // virtual node
            if (vnode.nodeKind._among(NK.TEMP, NK.SEMITEMP)) return; // ignore these
            if (vnode.nodeKind === NK.FIXED) {
                var idx = fname2idx[normalizeFileName(vnode.name)]; // collision?
                if (idx===undefined) idx = fnodes.length; // nope, then queue
                else vnode.overlapping = true; // fine, but note it
                fnodes[idx] = vnode; // put
                return;
            }
            // only MOD kind has left to be handled
            assert(vnode.nodeKind === NK.MOD, 'illegal');
            // currently a MOD is always a rename.
            var was = normalizeFileName(vnode.getExpectedName());
            var now = normalizeFileName(vnode.name);
            var fnode = fnodes[fname2idx[was]];
            var i = fname2idx[now]; // Renaming could overlap an existing file
            if (i !== undefined) { // overlapping?
                fnodes[i] = null; // remove overlapped one (mark now, purge later)
                fnode.overlapping = true;
            }
            fnode.name = vnode.name; // apply the MOD
            fname2idx._rename(now, was); // update index
        });
        fnodes.removeItems(L('!A'));
        Return();
    }

    function Return() { cb(fnodes, bads) }
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
