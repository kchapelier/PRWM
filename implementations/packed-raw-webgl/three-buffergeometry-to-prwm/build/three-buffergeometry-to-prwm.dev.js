!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.threeBuffergeometryToPrwm=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";

module.exports = {
    AttributeTypes: require('./prwm/attribute-types'),
    isBigEndianPlatform: require('./utils/is-big-endian-platform'),
    encode: require('./prwm/encode'),
    decode: require('./prwm/decode')
};

},{"./prwm/attribute-types":2,"./prwm/decode":3,"./prwm/encode":4,"./utils/is-big-endian-platform":6}],2:[function(require,module,exports){
"use strict";

module.exports = {
    Int: 0,
    Uint: 1,
    Float: 2
};

},{}],3:[function(require,module,exports){
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

function decode (buffer) {
    var array = new Uint8Array(buffer),
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

    var pos = 8;

    var attributes = {},
        attributeName,
        char,
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

        attributeType = flags >> 6 & 0x03;
        cardinality = (flags >> 4 & 0x03) + 1;
        encodingType = flags & 0x0F;
        arrayType = InvertedEncodingTypes[encodingType];

        pos++;

        // padding to next multiple of 4
        pos = Math.ceil(pos / 4) * 4;

        values = copyFromBuffer(buffer, arrayType, pos, cardinality * valuesNumber, bigEndian);

        pos+= arrayType.BYTES_PER_ELEMENT * cardinality * valuesNumber;

        attributes[attributeName] = {
            type: attributeType,
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
            pos,
            indicesNumber,
            bigEndian
        );
    }

    return {
        version: version,
        attributes: attributes,
        indices: indices
    };
}

module.exports = decode;

},{"../utils/is-big-endian-platform":6}],4:[function(require,module,exports){
"use strict";

var isBigEndianPlatform = require('../utils/is-big-endian-platform'),
    inferAttributeType = require('../utils/infer-attribute-type');

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
        indexedGeometry = !!indices;

    /** PRELIMINARY CHECKS **/

    // this is not supposed to catch all the possible errors, only some of the gotchas

    if (attributeKeys.length === 0) {
        throw new Error('PRWM encoder: The model must have at least one attribute');
    }

    if (attributeKeys.length > 31) {
        throw new Error('PRWM encoder: The model can have at most 31 attributes');
    }

    for (var i = 0; i < attributeKeys.length; i++) {
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
        i, j;

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
        attributeType = typeof attribute.type === 'undefined' ? inferAttributeType(attribute.values) : attribute.type;

        /*** WRITE ATTRIBUTE HEADER ***/

        for (j = 0; j < attributeKey.length; j++, pos++) {
            array[pos] = (attributeKey.charCodeAt(j) & 0x7F) || 0x5F; // default to underscore
        }

        pos++;

        array[pos] = (
            (attributeType & 0x03) << 6 |
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

},{"../utils/infer-attribute-type":5,"../utils/is-big-endian-platform":6}],5:[function(require,module,exports){
"use strict";

var attributeTypes = require('../prwm/attribute-types');

var map = {
    Int8Array: attributeTypes.Int,
    Int16Array: attributeTypes.Int,
    Int32Array: attributeTypes.Int,
    Uint8Array: attributeTypes.Uint,
    Uint16Array: attributeTypes.Uint,
    Uint32Array: attributeTypes.Uint,
    Float32Array: attributeTypes.Float
};

module.exports = function inferAttributeType (typedArray) {
    return map[typedArray.constructor.name];
};

},{"../prwm/attribute-types":2}],6:[function(require,module,exports){
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

},{}],7:[function(require,module,exports){
"use strict";

var prwm = require('../prwm/');

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
            values: attribute.array
        };
    }

    if (bufferGeometry.index) {
        indices = bufferGeometry.index.array;
    }

    return prwm.encode(attributes, indices, !!bigEndian);
};

module.exports = bufferGeometryToPrwm;

},{"../prwm/":1}]},{},[7])(7)
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL3Vzci9sb2NhbC9saWIvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsIi4uL3Byd20vaW5kZXguanMiLCIuLi9wcndtL3Byd20vYXR0cmlidXRlLXR5cGVzLmpzIiwiLi4vcHJ3bS9wcndtL2RlY29kZS5qcyIsIi4uL3Byd20vcHJ3bS9lbmNvZGUuanMiLCIuLi9wcndtL3V0aWxzL2luZmVyLWF0dHJpYnV0ZS10eXBlLmpzIiwiLi4vcHJ3bS91dGlscy9pcy1iaWctZW5kaWFuLXBsYXRmb3JtLmpzIiwiaW5kZXguanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2TEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJcInVzZSBzdHJpY3RcIjtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgQXR0cmlidXRlVHlwZXM6IHJlcXVpcmUoJy4vcHJ3bS9hdHRyaWJ1dGUtdHlwZXMnKSxcbiAgICBpc0JpZ0VuZGlhblBsYXRmb3JtOiByZXF1aXJlKCcuL3V0aWxzL2lzLWJpZy1lbmRpYW4tcGxhdGZvcm0nKSxcbiAgICBlbmNvZGU6IHJlcXVpcmUoJy4vcHJ3bS9lbmNvZGUnKSxcbiAgICBkZWNvZGU6IHJlcXVpcmUoJy4vcHJ3bS9kZWNvZGUnKVxufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBJbnQ6IDAsXG4gICAgVWludDogMSxcbiAgICBGbG9hdDogMlxufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgaXNCaWdFbmRpYW5QbGF0Zm9ybSA9IHJlcXVpcmUoJy4uL3V0aWxzL2lzLWJpZy1lbmRpYW4tcGxhdGZvcm0nKTtcblxuLy8gbWF0Y2ggdGhlIHZhbHVlcyBkZWZpbmVkIGluIHRoZSBzcGVjIHRvIHRoZSBUeXBlZEFycmF5IHR5cGVzXG52YXIgSW52ZXJ0ZWRFbmNvZGluZ1R5cGVzID0gW1xuICAgIG51bGwsXG4gICAgRmxvYXQzMkFycmF5LFxuICAgIG51bGwsXG4gICAgSW50OEFycmF5LFxuICAgIEludDE2QXJyYXksXG4gICAgbnVsbCxcbiAgICBJbnQzMkFycmF5LFxuICAgIFVpbnQ4QXJyYXksXG4gICAgVWludDE2QXJyYXksXG4gICAgbnVsbCxcbiAgICBVaW50MzJBcnJheVxuXTtcblxuLy8gZGVmaW5lIHRoZSBtZXRob2QgdG8gdXNlIG9uIGEgRGF0YVZpZXcsIGNvcnJlc3BvbmRpbmcgdGhlIFR5cGVkQXJyYXkgdHlwZVxudmFyIGdldE1ldGhvZHMgPSB7XG4gICAgVWludDE2QXJyYXk6ICdnZXRVaW50MTYnLFxuICAgIFVpbnQzMkFycmF5OiAnZ2V0VWludDMyJyxcbiAgICBJbnQxNkFycmF5OiAnZ2V0SW50MTYnLFxuICAgIEludDMyQXJyYXk6ICdnZXRJbnQzMicsXG4gICAgRmxvYXQzMkFycmF5OiAnZ2V0RmxvYXQzMidcbn07XG5cbmZ1bmN0aW9uIGNvcHlGcm9tQnVmZmVyIChzb3VyY2VBcnJheUJ1ZmZlciwgdmlld1R5cGUsIHBvc2l0aW9uLCBsZW5ndGgsIGZyb21CaWdFbmRpYW4pIHtcbiAgICB2YXIgYnl0ZXNQZXJFbGVtZW50ID0gdmlld1R5cGUuQllURVNfUEVSX0VMRU1FTlQsXG4gICAgICAgIHJlc3VsdDtcblxuICAgIGlmIChmcm9tQmlnRW5kaWFuID09PSBpc0JpZ0VuZGlhblBsYXRmb3JtKCkgfHwgYnl0ZXNQZXJFbGVtZW50ID09PSAxKSB7XG4gICAgICAgIHJlc3VsdCA9IG5ldyB2aWV3VHlwZShzb3VyY2VBcnJheUJ1ZmZlciwgcG9zaXRpb24sIGxlbmd0aCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIHJlYWRWaWV3ID0gbmV3IERhdGFWaWV3KHNvdXJjZUFycmF5QnVmZmVyLCBwb3NpdGlvbiwgbGVuZ3RoICogYnl0ZXNQZXJFbGVtZW50KSxcbiAgICAgICAgICAgIGdldE1ldGhvZCA9IGdldE1ldGhvZHNbdmlld1R5cGUubmFtZV0sXG4gICAgICAgICAgICBsaXR0bGVFbmRpYW4gPSAhZnJvbUJpZ0VuZGlhbjtcblxuICAgICAgICByZXN1bHQgPSBuZXcgdmlld1R5cGUobGVuZ3RoKTtcblxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICByZXN1bHRbaV0gPSByZWFkVmlld1tnZXRNZXRob2RdKGkgKiBieXRlc1BlckVsZW1lbnQsIGxpdHRsZUVuZGlhbik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiBkZWNvZGUgKGJ1ZmZlcikge1xuICAgIHZhciBhcnJheSA9IG5ldyBVaW50OEFycmF5KGJ1ZmZlciksXG4gICAgICAgIHZlcnNpb24gPSBhcnJheVswXSxcbiAgICAgICAgZmxhZ3MgPSBhcnJheVsxXSxcbiAgICAgICAgaW5kZXhlZEdlb21ldHJ5ID0gISEoZmxhZ3MgPj4gNyksXG4gICAgICAgIGluZGljZXNUeXBlID0gZmxhZ3MgPj4gNiAmIDB4MDEsXG4gICAgICAgIGJpZ0VuZGlhbiA9IChmbGFncyA+PiA1ICYgMHgwMSkgPT09IDEsXG4gICAgICAgIGF0dHJpYnV0ZXNOdW1iZXIgPSBmbGFncyAmIDB4MUYsXG4gICAgICAgIHZhbHVlc051bWJlciA9IDAsXG4gICAgICAgIGluZGljZXNOdW1iZXIgPSAwO1xuXG4gICAgaWYgKGJpZ0VuZGlhbikge1xuICAgICAgICB2YWx1ZXNOdW1iZXIgPSAoYXJyYXlbMl0gPDwgMTYpICsgKGFycmF5WzNdIDw8IDgpICsgYXJyYXlbNF07XG4gICAgICAgIGluZGljZXNOdW1iZXIgPSAoYXJyYXlbNV0gPDwgMTYpICsgKGFycmF5WzZdIDw8IDgpICsgYXJyYXlbN107XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdmFsdWVzTnVtYmVyID0gYXJyYXlbMl0gKyAoYXJyYXlbM10gPDwgOCkgKyAoYXJyYXlbNF0gPDwgMTYpO1xuICAgICAgICBpbmRpY2VzTnVtYmVyID0gYXJyYXlbNV0gKyAoYXJyYXlbNl0gPDwgOCkgKyAoYXJyYXlbN10gPDwgMTYpO1xuICAgIH1cblxuICAgIHZhciBwb3MgPSA4O1xuXG4gICAgdmFyIGF0dHJpYnV0ZXMgPSB7fSxcbiAgICAgICAgYXR0cmlidXRlTmFtZSxcbiAgICAgICAgY2hhcixcbiAgICAgICAgYXR0cmlidXRlVHlwZSxcbiAgICAgICAgY2FyZGluYWxpdHksXG4gICAgICAgIGVuY29kaW5nVHlwZSxcbiAgICAgICAgYXJyYXlUeXBlLFxuICAgICAgICB2YWx1ZXMsXG4gICAgICAgIGk7XG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgYXR0cmlidXRlc051bWJlcjsgaSsrKSB7XG4gICAgICAgIGF0dHJpYnV0ZU5hbWUgPSAnJztcblxuICAgICAgICB3aGlsZSAocG9zIDwgYXJyYXkubGVuZ3RoKSB7XG4gICAgICAgICAgICBjaGFyID0gYXJyYXlbcG9zXTtcbiAgICAgICAgICAgIHBvcysrO1xuXG4gICAgICAgICAgICBpZiAoY2hhciA9PT0gMCkge1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBhdHRyaWJ1dGVOYW1lICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoY2hhcik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmbGFncyA9IGFycmF5W3Bvc107XG5cbiAgICAgICAgYXR0cmlidXRlVHlwZSA9IGZsYWdzID4+IDYgJiAweDAzO1xuICAgICAgICBjYXJkaW5hbGl0eSA9IChmbGFncyA+PiA0ICYgMHgwMykgKyAxO1xuICAgICAgICBlbmNvZGluZ1R5cGUgPSBmbGFncyAmIDB4MEY7XG4gICAgICAgIGFycmF5VHlwZSA9IEludmVydGVkRW5jb2RpbmdUeXBlc1tlbmNvZGluZ1R5cGVdO1xuXG4gICAgICAgIHBvcysrO1xuXG4gICAgICAgIC8vIHBhZGRpbmcgdG8gbmV4dCBtdWx0aXBsZSBvZiA0XG4gICAgICAgIHBvcyA9IE1hdGguY2VpbChwb3MgLyA0KSAqIDQ7XG5cbiAgICAgICAgdmFsdWVzID0gY29weUZyb21CdWZmZXIoYnVmZmVyLCBhcnJheVR5cGUsIHBvcywgY2FyZGluYWxpdHkgKiB2YWx1ZXNOdW1iZXIsIGJpZ0VuZGlhbik7XG5cbiAgICAgICAgcG9zKz0gYXJyYXlUeXBlLkJZVEVTX1BFUl9FTEVNRU5UICogY2FyZGluYWxpdHkgKiB2YWx1ZXNOdW1iZXI7XG5cbiAgICAgICAgYXR0cmlidXRlc1thdHRyaWJ1dGVOYW1lXSA9IHtcbiAgICAgICAgICAgIHR5cGU6IGF0dHJpYnV0ZVR5cGUsXG4gICAgICAgICAgICBjYXJkaW5hbGl0eTogY2FyZGluYWxpdHksXG4gICAgICAgICAgICB2YWx1ZXM6IHZhbHVlc1xuICAgICAgICB9O1xuICAgIH1cblxuICAgIHBvcyA9IE1hdGguY2VpbChwb3MgLyA0KSAqIDQ7XG5cbiAgICB2YXIgaW5kaWNlcyA9IG51bGw7XG5cbiAgICBpZiAoaW5kZXhlZEdlb21ldHJ5KSB7XG4gICAgICAgIGluZGljZXMgPSBjb3B5RnJvbUJ1ZmZlcihcbiAgICAgICAgICAgIGJ1ZmZlcixcbiAgICAgICAgICAgIGluZGljZXNUeXBlID09PSAxID8gVWludDMyQXJyYXkgOiBVaW50MTZBcnJheSxcbiAgICAgICAgICAgIHBvcyxcbiAgICAgICAgICAgIGluZGljZXNOdW1iZXIsXG4gICAgICAgICAgICBiaWdFbmRpYW5cbiAgICAgICAgKTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICB2ZXJzaW9uOiB2ZXJzaW9uLFxuICAgICAgICBhdHRyaWJ1dGVzOiBhdHRyaWJ1dGVzLFxuICAgICAgICBpbmRpY2VzOiBpbmRpY2VzXG4gICAgfTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBkZWNvZGU7XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIGlzQmlnRW5kaWFuUGxhdGZvcm0gPSByZXF1aXJlKCcuLi91dGlscy9pcy1iaWctZW5kaWFuLXBsYXRmb3JtJyksXG4gICAgaW5mZXJBdHRyaWJ1dGVUeXBlID0gcmVxdWlyZSgnLi4vdXRpbHMvaW5mZXItYXR0cmlidXRlLXR5cGUnKTtcblxuLy8gbWF0Y2ggdGhlIFR5cGVkQXJyYXkgdHlwZSB3aXRoIHRoZSB2YWx1ZSBkZWZpbmVkIGluIHRoZSBzcGVjXG52YXIgRW5jb2RpbmdUeXBlcyA9IHtcbiAgICBGbG9hdDMyQXJyYXk6IDEsXG4gICAgSW50OEFycmF5OiAzLFxuICAgIEludDE2QXJyYXk6IDQsXG4gICAgSW50MzJBcnJheTogNixcbiAgICBVaW50OEFycmF5OiA3LFxuICAgIFVpbnQxNkFycmF5OiA4LFxuICAgIFVpbnQzMkFycmF5OiAxMFxufTtcblxuLy8gZGVmaW5lIHRoZSBtZXRob2QgdG8gdXNlIG9uIGEgRGF0YVZpZXcsIGNvcnJlc3BvbmRpbmcgdGhlIFR5cGVkQXJyYXkgdHlwZVxudmFyIHNldE1ldGhvZHMgPSB7XG4gICAgVWludDE2QXJyYXk6ICdzZXRVaW50MTYnLFxuICAgIFVpbnQzMkFycmF5OiAnc2V0VWludDMyJyxcbiAgICBJbnQxNkFycmF5OiAnc2V0SW50MTYnLFxuICAgIEludDMyQXJyYXk6ICdzZXRJbnQzMicsXG4gICAgRmxvYXQzMkFycmF5OiAnc2V0RmxvYXQzMidcbn07XG5cbmZ1bmN0aW9uIGNvcHlUb0J1ZmZlciAoc291cmNlVHlwZWRBcnJheSwgZGVzdGluYXRpb25BcnJheUJ1ZmZlciwgcG9zaXRpb24sIGJpZ0VuZGlhbikge1xuICAgIHZhciBsZW5ndGggPSBzb3VyY2VUeXBlZEFycmF5Lmxlbmd0aCxcbiAgICAgICAgYnl0ZXNQZXJFbGVtZW50ID0gc291cmNlVHlwZWRBcnJheS5CWVRFU19QRVJfRUxFTUVOVDtcblxuICAgIHZhciB3cml0ZUFycmF5ID0gbmV3IHNvdXJjZVR5cGVkQXJyYXkuY29uc3RydWN0b3IoZGVzdGluYXRpb25BcnJheUJ1ZmZlciwgcG9zaXRpb24sIGxlbmd0aCk7XG5cbiAgICBpZiAoYmlnRW5kaWFuID09PSBpc0JpZ0VuZGlhblBsYXRmb3JtKCkgfHwgYnl0ZXNQZXJFbGVtZW50ID09PSAxKSB7XG4gICAgICAgIC8vIGRlc2lyZWQgZW5kaWFubmVzcyBpcyB0aGUgc2FtZSBhcyB0aGUgcGxhdGZvcm0sIG9yIHRoZSBlbmRpYW5uZXNzIGRvZXNuJ3QgbWF0dGVyICgxIGJ5dGUpXG4gICAgICAgIHdyaXRlQXJyYXkuc2V0KHNvdXJjZVR5cGVkQXJyYXkuc3ViYXJyYXkoMCwgbGVuZ3RoKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIHdyaXRlVmlldyA9IG5ldyBEYXRhVmlldyhkZXN0aW5hdGlvbkFycmF5QnVmZmVyLCBwb3NpdGlvbiwgbGVuZ3RoICogYnl0ZXNQZXJFbGVtZW50KSxcbiAgICAgICAgICAgIHNldE1ldGhvZCA9IHNldE1ldGhvZHNbc291cmNlVHlwZWRBcnJheS5jb25zdHJ1Y3Rvci5uYW1lXSxcbiAgICAgICAgICAgIGxpdHRsZUVuZGlhbiA9ICFiaWdFbmRpYW4sXG4gICAgICAgICAgICBpID0gMDtcblxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHdyaXRlVmlld1tzZXRNZXRob2RdKGkgKiBieXRlc1BlckVsZW1lbnQsIHNvdXJjZVR5cGVkQXJyYXlbaV0sIGxpdHRsZUVuZGlhbik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gd3JpdGVBcnJheTtcbn1cblxuZnVuY3Rpb24gZW5jb2RlIChhdHRyaWJ1dGVzLCBpbmRpY2VzLCBiaWdFbmRpYW4pIHtcbiAgICB2YXIgYXR0cmlidXRlS2V5cyA9IGF0dHJpYnV0ZXMgPyBPYmplY3Qua2V5cyhhdHRyaWJ1dGVzKSA6IFtdLFxuICAgICAgICBpbmRleGVkR2VvbWV0cnkgPSAhIWluZGljZXM7XG5cbiAgICAvKiogUFJFTElNSU5BUlkgQ0hFQ0tTICoqL1xuXG4gICAgLy8gdGhpcyBpcyBub3Qgc3VwcG9zZWQgdG8gY2F0Y2ggYWxsIHRoZSBwb3NzaWJsZSBlcnJvcnMsIG9ubHkgc29tZSBvZiB0aGUgZ290Y2hhc1xuXG4gICAgaWYgKGF0dHJpYnV0ZUtleXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignUFJXTSBlbmNvZGVyOiBUaGUgbW9kZWwgbXVzdCBoYXZlIGF0IGxlYXN0IG9uZSBhdHRyaWJ1dGUnKTtcbiAgICB9XG5cbiAgICBpZiAoYXR0cmlidXRlS2V5cy5sZW5ndGggPiAzMSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BSV00gZW5jb2RlcjogVGhlIG1vZGVsIGNhbiBoYXZlIGF0IG1vc3QgMzEgYXR0cmlidXRlcycpO1xuICAgIH1cblxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXR0cmlidXRlS2V5cy5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAoIUVuY29kaW5nVHlwZXMuaGFzT3duUHJvcGVydHkoYXR0cmlidXRlc1thdHRyaWJ1dGVLZXlzW2ldXS52YWx1ZXMuY29uc3RydWN0b3IubmFtZSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignUFJXTSBlbmNvZGVyOiBVbnN1cHBvcnRlZCBhdHRyaWJ1dGUgdmFsdWVzIHR5cGU6ICcgKyBhdHRyaWJ1dGVzW2F0dHJpYnV0ZUtleXNbaV1dLnZhbHVlcy5jb25zdHJ1Y3Rvci5uYW1lKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmIChpbmRleGVkR2VvbWV0cnkgJiYgaW5kaWNlcy5jb25zdHJ1Y3Rvci5uYW1lICE9PSAnVWludDE2QXJyYXknICYmIGluZGljZXMuY29uc3RydWN0b3IubmFtZSAhPT0gJ1VpbnQzMkFycmF5Jykge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BSV00gZW5jb2RlcjogVGhlIGluZGljZXMgbXVzdCBiZSByZXByZXNlbnRlZCBhcyBhbiBVaW50MTZBcnJheSBvciBhbiBVaW50MzJBcnJheScpO1xuICAgIH1cblxuICAgIC8qKiBHRVQgVEhFIFRZUEUgT0YgSU5ESUNFUyBBUyBXRUxMIEFTIFRIRSBOVU1CRVIgT0YgSU5ESUNFUyBBTkQgQVRUUklCVVRFIFZBTFVFUyAqKi9cblxuICAgIHZhciB2YWx1ZXNOdW1iZXIgPSBhdHRyaWJ1dGVzW2F0dHJpYnV0ZUtleXNbMF1dLnZhbHVlcy5sZW5ndGggLyBhdHRyaWJ1dGVzW2F0dHJpYnV0ZUtleXNbMF1dLmNhcmRpbmFsaXR5IHwgMCxcbiAgICAgICAgaW5kaWNlc051bWJlciA9IGluZGV4ZWRHZW9tZXRyeSA/IGluZGljZXMubGVuZ3RoIDogMCxcbiAgICAgICAgaW5kaWNlc1R5cGUgPSBpbmRleGVkR2VvbWV0cnkgJiYgaW5kaWNlcy5jb25zdHJ1Y3Rvci5uYW1lID09PSAnVWludDMyQXJyYXknID8gMSA6IDA7XG5cbiAgICAvKiogR0VUIFRIRSBGSUxFIExFTkdUSCAqKi9cblxuICAgIHZhciB0b3RhbExlbmd0aCA9IDgsXG4gICAgICAgIGF0dHJpYnV0ZUtleSxcbiAgICAgICAgYXR0cmlidXRlLFxuICAgICAgICBhdHRyaWJ1dGVUeXBlLFxuICAgICAgICBpLCBqO1xuXG4gICAgZm9yIChpID0gMDsgaSA8IGF0dHJpYnV0ZUtleXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgYXR0cmlidXRlS2V5ID0gYXR0cmlidXRlS2V5c1tpXTtcbiAgICAgICAgYXR0cmlidXRlID0gYXR0cmlidXRlc1thdHRyaWJ1dGVLZXldO1xuICAgICAgICB0b3RhbExlbmd0aCArPSBhdHRyaWJ1dGVLZXkubGVuZ3RoICsgMjsgLy8gTlVMIGJ5dGUgKyBmbGFnIGJ5dGUgKyBwYWRkaW5nXG4gICAgICAgIHRvdGFsTGVuZ3RoID0gTWF0aC5jZWlsKHRvdGFsTGVuZ3RoIC8gNCkgKiA0OyAvLyBwYWRkaW5nXG4gICAgICAgIHRvdGFsTGVuZ3RoICs9IGF0dHJpYnV0ZS52YWx1ZXMuYnl0ZUxlbmd0aDtcbiAgICB9XG5cbiAgICBpZiAoaW5kZXhlZEdlb21ldHJ5KSB7XG4gICAgICAgIHRvdGFsTGVuZ3RoID0gTWF0aC5jZWlsKHRvdGFsTGVuZ3RoIC8gNCkgKiA0O1xuICAgICAgICB0b3RhbExlbmd0aCArPSBpbmRpY2VzLmJ5dGVMZW5ndGg7XG4gICAgfVxuXG4gICAgLyoqIElOSVRJQUxJWkUgVEhFIEJVRkZFUiAqL1xuXG4gICAgdmFyIGJ1ZmZlciA9IG5ldyBBcnJheUJ1ZmZlcih0b3RhbExlbmd0aCksXG4gICAgICAgIGFycmF5ID0gbmV3IFVpbnQ4QXJyYXkoYnVmZmVyKTtcblxuICAgIC8qKiBIRUFERVIgKiovXG5cbiAgICBhcnJheVswXSA9IDE7XG4gICAgYXJyYXlbMV0gPSAoXG4gICAgICAgIGluZGV4ZWRHZW9tZXRyeSA8PCA3IHxcbiAgICAgICAgaW5kaWNlc1R5cGUgPDwgNiB8XG4gICAgICAgIChiaWdFbmRpYW4gPyAxIDogMCkgPDwgNSB8XG4gICAgICAgIGF0dHJpYnV0ZUtleXMubGVuZ3RoICYgMHgxRlxuICAgICk7XG5cbiAgICBpZiAoYmlnRW5kaWFuKSB7XG4gICAgICAgIGFycmF5WzJdID0gdmFsdWVzTnVtYmVyID4+IDE2ICYgMHhGRjtcbiAgICAgICAgYXJyYXlbM10gPSB2YWx1ZXNOdW1iZXIgPj4gOCAmIDB4RkY7XG4gICAgICAgIGFycmF5WzRdID0gdmFsdWVzTnVtYmVyICYgMHhGRjtcblxuICAgICAgICBhcnJheVs1XSA9IGluZGljZXNOdW1iZXIgPj4gMTYgJiAweEZGO1xuICAgICAgICBhcnJheVs2XSA9IGluZGljZXNOdW1iZXIgPj4gOCAmIDB4RkY7XG4gICAgICAgIGFycmF5WzddID0gaW5kaWNlc051bWJlciAmIDB4RkY7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgYXJyYXlbMl0gPSB2YWx1ZXNOdW1iZXIgJiAweEZGO1xuICAgICAgICBhcnJheVszXSA9IHZhbHVlc051bWJlciA+PiA4ICYgMHhGRjtcbiAgICAgICAgYXJyYXlbNF0gPSB2YWx1ZXNOdW1iZXIgPj4gMTYgJiAweEZGO1xuXG4gICAgICAgIGFycmF5WzVdID0gaW5kaWNlc051bWJlciAmIDB4RkY7XG4gICAgICAgIGFycmF5WzZdID0gaW5kaWNlc051bWJlciA+PiA4ICYgMHhGRjtcbiAgICAgICAgYXJyYXlbN10gPSBpbmRpY2VzTnVtYmVyID4+IDE2ICYgMHhGRjtcbiAgICB9XG5cblxuICAgIHZhciBwb3MgPSA4O1xuXG4gICAgLyoqIEFUVFJJQlVURVMgKiovXG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgYXR0cmlidXRlS2V5cy5sZW5ndGg7IGkrKykge1xuICAgICAgICBhdHRyaWJ1dGVLZXkgPSBhdHRyaWJ1dGVLZXlzW2ldO1xuICAgICAgICBhdHRyaWJ1dGUgPSBhdHRyaWJ1dGVzW2F0dHJpYnV0ZUtleV07XG4gICAgICAgIGF0dHJpYnV0ZVR5cGUgPSB0eXBlb2YgYXR0cmlidXRlLnR5cGUgPT09ICd1bmRlZmluZWQnID8gaW5mZXJBdHRyaWJ1dGVUeXBlKGF0dHJpYnV0ZS52YWx1ZXMpIDogYXR0cmlidXRlLnR5cGU7XG5cbiAgICAgICAgLyoqKiBXUklURSBBVFRSSUJVVEUgSEVBREVSICoqKi9cblxuICAgICAgICBmb3IgKGogPSAwOyBqIDwgYXR0cmlidXRlS2V5Lmxlbmd0aDsgaisrLCBwb3MrKykge1xuICAgICAgICAgICAgYXJyYXlbcG9zXSA9IChhdHRyaWJ1dGVLZXkuY2hhckNvZGVBdChqKSAmIDB4N0YpIHx8IDB4NUY7IC8vIGRlZmF1bHQgdG8gdW5kZXJzY29yZVxuICAgICAgICB9XG5cbiAgICAgICAgcG9zKys7XG5cbiAgICAgICAgYXJyYXlbcG9zXSA9IChcbiAgICAgICAgICAgIChhdHRyaWJ1dGVUeXBlICYgMHgwMykgPDwgNiB8XG4gICAgICAgICAgICAoKGF0dHJpYnV0ZS5jYXJkaW5hbGl0eSAtIDEpICYgMHgwMykgPDwgNCB8XG4gICAgICAgICAgICBFbmNvZGluZ1R5cGVzW2F0dHJpYnV0ZS52YWx1ZXMuY29uc3RydWN0b3IubmFtZV0gJiAweDBGXG4gICAgICAgICk7XG5cbiAgICAgICAgcG9zKys7XG5cblxuICAgICAgICAvLyBwYWRkaW5nIHRvIG5leHQgbXVsdGlwbGUgb2YgNFxuICAgICAgICBwb3MgPSBNYXRoLmNlaWwocG9zIC8gNCkgKiA0O1xuXG4gICAgICAgIC8qKiogV1JJVEUgQVRUUklCVVRFIFZBTFVFUyAqKiovXG5cbiAgICAgICAgdmFyIGF0dHJpYnV0ZXNXcml0ZUFycmF5ID0gY29weVRvQnVmZmVyKGF0dHJpYnV0ZS52YWx1ZXMsIGJ1ZmZlciwgcG9zLCBiaWdFbmRpYW4pO1xuXG4gICAgICAgIHBvcyArPSBhdHRyaWJ1dGVzV3JpdGVBcnJheS5ieXRlTGVuZ3RoO1xuICAgIH1cblxuICAgIC8qKiogV1JJVEUgSU5ESUNFUyBWQUxVRVMgKioqL1xuXG4gICAgaWYgKGluZGV4ZWRHZW9tZXRyeSkge1xuICAgICAgICBwb3MgPSBNYXRoLmNlaWwocG9zIC8gNCkgKiA0O1xuXG4gICAgICAgIGNvcHlUb0J1ZmZlcihpbmRpY2VzLCBidWZmZXIsIHBvcywgYmlnRW5kaWFuKTtcbiAgICB9XG5cbiAgICByZXR1cm4gYnVmZmVyO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGVuY29kZTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgYXR0cmlidXRlVHlwZXMgPSByZXF1aXJlKCcuLi9wcndtL2F0dHJpYnV0ZS10eXBlcycpO1xuXG52YXIgbWFwID0ge1xuICAgIEludDhBcnJheTogYXR0cmlidXRlVHlwZXMuSW50LFxuICAgIEludDE2QXJyYXk6IGF0dHJpYnV0ZVR5cGVzLkludCxcbiAgICBJbnQzMkFycmF5OiBhdHRyaWJ1dGVUeXBlcy5JbnQsXG4gICAgVWludDhBcnJheTogYXR0cmlidXRlVHlwZXMuVWludCxcbiAgICBVaW50MTZBcnJheTogYXR0cmlidXRlVHlwZXMuVWludCxcbiAgICBVaW50MzJBcnJheTogYXR0cmlidXRlVHlwZXMuVWludCxcbiAgICBGbG9hdDMyQXJyYXk6IGF0dHJpYnV0ZVR5cGVzLkZsb2F0XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGluZmVyQXR0cmlidXRlVHlwZSAodHlwZWRBcnJheSkge1xuICAgIHJldHVybiBtYXBbdHlwZWRBcnJheS5jb25zdHJ1Y3Rvci5uYW1lXTtcbn07XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIGJpZ0VuZGlhblBsYXRmb3JtID0gbnVsbDtcblxuLyoqXG4gKiBDaGVjayBpZiB0aGUgZW5kaWFubmVzcyBvZiB0aGUgcGxhdGZvcm0gaXMgYmlnLWVuZGlhbiAobW9zdCBzaWduaWZpY2FudCBiaXQgZmlyc3QpXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gVHJ1ZSBpZiBiaWctZW5kaWFuLCBmYWxzZSBpZiBsaXR0bGUtZW5kaWFuXG4gKi9cbmZ1bmN0aW9uIGlzQmlnRW5kaWFuUGxhdGZvcm0gKCkge1xuICAgIGlmIChiaWdFbmRpYW5QbGF0Zm9ybSA9PT0gbnVsbCkge1xuICAgICAgICB2YXIgYnVmZmVyID0gbmV3IEFycmF5QnVmZmVyKDIpLFxuICAgICAgICAgICAgdWludDhBcnJheSA9IG5ldyBVaW50OEFycmF5KGJ1ZmZlciksXG4gICAgICAgICAgICB1aW50MTZBcnJheSA9IG5ldyBVaW50MTZBcnJheShidWZmZXIpO1xuXG4gICAgICAgIHVpbnQ4QXJyYXlbMF0gPSAweEFBOyAvLyBzZXQgZmlyc3QgYnl0ZVxuICAgICAgICB1aW50OEFycmF5WzFdID0gMHhCQjsgLy8gc2V0IHNlY29uZCBieXRlXG4gICAgICAgIGJpZ0VuZGlhblBsYXRmb3JtID0gKHVpbnQxNkFycmF5WzBdID09PSAweEFBQkIpO1xuICAgIH1cblxuICAgIHJldHVybiBiaWdFbmRpYW5QbGF0Zm9ybTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBpc0JpZ0VuZGlhblBsYXRmb3JtO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBwcndtID0gcmVxdWlyZSgnLi4vcHJ3bS8nKTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBhbiBBcnJheUJ1ZmZlciBjb250YWluaW5nIGEgUFJXTSBmaWxlIGZyb20gYW4gaW5zdGFuY2Ugb2YgQnVmZmVyR2VvbWV0cnlcbiAqIEBwYXJhbSB7VEhSRUUuQnVmZmVyR2VvZW10cnl9IGJ1ZmZlckdlb21ldHJ5IEFuIGluc3RhbmNlIG9mIEJ1ZmZlckdlb21ldHJ5IChjYW4gYmUgaW5kZXhlZCBvciBub24taW5kZXhlZClcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gYmlnRW5kaWFuIFdoZXRoZXIgdGhlIGVuZGlhbm5lc3Mgb2YgdGhlIGZpbGUgc2hvdWxkIEJpZyBFbmRpYW5cbiAqIEByZXR1cm5zIHtBcnJheUJ1ZmZlcn0gQXJyYXlCdWZmZXIgY29udGFpbmluZyB0aGUgUFJXTSBmaWxlXG4gKi9cbnZhciBidWZmZXJHZW9tZXRyeVRvUHJ3bSA9IGZ1bmN0aW9uIGJ1ZmZlckdlb21ldHJ5VG9QcndtIChidWZmZXJHZW9tZXRyeSwgYmlnRW5kaWFuKSB7XG4gICAgaWYgKGJ1ZmZlckdlb21ldHJ5LnR5cGUgIT09ICdCdWZmZXJHZW9tZXRyeScpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCd0aHJlZS1idWZmZXJnZW9tZXRyeS10by1wcndtIGNhbiBvbmx5IGJlIHVzZWQgd2l0aCBhbiBpbnN0YW5jZSBvZiBUSFJFRS5CdWZmZXJHZW9tZXRyeScpO1xuICAgIH1cblxuICAgIHZhciBhdHRyaWJ1dGVzID0ge30sXG4gICAgICAgIGluZGljZXMgPSBudWxsLFxuICAgICAgICBhdHRyaWJ1dGVLZXlzID0gT2JqZWN0LmtleXMoYnVmZmVyR2VvbWV0cnkuYXR0cmlidXRlcyksXG4gICAgICAgIGkgPSAwLFxuICAgICAgICBhdHRyaWJ1dGU7XG5cbiAgICBmb3IgKDsgaSA8IGF0dHJpYnV0ZUtleXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgYXR0cmlidXRlID0gYnVmZmVyR2VvbWV0cnkuYXR0cmlidXRlc1thdHRyaWJ1dGVLZXlzW2ldXTtcblxuICAgICAgICBhdHRyaWJ1dGVzW2F0dHJpYnV0ZUtleXNbaV1dID0ge1xuICAgICAgICAgICAgY2FyZGluYWxpdHk6IGF0dHJpYnV0ZS5pdGVtU2l6ZSxcbiAgICAgICAgICAgIHZhbHVlczogYXR0cmlidXRlLmFycmF5XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgaWYgKGJ1ZmZlckdlb21ldHJ5LmluZGV4KSB7XG4gICAgICAgIGluZGljZXMgPSBidWZmZXJHZW9tZXRyeS5pbmRleC5hcnJheTtcbiAgICB9XG5cbiAgICByZXR1cm4gcHJ3bS5lbmNvZGUoYXR0cmlidXRlcywgaW5kaWNlcywgISFiaWdFbmRpYW4pO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBidWZmZXJHZW9tZXRyeVRvUHJ3bTtcbiJdfQ==
