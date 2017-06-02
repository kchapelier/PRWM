"use strict";

module.exports = {
    AttributeTypes: require('./prwm/attribute-types'),
    isBigEndianPlatform: require('./utils/is-big-endian-platform'),
    encodePrwm: require('./prwm/encode'),
    decodePrwm: require('./prwm/decode')
};
