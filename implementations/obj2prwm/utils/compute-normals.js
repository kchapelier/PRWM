"use strict";

// based on https://github.com/kchapelier/procjam2015/blob/master/src/utils/meshes/compute-vertex-normals.js
// which itself is a rewrite of Three.js function to compute normals

var normalizeNormals = function normalizeNormals (normals) {
    var i, x, y, z, n;

    for (i = 0; i < normals.length; i+= 3) {
        x = normals[i];
        y = normals[i + 1];
        z = normals[i + 2];

        n = 1.0 / Math.sqrt(x * x + y * y + z * z);

        normals[i]*= n;
        normals[i + 1]*= n;
        normals[i + 2]*= n;
    }
};

var computeVertexNormals = function computeVertexNormals (indices, positions, normals) {
    var pA = [0,0,0],
        pB = [0,0,0],
        pC = [0,0,0],
        cb = [0,0,0],
        ab = [0,0,0],
        vA,
        vB,
        vC,
        cbx,
        cby,
        cbz,
        i;

    normals.length = positions.length;

    for (i = 0; i < normals.length; i++) {
        normals[i] = 0;
    }

    if (indices) {
        for (i = 0; i < indices.length; i += 3) {

            vA = indices[i] * 3;
            vB = indices[i + 1] * 3;
            vC = indices[i + 2] * 3;

            /*
             pA.fromArray( positions, vA );
             pB.fromArray( positions, vB );
             pC.fromArray( positions, vC );
             */

            pA[0] = positions[vA];
            pA[1] = positions[vA + 1];
            pA[2] = positions[vA + 2];

            pB[0] = positions[vB];
            pB[1] = positions[vB + 1];
            pB[2] = positions[vB + 2];

            pC[0] = positions[vC];
            pC[1] = positions[vC + 1];
            pC[2] = positions[vC + 2];

            /*
             cb.subVectors( pC, pB );
             ab.subVectors( pA, pB );
             */

            cb[0] = pC[0] - pB[0];
            cb[1] = pC[1] - pB[1];
            cb[2] = pC[2] - pB[2];

            ab[0] = pA[0] - pB[0];
            ab[1] = pA[1] - pB[1];
            ab[2] = pA[2] - pB[2];

            /*
             cb.cross( ab );
             */

            cbx = cb[0];
            cby = cb[1];
            cbz = cb[2];

            cb[0] = cby * ab[2] - cbz * ab[1];
            cb[1] = cbz * ab[0] - cbx * ab[2];
            cb[2] = cbx * ab[1] - cby * ab[0];

            normals[vA] += cb[0];
            normals[vA + 1] += cb[1];
            normals[vA + 2] += cb[2];

            normals[vB] += cb[0];
            normals[vB + 1] += cb[1];
            normals[vB + 2] += cb[2];

            normals[vC] += cb[0];
            normals[vC + 1] += cb[1];
            normals[vC + 2] += cb[2];

        }
    } else {
        for (i = 0; i < positions.length; i += 9) {

            /*
             pA.fromArray( positions, i );
             pB.fromArray( positions, i + 3 );
             pC.fromArray( positions, i + 6 );
             */

            pA[0] = positions[i];
            pA[1] = positions[i + 1];
            pA[2] = positions[i + 2];

            pB[0] = positions[i + 3];
            pB[1] = positions[i + 4];
            pB[2] = positions[i + 5];

            pC[0] = positions[i + 6];
            pC[1] = positions[i + 7];
            pC[2] = positions[i + 8];

            /*
             cb.subVectors( pC, pB );
             ab.subVectors( pA, pB );
             */

            cb[0] = pC[0] - pB[0];
            cb[1] = pC[1] - pB[1];
            cb[2] = pC[2] - pB[2];

            ab[0] = pA[0] - pB[0];
            ab[1] = pA[1] - pB[1];
            ab[2] = pA[2] - pB[2];

            /*
             cb.cross( ab );
             */

            cbx = cb[0];
            cby = cb[1];
            cbz = cb[2];

            cb[0] = cby * ab[2] - cbz * ab[1];
            cb[1] = cbz * ab[0] - cbx * ab[2];
            cb[2] = cbx * ab[1] - cby * ab[0];

            normals[ i ] = cb[0];
            normals[ i + 1 ] = cb[1];
            normals[ i + 2 ] = cb[2];

            normals[ i + 3 ] = cb[0];
            normals[ i + 4 ] = cb[1];
            normals[ i + 5 ] = cb[2];

            normals[ i + 6 ] = cb[0];
            normals[ i + 7 ] = cb[1];
            normals[ i + 8 ] = cb[2];
        }
    }

    normalizeNormals(normals);
};

module.exports = computeVertexNormals;
