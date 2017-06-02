"use strict";
var fs = require('fs'),
    objParser = require('wavefront-obj-parser'),
    prwm = require('../prwm/'),
    argv = require('minimist')(process.argv.slice(2));

var inputPath = argv._[0],
    outputPath = argv.o,
    positions = !!argv.positions,
    uvs = !!argv.uvs,
    normals = !!argv.normals,
    indexed = !!argv.indexed,
    bigEndian = !!argv.be;

function serializeIndexed (objData, usePositions, useNormals, useUvs) {
    var nbPolygons = objData.vertexIndex.length / 4, // the parser always return indices by group of 4 to support quads
        indicesMapping = [],
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

    for (i = 0; i < nbPolygons; i++) {
        for (k = 0; k < 3; k++) { // assume we don't have actual quads in the models
            vertexIndex = objData.vertexIndex[i * 4 + k];
            normalIndex = objData.normalIndex[i * 4 + k];
            uvIndex = objData.uvIndex[i * 4 + k];

            mapped = ':';

            if (usePositions) {
                mapped += vertexIndex + ':';
            }

            if (useNormals) {
                mapped += normalIndex + ':';
            }

            if (useUvs) {
                mapped += uvIndex + ':';
            }

            index = indicesMapping.indexOf(mapped);

            if (index === -1) {
                index = indicesMapping.length;
                indicesMapping.push(mapped);

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

var objString = fs.readFileSync(inputPath, 'utf8');

var objData = objParser(objString);

var serialized = indexed ? serializeIndexed(objData, positions, normals, uvs) : serializeNonIndexed(objData, positions, normals, uvs);

var attributes = {};
var nbVertices = 0;

if (positions) {
    attributes['position'] = { cardinality: 3, values: new Float32Array(serialized.vertices) };
    nbVertices = serialized.vertices.length / 3;
}

if (normals) {
    attributes['normal'] = { cardinality: 3, values: new Float32Array(serialized.normals) };
    nbVertices = serialized.normals.length / 3;
}

if (uvs) {
    attributes['uv'] = { cardinality: 2, values: new Float32Array(serialized.uvs) };
    nbVertices = serialized.uvs.length / 2;
}

var arrayBuffer = prwm.encode(
    attributes,
    serialized.indices ? (nbVertices > 0xFFFF ? new Uint32Array(serialized.indices) : new Uint16Array(serialized.indices)) : null,
    bigEndian
);

fs.writeFileSync(outputPath, new Buffer(arrayBuffer), { flag: 'w' });

