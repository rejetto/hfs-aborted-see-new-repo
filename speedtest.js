var myGigFile = '/vedere/[DVDRIP-XVID-ITA]TENACIOUS D E IL DESTINO DEL ROCK .avi';

var http = require('http');
var fs = require('fs');

var srv = http.createServer(function(httpReq,httpRes){
    console.log('serving');

    httpRes.writeHead(200);
    fs.createReadStream(myGigFile).pipe(httpRes);
});

srv.listen(8, '0.0.0.0', function onListen(){
    console.log('listening');
});
