"use strict";

var MeshTypes = require('./mesh-types'),
    AttributeTypes = require('./attribute-types'),
    isBigEndianPlatform = require('../utils/is-big-endian-platform');

// match the values defined in the spec to the TypedArray types
var InvertedEncodingTypes = [
    null,
    Float32Array,
    null,
    Int8Array,
    Int16Array,
    null,
    Int32Array,
    Uint8Array,
    Uint16Array,
    null,
    Uint32Array
];

// define the method to use on a DataView, corresponding the TypedArray type
var getMethods = {
    Uint16Array: 'getUint16',
    Uint32Array: 'getUint32',
    Int16Array: 'getInt16',
    Int32Array: 'getInt32',
    Float32Array: 'getFloat32',
    Float64Array: 'getFloat64'
};

function copyFromBuffer (sourceArrayBuffer, viewType, position, length, fromBigEndian) {
    var bytesPerElement = viewType.BYTES_PER_ELEMENT;
    var result;

    if (fromBigEndian === isBigEndianPlatform() || bytesPerElement === 1) {
        result = new viewType(sourceArrayBuffer, position, length);
    } else {
        result = new viewType(length);
        var readView = new DataView(sourceArrayBuffer, position, length * bytesPerElement);
        var getMethod = getMethods[viewType.name];
        var littleEndian = !fromBigEndian;

        for (var i = 0; i < length; i++) {
            result[i] = readView[getMethod](i * bytesPerElement, littleEndian);
        }
    }

    return result;
}

function decode (buffer) {
    var array = new Uint8Array(buffer);

    var version = array[0];

    var flags = array[1];

    var meshType = flags >> 7 & 0x01;
    var isTriangleMesh = meshType === MeshTypes.TriangleMesh;
    var indicesType = flags >> 6 & 0x01;
    var bigEndian = (flags >> 5 & 0x01) === 1;
    var attributesNumber = flags & 0x1F;

    var valuesNumber = 0;
    var elementNumber = 0;

    if (bigEndian) {
        valuesNumber = (array[2] << 16) + (array[3] << 8) + array[4];
        elementNumber = (array[5] << 16) + (array[6] << 8) + array[7];
    } else {
        valuesNumber = array[2] + (array[3] << 8) + (array[4] << 16);
        elementNumber = array[5] + (array[6] << 8) + (array[7] << 16);
    }

    var pos = 8;

    var attributes = {};

    for (var i = 0; i < attributesNumber; i++) {
        var char;
        var attributeName = '';
        while (pos < array.length) {
            char = array[pos];
            pos++;

            if (char === 0) {
                break;
            } else {
                attributeName += String.fromCharCode(char);
            }
        }

        var flags = array[pos];

        var attributeType = flags >> 6 & 0x03;
        var cardinality = (flags >> 4 & 0x03) + 1;
        var encodingType = flags & 0x0F;
        var arrayType = InvertedEncodingTypes[encodingType];

        pos++;

        // padding to next multiple of 4
        pos = Math.ceil(pos / 4) * 4;

        var values = copyFromBuffer(buffer, arrayType, pos, cardinality * valuesNumber, bigEndian);

        pos+= arrayType.BYTES_PER_ELEMENT * cardinality * valuesNumber;

        attributes[attributeName] = {
            type: attributeType,
            cardinality: cardinality,
            values: values
        };
    }

    pos = Math.ceil(pos / 4) * 4;

    var indices;

    if (isTriangleMesh) {
        indices = copyFromBuffer(
            buffer,
            indicesType === 1 ? Uint32Array : Uint16Array,
            pos,
            elementNumber * 3,
            bigEndian
        );
    } else {
        indices = new (elementNumber > 0xFFFF ? Uint32Array : Uint16Array)(elementNumber);

        for (var i = 0; i < elementNumber; i++) {
            indices[i] = i;
        }
    }

    return {
        version: version,
        meshType: meshType,
        elements: elementNumber,
        attributes: attributes,
        indices: indices
    };
}

module.exports = decode;
