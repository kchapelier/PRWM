"use strict";

var prwm = require('prwm');

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
 * Return the PicoGL attribute type for a given typed array
 * @param {ArrayBufferView} typedArray
 * @return {int} Attribute type
 * @protected
 */
PRWMLoader.prototype.getAttributeTypeForTypedArray = function (typedArray) {
    var typedArrayName = typedArray.constructor.name,
        result;

    switch (typedArrayName) {
        case 'Int8Array':
            result = this.picoGL.BYTE;
            break;
        case 'Uint8Array':
            result = this.picoGL.UNSIGNED_BYTE;
            break;
        case 'Int16Array':
            result = this.picoGL.SHORT;
            break;
        case 'Uint16Array':
            result = this.picoGL.UNSIGNED_SHORT;
            break;
        case 'Int32Array':
            result = this.picoGL.INT;
            break;
        case 'Uint32Array':
            result = this.picoGL.UNSIGNED_INT;
            break;
        case 'Float32Array':
            result = this.picoGL.FLOAT;
            break;
        default:
            throw new Error('PRWMLoader: Unrecognized typedArray: "' + typedArrayName + '"');
    }

    return result;
};

/**
 * Parse a PRWM file passed as an ArrayBuffer and directly return an instance of PicoGL's VertexArray
 * @param {ArrayBuffer} arrayBuffer ArrayBuffer containing the PRWM data
 * @param {object} attributeMapping Literal object with attribute name => attribute index mapping
 * @param {int} [offset=0] Offset (in bytes) at which the PRWM file content is located in the ArrayBuffer. Must be a multiple of 4.
 * @returns {object} Instance of PicoGL's VertexArray
 */
PRWMLoader.prototype.parse = function (arrayBuffer, attributeMapping, offset) {
    var attributeKeys = Object.keys(attributeMapping),
        decodeStart = performance.now(),
        data = prwm.decode(arrayBuffer, offset),
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
        vertexBuffer,
        attributeIndex,
        attributeName,
        attributeType,
        attributeCardinality,
        i;

    for (i = 0; i < attributeKeys.length; i++) {
        attributeName = attributeKeys[i];
        attributeIndex = attributeMapping[attributeName];
        attributeType = this.getAttributeTypeForTypedArray(data.attributes[attributeName].values);
        attributeCardinality = data.attributes[attributeName].cardinality;
        vertexBuffer = this.app.createVertexBuffer(attributeType, attributeCardinality, data.attributes[attributeName].values);

        // vertexArray.attributeBuffer() is not in doc, so avoid using directly (even though its tempting)

        if (data.attributes[attributeName].type === prwm.Int) {
            vertexArray.vertexIntegerAttributeBuffer(attributeIndex, vertexBuffer);
        } else if (data.attributes[attributeName].normalized) {
            vertexArray.vertexNormalizedAttributeBuffer(attributeIndex, vertexBuffer);
        } else {
            vertexArray.vertexAttributeBuffer(attributeIndex, vertexBuffer);
        }
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
