
# Variable Precision Model (VPrM) Specifications (version 1 / draft 2017-05-14)

 * All numerical values are stored in big-endian byte order.
 * All signed integer values are stored in two's complement format.
 * All float values are stored following the IEEE 754 spec.
 * The format supports two main types of geometries : point clouds and triangle meshes.
 * The format is designed to allow any number of custom attributes and doesn't force the use of any pre-defined attributes.
 * The format doesn't support any type of bone-based animations, morphing is achievable with custom attributes.

The general structure of the file is the following : **One header** (5 bytes) followed by **one or more attribute blocks** (varying byte count) followed by **up to one indices block** (varying byte count).




## Header

 * **Version** : 1 byte (0 to 255)
 * **Mesh type** : 1 bit
 * **Indexing scheme** : 1 bit
 * **Number of attributes per vertex** : 6 bits (0 to 63)
 * **Number of elements** : 3 bytes (0 to 16777215)

### Version

Indicates the version of the specification to apply while decoding this model.

A value of 0 should be treated as an error by the decoder.

### Mesh type

 * **0** : Point cloud
 * **1** : Triangle mesh

### Indexing scheme

 * **0** : One index per vertex
 * **1** : One index per attribute per vertex (similar to the scheme used in the Wavefront OBJ format)

### Number of attributes per vertex

Indicates the number of attributes per vertex.

A value of 0 should be treated as an error by the decoder.

It should be noted that most OpenGL implementations are currently limited to 16 attributes per vertex.

#### Number of elements

Indicates the number of elements. The number of points in point cloud and the number of triangles in triangle mesh.




## Attribute block

### Attribute header

 * **Name** : An ASCII encoded C-string (one byte per character, terminated with a NUL character)
 * **Type** : 2 bits (0 to 3)
 * **Cardinality** : 2 bits (0 to 3)
 * **Encoding type** : 4 bits (0 to 15)
 * **Number of values** : 3 bytes (0 to 16.777.215)

#### Type

 * **0** : Signed Integer
 * **1** : Unsigned integer
 * **2** : Single-precision float
 * **3** : Double-precision float

#### Cardinality

Indicates the number of elements per value. O is scalar, 1 is a 2d vector, 2 is a 3d vector and 3 a 4d vector.

Some examples in OpenGL :

 * An attribute with a type of 2 and a cardinality of 0 would be mapped to a float
 * An attribute with a type of 0 and a cardinality of 1 would be mapped to a ivec2
 * An attribute with a type of 1 and a cardinality of 2 would be mapped to a uvec3
 * An attribute with a type of 3 and a cardinality of 3 would be mapped to a dvec4

It should be noted that double-precision floats are not supported in GLSL ES.

#### Encoding type

This indicates how each elements are stored in the file and doesn't necessarily match the aforementioned type.

 * **0** : Reserved
 * **1** : Signed 32bit float (4 bytes)
 * **2** : Signed 64bit float (8 bytes)
 * **3** : Signed 8bit integer (1 byte)
 * **4** : Signed 16bit integer (2 bytes)
 * **5** : Signed 24bit integer (3 bytes)
 * **6** : Signed 32bit integer (4 bytes)
 * **7** : Unsigned 8bit integer (1 bytes)
 * **8** : Unsigned 16bit integer (2 bytes)
 * **9** : Unsigned 24bit integer (3 bytes)
 * **10** : Unsigned 32bit integer (4 bytes)
 * **11 to 15** : Reserved

### Attribute values

The values of the attributes are encoded sequentially with the specified encoding type, making up the rest of the attribute block.

While not directly encoded in the attribute header, the total length of the attribute values can be obtain as such :

`Attribute values length = Cardinality * Number of values * Encoding type byte count`




## Indices block

The content of this space is highly dependent on the `Mesh type` and `Indexing scheme`.

The number of bits per index must be deduced from the number of values of each attributes as such :

`Bits per index = max(0, ceil(log2(Number of values + 1)))`

Any remaining/not-set bits in the last byte should be set to 0 by the encoder and should be ignored by the decoder.

### Point clouds with one index per vertex

Each group of attributes are interpreted as a single point, no indices are needed.

The presence of an Indexes block for point clouds with one index per vertex should be treated as an error by the decoder.

### Point clouds with one index per attribute per vertex

The indexes are ordered by point and by attribute as such :

```
point1att1index, point1att2index, point2att1index, point2att2index, ...
```

### Triangle mesh with one index per vertex

The indexes are ordered by face and by vertex as such :

```
face1vert1index, face1vert2index, face1vert3index, face2vert1index, face2vert2index, face2vert3index, ...
```

### Triangle mesh with one index per attribute per vertex

The indexes are ordered by face, by vertex and by attribute as such :

```
face1vert1att1index, face1vert1att2index, face1vert2att1index, face1vert2att2index, face1vert3att1index, face1vert3att2index,
face2vert1att1index, face2vert1att2index, face2vert2att1index, face2vert2att2index, face2vert3att1index, face2vert3att2index, ...
```
