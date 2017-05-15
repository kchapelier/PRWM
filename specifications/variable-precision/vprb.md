
# Variable Precision Bundle (VPrB) Specifications (version 1 / draft 2017-04-22)

 * All numerical values are stored in big-endian byte order.

The general structure of the file is the following : **One header** (1 bytes) followed by **one or more file blocks** (varying byte count).




## Header

 * **Version** : 1 byte (0 to 255)
 * **Reserved** : 1 bits (0 to 1)
 * **Number of files** : 7 bits (0 to 127)

### Version

Indicates the version of the specification to apply while decoding this bundle.

A value of 0 should be treated as an error by the decoder.

### Number of files

Indicates the number of files included in the bundle.

A value of 0 should be treated as an error by the decoder.




## File block

### File header

 * **File type** : 4 bits (0 to 15)
 * **Reserved** : 4 bits
 * **Name** : An ASCII encoded C-string (one byte per character, terminated with a NUL character)

#### File type

 * **0** : VPRM file
 * **1 to 15** : Reserved

### File data

The remaining of the file block is filled with the file content.
