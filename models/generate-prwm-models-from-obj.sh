#!/bin/bash

./../implementations/obj2prwm/cli.js -i ./ascii-obj/unit-cube.obj -o ./prwm/cube-LE.prwm --positions --normals --indexed -q
./../implementations/obj2prwm/cli.js -i ./ascii-obj/unit-cube.obj -o ./prwm/cube-BE.prwm --positions --normals --indexed -q --be
./../implementations/obj2prwm/cli.js -i ./ascii-obj/smooth-suzanne.obj -o ./prwm/smooth-suzanne-LE.prwm --positions --normals --indexed -q
./../implementations/obj2prwm/cli.js -i ./ascii-obj/smooth-suzanne.obj -o ./prwm/smooth-suzanne-BE.prwm --positions --normals --indexed -q --be
./../implementations/obj2prwm/cli.js -i ./ascii-obj/faceted-nefertiti.obj -o ./prwm/faceted-nefertiti-LE.prwm --positions --normals --indexed -q
./../implementations/obj2prwm/cli.js -i ./ascii-obj/faceted-nefertiti.obj -o ./prwm/faceted-nefertiti-BE.prwm --positions --normals --indexed -q --be
./../implementations/obj2prwm/cli.js -i ./ascii-obj/smooth-nefertiti.obj -o ./prwm/smooth-nefertiti-LE.prwm --positions --normals --indexed -q
./../implementations/obj2prwm/cli.js -i ./ascii-obj/smooth-nefertiti.obj -o ./prwm/smooth-nefertiti-BE.prwm --positions --normals --indexed -q --be
./../implementations/obj2prwm/cli.js -i ./ascii-obj/vr_controller_vive_1_5.tri.obj -o ./prwm/vive-controller-LE.prwm --positions --normals --indexed -q
./../implementations/obj2prwm/cli.js -i ./ascii-obj/vr_controller_vive_1_5.tri.obj -o ./prwm/vive-controller-BE.prwm --positions --normals --indexed -q --be
./../implementations/obj2prwm/cli.js -i ./ascii-obj/cerberus.obj -o ./prwm/cerberus-LE.prwm --positions --normals --indexed -q
./../implementations/obj2prwm/cli.js -i ./ascii-obj/cerberus.obj -o ./prwm/cerberus-BE.prwm --positions --normals --indexed -q --be
