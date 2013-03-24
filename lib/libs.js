require('../static/extending');
GLOBAL.csShared = require('../static/cs-shared');
GLOBAL._expand(GLOBAL.csShared); // make'em global

GLOBAL.path = require('path');
GLOBAL.util = require('util');
GLOBAL.os = require('os');
GLOBAL.fs = require('fs');
GLOBAL.assert = require('assert');
GLOBAL.ceLib = require('cloneextend');
GLOBAL.misc = require('./misc');
GLOBAL.vfsLib = require('./vfs');
GLOBAL.async = require('async');
