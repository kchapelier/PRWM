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
