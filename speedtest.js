/**
 * @fileOverview This should show the best performance we can expect
 * @author Massimo Melina <a@rejetto.com> 
 */ 
var v = process.argv;
var myGigFile = v.length >= 3 ? v[2] : '/bigfile.avi';

var http = require('http');
var fs = require('fs');

var srv = http.createServer(function(httpReq,httpRes){
    console.log('serving');

    httpRes.writeHead(200);
    fs.createReadStream(myGigFile).pipe(httpRes);
});

var port = 888;
srv.listen(port, '0.0.0.0', function onListen(){
    console.log('listening on '+port);
});
