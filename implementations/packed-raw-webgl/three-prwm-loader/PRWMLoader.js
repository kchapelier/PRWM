( function ( THREE ) {

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

	var MeshTypes = {
		PointCloud: 0,
		TriangleMesh: 1
	};

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
			meshType = flags >> 7 & 0x01,
			isTriangleMesh = meshType === MeshTypes.TriangleMesh,
			indicesType = flags >> 6 & 0x01,
			bigEndian = ( flags >> 5 & 0x01 ) === 1,
			attributesNumber = flags & 0x1F,
			valuesNumber = 0,
			elementNumber = 0;

		if ( bigEndian ) {

			valuesNumber = ( array[ 2 ] << 16 ) + ( array[ 3 ] << 8 ) + array[ 4 ];
			elementNumber = ( array[ 5 ] << 16 ) + ( array[ 6 ] << 8 ) + array[ 7 ];

		} else {

			valuesNumber = array[ 2 ] + ( array[ 3 ] << 8 ) + ( array[ 4 ] << 16 );
			elementNumber = array[ 5 ] + ( array[ 6 ] << 8 ) + ( array[ 7 ] << 16 );

		}

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

			attributeType = flags >> 6 & 0x03;
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

		if ( isTriangleMesh ) {

			indices = copyFromBuffer(
				buffer,
				indicesType === 1 ? Uint32Array : Uint16Array,
				pos,
				elementNumber * 3,
				bigEndian
			);

		} else {

			indices = new ( elementNumber > 0xFFFF ? Uint32Array : Uint16Array )( elementNumber );

			for ( i = 0; i < elementNumber; i ++ ) {

				indices[ i ] = i;

			}

		}

		return {
			version: version,
			meshType: meshType,
			elements: elementNumber,
			attributes: attributes,
			indices: indices
		};

	}

	// Define the public interface

	THREE.PRWMLoader = function PRWMLoader( manager ) {

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

			console.time( 'PRWMLoader' );

			var data = decodePrwm( arrayBuffer ),
				attributesKey = Object.keys( data.attributes ),
				bufferGeometry = new THREE.BufferGeometry(),
				attribute,
				i;

			for ( i = 0; i < attributesKey.length; i ++ ) {

				attribute = data.attributes[ attributesKey[ i ] ];
				bufferGeometry.addAttribute( attributesKey[ i ], new THREE.BufferAttribute( attribute.values, attribute.cardinality ) );

			}

			bufferGeometry.setIndex( new THREE.BufferAttribute( data.indices, 1 ) );

			console.timeEnd( 'PRWMLoader' );

			return bufferGeometry;

		}

	};

	THREE.PRWMLoader.isBigEndianPlatform = function () {

		return isBigEndianPlatform();

	};

} )( THREE );
