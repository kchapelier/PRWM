# Packed Raw WebGL Model (PRWM) Specifications (version 1 / draft 2017-05-17)

 * All signed integer values are stored in two's complement format.
 * All float values are stored following the IEEE 754 spec.
 * The format supports two main types of geometries : point clouds and triangle meshes.
 * The format is designed to allow any number of custom attributes and doesn't force the use of any pre-defined attributes.
 * The format doesn't support any type of bone-based animations, morphing is achievable with custom attributes.
 * The format prioritizes fast parsing over file weight.
 * The format is specifically designed for WebGL and will probably prove useless for any other platforms.

The general structure of the file is the following : **One header** (8 bytes) followed by **one or more attribute blocks** (varying byte count) followed by some padding and **up to one indices block** (varying byte count).

## Header

 * **Version** : 1 byte (0 to 255)
 * **Mesh type** : 1 bit
 * **Indices types** : 1 bit
 * **Endianness** : 1 bit
 * **Number of attributes per vertex** : 5 bits (0 to 31)
 * **Number of values per attribute** : 3 bytes (0 to 16777215)
 * **Number of elements** : 3 bytes (0 to 16777215)

### Version

Indicates the version of the specification to apply while decoding this model.

A value of 0 should be treated as an error by the decoder.

### Mesh type

 * **0** : Point cloud
 * **1** : Triangle mesh

### Indices types

 * **0** : Unsigned 16bit integer (2 bytes)
 * **1** : Unsigned 32bit integer (4 bytes)

### Endianness

 * **0** : Little Endian
 * **1** : Big Endian

### Number of attributes per vertex

Indicates the number of attributes per vertex.

A value of 0 should be treated as an error by the decoder.

It should be noted that most OpenGL implementations are currently limited to 16 attributes per vertex.

#### Number of values per attribute

Indicates the number of values per attribute.

#### Number of elements

Indicates the number of elements. The number of points in point cloud and the number of triangles in triangle mesh.




## Attribute block

### Attribute header

 * **Name** : An ASCII encoded C-string (one byte per character, terminated with a NUL character)
 * **Type** : 2 bits (0 to 3)
 * **Cardinality** : 2 bits (0 to 3)
 * **Encoding type** : 4 bits (0 to 15)
 * **Padding** : 0 to 3 bytes

#### Type

 * **0** : Signed Integer
 * **1** : Unsigned integer
 * **2** : Single-precision float
 * **3** : Reserved

#### Cardinality

Indicates the number of elements per value. O is scalar, 1 is a 2d vector, 2 is a 3d vector and 3 a 4d vector.

Some examples  :

 * An attribute with a type of 2 and a cardinality of 0 would be mapped to a float
 * An attribute with a type of 0 and a cardinality of 1 would be mapped to a ivec2
 * An attribute with a type of 1 and a cardinality of 2 would be mapped to a uvec3

#### Encoding type

This indicates how each elements are stored in the file and doesn't necessarily match the aforementioned type.

 * **0** : Reserved
 * **1** : Signed 32bit float (4 bytes)
 * **2** : Reserved
 * **3** : Signed 8bit integer (1 byte)
 * **4** : Signed 16bit integer (2 bytes)
 * **5** : Reserved
 * **6** : Signed 32bit integer (4 bytes)
 * **7** : Unsigned 8bit integer (1 bytes)
 * **8** : Unsigned 16bit integer (2 bytes)
 * **9** : Reserved
 * **10** : Unsigned 32bit integer (4 bytes)
 * **11 to 15** : Reserved

#### Padding

The attribute header block is to be padded with 0 values in such a way as to make the attribute values block starts at
a position which is a multiple of 4. For example, if the attribute values block would start at the position `0xF1`
without any padding, three padding bytes should be added to the header block as to make it start at the position `0xF4`.

### Attribute values

The values of the attributes are encoded sequentially with the specified encoding type, making up the rest of the attribute block.

While not directly encoded in the attribute header, the total length of the attribute values can be obtain as such :

`Attribute values length = Cardinality * Encoding type byte count * Number of values per attribute`




## Padding

Some padding should be added in such a way as to make the next position a multiple of 4.




## Indices block

The content of this space is dependent on the `Mesh type`.

### Point clouds

Each group of attributes are interpreted as a single point, no indices are needed.

The presence of an Indexes block for point clouds with one index per vertex should be treated as an error by the decoder.

### Triangle meshes

The indexes are ordered by face and by vertex as such :

```
face1vert1index, face1vert2index, face1vert3index, face2vert1index, face2vert2index, face2vert3index, ...
```

While not directly encoded in the block, the total length of the indices values can be obtain as such :

`Indices values length = 3 * Number of elements * Indices type byte count`

