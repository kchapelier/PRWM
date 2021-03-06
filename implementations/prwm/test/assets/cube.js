"use strict";

module.exports = function (bigEndian) {
    return {
        version: 1,
        bigEndian: bigEndian,
        attributes: {
            position: {
                type: 0,
                    normalized: false,
                    cardinality: 3,
                    values: new Float32Array([-0.5,-0.5,0.5,-0.5,0.5,0.5,-0.5,0.5,-0.5,-0.5,-0.5,-0.5,0.5,-0.5,-0.5,0.5,0.5,-0.5,0.5,0.5,0.5,0.5,-0.5,0.5,0.5,-0.5,-0.5,0.5,-0.5,0.5,-0.5,-0.5,0.5,-0.5,-0.5,-0.5,0.5,0.5,0.5,0.5,0.5,-0.5,-0.5,0.5,-0.5,-0.5,0.5,0.5,-0.5,-0.5,-0.5,-0.5,0.5,-0.5,0.5,0.5,-0.5,0.5,-0.5,-0.5,0.5,-0.5,0.5,0.5,0.5,0.5,-0.5,0.5,0.5,-0.5,-0.5,0.5])
            },
            normal: {
                type: 0,
                    normalized: false,
                    cardinality: 3,
                    values: new Float32Array([-1,0,0,-1,0,0,-1,0,0,-1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,0,1,0,0,1,0,0,1,0,0,1])
            }
        },
        indices: new Uint16Array([0,1,2,0,2,3,4,5,6,4,6,7,8,9,10,8,10,11,12,13,14,12,14,15,16,17,18,16,18,19,20,21,22,20,22,23])
    };
};
