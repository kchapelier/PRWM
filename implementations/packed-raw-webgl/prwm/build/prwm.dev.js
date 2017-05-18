!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.prwm=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";

module.exports = {
    AttributeTypes: require('./prwm/attribute-types'),
    MeshTypes : require('./prwm/mesh-types'),

    isBigEndianPlatform: require('./utils/is-big-endian-platform'),
    encodePrwm: require('./prwm/encode'),
    decodePrwm: require('./prwm/decode')
};

},{"./prwm/attribute-types":2,"./prwm/decode":3,"./prwm/encode":4,"./prwm/mesh-types":5,"./utils/is-big-endian-platform":6}],2:[function(require,module,exports){
"use strict";

module.exports = {
    Int: 0,
    Uint: 1,
    Float: 2
};

},{}],3:[function(require,module,exports){
"use strict";

var MeshTypes = require('./mesh-types'),
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
        meshType = flags >> 7 & 0x01,
        isTriangleMesh = meshType === MeshTypes.TriangleMesh,
        indicesType = flags >> 6 & 0x01,
        bigEndian = (flags >> 5 & 0x01) === 1,
        attributesNumber = flags & 0x1F,
        valuesNumber = 0,
        elementNumber = 0;

    if (bigEndian) {
        valuesNumber = (array[2] << 16) + (array[3] << 8) + array[4];
        elementNumber = (array[5] << 16) + (array[6] << 8) + array[7];
    } else {
        valuesNumber = array[2] + (array[3] << 8) + (array[4] << 16);
        elementNumber = array[5] + (array[6] << 8) + (array[7] << 16);
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

        for (i = 0; i < elementNumber; i++) {
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

},{"../utils/is-big-endian-platform":6,"./mesh-types":5}],4:[function(require,module,exports){
"use strict";

var MeshTypes = require('./mesh-types'),
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
    var writeArray = new sourceTypedArray.constructor(destinationArrayBuffer, position, length),
        bytesPerElement = sourceTypedArray.BYTES_PER_ELEMENT;

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

function encode (meshType, attributes, indices, bigEndian) {
    var attributeKeys = Object.keys(attributes),
        isTriangleMesh = meshType === MeshTypes.TriangleMesh;

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

    /** GET THE TYPE OF INDICES AS WELL AS THE NUMBER OF ELEMENTS AND ATTR VALUES **/

    var valuesNumber = attributes[attributeKeys[0]].values.length / attributes[attributeKeys[0]].cardinality | 0,
        elementNumber = isTriangleMesh ? indices.length / 3 | 0 : valuesNumber,
        indicesType = !isTriangleMesh || indices.constructor.name === 'Uint16Array' ? 0 : 1;

    /** GET THE FILE LENGTH **/

    var totalLength = 8,
        attributeKey,
        attribute,
        attributeLength,
        i, j;

    for (i = 0; i < attributeKeys.length; i++) {
        attributeKey = attributeKeys[i];
        attribute = attributes[attributeKey];
        attributeLength = attributeKey.length + 2; // NUL byte + flag byte
        attributeLength = Math.ceil(attributeLength / 4) * 4 + attribute.values.byteLength;
        totalLength += attributeLength;
    }

    totalLength = Math.ceil(totalLength / 4) * 4;

    if (isTriangleMesh) {
        totalLength += indices.byteLength;
    }

    /** INITIALIZE THE BUFFER */

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

    for (i = 0; i < attributeKeys.length; i++) {
        attributeKey = attributeKeys[i];
        attribute = attributes[attributeKey];

        /*** WRITE ATTRIBUTE HEADER ***/

        for (j = 0; j < attributeKey.length; j++, pos++) {
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

},{"../utils/is-big-endian-platform":6,"./mesh-types":5}],5:[function(require,module,exports){
"use strict";

module.exports = {
    PointCloud: 0,
    TriangleMesh: 1
};

},{}],6:[function(require,module,exports){
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL3Vzci9sb2NhbC9saWIvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsImluZGV4LmpzIiwicHJ3bS9hdHRyaWJ1dGUtdHlwZXMuanMiLCJwcndtL2RlY29kZS5qcyIsInByd20vZW5jb2RlLmpzIiwicHJ3bS9tZXNoLXR5cGVzLmpzIiwidXRpbHMvaXMtYmlnLWVuZGlhbi1wbGF0Zm9ybS5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0SkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICAgIEF0dHJpYnV0ZVR5cGVzOiByZXF1aXJlKCcuL3Byd20vYXR0cmlidXRlLXR5cGVzJyksXG4gICAgTWVzaFR5cGVzIDogcmVxdWlyZSgnLi9wcndtL21lc2gtdHlwZXMnKSxcblxuICAgIGlzQmlnRW5kaWFuUGxhdGZvcm06IHJlcXVpcmUoJy4vdXRpbHMvaXMtYmlnLWVuZGlhbi1wbGF0Zm9ybScpLFxuICAgIGVuY29kZVByd206IHJlcXVpcmUoJy4vcHJ3bS9lbmNvZGUnKSxcbiAgICBkZWNvZGVQcndtOiByZXF1aXJlKCcuL3Byd20vZGVjb2RlJylcbn07XG4iLCJcInVzZSBzdHJpY3RcIjtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgSW50OiAwLFxuICAgIFVpbnQ6IDEsXG4gICAgRmxvYXQ6IDJcbn07XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIE1lc2hUeXBlcyA9IHJlcXVpcmUoJy4vbWVzaC10eXBlcycpLFxuICAgIGlzQmlnRW5kaWFuUGxhdGZvcm0gPSByZXF1aXJlKCcuLi91dGlscy9pcy1iaWctZW5kaWFuLXBsYXRmb3JtJyk7XG5cbi8vIG1hdGNoIHRoZSB2YWx1ZXMgZGVmaW5lZCBpbiB0aGUgc3BlYyB0byB0aGUgVHlwZWRBcnJheSB0eXBlc1xudmFyIEludmVydGVkRW5jb2RpbmdUeXBlcyA9IFtcbiAgICBudWxsLFxuICAgIEZsb2F0MzJBcnJheSxcbiAgICBudWxsLFxuICAgIEludDhBcnJheSxcbiAgICBJbnQxNkFycmF5LFxuICAgIG51bGwsXG4gICAgSW50MzJBcnJheSxcbiAgICBVaW50OEFycmF5LFxuICAgIFVpbnQxNkFycmF5LFxuICAgIG51bGwsXG4gICAgVWludDMyQXJyYXlcbl07XG5cbi8vIGRlZmluZSB0aGUgbWV0aG9kIHRvIHVzZSBvbiBhIERhdGFWaWV3LCBjb3JyZXNwb25kaW5nIHRoZSBUeXBlZEFycmF5IHR5cGVcbnZhciBnZXRNZXRob2RzID0ge1xuICAgIFVpbnQxNkFycmF5OiAnZ2V0VWludDE2JyxcbiAgICBVaW50MzJBcnJheTogJ2dldFVpbnQzMicsXG4gICAgSW50MTZBcnJheTogJ2dldEludDE2JyxcbiAgICBJbnQzMkFycmF5OiAnZ2V0SW50MzInLFxuICAgIEZsb2F0MzJBcnJheTogJ2dldEZsb2F0MzInLFxuICAgIEZsb2F0NjRBcnJheTogJ2dldEZsb2F0NjQnXG59O1xuXG5mdW5jdGlvbiBjb3B5RnJvbUJ1ZmZlciAoc291cmNlQXJyYXlCdWZmZXIsIHZpZXdUeXBlLCBwb3NpdGlvbiwgbGVuZ3RoLCBmcm9tQmlnRW5kaWFuKSB7XG4gICAgdmFyIGJ5dGVzUGVyRWxlbWVudCA9IHZpZXdUeXBlLkJZVEVTX1BFUl9FTEVNRU5ULFxuICAgICAgICByZXN1bHQ7XG5cbiAgICBpZiAoZnJvbUJpZ0VuZGlhbiA9PT0gaXNCaWdFbmRpYW5QbGF0Zm9ybSgpIHx8IGJ5dGVzUGVyRWxlbWVudCA9PT0gMSkge1xuICAgICAgICByZXN1bHQgPSBuZXcgdmlld1R5cGUoc291cmNlQXJyYXlCdWZmZXIsIHBvc2l0aW9uLCBsZW5ndGgpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciByZWFkVmlldyA9IG5ldyBEYXRhVmlldyhzb3VyY2VBcnJheUJ1ZmZlciwgcG9zaXRpb24sIGxlbmd0aCAqIGJ5dGVzUGVyRWxlbWVudCksXG4gICAgICAgICAgICBnZXRNZXRob2QgPSBnZXRNZXRob2RzW3ZpZXdUeXBlLm5hbWVdLFxuICAgICAgICAgICAgbGl0dGxlRW5kaWFuID0gIWZyb21CaWdFbmRpYW47XG5cbiAgICAgICAgcmVzdWx0ID0gbmV3IHZpZXdUeXBlKGxlbmd0aCk7XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgcmVzdWx0W2ldID0gcmVhZFZpZXdbZ2V0TWV0aG9kXShpICogYnl0ZXNQZXJFbGVtZW50LCBsaXR0bGVFbmRpYW4pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gZGVjb2RlIChidWZmZXIpIHtcbiAgICB2YXIgYXJyYXkgPSBuZXcgVWludDhBcnJheShidWZmZXIpLFxuICAgICAgICB2ZXJzaW9uID0gYXJyYXlbMF0sXG4gICAgICAgIGZsYWdzID0gYXJyYXlbMV0sXG4gICAgICAgIG1lc2hUeXBlID0gZmxhZ3MgPj4gNyAmIDB4MDEsXG4gICAgICAgIGlzVHJpYW5nbGVNZXNoID0gbWVzaFR5cGUgPT09IE1lc2hUeXBlcy5UcmlhbmdsZU1lc2gsXG4gICAgICAgIGluZGljZXNUeXBlID0gZmxhZ3MgPj4gNiAmIDB4MDEsXG4gICAgICAgIGJpZ0VuZGlhbiA9IChmbGFncyA+PiA1ICYgMHgwMSkgPT09IDEsXG4gICAgICAgIGF0dHJpYnV0ZXNOdW1iZXIgPSBmbGFncyAmIDB4MUYsXG4gICAgICAgIHZhbHVlc051bWJlciA9IDAsXG4gICAgICAgIGVsZW1lbnROdW1iZXIgPSAwO1xuXG4gICAgaWYgKGJpZ0VuZGlhbikge1xuICAgICAgICB2YWx1ZXNOdW1iZXIgPSAoYXJyYXlbMl0gPDwgMTYpICsgKGFycmF5WzNdIDw8IDgpICsgYXJyYXlbNF07XG4gICAgICAgIGVsZW1lbnROdW1iZXIgPSAoYXJyYXlbNV0gPDwgMTYpICsgKGFycmF5WzZdIDw8IDgpICsgYXJyYXlbN107XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdmFsdWVzTnVtYmVyID0gYXJyYXlbMl0gKyAoYXJyYXlbM10gPDwgOCkgKyAoYXJyYXlbNF0gPDwgMTYpO1xuICAgICAgICBlbGVtZW50TnVtYmVyID0gYXJyYXlbNV0gKyAoYXJyYXlbNl0gPDwgOCkgKyAoYXJyYXlbN10gPDwgMTYpO1xuICAgIH1cblxuICAgIHZhciBwb3MgPSA4O1xuXG4gICAgdmFyIGF0dHJpYnV0ZXMgPSB7fSxcbiAgICAgICAgYXR0cmlidXRlTmFtZSxcbiAgICAgICAgY2hhcixcbiAgICAgICAgYXR0cmlidXRlVHlwZSxcbiAgICAgICAgY2FyZGluYWxpdHksXG4gICAgICAgIGVuY29kaW5nVHlwZSxcbiAgICAgICAgYXJyYXlUeXBlLFxuICAgICAgICB2YWx1ZXMsXG4gICAgICAgIGk7XG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgYXR0cmlidXRlc051bWJlcjsgaSsrKSB7XG4gICAgICAgIGF0dHJpYnV0ZU5hbWUgPSAnJztcblxuICAgICAgICB3aGlsZSAocG9zIDwgYXJyYXkubGVuZ3RoKSB7XG4gICAgICAgICAgICBjaGFyID0gYXJyYXlbcG9zXTtcbiAgICAgICAgICAgIHBvcysrO1xuXG4gICAgICAgICAgICBpZiAoY2hhciA9PT0gMCkge1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBhdHRyaWJ1dGVOYW1lICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoY2hhcik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmbGFncyA9IGFycmF5W3Bvc107XG5cbiAgICAgICAgYXR0cmlidXRlVHlwZSA9IGZsYWdzID4+IDYgJiAweDAzO1xuICAgICAgICBjYXJkaW5hbGl0eSA9IChmbGFncyA+PiA0ICYgMHgwMykgKyAxO1xuICAgICAgICBlbmNvZGluZ1R5cGUgPSBmbGFncyAmIDB4MEY7XG4gICAgICAgIGFycmF5VHlwZSA9IEludmVydGVkRW5jb2RpbmdUeXBlc1tlbmNvZGluZ1R5cGVdO1xuXG4gICAgICAgIHBvcysrO1xuXG4gICAgICAgIC8vIHBhZGRpbmcgdG8gbmV4dCBtdWx0aXBsZSBvZiA0XG4gICAgICAgIHBvcyA9IE1hdGguY2VpbChwb3MgLyA0KSAqIDQ7XG5cbiAgICAgICAgdmFsdWVzID0gY29weUZyb21CdWZmZXIoYnVmZmVyLCBhcnJheVR5cGUsIHBvcywgY2FyZGluYWxpdHkgKiB2YWx1ZXNOdW1iZXIsIGJpZ0VuZGlhbik7XG5cbiAgICAgICAgcG9zKz0gYXJyYXlUeXBlLkJZVEVTX1BFUl9FTEVNRU5UICogY2FyZGluYWxpdHkgKiB2YWx1ZXNOdW1iZXI7XG5cbiAgICAgICAgYXR0cmlidXRlc1thdHRyaWJ1dGVOYW1lXSA9IHtcbiAgICAgICAgICAgIHR5cGU6IGF0dHJpYnV0ZVR5cGUsXG4gICAgICAgICAgICBjYXJkaW5hbGl0eTogY2FyZGluYWxpdHksXG4gICAgICAgICAgICB2YWx1ZXM6IHZhbHVlc1xuICAgICAgICB9O1xuICAgIH1cblxuICAgIHBvcyA9IE1hdGguY2VpbChwb3MgLyA0KSAqIDQ7XG5cbiAgICB2YXIgaW5kaWNlcztcblxuICAgIGlmIChpc1RyaWFuZ2xlTWVzaCkge1xuICAgICAgICBpbmRpY2VzID0gY29weUZyb21CdWZmZXIoXG4gICAgICAgICAgICBidWZmZXIsXG4gICAgICAgICAgICBpbmRpY2VzVHlwZSA9PT0gMSA/IFVpbnQzMkFycmF5IDogVWludDE2QXJyYXksXG4gICAgICAgICAgICBwb3MsXG4gICAgICAgICAgICBlbGVtZW50TnVtYmVyICogMyxcbiAgICAgICAgICAgIGJpZ0VuZGlhblxuICAgICAgICApO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGluZGljZXMgPSBuZXcgKGVsZW1lbnROdW1iZXIgPiAweEZGRkYgPyBVaW50MzJBcnJheSA6IFVpbnQxNkFycmF5KShlbGVtZW50TnVtYmVyKTtcblxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgZWxlbWVudE51bWJlcjsgaSsrKSB7XG4gICAgICAgICAgICBpbmRpY2VzW2ldID0gaTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICAgIHZlcnNpb246IHZlcnNpb24sXG4gICAgICAgIG1lc2hUeXBlOiBtZXNoVHlwZSxcbiAgICAgICAgZWxlbWVudHM6IGVsZW1lbnROdW1iZXIsXG4gICAgICAgIGF0dHJpYnV0ZXM6IGF0dHJpYnV0ZXMsXG4gICAgICAgIGluZGljZXM6IGluZGljZXNcbiAgICB9O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGRlY29kZTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgTWVzaFR5cGVzID0gcmVxdWlyZSgnLi9tZXNoLXR5cGVzJyksXG4gICAgaXNCaWdFbmRpYW5QbGF0Zm9ybSA9IHJlcXVpcmUoJy4uL3V0aWxzL2lzLWJpZy1lbmRpYW4tcGxhdGZvcm0nKTtcblxuLy8gbWF0Y2ggdGhlIFR5cGVkQXJyYXkgdHlwZSB3aXRoIHRoZSB2YWx1ZSBkZWZpbmVkIGluIHRoZSBzcGVjXG52YXIgRW5jb2RpbmdUeXBlcyA9IHtcbiAgICBGbG9hdDMyQXJyYXk6IDEsXG4gICAgSW50OEFycmF5OiAzLFxuICAgIEludDE2QXJyYXk6IDQsXG4gICAgSW50MzJBcnJheTogNixcbiAgICBVaW50OEFycmF5OiA3LFxuICAgIFVpbnQxNkFycmF5OiA4LFxuICAgIFVpbnQzMkFycmF5OiAxMFxufTtcblxuLy8gZGVmaW5lIHRoZSBtZXRob2QgdG8gdXNlIG9uIGEgRGF0YVZpZXcsIGNvcnJlc3BvbmRpbmcgdGhlIFR5cGVkQXJyYXkgdHlwZVxudmFyIHNldE1ldGhvZHMgPSB7XG4gICAgVWludDE2QXJyYXk6ICdzZXRVaW50MTYnLFxuICAgIFVpbnQzMkFycmF5OiAnc2V0VWludDMyJyxcbiAgICBJbnQxNkFycmF5OiAnc2V0SW50MTYnLFxuICAgIEludDMyQXJyYXk6ICdzZXRJbnQzMicsXG4gICAgRmxvYXQzMkFycmF5OiAnc2V0RmxvYXQzMicsXG4gICAgRmxvYXQ2NEFycmF5OiAnc2V0RmxvYXQ2NCdcbn07XG5cbmZ1bmN0aW9uIGNvcHlUb0J1ZmZlciAoc291cmNlVHlwZWRBcnJheSwgZGVzdGluYXRpb25BcnJheUJ1ZmZlciwgcG9zaXRpb24sIGxlbmd0aCwgYmlnRW5kaWFuKSB7XG4gICAgdmFyIHdyaXRlQXJyYXkgPSBuZXcgc291cmNlVHlwZWRBcnJheS5jb25zdHJ1Y3RvcihkZXN0aW5hdGlvbkFycmF5QnVmZmVyLCBwb3NpdGlvbiwgbGVuZ3RoKSxcbiAgICAgICAgYnl0ZXNQZXJFbGVtZW50ID0gc291cmNlVHlwZWRBcnJheS5CWVRFU19QRVJfRUxFTUVOVDtcblxuICAgIGlmIChiaWdFbmRpYW4gPT09IGlzQmlnRW5kaWFuUGxhdGZvcm0oKSB8fCBieXRlc1BlckVsZW1lbnQgPT09IDEpIHtcbiAgICAgICAgLy8gZGVzaXJlZCBlbmRpYW5uZXNzIGlzIHRoZSBzYW1lIGFzIHRoZSBwbGF0Zm9ybSwgb3IgdGhlIGVuZGlhbm5lc3MgZG9lc24ndCBtYXR0ZXIgKDEgYnl0ZSlcbiAgICAgICAgd3JpdGVBcnJheS5zZXQoc291cmNlVHlwZWRBcnJheS5zdWJhcnJheSgwLCBsZW5ndGgpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgd3JpdGVWaWV3ID0gbmV3IERhdGFWaWV3KGRlc3RpbmF0aW9uQXJyYXlCdWZmZXIsIHBvc2l0aW9uLCBsZW5ndGggKiBieXRlc1BlckVsZW1lbnQpLFxuICAgICAgICAgICAgc2V0TWV0aG9kID0gc2V0TWV0aG9kc1tzb3VyY2VUeXBlZEFycmF5LmNvbnN0cnVjdG9yLm5hbWVdLFxuICAgICAgICAgICAgbGl0dGxlRW5kaWFuID0gIWJpZ0VuZGlhbixcbiAgICAgICAgICAgIGkgPSAwO1xuXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgd3JpdGVWaWV3W3NldE1ldGhvZF0oaSAqIGJ5dGVzUGVyRWxlbWVudCwgc291cmNlVHlwZWRBcnJheVtpXSwgbGl0dGxlRW5kaWFuKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB3cml0ZUFycmF5O1xufVxuXG5mdW5jdGlvbiBlbmNvZGUgKG1lc2hUeXBlLCBhdHRyaWJ1dGVzLCBpbmRpY2VzLCBiaWdFbmRpYW4pIHtcbiAgICB2YXIgYXR0cmlidXRlS2V5cyA9IE9iamVjdC5rZXlzKGF0dHJpYnV0ZXMpLFxuICAgICAgICBpc1RyaWFuZ2xlTWVzaCA9IG1lc2hUeXBlID09PSBNZXNoVHlwZXMuVHJpYW5nbGVNZXNoO1xuXG4gICAgLyoqIFBSRUxJTUlOQVJZIENIRUNLUyAqKi9cblxuICAgIC8vIHRoaXMgaXMgbm90IHN1cHBvc2VkIHRvIGNhdGNoIGFsbCB0aGUgcG9zc2libGUgZXJyb3JzLCBvbmx5IHNvbWUgb2YgdGhlIGdvdGNoYXNcblxuICAgIGlmIChtZXNoVHlwZSA8IDAgfHwgbWVzaFR5cGUgPiAxKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignUFJXTSBlbmNvZGVyOiBJbmNvcnJlY3QgbWVzaCB0eXBlJyk7XG4gICAgfVxuXG4gICAgaWYgKGF0dHJpYnV0ZUtleXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignUFJXTSBlbmNvZGVyOiBUaGUgbW9kZWwgbXVzdCBoYXZlIGF0IGxlYXN0IG9uZSBhdHRyaWJ1dGUnKTtcbiAgICB9XG5cbiAgICBpZiAoaXNUcmlhbmdsZU1lc2ggJiYgaW5kaWNlcy5jb25zdHJ1Y3Rvci5uYW1lICE9PSAnVWludDE2QXJyYXknICYmIGluZGljZXMuY29uc3RydWN0b3IubmFtZSAhPT0gJ1VpbnQzMkFycmF5Jykge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BSV00gZW5jb2RlcjogVGhlIGluZGljZXMgbXVzdCBiZSByZXByZXNlbnRlZCBhcyBhbiBVaW50MTZBcnJheSBvciBhbiBVaW50MzJBcnJheScpO1xuICAgIH1cblxuICAgIC8qKiBHRVQgVEhFIFRZUEUgT0YgSU5ESUNFUyBBUyBXRUxMIEFTIFRIRSBOVU1CRVIgT0YgRUxFTUVOVFMgQU5EIEFUVFIgVkFMVUVTICoqL1xuXG4gICAgdmFyIHZhbHVlc051bWJlciA9IGF0dHJpYnV0ZXNbYXR0cmlidXRlS2V5c1swXV0udmFsdWVzLmxlbmd0aCAvIGF0dHJpYnV0ZXNbYXR0cmlidXRlS2V5c1swXV0uY2FyZGluYWxpdHkgfCAwLFxuICAgICAgICBlbGVtZW50TnVtYmVyID0gaXNUcmlhbmdsZU1lc2ggPyBpbmRpY2VzLmxlbmd0aCAvIDMgfCAwIDogdmFsdWVzTnVtYmVyLFxuICAgICAgICBpbmRpY2VzVHlwZSA9ICFpc1RyaWFuZ2xlTWVzaCB8fCBpbmRpY2VzLmNvbnN0cnVjdG9yLm5hbWUgPT09ICdVaW50MTZBcnJheScgPyAwIDogMTtcblxuICAgIC8qKiBHRVQgVEhFIEZJTEUgTEVOR1RIICoqL1xuXG4gICAgdmFyIHRvdGFsTGVuZ3RoID0gOCxcbiAgICAgICAgYXR0cmlidXRlS2V5LFxuICAgICAgICBhdHRyaWJ1dGUsXG4gICAgICAgIGF0dHJpYnV0ZUxlbmd0aCxcbiAgICAgICAgaSwgajtcblxuICAgIGZvciAoaSA9IDA7IGkgPCBhdHRyaWJ1dGVLZXlzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGF0dHJpYnV0ZUtleSA9IGF0dHJpYnV0ZUtleXNbaV07XG4gICAgICAgIGF0dHJpYnV0ZSA9IGF0dHJpYnV0ZXNbYXR0cmlidXRlS2V5XTtcbiAgICAgICAgYXR0cmlidXRlTGVuZ3RoID0gYXR0cmlidXRlS2V5Lmxlbmd0aCArIDI7IC8vIE5VTCBieXRlICsgZmxhZyBieXRlXG4gICAgICAgIGF0dHJpYnV0ZUxlbmd0aCA9IE1hdGguY2VpbChhdHRyaWJ1dGVMZW5ndGggLyA0KSAqIDQgKyBhdHRyaWJ1dGUudmFsdWVzLmJ5dGVMZW5ndGg7XG4gICAgICAgIHRvdGFsTGVuZ3RoICs9IGF0dHJpYnV0ZUxlbmd0aDtcbiAgICB9XG5cbiAgICB0b3RhbExlbmd0aCA9IE1hdGguY2VpbCh0b3RhbExlbmd0aCAvIDQpICogNDtcblxuICAgIGlmIChpc1RyaWFuZ2xlTWVzaCkge1xuICAgICAgICB0b3RhbExlbmd0aCArPSBpbmRpY2VzLmJ5dGVMZW5ndGg7XG4gICAgfVxuXG4gICAgLyoqIElOSVRJQUxJWkUgVEhFIEJVRkZFUiAqL1xuXG4gICAgdmFyIGJ1ZmZlciA9IG5ldyBBcnJheUJ1ZmZlcih0b3RhbExlbmd0aCksXG4gICAgICAgIGFycmF5ID0gbmV3IFVpbnQ4QXJyYXkoYnVmZmVyKTtcblxuICAgIC8qKiBIRUFERVIgKiovXG5cbiAgICBhcnJheVswXSA9IDE7XG4gICAgYXJyYXlbMV0gPSAoXG4gICAgICAgIG1lc2hUeXBlIDw8IDcgfFxuICAgICAgICBpbmRpY2VzVHlwZSA8PCA2IHxcbiAgICAgICAgKGJpZ0VuZGlhbiA/IDEgOiAwKSA8PCA1IHxcbiAgICAgICAgYXR0cmlidXRlS2V5cy5sZW5ndGggJiAweDFGXG4gICAgKTtcblxuICAgIGlmIChiaWdFbmRpYW4pIHtcbiAgICAgICAgYXJyYXlbMl0gPSB2YWx1ZXNOdW1iZXIgPj4gMTYgJiAweEZGO1xuICAgICAgICBhcnJheVszXSA9IHZhbHVlc051bWJlciA+PiA4ICYgMHhGRjtcbiAgICAgICAgYXJyYXlbNF0gPSB2YWx1ZXNOdW1iZXIgJiAweEZGO1xuXG4gICAgICAgIGFycmF5WzVdID0gZWxlbWVudE51bWJlciA+PiAxNiAmIDB4RkY7XG4gICAgICAgIGFycmF5WzZdID0gZWxlbWVudE51bWJlciA+PiA4ICYgMHhGRjtcbiAgICAgICAgYXJyYXlbN10gPSBlbGVtZW50TnVtYmVyICYgMHhGRjtcbiAgICB9IGVsc2Uge1xuICAgICAgICBhcnJheVsyXSA9IHZhbHVlc051bWJlciAmIDB4RkY7XG4gICAgICAgIGFycmF5WzNdID0gdmFsdWVzTnVtYmVyID4+IDggJiAweEZGO1xuICAgICAgICBhcnJheVs0XSA9IHZhbHVlc051bWJlciA+PiAxNiAmIDB4RkY7XG5cbiAgICAgICAgYXJyYXlbNV0gPSBlbGVtZW50TnVtYmVyICYgMHhGRjtcbiAgICAgICAgYXJyYXlbNl0gPSBlbGVtZW50TnVtYmVyID4+IDggJiAweEZGO1xuICAgICAgICBhcnJheVs3XSA9IGVsZW1lbnROdW1iZXIgPj4gMTYgJiAweEZGO1xuICAgIH1cblxuXG4gICAgdmFyIHBvcyA9IDg7XG5cbiAgICAvKiogQVRUUklCVVRFUyAqKi9cblxuICAgIGZvciAoaSA9IDA7IGkgPCBhdHRyaWJ1dGVLZXlzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGF0dHJpYnV0ZUtleSA9IGF0dHJpYnV0ZUtleXNbaV07XG4gICAgICAgIGF0dHJpYnV0ZSA9IGF0dHJpYnV0ZXNbYXR0cmlidXRlS2V5XTtcblxuICAgICAgICAvKioqIFdSSVRFIEFUVFJJQlVURSBIRUFERVIgKioqL1xuXG4gICAgICAgIGZvciAoaiA9IDA7IGogPCBhdHRyaWJ1dGVLZXkubGVuZ3RoOyBqKyssIHBvcysrKSB7XG4gICAgICAgICAgICBhcnJheVtwb3NdID0gKGF0dHJpYnV0ZUtleS5jaGFyQ29kZUF0KGopICYgMHg3RikgfHwgMHg1RjsgLy8gZGVmYXVsdCB0byB1bmRlcnNjb3JlXG4gICAgICAgIH1cblxuICAgICAgICBwb3MrKztcblxuICAgICAgICBhcnJheVtwb3NdID0gKFxuICAgICAgICAgICAgKGF0dHJpYnV0ZS50eXBlICYgMHgwMykgPDwgNiB8XG4gICAgICAgICAgICAoKGF0dHJpYnV0ZS5jYXJkaW5hbGl0eSAtIDEpICYgMHgwMykgPDwgNCB8XG4gICAgICAgICAgICBFbmNvZGluZ1R5cGVzW2F0dHJpYnV0ZS52YWx1ZXMuY29uc3RydWN0b3IubmFtZV0gJiAweDBGXG4gICAgICAgICk7XG5cbiAgICAgICAgcG9zKys7XG5cblxuICAgICAgICAvLyBwYWRkaW5nIHRvIG5leHQgbXVsdGlwbGUgb2YgNFxuICAgICAgICBwb3MgPSBNYXRoLmNlaWwocG9zIC8gNCkgKiA0O1xuXG4gICAgICAgIC8qKiogV1JJVEUgQVRUUklCVVRFIFZBTFVFUyAqKiovXG5cbiAgICAgICAgdmFyIGF0dHJpYnV0ZXNXcml0ZUFycmF5ID0gY29weVRvQnVmZmVyKGF0dHJpYnV0ZS52YWx1ZXMsIGJ1ZmZlciwgcG9zLCBhdHRyaWJ1dGUuY2FyZGluYWxpdHkgKiB2YWx1ZXNOdW1iZXIsIGJpZ0VuZGlhbik7XG5cbiAgICAgICAgcG9zICs9IGF0dHJpYnV0ZXNXcml0ZUFycmF5LmJ5dGVMZW5ndGg7XG4gICAgfVxuXG4gICAgLyoqKiBXUklURSBJTkRJQ0VTIFZBTFVFUyAqKiovXG5cbiAgICBwb3MgPSBNYXRoLmNlaWwocG9zIC8gNCkgKiA0O1xuXG4gICAgaWYgKGlzVHJpYW5nbGVNZXNoKSB7XG4gICAgICAgIGNvcHlUb0J1ZmZlcihpbmRpY2VzLCBidWZmZXIsIHBvcywgZWxlbWVudE51bWJlciAqIDMsIGJpZ0VuZGlhbik7XG4gICAgfVxuXG4gICAgcmV0dXJuIGJ1ZmZlcjtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBlbmNvZGU7XG4iLCJcInVzZSBzdHJpY3RcIjtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgUG9pbnRDbG91ZDogMCxcbiAgICBUcmlhbmdsZU1lc2g6IDFcbn07XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIGJpZ0VuZGlhblBsYXRmb3JtID0gbnVsbDtcblxuLyoqXG4gKiBDaGVjayBpZiB0aGUgZW5kaWFubmVzcyBvZiB0aGUgcGxhdGZvcm0gaXMgYmlnLWVuZGlhbiAobW9zdCBzaWduaWZpY2FudCBiaXQgZmlyc3QpXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gVHJ1ZSBpZiBiaWctZW5kaWFuLCBmYWxzZSBpZiBsaXR0bGUtZW5kaWFuXG4gKi9cbmZ1bmN0aW9uIGlzQmlnRW5kaWFuUGxhdGZvcm0gKCkge1xuICAgIGlmIChiaWdFbmRpYW5QbGF0Zm9ybSA9PT0gbnVsbCkge1xuICAgICAgICB2YXIgYnVmZmVyID0gbmV3IEFycmF5QnVmZmVyKDIpLFxuICAgICAgICAgICAgdWludDhBcnJheSA9IG5ldyBVaW50OEFycmF5KGJ1ZmZlciksXG4gICAgICAgICAgICB1aW50MTZBcnJheSA9IG5ldyBVaW50MTZBcnJheShidWZmZXIpO1xuXG4gICAgICAgIHVpbnQ4QXJyYXlbMF0gPSAweEFBOyAvLyBzZXQgZmlyc3QgYnl0ZVxuICAgICAgICB1aW50OEFycmF5WzFdID0gMHhCQjsgLy8gc2V0IHNlY29uZCBieXRlXG4gICAgICAgIGJpZ0VuZGlhblBsYXRmb3JtID0gKHVpbnQxNkFycmF5WzBdID09PSAweEFBQkIpO1xuICAgIH1cblxuICAgIHJldHVybiBiaWdFbmRpYW5QbGF0Zm9ybTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBpc0JpZ0VuZGlhblBsYXRmb3JtO1xuIl19
