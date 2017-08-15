"use strict";

var objParser = require('wavefront-obj-parser'),
    prwm = require('prwm');

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
        index,
        nextIndex = 0;

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

