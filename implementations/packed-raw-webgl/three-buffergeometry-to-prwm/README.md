# three-buffergeometry-to-prwm

Takes a THREE.BufferGeometry and returns an ArrayBuffer containing a PRWM file.

Mostly a convenience wrapper around [prwm](https://www.npmjs.com/package/prwm).

## Installing

With [npm](http://npmjs.org) do:

```
npm install three-buffergeometry-to-prwm
```

## Example

```js
var threeBufferGeometryToPrwm = require('three-buffergeometry-to-prwm');

console.log(threeBufferGeometryToPrwm(bufferGeometry));
```

## API

```js
threeBufferGeometryToPrwm(bufferGeometry, bigEndian);
```

### Arguments

 * geometry : an instance of THREE.BufferGeometry (can be indexed or non-indexed).
 * bigEndian : whether the endianness of the generated file should be Big Endian.

## Changelog

### 1.0.0 (2017.06.04) :

 * First implementation.

## Roadmap

 * Tests

## License

MIT
