"use strict";

var lib = require('../index'),
    fs = require('fs'),
    should = require('chai').should();

var cubeBEBuffer = fs.readFileSync(__dirname + '/assets/cube-BE.prwm'),
    cubeLEBuffer = fs.readFileSync(__dirname + '/assets/cube-LE.prwm'),
    expectedCubeData = require('./assets/cube.js');

// see https://github.com/nodejs/node/issues/11132#issuecomment-277157700
var cubeBE = new Uint8Array(cubeBEBuffer).buffer,
    cubeLE = new Uint8Array(cubeLEBuffer).buffer;

// copy with bad versions
var cubeVersion0Array = new Uint8Array(cubeBEBuffer),
    cubeVersion2Array = new Uint8Array(cubeBEBuffer),
    cubeVersion0 = cubeVersion0Array.buffer,
    cubeVersion2 = cubeVersion2Array.buffer;

cubeVersion0Array[0] = 0;
cubeVersion2Array[0] = 2;

describe('decode()', function () {
    it('should properly read a big endian file', function () {
        var data = lib.decode(cubeBE);

        data.should.deep.equal(expectedCubeData);
    });

    it('should properly read a little endian file', function () {
        var data = lib.decode(cubeLE);

        data.should.deep.equal(expectedCubeData);
    });

    it('should throw an error if the version is 0', function () {
        (function () { lib.decode(cubeVersion0); }).should.throw('PRWM decoder: Invalid format version: 0');
    });

    it('should throw an error if the version is not the same as the lib', function () {
        (function () { lib.decode(cubeVersion2); }).should.throw('PRWM decoder: Unsupported format version: 2');
    });
});
