"use strict";

var objParser = require('wavefront-obj-parser'),
    computeNormals = require('./utils/compute-normals'),
    prwm = require('prwm');

function serializeIndexed (objData, usePositions, useNormals, useUvs) {
    var nbPolygons = objData.vertexPositionIndices.length / 4, // the parser always return indices by group of 4 to support quads
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
        index,
        nextIndex = 0;

    var mustGenerateNewNormals = useNormals && (!objData.vertexNormals|| objData.vertexNormals.length === 0);

    for (i = 0; i < nbPolygons; i++) {
        for (k = 0; k < 3; k++) { // assume we don't have actual quads in the models
            vertexIndex = objData.vertexPositionIndices[i * 4 + k];
            normalIndex = objData.vertexNormalIndices[i * 4 + k];
            uvIndex = objData.vertexUVIndices[i * 4 + k];

            mapped = (usePositions ? vertexIndex + ':' : ':') + (useNormals ? normalIndex + ':' : ':') + (useUvs ? uvIndex + ':' : ':');

            index = indicesMapping[mapped];

            if (typeof index === 'undefined') {
                index = nextIndex;
                indicesMapping[mapped] = index;
                nextIndex++;

                if (usePositions) {
                    vertices.push(
                        objData.vertexPositions[vertexIndex * 3],
                        objData.vertexPositions[vertexIndex * 3 + 1],
                        objData.vertexPositions[vertexIndex * 3 + 2]
                    );
                }

                if (useNormals && !mustGenerateNewNormals) {
                    normals.push(
                        objData.vertexNormals[normalIndex * 3],
                        objData.vertexNormals[normalIndex * 3 + 1],
                        objData.vertexNormals[normalIndex * 3 + 2]
                    );
                }

                if (useUvs) {
                    uvs.push(
                        objData.vertexUVs[uvIndex * 2],
                        objData.vertexUVs[uvIndex * 2 + 1]
                    );
                }
            }

            indices.push(index);
        }
    }

    if (mustGenerateNewNormals) {
        computeNormals(indices, vertices, normals);
    }

    return {
        indices: indices,
        vertices: vertices,
        normals: normals,
        uvs: uvs
    };
}

function serializeNonIndexed (objData, usePositions, useNormals, useUvs) {
    var nbPolygons = objData.vertexPositionIndices.length / 4, // the parser always return indices by group of 4 to support quads
        vertices = [],
        normals = [],
        uvs = [],
        i,
        k,
        vertexIndex,
        normalIndex,
        uvIndex;

    var mustGenerateNewNormals = useNormals && (!objData.vertexNormals|| objData.vertexNormals.length === 0);

    for (i = 0; i < nbPolygons; i++) {
        for (k = 0; k < 3; k++) { // assume we don't have actual quads in the models
            if (usePositions) {
                vertexIndex = objData.vertexPositionIndices[i * 4 + k];

                vertices.push(
                    objData.vertexPositions[vertexIndex * 3],
                    objData.vertexPositions[vertexIndex * 3 + 1],
                    objData.vertexPositions[vertexIndex * 3 + 2]
                );
            }

            if (useNormals && !mustGenerateNewNormals) {
                normalIndex = objData.vertexNormalIndices[i * 4 + k];

                normals.push(
                    objData.vertexNormals[normalIndex * 3],
                    objData.vertexNormals[normalIndex * 3 + 1],
                    objData.vertexNormals[normalIndex * 3 + 2]
                );
            }

            if (useUvs) {
                uvIndex = objData.vertexUVIndices[i * 4 + k];

                uvs.push(
                    objData.vertexUVs[uvIndex * 2],
                    objData.vertexUVs[uvIndex * 2 + 1]
                );
            }
        }
    }

    if (mustGenerateNewNormals) {
        computeNormals(null, vertices, normals);
    }

    return {
        indices: null,
        vertices: vertices,
        normals: normals,
        uvs: uvs
    };
}

var nbVertices = null;

module.exports = {
    convert: function (objString, options) {
        var log = options.quiet ? function noop() {} : function log(s) { console.log(s) };

        log(' * Parsing WaveFront OBJ data');
        var objData = objParser(objString);

        log(' * Formatting data');
        var serialized = options.indexed ? serializeIndexed(objData, options.positions, options.normals, options.uvs) : serializeNonIndexed(objData, options.positions, options.normals, options.uvs);

        var attributes = {};

        nbVertices = 0;

        if (options.positions) {
            attributes['position'] = { cardinality: 3, normalized: false, values: new Float32Array(serialized.vertices) };
            nbVertices = serialized.vertices.length / 3;
        }

        if (options.normals) {
            attributes['normal'] = { cardinality: 3, normalized: false, values: new Float32Array(serialized.normals) };
            nbVertices = serialized.normals.length / 3;
        }

        if (options.uvs) {
            attributes['uv'] = { cardinality: 2, normalized: false, values: new Float32Array(serialized.uvs) };
            nbVertices = serialized.uvs.length / 2;
        }

        return prwm.encode(
            attributes,
            serialized.indices ? (nbVertices > 0xFFFF ? new Uint32Array(serialized.indices) : new Uint16Array(serialized.indices)) : null,
            options.bigEndian
        );
    },
    getNumberOfVertices: function () {
        return nbVertices;
    }
};

