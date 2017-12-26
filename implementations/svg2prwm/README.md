# svg2prwm

CLI tool to convert SVG files into PRWM files.

Packed Raw WebGL Model is a binary file format for nD geometries specifically designed for JavaScript and WebGL with a strong focus on fast parsing (from 1ms to 0.1ms in Chrome 59 on a MBP Late 2013). More information on this [here](https://github.com/kchapelier/PRWM).

Currently this tool only support the conversion of SVG containing a path.

## Installing

With [npm](http://npmjs.org) do:

```
npm install svg2prwm -g
```

## CLI Usage

### svg2prwm -i inputFile -o outputFile [OPTIONS]

**Options**

 * **--normals :** Generate a set of normals.
 * **--uvs :** Generate a set of uvs.
 * **--separateTriangles :** Make sure no vertex is shared between multiple triangles. Produces larger files.
 * **--scale :** Scale used for the bezier curves. A higher value means a better resolution.
 * **--simplify :** Simplification amount. A higher value means a more simplified mesh.
 * **--be :** Indicate that the destination file must be in Big Endian byte order. By default the destination file is in Little Endian.
 * **-q, --quiet :** Quiet mode. Silence the output to the console.

## API

### svg2prwm.convert(svgString, options)

**Arguments**

 * **svgString :** The svg file as a string.
 * **options :** Options
    * **normals :** Generate a set of normals.
    * **uvs :** Generate a set of uvs.
    * **separateTriangles :** Make sure no vertex is shared between multiple triangles. Produces larger files.
    * **scale :** Scale used for the bezier curves. A higher value means a better resolution.
    * **simplify :** Simplification amount. A higher value means a more simplified mesh.
    * **bigEndian :** Indicate that the destination file must be in Big Endian byte order. By default the destination file is in Little Endian.
    * **quiet :** Quiet mode. Silence the output to the console.

## Example

```
$ svg2prwm -i original.svg -o destination.prwm --normals --scale 1 --simplify 0.5

 * Reading original.svg
 * Writing destination.prwm

Operation completed in 0.20s.
Original SVG file size : 6.56kB
Generated indexed PRWM file size : 5.38kB
Individual vertices : 263
```

## Changelog

### 1.0.1 (2017.12.26) :

 * Update dependencies.

### 1.0.0 (2017.08.19) :

 * First release.

## License

MIT
