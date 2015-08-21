/**
 * @author Massimo Melina <a@rejetto.com> 
 */ 
require('./libs');

exports.Vfs = Vfs = function(){
    this.reset();
}; // Vfs

Vfs.prototype.reset = function() {
    this.root = new FileNode(NK.FIXED);
    this.root.name = '/';
};//reset

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
        if (piece && !run.isFolder()) { // something is left but we cannot go deeper
            cb(false);
            return this;
        }
        var child = run.getChildByName(piece);
        if (!child) {
            if (!run.isOnDisk()
            || run.hasDeleted(piece))
                cb(false);
            else { // if not in the VFS tree, try to fill the gap with the disk
                var relativePath = decodeURI(url.substring(from)).excludeTrailing('/');
                run.createChildRelatively(relativePath, function(err, newNode){
                    cb(err ? false : newNode);
                });
            }
            return this;
        }
        run = child;
        separator = nextSep;
    }
    cb(run);
    return this;
}; // fromUrl

function prepareForStreaming(fnode) {
    var n = fnode._clone();
    delete n.stats;
    if (!n.resource)
        delete n.resource;
    if (isEmpty(n.deletedItems))
        delete n.deletedItems;
    if (n.children)
        n.children = n.children.map(prepareForStreaming);
    return n;
}//prepareForStreaming

Vfs.prototype.writeTo = function(stream) {
    if (typeof stream == 'string') {
        stream = fs.createWriteStream(stream);
        var created = true;
    }
    var n = prepareForStreaming(this.root);
    n._remove('nodeKind,customName');
    stream.write(yaml.dump(n));

    if (created) {
        stream.close();
    }
}; // writeTo

Vfs.prototype.toString = function(){
    return yaml.dump(prepareForStreaming(this.root));
};//toString

Vfs.prototype.fromString = function(ydata, cb) {
    if (!ydata)
        return cb('no data');
    var v = yaml.load(ydata);
    if (!v)
        return cb('malformed');
    // from simple object to FileNodes
    assert(v.customName==='/', 'root expected');
    delete v.customName;
    var ret = this.root = (function recur(n, cb){
        return new FileNode(n.nodeKind, n.resource||n.customName, n._clone('deletedItems,customName')._remapKeys({ customName:'name' }), function(err,res){
            if (err) return cb(n);

            async.each(n.children||[], function(c,doneThis){
                recur(c, doneThis).parent = res;
            }, function(err){
                cb(err, ret);
            });
        });
    })(v, cb||idFun);
    ret.name = '/'; // restore special name
}; // fromString

exports.FileNode = FileNode = function(nodeKind, name, more/*optional|object*/, cb/*optional|function(err,filenode)*/) {
    if (more instanceof Function) cb=more, more=undefined;
    this.nodeKind = nodeKind;
    this.itemKind = FK.FOLDER;
    //this.children = []; // as an array. An object with fast by-name access would be nice, but it would not work for case-insensitive OSs
    this.deletedItems = [];
    this.set( name||'', function(err){
        if (!err && more) {
            for (var k in more) {
                this[k] = more[k];
            }
        }
        cb && cb.call(this,err,this);
    });
}; // FileNode

/* Node kinds
    FIXED: is a node manually entered in the tree.
    MOD: it was a TEMP or SEMITEMP node, then modified some way (name, permissions, etc).  
    SEMITEMP: it's a folder between 2 non-temp nodes. It's just storing the file structure between these two.          
    TEMP: a node created on the fly, from the disk, for occasional usage. 
*/
NK = FileNode.NODE_KIND = Enum('FIXED TEMP SEMITEMP MOD');
FK = FileNode.FILE_KIND = Enum('FILE FOLDER LINK');

FileNode.prototype.__defineSetter__('name', function(v){
    this.customName = (v === this.getExpectedName()) ? null : v;
    this.reconsiderNodeKind(); 
});
FileNode.prototype.__defineGetter__('name', function(){
    return this.customName || this.getExpectedName();
});

FileNode.prototype.__defineSetter__('parent', function(newP){
    // unbind from old parent, if any
    try {
        this._parent.children.removeItems(this);
        this._parent.reconsiderNodeKind();
    }
    catch(e) {}
    // bind this way
    this._setHidden('_parent', newP);

    if (!newP || this.isTemp()) return; // TEMP is linked one-way
    if (!newP.children) newP.children = [];
    newP.children.push(this); // bind other way
    if (newP.isTemp())
        newP.reconsiderNodeKind();
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
    if (cb) cb(null, p);
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
FileNode.prototype.isFolder = function() { return this.itemKind===FK.FOLDER };
FileNode.prototype.isFile = function() { return this.itemKind===FK.FILE };
FileNode.prototype.isLink = function() { return this.itemKind === FK.LINK };
FileNode.prototype.isOnDisk = function() { return this.resource && this.itemKind !== FK.LINK };
FileNode.prototype.isTemp = function() { return this.nodeKind === NK.TEMP };
FileNode.prototype.isFixed = function() { return this.nodeKind === NK.FIXED };

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
            return cb && cb.call(x, err);
        }
        x.resource = /^(.+?)[\\\/]*$/.exec(what)[1]; // exclude trailing terminator
        x._setHidden('stats', stats);
        x.itemKind = stats.isDirectory() ? FK.FOLDER : stats.isFile() ? FK.FILE : null;
        cb && cb.call(x,null,x);
    });

    return this;
}; // setPath

function isPath(s) { return !!s.match(/[\\\/]/) } // we know it's a path because of the slashes

