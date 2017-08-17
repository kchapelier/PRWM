#!/bin/bash

./implementations/obj2prwm/cli.js -i ./models/ascii-obj/unit-cube.obj -o ./models/prwm/cube.le.prwm --positions --normals --indexed -q
./implementations/obj2prwm/cli.js -i ./models/ascii-obj/unit-cube.obj -o ./models/prwm/cube.be.prwm --positions --normals --indexed -q --be
./implementations/obj2prwm/cli.js -i ./models/ascii-obj/smooth-suzanne.obj -o ./models/prwm/smooth-suzanne.le.prwm --positions --normals --indexed -q
./implementations/obj2prwm/cli.js -i ./models/ascii-obj/smooth-suzanne.obj -o ./models/prwm/smooth-suzanne.be.prwm --positions --normals --indexed -q --be
./implementations/obj2prwm/cli.js -i ./models/ascii-obj/faceted-nefertiti.obj -o ./models/prwm/faceted-nefertiti.le.prwm --positions --normals -q
./implementations/obj2prwm/cli.js -i ./models/ascii-obj/faceted-nefertiti.obj -o ./models/prwm/faceted-nefertiti.be.prwm --positions --normals -q --be
./implementations/obj2prwm/cli.js -i ./models/ascii-obj/smooth-nefertiti.obj -o ./models/prwm/smooth-nefertiti.le.prwm --positions --normals --indexed -q
./implementations/obj2prwm/cli.js -i ./models/ascii-obj/smooth-nefertiti.obj -o ./models/prwm/smooth-nefertiti.be.prwm --positions --normals --indexed -q --be
./implementations/obj2prwm/cli.js -i ./models/ascii-obj/vr_controller_vive_1_5.tri.obj -o ./models/prwm/vive-controller.le.prwm --positions --normals --indexed -q
./implementations/obj2prwm/cli.js -i ./models/ascii-obj/vr_controller_vive_1_5.tri.obj -o ./models/prwm/vive-controller.be.prwm --positions --normals --indexed -q --be
./implementations/obj2prwm/cli.js -i ./models/ascii-obj/cerberus.obj -o ./models/prwm/cerberus.le.prwm --positions --normals --indexed -q
./implementations/obj2prwm/cli.js -i ./models/ascii-obj/cerberus.obj -o ./models/prwm/cerberus.be.prwm --positions --normals --indexed -q --be

./implementations/obj2prwm/cli.js -i ./models/ascii-obj/stanford-bunny.obj -o ./models/prwm/stanford-bunny.le.prwm --positions --normals --indexed -q
./implementations/obj2prwm/cli.js -i ./models/ascii-obj/stanford-bunny.obj -o ./models/prwm/stanford-bunny.be.prwm --positions --normals --indexed --be -q
./implementations/obj2prwm/cli.js -i ./models/ascii-obj/stanford-dragon.obj -o ./models/prwm/stanford-dragon.le.prwm --positions --normals -q
./implementations/obj2prwm/cli.js -i ./models/ascii-obj/stanford-dragon.obj -o ./models/prwm/stanford-dragon.be.prwm --positions --normals --be -q

./implementations/svg2prwm/cli.js -i ./models/svg/github.svg -o ./models/prwm/github-logo.le.prwm --normals --simplify 0.4 --scale 0.9 -q
./implementations/svg2prwm/cli.js -i ./models/svg/github.svg -o ./models/prwm/github-logo.be.prwm --normals --simplify 0.4 --scale 0.9 -q --be
./implementations/svg2prwm/cli.js -i ./models/svg/bowtie.svg -o ./models/prwm/bowtie-logo.le.prwm --normals --simplify 0.4 --scale 0.9 -q
./implementations/svg2prwm/cli.js -i ./models/svg/bowtie.svg -o ./models/prwm/bowtie-logo.be.prwm --normals --simplify 0.4 --scale 0.9 -q --be
./implementations/svg2prwm/cli.js -i ./models/svg/nodejs.svg -o ./models/prwm/nodejs-logo.le.prwm --normals --simplify 0.4 --scale 0.9 -q
./implementations/svg2prwm/cli.js -i ./models/svg/nodejs.svg -o ./models/prwm/nodejs-logo.be.prwm --normals --simplify 0.4 --scale 0.9 -q --be
./implementations/svg2prwm/cli.js -i ./models/svg/stylus.svg -o ./models/prwm/stylus-logo.le.prwm --normals --simplify 0.4 --scale 0.9 -q
./implementations/svg2prwm/cli.js -i ./models/svg/stylus.svg -o ./models/prwm/stylus-logo.be.prwm --normals --simplify 0.4 --scale 0.9 -q --be
