"use strict";

var lib = require('../'),
    should = require('chai').should();

function generateAttributes (nbAttributes) {
    var attr = {},
        i = 1;

    for (; i <= nbAttributes; i++) {
        attr['attribute' + i] = { cardinality: 1, values: new Uint8Array([0, 1]) };
    }

    return attr;
}

describe('encode()', function () {
    it('should throw an error if no attribute is provided', function () {
        (function () {
            lib.encode(null, null, false);
        }).should.throw('PRWM encoder: The model must have at least one attribute');

        (function () {
            lib.encode({}, null, false);
        }).should.throw('PRWM encoder: The model must have at least one attribute');
    });

    it('should throw an error if more than 31 attributes are provided', function () {
        (function () {
            lib.encode(generateAttributes(32), null, false);
        }).should.throw('PRWM encoder: The model can have at most 31 attributes');
    });

    it('should not throw error if the number of attribute is between 1 and 31', function () {
        (function () {
            lib.encode(generateAttributes(1), null, false);
        }).should.not.throw();

        (function () {
            lib.encode(generateAttributes(31), null, false);
        }).should.not.throw();
    });

    it('should return an ArrayBuffer', function () {
        lib.encode(generateAttributes(1), null, false).should.be.an('ArrayBuffer');
    });

    it('should not support Float64Array as attribute values', function () {
        (function () {
            lib.encode({
                position: {
                    cardinality: 3,
                    values: new Float64Array([0, 1, 2])
                }
            }, null, false);
        }).should.throw('PRWM encoder: Unsupported attribute values type: Float64Array');
    });

    it('should not support non-typed-array as attribute values', function () {
        (function () {
            lib.encode({
                position: {
                    cardinality: 3,
                    values: [0, 1, 2]
                }
            }, null, false);
        }).should.throw('PRWM encoder: Unsupported attribute values type: Array');
    });

    it('should not support indices other than Uint16Array and Uint32Array', function () {
        (function () {
            lib.encode(generateAttributes(1), new Uint8Array([0, 1]), false);
        }).should.throw('PRWM encoder: The indices must be represented as an Uint16Array or an Uint32Array');

        (function () {
            lib.encode(generateAttributes(1), [0, 1], false);
        }).should.throw('PRWM encoder: The indices must be represented as an Uint16Array or an Uint32Array');
    });

    it('should specify it is the version 1 of the format', function () {
        var arrayBuffer = lib.encode(generateAttributes(1), null, false);

        var array = new Uint8Array(arrayBuffer);

        array[5].should.equal(0);
        array[6].should.equal(0);
        array[7].should.equal(0);
    });

    it('should set the number of indices to 0 for non-indexed geometry', function () {
        var arrayBuffer = lib.encode(generateAttributes(1), null, false);

        var array = new Uint8Array(arrayBuffer);

        array[5].should.equal(0);
        array[6].should.equal(0);
        array[7].should.equal(0);
    });

    it('should set the number of indices to the correct value for indexed geometry', function () {
        var arrayBuffer = lib.encode(generateAttributes(1), new Uint16Array([0, 1]), false),
            array = new Uint8Array(arrayBuffer);

        array[5].should.equal(2);
        array[6].should.equal(0);
        array[7].should.equal(0);

        arrayBuffer = lib.encode(generateAttributes(1), new Uint16Array([0, 1]), true);
        array = new Uint8Array(arrayBuffer);

        array[5].should.equal(0);
        array[6].should.equal(0);
        array[7].should.equal(2);
    });

    it('should set the number of attribute values to the correct value', function () {
        var arrayBuffer = lib.encode({ attrib: { cardinality: 1, values: new Uint8Array([0, 1]) } }, null, false),
            array = new Uint8Array(arrayBuffer);

        array[2].should.equal(2);
        array[3].should.equal(0);
        array[4].should.equal(0);

        arrayBuffer = lib.encode({ attrib: { cardinality: 2, values: new Uint8Array([0, 1]) } }, null, false);
        array = new Uint8Array(arrayBuffer);

        array[2].should.equal(1);
        array[3].should.equal(0);
        array[4].should.equal(0);

        arrayBuffer = lib.encode({ attrib: { cardinality: 1, values: new Uint8Array([0, 1]) } }, null, true);
        array = new Uint8Array(arrayBuffer);

        array[2].should.equal(0);
        array[3].should.equal(0);
        array[4].should.equal(2);

        arrayBuffer = lib.encode({ attrib: { cardinality: 2, values: new Uint8Array([0, 1]) } }, null, true);
        array = new Uint8Array(arrayBuffer);

        array[2].should.equal(0);
        array[3].should.equal(0);
        array[4].should.equal(1);
    });
});
