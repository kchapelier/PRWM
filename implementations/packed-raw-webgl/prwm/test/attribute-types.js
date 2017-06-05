"use strict";

var lib = require('../'),
    should = require('chai').should();

describe('AttributeTypes', function () {
    it('should contain the values defined by the spec', function () {
        lib.Float.should.equal(0);
        lib.Int.should.equal(1);
    });
});
