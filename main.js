/**
 * @author Massimo Melina <a@rejetto.com> 
 */ 
require('./lib/common');
//debug();

GLOBAL.vfs = new vfsLib.Vfs();
vfs.root.set('C:\\vedere').add('c:\\data\\pics\\fantasy');
vfs.root.add('2', function(node){ node.add('3') });
//vfs.root.set('C:\\temp');
//vfs.root.set('C:\\windows\\system32'); // used to test many files (2k+)

GLOBAL.fileServer = require('./file-server');
var listenOn = {port:8, ip:'0.0.0.0'};
fileServer.start(listenOn);

GLOBAL.adminServer = require('./admin-server');
var adminOn = {port:88, ip:'127.0.0.1'};
adminServer.start(adminOn);

// still trying
function debug(){
    require('net').createServer(function(sock){
        require('repl').start({
            prompt: 'DBG> ',
            input: sock,
            output: sock,
            useGlobal: true,
        }).on('exit', function(){
            sock.end();
        });
    }).listen('6969');
}
