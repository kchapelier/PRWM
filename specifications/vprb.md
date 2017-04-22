
# Variable Precision Bundle (VPrB) Specifications (version 1 / draft 2017-04-22)

 * All numerical values are stored in big-endian byte order.




## Header

 * *Version* : 1 byte (0 to 255)
 * *Compression* : 2 bits (0 to 3)
 * *Number of models* : 6 bits (0 to 63)

### Version

Indicates the version of the specification to apply while decoding this model.

A value of 0 should be treated as an error by the decoder.

### Compression

 * *0* : No compression
 * *1* : Compressed using the LZSS algorithm
 * *2* : Reserved
 * *3* : Reserved

The availability of the compression in the encoder is not mandatory and up to the implementer.

However, the decoder must be able to read all valid VPRB files and thus must support this feature.

### Number of models

Indicates the number of models included in the

A value of 0 should be treated as an error by the decoder.




## Model block

### Model header

 * *Name* : An ASCII encoded C-string (one byte per character, terminated with a NUL character)

### Model data

The remaining of the model block is filled with the model data as defined by the VPRM spec.

The model data contained in the block must not be compressed by itself, only the bundle can be compressed as a whole.
