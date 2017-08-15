!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.PRWMLoader=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";

var prwm = require('prwm');

"use strict";

/**
 * Instantiate a loader for PRWM files
 * @param {object} picoGL PicoGL namespace
 * @param {object} app PicoGL App instance
 * @constructor
 */
var PRWMLoader = function PRWMLoader (picoGL, app) {
    this.picoGL = picoGL;
    this.app = app;
    this.verbose = false;
};

PRWMLoader.prototype.picoGL = null;
PRWMLoader.prototype.app = null;
PRWMLoader.prototype.verbose = null;

/**
 * Set the verbosity of the loader.
 * @param {bool} [verbose=false] Whether the loader should be verbose (true) or silent (false).
 * @returns {PRWMLoader} Instance of the PRWMLoader for method chaining
 */
PRWMLoader.prototype.setVerbosity = function (verbose) {
    this.verbose = !!verbose;
    return this;
};

/**
 * Parse a PRWM file passed as an ArrayBuffer and directly return an instance of PicoGL's VertexArray
 * @param {ArrayBuffer} arrayBuffer ArrayBuffer containing the PRWM data
 * @param {object} attributeMapping Literal object with attribute name => attribute index mapping
 * @returns {object} Instance of PicoGL's VertexArray
 */
PRWMLoader.prototype.parse = function (arrayBuffer, attributeMapping) {
    var attributeKeys = Object.keys(attributeMapping),
        decodeStart = performance.now(),
        data = prwm.decode(arrayBuffer),
        timeToDecode = (performance.now() - decodeStart).toFixed(3);

    if (this.verbose) {
        // console.log(data);
        console.log('Model decoded in ' + timeToDecode + 'ms');
        console.log('Model file size: ' + (arrayBuffer.byteLength / 1024).toFixed(2) + 'kB');
        console.log('Model type: ' + (data.indices ? 'indexed geometry' : 'non-indexed geometry'));
        console.log('# of vertices: ' + data.attributes.position.values.length / data.attributes.position.cardinality);
        console.log('# of polygons: ' + (data.indices ? data.indices.length / 3 : data.attributes.position.values.length / data.attributes.position.cardinality / 3));
    }

    var vertexArray = this.app.createVertexArray(),
        attributeName,
        attributeType,
        attributeCardinality,
        i;

    for (i = 0; i < attributeKeys.length; i++) {
        attributeName = attributeKeys[i];
        attributeType = data.attributes[attributeName].type === prwm.Int ? this.picoGL.INT : this.picoGL.FLOAT;
        attributeCardinality = data.attributes[attributeName].cardinality;

        vertexArray.attributeBuffer(
            attributeMapping[attributeName],
            this.app.createVertexBuffer(attributeType, attributeCardinality, data.attributes[attributeName].values)
        );
    }

    if (data.indices !== null) {
        attributeType = data.indices.BYTES_PER_ELEMENT === 2 ? this.picoGL.UNSIGNED_SHORT : this.picoGL.UNSIGNED_INT;
        vertexArray.indexBuffer(this.app.createIndexBuffer(attributeType, 3, data.indices));
    }

    return vertexArray;
};

/**
 * Parse a remote PRWM file and return an instance of PicoGL's VertexArray (through a callback)
 * @param {string} url Url of the PRWM file
 * @param {object} attributeMapping Literal object with attribute name => attribute index mapping
 * @param {function} onSuccess Callback called with the VertexArray on success
 */
PRWMLoader.prototype.load = function (url, attributeMapping, onSuccess) {
    var self = this,
        xhr = new XMLHttpRequest();

    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function () {
        if (self.verbose) {
            console.log('--- ' + url);
        }

        onSuccess(self.parse(this.response, attributeMapping));
    };

    xhr.send(null);
};

/**
 * Check if the endianness of the platform is big-endian (most significant bit first)
 * @returns {boolean} True if big-endian, false if little-endian
 */
PRWMLoader.isBigEndianPlatform = function () {
    return prwm.isBigEndianPlatform();
};

