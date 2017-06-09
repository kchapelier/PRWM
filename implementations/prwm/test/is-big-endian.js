"use strict";

var lib = require('../index'),
    should = require('chai').should();

describe('isBigEndianPlatform()', function () {
    it('should return a boolean', function () {
        lib.isBigEndianPlatform().should.be.a('boolean');
    });
});
