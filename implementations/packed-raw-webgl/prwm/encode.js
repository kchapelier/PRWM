"use strict";

var MeshTypes = require('./mesh-types'),
    AttributeTypes = require('./attribute-types'),
    isBigEndianPlatform = require('../utils/is-big-endian-platform');

// match the TypedArray type with the value defined in the spec
var EncodingTypes = {
    Float32Array: 1,
    Int8Array: 3,
    Int16Array: 4,
    Int32Array: 6,
    Uint8Array: 7,
    Uint16Array: 8,
    Uint32Array: 10
};

// define the method to use on a DataView, corresponding the TypedArray type
var setMethods = {
    Uint16Array: 'setUint16',
    Uint32Array: 'setUint32',
    Int16Array: 'setInt16',
    Int32Array: 'setInt32',
    Float32Array: 'setFloat32',
    Float64Array: 'setFloat64'
};

function copyToBuffer (sourceTypedArray, destinationArrayBuffer, position, length, bigEndian) {
    var writeArray = new sourceTypedArray.constructor(destinationArrayBuffer, position, length);

    if (bigEndian === isBigEndianPlatform() || sourceTypedArray.BYTES_PER_ELEMENT === 1) {
        // desired endianness is the same as the platform, or the endianness doesn't matter (1 byte)
        writeArray.set(sourceTypedArray.subarray(0, length));
    } else {
        var writeView = new DataView(destinationArrayBuffer, position, length * sourceTypedArray.BYTES_PER_ELEMENT);
        var setMethod = setMethods[sourceTypedArray.constructor.name];
        var bytesPerElement = sourceTypedArray.BYTES_PER_ELEMENT;
        var littleEndian = !bigEndian;

        for (var i = 0; i < length; i++) {
            writeView[setMethod](i * bytesPerElement, sourceTypedArray[i], littleEndian);
        }
    }

    return writeArray;
}

function encode (meshType, attributes, indices, bigEndian) {
    var attributeKeys = Object.keys(attributes);
    var valuesNumber = (attributes[attributeKeys[0]].values.length / attributes[attributeKeys[0]].cardinality) | 0;
    var isTriangleMesh = meshType === MeshTypes.TriangleMesh;
    var elementNumber = isTriangleMesh ? indices.length / 3 | 0 : valuesNumber;
    var indicesType = !isTriangleMesh || indices.constructor.name === 'Uint16Array' ? 0 : 1;

    /** PRELIMINARY CHECKS **/

    // this is not supposed to catch all the possible errors, only some of the gotchas

    if (meshType < 0 || meshType > 1) {
        throw new Error('PRWM encoder: Incorrect mesh type');
    }

    if (attributeKeys.length === 0) {
        throw new Error('PRWM encoder: The model must have at least one attribute');
    }

    if (isTriangleMesh && indices.constructor.name !== 'Uint16Array' && indices.constructor.name !== 'Uint32Array') {
        throw new Error('PRWM encoder: The indices must be represented as an Uint16Array or an Uint32Array');
    }

    /** GET THE FILE LENGTH **/

    var totalLength = 8;

    for (var i = 0; i < attributeKeys.length; i++) {
        var attributeKey = attributeKeys[i];
        var attribute = attributes[attributeKey];
        var attributeLength = attributeKey.length + 2; // NUL byte + flag byte
        attributeLength = Math.ceil(attributeLength / 4) * 4 + attribute.values.byteLength;
        totalLength += attributeLength;
    }

    totalLength = Math.ceil(totalLength / 4) * 4;

    if (isTriangleMesh) {
        totalLength += indices.byteLength;
    }

    var buffer = new ArrayBuffer(totalLength),
        array = new Uint8Array(buffer);

    /** HEADER **/

    array[0] = 1;
    array[1] = (
        meshType << 7 |
        indicesType << 6 |
        (bigEndian ? 1 : 0) << 5 |
        attributeKeys.length & 0x1F
    );

    if (bigEndian) {
        array[2] = valuesNumber >> 16 & 0xFF;
        array[3] = valuesNumber >> 8 & 0xFF;
        array[4] = valuesNumber & 0xFF;

        array[5] = elementNumber >> 16 & 0xFF;
        array[6] = elementNumber >> 8 & 0xFF;
        array[7] = elementNumber & 0xFF;
    } else {
        array[2] = valuesNumber & 0xFF;
        array[3] = valuesNumber >> 8 & 0xFF;
        array[4] = valuesNumber >> 16 & 0xFF;

        array[5] = elementNumber & 0xFF;
        array[6] = elementNumber >> 8 & 0xFF;
        array[7] = elementNumber >> 16 & 0xFF;
    }


    var pos = 8;

    /** ATTRIBUTES **/

    for (var i = 0; i < attributeKeys.length; i++) {
        var attributeKey = attributeKeys[i];
        var attribute = attributes[attributeKey];

        /*** WRITE ATTRIBUTE HEADER ***/

        for (var j = 0; j < attributeKey.length; j++, pos++) {
            array[pos] = (attributeKey.charCodeAt(j) & 0x7F) || 0x5F; // default to underscore
        }

        pos++;

        array[pos] = (
            (attribute.type & 0x03) << 6 |
            ((attribute.cardinality - 1) & 0x03) << 4 |
            EncodingTypes[attribute.values.constructor.name] & 0x0F
        );

        pos++;


        // padding to next multiple of 4
        pos = Math.ceil(pos / 4) * 4;

        /*** WRITE ATTRIBUTE VALUES ***/

        var attributesWriteArray = copyToBuffer(attribute.values, buffer, pos, attribute.cardinality * valuesNumber, bigEndian);

        pos += attributesWriteArray.byteLength;
    }

    /*** WRITE INDICES VALUES ***/

    pos = Math.ceil(pos / 4) * 4;

    if (isTriangleMesh) {
        copyToBuffer(indices, buffer, pos, elementNumber * 3, bigEndian);
    }


    return buffer;
}

module.exports = encode;
