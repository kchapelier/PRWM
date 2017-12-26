!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.obj2prwm=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";

var objParser = require('wavefront-obj-parser'),
    computeNormals = require('./utils/compute-normals'),
    prwm = require('prwm');

function serializeIndexed (objData, usePositions, useNormals, useUvs) {
    var nbPolygons = objData.vertexPositionIndices.length / 4, // the parser always return indices by group of 4 to support quads
        indicesMapping = {},
        indices = [],
        vertices = [],
        normals = [],
        uvs = [],
        i,
        k,
        vertexIndex,
        normalIndex,
        uvIndex,
        mapped,
        index,
        nextIndex = 0;

    var mustGenerateNewNormals = useNormals && (!objData.vertexNormals|| objData.vertexNormals.length === 0);

    for (i = 0; i < nbPolygons; i++) {
        for (k = 0; k < 3; k++) { // assume we don't have actual quads in the models
            vertexIndex = objData.vertexPositionIndices[i * 4 + k];
            normalIndex = objData.vertexPositionIndices[i * 4 + k];
            uvIndex = objData.vertexUVIndices[i * 4 + k];

            mapped = (usePositions ? vertexIndex + ':' : ':') + (useNormals ? normalIndex + ':' : ':') + (useUvs ? uvIndex + ':' : ':');

            index = indicesMapping[mapped];

            if (typeof index === 'undefined') {
                index = nextIndex;
                indicesMapping[mapped] = index;
                nextIndex++;

                if (usePositions) {
                    vertices.push(
                        objData.vertexPositions[vertexIndex * 3],
                        objData.vertexPositions[vertexIndex * 3 + 1],
                        objData.vertexPositions[vertexIndex * 3 + 2]
                    );
                }

                if (useNormals && !mustGenerateNewNormals) {
                    normals.push(
                        objData.vertexNormals[normalIndex * 3],
                        objData.vertexNormals[normalIndex * 3 + 1],
                        objData.vertexNormals[normalIndex * 3 + 2]
                    );
                }

                if (useUvs) {
                    uvs.push(
                        objData.vertexUVs[uvIndex * 2],
                        objData.vertexUVs[uvIndex * 2 + 1]
                    );
                }
            }

            indices.push(index);
        }
    }

    if (mustGenerateNewNormals) {
        computeNormals(indices, vertices, normals);
    }

    return {
        indices: indices,
        vertices: vertices,
        normals: normals,
        uvs: uvs
    };
}

function serializeNonIndexed (objData, usePositions, useNormals, useUvs) {
    var nbPolygons = objData.vertexPositionIndices.length / 4, // the parser always return indices by group of 4 to support quads
        vertices = [],
        normals = [],
        uvs = [],
        i,
        k,
        vertexIndex,
        normalIndex,
        uvIndex;

    var mustGenerateNewNormals = useNormals && (!objData.vertexNormals|| objData.vertexNormals.length === 0);

    for (i = 0; i < nbPolygons; i++) {
        for (k = 0; k < 3; k++) { // assume we don't have actual quads in the models
            if (usePositions) {
                vertexIndex = objData.vertexPositionIndices[i * 4 + k];

                vertices.push(
                    objData.vertexPositions[vertexIndex * 3],
                    objData.vertexPositions[vertexIndex * 3 + 1],
                    objData.vertexPositions[vertexIndex * 3 + 2]
                );
            }

            if (useNormals && !mustGenerateNewNormals) {
                normalIndex = objData.vertexNormalIndices[i * 4 + k];

                normals.push(
                    objData.vertexNormals[normalIndex * 3],
                    objData.vertexNormals[normalIndex * 3 + 1],
                    objData.vertexNormals[normalIndex * 3 + 2]
                );
            }

            if (useUvs) {
                uvIndex = objData.vertexUVIndices[i * 4 + k];

                uvs.push(
                    objData.vertexUVs[uvIndex * 2],
                    objData.vertexUVs[uvIndex * 2 + 1]
                );
            }
        }
    }

    if (mustGenerateNewNormals) {
        computeNormals(null, vertices, normals);
    }

    return {
        indices: null,
        vertices: vertices,
        normals: normals,
        uvs: uvs
    };
}

var nbVertices = null;

