# three-prwm-loader

A PRWM loader for Three.js

Packed Raw WebGL Model is a binary file format for nD geometries specifically designed for JavaScript and WebGL with a strong focus on fast parsing (from 1ms to 0.1ms in Chrome 59 on a MBP Late 2013). More information on this [here](https://github.com/kchapelier/PRWM).

## Installing

With [npm](http://npmjs.org) do:

```
npm install three-prwm-loader --save
```

## Example

```js
var PRWMLoader = require('three-prwm-loader')(THREE);

// instantiate a loader
var loader = new PRWMLoader();

// load a resource
loader.load('./models/mymodel.le.prwm', function onLoad (bufferGeometry) {
    var mesh = new THREE.Mesh(bufferGeometry, new THREE.MeshNormalMaterial());

    // add mesh to scene, etc.
    // scene.add(mesh);
    // ...
});
```

[Online example](http://www.kchapelier.com/prwm/examples/three-prwm-loader.html)

[Benchmark](http://www.kchapelier.com/prwm/examples/three-prwm-loader-benchmark.html)

## API

### new PRWMLoader([manager])

Instantiate a loader for PRWM files.

**Arguments**

 * manager: An instance of [THREE.LoadingManager](https://threejs.org/docs/#api/loaders/managers/LoadingManager), will use THREE.DefaultLoadingManager by default.

### loader.parse(arrayBuffer [, offset])

Parse a PRWM file passed as an ArrayBuffer and directly return an instance of THREE.BufferGeometry.

**Arguments**

 * arrayBuffer: ArrayBuffer containing the PRWM data.
 * offset: Offset (in bytes) at which the PRWM file content is located in the ArrayBuffer. Must be a multiple of 4.

### loader.load(url, onLoad [, onProgress[, onError]])

Parse a remote PRWM file and return an instance of THREE.BufferGeometry (through a callback).

**Arguments**

 * url: Url of the PRWM file to load. Any `*` character will be replaced by `le` or `be` depending on the platform endianness. (see the [guidelines](https://github.com/kchapelier/PRWM/#guidelines))
 * onLoad: Will be called when load completes. The argument will be the loaded BufferGeometry.
 * onProgress: Will be called while load progresses. The argument will be the XMLHttpRequest instance, which contains .total and .loaded bytes.
 * onError: Will be called when load errors.

### PRWMLoader.isBigEndianPlatform()

Return true if the endianness of the platform is Big Endian.

## Changelog

### 1.1.1 (2019.04.07) :

 * Retrieve changes from Three.js repository, implement setPath.

### 1.1.0 (2017.12.26) :

 * Add `offset` argument in `parse()`.

### 1.0.0 (2017.10.22) :

 * First release on npm.

## License

MIT
