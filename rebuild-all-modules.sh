#!/bin/bash

cd implementations

cd obj2prwm
npm run build-dev
npm run build-min
cd ..

cd picogl-prwm-loader
npm run build-dev
npm run build-min
cd ..

cd prwm
npm run build-dev
npm run build-min
cd ..

cd svg2prwm
npm run build-dev
npm run build-min
cd ..

cd three-buffergeometry-to-prwm
npm run build-dev
npm run build-min
cd ..

cd ..
