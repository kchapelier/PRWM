#!/bin/bash

./../implementations/obj2prwm/cli.js -i ./ascii-obj/unit-cube.obj -o ./prwm/cube.le.prwm --positions --normals --indexed -q
./../implementations/obj2prwm/cli.js -i ./ascii-obj/unit-cube.obj -o ./prwm/cube.be.prwm --positions --normals --indexed -q --be
./../implementations/obj2prwm/cli.js -i ./ascii-obj/smooth-suzanne.obj -o ./prwm/smooth-suzanne.le.prwm --positions --normals --indexed -q
./../implementations/obj2prwm/cli.js -i ./ascii-obj/smooth-suzanne.obj -o ./prwm/smooth-suzanne.be.prwm --positions --normals --indexed -q --be
./../implementations/obj2prwm/cli.js -i ./ascii-obj/faceted-nefertiti.obj -o ./prwm/faceted-nefertiti.le.prwm --positions --normals -q
./../implementations/obj2prwm/cli.js -i ./ascii-obj/faceted-nefertiti.obj -o ./prwm/faceted-nefertiti.be.prwm --positions --normals -q --be
./../implementations/obj2prwm/cli.js -i ./ascii-obj/smooth-nefertiti.obj -o ./prwm/smooth-nefertiti.le.prwm --positions --normals --indexed -q
./../implementations/obj2prwm/cli.js -i ./ascii-obj/smooth-nefertiti.obj -o ./prwm/smooth-nefertiti.be.prwm --positions --normals --indexed -q --be
./../implementations/obj2prwm/cli.js -i ./ascii-obj/vr_controller_vive_1_5.tri.obj -o ./prwm/vive-controller.le.prwm --positions --normals --indexed -q
./../implementations/obj2prwm/cli.js -i ./ascii-obj/vr_controller_vive_1_5.tri.obj -o ./prwm/vive-controller.be.prwm --positions --normals --indexed -q --be
./../implementations/obj2prwm/cli.js -i ./ascii-obj/cerberus.obj -o ./prwm/cerberus.le.prwm --positions --normals --indexed -q
./../implementations/obj2prwm/cli.js -i ./ascii-obj/cerberus.obj -o ./prwm/cerberus.be.prwm --positions --normals --indexed -q --be
