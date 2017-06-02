"use strict";

module.exports = {
    AttributeTypes: require('./prwm/attribute-types'),
    isBigEndianPlatform: require('./utils/is-big-endian-platform'),
    encode: require('./prwm/encode'),
    decode: require('./prwm/decode')
};
