!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.threeBuffergeometryToPrwm=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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

},{"prwm":2}],2:[function(require,module,exports){
"use strict";

var attributeTypes = require('./prwm/attribute-types');

module.exports = {
    version: 1,
    Int: attributeTypes.Int,
    Float: attributeTypes.Float,
    isBigEndianPlatform: require('./utils/is-big-endian-platform'),
    encode: require('./prwm/encode'),
    decode: require('./prwm/decode')
};

},{"./prwm/attribute-types":3,"./prwm/decode":4,"./prwm/encode":5,"./utils/is-big-endian-platform":6}],3:[function(require,module,exports){
"use strict";

module.exports = {
    Float: 0,
    Int: 1
};

},{}],4:[function(require,module,exports){
"use strict";

var isBigEndianPlatform = require('../utils/is-big-endian-platform');

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
    Float32Array: 'getFloat32'
};

function copyFromBuffer (sourceArrayBuffer, viewType, position, length, fromBigEndian) {
    var bytesPerElement = viewType.BYTES_PER_ELEMENT,
        result;

    if (fromBigEndian === isBigEndianPlatform() || bytesPerElement === 1) {
        result = new viewType(sourceArrayBuffer, position, length);
    } else {
        var readView = new DataView(sourceArrayBuffer, position, length * bytesPerElement),
            getMethod = getMethods[viewType.name],
            littleEndian = !fromBigEndian;

        result = new viewType(length);

        for (var i = 0; i < length; i++) {
            result[i] = readView[getMethod](i * bytesPerElement, littleEndian);
        }
    }

    return result;
}

function decode (buffer, offset) {
    offset = offset || 0;

    var array = new Uint8Array(buffer, offset),
        version = array[0],
        flags = array[1],
        indexedGeometry = !!(flags >> 7),
        indicesType = flags >> 6 & 0x01,
        bigEndian = (flags >> 5 & 0x01) === 1,
        attributesNumber = flags & 0x1F,
        valuesNumber = 0,
        indicesNumber = 0;

    if (bigEndian) {
        valuesNumber = (array[2] << 16) + (array[3] << 8) + array[4];
        indicesNumber = (array[5] << 16) + (array[6] << 8) + array[7];
    } else {
        valuesNumber = array[2] + (array[3] << 8) + (array[4] << 16);
        indicesNumber = array[5] + (array[6] << 8) + (array[7] << 16);
    }

    /** PRELIMINARY CHECKS **/

    if (offset / 4 % 1 !== 0) {
        throw new Error('PRWM decoder: Offset should be a multiple of 4, received ' + offset);
    }

    if (version === 0) {
        throw new Error('PRWM decoder: Invalid format version: 0');
    } else if (version !== 1) {
        throw new Error('PRWM decoder: Unsupported format version: ' + version);
    }

    if (!indexedGeometry) {
        if (indicesType !== 0) {
            throw new Error('PRWM decoder: Indices type must be set to 0 for non-indexed geometries');
        } else if (indicesNumber !== 0) {
            throw new Error('PRWM decoder: Number of indices must be set to 0 for non-indexed geometries');
        }
    }

    /** PARSING **/

    var pos = 8;

    var attributes = {},
        attributeName,
        char,
        attributeNormalized,
        attributeType,
        cardinality,
        encodingType,
        arrayType,
        values,
        i;

    for (i = 0; i < attributesNumber; i++) {
        attributeName = '';

        while (pos < array.length) {
            char = array[pos];
            pos++;

            if (char === 0) {
                break;
            } else {
                attributeName += String.fromCharCode(char);
            }
        }

        flags = array[pos];

        attributeType = flags >> 7 & 0x01;
        attributeNormalized = !!(flags >> 6 & 0x01);
        cardinality = (flags >> 4 & 0x03) + 1;
        encodingType = flags & 0x0F;
        arrayType = InvertedEncodingTypes[encodingType];

        pos++;

        // padding to next multiple of 4
        pos = Math.ceil(pos / 4) * 4;

        values = copyFromBuffer(buffer, arrayType, pos + offset, cardinality * valuesNumber, bigEndian);

        pos+= arrayType.BYTES_PER_ELEMENT * cardinality * valuesNumber;

        attributes[attributeName] = {
            type: attributeType,
            normalized: attributeNormalized,
            cardinality: cardinality,
            values: values
        };
    }

    pos = Math.ceil(pos / 4) * 4;

    var indices = null;

    if (indexedGeometry) {
        indices = copyFromBuffer(
            buffer,
            indicesType === 1 ? Uint32Array : Uint16Array,
            pos + offset,
            indicesNumber,
            bigEndian
        );
    }

    return {
        version: version,
        bigEndian: bigEndian,
        attributes: attributes,
        indices: indices
    };
}

module.exports = decode;

},{"../utils/is-big-endian-platform":6}],5:[function(require,module,exports){
"use strict";

var isBigEndianPlatform = require('../utils/is-big-endian-platform'),
    attributeTypes = require('./attribute-types');

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
    Float32Array: 'setFloat32'
};

function copyToBuffer (sourceTypedArray, destinationArrayBuffer, position, bigEndian) {
    var length = sourceTypedArray.length,
        bytesPerElement = sourceTypedArray.BYTES_PER_ELEMENT;

    var writeArray = new sourceTypedArray.constructor(destinationArrayBuffer, position, length);

    if (bigEndian === isBigEndianPlatform() || bytesPerElement === 1) {
        // desired endianness is the same as the platform, or the endianness doesn't matter (1 byte)
        writeArray.set(sourceTypedArray.subarray(0, length));
    } else {
        var writeView = new DataView(destinationArrayBuffer, position, length * bytesPerElement),
            setMethod = setMethods[sourceTypedArray.constructor.name],
            littleEndian = !bigEndian,
            i = 0;

        for (i = 0; i < length; i++) {
            writeView[setMethod](i * bytesPerElement, sourceTypedArray[i], littleEndian);
        }
    }

    return writeArray;
}

function encode (attributes, indices, bigEndian) {
    var attributeKeys = attributes ? Object.keys(attributes) : [],
        indexedGeometry = !!indices,
        i, j;

    /** PRELIMINARY CHECKS **/

    // this is not supposed to catch all the possible errors, only some of the gotchas

    if (attributeKeys.length === 0) {
        throw new Error('PRWM encoder: The model must have at least one attribute');
    }

    if (attributeKeys.length > 31) {
        throw new Error('PRWM encoder: The model can have at most 31 attributes');
    }

    for (i = 0; i < attributeKeys.length; i++) {
        if (!EncodingTypes.hasOwnProperty(attributes[attributeKeys[i]].values.constructor.name)) {
            throw new Error('PRWM encoder: Unsupported attribute values type: ' + attributes[attributeKeys[i]].values.constructor.name);
        }
    }

    if (indexedGeometry && indices.constructor.name !== 'Uint16Array' && indices.constructor.name !== 'Uint32Array') {
        throw new Error('PRWM encoder: The indices must be represented as an Uint16Array or an Uint32Array');
    }

    /** GET THE TYPE OF INDICES AS WELL AS THE NUMBER OF INDICES AND ATTRIBUTE VALUES **/

    var valuesNumber = attributes[attributeKeys[0]].values.length / attributes[attributeKeys[0]].cardinality | 0,
        indicesNumber = indexedGeometry ? indices.length : 0,
        indicesType = indexedGeometry && indices.constructor.name === 'Uint32Array' ? 1 : 0;

    /** GET THE FILE LENGTH **/

    var totalLength = 8,
        attributeKey,
        attribute,
        attributeType,
        attributeNormalized;

    for (i = 0; i < attributeKeys.length; i++) {
        attributeKey = attributeKeys[i];
        attribute = attributes[attributeKey];
        totalLength += attributeKey.length + 2; // NUL byte + flag byte + padding
        totalLength = Math.ceil(totalLength / 4) * 4; // padding
        totalLength += attribute.values.byteLength;
    }

    if (indexedGeometry) {
        totalLength = Math.ceil(totalLength / 4) * 4;
        totalLength += indices.byteLength;
    }

    /** INITIALIZE THE BUFFER */

    var buffer = new ArrayBuffer(totalLength),
        array = new Uint8Array(buffer);

    /** HEADER **/

    array[0] = 1;
    array[1] = (
        indexedGeometry << 7 |
        indicesType << 6 |
        (bigEndian ? 1 : 0) << 5 |
        attributeKeys.length & 0x1F
    );

    if (bigEndian) {
        array[2] = valuesNumber >> 16 & 0xFF;
        array[3] = valuesNumber >> 8 & 0xFF;
        array[4] = valuesNumber & 0xFF;

        array[5] = indicesNumber >> 16 & 0xFF;
        array[6] = indicesNumber >> 8 & 0xFF;
        array[7] = indicesNumber & 0xFF;
    } else {
        array[2] = valuesNumber & 0xFF;
        array[3] = valuesNumber >> 8 & 0xFF;
        array[4] = valuesNumber >> 16 & 0xFF;

        array[5] = indicesNumber & 0xFF;
        array[6] = indicesNumber >> 8 & 0xFF;
        array[7] = indicesNumber >> 16 & 0xFF;
    }


    var pos = 8;

    /** ATTRIBUTES **/

    for (i = 0; i < attributeKeys.length; i++) {
        attributeKey = attributeKeys[i];
        attribute = attributes[attributeKey];
        attributeType = typeof attribute.type === 'undefined' ? attributeTypes.Float : attribute.type;
        attributeNormalized = (!!attribute.normalized ? 1 : 0);

        /*** WRITE ATTRIBUTE HEADER ***/

        for (j = 0; j < attributeKey.length; j++, pos++) {
            array[pos] = (attributeKey.charCodeAt(j) & 0x7F) || 0x5F; // default to underscore
        }

        pos++;

        array[pos] = (
            attributeType << 7 |
            attributeNormalized << 6 |
            ((attribute.cardinality - 1) & 0x03) << 4 |
            EncodingTypes[attribute.values.constructor.name] & 0x0F
        );

        pos++;


        // padding to next multiple of 4
        pos = Math.ceil(pos / 4) * 4;

        /*** WRITE ATTRIBUTE VALUES ***/

        var attributesWriteArray = copyToBuffer(attribute.values, buffer, pos, bigEndian);

        pos += attributesWriteArray.byteLength;
    }

    /*** WRITE INDICES VALUES ***/

    if (indexedGeometry) {
        pos = Math.ceil(pos / 4) * 4;

        copyToBuffer(indices, buffer, pos, bigEndian);
    }

    return buffer;
}

module.exports = encode;

},{"../utils/is-big-endian-platform":6,"./attribute-types":3}],6:[function(require,module,exports){
"use strict";

var bigEndianPlatform = null;

/**
 * Check if the endianness of the platform is big-endian (most significant bit first)
 * @returns {boolean} True if big-endian, false if little-endian
 */
function isBigEndianPlatform () {
    if (bigEndianPlatform === null) {
        var buffer = new ArrayBuffer(2),
            uint8Array = new Uint8Array(buffer),
            uint16Array = new Uint16Array(buffer);

        uint8Array[0] = 0xAA; // set first byte
        uint8Array[1] = 0xBB; // set second byte
        bigEndianPlatform = (uint16Array[0] === 0xAABB);
    }

    return bigEndianPlatform;
}

module.exports = isBigEndianPlatform;

},{}]},{},[1])(1)
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uL3Vzci9sb2NhbC9saWIvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsImluZGV4LmpzIiwibm9kZV9tb2R1bGVzL3Byd20vaW5kZXguanMiLCJub2RlX21vZHVsZXMvcHJ3bS9wcndtL2F0dHJpYnV0ZS10eXBlcy5qcyIsIm5vZGVfbW9kdWxlcy9wcndtL3Byd20vZGVjb2RlLmpzIiwibm9kZV9tb2R1bGVzL3Byd20vcHJ3bS9lbmNvZGUuanMiLCJub2RlX21vZHVsZXMvcHJ3bS91dGlscy9pcy1iaWctZW5kaWFuLXBsYXRmb3JtLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgcHJ3bSA9IHJlcXVpcmUoJ3Byd20nKTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBhbiBBcnJheUJ1ZmZlciBjb250YWluaW5nIGEgUFJXTSBmaWxlIGZyb20gYW4gaW5zdGFuY2Ugb2YgQnVmZmVyR2VvbWV0cnlcbiAqIEBwYXJhbSB7VEhSRUUuQnVmZmVyR2VvZW10cnl9IGJ1ZmZlckdlb21ldHJ5IEFuIGluc3RhbmNlIG9mIEJ1ZmZlckdlb21ldHJ5IChjYW4gYmUgaW5kZXhlZCBvciBub24taW5kZXhlZClcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gYmlnRW5kaWFuIFdoZXRoZXIgdGhlIGVuZGlhbm5lc3Mgb2YgdGhlIGZpbGUgc2hvdWxkIEJpZyBFbmRpYW5cbiAqIEByZXR1cm5zIHtBcnJheUJ1ZmZlcn0gQXJyYXlCdWZmZXIgY29udGFpbmluZyB0aGUgUFJXTSBmaWxlXG4gKi9cbnZhciBidWZmZXJHZW9tZXRyeVRvUHJ3bSA9IGZ1bmN0aW9uIGJ1ZmZlckdlb21ldHJ5VG9QcndtIChidWZmZXJHZW9tZXRyeSwgYmlnRW5kaWFuKSB7XG4gICAgaWYgKGJ1ZmZlckdlb21ldHJ5LnR5cGUgIT09ICdCdWZmZXJHZW9tZXRyeScpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCd0aHJlZS1idWZmZXJnZW9tZXRyeS10by1wcndtIGNhbiBvbmx5IGJlIHVzZWQgd2l0aCBhbiBpbnN0YW5jZSBvZiBUSFJFRS5CdWZmZXJHZW9tZXRyeScpO1xuICAgIH1cblxuICAgIHZhciBhdHRyaWJ1dGVzID0ge30sXG4gICAgICAgIGluZGljZXMgPSBudWxsLFxuICAgICAgICBhdHRyaWJ1dGVLZXlzID0gT2JqZWN0LmtleXMoYnVmZmVyR2VvbWV0cnkuYXR0cmlidXRlcyksXG4gICAgICAgIGkgPSAwLFxuICAgICAgICBhdHRyaWJ1dGU7XG5cbiAgICBmb3IgKDsgaSA8IGF0dHJpYnV0ZUtleXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgYXR0cmlidXRlID0gYnVmZmVyR2VvbWV0cnkuYXR0cmlidXRlc1thdHRyaWJ1dGVLZXlzW2ldXTtcblxuICAgICAgICBhdHRyaWJ1dGVzW2F0dHJpYnV0ZUtleXNbaV1dID0ge1xuICAgICAgICAgICAgY2FyZGluYWxpdHk6IGF0dHJpYnV0ZS5pdGVtU2l6ZSxcbiAgICAgICAgICAgIG5vcm1hbGl6ZWQ6IGF0dHJpYnV0ZS5ub3JtYWxpemVkLFxuICAgICAgICAgICAgdHlwZTogcHJ3bS5GbG9hdCxcbiAgICAgICAgICAgIHZhbHVlczogYXR0cmlidXRlLmFycmF5XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgaWYgKGJ1ZmZlckdlb21ldHJ5LmluZGV4KSB7XG4gICAgICAgIGluZGljZXMgPSBidWZmZXJHZW9tZXRyeS5pbmRleC5hcnJheTtcbiAgICB9XG5cbiAgICByZXR1cm4gcHJ3bS5lbmNvZGUoYXR0cmlidXRlcywgaW5kaWNlcywgISFiaWdFbmRpYW4pO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBidWZmZXJHZW9tZXRyeVRvUHJ3bTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgYXR0cmlidXRlVHlwZXMgPSByZXF1aXJlKCcuL3Byd20vYXR0cmlidXRlLXR5cGVzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICAgIHZlcnNpb246IDEsXG4gICAgSW50OiBhdHRyaWJ1dGVUeXBlcy5JbnQsXG4gICAgRmxvYXQ6IGF0dHJpYnV0ZVR5cGVzLkZsb2F0LFxuICAgIGlzQmlnRW5kaWFuUGxhdGZvcm06IHJlcXVpcmUoJy4vdXRpbHMvaXMtYmlnLWVuZGlhbi1wbGF0Zm9ybScpLFxuICAgIGVuY29kZTogcmVxdWlyZSgnLi9wcndtL2VuY29kZScpLFxuICAgIGRlY29kZTogcmVxdWlyZSgnLi9wcndtL2RlY29kZScpXG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICAgIEZsb2F0OiAwLFxuICAgIEludDogMVxufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgaXNCaWdFbmRpYW5QbGF0Zm9ybSA9IHJlcXVpcmUoJy4uL3V0aWxzL2lzLWJpZy1lbmRpYW4tcGxhdGZvcm0nKTtcblxuLy8gbWF0Y2ggdGhlIHZhbHVlcyBkZWZpbmVkIGluIHRoZSBzcGVjIHRvIHRoZSBUeXBlZEFycmF5IHR5cGVzXG52YXIgSW52ZXJ0ZWRFbmNvZGluZ1R5cGVzID0gW1xuICAgIG51bGwsXG4gICAgRmxvYXQzMkFycmF5LFxuICAgIG51bGwsXG4gICAgSW50OEFycmF5LFxuICAgIEludDE2QXJyYXksXG4gICAgbnVsbCxcbiAgICBJbnQzMkFycmF5LFxuICAgIFVpbnQ4QXJyYXksXG4gICAgVWludDE2QXJyYXksXG4gICAgbnVsbCxcbiAgICBVaW50MzJBcnJheVxuXTtcblxuLy8gZGVmaW5lIHRoZSBtZXRob2QgdG8gdXNlIG9uIGEgRGF0YVZpZXcsIGNvcnJlc3BvbmRpbmcgdGhlIFR5cGVkQXJyYXkgdHlwZVxudmFyIGdldE1ldGhvZHMgPSB7XG4gICAgVWludDE2QXJyYXk6ICdnZXRVaW50MTYnLFxuICAgIFVpbnQzMkFycmF5OiAnZ2V0VWludDMyJyxcbiAgICBJbnQxNkFycmF5OiAnZ2V0SW50MTYnLFxuICAgIEludDMyQXJyYXk6ICdnZXRJbnQzMicsXG4gICAgRmxvYXQzMkFycmF5OiAnZ2V0RmxvYXQzMidcbn07XG5cbmZ1bmN0aW9uIGNvcHlGcm9tQnVmZmVyIChzb3VyY2VBcnJheUJ1ZmZlciwgdmlld1R5cGUsIHBvc2l0aW9uLCBsZW5ndGgsIGZyb21CaWdFbmRpYW4pIHtcbiAgICB2YXIgYnl0ZXNQZXJFbGVtZW50ID0gdmlld1R5cGUuQllURVNfUEVSX0VMRU1FTlQsXG4gICAgICAgIHJlc3VsdDtcblxuICAgIGlmIChmcm9tQmlnRW5kaWFuID09PSBpc0JpZ0VuZGlhblBsYXRmb3JtKCkgfHwgYnl0ZXNQZXJFbGVtZW50ID09PSAxKSB7XG4gICAgICAgIHJlc3VsdCA9IG5ldyB2aWV3VHlwZShzb3VyY2VBcnJheUJ1ZmZlciwgcG9zaXRpb24sIGxlbmd0aCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIHJlYWRWaWV3ID0gbmV3IERhdGFWaWV3KHNvdXJjZUFycmF5QnVmZmVyLCBwb3NpdGlvbiwgbGVuZ3RoICogYnl0ZXNQZXJFbGVtZW50KSxcbiAgICAgICAgICAgIGdldE1ldGhvZCA9IGdldE1ldGhvZHNbdmlld1R5cGUubmFtZV0sXG4gICAgICAgICAgICBsaXR0bGVFbmRpYW4gPSAhZnJvbUJpZ0VuZGlhbjtcblxuICAgICAgICByZXN1bHQgPSBuZXcgdmlld1R5cGUobGVuZ3RoKTtcblxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICByZXN1bHRbaV0gPSByZWFkVmlld1tnZXRNZXRob2RdKGkgKiBieXRlc1BlckVsZW1lbnQsIGxpdHRsZUVuZGlhbik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiBkZWNvZGUgKGJ1ZmZlciwgb2Zmc2V0KSB7XG4gICAgb2Zmc2V0ID0gb2Zmc2V0IHx8IDA7XG5cbiAgICB2YXIgYXJyYXkgPSBuZXcgVWludDhBcnJheShidWZmZXIsIG9mZnNldCksXG4gICAgICAgIHZlcnNpb24gPSBhcnJheVswXSxcbiAgICAgICAgZmxhZ3MgPSBhcnJheVsxXSxcbiAgICAgICAgaW5kZXhlZEdlb21ldHJ5ID0gISEoZmxhZ3MgPj4gNyksXG4gICAgICAgIGluZGljZXNUeXBlID0gZmxhZ3MgPj4gNiAmIDB4MDEsXG4gICAgICAgIGJpZ0VuZGlhbiA9IChmbGFncyA+PiA1ICYgMHgwMSkgPT09IDEsXG4gICAgICAgIGF0dHJpYnV0ZXNOdW1iZXIgPSBmbGFncyAmIDB4MUYsXG4gICAgICAgIHZhbHVlc051bWJlciA9IDAsXG4gICAgICAgIGluZGljZXNOdW1iZXIgPSAwO1xuXG4gICAgaWYgKGJpZ0VuZGlhbikge1xuICAgICAgICB2YWx1ZXNOdW1iZXIgPSAoYXJyYXlbMl0gPDwgMTYpICsgKGFycmF5WzNdIDw8IDgpICsgYXJyYXlbNF07XG4gICAgICAgIGluZGljZXNOdW1iZXIgPSAoYXJyYXlbNV0gPDwgMTYpICsgKGFycmF5WzZdIDw8IDgpICsgYXJyYXlbN107XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdmFsdWVzTnVtYmVyID0gYXJyYXlbMl0gKyAoYXJyYXlbM10gPDwgOCkgKyAoYXJyYXlbNF0gPDwgMTYpO1xuICAgICAgICBpbmRpY2VzTnVtYmVyID0gYXJyYXlbNV0gKyAoYXJyYXlbNl0gPDwgOCkgKyAoYXJyYXlbN10gPDwgMTYpO1xuICAgIH1cblxuICAgIC8qKiBQUkVMSU1JTkFSWSBDSEVDS1MgKiovXG5cbiAgICBpZiAob2Zmc2V0IC8gNCAlIDEgIT09IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdQUldNIGRlY29kZXI6IE9mZnNldCBzaG91bGQgYmUgYSBtdWx0aXBsZSBvZiA0LCByZWNlaXZlZCAnICsgb2Zmc2V0KTtcbiAgICB9XG5cbiAgICBpZiAodmVyc2lvbiA9PT0gMCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BSV00gZGVjb2RlcjogSW52YWxpZCBmb3JtYXQgdmVyc2lvbjogMCcpO1xuICAgIH0gZWxzZSBpZiAodmVyc2lvbiAhPT0gMSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BSV00gZGVjb2RlcjogVW5zdXBwb3J0ZWQgZm9ybWF0IHZlcnNpb246ICcgKyB2ZXJzaW9uKTtcbiAgICB9XG5cbiAgICBpZiAoIWluZGV4ZWRHZW9tZXRyeSkge1xuICAgICAgICBpZiAoaW5kaWNlc1R5cGUgIT09IDApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignUFJXTSBkZWNvZGVyOiBJbmRpY2VzIHR5cGUgbXVzdCBiZSBzZXQgdG8gMCBmb3Igbm9uLWluZGV4ZWQgZ2VvbWV0cmllcycpO1xuICAgICAgICB9IGVsc2UgaWYgKGluZGljZXNOdW1iZXIgIT09IDApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignUFJXTSBkZWNvZGVyOiBOdW1iZXIgb2YgaW5kaWNlcyBtdXN0IGJlIHNldCB0byAwIGZvciBub24taW5kZXhlZCBnZW9tZXRyaWVzJyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKiogUEFSU0lORyAqKi9cblxuICAgIHZhciBwb3MgPSA4O1xuXG4gICAgdmFyIGF0dHJpYnV0ZXMgPSB7fSxcbiAgICAgICAgYXR0cmlidXRlTmFtZSxcbiAgICAgICAgY2hhcixcbiAgICAgICAgYXR0cmlidXRlTm9ybWFsaXplZCxcbiAgICAgICAgYXR0cmlidXRlVHlwZSxcbiAgICAgICAgY2FyZGluYWxpdHksXG4gICAgICAgIGVuY29kaW5nVHlwZSxcbiAgICAgICAgYXJyYXlUeXBlLFxuICAgICAgICB2YWx1ZXMsXG4gICAgICAgIGk7XG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgYXR0cmlidXRlc051bWJlcjsgaSsrKSB7XG4gICAgICAgIGF0dHJpYnV0ZU5hbWUgPSAnJztcblxuICAgICAgICB3aGlsZSAocG9zIDwgYXJyYXkubGVuZ3RoKSB7XG4gICAgICAgICAgICBjaGFyID0gYXJyYXlbcG9zXTtcbiAgICAgICAgICAgIHBvcysrO1xuXG4gICAgICAgICAgICBpZiAoY2hhciA9PT0gMCkge1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBhdHRyaWJ1dGVOYW1lICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoY2hhcik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmbGFncyA9IGFycmF5W3Bvc107XG5cbiAgICAgICAgYXR0cmlidXRlVHlwZSA9IGZsYWdzID4+IDcgJiAweDAxO1xuICAgICAgICBhdHRyaWJ1dGVOb3JtYWxpemVkID0gISEoZmxhZ3MgPj4gNiAmIDB4MDEpO1xuICAgICAgICBjYXJkaW5hbGl0eSA9IChmbGFncyA+PiA0ICYgMHgwMykgKyAxO1xuICAgICAgICBlbmNvZGluZ1R5cGUgPSBmbGFncyAmIDB4MEY7XG4gICAgICAgIGFycmF5VHlwZSA9IEludmVydGVkRW5jb2RpbmdUeXBlc1tlbmNvZGluZ1R5cGVdO1xuXG4gICAgICAgIHBvcysrO1xuXG4gICAgICAgIC8vIHBhZGRpbmcgdG8gbmV4dCBtdWx0aXBsZSBvZiA0XG4gICAgICAgIHBvcyA9IE1hdGguY2VpbChwb3MgLyA0KSAqIDQ7XG5cbiAgICAgICAgdmFsdWVzID0gY29weUZyb21CdWZmZXIoYnVmZmVyLCBhcnJheVR5cGUsIHBvcyArIG9mZnNldCwgY2FyZGluYWxpdHkgKiB2YWx1ZXNOdW1iZXIsIGJpZ0VuZGlhbik7XG5cbiAgICAgICAgcG9zKz0gYXJyYXlUeXBlLkJZVEVTX1BFUl9FTEVNRU5UICogY2FyZGluYWxpdHkgKiB2YWx1ZXNOdW1iZXI7XG5cbiAgICAgICAgYXR0cmlidXRlc1thdHRyaWJ1dGVOYW1lXSA9IHtcbiAgICAgICAgICAgIHR5cGU6IGF0dHJpYnV0ZVR5cGUsXG4gICAgICAgICAgICBub3JtYWxpemVkOiBhdHRyaWJ1dGVOb3JtYWxpemVkLFxuICAgICAgICAgICAgY2FyZGluYWxpdHk6IGNhcmRpbmFsaXR5LFxuICAgICAgICAgICAgdmFsdWVzOiB2YWx1ZXNcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBwb3MgPSBNYXRoLmNlaWwocG9zIC8gNCkgKiA0O1xuXG4gICAgdmFyIGluZGljZXMgPSBudWxsO1xuXG4gICAgaWYgKGluZGV4ZWRHZW9tZXRyeSkge1xuICAgICAgICBpbmRpY2VzID0gY29weUZyb21CdWZmZXIoXG4gICAgICAgICAgICBidWZmZXIsXG4gICAgICAgICAgICBpbmRpY2VzVHlwZSA9PT0gMSA/IFVpbnQzMkFycmF5IDogVWludDE2QXJyYXksXG4gICAgICAgICAgICBwb3MgKyBvZmZzZXQsXG4gICAgICAgICAgICBpbmRpY2VzTnVtYmVyLFxuICAgICAgICAgICAgYmlnRW5kaWFuXG4gICAgICAgICk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgdmVyc2lvbjogdmVyc2lvbixcbiAgICAgICAgYmlnRW5kaWFuOiBiaWdFbmRpYW4sXG4gICAgICAgIGF0dHJpYnV0ZXM6IGF0dHJpYnV0ZXMsXG4gICAgICAgIGluZGljZXM6IGluZGljZXNcbiAgICB9O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGRlY29kZTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgaXNCaWdFbmRpYW5QbGF0Zm9ybSA9IHJlcXVpcmUoJy4uL3V0aWxzL2lzLWJpZy1lbmRpYW4tcGxhdGZvcm0nKSxcbiAgICBhdHRyaWJ1dGVUeXBlcyA9IHJlcXVpcmUoJy4vYXR0cmlidXRlLXR5cGVzJyk7XG5cbi8vIG1hdGNoIHRoZSBUeXBlZEFycmF5IHR5cGUgd2l0aCB0aGUgdmFsdWUgZGVmaW5lZCBpbiB0aGUgc3BlY1xudmFyIEVuY29kaW5nVHlwZXMgPSB7XG4gICAgRmxvYXQzMkFycmF5OiAxLFxuICAgIEludDhBcnJheTogMyxcbiAgICBJbnQxNkFycmF5OiA0LFxuICAgIEludDMyQXJyYXk6IDYsXG4gICAgVWludDhBcnJheTogNyxcbiAgICBVaW50MTZBcnJheTogOCxcbiAgICBVaW50MzJBcnJheTogMTBcbn07XG5cbi8vIGRlZmluZSB0aGUgbWV0aG9kIHRvIHVzZSBvbiBhIERhdGFWaWV3LCBjb3JyZXNwb25kaW5nIHRoZSBUeXBlZEFycmF5IHR5cGVcbnZhciBzZXRNZXRob2RzID0ge1xuICAgIFVpbnQxNkFycmF5OiAnc2V0VWludDE2JyxcbiAgICBVaW50MzJBcnJheTogJ3NldFVpbnQzMicsXG4gICAgSW50MTZBcnJheTogJ3NldEludDE2JyxcbiAgICBJbnQzMkFycmF5OiAnc2V0SW50MzInLFxuICAgIEZsb2F0MzJBcnJheTogJ3NldEZsb2F0MzInXG59O1xuXG5mdW5jdGlvbiBjb3B5VG9CdWZmZXIgKHNvdXJjZVR5cGVkQXJyYXksIGRlc3RpbmF0aW9uQXJyYXlCdWZmZXIsIHBvc2l0aW9uLCBiaWdFbmRpYW4pIHtcbiAgICB2YXIgbGVuZ3RoID0gc291cmNlVHlwZWRBcnJheS5sZW5ndGgsXG4gICAgICAgIGJ5dGVzUGVyRWxlbWVudCA9IHNvdXJjZVR5cGVkQXJyYXkuQllURVNfUEVSX0VMRU1FTlQ7XG5cbiAgICB2YXIgd3JpdGVBcnJheSA9IG5ldyBzb3VyY2VUeXBlZEFycmF5LmNvbnN0cnVjdG9yKGRlc3RpbmF0aW9uQXJyYXlCdWZmZXIsIHBvc2l0aW9uLCBsZW5ndGgpO1xuXG4gICAgaWYgKGJpZ0VuZGlhbiA9PT0gaXNCaWdFbmRpYW5QbGF0Zm9ybSgpIHx8IGJ5dGVzUGVyRWxlbWVudCA9PT0gMSkge1xuICAgICAgICAvLyBkZXNpcmVkIGVuZGlhbm5lc3MgaXMgdGhlIHNhbWUgYXMgdGhlIHBsYXRmb3JtLCBvciB0aGUgZW5kaWFubmVzcyBkb2Vzbid0IG1hdHRlciAoMSBieXRlKVxuICAgICAgICB3cml0ZUFycmF5LnNldChzb3VyY2VUeXBlZEFycmF5LnN1YmFycmF5KDAsIGxlbmd0aCkpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciB3cml0ZVZpZXcgPSBuZXcgRGF0YVZpZXcoZGVzdGluYXRpb25BcnJheUJ1ZmZlciwgcG9zaXRpb24sIGxlbmd0aCAqIGJ5dGVzUGVyRWxlbWVudCksXG4gICAgICAgICAgICBzZXRNZXRob2QgPSBzZXRNZXRob2RzW3NvdXJjZVR5cGVkQXJyYXkuY29uc3RydWN0b3IubmFtZV0sXG4gICAgICAgICAgICBsaXR0bGVFbmRpYW4gPSAhYmlnRW5kaWFuLFxuICAgICAgICAgICAgaSA9IDA7XG5cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB3cml0ZVZpZXdbc2V0TWV0aG9kXShpICogYnl0ZXNQZXJFbGVtZW50LCBzb3VyY2VUeXBlZEFycmF5W2ldLCBsaXR0bGVFbmRpYW4pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHdyaXRlQXJyYXk7XG59XG5cbmZ1bmN0aW9uIGVuY29kZSAoYXR0cmlidXRlcywgaW5kaWNlcywgYmlnRW5kaWFuKSB7XG4gICAgdmFyIGF0dHJpYnV0ZUtleXMgPSBhdHRyaWJ1dGVzID8gT2JqZWN0LmtleXMoYXR0cmlidXRlcykgOiBbXSxcbiAgICAgICAgaW5kZXhlZEdlb21ldHJ5ID0gISFpbmRpY2VzLFxuICAgICAgICBpLCBqO1xuXG4gICAgLyoqIFBSRUxJTUlOQVJZIENIRUNLUyAqKi9cblxuICAgIC8vIHRoaXMgaXMgbm90IHN1cHBvc2VkIHRvIGNhdGNoIGFsbCB0aGUgcG9zc2libGUgZXJyb3JzLCBvbmx5IHNvbWUgb2YgdGhlIGdvdGNoYXNcblxuICAgIGlmIChhdHRyaWJ1dGVLZXlzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BSV00gZW5jb2RlcjogVGhlIG1vZGVsIG11c3QgaGF2ZSBhdCBsZWFzdCBvbmUgYXR0cmlidXRlJyk7XG4gICAgfVxuXG4gICAgaWYgKGF0dHJpYnV0ZUtleXMubGVuZ3RoID4gMzEpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdQUldNIGVuY29kZXI6IFRoZSBtb2RlbCBjYW4gaGF2ZSBhdCBtb3N0IDMxIGF0dHJpYnV0ZXMnKTtcbiAgICB9XG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgYXR0cmlidXRlS2V5cy5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAoIUVuY29kaW5nVHlwZXMuaGFzT3duUHJvcGVydHkoYXR0cmlidXRlc1thdHRyaWJ1dGVLZXlzW2ldXS52YWx1ZXMuY29uc3RydWN0b3IubmFtZSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignUFJXTSBlbmNvZGVyOiBVbnN1cHBvcnRlZCBhdHRyaWJ1dGUgdmFsdWVzIHR5cGU6ICcgKyBhdHRyaWJ1dGVzW2F0dHJpYnV0ZUtleXNbaV1dLnZhbHVlcy5jb25zdHJ1Y3Rvci5uYW1lKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmIChpbmRleGVkR2VvbWV0cnkgJiYgaW5kaWNlcy5jb25zdHJ1Y3Rvci5uYW1lICE9PSAnVWludDE2QXJyYXknICYmIGluZGljZXMuY29uc3RydWN0b3IubmFtZSAhPT0gJ1VpbnQzMkFycmF5Jykge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BSV00gZW5jb2RlcjogVGhlIGluZGljZXMgbXVzdCBiZSByZXByZXNlbnRlZCBhcyBhbiBVaW50MTZBcnJheSBvciBhbiBVaW50MzJBcnJheScpO1xuICAgIH1cblxuICAgIC8qKiBHRVQgVEhFIFRZUEUgT0YgSU5ESUNFUyBBUyBXRUxMIEFTIFRIRSBOVU1CRVIgT0YgSU5ESUNFUyBBTkQgQVRUUklCVVRFIFZBTFVFUyAqKi9cblxuICAgIHZhciB2YWx1ZXNOdW1iZXIgPSBhdHRyaWJ1dGVzW2F0dHJpYnV0ZUtleXNbMF1dLnZhbHVlcy5sZW5ndGggLyBhdHRyaWJ1dGVzW2F0dHJpYnV0ZUtleXNbMF1dLmNhcmRpbmFsaXR5IHwgMCxcbiAgICAgICAgaW5kaWNlc051bWJlciA9IGluZGV4ZWRHZW9tZXRyeSA/IGluZGljZXMubGVuZ3RoIDogMCxcbiAgICAgICAgaW5kaWNlc1R5cGUgPSBpbmRleGVkR2VvbWV0cnkgJiYgaW5kaWNlcy5jb25zdHJ1Y3Rvci5uYW1lID09PSAnVWludDMyQXJyYXknID8gMSA6IDA7XG5cbiAgICAvKiogR0VUIFRIRSBGSUxFIExFTkdUSCAqKi9cblxuICAgIHZhciB0b3RhbExlbmd0aCA9IDgsXG4gICAgICAgIGF0dHJpYnV0ZUtleSxcbiAgICAgICAgYXR0cmlidXRlLFxuICAgICAgICBhdHRyaWJ1dGVUeXBlLFxuICAgICAgICBhdHRyaWJ1dGVOb3JtYWxpemVkO1xuXG4gICAgZm9yIChpID0gMDsgaSA8IGF0dHJpYnV0ZUtleXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgYXR0cmlidXRlS2V5ID0gYXR0cmlidXRlS2V5c1tpXTtcbiAgICAgICAgYXR0cmlidXRlID0gYXR0cmlidXRlc1thdHRyaWJ1dGVLZXldO1xuICAgICAgICB0b3RhbExlbmd0aCArPSBhdHRyaWJ1dGVLZXkubGVuZ3RoICsgMjsgLy8gTlVMIGJ5dGUgKyBmbGFnIGJ5dGUgKyBwYWRkaW5nXG4gICAgICAgIHRvdGFsTGVuZ3RoID0gTWF0aC5jZWlsKHRvdGFsTGVuZ3RoIC8gNCkgKiA0OyAvLyBwYWRkaW5nXG4gICAgICAgIHRvdGFsTGVuZ3RoICs9IGF0dHJpYnV0ZS52YWx1ZXMuYnl0ZUxlbmd0aDtcbiAgICB9XG5cbiAgICBpZiAoaW5kZXhlZEdlb21ldHJ5KSB7XG4gICAgICAgIHRvdGFsTGVuZ3RoID0gTWF0aC5jZWlsKHRvdGFsTGVuZ3RoIC8gNCkgKiA0O1xuICAgICAgICB0b3RhbExlbmd0aCArPSBpbmRpY2VzLmJ5dGVMZW5ndGg7XG4gICAgfVxuXG4gICAgLyoqIElOSVRJQUxJWkUgVEhFIEJVRkZFUiAqL1xuXG4gICAgdmFyIGJ1ZmZlciA9IG5ldyBBcnJheUJ1ZmZlcih0b3RhbExlbmd0aCksXG4gICAgICAgIGFycmF5ID0gbmV3IFVpbnQ4QXJyYXkoYnVmZmVyKTtcblxuICAgIC8qKiBIRUFERVIgKiovXG5cbiAgICBhcnJheVswXSA9IDE7XG4gICAgYXJyYXlbMV0gPSAoXG4gICAgICAgIGluZGV4ZWRHZW9tZXRyeSA8PCA3IHxcbiAgICAgICAgaW5kaWNlc1R5cGUgPDwgNiB8XG4gICAgICAgIChiaWdFbmRpYW4gPyAxIDogMCkgPDwgNSB8XG4gICAgICAgIGF0dHJpYnV0ZUtleXMubGVuZ3RoICYgMHgxRlxuICAgICk7XG5cbiAgICBpZiAoYmlnRW5kaWFuKSB7XG4gICAgICAgIGFycmF5WzJdID0gdmFsdWVzTnVtYmVyID4+IDE2ICYgMHhGRjtcbiAgICAgICAgYXJyYXlbM10gPSB2YWx1ZXNOdW1iZXIgPj4gOCAmIDB4RkY7XG4gICAgICAgIGFycmF5WzRdID0gdmFsdWVzTnVtYmVyICYgMHhGRjtcblxuICAgICAgICBhcnJheVs1XSA9IGluZGljZXNOdW1iZXIgPj4gMTYgJiAweEZGO1xuICAgICAgICBhcnJheVs2XSA9IGluZGljZXNOdW1iZXIgPj4gOCAmIDB4RkY7XG4gICAgICAgIGFycmF5WzddID0gaW5kaWNlc051bWJlciAmIDB4RkY7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgYXJyYXlbMl0gPSB2YWx1ZXNOdW1iZXIgJiAweEZGO1xuICAgICAgICBhcnJheVszXSA9IHZhbHVlc051bWJlciA+PiA4ICYgMHhGRjtcbiAgICAgICAgYXJyYXlbNF0gPSB2YWx1ZXNOdW1iZXIgPj4gMTYgJiAweEZGO1xuXG4gICAgICAgIGFycmF5WzVdID0gaW5kaWNlc051bWJlciAmIDB4RkY7XG4gICAgICAgIGFycmF5WzZdID0gaW5kaWNlc051bWJlciA+PiA4ICYgMHhGRjtcbiAgICAgICAgYXJyYXlbN10gPSBpbmRpY2VzTnVtYmVyID4+IDE2ICYgMHhGRjtcbiAgICB9XG5cblxuICAgIHZhciBwb3MgPSA4O1xuXG4gICAgLyoqIEFUVFJJQlVURVMgKiovXG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgYXR0cmlidXRlS2V5cy5sZW5ndGg7IGkrKykge1xuICAgICAgICBhdHRyaWJ1dGVLZXkgPSBhdHRyaWJ1dGVLZXlzW2ldO1xuICAgICAgICBhdHRyaWJ1dGUgPSBhdHRyaWJ1dGVzW2F0dHJpYnV0ZUtleV07XG4gICAgICAgIGF0dHJpYnV0ZVR5cGUgPSB0eXBlb2YgYXR0cmlidXRlLnR5cGUgPT09ICd1bmRlZmluZWQnID8gYXR0cmlidXRlVHlwZXMuRmxvYXQgOiBhdHRyaWJ1dGUudHlwZTtcbiAgICAgICAgYXR0cmlidXRlTm9ybWFsaXplZCA9ICghIWF0dHJpYnV0ZS5ub3JtYWxpemVkID8gMSA6IDApO1xuXG4gICAgICAgIC8qKiogV1JJVEUgQVRUUklCVVRFIEhFQURFUiAqKiovXG5cbiAgICAgICAgZm9yIChqID0gMDsgaiA8IGF0dHJpYnV0ZUtleS5sZW5ndGg7IGorKywgcG9zKyspIHtcbiAgICAgICAgICAgIGFycmF5W3Bvc10gPSAoYXR0cmlidXRlS2V5LmNoYXJDb2RlQXQoaikgJiAweDdGKSB8fCAweDVGOyAvLyBkZWZhdWx0IHRvIHVuZGVyc2NvcmVcbiAgICAgICAgfVxuXG4gICAgICAgIHBvcysrO1xuXG4gICAgICAgIGFycmF5W3Bvc10gPSAoXG4gICAgICAgICAgICBhdHRyaWJ1dGVUeXBlIDw8IDcgfFxuICAgICAgICAgICAgYXR0cmlidXRlTm9ybWFsaXplZCA8PCA2IHxcbiAgICAgICAgICAgICgoYXR0cmlidXRlLmNhcmRpbmFsaXR5IC0gMSkgJiAweDAzKSA8PCA0IHxcbiAgICAgICAgICAgIEVuY29kaW5nVHlwZXNbYXR0cmlidXRlLnZhbHVlcy5jb25zdHJ1Y3Rvci5uYW1lXSAmIDB4MEZcbiAgICAgICAgKTtcblxuICAgICAgICBwb3MrKztcblxuXG4gICAgICAgIC8vIHBhZGRpbmcgdG8gbmV4dCBtdWx0aXBsZSBvZiA0XG4gICAgICAgIHBvcyA9IE1hdGguY2VpbChwb3MgLyA0KSAqIDQ7XG5cbiAgICAgICAgLyoqKiBXUklURSBBVFRSSUJVVEUgVkFMVUVTICoqKi9cblxuICAgICAgICB2YXIgYXR0cmlidXRlc1dyaXRlQXJyYXkgPSBjb3B5VG9CdWZmZXIoYXR0cmlidXRlLnZhbHVlcywgYnVmZmVyLCBwb3MsIGJpZ0VuZGlhbik7XG5cbiAgICAgICAgcG9zICs9IGF0dHJpYnV0ZXNXcml0ZUFycmF5LmJ5dGVMZW5ndGg7XG4gICAgfVxuXG4gICAgLyoqKiBXUklURSBJTkRJQ0VTIFZBTFVFUyAqKiovXG5cbiAgICBpZiAoaW5kZXhlZEdlb21ldHJ5KSB7XG4gICAgICAgIHBvcyA9IE1hdGguY2VpbChwb3MgLyA0KSAqIDQ7XG5cbiAgICAgICAgY29weVRvQnVmZmVyKGluZGljZXMsIGJ1ZmZlciwgcG9zLCBiaWdFbmRpYW4pO1xuICAgIH1cblxuICAgIHJldHVybiBidWZmZXI7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZW5jb2RlO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBiaWdFbmRpYW5QbGF0Zm9ybSA9IG51bGw7XG5cbi8qKlxuICogQ2hlY2sgaWYgdGhlIGVuZGlhbm5lc3Mgb2YgdGhlIHBsYXRmb3JtIGlzIGJpZy1lbmRpYW4gKG1vc3Qgc2lnbmlmaWNhbnQgYml0IGZpcnN0KVxuICogQHJldHVybnMge2Jvb2xlYW59IFRydWUgaWYgYmlnLWVuZGlhbiwgZmFsc2UgaWYgbGl0dGxlLWVuZGlhblxuICovXG5mdW5jdGlvbiBpc0JpZ0VuZGlhblBsYXRmb3JtICgpIHtcbiAgICBpZiAoYmlnRW5kaWFuUGxhdGZvcm0gPT09IG51bGwpIHtcbiAgICAgICAgdmFyIGJ1ZmZlciA9IG5ldyBBcnJheUJ1ZmZlcigyKSxcbiAgICAgICAgICAgIHVpbnQ4QXJyYXkgPSBuZXcgVWludDhBcnJheShidWZmZXIpLFxuICAgICAgICAgICAgdWludDE2QXJyYXkgPSBuZXcgVWludDE2QXJyYXkoYnVmZmVyKTtcblxuICAgICAgICB1aW50OEFycmF5WzBdID0gMHhBQTsgLy8gc2V0IGZpcnN0IGJ5dGVcbiAgICAgICAgdWludDhBcnJheVsxXSA9IDB4QkI7IC8vIHNldCBzZWNvbmQgYnl0ZVxuICAgICAgICBiaWdFbmRpYW5QbGF0Zm9ybSA9ICh1aW50MTZBcnJheVswXSA9PT0gMHhBQUJCKTtcbiAgICB9XG5cbiAgICByZXR1cm4gYmlnRW5kaWFuUGxhdGZvcm07XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaXNCaWdFbmRpYW5QbGF0Zm9ybTtcbiJdfQ==
