(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.threeBuffergeometryToPrwm = f()}})(function(){var define,module,exports;return (function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
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
            type: (attribute.array instanceof Float32Array || attribute.array instanceof Float64Array ) ? prwm.Float : prwm.Int,
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

//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy5udm0vdmVyc2lvbnMvbm9kZS92MTQuMTUuMS9saWIvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsImluZGV4LmpzIiwibm9kZV9tb2R1bGVzL3Byd20vaW5kZXguanMiLCJub2RlX21vZHVsZXMvcHJ3bS9wcndtL2F0dHJpYnV0ZS10eXBlcy5qcyIsIm5vZGVfbW9kdWxlcy9wcndtL3Byd20vZGVjb2RlLmpzIiwibm9kZV9tb2R1bGVzL3Byd20vcHJ3bS9lbmNvZGUuanMiLCJub2RlX21vZHVsZXMvcHJ3bS91dGlscy9pcy1iaWctZW5kaWFuLXBsYXRmb3JtLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24oKXtmdW5jdGlvbiByKGUsbix0KXtmdW5jdGlvbiBvKGksZil7aWYoIW5baV0pe2lmKCFlW2ldKXt2YXIgYz1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlO2lmKCFmJiZjKXJldHVybiBjKGksITApO2lmKHUpcmV0dXJuIHUoaSwhMCk7dmFyIGE9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitpK1wiJ1wiKTt0aHJvdyBhLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsYX12YXIgcD1uW2ldPXtleHBvcnRzOnt9fTtlW2ldWzBdLmNhbGwocC5leHBvcnRzLGZ1bmN0aW9uKHIpe3ZhciBuPWVbaV1bMV1bcl07cmV0dXJuIG8obnx8cil9LHAscC5leHBvcnRzLHIsZSxuLHQpfXJldHVybiBuW2ldLmV4cG9ydHN9Zm9yKHZhciB1PVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmUsaT0wO2k8dC5sZW5ndGg7aSsrKW8odFtpXSk7cmV0dXJuIG99cmV0dXJuIHJ9KSgpIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBwcndtID0gcmVxdWlyZSgncHJ3bScpO1xuXG4vKipcbiAqIEdlbmVyYXRlIGFuIEFycmF5QnVmZmVyIGNvbnRhaW5pbmcgYSBQUldNIGZpbGUgZnJvbSBhbiBpbnN0YW5jZSBvZiBCdWZmZXJHZW9tZXRyeVxuICogQHBhcmFtIHtUSFJFRS5CdWZmZXJHZW9lbXRyeX0gYnVmZmVyR2VvbWV0cnkgQW4gaW5zdGFuY2Ugb2YgQnVmZmVyR2VvbWV0cnkgKGNhbiBiZSBpbmRleGVkIG9yIG5vbi1pbmRleGVkKVxuICogQHBhcmFtIHtib29sZWFufSBiaWdFbmRpYW4gV2hldGhlciB0aGUgZW5kaWFubmVzcyBvZiB0aGUgZmlsZSBzaG91bGQgQmlnIEVuZGlhblxuICogQHJldHVybnMge0FycmF5QnVmZmVyfSBBcnJheUJ1ZmZlciBjb250YWluaW5nIHRoZSBQUldNIGZpbGVcbiAqL1xudmFyIGJ1ZmZlckdlb21ldHJ5VG9QcndtID0gZnVuY3Rpb24gYnVmZmVyR2VvbWV0cnlUb1Byd20gKGJ1ZmZlckdlb21ldHJ5LCBiaWdFbmRpYW4pIHtcbiAgICBpZiAoYnVmZmVyR2VvbWV0cnkudHlwZSAhPT0gJ0J1ZmZlckdlb21ldHJ5Jykge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ3RocmVlLWJ1ZmZlcmdlb21ldHJ5LXRvLXByd20gY2FuIG9ubHkgYmUgdXNlZCB3aXRoIGFuIGluc3RhbmNlIG9mIFRIUkVFLkJ1ZmZlckdlb21ldHJ5Jyk7XG4gICAgfVxuXG4gICAgdmFyIGF0dHJpYnV0ZXMgPSB7fSxcbiAgICAgICAgaW5kaWNlcyA9IG51bGwsXG4gICAgICAgIGF0dHJpYnV0ZUtleXMgPSBPYmplY3Qua2V5cyhidWZmZXJHZW9tZXRyeS5hdHRyaWJ1dGVzKSxcbiAgICAgICAgaSA9IDAsXG4gICAgICAgIGF0dHJpYnV0ZTtcblxuICAgIGZvciAoOyBpIDwgYXR0cmlidXRlS2V5cy5sZW5ndGg7IGkrKykge1xuICAgICAgICBhdHRyaWJ1dGUgPSBidWZmZXJHZW9tZXRyeS5hdHRyaWJ1dGVzW2F0dHJpYnV0ZUtleXNbaV1dO1xuXG4gICAgICAgIGF0dHJpYnV0ZXNbYXR0cmlidXRlS2V5c1tpXV0gPSB7XG4gICAgICAgICAgICBjYXJkaW5hbGl0eTogYXR0cmlidXRlLml0ZW1TaXplLFxuICAgICAgICAgICAgbm9ybWFsaXplZDogYXR0cmlidXRlLm5vcm1hbGl6ZWQsXG4gICAgICAgICAgICB0eXBlOiAoYXR0cmlidXRlLmFycmF5IGluc3RhbmNlb2YgRmxvYXQzMkFycmF5IHx8IGF0dHJpYnV0ZS5hcnJheSBpbnN0YW5jZW9mIEZsb2F0NjRBcnJheSApID8gcHJ3bS5GbG9hdCA6IHByd20uSW50LFxuICAgICAgICAgICAgdmFsdWVzOiBhdHRyaWJ1dGUuYXJyYXlcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBpZiAoYnVmZmVyR2VvbWV0cnkuaW5kZXgpIHtcbiAgICAgICAgaW5kaWNlcyA9IGJ1ZmZlckdlb21ldHJ5LmluZGV4LmFycmF5O1xuICAgIH1cblxuICAgIHJldHVybiBwcndtLmVuY29kZShhdHRyaWJ1dGVzLCBpbmRpY2VzLCAhIWJpZ0VuZGlhbik7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IGJ1ZmZlckdlb21ldHJ5VG9QcndtO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBhdHRyaWJ1dGVUeXBlcyA9IHJlcXVpcmUoJy4vcHJ3bS9hdHRyaWJ1dGUtdHlwZXMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgdmVyc2lvbjogMSxcbiAgICBJbnQ6IGF0dHJpYnV0ZVR5cGVzLkludCxcbiAgICBGbG9hdDogYXR0cmlidXRlVHlwZXMuRmxvYXQsXG4gICAgaXNCaWdFbmRpYW5QbGF0Zm9ybTogcmVxdWlyZSgnLi91dGlscy9pcy1iaWctZW5kaWFuLXBsYXRmb3JtJyksXG4gICAgZW5jb2RlOiByZXF1aXJlKCcuL3Byd20vZW5jb2RlJyksXG4gICAgZGVjb2RlOiByZXF1aXJlKCcuL3Byd20vZGVjb2RlJylcbn07XG4iLCJcInVzZSBzdHJpY3RcIjtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgRmxvYXQ6IDAsXG4gICAgSW50OiAxXG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBpc0JpZ0VuZGlhblBsYXRmb3JtID0gcmVxdWlyZSgnLi4vdXRpbHMvaXMtYmlnLWVuZGlhbi1wbGF0Zm9ybScpO1xuXG4vLyBtYXRjaCB0aGUgdmFsdWVzIGRlZmluZWQgaW4gdGhlIHNwZWMgdG8gdGhlIFR5cGVkQXJyYXkgdHlwZXNcbnZhciBJbnZlcnRlZEVuY29kaW5nVHlwZXMgPSBbXG4gICAgbnVsbCxcbiAgICBGbG9hdDMyQXJyYXksXG4gICAgbnVsbCxcbiAgICBJbnQ4QXJyYXksXG4gICAgSW50MTZBcnJheSxcbiAgICBudWxsLFxuICAgIEludDMyQXJyYXksXG4gICAgVWludDhBcnJheSxcbiAgICBVaW50MTZBcnJheSxcbiAgICBudWxsLFxuICAgIFVpbnQzMkFycmF5XG5dO1xuXG4vLyBkZWZpbmUgdGhlIG1ldGhvZCB0byB1c2Ugb24gYSBEYXRhVmlldywgY29ycmVzcG9uZGluZyB0aGUgVHlwZWRBcnJheSB0eXBlXG52YXIgZ2V0TWV0aG9kcyA9IHtcbiAgICBVaW50MTZBcnJheTogJ2dldFVpbnQxNicsXG4gICAgVWludDMyQXJyYXk6ICdnZXRVaW50MzInLFxuICAgIEludDE2QXJyYXk6ICdnZXRJbnQxNicsXG4gICAgSW50MzJBcnJheTogJ2dldEludDMyJyxcbiAgICBGbG9hdDMyQXJyYXk6ICdnZXRGbG9hdDMyJ1xufTtcblxuZnVuY3Rpb24gY29weUZyb21CdWZmZXIgKHNvdXJjZUFycmF5QnVmZmVyLCB2aWV3VHlwZSwgcG9zaXRpb24sIGxlbmd0aCwgZnJvbUJpZ0VuZGlhbikge1xuICAgIHZhciBieXRlc1BlckVsZW1lbnQgPSB2aWV3VHlwZS5CWVRFU19QRVJfRUxFTUVOVCxcbiAgICAgICAgcmVzdWx0O1xuXG4gICAgaWYgKGZyb21CaWdFbmRpYW4gPT09IGlzQmlnRW5kaWFuUGxhdGZvcm0oKSB8fCBieXRlc1BlckVsZW1lbnQgPT09IDEpIHtcbiAgICAgICAgcmVzdWx0ID0gbmV3IHZpZXdUeXBlKHNvdXJjZUFycmF5QnVmZmVyLCBwb3NpdGlvbiwgbGVuZ3RoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgcmVhZFZpZXcgPSBuZXcgRGF0YVZpZXcoc291cmNlQXJyYXlCdWZmZXIsIHBvc2l0aW9uLCBsZW5ndGggKiBieXRlc1BlckVsZW1lbnQpLFxuICAgICAgICAgICAgZ2V0TWV0aG9kID0gZ2V0TWV0aG9kc1t2aWV3VHlwZS5uYW1lXSxcbiAgICAgICAgICAgIGxpdHRsZUVuZGlhbiA9ICFmcm9tQmlnRW5kaWFuO1xuXG4gICAgICAgIHJlc3VsdCA9IG5ldyB2aWV3VHlwZShsZW5ndGgpO1xuXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHJlc3VsdFtpXSA9IHJlYWRWaWV3W2dldE1ldGhvZF0oaSAqIGJ5dGVzUGVyRWxlbWVudCwgbGl0dGxlRW5kaWFuKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiByZXN1bHQ7XG59XG5cbmZ1bmN0aW9uIGRlY29kZSAoYnVmZmVyLCBvZmZzZXQpIHtcbiAgICBvZmZzZXQgPSBvZmZzZXQgfHwgMDtcblxuICAgIHZhciBhcnJheSA9IG5ldyBVaW50OEFycmF5KGJ1ZmZlciwgb2Zmc2V0KSxcbiAgICAgICAgdmVyc2lvbiA9IGFycmF5WzBdLFxuICAgICAgICBmbGFncyA9IGFycmF5WzFdLFxuICAgICAgICBpbmRleGVkR2VvbWV0cnkgPSAhIShmbGFncyA+PiA3KSxcbiAgICAgICAgaW5kaWNlc1R5cGUgPSBmbGFncyA+PiA2ICYgMHgwMSxcbiAgICAgICAgYmlnRW5kaWFuID0gKGZsYWdzID4+IDUgJiAweDAxKSA9PT0gMSxcbiAgICAgICAgYXR0cmlidXRlc051bWJlciA9IGZsYWdzICYgMHgxRixcbiAgICAgICAgdmFsdWVzTnVtYmVyID0gMCxcbiAgICAgICAgaW5kaWNlc051bWJlciA9IDA7XG5cbiAgICBpZiAoYmlnRW5kaWFuKSB7XG4gICAgICAgIHZhbHVlc051bWJlciA9IChhcnJheVsyXSA8PCAxNikgKyAoYXJyYXlbM10gPDwgOCkgKyBhcnJheVs0XTtcbiAgICAgICAgaW5kaWNlc051bWJlciA9IChhcnJheVs1XSA8PCAxNikgKyAoYXJyYXlbNl0gPDwgOCkgKyBhcnJheVs3XTtcbiAgICB9IGVsc2Uge1xuICAgICAgICB2YWx1ZXNOdW1iZXIgPSBhcnJheVsyXSArIChhcnJheVszXSA8PCA4KSArIChhcnJheVs0XSA8PCAxNik7XG4gICAgICAgIGluZGljZXNOdW1iZXIgPSBhcnJheVs1XSArIChhcnJheVs2XSA8PCA4KSArIChhcnJheVs3XSA8PCAxNik7XG4gICAgfVxuXG4gICAgLyoqIFBSRUxJTUlOQVJZIENIRUNLUyAqKi9cblxuICAgIGlmIChvZmZzZXQgLyA0ICUgMSAhPT0gMCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BSV00gZGVjb2RlcjogT2Zmc2V0IHNob3VsZCBiZSBhIG11bHRpcGxlIG9mIDQsIHJlY2VpdmVkICcgKyBvZmZzZXQpO1xuICAgIH1cblxuICAgIGlmICh2ZXJzaW9uID09PSAwKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignUFJXTSBkZWNvZGVyOiBJbnZhbGlkIGZvcm1hdCB2ZXJzaW9uOiAwJyk7XG4gICAgfSBlbHNlIGlmICh2ZXJzaW9uICE9PSAxKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignUFJXTSBkZWNvZGVyOiBVbnN1cHBvcnRlZCBmb3JtYXQgdmVyc2lvbjogJyArIHZlcnNpb24pO1xuICAgIH1cblxuICAgIGlmICghaW5kZXhlZEdlb21ldHJ5KSB7XG4gICAgICAgIGlmIChpbmRpY2VzVHlwZSAhPT0gMCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdQUldNIGRlY29kZXI6IEluZGljZXMgdHlwZSBtdXN0IGJlIHNldCB0byAwIGZvciBub24taW5kZXhlZCBnZW9tZXRyaWVzJyk7XG4gICAgICAgIH0gZWxzZSBpZiAoaW5kaWNlc051bWJlciAhPT0gMCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdQUldNIGRlY29kZXI6IE51bWJlciBvZiBpbmRpY2VzIG11c3QgYmUgc2V0IHRvIDAgZm9yIG5vbi1pbmRleGVkIGdlb21ldHJpZXMnKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKiBQQVJTSU5HICoqL1xuXG4gICAgdmFyIHBvcyA9IDg7XG5cbiAgICB2YXIgYXR0cmlidXRlcyA9IHt9LFxuICAgICAgICBhdHRyaWJ1dGVOYW1lLFxuICAgICAgICBjaGFyLFxuICAgICAgICBhdHRyaWJ1dGVOb3JtYWxpemVkLFxuICAgICAgICBhdHRyaWJ1dGVUeXBlLFxuICAgICAgICBjYXJkaW5hbGl0eSxcbiAgICAgICAgZW5jb2RpbmdUeXBlLFxuICAgICAgICBhcnJheVR5cGUsXG4gICAgICAgIHZhbHVlcyxcbiAgICAgICAgaTtcblxuICAgIGZvciAoaSA9IDA7IGkgPCBhdHRyaWJ1dGVzTnVtYmVyOyBpKyspIHtcbiAgICAgICAgYXR0cmlidXRlTmFtZSA9ICcnO1xuXG4gICAgICAgIHdoaWxlIChwb3MgPCBhcnJheS5sZW5ndGgpIHtcbiAgICAgICAgICAgIGNoYXIgPSBhcnJheVtwb3NdO1xuICAgICAgICAgICAgcG9zKys7XG5cbiAgICAgICAgICAgIGlmIChjaGFyID09PSAwKSB7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGF0dHJpYnV0ZU5hbWUgKz0gU3RyaW5nLmZyb21DaGFyQ29kZShjaGFyKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGZsYWdzID0gYXJyYXlbcG9zXTtcblxuICAgICAgICBhdHRyaWJ1dGVUeXBlID0gZmxhZ3MgPj4gNyAmIDB4MDE7XG4gICAgICAgIGF0dHJpYnV0ZU5vcm1hbGl6ZWQgPSAhIShmbGFncyA+PiA2ICYgMHgwMSk7XG4gICAgICAgIGNhcmRpbmFsaXR5ID0gKGZsYWdzID4+IDQgJiAweDAzKSArIDE7XG4gICAgICAgIGVuY29kaW5nVHlwZSA9IGZsYWdzICYgMHgwRjtcbiAgICAgICAgYXJyYXlUeXBlID0gSW52ZXJ0ZWRFbmNvZGluZ1R5cGVzW2VuY29kaW5nVHlwZV07XG5cbiAgICAgICAgcG9zKys7XG5cbiAgICAgICAgLy8gcGFkZGluZyB0byBuZXh0IG11bHRpcGxlIG9mIDRcbiAgICAgICAgcG9zID0gTWF0aC5jZWlsKHBvcyAvIDQpICogNDtcblxuICAgICAgICB2YWx1ZXMgPSBjb3B5RnJvbUJ1ZmZlcihidWZmZXIsIGFycmF5VHlwZSwgcG9zICsgb2Zmc2V0LCBjYXJkaW5hbGl0eSAqIHZhbHVlc051bWJlciwgYmlnRW5kaWFuKTtcblxuICAgICAgICBwb3MrPSBhcnJheVR5cGUuQllURVNfUEVSX0VMRU1FTlQgKiBjYXJkaW5hbGl0eSAqIHZhbHVlc051bWJlcjtcblxuICAgICAgICBhdHRyaWJ1dGVzW2F0dHJpYnV0ZU5hbWVdID0ge1xuICAgICAgICAgICAgdHlwZTogYXR0cmlidXRlVHlwZSxcbiAgICAgICAgICAgIG5vcm1hbGl6ZWQ6IGF0dHJpYnV0ZU5vcm1hbGl6ZWQsXG4gICAgICAgICAgICBjYXJkaW5hbGl0eTogY2FyZGluYWxpdHksXG4gICAgICAgICAgICB2YWx1ZXM6IHZhbHVlc1xuICAgICAgICB9O1xuICAgIH1cblxuICAgIHBvcyA9IE1hdGguY2VpbChwb3MgLyA0KSAqIDQ7XG5cbiAgICB2YXIgaW5kaWNlcyA9IG51bGw7XG5cbiAgICBpZiAoaW5kZXhlZEdlb21ldHJ5KSB7XG4gICAgICAgIGluZGljZXMgPSBjb3B5RnJvbUJ1ZmZlcihcbiAgICAgICAgICAgIGJ1ZmZlcixcbiAgICAgICAgICAgIGluZGljZXNUeXBlID09PSAxID8gVWludDMyQXJyYXkgOiBVaW50MTZBcnJheSxcbiAgICAgICAgICAgIHBvcyArIG9mZnNldCxcbiAgICAgICAgICAgIGluZGljZXNOdW1iZXIsXG4gICAgICAgICAgICBiaWdFbmRpYW5cbiAgICAgICAgKTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICB2ZXJzaW9uOiB2ZXJzaW9uLFxuICAgICAgICBiaWdFbmRpYW46IGJpZ0VuZGlhbixcbiAgICAgICAgYXR0cmlidXRlczogYXR0cmlidXRlcyxcbiAgICAgICAgaW5kaWNlczogaW5kaWNlc1xuICAgIH07XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZGVjb2RlO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBpc0JpZ0VuZGlhblBsYXRmb3JtID0gcmVxdWlyZSgnLi4vdXRpbHMvaXMtYmlnLWVuZGlhbi1wbGF0Zm9ybScpLFxuICAgIGF0dHJpYnV0ZVR5cGVzID0gcmVxdWlyZSgnLi9hdHRyaWJ1dGUtdHlwZXMnKTtcblxuLy8gbWF0Y2ggdGhlIFR5cGVkQXJyYXkgdHlwZSB3aXRoIHRoZSB2YWx1ZSBkZWZpbmVkIGluIHRoZSBzcGVjXG52YXIgRW5jb2RpbmdUeXBlcyA9IHtcbiAgICBGbG9hdDMyQXJyYXk6IDEsXG4gICAgSW50OEFycmF5OiAzLFxuICAgIEludDE2QXJyYXk6IDQsXG4gICAgSW50MzJBcnJheTogNixcbiAgICBVaW50OEFycmF5OiA3LFxuICAgIFVpbnQxNkFycmF5OiA4LFxuICAgIFVpbnQzMkFycmF5OiAxMFxufTtcblxuLy8gZGVmaW5lIHRoZSBtZXRob2QgdG8gdXNlIG9uIGEgRGF0YVZpZXcsIGNvcnJlc3BvbmRpbmcgdGhlIFR5cGVkQXJyYXkgdHlwZVxudmFyIHNldE1ldGhvZHMgPSB7XG4gICAgVWludDE2QXJyYXk6ICdzZXRVaW50MTYnLFxuICAgIFVpbnQzMkFycmF5OiAnc2V0VWludDMyJyxcbiAgICBJbnQxNkFycmF5OiAnc2V0SW50MTYnLFxuICAgIEludDMyQXJyYXk6ICdzZXRJbnQzMicsXG4gICAgRmxvYXQzMkFycmF5OiAnc2V0RmxvYXQzMidcbn07XG5cbmZ1bmN0aW9uIGNvcHlUb0J1ZmZlciAoc291cmNlVHlwZWRBcnJheSwgZGVzdGluYXRpb25BcnJheUJ1ZmZlciwgcG9zaXRpb24sIGJpZ0VuZGlhbikge1xuICAgIHZhciBsZW5ndGggPSBzb3VyY2VUeXBlZEFycmF5Lmxlbmd0aCxcbiAgICAgICAgYnl0ZXNQZXJFbGVtZW50ID0gc291cmNlVHlwZWRBcnJheS5CWVRFU19QRVJfRUxFTUVOVDtcblxuICAgIHZhciB3cml0ZUFycmF5ID0gbmV3IHNvdXJjZVR5cGVkQXJyYXkuY29uc3RydWN0b3IoZGVzdGluYXRpb25BcnJheUJ1ZmZlciwgcG9zaXRpb24sIGxlbmd0aCk7XG5cbiAgICBpZiAoYmlnRW5kaWFuID09PSBpc0JpZ0VuZGlhblBsYXRmb3JtKCkgfHwgYnl0ZXNQZXJFbGVtZW50ID09PSAxKSB7XG4gICAgICAgIC8vIGRlc2lyZWQgZW5kaWFubmVzcyBpcyB0aGUgc2FtZSBhcyB0aGUgcGxhdGZvcm0sIG9yIHRoZSBlbmRpYW5uZXNzIGRvZXNuJ3QgbWF0dGVyICgxIGJ5dGUpXG4gICAgICAgIHdyaXRlQXJyYXkuc2V0KHNvdXJjZVR5cGVkQXJyYXkuc3ViYXJyYXkoMCwgbGVuZ3RoKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIHdyaXRlVmlldyA9IG5ldyBEYXRhVmlldyhkZXN0aW5hdGlvbkFycmF5QnVmZmVyLCBwb3NpdGlvbiwgbGVuZ3RoICogYnl0ZXNQZXJFbGVtZW50KSxcbiAgICAgICAgICAgIHNldE1ldGhvZCA9IHNldE1ldGhvZHNbc291cmNlVHlwZWRBcnJheS5jb25zdHJ1Y3Rvci5uYW1lXSxcbiAgICAgICAgICAgIGxpdHRsZUVuZGlhbiA9ICFiaWdFbmRpYW4sXG4gICAgICAgICAgICBpID0gMDtcblxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHdyaXRlVmlld1tzZXRNZXRob2RdKGkgKiBieXRlc1BlckVsZW1lbnQsIHNvdXJjZVR5cGVkQXJyYXlbaV0sIGxpdHRsZUVuZGlhbik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gd3JpdGVBcnJheTtcbn1cblxuZnVuY3Rpb24gZW5jb2RlIChhdHRyaWJ1dGVzLCBpbmRpY2VzLCBiaWdFbmRpYW4pIHtcbiAgICB2YXIgYXR0cmlidXRlS2V5cyA9IGF0dHJpYnV0ZXMgPyBPYmplY3Qua2V5cyhhdHRyaWJ1dGVzKSA6IFtdLFxuICAgICAgICBpbmRleGVkR2VvbWV0cnkgPSAhIWluZGljZXMsXG4gICAgICAgIGksIGo7XG5cbiAgICAvKiogUFJFTElNSU5BUlkgQ0hFQ0tTICoqL1xuXG4gICAgLy8gdGhpcyBpcyBub3Qgc3VwcG9zZWQgdG8gY2F0Y2ggYWxsIHRoZSBwb3NzaWJsZSBlcnJvcnMsIG9ubHkgc29tZSBvZiB0aGUgZ290Y2hhc1xuXG4gICAgaWYgKGF0dHJpYnV0ZUtleXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignUFJXTSBlbmNvZGVyOiBUaGUgbW9kZWwgbXVzdCBoYXZlIGF0IGxlYXN0IG9uZSBhdHRyaWJ1dGUnKTtcbiAgICB9XG5cbiAgICBpZiAoYXR0cmlidXRlS2V5cy5sZW5ndGggPiAzMSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BSV00gZW5jb2RlcjogVGhlIG1vZGVsIGNhbiBoYXZlIGF0IG1vc3QgMzEgYXR0cmlidXRlcycpO1xuICAgIH1cblxuICAgIGZvciAoaSA9IDA7IGkgPCBhdHRyaWJ1dGVLZXlzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmICghRW5jb2RpbmdUeXBlcy5oYXNPd25Qcm9wZXJ0eShhdHRyaWJ1dGVzW2F0dHJpYnV0ZUtleXNbaV1dLnZhbHVlcy5jb25zdHJ1Y3Rvci5uYW1lKSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdQUldNIGVuY29kZXI6IFVuc3VwcG9ydGVkIGF0dHJpYnV0ZSB2YWx1ZXMgdHlwZTogJyArIGF0dHJpYnV0ZXNbYXR0cmlidXRlS2V5c1tpXV0udmFsdWVzLmNvbnN0cnVjdG9yLm5hbWUpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGluZGV4ZWRHZW9tZXRyeSAmJiBpbmRpY2VzLmNvbnN0cnVjdG9yLm5hbWUgIT09ICdVaW50MTZBcnJheScgJiYgaW5kaWNlcy5jb25zdHJ1Y3Rvci5uYW1lICE9PSAnVWludDMyQXJyYXknKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignUFJXTSBlbmNvZGVyOiBUaGUgaW5kaWNlcyBtdXN0IGJlIHJlcHJlc2VudGVkIGFzIGFuIFVpbnQxNkFycmF5IG9yIGFuIFVpbnQzMkFycmF5Jyk7XG4gICAgfVxuXG4gICAgLyoqIEdFVCBUSEUgVFlQRSBPRiBJTkRJQ0VTIEFTIFdFTEwgQVMgVEhFIE5VTUJFUiBPRiBJTkRJQ0VTIEFORCBBVFRSSUJVVEUgVkFMVUVTICoqL1xuXG4gICAgdmFyIHZhbHVlc051bWJlciA9IGF0dHJpYnV0ZXNbYXR0cmlidXRlS2V5c1swXV0udmFsdWVzLmxlbmd0aCAvIGF0dHJpYnV0ZXNbYXR0cmlidXRlS2V5c1swXV0uY2FyZGluYWxpdHkgfCAwLFxuICAgICAgICBpbmRpY2VzTnVtYmVyID0gaW5kZXhlZEdlb21ldHJ5ID8gaW5kaWNlcy5sZW5ndGggOiAwLFxuICAgICAgICBpbmRpY2VzVHlwZSA9IGluZGV4ZWRHZW9tZXRyeSAmJiBpbmRpY2VzLmNvbnN0cnVjdG9yLm5hbWUgPT09ICdVaW50MzJBcnJheScgPyAxIDogMDtcblxuICAgIC8qKiBHRVQgVEhFIEZJTEUgTEVOR1RIICoqL1xuXG4gICAgdmFyIHRvdGFsTGVuZ3RoID0gOCxcbiAgICAgICAgYXR0cmlidXRlS2V5LFxuICAgICAgICBhdHRyaWJ1dGUsXG4gICAgICAgIGF0dHJpYnV0ZVR5cGUsXG4gICAgICAgIGF0dHJpYnV0ZU5vcm1hbGl6ZWQ7XG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgYXR0cmlidXRlS2V5cy5sZW5ndGg7IGkrKykge1xuICAgICAgICBhdHRyaWJ1dGVLZXkgPSBhdHRyaWJ1dGVLZXlzW2ldO1xuICAgICAgICBhdHRyaWJ1dGUgPSBhdHRyaWJ1dGVzW2F0dHJpYnV0ZUtleV07XG4gICAgICAgIHRvdGFsTGVuZ3RoICs9IGF0dHJpYnV0ZUtleS5sZW5ndGggKyAyOyAvLyBOVUwgYnl0ZSArIGZsYWcgYnl0ZSArIHBhZGRpbmdcbiAgICAgICAgdG90YWxMZW5ndGggPSBNYXRoLmNlaWwodG90YWxMZW5ndGggLyA0KSAqIDQ7IC8vIHBhZGRpbmdcbiAgICAgICAgdG90YWxMZW5ndGggKz0gYXR0cmlidXRlLnZhbHVlcy5ieXRlTGVuZ3RoO1xuICAgIH1cblxuICAgIGlmIChpbmRleGVkR2VvbWV0cnkpIHtcbiAgICAgICAgdG90YWxMZW5ndGggPSBNYXRoLmNlaWwodG90YWxMZW5ndGggLyA0KSAqIDQ7XG4gICAgICAgIHRvdGFsTGVuZ3RoICs9IGluZGljZXMuYnl0ZUxlbmd0aDtcbiAgICB9XG5cbiAgICAvKiogSU5JVElBTElaRSBUSEUgQlVGRkVSICovXG5cbiAgICB2YXIgYnVmZmVyID0gbmV3IEFycmF5QnVmZmVyKHRvdGFsTGVuZ3RoKSxcbiAgICAgICAgYXJyYXkgPSBuZXcgVWludDhBcnJheShidWZmZXIpO1xuXG4gICAgLyoqIEhFQURFUiAqKi9cblxuICAgIGFycmF5WzBdID0gMTtcbiAgICBhcnJheVsxXSA9IChcbiAgICAgICAgaW5kZXhlZEdlb21ldHJ5IDw8IDcgfFxuICAgICAgICBpbmRpY2VzVHlwZSA8PCA2IHxcbiAgICAgICAgKGJpZ0VuZGlhbiA/IDEgOiAwKSA8PCA1IHxcbiAgICAgICAgYXR0cmlidXRlS2V5cy5sZW5ndGggJiAweDFGXG4gICAgKTtcblxuICAgIGlmIChiaWdFbmRpYW4pIHtcbiAgICAgICAgYXJyYXlbMl0gPSB2YWx1ZXNOdW1iZXIgPj4gMTYgJiAweEZGO1xuICAgICAgICBhcnJheVszXSA9IHZhbHVlc051bWJlciA+PiA4ICYgMHhGRjtcbiAgICAgICAgYXJyYXlbNF0gPSB2YWx1ZXNOdW1iZXIgJiAweEZGO1xuXG4gICAgICAgIGFycmF5WzVdID0gaW5kaWNlc051bWJlciA+PiAxNiAmIDB4RkY7XG4gICAgICAgIGFycmF5WzZdID0gaW5kaWNlc051bWJlciA+PiA4ICYgMHhGRjtcbiAgICAgICAgYXJyYXlbN10gPSBpbmRpY2VzTnVtYmVyICYgMHhGRjtcbiAgICB9IGVsc2Uge1xuICAgICAgICBhcnJheVsyXSA9IHZhbHVlc051bWJlciAmIDB4RkY7XG4gICAgICAgIGFycmF5WzNdID0gdmFsdWVzTnVtYmVyID4+IDggJiAweEZGO1xuICAgICAgICBhcnJheVs0XSA9IHZhbHVlc051bWJlciA+PiAxNiAmIDB4RkY7XG5cbiAgICAgICAgYXJyYXlbNV0gPSBpbmRpY2VzTnVtYmVyICYgMHhGRjtcbiAgICAgICAgYXJyYXlbNl0gPSBpbmRpY2VzTnVtYmVyID4+IDggJiAweEZGO1xuICAgICAgICBhcnJheVs3XSA9IGluZGljZXNOdW1iZXIgPj4gMTYgJiAweEZGO1xuICAgIH1cblxuXG4gICAgdmFyIHBvcyA9IDg7XG5cbiAgICAvKiogQVRUUklCVVRFUyAqKi9cblxuICAgIGZvciAoaSA9IDA7IGkgPCBhdHRyaWJ1dGVLZXlzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGF0dHJpYnV0ZUtleSA9IGF0dHJpYnV0ZUtleXNbaV07XG4gICAgICAgIGF0dHJpYnV0ZSA9IGF0dHJpYnV0ZXNbYXR0cmlidXRlS2V5XTtcbiAgICAgICAgYXR0cmlidXRlVHlwZSA9IHR5cGVvZiBhdHRyaWJ1dGUudHlwZSA9PT0gJ3VuZGVmaW5lZCcgPyBhdHRyaWJ1dGVUeXBlcy5GbG9hdCA6IGF0dHJpYnV0ZS50eXBlO1xuICAgICAgICBhdHRyaWJ1dGVOb3JtYWxpemVkID0gKCEhYXR0cmlidXRlLm5vcm1hbGl6ZWQgPyAxIDogMCk7XG5cbiAgICAgICAgLyoqKiBXUklURSBBVFRSSUJVVEUgSEVBREVSICoqKi9cblxuICAgICAgICBmb3IgKGogPSAwOyBqIDwgYXR0cmlidXRlS2V5Lmxlbmd0aDsgaisrLCBwb3MrKykge1xuICAgICAgICAgICAgYXJyYXlbcG9zXSA9IChhdHRyaWJ1dGVLZXkuY2hhckNvZGVBdChqKSAmIDB4N0YpIHx8IDB4NUY7IC8vIGRlZmF1bHQgdG8gdW5kZXJzY29yZVxuICAgICAgICB9XG5cbiAgICAgICAgcG9zKys7XG5cbiAgICAgICAgYXJyYXlbcG9zXSA9IChcbiAgICAgICAgICAgIGF0dHJpYnV0ZVR5cGUgPDwgNyB8XG4gICAgICAgICAgICBhdHRyaWJ1dGVOb3JtYWxpemVkIDw8IDYgfFxuICAgICAgICAgICAgKChhdHRyaWJ1dGUuY2FyZGluYWxpdHkgLSAxKSAmIDB4MDMpIDw8IDQgfFxuICAgICAgICAgICAgRW5jb2RpbmdUeXBlc1thdHRyaWJ1dGUudmFsdWVzLmNvbnN0cnVjdG9yLm5hbWVdICYgMHgwRlxuICAgICAgICApO1xuXG4gICAgICAgIHBvcysrO1xuXG5cbiAgICAgICAgLy8gcGFkZGluZyB0byBuZXh0IG11bHRpcGxlIG9mIDRcbiAgICAgICAgcG9zID0gTWF0aC5jZWlsKHBvcyAvIDQpICogNDtcblxuICAgICAgICAvKioqIFdSSVRFIEFUVFJJQlVURSBWQUxVRVMgKioqL1xuXG4gICAgICAgIHZhciBhdHRyaWJ1dGVzV3JpdGVBcnJheSA9IGNvcHlUb0J1ZmZlcihhdHRyaWJ1dGUudmFsdWVzLCBidWZmZXIsIHBvcywgYmlnRW5kaWFuKTtcblxuICAgICAgICBwb3MgKz0gYXR0cmlidXRlc1dyaXRlQXJyYXkuYnl0ZUxlbmd0aDtcbiAgICB9XG5cbiAgICAvKioqIFdSSVRFIElORElDRVMgVkFMVUVTICoqKi9cblxuICAgIGlmIChpbmRleGVkR2VvbWV0cnkpIHtcbiAgICAgICAgcG9zID0gTWF0aC5jZWlsKHBvcyAvIDQpICogNDtcblxuICAgICAgICBjb3B5VG9CdWZmZXIoaW5kaWNlcywgYnVmZmVyLCBwb3MsIGJpZ0VuZGlhbik7XG4gICAgfVxuXG4gICAgcmV0dXJuIGJ1ZmZlcjtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBlbmNvZGU7XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIGJpZ0VuZGlhblBsYXRmb3JtID0gbnVsbDtcblxuLyoqXG4gKiBDaGVjayBpZiB0aGUgZW5kaWFubmVzcyBvZiB0aGUgcGxhdGZvcm0gaXMgYmlnLWVuZGlhbiAobW9zdCBzaWduaWZpY2FudCBiaXQgZmlyc3QpXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gVHJ1ZSBpZiBiaWctZW5kaWFuLCBmYWxzZSBpZiBsaXR0bGUtZW5kaWFuXG4gKi9cbmZ1bmN0aW9uIGlzQmlnRW5kaWFuUGxhdGZvcm0gKCkge1xuICAgIGlmIChiaWdFbmRpYW5QbGF0Zm9ybSA9PT0gbnVsbCkge1xuICAgICAgICB2YXIgYnVmZmVyID0gbmV3IEFycmF5QnVmZmVyKDIpLFxuICAgICAgICAgICAgdWludDhBcnJheSA9IG5ldyBVaW50OEFycmF5KGJ1ZmZlciksXG4gICAgICAgICAgICB1aW50MTZBcnJheSA9IG5ldyBVaW50MTZBcnJheShidWZmZXIpO1xuXG4gICAgICAgIHVpbnQ4QXJyYXlbMF0gPSAweEFBOyAvLyBzZXQgZmlyc3QgYnl0ZVxuICAgICAgICB1aW50OEFycmF5WzFdID0gMHhCQjsgLy8gc2V0IHNlY29uZCBieXRlXG4gICAgICAgIGJpZ0VuZGlhblBsYXRmb3JtID0gKHVpbnQxNkFycmF5WzBdID09PSAweEFBQkIpO1xuICAgIH1cblxuICAgIHJldHVybiBiaWdFbmRpYW5QbGF0Zm9ybTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBpc0JpZ0VuZGlhblBsYXRmb3JtO1xuIl19
