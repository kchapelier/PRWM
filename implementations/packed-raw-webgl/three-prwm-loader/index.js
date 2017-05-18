"use strict";

var prwm = require('../prwm/index');

THREE.PRWMLoader = function PRWMLoader (manager) {
    this.manager = ( manager !== undefined ) ? manager : THREE.DefaultLoadingManager;
};

THREE.PRWMLoader.prototype = {

    constructor: THREE.PRWMLoader,

    load: function ( url, onLoad, onProgress, onError ) {

        var scope = this;

        var loader = new THREE.FileLoader( scope.manager );
        loader.setResponseType( 'arraybuffer' );
        loader.load( url, function ( arrayBuffer ) {
            onLoad( scope.parse( arrayBuffer ) );
        }, onProgress, onError );

    },

    parse: function ( arrayBuffer ) {
        console.time('PRWMLoader');

        var data = prwm.decodePrwm(arrayBuffer),
            attributesKey = Object.keys(data.attributes),
            bufferGeometry = new THREE.BufferGeometry(),
            attribute,
            i;

        for (i = 0; i < attributesKey.length; i++) {
            attribute = data.attributes[attributesKey[i]];
            bufferGeometry.addAttribute(attributesKey[i], new THREE.BufferAttribute(attribute.values, attribute.cardinality));
        }

        bufferGeometry.setIndex(new THREE.BufferAttribute(data.indices, 1));

        console.timeEnd('PRWMLoader');

        return bufferGeometry;
    }
};

THREE.PRWMLoader.isBigEndianPlatform = function () {
    return prwm.isBigEndianPlatform();
};
