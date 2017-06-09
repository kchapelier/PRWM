# Packed Raw WebGL Model (PRWM)

Packed Raw WebGL Model is a binary file format for nD geometries specifically designed for JavaScript and WebGL with a strong focus on fast parsing (from 1ms to 0.1ms in Chrome 59 on a MBP Late 2013).

```// TODO write more informations about why it is fast, the limitations and the guidelines```

## Specifications

 * [PRWM Specifications](https://github.com/kchapelier/PRWM/blob/master/specifications/prwm.md)

## Implementations

### prwm

[github](https://github.com/kchapelier/PRWM/tree/master/implementations/prwm) / [npm](https://www.npmjs.com/package/prwm)

The reference encoder/decoder for the file format.

### obj2prwm

[github](https://github.com/kchapelier/PRWM/tree/master/implementations/obj2prwm) / npm

A simple CLI utility to convert OBJ files to PRWM files.

### three-buffergeometry-to-prwm

[github](https://github.com/kchapelier/PRWM/tree/master/implementations/three-buffergeometry-to-prwm) / npm / [online example](http://www.kchapelier.com/prwm/examples/three-buffergeometry-to-prwm.html)

A module to create a PRWM file out of any instance of THREE.BufferGeometry. Useful for procedural generation application

### three-prwm-loader

[github](https://github.com/kchapelier/PRWM/tree/master/implementations/three-prwm-loader) / [online example](http://www.kchapelier.com/prwm/examples/three-prwm-loader.html) / [online benchmark](http://www.kchapelier.com/prwm/examples/three-prwm-loader-benchmark.html)

A loader for the Three.js engine.

## Example files

 * [Several valid PRWM files](https://github.com/kchapelier/PRWM/tree/master/models/prwm)

## Legacy

Variable Precision Model (VPRM) and Variable Precision Bundle (VPRB) were older file format specifications with a focus on file weight. They supported custom 24 bits typed array for attributes values and the indices values were encoded on the least possible amount of bits (i.e. an indexed cube geometry with 24 vertices would have its indices encoded with 5 bits per value).

The parsing was relatively slow as each attribute value and index had to be parsed individually and the general

The early draft of the specifications are still available [here](https://github.com/kchapelier/PRWM/blob/master/legacy/).
