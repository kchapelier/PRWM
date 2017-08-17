#!/usr/bin/env node

"use strict";

var fs = require('fs'),
    yargs = require('yargs'),
    svg2prwm = require('./index');

var argv = yargs.usage('Usage: obj2prwm -i inputFile -o outputFile [options]')
    .describe('i', 'Input file')
    .alias('i', 'in')
    .describe('o', 'Output file')
    .alias('o', 'out')
    .describe('simplify', 'Simplify')
    .describe('scale', 'Scale')
    .describe('normals', 'Generate normals')
    .describe('uvs', 'Generate uvs')
    .describe('separateTriangles', 'Separate all triangles so that no vertex is shared')
    .describe('be', 'Write the output file in big endian')
    .describe('q', 'Quiet mode. Silence the output.')
    .alias('q', 'quiet')
    .boolean(['quiet', 'be'])
    .demandOption(['o', 'i'])
    .help('h')
    .alias('h', 'help')
    .argv;

var now = Date.now(),
    inFd = fs.openSync(argv.in, 'r'),
    outFd = fs.openSync(argv.out, 'w'),
    options = {
        normals: !!argv.normals,
        uvs: !!argv.uvs,
        separateTriangles: argv.separateTriangles,
        simplify: typeof argv.simplify !== 'undefined' ? parseFloat(argv.simplify) : 0,
        scale: typeof argv.scale !== 'undefined' ? parseFloat(argv.scale) : 1,
        bigEndian: !!argv.be,
        quiet: !!argv.quiet
    },
    log = options.quiet ? function noop() {} : function log(s) { console.log(s) };


log(' * Reading ' + argv.in);
var svgString = fs.readFileSync(inFd, 'utf8');

var arrayBuffer = svg2prwm.convert(svgString, options);

log(' * Writing ' + argv.out);
fs.writeFileSync(outFd, new Buffer(arrayBuffer), { flag: 'w' });
log('');
log('Operation completed in ' + ((Date.now() - now) / 1000).toFixed(2) + 's.');
log('Original SVG file size : ' + (Buffer.byteLength(svgString, 'utf8') / 1024).toFixed(2) + 'kB');
log('Generated PRWM file size : ' + (arrayBuffer.byteLength / 1024).toFixed(2) + 'kB');
log('Individual vertices : ' + svg2prwm.getNumberOfVertices());
log('');


