#!/usr/bin/env node

"use strict";

var fs = require('fs'),
    yargs = require('yargs'),
    obj2prwm = require('./index');

var argv = yargs.usage('Usage: obj2prwm -i inputFile -o outputFile [options]')
    .describe('i', 'Input file')
    .alias('i', 'in')
    .describe('o', 'Output file')
    .alias('o', 'out')
    .describe('positions', 'Include the vertices positions in output file')
    .describe('uvs', 'Include the UV in output file')
    .describe('normals', 'Include the normals in output file')
    .describe('indexed', 'Whether the geometry should be indexed')
    .describe('be', 'Write the output file in big endian')
    .describe('q', 'Quiet mode. Silence the output.')
    .alias('q', 'quiet')
    .boolean(['uvs','positions','normals', 'indexed', 'quiet', 'be'])
    .demandOption(['o', 'i'])
    .help('h')
    .alias('h', 'help')
    .argv;

var now = Date.now(),
    inFd = fs.openSync(argv.in, 'r'),
    outFd = fs.openSync(argv.out, 'w'),
    options = {
        positions: !!argv.positions,
        uvs: !!argv.uvs,
        normals: !!argv.normals,
        indexed: !!argv.indexed,
        bigEndian: !!argv.be,
        quiet: !!argv.quiet
    },
    log = options.quiet ? function noop() {} : function log(s) { console.log(s) };


log(' * Reading ' + argv.in);
var objString = fs.readFileSync(inFd, 'utf8');

var arrayBuffer = obj2prwm.convert(objString, options);

log(' * Writing ' + argv.out);
fs.writeFileSync(outFd, new Buffer(arrayBuffer), { flag: 'w' });
log('');
log('Operation completed in ' + ((Date.now() - now) / 1000).toFixed(2) + 's.');
log('Original OBJ file size : ' + (Buffer.byteLength(objString, 'utf8') / 1024).toFixed(2) + 'kB');
log('Generated ' + (options.indexed ? 'indexed' : 'non-indexed') + ' PRWM file size : ' + (arrayBuffer.byteLength / 1024).toFixed(2) + 'kB');
log('Individual vertices : ' + obj2prwm.getNumberOfVertices());
log('');


