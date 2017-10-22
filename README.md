# Packed Raw WebGL Model (PRWM)

Packed Raw WebGL Model is a binary file format for nD geometries specifically designed for JavaScript and WebGL with a strong focus on fast parsing (from 1ms to 0.1ms in Chrome 59 on a MBP Late 2013).

The format support indexed (`drawElements`) and non-indexed (`drawArrays`) geometries. It is designed to allow any number of custom attributes, doesn't force the use of any pre-defined attributes and supports integer attributes (WebGL2's `vertexAttribIPointer`). However it doesn't support any type of bone-based animations.

## Why is it fast ?

Aside from a few metadatas (name of the attributes, number of values, encoding types, etc.), all the WebGL `array buffer` and `element array buffer` typed arrays are encoded *as is* in the PRWM file. Since typed arrays can be instantiated as windowed views over an existing arraybuffer and since arraybuffers can be retrieved directly by the browser with Fetch or XMLHttpRequest (level 2), this means that the file can be decoded virtually instantly. To put it another way, **instantiating the typed arrays for the WebGL buffers from a PRWM file doesn't require us to actually read their content in our javascript code**.

An interesting side effect is that for the same number of attributes (i.e. positions, normals and uvs) the parsing time is the same for a cube encoded in a 300 bytes files than for a complex geometry encoded in a 50 megabytes file.

## The Endianness issue

Endianness ([wikipedia](https://en.wikipedia.org/wiki/Endianness)) refers to the way multi-byte values, such as integers on 16 bits and floats on 32 bits for example, are represented in the computer memory. In Big-Endian byte order, the most important byte is written first and the least important byte is written last, so the 16 bits integer `1` would be represented as `00 01` (read left to right). In Little-Endian this is the opposite, the least important byte comes in first and the most important byte comes in last, so the same 16 bits integer value would be represented as `01 00` (read right to left). Trying to interpret the Little-Endian representation as Big-Endian would give us `256` instead of `1`.

The issue is that we can't define the endianness of a typed array or an arraybuffer in javascript, whether it is one or the other is implementation dependent ("*the alternative that is most efficient for the implementation*"). So if a client on a platform using the Big-Endian byte order receives an arraybuffer originally encoded in Little-Endian and naively creates a windowed typed array over it, all of its data will be corrupted.

In a PRWM file, the endianness of the file is encoded in its header, so the decoder is able to fallback on a less efficient code path reading and converting each values manually. Obviously this is not optimal and pretty much invalidate the advantage of this file format. Please see the guidelines below on how to avoid this issue.

## Guidelines

When using PRWM files, it is strongly recommended to :

* always provide Little-Endian and Big-Endian versions of the files
* to check the endianness of the client platform and request the correct file

The reference encoder/decoder provides a method to check the endianness of the platform.

## Specifications

 * [PRWM version 1 Specifications](https://github.com/kchapelier/PRWM/blob/master/specifications/prwm.md)

## Implementations

### prwm

[github](https://github.com/kchapelier/PRWM/tree/master/implementations/prwm) / [npm](https://www.npmjs.com/package/prwm)

The reference encoder/decoder for the file format.

### obj2prwm

[github](https://github.com/kchapelier/PRWM/tree/master/implementations/obj2prwm) / [npm](https://www.npmjs.com/package/obj2prwm)

A module and simple CLI utility to convert OBJ files to PRWM files.

### svg2prwm

[github](https://github.com/kchapelier/PRWM/tree/master/implementations/svg2prwm) / [npm](https://www.npmjs.com/package/svg2prwm)

A module and simple CLI utility to convert SVG files to PRWM files.

### three-buffergeometry-to-prwm

[github](https://github.com/kchapelier/PRWM/tree/master/implementations/three-buffergeometry-to-prwm) / [npm](https://www.npmjs.com/package/three-buffergeometry-to-prwm) / [online example](http://www.kchapelier.com/prwm/examples/three-buffergeometry-to-prwm.html)

A module to create a PRWM file out of any instance of THREE.BufferGeometry. Useful for procedural generation application

### three-prwm-loader

[github](https://github.com/kchapelier/PRWM/tree/master/implementations/three-prwm-loader) / [npm](https://www.npmjs.com/package/three-prwm-loader) / [online example](http://www.kchapelier.com/prwm/examples/three-prwm-loader.html) / [online benchmark](http://www.kchapelier.com/prwm/examples/three-prwm-loader-benchmark.html)

Merged in Three.js since r86: [github](https://github.com/mrdoob/three.js/blob/dev/examples/js/loaders/PRWMLoader.js) / [online example](https://threejs.org/examples/?q=prwm#webgl_loader_prwm)

A loader for the Three.js engine.

### picogl-prwm-loader

[github](https://github.com/kchapelier/PRWM/tree/master/implementations/picogl-prwm-loader) / [npm](https://www.npmjs.com/package/picogl-prwm-loader) / [online example](http://www.kchapelier.com/prwm/examples/picogl-prwm-loader.html)

A loader for PicoGL.js

## Example files

 * [Several valid PRWM files](https://github.com/kchapelier/PRWM/tree/master/models/prwm)

## Online tools

### PRWM Inspector

http://www.kchapelier.com/prwm/examples/prwm-inspector.html

Drag and drop a PRWM file to analyze its content.

### Convert OBJ to PRWM

http://www.kchapelier.com/prwm/examples/obj2prwm.html

A basic GUI for obj2prwm. Drag and drop an OBJ file (with triangles only) and convert it to PRWM.

### Convert SVG to PRWM

http://www.kchapelier.com/prwm/examples/svg2prwm.html

A basic GUI for svg2prwm. Drag and drop an SVG file and convert its path to PRWM.

## Legacy

Variable Precision Model (VPRM) and Variable Precision Bundle (VPRB) were older file format specifications with a focus on file size. They had a fixed endianness. They supported custom 24 bits typed array for attributes values and the indices values were encoded on the least possible amount of bits to save space (i.e. an indexed cube geometry with 24 vertices would have its indices encoded with 5 bits per value).

The prototypes for the encoder and the decoder were growing in complexity while the gain on the file size wasn't really impressive. Finally the parsing was relatively slow as each attribute value and index had to be parsed individually.

The early draft of those specifications are still available [here](https://github.com/kchapelier/PRWM/blob/master/legacy/).
