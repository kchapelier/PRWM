(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.PRWMLoaderWrapper = f()}})(function(){var define,module,exports;return (function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
/**
 * @author Kevin Chapelier / https://github.com/kchapelier
 * See https://github.com/kchapelier/PRWM for more informations about this file format
 */

module.exports = function PRWMLoaderWrapper ( THREE ) {
    "use strict";

    var bigEndianPlatform = null;

    /**
     * Check if the endianness of the platform is big-endian (most significant bit first)
     * @returns {boolean} True if big-endian, false if little-endian
     */
    function isBigEndianPlatform() {
        if ( bigEndianPlatform === null ) {
            var buffer = new ArrayBuffer( 2 ),
                uint8Array = new Uint8Array( buffer ),
                uint16Array = new Uint16Array( buffer );

            uint8Array[ 0 ] = 0xAA; // set first byte
            uint8Array[ 1 ] = 0xBB; // set second byte
            bigEndianPlatform = ( uint16Array[ 0 ] === 0xAABB );
        }

        return bigEndianPlatform;
    }

    // match the values defined in the spec to the TypedArray types
    var InvertedEncodingTypes = [
        null,
        Float32Array,
        null,
        Int8Array,
        Int16Array,
        null,
        Int32Array,
        Uint8Array,
        Uint16Array,
        null,
        Uint32Array
    ];

    // define the method to use on a DataView, corresponding the TypedArray type
    var getMethods = {
        Uint16Array: 'getUint16',
        Uint32Array: 'getUint32',
        Int16Array: 'getInt16',
        Int32Array: 'getInt32',
        Float32Array: 'getFloat32',
        Float64Array: 'getFloat64'
    };

    function copyFromBuffer( sourceArrayBuffer, viewType, position, length, fromBigEndian ) {
        var bytesPerElement = viewType.BYTES_PER_ELEMENT,
            result;

        if ( fromBigEndian === isBigEndianPlatform() || bytesPerElement === 1 ) {
            result = new viewType( sourceArrayBuffer, position, length );
        } else {
            var readView = new DataView( sourceArrayBuffer, position, length * bytesPerElement ),
                getMethod = getMethods[ viewType.name ],
                littleEndian = ! fromBigEndian,
                i = 0;

            result = new viewType( length );

            for ( ; i < length; i ++ ) {
                result[ i ] = readView[ getMethod ]( i * bytesPerElement, littleEndian );
            }
        }

        return result;
    }

    function decodePrwm( buffer, offset ) {
        offset = offset || 0;

        var array = new Uint8Array( buffer, offset ),
            version = array[ 0 ],
            flags = array[ 1 ],
            indexedGeometry = !! ( flags >> 7 & 0x01 ),
            indicesType = flags >> 6 & 0x01,
            bigEndian = ( flags >> 5 & 0x01 ) === 1,
            attributesNumber = flags & 0x1F,
            valuesNumber = 0,
            indicesNumber = 0;

        if ( bigEndian ) {
            valuesNumber = ( array[ 2 ] << 16 ) + ( array[ 3 ] << 8 ) + array[ 4 ];
            indicesNumber = ( array[ 5 ] << 16 ) + ( array[ 6 ] << 8 ) + array[ 7 ];
        } else {
            valuesNumber = array[ 2 ] + ( array[ 3 ] << 8 ) + ( array[ 4 ] << 16 );
            indicesNumber = array[ 5 ] + ( array[ 6 ] << 8 ) + ( array[ 7 ] << 16 );
        }

        /** PRELIMINARY CHECKS **/

        if ( offset / 4 % 1 !== 0 ) {
            throw new Error( 'PRWM decoder: Offset should be a multiple of 4, received ' + offset );
        }

        if ( version === 0 ) {
            throw new Error( 'PRWM decoder: Invalid format version: 0' );
        } else if ( version !== 1 ) {
            throw new Error( 'PRWM decoder: Unsupported format version: ' + version );
        }

        if ( ! indexedGeometry ) {
            if ( indicesType !== 0 ) {
                throw new Error( 'PRWM decoder: Indices type must be set to 0 for non-indexed geometries' );
            } else if ( indicesNumber !== 0 ) {
                throw new Error( 'PRWM decoder: Number of indices must be set to 0 for non-indexed geometries' );
            }
        }

        /** PARSING **/

        var pos = 8;

        var attributes = {},
            attributeName,
            char,
            attributeType,
            cardinality,
            encodingType,
            arrayType,
            values,
            indices,
            i;

        for ( i = 0; i < attributesNumber; i ++ ) {
            attributeName = '';

            while ( pos < array.length ) {
                char = array[ pos ];
                pos ++;

                if ( char === 0 ) {
                    break;
                } else {
                    attributeName += String.fromCharCode( char );
                }
            }

            flags = array[ pos ];

            attributeType = flags >> 7 & 0x01;
            cardinality = ( flags >> 4 & 0x03 ) + 1;
            encodingType = flags & 0x0F;
            arrayType = InvertedEncodingTypes[ encodingType ];

            pos ++;

            // padding to next multiple of 4
            pos = Math.ceil( pos / 4 ) * 4;

            values = copyFromBuffer( buffer, arrayType, pos + offset, cardinality * valuesNumber, bigEndian );

            pos += arrayType.BYTES_PER_ELEMENT * cardinality * valuesNumber;

            attributes[ attributeName ] = {
                type: attributeType,
                cardinality: cardinality,
                values: values
            };
        }

        pos = Math.ceil( pos / 4 ) * 4;

        indices = null;

        if ( indexedGeometry ) {
            indices = copyFromBuffer(
                buffer,
                indicesType === 1 ? Uint32Array : Uint16Array,
                pos + offset,
                indicesNumber,
                bigEndian
            );
        }

        return {
            version: version,
            attributes: attributes,
            indices: indices
        };
    }

    // Define the public interface

    var PRWMLoader = function PRWMLoader( manager ) {
        this.manager = ( manager !== undefined ) ? manager : THREE.DefaultLoadingManager;
    };

    PRWMLoader.prototype = {
        constructor: THREE.PRWMLoader,

        load: function ( url, onLoad, onProgress, onError ) {
            var scope = this;

            url = url.replace( /\*/g, isBigEndianPlatform() ? 'be' : 'le' );

            var loader = new THREE.FileLoader( scope.manager );
            loader.setPath( scope.path );
            loader.setResponseType( 'arraybuffer' );

            loader.load( url, function ( arrayBuffer ) {
                onLoad( scope.parse( arrayBuffer ) );
            }, onProgress, onError );
        },

        setPath: function ( value ) {
          this.path = value;
          return this;
        },

        parse: function ( arrayBuffer, offset ) {
            var data = decodePrwm( arrayBuffer, offset ),
                attributesKey = Object.keys( data.attributes ),
                bufferGeometry = new THREE.BufferGeometry(),
                attribute,
                i;

            for ( i = 0; i < attributesKey.length; i ++ ) {
                attribute = data.attributes[ attributesKey[ i ] ];
                bufferGeometry.addAttribute( attributesKey[ i ], new THREE.BufferAttribute( attribute.values, attribute.cardinality, attribute.normalized ) );
            }

            if ( data.indices !== null ) {
                bufferGeometry.setIndex( new THREE.BufferAttribute( data.indices, 1 ) );
            }

            return bufferGeometry;
        }
    };

    PRWMLoader.isBigEndianPlatform = function () {
        return isBigEndianPlatform();
    };

    return PRWMLoader;

};

},{}]},{},[1])(1)
});

