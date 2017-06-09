"use strict";

var lib = require('../index'),
    should = require('chai').should();

describe('Full round (encode -> decode -> compare)', function () {
    it('should work correctly for unindexed big-endian', function () {
        var attributes = {
            test: {
                cardinality: 1,
                normalized: true,
                values: new Int16Array([0, 1, 3])
            }
        };

        var arrayBuffer = lib.encode(attributes, null, true),
            decoded = lib.decode(arrayBuffer);

        decoded.version.should.equal(1);
        should.equal(decoded.indices, null);
        Object.keys(decoded.attributes).length.should.equal(1);
        decoded.attributes.test.cardinality.should.equal(1);
        decoded.attributes.test.normalized.should.equal(true);
        decoded.attributes.test.type.should.equal(0);
        decoded.attributes.test.values.should.deep.equal(attributes.test.values);
    });

    it('should work correctly for unindexed little-endian', function () {
        var attributes = {
            test: {
                cardinality: 1,
                normalized: true,
                values: new Int16Array([0, 1, 3])
            }
        };

        var arrayBuffer = lib.encode(attributes, null, false),
            decoded = lib.decode(arrayBuffer);

        decoded.version.should.equal(1);
        should.equal(decoded.indices, null);
        Object.keys(decoded.attributes).length.should.equal(1);
        decoded.attributes.test.cardinality.should.equal(1);
        decoded.attributes.test.normalized.should.equal(true);
        decoded.attributes.test.type.should.equal(0);
        decoded.attributes.test.values.should.deep.equal(attributes.test.values);
    });

    it('should work correctly for indexed big-endian', function () {
        var attributes = {
            test: {
                cardinality: 1,
                normalized: true,
                values: new Int16Array([0, 1, 3])
            }
        };

        var indices = new Uint16Array([0, 1, 2]);

        var arrayBuffer = lib.encode(attributes, indices, true),
            decoded = lib.decode(arrayBuffer);

        decoded.version.should.equal(1);
        decoded.indices.should.deep.equal(indices);
        Object.keys(decoded.attributes).length.should.equal(1);
        decoded.attributes.test.cardinality.should.equal(1);
        decoded.attributes.test.normalized.should.equal(true);
        decoded.attributes.test.type.should.equal(0);
        decoded.attributes.test.values.should.deep.equal(attributes.test.values);
    });

    it('should work correctly for indexed little-endian', function () {
        var attributes = {
            test: {
                cardinality: 1,
                normalized: true,
                values: new Int16Array([0, 1, 3])
            }
        };

        var indices = new Uint16Array([0, 1, 2]);

        var arrayBuffer = lib.encode(attributes, indices, false),
            decoded = lib.decode(arrayBuffer);

        decoded.version.should.equal(1);
        decoded.indices.should.deep.equal(indices);
        Object.keys(decoded.attributes).length.should.equal(1);
        decoded.attributes.test.cardinality.should.equal(1);
        decoded.attributes.test.normalized.should.equal(true);
        decoded.attributes.test.type.should.equal(0);
        decoded.attributes.test.values.should.deep.equal(attributes.test.values);
    });

    it('should work correctly with all kind of attributes in big-endian', function () {
        var attributes = {
            test1: {
                cardinality: 1,
                normalized: true,
                values: new Int8Array([0, 1, -3])
            },
            test2: {
                cardinality: 1,
                normalized: true,
                values: new Uint8Array([0, 1, 3])
            },
            test3: {
                cardinality: 1,
                normalized: true,
                values: new Int16Array([0, 1, -3])
            },
            test4: {
                cardinality: 1,
                normalized: true,
                values: new Uint16Array([0, 1, 3])
            },
            test5: {
                cardinality: 1,
                normalized: true,
                values: new Int32Array([0, 1, -3])
            },
            test6: {
                cardinality: 1,
                normalized: true,
                values: new Uint16Array([0, 1, 3])
            },
            test7: {
                cardinality: 1,
                normalized: true,
                values: new Float32Array([0, 1.3, -3.9])
            }
        };

        var arrayBuffer = lib.encode(attributes, null, true),
            decoded = lib.decode(arrayBuffer);

        var attributeKeys = Object.keys(attributes);

        Object.keys(decoded.attributes).length.should.equal(attributeKeys.length);

        for (var i = 0; i < attributeKeys.length; i++) {
            var attributeKey = attributeKeys[i];

            decoded.attributes[attributeKey].cardinality.should.equal(1);
            decoded.attributes[attributeKey].normalized.should.equal(true);
            decoded.attributes[attributeKey].type.should.equal(0);
            decoded.attributes[attributeKey].values.should.deep.equal(attributes[attributeKey].values);
        }
    });

    it('should work correctly with all kind of attributes in big-endian', function () {
        var attributes = {
            test1: {
                cardinality: 1,
                normalized: true,
                values: new Int8Array([0, 1, -3])
            },
            test2: {
                cardinality: 1,
                normalized: true,
                values: new Uint8Array([0, 1, 3])
            },
            test3: {
                cardinality: 1,
                normalized: true,
                values: new Int16Array([0, 1, -3])
            },
            test4: {
                cardinality: 1,
                normalized: true,
                values: new Uint16Array([0, 1, 3])
            },
            test5: {
                cardinality: 1,
                normalized: true,
                values: new Int32Array([0, 1, -3])
            },
            test6: {
                cardinality: 1,
                normalized: true,
                values: new Uint16Array([0, 1, 3])
            },
            test7: {
                cardinality: 1,
                normalized: true,
                values: new Float32Array([0, 1.3, -3.9])
            }
        };

        var arrayBuffer = lib.encode(attributes, null, false),
            decoded = lib.decode(arrayBuffer);

        var attributeKeys = Object.keys(attributes);

        Object.keys(decoded.attributes).length.should.equal(attributeKeys.length);

        for (var i = 0; i < attributeKeys.length; i++) {
            var attributeKey = attributeKeys[i];

            decoded.attributes[attributeKey].cardinality.should.equal(1);
            decoded.attributes[attributeKey].normalized.should.equal(true);
            decoded.attributes[attributeKey].type.should.equal(0);
            decoded.attributes[attributeKey].values.should.deep.equal(attributes[attributeKey].values);
        }
    });

    it('should support all cardinality', function () {
        var attributes = {
            test: {
                cardinality: 0,
                normalized: true,
                values: new Int8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
            }
        };

        for (var i = 1; i <= 4; i++) {
            attributes.test.cardinality = i;

            var arrayBuffer = lib.encode(attributes, null, false),
                decoded = lib.decode(arrayBuffer);

            decoded.attributes.test.cardinality.should.equal(i);
            decoded.attributes.test.normalized.should.equal(true);
            decoded.attributes.test.type.should.equal(0);
            decoded.attributes.test.values.should.deep.equal(attributes.test.values);
        }
    });

    it('should support all type of attribute (float and integer)', function () {
        var attributes = {
            test: {
                cardinality: 1,
                type: 0,
                normalized: true,
                values: new Int8Array([0, 1, 2, 3])
            }
        };

        var arrayBuffer = lib.encode(attributes, null, false),
            decoded = lib.decode(arrayBuffer);

        decoded.attributes.test.cardinality.should.equal(1);
        decoded.attributes.test.normalized.should.equal(true);
        decoded.attributes.test.type.should.equal(0);
        decoded.attributes.test.values.should.deep.equal(attributes.test.values);

        attributes.test.type = 1;

        arrayBuffer = lib.encode(attributes, null, false);
        decoded = lib.decode(arrayBuffer);

        decoded.attributes.test.cardinality.should.equal(1);
        decoded.attributes.test.normalized.should.equal(true);
        decoded.attributes.test.type.should.equal(1);
        decoded.attributes.test.values.should.deep.equal(attributes.test.values);
    });

    it('should support normalized and not normalized attributes', function () {
        var attributes = {
            test: {
                cardinality: 1,
                normalized: true,
                values: new Int8Array([0, 1, 2, 3])
            }
        };

        var arrayBuffer = lib.encode(attributes, null, false),
            decoded = lib.decode(arrayBuffer);

        decoded.attributes.test.cardinality.should.equal(1);
        decoded.attributes.test.normalized.should.equal(true);
        decoded.attributes.test.type.should.equal(0);
        decoded.attributes.test.values.should.deep.equal(attributes.test.values);

        attributes.test.normalized = false;

        arrayBuffer = lib.encode(attributes, null, false);
        decoded = lib.decode(arrayBuffer);

        decoded.attributes.test.cardinality.should.equal(1);
        decoded.attributes.test.normalized.should.equal(false);
        decoded.attributes.test.type.should.equal(0);
        decoded.attributes.test.values.should.deep.equal(attributes.test.values);
    });

});
