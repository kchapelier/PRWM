# obj2prwm

CLI tool to convert WaveFront OBJ files into PRWM files.

Currently this tool only support the conversion of OBJ containing a single model made of triangles.

## Installing

With [npm](http://npmjs.org) do:

```
npm install obj2prwm -g
```

## Usage

```obj2prwm -i inputFile -o outputFile [OPTIONS]```

### Options

 * **--positions :** Include the vertices positions in the destination file.
 * **--normals :** Include the normals in the destination file.
 * **--uvs :** Include the UVs in the destination file.
 * **--indexed :** Indicate that the geometry stored in the destination file must be indexed. (recommended)
 * **--be :** Indicate that the destination file must be in Big Endian byte order. By default the destination file is in Little Endian.
 * **-q, --quiet :** Quiet mode. Silence the output to the console.

## Example

```obj2prwm -i original.obj -o destination.prwm --positions --normals --uvs --indexed```

## Changelog

### 0.0.1 (2017.06.04) :

 * First implementation.

## Roadmap

 * Allow to use the project as a library
 * Support OBJ with quads
 * Support the generation of normals if there are missing
 * Support the generation of tangents

## License

MIT
