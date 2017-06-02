"use strict";

var fs = require('fs'),
    prwm = require('../implementations/packed-raw-webgl/prwm/index');

var smoothNefertitiData = require('./json/smooth-nefertiti.json'),
    facetedNefertitiData = require('./json/faceted-nefertiti.json'),
    smoothSuzanneData = require('./json/smooth-heavy-suzanne.json'),
    facetedSuzanneData = require('./json/faceted-heavy-suzanne.json'),
    cubeData = require('./json/cube.json');

function saveAsPRWM (data, positionsType, normalsType, uvsType, bigEndian, path) {

    var attributes = {},
        nbVertices = 0;

    if (positionsType) {
        attributes['position'] = {
            type: prwm.AttributeTypes.Float,
            cardinality: 3,
            values: new positionsType(data.vertices)
        };
        nbVertices = Math.max(nbVertices, data.vertices.length / 3);
    }

    if (normalsType) {
        attributes['normal'] = {
            type: prwm.AttributeTypes.Float,
            cardinality: 3,
            values: new normalsType(data.normals)
        };
        nbVertices = Math.max(nbVertices, data.normals.length / 3);
    }

    if (uvsType) {
        attributes['uv'] = {
            type: prwm.AttributeTypes.Float,
            cardinality: 2,
            values: new uvsType(data.uvs)
        };
        nbVertices = Math.max(nbVertices, data.uvs.length / 2);
    }

    var arrayBuffer = prwm.encode(
        attributes,
        new (nbVertices > 0xFFFF ? Uint32Array : Uint16Array)(data.indices),
        bigEndian
    );

    fs.writeFileSync(__dirname + '/' + path, new Buffer(arrayBuffer), { flag: 'w' });
}

saveAsPRWM(smoothNefertitiData, Float32Array, Float32Array, null, false, './prwm/smooth-nefertiti-LE.prwm');
saveAsPRWM(smoothNefertitiData, Float32Array, Float32Array, null, true, './prwm/smooth-nefertiti-BE.prwm');
saveAsPRWM(facetedNefertitiData, Float32Array, Float32Array, null, false, './prwm/faceted-nefertiti-LE.prwm');
saveAsPRWM(facetedNefertitiData, Float32Array, Float32Array, null, true, './prwm/faceted-nefertiti-BE.prwm');
saveAsPRWM(smoothSuzanneData, Float32Array, Float32Array, null, false, './prwm/smooth-heavy-suzanne-LE.prwm');
saveAsPRWM(smoothSuzanneData, Float32Array, Float32Array, null, true, './prwm/smooth-heavy-suzanne-BE.prwm');
saveAsPRWM(facetedSuzanneData, Float32Array, Float32Array, null, false, './prwm/faceted-heavy-suzanne-LE.prwm');
saveAsPRWM(facetedSuzanneData, Float32Array, Float32Array, null, true, './prwm/faceted-heavy-suzanne-BE.prwm');
saveAsPRWM(cubeData, Int8Array, Int8Array, Int8Array, false, './prwm/cube-LE.prwm');
saveAsPRWM(cubeData, Int8Array, Int8Array, Int8Array, true, './prwm/cube-BE.prwm');
