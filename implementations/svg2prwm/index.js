"use strict";

var extractSvgPath = require('extract-svg-path').parse;
var createMesh = require('svg-mesh-3d');
var prwm = require('prwm');
var reindex = require('mesh-reindex');
var unindex = require('unindex-mesh');

var nbVertices = null;

module.exports = {
    convert: function (svgString, options) {
        var mesh = createMesh(extractSvgPath(svgString), {
            normalize: true,
            simplify: options.simplify,
            scale: options.scale
        });

        if (options.separateTriangles) {
            mesh = reindex(unindex(mesh.positions, mesh.cells));
        }

        var attributes = {};

        var positions = new Float32Array(mesh.positions.length * 3);

        for (var i = 0; i < mesh.positions.length; i++) {
            positions[i * 3] = mesh.positions[i][0];
            positions[i * 3 + 1] = mesh.positions[i][1];
            positions[i * 3 + 2] = mesh.positions[i][2];
        }

        attributes.position = {
            cardinality: 3,
            normalized: false,
            values: positions
        };

        nbVertices = positions.length / 3;

        if (options.normals) {
            // saves a few kB by using a Int8Array instead of a Float32Array
            var normals = new Int8Array(mesh.positions.length * 3);

            for (i = 0; i < mesh.positions.length; i++) {
                normals[i * 3] = 0;
                normals[i * 3 + 1] = 0;
                normals[i * 3 + 2] = 1;
            }

            attributes.normal = {
                cardinality: 3,
                normalized: false,
                values: normals
            };
        }

        if (options.uvs) {
            var uvs = new Float32Array(mesh.positions.length * 2);

            for (i = 0; i < mesh.positions.length; i++) {
                uvs[i * 2] = (1 + mesh.positions[i][0]) / 2;
                uvs[i * 2 + 1] = (1 + mesh.positions[i][1]) / 2;
            }

            attributes.uv = {
                cardinality: 2,
                normalized: false,
                values: uvs
            };
        }

        var indices = null;

        indices = mesh.positions.length <= 0xFFFF ? new Uint16Array(mesh.cells.length * 3) : new Uint32Array(mesh.cells.length * 3);

        for (i = 0; i < mesh.cells.length; i++) {
            indices[i * 3] = mesh.cells[i][1];
            indices[i * 3 + 1] = mesh.cells[i][0];
            indices[i * 3 + 2] = mesh.cells[i][2];
        }

        return prwm.encode(
            attributes,
            indices,
            options.bigEndian
        );
    },
    getNumberOfVertices: function () {
        return nbVertices;
    }
};
