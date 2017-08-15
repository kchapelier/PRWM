# prwm

The reference encoding / decoding library for the PRWM file format.

Packed Raw WebGL Model is a binary file format for nD geometries specifically designed for JavaScript and WebGL with a strong focus on fast parsing (from 1ms to 0.1ms in Chrome 59 on a MBP Late 2013). More information on this [here](https://github.com/kchapelier/PRWM).

## Installing

With [npm](http://npmjs.org) do:

```
npm install prwm
```

## Usage

### Encoding

```
var prwm = require('prwm');

// this will encode a prwm file with a simple square, non-indexed

var arrayBuffer = prwm.encode({
    position: {
        cardinality: 3,
        normalized: false,
        values: new Float32Array([
            -1.0, -1.0,  0.0,
             1.0, -1.0,  0.0,
             1.0,  1.0,  0.0,
            -1.0, -1.0,  0.0,
             1.0,  1.0,  0.0,
            -1.0,  1.0,  0.0
        ])
    },
    uv: {
        cardinality: 2,
        normalized: false,
        values: new Int8Array([
            0, 0
            1, 0,
            1, 1,
            0, 0,
            1, 1,
            0, 1
        ])
    }
}, null, false);

console.log(arrayBuffer);
```

```
var prwm = require('prwm');

// this will encode a prwm file with a simple square, indexed

var arrayBuffer = prwm.encode({
    position: {
        cardinality: 3,
        normalized: false,
        values: new Float32Array([
            -1.0, -1.0,  0.0,
             1.0, -1.0,  0.0,
             1.0,  1.0,  0.0,
            -1.0,  1.0,  0.0
        ])
    },
    uv: {
        cardinality: 2,
        normalized: false,
        values: new Int8Array([
            0, 0
            1, 0,
            1, 1,
            0, 1
        ])
    }
}, new Uint16Array([0,1,2,0,2,3]), false);

console.log(arrayBuffer);
```

```
var prwm = require('prwm');

// this will encode a prwm file with a simple square, indexed, and flag its position attribute to be considered
// as integers values using WebGL2's vertexAttribIPointer

var arrayBuffer = prwm.encode({
    position: {
        cardinality: 3,
        type: prwm.Int,
        normalized: false,
        values: new Int32Array([
            -1.0, -1.0,  0.0,
             1.0, -1.0,  0.0,
             1.0,  1.0,  0.0,
            -1.0,  1.0,  0.0
        ])
    },
    uv: {
        cardinality: 2,
        type: prwm.Float,
        normalized: false,
        values: new Int8Array([
            0, 0
            1, 0,
            1, 1,
            0, 1
        ])
    }
}, new Uint16Array([0,1,2,0,2,3]), false);

console.log(arrayBuffer);
```

### Decoding

```
var prwm = require('prwm');

// assume that arrayBuffer is an ArrayBuffer with the content of a valid prwm file

var data = prwm.decode(arrayBuffer);

console.log(data); // a json containing all the attributes and indices
```

## API

### prwm.isBigEndianPlatform()

Check if the platform is natively using the Big Endian byte order.

Return true for Big Endian, false for Little Endian.

### prwm.encode(attributes, indices, bigEndian)

 * **attributes :** A list of attribute, represented as an object literal where the name of the property is the name of the attribute. Each attribute is defined by its cardinality (the number of components per vertex attribute, either 1, 2, 3 or 4), its type (Float or Integer), whether it is normalized and its values as a typed array.
 * **indices :** The indices of the geometry, can be either null (for non-indexed property), an Uint16Array or an Uint32Array.
 * **bigEndian :** Whether to generate the file in Big Endian byte order.

### prwm.decode(prwmData)

 * **prwmData :** An ArrayBuffer with the content of a PRWM file.

## Changelog

### 1.1.0 (2017.08.15) :

 * Add endianness of the file in the decoded data.
 * Reduce the weight of the npm package.

### 1.0.0 (2017.06.09) :

 * First implementation, with full support for the first version of the format.

## Roadmap

 * More tests

## License

MIT
