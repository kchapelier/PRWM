"use strict";

THREE.DumbJSONLoader = function ( manager ) {

    this.manager = ( manager !== undefined ) ? manager : THREE.DefaultLoadingManager;
    this.mappingAttributes = {
        vertices: ['position', Float32Array, 3],
        normals: ['normal', Float32Array, 3],
        uvs: ['uv', Float32Array, 2]
    };

};

THREE.DumbJSONLoader.prototype = {

    constructor: THREE.DumbJSONLoader,

    load: function ( url, onLoad, onProgress, onError ) {

        var scope = this;

        var loader = new THREE.FileLoader( scope.manager );
        loader.setResponseType( 'json' );
        loader.load( url, function ( json ) {
            onLoad( scope.parse( json ) );
        }, onProgress, onError );

    },

    parse: function ( json ) {

        console.time( 'DumbJSONLoader' );

        var attributesKey = Object.keys(json),
            bufferGeometry = new THREE.BufferGeometry(),
            mapping,
            attribute,
            i;

        for (i = 0; i < attributesKey.length; i++) {
            if (attributesKey[i] !== 'indices' && !!this.mappingAttributes[attributesKey[i]]) {
                mapping = this.mappingAttributes[attributesKey[i]];
                attribute = json[attributesKey[i]];
                bufferGeometry.addAttribute(
                    mapping[0],
                    new THREE.BufferAttribute(new mapping[1](attribute), mapping[2])
                );
            }
        }

        bufferGeometry.setIndex(new THREE.BufferAttribute(new Uint32Array(json.indices), 1));

        console.timeEnd( 'DumbJSONLoader' );

        return bufferGeometry;

    }

};
