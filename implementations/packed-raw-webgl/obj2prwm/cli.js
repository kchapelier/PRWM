#!/usr/bin/env node

"use strict";

var fs = require('fs'),
    objParser = require('wavefront-obj-parser'),
    prwm = require('../prwm/'),
    yargs = require('yargs');

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
    positions = !!argv.positions,
    uvs = !!argv.uvs,
    normals = !!argv.normals,
    indexed = !!argv.indexed,
    bigEndian = !!argv.be,
    log = argv.quiet ? function noop() {} : function log(s) { console.log(s) };

function serializeIndexed (objData, usePositions, useNormals, useUvs) {
    var nbPolygons = objData.vertexIndex.length / 4, // the parser always return indices by group of 4 to support quads
        indicesMapping = {},
        indices = [],
        vertices = [],
        normals = [],
        uvs = [],
        i,
        k,
        vertexIndex,
        normalIndex,
        uvIndex,
        mapped,
        index;

    var nextIndex = 0;

    for (i = 0; i < nbPolygons; i++) {
        for (k = 0; k < 3; k++) { // assume we don't have actual quads in the models
            vertexIndex = objData.vertexIndex[i * 4 + k];
            normalIndex = objData.normalIndex[i * 4 + k];
            uvIndex = objData.uvIndex[i * 4 + k];

            mapped = (usePositions ? vertexIndex + ':' : ':') + (useNormals ? normalIndex + ':' : ':') + (useUvs ? uvIndex + ':' : ':');

            index = indicesMapping[mapped];

            if (typeof index === 'undefined') {
                index = nextIndex;
                indicesMapping[mapped] = index;
                nextIndex++;

                if (usePositions) {
                    vertices.push(
                        objData.vertex[vertexIndex * 3],
                        objData.vertex[vertexIndex * 3 + 1],
                        objData.vertex[vertexIndex * 3 + 2]
                    );
                }

                if (useNormals) {
                    normals.push(
                        objData.normal[normalIndex * 3],
                        objData.normal[normalIndex * 3 + 1],
                        objData.normal[normalIndex * 3 + 2]
                    );
                }

                if (useUvs) {
                    uvs.push(
                        objData.uv[uvIndex * 2],
                        objData.uv[uvIndex * 2 + 1]
                    );
                }
            }

            indices.push(index);
        }
    }

    return {
        indices: indices,
        vertices: vertices,
        normals: normals,
        uvs: uvs
    };
}

function serializeNonIndexed (objData, usePositions, useNormals, useUvs) {
    var nbPolygons = objData.vertexIndex.length / 4, // the parser always return indices by group of 4 to support quads
        vertices = [],
        normals = [],
        uvs = [],
        i,
        k,
        vertexIndex,
        normalIndex,
        uvIndex;

    for (i = 0; i < nbPolygons; i++) {
        for (k = 0; k < 3; k++) { // assume we don't have actual quads in the models
            if (usePositions) {
                vertexIndex = objData.vertexIndex[i * 4 + k];

                vertices.push(
                    objData.vertex[vertexIndex * 3],
                    objData.vertex[vertexIndex * 3 + 1],
                    objData.vertex[vertexIndex * 3 + 2]
                );
            }

            if (useNormals) {
                normalIndex = objData.normalIndex[i * 4 + k];

                normals.push(
                    objData.normal[normalIndex * 3],
                    objData.normal[normalIndex * 3 + 1],
                    objData.normal[normalIndex * 3 + 2]
                );
            }

            if (useUvs) {
                uvIndex = objData.uvIndex[i * 4 + k];

                uvs.push(
                    objData.uv[uvIndex * 2],
                    objData.uv[uvIndex * 2 + 1]
                );
            }
        }
    }

    return {
        indices: null,
        vertices: vertices,
        normals: normals,
        uvs: uvs
    };
}

log(' * Reading ' + argv.in);
var objString = fs.readFileSync(inFd, 'utf8');

log(' * Parsing WaveFront OBJ data');
var objData = objParser(objString);

log(' * Formatting data');
var serialized = indexed ? serializeIndexed(objData, positions, normals, uvs) : serializeNonIndexed(objData, positions, normals, uvs);

var attributes = {},
    nbVertices = 0;

if (positions) {
    attributes['position'] = { cardinality: 3, normalized: false, values: new Float32Array(serialized.vertices) };
    nbVertices = serialized.vertices.length / 3;
}

if (normals) {
    attributes['normal'] = { cardinality: 3, normalized: false, values: new Float32Array(serialized.normals) };
    nbVertices = serialized.normals.length / 3;
}

if (uvs) {
    attributes['uv'] = { cardinality: 2, normalized: false, values: new Float32Array(serialized.uvs) };
    nbVertices = serialized.uvs.length / 2;
}

var arrayBuffer = prwm.encode(
    attributes,
    serialized.indices ? (nbVertices > 0xFFFF ? new Uint32Array(serialized.indices) : new Uint16Array(serialized.indices)) : null,
    bigEndian
);

log(' * Writing ' + argv.out);
fs.writeFileSync(outFd, new Buffer(arrayBuffer), { flag: 'w' });
log('');
log('Operation completed in ' + ((Date.now() - now) / 1000).toFixed(2) + 's.');
log('Original OBJ file size : ' + (Buffer.byteLength(objString, 'utf8') / 1024).toFixed(2) + 'kB');
log('Generated ' + (indexed ? 'indexed' : 'non-indexed') + ' PRWM file size : ' + (arrayBuffer.byteLength / 1024).toFixed(2) + 'kB');
log('Individual vertices : ' + nbVertices);
log('');


