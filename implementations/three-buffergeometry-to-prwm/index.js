"use strict";

var prwm = require('prwm');

/**
 * Generate an ArrayBuffer containing a PRWM file from an instance of BufferGeometry
 * @param {THREE.BufferGeoemtry} bufferGeometry An instance of BufferGeometry (can be indexed or non-indexed)
 * @param {boolean} bigEndian Whether the endianness of the file should Big Endian
 * @returns {ArrayBuffer} ArrayBuffer containing the PRWM file
 */
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
            normalized: attribute.normalized,
            type: prwm.Float,
            values: attribute.array
        };
    }

    if (bufferGeometry.index) {
        indices = bufferGeometry.index.array;
    }

    return prwm.encode(attributes, indices, !!bigEndian);
};

module.exports = bufferGeometryToPrwm;
