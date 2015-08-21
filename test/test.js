var assert = require("assert");
var fs = require("fs");
require("../static/extending.js");
GLOBAL._expand(require('../static/cs-shared'));
function $(){}
var assert = require("../static/backend/vfs.js");
var io = require('socket.io-client');
describe('Admin server', function(){
    var URL = 'http://127.0.0.1:88';
    var c;
    it('should accept connections', function(done) {
        c = io(URL, { timeout:500 });
        c.on('connect', function(){
            done();
        })
        c.on('connect_timeout', done);
        c.on('connect_error', done);
        c.on('error', done);
    });
    it('should load empty vfs', function(done) {
        sendCommand('vfs.import', { root:''+fs.readFileSync('test/empty.vfs') }, function(r) {
            if (!r.ok)
                return done(r.error ||undefined);
            sendCommand('vfs.get', { uri:'/', depth:1 }, function(r) { // check there are zero items
                done(!r.ok ? r.error : (!r.item || r.item.children) ? "non-empty" : undefined);
            });

        });
    });
    it('should add folder', function(done) {
        sendCommand('vfs.add', { uri:'/', resource:process.cwd()+'/test' }, function(r) {
            if (!r.ok)
                return done(r.error ||undefined);
            sendCommand('vfs.get', { uri:'/test/test.js' }, function(r) { // check there is this source file
                done(!r.ok ? r.error : !r.item ? "missing file" : r.item.itemKind!=='file' ? 'not-a-file' : undefined);
            });
        });
    });

    after(function(){
        c.disconnect();
    })

    function sendCommand(cmd, data, cb) {
        //log('sending',cmd,data);
        c.emit(cmd, data, function(result){
            ioData(result);
            //log('received', result);
            cb && cb(result);
        })
    } // sendCommand

});