//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uL3Vzci9sb2NhbC9saWIvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsImluZGV4LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uKCl7ZnVuY3Rpb24gcihlLG4sdCl7ZnVuY3Rpb24gbyhpLGYpe2lmKCFuW2ldKXtpZighZVtpXSl7dmFyIGM9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZTtpZighZiYmYylyZXR1cm4gYyhpLCEwKTtpZih1KXJldHVybiB1KGksITApO3ZhciBhPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIraStcIidcIik7dGhyb3cgYS5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGF9dmFyIHA9bltpXT17ZXhwb3J0czp7fX07ZVtpXVswXS5jYWxsKHAuZXhwb3J0cyxmdW5jdGlvbihyKXt2YXIgbj1lW2ldWzFdW3JdO3JldHVybiBvKG58fHIpfSxwLHAuZXhwb3J0cyxyLGUsbix0KX1yZXR1cm4gbltpXS5leHBvcnRzfWZvcih2YXIgdT1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlLGk9MDtpPHQubGVuZ3RoO2krKylvKHRbaV0pO3JldHVybiBvfXJldHVybiByfSkoKSIsIi8qKlxuICogQGF1dGhvciBLZXZpbiBDaGFwZWxpZXIgLyBodHRwczovL2dpdGh1Yi5jb20va2NoYXBlbGllclxuICogU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9rY2hhcGVsaWVyL1BSV00gZm9yIG1vcmUgaW5mb3JtYXRpb25zIGFib3V0IHRoaXMgZmlsZSBmb3JtYXRcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIFBSV01Mb2FkZXJXcmFwcGVyICggVEhSRUUgKSB7XG4gICAgXCJ1c2Ugc3RyaWN0XCI7XG5cbiAgICB2YXIgYmlnRW5kaWFuUGxhdGZvcm0gPSBudWxsO1xuXG4gICAgLyoqXG4gICAgICogQ2hlY2sgaWYgdGhlIGVuZGlhbm5lc3Mgb2YgdGhlIHBsYXRmb3JtIGlzIGJpZy1lbmRpYW4gKG1vc3Qgc2lnbmlmaWNhbnQgYml0IGZpcnN0KVxuICAgICAqIEByZXR1cm5zIHtib29sZWFufSBUcnVlIGlmIGJpZy1lbmRpYW4sIGZhbHNlIGlmIGxpdHRsZS1lbmRpYW5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBpc0JpZ0VuZGlhblBsYXRmb3JtKCkge1xuICAgICAgICBpZiAoIGJpZ0VuZGlhblBsYXRmb3JtID09PSBudWxsICkge1xuICAgICAgICAgICAgdmFyIGJ1ZmZlciA9IG5ldyBBcnJheUJ1ZmZlciggMiApLFxuICAgICAgICAgICAgICAgIHVpbnQ4QXJyYXkgPSBuZXcgVWludDhBcnJheSggYnVmZmVyICksXG4gICAgICAgICAgICAgICAgdWludDE2QXJyYXkgPSBuZXcgVWludDE2QXJyYXkoIGJ1ZmZlciApO1xuXG4gICAgICAgICAgICB1aW50OEFycmF5WyAwIF0gPSAweEFBOyAvLyBzZXQgZmlyc3QgYnl0ZVxuICAgICAgICAgICAgdWludDhBcnJheVsgMSBdID0gMHhCQjsgLy8gc2V0IHNlY29uZCBieXRlXG4gICAgICAgICAgICBiaWdFbmRpYW5QbGF0Zm9ybSA9ICggdWludDE2QXJyYXlbIDAgXSA9PT0gMHhBQUJCICk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gYmlnRW5kaWFuUGxhdGZvcm07XG4gICAgfVxuXG4gICAgLy8gbWF0Y2ggdGhlIHZhbHVlcyBkZWZpbmVkIGluIHRoZSBzcGVjIHRvIHRoZSBUeXBlZEFycmF5IHR5cGVzXG4gICAgdmFyIEludmVydGVkRW5jb2RpbmdUeXBlcyA9IFtcbiAgICAgICAgbnVsbCxcbiAgICAgICAgRmxvYXQzMkFycmF5LFxuICAgICAgICBudWxsLFxuICAgICAgICBJbnQ4QXJyYXksXG4gICAgICAgIEludDE2QXJyYXksXG4gICAgICAgIG51bGwsXG4gICAgICAgIEludDMyQXJyYXksXG4gICAgICAgIFVpbnQ4QXJyYXksXG4gICAgICAgIFVpbnQxNkFycmF5LFxuICAgICAgICBudWxsLFxuICAgICAgICBVaW50MzJBcnJheVxuICAgIF07XG5cbiAgICAvLyBkZWZpbmUgdGhlIG1ldGhvZCB0byB1c2Ugb24gYSBEYXRhVmlldywgY29ycmVzcG9uZGluZyB0aGUgVHlwZWRBcnJheSB0eXBlXG4gICAgdmFyIGdldE1ldGhvZHMgPSB7XG4gICAgICAgIFVpbnQxNkFycmF5OiAnZ2V0VWludDE2JyxcbiAgICAgICAgVWludDMyQXJyYXk6ICdnZXRVaW50MzInLFxuICAgICAgICBJbnQxNkFycmF5OiAnZ2V0SW50MTYnLFxuICAgICAgICBJbnQzMkFycmF5OiAnZ2V0SW50MzInLFxuICAgICAgICBGbG9hdDMyQXJyYXk6ICdnZXRGbG9hdDMyJyxcbiAgICAgICAgRmxvYXQ2NEFycmF5OiAnZ2V0RmxvYXQ2NCdcbiAgICB9O1xuXG4gICAgZnVuY3Rpb24gY29weUZyb21CdWZmZXIoIHNvdXJjZUFycmF5QnVmZmVyLCB2aWV3VHlwZSwgcG9zaXRpb24sIGxlbmd0aCwgZnJvbUJpZ0VuZGlhbiApIHtcbiAgICAgICAgdmFyIGJ5dGVzUGVyRWxlbWVudCA9IHZpZXdUeXBlLkJZVEVTX1BFUl9FTEVNRU5ULFxuICAgICAgICAgICAgcmVzdWx0O1xuXG4gICAgICAgIGlmICggZnJvbUJpZ0VuZGlhbiA9PT0gaXNCaWdFbmRpYW5QbGF0Zm9ybSgpIHx8IGJ5dGVzUGVyRWxlbWVudCA9PT0gMSApIHtcbiAgICAgICAgICAgIHJlc3VsdCA9IG5ldyB2aWV3VHlwZSggc291cmNlQXJyYXlCdWZmZXIsIHBvc2l0aW9uLCBsZW5ndGggKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhciByZWFkVmlldyA9IG5ldyBEYXRhVmlldyggc291cmNlQXJyYXlCdWZmZXIsIHBvc2l0aW9uLCBsZW5ndGggKiBieXRlc1BlckVsZW1lbnQgKSxcbiAgICAgICAgICAgICAgICBnZXRNZXRob2QgPSBnZXRNZXRob2RzWyB2aWV3VHlwZS5uYW1lIF0sXG4gICAgICAgICAgICAgICAgbGl0dGxlRW5kaWFuID0gISBmcm9tQmlnRW5kaWFuLFxuICAgICAgICAgICAgICAgIGkgPSAwO1xuXG4gICAgICAgICAgICByZXN1bHQgPSBuZXcgdmlld1R5cGUoIGxlbmd0aCApO1xuXG4gICAgICAgICAgICBmb3IgKCA7IGkgPCBsZW5ndGg7IGkgKysgKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0WyBpIF0gPSByZWFkVmlld1sgZ2V0TWV0aG9kIF0oIGkgKiBieXRlc1BlckVsZW1lbnQsIGxpdHRsZUVuZGlhbiApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBkZWNvZGVQcndtKCBidWZmZXIsIG9mZnNldCApIHtcbiAgICAgICAgb2Zmc2V0ID0gb2Zmc2V0IHx8IDA7XG5cbiAgICAgICAgdmFyIGFycmF5ID0gbmV3IFVpbnQ4QXJyYXkoIGJ1ZmZlciwgb2Zmc2V0ICksXG4gICAgICAgICAgICB2ZXJzaW9uID0gYXJyYXlbIDAgXSxcbiAgICAgICAgICAgIGZsYWdzID0gYXJyYXlbIDEgXSxcbiAgICAgICAgICAgIGluZGV4ZWRHZW9tZXRyeSA9ICEhICggZmxhZ3MgPj4gNyAmIDB4MDEgKSxcbiAgICAgICAgICAgIGluZGljZXNUeXBlID0gZmxhZ3MgPj4gNiAmIDB4MDEsXG4gICAgICAgICAgICBiaWdFbmRpYW4gPSAoIGZsYWdzID4+IDUgJiAweDAxICkgPT09IDEsXG4gICAgICAgICAgICBhdHRyaWJ1dGVzTnVtYmVyID0gZmxhZ3MgJiAweDFGLFxuICAgICAgICAgICAgdmFsdWVzTnVtYmVyID0gMCxcbiAgICAgICAgICAgIGluZGljZXNOdW1iZXIgPSAwO1xuXG4gICAgICAgIGlmICggYmlnRW5kaWFuICkge1xuICAgICAgICAgICAgdmFsdWVzTnVtYmVyID0gKCBhcnJheVsgMiBdIDw8IDE2ICkgKyAoIGFycmF5WyAzIF0gPDwgOCApICsgYXJyYXlbIDQgXTtcbiAgICAgICAgICAgIGluZGljZXNOdW1iZXIgPSAoIGFycmF5WyA1IF0gPDwgMTYgKSArICggYXJyYXlbIDYgXSA8PCA4ICkgKyBhcnJheVsgNyBdO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFsdWVzTnVtYmVyID0gYXJyYXlbIDIgXSArICggYXJyYXlbIDMgXSA8PCA4ICkgKyAoIGFycmF5WyA0IF0gPDwgMTYgKTtcbiAgICAgICAgICAgIGluZGljZXNOdW1iZXIgPSBhcnJheVsgNSBdICsgKCBhcnJheVsgNiBdIDw8IDggKSArICggYXJyYXlbIDcgXSA8PCAxNiApO1xuICAgICAgICB9XG5cbiAgICAgICAgLyoqIFBSRUxJTUlOQVJZIENIRUNLUyAqKi9cblxuICAgICAgICBpZiAoIG9mZnNldCAvIDQgJSAxICE9PSAwICkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCAnUFJXTSBkZWNvZGVyOiBPZmZzZXQgc2hvdWxkIGJlIGEgbXVsdGlwbGUgb2YgNCwgcmVjZWl2ZWQgJyArIG9mZnNldCApO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCB2ZXJzaW9uID09PSAwICkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCAnUFJXTSBkZWNvZGVyOiBJbnZhbGlkIGZvcm1hdCB2ZXJzaW9uOiAwJyApO1xuICAgICAgICB9IGVsc2UgaWYgKCB2ZXJzaW9uICE9PSAxICkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCAnUFJXTSBkZWNvZGVyOiBVbnN1cHBvcnRlZCBmb3JtYXQgdmVyc2lvbjogJyArIHZlcnNpb24gKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICggISBpbmRleGVkR2VvbWV0cnkgKSB7XG4gICAgICAgICAgICBpZiAoIGluZGljZXNUeXBlICE9PSAwICkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvciggJ1BSV00gZGVjb2RlcjogSW5kaWNlcyB0eXBlIG11c3QgYmUgc2V0IHRvIDAgZm9yIG5vbi1pbmRleGVkIGdlb21ldHJpZXMnICk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCBpbmRpY2VzTnVtYmVyICE9PSAwICkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvciggJ1BSV00gZGVjb2RlcjogTnVtYmVyIG9mIGluZGljZXMgbXVzdCBiZSBzZXQgdG8gMCBmb3Igbm9uLWluZGV4ZWQgZ2VvbWV0cmllcycgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8qKiBQQVJTSU5HICoqL1xuXG4gICAgICAgIHZhciBwb3MgPSA4O1xuXG4gICAgICAgIHZhciBhdHRyaWJ1dGVzID0ge30sXG4gICAgICAgICAgICBhdHRyaWJ1dGVOYW1lLFxuICAgICAgICAgICAgY2hhcixcbiAgICAgICAgICAgIGF0dHJpYnV0ZVR5cGUsXG4gICAgICAgICAgICBjYXJkaW5hbGl0eSxcbiAgICAgICAgICAgIGVuY29kaW5nVHlwZSxcbiAgICAgICAgICAgIGFycmF5VHlwZSxcbiAgICAgICAgICAgIHZhbHVlcyxcbiAgICAgICAgICAgIGluZGljZXMsXG4gICAgICAgICAgICBpO1xuXG4gICAgICAgIGZvciAoIGkgPSAwOyBpIDwgYXR0cmlidXRlc051bWJlcjsgaSArKyApIHtcbiAgICAgICAgICAgIGF0dHJpYnV0ZU5hbWUgPSAnJztcblxuICAgICAgICAgICAgd2hpbGUgKCBwb3MgPCBhcnJheS5sZW5ndGggKSB7XG4gICAgICAgICAgICAgICAgY2hhciA9IGFycmF5WyBwb3MgXTtcbiAgICAgICAgICAgICAgICBwb3MgKys7XG5cbiAgICAgICAgICAgICAgICBpZiAoIGNoYXIgPT09IDAgKSB7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGF0dHJpYnV0ZU5hbWUgKz0gU3RyaW5nLmZyb21DaGFyQ29kZSggY2hhciApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZmxhZ3MgPSBhcnJheVsgcG9zIF07XG5cbiAgICAgICAgICAgIGF0dHJpYnV0ZVR5cGUgPSBmbGFncyA+PiA3ICYgMHgwMTtcbiAgICAgICAgICAgIGNhcmRpbmFsaXR5ID0gKCBmbGFncyA+PiA0ICYgMHgwMyApICsgMTtcbiAgICAgICAgICAgIGVuY29kaW5nVHlwZSA9IGZsYWdzICYgMHgwRjtcbiAgICAgICAgICAgIGFycmF5VHlwZSA9IEludmVydGVkRW5jb2RpbmdUeXBlc1sgZW5jb2RpbmdUeXBlIF07XG5cbiAgICAgICAgICAgIHBvcyArKztcblxuICAgICAgICAgICAgLy8gcGFkZGluZyB0byBuZXh0IG11bHRpcGxlIG9mIDRcbiAgICAgICAgICAgIHBvcyA9IE1hdGguY2VpbCggcG9zIC8gNCApICogNDtcblxuICAgICAgICAgICAgdmFsdWVzID0gY29weUZyb21CdWZmZXIoIGJ1ZmZlciwgYXJyYXlUeXBlLCBwb3MgKyBvZmZzZXQsIGNhcmRpbmFsaXR5ICogdmFsdWVzTnVtYmVyLCBiaWdFbmRpYW4gKTtcblxuICAgICAgICAgICAgcG9zICs9IGFycmF5VHlwZS5CWVRFU19QRVJfRUxFTUVOVCAqIGNhcmRpbmFsaXR5ICogdmFsdWVzTnVtYmVyO1xuXG4gICAgICAgICAgICBhdHRyaWJ1dGVzWyBhdHRyaWJ1dGVOYW1lIF0gPSB7XG4gICAgICAgICAgICAgICAgdHlwZTogYXR0cmlidXRlVHlwZSxcbiAgICAgICAgICAgICAgICBjYXJkaW5hbGl0eTogY2FyZGluYWxpdHksXG4gICAgICAgICAgICAgICAgdmFsdWVzOiB2YWx1ZXNcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cblxuICAgICAgICBwb3MgPSBNYXRoLmNlaWwoIHBvcyAvIDQgKSAqIDQ7XG5cbiAgICAgICAgaW5kaWNlcyA9IG51bGw7XG5cbiAgICAgICAgaWYgKCBpbmRleGVkR2VvbWV0cnkgKSB7XG4gICAgICAgICAgICBpbmRpY2VzID0gY29weUZyb21CdWZmZXIoXG4gICAgICAgICAgICAgICAgYnVmZmVyLFxuICAgICAgICAgICAgICAgIGluZGljZXNUeXBlID09PSAxID8gVWludDMyQXJyYXkgOiBVaW50MTZBcnJheSxcbiAgICAgICAgICAgICAgICBwb3MgKyBvZmZzZXQsXG4gICAgICAgICAgICAgICAgaW5kaWNlc051bWJlcixcbiAgICAgICAgICAgICAgICBiaWdFbmRpYW5cbiAgICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgdmVyc2lvbjogdmVyc2lvbixcbiAgICAgICAgICAgIGF0dHJpYnV0ZXM6IGF0dHJpYnV0ZXMsXG4gICAgICAgICAgICBpbmRpY2VzOiBpbmRpY2VzXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gRGVmaW5lIHRoZSBwdWJsaWMgaW50ZXJmYWNlXG5cbiAgICB2YXIgUFJXTUxvYWRlciA9IGZ1bmN0aW9uIFBSV01Mb2FkZXIoIG1hbmFnZXIgKSB7XG4gICAgICAgIHRoaXMubWFuYWdlciA9ICggbWFuYWdlciAhPT0gdW5kZWZpbmVkICkgPyBtYW5hZ2VyIDogVEhSRUUuRGVmYXVsdExvYWRpbmdNYW5hZ2VyO1xuICAgIH07XG5cbiAgICBQUldNTG9hZGVyLnByb3RvdHlwZSA9IHtcbiAgICAgICAgY29uc3RydWN0b3I6IFRIUkVFLlBSV01Mb2FkZXIsXG5cbiAgICAgICAgbG9hZDogZnVuY3Rpb24gKCB1cmwsIG9uTG9hZCwgb25Qcm9ncmVzcywgb25FcnJvciApIHtcbiAgICAgICAgICAgIHZhciBzY29wZSA9IHRoaXM7XG5cbiAgICAgICAgICAgIHVybCA9IHVybC5yZXBsYWNlKCAvXFwqL2csIGlzQmlnRW5kaWFuUGxhdGZvcm0oKSA/ICdiZScgOiAnbGUnICk7XG5cbiAgICAgICAgICAgIHZhciBsb2FkZXIgPSBuZXcgVEhSRUUuRmlsZUxvYWRlciggc2NvcGUubWFuYWdlciApO1xuICAgICAgICAgICAgbG9hZGVyLnNldFBhdGgoIHNjb3BlLnBhdGggKTtcbiAgICAgICAgICAgIGxvYWRlci5zZXRSZXNwb25zZVR5cGUoICdhcnJheWJ1ZmZlcicgKTtcblxuICAgICAgICAgICAgbG9hZGVyLmxvYWQoIHVybCwgZnVuY3Rpb24gKCBhcnJheUJ1ZmZlciApIHtcbiAgICAgICAgICAgICAgICBvbkxvYWQoIHNjb3BlLnBhcnNlKCBhcnJheUJ1ZmZlciApICk7XG4gICAgICAgICAgICB9LCBvblByb2dyZXNzLCBvbkVycm9yICk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgc2V0UGF0aDogZnVuY3Rpb24gKCB2YWx1ZSApIHtcbiAgICAgICAgICB0aGlzLnBhdGggPSB2YWx1ZTtcbiAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgfSxcblxuICAgICAgICBwYXJzZTogZnVuY3Rpb24gKCBhcnJheUJ1ZmZlciwgb2Zmc2V0ICkge1xuICAgICAgICAgICAgdmFyIGRhdGEgPSBkZWNvZGVQcndtKCBhcnJheUJ1ZmZlciwgb2Zmc2V0ICksXG4gICAgICAgICAgICAgICAgYXR0cmlidXRlc0tleSA9IE9iamVjdC5rZXlzKCBkYXRhLmF0dHJpYnV0ZXMgKSxcbiAgICAgICAgICAgICAgICBidWZmZXJHZW9tZXRyeSA9IG5ldyBUSFJFRS5CdWZmZXJHZW9tZXRyeSgpLFxuICAgICAgICAgICAgICAgIGF0dHJpYnV0ZSxcbiAgICAgICAgICAgICAgICBpO1xuXG4gICAgICAgICAgICBmb3IgKCBpID0gMDsgaSA8IGF0dHJpYnV0ZXNLZXkubGVuZ3RoOyBpICsrICkge1xuICAgICAgICAgICAgICAgIGF0dHJpYnV0ZSA9IGRhdGEuYXR0cmlidXRlc1sgYXR0cmlidXRlc0tleVsgaSBdIF07XG4gICAgICAgICAgICAgICAgYnVmZmVyR2VvbWV0cnkuYWRkQXR0cmlidXRlKCBhdHRyaWJ1dGVzS2V5WyBpIF0sIG5ldyBUSFJFRS5CdWZmZXJBdHRyaWJ1dGUoIGF0dHJpYnV0ZS52YWx1ZXMsIGF0dHJpYnV0ZS5jYXJkaW5hbGl0eSwgYXR0cmlidXRlLm5vcm1hbGl6ZWQgKSApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIGRhdGEuaW5kaWNlcyAhPT0gbnVsbCApIHtcbiAgICAgICAgICAgICAgICBidWZmZXJHZW9tZXRyeS5zZXRJbmRleCggbmV3IFRIUkVFLkJ1ZmZlckF0dHJpYnV0ZSggZGF0YS5pbmRpY2VzLCAxICkgKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIGJ1ZmZlckdlb21ldHJ5O1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIFBSV01Mb2FkZXIuaXNCaWdFbmRpYW5QbGF0Zm9ybSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIGlzQmlnRW5kaWFuUGxhdGZvcm0oKTtcbiAgICB9O1xuXG4gICAgcmV0dXJuIFBSV01Mb2FkZXI7XG5cbn07XG4iXX0=
