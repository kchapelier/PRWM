"use strict";

var prwm = require('../prwm/index');

var PRWMLoader = function PRWMLoader (manager) {
    //this.manager = ( manager !== undefined ) ? manager : THREE.DefaultLoadingManager;
};

PRWMLoader.prototype = {
    constructor: PRWMLoader,
    load: function ( url, onLoad, onProgress, onError ) {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", url, true);
        xhr.responseType = 'arraybuffer';


        /*
        var loader = new THREE.FileLoader( this.manager );
        loader.setResponseType( 'arraybuffer' );
        loader.load( url, function ( buffer ) {

        });
        */

        xhr.onload = function (e) {
            if (this.readyState === 4) {
                console.time('PRWMLoader');
                var data = prwm.decodePrwm(this.response),
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

                onLoad(bufferGeometry);
            }
        };

        xhr.send(null);
    }
};

module.exports = PRWMLoader;
