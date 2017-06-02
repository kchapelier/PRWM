"use strict";

var lib = require('../'),
    should = require('chai').should();

describe('AttributeTypes', function () {
    it('should be a object', function () {
        lib.AttributeTypes.should.be.a('object');
    });

    it('should contain the values defined by the spec', function () {
        lib.AttributeTypes.Int.should.equal(0);
        lib.AttributeTypes.Uint.should.equal(1);
        lib.AttributeTypes.Float.should.equal(2);
    });
});
