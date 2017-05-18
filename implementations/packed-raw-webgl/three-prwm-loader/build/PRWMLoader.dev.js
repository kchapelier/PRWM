!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.PRWMLoader=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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

},{}],7:[function(require,module,exports){
"use strict";

var prwm = require('../prwm/index');

THREE.PRWMLoader = function PRWMLoader (manager) {
    this.manager = ( manager !== undefined ) ? manager : THREE.DefaultLoadingManager;
};

THREE.PRWMLoader.prototype = {

    constructor: THREE.PRWMLoader,

    load: function ( url, onLoad, onProgress, onError ) {

        var scope = this;

        var loader = new THREE.FileLoader( scope.manager );
        loader.setResponseType( 'arraybuffer' );
        loader.load( url, function ( arrayBuffer ) {
            onLoad( scope.parse( arrayBuffer ) );
        }, onProgress, onError );

    },

    parse: function ( arrayBuffer ) {
        console.time('PRWMLoader');

        var data = prwm.decodePrwm(arrayBuffer),
            attributesKey = Object.keys(data.attributes),
            bufferGeometry = new THREE.BufferGeometry(),
            attribute,
            i;

        for (i = 0; i < attributesKey.length; i++) {
            attribute = data.attributes[attributesKey[i]];
            bufferGeometry.addAttribute(attributesKey[i], new THREE.BufferAttribute(attribute.values, attribute.cardinality));
        }

        bufferGeometry.setIndex(new THREE.BufferAttribute(data.indices, 1));

        console.timeEnd('PRWMLoader');

        return bufferGeometry;
    }
};

THREE.PRWMLoader.isBigEndianPlatform = function () {
    return prwm.isBigEndianPlatform();
};

},{"../prwm/index":1}]},{},[7])(7)
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL3Vzci9sb2NhbC9saWIvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsIi4uL3Byd20vaW5kZXguanMiLCIuLi9wcndtL3Byd20vYXR0cmlidXRlLXR5cGVzLmpzIiwiLi4vcHJ3bS9wcndtL2RlY29kZS5qcyIsIi4uL3Byd20vcHJ3bS9lbmNvZGUuanMiLCIuLi9wcndtL3Byd20vbWVzaC10eXBlcy5qcyIsIi4uL3Byd20vdXRpbHMvaXMtYmlnLWVuZGlhbi1wbGF0Zm9ybS5qcyIsImluZGV4LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNWQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1BBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaExBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ05BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJcInVzZSBzdHJpY3RcIjtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgQXR0cmlidXRlVHlwZXM6IHJlcXVpcmUoJy4vcHJ3bS9hdHRyaWJ1dGUtdHlwZXMnKSxcbiAgICBNZXNoVHlwZXMgOiByZXF1aXJlKCcuL3Byd20vbWVzaC10eXBlcycpLFxuXG4gICAgaXNCaWdFbmRpYW5QbGF0Zm9ybTogcmVxdWlyZSgnLi91dGlscy9pcy1iaWctZW5kaWFuLXBsYXRmb3JtJyksXG4gICAgZW5jb2RlUHJ3bTogcmVxdWlyZSgnLi9wcndtL2VuY29kZScpLFxuICAgIGRlY29kZVByd206IHJlcXVpcmUoJy4vcHJ3bS9kZWNvZGUnKVxufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBJbnQ6IDAsXG4gICAgVWludDogMSxcbiAgICBGbG9hdDogMlxufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgTWVzaFR5cGVzID0gcmVxdWlyZSgnLi9tZXNoLXR5cGVzJyksXG4gICAgaXNCaWdFbmRpYW5QbGF0Zm9ybSA9IHJlcXVpcmUoJy4uL3V0aWxzL2lzLWJpZy1lbmRpYW4tcGxhdGZvcm0nKTtcblxuLy8gbWF0Y2ggdGhlIHZhbHVlcyBkZWZpbmVkIGluIHRoZSBzcGVjIHRvIHRoZSBUeXBlZEFycmF5IHR5cGVzXG52YXIgSW52ZXJ0ZWRFbmNvZGluZ1R5cGVzID0gW1xuICAgIG51bGwsXG4gICAgRmxvYXQzMkFycmF5LFxuICAgIG51bGwsXG4gICAgSW50OEFycmF5LFxuICAgIEludDE2QXJyYXksXG4gICAgbnVsbCxcbiAgICBJbnQzMkFycmF5LFxuICAgIFVpbnQ4QXJyYXksXG4gICAgVWludDE2QXJyYXksXG4gICAgbnVsbCxcbiAgICBVaW50MzJBcnJheVxuXTtcblxuLy8gZGVmaW5lIHRoZSBtZXRob2QgdG8gdXNlIG9uIGEgRGF0YVZpZXcsIGNvcnJlc3BvbmRpbmcgdGhlIFR5cGVkQXJyYXkgdHlwZVxudmFyIGdldE1ldGhvZHMgPSB7XG4gICAgVWludDE2QXJyYXk6ICdnZXRVaW50MTYnLFxuICAgIFVpbnQzMkFycmF5OiAnZ2V0VWludDMyJyxcbiAgICBJbnQxNkFycmF5OiAnZ2V0SW50MTYnLFxuICAgIEludDMyQXJyYXk6ICdnZXRJbnQzMicsXG4gICAgRmxvYXQzMkFycmF5OiAnZ2V0RmxvYXQzMicsXG4gICAgRmxvYXQ2NEFycmF5OiAnZ2V0RmxvYXQ2NCdcbn07XG5cbmZ1bmN0aW9uIGNvcHlGcm9tQnVmZmVyIChzb3VyY2VBcnJheUJ1ZmZlciwgdmlld1R5cGUsIHBvc2l0aW9uLCBsZW5ndGgsIGZyb21CaWdFbmRpYW4pIHtcbiAgICB2YXIgYnl0ZXNQZXJFbGVtZW50ID0gdmlld1R5cGUuQllURVNfUEVSX0VMRU1FTlQsXG4gICAgICAgIHJlc3VsdDtcblxuICAgIGlmIChmcm9tQmlnRW5kaWFuID09PSBpc0JpZ0VuZGlhblBsYXRmb3JtKCkgfHwgYnl0ZXNQZXJFbGVtZW50ID09PSAxKSB7XG4gICAgICAgIHJlc3VsdCA9IG5ldyB2aWV3VHlwZShzb3VyY2VBcnJheUJ1ZmZlciwgcG9zaXRpb24sIGxlbmd0aCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIHJlYWRWaWV3ID0gbmV3IERhdGFWaWV3KHNvdXJjZUFycmF5QnVmZmVyLCBwb3NpdGlvbiwgbGVuZ3RoICogYnl0ZXNQZXJFbGVtZW50KSxcbiAgICAgICAgICAgIGdldE1ldGhvZCA9IGdldE1ldGhvZHNbdmlld1R5cGUubmFtZV0sXG4gICAgICAgICAgICBsaXR0bGVFbmRpYW4gPSAhZnJvbUJpZ0VuZGlhbjtcblxuICAgICAgICByZXN1bHQgPSBuZXcgdmlld1R5cGUobGVuZ3RoKTtcblxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICByZXN1bHRbaV0gPSByZWFkVmlld1tnZXRNZXRob2RdKGkgKiBieXRlc1BlckVsZW1lbnQsIGxpdHRsZUVuZGlhbik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiBkZWNvZGUgKGJ1ZmZlcikge1xuICAgIHZhciBhcnJheSA9IG5ldyBVaW50OEFycmF5KGJ1ZmZlciksXG4gICAgICAgIHZlcnNpb24gPSBhcnJheVswXSxcbiAgICAgICAgZmxhZ3MgPSBhcnJheVsxXSxcbiAgICAgICAgbWVzaFR5cGUgPSBmbGFncyA+PiA3ICYgMHgwMSxcbiAgICAgICAgaXNUcmlhbmdsZU1lc2ggPSBtZXNoVHlwZSA9PT0gTWVzaFR5cGVzLlRyaWFuZ2xlTWVzaCxcbiAgICAgICAgaW5kaWNlc1R5cGUgPSBmbGFncyA+PiA2ICYgMHgwMSxcbiAgICAgICAgYmlnRW5kaWFuID0gKGZsYWdzID4+IDUgJiAweDAxKSA9PT0gMSxcbiAgICAgICAgYXR0cmlidXRlc051bWJlciA9IGZsYWdzICYgMHgxRixcbiAgICAgICAgdmFsdWVzTnVtYmVyID0gMCxcbiAgICAgICAgZWxlbWVudE51bWJlciA9IDA7XG5cbiAgICBpZiAoYmlnRW5kaWFuKSB7XG4gICAgICAgIHZhbHVlc051bWJlciA9IChhcnJheVsyXSA8PCAxNikgKyAoYXJyYXlbM10gPDwgOCkgKyBhcnJheVs0XTtcbiAgICAgICAgZWxlbWVudE51bWJlciA9IChhcnJheVs1XSA8PCAxNikgKyAoYXJyYXlbNl0gPDwgOCkgKyBhcnJheVs3XTtcbiAgICB9IGVsc2Uge1xuICAgICAgICB2YWx1ZXNOdW1iZXIgPSBhcnJheVsyXSArIChhcnJheVszXSA8PCA4KSArIChhcnJheVs0XSA8PCAxNik7XG4gICAgICAgIGVsZW1lbnROdW1iZXIgPSBhcnJheVs1XSArIChhcnJheVs2XSA8PCA4KSArIChhcnJheVs3XSA8PCAxNik7XG4gICAgfVxuXG4gICAgdmFyIHBvcyA9IDg7XG5cbiAgICB2YXIgYXR0cmlidXRlcyA9IHt9LFxuICAgICAgICBhdHRyaWJ1dGVOYW1lLFxuICAgICAgICBjaGFyLFxuICAgICAgICBhdHRyaWJ1dGVUeXBlLFxuICAgICAgICBjYXJkaW5hbGl0eSxcbiAgICAgICAgZW5jb2RpbmdUeXBlLFxuICAgICAgICBhcnJheVR5cGUsXG4gICAgICAgIHZhbHVlcyxcbiAgICAgICAgaTtcblxuICAgIGZvciAoaSA9IDA7IGkgPCBhdHRyaWJ1dGVzTnVtYmVyOyBpKyspIHtcbiAgICAgICAgYXR0cmlidXRlTmFtZSA9ICcnO1xuXG4gICAgICAgIHdoaWxlIChwb3MgPCBhcnJheS5sZW5ndGgpIHtcbiAgICAgICAgICAgIGNoYXIgPSBhcnJheVtwb3NdO1xuICAgICAgICAgICAgcG9zKys7XG5cbiAgICAgICAgICAgIGlmIChjaGFyID09PSAwKSB7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGF0dHJpYnV0ZU5hbWUgKz0gU3RyaW5nLmZyb21DaGFyQ29kZShjaGFyKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGZsYWdzID0gYXJyYXlbcG9zXTtcblxuICAgICAgICBhdHRyaWJ1dGVUeXBlID0gZmxhZ3MgPj4gNiAmIDB4MDM7XG4gICAgICAgIGNhcmRpbmFsaXR5ID0gKGZsYWdzID4+IDQgJiAweDAzKSArIDE7XG4gICAgICAgIGVuY29kaW5nVHlwZSA9IGZsYWdzICYgMHgwRjtcbiAgICAgICAgYXJyYXlUeXBlID0gSW52ZXJ0ZWRFbmNvZGluZ1R5cGVzW2VuY29kaW5nVHlwZV07XG5cbiAgICAgICAgcG9zKys7XG5cbiAgICAgICAgLy8gcGFkZGluZyB0byBuZXh0IG11bHRpcGxlIG9mIDRcbiAgICAgICAgcG9zID0gTWF0aC5jZWlsKHBvcyAvIDQpICogNDtcblxuICAgICAgICB2YWx1ZXMgPSBjb3B5RnJvbUJ1ZmZlcihidWZmZXIsIGFycmF5VHlwZSwgcG9zLCBjYXJkaW5hbGl0eSAqIHZhbHVlc051bWJlciwgYmlnRW5kaWFuKTtcblxuICAgICAgICBwb3MrPSBhcnJheVR5cGUuQllURVNfUEVSX0VMRU1FTlQgKiBjYXJkaW5hbGl0eSAqIHZhbHVlc051bWJlcjtcblxuICAgICAgICBhdHRyaWJ1dGVzW2F0dHJpYnV0ZU5hbWVdID0ge1xuICAgICAgICAgICAgdHlwZTogYXR0cmlidXRlVHlwZSxcbiAgICAgICAgICAgIGNhcmRpbmFsaXR5OiBjYXJkaW5hbGl0eSxcbiAgICAgICAgICAgIHZhbHVlczogdmFsdWVzXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcG9zID0gTWF0aC5jZWlsKHBvcyAvIDQpICogNDtcblxuICAgIHZhciBpbmRpY2VzO1xuXG4gICAgaWYgKGlzVHJpYW5nbGVNZXNoKSB7XG4gICAgICAgIGluZGljZXMgPSBjb3B5RnJvbUJ1ZmZlcihcbiAgICAgICAgICAgIGJ1ZmZlcixcbiAgICAgICAgICAgIGluZGljZXNUeXBlID09PSAxID8gVWludDMyQXJyYXkgOiBVaW50MTZBcnJheSxcbiAgICAgICAgICAgIHBvcyxcbiAgICAgICAgICAgIGVsZW1lbnROdW1iZXIgKiAzLFxuICAgICAgICAgICAgYmlnRW5kaWFuXG4gICAgICAgICk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgaW5kaWNlcyA9IG5ldyAoZWxlbWVudE51bWJlciA+IDB4RkZGRiA/IFVpbnQzMkFycmF5IDogVWludDE2QXJyYXkpKGVsZW1lbnROdW1iZXIpO1xuXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBlbGVtZW50TnVtYmVyOyBpKyspIHtcbiAgICAgICAgICAgIGluZGljZXNbaV0gPSBpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgdmVyc2lvbjogdmVyc2lvbixcbiAgICAgICAgbWVzaFR5cGU6IG1lc2hUeXBlLFxuICAgICAgICBlbGVtZW50czogZWxlbWVudE51bWJlcixcbiAgICAgICAgYXR0cmlidXRlczogYXR0cmlidXRlcyxcbiAgICAgICAgaW5kaWNlczogaW5kaWNlc1xuICAgIH07XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZGVjb2RlO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBNZXNoVHlwZXMgPSByZXF1aXJlKCcuL21lc2gtdHlwZXMnKSxcbiAgICBpc0JpZ0VuZGlhblBsYXRmb3JtID0gcmVxdWlyZSgnLi4vdXRpbHMvaXMtYmlnLWVuZGlhbi1wbGF0Zm9ybScpO1xuXG4vLyBtYXRjaCB0aGUgVHlwZWRBcnJheSB0eXBlIHdpdGggdGhlIHZhbHVlIGRlZmluZWQgaW4gdGhlIHNwZWNcbnZhciBFbmNvZGluZ1R5cGVzID0ge1xuICAgIEZsb2F0MzJBcnJheTogMSxcbiAgICBJbnQ4QXJyYXk6IDMsXG4gICAgSW50MTZBcnJheTogNCxcbiAgICBJbnQzMkFycmF5OiA2LFxuICAgIFVpbnQ4QXJyYXk6IDcsXG4gICAgVWludDE2QXJyYXk6IDgsXG4gICAgVWludDMyQXJyYXk6IDEwXG59O1xuXG4vLyBkZWZpbmUgdGhlIG1ldGhvZCB0byB1c2Ugb24gYSBEYXRhVmlldywgY29ycmVzcG9uZGluZyB0aGUgVHlwZWRBcnJheSB0eXBlXG52YXIgc2V0TWV0aG9kcyA9IHtcbiAgICBVaW50MTZBcnJheTogJ3NldFVpbnQxNicsXG4gICAgVWludDMyQXJyYXk6ICdzZXRVaW50MzInLFxuICAgIEludDE2QXJyYXk6ICdzZXRJbnQxNicsXG4gICAgSW50MzJBcnJheTogJ3NldEludDMyJyxcbiAgICBGbG9hdDMyQXJyYXk6ICdzZXRGbG9hdDMyJyxcbiAgICBGbG9hdDY0QXJyYXk6ICdzZXRGbG9hdDY0J1xufTtcblxuZnVuY3Rpb24gY29weVRvQnVmZmVyIChzb3VyY2VUeXBlZEFycmF5LCBkZXN0aW5hdGlvbkFycmF5QnVmZmVyLCBwb3NpdGlvbiwgbGVuZ3RoLCBiaWdFbmRpYW4pIHtcbiAgICB2YXIgd3JpdGVBcnJheSA9IG5ldyBzb3VyY2VUeXBlZEFycmF5LmNvbnN0cnVjdG9yKGRlc3RpbmF0aW9uQXJyYXlCdWZmZXIsIHBvc2l0aW9uLCBsZW5ndGgpLFxuICAgICAgICBieXRlc1BlckVsZW1lbnQgPSBzb3VyY2VUeXBlZEFycmF5LkJZVEVTX1BFUl9FTEVNRU5UO1xuXG4gICAgaWYgKGJpZ0VuZGlhbiA9PT0gaXNCaWdFbmRpYW5QbGF0Zm9ybSgpIHx8IGJ5dGVzUGVyRWxlbWVudCA9PT0gMSkge1xuICAgICAgICAvLyBkZXNpcmVkIGVuZGlhbm5lc3MgaXMgdGhlIHNhbWUgYXMgdGhlIHBsYXRmb3JtLCBvciB0aGUgZW5kaWFubmVzcyBkb2Vzbid0IG1hdHRlciAoMSBieXRlKVxuICAgICAgICB3cml0ZUFycmF5LnNldChzb3VyY2VUeXBlZEFycmF5LnN1YmFycmF5KDAsIGxlbmd0aCkpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciB3cml0ZVZpZXcgPSBuZXcgRGF0YVZpZXcoZGVzdGluYXRpb25BcnJheUJ1ZmZlciwgcG9zaXRpb24sIGxlbmd0aCAqIGJ5dGVzUGVyRWxlbWVudCksXG4gICAgICAgICAgICBzZXRNZXRob2QgPSBzZXRNZXRob2RzW3NvdXJjZVR5cGVkQXJyYXkuY29uc3RydWN0b3IubmFtZV0sXG4gICAgICAgICAgICBsaXR0bGVFbmRpYW4gPSAhYmlnRW5kaWFuLFxuICAgICAgICAgICAgaSA9IDA7XG5cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB3cml0ZVZpZXdbc2V0TWV0aG9kXShpICogYnl0ZXNQZXJFbGVtZW50LCBzb3VyY2VUeXBlZEFycmF5W2ldLCBsaXR0bGVFbmRpYW4pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHdyaXRlQXJyYXk7XG59XG5cbmZ1bmN0aW9uIGVuY29kZSAobWVzaFR5cGUsIGF0dHJpYnV0ZXMsIGluZGljZXMsIGJpZ0VuZGlhbikge1xuICAgIHZhciBhdHRyaWJ1dGVLZXlzID0gT2JqZWN0LmtleXMoYXR0cmlidXRlcyksXG4gICAgICAgIGlzVHJpYW5nbGVNZXNoID0gbWVzaFR5cGUgPT09IE1lc2hUeXBlcy5UcmlhbmdsZU1lc2g7XG5cbiAgICAvKiogUFJFTElNSU5BUlkgQ0hFQ0tTICoqL1xuXG4gICAgLy8gdGhpcyBpcyBub3Qgc3VwcG9zZWQgdG8gY2F0Y2ggYWxsIHRoZSBwb3NzaWJsZSBlcnJvcnMsIG9ubHkgc29tZSBvZiB0aGUgZ290Y2hhc1xuXG4gICAgaWYgKG1lc2hUeXBlIDwgMCB8fCBtZXNoVHlwZSA+IDEpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdQUldNIGVuY29kZXI6IEluY29ycmVjdCBtZXNoIHR5cGUnKTtcbiAgICB9XG5cbiAgICBpZiAoYXR0cmlidXRlS2V5cy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdQUldNIGVuY29kZXI6IFRoZSBtb2RlbCBtdXN0IGhhdmUgYXQgbGVhc3Qgb25lIGF0dHJpYnV0ZScpO1xuICAgIH1cblxuICAgIGlmIChpc1RyaWFuZ2xlTWVzaCAmJiBpbmRpY2VzLmNvbnN0cnVjdG9yLm5hbWUgIT09ICdVaW50MTZBcnJheScgJiYgaW5kaWNlcy5jb25zdHJ1Y3Rvci5uYW1lICE9PSAnVWludDMyQXJyYXknKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignUFJXTSBlbmNvZGVyOiBUaGUgaW5kaWNlcyBtdXN0IGJlIHJlcHJlc2VudGVkIGFzIGFuIFVpbnQxNkFycmF5IG9yIGFuIFVpbnQzMkFycmF5Jyk7XG4gICAgfVxuXG4gICAgLyoqIEdFVCBUSEUgVFlQRSBPRiBJTkRJQ0VTIEFTIFdFTEwgQVMgVEhFIE5VTUJFUiBPRiBFTEVNRU5UUyBBTkQgQVRUUiBWQUxVRVMgKiovXG5cbiAgICB2YXIgdmFsdWVzTnVtYmVyID0gYXR0cmlidXRlc1thdHRyaWJ1dGVLZXlzWzBdXS52YWx1ZXMubGVuZ3RoIC8gYXR0cmlidXRlc1thdHRyaWJ1dGVLZXlzWzBdXS5jYXJkaW5hbGl0eSB8IDAsXG4gICAgICAgIGVsZW1lbnROdW1iZXIgPSBpc1RyaWFuZ2xlTWVzaCA/IGluZGljZXMubGVuZ3RoIC8gMyB8IDAgOiB2YWx1ZXNOdW1iZXIsXG4gICAgICAgIGluZGljZXNUeXBlID0gIWlzVHJpYW5nbGVNZXNoIHx8IGluZGljZXMuY29uc3RydWN0b3IubmFtZSA9PT0gJ1VpbnQxNkFycmF5JyA/IDAgOiAxO1xuXG4gICAgLyoqIEdFVCBUSEUgRklMRSBMRU5HVEggKiovXG5cbiAgICB2YXIgdG90YWxMZW5ndGggPSA4LFxuICAgICAgICBhdHRyaWJ1dGVLZXksXG4gICAgICAgIGF0dHJpYnV0ZSxcbiAgICAgICAgYXR0cmlidXRlTGVuZ3RoLFxuICAgICAgICBpLCBqO1xuXG4gICAgZm9yIChpID0gMDsgaSA8IGF0dHJpYnV0ZUtleXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgYXR0cmlidXRlS2V5ID0gYXR0cmlidXRlS2V5c1tpXTtcbiAgICAgICAgYXR0cmlidXRlID0gYXR0cmlidXRlc1thdHRyaWJ1dGVLZXldO1xuICAgICAgICBhdHRyaWJ1dGVMZW5ndGggPSBhdHRyaWJ1dGVLZXkubGVuZ3RoICsgMjsgLy8gTlVMIGJ5dGUgKyBmbGFnIGJ5dGVcbiAgICAgICAgYXR0cmlidXRlTGVuZ3RoID0gTWF0aC5jZWlsKGF0dHJpYnV0ZUxlbmd0aCAvIDQpICogNCArIGF0dHJpYnV0ZS52YWx1ZXMuYnl0ZUxlbmd0aDtcbiAgICAgICAgdG90YWxMZW5ndGggKz0gYXR0cmlidXRlTGVuZ3RoO1xuICAgIH1cblxuICAgIHRvdGFsTGVuZ3RoID0gTWF0aC5jZWlsKHRvdGFsTGVuZ3RoIC8gNCkgKiA0O1xuXG4gICAgaWYgKGlzVHJpYW5nbGVNZXNoKSB7XG4gICAgICAgIHRvdGFsTGVuZ3RoICs9IGluZGljZXMuYnl0ZUxlbmd0aDtcbiAgICB9XG5cbiAgICAvKiogSU5JVElBTElaRSBUSEUgQlVGRkVSICovXG5cbiAgICB2YXIgYnVmZmVyID0gbmV3IEFycmF5QnVmZmVyKHRvdGFsTGVuZ3RoKSxcbiAgICAgICAgYXJyYXkgPSBuZXcgVWludDhBcnJheShidWZmZXIpO1xuXG4gICAgLyoqIEhFQURFUiAqKi9cblxuICAgIGFycmF5WzBdID0gMTtcbiAgICBhcnJheVsxXSA9IChcbiAgICAgICAgbWVzaFR5cGUgPDwgNyB8XG4gICAgICAgIGluZGljZXNUeXBlIDw8IDYgfFxuICAgICAgICAoYmlnRW5kaWFuID8gMSA6IDApIDw8IDUgfFxuICAgICAgICBhdHRyaWJ1dGVLZXlzLmxlbmd0aCAmIDB4MUZcbiAgICApO1xuXG4gICAgaWYgKGJpZ0VuZGlhbikge1xuICAgICAgICBhcnJheVsyXSA9IHZhbHVlc051bWJlciA+PiAxNiAmIDB4RkY7XG4gICAgICAgIGFycmF5WzNdID0gdmFsdWVzTnVtYmVyID4+IDggJiAweEZGO1xuICAgICAgICBhcnJheVs0XSA9IHZhbHVlc051bWJlciAmIDB4RkY7XG5cbiAgICAgICAgYXJyYXlbNV0gPSBlbGVtZW50TnVtYmVyID4+IDE2ICYgMHhGRjtcbiAgICAgICAgYXJyYXlbNl0gPSBlbGVtZW50TnVtYmVyID4+IDggJiAweEZGO1xuICAgICAgICBhcnJheVs3XSA9IGVsZW1lbnROdW1iZXIgJiAweEZGO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGFycmF5WzJdID0gdmFsdWVzTnVtYmVyICYgMHhGRjtcbiAgICAgICAgYXJyYXlbM10gPSB2YWx1ZXNOdW1iZXIgPj4gOCAmIDB4RkY7XG4gICAgICAgIGFycmF5WzRdID0gdmFsdWVzTnVtYmVyID4+IDE2ICYgMHhGRjtcblxuICAgICAgICBhcnJheVs1XSA9IGVsZW1lbnROdW1iZXIgJiAweEZGO1xuICAgICAgICBhcnJheVs2XSA9IGVsZW1lbnROdW1iZXIgPj4gOCAmIDB4RkY7XG4gICAgICAgIGFycmF5WzddID0gZWxlbWVudE51bWJlciA+PiAxNiAmIDB4RkY7XG4gICAgfVxuXG5cbiAgICB2YXIgcG9zID0gODtcblxuICAgIC8qKiBBVFRSSUJVVEVTICoqL1xuXG4gICAgZm9yIChpID0gMDsgaSA8IGF0dHJpYnV0ZUtleXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgYXR0cmlidXRlS2V5ID0gYXR0cmlidXRlS2V5c1tpXTtcbiAgICAgICAgYXR0cmlidXRlID0gYXR0cmlidXRlc1thdHRyaWJ1dGVLZXldO1xuXG4gICAgICAgIC8qKiogV1JJVEUgQVRUUklCVVRFIEhFQURFUiAqKiovXG5cbiAgICAgICAgZm9yIChqID0gMDsgaiA8IGF0dHJpYnV0ZUtleS5sZW5ndGg7IGorKywgcG9zKyspIHtcbiAgICAgICAgICAgIGFycmF5W3Bvc10gPSAoYXR0cmlidXRlS2V5LmNoYXJDb2RlQXQoaikgJiAweDdGKSB8fCAweDVGOyAvLyBkZWZhdWx0IHRvIHVuZGVyc2NvcmVcbiAgICAgICAgfVxuXG4gICAgICAgIHBvcysrO1xuXG4gICAgICAgIGFycmF5W3Bvc10gPSAoXG4gICAgICAgICAgICAoYXR0cmlidXRlLnR5cGUgJiAweDAzKSA8PCA2IHxcbiAgICAgICAgICAgICgoYXR0cmlidXRlLmNhcmRpbmFsaXR5IC0gMSkgJiAweDAzKSA8PCA0IHxcbiAgICAgICAgICAgIEVuY29kaW5nVHlwZXNbYXR0cmlidXRlLnZhbHVlcy5jb25zdHJ1Y3Rvci5uYW1lXSAmIDB4MEZcbiAgICAgICAgKTtcblxuICAgICAgICBwb3MrKztcblxuXG4gICAgICAgIC8vIHBhZGRpbmcgdG8gbmV4dCBtdWx0aXBsZSBvZiA0XG4gICAgICAgIHBvcyA9IE1hdGguY2VpbChwb3MgLyA0KSAqIDQ7XG5cbiAgICAgICAgLyoqKiBXUklURSBBVFRSSUJVVEUgVkFMVUVTICoqKi9cblxuICAgICAgICB2YXIgYXR0cmlidXRlc1dyaXRlQXJyYXkgPSBjb3B5VG9CdWZmZXIoYXR0cmlidXRlLnZhbHVlcywgYnVmZmVyLCBwb3MsIGF0dHJpYnV0ZS5jYXJkaW5hbGl0eSAqIHZhbHVlc051bWJlciwgYmlnRW5kaWFuKTtcblxuICAgICAgICBwb3MgKz0gYXR0cmlidXRlc1dyaXRlQXJyYXkuYnl0ZUxlbmd0aDtcbiAgICB9XG5cbiAgICAvKioqIFdSSVRFIElORElDRVMgVkFMVUVTICoqKi9cblxuICAgIHBvcyA9IE1hdGguY2VpbChwb3MgLyA0KSAqIDQ7XG5cbiAgICBpZiAoaXNUcmlhbmdsZU1lc2gpIHtcbiAgICAgICAgY29weVRvQnVmZmVyKGluZGljZXMsIGJ1ZmZlciwgcG9zLCBlbGVtZW50TnVtYmVyICogMywgYmlnRW5kaWFuKTtcbiAgICB9XG5cbiAgICByZXR1cm4gYnVmZmVyO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGVuY29kZTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBQb2ludENsb3VkOiAwLFxuICAgIFRyaWFuZ2xlTWVzaDogMVxufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgYmlnRW5kaWFuUGxhdGZvcm0gPSBudWxsO1xuXG4vKipcbiAqIENoZWNrIGlmIHRoZSBlbmRpYW5uZXNzIG9mIHRoZSBwbGF0Zm9ybSBpcyBiaWctZW5kaWFuIChtb3N0IHNpZ25pZmljYW50IGJpdCBmaXJzdClcbiAqIEByZXR1cm5zIHtib29sZWFufSBUcnVlIGlmIGJpZy1lbmRpYW4sIGZhbHNlIGlmIGxpdHRsZS1lbmRpYW5cbiAqL1xuZnVuY3Rpb24gaXNCaWdFbmRpYW5QbGF0Zm9ybSAoKSB7XG4gICAgaWYgKGJpZ0VuZGlhblBsYXRmb3JtID09PSBudWxsKSB7XG4gICAgICAgIHZhciBidWZmZXIgPSBuZXcgQXJyYXlCdWZmZXIoMiksXG4gICAgICAgICAgICB1aW50OEFycmF5ID0gbmV3IFVpbnQ4QXJyYXkoYnVmZmVyKSxcbiAgICAgICAgICAgIHVpbnQxNkFycmF5ID0gbmV3IFVpbnQxNkFycmF5KGJ1ZmZlcik7XG5cbiAgICAgICAgdWludDhBcnJheVswXSA9IDB4QUE7IC8vIHNldCBmaXJzdCBieXRlXG4gICAgICAgIHVpbnQ4QXJyYXlbMV0gPSAweEJCOyAvLyBzZXQgc2Vjb25kIGJ5dGVcbiAgICAgICAgYmlnRW5kaWFuUGxhdGZvcm0gPSAodWludDE2QXJyYXlbMF0gPT09IDB4QUFCQik7XG4gICAgfVxuXG4gICAgcmV0dXJuIGJpZ0VuZGlhblBsYXRmb3JtO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGlzQmlnRW5kaWFuUGxhdGZvcm07XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIHByd20gPSByZXF1aXJlKCcuLi9wcndtL2luZGV4Jyk7XG5cblRIUkVFLlBSV01Mb2FkZXIgPSBmdW5jdGlvbiBQUldNTG9hZGVyIChtYW5hZ2VyKSB7XG4gICAgdGhpcy5tYW5hZ2VyID0gKCBtYW5hZ2VyICE9PSB1bmRlZmluZWQgKSA/IG1hbmFnZXIgOiBUSFJFRS5EZWZhdWx0TG9hZGluZ01hbmFnZXI7XG59O1xuXG5USFJFRS5QUldNTG9hZGVyLnByb3RvdHlwZSA9IHtcblxuICAgIGNvbnN0cnVjdG9yOiBUSFJFRS5QUldNTG9hZGVyLFxuXG4gICAgbG9hZDogZnVuY3Rpb24gKCB1cmwsIG9uTG9hZCwgb25Qcm9ncmVzcywgb25FcnJvciApIHtcblxuICAgICAgICB2YXIgc2NvcGUgPSB0aGlzO1xuXG4gICAgICAgIHZhciBsb2FkZXIgPSBuZXcgVEhSRUUuRmlsZUxvYWRlciggc2NvcGUubWFuYWdlciApO1xuICAgICAgICBsb2FkZXIuc2V0UmVzcG9uc2VUeXBlKCAnYXJyYXlidWZmZXInICk7XG4gICAgICAgIGxvYWRlci5sb2FkKCB1cmwsIGZ1bmN0aW9uICggYXJyYXlCdWZmZXIgKSB7XG4gICAgICAgICAgICBvbkxvYWQoIHNjb3BlLnBhcnNlKCBhcnJheUJ1ZmZlciApICk7XG4gICAgICAgIH0sIG9uUHJvZ3Jlc3MsIG9uRXJyb3IgKTtcblxuICAgIH0sXG5cbiAgICBwYXJzZTogZnVuY3Rpb24gKCBhcnJheUJ1ZmZlciApIHtcbiAgICAgICAgY29uc29sZS50aW1lKCdQUldNTG9hZGVyJyk7XG5cbiAgICAgICAgdmFyIGRhdGEgPSBwcndtLmRlY29kZVByd20oYXJyYXlCdWZmZXIpLFxuICAgICAgICAgICAgYXR0cmlidXRlc0tleSA9IE9iamVjdC5rZXlzKGRhdGEuYXR0cmlidXRlcyksXG4gICAgICAgICAgICBidWZmZXJHZW9tZXRyeSA9IG5ldyBUSFJFRS5CdWZmZXJHZW9tZXRyeSgpLFxuICAgICAgICAgICAgYXR0cmlidXRlLFxuICAgICAgICAgICAgaTtcblxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgYXR0cmlidXRlc0tleS5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgYXR0cmlidXRlID0gZGF0YS5hdHRyaWJ1dGVzW2F0dHJpYnV0ZXNLZXlbaV1dO1xuICAgICAgICAgICAgYnVmZmVyR2VvbWV0cnkuYWRkQXR0cmlidXRlKGF0dHJpYnV0ZXNLZXlbaV0sIG5ldyBUSFJFRS5CdWZmZXJBdHRyaWJ1dGUoYXR0cmlidXRlLnZhbHVlcywgYXR0cmlidXRlLmNhcmRpbmFsaXR5KSk7XG4gICAgICAgIH1cblxuICAgICAgICBidWZmZXJHZW9tZXRyeS5zZXRJbmRleChuZXcgVEhSRUUuQnVmZmVyQXR0cmlidXRlKGRhdGEuaW5kaWNlcywgMSkpO1xuXG4gICAgICAgIGNvbnNvbGUudGltZUVuZCgnUFJXTUxvYWRlcicpO1xuXG4gICAgICAgIHJldHVybiBidWZmZXJHZW9tZXRyeTtcbiAgICB9XG59O1xuXG5USFJFRS5QUldNTG9hZGVyLmlzQmlnRW5kaWFuUGxhdGZvcm0gPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHByd20uaXNCaWdFbmRpYW5QbGF0Zm9ybSgpO1xufTtcbiJdfQ==