module.exports = {
    convert: function (objString, options) {
        var log = options.quiet ? function noop() {} : function log(s) { console.log(s) };

        log(' * Parsing WaveFront OBJ data');
        var objData = objParser(objString);

        log(' * Formatting data');
        var serialized = options.indexed ? serializeIndexed(objData, options.positions, options.normals, options.uvs) : serializeNonIndexed(objData, options.positions, options.normals, options.uvs);

        var attributes = {};

        nbVertices = 0;

        if (options.positions) {
            attributes['position'] = { cardinality: 3, normalized: false, values: new Float32Array(serialized.vertices) };
            nbVertices = serialized.vertices.length / 3;
        }

        if (options.normals) {
            attributes['normal'] = { cardinality: 3, normalized: false, values: new Float32Array(serialized.normals) };
            nbVertices = serialized.normals.length / 3;
        }

        if (options.uvs) {
            attributes['uv'] = { cardinality: 2, normalized: false, values: new Float32Array(serialized.uvs) };
            nbVertices = serialized.uvs.length / 2;
        }

        return prwm.encode(
            attributes,
            serialized.indices ? (nbVertices > 0xFFFF ? new Uint32Array(serialized.indices) : new Uint16Array(serialized.indices)) : null,
            options.bigEndian
        );
    },
    getNumberOfVertices: function () {
        return nbVertices;
    }
};


},{"./utils/compute-normals":8,"prwm":2,"wavefront-obj-parser":7}],2:[function(require,module,exports){
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

},{}],7:[function(require,module,exports){
module.exports = ParseWavefrontObj

// Map .obj vertex info line names to our returned property names
var vertexInfoNameMap = {v: 'vertexPositions', vt: 'vertexUVs', vn: 'vertexNormals'}

function ParseWavefrontObj (wavefrontString) {
  'use strict'

  var parsedJSON = {vertexNormals: [], vertexUVs: [], vertexPositions: [], vertexNormalIndices: [], vertexUVIndices: [], vertexPositionIndices: []}

  var linesInWavefrontObj = wavefrontString.split('\n')

  var currentLine, currentLineTokens, vertexInfoType, i, k

  // Loop through and parse every line in our .obj file
  for (i = 0; i < linesInWavefrontObj.length; i++) {
    currentLine = linesInWavefrontObj[i]
    // Tokenize our current line
    currentLineTokens = currentLine.trim().split(/\s+/)
    // vertex position, vertex texture, or vertex normal
    vertexInfoType = vertexInfoNameMap[currentLineTokens[0]]

    if (vertexInfoType) {
      for (k = 1; k < currentLineTokens.length; k++) {
        parsedJSON[vertexInfoType].push(parseFloat(currentLineTokens[k]))
      }
      continue
    }

    if (currentLineTokens[0] === 'f') {
      // Get our 4 sets of vertex, uv, and normal indices for this face
      for (k = 1; k < 5; k++) {
        // If there is no fourth face entry then this is specifying a triangle
        // in this case we push `-1`
        // Consumers of this module should check for `-1` before expanding face data
        if (k === 4 && !currentLineTokens[4]) {
          parsedJSON.vertexPositionIndices.push(-1)
          parsedJSON.vertexUVIndices.push(-1)
          parsedJSON.vertexNormalIndices.push(-1)
        } else {
          var indices = currentLineTokens[k].split('/')
          parsedJSON.vertexPositionIndices.push(parseInt(indices[0], 10) - 1) // We zero index
          parsedJSON.vertexUVIndices.push(parseInt(indices[1], 10) - 1) // our face indices
          parsedJSON.vertexNormalIndices.push(parseInt(indices[2], 10) - 1) // by subtracting 1
        }
      }
    }
  }

  return parsedJSON
}

},{}],8:[function(require,module,exports){
"use strict";

// based on https://github.com/kchapelier/procjam2015/blob/master/src/utils/meshes/compute-vertex-normals.js
// which itself is a rewrite of Three.js function to compute normals

var normalizeNormals = function normalizeNormals (normals) {
    var i, x, y, z, n;

    for (i = 0; i < normals.length; i+= 3) {
        x = normals[i];
        y = normals[i + 1];
        z = normals[i + 2];

        n = 1.0 / Math.sqrt(x * x + y * y + z * z);

        normals[i]*= n;
        normals[i + 1]*= n;
        normals[i + 2]*= n;
    }
};

var computeVertexNormals = function computeVertexNormals (indices, positions, normals) {
    var pA = [0,0,0],
        pB = [0,0,0],
        pC = [0,0,0],
        cb = [0,0,0],
        ab = [0,0,0],
        vA,
        vB,
        vC,
        cbx,
        cby,
        cbz,
        i;

    normals.length = positions.length;

    for (i = 0; i < normals.length; i++) {
        normals[i] = 0;
    }

    if (indices) {
        for (i = 0; i < indices.length; i += 3) {

            vA = indices[i] * 3;
            vB = indices[i + 1] * 3;
            vC = indices[i + 2] * 3;

            /*
             pA.fromArray( positions, vA );
             pB.fromArray( positions, vB );
             pC.fromArray( positions, vC );
             */

            pA[0] = positions[vA];
            pA[1] = positions[vA + 1];
            pA[2] = positions[vA + 2];

            pB[0] = positions[vB];
            pB[1] = positions[vB + 1];
            pB[2] = positions[vB + 2];

            pC[0] = positions[vC];
            pC[1] = positions[vC + 1];
            pC[2] = positions[vC + 2];

            /*
             cb.subVectors( pC, pB );
             ab.subVectors( pA, pB );
             */

            cb[0] = pC[0] - pB[0];
            cb[1] = pC[1] - pB[1];
            cb[2] = pC[2] - pB[2];

            ab[0] = pA[0] - pB[0];
            ab[1] = pA[1] - pB[1];
            ab[2] = pA[2] - pB[2];

            /*
             cb.cross( ab );
             */

            cbx = cb[0];
            cby = cb[1];
            cbz = cb[2];

            cb[0] = cby * ab[2] - cbz * ab[1];
            cb[1] = cbz * ab[0] - cbx * ab[2];
            cb[2] = cbx * ab[1] - cby * ab[0];

            normals[vA] += cb[0];
            normals[vA + 1] += cb[1];
            normals[vA + 2] += cb[2];

            normals[vB] += cb[0];
            normals[vB + 1] += cb[1];
            normals[vB + 2] += cb[2];

            normals[vC] += cb[0];
            normals[vC + 1] += cb[1];
            normals[vC + 2] += cb[2];

        }
    } else {
        for (i = 0; i < positions.length; i += 9) {

            /*
             pA.fromArray( positions, i );
             pB.fromArray( positions, i + 3 );
             pC.fromArray( positions, i + 6 );
             */

            pA[0] = positions[i];
            pA[1] = positions[i + 1];
            pA[2] = positions[i + 2];

            pB[0] = positions[i + 3];
            pB[1] = positions[i + 4];
            pB[2] = positions[i + 5];

            pC[0] = positions[i + 6];
            pC[1] = positions[i + 7];
            pC[2] = positions[i + 8];

            /*
             cb.subVectors( pC, pB );
             ab.subVectors( pA, pB );
             */

            cb[0] = pC[0] - pB[0];
            cb[1] = pC[1] - pB[1];
            cb[2] = pC[2] - pB[2];

            ab[0] = pA[0] - pB[0];
            ab[1] = pA[1] - pB[1];
            ab[2] = pA[2] - pB[2];

            /*
             cb.cross( ab );
             */

            cbx = cb[0];
            cby = cb[1];
            cbz = cb[2];

            cb[0] = cby * ab[2] - cbz * ab[1];
            cb[1] = cbz * ab[0] - cbx * ab[2];
            cb[2] = cbx * ab[1] - cby * ab[0];

            normals[ i ] = cb[0];
            normals[ i + 1 ] = cb[1];
            normals[ i + 2 ] = cb[2];

            normals[ i + 3 ] = cb[0];
            normals[ i + 4 ] = cb[1];
            normals[ i + 5 ] = cb[2];

            normals[ i + 6 ] = cb[0];
            normals[ i + 7 ] = cb[1];
            normals[ i + 8 ] = cb[2];
        }
    }

    normalizeNormals(normals);
};

module.exports = computeVertexNormals;

},{}]},{},[1])(1)
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uL3Vzci9sb2NhbC9saWIvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsImluZGV4LmpzIiwibm9kZV9tb2R1bGVzL3Byd20vaW5kZXguanMiLCJub2RlX21vZHVsZXMvcHJ3bS9wcndtL2F0dHJpYnV0ZS10eXBlcy5qcyIsIm5vZGVfbW9kdWxlcy9wcndtL3Byd20vZGVjb2RlLmpzIiwibm9kZV9tb2R1bGVzL3Byd20vcHJ3bS9lbmNvZGUuanMiLCJub2RlX21vZHVsZXMvcHJ3bS91dGlscy9pcy1iaWctZW5kaWFuLXBsYXRmb3JtLmpzIiwibm9kZV9tb2R1bGVzL3dhdmVmcm9udC1vYmotcGFyc2VyL3NyYy93YXZlZnJvbnQtb2JqLXBhcnNlci5qcyIsInV0aWxzL2NvbXB1dGUtbm9ybWFscy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBvYmpQYXJzZXIgPSByZXF1aXJlKCd3YXZlZnJvbnQtb2JqLXBhcnNlcicpLFxuICAgIGNvbXB1dGVOb3JtYWxzID0gcmVxdWlyZSgnLi91dGlscy9jb21wdXRlLW5vcm1hbHMnKSxcbiAgICBwcndtID0gcmVxdWlyZSgncHJ3bScpO1xuXG5mdW5jdGlvbiBzZXJpYWxpemVJbmRleGVkIChvYmpEYXRhLCB1c2VQb3NpdGlvbnMsIHVzZU5vcm1hbHMsIHVzZVV2cykge1xuICAgIHZhciBuYlBvbHlnb25zID0gb2JqRGF0YS52ZXJ0ZXhQb3NpdGlvbkluZGljZXMubGVuZ3RoIC8gNCwgLy8gdGhlIHBhcnNlciBhbHdheXMgcmV0dXJuIGluZGljZXMgYnkgZ3JvdXAgb2YgNCB0byBzdXBwb3J0IHF1YWRzXG4gICAgICAgIGluZGljZXNNYXBwaW5nID0ge30sXG4gICAgICAgIGluZGljZXMgPSBbXSxcbiAgICAgICAgdmVydGljZXMgPSBbXSxcbiAgICAgICAgbm9ybWFscyA9IFtdLFxuICAgICAgICB1dnMgPSBbXSxcbiAgICAgICAgaSxcbiAgICAgICAgayxcbiAgICAgICAgdmVydGV4SW5kZXgsXG4gICAgICAgIG5vcm1hbEluZGV4LFxuICAgICAgICB1dkluZGV4LFxuICAgICAgICBtYXBwZWQsXG4gICAgICAgIGluZGV4LFxuICAgICAgICBuZXh0SW5kZXggPSAwO1xuXG4gICAgdmFyIG11c3RHZW5lcmF0ZU5ld05vcm1hbHMgPSB1c2VOb3JtYWxzICYmICghb2JqRGF0YS52ZXJ0ZXhOb3JtYWxzfHwgb2JqRGF0YS52ZXJ0ZXhOb3JtYWxzLmxlbmd0aCA9PT0gMCk7XG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgbmJQb2x5Z29uczsgaSsrKSB7XG4gICAgICAgIGZvciAoayA9IDA7IGsgPCAzOyBrKyspIHsgLy8gYXNzdW1lIHdlIGRvbid0IGhhdmUgYWN0dWFsIHF1YWRzIGluIHRoZSBtb2RlbHNcbiAgICAgICAgICAgIHZlcnRleEluZGV4ID0gb2JqRGF0YS52ZXJ0ZXhQb3NpdGlvbkluZGljZXNbaSAqIDQgKyBrXTtcbiAgICAgICAgICAgIG5vcm1hbEluZGV4ID0gb2JqRGF0YS52ZXJ0ZXhQb3NpdGlvbkluZGljZXNbaSAqIDQgKyBrXTtcbiAgICAgICAgICAgIHV2SW5kZXggPSBvYmpEYXRhLnZlcnRleFVWSW5kaWNlc1tpICogNCArIGtdO1xuXG4gICAgICAgICAgICBtYXBwZWQgPSAodXNlUG9zaXRpb25zID8gdmVydGV4SW5kZXggKyAnOicgOiAnOicpICsgKHVzZU5vcm1hbHMgPyBub3JtYWxJbmRleCArICc6JyA6ICc6JykgKyAodXNlVXZzID8gdXZJbmRleCArICc6JyA6ICc6Jyk7XG5cbiAgICAgICAgICAgIGluZGV4ID0gaW5kaWNlc01hcHBpbmdbbWFwcGVkXTtcblxuICAgICAgICAgICAgaWYgKHR5cGVvZiBpbmRleCA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgICAgICBpbmRleCA9IG5leHRJbmRleDtcbiAgICAgICAgICAgICAgICBpbmRpY2VzTWFwcGluZ1ttYXBwZWRdID0gaW5kZXg7XG4gICAgICAgICAgICAgICAgbmV4dEluZGV4Kys7XG5cbiAgICAgICAgICAgICAgICBpZiAodXNlUG9zaXRpb25zKSB7XG4gICAgICAgICAgICAgICAgICAgIHZlcnRpY2VzLnB1c2goXG4gICAgICAgICAgICAgICAgICAgICAgICBvYmpEYXRhLnZlcnRleFBvc2l0aW9uc1t2ZXJ0ZXhJbmRleCAqIDNdLFxuICAgICAgICAgICAgICAgICAgICAgICAgb2JqRGF0YS52ZXJ0ZXhQb3NpdGlvbnNbdmVydGV4SW5kZXggKiAzICsgMV0sXG4gICAgICAgICAgICAgICAgICAgICAgICBvYmpEYXRhLnZlcnRleFBvc2l0aW9uc1t2ZXJ0ZXhJbmRleCAqIDMgKyAyXVxuICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICh1c2VOb3JtYWxzICYmICFtdXN0R2VuZXJhdGVOZXdOb3JtYWxzKSB7XG4gICAgICAgICAgICAgICAgICAgIG5vcm1hbHMucHVzaChcbiAgICAgICAgICAgICAgICAgICAgICAgIG9iakRhdGEudmVydGV4Tm9ybWFsc1tub3JtYWxJbmRleCAqIDNdLFxuICAgICAgICAgICAgICAgICAgICAgICAgb2JqRGF0YS52ZXJ0ZXhOb3JtYWxzW25vcm1hbEluZGV4ICogMyArIDFdLFxuICAgICAgICAgICAgICAgICAgICAgICAgb2JqRGF0YS52ZXJ0ZXhOb3JtYWxzW25vcm1hbEluZGV4ICogMyArIDJdXG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHVzZVV2cykge1xuICAgICAgICAgICAgICAgICAgICB1dnMucHVzaChcbiAgICAgICAgICAgICAgICAgICAgICAgIG9iakRhdGEudmVydGV4VVZzW3V2SW5kZXggKiAyXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG9iakRhdGEudmVydGV4VVZzW3V2SW5kZXggKiAyICsgMV1cbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGluZGljZXMucHVzaChpbmRleCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAobXVzdEdlbmVyYXRlTmV3Tm9ybWFscykge1xuICAgICAgICBjb21wdXRlTm9ybWFscyhpbmRpY2VzLCB2ZXJ0aWNlcywgbm9ybWFscyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgaW5kaWNlczogaW5kaWNlcyxcbiAgICAgICAgdmVydGljZXM6IHZlcnRpY2VzLFxuICAgICAgICBub3JtYWxzOiBub3JtYWxzLFxuICAgICAgICB1dnM6IHV2c1xuICAgIH07XG59XG5cbmZ1bmN0aW9uIHNlcmlhbGl6ZU5vbkluZGV4ZWQgKG9iakRhdGEsIHVzZVBvc2l0aW9ucywgdXNlTm9ybWFscywgdXNlVXZzKSB7XG4gICAgdmFyIG5iUG9seWdvbnMgPSBvYmpEYXRhLnZlcnRleFBvc2l0aW9uSW5kaWNlcy5sZW5ndGggLyA0LCAvLyB0aGUgcGFyc2VyIGFsd2F5cyByZXR1cm4gaW5kaWNlcyBieSBncm91cCBvZiA0IHRvIHN1cHBvcnQgcXVhZHNcbiAgICAgICAgdmVydGljZXMgPSBbXSxcbiAgICAgICAgbm9ybWFscyA9IFtdLFxuICAgICAgICB1dnMgPSBbXSxcbiAgICAgICAgaSxcbiAgICAgICAgayxcbiAgICAgICAgdmVydGV4SW5kZXgsXG4gICAgICAgIG5vcm1hbEluZGV4LFxuICAgICAgICB1dkluZGV4O1xuXG4gICAgdmFyIG11c3RHZW5lcmF0ZU5ld05vcm1hbHMgPSB1c2VOb3JtYWxzICYmICghb2JqRGF0YS52ZXJ0ZXhOb3JtYWxzfHwgb2JqRGF0YS52ZXJ0ZXhOb3JtYWxzLmxlbmd0aCA9PT0gMCk7XG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgbmJQb2x5Z29uczsgaSsrKSB7XG4gICAgICAgIGZvciAoayA9IDA7IGsgPCAzOyBrKyspIHsgLy8gYXNzdW1lIHdlIGRvbid0IGhhdmUgYWN0dWFsIHF1YWRzIGluIHRoZSBtb2RlbHNcbiAgICAgICAgICAgIGlmICh1c2VQb3NpdGlvbnMpIHtcbiAgICAgICAgICAgICAgICB2ZXJ0ZXhJbmRleCA9IG9iakRhdGEudmVydGV4UG9zaXRpb25JbmRpY2VzW2kgKiA0ICsga107XG5cbiAgICAgICAgICAgICAgICB2ZXJ0aWNlcy5wdXNoKFxuICAgICAgICAgICAgICAgICAgICBvYmpEYXRhLnZlcnRleFBvc2l0aW9uc1t2ZXJ0ZXhJbmRleCAqIDNdLFxuICAgICAgICAgICAgICAgICAgICBvYmpEYXRhLnZlcnRleFBvc2l0aW9uc1t2ZXJ0ZXhJbmRleCAqIDMgKyAxXSxcbiAgICAgICAgICAgICAgICAgICAgb2JqRGF0YS52ZXJ0ZXhQb3NpdGlvbnNbdmVydGV4SW5kZXggKiAzICsgMl1cbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAodXNlTm9ybWFscyAmJiAhbXVzdEdlbmVyYXRlTmV3Tm9ybWFscykge1xuICAgICAgICAgICAgICAgIG5vcm1hbEluZGV4ID0gb2JqRGF0YS52ZXJ0ZXhOb3JtYWxJbmRpY2VzW2kgKiA0ICsga107XG5cbiAgICAgICAgICAgICAgICBub3JtYWxzLnB1c2goXG4gICAgICAgICAgICAgICAgICAgIG9iakRhdGEudmVydGV4Tm9ybWFsc1tub3JtYWxJbmRleCAqIDNdLFxuICAgICAgICAgICAgICAgICAgICBvYmpEYXRhLnZlcnRleE5vcm1hbHNbbm9ybWFsSW5kZXggKiAzICsgMV0sXG4gICAgICAgICAgICAgICAgICAgIG9iakRhdGEudmVydGV4Tm9ybWFsc1tub3JtYWxJbmRleCAqIDMgKyAyXVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh1c2VVdnMpIHtcbiAgICAgICAgICAgICAgICB1dkluZGV4ID0gb2JqRGF0YS52ZXJ0ZXhVVkluZGljZXNbaSAqIDQgKyBrXTtcblxuICAgICAgICAgICAgICAgIHV2cy5wdXNoKFxuICAgICAgICAgICAgICAgICAgICBvYmpEYXRhLnZlcnRleFVWc1t1dkluZGV4ICogMl0sXG4gICAgICAgICAgICAgICAgICAgIG9iakRhdGEudmVydGV4VVZzW3V2SW5kZXggKiAyICsgMV1cbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYgKG11c3RHZW5lcmF0ZU5ld05vcm1hbHMpIHtcbiAgICAgICAgY29tcHV0ZU5vcm1hbHMobnVsbCwgdmVydGljZXMsIG5vcm1hbHMpO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICAgIGluZGljZXM6IG51bGwsXG4gICAgICAgIHZlcnRpY2VzOiB2ZXJ0aWNlcyxcbiAgICAgICAgbm9ybWFsczogbm9ybWFscyxcbiAgICAgICAgdXZzOiB1dnNcbiAgICB9O1xufVxuXG52YXIgbmJWZXJ0aWNlcyA9IG51bGw7XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICAgIGNvbnZlcnQ6IGZ1bmN0aW9uIChvYmpTdHJpbmcsIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGxvZyA9IG9wdGlvbnMucXVpZXQgPyBmdW5jdGlvbiBub29wKCkge30gOiBmdW5jdGlvbiBsb2cocykgeyBjb25zb2xlLmxvZyhzKSB9O1xuXG4gICAgICAgIGxvZygnICogUGFyc2luZyBXYXZlRnJvbnQgT0JKIGRhdGEnKTtcbiAgICAgICAgdmFyIG9iakRhdGEgPSBvYmpQYXJzZXIob2JqU3RyaW5nKTtcblxuICAgICAgICBsb2coJyAqIEZvcm1hdHRpbmcgZGF0YScpO1xuICAgICAgICB2YXIgc2VyaWFsaXplZCA9IG9wdGlvbnMuaW5kZXhlZCA/IHNlcmlhbGl6ZUluZGV4ZWQob2JqRGF0YSwgb3B0aW9ucy5wb3NpdGlvbnMsIG9wdGlvbnMubm9ybWFscywgb3B0aW9ucy51dnMpIDogc2VyaWFsaXplTm9uSW5kZXhlZChvYmpEYXRhLCBvcHRpb25zLnBvc2l0aW9ucywgb3B0aW9ucy5ub3JtYWxzLCBvcHRpb25zLnV2cyk7XG5cbiAgICAgICAgdmFyIGF0dHJpYnV0ZXMgPSB7fTtcblxuICAgICAgICBuYlZlcnRpY2VzID0gMDtcblxuICAgICAgICBpZiAob3B0aW9ucy5wb3NpdGlvbnMpIHtcbiAgICAgICAgICAgIGF0dHJpYnV0ZXNbJ3Bvc2l0aW9uJ10gPSB7IGNhcmRpbmFsaXR5OiAzLCBub3JtYWxpemVkOiBmYWxzZSwgdmFsdWVzOiBuZXcgRmxvYXQzMkFycmF5KHNlcmlhbGl6ZWQudmVydGljZXMpIH07XG4gICAgICAgICAgICBuYlZlcnRpY2VzID0gc2VyaWFsaXplZC52ZXJ0aWNlcy5sZW5ndGggLyAzO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKG9wdGlvbnMubm9ybWFscykge1xuICAgICAgICAgICAgYXR0cmlidXRlc1snbm9ybWFsJ10gPSB7IGNhcmRpbmFsaXR5OiAzLCBub3JtYWxpemVkOiBmYWxzZSwgdmFsdWVzOiBuZXcgRmxvYXQzMkFycmF5KHNlcmlhbGl6ZWQubm9ybWFscykgfTtcbiAgICAgICAgICAgIG5iVmVydGljZXMgPSBzZXJpYWxpemVkLm5vcm1hbHMubGVuZ3RoIC8gMztcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChvcHRpb25zLnV2cykge1xuICAgICAgICAgICAgYXR0cmlidXRlc1sndXYnXSA9IHsgY2FyZGluYWxpdHk6IDIsIG5vcm1hbGl6ZWQ6IGZhbHNlLCB2YWx1ZXM6IG5ldyBGbG9hdDMyQXJyYXkoc2VyaWFsaXplZC51dnMpIH07XG4gICAgICAgICAgICBuYlZlcnRpY2VzID0gc2VyaWFsaXplZC51dnMubGVuZ3RoIC8gMjtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBwcndtLmVuY29kZShcbiAgICAgICAgICAgIGF0dHJpYnV0ZXMsXG4gICAgICAgICAgICBzZXJpYWxpemVkLmluZGljZXMgPyAobmJWZXJ0aWNlcyA+IDB4RkZGRiA/IG5ldyBVaW50MzJBcnJheShzZXJpYWxpemVkLmluZGljZXMpIDogbmV3IFVpbnQxNkFycmF5KHNlcmlhbGl6ZWQuaW5kaWNlcykpIDogbnVsbCxcbiAgICAgICAgICAgIG9wdGlvbnMuYmlnRW5kaWFuXG4gICAgICAgICk7XG4gICAgfSxcbiAgICBnZXROdW1iZXJPZlZlcnRpY2VzOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBuYlZlcnRpY2VzO1xuICAgIH1cbn07XG5cbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgYXR0cmlidXRlVHlwZXMgPSByZXF1aXJlKCcuL3Byd20vYXR0cmlidXRlLXR5cGVzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICAgIHZlcnNpb246IDEsXG4gICAgSW50OiBhdHRyaWJ1dGVUeXBlcy5JbnQsXG4gICAgRmxvYXQ6IGF0dHJpYnV0ZVR5cGVzLkZsb2F0LFxuICAgIGlzQmlnRW5kaWFuUGxhdGZvcm06IHJlcXVpcmUoJy4vdXRpbHMvaXMtYmlnLWVuZGlhbi1wbGF0Zm9ybScpLFxuICAgIGVuY29kZTogcmVxdWlyZSgnLi9wcndtL2VuY29kZScpLFxuICAgIGRlY29kZTogcmVxdWlyZSgnLi9wcndtL2RlY29kZScpXG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICAgIEZsb2F0OiAwLFxuICAgIEludDogMVxufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgaXNCaWdFbmRpYW5QbGF0Zm9ybSA9IHJlcXVpcmUoJy4uL3V0aWxzL2lzLWJpZy1lbmRpYW4tcGxhdGZvcm0nKTtcblxuLy8gbWF0Y2ggdGhlIHZhbHVlcyBkZWZpbmVkIGluIHRoZSBzcGVjIHRvIHRoZSBUeXBlZEFycmF5IHR5cGVzXG52YXIgSW52ZXJ0ZWRFbmNvZGluZ1R5cGVzID0gW1xuICAgIG51bGwsXG4gICAgRmxvYXQzMkFycmF5LFxuICAgIG51bGwsXG4gICAgSW50OEFycmF5LFxuICAgIEludDE2QXJyYXksXG4gICAgbnVsbCxcbiAgICBJbnQzMkFycmF5LFxuICAgIFVpbnQ4QXJyYXksXG4gICAgVWludDE2QXJyYXksXG4gICAgbnVsbCxcbiAgICBVaW50MzJBcnJheVxuXTtcblxuLy8gZGVmaW5lIHRoZSBtZXRob2QgdG8gdXNlIG9uIGEgRGF0YVZpZXcsIGNvcnJlc3BvbmRpbmcgdGhlIFR5cGVkQXJyYXkgdHlwZVxudmFyIGdldE1ldGhvZHMgPSB7XG4gICAgVWludDE2QXJyYXk6ICdnZXRVaW50MTYnLFxuICAgIFVpbnQzMkFycmF5OiAnZ2V0VWludDMyJyxcbiAgICBJbnQxNkFycmF5OiAnZ2V0SW50MTYnLFxuICAgIEludDMyQXJyYXk6ICdnZXRJbnQzMicsXG4gICAgRmxvYXQzMkFycmF5OiAnZ2V0RmxvYXQzMidcbn07XG5cbmZ1bmN0aW9uIGNvcHlGcm9tQnVmZmVyIChzb3VyY2VBcnJheUJ1ZmZlciwgdmlld1R5cGUsIHBvc2l0aW9uLCBsZW5ndGgsIGZyb21CaWdFbmRpYW4pIHtcbiAgICB2YXIgYnl0ZXNQZXJFbGVtZW50ID0gdmlld1R5cGUuQllURVNfUEVSX0VMRU1FTlQsXG4gICAgICAgIHJlc3VsdDtcblxuICAgIGlmIChmcm9tQmlnRW5kaWFuID09PSBpc0JpZ0VuZGlhblBsYXRmb3JtKCkgfHwgYnl0ZXNQZXJFbGVtZW50ID09PSAxKSB7XG4gICAgICAgIHJlc3VsdCA9IG5ldyB2aWV3VHlwZShzb3VyY2VBcnJheUJ1ZmZlciwgcG9zaXRpb24sIGxlbmd0aCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIHJlYWRWaWV3ID0gbmV3IERhdGFWaWV3KHNvdXJjZUFycmF5QnVmZmVyLCBwb3NpdGlvbiwgbGVuZ3RoICogYnl0ZXNQZXJFbGVtZW50KSxcbiAgICAgICAgICAgIGdldE1ldGhvZCA9IGdldE1ldGhvZHNbdmlld1R5cGUubmFtZV0sXG4gICAgICAgICAgICBsaXR0bGVFbmRpYW4gPSAhZnJvbUJpZ0VuZGlhbjtcblxuICAgICAgICByZXN1bHQgPSBuZXcgdmlld1R5cGUobGVuZ3RoKTtcblxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICByZXN1bHRbaV0gPSByZWFkVmlld1tnZXRNZXRob2RdKGkgKiBieXRlc1BlckVsZW1lbnQsIGxpdHRsZUVuZGlhbik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiBkZWNvZGUgKGJ1ZmZlciwgb2Zmc2V0KSB7XG4gICAgb2Zmc2V0ID0gb2Zmc2V0IHx8IDA7XG5cbiAgICB2YXIgYXJyYXkgPSBuZXcgVWludDhBcnJheShidWZmZXIsIG9mZnNldCksXG4gICAgICAgIHZlcnNpb24gPSBhcnJheVswXSxcbiAgICAgICAgZmxhZ3MgPSBhcnJheVsxXSxcbiAgICAgICAgaW5kZXhlZEdlb21ldHJ5ID0gISEoZmxhZ3MgPj4gNyksXG4gICAgICAgIGluZGljZXNUeXBlID0gZmxhZ3MgPj4gNiAmIDB4MDEsXG4gICAgICAgIGJpZ0VuZGlhbiA9IChmbGFncyA+PiA1ICYgMHgwMSkgPT09IDEsXG4gICAgICAgIGF0dHJpYnV0ZXNOdW1iZXIgPSBmbGFncyAmIDB4MUYsXG4gICAgICAgIHZhbHVlc051bWJlciA9IDAsXG4gICAgICAgIGluZGljZXNOdW1iZXIgPSAwO1xuXG4gICAgaWYgKGJpZ0VuZGlhbikge1xuICAgICAgICB2YWx1ZXNOdW1iZXIgPSAoYXJyYXlbMl0gPDwgMTYpICsgKGFycmF5WzNdIDw8IDgpICsgYXJyYXlbNF07XG4gICAgICAgIGluZGljZXNOdW1iZXIgPSAoYXJyYXlbNV0gPDwgMTYpICsgKGFycmF5WzZdIDw8IDgpICsgYXJyYXlbN107XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdmFsdWVzTnVtYmVyID0gYXJyYXlbMl0gKyAoYXJyYXlbM10gPDwgOCkgKyAoYXJyYXlbNF0gPDwgMTYpO1xuICAgICAgICBpbmRpY2VzTnVtYmVyID0gYXJyYXlbNV0gKyAoYXJyYXlbNl0gPDwgOCkgKyAoYXJyYXlbN10gPDwgMTYpO1xuICAgIH1cblxuICAgIC8qKiBQUkVMSU1JTkFSWSBDSEVDS1MgKiovXG5cbiAgICBpZiAob2Zmc2V0IC8gNCAlIDEgIT09IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdQUldNIGRlY29kZXI6IE9mZnNldCBzaG91bGQgYmUgYSBtdWx0aXBsZSBvZiA0LCByZWNlaXZlZCAnICsgb2Zmc2V0KTtcbiAgICB9XG5cbiAgICBpZiAodmVyc2lvbiA9PT0gMCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BSV00gZGVjb2RlcjogSW52YWxpZCBmb3JtYXQgdmVyc2lvbjogMCcpO1xuICAgIH0gZWxzZSBpZiAodmVyc2lvbiAhPT0gMSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BSV00gZGVjb2RlcjogVW5zdXBwb3J0ZWQgZm9ybWF0IHZlcnNpb246ICcgKyB2ZXJzaW9uKTtcbiAgICB9XG5cbiAgICBpZiAoIWluZGV4ZWRHZW9tZXRyeSkge1xuICAgICAgICBpZiAoaW5kaWNlc1R5cGUgIT09IDApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignUFJXTSBkZWNvZGVyOiBJbmRpY2VzIHR5cGUgbXVzdCBiZSBzZXQgdG8gMCBmb3Igbm9uLWluZGV4ZWQgZ2VvbWV0cmllcycpO1xuICAgICAgICB9IGVsc2UgaWYgKGluZGljZXNOdW1iZXIgIT09IDApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignUFJXTSBkZWNvZGVyOiBOdW1iZXIgb2YgaW5kaWNlcyBtdXN0IGJlIHNldCB0byAwIGZvciBub24taW5kZXhlZCBnZW9tZXRyaWVzJyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKiogUEFSU0lORyAqKi9cblxuICAgIHZhciBwb3MgPSA4O1xuXG4gICAgdmFyIGF0dHJpYnV0ZXMgPSB7fSxcbiAgICAgICAgYXR0cmlidXRlTmFtZSxcbiAgICAgICAgY2hhcixcbiAgICAgICAgYXR0cmlidXRlTm9ybWFsaXplZCxcbiAgICAgICAgYXR0cmlidXRlVHlwZSxcbiAgICAgICAgY2FyZGluYWxpdHksXG4gICAgICAgIGVuY29kaW5nVHlwZSxcbiAgICAgICAgYXJyYXlUeXBlLFxuICAgICAgICB2YWx1ZXMsXG4gICAgICAgIGk7XG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgYXR0cmlidXRlc051bWJlcjsgaSsrKSB7XG4gICAgICAgIGF0dHJpYnV0ZU5hbWUgPSAnJztcblxuICAgICAgICB3aGlsZSAocG9zIDwgYXJyYXkubGVuZ3RoKSB7XG4gICAgICAgICAgICBjaGFyID0gYXJyYXlbcG9zXTtcbiAgICAgICAgICAgIHBvcysrO1xuXG4gICAgICAgICAgICBpZiAoY2hhciA9PT0gMCkge1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBhdHRyaWJ1dGVOYW1lICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoY2hhcik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmbGFncyA9IGFycmF5W3Bvc107XG5cbiAgICAgICAgYXR0cmlidXRlVHlwZSA9IGZsYWdzID4+IDcgJiAweDAxO1xuICAgICAgICBhdHRyaWJ1dGVOb3JtYWxpemVkID0gISEoZmxhZ3MgPj4gNiAmIDB4MDEpO1xuICAgICAgICBjYXJkaW5hbGl0eSA9IChmbGFncyA+PiA0ICYgMHgwMykgKyAxO1xuICAgICAgICBlbmNvZGluZ1R5cGUgPSBmbGFncyAmIDB4MEY7XG4gICAgICAgIGFycmF5VHlwZSA9IEludmVydGVkRW5jb2RpbmdUeXBlc1tlbmNvZGluZ1R5cGVdO1xuXG4gICAgICAgIHBvcysrO1xuXG4gICAgICAgIC8vIHBhZGRpbmcgdG8gbmV4dCBtdWx0aXBsZSBvZiA0XG4gICAgICAgIHBvcyA9IE1hdGguY2VpbChwb3MgLyA0KSAqIDQ7XG5cbiAgICAgICAgdmFsdWVzID0gY29weUZyb21CdWZmZXIoYnVmZmVyLCBhcnJheVR5cGUsIHBvcyArIG9mZnNldCwgY2FyZGluYWxpdHkgKiB2YWx1ZXNOdW1iZXIsIGJpZ0VuZGlhbik7XG5cbiAgICAgICAgcG9zKz0gYXJyYXlUeXBlLkJZVEVTX1BFUl9FTEVNRU5UICogY2FyZGluYWxpdHkgKiB2YWx1ZXNOdW1iZXI7XG5cbiAgICAgICAgYXR0cmlidXRlc1thdHRyaWJ1dGVOYW1lXSA9IHtcbiAgICAgICAgICAgIHR5cGU6IGF0dHJpYnV0ZVR5cGUsXG4gICAgICAgICAgICBub3JtYWxpemVkOiBhdHRyaWJ1dGVOb3JtYWxpemVkLFxuICAgICAgICAgICAgY2FyZGluYWxpdHk6IGNhcmRpbmFsaXR5LFxuICAgICAgICAgICAgdmFsdWVzOiB2YWx1ZXNcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBwb3MgPSBNYXRoLmNlaWwocG9zIC8gNCkgKiA0O1xuXG4gICAgdmFyIGluZGljZXMgPSBudWxsO1xuXG4gICAgaWYgKGluZGV4ZWRHZW9tZXRyeSkge1xuICAgICAgICBpbmRpY2VzID0gY29weUZyb21CdWZmZXIoXG4gICAgICAgICAgICBidWZmZXIsXG4gICAgICAgICAgICBpbmRpY2VzVHlwZSA9PT0gMSA/IFVpbnQzMkFycmF5IDogVWludDE2QXJyYXksXG4gICAgICAgICAgICBwb3MgKyBvZmZzZXQsXG4gICAgICAgICAgICBpbmRpY2VzTnVtYmVyLFxuICAgICAgICAgICAgYmlnRW5kaWFuXG4gICAgICAgICk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgdmVyc2lvbjogdmVyc2lvbixcbiAgICAgICAgYmlnRW5kaWFuOiBiaWdFbmRpYW4sXG4gICAgICAgIGF0dHJpYnV0ZXM6IGF0dHJpYnV0ZXMsXG4gICAgICAgIGluZGljZXM6IGluZGljZXNcbiAgICB9O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGRlY29kZTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgaXNCaWdFbmRpYW5QbGF0Zm9ybSA9IHJlcXVpcmUoJy4uL3V0aWxzL2lzLWJpZy1lbmRpYW4tcGxhdGZvcm0nKSxcbiAgICBhdHRyaWJ1dGVUeXBlcyA9IHJlcXVpcmUoJy4vYXR0cmlidXRlLXR5cGVzJyk7XG5cbi8vIG1hdGNoIHRoZSBUeXBlZEFycmF5IHR5cGUgd2l0aCB0aGUgdmFsdWUgZGVmaW5lZCBpbiB0aGUgc3BlY1xudmFyIEVuY29kaW5nVHlwZXMgPSB7XG4gICAgRmxvYXQzMkFycmF5OiAxLFxuICAgIEludDhBcnJheTogMyxcbiAgICBJbnQxNkFycmF5OiA0LFxuICAgIEludDMyQXJyYXk6IDYsXG4gICAgVWludDhBcnJheTogNyxcbiAgICBVaW50MTZBcnJheTogOCxcbiAgICBVaW50MzJBcnJheTogMTBcbn07XG5cbi8vIGRlZmluZSB0aGUgbWV0aG9kIHRvIHVzZSBvbiBhIERhdGFWaWV3LCBjb3JyZXNwb25kaW5nIHRoZSBUeXBlZEFycmF5IHR5cGVcbnZhciBzZXRNZXRob2RzID0ge1xuICAgIFVpbnQxNkFycmF5OiAnc2V0VWludDE2JyxcbiAgICBVaW50MzJBcnJheTogJ3NldFVpbnQzMicsXG4gICAgSW50MTZBcnJheTogJ3NldEludDE2JyxcbiAgICBJbnQzMkFycmF5OiAnc2V0SW50MzInLFxuICAgIEZsb2F0MzJBcnJheTogJ3NldEZsb2F0MzInXG59O1xuXG5mdW5jdGlvbiBjb3B5VG9CdWZmZXIgKHNvdXJjZVR5cGVkQXJyYXksIGRlc3RpbmF0aW9uQXJyYXlCdWZmZXIsIHBvc2l0aW9uLCBiaWdFbmRpYW4pIHtcbiAgICB2YXIgbGVuZ3RoID0gc291cmNlVHlwZWRBcnJheS5sZW5ndGgsXG4gICAgICAgIGJ5dGVzUGVyRWxlbWVudCA9IHNvdXJjZVR5cGVkQXJyYXkuQllURVNfUEVSX0VMRU1FTlQ7XG5cbiAgICB2YXIgd3JpdGVBcnJheSA9IG5ldyBzb3VyY2VUeXBlZEFycmF5LmNvbnN0cnVjdG9yKGRlc3RpbmF0aW9uQXJyYXlCdWZmZXIsIHBvc2l0aW9uLCBsZW5ndGgpO1xuXG4gICAgaWYgKGJpZ0VuZGlhbiA9PT0gaXNCaWdFbmRpYW5QbGF0Zm9ybSgpIHx8IGJ5dGVzUGVyRWxlbWVudCA9PT0gMSkge1xuICAgICAgICAvLyBkZXNpcmVkIGVuZGlhbm5lc3MgaXMgdGhlIHNhbWUgYXMgdGhlIHBsYXRmb3JtLCBvciB0aGUgZW5kaWFubmVzcyBkb2Vzbid0IG1hdHRlciAoMSBieXRlKVxuICAgICAgICB3cml0ZUFycmF5LnNldChzb3VyY2VUeXBlZEFycmF5LnN1YmFycmF5KDAsIGxlbmd0aCkpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciB3cml0ZVZpZXcgPSBuZXcgRGF0YVZpZXcoZGVzdGluYXRpb25BcnJheUJ1ZmZlciwgcG9zaXRpb24sIGxlbmd0aCAqIGJ5dGVzUGVyRWxlbWVudCksXG4gICAgICAgICAgICBzZXRNZXRob2QgPSBzZXRNZXRob2RzW3NvdXJjZVR5cGVkQXJyYXkuY29uc3RydWN0b3IubmFtZV0sXG4gICAgICAgICAgICBsaXR0bGVFbmRpYW4gPSAhYmlnRW5kaWFuLFxuICAgICAgICAgICAgaSA9IDA7XG5cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB3cml0ZVZpZXdbc2V0TWV0aG9kXShpICogYnl0ZXNQZXJFbGVtZW50LCBzb3VyY2VUeXBlZEFycmF5W2ldLCBsaXR0bGVFbmRpYW4pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHdyaXRlQXJyYXk7XG59XG5cbmZ1bmN0aW9uIGVuY29kZSAoYXR0cmlidXRlcywgaW5kaWNlcywgYmlnRW5kaWFuKSB7XG4gICAgdmFyIGF0dHJpYnV0ZUtleXMgPSBhdHRyaWJ1dGVzID8gT2JqZWN0LmtleXMoYXR0cmlidXRlcykgOiBbXSxcbiAgICAgICAgaW5kZXhlZEdlb21ldHJ5ID0gISFpbmRpY2VzLFxuICAgICAgICBpLCBqO1xuXG4gICAgLyoqIFBSRUxJTUlOQVJZIENIRUNLUyAqKi9cblxuICAgIC8vIHRoaXMgaXMgbm90IHN1cHBvc2VkIHRvIGNhdGNoIGFsbCB0aGUgcG9zc2libGUgZXJyb3JzLCBvbmx5IHNvbWUgb2YgdGhlIGdvdGNoYXNcblxuICAgIGlmIChhdHRyaWJ1dGVLZXlzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BSV00gZW5jb2RlcjogVGhlIG1vZGVsIG11c3QgaGF2ZSBhdCBsZWFzdCBvbmUgYXR0cmlidXRlJyk7XG4gICAgfVxuXG4gICAgaWYgKGF0dHJpYnV0ZUtleXMubGVuZ3RoID4gMzEpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdQUldNIGVuY29kZXI6IFRoZSBtb2RlbCBjYW4gaGF2ZSBhdCBtb3N0IDMxIGF0dHJpYnV0ZXMnKTtcbiAgICB9XG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgYXR0cmlidXRlS2V5cy5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAoIUVuY29kaW5nVHlwZXMuaGFzT3duUHJvcGVydHkoYXR0cmlidXRlc1thdHRyaWJ1dGVLZXlzW2ldXS52YWx1ZXMuY29uc3RydWN0b3IubmFtZSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignUFJXTSBlbmNvZGVyOiBVbnN1cHBvcnRlZCBhdHRyaWJ1dGUgdmFsdWVzIHR5cGU6ICcgKyBhdHRyaWJ1dGVzW2F0dHJpYnV0ZUtleXNbaV1dLnZhbHVlcy5jb25zdHJ1Y3Rvci5uYW1lKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmIChpbmRleGVkR2VvbWV0cnkgJiYgaW5kaWNlcy5jb25zdHJ1Y3Rvci5uYW1lICE9PSAnVWludDE2QXJyYXknICYmIGluZGljZXMuY29uc3RydWN0b3IubmFtZSAhPT0gJ1VpbnQzMkFycmF5Jykge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BSV00gZW5jb2RlcjogVGhlIGluZGljZXMgbXVzdCBiZSByZXByZXNlbnRlZCBhcyBhbiBVaW50MTZBcnJheSBvciBhbiBVaW50MzJBcnJheScpO1xuICAgIH1cblxuICAgIC8qKiBHRVQgVEhFIFRZUEUgT0YgSU5ESUNFUyBBUyBXRUxMIEFTIFRIRSBOVU1CRVIgT0YgSU5ESUNFUyBBTkQgQVRUUklCVVRFIFZBTFVFUyAqKi9cblxuICAgIHZhciB2YWx1ZXNOdW1iZXIgPSBhdHRyaWJ1dGVzW2F0dHJpYnV0ZUtleXNbMF1dLnZhbHVlcy5sZW5ndGggLyBhdHRyaWJ1dGVzW2F0dHJpYnV0ZUtleXNbMF1dLmNhcmRpbmFsaXR5IHwgMCxcbiAgICAgICAgaW5kaWNlc051bWJlciA9IGluZGV4ZWRHZW9tZXRyeSA/IGluZGljZXMubGVuZ3RoIDogMCxcbiAgICAgICAgaW5kaWNlc1R5cGUgPSBpbmRleGVkR2VvbWV0cnkgJiYgaW5kaWNlcy5jb25zdHJ1Y3Rvci5uYW1lID09PSAnVWludDMyQXJyYXknID8gMSA6IDA7XG5cbiAgICAvKiogR0VUIFRIRSBGSUxFIExFTkdUSCAqKi9cblxuICAgIHZhciB0b3RhbExlbmd0aCA9IDgsXG4gICAgICAgIGF0dHJpYnV0ZUtleSxcbiAgICAgICAgYXR0cmlidXRlLFxuICAgICAgICBhdHRyaWJ1dGVUeXBlLFxuICAgICAgICBhdHRyaWJ1dGVOb3JtYWxpemVkO1xuXG4gICAgZm9yIChpID0gMDsgaSA8IGF0dHJpYnV0ZUtleXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgYXR0cmlidXRlS2V5ID0gYXR0cmlidXRlS2V5c1tpXTtcbiAgICAgICAgYXR0cmlidXRlID0gYXR0cmlidXRlc1thdHRyaWJ1dGVLZXldO1xuICAgICAgICB0b3RhbExlbmd0aCArPSBhdHRyaWJ1dGVLZXkubGVuZ3RoICsgMjsgLy8gTlVMIGJ5dGUgKyBmbGFnIGJ5dGUgKyBwYWRkaW5nXG4gICAgICAgIHRvdGFsTGVuZ3RoID0gTWF0aC5jZWlsKHRvdGFsTGVuZ3RoIC8gNCkgKiA0OyAvLyBwYWRkaW5nXG4gICAgICAgIHRvdGFsTGVuZ3RoICs9IGF0dHJpYnV0ZS52YWx1ZXMuYnl0ZUxlbmd0aDtcbiAgICB9XG5cbiAgICBpZiAoaW5kZXhlZEdlb21ldHJ5KSB7XG4gICAgICAgIHRvdGFsTGVuZ3RoID0gTWF0aC5jZWlsKHRvdGFsTGVuZ3RoIC8gNCkgKiA0O1xuICAgICAgICB0b3RhbExlbmd0aCArPSBpbmRpY2VzLmJ5dGVMZW5ndGg7XG4gICAgfVxuXG4gICAgLyoqIElOSVRJQUxJWkUgVEhFIEJVRkZFUiAqL1xuXG4gICAgdmFyIGJ1ZmZlciA9IG5ldyBBcnJheUJ1ZmZlcih0b3RhbExlbmd0aCksXG4gICAgICAgIGFycmF5ID0gbmV3IFVpbnQ4QXJyYXkoYnVmZmVyKTtcblxuICAgIC8qKiBIRUFERVIgKiovXG5cbiAgICBhcnJheVswXSA9IDE7XG4gICAgYXJyYXlbMV0gPSAoXG4gICAgICAgIGluZGV4ZWRHZW9tZXRyeSA8PCA3IHxcbiAgICAgICAgaW5kaWNlc1R5cGUgPDwgNiB8XG4gICAgICAgIChiaWdFbmRpYW4gPyAxIDogMCkgPDwgNSB8XG4gICAgICAgIGF0dHJpYnV0ZUtleXMubGVuZ3RoICYgMHgxRlxuICAgICk7XG5cbiAgICBpZiAoYmlnRW5kaWFuKSB7XG4gICAgICAgIGFycmF5WzJdID0gdmFsdWVzTnVtYmVyID4+IDE2ICYgMHhGRjtcbiAgICAgICAgYXJyYXlbM10gPSB2YWx1ZXNOdW1iZXIgPj4gOCAmIDB4RkY7XG4gICAgICAgIGFycmF5WzRdID0gdmFsdWVzTnVtYmVyICYgMHhGRjtcblxuICAgICAgICBhcnJheVs1XSA9IGluZGljZXNOdW1iZXIgPj4gMTYgJiAweEZGO1xuICAgICAgICBhcnJheVs2XSA9IGluZGljZXNOdW1iZXIgPj4gOCAmIDB4RkY7XG4gICAgICAgIGFycmF5WzddID0gaW5kaWNlc051bWJlciAmIDB4RkY7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgYXJyYXlbMl0gPSB2YWx1ZXNOdW1iZXIgJiAweEZGO1xuICAgICAgICBhcnJheVszXSA9IHZhbHVlc051bWJlciA+PiA4ICYgMHhGRjtcbiAgICAgICAgYXJyYXlbNF0gPSB2YWx1ZXNOdW1iZXIgPj4gMTYgJiAweEZGO1xuXG4gICAgICAgIGFycmF5WzVdID0gaW5kaWNlc051bWJlciAmIDB4RkY7XG4gICAgICAgIGFycmF5WzZdID0gaW5kaWNlc051bWJlciA+PiA4ICYgMHhGRjtcbiAgICAgICAgYXJyYXlbN10gPSBpbmRpY2VzTnVtYmVyID4+IDE2ICYgMHhGRjtcbiAgICB9XG5cblxuICAgIHZhciBwb3MgPSA4O1xuXG4gICAgLyoqIEFUVFJJQlVURVMgKiovXG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgYXR0cmlidXRlS2V5cy5sZW5ndGg7IGkrKykge1xuICAgICAgICBhdHRyaWJ1dGVLZXkgPSBhdHRyaWJ1dGVLZXlzW2ldO1xuICAgICAgICBhdHRyaWJ1dGUgPSBhdHRyaWJ1dGVzW2F0dHJpYnV0ZUtleV07XG4gICAgICAgIGF0dHJpYnV0ZVR5cGUgPSB0eXBlb2YgYXR0cmlidXRlLnR5cGUgPT09ICd1bmRlZmluZWQnID8gYXR0cmlidXRlVHlwZXMuRmxvYXQgOiBhdHRyaWJ1dGUudHlwZTtcbiAgICAgICAgYXR0cmlidXRlTm9ybWFsaXplZCA9ICghIWF0dHJpYnV0ZS5ub3JtYWxpemVkID8gMSA6IDApO1xuXG4gICAgICAgIC8qKiogV1JJVEUgQVRUUklCVVRFIEhFQURFUiAqKiovXG5cbiAgICAgICAgZm9yIChqID0gMDsgaiA8IGF0dHJpYnV0ZUtleS5sZW5ndGg7IGorKywgcG9zKyspIHtcbiAgICAgICAgICAgIGFycmF5W3Bvc10gPSAoYXR0cmlidXRlS2V5LmNoYXJDb2RlQXQoaikgJiAweDdGKSB8fCAweDVGOyAvLyBkZWZhdWx0IHRvIHVuZGVyc2NvcmVcbiAgICAgICAgfVxuXG4gICAgICAgIHBvcysrO1xuXG4gICAgICAgIGFycmF5W3Bvc10gPSAoXG4gICAgICAgICAgICBhdHRyaWJ1dGVUeXBlIDw8IDcgfFxuICAgICAgICAgICAgYXR0cmlidXRlTm9ybWFsaXplZCA8PCA2IHxcbiAgICAgICAgICAgICgoYXR0cmlidXRlLmNhcmRpbmFsaXR5IC0gMSkgJiAweDAzKSA8PCA0IHxcbiAgICAgICAgICAgIEVuY29kaW5nVHlwZXNbYXR0cmlidXRlLnZhbHVlcy5jb25zdHJ1Y3Rvci5uYW1lXSAmIDB4MEZcbiAgICAgICAgKTtcblxuICAgICAgICBwb3MrKztcblxuXG4gICAgICAgIC8vIHBhZGRpbmcgdG8gbmV4dCBtdWx0aXBsZSBvZiA0XG4gICAgICAgIHBvcyA9IE1hdGguY2VpbChwb3MgLyA0KSAqIDQ7XG5cbiAgICAgICAgLyoqKiBXUklURSBBVFRSSUJVVEUgVkFMVUVTICoqKi9cblxuICAgICAgICB2YXIgYXR0cmlidXRlc1dyaXRlQXJyYXkgPSBjb3B5VG9CdWZmZXIoYXR0cmlidXRlLnZhbHVlcywgYnVmZmVyLCBwb3MsIGJpZ0VuZGlhbik7XG5cbiAgICAgICAgcG9zICs9IGF0dHJpYnV0ZXNXcml0ZUFycmF5LmJ5dGVMZW5ndGg7XG4gICAgfVxuXG4gICAgLyoqKiBXUklURSBJTkRJQ0VTIFZBTFVFUyAqKiovXG5cbiAgICBpZiAoaW5kZXhlZEdlb21ldHJ5KSB7XG4gICAgICAgIHBvcyA9IE1hdGguY2VpbChwb3MgLyA0KSAqIDQ7XG5cbiAgICAgICAgY29weVRvQnVmZmVyKGluZGljZXMsIGJ1ZmZlciwgcG9zLCBiaWdFbmRpYW4pO1xuICAgIH1cblxuICAgIHJldHVybiBidWZmZXI7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZW5jb2RlO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBiaWdFbmRpYW5QbGF0Zm9ybSA9IG51bGw7XG5cbi8qKlxuICogQ2hlY2sgaWYgdGhlIGVuZGlhbm5lc3Mgb2YgdGhlIHBsYXRmb3JtIGlzIGJpZy1lbmRpYW4gKG1vc3Qgc2lnbmlmaWNhbnQgYml0IGZpcnN0KVxuICogQHJldHVybnMge2Jvb2xlYW59IFRydWUgaWYgYmlnLWVuZGlhbiwgZmFsc2UgaWYgbGl0dGxlLWVuZGlhblxuICovXG5mdW5jdGlvbiBpc0JpZ0VuZGlhblBsYXRmb3JtICgpIHtcbiAgICBpZiAoYmlnRW5kaWFuUGxhdGZvcm0gPT09IG51bGwpIHtcbiAgICAgICAgdmFyIGJ1ZmZlciA9IG5ldyBBcnJheUJ1ZmZlcigyKSxcbiAgICAgICAgICAgIHVpbnQ4QXJyYXkgPSBuZXcgVWludDhBcnJheShidWZmZXIpLFxuICAgICAgICAgICAgdWludDE2QXJyYXkgPSBuZXcgVWludDE2QXJyYXkoYnVmZmVyKTtcblxuICAgICAgICB1aW50OEFycmF5WzBdID0gMHhBQTsgLy8gc2V0IGZpcnN0IGJ5dGVcbiAgICAgICAgdWludDhBcnJheVsxXSA9IDB4QkI7IC8vIHNldCBzZWNvbmQgYnl0ZVxuICAgICAgICBiaWdFbmRpYW5QbGF0Zm9ybSA9ICh1aW50MTZBcnJheVswXSA9PT0gMHhBQUJCKTtcbiAgICB9XG5cbiAgICByZXR1cm4gYmlnRW5kaWFuUGxhdGZvcm07XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaXNCaWdFbmRpYW5QbGF0Zm9ybTtcbiIsIm1vZHVsZS5leHBvcnRzID0gUGFyc2VXYXZlZnJvbnRPYmpcblxuLy8gTWFwIC5vYmogdmVydGV4IGluZm8gbGluZSBuYW1lcyB0byBvdXIgcmV0dXJuZWQgcHJvcGVydHkgbmFtZXNcbnZhciB2ZXJ0ZXhJbmZvTmFtZU1hcCA9IHt2OiAndmVydGV4UG9zaXRpb25zJywgdnQ6ICd2ZXJ0ZXhVVnMnLCB2bjogJ3ZlcnRleE5vcm1hbHMnfVxuXG5mdW5jdGlvbiBQYXJzZVdhdmVmcm9udE9iaiAod2F2ZWZyb250U3RyaW5nKSB7XG4gICd1c2Ugc3RyaWN0J1xuXG4gIHZhciBwYXJzZWRKU09OID0ge3ZlcnRleE5vcm1hbHM6IFtdLCB2ZXJ0ZXhVVnM6IFtdLCB2ZXJ0ZXhQb3NpdGlvbnM6IFtdLCB2ZXJ0ZXhOb3JtYWxJbmRpY2VzOiBbXSwgdmVydGV4VVZJbmRpY2VzOiBbXSwgdmVydGV4UG9zaXRpb25JbmRpY2VzOiBbXX1cblxuICB2YXIgbGluZXNJbldhdmVmcm9udE9iaiA9IHdhdmVmcm9udFN0cmluZy5zcGxpdCgnXFxuJylcblxuICB2YXIgY3VycmVudExpbmUsIGN1cnJlbnRMaW5lVG9rZW5zLCB2ZXJ0ZXhJbmZvVHlwZSwgaSwga1xuXG4gIC8vIExvb3AgdGhyb3VnaCBhbmQgcGFyc2UgZXZlcnkgbGluZSBpbiBvdXIgLm9iaiBmaWxlXG4gIGZvciAoaSA9IDA7IGkgPCBsaW5lc0luV2F2ZWZyb250T2JqLmxlbmd0aDsgaSsrKSB7XG4gICAgY3VycmVudExpbmUgPSBsaW5lc0luV2F2ZWZyb250T2JqW2ldXG4gICAgLy8gVG9rZW5pemUgb3VyIGN1cnJlbnQgbGluZVxuICAgIGN1cnJlbnRMaW5lVG9rZW5zID0gY3VycmVudExpbmUudHJpbSgpLnNwbGl0KC9cXHMrLylcbiAgICAvLyB2ZXJ0ZXggcG9zaXRpb24sIHZlcnRleCB0ZXh0dXJlLCBvciB2ZXJ0ZXggbm9ybWFsXG4gICAgdmVydGV4SW5mb1R5cGUgPSB2ZXJ0ZXhJbmZvTmFtZU1hcFtjdXJyZW50TGluZVRva2Vuc1swXV1cblxuICAgIGlmICh2ZXJ0ZXhJbmZvVHlwZSkge1xuICAgICAgZm9yIChrID0gMTsgayA8IGN1cnJlbnRMaW5lVG9rZW5zLmxlbmd0aDsgaysrKSB7XG4gICAgICAgIHBhcnNlZEpTT05bdmVydGV4SW5mb1R5cGVdLnB1c2gocGFyc2VGbG9hdChjdXJyZW50TGluZVRva2Vuc1trXSkpXG4gICAgICB9XG4gICAgICBjb250aW51ZVxuICAgIH1cblxuICAgIGlmIChjdXJyZW50TGluZVRva2Vuc1swXSA9PT0gJ2YnKSB7XG4gICAgICAvLyBHZXQgb3VyIDQgc2V0cyBvZiB2ZXJ0ZXgsIHV2LCBhbmQgbm9ybWFsIGluZGljZXMgZm9yIHRoaXMgZmFjZVxuICAgICAgZm9yIChrID0gMTsgayA8IDU7IGsrKykge1xuICAgICAgICAvLyBJZiB0aGVyZSBpcyBubyBmb3VydGggZmFjZSBlbnRyeSB0aGVuIHRoaXMgaXMgc3BlY2lmeWluZyBhIHRyaWFuZ2xlXG4gICAgICAgIC8vIGluIHRoaXMgY2FzZSB3ZSBwdXNoIGAtMWBcbiAgICAgICAgLy8gQ29uc3VtZXJzIG9mIHRoaXMgbW9kdWxlIHNob3VsZCBjaGVjayBmb3IgYC0xYCBiZWZvcmUgZXhwYW5kaW5nIGZhY2UgZGF0YVxuICAgICAgICBpZiAoayA9PT0gNCAmJiAhY3VycmVudExpbmVUb2tlbnNbNF0pIHtcbiAgICAgICAgICBwYXJzZWRKU09OLnZlcnRleFBvc2l0aW9uSW5kaWNlcy5wdXNoKC0xKVxuICAgICAgICAgIHBhcnNlZEpTT04udmVydGV4VVZJbmRpY2VzLnB1c2goLTEpXG4gICAgICAgICAgcGFyc2VkSlNPTi52ZXJ0ZXhOb3JtYWxJbmRpY2VzLnB1c2goLTEpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdmFyIGluZGljZXMgPSBjdXJyZW50TGluZVRva2Vuc1trXS5zcGxpdCgnLycpXG4gICAgICAgICAgcGFyc2VkSlNPTi52ZXJ0ZXhQb3NpdGlvbkluZGljZXMucHVzaChwYXJzZUludChpbmRpY2VzWzBdLCAxMCkgLSAxKSAvLyBXZSB6ZXJvIGluZGV4XG4gICAgICAgICAgcGFyc2VkSlNPTi52ZXJ0ZXhVVkluZGljZXMucHVzaChwYXJzZUludChpbmRpY2VzWzFdLCAxMCkgLSAxKSAvLyBvdXIgZmFjZSBpbmRpY2VzXG4gICAgICAgICAgcGFyc2VkSlNPTi52ZXJ0ZXhOb3JtYWxJbmRpY2VzLnB1c2gocGFyc2VJbnQoaW5kaWNlc1syXSwgMTApIC0gMSkgLy8gYnkgc3VidHJhY3RpbmcgMVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHBhcnNlZEpTT05cbn1cbiIsIlwidXNlIHN0cmljdFwiO1xuXG4vLyBiYXNlZCBvbiBodHRwczovL2dpdGh1Yi5jb20va2NoYXBlbGllci9wcm9jamFtMjAxNS9ibG9iL21hc3Rlci9zcmMvdXRpbHMvbWVzaGVzL2NvbXB1dGUtdmVydGV4LW5vcm1hbHMuanNcbi8vIHdoaWNoIGl0c2VsZiBpcyBhIHJld3JpdGUgb2YgVGhyZWUuanMgZnVuY3Rpb24gdG8gY29tcHV0ZSBub3JtYWxzXG5cbnZhciBub3JtYWxpemVOb3JtYWxzID0gZnVuY3Rpb24gbm9ybWFsaXplTm9ybWFscyAobm9ybWFscykge1xuICAgIHZhciBpLCB4LCB5LCB6LCBuO1xuXG4gICAgZm9yIChpID0gMDsgaSA8IG5vcm1hbHMubGVuZ3RoOyBpKz0gMykge1xuICAgICAgICB4ID0gbm9ybWFsc1tpXTtcbiAgICAgICAgeSA9IG5vcm1hbHNbaSArIDFdO1xuICAgICAgICB6ID0gbm9ybWFsc1tpICsgMl07XG5cbiAgICAgICAgbiA9IDEuMCAvIE1hdGguc3FydCh4ICogeCArIHkgKiB5ICsgeiAqIHopO1xuXG4gICAgICAgIG5vcm1hbHNbaV0qPSBuO1xuICAgICAgICBub3JtYWxzW2kgKyAxXSo9IG47XG4gICAgICAgIG5vcm1hbHNbaSArIDJdKj0gbjtcbiAgICB9XG59O1xuXG52YXIgY29tcHV0ZVZlcnRleE5vcm1hbHMgPSBmdW5jdGlvbiBjb21wdXRlVmVydGV4Tm9ybWFscyAoaW5kaWNlcywgcG9zaXRpb25zLCBub3JtYWxzKSB7XG4gICAgdmFyIHBBID0gWzAsMCwwXSxcbiAgICAgICAgcEIgPSBbMCwwLDBdLFxuICAgICAgICBwQyA9IFswLDAsMF0sXG4gICAgICAgIGNiID0gWzAsMCwwXSxcbiAgICAgICAgYWIgPSBbMCwwLDBdLFxuICAgICAgICB2QSxcbiAgICAgICAgdkIsXG4gICAgICAgIHZDLFxuICAgICAgICBjYngsXG4gICAgICAgIGNieSxcbiAgICAgICAgY2J6LFxuICAgICAgICBpO1xuXG4gICAgbm9ybWFscy5sZW5ndGggPSBwb3NpdGlvbnMubGVuZ3RoO1xuXG4gICAgZm9yIChpID0gMDsgaSA8IG5vcm1hbHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgbm9ybWFsc1tpXSA9IDA7XG4gICAgfVxuXG4gICAgaWYgKGluZGljZXMpIHtcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGluZGljZXMubGVuZ3RoOyBpICs9IDMpIHtcblxuICAgICAgICAgICAgdkEgPSBpbmRpY2VzW2ldICogMztcbiAgICAgICAgICAgIHZCID0gaW5kaWNlc1tpICsgMV0gKiAzO1xuICAgICAgICAgICAgdkMgPSBpbmRpY2VzW2kgKyAyXSAqIDM7XG5cbiAgICAgICAgICAgIC8qXG4gICAgICAgICAgICAgcEEuZnJvbUFycmF5KCBwb3NpdGlvbnMsIHZBICk7XG4gICAgICAgICAgICAgcEIuZnJvbUFycmF5KCBwb3NpdGlvbnMsIHZCICk7XG4gICAgICAgICAgICAgcEMuZnJvbUFycmF5KCBwb3NpdGlvbnMsIHZDICk7XG4gICAgICAgICAgICAgKi9cblxuICAgICAgICAgICAgcEFbMF0gPSBwb3NpdGlvbnNbdkFdO1xuICAgICAgICAgICAgcEFbMV0gPSBwb3NpdGlvbnNbdkEgKyAxXTtcbiAgICAgICAgICAgIHBBWzJdID0gcG9zaXRpb25zW3ZBICsgMl07XG5cbiAgICAgICAgICAgIHBCWzBdID0gcG9zaXRpb25zW3ZCXTtcbiAgICAgICAgICAgIHBCWzFdID0gcG9zaXRpb25zW3ZCICsgMV07XG4gICAgICAgICAgICBwQlsyXSA9IHBvc2l0aW9uc1t2QiArIDJdO1xuXG4gICAgICAgICAgICBwQ1swXSA9IHBvc2l0aW9uc1t2Q107XG4gICAgICAgICAgICBwQ1sxXSA9IHBvc2l0aW9uc1t2QyArIDFdO1xuICAgICAgICAgICAgcENbMl0gPSBwb3NpdGlvbnNbdkMgKyAyXTtcblxuICAgICAgICAgICAgLypcbiAgICAgICAgICAgICBjYi5zdWJWZWN0b3JzKCBwQywgcEIgKTtcbiAgICAgICAgICAgICBhYi5zdWJWZWN0b3JzKCBwQSwgcEIgKTtcbiAgICAgICAgICAgICAqL1xuXG4gICAgICAgICAgICBjYlswXSA9IHBDWzBdIC0gcEJbMF07XG4gICAgICAgICAgICBjYlsxXSA9IHBDWzFdIC0gcEJbMV07XG4gICAgICAgICAgICBjYlsyXSA9IHBDWzJdIC0gcEJbMl07XG5cbiAgICAgICAgICAgIGFiWzBdID0gcEFbMF0gLSBwQlswXTtcbiAgICAgICAgICAgIGFiWzFdID0gcEFbMV0gLSBwQlsxXTtcbiAgICAgICAgICAgIGFiWzJdID0gcEFbMl0gLSBwQlsyXTtcblxuICAgICAgICAgICAgLypcbiAgICAgICAgICAgICBjYi5jcm9zcyggYWIgKTtcbiAgICAgICAgICAgICAqL1xuXG4gICAgICAgICAgICBjYnggPSBjYlswXTtcbiAgICAgICAgICAgIGNieSA9IGNiWzFdO1xuICAgICAgICAgICAgY2J6ID0gY2JbMl07XG5cbiAgICAgICAgICAgIGNiWzBdID0gY2J5ICogYWJbMl0gLSBjYnogKiBhYlsxXTtcbiAgICAgICAgICAgIGNiWzFdID0gY2J6ICogYWJbMF0gLSBjYnggKiBhYlsyXTtcbiAgICAgICAgICAgIGNiWzJdID0gY2J4ICogYWJbMV0gLSBjYnkgKiBhYlswXTtcblxuICAgICAgICAgICAgbm9ybWFsc1t2QV0gKz0gY2JbMF07XG4gICAgICAgICAgICBub3JtYWxzW3ZBICsgMV0gKz0gY2JbMV07XG4gICAgICAgICAgICBub3JtYWxzW3ZBICsgMl0gKz0gY2JbMl07XG5cbiAgICAgICAgICAgIG5vcm1hbHNbdkJdICs9IGNiWzBdO1xuICAgICAgICAgICAgbm9ybWFsc1t2QiArIDFdICs9IGNiWzFdO1xuICAgICAgICAgICAgbm9ybWFsc1t2QiArIDJdICs9IGNiWzJdO1xuXG4gICAgICAgICAgICBub3JtYWxzW3ZDXSArPSBjYlswXTtcbiAgICAgICAgICAgIG5vcm1hbHNbdkMgKyAxXSArPSBjYlsxXTtcbiAgICAgICAgICAgIG5vcm1hbHNbdkMgKyAyXSArPSBjYlsyXTtcblxuICAgICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IHBvc2l0aW9ucy5sZW5ndGg7IGkgKz0gOSkge1xuXG4gICAgICAgICAgICAvKlxuICAgICAgICAgICAgIHBBLmZyb21BcnJheSggcG9zaXRpb25zLCBpICk7XG4gICAgICAgICAgICAgcEIuZnJvbUFycmF5KCBwb3NpdGlvbnMsIGkgKyAzICk7XG4gICAgICAgICAgICAgcEMuZnJvbUFycmF5KCBwb3NpdGlvbnMsIGkgKyA2ICk7XG4gICAgICAgICAgICAgKi9cblxuICAgICAgICAgICAgcEFbMF0gPSBwb3NpdGlvbnNbaV07XG4gICAgICAgICAgICBwQVsxXSA9IHBvc2l0aW9uc1tpICsgMV07XG4gICAgICAgICAgICBwQVsyXSA9IHBvc2l0aW9uc1tpICsgMl07XG5cbiAgICAgICAgICAgIHBCWzBdID0gcG9zaXRpb25zW2kgKyAzXTtcbiAgICAgICAgICAgIHBCWzFdID0gcG9zaXRpb25zW2kgKyA0XTtcbiAgICAgICAgICAgIHBCWzJdID0gcG9zaXRpb25zW2kgKyA1XTtcblxuICAgICAgICAgICAgcENbMF0gPSBwb3NpdGlvbnNbaSArIDZdO1xuICAgICAgICAgICAgcENbMV0gPSBwb3NpdGlvbnNbaSArIDddO1xuICAgICAgICAgICAgcENbMl0gPSBwb3NpdGlvbnNbaSArIDhdO1xuXG4gICAgICAgICAgICAvKlxuICAgICAgICAgICAgIGNiLnN1YlZlY3RvcnMoIHBDLCBwQiApO1xuICAgICAgICAgICAgIGFiLnN1YlZlY3RvcnMoIHBBLCBwQiApO1xuICAgICAgICAgICAgICovXG5cbiAgICAgICAgICAgIGNiWzBdID0gcENbMF0gLSBwQlswXTtcbiAgICAgICAgICAgIGNiWzFdID0gcENbMV0gLSBwQlsxXTtcbiAgICAgICAgICAgIGNiWzJdID0gcENbMl0gLSBwQlsyXTtcblxuICAgICAgICAgICAgYWJbMF0gPSBwQVswXSAtIHBCWzBdO1xuICAgICAgICAgICAgYWJbMV0gPSBwQVsxXSAtIHBCWzFdO1xuICAgICAgICAgICAgYWJbMl0gPSBwQVsyXSAtIHBCWzJdO1xuXG4gICAgICAgICAgICAvKlxuICAgICAgICAgICAgIGNiLmNyb3NzKCBhYiApO1xuICAgICAgICAgICAgICovXG5cbiAgICAgICAgICAgIGNieCA9IGNiWzBdO1xuICAgICAgICAgICAgY2J5ID0gY2JbMV07XG4gICAgICAgICAgICBjYnogPSBjYlsyXTtcblxuICAgICAgICAgICAgY2JbMF0gPSBjYnkgKiBhYlsyXSAtIGNieiAqIGFiWzFdO1xuICAgICAgICAgICAgY2JbMV0gPSBjYnogKiBhYlswXSAtIGNieCAqIGFiWzJdO1xuICAgICAgICAgICAgY2JbMl0gPSBjYnggKiBhYlsxXSAtIGNieSAqIGFiWzBdO1xuXG4gICAgICAgICAgICBub3JtYWxzWyBpIF0gPSBjYlswXTtcbiAgICAgICAgICAgIG5vcm1hbHNbIGkgKyAxIF0gPSBjYlsxXTtcbiAgICAgICAgICAgIG5vcm1hbHNbIGkgKyAyIF0gPSBjYlsyXTtcblxuICAgICAgICAgICAgbm9ybWFsc1sgaSArIDMgXSA9IGNiWzBdO1xuICAgICAgICAgICAgbm9ybWFsc1sgaSArIDQgXSA9IGNiWzFdO1xuICAgICAgICAgICAgbm9ybWFsc1sgaSArIDUgXSA9IGNiWzJdO1xuXG4gICAgICAgICAgICBub3JtYWxzWyBpICsgNiBdID0gY2JbMF07XG4gICAgICAgICAgICBub3JtYWxzWyBpICsgNyBdID0gY2JbMV07XG4gICAgICAgICAgICBub3JtYWxzWyBpICsgOCBdID0gY2JbMl07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBub3JtYWxpemVOb3JtYWxzKG5vcm1hbHMpO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBjb21wdXRlVmVydGV4Tm9ybWFscztcbiJdfQ==
