!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.PRWMLoaderWrapper=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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

    function decodePrwm( buffer ) {
        var array = new Uint8Array( buffer ),
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
            attributeNormalized,
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
            attributeNormalized = !! ( flags >> 6 & 0x01 );
            cardinality = ( flags >> 4 & 0x03 ) + 1;
            encodingType = flags & 0x0F;
            arrayType = InvertedEncodingTypes[ encodingType ];

            pos ++;

            // padding to next multiple of 4
            pos = Math.ceil( pos / 4 ) * 4;

            values = copyFromBuffer( buffer, arrayType, pos, cardinality * valuesNumber, bigEndian );

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
                pos,
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
            loader.setResponseType( 'arraybuffer' );

            loader.load( url, function ( arrayBuffer ) {
                onLoad( scope.parse( arrayBuffer ) );
            }, onProgress, onError );
        },

        parse: function ( arrayBuffer ) {
            var data = decodePrwm( arrayBuffer ),
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uL3Vzci9sb2NhbC9saWIvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsImluZGV4LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLyoqXG4gKiBAYXV0aG9yIEtldmluIENoYXBlbGllciAvIGh0dHBzOi8vZ2l0aHViLmNvbS9rY2hhcGVsaWVyXG4gKiBTZWUgaHR0cHM6Ly9naXRodWIuY29tL2tjaGFwZWxpZXIvUFJXTSBmb3IgbW9yZSBpbmZvcm1hdGlvbnMgYWJvdXQgdGhpcyBmaWxlIGZvcm1hdFxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gUFJXTUxvYWRlcldyYXBwZXIgKCBUSFJFRSApIHtcbiAgICBcInVzZSBzdHJpY3RcIjtcblxuICAgIHZhciBiaWdFbmRpYW5QbGF0Zm9ybSA9IG51bGw7XG5cbiAgICAvKipcbiAgICAgKiBDaGVjayBpZiB0aGUgZW5kaWFubmVzcyBvZiB0aGUgcGxhdGZvcm0gaXMgYmlnLWVuZGlhbiAobW9zdCBzaWduaWZpY2FudCBiaXQgZmlyc3QpXG4gICAgICogQHJldHVybnMge2Jvb2xlYW59IFRydWUgaWYgYmlnLWVuZGlhbiwgZmFsc2UgaWYgbGl0dGxlLWVuZGlhblxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGlzQmlnRW5kaWFuUGxhdGZvcm0oKSB7XG4gICAgICAgIGlmICggYmlnRW5kaWFuUGxhdGZvcm0gPT09IG51bGwgKSB7XG4gICAgICAgICAgICB2YXIgYnVmZmVyID0gbmV3IEFycmF5QnVmZmVyKCAyICksXG4gICAgICAgICAgICAgICAgdWludDhBcnJheSA9IG5ldyBVaW50OEFycmF5KCBidWZmZXIgKSxcbiAgICAgICAgICAgICAgICB1aW50MTZBcnJheSA9IG5ldyBVaW50MTZBcnJheSggYnVmZmVyICk7XG5cbiAgICAgICAgICAgIHVpbnQ4QXJyYXlbIDAgXSA9IDB4QUE7IC8vIHNldCBmaXJzdCBieXRlXG4gICAgICAgICAgICB1aW50OEFycmF5WyAxIF0gPSAweEJCOyAvLyBzZXQgc2Vjb25kIGJ5dGVcbiAgICAgICAgICAgIGJpZ0VuZGlhblBsYXRmb3JtID0gKCB1aW50MTZBcnJheVsgMCBdID09PSAweEFBQkIgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBiaWdFbmRpYW5QbGF0Zm9ybTtcbiAgICB9XG5cbiAgICAvLyBtYXRjaCB0aGUgdmFsdWVzIGRlZmluZWQgaW4gdGhlIHNwZWMgdG8gdGhlIFR5cGVkQXJyYXkgdHlwZXNcbiAgICB2YXIgSW52ZXJ0ZWRFbmNvZGluZ1R5cGVzID0gW1xuICAgICAgICBudWxsLFxuICAgICAgICBGbG9hdDMyQXJyYXksXG4gICAgICAgIG51bGwsXG4gICAgICAgIEludDhBcnJheSxcbiAgICAgICAgSW50MTZBcnJheSxcbiAgICAgICAgbnVsbCxcbiAgICAgICAgSW50MzJBcnJheSxcbiAgICAgICAgVWludDhBcnJheSxcbiAgICAgICAgVWludDE2QXJyYXksXG4gICAgICAgIG51bGwsXG4gICAgICAgIFVpbnQzMkFycmF5XG4gICAgXTtcblxuICAgIC8vIGRlZmluZSB0aGUgbWV0aG9kIHRvIHVzZSBvbiBhIERhdGFWaWV3LCBjb3JyZXNwb25kaW5nIHRoZSBUeXBlZEFycmF5IHR5cGVcbiAgICB2YXIgZ2V0TWV0aG9kcyA9IHtcbiAgICAgICAgVWludDE2QXJyYXk6ICdnZXRVaW50MTYnLFxuICAgICAgICBVaW50MzJBcnJheTogJ2dldFVpbnQzMicsXG4gICAgICAgIEludDE2QXJyYXk6ICdnZXRJbnQxNicsXG4gICAgICAgIEludDMyQXJyYXk6ICdnZXRJbnQzMicsXG4gICAgICAgIEZsb2F0MzJBcnJheTogJ2dldEZsb2F0MzInLFxuICAgICAgICBGbG9hdDY0QXJyYXk6ICdnZXRGbG9hdDY0J1xuICAgIH07XG5cbiAgICBmdW5jdGlvbiBjb3B5RnJvbUJ1ZmZlciggc291cmNlQXJyYXlCdWZmZXIsIHZpZXdUeXBlLCBwb3NpdGlvbiwgbGVuZ3RoLCBmcm9tQmlnRW5kaWFuICkge1xuICAgICAgICB2YXIgYnl0ZXNQZXJFbGVtZW50ID0gdmlld1R5cGUuQllURVNfUEVSX0VMRU1FTlQsXG4gICAgICAgICAgICByZXN1bHQ7XG5cbiAgICAgICAgaWYgKCBmcm9tQmlnRW5kaWFuID09PSBpc0JpZ0VuZGlhblBsYXRmb3JtKCkgfHwgYnl0ZXNQZXJFbGVtZW50ID09PSAxICkge1xuICAgICAgICAgICAgcmVzdWx0ID0gbmV3IHZpZXdUeXBlKCBzb3VyY2VBcnJheUJ1ZmZlciwgcG9zaXRpb24sIGxlbmd0aCApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFyIHJlYWRWaWV3ID0gbmV3IERhdGFWaWV3KCBzb3VyY2VBcnJheUJ1ZmZlciwgcG9zaXRpb24sIGxlbmd0aCAqIGJ5dGVzUGVyRWxlbWVudCApLFxuICAgICAgICAgICAgICAgIGdldE1ldGhvZCA9IGdldE1ldGhvZHNbIHZpZXdUeXBlLm5hbWUgXSxcbiAgICAgICAgICAgICAgICBsaXR0bGVFbmRpYW4gPSAhIGZyb21CaWdFbmRpYW4sXG4gICAgICAgICAgICAgICAgaSA9IDA7XG5cbiAgICAgICAgICAgIHJlc3VsdCA9IG5ldyB2aWV3VHlwZSggbGVuZ3RoICk7XG5cbiAgICAgICAgICAgIGZvciAoIDsgaSA8IGxlbmd0aDsgaSArKyApIHtcbiAgICAgICAgICAgICAgICByZXN1bHRbIGkgXSA9IHJlYWRWaWV3WyBnZXRNZXRob2QgXSggaSAqIGJ5dGVzUGVyRWxlbWVudCwgbGl0dGxlRW5kaWFuICk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGRlY29kZVByd20oIGJ1ZmZlciApIHtcbiAgICAgICAgdmFyIGFycmF5ID0gbmV3IFVpbnQ4QXJyYXkoIGJ1ZmZlciApLFxuICAgICAgICAgICAgdmVyc2lvbiA9IGFycmF5WyAwIF0sXG4gICAgICAgICAgICBmbGFncyA9IGFycmF5WyAxIF0sXG4gICAgICAgICAgICBpbmRleGVkR2VvbWV0cnkgPSAhISAoIGZsYWdzID4+IDcgJiAweDAxICksXG4gICAgICAgICAgICBpbmRpY2VzVHlwZSA9IGZsYWdzID4+IDYgJiAweDAxLFxuICAgICAgICAgICAgYmlnRW5kaWFuID0gKCBmbGFncyA+PiA1ICYgMHgwMSApID09PSAxLFxuICAgICAgICAgICAgYXR0cmlidXRlc051bWJlciA9IGZsYWdzICYgMHgxRixcbiAgICAgICAgICAgIHZhbHVlc051bWJlciA9IDAsXG4gICAgICAgICAgICBpbmRpY2VzTnVtYmVyID0gMDtcblxuICAgICAgICBpZiAoIGJpZ0VuZGlhbiApIHtcbiAgICAgICAgICAgIHZhbHVlc051bWJlciA9ICggYXJyYXlbIDIgXSA8PCAxNiApICsgKCBhcnJheVsgMyBdIDw8IDggKSArIGFycmF5WyA0IF07XG4gICAgICAgICAgICBpbmRpY2VzTnVtYmVyID0gKCBhcnJheVsgNSBdIDw8IDE2ICkgKyAoIGFycmF5WyA2IF0gPDwgOCApICsgYXJyYXlbIDcgXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhbHVlc051bWJlciA9IGFycmF5WyAyIF0gKyAoIGFycmF5WyAzIF0gPDwgOCApICsgKCBhcnJheVsgNCBdIDw8IDE2ICk7XG4gICAgICAgICAgICBpbmRpY2VzTnVtYmVyID0gYXJyYXlbIDUgXSArICggYXJyYXlbIDYgXSA8PCA4ICkgKyAoIGFycmF5WyA3IF0gPDwgMTYgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8qKiBQUkVMSU1JTkFSWSBDSEVDS1MgKiovXG5cbiAgICAgICAgaWYgKCB2ZXJzaW9uID09PSAwICkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCAnUFJXTSBkZWNvZGVyOiBJbnZhbGlkIGZvcm1hdCB2ZXJzaW9uOiAwJyApO1xuICAgICAgICB9IGVsc2UgaWYgKCB2ZXJzaW9uICE9PSAxICkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCAnUFJXTSBkZWNvZGVyOiBVbnN1cHBvcnRlZCBmb3JtYXQgdmVyc2lvbjogJyArIHZlcnNpb24gKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICggISBpbmRleGVkR2VvbWV0cnkgKSB7XG4gICAgICAgICAgICBpZiAoIGluZGljZXNUeXBlICE9PSAwICkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvciggJ1BSV00gZGVjb2RlcjogSW5kaWNlcyB0eXBlIG11c3QgYmUgc2V0IHRvIDAgZm9yIG5vbi1pbmRleGVkIGdlb21ldHJpZXMnICk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCBpbmRpY2VzTnVtYmVyICE9PSAwICkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvciggJ1BSV00gZGVjb2RlcjogTnVtYmVyIG9mIGluZGljZXMgbXVzdCBiZSBzZXQgdG8gMCBmb3Igbm9uLWluZGV4ZWQgZ2VvbWV0cmllcycgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8qKiBQQVJTSU5HICoqL1xuXG4gICAgICAgIHZhciBwb3MgPSA4O1xuXG4gICAgICAgIHZhciBhdHRyaWJ1dGVzID0ge30sXG4gICAgICAgICAgICBhdHRyaWJ1dGVOYW1lLFxuICAgICAgICAgICAgY2hhcixcbiAgICAgICAgICAgIGF0dHJpYnV0ZVR5cGUsXG4gICAgICAgICAgICBhdHRyaWJ1dGVOb3JtYWxpemVkLFxuICAgICAgICAgICAgY2FyZGluYWxpdHksXG4gICAgICAgICAgICBlbmNvZGluZ1R5cGUsXG4gICAgICAgICAgICBhcnJheVR5cGUsXG4gICAgICAgICAgICB2YWx1ZXMsXG4gICAgICAgICAgICBpbmRpY2VzLFxuICAgICAgICAgICAgaTtcblxuICAgICAgICBmb3IgKCBpID0gMDsgaSA8IGF0dHJpYnV0ZXNOdW1iZXI7IGkgKysgKSB7XG4gICAgICAgICAgICBhdHRyaWJ1dGVOYW1lID0gJyc7XG5cbiAgICAgICAgICAgIHdoaWxlICggcG9zIDwgYXJyYXkubGVuZ3RoICkge1xuICAgICAgICAgICAgICAgIGNoYXIgPSBhcnJheVsgcG9zIF07XG4gICAgICAgICAgICAgICAgcG9zICsrO1xuXG4gICAgICAgICAgICAgICAgaWYgKCBjaGFyID09PSAwICkge1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBhdHRyaWJ1dGVOYW1lICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoIGNoYXIgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZsYWdzID0gYXJyYXlbIHBvcyBdO1xuXG4gICAgICAgICAgICBhdHRyaWJ1dGVUeXBlID0gZmxhZ3MgPj4gNyAmIDB4MDE7XG4gICAgICAgICAgICBhdHRyaWJ1dGVOb3JtYWxpemVkID0gISEgKCBmbGFncyA+PiA2ICYgMHgwMSApO1xuICAgICAgICAgICAgY2FyZGluYWxpdHkgPSAoIGZsYWdzID4+IDQgJiAweDAzICkgKyAxO1xuICAgICAgICAgICAgZW5jb2RpbmdUeXBlID0gZmxhZ3MgJiAweDBGO1xuICAgICAgICAgICAgYXJyYXlUeXBlID0gSW52ZXJ0ZWRFbmNvZGluZ1R5cGVzWyBlbmNvZGluZ1R5cGUgXTtcblxuICAgICAgICAgICAgcG9zICsrO1xuXG4gICAgICAgICAgICAvLyBwYWRkaW5nIHRvIG5leHQgbXVsdGlwbGUgb2YgNFxuICAgICAgICAgICAgcG9zID0gTWF0aC5jZWlsKCBwb3MgLyA0ICkgKiA0O1xuXG4gICAgICAgICAgICB2YWx1ZXMgPSBjb3B5RnJvbUJ1ZmZlciggYnVmZmVyLCBhcnJheVR5cGUsIHBvcywgY2FyZGluYWxpdHkgKiB2YWx1ZXNOdW1iZXIsIGJpZ0VuZGlhbiApO1xuXG4gICAgICAgICAgICBwb3MgKz0gYXJyYXlUeXBlLkJZVEVTX1BFUl9FTEVNRU5UICogY2FyZGluYWxpdHkgKiB2YWx1ZXNOdW1iZXI7XG5cbiAgICAgICAgICAgIGF0dHJpYnV0ZXNbIGF0dHJpYnV0ZU5hbWUgXSA9IHtcbiAgICAgICAgICAgICAgICB0eXBlOiBhdHRyaWJ1dGVUeXBlLFxuICAgICAgICAgICAgICAgIGNhcmRpbmFsaXR5OiBjYXJkaW5hbGl0eSxcbiAgICAgICAgICAgICAgICB2YWx1ZXM6IHZhbHVlc1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIHBvcyA9IE1hdGguY2VpbCggcG9zIC8gNCApICogNDtcblxuICAgICAgICBpbmRpY2VzID0gbnVsbDtcblxuICAgICAgICBpZiAoIGluZGV4ZWRHZW9tZXRyeSApIHtcbiAgICAgICAgICAgIGluZGljZXMgPSBjb3B5RnJvbUJ1ZmZlcihcbiAgICAgICAgICAgICAgICBidWZmZXIsXG4gICAgICAgICAgICAgICAgaW5kaWNlc1R5cGUgPT09IDEgPyBVaW50MzJBcnJheSA6IFVpbnQxNkFycmF5LFxuICAgICAgICAgICAgICAgIHBvcyxcbiAgICAgICAgICAgICAgICBpbmRpY2VzTnVtYmVyLFxuICAgICAgICAgICAgICAgIGJpZ0VuZGlhblxuICAgICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICB2ZXJzaW9uOiB2ZXJzaW9uLFxuICAgICAgICAgICAgYXR0cmlidXRlczogYXR0cmlidXRlcyxcbiAgICAgICAgICAgIGluZGljZXM6IGluZGljZXNcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBEZWZpbmUgdGhlIHB1YmxpYyBpbnRlcmZhY2VcblxuICAgIHZhciBQUldNTG9hZGVyID0gZnVuY3Rpb24gUFJXTUxvYWRlciggbWFuYWdlciApIHtcbiAgICAgICAgdGhpcy5tYW5hZ2VyID0gKCBtYW5hZ2VyICE9PSB1bmRlZmluZWQgKSA/IG1hbmFnZXIgOiBUSFJFRS5EZWZhdWx0TG9hZGluZ01hbmFnZXI7XG4gICAgfTtcblxuICAgIFBSV01Mb2FkZXIucHJvdG90eXBlID0ge1xuICAgICAgICBjb25zdHJ1Y3RvcjogVEhSRUUuUFJXTUxvYWRlcixcblxuICAgICAgICBsb2FkOiBmdW5jdGlvbiAoIHVybCwgb25Mb2FkLCBvblByb2dyZXNzLCBvbkVycm9yICkge1xuICAgICAgICAgICAgdmFyIHNjb3BlID0gdGhpcztcblxuICAgICAgICAgICAgdXJsID0gdXJsLnJlcGxhY2UoIC9cXCovZywgaXNCaWdFbmRpYW5QbGF0Zm9ybSgpID8gJ2JlJyA6ICdsZScgKTtcblxuICAgICAgICAgICAgdmFyIGxvYWRlciA9IG5ldyBUSFJFRS5GaWxlTG9hZGVyKCBzY29wZS5tYW5hZ2VyICk7XG4gICAgICAgICAgICBsb2FkZXIuc2V0UmVzcG9uc2VUeXBlKCAnYXJyYXlidWZmZXInICk7XG5cbiAgICAgICAgICAgIGxvYWRlci5sb2FkKCB1cmwsIGZ1bmN0aW9uICggYXJyYXlCdWZmZXIgKSB7XG4gICAgICAgICAgICAgICAgb25Mb2FkKCBzY29wZS5wYXJzZSggYXJyYXlCdWZmZXIgKSApO1xuICAgICAgICAgICAgfSwgb25Qcm9ncmVzcywgb25FcnJvciApO1xuICAgICAgICB9LFxuXG4gICAgICAgIHBhcnNlOiBmdW5jdGlvbiAoIGFycmF5QnVmZmVyICkge1xuICAgICAgICAgICAgdmFyIGRhdGEgPSBkZWNvZGVQcndtKCBhcnJheUJ1ZmZlciApLFxuICAgICAgICAgICAgICAgIGF0dHJpYnV0ZXNLZXkgPSBPYmplY3Qua2V5cyggZGF0YS5hdHRyaWJ1dGVzICksXG4gICAgICAgICAgICAgICAgYnVmZmVyR2VvbWV0cnkgPSBuZXcgVEhSRUUuQnVmZmVyR2VvbWV0cnkoKSxcbiAgICAgICAgICAgICAgICBhdHRyaWJ1dGUsXG4gICAgICAgICAgICAgICAgaTtcblxuICAgICAgICAgICAgZm9yICggaSA9IDA7IGkgPCBhdHRyaWJ1dGVzS2V5Lmxlbmd0aDsgaSArKyApIHtcbiAgICAgICAgICAgICAgICBhdHRyaWJ1dGUgPSBkYXRhLmF0dHJpYnV0ZXNbIGF0dHJpYnV0ZXNLZXlbIGkgXSBdO1xuICAgICAgICAgICAgICAgIGJ1ZmZlckdlb21ldHJ5LmFkZEF0dHJpYnV0ZSggYXR0cmlidXRlc0tleVsgaSBdLCBuZXcgVEhSRUUuQnVmZmVyQXR0cmlidXRlKCBhdHRyaWJ1dGUudmFsdWVzLCBhdHRyaWJ1dGUuY2FyZGluYWxpdHksIGF0dHJpYnV0ZS5ub3JtYWxpemVkICkgKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKCBkYXRhLmluZGljZXMgIT09IG51bGwgKSB7XG4gICAgICAgICAgICAgICAgYnVmZmVyR2VvbWV0cnkuc2V0SW5kZXgoIG5ldyBUSFJFRS5CdWZmZXJBdHRyaWJ1dGUoIGRhdGEuaW5kaWNlcywgMSApICk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBidWZmZXJHZW9tZXRyeTtcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICBQUldNTG9hZGVyLmlzQmlnRW5kaWFuUGxhdGZvcm0gPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBpc0JpZ0VuZGlhblBsYXRmb3JtKCk7XG4gICAgfTtcblxuICAgIHJldHVybiBQUldNTG9hZGVyO1xuXG59O1xuIl19
