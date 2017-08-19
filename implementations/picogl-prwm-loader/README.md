# picogl-prwm-loader

A PRWM loader for PicoGL.js

Packed Raw WebGL Model is a binary file format for nD geometries specifically designed for JavaScript and WebGL with a strong focus on fast parsing (from 1ms to 0.1ms in Chrome 59 on a MBP Late 2013). More information on this [here](https://github.com/kchapelier/PRWM).

## Installing

With [npm](http://npmjs.org) do:

```
npm install picogl-prwm-loader --save
```

## Example

```js
var PRWMLoader = require('picogl-prwm-loader'),
    PicoGL = require('picogl');

var app = PicoGL.createApp(document.getElementById('canvas'));

var loader = new PRWMLoader(PicoGL, app).setVerbosity(true);

loader.load(
    './models/mymodel.prwm',
    {
        position: 0,
        normal: 1,
        uv: 2
    },
    function onComplete (vertexArray) {
        console.log(vertexArray)
    }
);
```

[Online example](http://www.kchapelier.com/prwm/examples/picogl-prwm-loader.html)

## API

### new PRWMLoader(picoGL, app)

Instantiate a loader for PRWM files.

**Arguments**

 * picoGL : The PicoGL namespace.
 * app : The PicoGL App instance.

### loader.setVerbosity(verbose)

Set the verbosity of the loader.

**Arguments**

 * verbose : Whether the loader should be verbose (true) or silent (false).

### loader.parse(arrayBuffer, attributeMapping)

Parse a PRWM file passed as an ArrayBuffer and directly return an instance of PicoGL's VertexArray.

**Arguments**

 * arrayBuffer: ArrayBuffer containing the PRWM data.
 * attributeMapping: Literal object with attribute name => attribute index mapping.

### loader.load(url, attributeMapping, onSuccess)

Parse a remote PRWM file and return an instance of PicoGL's VertexArray (through a callback)

**Arguments**

 * url: Url of the PRWM file.
 * attributeMapping: Literal object with attribute name => attribute index mapping.
 * onSuccess: Callback called with the VertexArray on success.

### PRWMLoader.isBigEndianPlatform()

Return true if the endianness of the platform is Big Endian.

## Changelog

### 1.1.0 (2017.08.19) :

 * Use [new methods](https://github.com/tsherif/picogl.js/pull/55) from PicoGL 0.6.6 to fully support all attributes types.

### 1.0.0 (2017.08.15) :

 * First release.

## License

MIT