module.exports = PRWMLoader;

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

    /** PRELIMINARY CHECKS **/

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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uL3Vzci9sb2NhbC9saWIvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsImluZGV4LmpzIiwibm9kZV9tb2R1bGVzL3Byd20vaW5kZXguanMiLCJub2RlX21vZHVsZXMvcHJ3bS9wcndtL2F0dHJpYnV0ZS10eXBlcy5qcyIsIm5vZGVfbW9kdWxlcy9wcndtL3Byd20vZGVjb2RlLmpzIiwibm9kZV9tb2R1bGVzL3Byd20vcHJ3bS9lbmNvZGUuanMiLCJub2RlX21vZHVsZXMvcHJ3bS91dGlscy9pcy1iaWctZW5kaWFuLXBsYXRmb3JtLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNaQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaktBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBwcndtID0gcmVxdWlyZSgncHJ3bScpO1xuXG5cInVzZSBzdHJpY3RcIjtcblxuLyoqXG4gKiBJbnN0YW50aWF0ZSBhIGxvYWRlciBmb3IgUFJXTSBmaWxlc1xuICogQHBhcmFtIHtvYmplY3R9IHBpY29HTCBQaWNvR0wgbmFtZXNwYWNlXG4gKiBAcGFyYW0ge29iamVjdH0gYXBwIFBpY29HTCBBcHAgaW5zdGFuY2VcbiAqIEBjb25zdHJ1Y3RvclxuICovXG52YXIgUFJXTUxvYWRlciA9IGZ1bmN0aW9uIFBSV01Mb2FkZXIgKHBpY29HTCwgYXBwKSB7XG4gICAgdGhpcy5waWNvR0wgPSBwaWNvR0w7XG4gICAgdGhpcy5hcHAgPSBhcHA7XG4gICAgdGhpcy52ZXJib3NlID0gZmFsc2U7XG59O1xuXG5QUldNTG9hZGVyLnByb3RvdHlwZS5waWNvR0wgPSBudWxsO1xuUFJXTUxvYWRlci5wcm90b3R5cGUuYXBwID0gbnVsbDtcblBSV01Mb2FkZXIucHJvdG90eXBlLnZlcmJvc2UgPSBudWxsO1xuXG4vKipcbiAqIFNldCB0aGUgdmVyYm9zaXR5IG9mIHRoZSBsb2FkZXIuXG4gKiBAcGFyYW0ge2Jvb2x9IFt2ZXJib3NlPWZhbHNlXSBXaGV0aGVyIHRoZSBsb2FkZXIgc2hvdWxkIGJlIHZlcmJvc2UgKHRydWUpIG9yIHNpbGVudCAoZmFsc2UpLlxuICogQHJldHVybnMge1BSV01Mb2FkZXJ9IEluc3RhbmNlIG9mIHRoZSBQUldNTG9hZGVyIGZvciBtZXRob2QgY2hhaW5pbmdcbiAqL1xuUFJXTUxvYWRlci5wcm90b3R5cGUuc2V0VmVyYm9zaXR5ID0gZnVuY3Rpb24gKHZlcmJvc2UpIHtcbiAgICB0aGlzLnZlcmJvc2UgPSAhIXZlcmJvc2U7XG4gICAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFBhcnNlIGEgUFJXTSBmaWxlIHBhc3NlZCBhcyBhbiBBcnJheUJ1ZmZlciBhbmQgZGlyZWN0bHkgcmV0dXJuIGFuIGluc3RhbmNlIG9mIFBpY29HTCdzIFZlcnRleEFycmF5XG4gKiBAcGFyYW0ge0FycmF5QnVmZmVyfSBhcnJheUJ1ZmZlciBBcnJheUJ1ZmZlciBjb250YWluaW5nIHRoZSBQUldNIGRhdGFcbiAqIEBwYXJhbSB7b2JqZWN0fSBhdHRyaWJ1dGVNYXBwaW5nIExpdGVyYWwgb2JqZWN0IHdpdGggYXR0cmlidXRlIG5hbWUgPT4gYXR0cmlidXRlIGluZGV4IG1hcHBpbmdcbiAqIEByZXR1cm5zIHtvYmplY3R9IEluc3RhbmNlIG9mIFBpY29HTCdzIFZlcnRleEFycmF5XG4gKi9cblBSV01Mb2FkZXIucHJvdG90eXBlLnBhcnNlID0gZnVuY3Rpb24gKGFycmF5QnVmZmVyLCBhdHRyaWJ1dGVNYXBwaW5nKSB7XG4gICAgdmFyIGF0dHJpYnV0ZUtleXMgPSBPYmplY3Qua2V5cyhhdHRyaWJ1dGVNYXBwaW5nKSxcbiAgICAgICAgZGVjb2RlU3RhcnQgPSBwZXJmb3JtYW5jZS5ub3coKSxcbiAgICAgICAgZGF0YSA9IHByd20uZGVjb2RlKGFycmF5QnVmZmVyKSxcbiAgICAgICAgdGltZVRvRGVjb2RlID0gKHBlcmZvcm1hbmNlLm5vdygpIC0gZGVjb2RlU3RhcnQpLnRvRml4ZWQoMyk7XG5cbiAgICBpZiAodGhpcy52ZXJib3NlKSB7XG4gICAgICAgIC8vIGNvbnNvbGUubG9nKGRhdGEpO1xuICAgICAgICBjb25zb2xlLmxvZygnTW9kZWwgZGVjb2RlZCBpbiAnICsgdGltZVRvRGVjb2RlICsgJ21zJyk7XG4gICAgICAgIGNvbnNvbGUubG9nKCdNb2RlbCBmaWxlIHNpemU6ICcgKyAoYXJyYXlCdWZmZXIuYnl0ZUxlbmd0aCAvIDEwMjQpLnRvRml4ZWQoMikgKyAna0InKTtcbiAgICAgICAgY29uc29sZS5sb2coJ01vZGVsIHR5cGU6ICcgKyAoZGF0YS5pbmRpY2VzID8gJ2luZGV4ZWQgZ2VvbWV0cnknIDogJ25vbi1pbmRleGVkIGdlb21ldHJ5JykpO1xuICAgICAgICBjb25zb2xlLmxvZygnIyBvZiB2ZXJ0aWNlczogJyArIGRhdGEuYXR0cmlidXRlcy5wb3NpdGlvbi52YWx1ZXMubGVuZ3RoIC8gZGF0YS5hdHRyaWJ1dGVzLnBvc2l0aW9uLmNhcmRpbmFsaXR5KTtcbiAgICAgICAgY29uc29sZS5sb2coJyMgb2YgcG9seWdvbnM6ICcgKyAoZGF0YS5pbmRpY2VzID8gZGF0YS5pbmRpY2VzLmxlbmd0aCAvIDMgOiBkYXRhLmF0dHJpYnV0ZXMucG9zaXRpb24udmFsdWVzLmxlbmd0aCAvIGRhdGEuYXR0cmlidXRlcy5wb3NpdGlvbi5jYXJkaW5hbGl0eSAvIDMpKTtcbiAgICB9XG5cbiAgICB2YXIgdmVydGV4QXJyYXkgPSB0aGlzLmFwcC5jcmVhdGVWZXJ0ZXhBcnJheSgpLFxuICAgICAgICBhdHRyaWJ1dGVOYW1lLFxuICAgICAgICBhdHRyaWJ1dGVUeXBlLFxuICAgICAgICBhdHRyaWJ1dGVDYXJkaW5hbGl0eSxcbiAgICAgICAgaTtcblxuICAgIGZvciAoaSA9IDA7IGkgPCBhdHRyaWJ1dGVLZXlzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGF0dHJpYnV0ZU5hbWUgPSBhdHRyaWJ1dGVLZXlzW2ldO1xuICAgICAgICBhdHRyaWJ1dGVUeXBlID0gZGF0YS5hdHRyaWJ1dGVzW2F0dHJpYnV0ZU5hbWVdLnR5cGUgPT09IHByd20uSW50ID8gdGhpcy5waWNvR0wuSU5UIDogdGhpcy5waWNvR0wuRkxPQVQ7XG4gICAgICAgIGF0dHJpYnV0ZUNhcmRpbmFsaXR5ID0gZGF0YS5hdHRyaWJ1dGVzW2F0dHJpYnV0ZU5hbWVdLmNhcmRpbmFsaXR5O1xuXG4gICAgICAgIHZlcnRleEFycmF5LmF0dHJpYnV0ZUJ1ZmZlcihcbiAgICAgICAgICAgIGF0dHJpYnV0ZU1hcHBpbmdbYXR0cmlidXRlTmFtZV0sXG4gICAgICAgICAgICB0aGlzLmFwcC5jcmVhdGVWZXJ0ZXhCdWZmZXIoYXR0cmlidXRlVHlwZSwgYXR0cmlidXRlQ2FyZGluYWxpdHksIGRhdGEuYXR0cmlidXRlc1thdHRyaWJ1dGVOYW1lXS52YWx1ZXMpXG4gICAgICAgICk7XG4gICAgfVxuXG4gICAgaWYgKGRhdGEuaW5kaWNlcyAhPT0gbnVsbCkge1xuICAgICAgICBhdHRyaWJ1dGVUeXBlID0gZGF0YS5pbmRpY2VzLkJZVEVTX1BFUl9FTEVNRU5UID09PSAyID8gdGhpcy5waWNvR0wuVU5TSUdORURfU0hPUlQgOiB0aGlzLnBpY29HTC5VTlNJR05FRF9JTlQ7XG4gICAgICAgIHZlcnRleEFycmF5LmluZGV4QnVmZmVyKHRoaXMuYXBwLmNyZWF0ZUluZGV4QnVmZmVyKGF0dHJpYnV0ZVR5cGUsIDMsIGRhdGEuaW5kaWNlcykpO1xuICAgIH1cblxuICAgIHJldHVybiB2ZXJ0ZXhBcnJheTtcbn07XG5cbi8qKlxuICogUGFyc2UgYSByZW1vdGUgUFJXTSBmaWxlIGFuZCByZXR1cm4gYW4gaW5zdGFuY2Ugb2YgUGljb0dMJ3MgVmVydGV4QXJyYXkgKHRocm91Z2ggYSBjYWxsYmFjaylcbiAqIEBwYXJhbSB7c3RyaW5nfSB1cmwgVXJsIG9mIHRoZSBQUldNIGZpbGVcbiAqIEBwYXJhbSB7b2JqZWN0fSBhdHRyaWJ1dGVNYXBwaW5nIExpdGVyYWwgb2JqZWN0IHdpdGggYXR0cmlidXRlIG5hbWUgPT4gYXR0cmlidXRlIGluZGV4IG1hcHBpbmdcbiAqIEBwYXJhbSB7ZnVuY3Rpb259IG9uU3VjY2VzcyBDYWxsYmFjayBjYWxsZWQgd2l0aCB0aGUgVmVydGV4QXJyYXkgb24gc3VjY2Vzc1xuICovXG5QUldNTG9hZGVyLnByb3RvdHlwZS5sb2FkID0gZnVuY3Rpb24gKHVybCwgYXR0cmlidXRlTWFwcGluZywgb25TdWNjZXNzKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzLFxuICAgICAgICB4aHIgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcblxuICAgIHhoci5vcGVuKCdHRVQnLCB1cmwsIHRydWUpO1xuICAgIHhoci5yZXNwb25zZVR5cGUgPSAnYXJyYXlidWZmZXInO1xuICAgIHhoci5vbmxvYWQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmIChzZWxmLnZlcmJvc2UpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCctLS0gJyArIHVybCk7XG4gICAgICAgIH1cblxuICAgICAgICBvblN1Y2Nlc3Moc2VsZi5wYXJzZSh0aGlzLnJlc3BvbnNlLCBhdHRyaWJ1dGVNYXBwaW5nKSk7XG4gICAgfTtcblxuICAgIHhoci5zZW5kKG51bGwpO1xufTtcblxuLyoqXG4gKiBDaGVjayBpZiB0aGUgZW5kaWFubmVzcyBvZiB0aGUgcGxhdGZvcm0gaXMgYmlnLWVuZGlhbiAobW9zdCBzaWduaWZpY2FudCBiaXQgZmlyc3QpXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gVHJ1ZSBpZiBiaWctZW5kaWFuLCBmYWxzZSBpZiBsaXR0bGUtZW5kaWFuXG4gKi9cblBSV01Mb2FkZXIuaXNCaWdFbmRpYW5QbGF0Zm9ybSA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gcHJ3bS5pc0JpZ0VuZGlhblBsYXRmb3JtKCk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IFBSV01Mb2FkZXI7XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIGF0dHJpYnV0ZVR5cGVzID0gcmVxdWlyZSgnLi9wcndtL2F0dHJpYnV0ZS10eXBlcycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICB2ZXJzaW9uOiAxLFxuICAgIEludDogYXR0cmlidXRlVHlwZXMuSW50LFxuICAgIEZsb2F0OiBhdHRyaWJ1dGVUeXBlcy5GbG9hdCxcbiAgICBpc0JpZ0VuZGlhblBsYXRmb3JtOiByZXF1aXJlKCcuL3V0aWxzL2lzLWJpZy1lbmRpYW4tcGxhdGZvcm0nKSxcbiAgICBlbmNvZGU6IHJlcXVpcmUoJy4vcHJ3bS9lbmNvZGUnKSxcbiAgICBkZWNvZGU6IHJlcXVpcmUoJy4vcHJ3bS9kZWNvZGUnKVxufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBGbG9hdDogMCxcbiAgICBJbnQ6IDFcbn07XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIGlzQmlnRW5kaWFuUGxhdGZvcm0gPSByZXF1aXJlKCcuLi91dGlscy9pcy1iaWctZW5kaWFuLXBsYXRmb3JtJyk7XG5cbi8vIG1hdGNoIHRoZSB2YWx1ZXMgZGVmaW5lZCBpbiB0aGUgc3BlYyB0byB0aGUgVHlwZWRBcnJheSB0eXBlc1xudmFyIEludmVydGVkRW5jb2RpbmdUeXBlcyA9IFtcbiAgICBudWxsLFxuICAgIEZsb2F0MzJBcnJheSxcbiAgICBudWxsLFxuICAgIEludDhBcnJheSxcbiAgICBJbnQxNkFycmF5LFxuICAgIG51bGwsXG4gICAgSW50MzJBcnJheSxcbiAgICBVaW50OEFycmF5LFxuICAgIFVpbnQxNkFycmF5LFxuICAgIG51bGwsXG4gICAgVWludDMyQXJyYXlcbl07XG5cbi8vIGRlZmluZSB0aGUgbWV0aG9kIHRvIHVzZSBvbiBhIERhdGFWaWV3LCBjb3JyZXNwb25kaW5nIHRoZSBUeXBlZEFycmF5IHR5cGVcbnZhciBnZXRNZXRob2RzID0ge1xuICAgIFVpbnQxNkFycmF5OiAnZ2V0VWludDE2JyxcbiAgICBVaW50MzJBcnJheTogJ2dldFVpbnQzMicsXG4gICAgSW50MTZBcnJheTogJ2dldEludDE2JyxcbiAgICBJbnQzMkFycmF5OiAnZ2V0SW50MzInLFxuICAgIEZsb2F0MzJBcnJheTogJ2dldEZsb2F0MzInXG59O1xuXG5mdW5jdGlvbiBjb3B5RnJvbUJ1ZmZlciAoc291cmNlQXJyYXlCdWZmZXIsIHZpZXdUeXBlLCBwb3NpdGlvbiwgbGVuZ3RoLCBmcm9tQmlnRW5kaWFuKSB7XG4gICAgdmFyIGJ5dGVzUGVyRWxlbWVudCA9IHZpZXdUeXBlLkJZVEVTX1BFUl9FTEVNRU5ULFxuICAgICAgICByZXN1bHQ7XG5cbiAgICBpZiAoZnJvbUJpZ0VuZGlhbiA9PT0gaXNCaWdFbmRpYW5QbGF0Zm9ybSgpIHx8IGJ5dGVzUGVyRWxlbWVudCA9PT0gMSkge1xuICAgICAgICByZXN1bHQgPSBuZXcgdmlld1R5cGUoc291cmNlQXJyYXlCdWZmZXIsIHBvc2l0aW9uLCBsZW5ndGgpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciByZWFkVmlldyA9IG5ldyBEYXRhVmlldyhzb3VyY2VBcnJheUJ1ZmZlciwgcG9zaXRpb24sIGxlbmd0aCAqIGJ5dGVzUGVyRWxlbWVudCksXG4gICAgICAgICAgICBnZXRNZXRob2QgPSBnZXRNZXRob2RzW3ZpZXdUeXBlLm5hbWVdLFxuICAgICAgICAgICAgbGl0dGxlRW5kaWFuID0gIWZyb21CaWdFbmRpYW47XG5cbiAgICAgICAgcmVzdWx0ID0gbmV3IHZpZXdUeXBlKGxlbmd0aCk7XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgcmVzdWx0W2ldID0gcmVhZFZpZXdbZ2V0TWV0aG9kXShpICogYnl0ZXNQZXJFbGVtZW50LCBsaXR0bGVFbmRpYW4pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gZGVjb2RlIChidWZmZXIpIHtcbiAgICB2YXIgYXJyYXkgPSBuZXcgVWludDhBcnJheShidWZmZXIpLFxuICAgICAgICB2ZXJzaW9uID0gYXJyYXlbMF0sXG4gICAgICAgIGZsYWdzID0gYXJyYXlbMV0sXG4gICAgICAgIGluZGV4ZWRHZW9tZXRyeSA9ICEhKGZsYWdzID4+IDcpLFxuICAgICAgICBpbmRpY2VzVHlwZSA9IGZsYWdzID4+IDYgJiAweDAxLFxuICAgICAgICBiaWdFbmRpYW4gPSAoZmxhZ3MgPj4gNSAmIDB4MDEpID09PSAxLFxuICAgICAgICBhdHRyaWJ1dGVzTnVtYmVyID0gZmxhZ3MgJiAweDFGLFxuICAgICAgICB2YWx1ZXNOdW1iZXIgPSAwLFxuICAgICAgICBpbmRpY2VzTnVtYmVyID0gMDtcblxuICAgIGlmIChiaWdFbmRpYW4pIHtcbiAgICAgICAgdmFsdWVzTnVtYmVyID0gKGFycmF5WzJdIDw8IDE2KSArIChhcnJheVszXSA8PCA4KSArIGFycmF5WzRdO1xuICAgICAgICBpbmRpY2VzTnVtYmVyID0gKGFycmF5WzVdIDw8IDE2KSArIChhcnJheVs2XSA8PCA4KSArIGFycmF5WzddO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHZhbHVlc051bWJlciA9IGFycmF5WzJdICsgKGFycmF5WzNdIDw8IDgpICsgKGFycmF5WzRdIDw8IDE2KTtcbiAgICAgICAgaW5kaWNlc051bWJlciA9IGFycmF5WzVdICsgKGFycmF5WzZdIDw8IDgpICsgKGFycmF5WzddIDw8IDE2KTtcbiAgICB9XG5cbiAgICAvKiogUFJFTElNSU5BUlkgQ0hFQ0tTICoqL1xuXG4gICAgaWYgKHZlcnNpb24gPT09IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdQUldNIGRlY29kZXI6IEludmFsaWQgZm9ybWF0IHZlcnNpb246IDAnKTtcbiAgICB9IGVsc2UgaWYgKHZlcnNpb24gIT09IDEpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdQUldNIGRlY29kZXI6IFVuc3VwcG9ydGVkIGZvcm1hdCB2ZXJzaW9uOiAnICsgdmVyc2lvbik7XG4gICAgfVxuXG4gICAgaWYgKCFpbmRleGVkR2VvbWV0cnkpIHtcbiAgICAgICAgaWYgKGluZGljZXNUeXBlICE9PSAwKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BSV00gZGVjb2RlcjogSW5kaWNlcyB0eXBlIG11c3QgYmUgc2V0IHRvIDAgZm9yIG5vbi1pbmRleGVkIGdlb21ldHJpZXMnKTtcbiAgICAgICAgfSBlbHNlIGlmIChpbmRpY2VzTnVtYmVyICE9PSAwKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BSV00gZGVjb2RlcjogTnVtYmVyIG9mIGluZGljZXMgbXVzdCBiZSBzZXQgdG8gMCBmb3Igbm9uLWluZGV4ZWQgZ2VvbWV0cmllcycpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqIFBBUlNJTkcgKiovXG5cbiAgICB2YXIgcG9zID0gODtcblxuICAgIHZhciBhdHRyaWJ1dGVzID0ge30sXG4gICAgICAgIGF0dHJpYnV0ZU5hbWUsXG4gICAgICAgIGNoYXIsXG4gICAgICAgIGF0dHJpYnV0ZU5vcm1hbGl6ZWQsXG4gICAgICAgIGF0dHJpYnV0ZVR5cGUsXG4gICAgICAgIGNhcmRpbmFsaXR5LFxuICAgICAgICBlbmNvZGluZ1R5cGUsXG4gICAgICAgIGFycmF5VHlwZSxcbiAgICAgICAgdmFsdWVzLFxuICAgICAgICBpO1xuXG4gICAgZm9yIChpID0gMDsgaSA8IGF0dHJpYnV0ZXNOdW1iZXI7IGkrKykge1xuICAgICAgICBhdHRyaWJ1dGVOYW1lID0gJyc7XG5cbiAgICAgICAgd2hpbGUgKHBvcyA8IGFycmF5Lmxlbmd0aCkge1xuICAgICAgICAgICAgY2hhciA9IGFycmF5W3Bvc107XG4gICAgICAgICAgICBwb3MrKztcblxuICAgICAgICAgICAgaWYgKGNoYXIgPT09IDApIHtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgYXR0cmlidXRlTmFtZSArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGNoYXIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgZmxhZ3MgPSBhcnJheVtwb3NdO1xuXG4gICAgICAgIGF0dHJpYnV0ZVR5cGUgPSBmbGFncyA+PiA3ICYgMHgwMTtcbiAgICAgICAgYXR0cmlidXRlTm9ybWFsaXplZCA9ICEhKGZsYWdzID4+IDYgJiAweDAxKTtcbiAgICAgICAgY2FyZGluYWxpdHkgPSAoZmxhZ3MgPj4gNCAmIDB4MDMpICsgMTtcbiAgICAgICAgZW5jb2RpbmdUeXBlID0gZmxhZ3MgJiAweDBGO1xuICAgICAgICBhcnJheVR5cGUgPSBJbnZlcnRlZEVuY29kaW5nVHlwZXNbZW5jb2RpbmdUeXBlXTtcblxuICAgICAgICBwb3MrKztcblxuICAgICAgICAvLyBwYWRkaW5nIHRvIG5leHQgbXVsdGlwbGUgb2YgNFxuICAgICAgICBwb3MgPSBNYXRoLmNlaWwocG9zIC8gNCkgKiA0O1xuXG4gICAgICAgIHZhbHVlcyA9IGNvcHlGcm9tQnVmZmVyKGJ1ZmZlciwgYXJyYXlUeXBlLCBwb3MsIGNhcmRpbmFsaXR5ICogdmFsdWVzTnVtYmVyLCBiaWdFbmRpYW4pO1xuXG4gICAgICAgIHBvcys9IGFycmF5VHlwZS5CWVRFU19QRVJfRUxFTUVOVCAqIGNhcmRpbmFsaXR5ICogdmFsdWVzTnVtYmVyO1xuXG4gICAgICAgIGF0dHJpYnV0ZXNbYXR0cmlidXRlTmFtZV0gPSB7XG4gICAgICAgICAgICB0eXBlOiBhdHRyaWJ1dGVUeXBlLFxuICAgICAgICAgICAgbm9ybWFsaXplZDogYXR0cmlidXRlTm9ybWFsaXplZCxcbiAgICAgICAgICAgIGNhcmRpbmFsaXR5OiBjYXJkaW5hbGl0eSxcbiAgICAgICAgICAgIHZhbHVlczogdmFsdWVzXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcG9zID0gTWF0aC5jZWlsKHBvcyAvIDQpICogNDtcblxuICAgIHZhciBpbmRpY2VzID0gbnVsbDtcblxuICAgIGlmIChpbmRleGVkR2VvbWV0cnkpIHtcbiAgICAgICAgaW5kaWNlcyA9IGNvcHlGcm9tQnVmZmVyKFxuICAgICAgICAgICAgYnVmZmVyLFxuICAgICAgICAgICAgaW5kaWNlc1R5cGUgPT09IDEgPyBVaW50MzJBcnJheSA6IFVpbnQxNkFycmF5LFxuICAgICAgICAgICAgcG9zLFxuICAgICAgICAgICAgaW5kaWNlc051bWJlcixcbiAgICAgICAgICAgIGJpZ0VuZGlhblxuICAgICAgICApO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICAgIHZlcnNpb246IHZlcnNpb24sXG4gICAgICAgIGJpZ0VuZGlhbjogYmlnRW5kaWFuLFxuICAgICAgICBhdHRyaWJ1dGVzOiBhdHRyaWJ1dGVzLFxuICAgICAgICBpbmRpY2VzOiBpbmRpY2VzXG4gICAgfTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBkZWNvZGU7XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIGlzQmlnRW5kaWFuUGxhdGZvcm0gPSByZXF1aXJlKCcuLi91dGlscy9pcy1iaWctZW5kaWFuLXBsYXRmb3JtJyksXG4gICAgYXR0cmlidXRlVHlwZXMgPSByZXF1aXJlKCcuL2F0dHJpYnV0ZS10eXBlcycpO1xuXG4vLyBtYXRjaCB0aGUgVHlwZWRBcnJheSB0eXBlIHdpdGggdGhlIHZhbHVlIGRlZmluZWQgaW4gdGhlIHNwZWNcbnZhciBFbmNvZGluZ1R5cGVzID0ge1xuICAgIEZsb2F0MzJBcnJheTogMSxcbiAgICBJbnQ4QXJyYXk6IDMsXG4gICAgSW50MTZBcnJheTogNCxcbiAgICBJbnQzMkFycmF5OiA2LFxuICAgIFVpbnQ4QXJyYXk6IDcsXG4gICAgVWludDE2QXJyYXk6IDgsXG4gICAgVWludDMyQXJyYXk6IDEwXG59O1xuXG4vLyBkZWZpbmUgdGhlIG1ldGhvZCB0byB1c2Ugb24gYSBEYXRhVmlldywgY29ycmVzcG9uZGluZyB0aGUgVHlwZWRBcnJheSB0eXBlXG52YXIgc2V0TWV0aG9kcyA9IHtcbiAgICBVaW50MTZBcnJheTogJ3NldFVpbnQxNicsXG4gICAgVWludDMyQXJyYXk6ICdzZXRVaW50MzInLFxuICAgIEludDE2QXJyYXk6ICdzZXRJbnQxNicsXG4gICAgSW50MzJBcnJheTogJ3NldEludDMyJyxcbiAgICBGbG9hdDMyQXJyYXk6ICdzZXRGbG9hdDMyJ1xufTtcblxuZnVuY3Rpb24gY29weVRvQnVmZmVyIChzb3VyY2VUeXBlZEFycmF5LCBkZXN0aW5hdGlvbkFycmF5QnVmZmVyLCBwb3NpdGlvbiwgYmlnRW5kaWFuKSB7XG4gICAgdmFyIGxlbmd0aCA9IHNvdXJjZVR5cGVkQXJyYXkubGVuZ3RoLFxuICAgICAgICBieXRlc1BlckVsZW1lbnQgPSBzb3VyY2VUeXBlZEFycmF5LkJZVEVTX1BFUl9FTEVNRU5UO1xuXG4gICAgdmFyIHdyaXRlQXJyYXkgPSBuZXcgc291cmNlVHlwZWRBcnJheS5jb25zdHJ1Y3RvcihkZXN0aW5hdGlvbkFycmF5QnVmZmVyLCBwb3NpdGlvbiwgbGVuZ3RoKTtcblxuICAgIGlmIChiaWdFbmRpYW4gPT09IGlzQmlnRW5kaWFuUGxhdGZvcm0oKSB8fCBieXRlc1BlckVsZW1lbnQgPT09IDEpIHtcbiAgICAgICAgLy8gZGVzaXJlZCBlbmRpYW5uZXNzIGlzIHRoZSBzYW1lIGFzIHRoZSBwbGF0Zm9ybSwgb3IgdGhlIGVuZGlhbm5lc3MgZG9lc24ndCBtYXR0ZXIgKDEgYnl0ZSlcbiAgICAgICAgd3JpdGVBcnJheS5zZXQoc291cmNlVHlwZWRBcnJheS5zdWJhcnJheSgwLCBsZW5ndGgpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgd3JpdGVWaWV3ID0gbmV3IERhdGFWaWV3KGRlc3RpbmF0aW9uQXJyYXlCdWZmZXIsIHBvc2l0aW9uLCBsZW5ndGggKiBieXRlc1BlckVsZW1lbnQpLFxuICAgICAgICAgICAgc2V0TWV0aG9kID0gc2V0TWV0aG9kc1tzb3VyY2VUeXBlZEFycmF5LmNvbnN0cnVjdG9yLm5hbWVdLFxuICAgICAgICAgICAgbGl0dGxlRW5kaWFuID0gIWJpZ0VuZGlhbixcbiAgICAgICAgICAgIGkgPSAwO1xuXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgd3JpdGVWaWV3W3NldE1ldGhvZF0oaSAqIGJ5dGVzUGVyRWxlbWVudCwgc291cmNlVHlwZWRBcnJheVtpXSwgbGl0dGxlRW5kaWFuKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB3cml0ZUFycmF5O1xufVxuXG5mdW5jdGlvbiBlbmNvZGUgKGF0dHJpYnV0ZXMsIGluZGljZXMsIGJpZ0VuZGlhbikge1xuICAgIHZhciBhdHRyaWJ1dGVLZXlzID0gYXR0cmlidXRlcyA/IE9iamVjdC5rZXlzKGF0dHJpYnV0ZXMpIDogW10sXG4gICAgICAgIGluZGV4ZWRHZW9tZXRyeSA9ICEhaW5kaWNlcyxcbiAgICAgICAgaSwgajtcblxuICAgIC8qKiBQUkVMSU1JTkFSWSBDSEVDS1MgKiovXG5cbiAgICAvLyB0aGlzIGlzIG5vdCBzdXBwb3NlZCB0byBjYXRjaCBhbGwgdGhlIHBvc3NpYmxlIGVycm9ycywgb25seSBzb21lIG9mIHRoZSBnb3RjaGFzXG5cbiAgICBpZiAoYXR0cmlidXRlS2V5cy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdQUldNIGVuY29kZXI6IFRoZSBtb2RlbCBtdXN0IGhhdmUgYXQgbGVhc3Qgb25lIGF0dHJpYnV0ZScpO1xuICAgIH1cblxuICAgIGlmIChhdHRyaWJ1dGVLZXlzLmxlbmd0aCA+IDMxKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignUFJXTSBlbmNvZGVyOiBUaGUgbW9kZWwgY2FuIGhhdmUgYXQgbW9zdCAzMSBhdHRyaWJ1dGVzJyk7XG4gICAgfVxuXG4gICAgZm9yIChpID0gMDsgaSA8IGF0dHJpYnV0ZUtleXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKCFFbmNvZGluZ1R5cGVzLmhhc093blByb3BlcnR5KGF0dHJpYnV0ZXNbYXR0cmlidXRlS2V5c1tpXV0udmFsdWVzLmNvbnN0cnVjdG9yLm5hbWUpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BSV00gZW5jb2RlcjogVW5zdXBwb3J0ZWQgYXR0cmlidXRlIHZhbHVlcyB0eXBlOiAnICsgYXR0cmlidXRlc1thdHRyaWJ1dGVLZXlzW2ldXS52YWx1ZXMuY29uc3RydWN0b3IubmFtZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoaW5kZXhlZEdlb21ldHJ5ICYmIGluZGljZXMuY29uc3RydWN0b3IubmFtZSAhPT0gJ1VpbnQxNkFycmF5JyAmJiBpbmRpY2VzLmNvbnN0cnVjdG9yLm5hbWUgIT09ICdVaW50MzJBcnJheScpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdQUldNIGVuY29kZXI6IFRoZSBpbmRpY2VzIG11c3QgYmUgcmVwcmVzZW50ZWQgYXMgYW4gVWludDE2QXJyYXkgb3IgYW4gVWludDMyQXJyYXknKTtcbiAgICB9XG5cbiAgICAvKiogR0VUIFRIRSBUWVBFIE9GIElORElDRVMgQVMgV0VMTCBBUyBUSEUgTlVNQkVSIE9GIElORElDRVMgQU5EIEFUVFJJQlVURSBWQUxVRVMgKiovXG5cbiAgICB2YXIgdmFsdWVzTnVtYmVyID0gYXR0cmlidXRlc1thdHRyaWJ1dGVLZXlzWzBdXS52YWx1ZXMubGVuZ3RoIC8gYXR0cmlidXRlc1thdHRyaWJ1dGVLZXlzWzBdXS5jYXJkaW5hbGl0eSB8IDAsXG4gICAgICAgIGluZGljZXNOdW1iZXIgPSBpbmRleGVkR2VvbWV0cnkgPyBpbmRpY2VzLmxlbmd0aCA6IDAsXG4gICAgICAgIGluZGljZXNUeXBlID0gaW5kZXhlZEdlb21ldHJ5ICYmIGluZGljZXMuY29uc3RydWN0b3IubmFtZSA9PT0gJ1VpbnQzMkFycmF5JyA/IDEgOiAwO1xuXG4gICAgLyoqIEdFVCBUSEUgRklMRSBMRU5HVEggKiovXG5cbiAgICB2YXIgdG90YWxMZW5ndGggPSA4LFxuICAgICAgICBhdHRyaWJ1dGVLZXksXG4gICAgICAgIGF0dHJpYnV0ZSxcbiAgICAgICAgYXR0cmlidXRlVHlwZSxcbiAgICAgICAgYXR0cmlidXRlTm9ybWFsaXplZDtcblxuICAgIGZvciAoaSA9IDA7IGkgPCBhdHRyaWJ1dGVLZXlzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGF0dHJpYnV0ZUtleSA9IGF0dHJpYnV0ZUtleXNbaV07XG4gICAgICAgIGF0dHJpYnV0ZSA9IGF0dHJpYnV0ZXNbYXR0cmlidXRlS2V5XTtcbiAgICAgICAgdG90YWxMZW5ndGggKz0gYXR0cmlidXRlS2V5Lmxlbmd0aCArIDI7IC8vIE5VTCBieXRlICsgZmxhZyBieXRlICsgcGFkZGluZ1xuICAgICAgICB0b3RhbExlbmd0aCA9IE1hdGguY2VpbCh0b3RhbExlbmd0aCAvIDQpICogNDsgLy8gcGFkZGluZ1xuICAgICAgICB0b3RhbExlbmd0aCArPSBhdHRyaWJ1dGUudmFsdWVzLmJ5dGVMZW5ndGg7XG4gICAgfVxuXG4gICAgaWYgKGluZGV4ZWRHZW9tZXRyeSkge1xuICAgICAgICB0b3RhbExlbmd0aCA9IE1hdGguY2VpbCh0b3RhbExlbmd0aCAvIDQpICogNDtcbiAgICAgICAgdG90YWxMZW5ndGggKz0gaW5kaWNlcy5ieXRlTGVuZ3RoO1xuICAgIH1cblxuICAgIC8qKiBJTklUSUFMSVpFIFRIRSBCVUZGRVIgKi9cblxuICAgIHZhciBidWZmZXIgPSBuZXcgQXJyYXlCdWZmZXIodG90YWxMZW5ndGgpLFxuICAgICAgICBhcnJheSA9IG5ldyBVaW50OEFycmF5KGJ1ZmZlcik7XG5cbiAgICAvKiogSEVBREVSICoqL1xuXG4gICAgYXJyYXlbMF0gPSAxO1xuICAgIGFycmF5WzFdID0gKFxuICAgICAgICBpbmRleGVkR2VvbWV0cnkgPDwgNyB8XG4gICAgICAgIGluZGljZXNUeXBlIDw8IDYgfFxuICAgICAgICAoYmlnRW5kaWFuID8gMSA6IDApIDw8IDUgfFxuICAgICAgICBhdHRyaWJ1dGVLZXlzLmxlbmd0aCAmIDB4MUZcbiAgICApO1xuXG4gICAgaWYgKGJpZ0VuZGlhbikge1xuICAgICAgICBhcnJheVsyXSA9IHZhbHVlc051bWJlciA+PiAxNiAmIDB4RkY7XG4gICAgICAgIGFycmF5WzNdID0gdmFsdWVzTnVtYmVyID4+IDggJiAweEZGO1xuICAgICAgICBhcnJheVs0XSA9IHZhbHVlc051bWJlciAmIDB4RkY7XG5cbiAgICAgICAgYXJyYXlbNV0gPSBpbmRpY2VzTnVtYmVyID4+IDE2ICYgMHhGRjtcbiAgICAgICAgYXJyYXlbNl0gPSBpbmRpY2VzTnVtYmVyID4+IDggJiAweEZGO1xuICAgICAgICBhcnJheVs3XSA9IGluZGljZXNOdW1iZXIgJiAweEZGO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGFycmF5WzJdID0gdmFsdWVzTnVtYmVyICYgMHhGRjtcbiAgICAgICAgYXJyYXlbM10gPSB2YWx1ZXNOdW1iZXIgPj4gOCAmIDB4RkY7XG4gICAgICAgIGFycmF5WzRdID0gdmFsdWVzTnVtYmVyID4+IDE2ICYgMHhGRjtcblxuICAgICAgICBhcnJheVs1XSA9IGluZGljZXNOdW1iZXIgJiAweEZGO1xuICAgICAgICBhcnJheVs2XSA9IGluZGljZXNOdW1iZXIgPj4gOCAmIDB4RkY7XG4gICAgICAgIGFycmF5WzddID0gaW5kaWNlc051bWJlciA+PiAxNiAmIDB4RkY7XG4gICAgfVxuXG5cbiAgICB2YXIgcG9zID0gODtcblxuICAgIC8qKiBBVFRSSUJVVEVTICoqL1xuXG4gICAgZm9yIChpID0gMDsgaSA8IGF0dHJpYnV0ZUtleXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgYXR0cmlidXRlS2V5ID0gYXR0cmlidXRlS2V5c1tpXTtcbiAgICAgICAgYXR0cmlidXRlID0gYXR0cmlidXRlc1thdHRyaWJ1dGVLZXldO1xuICAgICAgICBhdHRyaWJ1dGVUeXBlID0gdHlwZW9mIGF0dHJpYnV0ZS50eXBlID09PSAndW5kZWZpbmVkJyA/IGF0dHJpYnV0ZVR5cGVzLkZsb2F0IDogYXR0cmlidXRlLnR5cGU7XG4gICAgICAgIGF0dHJpYnV0ZU5vcm1hbGl6ZWQgPSAoISFhdHRyaWJ1dGUubm9ybWFsaXplZCA/IDEgOiAwKTtcblxuICAgICAgICAvKioqIFdSSVRFIEFUVFJJQlVURSBIRUFERVIgKioqL1xuXG4gICAgICAgIGZvciAoaiA9IDA7IGogPCBhdHRyaWJ1dGVLZXkubGVuZ3RoOyBqKyssIHBvcysrKSB7XG4gICAgICAgICAgICBhcnJheVtwb3NdID0gKGF0dHJpYnV0ZUtleS5jaGFyQ29kZUF0KGopICYgMHg3RikgfHwgMHg1RjsgLy8gZGVmYXVsdCB0byB1bmRlcnNjb3JlXG4gICAgICAgIH1cblxuICAgICAgICBwb3MrKztcblxuICAgICAgICBhcnJheVtwb3NdID0gKFxuICAgICAgICAgICAgYXR0cmlidXRlVHlwZSA8PCA3IHxcbiAgICAgICAgICAgIGF0dHJpYnV0ZU5vcm1hbGl6ZWQgPDwgNiB8XG4gICAgICAgICAgICAoKGF0dHJpYnV0ZS5jYXJkaW5hbGl0eSAtIDEpICYgMHgwMykgPDwgNCB8XG4gICAgICAgICAgICBFbmNvZGluZ1R5cGVzW2F0dHJpYnV0ZS52YWx1ZXMuY29uc3RydWN0b3IubmFtZV0gJiAweDBGXG4gICAgICAgICk7XG5cbiAgICAgICAgcG9zKys7XG5cblxuICAgICAgICAvLyBwYWRkaW5nIHRvIG5leHQgbXVsdGlwbGUgb2YgNFxuICAgICAgICBwb3MgPSBNYXRoLmNlaWwocG9zIC8gNCkgKiA0O1xuXG4gICAgICAgIC8qKiogV1JJVEUgQVRUUklCVVRFIFZBTFVFUyAqKiovXG5cbiAgICAgICAgdmFyIGF0dHJpYnV0ZXNXcml0ZUFycmF5ID0gY29weVRvQnVmZmVyKGF0dHJpYnV0ZS52YWx1ZXMsIGJ1ZmZlciwgcG9zLCBiaWdFbmRpYW4pO1xuXG4gICAgICAgIHBvcyArPSBhdHRyaWJ1dGVzV3JpdGVBcnJheS5ieXRlTGVuZ3RoO1xuICAgIH1cblxuICAgIC8qKiogV1JJVEUgSU5ESUNFUyBWQUxVRVMgKioqL1xuXG4gICAgaWYgKGluZGV4ZWRHZW9tZXRyeSkge1xuICAgICAgICBwb3MgPSBNYXRoLmNlaWwocG9zIC8gNCkgKiA0O1xuXG4gICAgICAgIGNvcHlUb0J1ZmZlcihpbmRpY2VzLCBidWZmZXIsIHBvcywgYmlnRW5kaWFuKTtcbiAgICB9XG5cbiAgICByZXR1cm4gYnVmZmVyO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGVuY29kZTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgYmlnRW5kaWFuUGxhdGZvcm0gPSBudWxsO1xuXG4vKipcbiAqIENoZWNrIGlmIHRoZSBlbmRpYW5uZXNzIG9mIHRoZSBwbGF0Zm9ybSBpcyBiaWctZW5kaWFuIChtb3N0IHNpZ25pZmljYW50IGJpdCBmaXJzdClcbiAqIEByZXR1cm5zIHtib29sZWFufSBUcnVlIGlmIGJpZy1lbmRpYW4sIGZhbHNlIGlmIGxpdHRsZS1lbmRpYW5cbiAqL1xuZnVuY3Rpb24gaXNCaWdFbmRpYW5QbGF0Zm9ybSAoKSB7XG4gICAgaWYgKGJpZ0VuZGlhblBsYXRmb3JtID09PSBudWxsKSB7XG4gICAgICAgIHZhciBidWZmZXIgPSBuZXcgQXJyYXlCdWZmZXIoMiksXG4gICAgICAgICAgICB1aW50OEFycmF5ID0gbmV3IFVpbnQ4QXJyYXkoYnVmZmVyKSxcbiAgICAgICAgICAgIHVpbnQxNkFycmF5ID0gbmV3IFVpbnQxNkFycmF5KGJ1ZmZlcik7XG5cbiAgICAgICAgdWludDhBcnJheVswXSA9IDB4QUE7IC8vIHNldCBmaXJzdCBieXRlXG4gICAgICAgIHVpbnQ4QXJyYXlbMV0gPSAweEJCOyAvLyBzZXQgc2Vjb25kIGJ5dGVcbiAgICAgICAgYmlnRW5kaWFuUGxhdGZvcm0gPSAodWludDE2QXJyYXlbMF0gPT09IDB4QUFCQik7XG4gICAgfVxuXG4gICAgcmV0dXJuIGJpZ0VuZGlhblBsYXRmb3JtO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGlzQmlnRW5kaWFuUGxhdGZvcm07XG4iXX0=
