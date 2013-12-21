GLOBAL.ceLib = require('cloneextend');
GLOBAL.csShared = require('../static/cs-shared');
require('../static/extending');
GLOBAL._expand(GLOBAL.csShared); // make'em global

GLOBAL.path = require('path');
GLOBAL.util = require('util');
GLOBAL.os = require('os');
GLOBAL.fs = require('fs');
GLOBAL.assert = require('assert');
GLOBAL.misc = require('./misc');
GLOBAL.vfsLib = require('./vfs');
GLOBAL.async = require('async');
GLOBAL.yaml = require('js-yaml');
