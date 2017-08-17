!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.obj2prwm=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";

var objParser = require('wavefront-obj-parser'),
    computeNormals = require('./utils/compute-normals'),
    prwm = require('prwm');

function serializeIndexed (objData, usePositions, useNormals, useUvs) {
    var nbPolygons = objData.vertexIndex.length / 4, // the parser always return indices by group of 4 to support quads
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

    var mustGenerateNewNormals = useNormals && (!objData.normal|| objData.normal.length === 0);

    for (i = 0; i < nbPolygons; i++) {
        for (k = 0; k < 3; k++) { // assume we don't have actual quads in the models
            vertexIndex = objData.vertexIndex[i * 4 + k];
            normalIndex = objData.normalIndex[i * 4 + k];
            uvIndex = objData.uvIndex[i * 4 + k];

            mapped = (usePositions ? vertexIndex + ':' : ':') + (useNormals ? normalIndex + ':' : ':') + (useUvs ? uvIndex + ':' : ':');

            index = indicesMapping[mapped];

            if (typeof index === 'undefined') {
                index = nextIndex;
                indicesMapping[mapped] = index;
                nextIndex++;

                if (usePositions) {
                    vertices.push(
                        objData.vertex[vertexIndex * 3],
                        objData.vertex[vertexIndex * 3 + 1],
                        objData.vertex[vertexIndex * 3 + 2]
                    );
                }

                if (useNormals && !mustGenerateNewNormals) {
                    normals.push(
                        objData.normal[normalIndex * 3],
                        objData.normal[normalIndex * 3 + 1],
                        objData.normal[normalIndex * 3 + 2]
                    );
                }

                if (useUvs) {
                    uvs.push(
                        objData.uv[uvIndex * 2],
                        objData.uv[uvIndex * 2 + 1]
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
    var nbPolygons = objData.vertexIndex.length / 4, // the parser always return indices by group of 4 to support quads
        vertices = [],
        normals = [],
        uvs = [],
        i,
        k,
        vertexIndex,
        normalIndex,
        uvIndex;

    var mustGenerateNewNormals = useNormals && (!objData.normal|| objData.normal.length === 0);

    for (i = 0; i < nbPolygons; i++) {
        for (k = 0; k < 3; k++) { // assume we don't have actual quads in the models
            if (usePositions) {
                vertexIndex = objData.vertexIndex[i * 4 + k];

                vertices.push(
                    objData.vertex[vertexIndex * 3],
                    objData.vertex[vertexIndex * 3 + 1],
                    objData.vertex[vertexIndex * 3 + 2]
                );
            }

            if (useNormals && !mustGenerateNewNormals) {
                normalIndex = objData.normalIndex[i * 4 + k];

                normals.push(
                    objData.normal[normalIndex * 3],
                    objData.normal[normalIndex * 3 + 1],
                    objData.normal[normalIndex * 3 + 2]
                );
            }

            if (useUvs) {
                uvIndex = objData.uvIndex[i * 4 + k];

                uvs.push(
                    objData.uv[uvIndex * 2],
                    objData.uv[uvIndex * 2 + 1]
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
var vertexInfoNameMap = {v: 'vertex', vt: 'uv', vn: 'normal'}

function ParseWavefrontObj (wavefrontString) {
  'use strict'

  var parsedJSON = {normal: [], uv: [], vertex: [], normalIndex: [], uvIndex: [], vertexIndex: []}

  var linesInWavefrontObj = wavefrontString.split('\n')

  var currentLine, currentLineTokens, vertexInfoType, i, k

  // Loop through and parse every line in our .obj file
  for (i = 0; i < linesInWavefrontObj.length; i++) {
    currentLine = linesInWavefrontObj[i]
    // Tokenize our current line
    currentLineTokens = currentLine.split(' ')
    // vertex position, vertex texture, or vertex normal
    vertexInfoType = vertexInfoNameMap[currentLineTokens[0]]

    if (vertexInfoType) {
      for (k = 1; k < currentLineTokens.length; k++) {
        if (currentLineTokens[k] !== '') {
          parsedJSON[vertexInfoType].push(parseFloat(currentLineTokens[k]))
        }
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
          parsedJSON.vertexIndex.push(-1)
          parsedJSON.uvIndex.push(-1)
          parsedJSON.normalIndex.push(-1)
        } else {
          var indices = currentLineTokens[k].split('/')
          parsedJSON.vertexIndex.push(parseInt(indices[0], 10) - 1) // We zero index
          parsedJSON.uvIndex.push(parseInt(indices[1], 10) - 1) // our face indices
          parsedJSON.normalIndex.push(parseInt(indices[2], 10) - 1) // by subtracting 1
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uL3Vzci9sb2NhbC9saWIvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsImluZGV4LmpzIiwibm9kZV9tb2R1bGVzL3Byd20vaW5kZXguanMiLCJub2RlX21vZHVsZXMvcHJ3bS9wcndtL2F0dHJpYnV0ZS10eXBlcy5qcyIsIm5vZGVfbW9kdWxlcy9wcndtL3Byd20vZGVjb2RlLmpzIiwibm9kZV9tb2R1bGVzL3Byd20vcHJ3bS9lbmNvZGUuanMiLCJub2RlX21vZHVsZXMvcHJ3bS91dGlscy9pcy1iaWctZW5kaWFuLXBsYXRmb3JtLmpzIiwibm9kZV9tb2R1bGVzL3dhdmVmcm9udC1vYmotcGFyc2VyL3NyYy93YXZlZnJvbnQtb2JqLXBhcnNlci5qcyIsInV0aWxzL2NvbXB1dGUtbm9ybWFscy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUxBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIG9ialBhcnNlciA9IHJlcXVpcmUoJ3dhdmVmcm9udC1vYmotcGFyc2VyJyksXG4gICAgY29tcHV0ZU5vcm1hbHMgPSByZXF1aXJlKCcuL3V0aWxzL2NvbXB1dGUtbm9ybWFscycpLFxuICAgIHByd20gPSByZXF1aXJlKCdwcndtJyk7XG5cbmZ1bmN0aW9uIHNlcmlhbGl6ZUluZGV4ZWQgKG9iakRhdGEsIHVzZVBvc2l0aW9ucywgdXNlTm9ybWFscywgdXNlVXZzKSB7XG4gICAgdmFyIG5iUG9seWdvbnMgPSBvYmpEYXRhLnZlcnRleEluZGV4Lmxlbmd0aCAvIDQsIC8vIHRoZSBwYXJzZXIgYWx3YXlzIHJldHVybiBpbmRpY2VzIGJ5IGdyb3VwIG9mIDQgdG8gc3VwcG9ydCBxdWFkc1xuICAgICAgICBpbmRpY2VzTWFwcGluZyA9IHt9LFxuICAgICAgICBpbmRpY2VzID0gW10sXG4gICAgICAgIHZlcnRpY2VzID0gW10sXG4gICAgICAgIG5vcm1hbHMgPSBbXSxcbiAgICAgICAgdXZzID0gW10sXG4gICAgICAgIGksXG4gICAgICAgIGssXG4gICAgICAgIHZlcnRleEluZGV4LFxuICAgICAgICBub3JtYWxJbmRleCxcbiAgICAgICAgdXZJbmRleCxcbiAgICAgICAgbWFwcGVkLFxuICAgICAgICBpbmRleCxcbiAgICAgICAgbmV4dEluZGV4ID0gMDtcblxuICAgIHZhciBtdXN0R2VuZXJhdGVOZXdOb3JtYWxzID0gdXNlTm9ybWFscyAmJiAoIW9iakRhdGEubm9ybWFsfHwgb2JqRGF0YS5ub3JtYWwubGVuZ3RoID09PSAwKTtcblxuICAgIGZvciAoaSA9IDA7IGkgPCBuYlBvbHlnb25zOyBpKyspIHtcbiAgICAgICAgZm9yIChrID0gMDsgayA8IDM7IGsrKykgeyAvLyBhc3N1bWUgd2UgZG9uJ3QgaGF2ZSBhY3R1YWwgcXVhZHMgaW4gdGhlIG1vZGVsc1xuICAgICAgICAgICAgdmVydGV4SW5kZXggPSBvYmpEYXRhLnZlcnRleEluZGV4W2kgKiA0ICsga107XG4gICAgICAgICAgICBub3JtYWxJbmRleCA9IG9iakRhdGEubm9ybWFsSW5kZXhbaSAqIDQgKyBrXTtcbiAgICAgICAgICAgIHV2SW5kZXggPSBvYmpEYXRhLnV2SW5kZXhbaSAqIDQgKyBrXTtcblxuICAgICAgICAgICAgbWFwcGVkID0gKHVzZVBvc2l0aW9ucyA/IHZlcnRleEluZGV4ICsgJzonIDogJzonKSArICh1c2VOb3JtYWxzID8gbm9ybWFsSW5kZXggKyAnOicgOiAnOicpICsgKHVzZVV2cyA/IHV2SW5kZXggKyAnOicgOiAnOicpO1xuXG4gICAgICAgICAgICBpbmRleCA9IGluZGljZXNNYXBwaW5nW21hcHBlZF07XG5cbiAgICAgICAgICAgIGlmICh0eXBlb2YgaW5kZXggPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICAgICAgaW5kZXggPSBuZXh0SW5kZXg7XG4gICAgICAgICAgICAgICAgaW5kaWNlc01hcHBpbmdbbWFwcGVkXSA9IGluZGV4O1xuICAgICAgICAgICAgICAgIG5leHRJbmRleCsrO1xuXG4gICAgICAgICAgICAgICAgaWYgKHVzZVBvc2l0aW9ucykge1xuICAgICAgICAgICAgICAgICAgICB2ZXJ0aWNlcy5wdXNoKFxuICAgICAgICAgICAgICAgICAgICAgICAgb2JqRGF0YS52ZXJ0ZXhbdmVydGV4SW5kZXggKiAzXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG9iakRhdGEudmVydGV4W3ZlcnRleEluZGV4ICogMyArIDFdLFxuICAgICAgICAgICAgICAgICAgICAgICAgb2JqRGF0YS52ZXJ0ZXhbdmVydGV4SW5kZXggKiAzICsgMl1cbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAodXNlTm9ybWFscyAmJiAhbXVzdEdlbmVyYXRlTmV3Tm9ybWFscykge1xuICAgICAgICAgICAgICAgICAgICBub3JtYWxzLnB1c2goXG4gICAgICAgICAgICAgICAgICAgICAgICBvYmpEYXRhLm5vcm1hbFtub3JtYWxJbmRleCAqIDNdLFxuICAgICAgICAgICAgICAgICAgICAgICAgb2JqRGF0YS5ub3JtYWxbbm9ybWFsSW5kZXggKiAzICsgMV0sXG4gICAgICAgICAgICAgICAgICAgICAgICBvYmpEYXRhLm5vcm1hbFtub3JtYWxJbmRleCAqIDMgKyAyXVxuICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICh1c2VVdnMpIHtcbiAgICAgICAgICAgICAgICAgICAgdXZzLnB1c2goXG4gICAgICAgICAgICAgICAgICAgICAgICBvYmpEYXRhLnV2W3V2SW5kZXggKiAyXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG9iakRhdGEudXZbdXZJbmRleCAqIDIgKyAxXVxuICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaW5kaWNlcy5wdXNoKGluZGV4KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmIChtdXN0R2VuZXJhdGVOZXdOb3JtYWxzKSB7XG4gICAgICAgIGNvbXB1dGVOb3JtYWxzKGluZGljZXMsIHZlcnRpY2VzLCBub3JtYWxzKTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBpbmRpY2VzOiBpbmRpY2VzLFxuICAgICAgICB2ZXJ0aWNlczogdmVydGljZXMsXG4gICAgICAgIG5vcm1hbHM6IG5vcm1hbHMsXG4gICAgICAgIHV2czogdXZzXG4gICAgfTtcbn1cblxuZnVuY3Rpb24gc2VyaWFsaXplTm9uSW5kZXhlZCAob2JqRGF0YSwgdXNlUG9zaXRpb25zLCB1c2VOb3JtYWxzLCB1c2VVdnMpIHtcbiAgICB2YXIgbmJQb2x5Z29ucyA9IG9iakRhdGEudmVydGV4SW5kZXgubGVuZ3RoIC8gNCwgLy8gdGhlIHBhcnNlciBhbHdheXMgcmV0dXJuIGluZGljZXMgYnkgZ3JvdXAgb2YgNCB0byBzdXBwb3J0IHF1YWRzXG4gICAgICAgIHZlcnRpY2VzID0gW10sXG4gICAgICAgIG5vcm1hbHMgPSBbXSxcbiAgICAgICAgdXZzID0gW10sXG4gICAgICAgIGksXG4gICAgICAgIGssXG4gICAgICAgIHZlcnRleEluZGV4LFxuICAgICAgICBub3JtYWxJbmRleCxcbiAgICAgICAgdXZJbmRleDtcblxuICAgIHZhciBtdXN0R2VuZXJhdGVOZXdOb3JtYWxzID0gdXNlTm9ybWFscyAmJiAoIW9iakRhdGEubm9ybWFsfHwgb2JqRGF0YS5ub3JtYWwubGVuZ3RoID09PSAwKTtcblxuICAgIGZvciAoaSA9IDA7IGkgPCBuYlBvbHlnb25zOyBpKyspIHtcbiAgICAgICAgZm9yIChrID0gMDsgayA8IDM7IGsrKykgeyAvLyBhc3N1bWUgd2UgZG9uJ3QgaGF2ZSBhY3R1YWwgcXVhZHMgaW4gdGhlIG1vZGVsc1xuICAgICAgICAgICAgaWYgKHVzZVBvc2l0aW9ucykge1xuICAgICAgICAgICAgICAgIHZlcnRleEluZGV4ID0gb2JqRGF0YS52ZXJ0ZXhJbmRleFtpICogNCArIGtdO1xuXG4gICAgICAgICAgICAgICAgdmVydGljZXMucHVzaChcbiAgICAgICAgICAgICAgICAgICAgb2JqRGF0YS52ZXJ0ZXhbdmVydGV4SW5kZXggKiAzXSxcbiAgICAgICAgICAgICAgICAgICAgb2JqRGF0YS52ZXJ0ZXhbdmVydGV4SW5kZXggKiAzICsgMV0sXG4gICAgICAgICAgICAgICAgICAgIG9iakRhdGEudmVydGV4W3ZlcnRleEluZGV4ICogMyArIDJdXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHVzZU5vcm1hbHMgJiYgIW11c3RHZW5lcmF0ZU5ld05vcm1hbHMpIHtcbiAgICAgICAgICAgICAgICBub3JtYWxJbmRleCA9IG9iakRhdGEubm9ybWFsSW5kZXhbaSAqIDQgKyBrXTtcblxuICAgICAgICAgICAgICAgIG5vcm1hbHMucHVzaChcbiAgICAgICAgICAgICAgICAgICAgb2JqRGF0YS5ub3JtYWxbbm9ybWFsSW5kZXggKiAzXSxcbiAgICAgICAgICAgICAgICAgICAgb2JqRGF0YS5ub3JtYWxbbm9ybWFsSW5kZXggKiAzICsgMV0sXG4gICAgICAgICAgICAgICAgICAgIG9iakRhdGEubm9ybWFsW25vcm1hbEluZGV4ICogMyArIDJdXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHVzZVV2cykge1xuICAgICAgICAgICAgICAgIHV2SW5kZXggPSBvYmpEYXRhLnV2SW5kZXhbaSAqIDQgKyBrXTtcblxuICAgICAgICAgICAgICAgIHV2cy5wdXNoKFxuICAgICAgICAgICAgICAgICAgICBvYmpEYXRhLnV2W3V2SW5kZXggKiAyXSxcbiAgICAgICAgICAgICAgICAgICAgb2JqRGF0YS51dlt1dkluZGV4ICogMiArIDFdXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmIChtdXN0R2VuZXJhdGVOZXdOb3JtYWxzKSB7XG4gICAgICAgIGNvbXB1dGVOb3JtYWxzKG51bGwsIHZlcnRpY2VzLCBub3JtYWxzKTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBpbmRpY2VzOiBudWxsLFxuICAgICAgICB2ZXJ0aWNlczogdmVydGljZXMsXG4gICAgICAgIG5vcm1hbHM6IG5vcm1hbHMsXG4gICAgICAgIHV2czogdXZzXG4gICAgfTtcbn1cblxudmFyIG5iVmVydGljZXMgPSBudWxsO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBjb252ZXJ0OiBmdW5jdGlvbiAob2JqU3RyaW5nLCBvcHRpb25zKSB7XG4gICAgICAgIHZhciBsb2cgPSBvcHRpb25zLnF1aWV0ID8gZnVuY3Rpb24gbm9vcCgpIHt9IDogZnVuY3Rpb24gbG9nKHMpIHsgY29uc29sZS5sb2cocykgfTtcblxuICAgICAgICBsb2coJyAqIFBhcnNpbmcgV2F2ZUZyb250IE9CSiBkYXRhJyk7XG4gICAgICAgIHZhciBvYmpEYXRhID0gb2JqUGFyc2VyKG9ialN0cmluZyk7XG5cbiAgICAgICAgbG9nKCcgKiBGb3JtYXR0aW5nIGRhdGEnKTtcbiAgICAgICAgdmFyIHNlcmlhbGl6ZWQgPSBvcHRpb25zLmluZGV4ZWQgPyBzZXJpYWxpemVJbmRleGVkKG9iakRhdGEsIG9wdGlvbnMucG9zaXRpb25zLCBvcHRpb25zLm5vcm1hbHMsIG9wdGlvbnMudXZzKSA6IHNlcmlhbGl6ZU5vbkluZGV4ZWQob2JqRGF0YSwgb3B0aW9ucy5wb3NpdGlvbnMsIG9wdGlvbnMubm9ybWFscywgb3B0aW9ucy51dnMpO1xuXG4gICAgICAgIHZhciBhdHRyaWJ1dGVzID0ge307XG5cbiAgICAgICAgbmJWZXJ0aWNlcyA9IDA7XG5cbiAgICAgICAgaWYgKG9wdGlvbnMucG9zaXRpb25zKSB7XG4gICAgICAgICAgICBhdHRyaWJ1dGVzWydwb3NpdGlvbiddID0geyBjYXJkaW5hbGl0eTogMywgbm9ybWFsaXplZDogZmFsc2UsIHZhbHVlczogbmV3IEZsb2F0MzJBcnJheShzZXJpYWxpemVkLnZlcnRpY2VzKSB9O1xuICAgICAgICAgICAgbmJWZXJ0aWNlcyA9IHNlcmlhbGl6ZWQudmVydGljZXMubGVuZ3RoIC8gMztcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChvcHRpb25zLm5vcm1hbHMpIHtcbiAgICAgICAgICAgIGF0dHJpYnV0ZXNbJ25vcm1hbCddID0geyBjYXJkaW5hbGl0eTogMywgbm9ybWFsaXplZDogZmFsc2UsIHZhbHVlczogbmV3IEZsb2F0MzJBcnJheShzZXJpYWxpemVkLm5vcm1hbHMpIH07XG4gICAgICAgICAgICBuYlZlcnRpY2VzID0gc2VyaWFsaXplZC5ub3JtYWxzLmxlbmd0aCAvIDM7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAob3B0aW9ucy51dnMpIHtcbiAgICAgICAgICAgIGF0dHJpYnV0ZXNbJ3V2J10gPSB7IGNhcmRpbmFsaXR5OiAyLCBub3JtYWxpemVkOiBmYWxzZSwgdmFsdWVzOiBuZXcgRmxvYXQzMkFycmF5KHNlcmlhbGl6ZWQudXZzKSB9O1xuICAgICAgICAgICAgbmJWZXJ0aWNlcyA9IHNlcmlhbGl6ZWQudXZzLmxlbmd0aCAvIDI7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcHJ3bS5lbmNvZGUoXG4gICAgICAgICAgICBhdHRyaWJ1dGVzLFxuICAgICAgICAgICAgc2VyaWFsaXplZC5pbmRpY2VzID8gKG5iVmVydGljZXMgPiAweEZGRkYgPyBuZXcgVWludDMyQXJyYXkoc2VyaWFsaXplZC5pbmRpY2VzKSA6IG5ldyBVaW50MTZBcnJheShzZXJpYWxpemVkLmluZGljZXMpKSA6IG51bGwsXG4gICAgICAgICAgICBvcHRpb25zLmJpZ0VuZGlhblxuICAgICAgICApO1xuICAgIH0sXG4gICAgZ2V0TnVtYmVyT2ZWZXJ0aWNlczogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gbmJWZXJ0aWNlcztcbiAgICB9XG59O1xuXG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIGF0dHJpYnV0ZVR5cGVzID0gcmVxdWlyZSgnLi9wcndtL2F0dHJpYnV0ZS10eXBlcycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICB2ZXJzaW9uOiAxLFxuICAgIEludDogYXR0cmlidXRlVHlwZXMuSW50LFxuICAgIEZsb2F0OiBhdHRyaWJ1dGVUeXBlcy5GbG9hdCxcbiAgICBpc0JpZ0VuZGlhblBsYXRmb3JtOiByZXF1aXJlKCcuL3V0aWxzL2lzLWJpZy1lbmRpYW4tcGxhdGZvcm0nKSxcbiAgICBlbmNvZGU6IHJlcXVpcmUoJy4vcHJ3bS9lbmNvZGUnKSxcbiAgICBkZWNvZGU6IHJlcXVpcmUoJy4vcHJ3bS9kZWNvZGUnKVxufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBGbG9hdDogMCxcbiAgICBJbnQ6IDFcbn07XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIGlzQmlnRW5kaWFuUGxhdGZvcm0gPSByZXF1aXJlKCcuLi91dGlscy9pcy1iaWctZW5kaWFuLXBsYXRmb3JtJyk7XG5cbi8vIG1hdGNoIHRoZSB2YWx1ZXMgZGVmaW5lZCBpbiB0aGUgc3BlYyB0byB0aGUgVHlwZWRBcnJheSB0eXBlc1xudmFyIEludmVydGVkRW5jb2RpbmdUeXBlcyA9IFtcbiAgICBudWxsLFxuICAgIEZsb2F0MzJBcnJheSxcbiAgICBudWxsLFxuICAgIEludDhBcnJheSxcbiAgICBJbnQxNkFycmF5LFxuICAgIG51bGwsXG4gICAgSW50MzJBcnJheSxcbiAgICBVaW50OEFycmF5LFxuICAgIFVpbnQxNkFycmF5LFxuICAgIG51bGwsXG4gICAgVWludDMyQXJyYXlcbl07XG5cbi8vIGRlZmluZSB0aGUgbWV0aG9kIHRvIHVzZSBvbiBhIERhdGFWaWV3LCBjb3JyZXNwb25kaW5nIHRoZSBUeXBlZEFycmF5IHR5cGVcbnZhciBnZXRNZXRob2RzID0ge1xuICAgIFVpbnQxNkFycmF5OiAnZ2V0VWludDE2JyxcbiAgICBVaW50MzJBcnJheTogJ2dldFVpbnQzMicsXG4gICAgSW50MTZBcnJheTogJ2dldEludDE2JyxcbiAgICBJbnQzMkFycmF5OiAnZ2V0SW50MzInLFxuICAgIEZsb2F0MzJBcnJheTogJ2dldEZsb2F0MzInXG59O1xuXG5mdW5jdGlvbiBjb3B5RnJvbUJ1ZmZlciAoc291cmNlQXJyYXlCdWZmZXIsIHZpZXdUeXBlLCBwb3NpdGlvbiwgbGVuZ3RoLCBmcm9tQmlnRW5kaWFuKSB7XG4gICAgdmFyIGJ5dGVzUGVyRWxlbWVudCA9IHZpZXdUeXBlLkJZVEVTX1BFUl9FTEVNRU5ULFxuICAgICAgICByZXN1bHQ7XG5cbiAgICBpZiAoZnJvbUJpZ0VuZGlhbiA9PT0gaXNCaWdFbmRpYW5QbGF0Zm9ybSgpIHx8IGJ5dGVzUGVyRWxlbWVudCA9PT0gMSkge1xuICAgICAgICByZXN1bHQgPSBuZXcgdmlld1R5cGUoc291cmNlQXJyYXlCdWZmZXIsIHBvc2l0aW9uLCBsZW5ndGgpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciByZWFkVmlldyA9IG5ldyBEYXRhVmlldyhzb3VyY2VBcnJheUJ1ZmZlciwgcG9zaXRpb24sIGxlbmd0aCAqIGJ5dGVzUGVyRWxlbWVudCksXG4gICAgICAgICAgICBnZXRNZXRob2QgPSBnZXRNZXRob2RzW3ZpZXdUeXBlLm5hbWVdLFxuICAgICAgICAgICAgbGl0dGxlRW5kaWFuID0gIWZyb21CaWdFbmRpYW47XG5cbiAgICAgICAgcmVzdWx0ID0gbmV3IHZpZXdUeXBlKGxlbmd0aCk7XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgcmVzdWx0W2ldID0gcmVhZFZpZXdbZ2V0TWV0aG9kXShpICogYnl0ZXNQZXJFbGVtZW50LCBsaXR0bGVFbmRpYW4pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gZGVjb2RlIChidWZmZXIpIHtcbiAgICB2YXIgYXJyYXkgPSBuZXcgVWludDhBcnJheShidWZmZXIpLFxuICAgICAgICB2ZXJzaW9uID0gYXJyYXlbMF0sXG4gICAgICAgIGZsYWdzID0gYXJyYXlbMV0sXG4gICAgICAgIGluZGV4ZWRHZW9tZXRyeSA9ICEhKGZsYWdzID4+IDcpLFxuICAgICAgICBpbmRpY2VzVHlwZSA9IGZsYWdzID4+IDYgJiAweDAxLFxuICAgICAgICBiaWdFbmRpYW4gPSAoZmxhZ3MgPj4gNSAmIDB4MDEpID09PSAxLFxuICAgICAgICBhdHRyaWJ1dGVzTnVtYmVyID0gZmxhZ3MgJiAweDFGLFxuICAgICAgICB2YWx1ZXNOdW1iZXIgPSAwLFxuICAgICAgICBpbmRpY2VzTnVtYmVyID0gMDtcblxuICAgIGlmIChiaWdFbmRpYW4pIHtcbiAgICAgICAgdmFsdWVzTnVtYmVyID0gKGFycmF5WzJdIDw8IDE2KSArIChhcnJheVszXSA8PCA4KSArIGFycmF5WzRdO1xuICAgICAgICBpbmRpY2VzTnVtYmVyID0gKGFycmF5WzVdIDw8IDE2KSArIChhcnJheVs2XSA8PCA4KSArIGFycmF5WzddO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHZhbHVlc051bWJlciA9IGFycmF5WzJdICsgKGFycmF5WzNdIDw8IDgpICsgKGFycmF5WzRdIDw8IDE2KTtcbiAgICAgICAgaW5kaWNlc051bWJlciA9IGFycmF5WzVdICsgKGFycmF5WzZdIDw8IDgpICsgKGFycmF5WzddIDw8IDE2KTtcbiAgICB9XG5cbiAgICAvKiogUFJFTElNSU5BUlkgQ0hFQ0tTICoqL1xuXG4gICAgaWYgKHZlcnNpb24gPT09IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdQUldNIGRlY29kZXI6IEludmFsaWQgZm9ybWF0IHZlcnNpb246IDAnKTtcbiAgICB9IGVsc2UgaWYgKHZlcnNpb24gIT09IDEpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdQUldNIGRlY29kZXI6IFVuc3VwcG9ydGVkIGZvcm1hdCB2ZXJzaW9uOiAnICsgdmVyc2lvbik7XG4gICAgfVxuXG4gICAgaWYgKCFpbmRleGVkR2VvbWV0cnkpIHtcbiAgICAgICAgaWYgKGluZGljZXNUeXBlICE9PSAwKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BSV00gZGVjb2RlcjogSW5kaWNlcyB0eXBlIG11c3QgYmUgc2V0IHRvIDAgZm9yIG5vbi1pbmRleGVkIGdlb21ldHJpZXMnKTtcbiAgICAgICAgfSBlbHNlIGlmIChpbmRpY2VzTnVtYmVyICE9PSAwKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BSV00gZGVjb2RlcjogTnVtYmVyIG9mIGluZGljZXMgbXVzdCBiZSBzZXQgdG8gMCBmb3Igbm9uLWluZGV4ZWQgZ2VvbWV0cmllcycpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqIFBBUlNJTkcgKiovXG5cbiAgICB2YXIgcG9zID0gODtcblxuICAgIHZhciBhdHRyaWJ1dGVzID0ge30sXG4gICAgICAgIGF0dHJpYnV0ZU5hbWUsXG4gICAgICAgIGNoYXIsXG4gICAgICAgIGF0dHJpYnV0ZU5vcm1hbGl6ZWQsXG4gICAgICAgIGF0dHJpYnV0ZVR5cGUsXG4gICAgICAgIGNhcmRpbmFsaXR5LFxuICAgICAgICBlbmNvZGluZ1R5cGUsXG4gICAgICAgIGFycmF5VHlwZSxcbiAgICAgICAgdmFsdWVzLFxuICAgICAgICBpO1xuXG4gICAgZm9yIChpID0gMDsgaSA8IGF0dHJpYnV0ZXNOdW1iZXI7IGkrKykge1xuICAgICAgICBhdHRyaWJ1dGVOYW1lID0gJyc7XG5cbiAgICAgICAgd2hpbGUgKHBvcyA8IGFycmF5Lmxlbmd0aCkge1xuICAgICAgICAgICAgY2hhciA9IGFycmF5W3Bvc107XG4gICAgICAgICAgICBwb3MrKztcblxuICAgICAgICAgICAgaWYgKGNoYXIgPT09IDApIHtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgYXR0cmlidXRlTmFtZSArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGNoYXIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgZmxhZ3MgPSBhcnJheVtwb3NdO1xuXG4gICAgICAgIGF0dHJpYnV0ZVR5cGUgPSBmbGFncyA+PiA3ICYgMHgwMTtcbiAgICAgICAgYXR0cmlidXRlTm9ybWFsaXplZCA9ICEhKGZsYWdzID4+IDYgJiAweDAxKTtcbiAgICAgICAgY2FyZGluYWxpdHkgPSAoZmxhZ3MgPj4gNCAmIDB4MDMpICsgMTtcbiAgICAgICAgZW5jb2RpbmdUeXBlID0gZmxhZ3MgJiAweDBGO1xuICAgICAgICBhcnJheVR5cGUgPSBJbnZlcnRlZEVuY29kaW5nVHlwZXNbZW5jb2RpbmdUeXBlXTtcblxuICAgICAgICBwb3MrKztcblxuICAgICAgICAvLyBwYWRkaW5nIHRvIG5leHQgbXVsdGlwbGUgb2YgNFxuICAgICAgICBwb3MgPSBNYXRoLmNlaWwocG9zIC8gNCkgKiA0O1xuXG4gICAgICAgIHZhbHVlcyA9IGNvcHlGcm9tQnVmZmVyKGJ1ZmZlciwgYXJyYXlUeXBlLCBwb3MsIGNhcmRpbmFsaXR5ICogdmFsdWVzTnVtYmVyLCBiaWdFbmRpYW4pO1xuXG4gICAgICAgIHBvcys9IGFycmF5VHlwZS5CWVRFU19QRVJfRUxFTUVOVCAqIGNhcmRpbmFsaXR5ICogdmFsdWVzTnVtYmVyO1xuXG4gICAgICAgIGF0dHJpYnV0ZXNbYXR0cmlidXRlTmFtZV0gPSB7XG4gICAgICAgICAgICB0eXBlOiBhdHRyaWJ1dGVUeXBlLFxuICAgICAgICAgICAgbm9ybWFsaXplZDogYXR0cmlidXRlTm9ybWFsaXplZCxcbiAgICAgICAgICAgIGNhcmRpbmFsaXR5OiBjYXJkaW5hbGl0eSxcbiAgICAgICAgICAgIHZhbHVlczogdmFsdWVzXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcG9zID0gTWF0aC5jZWlsKHBvcyAvIDQpICogNDtcblxuICAgIHZhciBpbmRpY2VzID0gbnVsbDtcblxuICAgIGlmIChpbmRleGVkR2VvbWV0cnkpIHtcbiAgICAgICAgaW5kaWNlcyA9IGNvcHlGcm9tQnVmZmVyKFxuICAgICAgICAgICAgYnVmZmVyLFxuICAgICAgICAgICAgaW5kaWNlc1R5cGUgPT09IDEgPyBVaW50MzJBcnJheSA6IFVpbnQxNkFycmF5LFxuICAgICAgICAgICAgcG9zLFxuICAgICAgICAgICAgaW5kaWNlc051bWJlcixcbiAgICAgICAgICAgIGJpZ0VuZGlhblxuICAgICAgICApO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICAgIHZlcnNpb246IHZlcnNpb24sXG4gICAgICAgIGF0dHJpYnV0ZXM6IGF0dHJpYnV0ZXMsXG4gICAgICAgIGluZGljZXM6IGluZGljZXNcbiAgICB9O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGRlY29kZTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgaXNCaWdFbmRpYW5QbGF0Zm9ybSA9IHJlcXVpcmUoJy4uL3V0aWxzL2lzLWJpZy1lbmRpYW4tcGxhdGZvcm0nKSxcbiAgICBhdHRyaWJ1dGVUeXBlcyA9IHJlcXVpcmUoJy4vYXR0cmlidXRlLXR5cGVzJyk7XG5cbi8vIG1hdGNoIHRoZSBUeXBlZEFycmF5IHR5cGUgd2l0aCB0aGUgdmFsdWUgZGVmaW5lZCBpbiB0aGUgc3BlY1xudmFyIEVuY29kaW5nVHlwZXMgPSB7XG4gICAgRmxvYXQzMkFycmF5OiAxLFxuICAgIEludDhBcnJheTogMyxcbiAgICBJbnQxNkFycmF5OiA0LFxuICAgIEludDMyQXJyYXk6IDYsXG4gICAgVWludDhBcnJheTogNyxcbiAgICBVaW50MTZBcnJheTogOCxcbiAgICBVaW50MzJBcnJheTogMTBcbn07XG5cbi8vIGRlZmluZSB0aGUgbWV0aG9kIHRvIHVzZSBvbiBhIERhdGFWaWV3LCBjb3JyZXNwb25kaW5nIHRoZSBUeXBlZEFycmF5IHR5cGVcbnZhciBzZXRNZXRob2RzID0ge1xuICAgIFVpbnQxNkFycmF5OiAnc2V0VWludDE2JyxcbiAgICBVaW50MzJBcnJheTogJ3NldFVpbnQzMicsXG4gICAgSW50MTZBcnJheTogJ3NldEludDE2JyxcbiAgICBJbnQzMkFycmF5OiAnc2V0SW50MzInLFxuICAgIEZsb2F0MzJBcnJheTogJ3NldEZsb2F0MzInXG59O1xuXG5mdW5jdGlvbiBjb3B5VG9CdWZmZXIgKHNvdXJjZVR5cGVkQXJyYXksIGRlc3RpbmF0aW9uQXJyYXlCdWZmZXIsIHBvc2l0aW9uLCBiaWdFbmRpYW4pIHtcbiAgICB2YXIgbGVuZ3RoID0gc291cmNlVHlwZWRBcnJheS5sZW5ndGgsXG4gICAgICAgIGJ5dGVzUGVyRWxlbWVudCA9IHNvdXJjZVR5cGVkQXJyYXkuQllURVNfUEVSX0VMRU1FTlQ7XG5cbiAgICB2YXIgd3JpdGVBcnJheSA9IG5ldyBzb3VyY2VUeXBlZEFycmF5LmNvbnN0cnVjdG9yKGRlc3RpbmF0aW9uQXJyYXlCdWZmZXIsIHBvc2l0aW9uLCBsZW5ndGgpO1xuXG4gICAgaWYgKGJpZ0VuZGlhbiA9PT0gaXNCaWdFbmRpYW5QbGF0Zm9ybSgpIHx8IGJ5dGVzUGVyRWxlbWVudCA9PT0gMSkge1xuICAgICAgICAvLyBkZXNpcmVkIGVuZGlhbm5lc3MgaXMgdGhlIHNhbWUgYXMgdGhlIHBsYXRmb3JtLCBvciB0aGUgZW5kaWFubmVzcyBkb2Vzbid0IG1hdHRlciAoMSBieXRlKVxuICAgICAgICB3cml0ZUFycmF5LnNldChzb3VyY2VUeXBlZEFycmF5LnN1YmFycmF5KDAsIGxlbmd0aCkpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciB3cml0ZVZpZXcgPSBuZXcgRGF0YVZpZXcoZGVzdGluYXRpb25BcnJheUJ1ZmZlciwgcG9zaXRpb24sIGxlbmd0aCAqIGJ5dGVzUGVyRWxlbWVudCksXG4gICAgICAgICAgICBzZXRNZXRob2QgPSBzZXRNZXRob2RzW3NvdXJjZVR5cGVkQXJyYXkuY29uc3RydWN0b3IubmFtZV0sXG4gICAgICAgICAgICBsaXR0bGVFbmRpYW4gPSAhYmlnRW5kaWFuLFxuICAgICAgICAgICAgaSA9IDA7XG5cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB3cml0ZVZpZXdbc2V0TWV0aG9kXShpICogYnl0ZXNQZXJFbGVtZW50LCBzb3VyY2VUeXBlZEFycmF5W2ldLCBsaXR0bGVFbmRpYW4pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHdyaXRlQXJyYXk7XG59XG5cbmZ1bmN0aW9uIGVuY29kZSAoYXR0cmlidXRlcywgaW5kaWNlcywgYmlnRW5kaWFuKSB7XG4gICAgdmFyIGF0dHJpYnV0ZUtleXMgPSBhdHRyaWJ1dGVzID8gT2JqZWN0LmtleXMoYXR0cmlidXRlcykgOiBbXSxcbiAgICAgICAgaW5kZXhlZEdlb21ldHJ5ID0gISFpbmRpY2VzLFxuICAgICAgICBpLCBqO1xuXG4gICAgLyoqIFBSRUxJTUlOQVJZIENIRUNLUyAqKi9cblxuICAgIC8vIHRoaXMgaXMgbm90IHN1cHBvc2VkIHRvIGNhdGNoIGFsbCB0aGUgcG9zc2libGUgZXJyb3JzLCBvbmx5IHNvbWUgb2YgdGhlIGdvdGNoYXNcblxuICAgIGlmIChhdHRyaWJ1dGVLZXlzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BSV00gZW5jb2RlcjogVGhlIG1vZGVsIG11c3QgaGF2ZSBhdCBsZWFzdCBvbmUgYXR0cmlidXRlJyk7XG4gICAgfVxuXG4gICAgaWYgKGF0dHJpYnV0ZUtleXMubGVuZ3RoID4gMzEpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdQUldNIGVuY29kZXI6IFRoZSBtb2RlbCBjYW4gaGF2ZSBhdCBtb3N0IDMxIGF0dHJpYnV0ZXMnKTtcbiAgICB9XG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgYXR0cmlidXRlS2V5cy5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAoIUVuY29kaW5nVHlwZXMuaGFzT3duUHJvcGVydHkoYXR0cmlidXRlc1thdHRyaWJ1dGVLZXlzW2ldXS52YWx1ZXMuY29uc3RydWN0b3IubmFtZSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignUFJXTSBlbmNvZGVyOiBVbnN1cHBvcnRlZCBhdHRyaWJ1dGUgdmFsdWVzIHR5cGU6ICcgKyBhdHRyaWJ1dGVzW2F0dHJpYnV0ZUtleXNbaV1dLnZhbHVlcy5jb25zdHJ1Y3Rvci5uYW1lKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmIChpbmRleGVkR2VvbWV0cnkgJiYgaW5kaWNlcy5jb25zdHJ1Y3Rvci5uYW1lICE9PSAnVWludDE2QXJyYXknICYmIGluZGljZXMuY29uc3RydWN0b3IubmFtZSAhPT0gJ1VpbnQzMkFycmF5Jykge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BSV00gZW5jb2RlcjogVGhlIGluZGljZXMgbXVzdCBiZSByZXByZXNlbnRlZCBhcyBhbiBVaW50MTZBcnJheSBvciBhbiBVaW50MzJBcnJheScpO1xuICAgIH1cblxuICAgIC8qKiBHRVQgVEhFIFRZUEUgT0YgSU5ESUNFUyBBUyBXRUxMIEFTIFRIRSBOVU1CRVIgT0YgSU5ESUNFUyBBTkQgQVRUUklCVVRFIFZBTFVFUyAqKi9cblxuICAgIHZhciB2YWx1ZXNOdW1iZXIgPSBhdHRyaWJ1dGVzW2F0dHJpYnV0ZUtleXNbMF1dLnZhbHVlcy5sZW5ndGggLyBhdHRyaWJ1dGVzW2F0dHJpYnV0ZUtleXNbMF1dLmNhcmRpbmFsaXR5IHwgMCxcbiAgICAgICAgaW5kaWNlc051bWJlciA9IGluZGV4ZWRHZW9tZXRyeSA/IGluZGljZXMubGVuZ3RoIDogMCxcbiAgICAgICAgaW5kaWNlc1R5cGUgPSBpbmRleGVkR2VvbWV0cnkgJiYgaW5kaWNlcy5jb25zdHJ1Y3Rvci5uYW1lID09PSAnVWludDMyQXJyYXknID8gMSA6IDA7XG5cbiAgICAvKiogR0VUIFRIRSBGSUxFIExFTkdUSCAqKi9cblxuICAgIHZhciB0b3RhbExlbmd0aCA9IDgsXG4gICAgICAgIGF0dHJpYnV0ZUtleSxcbiAgICAgICAgYXR0cmlidXRlLFxuICAgICAgICBhdHRyaWJ1dGVUeXBlLFxuICAgICAgICBhdHRyaWJ1dGVOb3JtYWxpemVkO1xuXG4gICAgZm9yIChpID0gMDsgaSA8IGF0dHJpYnV0ZUtleXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgYXR0cmlidXRlS2V5ID0gYXR0cmlidXRlS2V5c1tpXTtcbiAgICAgICAgYXR0cmlidXRlID0gYXR0cmlidXRlc1thdHRyaWJ1dGVLZXldO1xuICAgICAgICB0b3RhbExlbmd0aCArPSBhdHRyaWJ1dGVLZXkubGVuZ3RoICsgMjsgLy8gTlVMIGJ5dGUgKyBmbGFnIGJ5dGUgKyBwYWRkaW5nXG4gICAgICAgIHRvdGFsTGVuZ3RoID0gTWF0aC5jZWlsKHRvdGFsTGVuZ3RoIC8gNCkgKiA0OyAvLyBwYWRkaW5nXG4gICAgICAgIHRvdGFsTGVuZ3RoICs9IGF0dHJpYnV0ZS52YWx1ZXMuYnl0ZUxlbmd0aDtcbiAgICB9XG5cbiAgICBpZiAoaW5kZXhlZEdlb21ldHJ5KSB7XG4gICAgICAgIHRvdGFsTGVuZ3RoID0gTWF0aC5jZWlsKHRvdGFsTGVuZ3RoIC8gNCkgKiA0O1xuICAgICAgICB0b3RhbExlbmd0aCArPSBpbmRpY2VzLmJ5dGVMZW5ndGg7XG4gICAgfVxuXG4gICAgLyoqIElOSVRJQUxJWkUgVEhFIEJVRkZFUiAqL1xuXG4gICAgdmFyIGJ1ZmZlciA9IG5ldyBBcnJheUJ1ZmZlcih0b3RhbExlbmd0aCksXG4gICAgICAgIGFycmF5ID0gbmV3IFVpbnQ4QXJyYXkoYnVmZmVyKTtcblxuICAgIC8qKiBIRUFERVIgKiovXG5cbiAgICBhcnJheVswXSA9IDE7XG4gICAgYXJyYXlbMV0gPSAoXG4gICAgICAgIGluZGV4ZWRHZW9tZXRyeSA8PCA3IHxcbiAgICAgICAgaW5kaWNlc1R5cGUgPDwgNiB8XG4gICAgICAgIChiaWdFbmRpYW4gPyAxIDogMCkgPDwgNSB8XG4gICAgICAgIGF0dHJpYnV0ZUtleXMubGVuZ3RoICYgMHgxRlxuICAgICk7XG5cbiAgICBpZiAoYmlnRW5kaWFuKSB7XG4gICAgICAgIGFycmF5WzJdID0gdmFsdWVzTnVtYmVyID4+IDE2ICYgMHhGRjtcbiAgICAgICAgYXJyYXlbM10gPSB2YWx1ZXNOdW1iZXIgPj4gOCAmIDB4RkY7XG4gICAgICAgIGFycmF5WzRdID0gdmFsdWVzTnVtYmVyICYgMHhGRjtcblxuICAgICAgICBhcnJheVs1XSA9IGluZGljZXNOdW1iZXIgPj4gMTYgJiAweEZGO1xuICAgICAgICBhcnJheVs2XSA9IGluZGljZXNOdW1iZXIgPj4gOCAmIDB4RkY7XG4gICAgICAgIGFycmF5WzddID0gaW5kaWNlc051bWJlciAmIDB4RkY7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgYXJyYXlbMl0gPSB2YWx1ZXNOdW1iZXIgJiAweEZGO1xuICAgICAgICBhcnJheVszXSA9IHZhbHVlc051bWJlciA+PiA4ICYgMHhGRjtcbiAgICAgICAgYXJyYXlbNF0gPSB2YWx1ZXNOdW1iZXIgPj4gMTYgJiAweEZGO1xuXG4gICAgICAgIGFycmF5WzVdID0gaW5kaWNlc051bWJlciAmIDB4RkY7XG4gICAgICAgIGFycmF5WzZdID0gaW5kaWNlc051bWJlciA+PiA4ICYgMHhGRjtcbiAgICAgICAgYXJyYXlbN10gPSBpbmRpY2VzTnVtYmVyID4+IDE2ICYgMHhGRjtcbiAgICB9XG5cblxuICAgIHZhciBwb3MgPSA4O1xuXG4gICAgLyoqIEFUVFJJQlVURVMgKiovXG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgYXR0cmlidXRlS2V5cy5sZW5ndGg7IGkrKykge1xuICAgICAgICBhdHRyaWJ1dGVLZXkgPSBhdHRyaWJ1dGVLZXlzW2ldO1xuICAgICAgICBhdHRyaWJ1dGUgPSBhdHRyaWJ1dGVzW2F0dHJpYnV0ZUtleV07XG4gICAgICAgIGF0dHJpYnV0ZVR5cGUgPSB0eXBlb2YgYXR0cmlidXRlLnR5cGUgPT09ICd1bmRlZmluZWQnID8gYXR0cmlidXRlVHlwZXMuRmxvYXQgOiBhdHRyaWJ1dGUudHlwZTtcbiAgICAgICAgYXR0cmlidXRlTm9ybWFsaXplZCA9ICghIWF0dHJpYnV0ZS5ub3JtYWxpemVkID8gMSA6IDApO1xuXG4gICAgICAgIC8qKiogV1JJVEUgQVRUUklCVVRFIEhFQURFUiAqKiovXG5cbiAgICAgICAgZm9yIChqID0gMDsgaiA8IGF0dHJpYnV0ZUtleS5sZW5ndGg7IGorKywgcG9zKyspIHtcbiAgICAgICAgICAgIGFycmF5W3Bvc10gPSAoYXR0cmlidXRlS2V5LmNoYXJDb2RlQXQoaikgJiAweDdGKSB8fCAweDVGOyAvLyBkZWZhdWx0IHRvIHVuZGVyc2NvcmVcbiAgICAgICAgfVxuXG4gICAgICAgIHBvcysrO1xuXG4gICAgICAgIGFycmF5W3Bvc10gPSAoXG4gICAgICAgICAgICBhdHRyaWJ1dGVUeXBlIDw8IDcgfFxuICAgICAgICAgICAgYXR0cmlidXRlTm9ybWFsaXplZCA8PCA2IHxcbiAgICAgICAgICAgICgoYXR0cmlidXRlLmNhcmRpbmFsaXR5IC0gMSkgJiAweDAzKSA8PCA0IHxcbiAgICAgICAgICAgIEVuY29kaW5nVHlwZXNbYXR0cmlidXRlLnZhbHVlcy5jb25zdHJ1Y3Rvci5uYW1lXSAmIDB4MEZcbiAgICAgICAgKTtcblxuICAgICAgICBwb3MrKztcblxuXG4gICAgICAgIC8vIHBhZGRpbmcgdG8gbmV4dCBtdWx0aXBsZSBvZiA0XG4gICAgICAgIHBvcyA9IE1hdGguY2VpbChwb3MgLyA0KSAqIDQ7XG5cbiAgICAgICAgLyoqKiBXUklURSBBVFRSSUJVVEUgVkFMVUVTICoqKi9cblxuICAgICAgICB2YXIgYXR0cmlidXRlc1dyaXRlQXJyYXkgPSBjb3B5VG9CdWZmZXIoYXR0cmlidXRlLnZhbHVlcywgYnVmZmVyLCBwb3MsIGJpZ0VuZGlhbik7XG5cbiAgICAgICAgcG9zICs9IGF0dHJpYnV0ZXNXcml0ZUFycmF5LmJ5dGVMZW5ndGg7XG4gICAgfVxuXG4gICAgLyoqKiBXUklURSBJTkRJQ0VTIFZBTFVFUyAqKiovXG5cbiAgICBpZiAoaW5kZXhlZEdlb21ldHJ5KSB7XG4gICAgICAgIHBvcyA9IE1hdGguY2VpbChwb3MgLyA0KSAqIDQ7XG5cbiAgICAgICAgY29weVRvQnVmZmVyKGluZGljZXMsIGJ1ZmZlciwgcG9zLCBiaWdFbmRpYW4pO1xuICAgIH1cblxuICAgIHJldHVybiBidWZmZXI7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZW5jb2RlO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBiaWdFbmRpYW5QbGF0Zm9ybSA9IG51bGw7XG5cbi8qKlxuICogQ2hlY2sgaWYgdGhlIGVuZGlhbm5lc3Mgb2YgdGhlIHBsYXRmb3JtIGlzIGJpZy1lbmRpYW4gKG1vc3Qgc2lnbmlmaWNhbnQgYml0IGZpcnN0KVxuICogQHJldHVybnMge2Jvb2xlYW59IFRydWUgaWYgYmlnLWVuZGlhbiwgZmFsc2UgaWYgbGl0dGxlLWVuZGlhblxuICovXG5mdW5jdGlvbiBpc0JpZ0VuZGlhblBsYXRmb3JtICgpIHtcbiAgICBpZiAoYmlnRW5kaWFuUGxhdGZvcm0gPT09IG51bGwpIHtcbiAgICAgICAgdmFyIGJ1ZmZlciA9IG5ldyBBcnJheUJ1ZmZlcigyKSxcbiAgICAgICAgICAgIHVpbnQ4QXJyYXkgPSBuZXcgVWludDhBcnJheShidWZmZXIpLFxuICAgICAgICAgICAgdWludDE2QXJyYXkgPSBuZXcgVWludDE2QXJyYXkoYnVmZmVyKTtcblxuICAgICAgICB1aW50OEFycmF5WzBdID0gMHhBQTsgLy8gc2V0IGZpcnN0IGJ5dGVcbiAgICAgICAgdWludDhBcnJheVsxXSA9IDB4QkI7IC8vIHNldCBzZWNvbmQgYnl0ZVxuICAgICAgICBiaWdFbmRpYW5QbGF0Zm9ybSA9ICh1aW50MTZBcnJheVswXSA9PT0gMHhBQUJCKTtcbiAgICB9XG5cbiAgICByZXR1cm4gYmlnRW5kaWFuUGxhdGZvcm07XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaXNCaWdFbmRpYW5QbGF0Zm9ybTtcbiIsIm1vZHVsZS5leHBvcnRzID0gUGFyc2VXYXZlZnJvbnRPYmpcblxuLy8gTWFwIC5vYmogdmVydGV4IGluZm8gbGluZSBuYW1lcyB0byBvdXIgcmV0dXJuZWQgcHJvcGVydHkgbmFtZXNcbnZhciB2ZXJ0ZXhJbmZvTmFtZU1hcCA9IHt2OiAndmVydGV4JywgdnQ6ICd1dicsIHZuOiAnbm9ybWFsJ31cblxuZnVuY3Rpb24gUGFyc2VXYXZlZnJvbnRPYmogKHdhdmVmcm9udFN0cmluZykge1xuICAndXNlIHN0cmljdCdcblxuICB2YXIgcGFyc2VkSlNPTiA9IHtub3JtYWw6IFtdLCB1djogW10sIHZlcnRleDogW10sIG5vcm1hbEluZGV4OiBbXSwgdXZJbmRleDogW10sIHZlcnRleEluZGV4OiBbXX1cblxuICB2YXIgbGluZXNJbldhdmVmcm9udE9iaiA9IHdhdmVmcm9udFN0cmluZy5zcGxpdCgnXFxuJylcblxuICB2YXIgY3VycmVudExpbmUsIGN1cnJlbnRMaW5lVG9rZW5zLCB2ZXJ0ZXhJbmZvVHlwZSwgaSwga1xuXG4gIC8vIExvb3AgdGhyb3VnaCBhbmQgcGFyc2UgZXZlcnkgbGluZSBpbiBvdXIgLm9iaiBmaWxlXG4gIGZvciAoaSA9IDA7IGkgPCBsaW5lc0luV2F2ZWZyb250T2JqLmxlbmd0aDsgaSsrKSB7XG4gICAgY3VycmVudExpbmUgPSBsaW5lc0luV2F2ZWZyb250T2JqW2ldXG4gICAgLy8gVG9rZW5pemUgb3VyIGN1cnJlbnQgbGluZVxuICAgIGN1cnJlbnRMaW5lVG9rZW5zID0gY3VycmVudExpbmUuc3BsaXQoJyAnKVxuICAgIC8vIHZlcnRleCBwb3NpdGlvbiwgdmVydGV4IHRleHR1cmUsIG9yIHZlcnRleCBub3JtYWxcbiAgICB2ZXJ0ZXhJbmZvVHlwZSA9IHZlcnRleEluZm9OYW1lTWFwW2N1cnJlbnRMaW5lVG9rZW5zWzBdXVxuXG4gICAgaWYgKHZlcnRleEluZm9UeXBlKSB7XG4gICAgICBmb3IgKGsgPSAxOyBrIDwgY3VycmVudExpbmVUb2tlbnMubGVuZ3RoOyBrKyspIHtcbiAgICAgICAgaWYgKGN1cnJlbnRMaW5lVG9rZW5zW2tdICE9PSAnJykge1xuICAgICAgICAgIHBhcnNlZEpTT05bdmVydGV4SW5mb1R5cGVdLnB1c2gocGFyc2VGbG9hdChjdXJyZW50TGluZVRva2Vuc1trXSkpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGNvbnRpbnVlXG4gICAgfVxuXG4gICAgaWYgKGN1cnJlbnRMaW5lVG9rZW5zWzBdID09PSAnZicpIHtcbiAgICAgIC8vIEdldCBvdXIgNCBzZXRzIG9mIHZlcnRleCwgdXYsIGFuZCBub3JtYWwgaW5kaWNlcyBmb3IgdGhpcyBmYWNlXG4gICAgICBmb3IgKGsgPSAxOyBrIDwgNTsgaysrKSB7XG4gICAgICAgIC8vIElmIHRoZXJlIGlzIG5vIGZvdXJ0aCBmYWNlIGVudHJ5IHRoZW4gdGhpcyBpcyBzcGVjaWZ5aW5nIGEgdHJpYW5nbGVcbiAgICAgICAgLy8gaW4gdGhpcyBjYXNlIHdlIHB1c2ggYC0xYFxuICAgICAgICAvLyBDb25zdW1lcnMgb2YgdGhpcyBtb2R1bGUgc2hvdWxkIGNoZWNrIGZvciBgLTFgIGJlZm9yZSBleHBhbmRpbmcgZmFjZSBkYXRhXG4gICAgICAgIGlmIChrID09PSA0ICYmICFjdXJyZW50TGluZVRva2Vuc1s0XSkge1xuICAgICAgICAgIHBhcnNlZEpTT04udmVydGV4SW5kZXgucHVzaCgtMSlcbiAgICAgICAgICBwYXJzZWRKU09OLnV2SW5kZXgucHVzaCgtMSlcbiAgICAgICAgICBwYXJzZWRKU09OLm5vcm1hbEluZGV4LnB1c2goLTEpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdmFyIGluZGljZXMgPSBjdXJyZW50TGluZVRva2Vuc1trXS5zcGxpdCgnLycpXG4gICAgICAgICAgcGFyc2VkSlNPTi52ZXJ0ZXhJbmRleC5wdXNoKHBhcnNlSW50KGluZGljZXNbMF0sIDEwKSAtIDEpIC8vIFdlIHplcm8gaW5kZXhcbiAgICAgICAgICBwYXJzZWRKU09OLnV2SW5kZXgucHVzaChwYXJzZUludChpbmRpY2VzWzFdLCAxMCkgLSAxKSAvLyBvdXIgZmFjZSBpbmRpY2VzXG4gICAgICAgICAgcGFyc2VkSlNPTi5ub3JtYWxJbmRleC5wdXNoKHBhcnNlSW50KGluZGljZXNbMl0sIDEwKSAtIDEpIC8vIGJ5IHN1YnRyYWN0aW5nIDFcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiBwYXJzZWRKU09OXG59XG4iLCJcInVzZSBzdHJpY3RcIjtcblxuLy8gYmFzZWQgb24gaHR0cHM6Ly9naXRodWIuY29tL2tjaGFwZWxpZXIvcHJvY2phbTIwMTUvYmxvYi9tYXN0ZXIvc3JjL3V0aWxzL21lc2hlcy9jb21wdXRlLXZlcnRleC1ub3JtYWxzLmpzXG4vLyB3aGljaCBpdHNlbGYgaXMgYSByZXdyaXRlIG9mIFRocmVlLmpzIGZ1bmN0aW9uIHRvIGNvbXB1dGUgbm9ybWFsc1xuXG52YXIgbm9ybWFsaXplTm9ybWFscyA9IGZ1bmN0aW9uIG5vcm1hbGl6ZU5vcm1hbHMgKG5vcm1hbHMpIHtcbiAgICB2YXIgaSwgeCwgeSwgeiwgbjtcblxuICAgIGZvciAoaSA9IDA7IGkgPCBub3JtYWxzLmxlbmd0aDsgaSs9IDMpIHtcbiAgICAgICAgeCA9IG5vcm1hbHNbaV07XG4gICAgICAgIHkgPSBub3JtYWxzW2kgKyAxXTtcbiAgICAgICAgeiA9IG5vcm1hbHNbaSArIDJdO1xuXG4gICAgICAgIG4gPSAxLjAgLyBNYXRoLnNxcnQoeCAqIHggKyB5ICogeSArIHogKiB6KTtcblxuICAgICAgICBub3JtYWxzW2ldKj0gbjtcbiAgICAgICAgbm9ybWFsc1tpICsgMV0qPSBuO1xuICAgICAgICBub3JtYWxzW2kgKyAyXSo9IG47XG4gICAgfVxufTtcblxudmFyIGNvbXB1dGVWZXJ0ZXhOb3JtYWxzID0gZnVuY3Rpb24gY29tcHV0ZVZlcnRleE5vcm1hbHMgKGluZGljZXMsIHBvc2l0aW9ucywgbm9ybWFscykge1xuICAgIHZhciBwQSA9IFswLDAsMF0sXG4gICAgICAgIHBCID0gWzAsMCwwXSxcbiAgICAgICAgcEMgPSBbMCwwLDBdLFxuICAgICAgICBjYiA9IFswLDAsMF0sXG4gICAgICAgIGFiID0gWzAsMCwwXSxcbiAgICAgICAgdkEsXG4gICAgICAgIHZCLFxuICAgICAgICB2QyxcbiAgICAgICAgY2J4LFxuICAgICAgICBjYnksXG4gICAgICAgIGNieixcbiAgICAgICAgaTtcblxuICAgIG5vcm1hbHMubGVuZ3RoID0gcG9zaXRpb25zLmxlbmd0aDtcblxuICAgIGZvciAoaSA9IDA7IGkgPCBub3JtYWxzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIG5vcm1hbHNbaV0gPSAwO1xuICAgIH1cblxuICAgIGlmIChpbmRpY2VzKSB7XG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBpbmRpY2VzLmxlbmd0aDsgaSArPSAzKSB7XG5cbiAgICAgICAgICAgIHZBID0gaW5kaWNlc1tpXSAqIDM7XG4gICAgICAgICAgICB2QiA9IGluZGljZXNbaSArIDFdICogMztcbiAgICAgICAgICAgIHZDID0gaW5kaWNlc1tpICsgMl0gKiAzO1xuXG4gICAgICAgICAgICAvKlxuICAgICAgICAgICAgIHBBLmZyb21BcnJheSggcG9zaXRpb25zLCB2QSApO1xuICAgICAgICAgICAgIHBCLmZyb21BcnJheSggcG9zaXRpb25zLCB2QiApO1xuICAgICAgICAgICAgIHBDLmZyb21BcnJheSggcG9zaXRpb25zLCB2QyApO1xuICAgICAgICAgICAgICovXG5cbiAgICAgICAgICAgIHBBWzBdID0gcG9zaXRpb25zW3ZBXTtcbiAgICAgICAgICAgIHBBWzFdID0gcG9zaXRpb25zW3ZBICsgMV07XG4gICAgICAgICAgICBwQVsyXSA9IHBvc2l0aW9uc1t2QSArIDJdO1xuXG4gICAgICAgICAgICBwQlswXSA9IHBvc2l0aW9uc1t2Ql07XG4gICAgICAgICAgICBwQlsxXSA9IHBvc2l0aW9uc1t2QiArIDFdO1xuICAgICAgICAgICAgcEJbMl0gPSBwb3NpdGlvbnNbdkIgKyAyXTtcblxuICAgICAgICAgICAgcENbMF0gPSBwb3NpdGlvbnNbdkNdO1xuICAgICAgICAgICAgcENbMV0gPSBwb3NpdGlvbnNbdkMgKyAxXTtcbiAgICAgICAgICAgIHBDWzJdID0gcG9zaXRpb25zW3ZDICsgMl07XG5cbiAgICAgICAgICAgIC8qXG4gICAgICAgICAgICAgY2Iuc3ViVmVjdG9ycyggcEMsIHBCICk7XG4gICAgICAgICAgICAgYWIuc3ViVmVjdG9ycyggcEEsIHBCICk7XG4gICAgICAgICAgICAgKi9cblxuICAgICAgICAgICAgY2JbMF0gPSBwQ1swXSAtIHBCWzBdO1xuICAgICAgICAgICAgY2JbMV0gPSBwQ1sxXSAtIHBCWzFdO1xuICAgICAgICAgICAgY2JbMl0gPSBwQ1syXSAtIHBCWzJdO1xuXG4gICAgICAgICAgICBhYlswXSA9IHBBWzBdIC0gcEJbMF07XG4gICAgICAgICAgICBhYlsxXSA9IHBBWzFdIC0gcEJbMV07XG4gICAgICAgICAgICBhYlsyXSA9IHBBWzJdIC0gcEJbMl07XG5cbiAgICAgICAgICAgIC8qXG4gICAgICAgICAgICAgY2IuY3Jvc3MoIGFiICk7XG4gICAgICAgICAgICAgKi9cblxuICAgICAgICAgICAgY2J4ID0gY2JbMF07XG4gICAgICAgICAgICBjYnkgPSBjYlsxXTtcbiAgICAgICAgICAgIGNieiA9IGNiWzJdO1xuXG4gICAgICAgICAgICBjYlswXSA9IGNieSAqIGFiWzJdIC0gY2J6ICogYWJbMV07XG4gICAgICAgICAgICBjYlsxXSA9IGNieiAqIGFiWzBdIC0gY2J4ICogYWJbMl07XG4gICAgICAgICAgICBjYlsyXSA9IGNieCAqIGFiWzFdIC0gY2J5ICogYWJbMF07XG5cbiAgICAgICAgICAgIG5vcm1hbHNbdkFdICs9IGNiWzBdO1xuICAgICAgICAgICAgbm9ybWFsc1t2QSArIDFdICs9IGNiWzFdO1xuICAgICAgICAgICAgbm9ybWFsc1t2QSArIDJdICs9IGNiWzJdO1xuXG4gICAgICAgICAgICBub3JtYWxzW3ZCXSArPSBjYlswXTtcbiAgICAgICAgICAgIG5vcm1hbHNbdkIgKyAxXSArPSBjYlsxXTtcbiAgICAgICAgICAgIG5vcm1hbHNbdkIgKyAyXSArPSBjYlsyXTtcblxuICAgICAgICAgICAgbm9ybWFsc1t2Q10gKz0gY2JbMF07XG4gICAgICAgICAgICBub3JtYWxzW3ZDICsgMV0gKz0gY2JbMV07XG4gICAgICAgICAgICBub3JtYWxzW3ZDICsgMl0gKz0gY2JbMl07XG5cbiAgICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBwb3NpdGlvbnMubGVuZ3RoOyBpICs9IDkpIHtcblxuICAgICAgICAgICAgLypcbiAgICAgICAgICAgICBwQS5mcm9tQXJyYXkoIHBvc2l0aW9ucywgaSApO1xuICAgICAgICAgICAgIHBCLmZyb21BcnJheSggcG9zaXRpb25zLCBpICsgMyApO1xuICAgICAgICAgICAgIHBDLmZyb21BcnJheSggcG9zaXRpb25zLCBpICsgNiApO1xuICAgICAgICAgICAgICovXG5cbiAgICAgICAgICAgIHBBWzBdID0gcG9zaXRpb25zW2ldO1xuICAgICAgICAgICAgcEFbMV0gPSBwb3NpdGlvbnNbaSArIDFdO1xuICAgICAgICAgICAgcEFbMl0gPSBwb3NpdGlvbnNbaSArIDJdO1xuXG4gICAgICAgICAgICBwQlswXSA9IHBvc2l0aW9uc1tpICsgM107XG4gICAgICAgICAgICBwQlsxXSA9IHBvc2l0aW9uc1tpICsgNF07XG4gICAgICAgICAgICBwQlsyXSA9IHBvc2l0aW9uc1tpICsgNV07XG5cbiAgICAgICAgICAgIHBDWzBdID0gcG9zaXRpb25zW2kgKyA2XTtcbiAgICAgICAgICAgIHBDWzFdID0gcG9zaXRpb25zW2kgKyA3XTtcbiAgICAgICAgICAgIHBDWzJdID0gcG9zaXRpb25zW2kgKyA4XTtcblxuICAgICAgICAgICAgLypcbiAgICAgICAgICAgICBjYi5zdWJWZWN0b3JzKCBwQywgcEIgKTtcbiAgICAgICAgICAgICBhYi5zdWJWZWN0b3JzKCBwQSwgcEIgKTtcbiAgICAgICAgICAgICAqL1xuXG4gICAgICAgICAgICBjYlswXSA9IHBDWzBdIC0gcEJbMF07XG4gICAgICAgICAgICBjYlsxXSA9IHBDWzFdIC0gcEJbMV07XG4gICAgICAgICAgICBjYlsyXSA9IHBDWzJdIC0gcEJbMl07XG5cbiAgICAgICAgICAgIGFiWzBdID0gcEFbMF0gLSBwQlswXTtcbiAgICAgICAgICAgIGFiWzFdID0gcEFbMV0gLSBwQlsxXTtcbiAgICAgICAgICAgIGFiWzJdID0gcEFbMl0gLSBwQlsyXTtcblxuICAgICAgICAgICAgLypcbiAgICAgICAgICAgICBjYi5jcm9zcyggYWIgKTtcbiAgICAgICAgICAgICAqL1xuXG4gICAgICAgICAgICBjYnggPSBjYlswXTtcbiAgICAgICAgICAgIGNieSA9IGNiWzFdO1xuICAgICAgICAgICAgY2J6ID0gY2JbMl07XG5cbiAgICAgICAgICAgIGNiWzBdID0gY2J5ICogYWJbMl0gLSBjYnogKiBhYlsxXTtcbiAgICAgICAgICAgIGNiWzFdID0gY2J6ICogYWJbMF0gLSBjYnggKiBhYlsyXTtcbiAgICAgICAgICAgIGNiWzJdID0gY2J4ICogYWJbMV0gLSBjYnkgKiBhYlswXTtcblxuICAgICAgICAgICAgbm9ybWFsc1sgaSBdID0gY2JbMF07XG4gICAgICAgICAgICBub3JtYWxzWyBpICsgMSBdID0gY2JbMV07XG4gICAgICAgICAgICBub3JtYWxzWyBpICsgMiBdID0gY2JbMl07XG5cbiAgICAgICAgICAgIG5vcm1hbHNbIGkgKyAzIF0gPSBjYlswXTtcbiAgICAgICAgICAgIG5vcm1hbHNbIGkgKyA0IF0gPSBjYlsxXTtcbiAgICAgICAgICAgIG5vcm1hbHNbIGkgKyA1IF0gPSBjYlsyXTtcblxuICAgICAgICAgICAgbm9ybWFsc1sgaSArIDYgXSA9IGNiWzBdO1xuICAgICAgICAgICAgbm9ybWFsc1sgaSArIDcgXSA9IGNiWzFdO1xuICAgICAgICAgICAgbm9ybWFsc1sgaSArIDggXSA9IGNiWzJdO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgbm9ybWFsaXplTm9ybWFscyhub3JtYWxzKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gY29tcHV0ZVZlcnRleE5vcm1hbHM7XG4iXX0=