FileNode.prototype.set = function(what, cb/*optional|function(error,filenode)*/) {
    if (isPath(what)) {
        this.setPath(what, cb);
    }
    else {
        this.name = what;
        this.resource = null;
        this.itemKind = FK.FOLDER;
        cb && cb.call(this,null,this);
    }
    return this;
}; // set

FileNode.prototype.add = function(what, cb/*optional*/) {
    var restored = isString(what) && isPath(what)
        && !isEmpty(this.deletedItems)
        && isPathAndSubpath(this.resource, what)
        && this.restoreDeleted(path.basename(what));
    if (what instanceof FileNode) {
        what.parent = this;
        cb(null,what);
    }
    else {
        new FileNode(restored ? NK.TEMP : NK.FIXED, what, {parent:this}, cb); // create child
    }
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
    if (isEmpty(this.deletedItems)) return false;
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
    var fnodes={}, bads=[];

    if (!this.isOnDisk())
        return addVirtuals(); // nothing to load, skip to next phase

    fs.realpath(this.resource, function onRealpath(err, resolvedPath){
        if (err) throw err;
        fs.readdir(resolvedPath, onReadDir);
    });

    function onReadDir(err, files) { // read them
        if (err) throw err;

        async.map(files, toNode, function(err, nodes) {
            if (err) throw err;
            // remove hidden files
            nodes.removeItems(L('!A'));
            // remove files that didn't work for some reason
            bads = nodes.removeItems(L('typeof A==="string"'), true);

            fnodes = nodes.toObject('normalizeFileName(A.name)'); // with an object we find the files quickly and avoid duplicated names
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
        // then add items from the VFS, if any, overwriting if necessary
        This.children.forEach(function(node){
            if (node.nodeKind._among(NK.TEMP, NK.SEMITEMP)) return; // ignore these
            if (node.nodeKind === NK.FIXED)
                return node.checkOverlapping(fnodes);
            // only MOD kind has left to be handled
            assert(node.nodeKind === NK.MOD, 'illegal');
            // currently a MOD is always a rename.
            var was = normalizeFileName(node.getExpectedName());
            var f = fnodes[was];
            if (!f) return; // we have lost the one to rename. Nothing to do.
            node.stats = f.stats; // keep the fresher one
            node.checkOverlapping(fnodes);
            delete fnodes[was];
        });
        Return();
    }

    function Return() { cb(fnodes, bads) }
}; // dir

FileNode.prototype.checkOverlapping = function(siblings/*optional*/, cb) {
    var self = this;
    if (isFunction(siblings))
        cb=siblings, siblings=0;

    if (!siblings && this.nodeKind._among(NK.MOD,NK.FIXED) && this.parent.isOnDisk())
        return fs.exists(this.parent.resource.includeTrailing('/')+this.name, function(exists){
            this.overlapping = exists;
            cb && cb();
        });
    if (siblings) {
        var k = normalizeFileName(self.name);
        self.overlapping = k in siblings;
        siblings[k] = self;
    }
    cb && cb();
};//checkOverlapping


FileNode.prototype.reconsiderNodeKind = function() {
    var self = this;
    switch (this.nodeKind) {
        case NK.FIXED:
            return; // we'll never change this
        case NK.MOD:
            if (anyMod()) return; // no change needed
            // we should not be MOD anymore. We must be SEMITEMP if any child is non-temp, otherwise TEMP.
            if ((v=this.children) && v.some('!A.isTemp()'))
                this.nodeKind = NK.SEMITEMP;
            else
                turnIntoTemp();
            return;
        case NK.TEMP:
        case NK.SEMITEMP:
            if (anyMod())
                this.nodeKind = NK.MOD; // we got some mods, so this is now a MOD
            else if (this.isTemp())
                if (!isEmpty(this.children))
                    this.nodeKind = NK.SEMITEMP;
                else
                    return;
            else if (isEmpty(this.children))
                turnIntoTemp();
            else
                return;
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

    // is this node storing any modification
    function anyMod(){
        return self.resource && (
            self.customName || !isEmpty(self.permissions) || !isEmpty(self.deletedItems)
        );
    }

    function turnIntoTemp(){
        self.nodeKind = NK.TEMP;
        // becoming TEMP, we must remove the reference hold by the parent
        self.parent.children.removeItems(this);
        self.parent.reconsiderNodeKind();
    }

}; // reconsiderNodeKind

FileNode.prototype.getURI = function(noTrailingSlashForFolders) {
    if (this.isRoot()) return '/';
    return this.parent.getURI()
        + encodeURI(this.name)
        + (!noTrailingSlashForFolders && this.isFolder() ? '/' : '');
}; // getURI

FileNode.prototype.delete = function(cb){
    switch (this.nodeKind) {
        case NK.MOD:
        case NK.TEMP:
            var thiS = this;
            this.getFolder(function(err,fldr){
                assert(fldr, 'root?');
                var fn = thiS.getExpectedName();
                if (!fldr.deletedItems) fldr.deletedItems = [];
                if (!fldr.hasDeleted(fn)) { // don't do it twice
                    fldr.deletedItems.push( fn + (thiS.isFolder() ? '/' : '') );
                    fldr.reconsiderNodeKind();
                }
                if (thiS.nodeKind===NK.MOD)
                    thiS.parent = null;
                cb(fldr);
            });
            break;
        case NK.FIXED:
            var folder = this.parent;
            this.parent = null;
            cb(folder);
            break;
        default:
            assert(0, 'bad nodeKind');             
    }
}; // delete
