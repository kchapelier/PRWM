"use strict";

var prwm = require('../prwm/');

var bufferGeometryToPrwm = function bufferGeometryToPrwm (bufferGeometry, bigEndian) {
    if (bufferGeometry.type !== 'BufferGeometry') {
        throw new Error('three-buffergeometry-to-prwm can only be used with an instance of THREE.BufferGeometry');
    }

    var attributes = {},
        indices = null,
        attributeKeys = Object.keys(bufferGeometry.attributes),
        i = 0,
        attribute;

    for (; i < attributeKeys.length; i++) {
        attribute = bufferGeometry.attributes[attributeKeys[i]];

        attributes[attributeKeys[i]] = {
            cardinality: attribute.itemSize,
            values: attribute.array
        };
    }

    if (bufferGeometry.index) {
        indices = bufferGeometry.index.array;
    }

    return prwm.encode(attributes, indices, !!bigEndian);
};

module.exports = bufferGeometryToPrwm;
