!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.prwm=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";

module.exports = {
    AttributeTypes: require('./prwm/attribute-types'),
    isBigEndianPlatform: require('./utils/is-big-endian-platform'),
    encode: require('./prwm/encode'),
    decode: require('./prwm/decode')
};

},{"./prwm/attribute-types":2,"./prwm/decode":3,"./prwm/encode":4,"./utils/is-big-endian-platform":5}],2:[function(require,module,exports){
"use strict";

module.exports = {
    Float: 0,
    Int: 1
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

        values = copyFromBuffer(buffer, arrayType, pos, cardinality * valuesNumber, bigEndian);

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

},{"../utils/is-big-endian-platform":5}],4:[function(require,module,exports){
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

},{"../utils/is-big-endian-platform":5,"./attribute-types":2}],5:[function(require,module,exports){
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL3Vzci9sb2NhbC9saWIvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsImluZGV4LmpzIiwicHJ3bS9hdHRyaWJ1dGUtdHlwZXMuanMiLCJwcndtL2RlY29kZS5qcyIsInByd20vZW5jb2RlLmpzIiwidXRpbHMvaXMtYmlnLWVuZGlhbi1wbGF0Zm9ybS5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNSQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIlwidXNlIHN0cmljdFwiO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBBdHRyaWJ1dGVUeXBlczogcmVxdWlyZSgnLi9wcndtL2F0dHJpYnV0ZS10eXBlcycpLFxuICAgIGlzQmlnRW5kaWFuUGxhdGZvcm06IHJlcXVpcmUoJy4vdXRpbHMvaXMtYmlnLWVuZGlhbi1wbGF0Zm9ybScpLFxuICAgIGVuY29kZTogcmVxdWlyZSgnLi9wcndtL2VuY29kZScpLFxuICAgIGRlY29kZTogcmVxdWlyZSgnLi9wcndtL2RlY29kZScpXG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICAgIEZsb2F0OiAwLFxuICAgIEludDogMVxufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgaXNCaWdFbmRpYW5QbGF0Zm9ybSA9IHJlcXVpcmUoJy4uL3V0aWxzL2lzLWJpZy1lbmRpYW4tcGxhdGZvcm0nKTtcblxuLy8gbWF0Y2ggdGhlIHZhbHVlcyBkZWZpbmVkIGluIHRoZSBzcGVjIHRvIHRoZSBUeXBlZEFycmF5IHR5cGVzXG52YXIgSW52ZXJ0ZWRFbmNvZGluZ1R5cGVzID0gW1xuICAgIG51bGwsXG4gICAgRmxvYXQzMkFycmF5LFxuICAgIG51bGwsXG4gICAgSW50OEFycmF5LFxuICAgIEludDE2QXJyYXksXG4gICAgbnVsbCxcbiAgICBJbnQzMkFycmF5LFxuICAgIFVpbnQ4QXJyYXksXG4gICAgVWludDE2QXJyYXksXG4gICAgbnVsbCxcbiAgICBVaW50MzJBcnJheVxuXTtcblxuLy8gZGVmaW5lIHRoZSBtZXRob2QgdG8gdXNlIG9uIGEgRGF0YVZpZXcsIGNvcnJlc3BvbmRpbmcgdGhlIFR5cGVkQXJyYXkgdHlwZVxudmFyIGdldE1ldGhvZHMgPSB7XG4gICAgVWludDE2QXJyYXk6ICdnZXRVaW50MTYnLFxuICAgIFVpbnQzMkFycmF5OiAnZ2V0VWludDMyJyxcbiAgICBJbnQxNkFycmF5OiAnZ2V0SW50MTYnLFxuICAgIEludDMyQXJyYXk6ICdnZXRJbnQzMicsXG4gICAgRmxvYXQzMkFycmF5OiAnZ2V0RmxvYXQzMidcbn07XG5cbmZ1bmN0aW9uIGNvcHlGcm9tQnVmZmVyIChzb3VyY2VBcnJheUJ1ZmZlciwgdmlld1R5cGUsIHBvc2l0aW9uLCBsZW5ndGgsIGZyb21CaWdFbmRpYW4pIHtcbiAgICB2YXIgYnl0ZXNQZXJFbGVtZW50ID0gdmlld1R5cGUuQllURVNfUEVSX0VMRU1FTlQsXG4gICAgICAgIHJlc3VsdDtcblxuICAgIGlmIChmcm9tQmlnRW5kaWFuID09PSBpc0JpZ0VuZGlhblBsYXRmb3JtKCkgfHwgYnl0ZXNQZXJFbGVtZW50ID09PSAxKSB7XG4gICAgICAgIHJlc3VsdCA9IG5ldyB2aWV3VHlwZShzb3VyY2VBcnJheUJ1ZmZlciwgcG9zaXRpb24sIGxlbmd0aCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIHJlYWRWaWV3ID0gbmV3IERhdGFWaWV3KHNvdXJjZUFycmF5QnVmZmVyLCBwb3NpdGlvbiwgbGVuZ3RoICogYnl0ZXNQZXJFbGVtZW50KSxcbiAgICAgICAgICAgIGdldE1ldGhvZCA9IGdldE1ldGhvZHNbdmlld1R5cGUubmFtZV0sXG4gICAgICAgICAgICBsaXR0bGVFbmRpYW4gPSAhZnJvbUJpZ0VuZGlhbjtcblxuICAgICAgICByZXN1bHQgPSBuZXcgdmlld1R5cGUobGVuZ3RoKTtcblxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICByZXN1bHRbaV0gPSByZWFkVmlld1tnZXRNZXRob2RdKGkgKiBieXRlc1BlckVsZW1lbnQsIGxpdHRsZUVuZGlhbik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiBkZWNvZGUgKGJ1ZmZlcikge1xuICAgIHZhciBhcnJheSA9IG5ldyBVaW50OEFycmF5KGJ1ZmZlciksXG4gICAgICAgIHZlcnNpb24gPSBhcnJheVswXSxcbiAgICAgICAgZmxhZ3MgPSBhcnJheVsxXSxcbiAgICAgICAgaW5kZXhlZEdlb21ldHJ5ID0gISEoZmxhZ3MgPj4gNyksXG4gICAgICAgIGluZGljZXNUeXBlID0gZmxhZ3MgPj4gNiAmIDB4MDEsXG4gICAgICAgIGJpZ0VuZGlhbiA9IChmbGFncyA+PiA1ICYgMHgwMSkgPT09IDEsXG4gICAgICAgIGF0dHJpYnV0ZXNOdW1iZXIgPSBmbGFncyAmIDB4MUYsXG4gICAgICAgIHZhbHVlc051bWJlciA9IDAsXG4gICAgICAgIGluZGljZXNOdW1iZXIgPSAwO1xuXG4gICAgaWYgKGJpZ0VuZGlhbikge1xuICAgICAgICB2YWx1ZXNOdW1iZXIgPSAoYXJyYXlbMl0gPDwgMTYpICsgKGFycmF5WzNdIDw8IDgpICsgYXJyYXlbNF07XG4gICAgICAgIGluZGljZXNOdW1iZXIgPSAoYXJyYXlbNV0gPDwgMTYpICsgKGFycmF5WzZdIDw8IDgpICsgYXJyYXlbN107XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdmFsdWVzTnVtYmVyID0gYXJyYXlbMl0gKyAoYXJyYXlbM10gPDwgOCkgKyAoYXJyYXlbNF0gPDwgMTYpO1xuICAgICAgICBpbmRpY2VzTnVtYmVyID0gYXJyYXlbNV0gKyAoYXJyYXlbNl0gPDwgOCkgKyAoYXJyYXlbN10gPDwgMTYpO1xuICAgIH1cblxuICAgIHZhciBwb3MgPSA4O1xuXG4gICAgdmFyIGF0dHJpYnV0ZXMgPSB7fSxcbiAgICAgICAgYXR0cmlidXRlTmFtZSxcbiAgICAgICAgY2hhcixcbiAgICAgICAgYXR0cmlidXRlTm9ybWFsaXplZCxcbiAgICAgICAgYXR0cmlidXRlVHlwZSxcbiAgICAgICAgY2FyZGluYWxpdHksXG4gICAgICAgIGVuY29kaW5nVHlwZSxcbiAgICAgICAgYXJyYXlUeXBlLFxuICAgICAgICB2YWx1ZXMsXG4gICAgICAgIGk7XG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgYXR0cmlidXRlc051bWJlcjsgaSsrKSB7XG4gICAgICAgIGF0dHJpYnV0ZU5hbWUgPSAnJztcblxuICAgICAgICB3aGlsZSAocG9zIDwgYXJyYXkubGVuZ3RoKSB7XG4gICAgICAgICAgICBjaGFyID0gYXJyYXlbcG9zXTtcbiAgICAgICAgICAgIHBvcysrO1xuXG4gICAgICAgICAgICBpZiAoY2hhciA9PT0gMCkge1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBhdHRyaWJ1dGVOYW1lICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoY2hhcik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmbGFncyA9IGFycmF5W3Bvc107XG5cbiAgICAgICAgYXR0cmlidXRlVHlwZSA9IGZsYWdzID4+IDcgJiAweDAxO1xuICAgICAgICBhdHRyaWJ1dGVOb3JtYWxpemVkID0gISEoZmxhZ3MgPj4gNiAmIDB4MDEpO1xuICAgICAgICBjYXJkaW5hbGl0eSA9IChmbGFncyA+PiA0ICYgMHgwMykgKyAxO1xuICAgICAgICBlbmNvZGluZ1R5cGUgPSBmbGFncyAmIDB4MEY7XG4gICAgICAgIGFycmF5VHlwZSA9IEludmVydGVkRW5jb2RpbmdUeXBlc1tlbmNvZGluZ1R5cGVdO1xuXG4gICAgICAgIHBvcysrO1xuXG4gICAgICAgIC8vIHBhZGRpbmcgdG8gbmV4dCBtdWx0aXBsZSBvZiA0XG4gICAgICAgIHBvcyA9IE1hdGguY2VpbChwb3MgLyA0KSAqIDQ7XG5cbiAgICAgICAgdmFsdWVzID0gY29weUZyb21CdWZmZXIoYnVmZmVyLCBhcnJheVR5cGUsIHBvcywgY2FyZGluYWxpdHkgKiB2YWx1ZXNOdW1iZXIsIGJpZ0VuZGlhbik7XG5cbiAgICAgICAgcG9zKz0gYXJyYXlUeXBlLkJZVEVTX1BFUl9FTEVNRU5UICogY2FyZGluYWxpdHkgKiB2YWx1ZXNOdW1iZXI7XG5cbiAgICAgICAgYXR0cmlidXRlc1thdHRyaWJ1dGVOYW1lXSA9IHtcbiAgICAgICAgICAgIHR5cGU6IGF0dHJpYnV0ZVR5cGUsXG4gICAgICAgICAgICBub3JtYWxpemVkOiBhdHRyaWJ1dGVOb3JtYWxpemVkLFxuICAgICAgICAgICAgY2FyZGluYWxpdHk6IGNhcmRpbmFsaXR5LFxuICAgICAgICAgICAgdmFsdWVzOiB2YWx1ZXNcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBwb3MgPSBNYXRoLmNlaWwocG9zIC8gNCkgKiA0O1xuXG4gICAgdmFyIGluZGljZXMgPSBudWxsO1xuXG4gICAgaWYgKGluZGV4ZWRHZW9tZXRyeSkge1xuICAgICAgICBpbmRpY2VzID0gY29weUZyb21CdWZmZXIoXG4gICAgICAgICAgICBidWZmZXIsXG4gICAgICAgICAgICBpbmRpY2VzVHlwZSA9PT0gMSA/IFVpbnQzMkFycmF5IDogVWludDE2QXJyYXksXG4gICAgICAgICAgICBwb3MsXG4gICAgICAgICAgICBpbmRpY2VzTnVtYmVyLFxuICAgICAgICAgICAgYmlnRW5kaWFuXG4gICAgICAgICk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgdmVyc2lvbjogdmVyc2lvbixcbiAgICAgICAgYXR0cmlidXRlczogYXR0cmlidXRlcyxcbiAgICAgICAgaW5kaWNlczogaW5kaWNlc1xuICAgIH07XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZGVjb2RlO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBpc0JpZ0VuZGlhblBsYXRmb3JtID0gcmVxdWlyZSgnLi4vdXRpbHMvaXMtYmlnLWVuZGlhbi1wbGF0Zm9ybScpLFxuICAgIGF0dHJpYnV0ZVR5cGVzID0gcmVxdWlyZSgnLi9hdHRyaWJ1dGUtdHlwZXMnKTtcblxuLy8gbWF0Y2ggdGhlIFR5cGVkQXJyYXkgdHlwZSB3aXRoIHRoZSB2YWx1ZSBkZWZpbmVkIGluIHRoZSBzcGVjXG52YXIgRW5jb2RpbmdUeXBlcyA9IHtcbiAgICBGbG9hdDMyQXJyYXk6IDEsXG4gICAgSW50OEFycmF5OiAzLFxuICAgIEludDE2QXJyYXk6IDQsXG4gICAgSW50MzJBcnJheTogNixcbiAgICBVaW50OEFycmF5OiA3LFxuICAgIFVpbnQxNkFycmF5OiA4LFxuICAgIFVpbnQzMkFycmF5OiAxMFxufTtcblxuLy8gZGVmaW5lIHRoZSBtZXRob2QgdG8gdXNlIG9uIGEgRGF0YVZpZXcsIGNvcnJlc3BvbmRpbmcgdGhlIFR5cGVkQXJyYXkgdHlwZVxudmFyIHNldE1ldGhvZHMgPSB7XG4gICAgVWludDE2QXJyYXk6ICdzZXRVaW50MTYnLFxuICAgIFVpbnQzMkFycmF5OiAnc2V0VWludDMyJyxcbiAgICBJbnQxNkFycmF5OiAnc2V0SW50MTYnLFxuICAgIEludDMyQXJyYXk6ICdzZXRJbnQzMicsXG4gICAgRmxvYXQzMkFycmF5OiAnc2V0RmxvYXQzMidcbn07XG5cbmZ1bmN0aW9uIGNvcHlUb0J1ZmZlciAoc291cmNlVHlwZWRBcnJheSwgZGVzdGluYXRpb25BcnJheUJ1ZmZlciwgcG9zaXRpb24sIGJpZ0VuZGlhbikge1xuICAgIHZhciBsZW5ndGggPSBzb3VyY2VUeXBlZEFycmF5Lmxlbmd0aCxcbiAgICAgICAgYnl0ZXNQZXJFbGVtZW50ID0gc291cmNlVHlwZWRBcnJheS5CWVRFU19QRVJfRUxFTUVOVDtcblxuICAgIHZhciB3cml0ZUFycmF5ID0gbmV3IHNvdXJjZVR5cGVkQXJyYXkuY29uc3RydWN0b3IoZGVzdGluYXRpb25BcnJheUJ1ZmZlciwgcG9zaXRpb24sIGxlbmd0aCk7XG5cbiAgICBpZiAoYmlnRW5kaWFuID09PSBpc0JpZ0VuZGlhblBsYXRmb3JtKCkgfHwgYnl0ZXNQZXJFbGVtZW50ID09PSAxKSB7XG4gICAgICAgIC8vIGRlc2lyZWQgZW5kaWFubmVzcyBpcyB0aGUgc2FtZSBhcyB0aGUgcGxhdGZvcm0sIG9yIHRoZSBlbmRpYW5uZXNzIGRvZXNuJ3QgbWF0dGVyICgxIGJ5dGUpXG4gICAgICAgIHdyaXRlQXJyYXkuc2V0KHNvdXJjZVR5cGVkQXJyYXkuc3ViYXJyYXkoMCwgbGVuZ3RoKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIHdyaXRlVmlldyA9IG5ldyBEYXRhVmlldyhkZXN0aW5hdGlvbkFycmF5QnVmZmVyLCBwb3NpdGlvbiwgbGVuZ3RoICogYnl0ZXNQZXJFbGVtZW50KSxcbiAgICAgICAgICAgIHNldE1ldGhvZCA9IHNldE1ldGhvZHNbc291cmNlVHlwZWRBcnJheS5jb25zdHJ1Y3Rvci5uYW1lXSxcbiAgICAgICAgICAgIGxpdHRsZUVuZGlhbiA9ICFiaWdFbmRpYW4sXG4gICAgICAgICAgICBpID0gMDtcblxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHdyaXRlVmlld1tzZXRNZXRob2RdKGkgKiBieXRlc1BlckVsZW1lbnQsIHNvdXJjZVR5cGVkQXJyYXlbaV0sIGxpdHRsZUVuZGlhbik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gd3JpdGVBcnJheTtcbn1cblxuZnVuY3Rpb24gZW5jb2RlIChhdHRyaWJ1dGVzLCBpbmRpY2VzLCBiaWdFbmRpYW4pIHtcbiAgICB2YXIgYXR0cmlidXRlS2V5cyA9IGF0dHJpYnV0ZXMgPyBPYmplY3Qua2V5cyhhdHRyaWJ1dGVzKSA6IFtdLFxuICAgICAgICBpbmRleGVkR2VvbWV0cnkgPSAhIWluZGljZXMsXG4gICAgICAgIGksIGo7XG5cbiAgICAvKiogUFJFTElNSU5BUlkgQ0hFQ0tTICoqL1xuXG4gICAgLy8gdGhpcyBpcyBub3Qgc3VwcG9zZWQgdG8gY2F0Y2ggYWxsIHRoZSBwb3NzaWJsZSBlcnJvcnMsIG9ubHkgc29tZSBvZiB0aGUgZ290Y2hhc1xuXG4gICAgaWYgKGF0dHJpYnV0ZUtleXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignUFJXTSBlbmNvZGVyOiBUaGUgbW9kZWwgbXVzdCBoYXZlIGF0IGxlYXN0IG9uZSBhdHRyaWJ1dGUnKTtcbiAgICB9XG5cbiAgICBpZiAoYXR0cmlidXRlS2V5cy5sZW5ndGggPiAzMSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BSV00gZW5jb2RlcjogVGhlIG1vZGVsIGNhbiBoYXZlIGF0IG1vc3QgMzEgYXR0cmlidXRlcycpO1xuICAgIH1cblxuICAgIGZvciAoaSA9IDA7IGkgPCBhdHRyaWJ1dGVLZXlzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmICghRW5jb2RpbmdUeXBlcy5oYXNPd25Qcm9wZXJ0eShhdHRyaWJ1dGVzW2F0dHJpYnV0ZUtleXNbaV1dLnZhbHVlcy5jb25zdHJ1Y3Rvci5uYW1lKSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdQUldNIGVuY29kZXI6IFVuc3VwcG9ydGVkIGF0dHJpYnV0ZSB2YWx1ZXMgdHlwZTogJyArIGF0dHJpYnV0ZXNbYXR0cmlidXRlS2V5c1tpXV0udmFsdWVzLmNvbnN0cnVjdG9yLm5hbWUpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGluZGV4ZWRHZW9tZXRyeSAmJiBpbmRpY2VzLmNvbnN0cnVjdG9yLm5hbWUgIT09ICdVaW50MTZBcnJheScgJiYgaW5kaWNlcy5jb25zdHJ1Y3Rvci5uYW1lICE9PSAnVWludDMyQXJyYXknKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignUFJXTSBlbmNvZGVyOiBUaGUgaW5kaWNlcyBtdXN0IGJlIHJlcHJlc2VudGVkIGFzIGFuIFVpbnQxNkFycmF5IG9yIGFuIFVpbnQzMkFycmF5Jyk7XG4gICAgfVxuXG4gICAgLyoqIEdFVCBUSEUgVFlQRSBPRiBJTkRJQ0VTIEFTIFdFTEwgQVMgVEhFIE5VTUJFUiBPRiBJTkRJQ0VTIEFORCBBVFRSSUJVVEUgVkFMVUVTICoqL1xuXG4gICAgdmFyIHZhbHVlc051bWJlciA9IGF0dHJpYnV0ZXNbYXR0cmlidXRlS2V5c1swXV0udmFsdWVzLmxlbmd0aCAvIGF0dHJpYnV0ZXNbYXR0cmlidXRlS2V5c1swXV0uY2FyZGluYWxpdHkgfCAwLFxuICAgICAgICBpbmRpY2VzTnVtYmVyID0gaW5kZXhlZEdlb21ldHJ5ID8gaW5kaWNlcy5sZW5ndGggOiAwLFxuICAgICAgICBpbmRpY2VzVHlwZSA9IGluZGV4ZWRHZW9tZXRyeSAmJiBpbmRpY2VzLmNvbnN0cnVjdG9yLm5hbWUgPT09ICdVaW50MzJBcnJheScgPyAxIDogMDtcblxuICAgIC8qKiBHRVQgVEhFIEZJTEUgTEVOR1RIICoqL1xuXG4gICAgdmFyIHRvdGFsTGVuZ3RoID0gOCxcbiAgICAgICAgYXR0cmlidXRlS2V5LFxuICAgICAgICBhdHRyaWJ1dGUsXG4gICAgICAgIGF0dHJpYnV0ZVR5cGUsXG4gICAgICAgIGF0dHJpYnV0ZU5vcm1hbGl6ZWQ7XG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgYXR0cmlidXRlS2V5cy5sZW5ndGg7IGkrKykge1xuICAgICAgICBhdHRyaWJ1dGVLZXkgPSBhdHRyaWJ1dGVLZXlzW2ldO1xuICAgICAgICBhdHRyaWJ1dGUgPSBhdHRyaWJ1dGVzW2F0dHJpYnV0ZUtleV07XG4gICAgICAgIHRvdGFsTGVuZ3RoICs9IGF0dHJpYnV0ZUtleS5sZW5ndGggKyAyOyAvLyBOVUwgYnl0ZSArIGZsYWcgYnl0ZSArIHBhZGRpbmdcbiAgICAgICAgdG90YWxMZW5ndGggPSBNYXRoLmNlaWwodG90YWxMZW5ndGggLyA0KSAqIDQ7IC8vIHBhZGRpbmdcbiAgICAgICAgdG90YWxMZW5ndGggKz0gYXR0cmlidXRlLnZhbHVlcy5ieXRlTGVuZ3RoO1xuICAgIH1cblxuICAgIGlmIChpbmRleGVkR2VvbWV0cnkpIHtcbiAgICAgICAgdG90YWxMZW5ndGggPSBNYXRoLmNlaWwodG90YWxMZW5ndGggLyA0KSAqIDQ7XG4gICAgICAgIHRvdGFsTGVuZ3RoICs9IGluZGljZXMuYnl0ZUxlbmd0aDtcbiAgICB9XG5cbiAgICAvKiogSU5JVElBTElaRSBUSEUgQlVGRkVSICovXG5cbiAgICB2YXIgYnVmZmVyID0gbmV3IEFycmF5QnVmZmVyKHRvdGFsTGVuZ3RoKSxcbiAgICAgICAgYXJyYXkgPSBuZXcgVWludDhBcnJheShidWZmZXIpO1xuXG4gICAgLyoqIEhFQURFUiAqKi9cblxuICAgIGFycmF5WzBdID0gMTtcbiAgICBhcnJheVsxXSA9IChcbiAgICAgICAgaW5kZXhlZEdlb21ldHJ5IDw8IDcgfFxuICAgICAgICBpbmRpY2VzVHlwZSA8PCA2IHxcbiAgICAgICAgKGJpZ0VuZGlhbiA/IDEgOiAwKSA8PCA1IHxcbiAgICAgICAgYXR0cmlidXRlS2V5cy5sZW5ndGggJiAweDFGXG4gICAgKTtcblxuICAgIGlmIChiaWdFbmRpYW4pIHtcbiAgICAgICAgYXJyYXlbMl0gPSB2YWx1ZXNOdW1iZXIgPj4gMTYgJiAweEZGO1xuICAgICAgICBhcnJheVszXSA9IHZhbHVlc051bWJlciA+PiA4ICYgMHhGRjtcbiAgICAgICAgYXJyYXlbNF0gPSB2YWx1ZXNOdW1iZXIgJiAweEZGO1xuXG4gICAgICAgIGFycmF5WzVdID0gaW5kaWNlc051bWJlciA+PiAxNiAmIDB4RkY7XG4gICAgICAgIGFycmF5WzZdID0gaW5kaWNlc051bWJlciA+PiA4ICYgMHhGRjtcbiAgICAgICAgYXJyYXlbN10gPSBpbmRpY2VzTnVtYmVyICYgMHhGRjtcbiAgICB9IGVsc2Uge1xuICAgICAgICBhcnJheVsyXSA9IHZhbHVlc051bWJlciAmIDB4RkY7XG4gICAgICAgIGFycmF5WzNdID0gdmFsdWVzTnVtYmVyID4+IDggJiAweEZGO1xuICAgICAgICBhcnJheVs0XSA9IHZhbHVlc051bWJlciA+PiAxNiAmIDB4RkY7XG5cbiAgICAgICAgYXJyYXlbNV0gPSBpbmRpY2VzTnVtYmVyICYgMHhGRjtcbiAgICAgICAgYXJyYXlbNl0gPSBpbmRpY2VzTnVtYmVyID4+IDggJiAweEZGO1xuICAgICAgICBhcnJheVs3XSA9IGluZGljZXNOdW1iZXIgPj4gMTYgJiAweEZGO1xuICAgIH1cblxuXG4gICAgdmFyIHBvcyA9IDg7XG5cbiAgICAvKiogQVRUUklCVVRFUyAqKi9cblxuICAgIGZvciAoaSA9IDA7IGkgPCBhdHRyaWJ1dGVLZXlzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGF0dHJpYnV0ZUtleSA9IGF0dHJpYnV0ZUtleXNbaV07XG4gICAgICAgIGF0dHJpYnV0ZSA9IGF0dHJpYnV0ZXNbYXR0cmlidXRlS2V5XTtcbiAgICAgICAgYXR0cmlidXRlVHlwZSA9IHR5cGVvZiBhdHRyaWJ1dGUudHlwZSA9PT0gJ3VuZGVmaW5lZCcgPyBhdHRyaWJ1dGVUeXBlcy5GbG9hdCA6IGF0dHJpYnV0ZS50eXBlO1xuICAgICAgICBhdHRyaWJ1dGVOb3JtYWxpemVkID0gKCEhYXR0cmlidXRlLm5vcm1hbGl6ZWQgPyAxIDogMCk7XG5cbiAgICAgICAgLyoqKiBXUklURSBBVFRSSUJVVEUgSEVBREVSICoqKi9cblxuICAgICAgICBmb3IgKGogPSAwOyBqIDwgYXR0cmlidXRlS2V5Lmxlbmd0aDsgaisrLCBwb3MrKykge1xuICAgICAgICAgICAgYXJyYXlbcG9zXSA9IChhdHRyaWJ1dGVLZXkuY2hhckNvZGVBdChqKSAmIDB4N0YpIHx8IDB4NUY7IC8vIGRlZmF1bHQgdG8gdW5kZXJzY29yZVxuICAgICAgICB9XG5cbiAgICAgICAgcG9zKys7XG5cbiAgICAgICAgYXJyYXlbcG9zXSA9IChcbiAgICAgICAgICAgIGF0dHJpYnV0ZVR5cGUgPDwgNyB8XG4gICAgICAgICAgICBhdHRyaWJ1dGVOb3JtYWxpemVkIDw8IDYgfFxuICAgICAgICAgICAgKChhdHRyaWJ1dGUuY2FyZGluYWxpdHkgLSAxKSAmIDB4MDMpIDw8IDQgfFxuICAgICAgICAgICAgRW5jb2RpbmdUeXBlc1thdHRyaWJ1dGUudmFsdWVzLmNvbnN0cnVjdG9yLm5hbWVdICYgMHgwRlxuICAgICAgICApO1xuXG4gICAgICAgIHBvcysrO1xuXG5cbiAgICAgICAgLy8gcGFkZGluZyB0byBuZXh0IG11bHRpcGxlIG9mIDRcbiAgICAgICAgcG9zID0gTWF0aC5jZWlsKHBvcyAvIDQpICogNDtcblxuICAgICAgICAvKioqIFdSSVRFIEFUVFJJQlVURSBWQUxVRVMgKioqL1xuXG4gICAgICAgIHZhciBhdHRyaWJ1dGVzV3JpdGVBcnJheSA9IGNvcHlUb0J1ZmZlcihhdHRyaWJ1dGUudmFsdWVzLCBidWZmZXIsIHBvcywgYmlnRW5kaWFuKTtcblxuICAgICAgICBwb3MgKz0gYXR0cmlidXRlc1dyaXRlQXJyYXkuYnl0ZUxlbmd0aDtcbiAgICB9XG5cbiAgICAvKioqIFdSSVRFIElORElDRVMgVkFMVUVTICoqKi9cblxuICAgIGlmIChpbmRleGVkR2VvbWV0cnkpIHtcbiAgICAgICAgcG9zID0gTWF0aC5jZWlsKHBvcyAvIDQpICogNDtcblxuICAgICAgICBjb3B5VG9CdWZmZXIoaW5kaWNlcywgYnVmZmVyLCBwb3MsIGJpZ0VuZGlhbik7XG4gICAgfVxuXG4gICAgcmV0dXJuIGJ1ZmZlcjtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBlbmNvZGU7XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIGJpZ0VuZGlhblBsYXRmb3JtID0gbnVsbDtcblxuLyoqXG4gKiBDaGVjayBpZiB0aGUgZW5kaWFubmVzcyBvZiB0aGUgcGxhdGZvcm0gaXMgYmlnLWVuZGlhbiAobW9zdCBzaWduaWZpY2FudCBiaXQgZmlyc3QpXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gVHJ1ZSBpZiBiaWctZW5kaWFuLCBmYWxzZSBpZiBsaXR0bGUtZW5kaWFuXG4gKi9cbmZ1bmN0aW9uIGlzQmlnRW5kaWFuUGxhdGZvcm0gKCkge1xuICAgIGlmIChiaWdFbmRpYW5QbGF0Zm9ybSA9PT0gbnVsbCkge1xuICAgICAgICB2YXIgYnVmZmVyID0gbmV3IEFycmF5QnVmZmVyKDIpLFxuICAgICAgICAgICAgdWludDhBcnJheSA9IG5ldyBVaW50OEFycmF5KGJ1ZmZlciksXG4gICAgICAgICAgICB1aW50MTZBcnJheSA9IG5ldyBVaW50MTZBcnJheShidWZmZXIpO1xuXG4gICAgICAgIHVpbnQ4QXJyYXlbMF0gPSAweEFBOyAvLyBzZXQgZmlyc3QgYnl0ZVxuICAgICAgICB1aW50OEFycmF5WzFdID0gMHhCQjsgLy8gc2V0IHNlY29uZCBieXRlXG4gICAgICAgIGJpZ0VuZGlhblBsYXRmb3JtID0gKHVpbnQxNkFycmF5WzBdID09PSAweEFBQkIpO1xuICAgIH1cblxuICAgIHJldHVybiBiaWdFbmRpYW5QbGF0Zm9ybTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBpc0JpZ0VuZGlhblBsYXRmb3JtO1xuIl19
