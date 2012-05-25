var fs = require('fs');
var cp = require('child_process');
var path = require('path');
var misc = require('./misc');

var fn = process.argv[2];
var child;
const MAX_RETRY = 999;
var startTime;

function l(s) {
    console.log('reloader::: '+s);
    return s;
}

function hr() {
    l('----------------------------------------------------------------');
}

// time elapsed since program started, in seconds
function elapsed() { return (new Date() - startTime)/1000; } 

function terminate() {
    if (!child) return;
    child.kill();
    child = null;
} // terminate

function reload() {
    terminate();
    startTime = new Date();
    child = cp.execFile('node', [fn], function(error, stdout, stderr){
        if (!error || error.killed) return;
        l(error);
        reload.retry = 1+reload.retry || 1;
        if (reload.retry == MAX_RETRY || elapsed() < 1) {
            l('giving up');
            process.exit(1);
        }
        l('restarting #'+reload.retry);
        hr();
        reload();
    });
    if (!child) {
        l('cannot run');
        process.exit(1);
        return;
    }
    child.stdout.pipe(process.stdout);
}//reload

if (!path.existsSync(fn)
&& path.existsSync(fn+'.js')) // accept files specified without the extension
    fn += '.js';

reload();
var matching = /\.js$/i; // create once...
fs.watch(path.dirname(fn), misc.delayedCall(300, function(evt, file){
    if (evt != 'change'
    || !file.match(matching) // ...use many
    || file == 'reloader.js') return;   
    l(file+' changed. Reloading...');
    hr();
    reload.retry = 0;
    reload();        
}));

process.on( "uncaughtException", function(err) {
    l(err);
    terminate();
    process.exit();
});
