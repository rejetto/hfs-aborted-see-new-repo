GLOBAL.ceLib = require('cloneextend');
require('../static/extending');
GLOBAL._expand(require('../static/cs-shared'));

GLOBAL.path = require('path');
GLOBAL.util = require('util');
GLOBAL.os = require('os');
GLOBAL.fs = require('fs');
GLOBAL._expand(require('./misc'));
GLOBAL.vfsLib = require('./vfs');
GLOBAL.async = require('async');
GLOBAL.yaml = require('js-yaml');
