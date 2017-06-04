!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.prwm=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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

},{}]},{},[1])(1)
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL3Vzci9sb2NhbC9saWIvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsImluZGV4LmpzIiwicHJ3bS9hdHRyaWJ1dGUtdHlwZXMuanMiLCJwcndtL2RlY29kZS5qcyIsInByd20vZW5jb2RlLmpzIiwidXRpbHMvaW5mZXItYXR0cmlidXRlLXR5cGUuanMiLCJ1dGlscy9pcy1iaWctZW5kaWFuLXBsYXRmb3JtLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkxBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIlwidXNlIHN0cmljdFwiO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBBdHRyaWJ1dGVUeXBlczogcmVxdWlyZSgnLi9wcndtL2F0dHJpYnV0ZS10eXBlcycpLFxuICAgIGlzQmlnRW5kaWFuUGxhdGZvcm06IHJlcXVpcmUoJy4vdXRpbHMvaXMtYmlnLWVuZGlhbi1wbGF0Zm9ybScpLFxuICAgIGVuY29kZTogcmVxdWlyZSgnLi9wcndtL2VuY29kZScpLFxuICAgIGRlY29kZTogcmVxdWlyZSgnLi9wcndtL2RlY29kZScpXG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICAgIEludDogMCxcbiAgICBVaW50OiAxLFxuICAgIEZsb2F0OiAyXG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBpc0JpZ0VuZGlhblBsYXRmb3JtID0gcmVxdWlyZSgnLi4vdXRpbHMvaXMtYmlnLWVuZGlhbi1wbGF0Zm9ybScpO1xuXG4vLyBtYXRjaCB0aGUgdmFsdWVzIGRlZmluZWQgaW4gdGhlIHNwZWMgdG8gdGhlIFR5cGVkQXJyYXkgdHlwZXNcbnZhciBJbnZlcnRlZEVuY29kaW5nVHlwZXMgPSBbXG4gICAgbnVsbCxcbiAgICBGbG9hdDMyQXJyYXksXG4gICAgbnVsbCxcbiAgICBJbnQ4QXJyYXksXG4gICAgSW50MTZBcnJheSxcbiAgICBudWxsLFxuICAgIEludDMyQXJyYXksXG4gICAgVWludDhBcnJheSxcbiAgICBVaW50MTZBcnJheSxcbiAgICBudWxsLFxuICAgIFVpbnQzMkFycmF5XG5dO1xuXG4vLyBkZWZpbmUgdGhlIG1ldGhvZCB0byB1c2Ugb24gYSBEYXRhVmlldywgY29ycmVzcG9uZGluZyB0aGUgVHlwZWRBcnJheSB0eXBlXG52YXIgZ2V0TWV0aG9kcyA9IHtcbiAgICBVaW50MTZBcnJheTogJ2dldFVpbnQxNicsXG4gICAgVWludDMyQXJyYXk6ICdnZXRVaW50MzInLFxuICAgIEludDE2QXJyYXk6ICdnZXRJbnQxNicsXG4gICAgSW50MzJBcnJheTogJ2dldEludDMyJyxcbiAgICBGbG9hdDMyQXJyYXk6ICdnZXRGbG9hdDMyJ1xufTtcblxuZnVuY3Rpb24gY29weUZyb21CdWZmZXIgKHNvdXJjZUFycmF5QnVmZmVyLCB2aWV3VHlwZSwgcG9zaXRpb24sIGxlbmd0aCwgZnJvbUJpZ0VuZGlhbikge1xuICAgIHZhciBieXRlc1BlckVsZW1lbnQgPSB2aWV3VHlwZS5CWVRFU19QRVJfRUxFTUVOVCxcbiAgICAgICAgcmVzdWx0O1xuXG4gICAgaWYgKGZyb21CaWdFbmRpYW4gPT09IGlzQmlnRW5kaWFuUGxhdGZvcm0oKSB8fCBieXRlc1BlckVsZW1lbnQgPT09IDEpIHtcbiAgICAgICAgcmVzdWx0ID0gbmV3IHZpZXdUeXBlKHNvdXJjZUFycmF5QnVmZmVyLCBwb3NpdGlvbiwgbGVuZ3RoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgcmVhZFZpZXcgPSBuZXcgRGF0YVZpZXcoc291cmNlQXJyYXlCdWZmZXIsIHBvc2l0aW9uLCBsZW5ndGggKiBieXRlc1BlckVsZW1lbnQpLFxuICAgICAgICAgICAgZ2V0TWV0aG9kID0gZ2V0TWV0aG9kc1t2aWV3VHlwZS5uYW1lXSxcbiAgICAgICAgICAgIGxpdHRsZUVuZGlhbiA9ICFmcm9tQmlnRW5kaWFuO1xuXG4gICAgICAgIHJlc3VsdCA9IG5ldyB2aWV3VHlwZShsZW5ndGgpO1xuXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHJlc3VsdFtpXSA9IHJlYWRWaWV3W2dldE1ldGhvZF0oaSAqIGJ5dGVzUGVyRWxlbWVudCwgbGl0dGxlRW5kaWFuKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiByZXN1bHQ7XG59XG5cbmZ1bmN0aW9uIGRlY29kZSAoYnVmZmVyKSB7XG4gICAgdmFyIGFycmF5ID0gbmV3IFVpbnQ4QXJyYXkoYnVmZmVyKSxcbiAgICAgICAgdmVyc2lvbiA9IGFycmF5WzBdLFxuICAgICAgICBmbGFncyA9IGFycmF5WzFdLFxuICAgICAgICBpbmRleGVkR2VvbWV0cnkgPSAhIShmbGFncyA+PiA3KSxcbiAgICAgICAgaW5kaWNlc1R5cGUgPSBmbGFncyA+PiA2ICYgMHgwMSxcbiAgICAgICAgYmlnRW5kaWFuID0gKGZsYWdzID4+IDUgJiAweDAxKSA9PT0gMSxcbiAgICAgICAgYXR0cmlidXRlc051bWJlciA9IGZsYWdzICYgMHgxRixcbiAgICAgICAgdmFsdWVzTnVtYmVyID0gMCxcbiAgICAgICAgaW5kaWNlc051bWJlciA9IDA7XG5cbiAgICBpZiAoYmlnRW5kaWFuKSB7XG4gICAgICAgIHZhbHVlc051bWJlciA9IChhcnJheVsyXSA8PCAxNikgKyAoYXJyYXlbM10gPDwgOCkgKyBhcnJheVs0XTtcbiAgICAgICAgaW5kaWNlc051bWJlciA9IChhcnJheVs1XSA8PCAxNikgKyAoYXJyYXlbNl0gPDwgOCkgKyBhcnJheVs3XTtcbiAgICB9IGVsc2Uge1xuICAgICAgICB2YWx1ZXNOdW1iZXIgPSBhcnJheVsyXSArIChhcnJheVszXSA8PCA4KSArIChhcnJheVs0XSA8PCAxNik7XG4gICAgICAgIGluZGljZXNOdW1iZXIgPSBhcnJheVs1XSArIChhcnJheVs2XSA8PCA4KSArIChhcnJheVs3XSA8PCAxNik7XG4gICAgfVxuXG4gICAgdmFyIHBvcyA9IDg7XG5cbiAgICB2YXIgYXR0cmlidXRlcyA9IHt9LFxuICAgICAgICBhdHRyaWJ1dGVOYW1lLFxuICAgICAgICBjaGFyLFxuICAgICAgICBhdHRyaWJ1dGVUeXBlLFxuICAgICAgICBjYXJkaW5hbGl0eSxcbiAgICAgICAgZW5jb2RpbmdUeXBlLFxuICAgICAgICBhcnJheVR5cGUsXG4gICAgICAgIHZhbHVlcyxcbiAgICAgICAgaTtcblxuICAgIGZvciAoaSA9IDA7IGkgPCBhdHRyaWJ1dGVzTnVtYmVyOyBpKyspIHtcbiAgICAgICAgYXR0cmlidXRlTmFtZSA9ICcnO1xuXG4gICAgICAgIHdoaWxlIChwb3MgPCBhcnJheS5sZW5ndGgpIHtcbiAgICAgICAgICAgIGNoYXIgPSBhcnJheVtwb3NdO1xuICAgICAgICAgICAgcG9zKys7XG5cbiAgICAgICAgICAgIGlmIChjaGFyID09PSAwKSB7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGF0dHJpYnV0ZU5hbWUgKz0gU3RyaW5nLmZyb21DaGFyQ29kZShjaGFyKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGZsYWdzID0gYXJyYXlbcG9zXTtcblxuICAgICAgICBhdHRyaWJ1dGVUeXBlID0gZmxhZ3MgPj4gNiAmIDB4MDM7XG4gICAgICAgIGNhcmRpbmFsaXR5ID0gKGZsYWdzID4+IDQgJiAweDAzKSArIDE7XG4gICAgICAgIGVuY29kaW5nVHlwZSA9IGZsYWdzICYgMHgwRjtcbiAgICAgICAgYXJyYXlUeXBlID0gSW52ZXJ0ZWRFbmNvZGluZ1R5cGVzW2VuY29kaW5nVHlwZV07XG5cbiAgICAgICAgcG9zKys7XG5cbiAgICAgICAgLy8gcGFkZGluZyB0byBuZXh0IG11bHRpcGxlIG9mIDRcbiAgICAgICAgcG9zID0gTWF0aC5jZWlsKHBvcyAvIDQpICogNDtcblxuICAgICAgICB2YWx1ZXMgPSBjb3B5RnJvbUJ1ZmZlcihidWZmZXIsIGFycmF5VHlwZSwgcG9zLCBjYXJkaW5hbGl0eSAqIHZhbHVlc051bWJlciwgYmlnRW5kaWFuKTtcblxuICAgICAgICBwb3MrPSBhcnJheVR5cGUuQllURVNfUEVSX0VMRU1FTlQgKiBjYXJkaW5hbGl0eSAqIHZhbHVlc051bWJlcjtcblxuICAgICAgICBhdHRyaWJ1dGVzW2F0dHJpYnV0ZU5hbWVdID0ge1xuICAgICAgICAgICAgdHlwZTogYXR0cmlidXRlVHlwZSxcbiAgICAgICAgICAgIGNhcmRpbmFsaXR5OiBjYXJkaW5hbGl0eSxcbiAgICAgICAgICAgIHZhbHVlczogdmFsdWVzXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcG9zID0gTWF0aC5jZWlsKHBvcyAvIDQpICogNDtcblxuICAgIHZhciBpbmRpY2VzID0gbnVsbDtcblxuICAgIGlmIChpbmRleGVkR2VvbWV0cnkpIHtcbiAgICAgICAgaW5kaWNlcyA9IGNvcHlGcm9tQnVmZmVyKFxuICAgICAgICAgICAgYnVmZmVyLFxuICAgICAgICAgICAgaW5kaWNlc1R5cGUgPT09IDEgPyBVaW50MzJBcnJheSA6IFVpbnQxNkFycmF5LFxuICAgICAgICAgICAgcG9zLFxuICAgICAgICAgICAgaW5kaWNlc051bWJlcixcbiAgICAgICAgICAgIGJpZ0VuZGlhblxuICAgICAgICApO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICAgIHZlcnNpb246IHZlcnNpb24sXG4gICAgICAgIGF0dHJpYnV0ZXM6IGF0dHJpYnV0ZXMsXG4gICAgICAgIGluZGljZXM6IGluZGljZXNcbiAgICB9O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGRlY29kZTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgaXNCaWdFbmRpYW5QbGF0Zm9ybSA9IHJlcXVpcmUoJy4uL3V0aWxzL2lzLWJpZy1lbmRpYW4tcGxhdGZvcm0nKSxcbiAgICBpbmZlckF0dHJpYnV0ZVR5cGUgPSByZXF1aXJlKCcuLi91dGlscy9pbmZlci1hdHRyaWJ1dGUtdHlwZScpO1xuXG4vLyBtYXRjaCB0aGUgVHlwZWRBcnJheSB0eXBlIHdpdGggdGhlIHZhbHVlIGRlZmluZWQgaW4gdGhlIHNwZWNcbnZhciBFbmNvZGluZ1R5cGVzID0ge1xuICAgIEZsb2F0MzJBcnJheTogMSxcbiAgICBJbnQ4QXJyYXk6IDMsXG4gICAgSW50MTZBcnJheTogNCxcbiAgICBJbnQzMkFycmF5OiA2LFxuICAgIFVpbnQ4QXJyYXk6IDcsXG4gICAgVWludDE2QXJyYXk6IDgsXG4gICAgVWludDMyQXJyYXk6IDEwXG59O1xuXG4vLyBkZWZpbmUgdGhlIG1ldGhvZCB0byB1c2Ugb24gYSBEYXRhVmlldywgY29ycmVzcG9uZGluZyB0aGUgVHlwZWRBcnJheSB0eXBlXG52YXIgc2V0TWV0aG9kcyA9IHtcbiAgICBVaW50MTZBcnJheTogJ3NldFVpbnQxNicsXG4gICAgVWludDMyQXJyYXk6ICdzZXRVaW50MzInLFxuICAgIEludDE2QXJyYXk6ICdzZXRJbnQxNicsXG4gICAgSW50MzJBcnJheTogJ3NldEludDMyJyxcbiAgICBGbG9hdDMyQXJyYXk6ICdzZXRGbG9hdDMyJ1xufTtcblxuZnVuY3Rpb24gY29weVRvQnVmZmVyIChzb3VyY2VUeXBlZEFycmF5LCBkZXN0aW5hdGlvbkFycmF5QnVmZmVyLCBwb3NpdGlvbiwgYmlnRW5kaWFuKSB7XG4gICAgdmFyIGxlbmd0aCA9IHNvdXJjZVR5cGVkQXJyYXkubGVuZ3RoLFxuICAgICAgICBieXRlc1BlckVsZW1lbnQgPSBzb3VyY2VUeXBlZEFycmF5LkJZVEVTX1BFUl9FTEVNRU5UO1xuXG4gICAgdmFyIHdyaXRlQXJyYXkgPSBuZXcgc291cmNlVHlwZWRBcnJheS5jb25zdHJ1Y3RvcihkZXN0aW5hdGlvbkFycmF5QnVmZmVyLCBwb3NpdGlvbiwgbGVuZ3RoKTtcblxuICAgIGlmIChiaWdFbmRpYW4gPT09IGlzQmlnRW5kaWFuUGxhdGZvcm0oKSB8fCBieXRlc1BlckVsZW1lbnQgPT09IDEpIHtcbiAgICAgICAgLy8gZGVzaXJlZCBlbmRpYW5uZXNzIGlzIHRoZSBzYW1lIGFzIHRoZSBwbGF0Zm9ybSwgb3IgdGhlIGVuZGlhbm5lc3MgZG9lc24ndCBtYXR0ZXIgKDEgYnl0ZSlcbiAgICAgICAgd3JpdGVBcnJheS5zZXQoc291cmNlVHlwZWRBcnJheS5zdWJhcnJheSgwLCBsZW5ndGgpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgd3JpdGVWaWV3ID0gbmV3IERhdGFWaWV3KGRlc3RpbmF0aW9uQXJyYXlCdWZmZXIsIHBvc2l0aW9uLCBsZW5ndGggKiBieXRlc1BlckVsZW1lbnQpLFxuICAgICAgICAgICAgc2V0TWV0aG9kID0gc2V0TWV0aG9kc1tzb3VyY2VUeXBlZEFycmF5LmNvbnN0cnVjdG9yLm5hbWVdLFxuICAgICAgICAgICAgbGl0dGxlRW5kaWFuID0gIWJpZ0VuZGlhbixcbiAgICAgICAgICAgIGkgPSAwO1xuXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgd3JpdGVWaWV3W3NldE1ldGhvZF0oaSAqIGJ5dGVzUGVyRWxlbWVudCwgc291cmNlVHlwZWRBcnJheVtpXSwgbGl0dGxlRW5kaWFuKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB3cml0ZUFycmF5O1xufVxuXG5mdW5jdGlvbiBlbmNvZGUgKGF0dHJpYnV0ZXMsIGluZGljZXMsIGJpZ0VuZGlhbikge1xuICAgIHZhciBhdHRyaWJ1dGVLZXlzID0gYXR0cmlidXRlcyA/IE9iamVjdC5rZXlzKGF0dHJpYnV0ZXMpIDogW10sXG4gICAgICAgIGluZGV4ZWRHZW9tZXRyeSA9ICEhaW5kaWNlcztcblxuICAgIC8qKiBQUkVMSU1JTkFSWSBDSEVDS1MgKiovXG5cbiAgICAvLyB0aGlzIGlzIG5vdCBzdXBwb3NlZCB0byBjYXRjaCBhbGwgdGhlIHBvc3NpYmxlIGVycm9ycywgb25seSBzb21lIG9mIHRoZSBnb3RjaGFzXG5cbiAgICBpZiAoYXR0cmlidXRlS2V5cy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdQUldNIGVuY29kZXI6IFRoZSBtb2RlbCBtdXN0IGhhdmUgYXQgbGVhc3Qgb25lIGF0dHJpYnV0ZScpO1xuICAgIH1cblxuICAgIGlmIChhdHRyaWJ1dGVLZXlzLmxlbmd0aCA+IDMxKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignUFJXTSBlbmNvZGVyOiBUaGUgbW9kZWwgY2FuIGhhdmUgYXQgbW9zdCAzMSBhdHRyaWJ1dGVzJyk7XG4gICAgfVxuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhdHRyaWJ1dGVLZXlzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmICghRW5jb2RpbmdUeXBlcy5oYXNPd25Qcm9wZXJ0eShhdHRyaWJ1dGVzW2F0dHJpYnV0ZUtleXNbaV1dLnZhbHVlcy5jb25zdHJ1Y3Rvci5uYW1lKSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdQUldNIGVuY29kZXI6IFVuc3VwcG9ydGVkIGF0dHJpYnV0ZSB2YWx1ZXMgdHlwZTogJyArIGF0dHJpYnV0ZXNbYXR0cmlidXRlS2V5c1tpXV0udmFsdWVzLmNvbnN0cnVjdG9yLm5hbWUpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGluZGV4ZWRHZW9tZXRyeSAmJiBpbmRpY2VzLmNvbnN0cnVjdG9yLm5hbWUgIT09ICdVaW50MTZBcnJheScgJiYgaW5kaWNlcy5jb25zdHJ1Y3Rvci5uYW1lICE9PSAnVWludDMyQXJyYXknKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignUFJXTSBlbmNvZGVyOiBUaGUgaW5kaWNlcyBtdXN0IGJlIHJlcHJlc2VudGVkIGFzIGFuIFVpbnQxNkFycmF5IG9yIGFuIFVpbnQzMkFycmF5Jyk7XG4gICAgfVxuXG4gICAgLyoqIEdFVCBUSEUgVFlQRSBPRiBJTkRJQ0VTIEFTIFdFTEwgQVMgVEhFIE5VTUJFUiBPRiBJTkRJQ0VTIEFORCBBVFRSSUJVVEUgVkFMVUVTICoqL1xuXG4gICAgdmFyIHZhbHVlc051bWJlciA9IGF0dHJpYnV0ZXNbYXR0cmlidXRlS2V5c1swXV0udmFsdWVzLmxlbmd0aCAvIGF0dHJpYnV0ZXNbYXR0cmlidXRlS2V5c1swXV0uY2FyZGluYWxpdHkgfCAwLFxuICAgICAgICBpbmRpY2VzTnVtYmVyID0gaW5kZXhlZEdlb21ldHJ5ID8gaW5kaWNlcy5sZW5ndGggOiAwLFxuICAgICAgICBpbmRpY2VzVHlwZSA9IGluZGV4ZWRHZW9tZXRyeSAmJiBpbmRpY2VzLmNvbnN0cnVjdG9yLm5hbWUgPT09ICdVaW50MzJBcnJheScgPyAxIDogMDtcblxuICAgIC8qKiBHRVQgVEhFIEZJTEUgTEVOR1RIICoqL1xuXG4gICAgdmFyIHRvdGFsTGVuZ3RoID0gOCxcbiAgICAgICAgYXR0cmlidXRlS2V5LFxuICAgICAgICBhdHRyaWJ1dGUsXG4gICAgICAgIGF0dHJpYnV0ZVR5cGUsXG4gICAgICAgIGksIGo7XG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgYXR0cmlidXRlS2V5cy5sZW5ndGg7IGkrKykge1xuICAgICAgICBhdHRyaWJ1dGVLZXkgPSBhdHRyaWJ1dGVLZXlzW2ldO1xuICAgICAgICBhdHRyaWJ1dGUgPSBhdHRyaWJ1dGVzW2F0dHJpYnV0ZUtleV07XG4gICAgICAgIHRvdGFsTGVuZ3RoICs9IGF0dHJpYnV0ZUtleS5sZW5ndGggKyAyOyAvLyBOVUwgYnl0ZSArIGZsYWcgYnl0ZSArIHBhZGRpbmdcbiAgICAgICAgdG90YWxMZW5ndGggPSBNYXRoLmNlaWwodG90YWxMZW5ndGggLyA0KSAqIDQ7IC8vIHBhZGRpbmdcbiAgICAgICAgdG90YWxMZW5ndGggKz0gYXR0cmlidXRlLnZhbHVlcy5ieXRlTGVuZ3RoO1xuICAgIH1cblxuICAgIGlmIChpbmRleGVkR2VvbWV0cnkpIHtcbiAgICAgICAgdG90YWxMZW5ndGggPSBNYXRoLmNlaWwodG90YWxMZW5ndGggLyA0KSAqIDQ7XG4gICAgICAgIHRvdGFsTGVuZ3RoICs9IGluZGljZXMuYnl0ZUxlbmd0aDtcbiAgICB9XG5cbiAgICAvKiogSU5JVElBTElaRSBUSEUgQlVGRkVSICovXG5cbiAgICB2YXIgYnVmZmVyID0gbmV3IEFycmF5QnVmZmVyKHRvdGFsTGVuZ3RoKSxcbiAgICAgICAgYXJyYXkgPSBuZXcgVWludDhBcnJheShidWZmZXIpO1xuXG4gICAgLyoqIEhFQURFUiAqKi9cblxuICAgIGFycmF5WzBdID0gMTtcbiAgICBhcnJheVsxXSA9IChcbiAgICAgICAgaW5kZXhlZEdlb21ldHJ5IDw8IDcgfFxuICAgICAgICBpbmRpY2VzVHlwZSA8PCA2IHxcbiAgICAgICAgKGJpZ0VuZGlhbiA/IDEgOiAwKSA8PCA1IHxcbiAgICAgICAgYXR0cmlidXRlS2V5cy5sZW5ndGggJiAweDFGXG4gICAgKTtcblxuICAgIGlmIChiaWdFbmRpYW4pIHtcbiAgICAgICAgYXJyYXlbMl0gPSB2YWx1ZXNOdW1iZXIgPj4gMTYgJiAweEZGO1xuICAgICAgICBhcnJheVszXSA9IHZhbHVlc051bWJlciA+PiA4ICYgMHhGRjtcbiAgICAgICAgYXJyYXlbNF0gPSB2YWx1ZXNOdW1iZXIgJiAweEZGO1xuXG4gICAgICAgIGFycmF5WzVdID0gaW5kaWNlc051bWJlciA+PiAxNiAmIDB4RkY7XG4gICAgICAgIGFycmF5WzZdID0gaW5kaWNlc051bWJlciA+PiA4ICYgMHhGRjtcbiAgICAgICAgYXJyYXlbN10gPSBpbmRpY2VzTnVtYmVyICYgMHhGRjtcbiAgICB9IGVsc2Uge1xuICAgICAgICBhcnJheVsyXSA9IHZhbHVlc051bWJlciAmIDB4RkY7XG4gICAgICAgIGFycmF5WzNdID0gdmFsdWVzTnVtYmVyID4+IDggJiAweEZGO1xuICAgICAgICBhcnJheVs0XSA9IHZhbHVlc051bWJlciA+PiAxNiAmIDB4RkY7XG5cbiAgICAgICAgYXJyYXlbNV0gPSBpbmRpY2VzTnVtYmVyICYgMHhGRjtcbiAgICAgICAgYXJyYXlbNl0gPSBpbmRpY2VzTnVtYmVyID4+IDggJiAweEZGO1xuICAgICAgICBhcnJheVs3XSA9IGluZGljZXNOdW1iZXIgPj4gMTYgJiAweEZGO1xuICAgIH1cblxuXG4gICAgdmFyIHBvcyA9IDg7XG5cbiAgICAvKiogQVRUUklCVVRFUyAqKi9cblxuICAgIGZvciAoaSA9IDA7IGkgPCBhdHRyaWJ1dGVLZXlzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGF0dHJpYnV0ZUtleSA9IGF0dHJpYnV0ZUtleXNbaV07XG4gICAgICAgIGF0dHJpYnV0ZSA9IGF0dHJpYnV0ZXNbYXR0cmlidXRlS2V5XTtcbiAgICAgICAgYXR0cmlidXRlVHlwZSA9IHR5cGVvZiBhdHRyaWJ1dGUudHlwZSA9PT0gJ3VuZGVmaW5lZCcgPyBpbmZlckF0dHJpYnV0ZVR5cGUoYXR0cmlidXRlLnZhbHVlcykgOiBhdHRyaWJ1dGUudHlwZTtcblxuICAgICAgICAvKioqIFdSSVRFIEFUVFJJQlVURSBIRUFERVIgKioqL1xuXG4gICAgICAgIGZvciAoaiA9IDA7IGogPCBhdHRyaWJ1dGVLZXkubGVuZ3RoOyBqKyssIHBvcysrKSB7XG4gICAgICAgICAgICBhcnJheVtwb3NdID0gKGF0dHJpYnV0ZUtleS5jaGFyQ29kZUF0KGopICYgMHg3RikgfHwgMHg1RjsgLy8gZGVmYXVsdCB0byB1bmRlcnNjb3JlXG4gICAgICAgIH1cblxuICAgICAgICBwb3MrKztcblxuICAgICAgICBhcnJheVtwb3NdID0gKFxuICAgICAgICAgICAgKGF0dHJpYnV0ZVR5cGUgJiAweDAzKSA8PCA2IHxcbiAgICAgICAgICAgICgoYXR0cmlidXRlLmNhcmRpbmFsaXR5IC0gMSkgJiAweDAzKSA8PCA0IHxcbiAgICAgICAgICAgIEVuY29kaW5nVHlwZXNbYXR0cmlidXRlLnZhbHVlcy5jb25zdHJ1Y3Rvci5uYW1lXSAmIDB4MEZcbiAgICAgICAgKTtcblxuICAgICAgICBwb3MrKztcblxuXG4gICAgICAgIC8vIHBhZGRpbmcgdG8gbmV4dCBtdWx0aXBsZSBvZiA0XG4gICAgICAgIHBvcyA9IE1hdGguY2VpbChwb3MgLyA0KSAqIDQ7XG5cbiAgICAgICAgLyoqKiBXUklURSBBVFRSSUJVVEUgVkFMVUVTICoqKi9cblxuICAgICAgICB2YXIgYXR0cmlidXRlc1dyaXRlQXJyYXkgPSBjb3B5VG9CdWZmZXIoYXR0cmlidXRlLnZhbHVlcywgYnVmZmVyLCBwb3MsIGJpZ0VuZGlhbik7XG5cbiAgICAgICAgcG9zICs9IGF0dHJpYnV0ZXNXcml0ZUFycmF5LmJ5dGVMZW5ndGg7XG4gICAgfVxuXG4gICAgLyoqKiBXUklURSBJTkRJQ0VTIFZBTFVFUyAqKiovXG5cbiAgICBpZiAoaW5kZXhlZEdlb21ldHJ5KSB7XG4gICAgICAgIHBvcyA9IE1hdGguY2VpbChwb3MgLyA0KSAqIDQ7XG5cbiAgICAgICAgY29weVRvQnVmZmVyKGluZGljZXMsIGJ1ZmZlciwgcG9zLCBiaWdFbmRpYW4pO1xuICAgIH1cblxuICAgIHJldHVybiBidWZmZXI7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZW5jb2RlO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBhdHRyaWJ1dGVUeXBlcyA9IHJlcXVpcmUoJy4uL3Byd20vYXR0cmlidXRlLXR5cGVzJyk7XG5cbnZhciBtYXAgPSB7XG4gICAgSW50OEFycmF5OiBhdHRyaWJ1dGVUeXBlcy5JbnQsXG4gICAgSW50MTZBcnJheTogYXR0cmlidXRlVHlwZXMuSW50LFxuICAgIEludDMyQXJyYXk6IGF0dHJpYnV0ZVR5cGVzLkludCxcbiAgICBVaW50OEFycmF5OiBhdHRyaWJ1dGVUeXBlcy5VaW50LFxuICAgIFVpbnQxNkFycmF5OiBhdHRyaWJ1dGVUeXBlcy5VaW50LFxuICAgIFVpbnQzMkFycmF5OiBhdHRyaWJ1dGVUeXBlcy5VaW50LFxuICAgIEZsb2F0MzJBcnJheTogYXR0cmlidXRlVHlwZXMuRmxvYXRcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaW5mZXJBdHRyaWJ1dGVUeXBlICh0eXBlZEFycmF5KSB7XG4gICAgcmV0dXJuIG1hcFt0eXBlZEFycmF5LmNvbnN0cnVjdG9yLm5hbWVdO1xufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgYmlnRW5kaWFuUGxhdGZvcm0gPSBudWxsO1xuXG4vKipcbiAqIENoZWNrIGlmIHRoZSBlbmRpYW5uZXNzIG9mIHRoZSBwbGF0Zm9ybSBpcyBiaWctZW5kaWFuIChtb3N0IHNpZ25pZmljYW50IGJpdCBmaXJzdClcbiAqIEByZXR1cm5zIHtib29sZWFufSBUcnVlIGlmIGJpZy1lbmRpYW4sIGZhbHNlIGlmIGxpdHRsZS1lbmRpYW5cbiAqL1xuZnVuY3Rpb24gaXNCaWdFbmRpYW5QbGF0Zm9ybSAoKSB7XG4gICAgaWYgKGJpZ0VuZGlhblBsYXRmb3JtID09PSBudWxsKSB7XG4gICAgICAgIHZhciBidWZmZXIgPSBuZXcgQXJyYXlCdWZmZXIoMiksXG4gICAgICAgICAgICB1aW50OEFycmF5ID0gbmV3IFVpbnQ4QXJyYXkoYnVmZmVyKSxcbiAgICAgICAgICAgIHVpbnQxNkFycmF5ID0gbmV3IFVpbnQxNkFycmF5KGJ1ZmZlcik7XG5cbiAgICAgICAgdWludDhBcnJheVswXSA9IDB4QUE7IC8vIHNldCBmaXJzdCBieXRlXG4gICAgICAgIHVpbnQ4QXJyYXlbMV0gPSAweEJCOyAvLyBzZXQgc2Vjb25kIGJ5dGVcbiAgICAgICAgYmlnRW5kaWFuUGxhdGZvcm0gPSAodWludDE2QXJyYXlbMF0gPT09IDB4QUFCQik7XG4gICAgfVxuXG4gICAgcmV0dXJuIGJpZ0VuZGlhblBsYXRmb3JtO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGlzQmlnRW5kaWFuUGxhdGZvcm07XG4iXX0=
