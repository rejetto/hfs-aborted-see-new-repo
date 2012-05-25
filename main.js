// libs
GLOBAL.vfs = new (require('./vfs').Vfs)();
//vfs.root.set('C:\\vedere').add('c:\\data\\pics\\fantasy');

var fileServer = require('./file-server');
var listenOn = {port:8, ip:'0.0.0.0'};
fileServer.start(listenOn);

var adminServer = require('./admin-server');
var adminOn = {port:88, ip:'127.0.0.1'};
adminServer.start(adminOn);
