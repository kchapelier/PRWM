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

var PRWMLoader = function PRWMLoader (manager) {
    //this.manager = ( manager !== undefined ) ? manager : THREE.DefaultLoadingManager;
};

PRWMLoader.prototype = {
    constructor: PRWMLoader,
    load: function ( url, onLoad, onProgress, onError ) {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", url, true);
        xhr.responseType = 'arraybuffer';


        /*
        var loader = new THREE.FileLoader( this.manager );
        loader.setResponseType( 'arraybuffer' );
        loader.load( url, function ( buffer ) {

        });
        */

        xhr.onload = function (e) {
            if (this.readyState === 4) {
                console.time('PRWMLoader');
                var data = prwm.decodePrwm(this.response),
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

                onLoad(bufferGeometry);
            }
        };

        xhr.send(null);
    }
};

module.exports = PRWMLoader;

},{"../prwm/index":1}]},{},[7])(7)
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL3Vzci9sb2NhbC9saWIvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsIi4uL3Byd20vaW5kZXguanMiLCIuLi9wcndtL3Byd20vYXR0cmlidXRlLXR5cGVzLmpzIiwiLi4vcHJ3bS9wcndtL2RlY29kZS5qcyIsIi4uL3Byd20vcHJ3bS9lbmNvZGUuanMiLCIuLi9wcndtL3Byd20vbWVzaC10eXBlcy5qcyIsIi4uL3Byd20vdXRpbHMvaXMtYmlnLWVuZGlhbi1wbGF0Zm9ybS5qcyIsImluZGV4LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNWQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1BBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaExBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ05BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIlwidXNlIHN0cmljdFwiO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBBdHRyaWJ1dGVUeXBlczogcmVxdWlyZSgnLi9wcndtL2F0dHJpYnV0ZS10eXBlcycpLFxuICAgIE1lc2hUeXBlcyA6IHJlcXVpcmUoJy4vcHJ3bS9tZXNoLXR5cGVzJyksXG5cbiAgICBpc0JpZ0VuZGlhblBsYXRmb3JtOiByZXF1aXJlKCcuL3V0aWxzL2lzLWJpZy1lbmRpYW4tcGxhdGZvcm0nKSxcbiAgICBlbmNvZGVQcndtOiByZXF1aXJlKCcuL3Byd20vZW5jb2RlJyksXG4gICAgZGVjb2RlUHJ3bTogcmVxdWlyZSgnLi9wcndtL2RlY29kZScpXG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICAgIEludDogMCxcbiAgICBVaW50OiAxLFxuICAgIEZsb2F0OiAyXG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBNZXNoVHlwZXMgPSByZXF1aXJlKCcuL21lc2gtdHlwZXMnKSxcbiAgICBpc0JpZ0VuZGlhblBsYXRmb3JtID0gcmVxdWlyZSgnLi4vdXRpbHMvaXMtYmlnLWVuZGlhbi1wbGF0Zm9ybScpO1xuXG4vLyBtYXRjaCB0aGUgdmFsdWVzIGRlZmluZWQgaW4gdGhlIHNwZWMgdG8gdGhlIFR5cGVkQXJyYXkgdHlwZXNcbnZhciBJbnZlcnRlZEVuY29kaW5nVHlwZXMgPSBbXG4gICAgbnVsbCxcbiAgICBGbG9hdDMyQXJyYXksXG4gICAgbnVsbCxcbiAgICBJbnQ4QXJyYXksXG4gICAgSW50MTZBcnJheSxcbiAgICBudWxsLFxuICAgIEludDMyQXJyYXksXG4gICAgVWludDhBcnJheSxcbiAgICBVaW50MTZBcnJheSxcbiAgICBudWxsLFxuICAgIFVpbnQzMkFycmF5XG5dO1xuXG4vLyBkZWZpbmUgdGhlIG1ldGhvZCB0byB1c2Ugb24gYSBEYXRhVmlldywgY29ycmVzcG9uZGluZyB0aGUgVHlwZWRBcnJheSB0eXBlXG52YXIgZ2V0TWV0aG9kcyA9IHtcbiAgICBVaW50MTZBcnJheTogJ2dldFVpbnQxNicsXG4gICAgVWludDMyQXJyYXk6ICdnZXRVaW50MzInLFxuICAgIEludDE2QXJyYXk6ICdnZXRJbnQxNicsXG4gICAgSW50MzJBcnJheTogJ2dldEludDMyJyxcbiAgICBGbG9hdDMyQXJyYXk6ICdnZXRGbG9hdDMyJyxcbiAgICBGbG9hdDY0QXJyYXk6ICdnZXRGbG9hdDY0J1xufTtcblxuZnVuY3Rpb24gY29weUZyb21CdWZmZXIgKHNvdXJjZUFycmF5QnVmZmVyLCB2aWV3VHlwZSwgcG9zaXRpb24sIGxlbmd0aCwgZnJvbUJpZ0VuZGlhbikge1xuICAgIHZhciBieXRlc1BlckVsZW1lbnQgPSB2aWV3VHlwZS5CWVRFU19QRVJfRUxFTUVOVCxcbiAgICAgICAgcmVzdWx0O1xuXG4gICAgaWYgKGZyb21CaWdFbmRpYW4gPT09IGlzQmlnRW5kaWFuUGxhdGZvcm0oKSB8fCBieXRlc1BlckVsZW1lbnQgPT09IDEpIHtcbiAgICAgICAgcmVzdWx0ID0gbmV3IHZpZXdUeXBlKHNvdXJjZUFycmF5QnVmZmVyLCBwb3NpdGlvbiwgbGVuZ3RoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgcmVhZFZpZXcgPSBuZXcgRGF0YVZpZXcoc291cmNlQXJyYXlCdWZmZXIsIHBvc2l0aW9uLCBsZW5ndGggKiBieXRlc1BlckVsZW1lbnQpLFxuICAgICAgICAgICAgZ2V0TWV0aG9kID0gZ2V0TWV0aG9kc1t2aWV3VHlwZS5uYW1lXSxcbiAgICAgICAgICAgIGxpdHRsZUVuZGlhbiA9ICFmcm9tQmlnRW5kaWFuO1xuXG4gICAgICAgIHJlc3VsdCA9IG5ldyB2aWV3VHlwZShsZW5ndGgpO1xuXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHJlc3VsdFtpXSA9IHJlYWRWaWV3W2dldE1ldGhvZF0oaSAqIGJ5dGVzUGVyRWxlbWVudCwgbGl0dGxlRW5kaWFuKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiByZXN1bHQ7XG59XG5cbmZ1bmN0aW9uIGRlY29kZSAoYnVmZmVyKSB7XG4gICAgdmFyIGFycmF5ID0gbmV3IFVpbnQ4QXJyYXkoYnVmZmVyKSxcbiAgICAgICAgdmVyc2lvbiA9IGFycmF5WzBdLFxuICAgICAgICBmbGFncyA9IGFycmF5WzFdLFxuICAgICAgICBtZXNoVHlwZSA9IGZsYWdzID4+IDcgJiAweDAxLFxuICAgICAgICBpc1RyaWFuZ2xlTWVzaCA9IG1lc2hUeXBlID09PSBNZXNoVHlwZXMuVHJpYW5nbGVNZXNoLFxuICAgICAgICBpbmRpY2VzVHlwZSA9IGZsYWdzID4+IDYgJiAweDAxLFxuICAgICAgICBiaWdFbmRpYW4gPSAoZmxhZ3MgPj4gNSAmIDB4MDEpID09PSAxLFxuICAgICAgICBhdHRyaWJ1dGVzTnVtYmVyID0gZmxhZ3MgJiAweDFGLFxuICAgICAgICB2YWx1ZXNOdW1iZXIgPSAwLFxuICAgICAgICBlbGVtZW50TnVtYmVyID0gMDtcblxuICAgIGlmIChiaWdFbmRpYW4pIHtcbiAgICAgICAgdmFsdWVzTnVtYmVyID0gKGFycmF5WzJdIDw8IDE2KSArIChhcnJheVszXSA8PCA4KSArIGFycmF5WzRdO1xuICAgICAgICBlbGVtZW50TnVtYmVyID0gKGFycmF5WzVdIDw8IDE2KSArIChhcnJheVs2XSA8PCA4KSArIGFycmF5WzddO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHZhbHVlc051bWJlciA9IGFycmF5WzJdICsgKGFycmF5WzNdIDw8IDgpICsgKGFycmF5WzRdIDw8IDE2KTtcbiAgICAgICAgZWxlbWVudE51bWJlciA9IGFycmF5WzVdICsgKGFycmF5WzZdIDw8IDgpICsgKGFycmF5WzddIDw8IDE2KTtcbiAgICB9XG5cbiAgICB2YXIgcG9zID0gODtcblxuICAgIHZhciBhdHRyaWJ1dGVzID0ge30sXG4gICAgICAgIGF0dHJpYnV0ZU5hbWUsXG4gICAgICAgIGNoYXIsXG4gICAgICAgIGF0dHJpYnV0ZVR5cGUsXG4gICAgICAgIGNhcmRpbmFsaXR5LFxuICAgICAgICBlbmNvZGluZ1R5cGUsXG4gICAgICAgIGFycmF5VHlwZSxcbiAgICAgICAgdmFsdWVzLFxuICAgICAgICBpO1xuXG4gICAgZm9yIChpID0gMDsgaSA8IGF0dHJpYnV0ZXNOdW1iZXI7IGkrKykge1xuICAgICAgICBhdHRyaWJ1dGVOYW1lID0gJyc7XG5cbiAgICAgICAgd2hpbGUgKHBvcyA8IGFycmF5Lmxlbmd0aCkge1xuICAgICAgICAgICAgY2hhciA9IGFycmF5W3Bvc107XG4gICAgICAgICAgICBwb3MrKztcblxuICAgICAgICAgICAgaWYgKGNoYXIgPT09IDApIHtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgYXR0cmlidXRlTmFtZSArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGNoYXIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgZmxhZ3MgPSBhcnJheVtwb3NdO1xuXG4gICAgICAgIGF0dHJpYnV0ZVR5cGUgPSBmbGFncyA+PiA2ICYgMHgwMztcbiAgICAgICAgY2FyZGluYWxpdHkgPSAoZmxhZ3MgPj4gNCAmIDB4MDMpICsgMTtcbiAgICAgICAgZW5jb2RpbmdUeXBlID0gZmxhZ3MgJiAweDBGO1xuICAgICAgICBhcnJheVR5cGUgPSBJbnZlcnRlZEVuY29kaW5nVHlwZXNbZW5jb2RpbmdUeXBlXTtcblxuICAgICAgICBwb3MrKztcblxuICAgICAgICAvLyBwYWRkaW5nIHRvIG5leHQgbXVsdGlwbGUgb2YgNFxuICAgICAgICBwb3MgPSBNYXRoLmNlaWwocG9zIC8gNCkgKiA0O1xuXG4gICAgICAgIHZhbHVlcyA9IGNvcHlGcm9tQnVmZmVyKGJ1ZmZlciwgYXJyYXlUeXBlLCBwb3MsIGNhcmRpbmFsaXR5ICogdmFsdWVzTnVtYmVyLCBiaWdFbmRpYW4pO1xuXG4gICAgICAgIHBvcys9IGFycmF5VHlwZS5CWVRFU19QRVJfRUxFTUVOVCAqIGNhcmRpbmFsaXR5ICogdmFsdWVzTnVtYmVyO1xuXG4gICAgICAgIGF0dHJpYnV0ZXNbYXR0cmlidXRlTmFtZV0gPSB7XG4gICAgICAgICAgICB0eXBlOiBhdHRyaWJ1dGVUeXBlLFxuICAgICAgICAgICAgY2FyZGluYWxpdHk6IGNhcmRpbmFsaXR5LFxuICAgICAgICAgICAgdmFsdWVzOiB2YWx1ZXNcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBwb3MgPSBNYXRoLmNlaWwocG9zIC8gNCkgKiA0O1xuXG4gICAgdmFyIGluZGljZXM7XG5cbiAgICBpZiAoaXNUcmlhbmdsZU1lc2gpIHtcbiAgICAgICAgaW5kaWNlcyA9IGNvcHlGcm9tQnVmZmVyKFxuICAgICAgICAgICAgYnVmZmVyLFxuICAgICAgICAgICAgaW5kaWNlc1R5cGUgPT09IDEgPyBVaW50MzJBcnJheSA6IFVpbnQxNkFycmF5LFxuICAgICAgICAgICAgcG9zLFxuICAgICAgICAgICAgZWxlbWVudE51bWJlciAqIDMsXG4gICAgICAgICAgICBiaWdFbmRpYW5cbiAgICAgICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBpbmRpY2VzID0gbmV3IChlbGVtZW50TnVtYmVyID4gMHhGRkZGID8gVWludDMyQXJyYXkgOiBVaW50MTZBcnJheSkoZWxlbWVudE51bWJlcik7XG5cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGVsZW1lbnROdW1iZXI7IGkrKykge1xuICAgICAgICAgICAgaW5kaWNlc1tpXSA9IGk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICB2ZXJzaW9uOiB2ZXJzaW9uLFxuICAgICAgICBtZXNoVHlwZTogbWVzaFR5cGUsXG4gICAgICAgIGVsZW1lbnRzOiBlbGVtZW50TnVtYmVyLFxuICAgICAgICBhdHRyaWJ1dGVzOiBhdHRyaWJ1dGVzLFxuICAgICAgICBpbmRpY2VzOiBpbmRpY2VzXG4gICAgfTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBkZWNvZGU7XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIE1lc2hUeXBlcyA9IHJlcXVpcmUoJy4vbWVzaC10eXBlcycpLFxuICAgIGlzQmlnRW5kaWFuUGxhdGZvcm0gPSByZXF1aXJlKCcuLi91dGlscy9pcy1iaWctZW5kaWFuLXBsYXRmb3JtJyk7XG5cbi8vIG1hdGNoIHRoZSBUeXBlZEFycmF5IHR5cGUgd2l0aCB0aGUgdmFsdWUgZGVmaW5lZCBpbiB0aGUgc3BlY1xudmFyIEVuY29kaW5nVHlwZXMgPSB7XG4gICAgRmxvYXQzMkFycmF5OiAxLFxuICAgIEludDhBcnJheTogMyxcbiAgICBJbnQxNkFycmF5OiA0LFxuICAgIEludDMyQXJyYXk6IDYsXG4gICAgVWludDhBcnJheTogNyxcbiAgICBVaW50MTZBcnJheTogOCxcbiAgICBVaW50MzJBcnJheTogMTBcbn07XG5cbi8vIGRlZmluZSB0aGUgbWV0aG9kIHRvIHVzZSBvbiBhIERhdGFWaWV3LCBjb3JyZXNwb25kaW5nIHRoZSBUeXBlZEFycmF5IHR5cGVcbnZhciBzZXRNZXRob2RzID0ge1xuICAgIFVpbnQxNkFycmF5OiAnc2V0VWludDE2JyxcbiAgICBVaW50MzJBcnJheTogJ3NldFVpbnQzMicsXG4gICAgSW50MTZBcnJheTogJ3NldEludDE2JyxcbiAgICBJbnQzMkFycmF5OiAnc2V0SW50MzInLFxuICAgIEZsb2F0MzJBcnJheTogJ3NldEZsb2F0MzInLFxuICAgIEZsb2F0NjRBcnJheTogJ3NldEZsb2F0NjQnXG59O1xuXG5mdW5jdGlvbiBjb3B5VG9CdWZmZXIgKHNvdXJjZVR5cGVkQXJyYXksIGRlc3RpbmF0aW9uQXJyYXlCdWZmZXIsIHBvc2l0aW9uLCBsZW5ndGgsIGJpZ0VuZGlhbikge1xuICAgIHZhciB3cml0ZUFycmF5ID0gbmV3IHNvdXJjZVR5cGVkQXJyYXkuY29uc3RydWN0b3IoZGVzdGluYXRpb25BcnJheUJ1ZmZlciwgcG9zaXRpb24sIGxlbmd0aCksXG4gICAgICAgIGJ5dGVzUGVyRWxlbWVudCA9IHNvdXJjZVR5cGVkQXJyYXkuQllURVNfUEVSX0VMRU1FTlQ7XG5cbiAgICBpZiAoYmlnRW5kaWFuID09PSBpc0JpZ0VuZGlhblBsYXRmb3JtKCkgfHwgYnl0ZXNQZXJFbGVtZW50ID09PSAxKSB7XG4gICAgICAgIC8vIGRlc2lyZWQgZW5kaWFubmVzcyBpcyB0aGUgc2FtZSBhcyB0aGUgcGxhdGZvcm0sIG9yIHRoZSBlbmRpYW5uZXNzIGRvZXNuJ3QgbWF0dGVyICgxIGJ5dGUpXG4gICAgICAgIHdyaXRlQXJyYXkuc2V0KHNvdXJjZVR5cGVkQXJyYXkuc3ViYXJyYXkoMCwgbGVuZ3RoKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIHdyaXRlVmlldyA9IG5ldyBEYXRhVmlldyhkZXN0aW5hdGlvbkFycmF5QnVmZmVyLCBwb3NpdGlvbiwgbGVuZ3RoICogYnl0ZXNQZXJFbGVtZW50KSxcbiAgICAgICAgICAgIHNldE1ldGhvZCA9IHNldE1ldGhvZHNbc291cmNlVHlwZWRBcnJheS5jb25zdHJ1Y3Rvci5uYW1lXSxcbiAgICAgICAgICAgIGxpdHRsZUVuZGlhbiA9ICFiaWdFbmRpYW4sXG4gICAgICAgICAgICBpID0gMDtcblxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHdyaXRlVmlld1tzZXRNZXRob2RdKGkgKiBieXRlc1BlckVsZW1lbnQsIHNvdXJjZVR5cGVkQXJyYXlbaV0sIGxpdHRsZUVuZGlhbik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gd3JpdGVBcnJheTtcbn1cblxuZnVuY3Rpb24gZW5jb2RlIChtZXNoVHlwZSwgYXR0cmlidXRlcywgaW5kaWNlcywgYmlnRW5kaWFuKSB7XG4gICAgdmFyIGF0dHJpYnV0ZUtleXMgPSBPYmplY3Qua2V5cyhhdHRyaWJ1dGVzKSxcbiAgICAgICAgaXNUcmlhbmdsZU1lc2ggPSBtZXNoVHlwZSA9PT0gTWVzaFR5cGVzLlRyaWFuZ2xlTWVzaDtcblxuICAgIC8qKiBQUkVMSU1JTkFSWSBDSEVDS1MgKiovXG5cbiAgICAvLyB0aGlzIGlzIG5vdCBzdXBwb3NlZCB0byBjYXRjaCBhbGwgdGhlIHBvc3NpYmxlIGVycm9ycywgb25seSBzb21lIG9mIHRoZSBnb3RjaGFzXG5cbiAgICBpZiAobWVzaFR5cGUgPCAwIHx8IG1lc2hUeXBlID4gMSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BSV00gZW5jb2RlcjogSW5jb3JyZWN0IG1lc2ggdHlwZScpO1xuICAgIH1cblxuICAgIGlmIChhdHRyaWJ1dGVLZXlzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BSV00gZW5jb2RlcjogVGhlIG1vZGVsIG11c3QgaGF2ZSBhdCBsZWFzdCBvbmUgYXR0cmlidXRlJyk7XG4gICAgfVxuXG4gICAgaWYgKGlzVHJpYW5nbGVNZXNoICYmIGluZGljZXMuY29uc3RydWN0b3IubmFtZSAhPT0gJ1VpbnQxNkFycmF5JyAmJiBpbmRpY2VzLmNvbnN0cnVjdG9yLm5hbWUgIT09ICdVaW50MzJBcnJheScpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdQUldNIGVuY29kZXI6IFRoZSBpbmRpY2VzIG11c3QgYmUgcmVwcmVzZW50ZWQgYXMgYW4gVWludDE2QXJyYXkgb3IgYW4gVWludDMyQXJyYXknKTtcbiAgICB9XG5cbiAgICAvKiogR0VUIFRIRSBUWVBFIE9GIElORElDRVMgQVMgV0VMTCBBUyBUSEUgTlVNQkVSIE9GIEVMRU1FTlRTIEFORCBBVFRSIFZBTFVFUyAqKi9cblxuICAgIHZhciB2YWx1ZXNOdW1iZXIgPSBhdHRyaWJ1dGVzW2F0dHJpYnV0ZUtleXNbMF1dLnZhbHVlcy5sZW5ndGggLyBhdHRyaWJ1dGVzW2F0dHJpYnV0ZUtleXNbMF1dLmNhcmRpbmFsaXR5IHwgMCxcbiAgICAgICAgZWxlbWVudE51bWJlciA9IGlzVHJpYW5nbGVNZXNoID8gaW5kaWNlcy5sZW5ndGggLyAzIHwgMCA6IHZhbHVlc051bWJlcixcbiAgICAgICAgaW5kaWNlc1R5cGUgPSAhaXNUcmlhbmdsZU1lc2ggfHwgaW5kaWNlcy5jb25zdHJ1Y3Rvci5uYW1lID09PSAnVWludDE2QXJyYXknID8gMCA6IDE7XG5cbiAgICAvKiogR0VUIFRIRSBGSUxFIExFTkdUSCAqKi9cblxuICAgIHZhciB0b3RhbExlbmd0aCA9IDgsXG4gICAgICAgIGF0dHJpYnV0ZUtleSxcbiAgICAgICAgYXR0cmlidXRlLFxuICAgICAgICBhdHRyaWJ1dGVMZW5ndGgsXG4gICAgICAgIGksIGo7XG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgYXR0cmlidXRlS2V5cy5sZW5ndGg7IGkrKykge1xuICAgICAgICBhdHRyaWJ1dGVLZXkgPSBhdHRyaWJ1dGVLZXlzW2ldO1xuICAgICAgICBhdHRyaWJ1dGUgPSBhdHRyaWJ1dGVzW2F0dHJpYnV0ZUtleV07XG4gICAgICAgIGF0dHJpYnV0ZUxlbmd0aCA9IGF0dHJpYnV0ZUtleS5sZW5ndGggKyAyOyAvLyBOVUwgYnl0ZSArIGZsYWcgYnl0ZVxuICAgICAgICBhdHRyaWJ1dGVMZW5ndGggPSBNYXRoLmNlaWwoYXR0cmlidXRlTGVuZ3RoIC8gNCkgKiA0ICsgYXR0cmlidXRlLnZhbHVlcy5ieXRlTGVuZ3RoO1xuICAgICAgICB0b3RhbExlbmd0aCArPSBhdHRyaWJ1dGVMZW5ndGg7XG4gICAgfVxuXG4gICAgdG90YWxMZW5ndGggPSBNYXRoLmNlaWwodG90YWxMZW5ndGggLyA0KSAqIDQ7XG5cbiAgICBpZiAoaXNUcmlhbmdsZU1lc2gpIHtcbiAgICAgICAgdG90YWxMZW5ndGggKz0gaW5kaWNlcy5ieXRlTGVuZ3RoO1xuICAgIH1cblxuICAgIC8qKiBJTklUSUFMSVpFIFRIRSBCVUZGRVIgKi9cblxuICAgIHZhciBidWZmZXIgPSBuZXcgQXJyYXlCdWZmZXIodG90YWxMZW5ndGgpLFxuICAgICAgICBhcnJheSA9IG5ldyBVaW50OEFycmF5KGJ1ZmZlcik7XG5cbiAgICAvKiogSEVBREVSICoqL1xuXG4gICAgYXJyYXlbMF0gPSAxO1xuICAgIGFycmF5WzFdID0gKFxuICAgICAgICBtZXNoVHlwZSA8PCA3IHxcbiAgICAgICAgaW5kaWNlc1R5cGUgPDwgNiB8XG4gICAgICAgIChiaWdFbmRpYW4gPyAxIDogMCkgPDwgNSB8XG4gICAgICAgIGF0dHJpYnV0ZUtleXMubGVuZ3RoICYgMHgxRlxuICAgICk7XG5cbiAgICBpZiAoYmlnRW5kaWFuKSB7XG4gICAgICAgIGFycmF5WzJdID0gdmFsdWVzTnVtYmVyID4+IDE2ICYgMHhGRjtcbiAgICAgICAgYXJyYXlbM10gPSB2YWx1ZXNOdW1iZXIgPj4gOCAmIDB4RkY7XG4gICAgICAgIGFycmF5WzRdID0gdmFsdWVzTnVtYmVyICYgMHhGRjtcblxuICAgICAgICBhcnJheVs1XSA9IGVsZW1lbnROdW1iZXIgPj4gMTYgJiAweEZGO1xuICAgICAgICBhcnJheVs2XSA9IGVsZW1lbnROdW1iZXIgPj4gOCAmIDB4RkY7XG4gICAgICAgIGFycmF5WzddID0gZWxlbWVudE51bWJlciAmIDB4RkY7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgYXJyYXlbMl0gPSB2YWx1ZXNOdW1iZXIgJiAweEZGO1xuICAgICAgICBhcnJheVszXSA9IHZhbHVlc051bWJlciA+PiA4ICYgMHhGRjtcbiAgICAgICAgYXJyYXlbNF0gPSB2YWx1ZXNOdW1iZXIgPj4gMTYgJiAweEZGO1xuXG4gICAgICAgIGFycmF5WzVdID0gZWxlbWVudE51bWJlciAmIDB4RkY7XG4gICAgICAgIGFycmF5WzZdID0gZWxlbWVudE51bWJlciA+PiA4ICYgMHhGRjtcbiAgICAgICAgYXJyYXlbN10gPSBlbGVtZW50TnVtYmVyID4+IDE2ICYgMHhGRjtcbiAgICB9XG5cblxuICAgIHZhciBwb3MgPSA4O1xuXG4gICAgLyoqIEFUVFJJQlVURVMgKiovXG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgYXR0cmlidXRlS2V5cy5sZW5ndGg7IGkrKykge1xuICAgICAgICBhdHRyaWJ1dGVLZXkgPSBhdHRyaWJ1dGVLZXlzW2ldO1xuICAgICAgICBhdHRyaWJ1dGUgPSBhdHRyaWJ1dGVzW2F0dHJpYnV0ZUtleV07XG5cbiAgICAgICAgLyoqKiBXUklURSBBVFRSSUJVVEUgSEVBREVSICoqKi9cblxuICAgICAgICBmb3IgKGogPSAwOyBqIDwgYXR0cmlidXRlS2V5Lmxlbmd0aDsgaisrLCBwb3MrKykge1xuICAgICAgICAgICAgYXJyYXlbcG9zXSA9IChhdHRyaWJ1dGVLZXkuY2hhckNvZGVBdChqKSAmIDB4N0YpIHx8IDB4NUY7IC8vIGRlZmF1bHQgdG8gdW5kZXJzY29yZVxuICAgICAgICB9XG5cbiAgICAgICAgcG9zKys7XG5cbiAgICAgICAgYXJyYXlbcG9zXSA9IChcbiAgICAgICAgICAgIChhdHRyaWJ1dGUudHlwZSAmIDB4MDMpIDw8IDYgfFxuICAgICAgICAgICAgKChhdHRyaWJ1dGUuY2FyZGluYWxpdHkgLSAxKSAmIDB4MDMpIDw8IDQgfFxuICAgICAgICAgICAgRW5jb2RpbmdUeXBlc1thdHRyaWJ1dGUudmFsdWVzLmNvbnN0cnVjdG9yLm5hbWVdICYgMHgwRlxuICAgICAgICApO1xuXG4gICAgICAgIHBvcysrO1xuXG5cbiAgICAgICAgLy8gcGFkZGluZyB0byBuZXh0IG11bHRpcGxlIG9mIDRcbiAgICAgICAgcG9zID0gTWF0aC5jZWlsKHBvcyAvIDQpICogNDtcblxuICAgICAgICAvKioqIFdSSVRFIEFUVFJJQlVURSBWQUxVRVMgKioqL1xuXG4gICAgICAgIHZhciBhdHRyaWJ1dGVzV3JpdGVBcnJheSA9IGNvcHlUb0J1ZmZlcihhdHRyaWJ1dGUudmFsdWVzLCBidWZmZXIsIHBvcywgYXR0cmlidXRlLmNhcmRpbmFsaXR5ICogdmFsdWVzTnVtYmVyLCBiaWdFbmRpYW4pO1xuXG4gICAgICAgIHBvcyArPSBhdHRyaWJ1dGVzV3JpdGVBcnJheS5ieXRlTGVuZ3RoO1xuICAgIH1cblxuICAgIC8qKiogV1JJVEUgSU5ESUNFUyBWQUxVRVMgKioqL1xuXG4gICAgcG9zID0gTWF0aC5jZWlsKHBvcyAvIDQpICogNDtcblxuICAgIGlmIChpc1RyaWFuZ2xlTWVzaCkge1xuICAgICAgICBjb3B5VG9CdWZmZXIoaW5kaWNlcywgYnVmZmVyLCBwb3MsIGVsZW1lbnROdW1iZXIgKiAzLCBiaWdFbmRpYW4pO1xuICAgIH1cblxuICAgIHJldHVybiBidWZmZXI7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZW5jb2RlO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICAgIFBvaW50Q2xvdWQ6IDAsXG4gICAgVHJpYW5nbGVNZXNoOiAxXG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBiaWdFbmRpYW5QbGF0Zm9ybSA9IG51bGw7XG5cbi8qKlxuICogQ2hlY2sgaWYgdGhlIGVuZGlhbm5lc3Mgb2YgdGhlIHBsYXRmb3JtIGlzIGJpZy1lbmRpYW4gKG1vc3Qgc2lnbmlmaWNhbnQgYml0IGZpcnN0KVxuICogQHJldHVybnMge2Jvb2xlYW59IFRydWUgaWYgYmlnLWVuZGlhbiwgZmFsc2UgaWYgbGl0dGxlLWVuZGlhblxuICovXG5mdW5jdGlvbiBpc0JpZ0VuZGlhblBsYXRmb3JtICgpIHtcbiAgICBpZiAoYmlnRW5kaWFuUGxhdGZvcm0gPT09IG51bGwpIHtcbiAgICAgICAgdmFyIGJ1ZmZlciA9IG5ldyBBcnJheUJ1ZmZlcigyKSxcbiAgICAgICAgICAgIHVpbnQ4QXJyYXkgPSBuZXcgVWludDhBcnJheShidWZmZXIpLFxuICAgICAgICAgICAgdWludDE2QXJyYXkgPSBuZXcgVWludDE2QXJyYXkoYnVmZmVyKTtcblxuICAgICAgICB1aW50OEFycmF5WzBdID0gMHhBQTsgLy8gc2V0IGZpcnN0IGJ5dGVcbiAgICAgICAgdWludDhBcnJheVsxXSA9IDB4QkI7IC8vIHNldCBzZWNvbmQgYnl0ZVxuICAgICAgICBiaWdFbmRpYW5QbGF0Zm9ybSA9ICh1aW50MTZBcnJheVswXSA9PT0gMHhBQUJCKTtcbiAgICB9XG5cbiAgICByZXR1cm4gYmlnRW5kaWFuUGxhdGZvcm07XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaXNCaWdFbmRpYW5QbGF0Zm9ybTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgcHJ3bSA9IHJlcXVpcmUoJy4uL3Byd20vaW5kZXgnKTtcblxudmFyIFBSV01Mb2FkZXIgPSBmdW5jdGlvbiBQUldNTG9hZGVyIChtYW5hZ2VyKSB7XG4gICAgLy90aGlzLm1hbmFnZXIgPSAoIG1hbmFnZXIgIT09IHVuZGVmaW5lZCApID8gbWFuYWdlciA6IFRIUkVFLkRlZmF1bHRMb2FkaW5nTWFuYWdlcjtcbn07XG5cblBSV01Mb2FkZXIucHJvdG90eXBlID0ge1xuICAgIGNvbnN0cnVjdG9yOiBQUldNTG9hZGVyLFxuICAgIGxvYWQ6IGZ1bmN0aW9uICggdXJsLCBvbkxvYWQsIG9uUHJvZ3Jlc3MsIG9uRXJyb3IgKSB7XG4gICAgICAgIHZhciB4aHIgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcbiAgICAgICAgeGhyLm9wZW4oXCJHRVRcIiwgdXJsLCB0cnVlKTtcbiAgICAgICAgeGhyLnJlc3BvbnNlVHlwZSA9ICdhcnJheWJ1ZmZlcic7XG5cblxuICAgICAgICAvKlxuICAgICAgICB2YXIgbG9hZGVyID0gbmV3IFRIUkVFLkZpbGVMb2FkZXIoIHRoaXMubWFuYWdlciApO1xuICAgICAgICBsb2FkZXIuc2V0UmVzcG9uc2VUeXBlKCAnYXJyYXlidWZmZXInICk7XG4gICAgICAgIGxvYWRlci5sb2FkKCB1cmwsIGZ1bmN0aW9uICggYnVmZmVyICkge1xuXG4gICAgICAgIH0pO1xuICAgICAgICAqL1xuXG4gICAgICAgIHhoci5vbmxvYWQgPSBmdW5jdGlvbiAoZSkge1xuICAgICAgICAgICAgaWYgKHRoaXMucmVhZHlTdGF0ZSA9PT0gNCkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUudGltZSgnUFJXTUxvYWRlcicpO1xuICAgICAgICAgICAgICAgIHZhciBkYXRhID0gcHJ3bS5kZWNvZGVQcndtKHRoaXMucmVzcG9uc2UpLFxuICAgICAgICAgICAgICAgICAgICBhdHRyaWJ1dGVzS2V5ID0gT2JqZWN0LmtleXMoZGF0YS5hdHRyaWJ1dGVzKSxcbiAgICAgICAgICAgICAgICAgICAgYnVmZmVyR2VvbWV0cnkgPSBuZXcgVEhSRUUuQnVmZmVyR2VvbWV0cnkoKSxcbiAgICAgICAgICAgICAgICAgICAgYXR0cmlidXRlLFxuICAgICAgICAgICAgICAgICAgICBpO1xuXG4gICAgICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IGF0dHJpYnV0ZXNLZXkubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgYXR0cmlidXRlID0gZGF0YS5hdHRyaWJ1dGVzW2F0dHJpYnV0ZXNLZXlbaV1dO1xuICAgICAgICAgICAgICAgICAgICBidWZmZXJHZW9tZXRyeS5hZGRBdHRyaWJ1dGUoYXR0cmlidXRlc0tleVtpXSwgbmV3IFRIUkVFLkJ1ZmZlckF0dHJpYnV0ZShhdHRyaWJ1dGUudmFsdWVzLCBhdHRyaWJ1dGUuY2FyZGluYWxpdHkpKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBidWZmZXJHZW9tZXRyeS5zZXRJbmRleChuZXcgVEhSRUUuQnVmZmVyQXR0cmlidXRlKGRhdGEuaW5kaWNlcywgMSkpO1xuICAgICAgICAgICAgICAgIGNvbnNvbGUudGltZUVuZCgnUFJXTUxvYWRlcicpO1xuXG4gICAgICAgICAgICAgICAgb25Mb2FkKGJ1ZmZlckdlb21ldHJ5KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICB4aHIuc2VuZChudWxsKTtcbiAgICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IFBSV01Mb2FkZXI7XG4iXX0=
