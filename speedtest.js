/**
 * @fileOverview This should show the best performance we can expect
 * @author Massimo Melina <a@rejetto.com> 
 */ 
var v = process.argv;
var myGigFile = v.length >= 3 ? v[2] : '/vedere/Valzer con Bashir (2008).avi';

var http = require('http');
var fs = require('fs');

var srv = http.createServer(function(httpReq,httpRes){
    //console.log('serving');  // for heavy loads this can affect performances

    httpRes.writeHead(200);
    fs.createReadStream(myGigFile).pipe(httpRes);
});

var port = 888;
srv.listen(port, '0.0.0.0', function onListen(){
    console.log('listening on '+port);
});
