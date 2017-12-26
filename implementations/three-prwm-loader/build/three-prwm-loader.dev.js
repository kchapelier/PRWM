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
            loader.setResponseType( 'arraybuffer' );

            loader.load( url, function ( arrayBuffer ) {
                onLoad( scope.parse( arrayBuffer ) );
            }, onProgress, onError );
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uL3Vzci9sb2NhbC9saWIvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsImluZGV4LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLyoqXG4gKiBAYXV0aG9yIEtldmluIENoYXBlbGllciAvIGh0dHBzOi8vZ2l0aHViLmNvbS9rY2hhcGVsaWVyXG4gKiBTZWUgaHR0cHM6Ly9naXRodWIuY29tL2tjaGFwZWxpZXIvUFJXTSBmb3IgbW9yZSBpbmZvcm1hdGlvbnMgYWJvdXQgdGhpcyBmaWxlIGZvcm1hdFxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gUFJXTUxvYWRlcldyYXBwZXIgKCBUSFJFRSApIHtcbiAgICBcInVzZSBzdHJpY3RcIjtcblxuICAgIHZhciBiaWdFbmRpYW5QbGF0Zm9ybSA9IG51bGw7XG5cbiAgICAvKipcbiAgICAgKiBDaGVjayBpZiB0aGUgZW5kaWFubmVzcyBvZiB0aGUgcGxhdGZvcm0gaXMgYmlnLWVuZGlhbiAobW9zdCBzaWduaWZpY2FudCBiaXQgZmlyc3QpXG4gICAgICogQHJldHVybnMge2Jvb2xlYW59IFRydWUgaWYgYmlnLWVuZGlhbiwgZmFsc2UgaWYgbGl0dGxlLWVuZGlhblxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGlzQmlnRW5kaWFuUGxhdGZvcm0oKSB7XG4gICAgICAgIGlmICggYmlnRW5kaWFuUGxhdGZvcm0gPT09IG51bGwgKSB7XG4gICAgICAgICAgICB2YXIgYnVmZmVyID0gbmV3IEFycmF5QnVmZmVyKCAyICksXG4gICAgICAgICAgICAgICAgdWludDhBcnJheSA9IG5ldyBVaW50OEFycmF5KCBidWZmZXIgKSxcbiAgICAgICAgICAgICAgICB1aW50MTZBcnJheSA9IG5ldyBVaW50MTZBcnJheSggYnVmZmVyICk7XG5cbiAgICAgICAgICAgIHVpbnQ4QXJyYXlbIDAgXSA9IDB4QUE7IC8vIHNldCBmaXJzdCBieXRlXG4gICAgICAgICAgICB1aW50OEFycmF5WyAxIF0gPSAweEJCOyAvLyBzZXQgc2Vjb25kIGJ5dGVcbiAgICAgICAgICAgIGJpZ0VuZGlhblBsYXRmb3JtID0gKCB1aW50MTZBcnJheVsgMCBdID09PSAweEFBQkIgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBiaWdFbmRpYW5QbGF0Zm9ybTtcbiAgICB9XG5cbiAgICAvLyBtYXRjaCB0aGUgdmFsdWVzIGRlZmluZWQgaW4gdGhlIHNwZWMgdG8gdGhlIFR5cGVkQXJyYXkgdHlwZXNcbiAgICB2YXIgSW52ZXJ0ZWRFbmNvZGluZ1R5cGVzID0gW1xuICAgICAgICBudWxsLFxuICAgICAgICBGbG9hdDMyQXJyYXksXG4gICAgICAgIG51bGwsXG4gICAgICAgIEludDhBcnJheSxcbiAgICAgICAgSW50MTZBcnJheSxcbiAgICAgICAgbnVsbCxcbiAgICAgICAgSW50MzJBcnJheSxcbiAgICAgICAgVWludDhBcnJheSxcbiAgICAgICAgVWludDE2QXJyYXksXG4gICAgICAgIG51bGwsXG4gICAgICAgIFVpbnQzMkFycmF5XG4gICAgXTtcblxuICAgIC8vIGRlZmluZSB0aGUgbWV0aG9kIHRvIHVzZSBvbiBhIERhdGFWaWV3LCBjb3JyZXNwb25kaW5nIHRoZSBUeXBlZEFycmF5IHR5cGVcbiAgICB2YXIgZ2V0TWV0aG9kcyA9IHtcbiAgICAgICAgVWludDE2QXJyYXk6ICdnZXRVaW50MTYnLFxuICAgICAgICBVaW50MzJBcnJheTogJ2dldFVpbnQzMicsXG4gICAgICAgIEludDE2QXJyYXk6ICdnZXRJbnQxNicsXG4gICAgICAgIEludDMyQXJyYXk6ICdnZXRJbnQzMicsXG4gICAgICAgIEZsb2F0MzJBcnJheTogJ2dldEZsb2F0MzInLFxuICAgICAgICBGbG9hdDY0QXJyYXk6ICdnZXRGbG9hdDY0J1xuICAgIH07XG5cbiAgICBmdW5jdGlvbiBjb3B5RnJvbUJ1ZmZlciggc291cmNlQXJyYXlCdWZmZXIsIHZpZXdUeXBlLCBwb3NpdGlvbiwgbGVuZ3RoLCBmcm9tQmlnRW5kaWFuICkge1xuICAgICAgICB2YXIgYnl0ZXNQZXJFbGVtZW50ID0gdmlld1R5cGUuQllURVNfUEVSX0VMRU1FTlQsXG4gICAgICAgICAgICByZXN1bHQ7XG5cbiAgICAgICAgaWYgKCBmcm9tQmlnRW5kaWFuID09PSBpc0JpZ0VuZGlhblBsYXRmb3JtKCkgfHwgYnl0ZXNQZXJFbGVtZW50ID09PSAxICkge1xuICAgICAgICAgICAgcmVzdWx0ID0gbmV3IHZpZXdUeXBlKCBzb3VyY2VBcnJheUJ1ZmZlciwgcG9zaXRpb24sIGxlbmd0aCApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFyIHJlYWRWaWV3ID0gbmV3IERhdGFWaWV3KCBzb3VyY2VBcnJheUJ1ZmZlciwgcG9zaXRpb24sIGxlbmd0aCAqIGJ5dGVzUGVyRWxlbWVudCApLFxuICAgICAgICAgICAgICAgIGdldE1ldGhvZCA9IGdldE1ldGhvZHNbIHZpZXdUeXBlLm5hbWUgXSxcbiAgICAgICAgICAgICAgICBsaXR0bGVFbmRpYW4gPSAhIGZyb21CaWdFbmRpYW4sXG4gICAgICAgICAgICAgICAgaSA9IDA7XG5cbiAgICAgICAgICAgIHJlc3VsdCA9IG5ldyB2aWV3VHlwZSggbGVuZ3RoICk7XG5cbiAgICAgICAgICAgIGZvciAoIDsgaSA8IGxlbmd0aDsgaSArKyApIHtcbiAgICAgICAgICAgICAgICByZXN1bHRbIGkgXSA9IHJlYWRWaWV3WyBnZXRNZXRob2QgXSggaSAqIGJ5dGVzUGVyRWxlbWVudCwgbGl0dGxlRW5kaWFuICk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGRlY29kZVByd20oIGJ1ZmZlciwgb2Zmc2V0ICkge1xuICAgICAgICBvZmZzZXQgPSBvZmZzZXQgfHwgMDtcblxuICAgICAgICB2YXIgYXJyYXkgPSBuZXcgVWludDhBcnJheSggYnVmZmVyLCBvZmZzZXQgKSxcbiAgICAgICAgICAgIHZlcnNpb24gPSBhcnJheVsgMCBdLFxuICAgICAgICAgICAgZmxhZ3MgPSBhcnJheVsgMSBdLFxuICAgICAgICAgICAgaW5kZXhlZEdlb21ldHJ5ID0gISEgKCBmbGFncyA+PiA3ICYgMHgwMSApLFxuICAgICAgICAgICAgaW5kaWNlc1R5cGUgPSBmbGFncyA+PiA2ICYgMHgwMSxcbiAgICAgICAgICAgIGJpZ0VuZGlhbiA9ICggZmxhZ3MgPj4gNSAmIDB4MDEgKSA9PT0gMSxcbiAgICAgICAgICAgIGF0dHJpYnV0ZXNOdW1iZXIgPSBmbGFncyAmIDB4MUYsXG4gICAgICAgICAgICB2YWx1ZXNOdW1iZXIgPSAwLFxuICAgICAgICAgICAgaW5kaWNlc051bWJlciA9IDA7XG5cbiAgICAgICAgaWYgKCBiaWdFbmRpYW4gKSB7XG4gICAgICAgICAgICB2YWx1ZXNOdW1iZXIgPSAoIGFycmF5WyAyIF0gPDwgMTYgKSArICggYXJyYXlbIDMgXSA8PCA4ICkgKyBhcnJheVsgNCBdO1xuICAgICAgICAgICAgaW5kaWNlc051bWJlciA9ICggYXJyYXlbIDUgXSA8PCAxNiApICsgKCBhcnJheVsgNiBdIDw8IDggKSArIGFycmF5WyA3IF07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YWx1ZXNOdW1iZXIgPSBhcnJheVsgMiBdICsgKCBhcnJheVsgMyBdIDw8IDggKSArICggYXJyYXlbIDQgXSA8PCAxNiApO1xuICAgICAgICAgICAgaW5kaWNlc051bWJlciA9IGFycmF5WyA1IF0gKyAoIGFycmF5WyA2IF0gPDwgOCApICsgKCBhcnJheVsgNyBdIDw8IDE2ICk7XG4gICAgICAgIH1cblxuICAgICAgICAvKiogUFJFTElNSU5BUlkgQ0hFQ0tTICoqL1xuXG4gICAgICAgIGlmICggb2Zmc2V0IC8gNCAlIDEgIT09IDAgKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoICdQUldNIGRlY29kZXI6IE9mZnNldCBzaG91bGQgYmUgYSBtdWx0aXBsZSBvZiA0LCByZWNlaXZlZCAnICsgb2Zmc2V0ICk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIHZlcnNpb24gPT09IDAgKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoICdQUldNIGRlY29kZXI6IEludmFsaWQgZm9ybWF0IHZlcnNpb246IDAnICk7XG4gICAgICAgIH0gZWxzZSBpZiAoIHZlcnNpb24gIT09IDEgKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoICdQUldNIGRlY29kZXI6IFVuc3VwcG9ydGVkIGZvcm1hdCB2ZXJzaW9uOiAnICsgdmVyc2lvbiApO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCAhIGluZGV4ZWRHZW9tZXRyeSApIHtcbiAgICAgICAgICAgIGlmICggaW5kaWNlc1R5cGUgIT09IDAgKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCAnUFJXTSBkZWNvZGVyOiBJbmRpY2VzIHR5cGUgbXVzdCBiZSBzZXQgdG8gMCBmb3Igbm9uLWluZGV4ZWQgZ2VvbWV0cmllcycgKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoIGluZGljZXNOdW1iZXIgIT09IDAgKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCAnUFJXTSBkZWNvZGVyOiBOdW1iZXIgb2YgaW5kaWNlcyBtdXN0IGJlIHNldCB0byAwIGZvciBub24taW5kZXhlZCBnZW9tZXRyaWVzJyApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLyoqIFBBUlNJTkcgKiovXG5cbiAgICAgICAgdmFyIHBvcyA9IDg7XG5cbiAgICAgICAgdmFyIGF0dHJpYnV0ZXMgPSB7fSxcbiAgICAgICAgICAgIGF0dHJpYnV0ZU5hbWUsXG4gICAgICAgICAgICBjaGFyLFxuICAgICAgICAgICAgYXR0cmlidXRlVHlwZSxcbiAgICAgICAgICAgIGF0dHJpYnV0ZU5vcm1hbGl6ZWQsXG4gICAgICAgICAgICBjYXJkaW5hbGl0eSxcbiAgICAgICAgICAgIGVuY29kaW5nVHlwZSxcbiAgICAgICAgICAgIGFycmF5VHlwZSxcbiAgICAgICAgICAgIHZhbHVlcyxcbiAgICAgICAgICAgIGluZGljZXMsXG4gICAgICAgICAgICBpO1xuXG4gICAgICAgIGZvciAoIGkgPSAwOyBpIDwgYXR0cmlidXRlc051bWJlcjsgaSArKyApIHtcbiAgICAgICAgICAgIGF0dHJpYnV0ZU5hbWUgPSAnJztcblxuICAgICAgICAgICAgd2hpbGUgKCBwb3MgPCBhcnJheS5sZW5ndGggKSB7XG4gICAgICAgICAgICAgICAgY2hhciA9IGFycmF5WyBwb3MgXTtcbiAgICAgICAgICAgICAgICBwb3MgKys7XG5cbiAgICAgICAgICAgICAgICBpZiAoIGNoYXIgPT09IDAgKSB7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGF0dHJpYnV0ZU5hbWUgKz0gU3RyaW5nLmZyb21DaGFyQ29kZSggY2hhciApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZmxhZ3MgPSBhcnJheVsgcG9zIF07XG5cbiAgICAgICAgICAgIGF0dHJpYnV0ZVR5cGUgPSBmbGFncyA+PiA3ICYgMHgwMTtcbiAgICAgICAgICAgIGF0dHJpYnV0ZU5vcm1hbGl6ZWQgPSAhISAoIGZsYWdzID4+IDYgJiAweDAxICk7XG4gICAgICAgICAgICBjYXJkaW5hbGl0eSA9ICggZmxhZ3MgPj4gNCAmIDB4MDMgKSArIDE7XG4gICAgICAgICAgICBlbmNvZGluZ1R5cGUgPSBmbGFncyAmIDB4MEY7XG4gICAgICAgICAgICBhcnJheVR5cGUgPSBJbnZlcnRlZEVuY29kaW5nVHlwZXNbIGVuY29kaW5nVHlwZSBdO1xuXG4gICAgICAgICAgICBwb3MgKys7XG5cbiAgICAgICAgICAgIC8vIHBhZGRpbmcgdG8gbmV4dCBtdWx0aXBsZSBvZiA0XG4gICAgICAgICAgICBwb3MgPSBNYXRoLmNlaWwoIHBvcyAvIDQgKSAqIDQ7XG5cbiAgICAgICAgICAgIHZhbHVlcyA9IGNvcHlGcm9tQnVmZmVyKCBidWZmZXIsIGFycmF5VHlwZSwgcG9zICsgb2Zmc2V0LCBjYXJkaW5hbGl0eSAqIHZhbHVlc051bWJlciwgYmlnRW5kaWFuICk7XG5cbiAgICAgICAgICAgIHBvcyArPSBhcnJheVR5cGUuQllURVNfUEVSX0VMRU1FTlQgKiBjYXJkaW5hbGl0eSAqIHZhbHVlc051bWJlcjtcblxuICAgICAgICAgICAgYXR0cmlidXRlc1sgYXR0cmlidXRlTmFtZSBdID0ge1xuICAgICAgICAgICAgICAgIHR5cGU6IGF0dHJpYnV0ZVR5cGUsXG4gICAgICAgICAgICAgICAgY2FyZGluYWxpdHk6IGNhcmRpbmFsaXR5LFxuICAgICAgICAgICAgICAgIHZhbHVlczogdmFsdWVzXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG5cbiAgICAgICAgcG9zID0gTWF0aC5jZWlsKCBwb3MgLyA0ICkgKiA0O1xuXG4gICAgICAgIGluZGljZXMgPSBudWxsO1xuXG4gICAgICAgIGlmICggaW5kZXhlZEdlb21ldHJ5ICkge1xuICAgICAgICAgICAgaW5kaWNlcyA9IGNvcHlGcm9tQnVmZmVyKFxuICAgICAgICAgICAgICAgIGJ1ZmZlcixcbiAgICAgICAgICAgICAgICBpbmRpY2VzVHlwZSA9PT0gMSA/IFVpbnQzMkFycmF5IDogVWludDE2QXJyYXksXG4gICAgICAgICAgICAgICAgcG9zICsgb2Zmc2V0LFxuICAgICAgICAgICAgICAgIGluZGljZXNOdW1iZXIsXG4gICAgICAgICAgICAgICAgYmlnRW5kaWFuXG4gICAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHZlcnNpb246IHZlcnNpb24sXG4gICAgICAgICAgICBhdHRyaWJ1dGVzOiBhdHRyaWJ1dGVzLFxuICAgICAgICAgICAgaW5kaWNlczogaW5kaWNlc1xuICAgICAgICB9O1xuICAgIH1cblxuICAgIC8vIERlZmluZSB0aGUgcHVibGljIGludGVyZmFjZVxuXG4gICAgdmFyIFBSV01Mb2FkZXIgPSBmdW5jdGlvbiBQUldNTG9hZGVyKCBtYW5hZ2VyICkge1xuICAgICAgICB0aGlzLm1hbmFnZXIgPSAoIG1hbmFnZXIgIT09IHVuZGVmaW5lZCApID8gbWFuYWdlciA6IFRIUkVFLkRlZmF1bHRMb2FkaW5nTWFuYWdlcjtcbiAgICB9O1xuXG4gICAgUFJXTUxvYWRlci5wcm90b3R5cGUgPSB7XG4gICAgICAgIGNvbnN0cnVjdG9yOiBUSFJFRS5QUldNTG9hZGVyLFxuXG4gICAgICAgIGxvYWQ6IGZ1bmN0aW9uICggdXJsLCBvbkxvYWQsIG9uUHJvZ3Jlc3MsIG9uRXJyb3IgKSB7XG4gICAgICAgICAgICB2YXIgc2NvcGUgPSB0aGlzO1xuXG4gICAgICAgICAgICB1cmwgPSB1cmwucmVwbGFjZSggL1xcKi9nLCBpc0JpZ0VuZGlhblBsYXRmb3JtKCkgPyAnYmUnIDogJ2xlJyApO1xuXG4gICAgICAgICAgICB2YXIgbG9hZGVyID0gbmV3IFRIUkVFLkZpbGVMb2FkZXIoIHNjb3BlLm1hbmFnZXIgKTtcbiAgICAgICAgICAgIGxvYWRlci5zZXRSZXNwb25zZVR5cGUoICdhcnJheWJ1ZmZlcicgKTtcblxuICAgICAgICAgICAgbG9hZGVyLmxvYWQoIHVybCwgZnVuY3Rpb24gKCBhcnJheUJ1ZmZlciApIHtcbiAgICAgICAgICAgICAgICBvbkxvYWQoIHNjb3BlLnBhcnNlKCBhcnJheUJ1ZmZlciApICk7XG4gICAgICAgICAgICB9LCBvblByb2dyZXNzLCBvbkVycm9yICk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgcGFyc2U6IGZ1bmN0aW9uICggYXJyYXlCdWZmZXIsIG9mZnNldCApIHtcbiAgICAgICAgICAgIHZhciBkYXRhID0gZGVjb2RlUHJ3bSggYXJyYXlCdWZmZXIsIG9mZnNldCApLFxuICAgICAgICAgICAgICAgIGF0dHJpYnV0ZXNLZXkgPSBPYmplY3Qua2V5cyggZGF0YS5hdHRyaWJ1dGVzICksXG4gICAgICAgICAgICAgICAgYnVmZmVyR2VvbWV0cnkgPSBuZXcgVEhSRUUuQnVmZmVyR2VvbWV0cnkoKSxcbiAgICAgICAgICAgICAgICBhdHRyaWJ1dGUsXG4gICAgICAgICAgICAgICAgaTtcblxuICAgICAgICAgICAgZm9yICggaSA9IDA7IGkgPCBhdHRyaWJ1dGVzS2V5Lmxlbmd0aDsgaSArKyApIHtcbiAgICAgICAgICAgICAgICBhdHRyaWJ1dGUgPSBkYXRhLmF0dHJpYnV0ZXNbIGF0dHJpYnV0ZXNLZXlbIGkgXSBdO1xuICAgICAgICAgICAgICAgIGJ1ZmZlckdlb21ldHJ5LmFkZEF0dHJpYnV0ZSggYXR0cmlidXRlc0tleVsgaSBdLCBuZXcgVEhSRUUuQnVmZmVyQXR0cmlidXRlKCBhdHRyaWJ1dGUudmFsdWVzLCBhdHRyaWJ1dGUuY2FyZGluYWxpdHksIGF0dHJpYnV0ZS5ub3JtYWxpemVkICkgKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKCBkYXRhLmluZGljZXMgIT09IG51bGwgKSB7XG4gICAgICAgICAgICAgICAgYnVmZmVyR2VvbWV0cnkuc2V0SW5kZXgoIG5ldyBUSFJFRS5CdWZmZXJBdHRyaWJ1dGUoIGRhdGEuaW5kaWNlcywgMSApICk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBidWZmZXJHZW9tZXRyeTtcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICBQUldNTG9hZGVyLmlzQmlnRW5kaWFuUGxhdGZvcm0gPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBpc0JpZ0VuZGlhblBsYXRmb3JtKCk7XG4gICAgfTtcblxuICAgIHJldHVybiBQUldNTG9hZGVyO1xuXG59O1xuIl19
