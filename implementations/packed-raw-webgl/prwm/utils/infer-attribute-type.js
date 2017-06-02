"use strict";

var attributeTypes = require('../prwm/attribute-types');

var map = {
    Int8Array: attributeTypes.Int,
    Int16Array: attributeTypes.Int,
    Int32Array: attributeTypes.Int,
    Uint8Array: attributeTypes.Uint,
    Uint16Array: attributeTypes.Uint,
    Uint32Array: attributeTypes.Uint,
    Float32Array: attributeTypes.Float
};

module.exports = function inferAttributeType (typedArray) {
    return map[typedArray.constructor.name];
};
