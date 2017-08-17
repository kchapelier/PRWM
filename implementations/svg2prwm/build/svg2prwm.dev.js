!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.svg2prwm=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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

},{"extract-svg-path":41,"mesh-reindex":42,"prwm":48,"svg-mesh-3d":67,"unindex-mesh":72}],2:[function(require,module,exports){

module.exports = absolutize

/**
 * redefine `path` with absolute coordinates
 *
 * @param {Array} path
 * @return {Array}
 */

function absolutize(path){
	var startX = 0
	var startY = 0
	var x = 0
	var y = 0

	return path.map(function(seg){
		seg = seg.slice()
		var type = seg[0]
		var command = type.toUpperCase()

		// is relative
		if (type != command) {
			seg[0] = command
			switch (type) {
				case 'a':
					seg[6] += x
					seg[7] += y
					break
				case 'v':
					seg[1] += y
					break
				case 'h':
					seg[1] += x
					break
				default:
					for (var i = 1; i < seg.length;) {
						seg[i++] += x
						seg[i++] += y
					}
			}
		}

		// update cursor state
		switch (command) {
			case 'Z':
				x = startX
				y = startY
				break
			case 'H':
				x = seg[1]
				break
			case 'V':
				y = seg[1]
				break
			case 'M':
				x = startX = seg[1]
				y = startY = seg[2]
				break
			default:
				x = seg[seg.length - 2]
				y = seg[seg.length - 1]
		}

		return seg
	})
}

},{}],3:[function(require,module,exports){
function clone(point) { //TODO: use gl-vec2 for this
    return [point[0], point[1]]
}

function vec2(x, y) {
    return [x, y]
}

module.exports = function createBezierBuilder(opt) {
    opt = opt||{}

    var RECURSION_LIMIT = typeof opt.recursion === 'number' ? opt.recursion : 8
    var FLT_EPSILON = typeof opt.epsilon === 'number' ? opt.epsilon : 1.19209290e-7
    var PATH_DISTANCE_EPSILON = typeof opt.pathEpsilon === 'number' ? opt.pathEpsilon : 1.0

    var curve_angle_tolerance_epsilon = typeof opt.angleEpsilon === 'number' ? opt.angleEpsilon : 0.01
    var m_angle_tolerance = opt.angleTolerance || 0
    var m_cusp_limit = opt.cuspLimit || 0

    return function bezierCurve(start, c1, c2, end, scale, points) {
        if (!points)
            points = []

        scale = typeof scale === 'number' ? scale : 1.0
        var distanceTolerance = PATH_DISTANCE_EPSILON / scale
        distanceTolerance *= distanceTolerance
        begin(start, c1, c2, end, points, distanceTolerance)
        return points
    }


    ////// Based on:
    ////// https://github.com/pelson/antigrain/blob/master/agg-2.4/src/agg_curves.cpp

    function begin(start, c1, c2, end, points, distanceTolerance) {
        points.push(clone(start))
        var x1 = start[0],
            y1 = start[1],
            x2 = c1[0],
            y2 = c1[1],
            x3 = c2[0],
            y3 = c2[1],
            x4 = end[0],
            y4 = end[1]
        recursive(x1, y1, x2, y2, x3, y3, x4, y4, points, distanceTolerance, 0)
        points.push(clone(end))
    }

    function recursive(x1, y1, x2, y2, x3, y3, x4, y4, points, distanceTolerance, level) {
        if(level > RECURSION_LIMIT) 
            return

        var pi = Math.PI

        // Calculate all the mid-points of the line segments
        //----------------------
        var x12   = (x1 + x2) / 2
        var y12   = (y1 + y2) / 2
        var x23   = (x2 + x3) / 2
        var y23   = (y2 + y3) / 2
        var x34   = (x3 + x4) / 2
        var y34   = (y3 + y4) / 2
        var x123  = (x12 + x23) / 2
        var y123  = (y12 + y23) / 2
        var x234  = (x23 + x34) / 2
        var y234  = (y23 + y34) / 2
        var x1234 = (x123 + x234) / 2
        var y1234 = (y123 + y234) / 2

        if(level > 0) { // Enforce subdivision first time
            // Try to approximate the full cubic curve by a single straight line
            //------------------
            var dx = x4-x1
            var dy = y4-y1

            var d2 = Math.abs((x2 - x4) * dy - (y2 - y4) * dx)
            var d3 = Math.abs((x3 - x4) * dy - (y3 - y4) * dx)

            var da1, da2

            if(d2 > FLT_EPSILON && d3 > FLT_EPSILON) {
                // Regular care
                //-----------------
                if((d2 + d3)*(d2 + d3) <= distanceTolerance * (dx*dx + dy*dy)) {
                    // If the curvature doesn't exceed the distanceTolerance value
                    // we tend to finish subdivisions.
                    //----------------------
                    if(m_angle_tolerance < curve_angle_tolerance_epsilon) {
                        points.push(vec2(x1234, y1234))
                        return
                    }

                    // Angle & Cusp Condition
                    //----------------------
                    var a23 = Math.atan2(y3 - y2, x3 - x2)
                    da1 = Math.abs(a23 - Math.atan2(y2 - y1, x2 - x1))
                    da2 = Math.abs(Math.atan2(y4 - y3, x4 - x3) - a23)
                    if(da1 >= pi) da1 = 2*pi - da1
                    if(da2 >= pi) da2 = 2*pi - da2

                    if(da1 + da2 < m_angle_tolerance) {
                        // Finally we can stop the recursion
                        //----------------------
                        points.push(vec2(x1234, y1234))
                        return
                    }

                    if(m_cusp_limit !== 0.0) {
                        if(da1 > m_cusp_limit) {
                            points.push(vec2(x2, y2))
                            return
                        }

                        if(da2 > m_cusp_limit) {
                            points.push(vec2(x3, y3))
                            return
                        }
                    }
                }
            }
            else {
                if(d2 > FLT_EPSILON) {
                    // p1,p3,p4 are collinear, p2 is considerable
                    //----------------------
                    if(d2 * d2 <= distanceTolerance * (dx*dx + dy*dy)) {
                        if(m_angle_tolerance < curve_angle_tolerance_epsilon) {
                            points.push(vec2(x1234, y1234))
                            return
                        }

                        // Angle Condition
                        //----------------------
                        da1 = Math.abs(Math.atan2(y3 - y2, x3 - x2) - Math.atan2(y2 - y1, x2 - x1))
                        if(da1 >= pi) da1 = 2*pi - da1

                        if(da1 < m_angle_tolerance) {
                            points.push(vec2(x2, y2))
                            points.push(vec2(x3, y3))
                            return
                        }

                        if(m_cusp_limit !== 0.0) {
                            if(da1 > m_cusp_limit) {
                                points.push(vec2(x2, y2))
                                return
                            }
                        }
                    }
                }
                else if(d3 > FLT_EPSILON) {
                    // p1,p2,p4 are collinear, p3 is considerable
                    //----------------------
                    if(d3 * d3 <= distanceTolerance * (dx*dx + dy*dy)) {
                        if(m_angle_tolerance < curve_angle_tolerance_epsilon) {
                            points.push(vec2(x1234, y1234))
                            return
                        }

                        // Angle Condition
                        //----------------------
                        da1 = Math.abs(Math.atan2(y4 - y3, x4 - x3) - Math.atan2(y3 - y2, x3 - x2))
                        if(da1 >= pi) da1 = 2*pi - da1

                        if(da1 < m_angle_tolerance) {
                            points.push(vec2(x2, y2))
                            points.push(vec2(x3, y3))
                            return
                        }

                        if(m_cusp_limit !== 0.0) {
                            if(da1 > m_cusp_limit)
                            {
                                points.push(vec2(x3, y3))
                                return
                            }
                        }
                    }
                }
                else {
                    // Collinear case
                    //-----------------
                    dx = x1234 - (x1 + x4) / 2
                    dy = y1234 - (y1 + y4) / 2
                    if(dx*dx + dy*dy <= distanceTolerance) {
                        points.push(vec2(x1234, y1234))
                        return
                    }
                }
            }
        }

        // Continue subdivision
        //----------------------
        recursive(x1, y1, x12, y12, x123, y123, x1234, y1234, points, distanceTolerance, level + 1) 
        recursive(x1234, y1234, x234, y234, x34, y34, x4, y4, points, distanceTolerance, level + 1) 
    }
}

},{}],4:[function(require,module,exports){
module.exports = require('./function')()
},{"./function":3}],5:[function(require,module,exports){
'use strict'

var rationalize = require('./lib/rationalize')

module.exports = add

function add(a, b) {
  return rationalize(
    a[0].mul(b[1]).add(b[0].mul(a[1])),
    a[1].mul(b[1]))
}

},{"./lib/rationalize":15}],6:[function(require,module,exports){
'use strict'

module.exports = cmp

function cmp(a, b) {
    return a[0].mul(b[1]).cmp(b[0].mul(a[1]))
}

},{}],7:[function(require,module,exports){
'use strict'

var rationalize = require('./lib/rationalize')

module.exports = div

function div(a, b) {
  return rationalize(a[0].mul(b[1]), a[1].mul(b[0]))
}

},{"./lib/rationalize":15}],8:[function(require,module,exports){
'use strict'

var isRat = require('./is-rat')
var isBN = require('./lib/is-bn')
var num2bn = require('./lib/num-to-bn')
var str2bn = require('./lib/str-to-bn')
var rationalize = require('./lib/rationalize')
var div = require('./div')

module.exports = makeRational

function makeRational(numer, denom) {
  if(isRat(numer)) {
    if(denom) {
      return div(numer, makeRational(denom))
    }
    return [numer[0].clone(), numer[1].clone()]
  }
  var shift = 0
  var a, b
  if(isBN(numer)) {
    a = numer.clone()
  } else if(typeof numer === 'string') {
    a = str2bn(numer)
  } else if(numer === 0) {
    return [num2bn(0), num2bn(1)]
  } else if(numer === Math.floor(numer)) {
    a = num2bn(numer)
  } else {
    while(numer !== Math.floor(numer)) {
      numer = numer * Math.pow(2, 256)
      shift -= 256
    }
    a = num2bn(numer)
  }
  if(isRat(denom)) {
    a.mul(denom[1])
    b = denom[0].clone()
  } else if(isBN(denom)) {
    b = denom.clone()
  } else if(typeof denom === 'string') {
    b = str2bn(denom)
  } else if(!denom) {
    b = num2bn(1)
  } else if(denom === Math.floor(denom)) {
    b = num2bn(denom)
  } else {
    while(denom !== Math.floor(denom)) {
      denom = denom * Math.pow(2, 256)
      shift += 256
    }
    b = num2bn(denom)
  }
  if(shift > 0) {
    a = a.ushln(shift)
  } else if(shift < 0) {
    b = b.ushln(-shift)
  }
  return rationalize(a, b)
}

},{"./div":7,"./is-rat":9,"./lib/is-bn":13,"./lib/num-to-bn":14,"./lib/rationalize":15,"./lib/str-to-bn":16}],9:[function(require,module,exports){
'use strict'

var isBN = require('./lib/is-bn')

module.exports = isRat

function isRat(x) {
  return Array.isArray(x) && x.length === 2 && isBN(x[0]) && isBN(x[1])
}

},{"./lib/is-bn":13}],10:[function(require,module,exports){
'use strict'

var BN = require('bn.js')

module.exports = sign

function sign (x) {
  return x.cmp(new BN(0))
}

},{"bn.js":23}],11:[function(require,module,exports){
'use strict'

var sign = require('./bn-sign')

module.exports = bn2num

//TODO: Make this better
function bn2num(b) {
  var l = b.length
  var words = b.words
  var out = 0
  if (l === 1) {
    out = words[0]
  } else if (l === 2) {
    out = words[0] + (words[1] * 0x4000000)
  } else {
    for (var i = 0; i < l; i++) {
      var w = words[i]
      out += w * Math.pow(0x4000000, i)
    }
  }
  return sign(b) * out
}

},{"./bn-sign":10}],12:[function(require,module,exports){
'use strict'

var db = require('double-bits')
var ctz = require('bit-twiddle').countTrailingZeros

module.exports = ctzNumber

//Counts the number of trailing zeros
function ctzNumber(x) {
  var l = ctz(db.lo(x))
  if(l < 32) {
    return l
  }
  var h = ctz(db.hi(x))
  if(h > 20) {
    return 52
  }
  return h + 32
}

},{"bit-twiddle":22,"double-bits":39}],13:[function(require,module,exports){
'use strict'

var BN = require('bn.js')

module.exports = isBN

//Test if x is a bignumber
//FIXME: obviously this is the wrong way to do it
function isBN(x) {
  return x && typeof x === 'object' && Boolean(x.words)
}

},{"bn.js":23}],14:[function(require,module,exports){
'use strict'

var BN = require('bn.js')
var db = require('double-bits')

module.exports = num2bn

function num2bn(x) {
  var e = db.exponent(x)
  if(e < 52) {
    return new BN(x)
  } else {
    return (new BN(x * Math.pow(2, 52-e))).ushln(e-52)
  }
}

},{"bn.js":23,"double-bits":39}],15:[function(require,module,exports){
'use strict'

var num2bn = require('./num-to-bn')
var sign = require('./bn-sign')

module.exports = rationalize

function rationalize(numer, denom) {
  var snumer = sign(numer)
  var sdenom = sign(denom)
  if(snumer === 0) {
    return [num2bn(0), num2bn(1)]
  }
  if(sdenom === 0) {
    return [num2bn(0), num2bn(0)]
  }
  if(sdenom < 0) {
    numer = numer.neg()
    denom = denom.neg()
  }
  var d = numer.gcd(denom)
  if(d.cmpn(1)) {
    return [ numer.div(d), denom.div(d) ]
  }
  return [ numer, denom ]
}

},{"./bn-sign":10,"./num-to-bn":14}],16:[function(require,module,exports){
'use strict'

var BN = require('bn.js')

module.exports = str2BN

function str2BN(x) {
  return new BN(x)
}

},{"bn.js":23}],17:[function(require,module,exports){
'use strict'

var rationalize = require('./lib/rationalize')

module.exports = mul

function mul(a, b) {
  return rationalize(a[0].mul(b[0]), a[1].mul(b[1]))
}

},{"./lib/rationalize":15}],18:[function(require,module,exports){
'use strict'

var bnsign = require('./lib/bn-sign')

module.exports = sign

function sign(x) {
  return bnsign(x[0]) * bnsign(x[1])
}

},{"./lib/bn-sign":10}],19:[function(require,module,exports){
'use strict'

var rationalize = require('./lib/rationalize')

module.exports = sub

function sub(a, b) {
  return rationalize(a[0].mul(b[1]).sub(a[1].mul(b[0])), a[1].mul(b[1]))
}

},{"./lib/rationalize":15}],20:[function(require,module,exports){
'use strict'

var bn2num = require('./lib/bn-to-num')
var ctz = require('./lib/ctz')

module.exports = roundRat

// Round a rational to the closest float
function roundRat (f) {
  var a = f[0]
  var b = f[1]
  if (a.cmpn(0) === 0) {
    return 0
  }
  var h = a.abs().divmod(b.abs())
  var iv = h.div
  var x = bn2num(iv)
  var ir = h.mod
  var sgn = (a.negative !== b.negative) ? -1 : 1
  if (ir.cmpn(0) === 0) {
    return sgn * x
  }
  if (x) {
    var s = ctz(x) + 4
    var y = bn2num(ir.ushln(s).divRound(b))
    return sgn * (x + y * Math.pow(2, -s))
  } else {
    var ybits = b.bitLength() - ir.bitLength() + 53
    var y = bn2num(ir.ushln(ybits).divRound(b))
    if (ybits < 1023) {
      return sgn * y * Math.pow(2, -ybits)
    }
    y *= Math.pow(2, -1023)
    return sgn * y * Math.pow(2, 1023 - ybits)
  }
}

},{"./lib/bn-to-num":11,"./lib/ctz":12}],21:[function(require,module,exports){
"use strict"

function compileSearch(funcName, predicate, reversed, extraArgs, earlyOut) {
  var code = [
    "function ", funcName, "(a,l,h,", extraArgs.join(","),  "){",
earlyOut ? "" : "var i=", (reversed ? "l-1" : "h+1"),
";while(l<=h){\
var m=(l+h)>>>1,x=a[m]"]
  if(earlyOut) {
    if(predicate.indexOf("c") < 0) {
      code.push(";if(x===y){return m}else if(x<=y){")
    } else {
      code.push(";var p=c(x,y);if(p===0){return m}else if(p<=0){")
    }
  } else {
    code.push(";if(", predicate, "){i=m;")
  }
  if(reversed) {
    code.push("l=m+1}else{h=m-1}")
  } else {
    code.push("h=m-1}else{l=m+1}")
  }
  code.push("}")
  if(earlyOut) {
    code.push("return -1};")
  } else {
    code.push("return i};")
  }
  return code.join("")
}

function compileBoundsSearch(predicate, reversed, suffix, earlyOut) {
  var result = new Function([
  compileSearch("A", "x" + predicate + "y", reversed, ["y"], earlyOut),
  compileSearch("P", "c(x,y)" + predicate + "0", reversed, ["y", "c"], earlyOut),
"function dispatchBsearch", suffix, "(a,y,c,l,h){\
if(typeof(c)==='function'){\
return P(a,(l===void 0)?0:l|0,(h===void 0)?a.length-1:h|0,y,c)\
}else{\
return A(a,(c===void 0)?0:c|0,(l===void 0)?a.length-1:l|0,y)\
}}\
return dispatchBsearch", suffix].join(""))
  return result()
}

module.exports = {
  ge: compileBoundsSearch(">=", false, "GE"),
  gt: compileBoundsSearch(">", false, "GT"),
  lt: compileBoundsSearch("<", true, "LT"),
  le: compileBoundsSearch("<=", true, "LE"),
  eq: compileBoundsSearch("-", true, "EQ", true)
}

},{}],22:[function(require,module,exports){
/**
 * Bit twiddling hacks for JavaScript.
 *
 * Author: Mikola Lysenko
 *
 * Ported from Stanford bit twiddling hack library:
 *    http://graphics.stanford.edu/~seander/bithacks.html
 */

"use strict"; "use restrict";

//Number of bits in an integer
var INT_BITS = 32;

//Constants
exports.INT_BITS  = INT_BITS;
exports.INT_MAX   =  0x7fffffff;
exports.INT_MIN   = -1<<(INT_BITS-1);

//Returns -1, 0, +1 depending on sign of x
exports.sign = function(v) {
  return (v > 0) - (v < 0);
}

//Computes absolute value of integer
exports.abs = function(v) {
  var mask = v >> (INT_BITS-1);
  return (v ^ mask) - mask;
}

//Computes minimum of integers x and y
exports.min = function(x, y) {
  return y ^ ((x ^ y) & -(x < y));
}

//Computes maximum of integers x and y
exports.max = function(x, y) {
  return x ^ ((x ^ y) & -(x < y));
}

//Checks if a number is a power of two
exports.isPow2 = function(v) {
  return !(v & (v-1)) && (!!v);
}

//Computes log base 2 of v
exports.log2 = function(v) {
  var r, shift;
  r =     (v > 0xFFFF) << 4; v >>>= r;
  shift = (v > 0xFF  ) << 3; v >>>= shift; r |= shift;
  shift = (v > 0xF   ) << 2; v >>>= shift; r |= shift;
  shift = (v > 0x3   ) << 1; v >>>= shift; r |= shift;
  return r | (v >> 1);
}

//Computes log base 10 of v
exports.log10 = function(v) {
  return  (v >= 1000000000) ? 9 : (v >= 100000000) ? 8 : (v >= 10000000) ? 7 :
          (v >= 1000000) ? 6 : (v >= 100000) ? 5 : (v >= 10000) ? 4 :
          (v >= 1000) ? 3 : (v >= 100) ? 2 : (v >= 10) ? 1 : 0;
}

//Counts number of bits
exports.popCount = function(v) {
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return ((v + (v >>> 4) & 0xF0F0F0F) * 0x1010101) >>> 24;
}

//Counts number of trailing zeros
function countTrailingZeros(v) {
  var c = 32;
  v &= -v;
  if (v) c--;
  if (v & 0x0000FFFF) c -= 16;
  if (v & 0x00FF00FF) c -= 8;
  if (v & 0x0F0F0F0F) c -= 4;
  if (v & 0x33333333) c -= 2;
  if (v & 0x55555555) c -= 1;
  return c;
}
exports.countTrailingZeros = countTrailingZeros;

//Rounds to next power of 2
exports.nextPow2 = function(v) {
  v += v === 0;
  --v;
  v |= v >>> 1;
  v |= v >>> 2;
  v |= v >>> 4;
  v |= v >>> 8;
  v |= v >>> 16;
  return v + 1;
}

//Rounds down to previous power of 2
exports.prevPow2 = function(v) {
  v |= v >>> 1;
  v |= v >>> 2;
  v |= v >>> 4;
  v |= v >>> 8;
  v |= v >>> 16;
  return v - (v>>>1);
}

//Computes parity of word
exports.parity = function(v) {
  v ^= v >>> 16;
  v ^= v >>> 8;
  v ^= v >>> 4;
  v &= 0xf;
  return (0x6996 >>> v) & 1;
}

var REVERSE_TABLE = new Array(256);

(function(tab) {
  for(var i=0; i<256; ++i) {
    var v = i, r = i, s = 7;
    for (v >>>= 1; v; v >>>= 1) {
      r <<= 1;
      r |= v & 1;
      --s;
    }
    tab[i] = (r << s) & 0xff;
  }
})(REVERSE_TABLE);

//Reverse bits in a 32 bit word
exports.reverse = function(v) {
  return  (REVERSE_TABLE[ v         & 0xff] << 24) |
          (REVERSE_TABLE[(v >>> 8)  & 0xff] << 16) |
          (REVERSE_TABLE[(v >>> 16) & 0xff] << 8)  |
           REVERSE_TABLE[(v >>> 24) & 0xff];
}

//Interleave bits of 2 coordinates with 16 bits.  Useful for fast quadtree codes
exports.interleave2 = function(x, y) {
  x &= 0xFFFF;
  x = (x | (x << 8)) & 0x00FF00FF;
  x = (x | (x << 4)) & 0x0F0F0F0F;
  x = (x | (x << 2)) & 0x33333333;
  x = (x | (x << 1)) & 0x55555555;

  y &= 0xFFFF;
  y = (y | (y << 8)) & 0x00FF00FF;
  y = (y | (y << 4)) & 0x0F0F0F0F;
  y = (y | (y << 2)) & 0x33333333;
  y = (y | (y << 1)) & 0x55555555;

  return x | (y << 1);
}

//Extracts the nth interleaved component
exports.deinterleave2 = function(v, n) {
  v = (v >>> n) & 0x55555555;
  v = (v | (v >>> 1))  & 0x33333333;
  v = (v | (v >>> 2))  & 0x0F0F0F0F;
  v = (v | (v >>> 4))  & 0x00FF00FF;
  v = (v | (v >>> 16)) & 0x000FFFF;
  return (v << 16) >> 16;
}


//Interleave bits of 3 coordinates, each with 10 bits.  Useful for fast octree codes
exports.interleave3 = function(x, y, z) {
  x &= 0x3FF;
  x  = (x | (x<<16)) & 4278190335;
  x  = (x | (x<<8))  & 251719695;
  x  = (x | (x<<4))  & 3272356035;
  x  = (x | (x<<2))  & 1227133513;

  y &= 0x3FF;
  y  = (y | (y<<16)) & 4278190335;
  y  = (y | (y<<8))  & 251719695;
  y  = (y | (y<<4))  & 3272356035;
  y  = (y | (y<<2))  & 1227133513;
  x |= (y << 1);
  
  z &= 0x3FF;
  z  = (z | (z<<16)) & 4278190335;
  z  = (z | (z<<8))  & 251719695;
  z  = (z | (z<<4))  & 3272356035;
  z  = (z | (z<<2))  & 1227133513;
  
  return x | (z << 2);
}

//Extracts nth interleaved component of a 3-tuple
exports.deinterleave3 = function(v, n) {
  v = (v >>> n)       & 1227133513;
  v = (v | (v>>>2))   & 3272356035;
  v = (v | (v>>>4))   & 251719695;
  v = (v | (v>>>8))   & 4278190335;
  v = (v | (v>>>16))  & 0x3FF;
  return (v<<22)>>22;
}

//Computes next combination in colexicographic order (this is mistakenly called nextPermutation on the bit twiddling hacks page)
exports.nextCombination = function(v) {
  var t = v | (v - 1);
  return (t + 1) | (((~t & -~t) - 1) >>> (countTrailingZeros(v) + 1));
}


},{}],23:[function(require,module,exports){
(function (module, exports) {
  'use strict';

  // Utils
  function assert (val, msg) {
    if (!val) throw new Error(msg || 'Assertion failed');
  }

  // Could use `inherits` module, but don't want to move from single file
  // architecture yet.
  function inherits (ctor, superCtor) {
    ctor.super_ = superCtor;
    var TempCtor = function () {};
    TempCtor.prototype = superCtor.prototype;
    ctor.prototype = new TempCtor();
    ctor.prototype.constructor = ctor;
  }

  // BN

  function BN (number, base, endian) {
    if (BN.isBN(number)) {
      return number;
    }

    this.negative = 0;
    this.words = null;
    this.length = 0;

    // Reduction context
    this.red = null;

    if (number !== null) {
      if (base === 'le' || base === 'be') {
        endian = base;
        base = 10;
      }

      this._init(number || 0, base || 10, endian || 'be');
    }
  }
  if (typeof module === 'object') {
    module.exports = BN;
  } else {
    exports.BN = BN;
  }

  BN.BN = BN;
  BN.wordSize = 26;

  var Buffer;
  try {
    Buffer = require('buffer').Buffer;
  } catch (e) {
  }

  BN.isBN = function isBN (num) {
    if (num instanceof BN) {
      return true;
    }

    return num !== null && typeof num === 'object' &&
      num.constructor.wordSize === BN.wordSize && Array.isArray(num.words);
  };

  BN.max = function max (left, right) {
    if (left.cmp(right) > 0) return left;
    return right;
  };

  BN.min = function min (left, right) {
    if (left.cmp(right) < 0) return left;
    return right;
  };

  BN.prototype._init = function init (number, base, endian) {
    if (typeof number === 'number') {
      return this._initNumber(number, base, endian);
    }

    if (typeof number === 'object') {
      return this._initArray(number, base, endian);
    }

    if (base === 'hex') {
      base = 16;
    }
    assert(base === (base | 0) && base >= 2 && base <= 36);

    number = number.toString().replace(/\s+/g, '');
    var start = 0;
    if (number[0] === '-') {
      start++;
    }

    if (base === 16) {
      this._parseHex(number, start);
    } else {
      this._parseBase(number, base, start);
    }

    if (number[0] === '-') {
      this.negative = 1;
    }

    this.strip();

    if (endian !== 'le') return;

    this._initArray(this.toArray(), base, endian);
  };

  BN.prototype._initNumber = function _initNumber (number, base, endian) {
    if (number < 0) {
      this.negative = 1;
      number = -number;
    }
    if (number < 0x4000000) {
      this.words = [ number & 0x3ffffff ];
      this.length = 1;
    } else if (number < 0x10000000000000) {
      this.words = [
        number & 0x3ffffff,
        (number / 0x4000000) & 0x3ffffff
      ];
      this.length = 2;
    } else {
      assert(number < 0x20000000000000); // 2 ^ 53 (unsafe)
      this.words = [
        number & 0x3ffffff,
        (number / 0x4000000) & 0x3ffffff,
        1
      ];
      this.length = 3;
    }

    if (endian !== 'le') return;

    // Reverse the bytes
    this._initArray(this.toArray(), base, endian);
  };

  BN.prototype._initArray = function _initArray (number, base, endian) {
    // Perhaps a Uint8Array
    assert(typeof number.length === 'number');
    if (number.length <= 0) {
      this.words = [ 0 ];
      this.length = 1;
      return this;
    }

    this.length = Math.ceil(number.length / 3);
    this.words = new Array(this.length);
    for (var i = 0; i < this.length; i++) {
      this.words[i] = 0;
    }

    var j, w;
    var off = 0;
    if (endian === 'be') {
      for (i = number.length - 1, j = 0; i >= 0; i -= 3) {
        w = number[i] | (number[i - 1] << 8) | (number[i - 2] << 16);
        this.words[j] |= (w << off) & 0x3ffffff;
        this.words[j + 1] = (w >>> (26 - off)) & 0x3ffffff;
        off += 24;
        if (off >= 26) {
          off -= 26;
          j++;
        }
      }
    } else if (endian === 'le') {
      for (i = 0, j = 0; i < number.length; i += 3) {
        w = number[i] | (number[i + 1] << 8) | (number[i + 2] << 16);
        this.words[j] |= (w << off) & 0x3ffffff;
        this.words[j + 1] = (w >>> (26 - off)) & 0x3ffffff;
        off += 24;
        if (off >= 26) {
          off -= 26;
          j++;
        }
      }
    }
    return this.strip();
  };

  function parseHex (str, start, end) {
    var r = 0;
    var len = Math.min(str.length, end);
    for (var i = start; i < len; i++) {
      var c = str.charCodeAt(i) - 48;

      r <<= 4;

      // 'a' - 'f'
      if (c >= 49 && c <= 54) {
        r |= c - 49 + 0xa;

      // 'A' - 'F'
      } else if (c >= 17 && c <= 22) {
        r |= c - 17 + 0xa;

      // '0' - '9'
      } else {
        r |= c & 0xf;
      }
    }
    return r;
  }

  BN.prototype._parseHex = function _parseHex (number, start) {
    // Create possibly bigger array to ensure that it fits the number
    this.length = Math.ceil((number.length - start) / 6);
    this.words = new Array(this.length);
    for (var i = 0; i < this.length; i++) {
      this.words[i] = 0;
    }

    var j, w;
    // Scan 24-bit chunks and add them to the number
    var off = 0;
    for (i = number.length - 6, j = 0; i >= start; i -= 6) {
      w = parseHex(number, i, i + 6);
      this.words[j] |= (w << off) & 0x3ffffff;
      // NOTE: `0x3fffff` is intentional here, 26bits max shift + 24bit hex limb
      this.words[j + 1] |= w >>> (26 - off) & 0x3fffff;
      off += 24;
      if (off >= 26) {
        off -= 26;
        j++;
      }
    }
    if (i + 6 !== start) {
      w = parseHex(number, start, i + 6);
      this.words[j] |= (w << off) & 0x3ffffff;
      this.words[j + 1] |= w >>> (26 - off) & 0x3fffff;
    }
    this.strip();
  };

  function parseBase (str, start, end, mul) {
    var r = 0;
    var len = Math.min(str.length, end);
    for (var i = start; i < len; i++) {
      var c = str.charCodeAt(i) - 48;

      r *= mul;

      // 'a'
      if (c >= 49) {
        r += c - 49 + 0xa;

      // 'A'
      } else if (c >= 17) {
        r += c - 17 + 0xa;

      // '0' - '9'
      } else {
        r += c;
      }
    }
    return r;
  }

  BN.prototype._parseBase = function _parseBase (number, base, start) {
    // Initialize as zero
    this.words = [ 0 ];
    this.length = 1;

    // Find length of limb in base
    for (var limbLen = 0, limbPow = 1; limbPow <= 0x3ffffff; limbPow *= base) {
      limbLen++;
    }
    limbLen--;
    limbPow = (limbPow / base) | 0;

    var total = number.length - start;
    var mod = total % limbLen;
    var end = Math.min(total, total - mod) + start;

    var word = 0;
    for (var i = start; i < end; i += limbLen) {
      word = parseBase(number, i, i + limbLen, base);

      this.imuln(limbPow);
      if (this.words[0] + word < 0x4000000) {
        this.words[0] += word;
      } else {
        this._iaddn(word);
      }
    }

    if (mod !== 0) {
      var pow = 1;
      word = parseBase(number, i, number.length, base);

      for (i = 0; i < mod; i++) {
        pow *= base;
      }

      this.imuln(pow);
      if (this.words[0] + word < 0x4000000) {
        this.words[0] += word;
      } else {
        this._iaddn(word);
      }
    }
  };

  BN.prototype.copy = function copy (dest) {
    dest.words = new Array(this.length);
    for (var i = 0; i < this.length; i++) {
      dest.words[i] = this.words[i];
    }
    dest.length = this.length;
    dest.negative = this.negative;
    dest.red = this.red;
  };

  BN.prototype.clone = function clone () {
    var r = new BN(null);
    this.copy(r);
    return r;
  };

  BN.prototype._expand = function _expand (size) {
    while (this.length < size) {
      this.words[this.length++] = 0;
    }
    return this;
  };

  // Remove leading `0` from `this`
  BN.prototype.strip = function strip () {
    while (this.length > 1 && this.words[this.length - 1] === 0) {
      this.length--;
    }
    return this._normSign();
  };

  BN.prototype._normSign = function _normSign () {
    // -0 = 0
    if (this.length === 1 && this.words[0] === 0) {
      this.negative = 0;
    }
    return this;
  };

  BN.prototype.inspect = function inspect () {
    return (this.red ? '<BN-R: ' : '<BN: ') + this.toString(16) + '>';
  };

  /*

  var zeros = [];
  var groupSizes = [];
  var groupBases = [];

  var s = '';
  var i = -1;
  while (++i < BN.wordSize) {
    zeros[i] = s;
    s += '0';
  }
  groupSizes[0] = 0;
  groupSizes[1] = 0;
  groupBases[0] = 0;
  groupBases[1] = 0;
  var base = 2 - 1;
  while (++base < 36 + 1) {
    var groupSize = 0;
    var groupBase = 1;
    while (groupBase < (1 << BN.wordSize) / base) {
      groupBase *= base;
      groupSize += 1;
    }
    groupSizes[base] = groupSize;
    groupBases[base] = groupBase;
  }

  */

  var zeros = [
    '',
    '0',
    '00',
    '000',
    '0000',
    '00000',
    '000000',
    '0000000',
    '00000000',
    '000000000',
    '0000000000',
    '00000000000',
    '000000000000',
    '0000000000000',
    '00000000000000',
    '000000000000000',
    '0000000000000000',
    '00000000000000000',
    '000000000000000000',
    '0000000000000000000',
    '00000000000000000000',
    '000000000000000000000',
    '0000000000000000000000',
    '00000000000000000000000',
    '000000000000000000000000',
    '0000000000000000000000000'
  ];

  var groupSizes = [
    0, 0,
    25, 16, 12, 11, 10, 9, 8,
    8, 7, 7, 7, 7, 6, 6,
    6, 6, 6, 6, 6, 5, 5,
    5, 5, 5, 5, 5, 5, 5,
    5, 5, 5, 5, 5, 5, 5
  ];

  var groupBases = [
    0, 0,
    33554432, 43046721, 16777216, 48828125, 60466176, 40353607, 16777216,
    43046721, 10000000, 19487171, 35831808, 62748517, 7529536, 11390625,
    16777216, 24137569, 34012224, 47045881, 64000000, 4084101, 5153632,
    6436343, 7962624, 9765625, 11881376, 14348907, 17210368, 20511149,
    24300000, 28629151, 33554432, 39135393, 45435424, 52521875, 60466176
  ];

  BN.prototype.toString = function toString (base, padding) {
    base = base || 10;
    padding = padding | 0 || 1;

    var out;
    if (base === 16 || base === 'hex') {
      out = '';
      var off = 0;
      var carry = 0;
      for (var i = 0; i < this.length; i++) {
        var w = this.words[i];
        var word = (((w << off) | carry) & 0xffffff).toString(16);
        carry = (w >>> (24 - off)) & 0xffffff;
        if (carry !== 0 || i !== this.length - 1) {
          out = zeros[6 - word.length] + word + out;
        } else {
          out = word + out;
        }
        off += 2;
        if (off >= 26) {
          off -= 26;
          i--;
        }
      }
      if (carry !== 0) {
        out = carry.toString(16) + out;
      }
      while (out.length % padding !== 0) {
        out = '0' + out;
      }
      if (this.negative !== 0) {
        out = '-' + out;
      }
      return out;
    }

    if (base === (base | 0) && base >= 2 && base <= 36) {
      // var groupSize = Math.floor(BN.wordSize * Math.LN2 / Math.log(base));
      var groupSize = groupSizes[base];
      // var groupBase = Math.pow(base, groupSize);
      var groupBase = groupBases[base];
      out = '';
      var c = this.clone();
      c.negative = 0;
      while (!c.isZero()) {
        var r = c.modn(groupBase).toString(base);
        c = c.idivn(groupBase);

        if (!c.isZero()) {
          out = zeros[groupSize - r.length] + r + out;
        } else {
          out = r + out;
        }
      }
      if (this.isZero()) {
        out = '0' + out;
      }
      while (out.length % padding !== 0) {
        out = '0' + out;
      }
      if (this.negative !== 0) {
        out = '-' + out;
      }
      return out;
    }

    assert(false, 'Base should be between 2 and 36');
  };

  BN.prototype.toNumber = function toNumber () {
    var ret = this.words[0];
    if (this.length === 2) {
      ret += this.words[1] * 0x4000000;
    } else if (this.length === 3 && this.words[2] === 0x01) {
      // NOTE: at this stage it is known that the top bit is set
      ret += 0x10000000000000 + (this.words[1] * 0x4000000);
    } else if (this.length > 2) {
      assert(false, 'Number can only safely store up to 53 bits');
    }
    return (this.negative !== 0) ? -ret : ret;
  };

  BN.prototype.toJSON = function toJSON () {
    return this.toString(16);
  };

  BN.prototype.toBuffer = function toBuffer (endian, length) {
    assert(typeof Buffer !== 'undefined');
    return this.toArrayLike(Buffer, endian, length);
  };

  BN.prototype.toArray = function toArray (endian, length) {
    return this.toArrayLike(Array, endian, length);
  };

  BN.prototype.toArrayLike = function toArrayLike (ArrayType, endian, length) {
    var byteLength = this.byteLength();
    var reqLength = length || Math.max(1, byteLength);
    assert(byteLength <= reqLength, 'byte array longer than desired length');
    assert(reqLength > 0, 'Requested array length <= 0');

    this.strip();
    var littleEndian = endian === 'le';
    var res = new ArrayType(reqLength);

    var b, i;
    var q = this.clone();
    if (!littleEndian) {
      // Assume big-endian
      for (i = 0; i < reqLength - byteLength; i++) {
        res[i] = 0;
      }

      for (i = 0; !q.isZero(); i++) {
        b = q.andln(0xff);
        q.iushrn(8);

        res[reqLength - i - 1] = b;
      }
    } else {
      for (i = 0; !q.isZero(); i++) {
        b = q.andln(0xff);
        q.iushrn(8);

        res[i] = b;
      }

      for (; i < reqLength; i++) {
        res[i] = 0;
      }
    }

    return res;
  };

  if (Math.clz32) {
    BN.prototype._countBits = function _countBits (w) {
      return 32 - Math.clz32(w);
    };
  } else {
    BN.prototype._countBits = function _countBits (w) {
      var t = w;
      var r = 0;
      if (t >= 0x1000) {
        r += 13;
        t >>>= 13;
      }
      if (t >= 0x40) {
        r += 7;
        t >>>= 7;
      }
      if (t >= 0x8) {
        r += 4;
        t >>>= 4;
      }
      if (t >= 0x02) {
        r += 2;
        t >>>= 2;
      }
      return r + t;
    };
  }

  BN.prototype._zeroBits = function _zeroBits (w) {
    // Short-cut
    if (w === 0) return 26;

    var t = w;
    var r = 0;
    if ((t & 0x1fff) === 0) {
      r += 13;
      t >>>= 13;
    }
    if ((t & 0x7f) === 0) {
      r += 7;
      t >>>= 7;
    }
    if ((t & 0xf) === 0) {
      r += 4;
      t >>>= 4;
    }
    if ((t & 0x3) === 0) {
      r += 2;
      t >>>= 2;
    }
    if ((t & 0x1) === 0) {
      r++;
    }
    return r;
  };

  // Return number of used bits in a BN
  BN.prototype.bitLength = function bitLength () {
    var w = this.words[this.length - 1];
    var hi = this._countBits(w);
    return (this.length - 1) * 26 + hi;
  };

  function toBitArray (num) {
    var w = new Array(num.bitLength());

    for (var bit = 0; bit < w.length; bit++) {
      var off = (bit / 26) | 0;
      var wbit = bit % 26;

      w[bit] = (num.words[off] & (1 << wbit)) >>> wbit;
    }

    return w;
  }

  // Number of trailing zero bits
  BN.prototype.zeroBits = function zeroBits () {
    if (this.isZero()) return 0;

    var r = 0;
    for (var i = 0; i < this.length; i++) {
      var b = this._zeroBits(this.words[i]);
      r += b;
      if (b !== 26) break;
    }
    return r;
  };

  BN.prototype.byteLength = function byteLength () {
    return Math.ceil(this.bitLength() / 8);
  };

  BN.prototype.toTwos = function toTwos (width) {
    if (this.negative !== 0) {
      return this.abs().inotn(width).iaddn(1);
    }
    return this.clone();
  };

  BN.prototype.fromTwos = function fromTwos (width) {
    if (this.testn(width - 1)) {
      return this.notn(width).iaddn(1).ineg();
    }
    return this.clone();
  };

  BN.prototype.isNeg = function isNeg () {
    return this.negative !== 0;
  };

  // Return negative clone of `this`
  BN.prototype.neg = function neg () {
    return this.clone().ineg();
  };

  BN.prototype.ineg = function ineg () {
    if (!this.isZero()) {
      this.negative ^= 1;
    }

    return this;
  };

  // Or `num` with `this` in-place
  BN.prototype.iuor = function iuor (num) {
    while (this.length < num.length) {
      this.words[this.length++] = 0;
    }

    for (var i = 0; i < num.length; i++) {
      this.words[i] = this.words[i] | num.words[i];
    }

    return this.strip();
  };

  BN.prototype.ior = function ior (num) {
    assert((this.negative | num.negative) === 0);
    return this.iuor(num);
  };

  // Or `num` with `this`
  BN.prototype.or = function or (num) {
    if (this.length > num.length) return this.clone().ior(num);
    return num.clone().ior(this);
  };

  BN.prototype.uor = function uor (num) {
    if (this.length > num.length) return this.clone().iuor(num);
    return num.clone().iuor(this);
  };

  // And `num` with `this` in-place
  BN.prototype.iuand = function iuand (num) {
    // b = min-length(num, this)
    var b;
    if (this.length > num.length) {
      b = num;
    } else {
      b = this;
    }

    for (var i = 0; i < b.length; i++) {
      this.words[i] = this.words[i] & num.words[i];
    }

    this.length = b.length;

    return this.strip();
  };

  BN.prototype.iand = function iand (num) {
    assert((this.negative | num.negative) === 0);
    return this.iuand(num);
  };

  // And `num` with `this`
  BN.prototype.and = function and (num) {
    if (this.length > num.length) return this.clone().iand(num);
    return num.clone().iand(this);
  };

  BN.prototype.uand = function uand (num) {
    if (this.length > num.length) return this.clone().iuand(num);
    return num.clone().iuand(this);
  };

  // Xor `num` with `this` in-place
  BN.prototype.iuxor = function iuxor (num) {
    // a.length > b.length
    var a;
    var b;
    if (this.length > num.length) {
      a = this;
      b = num;
    } else {
      a = num;
      b = this;
    }

    for (var i = 0; i < b.length; i++) {
      this.words[i] = a.words[i] ^ b.words[i];
    }

    if (this !== a) {
      for (; i < a.length; i++) {
        this.words[i] = a.words[i];
      }
    }

    this.length = a.length;

    return this.strip();
  };

  BN.prototype.ixor = function ixor (num) {
    assert((this.negative | num.negative) === 0);
    return this.iuxor(num);
  };

  // Xor `num` with `this`
  BN.prototype.xor = function xor (num) {
    if (this.length > num.length) return this.clone().ixor(num);
    return num.clone().ixor(this);
  };

  BN.prototype.uxor = function uxor (num) {
    if (this.length > num.length) return this.clone().iuxor(num);
    return num.clone().iuxor(this);
  };

  // Not ``this`` with ``width`` bitwidth
  BN.prototype.inotn = function inotn (width) {
    assert(typeof width === 'number' && width >= 0);

    var bytesNeeded = Math.ceil(width / 26) | 0;
    var bitsLeft = width % 26;

    // Extend the buffer with leading zeroes
    this._expand(bytesNeeded);

    if (bitsLeft > 0) {
      bytesNeeded--;
    }

    // Handle complete words
    for (var i = 0; i < bytesNeeded; i++) {
      this.words[i] = ~this.words[i] & 0x3ffffff;
    }

    // Handle the residue
    if (bitsLeft > 0) {
      this.words[i] = ~this.words[i] & (0x3ffffff >> (26 - bitsLeft));
    }

    // And remove leading zeroes
    return this.strip();
  };

  BN.prototype.notn = function notn (width) {
    return this.clone().inotn(width);
  };

  // Set `bit` of `this`
  BN.prototype.setn = function setn (bit, val) {
    assert(typeof bit === 'number' && bit >= 0);

    var off = (bit / 26) | 0;
    var wbit = bit % 26;

    this._expand(off + 1);

    if (val) {
      this.words[off] = this.words[off] | (1 << wbit);
    } else {
      this.words[off] = this.words[off] & ~(1 << wbit);
    }

    return this.strip();
  };

  // Add `num` to `this` in-place
  BN.prototype.iadd = function iadd (num) {
    var r;

    // negative + positive
    if (this.negative !== 0 && num.negative === 0) {
      this.negative = 0;
      r = this.isub(num);
      this.negative ^= 1;
      return this._normSign();

    // positive + negative
    } else if (this.negative === 0 && num.negative !== 0) {
      num.negative = 0;
      r = this.isub(num);
      num.negative = 1;
      return r._normSign();
    }

    // a.length > b.length
    var a, b;
    if (this.length > num.length) {
      a = this;
      b = num;
    } else {
      a = num;
      b = this;
    }

    var carry = 0;
    for (var i = 0; i < b.length; i++) {
      r = (a.words[i] | 0) + (b.words[i] | 0) + carry;
      this.words[i] = r & 0x3ffffff;
      carry = r >>> 26;
    }
    for (; carry !== 0 && i < a.length; i++) {
      r = (a.words[i] | 0) + carry;
      this.words[i] = r & 0x3ffffff;
      carry = r >>> 26;
    }

    this.length = a.length;
    if (carry !== 0) {
      this.words[this.length] = carry;
      this.length++;
    // Copy the rest of the words
    } else if (a !== this) {
      for (; i < a.length; i++) {
        this.words[i] = a.words[i];
      }
    }

    return this;
  };

  // Add `num` to `this`
  BN.prototype.add = function add (num) {
    var res;
    if (num.negative !== 0 && this.negative === 0) {
      num.negative = 0;
      res = this.sub(num);
      num.negative ^= 1;
      return res;
    } else if (num.negative === 0 && this.negative !== 0) {
      this.negative = 0;
      res = num.sub(this);
      this.negative = 1;
      return res;
    }

    if (this.length > num.length) return this.clone().iadd(num);

    return num.clone().iadd(this);
  };

  // Subtract `num` from `this` in-place
  BN.prototype.isub = function isub (num) {
    // this - (-num) = this + num
    if (num.negative !== 0) {
      num.negative = 0;
      var r = this.iadd(num);
      num.negative = 1;
      return r._normSign();

    // -this - num = -(this + num)
    } else if (this.negative !== 0) {
      this.negative = 0;
      this.iadd(num);
      this.negative = 1;
      return this._normSign();
    }

    // At this point both numbers are positive
    var cmp = this.cmp(num);

    // Optimization - zeroify
    if (cmp === 0) {
      this.negative = 0;
      this.length = 1;
      this.words[0] = 0;
      return this;
    }

    // a > b
    var a, b;
    if (cmp > 0) {
      a = this;
      b = num;
    } else {
      a = num;
      b = this;
    }

    var carry = 0;
    for (var i = 0; i < b.length; i++) {
      r = (a.words[i] | 0) - (b.words[i] | 0) + carry;
      carry = r >> 26;
      this.words[i] = r & 0x3ffffff;
    }
    for (; carry !== 0 && i < a.length; i++) {
      r = (a.words[i] | 0) + carry;
      carry = r >> 26;
      this.words[i] = r & 0x3ffffff;
    }

    // Copy rest of the words
    if (carry === 0 && i < a.length && a !== this) {
      for (; i < a.length; i++) {
        this.words[i] = a.words[i];
      }
    }

    this.length = Math.max(this.length, i);

    if (a !== this) {
      this.negative = 1;
    }

    return this.strip();
  };

  // Subtract `num` from `this`
  BN.prototype.sub = function sub (num) {
    return this.clone().isub(num);
  };

  function smallMulTo (self, num, out) {
    out.negative = num.negative ^ self.negative;
    var len = (self.length + num.length) | 0;
    out.length = len;
    len = (len - 1) | 0;

    // Peel one iteration (compiler can't do it, because of code complexity)
    var a = self.words[0] | 0;
    var b = num.words[0] | 0;
    var r = a * b;

    var lo = r & 0x3ffffff;
    var carry = (r / 0x4000000) | 0;
    out.words[0] = lo;

    for (var k = 1; k < len; k++) {
      // Sum all words with the same `i + j = k` and accumulate `ncarry`,
      // note that ncarry could be >= 0x3ffffff
      var ncarry = carry >>> 26;
      var rword = carry & 0x3ffffff;
      var maxJ = Math.min(k, num.length - 1);
      for (var j = Math.max(0, k - self.length + 1); j <= maxJ; j++) {
        var i = (k - j) | 0;
        a = self.words[i] | 0;
        b = num.words[j] | 0;
        r = a * b + rword;
        ncarry += (r / 0x4000000) | 0;
        rword = r & 0x3ffffff;
      }
      out.words[k] = rword | 0;
      carry = ncarry | 0;
    }
    if (carry !== 0) {
      out.words[k] = carry | 0;
    } else {
      out.length--;
    }

    return out.strip();
  }

  // TODO(indutny): it may be reasonable to omit it for users who don't need
  // to work with 256-bit numbers, otherwise it gives 20% improvement for 256-bit
  // multiplication (like elliptic secp256k1).
  var comb10MulTo = function comb10MulTo (self, num, out) {
    var a = self.words;
    var b = num.words;
    var o = out.words;
    var c = 0;
    var lo;
    var mid;
    var hi;
    var a0 = a[0] | 0;
    var al0 = a0 & 0x1fff;
    var ah0 = a0 >>> 13;
    var a1 = a[1] | 0;
    var al1 = a1 & 0x1fff;
    var ah1 = a1 >>> 13;
    var a2 = a[2] | 0;
    var al2 = a2 & 0x1fff;
    var ah2 = a2 >>> 13;
    var a3 = a[3] | 0;
    var al3 = a3 & 0x1fff;
    var ah3 = a3 >>> 13;
    var a4 = a[4] | 0;
    var al4 = a4 & 0x1fff;
    var ah4 = a4 >>> 13;
    var a5 = a[5] | 0;
    var al5 = a5 & 0x1fff;
    var ah5 = a5 >>> 13;
    var a6 = a[6] | 0;
    var al6 = a6 & 0x1fff;
    var ah6 = a6 >>> 13;
    var a7 = a[7] | 0;
    var al7 = a7 & 0x1fff;
    var ah7 = a7 >>> 13;
    var a8 = a[8] | 0;
    var al8 = a8 & 0x1fff;
    var ah8 = a8 >>> 13;
    var a9 = a[9] | 0;
    var al9 = a9 & 0x1fff;
    var ah9 = a9 >>> 13;
    var b0 = b[0] | 0;
    var bl0 = b0 & 0x1fff;
    var bh0 = b0 >>> 13;
    var b1 = b[1] | 0;
    var bl1 = b1 & 0x1fff;
    var bh1 = b1 >>> 13;
    var b2 = b[2] | 0;
    var bl2 = b2 & 0x1fff;
    var bh2 = b2 >>> 13;
    var b3 = b[3] | 0;
    var bl3 = b3 & 0x1fff;
    var bh3 = b3 >>> 13;
    var b4 = b[4] | 0;
    var bl4 = b4 & 0x1fff;
    var bh4 = b4 >>> 13;
    var b5 = b[5] | 0;
    var bl5 = b5 & 0x1fff;
    var bh5 = b5 >>> 13;
    var b6 = b[6] | 0;
    var bl6 = b6 & 0x1fff;
    var bh6 = b6 >>> 13;
    var b7 = b[7] | 0;
    var bl7 = b7 & 0x1fff;
    var bh7 = b7 >>> 13;
    var b8 = b[8] | 0;
    var bl8 = b8 & 0x1fff;
    var bh8 = b8 >>> 13;
    var b9 = b[9] | 0;
    var bl9 = b9 & 0x1fff;
    var bh9 = b9 >>> 13;

    out.negative = self.negative ^ num.negative;
    out.length = 19;
    /* k = 0 */
    lo = Math.imul(al0, bl0);
    mid = Math.imul(al0, bh0);
    mid = (mid + Math.imul(ah0, bl0)) | 0;
    hi = Math.imul(ah0, bh0);
    var w0 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w0 >>> 26)) | 0;
    w0 &= 0x3ffffff;
    /* k = 1 */
    lo = Math.imul(al1, bl0);
    mid = Math.imul(al1, bh0);
    mid = (mid + Math.imul(ah1, bl0)) | 0;
    hi = Math.imul(ah1, bh0);
    lo = (lo + Math.imul(al0, bl1)) | 0;
    mid = (mid + Math.imul(al0, bh1)) | 0;
    mid = (mid + Math.imul(ah0, bl1)) | 0;
    hi = (hi + Math.imul(ah0, bh1)) | 0;
    var w1 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w1 >>> 26)) | 0;
    w1 &= 0x3ffffff;
    /* k = 2 */
    lo = Math.imul(al2, bl0);
    mid = Math.imul(al2, bh0);
    mid = (mid + Math.imul(ah2, bl0)) | 0;
    hi = Math.imul(ah2, bh0);
    lo = (lo + Math.imul(al1, bl1)) | 0;
    mid = (mid + Math.imul(al1, bh1)) | 0;
    mid = (mid + Math.imul(ah1, bl1)) | 0;
    hi = (hi + Math.imul(ah1, bh1)) | 0;
    lo = (lo + Math.imul(al0, bl2)) | 0;
    mid = (mid + Math.imul(al0, bh2)) | 0;
    mid = (mid + Math.imul(ah0, bl2)) | 0;
    hi = (hi + Math.imul(ah0, bh2)) | 0;
    var w2 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w2 >>> 26)) | 0;
    w2 &= 0x3ffffff;
    /* k = 3 */
    lo = Math.imul(al3, bl0);
    mid = Math.imul(al3, bh0);
    mid = (mid + Math.imul(ah3, bl0)) | 0;
    hi = Math.imul(ah3, bh0);
    lo = (lo + Math.imul(al2, bl1)) | 0;
    mid = (mid + Math.imul(al2, bh1)) | 0;
    mid = (mid + Math.imul(ah2, bl1)) | 0;
    hi = (hi + Math.imul(ah2, bh1)) | 0;
    lo = (lo + Math.imul(al1, bl2)) | 0;
    mid = (mid + Math.imul(al1, bh2)) | 0;
    mid = (mid + Math.imul(ah1, bl2)) | 0;
    hi = (hi + Math.imul(ah1, bh2)) | 0;
    lo = (lo + Math.imul(al0, bl3)) | 0;
    mid = (mid + Math.imul(al0, bh3)) | 0;
    mid = (mid + Math.imul(ah0, bl3)) | 0;
    hi = (hi + Math.imul(ah0, bh3)) | 0;
    var w3 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w3 >>> 26)) | 0;
    w3 &= 0x3ffffff;
    /* k = 4 */
    lo = Math.imul(al4, bl0);
    mid = Math.imul(al4, bh0);
    mid = (mid + Math.imul(ah4, bl0)) | 0;
    hi = Math.imul(ah4, bh0);
    lo = (lo + Math.imul(al3, bl1)) | 0;
    mid = (mid + Math.imul(al3, bh1)) | 0;
    mid = (mid + Math.imul(ah3, bl1)) | 0;
    hi = (hi + Math.imul(ah3, bh1)) | 0;
    lo = (lo + Math.imul(al2, bl2)) | 0;
    mid = (mid + Math.imul(al2, bh2)) | 0;
    mid = (mid + Math.imul(ah2, bl2)) | 0;
    hi = (hi + Math.imul(ah2, bh2)) | 0;
    lo = (lo + Math.imul(al1, bl3)) | 0;
    mid = (mid + Math.imul(al1, bh3)) | 0;
    mid = (mid + Math.imul(ah1, bl3)) | 0;
    hi = (hi + Math.imul(ah1, bh3)) | 0;
    lo = (lo + Math.imul(al0, bl4)) | 0;
    mid = (mid + Math.imul(al0, bh4)) | 0;
    mid = (mid + Math.imul(ah0, bl4)) | 0;
    hi = (hi + Math.imul(ah0, bh4)) | 0;
    var w4 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w4 >>> 26)) | 0;
    w4 &= 0x3ffffff;
    /* k = 5 */
    lo = Math.imul(al5, bl0);
    mid = Math.imul(al5, bh0);
    mid = (mid + Math.imul(ah5, bl0)) | 0;
    hi = Math.imul(ah5, bh0);
    lo = (lo + Math.imul(al4, bl1)) | 0;
    mid = (mid + Math.imul(al4, bh1)) | 0;
    mid = (mid + Math.imul(ah4, bl1)) | 0;
    hi = (hi + Math.imul(ah4, bh1)) | 0;
    lo = (lo + Math.imul(al3, bl2)) | 0;
    mid = (mid + Math.imul(al3, bh2)) | 0;
    mid = (mid + Math.imul(ah3, bl2)) | 0;
    hi = (hi + Math.imul(ah3, bh2)) | 0;
    lo = (lo + Math.imul(al2, bl3)) | 0;
    mid = (mid + Math.imul(al2, bh3)) | 0;
    mid = (mid + Math.imul(ah2, bl3)) | 0;
    hi = (hi + Math.imul(ah2, bh3)) | 0;
    lo = (lo + Math.imul(al1, bl4)) | 0;
    mid = (mid + Math.imul(al1, bh4)) | 0;
    mid = (mid + Math.imul(ah1, bl4)) | 0;
    hi = (hi + Math.imul(ah1, bh4)) | 0;
    lo = (lo + Math.imul(al0, bl5)) | 0;
    mid = (mid + Math.imul(al0, bh5)) | 0;
    mid = (mid + Math.imul(ah0, bl5)) | 0;
    hi = (hi + Math.imul(ah0, bh5)) | 0;
    var w5 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w5 >>> 26)) | 0;
    w5 &= 0x3ffffff;
    /* k = 6 */
    lo = Math.imul(al6, bl0);
    mid = Math.imul(al6, bh0);
    mid = (mid + Math.imul(ah6, bl0)) | 0;
    hi = Math.imul(ah6, bh0);
    lo = (lo + Math.imul(al5, bl1)) | 0;
    mid = (mid + Math.imul(al5, bh1)) | 0;
    mid = (mid + Math.imul(ah5, bl1)) | 0;
    hi = (hi + Math.imul(ah5, bh1)) | 0;
    lo = (lo + Math.imul(al4, bl2)) | 0;
    mid = (mid + Math.imul(al4, bh2)) | 0;
    mid = (mid + Math.imul(ah4, bl2)) | 0;
    hi = (hi + Math.imul(ah4, bh2)) | 0;
    lo = (lo + Math.imul(al3, bl3)) | 0;
    mid = (mid + Math.imul(al3, bh3)) | 0;
    mid = (mid + Math.imul(ah3, bl3)) | 0;
    hi = (hi + Math.imul(ah3, bh3)) | 0;
    lo = (lo + Math.imul(al2, bl4)) | 0;
    mid = (mid + Math.imul(al2, bh4)) | 0;
    mid = (mid + Math.imul(ah2, bl4)) | 0;
    hi = (hi + Math.imul(ah2, bh4)) | 0;
    lo = (lo + Math.imul(al1, bl5)) | 0;
    mid = (mid + Math.imul(al1, bh5)) | 0;
    mid = (mid + Math.imul(ah1, bl5)) | 0;
    hi = (hi + Math.imul(ah1, bh5)) | 0;
    lo = (lo + Math.imul(al0, bl6)) | 0;
    mid = (mid + Math.imul(al0, bh6)) | 0;
    mid = (mid + Math.imul(ah0, bl6)) | 0;
    hi = (hi + Math.imul(ah0, bh6)) | 0;
    var w6 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w6 >>> 26)) | 0;
    w6 &= 0x3ffffff;
    /* k = 7 */
    lo = Math.imul(al7, bl0);
    mid = Math.imul(al7, bh0);
    mid = (mid + Math.imul(ah7, bl0)) | 0;
    hi = Math.imul(ah7, bh0);
    lo = (lo + Math.imul(al6, bl1)) | 0;
    mid = (mid + Math.imul(al6, bh1)) | 0;
    mid = (mid + Math.imul(ah6, bl1)) | 0;
    hi = (hi + Math.imul(ah6, bh1)) | 0;
    lo = (lo + Math.imul(al5, bl2)) | 0;
    mid = (mid + Math.imul(al5, bh2)) | 0;
    mid = (mid + Math.imul(ah5, bl2)) | 0;
    hi = (hi + Math.imul(ah5, bh2)) | 0;
    lo = (lo + Math.imul(al4, bl3)) | 0;
    mid = (mid + Math.imul(al4, bh3)) | 0;
    mid = (mid + Math.imul(ah4, bl3)) | 0;
    hi = (hi + Math.imul(ah4, bh3)) | 0;
    lo = (lo + Math.imul(al3, bl4)) | 0;
    mid = (mid + Math.imul(al3, bh4)) | 0;
    mid = (mid + Math.imul(ah3, bl4)) | 0;
    hi = (hi + Math.imul(ah3, bh4)) | 0;
    lo = (lo + Math.imul(al2, bl5)) | 0;
    mid = (mid + Math.imul(al2, bh5)) | 0;
    mid = (mid + Math.imul(ah2, bl5)) | 0;
    hi = (hi + Math.imul(ah2, bh5)) | 0;
    lo = (lo + Math.imul(al1, bl6)) | 0;
    mid = (mid + Math.imul(al1, bh6)) | 0;
    mid = (mid + Math.imul(ah1, bl6)) | 0;
    hi = (hi + Math.imul(ah1, bh6)) | 0;
    lo = (lo + Math.imul(al0, bl7)) | 0;
    mid = (mid + Math.imul(al0, bh7)) | 0;
    mid = (mid + Math.imul(ah0, bl7)) | 0;
    hi = (hi + Math.imul(ah0, bh7)) | 0;
    var w7 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w7 >>> 26)) | 0;
    w7 &= 0x3ffffff;
    /* k = 8 */
    lo = Math.imul(al8, bl0);
    mid = Math.imul(al8, bh0);
    mid = (mid + Math.imul(ah8, bl0)) | 0;
    hi = Math.imul(ah8, bh0);
    lo = (lo + Math.imul(al7, bl1)) | 0;
    mid = (mid + Math.imul(al7, bh1)) | 0;
    mid = (mid + Math.imul(ah7, bl1)) | 0;
    hi = (hi + Math.imul(ah7, bh1)) | 0;
    lo = (lo + Math.imul(al6, bl2)) | 0;
    mid = (mid + Math.imul(al6, bh2)) | 0;
    mid = (mid + Math.imul(ah6, bl2)) | 0;
    hi = (hi + Math.imul(ah6, bh2)) | 0;
    lo = (lo + Math.imul(al5, bl3)) | 0;
    mid = (mid + Math.imul(al5, bh3)) | 0;
    mid = (mid + Math.imul(ah5, bl3)) | 0;
    hi = (hi + Math.imul(ah5, bh3)) | 0;
    lo = (lo + Math.imul(al4, bl4)) | 0;
    mid = (mid + Math.imul(al4, bh4)) | 0;
    mid = (mid + Math.imul(ah4, bl4)) | 0;
    hi = (hi + Math.imul(ah4, bh4)) | 0;
    lo = (lo + Math.imul(al3, bl5)) | 0;
    mid = (mid + Math.imul(al3, bh5)) | 0;
    mid = (mid + Math.imul(ah3, bl5)) | 0;
    hi = (hi + Math.imul(ah3, bh5)) | 0;
    lo = (lo + Math.imul(al2, bl6)) | 0;
    mid = (mid + Math.imul(al2, bh6)) | 0;
    mid = (mid + Math.imul(ah2, bl6)) | 0;
    hi = (hi + Math.imul(ah2, bh6)) | 0;
    lo = (lo + Math.imul(al1, bl7)) | 0;
    mid = (mid + Math.imul(al1, bh7)) | 0;
    mid = (mid + Math.imul(ah1, bl7)) | 0;
    hi = (hi + Math.imul(ah1, bh7)) | 0;
    lo = (lo + Math.imul(al0, bl8)) | 0;
    mid = (mid + Math.imul(al0, bh8)) | 0;
    mid = (mid + Math.imul(ah0, bl8)) | 0;
    hi = (hi + Math.imul(ah0, bh8)) | 0;
    var w8 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w8 >>> 26)) | 0;
    w8 &= 0x3ffffff;
    /* k = 9 */
    lo = Math.imul(al9, bl0);
    mid = Math.imul(al9, bh0);
    mid = (mid + Math.imul(ah9, bl0)) | 0;
    hi = Math.imul(ah9, bh0);
    lo = (lo + Math.imul(al8, bl1)) | 0;
    mid = (mid + Math.imul(al8, bh1)) | 0;
    mid = (mid + Math.imul(ah8, bl1)) | 0;
    hi = (hi + Math.imul(ah8, bh1)) | 0;
    lo = (lo + Math.imul(al7, bl2)) | 0;
    mid = (mid + Math.imul(al7, bh2)) | 0;
    mid = (mid + Math.imul(ah7, bl2)) | 0;
    hi = (hi + Math.imul(ah7, bh2)) | 0;
    lo = (lo + Math.imul(al6, bl3)) | 0;
    mid = (mid + Math.imul(al6, bh3)) | 0;
    mid = (mid + Math.imul(ah6, bl3)) | 0;
    hi = (hi + Math.imul(ah6, bh3)) | 0;
    lo = (lo + Math.imul(al5, bl4)) | 0;
    mid = (mid + Math.imul(al5, bh4)) | 0;
    mid = (mid + Math.imul(ah5, bl4)) | 0;
    hi = (hi + Math.imul(ah5, bh4)) | 0;
    lo = (lo + Math.imul(al4, bl5)) | 0;
    mid = (mid + Math.imul(al4, bh5)) | 0;
    mid = (mid + Math.imul(ah4, bl5)) | 0;
    hi = (hi + Math.imul(ah4, bh5)) | 0;
    lo = (lo + Math.imul(al3, bl6)) | 0;
    mid = (mid + Math.imul(al3, bh6)) | 0;
    mid = (mid + Math.imul(ah3, bl6)) | 0;
    hi = (hi + Math.imul(ah3, bh6)) | 0;
    lo = (lo + Math.imul(al2, bl7)) | 0;
    mid = (mid + Math.imul(al2, bh7)) | 0;
    mid = (mid + Math.imul(ah2, bl7)) | 0;
    hi = (hi + Math.imul(ah2, bh7)) | 0;
    lo = (lo + Math.imul(al1, bl8)) | 0;
    mid = (mid + Math.imul(al1, bh8)) | 0;
    mid = (mid + Math.imul(ah1, bl8)) | 0;
    hi = (hi + Math.imul(ah1, bh8)) | 0;
    lo = (lo + Math.imul(al0, bl9)) | 0;
    mid = (mid + Math.imul(al0, bh9)) | 0;
    mid = (mid + Math.imul(ah0, bl9)) | 0;
    hi = (hi + Math.imul(ah0, bh9)) | 0;
    var w9 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w9 >>> 26)) | 0;
    w9 &= 0x3ffffff;
    /* k = 10 */
    lo = Math.imul(al9, bl1);
    mid = Math.imul(al9, bh1);
    mid = (mid + Math.imul(ah9, bl1)) | 0;
    hi = Math.imul(ah9, bh1);
    lo = (lo + Math.imul(al8, bl2)) | 0;
    mid = (mid + Math.imul(al8, bh2)) | 0;
    mid = (mid + Math.imul(ah8, bl2)) | 0;
    hi = (hi + Math.imul(ah8, bh2)) | 0;
    lo = (lo + Math.imul(al7, bl3)) | 0;
    mid = (mid + Math.imul(al7, bh3)) | 0;
    mid = (mid + Math.imul(ah7, bl3)) | 0;
    hi = (hi + Math.imul(ah7, bh3)) | 0;
    lo = (lo + Math.imul(al6, bl4)) | 0;
    mid = (mid + Math.imul(al6, bh4)) | 0;
    mid = (mid + Math.imul(ah6, bl4)) | 0;
    hi = (hi + Math.imul(ah6, bh4)) | 0;
    lo = (lo + Math.imul(al5, bl5)) | 0;
    mid = (mid + Math.imul(al5, bh5)) | 0;
    mid = (mid + Math.imul(ah5, bl5)) | 0;
    hi = (hi + Math.imul(ah5, bh5)) | 0;
    lo = (lo + Math.imul(al4, bl6)) | 0;
    mid = (mid + Math.imul(al4, bh6)) | 0;
    mid = (mid + Math.imul(ah4, bl6)) | 0;
    hi = (hi + Math.imul(ah4, bh6)) | 0;
    lo = (lo + Math.imul(al3, bl7)) | 0;
    mid = (mid + Math.imul(al3, bh7)) | 0;
    mid = (mid + Math.imul(ah3, bl7)) | 0;
    hi = (hi + Math.imul(ah3, bh7)) | 0;
    lo = (lo + Math.imul(al2, bl8)) | 0;
    mid = (mid + Math.imul(al2, bh8)) | 0;
    mid = (mid + Math.imul(ah2, bl8)) | 0;
    hi = (hi + Math.imul(ah2, bh8)) | 0;
    lo = (lo + Math.imul(al1, bl9)) | 0;
    mid = (mid + Math.imul(al1, bh9)) | 0;
    mid = (mid + Math.imul(ah1, bl9)) | 0;
    hi = (hi + Math.imul(ah1, bh9)) | 0;
    var w10 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w10 >>> 26)) | 0;
    w10 &= 0x3ffffff;
    /* k = 11 */
    lo = Math.imul(al9, bl2);
    mid = Math.imul(al9, bh2);
    mid = (mid + Math.imul(ah9, bl2)) | 0;
    hi = Math.imul(ah9, bh2);
    lo = (lo + Math.imul(al8, bl3)) | 0;
    mid = (mid + Math.imul(al8, bh3)) | 0;
    mid = (mid + Math.imul(ah8, bl3)) | 0;
    hi = (hi + Math.imul(ah8, bh3)) | 0;
    lo = (lo + Math.imul(al7, bl4)) | 0;
    mid = (mid + Math.imul(al7, bh4)) | 0;
    mid = (mid + Math.imul(ah7, bl4)) | 0;
    hi = (hi + Math.imul(ah7, bh4)) | 0;
    lo = (lo + Math.imul(al6, bl5)) | 0;
    mid = (mid + Math.imul(al6, bh5)) | 0;
    mid = (mid + Math.imul(ah6, bl5)) | 0;
    hi = (hi + Math.imul(ah6, bh5)) | 0;
    lo = (lo + Math.imul(al5, bl6)) | 0;
    mid = (mid + Math.imul(al5, bh6)) | 0;
    mid = (mid + Math.imul(ah5, bl6)) | 0;
    hi = (hi + Math.imul(ah5, bh6)) | 0;
    lo = (lo + Math.imul(al4, bl7)) | 0;
    mid = (mid + Math.imul(al4, bh7)) | 0;
    mid = (mid + Math.imul(ah4, bl7)) | 0;
    hi = (hi + Math.imul(ah4, bh7)) | 0;
    lo = (lo + Math.imul(al3, bl8)) | 0;
    mid = (mid + Math.imul(al3, bh8)) | 0;
    mid = (mid + Math.imul(ah3, bl8)) | 0;
    hi = (hi + Math.imul(ah3, bh8)) | 0;
    lo = (lo + Math.imul(al2, bl9)) | 0;
    mid = (mid + Math.imul(al2, bh9)) | 0;
    mid = (mid + Math.imul(ah2, bl9)) | 0;
    hi = (hi + Math.imul(ah2, bh9)) | 0;
    var w11 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w11 >>> 26)) | 0;
    w11 &= 0x3ffffff;
    /* k = 12 */
    lo = Math.imul(al9, bl3);
    mid = Math.imul(al9, bh3);
    mid = (mid + Math.imul(ah9, bl3)) | 0;
    hi = Math.imul(ah9, bh3);
    lo = (lo + Math.imul(al8, bl4)) | 0;
    mid = (mid + Math.imul(al8, bh4)) | 0;
    mid = (mid + Math.imul(ah8, bl4)) | 0;
    hi = (hi + Math.imul(ah8, bh4)) | 0;
    lo = (lo + Math.imul(al7, bl5)) | 0;
    mid = (mid + Math.imul(al7, bh5)) | 0;
    mid = (mid + Math.imul(ah7, bl5)) | 0;
    hi = (hi + Math.imul(ah7, bh5)) | 0;
    lo = (lo + Math.imul(al6, bl6)) | 0;
    mid = (mid + Math.imul(al6, bh6)) | 0;
    mid = (mid + Math.imul(ah6, bl6)) | 0;
    hi = (hi + Math.imul(ah6, bh6)) | 0;
    lo = (lo + Math.imul(al5, bl7)) | 0;
    mid = (mid + Math.imul(al5, bh7)) | 0;
    mid = (mid + Math.imul(ah5, bl7)) | 0;
    hi = (hi + Math.imul(ah5, bh7)) | 0;
    lo = (lo + Math.imul(al4, bl8)) | 0;
    mid = (mid + Math.imul(al4, bh8)) | 0;
    mid = (mid + Math.imul(ah4, bl8)) | 0;
    hi = (hi + Math.imul(ah4, bh8)) | 0;
    lo = (lo + Math.imul(al3, bl9)) | 0;
    mid = (mid + Math.imul(al3, bh9)) | 0;
    mid = (mid + Math.imul(ah3, bl9)) | 0;
    hi = (hi + Math.imul(ah3, bh9)) | 0;
    var w12 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w12 >>> 26)) | 0;
    w12 &= 0x3ffffff;
    /* k = 13 */
    lo = Math.imul(al9, bl4);
    mid = Math.imul(al9, bh4);
    mid = (mid + Math.imul(ah9, bl4)) | 0;
    hi = Math.imul(ah9, bh4);
    lo = (lo + Math.imul(al8, bl5)) | 0;
    mid = (mid + Math.imul(al8, bh5)) | 0;
    mid = (mid + Math.imul(ah8, bl5)) | 0;
    hi = (hi + Math.imul(ah8, bh5)) | 0;
    lo = (lo + Math.imul(al7, bl6)) | 0;
    mid = (mid + Math.imul(al7, bh6)) | 0;
    mid = (mid + Math.imul(ah7, bl6)) | 0;
    hi = (hi + Math.imul(ah7, bh6)) | 0;
    lo = (lo + Math.imul(al6, bl7)) | 0;
    mid = (mid + Math.imul(al6, bh7)) | 0;
    mid = (mid + Math.imul(ah6, bl7)) | 0;
    hi = (hi + Math.imul(ah6, bh7)) | 0;
    lo = (lo + Math.imul(al5, bl8)) | 0;
    mid = (mid + Math.imul(al5, bh8)) | 0;
    mid = (mid + Math.imul(ah5, bl8)) | 0;
    hi = (hi + Math.imul(ah5, bh8)) | 0;
    lo = (lo + Math.imul(al4, bl9)) | 0;
    mid = (mid + Math.imul(al4, bh9)) | 0;
    mid = (mid + Math.imul(ah4, bl9)) | 0;
    hi = (hi + Math.imul(ah4, bh9)) | 0;
    var w13 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w13 >>> 26)) | 0;
    w13 &= 0x3ffffff;
    /* k = 14 */
    lo = Math.imul(al9, bl5);
    mid = Math.imul(al9, bh5);
    mid = (mid + Math.imul(ah9, bl5)) | 0;
    hi = Math.imul(ah9, bh5);
    lo = (lo + Math.imul(al8, bl6)) | 0;
    mid = (mid + Math.imul(al8, bh6)) | 0;
    mid = (mid + Math.imul(ah8, bl6)) | 0;
    hi = (hi + Math.imul(ah8, bh6)) | 0;
    lo = (lo + Math.imul(al7, bl7)) | 0;
    mid = (mid + Math.imul(al7, bh7)) | 0;
    mid = (mid + Math.imul(ah7, bl7)) | 0;
    hi = (hi + Math.imul(ah7, bh7)) | 0;
    lo = (lo + Math.imul(al6, bl8)) | 0;
    mid = (mid + Math.imul(al6, bh8)) | 0;
    mid = (mid + Math.imul(ah6, bl8)) | 0;
    hi = (hi + Math.imul(ah6, bh8)) | 0;
    lo = (lo + Math.imul(al5, bl9)) | 0;
    mid = (mid + Math.imul(al5, bh9)) | 0;
    mid = (mid + Math.imul(ah5, bl9)) | 0;
    hi = (hi + Math.imul(ah5, bh9)) | 0;
    var w14 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w14 >>> 26)) | 0;
    w14 &= 0x3ffffff;
    /* k = 15 */
    lo = Math.imul(al9, bl6);
    mid = Math.imul(al9, bh6);
    mid = (mid + Math.imul(ah9, bl6)) | 0;
    hi = Math.imul(ah9, bh6);
    lo = (lo + Math.imul(al8, bl7)) | 0;
    mid = (mid + Math.imul(al8, bh7)) | 0;
    mid = (mid + Math.imul(ah8, bl7)) | 0;
    hi = (hi + Math.imul(ah8, bh7)) | 0;
    lo = (lo + Math.imul(al7, bl8)) | 0;
    mid = (mid + Math.imul(al7, bh8)) | 0;
    mid = (mid + Math.imul(ah7, bl8)) | 0;
    hi = (hi + Math.imul(ah7, bh8)) | 0;
    lo = (lo + Math.imul(al6, bl9)) | 0;
    mid = (mid + Math.imul(al6, bh9)) | 0;
    mid = (mid + Math.imul(ah6, bl9)) | 0;
    hi = (hi + Math.imul(ah6, bh9)) | 0;
    var w15 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w15 >>> 26)) | 0;
    w15 &= 0x3ffffff;
    /* k = 16 */
    lo = Math.imul(al9, bl7);
    mid = Math.imul(al9, bh7);
    mid = (mid + Math.imul(ah9, bl7)) | 0;
    hi = Math.imul(ah9, bh7);
    lo = (lo + Math.imul(al8, bl8)) | 0;
    mid = (mid + Math.imul(al8, bh8)) | 0;
    mid = (mid + Math.imul(ah8, bl8)) | 0;
    hi = (hi + Math.imul(ah8, bh8)) | 0;
    lo = (lo + Math.imul(al7, bl9)) | 0;
    mid = (mid + Math.imul(al7, bh9)) | 0;
    mid = (mid + Math.imul(ah7, bl9)) | 0;
    hi = (hi + Math.imul(ah7, bh9)) | 0;
    var w16 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w16 >>> 26)) | 0;
    w16 &= 0x3ffffff;
    /* k = 17 */
    lo = Math.imul(al9, bl8);
    mid = Math.imul(al9, bh8);
    mid = (mid + Math.imul(ah9, bl8)) | 0;
    hi = Math.imul(ah9, bh8);
    lo = (lo + Math.imul(al8, bl9)) | 0;
    mid = (mid + Math.imul(al8, bh9)) | 0;
    mid = (mid + Math.imul(ah8, bl9)) | 0;
    hi = (hi + Math.imul(ah8, bh9)) | 0;
    var w17 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w17 >>> 26)) | 0;
    w17 &= 0x3ffffff;
    /* k = 18 */
    lo = Math.imul(al9, bl9);
    mid = Math.imul(al9, bh9);
    mid = (mid + Math.imul(ah9, bl9)) | 0;
    hi = Math.imul(ah9, bh9);
    var w18 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w18 >>> 26)) | 0;
    w18 &= 0x3ffffff;
    o[0] = w0;
    o[1] = w1;
    o[2] = w2;
    o[3] = w3;
    o[4] = w4;
    o[5] = w5;
    o[6] = w6;
    o[7] = w7;
    o[8] = w8;
    o[9] = w9;
    o[10] = w10;
    o[11] = w11;
    o[12] = w12;
    o[13] = w13;
    o[14] = w14;
    o[15] = w15;
    o[16] = w16;
    o[17] = w17;
    o[18] = w18;
    if (c !== 0) {
      o[19] = c;
      out.length++;
    }
    return out;
  };

  // Polyfill comb
  if (!Math.imul) {
    comb10MulTo = smallMulTo;
  }

  function bigMulTo (self, num, out) {
    out.negative = num.negative ^ self.negative;
    out.length = self.length + num.length;

    var carry = 0;
    var hncarry = 0;
    for (var k = 0; k < out.length - 1; k++) {
      // Sum all words with the same `i + j = k` and accumulate `ncarry`,
      // note that ncarry could be >= 0x3ffffff
      var ncarry = hncarry;
      hncarry = 0;
      var rword = carry & 0x3ffffff;
      var maxJ = Math.min(k, num.length - 1);
      for (var j = Math.max(0, k - self.length + 1); j <= maxJ; j++) {
        var i = k - j;
        var a = self.words[i] | 0;
        var b = num.words[j] | 0;
        var r = a * b;

        var lo = r & 0x3ffffff;
        ncarry = (ncarry + ((r / 0x4000000) | 0)) | 0;
        lo = (lo + rword) | 0;
        rword = lo & 0x3ffffff;
        ncarry = (ncarry + (lo >>> 26)) | 0;

        hncarry += ncarry >>> 26;
        ncarry &= 0x3ffffff;
      }
      out.words[k] = rword;
      carry = ncarry;
      ncarry = hncarry;
    }
    if (carry !== 0) {
      out.words[k] = carry;
    } else {
      out.length--;
    }

    return out.strip();
  }

  function jumboMulTo (self, num, out) {
    var fftm = new FFTM();
    return fftm.mulp(self, num, out);
  }

  BN.prototype.mulTo = function mulTo (num, out) {
    var res;
    var len = this.length + num.length;
    if (this.length === 10 && num.length === 10) {
      res = comb10MulTo(this, num, out);
    } else if (len < 63) {
      res = smallMulTo(this, num, out);
    } else if (len < 1024) {
      res = bigMulTo(this, num, out);
    } else {
      res = jumboMulTo(this, num, out);
    }

    return res;
  };

  // Cooley-Tukey algorithm for FFT
  // slightly revisited to rely on looping instead of recursion

  function FFTM (x, y) {
    this.x = x;
    this.y = y;
  }

  FFTM.prototype.makeRBT = function makeRBT (N) {
    var t = new Array(N);
    var l = BN.prototype._countBits(N) - 1;
    for (var i = 0; i < N; i++) {
      t[i] = this.revBin(i, l, N);
    }

    return t;
  };

  // Returns binary-reversed representation of `x`
  FFTM.prototype.revBin = function revBin (x, l, N) {
    if (x === 0 || x === N - 1) return x;

    var rb = 0;
    for (var i = 0; i < l; i++) {
      rb |= (x & 1) << (l - i - 1);
      x >>= 1;
    }

    return rb;
  };

  // Performs "tweedling" phase, therefore 'emulating'
  // behaviour of the recursive algorithm
  FFTM.prototype.permute = function permute (rbt, rws, iws, rtws, itws, N) {
    for (var i = 0; i < N; i++) {
      rtws[i] = rws[rbt[i]];
      itws[i] = iws[rbt[i]];
    }
  };

  FFTM.prototype.transform = function transform (rws, iws, rtws, itws, N, rbt) {
    this.permute(rbt, rws, iws, rtws, itws, N);

    for (var s = 1; s < N; s <<= 1) {
      var l = s << 1;

      var rtwdf = Math.cos(2 * Math.PI / l);
      var itwdf = Math.sin(2 * Math.PI / l);

      for (var p = 0; p < N; p += l) {
        var rtwdf_ = rtwdf;
        var itwdf_ = itwdf;

        for (var j = 0; j < s; j++) {
          var re = rtws[p + j];
          var ie = itws[p + j];

          var ro = rtws[p + j + s];
          var io = itws[p + j + s];

          var rx = rtwdf_ * ro - itwdf_ * io;

          io = rtwdf_ * io + itwdf_ * ro;
          ro = rx;

          rtws[p + j] = re + ro;
          itws[p + j] = ie + io;

          rtws[p + j + s] = re - ro;
          itws[p + j + s] = ie - io;

          /* jshint maxdepth : false */
          if (j !== l) {
            rx = rtwdf * rtwdf_ - itwdf * itwdf_;

            itwdf_ = rtwdf * itwdf_ + itwdf * rtwdf_;
            rtwdf_ = rx;
          }
        }
      }
    }
  };

  FFTM.prototype.guessLen13b = function guessLen13b (n, m) {
    var N = Math.max(m, n) | 1;
    var odd = N & 1;
    var i = 0;
    for (N = N / 2 | 0; N; N = N >>> 1) {
      i++;
    }

    return 1 << i + 1 + odd;
  };

  FFTM.prototype.conjugate = function conjugate (rws, iws, N) {
    if (N <= 1) return;

    for (var i = 0; i < N / 2; i++) {
      var t = rws[i];

      rws[i] = rws[N - i - 1];
      rws[N - i - 1] = t;

      t = iws[i];

      iws[i] = -iws[N - i - 1];
      iws[N - i - 1] = -t;
    }
  };

  FFTM.prototype.normalize13b = function normalize13b (ws, N) {
    var carry = 0;
    for (var i = 0; i < N / 2; i++) {
      var w = Math.round(ws[2 * i + 1] / N) * 0x2000 +
        Math.round(ws[2 * i] / N) +
        carry;

      ws[i] = w & 0x3ffffff;

      if (w < 0x4000000) {
        carry = 0;
      } else {
        carry = w / 0x4000000 | 0;
      }
    }

    return ws;
  };

  FFTM.prototype.convert13b = function convert13b (ws, len, rws, N) {
    var carry = 0;
    for (var i = 0; i < len; i++) {
      carry = carry + (ws[i] | 0);

      rws[2 * i] = carry & 0x1fff; carry = carry >>> 13;
      rws[2 * i + 1] = carry & 0x1fff; carry = carry >>> 13;
    }

    // Pad with zeroes
    for (i = 2 * len; i < N; ++i) {
      rws[i] = 0;
    }

    assert(carry === 0);
    assert((carry & ~0x1fff) === 0);
  };

  FFTM.prototype.stub = function stub (N) {
    var ph = new Array(N);
    for (var i = 0; i < N; i++) {
      ph[i] = 0;
    }

    return ph;
  };

  FFTM.prototype.mulp = function mulp (x, y, out) {
    var N = 2 * this.guessLen13b(x.length, y.length);

    var rbt = this.makeRBT(N);

    var _ = this.stub(N);

    var rws = new Array(N);
    var rwst = new Array(N);
    var iwst = new Array(N);

    var nrws = new Array(N);
    var nrwst = new Array(N);
    var niwst = new Array(N);

    var rmws = out.words;
    rmws.length = N;

    this.convert13b(x.words, x.length, rws, N);
    this.convert13b(y.words, y.length, nrws, N);

    this.transform(rws, _, rwst, iwst, N, rbt);
    this.transform(nrws, _, nrwst, niwst, N, rbt);

    for (var i = 0; i < N; i++) {
      var rx = rwst[i] * nrwst[i] - iwst[i] * niwst[i];
      iwst[i] = rwst[i] * niwst[i] + iwst[i] * nrwst[i];
      rwst[i] = rx;
    }

    this.conjugate(rwst, iwst, N);
    this.transform(rwst, iwst, rmws, _, N, rbt);
    this.conjugate(rmws, _, N);
    this.normalize13b(rmws, N);

    out.negative = x.negative ^ y.negative;
    out.length = x.length + y.length;
    return out.strip();
  };

  // Multiply `this` by `num`
  BN.prototype.mul = function mul (num) {
    var out = new BN(null);
    out.words = new Array(this.length + num.length);
    return this.mulTo(num, out);
  };

  // Multiply employing FFT
  BN.prototype.mulf = function mulf (num) {
    var out = new BN(null);
    out.words = new Array(this.length + num.length);
    return jumboMulTo(this, num, out);
  };

  // In-place Multiplication
  BN.prototype.imul = function imul (num) {
    return this.clone().mulTo(num, this);
  };

  BN.prototype.imuln = function imuln (num) {
    assert(typeof num === 'number');
    assert(num < 0x4000000);

    // Carry
    var carry = 0;
    for (var i = 0; i < this.length; i++) {
      var w = (this.words[i] | 0) * num;
      var lo = (w & 0x3ffffff) + (carry & 0x3ffffff);
      carry >>= 26;
      carry += (w / 0x4000000) | 0;
      // NOTE: lo is 27bit maximum
      carry += lo >>> 26;
      this.words[i] = lo & 0x3ffffff;
    }

    if (carry !== 0) {
      this.words[i] = carry;
      this.length++;
    }

    return this;
  };

  BN.prototype.muln = function muln (num) {
    return this.clone().imuln(num);
  };

  // `this` * `this`
  BN.prototype.sqr = function sqr () {
    return this.mul(this);
  };

  // `this` * `this` in-place
  BN.prototype.isqr = function isqr () {
    return this.imul(this.clone());
  };

  // Math.pow(`this`, `num`)
  BN.prototype.pow = function pow (num) {
    var w = toBitArray(num);
    if (w.length === 0) return new BN(1);

    // Skip leading zeroes
    var res = this;
    for (var i = 0; i < w.length; i++, res = res.sqr()) {
      if (w[i] !== 0) break;
    }

    if (++i < w.length) {
      for (var q = res.sqr(); i < w.length; i++, q = q.sqr()) {
        if (w[i] === 0) continue;

        res = res.mul(q);
      }
    }

    return res;
  };

  // Shift-left in-place
  BN.prototype.iushln = function iushln (bits) {
    assert(typeof bits === 'number' && bits >= 0);
    var r = bits % 26;
    var s = (bits - r) / 26;
    var carryMask = (0x3ffffff >>> (26 - r)) << (26 - r);
    var i;

    if (r !== 0) {
      var carry = 0;

      for (i = 0; i < this.length; i++) {
        var newCarry = this.words[i] & carryMask;
        var c = ((this.words[i] | 0) - newCarry) << r;
        this.words[i] = c | carry;
        carry = newCarry >>> (26 - r);
      }

      if (carry) {
        this.words[i] = carry;
        this.length++;
      }
    }

    if (s !== 0) {
      for (i = this.length - 1; i >= 0; i--) {
        this.words[i + s] = this.words[i];
      }

      for (i = 0; i < s; i++) {
        this.words[i] = 0;
      }

      this.length += s;
    }

    return this.strip();
  };

  BN.prototype.ishln = function ishln (bits) {
    // TODO(indutny): implement me
    assert(this.negative === 0);
    return this.iushln(bits);
  };

  // Shift-right in-place
  // NOTE: `hint` is a lowest bit before trailing zeroes
  // NOTE: if `extended` is present - it will be filled with destroyed bits
  BN.prototype.iushrn = function iushrn (bits, hint, extended) {
    assert(typeof bits === 'number' && bits >= 0);
    var h;
    if (hint) {
      h = (hint - (hint % 26)) / 26;
    } else {
      h = 0;
    }

    var r = bits % 26;
    var s = Math.min((bits - r) / 26, this.length);
    var mask = 0x3ffffff ^ ((0x3ffffff >>> r) << r);
    var maskedWords = extended;

    h -= s;
    h = Math.max(0, h);

    // Extended mode, copy masked part
    if (maskedWords) {
      for (var i = 0; i < s; i++) {
        maskedWords.words[i] = this.words[i];
      }
      maskedWords.length = s;
    }

    if (s === 0) {
      // No-op, we should not move anything at all
    } else if (this.length > s) {
      this.length -= s;
      for (i = 0; i < this.length; i++) {
        this.words[i] = this.words[i + s];
      }
    } else {
      this.words[0] = 0;
      this.length = 1;
    }

    var carry = 0;
    for (i = this.length - 1; i >= 0 && (carry !== 0 || i >= h); i--) {
      var word = this.words[i] | 0;
      this.words[i] = (carry << (26 - r)) | (word >>> r);
      carry = word & mask;
    }

    // Push carried bits as a mask
    if (maskedWords && carry !== 0) {
      maskedWords.words[maskedWords.length++] = carry;
    }

    if (this.length === 0) {
      this.words[0] = 0;
      this.length = 1;
    }

    return this.strip();
  };

  BN.prototype.ishrn = function ishrn (bits, hint, extended) {
    // TODO(indutny): implement me
    assert(this.negative === 0);
    return this.iushrn(bits, hint, extended);
  };

  // Shift-left
  BN.prototype.shln = function shln (bits) {
    return this.clone().ishln(bits);
  };

  BN.prototype.ushln = function ushln (bits) {
    return this.clone().iushln(bits);
  };

  // Shift-right
  BN.prototype.shrn = function shrn (bits) {
    return this.clone().ishrn(bits);
  };

  BN.prototype.ushrn = function ushrn (bits) {
    return this.clone().iushrn(bits);
  };

  // Test if n bit is set
  BN.prototype.testn = function testn (bit) {
    assert(typeof bit === 'number' && bit >= 0);
    var r = bit % 26;
    var s = (bit - r) / 26;
    var q = 1 << r;

    // Fast case: bit is much higher than all existing words
    if (this.length <= s) return false;

    // Check bit and return
    var w = this.words[s];

    return !!(w & q);
  };

  // Return only lowers bits of number (in-place)
  BN.prototype.imaskn = function imaskn (bits) {
    assert(typeof bits === 'number' && bits >= 0);
    var r = bits % 26;
    var s = (bits - r) / 26;

    assert(this.negative === 0, 'imaskn works only with positive numbers');

    if (this.length <= s) {
      return this;
    }

    if (r !== 0) {
      s++;
    }
    this.length = Math.min(s, this.length);

    if (r !== 0) {
      var mask = 0x3ffffff ^ ((0x3ffffff >>> r) << r);
      this.words[this.length - 1] &= mask;
    }

    return this.strip();
  };

  // Return only lowers bits of number
  BN.prototype.maskn = function maskn (bits) {
    return this.clone().imaskn(bits);
  };

  // Add plain number `num` to `this`
  BN.prototype.iaddn = function iaddn (num) {
    assert(typeof num === 'number');
    assert(num < 0x4000000);
    if (num < 0) return this.isubn(-num);

    // Possible sign change
    if (this.negative !== 0) {
      if (this.length === 1 && (this.words[0] | 0) < num) {
        this.words[0] = num - (this.words[0] | 0);
        this.negative = 0;
        return this;
      }

      this.negative = 0;
      this.isubn(num);
      this.negative = 1;
      return this;
    }

    // Add without checks
    return this._iaddn(num);
  };

  BN.prototype._iaddn = function _iaddn (num) {
    this.words[0] += num;

    // Carry
    for (var i = 0; i < this.length && this.words[i] >= 0x4000000; i++) {
      this.words[i] -= 0x4000000;
      if (i === this.length - 1) {
        this.words[i + 1] = 1;
      } else {
        this.words[i + 1]++;
      }
    }
    this.length = Math.max(this.length, i + 1);

    return this;
  };

  // Subtract plain number `num` from `this`
  BN.prototype.isubn = function isubn (num) {
    assert(typeof num === 'number');
    assert(num < 0x4000000);
    if (num < 0) return this.iaddn(-num);

    if (this.negative !== 0) {
      this.negative = 0;
      this.iaddn(num);
      this.negative = 1;
      return this;
    }

    this.words[0] -= num;

    if (this.length === 1 && this.words[0] < 0) {
      this.words[0] = -this.words[0];
      this.negative = 1;
    } else {
      // Carry
      for (var i = 0; i < this.length && this.words[i] < 0; i++) {
        this.words[i] += 0x4000000;
        this.words[i + 1] -= 1;
      }
    }

    return this.strip();
  };

  BN.prototype.addn = function addn (num) {
    return this.clone().iaddn(num);
  };

  BN.prototype.subn = function subn (num) {
    return this.clone().isubn(num);
  };

  BN.prototype.iabs = function iabs () {
    this.negative = 0;

    return this;
  };

  BN.prototype.abs = function abs () {
    return this.clone().iabs();
  };

  BN.prototype._ishlnsubmul = function _ishlnsubmul (num, mul, shift) {
    var len = num.length + shift;
    var i;

    this._expand(len);

    var w;
    var carry = 0;
    for (i = 0; i < num.length; i++) {
      w = (this.words[i + shift] | 0) + carry;
      var right = (num.words[i] | 0) * mul;
      w -= right & 0x3ffffff;
      carry = (w >> 26) - ((right / 0x4000000) | 0);
      this.words[i + shift] = w & 0x3ffffff;
    }
    for (; i < this.length - shift; i++) {
      w = (this.words[i + shift] | 0) + carry;
      carry = w >> 26;
      this.words[i + shift] = w & 0x3ffffff;
    }

    if (carry === 0) return this.strip();

    // Subtraction overflow
    assert(carry === -1);
    carry = 0;
    for (i = 0; i < this.length; i++) {
      w = -(this.words[i] | 0) + carry;
      carry = w >> 26;
      this.words[i] = w & 0x3ffffff;
    }
    this.negative = 1;

    return this.strip();
  };

  BN.prototype._wordDiv = function _wordDiv (num, mode) {
    var shift = this.length - num.length;

    var a = this.clone();
    var b = num;

    // Normalize
    var bhi = b.words[b.length - 1] | 0;
    var bhiBits = this._countBits(bhi);
    shift = 26 - bhiBits;
    if (shift !== 0) {
      b = b.ushln(shift);
      a.iushln(shift);
      bhi = b.words[b.length - 1] | 0;
    }

    // Initialize quotient
    var m = a.length - b.length;
    var q;

    if (mode !== 'mod') {
      q = new BN(null);
      q.length = m + 1;
      q.words = new Array(q.length);
      for (var i = 0; i < q.length; i++) {
        q.words[i] = 0;
      }
    }

    var diff = a.clone()._ishlnsubmul(b, 1, m);
    if (diff.negative === 0) {
      a = diff;
      if (q) {
        q.words[m] = 1;
      }
    }

    for (var j = m - 1; j >= 0; j--) {
      var qj = (a.words[b.length + j] | 0) * 0x4000000 +
        (a.words[b.length + j - 1] | 0);

      // NOTE: (qj / bhi) is (0x3ffffff * 0x4000000 + 0x3ffffff) / 0x2000000 max
      // (0x7ffffff)
      qj = Math.min((qj / bhi) | 0, 0x3ffffff);

      a._ishlnsubmul(b, qj, j);
      while (a.negative !== 0) {
        qj--;
        a.negative = 0;
        a._ishlnsubmul(b, 1, j);
        if (!a.isZero()) {
          a.negative ^= 1;
        }
      }
      if (q) {
        q.words[j] = qj;
      }
    }
    if (q) {
      q.strip();
    }
    a.strip();

    // Denormalize
    if (mode !== 'div' && shift !== 0) {
      a.iushrn(shift);
    }

    return {
      div: q || null,
      mod: a
    };
  };

  // NOTE: 1) `mode` can be set to `mod` to request mod only,
  //       to `div` to request div only, or be absent to
  //       request both div & mod
  //       2) `positive` is true if unsigned mod is requested
  BN.prototype.divmod = function divmod (num, mode, positive) {
    assert(!num.isZero());

    if (this.isZero()) {
      return {
        div: new BN(0),
        mod: new BN(0)
      };
    }

    var div, mod, res;
    if (this.negative !== 0 && num.negative === 0) {
      res = this.neg().divmod(num, mode);

      if (mode !== 'mod') {
        div = res.div.neg();
      }

      if (mode !== 'div') {
        mod = res.mod.neg();
        if (positive && mod.negative !== 0) {
          mod.iadd(num);
        }
      }

      return {
        div: div,
        mod: mod
      };
    }

    if (this.negative === 0 && num.negative !== 0) {
      res = this.divmod(num.neg(), mode);

      if (mode !== 'mod') {
        div = res.div.neg();
      }

      return {
        div: div,
        mod: res.mod
      };
    }

    if ((this.negative & num.negative) !== 0) {
      res = this.neg().divmod(num.neg(), mode);

      if (mode !== 'div') {
        mod = res.mod.neg();
        if (positive && mod.negative !== 0) {
          mod.isub(num);
        }
      }

      return {
        div: res.div,
        mod: mod
      };
    }

    // Both numbers are positive at this point

    // Strip both numbers to approximate shift value
    if (num.length > this.length || this.cmp(num) < 0) {
      return {
        div: new BN(0),
        mod: this
      };
    }

    // Very short reduction
    if (num.length === 1) {
      if (mode === 'div') {
        return {
          div: this.divn(num.words[0]),
          mod: null
        };
      }

      if (mode === 'mod') {
        return {
          div: null,
          mod: new BN(this.modn(num.words[0]))
        };
      }

      return {
        div: this.divn(num.words[0]),
        mod: new BN(this.modn(num.words[0]))
      };
    }

    return this._wordDiv(num, mode);
  };

  // Find `this` / `num`
  BN.prototype.div = function div (num) {
    return this.divmod(num, 'div', false).div;
  };

  // Find `this` % `num`
  BN.prototype.mod = function mod (num) {
    return this.divmod(num, 'mod', false).mod;
  };

  BN.prototype.umod = function umod (num) {
    return this.divmod(num, 'mod', true).mod;
  };

  // Find Round(`this` / `num`)
  BN.prototype.divRound = function divRound (num) {
    var dm = this.divmod(num);

    // Fast case - exact division
    if (dm.mod.isZero()) return dm.div;

    var mod = dm.div.negative !== 0 ? dm.mod.isub(num) : dm.mod;

    var half = num.ushrn(1);
    var r2 = num.andln(1);
    var cmp = mod.cmp(half);

    // Round down
    if (cmp < 0 || r2 === 1 && cmp === 0) return dm.div;

    // Round up
    return dm.div.negative !== 0 ? dm.div.isubn(1) : dm.div.iaddn(1);
  };

  BN.prototype.modn = function modn (num) {
    assert(num <= 0x3ffffff);
    var p = (1 << 26) % num;

    var acc = 0;
    for (var i = this.length - 1; i >= 0; i--) {
      acc = (p * acc + (this.words[i] | 0)) % num;
    }

    return acc;
  };

  // In-place division by number
  BN.prototype.idivn = function idivn (num) {
    assert(num <= 0x3ffffff);

    var carry = 0;
    for (var i = this.length - 1; i >= 0; i--) {
      var w = (this.words[i] | 0) + carry * 0x4000000;
      this.words[i] = (w / num) | 0;
      carry = w % num;
    }

    return this.strip();
  };

  BN.prototype.divn = function divn (num) {
    return this.clone().idivn(num);
  };

  BN.prototype.egcd = function egcd (p) {
    assert(p.negative === 0);
    assert(!p.isZero());

    var x = this;
    var y = p.clone();

    if (x.negative !== 0) {
      x = x.umod(p);
    } else {
      x = x.clone();
    }

    // A * x + B * y = x
    var A = new BN(1);
    var B = new BN(0);

    // C * x + D * y = y
    var C = new BN(0);
    var D = new BN(1);

    var g = 0;

    while (x.isEven() && y.isEven()) {
      x.iushrn(1);
      y.iushrn(1);
      ++g;
    }

    var yp = y.clone();
    var xp = x.clone();

    while (!x.isZero()) {
      for (var i = 0, im = 1; (x.words[0] & im) === 0 && i < 26; ++i, im <<= 1);
      if (i > 0) {
        x.iushrn(i);
        while (i-- > 0) {
          if (A.isOdd() || B.isOdd()) {
            A.iadd(yp);
            B.isub(xp);
          }

          A.iushrn(1);
          B.iushrn(1);
        }
      }

      for (var j = 0, jm = 1; (y.words[0] & jm) === 0 && j < 26; ++j, jm <<= 1);
      if (j > 0) {
        y.iushrn(j);
        while (j-- > 0) {
          if (C.isOdd() || D.isOdd()) {
            C.iadd(yp);
            D.isub(xp);
          }

          C.iushrn(1);
          D.iushrn(1);
        }
      }

      if (x.cmp(y) >= 0) {
        x.isub(y);
        A.isub(C);
        B.isub(D);
      } else {
        y.isub(x);
        C.isub(A);
        D.isub(B);
      }
    }

    return {
      a: C,
      b: D,
      gcd: y.iushln(g)
    };
  };

  // This is reduced incarnation of the binary EEA
  // above, designated to invert members of the
  // _prime_ fields F(p) at a maximal speed
  BN.prototype._invmp = function _invmp (p) {
    assert(p.negative === 0);
    assert(!p.isZero());

    var a = this;
    var b = p.clone();

    if (a.negative !== 0) {
      a = a.umod(p);
    } else {
      a = a.clone();
    }

    var x1 = new BN(1);
    var x2 = new BN(0);

    var delta = b.clone();

    while (a.cmpn(1) > 0 && b.cmpn(1) > 0) {
      for (var i = 0, im = 1; (a.words[0] & im) === 0 && i < 26; ++i, im <<= 1);
      if (i > 0) {
        a.iushrn(i);
        while (i-- > 0) {
          if (x1.isOdd()) {
            x1.iadd(delta);
          }

          x1.iushrn(1);
        }
      }

      for (var j = 0, jm = 1; (b.words[0] & jm) === 0 && j < 26; ++j, jm <<= 1);
      if (j > 0) {
        b.iushrn(j);
        while (j-- > 0) {
          if (x2.isOdd()) {
            x2.iadd(delta);
          }

          x2.iushrn(1);
        }
      }

      if (a.cmp(b) >= 0) {
        a.isub(b);
        x1.isub(x2);
      } else {
        b.isub(a);
        x2.isub(x1);
      }
    }

    var res;
    if (a.cmpn(1) === 0) {
      res = x1;
    } else {
      res = x2;
    }

    if (res.cmpn(0) < 0) {
      res.iadd(p);
    }

    return res;
  };

  BN.prototype.gcd = function gcd (num) {
    if (this.isZero()) return num.abs();
    if (num.isZero()) return this.abs();

    var a = this.clone();
    var b = num.clone();
    a.negative = 0;
    b.negative = 0;

    // Remove common factor of two
    for (var shift = 0; a.isEven() && b.isEven(); shift++) {
      a.iushrn(1);
      b.iushrn(1);
    }

    do {
      while (a.isEven()) {
        a.iushrn(1);
      }
      while (b.isEven()) {
        b.iushrn(1);
      }

      var r = a.cmp(b);
      if (r < 0) {
        // Swap `a` and `b` to make `a` always bigger than `b`
        var t = a;
        a = b;
        b = t;
      } else if (r === 0 || b.cmpn(1) === 0) {
        break;
      }

      a.isub(b);
    } while (true);

    return b.iushln(shift);
  };

  // Invert number in the field F(num)
  BN.prototype.invm = function invm (num) {
    return this.egcd(num).a.umod(num);
  };

  BN.prototype.isEven = function isEven () {
    return (this.words[0] & 1) === 0;
  };

  BN.prototype.isOdd = function isOdd () {
    return (this.words[0] & 1) === 1;
  };

  // And first word and num
  BN.prototype.andln = function andln (num) {
    return this.words[0] & num;
  };

  // Increment at the bit position in-line
  BN.prototype.bincn = function bincn (bit) {
    assert(typeof bit === 'number');
    var r = bit % 26;
    var s = (bit - r) / 26;
    var q = 1 << r;

    // Fast case: bit is much higher than all existing words
    if (this.length <= s) {
      this._expand(s + 1);
      this.words[s] |= q;
      return this;
    }

    // Add bit and propagate, if needed
    var carry = q;
    for (var i = s; carry !== 0 && i < this.length; i++) {
      var w = this.words[i] | 0;
      w += carry;
      carry = w >>> 26;
      w &= 0x3ffffff;
      this.words[i] = w;
    }
    if (carry !== 0) {
      this.words[i] = carry;
      this.length++;
    }
    return this;
  };

  BN.prototype.isZero = function isZero () {
    return this.length === 1 && this.words[0] === 0;
  };

  BN.prototype.cmpn = function cmpn (num) {
    var negative = num < 0;

    if (this.negative !== 0 && !negative) return -1;
    if (this.negative === 0 && negative) return 1;

    this.strip();

    var res;
    if (this.length > 1) {
      res = 1;
    } else {
      if (negative) {
        num = -num;
      }

      assert(num <= 0x3ffffff, 'Number is too big');

      var w = this.words[0] | 0;
      res = w === num ? 0 : w < num ? -1 : 1;
    }
    if (this.negative !== 0) return -res | 0;
    return res;
  };

  // Compare two numbers and return:
  // 1 - if `this` > `num`
  // 0 - if `this` == `num`
  // -1 - if `this` < `num`
  BN.prototype.cmp = function cmp (num) {
    if (this.negative !== 0 && num.negative === 0) return -1;
    if (this.negative === 0 && num.negative !== 0) return 1;

    var res = this.ucmp(num);
    if (this.negative !== 0) return -res | 0;
    return res;
  };

  // Unsigned comparison
  BN.prototype.ucmp = function ucmp (num) {
    // At this point both numbers have the same sign
    if (this.length > num.length) return 1;
    if (this.length < num.length) return -1;

    var res = 0;
    for (var i = this.length - 1; i >= 0; i--) {
      var a = this.words[i] | 0;
      var b = num.words[i] | 0;

      if (a === b) continue;
      if (a < b) {
        res = -1;
      } else if (a > b) {
        res = 1;
      }
      break;
    }
    return res;
  };

  BN.prototype.gtn = function gtn (num) {
    return this.cmpn(num) === 1;
  };

  BN.prototype.gt = function gt (num) {
    return this.cmp(num) === 1;
  };

  BN.prototype.gten = function gten (num) {
    return this.cmpn(num) >= 0;
  };

  BN.prototype.gte = function gte (num) {
    return this.cmp(num) >= 0;
  };

  BN.prototype.ltn = function ltn (num) {
    return this.cmpn(num) === -1;
  };

  BN.prototype.lt = function lt (num) {
    return this.cmp(num) === -1;
  };

  BN.prototype.lten = function lten (num) {
    return this.cmpn(num) <= 0;
  };

  BN.prototype.lte = function lte (num) {
    return this.cmp(num) <= 0;
  };

  BN.prototype.eqn = function eqn (num) {
    return this.cmpn(num) === 0;
  };

  BN.prototype.eq = function eq (num) {
    return this.cmp(num) === 0;
  };

  //
  // A reduce context, could be using montgomery or something better, depending
  // on the `m` itself.
  //
  BN.red = function red (num) {
    return new Red(num);
  };

  BN.prototype.toRed = function toRed (ctx) {
    assert(!this.red, 'Already a number in reduction context');
    assert(this.negative === 0, 'red works only with positives');
    return ctx.convertTo(this)._forceRed(ctx);
  };

  BN.prototype.fromRed = function fromRed () {
    assert(this.red, 'fromRed works only with numbers in reduction context');
    return this.red.convertFrom(this);
  };

  BN.prototype._forceRed = function _forceRed (ctx) {
    this.red = ctx;
    return this;
  };

  BN.prototype.forceRed = function forceRed (ctx) {
    assert(!this.red, 'Already a number in reduction context');
    return this._forceRed(ctx);
  };

  BN.prototype.redAdd = function redAdd (num) {
    assert(this.red, 'redAdd works only with red numbers');
    return this.red.add(this, num);
  };

  BN.prototype.redIAdd = function redIAdd (num) {
    assert(this.red, 'redIAdd works only with red numbers');
    return this.red.iadd(this, num);
  };

  BN.prototype.redSub = function redSub (num) {
    assert(this.red, 'redSub works only with red numbers');
    return this.red.sub(this, num);
  };

  BN.prototype.redISub = function redISub (num) {
    assert(this.red, 'redISub works only with red numbers');
    return this.red.isub(this, num);
  };

  BN.prototype.redShl = function redShl (num) {
    assert(this.red, 'redShl works only with red numbers');
    return this.red.shl(this, num);
  };

  BN.prototype.redMul = function redMul (num) {
    assert(this.red, 'redMul works only with red numbers');
    this.red._verify2(this, num);
    return this.red.mul(this, num);
  };

  BN.prototype.redIMul = function redIMul (num) {
    assert(this.red, 'redMul works only with red numbers');
    this.red._verify2(this, num);
    return this.red.imul(this, num);
  };

  BN.prototype.redSqr = function redSqr () {
    assert(this.red, 'redSqr works only with red numbers');
    this.red._verify1(this);
    return this.red.sqr(this);
  };

  BN.prototype.redISqr = function redISqr () {
    assert(this.red, 'redISqr works only with red numbers');
    this.red._verify1(this);
    return this.red.isqr(this);
  };

  // Square root over p
  BN.prototype.redSqrt = function redSqrt () {
    assert(this.red, 'redSqrt works only with red numbers');
    this.red._verify1(this);
    return this.red.sqrt(this);
  };

  BN.prototype.redInvm = function redInvm () {
    assert(this.red, 'redInvm works only with red numbers');
    this.red._verify1(this);
    return this.red.invm(this);
  };

  // Return negative clone of `this` % `red modulo`
  BN.prototype.redNeg = function redNeg () {
    assert(this.red, 'redNeg works only with red numbers');
    this.red._verify1(this);
    return this.red.neg(this);
  };

  BN.prototype.redPow = function redPow (num) {
    assert(this.red && !num.red, 'redPow(normalNum)');
    this.red._verify1(this);
    return this.red.pow(this, num);
  };

  // Prime numbers with efficient reduction
  var primes = {
    k256: null,
    p224: null,
    p192: null,
    p25519: null
  };

  // Pseudo-Mersenne prime
  function MPrime (name, p) {
    // P = 2 ^ N - K
    this.name = name;
    this.p = new BN(p, 16);
    this.n = this.p.bitLength();
    this.k = new BN(1).iushln(this.n).isub(this.p);

    this.tmp = this._tmp();
  }

  MPrime.prototype._tmp = function _tmp () {
    var tmp = new BN(null);
    tmp.words = new Array(Math.ceil(this.n / 13));
    return tmp;
  };

  MPrime.prototype.ireduce = function ireduce (num) {
    // Assumes that `num` is less than `P^2`
    // num = HI * (2 ^ N - K) + HI * K + LO = HI * K + LO (mod P)
    var r = num;
    var rlen;

    do {
      this.split(r, this.tmp);
      r = this.imulK(r);
      r = r.iadd(this.tmp);
      rlen = r.bitLength();
    } while (rlen > this.n);

    var cmp = rlen < this.n ? -1 : r.ucmp(this.p);
    if (cmp === 0) {
      r.words[0] = 0;
      r.length = 1;
    } else if (cmp > 0) {
      r.isub(this.p);
    } else {
      r.strip();
    }

    return r;
  };

  MPrime.prototype.split = function split (input, out) {
    input.iushrn(this.n, 0, out);
  };

  MPrime.prototype.imulK = function imulK (num) {
    return num.imul(this.k);
  };

  function K256 () {
    MPrime.call(
      this,
      'k256',
      'ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff fffffffe fffffc2f');
  }
  inherits(K256, MPrime);

  K256.prototype.split = function split (input, output) {
    // 256 = 9 * 26 + 22
    var mask = 0x3fffff;

    var outLen = Math.min(input.length, 9);
    for (var i = 0; i < outLen; i++) {
      output.words[i] = input.words[i];
    }
    output.length = outLen;

    if (input.length <= 9) {
      input.words[0] = 0;
      input.length = 1;
      return;
    }

    // Shift by 9 limbs
    var prev = input.words[9];
    output.words[output.length++] = prev & mask;

    for (i = 10; i < input.length; i++) {
      var next = input.words[i] | 0;
      input.words[i - 10] = ((next & mask) << 4) | (prev >>> 22);
      prev = next;
    }
    prev >>>= 22;
    input.words[i - 10] = prev;
    if (prev === 0 && input.length > 10) {
      input.length -= 10;
    } else {
      input.length -= 9;
    }
  };

  K256.prototype.imulK = function imulK (num) {
    // K = 0x1000003d1 = [ 0x40, 0x3d1 ]
    num.words[num.length] = 0;
    num.words[num.length + 1] = 0;
    num.length += 2;

    // bounded at: 0x40 * 0x3ffffff + 0x3d0 = 0x100000390
    var lo = 0;
    for (var i = 0; i < num.length; i++) {
      var w = num.words[i] | 0;
      lo += w * 0x3d1;
      num.words[i] = lo & 0x3ffffff;
      lo = w * 0x40 + ((lo / 0x4000000) | 0);
    }

    // Fast length reduction
    if (num.words[num.length - 1] === 0) {
      num.length--;
      if (num.words[num.length - 1] === 0) {
        num.length--;
      }
    }
    return num;
  };

  function P224 () {
    MPrime.call(
      this,
      'p224',
      'ffffffff ffffffff ffffffff ffffffff 00000000 00000000 00000001');
  }
  inherits(P224, MPrime);

  function P192 () {
    MPrime.call(
      this,
      'p192',
      'ffffffff ffffffff ffffffff fffffffe ffffffff ffffffff');
  }
  inherits(P192, MPrime);

  function P25519 () {
    // 2 ^ 255 - 19
    MPrime.call(
      this,
      '25519',
      '7fffffffffffffff ffffffffffffffff ffffffffffffffff ffffffffffffffed');
  }
  inherits(P25519, MPrime);

  P25519.prototype.imulK = function imulK (num) {
    // K = 0x13
    var carry = 0;
    for (var i = 0; i < num.length; i++) {
      var hi = (num.words[i] | 0) * 0x13 + carry;
      var lo = hi & 0x3ffffff;
      hi >>>= 26;

      num.words[i] = lo;
      carry = hi;
    }
    if (carry !== 0) {
      num.words[num.length++] = carry;
    }
    return num;
  };

  // Exported mostly for testing purposes, use plain name instead
  BN._prime = function prime (name) {
    // Cached version of prime
    if (primes[name]) return primes[name];

    var prime;
    if (name === 'k256') {
      prime = new K256();
    } else if (name === 'p224') {
      prime = new P224();
    } else if (name === 'p192') {
      prime = new P192();
    } else if (name === 'p25519') {
      prime = new P25519();
    } else {
      throw new Error('Unknown prime ' + name);
    }
    primes[name] = prime;

    return prime;
  };

  //
  // Base reduction engine
  //
  function Red (m) {
    if (typeof m === 'string') {
      var prime = BN._prime(m);
      this.m = prime.p;
      this.prime = prime;
    } else {
      assert(m.gtn(1), 'modulus must be greater than 1');
      this.m = m;
      this.prime = null;
    }
  }

  Red.prototype._verify1 = function _verify1 (a) {
    assert(a.negative === 0, 'red works only with positives');
    assert(a.red, 'red works only with red numbers');
  };

  Red.prototype._verify2 = function _verify2 (a, b) {
    assert((a.negative | b.negative) === 0, 'red works only with positives');
    assert(a.red && a.red === b.red,
      'red works only with red numbers');
  };

  Red.prototype.imod = function imod (a) {
    if (this.prime) return this.prime.ireduce(a)._forceRed(this);
    return a.umod(this.m)._forceRed(this);
  };

  Red.prototype.neg = function neg (a) {
    if (a.isZero()) {
      return a.clone();
    }

    return this.m.sub(a)._forceRed(this);
  };

  Red.prototype.add = function add (a, b) {
    this._verify2(a, b);

    var res = a.add(b);
    if (res.cmp(this.m) >= 0) {
      res.isub(this.m);
    }
    return res._forceRed(this);
  };

  Red.prototype.iadd = function iadd (a, b) {
    this._verify2(a, b);

    var res = a.iadd(b);
    if (res.cmp(this.m) >= 0) {
      res.isub(this.m);
    }
    return res;
  };

  Red.prototype.sub = function sub (a, b) {
    this._verify2(a, b);

    var res = a.sub(b);
    if (res.cmpn(0) < 0) {
      res.iadd(this.m);
    }
    return res._forceRed(this);
  };

  Red.prototype.isub = function isub (a, b) {
    this._verify2(a, b);

    var res = a.isub(b);
    if (res.cmpn(0) < 0) {
      res.iadd(this.m);
    }
    return res;
  };

  Red.prototype.shl = function shl (a, num) {
    this._verify1(a);
    return this.imod(a.ushln(num));
  };

  Red.prototype.imul = function imul (a, b) {
    this._verify2(a, b);
    return this.imod(a.imul(b));
  };

  Red.prototype.mul = function mul (a, b) {
    this._verify2(a, b);
    return this.imod(a.mul(b));
  };

  Red.prototype.isqr = function isqr (a) {
    return this.imul(a, a.clone());
  };

  Red.prototype.sqr = function sqr (a) {
    return this.mul(a, a);
  };

  Red.prototype.sqrt = function sqrt (a) {
    if (a.isZero()) return a.clone();

    var mod3 = this.m.andln(3);
    assert(mod3 % 2 === 1);

    // Fast case
    if (mod3 === 3) {
      var pow = this.m.add(new BN(1)).iushrn(2);
      return this.pow(a, pow);
    }

    // Tonelli-Shanks algorithm (Totally unoptimized and slow)
    //
    // Find Q and S, that Q * 2 ^ S = (P - 1)
    var q = this.m.subn(1);
    var s = 0;
    while (!q.isZero() && q.andln(1) === 0) {
      s++;
      q.iushrn(1);
    }
    assert(!q.isZero());

    var one = new BN(1).toRed(this);
    var nOne = one.redNeg();

    // Find quadratic non-residue
    // NOTE: Max is such because of generalized Riemann hypothesis.
    var lpow = this.m.subn(1).iushrn(1);
    var z = this.m.bitLength();
    z = new BN(2 * z * z).toRed(this);

    while (this.pow(z, lpow).cmp(nOne) !== 0) {
      z.redIAdd(nOne);
    }

    var c = this.pow(z, q);
    var r = this.pow(a, q.addn(1).iushrn(1));
    var t = this.pow(a, q);
    var m = s;
    while (t.cmp(one) !== 0) {
      var tmp = t;
      for (var i = 0; tmp.cmp(one) !== 0; i++) {
        tmp = tmp.redSqr();
      }
      assert(i < m);
      var b = this.pow(c, new BN(1).iushln(m - i - 1));

      r = r.redMul(b);
      c = b.redSqr();
      t = t.redMul(c);
      m = i;
    }

    return r;
  };

  Red.prototype.invm = function invm (a) {
    var inv = a._invmp(this.m);
    if (inv.negative !== 0) {
      inv.negative = 0;
      return this.imod(inv).redNeg();
    } else {
      return this.imod(inv);
    }
  };

  Red.prototype.pow = function pow (a, num) {
    if (num.isZero()) return new BN(1).toRed(this);
    if (num.cmpn(1) === 0) return a.clone();

    var windowSize = 4;
    var wnd = new Array(1 << windowSize);
    wnd[0] = new BN(1).toRed(this);
    wnd[1] = a;
    for (var i = 2; i < wnd.length; i++) {
      wnd[i] = this.mul(wnd[i - 1], a);
    }

    var res = wnd[0];
    var current = 0;
    var currentLen = 0;
    var start = num.bitLength() % 26;
    if (start === 0) {
      start = 26;
    }

    for (i = num.length - 1; i >= 0; i--) {
      var word = num.words[i];
      for (var j = start - 1; j >= 0; j--) {
        var bit = (word >> j) & 1;
        if (res !== wnd[0]) {
          res = this.sqr(res);
        }

        if (bit === 0 && current === 0) {
          currentLen = 0;
          continue;
        }

        current <<= 1;
        current |= bit;
        currentLen++;
        if (currentLen !== windowSize && (i !== 0 || j !== 0)) continue;

        res = this.mul(res, wnd[current]);
        currentLen = 0;
        current = 0;
      }
      start = 26;
    }

    return res;
  };

  Red.prototype.convertTo = function convertTo (num) {
    var r = num.umod(this.m);

    return r === num ? r.clone() : r;
  };

  Red.prototype.convertFrom = function convertFrom (num) {
    var res = num.clone();
    res.red = null;
    return res;
  };

  //
  // Montgomery method engine
  //

  BN.mont = function mont (num) {
    return new Mont(num);
  };

  function Mont (m) {
    Red.call(this, m);

    this.shift = this.m.bitLength();
    if (this.shift % 26 !== 0) {
      this.shift += 26 - (this.shift % 26);
    }

    this.r = new BN(1).iushln(this.shift);
    this.r2 = this.imod(this.r.sqr());
    this.rinv = this.r._invmp(this.m);

    this.minv = this.rinv.mul(this.r).isubn(1).div(this.m);
    this.minv = this.minv.umod(this.r);
    this.minv = this.r.sub(this.minv);
  }
  inherits(Mont, Red);

  Mont.prototype.convertTo = function convertTo (num) {
    return this.imod(num.ushln(this.shift));
  };

  Mont.prototype.convertFrom = function convertFrom (num) {
    var r = this.imod(num.mul(this.rinv));
    r.red = null;
    return r;
  };

  Mont.prototype.imul = function imul (a, b) {
    if (a.isZero() || b.isZero()) {
      a.words[0] = 0;
      a.length = 1;
      return a;
    }

    var t = a.imul(b);
    var c = t.maskn(this.shift).mul(this.minv).imaskn(this.shift).mul(this.m);
    var u = t.isub(c).iushrn(this.shift);
    var res = u;

    if (u.cmp(this.m) >= 0) {
      res = u.isub(this.m);
    } else if (u.cmpn(0) < 0) {
      res = u.iadd(this.m);
    }

    return res._forceRed(this);
  };

  Mont.prototype.mul = function mul (a, b) {
    if (a.isZero() || b.isZero()) return new BN(0)._forceRed(this);

    var t = a.mul(b);
    var c = t.maskn(this.shift).mul(this.minv).imaskn(this.shift).mul(this.m);
    var u = t.isub(c).iushrn(this.shift);
    var res = u;
    if (u.cmp(this.m) >= 0) {
      res = u.isub(this.m);
    } else if (u.cmpn(0) < 0) {
      res = u.iadd(this.m);
    }

    return res._forceRed(this);
  };

  Mont.prototype.invm = function invm (a) {
    // (AR)^-1 * R^2 = (A^-1 * R^-1) * R^2 = A^-1 * R
    var res = this.imod(a._invmp(this.m).mul(this.r2));
    return res._forceRed(this);
  };
})(typeof module === 'undefined' || module, this);

},{"buffer":77}],24:[function(require,module,exports){
'use strict'

module.exports = findBounds

function findBounds(points) {
  var n = points.length
  if(n === 0) {
    return [[], []]
  }
  var d = points[0].length
  var lo = points[0].slice()
  var hi = points[0].slice()
  for(var i=1; i<n; ++i) {
    var p = points[i]
    for(var j=0; j<d; ++j) {
      var x = p[j]
      lo[j] = Math.min(lo[j], x)
      hi[j] = Math.max(hi[j], x)
    }
  }
  return [lo, hi]
}
},{}],25:[function(require,module,exports){
'use strict'

module.exports = boxIntersectWrapper

var pool = require('typedarray-pool')
var sweep = require('./lib/sweep')
var boxIntersectIter = require('./lib/intersect')

function boxEmpty(d, box) {
  for(var j=0; j<d; ++j) {
    if(!(box[j] <= box[j+d])) {
      return true
    }
  }
  return false
}

//Unpack boxes into a flat typed array, remove empty boxes
function convertBoxes(boxes, d, data, ids) {
  var ptr = 0
  var count = 0
  for(var i=0, n=boxes.length; i<n; ++i) {
    var b = boxes[i]
    if(boxEmpty(d, b)) {
      continue
    }
    for(var j=0; j<2*d; ++j) {
      data[ptr++] = b[j]
    }
    ids[count++] = i
  }
  return count
}

//Perform type conversions, check bounds
function boxIntersect(red, blue, visit, full) {
  var n = red.length
  var m = blue.length

  //If either array is empty, then we can skip this whole thing
  if(n <= 0 || m <= 0) {
    return
  }

  //Compute dimension, if it is 0 then we skip
  var d = (red[0].length)>>>1
  if(d <= 0) {
    return
  }

  var retval

  //Convert red boxes
  var redList  = pool.mallocDouble(2*d*n)
  var redIds   = pool.mallocInt32(n)
  n = convertBoxes(red, d, redList, redIds)

  if(n > 0) {
    if(d === 1 && full) {
      //Special case: 1d complete
      sweep.init(n)
      retval = sweep.sweepComplete(
        d, visit, 
        0, n, redList, redIds,
        0, n, redList, redIds)
    } else {

      //Convert blue boxes
      var blueList = pool.mallocDouble(2*d*m)
      var blueIds  = pool.mallocInt32(m)
      m = convertBoxes(blue, d, blueList, blueIds)

      if(m > 0) {
        sweep.init(n+m)

        if(d === 1) {
          //Special case: 1d bipartite
          retval = sweep.sweepBipartite(
            d, visit, 
            0, n, redList,  redIds,
            0, m, blueList, blueIds)
        } else {
          //General case:  d>1
          retval = boxIntersectIter(
            d, visit,    full,
            n, redList,  redIds,
            m, blueList, blueIds)
        }

        pool.free(blueList)
        pool.free(blueIds)
      }
    }

    pool.free(redList)
    pool.free(redIds)
  }

  return retval
}


var RESULT

function appendItem(i,j) {
  RESULT.push([i,j])
}

function intersectFullArray(x) {
  RESULT = []
  boxIntersect(x, x, appendItem, true)
  return RESULT
}

function intersectBipartiteArray(x, y) {
  RESULT = []
  boxIntersect(x, y, appendItem, false)
  return RESULT
}

//User-friendly wrapper, handle full input and no-visitor cases
function boxIntersectWrapper(arg0, arg1, arg2) {
  var result
  switch(arguments.length) {
    case 1:
      return intersectFullArray(arg0)
    case 2:
      if(typeof arg1 === 'function') {
        return boxIntersect(arg0, arg0, arg1, true)
      } else {
        return intersectBipartiteArray(arg0, arg1)
      }
    case 3:
      return boxIntersect(arg0, arg1, arg2, false)
    default:
      throw new Error('box-intersect: Invalid arguments')
  }
}
},{"./lib/intersect":27,"./lib/sweep":31,"typedarray-pool":71}],26:[function(require,module,exports){
'use strict'

var DIMENSION   = 'd'
var AXIS        = 'ax'
var VISIT       = 'vv'
var FLIP        = 'fp'

var ELEM_SIZE   = 'es'

var RED_START   = 'rs'
var RED_END     = 're'
var RED_BOXES   = 'rb'
var RED_INDEX   = 'ri'
var RED_PTR     = 'rp'

var BLUE_START  = 'bs'
var BLUE_END    = 'be'
var BLUE_BOXES  = 'bb'
var BLUE_INDEX  = 'bi'
var BLUE_PTR    = 'bp'

var RETVAL      = 'rv'

var INNER_LABEL = 'Q'

var ARGS = [
  DIMENSION,
  AXIS,
  VISIT,
  RED_START,
  RED_END,
  RED_BOXES,
  RED_INDEX,
  BLUE_START,
  BLUE_END,
  BLUE_BOXES,
  BLUE_INDEX
]

function generateBruteForce(redMajor, flip, full) {
  var funcName = 'bruteForce' + 
    (redMajor ? 'Red' : 'Blue') + 
    (flip ? 'Flip' : '') +
    (full ? 'Full' : '')

  var code = ['function ', funcName, '(', ARGS.join(), '){',
    'var ', ELEM_SIZE, '=2*', DIMENSION, ';']

  var redLoop = 
    'for(var i=' + RED_START + ',' + RED_PTR + '=' + ELEM_SIZE + '*' + RED_START + ';' +
        'i<' + RED_END +';' +
        '++i,' + RED_PTR + '+=' + ELEM_SIZE + '){' +
        'var x0=' + RED_BOXES + '[' + AXIS + '+' + RED_PTR + '],' +
            'x1=' + RED_BOXES + '[' + AXIS + '+' + RED_PTR + '+' + DIMENSION + '],' +
            'xi=' + RED_INDEX + '[i];'

  var blueLoop = 
    'for(var j=' + BLUE_START + ',' + BLUE_PTR + '=' + ELEM_SIZE + '*' + BLUE_START + ';' +
        'j<' + BLUE_END + ';' +
        '++j,' + BLUE_PTR + '+=' + ELEM_SIZE + '){' +
        'var y0=' + BLUE_BOXES + '[' + AXIS + '+' + BLUE_PTR + '],' +
            (full ? 'y1=' + BLUE_BOXES + '[' + AXIS + '+' + BLUE_PTR + '+' + DIMENSION + '],' : '') +
            'yi=' + BLUE_INDEX + '[j];'

  if(redMajor) {
    code.push(redLoop, INNER_LABEL, ':', blueLoop)
  } else {
    code.push(blueLoop, INNER_LABEL, ':', redLoop)
  }

  if(full) {
    code.push('if(y1<x0||x1<y0)continue;')
  } else if(flip) {
    code.push('if(y0<=x0||x1<y0)continue;')
  } else {
    code.push('if(y0<x0||x1<y0)continue;')
  }

  code.push('for(var k='+AXIS+'+1;k<'+DIMENSION+';++k){'+
    'var r0='+RED_BOXES+'[k+'+RED_PTR+'],'+
        'r1='+RED_BOXES+'[k+'+DIMENSION+'+'+RED_PTR+'],'+
        'b0='+BLUE_BOXES+'[k+'+BLUE_PTR+'],'+
        'b1='+BLUE_BOXES+'[k+'+DIMENSION+'+'+BLUE_PTR+'];'+
      'if(r1<b0||b1<r0)continue ' + INNER_LABEL + ';}' +
      'var ' + RETVAL + '=' + VISIT + '(')

  if(flip) {
    code.push('yi,xi')
  } else {
    code.push('xi,yi')
  }

  code.push(');if(' + RETVAL + '!==void 0)return ' + RETVAL + ';}}}')

  return {
    name: funcName, 
    code: code.join('')
  }
}

function bruteForcePlanner(full) {
  var funcName = 'bruteForce' + (full ? 'Full' : 'Partial')
  var prefix = []
  var fargs = ARGS.slice()
  if(!full) {
    fargs.splice(3, 0, FLIP)
  }

  var code = ['function ' + funcName + '(' + fargs.join() + '){']

  function invoke(redMajor, flip) {
    var res = generateBruteForce(redMajor, flip, full)
    prefix.push(res.code)
    code.push('return ' + res.name + '(' + ARGS.join() + ');')
  }

  code.push('if(' + RED_END + '-' + RED_START + '>' +
                    BLUE_END + '-' + BLUE_START + '){')

  if(full) {
    invoke(true, false)
    code.push('}else{')
    invoke(false, false)
  } else {
    code.push('if(' + FLIP + '){')
    invoke(true, true)
    code.push('}else{')
    invoke(true, false)
    code.push('}}else{if(' + FLIP + '){')
    invoke(false, true)
    code.push('}else{')
    invoke(false, false)
    code.push('}')
  }
  code.push('}}return ' + funcName)

  var codeStr = prefix.join('') + code.join('')
  var proc = new Function(codeStr)
  return proc()
}


exports.partial = bruteForcePlanner(false)
exports.full    = bruteForcePlanner(true)
},{}],27:[function(require,module,exports){
'use strict'

module.exports = boxIntersectIter

var pool = require('typedarray-pool')
var bits = require('bit-twiddle')
var bruteForce = require('./brute')
var bruteForcePartial = bruteForce.partial
var bruteForceFull = bruteForce.full
var sweep = require('./sweep')
var findMedian = require('./median')
var genPartition = require('./partition')

//Twiddle parameters
var BRUTE_FORCE_CUTOFF    = 128       //Cut off for brute force search
var SCAN_CUTOFF           = (1<<22)   //Cut off for two way scan
var SCAN_COMPLETE_CUTOFF  = (1<<22)  

//Partition functions
var partitionInteriorContainsInterval = genPartition(
  '!(lo>=p0)&&!(p1>=hi)', 
  ['p0', 'p1'])

var partitionStartEqual = genPartition(
  'lo===p0',
  ['p0'])

var partitionStartLessThan = genPartition(
  'lo<p0',
  ['p0'])

var partitionEndLessThanEqual = genPartition(
  'hi<=p0',
  ['p0'])

var partitionContainsPoint = genPartition(
  'lo<=p0&&p0<=hi',
  ['p0'])

var partitionContainsPointProper = genPartition(
  'lo<p0&&p0<=hi',
  ['p0'])

//Frame size for iterative loop
var IFRAME_SIZE = 6
var DFRAME_SIZE = 2

//Data for box statck
var INIT_CAPACITY = 1024
var BOX_ISTACK  = pool.mallocInt32(INIT_CAPACITY)
var BOX_DSTACK  = pool.mallocDouble(INIT_CAPACITY)

//Initialize iterative loop queue
function iterInit(d, count) {
  var levels = (8 * bits.log2(count+1) * (d+1))|0
  var maxInts = bits.nextPow2(IFRAME_SIZE*levels)
  if(BOX_ISTACK.length < maxInts) {
    pool.free(BOX_ISTACK)
    BOX_ISTACK = pool.mallocInt32(maxInts)
  }
  var maxDoubles = bits.nextPow2(DFRAME_SIZE*levels)
  if(BOX_DSTACK < maxDoubles) {
    pool.free(BOX_DSTACK)
    BOX_DSTACK = pool.mallocDouble(maxDoubles)
  }
}

//Append item to queue
function iterPush(ptr,
  axis, 
  redStart, redEnd, 
  blueStart, blueEnd, 
  state, 
  lo, hi) {

  var iptr = IFRAME_SIZE * ptr
  BOX_ISTACK[iptr]   = axis
  BOX_ISTACK[iptr+1] = redStart
  BOX_ISTACK[iptr+2] = redEnd
  BOX_ISTACK[iptr+3] = blueStart
  BOX_ISTACK[iptr+4] = blueEnd
  BOX_ISTACK[iptr+5] = state

  var dptr = DFRAME_SIZE * ptr
  BOX_DSTACK[dptr]   = lo
  BOX_DSTACK[dptr+1] = hi
}

//Special case:  Intersect single point with list of intervals
function onePointPartial(
  d, axis, visit, flip,
  redStart, redEnd, red, redIndex,
  blueOffset, blue, blueId) {

  var elemSize = 2 * d
  var bluePtr  = blueOffset * elemSize
  var blueX    = blue[bluePtr + axis]

red_loop:
  for(var i=redStart, redPtr=redStart*elemSize; i<redEnd; ++i, redPtr+=elemSize) {
    var r0 = red[redPtr+axis]
    var r1 = red[redPtr+axis+d]
    if(blueX < r0 || r1 < blueX) {
      continue
    }
    if(flip && blueX === r0) {
      continue
    }
    var redId = redIndex[i]
    for(var j=axis+1; j<d; ++j) {
      var r0 = red[redPtr+j]
      var r1 = red[redPtr+j+d]
      var b0 = blue[bluePtr+j]
      var b1 = blue[bluePtr+j+d]
      if(r1 < b0 || b1 < r0) {
        continue red_loop
      }
    }
    var retval
    if(flip) {
      retval = visit(blueId, redId)
    } else {
      retval = visit(redId, blueId)
    }
    if(retval !== void 0) {
      return retval
    }
  }
}

//Special case:  Intersect one point with list of intervals
function onePointFull(
  d, axis, visit,
  redStart, redEnd, red, redIndex,
  blueOffset, blue, blueId) {

  var elemSize = 2 * d
  var bluePtr  = blueOffset * elemSize
  var blueX    = blue[bluePtr + axis]

red_loop:
  for(var i=redStart, redPtr=redStart*elemSize; i<redEnd; ++i, redPtr+=elemSize) {
    var redId = redIndex[i]
    if(redId === blueId) {
      continue
    }
    var r0 = red[redPtr+axis]
    var r1 = red[redPtr+axis+d]
    if(blueX < r0 || r1 < blueX) {
      continue
    }
    for(var j=axis+1; j<d; ++j) {
      var r0 = red[redPtr+j]
      var r1 = red[redPtr+j+d]
      var b0 = blue[bluePtr+j]
      var b1 = blue[bluePtr+j+d]
      if(r1 < b0 || b1 < r0) {
        continue red_loop
      }
    }
    var retval = visit(redId, blueId)
    if(retval !== void 0) {
      return retval
    }
  }
}

//The main box intersection routine
function boxIntersectIter(
  d, visit, initFull,
  xSize, xBoxes, xIndex,
  ySize, yBoxes, yIndex) {

  //Reserve memory for stack
  iterInit(d, xSize + ySize)

  var top  = 0
  var elemSize = 2 * d
  var retval

  iterPush(top++,
      0,
      0, xSize,
      0, ySize,
      initFull ? 16 : 0, 
      -Infinity, Infinity)
  if(!initFull) {
    iterPush(top++,
      0,
      0, ySize,
      0, xSize,
      1, 
      -Infinity, Infinity)
  }

  while(top > 0) {
    top  -= 1

    var iptr = top * IFRAME_SIZE
    var axis      = BOX_ISTACK[iptr]
    var redStart  = BOX_ISTACK[iptr+1]
    var redEnd    = BOX_ISTACK[iptr+2]
    var blueStart = BOX_ISTACK[iptr+3]
    var blueEnd   = BOX_ISTACK[iptr+4]
    var state     = BOX_ISTACK[iptr+5]

    var dptr = top * DFRAME_SIZE
    var lo        = BOX_DSTACK[dptr]
    var hi        = BOX_DSTACK[dptr+1]

    //Unpack state info
    var flip      = (state & 1)
    var full      = !!(state & 16)

    //Unpack indices
    var red       = xBoxes
    var redIndex  = xIndex
    var blue      = yBoxes
    var blueIndex = yIndex
    if(flip) {
      red         = yBoxes
      redIndex    = yIndex
      blue        = xBoxes
      blueIndex   = xIndex
    }

    if(state & 2) {
      redEnd = partitionStartLessThan(
        d, axis,
        redStart, redEnd, red, redIndex,
        hi)
      if(redStart >= redEnd) {
        continue
      }
    }
    if(state & 4) {
      redStart = partitionEndLessThanEqual(
        d, axis,
        redStart, redEnd, red, redIndex,
        lo)
      if(redStart >= redEnd) {
        continue
      }
    }
    
    var redCount  = redEnd  - redStart
    var blueCount = blueEnd - blueStart

    if(full) {
      if(d * redCount * (redCount + blueCount) < SCAN_COMPLETE_CUTOFF) {
        retval = sweep.scanComplete(
          d, axis, visit, 
          redStart, redEnd, red, redIndex,
          blueStart, blueEnd, blue, blueIndex)
        if(retval !== void 0) {
          return retval
        }
        continue
      }
    } else {
      if(d * Math.min(redCount, blueCount) < BRUTE_FORCE_CUTOFF) {
        //If input small, then use brute force
        retval = bruteForcePartial(
            d, axis, visit, flip,
            redStart,  redEnd,  red,  redIndex,
            blueStart, blueEnd, blue, blueIndex)
        if(retval !== void 0) {
          return retval
        }
        continue
      } else if(d * redCount * blueCount < SCAN_CUTOFF) {
        //If input medium sized, then use sweep and prune
        retval = sweep.scanBipartite(
          d, axis, visit, flip, 
          redStart, redEnd, red, redIndex,
          blueStart, blueEnd, blue, blueIndex)
        if(retval !== void 0) {
          return retval
        }
        continue
      }
    }
    
    //First, find all red intervals whose interior contains (lo,hi)
    var red0 = partitionInteriorContainsInterval(
      d, axis, 
      redStart, redEnd, red, redIndex,
      lo, hi)

    //Lower dimensional case
    if(redStart < red0) {

      if(d * (red0 - redStart) < BRUTE_FORCE_CUTOFF) {
        //Special case for small inputs: use brute force
        retval = bruteForceFull(
          d, axis+1, visit,
          redStart, red0, red, redIndex,
          blueStart, blueEnd, blue, blueIndex)
        if(retval !== void 0) {
          return retval
        }
      } else if(axis === d-2) {
        if(flip) {
          retval = sweep.sweepBipartite(
            d, visit,
            blueStart, blueEnd, blue, blueIndex,
            redStart, red0, red, redIndex)
        } else {
          retval = sweep.sweepBipartite(
            d, visit,
            redStart, red0, red, redIndex,
            blueStart, blueEnd, blue, blueIndex)
        }
        if(retval !== void 0) {
          return retval
        }
      } else {
        iterPush(top++,
          axis+1,
          redStart, red0,
          blueStart, blueEnd,
          flip,
          -Infinity, Infinity)
        iterPush(top++,
          axis+1,
          blueStart, blueEnd,
          redStart, red0,
          flip^1,
          -Infinity, Infinity)
      }
    }

    //Divide and conquer phase
    if(red0 < redEnd) {

      //Cut blue into 3 parts:
      //
      //  Points < mid point
      //  Points = mid point
      //  Points > mid point
      //
      var blue0 = findMedian(
        d, axis, 
        blueStart, blueEnd, blue, blueIndex)
      var mid = blue[elemSize * blue0 + axis]
      var blue1 = partitionStartEqual(
        d, axis,
        blue0, blueEnd, blue, blueIndex,
        mid)

      //Right case
      if(blue1 < blueEnd) {
        iterPush(top++,
          axis,
          red0, redEnd,
          blue1, blueEnd,
          (flip|4) + (full ? 16 : 0),
          mid, hi)
      }

      //Left case
      if(blueStart < blue0) {
        iterPush(top++,
          axis,
          red0, redEnd,
          blueStart, blue0,
          (flip|2) + (full ? 16 : 0),
          lo, mid)
      }

      //Center case (the hard part)
      if(blue0 + 1 === blue1) {
        //Optimization: Range with exactly 1 point, use a brute force scan
        if(full) {
          retval = onePointFull(
            d, axis, visit,
            red0, redEnd, red, redIndex,
            blue0, blue, blueIndex[blue0])
        } else {
          retval = onePointPartial(
            d, axis, visit, flip,
            red0, redEnd, red, redIndex,
            blue0, blue, blueIndex[blue0])
        }
        if(retval !== void 0) {
          return retval
        }
      } else if(blue0 < blue1) {
        var red1
        if(full) {
          //If full intersection, need to handle special case
          red1 = partitionContainsPoint(
            d, axis,
            red0, redEnd, red, redIndex,
            mid)
          if(red0 < red1) {
            var redX = partitionStartEqual(
              d, axis,
              red0, red1, red, redIndex,
              mid)
            if(axis === d-2) {
              //Degenerate sweep intersection:
              //  [red0, redX] with [blue0, blue1]
              if(red0 < redX) {
                retval = sweep.sweepComplete(
                  d, visit,
                  red0, redX, red, redIndex,
                  blue0, blue1, blue, blueIndex)
                if(retval !== void 0) {
                  return retval
                }
              }

              //Normal sweep intersection:
              //  [redX, red1] with [blue0, blue1]
              if(redX < red1) {
                retval = sweep.sweepBipartite(
                  d, visit,
                  redX, red1, red, redIndex,
                  blue0, blue1, blue, blueIndex)
                if(retval !== void 0) {
                  return retval
                }
              }
            } else {
              if(red0 < redX) {
                iterPush(top++,
                  axis+1,
                  red0, redX,
                  blue0, blue1,
                  16,
                  -Infinity, Infinity)
              }
              if(redX < red1) {
                iterPush(top++,
                  axis+1,
                  redX, red1,
                  blue0, blue1,
                  0,
                  -Infinity, Infinity)
                iterPush(top++,
                  axis+1,
                  blue0, blue1,
                  redX, red1,
                  1,
                  -Infinity, Infinity)
              }
            }
          }
        } else {
          if(flip) {
            red1 = partitionContainsPointProper(
              d, axis,
              red0, redEnd, red, redIndex,
              mid)
          } else {
            red1 = partitionContainsPoint(
              d, axis,
              red0, redEnd, red, redIndex,
              mid)
          }
          if(red0 < red1) {
            if(axis === d-2) {
              if(flip) {
                retval = sweep.sweepBipartite(
                  d, visit,
                  blue0, blue1, blue, blueIndex,
                  red0, red1, red, redIndex)
              } else {
                retval = sweep.sweepBipartite(
                  d, visit,
                  red0, red1, red, redIndex,
                  blue0, blue1, blue, blueIndex)
              }
            } else {
              iterPush(top++,
                axis+1,
                red0, red1,
                blue0, blue1,
                flip,
                -Infinity, Infinity)
              iterPush(top++,
                axis+1,
                blue0, blue1,
                red0, red1,
                flip^1,
                -Infinity, Infinity)
            }
          }
        }
      }
    }
  }
}
},{"./brute":26,"./median":28,"./partition":29,"./sweep":31,"bit-twiddle":22,"typedarray-pool":71}],28:[function(require,module,exports){
'use strict'

module.exports = findMedian

var genPartition = require('./partition')

var partitionStartLessThan = genPartition('lo<p0', ['p0'])

var PARTITION_THRESHOLD = 8   //Cut off for using insertion sort in findMedian

//Base case for median finding:  Use insertion sort
function insertionSort(d, axis, start, end, boxes, ids) {
  var elemSize = 2 * d
  var boxPtr = elemSize * (start+1) + axis
  for(var i=start+1; i<end; ++i, boxPtr+=elemSize) {
    var x = boxes[boxPtr]
    for(var j=i, ptr=elemSize*(i-1); 
        j>start && boxes[ptr+axis] > x; 
        --j, ptr-=elemSize) {
      //Swap
      var aPtr = ptr
      var bPtr = ptr+elemSize
      for(var k=0; k<elemSize; ++k, ++aPtr, ++bPtr) {
        var y = boxes[aPtr]
        boxes[aPtr] = boxes[bPtr]
        boxes[bPtr] = y
      }
      var tmp = ids[j]
      ids[j] = ids[j-1]
      ids[j-1] = tmp
    }
  }
}

//Find median using quick select algorithm
//  takes O(n) time with high probability
function findMedian(d, axis, start, end, boxes, ids) {
  if(end <= start+1) {
    return start
  }

  var lo       = start
  var hi       = end
  var mid      = ((end + start) >>> 1)
  var elemSize = 2*d
  var pivot    = mid
  var value    = boxes[elemSize*mid+axis]
  
  while(lo < hi) {
    if(hi - lo < PARTITION_THRESHOLD) {
      insertionSort(d, axis, lo, hi, boxes, ids)
      value = boxes[elemSize*mid+axis]
      break
    }
    
    //Select pivot using median-of-3
    var count  = hi - lo
    var pivot0 = (Math.random()*count+lo)|0
    var value0 = boxes[elemSize*pivot0 + axis]
    var pivot1 = (Math.random()*count+lo)|0
    var value1 = boxes[elemSize*pivot1 + axis]
    var pivot2 = (Math.random()*count+lo)|0
    var value2 = boxes[elemSize*pivot2 + axis]
    if(value0 <= value1) {
      if(value2 >= value1) {
        pivot = pivot1
        value = value1
      } else if(value0 >= value2) {
        pivot = pivot0
        value = value0
      } else {
        pivot = pivot2
        value = value2
      }
    } else {
      if(value1 >= value2) {
        pivot = pivot1
        value = value1
      } else if(value2 >= value0) {
        pivot = pivot0
        value = value0
      } else {
        pivot = pivot2
        value = value2
      }
    }

    //Swap pivot to end of array
    var aPtr = elemSize * (hi-1)
    var bPtr = elemSize * pivot
    for(var i=0; i<elemSize; ++i, ++aPtr, ++bPtr) {
      var x = boxes[aPtr]
      boxes[aPtr] = boxes[bPtr]
      boxes[bPtr] = x
    }
    var y = ids[hi-1]
    ids[hi-1] = ids[pivot]
    ids[pivot] = y

    //Partition using pivot
    pivot = partitionStartLessThan(
      d, axis, 
      lo, hi-1, boxes, ids,
      value)

    //Swap pivot back
    var aPtr = elemSize * (hi-1)
    var bPtr = elemSize * pivot
    for(var i=0; i<elemSize; ++i, ++aPtr, ++bPtr) {
      var x = boxes[aPtr]
      boxes[aPtr] = boxes[bPtr]
      boxes[bPtr] = x
    }
    var y = ids[hi-1]
    ids[hi-1] = ids[pivot]
    ids[pivot] = y

    //Swap pivot to last pivot
    if(mid < pivot) {
      hi = pivot-1
      while(lo < hi && 
        boxes[elemSize*(hi-1)+axis] === value) {
        hi -= 1
      }
      hi += 1
    } else if(pivot < mid) {
      lo = pivot + 1
      while(lo < hi &&
        boxes[elemSize*lo+axis] === value) {
        lo += 1
      }
    } else {
      break
    }
  }

  //Make sure pivot is at start
  return partitionStartLessThan(
    d, axis, 
    start, mid, boxes, ids,
    boxes[elemSize*mid+axis])
}
},{"./partition":29}],29:[function(require,module,exports){
'use strict'

module.exports = genPartition

var code = 'for(var j=2*a,k=j*c,l=k,m=c,n=b,o=a+b,p=c;d>p;++p,k+=j){var _;if($)if(m===p)m+=1,l+=j;else{for(var s=0;j>s;++s){var t=e[k+s];e[k+s]=e[l],e[l++]=t}var u=f[p];f[p]=f[m],f[m++]=u}}return m'

function genPartition(predicate, args) {
  var fargs ='abcdef'.split('').concat(args)
  var reads = []
  if(predicate.indexOf('lo') >= 0) {
    reads.push('lo=e[k+n]')
  }
  if(predicate.indexOf('hi') >= 0) {
    reads.push('hi=e[k+o]')
  }
  fargs.push(
    code.replace('_', reads.join())
        .replace('$', predicate))
  return Function.apply(void 0, fargs)
}
},{}],30:[function(require,module,exports){
'use strict';

//This code is extracted from ndarray-sort
//It is inlined here as a temporary workaround

module.exports = wrapper;

var INSERT_SORT_CUTOFF = 32

function wrapper(data, n0) {
  if (n0 <= 4*INSERT_SORT_CUTOFF) {
    insertionSort(0, n0 - 1, data);
  } else {
    quickSort(0, n0 - 1, data);
  }
}

function insertionSort(left, right, data) {
  var ptr = 2*(left+1)
  for(var i=left+1; i<=right; ++i) {
    var a = data[ptr++]
    var b = data[ptr++]
    var j = i
    var jptr = ptr-2
    while(j-- > left) {
      var x = data[jptr-2]
      var y = data[jptr-1]
      if(x < a) {
        break
      } else if(x === a && y < b) {
        break
      }
      data[jptr]   = x
      data[jptr+1] = y
      jptr -= 2
    }
    data[jptr]   = a
    data[jptr+1] = b
  }
}

function swap(i, j, data) {
  i *= 2
  j *= 2
  var x = data[i]
  var y = data[i+1]
  data[i] = data[j]
  data[i+1] = data[j+1]
  data[j] = x
  data[j+1] = y
}

function move(i, j, data) {
  i *= 2
  j *= 2
  data[i] = data[j]
  data[i+1] = data[j+1]
}

function rotate(i, j, k, data) {
  i *= 2
  j *= 2
  k *= 2
  var x = data[i]
  var y = data[i+1]
  data[i] = data[j]
  data[i+1] = data[j+1]
  data[j] = data[k]
  data[j+1] = data[k+1]
  data[k] = x
  data[k+1] = y
}

function shufflePivot(i, j, px, py, data) {
  i *= 2
  j *= 2
  data[i] = data[j]
  data[j] = px
  data[i+1] = data[j+1]
  data[j+1] = py
}

function compare(i, j, data) {
  i *= 2
  j *= 2
  var x = data[i],
      y = data[j]
  if(x < y) {
    return false
  } else if(x === y) {
    return data[i+1] > data[j+1]
  }
  return true
}

function comparePivot(i, y, b, data) {
  i *= 2
  var x = data[i]
  if(x < y) {
    return true
  } else if(x === y) {
    return data[i+1] < b
  }
  return false
}

function quickSort(left, right, data) {
  var sixth = (right - left + 1) / 6 | 0, 
      index1 = left + sixth, 
      index5 = right - sixth, 
      index3 = left + right >> 1, 
      index2 = index3 - sixth, 
      index4 = index3 + sixth, 
      el1 = index1, 
      el2 = index2, 
      el3 = index3, 
      el4 = index4, 
      el5 = index5, 
      less = left + 1, 
      great = right - 1, 
      tmp = 0
  if(compare(el1, el2, data)) {
    tmp = el1
    el1 = el2
    el2 = tmp
  }
  if(compare(el4, el5, data)) {
    tmp = el4
    el4 = el5
    el5 = tmp
  }
  if(compare(el1, el3, data)) {
    tmp = el1
    el1 = el3
    el3 = tmp
  }
  if(compare(el2, el3, data)) {
    tmp = el2
    el2 = el3
    el3 = tmp
  }
  if(compare(el1, el4, data)) {
    tmp = el1
    el1 = el4
    el4 = tmp
  }
  if(compare(el3, el4, data)) {
    tmp = el3
    el3 = el4
    el4 = tmp
  }
  if(compare(el2, el5, data)) {
    tmp = el2
    el2 = el5
    el5 = tmp
  }
  if(compare(el2, el3, data)) {
    tmp = el2
    el2 = el3
    el3 = tmp
  }
  if(compare(el4, el5, data)) {
    tmp = el4
    el4 = el5
    el5 = tmp
  }

  var pivot1X = data[2*el2]
  var pivot1Y = data[2*el2+1]
  var pivot2X = data[2*el4]
  var pivot2Y = data[2*el4+1]

  var ptr0 = 2 * el1;
  var ptr2 = 2 * el3;
  var ptr4 = 2 * el5;
  var ptr5 = 2 * index1;
  var ptr6 = 2 * index3;
  var ptr7 = 2 * index5;
  for (var i1 = 0; i1 < 2; ++i1) {
    var x = data[ptr0+i1];
    var y = data[ptr2+i1];
    var z = data[ptr4+i1];
    data[ptr5+i1] = x;
    data[ptr6+i1] = y;
    data[ptr7+i1] = z;
  }

  move(index2, left, data)
  move(index4, right, data)
  for (var k = less; k <= great; ++k) {
    if (comparePivot(k, pivot1X, pivot1Y, data)) {
      if (k !== less) {
        swap(k, less, data)
      }
      ++less;
    } else {
      if (!comparePivot(k, pivot2X, pivot2Y, data)) {
        while (true) {
          if (!comparePivot(great, pivot2X, pivot2Y, data)) {
            if (--great < k) {
              break;
            }
            continue;
          } else {
            if (comparePivot(great, pivot1X, pivot1Y, data)) {
              rotate(k, less, great, data)
              ++less;
              --great;
            } else {
              swap(k, great, data)
              --great;
            }
            break;
          }
        }
      }
    }
  }
  shufflePivot(left, less-1, pivot1X, pivot1Y, data)
  shufflePivot(right, great+1, pivot2X, pivot2Y, data)
  if (less - 2 - left <= INSERT_SORT_CUTOFF) {
    insertionSort(left, less - 2, data);
  } else {
    quickSort(left, less - 2, data);
  }
  if (right - (great + 2) <= INSERT_SORT_CUTOFF) {
    insertionSort(great + 2, right, data);
  } else {
    quickSort(great + 2, right, data);
  }
  if (great - less <= INSERT_SORT_CUTOFF) {
    insertionSort(less, great, data);
  } else {
    quickSort(less, great, data);
  }
}
},{}],31:[function(require,module,exports){
'use strict'

module.exports = {
  init:           sqInit,
  sweepBipartite: sweepBipartite,
  sweepComplete:  sweepComplete,
  scanBipartite:  scanBipartite,
  scanComplete:   scanComplete
}

var pool  = require('typedarray-pool')
var bits  = require('bit-twiddle')
var isort = require('./sort')

//Flag for blue
var BLUE_FLAG = (1<<28)

//1D sweep event queue stuff (use pool to save space)
var INIT_CAPACITY      = 1024
var RED_SWEEP_QUEUE    = pool.mallocInt32(INIT_CAPACITY)
var RED_SWEEP_INDEX    = pool.mallocInt32(INIT_CAPACITY)
var BLUE_SWEEP_QUEUE   = pool.mallocInt32(INIT_CAPACITY)
var BLUE_SWEEP_INDEX   = pool.mallocInt32(INIT_CAPACITY)
var COMMON_SWEEP_QUEUE = pool.mallocInt32(INIT_CAPACITY)
var COMMON_SWEEP_INDEX = pool.mallocInt32(INIT_CAPACITY)
var SWEEP_EVENTS       = pool.mallocDouble(INIT_CAPACITY * 8)

//Reserves memory for the 1D sweep data structures
function sqInit(count) {
  var rcount = bits.nextPow2(count)
  if(RED_SWEEP_QUEUE.length < rcount) {
    pool.free(RED_SWEEP_QUEUE)
    RED_SWEEP_QUEUE = pool.mallocInt32(rcount)
  }
  if(RED_SWEEP_INDEX.length < rcount) {
    pool.free(RED_SWEEP_INDEX)
    RED_SWEEP_INDEX = pool.mallocInt32(rcount)
  }
  if(BLUE_SWEEP_QUEUE.length < rcount) {
    pool.free(BLUE_SWEEP_QUEUE)
    BLUE_SWEEP_QUEUE = pool.mallocInt32(rcount)
  }
  if(BLUE_SWEEP_INDEX.length < rcount) {
    pool.free(BLUE_SWEEP_INDEX)
    BLUE_SWEEP_INDEX = pool.mallocInt32(rcount)
  }
  if(COMMON_SWEEP_QUEUE.length < rcount) {
    pool.free(COMMON_SWEEP_QUEUE)
    COMMON_SWEEP_QUEUE = pool.mallocInt32(rcount)
  }
  if(COMMON_SWEEP_INDEX.length < rcount) {
    pool.free(COMMON_SWEEP_INDEX)
    COMMON_SWEEP_INDEX = pool.mallocInt32(rcount)
  }
  var eventLength = 8 * rcount
  if(SWEEP_EVENTS.length < eventLength) {
    pool.free(SWEEP_EVENTS)
    SWEEP_EVENTS = pool.mallocDouble(eventLength)
  }
}

//Remove an item from the active queue in O(1)
function sqPop(queue, index, count, item) {
  var idx = index[item]
  var top = queue[count-1]
  queue[idx] = top
  index[top] = idx
}

//Insert an item into the active queue in O(1)
function sqPush(queue, index, count, item) {
  queue[count] = item
  index[item]  = count
}

//Recursion base case: use 1D sweep algorithm
function sweepBipartite(
    d, visit,
    redStart,  redEnd, red, redIndex,
    blueStart, blueEnd, blue, blueIndex) {

  //store events as pairs [coordinate, idx]
  //
  //  red create:  -(idx+1)
  //  red destroy: idx
  //  blue create: -(idx+BLUE_FLAG)
  //  blue destroy: idx+BLUE_FLAG
  //
  var ptr      = 0
  var elemSize = 2*d
  var istart   = d-1
  var iend     = elemSize-1

  for(var i=redStart; i<redEnd; ++i) {
    var idx = redIndex[i]
    var redOffset = elemSize*i
    SWEEP_EVENTS[ptr++] = red[redOffset+istart]
    SWEEP_EVENTS[ptr++] = -(idx+1)
    SWEEP_EVENTS[ptr++] = red[redOffset+iend]
    SWEEP_EVENTS[ptr++] = idx
  }

  for(var i=blueStart; i<blueEnd; ++i) {
    var idx = blueIndex[i]+BLUE_FLAG
    var blueOffset = elemSize*i
    SWEEP_EVENTS[ptr++] = blue[blueOffset+istart]
    SWEEP_EVENTS[ptr++] = -idx
    SWEEP_EVENTS[ptr++] = blue[blueOffset+iend]
    SWEEP_EVENTS[ptr++] = idx
  }

  //process events from left->right
  var n = ptr >>> 1
  isort(SWEEP_EVENTS, n)
  
  var redActive  = 0
  var blueActive = 0
  for(var i=0; i<n; ++i) {
    var e = SWEEP_EVENTS[2*i+1]|0
    if(e >= BLUE_FLAG) {
      //blue destroy event
      e = (e-BLUE_FLAG)|0
      sqPop(BLUE_SWEEP_QUEUE, BLUE_SWEEP_INDEX, blueActive--, e)
    } else if(e >= 0) {
      //red destroy event
      sqPop(RED_SWEEP_QUEUE, RED_SWEEP_INDEX, redActive--, e)
    } else if(e <= -BLUE_FLAG) {
      //blue create event
      e = (-e-BLUE_FLAG)|0
      for(var j=0; j<redActive; ++j) {
        var retval = visit(RED_SWEEP_QUEUE[j], e)
        if(retval !== void 0) {
          return retval
        }
      }
      sqPush(BLUE_SWEEP_QUEUE, BLUE_SWEEP_INDEX, blueActive++, e)
    } else {
      //red create event
      e = (-e-1)|0
      for(var j=0; j<blueActive; ++j) {
        var retval = visit(e, BLUE_SWEEP_QUEUE[j])
        if(retval !== void 0) {
          return retval
        }
      }
      sqPush(RED_SWEEP_QUEUE, RED_SWEEP_INDEX, redActive++, e)
    }
  }
}

//Complete sweep
function sweepComplete(d, visit, 
  redStart, redEnd, red, redIndex,
  blueStart, blueEnd, blue, blueIndex) {

  var ptr      = 0
  var elemSize = 2*d
  var istart   = d-1
  var iend     = elemSize-1

  for(var i=redStart; i<redEnd; ++i) {
    var idx = (redIndex[i]+1)<<1
    var redOffset = elemSize*i
    SWEEP_EVENTS[ptr++] = red[redOffset+istart]
    SWEEP_EVENTS[ptr++] = -idx
    SWEEP_EVENTS[ptr++] = red[redOffset+iend]
    SWEEP_EVENTS[ptr++] = idx
  }

  for(var i=blueStart; i<blueEnd; ++i) {
    var idx = (blueIndex[i]+1)<<1
    var blueOffset = elemSize*i
    SWEEP_EVENTS[ptr++] = blue[blueOffset+istart]
    SWEEP_EVENTS[ptr++] = (-idx)|1
    SWEEP_EVENTS[ptr++] = blue[blueOffset+iend]
    SWEEP_EVENTS[ptr++] = idx|1
  }

  //process events from left->right
  var n = ptr >>> 1
  isort(SWEEP_EVENTS, n)
  
  var redActive    = 0
  var blueActive   = 0
  var commonActive = 0
  for(var i=0; i<n; ++i) {
    var e     = SWEEP_EVENTS[2*i+1]|0
    var color = e&1
    if(i < n-1 && (e>>1) === (SWEEP_EVENTS[2*i+3]>>1)) {
      color = 2
      i += 1
    }
    
    if(e < 0) {
      //Create event
      var id = -(e>>1) - 1

      //Intersect with common
      for(var j=0; j<commonActive; ++j) {
        var retval = visit(COMMON_SWEEP_QUEUE[j], id)
        if(retval !== void 0) {
          return retval
        }
      }

      if(color !== 0) {
        //Intersect with red
        for(var j=0; j<redActive; ++j) {
          var retval = visit(RED_SWEEP_QUEUE[j], id)
          if(retval !== void 0) {
            return retval
          }
        }
      }

      if(color !== 1) {
        //Intersect with blue
        for(var j=0; j<blueActive; ++j) {
          var retval = visit(BLUE_SWEEP_QUEUE[j], id)
          if(retval !== void 0) {
            return retval
          }
        }
      }

      if(color === 0) {
        //Red
        sqPush(RED_SWEEP_QUEUE, RED_SWEEP_INDEX, redActive++, id)
      } else if(color === 1) {
        //Blue
        sqPush(BLUE_SWEEP_QUEUE, BLUE_SWEEP_INDEX, blueActive++, id)
      } else if(color === 2) {
        //Both
        sqPush(COMMON_SWEEP_QUEUE, COMMON_SWEEP_INDEX, commonActive++, id)
      }
    } else {
      //Destroy event
      var id = (e>>1) - 1
      if(color === 0) {
        //Red
        sqPop(RED_SWEEP_QUEUE, RED_SWEEP_INDEX, redActive--, id)
      } else if(color === 1) {
        //Blue
        sqPop(BLUE_SWEEP_QUEUE, BLUE_SWEEP_INDEX, blueActive--, id)
      } else if(color === 2) {
        //Both
        sqPop(COMMON_SWEEP_QUEUE, COMMON_SWEEP_INDEX, commonActive--, id)
      }
    }
  }
}

//Sweep and prune/scanline algorithm:
//  Scan along axis, detect intersections
//  Brute force all boxes along axis
function scanBipartite(
  d, axis, visit, flip,
  redStart,  redEnd, red, redIndex,
  blueStart, blueEnd, blue, blueIndex) {
  
  var ptr      = 0
  var elemSize = 2*d
  var istart   = axis
  var iend     = axis+d

  var redShift  = 1
  var blueShift = 1
  if(flip) {
    blueShift = BLUE_FLAG
  } else {
    redShift  = BLUE_FLAG
  }

  for(var i=redStart; i<redEnd; ++i) {
    var idx = i + redShift
    var redOffset = elemSize*i
    SWEEP_EVENTS[ptr++] = red[redOffset+istart]
    SWEEP_EVENTS[ptr++] = -idx
    SWEEP_EVENTS[ptr++] = red[redOffset+iend]
    SWEEP_EVENTS[ptr++] = idx
  }
  for(var i=blueStart; i<blueEnd; ++i) {
    var idx = i + blueShift
    var blueOffset = elemSize*i
    SWEEP_EVENTS[ptr++] = blue[blueOffset+istart]
    SWEEP_EVENTS[ptr++] = -idx
  }

  //process events from left->right
  var n = ptr >>> 1
  isort(SWEEP_EVENTS, n)
  
  var redActive    = 0
  for(var i=0; i<n; ++i) {
    var e = SWEEP_EVENTS[2*i+1]|0
    if(e < 0) {
      var idx   = -e
      var isRed = false
      if(idx >= BLUE_FLAG) {
        isRed = !flip
        idx -= BLUE_FLAG 
      } else {
        isRed = !!flip
        idx -= 1
      }
      if(isRed) {
        sqPush(RED_SWEEP_QUEUE, RED_SWEEP_INDEX, redActive++, idx)
      } else {
        var blueId  = blueIndex[idx]
        var bluePtr = elemSize * idx
        
        var b0 = blue[bluePtr+axis+1]
        var b1 = blue[bluePtr+axis+1+d]

red_loop:
        for(var j=0; j<redActive; ++j) {
          var oidx   = RED_SWEEP_QUEUE[j]
          var redPtr = elemSize * oidx

          if(b1 < red[redPtr+axis+1] || 
             red[redPtr+axis+1+d] < b0) {
            continue
          }

          for(var k=axis+2; k<d; ++k) {
            if(blue[bluePtr + k + d] < red[redPtr + k] || 
               red[redPtr + k + d] < blue[bluePtr + k]) {
              continue red_loop
            }
          }

          var redId  = redIndex[oidx]
          var retval
          if(flip) {
            retval = visit(blueId, redId)
          } else {
            retval = visit(redId, blueId)
          }
          if(retval !== void 0) {
            return retval 
          }
        }
      }
    } else {
      sqPop(RED_SWEEP_QUEUE, RED_SWEEP_INDEX, redActive--, e - redShift)
    }
  }
}

function scanComplete(
  d, axis, visit,
  redStart,  redEnd, red, redIndex,
  blueStart, blueEnd, blue, blueIndex) {

  var ptr      = 0
  var elemSize = 2*d
  var istart   = axis
  var iend     = axis+d

  for(var i=redStart; i<redEnd; ++i) {
    var idx = i + BLUE_FLAG
    var redOffset = elemSize*i
    SWEEP_EVENTS[ptr++] = red[redOffset+istart]
    SWEEP_EVENTS[ptr++] = -idx
    SWEEP_EVENTS[ptr++] = red[redOffset+iend]
    SWEEP_EVENTS[ptr++] = idx
  }
  for(var i=blueStart; i<blueEnd; ++i) {
    var idx = i + 1
    var blueOffset = elemSize*i
    SWEEP_EVENTS[ptr++] = blue[blueOffset+istart]
    SWEEP_EVENTS[ptr++] = -idx
  }

  //process events from left->right
  var n = ptr >>> 1
  isort(SWEEP_EVENTS, n)
  
  var redActive    = 0
  for(var i=0; i<n; ++i) {
    var e = SWEEP_EVENTS[2*i+1]|0
    if(e < 0) {
      var idx   = -e
      if(idx >= BLUE_FLAG) {
        RED_SWEEP_QUEUE[redActive++] = idx - BLUE_FLAG
      } else {
        idx -= 1
        var blueId  = blueIndex[idx]
        var bluePtr = elemSize * idx

        var b0 = blue[bluePtr+axis+1]
        var b1 = blue[bluePtr+axis+1+d]

red_loop:
        for(var j=0; j<redActive; ++j) {
          var oidx   = RED_SWEEP_QUEUE[j]
          var redId  = redIndex[oidx]

          if(redId === blueId) {
            break
          }

          var redPtr = elemSize * oidx
          if(b1 < red[redPtr+axis+1] || 
            red[redPtr+axis+1+d] < b0) {
            continue
          }
          for(var k=axis+2; k<d; ++k) {
            if(blue[bluePtr + k + d] < red[redPtr + k] || 
               red[redPtr + k + d]   < blue[bluePtr + k]) {
              continue red_loop
            }
          }

          var retval = visit(redId, blueId)
          if(retval !== void 0) {
            return retval 
          }
        }
      }
    } else {
      var idx = e - BLUE_FLAG
      for(var j=redActive-1; j>=0; --j) {
        if(RED_SWEEP_QUEUE[j] === idx) {
          for(var k=j+1; k<redActive; ++k) {
            RED_SWEEP_QUEUE[k-1] = RED_SWEEP_QUEUE[k]
          }
          break
        }
      }
      --redActive
    }
  }
}
},{"./sort":30,"bit-twiddle":22,"typedarray-pool":71}],32:[function(require,module,exports){
'use strict'

var monotoneTriangulate = require('./lib/monotone')
var makeIndex = require('./lib/triangulation')
var delaunayFlip = require('./lib/delaunay')
var filterTriangulation = require('./lib/filter')

module.exports = cdt2d

function canonicalizeEdge(e) {
  return [Math.min(e[0], e[1]), Math.max(e[0], e[1])]
}

function compareEdge(a, b) {
  return a[0]-b[0] || a[1]-b[1]
}

function canonicalizeEdges(edges) {
  return edges.map(canonicalizeEdge).sort(compareEdge)
}

function getDefault(options, property, dflt) {
  if(property in options) {
    return options[property]
  }
  return dflt
}

function cdt2d(points, edges, options) {

  if(!Array.isArray(edges)) {
    options = edges || {}
    edges = []
  } else {
    options = options || {}
    edges = edges || []
  }

  //Parse out options
  var delaunay = !!getDefault(options, 'delaunay', true)
  var interior = !!getDefault(options, 'interior', true)
  var exterior = !!getDefault(options, 'exterior', true)
  var infinity = !!getDefault(options, 'infinity', false)

  //Handle trivial case
  if((!interior && !exterior) || points.length === 0) {
    return []
  }

  //Construct initial triangulation
  var cells = monotoneTriangulate(points, edges)

  //If delaunay refinement needed, then improve quality by edge flipping
  if(delaunay || interior !== exterior || infinity) {

    //Index all of the cells to support fast neighborhood queries
    var triangulation = makeIndex(points.length, canonicalizeEdges(edges))
    for(var i=0; i<cells.length; ++i) {
      var f = cells[i]
      triangulation.addTriangle(f[0], f[1], f[2])
    }

    //Run edge flipping
    if(delaunay) {
      delaunayFlip(points, triangulation)
    }

    //Filter points
    if(!exterior) {
      return filterTriangulation(triangulation, -1)
    } else if(!interior) {
      return filterTriangulation(triangulation,  1, infinity)
    } else if(infinity) {
      return filterTriangulation(triangulation, 0, infinity)
    } else {
      return triangulation.cells()
    }
    
  } else {
    return cells
  }
}

},{"./lib/delaunay":33,"./lib/filter":34,"./lib/monotone":35,"./lib/triangulation":36}],33:[function(require,module,exports){
'use strict'

var inCircle = require('robust-in-sphere')[4]
var bsearch = require('binary-search-bounds')

module.exports = delaunayRefine

function testFlip(points, triangulation, stack, a, b, x) {
  var y = triangulation.opposite(a, b)

  //Test boundary edge
  if(y < 0) {
    return
  }

  //Swap edge if order flipped
  if(b < a) {
    var tmp = a
    a = b
    b = tmp
    tmp = x
    x = y
    y = tmp
  }

  //Test if edge is constrained
  if(triangulation.isConstraint(a, b)) {
    return
  }

  //Test if edge is delaunay
  if(inCircle(points[a], points[b], points[x], points[y]) < 0) {
    stack.push(a, b)
  }
}

//Assume edges are sorted lexicographically
function delaunayRefine(points, triangulation) {
  var stack = []

  var numPoints = points.length
  var stars = triangulation.stars
  for(var a=0; a<numPoints; ++a) {
    var star = stars[a]
    for(var j=1; j<star.length; j+=2) {
      var b = star[j]

      //If order is not consistent, then skip edge
      if(b < a) {
        continue
      }

      //Check if edge is constrained
      if(triangulation.isConstraint(a, b)) {
        continue
      }

      //Find opposite edge
      var x = star[j-1], y = -1
      for(var k=1; k<star.length; k+=2) {
        if(star[k-1] === b) {
          y = star[k]
          break
        }
      }

      //If this is a boundary edge, don't flip it
      if(y < 0) {
        continue
      }

      //If edge is in circle, flip it
      if(inCircle(points[a], points[b], points[x], points[y]) < 0) {
        stack.push(a, b)
      }
    }
  }

  while(stack.length > 0) {
    var b = stack.pop()
    var a = stack.pop()

    //Find opposite pairs
    var x = -1, y = -1
    var star = stars[a]
    for(var i=1; i<star.length; i+=2) {
      var s = star[i-1]
      var t = star[i]
      if(s === b) {
        y = t
      } else if(t === b) {
        x = s
      }
    }

    //If x/y are both valid then skip edge
    if(x < 0 || y < 0) {
      continue
    }

    //If edge is now delaunay, then don't flip it
    if(inCircle(points[a], points[b], points[x], points[y]) >= 0) {
      continue
    }

    //Flip the edge
    triangulation.flip(a, b)

    //Test flipping neighboring edges
    testFlip(points, triangulation, stack, x, a, y)
    testFlip(points, triangulation, stack, a, y, x)
    testFlip(points, triangulation, stack, y, b, x)
    testFlip(points, triangulation, stack, b, x, y)
  }
}

},{"binary-search-bounds":21,"robust-in-sphere":58}],34:[function(require,module,exports){
'use strict'

var bsearch = require('binary-search-bounds')

module.exports = classifyFaces

function FaceIndex(cells, neighbor, constraint, flags, active, next, boundary) {
  this.cells       = cells
  this.neighbor    = neighbor
  this.flags       = flags
  this.constraint  = constraint
  this.active      = active
  this.next        = next
  this.boundary    = boundary
}

var proto = FaceIndex.prototype

function compareCell(a, b) {
  return a[0] - b[0] ||
         a[1] - b[1] ||
         a[2] - b[2]
}

proto.locate = (function() {
  var key = [0,0,0]
  return function(a, b, c) {
    var x = a, y = b, z = c
    if(b < c) {
      if(b < a) {
        x = b
        y = c
        z = a
      }
    } else if(c < a) {
      x = c
      y = a
      z = b
    }
    if(x < 0) {
      return -1
    }
    key[0] = x
    key[1] = y
    key[2] = z
    return bsearch.eq(this.cells, key, compareCell)
  }
})()

function indexCells(triangulation, infinity) {
  //First get cells and canonicalize
  var cells = triangulation.cells()
  var nc = cells.length
  for(var i=0; i<nc; ++i) {
    var c = cells[i]
    var x = c[0], y = c[1], z = c[2]
    if(y < z) {
      if(y < x) {
        c[0] = y
        c[1] = z
        c[2] = x
      }
    } else if(z < x) {
      c[0] = z
      c[1] = x
      c[2] = y
    }
  }
  cells.sort(compareCell)

  //Initialize flag array
  var flags = new Array(nc)
  for(var i=0; i<flags.length; ++i) {
    flags[i] = 0
  }

  //Build neighbor index, initialize queues
  var active = []
  var next   = []
  var neighbor = new Array(3*nc)
  var constraint = new Array(3*nc)
  var boundary = null
  if(infinity) {
    boundary = []
  }
  var index = new FaceIndex(
    cells,
    neighbor,
    constraint,
    flags,
    active,
    next,
    boundary)
  for(var i=0; i<nc; ++i) {
    var c = cells[i]
    for(var j=0; j<3; ++j) {
      var x = c[j], y = c[(j+1)%3]
      var a = neighbor[3*i+j] = index.locate(y, x, triangulation.opposite(y, x))
      var b = constraint[3*i+j] = triangulation.isConstraint(x, y)
      if(a < 0) {
        if(b) {
          next.push(i)
        } else {
          active.push(i)
          flags[i] = 1
        }
        if(infinity) {
          boundary.push([y, x, -1])
        }
      }
    }
  }
  return index
}

function filterCells(cells, flags, target) {
  var ptr = 0
  for(var i=0; i<cells.length; ++i) {
    if(flags[i] === target) {
      cells[ptr++] = cells[i]
    }
  }
  cells.length = ptr
  return cells
}

function classifyFaces(triangulation, target, infinity) {
  var index = indexCells(triangulation, infinity)

  if(target === 0) {
    if(infinity) {
      return index.cells.concat(index.boundary)
    } else {
      return index.cells
    }
  }

  var side = 1
  var active = index.active
  var next = index.next
  var flags = index.flags
  var cells = index.cells
  var constraint = index.constraint
  var neighbor = index.neighbor

  while(active.length > 0 || next.length > 0) {
    while(active.length > 0) {
      var t = active.pop()
      if(flags[t] === -side) {
        continue
      }
      flags[t] = side
      var c = cells[t]
      for(var j=0; j<3; ++j) {
        var f = neighbor[3*t+j]
        if(f >= 0 && flags[f] === 0) {
          if(constraint[3*t+j]) {
            next.push(f)
          } else {
            active.push(f)
            flags[f] = side
          }
        }
      }
    }

    //Swap arrays and loop
    var tmp = next
    next = active
    active = tmp
    next.length = 0
    side = -side
  }

  var result = filterCells(cells, flags, target)
  if(infinity) {
    return result.concat(index.boundary)
  }
  return result
}

},{"binary-search-bounds":21}],35:[function(require,module,exports){
'use strict'

var bsearch = require('binary-search-bounds')
var orient = require('robust-orientation')[3]

var EVENT_POINT = 0
var EVENT_END   = 1
var EVENT_START = 2

module.exports = monotoneTriangulate

//A partial convex hull fragment, made of two unimonotone polygons
function PartialHull(a, b, idx, lowerIds, upperIds) {
  this.a = a
  this.b = b
  this.idx = idx
  this.lowerIds = lowerIds
  this.upperIds = upperIds
}

//An event in the sweep line procedure
function Event(a, b, type, idx) {
  this.a    = a
  this.b    = b
  this.type = type
  this.idx  = idx
}

//This is used to compare events for the sweep line procedure
// Points are:
//  1. sorted lexicographically
//  2. sorted by type  (point < end < start)
//  3. segments sorted by winding order
//  4. sorted by index
function compareEvent(a, b) {
  var d =
    (a.a[0] - b.a[0]) ||
    (a.a[1] - b.a[1]) ||
    (a.type - b.type)
  if(d) { return d }
  if(a.type !== EVENT_POINT) {
    d = orient(a.a, a.b, b.b)
    if(d) { return d }
  }
  return a.idx - b.idx
}

function testPoint(hull, p) {
  return orient(hull.a, hull.b, p)
}

function addPoint(cells, hulls, points, p, idx) {
  var lo = bsearch.lt(hulls, p, testPoint)
  var hi = bsearch.gt(hulls, p, testPoint)
  for(var i=lo; i<hi; ++i) {
    var hull = hulls[i]

    //Insert p into lower hull
    var lowerIds = hull.lowerIds
    var m = lowerIds.length
    while(m > 1 && orient(
        points[lowerIds[m-2]],
        points[lowerIds[m-1]],
        p) > 0) {
      cells.push(
        [lowerIds[m-1],
         lowerIds[m-2],
         idx])
      m -= 1
    }
    lowerIds.length = m
    lowerIds.push(idx)

    //Insert p into upper hull
    var upperIds = hull.upperIds
    var m = upperIds.length
    while(m > 1 && orient(
        points[upperIds[m-2]],
        points[upperIds[m-1]],
        p) < 0) {
      cells.push(
        [upperIds[m-2],
         upperIds[m-1],
         idx])
      m -= 1
    }
    upperIds.length = m
    upperIds.push(idx)
  }
}

function findSplit(hull, edge) {
  var d
  if(hull.a[0] < edge.a[0]) {
    d = orient(hull.a, hull.b, edge.a)
  } else {
    d = orient(edge.b, edge.a, hull.a)
  }
  if(d) { return d }
  if(edge.b[0] < hull.b[0]) {
    d = orient(hull.a, hull.b, edge.b)
  } else {
    d = orient(edge.b, edge.a, hull.b)
  }
  return d || hull.idx - edge.idx
}

function splitHulls(hulls, points, event) {
  var splitIdx = bsearch.le(hulls, event, findSplit)
  var hull = hulls[splitIdx]
  var upperIds = hull.upperIds
  var x = upperIds[upperIds.length-1]
  hull.upperIds = [x]
  hulls.splice(splitIdx+1, 0,
    new PartialHull(event.a, event.b, event.idx, [x], upperIds))
}


function mergeHulls(hulls, points, event) {
  //Swap pointers for merge search
  var tmp = event.a
  event.a = event.b
  event.b = tmp
  var mergeIdx = bsearch.eq(hulls, event, findSplit)
  var upper = hulls[mergeIdx]
  var lower = hulls[mergeIdx-1]
  lower.upperIds = upper.upperIds
  hulls.splice(mergeIdx, 1)
}


function monotoneTriangulate(points, edges) {

  var numPoints = points.length
  var numEdges = edges.length

  var events = []

  //Create point events
  for(var i=0; i<numPoints; ++i) {
    events.push(new Event(
      points[i],
      null,
      EVENT_POINT,
      i))
  }

  //Create edge events
  for(var i=0; i<numEdges; ++i) {
    var e = edges[i]
    var a = points[e[0]]
    var b = points[e[1]]
    if(a[0] < b[0]) {
      events.push(
        new Event(a, b, EVENT_START, i),
        new Event(b, a, EVENT_END, i))
    } else if(a[0] > b[0]) {
      events.push(
        new Event(b, a, EVENT_START, i),
        new Event(a, b, EVENT_END, i))
    }
  }

  //Sort events
  events.sort(compareEvent)

  //Initialize hull
  var minX = events[0].a[0] - (1 + Math.abs(events[0].a[0])) * Math.pow(2, -52)
  var hull = [ new PartialHull([minX, 1], [minX, 0], -1, [], [], [], []) ]

  //Process events in order
  var cells = []
  for(var i=0, numEvents=events.length; i<numEvents; ++i) {
    var event = events[i]
    var type = event.type
    if(type === EVENT_POINT) {
      addPoint(cells, hull, points, event.a, event.idx)
    } else if(type === EVENT_START) {
      splitHulls(hull, points, event)
    } else {
      mergeHulls(hull, points, event)
    }
  }

  //Return triangulation
  return cells
}

},{"binary-search-bounds":21,"robust-orientation":59}],36:[function(require,module,exports){
'use strict'

var bsearch = require('binary-search-bounds')

module.exports = createTriangulation

function Triangulation(stars, edges) {
  this.stars = stars
  this.edges = edges
}

var proto = Triangulation.prototype

function removePair(list, j, k) {
  for(var i=1, n=list.length; i<n; i+=2) {
    if(list[i-1] === j && list[i] === k) {
      list[i-1] = list[n-2]
      list[i] = list[n-1]
      list.length = n - 2
      return
    }
  }
}

proto.isConstraint = (function() {
  var e = [0,0]
  function compareLex(a, b) {
    return a[0] - b[0] || a[1] - b[1]
  }
  return function(i, j) {
    e[0] = Math.min(i,j)
    e[1] = Math.max(i,j)
    return bsearch.eq(this.edges, e, compareLex) >= 0
  }
})()

proto.removeTriangle = function(i, j, k) {
  var stars = this.stars
  removePair(stars[i], j, k)
  removePair(stars[j], k, i)
  removePair(stars[k], i, j)
}

proto.addTriangle = function(i, j, k) {
  var stars = this.stars
  stars[i].push(j, k)
  stars[j].push(k, i)
  stars[k].push(i, j)
}

proto.opposite = function(j, i) {
  var list = this.stars[i]
  for(var k=1, n=list.length; k<n; k+=2) {
    if(list[k] === j) {
      return list[k-1]
    }
  }
  return -1
}

proto.flip = function(i, j) {
  var a = this.opposite(i, j)
  var b = this.opposite(j, i)
  this.removeTriangle(i, j, a)
  this.removeTriangle(j, i, b)
  this.addTriangle(i, b, a)
  this.addTriangle(j, a, b)
}

proto.edges = function() {
  var stars = this.stars
  var result = []
  for(var i=0, n=stars.length; i<n; ++i) {
    var list = stars[i]
    for(var j=0, m=list.length; j<m; j+=2) {
      result.push([list[j], list[j+1]])
    }
  }
  return result
}

proto.cells = function() {
  var stars = this.stars
  var result = []
  for(var i=0, n=stars.length; i<n; ++i) {
    var list = stars[i]
    for(var j=0, m=list.length; j<m; j+=2) {
      var s = list[j]
      var t = list[j+1]
      if(i < Math.min(s, t)) {
        result.push([i, s, t])
      }
    }
  }
  return result
}

function createTriangulation(numVerts, edges) {
  var stars = new Array(numVerts)
  for(var i=0; i<numVerts; ++i) {
    stars[i] = []
  }
  return new Triangulation(stars, edges)
}

},{"binary-search-bounds":21}],37:[function(require,module,exports){
'use strict'

module.exports = cleanPSLG

var UnionFind = require('union-find')
var boxIntersect = require('box-intersect')
var segseg = require('robust-segment-intersect')
var rat = require('big-rat')
var ratCmp = require('big-rat/cmp')
var ratToFloat = require('big-rat/to-float')
var ratVec = require('rat-vec')
var nextafter = require('nextafter')

var solveIntersection = require('./lib/rat-seg-intersect')

// Bounds on a rational number when rounded to a float
function boundRat (r) {
  var f = ratToFloat(r)
  return [
    nextafter(f, -Infinity),
    nextafter(f, Infinity)
  ]
}

// Convert a list of edges in a pslg to bounding boxes
function boundEdges (points, edges) {
  var bounds = new Array(edges.length)
  for (var i = 0; i < edges.length; ++i) {
    var e = edges[i]
    var a = points[e[0]]
    var b = points[e[1]]
    bounds[i] = [
      nextafter(Math.min(a[0], b[0]), -Infinity),
      nextafter(Math.min(a[1], b[1]), -Infinity),
      nextafter(Math.max(a[0], b[0]), Infinity),
      nextafter(Math.max(a[1], b[1]), Infinity)
    ]
  }
  return bounds
}

// Convert a list of points into bounding boxes by duplicating coords
function boundPoints (points) {
  var bounds = new Array(points.length)
  for (var i = 0; i < points.length; ++i) {
    var p = points[i]
    bounds[i] = [
      nextafter(p[0], -Infinity),
      nextafter(p[1], -Infinity),
      nextafter(p[0], Infinity),
      nextafter(p[1], Infinity)
    ]
  }
  return bounds
}

// Find all pairs of crossing edges in a pslg (given edge bounds)
function getCrossings (points, edges, edgeBounds) {
  var result = []
  boxIntersect(edgeBounds, function (i, j) {
    var e = edges[i]
    var f = edges[j]
    if (e[0] === f[0] || e[0] === f[1] ||
      e[1] === f[0] || e[1] === f[1]) {
      return
    }
    var a = points[e[0]]
    var b = points[e[1]]
    var c = points[f[0]]
    var d = points[f[1]]
    if (segseg(a, b, c, d)) {
      result.push([i, j])
    }
  })
  return result
}

// Find all pairs of crossing vertices in a pslg (given edge/vert bounds)
function getTJunctions (points, edges, edgeBounds, vertBounds) {
  var result = []
  boxIntersect(edgeBounds, vertBounds, function (i, v) {
    var e = edges[i]
    if (e[0] === v || e[1] === v) {
      return
    }
    var p = points[v]
    var a = points[e[0]]
    var b = points[e[1]]
    if (segseg(a, b, p, p)) {
      result.push([i, v])
    }
  })
  return result
}

// Cut edges along crossings/tjunctions
function cutEdges (floatPoints, edges, crossings, junctions, useColor) {
  var i, e

  // Convert crossings into tjunctions by constructing rational points
  var ratPoints = floatPoints.map(function(p) {
      return [
          rat(p[0]),
          rat(p[1])
      ]
  })
  for (i = 0; i < crossings.length; ++i) {
    var crossing = crossings[i]
    e = crossing[0]
    var f = crossing[1]
    var ee = edges[e]
    var ef = edges[f]
    var x = solveIntersection(
      ratVec(floatPoints[ee[0]]),
      ratVec(floatPoints[ee[1]]),
      ratVec(floatPoints[ef[0]]),
      ratVec(floatPoints[ef[1]]))
    if (!x) {
      // Segments are parallel, should already be handled by t-junctions
      continue
    }
    var idx = floatPoints.length
    floatPoints.push([ratToFloat(x[0]), ratToFloat(x[1])])
    ratPoints.push(x)
    junctions.push([e, idx], [f, idx])
  }

  // Sort tjunctions
  junctions.sort(function (a, b) {
    if (a[0] !== b[0]) {
      return a[0] - b[0]
    }
    var u = ratPoints[a[1]]
    var v = ratPoints[b[1]]
    return ratCmp(u[0], v[0]) || ratCmp(u[1], v[1])
  })

  // Split edges along junctions
  for (i = junctions.length - 1; i >= 0; --i) {
    var junction = junctions[i]
    e = junction[0]

    var edge = edges[e]
    var s = edge[0]
    var t = edge[1]

    // Check if edge is not lexicographically sorted
    var a = floatPoints[s]
    var b = floatPoints[t]
    if (((a[0] - b[0]) || (a[1] - b[1])) < 0) {
      var tmp = s
      s = t
      t = tmp
    }

    // Split leading edge
    edge[0] = s
    var last = edge[1] = junction[1]

    // If we are grouping edges by color, remember to track data
    var color
    if (useColor) {
      color = edge[2]
    }

    // Split other edges
    while (i > 0 && junctions[i - 1][0] === e) {
      var junction = junctions[--i]
      var next = junction[1]
      if (useColor) {
        edges.push([last, next, color])
      } else {
        edges.push([last, next])
      }
      last = next
    }

    // Add final edge
    if (useColor) {
      edges.push([last, t, color])
    } else {
      edges.push([last, t])
    }
  }

  // Return constructed rational points
  return ratPoints
}

// Merge overlapping points
function dedupPoints (floatPoints, ratPoints, floatBounds) {
  var numPoints = ratPoints.length
  var uf = new UnionFind(numPoints)

  // Compute rational bounds
  var bounds = []
  for (var i = 0; i < ratPoints.length; ++i) {
    var p = ratPoints[i]
    var xb = boundRat(p[0])
    var yb = boundRat(p[1])
    bounds.push([
      nextafter(xb[0], -Infinity),
      nextafter(yb[0], -Infinity),
      nextafter(xb[1], Infinity),
      nextafter(yb[1], Infinity)
    ])
  }

  // Link all points with over lapping boxes
  boxIntersect(bounds, function (i, j) {
    uf.link(i, j)
  })

  // Do 1 pass over points to combine points in label sets
  var noDupes = true
  var labels = new Array(numPoints)
  for (var i = 0; i < numPoints; ++i) {
    var j = uf.find(i)
    if (j !== i) {
      // Clear no-dupes flag, zero out label
      noDupes = false
      // Make each point the top-left point from its cell
      floatPoints[j] = [
        Math.min(floatPoints[i][0], floatPoints[j][0]),
        Math.min(floatPoints[i][1], floatPoints[j][1])
      ]
    }
  }

  // If no duplicates, return null to signal termination
  if (noDupes) {
    return null
  }

  var ptr = 0
  for (var i = 0; i < numPoints; ++i) {
    var j = uf.find(i)
    if (j === i) {
      labels[i] = ptr
      floatPoints[ptr++] = floatPoints[i]
    } else {
      labels[i] = -1
    }
  }

  floatPoints.length = ptr

  // Do a second pass to fix up missing labels
  for (var i = 0; i < numPoints; ++i) {
    if (labels[i] < 0) {
      labels[i] = labels[uf.find(i)]
    }
  }

  // Return resulting union-find data structure
  return labels
}

function compareLex2 (a, b) { return (a[0] - b[0]) || (a[1] - b[1]) }
function compareLex3 (a, b) {
  var d = (a[0] - b[0]) || (a[1] - b[1])
  if (d) {
    return d
  }
  if (a[2] < b[2]) {
    return -1
  } else if (a[2] > b[2]) {
    return 1
  }
  return 0
}

// Remove duplicate edge labels
function dedupEdges (edges, labels, useColor) {
  if (edges.length === 0) {
    return
  }
  if (labels) {
    for (var i = 0; i < edges.length; ++i) {
      var e = edges[i]
      var a = labels[e[0]]
      var b = labels[e[1]]
      e[0] = Math.min(a, b)
      e[1] = Math.max(a, b)
    }
  } else {
    for (var i = 0; i < edges.length; ++i) {
      var e = edges[i]
      var a = e[0]
      var b = e[1]
      e[0] = Math.min(a, b)
      e[1] = Math.max(a, b)
    }
  }
  if (useColor) {
    edges.sort(compareLex3)
  } else {
    edges.sort(compareLex2)
  }
  var ptr = 1
  for (var i = 1; i < edges.length; ++i) {
    var prev = edges[i - 1]
    var next = edges[i]
    if (next[0] === prev[0] && next[1] === prev[1] &&
      (!useColor || next[2] === prev[2])) {
      continue
    }
    edges[ptr++] = next
  }
  edges.length = ptr
}

function preRound (points, edges, useColor) {
  var labels = dedupPoints(points, [], boundPoints(points))
  dedupEdges(edges, labels, useColor)
  return !!labels
}

// Repeat until convergence
function snapRound (points, edges, useColor) {
  // 1. find edge crossings
  var edgeBounds = boundEdges(points, edges)
  var crossings = getCrossings(points, edges, edgeBounds)

  // 2. find t-junctions
  var vertBounds = boundPoints(points)
  var tjunctions = getTJunctions(points, edges, edgeBounds, vertBounds)

  // 3. cut edges, construct rational points
  var ratPoints = cutEdges(points, edges, crossings, tjunctions, useColor)

  // 4. dedupe verts
  var labels = dedupPoints(points, ratPoints, vertBounds)

  // 5. dedupe edges
  dedupEdges(edges, labels, useColor)

  // 6. check termination
  if (!labels) {
    return (crossings.length > 0 || tjunctions.length > 0)
  }

  // More iterations necessary
  return true
}

// Main loop, runs PSLG clean up until completion
function cleanPSLG (points, edges, colors) {
  // If using colors, augment edges with color data
  var prevEdges
  if (colors) {
    prevEdges = edges
    var augEdges = new Array(edges.length)
    for (var i = 0; i < edges.length; ++i) {
      var e = edges[i]
      augEdges[i] = [e[0], e[1], colors[i]]
    }
    edges = augEdges
  }

  // First round: remove duplicate edges and points
  var modified = preRound(points, edges, !!colors)

  // Run snap rounding until convergence
  while (snapRound(points, edges, !!colors)) {
    modified = true
  }

  // Strip color tags
  if (!!colors && modified) {
    prevEdges.length = 0
    colors.length = 0
    for (var i = 0; i < edges.length; ++i) {
      var e = edges[i]
      prevEdges.push([e[0], e[1]])
      colors.push(e[2])
    }
  }

  return modified
}

},{"./lib/rat-seg-intersect":38,"big-rat":8,"big-rat/cmp":6,"big-rat/to-float":20,"box-intersect":25,"nextafter":43,"rat-vec":55,"robust-segment-intersect":61,"union-find":73}],38:[function(require,module,exports){
'use strict'

module.exports = solveIntersection

var ratMul = require('big-rat/mul')
var ratDiv = require('big-rat/div')
var ratSub = require('big-rat/sub')
var ratSign = require('big-rat/sign')
var rvSub = require('rat-vec/sub')
var rvAdd = require('rat-vec/add')
var rvMuls = require('rat-vec/muls')

function ratPerp (a, b) {
  return ratSub(ratMul(a[0], b[1]), ratMul(a[1], b[0]))
}

// Solve for intersection
//  x = a + t (b-a)
//  (x - c) ^ (d-c) = 0
//  (t * (b-a) + (a-c) ) ^ (d-c) = 0
//  t * (b-a)^(d-c) = (d-c)^(a-c)
//  t = (d-c)^(a-c) / (b-a)^(d-c)

function solveIntersection (a, b, c, d) {
  var ba = rvSub(b, a)
  var dc = rvSub(d, c)

  var baXdc = ratPerp(ba, dc)

  if (ratSign(baXdc) === 0) {
    return null
  }

  var ac = rvSub(a, c)
  var dcXac = ratPerp(dc, ac)

  var t = ratDiv(dcXac, baXdc)
  var s = rvMuls(ba, t)
  var r = rvAdd(a, s)

  return r
}

},{"big-rat/div":7,"big-rat/mul":17,"big-rat/sign":18,"big-rat/sub":19,"rat-vec/add":54,"rat-vec/muls":56,"rat-vec/sub":57}],39:[function(require,module,exports){
(function (Buffer){
var hasTypedArrays = false
if(typeof Float64Array !== "undefined") {
  var DOUBLE_VIEW = new Float64Array(1)
    , UINT_VIEW   = new Uint32Array(DOUBLE_VIEW.buffer)
  DOUBLE_VIEW[0] = 1.0
  hasTypedArrays = true
  if(UINT_VIEW[1] === 0x3ff00000) {
    //Use little endian
    module.exports = function doubleBitsLE(n) {
      DOUBLE_VIEW[0] = n
      return [ UINT_VIEW[0], UINT_VIEW[1] ]
    }
    function toDoubleLE(lo, hi) {
      UINT_VIEW[0] = lo
      UINT_VIEW[1] = hi
      return DOUBLE_VIEW[0]
    }
    module.exports.pack = toDoubleLE
    function lowUintLE(n) {
      DOUBLE_VIEW[0] = n
      return UINT_VIEW[0]
    }
    module.exports.lo = lowUintLE
    function highUintLE(n) {
      DOUBLE_VIEW[0] = n
      return UINT_VIEW[1]
    }
    module.exports.hi = highUintLE
  } else if(UINT_VIEW[0] === 0x3ff00000) {
    //Use big endian
    module.exports = function doubleBitsBE(n) {
      DOUBLE_VIEW[0] = n
      return [ UINT_VIEW[1], UINT_VIEW[0] ]
    }
    function toDoubleBE(lo, hi) {
      UINT_VIEW[1] = lo
      UINT_VIEW[0] = hi
      return DOUBLE_VIEW[0]
    }
    module.exports.pack = toDoubleBE
    function lowUintBE(n) {
      DOUBLE_VIEW[0] = n
      return UINT_VIEW[1]
    }
    module.exports.lo = lowUintBE
    function highUintBE(n) {
      DOUBLE_VIEW[0] = n
      return UINT_VIEW[0]
    }
    module.exports.hi = highUintBE
  } else {
    hasTypedArrays = false
  }
}
if(!hasTypedArrays) {
  var buffer = new Buffer(8)
  module.exports = function doubleBits(n) {
    buffer.writeDoubleLE(n, 0, true)
    return [ buffer.readUInt32LE(0, true), buffer.readUInt32LE(4, true) ]
  }
  function toDouble(lo, hi) {
    buffer.writeUInt32LE(lo, 0, true)
    buffer.writeUInt32LE(hi, 4, true)
    return buffer.readDoubleLE(0, true)
  }
  module.exports.pack = toDouble  
  function lowUint(n) {
    buffer.writeDoubleLE(n, 0, true)
    return buffer.readUInt32LE(0, true)
  }
  module.exports.lo = lowUint
  function highUint(n) {
    buffer.writeDoubleLE(n, 0, true)
    return buffer.readUInt32LE(4, true)
  }
  module.exports.hi = highUint
}

module.exports.sign = function(n) {
  return module.exports.hi(n) >>> 31
}

module.exports.exponent = function(n) {
  var b = module.exports.hi(n)
  return ((b<<1) >>> 21) - 1023
}

module.exports.fraction = function(n) {
  var lo = module.exports.lo(n)
  var hi = module.exports.hi(n)
  var b = hi & ((1<<20) - 1)
  if(hi & 0x7ff00000) {
    b += (1<<20)
  }
  return [lo, b]
}

module.exports.denormalized = function(n) {
  var hi = module.exports.hi(n)
  return !(hi & 0x7ff00000)
}
}).call(this,require("buffer").Buffer)
},{"buffer":78}],40:[function(require,module,exports){
"use strict"

function dupe_array(count, value, i) {
  var c = count[i]|0
  if(c <= 0) {
    return []
  }
  var result = new Array(c), j
  if(i === count.length-1) {
    for(j=0; j<c; ++j) {
      result[j] = value
    }
  } else {
    for(j=0; j<c; ++j) {
      result[j] = dupe_array(count, value, i+1)
    }
  }
  return result
}

function dupe_number(count, value) {
  var result, i
  result = new Array(count)
  for(i=0; i<count; ++i) {
    result[i] = value
  }
  return result
}

function dupe(count, value) {
  if(typeof value === "undefined") {
    value = 0
  }
  switch(typeof count) {
    case "number":
      if(count > 0) {
        return dupe_number(count|0, value)
      }
    break
    case "object":
      if(typeof (count.length) === "number") {
        return dupe_array(count, value, 0)
      }
    break
  }
  return []
}

module.exports = dupe
},{}],41:[function(require,module,exports){
var parseXml = require('xml-parse-from-string')

function extractSvgPath (svgDoc) {
  // concat all the <path> elements to form an SVG path string
  if (typeof svgDoc === 'string') {
    svgDoc = parseXml(svgDoc)
  }
  if (!svgDoc || typeof svgDoc.getElementsByTagName !== 'function') {
    throw new Error('could not get an XML document from the specified SVG contents')
  }

  var paths = Array.prototype.slice.call(svgDoc.getElementsByTagName('path'))
  return paths.reduce(function (prev, path) {
    var d = path.getAttribute('d') || ''
    return prev + ' ' + d.replace(/\s+/g, ' ').trim()
  }, '').trim()
}

module.exports = function () {
  throw new Error('use extract-svg-path/transform to inline SVG contents into your bundle')
}

module.exports.parse = extractSvgPath

//deprecated
module.exports.fromString = extractSvgPath

},{"xml-parse-from-string":76}],42:[function(require,module,exports){
module.exports = reindex

function reindex(array) {
  var pos = []
  var cel = []

  var i = 0
  var c = 0
  while (i < array.length) {
    cel.push([c++, c++, c++])
    pos.push([
        array[i++]
      , array[i++]
      , array[i++]
    ], [
        array[i++]
      , array[i++]
      , array[i++]
    ], [
        array[i++]
      , array[i++]
      , array[i++]
    ])
  }

  return {
      positions: pos
    , cells: cel
  }
}

},{}],43:[function(require,module,exports){
"use strict"

var doubleBits = require("double-bits")

var SMALLEST_DENORM = Math.pow(2, -1074)
var UINT_MAX = (-1)>>>0

module.exports = nextafter

function nextafter(x, y) {
  if(isNaN(x) || isNaN(y)) {
    return NaN
  }
  if(x === y) {
    return x
  }
  if(x === 0) {
    if(y < 0) {
      return -SMALLEST_DENORM
    } else {
      return SMALLEST_DENORM
    }
  }
  var hi = doubleBits.hi(x)
  var lo = doubleBits.lo(x)
  if((y > x) === (x > 0)) {
    if(lo === UINT_MAX) {
      hi += 1
      lo = 0
    } else {
      lo += 1
    }
  } else {
    if(lo === 0) {
      lo = UINT_MAX
      hi -= 1
    } else {
      lo -= 1
    }
  }
  return doubleBits.pack(lo, hi)
}
},{"double-bits":39}],44:[function(require,module,exports){
var getBounds = require('bound-points')
var unlerp = require('unlerp')

module.exports = normalizePathScale
function normalizePathScale (positions, bounds) {
  if (!Array.isArray(positions)) {
    throw new TypeError('must specify positions as first argument')
  }
  if (!Array.isArray(bounds)) {
    bounds = getBounds(positions)
  }

  var min = bounds[0]
  var max = bounds[1]

  var width = max[0] - min[0]
  var height = max[1] - min[1]

  var aspectX = width > height ? 1 : (height / width)
  var aspectY = width > height ? (width / height) : 1

  if (max[0] - min[0] === 0 || max[1] - min[1] === 0) {
    return positions // div by zero; leave positions unchanged
  }

  for (var i = 0; i < positions.length; i++) {
    var pos = positions[i]
    pos[0] = (unlerp(min[0], max[0], pos[0]) * 2 - 1) / aspectX
    pos[1] = (unlerp(min[1], max[1], pos[1]) * 2 - 1) / aspectY
  }
  return positions
}
},{"bound-points":24,"unlerp":74}],45:[function(require,module,exports){

var π = Math.PI
var _120 = radians(120)

module.exports = normalize

/**
 * describe `path` in terms of cubic bézier 
 * curves and move commands
 *
 * @param {Array} path
 * @return {Array}
 */

function normalize(path){
	// init state
	var prev
	var result = []
	var bezierX = 0
	var bezierY = 0
	var startX = 0
	var startY = 0
	var quadX = null
	var quadY = null
	var x = 0
	var y = 0

	for (var i = 0, len = path.length; i < len; i++) {
		var seg = path[i]
		var command = seg[0]
		switch (command) {
			case 'M':
				startX = seg[1]
				startY = seg[2]
				break
			case 'A':
				seg = arc(x, y,seg[1],seg[2],radians(seg[3]),seg[4],seg[5],seg[6],seg[7])
				// split multi part
				seg.unshift('C')
				if (seg.length > 7) {
					result.push(seg.splice(0, 7))
					seg.unshift('C')
				}
				break
			case 'S':
				// default control point
				var cx = x
				var cy = y
				if (prev == 'C' || prev == 'S') {
					cx += cx - bezierX // reflect the previous command's control
					cy += cy - bezierY // point relative to the current point
				}
				seg = ['C', cx, cy, seg[1], seg[2], seg[3], seg[4]]
				break
			case 'T':
				if (prev == 'Q' || prev == 'T') {
					quadX = x * 2 - quadX // as with 'S' reflect previous control point
					quadY = y * 2 - quadY
				} else {
					quadX = x
					quadY = y
				}
				seg = quadratic(x, y, quadX, quadY, seg[1], seg[2])
				break
			case 'Q':
				quadX = seg[1]
				quadY = seg[2]
				seg = quadratic(x, y, seg[1], seg[2], seg[3], seg[4])
				break
			case 'L':
				seg = line(x, y, seg[1], seg[2])
				break
			case 'H':
				seg = line(x, y, seg[1], y)
				break
			case 'V':
				seg = line(x, y, x, seg[1])
				break
			case 'Z':
				seg = line(x, y, startX, startY)
				break
		}

		// update state
		prev = command
		x = seg[seg.length - 2]
		y = seg[seg.length - 1]
		if (seg.length > 4) {
			bezierX = seg[seg.length - 4]
			bezierY = seg[seg.length - 3]
		} else {
			bezierX = x
			bezierY = y
		}
		result.push(seg)
	}

	return result
}

function line(x1, y1, x2, y2){
	return ['C', x1, y1, x2, y2, x2, y2]
}

function quadratic(x1, y1, cx, cy, x2, y2){
	return [
		'C',
		x1/3 + (2/3) * cx,
		y1/3 + (2/3) * cy,
		x2/3 + (2/3) * cx,
		y2/3 + (2/3) * cy,
		x2,
		y2
	]
}

// This function is ripped from 
// github.com/DmitryBaranovskiy/raphael/blob/4d97d4/raphael.js#L2216-L2304 
// which references w3.org/TR/SVG11/implnote.html#ArcImplementationNotes
// TODO: make it human readable

function arc(x1, y1, rx, ry, angle, large_arc_flag, sweep_flag, x2, y2, recursive) {
	if (!recursive) {
		var xy = rotate(x1, y1, -angle)
		x1 = xy.x
		y1 = xy.y
		xy = rotate(x2, y2, -angle)
		x2 = xy.x
		y2 = xy.y
		var x = (x1 - x2) / 2
		var y = (y1 - y2) / 2
		var h = (x * x) / (rx * rx) + (y * y) / (ry * ry)
		if (h > 1) {
			h = Math.sqrt(h)
			rx = h * rx
			ry = h * ry
		}
		var rx2 = rx * rx
		var ry2 = ry * ry
		var k = (large_arc_flag == sweep_flag ? -1 : 1)
			* Math.sqrt(Math.abs((rx2 * ry2 - rx2 * y * y - ry2 * x * x) / (rx2 * y * y + ry2 * x * x)))
		if (k == Infinity) k = 1 // neutralize
		var cx = k * rx * y / ry + (x1 + x2) / 2
		var cy = k * -ry * x / rx + (y1 + y2) / 2
		var f1 = Math.asin(((y1 - cy) / ry).toFixed(9))
		var f2 = Math.asin(((y2 - cy) / ry).toFixed(9))

		f1 = x1 < cx ? π - f1 : f1
		f2 = x2 < cx ? π - f2 : f2
		if (f1 < 0) f1 = π * 2 + f1
		if (f2 < 0) f2 = π * 2 + f2
		if (sweep_flag && f1 > f2) f1 = f1 - π * 2
		if (!sweep_flag && f2 > f1) f2 = f2 - π * 2
	} else {
		f1 = recursive[0]
		f2 = recursive[1]
		cx = recursive[2]
		cy = recursive[3]
	}
	// greater than 120 degrees requires multiple segments
	if (Math.abs(f2 - f1) > _120) {
		var f2old = f2
		var x2old = x2
		var y2old = y2
		f2 = f1 + _120 * (sweep_flag && f2 > f1 ? 1 : -1)
		x2 = cx + rx * Math.cos(f2)
		y2 = cy + ry * Math.sin(f2)
		var res = arc(x2, y2, rx, ry, angle, 0, sweep_flag, x2old, y2old, [f2, f2old, cx, cy])
	}
	var t = Math.tan((f2 - f1) / 4)
	var hx = 4 / 3 * rx * t
	var hy = 4 / 3 * ry * t
	var curve = [
		2 * x1 - (x1 + hx * Math.sin(f1)),
		2 * y1 - (y1 - hy * Math.cos(f1)),
		x2 + hx * Math.sin(f2),
		y2 - hy * Math.cos(f2),
		x2,
		y2
	]
	if (recursive) return curve
	if (res) curve = curve.concat(res)
	for (var i = 0; i < curve.length;) {
		var rot = rotate(curve[i], curve[i+1], angle)
		curve[i++] = rot.x
		curve[i++] = rot.y
	}
	return curve
}

function rotate(x, y, rad){
	return {
		x: x * Math.cos(rad) - y * Math.sin(rad),
		y: x * Math.sin(rad) + y * Math.cos(rad)
	}
}

function radians(degress){
	return degress * (π / 180)
}

},{}],46:[function(require,module,exports){
/*
object-assign
(c) Sindre Sorhus
@license MIT
*/

'use strict';
/* eslint-disable no-unused-vars */
var getOwnPropertySymbols = Object.getOwnPropertySymbols;
var hasOwnProperty = Object.prototype.hasOwnProperty;
var propIsEnumerable = Object.prototype.propertyIsEnumerable;

function toObject(val) {
	if (val === null || val === undefined) {
		throw new TypeError('Object.assign cannot be called with null or undefined');
	}

	return Object(val);
}

function shouldUseNative() {
	try {
		if (!Object.assign) {
			return false;
		}

		// Detect buggy property enumeration order in older V8 versions.

		// https://bugs.chromium.org/p/v8/issues/detail?id=4118
		var test1 = new String('abc');  // eslint-disable-line no-new-wrappers
		test1[5] = 'de';
		if (Object.getOwnPropertyNames(test1)[0] === '5') {
			return false;
		}

		// https://bugs.chromium.org/p/v8/issues/detail?id=3056
		var test2 = {};
		for (var i = 0; i < 10; i++) {
			test2['_' + String.fromCharCode(i)] = i;
		}
		var order2 = Object.getOwnPropertyNames(test2).map(function (n) {
			return test2[n];
		});
		if (order2.join('') !== '0123456789') {
			return false;
		}

		// https://bugs.chromium.org/p/v8/issues/detail?id=3056
		var test3 = {};
		'abcdefghijklmnopqrst'.split('').forEach(function (letter) {
			test3[letter] = letter;
		});
		if (Object.keys(Object.assign({}, test3)).join('') !==
				'abcdefghijklmnopqrst') {
			return false;
		}

		return true;
	} catch (err) {
		// We don't expect any of the above to throw, but better to be safe.
		return false;
	}
}

module.exports = shouldUseNative() ? Object.assign : function (target, source) {
	var from;
	var to = toObject(target);
	var symbols;

	for (var s = 1; s < arguments.length; s++) {
		from = Object(arguments[s]);

		for (var key in from) {
			if (hasOwnProperty.call(from, key)) {
				to[key] = from[key];
			}
		}

		if (getOwnPropertySymbols) {
			symbols = getOwnPropertySymbols(from);
			for (var i = 0; i < symbols.length; i++) {
				if (propIsEnumerable.call(from, symbols[i])) {
					to[symbols[i]] = from[symbols[i]];
				}
			}
		}
	}

	return to;
};

},{}],47:[function(require,module,exports){

module.exports = parse

/**
 * expected argument lengths
 * @type {Object}
 */

var length = {a: 7, c: 6, h: 1, l: 2, m: 2, q: 4, s: 4, t: 2, v: 1, z: 0}

/**
 * segment pattern
 * @type {RegExp}
 */

var segment = /([astvzqmhlc])([^astvzqmhlc]*)/ig

/**
 * parse an svg path data string. Generates an Array
 * of commands where each command is an Array of the
 * form `[command, arg1, arg2, ...]`
 *
 * @param {String} path
 * @return {Array}
 */

function parse(path) {
	var data = []
	path.replace(segment, function(_, command, args){
		var type = command.toLowerCase()
		args = parseValues(args)

		// overloaded moveTo
		if (type == 'm' && args.length > 2) {
			data.push([command].concat(args.splice(0, 2)))
			type = 'l'
			command = command == 'm' ? 'l' : 'L'
		}

		while (true) {
			if (args.length == length[type]) {
				args.unshift(command)
				return data.push(args)
			}
			if (args.length < length[type]) throw new Error('malformed path data')
			data.push([command].concat(args.splice(0, length[type])))
		}
	})
	return data
}

var number = /-?[0-9]*\.?[0-9]+(?:e[-+]?\d+)?/ig

function parseValues(args) {
	var numbers = args.match(number)
	return numbers ? numbers.map(Number) : []
}

},{}],48:[function(require,module,exports){
"use strict";

var attributeTypes = require('./prwm/attribute-types');

module.exports = {
    version: 1,
    Int: attributeTypes.Int,
    Float: attributeTypes.Float,
    isBigEndianPlatform: require('./utils/is-big-endian-platform'),
    encode: require('./prwm/encode'),
    decode: require('./prwm/decode')
};

},{"./prwm/attribute-types":49,"./prwm/decode":50,"./prwm/encode":51,"./utils/is-big-endian-platform":52}],49:[function(require,module,exports){
"use strict";

module.exports = {
    Float: 0,
    Int: 1
};

},{}],50:[function(require,module,exports){
"use strict";

var isBigEndianPlatform = require('../utils/is-big-endian-platform');

// match the values defined in the spec to the TypedArray types
var InvertedEncodingTypes = [
    null,
    Float32Array,
    null,
    Int8Array,
    Int16Array,
    null,
    Int32Array,
    Uint8Array,
    Uint16Array,
    null,
    Uint32Array
];

// define the method to use on a DataView, corresponding the TypedArray type
var getMethods = {
    Uint16Array: 'getUint16',
    Uint32Array: 'getUint32',
    Int16Array: 'getInt16',
    Int32Array: 'getInt32',
    Float32Array: 'getFloat32'
};

function copyFromBuffer (sourceArrayBuffer, viewType, position, length, fromBigEndian) {
    var bytesPerElement = viewType.BYTES_PER_ELEMENT,
        result;

    if (fromBigEndian === isBigEndianPlatform() || bytesPerElement === 1) {
        result = new viewType(sourceArrayBuffer, position, length);
    } else {
        var readView = new DataView(sourceArrayBuffer, position, length * bytesPerElement),
            getMethod = getMethods[viewType.name],
            littleEndian = !fromBigEndian;

        result = new viewType(length);

        for (var i = 0; i < length; i++) {
            result[i] = readView[getMethod](i * bytesPerElement, littleEndian);
        }
    }

    return result;
}

function decode (buffer) {
    var array = new Uint8Array(buffer),
        version = array[0],
        flags = array[1],
        indexedGeometry = !!(flags >> 7),
        indicesType = flags >> 6 & 0x01,
        bigEndian = (flags >> 5 & 0x01) === 1,
        attributesNumber = flags & 0x1F,
        valuesNumber = 0,
        indicesNumber = 0;

    if (bigEndian) {
        valuesNumber = (array[2] << 16) + (array[3] << 8) + array[4];
        indicesNumber = (array[5] << 16) + (array[6] << 8) + array[7];
    } else {
        valuesNumber = array[2] + (array[3] << 8) + (array[4] << 16);
        indicesNumber = array[5] + (array[6] << 8) + (array[7] << 16);
    }

    /** PRELIMINARY CHECKS **/

    if (version === 0) {
        throw new Error('PRWM decoder: Invalid format version: 0');
    } else if (version !== 1) {
        throw new Error('PRWM decoder: Unsupported format version: ' + version);
    }

    if (!indexedGeometry) {
        if (indicesType !== 0) {
            throw new Error('PRWM decoder: Indices type must be set to 0 for non-indexed geometries');
        } else if (indicesNumber !== 0) {
            throw new Error('PRWM decoder: Number of indices must be set to 0 for non-indexed geometries');
        }
    }

    /** PARSING **/

    var pos = 8;

    var attributes = {},
        attributeName,
        char,
        attributeNormalized,
        attributeType,
        cardinality,
        encodingType,
        arrayType,
        values,
        i;

    for (i = 0; i < attributesNumber; i++) {
        attributeName = '';

        while (pos < array.length) {
            char = array[pos];
            pos++;

            if (char === 0) {
                break;
            } else {
                attributeName += String.fromCharCode(char);
            }
        }

        flags = array[pos];

        attributeType = flags >> 7 & 0x01;
        attributeNormalized = !!(flags >> 6 & 0x01);
        cardinality = (flags >> 4 & 0x03) + 1;
        encodingType = flags & 0x0F;
        arrayType = InvertedEncodingTypes[encodingType];

        pos++;

        // padding to next multiple of 4
        pos = Math.ceil(pos / 4) * 4;

        values = copyFromBuffer(buffer, arrayType, pos, cardinality * valuesNumber, bigEndian);

        pos+= arrayType.BYTES_PER_ELEMENT * cardinality * valuesNumber;

        attributes[attributeName] = {
            type: attributeType,
            normalized: attributeNormalized,
            cardinality: cardinality,
            values: values
        };
    }

    pos = Math.ceil(pos / 4) * 4;

    var indices = null;

    if (indexedGeometry) {
        indices = copyFromBuffer(
            buffer,
            indicesType === 1 ? Uint32Array : Uint16Array,
            pos,
            indicesNumber,
            bigEndian
        );
    }

    return {
        version: version,
        bigEndian: bigEndian,
        attributes: attributes,
        indices: indices
    };
}

module.exports = decode;

},{"../utils/is-big-endian-platform":52}],51:[function(require,module,exports){
"use strict";

var isBigEndianPlatform = require('../utils/is-big-endian-platform'),
    attributeTypes = require('./attribute-types');

// match the TypedArray type with the value defined in the spec
var EncodingTypes = {
    Float32Array: 1,
    Int8Array: 3,
    Int16Array: 4,
    Int32Array: 6,
    Uint8Array: 7,
    Uint16Array: 8,
    Uint32Array: 10
};

// define the method to use on a DataView, corresponding the TypedArray type
var setMethods = {
    Uint16Array: 'setUint16',
    Uint32Array: 'setUint32',
    Int16Array: 'setInt16',
    Int32Array: 'setInt32',
    Float32Array: 'setFloat32'
};

function copyToBuffer (sourceTypedArray, destinationArrayBuffer, position, bigEndian) {
    var length = sourceTypedArray.length,
        bytesPerElement = sourceTypedArray.BYTES_PER_ELEMENT;

    var writeArray = new sourceTypedArray.constructor(destinationArrayBuffer, position, length);

    if (bigEndian === isBigEndianPlatform() || bytesPerElement === 1) {
        // desired endianness is the same as the platform, or the endianness doesn't matter (1 byte)
        writeArray.set(sourceTypedArray.subarray(0, length));
    } else {
        var writeView = new DataView(destinationArrayBuffer, position, length * bytesPerElement),
            setMethod = setMethods[sourceTypedArray.constructor.name],
            littleEndian = !bigEndian,
            i = 0;

        for (i = 0; i < length; i++) {
            writeView[setMethod](i * bytesPerElement, sourceTypedArray[i], littleEndian);
        }
    }

    return writeArray;
}

function encode (attributes, indices, bigEndian) {
    var attributeKeys = attributes ? Object.keys(attributes) : [],
        indexedGeometry = !!indices,
        i, j;

    /** PRELIMINARY CHECKS **/

    // this is not supposed to catch all the possible errors, only some of the gotchas

    if (attributeKeys.length === 0) {
        throw new Error('PRWM encoder: The model must have at least one attribute');
    }

    if (attributeKeys.length > 31) {
        throw new Error('PRWM encoder: The model can have at most 31 attributes');
    }

    for (i = 0; i < attributeKeys.length; i++) {
        if (!EncodingTypes.hasOwnProperty(attributes[attributeKeys[i]].values.constructor.name)) {
            throw new Error('PRWM encoder: Unsupported attribute values type: ' + attributes[attributeKeys[i]].values.constructor.name);
        }
    }

    if (indexedGeometry && indices.constructor.name !== 'Uint16Array' && indices.constructor.name !== 'Uint32Array') {
        throw new Error('PRWM encoder: The indices must be represented as an Uint16Array or an Uint32Array');
    }

    /** GET THE TYPE OF INDICES AS WELL AS THE NUMBER OF INDICES AND ATTRIBUTE VALUES **/

    var valuesNumber = attributes[attributeKeys[0]].values.length / attributes[attributeKeys[0]].cardinality | 0,
        indicesNumber = indexedGeometry ? indices.length : 0,
        indicesType = indexedGeometry && indices.constructor.name === 'Uint32Array' ? 1 : 0;

    /** GET THE FILE LENGTH **/

    var totalLength = 8,
        attributeKey,
        attribute,
        attributeType,
        attributeNormalized;

    for (i = 0; i < attributeKeys.length; i++) {
        attributeKey = attributeKeys[i];
        attribute = attributes[attributeKey];
        totalLength += attributeKey.length + 2; // NUL byte + flag byte + padding
        totalLength = Math.ceil(totalLength / 4) * 4; // padding
        totalLength += attribute.values.byteLength;
    }

    if (indexedGeometry) {
        totalLength = Math.ceil(totalLength / 4) * 4;
        totalLength += indices.byteLength;
    }

    /** INITIALIZE THE BUFFER */

    var buffer = new ArrayBuffer(totalLength),
        array = new Uint8Array(buffer);

    /** HEADER **/

    array[0] = 1;
    array[1] = (
        indexedGeometry << 7 |
        indicesType << 6 |
        (bigEndian ? 1 : 0) << 5 |
        attributeKeys.length & 0x1F
    );

    if (bigEndian) {
        array[2] = valuesNumber >> 16 & 0xFF;
        array[3] = valuesNumber >> 8 & 0xFF;
        array[4] = valuesNumber & 0xFF;

        array[5] = indicesNumber >> 16 & 0xFF;
        array[6] = indicesNumber >> 8 & 0xFF;
        array[7] = indicesNumber & 0xFF;
    } else {
        array[2] = valuesNumber & 0xFF;
        array[3] = valuesNumber >> 8 & 0xFF;
        array[4] = valuesNumber >> 16 & 0xFF;

        array[5] = indicesNumber & 0xFF;
        array[6] = indicesNumber >> 8 & 0xFF;
        array[7] = indicesNumber >> 16 & 0xFF;
    }


    var pos = 8;

    /** ATTRIBUTES **/

    for (i = 0; i < attributeKeys.length; i++) {
        attributeKey = attributeKeys[i];
        attribute = attributes[attributeKey];
        attributeType = typeof attribute.type === 'undefined' ? attributeTypes.Float : attribute.type;
        attributeNormalized = (!!attribute.normalized ? 1 : 0);

        /*** WRITE ATTRIBUTE HEADER ***/

        for (j = 0; j < attributeKey.length; j++, pos++) {
            array[pos] = (attributeKey.charCodeAt(j) & 0x7F) || 0x5F; // default to underscore
        }

        pos++;

        array[pos] = (
            attributeType << 7 |
            attributeNormalized << 6 |
            ((attribute.cardinality - 1) & 0x03) << 4 |
            EncodingTypes[attribute.values.constructor.name] & 0x0F
        );

        pos++;


        // padding to next multiple of 4
        pos = Math.ceil(pos / 4) * 4;

        /*** WRITE ATTRIBUTE VALUES ***/

        var attributesWriteArray = copyToBuffer(attribute.values, buffer, pos, bigEndian);

        pos += attributesWriteArray.byteLength;
    }

    /*** WRITE INDICES VALUES ***/

    if (indexedGeometry) {
        pos = Math.ceil(pos / 4) * 4;

        copyToBuffer(indices, buffer, pos, bigEndian);
    }

    return buffer;
}

module.exports = encode;

},{"../utils/is-big-endian-platform":52,"./attribute-types":49}],52:[function(require,module,exports){
"use strict";

var bigEndianPlatform = null;

/**
 * Check if the endianness of the platform is big-endian (most significant bit first)
 * @returns {boolean} True if big-endian, false if little-endian
 */
function isBigEndianPlatform () {
    if (bigEndianPlatform === null) {
        var buffer = new ArrayBuffer(2),
            uint8Array = new Uint8Array(buffer),
            uint16Array = new Uint16Array(buffer);

        uint8Array[0] = 0xAA; // set first byte
        uint8Array[1] = 0xBB; // set second byte
        bigEndianPlatform = (uint16Array[0] === 0xAABB);
    }

    return bigEndianPlatform;
}

module.exports = isBigEndianPlatform;

},{}],53:[function(require,module,exports){
'use strict';
module.exports = function (min, max) {
	if (max === undefined) {
		max = min;
		min = 0;
	}

	if (typeof min !== 'number' || typeof max !== 'number') {
		throw new TypeError('Expected all arguments to be numbers');
	}

	return Math.random() * (max - min) + min;
};

},{}],54:[function(require,module,exports){
'use strict'

var bnadd = require('big-rat/add')

module.exports = add

function add (a, b) {
  var n = a.length
  var r = new Array(n)
  for (var i=0; i<n; ++i) {
    r[i] = bnadd(a[i], b[i])
  }
  return r
}

},{"big-rat/add":5}],55:[function(require,module,exports){
'use strict'

module.exports = float2rat

var rat = require('big-rat')

function float2rat(v) {
  var result = new Array(v.length)
  for(var i=0; i<v.length; ++i) {
    result[i] = rat(v[i])
  }
  return result
}

},{"big-rat":8}],56:[function(require,module,exports){
'use strict'

var rat = require('big-rat')
var mul = require('big-rat/mul')

module.exports = muls

function muls(a, x) {
  var s = rat(x)
  var n = a.length
  var r = new Array(n)
  for(var i=0; i<n; ++i) {
    r[i] = mul(a[i], s)
  }
  return r
}

},{"big-rat":8,"big-rat/mul":17}],57:[function(require,module,exports){
'use strict'

var bnsub = require('big-rat/sub')

module.exports = sub

function sub(a, b) {
  var n = a.length
  var r = new Array(n)
    for(var i=0; i<n; ++i) {
    r[i] = bnsub(a[i], b[i])
  }
  return r
}

},{"big-rat/sub":19}],58:[function(require,module,exports){
"use strict"

var twoProduct = require("two-product")
var robustSum = require("robust-sum")
var robustDiff = require("robust-subtract")
var robustScale = require("robust-scale")

var NUM_EXPAND = 6

function cofactor(m, c) {
  var result = new Array(m.length-1)
  for(var i=1; i<m.length; ++i) {
    var r = result[i-1] = new Array(m.length-1)
    for(var j=0,k=0; j<m.length; ++j) {
      if(j === c) {
        continue
      }
      r[k++] = m[i][j]
    }
  }
  return result
}

function matrix(n) {
  var result = new Array(n)
  for(var i=0; i<n; ++i) {
    result[i] = new Array(n)
    for(var j=0; j<n; ++j) {
      result[i][j] = ["m", j, "[", (n-i-2), "]"].join("")
    }
  }
  return result
}

function generateSum(expr) {
  if(expr.length === 1) {
    return expr[0]
  } else if(expr.length === 2) {
    return ["sum(", expr[0], ",", expr[1], ")"].join("")
  } else {
    var m = expr.length>>1
    return ["sum(", generateSum(expr.slice(0, m)), ",", generateSum(expr.slice(m)), ")"].join("")
  }
}

function makeProduct(a, b) {
  if(a.charAt(0) === "m") {
    if(b.charAt(0) === "w") {
      var toks = a.split("[")
      return ["w", b.substr(1), "m", toks[0].substr(1)].join("")
    } else {
      return ["prod(", a, ",", b, ")"].join("")
    }
  } else {
    return makeProduct(b, a)
  }
}

function sign(s) {
  if(s & 1 !== 0) {
    return "-"
  }
  return ""
}

function determinant(m) {
  if(m.length === 2) {
    return [["diff(", makeProduct(m[0][0], m[1][1]), ",", makeProduct(m[1][0], m[0][1]), ")"].join("")]
  } else {
    var expr = []
    for(var i=0; i<m.length; ++i) {
      expr.push(["scale(", generateSum(determinant(cofactor(m, i))), ",", sign(i), m[0][i], ")"].join(""))
    }
    return expr
  }
}

function makeSquare(d, n) {
  var terms = []
  for(var i=0; i<n-2; ++i) {
    terms.push(["prod(m", d, "[", i, "],m", d, "[", i, "])"].join(""))
  }
  return generateSum(terms)
}

function orientation(n) {
  var pos = []
  var neg = []
  var m = matrix(n)
  for(var i=0; i<n; ++i) {
    m[0][i] = "1"
    m[n-1][i] = "w"+i
  } 
  for(var i=0; i<n; ++i) {
    if((i&1)===0) {
      pos.push.apply(pos,determinant(cofactor(m, i)))
    } else {
      neg.push.apply(neg,determinant(cofactor(m, i)))
    }
  }
  var posExpr = generateSum(pos)
  var negExpr = generateSum(neg)
  var funcName = "exactInSphere" + n
  var funcArgs = []
  for(var i=0; i<n; ++i) {
    funcArgs.push("m" + i)
  }
  var code = ["function ", funcName, "(", funcArgs.join(), "){"]
  for(var i=0; i<n; ++i) {
    code.push("var w",i,"=",makeSquare(i,n),";")
    for(var j=0; j<n; ++j) {
      if(j !== i) {
        code.push("var w",i,"m",j,"=scale(w",i,",m",j,"[0]);")
      }
    }
  }
  code.push("var p=", posExpr, ",n=", negExpr, ",d=diff(p,n);return d[d.length-1];}return ", funcName)
  var proc = new Function("sum", "diff", "prod", "scale", code.join(""))
  return proc(robustSum, robustDiff, twoProduct, robustScale)
}

function inSphere0() { return 0 }
function inSphere1() { return 0 }
function inSphere2() { return 0 }

var CACHED = [
  inSphere0,
  inSphere1,
  inSphere2
]

function slowInSphere(args) {
  var proc = CACHED[args.length]
  if(!proc) {
    proc = CACHED[args.length] = orientation(args.length)
  }
  return proc.apply(undefined, args)
}

function generateInSphereTest() {
  while(CACHED.length <= NUM_EXPAND) {
    CACHED.push(orientation(CACHED.length))
  }
  var args = []
  var procArgs = ["slow"]
  for(var i=0; i<=NUM_EXPAND; ++i) {
    args.push("a" + i)
    procArgs.push("o" + i)
  }
  var code = [
    "function testInSphere(", args.join(), "){switch(arguments.length){case 0:case 1:return 0;"
  ]
  for(var i=2; i<=NUM_EXPAND; ++i) {
    code.push("case ", i, ":return o", i, "(", args.slice(0, i).join(), ");")
  }
  code.push("}var s=new Array(arguments.length);for(var i=0;i<arguments.length;++i){s[i]=arguments[i]};return slow(s);}return testInSphere")
  procArgs.push(code.join(""))

  var proc = Function.apply(undefined, procArgs)

  module.exports = proc.apply(undefined, [slowInSphere].concat(CACHED))
  for(var i=0; i<=NUM_EXPAND; ++i) {
    module.exports[i] = CACHED[i]
  }
}

generateInSphereTest()
},{"robust-scale":60,"robust-subtract":62,"robust-sum":63,"two-product":69}],59:[function(require,module,exports){
"use strict"

var twoProduct = require("two-product")
var robustSum = require("robust-sum")
var robustScale = require("robust-scale")
var robustSubtract = require("robust-subtract")

var NUM_EXPAND = 5

var EPSILON     = 1.1102230246251565e-16
var ERRBOUND3   = (3.0 + 16.0 * EPSILON) * EPSILON
var ERRBOUND4   = (7.0 + 56.0 * EPSILON) * EPSILON

function cofactor(m, c) {
  var result = new Array(m.length-1)
  for(var i=1; i<m.length; ++i) {
    var r = result[i-1] = new Array(m.length-1)
    for(var j=0,k=0; j<m.length; ++j) {
      if(j === c) {
        continue
      }
      r[k++] = m[i][j]
    }
  }
  return result
}

function matrix(n) {
  var result = new Array(n)
  for(var i=0; i<n; ++i) {
    result[i] = new Array(n)
    for(var j=0; j<n; ++j) {
      result[i][j] = ["m", j, "[", (n-i-1), "]"].join("")
    }
  }
  return result
}

function sign(n) {
  if(n & 1) {
    return "-"
  }
  return ""
}

function generateSum(expr) {
  if(expr.length === 1) {
    return expr[0]
  } else if(expr.length === 2) {
    return ["sum(", expr[0], ",", expr[1], ")"].join("")
  } else {
    var m = expr.length>>1
    return ["sum(", generateSum(expr.slice(0, m)), ",", generateSum(expr.slice(m)), ")"].join("")
  }
}

function determinant(m) {
  if(m.length === 2) {
    return [["sum(prod(", m[0][0], ",", m[1][1], "),prod(-", m[0][1], ",", m[1][0], "))"].join("")]
  } else {
    var expr = []
    for(var i=0; i<m.length; ++i) {
      expr.push(["scale(", generateSum(determinant(cofactor(m, i))), ",", sign(i), m[0][i], ")"].join(""))
    }
    return expr
  }
}

function orientation(n) {
  var pos = []
  var neg = []
  var m = matrix(n)
  var args = []
  for(var i=0; i<n; ++i) {
    if((i&1)===0) {
      pos.push.apply(pos, determinant(cofactor(m, i)))
    } else {
      neg.push.apply(neg, determinant(cofactor(m, i)))
    }
    args.push("m" + i)
  }
  var posExpr = generateSum(pos)
  var negExpr = generateSum(neg)
  var funcName = "orientation" + n + "Exact"
  var code = ["function ", funcName, "(", args.join(), "){var p=", posExpr, ",n=", negExpr, ",d=sub(p,n);\
return d[d.length-1];};return ", funcName].join("")
  var proc = new Function("sum", "prod", "scale", "sub", code)
  return proc(robustSum, twoProduct, robustScale, robustSubtract)
}

var orientation3Exact = orientation(3)
var orientation4Exact = orientation(4)

var CACHED = [
  function orientation0() { return 0 },
  function orientation1() { return 0 },
  function orientation2(a, b) { 
    return b[0] - a[0]
  },
  function orientation3(a, b, c) {
    var l = (a[1] - c[1]) * (b[0] - c[0])
    var r = (a[0] - c[0]) * (b[1] - c[1])
    var det = l - r
    var s
    if(l > 0) {
      if(r <= 0) {
        return det
      } else {
        s = l + r
      }
    } else if(l < 0) {
      if(r >= 0) {
        return det
      } else {
        s = -(l + r)
      }
    } else {
      return det
    }
    var tol = ERRBOUND3 * s
    if(det >= tol || det <= -tol) {
      return det
    }
    return orientation3Exact(a, b, c)
  },
  function orientation4(a,b,c,d) {
    var adx = a[0] - d[0]
    var bdx = b[0] - d[0]
    var cdx = c[0] - d[0]
    var ady = a[1] - d[1]
    var bdy = b[1] - d[1]
    var cdy = c[1] - d[1]
    var adz = a[2] - d[2]
    var bdz = b[2] - d[2]
    var cdz = c[2] - d[2]
    var bdxcdy = bdx * cdy
    var cdxbdy = cdx * bdy
    var cdxady = cdx * ady
    var adxcdy = adx * cdy
    var adxbdy = adx * bdy
    var bdxady = bdx * ady
    var det = adz * (bdxcdy - cdxbdy) 
            + bdz * (cdxady - adxcdy)
            + cdz * (adxbdy - bdxady)
    var permanent = (Math.abs(bdxcdy) + Math.abs(cdxbdy)) * Math.abs(adz)
                  + (Math.abs(cdxady) + Math.abs(adxcdy)) * Math.abs(bdz)
                  + (Math.abs(adxbdy) + Math.abs(bdxady)) * Math.abs(cdz)
    var tol = ERRBOUND4 * permanent
    if ((det > tol) || (-det > tol)) {
      return det
    }
    return orientation4Exact(a,b,c,d)
  }
]

function slowOrient(args) {
  var proc = CACHED[args.length]
  if(!proc) {
    proc = CACHED[args.length] = orientation(args.length)
  }
  return proc.apply(undefined, args)
}

function generateOrientationProc() {
  while(CACHED.length <= NUM_EXPAND) {
    CACHED.push(orientation(CACHED.length))
  }
  var args = []
  var procArgs = ["slow"]
  for(var i=0; i<=NUM_EXPAND; ++i) {
    args.push("a" + i)
    procArgs.push("o" + i)
  }
  var code = [
    "function getOrientation(", args.join(), "){switch(arguments.length){case 0:case 1:return 0;"
  ]
  for(var i=2; i<=NUM_EXPAND; ++i) {
    code.push("case ", i, ":return o", i, "(", args.slice(0, i).join(), ");")
  }
  code.push("}var s=new Array(arguments.length);for(var i=0;i<arguments.length;++i){s[i]=arguments[i]};return slow(s);}return getOrientation")
  procArgs.push(code.join(""))

  var proc = Function.apply(undefined, procArgs)
  module.exports = proc.apply(undefined, [slowOrient].concat(CACHED))
  for(var i=0; i<=NUM_EXPAND; ++i) {
    module.exports[i] = CACHED[i]
  }
}

generateOrientationProc()
},{"robust-scale":60,"robust-subtract":62,"robust-sum":63,"two-product":69}],60:[function(require,module,exports){
"use strict"

var twoProduct = require("two-product")
var twoSum = require("two-sum")

module.exports = scaleLinearExpansion

function scaleLinearExpansion(e, scale) {
  var n = e.length
  if(n === 1) {
    var ts = twoProduct(e[0], scale)
    if(ts[0]) {
      return ts
    }
    return [ ts[1] ]
  }
  var g = new Array(2 * n)
  var q = [0.1, 0.1]
  var t = [0.1, 0.1]
  var count = 0
  twoProduct(e[0], scale, q)
  if(q[0]) {
    g[count++] = q[0]
  }
  for(var i=1; i<n; ++i) {
    twoProduct(e[i], scale, t)
    var pq = q[1]
    twoSum(pq, t[0], q)
    if(q[0]) {
      g[count++] = q[0]
    }
    var a = t[1]
    var b = q[1]
    var x = a + b
    var bv = x - a
    var y = b - bv
    q[1] = x
    if(y) {
      g[count++] = y
    }
  }
  if(q[1]) {
    g[count++] = q[1]
  }
  if(count === 0) {
    g[count++] = 0.0
  }
  g.length = count
  return g
}
},{"two-product":69,"two-sum":70}],61:[function(require,module,exports){
"use strict"

module.exports = segmentsIntersect

var orient = require("robust-orientation")[3]

function checkCollinear(a0, a1, b0, b1) {

  for(var d=0; d<2; ++d) {
    var x0 = a0[d]
    var y0 = a1[d]
    var l0 = Math.min(x0, y0)
    var h0 = Math.max(x0, y0)    

    var x1 = b0[d]
    var y1 = b1[d]
    var l1 = Math.min(x1, y1)
    var h1 = Math.max(x1, y1)    

    if(h1 < l0 || h0 < l1) {
      return false
    }
  }

  return true
}

function segmentsIntersect(a0, a1, b0, b1) {
  var x0 = orient(a0, b0, b1)
  var y0 = orient(a1, b0, b1)
  if((x0 > 0 && y0 > 0) || (x0 < 0 && y0 < 0)) {
    return false
  }

  var x1 = orient(b0, a0, a1)
  var y1 = orient(b1, a0, a1)
  if((x1 > 0 && y1 > 0) || (x1 < 0 && y1 < 0)) {
    return false
  }

  //Check for degenerate collinear case
  if(x0 === 0 && y0 === 0 && x1 === 0 && y1 === 0) {
    return checkCollinear(a0, a1, b0, b1)
  }

  return true
}
},{"robust-orientation":59}],62:[function(require,module,exports){
"use strict"

module.exports = robustSubtract

//Easy case: Add two scalars
function scalarScalar(a, b) {
  var x = a + b
  var bv = x - a
  var av = x - bv
  var br = b - bv
  var ar = a - av
  var y = ar + br
  if(y) {
    return [y, x]
  }
  return [x]
}

function robustSubtract(e, f) {
  var ne = e.length|0
  var nf = f.length|0
  if(ne === 1 && nf === 1) {
    return scalarScalar(e[0], -f[0])
  }
  var n = ne + nf
  var g = new Array(n)
  var count = 0
  var eptr = 0
  var fptr = 0
  var abs = Math.abs
  var ei = e[eptr]
  var ea = abs(ei)
  var fi = -f[fptr]
  var fa = abs(fi)
  var a, b
  if(ea < fa) {
    b = ei
    eptr += 1
    if(eptr < ne) {
      ei = e[eptr]
      ea = abs(ei)
    }
  } else {
    b = fi
    fptr += 1
    if(fptr < nf) {
      fi = -f[fptr]
      fa = abs(fi)
    }
  }
  if((eptr < ne && ea < fa) || (fptr >= nf)) {
    a = ei
    eptr += 1
    if(eptr < ne) {
      ei = e[eptr]
      ea = abs(ei)
    }
  } else {
    a = fi
    fptr += 1
    if(fptr < nf) {
      fi = -f[fptr]
      fa = abs(fi)
    }
  }
  var x = a + b
  var bv = x - a
  var y = b - bv
  var q0 = y
  var q1 = x
  var _x, _bv, _av, _br, _ar
  while(eptr < ne && fptr < nf) {
    if(ea < fa) {
      a = ei
      eptr += 1
      if(eptr < ne) {
        ei = e[eptr]
        ea = abs(ei)
      }
    } else {
      a = fi
      fptr += 1
      if(fptr < nf) {
        fi = -f[fptr]
        fa = abs(fi)
      }
    }
    b = q0
    x = a + b
    bv = x - a
    y = b - bv
    if(y) {
      g[count++] = y
    }
    _x = q1 + x
    _bv = _x - q1
    _av = _x - _bv
    _br = x - _bv
    _ar = q1 - _av
    q0 = _ar + _br
    q1 = _x
  }
  while(eptr < ne) {
    a = ei
    b = q0
    x = a + b
    bv = x - a
    y = b - bv
    if(y) {
      g[count++] = y
    }
    _x = q1 + x
    _bv = _x - q1
    _av = _x - _bv
    _br = x - _bv
    _ar = q1 - _av
    q0 = _ar + _br
    q1 = _x
    eptr += 1
    if(eptr < ne) {
      ei = e[eptr]
    }
  }
  while(fptr < nf) {
    a = fi
    b = q0
    x = a + b
    bv = x - a
    y = b - bv
    if(y) {
      g[count++] = y
    } 
    _x = q1 + x
    _bv = _x - q1
    _av = _x - _bv
    _br = x - _bv
    _ar = q1 - _av
    q0 = _ar + _br
    q1 = _x
    fptr += 1
    if(fptr < nf) {
      fi = -f[fptr]
    }
  }
  if(q0) {
    g[count++] = q0
  }
  if(q1) {
    g[count++] = q1
  }
  if(!count) {
    g[count++] = 0.0  
  }
  g.length = count
  return g
}
},{}],63:[function(require,module,exports){
"use strict"

module.exports = linearExpansionSum

//Easy case: Add two scalars
function scalarScalar(a, b) {
  var x = a + b
  var bv = x - a
  var av = x - bv
  var br = b - bv
  var ar = a - av
  var y = ar + br
  if(y) {
    return [y, x]
  }
  return [x]
}

function linearExpansionSum(e, f) {
  var ne = e.length|0
  var nf = f.length|0
  if(ne === 1 && nf === 1) {
    return scalarScalar(e[0], f[0])
  }
  var n = ne + nf
  var g = new Array(n)
  var count = 0
  var eptr = 0
  var fptr = 0
  var abs = Math.abs
  var ei = e[eptr]
  var ea = abs(ei)
  var fi = f[fptr]
  var fa = abs(fi)
  var a, b
  if(ea < fa) {
    b = ei
    eptr += 1
    if(eptr < ne) {
      ei = e[eptr]
      ea = abs(ei)
    }
  } else {
    b = fi
    fptr += 1
    if(fptr < nf) {
      fi = f[fptr]
      fa = abs(fi)
    }
  }
  if((eptr < ne && ea < fa) || (fptr >= nf)) {
    a = ei
    eptr += 1
    if(eptr < ne) {
      ei = e[eptr]
      ea = abs(ei)
    }
  } else {
    a = fi
    fptr += 1
    if(fptr < nf) {
      fi = f[fptr]
      fa = abs(fi)
    }
  }
  var x = a + b
  var bv = x - a
  var y = b - bv
  var q0 = y
  var q1 = x
  var _x, _bv, _av, _br, _ar
  while(eptr < ne && fptr < nf) {
    if(ea < fa) {
      a = ei
      eptr += 1
      if(eptr < ne) {
        ei = e[eptr]
        ea = abs(ei)
      }
    } else {
      a = fi
      fptr += 1
      if(fptr < nf) {
        fi = f[fptr]
        fa = abs(fi)
      }
    }
    b = q0
    x = a + b
    bv = x - a
    y = b - bv
    if(y) {
      g[count++] = y
    }
    _x = q1 + x
    _bv = _x - q1
    _av = _x - _bv
    _br = x - _bv
    _ar = q1 - _av
    q0 = _ar + _br
    q1 = _x
  }
  while(eptr < ne) {
    a = ei
    b = q0
    x = a + b
    bv = x - a
    y = b - bv
    if(y) {
      g[count++] = y
    }
    _x = q1 + x
    _bv = _x - q1
    _av = _x - _bv
    _br = x - _bv
    _ar = q1 - _av
    q0 = _ar + _br
    q1 = _x
    eptr += 1
    if(eptr < ne) {
      ei = e[eptr]
    }
  }
  while(fptr < nf) {
    a = fi
    b = q0
    x = a + b
    bv = x - a
    y = b - bv
    if(y) {
      g[count++] = y
    } 
    _x = q1 + x
    _bv = _x - q1
    _av = _x - _bv
    _br = x - _bv
    _ar = q1 - _av
    q0 = _ar + _br
    q1 = _x
    fptr += 1
    if(fptr < nf) {
      fi = f[fptr]
    }
  }
  if(q0) {
    g[count++] = q0
  }
  if(q1) {
    g[count++] = q1
  }
  if(!count) {
    g[count++] = 0.0  
  }
  g.length = count
  return g
}
},{}],64:[function(require,module,exports){
// square distance from a point to a segment
function getSqSegDist(p, p1, p2) {
    var x = p1[0],
        y = p1[1],
        dx = p2[0] - x,
        dy = p2[1] - y;

    if (dx !== 0 || dy !== 0) {

        var t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);

        if (t > 1) {
            x = p2[0];
            y = p2[1];

        } else if (t > 0) {
            x += dx * t;
            y += dy * t;
        }
    }

    dx = p[0] - x;
    dy = p[1] - y;

    return dx * dx + dy * dy;
}

function simplifyDPStep(points, first, last, sqTolerance, simplified) {
    var maxSqDist = sqTolerance,
        index;

    for (var i = first + 1; i < last; i++) {
        var sqDist = getSqSegDist(points[i], points[first], points[last]);

        if (sqDist > maxSqDist) {
            index = i;
            maxSqDist = sqDist;
        }
    }

    if (maxSqDist > sqTolerance) {
        if (index - first > 1) simplifyDPStep(points, first, index, sqTolerance, simplified);
        simplified.push(points[index]);
        if (last - index > 1) simplifyDPStep(points, index, last, sqTolerance, simplified);
    }
}

// simplification using Ramer-Douglas-Peucker algorithm
module.exports = function simplifyDouglasPeucker(points, tolerance) {
    if (points.length<=1)
        return points;
    tolerance = typeof tolerance === 'number' ? tolerance : 1;
    var sqTolerance = tolerance * tolerance;
    
    var last = points.length - 1;

    var simplified = [points[0]];
    simplifyDPStep(points, 0, last, sqTolerance, simplified);
    simplified.push(points[last]);

    return simplified;
}

},{}],65:[function(require,module,exports){
var simplifyRadialDist = require('./radial-distance')
var simplifyDouglasPeucker = require('./douglas-peucker')

//simplifies using both algorithms
module.exports = function simplify(points, tolerance) {
    points = simplifyRadialDist(points, tolerance);
    points = simplifyDouglasPeucker(points, tolerance);
    return points;
}

module.exports.radialDistance = simplifyRadialDist;
module.exports.douglasPeucker = simplifyDouglasPeucker;
},{"./douglas-peucker":64,"./radial-distance":66}],66:[function(require,module,exports){
function getSqDist(p1, p2) {
    var dx = p1[0] - p2[0],
        dy = p1[1] - p2[1];

    return dx * dx + dy * dy;
}

// basic distance-based simplification
module.exports = function simplifyRadialDist(points, tolerance) {
    if (points.length<=1)
        return points;
    tolerance = typeof tolerance === 'number' ? tolerance : 1;
    var sqTolerance = tolerance * tolerance;
    
    var prevPoint = points[0],
        newPoints = [prevPoint],
        point;

    for (var i = 1, len = points.length; i < len; i++) {
        point = points[i];

        if (getSqDist(point, prevPoint) > sqTolerance) {
            newPoints.push(point);
            prevPoint = point;
        }
    }

    if (prevPoint !== point) newPoints.push(point);

    return newPoints;
}
},{}],67:[function(require,module,exports){
var parseSVG = require('parse-svg-path')
var getContours = require('svg-path-contours')
var cdt2d = require('cdt2d')
var cleanPSLG = require('clean-pslg')
var getBounds = require('bound-points')
var normalize = require('normalize-path-scale')
var random = require('random-float')
var assign = require('object-assign')
var simplify = require('simplify-path')

module.exports = svgMesh3d
function svgMesh3d (svgPath, opt) {
  if (typeof svgPath !== 'string') {
    throw new TypeError('must provide a string as first parameter')
  }
  
  opt = assign({
    delaunay: true,
    clean: true,
    exterior: false,
    randomization: 0,
    simplify: 0,
    scale: 1
  }, opt)
  
  var i
  // parse string as a list of operations
  var svg = parseSVG(svgPath)
  
  // convert curves into discrete points
  var contours = getContours(svg, opt.scale)
  
  // optionally simplify the path for faster triangulation and/or aesthetics
  if (opt.simplify > 0 && typeof opt.simplify === 'number') {
    for (i = 0; i < contours.length; i++) {
      contours[i] = simplify(contours[i], opt.simplify)
    }
  }
  
  // prepare for triangulation
  var polyline = denestPolyline(contours)
  var positions = polyline.positions
  var bounds = getBounds(positions)

  // optionally add random points for aesthetics
  var randomization = opt.randomization
  if (typeof randomization === 'number' && randomization > 0) {
    addRandomPoints(positions, bounds, randomization)
  }
  
  var loops = polyline.edges
  var edges = []
  for (i = 0; i < loops.length; ++i) {
    var loop = loops[i]
    for (var j = 0; j < loop.length; ++j) {
      edges.push([loop[j], loop[(j + 1) % loop.length]])
    }
  }

  // this updates points/edges so that they now form a valid PSLG 
  if (opt.clean !== false) {
    cleanPSLG(positions, edges)
  }

  // triangulate mesh
  var cells = cdt2d(positions, edges, opt)

  // rescale to [-1 ... 1]
  if (opt.normalize !== false) {
    normalize(positions, bounds)
  }

  // convert to 3D representation and flip on Y axis for convenience w/ OpenGL
  to3D(positions)

  return {
    positions: positions,
    cells: cells
  }
}

function to3D (positions) {
  for (var i = 0; i < positions.length; i++) {
    var xy = positions[i]
    xy[1] *= -1
    xy[2] = xy[2] || 0
  }
}

function addRandomPoints (positions, bounds, count) {
  var min = bounds[0]
  var max = bounds[1]

  for (var i = 0; i < count; i++) {
    positions.push([ // random [ x, y ]
      random(min[0], max[0]),
      random(min[1], max[1])
    ])
  }
}

function denestPolyline (nested) {
  var positions = []
  var edges = []

  for (var i = 0; i < nested.length; i++) {
    var path = nested[i]
    var loop = []
    for (var j = 0; j < path.length; j++) {
      var pos = path[j]
      var idx = positions.indexOf(pos)
      if (idx === -1) {
        positions.push(pos)
        idx = positions.length - 1
      }
      loop.push(idx)
    }
    edges.push(loop)
  }
  return {
    positions: positions,
    edges: edges
  }
}

},{"bound-points":24,"cdt2d":32,"clean-pslg":37,"normalize-path-scale":44,"object-assign":46,"parse-svg-path":47,"random-float":53,"simplify-path":65,"svg-path-contours":68}],68:[function(require,module,exports){
var bezier = require('adaptive-bezier-curve')
var abs = require('abs-svg-path')
var norm = require('normalize-svg-path')
var copy = require('vec2-copy')

function set(out, x, y) {
    out[0] = x
    out[1] = y
    return out
}

var tmp1 = [0,0],
    tmp2 = [0,0],
    tmp3 = [0,0]

function bezierTo(points, scale, start, seg) {
    bezier(start, 
        set(tmp1, seg[1], seg[2]), 
        set(tmp2, seg[3], seg[4]),
        set(tmp3, seg[5], seg[6]), scale, points)
}

module.exports = function contours(svg, scale) {
    var paths = []

    var points = []
    var pen = [0, 0]
    norm(abs(svg)).forEach(function(segment, i, self) {
        if (segment[0] === 'M') {
            copy(pen, segment.slice(1))
            if (points.length>0) {
                paths.push(points)
                points = []
            }
        } else if (segment[0] === 'C') {
            bezierTo(points, scale, pen, segment)
            set(pen, segment[5], segment[6])
        } else {
            throw new Error('illegal type in SVG: '+segment[0])
        }
    })
    if (points.length>0)
        paths.push(points)
    return paths
}
},{"abs-svg-path":2,"adaptive-bezier-curve":4,"normalize-svg-path":45,"vec2-copy":75}],69:[function(require,module,exports){
"use strict"

module.exports = twoProduct

var SPLITTER = +(Math.pow(2, 27) + 1.0)

function twoProduct(a, b, result) {
  var x = a * b

  var c = SPLITTER * a
  var abig = c - a
  var ahi = c - abig
  var alo = a - ahi

  var d = SPLITTER * b
  var bbig = d - b
  var bhi = d - bbig
  var blo = b - bhi

  var err1 = x - (ahi * bhi)
  var err2 = err1 - (alo * bhi)
  var err3 = err2 - (ahi * blo)

  var y = alo * blo - err3

  if(result) {
    result[0] = y
    result[1] = x
    return result
  }

  return [ y, x ]
}
},{}],70:[function(require,module,exports){
"use strict"

module.exports = fastTwoSum

function fastTwoSum(a, b, result) {
	var x = a + b
	var bv = x - a
	var av = x - bv
	var br = b - bv
	var ar = a - av
	if(result) {
		result[0] = ar + br
		result[1] = x
		return result
	}
	return [ar+br, x]
}
},{}],71:[function(require,module,exports){
(function (global,Buffer){
'use strict'

var bits = require('bit-twiddle')
var dup = require('dup')

//Legacy pool support
if(!global.__TYPEDARRAY_POOL) {
  global.__TYPEDARRAY_POOL = {
      UINT8   : dup([32, 0])
    , UINT16  : dup([32, 0])
    , UINT32  : dup([32, 0])
    , INT8    : dup([32, 0])
    , INT16   : dup([32, 0])
    , INT32   : dup([32, 0])
    , FLOAT   : dup([32, 0])
    , DOUBLE  : dup([32, 0])
    , DATA    : dup([32, 0])
    , UINT8C  : dup([32, 0])
    , BUFFER  : dup([32, 0])
  }
}

var hasUint8C = (typeof Uint8ClampedArray) !== 'undefined'
var POOL = global.__TYPEDARRAY_POOL

//Upgrade pool
if(!POOL.UINT8C) {
  POOL.UINT8C = dup([32, 0])
}
if(!POOL.BUFFER) {
  POOL.BUFFER = dup([32, 0])
}

//New technique: Only allocate from ArrayBufferView and Buffer
var DATA    = POOL.DATA
  , BUFFER  = POOL.BUFFER

exports.free = function free(array) {
  if(Buffer.isBuffer(array)) {
    BUFFER[bits.log2(array.length)].push(array)
  } else {
    if(Object.prototype.toString.call(array) !== '[object ArrayBuffer]') {
      array = array.buffer
    }
    if(!array) {
      return
    }
    var n = array.length || array.byteLength
    var log_n = bits.log2(n)|0
    DATA[log_n].push(array)
  }
}

function freeArrayBuffer(buffer) {
  if(!buffer) {
    return
  }
  var n = buffer.length || buffer.byteLength
  var log_n = bits.log2(n)
  DATA[log_n].push(buffer)
}

function freeTypedArray(array) {
  freeArrayBuffer(array.buffer)
}

exports.freeUint8 =
exports.freeUint16 =
exports.freeUint32 =
exports.freeInt8 =
exports.freeInt16 =
exports.freeInt32 =
exports.freeFloat32 = 
exports.freeFloat =
exports.freeFloat64 = 
exports.freeDouble = 
exports.freeUint8Clamped = 
exports.freeDataView = freeTypedArray

exports.freeArrayBuffer = freeArrayBuffer

exports.freeBuffer = function freeBuffer(array) {
  BUFFER[bits.log2(array.length)].push(array)
}

exports.malloc = function malloc(n, dtype) {
  if(dtype === undefined || dtype === 'arraybuffer') {
    return mallocArrayBuffer(n)
  } else {
    switch(dtype) {
      case 'uint8':
        return mallocUint8(n)
      case 'uint16':
        return mallocUint16(n)
      case 'uint32':
        return mallocUint32(n)
      case 'int8':
        return mallocInt8(n)
      case 'int16':
        return mallocInt16(n)
      case 'int32':
        return mallocInt32(n)
      case 'float':
      case 'float32':
        return mallocFloat(n)
      case 'double':
      case 'float64':
        return mallocDouble(n)
      case 'uint8_clamped':
        return mallocUint8Clamped(n)
      case 'buffer':
        return mallocBuffer(n)
      case 'data':
      case 'dataview':
        return mallocDataView(n)

      default:
        return null
    }
  }
  return null
}

function mallocArrayBuffer(n) {
  var n = bits.nextPow2(n)
  var log_n = bits.log2(n)
  var d = DATA[log_n]
  if(d.length > 0) {
    return d.pop()
  }
  return new ArrayBuffer(n)
}
exports.mallocArrayBuffer = mallocArrayBuffer

function mallocUint8(n) {
  return new Uint8Array(mallocArrayBuffer(n), 0, n)
}
exports.mallocUint8 = mallocUint8

function mallocUint16(n) {
  return new Uint16Array(mallocArrayBuffer(2*n), 0, n)
}
exports.mallocUint16 = mallocUint16

function mallocUint32(n) {
  return new Uint32Array(mallocArrayBuffer(4*n), 0, n)
}
exports.mallocUint32 = mallocUint32

function mallocInt8(n) {
  return new Int8Array(mallocArrayBuffer(n), 0, n)
}
exports.mallocInt8 = mallocInt8

function mallocInt16(n) {
  return new Int16Array(mallocArrayBuffer(2*n), 0, n)
}
exports.mallocInt16 = mallocInt16

function mallocInt32(n) {
  return new Int32Array(mallocArrayBuffer(4*n), 0, n)
}
exports.mallocInt32 = mallocInt32

function mallocFloat(n) {
  return new Float32Array(mallocArrayBuffer(4*n), 0, n)
}
exports.mallocFloat32 = exports.mallocFloat = mallocFloat

function mallocDouble(n) {
  return new Float64Array(mallocArrayBuffer(8*n), 0, n)
}
exports.mallocFloat64 = exports.mallocDouble = mallocDouble

function mallocUint8Clamped(n) {
  if(hasUint8C) {
    return new Uint8ClampedArray(mallocArrayBuffer(n), 0, n)
  } else {
    return mallocUint8(n)
  }
}
exports.mallocUint8Clamped = mallocUint8Clamped

function mallocDataView(n) {
  return new DataView(mallocArrayBuffer(n), 0, n)
}
exports.mallocDataView = mallocDataView

function mallocBuffer(n) {
  n = bits.nextPow2(n)
  var log_n = bits.log2(n)
  var cache = BUFFER[log_n]
  if(cache.length > 0) {
    return cache.pop()
  }
  return new Buffer(n)
}
exports.mallocBuffer = mallocBuffer

exports.clearCache = function clearCache() {
  for(var i=0; i<32; ++i) {
    POOL.UINT8[i].length = 0
    POOL.UINT16[i].length = 0
    POOL.UINT32[i].length = 0
    POOL.INT8[i].length = 0
    POOL.INT16[i].length = 0
    POOL.INT32[i].length = 0
    POOL.FLOAT[i].length = 0
    POOL.DOUBLE[i].length = 0
    POOL.UINT8C[i].length = 0
    DATA[i].length = 0
    BUFFER[i].length = 0
  }
}
}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer)
},{"bit-twiddle":22,"buffer":78,"dup":40}],72:[function(require,module,exports){
module.exports = unindex

function unindex(positions, cells, out) {
  if (positions.positions && positions.cells) {
    out = cells
    cells = positions.cells
    positions = positions.positions
  }

  var dims = positions.length ? positions[0].length : 0
  var points = cells.length ? cells[0].length : 0

  out = out || new Float32Array(cells.length * points * dims)

  if (points === 3 && dims === 2) {
    for (var i = 0, n = 0, l = cells.length; i < l; i += 1) {
      var cell = cells[i]
      out[n++] = positions[cell[0]][0]
      out[n++] = positions[cell[0]][1]
      out[n++] = positions[cell[1]][0]
      out[n++] = positions[cell[1]][1]
      out[n++] = positions[cell[2]][0]
      out[n++] = positions[cell[2]][1]
    }
  } else
  if (points === 3 && dims === 3) {
    for (var i = 0, n = 0, l = cells.length; i < l; i += 1) {
      var cell = cells[i]
      out[n++] = positions[cell[0]][0]
      out[n++] = positions[cell[0]][1]
      out[n++] = positions[cell[0]][2]
      out[n++] = positions[cell[1]][0]
      out[n++] = positions[cell[1]][1]
      out[n++] = positions[cell[1]][2]
      out[n++] = positions[cell[2]][0]
      out[n++] = positions[cell[2]][1]
      out[n++] = positions[cell[2]][2]
    }
  } else {
    for (var i = 0, n = 0, l = cells.length; i < l; i += 1) {
      var cell = cells[i]
      for (var c = 0; c < cell.length; c++) {
        var C = cell[c]
        for (var k = 0; k < dims; k++) {
          out[n++] = positions[C][k]
        }
      }
    }
  }

  return out
}

},{}],73:[function(require,module,exports){
"use strict"; "use restrict";

module.exports = UnionFind;

function UnionFind(count) {
  this.roots = new Array(count);
  this.ranks = new Array(count);
  
  for(var i=0; i<count; ++i) {
    this.roots[i] = i;
    this.ranks[i] = 0;
  }
}

var proto = UnionFind.prototype

Object.defineProperty(proto, "length", {
  "get": function() {
    return this.roots.length
  }
})

proto.makeSet = function() {
  var n = this.roots.length;
  this.roots.push(n);
  this.ranks.push(0);
  return n;
}

proto.find = function(x) {
  var x0 = x
  var roots = this.roots;
  while(roots[x] !== x) {
    x = roots[x]
  }
  while(roots[x0] !== x) {
    var y = roots[x0]
    roots[x0] = x
    x0 = y
  }
  return x;
}

proto.link = function(x, y) {
  var xr = this.find(x)
    , yr = this.find(y);
  if(xr === yr) {
    return;
  }
  var ranks = this.ranks
    , roots = this.roots
    , xd    = ranks[xr]
    , yd    = ranks[yr];
  if(xd < yd) {
    roots[xr] = yr;
  } else if(yd < xd) {
    roots[yr] = xr;
  } else {
    roots[yr] = xr;
    ++ranks[xr];
  }
}
},{}],74:[function(require,module,exports){
module.exports = function range(min, max, value) {
  return (value - min) / (max - min)
}
},{}],75:[function(require,module,exports){
module.exports = function vec2Copy(out, a) {
    out[0] = a[0]
    out[1] = a[1]
    return out
}
},{}],76:[function(require,module,exports){
module.exports = (function xmlparser() {
  //common browsers
  if (typeof self.DOMParser !== 'undefined') {
    return function(str) {
      var parser = new self.DOMParser()
      return parser.parseFromString(str, 'application/xml')
    }
  } 

  //IE8 fallback
  if (typeof self.ActiveXObject !== 'undefined'
      && new self.ActiveXObject('Microsoft.XMLDOM')) {
    return function(str) {
      var xmlDoc = new self.ActiveXObject("Microsoft.XMLDOM")
      xmlDoc.async = "false"
      xmlDoc.loadXML(str)
      return xmlDoc
    }
  }

  //last resort fallback
  return function(str) {
    var div = document.createElement('div')
    div.innerHTML = str
    return div
  }
})()

},{}],77:[function(require,module,exports){

},{}],78:[function(require,module,exports){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */

var base64 = require('base64-js')
var ieee754 = require('ieee754')
var isArray = require('is-array')

exports.Buffer = Buffer
exports.SlowBuffer = Buffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192 // not used by this implementation

var kMaxLength = 0x3fffffff

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * Note:
 *
 * - Implementation must support adding new properties to `Uint8Array` instances.
 *   Firefox 4-29 lacked support, fixed in Firefox 30+.
 *   See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438.
 *
 *  - Chrome 9-10 is missing the `TypedArray.prototype.subarray` function.
 *
 *  - IE10 has a broken `TypedArray.prototype.subarray` function which returns arrays of
 *    incorrect length in some situations.
 *
 * We detect these buggy browsers and set `Buffer.TYPED_ARRAY_SUPPORT` to `false` so they will
 * get the Object implementation, which is slower but will work correctly.
 */
Buffer.TYPED_ARRAY_SUPPORT = (function () {
  try {
    var buf = new ArrayBuffer(0)
    var arr = new Uint8Array(buf)
    arr.foo = function () { return 42 }
    return 42 === arr.foo() && // typed array instances can be augmented
        typeof arr.subarray === 'function' && // chrome 9-10 lack `subarray`
        new Uint8Array(1).subarray(1, 1).byteLength === 0 // ie10 has broken `subarray`
  } catch (e) {
    return false
  }
})()

/**
 * Class: Buffer
 * =============
 *
 * The Buffer constructor returns instances of `Uint8Array` that are augmented
 * with function properties for all the node `Buffer` API functions. We use
 * `Uint8Array` so that square bracket notation works as expected -- it returns
 * a single octet.
 *
 * By augmenting the instances, we can avoid modifying the `Uint8Array`
 * prototype.
 */
function Buffer (subject, encoding, noZero) {
  if (!(this instanceof Buffer))
    return new Buffer(subject, encoding, noZero)

  var type = typeof subject

  // Find the length
  var length
  if (type === 'number')
    length = subject > 0 ? subject >>> 0 : 0
  else if (type === 'string') {
    if (encoding === 'base64')
      subject = base64clean(subject)
    length = Buffer.byteLength(subject, encoding)
  } else if (type === 'object' && subject !== null) { // assume object is array-like
    if (subject.type === 'Buffer' && isArray(subject.data))
      subject = subject.data
    length = +subject.length > 0 ? Math.floor(+subject.length) : 0
  } else
    throw new TypeError('must start with number, buffer, array or string')

  if (this.length > kMaxLength)
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
      'size: 0x' + kMaxLength.toString(16) + ' bytes')

  var buf
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    // Preferred: Return an augmented `Uint8Array` instance for best performance
    buf = Buffer._augment(new Uint8Array(length))
  } else {
    // Fallback: Return THIS instance of Buffer (created by `new`)
    buf = this
    buf.length = length
    buf._isBuffer = true
  }

  var i
  if (Buffer.TYPED_ARRAY_SUPPORT && typeof subject.byteLength === 'number') {
    // Speed optimization -- use set if we're copying from a typed array
    buf._set(subject)
  } else if (isArrayish(subject)) {
    // Treat array-ish objects as a byte array
    if (Buffer.isBuffer(subject)) {
      for (i = 0; i < length; i++)
        buf[i] = subject.readUInt8(i)
    } else {
      for (i = 0; i < length; i++)
        buf[i] = ((subject[i] % 256) + 256) % 256
    }
  } else if (type === 'string') {
    buf.write(subject, 0, encoding)
  } else if (type === 'number' && !Buffer.TYPED_ARRAY_SUPPORT && !noZero) {
    for (i = 0; i < length; i++) {
      buf[i] = 0
    }
  }

  return buf
}

Buffer.isBuffer = function (b) {
  return !!(b != null && b._isBuffer)
}

Buffer.compare = function (a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b))
    throw new TypeError('Arguments must be Buffers')

  var x = a.length
  var y = b.length
  for (var i = 0, len = Math.min(x, y); i < len && a[i] === b[i]; i++) {}
  if (i !== len) {
    x = a[i]
    y = b[i]
  }
  if (x < y) return -1
  if (y < x) return 1
  return 0
}

Buffer.isEncoding = function (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.concat = function (list, totalLength) {
  if (!isArray(list)) throw new TypeError('Usage: Buffer.concat(list[, length])')

  if (list.length === 0) {
    return new Buffer(0)
  } else if (list.length === 1) {
    return list[0]
  }

  var i
  if (totalLength === undefined) {
    totalLength = 0
    for (i = 0; i < list.length; i++) {
      totalLength += list[i].length
    }
  }

  var buf = new Buffer(totalLength)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var item = list[i]
    item.copy(buf, pos)
    pos += item.length
  }
  return buf
}

Buffer.byteLength = function (str, encoding) {
  var ret
  str = str + ''
  switch (encoding || 'utf8') {
    case 'ascii':
    case 'binary':
    case 'raw':
      ret = str.length
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = str.length * 2
      break
    case 'hex':
      ret = str.length >>> 1
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8ToBytes(str).length
      break
    case 'base64':
      ret = base64ToBytes(str).length
      break
    default:
      ret = str.length
  }
  return ret
}

// pre-set for values that may exist in the future
Buffer.prototype.length = undefined
Buffer.prototype.parent = undefined

// toString(encoding, start=0, end=buffer.length)
Buffer.prototype.toString = function (encoding, start, end) {
  var loweredCase = false

  start = start >>> 0
  end = end === undefined || end === Infinity ? this.length : end >>> 0

  if (!encoding) encoding = 'utf8'
  if (start < 0) start = 0
  if (end > this.length) end = this.length
  if (end <= start) return ''

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end)

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end)

      case 'ascii':
        return asciiSlice(this, start, end)

      case 'binary':
        return binarySlice(this, start, end)

      case 'base64':
        return base64Slice(this, start, end)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end)

      default:
        if (loweredCase)
          throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.equals = function (b) {
  if(!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.inspect = function () {
  var str = ''
  var max = exports.INSPECT_MAX_BYTES
  if (this.length > 0) {
    str = this.toString('hex', 0, max).match(/.{2}/g).join(' ')
    if (this.length > max)
      str += ' ... '
  }
  return '<Buffer ' + str + '>'
}

Buffer.prototype.compare = function (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  return Buffer.compare(this, b)
}

// `get` will be removed in Node 0.13+
Buffer.prototype.get = function (offset) {
  console.log('.get() is deprecated. Access using array indexes instead.')
  return this.readUInt8(offset)
}

// `set` will be removed in Node 0.13+
Buffer.prototype.set = function (v, offset) {
  console.log('.set() is deprecated. Access using array indexes instead.')
  return this.writeUInt8(v, offset)
}

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  if (strLen % 2 !== 0) throw new Error('Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var byte = parseInt(string.substr(i * 2, 2), 16)
    if (isNaN(byte)) throw new Error('Invalid hex string')
    buf[offset + i] = byte
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  var charsWritten = blitBuffer(utf8ToBytes(string), buf, offset, length)
  return charsWritten
}

function asciiWrite (buf, string, offset, length) {
  var charsWritten = blitBuffer(asciiToBytes(string), buf, offset, length)
  return charsWritten
}

function binaryWrite (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  var charsWritten = blitBuffer(base64ToBytes(string), buf, offset, length)
  return charsWritten
}

function utf16leWrite (buf, string, offset, length) {
  var charsWritten = blitBuffer(utf16leToBytes(string), buf, offset, length)
  return charsWritten
}

Buffer.prototype.write = function (string, offset, length, encoding) {
  // Support both (string, offset, length, encoding)
  // and the legacy (string, encoding, offset, length)
  if (isFinite(offset)) {
    if (!isFinite(length)) {
      encoding = length
      length = undefined
    }
  } else {  // legacy
    var swap = encoding
    encoding = offset
    offset = length
    length = swap
  }

  offset = Number(offset) || 0
  var remaining = this.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }
  encoding = String(encoding || 'utf8').toLowerCase()

  var ret
  switch (encoding) {
    case 'hex':
      ret = hexWrite(this, string, offset, length)
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8Write(this, string, offset, length)
      break
    case 'ascii':
      ret = asciiWrite(this, string, offset, length)
      break
    case 'binary':
      ret = binaryWrite(this, string, offset, length)
      break
    case 'base64':
      ret = base64Write(this, string, offset, length)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = utf16leWrite(this, string, offset, length)
      break
    default:
      throw new TypeError('Unknown encoding: ' + encoding)
  }
  return ret
}

Buffer.prototype.toJSON = function () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  var res = ''
  var tmp = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    if (buf[i] <= 0x7F) {
      res += decodeUtf8Char(tmp) + String.fromCharCode(buf[i])
      tmp = ''
    } else {
      tmp += '%' + buf[i].toString(16)
    }
  }

  return res + decodeUtf8Char(tmp)
}

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function binarySlice (buf, start, end) {
  return asciiSlice(buf, start, end)
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256)
  }
  return res
}

Buffer.prototype.slice = function (start, end) {
  var len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len;
    if (start < 0)
      start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0)
      end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start)
    end = start

  if (Buffer.TYPED_ARRAY_SUPPORT) {
    return Buffer._augment(this.subarray(start, end))
  } else {
    var sliceLen = end - start
    var newBuf = new Buffer(sliceLen, undefined, true)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
    return newBuf
  }
}

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0)
    throw new RangeError('offset is not uint')
  if (offset + ext > length)
    throw new RangeError('Trying to access beyond buffer length')
}

Buffer.prototype.readUInt8 = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 1, this.length)
  return this[offset]
}

Buffer.prototype.readUInt16LE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 2, this.length)
  return this[offset] | (this[offset + 1] << 8)
}

Buffer.prototype.readUInt16BE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 2, this.length)
  return (this[offset] << 8) | this[offset + 1]
}

Buffer.prototype.readUInt32LE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 4, this.length)

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
}

Buffer.prototype.readUInt32BE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 4, this.length)

  return (this[offset] * 0x1000000) +
      ((this[offset + 1] << 16) |
      (this[offset + 2] << 8) |
      this[offset + 3])
}

Buffer.prototype.readInt8 = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 1, this.length)
  if (!(this[offset] & 0x80))
    return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
}

Buffer.prototype.readInt16LE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 2, this.length)
  var val = this[offset] | (this[offset + 1] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt16BE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 2, this.length)
  var val = this[offset + 1] | (this[offset] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt32LE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 4, this.length)

  return (this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16) |
      (this[offset + 3] << 24)
}

Buffer.prototype.readInt32BE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 4, this.length)

  return (this[offset] << 24) |
      (this[offset + 1] << 16) |
      (this[offset + 2] << 8) |
      (this[offset + 3])
}

Buffer.prototype.readFloatLE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, true, 23, 4)
}

Buffer.prototype.readFloatBE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, false, 23, 4)
}

Buffer.prototype.readDoubleLE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, true, 52, 8)
}

Buffer.prototype.readDoubleBE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, false, 52, 8)
}

function checkInt (buf, value, offset, ext, max, min) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('buffer must be a Buffer instance')
  if (value > max || value < min) throw new TypeError('value is out of bounds')
  if (offset + ext > buf.length) throw new TypeError('index out of range')
}

Buffer.prototype.writeUInt8 = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 1, 0xff, 0)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  this[offset] = value
  return offset + 1
}

function objectWriteUInt16 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 2); i < j; i++) {
    buf[offset + i] = (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
      (littleEndian ? i : 1 - i) * 8
  }
}

Buffer.prototype.writeUInt16LE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = value
    this[offset + 1] = (value >>> 8)
  } else objectWriteUInt16(this, value, offset, true)
  return offset + 2
}

Buffer.prototype.writeUInt16BE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = value
  } else objectWriteUInt16(this, value, offset, false)
  return offset + 2
}

function objectWriteUInt32 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffffffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 4); i < j; i++) {
    buf[offset + i] = (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
}

Buffer.prototype.writeUInt32LE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset + 3] = (value >>> 24)
    this[offset + 2] = (value >>> 16)
    this[offset + 1] = (value >>> 8)
    this[offset] = value
  } else objectWriteUInt32(this, value, offset, true)
  return offset + 4
}

Buffer.prototype.writeUInt32BE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = value
  } else objectWriteUInt32(this, value, offset, false)
  return offset + 4
}

Buffer.prototype.writeInt8 = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 1, 0x7f, -0x80)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  if (value < 0) value = 0xff + value + 1
  this[offset] = value
  return offset + 1
}

Buffer.prototype.writeInt16LE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = value
    this[offset + 1] = (value >>> 8)
  } else objectWriteUInt16(this, value, offset, true)
  return offset + 2
}

Buffer.prototype.writeInt16BE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = value
  } else objectWriteUInt16(this, value, offset, false)
  return offset + 2
}

Buffer.prototype.writeInt32LE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = value
    this[offset + 1] = (value >>> 8)
    this[offset + 2] = (value >>> 16)
    this[offset + 3] = (value >>> 24)
  } else objectWriteUInt32(this, value, offset, true)
  return offset + 4
}

Buffer.prototype.writeInt32BE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (value < 0) value = 0xffffffff + value + 1
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = value
  } else objectWriteUInt32(this, value, offset, false)
  return offset + 4
}

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (value > max || value < min) throw new TypeError('value is out of bounds')
  if (offset + ext > buf.length) throw new TypeError('index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert)
    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38)
  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert)
    checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308)
  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function (target, target_start, start, end) {
  var source = this

  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (!target_start) target_start = 0

  // Copy 0 bytes; we're done
  if (end === start) return
  if (target.length === 0 || source.length === 0) return

  // Fatal error conditions
  if (end < start) throw new TypeError('sourceEnd < sourceStart')
  if (target_start < 0 || target_start >= target.length)
    throw new TypeError('targetStart out of bounds')
  if (start < 0 || start >= source.length) throw new TypeError('sourceStart out of bounds')
  if (end < 0 || end > source.length) throw new TypeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length)
    end = this.length
  if (target.length - target_start < end - start)
    end = target.length - target_start + start

  var len = end - start

  if (len < 1000 || !Buffer.TYPED_ARRAY_SUPPORT) {
    for (var i = 0; i < len; i++) {
      target[i + target_start] = this[i + start]
    }
  } else {
    target._set(this.subarray(start, start + len), target_start)
  }
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  if (end < start) throw new TypeError('end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  if (start < 0 || start >= this.length) throw new TypeError('start out of bounds')
  if (end < 0 || end > this.length) throw new TypeError('end out of bounds')

  var i
  if (typeof value === 'number') {
    for (i = start; i < end; i++) {
      this[i] = value
    }
  } else {
    var bytes = utf8ToBytes(value.toString())
    var len = bytes.length
    for (i = start; i < end; i++) {
      this[i] = bytes[i % len]
    }
  }

  return this
}

/**
 * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
 * Added in Node 0.12. Only available in browsers that support ArrayBuffer.
 */
Buffer.prototype.toArrayBuffer = function () {
  if (typeof Uint8Array !== 'undefined') {
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      return (new Buffer(this)).buffer
    } else {
      var buf = new Uint8Array(this.length)
      for (var i = 0, len = buf.length; i < len; i += 1) {
        buf[i] = this[i]
      }
      return buf.buffer
    }
  } else {
    throw new TypeError('Buffer.toArrayBuffer not supported in this browser')
  }
}

// HELPER FUNCTIONS
// ================

var BP = Buffer.prototype

/**
 * Augment a Uint8Array *instance* (not the Uint8Array class!) with Buffer methods
 */
Buffer._augment = function (arr) {
  arr.constructor = Buffer
  arr._isBuffer = true

  // save reference to original Uint8Array get/set methods before overwriting
  arr._get = arr.get
  arr._set = arr.set

  // deprecated, will be removed in node 0.13+
  arr.get = BP.get
  arr.set = BP.set

  arr.write = BP.write
  arr.toString = BP.toString
  arr.toLocaleString = BP.toString
  arr.toJSON = BP.toJSON
  arr.equals = BP.equals
  arr.compare = BP.compare
  arr.copy = BP.copy
  arr.slice = BP.slice
  arr.readUInt8 = BP.readUInt8
  arr.readUInt16LE = BP.readUInt16LE
  arr.readUInt16BE = BP.readUInt16BE
  arr.readUInt32LE = BP.readUInt32LE
  arr.readUInt32BE = BP.readUInt32BE
  arr.readInt8 = BP.readInt8
  arr.readInt16LE = BP.readInt16LE
  arr.readInt16BE = BP.readInt16BE
  arr.readInt32LE = BP.readInt32LE
  arr.readInt32BE = BP.readInt32BE
  arr.readFloatLE = BP.readFloatLE
  arr.readFloatBE = BP.readFloatBE
  arr.readDoubleLE = BP.readDoubleLE
  arr.readDoubleBE = BP.readDoubleBE
  arr.writeUInt8 = BP.writeUInt8
  arr.writeUInt16LE = BP.writeUInt16LE
  arr.writeUInt16BE = BP.writeUInt16BE
  arr.writeUInt32LE = BP.writeUInt32LE
  arr.writeUInt32BE = BP.writeUInt32BE
  arr.writeInt8 = BP.writeInt8
  arr.writeInt16LE = BP.writeInt16LE
  arr.writeInt16BE = BP.writeInt16BE
  arr.writeInt32LE = BP.writeInt32LE
  arr.writeInt32BE = BP.writeInt32BE
  arr.writeFloatLE = BP.writeFloatLE
  arr.writeFloatBE = BP.writeFloatBE
  arr.writeDoubleLE = BP.writeDoubleLE
  arr.writeDoubleBE = BP.writeDoubleBE
  arr.fill = BP.fill
  arr.inspect = BP.inspect
  arr.toArrayBuffer = BP.toArrayBuffer

  return arr
}

var INVALID_BASE64_RE = /[^+\/0-9A-z]/g

function base64clean (str) {
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = stringtrim(str).replace(INVALID_BASE64_RE, '')
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '='
  }
  return str
}

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

function isArrayish (subject) {
  return isArray(subject) || Buffer.isBuffer(subject) ||
      subject && typeof subject === 'object' &&
      typeof subject.length === 'number'
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    var b = str.charCodeAt(i)
    if (b <= 0x7F) {
      byteArray.push(b)
    } else {
      var start = i
      if (b >= 0xD800 && b <= 0xDFFF) i++
      var h = encodeURIComponent(str.slice(start, i+1)).substr(1).split('%')
      for (var j = 0; j < h.length; j++) {
        byteArray.push(parseInt(h[j], 16))
      }
    }
  }
  return byteArray
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(str)
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length))
      break
    dst[i + offset] = src[i]
  }
  return i
}

function decodeUtf8Char (str) {
  try {
    return decodeURIComponent(str)
  } catch (err) {
    return String.fromCharCode(0xFFFD) // UTF 8 invalid char
  }
}

},{"base64-js":79,"ieee754":80,"is-array":81}],79:[function(require,module,exports){
var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

;(function (exports) {
	'use strict';

  var Arr = (typeof Uint8Array !== 'undefined')
    ? Uint8Array
    : Array

	var PLUS   = '+'.charCodeAt(0)
	var SLASH  = '/'.charCodeAt(0)
	var NUMBER = '0'.charCodeAt(0)
	var LOWER  = 'a'.charCodeAt(0)
	var UPPER  = 'A'.charCodeAt(0)

	function decode (elt) {
		var code = elt.charCodeAt(0)
		if (code === PLUS)
			return 62 // '+'
		if (code === SLASH)
			return 63 // '/'
		if (code < NUMBER)
			return -1 //no match
		if (code < NUMBER + 10)
			return code - NUMBER + 26 + 26
		if (code < UPPER + 26)
			return code - UPPER
		if (code < LOWER + 26)
			return code - LOWER + 26
	}

	function b64ToByteArray (b64) {
		var i, j, l, tmp, placeHolders, arr

		if (b64.length % 4 > 0) {
			throw new Error('Invalid string. Length must be a multiple of 4')
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		var len = b64.length
		placeHolders = '=' === b64.charAt(len - 2) ? 2 : '=' === b64.charAt(len - 1) ? 1 : 0

		// base64 is 4/3 + up to two characters of the original data
		arr = new Arr(b64.length * 3 / 4 - placeHolders)

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length

		var L = 0

		function push (v) {
			arr[L++] = v
		}

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (decode(b64.charAt(i)) << 18) | (decode(b64.charAt(i + 1)) << 12) | (decode(b64.charAt(i + 2)) << 6) | decode(b64.charAt(i + 3))
			push((tmp & 0xFF0000) >> 16)
			push((tmp & 0xFF00) >> 8)
			push(tmp & 0xFF)
		}

		if (placeHolders === 2) {
			tmp = (decode(b64.charAt(i)) << 2) | (decode(b64.charAt(i + 1)) >> 4)
			push(tmp & 0xFF)
		} else if (placeHolders === 1) {
			tmp = (decode(b64.charAt(i)) << 10) | (decode(b64.charAt(i + 1)) << 4) | (decode(b64.charAt(i + 2)) >> 2)
			push((tmp >> 8) & 0xFF)
			push(tmp & 0xFF)
		}

		return arr
	}

	function uint8ToBase64 (uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length

		function encode (num) {
			return lookup.charAt(num)
		}

		function tripletToBase64 (num) {
			return encode(num >> 18 & 0x3F) + encode(num >> 12 & 0x3F) + encode(num >> 6 & 0x3F) + encode(num & 0x3F)
		}

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
			output += tripletToBase64(temp)
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1]
				output += encode(temp >> 2)
				output += encode((temp << 4) & 0x3F)
				output += '=='
				break
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1])
				output += encode(temp >> 10)
				output += encode((temp >> 4) & 0x3F)
				output += encode((temp << 2) & 0x3F)
				output += '='
				break
		}

		return output
	}

	exports.toByteArray = b64ToByteArray
	exports.fromByteArray = uint8ToBase64
}(typeof exports === 'undefined' ? (this.base64js = {}) : exports))

},{}],80:[function(require,module,exports){
exports.read = function(buffer, offset, isLE, mLen, nBytes) {
  var e, m,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      nBits = -7,
      i = isLE ? (nBytes - 1) : 0,
      d = isLE ? -1 : 1,
      s = buffer[offset + i];

  i += d;

  e = s & ((1 << (-nBits)) - 1);
  s >>= (-nBits);
  nBits += eLen;
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8);

  m = e & ((1 << (-nBits)) - 1);
  e >>= (-nBits);
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8);

  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity);
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
};

exports.write = function(buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0),
      i = isLE ? 0 : (nBytes - 1),
      d = isLE ? 1 : -1,
      s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

  value = Math.abs(value);

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }

    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8);

  e = (e << mLen) | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8);

  buffer[offset + i - d] |= s * 128;
};

},{}],81:[function(require,module,exports){

/**
 * isArray
 */

var isArray = Array.isArray;

/**
 * toString
 */

var str = Object.prototype.toString;

/**
 * Whether or not the given `val`
 * is an array.
 *
 * example:
 *
 *        isArray([]);
 *        // > true
 *        isArray(arguments);
 *        // > false
 *        isArray('');
 *        // > false
 *
 * @param {mixed} val
 * @return {bool}
 */

module.exports = isArray || function (val) {
  return !! val && '[object Array]' == str.call(val);
};

},{}]},{},[1])(1)
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uL3Vzci9sb2NhbC9saWIvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsImluZGV4LmpzIiwibm9kZV9tb2R1bGVzL2Ficy1zdmctcGF0aC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9hZGFwdGl2ZS1iZXppZXItY3VydmUvZnVuY3Rpb24uanMiLCJub2RlX21vZHVsZXMvYWRhcHRpdmUtYmV6aWVyLWN1cnZlL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2JpZy1yYXQvYWRkLmpzIiwibm9kZV9tb2R1bGVzL2JpZy1yYXQvY21wLmpzIiwibm9kZV9tb2R1bGVzL2JpZy1yYXQvZGl2LmpzIiwibm9kZV9tb2R1bGVzL2JpZy1yYXQvaW5kZXguanMiLCJub2RlX21vZHVsZXMvYmlnLXJhdC9pcy1yYXQuanMiLCJub2RlX21vZHVsZXMvYmlnLXJhdC9saWIvYm4tc2lnbi5qcyIsIm5vZGVfbW9kdWxlcy9iaWctcmF0L2xpYi9ibi10by1udW0uanMiLCJub2RlX21vZHVsZXMvYmlnLXJhdC9saWIvY3R6LmpzIiwibm9kZV9tb2R1bGVzL2JpZy1yYXQvbGliL2lzLWJuLmpzIiwibm9kZV9tb2R1bGVzL2JpZy1yYXQvbGliL251bS10by1ibi5qcyIsIm5vZGVfbW9kdWxlcy9iaWctcmF0L2xpYi9yYXRpb25hbGl6ZS5qcyIsIm5vZGVfbW9kdWxlcy9iaWctcmF0L2xpYi9zdHItdG8tYm4uanMiLCJub2RlX21vZHVsZXMvYmlnLXJhdC9tdWwuanMiLCJub2RlX21vZHVsZXMvYmlnLXJhdC9zaWduLmpzIiwibm9kZV9tb2R1bGVzL2JpZy1yYXQvc3ViLmpzIiwibm9kZV9tb2R1bGVzL2JpZy1yYXQvdG8tZmxvYXQuanMiLCJub2RlX21vZHVsZXMvYmluYXJ5LXNlYXJjaC1ib3VuZHMvc2VhcmNoLWJvdW5kcy5qcyIsIm5vZGVfbW9kdWxlcy9iaXQtdHdpZGRsZS90d2lkZGxlLmpzIiwibm9kZV9tb2R1bGVzL2JuLmpzL2xpYi9ibi5qcyIsIm5vZGVfbW9kdWxlcy9ib3VuZC1wb2ludHMvYm91bmRzLmpzIiwibm9kZV9tb2R1bGVzL2JveC1pbnRlcnNlY3QvaW5kZXguanMiLCJub2RlX21vZHVsZXMvYm94LWludGVyc2VjdC9saWIvYnJ1dGUuanMiLCJub2RlX21vZHVsZXMvYm94LWludGVyc2VjdC9saWIvaW50ZXJzZWN0LmpzIiwibm9kZV9tb2R1bGVzL2JveC1pbnRlcnNlY3QvbGliL21lZGlhbi5qcyIsIm5vZGVfbW9kdWxlcy9ib3gtaW50ZXJzZWN0L2xpYi9wYXJ0aXRpb24uanMiLCJub2RlX21vZHVsZXMvYm94LWludGVyc2VjdC9saWIvc29ydC5qcyIsIm5vZGVfbW9kdWxlcy9ib3gtaW50ZXJzZWN0L2xpYi9zd2VlcC5qcyIsIm5vZGVfbW9kdWxlcy9jZHQyZC9jZHQyZC5qcyIsIm5vZGVfbW9kdWxlcy9jZHQyZC9saWIvZGVsYXVuYXkuanMiLCJub2RlX21vZHVsZXMvY2R0MmQvbGliL2ZpbHRlci5qcyIsIm5vZGVfbW9kdWxlcy9jZHQyZC9saWIvbW9ub3RvbmUuanMiLCJub2RlX21vZHVsZXMvY2R0MmQvbGliL3RyaWFuZ3VsYXRpb24uanMiLCJub2RlX21vZHVsZXMvY2xlYW4tcHNsZy9jbGVhbi1wc2xnLmpzIiwibm9kZV9tb2R1bGVzL2NsZWFuLXBzbGcvbGliL3JhdC1zZWctaW50ZXJzZWN0LmpzIiwibm9kZV9tb2R1bGVzL2RvdWJsZS1iaXRzL2RvdWJsZS5qcyIsIm5vZGVfbW9kdWxlcy9kdXAvZHVwLmpzIiwibm9kZV9tb2R1bGVzL2V4dHJhY3Qtc3ZnLXBhdGgvYnJvd3Nlci5qcyIsIm5vZGVfbW9kdWxlcy9tZXNoLXJlaW5kZXgvaW5kZXguanMiLCJub2RlX21vZHVsZXMvbmV4dGFmdGVyL25leHRhZnRlci5qcyIsIm5vZGVfbW9kdWxlcy9ub3JtYWxpemUtcGF0aC1zY2FsZS9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9ub3JtYWxpemUtc3ZnLXBhdGgvaW5kZXguanMiLCJub2RlX21vZHVsZXMvb2JqZWN0LWFzc2lnbi9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9wYXJzZS1zdmctcGF0aC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9wcndtL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3Byd20vcHJ3bS9hdHRyaWJ1dGUtdHlwZXMuanMiLCJub2RlX21vZHVsZXMvcHJ3bS9wcndtL2RlY29kZS5qcyIsIm5vZGVfbW9kdWxlcy9wcndtL3Byd20vZW5jb2RlLmpzIiwibm9kZV9tb2R1bGVzL3Byd20vdXRpbHMvaXMtYmlnLWVuZGlhbi1wbGF0Zm9ybS5qcyIsIm5vZGVfbW9kdWxlcy9yYW5kb20tZmxvYXQvaW5kZXguanMiLCJub2RlX21vZHVsZXMvcmF0LXZlYy9hZGQuanMiLCJub2RlX21vZHVsZXMvcmF0LXZlYy9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9yYXQtdmVjL211bHMuanMiLCJub2RlX21vZHVsZXMvcmF0LXZlYy9zdWIuanMiLCJub2RlX21vZHVsZXMvcm9idXN0LWluLXNwaGVyZS9pbi1zcGhlcmUuanMiLCJub2RlX21vZHVsZXMvcm9idXN0LW9yaWVudGF0aW9uL29yaWVudGF0aW9uLmpzIiwibm9kZV9tb2R1bGVzL3JvYnVzdC1zY2FsZS9yb2J1c3Qtc2NhbGUuanMiLCJub2RlX21vZHVsZXMvcm9idXN0LXNlZ21lbnQtaW50ZXJzZWN0L3NlZ3NlZy5qcyIsIm5vZGVfbW9kdWxlcy9yb2J1c3Qtc3VidHJhY3Qvcm9idXN0LWRpZmYuanMiLCJub2RlX21vZHVsZXMvcm9idXN0LXN1bS9yb2J1c3Qtc3VtLmpzIiwibm9kZV9tb2R1bGVzL3NpbXBsaWZ5LXBhdGgvZG91Z2xhcy1wZXVja2VyLmpzIiwibm9kZV9tb2R1bGVzL3NpbXBsaWZ5LXBhdGgvaW5kZXguanMiLCJub2RlX21vZHVsZXMvc2ltcGxpZnktcGF0aC9yYWRpYWwtZGlzdGFuY2UuanMiLCJub2RlX21vZHVsZXMvc3ZnLW1lc2gtM2QvaW5kZXguanMiLCJub2RlX21vZHVsZXMvc3ZnLXBhdGgtY29udG91cnMvaW5kZXguanMiLCJub2RlX21vZHVsZXMvdHdvLXByb2R1Y3QvdHdvLXByb2R1Y3QuanMiLCJub2RlX21vZHVsZXMvdHdvLXN1bS90d28tc3VtLmpzIiwibm9kZV9tb2R1bGVzL3R5cGVkYXJyYXktcG9vbC9wb29sLmpzIiwibm9kZV9tb2R1bGVzL3VuaW5kZXgtbWVzaC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy91bmlvbi1maW5kL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3VubGVycC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy92ZWMyLWNvcHkvaW5kZXguanMiLCJub2RlX21vZHVsZXMveG1sLXBhcnNlLWZyb20tc3RyaW5nL2luZGV4LmpzIiwiLi4vLi4vLi4vLi4vLi4vLi4vLi4vdXNyL2xvY2FsL2xpYi9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3Nlci1yZXNvbHZlL2VtcHR5LmpzIiwiLi4vLi4vLi4vLi4vLi4vLi4vLi4vdXNyL2xvY2FsL2xpYi9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnVmZmVyL2luZGV4LmpzIiwiLi4vLi4vLi4vLi4vLi4vLi4vLi4vdXNyL2xvY2FsL2xpYi9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnVmZmVyL25vZGVfbW9kdWxlcy9iYXNlNjQtanMvbGliL2I2NC5qcyIsIi4uLy4uLy4uLy4uLy4uLy4uLy4uL3Vzci9sb2NhbC9saWIvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlci9ub2RlX21vZHVsZXMvaWVlZTc1NC9pbmRleC5qcyIsIi4uLy4uLy4uLy4uLy4uLy4uLy4uL3Vzci9sb2NhbC9saWIvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlci9ub2RlX21vZHVsZXMvaXMtYXJyYXkvaW5kZXguanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyTUE7O0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ24yR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6SUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9JQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdlQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3SUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqYkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcExBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4R0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN1hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0R0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ05BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUxBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0S0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNYQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1SEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2TkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3REE7QUFDQTtBQUNBOztBQ0ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0JBOztBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM2hDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4SEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgZXh0cmFjdFN2Z1BhdGggPSByZXF1aXJlKCdleHRyYWN0LXN2Zy1wYXRoJykucGFyc2U7XG52YXIgY3JlYXRlTWVzaCA9IHJlcXVpcmUoJ3N2Zy1tZXNoLTNkJyk7XG52YXIgcHJ3bSA9IHJlcXVpcmUoJ3Byd20nKTtcbnZhciByZWluZGV4ID0gcmVxdWlyZSgnbWVzaC1yZWluZGV4Jyk7XG52YXIgdW5pbmRleCA9IHJlcXVpcmUoJ3VuaW5kZXgtbWVzaCcpO1xuXG52YXIgbmJWZXJ0aWNlcyA9IG51bGw7XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICAgIGNvbnZlcnQ6IGZ1bmN0aW9uIChzdmdTdHJpbmcsIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIG1lc2ggPSBjcmVhdGVNZXNoKGV4dHJhY3RTdmdQYXRoKHN2Z1N0cmluZyksIHtcbiAgICAgICAgICAgIG5vcm1hbGl6ZTogdHJ1ZSxcbiAgICAgICAgICAgIHNpbXBsaWZ5OiBvcHRpb25zLnNpbXBsaWZ5LFxuICAgICAgICAgICAgc2NhbGU6IG9wdGlvbnMuc2NhbGVcbiAgICAgICAgfSk7XG5cbiAgICAgICAgaWYgKG9wdGlvbnMuc2VwYXJhdGVUcmlhbmdsZXMpIHtcbiAgICAgICAgICAgIG1lc2ggPSByZWluZGV4KHVuaW5kZXgobWVzaC5wb3NpdGlvbnMsIG1lc2guY2VsbHMpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBhdHRyaWJ1dGVzID0ge307XG5cbiAgICAgICAgdmFyIHBvc2l0aW9ucyA9IG5ldyBGbG9hdDMyQXJyYXkobWVzaC5wb3NpdGlvbnMubGVuZ3RoICogMyk7XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBtZXNoLnBvc2l0aW9ucy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgcG9zaXRpb25zW2kgKiAzXSA9IG1lc2gucG9zaXRpb25zW2ldWzBdO1xuICAgICAgICAgICAgcG9zaXRpb25zW2kgKiAzICsgMV0gPSBtZXNoLnBvc2l0aW9uc1tpXVsxXTtcbiAgICAgICAgICAgIHBvc2l0aW9uc1tpICogMyArIDJdID0gbWVzaC5wb3NpdGlvbnNbaV1bMl07XG4gICAgICAgIH1cblxuICAgICAgICBhdHRyaWJ1dGVzLnBvc2l0aW9uID0ge1xuICAgICAgICAgICAgY2FyZGluYWxpdHk6IDMsXG4gICAgICAgICAgICBub3JtYWxpemVkOiBmYWxzZSxcbiAgICAgICAgICAgIHZhbHVlczogcG9zaXRpb25zXG4gICAgICAgIH07XG5cbiAgICAgICAgbmJWZXJ0aWNlcyA9IHBvc2l0aW9ucy5sZW5ndGggLyAzO1xuXG4gICAgICAgIGlmIChvcHRpb25zLm5vcm1hbHMpIHtcbiAgICAgICAgICAgIC8vIHNhdmVzIGEgZmV3IGtCIGJ5IHVzaW5nIGEgSW50OEFycmF5IGluc3RlYWQgb2YgYSBGbG9hdDMyQXJyYXlcbiAgICAgICAgICAgIHZhciBub3JtYWxzID0gbmV3IEludDhBcnJheShtZXNoLnBvc2l0aW9ucy5sZW5ndGggKiAzKTtcblxuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IG1lc2gucG9zaXRpb25zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgbm9ybWFsc1tpICogM10gPSAwO1xuICAgICAgICAgICAgICAgIG5vcm1hbHNbaSAqIDMgKyAxXSA9IDA7XG4gICAgICAgICAgICAgICAgbm9ybWFsc1tpICogMyArIDJdID0gMTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgYXR0cmlidXRlcy5ub3JtYWwgPSB7XG4gICAgICAgICAgICAgICAgY2FyZGluYWxpdHk6IDMsXG4gICAgICAgICAgICAgICAgbm9ybWFsaXplZDogZmFsc2UsXG4gICAgICAgICAgICAgICAgdmFsdWVzOiBub3JtYWxzXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKG9wdGlvbnMudXZzKSB7XG4gICAgICAgICAgICB2YXIgdXZzID0gbmV3IEZsb2F0MzJBcnJheShtZXNoLnBvc2l0aW9ucy5sZW5ndGggKiAyKTtcblxuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IG1lc2gucG9zaXRpb25zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgdXZzW2kgKiAyXSA9ICgxICsgbWVzaC5wb3NpdGlvbnNbaV1bMF0pIC8gMjtcbiAgICAgICAgICAgICAgICB1dnNbaSAqIDIgKyAxXSA9ICgxICsgbWVzaC5wb3NpdGlvbnNbaV1bMV0pIC8gMjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgYXR0cmlidXRlcy51diA9IHtcbiAgICAgICAgICAgICAgICBjYXJkaW5hbGl0eTogMixcbiAgICAgICAgICAgICAgICBub3JtYWxpemVkOiBmYWxzZSxcbiAgICAgICAgICAgICAgICB2YWx1ZXM6IHV2c1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBpbmRpY2VzID0gbnVsbDtcblxuICAgICAgICBpbmRpY2VzID0gbWVzaC5wb3NpdGlvbnMubGVuZ3RoIDw9IDB4RkZGRiA/IG5ldyBVaW50MTZBcnJheShtZXNoLmNlbGxzLmxlbmd0aCAqIDMpIDogbmV3IFVpbnQzMkFycmF5KG1lc2guY2VsbHMubGVuZ3RoICogMyk7XG5cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IG1lc2guY2VsbHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGluZGljZXNbaSAqIDNdID0gbWVzaC5jZWxsc1tpXVsxXTtcbiAgICAgICAgICAgIGluZGljZXNbaSAqIDMgKyAxXSA9IG1lc2guY2VsbHNbaV1bMF07XG4gICAgICAgICAgICBpbmRpY2VzW2kgKiAzICsgMl0gPSBtZXNoLmNlbGxzW2ldWzJdO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHByd20uZW5jb2RlKFxuICAgICAgICAgICAgYXR0cmlidXRlcyxcbiAgICAgICAgICAgIGluZGljZXMsXG4gICAgICAgICAgICBvcHRpb25zLmJpZ0VuZGlhblxuICAgICAgICApO1xuICAgIH0sXG4gICAgZ2V0TnVtYmVyT2ZWZXJ0aWNlczogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gbmJWZXJ0aWNlcztcbiAgICB9XG59O1xuIiwiXG5tb2R1bGUuZXhwb3J0cyA9IGFic29sdXRpemVcblxuLyoqXG4gKiByZWRlZmluZSBgcGF0aGAgd2l0aCBhYnNvbHV0ZSBjb29yZGluYXRlc1xuICpcbiAqIEBwYXJhbSB7QXJyYXl9IHBhdGhcbiAqIEByZXR1cm4ge0FycmF5fVxuICovXG5cbmZ1bmN0aW9uIGFic29sdXRpemUocGF0aCl7XG5cdHZhciBzdGFydFggPSAwXG5cdHZhciBzdGFydFkgPSAwXG5cdHZhciB4ID0gMFxuXHR2YXIgeSA9IDBcblxuXHRyZXR1cm4gcGF0aC5tYXAoZnVuY3Rpb24oc2VnKXtcblx0XHRzZWcgPSBzZWcuc2xpY2UoKVxuXHRcdHZhciB0eXBlID0gc2VnWzBdXG5cdFx0dmFyIGNvbW1hbmQgPSB0eXBlLnRvVXBwZXJDYXNlKClcblxuXHRcdC8vIGlzIHJlbGF0aXZlXG5cdFx0aWYgKHR5cGUgIT0gY29tbWFuZCkge1xuXHRcdFx0c2VnWzBdID0gY29tbWFuZFxuXHRcdFx0c3dpdGNoICh0eXBlKSB7XG5cdFx0XHRcdGNhc2UgJ2EnOlxuXHRcdFx0XHRcdHNlZ1s2XSArPSB4XG5cdFx0XHRcdFx0c2VnWzddICs9IHlcblx0XHRcdFx0XHRicmVha1xuXHRcdFx0XHRjYXNlICd2Jzpcblx0XHRcdFx0XHRzZWdbMV0gKz0geVxuXHRcdFx0XHRcdGJyZWFrXG5cdFx0XHRcdGNhc2UgJ2gnOlxuXHRcdFx0XHRcdHNlZ1sxXSArPSB4XG5cdFx0XHRcdFx0YnJlYWtcblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRmb3IgKHZhciBpID0gMTsgaSA8IHNlZy5sZW5ndGg7KSB7XG5cdFx0XHRcdFx0XHRzZWdbaSsrXSArPSB4XG5cdFx0XHRcdFx0XHRzZWdbaSsrXSArPSB5XG5cdFx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIHVwZGF0ZSBjdXJzb3Igc3RhdGVcblx0XHRzd2l0Y2ggKGNvbW1hbmQpIHtcblx0XHRcdGNhc2UgJ1onOlxuXHRcdFx0XHR4ID0gc3RhcnRYXG5cdFx0XHRcdHkgPSBzdGFydFlcblx0XHRcdFx0YnJlYWtcblx0XHRcdGNhc2UgJ0gnOlxuXHRcdFx0XHR4ID0gc2VnWzFdXG5cdFx0XHRcdGJyZWFrXG5cdFx0XHRjYXNlICdWJzpcblx0XHRcdFx0eSA9IHNlZ1sxXVxuXHRcdFx0XHRicmVha1xuXHRcdFx0Y2FzZSAnTSc6XG5cdFx0XHRcdHggPSBzdGFydFggPSBzZWdbMV1cblx0XHRcdFx0eSA9IHN0YXJ0WSA9IHNlZ1syXVxuXHRcdFx0XHRicmVha1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0eCA9IHNlZ1tzZWcubGVuZ3RoIC0gMl1cblx0XHRcdFx0eSA9IHNlZ1tzZWcubGVuZ3RoIC0gMV1cblx0XHR9XG5cblx0XHRyZXR1cm4gc2VnXG5cdH0pXG59XG4iLCJmdW5jdGlvbiBjbG9uZShwb2ludCkgeyAvL1RPRE86IHVzZSBnbC12ZWMyIGZvciB0aGlzXG4gICAgcmV0dXJuIFtwb2ludFswXSwgcG9pbnRbMV1dXG59XG5cbmZ1bmN0aW9uIHZlYzIoeCwgeSkge1xuICAgIHJldHVybiBbeCwgeV1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjcmVhdGVCZXppZXJCdWlsZGVyKG9wdCkge1xuICAgIG9wdCA9IG9wdHx8e31cblxuICAgIHZhciBSRUNVUlNJT05fTElNSVQgPSB0eXBlb2Ygb3B0LnJlY3Vyc2lvbiA9PT0gJ251bWJlcicgPyBvcHQucmVjdXJzaW9uIDogOFxuICAgIHZhciBGTFRfRVBTSUxPTiA9IHR5cGVvZiBvcHQuZXBzaWxvbiA9PT0gJ251bWJlcicgPyBvcHQuZXBzaWxvbiA6IDEuMTkyMDkyOTBlLTdcbiAgICB2YXIgUEFUSF9ESVNUQU5DRV9FUFNJTE9OID0gdHlwZW9mIG9wdC5wYXRoRXBzaWxvbiA9PT0gJ251bWJlcicgPyBvcHQucGF0aEVwc2lsb24gOiAxLjBcblxuICAgIHZhciBjdXJ2ZV9hbmdsZV90b2xlcmFuY2VfZXBzaWxvbiA9IHR5cGVvZiBvcHQuYW5nbGVFcHNpbG9uID09PSAnbnVtYmVyJyA/IG9wdC5hbmdsZUVwc2lsb24gOiAwLjAxXG4gICAgdmFyIG1fYW5nbGVfdG9sZXJhbmNlID0gb3B0LmFuZ2xlVG9sZXJhbmNlIHx8IDBcbiAgICB2YXIgbV9jdXNwX2xpbWl0ID0gb3B0LmN1c3BMaW1pdCB8fCAwXG5cbiAgICByZXR1cm4gZnVuY3Rpb24gYmV6aWVyQ3VydmUoc3RhcnQsIGMxLCBjMiwgZW5kLCBzY2FsZSwgcG9pbnRzKSB7XG4gICAgICAgIGlmICghcG9pbnRzKVxuICAgICAgICAgICAgcG9pbnRzID0gW11cblxuICAgICAgICBzY2FsZSA9IHR5cGVvZiBzY2FsZSA9PT0gJ251bWJlcicgPyBzY2FsZSA6IDEuMFxuICAgICAgICB2YXIgZGlzdGFuY2VUb2xlcmFuY2UgPSBQQVRIX0RJU1RBTkNFX0VQU0lMT04gLyBzY2FsZVxuICAgICAgICBkaXN0YW5jZVRvbGVyYW5jZSAqPSBkaXN0YW5jZVRvbGVyYW5jZVxuICAgICAgICBiZWdpbihzdGFydCwgYzEsIGMyLCBlbmQsIHBvaW50cywgZGlzdGFuY2VUb2xlcmFuY2UpXG4gICAgICAgIHJldHVybiBwb2ludHNcbiAgICB9XG5cblxuICAgIC8vLy8vLyBCYXNlZCBvbjpcbiAgICAvLy8vLy8gaHR0cHM6Ly9naXRodWIuY29tL3BlbHNvbi9hbnRpZ3JhaW4vYmxvYi9tYXN0ZXIvYWdnLTIuNC9zcmMvYWdnX2N1cnZlcy5jcHBcblxuICAgIGZ1bmN0aW9uIGJlZ2luKHN0YXJ0LCBjMSwgYzIsIGVuZCwgcG9pbnRzLCBkaXN0YW5jZVRvbGVyYW5jZSkge1xuICAgICAgICBwb2ludHMucHVzaChjbG9uZShzdGFydCkpXG4gICAgICAgIHZhciB4MSA9IHN0YXJ0WzBdLFxuICAgICAgICAgICAgeTEgPSBzdGFydFsxXSxcbiAgICAgICAgICAgIHgyID0gYzFbMF0sXG4gICAgICAgICAgICB5MiA9IGMxWzFdLFxuICAgICAgICAgICAgeDMgPSBjMlswXSxcbiAgICAgICAgICAgIHkzID0gYzJbMV0sXG4gICAgICAgICAgICB4NCA9IGVuZFswXSxcbiAgICAgICAgICAgIHk0ID0gZW5kWzFdXG4gICAgICAgIHJlY3Vyc2l2ZSh4MSwgeTEsIHgyLCB5MiwgeDMsIHkzLCB4NCwgeTQsIHBvaW50cywgZGlzdGFuY2VUb2xlcmFuY2UsIDApXG4gICAgICAgIHBvaW50cy5wdXNoKGNsb25lKGVuZCkpXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVjdXJzaXZlKHgxLCB5MSwgeDIsIHkyLCB4MywgeTMsIHg0LCB5NCwgcG9pbnRzLCBkaXN0YW5jZVRvbGVyYW5jZSwgbGV2ZWwpIHtcbiAgICAgICAgaWYobGV2ZWwgPiBSRUNVUlNJT05fTElNSVQpIFxuICAgICAgICAgICAgcmV0dXJuXG5cbiAgICAgICAgdmFyIHBpID0gTWF0aC5QSVxuXG4gICAgICAgIC8vIENhbGN1bGF0ZSBhbGwgdGhlIG1pZC1wb2ludHMgb2YgdGhlIGxpbmUgc2VnbWVudHNcbiAgICAgICAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgICAgIHZhciB4MTIgICA9ICh4MSArIHgyKSAvIDJcbiAgICAgICAgdmFyIHkxMiAgID0gKHkxICsgeTIpIC8gMlxuICAgICAgICB2YXIgeDIzICAgPSAoeDIgKyB4MykgLyAyXG4gICAgICAgIHZhciB5MjMgICA9ICh5MiArIHkzKSAvIDJcbiAgICAgICAgdmFyIHgzNCAgID0gKHgzICsgeDQpIC8gMlxuICAgICAgICB2YXIgeTM0ICAgPSAoeTMgKyB5NCkgLyAyXG4gICAgICAgIHZhciB4MTIzICA9ICh4MTIgKyB4MjMpIC8gMlxuICAgICAgICB2YXIgeTEyMyAgPSAoeTEyICsgeTIzKSAvIDJcbiAgICAgICAgdmFyIHgyMzQgID0gKHgyMyArIHgzNCkgLyAyXG4gICAgICAgIHZhciB5MjM0ICA9ICh5MjMgKyB5MzQpIC8gMlxuICAgICAgICB2YXIgeDEyMzQgPSAoeDEyMyArIHgyMzQpIC8gMlxuICAgICAgICB2YXIgeTEyMzQgPSAoeTEyMyArIHkyMzQpIC8gMlxuXG4gICAgICAgIGlmKGxldmVsID4gMCkgeyAvLyBFbmZvcmNlIHN1YmRpdmlzaW9uIGZpcnN0IHRpbWVcbiAgICAgICAgICAgIC8vIFRyeSB0byBhcHByb3hpbWF0ZSB0aGUgZnVsbCBjdWJpYyBjdXJ2ZSBieSBhIHNpbmdsZSBzdHJhaWdodCBsaW5lXG4gICAgICAgICAgICAvLy0tLS0tLS0tLS0tLS0tLS0tLVxuICAgICAgICAgICAgdmFyIGR4ID0geDQteDFcbiAgICAgICAgICAgIHZhciBkeSA9IHk0LXkxXG5cbiAgICAgICAgICAgIHZhciBkMiA9IE1hdGguYWJzKCh4MiAtIHg0KSAqIGR5IC0gKHkyIC0geTQpICogZHgpXG4gICAgICAgICAgICB2YXIgZDMgPSBNYXRoLmFicygoeDMgLSB4NCkgKiBkeSAtICh5MyAtIHk0KSAqIGR4KVxuXG4gICAgICAgICAgICB2YXIgZGExLCBkYTJcblxuICAgICAgICAgICAgaWYoZDIgPiBGTFRfRVBTSUxPTiAmJiBkMyA+IEZMVF9FUFNJTE9OKSB7XG4gICAgICAgICAgICAgICAgLy8gUmVndWxhciBjYXJlXG4gICAgICAgICAgICAgICAgLy8tLS0tLS0tLS0tLS0tLS0tLVxuICAgICAgICAgICAgICAgIGlmKChkMiArIGQzKSooZDIgKyBkMykgPD0gZGlzdGFuY2VUb2xlcmFuY2UgKiAoZHgqZHggKyBkeSpkeSkpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gSWYgdGhlIGN1cnZhdHVyZSBkb2Vzbid0IGV4Y2VlZCB0aGUgZGlzdGFuY2VUb2xlcmFuY2UgdmFsdWVcbiAgICAgICAgICAgICAgICAgICAgLy8gd2UgdGVuZCB0byBmaW5pc2ggc3ViZGl2aXNpb25zLlxuICAgICAgICAgICAgICAgICAgICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAgICAgICAgICAgICAgICAgaWYobV9hbmdsZV90b2xlcmFuY2UgPCBjdXJ2ZV9hbmdsZV90b2xlcmFuY2VfZXBzaWxvbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgcG9pbnRzLnB1c2godmVjMih4MTIzNCwgeTEyMzQpKVxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyBBbmdsZSAmIEN1c3AgQ29uZGl0aW9uXG4gICAgICAgICAgICAgICAgICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgICAgICAgICAgICAgICAgICB2YXIgYTIzID0gTWF0aC5hdGFuMih5MyAtIHkyLCB4MyAtIHgyKVxuICAgICAgICAgICAgICAgICAgICBkYTEgPSBNYXRoLmFicyhhMjMgLSBNYXRoLmF0YW4yKHkyIC0geTEsIHgyIC0geDEpKVxuICAgICAgICAgICAgICAgICAgICBkYTIgPSBNYXRoLmFicyhNYXRoLmF0YW4yKHk0IC0geTMsIHg0IC0geDMpIC0gYTIzKVxuICAgICAgICAgICAgICAgICAgICBpZihkYTEgPj0gcGkpIGRhMSA9IDIqcGkgLSBkYTFcbiAgICAgICAgICAgICAgICAgICAgaWYoZGEyID49IHBpKSBkYTIgPSAyKnBpIC0gZGEyXG5cbiAgICAgICAgICAgICAgICAgICAgaWYoZGExICsgZGEyIDwgbV9hbmdsZV90b2xlcmFuY2UpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEZpbmFsbHkgd2UgY2FuIHN0b3AgdGhlIHJlY3Vyc2lvblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgICAgICAgICAgICAgICAgICAgICBwb2ludHMucHVzaCh2ZWMyKHgxMjM0LCB5MTIzNCkpXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGlmKG1fY3VzcF9saW1pdCAhPT0gMC4wKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZihkYTEgPiBtX2N1c3BfbGltaXQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwb2ludHMucHVzaCh2ZWMyKHgyLCB5MikpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmKGRhMiA+IG1fY3VzcF9saW1pdCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBvaW50cy5wdXNoKHZlYzIoeDMsIHkzKSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGlmKGQyID4gRkxUX0VQU0lMT04pIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gcDEscDMscDQgYXJlIGNvbGxpbmVhciwgcDIgaXMgY29uc2lkZXJhYmxlXG4gICAgICAgICAgICAgICAgICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgICAgICAgICAgICAgICAgICBpZihkMiAqIGQyIDw9IGRpc3RhbmNlVG9sZXJhbmNlICogKGR4KmR4ICsgZHkqZHkpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZihtX2FuZ2xlX3RvbGVyYW5jZSA8IGN1cnZlX2FuZ2xlX3RvbGVyYW5jZV9lcHNpbG9uKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcG9pbnRzLnB1c2godmVjMih4MTIzNCwgeTEyMzQpKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBBbmdsZSBDb25kaXRpb25cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgICAgICAgICAgICAgICAgICAgICAgZGExID0gTWF0aC5hYnMoTWF0aC5hdGFuMih5MyAtIHkyLCB4MyAtIHgyKSAtIE1hdGguYXRhbjIoeTIgLSB5MSwgeDIgLSB4MSkpXG4gICAgICAgICAgICAgICAgICAgICAgICBpZihkYTEgPj0gcGkpIGRhMSA9IDIqcGkgLSBkYTFcblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYoZGExIDwgbV9hbmdsZV90b2xlcmFuY2UpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwb2ludHMucHVzaCh2ZWMyKHgyLCB5MikpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcG9pbnRzLnB1c2godmVjMih4MywgeTMpKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZihtX2N1c3BfbGltaXQgIT09IDAuMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmKGRhMSA+IG1fY3VzcF9saW1pdCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwb2ludHMucHVzaCh2ZWMyKHgyLCB5MikpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmKGQzID4gRkxUX0VQU0lMT04pIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gcDEscDIscDQgYXJlIGNvbGxpbmVhciwgcDMgaXMgY29uc2lkZXJhYmxlXG4gICAgICAgICAgICAgICAgICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgICAgICAgICAgICAgICAgICBpZihkMyAqIGQzIDw9IGRpc3RhbmNlVG9sZXJhbmNlICogKGR4KmR4ICsgZHkqZHkpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZihtX2FuZ2xlX3RvbGVyYW5jZSA8IGN1cnZlX2FuZ2xlX3RvbGVyYW5jZV9lcHNpbG9uKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcG9pbnRzLnB1c2godmVjMih4MTIzNCwgeTEyMzQpKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBBbmdsZSBDb25kaXRpb25cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgICAgICAgICAgICAgICAgICAgICAgZGExID0gTWF0aC5hYnMoTWF0aC5hdGFuMih5NCAtIHkzLCB4NCAtIHgzKSAtIE1hdGguYXRhbjIoeTMgLSB5MiwgeDMgLSB4MikpXG4gICAgICAgICAgICAgICAgICAgICAgICBpZihkYTEgPj0gcGkpIGRhMSA9IDIqcGkgLSBkYTFcblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYoZGExIDwgbV9hbmdsZV90b2xlcmFuY2UpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwb2ludHMucHVzaCh2ZWMyKHgyLCB5MikpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcG9pbnRzLnB1c2godmVjMih4MywgeTMpKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZihtX2N1c3BfbGltaXQgIT09IDAuMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmKGRhMSA+IG1fY3VzcF9saW1pdClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBvaW50cy5wdXNoKHZlYzIoeDMsIHkzKSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAvLyBDb2xsaW5lYXIgY2FzZVxuICAgICAgICAgICAgICAgICAgICAvLy0tLS0tLS0tLS0tLS0tLS0tXG4gICAgICAgICAgICAgICAgICAgIGR4ID0geDEyMzQgLSAoeDEgKyB4NCkgLyAyXG4gICAgICAgICAgICAgICAgICAgIGR5ID0geTEyMzQgLSAoeTEgKyB5NCkgLyAyXG4gICAgICAgICAgICAgICAgICAgIGlmKGR4KmR4ICsgZHkqZHkgPD0gZGlzdGFuY2VUb2xlcmFuY2UpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHBvaW50cy5wdXNoKHZlYzIoeDEyMzQsIHkxMjM0KSlcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ29udGludWUgc3ViZGl2aXNpb25cbiAgICAgICAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgICAgIHJlY3Vyc2l2ZSh4MSwgeTEsIHgxMiwgeTEyLCB4MTIzLCB5MTIzLCB4MTIzNCwgeTEyMzQsIHBvaW50cywgZGlzdGFuY2VUb2xlcmFuY2UsIGxldmVsICsgMSkgXG4gICAgICAgIHJlY3Vyc2l2ZSh4MTIzNCwgeTEyMzQsIHgyMzQsIHkyMzQsIHgzNCwgeTM0LCB4NCwgeTQsIHBvaW50cywgZGlzdGFuY2VUb2xlcmFuY2UsIGxldmVsICsgMSkgXG4gICAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKCcuL2Z1bmN0aW9uJykoKSIsIid1c2Ugc3RyaWN0J1xuXG52YXIgcmF0aW9uYWxpemUgPSByZXF1aXJlKCcuL2xpYi9yYXRpb25hbGl6ZScpXG5cbm1vZHVsZS5leHBvcnRzID0gYWRkXG5cbmZ1bmN0aW9uIGFkZChhLCBiKSB7XG4gIHJldHVybiByYXRpb25hbGl6ZShcbiAgICBhWzBdLm11bChiWzFdKS5hZGQoYlswXS5tdWwoYVsxXSkpLFxuICAgIGFbMV0ubXVsKGJbMV0pKVxufVxuIiwiJ3VzZSBzdHJpY3QnXG5cbm1vZHVsZS5leHBvcnRzID0gY21wXG5cbmZ1bmN0aW9uIGNtcChhLCBiKSB7XG4gICAgcmV0dXJuIGFbMF0ubXVsKGJbMV0pLmNtcChiWzBdLm11bChhWzFdKSlcbn1cbiIsIid1c2Ugc3RyaWN0J1xuXG52YXIgcmF0aW9uYWxpemUgPSByZXF1aXJlKCcuL2xpYi9yYXRpb25hbGl6ZScpXG5cbm1vZHVsZS5leHBvcnRzID0gZGl2XG5cbmZ1bmN0aW9uIGRpdihhLCBiKSB7XG4gIHJldHVybiByYXRpb25hbGl6ZShhWzBdLm11bChiWzFdKSwgYVsxXS5tdWwoYlswXSkpXG59XG4iLCIndXNlIHN0cmljdCdcblxudmFyIGlzUmF0ID0gcmVxdWlyZSgnLi9pcy1yYXQnKVxudmFyIGlzQk4gPSByZXF1aXJlKCcuL2xpYi9pcy1ibicpXG52YXIgbnVtMmJuID0gcmVxdWlyZSgnLi9saWIvbnVtLXRvLWJuJylcbnZhciBzdHIyYm4gPSByZXF1aXJlKCcuL2xpYi9zdHItdG8tYm4nKVxudmFyIHJhdGlvbmFsaXplID0gcmVxdWlyZSgnLi9saWIvcmF0aW9uYWxpemUnKVxudmFyIGRpdiA9IHJlcXVpcmUoJy4vZGl2JylcblxubW9kdWxlLmV4cG9ydHMgPSBtYWtlUmF0aW9uYWxcblxuZnVuY3Rpb24gbWFrZVJhdGlvbmFsKG51bWVyLCBkZW5vbSkge1xuICBpZihpc1JhdChudW1lcikpIHtcbiAgICBpZihkZW5vbSkge1xuICAgICAgcmV0dXJuIGRpdihudW1lciwgbWFrZVJhdGlvbmFsKGRlbm9tKSlcbiAgICB9XG4gICAgcmV0dXJuIFtudW1lclswXS5jbG9uZSgpLCBudW1lclsxXS5jbG9uZSgpXVxuICB9XG4gIHZhciBzaGlmdCA9IDBcbiAgdmFyIGEsIGJcbiAgaWYoaXNCTihudW1lcikpIHtcbiAgICBhID0gbnVtZXIuY2xvbmUoKVxuICB9IGVsc2UgaWYodHlwZW9mIG51bWVyID09PSAnc3RyaW5nJykge1xuICAgIGEgPSBzdHIyYm4obnVtZXIpXG4gIH0gZWxzZSBpZihudW1lciA9PT0gMCkge1xuICAgIHJldHVybiBbbnVtMmJuKDApLCBudW0yYm4oMSldXG4gIH0gZWxzZSBpZihudW1lciA9PT0gTWF0aC5mbG9vcihudW1lcikpIHtcbiAgICBhID0gbnVtMmJuKG51bWVyKVxuICB9IGVsc2Uge1xuICAgIHdoaWxlKG51bWVyICE9PSBNYXRoLmZsb29yKG51bWVyKSkge1xuICAgICAgbnVtZXIgPSBudW1lciAqIE1hdGgucG93KDIsIDI1NilcbiAgICAgIHNoaWZ0IC09IDI1NlxuICAgIH1cbiAgICBhID0gbnVtMmJuKG51bWVyKVxuICB9XG4gIGlmKGlzUmF0KGRlbm9tKSkge1xuICAgIGEubXVsKGRlbm9tWzFdKVxuICAgIGIgPSBkZW5vbVswXS5jbG9uZSgpXG4gIH0gZWxzZSBpZihpc0JOKGRlbm9tKSkge1xuICAgIGIgPSBkZW5vbS5jbG9uZSgpXG4gIH0gZWxzZSBpZih0eXBlb2YgZGVub20gPT09ICdzdHJpbmcnKSB7XG4gICAgYiA9IHN0cjJibihkZW5vbSlcbiAgfSBlbHNlIGlmKCFkZW5vbSkge1xuICAgIGIgPSBudW0yYm4oMSlcbiAgfSBlbHNlIGlmKGRlbm9tID09PSBNYXRoLmZsb29yKGRlbm9tKSkge1xuICAgIGIgPSBudW0yYm4oZGVub20pXG4gIH0gZWxzZSB7XG4gICAgd2hpbGUoZGVub20gIT09IE1hdGguZmxvb3IoZGVub20pKSB7XG4gICAgICBkZW5vbSA9IGRlbm9tICogTWF0aC5wb3coMiwgMjU2KVxuICAgICAgc2hpZnQgKz0gMjU2XG4gICAgfVxuICAgIGIgPSBudW0yYm4oZGVub20pXG4gIH1cbiAgaWYoc2hpZnQgPiAwKSB7XG4gICAgYSA9IGEudXNobG4oc2hpZnQpXG4gIH0gZWxzZSBpZihzaGlmdCA8IDApIHtcbiAgICBiID0gYi51c2hsbigtc2hpZnQpXG4gIH1cbiAgcmV0dXJuIHJhdGlvbmFsaXplKGEsIGIpXG59XG4iLCIndXNlIHN0cmljdCdcblxudmFyIGlzQk4gPSByZXF1aXJlKCcuL2xpYi9pcy1ibicpXG5cbm1vZHVsZS5leHBvcnRzID0gaXNSYXRcblxuZnVuY3Rpb24gaXNSYXQoeCkge1xuICByZXR1cm4gQXJyYXkuaXNBcnJheSh4KSAmJiB4Lmxlbmd0aCA9PT0gMiAmJiBpc0JOKHhbMF0pICYmIGlzQk4oeFsxXSlcbn1cbiIsIid1c2Ugc3RyaWN0J1xuXG52YXIgQk4gPSByZXF1aXJlKCdibi5qcycpXG5cbm1vZHVsZS5leHBvcnRzID0gc2lnblxuXG5mdW5jdGlvbiBzaWduICh4KSB7XG4gIHJldHVybiB4LmNtcChuZXcgQk4oMCkpXG59XG4iLCIndXNlIHN0cmljdCdcblxudmFyIHNpZ24gPSByZXF1aXJlKCcuL2JuLXNpZ24nKVxuXG5tb2R1bGUuZXhwb3J0cyA9IGJuMm51bVxuXG4vL1RPRE86IE1ha2UgdGhpcyBiZXR0ZXJcbmZ1bmN0aW9uIGJuMm51bShiKSB7XG4gIHZhciBsID0gYi5sZW5ndGhcbiAgdmFyIHdvcmRzID0gYi53b3Jkc1xuICB2YXIgb3V0ID0gMFxuICBpZiAobCA9PT0gMSkge1xuICAgIG91dCA9IHdvcmRzWzBdXG4gIH0gZWxzZSBpZiAobCA9PT0gMikge1xuICAgIG91dCA9IHdvcmRzWzBdICsgKHdvcmRzWzFdICogMHg0MDAwMDAwKVxuICB9IGVsc2Uge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbDsgaSsrKSB7XG4gICAgICB2YXIgdyA9IHdvcmRzW2ldXG4gICAgICBvdXQgKz0gdyAqIE1hdGgucG93KDB4NDAwMDAwMCwgaSlcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHNpZ24oYikgKiBvdXRcbn1cbiIsIid1c2Ugc3RyaWN0J1xuXG52YXIgZGIgPSByZXF1aXJlKCdkb3VibGUtYml0cycpXG52YXIgY3R6ID0gcmVxdWlyZSgnYml0LXR3aWRkbGUnKS5jb3VudFRyYWlsaW5nWmVyb3NcblxubW9kdWxlLmV4cG9ydHMgPSBjdHpOdW1iZXJcblxuLy9Db3VudHMgdGhlIG51bWJlciBvZiB0cmFpbGluZyB6ZXJvc1xuZnVuY3Rpb24gY3R6TnVtYmVyKHgpIHtcbiAgdmFyIGwgPSBjdHooZGIubG8oeCkpXG4gIGlmKGwgPCAzMikge1xuICAgIHJldHVybiBsXG4gIH1cbiAgdmFyIGggPSBjdHooZGIuaGkoeCkpXG4gIGlmKGggPiAyMCkge1xuICAgIHJldHVybiA1MlxuICB9XG4gIHJldHVybiBoICsgMzJcbn1cbiIsIid1c2Ugc3RyaWN0J1xuXG52YXIgQk4gPSByZXF1aXJlKCdibi5qcycpXG5cbm1vZHVsZS5leHBvcnRzID0gaXNCTlxuXG4vL1Rlc3QgaWYgeCBpcyBhIGJpZ251bWJlclxuLy9GSVhNRTogb2J2aW91c2x5IHRoaXMgaXMgdGhlIHdyb25nIHdheSB0byBkbyBpdFxuZnVuY3Rpb24gaXNCTih4KSB7XG4gIHJldHVybiB4ICYmIHR5cGVvZiB4ID09PSAnb2JqZWN0JyAmJiBCb29sZWFuKHgud29yZHMpXG59XG4iLCIndXNlIHN0cmljdCdcblxudmFyIEJOID0gcmVxdWlyZSgnYm4uanMnKVxudmFyIGRiID0gcmVxdWlyZSgnZG91YmxlLWJpdHMnKVxuXG5tb2R1bGUuZXhwb3J0cyA9IG51bTJiblxuXG5mdW5jdGlvbiBudW0yYm4oeCkge1xuICB2YXIgZSA9IGRiLmV4cG9uZW50KHgpXG4gIGlmKGUgPCA1Mikge1xuICAgIHJldHVybiBuZXcgQk4oeClcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gKG5ldyBCTih4ICogTWF0aC5wb3coMiwgNTItZSkpKS51c2hsbihlLTUyKVxuICB9XG59XG4iLCIndXNlIHN0cmljdCdcblxudmFyIG51bTJibiA9IHJlcXVpcmUoJy4vbnVtLXRvLWJuJylcbnZhciBzaWduID0gcmVxdWlyZSgnLi9ibi1zaWduJylcblxubW9kdWxlLmV4cG9ydHMgPSByYXRpb25hbGl6ZVxuXG5mdW5jdGlvbiByYXRpb25hbGl6ZShudW1lciwgZGVub20pIHtcbiAgdmFyIHNudW1lciA9IHNpZ24obnVtZXIpXG4gIHZhciBzZGVub20gPSBzaWduKGRlbm9tKVxuICBpZihzbnVtZXIgPT09IDApIHtcbiAgICByZXR1cm4gW251bTJibigwKSwgbnVtMmJuKDEpXVxuICB9XG4gIGlmKHNkZW5vbSA9PT0gMCkge1xuICAgIHJldHVybiBbbnVtMmJuKDApLCBudW0yYm4oMCldXG4gIH1cbiAgaWYoc2Rlbm9tIDwgMCkge1xuICAgIG51bWVyID0gbnVtZXIubmVnKClcbiAgICBkZW5vbSA9IGRlbm9tLm5lZygpXG4gIH1cbiAgdmFyIGQgPSBudW1lci5nY2QoZGVub20pXG4gIGlmKGQuY21wbigxKSkge1xuICAgIHJldHVybiBbIG51bWVyLmRpdihkKSwgZGVub20uZGl2KGQpIF1cbiAgfVxuICByZXR1cm4gWyBudW1lciwgZGVub20gXVxufVxuIiwiJ3VzZSBzdHJpY3QnXG5cbnZhciBCTiA9IHJlcXVpcmUoJ2JuLmpzJylcblxubW9kdWxlLmV4cG9ydHMgPSBzdHIyQk5cblxuZnVuY3Rpb24gc3RyMkJOKHgpIHtcbiAgcmV0dXJuIG5ldyBCTih4KVxufVxuIiwiJ3VzZSBzdHJpY3QnXG5cbnZhciByYXRpb25hbGl6ZSA9IHJlcXVpcmUoJy4vbGliL3JhdGlvbmFsaXplJylcblxubW9kdWxlLmV4cG9ydHMgPSBtdWxcblxuZnVuY3Rpb24gbXVsKGEsIGIpIHtcbiAgcmV0dXJuIHJhdGlvbmFsaXplKGFbMF0ubXVsKGJbMF0pLCBhWzFdLm11bChiWzFdKSlcbn1cbiIsIid1c2Ugc3RyaWN0J1xuXG52YXIgYm5zaWduID0gcmVxdWlyZSgnLi9saWIvYm4tc2lnbicpXG5cbm1vZHVsZS5leHBvcnRzID0gc2lnblxuXG5mdW5jdGlvbiBzaWduKHgpIHtcbiAgcmV0dXJuIGJuc2lnbih4WzBdKSAqIGJuc2lnbih4WzFdKVxufVxuIiwiJ3VzZSBzdHJpY3QnXG5cbnZhciByYXRpb25hbGl6ZSA9IHJlcXVpcmUoJy4vbGliL3JhdGlvbmFsaXplJylcblxubW9kdWxlLmV4cG9ydHMgPSBzdWJcblxuZnVuY3Rpb24gc3ViKGEsIGIpIHtcbiAgcmV0dXJuIHJhdGlvbmFsaXplKGFbMF0ubXVsKGJbMV0pLnN1YihhWzFdLm11bChiWzBdKSksIGFbMV0ubXVsKGJbMV0pKVxufVxuIiwiJ3VzZSBzdHJpY3QnXG5cbnZhciBibjJudW0gPSByZXF1aXJlKCcuL2xpYi9ibi10by1udW0nKVxudmFyIGN0eiA9IHJlcXVpcmUoJy4vbGliL2N0eicpXG5cbm1vZHVsZS5leHBvcnRzID0gcm91bmRSYXRcblxuLy8gUm91bmQgYSByYXRpb25hbCB0byB0aGUgY2xvc2VzdCBmbG9hdFxuZnVuY3Rpb24gcm91bmRSYXQgKGYpIHtcbiAgdmFyIGEgPSBmWzBdXG4gIHZhciBiID0gZlsxXVxuICBpZiAoYS5jbXBuKDApID09PSAwKSB7XG4gICAgcmV0dXJuIDBcbiAgfVxuICB2YXIgaCA9IGEuYWJzKCkuZGl2bW9kKGIuYWJzKCkpXG4gIHZhciBpdiA9IGguZGl2XG4gIHZhciB4ID0gYm4ybnVtKGl2KVxuICB2YXIgaXIgPSBoLm1vZFxuICB2YXIgc2duID0gKGEubmVnYXRpdmUgIT09IGIubmVnYXRpdmUpID8gLTEgOiAxXG4gIGlmIChpci5jbXBuKDApID09PSAwKSB7XG4gICAgcmV0dXJuIHNnbiAqIHhcbiAgfVxuICBpZiAoeCkge1xuICAgIHZhciBzID0gY3R6KHgpICsgNFxuICAgIHZhciB5ID0gYm4ybnVtKGlyLnVzaGxuKHMpLmRpdlJvdW5kKGIpKVxuICAgIHJldHVybiBzZ24gKiAoeCArIHkgKiBNYXRoLnBvdygyLCAtcykpXG4gIH0gZWxzZSB7XG4gICAgdmFyIHliaXRzID0gYi5iaXRMZW5ndGgoKSAtIGlyLmJpdExlbmd0aCgpICsgNTNcbiAgICB2YXIgeSA9IGJuMm51bShpci51c2hsbih5Yml0cykuZGl2Um91bmQoYikpXG4gICAgaWYgKHliaXRzIDwgMTAyMykge1xuICAgICAgcmV0dXJuIHNnbiAqIHkgKiBNYXRoLnBvdygyLCAteWJpdHMpXG4gICAgfVxuICAgIHkgKj0gTWF0aC5wb3coMiwgLTEwMjMpXG4gICAgcmV0dXJuIHNnbiAqIHkgKiBNYXRoLnBvdygyLCAxMDIzIC0geWJpdHMpXG4gIH1cbn1cbiIsIlwidXNlIHN0cmljdFwiXG5cbmZ1bmN0aW9uIGNvbXBpbGVTZWFyY2goZnVuY05hbWUsIHByZWRpY2F0ZSwgcmV2ZXJzZWQsIGV4dHJhQXJncywgZWFybHlPdXQpIHtcbiAgdmFyIGNvZGUgPSBbXG4gICAgXCJmdW5jdGlvbiBcIiwgZnVuY05hbWUsIFwiKGEsbCxoLFwiLCBleHRyYUFyZ3Muam9pbihcIixcIiksICBcIil7XCIsXG5lYXJseU91dCA/IFwiXCIgOiBcInZhciBpPVwiLCAocmV2ZXJzZWQgPyBcImwtMVwiIDogXCJoKzFcIiksXG5cIjt3aGlsZShsPD1oKXtcXFxudmFyIG09KGwraCk+Pj4xLHg9YVttXVwiXVxuICBpZihlYXJseU91dCkge1xuICAgIGlmKHByZWRpY2F0ZS5pbmRleE9mKFwiY1wiKSA8IDApIHtcbiAgICAgIGNvZGUucHVzaChcIjtpZih4PT09eSl7cmV0dXJuIG19ZWxzZSBpZih4PD15KXtcIilcbiAgICB9IGVsc2Uge1xuICAgICAgY29kZS5wdXNoKFwiO3ZhciBwPWMoeCx5KTtpZihwPT09MCl7cmV0dXJuIG19ZWxzZSBpZihwPD0wKXtcIilcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgY29kZS5wdXNoKFwiO2lmKFwiLCBwcmVkaWNhdGUsIFwiKXtpPW07XCIpXG4gIH1cbiAgaWYocmV2ZXJzZWQpIHtcbiAgICBjb2RlLnB1c2goXCJsPW0rMX1lbHNle2g9bS0xfVwiKVxuICB9IGVsc2Uge1xuICAgIGNvZGUucHVzaChcImg9bS0xfWVsc2V7bD1tKzF9XCIpXG4gIH1cbiAgY29kZS5wdXNoKFwifVwiKVxuICBpZihlYXJseU91dCkge1xuICAgIGNvZGUucHVzaChcInJldHVybiAtMX07XCIpXG4gIH0gZWxzZSB7XG4gICAgY29kZS5wdXNoKFwicmV0dXJuIGl9O1wiKVxuICB9XG4gIHJldHVybiBjb2RlLmpvaW4oXCJcIilcbn1cblxuZnVuY3Rpb24gY29tcGlsZUJvdW5kc1NlYXJjaChwcmVkaWNhdGUsIHJldmVyc2VkLCBzdWZmaXgsIGVhcmx5T3V0KSB7XG4gIHZhciByZXN1bHQgPSBuZXcgRnVuY3Rpb24oW1xuICBjb21waWxlU2VhcmNoKFwiQVwiLCBcInhcIiArIHByZWRpY2F0ZSArIFwieVwiLCByZXZlcnNlZCwgW1wieVwiXSwgZWFybHlPdXQpLFxuICBjb21waWxlU2VhcmNoKFwiUFwiLCBcImMoeCx5KVwiICsgcHJlZGljYXRlICsgXCIwXCIsIHJldmVyc2VkLCBbXCJ5XCIsIFwiY1wiXSwgZWFybHlPdXQpLFxuXCJmdW5jdGlvbiBkaXNwYXRjaEJzZWFyY2hcIiwgc3VmZml4LCBcIihhLHksYyxsLGgpe1xcXG5pZih0eXBlb2YoYyk9PT0nZnVuY3Rpb24nKXtcXFxucmV0dXJuIFAoYSwobD09PXZvaWQgMCk/MDpsfDAsKGg9PT12b2lkIDApP2EubGVuZ3RoLTE6aHwwLHksYylcXFxufWVsc2V7XFxcbnJldHVybiBBKGEsKGM9PT12b2lkIDApPzA6Y3wwLChsPT09dm9pZCAwKT9hLmxlbmd0aC0xOmx8MCx5KVxcXG59fVxcXG5yZXR1cm4gZGlzcGF0Y2hCc2VhcmNoXCIsIHN1ZmZpeF0uam9pbihcIlwiKSlcbiAgcmV0dXJuIHJlc3VsdCgpXG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBnZTogY29tcGlsZUJvdW5kc1NlYXJjaChcIj49XCIsIGZhbHNlLCBcIkdFXCIpLFxuICBndDogY29tcGlsZUJvdW5kc1NlYXJjaChcIj5cIiwgZmFsc2UsIFwiR1RcIiksXG4gIGx0OiBjb21waWxlQm91bmRzU2VhcmNoKFwiPFwiLCB0cnVlLCBcIkxUXCIpLFxuICBsZTogY29tcGlsZUJvdW5kc1NlYXJjaChcIjw9XCIsIHRydWUsIFwiTEVcIiksXG4gIGVxOiBjb21waWxlQm91bmRzU2VhcmNoKFwiLVwiLCB0cnVlLCBcIkVRXCIsIHRydWUpXG59XG4iLCIvKipcbiAqIEJpdCB0d2lkZGxpbmcgaGFja3MgZm9yIEphdmFTY3JpcHQuXG4gKlxuICogQXV0aG9yOiBNaWtvbGEgTHlzZW5rb1xuICpcbiAqIFBvcnRlZCBmcm9tIFN0YW5mb3JkIGJpdCB0d2lkZGxpbmcgaGFjayBsaWJyYXJ5OlxuICogICAgaHR0cDovL2dyYXBoaWNzLnN0YW5mb3JkLmVkdS9+c2VhbmRlci9iaXRoYWNrcy5odG1sXG4gKi9cblxuXCJ1c2Ugc3RyaWN0XCI7IFwidXNlIHJlc3RyaWN0XCI7XG5cbi8vTnVtYmVyIG9mIGJpdHMgaW4gYW4gaW50ZWdlclxudmFyIElOVF9CSVRTID0gMzI7XG5cbi8vQ29uc3RhbnRzXG5leHBvcnRzLklOVF9CSVRTICA9IElOVF9CSVRTO1xuZXhwb3J0cy5JTlRfTUFYICAgPSAgMHg3ZmZmZmZmZjtcbmV4cG9ydHMuSU5UX01JTiAgID0gLTE8PChJTlRfQklUUy0xKTtcblxuLy9SZXR1cm5zIC0xLCAwLCArMSBkZXBlbmRpbmcgb24gc2lnbiBvZiB4XG5leHBvcnRzLnNpZ24gPSBmdW5jdGlvbih2KSB7XG4gIHJldHVybiAodiA+IDApIC0gKHYgPCAwKTtcbn1cblxuLy9Db21wdXRlcyBhYnNvbHV0ZSB2YWx1ZSBvZiBpbnRlZ2VyXG5leHBvcnRzLmFicyA9IGZ1bmN0aW9uKHYpIHtcbiAgdmFyIG1hc2sgPSB2ID4+IChJTlRfQklUUy0xKTtcbiAgcmV0dXJuICh2IF4gbWFzaykgLSBtYXNrO1xufVxuXG4vL0NvbXB1dGVzIG1pbmltdW0gb2YgaW50ZWdlcnMgeCBhbmQgeVxuZXhwb3J0cy5taW4gPSBmdW5jdGlvbih4LCB5KSB7XG4gIHJldHVybiB5IF4gKCh4IF4geSkgJiAtKHggPCB5KSk7XG59XG5cbi8vQ29tcHV0ZXMgbWF4aW11bSBvZiBpbnRlZ2VycyB4IGFuZCB5XG5leHBvcnRzLm1heCA9IGZ1bmN0aW9uKHgsIHkpIHtcbiAgcmV0dXJuIHggXiAoKHggXiB5KSAmIC0oeCA8IHkpKTtcbn1cblxuLy9DaGVja3MgaWYgYSBudW1iZXIgaXMgYSBwb3dlciBvZiB0d29cbmV4cG9ydHMuaXNQb3cyID0gZnVuY3Rpb24odikge1xuICByZXR1cm4gISh2ICYgKHYtMSkpICYmICghIXYpO1xufVxuXG4vL0NvbXB1dGVzIGxvZyBiYXNlIDIgb2YgdlxuZXhwb3J0cy5sb2cyID0gZnVuY3Rpb24odikge1xuICB2YXIgciwgc2hpZnQ7XG4gIHIgPSAgICAgKHYgPiAweEZGRkYpIDw8IDQ7IHYgPj4+PSByO1xuICBzaGlmdCA9ICh2ID4gMHhGRiAgKSA8PCAzOyB2ID4+Pj0gc2hpZnQ7IHIgfD0gc2hpZnQ7XG4gIHNoaWZ0ID0gKHYgPiAweEYgICApIDw8IDI7IHYgPj4+PSBzaGlmdDsgciB8PSBzaGlmdDtcbiAgc2hpZnQgPSAodiA+IDB4MyAgICkgPDwgMTsgdiA+Pj49IHNoaWZ0OyByIHw9IHNoaWZ0O1xuICByZXR1cm4gciB8ICh2ID4+IDEpO1xufVxuXG4vL0NvbXB1dGVzIGxvZyBiYXNlIDEwIG9mIHZcbmV4cG9ydHMubG9nMTAgPSBmdW5jdGlvbih2KSB7XG4gIHJldHVybiAgKHYgPj0gMTAwMDAwMDAwMCkgPyA5IDogKHYgPj0gMTAwMDAwMDAwKSA/IDggOiAodiA+PSAxMDAwMDAwMCkgPyA3IDpcbiAgICAgICAgICAodiA+PSAxMDAwMDAwKSA/IDYgOiAodiA+PSAxMDAwMDApID8gNSA6ICh2ID49IDEwMDAwKSA/IDQgOlxuICAgICAgICAgICh2ID49IDEwMDApID8gMyA6ICh2ID49IDEwMCkgPyAyIDogKHYgPj0gMTApID8gMSA6IDA7XG59XG5cbi8vQ291bnRzIG51bWJlciBvZiBiaXRzXG5leHBvcnRzLnBvcENvdW50ID0gZnVuY3Rpb24odikge1xuICB2ID0gdiAtICgodiA+Pj4gMSkgJiAweDU1NTU1NTU1KTtcbiAgdiA9ICh2ICYgMHgzMzMzMzMzMykgKyAoKHYgPj4+IDIpICYgMHgzMzMzMzMzMyk7XG4gIHJldHVybiAoKHYgKyAodiA+Pj4gNCkgJiAweEYwRjBGMEYpICogMHgxMDEwMTAxKSA+Pj4gMjQ7XG59XG5cbi8vQ291bnRzIG51bWJlciBvZiB0cmFpbGluZyB6ZXJvc1xuZnVuY3Rpb24gY291bnRUcmFpbGluZ1plcm9zKHYpIHtcbiAgdmFyIGMgPSAzMjtcbiAgdiAmPSAtdjtcbiAgaWYgKHYpIGMtLTtcbiAgaWYgKHYgJiAweDAwMDBGRkZGKSBjIC09IDE2O1xuICBpZiAodiAmIDB4MDBGRjAwRkYpIGMgLT0gODtcbiAgaWYgKHYgJiAweDBGMEYwRjBGKSBjIC09IDQ7XG4gIGlmICh2ICYgMHgzMzMzMzMzMykgYyAtPSAyO1xuICBpZiAodiAmIDB4NTU1NTU1NTUpIGMgLT0gMTtcbiAgcmV0dXJuIGM7XG59XG5leHBvcnRzLmNvdW50VHJhaWxpbmdaZXJvcyA9IGNvdW50VHJhaWxpbmdaZXJvcztcblxuLy9Sb3VuZHMgdG8gbmV4dCBwb3dlciBvZiAyXG5leHBvcnRzLm5leHRQb3cyID0gZnVuY3Rpb24odikge1xuICB2ICs9IHYgPT09IDA7XG4gIC0tdjtcbiAgdiB8PSB2ID4+PiAxO1xuICB2IHw9IHYgPj4+IDI7XG4gIHYgfD0gdiA+Pj4gNDtcbiAgdiB8PSB2ID4+PiA4O1xuICB2IHw9IHYgPj4+IDE2O1xuICByZXR1cm4gdiArIDE7XG59XG5cbi8vUm91bmRzIGRvd24gdG8gcHJldmlvdXMgcG93ZXIgb2YgMlxuZXhwb3J0cy5wcmV2UG93MiA9IGZ1bmN0aW9uKHYpIHtcbiAgdiB8PSB2ID4+PiAxO1xuICB2IHw9IHYgPj4+IDI7XG4gIHYgfD0gdiA+Pj4gNDtcbiAgdiB8PSB2ID4+PiA4O1xuICB2IHw9IHYgPj4+IDE2O1xuICByZXR1cm4gdiAtICh2Pj4+MSk7XG59XG5cbi8vQ29tcHV0ZXMgcGFyaXR5IG9mIHdvcmRcbmV4cG9ydHMucGFyaXR5ID0gZnVuY3Rpb24odikge1xuICB2IF49IHYgPj4+IDE2O1xuICB2IF49IHYgPj4+IDg7XG4gIHYgXj0gdiA+Pj4gNDtcbiAgdiAmPSAweGY7XG4gIHJldHVybiAoMHg2OTk2ID4+PiB2KSAmIDE7XG59XG5cbnZhciBSRVZFUlNFX1RBQkxFID0gbmV3IEFycmF5KDI1Nik7XG5cbihmdW5jdGlvbih0YWIpIHtcbiAgZm9yKHZhciBpPTA7IGk8MjU2OyArK2kpIHtcbiAgICB2YXIgdiA9IGksIHIgPSBpLCBzID0gNztcbiAgICBmb3IgKHYgPj4+PSAxOyB2OyB2ID4+Pj0gMSkge1xuICAgICAgciA8PD0gMTtcbiAgICAgIHIgfD0gdiAmIDE7XG4gICAgICAtLXM7XG4gICAgfVxuICAgIHRhYltpXSA9IChyIDw8IHMpICYgMHhmZjtcbiAgfVxufSkoUkVWRVJTRV9UQUJMRSk7XG5cbi8vUmV2ZXJzZSBiaXRzIGluIGEgMzIgYml0IHdvcmRcbmV4cG9ydHMucmV2ZXJzZSA9IGZ1bmN0aW9uKHYpIHtcbiAgcmV0dXJuICAoUkVWRVJTRV9UQUJMRVsgdiAgICAgICAgICYgMHhmZl0gPDwgMjQpIHxcbiAgICAgICAgICAoUkVWRVJTRV9UQUJMRVsodiA+Pj4gOCkgICYgMHhmZl0gPDwgMTYpIHxcbiAgICAgICAgICAoUkVWRVJTRV9UQUJMRVsodiA+Pj4gMTYpICYgMHhmZl0gPDwgOCkgIHxcbiAgICAgICAgICAgUkVWRVJTRV9UQUJMRVsodiA+Pj4gMjQpICYgMHhmZl07XG59XG5cbi8vSW50ZXJsZWF2ZSBiaXRzIG9mIDIgY29vcmRpbmF0ZXMgd2l0aCAxNiBiaXRzLiAgVXNlZnVsIGZvciBmYXN0IHF1YWR0cmVlIGNvZGVzXG5leHBvcnRzLmludGVybGVhdmUyID0gZnVuY3Rpb24oeCwgeSkge1xuICB4ICY9IDB4RkZGRjtcbiAgeCA9ICh4IHwgKHggPDwgOCkpICYgMHgwMEZGMDBGRjtcbiAgeCA9ICh4IHwgKHggPDwgNCkpICYgMHgwRjBGMEYwRjtcbiAgeCA9ICh4IHwgKHggPDwgMikpICYgMHgzMzMzMzMzMztcbiAgeCA9ICh4IHwgKHggPDwgMSkpICYgMHg1NTU1NTU1NTtcblxuICB5ICY9IDB4RkZGRjtcbiAgeSA9ICh5IHwgKHkgPDwgOCkpICYgMHgwMEZGMDBGRjtcbiAgeSA9ICh5IHwgKHkgPDwgNCkpICYgMHgwRjBGMEYwRjtcbiAgeSA9ICh5IHwgKHkgPDwgMikpICYgMHgzMzMzMzMzMztcbiAgeSA9ICh5IHwgKHkgPDwgMSkpICYgMHg1NTU1NTU1NTtcblxuICByZXR1cm4geCB8ICh5IDw8IDEpO1xufVxuXG4vL0V4dHJhY3RzIHRoZSBudGggaW50ZXJsZWF2ZWQgY29tcG9uZW50XG5leHBvcnRzLmRlaW50ZXJsZWF2ZTIgPSBmdW5jdGlvbih2LCBuKSB7XG4gIHYgPSAodiA+Pj4gbikgJiAweDU1NTU1NTU1O1xuICB2ID0gKHYgfCAodiA+Pj4gMSkpICAmIDB4MzMzMzMzMzM7XG4gIHYgPSAodiB8ICh2ID4+PiAyKSkgICYgMHgwRjBGMEYwRjtcbiAgdiA9ICh2IHwgKHYgPj4+IDQpKSAgJiAweDAwRkYwMEZGO1xuICB2ID0gKHYgfCAodiA+Pj4gMTYpKSAmIDB4MDAwRkZGRjtcbiAgcmV0dXJuICh2IDw8IDE2KSA+PiAxNjtcbn1cblxuXG4vL0ludGVybGVhdmUgYml0cyBvZiAzIGNvb3JkaW5hdGVzLCBlYWNoIHdpdGggMTAgYml0cy4gIFVzZWZ1bCBmb3IgZmFzdCBvY3RyZWUgY29kZXNcbmV4cG9ydHMuaW50ZXJsZWF2ZTMgPSBmdW5jdGlvbih4LCB5LCB6KSB7XG4gIHggJj0gMHgzRkY7XG4gIHggID0gKHggfCAoeDw8MTYpKSAmIDQyNzgxOTAzMzU7XG4gIHggID0gKHggfCAoeDw8OCkpICAmIDI1MTcxOTY5NTtcbiAgeCAgPSAoeCB8ICh4PDw0KSkgICYgMzI3MjM1NjAzNTtcbiAgeCAgPSAoeCB8ICh4PDwyKSkgICYgMTIyNzEzMzUxMztcblxuICB5ICY9IDB4M0ZGO1xuICB5ICA9ICh5IHwgKHk8PDE2KSkgJiA0Mjc4MTkwMzM1O1xuICB5ICA9ICh5IHwgKHk8PDgpKSAgJiAyNTE3MTk2OTU7XG4gIHkgID0gKHkgfCAoeTw8NCkpICAmIDMyNzIzNTYwMzU7XG4gIHkgID0gKHkgfCAoeTw8MikpICAmIDEyMjcxMzM1MTM7XG4gIHggfD0gKHkgPDwgMSk7XG4gIFxuICB6ICY9IDB4M0ZGO1xuICB6ICA9ICh6IHwgKHo8PDE2KSkgJiA0Mjc4MTkwMzM1O1xuICB6ICA9ICh6IHwgKHo8PDgpKSAgJiAyNTE3MTk2OTU7XG4gIHogID0gKHogfCAoejw8NCkpICAmIDMyNzIzNTYwMzU7XG4gIHogID0gKHogfCAoejw8MikpICAmIDEyMjcxMzM1MTM7XG4gIFxuICByZXR1cm4geCB8ICh6IDw8IDIpO1xufVxuXG4vL0V4dHJhY3RzIG50aCBpbnRlcmxlYXZlZCBjb21wb25lbnQgb2YgYSAzLXR1cGxlXG5leHBvcnRzLmRlaW50ZXJsZWF2ZTMgPSBmdW5jdGlvbih2LCBuKSB7XG4gIHYgPSAodiA+Pj4gbikgICAgICAgJiAxMjI3MTMzNTEzO1xuICB2ID0gKHYgfCAodj4+PjIpKSAgICYgMzI3MjM1NjAzNTtcbiAgdiA9ICh2IHwgKHY+Pj40KSkgICAmIDI1MTcxOTY5NTtcbiAgdiA9ICh2IHwgKHY+Pj44KSkgICAmIDQyNzgxOTAzMzU7XG4gIHYgPSAodiB8ICh2Pj4+MTYpKSAgJiAweDNGRjtcbiAgcmV0dXJuICh2PDwyMik+PjIyO1xufVxuXG4vL0NvbXB1dGVzIG5leHQgY29tYmluYXRpb24gaW4gY29sZXhpY29ncmFwaGljIG9yZGVyICh0aGlzIGlzIG1pc3Rha2VubHkgY2FsbGVkIG5leHRQZXJtdXRhdGlvbiBvbiB0aGUgYml0IHR3aWRkbGluZyBoYWNrcyBwYWdlKVxuZXhwb3J0cy5uZXh0Q29tYmluYXRpb24gPSBmdW5jdGlvbih2KSB7XG4gIHZhciB0ID0gdiB8ICh2IC0gMSk7XG4gIHJldHVybiAodCArIDEpIHwgKCgofnQgJiAtfnQpIC0gMSkgPj4+IChjb3VudFRyYWlsaW5nWmVyb3ModikgKyAxKSk7XG59XG5cbiIsIihmdW5jdGlvbiAobW9kdWxlLCBleHBvcnRzKSB7XG4gICd1c2Ugc3RyaWN0JztcblxuICAvLyBVdGlsc1xuICBmdW5jdGlvbiBhc3NlcnQgKHZhbCwgbXNnKSB7XG4gICAgaWYgKCF2YWwpIHRocm93IG5ldyBFcnJvcihtc2cgfHwgJ0Fzc2VydGlvbiBmYWlsZWQnKTtcbiAgfVxuXG4gIC8vIENvdWxkIHVzZSBgaW5oZXJpdHNgIG1vZHVsZSwgYnV0IGRvbid0IHdhbnQgdG8gbW92ZSBmcm9tIHNpbmdsZSBmaWxlXG4gIC8vIGFyY2hpdGVjdHVyZSB5ZXQuXG4gIGZ1bmN0aW9uIGluaGVyaXRzIChjdG9yLCBzdXBlckN0b3IpIHtcbiAgICBjdG9yLnN1cGVyXyA9IHN1cGVyQ3RvcjtcbiAgICB2YXIgVGVtcEN0b3IgPSBmdW5jdGlvbiAoKSB7fTtcbiAgICBUZW1wQ3Rvci5wcm90b3R5cGUgPSBzdXBlckN0b3IucHJvdG90eXBlO1xuICAgIGN0b3IucHJvdG90eXBlID0gbmV3IFRlbXBDdG9yKCk7XG4gICAgY3Rvci5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBjdG9yO1xuICB9XG5cbiAgLy8gQk5cblxuICBmdW5jdGlvbiBCTiAobnVtYmVyLCBiYXNlLCBlbmRpYW4pIHtcbiAgICBpZiAoQk4uaXNCTihudW1iZXIpKSB7XG4gICAgICByZXR1cm4gbnVtYmVyO1xuICAgIH1cblxuICAgIHRoaXMubmVnYXRpdmUgPSAwO1xuICAgIHRoaXMud29yZHMgPSBudWxsO1xuICAgIHRoaXMubGVuZ3RoID0gMDtcblxuICAgIC8vIFJlZHVjdGlvbiBjb250ZXh0XG4gICAgdGhpcy5yZWQgPSBudWxsO1xuXG4gICAgaWYgKG51bWJlciAhPT0gbnVsbCkge1xuICAgICAgaWYgKGJhc2UgPT09ICdsZScgfHwgYmFzZSA9PT0gJ2JlJykge1xuICAgICAgICBlbmRpYW4gPSBiYXNlO1xuICAgICAgICBiYXNlID0gMTA7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuX2luaXQobnVtYmVyIHx8IDAsIGJhc2UgfHwgMTAsIGVuZGlhbiB8fCAnYmUnKTtcbiAgICB9XG4gIH1cbiAgaWYgKHR5cGVvZiBtb2R1bGUgPT09ICdvYmplY3QnKSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBCTjtcbiAgfSBlbHNlIHtcbiAgICBleHBvcnRzLkJOID0gQk47XG4gIH1cblxuICBCTi5CTiA9IEJOO1xuICBCTi53b3JkU2l6ZSA9IDI2O1xuXG4gIHZhciBCdWZmZXI7XG4gIHRyeSB7XG4gICAgQnVmZmVyID0gcmVxdWlyZSgnYnVmZmVyJykuQnVmZmVyO1xuICB9IGNhdGNoIChlKSB7XG4gIH1cblxuICBCTi5pc0JOID0gZnVuY3Rpb24gaXNCTiAobnVtKSB7XG4gICAgaWYgKG51bSBpbnN0YW5jZW9mIEJOKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICByZXR1cm4gbnVtICE9PSBudWxsICYmIHR5cGVvZiBudW0gPT09ICdvYmplY3QnICYmXG4gICAgICBudW0uY29uc3RydWN0b3Iud29yZFNpemUgPT09IEJOLndvcmRTaXplICYmIEFycmF5LmlzQXJyYXkobnVtLndvcmRzKTtcbiAgfTtcblxuICBCTi5tYXggPSBmdW5jdGlvbiBtYXggKGxlZnQsIHJpZ2h0KSB7XG4gICAgaWYgKGxlZnQuY21wKHJpZ2h0KSA+IDApIHJldHVybiBsZWZ0O1xuICAgIHJldHVybiByaWdodDtcbiAgfTtcblxuICBCTi5taW4gPSBmdW5jdGlvbiBtaW4gKGxlZnQsIHJpZ2h0KSB7XG4gICAgaWYgKGxlZnQuY21wKHJpZ2h0KSA8IDApIHJldHVybiBsZWZ0O1xuICAgIHJldHVybiByaWdodDtcbiAgfTtcblxuICBCTi5wcm90b3R5cGUuX2luaXQgPSBmdW5jdGlvbiBpbml0IChudW1iZXIsIGJhc2UsIGVuZGlhbikge1xuICAgIGlmICh0eXBlb2YgbnVtYmVyID09PSAnbnVtYmVyJykge1xuICAgICAgcmV0dXJuIHRoaXMuX2luaXROdW1iZXIobnVtYmVyLCBiYXNlLCBlbmRpYW4pO1xuICAgIH1cblxuICAgIGlmICh0eXBlb2YgbnVtYmVyID09PSAnb2JqZWN0Jykge1xuICAgICAgcmV0dXJuIHRoaXMuX2luaXRBcnJheShudW1iZXIsIGJhc2UsIGVuZGlhbik7XG4gICAgfVxuXG4gICAgaWYgKGJhc2UgPT09ICdoZXgnKSB7XG4gICAgICBiYXNlID0gMTY7XG4gICAgfVxuICAgIGFzc2VydChiYXNlID09PSAoYmFzZSB8IDApICYmIGJhc2UgPj0gMiAmJiBiYXNlIDw9IDM2KTtcblxuICAgIG51bWJlciA9IG51bWJlci50b1N0cmluZygpLnJlcGxhY2UoL1xccysvZywgJycpO1xuICAgIHZhciBzdGFydCA9IDA7XG4gICAgaWYgKG51bWJlclswXSA9PT0gJy0nKSB7XG4gICAgICBzdGFydCsrO1xuICAgIH1cblxuICAgIGlmIChiYXNlID09PSAxNikge1xuICAgICAgdGhpcy5fcGFyc2VIZXgobnVtYmVyLCBzdGFydCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuX3BhcnNlQmFzZShudW1iZXIsIGJhc2UsIHN0YXJ0KTtcbiAgICB9XG5cbiAgICBpZiAobnVtYmVyWzBdID09PSAnLScpIHtcbiAgICAgIHRoaXMubmVnYXRpdmUgPSAxO1xuICAgIH1cblxuICAgIHRoaXMuc3RyaXAoKTtcblxuICAgIGlmIChlbmRpYW4gIT09ICdsZScpIHJldHVybjtcblxuICAgIHRoaXMuX2luaXRBcnJheSh0aGlzLnRvQXJyYXkoKSwgYmFzZSwgZW5kaWFuKTtcbiAgfTtcblxuICBCTi5wcm90b3R5cGUuX2luaXROdW1iZXIgPSBmdW5jdGlvbiBfaW5pdE51bWJlciAobnVtYmVyLCBiYXNlLCBlbmRpYW4pIHtcbiAgICBpZiAobnVtYmVyIDwgMCkge1xuICAgICAgdGhpcy5uZWdhdGl2ZSA9IDE7XG4gICAgICBudW1iZXIgPSAtbnVtYmVyO1xuICAgIH1cbiAgICBpZiAobnVtYmVyIDwgMHg0MDAwMDAwKSB7XG4gICAgICB0aGlzLndvcmRzID0gWyBudW1iZXIgJiAweDNmZmZmZmYgXTtcbiAgICAgIHRoaXMubGVuZ3RoID0gMTtcbiAgICB9IGVsc2UgaWYgKG51bWJlciA8IDB4MTAwMDAwMDAwMDAwMDApIHtcbiAgICAgIHRoaXMud29yZHMgPSBbXG4gICAgICAgIG51bWJlciAmIDB4M2ZmZmZmZixcbiAgICAgICAgKG51bWJlciAvIDB4NDAwMDAwMCkgJiAweDNmZmZmZmZcbiAgICAgIF07XG4gICAgICB0aGlzLmxlbmd0aCA9IDI7XG4gICAgfSBlbHNlIHtcbiAgICAgIGFzc2VydChudW1iZXIgPCAweDIwMDAwMDAwMDAwMDAwKTsgLy8gMiBeIDUzICh1bnNhZmUpXG4gICAgICB0aGlzLndvcmRzID0gW1xuICAgICAgICBudW1iZXIgJiAweDNmZmZmZmYsXG4gICAgICAgIChudW1iZXIgLyAweDQwMDAwMDApICYgMHgzZmZmZmZmLFxuICAgICAgICAxXG4gICAgICBdO1xuICAgICAgdGhpcy5sZW5ndGggPSAzO1xuICAgIH1cblxuICAgIGlmIChlbmRpYW4gIT09ICdsZScpIHJldHVybjtcblxuICAgIC8vIFJldmVyc2UgdGhlIGJ5dGVzXG4gICAgdGhpcy5faW5pdEFycmF5KHRoaXMudG9BcnJheSgpLCBiYXNlLCBlbmRpYW4pO1xuICB9O1xuXG4gIEJOLnByb3RvdHlwZS5faW5pdEFycmF5ID0gZnVuY3Rpb24gX2luaXRBcnJheSAobnVtYmVyLCBiYXNlLCBlbmRpYW4pIHtcbiAgICAvLyBQZXJoYXBzIGEgVWludDhBcnJheVxuICAgIGFzc2VydCh0eXBlb2YgbnVtYmVyLmxlbmd0aCA9PT0gJ251bWJlcicpO1xuICAgIGlmIChudW1iZXIubGVuZ3RoIDw9IDApIHtcbiAgICAgIHRoaXMud29yZHMgPSBbIDAgXTtcbiAgICAgIHRoaXMubGVuZ3RoID0gMTtcbiAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHRoaXMubGVuZ3RoID0gTWF0aC5jZWlsKG51bWJlci5sZW5ndGggLyAzKTtcbiAgICB0aGlzLndvcmRzID0gbmV3IEFycmF5KHRoaXMubGVuZ3RoKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIHRoaXMud29yZHNbaV0gPSAwO1xuICAgIH1cblxuICAgIHZhciBqLCB3O1xuICAgIHZhciBvZmYgPSAwO1xuICAgIGlmIChlbmRpYW4gPT09ICdiZScpIHtcbiAgICAgIGZvciAoaSA9IG51bWJlci5sZW5ndGggLSAxLCBqID0gMDsgaSA+PSAwOyBpIC09IDMpIHtcbiAgICAgICAgdyA9IG51bWJlcltpXSB8IChudW1iZXJbaSAtIDFdIDw8IDgpIHwgKG51bWJlcltpIC0gMl0gPDwgMTYpO1xuICAgICAgICB0aGlzLndvcmRzW2pdIHw9ICh3IDw8IG9mZikgJiAweDNmZmZmZmY7XG4gICAgICAgIHRoaXMud29yZHNbaiArIDFdID0gKHcgPj4+ICgyNiAtIG9mZikpICYgMHgzZmZmZmZmO1xuICAgICAgICBvZmYgKz0gMjQ7XG4gICAgICAgIGlmIChvZmYgPj0gMjYpIHtcbiAgICAgICAgICBvZmYgLT0gMjY7XG4gICAgICAgICAgaisrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChlbmRpYW4gPT09ICdsZScpIHtcbiAgICAgIGZvciAoaSA9IDAsIGogPSAwOyBpIDwgbnVtYmVyLmxlbmd0aDsgaSArPSAzKSB7XG4gICAgICAgIHcgPSBudW1iZXJbaV0gfCAobnVtYmVyW2kgKyAxXSA8PCA4KSB8IChudW1iZXJbaSArIDJdIDw8IDE2KTtcbiAgICAgICAgdGhpcy53b3Jkc1tqXSB8PSAodyA8PCBvZmYpICYgMHgzZmZmZmZmO1xuICAgICAgICB0aGlzLndvcmRzW2ogKyAxXSA9ICh3ID4+PiAoMjYgLSBvZmYpKSAmIDB4M2ZmZmZmZjtcbiAgICAgICAgb2ZmICs9IDI0O1xuICAgICAgICBpZiAob2ZmID49IDI2KSB7XG4gICAgICAgICAgb2ZmIC09IDI2O1xuICAgICAgICAgIGorKztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdGhpcy5zdHJpcCgpO1xuICB9O1xuXG4gIGZ1bmN0aW9uIHBhcnNlSGV4IChzdHIsIHN0YXJ0LCBlbmQpIHtcbiAgICB2YXIgciA9IDA7XG4gICAgdmFyIGxlbiA9IE1hdGgubWluKHN0ci5sZW5ndGgsIGVuZCk7XG4gICAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgbGVuOyBpKyspIHtcbiAgICAgIHZhciBjID0gc3RyLmNoYXJDb2RlQXQoaSkgLSA0ODtcblxuICAgICAgciA8PD0gNDtcblxuICAgICAgLy8gJ2EnIC0gJ2YnXG4gICAgICBpZiAoYyA+PSA0OSAmJiBjIDw9IDU0KSB7XG4gICAgICAgIHIgfD0gYyAtIDQ5ICsgMHhhO1xuXG4gICAgICAvLyAnQScgLSAnRidcbiAgICAgIH0gZWxzZSBpZiAoYyA+PSAxNyAmJiBjIDw9IDIyKSB7XG4gICAgICAgIHIgfD0gYyAtIDE3ICsgMHhhO1xuXG4gICAgICAvLyAnMCcgLSAnOSdcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHIgfD0gYyAmIDB4ZjtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHI7XG4gIH1cblxuICBCTi5wcm90b3R5cGUuX3BhcnNlSGV4ID0gZnVuY3Rpb24gX3BhcnNlSGV4IChudW1iZXIsIHN0YXJ0KSB7XG4gICAgLy8gQ3JlYXRlIHBvc3NpYmx5IGJpZ2dlciBhcnJheSB0byBlbnN1cmUgdGhhdCBpdCBmaXRzIHRoZSBudW1iZXJcbiAgICB0aGlzLmxlbmd0aCA9IE1hdGguY2VpbCgobnVtYmVyLmxlbmd0aCAtIHN0YXJ0KSAvIDYpO1xuICAgIHRoaXMud29yZHMgPSBuZXcgQXJyYXkodGhpcy5sZW5ndGgpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5sZW5ndGg7IGkrKykge1xuICAgICAgdGhpcy53b3Jkc1tpXSA9IDA7XG4gICAgfVxuXG4gICAgdmFyIGosIHc7XG4gICAgLy8gU2NhbiAyNC1iaXQgY2h1bmtzIGFuZCBhZGQgdGhlbSB0byB0aGUgbnVtYmVyXG4gICAgdmFyIG9mZiA9IDA7XG4gICAgZm9yIChpID0gbnVtYmVyLmxlbmd0aCAtIDYsIGogPSAwOyBpID49IHN0YXJ0OyBpIC09IDYpIHtcbiAgICAgIHcgPSBwYXJzZUhleChudW1iZXIsIGksIGkgKyA2KTtcbiAgICAgIHRoaXMud29yZHNbal0gfD0gKHcgPDwgb2ZmKSAmIDB4M2ZmZmZmZjtcbiAgICAgIC8vIE5PVEU6IGAweDNmZmZmZmAgaXMgaW50ZW50aW9uYWwgaGVyZSwgMjZiaXRzIG1heCBzaGlmdCArIDI0Yml0IGhleCBsaW1iXG4gICAgICB0aGlzLndvcmRzW2ogKyAxXSB8PSB3ID4+PiAoMjYgLSBvZmYpICYgMHgzZmZmZmY7XG4gICAgICBvZmYgKz0gMjQ7XG4gICAgICBpZiAob2ZmID49IDI2KSB7XG4gICAgICAgIG9mZiAtPSAyNjtcbiAgICAgICAgaisrO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoaSArIDYgIT09IHN0YXJ0KSB7XG4gICAgICB3ID0gcGFyc2VIZXgobnVtYmVyLCBzdGFydCwgaSArIDYpO1xuICAgICAgdGhpcy53b3Jkc1tqXSB8PSAodyA8PCBvZmYpICYgMHgzZmZmZmZmO1xuICAgICAgdGhpcy53b3Jkc1tqICsgMV0gfD0gdyA+Pj4gKDI2IC0gb2ZmKSAmIDB4M2ZmZmZmO1xuICAgIH1cbiAgICB0aGlzLnN0cmlwKCk7XG4gIH07XG5cbiAgZnVuY3Rpb24gcGFyc2VCYXNlIChzdHIsIHN0YXJ0LCBlbmQsIG11bCkge1xuICAgIHZhciByID0gMDtcbiAgICB2YXIgbGVuID0gTWF0aC5taW4oc3RyLmxlbmd0aCwgZW5kKTtcbiAgICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPCBsZW47IGkrKykge1xuICAgICAgdmFyIGMgPSBzdHIuY2hhckNvZGVBdChpKSAtIDQ4O1xuXG4gICAgICByICo9IG11bDtcblxuICAgICAgLy8gJ2EnXG4gICAgICBpZiAoYyA+PSA0OSkge1xuICAgICAgICByICs9IGMgLSA0OSArIDB4YTtcblxuICAgICAgLy8gJ0EnXG4gICAgICB9IGVsc2UgaWYgKGMgPj0gMTcpIHtcbiAgICAgICAgciArPSBjIC0gMTcgKyAweGE7XG5cbiAgICAgIC8vICcwJyAtICc5J1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgciArPSBjO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcjtcbiAgfVxuXG4gIEJOLnByb3RvdHlwZS5fcGFyc2VCYXNlID0gZnVuY3Rpb24gX3BhcnNlQmFzZSAobnVtYmVyLCBiYXNlLCBzdGFydCkge1xuICAgIC8vIEluaXRpYWxpemUgYXMgemVyb1xuICAgIHRoaXMud29yZHMgPSBbIDAgXTtcbiAgICB0aGlzLmxlbmd0aCA9IDE7XG5cbiAgICAvLyBGaW5kIGxlbmd0aCBvZiBsaW1iIGluIGJhc2VcbiAgICBmb3IgKHZhciBsaW1iTGVuID0gMCwgbGltYlBvdyA9IDE7IGxpbWJQb3cgPD0gMHgzZmZmZmZmOyBsaW1iUG93ICo9IGJhc2UpIHtcbiAgICAgIGxpbWJMZW4rKztcbiAgICB9XG4gICAgbGltYkxlbi0tO1xuICAgIGxpbWJQb3cgPSAobGltYlBvdyAvIGJhc2UpIHwgMDtcblxuICAgIHZhciB0b3RhbCA9IG51bWJlci5sZW5ndGggLSBzdGFydDtcbiAgICB2YXIgbW9kID0gdG90YWwgJSBsaW1iTGVuO1xuICAgIHZhciBlbmQgPSBNYXRoLm1pbih0b3RhbCwgdG90YWwgLSBtb2QpICsgc3RhcnQ7XG5cbiAgICB2YXIgd29yZCA9IDA7XG4gICAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpICs9IGxpbWJMZW4pIHtcbiAgICAgIHdvcmQgPSBwYXJzZUJhc2UobnVtYmVyLCBpLCBpICsgbGltYkxlbiwgYmFzZSk7XG5cbiAgICAgIHRoaXMuaW11bG4obGltYlBvdyk7XG4gICAgICBpZiAodGhpcy53b3Jkc1swXSArIHdvcmQgPCAweDQwMDAwMDApIHtcbiAgICAgICAgdGhpcy53b3Jkc1swXSArPSB3b3JkO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5faWFkZG4od29yZCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKG1vZCAhPT0gMCkge1xuICAgICAgdmFyIHBvdyA9IDE7XG4gICAgICB3b3JkID0gcGFyc2VCYXNlKG51bWJlciwgaSwgbnVtYmVyLmxlbmd0aCwgYmFzZSk7XG5cbiAgICAgIGZvciAoaSA9IDA7IGkgPCBtb2Q7IGkrKykge1xuICAgICAgICBwb3cgKj0gYmFzZTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5pbXVsbihwb3cpO1xuICAgICAgaWYgKHRoaXMud29yZHNbMF0gKyB3b3JkIDwgMHg0MDAwMDAwKSB7XG4gICAgICAgIHRoaXMud29yZHNbMF0gKz0gd29yZDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuX2lhZGRuKHdvcmQpO1xuICAgICAgfVxuICAgIH1cbiAgfTtcblxuICBCTi5wcm90b3R5cGUuY29weSA9IGZ1bmN0aW9uIGNvcHkgKGRlc3QpIHtcbiAgICBkZXN0LndvcmRzID0gbmV3IEFycmF5KHRoaXMubGVuZ3RoKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGRlc3Qud29yZHNbaV0gPSB0aGlzLndvcmRzW2ldO1xuICAgIH1cbiAgICBkZXN0Lmxlbmd0aCA9IHRoaXMubGVuZ3RoO1xuICAgIGRlc3QubmVnYXRpdmUgPSB0aGlzLm5lZ2F0aXZlO1xuICAgIGRlc3QucmVkID0gdGhpcy5yZWQ7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLmNsb25lID0gZnVuY3Rpb24gY2xvbmUgKCkge1xuICAgIHZhciByID0gbmV3IEJOKG51bGwpO1xuICAgIHRoaXMuY29weShyKTtcbiAgICByZXR1cm4gcjtcbiAgfTtcblxuICBCTi5wcm90b3R5cGUuX2V4cGFuZCA9IGZ1bmN0aW9uIF9leHBhbmQgKHNpemUpIHtcbiAgICB3aGlsZSAodGhpcy5sZW5ndGggPCBzaXplKSB7XG4gICAgICB0aGlzLndvcmRzW3RoaXMubGVuZ3RoKytdID0gMDtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXM7XG4gIH07XG5cbiAgLy8gUmVtb3ZlIGxlYWRpbmcgYDBgIGZyb20gYHRoaXNgXG4gIEJOLnByb3RvdHlwZS5zdHJpcCA9IGZ1bmN0aW9uIHN0cmlwICgpIHtcbiAgICB3aGlsZSAodGhpcy5sZW5ndGggPiAxICYmIHRoaXMud29yZHNbdGhpcy5sZW5ndGggLSAxXSA9PT0gMCkge1xuICAgICAgdGhpcy5sZW5ndGgtLTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuX25vcm1TaWduKCk7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLl9ub3JtU2lnbiA9IGZ1bmN0aW9uIF9ub3JtU2lnbiAoKSB7XG4gICAgLy8gLTAgPSAwXG4gICAgaWYgKHRoaXMubGVuZ3RoID09PSAxICYmIHRoaXMud29yZHNbMF0gPT09IDApIHtcbiAgICAgIHRoaXMubmVnYXRpdmUgPSAwO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcztcbiAgfTtcblxuICBCTi5wcm90b3R5cGUuaW5zcGVjdCA9IGZ1bmN0aW9uIGluc3BlY3QgKCkge1xuICAgIHJldHVybiAodGhpcy5yZWQgPyAnPEJOLVI6ICcgOiAnPEJOOiAnKSArIHRoaXMudG9TdHJpbmcoMTYpICsgJz4nO1xuICB9O1xuXG4gIC8qXG5cbiAgdmFyIHplcm9zID0gW107XG4gIHZhciBncm91cFNpemVzID0gW107XG4gIHZhciBncm91cEJhc2VzID0gW107XG5cbiAgdmFyIHMgPSAnJztcbiAgdmFyIGkgPSAtMTtcbiAgd2hpbGUgKCsraSA8IEJOLndvcmRTaXplKSB7XG4gICAgemVyb3NbaV0gPSBzO1xuICAgIHMgKz0gJzAnO1xuICB9XG4gIGdyb3VwU2l6ZXNbMF0gPSAwO1xuICBncm91cFNpemVzWzFdID0gMDtcbiAgZ3JvdXBCYXNlc1swXSA9IDA7XG4gIGdyb3VwQmFzZXNbMV0gPSAwO1xuICB2YXIgYmFzZSA9IDIgLSAxO1xuICB3aGlsZSAoKytiYXNlIDwgMzYgKyAxKSB7XG4gICAgdmFyIGdyb3VwU2l6ZSA9IDA7XG4gICAgdmFyIGdyb3VwQmFzZSA9IDE7XG4gICAgd2hpbGUgKGdyb3VwQmFzZSA8ICgxIDw8IEJOLndvcmRTaXplKSAvIGJhc2UpIHtcbiAgICAgIGdyb3VwQmFzZSAqPSBiYXNlO1xuICAgICAgZ3JvdXBTaXplICs9IDE7XG4gICAgfVxuICAgIGdyb3VwU2l6ZXNbYmFzZV0gPSBncm91cFNpemU7XG4gICAgZ3JvdXBCYXNlc1tiYXNlXSA9IGdyb3VwQmFzZTtcbiAgfVxuXG4gICovXG5cbiAgdmFyIHplcm9zID0gW1xuICAgICcnLFxuICAgICcwJyxcbiAgICAnMDAnLFxuICAgICcwMDAnLFxuICAgICcwMDAwJyxcbiAgICAnMDAwMDAnLFxuICAgICcwMDAwMDAnLFxuICAgICcwMDAwMDAwJyxcbiAgICAnMDAwMDAwMDAnLFxuICAgICcwMDAwMDAwMDAnLFxuICAgICcwMDAwMDAwMDAwJyxcbiAgICAnMDAwMDAwMDAwMDAnLFxuICAgICcwMDAwMDAwMDAwMDAnLFxuICAgICcwMDAwMDAwMDAwMDAwJyxcbiAgICAnMDAwMDAwMDAwMDAwMDAnLFxuICAgICcwMDAwMDAwMDAwMDAwMDAnLFxuICAgICcwMDAwMDAwMDAwMDAwMDAwJyxcbiAgICAnMDAwMDAwMDAwMDAwMDAwMDAnLFxuICAgICcwMDAwMDAwMDAwMDAwMDAwMDAnLFxuICAgICcwMDAwMDAwMDAwMDAwMDAwMDAwJyxcbiAgICAnMDAwMDAwMDAwMDAwMDAwMDAwMDAnLFxuICAgICcwMDAwMDAwMDAwMDAwMDAwMDAwMDAnLFxuICAgICcwMDAwMDAwMDAwMDAwMDAwMDAwMDAwJyxcbiAgICAnMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAnLFxuICAgICcwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAnLFxuICAgICcwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwJ1xuICBdO1xuXG4gIHZhciBncm91cFNpemVzID0gW1xuICAgIDAsIDAsXG4gICAgMjUsIDE2LCAxMiwgMTEsIDEwLCA5LCA4LFxuICAgIDgsIDcsIDcsIDcsIDcsIDYsIDYsXG4gICAgNiwgNiwgNiwgNiwgNiwgNSwgNSxcbiAgICA1LCA1LCA1LCA1LCA1LCA1LCA1LFxuICAgIDUsIDUsIDUsIDUsIDUsIDUsIDVcbiAgXTtcblxuICB2YXIgZ3JvdXBCYXNlcyA9IFtcbiAgICAwLCAwLFxuICAgIDMzNTU0NDMyLCA0MzA0NjcyMSwgMTY3NzcyMTYsIDQ4ODI4MTI1LCA2MDQ2NjE3NiwgNDAzNTM2MDcsIDE2Nzc3MjE2LFxuICAgIDQzMDQ2NzIxLCAxMDAwMDAwMCwgMTk0ODcxNzEsIDM1ODMxODA4LCA2Mjc0ODUxNywgNzUyOTUzNiwgMTEzOTA2MjUsXG4gICAgMTY3NzcyMTYsIDI0MTM3NTY5LCAzNDAxMjIyNCwgNDcwNDU4ODEsIDY0MDAwMDAwLCA0MDg0MTAxLCA1MTUzNjMyLFxuICAgIDY0MzYzNDMsIDc5NjI2MjQsIDk3NjU2MjUsIDExODgxMzc2LCAxNDM0ODkwNywgMTcyMTAzNjgsIDIwNTExMTQ5LFxuICAgIDI0MzAwMDAwLCAyODYyOTE1MSwgMzM1NTQ0MzIsIDM5MTM1MzkzLCA0NTQzNTQyNCwgNTI1MjE4NzUsIDYwNDY2MTc2XG4gIF07XG5cbiAgQk4ucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24gdG9TdHJpbmcgKGJhc2UsIHBhZGRpbmcpIHtcbiAgICBiYXNlID0gYmFzZSB8fCAxMDtcbiAgICBwYWRkaW5nID0gcGFkZGluZyB8IDAgfHwgMTtcblxuICAgIHZhciBvdXQ7XG4gICAgaWYgKGJhc2UgPT09IDE2IHx8IGJhc2UgPT09ICdoZXgnKSB7XG4gICAgICBvdXQgPSAnJztcbiAgICAgIHZhciBvZmYgPSAwO1xuICAgICAgdmFyIGNhcnJ5ID0gMDtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgdyA9IHRoaXMud29yZHNbaV07XG4gICAgICAgIHZhciB3b3JkID0gKCgodyA8PCBvZmYpIHwgY2FycnkpICYgMHhmZmZmZmYpLnRvU3RyaW5nKDE2KTtcbiAgICAgICAgY2FycnkgPSAodyA+Pj4gKDI0IC0gb2ZmKSkgJiAweGZmZmZmZjtcbiAgICAgICAgaWYgKGNhcnJ5ICE9PSAwIHx8IGkgIT09IHRoaXMubGVuZ3RoIC0gMSkge1xuICAgICAgICAgIG91dCA9IHplcm9zWzYgLSB3b3JkLmxlbmd0aF0gKyB3b3JkICsgb3V0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIG91dCA9IHdvcmQgKyBvdXQ7XG4gICAgICAgIH1cbiAgICAgICAgb2ZmICs9IDI7XG4gICAgICAgIGlmIChvZmYgPj0gMjYpIHtcbiAgICAgICAgICBvZmYgLT0gMjY7XG4gICAgICAgICAgaS0tO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoY2FycnkgIT09IDApIHtcbiAgICAgICAgb3V0ID0gY2FycnkudG9TdHJpbmcoMTYpICsgb3V0O1xuICAgICAgfVxuICAgICAgd2hpbGUgKG91dC5sZW5ndGggJSBwYWRkaW5nICE9PSAwKSB7XG4gICAgICAgIG91dCA9ICcwJyArIG91dDtcbiAgICAgIH1cbiAgICAgIGlmICh0aGlzLm5lZ2F0aXZlICE9PSAwKSB7XG4gICAgICAgIG91dCA9ICctJyArIG91dDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBvdXQ7XG4gICAgfVxuXG4gICAgaWYgKGJhc2UgPT09IChiYXNlIHwgMCkgJiYgYmFzZSA+PSAyICYmIGJhc2UgPD0gMzYpIHtcbiAgICAgIC8vIHZhciBncm91cFNpemUgPSBNYXRoLmZsb29yKEJOLndvcmRTaXplICogTWF0aC5MTjIgLyBNYXRoLmxvZyhiYXNlKSk7XG4gICAgICB2YXIgZ3JvdXBTaXplID0gZ3JvdXBTaXplc1tiYXNlXTtcbiAgICAgIC8vIHZhciBncm91cEJhc2UgPSBNYXRoLnBvdyhiYXNlLCBncm91cFNpemUpO1xuICAgICAgdmFyIGdyb3VwQmFzZSA9IGdyb3VwQmFzZXNbYmFzZV07XG4gICAgICBvdXQgPSAnJztcbiAgICAgIHZhciBjID0gdGhpcy5jbG9uZSgpO1xuICAgICAgYy5uZWdhdGl2ZSA9IDA7XG4gICAgICB3aGlsZSAoIWMuaXNaZXJvKCkpIHtcbiAgICAgICAgdmFyIHIgPSBjLm1vZG4oZ3JvdXBCYXNlKS50b1N0cmluZyhiYXNlKTtcbiAgICAgICAgYyA9IGMuaWRpdm4oZ3JvdXBCYXNlKTtcblxuICAgICAgICBpZiAoIWMuaXNaZXJvKCkpIHtcbiAgICAgICAgICBvdXQgPSB6ZXJvc1tncm91cFNpemUgLSByLmxlbmd0aF0gKyByICsgb3V0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIG91dCA9IHIgKyBvdXQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmICh0aGlzLmlzWmVybygpKSB7XG4gICAgICAgIG91dCA9ICcwJyArIG91dDtcbiAgICAgIH1cbiAgICAgIHdoaWxlIChvdXQubGVuZ3RoICUgcGFkZGluZyAhPT0gMCkge1xuICAgICAgICBvdXQgPSAnMCcgKyBvdXQ7XG4gICAgICB9XG4gICAgICBpZiAodGhpcy5uZWdhdGl2ZSAhPT0gMCkge1xuICAgICAgICBvdXQgPSAnLScgKyBvdXQ7XG4gICAgICB9XG4gICAgICByZXR1cm4gb3V0O1xuICAgIH1cblxuICAgIGFzc2VydChmYWxzZSwgJ0Jhc2Ugc2hvdWxkIGJlIGJldHdlZW4gMiBhbmQgMzYnKTtcbiAgfTtcblxuICBCTi5wcm90b3R5cGUudG9OdW1iZXIgPSBmdW5jdGlvbiB0b051bWJlciAoKSB7XG4gICAgdmFyIHJldCA9IHRoaXMud29yZHNbMF07XG4gICAgaWYgKHRoaXMubGVuZ3RoID09PSAyKSB7XG4gICAgICByZXQgKz0gdGhpcy53b3Jkc1sxXSAqIDB4NDAwMDAwMDtcbiAgICB9IGVsc2UgaWYgKHRoaXMubGVuZ3RoID09PSAzICYmIHRoaXMud29yZHNbMl0gPT09IDB4MDEpIHtcbiAgICAgIC8vIE5PVEU6IGF0IHRoaXMgc3RhZ2UgaXQgaXMga25vd24gdGhhdCB0aGUgdG9wIGJpdCBpcyBzZXRcbiAgICAgIHJldCArPSAweDEwMDAwMDAwMDAwMDAwICsgKHRoaXMud29yZHNbMV0gKiAweDQwMDAwMDApO1xuICAgIH0gZWxzZSBpZiAodGhpcy5sZW5ndGggPiAyKSB7XG4gICAgICBhc3NlcnQoZmFsc2UsICdOdW1iZXIgY2FuIG9ubHkgc2FmZWx5IHN0b3JlIHVwIHRvIDUzIGJpdHMnKTtcbiAgICB9XG4gICAgcmV0dXJuICh0aGlzLm5lZ2F0aXZlICE9PSAwKSA/IC1yZXQgOiByZXQ7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uIHRvSlNPTiAoKSB7XG4gICAgcmV0dXJuIHRoaXMudG9TdHJpbmcoMTYpO1xuICB9O1xuXG4gIEJOLnByb3RvdHlwZS50b0J1ZmZlciA9IGZ1bmN0aW9uIHRvQnVmZmVyIChlbmRpYW4sIGxlbmd0aCkge1xuICAgIGFzc2VydCh0eXBlb2YgQnVmZmVyICE9PSAndW5kZWZpbmVkJyk7XG4gICAgcmV0dXJuIHRoaXMudG9BcnJheUxpa2UoQnVmZmVyLCBlbmRpYW4sIGxlbmd0aCk7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLnRvQXJyYXkgPSBmdW5jdGlvbiB0b0FycmF5IChlbmRpYW4sIGxlbmd0aCkge1xuICAgIHJldHVybiB0aGlzLnRvQXJyYXlMaWtlKEFycmF5LCBlbmRpYW4sIGxlbmd0aCk7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLnRvQXJyYXlMaWtlID0gZnVuY3Rpb24gdG9BcnJheUxpa2UgKEFycmF5VHlwZSwgZW5kaWFuLCBsZW5ndGgpIHtcbiAgICB2YXIgYnl0ZUxlbmd0aCA9IHRoaXMuYnl0ZUxlbmd0aCgpO1xuICAgIHZhciByZXFMZW5ndGggPSBsZW5ndGggfHwgTWF0aC5tYXgoMSwgYnl0ZUxlbmd0aCk7XG4gICAgYXNzZXJ0KGJ5dGVMZW5ndGggPD0gcmVxTGVuZ3RoLCAnYnl0ZSBhcnJheSBsb25nZXIgdGhhbiBkZXNpcmVkIGxlbmd0aCcpO1xuICAgIGFzc2VydChyZXFMZW5ndGggPiAwLCAnUmVxdWVzdGVkIGFycmF5IGxlbmd0aCA8PSAwJyk7XG5cbiAgICB0aGlzLnN0cmlwKCk7XG4gICAgdmFyIGxpdHRsZUVuZGlhbiA9IGVuZGlhbiA9PT0gJ2xlJztcbiAgICB2YXIgcmVzID0gbmV3IEFycmF5VHlwZShyZXFMZW5ndGgpO1xuXG4gICAgdmFyIGIsIGk7XG4gICAgdmFyIHEgPSB0aGlzLmNsb25lKCk7XG4gICAgaWYgKCFsaXR0bGVFbmRpYW4pIHtcbiAgICAgIC8vIEFzc3VtZSBiaWctZW5kaWFuXG4gICAgICBmb3IgKGkgPSAwOyBpIDwgcmVxTGVuZ3RoIC0gYnl0ZUxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHJlc1tpXSA9IDA7XG4gICAgICB9XG5cbiAgICAgIGZvciAoaSA9IDA7ICFxLmlzWmVybygpOyBpKyspIHtcbiAgICAgICAgYiA9IHEuYW5kbG4oMHhmZik7XG4gICAgICAgIHEuaXVzaHJuKDgpO1xuXG4gICAgICAgIHJlc1tyZXFMZW5ndGggLSBpIC0gMV0gPSBiO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBmb3IgKGkgPSAwOyAhcS5pc1plcm8oKTsgaSsrKSB7XG4gICAgICAgIGIgPSBxLmFuZGxuKDB4ZmYpO1xuICAgICAgICBxLml1c2hybig4KTtcblxuICAgICAgICByZXNbaV0gPSBiO1xuICAgICAgfVxuXG4gICAgICBmb3IgKDsgaSA8IHJlcUxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHJlc1tpXSA9IDA7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlcztcbiAgfTtcblxuICBpZiAoTWF0aC5jbHozMikge1xuICAgIEJOLnByb3RvdHlwZS5fY291bnRCaXRzID0gZnVuY3Rpb24gX2NvdW50Qml0cyAodykge1xuICAgICAgcmV0dXJuIDMyIC0gTWF0aC5jbHozMih3KTtcbiAgICB9O1xuICB9IGVsc2Uge1xuICAgIEJOLnByb3RvdHlwZS5fY291bnRCaXRzID0gZnVuY3Rpb24gX2NvdW50Qml0cyAodykge1xuICAgICAgdmFyIHQgPSB3O1xuICAgICAgdmFyIHIgPSAwO1xuICAgICAgaWYgKHQgPj0gMHgxMDAwKSB7XG4gICAgICAgIHIgKz0gMTM7XG4gICAgICAgIHQgPj4+PSAxMztcbiAgICAgIH1cbiAgICAgIGlmICh0ID49IDB4NDApIHtcbiAgICAgICAgciArPSA3O1xuICAgICAgICB0ID4+Pj0gNztcbiAgICAgIH1cbiAgICAgIGlmICh0ID49IDB4OCkge1xuICAgICAgICByICs9IDQ7XG4gICAgICAgIHQgPj4+PSA0O1xuICAgICAgfVxuICAgICAgaWYgKHQgPj0gMHgwMikge1xuICAgICAgICByICs9IDI7XG4gICAgICAgIHQgPj4+PSAyO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHIgKyB0O1xuICAgIH07XG4gIH1cblxuICBCTi5wcm90b3R5cGUuX3plcm9CaXRzID0gZnVuY3Rpb24gX3plcm9CaXRzICh3KSB7XG4gICAgLy8gU2hvcnQtY3V0XG4gICAgaWYgKHcgPT09IDApIHJldHVybiAyNjtcblxuICAgIHZhciB0ID0gdztcbiAgICB2YXIgciA9IDA7XG4gICAgaWYgKCh0ICYgMHgxZmZmKSA9PT0gMCkge1xuICAgICAgciArPSAxMztcbiAgICAgIHQgPj4+PSAxMztcbiAgICB9XG4gICAgaWYgKCh0ICYgMHg3ZikgPT09IDApIHtcbiAgICAgIHIgKz0gNztcbiAgICAgIHQgPj4+PSA3O1xuICAgIH1cbiAgICBpZiAoKHQgJiAweGYpID09PSAwKSB7XG4gICAgICByICs9IDQ7XG4gICAgICB0ID4+Pj0gNDtcbiAgICB9XG4gICAgaWYgKCh0ICYgMHgzKSA9PT0gMCkge1xuICAgICAgciArPSAyO1xuICAgICAgdCA+Pj49IDI7XG4gICAgfVxuICAgIGlmICgodCAmIDB4MSkgPT09IDApIHtcbiAgICAgIHIrKztcbiAgICB9XG4gICAgcmV0dXJuIHI7XG4gIH07XG5cbiAgLy8gUmV0dXJuIG51bWJlciBvZiB1c2VkIGJpdHMgaW4gYSBCTlxuICBCTi5wcm90b3R5cGUuYml0TGVuZ3RoID0gZnVuY3Rpb24gYml0TGVuZ3RoICgpIHtcbiAgICB2YXIgdyA9IHRoaXMud29yZHNbdGhpcy5sZW5ndGggLSAxXTtcbiAgICB2YXIgaGkgPSB0aGlzLl9jb3VudEJpdHModyk7XG4gICAgcmV0dXJuICh0aGlzLmxlbmd0aCAtIDEpICogMjYgKyBoaTtcbiAgfTtcblxuICBmdW5jdGlvbiB0b0JpdEFycmF5IChudW0pIHtcbiAgICB2YXIgdyA9IG5ldyBBcnJheShudW0uYml0TGVuZ3RoKCkpO1xuXG4gICAgZm9yICh2YXIgYml0ID0gMDsgYml0IDwgdy5sZW5ndGg7IGJpdCsrKSB7XG4gICAgICB2YXIgb2ZmID0gKGJpdCAvIDI2KSB8IDA7XG4gICAgICB2YXIgd2JpdCA9IGJpdCAlIDI2O1xuXG4gICAgICB3W2JpdF0gPSAobnVtLndvcmRzW29mZl0gJiAoMSA8PCB3Yml0KSkgPj4+IHdiaXQ7XG4gICAgfVxuXG4gICAgcmV0dXJuIHc7XG4gIH1cblxuICAvLyBOdW1iZXIgb2YgdHJhaWxpbmcgemVybyBiaXRzXG4gIEJOLnByb3RvdHlwZS56ZXJvQml0cyA9IGZ1bmN0aW9uIHplcm9CaXRzICgpIHtcbiAgICBpZiAodGhpcy5pc1plcm8oKSkgcmV0dXJuIDA7XG5cbiAgICB2YXIgciA9IDA7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLmxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgYiA9IHRoaXMuX3plcm9CaXRzKHRoaXMud29yZHNbaV0pO1xuICAgICAgciArPSBiO1xuICAgICAgaWYgKGIgIT09IDI2KSBicmVhaztcbiAgICB9XG4gICAgcmV0dXJuIHI7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLmJ5dGVMZW5ndGggPSBmdW5jdGlvbiBieXRlTGVuZ3RoICgpIHtcbiAgICByZXR1cm4gTWF0aC5jZWlsKHRoaXMuYml0TGVuZ3RoKCkgLyA4KTtcbiAgfTtcblxuICBCTi5wcm90b3R5cGUudG9Ud29zID0gZnVuY3Rpb24gdG9Ud29zICh3aWR0aCkge1xuICAgIGlmICh0aGlzLm5lZ2F0aXZlICE9PSAwKSB7XG4gICAgICByZXR1cm4gdGhpcy5hYnMoKS5pbm90bih3aWR0aCkuaWFkZG4oMSk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmNsb25lKCk7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLmZyb21Ud29zID0gZnVuY3Rpb24gZnJvbVR3b3MgKHdpZHRoKSB7XG4gICAgaWYgKHRoaXMudGVzdG4od2lkdGggLSAxKSkge1xuICAgICAgcmV0dXJuIHRoaXMubm90bih3aWR0aCkuaWFkZG4oMSkuaW5lZygpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5jbG9uZSgpO1xuICB9O1xuXG4gIEJOLnByb3RvdHlwZS5pc05lZyA9IGZ1bmN0aW9uIGlzTmVnICgpIHtcbiAgICByZXR1cm4gdGhpcy5uZWdhdGl2ZSAhPT0gMDtcbiAgfTtcblxuICAvLyBSZXR1cm4gbmVnYXRpdmUgY2xvbmUgb2YgYHRoaXNgXG4gIEJOLnByb3RvdHlwZS5uZWcgPSBmdW5jdGlvbiBuZWcgKCkge1xuICAgIHJldHVybiB0aGlzLmNsb25lKCkuaW5lZygpO1xuICB9O1xuXG4gIEJOLnByb3RvdHlwZS5pbmVnID0gZnVuY3Rpb24gaW5lZyAoKSB7XG4gICAgaWYgKCF0aGlzLmlzWmVybygpKSB7XG4gICAgICB0aGlzLm5lZ2F0aXZlIF49IDE7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXM7XG4gIH07XG5cbiAgLy8gT3IgYG51bWAgd2l0aCBgdGhpc2AgaW4tcGxhY2VcbiAgQk4ucHJvdG90eXBlLml1b3IgPSBmdW5jdGlvbiBpdW9yIChudW0pIHtcbiAgICB3aGlsZSAodGhpcy5sZW5ndGggPCBudW0ubGVuZ3RoKSB7XG4gICAgICB0aGlzLndvcmRzW3RoaXMubGVuZ3RoKytdID0gMDtcbiAgICB9XG5cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG51bS5sZW5ndGg7IGkrKykge1xuICAgICAgdGhpcy53b3Jkc1tpXSA9IHRoaXMud29yZHNbaV0gfCBudW0ud29yZHNbaV07XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuc3RyaXAoKTtcbiAgfTtcblxuICBCTi5wcm90b3R5cGUuaW9yID0gZnVuY3Rpb24gaW9yIChudW0pIHtcbiAgICBhc3NlcnQoKHRoaXMubmVnYXRpdmUgfCBudW0ubmVnYXRpdmUpID09PSAwKTtcbiAgICByZXR1cm4gdGhpcy5pdW9yKG51bSk7XG4gIH07XG5cbiAgLy8gT3IgYG51bWAgd2l0aCBgdGhpc2BcbiAgQk4ucHJvdG90eXBlLm9yID0gZnVuY3Rpb24gb3IgKG51bSkge1xuICAgIGlmICh0aGlzLmxlbmd0aCA+IG51bS5sZW5ndGgpIHJldHVybiB0aGlzLmNsb25lKCkuaW9yKG51bSk7XG4gICAgcmV0dXJuIG51bS5jbG9uZSgpLmlvcih0aGlzKTtcbiAgfTtcblxuICBCTi5wcm90b3R5cGUudW9yID0gZnVuY3Rpb24gdW9yIChudW0pIHtcbiAgICBpZiAodGhpcy5sZW5ndGggPiBudW0ubGVuZ3RoKSByZXR1cm4gdGhpcy5jbG9uZSgpLml1b3IobnVtKTtcbiAgICByZXR1cm4gbnVtLmNsb25lKCkuaXVvcih0aGlzKTtcbiAgfTtcblxuICAvLyBBbmQgYG51bWAgd2l0aCBgdGhpc2AgaW4tcGxhY2VcbiAgQk4ucHJvdG90eXBlLml1YW5kID0gZnVuY3Rpb24gaXVhbmQgKG51bSkge1xuICAgIC8vIGIgPSBtaW4tbGVuZ3RoKG51bSwgdGhpcylcbiAgICB2YXIgYjtcbiAgICBpZiAodGhpcy5sZW5ndGggPiBudW0ubGVuZ3RoKSB7XG4gICAgICBiID0gbnVtO1xuICAgIH0gZWxzZSB7XG4gICAgICBiID0gdGhpcztcbiAgICB9XG5cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGIubGVuZ3RoOyBpKyspIHtcbiAgICAgIHRoaXMud29yZHNbaV0gPSB0aGlzLndvcmRzW2ldICYgbnVtLndvcmRzW2ldO1xuICAgIH1cblxuICAgIHRoaXMubGVuZ3RoID0gYi5sZW5ndGg7XG5cbiAgICByZXR1cm4gdGhpcy5zdHJpcCgpO1xuICB9O1xuXG4gIEJOLnByb3RvdHlwZS5pYW5kID0gZnVuY3Rpb24gaWFuZCAobnVtKSB7XG4gICAgYXNzZXJ0KCh0aGlzLm5lZ2F0aXZlIHwgbnVtLm5lZ2F0aXZlKSA9PT0gMCk7XG4gICAgcmV0dXJuIHRoaXMuaXVhbmQobnVtKTtcbiAgfTtcblxuICAvLyBBbmQgYG51bWAgd2l0aCBgdGhpc2BcbiAgQk4ucHJvdG90eXBlLmFuZCA9IGZ1bmN0aW9uIGFuZCAobnVtKSB7XG4gICAgaWYgKHRoaXMubGVuZ3RoID4gbnVtLmxlbmd0aCkgcmV0dXJuIHRoaXMuY2xvbmUoKS5pYW5kKG51bSk7XG4gICAgcmV0dXJuIG51bS5jbG9uZSgpLmlhbmQodGhpcyk7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLnVhbmQgPSBmdW5jdGlvbiB1YW5kIChudW0pIHtcbiAgICBpZiAodGhpcy5sZW5ndGggPiBudW0ubGVuZ3RoKSByZXR1cm4gdGhpcy5jbG9uZSgpLml1YW5kKG51bSk7XG4gICAgcmV0dXJuIG51bS5jbG9uZSgpLml1YW5kKHRoaXMpO1xuICB9O1xuXG4gIC8vIFhvciBgbnVtYCB3aXRoIGB0aGlzYCBpbi1wbGFjZVxuICBCTi5wcm90b3R5cGUuaXV4b3IgPSBmdW5jdGlvbiBpdXhvciAobnVtKSB7XG4gICAgLy8gYS5sZW5ndGggPiBiLmxlbmd0aFxuICAgIHZhciBhO1xuICAgIHZhciBiO1xuICAgIGlmICh0aGlzLmxlbmd0aCA+IG51bS5sZW5ndGgpIHtcbiAgICAgIGEgPSB0aGlzO1xuICAgICAgYiA9IG51bTtcbiAgICB9IGVsc2Uge1xuICAgICAgYSA9IG51bTtcbiAgICAgIGIgPSB0aGlzO1xuICAgIH1cblxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYi5sZW5ndGg7IGkrKykge1xuICAgICAgdGhpcy53b3Jkc1tpXSA9IGEud29yZHNbaV0gXiBiLndvcmRzW2ldO1xuICAgIH1cblxuICAgIGlmICh0aGlzICE9PSBhKSB7XG4gICAgICBmb3IgKDsgaSA8IGEubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdGhpcy53b3Jkc1tpXSA9IGEud29yZHNbaV07XG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhpcy5sZW5ndGggPSBhLmxlbmd0aDtcblxuICAgIHJldHVybiB0aGlzLnN0cmlwKCk7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLml4b3IgPSBmdW5jdGlvbiBpeG9yIChudW0pIHtcbiAgICBhc3NlcnQoKHRoaXMubmVnYXRpdmUgfCBudW0ubmVnYXRpdmUpID09PSAwKTtcbiAgICByZXR1cm4gdGhpcy5pdXhvcihudW0pO1xuICB9O1xuXG4gIC8vIFhvciBgbnVtYCB3aXRoIGB0aGlzYFxuICBCTi5wcm90b3R5cGUueG9yID0gZnVuY3Rpb24geG9yIChudW0pIHtcbiAgICBpZiAodGhpcy5sZW5ndGggPiBudW0ubGVuZ3RoKSByZXR1cm4gdGhpcy5jbG9uZSgpLml4b3IobnVtKTtcbiAgICByZXR1cm4gbnVtLmNsb25lKCkuaXhvcih0aGlzKTtcbiAgfTtcblxuICBCTi5wcm90b3R5cGUudXhvciA9IGZ1bmN0aW9uIHV4b3IgKG51bSkge1xuICAgIGlmICh0aGlzLmxlbmd0aCA+IG51bS5sZW5ndGgpIHJldHVybiB0aGlzLmNsb25lKCkuaXV4b3IobnVtKTtcbiAgICByZXR1cm4gbnVtLmNsb25lKCkuaXV4b3IodGhpcyk7XG4gIH07XG5cbiAgLy8gTm90IGBgdGhpc2BgIHdpdGggYGB3aWR0aGBgIGJpdHdpZHRoXG4gIEJOLnByb3RvdHlwZS5pbm90biA9IGZ1bmN0aW9uIGlub3RuICh3aWR0aCkge1xuICAgIGFzc2VydCh0eXBlb2Ygd2lkdGggPT09ICdudW1iZXInICYmIHdpZHRoID49IDApO1xuXG4gICAgdmFyIGJ5dGVzTmVlZGVkID0gTWF0aC5jZWlsKHdpZHRoIC8gMjYpIHwgMDtcbiAgICB2YXIgYml0c0xlZnQgPSB3aWR0aCAlIDI2O1xuXG4gICAgLy8gRXh0ZW5kIHRoZSBidWZmZXIgd2l0aCBsZWFkaW5nIHplcm9lc1xuICAgIHRoaXMuX2V4cGFuZChieXRlc05lZWRlZCk7XG5cbiAgICBpZiAoYml0c0xlZnQgPiAwKSB7XG4gICAgICBieXRlc05lZWRlZC0tO1xuICAgIH1cblxuICAgIC8vIEhhbmRsZSBjb21wbGV0ZSB3b3Jkc1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYnl0ZXNOZWVkZWQ7IGkrKykge1xuICAgICAgdGhpcy53b3Jkc1tpXSA9IH50aGlzLndvcmRzW2ldICYgMHgzZmZmZmZmO1xuICAgIH1cblxuICAgIC8vIEhhbmRsZSB0aGUgcmVzaWR1ZVxuICAgIGlmIChiaXRzTGVmdCA+IDApIHtcbiAgICAgIHRoaXMud29yZHNbaV0gPSB+dGhpcy53b3Jkc1tpXSAmICgweDNmZmZmZmYgPj4gKDI2IC0gYml0c0xlZnQpKTtcbiAgICB9XG5cbiAgICAvLyBBbmQgcmVtb3ZlIGxlYWRpbmcgemVyb2VzXG4gICAgcmV0dXJuIHRoaXMuc3RyaXAoKTtcbiAgfTtcblxuICBCTi5wcm90b3R5cGUubm90biA9IGZ1bmN0aW9uIG5vdG4gKHdpZHRoKSB7XG4gICAgcmV0dXJuIHRoaXMuY2xvbmUoKS5pbm90bih3aWR0aCk7XG4gIH07XG5cbiAgLy8gU2V0IGBiaXRgIG9mIGB0aGlzYFxuICBCTi5wcm90b3R5cGUuc2V0biA9IGZ1bmN0aW9uIHNldG4gKGJpdCwgdmFsKSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBiaXQgPT09ICdudW1iZXInICYmIGJpdCA+PSAwKTtcblxuICAgIHZhciBvZmYgPSAoYml0IC8gMjYpIHwgMDtcbiAgICB2YXIgd2JpdCA9IGJpdCAlIDI2O1xuXG4gICAgdGhpcy5fZXhwYW5kKG9mZiArIDEpO1xuXG4gICAgaWYgKHZhbCkge1xuICAgICAgdGhpcy53b3Jkc1tvZmZdID0gdGhpcy53b3Jkc1tvZmZdIHwgKDEgPDwgd2JpdCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMud29yZHNbb2ZmXSA9IHRoaXMud29yZHNbb2ZmXSAmIH4oMSA8PCB3Yml0KTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5zdHJpcCgpO1xuICB9O1xuXG4gIC8vIEFkZCBgbnVtYCB0byBgdGhpc2AgaW4tcGxhY2VcbiAgQk4ucHJvdG90eXBlLmlhZGQgPSBmdW5jdGlvbiBpYWRkIChudW0pIHtcbiAgICB2YXIgcjtcblxuICAgIC8vIG5lZ2F0aXZlICsgcG9zaXRpdmVcbiAgICBpZiAodGhpcy5uZWdhdGl2ZSAhPT0gMCAmJiBudW0ubmVnYXRpdmUgPT09IDApIHtcbiAgICAgIHRoaXMubmVnYXRpdmUgPSAwO1xuICAgICAgciA9IHRoaXMuaXN1YihudW0pO1xuICAgICAgdGhpcy5uZWdhdGl2ZSBePSAxO1xuICAgICAgcmV0dXJuIHRoaXMuX25vcm1TaWduKCk7XG5cbiAgICAvLyBwb3NpdGl2ZSArIG5lZ2F0aXZlXG4gICAgfSBlbHNlIGlmICh0aGlzLm5lZ2F0aXZlID09PSAwICYmIG51bS5uZWdhdGl2ZSAhPT0gMCkge1xuICAgICAgbnVtLm5lZ2F0aXZlID0gMDtcbiAgICAgIHIgPSB0aGlzLmlzdWIobnVtKTtcbiAgICAgIG51bS5uZWdhdGl2ZSA9IDE7XG4gICAgICByZXR1cm4gci5fbm9ybVNpZ24oKTtcbiAgICB9XG5cbiAgICAvLyBhLmxlbmd0aCA+IGIubGVuZ3RoXG4gICAgdmFyIGEsIGI7XG4gICAgaWYgKHRoaXMubGVuZ3RoID4gbnVtLmxlbmd0aCkge1xuICAgICAgYSA9IHRoaXM7XG4gICAgICBiID0gbnVtO1xuICAgIH0gZWxzZSB7XG4gICAgICBhID0gbnVtO1xuICAgICAgYiA9IHRoaXM7XG4gICAgfVxuXG4gICAgdmFyIGNhcnJ5ID0gMDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGIubGVuZ3RoOyBpKyspIHtcbiAgICAgIHIgPSAoYS53b3Jkc1tpXSB8IDApICsgKGIud29yZHNbaV0gfCAwKSArIGNhcnJ5O1xuICAgICAgdGhpcy53b3Jkc1tpXSA9IHIgJiAweDNmZmZmZmY7XG4gICAgICBjYXJyeSA9IHIgPj4+IDI2O1xuICAgIH1cbiAgICBmb3IgKDsgY2FycnkgIT09IDAgJiYgaSA8IGEubGVuZ3RoOyBpKyspIHtcbiAgICAgIHIgPSAoYS53b3Jkc1tpXSB8IDApICsgY2Fycnk7XG4gICAgICB0aGlzLndvcmRzW2ldID0gciAmIDB4M2ZmZmZmZjtcbiAgICAgIGNhcnJ5ID0gciA+Pj4gMjY7XG4gICAgfVxuXG4gICAgdGhpcy5sZW5ndGggPSBhLmxlbmd0aDtcbiAgICBpZiAoY2FycnkgIT09IDApIHtcbiAgICAgIHRoaXMud29yZHNbdGhpcy5sZW5ndGhdID0gY2Fycnk7XG4gICAgICB0aGlzLmxlbmd0aCsrO1xuICAgIC8vIENvcHkgdGhlIHJlc3Qgb2YgdGhlIHdvcmRzXG4gICAgfSBlbHNlIGlmIChhICE9PSB0aGlzKSB7XG4gICAgICBmb3IgKDsgaSA8IGEubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdGhpcy53b3Jkc1tpXSA9IGEud29yZHNbaV07XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXM7XG4gIH07XG5cbiAgLy8gQWRkIGBudW1gIHRvIGB0aGlzYFxuICBCTi5wcm90b3R5cGUuYWRkID0gZnVuY3Rpb24gYWRkIChudW0pIHtcbiAgICB2YXIgcmVzO1xuICAgIGlmIChudW0ubmVnYXRpdmUgIT09IDAgJiYgdGhpcy5uZWdhdGl2ZSA9PT0gMCkge1xuICAgICAgbnVtLm5lZ2F0aXZlID0gMDtcbiAgICAgIHJlcyA9IHRoaXMuc3ViKG51bSk7XG4gICAgICBudW0ubmVnYXRpdmUgXj0gMTtcbiAgICAgIHJldHVybiByZXM7XG4gICAgfSBlbHNlIGlmIChudW0ubmVnYXRpdmUgPT09IDAgJiYgdGhpcy5uZWdhdGl2ZSAhPT0gMCkge1xuICAgICAgdGhpcy5uZWdhdGl2ZSA9IDA7XG4gICAgICByZXMgPSBudW0uc3ViKHRoaXMpO1xuICAgICAgdGhpcy5uZWdhdGl2ZSA9IDE7XG4gICAgICByZXR1cm4gcmVzO1xuICAgIH1cblxuICAgIGlmICh0aGlzLmxlbmd0aCA+IG51bS5sZW5ndGgpIHJldHVybiB0aGlzLmNsb25lKCkuaWFkZChudW0pO1xuXG4gICAgcmV0dXJuIG51bS5jbG9uZSgpLmlhZGQodGhpcyk7XG4gIH07XG5cbiAgLy8gU3VidHJhY3QgYG51bWAgZnJvbSBgdGhpc2AgaW4tcGxhY2VcbiAgQk4ucHJvdG90eXBlLmlzdWIgPSBmdW5jdGlvbiBpc3ViIChudW0pIHtcbiAgICAvLyB0aGlzIC0gKC1udW0pID0gdGhpcyArIG51bVxuICAgIGlmIChudW0ubmVnYXRpdmUgIT09IDApIHtcbiAgICAgIG51bS5uZWdhdGl2ZSA9IDA7XG4gICAgICB2YXIgciA9IHRoaXMuaWFkZChudW0pO1xuICAgICAgbnVtLm5lZ2F0aXZlID0gMTtcbiAgICAgIHJldHVybiByLl9ub3JtU2lnbigpO1xuXG4gICAgLy8gLXRoaXMgLSBudW0gPSAtKHRoaXMgKyBudW0pXG4gICAgfSBlbHNlIGlmICh0aGlzLm5lZ2F0aXZlICE9PSAwKSB7XG4gICAgICB0aGlzLm5lZ2F0aXZlID0gMDtcbiAgICAgIHRoaXMuaWFkZChudW0pO1xuICAgICAgdGhpcy5uZWdhdGl2ZSA9IDE7XG4gICAgICByZXR1cm4gdGhpcy5fbm9ybVNpZ24oKTtcbiAgICB9XG5cbiAgICAvLyBBdCB0aGlzIHBvaW50IGJvdGggbnVtYmVycyBhcmUgcG9zaXRpdmVcbiAgICB2YXIgY21wID0gdGhpcy5jbXAobnVtKTtcblxuICAgIC8vIE9wdGltaXphdGlvbiAtIHplcm9pZnlcbiAgICBpZiAoY21wID09PSAwKSB7XG4gICAgICB0aGlzLm5lZ2F0aXZlID0gMDtcbiAgICAgIHRoaXMubGVuZ3RoID0gMTtcbiAgICAgIHRoaXMud29yZHNbMF0gPSAwO1xuICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLy8gYSA+IGJcbiAgICB2YXIgYSwgYjtcbiAgICBpZiAoY21wID4gMCkge1xuICAgICAgYSA9IHRoaXM7XG4gICAgICBiID0gbnVtO1xuICAgIH0gZWxzZSB7XG4gICAgICBhID0gbnVtO1xuICAgICAgYiA9IHRoaXM7XG4gICAgfVxuXG4gICAgdmFyIGNhcnJ5ID0gMDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGIubGVuZ3RoOyBpKyspIHtcbiAgICAgIHIgPSAoYS53b3Jkc1tpXSB8IDApIC0gKGIud29yZHNbaV0gfCAwKSArIGNhcnJ5O1xuICAgICAgY2FycnkgPSByID4+IDI2O1xuICAgICAgdGhpcy53b3Jkc1tpXSA9IHIgJiAweDNmZmZmZmY7XG4gICAgfVxuICAgIGZvciAoOyBjYXJyeSAhPT0gMCAmJiBpIDwgYS5sZW5ndGg7IGkrKykge1xuICAgICAgciA9IChhLndvcmRzW2ldIHwgMCkgKyBjYXJyeTtcbiAgICAgIGNhcnJ5ID0gciA+PiAyNjtcbiAgICAgIHRoaXMud29yZHNbaV0gPSByICYgMHgzZmZmZmZmO1xuICAgIH1cblxuICAgIC8vIENvcHkgcmVzdCBvZiB0aGUgd29yZHNcbiAgICBpZiAoY2FycnkgPT09IDAgJiYgaSA8IGEubGVuZ3RoICYmIGEgIT09IHRoaXMpIHtcbiAgICAgIGZvciAoOyBpIDwgYS5sZW5ndGg7IGkrKykge1xuICAgICAgICB0aGlzLndvcmRzW2ldID0gYS53b3Jkc1tpXTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0aGlzLmxlbmd0aCA9IE1hdGgubWF4KHRoaXMubGVuZ3RoLCBpKTtcblxuICAgIGlmIChhICE9PSB0aGlzKSB7XG4gICAgICB0aGlzLm5lZ2F0aXZlID0gMTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5zdHJpcCgpO1xuICB9O1xuXG4gIC8vIFN1YnRyYWN0IGBudW1gIGZyb20gYHRoaXNgXG4gIEJOLnByb3RvdHlwZS5zdWIgPSBmdW5jdGlvbiBzdWIgKG51bSkge1xuICAgIHJldHVybiB0aGlzLmNsb25lKCkuaXN1YihudW0pO1xuICB9O1xuXG4gIGZ1bmN0aW9uIHNtYWxsTXVsVG8gKHNlbGYsIG51bSwgb3V0KSB7XG4gICAgb3V0Lm5lZ2F0aXZlID0gbnVtLm5lZ2F0aXZlIF4gc2VsZi5uZWdhdGl2ZTtcbiAgICB2YXIgbGVuID0gKHNlbGYubGVuZ3RoICsgbnVtLmxlbmd0aCkgfCAwO1xuICAgIG91dC5sZW5ndGggPSBsZW47XG4gICAgbGVuID0gKGxlbiAtIDEpIHwgMDtcblxuICAgIC8vIFBlZWwgb25lIGl0ZXJhdGlvbiAoY29tcGlsZXIgY2FuJ3QgZG8gaXQsIGJlY2F1c2Ugb2YgY29kZSBjb21wbGV4aXR5KVxuICAgIHZhciBhID0gc2VsZi53b3Jkc1swXSB8IDA7XG4gICAgdmFyIGIgPSBudW0ud29yZHNbMF0gfCAwO1xuICAgIHZhciByID0gYSAqIGI7XG5cbiAgICB2YXIgbG8gPSByICYgMHgzZmZmZmZmO1xuICAgIHZhciBjYXJyeSA9IChyIC8gMHg0MDAwMDAwKSB8IDA7XG4gICAgb3V0LndvcmRzWzBdID0gbG87XG5cbiAgICBmb3IgKHZhciBrID0gMTsgayA8IGxlbjsgaysrKSB7XG4gICAgICAvLyBTdW0gYWxsIHdvcmRzIHdpdGggdGhlIHNhbWUgYGkgKyBqID0ga2AgYW5kIGFjY3VtdWxhdGUgYG5jYXJyeWAsXG4gICAgICAvLyBub3RlIHRoYXQgbmNhcnJ5IGNvdWxkIGJlID49IDB4M2ZmZmZmZlxuICAgICAgdmFyIG5jYXJyeSA9IGNhcnJ5ID4+PiAyNjtcbiAgICAgIHZhciByd29yZCA9IGNhcnJ5ICYgMHgzZmZmZmZmO1xuICAgICAgdmFyIG1heEogPSBNYXRoLm1pbihrLCBudW0ubGVuZ3RoIC0gMSk7XG4gICAgICBmb3IgKHZhciBqID0gTWF0aC5tYXgoMCwgayAtIHNlbGYubGVuZ3RoICsgMSk7IGogPD0gbWF4SjsgaisrKSB7XG4gICAgICAgIHZhciBpID0gKGsgLSBqKSB8IDA7XG4gICAgICAgIGEgPSBzZWxmLndvcmRzW2ldIHwgMDtcbiAgICAgICAgYiA9IG51bS53b3Jkc1tqXSB8IDA7XG4gICAgICAgIHIgPSBhICogYiArIHJ3b3JkO1xuICAgICAgICBuY2FycnkgKz0gKHIgLyAweDQwMDAwMDApIHwgMDtcbiAgICAgICAgcndvcmQgPSByICYgMHgzZmZmZmZmO1xuICAgICAgfVxuICAgICAgb3V0LndvcmRzW2tdID0gcndvcmQgfCAwO1xuICAgICAgY2FycnkgPSBuY2FycnkgfCAwO1xuICAgIH1cbiAgICBpZiAoY2FycnkgIT09IDApIHtcbiAgICAgIG91dC53b3Jkc1trXSA9IGNhcnJ5IHwgMDtcbiAgICB9IGVsc2Uge1xuICAgICAgb3V0Lmxlbmd0aC0tO1xuICAgIH1cblxuICAgIHJldHVybiBvdXQuc3RyaXAoKTtcbiAgfVxuXG4gIC8vIFRPRE8oaW5kdXRueSk6IGl0IG1heSBiZSByZWFzb25hYmxlIHRvIG9taXQgaXQgZm9yIHVzZXJzIHdobyBkb24ndCBuZWVkXG4gIC8vIHRvIHdvcmsgd2l0aCAyNTYtYml0IG51bWJlcnMsIG90aGVyd2lzZSBpdCBnaXZlcyAyMCUgaW1wcm92ZW1lbnQgZm9yIDI1Ni1iaXRcbiAgLy8gbXVsdGlwbGljYXRpb24gKGxpa2UgZWxsaXB0aWMgc2VjcDI1NmsxKS5cbiAgdmFyIGNvbWIxME11bFRvID0gZnVuY3Rpb24gY29tYjEwTXVsVG8gKHNlbGYsIG51bSwgb3V0KSB7XG4gICAgdmFyIGEgPSBzZWxmLndvcmRzO1xuICAgIHZhciBiID0gbnVtLndvcmRzO1xuICAgIHZhciBvID0gb3V0LndvcmRzO1xuICAgIHZhciBjID0gMDtcbiAgICB2YXIgbG87XG4gICAgdmFyIG1pZDtcbiAgICB2YXIgaGk7XG4gICAgdmFyIGEwID0gYVswXSB8IDA7XG4gICAgdmFyIGFsMCA9IGEwICYgMHgxZmZmO1xuICAgIHZhciBhaDAgPSBhMCA+Pj4gMTM7XG4gICAgdmFyIGExID0gYVsxXSB8IDA7XG4gICAgdmFyIGFsMSA9IGExICYgMHgxZmZmO1xuICAgIHZhciBhaDEgPSBhMSA+Pj4gMTM7XG4gICAgdmFyIGEyID0gYVsyXSB8IDA7XG4gICAgdmFyIGFsMiA9IGEyICYgMHgxZmZmO1xuICAgIHZhciBhaDIgPSBhMiA+Pj4gMTM7XG4gICAgdmFyIGEzID0gYVszXSB8IDA7XG4gICAgdmFyIGFsMyA9IGEzICYgMHgxZmZmO1xuICAgIHZhciBhaDMgPSBhMyA+Pj4gMTM7XG4gICAgdmFyIGE0ID0gYVs0XSB8IDA7XG4gICAgdmFyIGFsNCA9IGE0ICYgMHgxZmZmO1xuICAgIHZhciBhaDQgPSBhNCA+Pj4gMTM7XG4gICAgdmFyIGE1ID0gYVs1XSB8IDA7XG4gICAgdmFyIGFsNSA9IGE1ICYgMHgxZmZmO1xuICAgIHZhciBhaDUgPSBhNSA+Pj4gMTM7XG4gICAgdmFyIGE2ID0gYVs2XSB8IDA7XG4gICAgdmFyIGFsNiA9IGE2ICYgMHgxZmZmO1xuICAgIHZhciBhaDYgPSBhNiA+Pj4gMTM7XG4gICAgdmFyIGE3ID0gYVs3XSB8IDA7XG4gICAgdmFyIGFsNyA9IGE3ICYgMHgxZmZmO1xuICAgIHZhciBhaDcgPSBhNyA+Pj4gMTM7XG4gICAgdmFyIGE4ID0gYVs4XSB8IDA7XG4gICAgdmFyIGFsOCA9IGE4ICYgMHgxZmZmO1xuICAgIHZhciBhaDggPSBhOCA+Pj4gMTM7XG4gICAgdmFyIGE5ID0gYVs5XSB8IDA7XG4gICAgdmFyIGFsOSA9IGE5ICYgMHgxZmZmO1xuICAgIHZhciBhaDkgPSBhOSA+Pj4gMTM7XG4gICAgdmFyIGIwID0gYlswXSB8IDA7XG4gICAgdmFyIGJsMCA9IGIwICYgMHgxZmZmO1xuICAgIHZhciBiaDAgPSBiMCA+Pj4gMTM7XG4gICAgdmFyIGIxID0gYlsxXSB8IDA7XG4gICAgdmFyIGJsMSA9IGIxICYgMHgxZmZmO1xuICAgIHZhciBiaDEgPSBiMSA+Pj4gMTM7XG4gICAgdmFyIGIyID0gYlsyXSB8IDA7XG4gICAgdmFyIGJsMiA9IGIyICYgMHgxZmZmO1xuICAgIHZhciBiaDIgPSBiMiA+Pj4gMTM7XG4gICAgdmFyIGIzID0gYlszXSB8IDA7XG4gICAgdmFyIGJsMyA9IGIzICYgMHgxZmZmO1xuICAgIHZhciBiaDMgPSBiMyA+Pj4gMTM7XG4gICAgdmFyIGI0ID0gYls0XSB8IDA7XG4gICAgdmFyIGJsNCA9IGI0ICYgMHgxZmZmO1xuICAgIHZhciBiaDQgPSBiNCA+Pj4gMTM7XG4gICAgdmFyIGI1ID0gYls1XSB8IDA7XG4gICAgdmFyIGJsNSA9IGI1ICYgMHgxZmZmO1xuICAgIHZhciBiaDUgPSBiNSA+Pj4gMTM7XG4gICAgdmFyIGI2ID0gYls2XSB8IDA7XG4gICAgdmFyIGJsNiA9IGI2ICYgMHgxZmZmO1xuICAgIHZhciBiaDYgPSBiNiA+Pj4gMTM7XG4gICAgdmFyIGI3ID0gYls3XSB8IDA7XG4gICAgdmFyIGJsNyA9IGI3ICYgMHgxZmZmO1xuICAgIHZhciBiaDcgPSBiNyA+Pj4gMTM7XG4gICAgdmFyIGI4ID0gYls4XSB8IDA7XG4gICAgdmFyIGJsOCA9IGI4ICYgMHgxZmZmO1xuICAgIHZhciBiaDggPSBiOCA+Pj4gMTM7XG4gICAgdmFyIGI5ID0gYls5XSB8IDA7XG4gICAgdmFyIGJsOSA9IGI5ICYgMHgxZmZmO1xuICAgIHZhciBiaDkgPSBiOSA+Pj4gMTM7XG5cbiAgICBvdXQubmVnYXRpdmUgPSBzZWxmLm5lZ2F0aXZlIF4gbnVtLm5lZ2F0aXZlO1xuICAgIG91dC5sZW5ndGggPSAxOTtcbiAgICAvKiBrID0gMCAqL1xuICAgIGxvID0gTWF0aC5pbXVsKGFsMCwgYmwwKTtcbiAgICBtaWQgPSBNYXRoLmltdWwoYWwwLCBiaDApO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWgwLCBibDApKSB8IDA7XG4gICAgaGkgPSBNYXRoLmltdWwoYWgwLCBiaDApO1xuICAgIHZhciB3MCA9ICgoKGMgKyBsbykgfCAwKSArICgobWlkICYgMHgxZmZmKSA8PCAxMykpIHwgMDtcbiAgICBjID0gKCgoaGkgKyAobWlkID4+PiAxMykpIHwgMCkgKyAodzAgPj4+IDI2KSkgfCAwO1xuICAgIHcwICY9IDB4M2ZmZmZmZjtcbiAgICAvKiBrID0gMSAqL1xuICAgIGxvID0gTWF0aC5pbXVsKGFsMSwgYmwwKTtcbiAgICBtaWQgPSBNYXRoLmltdWwoYWwxLCBiaDApO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWgxLCBibDApKSB8IDA7XG4gICAgaGkgPSBNYXRoLmltdWwoYWgxLCBiaDApO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsMCwgYmwxKSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWwwLCBiaDEpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDAsIGJsMSkpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDAsIGJoMSkpIHwgMDtcbiAgICB2YXIgdzEgPSAoKChjICsgbG8pIHwgMCkgKyAoKG1pZCAmIDB4MWZmZikgPDwgMTMpKSB8IDA7XG4gICAgYyA9ICgoKGhpICsgKG1pZCA+Pj4gMTMpKSB8IDApICsgKHcxID4+PiAyNikpIHwgMDtcbiAgICB3MSAmPSAweDNmZmZmZmY7XG4gICAgLyogayA9IDIgKi9cbiAgICBsbyA9IE1hdGguaW11bChhbDIsIGJsMCk7XG4gICAgbWlkID0gTWF0aC5pbXVsKGFsMiwgYmgwKTtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoMiwgYmwwKSkgfCAwO1xuICAgIGhpID0gTWF0aC5pbXVsKGFoMiwgYmgwKTtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDEsIGJsMSkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsMSwgYmgxKSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWgxLCBibDEpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWgxLCBiaDEpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWwwLCBibDIpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDAsIGJoMikpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoMCwgYmwyKSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoMCwgYmgyKSkgfCAwO1xuICAgIHZhciB3MiA9ICgoKGMgKyBsbykgfCAwKSArICgobWlkICYgMHgxZmZmKSA8PCAxMykpIHwgMDtcbiAgICBjID0gKCgoaGkgKyAobWlkID4+PiAxMykpIHwgMCkgKyAodzIgPj4+IDI2KSkgfCAwO1xuICAgIHcyICY9IDB4M2ZmZmZmZjtcbiAgICAvKiBrID0gMyAqL1xuICAgIGxvID0gTWF0aC5pbXVsKGFsMywgYmwwKTtcbiAgICBtaWQgPSBNYXRoLmltdWwoYWwzLCBiaDApO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWgzLCBibDApKSB8IDA7XG4gICAgaGkgPSBNYXRoLmltdWwoYWgzLCBiaDApO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsMiwgYmwxKSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWwyLCBiaDEpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDIsIGJsMSkpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDIsIGJoMSkpIHwgMDtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDEsIGJsMikpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsMSwgYmgyKSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWgxLCBibDIpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWgxLCBiaDIpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWwwLCBibDMpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDAsIGJoMykpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoMCwgYmwzKSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoMCwgYmgzKSkgfCAwO1xuICAgIHZhciB3MyA9ICgoKGMgKyBsbykgfCAwKSArICgobWlkICYgMHgxZmZmKSA8PCAxMykpIHwgMDtcbiAgICBjID0gKCgoaGkgKyAobWlkID4+PiAxMykpIHwgMCkgKyAodzMgPj4+IDI2KSkgfCAwO1xuICAgIHczICY9IDB4M2ZmZmZmZjtcbiAgICAvKiBrID0gNCAqL1xuICAgIGxvID0gTWF0aC5pbXVsKGFsNCwgYmwwKTtcbiAgICBtaWQgPSBNYXRoLmltdWwoYWw0LCBiaDApO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg0LCBibDApKSB8IDA7XG4gICAgaGkgPSBNYXRoLmltdWwoYWg0LCBiaDApO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsMywgYmwxKSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWwzLCBiaDEpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDMsIGJsMSkpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDMsIGJoMSkpIHwgMDtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDIsIGJsMikpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsMiwgYmgyKSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWgyLCBibDIpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWgyLCBiaDIpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWwxLCBibDMpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDEsIGJoMykpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoMSwgYmwzKSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoMSwgYmgzKSkgfCAwO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsMCwgYmw0KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWwwLCBiaDQpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDAsIGJsNCkpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDAsIGJoNCkpIHwgMDtcbiAgICB2YXIgdzQgPSAoKChjICsgbG8pIHwgMCkgKyAoKG1pZCAmIDB4MWZmZikgPDwgMTMpKSB8IDA7XG4gICAgYyA9ICgoKGhpICsgKG1pZCA+Pj4gMTMpKSB8IDApICsgKHc0ID4+PiAyNikpIHwgMDtcbiAgICB3NCAmPSAweDNmZmZmZmY7XG4gICAgLyogayA9IDUgKi9cbiAgICBsbyA9IE1hdGguaW11bChhbDUsIGJsMCk7XG4gICAgbWlkID0gTWF0aC5pbXVsKGFsNSwgYmgwKTtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoNSwgYmwwKSkgfCAwO1xuICAgIGhpID0gTWF0aC5pbXVsKGFoNSwgYmgwKTtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDQsIGJsMSkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsNCwgYmgxKSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg0LCBibDEpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWg0LCBiaDEpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWwzLCBibDIpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDMsIGJoMikpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoMywgYmwyKSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoMywgYmgyKSkgfCAwO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsMiwgYmwzKSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWwyLCBiaDMpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDIsIGJsMykpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDIsIGJoMykpIHwgMDtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDEsIGJsNCkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsMSwgYmg0KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWgxLCBibDQpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWgxLCBiaDQpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWwwLCBibDUpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDAsIGJoNSkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoMCwgYmw1KSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoMCwgYmg1KSkgfCAwO1xuICAgIHZhciB3NSA9ICgoKGMgKyBsbykgfCAwKSArICgobWlkICYgMHgxZmZmKSA8PCAxMykpIHwgMDtcbiAgICBjID0gKCgoaGkgKyAobWlkID4+PiAxMykpIHwgMCkgKyAodzUgPj4+IDI2KSkgfCAwO1xuICAgIHc1ICY9IDB4M2ZmZmZmZjtcbiAgICAvKiBrID0gNiAqL1xuICAgIGxvID0gTWF0aC5pbXVsKGFsNiwgYmwwKTtcbiAgICBtaWQgPSBNYXRoLmltdWwoYWw2LCBiaDApO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg2LCBibDApKSB8IDA7XG4gICAgaGkgPSBNYXRoLmltdWwoYWg2LCBiaDApO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsNSwgYmwxKSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWw1LCBiaDEpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDUsIGJsMSkpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDUsIGJoMSkpIHwgMDtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDQsIGJsMikpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsNCwgYmgyKSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg0LCBibDIpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWg0LCBiaDIpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWwzLCBibDMpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDMsIGJoMykpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoMywgYmwzKSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoMywgYmgzKSkgfCAwO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsMiwgYmw0KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWwyLCBiaDQpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDIsIGJsNCkpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDIsIGJoNCkpIHwgMDtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDEsIGJsNSkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsMSwgYmg1KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWgxLCBibDUpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWgxLCBiaDUpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWwwLCBibDYpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDAsIGJoNikpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoMCwgYmw2KSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoMCwgYmg2KSkgfCAwO1xuICAgIHZhciB3NiA9ICgoKGMgKyBsbykgfCAwKSArICgobWlkICYgMHgxZmZmKSA8PCAxMykpIHwgMDtcbiAgICBjID0gKCgoaGkgKyAobWlkID4+PiAxMykpIHwgMCkgKyAodzYgPj4+IDI2KSkgfCAwO1xuICAgIHc2ICY9IDB4M2ZmZmZmZjtcbiAgICAvKiBrID0gNyAqL1xuICAgIGxvID0gTWF0aC5pbXVsKGFsNywgYmwwKTtcbiAgICBtaWQgPSBNYXRoLmltdWwoYWw3LCBiaDApO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg3LCBibDApKSB8IDA7XG4gICAgaGkgPSBNYXRoLmltdWwoYWg3LCBiaDApO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsNiwgYmwxKSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWw2LCBiaDEpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDYsIGJsMSkpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDYsIGJoMSkpIHwgMDtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDUsIGJsMikpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsNSwgYmgyKSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg1LCBibDIpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWg1LCBiaDIpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWw0LCBibDMpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDQsIGJoMykpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoNCwgYmwzKSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoNCwgYmgzKSkgfCAwO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsMywgYmw0KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWwzLCBiaDQpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDMsIGJsNCkpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDMsIGJoNCkpIHwgMDtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDIsIGJsNSkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsMiwgYmg1KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWgyLCBibDUpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWgyLCBiaDUpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWwxLCBibDYpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDEsIGJoNikpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoMSwgYmw2KSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoMSwgYmg2KSkgfCAwO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsMCwgYmw3KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWwwLCBiaDcpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDAsIGJsNykpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDAsIGJoNykpIHwgMDtcbiAgICB2YXIgdzcgPSAoKChjICsgbG8pIHwgMCkgKyAoKG1pZCAmIDB4MWZmZikgPDwgMTMpKSB8IDA7XG4gICAgYyA9ICgoKGhpICsgKG1pZCA+Pj4gMTMpKSB8IDApICsgKHc3ID4+PiAyNikpIHwgMDtcbiAgICB3NyAmPSAweDNmZmZmZmY7XG4gICAgLyogayA9IDggKi9cbiAgICBsbyA9IE1hdGguaW11bChhbDgsIGJsMCk7XG4gICAgbWlkID0gTWF0aC5pbXVsKGFsOCwgYmgwKTtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoOCwgYmwwKSkgfCAwO1xuICAgIGhpID0gTWF0aC5pbXVsKGFoOCwgYmgwKTtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDcsIGJsMSkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsNywgYmgxKSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg3LCBibDEpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWg3LCBiaDEpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWw2LCBibDIpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDYsIGJoMikpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoNiwgYmwyKSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoNiwgYmgyKSkgfCAwO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsNSwgYmwzKSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWw1LCBiaDMpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDUsIGJsMykpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDUsIGJoMykpIHwgMDtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDQsIGJsNCkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsNCwgYmg0KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg0LCBibDQpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWg0LCBiaDQpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWwzLCBibDUpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDMsIGJoNSkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoMywgYmw1KSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoMywgYmg1KSkgfCAwO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsMiwgYmw2KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWwyLCBiaDYpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDIsIGJsNikpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDIsIGJoNikpIHwgMDtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDEsIGJsNykpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsMSwgYmg3KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWgxLCBibDcpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWgxLCBiaDcpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWwwLCBibDgpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDAsIGJoOCkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoMCwgYmw4KSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoMCwgYmg4KSkgfCAwO1xuICAgIHZhciB3OCA9ICgoKGMgKyBsbykgfCAwKSArICgobWlkICYgMHgxZmZmKSA8PCAxMykpIHwgMDtcbiAgICBjID0gKCgoaGkgKyAobWlkID4+PiAxMykpIHwgMCkgKyAodzggPj4+IDI2KSkgfCAwO1xuICAgIHc4ICY9IDB4M2ZmZmZmZjtcbiAgICAvKiBrID0gOSAqL1xuICAgIGxvID0gTWF0aC5pbXVsKGFsOSwgYmwwKTtcbiAgICBtaWQgPSBNYXRoLmltdWwoYWw5LCBiaDApO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg5LCBibDApKSB8IDA7XG4gICAgaGkgPSBNYXRoLmltdWwoYWg5LCBiaDApO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsOCwgYmwxKSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWw4LCBiaDEpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDgsIGJsMSkpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDgsIGJoMSkpIHwgMDtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDcsIGJsMikpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsNywgYmgyKSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg3LCBibDIpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWg3LCBiaDIpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWw2LCBibDMpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDYsIGJoMykpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoNiwgYmwzKSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoNiwgYmgzKSkgfCAwO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsNSwgYmw0KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWw1LCBiaDQpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDUsIGJsNCkpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDUsIGJoNCkpIHwgMDtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDQsIGJsNSkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsNCwgYmg1KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg0LCBibDUpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWg0LCBiaDUpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWwzLCBibDYpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDMsIGJoNikpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoMywgYmw2KSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoMywgYmg2KSkgfCAwO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsMiwgYmw3KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWwyLCBiaDcpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDIsIGJsNykpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDIsIGJoNykpIHwgMDtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDEsIGJsOCkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsMSwgYmg4KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWgxLCBibDgpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWgxLCBiaDgpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWwwLCBibDkpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDAsIGJoOSkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoMCwgYmw5KSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoMCwgYmg5KSkgfCAwO1xuICAgIHZhciB3OSA9ICgoKGMgKyBsbykgfCAwKSArICgobWlkICYgMHgxZmZmKSA8PCAxMykpIHwgMDtcbiAgICBjID0gKCgoaGkgKyAobWlkID4+PiAxMykpIHwgMCkgKyAodzkgPj4+IDI2KSkgfCAwO1xuICAgIHc5ICY9IDB4M2ZmZmZmZjtcbiAgICAvKiBrID0gMTAgKi9cbiAgICBsbyA9IE1hdGguaW11bChhbDksIGJsMSk7XG4gICAgbWlkID0gTWF0aC5pbXVsKGFsOSwgYmgxKTtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoOSwgYmwxKSkgfCAwO1xuICAgIGhpID0gTWF0aC5pbXVsKGFoOSwgYmgxKTtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDgsIGJsMikpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsOCwgYmgyKSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg4LCBibDIpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWg4LCBiaDIpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWw3LCBibDMpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDcsIGJoMykpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoNywgYmwzKSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoNywgYmgzKSkgfCAwO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsNiwgYmw0KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWw2LCBiaDQpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDYsIGJsNCkpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDYsIGJoNCkpIHwgMDtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDUsIGJsNSkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsNSwgYmg1KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg1LCBibDUpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWg1LCBiaDUpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWw0LCBibDYpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDQsIGJoNikpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoNCwgYmw2KSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoNCwgYmg2KSkgfCAwO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsMywgYmw3KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWwzLCBiaDcpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDMsIGJsNykpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDMsIGJoNykpIHwgMDtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDIsIGJsOCkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsMiwgYmg4KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWgyLCBibDgpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWgyLCBiaDgpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWwxLCBibDkpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDEsIGJoOSkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoMSwgYmw5KSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoMSwgYmg5KSkgfCAwO1xuICAgIHZhciB3MTAgPSAoKChjICsgbG8pIHwgMCkgKyAoKG1pZCAmIDB4MWZmZikgPDwgMTMpKSB8IDA7XG4gICAgYyA9ICgoKGhpICsgKG1pZCA+Pj4gMTMpKSB8IDApICsgKHcxMCA+Pj4gMjYpKSB8IDA7XG4gICAgdzEwICY9IDB4M2ZmZmZmZjtcbiAgICAvKiBrID0gMTEgKi9cbiAgICBsbyA9IE1hdGguaW11bChhbDksIGJsMik7XG4gICAgbWlkID0gTWF0aC5pbXVsKGFsOSwgYmgyKTtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoOSwgYmwyKSkgfCAwO1xuICAgIGhpID0gTWF0aC5pbXVsKGFoOSwgYmgyKTtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDgsIGJsMykpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsOCwgYmgzKSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg4LCBibDMpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWg4LCBiaDMpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWw3LCBibDQpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDcsIGJoNCkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoNywgYmw0KSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoNywgYmg0KSkgfCAwO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsNiwgYmw1KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWw2LCBiaDUpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDYsIGJsNSkpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDYsIGJoNSkpIHwgMDtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDUsIGJsNikpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsNSwgYmg2KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg1LCBibDYpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWg1LCBiaDYpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWw0LCBibDcpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDQsIGJoNykpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoNCwgYmw3KSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoNCwgYmg3KSkgfCAwO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsMywgYmw4KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWwzLCBiaDgpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDMsIGJsOCkpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDMsIGJoOCkpIHwgMDtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDIsIGJsOSkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsMiwgYmg5KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWgyLCBibDkpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWgyLCBiaDkpKSB8IDA7XG4gICAgdmFyIHcxMSA9ICgoKGMgKyBsbykgfCAwKSArICgobWlkICYgMHgxZmZmKSA8PCAxMykpIHwgMDtcbiAgICBjID0gKCgoaGkgKyAobWlkID4+PiAxMykpIHwgMCkgKyAodzExID4+PiAyNikpIHwgMDtcbiAgICB3MTEgJj0gMHgzZmZmZmZmO1xuICAgIC8qIGsgPSAxMiAqL1xuICAgIGxvID0gTWF0aC5pbXVsKGFsOSwgYmwzKTtcbiAgICBtaWQgPSBNYXRoLmltdWwoYWw5LCBiaDMpO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg5LCBibDMpKSB8IDA7XG4gICAgaGkgPSBNYXRoLmltdWwoYWg5LCBiaDMpO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsOCwgYmw0KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWw4LCBiaDQpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDgsIGJsNCkpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDgsIGJoNCkpIHwgMDtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDcsIGJsNSkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsNywgYmg1KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg3LCBibDUpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWg3LCBiaDUpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWw2LCBibDYpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDYsIGJoNikpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoNiwgYmw2KSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoNiwgYmg2KSkgfCAwO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsNSwgYmw3KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWw1LCBiaDcpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDUsIGJsNykpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDUsIGJoNykpIHwgMDtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDQsIGJsOCkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsNCwgYmg4KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg0LCBibDgpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWg0LCBiaDgpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWwzLCBibDkpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDMsIGJoOSkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoMywgYmw5KSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoMywgYmg5KSkgfCAwO1xuICAgIHZhciB3MTIgPSAoKChjICsgbG8pIHwgMCkgKyAoKG1pZCAmIDB4MWZmZikgPDwgMTMpKSB8IDA7XG4gICAgYyA9ICgoKGhpICsgKG1pZCA+Pj4gMTMpKSB8IDApICsgKHcxMiA+Pj4gMjYpKSB8IDA7XG4gICAgdzEyICY9IDB4M2ZmZmZmZjtcbiAgICAvKiBrID0gMTMgKi9cbiAgICBsbyA9IE1hdGguaW11bChhbDksIGJsNCk7XG4gICAgbWlkID0gTWF0aC5pbXVsKGFsOSwgYmg0KTtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoOSwgYmw0KSkgfCAwO1xuICAgIGhpID0gTWF0aC5pbXVsKGFoOSwgYmg0KTtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDgsIGJsNSkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsOCwgYmg1KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg4LCBibDUpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWg4LCBiaDUpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWw3LCBibDYpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDcsIGJoNikpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoNywgYmw2KSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoNywgYmg2KSkgfCAwO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsNiwgYmw3KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWw2LCBiaDcpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDYsIGJsNykpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDYsIGJoNykpIHwgMDtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDUsIGJsOCkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsNSwgYmg4KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg1LCBibDgpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWg1LCBiaDgpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWw0LCBibDkpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDQsIGJoOSkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoNCwgYmw5KSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoNCwgYmg5KSkgfCAwO1xuICAgIHZhciB3MTMgPSAoKChjICsgbG8pIHwgMCkgKyAoKG1pZCAmIDB4MWZmZikgPDwgMTMpKSB8IDA7XG4gICAgYyA9ICgoKGhpICsgKG1pZCA+Pj4gMTMpKSB8IDApICsgKHcxMyA+Pj4gMjYpKSB8IDA7XG4gICAgdzEzICY9IDB4M2ZmZmZmZjtcbiAgICAvKiBrID0gMTQgKi9cbiAgICBsbyA9IE1hdGguaW11bChhbDksIGJsNSk7XG4gICAgbWlkID0gTWF0aC5pbXVsKGFsOSwgYmg1KTtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoOSwgYmw1KSkgfCAwO1xuICAgIGhpID0gTWF0aC5pbXVsKGFoOSwgYmg1KTtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDgsIGJsNikpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsOCwgYmg2KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg4LCBibDYpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWg4LCBiaDYpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWw3LCBibDcpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDcsIGJoNykpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoNywgYmw3KSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoNywgYmg3KSkgfCAwO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsNiwgYmw4KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWw2LCBiaDgpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDYsIGJsOCkpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDYsIGJoOCkpIHwgMDtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDUsIGJsOSkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsNSwgYmg5KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg1LCBibDkpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWg1LCBiaDkpKSB8IDA7XG4gICAgdmFyIHcxNCA9ICgoKGMgKyBsbykgfCAwKSArICgobWlkICYgMHgxZmZmKSA8PCAxMykpIHwgMDtcbiAgICBjID0gKCgoaGkgKyAobWlkID4+PiAxMykpIHwgMCkgKyAodzE0ID4+PiAyNikpIHwgMDtcbiAgICB3MTQgJj0gMHgzZmZmZmZmO1xuICAgIC8qIGsgPSAxNSAqL1xuICAgIGxvID0gTWF0aC5pbXVsKGFsOSwgYmw2KTtcbiAgICBtaWQgPSBNYXRoLmltdWwoYWw5LCBiaDYpO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg5LCBibDYpKSB8IDA7XG4gICAgaGkgPSBNYXRoLmltdWwoYWg5LCBiaDYpO1xuICAgIGxvID0gKGxvICsgTWF0aC5pbXVsKGFsOCwgYmw3KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWw4LCBiaDcpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhaDgsIGJsNykpIHwgMDtcbiAgICBoaSA9IChoaSArIE1hdGguaW11bChhaDgsIGJoNykpIHwgMDtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDcsIGJsOCkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsNywgYmg4KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg3LCBibDgpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWg3LCBiaDgpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWw2LCBibDkpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDYsIGJoOSkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoNiwgYmw5KSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoNiwgYmg5KSkgfCAwO1xuICAgIHZhciB3MTUgPSAoKChjICsgbG8pIHwgMCkgKyAoKG1pZCAmIDB4MWZmZikgPDwgMTMpKSB8IDA7XG4gICAgYyA9ICgoKGhpICsgKG1pZCA+Pj4gMTMpKSB8IDApICsgKHcxNSA+Pj4gMjYpKSB8IDA7XG4gICAgdzE1ICY9IDB4M2ZmZmZmZjtcbiAgICAvKiBrID0gMTYgKi9cbiAgICBsbyA9IE1hdGguaW11bChhbDksIGJsNyk7XG4gICAgbWlkID0gTWF0aC5pbXVsKGFsOSwgYmg3KTtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoOSwgYmw3KSkgfCAwO1xuICAgIGhpID0gTWF0aC5pbXVsKGFoOSwgYmg3KTtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDgsIGJsOCkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsOCwgYmg4KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg4LCBibDgpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWg4LCBiaDgpKSB8IDA7XG4gICAgbG8gPSAobG8gKyBNYXRoLmltdWwoYWw3LCBibDkpKSB8IDA7XG4gICAgbWlkID0gKG1pZCArIE1hdGguaW11bChhbDcsIGJoOSkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoNywgYmw5KSkgfCAwO1xuICAgIGhpID0gKGhpICsgTWF0aC5pbXVsKGFoNywgYmg5KSkgfCAwO1xuICAgIHZhciB3MTYgPSAoKChjICsgbG8pIHwgMCkgKyAoKG1pZCAmIDB4MWZmZikgPDwgMTMpKSB8IDA7XG4gICAgYyA9ICgoKGhpICsgKG1pZCA+Pj4gMTMpKSB8IDApICsgKHcxNiA+Pj4gMjYpKSB8IDA7XG4gICAgdzE2ICY9IDB4M2ZmZmZmZjtcbiAgICAvKiBrID0gMTcgKi9cbiAgICBsbyA9IE1hdGguaW11bChhbDksIGJsOCk7XG4gICAgbWlkID0gTWF0aC5pbXVsKGFsOSwgYmg4KTtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFoOSwgYmw4KSkgfCAwO1xuICAgIGhpID0gTWF0aC5pbXVsKGFoOSwgYmg4KTtcbiAgICBsbyA9IChsbyArIE1hdGguaW11bChhbDgsIGJsOSkpIHwgMDtcbiAgICBtaWQgPSAobWlkICsgTWF0aC5pbXVsKGFsOCwgYmg5KSkgfCAwO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg4LCBibDkpKSB8IDA7XG4gICAgaGkgPSAoaGkgKyBNYXRoLmltdWwoYWg4LCBiaDkpKSB8IDA7XG4gICAgdmFyIHcxNyA9ICgoKGMgKyBsbykgfCAwKSArICgobWlkICYgMHgxZmZmKSA8PCAxMykpIHwgMDtcbiAgICBjID0gKCgoaGkgKyAobWlkID4+PiAxMykpIHwgMCkgKyAodzE3ID4+PiAyNikpIHwgMDtcbiAgICB3MTcgJj0gMHgzZmZmZmZmO1xuICAgIC8qIGsgPSAxOCAqL1xuICAgIGxvID0gTWF0aC5pbXVsKGFsOSwgYmw5KTtcbiAgICBtaWQgPSBNYXRoLmltdWwoYWw5LCBiaDkpO1xuICAgIG1pZCA9IChtaWQgKyBNYXRoLmltdWwoYWg5LCBibDkpKSB8IDA7XG4gICAgaGkgPSBNYXRoLmltdWwoYWg5LCBiaDkpO1xuICAgIHZhciB3MTggPSAoKChjICsgbG8pIHwgMCkgKyAoKG1pZCAmIDB4MWZmZikgPDwgMTMpKSB8IDA7XG4gICAgYyA9ICgoKGhpICsgKG1pZCA+Pj4gMTMpKSB8IDApICsgKHcxOCA+Pj4gMjYpKSB8IDA7XG4gICAgdzE4ICY9IDB4M2ZmZmZmZjtcbiAgICBvWzBdID0gdzA7XG4gICAgb1sxXSA9IHcxO1xuICAgIG9bMl0gPSB3MjtcbiAgICBvWzNdID0gdzM7XG4gICAgb1s0XSA9IHc0O1xuICAgIG9bNV0gPSB3NTtcbiAgICBvWzZdID0gdzY7XG4gICAgb1s3XSA9IHc3O1xuICAgIG9bOF0gPSB3ODtcbiAgICBvWzldID0gdzk7XG4gICAgb1sxMF0gPSB3MTA7XG4gICAgb1sxMV0gPSB3MTE7XG4gICAgb1sxMl0gPSB3MTI7XG4gICAgb1sxM10gPSB3MTM7XG4gICAgb1sxNF0gPSB3MTQ7XG4gICAgb1sxNV0gPSB3MTU7XG4gICAgb1sxNl0gPSB3MTY7XG4gICAgb1sxN10gPSB3MTc7XG4gICAgb1sxOF0gPSB3MTg7XG4gICAgaWYgKGMgIT09IDApIHtcbiAgICAgIG9bMTldID0gYztcbiAgICAgIG91dC5sZW5ndGgrKztcbiAgICB9XG4gICAgcmV0dXJuIG91dDtcbiAgfTtcblxuICAvLyBQb2x5ZmlsbCBjb21iXG4gIGlmICghTWF0aC5pbXVsKSB7XG4gICAgY29tYjEwTXVsVG8gPSBzbWFsbE11bFRvO1xuICB9XG5cbiAgZnVuY3Rpb24gYmlnTXVsVG8gKHNlbGYsIG51bSwgb3V0KSB7XG4gICAgb3V0Lm5lZ2F0aXZlID0gbnVtLm5lZ2F0aXZlIF4gc2VsZi5uZWdhdGl2ZTtcbiAgICBvdXQubGVuZ3RoID0gc2VsZi5sZW5ndGggKyBudW0ubGVuZ3RoO1xuXG4gICAgdmFyIGNhcnJ5ID0gMDtcbiAgICB2YXIgaG5jYXJyeSA9IDA7XG4gICAgZm9yICh2YXIgayA9IDA7IGsgPCBvdXQubGVuZ3RoIC0gMTsgaysrKSB7XG4gICAgICAvLyBTdW0gYWxsIHdvcmRzIHdpdGggdGhlIHNhbWUgYGkgKyBqID0ga2AgYW5kIGFjY3VtdWxhdGUgYG5jYXJyeWAsXG4gICAgICAvLyBub3RlIHRoYXQgbmNhcnJ5IGNvdWxkIGJlID49IDB4M2ZmZmZmZlxuICAgICAgdmFyIG5jYXJyeSA9IGhuY2Fycnk7XG4gICAgICBobmNhcnJ5ID0gMDtcbiAgICAgIHZhciByd29yZCA9IGNhcnJ5ICYgMHgzZmZmZmZmO1xuICAgICAgdmFyIG1heEogPSBNYXRoLm1pbihrLCBudW0ubGVuZ3RoIC0gMSk7XG4gICAgICBmb3IgKHZhciBqID0gTWF0aC5tYXgoMCwgayAtIHNlbGYubGVuZ3RoICsgMSk7IGogPD0gbWF4SjsgaisrKSB7XG4gICAgICAgIHZhciBpID0gayAtIGo7XG4gICAgICAgIHZhciBhID0gc2VsZi53b3Jkc1tpXSB8IDA7XG4gICAgICAgIHZhciBiID0gbnVtLndvcmRzW2pdIHwgMDtcbiAgICAgICAgdmFyIHIgPSBhICogYjtcblxuICAgICAgICB2YXIgbG8gPSByICYgMHgzZmZmZmZmO1xuICAgICAgICBuY2FycnkgPSAobmNhcnJ5ICsgKChyIC8gMHg0MDAwMDAwKSB8IDApKSB8IDA7XG4gICAgICAgIGxvID0gKGxvICsgcndvcmQpIHwgMDtcbiAgICAgICAgcndvcmQgPSBsbyAmIDB4M2ZmZmZmZjtcbiAgICAgICAgbmNhcnJ5ID0gKG5jYXJyeSArIChsbyA+Pj4gMjYpKSB8IDA7XG5cbiAgICAgICAgaG5jYXJyeSArPSBuY2FycnkgPj4+IDI2O1xuICAgICAgICBuY2FycnkgJj0gMHgzZmZmZmZmO1xuICAgICAgfVxuICAgICAgb3V0LndvcmRzW2tdID0gcndvcmQ7XG4gICAgICBjYXJyeSA9IG5jYXJyeTtcbiAgICAgIG5jYXJyeSA9IGhuY2Fycnk7XG4gICAgfVxuICAgIGlmIChjYXJyeSAhPT0gMCkge1xuICAgICAgb3V0LndvcmRzW2tdID0gY2Fycnk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG91dC5sZW5ndGgtLTtcbiAgICB9XG5cbiAgICByZXR1cm4gb3V0LnN0cmlwKCk7XG4gIH1cblxuICBmdW5jdGlvbiBqdW1ib011bFRvIChzZWxmLCBudW0sIG91dCkge1xuICAgIHZhciBmZnRtID0gbmV3IEZGVE0oKTtcbiAgICByZXR1cm4gZmZ0bS5tdWxwKHNlbGYsIG51bSwgb3V0KTtcbiAgfVxuXG4gIEJOLnByb3RvdHlwZS5tdWxUbyA9IGZ1bmN0aW9uIG11bFRvIChudW0sIG91dCkge1xuICAgIHZhciByZXM7XG4gICAgdmFyIGxlbiA9IHRoaXMubGVuZ3RoICsgbnVtLmxlbmd0aDtcbiAgICBpZiAodGhpcy5sZW5ndGggPT09IDEwICYmIG51bS5sZW5ndGggPT09IDEwKSB7XG4gICAgICByZXMgPSBjb21iMTBNdWxUbyh0aGlzLCBudW0sIG91dCk7XG4gICAgfSBlbHNlIGlmIChsZW4gPCA2Mykge1xuICAgICAgcmVzID0gc21hbGxNdWxUbyh0aGlzLCBudW0sIG91dCk7XG4gICAgfSBlbHNlIGlmIChsZW4gPCAxMDI0KSB7XG4gICAgICByZXMgPSBiaWdNdWxUbyh0aGlzLCBudW0sIG91dCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJlcyA9IGp1bWJvTXVsVG8odGhpcywgbnVtLCBvdXQpO1xuICAgIH1cblxuICAgIHJldHVybiByZXM7XG4gIH07XG5cbiAgLy8gQ29vbGV5LVR1a2V5IGFsZ29yaXRobSBmb3IgRkZUXG4gIC8vIHNsaWdodGx5IHJldmlzaXRlZCB0byByZWx5IG9uIGxvb3BpbmcgaW5zdGVhZCBvZiByZWN1cnNpb25cblxuICBmdW5jdGlvbiBGRlRNICh4LCB5KSB7XG4gICAgdGhpcy54ID0geDtcbiAgICB0aGlzLnkgPSB5O1xuICB9XG5cbiAgRkZUTS5wcm90b3R5cGUubWFrZVJCVCA9IGZ1bmN0aW9uIG1ha2VSQlQgKE4pIHtcbiAgICB2YXIgdCA9IG5ldyBBcnJheShOKTtcbiAgICB2YXIgbCA9IEJOLnByb3RvdHlwZS5fY291bnRCaXRzKE4pIC0gMTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IE47IGkrKykge1xuICAgICAgdFtpXSA9IHRoaXMucmV2QmluKGksIGwsIE4pO1xuICAgIH1cblxuICAgIHJldHVybiB0O1xuICB9O1xuXG4gIC8vIFJldHVybnMgYmluYXJ5LXJldmVyc2VkIHJlcHJlc2VudGF0aW9uIG9mIGB4YFxuICBGRlRNLnByb3RvdHlwZS5yZXZCaW4gPSBmdW5jdGlvbiByZXZCaW4gKHgsIGwsIE4pIHtcbiAgICBpZiAoeCA9PT0gMCB8fCB4ID09PSBOIC0gMSkgcmV0dXJuIHg7XG5cbiAgICB2YXIgcmIgPSAwO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbDsgaSsrKSB7XG4gICAgICByYiB8PSAoeCAmIDEpIDw8IChsIC0gaSAtIDEpO1xuICAgICAgeCA+Pj0gMTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmI7XG4gIH07XG5cbiAgLy8gUGVyZm9ybXMgXCJ0d2VlZGxpbmdcIiBwaGFzZSwgdGhlcmVmb3JlICdlbXVsYXRpbmcnXG4gIC8vIGJlaGF2aW91ciBvZiB0aGUgcmVjdXJzaXZlIGFsZ29yaXRobVxuICBGRlRNLnByb3RvdHlwZS5wZXJtdXRlID0gZnVuY3Rpb24gcGVybXV0ZSAocmJ0LCByd3MsIGl3cywgcnR3cywgaXR3cywgTikge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgTjsgaSsrKSB7XG4gICAgICBydHdzW2ldID0gcndzW3JidFtpXV07XG4gICAgICBpdHdzW2ldID0gaXdzW3JidFtpXV07XG4gICAgfVxuICB9O1xuXG4gIEZGVE0ucHJvdG90eXBlLnRyYW5zZm9ybSA9IGZ1bmN0aW9uIHRyYW5zZm9ybSAocndzLCBpd3MsIHJ0d3MsIGl0d3MsIE4sIHJidCkge1xuICAgIHRoaXMucGVybXV0ZShyYnQsIHJ3cywgaXdzLCBydHdzLCBpdHdzLCBOKTtcblxuICAgIGZvciAodmFyIHMgPSAxOyBzIDwgTjsgcyA8PD0gMSkge1xuICAgICAgdmFyIGwgPSBzIDw8IDE7XG5cbiAgICAgIHZhciBydHdkZiA9IE1hdGguY29zKDIgKiBNYXRoLlBJIC8gbCk7XG4gICAgICB2YXIgaXR3ZGYgPSBNYXRoLnNpbigyICogTWF0aC5QSSAvIGwpO1xuXG4gICAgICBmb3IgKHZhciBwID0gMDsgcCA8IE47IHAgKz0gbCkge1xuICAgICAgICB2YXIgcnR3ZGZfID0gcnR3ZGY7XG4gICAgICAgIHZhciBpdHdkZl8gPSBpdHdkZjtcblxuICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHM7IGorKykge1xuICAgICAgICAgIHZhciByZSA9IHJ0d3NbcCArIGpdO1xuICAgICAgICAgIHZhciBpZSA9IGl0d3NbcCArIGpdO1xuXG4gICAgICAgICAgdmFyIHJvID0gcnR3c1twICsgaiArIHNdO1xuICAgICAgICAgIHZhciBpbyA9IGl0d3NbcCArIGogKyBzXTtcblxuICAgICAgICAgIHZhciByeCA9IHJ0d2RmXyAqIHJvIC0gaXR3ZGZfICogaW87XG5cbiAgICAgICAgICBpbyA9IHJ0d2RmXyAqIGlvICsgaXR3ZGZfICogcm87XG4gICAgICAgICAgcm8gPSByeDtcblxuICAgICAgICAgIHJ0d3NbcCArIGpdID0gcmUgKyBybztcbiAgICAgICAgICBpdHdzW3AgKyBqXSA9IGllICsgaW87XG5cbiAgICAgICAgICBydHdzW3AgKyBqICsgc10gPSByZSAtIHJvO1xuICAgICAgICAgIGl0d3NbcCArIGogKyBzXSA9IGllIC0gaW87XG5cbiAgICAgICAgICAvKiBqc2hpbnQgbWF4ZGVwdGggOiBmYWxzZSAqL1xuICAgICAgICAgIGlmIChqICE9PSBsKSB7XG4gICAgICAgICAgICByeCA9IHJ0d2RmICogcnR3ZGZfIC0gaXR3ZGYgKiBpdHdkZl87XG5cbiAgICAgICAgICAgIGl0d2RmXyA9IHJ0d2RmICogaXR3ZGZfICsgaXR3ZGYgKiBydHdkZl87XG4gICAgICAgICAgICBydHdkZl8gPSByeDtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH07XG5cbiAgRkZUTS5wcm90b3R5cGUuZ3Vlc3NMZW4xM2IgPSBmdW5jdGlvbiBndWVzc0xlbjEzYiAobiwgbSkge1xuICAgIHZhciBOID0gTWF0aC5tYXgobSwgbikgfCAxO1xuICAgIHZhciBvZGQgPSBOICYgMTtcbiAgICB2YXIgaSA9IDA7XG4gICAgZm9yIChOID0gTiAvIDIgfCAwOyBOOyBOID0gTiA+Pj4gMSkge1xuICAgICAgaSsrO1xuICAgIH1cblxuICAgIHJldHVybiAxIDw8IGkgKyAxICsgb2RkO1xuICB9O1xuXG4gIEZGVE0ucHJvdG90eXBlLmNvbmp1Z2F0ZSA9IGZ1bmN0aW9uIGNvbmp1Z2F0ZSAocndzLCBpd3MsIE4pIHtcbiAgICBpZiAoTiA8PSAxKSByZXR1cm47XG5cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IE4gLyAyOyBpKyspIHtcbiAgICAgIHZhciB0ID0gcndzW2ldO1xuXG4gICAgICByd3NbaV0gPSByd3NbTiAtIGkgLSAxXTtcbiAgICAgIHJ3c1tOIC0gaSAtIDFdID0gdDtcblxuICAgICAgdCA9IGl3c1tpXTtcblxuICAgICAgaXdzW2ldID0gLWl3c1tOIC0gaSAtIDFdO1xuICAgICAgaXdzW04gLSBpIC0gMV0gPSAtdDtcbiAgICB9XG4gIH07XG5cbiAgRkZUTS5wcm90b3R5cGUubm9ybWFsaXplMTNiID0gZnVuY3Rpb24gbm9ybWFsaXplMTNiICh3cywgTikge1xuICAgIHZhciBjYXJyeSA9IDA7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBOIC8gMjsgaSsrKSB7XG4gICAgICB2YXIgdyA9IE1hdGgucm91bmQod3NbMiAqIGkgKyAxXSAvIE4pICogMHgyMDAwICtcbiAgICAgICAgTWF0aC5yb3VuZCh3c1syICogaV0gLyBOKSArXG4gICAgICAgIGNhcnJ5O1xuXG4gICAgICB3c1tpXSA9IHcgJiAweDNmZmZmZmY7XG5cbiAgICAgIGlmICh3IDwgMHg0MDAwMDAwKSB7XG4gICAgICAgIGNhcnJ5ID0gMDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNhcnJ5ID0gdyAvIDB4NDAwMDAwMCB8IDA7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHdzO1xuICB9O1xuXG4gIEZGVE0ucHJvdG90eXBlLmNvbnZlcnQxM2IgPSBmdW5jdGlvbiBjb252ZXJ0MTNiICh3cywgbGVuLCByd3MsIE4pIHtcbiAgICB2YXIgY2FycnkgPSAwO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgIGNhcnJ5ID0gY2FycnkgKyAod3NbaV0gfCAwKTtcblxuICAgICAgcndzWzIgKiBpXSA9IGNhcnJ5ICYgMHgxZmZmOyBjYXJyeSA9IGNhcnJ5ID4+PiAxMztcbiAgICAgIHJ3c1syICogaSArIDFdID0gY2FycnkgJiAweDFmZmY7IGNhcnJ5ID0gY2FycnkgPj4+IDEzO1xuICAgIH1cblxuICAgIC8vIFBhZCB3aXRoIHplcm9lc1xuICAgIGZvciAoaSA9IDIgKiBsZW47IGkgPCBOOyArK2kpIHtcbiAgICAgIHJ3c1tpXSA9IDA7XG4gICAgfVxuXG4gICAgYXNzZXJ0KGNhcnJ5ID09PSAwKTtcbiAgICBhc3NlcnQoKGNhcnJ5ICYgfjB4MWZmZikgPT09IDApO1xuICB9O1xuXG4gIEZGVE0ucHJvdG90eXBlLnN0dWIgPSBmdW5jdGlvbiBzdHViIChOKSB7XG4gICAgdmFyIHBoID0gbmV3IEFycmF5KE4pO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgTjsgaSsrKSB7XG4gICAgICBwaFtpXSA9IDA7XG4gICAgfVxuXG4gICAgcmV0dXJuIHBoO1xuICB9O1xuXG4gIEZGVE0ucHJvdG90eXBlLm11bHAgPSBmdW5jdGlvbiBtdWxwICh4LCB5LCBvdXQpIHtcbiAgICB2YXIgTiA9IDIgKiB0aGlzLmd1ZXNzTGVuMTNiKHgubGVuZ3RoLCB5Lmxlbmd0aCk7XG5cbiAgICB2YXIgcmJ0ID0gdGhpcy5tYWtlUkJUKE4pO1xuXG4gICAgdmFyIF8gPSB0aGlzLnN0dWIoTik7XG5cbiAgICB2YXIgcndzID0gbmV3IEFycmF5KE4pO1xuICAgIHZhciByd3N0ID0gbmV3IEFycmF5KE4pO1xuICAgIHZhciBpd3N0ID0gbmV3IEFycmF5KE4pO1xuXG4gICAgdmFyIG5yd3MgPSBuZXcgQXJyYXkoTik7XG4gICAgdmFyIG5yd3N0ID0gbmV3IEFycmF5KE4pO1xuICAgIHZhciBuaXdzdCA9IG5ldyBBcnJheShOKTtcblxuICAgIHZhciBybXdzID0gb3V0LndvcmRzO1xuICAgIHJtd3MubGVuZ3RoID0gTjtcblxuICAgIHRoaXMuY29udmVydDEzYih4LndvcmRzLCB4Lmxlbmd0aCwgcndzLCBOKTtcbiAgICB0aGlzLmNvbnZlcnQxM2IoeS53b3JkcywgeS5sZW5ndGgsIG5yd3MsIE4pO1xuXG4gICAgdGhpcy50cmFuc2Zvcm0ocndzLCBfLCByd3N0LCBpd3N0LCBOLCByYnQpO1xuICAgIHRoaXMudHJhbnNmb3JtKG5yd3MsIF8sIG5yd3N0LCBuaXdzdCwgTiwgcmJ0KTtcblxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgTjsgaSsrKSB7XG4gICAgICB2YXIgcnggPSByd3N0W2ldICogbnJ3c3RbaV0gLSBpd3N0W2ldICogbml3c3RbaV07XG4gICAgICBpd3N0W2ldID0gcndzdFtpXSAqIG5pd3N0W2ldICsgaXdzdFtpXSAqIG5yd3N0W2ldO1xuICAgICAgcndzdFtpXSA9IHJ4O1xuICAgIH1cblxuICAgIHRoaXMuY29uanVnYXRlKHJ3c3QsIGl3c3QsIE4pO1xuICAgIHRoaXMudHJhbnNmb3JtKHJ3c3QsIGl3c3QsIHJtd3MsIF8sIE4sIHJidCk7XG4gICAgdGhpcy5jb25qdWdhdGUocm13cywgXywgTik7XG4gICAgdGhpcy5ub3JtYWxpemUxM2Iocm13cywgTik7XG5cbiAgICBvdXQubmVnYXRpdmUgPSB4Lm5lZ2F0aXZlIF4geS5uZWdhdGl2ZTtcbiAgICBvdXQubGVuZ3RoID0geC5sZW5ndGggKyB5Lmxlbmd0aDtcbiAgICByZXR1cm4gb3V0LnN0cmlwKCk7XG4gIH07XG5cbiAgLy8gTXVsdGlwbHkgYHRoaXNgIGJ5IGBudW1gXG4gIEJOLnByb3RvdHlwZS5tdWwgPSBmdW5jdGlvbiBtdWwgKG51bSkge1xuICAgIHZhciBvdXQgPSBuZXcgQk4obnVsbCk7XG4gICAgb3V0LndvcmRzID0gbmV3IEFycmF5KHRoaXMubGVuZ3RoICsgbnVtLmxlbmd0aCk7XG4gICAgcmV0dXJuIHRoaXMubXVsVG8obnVtLCBvdXQpO1xuICB9O1xuXG4gIC8vIE11bHRpcGx5IGVtcGxveWluZyBGRlRcbiAgQk4ucHJvdG90eXBlLm11bGYgPSBmdW5jdGlvbiBtdWxmIChudW0pIHtcbiAgICB2YXIgb3V0ID0gbmV3IEJOKG51bGwpO1xuICAgIG91dC53b3JkcyA9IG5ldyBBcnJheSh0aGlzLmxlbmd0aCArIG51bS5sZW5ndGgpO1xuICAgIHJldHVybiBqdW1ib011bFRvKHRoaXMsIG51bSwgb3V0KTtcbiAgfTtcblxuICAvLyBJbi1wbGFjZSBNdWx0aXBsaWNhdGlvblxuICBCTi5wcm90b3R5cGUuaW11bCA9IGZ1bmN0aW9uIGltdWwgKG51bSkge1xuICAgIHJldHVybiB0aGlzLmNsb25lKCkubXVsVG8obnVtLCB0aGlzKTtcbiAgfTtcblxuICBCTi5wcm90b3R5cGUuaW11bG4gPSBmdW5jdGlvbiBpbXVsbiAobnVtKSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBudW0gPT09ICdudW1iZXInKTtcbiAgICBhc3NlcnQobnVtIDwgMHg0MDAwMDAwKTtcblxuICAgIC8vIENhcnJ5XG4gICAgdmFyIGNhcnJ5ID0gMDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciB3ID0gKHRoaXMud29yZHNbaV0gfCAwKSAqIG51bTtcbiAgICAgIHZhciBsbyA9ICh3ICYgMHgzZmZmZmZmKSArIChjYXJyeSAmIDB4M2ZmZmZmZik7XG4gICAgICBjYXJyeSA+Pj0gMjY7XG4gICAgICBjYXJyeSArPSAodyAvIDB4NDAwMDAwMCkgfCAwO1xuICAgICAgLy8gTk9URTogbG8gaXMgMjdiaXQgbWF4aW11bVxuICAgICAgY2FycnkgKz0gbG8gPj4+IDI2O1xuICAgICAgdGhpcy53b3Jkc1tpXSA9IGxvICYgMHgzZmZmZmZmO1xuICAgIH1cblxuICAgIGlmIChjYXJyeSAhPT0gMCkge1xuICAgICAgdGhpcy53b3Jkc1tpXSA9IGNhcnJ5O1xuICAgICAgdGhpcy5sZW5ndGgrKztcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcztcbiAgfTtcblxuICBCTi5wcm90b3R5cGUubXVsbiA9IGZ1bmN0aW9uIG11bG4gKG51bSkge1xuICAgIHJldHVybiB0aGlzLmNsb25lKCkuaW11bG4obnVtKTtcbiAgfTtcblxuICAvLyBgdGhpc2AgKiBgdGhpc2BcbiAgQk4ucHJvdG90eXBlLnNxciA9IGZ1bmN0aW9uIHNxciAoKSB7XG4gICAgcmV0dXJuIHRoaXMubXVsKHRoaXMpO1xuICB9O1xuXG4gIC8vIGB0aGlzYCAqIGB0aGlzYCBpbi1wbGFjZVxuICBCTi5wcm90b3R5cGUuaXNxciA9IGZ1bmN0aW9uIGlzcXIgKCkge1xuICAgIHJldHVybiB0aGlzLmltdWwodGhpcy5jbG9uZSgpKTtcbiAgfTtcblxuICAvLyBNYXRoLnBvdyhgdGhpc2AsIGBudW1gKVxuICBCTi5wcm90b3R5cGUucG93ID0gZnVuY3Rpb24gcG93IChudW0pIHtcbiAgICB2YXIgdyA9IHRvQml0QXJyYXkobnVtKTtcbiAgICBpZiAody5sZW5ndGggPT09IDApIHJldHVybiBuZXcgQk4oMSk7XG5cbiAgICAvLyBTa2lwIGxlYWRpbmcgemVyb2VzXG4gICAgdmFyIHJlcyA9IHRoaXM7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB3Lmxlbmd0aDsgaSsrLCByZXMgPSByZXMuc3FyKCkpIHtcbiAgICAgIGlmICh3W2ldICE9PSAwKSBicmVhaztcbiAgICB9XG5cbiAgICBpZiAoKytpIDwgdy5sZW5ndGgpIHtcbiAgICAgIGZvciAodmFyIHEgPSByZXMuc3FyKCk7IGkgPCB3Lmxlbmd0aDsgaSsrLCBxID0gcS5zcXIoKSkge1xuICAgICAgICBpZiAod1tpXSA9PT0gMCkgY29udGludWU7XG5cbiAgICAgICAgcmVzID0gcmVzLm11bChxKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gcmVzO1xuICB9O1xuXG4gIC8vIFNoaWZ0LWxlZnQgaW4tcGxhY2VcbiAgQk4ucHJvdG90eXBlLml1c2hsbiA9IGZ1bmN0aW9uIGl1c2hsbiAoYml0cykge1xuICAgIGFzc2VydCh0eXBlb2YgYml0cyA9PT0gJ251bWJlcicgJiYgYml0cyA+PSAwKTtcbiAgICB2YXIgciA9IGJpdHMgJSAyNjtcbiAgICB2YXIgcyA9IChiaXRzIC0gcikgLyAyNjtcbiAgICB2YXIgY2FycnlNYXNrID0gKDB4M2ZmZmZmZiA+Pj4gKDI2IC0gcikpIDw8ICgyNiAtIHIpO1xuICAgIHZhciBpO1xuXG4gICAgaWYgKHIgIT09IDApIHtcbiAgICAgIHZhciBjYXJyeSA9IDA7XG5cbiAgICAgIGZvciAoaSA9IDA7IGkgPCB0aGlzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciBuZXdDYXJyeSA9IHRoaXMud29yZHNbaV0gJiBjYXJyeU1hc2s7XG4gICAgICAgIHZhciBjID0gKCh0aGlzLndvcmRzW2ldIHwgMCkgLSBuZXdDYXJyeSkgPDwgcjtcbiAgICAgICAgdGhpcy53b3Jkc1tpXSA9IGMgfCBjYXJyeTtcbiAgICAgICAgY2FycnkgPSBuZXdDYXJyeSA+Pj4gKDI2IC0gcik7XG4gICAgICB9XG5cbiAgICAgIGlmIChjYXJyeSkge1xuICAgICAgICB0aGlzLndvcmRzW2ldID0gY2Fycnk7XG4gICAgICAgIHRoaXMubGVuZ3RoKys7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHMgIT09IDApIHtcbiAgICAgIGZvciAoaSA9IHRoaXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgdGhpcy53b3Jkc1tpICsgc10gPSB0aGlzLndvcmRzW2ldO1xuICAgICAgfVxuXG4gICAgICBmb3IgKGkgPSAwOyBpIDwgczsgaSsrKSB7XG4gICAgICAgIHRoaXMud29yZHNbaV0gPSAwO1xuICAgICAgfVxuXG4gICAgICB0aGlzLmxlbmd0aCArPSBzO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLnN0cmlwKCk7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLmlzaGxuID0gZnVuY3Rpb24gaXNobG4gKGJpdHMpIHtcbiAgICAvLyBUT0RPKGluZHV0bnkpOiBpbXBsZW1lbnQgbWVcbiAgICBhc3NlcnQodGhpcy5uZWdhdGl2ZSA9PT0gMCk7XG4gICAgcmV0dXJuIHRoaXMuaXVzaGxuKGJpdHMpO1xuICB9O1xuXG4gIC8vIFNoaWZ0LXJpZ2h0IGluLXBsYWNlXG4gIC8vIE5PVEU6IGBoaW50YCBpcyBhIGxvd2VzdCBiaXQgYmVmb3JlIHRyYWlsaW5nIHplcm9lc1xuICAvLyBOT1RFOiBpZiBgZXh0ZW5kZWRgIGlzIHByZXNlbnQgLSBpdCB3aWxsIGJlIGZpbGxlZCB3aXRoIGRlc3Ryb3llZCBiaXRzXG4gIEJOLnByb3RvdHlwZS5pdXNocm4gPSBmdW5jdGlvbiBpdXNocm4gKGJpdHMsIGhpbnQsIGV4dGVuZGVkKSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBiaXRzID09PSAnbnVtYmVyJyAmJiBiaXRzID49IDApO1xuICAgIHZhciBoO1xuICAgIGlmIChoaW50KSB7XG4gICAgICBoID0gKGhpbnQgLSAoaGludCAlIDI2KSkgLyAyNjtcbiAgICB9IGVsc2Uge1xuICAgICAgaCA9IDA7XG4gICAgfVxuXG4gICAgdmFyIHIgPSBiaXRzICUgMjY7XG4gICAgdmFyIHMgPSBNYXRoLm1pbigoYml0cyAtIHIpIC8gMjYsIHRoaXMubGVuZ3RoKTtcbiAgICB2YXIgbWFzayA9IDB4M2ZmZmZmZiBeICgoMHgzZmZmZmZmID4+PiByKSA8PCByKTtcbiAgICB2YXIgbWFza2VkV29yZHMgPSBleHRlbmRlZDtcblxuICAgIGggLT0gcztcbiAgICBoID0gTWF0aC5tYXgoMCwgaCk7XG5cbiAgICAvLyBFeHRlbmRlZCBtb2RlLCBjb3B5IG1hc2tlZCBwYXJ0XG4gICAgaWYgKG1hc2tlZFdvcmRzKSB7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHM7IGkrKykge1xuICAgICAgICBtYXNrZWRXb3Jkcy53b3Jkc1tpXSA9IHRoaXMud29yZHNbaV07XG4gICAgICB9XG4gICAgICBtYXNrZWRXb3Jkcy5sZW5ndGggPSBzO1xuICAgIH1cblxuICAgIGlmIChzID09PSAwKSB7XG4gICAgICAvLyBOby1vcCwgd2Ugc2hvdWxkIG5vdCBtb3ZlIGFueXRoaW5nIGF0IGFsbFxuICAgIH0gZWxzZSBpZiAodGhpcy5sZW5ndGggPiBzKSB7XG4gICAgICB0aGlzLmxlbmd0aCAtPSBzO1xuICAgICAgZm9yIChpID0gMDsgaSA8IHRoaXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdGhpcy53b3Jkc1tpXSA9IHRoaXMud29yZHNbaSArIHNdO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLndvcmRzWzBdID0gMDtcbiAgICAgIHRoaXMubGVuZ3RoID0gMTtcbiAgICB9XG5cbiAgICB2YXIgY2FycnkgPSAwO1xuICAgIGZvciAoaSA9IHRoaXMubGVuZ3RoIC0gMTsgaSA+PSAwICYmIChjYXJyeSAhPT0gMCB8fCBpID49IGgpOyBpLS0pIHtcbiAgICAgIHZhciB3b3JkID0gdGhpcy53b3Jkc1tpXSB8IDA7XG4gICAgICB0aGlzLndvcmRzW2ldID0gKGNhcnJ5IDw8ICgyNiAtIHIpKSB8ICh3b3JkID4+PiByKTtcbiAgICAgIGNhcnJ5ID0gd29yZCAmIG1hc2s7XG4gICAgfVxuXG4gICAgLy8gUHVzaCBjYXJyaWVkIGJpdHMgYXMgYSBtYXNrXG4gICAgaWYgKG1hc2tlZFdvcmRzICYmIGNhcnJ5ICE9PSAwKSB7XG4gICAgICBtYXNrZWRXb3Jkcy53b3Jkc1ttYXNrZWRXb3Jkcy5sZW5ndGgrK10gPSBjYXJyeTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5sZW5ndGggPT09IDApIHtcbiAgICAgIHRoaXMud29yZHNbMF0gPSAwO1xuICAgICAgdGhpcy5sZW5ndGggPSAxO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLnN0cmlwKCk7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLmlzaHJuID0gZnVuY3Rpb24gaXNocm4gKGJpdHMsIGhpbnQsIGV4dGVuZGVkKSB7XG4gICAgLy8gVE9ETyhpbmR1dG55KTogaW1wbGVtZW50IG1lXG4gICAgYXNzZXJ0KHRoaXMubmVnYXRpdmUgPT09IDApO1xuICAgIHJldHVybiB0aGlzLml1c2hybihiaXRzLCBoaW50LCBleHRlbmRlZCk7XG4gIH07XG5cbiAgLy8gU2hpZnQtbGVmdFxuICBCTi5wcm90b3R5cGUuc2hsbiA9IGZ1bmN0aW9uIHNobG4gKGJpdHMpIHtcbiAgICByZXR1cm4gdGhpcy5jbG9uZSgpLmlzaGxuKGJpdHMpO1xuICB9O1xuXG4gIEJOLnByb3RvdHlwZS51c2hsbiA9IGZ1bmN0aW9uIHVzaGxuIChiaXRzKSB7XG4gICAgcmV0dXJuIHRoaXMuY2xvbmUoKS5pdXNobG4oYml0cyk7XG4gIH07XG5cbiAgLy8gU2hpZnQtcmlnaHRcbiAgQk4ucHJvdG90eXBlLnNocm4gPSBmdW5jdGlvbiBzaHJuIChiaXRzKSB7XG4gICAgcmV0dXJuIHRoaXMuY2xvbmUoKS5pc2hybihiaXRzKTtcbiAgfTtcblxuICBCTi5wcm90b3R5cGUudXNocm4gPSBmdW5jdGlvbiB1c2hybiAoYml0cykge1xuICAgIHJldHVybiB0aGlzLmNsb25lKCkuaXVzaHJuKGJpdHMpO1xuICB9O1xuXG4gIC8vIFRlc3QgaWYgbiBiaXQgaXMgc2V0XG4gIEJOLnByb3RvdHlwZS50ZXN0biA9IGZ1bmN0aW9uIHRlc3RuIChiaXQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGJpdCA9PT0gJ251bWJlcicgJiYgYml0ID49IDApO1xuICAgIHZhciByID0gYml0ICUgMjY7XG4gICAgdmFyIHMgPSAoYml0IC0gcikgLyAyNjtcbiAgICB2YXIgcSA9IDEgPDwgcjtcblxuICAgIC8vIEZhc3QgY2FzZTogYml0IGlzIG11Y2ggaGlnaGVyIHRoYW4gYWxsIGV4aXN0aW5nIHdvcmRzXG4gICAgaWYgKHRoaXMubGVuZ3RoIDw9IHMpIHJldHVybiBmYWxzZTtcblxuICAgIC8vIENoZWNrIGJpdCBhbmQgcmV0dXJuXG4gICAgdmFyIHcgPSB0aGlzLndvcmRzW3NdO1xuXG4gICAgcmV0dXJuICEhKHcgJiBxKTtcbiAgfTtcblxuICAvLyBSZXR1cm4gb25seSBsb3dlcnMgYml0cyBvZiBudW1iZXIgKGluLXBsYWNlKVxuICBCTi5wcm90b3R5cGUuaW1hc2tuID0gZnVuY3Rpb24gaW1hc2tuIChiaXRzKSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBiaXRzID09PSAnbnVtYmVyJyAmJiBiaXRzID49IDApO1xuICAgIHZhciByID0gYml0cyAlIDI2O1xuICAgIHZhciBzID0gKGJpdHMgLSByKSAvIDI2O1xuXG4gICAgYXNzZXJ0KHRoaXMubmVnYXRpdmUgPT09IDAsICdpbWFza24gd29ya3Mgb25seSB3aXRoIHBvc2l0aXZlIG51bWJlcnMnKTtcblxuICAgIGlmICh0aGlzLmxlbmd0aCA8PSBzKSB7XG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBpZiAociAhPT0gMCkge1xuICAgICAgcysrO1xuICAgIH1cbiAgICB0aGlzLmxlbmd0aCA9IE1hdGgubWluKHMsIHRoaXMubGVuZ3RoKTtcblxuICAgIGlmIChyICE9PSAwKSB7XG4gICAgICB2YXIgbWFzayA9IDB4M2ZmZmZmZiBeICgoMHgzZmZmZmZmID4+PiByKSA8PCByKTtcbiAgICAgIHRoaXMud29yZHNbdGhpcy5sZW5ndGggLSAxXSAmPSBtYXNrO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLnN0cmlwKCk7XG4gIH07XG5cbiAgLy8gUmV0dXJuIG9ubHkgbG93ZXJzIGJpdHMgb2YgbnVtYmVyXG4gIEJOLnByb3RvdHlwZS5tYXNrbiA9IGZ1bmN0aW9uIG1hc2tuIChiaXRzKSB7XG4gICAgcmV0dXJuIHRoaXMuY2xvbmUoKS5pbWFza24oYml0cyk7XG4gIH07XG5cbiAgLy8gQWRkIHBsYWluIG51bWJlciBgbnVtYCB0byBgdGhpc2BcbiAgQk4ucHJvdG90eXBlLmlhZGRuID0gZnVuY3Rpb24gaWFkZG4gKG51bSkge1xuICAgIGFzc2VydCh0eXBlb2YgbnVtID09PSAnbnVtYmVyJyk7XG4gICAgYXNzZXJ0KG51bSA8IDB4NDAwMDAwMCk7XG4gICAgaWYgKG51bSA8IDApIHJldHVybiB0aGlzLmlzdWJuKC1udW0pO1xuXG4gICAgLy8gUG9zc2libGUgc2lnbiBjaGFuZ2VcbiAgICBpZiAodGhpcy5uZWdhdGl2ZSAhPT0gMCkge1xuICAgICAgaWYgKHRoaXMubGVuZ3RoID09PSAxICYmICh0aGlzLndvcmRzWzBdIHwgMCkgPCBudW0pIHtcbiAgICAgICAgdGhpcy53b3Jkc1swXSA9IG51bSAtICh0aGlzLndvcmRzWzBdIHwgMCk7XG4gICAgICAgIHRoaXMubmVnYXRpdmUgPSAwO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgIH1cblxuICAgICAgdGhpcy5uZWdhdGl2ZSA9IDA7XG4gICAgICB0aGlzLmlzdWJuKG51bSk7XG4gICAgICB0aGlzLm5lZ2F0aXZlID0gMTtcbiAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8vIEFkZCB3aXRob3V0IGNoZWNrc1xuICAgIHJldHVybiB0aGlzLl9pYWRkbihudW0pO1xuICB9O1xuXG4gIEJOLnByb3RvdHlwZS5faWFkZG4gPSBmdW5jdGlvbiBfaWFkZG4gKG51bSkge1xuICAgIHRoaXMud29yZHNbMF0gKz0gbnVtO1xuXG4gICAgLy8gQ2FycnlcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMubGVuZ3RoICYmIHRoaXMud29yZHNbaV0gPj0gMHg0MDAwMDAwOyBpKyspIHtcbiAgICAgIHRoaXMud29yZHNbaV0gLT0gMHg0MDAwMDAwO1xuICAgICAgaWYgKGkgPT09IHRoaXMubGVuZ3RoIC0gMSkge1xuICAgICAgICB0aGlzLndvcmRzW2kgKyAxXSA9IDE7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLndvcmRzW2kgKyAxXSsrO1xuICAgICAgfVxuICAgIH1cbiAgICB0aGlzLmxlbmd0aCA9IE1hdGgubWF4KHRoaXMubGVuZ3RoLCBpICsgMSk7XG5cbiAgICByZXR1cm4gdGhpcztcbiAgfTtcblxuICAvLyBTdWJ0cmFjdCBwbGFpbiBudW1iZXIgYG51bWAgZnJvbSBgdGhpc2BcbiAgQk4ucHJvdG90eXBlLmlzdWJuID0gZnVuY3Rpb24gaXN1Ym4gKG51bSkge1xuICAgIGFzc2VydCh0eXBlb2YgbnVtID09PSAnbnVtYmVyJyk7XG4gICAgYXNzZXJ0KG51bSA8IDB4NDAwMDAwMCk7XG4gICAgaWYgKG51bSA8IDApIHJldHVybiB0aGlzLmlhZGRuKC1udW0pO1xuXG4gICAgaWYgKHRoaXMubmVnYXRpdmUgIT09IDApIHtcbiAgICAgIHRoaXMubmVnYXRpdmUgPSAwO1xuICAgICAgdGhpcy5pYWRkbihudW0pO1xuICAgICAgdGhpcy5uZWdhdGl2ZSA9IDE7XG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICB0aGlzLndvcmRzWzBdIC09IG51bTtcblxuICAgIGlmICh0aGlzLmxlbmd0aCA9PT0gMSAmJiB0aGlzLndvcmRzWzBdIDwgMCkge1xuICAgICAgdGhpcy53b3Jkc1swXSA9IC10aGlzLndvcmRzWzBdO1xuICAgICAgdGhpcy5uZWdhdGl2ZSA9IDE7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIENhcnJ5XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMubGVuZ3RoICYmIHRoaXMud29yZHNbaV0gPCAwOyBpKyspIHtcbiAgICAgICAgdGhpcy53b3Jkc1tpXSArPSAweDQwMDAwMDA7XG4gICAgICAgIHRoaXMud29yZHNbaSArIDFdIC09IDE7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuc3RyaXAoKTtcbiAgfTtcblxuICBCTi5wcm90b3R5cGUuYWRkbiA9IGZ1bmN0aW9uIGFkZG4gKG51bSkge1xuICAgIHJldHVybiB0aGlzLmNsb25lKCkuaWFkZG4obnVtKTtcbiAgfTtcblxuICBCTi5wcm90b3R5cGUuc3VibiA9IGZ1bmN0aW9uIHN1Ym4gKG51bSkge1xuICAgIHJldHVybiB0aGlzLmNsb25lKCkuaXN1Ym4obnVtKTtcbiAgfTtcblxuICBCTi5wcm90b3R5cGUuaWFicyA9IGZ1bmN0aW9uIGlhYnMgKCkge1xuICAgIHRoaXMubmVnYXRpdmUgPSAwO1xuXG4gICAgcmV0dXJuIHRoaXM7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLmFicyA9IGZ1bmN0aW9uIGFicyAoKSB7XG4gICAgcmV0dXJuIHRoaXMuY2xvbmUoKS5pYWJzKCk7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLl9pc2hsbnN1Ym11bCA9IGZ1bmN0aW9uIF9pc2hsbnN1Ym11bCAobnVtLCBtdWwsIHNoaWZ0KSB7XG4gICAgdmFyIGxlbiA9IG51bS5sZW5ndGggKyBzaGlmdDtcbiAgICB2YXIgaTtcblxuICAgIHRoaXMuX2V4cGFuZChsZW4pO1xuXG4gICAgdmFyIHc7XG4gICAgdmFyIGNhcnJ5ID0gMDtcbiAgICBmb3IgKGkgPSAwOyBpIDwgbnVtLmxlbmd0aDsgaSsrKSB7XG4gICAgICB3ID0gKHRoaXMud29yZHNbaSArIHNoaWZ0XSB8IDApICsgY2Fycnk7XG4gICAgICB2YXIgcmlnaHQgPSAobnVtLndvcmRzW2ldIHwgMCkgKiBtdWw7XG4gICAgICB3IC09IHJpZ2h0ICYgMHgzZmZmZmZmO1xuICAgICAgY2FycnkgPSAodyA+PiAyNikgLSAoKHJpZ2h0IC8gMHg0MDAwMDAwKSB8IDApO1xuICAgICAgdGhpcy53b3Jkc1tpICsgc2hpZnRdID0gdyAmIDB4M2ZmZmZmZjtcbiAgICB9XG4gICAgZm9yICg7IGkgPCB0aGlzLmxlbmd0aCAtIHNoaWZ0OyBpKyspIHtcbiAgICAgIHcgPSAodGhpcy53b3Jkc1tpICsgc2hpZnRdIHwgMCkgKyBjYXJyeTtcbiAgICAgIGNhcnJ5ID0gdyA+PiAyNjtcbiAgICAgIHRoaXMud29yZHNbaSArIHNoaWZ0XSA9IHcgJiAweDNmZmZmZmY7XG4gICAgfVxuXG4gICAgaWYgKGNhcnJ5ID09PSAwKSByZXR1cm4gdGhpcy5zdHJpcCgpO1xuXG4gICAgLy8gU3VidHJhY3Rpb24gb3ZlcmZsb3dcbiAgICBhc3NlcnQoY2FycnkgPT09IC0xKTtcbiAgICBjYXJyeSA9IDA7XG4gICAgZm9yIChpID0gMDsgaSA8IHRoaXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIHcgPSAtKHRoaXMud29yZHNbaV0gfCAwKSArIGNhcnJ5O1xuICAgICAgY2FycnkgPSB3ID4+IDI2O1xuICAgICAgdGhpcy53b3Jkc1tpXSA9IHcgJiAweDNmZmZmZmY7XG4gICAgfVxuICAgIHRoaXMubmVnYXRpdmUgPSAxO1xuXG4gICAgcmV0dXJuIHRoaXMuc3RyaXAoKTtcbiAgfTtcblxuICBCTi5wcm90b3R5cGUuX3dvcmREaXYgPSBmdW5jdGlvbiBfd29yZERpdiAobnVtLCBtb2RlKSB7XG4gICAgdmFyIHNoaWZ0ID0gdGhpcy5sZW5ndGggLSBudW0ubGVuZ3RoO1xuXG4gICAgdmFyIGEgPSB0aGlzLmNsb25lKCk7XG4gICAgdmFyIGIgPSBudW07XG5cbiAgICAvLyBOb3JtYWxpemVcbiAgICB2YXIgYmhpID0gYi53b3Jkc1tiLmxlbmd0aCAtIDFdIHwgMDtcbiAgICB2YXIgYmhpQml0cyA9IHRoaXMuX2NvdW50Qml0cyhiaGkpO1xuICAgIHNoaWZ0ID0gMjYgLSBiaGlCaXRzO1xuICAgIGlmIChzaGlmdCAhPT0gMCkge1xuICAgICAgYiA9IGIudXNobG4oc2hpZnQpO1xuICAgICAgYS5pdXNobG4oc2hpZnQpO1xuICAgICAgYmhpID0gYi53b3Jkc1tiLmxlbmd0aCAtIDFdIHwgMDtcbiAgICB9XG5cbiAgICAvLyBJbml0aWFsaXplIHF1b3RpZW50XG4gICAgdmFyIG0gPSBhLmxlbmd0aCAtIGIubGVuZ3RoO1xuICAgIHZhciBxO1xuXG4gICAgaWYgKG1vZGUgIT09ICdtb2QnKSB7XG4gICAgICBxID0gbmV3IEJOKG51bGwpO1xuICAgICAgcS5sZW5ndGggPSBtICsgMTtcbiAgICAgIHEud29yZHMgPSBuZXcgQXJyYXkocS5sZW5ndGgpO1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBxLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHEud29yZHNbaV0gPSAwO1xuICAgICAgfVxuICAgIH1cblxuICAgIHZhciBkaWZmID0gYS5jbG9uZSgpLl9pc2hsbnN1Ym11bChiLCAxLCBtKTtcbiAgICBpZiAoZGlmZi5uZWdhdGl2ZSA9PT0gMCkge1xuICAgICAgYSA9IGRpZmY7XG4gICAgICBpZiAocSkge1xuICAgICAgICBxLndvcmRzW21dID0gMTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKHZhciBqID0gbSAtIDE7IGogPj0gMDsgai0tKSB7XG4gICAgICB2YXIgcWogPSAoYS53b3Jkc1tiLmxlbmd0aCArIGpdIHwgMCkgKiAweDQwMDAwMDAgK1xuICAgICAgICAoYS53b3Jkc1tiLmxlbmd0aCArIGogLSAxXSB8IDApO1xuXG4gICAgICAvLyBOT1RFOiAocWogLyBiaGkpIGlzICgweDNmZmZmZmYgKiAweDQwMDAwMDAgKyAweDNmZmZmZmYpIC8gMHgyMDAwMDAwIG1heFxuICAgICAgLy8gKDB4N2ZmZmZmZilcbiAgICAgIHFqID0gTWF0aC5taW4oKHFqIC8gYmhpKSB8IDAsIDB4M2ZmZmZmZik7XG5cbiAgICAgIGEuX2lzaGxuc3VibXVsKGIsIHFqLCBqKTtcbiAgICAgIHdoaWxlIChhLm5lZ2F0aXZlICE9PSAwKSB7XG4gICAgICAgIHFqLS07XG4gICAgICAgIGEubmVnYXRpdmUgPSAwO1xuICAgICAgICBhLl9pc2hsbnN1Ym11bChiLCAxLCBqKTtcbiAgICAgICAgaWYgKCFhLmlzWmVybygpKSB7XG4gICAgICAgICAgYS5uZWdhdGl2ZSBePSAxO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAocSkge1xuICAgICAgICBxLndvcmRzW2pdID0gcWo7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChxKSB7XG4gICAgICBxLnN0cmlwKCk7XG4gICAgfVxuICAgIGEuc3RyaXAoKTtcblxuICAgIC8vIERlbm9ybWFsaXplXG4gICAgaWYgKG1vZGUgIT09ICdkaXYnICYmIHNoaWZ0ICE9PSAwKSB7XG4gICAgICBhLml1c2hybihzaGlmdCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIGRpdjogcSB8fCBudWxsLFxuICAgICAgbW9kOiBhXG4gICAgfTtcbiAgfTtcblxuICAvLyBOT1RFOiAxKSBgbW9kZWAgY2FuIGJlIHNldCB0byBgbW9kYCB0byByZXF1ZXN0IG1vZCBvbmx5LFxuICAvLyAgICAgICB0byBgZGl2YCB0byByZXF1ZXN0IGRpdiBvbmx5LCBvciBiZSBhYnNlbnQgdG9cbiAgLy8gICAgICAgcmVxdWVzdCBib3RoIGRpdiAmIG1vZFxuICAvLyAgICAgICAyKSBgcG9zaXRpdmVgIGlzIHRydWUgaWYgdW5zaWduZWQgbW9kIGlzIHJlcXVlc3RlZFxuICBCTi5wcm90b3R5cGUuZGl2bW9kID0gZnVuY3Rpb24gZGl2bW9kIChudW0sIG1vZGUsIHBvc2l0aXZlKSB7XG4gICAgYXNzZXJ0KCFudW0uaXNaZXJvKCkpO1xuXG4gICAgaWYgKHRoaXMuaXNaZXJvKCkpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGRpdjogbmV3IEJOKDApLFxuICAgICAgICBtb2Q6IG5ldyBCTigwKVxuICAgICAgfTtcbiAgICB9XG5cbiAgICB2YXIgZGl2LCBtb2QsIHJlcztcbiAgICBpZiAodGhpcy5uZWdhdGl2ZSAhPT0gMCAmJiBudW0ubmVnYXRpdmUgPT09IDApIHtcbiAgICAgIHJlcyA9IHRoaXMubmVnKCkuZGl2bW9kKG51bSwgbW9kZSk7XG5cbiAgICAgIGlmIChtb2RlICE9PSAnbW9kJykge1xuICAgICAgICBkaXYgPSByZXMuZGl2Lm5lZygpO1xuICAgICAgfVxuXG4gICAgICBpZiAobW9kZSAhPT0gJ2RpdicpIHtcbiAgICAgICAgbW9kID0gcmVzLm1vZC5uZWcoKTtcbiAgICAgICAgaWYgKHBvc2l0aXZlICYmIG1vZC5uZWdhdGl2ZSAhPT0gMCkge1xuICAgICAgICAgIG1vZC5pYWRkKG51bSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgZGl2OiBkaXYsXG4gICAgICAgIG1vZDogbW9kXG4gICAgICB9O1xuICAgIH1cblxuICAgIGlmICh0aGlzLm5lZ2F0aXZlID09PSAwICYmIG51bS5uZWdhdGl2ZSAhPT0gMCkge1xuICAgICAgcmVzID0gdGhpcy5kaXZtb2QobnVtLm5lZygpLCBtb2RlKTtcblxuICAgICAgaWYgKG1vZGUgIT09ICdtb2QnKSB7XG4gICAgICAgIGRpdiA9IHJlcy5kaXYubmVnKCk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB7XG4gICAgICAgIGRpdjogZGl2LFxuICAgICAgICBtb2Q6IHJlcy5tb2RcbiAgICAgIH07XG4gICAgfVxuXG4gICAgaWYgKCh0aGlzLm5lZ2F0aXZlICYgbnVtLm5lZ2F0aXZlKSAhPT0gMCkge1xuICAgICAgcmVzID0gdGhpcy5uZWcoKS5kaXZtb2QobnVtLm5lZygpLCBtb2RlKTtcblxuICAgICAgaWYgKG1vZGUgIT09ICdkaXYnKSB7XG4gICAgICAgIG1vZCA9IHJlcy5tb2QubmVnKCk7XG4gICAgICAgIGlmIChwb3NpdGl2ZSAmJiBtb2QubmVnYXRpdmUgIT09IDApIHtcbiAgICAgICAgICBtb2QuaXN1YihudW0pO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB7XG4gICAgICAgIGRpdjogcmVzLmRpdixcbiAgICAgICAgbW9kOiBtb2RcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gQm90aCBudW1iZXJzIGFyZSBwb3NpdGl2ZSBhdCB0aGlzIHBvaW50XG5cbiAgICAvLyBTdHJpcCBib3RoIG51bWJlcnMgdG8gYXBwcm94aW1hdGUgc2hpZnQgdmFsdWVcbiAgICBpZiAobnVtLmxlbmd0aCA+IHRoaXMubGVuZ3RoIHx8IHRoaXMuY21wKG51bSkgPCAwKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBkaXY6IG5ldyBCTigwKSxcbiAgICAgICAgbW9kOiB0aGlzXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIFZlcnkgc2hvcnQgcmVkdWN0aW9uXG4gICAgaWYgKG51bS5sZW5ndGggPT09IDEpIHtcbiAgICAgIGlmIChtb2RlID09PSAnZGl2Jykge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGRpdjogdGhpcy5kaXZuKG51bS53b3Jkc1swXSksXG4gICAgICAgICAgbW9kOiBudWxsXG4gICAgICAgIH07XG4gICAgICB9XG5cbiAgICAgIGlmIChtb2RlID09PSAnbW9kJykge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGRpdjogbnVsbCxcbiAgICAgICAgICBtb2Q6IG5ldyBCTih0aGlzLm1vZG4obnVtLndvcmRzWzBdKSlcbiAgICAgICAgfTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgZGl2OiB0aGlzLmRpdm4obnVtLndvcmRzWzBdKSxcbiAgICAgICAgbW9kOiBuZXcgQk4odGhpcy5tb2RuKG51bS53b3Jkc1swXSkpXG4gICAgICB9O1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLl93b3JkRGl2KG51bSwgbW9kZSk7XG4gIH07XG5cbiAgLy8gRmluZCBgdGhpc2AgLyBgbnVtYFxuICBCTi5wcm90b3R5cGUuZGl2ID0gZnVuY3Rpb24gZGl2IChudW0pIHtcbiAgICByZXR1cm4gdGhpcy5kaXZtb2QobnVtLCAnZGl2JywgZmFsc2UpLmRpdjtcbiAgfTtcblxuICAvLyBGaW5kIGB0aGlzYCAlIGBudW1gXG4gIEJOLnByb3RvdHlwZS5tb2QgPSBmdW5jdGlvbiBtb2QgKG51bSkge1xuICAgIHJldHVybiB0aGlzLmRpdm1vZChudW0sICdtb2QnLCBmYWxzZSkubW9kO1xuICB9O1xuXG4gIEJOLnByb3RvdHlwZS51bW9kID0gZnVuY3Rpb24gdW1vZCAobnVtKSB7XG4gICAgcmV0dXJuIHRoaXMuZGl2bW9kKG51bSwgJ21vZCcsIHRydWUpLm1vZDtcbiAgfTtcblxuICAvLyBGaW5kIFJvdW5kKGB0aGlzYCAvIGBudW1gKVxuICBCTi5wcm90b3R5cGUuZGl2Um91bmQgPSBmdW5jdGlvbiBkaXZSb3VuZCAobnVtKSB7XG4gICAgdmFyIGRtID0gdGhpcy5kaXZtb2QobnVtKTtcblxuICAgIC8vIEZhc3QgY2FzZSAtIGV4YWN0IGRpdmlzaW9uXG4gICAgaWYgKGRtLm1vZC5pc1plcm8oKSkgcmV0dXJuIGRtLmRpdjtcblxuICAgIHZhciBtb2QgPSBkbS5kaXYubmVnYXRpdmUgIT09IDAgPyBkbS5tb2QuaXN1YihudW0pIDogZG0ubW9kO1xuXG4gICAgdmFyIGhhbGYgPSBudW0udXNocm4oMSk7XG4gICAgdmFyIHIyID0gbnVtLmFuZGxuKDEpO1xuICAgIHZhciBjbXAgPSBtb2QuY21wKGhhbGYpO1xuXG4gICAgLy8gUm91bmQgZG93blxuICAgIGlmIChjbXAgPCAwIHx8IHIyID09PSAxICYmIGNtcCA9PT0gMCkgcmV0dXJuIGRtLmRpdjtcblxuICAgIC8vIFJvdW5kIHVwXG4gICAgcmV0dXJuIGRtLmRpdi5uZWdhdGl2ZSAhPT0gMCA/IGRtLmRpdi5pc3VibigxKSA6IGRtLmRpdi5pYWRkbigxKTtcbiAgfTtcblxuICBCTi5wcm90b3R5cGUubW9kbiA9IGZ1bmN0aW9uIG1vZG4gKG51bSkge1xuICAgIGFzc2VydChudW0gPD0gMHgzZmZmZmZmKTtcbiAgICB2YXIgcCA9ICgxIDw8IDI2KSAlIG51bTtcblxuICAgIHZhciBhY2MgPSAwO1xuICAgIGZvciAodmFyIGkgPSB0aGlzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICBhY2MgPSAocCAqIGFjYyArICh0aGlzLndvcmRzW2ldIHwgMCkpICUgbnVtO1xuICAgIH1cblxuICAgIHJldHVybiBhY2M7XG4gIH07XG5cbiAgLy8gSW4tcGxhY2UgZGl2aXNpb24gYnkgbnVtYmVyXG4gIEJOLnByb3RvdHlwZS5pZGl2biA9IGZ1bmN0aW9uIGlkaXZuIChudW0pIHtcbiAgICBhc3NlcnQobnVtIDw9IDB4M2ZmZmZmZik7XG5cbiAgICB2YXIgY2FycnkgPSAwO1xuICAgIGZvciAodmFyIGkgPSB0aGlzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICB2YXIgdyA9ICh0aGlzLndvcmRzW2ldIHwgMCkgKyBjYXJyeSAqIDB4NDAwMDAwMDtcbiAgICAgIHRoaXMud29yZHNbaV0gPSAodyAvIG51bSkgfCAwO1xuICAgICAgY2FycnkgPSB3ICUgbnVtO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLnN0cmlwKCk7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLmRpdm4gPSBmdW5jdGlvbiBkaXZuIChudW0pIHtcbiAgICByZXR1cm4gdGhpcy5jbG9uZSgpLmlkaXZuKG51bSk7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLmVnY2QgPSBmdW5jdGlvbiBlZ2NkIChwKSB7XG4gICAgYXNzZXJ0KHAubmVnYXRpdmUgPT09IDApO1xuICAgIGFzc2VydCghcC5pc1plcm8oKSk7XG5cbiAgICB2YXIgeCA9IHRoaXM7XG4gICAgdmFyIHkgPSBwLmNsb25lKCk7XG5cbiAgICBpZiAoeC5uZWdhdGl2ZSAhPT0gMCkge1xuICAgICAgeCA9IHgudW1vZChwKTtcbiAgICB9IGVsc2Uge1xuICAgICAgeCA9IHguY2xvbmUoKTtcbiAgICB9XG5cbiAgICAvLyBBICogeCArIEIgKiB5ID0geFxuICAgIHZhciBBID0gbmV3IEJOKDEpO1xuICAgIHZhciBCID0gbmV3IEJOKDApO1xuXG4gICAgLy8gQyAqIHggKyBEICogeSA9IHlcbiAgICB2YXIgQyA9IG5ldyBCTigwKTtcbiAgICB2YXIgRCA9IG5ldyBCTigxKTtcblxuICAgIHZhciBnID0gMDtcblxuICAgIHdoaWxlICh4LmlzRXZlbigpICYmIHkuaXNFdmVuKCkpIHtcbiAgICAgIHguaXVzaHJuKDEpO1xuICAgICAgeS5pdXNocm4oMSk7XG4gICAgICArK2c7XG4gICAgfVxuXG4gICAgdmFyIHlwID0geS5jbG9uZSgpO1xuICAgIHZhciB4cCA9IHguY2xvbmUoKTtcblxuICAgIHdoaWxlICgheC5pc1plcm8oKSkge1xuICAgICAgZm9yICh2YXIgaSA9IDAsIGltID0gMTsgKHgud29yZHNbMF0gJiBpbSkgPT09IDAgJiYgaSA8IDI2OyArK2ksIGltIDw8PSAxKTtcbiAgICAgIGlmIChpID4gMCkge1xuICAgICAgICB4Lml1c2hybihpKTtcbiAgICAgICAgd2hpbGUgKGktLSA+IDApIHtcbiAgICAgICAgICBpZiAoQS5pc09kZCgpIHx8IEIuaXNPZGQoKSkge1xuICAgICAgICAgICAgQS5pYWRkKHlwKTtcbiAgICAgICAgICAgIEIuaXN1Yih4cCk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgQS5pdXNocm4oMSk7XG4gICAgICAgICAgQi5pdXNocm4oMSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgZm9yICh2YXIgaiA9IDAsIGptID0gMTsgKHkud29yZHNbMF0gJiBqbSkgPT09IDAgJiYgaiA8IDI2OyArK2osIGptIDw8PSAxKTtcbiAgICAgIGlmIChqID4gMCkge1xuICAgICAgICB5Lml1c2hybihqKTtcbiAgICAgICAgd2hpbGUgKGotLSA+IDApIHtcbiAgICAgICAgICBpZiAoQy5pc09kZCgpIHx8IEQuaXNPZGQoKSkge1xuICAgICAgICAgICAgQy5pYWRkKHlwKTtcbiAgICAgICAgICAgIEQuaXN1Yih4cCk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgQy5pdXNocm4oMSk7XG4gICAgICAgICAgRC5pdXNocm4oMSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKHguY21wKHkpID49IDApIHtcbiAgICAgICAgeC5pc3ViKHkpO1xuICAgICAgICBBLmlzdWIoQyk7XG4gICAgICAgIEIuaXN1YihEKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHkuaXN1Yih4KTtcbiAgICAgICAgQy5pc3ViKEEpO1xuICAgICAgICBELmlzdWIoQik7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIGE6IEMsXG4gICAgICBiOiBELFxuICAgICAgZ2NkOiB5Lml1c2hsbihnKVxuICAgIH07XG4gIH07XG5cbiAgLy8gVGhpcyBpcyByZWR1Y2VkIGluY2FybmF0aW9uIG9mIHRoZSBiaW5hcnkgRUVBXG4gIC8vIGFib3ZlLCBkZXNpZ25hdGVkIHRvIGludmVydCBtZW1iZXJzIG9mIHRoZVxuICAvLyBfcHJpbWVfIGZpZWxkcyBGKHApIGF0IGEgbWF4aW1hbCBzcGVlZFxuICBCTi5wcm90b3R5cGUuX2ludm1wID0gZnVuY3Rpb24gX2ludm1wIChwKSB7XG4gICAgYXNzZXJ0KHAubmVnYXRpdmUgPT09IDApO1xuICAgIGFzc2VydCghcC5pc1plcm8oKSk7XG5cbiAgICB2YXIgYSA9IHRoaXM7XG4gICAgdmFyIGIgPSBwLmNsb25lKCk7XG5cbiAgICBpZiAoYS5uZWdhdGl2ZSAhPT0gMCkge1xuICAgICAgYSA9IGEudW1vZChwKTtcbiAgICB9IGVsc2Uge1xuICAgICAgYSA9IGEuY2xvbmUoKTtcbiAgICB9XG5cbiAgICB2YXIgeDEgPSBuZXcgQk4oMSk7XG4gICAgdmFyIHgyID0gbmV3IEJOKDApO1xuXG4gICAgdmFyIGRlbHRhID0gYi5jbG9uZSgpO1xuXG4gICAgd2hpbGUgKGEuY21wbigxKSA+IDAgJiYgYi5jbXBuKDEpID4gMCkge1xuICAgICAgZm9yICh2YXIgaSA9IDAsIGltID0gMTsgKGEud29yZHNbMF0gJiBpbSkgPT09IDAgJiYgaSA8IDI2OyArK2ksIGltIDw8PSAxKTtcbiAgICAgIGlmIChpID4gMCkge1xuICAgICAgICBhLml1c2hybihpKTtcbiAgICAgICAgd2hpbGUgKGktLSA+IDApIHtcbiAgICAgICAgICBpZiAoeDEuaXNPZGQoKSkge1xuICAgICAgICAgICAgeDEuaWFkZChkZWx0YSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgeDEuaXVzaHJuKDEpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGZvciAodmFyIGogPSAwLCBqbSA9IDE7IChiLndvcmRzWzBdICYgam0pID09PSAwICYmIGogPCAyNjsgKytqLCBqbSA8PD0gMSk7XG4gICAgICBpZiAoaiA+IDApIHtcbiAgICAgICAgYi5pdXNocm4oaik7XG4gICAgICAgIHdoaWxlIChqLS0gPiAwKSB7XG4gICAgICAgICAgaWYgKHgyLmlzT2RkKCkpIHtcbiAgICAgICAgICAgIHgyLmlhZGQoZGVsdGEpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHgyLml1c2hybigxKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAoYS5jbXAoYikgPj0gMCkge1xuICAgICAgICBhLmlzdWIoYik7XG4gICAgICAgIHgxLmlzdWIoeDIpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYi5pc3ViKGEpO1xuICAgICAgICB4Mi5pc3ViKHgxKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgcmVzO1xuICAgIGlmIChhLmNtcG4oMSkgPT09IDApIHtcbiAgICAgIHJlcyA9IHgxO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXMgPSB4MjtcbiAgICB9XG5cbiAgICBpZiAocmVzLmNtcG4oMCkgPCAwKSB7XG4gICAgICByZXMuaWFkZChwKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVzO1xuICB9O1xuXG4gIEJOLnByb3RvdHlwZS5nY2QgPSBmdW5jdGlvbiBnY2QgKG51bSkge1xuICAgIGlmICh0aGlzLmlzWmVybygpKSByZXR1cm4gbnVtLmFicygpO1xuICAgIGlmIChudW0uaXNaZXJvKCkpIHJldHVybiB0aGlzLmFicygpO1xuXG4gICAgdmFyIGEgPSB0aGlzLmNsb25lKCk7XG4gICAgdmFyIGIgPSBudW0uY2xvbmUoKTtcbiAgICBhLm5lZ2F0aXZlID0gMDtcbiAgICBiLm5lZ2F0aXZlID0gMDtcblxuICAgIC8vIFJlbW92ZSBjb21tb24gZmFjdG9yIG9mIHR3b1xuICAgIGZvciAodmFyIHNoaWZ0ID0gMDsgYS5pc0V2ZW4oKSAmJiBiLmlzRXZlbigpOyBzaGlmdCsrKSB7XG4gICAgICBhLml1c2hybigxKTtcbiAgICAgIGIuaXVzaHJuKDEpO1xuICAgIH1cblxuICAgIGRvIHtcbiAgICAgIHdoaWxlIChhLmlzRXZlbigpKSB7XG4gICAgICAgIGEuaXVzaHJuKDEpO1xuICAgICAgfVxuICAgICAgd2hpbGUgKGIuaXNFdmVuKCkpIHtcbiAgICAgICAgYi5pdXNocm4oMSk7XG4gICAgICB9XG5cbiAgICAgIHZhciByID0gYS5jbXAoYik7XG4gICAgICBpZiAociA8IDApIHtcbiAgICAgICAgLy8gU3dhcCBgYWAgYW5kIGBiYCB0byBtYWtlIGBhYCBhbHdheXMgYmlnZ2VyIHRoYW4gYGJgXG4gICAgICAgIHZhciB0ID0gYTtcbiAgICAgICAgYSA9IGI7XG4gICAgICAgIGIgPSB0O1xuICAgICAgfSBlbHNlIGlmIChyID09PSAwIHx8IGIuY21wbigxKSA9PT0gMCkge1xuICAgICAgICBicmVhaztcbiAgICAgIH1cblxuICAgICAgYS5pc3ViKGIpO1xuICAgIH0gd2hpbGUgKHRydWUpO1xuXG4gICAgcmV0dXJuIGIuaXVzaGxuKHNoaWZ0KTtcbiAgfTtcblxuICAvLyBJbnZlcnQgbnVtYmVyIGluIHRoZSBmaWVsZCBGKG51bSlcbiAgQk4ucHJvdG90eXBlLmludm0gPSBmdW5jdGlvbiBpbnZtIChudW0pIHtcbiAgICByZXR1cm4gdGhpcy5lZ2NkKG51bSkuYS51bW9kKG51bSk7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLmlzRXZlbiA9IGZ1bmN0aW9uIGlzRXZlbiAoKSB7XG4gICAgcmV0dXJuICh0aGlzLndvcmRzWzBdICYgMSkgPT09IDA7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLmlzT2RkID0gZnVuY3Rpb24gaXNPZGQgKCkge1xuICAgIHJldHVybiAodGhpcy53b3Jkc1swXSAmIDEpID09PSAxO1xuICB9O1xuXG4gIC8vIEFuZCBmaXJzdCB3b3JkIGFuZCBudW1cbiAgQk4ucHJvdG90eXBlLmFuZGxuID0gZnVuY3Rpb24gYW5kbG4gKG51bSkge1xuICAgIHJldHVybiB0aGlzLndvcmRzWzBdICYgbnVtO1xuICB9O1xuXG4gIC8vIEluY3JlbWVudCBhdCB0aGUgYml0IHBvc2l0aW9uIGluLWxpbmVcbiAgQk4ucHJvdG90eXBlLmJpbmNuID0gZnVuY3Rpb24gYmluY24gKGJpdCkge1xuICAgIGFzc2VydCh0eXBlb2YgYml0ID09PSAnbnVtYmVyJyk7XG4gICAgdmFyIHIgPSBiaXQgJSAyNjtcbiAgICB2YXIgcyA9IChiaXQgLSByKSAvIDI2O1xuICAgIHZhciBxID0gMSA8PCByO1xuXG4gICAgLy8gRmFzdCBjYXNlOiBiaXQgaXMgbXVjaCBoaWdoZXIgdGhhbiBhbGwgZXhpc3Rpbmcgd29yZHNcbiAgICBpZiAodGhpcy5sZW5ndGggPD0gcykge1xuICAgICAgdGhpcy5fZXhwYW5kKHMgKyAxKTtcbiAgICAgIHRoaXMud29yZHNbc10gfD0gcTtcbiAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8vIEFkZCBiaXQgYW5kIHByb3BhZ2F0ZSwgaWYgbmVlZGVkXG4gICAgdmFyIGNhcnJ5ID0gcTtcbiAgICBmb3IgKHZhciBpID0gczsgY2FycnkgIT09IDAgJiYgaSA8IHRoaXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciB3ID0gdGhpcy53b3Jkc1tpXSB8IDA7XG4gICAgICB3ICs9IGNhcnJ5O1xuICAgICAgY2FycnkgPSB3ID4+PiAyNjtcbiAgICAgIHcgJj0gMHgzZmZmZmZmO1xuICAgICAgdGhpcy53b3Jkc1tpXSA9IHc7XG4gICAgfVxuICAgIGlmIChjYXJyeSAhPT0gMCkge1xuICAgICAgdGhpcy53b3Jkc1tpXSA9IGNhcnJ5O1xuICAgICAgdGhpcy5sZW5ndGgrKztcbiAgICB9XG4gICAgcmV0dXJuIHRoaXM7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLmlzWmVybyA9IGZ1bmN0aW9uIGlzWmVybyAoKSB7XG4gICAgcmV0dXJuIHRoaXMubGVuZ3RoID09PSAxICYmIHRoaXMud29yZHNbMF0gPT09IDA7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLmNtcG4gPSBmdW5jdGlvbiBjbXBuIChudW0pIHtcbiAgICB2YXIgbmVnYXRpdmUgPSBudW0gPCAwO1xuXG4gICAgaWYgKHRoaXMubmVnYXRpdmUgIT09IDAgJiYgIW5lZ2F0aXZlKSByZXR1cm4gLTE7XG4gICAgaWYgKHRoaXMubmVnYXRpdmUgPT09IDAgJiYgbmVnYXRpdmUpIHJldHVybiAxO1xuXG4gICAgdGhpcy5zdHJpcCgpO1xuXG4gICAgdmFyIHJlcztcbiAgICBpZiAodGhpcy5sZW5ndGggPiAxKSB7XG4gICAgICByZXMgPSAxO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAobmVnYXRpdmUpIHtcbiAgICAgICAgbnVtID0gLW51bTtcbiAgICAgIH1cblxuICAgICAgYXNzZXJ0KG51bSA8PSAweDNmZmZmZmYsICdOdW1iZXIgaXMgdG9vIGJpZycpO1xuXG4gICAgICB2YXIgdyA9IHRoaXMud29yZHNbMF0gfCAwO1xuICAgICAgcmVzID0gdyA9PT0gbnVtID8gMCA6IHcgPCBudW0gPyAtMSA6IDE7XG4gICAgfVxuICAgIGlmICh0aGlzLm5lZ2F0aXZlICE9PSAwKSByZXR1cm4gLXJlcyB8IDA7XG4gICAgcmV0dXJuIHJlcztcbiAgfTtcblxuICAvLyBDb21wYXJlIHR3byBudW1iZXJzIGFuZCByZXR1cm46XG4gIC8vIDEgLSBpZiBgdGhpc2AgPiBgbnVtYFxuICAvLyAwIC0gaWYgYHRoaXNgID09IGBudW1gXG4gIC8vIC0xIC0gaWYgYHRoaXNgIDwgYG51bWBcbiAgQk4ucHJvdG90eXBlLmNtcCA9IGZ1bmN0aW9uIGNtcCAobnVtKSB7XG4gICAgaWYgKHRoaXMubmVnYXRpdmUgIT09IDAgJiYgbnVtLm5lZ2F0aXZlID09PSAwKSByZXR1cm4gLTE7XG4gICAgaWYgKHRoaXMubmVnYXRpdmUgPT09IDAgJiYgbnVtLm5lZ2F0aXZlICE9PSAwKSByZXR1cm4gMTtcblxuICAgIHZhciByZXMgPSB0aGlzLnVjbXAobnVtKTtcbiAgICBpZiAodGhpcy5uZWdhdGl2ZSAhPT0gMCkgcmV0dXJuIC1yZXMgfCAwO1xuICAgIHJldHVybiByZXM7XG4gIH07XG5cbiAgLy8gVW5zaWduZWQgY29tcGFyaXNvblxuICBCTi5wcm90b3R5cGUudWNtcCA9IGZ1bmN0aW9uIHVjbXAgKG51bSkge1xuICAgIC8vIEF0IHRoaXMgcG9pbnQgYm90aCBudW1iZXJzIGhhdmUgdGhlIHNhbWUgc2lnblxuICAgIGlmICh0aGlzLmxlbmd0aCA+IG51bS5sZW5ndGgpIHJldHVybiAxO1xuICAgIGlmICh0aGlzLmxlbmd0aCA8IG51bS5sZW5ndGgpIHJldHVybiAtMTtcblxuICAgIHZhciByZXMgPSAwO1xuICAgIGZvciAodmFyIGkgPSB0aGlzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICB2YXIgYSA9IHRoaXMud29yZHNbaV0gfCAwO1xuICAgICAgdmFyIGIgPSBudW0ud29yZHNbaV0gfCAwO1xuXG4gICAgICBpZiAoYSA9PT0gYikgY29udGludWU7XG4gICAgICBpZiAoYSA8IGIpIHtcbiAgICAgICAgcmVzID0gLTE7XG4gICAgICB9IGVsc2UgaWYgKGEgPiBiKSB7XG4gICAgICAgIHJlcyA9IDE7XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICB9XG4gICAgcmV0dXJuIHJlcztcbiAgfTtcblxuICBCTi5wcm90b3R5cGUuZ3RuID0gZnVuY3Rpb24gZ3RuIChudW0pIHtcbiAgICByZXR1cm4gdGhpcy5jbXBuKG51bSkgPT09IDE7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLmd0ID0gZnVuY3Rpb24gZ3QgKG51bSkge1xuICAgIHJldHVybiB0aGlzLmNtcChudW0pID09PSAxO1xuICB9O1xuXG4gIEJOLnByb3RvdHlwZS5ndGVuID0gZnVuY3Rpb24gZ3RlbiAobnVtKSB7XG4gICAgcmV0dXJuIHRoaXMuY21wbihudW0pID49IDA7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLmd0ZSA9IGZ1bmN0aW9uIGd0ZSAobnVtKSB7XG4gICAgcmV0dXJuIHRoaXMuY21wKG51bSkgPj0gMDtcbiAgfTtcblxuICBCTi5wcm90b3R5cGUubHRuID0gZnVuY3Rpb24gbHRuIChudW0pIHtcbiAgICByZXR1cm4gdGhpcy5jbXBuKG51bSkgPT09IC0xO1xuICB9O1xuXG4gIEJOLnByb3RvdHlwZS5sdCA9IGZ1bmN0aW9uIGx0IChudW0pIHtcbiAgICByZXR1cm4gdGhpcy5jbXAobnVtKSA9PT0gLTE7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLmx0ZW4gPSBmdW5jdGlvbiBsdGVuIChudW0pIHtcbiAgICByZXR1cm4gdGhpcy5jbXBuKG51bSkgPD0gMDtcbiAgfTtcblxuICBCTi5wcm90b3R5cGUubHRlID0gZnVuY3Rpb24gbHRlIChudW0pIHtcbiAgICByZXR1cm4gdGhpcy5jbXAobnVtKSA8PSAwO1xuICB9O1xuXG4gIEJOLnByb3RvdHlwZS5lcW4gPSBmdW5jdGlvbiBlcW4gKG51bSkge1xuICAgIHJldHVybiB0aGlzLmNtcG4obnVtKSA9PT0gMDtcbiAgfTtcblxuICBCTi5wcm90b3R5cGUuZXEgPSBmdW5jdGlvbiBlcSAobnVtKSB7XG4gICAgcmV0dXJuIHRoaXMuY21wKG51bSkgPT09IDA7XG4gIH07XG5cbiAgLy9cbiAgLy8gQSByZWR1Y2UgY29udGV4dCwgY291bGQgYmUgdXNpbmcgbW9udGdvbWVyeSBvciBzb21ldGhpbmcgYmV0dGVyLCBkZXBlbmRpbmdcbiAgLy8gb24gdGhlIGBtYCBpdHNlbGYuXG4gIC8vXG4gIEJOLnJlZCA9IGZ1bmN0aW9uIHJlZCAobnVtKSB7XG4gICAgcmV0dXJuIG5ldyBSZWQobnVtKTtcbiAgfTtcblxuICBCTi5wcm90b3R5cGUudG9SZWQgPSBmdW5jdGlvbiB0b1JlZCAoY3R4KSB7XG4gICAgYXNzZXJ0KCF0aGlzLnJlZCwgJ0FscmVhZHkgYSBudW1iZXIgaW4gcmVkdWN0aW9uIGNvbnRleHQnKTtcbiAgICBhc3NlcnQodGhpcy5uZWdhdGl2ZSA9PT0gMCwgJ3JlZCB3b3JrcyBvbmx5IHdpdGggcG9zaXRpdmVzJyk7XG4gICAgcmV0dXJuIGN0eC5jb252ZXJ0VG8odGhpcykuX2ZvcmNlUmVkKGN0eCk7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLmZyb21SZWQgPSBmdW5jdGlvbiBmcm9tUmVkICgpIHtcbiAgICBhc3NlcnQodGhpcy5yZWQsICdmcm9tUmVkIHdvcmtzIG9ubHkgd2l0aCBudW1iZXJzIGluIHJlZHVjdGlvbiBjb250ZXh0Jyk7XG4gICAgcmV0dXJuIHRoaXMucmVkLmNvbnZlcnRGcm9tKHRoaXMpO1xuICB9O1xuXG4gIEJOLnByb3RvdHlwZS5fZm9yY2VSZWQgPSBmdW5jdGlvbiBfZm9yY2VSZWQgKGN0eCkge1xuICAgIHRoaXMucmVkID0gY3R4O1xuICAgIHJldHVybiB0aGlzO1xuICB9O1xuXG4gIEJOLnByb3RvdHlwZS5mb3JjZVJlZCA9IGZ1bmN0aW9uIGZvcmNlUmVkIChjdHgpIHtcbiAgICBhc3NlcnQoIXRoaXMucmVkLCAnQWxyZWFkeSBhIG51bWJlciBpbiByZWR1Y3Rpb24gY29udGV4dCcpO1xuICAgIHJldHVybiB0aGlzLl9mb3JjZVJlZChjdHgpO1xuICB9O1xuXG4gIEJOLnByb3RvdHlwZS5yZWRBZGQgPSBmdW5jdGlvbiByZWRBZGQgKG51bSkge1xuICAgIGFzc2VydCh0aGlzLnJlZCwgJ3JlZEFkZCB3b3JrcyBvbmx5IHdpdGggcmVkIG51bWJlcnMnKTtcbiAgICByZXR1cm4gdGhpcy5yZWQuYWRkKHRoaXMsIG51bSk7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLnJlZElBZGQgPSBmdW5jdGlvbiByZWRJQWRkIChudW0pIHtcbiAgICBhc3NlcnQodGhpcy5yZWQsICdyZWRJQWRkIHdvcmtzIG9ubHkgd2l0aCByZWQgbnVtYmVycycpO1xuICAgIHJldHVybiB0aGlzLnJlZC5pYWRkKHRoaXMsIG51bSk7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLnJlZFN1YiA9IGZ1bmN0aW9uIHJlZFN1YiAobnVtKSB7XG4gICAgYXNzZXJ0KHRoaXMucmVkLCAncmVkU3ViIHdvcmtzIG9ubHkgd2l0aCByZWQgbnVtYmVycycpO1xuICAgIHJldHVybiB0aGlzLnJlZC5zdWIodGhpcywgbnVtKTtcbiAgfTtcblxuICBCTi5wcm90b3R5cGUucmVkSVN1YiA9IGZ1bmN0aW9uIHJlZElTdWIgKG51bSkge1xuICAgIGFzc2VydCh0aGlzLnJlZCwgJ3JlZElTdWIgd29ya3Mgb25seSB3aXRoIHJlZCBudW1iZXJzJyk7XG4gICAgcmV0dXJuIHRoaXMucmVkLmlzdWIodGhpcywgbnVtKTtcbiAgfTtcblxuICBCTi5wcm90b3R5cGUucmVkU2hsID0gZnVuY3Rpb24gcmVkU2hsIChudW0pIHtcbiAgICBhc3NlcnQodGhpcy5yZWQsICdyZWRTaGwgd29ya3Mgb25seSB3aXRoIHJlZCBudW1iZXJzJyk7XG4gICAgcmV0dXJuIHRoaXMucmVkLnNobCh0aGlzLCBudW0pO1xuICB9O1xuXG4gIEJOLnByb3RvdHlwZS5yZWRNdWwgPSBmdW5jdGlvbiByZWRNdWwgKG51bSkge1xuICAgIGFzc2VydCh0aGlzLnJlZCwgJ3JlZE11bCB3b3JrcyBvbmx5IHdpdGggcmVkIG51bWJlcnMnKTtcbiAgICB0aGlzLnJlZC5fdmVyaWZ5Mih0aGlzLCBudW0pO1xuICAgIHJldHVybiB0aGlzLnJlZC5tdWwodGhpcywgbnVtKTtcbiAgfTtcblxuICBCTi5wcm90b3R5cGUucmVkSU11bCA9IGZ1bmN0aW9uIHJlZElNdWwgKG51bSkge1xuICAgIGFzc2VydCh0aGlzLnJlZCwgJ3JlZE11bCB3b3JrcyBvbmx5IHdpdGggcmVkIG51bWJlcnMnKTtcbiAgICB0aGlzLnJlZC5fdmVyaWZ5Mih0aGlzLCBudW0pO1xuICAgIHJldHVybiB0aGlzLnJlZC5pbXVsKHRoaXMsIG51bSk7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLnJlZFNxciA9IGZ1bmN0aW9uIHJlZFNxciAoKSB7XG4gICAgYXNzZXJ0KHRoaXMucmVkLCAncmVkU3FyIHdvcmtzIG9ubHkgd2l0aCByZWQgbnVtYmVycycpO1xuICAgIHRoaXMucmVkLl92ZXJpZnkxKHRoaXMpO1xuICAgIHJldHVybiB0aGlzLnJlZC5zcXIodGhpcyk7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLnJlZElTcXIgPSBmdW5jdGlvbiByZWRJU3FyICgpIHtcbiAgICBhc3NlcnQodGhpcy5yZWQsICdyZWRJU3FyIHdvcmtzIG9ubHkgd2l0aCByZWQgbnVtYmVycycpO1xuICAgIHRoaXMucmVkLl92ZXJpZnkxKHRoaXMpO1xuICAgIHJldHVybiB0aGlzLnJlZC5pc3FyKHRoaXMpO1xuICB9O1xuXG4gIC8vIFNxdWFyZSByb290IG92ZXIgcFxuICBCTi5wcm90b3R5cGUucmVkU3FydCA9IGZ1bmN0aW9uIHJlZFNxcnQgKCkge1xuICAgIGFzc2VydCh0aGlzLnJlZCwgJ3JlZFNxcnQgd29ya3Mgb25seSB3aXRoIHJlZCBudW1iZXJzJyk7XG4gICAgdGhpcy5yZWQuX3ZlcmlmeTEodGhpcyk7XG4gICAgcmV0dXJuIHRoaXMucmVkLnNxcnQodGhpcyk7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLnJlZEludm0gPSBmdW5jdGlvbiByZWRJbnZtICgpIHtcbiAgICBhc3NlcnQodGhpcy5yZWQsICdyZWRJbnZtIHdvcmtzIG9ubHkgd2l0aCByZWQgbnVtYmVycycpO1xuICAgIHRoaXMucmVkLl92ZXJpZnkxKHRoaXMpO1xuICAgIHJldHVybiB0aGlzLnJlZC5pbnZtKHRoaXMpO1xuICB9O1xuXG4gIC8vIFJldHVybiBuZWdhdGl2ZSBjbG9uZSBvZiBgdGhpc2AgJSBgcmVkIG1vZHVsb2BcbiAgQk4ucHJvdG90eXBlLnJlZE5lZyA9IGZ1bmN0aW9uIHJlZE5lZyAoKSB7XG4gICAgYXNzZXJ0KHRoaXMucmVkLCAncmVkTmVnIHdvcmtzIG9ubHkgd2l0aCByZWQgbnVtYmVycycpO1xuICAgIHRoaXMucmVkLl92ZXJpZnkxKHRoaXMpO1xuICAgIHJldHVybiB0aGlzLnJlZC5uZWcodGhpcyk7XG4gIH07XG5cbiAgQk4ucHJvdG90eXBlLnJlZFBvdyA9IGZ1bmN0aW9uIHJlZFBvdyAobnVtKSB7XG4gICAgYXNzZXJ0KHRoaXMucmVkICYmICFudW0ucmVkLCAncmVkUG93KG5vcm1hbE51bSknKTtcbiAgICB0aGlzLnJlZC5fdmVyaWZ5MSh0aGlzKTtcbiAgICByZXR1cm4gdGhpcy5yZWQucG93KHRoaXMsIG51bSk7XG4gIH07XG5cbiAgLy8gUHJpbWUgbnVtYmVycyB3aXRoIGVmZmljaWVudCByZWR1Y3Rpb25cbiAgdmFyIHByaW1lcyA9IHtcbiAgICBrMjU2OiBudWxsLFxuICAgIHAyMjQ6IG51bGwsXG4gICAgcDE5MjogbnVsbCxcbiAgICBwMjU1MTk6IG51bGxcbiAgfTtcblxuICAvLyBQc2V1ZG8tTWVyc2VubmUgcHJpbWVcbiAgZnVuY3Rpb24gTVByaW1lIChuYW1lLCBwKSB7XG4gICAgLy8gUCA9IDIgXiBOIC0gS1xuICAgIHRoaXMubmFtZSA9IG5hbWU7XG4gICAgdGhpcy5wID0gbmV3IEJOKHAsIDE2KTtcbiAgICB0aGlzLm4gPSB0aGlzLnAuYml0TGVuZ3RoKCk7XG4gICAgdGhpcy5rID0gbmV3IEJOKDEpLml1c2hsbih0aGlzLm4pLmlzdWIodGhpcy5wKTtcblxuICAgIHRoaXMudG1wID0gdGhpcy5fdG1wKCk7XG4gIH1cblxuICBNUHJpbWUucHJvdG90eXBlLl90bXAgPSBmdW5jdGlvbiBfdG1wICgpIHtcbiAgICB2YXIgdG1wID0gbmV3IEJOKG51bGwpO1xuICAgIHRtcC53b3JkcyA9IG5ldyBBcnJheShNYXRoLmNlaWwodGhpcy5uIC8gMTMpKTtcbiAgICByZXR1cm4gdG1wO1xuICB9O1xuXG4gIE1QcmltZS5wcm90b3R5cGUuaXJlZHVjZSA9IGZ1bmN0aW9uIGlyZWR1Y2UgKG51bSkge1xuICAgIC8vIEFzc3VtZXMgdGhhdCBgbnVtYCBpcyBsZXNzIHRoYW4gYFBeMmBcbiAgICAvLyBudW0gPSBISSAqICgyIF4gTiAtIEspICsgSEkgKiBLICsgTE8gPSBISSAqIEsgKyBMTyAobW9kIFApXG4gICAgdmFyIHIgPSBudW07XG4gICAgdmFyIHJsZW47XG5cbiAgICBkbyB7XG4gICAgICB0aGlzLnNwbGl0KHIsIHRoaXMudG1wKTtcbiAgICAgIHIgPSB0aGlzLmltdWxLKHIpO1xuICAgICAgciA9IHIuaWFkZCh0aGlzLnRtcCk7XG4gICAgICBybGVuID0gci5iaXRMZW5ndGgoKTtcbiAgICB9IHdoaWxlIChybGVuID4gdGhpcy5uKTtcblxuICAgIHZhciBjbXAgPSBybGVuIDwgdGhpcy5uID8gLTEgOiByLnVjbXAodGhpcy5wKTtcbiAgICBpZiAoY21wID09PSAwKSB7XG4gICAgICByLndvcmRzWzBdID0gMDtcbiAgICAgIHIubGVuZ3RoID0gMTtcbiAgICB9IGVsc2UgaWYgKGNtcCA+IDApIHtcbiAgICAgIHIuaXN1Yih0aGlzLnApO1xuICAgIH0gZWxzZSB7XG4gICAgICByLnN0cmlwKCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHI7XG4gIH07XG5cbiAgTVByaW1lLnByb3RvdHlwZS5zcGxpdCA9IGZ1bmN0aW9uIHNwbGl0IChpbnB1dCwgb3V0KSB7XG4gICAgaW5wdXQuaXVzaHJuKHRoaXMubiwgMCwgb3V0KTtcbiAgfTtcblxuICBNUHJpbWUucHJvdG90eXBlLmltdWxLID0gZnVuY3Rpb24gaW11bEsgKG51bSkge1xuICAgIHJldHVybiBudW0uaW11bCh0aGlzLmspO1xuICB9O1xuXG4gIGZ1bmN0aW9uIEsyNTYgKCkge1xuICAgIE1QcmltZS5jYWxsKFxuICAgICAgdGhpcyxcbiAgICAgICdrMjU2JyxcbiAgICAgICdmZmZmZmZmZiBmZmZmZmZmZiBmZmZmZmZmZiBmZmZmZmZmZiBmZmZmZmZmZiBmZmZmZmZmZiBmZmZmZmZmZSBmZmZmZmMyZicpO1xuICB9XG4gIGluaGVyaXRzKEsyNTYsIE1QcmltZSk7XG5cbiAgSzI1Ni5wcm90b3R5cGUuc3BsaXQgPSBmdW5jdGlvbiBzcGxpdCAoaW5wdXQsIG91dHB1dCkge1xuICAgIC8vIDI1NiA9IDkgKiAyNiArIDIyXG4gICAgdmFyIG1hc2sgPSAweDNmZmZmZjtcblxuICAgIHZhciBvdXRMZW4gPSBNYXRoLm1pbihpbnB1dC5sZW5ndGgsIDkpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgb3V0TGVuOyBpKyspIHtcbiAgICAgIG91dHB1dC53b3Jkc1tpXSA9IGlucHV0LndvcmRzW2ldO1xuICAgIH1cbiAgICBvdXRwdXQubGVuZ3RoID0gb3V0TGVuO1xuXG4gICAgaWYgKGlucHV0Lmxlbmd0aCA8PSA5KSB7XG4gICAgICBpbnB1dC53b3Jkc1swXSA9IDA7XG4gICAgICBpbnB1dC5sZW5ndGggPSAxO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFNoaWZ0IGJ5IDkgbGltYnNcbiAgICB2YXIgcHJldiA9IGlucHV0LndvcmRzWzldO1xuICAgIG91dHB1dC53b3Jkc1tvdXRwdXQubGVuZ3RoKytdID0gcHJldiAmIG1hc2s7XG5cbiAgICBmb3IgKGkgPSAxMDsgaSA8IGlucHV0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgbmV4dCA9IGlucHV0LndvcmRzW2ldIHwgMDtcbiAgICAgIGlucHV0LndvcmRzW2kgLSAxMF0gPSAoKG5leHQgJiBtYXNrKSA8PCA0KSB8IChwcmV2ID4+PiAyMik7XG4gICAgICBwcmV2ID0gbmV4dDtcbiAgICB9XG4gICAgcHJldiA+Pj49IDIyO1xuICAgIGlucHV0LndvcmRzW2kgLSAxMF0gPSBwcmV2O1xuICAgIGlmIChwcmV2ID09PSAwICYmIGlucHV0Lmxlbmd0aCA+IDEwKSB7XG4gICAgICBpbnB1dC5sZW5ndGggLT0gMTA7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlucHV0Lmxlbmd0aCAtPSA5O1xuICAgIH1cbiAgfTtcblxuICBLMjU2LnByb3RvdHlwZS5pbXVsSyA9IGZ1bmN0aW9uIGltdWxLIChudW0pIHtcbiAgICAvLyBLID0gMHgxMDAwMDAzZDEgPSBbIDB4NDAsIDB4M2QxIF1cbiAgICBudW0ud29yZHNbbnVtLmxlbmd0aF0gPSAwO1xuICAgIG51bS53b3Jkc1tudW0ubGVuZ3RoICsgMV0gPSAwO1xuICAgIG51bS5sZW5ndGggKz0gMjtcblxuICAgIC8vIGJvdW5kZWQgYXQ6IDB4NDAgKiAweDNmZmZmZmYgKyAweDNkMCA9IDB4MTAwMDAwMzkwXG4gICAgdmFyIGxvID0gMDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG51bS5sZW5ndGg7IGkrKykge1xuICAgICAgdmFyIHcgPSBudW0ud29yZHNbaV0gfCAwO1xuICAgICAgbG8gKz0gdyAqIDB4M2QxO1xuICAgICAgbnVtLndvcmRzW2ldID0gbG8gJiAweDNmZmZmZmY7XG4gICAgICBsbyA9IHcgKiAweDQwICsgKChsbyAvIDB4NDAwMDAwMCkgfCAwKTtcbiAgICB9XG5cbiAgICAvLyBGYXN0IGxlbmd0aCByZWR1Y3Rpb25cbiAgICBpZiAobnVtLndvcmRzW251bS5sZW5ndGggLSAxXSA9PT0gMCkge1xuICAgICAgbnVtLmxlbmd0aC0tO1xuICAgICAgaWYgKG51bS53b3Jkc1tudW0ubGVuZ3RoIC0gMV0gPT09IDApIHtcbiAgICAgICAgbnVtLmxlbmd0aC0tO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gbnVtO1xuICB9O1xuXG4gIGZ1bmN0aW9uIFAyMjQgKCkge1xuICAgIE1QcmltZS5jYWxsKFxuICAgICAgdGhpcyxcbiAgICAgICdwMjI0JyxcbiAgICAgICdmZmZmZmZmZiBmZmZmZmZmZiBmZmZmZmZmZiBmZmZmZmZmZiAwMDAwMDAwMCAwMDAwMDAwMCAwMDAwMDAwMScpO1xuICB9XG4gIGluaGVyaXRzKFAyMjQsIE1QcmltZSk7XG5cbiAgZnVuY3Rpb24gUDE5MiAoKSB7XG4gICAgTVByaW1lLmNhbGwoXG4gICAgICB0aGlzLFxuICAgICAgJ3AxOTInLFxuICAgICAgJ2ZmZmZmZmZmIGZmZmZmZmZmIGZmZmZmZmZmIGZmZmZmZmZlIGZmZmZmZmZmIGZmZmZmZmZmJyk7XG4gIH1cbiAgaW5oZXJpdHMoUDE5MiwgTVByaW1lKTtcblxuICBmdW5jdGlvbiBQMjU1MTkgKCkge1xuICAgIC8vIDIgXiAyNTUgLSAxOVxuICAgIE1QcmltZS5jYWxsKFxuICAgICAgdGhpcyxcbiAgICAgICcyNTUxOScsXG4gICAgICAnN2ZmZmZmZmZmZmZmZmZmZiBmZmZmZmZmZmZmZmZmZmZmIGZmZmZmZmZmZmZmZmZmZmYgZmZmZmZmZmZmZmZmZmZlZCcpO1xuICB9XG4gIGluaGVyaXRzKFAyNTUxOSwgTVByaW1lKTtcblxuICBQMjU1MTkucHJvdG90eXBlLmltdWxLID0gZnVuY3Rpb24gaW11bEsgKG51bSkge1xuICAgIC8vIEsgPSAweDEzXG4gICAgdmFyIGNhcnJ5ID0gMDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG51bS5sZW5ndGg7IGkrKykge1xuICAgICAgdmFyIGhpID0gKG51bS53b3Jkc1tpXSB8IDApICogMHgxMyArIGNhcnJ5O1xuICAgICAgdmFyIGxvID0gaGkgJiAweDNmZmZmZmY7XG4gICAgICBoaSA+Pj49IDI2O1xuXG4gICAgICBudW0ud29yZHNbaV0gPSBsbztcbiAgICAgIGNhcnJ5ID0gaGk7XG4gICAgfVxuICAgIGlmIChjYXJyeSAhPT0gMCkge1xuICAgICAgbnVtLndvcmRzW251bS5sZW5ndGgrK10gPSBjYXJyeTtcbiAgICB9XG4gICAgcmV0dXJuIG51bTtcbiAgfTtcblxuICAvLyBFeHBvcnRlZCBtb3N0bHkgZm9yIHRlc3RpbmcgcHVycG9zZXMsIHVzZSBwbGFpbiBuYW1lIGluc3RlYWRcbiAgQk4uX3ByaW1lID0gZnVuY3Rpb24gcHJpbWUgKG5hbWUpIHtcbiAgICAvLyBDYWNoZWQgdmVyc2lvbiBvZiBwcmltZVxuICAgIGlmIChwcmltZXNbbmFtZV0pIHJldHVybiBwcmltZXNbbmFtZV07XG5cbiAgICB2YXIgcHJpbWU7XG4gICAgaWYgKG5hbWUgPT09ICdrMjU2Jykge1xuICAgICAgcHJpbWUgPSBuZXcgSzI1NigpO1xuICAgIH0gZWxzZSBpZiAobmFtZSA9PT0gJ3AyMjQnKSB7XG4gICAgICBwcmltZSA9IG5ldyBQMjI0KCk7XG4gICAgfSBlbHNlIGlmIChuYW1lID09PSAncDE5MicpIHtcbiAgICAgIHByaW1lID0gbmV3IFAxOTIoKTtcbiAgICB9IGVsc2UgaWYgKG5hbWUgPT09ICdwMjU1MTknKSB7XG4gICAgICBwcmltZSA9IG5ldyBQMjU1MTkoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmtub3duIHByaW1lICcgKyBuYW1lKTtcbiAgICB9XG4gICAgcHJpbWVzW25hbWVdID0gcHJpbWU7XG5cbiAgICByZXR1cm4gcHJpbWU7XG4gIH07XG5cbiAgLy9cbiAgLy8gQmFzZSByZWR1Y3Rpb24gZW5naW5lXG4gIC8vXG4gIGZ1bmN0aW9uIFJlZCAobSkge1xuICAgIGlmICh0eXBlb2YgbSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHZhciBwcmltZSA9IEJOLl9wcmltZShtKTtcbiAgICAgIHRoaXMubSA9IHByaW1lLnA7XG4gICAgICB0aGlzLnByaW1lID0gcHJpbWU7XG4gICAgfSBlbHNlIHtcbiAgICAgIGFzc2VydChtLmd0bigxKSwgJ21vZHVsdXMgbXVzdCBiZSBncmVhdGVyIHRoYW4gMScpO1xuICAgICAgdGhpcy5tID0gbTtcbiAgICAgIHRoaXMucHJpbWUgPSBudWxsO1xuICAgIH1cbiAgfVxuXG4gIFJlZC5wcm90b3R5cGUuX3ZlcmlmeTEgPSBmdW5jdGlvbiBfdmVyaWZ5MSAoYSkge1xuICAgIGFzc2VydChhLm5lZ2F0aXZlID09PSAwLCAncmVkIHdvcmtzIG9ubHkgd2l0aCBwb3NpdGl2ZXMnKTtcbiAgICBhc3NlcnQoYS5yZWQsICdyZWQgd29ya3Mgb25seSB3aXRoIHJlZCBudW1iZXJzJyk7XG4gIH07XG5cbiAgUmVkLnByb3RvdHlwZS5fdmVyaWZ5MiA9IGZ1bmN0aW9uIF92ZXJpZnkyIChhLCBiKSB7XG4gICAgYXNzZXJ0KChhLm5lZ2F0aXZlIHwgYi5uZWdhdGl2ZSkgPT09IDAsICdyZWQgd29ya3Mgb25seSB3aXRoIHBvc2l0aXZlcycpO1xuICAgIGFzc2VydChhLnJlZCAmJiBhLnJlZCA9PT0gYi5yZWQsXG4gICAgICAncmVkIHdvcmtzIG9ubHkgd2l0aCByZWQgbnVtYmVycycpO1xuICB9O1xuXG4gIFJlZC5wcm90b3R5cGUuaW1vZCA9IGZ1bmN0aW9uIGltb2QgKGEpIHtcbiAgICBpZiAodGhpcy5wcmltZSkgcmV0dXJuIHRoaXMucHJpbWUuaXJlZHVjZShhKS5fZm9yY2VSZWQodGhpcyk7XG4gICAgcmV0dXJuIGEudW1vZCh0aGlzLm0pLl9mb3JjZVJlZCh0aGlzKTtcbiAgfTtcblxuICBSZWQucHJvdG90eXBlLm5lZyA9IGZ1bmN0aW9uIG5lZyAoYSkge1xuICAgIGlmIChhLmlzWmVybygpKSB7XG4gICAgICByZXR1cm4gYS5jbG9uZSgpO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLm0uc3ViKGEpLl9mb3JjZVJlZCh0aGlzKTtcbiAgfTtcblxuICBSZWQucHJvdG90eXBlLmFkZCA9IGZ1bmN0aW9uIGFkZCAoYSwgYikge1xuICAgIHRoaXMuX3ZlcmlmeTIoYSwgYik7XG5cbiAgICB2YXIgcmVzID0gYS5hZGQoYik7XG4gICAgaWYgKHJlcy5jbXAodGhpcy5tKSA+PSAwKSB7XG4gICAgICByZXMuaXN1Yih0aGlzLm0pO1xuICAgIH1cbiAgICByZXR1cm4gcmVzLl9mb3JjZVJlZCh0aGlzKTtcbiAgfTtcblxuICBSZWQucHJvdG90eXBlLmlhZGQgPSBmdW5jdGlvbiBpYWRkIChhLCBiKSB7XG4gICAgdGhpcy5fdmVyaWZ5MihhLCBiKTtcblxuICAgIHZhciByZXMgPSBhLmlhZGQoYik7XG4gICAgaWYgKHJlcy5jbXAodGhpcy5tKSA+PSAwKSB7XG4gICAgICByZXMuaXN1Yih0aGlzLm0pO1xuICAgIH1cbiAgICByZXR1cm4gcmVzO1xuICB9O1xuXG4gIFJlZC5wcm90b3R5cGUuc3ViID0gZnVuY3Rpb24gc3ViIChhLCBiKSB7XG4gICAgdGhpcy5fdmVyaWZ5MihhLCBiKTtcblxuICAgIHZhciByZXMgPSBhLnN1YihiKTtcbiAgICBpZiAocmVzLmNtcG4oMCkgPCAwKSB7XG4gICAgICByZXMuaWFkZCh0aGlzLm0pO1xuICAgIH1cbiAgICByZXR1cm4gcmVzLl9mb3JjZVJlZCh0aGlzKTtcbiAgfTtcblxuICBSZWQucHJvdG90eXBlLmlzdWIgPSBmdW5jdGlvbiBpc3ViIChhLCBiKSB7XG4gICAgdGhpcy5fdmVyaWZ5MihhLCBiKTtcblxuICAgIHZhciByZXMgPSBhLmlzdWIoYik7XG4gICAgaWYgKHJlcy5jbXBuKDApIDwgMCkge1xuICAgICAgcmVzLmlhZGQodGhpcy5tKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlcztcbiAgfTtcblxuICBSZWQucHJvdG90eXBlLnNobCA9IGZ1bmN0aW9uIHNobCAoYSwgbnVtKSB7XG4gICAgdGhpcy5fdmVyaWZ5MShhKTtcbiAgICByZXR1cm4gdGhpcy5pbW9kKGEudXNobG4obnVtKSk7XG4gIH07XG5cbiAgUmVkLnByb3RvdHlwZS5pbXVsID0gZnVuY3Rpb24gaW11bCAoYSwgYikge1xuICAgIHRoaXMuX3ZlcmlmeTIoYSwgYik7XG4gICAgcmV0dXJuIHRoaXMuaW1vZChhLmltdWwoYikpO1xuICB9O1xuXG4gIFJlZC5wcm90b3R5cGUubXVsID0gZnVuY3Rpb24gbXVsIChhLCBiKSB7XG4gICAgdGhpcy5fdmVyaWZ5MihhLCBiKTtcbiAgICByZXR1cm4gdGhpcy5pbW9kKGEubXVsKGIpKTtcbiAgfTtcblxuICBSZWQucHJvdG90eXBlLmlzcXIgPSBmdW5jdGlvbiBpc3FyIChhKSB7XG4gICAgcmV0dXJuIHRoaXMuaW11bChhLCBhLmNsb25lKCkpO1xuICB9O1xuXG4gIFJlZC5wcm90b3R5cGUuc3FyID0gZnVuY3Rpb24gc3FyIChhKSB7XG4gICAgcmV0dXJuIHRoaXMubXVsKGEsIGEpO1xuICB9O1xuXG4gIFJlZC5wcm90b3R5cGUuc3FydCA9IGZ1bmN0aW9uIHNxcnQgKGEpIHtcbiAgICBpZiAoYS5pc1plcm8oKSkgcmV0dXJuIGEuY2xvbmUoKTtcblxuICAgIHZhciBtb2QzID0gdGhpcy5tLmFuZGxuKDMpO1xuICAgIGFzc2VydChtb2QzICUgMiA9PT0gMSk7XG5cbiAgICAvLyBGYXN0IGNhc2VcbiAgICBpZiAobW9kMyA9PT0gMykge1xuICAgICAgdmFyIHBvdyA9IHRoaXMubS5hZGQobmV3IEJOKDEpKS5pdXNocm4oMik7XG4gICAgICByZXR1cm4gdGhpcy5wb3coYSwgcG93KTtcbiAgICB9XG5cbiAgICAvLyBUb25lbGxpLVNoYW5rcyBhbGdvcml0aG0gKFRvdGFsbHkgdW5vcHRpbWl6ZWQgYW5kIHNsb3cpXG4gICAgLy9cbiAgICAvLyBGaW5kIFEgYW5kIFMsIHRoYXQgUSAqIDIgXiBTID0gKFAgLSAxKVxuICAgIHZhciBxID0gdGhpcy5tLnN1Ym4oMSk7XG4gICAgdmFyIHMgPSAwO1xuICAgIHdoaWxlICghcS5pc1plcm8oKSAmJiBxLmFuZGxuKDEpID09PSAwKSB7XG4gICAgICBzKys7XG4gICAgICBxLml1c2hybigxKTtcbiAgICB9XG4gICAgYXNzZXJ0KCFxLmlzWmVybygpKTtcblxuICAgIHZhciBvbmUgPSBuZXcgQk4oMSkudG9SZWQodGhpcyk7XG4gICAgdmFyIG5PbmUgPSBvbmUucmVkTmVnKCk7XG5cbiAgICAvLyBGaW5kIHF1YWRyYXRpYyBub24tcmVzaWR1ZVxuICAgIC8vIE5PVEU6IE1heCBpcyBzdWNoIGJlY2F1c2Ugb2YgZ2VuZXJhbGl6ZWQgUmllbWFubiBoeXBvdGhlc2lzLlxuICAgIHZhciBscG93ID0gdGhpcy5tLnN1Ym4oMSkuaXVzaHJuKDEpO1xuICAgIHZhciB6ID0gdGhpcy5tLmJpdExlbmd0aCgpO1xuICAgIHogPSBuZXcgQk4oMiAqIHogKiB6KS50b1JlZCh0aGlzKTtcblxuICAgIHdoaWxlICh0aGlzLnBvdyh6LCBscG93KS5jbXAobk9uZSkgIT09IDApIHtcbiAgICAgIHoucmVkSUFkZChuT25lKTtcbiAgICB9XG5cbiAgICB2YXIgYyA9IHRoaXMucG93KHosIHEpO1xuICAgIHZhciByID0gdGhpcy5wb3coYSwgcS5hZGRuKDEpLml1c2hybigxKSk7XG4gICAgdmFyIHQgPSB0aGlzLnBvdyhhLCBxKTtcbiAgICB2YXIgbSA9IHM7XG4gICAgd2hpbGUgKHQuY21wKG9uZSkgIT09IDApIHtcbiAgICAgIHZhciB0bXAgPSB0O1xuICAgICAgZm9yICh2YXIgaSA9IDA7IHRtcC5jbXAob25lKSAhPT0gMDsgaSsrKSB7XG4gICAgICAgIHRtcCA9IHRtcC5yZWRTcXIoKTtcbiAgICAgIH1cbiAgICAgIGFzc2VydChpIDwgbSk7XG4gICAgICB2YXIgYiA9IHRoaXMucG93KGMsIG5ldyBCTigxKS5pdXNobG4obSAtIGkgLSAxKSk7XG5cbiAgICAgIHIgPSByLnJlZE11bChiKTtcbiAgICAgIGMgPSBiLnJlZFNxcigpO1xuICAgICAgdCA9IHQucmVkTXVsKGMpO1xuICAgICAgbSA9IGk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHI7XG4gIH07XG5cbiAgUmVkLnByb3RvdHlwZS5pbnZtID0gZnVuY3Rpb24gaW52bSAoYSkge1xuICAgIHZhciBpbnYgPSBhLl9pbnZtcCh0aGlzLm0pO1xuICAgIGlmIChpbnYubmVnYXRpdmUgIT09IDApIHtcbiAgICAgIGludi5uZWdhdGl2ZSA9IDA7XG4gICAgICByZXR1cm4gdGhpcy5pbW9kKGludikucmVkTmVnKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiB0aGlzLmltb2QoaW52KTtcbiAgICB9XG4gIH07XG5cbiAgUmVkLnByb3RvdHlwZS5wb3cgPSBmdW5jdGlvbiBwb3cgKGEsIG51bSkge1xuICAgIGlmIChudW0uaXNaZXJvKCkpIHJldHVybiBuZXcgQk4oMSkudG9SZWQodGhpcyk7XG4gICAgaWYgKG51bS5jbXBuKDEpID09PSAwKSByZXR1cm4gYS5jbG9uZSgpO1xuXG4gICAgdmFyIHdpbmRvd1NpemUgPSA0O1xuICAgIHZhciB3bmQgPSBuZXcgQXJyYXkoMSA8PCB3aW5kb3dTaXplKTtcbiAgICB3bmRbMF0gPSBuZXcgQk4oMSkudG9SZWQodGhpcyk7XG4gICAgd25kWzFdID0gYTtcbiAgICBmb3IgKHZhciBpID0gMjsgaSA8IHduZC5sZW5ndGg7IGkrKykge1xuICAgICAgd25kW2ldID0gdGhpcy5tdWwod25kW2kgLSAxXSwgYSk7XG4gICAgfVxuXG4gICAgdmFyIHJlcyA9IHduZFswXTtcbiAgICB2YXIgY3VycmVudCA9IDA7XG4gICAgdmFyIGN1cnJlbnRMZW4gPSAwO1xuICAgIHZhciBzdGFydCA9IG51bS5iaXRMZW5ndGgoKSAlIDI2O1xuICAgIGlmIChzdGFydCA9PT0gMCkge1xuICAgICAgc3RhcnQgPSAyNjtcbiAgICB9XG5cbiAgICBmb3IgKGkgPSBudW0ubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgIHZhciB3b3JkID0gbnVtLndvcmRzW2ldO1xuICAgICAgZm9yICh2YXIgaiA9IHN0YXJ0IC0gMTsgaiA+PSAwOyBqLS0pIHtcbiAgICAgICAgdmFyIGJpdCA9ICh3b3JkID4+IGopICYgMTtcbiAgICAgICAgaWYgKHJlcyAhPT0gd25kWzBdKSB7XG4gICAgICAgICAgcmVzID0gdGhpcy5zcXIocmVzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChiaXQgPT09IDAgJiYgY3VycmVudCA9PT0gMCkge1xuICAgICAgICAgIGN1cnJlbnRMZW4gPSAwO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY3VycmVudCA8PD0gMTtcbiAgICAgICAgY3VycmVudCB8PSBiaXQ7XG4gICAgICAgIGN1cnJlbnRMZW4rKztcbiAgICAgICAgaWYgKGN1cnJlbnRMZW4gIT09IHdpbmRvd1NpemUgJiYgKGkgIT09IDAgfHwgaiAhPT0gMCkpIGNvbnRpbnVlO1xuXG4gICAgICAgIHJlcyA9IHRoaXMubXVsKHJlcywgd25kW2N1cnJlbnRdKTtcbiAgICAgICAgY3VycmVudExlbiA9IDA7XG4gICAgICAgIGN1cnJlbnQgPSAwO1xuICAgICAgfVxuICAgICAgc3RhcnQgPSAyNjtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVzO1xuICB9O1xuXG4gIFJlZC5wcm90b3R5cGUuY29udmVydFRvID0gZnVuY3Rpb24gY29udmVydFRvIChudW0pIHtcbiAgICB2YXIgciA9IG51bS51bW9kKHRoaXMubSk7XG5cbiAgICByZXR1cm4gciA9PT0gbnVtID8gci5jbG9uZSgpIDogcjtcbiAgfTtcblxuICBSZWQucHJvdG90eXBlLmNvbnZlcnRGcm9tID0gZnVuY3Rpb24gY29udmVydEZyb20gKG51bSkge1xuICAgIHZhciByZXMgPSBudW0uY2xvbmUoKTtcbiAgICByZXMucmVkID0gbnVsbDtcbiAgICByZXR1cm4gcmVzO1xuICB9O1xuXG4gIC8vXG4gIC8vIE1vbnRnb21lcnkgbWV0aG9kIGVuZ2luZVxuICAvL1xuXG4gIEJOLm1vbnQgPSBmdW5jdGlvbiBtb250IChudW0pIHtcbiAgICByZXR1cm4gbmV3IE1vbnQobnVtKTtcbiAgfTtcblxuICBmdW5jdGlvbiBNb250IChtKSB7XG4gICAgUmVkLmNhbGwodGhpcywgbSk7XG5cbiAgICB0aGlzLnNoaWZ0ID0gdGhpcy5tLmJpdExlbmd0aCgpO1xuICAgIGlmICh0aGlzLnNoaWZ0ICUgMjYgIT09IDApIHtcbiAgICAgIHRoaXMuc2hpZnQgKz0gMjYgLSAodGhpcy5zaGlmdCAlIDI2KTtcbiAgICB9XG5cbiAgICB0aGlzLnIgPSBuZXcgQk4oMSkuaXVzaGxuKHRoaXMuc2hpZnQpO1xuICAgIHRoaXMucjIgPSB0aGlzLmltb2QodGhpcy5yLnNxcigpKTtcbiAgICB0aGlzLnJpbnYgPSB0aGlzLnIuX2ludm1wKHRoaXMubSk7XG5cbiAgICB0aGlzLm1pbnYgPSB0aGlzLnJpbnYubXVsKHRoaXMucikuaXN1Ym4oMSkuZGl2KHRoaXMubSk7XG4gICAgdGhpcy5taW52ID0gdGhpcy5taW52LnVtb2QodGhpcy5yKTtcbiAgICB0aGlzLm1pbnYgPSB0aGlzLnIuc3ViKHRoaXMubWludik7XG4gIH1cbiAgaW5oZXJpdHMoTW9udCwgUmVkKTtcblxuICBNb250LnByb3RvdHlwZS5jb252ZXJ0VG8gPSBmdW5jdGlvbiBjb252ZXJ0VG8gKG51bSkge1xuICAgIHJldHVybiB0aGlzLmltb2QobnVtLnVzaGxuKHRoaXMuc2hpZnQpKTtcbiAgfTtcblxuICBNb250LnByb3RvdHlwZS5jb252ZXJ0RnJvbSA9IGZ1bmN0aW9uIGNvbnZlcnRGcm9tIChudW0pIHtcbiAgICB2YXIgciA9IHRoaXMuaW1vZChudW0ubXVsKHRoaXMucmludikpO1xuICAgIHIucmVkID0gbnVsbDtcbiAgICByZXR1cm4gcjtcbiAgfTtcblxuICBNb250LnByb3RvdHlwZS5pbXVsID0gZnVuY3Rpb24gaW11bCAoYSwgYikge1xuICAgIGlmIChhLmlzWmVybygpIHx8IGIuaXNaZXJvKCkpIHtcbiAgICAgIGEud29yZHNbMF0gPSAwO1xuICAgICAgYS5sZW5ndGggPSAxO1xuICAgICAgcmV0dXJuIGE7XG4gICAgfVxuXG4gICAgdmFyIHQgPSBhLmltdWwoYik7XG4gICAgdmFyIGMgPSB0Lm1hc2tuKHRoaXMuc2hpZnQpLm11bCh0aGlzLm1pbnYpLmltYXNrbih0aGlzLnNoaWZ0KS5tdWwodGhpcy5tKTtcbiAgICB2YXIgdSA9IHQuaXN1YihjKS5pdXNocm4odGhpcy5zaGlmdCk7XG4gICAgdmFyIHJlcyA9IHU7XG5cbiAgICBpZiAodS5jbXAodGhpcy5tKSA+PSAwKSB7XG4gICAgICByZXMgPSB1LmlzdWIodGhpcy5tKTtcbiAgICB9IGVsc2UgaWYgKHUuY21wbigwKSA8IDApIHtcbiAgICAgIHJlcyA9IHUuaWFkZCh0aGlzLm0pO1xuICAgIH1cblxuICAgIHJldHVybiByZXMuX2ZvcmNlUmVkKHRoaXMpO1xuICB9O1xuXG4gIE1vbnQucHJvdG90eXBlLm11bCA9IGZ1bmN0aW9uIG11bCAoYSwgYikge1xuICAgIGlmIChhLmlzWmVybygpIHx8IGIuaXNaZXJvKCkpIHJldHVybiBuZXcgQk4oMCkuX2ZvcmNlUmVkKHRoaXMpO1xuXG4gICAgdmFyIHQgPSBhLm11bChiKTtcbiAgICB2YXIgYyA9IHQubWFza24odGhpcy5zaGlmdCkubXVsKHRoaXMubWludikuaW1hc2tuKHRoaXMuc2hpZnQpLm11bCh0aGlzLm0pO1xuICAgIHZhciB1ID0gdC5pc3ViKGMpLml1c2hybih0aGlzLnNoaWZ0KTtcbiAgICB2YXIgcmVzID0gdTtcbiAgICBpZiAodS5jbXAodGhpcy5tKSA+PSAwKSB7XG4gICAgICByZXMgPSB1LmlzdWIodGhpcy5tKTtcbiAgICB9IGVsc2UgaWYgKHUuY21wbigwKSA8IDApIHtcbiAgICAgIHJlcyA9IHUuaWFkZCh0aGlzLm0pO1xuICAgIH1cblxuICAgIHJldHVybiByZXMuX2ZvcmNlUmVkKHRoaXMpO1xuICB9O1xuXG4gIE1vbnQucHJvdG90eXBlLmludm0gPSBmdW5jdGlvbiBpbnZtIChhKSB7XG4gICAgLy8gKEFSKV4tMSAqIFJeMiA9IChBXi0xICogUl4tMSkgKiBSXjIgPSBBXi0xICogUlxuICAgIHZhciByZXMgPSB0aGlzLmltb2QoYS5faW52bXAodGhpcy5tKS5tdWwodGhpcy5yMikpO1xuICAgIHJldHVybiByZXMuX2ZvcmNlUmVkKHRoaXMpO1xuICB9O1xufSkodHlwZW9mIG1vZHVsZSA9PT0gJ3VuZGVmaW5lZCcgfHwgbW9kdWxlLCB0aGlzKTtcbiIsIid1c2Ugc3RyaWN0J1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZpbmRCb3VuZHNcblxuZnVuY3Rpb24gZmluZEJvdW5kcyhwb2ludHMpIHtcbiAgdmFyIG4gPSBwb2ludHMubGVuZ3RoXG4gIGlmKG4gPT09IDApIHtcbiAgICByZXR1cm4gW1tdLCBbXV1cbiAgfVxuICB2YXIgZCA9IHBvaW50c1swXS5sZW5ndGhcbiAgdmFyIGxvID0gcG9pbnRzWzBdLnNsaWNlKClcbiAgdmFyIGhpID0gcG9pbnRzWzBdLnNsaWNlKClcbiAgZm9yKHZhciBpPTE7IGk8bjsgKytpKSB7XG4gICAgdmFyIHAgPSBwb2ludHNbaV1cbiAgICBmb3IodmFyIGo9MDsgajxkOyArK2opIHtcbiAgICAgIHZhciB4ID0gcFtqXVxuICAgICAgbG9bal0gPSBNYXRoLm1pbihsb1tqXSwgeClcbiAgICAgIGhpW2pdID0gTWF0aC5tYXgoaGlbal0sIHgpXG4gICAgfVxuICB9XG4gIHJldHVybiBbbG8sIGhpXVxufSIsIid1c2Ugc3RyaWN0J1xuXG5tb2R1bGUuZXhwb3J0cyA9IGJveEludGVyc2VjdFdyYXBwZXJcblxudmFyIHBvb2wgPSByZXF1aXJlKCd0eXBlZGFycmF5LXBvb2wnKVxudmFyIHN3ZWVwID0gcmVxdWlyZSgnLi9saWIvc3dlZXAnKVxudmFyIGJveEludGVyc2VjdEl0ZXIgPSByZXF1aXJlKCcuL2xpYi9pbnRlcnNlY3QnKVxuXG5mdW5jdGlvbiBib3hFbXB0eShkLCBib3gpIHtcbiAgZm9yKHZhciBqPTA7IGo8ZDsgKytqKSB7XG4gICAgaWYoIShib3hbal0gPD0gYm94W2orZF0pKSB7XG4gICAgICByZXR1cm4gdHJ1ZVxuICAgIH1cbiAgfVxuICByZXR1cm4gZmFsc2Vcbn1cblxuLy9VbnBhY2sgYm94ZXMgaW50byBhIGZsYXQgdHlwZWQgYXJyYXksIHJlbW92ZSBlbXB0eSBib3hlc1xuZnVuY3Rpb24gY29udmVydEJveGVzKGJveGVzLCBkLCBkYXRhLCBpZHMpIHtcbiAgdmFyIHB0ciA9IDBcbiAgdmFyIGNvdW50ID0gMFxuICBmb3IodmFyIGk9MCwgbj1ib3hlcy5sZW5ndGg7IGk8bjsgKytpKSB7XG4gICAgdmFyIGIgPSBib3hlc1tpXVxuICAgIGlmKGJveEVtcHR5KGQsIGIpKSB7XG4gICAgICBjb250aW51ZVxuICAgIH1cbiAgICBmb3IodmFyIGo9MDsgajwyKmQ7ICsraikge1xuICAgICAgZGF0YVtwdHIrK10gPSBiW2pdXG4gICAgfVxuICAgIGlkc1tjb3VudCsrXSA9IGlcbiAgfVxuICByZXR1cm4gY291bnRcbn1cblxuLy9QZXJmb3JtIHR5cGUgY29udmVyc2lvbnMsIGNoZWNrIGJvdW5kc1xuZnVuY3Rpb24gYm94SW50ZXJzZWN0KHJlZCwgYmx1ZSwgdmlzaXQsIGZ1bGwpIHtcbiAgdmFyIG4gPSByZWQubGVuZ3RoXG4gIHZhciBtID0gYmx1ZS5sZW5ndGhcblxuICAvL0lmIGVpdGhlciBhcnJheSBpcyBlbXB0eSwgdGhlbiB3ZSBjYW4gc2tpcCB0aGlzIHdob2xlIHRoaW5nXG4gIGlmKG4gPD0gMCB8fCBtIDw9IDApIHtcbiAgICByZXR1cm5cbiAgfVxuXG4gIC8vQ29tcHV0ZSBkaW1lbnNpb24sIGlmIGl0IGlzIDAgdGhlbiB3ZSBza2lwXG4gIHZhciBkID0gKHJlZFswXS5sZW5ndGgpPj4+MVxuICBpZihkIDw9IDApIHtcbiAgICByZXR1cm5cbiAgfVxuXG4gIHZhciByZXR2YWxcblxuICAvL0NvbnZlcnQgcmVkIGJveGVzXG4gIHZhciByZWRMaXN0ICA9IHBvb2wubWFsbG9jRG91YmxlKDIqZCpuKVxuICB2YXIgcmVkSWRzICAgPSBwb29sLm1hbGxvY0ludDMyKG4pXG4gIG4gPSBjb252ZXJ0Qm94ZXMocmVkLCBkLCByZWRMaXN0LCByZWRJZHMpXG5cbiAgaWYobiA+IDApIHtcbiAgICBpZihkID09PSAxICYmIGZ1bGwpIHtcbiAgICAgIC8vU3BlY2lhbCBjYXNlOiAxZCBjb21wbGV0ZVxuICAgICAgc3dlZXAuaW5pdChuKVxuICAgICAgcmV0dmFsID0gc3dlZXAuc3dlZXBDb21wbGV0ZShcbiAgICAgICAgZCwgdmlzaXQsIFxuICAgICAgICAwLCBuLCByZWRMaXN0LCByZWRJZHMsXG4gICAgICAgIDAsIG4sIHJlZExpc3QsIHJlZElkcylcbiAgICB9IGVsc2Uge1xuXG4gICAgICAvL0NvbnZlcnQgYmx1ZSBib3hlc1xuICAgICAgdmFyIGJsdWVMaXN0ID0gcG9vbC5tYWxsb2NEb3VibGUoMipkKm0pXG4gICAgICB2YXIgYmx1ZUlkcyAgPSBwb29sLm1hbGxvY0ludDMyKG0pXG4gICAgICBtID0gY29udmVydEJveGVzKGJsdWUsIGQsIGJsdWVMaXN0LCBibHVlSWRzKVxuXG4gICAgICBpZihtID4gMCkge1xuICAgICAgICBzd2VlcC5pbml0KG4rbSlcblxuICAgICAgICBpZihkID09PSAxKSB7XG4gICAgICAgICAgLy9TcGVjaWFsIGNhc2U6IDFkIGJpcGFydGl0ZVxuICAgICAgICAgIHJldHZhbCA9IHN3ZWVwLnN3ZWVwQmlwYXJ0aXRlKFxuICAgICAgICAgICAgZCwgdmlzaXQsIFxuICAgICAgICAgICAgMCwgbiwgcmVkTGlzdCwgIHJlZElkcyxcbiAgICAgICAgICAgIDAsIG0sIGJsdWVMaXN0LCBibHVlSWRzKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vR2VuZXJhbCBjYXNlOiAgZD4xXG4gICAgICAgICAgcmV0dmFsID0gYm94SW50ZXJzZWN0SXRlcihcbiAgICAgICAgICAgIGQsIHZpc2l0LCAgICBmdWxsLFxuICAgICAgICAgICAgbiwgcmVkTGlzdCwgIHJlZElkcyxcbiAgICAgICAgICAgIG0sIGJsdWVMaXN0LCBibHVlSWRzKVxuICAgICAgICB9XG5cbiAgICAgICAgcG9vbC5mcmVlKGJsdWVMaXN0KVxuICAgICAgICBwb29sLmZyZWUoYmx1ZUlkcylcbiAgICAgIH1cbiAgICB9XG5cbiAgICBwb29sLmZyZWUocmVkTGlzdClcbiAgICBwb29sLmZyZWUocmVkSWRzKVxuICB9XG5cbiAgcmV0dXJuIHJldHZhbFxufVxuXG5cbnZhciBSRVNVTFRcblxuZnVuY3Rpb24gYXBwZW5kSXRlbShpLGopIHtcbiAgUkVTVUxULnB1c2goW2ksal0pXG59XG5cbmZ1bmN0aW9uIGludGVyc2VjdEZ1bGxBcnJheSh4KSB7XG4gIFJFU1VMVCA9IFtdXG4gIGJveEludGVyc2VjdCh4LCB4LCBhcHBlbmRJdGVtLCB0cnVlKVxuICByZXR1cm4gUkVTVUxUXG59XG5cbmZ1bmN0aW9uIGludGVyc2VjdEJpcGFydGl0ZUFycmF5KHgsIHkpIHtcbiAgUkVTVUxUID0gW11cbiAgYm94SW50ZXJzZWN0KHgsIHksIGFwcGVuZEl0ZW0sIGZhbHNlKVxuICByZXR1cm4gUkVTVUxUXG59XG5cbi8vVXNlci1mcmllbmRseSB3cmFwcGVyLCBoYW5kbGUgZnVsbCBpbnB1dCBhbmQgbm8tdmlzaXRvciBjYXNlc1xuZnVuY3Rpb24gYm94SW50ZXJzZWN0V3JhcHBlcihhcmcwLCBhcmcxLCBhcmcyKSB7XG4gIHZhciByZXN1bHRcbiAgc3dpdGNoKGFyZ3VtZW50cy5sZW5ndGgpIHtcbiAgICBjYXNlIDE6XG4gICAgICByZXR1cm4gaW50ZXJzZWN0RnVsbEFycmF5KGFyZzApXG4gICAgY2FzZSAyOlxuICAgICAgaWYodHlwZW9mIGFyZzEgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgcmV0dXJuIGJveEludGVyc2VjdChhcmcwLCBhcmcwLCBhcmcxLCB0cnVlKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGludGVyc2VjdEJpcGFydGl0ZUFycmF5KGFyZzAsIGFyZzEpXG4gICAgICB9XG4gICAgY2FzZSAzOlxuICAgICAgcmV0dXJuIGJveEludGVyc2VjdChhcmcwLCBhcmcxLCBhcmcyLCBmYWxzZSlcbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdib3gtaW50ZXJzZWN0OiBJbnZhbGlkIGFyZ3VtZW50cycpXG4gIH1cbn0iLCIndXNlIHN0cmljdCdcblxudmFyIERJTUVOU0lPTiAgID0gJ2QnXG52YXIgQVhJUyAgICAgICAgPSAnYXgnXG52YXIgVklTSVQgICAgICAgPSAndnYnXG52YXIgRkxJUCAgICAgICAgPSAnZnAnXG5cbnZhciBFTEVNX1NJWkUgICA9ICdlcydcblxudmFyIFJFRF9TVEFSVCAgID0gJ3JzJ1xudmFyIFJFRF9FTkQgICAgID0gJ3JlJ1xudmFyIFJFRF9CT1hFUyAgID0gJ3JiJ1xudmFyIFJFRF9JTkRFWCAgID0gJ3JpJ1xudmFyIFJFRF9QVFIgICAgID0gJ3JwJ1xuXG52YXIgQkxVRV9TVEFSVCAgPSAnYnMnXG52YXIgQkxVRV9FTkQgICAgPSAnYmUnXG52YXIgQkxVRV9CT1hFUyAgPSAnYmInXG52YXIgQkxVRV9JTkRFWCAgPSAnYmknXG52YXIgQkxVRV9QVFIgICAgPSAnYnAnXG5cbnZhciBSRVRWQUwgICAgICA9ICdydidcblxudmFyIElOTkVSX0xBQkVMID0gJ1EnXG5cbnZhciBBUkdTID0gW1xuICBESU1FTlNJT04sXG4gIEFYSVMsXG4gIFZJU0lULFxuICBSRURfU1RBUlQsXG4gIFJFRF9FTkQsXG4gIFJFRF9CT1hFUyxcbiAgUkVEX0lOREVYLFxuICBCTFVFX1NUQVJULFxuICBCTFVFX0VORCxcbiAgQkxVRV9CT1hFUyxcbiAgQkxVRV9JTkRFWFxuXVxuXG5mdW5jdGlvbiBnZW5lcmF0ZUJydXRlRm9yY2UocmVkTWFqb3IsIGZsaXAsIGZ1bGwpIHtcbiAgdmFyIGZ1bmNOYW1lID0gJ2JydXRlRm9yY2UnICsgXG4gICAgKHJlZE1ham9yID8gJ1JlZCcgOiAnQmx1ZScpICsgXG4gICAgKGZsaXAgPyAnRmxpcCcgOiAnJykgK1xuICAgIChmdWxsID8gJ0Z1bGwnIDogJycpXG5cbiAgdmFyIGNvZGUgPSBbJ2Z1bmN0aW9uICcsIGZ1bmNOYW1lLCAnKCcsIEFSR1Muam9pbigpLCAnKXsnLFxuICAgICd2YXIgJywgRUxFTV9TSVpFLCAnPTIqJywgRElNRU5TSU9OLCAnOyddXG5cbiAgdmFyIHJlZExvb3AgPSBcbiAgICAnZm9yKHZhciBpPScgKyBSRURfU1RBUlQgKyAnLCcgKyBSRURfUFRSICsgJz0nICsgRUxFTV9TSVpFICsgJyonICsgUkVEX1NUQVJUICsgJzsnICtcbiAgICAgICAgJ2k8JyArIFJFRF9FTkQgKyc7JyArXG4gICAgICAgICcrK2ksJyArIFJFRF9QVFIgKyAnKz0nICsgRUxFTV9TSVpFICsgJyl7JyArXG4gICAgICAgICd2YXIgeDA9JyArIFJFRF9CT1hFUyArICdbJyArIEFYSVMgKyAnKycgKyBSRURfUFRSICsgJ10sJyArXG4gICAgICAgICAgICAneDE9JyArIFJFRF9CT1hFUyArICdbJyArIEFYSVMgKyAnKycgKyBSRURfUFRSICsgJysnICsgRElNRU5TSU9OICsgJ10sJyArXG4gICAgICAgICAgICAneGk9JyArIFJFRF9JTkRFWCArICdbaV07J1xuXG4gIHZhciBibHVlTG9vcCA9IFxuICAgICdmb3IodmFyIGo9JyArIEJMVUVfU1RBUlQgKyAnLCcgKyBCTFVFX1BUUiArICc9JyArIEVMRU1fU0laRSArICcqJyArIEJMVUVfU1RBUlQgKyAnOycgK1xuICAgICAgICAnajwnICsgQkxVRV9FTkQgKyAnOycgK1xuICAgICAgICAnKytqLCcgKyBCTFVFX1BUUiArICcrPScgKyBFTEVNX1NJWkUgKyAnKXsnICtcbiAgICAgICAgJ3ZhciB5MD0nICsgQkxVRV9CT1hFUyArICdbJyArIEFYSVMgKyAnKycgKyBCTFVFX1BUUiArICddLCcgK1xuICAgICAgICAgICAgKGZ1bGwgPyAneTE9JyArIEJMVUVfQk9YRVMgKyAnWycgKyBBWElTICsgJysnICsgQkxVRV9QVFIgKyAnKycgKyBESU1FTlNJT04gKyAnXSwnIDogJycpICtcbiAgICAgICAgICAgICd5aT0nICsgQkxVRV9JTkRFWCArICdbal07J1xuXG4gIGlmKHJlZE1ham9yKSB7XG4gICAgY29kZS5wdXNoKHJlZExvb3AsIElOTkVSX0xBQkVMLCAnOicsIGJsdWVMb29wKVxuICB9IGVsc2Uge1xuICAgIGNvZGUucHVzaChibHVlTG9vcCwgSU5ORVJfTEFCRUwsICc6JywgcmVkTG9vcClcbiAgfVxuXG4gIGlmKGZ1bGwpIHtcbiAgICBjb2RlLnB1c2goJ2lmKHkxPHgwfHx4MTx5MCljb250aW51ZTsnKVxuICB9IGVsc2UgaWYoZmxpcCkge1xuICAgIGNvZGUucHVzaCgnaWYoeTA8PXgwfHx4MTx5MCljb250aW51ZTsnKVxuICB9IGVsc2Uge1xuICAgIGNvZGUucHVzaCgnaWYoeTA8eDB8fHgxPHkwKWNvbnRpbnVlOycpXG4gIH1cblxuICBjb2RlLnB1c2goJ2Zvcih2YXIgaz0nK0FYSVMrJysxO2s8JytESU1FTlNJT04rJzsrK2speycrXG4gICAgJ3ZhciByMD0nK1JFRF9CT1hFUysnW2srJytSRURfUFRSKyddLCcrXG4gICAgICAgICdyMT0nK1JFRF9CT1hFUysnW2srJytESU1FTlNJT04rJysnK1JFRF9QVFIrJ10sJytcbiAgICAgICAgJ2IwPScrQkxVRV9CT1hFUysnW2srJytCTFVFX1BUUisnXSwnK1xuICAgICAgICAnYjE9JytCTFVFX0JPWEVTKydbaysnK0RJTUVOU0lPTisnKycrQkxVRV9QVFIrJ107JytcbiAgICAgICdpZihyMTxiMHx8YjE8cjApY29udGludWUgJyArIElOTkVSX0xBQkVMICsgJzt9JyArXG4gICAgICAndmFyICcgKyBSRVRWQUwgKyAnPScgKyBWSVNJVCArICcoJylcblxuICBpZihmbGlwKSB7XG4gICAgY29kZS5wdXNoKCd5aSx4aScpXG4gIH0gZWxzZSB7XG4gICAgY29kZS5wdXNoKCd4aSx5aScpXG4gIH1cblxuICBjb2RlLnB1c2goJyk7aWYoJyArIFJFVFZBTCArICchPT12b2lkIDApcmV0dXJuICcgKyBSRVRWQUwgKyAnO319fScpXG5cbiAgcmV0dXJuIHtcbiAgICBuYW1lOiBmdW5jTmFtZSwgXG4gICAgY29kZTogY29kZS5qb2luKCcnKVxuICB9XG59XG5cbmZ1bmN0aW9uIGJydXRlRm9yY2VQbGFubmVyKGZ1bGwpIHtcbiAgdmFyIGZ1bmNOYW1lID0gJ2JydXRlRm9yY2UnICsgKGZ1bGwgPyAnRnVsbCcgOiAnUGFydGlhbCcpXG4gIHZhciBwcmVmaXggPSBbXVxuICB2YXIgZmFyZ3MgPSBBUkdTLnNsaWNlKClcbiAgaWYoIWZ1bGwpIHtcbiAgICBmYXJncy5zcGxpY2UoMywgMCwgRkxJUClcbiAgfVxuXG4gIHZhciBjb2RlID0gWydmdW5jdGlvbiAnICsgZnVuY05hbWUgKyAnKCcgKyBmYXJncy5qb2luKCkgKyAnKXsnXVxuXG4gIGZ1bmN0aW9uIGludm9rZShyZWRNYWpvciwgZmxpcCkge1xuICAgIHZhciByZXMgPSBnZW5lcmF0ZUJydXRlRm9yY2UocmVkTWFqb3IsIGZsaXAsIGZ1bGwpXG4gICAgcHJlZml4LnB1c2gocmVzLmNvZGUpXG4gICAgY29kZS5wdXNoKCdyZXR1cm4gJyArIHJlcy5uYW1lICsgJygnICsgQVJHUy5qb2luKCkgKyAnKTsnKVxuICB9XG5cbiAgY29kZS5wdXNoKCdpZignICsgUkVEX0VORCArICctJyArIFJFRF9TVEFSVCArICc+JyArXG4gICAgICAgICAgICAgICAgICAgIEJMVUVfRU5EICsgJy0nICsgQkxVRV9TVEFSVCArICcpeycpXG5cbiAgaWYoZnVsbCkge1xuICAgIGludm9rZSh0cnVlLCBmYWxzZSlcbiAgICBjb2RlLnB1c2goJ31lbHNleycpXG4gICAgaW52b2tlKGZhbHNlLCBmYWxzZSlcbiAgfSBlbHNlIHtcbiAgICBjb2RlLnB1c2goJ2lmKCcgKyBGTElQICsgJyl7JylcbiAgICBpbnZva2UodHJ1ZSwgdHJ1ZSlcbiAgICBjb2RlLnB1c2goJ31lbHNleycpXG4gICAgaW52b2tlKHRydWUsIGZhbHNlKVxuICAgIGNvZGUucHVzaCgnfX1lbHNle2lmKCcgKyBGTElQICsgJyl7JylcbiAgICBpbnZva2UoZmFsc2UsIHRydWUpXG4gICAgY29kZS5wdXNoKCd9ZWxzZXsnKVxuICAgIGludm9rZShmYWxzZSwgZmFsc2UpXG4gICAgY29kZS5wdXNoKCd9JylcbiAgfVxuICBjb2RlLnB1c2goJ319cmV0dXJuICcgKyBmdW5jTmFtZSlcblxuICB2YXIgY29kZVN0ciA9IHByZWZpeC5qb2luKCcnKSArIGNvZGUuam9pbignJylcbiAgdmFyIHByb2MgPSBuZXcgRnVuY3Rpb24oY29kZVN0cilcbiAgcmV0dXJuIHByb2MoKVxufVxuXG5cbmV4cG9ydHMucGFydGlhbCA9IGJydXRlRm9yY2VQbGFubmVyKGZhbHNlKVxuZXhwb3J0cy5mdWxsICAgID0gYnJ1dGVGb3JjZVBsYW5uZXIodHJ1ZSkiLCIndXNlIHN0cmljdCdcblxubW9kdWxlLmV4cG9ydHMgPSBib3hJbnRlcnNlY3RJdGVyXG5cbnZhciBwb29sID0gcmVxdWlyZSgndHlwZWRhcnJheS1wb29sJylcbnZhciBiaXRzID0gcmVxdWlyZSgnYml0LXR3aWRkbGUnKVxudmFyIGJydXRlRm9yY2UgPSByZXF1aXJlKCcuL2JydXRlJylcbnZhciBicnV0ZUZvcmNlUGFydGlhbCA9IGJydXRlRm9yY2UucGFydGlhbFxudmFyIGJydXRlRm9yY2VGdWxsID0gYnJ1dGVGb3JjZS5mdWxsXG52YXIgc3dlZXAgPSByZXF1aXJlKCcuL3N3ZWVwJylcbnZhciBmaW5kTWVkaWFuID0gcmVxdWlyZSgnLi9tZWRpYW4nKVxudmFyIGdlblBhcnRpdGlvbiA9IHJlcXVpcmUoJy4vcGFydGl0aW9uJylcblxuLy9Ud2lkZGxlIHBhcmFtZXRlcnNcbnZhciBCUlVURV9GT1JDRV9DVVRPRkYgICAgPSAxMjggICAgICAgLy9DdXQgb2ZmIGZvciBicnV0ZSBmb3JjZSBzZWFyY2hcbnZhciBTQ0FOX0NVVE9GRiAgICAgICAgICAgPSAoMTw8MjIpICAgLy9DdXQgb2ZmIGZvciB0d28gd2F5IHNjYW5cbnZhciBTQ0FOX0NPTVBMRVRFX0NVVE9GRiAgPSAoMTw8MjIpICBcblxuLy9QYXJ0aXRpb24gZnVuY3Rpb25zXG52YXIgcGFydGl0aW9uSW50ZXJpb3JDb250YWluc0ludGVydmFsID0gZ2VuUGFydGl0aW9uKFxuICAnIShsbz49cDApJiYhKHAxPj1oaSknLCBcbiAgWydwMCcsICdwMSddKVxuXG52YXIgcGFydGl0aW9uU3RhcnRFcXVhbCA9IGdlblBhcnRpdGlvbihcbiAgJ2xvPT09cDAnLFxuICBbJ3AwJ10pXG5cbnZhciBwYXJ0aXRpb25TdGFydExlc3NUaGFuID0gZ2VuUGFydGl0aW9uKFxuICAnbG88cDAnLFxuICBbJ3AwJ10pXG5cbnZhciBwYXJ0aXRpb25FbmRMZXNzVGhhbkVxdWFsID0gZ2VuUGFydGl0aW9uKFxuICAnaGk8PXAwJyxcbiAgWydwMCddKVxuXG52YXIgcGFydGl0aW9uQ29udGFpbnNQb2ludCA9IGdlblBhcnRpdGlvbihcbiAgJ2xvPD1wMCYmcDA8PWhpJyxcbiAgWydwMCddKVxuXG52YXIgcGFydGl0aW9uQ29udGFpbnNQb2ludFByb3BlciA9IGdlblBhcnRpdGlvbihcbiAgJ2xvPHAwJiZwMDw9aGknLFxuICBbJ3AwJ10pXG5cbi8vRnJhbWUgc2l6ZSBmb3IgaXRlcmF0aXZlIGxvb3BcbnZhciBJRlJBTUVfU0laRSA9IDZcbnZhciBERlJBTUVfU0laRSA9IDJcblxuLy9EYXRhIGZvciBib3ggc3RhdGNrXG52YXIgSU5JVF9DQVBBQ0lUWSA9IDEwMjRcbnZhciBCT1hfSVNUQUNLICA9IHBvb2wubWFsbG9jSW50MzIoSU5JVF9DQVBBQ0lUWSlcbnZhciBCT1hfRFNUQUNLICA9IHBvb2wubWFsbG9jRG91YmxlKElOSVRfQ0FQQUNJVFkpXG5cbi8vSW5pdGlhbGl6ZSBpdGVyYXRpdmUgbG9vcCBxdWV1ZVxuZnVuY3Rpb24gaXRlckluaXQoZCwgY291bnQpIHtcbiAgdmFyIGxldmVscyA9ICg4ICogYml0cy5sb2cyKGNvdW50KzEpICogKGQrMSkpfDBcbiAgdmFyIG1heEludHMgPSBiaXRzLm5leHRQb3cyKElGUkFNRV9TSVpFKmxldmVscylcbiAgaWYoQk9YX0lTVEFDSy5sZW5ndGggPCBtYXhJbnRzKSB7XG4gICAgcG9vbC5mcmVlKEJPWF9JU1RBQ0spXG4gICAgQk9YX0lTVEFDSyA9IHBvb2wubWFsbG9jSW50MzIobWF4SW50cylcbiAgfVxuICB2YXIgbWF4RG91YmxlcyA9IGJpdHMubmV4dFBvdzIoREZSQU1FX1NJWkUqbGV2ZWxzKVxuICBpZihCT1hfRFNUQUNLIDwgbWF4RG91Ymxlcykge1xuICAgIHBvb2wuZnJlZShCT1hfRFNUQUNLKVxuICAgIEJPWF9EU1RBQ0sgPSBwb29sLm1hbGxvY0RvdWJsZShtYXhEb3VibGVzKVxuICB9XG59XG5cbi8vQXBwZW5kIGl0ZW0gdG8gcXVldWVcbmZ1bmN0aW9uIGl0ZXJQdXNoKHB0cixcbiAgYXhpcywgXG4gIHJlZFN0YXJ0LCByZWRFbmQsIFxuICBibHVlU3RhcnQsIGJsdWVFbmQsIFxuICBzdGF0ZSwgXG4gIGxvLCBoaSkge1xuXG4gIHZhciBpcHRyID0gSUZSQU1FX1NJWkUgKiBwdHJcbiAgQk9YX0lTVEFDS1tpcHRyXSAgID0gYXhpc1xuICBCT1hfSVNUQUNLW2lwdHIrMV0gPSByZWRTdGFydFxuICBCT1hfSVNUQUNLW2lwdHIrMl0gPSByZWRFbmRcbiAgQk9YX0lTVEFDS1tpcHRyKzNdID0gYmx1ZVN0YXJ0XG4gIEJPWF9JU1RBQ0tbaXB0cis0XSA9IGJsdWVFbmRcbiAgQk9YX0lTVEFDS1tpcHRyKzVdID0gc3RhdGVcblxuICB2YXIgZHB0ciA9IERGUkFNRV9TSVpFICogcHRyXG4gIEJPWF9EU1RBQ0tbZHB0cl0gICA9IGxvXG4gIEJPWF9EU1RBQ0tbZHB0cisxXSA9IGhpXG59XG5cbi8vU3BlY2lhbCBjYXNlOiAgSW50ZXJzZWN0IHNpbmdsZSBwb2ludCB3aXRoIGxpc3Qgb2YgaW50ZXJ2YWxzXG5mdW5jdGlvbiBvbmVQb2ludFBhcnRpYWwoXG4gIGQsIGF4aXMsIHZpc2l0LCBmbGlwLFxuICByZWRTdGFydCwgcmVkRW5kLCByZWQsIHJlZEluZGV4LFxuICBibHVlT2Zmc2V0LCBibHVlLCBibHVlSWQpIHtcblxuICB2YXIgZWxlbVNpemUgPSAyICogZFxuICB2YXIgYmx1ZVB0ciAgPSBibHVlT2Zmc2V0ICogZWxlbVNpemVcbiAgdmFyIGJsdWVYICAgID0gYmx1ZVtibHVlUHRyICsgYXhpc11cblxucmVkX2xvb3A6XG4gIGZvcih2YXIgaT1yZWRTdGFydCwgcmVkUHRyPXJlZFN0YXJ0KmVsZW1TaXplOyBpPHJlZEVuZDsgKytpLCByZWRQdHIrPWVsZW1TaXplKSB7XG4gICAgdmFyIHIwID0gcmVkW3JlZFB0citheGlzXVxuICAgIHZhciByMSA9IHJlZFtyZWRQdHIrYXhpcytkXVxuICAgIGlmKGJsdWVYIDwgcjAgfHwgcjEgPCBibHVlWCkge1xuICAgICAgY29udGludWVcbiAgICB9XG4gICAgaWYoZmxpcCAmJiBibHVlWCA9PT0gcjApIHtcbiAgICAgIGNvbnRpbnVlXG4gICAgfVxuICAgIHZhciByZWRJZCA9IHJlZEluZGV4W2ldXG4gICAgZm9yKHZhciBqPWF4aXMrMTsgajxkOyArK2opIHtcbiAgICAgIHZhciByMCA9IHJlZFtyZWRQdHIral1cbiAgICAgIHZhciByMSA9IHJlZFtyZWRQdHIraitkXVxuICAgICAgdmFyIGIwID0gYmx1ZVtibHVlUHRyK2pdXG4gICAgICB2YXIgYjEgPSBibHVlW2JsdWVQdHIraitkXVxuICAgICAgaWYocjEgPCBiMCB8fCBiMSA8IHIwKSB7XG4gICAgICAgIGNvbnRpbnVlIHJlZF9sb29wXG4gICAgICB9XG4gICAgfVxuICAgIHZhciByZXR2YWxcbiAgICBpZihmbGlwKSB7XG4gICAgICByZXR2YWwgPSB2aXNpdChibHVlSWQsIHJlZElkKVxuICAgIH0gZWxzZSB7XG4gICAgICByZXR2YWwgPSB2aXNpdChyZWRJZCwgYmx1ZUlkKVxuICAgIH1cbiAgICBpZihyZXR2YWwgIT09IHZvaWQgMCkge1xuICAgICAgcmV0dXJuIHJldHZhbFxuICAgIH1cbiAgfVxufVxuXG4vL1NwZWNpYWwgY2FzZTogIEludGVyc2VjdCBvbmUgcG9pbnQgd2l0aCBsaXN0IG9mIGludGVydmFsc1xuZnVuY3Rpb24gb25lUG9pbnRGdWxsKFxuICBkLCBheGlzLCB2aXNpdCxcbiAgcmVkU3RhcnQsIHJlZEVuZCwgcmVkLCByZWRJbmRleCxcbiAgYmx1ZU9mZnNldCwgYmx1ZSwgYmx1ZUlkKSB7XG5cbiAgdmFyIGVsZW1TaXplID0gMiAqIGRcbiAgdmFyIGJsdWVQdHIgID0gYmx1ZU9mZnNldCAqIGVsZW1TaXplXG4gIHZhciBibHVlWCAgICA9IGJsdWVbYmx1ZVB0ciArIGF4aXNdXG5cbnJlZF9sb29wOlxuICBmb3IodmFyIGk9cmVkU3RhcnQsIHJlZFB0cj1yZWRTdGFydCplbGVtU2l6ZTsgaTxyZWRFbmQ7ICsraSwgcmVkUHRyKz1lbGVtU2l6ZSkge1xuICAgIHZhciByZWRJZCA9IHJlZEluZGV4W2ldXG4gICAgaWYocmVkSWQgPT09IGJsdWVJZCkge1xuICAgICAgY29udGludWVcbiAgICB9XG4gICAgdmFyIHIwID0gcmVkW3JlZFB0citheGlzXVxuICAgIHZhciByMSA9IHJlZFtyZWRQdHIrYXhpcytkXVxuICAgIGlmKGJsdWVYIDwgcjAgfHwgcjEgPCBibHVlWCkge1xuICAgICAgY29udGludWVcbiAgICB9XG4gICAgZm9yKHZhciBqPWF4aXMrMTsgajxkOyArK2opIHtcbiAgICAgIHZhciByMCA9IHJlZFtyZWRQdHIral1cbiAgICAgIHZhciByMSA9IHJlZFtyZWRQdHIraitkXVxuICAgICAgdmFyIGIwID0gYmx1ZVtibHVlUHRyK2pdXG4gICAgICB2YXIgYjEgPSBibHVlW2JsdWVQdHIraitkXVxuICAgICAgaWYocjEgPCBiMCB8fCBiMSA8IHIwKSB7XG4gICAgICAgIGNvbnRpbnVlIHJlZF9sb29wXG4gICAgICB9XG4gICAgfVxuICAgIHZhciByZXR2YWwgPSB2aXNpdChyZWRJZCwgYmx1ZUlkKVxuICAgIGlmKHJldHZhbCAhPT0gdm9pZCAwKSB7XG4gICAgICByZXR1cm4gcmV0dmFsXG4gICAgfVxuICB9XG59XG5cbi8vVGhlIG1haW4gYm94IGludGVyc2VjdGlvbiByb3V0aW5lXG5mdW5jdGlvbiBib3hJbnRlcnNlY3RJdGVyKFxuICBkLCB2aXNpdCwgaW5pdEZ1bGwsXG4gIHhTaXplLCB4Qm94ZXMsIHhJbmRleCxcbiAgeVNpemUsIHlCb3hlcywgeUluZGV4KSB7XG5cbiAgLy9SZXNlcnZlIG1lbW9yeSBmb3Igc3RhY2tcbiAgaXRlckluaXQoZCwgeFNpemUgKyB5U2l6ZSlcblxuICB2YXIgdG9wICA9IDBcbiAgdmFyIGVsZW1TaXplID0gMiAqIGRcbiAgdmFyIHJldHZhbFxuXG4gIGl0ZXJQdXNoKHRvcCsrLFxuICAgICAgMCxcbiAgICAgIDAsIHhTaXplLFxuICAgICAgMCwgeVNpemUsXG4gICAgICBpbml0RnVsbCA/IDE2IDogMCwgXG4gICAgICAtSW5maW5pdHksIEluZmluaXR5KVxuICBpZighaW5pdEZ1bGwpIHtcbiAgICBpdGVyUHVzaCh0b3ArKyxcbiAgICAgIDAsXG4gICAgICAwLCB5U2l6ZSxcbiAgICAgIDAsIHhTaXplLFxuICAgICAgMSwgXG4gICAgICAtSW5maW5pdHksIEluZmluaXR5KVxuICB9XG5cbiAgd2hpbGUodG9wID4gMCkge1xuICAgIHRvcCAgLT0gMVxuXG4gICAgdmFyIGlwdHIgPSB0b3AgKiBJRlJBTUVfU0laRVxuICAgIHZhciBheGlzICAgICAgPSBCT1hfSVNUQUNLW2lwdHJdXG4gICAgdmFyIHJlZFN0YXJ0ICA9IEJPWF9JU1RBQ0tbaXB0cisxXVxuICAgIHZhciByZWRFbmQgICAgPSBCT1hfSVNUQUNLW2lwdHIrMl1cbiAgICB2YXIgYmx1ZVN0YXJ0ID0gQk9YX0lTVEFDS1tpcHRyKzNdXG4gICAgdmFyIGJsdWVFbmQgICA9IEJPWF9JU1RBQ0tbaXB0cis0XVxuICAgIHZhciBzdGF0ZSAgICAgPSBCT1hfSVNUQUNLW2lwdHIrNV1cblxuICAgIHZhciBkcHRyID0gdG9wICogREZSQU1FX1NJWkVcbiAgICB2YXIgbG8gICAgICAgID0gQk9YX0RTVEFDS1tkcHRyXVxuICAgIHZhciBoaSAgICAgICAgPSBCT1hfRFNUQUNLW2RwdHIrMV1cblxuICAgIC8vVW5wYWNrIHN0YXRlIGluZm9cbiAgICB2YXIgZmxpcCAgICAgID0gKHN0YXRlICYgMSlcbiAgICB2YXIgZnVsbCAgICAgID0gISEoc3RhdGUgJiAxNilcblxuICAgIC8vVW5wYWNrIGluZGljZXNcbiAgICB2YXIgcmVkICAgICAgID0geEJveGVzXG4gICAgdmFyIHJlZEluZGV4ICA9IHhJbmRleFxuICAgIHZhciBibHVlICAgICAgPSB5Qm94ZXNcbiAgICB2YXIgYmx1ZUluZGV4ID0geUluZGV4XG4gICAgaWYoZmxpcCkge1xuICAgICAgcmVkICAgICAgICAgPSB5Qm94ZXNcbiAgICAgIHJlZEluZGV4ICAgID0geUluZGV4XG4gICAgICBibHVlICAgICAgICA9IHhCb3hlc1xuICAgICAgYmx1ZUluZGV4ICAgPSB4SW5kZXhcbiAgICB9XG5cbiAgICBpZihzdGF0ZSAmIDIpIHtcbiAgICAgIHJlZEVuZCA9IHBhcnRpdGlvblN0YXJ0TGVzc1RoYW4oXG4gICAgICAgIGQsIGF4aXMsXG4gICAgICAgIHJlZFN0YXJ0LCByZWRFbmQsIHJlZCwgcmVkSW5kZXgsXG4gICAgICAgIGhpKVxuICAgICAgaWYocmVkU3RhcnQgPj0gcmVkRW5kKSB7XG4gICAgICAgIGNvbnRpbnVlXG4gICAgICB9XG4gICAgfVxuICAgIGlmKHN0YXRlICYgNCkge1xuICAgICAgcmVkU3RhcnQgPSBwYXJ0aXRpb25FbmRMZXNzVGhhbkVxdWFsKFxuICAgICAgICBkLCBheGlzLFxuICAgICAgICByZWRTdGFydCwgcmVkRW5kLCByZWQsIHJlZEluZGV4LFxuICAgICAgICBsbylcbiAgICAgIGlmKHJlZFN0YXJ0ID49IHJlZEVuZCkge1xuICAgICAgICBjb250aW51ZVxuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICB2YXIgcmVkQ291bnQgID0gcmVkRW5kICAtIHJlZFN0YXJ0XG4gICAgdmFyIGJsdWVDb3VudCA9IGJsdWVFbmQgLSBibHVlU3RhcnRcblxuICAgIGlmKGZ1bGwpIHtcbiAgICAgIGlmKGQgKiByZWRDb3VudCAqIChyZWRDb3VudCArIGJsdWVDb3VudCkgPCBTQ0FOX0NPTVBMRVRFX0NVVE9GRikge1xuICAgICAgICByZXR2YWwgPSBzd2VlcC5zY2FuQ29tcGxldGUoXG4gICAgICAgICAgZCwgYXhpcywgdmlzaXQsIFxuICAgICAgICAgIHJlZFN0YXJ0LCByZWRFbmQsIHJlZCwgcmVkSW5kZXgsXG4gICAgICAgICAgYmx1ZVN0YXJ0LCBibHVlRW5kLCBibHVlLCBibHVlSW5kZXgpXG4gICAgICAgIGlmKHJldHZhbCAhPT0gdm9pZCAwKSB7XG4gICAgICAgICAgcmV0dXJuIHJldHZhbFxuICAgICAgICB9XG4gICAgICAgIGNvbnRpbnVlXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmKGQgKiBNYXRoLm1pbihyZWRDb3VudCwgYmx1ZUNvdW50KSA8IEJSVVRFX0ZPUkNFX0NVVE9GRikge1xuICAgICAgICAvL0lmIGlucHV0IHNtYWxsLCB0aGVuIHVzZSBicnV0ZSBmb3JjZVxuICAgICAgICByZXR2YWwgPSBicnV0ZUZvcmNlUGFydGlhbChcbiAgICAgICAgICAgIGQsIGF4aXMsIHZpc2l0LCBmbGlwLFxuICAgICAgICAgICAgcmVkU3RhcnQsICByZWRFbmQsICByZWQsICByZWRJbmRleCxcbiAgICAgICAgICAgIGJsdWVTdGFydCwgYmx1ZUVuZCwgYmx1ZSwgYmx1ZUluZGV4KVxuICAgICAgICBpZihyZXR2YWwgIT09IHZvaWQgMCkge1xuICAgICAgICAgIHJldHVybiByZXR2YWxcbiAgICAgICAgfVxuICAgICAgICBjb250aW51ZVxuICAgICAgfSBlbHNlIGlmKGQgKiByZWRDb3VudCAqIGJsdWVDb3VudCA8IFNDQU5fQ1VUT0ZGKSB7XG4gICAgICAgIC8vSWYgaW5wdXQgbWVkaXVtIHNpemVkLCB0aGVuIHVzZSBzd2VlcCBhbmQgcHJ1bmVcbiAgICAgICAgcmV0dmFsID0gc3dlZXAuc2NhbkJpcGFydGl0ZShcbiAgICAgICAgICBkLCBheGlzLCB2aXNpdCwgZmxpcCwgXG4gICAgICAgICAgcmVkU3RhcnQsIHJlZEVuZCwgcmVkLCByZWRJbmRleCxcbiAgICAgICAgICBibHVlU3RhcnQsIGJsdWVFbmQsIGJsdWUsIGJsdWVJbmRleClcbiAgICAgICAgaWYocmV0dmFsICE9PSB2b2lkIDApIHtcbiAgICAgICAgICByZXR1cm4gcmV0dmFsXG4gICAgICAgIH1cbiAgICAgICAgY29udGludWVcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgLy9GaXJzdCwgZmluZCBhbGwgcmVkIGludGVydmFscyB3aG9zZSBpbnRlcmlvciBjb250YWlucyAobG8saGkpXG4gICAgdmFyIHJlZDAgPSBwYXJ0aXRpb25JbnRlcmlvckNvbnRhaW5zSW50ZXJ2YWwoXG4gICAgICBkLCBheGlzLCBcbiAgICAgIHJlZFN0YXJ0LCByZWRFbmQsIHJlZCwgcmVkSW5kZXgsXG4gICAgICBsbywgaGkpXG5cbiAgICAvL0xvd2VyIGRpbWVuc2lvbmFsIGNhc2VcbiAgICBpZihyZWRTdGFydCA8IHJlZDApIHtcblxuICAgICAgaWYoZCAqIChyZWQwIC0gcmVkU3RhcnQpIDwgQlJVVEVfRk9SQ0VfQ1VUT0ZGKSB7XG4gICAgICAgIC8vU3BlY2lhbCBjYXNlIGZvciBzbWFsbCBpbnB1dHM6IHVzZSBicnV0ZSBmb3JjZVxuICAgICAgICByZXR2YWwgPSBicnV0ZUZvcmNlRnVsbChcbiAgICAgICAgICBkLCBheGlzKzEsIHZpc2l0LFxuICAgICAgICAgIHJlZFN0YXJ0LCByZWQwLCByZWQsIHJlZEluZGV4LFxuICAgICAgICAgIGJsdWVTdGFydCwgYmx1ZUVuZCwgYmx1ZSwgYmx1ZUluZGV4KVxuICAgICAgICBpZihyZXR2YWwgIT09IHZvaWQgMCkge1xuICAgICAgICAgIHJldHVybiByZXR2YWxcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmKGF4aXMgPT09IGQtMikge1xuICAgICAgICBpZihmbGlwKSB7XG4gICAgICAgICAgcmV0dmFsID0gc3dlZXAuc3dlZXBCaXBhcnRpdGUoXG4gICAgICAgICAgICBkLCB2aXNpdCxcbiAgICAgICAgICAgIGJsdWVTdGFydCwgYmx1ZUVuZCwgYmx1ZSwgYmx1ZUluZGV4LFxuICAgICAgICAgICAgcmVkU3RhcnQsIHJlZDAsIHJlZCwgcmVkSW5kZXgpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dmFsID0gc3dlZXAuc3dlZXBCaXBhcnRpdGUoXG4gICAgICAgICAgICBkLCB2aXNpdCxcbiAgICAgICAgICAgIHJlZFN0YXJ0LCByZWQwLCByZWQsIHJlZEluZGV4LFxuICAgICAgICAgICAgYmx1ZVN0YXJ0LCBibHVlRW5kLCBibHVlLCBibHVlSW5kZXgpXG4gICAgICAgIH1cbiAgICAgICAgaWYocmV0dmFsICE9PSB2b2lkIDApIHtcbiAgICAgICAgICByZXR1cm4gcmV0dmFsXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGl0ZXJQdXNoKHRvcCsrLFxuICAgICAgICAgIGF4aXMrMSxcbiAgICAgICAgICByZWRTdGFydCwgcmVkMCxcbiAgICAgICAgICBibHVlU3RhcnQsIGJsdWVFbmQsXG4gICAgICAgICAgZmxpcCxcbiAgICAgICAgICAtSW5maW5pdHksIEluZmluaXR5KVxuICAgICAgICBpdGVyUHVzaCh0b3ArKyxcbiAgICAgICAgICBheGlzKzEsXG4gICAgICAgICAgYmx1ZVN0YXJ0LCBibHVlRW5kLFxuICAgICAgICAgIHJlZFN0YXJ0LCByZWQwLFxuICAgICAgICAgIGZsaXBeMSxcbiAgICAgICAgICAtSW5maW5pdHksIEluZmluaXR5KVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vRGl2aWRlIGFuZCBjb25xdWVyIHBoYXNlXG4gICAgaWYocmVkMCA8IHJlZEVuZCkge1xuXG4gICAgICAvL0N1dCBibHVlIGludG8gMyBwYXJ0czpcbiAgICAgIC8vXG4gICAgICAvLyAgUG9pbnRzIDwgbWlkIHBvaW50XG4gICAgICAvLyAgUG9pbnRzID0gbWlkIHBvaW50XG4gICAgICAvLyAgUG9pbnRzID4gbWlkIHBvaW50XG4gICAgICAvL1xuICAgICAgdmFyIGJsdWUwID0gZmluZE1lZGlhbihcbiAgICAgICAgZCwgYXhpcywgXG4gICAgICAgIGJsdWVTdGFydCwgYmx1ZUVuZCwgYmx1ZSwgYmx1ZUluZGV4KVxuICAgICAgdmFyIG1pZCA9IGJsdWVbZWxlbVNpemUgKiBibHVlMCArIGF4aXNdXG4gICAgICB2YXIgYmx1ZTEgPSBwYXJ0aXRpb25TdGFydEVxdWFsKFxuICAgICAgICBkLCBheGlzLFxuICAgICAgICBibHVlMCwgYmx1ZUVuZCwgYmx1ZSwgYmx1ZUluZGV4LFxuICAgICAgICBtaWQpXG5cbiAgICAgIC8vUmlnaHQgY2FzZVxuICAgICAgaWYoYmx1ZTEgPCBibHVlRW5kKSB7XG4gICAgICAgIGl0ZXJQdXNoKHRvcCsrLFxuICAgICAgICAgIGF4aXMsXG4gICAgICAgICAgcmVkMCwgcmVkRW5kLFxuICAgICAgICAgIGJsdWUxLCBibHVlRW5kLFxuICAgICAgICAgIChmbGlwfDQpICsgKGZ1bGwgPyAxNiA6IDApLFxuICAgICAgICAgIG1pZCwgaGkpXG4gICAgICB9XG5cbiAgICAgIC8vTGVmdCBjYXNlXG4gICAgICBpZihibHVlU3RhcnQgPCBibHVlMCkge1xuICAgICAgICBpdGVyUHVzaCh0b3ArKyxcbiAgICAgICAgICBheGlzLFxuICAgICAgICAgIHJlZDAsIHJlZEVuZCxcbiAgICAgICAgICBibHVlU3RhcnQsIGJsdWUwLFxuICAgICAgICAgIChmbGlwfDIpICsgKGZ1bGwgPyAxNiA6IDApLFxuICAgICAgICAgIGxvLCBtaWQpXG4gICAgICB9XG5cbiAgICAgIC8vQ2VudGVyIGNhc2UgKHRoZSBoYXJkIHBhcnQpXG4gICAgICBpZihibHVlMCArIDEgPT09IGJsdWUxKSB7XG4gICAgICAgIC8vT3B0aW1pemF0aW9uOiBSYW5nZSB3aXRoIGV4YWN0bHkgMSBwb2ludCwgdXNlIGEgYnJ1dGUgZm9yY2Ugc2NhblxuICAgICAgICBpZihmdWxsKSB7XG4gICAgICAgICAgcmV0dmFsID0gb25lUG9pbnRGdWxsKFxuICAgICAgICAgICAgZCwgYXhpcywgdmlzaXQsXG4gICAgICAgICAgICByZWQwLCByZWRFbmQsIHJlZCwgcmVkSW5kZXgsXG4gICAgICAgICAgICBibHVlMCwgYmx1ZSwgYmx1ZUluZGV4W2JsdWUwXSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR2YWwgPSBvbmVQb2ludFBhcnRpYWwoXG4gICAgICAgICAgICBkLCBheGlzLCB2aXNpdCwgZmxpcCxcbiAgICAgICAgICAgIHJlZDAsIHJlZEVuZCwgcmVkLCByZWRJbmRleCxcbiAgICAgICAgICAgIGJsdWUwLCBibHVlLCBibHVlSW5kZXhbYmx1ZTBdKVxuICAgICAgICB9XG4gICAgICAgIGlmKHJldHZhbCAhPT0gdm9pZCAwKSB7XG4gICAgICAgICAgcmV0dXJuIHJldHZhbFxuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYoYmx1ZTAgPCBibHVlMSkge1xuICAgICAgICB2YXIgcmVkMVxuICAgICAgICBpZihmdWxsKSB7XG4gICAgICAgICAgLy9JZiBmdWxsIGludGVyc2VjdGlvbiwgbmVlZCB0byBoYW5kbGUgc3BlY2lhbCBjYXNlXG4gICAgICAgICAgcmVkMSA9IHBhcnRpdGlvbkNvbnRhaW5zUG9pbnQoXG4gICAgICAgICAgICBkLCBheGlzLFxuICAgICAgICAgICAgcmVkMCwgcmVkRW5kLCByZWQsIHJlZEluZGV4LFxuICAgICAgICAgICAgbWlkKVxuICAgICAgICAgIGlmKHJlZDAgPCByZWQxKSB7XG4gICAgICAgICAgICB2YXIgcmVkWCA9IHBhcnRpdGlvblN0YXJ0RXF1YWwoXG4gICAgICAgICAgICAgIGQsIGF4aXMsXG4gICAgICAgICAgICAgIHJlZDAsIHJlZDEsIHJlZCwgcmVkSW5kZXgsXG4gICAgICAgICAgICAgIG1pZClcbiAgICAgICAgICAgIGlmKGF4aXMgPT09IGQtMikge1xuICAgICAgICAgICAgICAvL0RlZ2VuZXJhdGUgc3dlZXAgaW50ZXJzZWN0aW9uOlxuICAgICAgICAgICAgICAvLyAgW3JlZDAsIHJlZFhdIHdpdGggW2JsdWUwLCBibHVlMV1cbiAgICAgICAgICAgICAgaWYocmVkMCA8IHJlZFgpIHtcbiAgICAgICAgICAgICAgICByZXR2YWwgPSBzd2VlcC5zd2VlcENvbXBsZXRlKFxuICAgICAgICAgICAgICAgICAgZCwgdmlzaXQsXG4gICAgICAgICAgICAgICAgICByZWQwLCByZWRYLCByZWQsIHJlZEluZGV4LFxuICAgICAgICAgICAgICAgICAgYmx1ZTAsIGJsdWUxLCBibHVlLCBibHVlSW5kZXgpXG4gICAgICAgICAgICAgICAgaWYocmV0dmFsICE9PSB2b2lkIDApIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiByZXR2YWxcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAvL05vcm1hbCBzd2VlcCBpbnRlcnNlY3Rpb246XG4gICAgICAgICAgICAgIC8vICBbcmVkWCwgcmVkMV0gd2l0aCBbYmx1ZTAsIGJsdWUxXVxuICAgICAgICAgICAgICBpZihyZWRYIDwgcmVkMSkge1xuICAgICAgICAgICAgICAgIHJldHZhbCA9IHN3ZWVwLnN3ZWVwQmlwYXJ0aXRlKFxuICAgICAgICAgICAgICAgICAgZCwgdmlzaXQsXG4gICAgICAgICAgICAgICAgICByZWRYLCByZWQxLCByZWQsIHJlZEluZGV4LFxuICAgICAgICAgICAgICAgICAgYmx1ZTAsIGJsdWUxLCBibHVlLCBibHVlSW5kZXgpXG4gICAgICAgICAgICAgICAgaWYocmV0dmFsICE9PSB2b2lkIDApIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiByZXR2YWxcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGlmKHJlZDAgPCByZWRYKSB7XG4gICAgICAgICAgICAgICAgaXRlclB1c2godG9wKyssXG4gICAgICAgICAgICAgICAgICBheGlzKzEsXG4gICAgICAgICAgICAgICAgICByZWQwLCByZWRYLFxuICAgICAgICAgICAgICAgICAgYmx1ZTAsIGJsdWUxLFxuICAgICAgICAgICAgICAgICAgMTYsXG4gICAgICAgICAgICAgICAgICAtSW5maW5pdHksIEluZmluaXR5KVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmKHJlZFggPCByZWQxKSB7XG4gICAgICAgICAgICAgICAgaXRlclB1c2godG9wKyssXG4gICAgICAgICAgICAgICAgICBheGlzKzEsXG4gICAgICAgICAgICAgICAgICByZWRYLCByZWQxLFxuICAgICAgICAgICAgICAgICAgYmx1ZTAsIGJsdWUxLFxuICAgICAgICAgICAgICAgICAgMCxcbiAgICAgICAgICAgICAgICAgIC1JbmZpbml0eSwgSW5maW5pdHkpXG4gICAgICAgICAgICAgICAgaXRlclB1c2godG9wKyssXG4gICAgICAgICAgICAgICAgICBheGlzKzEsXG4gICAgICAgICAgICAgICAgICBibHVlMCwgYmx1ZTEsXG4gICAgICAgICAgICAgICAgICByZWRYLCByZWQxLFxuICAgICAgICAgICAgICAgICAgMSxcbiAgICAgICAgICAgICAgICAgIC1JbmZpbml0eSwgSW5maW5pdHkpXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaWYoZmxpcCkge1xuICAgICAgICAgICAgcmVkMSA9IHBhcnRpdGlvbkNvbnRhaW5zUG9pbnRQcm9wZXIoXG4gICAgICAgICAgICAgIGQsIGF4aXMsXG4gICAgICAgICAgICAgIHJlZDAsIHJlZEVuZCwgcmVkLCByZWRJbmRleCxcbiAgICAgICAgICAgICAgbWlkKVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZWQxID0gcGFydGl0aW9uQ29udGFpbnNQb2ludChcbiAgICAgICAgICAgICAgZCwgYXhpcyxcbiAgICAgICAgICAgICAgcmVkMCwgcmVkRW5kLCByZWQsIHJlZEluZGV4LFxuICAgICAgICAgICAgICBtaWQpXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmKHJlZDAgPCByZWQxKSB7XG4gICAgICAgICAgICBpZihheGlzID09PSBkLTIpIHtcbiAgICAgICAgICAgICAgaWYoZmxpcCkge1xuICAgICAgICAgICAgICAgIHJldHZhbCA9IHN3ZWVwLnN3ZWVwQmlwYXJ0aXRlKFxuICAgICAgICAgICAgICAgICAgZCwgdmlzaXQsXG4gICAgICAgICAgICAgICAgICBibHVlMCwgYmx1ZTEsIGJsdWUsIGJsdWVJbmRleCxcbiAgICAgICAgICAgICAgICAgIHJlZDAsIHJlZDEsIHJlZCwgcmVkSW5kZXgpXG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dmFsID0gc3dlZXAuc3dlZXBCaXBhcnRpdGUoXG4gICAgICAgICAgICAgICAgICBkLCB2aXNpdCxcbiAgICAgICAgICAgICAgICAgIHJlZDAsIHJlZDEsIHJlZCwgcmVkSW5kZXgsXG4gICAgICAgICAgICAgICAgICBibHVlMCwgYmx1ZTEsIGJsdWUsIGJsdWVJbmRleClcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgaXRlclB1c2godG9wKyssXG4gICAgICAgICAgICAgICAgYXhpcysxLFxuICAgICAgICAgICAgICAgIHJlZDAsIHJlZDEsXG4gICAgICAgICAgICAgICAgYmx1ZTAsIGJsdWUxLFxuICAgICAgICAgICAgICAgIGZsaXAsXG4gICAgICAgICAgICAgICAgLUluZmluaXR5LCBJbmZpbml0eSlcbiAgICAgICAgICAgICAgaXRlclB1c2godG9wKyssXG4gICAgICAgICAgICAgICAgYXhpcysxLFxuICAgICAgICAgICAgICAgIGJsdWUwLCBibHVlMSxcbiAgICAgICAgICAgICAgICByZWQwLCByZWQxLFxuICAgICAgICAgICAgICAgIGZsaXBeMSxcbiAgICAgICAgICAgICAgICAtSW5maW5pdHksIEluZmluaXR5KVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxufSIsIid1c2Ugc3RyaWN0J1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZpbmRNZWRpYW5cblxudmFyIGdlblBhcnRpdGlvbiA9IHJlcXVpcmUoJy4vcGFydGl0aW9uJylcblxudmFyIHBhcnRpdGlvblN0YXJ0TGVzc1RoYW4gPSBnZW5QYXJ0aXRpb24oJ2xvPHAwJywgWydwMCddKVxuXG52YXIgUEFSVElUSU9OX1RIUkVTSE9MRCA9IDggICAvL0N1dCBvZmYgZm9yIHVzaW5nIGluc2VydGlvbiBzb3J0IGluIGZpbmRNZWRpYW5cblxuLy9CYXNlIGNhc2UgZm9yIG1lZGlhbiBmaW5kaW5nOiAgVXNlIGluc2VydGlvbiBzb3J0XG5mdW5jdGlvbiBpbnNlcnRpb25Tb3J0KGQsIGF4aXMsIHN0YXJ0LCBlbmQsIGJveGVzLCBpZHMpIHtcbiAgdmFyIGVsZW1TaXplID0gMiAqIGRcbiAgdmFyIGJveFB0ciA9IGVsZW1TaXplICogKHN0YXJ0KzEpICsgYXhpc1xuICBmb3IodmFyIGk9c3RhcnQrMTsgaTxlbmQ7ICsraSwgYm94UHRyKz1lbGVtU2l6ZSkge1xuICAgIHZhciB4ID0gYm94ZXNbYm94UHRyXVxuICAgIGZvcih2YXIgaj1pLCBwdHI9ZWxlbVNpemUqKGktMSk7IFxuICAgICAgICBqPnN0YXJ0ICYmIGJveGVzW3B0citheGlzXSA+IHg7IFxuICAgICAgICAtLWosIHB0ci09ZWxlbVNpemUpIHtcbiAgICAgIC8vU3dhcFxuICAgICAgdmFyIGFQdHIgPSBwdHJcbiAgICAgIHZhciBiUHRyID0gcHRyK2VsZW1TaXplXG4gICAgICBmb3IodmFyIGs9MDsgazxlbGVtU2l6ZTsgKytrLCArK2FQdHIsICsrYlB0cikge1xuICAgICAgICB2YXIgeSA9IGJveGVzW2FQdHJdXG4gICAgICAgIGJveGVzW2FQdHJdID0gYm94ZXNbYlB0cl1cbiAgICAgICAgYm94ZXNbYlB0cl0gPSB5XG4gICAgICB9XG4gICAgICB2YXIgdG1wID0gaWRzW2pdXG4gICAgICBpZHNbal0gPSBpZHNbai0xXVxuICAgICAgaWRzW2otMV0gPSB0bXBcbiAgICB9XG4gIH1cbn1cblxuLy9GaW5kIG1lZGlhbiB1c2luZyBxdWljayBzZWxlY3QgYWxnb3JpdGhtXG4vLyAgdGFrZXMgTyhuKSB0aW1lIHdpdGggaGlnaCBwcm9iYWJpbGl0eVxuZnVuY3Rpb24gZmluZE1lZGlhbihkLCBheGlzLCBzdGFydCwgZW5kLCBib3hlcywgaWRzKSB7XG4gIGlmKGVuZCA8PSBzdGFydCsxKSB7XG4gICAgcmV0dXJuIHN0YXJ0XG4gIH1cblxuICB2YXIgbG8gICAgICAgPSBzdGFydFxuICB2YXIgaGkgICAgICAgPSBlbmRcbiAgdmFyIG1pZCAgICAgID0gKChlbmQgKyBzdGFydCkgPj4+IDEpXG4gIHZhciBlbGVtU2l6ZSA9IDIqZFxuICB2YXIgcGl2b3QgICAgPSBtaWRcbiAgdmFyIHZhbHVlICAgID0gYm94ZXNbZWxlbVNpemUqbWlkK2F4aXNdXG4gIFxuICB3aGlsZShsbyA8IGhpKSB7XG4gICAgaWYoaGkgLSBsbyA8IFBBUlRJVElPTl9USFJFU0hPTEQpIHtcbiAgICAgIGluc2VydGlvblNvcnQoZCwgYXhpcywgbG8sIGhpLCBib3hlcywgaWRzKVxuICAgICAgdmFsdWUgPSBib3hlc1tlbGVtU2l6ZSptaWQrYXhpc11cbiAgICAgIGJyZWFrXG4gICAgfVxuICAgIFxuICAgIC8vU2VsZWN0IHBpdm90IHVzaW5nIG1lZGlhbi1vZi0zXG4gICAgdmFyIGNvdW50ICA9IGhpIC0gbG9cbiAgICB2YXIgcGl2b3QwID0gKE1hdGgucmFuZG9tKCkqY291bnQrbG8pfDBcbiAgICB2YXIgdmFsdWUwID0gYm94ZXNbZWxlbVNpemUqcGl2b3QwICsgYXhpc11cbiAgICB2YXIgcGl2b3QxID0gKE1hdGgucmFuZG9tKCkqY291bnQrbG8pfDBcbiAgICB2YXIgdmFsdWUxID0gYm94ZXNbZWxlbVNpemUqcGl2b3QxICsgYXhpc11cbiAgICB2YXIgcGl2b3QyID0gKE1hdGgucmFuZG9tKCkqY291bnQrbG8pfDBcbiAgICB2YXIgdmFsdWUyID0gYm94ZXNbZWxlbVNpemUqcGl2b3QyICsgYXhpc11cbiAgICBpZih2YWx1ZTAgPD0gdmFsdWUxKSB7XG4gICAgICBpZih2YWx1ZTIgPj0gdmFsdWUxKSB7XG4gICAgICAgIHBpdm90ID0gcGl2b3QxXG4gICAgICAgIHZhbHVlID0gdmFsdWUxXG4gICAgICB9IGVsc2UgaWYodmFsdWUwID49IHZhbHVlMikge1xuICAgICAgICBwaXZvdCA9IHBpdm90MFxuICAgICAgICB2YWx1ZSA9IHZhbHVlMFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGl2b3QgPSBwaXZvdDJcbiAgICAgICAgdmFsdWUgPSB2YWx1ZTJcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgaWYodmFsdWUxID49IHZhbHVlMikge1xuICAgICAgICBwaXZvdCA9IHBpdm90MVxuICAgICAgICB2YWx1ZSA9IHZhbHVlMVxuICAgICAgfSBlbHNlIGlmKHZhbHVlMiA+PSB2YWx1ZTApIHtcbiAgICAgICAgcGl2b3QgPSBwaXZvdDBcbiAgICAgICAgdmFsdWUgPSB2YWx1ZTBcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBpdm90ID0gcGl2b3QyXG4gICAgICAgIHZhbHVlID0gdmFsdWUyXG4gICAgICB9XG4gICAgfVxuXG4gICAgLy9Td2FwIHBpdm90IHRvIGVuZCBvZiBhcnJheVxuICAgIHZhciBhUHRyID0gZWxlbVNpemUgKiAoaGktMSlcbiAgICB2YXIgYlB0ciA9IGVsZW1TaXplICogcGl2b3RcbiAgICBmb3IodmFyIGk9MDsgaTxlbGVtU2l6ZTsgKytpLCArK2FQdHIsICsrYlB0cikge1xuICAgICAgdmFyIHggPSBib3hlc1thUHRyXVxuICAgICAgYm94ZXNbYVB0cl0gPSBib3hlc1tiUHRyXVxuICAgICAgYm94ZXNbYlB0cl0gPSB4XG4gICAgfVxuICAgIHZhciB5ID0gaWRzW2hpLTFdXG4gICAgaWRzW2hpLTFdID0gaWRzW3Bpdm90XVxuICAgIGlkc1twaXZvdF0gPSB5XG5cbiAgICAvL1BhcnRpdGlvbiB1c2luZyBwaXZvdFxuICAgIHBpdm90ID0gcGFydGl0aW9uU3RhcnRMZXNzVGhhbihcbiAgICAgIGQsIGF4aXMsIFxuICAgICAgbG8sIGhpLTEsIGJveGVzLCBpZHMsXG4gICAgICB2YWx1ZSlcblxuICAgIC8vU3dhcCBwaXZvdCBiYWNrXG4gICAgdmFyIGFQdHIgPSBlbGVtU2l6ZSAqIChoaS0xKVxuICAgIHZhciBiUHRyID0gZWxlbVNpemUgKiBwaXZvdFxuICAgIGZvcih2YXIgaT0wOyBpPGVsZW1TaXplOyArK2ksICsrYVB0ciwgKytiUHRyKSB7XG4gICAgICB2YXIgeCA9IGJveGVzW2FQdHJdXG4gICAgICBib3hlc1thUHRyXSA9IGJveGVzW2JQdHJdXG4gICAgICBib3hlc1tiUHRyXSA9IHhcbiAgICB9XG4gICAgdmFyIHkgPSBpZHNbaGktMV1cbiAgICBpZHNbaGktMV0gPSBpZHNbcGl2b3RdXG4gICAgaWRzW3Bpdm90XSA9IHlcblxuICAgIC8vU3dhcCBwaXZvdCB0byBsYXN0IHBpdm90XG4gICAgaWYobWlkIDwgcGl2b3QpIHtcbiAgICAgIGhpID0gcGl2b3QtMVxuICAgICAgd2hpbGUobG8gPCBoaSAmJiBcbiAgICAgICAgYm94ZXNbZWxlbVNpemUqKGhpLTEpK2F4aXNdID09PSB2YWx1ZSkge1xuICAgICAgICBoaSAtPSAxXG4gICAgICB9XG4gICAgICBoaSArPSAxXG4gICAgfSBlbHNlIGlmKHBpdm90IDwgbWlkKSB7XG4gICAgICBsbyA9IHBpdm90ICsgMVxuICAgICAgd2hpbGUobG8gPCBoaSAmJlxuICAgICAgICBib3hlc1tlbGVtU2l6ZSpsbytheGlzXSA9PT0gdmFsdWUpIHtcbiAgICAgICAgbG8gKz0gMVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBicmVha1xuICAgIH1cbiAgfVxuXG4gIC8vTWFrZSBzdXJlIHBpdm90IGlzIGF0IHN0YXJ0XG4gIHJldHVybiBwYXJ0aXRpb25TdGFydExlc3NUaGFuKFxuICAgIGQsIGF4aXMsIFxuICAgIHN0YXJ0LCBtaWQsIGJveGVzLCBpZHMsXG4gICAgYm94ZXNbZWxlbVNpemUqbWlkK2F4aXNdKVxufSIsIid1c2Ugc3RyaWN0J1xuXG5tb2R1bGUuZXhwb3J0cyA9IGdlblBhcnRpdGlvblxuXG52YXIgY29kZSA9ICdmb3IodmFyIGo9MiphLGs9aipjLGw9ayxtPWMsbj1iLG89YStiLHA9YztkPnA7KytwLGsrPWope3ZhciBfO2lmKCQpaWYobT09PXApbSs9MSxsKz1qO2Vsc2V7Zm9yKHZhciBzPTA7aj5zOysrcyl7dmFyIHQ9ZVtrK3NdO2VbaytzXT1lW2xdLGVbbCsrXT10fXZhciB1PWZbcF07ZltwXT1mW21dLGZbbSsrXT11fX1yZXR1cm4gbSdcblxuZnVuY3Rpb24gZ2VuUGFydGl0aW9uKHByZWRpY2F0ZSwgYXJncykge1xuICB2YXIgZmFyZ3MgPSdhYmNkZWYnLnNwbGl0KCcnKS5jb25jYXQoYXJncylcbiAgdmFyIHJlYWRzID0gW11cbiAgaWYocHJlZGljYXRlLmluZGV4T2YoJ2xvJykgPj0gMCkge1xuICAgIHJlYWRzLnB1c2goJ2xvPWVbaytuXScpXG4gIH1cbiAgaWYocHJlZGljYXRlLmluZGV4T2YoJ2hpJykgPj0gMCkge1xuICAgIHJlYWRzLnB1c2goJ2hpPWVbaytvXScpXG4gIH1cbiAgZmFyZ3MucHVzaChcbiAgICBjb2RlLnJlcGxhY2UoJ18nLCByZWFkcy5qb2luKCkpXG4gICAgICAgIC5yZXBsYWNlKCckJywgcHJlZGljYXRlKSlcbiAgcmV0dXJuIEZ1bmN0aW9uLmFwcGx5KHZvaWQgMCwgZmFyZ3MpXG59IiwiJ3VzZSBzdHJpY3QnO1xuXG4vL1RoaXMgY29kZSBpcyBleHRyYWN0ZWQgZnJvbSBuZGFycmF5LXNvcnRcbi8vSXQgaXMgaW5saW5lZCBoZXJlIGFzIGEgdGVtcG9yYXJ5IHdvcmthcm91bmRcblxubW9kdWxlLmV4cG9ydHMgPSB3cmFwcGVyO1xuXG52YXIgSU5TRVJUX1NPUlRfQ1VUT0ZGID0gMzJcblxuZnVuY3Rpb24gd3JhcHBlcihkYXRhLCBuMCkge1xuICBpZiAobjAgPD0gNCpJTlNFUlRfU09SVF9DVVRPRkYpIHtcbiAgICBpbnNlcnRpb25Tb3J0KDAsIG4wIC0gMSwgZGF0YSk7XG4gIH0gZWxzZSB7XG4gICAgcXVpY2tTb3J0KDAsIG4wIC0gMSwgZGF0YSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gaW5zZXJ0aW9uU29ydChsZWZ0LCByaWdodCwgZGF0YSkge1xuICB2YXIgcHRyID0gMioobGVmdCsxKVxuICBmb3IodmFyIGk9bGVmdCsxOyBpPD1yaWdodDsgKytpKSB7XG4gICAgdmFyIGEgPSBkYXRhW3B0cisrXVxuICAgIHZhciBiID0gZGF0YVtwdHIrK11cbiAgICB2YXIgaiA9IGlcbiAgICB2YXIganB0ciA9IHB0ci0yXG4gICAgd2hpbGUoai0tID4gbGVmdCkge1xuICAgICAgdmFyIHggPSBkYXRhW2pwdHItMl1cbiAgICAgIHZhciB5ID0gZGF0YVtqcHRyLTFdXG4gICAgICBpZih4IDwgYSkge1xuICAgICAgICBicmVha1xuICAgICAgfSBlbHNlIGlmKHggPT09IGEgJiYgeSA8IGIpIHtcbiAgICAgICAgYnJlYWtcbiAgICAgIH1cbiAgICAgIGRhdGFbanB0cl0gICA9IHhcbiAgICAgIGRhdGFbanB0cisxXSA9IHlcbiAgICAgIGpwdHIgLT0gMlxuICAgIH1cbiAgICBkYXRhW2pwdHJdICAgPSBhXG4gICAgZGF0YVtqcHRyKzFdID0gYlxuICB9XG59XG5cbmZ1bmN0aW9uIHN3YXAoaSwgaiwgZGF0YSkge1xuICBpICo9IDJcbiAgaiAqPSAyXG4gIHZhciB4ID0gZGF0YVtpXVxuICB2YXIgeSA9IGRhdGFbaSsxXVxuICBkYXRhW2ldID0gZGF0YVtqXVxuICBkYXRhW2krMV0gPSBkYXRhW2orMV1cbiAgZGF0YVtqXSA9IHhcbiAgZGF0YVtqKzFdID0geVxufVxuXG5mdW5jdGlvbiBtb3ZlKGksIGosIGRhdGEpIHtcbiAgaSAqPSAyXG4gIGogKj0gMlxuICBkYXRhW2ldID0gZGF0YVtqXVxuICBkYXRhW2krMV0gPSBkYXRhW2orMV1cbn1cblxuZnVuY3Rpb24gcm90YXRlKGksIGosIGssIGRhdGEpIHtcbiAgaSAqPSAyXG4gIGogKj0gMlxuICBrICo9IDJcbiAgdmFyIHggPSBkYXRhW2ldXG4gIHZhciB5ID0gZGF0YVtpKzFdXG4gIGRhdGFbaV0gPSBkYXRhW2pdXG4gIGRhdGFbaSsxXSA9IGRhdGFbaisxXVxuICBkYXRhW2pdID0gZGF0YVtrXVxuICBkYXRhW2orMV0gPSBkYXRhW2srMV1cbiAgZGF0YVtrXSA9IHhcbiAgZGF0YVtrKzFdID0geVxufVxuXG5mdW5jdGlvbiBzaHVmZmxlUGl2b3QoaSwgaiwgcHgsIHB5LCBkYXRhKSB7XG4gIGkgKj0gMlxuICBqICo9IDJcbiAgZGF0YVtpXSA9IGRhdGFbal1cbiAgZGF0YVtqXSA9IHB4XG4gIGRhdGFbaSsxXSA9IGRhdGFbaisxXVxuICBkYXRhW2orMV0gPSBweVxufVxuXG5mdW5jdGlvbiBjb21wYXJlKGksIGosIGRhdGEpIHtcbiAgaSAqPSAyXG4gIGogKj0gMlxuICB2YXIgeCA9IGRhdGFbaV0sXG4gICAgICB5ID0gZGF0YVtqXVxuICBpZih4IDwgeSkge1xuICAgIHJldHVybiBmYWxzZVxuICB9IGVsc2UgaWYoeCA9PT0geSkge1xuICAgIHJldHVybiBkYXRhW2krMV0gPiBkYXRhW2orMV1cbiAgfVxuICByZXR1cm4gdHJ1ZVxufVxuXG5mdW5jdGlvbiBjb21wYXJlUGl2b3QoaSwgeSwgYiwgZGF0YSkge1xuICBpICo9IDJcbiAgdmFyIHggPSBkYXRhW2ldXG4gIGlmKHggPCB5KSB7XG4gICAgcmV0dXJuIHRydWVcbiAgfSBlbHNlIGlmKHggPT09IHkpIHtcbiAgICByZXR1cm4gZGF0YVtpKzFdIDwgYlxuICB9XG4gIHJldHVybiBmYWxzZVxufVxuXG5mdW5jdGlvbiBxdWlja1NvcnQobGVmdCwgcmlnaHQsIGRhdGEpIHtcbiAgdmFyIHNpeHRoID0gKHJpZ2h0IC0gbGVmdCArIDEpIC8gNiB8IDAsIFxuICAgICAgaW5kZXgxID0gbGVmdCArIHNpeHRoLCBcbiAgICAgIGluZGV4NSA9IHJpZ2h0IC0gc2l4dGgsIFxuICAgICAgaW5kZXgzID0gbGVmdCArIHJpZ2h0ID4+IDEsIFxuICAgICAgaW5kZXgyID0gaW5kZXgzIC0gc2l4dGgsIFxuICAgICAgaW5kZXg0ID0gaW5kZXgzICsgc2l4dGgsIFxuICAgICAgZWwxID0gaW5kZXgxLCBcbiAgICAgIGVsMiA9IGluZGV4MiwgXG4gICAgICBlbDMgPSBpbmRleDMsIFxuICAgICAgZWw0ID0gaW5kZXg0LCBcbiAgICAgIGVsNSA9IGluZGV4NSwgXG4gICAgICBsZXNzID0gbGVmdCArIDEsIFxuICAgICAgZ3JlYXQgPSByaWdodCAtIDEsIFxuICAgICAgdG1wID0gMFxuICBpZihjb21wYXJlKGVsMSwgZWwyLCBkYXRhKSkge1xuICAgIHRtcCA9IGVsMVxuICAgIGVsMSA9IGVsMlxuICAgIGVsMiA9IHRtcFxuICB9XG4gIGlmKGNvbXBhcmUoZWw0LCBlbDUsIGRhdGEpKSB7XG4gICAgdG1wID0gZWw0XG4gICAgZWw0ID0gZWw1XG4gICAgZWw1ID0gdG1wXG4gIH1cbiAgaWYoY29tcGFyZShlbDEsIGVsMywgZGF0YSkpIHtcbiAgICB0bXAgPSBlbDFcbiAgICBlbDEgPSBlbDNcbiAgICBlbDMgPSB0bXBcbiAgfVxuICBpZihjb21wYXJlKGVsMiwgZWwzLCBkYXRhKSkge1xuICAgIHRtcCA9IGVsMlxuICAgIGVsMiA9IGVsM1xuICAgIGVsMyA9IHRtcFxuICB9XG4gIGlmKGNvbXBhcmUoZWwxLCBlbDQsIGRhdGEpKSB7XG4gICAgdG1wID0gZWwxXG4gICAgZWwxID0gZWw0XG4gICAgZWw0ID0gdG1wXG4gIH1cbiAgaWYoY29tcGFyZShlbDMsIGVsNCwgZGF0YSkpIHtcbiAgICB0bXAgPSBlbDNcbiAgICBlbDMgPSBlbDRcbiAgICBlbDQgPSB0bXBcbiAgfVxuICBpZihjb21wYXJlKGVsMiwgZWw1LCBkYXRhKSkge1xuICAgIHRtcCA9IGVsMlxuICAgIGVsMiA9IGVsNVxuICAgIGVsNSA9IHRtcFxuICB9XG4gIGlmKGNvbXBhcmUoZWwyLCBlbDMsIGRhdGEpKSB7XG4gICAgdG1wID0gZWwyXG4gICAgZWwyID0gZWwzXG4gICAgZWwzID0gdG1wXG4gIH1cbiAgaWYoY29tcGFyZShlbDQsIGVsNSwgZGF0YSkpIHtcbiAgICB0bXAgPSBlbDRcbiAgICBlbDQgPSBlbDVcbiAgICBlbDUgPSB0bXBcbiAgfVxuXG4gIHZhciBwaXZvdDFYID0gZGF0YVsyKmVsMl1cbiAgdmFyIHBpdm90MVkgPSBkYXRhWzIqZWwyKzFdXG4gIHZhciBwaXZvdDJYID0gZGF0YVsyKmVsNF1cbiAgdmFyIHBpdm90MlkgPSBkYXRhWzIqZWw0KzFdXG5cbiAgdmFyIHB0cjAgPSAyICogZWwxO1xuICB2YXIgcHRyMiA9IDIgKiBlbDM7XG4gIHZhciBwdHI0ID0gMiAqIGVsNTtcbiAgdmFyIHB0cjUgPSAyICogaW5kZXgxO1xuICB2YXIgcHRyNiA9IDIgKiBpbmRleDM7XG4gIHZhciBwdHI3ID0gMiAqIGluZGV4NTtcbiAgZm9yICh2YXIgaTEgPSAwOyBpMSA8IDI7ICsraTEpIHtcbiAgICB2YXIgeCA9IGRhdGFbcHRyMCtpMV07XG4gICAgdmFyIHkgPSBkYXRhW3B0cjIraTFdO1xuICAgIHZhciB6ID0gZGF0YVtwdHI0K2kxXTtcbiAgICBkYXRhW3B0cjUraTFdID0geDtcbiAgICBkYXRhW3B0cjYraTFdID0geTtcbiAgICBkYXRhW3B0cjcraTFdID0gejtcbiAgfVxuXG4gIG1vdmUoaW5kZXgyLCBsZWZ0LCBkYXRhKVxuICBtb3ZlKGluZGV4NCwgcmlnaHQsIGRhdGEpXG4gIGZvciAodmFyIGsgPSBsZXNzOyBrIDw9IGdyZWF0OyArK2spIHtcbiAgICBpZiAoY29tcGFyZVBpdm90KGssIHBpdm90MVgsIHBpdm90MVksIGRhdGEpKSB7XG4gICAgICBpZiAoayAhPT0gbGVzcykge1xuICAgICAgICBzd2FwKGssIGxlc3MsIGRhdGEpXG4gICAgICB9XG4gICAgICArK2xlc3M7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmICghY29tcGFyZVBpdm90KGssIHBpdm90MlgsIHBpdm90MlksIGRhdGEpKSB7XG4gICAgICAgIHdoaWxlICh0cnVlKSB7XG4gICAgICAgICAgaWYgKCFjb21wYXJlUGl2b3QoZ3JlYXQsIHBpdm90MlgsIHBpdm90MlksIGRhdGEpKSB7XG4gICAgICAgICAgICBpZiAoLS1ncmVhdCA8IGspIHtcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKGNvbXBhcmVQaXZvdChncmVhdCwgcGl2b3QxWCwgcGl2b3QxWSwgZGF0YSkpIHtcbiAgICAgICAgICAgICAgcm90YXRlKGssIGxlc3MsIGdyZWF0LCBkYXRhKVxuICAgICAgICAgICAgICArK2xlc3M7XG4gICAgICAgICAgICAgIC0tZ3JlYXQ7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBzd2FwKGssIGdyZWF0LCBkYXRhKVxuICAgICAgICAgICAgICAtLWdyZWF0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHNodWZmbGVQaXZvdChsZWZ0LCBsZXNzLTEsIHBpdm90MVgsIHBpdm90MVksIGRhdGEpXG4gIHNodWZmbGVQaXZvdChyaWdodCwgZ3JlYXQrMSwgcGl2b3QyWCwgcGl2b3QyWSwgZGF0YSlcbiAgaWYgKGxlc3MgLSAyIC0gbGVmdCA8PSBJTlNFUlRfU09SVF9DVVRPRkYpIHtcbiAgICBpbnNlcnRpb25Tb3J0KGxlZnQsIGxlc3MgLSAyLCBkYXRhKTtcbiAgfSBlbHNlIHtcbiAgICBxdWlja1NvcnQobGVmdCwgbGVzcyAtIDIsIGRhdGEpO1xuICB9XG4gIGlmIChyaWdodCAtIChncmVhdCArIDIpIDw9IElOU0VSVF9TT1JUX0NVVE9GRikge1xuICAgIGluc2VydGlvblNvcnQoZ3JlYXQgKyAyLCByaWdodCwgZGF0YSk7XG4gIH0gZWxzZSB7XG4gICAgcXVpY2tTb3J0KGdyZWF0ICsgMiwgcmlnaHQsIGRhdGEpO1xuICB9XG4gIGlmIChncmVhdCAtIGxlc3MgPD0gSU5TRVJUX1NPUlRfQ1VUT0ZGKSB7XG4gICAgaW5zZXJ0aW9uU29ydChsZXNzLCBncmVhdCwgZGF0YSk7XG4gIH0gZWxzZSB7XG4gICAgcXVpY2tTb3J0KGxlc3MsIGdyZWF0LCBkYXRhKTtcbiAgfVxufSIsIid1c2Ugc3RyaWN0J1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgaW5pdDogICAgICAgICAgIHNxSW5pdCxcbiAgc3dlZXBCaXBhcnRpdGU6IHN3ZWVwQmlwYXJ0aXRlLFxuICBzd2VlcENvbXBsZXRlOiAgc3dlZXBDb21wbGV0ZSxcbiAgc2NhbkJpcGFydGl0ZTogIHNjYW5CaXBhcnRpdGUsXG4gIHNjYW5Db21wbGV0ZTogICBzY2FuQ29tcGxldGVcbn1cblxudmFyIHBvb2wgID0gcmVxdWlyZSgndHlwZWRhcnJheS1wb29sJylcbnZhciBiaXRzICA9IHJlcXVpcmUoJ2JpdC10d2lkZGxlJylcbnZhciBpc29ydCA9IHJlcXVpcmUoJy4vc29ydCcpXG5cbi8vRmxhZyBmb3IgYmx1ZVxudmFyIEJMVUVfRkxBRyA9ICgxPDwyOClcblxuLy8xRCBzd2VlcCBldmVudCBxdWV1ZSBzdHVmZiAodXNlIHBvb2wgdG8gc2F2ZSBzcGFjZSlcbnZhciBJTklUX0NBUEFDSVRZICAgICAgPSAxMDI0XG52YXIgUkVEX1NXRUVQX1FVRVVFICAgID0gcG9vbC5tYWxsb2NJbnQzMihJTklUX0NBUEFDSVRZKVxudmFyIFJFRF9TV0VFUF9JTkRFWCAgICA9IHBvb2wubWFsbG9jSW50MzIoSU5JVF9DQVBBQ0lUWSlcbnZhciBCTFVFX1NXRUVQX1FVRVVFICAgPSBwb29sLm1hbGxvY0ludDMyKElOSVRfQ0FQQUNJVFkpXG52YXIgQkxVRV9TV0VFUF9JTkRFWCAgID0gcG9vbC5tYWxsb2NJbnQzMihJTklUX0NBUEFDSVRZKVxudmFyIENPTU1PTl9TV0VFUF9RVUVVRSA9IHBvb2wubWFsbG9jSW50MzIoSU5JVF9DQVBBQ0lUWSlcbnZhciBDT01NT05fU1dFRVBfSU5ERVggPSBwb29sLm1hbGxvY0ludDMyKElOSVRfQ0FQQUNJVFkpXG52YXIgU1dFRVBfRVZFTlRTICAgICAgID0gcG9vbC5tYWxsb2NEb3VibGUoSU5JVF9DQVBBQ0lUWSAqIDgpXG5cbi8vUmVzZXJ2ZXMgbWVtb3J5IGZvciB0aGUgMUQgc3dlZXAgZGF0YSBzdHJ1Y3R1cmVzXG5mdW5jdGlvbiBzcUluaXQoY291bnQpIHtcbiAgdmFyIHJjb3VudCA9IGJpdHMubmV4dFBvdzIoY291bnQpXG4gIGlmKFJFRF9TV0VFUF9RVUVVRS5sZW5ndGggPCByY291bnQpIHtcbiAgICBwb29sLmZyZWUoUkVEX1NXRUVQX1FVRVVFKVxuICAgIFJFRF9TV0VFUF9RVUVVRSA9IHBvb2wubWFsbG9jSW50MzIocmNvdW50KVxuICB9XG4gIGlmKFJFRF9TV0VFUF9JTkRFWC5sZW5ndGggPCByY291bnQpIHtcbiAgICBwb29sLmZyZWUoUkVEX1NXRUVQX0lOREVYKVxuICAgIFJFRF9TV0VFUF9JTkRFWCA9IHBvb2wubWFsbG9jSW50MzIocmNvdW50KVxuICB9XG4gIGlmKEJMVUVfU1dFRVBfUVVFVUUubGVuZ3RoIDwgcmNvdW50KSB7XG4gICAgcG9vbC5mcmVlKEJMVUVfU1dFRVBfUVVFVUUpXG4gICAgQkxVRV9TV0VFUF9RVUVVRSA9IHBvb2wubWFsbG9jSW50MzIocmNvdW50KVxuICB9XG4gIGlmKEJMVUVfU1dFRVBfSU5ERVgubGVuZ3RoIDwgcmNvdW50KSB7XG4gICAgcG9vbC5mcmVlKEJMVUVfU1dFRVBfSU5ERVgpXG4gICAgQkxVRV9TV0VFUF9JTkRFWCA9IHBvb2wubWFsbG9jSW50MzIocmNvdW50KVxuICB9XG4gIGlmKENPTU1PTl9TV0VFUF9RVUVVRS5sZW5ndGggPCByY291bnQpIHtcbiAgICBwb29sLmZyZWUoQ09NTU9OX1NXRUVQX1FVRVVFKVxuICAgIENPTU1PTl9TV0VFUF9RVUVVRSA9IHBvb2wubWFsbG9jSW50MzIocmNvdW50KVxuICB9XG4gIGlmKENPTU1PTl9TV0VFUF9JTkRFWC5sZW5ndGggPCByY291bnQpIHtcbiAgICBwb29sLmZyZWUoQ09NTU9OX1NXRUVQX0lOREVYKVxuICAgIENPTU1PTl9TV0VFUF9JTkRFWCA9IHBvb2wubWFsbG9jSW50MzIocmNvdW50KVxuICB9XG4gIHZhciBldmVudExlbmd0aCA9IDggKiByY291bnRcbiAgaWYoU1dFRVBfRVZFTlRTLmxlbmd0aCA8IGV2ZW50TGVuZ3RoKSB7XG4gICAgcG9vbC5mcmVlKFNXRUVQX0VWRU5UUylcbiAgICBTV0VFUF9FVkVOVFMgPSBwb29sLm1hbGxvY0RvdWJsZShldmVudExlbmd0aClcbiAgfVxufVxuXG4vL1JlbW92ZSBhbiBpdGVtIGZyb20gdGhlIGFjdGl2ZSBxdWV1ZSBpbiBPKDEpXG5mdW5jdGlvbiBzcVBvcChxdWV1ZSwgaW5kZXgsIGNvdW50LCBpdGVtKSB7XG4gIHZhciBpZHggPSBpbmRleFtpdGVtXVxuICB2YXIgdG9wID0gcXVldWVbY291bnQtMV1cbiAgcXVldWVbaWR4XSA9IHRvcFxuICBpbmRleFt0b3BdID0gaWR4XG59XG5cbi8vSW5zZXJ0IGFuIGl0ZW0gaW50byB0aGUgYWN0aXZlIHF1ZXVlIGluIE8oMSlcbmZ1bmN0aW9uIHNxUHVzaChxdWV1ZSwgaW5kZXgsIGNvdW50LCBpdGVtKSB7XG4gIHF1ZXVlW2NvdW50XSA9IGl0ZW1cbiAgaW5kZXhbaXRlbV0gID0gY291bnRcbn1cblxuLy9SZWN1cnNpb24gYmFzZSBjYXNlOiB1c2UgMUQgc3dlZXAgYWxnb3JpdGhtXG5mdW5jdGlvbiBzd2VlcEJpcGFydGl0ZShcbiAgICBkLCB2aXNpdCxcbiAgICByZWRTdGFydCwgIHJlZEVuZCwgcmVkLCByZWRJbmRleCxcbiAgICBibHVlU3RhcnQsIGJsdWVFbmQsIGJsdWUsIGJsdWVJbmRleCkge1xuXG4gIC8vc3RvcmUgZXZlbnRzIGFzIHBhaXJzIFtjb29yZGluYXRlLCBpZHhdXG4gIC8vXG4gIC8vICByZWQgY3JlYXRlOiAgLShpZHgrMSlcbiAgLy8gIHJlZCBkZXN0cm95OiBpZHhcbiAgLy8gIGJsdWUgY3JlYXRlOiAtKGlkeCtCTFVFX0ZMQUcpXG4gIC8vICBibHVlIGRlc3Ryb3k6IGlkeCtCTFVFX0ZMQUdcbiAgLy9cbiAgdmFyIHB0ciAgICAgID0gMFxuICB2YXIgZWxlbVNpemUgPSAyKmRcbiAgdmFyIGlzdGFydCAgID0gZC0xXG4gIHZhciBpZW5kICAgICA9IGVsZW1TaXplLTFcblxuICBmb3IodmFyIGk9cmVkU3RhcnQ7IGk8cmVkRW5kOyArK2kpIHtcbiAgICB2YXIgaWR4ID0gcmVkSW5kZXhbaV1cbiAgICB2YXIgcmVkT2Zmc2V0ID0gZWxlbVNpemUqaVxuICAgIFNXRUVQX0VWRU5UU1twdHIrK10gPSByZWRbcmVkT2Zmc2V0K2lzdGFydF1cbiAgICBTV0VFUF9FVkVOVFNbcHRyKytdID0gLShpZHgrMSlcbiAgICBTV0VFUF9FVkVOVFNbcHRyKytdID0gcmVkW3JlZE9mZnNldCtpZW5kXVxuICAgIFNXRUVQX0VWRU5UU1twdHIrK10gPSBpZHhcbiAgfVxuXG4gIGZvcih2YXIgaT1ibHVlU3RhcnQ7IGk8Ymx1ZUVuZDsgKytpKSB7XG4gICAgdmFyIGlkeCA9IGJsdWVJbmRleFtpXStCTFVFX0ZMQUdcbiAgICB2YXIgYmx1ZU9mZnNldCA9IGVsZW1TaXplKmlcbiAgICBTV0VFUF9FVkVOVFNbcHRyKytdID0gYmx1ZVtibHVlT2Zmc2V0K2lzdGFydF1cbiAgICBTV0VFUF9FVkVOVFNbcHRyKytdID0gLWlkeFxuICAgIFNXRUVQX0VWRU5UU1twdHIrK10gPSBibHVlW2JsdWVPZmZzZXQraWVuZF1cbiAgICBTV0VFUF9FVkVOVFNbcHRyKytdID0gaWR4XG4gIH1cblxuICAvL3Byb2Nlc3MgZXZlbnRzIGZyb20gbGVmdC0+cmlnaHRcbiAgdmFyIG4gPSBwdHIgPj4+IDFcbiAgaXNvcnQoU1dFRVBfRVZFTlRTLCBuKVxuICBcbiAgdmFyIHJlZEFjdGl2ZSAgPSAwXG4gIHZhciBibHVlQWN0aXZlID0gMFxuICBmb3IodmFyIGk9MDsgaTxuOyArK2kpIHtcbiAgICB2YXIgZSA9IFNXRUVQX0VWRU5UU1syKmkrMV18MFxuICAgIGlmKGUgPj0gQkxVRV9GTEFHKSB7XG4gICAgICAvL2JsdWUgZGVzdHJveSBldmVudFxuICAgICAgZSA9IChlLUJMVUVfRkxBRyl8MFxuICAgICAgc3FQb3AoQkxVRV9TV0VFUF9RVUVVRSwgQkxVRV9TV0VFUF9JTkRFWCwgYmx1ZUFjdGl2ZS0tLCBlKVxuICAgIH0gZWxzZSBpZihlID49IDApIHtcbiAgICAgIC8vcmVkIGRlc3Ryb3kgZXZlbnRcbiAgICAgIHNxUG9wKFJFRF9TV0VFUF9RVUVVRSwgUkVEX1NXRUVQX0lOREVYLCByZWRBY3RpdmUtLSwgZSlcbiAgICB9IGVsc2UgaWYoZSA8PSAtQkxVRV9GTEFHKSB7XG4gICAgICAvL2JsdWUgY3JlYXRlIGV2ZW50XG4gICAgICBlID0gKC1lLUJMVUVfRkxBRyl8MFxuICAgICAgZm9yKHZhciBqPTA7IGo8cmVkQWN0aXZlOyArK2opIHtcbiAgICAgICAgdmFyIHJldHZhbCA9IHZpc2l0KFJFRF9TV0VFUF9RVUVVRVtqXSwgZSlcbiAgICAgICAgaWYocmV0dmFsICE9PSB2b2lkIDApIHtcbiAgICAgICAgICByZXR1cm4gcmV0dmFsXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHNxUHVzaChCTFVFX1NXRUVQX1FVRVVFLCBCTFVFX1NXRUVQX0lOREVYLCBibHVlQWN0aXZlKyssIGUpXG4gICAgfSBlbHNlIHtcbiAgICAgIC8vcmVkIGNyZWF0ZSBldmVudFxuICAgICAgZSA9ICgtZS0xKXwwXG4gICAgICBmb3IodmFyIGo9MDsgajxibHVlQWN0aXZlOyArK2opIHtcbiAgICAgICAgdmFyIHJldHZhbCA9IHZpc2l0KGUsIEJMVUVfU1dFRVBfUVVFVUVbal0pXG4gICAgICAgIGlmKHJldHZhbCAhPT0gdm9pZCAwKSB7XG4gICAgICAgICAgcmV0dXJuIHJldHZhbFxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBzcVB1c2goUkVEX1NXRUVQX1FVRVVFLCBSRURfU1dFRVBfSU5ERVgsIHJlZEFjdGl2ZSsrLCBlKVxuICAgIH1cbiAgfVxufVxuXG4vL0NvbXBsZXRlIHN3ZWVwXG5mdW5jdGlvbiBzd2VlcENvbXBsZXRlKGQsIHZpc2l0LCBcbiAgcmVkU3RhcnQsIHJlZEVuZCwgcmVkLCByZWRJbmRleCxcbiAgYmx1ZVN0YXJ0LCBibHVlRW5kLCBibHVlLCBibHVlSW5kZXgpIHtcblxuICB2YXIgcHRyICAgICAgPSAwXG4gIHZhciBlbGVtU2l6ZSA9IDIqZFxuICB2YXIgaXN0YXJ0ICAgPSBkLTFcbiAgdmFyIGllbmQgICAgID0gZWxlbVNpemUtMVxuXG4gIGZvcih2YXIgaT1yZWRTdGFydDsgaTxyZWRFbmQ7ICsraSkge1xuICAgIHZhciBpZHggPSAocmVkSW5kZXhbaV0rMSk8PDFcbiAgICB2YXIgcmVkT2Zmc2V0ID0gZWxlbVNpemUqaVxuICAgIFNXRUVQX0VWRU5UU1twdHIrK10gPSByZWRbcmVkT2Zmc2V0K2lzdGFydF1cbiAgICBTV0VFUF9FVkVOVFNbcHRyKytdID0gLWlkeFxuICAgIFNXRUVQX0VWRU5UU1twdHIrK10gPSByZWRbcmVkT2Zmc2V0K2llbmRdXG4gICAgU1dFRVBfRVZFTlRTW3B0cisrXSA9IGlkeFxuICB9XG5cbiAgZm9yKHZhciBpPWJsdWVTdGFydDsgaTxibHVlRW5kOyArK2kpIHtcbiAgICB2YXIgaWR4ID0gKGJsdWVJbmRleFtpXSsxKTw8MVxuICAgIHZhciBibHVlT2Zmc2V0ID0gZWxlbVNpemUqaVxuICAgIFNXRUVQX0VWRU5UU1twdHIrK10gPSBibHVlW2JsdWVPZmZzZXQraXN0YXJ0XVxuICAgIFNXRUVQX0VWRU5UU1twdHIrK10gPSAoLWlkeCl8MVxuICAgIFNXRUVQX0VWRU5UU1twdHIrK10gPSBibHVlW2JsdWVPZmZzZXQraWVuZF1cbiAgICBTV0VFUF9FVkVOVFNbcHRyKytdID0gaWR4fDFcbiAgfVxuXG4gIC8vcHJvY2VzcyBldmVudHMgZnJvbSBsZWZ0LT5yaWdodFxuICB2YXIgbiA9IHB0ciA+Pj4gMVxuICBpc29ydChTV0VFUF9FVkVOVFMsIG4pXG4gIFxuICB2YXIgcmVkQWN0aXZlICAgID0gMFxuICB2YXIgYmx1ZUFjdGl2ZSAgID0gMFxuICB2YXIgY29tbW9uQWN0aXZlID0gMFxuICBmb3IodmFyIGk9MDsgaTxuOyArK2kpIHtcbiAgICB2YXIgZSAgICAgPSBTV0VFUF9FVkVOVFNbMippKzFdfDBcbiAgICB2YXIgY29sb3IgPSBlJjFcbiAgICBpZihpIDwgbi0xICYmIChlPj4xKSA9PT0gKFNXRUVQX0VWRU5UU1syKmkrM10+PjEpKSB7XG4gICAgICBjb2xvciA9IDJcbiAgICAgIGkgKz0gMVxuICAgIH1cbiAgICBcbiAgICBpZihlIDwgMCkge1xuICAgICAgLy9DcmVhdGUgZXZlbnRcbiAgICAgIHZhciBpZCA9IC0oZT4+MSkgLSAxXG5cbiAgICAgIC8vSW50ZXJzZWN0IHdpdGggY29tbW9uXG4gICAgICBmb3IodmFyIGo9MDsgajxjb21tb25BY3RpdmU7ICsraikge1xuICAgICAgICB2YXIgcmV0dmFsID0gdmlzaXQoQ09NTU9OX1NXRUVQX1FVRVVFW2pdLCBpZClcbiAgICAgICAgaWYocmV0dmFsICE9PSB2b2lkIDApIHtcbiAgICAgICAgICByZXR1cm4gcmV0dmFsXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYoY29sb3IgIT09IDApIHtcbiAgICAgICAgLy9JbnRlcnNlY3Qgd2l0aCByZWRcbiAgICAgICAgZm9yKHZhciBqPTA7IGo8cmVkQWN0aXZlOyArK2opIHtcbiAgICAgICAgICB2YXIgcmV0dmFsID0gdmlzaXQoUkVEX1NXRUVQX1FVRVVFW2pdLCBpZClcbiAgICAgICAgICBpZihyZXR2YWwgIT09IHZvaWQgMCkge1xuICAgICAgICAgICAgcmV0dXJuIHJldHZhbFxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZihjb2xvciAhPT0gMSkge1xuICAgICAgICAvL0ludGVyc2VjdCB3aXRoIGJsdWVcbiAgICAgICAgZm9yKHZhciBqPTA7IGo8Ymx1ZUFjdGl2ZTsgKytqKSB7XG4gICAgICAgICAgdmFyIHJldHZhbCA9IHZpc2l0KEJMVUVfU1dFRVBfUVVFVUVbal0sIGlkKVxuICAgICAgICAgIGlmKHJldHZhbCAhPT0gdm9pZCAwKSB7XG4gICAgICAgICAgICByZXR1cm4gcmV0dmFsXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmKGNvbG9yID09PSAwKSB7XG4gICAgICAgIC8vUmVkXG4gICAgICAgIHNxUHVzaChSRURfU1dFRVBfUVVFVUUsIFJFRF9TV0VFUF9JTkRFWCwgcmVkQWN0aXZlKyssIGlkKVxuICAgICAgfSBlbHNlIGlmKGNvbG9yID09PSAxKSB7XG4gICAgICAgIC8vQmx1ZVxuICAgICAgICBzcVB1c2goQkxVRV9TV0VFUF9RVUVVRSwgQkxVRV9TV0VFUF9JTkRFWCwgYmx1ZUFjdGl2ZSsrLCBpZClcbiAgICAgIH0gZWxzZSBpZihjb2xvciA9PT0gMikge1xuICAgICAgICAvL0JvdGhcbiAgICAgICAgc3FQdXNoKENPTU1PTl9TV0VFUF9RVUVVRSwgQ09NTU9OX1NXRUVQX0lOREVYLCBjb21tb25BY3RpdmUrKywgaWQpXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vRGVzdHJveSBldmVudFxuICAgICAgdmFyIGlkID0gKGU+PjEpIC0gMVxuICAgICAgaWYoY29sb3IgPT09IDApIHtcbiAgICAgICAgLy9SZWRcbiAgICAgICAgc3FQb3AoUkVEX1NXRUVQX1FVRVVFLCBSRURfU1dFRVBfSU5ERVgsIHJlZEFjdGl2ZS0tLCBpZClcbiAgICAgIH0gZWxzZSBpZihjb2xvciA9PT0gMSkge1xuICAgICAgICAvL0JsdWVcbiAgICAgICAgc3FQb3AoQkxVRV9TV0VFUF9RVUVVRSwgQkxVRV9TV0VFUF9JTkRFWCwgYmx1ZUFjdGl2ZS0tLCBpZClcbiAgICAgIH0gZWxzZSBpZihjb2xvciA9PT0gMikge1xuICAgICAgICAvL0JvdGhcbiAgICAgICAgc3FQb3AoQ09NTU9OX1NXRUVQX1FVRVVFLCBDT01NT05fU1dFRVBfSU5ERVgsIGNvbW1vbkFjdGl2ZS0tLCBpZClcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxuLy9Td2VlcCBhbmQgcHJ1bmUvc2NhbmxpbmUgYWxnb3JpdGhtOlxuLy8gIFNjYW4gYWxvbmcgYXhpcywgZGV0ZWN0IGludGVyc2VjdGlvbnNcbi8vICBCcnV0ZSBmb3JjZSBhbGwgYm94ZXMgYWxvbmcgYXhpc1xuZnVuY3Rpb24gc2NhbkJpcGFydGl0ZShcbiAgZCwgYXhpcywgdmlzaXQsIGZsaXAsXG4gIHJlZFN0YXJ0LCAgcmVkRW5kLCByZWQsIHJlZEluZGV4LFxuICBibHVlU3RhcnQsIGJsdWVFbmQsIGJsdWUsIGJsdWVJbmRleCkge1xuICBcbiAgdmFyIHB0ciAgICAgID0gMFxuICB2YXIgZWxlbVNpemUgPSAyKmRcbiAgdmFyIGlzdGFydCAgID0gYXhpc1xuICB2YXIgaWVuZCAgICAgPSBheGlzK2RcblxuICB2YXIgcmVkU2hpZnQgID0gMVxuICB2YXIgYmx1ZVNoaWZ0ID0gMVxuICBpZihmbGlwKSB7XG4gICAgYmx1ZVNoaWZ0ID0gQkxVRV9GTEFHXG4gIH0gZWxzZSB7XG4gICAgcmVkU2hpZnQgID0gQkxVRV9GTEFHXG4gIH1cblxuICBmb3IodmFyIGk9cmVkU3RhcnQ7IGk8cmVkRW5kOyArK2kpIHtcbiAgICB2YXIgaWR4ID0gaSArIHJlZFNoaWZ0XG4gICAgdmFyIHJlZE9mZnNldCA9IGVsZW1TaXplKmlcbiAgICBTV0VFUF9FVkVOVFNbcHRyKytdID0gcmVkW3JlZE9mZnNldCtpc3RhcnRdXG4gICAgU1dFRVBfRVZFTlRTW3B0cisrXSA9IC1pZHhcbiAgICBTV0VFUF9FVkVOVFNbcHRyKytdID0gcmVkW3JlZE9mZnNldCtpZW5kXVxuICAgIFNXRUVQX0VWRU5UU1twdHIrK10gPSBpZHhcbiAgfVxuICBmb3IodmFyIGk9Ymx1ZVN0YXJ0OyBpPGJsdWVFbmQ7ICsraSkge1xuICAgIHZhciBpZHggPSBpICsgYmx1ZVNoaWZ0XG4gICAgdmFyIGJsdWVPZmZzZXQgPSBlbGVtU2l6ZSppXG4gICAgU1dFRVBfRVZFTlRTW3B0cisrXSA9IGJsdWVbYmx1ZU9mZnNldCtpc3RhcnRdXG4gICAgU1dFRVBfRVZFTlRTW3B0cisrXSA9IC1pZHhcbiAgfVxuXG4gIC8vcHJvY2VzcyBldmVudHMgZnJvbSBsZWZ0LT5yaWdodFxuICB2YXIgbiA9IHB0ciA+Pj4gMVxuICBpc29ydChTV0VFUF9FVkVOVFMsIG4pXG4gIFxuICB2YXIgcmVkQWN0aXZlICAgID0gMFxuICBmb3IodmFyIGk9MDsgaTxuOyArK2kpIHtcbiAgICB2YXIgZSA9IFNXRUVQX0VWRU5UU1syKmkrMV18MFxuICAgIGlmKGUgPCAwKSB7XG4gICAgICB2YXIgaWR4ICAgPSAtZVxuICAgICAgdmFyIGlzUmVkID0gZmFsc2VcbiAgICAgIGlmKGlkeCA+PSBCTFVFX0ZMQUcpIHtcbiAgICAgICAgaXNSZWQgPSAhZmxpcFxuICAgICAgICBpZHggLT0gQkxVRV9GTEFHIFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaXNSZWQgPSAhIWZsaXBcbiAgICAgICAgaWR4IC09IDFcbiAgICAgIH1cbiAgICAgIGlmKGlzUmVkKSB7XG4gICAgICAgIHNxUHVzaChSRURfU1dFRVBfUVVFVUUsIFJFRF9TV0VFUF9JTkRFWCwgcmVkQWN0aXZlKyssIGlkeClcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBibHVlSWQgID0gYmx1ZUluZGV4W2lkeF1cbiAgICAgICAgdmFyIGJsdWVQdHIgPSBlbGVtU2l6ZSAqIGlkeFxuICAgICAgICBcbiAgICAgICAgdmFyIGIwID0gYmx1ZVtibHVlUHRyK2F4aXMrMV1cbiAgICAgICAgdmFyIGIxID0gYmx1ZVtibHVlUHRyK2F4aXMrMStkXVxuXG5yZWRfbG9vcDpcbiAgICAgICAgZm9yKHZhciBqPTA7IGo8cmVkQWN0aXZlOyArK2opIHtcbiAgICAgICAgICB2YXIgb2lkeCAgID0gUkVEX1NXRUVQX1FVRVVFW2pdXG4gICAgICAgICAgdmFyIHJlZFB0ciA9IGVsZW1TaXplICogb2lkeFxuXG4gICAgICAgICAgaWYoYjEgPCByZWRbcmVkUHRyK2F4aXMrMV0gfHwgXG4gICAgICAgICAgICAgcmVkW3JlZFB0citheGlzKzErZF0gPCBiMCkge1xuICAgICAgICAgICAgY29udGludWVcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBmb3IodmFyIGs9YXhpcysyOyBrPGQ7ICsraykge1xuICAgICAgICAgICAgaWYoYmx1ZVtibHVlUHRyICsgayArIGRdIDwgcmVkW3JlZFB0ciArIGtdIHx8IFxuICAgICAgICAgICAgICAgcmVkW3JlZFB0ciArIGsgKyBkXSA8IGJsdWVbYmx1ZVB0ciArIGtdKSB7XG4gICAgICAgICAgICAgIGNvbnRpbnVlIHJlZF9sb29wXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdmFyIHJlZElkICA9IHJlZEluZGV4W29pZHhdXG4gICAgICAgICAgdmFyIHJldHZhbFxuICAgICAgICAgIGlmKGZsaXApIHtcbiAgICAgICAgICAgIHJldHZhbCA9IHZpc2l0KGJsdWVJZCwgcmVkSWQpXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHZhbCA9IHZpc2l0KHJlZElkLCBibHVlSWQpXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmKHJldHZhbCAhPT0gdm9pZCAwKSB7XG4gICAgICAgICAgICByZXR1cm4gcmV0dmFsIFxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBzcVBvcChSRURfU1dFRVBfUVVFVUUsIFJFRF9TV0VFUF9JTkRFWCwgcmVkQWN0aXZlLS0sIGUgLSByZWRTaGlmdClcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gc2NhbkNvbXBsZXRlKFxuICBkLCBheGlzLCB2aXNpdCxcbiAgcmVkU3RhcnQsICByZWRFbmQsIHJlZCwgcmVkSW5kZXgsXG4gIGJsdWVTdGFydCwgYmx1ZUVuZCwgYmx1ZSwgYmx1ZUluZGV4KSB7XG5cbiAgdmFyIHB0ciAgICAgID0gMFxuICB2YXIgZWxlbVNpemUgPSAyKmRcbiAgdmFyIGlzdGFydCAgID0gYXhpc1xuICB2YXIgaWVuZCAgICAgPSBheGlzK2RcblxuICBmb3IodmFyIGk9cmVkU3RhcnQ7IGk8cmVkRW5kOyArK2kpIHtcbiAgICB2YXIgaWR4ID0gaSArIEJMVUVfRkxBR1xuICAgIHZhciByZWRPZmZzZXQgPSBlbGVtU2l6ZSppXG4gICAgU1dFRVBfRVZFTlRTW3B0cisrXSA9IHJlZFtyZWRPZmZzZXQraXN0YXJ0XVxuICAgIFNXRUVQX0VWRU5UU1twdHIrK10gPSAtaWR4XG4gICAgU1dFRVBfRVZFTlRTW3B0cisrXSA9IHJlZFtyZWRPZmZzZXQraWVuZF1cbiAgICBTV0VFUF9FVkVOVFNbcHRyKytdID0gaWR4XG4gIH1cbiAgZm9yKHZhciBpPWJsdWVTdGFydDsgaTxibHVlRW5kOyArK2kpIHtcbiAgICB2YXIgaWR4ID0gaSArIDFcbiAgICB2YXIgYmx1ZU9mZnNldCA9IGVsZW1TaXplKmlcbiAgICBTV0VFUF9FVkVOVFNbcHRyKytdID0gYmx1ZVtibHVlT2Zmc2V0K2lzdGFydF1cbiAgICBTV0VFUF9FVkVOVFNbcHRyKytdID0gLWlkeFxuICB9XG5cbiAgLy9wcm9jZXNzIGV2ZW50cyBmcm9tIGxlZnQtPnJpZ2h0XG4gIHZhciBuID0gcHRyID4+PiAxXG4gIGlzb3J0KFNXRUVQX0VWRU5UUywgbilcbiAgXG4gIHZhciByZWRBY3RpdmUgICAgPSAwXG4gIGZvcih2YXIgaT0wOyBpPG47ICsraSkge1xuICAgIHZhciBlID0gU1dFRVBfRVZFTlRTWzIqaSsxXXwwXG4gICAgaWYoZSA8IDApIHtcbiAgICAgIHZhciBpZHggICA9IC1lXG4gICAgICBpZihpZHggPj0gQkxVRV9GTEFHKSB7XG4gICAgICAgIFJFRF9TV0VFUF9RVUVVRVtyZWRBY3RpdmUrK10gPSBpZHggLSBCTFVFX0ZMQUdcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlkeCAtPSAxXG4gICAgICAgIHZhciBibHVlSWQgID0gYmx1ZUluZGV4W2lkeF1cbiAgICAgICAgdmFyIGJsdWVQdHIgPSBlbGVtU2l6ZSAqIGlkeFxuXG4gICAgICAgIHZhciBiMCA9IGJsdWVbYmx1ZVB0citheGlzKzFdXG4gICAgICAgIHZhciBiMSA9IGJsdWVbYmx1ZVB0citheGlzKzErZF1cblxucmVkX2xvb3A6XG4gICAgICAgIGZvcih2YXIgaj0wOyBqPHJlZEFjdGl2ZTsgKytqKSB7XG4gICAgICAgICAgdmFyIG9pZHggICA9IFJFRF9TV0VFUF9RVUVVRVtqXVxuICAgICAgICAgIHZhciByZWRJZCAgPSByZWRJbmRleFtvaWR4XVxuXG4gICAgICAgICAgaWYocmVkSWQgPT09IGJsdWVJZCkge1xuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICB2YXIgcmVkUHRyID0gZWxlbVNpemUgKiBvaWR4XG4gICAgICAgICAgaWYoYjEgPCByZWRbcmVkUHRyK2F4aXMrMV0gfHwgXG4gICAgICAgICAgICByZWRbcmVkUHRyK2F4aXMrMStkXSA8IGIwKSB7XG4gICAgICAgICAgICBjb250aW51ZVxuICAgICAgICAgIH1cbiAgICAgICAgICBmb3IodmFyIGs9YXhpcysyOyBrPGQ7ICsraykge1xuICAgICAgICAgICAgaWYoYmx1ZVtibHVlUHRyICsgayArIGRdIDwgcmVkW3JlZFB0ciArIGtdIHx8IFxuICAgICAgICAgICAgICAgcmVkW3JlZFB0ciArIGsgKyBkXSAgIDwgYmx1ZVtibHVlUHRyICsga10pIHtcbiAgICAgICAgICAgICAgY29udGludWUgcmVkX2xvb3BcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG5cbiAgICAgICAgICB2YXIgcmV0dmFsID0gdmlzaXQocmVkSWQsIGJsdWVJZClcbiAgICAgICAgICBpZihyZXR2YWwgIT09IHZvaWQgMCkge1xuICAgICAgICAgICAgcmV0dXJuIHJldHZhbCBcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIGlkeCA9IGUgLSBCTFVFX0ZMQUdcbiAgICAgIGZvcih2YXIgaj1yZWRBY3RpdmUtMTsgaj49MDsgLS1qKSB7XG4gICAgICAgIGlmKFJFRF9TV0VFUF9RVUVVRVtqXSA9PT0gaWR4KSB7XG4gICAgICAgICAgZm9yKHZhciBrPWorMTsgazxyZWRBY3RpdmU7ICsraykge1xuICAgICAgICAgICAgUkVEX1NXRUVQX1FVRVVFW2stMV0gPSBSRURfU1dFRVBfUVVFVUVba11cbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgLS1yZWRBY3RpdmVcbiAgICB9XG4gIH1cbn0iLCIndXNlIHN0cmljdCdcblxudmFyIG1vbm90b25lVHJpYW5ndWxhdGUgPSByZXF1aXJlKCcuL2xpYi9tb25vdG9uZScpXG52YXIgbWFrZUluZGV4ID0gcmVxdWlyZSgnLi9saWIvdHJpYW5ndWxhdGlvbicpXG52YXIgZGVsYXVuYXlGbGlwID0gcmVxdWlyZSgnLi9saWIvZGVsYXVuYXknKVxudmFyIGZpbHRlclRyaWFuZ3VsYXRpb24gPSByZXF1aXJlKCcuL2xpYi9maWx0ZXInKVxuXG5tb2R1bGUuZXhwb3J0cyA9IGNkdDJkXG5cbmZ1bmN0aW9uIGNhbm9uaWNhbGl6ZUVkZ2UoZSkge1xuICByZXR1cm4gW01hdGgubWluKGVbMF0sIGVbMV0pLCBNYXRoLm1heChlWzBdLCBlWzFdKV1cbn1cblxuZnVuY3Rpb24gY29tcGFyZUVkZ2UoYSwgYikge1xuICByZXR1cm4gYVswXS1iWzBdIHx8IGFbMV0tYlsxXVxufVxuXG5mdW5jdGlvbiBjYW5vbmljYWxpemVFZGdlcyhlZGdlcykge1xuICByZXR1cm4gZWRnZXMubWFwKGNhbm9uaWNhbGl6ZUVkZ2UpLnNvcnQoY29tcGFyZUVkZ2UpXG59XG5cbmZ1bmN0aW9uIGdldERlZmF1bHQob3B0aW9ucywgcHJvcGVydHksIGRmbHQpIHtcbiAgaWYocHJvcGVydHkgaW4gb3B0aW9ucykge1xuICAgIHJldHVybiBvcHRpb25zW3Byb3BlcnR5XVxuICB9XG4gIHJldHVybiBkZmx0XG59XG5cbmZ1bmN0aW9uIGNkdDJkKHBvaW50cywgZWRnZXMsIG9wdGlvbnMpIHtcblxuICBpZighQXJyYXkuaXNBcnJheShlZGdlcykpIHtcbiAgICBvcHRpb25zID0gZWRnZXMgfHwge31cbiAgICBlZGdlcyA9IFtdXG4gIH0gZWxzZSB7XG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge31cbiAgICBlZGdlcyA9IGVkZ2VzIHx8IFtdXG4gIH1cblxuICAvL1BhcnNlIG91dCBvcHRpb25zXG4gIHZhciBkZWxhdW5heSA9ICEhZ2V0RGVmYXVsdChvcHRpb25zLCAnZGVsYXVuYXknLCB0cnVlKVxuICB2YXIgaW50ZXJpb3IgPSAhIWdldERlZmF1bHQob3B0aW9ucywgJ2ludGVyaW9yJywgdHJ1ZSlcbiAgdmFyIGV4dGVyaW9yID0gISFnZXREZWZhdWx0KG9wdGlvbnMsICdleHRlcmlvcicsIHRydWUpXG4gIHZhciBpbmZpbml0eSA9ICEhZ2V0RGVmYXVsdChvcHRpb25zLCAnaW5maW5pdHknLCBmYWxzZSlcblxuICAvL0hhbmRsZSB0cml2aWFsIGNhc2VcbiAgaWYoKCFpbnRlcmlvciAmJiAhZXh0ZXJpb3IpIHx8IHBvaW50cy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gW11cbiAgfVxuXG4gIC8vQ29uc3RydWN0IGluaXRpYWwgdHJpYW5ndWxhdGlvblxuICB2YXIgY2VsbHMgPSBtb25vdG9uZVRyaWFuZ3VsYXRlKHBvaW50cywgZWRnZXMpXG5cbiAgLy9JZiBkZWxhdW5heSByZWZpbmVtZW50IG5lZWRlZCwgdGhlbiBpbXByb3ZlIHF1YWxpdHkgYnkgZWRnZSBmbGlwcGluZ1xuICBpZihkZWxhdW5heSB8fCBpbnRlcmlvciAhPT0gZXh0ZXJpb3IgfHwgaW5maW5pdHkpIHtcblxuICAgIC8vSW5kZXggYWxsIG9mIHRoZSBjZWxscyB0byBzdXBwb3J0IGZhc3QgbmVpZ2hib3Job29kIHF1ZXJpZXNcbiAgICB2YXIgdHJpYW5ndWxhdGlvbiA9IG1ha2VJbmRleChwb2ludHMubGVuZ3RoLCBjYW5vbmljYWxpemVFZGdlcyhlZGdlcykpXG4gICAgZm9yKHZhciBpPTA7IGk8Y2VsbHMubGVuZ3RoOyArK2kpIHtcbiAgICAgIHZhciBmID0gY2VsbHNbaV1cbiAgICAgIHRyaWFuZ3VsYXRpb24uYWRkVHJpYW5nbGUoZlswXSwgZlsxXSwgZlsyXSlcbiAgICB9XG5cbiAgICAvL1J1biBlZGdlIGZsaXBwaW5nXG4gICAgaWYoZGVsYXVuYXkpIHtcbiAgICAgIGRlbGF1bmF5RmxpcChwb2ludHMsIHRyaWFuZ3VsYXRpb24pXG4gICAgfVxuXG4gICAgLy9GaWx0ZXIgcG9pbnRzXG4gICAgaWYoIWV4dGVyaW9yKSB7XG4gICAgICByZXR1cm4gZmlsdGVyVHJpYW5ndWxhdGlvbih0cmlhbmd1bGF0aW9uLCAtMSlcbiAgICB9IGVsc2UgaWYoIWludGVyaW9yKSB7XG4gICAgICByZXR1cm4gZmlsdGVyVHJpYW5ndWxhdGlvbih0cmlhbmd1bGF0aW9uLCAgMSwgaW5maW5pdHkpXG4gICAgfSBlbHNlIGlmKGluZmluaXR5KSB7XG4gICAgICByZXR1cm4gZmlsdGVyVHJpYW5ndWxhdGlvbih0cmlhbmd1bGF0aW9uLCAwLCBpbmZpbml0eSlcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHRyaWFuZ3VsYXRpb24uY2VsbHMoKVxuICAgIH1cbiAgICBcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gY2VsbHNcbiAgfVxufVxuIiwiJ3VzZSBzdHJpY3QnXG5cbnZhciBpbkNpcmNsZSA9IHJlcXVpcmUoJ3JvYnVzdC1pbi1zcGhlcmUnKVs0XVxudmFyIGJzZWFyY2ggPSByZXF1aXJlKCdiaW5hcnktc2VhcmNoLWJvdW5kcycpXG5cbm1vZHVsZS5leHBvcnRzID0gZGVsYXVuYXlSZWZpbmVcblxuZnVuY3Rpb24gdGVzdEZsaXAocG9pbnRzLCB0cmlhbmd1bGF0aW9uLCBzdGFjaywgYSwgYiwgeCkge1xuICB2YXIgeSA9IHRyaWFuZ3VsYXRpb24ub3Bwb3NpdGUoYSwgYilcblxuICAvL1Rlc3QgYm91bmRhcnkgZWRnZVxuICBpZih5IDwgMCkge1xuICAgIHJldHVyblxuICB9XG5cbiAgLy9Td2FwIGVkZ2UgaWYgb3JkZXIgZmxpcHBlZFxuICBpZihiIDwgYSkge1xuICAgIHZhciB0bXAgPSBhXG4gICAgYSA9IGJcbiAgICBiID0gdG1wXG4gICAgdG1wID0geFxuICAgIHggPSB5XG4gICAgeSA9IHRtcFxuICB9XG5cbiAgLy9UZXN0IGlmIGVkZ2UgaXMgY29uc3RyYWluZWRcbiAgaWYodHJpYW5ndWxhdGlvbi5pc0NvbnN0cmFpbnQoYSwgYikpIHtcbiAgICByZXR1cm5cbiAgfVxuXG4gIC8vVGVzdCBpZiBlZGdlIGlzIGRlbGF1bmF5XG4gIGlmKGluQ2lyY2xlKHBvaW50c1thXSwgcG9pbnRzW2JdLCBwb2ludHNbeF0sIHBvaW50c1t5XSkgPCAwKSB7XG4gICAgc3RhY2sucHVzaChhLCBiKVxuICB9XG59XG5cbi8vQXNzdW1lIGVkZ2VzIGFyZSBzb3J0ZWQgbGV4aWNvZ3JhcGhpY2FsbHlcbmZ1bmN0aW9uIGRlbGF1bmF5UmVmaW5lKHBvaW50cywgdHJpYW5ndWxhdGlvbikge1xuICB2YXIgc3RhY2sgPSBbXVxuXG4gIHZhciBudW1Qb2ludHMgPSBwb2ludHMubGVuZ3RoXG4gIHZhciBzdGFycyA9IHRyaWFuZ3VsYXRpb24uc3RhcnNcbiAgZm9yKHZhciBhPTA7IGE8bnVtUG9pbnRzOyArK2EpIHtcbiAgICB2YXIgc3RhciA9IHN0YXJzW2FdXG4gICAgZm9yKHZhciBqPTE7IGo8c3Rhci5sZW5ndGg7IGorPTIpIHtcbiAgICAgIHZhciBiID0gc3RhcltqXVxuXG4gICAgICAvL0lmIG9yZGVyIGlzIG5vdCBjb25zaXN0ZW50LCB0aGVuIHNraXAgZWRnZVxuICAgICAgaWYoYiA8IGEpIHtcbiAgICAgICAgY29udGludWVcbiAgICAgIH1cblxuICAgICAgLy9DaGVjayBpZiBlZGdlIGlzIGNvbnN0cmFpbmVkXG4gICAgICBpZih0cmlhbmd1bGF0aW9uLmlzQ29uc3RyYWludChhLCBiKSkge1xuICAgICAgICBjb250aW51ZVxuICAgICAgfVxuXG4gICAgICAvL0ZpbmQgb3Bwb3NpdGUgZWRnZVxuICAgICAgdmFyIHggPSBzdGFyW2otMV0sIHkgPSAtMVxuICAgICAgZm9yKHZhciBrPTE7IGs8c3Rhci5sZW5ndGg7IGsrPTIpIHtcbiAgICAgICAgaWYoc3RhcltrLTFdID09PSBiKSB7XG4gICAgICAgICAgeSA9IHN0YXJba11cbiAgICAgICAgICBicmVha1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vSWYgdGhpcyBpcyBhIGJvdW5kYXJ5IGVkZ2UsIGRvbid0IGZsaXAgaXRcbiAgICAgIGlmKHkgPCAwKSB7XG4gICAgICAgIGNvbnRpbnVlXG4gICAgICB9XG5cbiAgICAgIC8vSWYgZWRnZSBpcyBpbiBjaXJjbGUsIGZsaXAgaXRcbiAgICAgIGlmKGluQ2lyY2xlKHBvaW50c1thXSwgcG9pbnRzW2JdLCBwb2ludHNbeF0sIHBvaW50c1t5XSkgPCAwKSB7XG4gICAgICAgIHN0YWNrLnB1c2goYSwgYilcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICB3aGlsZShzdGFjay5sZW5ndGggPiAwKSB7XG4gICAgdmFyIGIgPSBzdGFjay5wb3AoKVxuICAgIHZhciBhID0gc3RhY2sucG9wKClcblxuICAgIC8vRmluZCBvcHBvc2l0ZSBwYWlyc1xuICAgIHZhciB4ID0gLTEsIHkgPSAtMVxuICAgIHZhciBzdGFyID0gc3RhcnNbYV1cbiAgICBmb3IodmFyIGk9MTsgaTxzdGFyLmxlbmd0aDsgaSs9Mikge1xuICAgICAgdmFyIHMgPSBzdGFyW2ktMV1cbiAgICAgIHZhciB0ID0gc3RhcltpXVxuICAgICAgaWYocyA9PT0gYikge1xuICAgICAgICB5ID0gdFxuICAgICAgfSBlbHNlIGlmKHQgPT09IGIpIHtcbiAgICAgICAgeCA9IHNcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvL0lmIHgveSBhcmUgYm90aCB2YWxpZCB0aGVuIHNraXAgZWRnZVxuICAgIGlmKHggPCAwIHx8IHkgPCAwKSB7XG4gICAgICBjb250aW51ZVxuICAgIH1cblxuICAgIC8vSWYgZWRnZSBpcyBub3cgZGVsYXVuYXksIHRoZW4gZG9uJ3QgZmxpcCBpdFxuICAgIGlmKGluQ2lyY2xlKHBvaW50c1thXSwgcG9pbnRzW2JdLCBwb2ludHNbeF0sIHBvaW50c1t5XSkgPj0gMCkge1xuICAgICAgY29udGludWVcbiAgICB9XG5cbiAgICAvL0ZsaXAgdGhlIGVkZ2VcbiAgICB0cmlhbmd1bGF0aW9uLmZsaXAoYSwgYilcblxuICAgIC8vVGVzdCBmbGlwcGluZyBuZWlnaGJvcmluZyBlZGdlc1xuICAgIHRlc3RGbGlwKHBvaW50cywgdHJpYW5ndWxhdGlvbiwgc3RhY2ssIHgsIGEsIHkpXG4gICAgdGVzdEZsaXAocG9pbnRzLCB0cmlhbmd1bGF0aW9uLCBzdGFjaywgYSwgeSwgeClcbiAgICB0ZXN0RmxpcChwb2ludHMsIHRyaWFuZ3VsYXRpb24sIHN0YWNrLCB5LCBiLCB4KVxuICAgIHRlc3RGbGlwKHBvaW50cywgdHJpYW5ndWxhdGlvbiwgc3RhY2ssIGIsIHgsIHkpXG4gIH1cbn1cbiIsIid1c2Ugc3RyaWN0J1xuXG52YXIgYnNlYXJjaCA9IHJlcXVpcmUoJ2JpbmFyeS1zZWFyY2gtYm91bmRzJylcblxubW9kdWxlLmV4cG9ydHMgPSBjbGFzc2lmeUZhY2VzXG5cbmZ1bmN0aW9uIEZhY2VJbmRleChjZWxscywgbmVpZ2hib3IsIGNvbnN0cmFpbnQsIGZsYWdzLCBhY3RpdmUsIG5leHQsIGJvdW5kYXJ5KSB7XG4gIHRoaXMuY2VsbHMgICAgICAgPSBjZWxsc1xuICB0aGlzLm5laWdoYm9yICAgID0gbmVpZ2hib3JcbiAgdGhpcy5mbGFncyAgICAgICA9IGZsYWdzXG4gIHRoaXMuY29uc3RyYWludCAgPSBjb25zdHJhaW50XG4gIHRoaXMuYWN0aXZlICAgICAgPSBhY3RpdmVcbiAgdGhpcy5uZXh0ICAgICAgICA9IG5leHRcbiAgdGhpcy5ib3VuZGFyeSAgICA9IGJvdW5kYXJ5XG59XG5cbnZhciBwcm90byA9IEZhY2VJbmRleC5wcm90b3R5cGVcblxuZnVuY3Rpb24gY29tcGFyZUNlbGwoYSwgYikge1xuICByZXR1cm4gYVswXSAtIGJbMF0gfHxcbiAgICAgICAgIGFbMV0gLSBiWzFdIHx8XG4gICAgICAgICBhWzJdIC0gYlsyXVxufVxuXG5wcm90by5sb2NhdGUgPSAoZnVuY3Rpb24oKSB7XG4gIHZhciBrZXkgPSBbMCwwLDBdXG4gIHJldHVybiBmdW5jdGlvbihhLCBiLCBjKSB7XG4gICAgdmFyIHggPSBhLCB5ID0gYiwgeiA9IGNcbiAgICBpZihiIDwgYykge1xuICAgICAgaWYoYiA8IGEpIHtcbiAgICAgICAgeCA9IGJcbiAgICAgICAgeSA9IGNcbiAgICAgICAgeiA9IGFcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYoYyA8IGEpIHtcbiAgICAgIHggPSBjXG4gICAgICB5ID0gYVxuICAgICAgeiA9IGJcbiAgICB9XG4gICAgaWYoeCA8IDApIHtcbiAgICAgIHJldHVybiAtMVxuICAgIH1cbiAgICBrZXlbMF0gPSB4XG4gICAga2V5WzFdID0geVxuICAgIGtleVsyXSA9IHpcbiAgICByZXR1cm4gYnNlYXJjaC5lcSh0aGlzLmNlbGxzLCBrZXksIGNvbXBhcmVDZWxsKVxuICB9XG59KSgpXG5cbmZ1bmN0aW9uIGluZGV4Q2VsbHModHJpYW5ndWxhdGlvbiwgaW5maW5pdHkpIHtcbiAgLy9GaXJzdCBnZXQgY2VsbHMgYW5kIGNhbm9uaWNhbGl6ZVxuICB2YXIgY2VsbHMgPSB0cmlhbmd1bGF0aW9uLmNlbGxzKClcbiAgdmFyIG5jID0gY2VsbHMubGVuZ3RoXG4gIGZvcih2YXIgaT0wOyBpPG5jOyArK2kpIHtcbiAgICB2YXIgYyA9IGNlbGxzW2ldXG4gICAgdmFyIHggPSBjWzBdLCB5ID0gY1sxXSwgeiA9IGNbMl1cbiAgICBpZih5IDwgeikge1xuICAgICAgaWYoeSA8IHgpIHtcbiAgICAgICAgY1swXSA9IHlcbiAgICAgICAgY1sxXSA9IHpcbiAgICAgICAgY1syXSA9IHhcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYoeiA8IHgpIHtcbiAgICAgIGNbMF0gPSB6XG4gICAgICBjWzFdID0geFxuICAgICAgY1syXSA9IHlcbiAgICB9XG4gIH1cbiAgY2VsbHMuc29ydChjb21wYXJlQ2VsbClcblxuICAvL0luaXRpYWxpemUgZmxhZyBhcnJheVxuICB2YXIgZmxhZ3MgPSBuZXcgQXJyYXkobmMpXG4gIGZvcih2YXIgaT0wOyBpPGZsYWdzLmxlbmd0aDsgKytpKSB7XG4gICAgZmxhZ3NbaV0gPSAwXG4gIH1cblxuICAvL0J1aWxkIG5laWdoYm9yIGluZGV4LCBpbml0aWFsaXplIHF1ZXVlc1xuICB2YXIgYWN0aXZlID0gW11cbiAgdmFyIG5leHQgICA9IFtdXG4gIHZhciBuZWlnaGJvciA9IG5ldyBBcnJheSgzKm5jKVxuICB2YXIgY29uc3RyYWludCA9IG5ldyBBcnJheSgzKm5jKVxuICB2YXIgYm91bmRhcnkgPSBudWxsXG4gIGlmKGluZmluaXR5KSB7XG4gICAgYm91bmRhcnkgPSBbXVxuICB9XG4gIHZhciBpbmRleCA9IG5ldyBGYWNlSW5kZXgoXG4gICAgY2VsbHMsXG4gICAgbmVpZ2hib3IsXG4gICAgY29uc3RyYWludCxcbiAgICBmbGFncyxcbiAgICBhY3RpdmUsXG4gICAgbmV4dCxcbiAgICBib3VuZGFyeSlcbiAgZm9yKHZhciBpPTA7IGk8bmM7ICsraSkge1xuICAgIHZhciBjID0gY2VsbHNbaV1cbiAgICBmb3IodmFyIGo9MDsgajwzOyArK2opIHtcbiAgICAgIHZhciB4ID0gY1tqXSwgeSA9IGNbKGorMSklM11cbiAgICAgIHZhciBhID0gbmVpZ2hib3JbMyppK2pdID0gaW5kZXgubG9jYXRlKHksIHgsIHRyaWFuZ3VsYXRpb24ub3Bwb3NpdGUoeSwgeCkpXG4gICAgICB2YXIgYiA9IGNvbnN0cmFpbnRbMyppK2pdID0gdHJpYW5ndWxhdGlvbi5pc0NvbnN0cmFpbnQoeCwgeSlcbiAgICAgIGlmKGEgPCAwKSB7XG4gICAgICAgIGlmKGIpIHtcbiAgICAgICAgICBuZXh0LnB1c2goaSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBhY3RpdmUucHVzaChpKVxuICAgICAgICAgIGZsYWdzW2ldID0gMVxuICAgICAgICB9XG4gICAgICAgIGlmKGluZmluaXR5KSB7XG4gICAgICAgICAgYm91bmRhcnkucHVzaChbeSwgeCwgLTFdKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBpbmRleFxufVxuXG5mdW5jdGlvbiBmaWx0ZXJDZWxscyhjZWxscywgZmxhZ3MsIHRhcmdldCkge1xuICB2YXIgcHRyID0gMFxuICBmb3IodmFyIGk9MDsgaTxjZWxscy5sZW5ndGg7ICsraSkge1xuICAgIGlmKGZsYWdzW2ldID09PSB0YXJnZXQpIHtcbiAgICAgIGNlbGxzW3B0cisrXSA9IGNlbGxzW2ldXG4gICAgfVxuICB9XG4gIGNlbGxzLmxlbmd0aCA9IHB0clxuICByZXR1cm4gY2VsbHNcbn1cblxuZnVuY3Rpb24gY2xhc3NpZnlGYWNlcyh0cmlhbmd1bGF0aW9uLCB0YXJnZXQsIGluZmluaXR5KSB7XG4gIHZhciBpbmRleCA9IGluZGV4Q2VsbHModHJpYW5ndWxhdGlvbiwgaW5maW5pdHkpXG5cbiAgaWYodGFyZ2V0ID09PSAwKSB7XG4gICAgaWYoaW5maW5pdHkpIHtcbiAgICAgIHJldHVybiBpbmRleC5jZWxscy5jb25jYXQoaW5kZXguYm91bmRhcnkpXG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBpbmRleC5jZWxsc1xuICAgIH1cbiAgfVxuXG4gIHZhciBzaWRlID0gMVxuICB2YXIgYWN0aXZlID0gaW5kZXguYWN0aXZlXG4gIHZhciBuZXh0ID0gaW5kZXgubmV4dFxuICB2YXIgZmxhZ3MgPSBpbmRleC5mbGFnc1xuICB2YXIgY2VsbHMgPSBpbmRleC5jZWxsc1xuICB2YXIgY29uc3RyYWludCA9IGluZGV4LmNvbnN0cmFpbnRcbiAgdmFyIG5laWdoYm9yID0gaW5kZXgubmVpZ2hib3JcblxuICB3aGlsZShhY3RpdmUubGVuZ3RoID4gMCB8fCBuZXh0Lmxlbmd0aCA+IDApIHtcbiAgICB3aGlsZShhY3RpdmUubGVuZ3RoID4gMCkge1xuICAgICAgdmFyIHQgPSBhY3RpdmUucG9wKClcbiAgICAgIGlmKGZsYWdzW3RdID09PSAtc2lkZSkge1xuICAgICAgICBjb250aW51ZVxuICAgICAgfVxuICAgICAgZmxhZ3NbdF0gPSBzaWRlXG4gICAgICB2YXIgYyA9IGNlbGxzW3RdXG4gICAgICBmb3IodmFyIGo9MDsgajwzOyArK2opIHtcbiAgICAgICAgdmFyIGYgPSBuZWlnaGJvclszKnQral1cbiAgICAgICAgaWYoZiA+PSAwICYmIGZsYWdzW2ZdID09PSAwKSB7XG4gICAgICAgICAgaWYoY29uc3RyYWludFszKnQral0pIHtcbiAgICAgICAgICAgIG5leHQucHVzaChmKVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBhY3RpdmUucHVzaChmKVxuICAgICAgICAgICAgZmxhZ3NbZl0gPSBzaWRlXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy9Td2FwIGFycmF5cyBhbmQgbG9vcFxuICAgIHZhciB0bXAgPSBuZXh0XG4gICAgbmV4dCA9IGFjdGl2ZVxuICAgIGFjdGl2ZSA9IHRtcFxuICAgIG5leHQubGVuZ3RoID0gMFxuICAgIHNpZGUgPSAtc2lkZVxuICB9XG5cbiAgdmFyIHJlc3VsdCA9IGZpbHRlckNlbGxzKGNlbGxzLCBmbGFncywgdGFyZ2V0KVxuICBpZihpbmZpbml0eSkge1xuICAgIHJldHVybiByZXN1bHQuY29uY2F0KGluZGV4LmJvdW5kYXJ5KVxuICB9XG4gIHJldHVybiByZXN1bHRcbn1cbiIsIid1c2Ugc3RyaWN0J1xuXG52YXIgYnNlYXJjaCA9IHJlcXVpcmUoJ2JpbmFyeS1zZWFyY2gtYm91bmRzJylcbnZhciBvcmllbnQgPSByZXF1aXJlKCdyb2J1c3Qtb3JpZW50YXRpb24nKVszXVxuXG52YXIgRVZFTlRfUE9JTlQgPSAwXG52YXIgRVZFTlRfRU5EICAgPSAxXG52YXIgRVZFTlRfU1RBUlQgPSAyXG5cbm1vZHVsZS5leHBvcnRzID0gbW9ub3RvbmVUcmlhbmd1bGF0ZVxuXG4vL0EgcGFydGlhbCBjb252ZXggaHVsbCBmcmFnbWVudCwgbWFkZSBvZiB0d28gdW5pbW9ub3RvbmUgcG9seWdvbnNcbmZ1bmN0aW9uIFBhcnRpYWxIdWxsKGEsIGIsIGlkeCwgbG93ZXJJZHMsIHVwcGVySWRzKSB7XG4gIHRoaXMuYSA9IGFcbiAgdGhpcy5iID0gYlxuICB0aGlzLmlkeCA9IGlkeFxuICB0aGlzLmxvd2VySWRzID0gbG93ZXJJZHNcbiAgdGhpcy51cHBlcklkcyA9IHVwcGVySWRzXG59XG5cbi8vQW4gZXZlbnQgaW4gdGhlIHN3ZWVwIGxpbmUgcHJvY2VkdXJlXG5mdW5jdGlvbiBFdmVudChhLCBiLCB0eXBlLCBpZHgpIHtcbiAgdGhpcy5hICAgID0gYVxuICB0aGlzLmIgICAgPSBiXG4gIHRoaXMudHlwZSA9IHR5cGVcbiAgdGhpcy5pZHggID0gaWR4XG59XG5cbi8vVGhpcyBpcyB1c2VkIHRvIGNvbXBhcmUgZXZlbnRzIGZvciB0aGUgc3dlZXAgbGluZSBwcm9jZWR1cmVcbi8vIFBvaW50cyBhcmU6XG4vLyAgMS4gc29ydGVkIGxleGljb2dyYXBoaWNhbGx5XG4vLyAgMi4gc29ydGVkIGJ5IHR5cGUgIChwb2ludCA8IGVuZCA8IHN0YXJ0KVxuLy8gIDMuIHNlZ21lbnRzIHNvcnRlZCBieSB3aW5kaW5nIG9yZGVyXG4vLyAgNC4gc29ydGVkIGJ5IGluZGV4XG5mdW5jdGlvbiBjb21wYXJlRXZlbnQoYSwgYikge1xuICB2YXIgZCA9XG4gICAgKGEuYVswXSAtIGIuYVswXSkgfHxcbiAgICAoYS5hWzFdIC0gYi5hWzFdKSB8fFxuICAgIChhLnR5cGUgLSBiLnR5cGUpXG4gIGlmKGQpIHsgcmV0dXJuIGQgfVxuICBpZihhLnR5cGUgIT09IEVWRU5UX1BPSU5UKSB7XG4gICAgZCA9IG9yaWVudChhLmEsIGEuYiwgYi5iKVxuICAgIGlmKGQpIHsgcmV0dXJuIGQgfVxuICB9XG4gIHJldHVybiBhLmlkeCAtIGIuaWR4XG59XG5cbmZ1bmN0aW9uIHRlc3RQb2ludChodWxsLCBwKSB7XG4gIHJldHVybiBvcmllbnQoaHVsbC5hLCBodWxsLmIsIHApXG59XG5cbmZ1bmN0aW9uIGFkZFBvaW50KGNlbGxzLCBodWxscywgcG9pbnRzLCBwLCBpZHgpIHtcbiAgdmFyIGxvID0gYnNlYXJjaC5sdChodWxscywgcCwgdGVzdFBvaW50KVxuICB2YXIgaGkgPSBic2VhcmNoLmd0KGh1bGxzLCBwLCB0ZXN0UG9pbnQpXG4gIGZvcih2YXIgaT1sbzsgaTxoaTsgKytpKSB7XG4gICAgdmFyIGh1bGwgPSBodWxsc1tpXVxuXG4gICAgLy9JbnNlcnQgcCBpbnRvIGxvd2VyIGh1bGxcbiAgICB2YXIgbG93ZXJJZHMgPSBodWxsLmxvd2VySWRzXG4gICAgdmFyIG0gPSBsb3dlcklkcy5sZW5ndGhcbiAgICB3aGlsZShtID4gMSAmJiBvcmllbnQoXG4gICAgICAgIHBvaW50c1tsb3dlcklkc1ttLTJdXSxcbiAgICAgICAgcG9pbnRzW2xvd2VySWRzW20tMV1dLFxuICAgICAgICBwKSA+IDApIHtcbiAgICAgIGNlbGxzLnB1c2goXG4gICAgICAgIFtsb3dlcklkc1ttLTFdLFxuICAgICAgICAgbG93ZXJJZHNbbS0yXSxcbiAgICAgICAgIGlkeF0pXG4gICAgICBtIC09IDFcbiAgICB9XG4gICAgbG93ZXJJZHMubGVuZ3RoID0gbVxuICAgIGxvd2VySWRzLnB1c2goaWR4KVxuXG4gICAgLy9JbnNlcnQgcCBpbnRvIHVwcGVyIGh1bGxcbiAgICB2YXIgdXBwZXJJZHMgPSBodWxsLnVwcGVySWRzXG4gICAgdmFyIG0gPSB1cHBlcklkcy5sZW5ndGhcbiAgICB3aGlsZShtID4gMSAmJiBvcmllbnQoXG4gICAgICAgIHBvaW50c1t1cHBlcklkc1ttLTJdXSxcbiAgICAgICAgcG9pbnRzW3VwcGVySWRzW20tMV1dLFxuICAgICAgICBwKSA8IDApIHtcbiAgICAgIGNlbGxzLnB1c2goXG4gICAgICAgIFt1cHBlcklkc1ttLTJdLFxuICAgICAgICAgdXBwZXJJZHNbbS0xXSxcbiAgICAgICAgIGlkeF0pXG4gICAgICBtIC09IDFcbiAgICB9XG4gICAgdXBwZXJJZHMubGVuZ3RoID0gbVxuICAgIHVwcGVySWRzLnB1c2goaWR4KVxuICB9XG59XG5cbmZ1bmN0aW9uIGZpbmRTcGxpdChodWxsLCBlZGdlKSB7XG4gIHZhciBkXG4gIGlmKGh1bGwuYVswXSA8IGVkZ2UuYVswXSkge1xuICAgIGQgPSBvcmllbnQoaHVsbC5hLCBodWxsLmIsIGVkZ2UuYSlcbiAgfSBlbHNlIHtcbiAgICBkID0gb3JpZW50KGVkZ2UuYiwgZWRnZS5hLCBodWxsLmEpXG4gIH1cbiAgaWYoZCkgeyByZXR1cm4gZCB9XG4gIGlmKGVkZ2UuYlswXSA8IGh1bGwuYlswXSkge1xuICAgIGQgPSBvcmllbnQoaHVsbC5hLCBodWxsLmIsIGVkZ2UuYilcbiAgfSBlbHNlIHtcbiAgICBkID0gb3JpZW50KGVkZ2UuYiwgZWRnZS5hLCBodWxsLmIpXG4gIH1cbiAgcmV0dXJuIGQgfHwgaHVsbC5pZHggLSBlZGdlLmlkeFxufVxuXG5mdW5jdGlvbiBzcGxpdEh1bGxzKGh1bGxzLCBwb2ludHMsIGV2ZW50KSB7XG4gIHZhciBzcGxpdElkeCA9IGJzZWFyY2gubGUoaHVsbHMsIGV2ZW50LCBmaW5kU3BsaXQpXG4gIHZhciBodWxsID0gaHVsbHNbc3BsaXRJZHhdXG4gIHZhciB1cHBlcklkcyA9IGh1bGwudXBwZXJJZHNcbiAgdmFyIHggPSB1cHBlcklkc1t1cHBlcklkcy5sZW5ndGgtMV1cbiAgaHVsbC51cHBlcklkcyA9IFt4XVxuICBodWxscy5zcGxpY2Uoc3BsaXRJZHgrMSwgMCxcbiAgICBuZXcgUGFydGlhbEh1bGwoZXZlbnQuYSwgZXZlbnQuYiwgZXZlbnQuaWR4LCBbeF0sIHVwcGVySWRzKSlcbn1cblxuXG5mdW5jdGlvbiBtZXJnZUh1bGxzKGh1bGxzLCBwb2ludHMsIGV2ZW50KSB7XG4gIC8vU3dhcCBwb2ludGVycyBmb3IgbWVyZ2Ugc2VhcmNoXG4gIHZhciB0bXAgPSBldmVudC5hXG4gIGV2ZW50LmEgPSBldmVudC5iXG4gIGV2ZW50LmIgPSB0bXBcbiAgdmFyIG1lcmdlSWR4ID0gYnNlYXJjaC5lcShodWxscywgZXZlbnQsIGZpbmRTcGxpdClcbiAgdmFyIHVwcGVyID0gaHVsbHNbbWVyZ2VJZHhdXG4gIHZhciBsb3dlciA9IGh1bGxzW21lcmdlSWR4LTFdXG4gIGxvd2VyLnVwcGVySWRzID0gdXBwZXIudXBwZXJJZHNcbiAgaHVsbHMuc3BsaWNlKG1lcmdlSWR4LCAxKVxufVxuXG5cbmZ1bmN0aW9uIG1vbm90b25lVHJpYW5ndWxhdGUocG9pbnRzLCBlZGdlcykge1xuXG4gIHZhciBudW1Qb2ludHMgPSBwb2ludHMubGVuZ3RoXG4gIHZhciBudW1FZGdlcyA9IGVkZ2VzLmxlbmd0aFxuXG4gIHZhciBldmVudHMgPSBbXVxuXG4gIC8vQ3JlYXRlIHBvaW50IGV2ZW50c1xuICBmb3IodmFyIGk9MDsgaTxudW1Qb2ludHM7ICsraSkge1xuICAgIGV2ZW50cy5wdXNoKG5ldyBFdmVudChcbiAgICAgIHBvaW50c1tpXSxcbiAgICAgIG51bGwsXG4gICAgICBFVkVOVF9QT0lOVCxcbiAgICAgIGkpKVxuICB9XG5cbiAgLy9DcmVhdGUgZWRnZSBldmVudHNcbiAgZm9yKHZhciBpPTA7IGk8bnVtRWRnZXM7ICsraSkge1xuICAgIHZhciBlID0gZWRnZXNbaV1cbiAgICB2YXIgYSA9IHBvaW50c1tlWzBdXVxuICAgIHZhciBiID0gcG9pbnRzW2VbMV1dXG4gICAgaWYoYVswXSA8IGJbMF0pIHtcbiAgICAgIGV2ZW50cy5wdXNoKFxuICAgICAgICBuZXcgRXZlbnQoYSwgYiwgRVZFTlRfU1RBUlQsIGkpLFxuICAgICAgICBuZXcgRXZlbnQoYiwgYSwgRVZFTlRfRU5ELCBpKSlcbiAgICB9IGVsc2UgaWYoYVswXSA+IGJbMF0pIHtcbiAgICAgIGV2ZW50cy5wdXNoKFxuICAgICAgICBuZXcgRXZlbnQoYiwgYSwgRVZFTlRfU1RBUlQsIGkpLFxuICAgICAgICBuZXcgRXZlbnQoYSwgYiwgRVZFTlRfRU5ELCBpKSlcbiAgICB9XG4gIH1cblxuICAvL1NvcnQgZXZlbnRzXG4gIGV2ZW50cy5zb3J0KGNvbXBhcmVFdmVudClcblxuICAvL0luaXRpYWxpemUgaHVsbFxuICB2YXIgbWluWCA9IGV2ZW50c1swXS5hWzBdIC0gKDEgKyBNYXRoLmFicyhldmVudHNbMF0uYVswXSkpICogTWF0aC5wb3coMiwgLTUyKVxuICB2YXIgaHVsbCA9IFsgbmV3IFBhcnRpYWxIdWxsKFttaW5YLCAxXSwgW21pblgsIDBdLCAtMSwgW10sIFtdLCBbXSwgW10pIF1cblxuICAvL1Byb2Nlc3MgZXZlbnRzIGluIG9yZGVyXG4gIHZhciBjZWxscyA9IFtdXG4gIGZvcih2YXIgaT0wLCBudW1FdmVudHM9ZXZlbnRzLmxlbmd0aDsgaTxudW1FdmVudHM7ICsraSkge1xuICAgIHZhciBldmVudCA9IGV2ZW50c1tpXVxuICAgIHZhciB0eXBlID0gZXZlbnQudHlwZVxuICAgIGlmKHR5cGUgPT09IEVWRU5UX1BPSU5UKSB7XG4gICAgICBhZGRQb2ludChjZWxscywgaHVsbCwgcG9pbnRzLCBldmVudC5hLCBldmVudC5pZHgpXG4gICAgfSBlbHNlIGlmKHR5cGUgPT09IEVWRU5UX1NUQVJUKSB7XG4gICAgICBzcGxpdEh1bGxzKGh1bGwsIHBvaW50cywgZXZlbnQpXG4gICAgfSBlbHNlIHtcbiAgICAgIG1lcmdlSHVsbHMoaHVsbCwgcG9pbnRzLCBldmVudClcbiAgICB9XG4gIH1cblxuICAvL1JldHVybiB0cmlhbmd1bGF0aW9uXG4gIHJldHVybiBjZWxsc1xufVxuIiwiJ3VzZSBzdHJpY3QnXG5cbnZhciBic2VhcmNoID0gcmVxdWlyZSgnYmluYXJ5LXNlYXJjaC1ib3VuZHMnKVxuXG5tb2R1bGUuZXhwb3J0cyA9IGNyZWF0ZVRyaWFuZ3VsYXRpb25cblxuZnVuY3Rpb24gVHJpYW5ndWxhdGlvbihzdGFycywgZWRnZXMpIHtcbiAgdGhpcy5zdGFycyA9IHN0YXJzXG4gIHRoaXMuZWRnZXMgPSBlZGdlc1xufVxuXG52YXIgcHJvdG8gPSBUcmlhbmd1bGF0aW9uLnByb3RvdHlwZVxuXG5mdW5jdGlvbiByZW1vdmVQYWlyKGxpc3QsIGosIGspIHtcbiAgZm9yKHZhciBpPTEsIG49bGlzdC5sZW5ndGg7IGk8bjsgaSs9Mikge1xuICAgIGlmKGxpc3RbaS0xXSA9PT0gaiAmJiBsaXN0W2ldID09PSBrKSB7XG4gICAgICBsaXN0W2ktMV0gPSBsaXN0W24tMl1cbiAgICAgIGxpc3RbaV0gPSBsaXN0W24tMV1cbiAgICAgIGxpc3QubGVuZ3RoID0gbiAtIDJcbiAgICAgIHJldHVyblxuICAgIH1cbiAgfVxufVxuXG5wcm90by5pc0NvbnN0cmFpbnQgPSAoZnVuY3Rpb24oKSB7XG4gIHZhciBlID0gWzAsMF1cbiAgZnVuY3Rpb24gY29tcGFyZUxleChhLCBiKSB7XG4gICAgcmV0dXJuIGFbMF0gLSBiWzBdIHx8IGFbMV0gLSBiWzFdXG4gIH1cbiAgcmV0dXJuIGZ1bmN0aW9uKGksIGopIHtcbiAgICBlWzBdID0gTWF0aC5taW4oaSxqKVxuICAgIGVbMV0gPSBNYXRoLm1heChpLGopXG4gICAgcmV0dXJuIGJzZWFyY2guZXEodGhpcy5lZGdlcywgZSwgY29tcGFyZUxleCkgPj0gMFxuICB9XG59KSgpXG5cbnByb3RvLnJlbW92ZVRyaWFuZ2xlID0gZnVuY3Rpb24oaSwgaiwgaykge1xuICB2YXIgc3RhcnMgPSB0aGlzLnN0YXJzXG4gIHJlbW92ZVBhaXIoc3RhcnNbaV0sIGosIGspXG4gIHJlbW92ZVBhaXIoc3RhcnNbal0sIGssIGkpXG4gIHJlbW92ZVBhaXIoc3RhcnNba10sIGksIGopXG59XG5cbnByb3RvLmFkZFRyaWFuZ2xlID0gZnVuY3Rpb24oaSwgaiwgaykge1xuICB2YXIgc3RhcnMgPSB0aGlzLnN0YXJzXG4gIHN0YXJzW2ldLnB1c2goaiwgaylcbiAgc3RhcnNbal0ucHVzaChrLCBpKVxuICBzdGFyc1trXS5wdXNoKGksIGopXG59XG5cbnByb3RvLm9wcG9zaXRlID0gZnVuY3Rpb24oaiwgaSkge1xuICB2YXIgbGlzdCA9IHRoaXMuc3RhcnNbaV1cbiAgZm9yKHZhciBrPTEsIG49bGlzdC5sZW5ndGg7IGs8bjsgays9Mikge1xuICAgIGlmKGxpc3Rba10gPT09IGopIHtcbiAgICAgIHJldHVybiBsaXN0W2stMV1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIC0xXG59XG5cbnByb3RvLmZsaXAgPSBmdW5jdGlvbihpLCBqKSB7XG4gIHZhciBhID0gdGhpcy5vcHBvc2l0ZShpLCBqKVxuICB2YXIgYiA9IHRoaXMub3Bwb3NpdGUoaiwgaSlcbiAgdGhpcy5yZW1vdmVUcmlhbmdsZShpLCBqLCBhKVxuICB0aGlzLnJlbW92ZVRyaWFuZ2xlKGosIGksIGIpXG4gIHRoaXMuYWRkVHJpYW5nbGUoaSwgYiwgYSlcbiAgdGhpcy5hZGRUcmlhbmdsZShqLCBhLCBiKVxufVxuXG5wcm90by5lZGdlcyA9IGZ1bmN0aW9uKCkge1xuICB2YXIgc3RhcnMgPSB0aGlzLnN0YXJzXG4gIHZhciByZXN1bHQgPSBbXVxuICBmb3IodmFyIGk9MCwgbj1zdGFycy5sZW5ndGg7IGk8bjsgKytpKSB7XG4gICAgdmFyIGxpc3QgPSBzdGFyc1tpXVxuICAgIGZvcih2YXIgaj0wLCBtPWxpc3QubGVuZ3RoOyBqPG07IGorPTIpIHtcbiAgICAgIHJlc3VsdC5wdXNoKFtsaXN0W2pdLCBsaXN0W2orMV1dKVxuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0XG59XG5cbnByb3RvLmNlbGxzID0gZnVuY3Rpb24oKSB7XG4gIHZhciBzdGFycyA9IHRoaXMuc3RhcnNcbiAgdmFyIHJlc3VsdCA9IFtdXG4gIGZvcih2YXIgaT0wLCBuPXN0YXJzLmxlbmd0aDsgaTxuOyArK2kpIHtcbiAgICB2YXIgbGlzdCA9IHN0YXJzW2ldXG4gICAgZm9yKHZhciBqPTAsIG09bGlzdC5sZW5ndGg7IGo8bTsgais9Mikge1xuICAgICAgdmFyIHMgPSBsaXN0W2pdXG4gICAgICB2YXIgdCA9IGxpc3RbaisxXVxuICAgICAgaWYoaSA8IE1hdGgubWluKHMsIHQpKSB7XG4gICAgICAgIHJlc3VsdC5wdXNoKFtpLCBzLCB0XSlcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlc3VsdFxufVxuXG5mdW5jdGlvbiBjcmVhdGVUcmlhbmd1bGF0aW9uKG51bVZlcnRzLCBlZGdlcykge1xuICB2YXIgc3RhcnMgPSBuZXcgQXJyYXkobnVtVmVydHMpXG4gIGZvcih2YXIgaT0wOyBpPG51bVZlcnRzOyArK2kpIHtcbiAgICBzdGFyc1tpXSA9IFtdXG4gIH1cbiAgcmV0dXJuIG5ldyBUcmlhbmd1bGF0aW9uKHN0YXJzLCBlZGdlcylcbn1cbiIsIid1c2Ugc3RyaWN0J1xuXG5tb2R1bGUuZXhwb3J0cyA9IGNsZWFuUFNMR1xuXG52YXIgVW5pb25GaW5kID0gcmVxdWlyZSgndW5pb24tZmluZCcpXG52YXIgYm94SW50ZXJzZWN0ID0gcmVxdWlyZSgnYm94LWludGVyc2VjdCcpXG52YXIgc2Vnc2VnID0gcmVxdWlyZSgncm9idXN0LXNlZ21lbnQtaW50ZXJzZWN0JylcbnZhciByYXQgPSByZXF1aXJlKCdiaWctcmF0JylcbnZhciByYXRDbXAgPSByZXF1aXJlKCdiaWctcmF0L2NtcCcpXG52YXIgcmF0VG9GbG9hdCA9IHJlcXVpcmUoJ2JpZy1yYXQvdG8tZmxvYXQnKVxudmFyIHJhdFZlYyA9IHJlcXVpcmUoJ3JhdC12ZWMnKVxudmFyIG5leHRhZnRlciA9IHJlcXVpcmUoJ25leHRhZnRlcicpXG5cbnZhciBzb2x2ZUludGVyc2VjdGlvbiA9IHJlcXVpcmUoJy4vbGliL3JhdC1zZWctaW50ZXJzZWN0JylcblxuLy8gQm91bmRzIG9uIGEgcmF0aW9uYWwgbnVtYmVyIHdoZW4gcm91bmRlZCB0byBhIGZsb2F0XG5mdW5jdGlvbiBib3VuZFJhdCAocikge1xuICB2YXIgZiA9IHJhdFRvRmxvYXQocilcbiAgcmV0dXJuIFtcbiAgICBuZXh0YWZ0ZXIoZiwgLUluZmluaXR5KSxcbiAgICBuZXh0YWZ0ZXIoZiwgSW5maW5pdHkpXG4gIF1cbn1cblxuLy8gQ29udmVydCBhIGxpc3Qgb2YgZWRnZXMgaW4gYSBwc2xnIHRvIGJvdW5kaW5nIGJveGVzXG5mdW5jdGlvbiBib3VuZEVkZ2VzIChwb2ludHMsIGVkZ2VzKSB7XG4gIHZhciBib3VuZHMgPSBuZXcgQXJyYXkoZWRnZXMubGVuZ3RoKVxuICBmb3IgKHZhciBpID0gMDsgaSA8IGVkZ2VzLmxlbmd0aDsgKytpKSB7XG4gICAgdmFyIGUgPSBlZGdlc1tpXVxuICAgIHZhciBhID0gcG9pbnRzW2VbMF1dXG4gICAgdmFyIGIgPSBwb2ludHNbZVsxXV1cbiAgICBib3VuZHNbaV0gPSBbXG4gICAgICBuZXh0YWZ0ZXIoTWF0aC5taW4oYVswXSwgYlswXSksIC1JbmZpbml0eSksXG4gICAgICBuZXh0YWZ0ZXIoTWF0aC5taW4oYVsxXSwgYlsxXSksIC1JbmZpbml0eSksXG4gICAgICBuZXh0YWZ0ZXIoTWF0aC5tYXgoYVswXSwgYlswXSksIEluZmluaXR5KSxcbiAgICAgIG5leHRhZnRlcihNYXRoLm1heChhWzFdLCBiWzFdKSwgSW5maW5pdHkpXG4gICAgXVxuICB9XG4gIHJldHVybiBib3VuZHNcbn1cblxuLy8gQ29udmVydCBhIGxpc3Qgb2YgcG9pbnRzIGludG8gYm91bmRpbmcgYm94ZXMgYnkgZHVwbGljYXRpbmcgY29vcmRzXG5mdW5jdGlvbiBib3VuZFBvaW50cyAocG9pbnRzKSB7XG4gIHZhciBib3VuZHMgPSBuZXcgQXJyYXkocG9pbnRzLmxlbmd0aClcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBwb2ludHMubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgcCA9IHBvaW50c1tpXVxuICAgIGJvdW5kc1tpXSA9IFtcbiAgICAgIG5leHRhZnRlcihwWzBdLCAtSW5maW5pdHkpLFxuICAgICAgbmV4dGFmdGVyKHBbMV0sIC1JbmZpbml0eSksXG4gICAgICBuZXh0YWZ0ZXIocFswXSwgSW5maW5pdHkpLFxuICAgICAgbmV4dGFmdGVyKHBbMV0sIEluZmluaXR5KVxuICAgIF1cbiAgfVxuICByZXR1cm4gYm91bmRzXG59XG5cbi8vIEZpbmQgYWxsIHBhaXJzIG9mIGNyb3NzaW5nIGVkZ2VzIGluIGEgcHNsZyAoZ2l2ZW4gZWRnZSBib3VuZHMpXG5mdW5jdGlvbiBnZXRDcm9zc2luZ3MgKHBvaW50cywgZWRnZXMsIGVkZ2VCb3VuZHMpIHtcbiAgdmFyIHJlc3VsdCA9IFtdXG4gIGJveEludGVyc2VjdChlZGdlQm91bmRzLCBmdW5jdGlvbiAoaSwgaikge1xuICAgIHZhciBlID0gZWRnZXNbaV1cbiAgICB2YXIgZiA9IGVkZ2VzW2pdXG4gICAgaWYgKGVbMF0gPT09IGZbMF0gfHwgZVswXSA9PT0gZlsxXSB8fFxuICAgICAgZVsxXSA9PT0gZlswXSB8fCBlWzFdID09PSBmWzFdKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgdmFyIGEgPSBwb2ludHNbZVswXV1cbiAgICB2YXIgYiA9IHBvaW50c1tlWzFdXVxuICAgIHZhciBjID0gcG9pbnRzW2ZbMF1dXG4gICAgdmFyIGQgPSBwb2ludHNbZlsxXV1cbiAgICBpZiAoc2Vnc2VnKGEsIGIsIGMsIGQpKSB7XG4gICAgICByZXN1bHQucHVzaChbaSwgal0pXG4gICAgfVxuICB9KVxuICByZXR1cm4gcmVzdWx0XG59XG5cbi8vIEZpbmQgYWxsIHBhaXJzIG9mIGNyb3NzaW5nIHZlcnRpY2VzIGluIGEgcHNsZyAoZ2l2ZW4gZWRnZS92ZXJ0IGJvdW5kcylcbmZ1bmN0aW9uIGdldFRKdW5jdGlvbnMgKHBvaW50cywgZWRnZXMsIGVkZ2VCb3VuZHMsIHZlcnRCb3VuZHMpIHtcbiAgdmFyIHJlc3VsdCA9IFtdXG4gIGJveEludGVyc2VjdChlZGdlQm91bmRzLCB2ZXJ0Qm91bmRzLCBmdW5jdGlvbiAoaSwgdikge1xuICAgIHZhciBlID0gZWRnZXNbaV1cbiAgICBpZiAoZVswXSA9PT0gdiB8fCBlWzFdID09PSB2KSB7XG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgdmFyIHAgPSBwb2ludHNbdl1cbiAgICB2YXIgYSA9IHBvaW50c1tlWzBdXVxuICAgIHZhciBiID0gcG9pbnRzW2VbMV1dXG4gICAgaWYgKHNlZ3NlZyhhLCBiLCBwLCBwKSkge1xuICAgICAgcmVzdWx0LnB1c2goW2ksIHZdKVxuICAgIH1cbiAgfSlcbiAgcmV0dXJuIHJlc3VsdFxufVxuXG4vLyBDdXQgZWRnZXMgYWxvbmcgY3Jvc3NpbmdzL3RqdW5jdGlvbnNcbmZ1bmN0aW9uIGN1dEVkZ2VzIChmbG9hdFBvaW50cywgZWRnZXMsIGNyb3NzaW5ncywganVuY3Rpb25zLCB1c2VDb2xvcikge1xuICB2YXIgaSwgZVxuXG4gIC8vIENvbnZlcnQgY3Jvc3NpbmdzIGludG8gdGp1bmN0aW9ucyBieSBjb25zdHJ1Y3RpbmcgcmF0aW9uYWwgcG9pbnRzXG4gIHZhciByYXRQb2ludHMgPSBmbG9hdFBvaW50cy5tYXAoZnVuY3Rpb24ocCkge1xuICAgICAgcmV0dXJuIFtcbiAgICAgICAgICByYXQocFswXSksXG4gICAgICAgICAgcmF0KHBbMV0pXG4gICAgICBdXG4gIH0pXG4gIGZvciAoaSA9IDA7IGkgPCBjcm9zc2luZ3MubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgY3Jvc3NpbmcgPSBjcm9zc2luZ3NbaV1cbiAgICBlID0gY3Jvc3NpbmdbMF1cbiAgICB2YXIgZiA9IGNyb3NzaW5nWzFdXG4gICAgdmFyIGVlID0gZWRnZXNbZV1cbiAgICB2YXIgZWYgPSBlZGdlc1tmXVxuICAgIHZhciB4ID0gc29sdmVJbnRlcnNlY3Rpb24oXG4gICAgICByYXRWZWMoZmxvYXRQb2ludHNbZWVbMF1dKSxcbiAgICAgIHJhdFZlYyhmbG9hdFBvaW50c1tlZVsxXV0pLFxuICAgICAgcmF0VmVjKGZsb2F0UG9pbnRzW2VmWzBdXSksXG4gICAgICByYXRWZWMoZmxvYXRQb2ludHNbZWZbMV1dKSlcbiAgICBpZiAoIXgpIHtcbiAgICAgIC8vIFNlZ21lbnRzIGFyZSBwYXJhbGxlbCwgc2hvdWxkIGFscmVhZHkgYmUgaGFuZGxlZCBieSB0LWp1bmN0aW9uc1xuICAgICAgY29udGludWVcbiAgICB9XG4gICAgdmFyIGlkeCA9IGZsb2F0UG9pbnRzLmxlbmd0aFxuICAgIGZsb2F0UG9pbnRzLnB1c2goW3JhdFRvRmxvYXQoeFswXSksIHJhdFRvRmxvYXQoeFsxXSldKVxuICAgIHJhdFBvaW50cy5wdXNoKHgpXG4gICAganVuY3Rpb25zLnB1c2goW2UsIGlkeF0sIFtmLCBpZHhdKVxuICB9XG5cbiAgLy8gU29ydCB0anVuY3Rpb25zXG4gIGp1bmN0aW9ucy5zb3J0KGZ1bmN0aW9uIChhLCBiKSB7XG4gICAgaWYgKGFbMF0gIT09IGJbMF0pIHtcbiAgICAgIHJldHVybiBhWzBdIC0gYlswXVxuICAgIH1cbiAgICB2YXIgdSA9IHJhdFBvaW50c1thWzFdXVxuICAgIHZhciB2ID0gcmF0UG9pbnRzW2JbMV1dXG4gICAgcmV0dXJuIHJhdENtcCh1WzBdLCB2WzBdKSB8fCByYXRDbXAodVsxXSwgdlsxXSlcbiAgfSlcblxuICAvLyBTcGxpdCBlZGdlcyBhbG9uZyBqdW5jdGlvbnNcbiAgZm9yIChpID0ganVuY3Rpb25zLmxlbmd0aCAtIDE7IGkgPj0gMDsgLS1pKSB7XG4gICAgdmFyIGp1bmN0aW9uID0ganVuY3Rpb25zW2ldXG4gICAgZSA9IGp1bmN0aW9uWzBdXG5cbiAgICB2YXIgZWRnZSA9IGVkZ2VzW2VdXG4gICAgdmFyIHMgPSBlZGdlWzBdXG4gICAgdmFyIHQgPSBlZGdlWzFdXG5cbiAgICAvLyBDaGVjayBpZiBlZGdlIGlzIG5vdCBsZXhpY29ncmFwaGljYWxseSBzb3J0ZWRcbiAgICB2YXIgYSA9IGZsb2F0UG9pbnRzW3NdXG4gICAgdmFyIGIgPSBmbG9hdFBvaW50c1t0XVxuICAgIGlmICgoKGFbMF0gLSBiWzBdKSB8fCAoYVsxXSAtIGJbMV0pKSA8IDApIHtcbiAgICAgIHZhciB0bXAgPSBzXG4gICAgICBzID0gdFxuICAgICAgdCA9IHRtcFxuICAgIH1cblxuICAgIC8vIFNwbGl0IGxlYWRpbmcgZWRnZVxuICAgIGVkZ2VbMF0gPSBzXG4gICAgdmFyIGxhc3QgPSBlZGdlWzFdID0ganVuY3Rpb25bMV1cblxuICAgIC8vIElmIHdlIGFyZSBncm91cGluZyBlZGdlcyBieSBjb2xvciwgcmVtZW1iZXIgdG8gdHJhY2sgZGF0YVxuICAgIHZhciBjb2xvclxuICAgIGlmICh1c2VDb2xvcikge1xuICAgICAgY29sb3IgPSBlZGdlWzJdXG4gICAgfVxuXG4gICAgLy8gU3BsaXQgb3RoZXIgZWRnZXNcbiAgICB3aGlsZSAoaSA+IDAgJiYganVuY3Rpb25zW2kgLSAxXVswXSA9PT0gZSkge1xuICAgICAgdmFyIGp1bmN0aW9uID0ganVuY3Rpb25zWy0taV1cbiAgICAgIHZhciBuZXh0ID0ganVuY3Rpb25bMV1cbiAgICAgIGlmICh1c2VDb2xvcikge1xuICAgICAgICBlZGdlcy5wdXNoKFtsYXN0LCBuZXh0LCBjb2xvcl0pXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBlZGdlcy5wdXNoKFtsYXN0LCBuZXh0XSlcbiAgICAgIH1cbiAgICAgIGxhc3QgPSBuZXh0XG4gICAgfVxuXG4gICAgLy8gQWRkIGZpbmFsIGVkZ2VcbiAgICBpZiAodXNlQ29sb3IpIHtcbiAgICAgIGVkZ2VzLnB1c2goW2xhc3QsIHQsIGNvbG9yXSlcbiAgICB9IGVsc2Uge1xuICAgICAgZWRnZXMucHVzaChbbGFzdCwgdF0pXG4gICAgfVxuICB9XG5cbiAgLy8gUmV0dXJuIGNvbnN0cnVjdGVkIHJhdGlvbmFsIHBvaW50c1xuICByZXR1cm4gcmF0UG9pbnRzXG59XG5cbi8vIE1lcmdlIG92ZXJsYXBwaW5nIHBvaW50c1xuZnVuY3Rpb24gZGVkdXBQb2ludHMgKGZsb2F0UG9pbnRzLCByYXRQb2ludHMsIGZsb2F0Qm91bmRzKSB7XG4gIHZhciBudW1Qb2ludHMgPSByYXRQb2ludHMubGVuZ3RoXG4gIHZhciB1ZiA9IG5ldyBVbmlvbkZpbmQobnVtUG9pbnRzKVxuXG4gIC8vIENvbXB1dGUgcmF0aW9uYWwgYm91bmRzXG4gIHZhciBib3VuZHMgPSBbXVxuICBmb3IgKHZhciBpID0gMDsgaSA8IHJhdFBvaW50cy5sZW5ndGg7ICsraSkge1xuICAgIHZhciBwID0gcmF0UG9pbnRzW2ldXG4gICAgdmFyIHhiID0gYm91bmRSYXQocFswXSlcbiAgICB2YXIgeWIgPSBib3VuZFJhdChwWzFdKVxuICAgIGJvdW5kcy5wdXNoKFtcbiAgICAgIG5leHRhZnRlcih4YlswXSwgLUluZmluaXR5KSxcbiAgICAgIG5leHRhZnRlcih5YlswXSwgLUluZmluaXR5KSxcbiAgICAgIG5leHRhZnRlcih4YlsxXSwgSW5maW5pdHkpLFxuICAgICAgbmV4dGFmdGVyKHliWzFdLCBJbmZpbml0eSlcbiAgICBdKVxuICB9XG5cbiAgLy8gTGluayBhbGwgcG9pbnRzIHdpdGggb3ZlciBsYXBwaW5nIGJveGVzXG4gIGJveEludGVyc2VjdChib3VuZHMsIGZ1bmN0aW9uIChpLCBqKSB7XG4gICAgdWYubGluayhpLCBqKVxuICB9KVxuXG4gIC8vIERvIDEgcGFzcyBvdmVyIHBvaW50cyB0byBjb21iaW5lIHBvaW50cyBpbiBsYWJlbCBzZXRzXG4gIHZhciBub0R1cGVzID0gdHJ1ZVxuICB2YXIgbGFiZWxzID0gbmV3IEFycmF5KG51bVBvaW50cylcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBudW1Qb2ludHM7ICsraSkge1xuICAgIHZhciBqID0gdWYuZmluZChpKVxuICAgIGlmIChqICE9PSBpKSB7XG4gICAgICAvLyBDbGVhciBuby1kdXBlcyBmbGFnLCB6ZXJvIG91dCBsYWJlbFxuICAgICAgbm9EdXBlcyA9IGZhbHNlXG4gICAgICAvLyBNYWtlIGVhY2ggcG9pbnQgdGhlIHRvcC1sZWZ0IHBvaW50IGZyb20gaXRzIGNlbGxcbiAgICAgIGZsb2F0UG9pbnRzW2pdID0gW1xuICAgICAgICBNYXRoLm1pbihmbG9hdFBvaW50c1tpXVswXSwgZmxvYXRQb2ludHNbal1bMF0pLFxuICAgICAgICBNYXRoLm1pbihmbG9hdFBvaW50c1tpXVsxXSwgZmxvYXRQb2ludHNbal1bMV0pXG4gICAgICBdXG4gICAgfVxuICB9XG5cbiAgLy8gSWYgbm8gZHVwbGljYXRlcywgcmV0dXJuIG51bGwgdG8gc2lnbmFsIHRlcm1pbmF0aW9uXG4gIGlmIChub0R1cGVzKSB7XG4gICAgcmV0dXJuIG51bGxcbiAgfVxuXG4gIHZhciBwdHIgPSAwXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbnVtUG9pbnRzOyArK2kpIHtcbiAgICB2YXIgaiA9IHVmLmZpbmQoaSlcbiAgICBpZiAoaiA9PT0gaSkge1xuICAgICAgbGFiZWxzW2ldID0gcHRyXG4gICAgICBmbG9hdFBvaW50c1twdHIrK10gPSBmbG9hdFBvaW50c1tpXVxuICAgIH0gZWxzZSB7XG4gICAgICBsYWJlbHNbaV0gPSAtMVxuICAgIH1cbiAgfVxuXG4gIGZsb2F0UG9pbnRzLmxlbmd0aCA9IHB0clxuXG4gIC8vIERvIGEgc2Vjb25kIHBhc3MgdG8gZml4IHVwIG1pc3NpbmcgbGFiZWxzXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbnVtUG9pbnRzOyArK2kpIHtcbiAgICBpZiAobGFiZWxzW2ldIDwgMCkge1xuICAgICAgbGFiZWxzW2ldID0gbGFiZWxzW3VmLmZpbmQoaSldXG4gICAgfVxuICB9XG5cbiAgLy8gUmV0dXJuIHJlc3VsdGluZyB1bmlvbi1maW5kIGRhdGEgc3RydWN0dXJlXG4gIHJldHVybiBsYWJlbHNcbn1cblxuZnVuY3Rpb24gY29tcGFyZUxleDIgKGEsIGIpIHsgcmV0dXJuIChhWzBdIC0gYlswXSkgfHwgKGFbMV0gLSBiWzFdKSB9XG5mdW5jdGlvbiBjb21wYXJlTGV4MyAoYSwgYikge1xuICB2YXIgZCA9IChhWzBdIC0gYlswXSkgfHwgKGFbMV0gLSBiWzFdKVxuICBpZiAoZCkge1xuICAgIHJldHVybiBkXG4gIH1cbiAgaWYgKGFbMl0gPCBiWzJdKSB7XG4gICAgcmV0dXJuIC0xXG4gIH0gZWxzZSBpZiAoYVsyXSA+IGJbMl0pIHtcbiAgICByZXR1cm4gMVxuICB9XG4gIHJldHVybiAwXG59XG5cbi8vIFJlbW92ZSBkdXBsaWNhdGUgZWRnZSBsYWJlbHNcbmZ1bmN0aW9uIGRlZHVwRWRnZXMgKGVkZ2VzLCBsYWJlbHMsIHVzZUNvbG9yKSB7XG4gIGlmIChlZGdlcy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm5cbiAgfVxuICBpZiAobGFiZWxzKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBlZGdlcy5sZW5ndGg7ICsraSkge1xuICAgICAgdmFyIGUgPSBlZGdlc1tpXVxuICAgICAgdmFyIGEgPSBsYWJlbHNbZVswXV1cbiAgICAgIHZhciBiID0gbGFiZWxzW2VbMV1dXG4gICAgICBlWzBdID0gTWF0aC5taW4oYSwgYilcbiAgICAgIGVbMV0gPSBNYXRoLm1heChhLCBiKVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGVkZ2VzLmxlbmd0aDsgKytpKSB7XG4gICAgICB2YXIgZSA9IGVkZ2VzW2ldXG4gICAgICB2YXIgYSA9IGVbMF1cbiAgICAgIHZhciBiID0gZVsxXVxuICAgICAgZVswXSA9IE1hdGgubWluKGEsIGIpXG4gICAgICBlWzFdID0gTWF0aC5tYXgoYSwgYilcbiAgICB9XG4gIH1cbiAgaWYgKHVzZUNvbG9yKSB7XG4gICAgZWRnZXMuc29ydChjb21wYXJlTGV4MylcbiAgfSBlbHNlIHtcbiAgICBlZGdlcy5zb3J0KGNvbXBhcmVMZXgyKVxuICB9XG4gIHZhciBwdHIgPSAxXG4gIGZvciAodmFyIGkgPSAxOyBpIDwgZWRnZXMubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgcHJldiA9IGVkZ2VzW2kgLSAxXVxuICAgIHZhciBuZXh0ID0gZWRnZXNbaV1cbiAgICBpZiAobmV4dFswXSA9PT0gcHJldlswXSAmJiBuZXh0WzFdID09PSBwcmV2WzFdICYmXG4gICAgICAoIXVzZUNvbG9yIHx8IG5leHRbMl0gPT09IHByZXZbMl0pKSB7XG4gICAgICBjb250aW51ZVxuICAgIH1cbiAgICBlZGdlc1twdHIrK10gPSBuZXh0XG4gIH1cbiAgZWRnZXMubGVuZ3RoID0gcHRyXG59XG5cbmZ1bmN0aW9uIHByZVJvdW5kIChwb2ludHMsIGVkZ2VzLCB1c2VDb2xvcikge1xuICB2YXIgbGFiZWxzID0gZGVkdXBQb2ludHMocG9pbnRzLCBbXSwgYm91bmRQb2ludHMocG9pbnRzKSlcbiAgZGVkdXBFZGdlcyhlZGdlcywgbGFiZWxzLCB1c2VDb2xvcilcbiAgcmV0dXJuICEhbGFiZWxzXG59XG5cbi8vIFJlcGVhdCB1bnRpbCBjb252ZXJnZW5jZVxuZnVuY3Rpb24gc25hcFJvdW5kIChwb2ludHMsIGVkZ2VzLCB1c2VDb2xvcikge1xuICAvLyAxLiBmaW5kIGVkZ2UgY3Jvc3NpbmdzXG4gIHZhciBlZGdlQm91bmRzID0gYm91bmRFZGdlcyhwb2ludHMsIGVkZ2VzKVxuICB2YXIgY3Jvc3NpbmdzID0gZ2V0Q3Jvc3NpbmdzKHBvaW50cywgZWRnZXMsIGVkZ2VCb3VuZHMpXG5cbiAgLy8gMi4gZmluZCB0LWp1bmN0aW9uc1xuICB2YXIgdmVydEJvdW5kcyA9IGJvdW5kUG9pbnRzKHBvaW50cylcbiAgdmFyIHRqdW5jdGlvbnMgPSBnZXRUSnVuY3Rpb25zKHBvaW50cywgZWRnZXMsIGVkZ2VCb3VuZHMsIHZlcnRCb3VuZHMpXG5cbiAgLy8gMy4gY3V0IGVkZ2VzLCBjb25zdHJ1Y3QgcmF0aW9uYWwgcG9pbnRzXG4gIHZhciByYXRQb2ludHMgPSBjdXRFZGdlcyhwb2ludHMsIGVkZ2VzLCBjcm9zc2luZ3MsIHRqdW5jdGlvbnMsIHVzZUNvbG9yKVxuXG4gIC8vIDQuIGRlZHVwZSB2ZXJ0c1xuICB2YXIgbGFiZWxzID0gZGVkdXBQb2ludHMocG9pbnRzLCByYXRQb2ludHMsIHZlcnRCb3VuZHMpXG5cbiAgLy8gNS4gZGVkdXBlIGVkZ2VzXG4gIGRlZHVwRWRnZXMoZWRnZXMsIGxhYmVscywgdXNlQ29sb3IpXG5cbiAgLy8gNi4gY2hlY2sgdGVybWluYXRpb25cbiAgaWYgKCFsYWJlbHMpIHtcbiAgICByZXR1cm4gKGNyb3NzaW5ncy5sZW5ndGggPiAwIHx8IHRqdW5jdGlvbnMubGVuZ3RoID4gMClcbiAgfVxuXG4gIC8vIE1vcmUgaXRlcmF0aW9ucyBuZWNlc3NhcnlcbiAgcmV0dXJuIHRydWVcbn1cblxuLy8gTWFpbiBsb29wLCBydW5zIFBTTEcgY2xlYW4gdXAgdW50aWwgY29tcGxldGlvblxuZnVuY3Rpb24gY2xlYW5QU0xHIChwb2ludHMsIGVkZ2VzLCBjb2xvcnMpIHtcbiAgLy8gSWYgdXNpbmcgY29sb3JzLCBhdWdtZW50IGVkZ2VzIHdpdGggY29sb3IgZGF0YVxuICB2YXIgcHJldkVkZ2VzXG4gIGlmIChjb2xvcnMpIHtcbiAgICBwcmV2RWRnZXMgPSBlZGdlc1xuICAgIHZhciBhdWdFZGdlcyA9IG5ldyBBcnJheShlZGdlcy5sZW5ndGgpXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBlZGdlcy5sZW5ndGg7ICsraSkge1xuICAgICAgdmFyIGUgPSBlZGdlc1tpXVxuICAgICAgYXVnRWRnZXNbaV0gPSBbZVswXSwgZVsxXSwgY29sb3JzW2ldXVxuICAgIH1cbiAgICBlZGdlcyA9IGF1Z0VkZ2VzXG4gIH1cblxuICAvLyBGaXJzdCByb3VuZDogcmVtb3ZlIGR1cGxpY2F0ZSBlZGdlcyBhbmQgcG9pbnRzXG4gIHZhciBtb2RpZmllZCA9IHByZVJvdW5kKHBvaW50cywgZWRnZXMsICEhY29sb3JzKVxuXG4gIC8vIFJ1biBzbmFwIHJvdW5kaW5nIHVudGlsIGNvbnZlcmdlbmNlXG4gIHdoaWxlIChzbmFwUm91bmQocG9pbnRzLCBlZGdlcywgISFjb2xvcnMpKSB7XG4gICAgbW9kaWZpZWQgPSB0cnVlXG4gIH1cblxuICAvLyBTdHJpcCBjb2xvciB0YWdzXG4gIGlmICghIWNvbG9ycyAmJiBtb2RpZmllZCkge1xuICAgIHByZXZFZGdlcy5sZW5ndGggPSAwXG4gICAgY29sb3JzLmxlbmd0aCA9IDBcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGVkZ2VzLmxlbmd0aDsgKytpKSB7XG4gICAgICB2YXIgZSA9IGVkZ2VzW2ldXG4gICAgICBwcmV2RWRnZXMucHVzaChbZVswXSwgZVsxXV0pXG4gICAgICBjb2xvcnMucHVzaChlWzJdKVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiBtb2RpZmllZFxufVxuIiwiJ3VzZSBzdHJpY3QnXG5cbm1vZHVsZS5leHBvcnRzID0gc29sdmVJbnRlcnNlY3Rpb25cblxudmFyIHJhdE11bCA9IHJlcXVpcmUoJ2JpZy1yYXQvbXVsJylcbnZhciByYXREaXYgPSByZXF1aXJlKCdiaWctcmF0L2RpdicpXG52YXIgcmF0U3ViID0gcmVxdWlyZSgnYmlnLXJhdC9zdWInKVxudmFyIHJhdFNpZ24gPSByZXF1aXJlKCdiaWctcmF0L3NpZ24nKVxudmFyIHJ2U3ViID0gcmVxdWlyZSgncmF0LXZlYy9zdWInKVxudmFyIHJ2QWRkID0gcmVxdWlyZSgncmF0LXZlYy9hZGQnKVxudmFyIHJ2TXVscyA9IHJlcXVpcmUoJ3JhdC12ZWMvbXVscycpXG5cbmZ1bmN0aW9uIHJhdFBlcnAgKGEsIGIpIHtcbiAgcmV0dXJuIHJhdFN1YihyYXRNdWwoYVswXSwgYlsxXSksIHJhdE11bChhWzFdLCBiWzBdKSlcbn1cblxuLy8gU29sdmUgZm9yIGludGVyc2VjdGlvblxuLy8gIHggPSBhICsgdCAoYi1hKVxuLy8gICh4IC0gYykgXiAoZC1jKSA9IDBcbi8vICAodCAqIChiLWEpICsgKGEtYykgKSBeIChkLWMpID0gMFxuLy8gIHQgKiAoYi1hKV4oZC1jKSA9IChkLWMpXihhLWMpXG4vLyAgdCA9IChkLWMpXihhLWMpIC8gKGItYSleKGQtYylcblxuZnVuY3Rpb24gc29sdmVJbnRlcnNlY3Rpb24gKGEsIGIsIGMsIGQpIHtcbiAgdmFyIGJhID0gcnZTdWIoYiwgYSlcbiAgdmFyIGRjID0gcnZTdWIoZCwgYylcblxuICB2YXIgYmFYZGMgPSByYXRQZXJwKGJhLCBkYylcblxuICBpZiAocmF0U2lnbihiYVhkYykgPT09IDApIHtcbiAgICByZXR1cm4gbnVsbFxuICB9XG5cbiAgdmFyIGFjID0gcnZTdWIoYSwgYylcbiAgdmFyIGRjWGFjID0gcmF0UGVycChkYywgYWMpXG5cbiAgdmFyIHQgPSByYXREaXYoZGNYYWMsIGJhWGRjKVxuICB2YXIgcyA9IHJ2TXVscyhiYSwgdClcbiAgdmFyIHIgPSBydkFkZChhLCBzKVxuXG4gIHJldHVybiByXG59XG4iLCIoZnVuY3Rpb24gKEJ1ZmZlcil7XG52YXIgaGFzVHlwZWRBcnJheXMgPSBmYWxzZVxuaWYodHlwZW9mIEZsb2F0NjRBcnJheSAhPT0gXCJ1bmRlZmluZWRcIikge1xuICB2YXIgRE9VQkxFX1ZJRVcgPSBuZXcgRmxvYXQ2NEFycmF5KDEpXG4gICAgLCBVSU5UX1ZJRVcgICA9IG5ldyBVaW50MzJBcnJheShET1VCTEVfVklFVy5idWZmZXIpXG4gIERPVUJMRV9WSUVXWzBdID0gMS4wXG4gIGhhc1R5cGVkQXJyYXlzID0gdHJ1ZVxuICBpZihVSU5UX1ZJRVdbMV0gPT09IDB4M2ZmMDAwMDApIHtcbiAgICAvL1VzZSBsaXR0bGUgZW5kaWFuXG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBkb3VibGVCaXRzTEUobikge1xuICAgICAgRE9VQkxFX1ZJRVdbMF0gPSBuXG4gICAgICByZXR1cm4gWyBVSU5UX1ZJRVdbMF0sIFVJTlRfVklFV1sxXSBdXG4gICAgfVxuICAgIGZ1bmN0aW9uIHRvRG91YmxlTEUobG8sIGhpKSB7XG4gICAgICBVSU5UX1ZJRVdbMF0gPSBsb1xuICAgICAgVUlOVF9WSUVXWzFdID0gaGlcbiAgICAgIHJldHVybiBET1VCTEVfVklFV1swXVxuICAgIH1cbiAgICBtb2R1bGUuZXhwb3J0cy5wYWNrID0gdG9Eb3VibGVMRVxuICAgIGZ1bmN0aW9uIGxvd1VpbnRMRShuKSB7XG4gICAgICBET1VCTEVfVklFV1swXSA9IG5cbiAgICAgIHJldHVybiBVSU5UX1ZJRVdbMF1cbiAgICB9XG4gICAgbW9kdWxlLmV4cG9ydHMubG8gPSBsb3dVaW50TEVcbiAgICBmdW5jdGlvbiBoaWdoVWludExFKG4pIHtcbiAgICAgIERPVUJMRV9WSUVXWzBdID0gblxuICAgICAgcmV0dXJuIFVJTlRfVklFV1sxXVxuICAgIH1cbiAgICBtb2R1bGUuZXhwb3J0cy5oaSA9IGhpZ2hVaW50TEVcbiAgfSBlbHNlIGlmKFVJTlRfVklFV1swXSA9PT0gMHgzZmYwMDAwMCkge1xuICAgIC8vVXNlIGJpZyBlbmRpYW5cbiAgICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGRvdWJsZUJpdHNCRShuKSB7XG4gICAgICBET1VCTEVfVklFV1swXSA9IG5cbiAgICAgIHJldHVybiBbIFVJTlRfVklFV1sxXSwgVUlOVF9WSUVXWzBdIF1cbiAgICB9XG4gICAgZnVuY3Rpb24gdG9Eb3VibGVCRShsbywgaGkpIHtcbiAgICAgIFVJTlRfVklFV1sxXSA9IGxvXG4gICAgICBVSU5UX1ZJRVdbMF0gPSBoaVxuICAgICAgcmV0dXJuIERPVUJMRV9WSUVXWzBdXG4gICAgfVxuICAgIG1vZHVsZS5leHBvcnRzLnBhY2sgPSB0b0RvdWJsZUJFXG4gICAgZnVuY3Rpb24gbG93VWludEJFKG4pIHtcbiAgICAgIERPVUJMRV9WSUVXWzBdID0gblxuICAgICAgcmV0dXJuIFVJTlRfVklFV1sxXVxuICAgIH1cbiAgICBtb2R1bGUuZXhwb3J0cy5sbyA9IGxvd1VpbnRCRVxuICAgIGZ1bmN0aW9uIGhpZ2hVaW50QkUobikge1xuICAgICAgRE9VQkxFX1ZJRVdbMF0gPSBuXG4gICAgICByZXR1cm4gVUlOVF9WSUVXWzBdXG4gICAgfVxuICAgIG1vZHVsZS5leHBvcnRzLmhpID0gaGlnaFVpbnRCRVxuICB9IGVsc2Uge1xuICAgIGhhc1R5cGVkQXJyYXlzID0gZmFsc2VcbiAgfVxufVxuaWYoIWhhc1R5cGVkQXJyYXlzKSB7XG4gIHZhciBidWZmZXIgPSBuZXcgQnVmZmVyKDgpXG4gIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZG91YmxlQml0cyhuKSB7XG4gICAgYnVmZmVyLndyaXRlRG91YmxlTEUobiwgMCwgdHJ1ZSlcbiAgICByZXR1cm4gWyBidWZmZXIucmVhZFVJbnQzMkxFKDAsIHRydWUpLCBidWZmZXIucmVhZFVJbnQzMkxFKDQsIHRydWUpIF1cbiAgfVxuICBmdW5jdGlvbiB0b0RvdWJsZShsbywgaGkpIHtcbiAgICBidWZmZXIud3JpdGVVSW50MzJMRShsbywgMCwgdHJ1ZSlcbiAgICBidWZmZXIud3JpdGVVSW50MzJMRShoaSwgNCwgdHJ1ZSlcbiAgICByZXR1cm4gYnVmZmVyLnJlYWREb3VibGVMRSgwLCB0cnVlKVxuICB9XG4gIG1vZHVsZS5leHBvcnRzLnBhY2sgPSB0b0RvdWJsZSAgXG4gIGZ1bmN0aW9uIGxvd1VpbnQobikge1xuICAgIGJ1ZmZlci53cml0ZURvdWJsZUxFKG4sIDAsIHRydWUpXG4gICAgcmV0dXJuIGJ1ZmZlci5yZWFkVUludDMyTEUoMCwgdHJ1ZSlcbiAgfVxuICBtb2R1bGUuZXhwb3J0cy5sbyA9IGxvd1VpbnRcbiAgZnVuY3Rpb24gaGlnaFVpbnQobikge1xuICAgIGJ1ZmZlci53cml0ZURvdWJsZUxFKG4sIDAsIHRydWUpXG4gICAgcmV0dXJuIGJ1ZmZlci5yZWFkVUludDMyTEUoNCwgdHJ1ZSlcbiAgfVxuICBtb2R1bGUuZXhwb3J0cy5oaSA9IGhpZ2hVaW50XG59XG5cbm1vZHVsZS5leHBvcnRzLnNpZ24gPSBmdW5jdGlvbihuKSB7XG4gIHJldHVybiBtb2R1bGUuZXhwb3J0cy5oaShuKSA+Pj4gMzFcbn1cblxubW9kdWxlLmV4cG9ydHMuZXhwb25lbnQgPSBmdW5jdGlvbihuKSB7XG4gIHZhciBiID0gbW9kdWxlLmV4cG9ydHMuaGkobilcbiAgcmV0dXJuICgoYjw8MSkgPj4+IDIxKSAtIDEwMjNcbn1cblxubW9kdWxlLmV4cG9ydHMuZnJhY3Rpb24gPSBmdW5jdGlvbihuKSB7XG4gIHZhciBsbyA9IG1vZHVsZS5leHBvcnRzLmxvKG4pXG4gIHZhciBoaSA9IG1vZHVsZS5leHBvcnRzLmhpKG4pXG4gIHZhciBiID0gaGkgJiAoKDE8PDIwKSAtIDEpXG4gIGlmKGhpICYgMHg3ZmYwMDAwMCkge1xuICAgIGIgKz0gKDE8PDIwKVxuICB9XG4gIHJldHVybiBbbG8sIGJdXG59XG5cbm1vZHVsZS5leHBvcnRzLmRlbm9ybWFsaXplZCA9IGZ1bmN0aW9uKG4pIHtcbiAgdmFyIGhpID0gbW9kdWxlLmV4cG9ydHMuaGkobilcbiAgcmV0dXJuICEoaGkgJiAweDdmZjAwMDAwKVxufVxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyKSIsIlwidXNlIHN0cmljdFwiXG5cbmZ1bmN0aW9uIGR1cGVfYXJyYXkoY291bnQsIHZhbHVlLCBpKSB7XG4gIHZhciBjID0gY291bnRbaV18MFxuICBpZihjIDw9IDApIHtcbiAgICByZXR1cm4gW11cbiAgfVxuICB2YXIgcmVzdWx0ID0gbmV3IEFycmF5KGMpLCBqXG4gIGlmKGkgPT09IGNvdW50Lmxlbmd0aC0xKSB7XG4gICAgZm9yKGo9MDsgajxjOyArK2opIHtcbiAgICAgIHJlc3VsdFtqXSA9IHZhbHVlXG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGZvcihqPTA7IGo8YzsgKytqKSB7XG4gICAgICByZXN1bHRbal0gPSBkdXBlX2FycmF5KGNvdW50LCB2YWx1ZSwgaSsxKVxuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0XG59XG5cbmZ1bmN0aW9uIGR1cGVfbnVtYmVyKGNvdW50LCB2YWx1ZSkge1xuICB2YXIgcmVzdWx0LCBpXG4gIHJlc3VsdCA9IG5ldyBBcnJheShjb3VudClcbiAgZm9yKGk9MDsgaTxjb3VudDsgKytpKSB7XG4gICAgcmVzdWx0W2ldID0gdmFsdWVcbiAgfVxuICByZXR1cm4gcmVzdWx0XG59XG5cbmZ1bmN0aW9uIGR1cGUoY291bnQsIHZhbHVlKSB7XG4gIGlmKHR5cGVvZiB2YWx1ZSA9PT0gXCJ1bmRlZmluZWRcIikge1xuICAgIHZhbHVlID0gMFxuICB9XG4gIHN3aXRjaCh0eXBlb2YgY291bnQpIHtcbiAgICBjYXNlIFwibnVtYmVyXCI6XG4gICAgICBpZihjb3VudCA+IDApIHtcbiAgICAgICAgcmV0dXJuIGR1cGVfbnVtYmVyKGNvdW50fDAsIHZhbHVlKVxuICAgICAgfVxuICAgIGJyZWFrXG4gICAgY2FzZSBcIm9iamVjdFwiOlxuICAgICAgaWYodHlwZW9mIChjb3VudC5sZW5ndGgpID09PSBcIm51bWJlclwiKSB7XG4gICAgICAgIHJldHVybiBkdXBlX2FycmF5KGNvdW50LCB2YWx1ZSwgMClcbiAgICAgIH1cbiAgICBicmVha1xuICB9XG4gIHJldHVybiBbXVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGR1cGUiLCJ2YXIgcGFyc2VYbWwgPSByZXF1aXJlKCd4bWwtcGFyc2UtZnJvbS1zdHJpbmcnKVxuXG5mdW5jdGlvbiBleHRyYWN0U3ZnUGF0aCAoc3ZnRG9jKSB7XG4gIC8vIGNvbmNhdCBhbGwgdGhlIDxwYXRoPiBlbGVtZW50cyB0byBmb3JtIGFuIFNWRyBwYXRoIHN0cmluZ1xuICBpZiAodHlwZW9mIHN2Z0RvYyA9PT0gJ3N0cmluZycpIHtcbiAgICBzdmdEb2MgPSBwYXJzZVhtbChzdmdEb2MpXG4gIH1cbiAgaWYgKCFzdmdEb2MgfHwgdHlwZW9mIHN2Z0RvYy5nZXRFbGVtZW50c0J5VGFnTmFtZSAhPT0gJ2Z1bmN0aW9uJykge1xuICAgIHRocm93IG5ldyBFcnJvcignY291bGQgbm90IGdldCBhbiBYTUwgZG9jdW1lbnQgZnJvbSB0aGUgc3BlY2lmaWVkIFNWRyBjb250ZW50cycpXG4gIH1cblxuICB2YXIgcGF0aHMgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChzdmdEb2MuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ3BhdGgnKSlcbiAgcmV0dXJuIHBhdGhzLnJlZHVjZShmdW5jdGlvbiAocHJldiwgcGF0aCkge1xuICAgIHZhciBkID0gcGF0aC5nZXRBdHRyaWJ1dGUoJ2QnKSB8fCAnJ1xuICAgIHJldHVybiBwcmV2ICsgJyAnICsgZC5yZXBsYWNlKC9cXHMrL2csICcgJykudHJpbSgpXG4gIH0sICcnKS50cmltKClcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoKSB7XG4gIHRocm93IG5ldyBFcnJvcigndXNlIGV4dHJhY3Qtc3ZnLXBhdGgvdHJhbnNmb3JtIHRvIGlubGluZSBTVkcgY29udGVudHMgaW50byB5b3VyIGJ1bmRsZScpXG59XG5cbm1vZHVsZS5leHBvcnRzLnBhcnNlID0gZXh0cmFjdFN2Z1BhdGhcblxuLy9kZXByZWNhdGVkXG5tb2R1bGUuZXhwb3J0cy5mcm9tU3RyaW5nID0gZXh0cmFjdFN2Z1BhdGhcbiIsIm1vZHVsZS5leHBvcnRzID0gcmVpbmRleFxuXG5mdW5jdGlvbiByZWluZGV4KGFycmF5KSB7XG4gIHZhciBwb3MgPSBbXVxuICB2YXIgY2VsID0gW11cblxuICB2YXIgaSA9IDBcbiAgdmFyIGMgPSAwXG4gIHdoaWxlIChpIDwgYXJyYXkubGVuZ3RoKSB7XG4gICAgY2VsLnB1c2goW2MrKywgYysrLCBjKytdKVxuICAgIHBvcy5wdXNoKFtcbiAgICAgICAgYXJyYXlbaSsrXVxuICAgICAgLCBhcnJheVtpKytdXG4gICAgICAsIGFycmF5W2krK11cbiAgICBdLCBbXG4gICAgICAgIGFycmF5W2krK11cbiAgICAgICwgYXJyYXlbaSsrXVxuICAgICAgLCBhcnJheVtpKytdXG4gICAgXSwgW1xuICAgICAgICBhcnJheVtpKytdXG4gICAgICAsIGFycmF5W2krK11cbiAgICAgICwgYXJyYXlbaSsrXVxuICAgIF0pXG4gIH1cblxuICByZXR1cm4ge1xuICAgICAgcG9zaXRpb25zOiBwb3NcbiAgICAsIGNlbGxzOiBjZWxcbiAgfVxufVxuIiwiXCJ1c2Ugc3RyaWN0XCJcblxudmFyIGRvdWJsZUJpdHMgPSByZXF1aXJlKFwiZG91YmxlLWJpdHNcIilcblxudmFyIFNNQUxMRVNUX0RFTk9STSA9IE1hdGgucG93KDIsIC0xMDc0KVxudmFyIFVJTlRfTUFYID0gKC0xKT4+PjBcblxubW9kdWxlLmV4cG9ydHMgPSBuZXh0YWZ0ZXJcblxuZnVuY3Rpb24gbmV4dGFmdGVyKHgsIHkpIHtcbiAgaWYoaXNOYU4oeCkgfHwgaXNOYU4oeSkpIHtcbiAgICByZXR1cm4gTmFOXG4gIH1cbiAgaWYoeCA9PT0geSkge1xuICAgIHJldHVybiB4XG4gIH1cbiAgaWYoeCA9PT0gMCkge1xuICAgIGlmKHkgPCAwKSB7XG4gICAgICByZXR1cm4gLVNNQUxMRVNUX0RFTk9STVxuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gU01BTExFU1RfREVOT1JNXG4gICAgfVxuICB9XG4gIHZhciBoaSA9IGRvdWJsZUJpdHMuaGkoeClcbiAgdmFyIGxvID0gZG91YmxlQml0cy5sbyh4KVxuICBpZigoeSA+IHgpID09PSAoeCA+IDApKSB7XG4gICAgaWYobG8gPT09IFVJTlRfTUFYKSB7XG4gICAgICBoaSArPSAxXG4gICAgICBsbyA9IDBcbiAgICB9IGVsc2Uge1xuICAgICAgbG8gKz0gMVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBpZihsbyA9PT0gMCkge1xuICAgICAgbG8gPSBVSU5UX01BWFxuICAgICAgaGkgLT0gMVxuICAgIH0gZWxzZSB7XG4gICAgICBsbyAtPSAxXG4gICAgfVxuICB9XG4gIHJldHVybiBkb3VibGVCaXRzLnBhY2sobG8sIGhpKVxufSIsInZhciBnZXRCb3VuZHMgPSByZXF1aXJlKCdib3VuZC1wb2ludHMnKVxudmFyIHVubGVycCA9IHJlcXVpcmUoJ3VubGVycCcpXG5cbm1vZHVsZS5leHBvcnRzID0gbm9ybWFsaXplUGF0aFNjYWxlXG5mdW5jdGlvbiBub3JtYWxpemVQYXRoU2NhbGUgKHBvc2l0aW9ucywgYm91bmRzKSB7XG4gIGlmICghQXJyYXkuaXNBcnJheShwb3NpdGlvbnMpKSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcignbXVzdCBzcGVjaWZ5IHBvc2l0aW9ucyBhcyBmaXJzdCBhcmd1bWVudCcpXG4gIH1cbiAgaWYgKCFBcnJheS5pc0FycmF5KGJvdW5kcykpIHtcbiAgICBib3VuZHMgPSBnZXRCb3VuZHMocG9zaXRpb25zKVxuICB9XG5cbiAgdmFyIG1pbiA9IGJvdW5kc1swXVxuICB2YXIgbWF4ID0gYm91bmRzWzFdXG5cbiAgdmFyIHdpZHRoID0gbWF4WzBdIC0gbWluWzBdXG4gIHZhciBoZWlnaHQgPSBtYXhbMV0gLSBtaW5bMV1cblxuICB2YXIgYXNwZWN0WCA9IHdpZHRoID4gaGVpZ2h0ID8gMSA6IChoZWlnaHQgLyB3aWR0aClcbiAgdmFyIGFzcGVjdFkgPSB3aWR0aCA+IGhlaWdodCA/ICh3aWR0aCAvIGhlaWdodCkgOiAxXG5cbiAgaWYgKG1heFswXSAtIG1pblswXSA9PT0gMCB8fCBtYXhbMV0gLSBtaW5bMV0gPT09IDApIHtcbiAgICByZXR1cm4gcG9zaXRpb25zIC8vIGRpdiBieSB6ZXJvOyBsZWF2ZSBwb3NpdGlvbnMgdW5jaGFuZ2VkXG4gIH1cblxuICBmb3IgKHZhciBpID0gMDsgaSA8IHBvc2l0aW9ucy5sZW5ndGg7IGkrKykge1xuICAgIHZhciBwb3MgPSBwb3NpdGlvbnNbaV1cbiAgICBwb3NbMF0gPSAodW5sZXJwKG1pblswXSwgbWF4WzBdLCBwb3NbMF0pICogMiAtIDEpIC8gYXNwZWN0WFxuICAgIHBvc1sxXSA9ICh1bmxlcnAobWluWzFdLCBtYXhbMV0sIHBvc1sxXSkgKiAyIC0gMSkgLyBhc3BlY3RZXG4gIH1cbiAgcmV0dXJuIHBvc2l0aW9uc1xufSIsIlxudmFyIM+AID0gTWF0aC5QSVxudmFyIF8xMjAgPSByYWRpYW5zKDEyMClcblxubW9kdWxlLmV4cG9ydHMgPSBub3JtYWxpemVcblxuLyoqXG4gKiBkZXNjcmliZSBgcGF0aGAgaW4gdGVybXMgb2YgY3ViaWMgYsOpemllciBcbiAqIGN1cnZlcyBhbmQgbW92ZSBjb21tYW5kc1xuICpcbiAqIEBwYXJhbSB7QXJyYXl9IHBhdGhcbiAqIEByZXR1cm4ge0FycmF5fVxuICovXG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZShwYXRoKXtcblx0Ly8gaW5pdCBzdGF0ZVxuXHR2YXIgcHJldlxuXHR2YXIgcmVzdWx0ID0gW11cblx0dmFyIGJlemllclggPSAwXG5cdHZhciBiZXppZXJZID0gMFxuXHR2YXIgc3RhcnRYID0gMFxuXHR2YXIgc3RhcnRZID0gMFxuXHR2YXIgcXVhZFggPSBudWxsXG5cdHZhciBxdWFkWSA9IG51bGxcblx0dmFyIHggPSAwXG5cdHZhciB5ID0gMFxuXG5cdGZvciAodmFyIGkgPSAwLCBsZW4gPSBwYXRoLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0dmFyIHNlZyA9IHBhdGhbaV1cblx0XHR2YXIgY29tbWFuZCA9IHNlZ1swXVxuXHRcdHN3aXRjaCAoY29tbWFuZCkge1xuXHRcdFx0Y2FzZSAnTSc6XG5cdFx0XHRcdHN0YXJ0WCA9IHNlZ1sxXVxuXHRcdFx0XHRzdGFydFkgPSBzZWdbMl1cblx0XHRcdFx0YnJlYWtcblx0XHRcdGNhc2UgJ0EnOlxuXHRcdFx0XHRzZWcgPSBhcmMoeCwgeSxzZWdbMV0sc2VnWzJdLHJhZGlhbnMoc2VnWzNdKSxzZWdbNF0sc2VnWzVdLHNlZ1s2XSxzZWdbN10pXG5cdFx0XHRcdC8vIHNwbGl0IG11bHRpIHBhcnRcblx0XHRcdFx0c2VnLnVuc2hpZnQoJ0MnKVxuXHRcdFx0XHRpZiAoc2VnLmxlbmd0aCA+IDcpIHtcblx0XHRcdFx0XHRyZXN1bHQucHVzaChzZWcuc3BsaWNlKDAsIDcpKVxuXHRcdFx0XHRcdHNlZy51bnNoaWZ0KCdDJylcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVha1xuXHRcdFx0Y2FzZSAnUyc6XG5cdFx0XHRcdC8vIGRlZmF1bHQgY29udHJvbCBwb2ludFxuXHRcdFx0XHR2YXIgY3ggPSB4XG5cdFx0XHRcdHZhciBjeSA9IHlcblx0XHRcdFx0aWYgKHByZXYgPT0gJ0MnIHx8IHByZXYgPT0gJ1MnKSB7XG5cdFx0XHRcdFx0Y3ggKz0gY3ggLSBiZXppZXJYIC8vIHJlZmxlY3QgdGhlIHByZXZpb3VzIGNvbW1hbmQncyBjb250cm9sXG5cdFx0XHRcdFx0Y3kgKz0gY3kgLSBiZXppZXJZIC8vIHBvaW50IHJlbGF0aXZlIHRvIHRoZSBjdXJyZW50IHBvaW50XG5cdFx0XHRcdH1cblx0XHRcdFx0c2VnID0gWydDJywgY3gsIGN5LCBzZWdbMV0sIHNlZ1syXSwgc2VnWzNdLCBzZWdbNF1dXG5cdFx0XHRcdGJyZWFrXG5cdFx0XHRjYXNlICdUJzpcblx0XHRcdFx0aWYgKHByZXYgPT0gJ1EnIHx8IHByZXYgPT0gJ1QnKSB7XG5cdFx0XHRcdFx0cXVhZFggPSB4ICogMiAtIHF1YWRYIC8vIGFzIHdpdGggJ1MnIHJlZmxlY3QgcHJldmlvdXMgY29udHJvbCBwb2ludFxuXHRcdFx0XHRcdHF1YWRZID0geSAqIDIgLSBxdWFkWVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHF1YWRYID0geFxuXHRcdFx0XHRcdHF1YWRZID0geVxuXHRcdFx0XHR9XG5cdFx0XHRcdHNlZyA9IHF1YWRyYXRpYyh4LCB5LCBxdWFkWCwgcXVhZFksIHNlZ1sxXSwgc2VnWzJdKVxuXHRcdFx0XHRicmVha1xuXHRcdFx0Y2FzZSAnUSc6XG5cdFx0XHRcdHF1YWRYID0gc2VnWzFdXG5cdFx0XHRcdHF1YWRZID0gc2VnWzJdXG5cdFx0XHRcdHNlZyA9IHF1YWRyYXRpYyh4LCB5LCBzZWdbMV0sIHNlZ1syXSwgc2VnWzNdLCBzZWdbNF0pXG5cdFx0XHRcdGJyZWFrXG5cdFx0XHRjYXNlICdMJzpcblx0XHRcdFx0c2VnID0gbGluZSh4LCB5LCBzZWdbMV0sIHNlZ1syXSlcblx0XHRcdFx0YnJlYWtcblx0XHRcdGNhc2UgJ0gnOlxuXHRcdFx0XHRzZWcgPSBsaW5lKHgsIHksIHNlZ1sxXSwgeSlcblx0XHRcdFx0YnJlYWtcblx0XHRcdGNhc2UgJ1YnOlxuXHRcdFx0XHRzZWcgPSBsaW5lKHgsIHksIHgsIHNlZ1sxXSlcblx0XHRcdFx0YnJlYWtcblx0XHRcdGNhc2UgJ1onOlxuXHRcdFx0XHRzZWcgPSBsaW5lKHgsIHksIHN0YXJ0WCwgc3RhcnRZKVxuXHRcdFx0XHRicmVha1xuXHRcdH1cblxuXHRcdC8vIHVwZGF0ZSBzdGF0ZVxuXHRcdHByZXYgPSBjb21tYW5kXG5cdFx0eCA9IHNlZ1tzZWcubGVuZ3RoIC0gMl1cblx0XHR5ID0gc2VnW3NlZy5sZW5ndGggLSAxXVxuXHRcdGlmIChzZWcubGVuZ3RoID4gNCkge1xuXHRcdFx0YmV6aWVyWCA9IHNlZ1tzZWcubGVuZ3RoIC0gNF1cblx0XHRcdGJlemllclkgPSBzZWdbc2VnLmxlbmd0aCAtIDNdXG5cdFx0fSBlbHNlIHtcblx0XHRcdGJlemllclggPSB4XG5cdFx0XHRiZXppZXJZID0geVxuXHRcdH1cblx0XHRyZXN1bHQucHVzaChzZWcpXG5cdH1cblxuXHRyZXR1cm4gcmVzdWx0XG59XG5cbmZ1bmN0aW9uIGxpbmUoeDEsIHkxLCB4MiwgeTIpe1xuXHRyZXR1cm4gWydDJywgeDEsIHkxLCB4MiwgeTIsIHgyLCB5Ml1cbn1cblxuZnVuY3Rpb24gcXVhZHJhdGljKHgxLCB5MSwgY3gsIGN5LCB4MiwgeTIpe1xuXHRyZXR1cm4gW1xuXHRcdCdDJyxcblx0XHR4MS8zICsgKDIvMykgKiBjeCxcblx0XHR5MS8zICsgKDIvMykgKiBjeSxcblx0XHR4Mi8zICsgKDIvMykgKiBjeCxcblx0XHR5Mi8zICsgKDIvMykgKiBjeSxcblx0XHR4Mixcblx0XHR5MlxuXHRdXG59XG5cbi8vIFRoaXMgZnVuY3Rpb24gaXMgcmlwcGVkIGZyb20gXG4vLyBnaXRodWIuY29tL0RtaXRyeUJhcmFub3Zza2l5L3JhcGhhZWwvYmxvYi80ZDk3ZDQvcmFwaGFlbC5qcyNMMjIxNi1MMjMwNCBcbi8vIHdoaWNoIHJlZmVyZW5jZXMgdzMub3JnL1RSL1NWRzExL2ltcGxub3RlLmh0bWwjQXJjSW1wbGVtZW50YXRpb25Ob3Rlc1xuLy8gVE9ETzogbWFrZSBpdCBodW1hbiByZWFkYWJsZVxuXG5mdW5jdGlvbiBhcmMoeDEsIHkxLCByeCwgcnksIGFuZ2xlLCBsYXJnZV9hcmNfZmxhZywgc3dlZXBfZmxhZywgeDIsIHkyLCByZWN1cnNpdmUpIHtcblx0aWYgKCFyZWN1cnNpdmUpIHtcblx0XHR2YXIgeHkgPSByb3RhdGUoeDEsIHkxLCAtYW5nbGUpXG5cdFx0eDEgPSB4eS54XG5cdFx0eTEgPSB4eS55XG5cdFx0eHkgPSByb3RhdGUoeDIsIHkyLCAtYW5nbGUpXG5cdFx0eDIgPSB4eS54XG5cdFx0eTIgPSB4eS55XG5cdFx0dmFyIHggPSAoeDEgLSB4MikgLyAyXG5cdFx0dmFyIHkgPSAoeTEgLSB5MikgLyAyXG5cdFx0dmFyIGggPSAoeCAqIHgpIC8gKHJ4ICogcngpICsgKHkgKiB5KSAvIChyeSAqIHJ5KVxuXHRcdGlmIChoID4gMSkge1xuXHRcdFx0aCA9IE1hdGguc3FydChoKVxuXHRcdFx0cnggPSBoICogcnhcblx0XHRcdHJ5ID0gaCAqIHJ5XG5cdFx0fVxuXHRcdHZhciByeDIgPSByeCAqIHJ4XG5cdFx0dmFyIHJ5MiA9IHJ5ICogcnlcblx0XHR2YXIgayA9IChsYXJnZV9hcmNfZmxhZyA9PSBzd2VlcF9mbGFnID8gLTEgOiAxKVxuXHRcdFx0KiBNYXRoLnNxcnQoTWF0aC5hYnMoKHJ4MiAqIHJ5MiAtIHJ4MiAqIHkgKiB5IC0gcnkyICogeCAqIHgpIC8gKHJ4MiAqIHkgKiB5ICsgcnkyICogeCAqIHgpKSlcblx0XHRpZiAoayA9PSBJbmZpbml0eSkgayA9IDEgLy8gbmV1dHJhbGl6ZVxuXHRcdHZhciBjeCA9IGsgKiByeCAqIHkgLyByeSArICh4MSArIHgyKSAvIDJcblx0XHR2YXIgY3kgPSBrICogLXJ5ICogeCAvIHJ4ICsgKHkxICsgeTIpIC8gMlxuXHRcdHZhciBmMSA9IE1hdGguYXNpbigoKHkxIC0gY3kpIC8gcnkpLnRvRml4ZWQoOSkpXG5cdFx0dmFyIGYyID0gTWF0aC5hc2luKCgoeTIgLSBjeSkgLyByeSkudG9GaXhlZCg5KSlcblxuXHRcdGYxID0geDEgPCBjeCA/IM+AIC0gZjEgOiBmMVxuXHRcdGYyID0geDIgPCBjeCA/IM+AIC0gZjIgOiBmMlxuXHRcdGlmIChmMSA8IDApIGYxID0gz4AgKiAyICsgZjFcblx0XHRpZiAoZjIgPCAwKSBmMiA9IM+AICogMiArIGYyXG5cdFx0aWYgKHN3ZWVwX2ZsYWcgJiYgZjEgPiBmMikgZjEgPSBmMSAtIM+AICogMlxuXHRcdGlmICghc3dlZXBfZmxhZyAmJiBmMiA+IGYxKSBmMiA9IGYyIC0gz4AgKiAyXG5cdH0gZWxzZSB7XG5cdFx0ZjEgPSByZWN1cnNpdmVbMF1cblx0XHRmMiA9IHJlY3Vyc2l2ZVsxXVxuXHRcdGN4ID0gcmVjdXJzaXZlWzJdXG5cdFx0Y3kgPSByZWN1cnNpdmVbM11cblx0fVxuXHQvLyBncmVhdGVyIHRoYW4gMTIwIGRlZ3JlZXMgcmVxdWlyZXMgbXVsdGlwbGUgc2VnbWVudHNcblx0aWYgKE1hdGguYWJzKGYyIC0gZjEpID4gXzEyMCkge1xuXHRcdHZhciBmMm9sZCA9IGYyXG5cdFx0dmFyIHgyb2xkID0geDJcblx0XHR2YXIgeTJvbGQgPSB5MlxuXHRcdGYyID0gZjEgKyBfMTIwICogKHN3ZWVwX2ZsYWcgJiYgZjIgPiBmMSA/IDEgOiAtMSlcblx0XHR4MiA9IGN4ICsgcnggKiBNYXRoLmNvcyhmMilcblx0XHR5MiA9IGN5ICsgcnkgKiBNYXRoLnNpbihmMilcblx0XHR2YXIgcmVzID0gYXJjKHgyLCB5MiwgcngsIHJ5LCBhbmdsZSwgMCwgc3dlZXBfZmxhZywgeDJvbGQsIHkyb2xkLCBbZjIsIGYyb2xkLCBjeCwgY3ldKVxuXHR9XG5cdHZhciB0ID0gTWF0aC50YW4oKGYyIC0gZjEpIC8gNClcblx0dmFyIGh4ID0gNCAvIDMgKiByeCAqIHRcblx0dmFyIGh5ID0gNCAvIDMgKiByeSAqIHRcblx0dmFyIGN1cnZlID0gW1xuXHRcdDIgKiB4MSAtICh4MSArIGh4ICogTWF0aC5zaW4oZjEpKSxcblx0XHQyICogeTEgLSAoeTEgLSBoeSAqIE1hdGguY29zKGYxKSksXG5cdFx0eDIgKyBoeCAqIE1hdGguc2luKGYyKSxcblx0XHR5MiAtIGh5ICogTWF0aC5jb3MoZjIpLFxuXHRcdHgyLFxuXHRcdHkyXG5cdF1cblx0aWYgKHJlY3Vyc2l2ZSkgcmV0dXJuIGN1cnZlXG5cdGlmIChyZXMpIGN1cnZlID0gY3VydmUuY29uY2F0KHJlcylcblx0Zm9yICh2YXIgaSA9IDA7IGkgPCBjdXJ2ZS5sZW5ndGg7KSB7XG5cdFx0dmFyIHJvdCA9IHJvdGF0ZShjdXJ2ZVtpXSwgY3VydmVbaSsxXSwgYW5nbGUpXG5cdFx0Y3VydmVbaSsrXSA9IHJvdC54XG5cdFx0Y3VydmVbaSsrXSA9IHJvdC55XG5cdH1cblx0cmV0dXJuIGN1cnZlXG59XG5cbmZ1bmN0aW9uIHJvdGF0ZSh4LCB5LCByYWQpe1xuXHRyZXR1cm4ge1xuXHRcdHg6IHggKiBNYXRoLmNvcyhyYWQpIC0geSAqIE1hdGguc2luKHJhZCksXG5cdFx0eTogeCAqIE1hdGguc2luKHJhZCkgKyB5ICogTWF0aC5jb3MocmFkKVxuXHR9XG59XG5cbmZ1bmN0aW9uIHJhZGlhbnMoZGVncmVzcyl7XG5cdHJldHVybiBkZWdyZXNzICogKM+AIC8gMTgwKVxufVxuIiwiLypcbm9iamVjdC1hc3NpZ25cbihjKSBTaW5kcmUgU29yaHVzXG5AbGljZW5zZSBNSVRcbiovXG5cbid1c2Ugc3RyaWN0Jztcbi8qIGVzbGludC1kaXNhYmxlIG5vLXVudXNlZC12YXJzICovXG52YXIgZ2V0T3duUHJvcGVydHlTeW1ib2xzID0gT2JqZWN0LmdldE93blByb3BlcnR5U3ltYm9scztcbnZhciBoYXNPd25Qcm9wZXJ0eSA9IE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHk7XG52YXIgcHJvcElzRW51bWVyYWJsZSA9IE9iamVjdC5wcm90b3R5cGUucHJvcGVydHlJc0VudW1lcmFibGU7XG5cbmZ1bmN0aW9uIHRvT2JqZWN0KHZhbCkge1xuXHRpZiAodmFsID09PSBudWxsIHx8IHZhbCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0dGhyb3cgbmV3IFR5cGVFcnJvcignT2JqZWN0LmFzc2lnbiBjYW5ub3QgYmUgY2FsbGVkIHdpdGggbnVsbCBvciB1bmRlZmluZWQnKTtcblx0fVxuXG5cdHJldHVybiBPYmplY3QodmFsKTtcbn1cblxuZnVuY3Rpb24gc2hvdWxkVXNlTmF0aXZlKCkge1xuXHR0cnkge1xuXHRcdGlmICghT2JqZWN0LmFzc2lnbikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIERldGVjdCBidWdneSBwcm9wZXJ0eSBlbnVtZXJhdGlvbiBvcmRlciBpbiBvbGRlciBWOCB2ZXJzaW9ucy5cblxuXHRcdC8vIGh0dHBzOi8vYnVncy5jaHJvbWl1bS5vcmcvcC92OC9pc3N1ZXMvZGV0YWlsP2lkPTQxMThcblx0XHR2YXIgdGVzdDEgPSBuZXcgU3RyaW5nKCdhYmMnKTsgIC8vIGVzbGludC1kaXNhYmxlLWxpbmUgbm8tbmV3LXdyYXBwZXJzXG5cdFx0dGVzdDFbNV0gPSAnZGUnO1xuXHRcdGlmIChPYmplY3QuZ2V0T3duUHJvcGVydHlOYW1lcyh0ZXN0MSlbMF0gPT09ICc1Jykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIGh0dHBzOi8vYnVncy5jaHJvbWl1bS5vcmcvcC92OC9pc3N1ZXMvZGV0YWlsP2lkPTMwNTZcblx0XHR2YXIgdGVzdDIgPSB7fTtcblx0XHRmb3IgKHZhciBpID0gMDsgaSA8IDEwOyBpKyspIHtcblx0XHRcdHRlc3QyWydfJyArIFN0cmluZy5mcm9tQ2hhckNvZGUoaSldID0gaTtcblx0XHR9XG5cdFx0dmFyIG9yZGVyMiA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eU5hbWVzKHRlc3QyKS5tYXAoZnVuY3Rpb24gKG4pIHtcblx0XHRcdHJldHVybiB0ZXN0MltuXTtcblx0XHR9KTtcblx0XHRpZiAob3JkZXIyLmpvaW4oJycpICE9PSAnMDEyMzQ1Njc4OScpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBodHRwczovL2J1Z3MuY2hyb21pdW0ub3JnL3AvdjgvaXNzdWVzL2RldGFpbD9pZD0zMDU2XG5cdFx0dmFyIHRlc3QzID0ge307XG5cdFx0J2FiY2RlZmdoaWprbG1ub3BxcnN0Jy5zcGxpdCgnJykuZm9yRWFjaChmdW5jdGlvbiAobGV0dGVyKSB7XG5cdFx0XHR0ZXN0M1tsZXR0ZXJdID0gbGV0dGVyO1xuXHRcdH0pO1xuXHRcdGlmIChPYmplY3Qua2V5cyhPYmplY3QuYXNzaWduKHt9LCB0ZXN0MykpLmpvaW4oJycpICE9PVxuXHRcdFx0XHQnYWJjZGVmZ2hpamtsbW5vcHFyc3QnKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH0gY2F0Y2ggKGVycikge1xuXHRcdC8vIFdlIGRvbid0IGV4cGVjdCBhbnkgb2YgdGhlIGFib3ZlIHRvIHRocm93LCBidXQgYmV0dGVyIHRvIGJlIHNhZmUuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gc2hvdWxkVXNlTmF0aXZlKCkgPyBPYmplY3QuYXNzaWduIDogZnVuY3Rpb24gKHRhcmdldCwgc291cmNlKSB7XG5cdHZhciBmcm9tO1xuXHR2YXIgdG8gPSB0b09iamVjdCh0YXJnZXQpO1xuXHR2YXIgc3ltYm9scztcblxuXHRmb3IgKHZhciBzID0gMTsgcyA8IGFyZ3VtZW50cy5sZW5ndGg7IHMrKykge1xuXHRcdGZyb20gPSBPYmplY3QoYXJndW1lbnRzW3NdKTtcblxuXHRcdGZvciAodmFyIGtleSBpbiBmcm9tKSB7XG5cdFx0XHRpZiAoaGFzT3duUHJvcGVydHkuY2FsbChmcm9tLCBrZXkpKSB7XG5cdFx0XHRcdHRvW2tleV0gPSBmcm9tW2tleV07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGdldE93blByb3BlcnR5U3ltYm9scykge1xuXHRcdFx0c3ltYm9scyA9IGdldE93blByb3BlcnR5U3ltYm9scyhmcm9tKTtcblx0XHRcdGZvciAodmFyIGkgPSAwOyBpIDwgc3ltYm9scy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRpZiAocHJvcElzRW51bWVyYWJsZS5jYWxsKGZyb20sIHN5bWJvbHNbaV0pKSB7XG5cdFx0XHRcdFx0dG9bc3ltYm9sc1tpXV0gPSBmcm9tW3N5bWJvbHNbaV1dO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHRvO1xufTtcbiIsIlxubW9kdWxlLmV4cG9ydHMgPSBwYXJzZVxuXG4vKipcbiAqIGV4cGVjdGVkIGFyZ3VtZW50IGxlbmd0aHNcbiAqIEB0eXBlIHtPYmplY3R9XG4gKi9cblxudmFyIGxlbmd0aCA9IHthOiA3LCBjOiA2LCBoOiAxLCBsOiAyLCBtOiAyLCBxOiA0LCBzOiA0LCB0OiAyLCB2OiAxLCB6OiAwfVxuXG4vKipcbiAqIHNlZ21lbnQgcGF0dGVyblxuICogQHR5cGUge1JlZ0V4cH1cbiAqL1xuXG52YXIgc2VnbWVudCA9IC8oW2FzdHZ6cW1obGNdKShbXmFzdHZ6cW1obGNdKikvaWdcblxuLyoqXG4gKiBwYXJzZSBhbiBzdmcgcGF0aCBkYXRhIHN0cmluZy4gR2VuZXJhdGVzIGFuIEFycmF5XG4gKiBvZiBjb21tYW5kcyB3aGVyZSBlYWNoIGNvbW1hbmQgaXMgYW4gQXJyYXkgb2YgdGhlXG4gKiBmb3JtIGBbY29tbWFuZCwgYXJnMSwgYXJnMiwgLi4uXWBcbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gcGF0aFxuICogQHJldHVybiB7QXJyYXl9XG4gKi9cblxuZnVuY3Rpb24gcGFyc2UocGF0aCkge1xuXHR2YXIgZGF0YSA9IFtdXG5cdHBhdGgucmVwbGFjZShzZWdtZW50LCBmdW5jdGlvbihfLCBjb21tYW5kLCBhcmdzKXtcblx0XHR2YXIgdHlwZSA9IGNvbW1hbmQudG9Mb3dlckNhc2UoKVxuXHRcdGFyZ3MgPSBwYXJzZVZhbHVlcyhhcmdzKVxuXG5cdFx0Ly8gb3ZlcmxvYWRlZCBtb3ZlVG9cblx0XHRpZiAodHlwZSA9PSAnbScgJiYgYXJncy5sZW5ndGggPiAyKSB7XG5cdFx0XHRkYXRhLnB1c2goW2NvbW1hbmRdLmNvbmNhdChhcmdzLnNwbGljZSgwLCAyKSkpXG5cdFx0XHR0eXBlID0gJ2wnXG5cdFx0XHRjb21tYW5kID0gY29tbWFuZCA9PSAnbScgPyAnbCcgOiAnTCdcblx0XHR9XG5cblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0aWYgKGFyZ3MubGVuZ3RoID09IGxlbmd0aFt0eXBlXSkge1xuXHRcdFx0XHRhcmdzLnVuc2hpZnQoY29tbWFuZClcblx0XHRcdFx0cmV0dXJuIGRhdGEucHVzaChhcmdzKVxuXHRcdFx0fVxuXHRcdFx0aWYgKGFyZ3MubGVuZ3RoIDwgbGVuZ3RoW3R5cGVdKSB0aHJvdyBuZXcgRXJyb3IoJ21hbGZvcm1lZCBwYXRoIGRhdGEnKVxuXHRcdFx0ZGF0YS5wdXNoKFtjb21tYW5kXS5jb25jYXQoYXJncy5zcGxpY2UoMCwgbGVuZ3RoW3R5cGVdKSkpXG5cdFx0fVxuXHR9KVxuXHRyZXR1cm4gZGF0YVxufVxuXG52YXIgbnVtYmVyID0gLy0/WzAtOV0qXFwuP1swLTldKyg/OmVbLStdP1xcZCspPy9pZ1xuXG5mdW5jdGlvbiBwYXJzZVZhbHVlcyhhcmdzKSB7XG5cdHZhciBudW1iZXJzID0gYXJncy5tYXRjaChudW1iZXIpXG5cdHJldHVybiBudW1iZXJzID8gbnVtYmVycy5tYXAoTnVtYmVyKSA6IFtdXG59XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIGF0dHJpYnV0ZVR5cGVzID0gcmVxdWlyZSgnLi9wcndtL2F0dHJpYnV0ZS10eXBlcycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICB2ZXJzaW9uOiAxLFxuICAgIEludDogYXR0cmlidXRlVHlwZXMuSW50LFxuICAgIEZsb2F0OiBhdHRyaWJ1dGVUeXBlcy5GbG9hdCxcbiAgICBpc0JpZ0VuZGlhblBsYXRmb3JtOiByZXF1aXJlKCcuL3V0aWxzL2lzLWJpZy1lbmRpYW4tcGxhdGZvcm0nKSxcbiAgICBlbmNvZGU6IHJlcXVpcmUoJy4vcHJ3bS9lbmNvZGUnKSxcbiAgICBkZWNvZGU6IHJlcXVpcmUoJy4vcHJ3bS9kZWNvZGUnKVxufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBGbG9hdDogMCxcbiAgICBJbnQ6IDFcbn07XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIGlzQmlnRW5kaWFuUGxhdGZvcm0gPSByZXF1aXJlKCcuLi91dGlscy9pcy1iaWctZW5kaWFuLXBsYXRmb3JtJyk7XG5cbi8vIG1hdGNoIHRoZSB2YWx1ZXMgZGVmaW5lZCBpbiB0aGUgc3BlYyB0byB0aGUgVHlwZWRBcnJheSB0eXBlc1xudmFyIEludmVydGVkRW5jb2RpbmdUeXBlcyA9IFtcbiAgICBudWxsLFxuICAgIEZsb2F0MzJBcnJheSxcbiAgICBudWxsLFxuICAgIEludDhBcnJheSxcbiAgICBJbnQxNkFycmF5LFxuICAgIG51bGwsXG4gICAgSW50MzJBcnJheSxcbiAgICBVaW50OEFycmF5LFxuICAgIFVpbnQxNkFycmF5LFxuICAgIG51bGwsXG4gICAgVWludDMyQXJyYXlcbl07XG5cbi8vIGRlZmluZSB0aGUgbWV0aG9kIHRvIHVzZSBvbiBhIERhdGFWaWV3LCBjb3JyZXNwb25kaW5nIHRoZSBUeXBlZEFycmF5IHR5cGVcbnZhciBnZXRNZXRob2RzID0ge1xuICAgIFVpbnQxNkFycmF5OiAnZ2V0VWludDE2JyxcbiAgICBVaW50MzJBcnJheTogJ2dldFVpbnQzMicsXG4gICAgSW50MTZBcnJheTogJ2dldEludDE2JyxcbiAgICBJbnQzMkFycmF5OiAnZ2V0SW50MzInLFxuICAgIEZsb2F0MzJBcnJheTogJ2dldEZsb2F0MzInXG59O1xuXG5mdW5jdGlvbiBjb3B5RnJvbUJ1ZmZlciAoc291cmNlQXJyYXlCdWZmZXIsIHZpZXdUeXBlLCBwb3NpdGlvbiwgbGVuZ3RoLCBmcm9tQmlnRW5kaWFuKSB7XG4gICAgdmFyIGJ5dGVzUGVyRWxlbWVudCA9IHZpZXdUeXBlLkJZVEVTX1BFUl9FTEVNRU5ULFxuICAgICAgICByZXN1bHQ7XG5cbiAgICBpZiAoZnJvbUJpZ0VuZGlhbiA9PT0gaXNCaWdFbmRpYW5QbGF0Zm9ybSgpIHx8IGJ5dGVzUGVyRWxlbWVudCA9PT0gMSkge1xuICAgICAgICByZXN1bHQgPSBuZXcgdmlld1R5cGUoc291cmNlQXJyYXlCdWZmZXIsIHBvc2l0aW9uLCBsZW5ndGgpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciByZWFkVmlldyA9IG5ldyBEYXRhVmlldyhzb3VyY2VBcnJheUJ1ZmZlciwgcG9zaXRpb24sIGxlbmd0aCAqIGJ5dGVzUGVyRWxlbWVudCksXG4gICAgICAgICAgICBnZXRNZXRob2QgPSBnZXRNZXRob2RzW3ZpZXdUeXBlLm5hbWVdLFxuICAgICAgICAgICAgbGl0dGxlRW5kaWFuID0gIWZyb21CaWdFbmRpYW47XG5cbiAgICAgICAgcmVzdWx0ID0gbmV3IHZpZXdUeXBlKGxlbmd0aCk7XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgcmVzdWx0W2ldID0gcmVhZFZpZXdbZ2V0TWV0aG9kXShpICogYnl0ZXNQZXJFbGVtZW50LCBsaXR0bGVFbmRpYW4pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gZGVjb2RlIChidWZmZXIpIHtcbiAgICB2YXIgYXJyYXkgPSBuZXcgVWludDhBcnJheShidWZmZXIpLFxuICAgICAgICB2ZXJzaW9uID0gYXJyYXlbMF0sXG4gICAgICAgIGZsYWdzID0gYXJyYXlbMV0sXG4gICAgICAgIGluZGV4ZWRHZW9tZXRyeSA9ICEhKGZsYWdzID4+IDcpLFxuICAgICAgICBpbmRpY2VzVHlwZSA9IGZsYWdzID4+IDYgJiAweDAxLFxuICAgICAgICBiaWdFbmRpYW4gPSAoZmxhZ3MgPj4gNSAmIDB4MDEpID09PSAxLFxuICAgICAgICBhdHRyaWJ1dGVzTnVtYmVyID0gZmxhZ3MgJiAweDFGLFxuICAgICAgICB2YWx1ZXNOdW1iZXIgPSAwLFxuICAgICAgICBpbmRpY2VzTnVtYmVyID0gMDtcblxuICAgIGlmIChiaWdFbmRpYW4pIHtcbiAgICAgICAgdmFsdWVzTnVtYmVyID0gKGFycmF5WzJdIDw8IDE2KSArIChhcnJheVszXSA8PCA4KSArIGFycmF5WzRdO1xuICAgICAgICBpbmRpY2VzTnVtYmVyID0gKGFycmF5WzVdIDw8IDE2KSArIChhcnJheVs2XSA8PCA4KSArIGFycmF5WzddO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHZhbHVlc051bWJlciA9IGFycmF5WzJdICsgKGFycmF5WzNdIDw8IDgpICsgKGFycmF5WzRdIDw8IDE2KTtcbiAgICAgICAgaW5kaWNlc051bWJlciA9IGFycmF5WzVdICsgKGFycmF5WzZdIDw8IDgpICsgKGFycmF5WzddIDw8IDE2KTtcbiAgICB9XG5cbiAgICAvKiogUFJFTElNSU5BUlkgQ0hFQ0tTICoqL1xuXG4gICAgaWYgKHZlcnNpb24gPT09IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdQUldNIGRlY29kZXI6IEludmFsaWQgZm9ybWF0IHZlcnNpb246IDAnKTtcbiAgICB9IGVsc2UgaWYgKHZlcnNpb24gIT09IDEpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdQUldNIGRlY29kZXI6IFVuc3VwcG9ydGVkIGZvcm1hdCB2ZXJzaW9uOiAnICsgdmVyc2lvbik7XG4gICAgfVxuXG4gICAgaWYgKCFpbmRleGVkR2VvbWV0cnkpIHtcbiAgICAgICAgaWYgKGluZGljZXNUeXBlICE9PSAwKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BSV00gZGVjb2RlcjogSW5kaWNlcyB0eXBlIG11c3QgYmUgc2V0IHRvIDAgZm9yIG5vbi1pbmRleGVkIGdlb21ldHJpZXMnKTtcbiAgICAgICAgfSBlbHNlIGlmIChpbmRpY2VzTnVtYmVyICE9PSAwKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BSV00gZGVjb2RlcjogTnVtYmVyIG9mIGluZGljZXMgbXVzdCBiZSBzZXQgdG8gMCBmb3Igbm9uLWluZGV4ZWQgZ2VvbWV0cmllcycpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqIFBBUlNJTkcgKiovXG5cbiAgICB2YXIgcG9zID0gODtcblxuICAgIHZhciBhdHRyaWJ1dGVzID0ge30sXG4gICAgICAgIGF0dHJpYnV0ZU5hbWUsXG4gICAgICAgIGNoYXIsXG4gICAgICAgIGF0dHJpYnV0ZU5vcm1hbGl6ZWQsXG4gICAgICAgIGF0dHJpYnV0ZVR5cGUsXG4gICAgICAgIGNhcmRpbmFsaXR5LFxuICAgICAgICBlbmNvZGluZ1R5cGUsXG4gICAgICAgIGFycmF5VHlwZSxcbiAgICAgICAgdmFsdWVzLFxuICAgICAgICBpO1xuXG4gICAgZm9yIChpID0gMDsgaSA8IGF0dHJpYnV0ZXNOdW1iZXI7IGkrKykge1xuICAgICAgICBhdHRyaWJ1dGVOYW1lID0gJyc7XG5cbiAgICAgICAgd2hpbGUgKHBvcyA8IGFycmF5Lmxlbmd0aCkge1xuICAgICAgICAgICAgY2hhciA9IGFycmF5W3Bvc107XG4gICAgICAgICAgICBwb3MrKztcblxuICAgICAgICAgICAgaWYgKGNoYXIgPT09IDApIHtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgYXR0cmlidXRlTmFtZSArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGNoYXIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgZmxhZ3MgPSBhcnJheVtwb3NdO1xuXG4gICAgICAgIGF0dHJpYnV0ZVR5cGUgPSBmbGFncyA+PiA3ICYgMHgwMTtcbiAgICAgICAgYXR0cmlidXRlTm9ybWFsaXplZCA9ICEhKGZsYWdzID4+IDYgJiAweDAxKTtcbiAgICAgICAgY2FyZGluYWxpdHkgPSAoZmxhZ3MgPj4gNCAmIDB4MDMpICsgMTtcbiAgICAgICAgZW5jb2RpbmdUeXBlID0gZmxhZ3MgJiAweDBGO1xuICAgICAgICBhcnJheVR5cGUgPSBJbnZlcnRlZEVuY29kaW5nVHlwZXNbZW5jb2RpbmdUeXBlXTtcblxuICAgICAgICBwb3MrKztcblxuICAgICAgICAvLyBwYWRkaW5nIHRvIG5leHQgbXVsdGlwbGUgb2YgNFxuICAgICAgICBwb3MgPSBNYXRoLmNlaWwocG9zIC8gNCkgKiA0O1xuXG4gICAgICAgIHZhbHVlcyA9IGNvcHlGcm9tQnVmZmVyKGJ1ZmZlciwgYXJyYXlUeXBlLCBwb3MsIGNhcmRpbmFsaXR5ICogdmFsdWVzTnVtYmVyLCBiaWdFbmRpYW4pO1xuXG4gICAgICAgIHBvcys9IGFycmF5VHlwZS5CWVRFU19QRVJfRUxFTUVOVCAqIGNhcmRpbmFsaXR5ICogdmFsdWVzTnVtYmVyO1xuXG4gICAgICAgIGF0dHJpYnV0ZXNbYXR0cmlidXRlTmFtZV0gPSB7XG4gICAgICAgICAgICB0eXBlOiBhdHRyaWJ1dGVUeXBlLFxuICAgICAgICAgICAgbm9ybWFsaXplZDogYXR0cmlidXRlTm9ybWFsaXplZCxcbiAgICAgICAgICAgIGNhcmRpbmFsaXR5OiBjYXJkaW5hbGl0eSxcbiAgICAgICAgICAgIHZhbHVlczogdmFsdWVzXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcG9zID0gTWF0aC5jZWlsKHBvcyAvIDQpICogNDtcblxuICAgIHZhciBpbmRpY2VzID0gbnVsbDtcblxuICAgIGlmIChpbmRleGVkR2VvbWV0cnkpIHtcbiAgICAgICAgaW5kaWNlcyA9IGNvcHlGcm9tQnVmZmVyKFxuICAgICAgICAgICAgYnVmZmVyLFxuICAgICAgICAgICAgaW5kaWNlc1R5cGUgPT09IDEgPyBVaW50MzJBcnJheSA6IFVpbnQxNkFycmF5LFxuICAgICAgICAgICAgcG9zLFxuICAgICAgICAgICAgaW5kaWNlc051bWJlcixcbiAgICAgICAgICAgIGJpZ0VuZGlhblxuICAgICAgICApO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICAgIHZlcnNpb246IHZlcnNpb24sXG4gICAgICAgIGJpZ0VuZGlhbjogYmlnRW5kaWFuLFxuICAgICAgICBhdHRyaWJ1dGVzOiBhdHRyaWJ1dGVzLFxuICAgICAgICBpbmRpY2VzOiBpbmRpY2VzXG4gICAgfTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBkZWNvZGU7XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIGlzQmlnRW5kaWFuUGxhdGZvcm0gPSByZXF1aXJlKCcuLi91dGlscy9pcy1iaWctZW5kaWFuLXBsYXRmb3JtJyksXG4gICAgYXR0cmlidXRlVHlwZXMgPSByZXF1aXJlKCcuL2F0dHJpYnV0ZS10eXBlcycpO1xuXG4vLyBtYXRjaCB0aGUgVHlwZWRBcnJheSB0eXBlIHdpdGggdGhlIHZhbHVlIGRlZmluZWQgaW4gdGhlIHNwZWNcbnZhciBFbmNvZGluZ1R5cGVzID0ge1xuICAgIEZsb2F0MzJBcnJheTogMSxcbiAgICBJbnQ4QXJyYXk6IDMsXG4gICAgSW50MTZBcnJheTogNCxcbiAgICBJbnQzMkFycmF5OiA2LFxuICAgIFVpbnQ4QXJyYXk6IDcsXG4gICAgVWludDE2QXJyYXk6IDgsXG4gICAgVWludDMyQXJyYXk6IDEwXG59O1xuXG4vLyBkZWZpbmUgdGhlIG1ldGhvZCB0byB1c2Ugb24gYSBEYXRhVmlldywgY29ycmVzcG9uZGluZyB0aGUgVHlwZWRBcnJheSB0eXBlXG52YXIgc2V0TWV0aG9kcyA9IHtcbiAgICBVaW50MTZBcnJheTogJ3NldFVpbnQxNicsXG4gICAgVWludDMyQXJyYXk6ICdzZXRVaW50MzInLFxuICAgIEludDE2QXJyYXk6ICdzZXRJbnQxNicsXG4gICAgSW50MzJBcnJheTogJ3NldEludDMyJyxcbiAgICBGbG9hdDMyQXJyYXk6ICdzZXRGbG9hdDMyJ1xufTtcblxuZnVuY3Rpb24gY29weVRvQnVmZmVyIChzb3VyY2VUeXBlZEFycmF5LCBkZXN0aW5hdGlvbkFycmF5QnVmZmVyLCBwb3NpdGlvbiwgYmlnRW5kaWFuKSB7XG4gICAgdmFyIGxlbmd0aCA9IHNvdXJjZVR5cGVkQXJyYXkubGVuZ3RoLFxuICAgICAgICBieXRlc1BlckVsZW1lbnQgPSBzb3VyY2VUeXBlZEFycmF5LkJZVEVTX1BFUl9FTEVNRU5UO1xuXG4gICAgdmFyIHdyaXRlQXJyYXkgPSBuZXcgc291cmNlVHlwZWRBcnJheS5jb25zdHJ1Y3RvcihkZXN0aW5hdGlvbkFycmF5QnVmZmVyLCBwb3NpdGlvbiwgbGVuZ3RoKTtcblxuICAgIGlmIChiaWdFbmRpYW4gPT09IGlzQmlnRW5kaWFuUGxhdGZvcm0oKSB8fCBieXRlc1BlckVsZW1lbnQgPT09IDEpIHtcbiAgICAgICAgLy8gZGVzaXJlZCBlbmRpYW5uZXNzIGlzIHRoZSBzYW1lIGFzIHRoZSBwbGF0Zm9ybSwgb3IgdGhlIGVuZGlhbm5lc3MgZG9lc24ndCBtYXR0ZXIgKDEgYnl0ZSlcbiAgICAgICAgd3JpdGVBcnJheS5zZXQoc291cmNlVHlwZWRBcnJheS5zdWJhcnJheSgwLCBsZW5ndGgpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgd3JpdGVWaWV3ID0gbmV3IERhdGFWaWV3KGRlc3RpbmF0aW9uQXJyYXlCdWZmZXIsIHBvc2l0aW9uLCBsZW5ndGggKiBieXRlc1BlckVsZW1lbnQpLFxuICAgICAgICAgICAgc2V0TWV0aG9kID0gc2V0TWV0aG9kc1tzb3VyY2VUeXBlZEFycmF5LmNvbnN0cnVjdG9yLm5hbWVdLFxuICAgICAgICAgICAgbGl0dGxlRW5kaWFuID0gIWJpZ0VuZGlhbixcbiAgICAgICAgICAgIGkgPSAwO1xuXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgd3JpdGVWaWV3W3NldE1ldGhvZF0oaSAqIGJ5dGVzUGVyRWxlbWVudCwgc291cmNlVHlwZWRBcnJheVtpXSwgbGl0dGxlRW5kaWFuKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB3cml0ZUFycmF5O1xufVxuXG5mdW5jdGlvbiBlbmNvZGUgKGF0dHJpYnV0ZXMsIGluZGljZXMsIGJpZ0VuZGlhbikge1xuICAgIHZhciBhdHRyaWJ1dGVLZXlzID0gYXR0cmlidXRlcyA/IE9iamVjdC5rZXlzKGF0dHJpYnV0ZXMpIDogW10sXG4gICAgICAgIGluZGV4ZWRHZW9tZXRyeSA9ICEhaW5kaWNlcyxcbiAgICAgICAgaSwgajtcblxuICAgIC8qKiBQUkVMSU1JTkFSWSBDSEVDS1MgKiovXG5cbiAgICAvLyB0aGlzIGlzIG5vdCBzdXBwb3NlZCB0byBjYXRjaCBhbGwgdGhlIHBvc3NpYmxlIGVycm9ycywgb25seSBzb21lIG9mIHRoZSBnb3RjaGFzXG5cbiAgICBpZiAoYXR0cmlidXRlS2V5cy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdQUldNIGVuY29kZXI6IFRoZSBtb2RlbCBtdXN0IGhhdmUgYXQgbGVhc3Qgb25lIGF0dHJpYnV0ZScpO1xuICAgIH1cblxuICAgIGlmIChhdHRyaWJ1dGVLZXlzLmxlbmd0aCA+IDMxKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignUFJXTSBlbmNvZGVyOiBUaGUgbW9kZWwgY2FuIGhhdmUgYXQgbW9zdCAzMSBhdHRyaWJ1dGVzJyk7XG4gICAgfVxuXG4gICAgZm9yIChpID0gMDsgaSA8IGF0dHJpYnV0ZUtleXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKCFFbmNvZGluZ1R5cGVzLmhhc093blByb3BlcnR5KGF0dHJpYnV0ZXNbYXR0cmlidXRlS2V5c1tpXV0udmFsdWVzLmNvbnN0cnVjdG9yLm5hbWUpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BSV00gZW5jb2RlcjogVW5zdXBwb3J0ZWQgYXR0cmlidXRlIHZhbHVlcyB0eXBlOiAnICsgYXR0cmlidXRlc1thdHRyaWJ1dGVLZXlzW2ldXS52YWx1ZXMuY29uc3RydWN0b3IubmFtZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoaW5kZXhlZEdlb21ldHJ5ICYmIGluZGljZXMuY29uc3RydWN0b3IubmFtZSAhPT0gJ1VpbnQxNkFycmF5JyAmJiBpbmRpY2VzLmNvbnN0cnVjdG9yLm5hbWUgIT09ICdVaW50MzJBcnJheScpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdQUldNIGVuY29kZXI6IFRoZSBpbmRpY2VzIG11c3QgYmUgcmVwcmVzZW50ZWQgYXMgYW4gVWludDE2QXJyYXkgb3IgYW4gVWludDMyQXJyYXknKTtcbiAgICB9XG5cbiAgICAvKiogR0VUIFRIRSBUWVBFIE9GIElORElDRVMgQVMgV0VMTCBBUyBUSEUgTlVNQkVSIE9GIElORElDRVMgQU5EIEFUVFJJQlVURSBWQUxVRVMgKiovXG5cbiAgICB2YXIgdmFsdWVzTnVtYmVyID0gYXR0cmlidXRlc1thdHRyaWJ1dGVLZXlzWzBdXS52YWx1ZXMubGVuZ3RoIC8gYXR0cmlidXRlc1thdHRyaWJ1dGVLZXlzWzBdXS5jYXJkaW5hbGl0eSB8IDAsXG4gICAgICAgIGluZGljZXNOdW1iZXIgPSBpbmRleGVkR2VvbWV0cnkgPyBpbmRpY2VzLmxlbmd0aCA6IDAsXG4gICAgICAgIGluZGljZXNUeXBlID0gaW5kZXhlZEdlb21ldHJ5ICYmIGluZGljZXMuY29uc3RydWN0b3IubmFtZSA9PT0gJ1VpbnQzMkFycmF5JyA/IDEgOiAwO1xuXG4gICAgLyoqIEdFVCBUSEUgRklMRSBMRU5HVEggKiovXG5cbiAgICB2YXIgdG90YWxMZW5ndGggPSA4LFxuICAgICAgICBhdHRyaWJ1dGVLZXksXG4gICAgICAgIGF0dHJpYnV0ZSxcbiAgICAgICAgYXR0cmlidXRlVHlwZSxcbiAgICAgICAgYXR0cmlidXRlTm9ybWFsaXplZDtcblxuICAgIGZvciAoaSA9IDA7IGkgPCBhdHRyaWJ1dGVLZXlzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGF0dHJpYnV0ZUtleSA9IGF0dHJpYnV0ZUtleXNbaV07XG4gICAgICAgIGF0dHJpYnV0ZSA9IGF0dHJpYnV0ZXNbYXR0cmlidXRlS2V5XTtcbiAgICAgICAgdG90YWxMZW5ndGggKz0gYXR0cmlidXRlS2V5Lmxlbmd0aCArIDI7IC8vIE5VTCBieXRlICsgZmxhZyBieXRlICsgcGFkZGluZ1xuICAgICAgICB0b3RhbExlbmd0aCA9IE1hdGguY2VpbCh0b3RhbExlbmd0aCAvIDQpICogNDsgLy8gcGFkZGluZ1xuICAgICAgICB0b3RhbExlbmd0aCArPSBhdHRyaWJ1dGUudmFsdWVzLmJ5dGVMZW5ndGg7XG4gICAgfVxuXG4gICAgaWYgKGluZGV4ZWRHZW9tZXRyeSkge1xuICAgICAgICB0b3RhbExlbmd0aCA9IE1hdGguY2VpbCh0b3RhbExlbmd0aCAvIDQpICogNDtcbiAgICAgICAgdG90YWxMZW5ndGggKz0gaW5kaWNlcy5ieXRlTGVuZ3RoO1xuICAgIH1cblxuICAgIC8qKiBJTklUSUFMSVpFIFRIRSBCVUZGRVIgKi9cblxuICAgIHZhciBidWZmZXIgPSBuZXcgQXJyYXlCdWZmZXIodG90YWxMZW5ndGgpLFxuICAgICAgICBhcnJheSA9IG5ldyBVaW50OEFycmF5KGJ1ZmZlcik7XG5cbiAgICAvKiogSEVBREVSICoqL1xuXG4gICAgYXJyYXlbMF0gPSAxO1xuICAgIGFycmF5WzFdID0gKFxuICAgICAgICBpbmRleGVkR2VvbWV0cnkgPDwgNyB8XG4gICAgICAgIGluZGljZXNUeXBlIDw8IDYgfFxuICAgICAgICAoYmlnRW5kaWFuID8gMSA6IDApIDw8IDUgfFxuICAgICAgICBhdHRyaWJ1dGVLZXlzLmxlbmd0aCAmIDB4MUZcbiAgICApO1xuXG4gICAgaWYgKGJpZ0VuZGlhbikge1xuICAgICAgICBhcnJheVsyXSA9IHZhbHVlc051bWJlciA+PiAxNiAmIDB4RkY7XG4gICAgICAgIGFycmF5WzNdID0gdmFsdWVzTnVtYmVyID4+IDggJiAweEZGO1xuICAgICAgICBhcnJheVs0XSA9IHZhbHVlc051bWJlciAmIDB4RkY7XG5cbiAgICAgICAgYXJyYXlbNV0gPSBpbmRpY2VzTnVtYmVyID4+IDE2ICYgMHhGRjtcbiAgICAgICAgYXJyYXlbNl0gPSBpbmRpY2VzTnVtYmVyID4+IDggJiAweEZGO1xuICAgICAgICBhcnJheVs3XSA9IGluZGljZXNOdW1iZXIgJiAweEZGO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGFycmF5WzJdID0gdmFsdWVzTnVtYmVyICYgMHhGRjtcbiAgICAgICAgYXJyYXlbM10gPSB2YWx1ZXNOdW1iZXIgPj4gOCAmIDB4RkY7XG4gICAgICAgIGFycmF5WzRdID0gdmFsdWVzTnVtYmVyID4+IDE2ICYgMHhGRjtcblxuICAgICAgICBhcnJheVs1XSA9IGluZGljZXNOdW1iZXIgJiAweEZGO1xuICAgICAgICBhcnJheVs2XSA9IGluZGljZXNOdW1iZXIgPj4gOCAmIDB4RkY7XG4gICAgICAgIGFycmF5WzddID0gaW5kaWNlc051bWJlciA+PiAxNiAmIDB4RkY7XG4gICAgfVxuXG5cbiAgICB2YXIgcG9zID0gODtcblxuICAgIC8qKiBBVFRSSUJVVEVTICoqL1xuXG4gICAgZm9yIChpID0gMDsgaSA8IGF0dHJpYnV0ZUtleXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgYXR0cmlidXRlS2V5ID0gYXR0cmlidXRlS2V5c1tpXTtcbiAgICAgICAgYXR0cmlidXRlID0gYXR0cmlidXRlc1thdHRyaWJ1dGVLZXldO1xuICAgICAgICBhdHRyaWJ1dGVUeXBlID0gdHlwZW9mIGF0dHJpYnV0ZS50eXBlID09PSAndW5kZWZpbmVkJyA/IGF0dHJpYnV0ZVR5cGVzLkZsb2F0IDogYXR0cmlidXRlLnR5cGU7XG4gICAgICAgIGF0dHJpYnV0ZU5vcm1hbGl6ZWQgPSAoISFhdHRyaWJ1dGUubm9ybWFsaXplZCA/IDEgOiAwKTtcblxuICAgICAgICAvKioqIFdSSVRFIEFUVFJJQlVURSBIRUFERVIgKioqL1xuXG4gICAgICAgIGZvciAoaiA9IDA7IGogPCBhdHRyaWJ1dGVLZXkubGVuZ3RoOyBqKyssIHBvcysrKSB7XG4gICAgICAgICAgICBhcnJheVtwb3NdID0gKGF0dHJpYnV0ZUtleS5jaGFyQ29kZUF0KGopICYgMHg3RikgfHwgMHg1RjsgLy8gZGVmYXVsdCB0byB1bmRlcnNjb3JlXG4gICAgICAgIH1cblxuICAgICAgICBwb3MrKztcblxuICAgICAgICBhcnJheVtwb3NdID0gKFxuICAgICAgICAgICAgYXR0cmlidXRlVHlwZSA8PCA3IHxcbiAgICAgICAgICAgIGF0dHJpYnV0ZU5vcm1hbGl6ZWQgPDwgNiB8XG4gICAgICAgICAgICAoKGF0dHJpYnV0ZS5jYXJkaW5hbGl0eSAtIDEpICYgMHgwMykgPDwgNCB8XG4gICAgICAgICAgICBFbmNvZGluZ1R5cGVzW2F0dHJpYnV0ZS52YWx1ZXMuY29uc3RydWN0b3IubmFtZV0gJiAweDBGXG4gICAgICAgICk7XG5cbiAgICAgICAgcG9zKys7XG5cblxuICAgICAgICAvLyBwYWRkaW5nIHRvIG5leHQgbXVsdGlwbGUgb2YgNFxuICAgICAgICBwb3MgPSBNYXRoLmNlaWwocG9zIC8gNCkgKiA0O1xuXG4gICAgICAgIC8qKiogV1JJVEUgQVRUUklCVVRFIFZBTFVFUyAqKiovXG5cbiAgICAgICAgdmFyIGF0dHJpYnV0ZXNXcml0ZUFycmF5ID0gY29weVRvQnVmZmVyKGF0dHJpYnV0ZS52YWx1ZXMsIGJ1ZmZlciwgcG9zLCBiaWdFbmRpYW4pO1xuXG4gICAgICAgIHBvcyArPSBhdHRyaWJ1dGVzV3JpdGVBcnJheS5ieXRlTGVuZ3RoO1xuICAgIH1cblxuICAgIC8qKiogV1JJVEUgSU5ESUNFUyBWQUxVRVMgKioqL1xuXG4gICAgaWYgKGluZGV4ZWRHZW9tZXRyeSkge1xuICAgICAgICBwb3MgPSBNYXRoLmNlaWwocG9zIC8gNCkgKiA0O1xuXG4gICAgICAgIGNvcHlUb0J1ZmZlcihpbmRpY2VzLCBidWZmZXIsIHBvcywgYmlnRW5kaWFuKTtcbiAgICB9XG5cbiAgICByZXR1cm4gYnVmZmVyO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGVuY29kZTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgYmlnRW5kaWFuUGxhdGZvcm0gPSBudWxsO1xuXG4vKipcbiAqIENoZWNrIGlmIHRoZSBlbmRpYW5uZXNzIG9mIHRoZSBwbGF0Zm9ybSBpcyBiaWctZW5kaWFuIChtb3N0IHNpZ25pZmljYW50IGJpdCBmaXJzdClcbiAqIEByZXR1cm5zIHtib29sZWFufSBUcnVlIGlmIGJpZy1lbmRpYW4sIGZhbHNlIGlmIGxpdHRsZS1lbmRpYW5cbiAqL1xuZnVuY3Rpb24gaXNCaWdFbmRpYW5QbGF0Zm9ybSAoKSB7XG4gICAgaWYgKGJpZ0VuZGlhblBsYXRmb3JtID09PSBudWxsKSB7XG4gICAgICAgIHZhciBidWZmZXIgPSBuZXcgQXJyYXlCdWZmZXIoMiksXG4gICAgICAgICAgICB1aW50OEFycmF5ID0gbmV3IFVpbnQ4QXJyYXkoYnVmZmVyKSxcbiAgICAgICAgICAgIHVpbnQxNkFycmF5ID0gbmV3IFVpbnQxNkFycmF5KGJ1ZmZlcik7XG5cbiAgICAgICAgdWludDhBcnJheVswXSA9IDB4QUE7IC8vIHNldCBmaXJzdCBieXRlXG4gICAgICAgIHVpbnQ4QXJyYXlbMV0gPSAweEJCOyAvLyBzZXQgc2Vjb25kIGJ5dGVcbiAgICAgICAgYmlnRW5kaWFuUGxhdGZvcm0gPSAodWludDE2QXJyYXlbMF0gPT09IDB4QUFCQik7XG4gICAgfVxuXG4gICAgcmV0dXJuIGJpZ0VuZGlhblBsYXRmb3JtO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGlzQmlnRW5kaWFuUGxhdGZvcm07XG4iLCIndXNlIHN0cmljdCc7XG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChtaW4sIG1heCkge1xuXHRpZiAobWF4ID09PSB1bmRlZmluZWQpIHtcblx0XHRtYXggPSBtaW47XG5cdFx0bWluID0gMDtcblx0fVxuXG5cdGlmICh0eXBlb2YgbWluICE9PSAnbnVtYmVyJyB8fCB0eXBlb2YgbWF4ICE9PSAnbnVtYmVyJykge1xuXHRcdHRocm93IG5ldyBUeXBlRXJyb3IoJ0V4cGVjdGVkIGFsbCBhcmd1bWVudHMgdG8gYmUgbnVtYmVycycpO1xuXHR9XG5cblx0cmV0dXJuIE1hdGgucmFuZG9tKCkgKiAobWF4IC0gbWluKSArIG1pbjtcbn07XG4iLCIndXNlIHN0cmljdCdcblxudmFyIGJuYWRkID0gcmVxdWlyZSgnYmlnLXJhdC9hZGQnKVxuXG5tb2R1bGUuZXhwb3J0cyA9IGFkZFxuXG5mdW5jdGlvbiBhZGQgKGEsIGIpIHtcbiAgdmFyIG4gPSBhLmxlbmd0aFxuICB2YXIgciA9IG5ldyBBcnJheShuKVxuICBmb3IgKHZhciBpPTA7IGk8bjsgKytpKSB7XG4gICAgcltpXSA9IGJuYWRkKGFbaV0sIGJbaV0pXG4gIH1cbiAgcmV0dXJuIHJcbn1cbiIsIid1c2Ugc3RyaWN0J1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZsb2F0MnJhdFxuXG52YXIgcmF0ID0gcmVxdWlyZSgnYmlnLXJhdCcpXG5cbmZ1bmN0aW9uIGZsb2F0MnJhdCh2KSB7XG4gIHZhciByZXN1bHQgPSBuZXcgQXJyYXkodi5sZW5ndGgpXG4gIGZvcih2YXIgaT0wOyBpPHYubGVuZ3RoOyArK2kpIHtcbiAgICByZXN1bHRbaV0gPSByYXQodltpXSlcbiAgfVxuICByZXR1cm4gcmVzdWx0XG59XG4iLCIndXNlIHN0cmljdCdcblxudmFyIHJhdCA9IHJlcXVpcmUoJ2JpZy1yYXQnKVxudmFyIG11bCA9IHJlcXVpcmUoJ2JpZy1yYXQvbXVsJylcblxubW9kdWxlLmV4cG9ydHMgPSBtdWxzXG5cbmZ1bmN0aW9uIG11bHMoYSwgeCkge1xuICB2YXIgcyA9IHJhdCh4KVxuICB2YXIgbiA9IGEubGVuZ3RoXG4gIHZhciByID0gbmV3IEFycmF5KG4pXG4gIGZvcih2YXIgaT0wOyBpPG47ICsraSkge1xuICAgIHJbaV0gPSBtdWwoYVtpXSwgcylcbiAgfVxuICByZXR1cm4gclxufVxuIiwiJ3VzZSBzdHJpY3QnXG5cbnZhciBibnN1YiA9IHJlcXVpcmUoJ2JpZy1yYXQvc3ViJylcblxubW9kdWxlLmV4cG9ydHMgPSBzdWJcblxuZnVuY3Rpb24gc3ViKGEsIGIpIHtcbiAgdmFyIG4gPSBhLmxlbmd0aFxuICB2YXIgciA9IG5ldyBBcnJheShuKVxuICAgIGZvcih2YXIgaT0wOyBpPG47ICsraSkge1xuICAgIHJbaV0gPSBibnN1YihhW2ldLCBiW2ldKVxuICB9XG4gIHJldHVybiByXG59XG4iLCJcInVzZSBzdHJpY3RcIlxuXG52YXIgdHdvUHJvZHVjdCA9IHJlcXVpcmUoXCJ0d28tcHJvZHVjdFwiKVxudmFyIHJvYnVzdFN1bSA9IHJlcXVpcmUoXCJyb2J1c3Qtc3VtXCIpXG52YXIgcm9idXN0RGlmZiA9IHJlcXVpcmUoXCJyb2J1c3Qtc3VidHJhY3RcIilcbnZhciByb2J1c3RTY2FsZSA9IHJlcXVpcmUoXCJyb2J1c3Qtc2NhbGVcIilcblxudmFyIE5VTV9FWFBBTkQgPSA2XG5cbmZ1bmN0aW9uIGNvZmFjdG9yKG0sIGMpIHtcbiAgdmFyIHJlc3VsdCA9IG5ldyBBcnJheShtLmxlbmd0aC0xKVxuICBmb3IodmFyIGk9MTsgaTxtLmxlbmd0aDsgKytpKSB7XG4gICAgdmFyIHIgPSByZXN1bHRbaS0xXSA9IG5ldyBBcnJheShtLmxlbmd0aC0xKVxuICAgIGZvcih2YXIgaj0wLGs9MDsgajxtLmxlbmd0aDsgKytqKSB7XG4gICAgICBpZihqID09PSBjKSB7XG4gICAgICAgIGNvbnRpbnVlXG4gICAgICB9XG4gICAgICByW2srK10gPSBtW2ldW2pdXG4gICAgfVxuICB9XG4gIHJldHVybiByZXN1bHRcbn1cblxuZnVuY3Rpb24gbWF0cml4KG4pIHtcbiAgdmFyIHJlc3VsdCA9IG5ldyBBcnJheShuKVxuICBmb3IodmFyIGk9MDsgaTxuOyArK2kpIHtcbiAgICByZXN1bHRbaV0gPSBuZXcgQXJyYXkobilcbiAgICBmb3IodmFyIGo9MDsgajxuOyArK2opIHtcbiAgICAgIHJlc3VsdFtpXVtqXSA9IFtcIm1cIiwgaiwgXCJbXCIsIChuLWktMiksIFwiXVwiXS5qb2luKFwiXCIpXG4gICAgfVxuICB9XG4gIHJldHVybiByZXN1bHRcbn1cblxuZnVuY3Rpb24gZ2VuZXJhdGVTdW0oZXhwcikge1xuICBpZihleHByLmxlbmd0aCA9PT0gMSkge1xuICAgIHJldHVybiBleHByWzBdXG4gIH0gZWxzZSBpZihleHByLmxlbmd0aCA9PT0gMikge1xuICAgIHJldHVybiBbXCJzdW0oXCIsIGV4cHJbMF0sIFwiLFwiLCBleHByWzFdLCBcIilcIl0uam9pbihcIlwiKVxuICB9IGVsc2Uge1xuICAgIHZhciBtID0gZXhwci5sZW5ndGg+PjFcbiAgICByZXR1cm4gW1wic3VtKFwiLCBnZW5lcmF0ZVN1bShleHByLnNsaWNlKDAsIG0pKSwgXCIsXCIsIGdlbmVyYXRlU3VtKGV4cHIuc2xpY2UobSkpLCBcIilcIl0uam9pbihcIlwiKVxuICB9XG59XG5cbmZ1bmN0aW9uIG1ha2VQcm9kdWN0KGEsIGIpIHtcbiAgaWYoYS5jaGFyQXQoMCkgPT09IFwibVwiKSB7XG4gICAgaWYoYi5jaGFyQXQoMCkgPT09IFwid1wiKSB7XG4gICAgICB2YXIgdG9rcyA9IGEuc3BsaXQoXCJbXCIpXG4gICAgICByZXR1cm4gW1wid1wiLCBiLnN1YnN0cigxKSwgXCJtXCIsIHRva3NbMF0uc3Vic3RyKDEpXS5qb2luKFwiXCIpXG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBbXCJwcm9kKFwiLCBhLCBcIixcIiwgYiwgXCIpXCJdLmpvaW4oXCJcIilcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIG1ha2VQcm9kdWN0KGIsIGEpXG4gIH1cbn1cblxuZnVuY3Rpb24gc2lnbihzKSB7XG4gIGlmKHMgJiAxICE9PSAwKSB7XG4gICAgcmV0dXJuIFwiLVwiXG4gIH1cbiAgcmV0dXJuIFwiXCJcbn1cblxuZnVuY3Rpb24gZGV0ZXJtaW5hbnQobSkge1xuICBpZihtLmxlbmd0aCA9PT0gMikge1xuICAgIHJldHVybiBbW1wiZGlmZihcIiwgbWFrZVByb2R1Y3QobVswXVswXSwgbVsxXVsxXSksIFwiLFwiLCBtYWtlUHJvZHVjdChtWzFdWzBdLCBtWzBdWzFdKSwgXCIpXCJdLmpvaW4oXCJcIildXG4gIH0gZWxzZSB7XG4gICAgdmFyIGV4cHIgPSBbXVxuICAgIGZvcih2YXIgaT0wOyBpPG0ubGVuZ3RoOyArK2kpIHtcbiAgICAgIGV4cHIucHVzaChbXCJzY2FsZShcIiwgZ2VuZXJhdGVTdW0oZGV0ZXJtaW5hbnQoY29mYWN0b3IobSwgaSkpKSwgXCIsXCIsIHNpZ24oaSksIG1bMF1baV0sIFwiKVwiXS5qb2luKFwiXCIpKVxuICAgIH1cbiAgICByZXR1cm4gZXhwclxuICB9XG59XG5cbmZ1bmN0aW9uIG1ha2VTcXVhcmUoZCwgbikge1xuICB2YXIgdGVybXMgPSBbXVxuICBmb3IodmFyIGk9MDsgaTxuLTI7ICsraSkge1xuICAgIHRlcm1zLnB1c2goW1wicHJvZChtXCIsIGQsIFwiW1wiLCBpLCBcIl0sbVwiLCBkLCBcIltcIiwgaSwgXCJdKVwiXS5qb2luKFwiXCIpKVxuICB9XG4gIHJldHVybiBnZW5lcmF0ZVN1bSh0ZXJtcylcbn1cblxuZnVuY3Rpb24gb3JpZW50YXRpb24obikge1xuICB2YXIgcG9zID0gW11cbiAgdmFyIG5lZyA9IFtdXG4gIHZhciBtID0gbWF0cml4KG4pXG4gIGZvcih2YXIgaT0wOyBpPG47ICsraSkge1xuICAgIG1bMF1baV0gPSBcIjFcIlxuICAgIG1bbi0xXVtpXSA9IFwid1wiK2lcbiAgfSBcbiAgZm9yKHZhciBpPTA7IGk8bjsgKytpKSB7XG4gICAgaWYoKGkmMSk9PT0wKSB7XG4gICAgICBwb3MucHVzaC5hcHBseShwb3MsZGV0ZXJtaW5hbnQoY29mYWN0b3IobSwgaSkpKVxuICAgIH0gZWxzZSB7XG4gICAgICBuZWcucHVzaC5hcHBseShuZWcsZGV0ZXJtaW5hbnQoY29mYWN0b3IobSwgaSkpKVxuICAgIH1cbiAgfVxuICB2YXIgcG9zRXhwciA9IGdlbmVyYXRlU3VtKHBvcylcbiAgdmFyIG5lZ0V4cHIgPSBnZW5lcmF0ZVN1bShuZWcpXG4gIHZhciBmdW5jTmFtZSA9IFwiZXhhY3RJblNwaGVyZVwiICsgblxuICB2YXIgZnVuY0FyZ3MgPSBbXVxuICBmb3IodmFyIGk9MDsgaTxuOyArK2kpIHtcbiAgICBmdW5jQXJncy5wdXNoKFwibVwiICsgaSlcbiAgfVxuICB2YXIgY29kZSA9IFtcImZ1bmN0aW9uIFwiLCBmdW5jTmFtZSwgXCIoXCIsIGZ1bmNBcmdzLmpvaW4oKSwgXCIpe1wiXVxuICBmb3IodmFyIGk9MDsgaTxuOyArK2kpIHtcbiAgICBjb2RlLnB1c2goXCJ2YXIgd1wiLGksXCI9XCIsbWFrZVNxdWFyZShpLG4pLFwiO1wiKVxuICAgIGZvcih2YXIgaj0wOyBqPG47ICsraikge1xuICAgICAgaWYoaiAhPT0gaSkge1xuICAgICAgICBjb2RlLnB1c2goXCJ2YXIgd1wiLGksXCJtXCIsaixcIj1zY2FsZSh3XCIsaSxcIixtXCIsaixcIlswXSk7XCIpXG4gICAgICB9XG4gICAgfVxuICB9XG4gIGNvZGUucHVzaChcInZhciBwPVwiLCBwb3NFeHByLCBcIixuPVwiLCBuZWdFeHByLCBcIixkPWRpZmYocCxuKTtyZXR1cm4gZFtkLmxlbmd0aC0xXTt9cmV0dXJuIFwiLCBmdW5jTmFtZSlcbiAgdmFyIHByb2MgPSBuZXcgRnVuY3Rpb24oXCJzdW1cIiwgXCJkaWZmXCIsIFwicHJvZFwiLCBcInNjYWxlXCIsIGNvZGUuam9pbihcIlwiKSlcbiAgcmV0dXJuIHByb2Mocm9idXN0U3VtLCByb2J1c3REaWZmLCB0d29Qcm9kdWN0LCByb2J1c3RTY2FsZSlcbn1cblxuZnVuY3Rpb24gaW5TcGhlcmUwKCkgeyByZXR1cm4gMCB9XG5mdW5jdGlvbiBpblNwaGVyZTEoKSB7IHJldHVybiAwIH1cbmZ1bmN0aW9uIGluU3BoZXJlMigpIHsgcmV0dXJuIDAgfVxuXG52YXIgQ0FDSEVEID0gW1xuICBpblNwaGVyZTAsXG4gIGluU3BoZXJlMSxcbiAgaW5TcGhlcmUyXG5dXG5cbmZ1bmN0aW9uIHNsb3dJblNwaGVyZShhcmdzKSB7XG4gIHZhciBwcm9jID0gQ0FDSEVEW2FyZ3MubGVuZ3RoXVxuICBpZighcHJvYykge1xuICAgIHByb2MgPSBDQUNIRURbYXJncy5sZW5ndGhdID0gb3JpZW50YXRpb24oYXJncy5sZW5ndGgpXG4gIH1cbiAgcmV0dXJuIHByb2MuYXBwbHkodW5kZWZpbmVkLCBhcmdzKVxufVxuXG5mdW5jdGlvbiBnZW5lcmF0ZUluU3BoZXJlVGVzdCgpIHtcbiAgd2hpbGUoQ0FDSEVELmxlbmd0aCA8PSBOVU1fRVhQQU5EKSB7XG4gICAgQ0FDSEVELnB1c2gob3JpZW50YXRpb24oQ0FDSEVELmxlbmd0aCkpXG4gIH1cbiAgdmFyIGFyZ3MgPSBbXVxuICB2YXIgcHJvY0FyZ3MgPSBbXCJzbG93XCJdXG4gIGZvcih2YXIgaT0wOyBpPD1OVU1fRVhQQU5EOyArK2kpIHtcbiAgICBhcmdzLnB1c2goXCJhXCIgKyBpKVxuICAgIHByb2NBcmdzLnB1c2goXCJvXCIgKyBpKVxuICB9XG4gIHZhciBjb2RlID0gW1xuICAgIFwiZnVuY3Rpb24gdGVzdEluU3BoZXJlKFwiLCBhcmdzLmpvaW4oKSwgXCIpe3N3aXRjaChhcmd1bWVudHMubGVuZ3RoKXtjYXNlIDA6Y2FzZSAxOnJldHVybiAwO1wiXG4gIF1cbiAgZm9yKHZhciBpPTI7IGk8PU5VTV9FWFBBTkQ7ICsraSkge1xuICAgIGNvZGUucHVzaChcImNhc2UgXCIsIGksIFwiOnJldHVybiBvXCIsIGksIFwiKFwiLCBhcmdzLnNsaWNlKDAsIGkpLmpvaW4oKSwgXCIpO1wiKVxuICB9XG4gIGNvZGUucHVzaChcIn12YXIgcz1uZXcgQXJyYXkoYXJndW1lbnRzLmxlbmd0aCk7Zm9yKHZhciBpPTA7aTxhcmd1bWVudHMubGVuZ3RoOysraSl7c1tpXT1hcmd1bWVudHNbaV19O3JldHVybiBzbG93KHMpO31yZXR1cm4gdGVzdEluU3BoZXJlXCIpXG4gIHByb2NBcmdzLnB1c2goY29kZS5qb2luKFwiXCIpKVxuXG4gIHZhciBwcm9jID0gRnVuY3Rpb24uYXBwbHkodW5kZWZpbmVkLCBwcm9jQXJncylcblxuICBtb2R1bGUuZXhwb3J0cyA9IHByb2MuYXBwbHkodW5kZWZpbmVkLCBbc2xvd0luU3BoZXJlXS5jb25jYXQoQ0FDSEVEKSlcbiAgZm9yKHZhciBpPTA7IGk8PU5VTV9FWFBBTkQ7ICsraSkge1xuICAgIG1vZHVsZS5leHBvcnRzW2ldID0gQ0FDSEVEW2ldXG4gIH1cbn1cblxuZ2VuZXJhdGVJblNwaGVyZVRlc3QoKSIsIlwidXNlIHN0cmljdFwiXG5cbnZhciB0d29Qcm9kdWN0ID0gcmVxdWlyZShcInR3by1wcm9kdWN0XCIpXG52YXIgcm9idXN0U3VtID0gcmVxdWlyZShcInJvYnVzdC1zdW1cIilcbnZhciByb2J1c3RTY2FsZSA9IHJlcXVpcmUoXCJyb2J1c3Qtc2NhbGVcIilcbnZhciByb2J1c3RTdWJ0cmFjdCA9IHJlcXVpcmUoXCJyb2J1c3Qtc3VidHJhY3RcIilcblxudmFyIE5VTV9FWFBBTkQgPSA1XG5cbnZhciBFUFNJTE9OICAgICA9IDEuMTEwMjIzMDI0NjI1MTU2NWUtMTZcbnZhciBFUlJCT1VORDMgICA9ICgzLjAgKyAxNi4wICogRVBTSUxPTikgKiBFUFNJTE9OXG52YXIgRVJSQk9VTkQ0ICAgPSAoNy4wICsgNTYuMCAqIEVQU0lMT04pICogRVBTSUxPTlxuXG5mdW5jdGlvbiBjb2ZhY3RvcihtLCBjKSB7XG4gIHZhciByZXN1bHQgPSBuZXcgQXJyYXkobS5sZW5ndGgtMSlcbiAgZm9yKHZhciBpPTE7IGk8bS5sZW5ndGg7ICsraSkge1xuICAgIHZhciByID0gcmVzdWx0W2ktMV0gPSBuZXcgQXJyYXkobS5sZW5ndGgtMSlcbiAgICBmb3IodmFyIGo9MCxrPTA7IGo8bS5sZW5ndGg7ICsraikge1xuICAgICAgaWYoaiA9PT0gYykge1xuICAgICAgICBjb250aW51ZVxuICAgICAgfVxuICAgICAgcltrKytdID0gbVtpXVtqXVxuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0XG59XG5cbmZ1bmN0aW9uIG1hdHJpeChuKSB7XG4gIHZhciByZXN1bHQgPSBuZXcgQXJyYXkobilcbiAgZm9yKHZhciBpPTA7IGk8bjsgKytpKSB7XG4gICAgcmVzdWx0W2ldID0gbmV3IEFycmF5KG4pXG4gICAgZm9yKHZhciBqPTA7IGo8bjsgKytqKSB7XG4gICAgICByZXN1bHRbaV1bal0gPSBbXCJtXCIsIGosIFwiW1wiLCAobi1pLTEpLCBcIl1cIl0uam9pbihcIlwiKVxuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0XG59XG5cbmZ1bmN0aW9uIHNpZ24obikge1xuICBpZihuICYgMSkge1xuICAgIHJldHVybiBcIi1cIlxuICB9XG4gIHJldHVybiBcIlwiXG59XG5cbmZ1bmN0aW9uIGdlbmVyYXRlU3VtKGV4cHIpIHtcbiAgaWYoZXhwci5sZW5ndGggPT09IDEpIHtcbiAgICByZXR1cm4gZXhwclswXVxuICB9IGVsc2UgaWYoZXhwci5sZW5ndGggPT09IDIpIHtcbiAgICByZXR1cm4gW1wic3VtKFwiLCBleHByWzBdLCBcIixcIiwgZXhwclsxXSwgXCIpXCJdLmpvaW4oXCJcIilcbiAgfSBlbHNlIHtcbiAgICB2YXIgbSA9IGV4cHIubGVuZ3RoPj4xXG4gICAgcmV0dXJuIFtcInN1bShcIiwgZ2VuZXJhdGVTdW0oZXhwci5zbGljZSgwLCBtKSksIFwiLFwiLCBnZW5lcmF0ZVN1bShleHByLnNsaWNlKG0pKSwgXCIpXCJdLmpvaW4oXCJcIilcbiAgfVxufVxuXG5mdW5jdGlvbiBkZXRlcm1pbmFudChtKSB7XG4gIGlmKG0ubGVuZ3RoID09PSAyKSB7XG4gICAgcmV0dXJuIFtbXCJzdW0ocHJvZChcIiwgbVswXVswXSwgXCIsXCIsIG1bMV1bMV0sIFwiKSxwcm9kKC1cIiwgbVswXVsxXSwgXCIsXCIsIG1bMV1bMF0sIFwiKSlcIl0uam9pbihcIlwiKV1cbiAgfSBlbHNlIHtcbiAgICB2YXIgZXhwciA9IFtdXG4gICAgZm9yKHZhciBpPTA7IGk8bS5sZW5ndGg7ICsraSkge1xuICAgICAgZXhwci5wdXNoKFtcInNjYWxlKFwiLCBnZW5lcmF0ZVN1bShkZXRlcm1pbmFudChjb2ZhY3RvcihtLCBpKSkpLCBcIixcIiwgc2lnbihpKSwgbVswXVtpXSwgXCIpXCJdLmpvaW4oXCJcIikpXG4gICAgfVxuICAgIHJldHVybiBleHByXG4gIH1cbn1cblxuZnVuY3Rpb24gb3JpZW50YXRpb24obikge1xuICB2YXIgcG9zID0gW11cbiAgdmFyIG5lZyA9IFtdXG4gIHZhciBtID0gbWF0cml4KG4pXG4gIHZhciBhcmdzID0gW11cbiAgZm9yKHZhciBpPTA7IGk8bjsgKytpKSB7XG4gICAgaWYoKGkmMSk9PT0wKSB7XG4gICAgICBwb3MucHVzaC5hcHBseShwb3MsIGRldGVybWluYW50KGNvZmFjdG9yKG0sIGkpKSlcbiAgICB9IGVsc2Uge1xuICAgICAgbmVnLnB1c2guYXBwbHkobmVnLCBkZXRlcm1pbmFudChjb2ZhY3RvcihtLCBpKSkpXG4gICAgfVxuICAgIGFyZ3MucHVzaChcIm1cIiArIGkpXG4gIH1cbiAgdmFyIHBvc0V4cHIgPSBnZW5lcmF0ZVN1bShwb3MpXG4gIHZhciBuZWdFeHByID0gZ2VuZXJhdGVTdW0obmVnKVxuICB2YXIgZnVuY05hbWUgPSBcIm9yaWVudGF0aW9uXCIgKyBuICsgXCJFeGFjdFwiXG4gIHZhciBjb2RlID0gW1wiZnVuY3Rpb24gXCIsIGZ1bmNOYW1lLCBcIihcIiwgYXJncy5qb2luKCksIFwiKXt2YXIgcD1cIiwgcG9zRXhwciwgXCIsbj1cIiwgbmVnRXhwciwgXCIsZD1zdWIocCxuKTtcXFxucmV0dXJuIGRbZC5sZW5ndGgtMV07fTtyZXR1cm4gXCIsIGZ1bmNOYW1lXS5qb2luKFwiXCIpXG4gIHZhciBwcm9jID0gbmV3IEZ1bmN0aW9uKFwic3VtXCIsIFwicHJvZFwiLCBcInNjYWxlXCIsIFwic3ViXCIsIGNvZGUpXG4gIHJldHVybiBwcm9jKHJvYnVzdFN1bSwgdHdvUHJvZHVjdCwgcm9idXN0U2NhbGUsIHJvYnVzdFN1YnRyYWN0KVxufVxuXG52YXIgb3JpZW50YXRpb24zRXhhY3QgPSBvcmllbnRhdGlvbigzKVxudmFyIG9yaWVudGF0aW9uNEV4YWN0ID0gb3JpZW50YXRpb24oNClcblxudmFyIENBQ0hFRCA9IFtcbiAgZnVuY3Rpb24gb3JpZW50YXRpb24wKCkgeyByZXR1cm4gMCB9LFxuICBmdW5jdGlvbiBvcmllbnRhdGlvbjEoKSB7IHJldHVybiAwIH0sXG4gIGZ1bmN0aW9uIG9yaWVudGF0aW9uMihhLCBiKSB7IFxuICAgIHJldHVybiBiWzBdIC0gYVswXVxuICB9LFxuICBmdW5jdGlvbiBvcmllbnRhdGlvbjMoYSwgYiwgYykge1xuICAgIHZhciBsID0gKGFbMV0gLSBjWzFdKSAqIChiWzBdIC0gY1swXSlcbiAgICB2YXIgciA9IChhWzBdIC0gY1swXSkgKiAoYlsxXSAtIGNbMV0pXG4gICAgdmFyIGRldCA9IGwgLSByXG4gICAgdmFyIHNcbiAgICBpZihsID4gMCkge1xuICAgICAgaWYociA8PSAwKSB7XG4gICAgICAgIHJldHVybiBkZXRcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHMgPSBsICsgclxuICAgICAgfVxuICAgIH0gZWxzZSBpZihsIDwgMCkge1xuICAgICAgaWYociA+PSAwKSB7XG4gICAgICAgIHJldHVybiBkZXRcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHMgPSAtKGwgKyByKVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gZGV0XG4gICAgfVxuICAgIHZhciB0b2wgPSBFUlJCT1VORDMgKiBzXG4gICAgaWYoZGV0ID49IHRvbCB8fCBkZXQgPD0gLXRvbCkge1xuICAgICAgcmV0dXJuIGRldFxuICAgIH1cbiAgICByZXR1cm4gb3JpZW50YXRpb24zRXhhY3QoYSwgYiwgYylcbiAgfSxcbiAgZnVuY3Rpb24gb3JpZW50YXRpb240KGEsYixjLGQpIHtcbiAgICB2YXIgYWR4ID0gYVswXSAtIGRbMF1cbiAgICB2YXIgYmR4ID0gYlswXSAtIGRbMF1cbiAgICB2YXIgY2R4ID0gY1swXSAtIGRbMF1cbiAgICB2YXIgYWR5ID0gYVsxXSAtIGRbMV1cbiAgICB2YXIgYmR5ID0gYlsxXSAtIGRbMV1cbiAgICB2YXIgY2R5ID0gY1sxXSAtIGRbMV1cbiAgICB2YXIgYWR6ID0gYVsyXSAtIGRbMl1cbiAgICB2YXIgYmR6ID0gYlsyXSAtIGRbMl1cbiAgICB2YXIgY2R6ID0gY1syXSAtIGRbMl1cbiAgICB2YXIgYmR4Y2R5ID0gYmR4ICogY2R5XG4gICAgdmFyIGNkeGJkeSA9IGNkeCAqIGJkeVxuICAgIHZhciBjZHhhZHkgPSBjZHggKiBhZHlcbiAgICB2YXIgYWR4Y2R5ID0gYWR4ICogY2R5XG4gICAgdmFyIGFkeGJkeSA9IGFkeCAqIGJkeVxuICAgIHZhciBiZHhhZHkgPSBiZHggKiBhZHlcbiAgICB2YXIgZGV0ID0gYWR6ICogKGJkeGNkeSAtIGNkeGJkeSkgXG4gICAgICAgICAgICArIGJkeiAqIChjZHhhZHkgLSBhZHhjZHkpXG4gICAgICAgICAgICArIGNkeiAqIChhZHhiZHkgLSBiZHhhZHkpXG4gICAgdmFyIHBlcm1hbmVudCA9IChNYXRoLmFicyhiZHhjZHkpICsgTWF0aC5hYnMoY2R4YmR5KSkgKiBNYXRoLmFicyhhZHopXG4gICAgICAgICAgICAgICAgICArIChNYXRoLmFicyhjZHhhZHkpICsgTWF0aC5hYnMoYWR4Y2R5KSkgKiBNYXRoLmFicyhiZHopXG4gICAgICAgICAgICAgICAgICArIChNYXRoLmFicyhhZHhiZHkpICsgTWF0aC5hYnMoYmR4YWR5KSkgKiBNYXRoLmFicyhjZHopXG4gICAgdmFyIHRvbCA9IEVSUkJPVU5ENCAqIHBlcm1hbmVudFxuICAgIGlmICgoZGV0ID4gdG9sKSB8fCAoLWRldCA+IHRvbCkpIHtcbiAgICAgIHJldHVybiBkZXRcbiAgICB9XG4gICAgcmV0dXJuIG9yaWVudGF0aW9uNEV4YWN0KGEsYixjLGQpXG4gIH1cbl1cblxuZnVuY3Rpb24gc2xvd09yaWVudChhcmdzKSB7XG4gIHZhciBwcm9jID0gQ0FDSEVEW2FyZ3MubGVuZ3RoXVxuICBpZighcHJvYykge1xuICAgIHByb2MgPSBDQUNIRURbYXJncy5sZW5ndGhdID0gb3JpZW50YXRpb24oYXJncy5sZW5ndGgpXG4gIH1cbiAgcmV0dXJuIHByb2MuYXBwbHkodW5kZWZpbmVkLCBhcmdzKVxufVxuXG5mdW5jdGlvbiBnZW5lcmF0ZU9yaWVudGF0aW9uUHJvYygpIHtcbiAgd2hpbGUoQ0FDSEVELmxlbmd0aCA8PSBOVU1fRVhQQU5EKSB7XG4gICAgQ0FDSEVELnB1c2gob3JpZW50YXRpb24oQ0FDSEVELmxlbmd0aCkpXG4gIH1cbiAgdmFyIGFyZ3MgPSBbXVxuICB2YXIgcHJvY0FyZ3MgPSBbXCJzbG93XCJdXG4gIGZvcih2YXIgaT0wOyBpPD1OVU1fRVhQQU5EOyArK2kpIHtcbiAgICBhcmdzLnB1c2goXCJhXCIgKyBpKVxuICAgIHByb2NBcmdzLnB1c2goXCJvXCIgKyBpKVxuICB9XG4gIHZhciBjb2RlID0gW1xuICAgIFwiZnVuY3Rpb24gZ2V0T3JpZW50YXRpb24oXCIsIGFyZ3Muam9pbigpLCBcIil7c3dpdGNoKGFyZ3VtZW50cy5sZW5ndGgpe2Nhc2UgMDpjYXNlIDE6cmV0dXJuIDA7XCJcbiAgXVxuICBmb3IodmFyIGk9MjsgaTw9TlVNX0VYUEFORDsgKytpKSB7XG4gICAgY29kZS5wdXNoKFwiY2FzZSBcIiwgaSwgXCI6cmV0dXJuIG9cIiwgaSwgXCIoXCIsIGFyZ3Muc2xpY2UoMCwgaSkuam9pbigpLCBcIik7XCIpXG4gIH1cbiAgY29kZS5wdXNoKFwifXZhciBzPW5ldyBBcnJheShhcmd1bWVudHMubGVuZ3RoKTtmb3IodmFyIGk9MDtpPGFyZ3VtZW50cy5sZW5ndGg7KytpKXtzW2ldPWFyZ3VtZW50c1tpXX07cmV0dXJuIHNsb3cocyk7fXJldHVybiBnZXRPcmllbnRhdGlvblwiKVxuICBwcm9jQXJncy5wdXNoKGNvZGUuam9pbihcIlwiKSlcblxuICB2YXIgcHJvYyA9IEZ1bmN0aW9uLmFwcGx5KHVuZGVmaW5lZCwgcHJvY0FyZ3MpXG4gIG1vZHVsZS5leHBvcnRzID0gcHJvYy5hcHBseSh1bmRlZmluZWQsIFtzbG93T3JpZW50XS5jb25jYXQoQ0FDSEVEKSlcbiAgZm9yKHZhciBpPTA7IGk8PU5VTV9FWFBBTkQ7ICsraSkge1xuICAgIG1vZHVsZS5leHBvcnRzW2ldID0gQ0FDSEVEW2ldXG4gIH1cbn1cblxuZ2VuZXJhdGVPcmllbnRhdGlvblByb2MoKSIsIlwidXNlIHN0cmljdFwiXG5cbnZhciB0d29Qcm9kdWN0ID0gcmVxdWlyZShcInR3by1wcm9kdWN0XCIpXG52YXIgdHdvU3VtID0gcmVxdWlyZShcInR3by1zdW1cIilcblxubW9kdWxlLmV4cG9ydHMgPSBzY2FsZUxpbmVhckV4cGFuc2lvblxuXG5mdW5jdGlvbiBzY2FsZUxpbmVhckV4cGFuc2lvbihlLCBzY2FsZSkge1xuICB2YXIgbiA9IGUubGVuZ3RoXG4gIGlmKG4gPT09IDEpIHtcbiAgICB2YXIgdHMgPSB0d29Qcm9kdWN0KGVbMF0sIHNjYWxlKVxuICAgIGlmKHRzWzBdKSB7XG4gICAgICByZXR1cm4gdHNcbiAgICB9XG4gICAgcmV0dXJuIFsgdHNbMV0gXVxuICB9XG4gIHZhciBnID0gbmV3IEFycmF5KDIgKiBuKVxuICB2YXIgcSA9IFswLjEsIDAuMV1cbiAgdmFyIHQgPSBbMC4xLCAwLjFdXG4gIHZhciBjb3VudCA9IDBcbiAgdHdvUHJvZHVjdChlWzBdLCBzY2FsZSwgcSlcbiAgaWYocVswXSkge1xuICAgIGdbY291bnQrK10gPSBxWzBdXG4gIH1cbiAgZm9yKHZhciBpPTE7IGk8bjsgKytpKSB7XG4gICAgdHdvUHJvZHVjdChlW2ldLCBzY2FsZSwgdClcbiAgICB2YXIgcHEgPSBxWzFdXG4gICAgdHdvU3VtKHBxLCB0WzBdLCBxKVxuICAgIGlmKHFbMF0pIHtcbiAgICAgIGdbY291bnQrK10gPSBxWzBdXG4gICAgfVxuICAgIHZhciBhID0gdFsxXVxuICAgIHZhciBiID0gcVsxXVxuICAgIHZhciB4ID0gYSArIGJcbiAgICB2YXIgYnYgPSB4IC0gYVxuICAgIHZhciB5ID0gYiAtIGJ2XG4gICAgcVsxXSA9IHhcbiAgICBpZih5KSB7XG4gICAgICBnW2NvdW50KytdID0geVxuICAgIH1cbiAgfVxuICBpZihxWzFdKSB7XG4gICAgZ1tjb3VudCsrXSA9IHFbMV1cbiAgfVxuICBpZihjb3VudCA9PT0gMCkge1xuICAgIGdbY291bnQrK10gPSAwLjBcbiAgfVxuICBnLmxlbmd0aCA9IGNvdW50XG4gIHJldHVybiBnXG59IiwiXCJ1c2Ugc3RyaWN0XCJcblxubW9kdWxlLmV4cG9ydHMgPSBzZWdtZW50c0ludGVyc2VjdFxuXG52YXIgb3JpZW50ID0gcmVxdWlyZShcInJvYnVzdC1vcmllbnRhdGlvblwiKVszXVxuXG5mdW5jdGlvbiBjaGVja0NvbGxpbmVhcihhMCwgYTEsIGIwLCBiMSkge1xuXG4gIGZvcih2YXIgZD0wOyBkPDI7ICsrZCkge1xuICAgIHZhciB4MCA9IGEwW2RdXG4gICAgdmFyIHkwID0gYTFbZF1cbiAgICB2YXIgbDAgPSBNYXRoLm1pbih4MCwgeTApXG4gICAgdmFyIGgwID0gTWF0aC5tYXgoeDAsIHkwKSAgICBcblxuICAgIHZhciB4MSA9IGIwW2RdXG4gICAgdmFyIHkxID0gYjFbZF1cbiAgICB2YXIgbDEgPSBNYXRoLm1pbih4MSwgeTEpXG4gICAgdmFyIGgxID0gTWF0aC5tYXgoeDEsIHkxKSAgICBcblxuICAgIGlmKGgxIDwgbDAgfHwgaDAgPCBsMSkge1xuICAgICAgcmV0dXJuIGZhbHNlXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRydWVcbn1cblxuZnVuY3Rpb24gc2VnbWVudHNJbnRlcnNlY3QoYTAsIGExLCBiMCwgYjEpIHtcbiAgdmFyIHgwID0gb3JpZW50KGEwLCBiMCwgYjEpXG4gIHZhciB5MCA9IG9yaWVudChhMSwgYjAsIGIxKVxuICBpZigoeDAgPiAwICYmIHkwID4gMCkgfHwgKHgwIDwgMCAmJiB5MCA8IDApKSB7XG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cblxuICB2YXIgeDEgPSBvcmllbnQoYjAsIGEwLCBhMSlcbiAgdmFyIHkxID0gb3JpZW50KGIxLCBhMCwgYTEpXG4gIGlmKCh4MSA+IDAgJiYgeTEgPiAwKSB8fCAoeDEgPCAwICYmIHkxIDwgMCkpIHtcbiAgICByZXR1cm4gZmFsc2VcbiAgfVxuXG4gIC8vQ2hlY2sgZm9yIGRlZ2VuZXJhdGUgY29sbGluZWFyIGNhc2VcbiAgaWYoeDAgPT09IDAgJiYgeTAgPT09IDAgJiYgeDEgPT09IDAgJiYgeTEgPT09IDApIHtcbiAgICByZXR1cm4gY2hlY2tDb2xsaW5lYXIoYTAsIGExLCBiMCwgYjEpXG4gIH1cblxuICByZXR1cm4gdHJ1ZVxufSIsIlwidXNlIHN0cmljdFwiXG5cbm1vZHVsZS5leHBvcnRzID0gcm9idXN0U3VidHJhY3RcblxuLy9FYXN5IGNhc2U6IEFkZCB0d28gc2NhbGFyc1xuZnVuY3Rpb24gc2NhbGFyU2NhbGFyKGEsIGIpIHtcbiAgdmFyIHggPSBhICsgYlxuICB2YXIgYnYgPSB4IC0gYVxuICB2YXIgYXYgPSB4IC0gYnZcbiAgdmFyIGJyID0gYiAtIGJ2XG4gIHZhciBhciA9IGEgLSBhdlxuICB2YXIgeSA9IGFyICsgYnJcbiAgaWYoeSkge1xuICAgIHJldHVybiBbeSwgeF1cbiAgfVxuICByZXR1cm4gW3hdXG59XG5cbmZ1bmN0aW9uIHJvYnVzdFN1YnRyYWN0KGUsIGYpIHtcbiAgdmFyIG5lID0gZS5sZW5ndGh8MFxuICB2YXIgbmYgPSBmLmxlbmd0aHwwXG4gIGlmKG5lID09PSAxICYmIG5mID09PSAxKSB7XG4gICAgcmV0dXJuIHNjYWxhclNjYWxhcihlWzBdLCAtZlswXSlcbiAgfVxuICB2YXIgbiA9IG5lICsgbmZcbiAgdmFyIGcgPSBuZXcgQXJyYXkobilcbiAgdmFyIGNvdW50ID0gMFxuICB2YXIgZXB0ciA9IDBcbiAgdmFyIGZwdHIgPSAwXG4gIHZhciBhYnMgPSBNYXRoLmFic1xuICB2YXIgZWkgPSBlW2VwdHJdXG4gIHZhciBlYSA9IGFicyhlaSlcbiAgdmFyIGZpID0gLWZbZnB0cl1cbiAgdmFyIGZhID0gYWJzKGZpKVxuICB2YXIgYSwgYlxuICBpZihlYSA8IGZhKSB7XG4gICAgYiA9IGVpXG4gICAgZXB0ciArPSAxXG4gICAgaWYoZXB0ciA8IG5lKSB7XG4gICAgICBlaSA9IGVbZXB0cl1cbiAgICAgIGVhID0gYWJzKGVpKVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBiID0gZmlcbiAgICBmcHRyICs9IDFcbiAgICBpZihmcHRyIDwgbmYpIHtcbiAgICAgIGZpID0gLWZbZnB0cl1cbiAgICAgIGZhID0gYWJzKGZpKVxuICAgIH1cbiAgfVxuICBpZigoZXB0ciA8IG5lICYmIGVhIDwgZmEpIHx8IChmcHRyID49IG5mKSkge1xuICAgIGEgPSBlaVxuICAgIGVwdHIgKz0gMVxuICAgIGlmKGVwdHIgPCBuZSkge1xuICAgICAgZWkgPSBlW2VwdHJdXG4gICAgICBlYSA9IGFicyhlaSlcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgYSA9IGZpXG4gICAgZnB0ciArPSAxXG4gICAgaWYoZnB0ciA8IG5mKSB7XG4gICAgICBmaSA9IC1mW2ZwdHJdXG4gICAgICBmYSA9IGFicyhmaSlcbiAgICB9XG4gIH1cbiAgdmFyIHggPSBhICsgYlxuICB2YXIgYnYgPSB4IC0gYVxuICB2YXIgeSA9IGIgLSBidlxuICB2YXIgcTAgPSB5XG4gIHZhciBxMSA9IHhcbiAgdmFyIF94LCBfYnYsIF9hdiwgX2JyLCBfYXJcbiAgd2hpbGUoZXB0ciA8IG5lICYmIGZwdHIgPCBuZikge1xuICAgIGlmKGVhIDwgZmEpIHtcbiAgICAgIGEgPSBlaVxuICAgICAgZXB0ciArPSAxXG4gICAgICBpZihlcHRyIDwgbmUpIHtcbiAgICAgICAgZWkgPSBlW2VwdHJdXG4gICAgICAgIGVhID0gYWJzKGVpKVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBhID0gZmlcbiAgICAgIGZwdHIgKz0gMVxuICAgICAgaWYoZnB0ciA8IG5mKSB7XG4gICAgICAgIGZpID0gLWZbZnB0cl1cbiAgICAgICAgZmEgPSBhYnMoZmkpXG4gICAgICB9XG4gICAgfVxuICAgIGIgPSBxMFxuICAgIHggPSBhICsgYlxuICAgIGJ2ID0geCAtIGFcbiAgICB5ID0gYiAtIGJ2XG4gICAgaWYoeSkge1xuICAgICAgZ1tjb3VudCsrXSA9IHlcbiAgICB9XG4gICAgX3ggPSBxMSArIHhcbiAgICBfYnYgPSBfeCAtIHExXG4gICAgX2F2ID0gX3ggLSBfYnZcbiAgICBfYnIgPSB4IC0gX2J2XG4gICAgX2FyID0gcTEgLSBfYXZcbiAgICBxMCA9IF9hciArIF9iclxuICAgIHExID0gX3hcbiAgfVxuICB3aGlsZShlcHRyIDwgbmUpIHtcbiAgICBhID0gZWlcbiAgICBiID0gcTBcbiAgICB4ID0gYSArIGJcbiAgICBidiA9IHggLSBhXG4gICAgeSA9IGIgLSBidlxuICAgIGlmKHkpIHtcbiAgICAgIGdbY291bnQrK10gPSB5XG4gICAgfVxuICAgIF94ID0gcTEgKyB4XG4gICAgX2J2ID0gX3ggLSBxMVxuICAgIF9hdiA9IF94IC0gX2J2XG4gICAgX2JyID0geCAtIF9idlxuICAgIF9hciA9IHExIC0gX2F2XG4gICAgcTAgPSBfYXIgKyBfYnJcbiAgICBxMSA9IF94XG4gICAgZXB0ciArPSAxXG4gICAgaWYoZXB0ciA8IG5lKSB7XG4gICAgICBlaSA9IGVbZXB0cl1cbiAgICB9XG4gIH1cbiAgd2hpbGUoZnB0ciA8IG5mKSB7XG4gICAgYSA9IGZpXG4gICAgYiA9IHEwXG4gICAgeCA9IGEgKyBiXG4gICAgYnYgPSB4IC0gYVxuICAgIHkgPSBiIC0gYnZcbiAgICBpZih5KSB7XG4gICAgICBnW2NvdW50KytdID0geVxuICAgIH0gXG4gICAgX3ggPSBxMSArIHhcbiAgICBfYnYgPSBfeCAtIHExXG4gICAgX2F2ID0gX3ggLSBfYnZcbiAgICBfYnIgPSB4IC0gX2J2XG4gICAgX2FyID0gcTEgLSBfYXZcbiAgICBxMCA9IF9hciArIF9iclxuICAgIHExID0gX3hcbiAgICBmcHRyICs9IDFcbiAgICBpZihmcHRyIDwgbmYpIHtcbiAgICAgIGZpID0gLWZbZnB0cl1cbiAgICB9XG4gIH1cbiAgaWYocTApIHtcbiAgICBnW2NvdW50KytdID0gcTBcbiAgfVxuICBpZihxMSkge1xuICAgIGdbY291bnQrK10gPSBxMVxuICB9XG4gIGlmKCFjb3VudCkge1xuICAgIGdbY291bnQrK10gPSAwLjAgIFxuICB9XG4gIGcubGVuZ3RoID0gY291bnRcbiAgcmV0dXJuIGdcbn0iLCJcInVzZSBzdHJpY3RcIlxuXG5tb2R1bGUuZXhwb3J0cyA9IGxpbmVhckV4cGFuc2lvblN1bVxuXG4vL0Vhc3kgY2FzZTogQWRkIHR3byBzY2FsYXJzXG5mdW5jdGlvbiBzY2FsYXJTY2FsYXIoYSwgYikge1xuICB2YXIgeCA9IGEgKyBiXG4gIHZhciBidiA9IHggLSBhXG4gIHZhciBhdiA9IHggLSBidlxuICB2YXIgYnIgPSBiIC0gYnZcbiAgdmFyIGFyID0gYSAtIGF2XG4gIHZhciB5ID0gYXIgKyBiclxuICBpZih5KSB7XG4gICAgcmV0dXJuIFt5LCB4XVxuICB9XG4gIHJldHVybiBbeF1cbn1cblxuZnVuY3Rpb24gbGluZWFyRXhwYW5zaW9uU3VtKGUsIGYpIHtcbiAgdmFyIG5lID0gZS5sZW5ndGh8MFxuICB2YXIgbmYgPSBmLmxlbmd0aHwwXG4gIGlmKG5lID09PSAxICYmIG5mID09PSAxKSB7XG4gICAgcmV0dXJuIHNjYWxhclNjYWxhcihlWzBdLCBmWzBdKVxuICB9XG4gIHZhciBuID0gbmUgKyBuZlxuICB2YXIgZyA9IG5ldyBBcnJheShuKVxuICB2YXIgY291bnQgPSAwXG4gIHZhciBlcHRyID0gMFxuICB2YXIgZnB0ciA9IDBcbiAgdmFyIGFicyA9IE1hdGguYWJzXG4gIHZhciBlaSA9IGVbZXB0cl1cbiAgdmFyIGVhID0gYWJzKGVpKVxuICB2YXIgZmkgPSBmW2ZwdHJdXG4gIHZhciBmYSA9IGFicyhmaSlcbiAgdmFyIGEsIGJcbiAgaWYoZWEgPCBmYSkge1xuICAgIGIgPSBlaVxuICAgIGVwdHIgKz0gMVxuICAgIGlmKGVwdHIgPCBuZSkge1xuICAgICAgZWkgPSBlW2VwdHJdXG4gICAgICBlYSA9IGFicyhlaSlcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgYiA9IGZpXG4gICAgZnB0ciArPSAxXG4gICAgaWYoZnB0ciA8IG5mKSB7XG4gICAgICBmaSA9IGZbZnB0cl1cbiAgICAgIGZhID0gYWJzKGZpKVxuICAgIH1cbiAgfVxuICBpZigoZXB0ciA8IG5lICYmIGVhIDwgZmEpIHx8IChmcHRyID49IG5mKSkge1xuICAgIGEgPSBlaVxuICAgIGVwdHIgKz0gMVxuICAgIGlmKGVwdHIgPCBuZSkge1xuICAgICAgZWkgPSBlW2VwdHJdXG4gICAgICBlYSA9IGFicyhlaSlcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgYSA9IGZpXG4gICAgZnB0ciArPSAxXG4gICAgaWYoZnB0ciA8IG5mKSB7XG4gICAgICBmaSA9IGZbZnB0cl1cbiAgICAgIGZhID0gYWJzKGZpKVxuICAgIH1cbiAgfVxuICB2YXIgeCA9IGEgKyBiXG4gIHZhciBidiA9IHggLSBhXG4gIHZhciB5ID0gYiAtIGJ2XG4gIHZhciBxMCA9IHlcbiAgdmFyIHExID0geFxuICB2YXIgX3gsIF9idiwgX2F2LCBfYnIsIF9hclxuICB3aGlsZShlcHRyIDwgbmUgJiYgZnB0ciA8IG5mKSB7XG4gICAgaWYoZWEgPCBmYSkge1xuICAgICAgYSA9IGVpXG4gICAgICBlcHRyICs9IDFcbiAgICAgIGlmKGVwdHIgPCBuZSkge1xuICAgICAgICBlaSA9IGVbZXB0cl1cbiAgICAgICAgZWEgPSBhYnMoZWkpXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGEgPSBmaVxuICAgICAgZnB0ciArPSAxXG4gICAgICBpZihmcHRyIDwgbmYpIHtcbiAgICAgICAgZmkgPSBmW2ZwdHJdXG4gICAgICAgIGZhID0gYWJzKGZpKVxuICAgICAgfVxuICAgIH1cbiAgICBiID0gcTBcbiAgICB4ID0gYSArIGJcbiAgICBidiA9IHggLSBhXG4gICAgeSA9IGIgLSBidlxuICAgIGlmKHkpIHtcbiAgICAgIGdbY291bnQrK10gPSB5XG4gICAgfVxuICAgIF94ID0gcTEgKyB4XG4gICAgX2J2ID0gX3ggLSBxMVxuICAgIF9hdiA9IF94IC0gX2J2XG4gICAgX2JyID0geCAtIF9idlxuICAgIF9hciA9IHExIC0gX2F2XG4gICAgcTAgPSBfYXIgKyBfYnJcbiAgICBxMSA9IF94XG4gIH1cbiAgd2hpbGUoZXB0ciA8IG5lKSB7XG4gICAgYSA9IGVpXG4gICAgYiA9IHEwXG4gICAgeCA9IGEgKyBiXG4gICAgYnYgPSB4IC0gYVxuICAgIHkgPSBiIC0gYnZcbiAgICBpZih5KSB7XG4gICAgICBnW2NvdW50KytdID0geVxuICAgIH1cbiAgICBfeCA9IHExICsgeFxuICAgIF9idiA9IF94IC0gcTFcbiAgICBfYXYgPSBfeCAtIF9idlxuICAgIF9iciA9IHggLSBfYnZcbiAgICBfYXIgPSBxMSAtIF9hdlxuICAgIHEwID0gX2FyICsgX2JyXG4gICAgcTEgPSBfeFxuICAgIGVwdHIgKz0gMVxuICAgIGlmKGVwdHIgPCBuZSkge1xuICAgICAgZWkgPSBlW2VwdHJdXG4gICAgfVxuICB9XG4gIHdoaWxlKGZwdHIgPCBuZikge1xuICAgIGEgPSBmaVxuICAgIGIgPSBxMFxuICAgIHggPSBhICsgYlxuICAgIGJ2ID0geCAtIGFcbiAgICB5ID0gYiAtIGJ2XG4gICAgaWYoeSkge1xuICAgICAgZ1tjb3VudCsrXSA9IHlcbiAgICB9IFxuICAgIF94ID0gcTEgKyB4XG4gICAgX2J2ID0gX3ggLSBxMVxuICAgIF9hdiA9IF94IC0gX2J2XG4gICAgX2JyID0geCAtIF9idlxuICAgIF9hciA9IHExIC0gX2F2XG4gICAgcTAgPSBfYXIgKyBfYnJcbiAgICBxMSA9IF94XG4gICAgZnB0ciArPSAxXG4gICAgaWYoZnB0ciA8IG5mKSB7XG4gICAgICBmaSA9IGZbZnB0cl1cbiAgICB9XG4gIH1cbiAgaWYocTApIHtcbiAgICBnW2NvdW50KytdID0gcTBcbiAgfVxuICBpZihxMSkge1xuICAgIGdbY291bnQrK10gPSBxMVxuICB9XG4gIGlmKCFjb3VudCkge1xuICAgIGdbY291bnQrK10gPSAwLjAgIFxuICB9XG4gIGcubGVuZ3RoID0gY291bnRcbiAgcmV0dXJuIGdcbn0iLCIvLyBzcXVhcmUgZGlzdGFuY2UgZnJvbSBhIHBvaW50IHRvIGEgc2VnbWVudFxuZnVuY3Rpb24gZ2V0U3FTZWdEaXN0KHAsIHAxLCBwMikge1xuICAgIHZhciB4ID0gcDFbMF0sXG4gICAgICAgIHkgPSBwMVsxXSxcbiAgICAgICAgZHggPSBwMlswXSAtIHgsXG4gICAgICAgIGR5ID0gcDJbMV0gLSB5O1xuXG4gICAgaWYgKGR4ICE9PSAwIHx8IGR5ICE9PSAwKSB7XG5cbiAgICAgICAgdmFyIHQgPSAoKHBbMF0gLSB4KSAqIGR4ICsgKHBbMV0gLSB5KSAqIGR5KSAvIChkeCAqIGR4ICsgZHkgKiBkeSk7XG5cbiAgICAgICAgaWYgKHQgPiAxKSB7XG4gICAgICAgICAgICB4ID0gcDJbMF07XG4gICAgICAgICAgICB5ID0gcDJbMV07XG5cbiAgICAgICAgfSBlbHNlIGlmICh0ID4gMCkge1xuICAgICAgICAgICAgeCArPSBkeCAqIHQ7XG4gICAgICAgICAgICB5ICs9IGR5ICogdDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGR4ID0gcFswXSAtIHg7XG4gICAgZHkgPSBwWzFdIC0geTtcblxuICAgIHJldHVybiBkeCAqIGR4ICsgZHkgKiBkeTtcbn1cblxuZnVuY3Rpb24gc2ltcGxpZnlEUFN0ZXAocG9pbnRzLCBmaXJzdCwgbGFzdCwgc3FUb2xlcmFuY2UsIHNpbXBsaWZpZWQpIHtcbiAgICB2YXIgbWF4U3FEaXN0ID0gc3FUb2xlcmFuY2UsXG4gICAgICAgIGluZGV4O1xuXG4gICAgZm9yICh2YXIgaSA9IGZpcnN0ICsgMTsgaSA8IGxhc3Q7IGkrKykge1xuICAgICAgICB2YXIgc3FEaXN0ID0gZ2V0U3FTZWdEaXN0KHBvaW50c1tpXSwgcG9pbnRzW2ZpcnN0XSwgcG9pbnRzW2xhc3RdKTtcblxuICAgICAgICBpZiAoc3FEaXN0ID4gbWF4U3FEaXN0KSB7XG4gICAgICAgICAgICBpbmRleCA9IGk7XG4gICAgICAgICAgICBtYXhTcURpc3QgPSBzcURpc3Q7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAobWF4U3FEaXN0ID4gc3FUb2xlcmFuY2UpIHtcbiAgICAgICAgaWYgKGluZGV4IC0gZmlyc3QgPiAxKSBzaW1wbGlmeURQU3RlcChwb2ludHMsIGZpcnN0LCBpbmRleCwgc3FUb2xlcmFuY2UsIHNpbXBsaWZpZWQpO1xuICAgICAgICBzaW1wbGlmaWVkLnB1c2gocG9pbnRzW2luZGV4XSk7XG4gICAgICAgIGlmIChsYXN0IC0gaW5kZXggPiAxKSBzaW1wbGlmeURQU3RlcChwb2ludHMsIGluZGV4LCBsYXN0LCBzcVRvbGVyYW5jZSwgc2ltcGxpZmllZCk7XG4gICAgfVxufVxuXG4vLyBzaW1wbGlmaWNhdGlvbiB1c2luZyBSYW1lci1Eb3VnbGFzLVBldWNrZXIgYWxnb3JpdGhtXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHNpbXBsaWZ5RG91Z2xhc1BldWNrZXIocG9pbnRzLCB0b2xlcmFuY2UpIHtcbiAgICBpZiAocG9pbnRzLmxlbmd0aDw9MSlcbiAgICAgICAgcmV0dXJuIHBvaW50cztcbiAgICB0b2xlcmFuY2UgPSB0eXBlb2YgdG9sZXJhbmNlID09PSAnbnVtYmVyJyA/IHRvbGVyYW5jZSA6IDE7XG4gICAgdmFyIHNxVG9sZXJhbmNlID0gdG9sZXJhbmNlICogdG9sZXJhbmNlO1xuICAgIFxuICAgIHZhciBsYXN0ID0gcG9pbnRzLmxlbmd0aCAtIDE7XG5cbiAgICB2YXIgc2ltcGxpZmllZCA9IFtwb2ludHNbMF1dO1xuICAgIHNpbXBsaWZ5RFBTdGVwKHBvaW50cywgMCwgbGFzdCwgc3FUb2xlcmFuY2UsIHNpbXBsaWZpZWQpO1xuICAgIHNpbXBsaWZpZWQucHVzaChwb2ludHNbbGFzdF0pO1xuXG4gICAgcmV0dXJuIHNpbXBsaWZpZWQ7XG59XG4iLCJ2YXIgc2ltcGxpZnlSYWRpYWxEaXN0ID0gcmVxdWlyZSgnLi9yYWRpYWwtZGlzdGFuY2UnKVxudmFyIHNpbXBsaWZ5RG91Z2xhc1BldWNrZXIgPSByZXF1aXJlKCcuL2RvdWdsYXMtcGV1Y2tlcicpXG5cbi8vc2ltcGxpZmllcyB1c2luZyBib3RoIGFsZ29yaXRobXNcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gc2ltcGxpZnkocG9pbnRzLCB0b2xlcmFuY2UpIHtcbiAgICBwb2ludHMgPSBzaW1wbGlmeVJhZGlhbERpc3QocG9pbnRzLCB0b2xlcmFuY2UpO1xuICAgIHBvaW50cyA9IHNpbXBsaWZ5RG91Z2xhc1BldWNrZXIocG9pbnRzLCB0b2xlcmFuY2UpO1xuICAgIHJldHVybiBwb2ludHM7XG59XG5cbm1vZHVsZS5leHBvcnRzLnJhZGlhbERpc3RhbmNlID0gc2ltcGxpZnlSYWRpYWxEaXN0O1xubW9kdWxlLmV4cG9ydHMuZG91Z2xhc1BldWNrZXIgPSBzaW1wbGlmeURvdWdsYXNQZXVja2VyOyIsImZ1bmN0aW9uIGdldFNxRGlzdChwMSwgcDIpIHtcbiAgICB2YXIgZHggPSBwMVswXSAtIHAyWzBdLFxuICAgICAgICBkeSA9IHAxWzFdIC0gcDJbMV07XG5cbiAgICByZXR1cm4gZHggKiBkeCArIGR5ICogZHk7XG59XG5cbi8vIGJhc2ljIGRpc3RhbmNlLWJhc2VkIHNpbXBsaWZpY2F0aW9uXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHNpbXBsaWZ5UmFkaWFsRGlzdChwb2ludHMsIHRvbGVyYW5jZSkge1xuICAgIGlmIChwb2ludHMubGVuZ3RoPD0xKVxuICAgICAgICByZXR1cm4gcG9pbnRzO1xuICAgIHRvbGVyYW5jZSA9IHR5cGVvZiB0b2xlcmFuY2UgPT09ICdudW1iZXInID8gdG9sZXJhbmNlIDogMTtcbiAgICB2YXIgc3FUb2xlcmFuY2UgPSB0b2xlcmFuY2UgKiB0b2xlcmFuY2U7XG4gICAgXG4gICAgdmFyIHByZXZQb2ludCA9IHBvaW50c1swXSxcbiAgICAgICAgbmV3UG9pbnRzID0gW3ByZXZQb2ludF0sXG4gICAgICAgIHBvaW50O1xuXG4gICAgZm9yICh2YXIgaSA9IDEsIGxlbiA9IHBvaW50cy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgICAgICBwb2ludCA9IHBvaW50c1tpXTtcblxuICAgICAgICBpZiAoZ2V0U3FEaXN0KHBvaW50LCBwcmV2UG9pbnQpID4gc3FUb2xlcmFuY2UpIHtcbiAgICAgICAgICAgIG5ld1BvaW50cy5wdXNoKHBvaW50KTtcbiAgICAgICAgICAgIHByZXZQb2ludCA9IHBvaW50O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHByZXZQb2ludCAhPT0gcG9pbnQpIG5ld1BvaW50cy5wdXNoKHBvaW50KTtcblxuICAgIHJldHVybiBuZXdQb2ludHM7XG59IiwidmFyIHBhcnNlU1ZHID0gcmVxdWlyZSgncGFyc2Utc3ZnLXBhdGgnKVxudmFyIGdldENvbnRvdXJzID0gcmVxdWlyZSgnc3ZnLXBhdGgtY29udG91cnMnKVxudmFyIGNkdDJkID0gcmVxdWlyZSgnY2R0MmQnKVxudmFyIGNsZWFuUFNMRyA9IHJlcXVpcmUoJ2NsZWFuLXBzbGcnKVxudmFyIGdldEJvdW5kcyA9IHJlcXVpcmUoJ2JvdW5kLXBvaW50cycpXG52YXIgbm9ybWFsaXplID0gcmVxdWlyZSgnbm9ybWFsaXplLXBhdGgtc2NhbGUnKVxudmFyIHJhbmRvbSA9IHJlcXVpcmUoJ3JhbmRvbS1mbG9hdCcpXG52YXIgYXNzaWduID0gcmVxdWlyZSgnb2JqZWN0LWFzc2lnbicpXG52YXIgc2ltcGxpZnkgPSByZXF1aXJlKCdzaW1wbGlmeS1wYXRoJylcblxubW9kdWxlLmV4cG9ydHMgPSBzdmdNZXNoM2RcbmZ1bmN0aW9uIHN2Z01lc2gzZCAoc3ZnUGF0aCwgb3B0KSB7XG4gIGlmICh0eXBlb2Ygc3ZnUGF0aCAhPT0gJ3N0cmluZycpIHtcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdtdXN0IHByb3ZpZGUgYSBzdHJpbmcgYXMgZmlyc3QgcGFyYW1ldGVyJylcbiAgfVxuICBcbiAgb3B0ID0gYXNzaWduKHtcbiAgICBkZWxhdW5heTogdHJ1ZSxcbiAgICBjbGVhbjogdHJ1ZSxcbiAgICBleHRlcmlvcjogZmFsc2UsXG4gICAgcmFuZG9taXphdGlvbjogMCxcbiAgICBzaW1wbGlmeTogMCxcbiAgICBzY2FsZTogMVxuICB9LCBvcHQpXG4gIFxuICB2YXIgaVxuICAvLyBwYXJzZSBzdHJpbmcgYXMgYSBsaXN0IG9mIG9wZXJhdGlvbnNcbiAgdmFyIHN2ZyA9IHBhcnNlU1ZHKHN2Z1BhdGgpXG4gIFxuICAvLyBjb252ZXJ0IGN1cnZlcyBpbnRvIGRpc2NyZXRlIHBvaW50c1xuICB2YXIgY29udG91cnMgPSBnZXRDb250b3VycyhzdmcsIG9wdC5zY2FsZSlcbiAgXG4gIC8vIG9wdGlvbmFsbHkgc2ltcGxpZnkgdGhlIHBhdGggZm9yIGZhc3RlciB0cmlhbmd1bGF0aW9uIGFuZC9vciBhZXN0aGV0aWNzXG4gIGlmIChvcHQuc2ltcGxpZnkgPiAwICYmIHR5cGVvZiBvcHQuc2ltcGxpZnkgPT09ICdudW1iZXInKSB7XG4gICAgZm9yIChpID0gMDsgaSA8IGNvbnRvdXJzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb250b3Vyc1tpXSA9IHNpbXBsaWZ5KGNvbnRvdXJzW2ldLCBvcHQuc2ltcGxpZnkpXG4gICAgfVxuICB9XG4gIFxuICAvLyBwcmVwYXJlIGZvciB0cmlhbmd1bGF0aW9uXG4gIHZhciBwb2x5bGluZSA9IGRlbmVzdFBvbHlsaW5lKGNvbnRvdXJzKVxuICB2YXIgcG9zaXRpb25zID0gcG9seWxpbmUucG9zaXRpb25zXG4gIHZhciBib3VuZHMgPSBnZXRCb3VuZHMocG9zaXRpb25zKVxuXG4gIC8vIG9wdGlvbmFsbHkgYWRkIHJhbmRvbSBwb2ludHMgZm9yIGFlc3RoZXRpY3NcbiAgdmFyIHJhbmRvbWl6YXRpb24gPSBvcHQucmFuZG9taXphdGlvblxuICBpZiAodHlwZW9mIHJhbmRvbWl6YXRpb24gPT09ICdudW1iZXInICYmIHJhbmRvbWl6YXRpb24gPiAwKSB7XG4gICAgYWRkUmFuZG9tUG9pbnRzKHBvc2l0aW9ucywgYm91bmRzLCByYW5kb21pemF0aW9uKVxuICB9XG4gIFxuICB2YXIgbG9vcHMgPSBwb2x5bGluZS5lZGdlc1xuICB2YXIgZWRnZXMgPSBbXVxuICBmb3IgKGkgPSAwOyBpIDwgbG9vcHMubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgbG9vcCA9IGxvb3BzW2ldXG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCBsb29wLmxlbmd0aDsgKytqKSB7XG4gICAgICBlZGdlcy5wdXNoKFtsb29wW2pdLCBsb29wWyhqICsgMSkgJSBsb29wLmxlbmd0aF1dKVxuICAgIH1cbiAgfVxuXG4gIC8vIHRoaXMgdXBkYXRlcyBwb2ludHMvZWRnZXMgc28gdGhhdCB0aGV5IG5vdyBmb3JtIGEgdmFsaWQgUFNMRyBcbiAgaWYgKG9wdC5jbGVhbiAhPT0gZmFsc2UpIHtcbiAgICBjbGVhblBTTEcocG9zaXRpb25zLCBlZGdlcylcbiAgfVxuXG4gIC8vIHRyaWFuZ3VsYXRlIG1lc2hcbiAgdmFyIGNlbGxzID0gY2R0MmQocG9zaXRpb25zLCBlZGdlcywgb3B0KVxuXG4gIC8vIHJlc2NhbGUgdG8gWy0xIC4uLiAxXVxuICBpZiAob3B0Lm5vcm1hbGl6ZSAhPT0gZmFsc2UpIHtcbiAgICBub3JtYWxpemUocG9zaXRpb25zLCBib3VuZHMpXG4gIH1cblxuICAvLyBjb252ZXJ0IHRvIDNEIHJlcHJlc2VudGF0aW9uIGFuZCBmbGlwIG9uIFkgYXhpcyBmb3IgY29udmVuaWVuY2Ugdy8gT3BlbkdMXG4gIHRvM0QocG9zaXRpb25zKVxuXG4gIHJldHVybiB7XG4gICAgcG9zaXRpb25zOiBwb3NpdGlvbnMsXG4gICAgY2VsbHM6IGNlbGxzXG4gIH1cbn1cblxuZnVuY3Rpb24gdG8zRCAocG9zaXRpb25zKSB7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgcG9zaXRpb25zLmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIHh5ID0gcG9zaXRpb25zW2ldXG4gICAgeHlbMV0gKj0gLTFcbiAgICB4eVsyXSA9IHh5WzJdIHx8IDBcbiAgfVxufVxuXG5mdW5jdGlvbiBhZGRSYW5kb21Qb2ludHMgKHBvc2l0aW9ucywgYm91bmRzLCBjb3VudCkge1xuICB2YXIgbWluID0gYm91bmRzWzBdXG4gIHZhciBtYXggPSBib3VuZHNbMV1cblxuICBmb3IgKHZhciBpID0gMDsgaSA8IGNvdW50OyBpKyspIHtcbiAgICBwb3NpdGlvbnMucHVzaChbIC8vIHJhbmRvbSBbIHgsIHkgXVxuICAgICAgcmFuZG9tKG1pblswXSwgbWF4WzBdKSxcbiAgICAgIHJhbmRvbShtaW5bMV0sIG1heFsxXSlcbiAgICBdKVxuICB9XG59XG5cbmZ1bmN0aW9uIGRlbmVzdFBvbHlsaW5lIChuZXN0ZWQpIHtcbiAgdmFyIHBvc2l0aW9ucyA9IFtdXG4gIHZhciBlZGdlcyA9IFtdXG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBuZXN0ZWQubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgcGF0aCA9IG5lc3RlZFtpXVxuICAgIHZhciBsb29wID0gW11cbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IHBhdGgubGVuZ3RoOyBqKyspIHtcbiAgICAgIHZhciBwb3MgPSBwYXRoW2pdXG4gICAgICB2YXIgaWR4ID0gcG9zaXRpb25zLmluZGV4T2YocG9zKVxuICAgICAgaWYgKGlkeCA9PT0gLTEpIHtcbiAgICAgICAgcG9zaXRpb25zLnB1c2gocG9zKVxuICAgICAgICBpZHggPSBwb3NpdGlvbnMubGVuZ3RoIC0gMVxuICAgICAgfVxuICAgICAgbG9vcC5wdXNoKGlkeClcbiAgICB9XG4gICAgZWRnZXMucHVzaChsb29wKVxuICB9XG4gIHJldHVybiB7XG4gICAgcG9zaXRpb25zOiBwb3NpdGlvbnMsXG4gICAgZWRnZXM6IGVkZ2VzXG4gIH1cbn1cbiIsInZhciBiZXppZXIgPSByZXF1aXJlKCdhZGFwdGl2ZS1iZXppZXItY3VydmUnKVxudmFyIGFicyA9IHJlcXVpcmUoJ2Ficy1zdmctcGF0aCcpXG52YXIgbm9ybSA9IHJlcXVpcmUoJ25vcm1hbGl6ZS1zdmctcGF0aCcpXG52YXIgY29weSA9IHJlcXVpcmUoJ3ZlYzItY29weScpXG5cbmZ1bmN0aW9uIHNldChvdXQsIHgsIHkpIHtcbiAgICBvdXRbMF0gPSB4XG4gICAgb3V0WzFdID0geVxuICAgIHJldHVybiBvdXRcbn1cblxudmFyIHRtcDEgPSBbMCwwXSxcbiAgICB0bXAyID0gWzAsMF0sXG4gICAgdG1wMyA9IFswLDBdXG5cbmZ1bmN0aW9uIGJlemllclRvKHBvaW50cywgc2NhbGUsIHN0YXJ0LCBzZWcpIHtcbiAgICBiZXppZXIoc3RhcnQsIFxuICAgICAgICBzZXQodG1wMSwgc2VnWzFdLCBzZWdbMl0pLCBcbiAgICAgICAgc2V0KHRtcDIsIHNlZ1szXSwgc2VnWzRdKSxcbiAgICAgICAgc2V0KHRtcDMsIHNlZ1s1XSwgc2VnWzZdKSwgc2NhbGUsIHBvaW50cylcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjb250b3VycyhzdmcsIHNjYWxlKSB7XG4gICAgdmFyIHBhdGhzID0gW11cblxuICAgIHZhciBwb2ludHMgPSBbXVxuICAgIHZhciBwZW4gPSBbMCwgMF1cbiAgICBub3JtKGFicyhzdmcpKS5mb3JFYWNoKGZ1bmN0aW9uKHNlZ21lbnQsIGksIHNlbGYpIHtcbiAgICAgICAgaWYgKHNlZ21lbnRbMF0gPT09ICdNJykge1xuICAgICAgICAgICAgY29weShwZW4sIHNlZ21lbnQuc2xpY2UoMSkpXG4gICAgICAgICAgICBpZiAocG9pbnRzLmxlbmd0aD4wKSB7XG4gICAgICAgICAgICAgICAgcGF0aHMucHVzaChwb2ludHMpXG4gICAgICAgICAgICAgICAgcG9pbnRzID0gW11cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChzZWdtZW50WzBdID09PSAnQycpIHtcbiAgICAgICAgICAgIGJlemllclRvKHBvaW50cywgc2NhbGUsIHBlbiwgc2VnbWVudClcbiAgICAgICAgICAgIHNldChwZW4sIHNlZ21lbnRbNV0sIHNlZ21lbnRbNl0pXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ2lsbGVnYWwgdHlwZSBpbiBTVkc6ICcrc2VnbWVudFswXSlcbiAgICAgICAgfVxuICAgIH0pXG4gICAgaWYgKHBvaW50cy5sZW5ndGg+MClcbiAgICAgICAgcGF0aHMucHVzaChwb2ludHMpXG4gICAgcmV0dXJuIHBhdGhzXG59IiwiXCJ1c2Ugc3RyaWN0XCJcblxubW9kdWxlLmV4cG9ydHMgPSB0d29Qcm9kdWN0XG5cbnZhciBTUExJVFRFUiA9ICsoTWF0aC5wb3coMiwgMjcpICsgMS4wKVxuXG5mdW5jdGlvbiB0d29Qcm9kdWN0KGEsIGIsIHJlc3VsdCkge1xuICB2YXIgeCA9IGEgKiBiXG5cbiAgdmFyIGMgPSBTUExJVFRFUiAqIGFcbiAgdmFyIGFiaWcgPSBjIC0gYVxuICB2YXIgYWhpID0gYyAtIGFiaWdcbiAgdmFyIGFsbyA9IGEgLSBhaGlcblxuICB2YXIgZCA9IFNQTElUVEVSICogYlxuICB2YXIgYmJpZyA9IGQgLSBiXG4gIHZhciBiaGkgPSBkIC0gYmJpZ1xuICB2YXIgYmxvID0gYiAtIGJoaVxuXG4gIHZhciBlcnIxID0geCAtIChhaGkgKiBiaGkpXG4gIHZhciBlcnIyID0gZXJyMSAtIChhbG8gKiBiaGkpXG4gIHZhciBlcnIzID0gZXJyMiAtIChhaGkgKiBibG8pXG5cbiAgdmFyIHkgPSBhbG8gKiBibG8gLSBlcnIzXG5cbiAgaWYocmVzdWx0KSB7XG4gICAgcmVzdWx0WzBdID0geVxuICAgIHJlc3VsdFsxXSA9IHhcbiAgICByZXR1cm4gcmVzdWx0XG4gIH1cblxuICByZXR1cm4gWyB5LCB4IF1cbn0iLCJcInVzZSBzdHJpY3RcIlxuXG5tb2R1bGUuZXhwb3J0cyA9IGZhc3RUd29TdW1cblxuZnVuY3Rpb24gZmFzdFR3b1N1bShhLCBiLCByZXN1bHQpIHtcblx0dmFyIHggPSBhICsgYlxuXHR2YXIgYnYgPSB4IC0gYVxuXHR2YXIgYXYgPSB4IC0gYnZcblx0dmFyIGJyID0gYiAtIGJ2XG5cdHZhciBhciA9IGEgLSBhdlxuXHRpZihyZXN1bHQpIHtcblx0XHRyZXN1bHRbMF0gPSBhciArIGJyXG5cdFx0cmVzdWx0WzFdID0geFxuXHRcdHJldHVybiByZXN1bHRcblx0fVxuXHRyZXR1cm4gW2FyK2JyLCB4XVxufSIsIihmdW5jdGlvbiAoZ2xvYmFsLEJ1ZmZlcil7XG4ndXNlIHN0cmljdCdcblxudmFyIGJpdHMgPSByZXF1aXJlKCdiaXQtdHdpZGRsZScpXG52YXIgZHVwID0gcmVxdWlyZSgnZHVwJylcblxuLy9MZWdhY3kgcG9vbCBzdXBwb3J0XG5pZighZ2xvYmFsLl9fVFlQRURBUlJBWV9QT09MKSB7XG4gIGdsb2JhbC5fX1RZUEVEQVJSQVlfUE9PTCA9IHtcbiAgICAgIFVJTlQ4ICAgOiBkdXAoWzMyLCAwXSlcbiAgICAsIFVJTlQxNiAgOiBkdXAoWzMyLCAwXSlcbiAgICAsIFVJTlQzMiAgOiBkdXAoWzMyLCAwXSlcbiAgICAsIElOVDggICAgOiBkdXAoWzMyLCAwXSlcbiAgICAsIElOVDE2ICAgOiBkdXAoWzMyLCAwXSlcbiAgICAsIElOVDMyICAgOiBkdXAoWzMyLCAwXSlcbiAgICAsIEZMT0FUICAgOiBkdXAoWzMyLCAwXSlcbiAgICAsIERPVUJMRSAgOiBkdXAoWzMyLCAwXSlcbiAgICAsIERBVEEgICAgOiBkdXAoWzMyLCAwXSlcbiAgICAsIFVJTlQ4QyAgOiBkdXAoWzMyLCAwXSlcbiAgICAsIEJVRkZFUiAgOiBkdXAoWzMyLCAwXSlcbiAgfVxufVxuXG52YXIgaGFzVWludDhDID0gKHR5cGVvZiBVaW50OENsYW1wZWRBcnJheSkgIT09ICd1bmRlZmluZWQnXG52YXIgUE9PTCA9IGdsb2JhbC5fX1RZUEVEQVJSQVlfUE9PTFxuXG4vL1VwZ3JhZGUgcG9vbFxuaWYoIVBPT0wuVUlOVDhDKSB7XG4gIFBPT0wuVUlOVDhDID0gZHVwKFszMiwgMF0pXG59XG5pZighUE9PTC5CVUZGRVIpIHtcbiAgUE9PTC5CVUZGRVIgPSBkdXAoWzMyLCAwXSlcbn1cblxuLy9OZXcgdGVjaG5pcXVlOiBPbmx5IGFsbG9jYXRlIGZyb20gQXJyYXlCdWZmZXJWaWV3IGFuZCBCdWZmZXJcbnZhciBEQVRBICAgID0gUE9PTC5EQVRBXG4gICwgQlVGRkVSICA9IFBPT0wuQlVGRkVSXG5cbmV4cG9ydHMuZnJlZSA9IGZ1bmN0aW9uIGZyZWUoYXJyYXkpIHtcbiAgaWYoQnVmZmVyLmlzQnVmZmVyKGFycmF5KSkge1xuICAgIEJVRkZFUltiaXRzLmxvZzIoYXJyYXkubGVuZ3RoKV0ucHVzaChhcnJheSlcbiAgfSBlbHNlIHtcbiAgICBpZihPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoYXJyYXkpICE9PSAnW29iamVjdCBBcnJheUJ1ZmZlcl0nKSB7XG4gICAgICBhcnJheSA9IGFycmF5LmJ1ZmZlclxuICAgIH1cbiAgICBpZighYXJyYXkpIHtcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICB2YXIgbiA9IGFycmF5Lmxlbmd0aCB8fCBhcnJheS5ieXRlTGVuZ3RoXG4gICAgdmFyIGxvZ19uID0gYml0cy5sb2cyKG4pfDBcbiAgICBEQVRBW2xvZ19uXS5wdXNoKGFycmF5KVxuICB9XG59XG5cbmZ1bmN0aW9uIGZyZWVBcnJheUJ1ZmZlcihidWZmZXIpIHtcbiAgaWYoIWJ1ZmZlcikge1xuICAgIHJldHVyblxuICB9XG4gIHZhciBuID0gYnVmZmVyLmxlbmd0aCB8fCBidWZmZXIuYnl0ZUxlbmd0aFxuICB2YXIgbG9nX24gPSBiaXRzLmxvZzIobilcbiAgREFUQVtsb2dfbl0ucHVzaChidWZmZXIpXG59XG5cbmZ1bmN0aW9uIGZyZWVUeXBlZEFycmF5KGFycmF5KSB7XG4gIGZyZWVBcnJheUJ1ZmZlcihhcnJheS5idWZmZXIpXG59XG5cbmV4cG9ydHMuZnJlZVVpbnQ4ID1cbmV4cG9ydHMuZnJlZVVpbnQxNiA9XG5leHBvcnRzLmZyZWVVaW50MzIgPVxuZXhwb3J0cy5mcmVlSW50OCA9XG5leHBvcnRzLmZyZWVJbnQxNiA9XG5leHBvcnRzLmZyZWVJbnQzMiA9XG5leHBvcnRzLmZyZWVGbG9hdDMyID0gXG5leHBvcnRzLmZyZWVGbG9hdCA9XG5leHBvcnRzLmZyZWVGbG9hdDY0ID0gXG5leHBvcnRzLmZyZWVEb3VibGUgPSBcbmV4cG9ydHMuZnJlZVVpbnQ4Q2xhbXBlZCA9IFxuZXhwb3J0cy5mcmVlRGF0YVZpZXcgPSBmcmVlVHlwZWRBcnJheVxuXG5leHBvcnRzLmZyZWVBcnJheUJ1ZmZlciA9IGZyZWVBcnJheUJ1ZmZlclxuXG5leHBvcnRzLmZyZWVCdWZmZXIgPSBmdW5jdGlvbiBmcmVlQnVmZmVyKGFycmF5KSB7XG4gIEJVRkZFUltiaXRzLmxvZzIoYXJyYXkubGVuZ3RoKV0ucHVzaChhcnJheSlcbn1cblxuZXhwb3J0cy5tYWxsb2MgPSBmdW5jdGlvbiBtYWxsb2MobiwgZHR5cGUpIHtcbiAgaWYoZHR5cGUgPT09IHVuZGVmaW5lZCB8fCBkdHlwZSA9PT0gJ2FycmF5YnVmZmVyJykge1xuICAgIHJldHVybiBtYWxsb2NBcnJheUJ1ZmZlcihuKVxuICB9IGVsc2Uge1xuICAgIHN3aXRjaChkdHlwZSkge1xuICAgICAgY2FzZSAndWludDgnOlxuICAgICAgICByZXR1cm4gbWFsbG9jVWludDgobilcbiAgICAgIGNhc2UgJ3VpbnQxNic6XG4gICAgICAgIHJldHVybiBtYWxsb2NVaW50MTYobilcbiAgICAgIGNhc2UgJ3VpbnQzMic6XG4gICAgICAgIHJldHVybiBtYWxsb2NVaW50MzIobilcbiAgICAgIGNhc2UgJ2ludDgnOlxuICAgICAgICByZXR1cm4gbWFsbG9jSW50OChuKVxuICAgICAgY2FzZSAnaW50MTYnOlxuICAgICAgICByZXR1cm4gbWFsbG9jSW50MTYobilcbiAgICAgIGNhc2UgJ2ludDMyJzpcbiAgICAgICAgcmV0dXJuIG1hbGxvY0ludDMyKG4pXG4gICAgICBjYXNlICdmbG9hdCc6XG4gICAgICBjYXNlICdmbG9hdDMyJzpcbiAgICAgICAgcmV0dXJuIG1hbGxvY0Zsb2F0KG4pXG4gICAgICBjYXNlICdkb3VibGUnOlxuICAgICAgY2FzZSAnZmxvYXQ2NCc6XG4gICAgICAgIHJldHVybiBtYWxsb2NEb3VibGUobilcbiAgICAgIGNhc2UgJ3VpbnQ4X2NsYW1wZWQnOlxuICAgICAgICByZXR1cm4gbWFsbG9jVWludDhDbGFtcGVkKG4pXG4gICAgICBjYXNlICdidWZmZXInOlxuICAgICAgICByZXR1cm4gbWFsbG9jQnVmZmVyKG4pXG4gICAgICBjYXNlICdkYXRhJzpcbiAgICAgIGNhc2UgJ2RhdGF2aWV3JzpcbiAgICAgICAgcmV0dXJuIG1hbGxvY0RhdGFWaWV3KG4pXG5cbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHJldHVybiBudWxsXG4gICAgfVxuICB9XG4gIHJldHVybiBudWxsXG59XG5cbmZ1bmN0aW9uIG1hbGxvY0FycmF5QnVmZmVyKG4pIHtcbiAgdmFyIG4gPSBiaXRzLm5leHRQb3cyKG4pXG4gIHZhciBsb2dfbiA9IGJpdHMubG9nMihuKVxuICB2YXIgZCA9IERBVEFbbG9nX25dXG4gIGlmKGQubGVuZ3RoID4gMCkge1xuICAgIHJldHVybiBkLnBvcCgpXG4gIH1cbiAgcmV0dXJuIG5ldyBBcnJheUJ1ZmZlcihuKVxufVxuZXhwb3J0cy5tYWxsb2NBcnJheUJ1ZmZlciA9IG1hbGxvY0FycmF5QnVmZmVyXG5cbmZ1bmN0aW9uIG1hbGxvY1VpbnQ4KG4pIHtcbiAgcmV0dXJuIG5ldyBVaW50OEFycmF5KG1hbGxvY0FycmF5QnVmZmVyKG4pLCAwLCBuKVxufVxuZXhwb3J0cy5tYWxsb2NVaW50OCA9IG1hbGxvY1VpbnQ4XG5cbmZ1bmN0aW9uIG1hbGxvY1VpbnQxNihuKSB7XG4gIHJldHVybiBuZXcgVWludDE2QXJyYXkobWFsbG9jQXJyYXlCdWZmZXIoMipuKSwgMCwgbilcbn1cbmV4cG9ydHMubWFsbG9jVWludDE2ID0gbWFsbG9jVWludDE2XG5cbmZ1bmN0aW9uIG1hbGxvY1VpbnQzMihuKSB7XG4gIHJldHVybiBuZXcgVWludDMyQXJyYXkobWFsbG9jQXJyYXlCdWZmZXIoNCpuKSwgMCwgbilcbn1cbmV4cG9ydHMubWFsbG9jVWludDMyID0gbWFsbG9jVWludDMyXG5cbmZ1bmN0aW9uIG1hbGxvY0ludDgobikge1xuICByZXR1cm4gbmV3IEludDhBcnJheShtYWxsb2NBcnJheUJ1ZmZlcihuKSwgMCwgbilcbn1cbmV4cG9ydHMubWFsbG9jSW50OCA9IG1hbGxvY0ludDhcblxuZnVuY3Rpb24gbWFsbG9jSW50MTYobikge1xuICByZXR1cm4gbmV3IEludDE2QXJyYXkobWFsbG9jQXJyYXlCdWZmZXIoMipuKSwgMCwgbilcbn1cbmV4cG9ydHMubWFsbG9jSW50MTYgPSBtYWxsb2NJbnQxNlxuXG5mdW5jdGlvbiBtYWxsb2NJbnQzMihuKSB7XG4gIHJldHVybiBuZXcgSW50MzJBcnJheShtYWxsb2NBcnJheUJ1ZmZlcig0Km4pLCAwLCBuKVxufVxuZXhwb3J0cy5tYWxsb2NJbnQzMiA9IG1hbGxvY0ludDMyXG5cbmZ1bmN0aW9uIG1hbGxvY0Zsb2F0KG4pIHtcbiAgcmV0dXJuIG5ldyBGbG9hdDMyQXJyYXkobWFsbG9jQXJyYXlCdWZmZXIoNCpuKSwgMCwgbilcbn1cbmV4cG9ydHMubWFsbG9jRmxvYXQzMiA9IGV4cG9ydHMubWFsbG9jRmxvYXQgPSBtYWxsb2NGbG9hdFxuXG5mdW5jdGlvbiBtYWxsb2NEb3VibGUobikge1xuICByZXR1cm4gbmV3IEZsb2F0NjRBcnJheShtYWxsb2NBcnJheUJ1ZmZlcig4Km4pLCAwLCBuKVxufVxuZXhwb3J0cy5tYWxsb2NGbG9hdDY0ID0gZXhwb3J0cy5tYWxsb2NEb3VibGUgPSBtYWxsb2NEb3VibGVcblxuZnVuY3Rpb24gbWFsbG9jVWludDhDbGFtcGVkKG4pIHtcbiAgaWYoaGFzVWludDhDKSB7XG4gICAgcmV0dXJuIG5ldyBVaW50OENsYW1wZWRBcnJheShtYWxsb2NBcnJheUJ1ZmZlcihuKSwgMCwgbilcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gbWFsbG9jVWludDgobilcbiAgfVxufVxuZXhwb3J0cy5tYWxsb2NVaW50OENsYW1wZWQgPSBtYWxsb2NVaW50OENsYW1wZWRcblxuZnVuY3Rpb24gbWFsbG9jRGF0YVZpZXcobikge1xuICByZXR1cm4gbmV3IERhdGFWaWV3KG1hbGxvY0FycmF5QnVmZmVyKG4pLCAwLCBuKVxufVxuZXhwb3J0cy5tYWxsb2NEYXRhVmlldyA9IG1hbGxvY0RhdGFWaWV3XG5cbmZ1bmN0aW9uIG1hbGxvY0J1ZmZlcihuKSB7XG4gIG4gPSBiaXRzLm5leHRQb3cyKG4pXG4gIHZhciBsb2dfbiA9IGJpdHMubG9nMihuKVxuICB2YXIgY2FjaGUgPSBCVUZGRVJbbG9nX25dXG4gIGlmKGNhY2hlLmxlbmd0aCA+IDApIHtcbiAgICByZXR1cm4gY2FjaGUucG9wKClcbiAgfVxuICByZXR1cm4gbmV3IEJ1ZmZlcihuKVxufVxuZXhwb3J0cy5tYWxsb2NCdWZmZXIgPSBtYWxsb2NCdWZmZXJcblxuZXhwb3J0cy5jbGVhckNhY2hlID0gZnVuY3Rpb24gY2xlYXJDYWNoZSgpIHtcbiAgZm9yKHZhciBpPTA7IGk8MzI7ICsraSkge1xuICAgIFBPT0wuVUlOVDhbaV0ubGVuZ3RoID0gMFxuICAgIFBPT0wuVUlOVDE2W2ldLmxlbmd0aCA9IDBcbiAgICBQT09MLlVJTlQzMltpXS5sZW5ndGggPSAwXG4gICAgUE9PTC5JTlQ4W2ldLmxlbmd0aCA9IDBcbiAgICBQT09MLklOVDE2W2ldLmxlbmd0aCA9IDBcbiAgICBQT09MLklOVDMyW2ldLmxlbmd0aCA9IDBcbiAgICBQT09MLkZMT0FUW2ldLmxlbmd0aCA9IDBcbiAgICBQT09MLkRPVUJMRVtpXS5sZW5ndGggPSAwXG4gICAgUE9PTC5VSU5UOENbaV0ubGVuZ3RoID0gMFxuICAgIERBVEFbaV0ubGVuZ3RoID0gMFxuICAgIEJVRkZFUltpXS5sZW5ndGggPSAwXG4gIH1cbn1cbn0pLmNhbGwodGhpcyx0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsIDogdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyKSIsIm1vZHVsZS5leHBvcnRzID0gdW5pbmRleFxuXG5mdW5jdGlvbiB1bmluZGV4KHBvc2l0aW9ucywgY2VsbHMsIG91dCkge1xuICBpZiAocG9zaXRpb25zLnBvc2l0aW9ucyAmJiBwb3NpdGlvbnMuY2VsbHMpIHtcbiAgICBvdXQgPSBjZWxsc1xuICAgIGNlbGxzID0gcG9zaXRpb25zLmNlbGxzXG4gICAgcG9zaXRpb25zID0gcG9zaXRpb25zLnBvc2l0aW9uc1xuICB9XG5cbiAgdmFyIGRpbXMgPSBwb3NpdGlvbnMubGVuZ3RoID8gcG9zaXRpb25zWzBdLmxlbmd0aCA6IDBcbiAgdmFyIHBvaW50cyA9IGNlbGxzLmxlbmd0aCA/IGNlbGxzWzBdLmxlbmd0aCA6IDBcblxuICBvdXQgPSBvdXQgfHwgbmV3IEZsb2F0MzJBcnJheShjZWxscy5sZW5ndGggKiBwb2ludHMgKiBkaW1zKVxuXG4gIGlmIChwb2ludHMgPT09IDMgJiYgZGltcyA9PT0gMikge1xuICAgIGZvciAodmFyIGkgPSAwLCBuID0gMCwgbCA9IGNlbGxzLmxlbmd0aDsgaSA8IGw7IGkgKz0gMSkge1xuICAgICAgdmFyIGNlbGwgPSBjZWxsc1tpXVxuICAgICAgb3V0W24rK10gPSBwb3NpdGlvbnNbY2VsbFswXV1bMF1cbiAgICAgIG91dFtuKytdID0gcG9zaXRpb25zW2NlbGxbMF1dWzFdXG4gICAgICBvdXRbbisrXSA9IHBvc2l0aW9uc1tjZWxsWzFdXVswXVxuICAgICAgb3V0W24rK10gPSBwb3NpdGlvbnNbY2VsbFsxXV1bMV1cbiAgICAgIG91dFtuKytdID0gcG9zaXRpb25zW2NlbGxbMl1dWzBdXG4gICAgICBvdXRbbisrXSA9IHBvc2l0aW9uc1tjZWxsWzJdXVsxXVxuICAgIH1cbiAgfSBlbHNlXG4gIGlmIChwb2ludHMgPT09IDMgJiYgZGltcyA9PT0gMykge1xuICAgIGZvciAodmFyIGkgPSAwLCBuID0gMCwgbCA9IGNlbGxzLmxlbmd0aDsgaSA8IGw7IGkgKz0gMSkge1xuICAgICAgdmFyIGNlbGwgPSBjZWxsc1tpXVxuICAgICAgb3V0W24rK10gPSBwb3NpdGlvbnNbY2VsbFswXV1bMF1cbiAgICAgIG91dFtuKytdID0gcG9zaXRpb25zW2NlbGxbMF1dWzFdXG4gICAgICBvdXRbbisrXSA9IHBvc2l0aW9uc1tjZWxsWzBdXVsyXVxuICAgICAgb3V0W24rK10gPSBwb3NpdGlvbnNbY2VsbFsxXV1bMF1cbiAgICAgIG91dFtuKytdID0gcG9zaXRpb25zW2NlbGxbMV1dWzFdXG4gICAgICBvdXRbbisrXSA9IHBvc2l0aW9uc1tjZWxsWzFdXVsyXVxuICAgICAgb3V0W24rK10gPSBwb3NpdGlvbnNbY2VsbFsyXV1bMF1cbiAgICAgIG91dFtuKytdID0gcG9zaXRpb25zW2NlbGxbMl1dWzFdXG4gICAgICBvdXRbbisrXSA9IHBvc2l0aW9uc1tjZWxsWzJdXVsyXVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBmb3IgKHZhciBpID0gMCwgbiA9IDAsIGwgPSBjZWxscy5sZW5ndGg7IGkgPCBsOyBpICs9IDEpIHtcbiAgICAgIHZhciBjZWxsID0gY2VsbHNbaV1cbiAgICAgIGZvciAodmFyIGMgPSAwOyBjIDwgY2VsbC5sZW5ndGg7IGMrKykge1xuICAgICAgICB2YXIgQyA9IGNlbGxbY11cbiAgICAgICAgZm9yICh2YXIgayA9IDA7IGsgPCBkaW1zOyBrKyspIHtcbiAgICAgICAgICBvdXRbbisrXSA9IHBvc2l0aW9uc1tDXVtrXVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIG91dFxufVxuIiwiXCJ1c2Ugc3RyaWN0XCI7IFwidXNlIHJlc3RyaWN0XCI7XG5cbm1vZHVsZS5leHBvcnRzID0gVW5pb25GaW5kO1xuXG5mdW5jdGlvbiBVbmlvbkZpbmQoY291bnQpIHtcbiAgdGhpcy5yb290cyA9IG5ldyBBcnJheShjb3VudCk7XG4gIHRoaXMucmFua3MgPSBuZXcgQXJyYXkoY291bnQpO1xuICBcbiAgZm9yKHZhciBpPTA7IGk8Y291bnQ7ICsraSkge1xuICAgIHRoaXMucm9vdHNbaV0gPSBpO1xuICAgIHRoaXMucmFua3NbaV0gPSAwO1xuICB9XG59XG5cbnZhciBwcm90byA9IFVuaW9uRmluZC5wcm90b3R5cGVcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KHByb3RvLCBcImxlbmd0aFwiLCB7XG4gIFwiZ2V0XCI6IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLnJvb3RzLmxlbmd0aFxuICB9XG59KVxuXG5wcm90by5tYWtlU2V0ID0gZnVuY3Rpb24oKSB7XG4gIHZhciBuID0gdGhpcy5yb290cy5sZW5ndGg7XG4gIHRoaXMucm9vdHMucHVzaChuKTtcbiAgdGhpcy5yYW5rcy5wdXNoKDApO1xuICByZXR1cm4gbjtcbn1cblxucHJvdG8uZmluZCA9IGZ1bmN0aW9uKHgpIHtcbiAgdmFyIHgwID0geFxuICB2YXIgcm9vdHMgPSB0aGlzLnJvb3RzO1xuICB3aGlsZShyb290c1t4XSAhPT0geCkge1xuICAgIHggPSByb290c1t4XVxuICB9XG4gIHdoaWxlKHJvb3RzW3gwXSAhPT0geCkge1xuICAgIHZhciB5ID0gcm9vdHNbeDBdXG4gICAgcm9vdHNbeDBdID0geFxuICAgIHgwID0geVxuICB9XG4gIHJldHVybiB4O1xufVxuXG5wcm90by5saW5rID0gZnVuY3Rpb24oeCwgeSkge1xuICB2YXIgeHIgPSB0aGlzLmZpbmQoeClcbiAgICAsIHlyID0gdGhpcy5maW5kKHkpO1xuICBpZih4ciA9PT0geXIpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgdmFyIHJhbmtzID0gdGhpcy5yYW5rc1xuICAgICwgcm9vdHMgPSB0aGlzLnJvb3RzXG4gICAgLCB4ZCAgICA9IHJhbmtzW3hyXVxuICAgICwgeWQgICAgPSByYW5rc1t5cl07XG4gIGlmKHhkIDwgeWQpIHtcbiAgICByb290c1t4cl0gPSB5cjtcbiAgfSBlbHNlIGlmKHlkIDwgeGQpIHtcbiAgICByb290c1t5cl0gPSB4cjtcbiAgfSBlbHNlIHtcbiAgICByb290c1t5cl0gPSB4cjtcbiAgICArK3JhbmtzW3hyXTtcbiAgfVxufSIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcmFuZ2UobWluLCBtYXgsIHZhbHVlKSB7XG4gIHJldHVybiAodmFsdWUgLSBtaW4pIC8gKG1heCAtIG1pbilcbn0iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHZlYzJDb3B5KG91dCwgYSkge1xuICAgIG91dFswXSA9IGFbMF1cbiAgICBvdXRbMV0gPSBhWzFdXG4gICAgcmV0dXJuIG91dFxufSIsIm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uIHhtbHBhcnNlcigpIHtcbiAgLy9jb21tb24gYnJvd3NlcnNcbiAgaWYgKHR5cGVvZiBzZWxmLkRPTVBhcnNlciAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oc3RyKSB7XG4gICAgICB2YXIgcGFyc2VyID0gbmV3IHNlbGYuRE9NUGFyc2VyKClcbiAgICAgIHJldHVybiBwYXJzZXIucGFyc2VGcm9tU3RyaW5nKHN0ciwgJ2FwcGxpY2F0aW9uL3htbCcpXG4gICAgfVxuICB9IFxuXG4gIC8vSUU4IGZhbGxiYWNrXG4gIGlmICh0eXBlb2Ygc2VsZi5BY3RpdmVYT2JqZWN0ICE9PSAndW5kZWZpbmVkJ1xuICAgICAgJiYgbmV3IHNlbGYuQWN0aXZlWE9iamVjdCgnTWljcm9zb2Z0LlhNTERPTScpKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKHN0cikge1xuICAgICAgdmFyIHhtbERvYyA9IG5ldyBzZWxmLkFjdGl2ZVhPYmplY3QoXCJNaWNyb3NvZnQuWE1MRE9NXCIpXG4gICAgICB4bWxEb2MuYXN5bmMgPSBcImZhbHNlXCJcbiAgICAgIHhtbERvYy5sb2FkWE1MKHN0cilcbiAgICAgIHJldHVybiB4bWxEb2NcbiAgICB9XG4gIH1cblxuICAvL2xhc3QgcmVzb3J0IGZhbGxiYWNrXG4gIHJldHVybiBmdW5jdGlvbihzdHIpIHtcbiAgICB2YXIgZGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2JylcbiAgICBkaXYuaW5uZXJIVE1MID0gc3RyXG4gICAgcmV0dXJuIGRpdlxuICB9XG59KSgpXG4iLG51bGwsIi8qIVxuICogVGhlIGJ1ZmZlciBtb2R1bGUgZnJvbSBub2RlLmpzLCBmb3IgdGhlIGJyb3dzZXIuXG4gKlxuICogQGF1dGhvciAgIEZlcm9zcyBBYm91a2hhZGlqZWggPGZlcm9zc0BmZXJvc3Mub3JnPiA8aHR0cDovL2Zlcm9zcy5vcmc+XG4gKiBAbGljZW5zZSAgTUlUXG4gKi9cblxudmFyIGJhc2U2NCA9IHJlcXVpcmUoJ2Jhc2U2NC1qcycpXG52YXIgaWVlZTc1NCA9IHJlcXVpcmUoJ2llZWU3NTQnKVxudmFyIGlzQXJyYXkgPSByZXF1aXJlKCdpcy1hcnJheScpXG5cbmV4cG9ydHMuQnVmZmVyID0gQnVmZmVyXG5leHBvcnRzLlNsb3dCdWZmZXIgPSBCdWZmZXJcbmV4cG9ydHMuSU5TUEVDVF9NQVhfQllURVMgPSA1MFxuQnVmZmVyLnBvb2xTaXplID0gODE5MiAvLyBub3QgdXNlZCBieSB0aGlzIGltcGxlbWVudGF0aW9uXG5cbnZhciBrTWF4TGVuZ3RoID0gMHgzZmZmZmZmZlxuXG4vKipcbiAqIElmIGBCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVGA6XG4gKiAgID09PSB0cnVlICAgIFVzZSBVaW50OEFycmF5IGltcGxlbWVudGF0aW9uIChmYXN0ZXN0KVxuICogICA9PT0gZmFsc2UgICBVc2UgT2JqZWN0IGltcGxlbWVudGF0aW9uIChtb3N0IGNvbXBhdGlibGUsIGV2ZW4gSUU2KVxuICpcbiAqIEJyb3dzZXJzIHRoYXQgc3VwcG9ydCB0eXBlZCBhcnJheXMgYXJlIElFIDEwKywgRmlyZWZveCA0KywgQ2hyb21lIDcrLCBTYWZhcmkgNS4xKyxcbiAqIE9wZXJhIDExLjYrLCBpT1MgNC4yKy5cbiAqXG4gKiBOb3RlOlxuICpcbiAqIC0gSW1wbGVtZW50YXRpb24gbXVzdCBzdXBwb3J0IGFkZGluZyBuZXcgcHJvcGVydGllcyB0byBgVWludDhBcnJheWAgaW5zdGFuY2VzLlxuICogICBGaXJlZm94IDQtMjkgbGFja2VkIHN1cHBvcnQsIGZpeGVkIGluIEZpcmVmb3ggMzArLlxuICogICBTZWU6IGh0dHBzOi8vYnVnemlsbGEubW96aWxsYS5vcmcvc2hvd19idWcuY2dpP2lkPTY5NTQzOC5cbiAqXG4gKiAgLSBDaHJvbWUgOS0xMCBpcyBtaXNzaW5nIHRoZSBgVHlwZWRBcnJheS5wcm90b3R5cGUuc3ViYXJyYXlgIGZ1bmN0aW9uLlxuICpcbiAqICAtIElFMTAgaGFzIGEgYnJva2VuIGBUeXBlZEFycmF5LnByb3RvdHlwZS5zdWJhcnJheWAgZnVuY3Rpb24gd2hpY2ggcmV0dXJucyBhcnJheXMgb2ZcbiAqICAgIGluY29ycmVjdCBsZW5ndGggaW4gc29tZSBzaXR1YXRpb25zLlxuICpcbiAqIFdlIGRldGVjdCB0aGVzZSBidWdneSBicm93c2VycyBhbmQgc2V0IGBCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVGAgdG8gYGZhbHNlYCBzbyB0aGV5IHdpbGxcbiAqIGdldCB0aGUgT2JqZWN0IGltcGxlbWVudGF0aW9uLCB3aGljaCBpcyBzbG93ZXIgYnV0IHdpbGwgd29yayBjb3JyZWN0bHkuXG4gKi9cbkJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUID0gKGZ1bmN0aW9uICgpIHtcbiAgdHJ5IHtcbiAgICB2YXIgYnVmID0gbmV3IEFycmF5QnVmZmVyKDApXG4gICAgdmFyIGFyciA9IG5ldyBVaW50OEFycmF5KGJ1ZilcbiAgICBhcnIuZm9vID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gNDIgfVxuICAgIHJldHVybiA0MiA9PT0gYXJyLmZvbygpICYmIC8vIHR5cGVkIGFycmF5IGluc3RhbmNlcyBjYW4gYmUgYXVnbWVudGVkXG4gICAgICAgIHR5cGVvZiBhcnIuc3ViYXJyYXkgPT09ICdmdW5jdGlvbicgJiYgLy8gY2hyb21lIDktMTAgbGFjayBgc3ViYXJyYXlgXG4gICAgICAgIG5ldyBVaW50OEFycmF5KDEpLnN1YmFycmF5KDEsIDEpLmJ5dGVMZW5ndGggPT09IDAgLy8gaWUxMCBoYXMgYnJva2VuIGBzdWJhcnJheWBcbiAgfSBjYXRjaCAoZSkge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG59KSgpXG5cbi8qKlxuICogQ2xhc3M6IEJ1ZmZlclxuICogPT09PT09PT09PT09PVxuICpcbiAqIFRoZSBCdWZmZXIgY29uc3RydWN0b3IgcmV0dXJucyBpbnN0YW5jZXMgb2YgYFVpbnQ4QXJyYXlgIHRoYXQgYXJlIGF1Z21lbnRlZFxuICogd2l0aCBmdW5jdGlvbiBwcm9wZXJ0aWVzIGZvciBhbGwgdGhlIG5vZGUgYEJ1ZmZlcmAgQVBJIGZ1bmN0aW9ucy4gV2UgdXNlXG4gKiBgVWludDhBcnJheWAgc28gdGhhdCBzcXVhcmUgYnJhY2tldCBub3RhdGlvbiB3b3JrcyBhcyBleHBlY3RlZCAtLSBpdCByZXR1cm5zXG4gKiBhIHNpbmdsZSBvY3RldC5cbiAqXG4gKiBCeSBhdWdtZW50aW5nIHRoZSBpbnN0YW5jZXMsIHdlIGNhbiBhdm9pZCBtb2RpZnlpbmcgdGhlIGBVaW50OEFycmF5YFxuICogcHJvdG90eXBlLlxuICovXG5mdW5jdGlvbiBCdWZmZXIgKHN1YmplY3QsIGVuY29kaW5nLCBub1plcm8pIHtcbiAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIEJ1ZmZlcikpXG4gICAgcmV0dXJuIG5ldyBCdWZmZXIoc3ViamVjdCwgZW5jb2RpbmcsIG5vWmVybylcblxuICB2YXIgdHlwZSA9IHR5cGVvZiBzdWJqZWN0XG5cbiAgLy8gRmluZCB0aGUgbGVuZ3RoXG4gIHZhciBsZW5ndGhcbiAgaWYgKHR5cGUgPT09ICdudW1iZXInKVxuICAgIGxlbmd0aCA9IHN1YmplY3QgPiAwID8gc3ViamVjdCA+Pj4gMCA6IDBcbiAgZWxzZSBpZiAodHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICBpZiAoZW5jb2RpbmcgPT09ICdiYXNlNjQnKVxuICAgICAgc3ViamVjdCA9IGJhc2U2NGNsZWFuKHN1YmplY3QpXG4gICAgbGVuZ3RoID0gQnVmZmVyLmJ5dGVMZW5ndGgoc3ViamVjdCwgZW5jb2RpbmcpXG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gJ29iamVjdCcgJiYgc3ViamVjdCAhPT0gbnVsbCkgeyAvLyBhc3N1bWUgb2JqZWN0IGlzIGFycmF5LWxpa2VcbiAgICBpZiAoc3ViamVjdC50eXBlID09PSAnQnVmZmVyJyAmJiBpc0FycmF5KHN1YmplY3QuZGF0YSkpXG4gICAgICBzdWJqZWN0ID0gc3ViamVjdC5kYXRhXG4gICAgbGVuZ3RoID0gK3N1YmplY3QubGVuZ3RoID4gMCA/IE1hdGguZmxvb3IoK3N1YmplY3QubGVuZ3RoKSA6IDBcbiAgfSBlbHNlXG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcignbXVzdCBzdGFydCB3aXRoIG51bWJlciwgYnVmZmVyLCBhcnJheSBvciBzdHJpbmcnKVxuXG4gIGlmICh0aGlzLmxlbmd0aCA+IGtNYXhMZW5ndGgpXG4gICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ0F0dGVtcHQgdG8gYWxsb2NhdGUgQnVmZmVyIGxhcmdlciB0aGFuIG1heGltdW0gJyArXG4gICAgICAnc2l6ZTogMHgnICsga01heExlbmd0aC50b1N0cmluZygxNikgKyAnIGJ5dGVzJylcblxuICB2YXIgYnVmXG4gIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIC8vIFByZWZlcnJlZDogUmV0dXJuIGFuIGF1Z21lbnRlZCBgVWludDhBcnJheWAgaW5zdGFuY2UgZm9yIGJlc3QgcGVyZm9ybWFuY2VcbiAgICBidWYgPSBCdWZmZXIuX2F1Z21lbnQobmV3IFVpbnQ4QXJyYXkobGVuZ3RoKSlcbiAgfSBlbHNlIHtcbiAgICAvLyBGYWxsYmFjazogUmV0dXJuIFRISVMgaW5zdGFuY2Ugb2YgQnVmZmVyIChjcmVhdGVkIGJ5IGBuZXdgKVxuICAgIGJ1ZiA9IHRoaXNcbiAgICBidWYubGVuZ3RoID0gbGVuZ3RoXG4gICAgYnVmLl9pc0J1ZmZlciA9IHRydWVcbiAgfVxuXG4gIHZhciBpXG4gIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCAmJiB0eXBlb2Ygc3ViamVjdC5ieXRlTGVuZ3RoID09PSAnbnVtYmVyJykge1xuICAgIC8vIFNwZWVkIG9wdGltaXphdGlvbiAtLSB1c2Ugc2V0IGlmIHdlJ3JlIGNvcHlpbmcgZnJvbSBhIHR5cGVkIGFycmF5XG4gICAgYnVmLl9zZXQoc3ViamVjdClcbiAgfSBlbHNlIGlmIChpc0FycmF5aXNoKHN1YmplY3QpKSB7XG4gICAgLy8gVHJlYXQgYXJyYXktaXNoIG9iamVjdHMgYXMgYSBieXRlIGFycmF5XG4gICAgaWYgKEJ1ZmZlci5pc0J1ZmZlcihzdWJqZWN0KSkge1xuICAgICAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKVxuICAgICAgICBidWZbaV0gPSBzdWJqZWN0LnJlYWRVSW50OChpKVxuICAgIH0gZWxzZSB7XG4gICAgICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspXG4gICAgICAgIGJ1ZltpXSA9ICgoc3ViamVjdFtpXSAlIDI1NikgKyAyNTYpICUgMjU2XG4gICAgfVxuICB9IGVsc2UgaWYgKHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgYnVmLndyaXRlKHN1YmplY3QsIDAsIGVuY29kaW5nKVxuICB9IGVsc2UgaWYgKHR5cGUgPT09ICdudW1iZXInICYmICFCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCAmJiAhbm9aZXJvKSB7XG4gICAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICBidWZbaV0gPSAwXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGJ1ZlxufVxuXG5CdWZmZXIuaXNCdWZmZXIgPSBmdW5jdGlvbiAoYikge1xuICByZXR1cm4gISEoYiAhPSBudWxsICYmIGIuX2lzQnVmZmVyKVxufVxuXG5CdWZmZXIuY29tcGFyZSA9IGZ1bmN0aW9uIChhLCBiKSB7XG4gIGlmICghQnVmZmVyLmlzQnVmZmVyKGEpIHx8ICFCdWZmZXIuaXNCdWZmZXIoYikpXG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcignQXJndW1lbnRzIG11c3QgYmUgQnVmZmVycycpXG5cbiAgdmFyIHggPSBhLmxlbmd0aFxuICB2YXIgeSA9IGIubGVuZ3RoXG4gIGZvciAodmFyIGkgPSAwLCBsZW4gPSBNYXRoLm1pbih4LCB5KTsgaSA8IGxlbiAmJiBhW2ldID09PSBiW2ldOyBpKyspIHt9XG4gIGlmIChpICE9PSBsZW4pIHtcbiAgICB4ID0gYVtpXVxuICAgIHkgPSBiW2ldXG4gIH1cbiAgaWYgKHggPCB5KSByZXR1cm4gLTFcbiAgaWYgKHkgPCB4KSByZXR1cm4gMVxuICByZXR1cm4gMFxufVxuXG5CdWZmZXIuaXNFbmNvZGluZyA9IGZ1bmN0aW9uIChlbmNvZGluZykge1xuICBzd2l0Y2ggKFN0cmluZyhlbmNvZGluZykudG9Mb3dlckNhc2UoKSkge1xuICAgIGNhc2UgJ2hleCc6XG4gICAgY2FzZSAndXRmOCc6XG4gICAgY2FzZSAndXRmLTgnOlxuICAgIGNhc2UgJ2FzY2lpJzpcbiAgICBjYXNlICdiaW5hcnknOlxuICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgY2FzZSAncmF3JzpcbiAgICBjYXNlICd1Y3MyJzpcbiAgICBjYXNlICd1Y3MtMic6XG4gICAgY2FzZSAndXRmMTZsZSc6XG4gICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgcmV0dXJuIHRydWVcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIGZhbHNlXG4gIH1cbn1cblxuQnVmZmVyLmNvbmNhdCA9IGZ1bmN0aW9uIChsaXN0LCB0b3RhbExlbmd0aCkge1xuICBpZiAoIWlzQXJyYXkobGlzdCkpIHRocm93IG5ldyBUeXBlRXJyb3IoJ1VzYWdlOiBCdWZmZXIuY29uY2F0KGxpc3RbLCBsZW5ndGhdKScpXG5cbiAgaWYgKGxpc3QubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIG5ldyBCdWZmZXIoMClcbiAgfSBlbHNlIGlmIChsaXN0Lmxlbmd0aCA9PT0gMSkge1xuICAgIHJldHVybiBsaXN0WzBdXG4gIH1cblxuICB2YXIgaVxuICBpZiAodG90YWxMZW5ndGggPT09IHVuZGVmaW5lZCkge1xuICAgIHRvdGFsTGVuZ3RoID0gMFxuICAgIGZvciAoaSA9IDA7IGkgPCBsaXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICB0b3RhbExlbmd0aCArPSBsaXN0W2ldLmxlbmd0aFxuICAgIH1cbiAgfVxuXG4gIHZhciBidWYgPSBuZXcgQnVmZmVyKHRvdGFsTGVuZ3RoKVxuICB2YXIgcG9zID0gMFxuICBmb3IgKGkgPSAwOyBpIDwgbGlzdC5sZW5ndGg7IGkrKykge1xuICAgIHZhciBpdGVtID0gbGlzdFtpXVxuICAgIGl0ZW0uY29weShidWYsIHBvcylcbiAgICBwb3MgKz0gaXRlbS5sZW5ndGhcbiAgfVxuICByZXR1cm4gYnVmXG59XG5cbkJ1ZmZlci5ieXRlTGVuZ3RoID0gZnVuY3Rpb24gKHN0ciwgZW5jb2RpbmcpIHtcbiAgdmFyIHJldFxuICBzdHIgPSBzdHIgKyAnJ1xuICBzd2l0Y2ggKGVuY29kaW5nIHx8ICd1dGY4Jykge1xuICAgIGNhc2UgJ2FzY2lpJzpcbiAgICBjYXNlICdiaW5hcnknOlxuICAgIGNhc2UgJ3Jhdyc6XG4gICAgICByZXQgPSBzdHIubGVuZ3RoXG4gICAgICBicmVha1xuICAgIGNhc2UgJ3VjczInOlxuICAgIGNhc2UgJ3Vjcy0yJzpcbiAgICBjYXNlICd1dGYxNmxlJzpcbiAgICBjYXNlICd1dGYtMTZsZSc6XG4gICAgICByZXQgPSBzdHIubGVuZ3RoICogMlxuICAgICAgYnJlYWtcbiAgICBjYXNlICdoZXgnOlxuICAgICAgcmV0ID0gc3RyLmxlbmd0aCA+Pj4gMVxuICAgICAgYnJlYWtcbiAgICBjYXNlICd1dGY4JzpcbiAgICBjYXNlICd1dGYtOCc6XG4gICAgICByZXQgPSB1dGY4VG9CeXRlcyhzdHIpLmxlbmd0aFxuICAgICAgYnJlYWtcbiAgICBjYXNlICdiYXNlNjQnOlxuICAgICAgcmV0ID0gYmFzZTY0VG9CeXRlcyhzdHIpLmxlbmd0aFxuICAgICAgYnJlYWtcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0ID0gc3RyLmxlbmd0aFxuICB9XG4gIHJldHVybiByZXRcbn1cblxuLy8gcHJlLXNldCBmb3IgdmFsdWVzIHRoYXQgbWF5IGV4aXN0IGluIHRoZSBmdXR1cmVcbkJ1ZmZlci5wcm90b3R5cGUubGVuZ3RoID0gdW5kZWZpbmVkXG5CdWZmZXIucHJvdG90eXBlLnBhcmVudCA9IHVuZGVmaW5lZFxuXG4vLyB0b1N0cmluZyhlbmNvZGluZywgc3RhcnQ9MCwgZW5kPWJ1ZmZlci5sZW5ndGgpXG5CdWZmZXIucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24gKGVuY29kaW5nLCBzdGFydCwgZW5kKSB7XG4gIHZhciBsb3dlcmVkQ2FzZSA9IGZhbHNlXG5cbiAgc3RhcnQgPSBzdGFydCA+Pj4gMFxuICBlbmQgPSBlbmQgPT09IHVuZGVmaW5lZCB8fCBlbmQgPT09IEluZmluaXR5ID8gdGhpcy5sZW5ndGggOiBlbmQgPj4+IDBcblxuICBpZiAoIWVuY29kaW5nKSBlbmNvZGluZyA9ICd1dGY4J1xuICBpZiAoc3RhcnQgPCAwKSBzdGFydCA9IDBcbiAgaWYgKGVuZCA+IHRoaXMubGVuZ3RoKSBlbmQgPSB0aGlzLmxlbmd0aFxuICBpZiAoZW5kIDw9IHN0YXJ0KSByZXR1cm4gJydcblxuICB3aGlsZSAodHJ1ZSkge1xuICAgIHN3aXRjaCAoZW5jb2RpbmcpIHtcbiAgICAgIGNhc2UgJ2hleCc6XG4gICAgICAgIHJldHVybiBoZXhTbGljZSh0aGlzLCBzdGFydCwgZW5kKVxuXG4gICAgICBjYXNlICd1dGY4JzpcbiAgICAgIGNhc2UgJ3V0Zi04JzpcbiAgICAgICAgcmV0dXJuIHV0ZjhTbGljZSh0aGlzLCBzdGFydCwgZW5kKVxuXG4gICAgICBjYXNlICdhc2NpaSc6XG4gICAgICAgIHJldHVybiBhc2NpaVNsaWNlKHRoaXMsIHN0YXJ0LCBlbmQpXG5cbiAgICAgIGNhc2UgJ2JpbmFyeSc6XG4gICAgICAgIHJldHVybiBiaW5hcnlTbGljZSh0aGlzLCBzdGFydCwgZW5kKVxuXG4gICAgICBjYXNlICdiYXNlNjQnOlxuICAgICAgICByZXR1cm4gYmFzZTY0U2xpY2UodGhpcywgc3RhcnQsIGVuZClcblxuICAgICAgY2FzZSAndWNzMic6XG4gICAgICBjYXNlICd1Y3MtMic6XG4gICAgICBjYXNlICd1dGYxNmxlJzpcbiAgICAgIGNhc2UgJ3V0Zi0xNmxlJzpcbiAgICAgICAgcmV0dXJuIHV0ZjE2bGVTbGljZSh0aGlzLCBzdGFydCwgZW5kKVxuXG4gICAgICBkZWZhdWx0OlxuICAgICAgICBpZiAobG93ZXJlZENhc2UpXG4gICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignVW5rbm93biBlbmNvZGluZzogJyArIGVuY29kaW5nKVxuICAgICAgICBlbmNvZGluZyA9IChlbmNvZGluZyArICcnKS50b0xvd2VyQ2FzZSgpXG4gICAgICAgIGxvd2VyZWRDYXNlID0gdHJ1ZVxuICAgIH1cbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLmVxdWFscyA9IGZ1bmN0aW9uIChiKSB7XG4gIGlmKCFCdWZmZXIuaXNCdWZmZXIoYikpIHRocm93IG5ldyBUeXBlRXJyb3IoJ0FyZ3VtZW50IG11c3QgYmUgYSBCdWZmZXInKVxuICByZXR1cm4gQnVmZmVyLmNvbXBhcmUodGhpcywgYikgPT09IDBcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5pbnNwZWN0ID0gZnVuY3Rpb24gKCkge1xuICB2YXIgc3RyID0gJydcbiAgdmFyIG1heCA9IGV4cG9ydHMuSU5TUEVDVF9NQVhfQllURVNcbiAgaWYgKHRoaXMubGVuZ3RoID4gMCkge1xuICAgIHN0ciA9IHRoaXMudG9TdHJpbmcoJ2hleCcsIDAsIG1heCkubWF0Y2goLy57Mn0vZykuam9pbignICcpXG4gICAgaWYgKHRoaXMubGVuZ3RoID4gbWF4KVxuICAgICAgc3RyICs9ICcgLi4uICdcbiAgfVxuICByZXR1cm4gJzxCdWZmZXIgJyArIHN0ciArICc+J1xufVxuXG5CdWZmZXIucHJvdG90eXBlLmNvbXBhcmUgPSBmdW5jdGlvbiAoYikge1xuICBpZiAoIUJ1ZmZlci5pc0J1ZmZlcihiKSkgdGhyb3cgbmV3IFR5cGVFcnJvcignQXJndW1lbnQgbXVzdCBiZSBhIEJ1ZmZlcicpXG4gIHJldHVybiBCdWZmZXIuY29tcGFyZSh0aGlzLCBiKVxufVxuXG4vLyBgZ2V0YCB3aWxsIGJlIHJlbW92ZWQgaW4gTm9kZSAwLjEzK1xuQnVmZmVyLnByb3RvdHlwZS5nZXQgPSBmdW5jdGlvbiAob2Zmc2V0KSB7XG4gIGNvbnNvbGUubG9nKCcuZ2V0KCkgaXMgZGVwcmVjYXRlZC4gQWNjZXNzIHVzaW5nIGFycmF5IGluZGV4ZXMgaW5zdGVhZC4nKVxuICByZXR1cm4gdGhpcy5yZWFkVUludDgob2Zmc2V0KVxufVxuXG4vLyBgc2V0YCB3aWxsIGJlIHJlbW92ZWQgaW4gTm9kZSAwLjEzK1xuQnVmZmVyLnByb3RvdHlwZS5zZXQgPSBmdW5jdGlvbiAodiwgb2Zmc2V0KSB7XG4gIGNvbnNvbGUubG9nKCcuc2V0KCkgaXMgZGVwcmVjYXRlZC4gQWNjZXNzIHVzaW5nIGFycmF5IGluZGV4ZXMgaW5zdGVhZC4nKVxuICByZXR1cm4gdGhpcy53cml0ZVVJbnQ4KHYsIG9mZnNldClcbn1cblxuZnVuY3Rpb24gaGV4V3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICBvZmZzZXQgPSBOdW1iZXIob2Zmc2V0KSB8fCAwXG4gIHZhciByZW1haW5pbmcgPSBidWYubGVuZ3RoIC0gb2Zmc2V0XG4gIGlmICghbGVuZ3RoKSB7XG4gICAgbGVuZ3RoID0gcmVtYWluaW5nXG4gIH0gZWxzZSB7XG4gICAgbGVuZ3RoID0gTnVtYmVyKGxlbmd0aClcbiAgICBpZiAobGVuZ3RoID4gcmVtYWluaW5nKSB7XG4gICAgICBsZW5ndGggPSByZW1haW5pbmdcbiAgICB9XG4gIH1cblxuICAvLyBtdXN0IGJlIGFuIGV2ZW4gbnVtYmVyIG9mIGRpZ2l0c1xuICB2YXIgc3RyTGVuID0gc3RyaW5nLmxlbmd0aFxuICBpZiAoc3RyTGVuICUgMiAhPT0gMCkgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGhleCBzdHJpbmcnKVxuXG4gIGlmIChsZW5ndGggPiBzdHJMZW4gLyAyKSB7XG4gICAgbGVuZ3RoID0gc3RyTGVuIC8gMlxuICB9XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgYnl0ZSA9IHBhcnNlSW50KHN0cmluZy5zdWJzdHIoaSAqIDIsIDIpLCAxNilcbiAgICBpZiAoaXNOYU4oYnl0ZSkpIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBoZXggc3RyaW5nJylcbiAgICBidWZbb2Zmc2V0ICsgaV0gPSBieXRlXG4gIH1cbiAgcmV0dXJuIGlcbn1cblxuZnVuY3Rpb24gdXRmOFdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIGNoYXJzV3JpdHRlbiA9IGJsaXRCdWZmZXIodXRmOFRvQnl0ZXMoc3RyaW5nKSwgYnVmLCBvZmZzZXQsIGxlbmd0aClcbiAgcmV0dXJuIGNoYXJzV3JpdHRlblxufVxuXG5mdW5jdGlvbiBhc2NpaVdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIGNoYXJzV3JpdHRlbiA9IGJsaXRCdWZmZXIoYXNjaWlUb0J5dGVzKHN0cmluZyksIGJ1Ziwgb2Zmc2V0LCBsZW5ndGgpXG4gIHJldHVybiBjaGFyc1dyaXR0ZW5cbn1cblxuZnVuY3Rpb24gYmluYXJ5V3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICByZXR1cm4gYXNjaWlXcml0ZShidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG59XG5cbmZ1bmN0aW9uIGJhc2U2NFdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIGNoYXJzV3JpdHRlbiA9IGJsaXRCdWZmZXIoYmFzZTY0VG9CeXRlcyhzdHJpbmcpLCBidWYsIG9mZnNldCwgbGVuZ3RoKVxuICByZXR1cm4gY2hhcnNXcml0dGVuXG59XG5cbmZ1bmN0aW9uIHV0ZjE2bGVXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHZhciBjaGFyc1dyaXR0ZW4gPSBibGl0QnVmZmVyKHV0ZjE2bGVUb0J5dGVzKHN0cmluZyksIGJ1Ziwgb2Zmc2V0LCBsZW5ndGgpXG4gIHJldHVybiBjaGFyc1dyaXR0ZW5cbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZSA9IGZ1bmN0aW9uIChzdHJpbmcsIG9mZnNldCwgbGVuZ3RoLCBlbmNvZGluZykge1xuICAvLyBTdXBwb3J0IGJvdGggKHN0cmluZywgb2Zmc2V0LCBsZW5ndGgsIGVuY29kaW5nKVxuICAvLyBhbmQgdGhlIGxlZ2FjeSAoc3RyaW5nLCBlbmNvZGluZywgb2Zmc2V0LCBsZW5ndGgpXG4gIGlmIChpc0Zpbml0ZShvZmZzZXQpKSB7XG4gICAgaWYgKCFpc0Zpbml0ZShsZW5ndGgpKSB7XG4gICAgICBlbmNvZGluZyA9IGxlbmd0aFxuICAgICAgbGVuZ3RoID0gdW5kZWZpbmVkXG4gICAgfVxuICB9IGVsc2UgeyAgLy8gbGVnYWN5XG4gICAgdmFyIHN3YXAgPSBlbmNvZGluZ1xuICAgIGVuY29kaW5nID0gb2Zmc2V0XG4gICAgb2Zmc2V0ID0gbGVuZ3RoXG4gICAgbGVuZ3RoID0gc3dhcFxuICB9XG5cbiAgb2Zmc2V0ID0gTnVtYmVyKG9mZnNldCkgfHwgMFxuICB2YXIgcmVtYWluaW5nID0gdGhpcy5sZW5ndGggLSBvZmZzZXRcbiAgaWYgKCFsZW5ndGgpIHtcbiAgICBsZW5ndGggPSByZW1haW5pbmdcbiAgfSBlbHNlIHtcbiAgICBsZW5ndGggPSBOdW1iZXIobGVuZ3RoKVxuICAgIGlmIChsZW5ndGggPiByZW1haW5pbmcpIHtcbiAgICAgIGxlbmd0aCA9IHJlbWFpbmluZ1xuICAgIH1cbiAgfVxuICBlbmNvZGluZyA9IFN0cmluZyhlbmNvZGluZyB8fCAndXRmOCcpLnRvTG93ZXJDYXNlKClcblxuICB2YXIgcmV0XG4gIHN3aXRjaCAoZW5jb2RpbmcpIHtcbiAgICBjYXNlICdoZXgnOlxuICAgICAgcmV0ID0gaGV4V3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAndXRmOCc6XG4gICAgY2FzZSAndXRmLTgnOlxuICAgICAgcmV0ID0gdXRmOFdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2FzY2lpJzpcbiAgICAgIHJldCA9IGFzY2lpV3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYmluYXJ5JzpcbiAgICAgIHJldCA9IGJpbmFyeVdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgICByZXQgPSBiYXNlNjRXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICd1Y3MyJzpcbiAgICBjYXNlICd1Y3MtMic6XG4gICAgY2FzZSAndXRmMTZsZSc6XG4gICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgcmV0ID0gdXRmMTZsZVdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdVbmtub3duIGVuY29kaW5nOiAnICsgZW5jb2RpbmcpXG4gIH1cbiAgcmV0dXJuIHJldFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIHtcbiAgICB0eXBlOiAnQnVmZmVyJyxcbiAgICBkYXRhOiBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbCh0aGlzLl9hcnIgfHwgdGhpcywgMClcbiAgfVxufVxuXG5mdW5jdGlvbiBiYXNlNjRTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIGlmIChzdGFydCA9PT0gMCAmJiBlbmQgPT09IGJ1Zi5sZW5ndGgpIHtcbiAgICByZXR1cm4gYmFzZTY0LmZyb21CeXRlQXJyYXkoYnVmKVxuICB9IGVsc2Uge1xuICAgIHJldHVybiBiYXNlNjQuZnJvbUJ5dGVBcnJheShidWYuc2xpY2Uoc3RhcnQsIGVuZCkpXG4gIH1cbn1cblxuZnVuY3Rpb24gdXRmOFNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIHJlcyA9ICcnXG4gIHZhciB0bXAgPSAnJ1xuICBlbmQgPSBNYXRoLm1pbihidWYubGVuZ3RoLCBlbmQpXG5cbiAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcbiAgICBpZiAoYnVmW2ldIDw9IDB4N0YpIHtcbiAgICAgIHJlcyArPSBkZWNvZGVVdGY4Q2hhcih0bXApICsgU3RyaW5nLmZyb21DaGFyQ29kZShidWZbaV0pXG4gICAgICB0bXAgPSAnJ1xuICAgIH0gZWxzZSB7XG4gICAgICB0bXAgKz0gJyUnICsgYnVmW2ldLnRvU3RyaW5nKDE2KVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiByZXMgKyBkZWNvZGVVdGY4Q2hhcih0bXApXG59XG5cbmZ1bmN0aW9uIGFzY2lpU2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICB2YXIgcmV0ID0gJydcbiAgZW5kID0gTWF0aC5taW4oYnVmLmxlbmd0aCwgZW5kKVxuXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgcmV0ICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoYnVmW2ldKVxuICB9XG4gIHJldHVybiByZXRcbn1cblxuZnVuY3Rpb24gYmluYXJ5U2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICByZXR1cm4gYXNjaWlTbGljZShidWYsIHN0YXJ0LCBlbmQpXG59XG5cbmZ1bmN0aW9uIGhleFNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcblxuICBpZiAoIXN0YXJ0IHx8IHN0YXJ0IDwgMCkgc3RhcnQgPSAwXG4gIGlmICghZW5kIHx8IGVuZCA8IDAgfHwgZW5kID4gbGVuKSBlbmQgPSBsZW5cblxuICB2YXIgb3V0ID0gJydcbiAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcbiAgICBvdXQgKz0gdG9IZXgoYnVmW2ldKVxuICB9XG4gIHJldHVybiBvdXRcbn1cblxuZnVuY3Rpb24gdXRmMTZsZVNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIGJ5dGVzID0gYnVmLnNsaWNlKHN0YXJ0LCBlbmQpXG4gIHZhciByZXMgPSAnJ1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGJ5dGVzLmxlbmd0aDsgaSArPSAyKSB7XG4gICAgcmVzICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoYnl0ZXNbaV0gKyBieXRlc1tpICsgMV0gKiAyNTYpXG4gIH1cbiAgcmV0dXJuIHJlc1xufVxuXG5CdWZmZXIucHJvdG90eXBlLnNsaWNlID0gZnVuY3Rpb24gKHN0YXJ0LCBlbmQpIHtcbiAgdmFyIGxlbiA9IHRoaXMubGVuZ3RoXG4gIHN0YXJ0ID0gfn5zdGFydFxuICBlbmQgPSBlbmQgPT09IHVuZGVmaW5lZCA/IGxlbiA6IH5+ZW5kXG5cbiAgaWYgKHN0YXJ0IDwgMCkge1xuICAgIHN0YXJ0ICs9IGxlbjtcbiAgICBpZiAoc3RhcnQgPCAwKVxuICAgICAgc3RhcnQgPSAwXG4gIH0gZWxzZSBpZiAoc3RhcnQgPiBsZW4pIHtcbiAgICBzdGFydCA9IGxlblxuICB9XG5cbiAgaWYgKGVuZCA8IDApIHtcbiAgICBlbmQgKz0gbGVuXG4gICAgaWYgKGVuZCA8IDApXG4gICAgICBlbmQgPSAwXG4gIH0gZWxzZSBpZiAoZW5kID4gbGVuKSB7XG4gICAgZW5kID0gbGVuXG4gIH1cblxuICBpZiAoZW5kIDwgc3RhcnQpXG4gICAgZW5kID0gc3RhcnRcblxuICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICByZXR1cm4gQnVmZmVyLl9hdWdtZW50KHRoaXMuc3ViYXJyYXkoc3RhcnQsIGVuZCkpXG4gIH0gZWxzZSB7XG4gICAgdmFyIHNsaWNlTGVuID0gZW5kIC0gc3RhcnRcbiAgICB2YXIgbmV3QnVmID0gbmV3IEJ1ZmZlcihzbGljZUxlbiwgdW5kZWZpbmVkLCB0cnVlKVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc2xpY2VMZW47IGkrKykge1xuICAgICAgbmV3QnVmW2ldID0gdGhpc1tpICsgc3RhcnRdXG4gICAgfVxuICAgIHJldHVybiBuZXdCdWZcbiAgfVxufVxuXG4vKlxuICogTmVlZCB0byBtYWtlIHN1cmUgdGhhdCBidWZmZXIgaXNuJ3QgdHJ5aW5nIHRvIHdyaXRlIG91dCBvZiBib3VuZHMuXG4gKi9cbmZ1bmN0aW9uIGNoZWNrT2Zmc2V0IChvZmZzZXQsIGV4dCwgbGVuZ3RoKSB7XG4gIGlmICgob2Zmc2V0ICUgMSkgIT09IDAgfHwgb2Zmc2V0IDwgMClcbiAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcignb2Zmc2V0IGlzIG5vdCB1aW50JylcbiAgaWYgKG9mZnNldCArIGV4dCA+IGxlbmd0aClcbiAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcignVHJ5aW5nIHRvIGFjY2VzcyBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQ4ID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja09mZnNldChvZmZzZXQsIDEsIHRoaXMubGVuZ3RoKVxuICByZXR1cm4gdGhpc1tvZmZzZXRdXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQxNkxFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja09mZnNldChvZmZzZXQsIDIsIHRoaXMubGVuZ3RoKVxuICByZXR1cm4gdGhpc1tvZmZzZXRdIHwgKHRoaXNbb2Zmc2V0ICsgMV0gPDwgOClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDE2QkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrT2Zmc2V0KG9mZnNldCwgMiwgdGhpcy5sZW5ndGgpXG4gIHJldHVybiAodGhpc1tvZmZzZXRdIDw8IDgpIHwgdGhpc1tvZmZzZXQgKyAxXVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MzJMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tPZmZzZXQob2Zmc2V0LCA0LCB0aGlzLmxlbmd0aClcblxuICByZXR1cm4gKCh0aGlzW29mZnNldF0pIHxcbiAgICAgICh0aGlzW29mZnNldCArIDFdIDw8IDgpIHxcbiAgICAgICh0aGlzW29mZnNldCArIDJdIDw8IDE2KSkgK1xuICAgICAgKHRoaXNbb2Zmc2V0ICsgM10gKiAweDEwMDAwMDApXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQzMkJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja09mZnNldChvZmZzZXQsIDQsIHRoaXMubGVuZ3RoKVxuXG4gIHJldHVybiAodGhpc1tvZmZzZXRdICogMHgxMDAwMDAwKSArXG4gICAgICAoKHRoaXNbb2Zmc2V0ICsgMV0gPDwgMTYpIHxcbiAgICAgICh0aGlzW29mZnNldCArIDJdIDw8IDgpIHxcbiAgICAgIHRoaXNbb2Zmc2V0ICsgM10pXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDggPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrT2Zmc2V0KG9mZnNldCwgMSwgdGhpcy5sZW5ndGgpXG4gIGlmICghKHRoaXNbb2Zmc2V0XSAmIDB4ODApKVxuICAgIHJldHVybiAodGhpc1tvZmZzZXRdKVxuICByZXR1cm4gKCgweGZmIC0gdGhpc1tvZmZzZXRdICsgMSkgKiAtMSlcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MTZMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tPZmZzZXQob2Zmc2V0LCAyLCB0aGlzLmxlbmd0aClcbiAgdmFyIHZhbCA9IHRoaXNbb2Zmc2V0XSB8ICh0aGlzW29mZnNldCArIDFdIDw8IDgpXG4gIHJldHVybiAodmFsICYgMHg4MDAwKSA/IHZhbCB8IDB4RkZGRjAwMDAgOiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MTZCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tPZmZzZXQob2Zmc2V0LCAyLCB0aGlzLmxlbmd0aClcbiAgdmFyIHZhbCA9IHRoaXNbb2Zmc2V0ICsgMV0gfCAodGhpc1tvZmZzZXRdIDw8IDgpXG4gIHJldHVybiAodmFsICYgMHg4MDAwKSA/IHZhbCB8IDB4RkZGRjAwMDAgOiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MzJMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tPZmZzZXQob2Zmc2V0LCA0LCB0aGlzLmxlbmd0aClcblxuICByZXR1cm4gKHRoaXNbb2Zmc2V0XSkgfFxuICAgICAgKHRoaXNbb2Zmc2V0ICsgMV0gPDwgOCkgfFxuICAgICAgKHRoaXNbb2Zmc2V0ICsgMl0gPDwgMTYpIHxcbiAgICAgICh0aGlzW29mZnNldCArIDNdIDw8IDI0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQzMkJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja09mZnNldChvZmZzZXQsIDQsIHRoaXMubGVuZ3RoKVxuXG4gIHJldHVybiAodGhpc1tvZmZzZXRdIDw8IDI0KSB8XG4gICAgICAodGhpc1tvZmZzZXQgKyAxXSA8PCAxNikgfFxuICAgICAgKHRoaXNbb2Zmc2V0ICsgMl0gPDwgOCkgfFxuICAgICAgKHRoaXNbb2Zmc2V0ICsgM10pXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEZsb2F0TEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrT2Zmc2V0KG9mZnNldCwgNCwgdGhpcy5sZW5ndGgpXG4gIHJldHVybiBpZWVlNzU0LnJlYWQodGhpcywgb2Zmc2V0LCB0cnVlLCAyMywgNClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkRmxvYXRCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tPZmZzZXQob2Zmc2V0LCA0LCB0aGlzLmxlbmd0aClcbiAgcmV0dXJuIGllZWU3NTQucmVhZCh0aGlzLCBvZmZzZXQsIGZhbHNlLCAyMywgNClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkRG91YmxlTEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrT2Zmc2V0KG9mZnNldCwgOCwgdGhpcy5sZW5ndGgpXG4gIHJldHVybiBpZWVlNzU0LnJlYWQodGhpcywgb2Zmc2V0LCB0cnVlLCA1MiwgOClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkRG91YmxlQkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrT2Zmc2V0KG9mZnNldCwgOCwgdGhpcy5sZW5ndGgpXG4gIHJldHVybiBpZWVlNzU0LnJlYWQodGhpcywgb2Zmc2V0LCBmYWxzZSwgNTIsIDgpXG59XG5cbmZ1bmN0aW9uIGNoZWNrSW50IChidWYsIHZhbHVlLCBvZmZzZXQsIGV4dCwgbWF4LCBtaW4pIHtcbiAgaWYgKCFCdWZmZXIuaXNCdWZmZXIoYnVmKSkgdGhyb3cgbmV3IFR5cGVFcnJvcignYnVmZmVyIG11c3QgYmUgYSBCdWZmZXIgaW5zdGFuY2UnKVxuICBpZiAodmFsdWUgPiBtYXggfHwgdmFsdWUgPCBtaW4pIHRocm93IG5ldyBUeXBlRXJyb3IoJ3ZhbHVlIGlzIG91dCBvZiBib3VuZHMnKVxuICBpZiAob2Zmc2V0ICsgZXh0ID4gYnVmLmxlbmd0aCkgdGhyb3cgbmV3IFR5cGVFcnJvcignaW5kZXggb3V0IG9mIHJhbmdlJylcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQ4ID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCA+Pj4gMFxuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrSW50KHRoaXMsIHZhbHVlLCBvZmZzZXQsIDEsIDB4ZmYsIDApXG4gIGlmICghQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHZhbHVlID0gTWF0aC5mbG9vcih2YWx1ZSlcbiAgdGhpc1tvZmZzZXRdID0gdmFsdWVcbiAgcmV0dXJuIG9mZnNldCArIDFcbn1cblxuZnVuY3Rpb24gb2JqZWN0V3JpdGVVSW50MTYgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuKSB7XG4gIGlmICh2YWx1ZSA8IDApIHZhbHVlID0gMHhmZmZmICsgdmFsdWUgKyAxXG4gIGZvciAodmFyIGkgPSAwLCBqID0gTWF0aC5taW4oYnVmLmxlbmd0aCAtIG9mZnNldCwgMik7IGkgPCBqOyBpKyspIHtcbiAgICBidWZbb2Zmc2V0ICsgaV0gPSAodmFsdWUgJiAoMHhmZiA8PCAoOCAqIChsaXR0bGVFbmRpYW4gPyBpIDogMSAtIGkpKSkpID4+PlxuICAgICAgKGxpdHRsZUVuZGlhbiA/IGkgOiAxIC0gaSkgKiA4XG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQxNkxFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCA+Pj4gMFxuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrSW50KHRoaXMsIHZhbHVlLCBvZmZzZXQsIDIsIDB4ZmZmZiwgMClcbiAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgdGhpc1tvZmZzZXRdID0gdmFsdWVcbiAgICB0aGlzW29mZnNldCArIDFdID0gKHZhbHVlID4+PiA4KVxuICB9IGVsc2Ugb2JqZWN0V3JpdGVVSW50MTYodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSlcbiAgcmV0dXJuIG9mZnNldCArIDJcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQxNkJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCA+Pj4gMFxuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrSW50KHRoaXMsIHZhbHVlLCBvZmZzZXQsIDIsIDB4ZmZmZiwgMClcbiAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgdGhpc1tvZmZzZXRdID0gKHZhbHVlID4+PiA4KVxuICAgIHRoaXNbb2Zmc2V0ICsgMV0gPSB2YWx1ZVxuICB9IGVsc2Ugb2JqZWN0V3JpdGVVSW50MTYodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UpXG4gIHJldHVybiBvZmZzZXQgKyAyXG59XG5cbmZ1bmN0aW9uIG9iamVjdFdyaXRlVUludDMyIChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbikge1xuICBpZiAodmFsdWUgPCAwKSB2YWx1ZSA9IDB4ZmZmZmZmZmYgKyB2YWx1ZSArIDFcbiAgZm9yICh2YXIgaSA9IDAsIGogPSBNYXRoLm1pbihidWYubGVuZ3RoIC0gb2Zmc2V0LCA0KTsgaSA8IGo7IGkrKykge1xuICAgIGJ1ZltvZmZzZXQgKyBpXSA9ICh2YWx1ZSA+Pj4gKGxpdHRsZUVuZGlhbiA/IGkgOiAzIC0gaSkgKiA4KSAmIDB4ZmZcbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDMyTEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0ID4+PiAwXG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgNCwgMHhmZmZmZmZmZiwgMClcbiAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgdGhpc1tvZmZzZXQgKyAzXSA9ICh2YWx1ZSA+Pj4gMjQpXG4gICAgdGhpc1tvZmZzZXQgKyAyXSA9ICh2YWx1ZSA+Pj4gMTYpXG4gICAgdGhpc1tvZmZzZXQgKyAxXSA9ICh2YWx1ZSA+Pj4gOClcbiAgICB0aGlzW29mZnNldF0gPSB2YWx1ZVxuICB9IGVsc2Ugb2JqZWN0V3JpdGVVSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSlcbiAgcmV0dXJuIG9mZnNldCArIDRcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQzMkJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCA+Pj4gMFxuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrSW50KHRoaXMsIHZhbHVlLCBvZmZzZXQsIDQsIDB4ZmZmZmZmZmYsIDApXG4gIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIHRoaXNbb2Zmc2V0XSA9ICh2YWx1ZSA+Pj4gMjQpXG4gICAgdGhpc1tvZmZzZXQgKyAxXSA9ICh2YWx1ZSA+Pj4gMTYpXG4gICAgdGhpc1tvZmZzZXQgKyAyXSA9ICh2YWx1ZSA+Pj4gOClcbiAgICB0aGlzW29mZnNldCArIDNdID0gdmFsdWVcbiAgfSBlbHNlIG9iamVjdFdyaXRlVUludDMyKHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlKVxuICByZXR1cm4gb2Zmc2V0ICsgNFxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50OCA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgPj4+IDBcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCAxLCAweDdmLCAtMHg4MClcbiAgaWYgKCFCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkgdmFsdWUgPSBNYXRoLmZsb29yKHZhbHVlKVxuICBpZiAodmFsdWUgPCAwKSB2YWx1ZSA9IDB4ZmYgKyB2YWx1ZSArIDFcbiAgdGhpc1tvZmZzZXRdID0gdmFsdWVcbiAgcmV0dXJuIG9mZnNldCArIDFcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDE2TEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0ID4+PiAwXG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgMiwgMHg3ZmZmLCAtMHg4MDAwKVxuICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICB0aGlzW29mZnNldF0gPSB2YWx1ZVxuICAgIHRoaXNbb2Zmc2V0ICsgMV0gPSAodmFsdWUgPj4+IDgpXG4gIH0gZWxzZSBvYmplY3RXcml0ZVVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlKVxuICByZXR1cm4gb2Zmc2V0ICsgMlxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MTZCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgPj4+IDBcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCAyLCAweDdmZmYsIC0weDgwMDApXG4gIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIHRoaXNbb2Zmc2V0XSA9ICh2YWx1ZSA+Pj4gOClcbiAgICB0aGlzW29mZnNldCArIDFdID0gdmFsdWVcbiAgfSBlbHNlIG9iamVjdFdyaXRlVUludDE2KHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlKVxuICByZXR1cm4gb2Zmc2V0ICsgMlxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MzJMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgPj4+IDBcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCA0LCAweDdmZmZmZmZmLCAtMHg4MDAwMDAwMClcbiAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgdGhpc1tvZmZzZXRdID0gdmFsdWVcbiAgICB0aGlzW29mZnNldCArIDFdID0gKHZhbHVlID4+PiA4KVxuICAgIHRoaXNbb2Zmc2V0ICsgMl0gPSAodmFsdWUgPj4+IDE2KVxuICAgIHRoaXNbb2Zmc2V0ICsgM10gPSAodmFsdWUgPj4+IDI0KVxuICB9IGVsc2Ugb2JqZWN0V3JpdGVVSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSlcbiAgcmV0dXJuIG9mZnNldCArIDRcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDMyQkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0ID4+PiAwXG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgNCwgMHg3ZmZmZmZmZiwgLTB4ODAwMDAwMDApXG4gIGlmICh2YWx1ZSA8IDApIHZhbHVlID0gMHhmZmZmZmZmZiArIHZhbHVlICsgMVxuICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICB0aGlzW29mZnNldF0gPSAodmFsdWUgPj4+IDI0KVxuICAgIHRoaXNbb2Zmc2V0ICsgMV0gPSAodmFsdWUgPj4+IDE2KVxuICAgIHRoaXNbb2Zmc2V0ICsgMl0gPSAodmFsdWUgPj4+IDgpXG4gICAgdGhpc1tvZmZzZXQgKyAzXSA9IHZhbHVlXG4gIH0gZWxzZSBvYmplY3RXcml0ZVVJbnQzMih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSlcbiAgcmV0dXJuIG9mZnNldCArIDRcbn1cblxuZnVuY3Rpb24gY2hlY2tJRUVFNzU0IChidWYsIHZhbHVlLCBvZmZzZXQsIGV4dCwgbWF4LCBtaW4pIHtcbiAgaWYgKHZhbHVlID4gbWF4IHx8IHZhbHVlIDwgbWluKSB0aHJvdyBuZXcgVHlwZUVycm9yKCd2YWx1ZSBpcyBvdXQgb2YgYm91bmRzJylcbiAgaWYgKG9mZnNldCArIGV4dCA+IGJ1Zi5sZW5ndGgpIHRocm93IG5ldyBUeXBlRXJyb3IoJ2luZGV4IG91dCBvZiByYW5nZScpXG59XG5cbmZ1bmN0aW9uIHdyaXRlRmxvYXQgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrSUVFRTc1NChidWYsIHZhbHVlLCBvZmZzZXQsIDQsIDMuNDAyODIzNDY2Mzg1Mjg4NmUrMzgsIC0zLjQwMjgyMzQ2NjM4NTI4ODZlKzM4KVxuICBpZWVlNzU0LndyaXRlKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCAyMywgNClcbiAgcmV0dXJuIG9mZnNldCArIDRcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUZsb2F0TEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIHdyaXRlRmxvYXQodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVGbG9hdEJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiB3cml0ZUZsb2F0KHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gd3JpdGVEb3VibGUgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrSUVFRTc1NChidWYsIHZhbHVlLCBvZmZzZXQsIDgsIDEuNzk3NjkzMTM0ODYyMzE1N0UrMzA4LCAtMS43OTc2OTMxMzQ4NjIzMTU3RSszMDgpXG4gIGllZWU3NTQud3JpdGUoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIDUyLCA4KVxuICByZXR1cm4gb2Zmc2V0ICsgOFxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRG91YmxlTEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIHdyaXRlRG91YmxlKHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRG91YmxlQkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIHdyaXRlRG91YmxlKHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuLy8gY29weSh0YXJnZXRCdWZmZXIsIHRhcmdldFN0YXJ0PTAsIHNvdXJjZVN0YXJ0PTAsIHNvdXJjZUVuZD1idWZmZXIubGVuZ3RoKVxuQnVmZmVyLnByb3RvdHlwZS5jb3B5ID0gZnVuY3Rpb24gKHRhcmdldCwgdGFyZ2V0X3N0YXJ0LCBzdGFydCwgZW5kKSB7XG4gIHZhciBzb3VyY2UgPSB0aGlzXG5cbiAgaWYgKCFzdGFydCkgc3RhcnQgPSAwXG4gIGlmICghZW5kICYmIGVuZCAhPT0gMCkgZW5kID0gdGhpcy5sZW5ndGhcbiAgaWYgKCF0YXJnZXRfc3RhcnQpIHRhcmdldF9zdGFydCA9IDBcblxuICAvLyBDb3B5IDAgYnl0ZXM7IHdlJ3JlIGRvbmVcbiAgaWYgKGVuZCA9PT0gc3RhcnQpIHJldHVyblxuICBpZiAodGFyZ2V0Lmxlbmd0aCA9PT0gMCB8fCBzb3VyY2UubGVuZ3RoID09PSAwKSByZXR1cm5cblxuICAvLyBGYXRhbCBlcnJvciBjb25kaXRpb25zXG4gIGlmIChlbmQgPCBzdGFydCkgdGhyb3cgbmV3IFR5cGVFcnJvcignc291cmNlRW5kIDwgc291cmNlU3RhcnQnKVxuICBpZiAodGFyZ2V0X3N0YXJ0IDwgMCB8fCB0YXJnZXRfc3RhcnQgPj0gdGFyZ2V0Lmxlbmd0aClcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCd0YXJnZXRTdGFydCBvdXQgb2YgYm91bmRzJylcbiAgaWYgKHN0YXJ0IDwgMCB8fCBzdGFydCA+PSBzb3VyY2UubGVuZ3RoKSB0aHJvdyBuZXcgVHlwZUVycm9yKCdzb3VyY2VTdGFydCBvdXQgb2YgYm91bmRzJylcbiAgaWYgKGVuZCA8IDAgfHwgZW5kID4gc291cmNlLmxlbmd0aCkgdGhyb3cgbmV3IFR5cGVFcnJvcignc291cmNlRW5kIG91dCBvZiBib3VuZHMnKVxuXG4gIC8vIEFyZSB3ZSBvb2I/XG4gIGlmIChlbmQgPiB0aGlzLmxlbmd0aClcbiAgICBlbmQgPSB0aGlzLmxlbmd0aFxuICBpZiAodGFyZ2V0Lmxlbmd0aCAtIHRhcmdldF9zdGFydCA8IGVuZCAtIHN0YXJ0KVxuICAgIGVuZCA9IHRhcmdldC5sZW5ndGggLSB0YXJnZXRfc3RhcnQgKyBzdGFydFxuXG4gIHZhciBsZW4gPSBlbmQgLSBzdGFydFxuXG4gIGlmIChsZW4gPCAxMDAwIHx8ICFCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgIHRhcmdldFtpICsgdGFyZ2V0X3N0YXJ0XSA9IHRoaXNbaSArIHN0YXJ0XVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICB0YXJnZXQuX3NldCh0aGlzLnN1YmFycmF5KHN0YXJ0LCBzdGFydCArIGxlbiksIHRhcmdldF9zdGFydClcbiAgfVxufVxuXG4vLyBmaWxsKHZhbHVlLCBzdGFydD0wLCBlbmQ9YnVmZmVyLmxlbmd0aClcbkJ1ZmZlci5wcm90b3R5cGUuZmlsbCA9IGZ1bmN0aW9uICh2YWx1ZSwgc3RhcnQsIGVuZCkge1xuICBpZiAoIXZhbHVlKSB2YWx1ZSA9IDBcbiAgaWYgKCFzdGFydCkgc3RhcnQgPSAwXG4gIGlmICghZW5kKSBlbmQgPSB0aGlzLmxlbmd0aFxuXG4gIGlmIChlbmQgPCBzdGFydCkgdGhyb3cgbmV3IFR5cGVFcnJvcignZW5kIDwgc3RhcnQnKVxuXG4gIC8vIEZpbGwgMCBieXRlczsgd2UncmUgZG9uZVxuICBpZiAoZW5kID09PSBzdGFydCkgcmV0dXJuXG4gIGlmICh0aGlzLmxlbmd0aCA9PT0gMCkgcmV0dXJuXG5cbiAgaWYgKHN0YXJ0IDwgMCB8fCBzdGFydCA+PSB0aGlzLmxlbmd0aCkgdGhyb3cgbmV3IFR5cGVFcnJvcignc3RhcnQgb3V0IG9mIGJvdW5kcycpXG4gIGlmIChlbmQgPCAwIHx8IGVuZCA+IHRoaXMubGVuZ3RoKSB0aHJvdyBuZXcgVHlwZUVycm9yKCdlbmQgb3V0IG9mIGJvdW5kcycpXG5cbiAgdmFyIGlcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicpIHtcbiAgICBmb3IgKGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgICB0aGlzW2ldID0gdmFsdWVcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgdmFyIGJ5dGVzID0gdXRmOFRvQnl0ZXModmFsdWUudG9TdHJpbmcoKSlcbiAgICB2YXIgbGVuID0gYnl0ZXMubGVuZ3RoXG4gICAgZm9yIChpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuICAgICAgdGhpc1tpXSA9IGJ5dGVzW2kgJSBsZW5dXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRoaXNcbn1cblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IGBBcnJheUJ1ZmZlcmAgd2l0aCB0aGUgKmNvcGllZCogbWVtb3J5IG9mIHRoZSBidWZmZXIgaW5zdGFuY2UuXG4gKiBBZGRlZCBpbiBOb2RlIDAuMTIuIE9ubHkgYXZhaWxhYmxlIGluIGJyb3dzZXJzIHRoYXQgc3VwcG9ydCBBcnJheUJ1ZmZlci5cbiAqL1xuQnVmZmVyLnByb3RvdHlwZS50b0FycmF5QnVmZmVyID0gZnVuY3Rpb24gKCkge1xuICBpZiAodHlwZW9mIFVpbnQ4QXJyYXkgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgICByZXR1cm4gKG5ldyBCdWZmZXIodGhpcykpLmJ1ZmZlclxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgYnVmID0gbmV3IFVpbnQ4QXJyYXkodGhpcy5sZW5ndGgpXG4gICAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gYnVmLmxlbmd0aDsgaSA8IGxlbjsgaSArPSAxKSB7XG4gICAgICAgIGJ1ZltpXSA9IHRoaXNbaV1cbiAgICAgIH1cbiAgICAgIHJldHVybiBidWYuYnVmZmVyXG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0J1ZmZlci50b0FycmF5QnVmZmVyIG5vdCBzdXBwb3J0ZWQgaW4gdGhpcyBicm93c2VyJylcbiAgfVxufVxuXG4vLyBIRUxQRVIgRlVOQ1RJT05TXG4vLyA9PT09PT09PT09PT09PT09XG5cbnZhciBCUCA9IEJ1ZmZlci5wcm90b3R5cGVcblxuLyoqXG4gKiBBdWdtZW50IGEgVWludDhBcnJheSAqaW5zdGFuY2UqIChub3QgdGhlIFVpbnQ4QXJyYXkgY2xhc3MhKSB3aXRoIEJ1ZmZlciBtZXRob2RzXG4gKi9cbkJ1ZmZlci5fYXVnbWVudCA9IGZ1bmN0aW9uIChhcnIpIHtcbiAgYXJyLmNvbnN0cnVjdG9yID0gQnVmZmVyXG4gIGFyci5faXNCdWZmZXIgPSB0cnVlXG5cbiAgLy8gc2F2ZSByZWZlcmVuY2UgdG8gb3JpZ2luYWwgVWludDhBcnJheSBnZXQvc2V0IG1ldGhvZHMgYmVmb3JlIG92ZXJ3cml0aW5nXG4gIGFyci5fZ2V0ID0gYXJyLmdldFxuICBhcnIuX3NldCA9IGFyci5zZXRcblxuICAvLyBkZXByZWNhdGVkLCB3aWxsIGJlIHJlbW92ZWQgaW4gbm9kZSAwLjEzK1xuICBhcnIuZ2V0ID0gQlAuZ2V0XG4gIGFyci5zZXQgPSBCUC5zZXRcblxuICBhcnIud3JpdGUgPSBCUC53cml0ZVxuICBhcnIudG9TdHJpbmcgPSBCUC50b1N0cmluZ1xuICBhcnIudG9Mb2NhbGVTdHJpbmcgPSBCUC50b1N0cmluZ1xuICBhcnIudG9KU09OID0gQlAudG9KU09OXG4gIGFyci5lcXVhbHMgPSBCUC5lcXVhbHNcbiAgYXJyLmNvbXBhcmUgPSBCUC5jb21wYXJlXG4gIGFyci5jb3B5ID0gQlAuY29weVxuICBhcnIuc2xpY2UgPSBCUC5zbGljZVxuICBhcnIucmVhZFVJbnQ4ID0gQlAucmVhZFVJbnQ4XG4gIGFyci5yZWFkVUludDE2TEUgPSBCUC5yZWFkVUludDE2TEVcbiAgYXJyLnJlYWRVSW50MTZCRSA9IEJQLnJlYWRVSW50MTZCRVxuICBhcnIucmVhZFVJbnQzMkxFID0gQlAucmVhZFVJbnQzMkxFXG4gIGFyci5yZWFkVUludDMyQkUgPSBCUC5yZWFkVUludDMyQkVcbiAgYXJyLnJlYWRJbnQ4ID0gQlAucmVhZEludDhcbiAgYXJyLnJlYWRJbnQxNkxFID0gQlAucmVhZEludDE2TEVcbiAgYXJyLnJlYWRJbnQxNkJFID0gQlAucmVhZEludDE2QkVcbiAgYXJyLnJlYWRJbnQzMkxFID0gQlAucmVhZEludDMyTEVcbiAgYXJyLnJlYWRJbnQzMkJFID0gQlAucmVhZEludDMyQkVcbiAgYXJyLnJlYWRGbG9hdExFID0gQlAucmVhZEZsb2F0TEVcbiAgYXJyLnJlYWRGbG9hdEJFID0gQlAucmVhZEZsb2F0QkVcbiAgYXJyLnJlYWREb3VibGVMRSA9IEJQLnJlYWREb3VibGVMRVxuICBhcnIucmVhZERvdWJsZUJFID0gQlAucmVhZERvdWJsZUJFXG4gIGFyci53cml0ZVVJbnQ4ID0gQlAud3JpdGVVSW50OFxuICBhcnIud3JpdGVVSW50MTZMRSA9IEJQLndyaXRlVUludDE2TEVcbiAgYXJyLndyaXRlVUludDE2QkUgPSBCUC53cml0ZVVJbnQxNkJFXG4gIGFyci53cml0ZVVJbnQzMkxFID0gQlAud3JpdGVVSW50MzJMRVxuICBhcnIud3JpdGVVSW50MzJCRSA9IEJQLndyaXRlVUludDMyQkVcbiAgYXJyLndyaXRlSW50OCA9IEJQLndyaXRlSW50OFxuICBhcnIud3JpdGVJbnQxNkxFID0gQlAud3JpdGVJbnQxNkxFXG4gIGFyci53cml0ZUludDE2QkUgPSBCUC53cml0ZUludDE2QkVcbiAgYXJyLndyaXRlSW50MzJMRSA9IEJQLndyaXRlSW50MzJMRVxuICBhcnIud3JpdGVJbnQzMkJFID0gQlAud3JpdGVJbnQzMkJFXG4gIGFyci53cml0ZUZsb2F0TEUgPSBCUC53cml0ZUZsb2F0TEVcbiAgYXJyLndyaXRlRmxvYXRCRSA9IEJQLndyaXRlRmxvYXRCRVxuICBhcnIud3JpdGVEb3VibGVMRSA9IEJQLndyaXRlRG91YmxlTEVcbiAgYXJyLndyaXRlRG91YmxlQkUgPSBCUC53cml0ZURvdWJsZUJFXG4gIGFyci5maWxsID0gQlAuZmlsbFxuICBhcnIuaW5zcGVjdCA9IEJQLmluc3BlY3RcbiAgYXJyLnRvQXJyYXlCdWZmZXIgPSBCUC50b0FycmF5QnVmZmVyXG5cbiAgcmV0dXJuIGFyclxufVxuXG52YXIgSU5WQUxJRF9CQVNFNjRfUkUgPSAvW14rXFwvMC05QS16XS9nXG5cbmZ1bmN0aW9uIGJhc2U2NGNsZWFuIChzdHIpIHtcbiAgLy8gTm9kZSBzdHJpcHMgb3V0IGludmFsaWQgY2hhcmFjdGVycyBsaWtlIFxcbiBhbmQgXFx0IGZyb20gdGhlIHN0cmluZywgYmFzZTY0LWpzIGRvZXMgbm90XG4gIHN0ciA9IHN0cmluZ3RyaW0oc3RyKS5yZXBsYWNlKElOVkFMSURfQkFTRTY0X1JFLCAnJylcbiAgLy8gTm9kZSBhbGxvd3MgZm9yIG5vbi1wYWRkZWQgYmFzZTY0IHN0cmluZ3MgKG1pc3NpbmcgdHJhaWxpbmcgPT09KSwgYmFzZTY0LWpzIGRvZXMgbm90XG4gIHdoaWxlIChzdHIubGVuZ3RoICUgNCAhPT0gMCkge1xuICAgIHN0ciA9IHN0ciArICc9J1xuICB9XG4gIHJldHVybiBzdHJcbn1cblxuZnVuY3Rpb24gc3RyaW5ndHJpbSAoc3RyKSB7XG4gIGlmIChzdHIudHJpbSkgcmV0dXJuIHN0ci50cmltKClcbiAgcmV0dXJuIHN0ci5yZXBsYWNlKC9eXFxzK3xcXHMrJC9nLCAnJylcbn1cblxuZnVuY3Rpb24gaXNBcnJheWlzaCAoc3ViamVjdCkge1xuICByZXR1cm4gaXNBcnJheShzdWJqZWN0KSB8fCBCdWZmZXIuaXNCdWZmZXIoc3ViamVjdCkgfHxcbiAgICAgIHN1YmplY3QgJiYgdHlwZW9mIHN1YmplY3QgPT09ICdvYmplY3QnICYmXG4gICAgICB0eXBlb2Ygc3ViamVjdC5sZW5ndGggPT09ICdudW1iZXInXG59XG5cbmZ1bmN0aW9uIHRvSGV4IChuKSB7XG4gIGlmIChuIDwgMTYpIHJldHVybiAnMCcgKyBuLnRvU3RyaW5nKDE2KVxuICByZXR1cm4gbi50b1N0cmluZygxNilcbn1cblxuZnVuY3Rpb24gdXRmOFRvQnl0ZXMgKHN0cikge1xuICB2YXIgYnl0ZUFycmF5ID0gW11cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdHIubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgYiA9IHN0ci5jaGFyQ29kZUF0KGkpXG4gICAgaWYgKGIgPD0gMHg3Rikge1xuICAgICAgYnl0ZUFycmF5LnB1c2goYilcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIHN0YXJ0ID0gaVxuICAgICAgaWYgKGIgPj0gMHhEODAwICYmIGIgPD0gMHhERkZGKSBpKytcbiAgICAgIHZhciBoID0gZW5jb2RlVVJJQ29tcG9uZW50KHN0ci5zbGljZShzdGFydCwgaSsxKSkuc3Vic3RyKDEpLnNwbGl0KCclJylcbiAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgaC5sZW5ndGg7IGorKykge1xuICAgICAgICBieXRlQXJyYXkucHVzaChwYXJzZUludChoW2pdLCAxNikpXG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBieXRlQXJyYXlcbn1cblxuZnVuY3Rpb24gYXNjaWlUb0J5dGVzIChzdHIpIHtcbiAgdmFyIGJ5dGVBcnJheSA9IFtdXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSsrKSB7XG4gICAgLy8gTm9kZSdzIGNvZGUgc2VlbXMgdG8gYmUgZG9pbmcgdGhpcyBhbmQgbm90ICYgMHg3Ri4uXG4gICAgYnl0ZUFycmF5LnB1c2goc3RyLmNoYXJDb2RlQXQoaSkgJiAweEZGKVxuICB9XG4gIHJldHVybiBieXRlQXJyYXlcbn1cblxuZnVuY3Rpb24gdXRmMTZsZVRvQnl0ZXMgKHN0cikge1xuICB2YXIgYywgaGksIGxvXG4gIHZhciBieXRlQXJyYXkgPSBbXVxuICBmb3IgKHZhciBpID0gMDsgaSA8IHN0ci5sZW5ndGg7IGkrKykge1xuICAgIGMgPSBzdHIuY2hhckNvZGVBdChpKVxuICAgIGhpID0gYyA+PiA4XG4gICAgbG8gPSBjICUgMjU2XG4gICAgYnl0ZUFycmF5LnB1c2gobG8pXG4gICAgYnl0ZUFycmF5LnB1c2goaGkpXG4gIH1cblxuICByZXR1cm4gYnl0ZUFycmF5XG59XG5cbmZ1bmN0aW9uIGJhc2U2NFRvQnl0ZXMgKHN0cikge1xuICByZXR1cm4gYmFzZTY0LnRvQnl0ZUFycmF5KHN0cilcbn1cblxuZnVuY3Rpb24gYmxpdEJ1ZmZlciAoc3JjLCBkc3QsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoKGkgKyBvZmZzZXQgPj0gZHN0Lmxlbmd0aCkgfHwgKGkgPj0gc3JjLmxlbmd0aCkpXG4gICAgICBicmVha1xuICAgIGRzdFtpICsgb2Zmc2V0XSA9IHNyY1tpXVxuICB9XG4gIHJldHVybiBpXG59XG5cbmZ1bmN0aW9uIGRlY29kZVV0ZjhDaGFyIChzdHIpIHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gZGVjb2RlVVJJQ29tcG9uZW50KHN0cilcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgcmV0dXJuIFN0cmluZy5mcm9tQ2hhckNvZGUoMHhGRkZEKSAvLyBVVEYgOCBpbnZhbGlkIGNoYXJcbiAgfVxufVxuIiwidmFyIGxvb2t1cCA9ICdBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWmFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6MDEyMzQ1Njc4OSsvJztcblxuOyhmdW5jdGlvbiAoZXhwb3J0cykge1xuXHQndXNlIHN0cmljdCc7XG5cbiAgdmFyIEFyciA9ICh0eXBlb2YgVWludDhBcnJheSAhPT0gJ3VuZGVmaW5lZCcpXG4gICAgPyBVaW50OEFycmF5XG4gICAgOiBBcnJheVxuXG5cdHZhciBQTFVTICAgPSAnKycuY2hhckNvZGVBdCgwKVxuXHR2YXIgU0xBU0ggID0gJy8nLmNoYXJDb2RlQXQoMClcblx0dmFyIE5VTUJFUiA9ICcwJy5jaGFyQ29kZUF0KDApXG5cdHZhciBMT1dFUiAgPSAnYScuY2hhckNvZGVBdCgwKVxuXHR2YXIgVVBQRVIgID0gJ0EnLmNoYXJDb2RlQXQoMClcblxuXHRmdW5jdGlvbiBkZWNvZGUgKGVsdCkge1xuXHRcdHZhciBjb2RlID0gZWx0LmNoYXJDb2RlQXQoMClcblx0XHRpZiAoY29kZSA9PT0gUExVUylcblx0XHRcdHJldHVybiA2MiAvLyAnKydcblx0XHRpZiAoY29kZSA9PT0gU0xBU0gpXG5cdFx0XHRyZXR1cm4gNjMgLy8gJy8nXG5cdFx0aWYgKGNvZGUgPCBOVU1CRVIpXG5cdFx0XHRyZXR1cm4gLTEgLy9ubyBtYXRjaFxuXHRcdGlmIChjb2RlIDwgTlVNQkVSICsgMTApXG5cdFx0XHRyZXR1cm4gY29kZSAtIE5VTUJFUiArIDI2ICsgMjZcblx0XHRpZiAoY29kZSA8IFVQUEVSICsgMjYpXG5cdFx0XHRyZXR1cm4gY29kZSAtIFVQUEVSXG5cdFx0aWYgKGNvZGUgPCBMT1dFUiArIDI2KVxuXHRcdFx0cmV0dXJuIGNvZGUgLSBMT1dFUiArIDI2XG5cdH1cblxuXHRmdW5jdGlvbiBiNjRUb0J5dGVBcnJheSAoYjY0KSB7XG5cdFx0dmFyIGksIGosIGwsIHRtcCwgcGxhY2VIb2xkZXJzLCBhcnJcblxuXHRcdGlmIChiNjQubGVuZ3RoICUgNCA+IDApIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBzdHJpbmcuIExlbmd0aCBtdXN0IGJlIGEgbXVsdGlwbGUgb2YgNCcpXG5cdFx0fVxuXG5cdFx0Ly8gdGhlIG51bWJlciBvZiBlcXVhbCBzaWducyAocGxhY2UgaG9sZGVycylcblx0XHQvLyBpZiB0aGVyZSBhcmUgdHdvIHBsYWNlaG9sZGVycywgdGhhbiB0aGUgdHdvIGNoYXJhY3RlcnMgYmVmb3JlIGl0XG5cdFx0Ly8gcmVwcmVzZW50IG9uZSBieXRlXG5cdFx0Ly8gaWYgdGhlcmUgaXMgb25seSBvbmUsIHRoZW4gdGhlIHRocmVlIGNoYXJhY3RlcnMgYmVmb3JlIGl0IHJlcHJlc2VudCAyIGJ5dGVzXG5cdFx0Ly8gdGhpcyBpcyBqdXN0IGEgY2hlYXAgaGFjayB0byBub3QgZG8gaW5kZXhPZiB0d2ljZVxuXHRcdHZhciBsZW4gPSBiNjQubGVuZ3RoXG5cdFx0cGxhY2VIb2xkZXJzID0gJz0nID09PSBiNjQuY2hhckF0KGxlbiAtIDIpID8gMiA6ICc9JyA9PT0gYjY0LmNoYXJBdChsZW4gLSAxKSA/IDEgOiAwXG5cblx0XHQvLyBiYXNlNjQgaXMgNC8zICsgdXAgdG8gdHdvIGNoYXJhY3RlcnMgb2YgdGhlIG9yaWdpbmFsIGRhdGFcblx0XHRhcnIgPSBuZXcgQXJyKGI2NC5sZW5ndGggKiAzIC8gNCAtIHBsYWNlSG9sZGVycylcblxuXHRcdC8vIGlmIHRoZXJlIGFyZSBwbGFjZWhvbGRlcnMsIG9ubHkgZ2V0IHVwIHRvIHRoZSBsYXN0IGNvbXBsZXRlIDQgY2hhcnNcblx0XHRsID0gcGxhY2VIb2xkZXJzID4gMCA/IGI2NC5sZW5ndGggLSA0IDogYjY0Lmxlbmd0aFxuXG5cdFx0dmFyIEwgPSAwXG5cblx0XHRmdW5jdGlvbiBwdXNoICh2KSB7XG5cdFx0XHRhcnJbTCsrXSA9IHZcblx0XHR9XG5cblx0XHRmb3IgKGkgPSAwLCBqID0gMDsgaSA8IGw7IGkgKz0gNCwgaiArPSAzKSB7XG5cdFx0XHR0bXAgPSAoZGVjb2RlKGI2NC5jaGFyQXQoaSkpIDw8IDE4KSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMSkpIDw8IDEyKSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMikpIDw8IDYpIHwgZGVjb2RlKGI2NC5jaGFyQXQoaSArIDMpKVxuXHRcdFx0cHVzaCgodG1wICYgMHhGRjAwMDApID4+IDE2KVxuXHRcdFx0cHVzaCgodG1wICYgMHhGRjAwKSA+PiA4KVxuXHRcdFx0cHVzaCh0bXAgJiAweEZGKVxuXHRcdH1cblxuXHRcdGlmIChwbGFjZUhvbGRlcnMgPT09IDIpIHtcblx0XHRcdHRtcCA9IChkZWNvZGUoYjY0LmNoYXJBdChpKSkgPDwgMikgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDEpKSA+PiA0KVxuXHRcdFx0cHVzaCh0bXAgJiAweEZGKVxuXHRcdH0gZWxzZSBpZiAocGxhY2VIb2xkZXJzID09PSAxKSB7XG5cdFx0XHR0bXAgPSAoZGVjb2RlKGI2NC5jaGFyQXQoaSkpIDw8IDEwKSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMSkpIDw8IDQpIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAyKSkgPj4gMilcblx0XHRcdHB1c2goKHRtcCA+PiA4KSAmIDB4RkYpXG5cdFx0XHRwdXNoKHRtcCAmIDB4RkYpXG5cdFx0fVxuXG5cdFx0cmV0dXJuIGFyclxuXHR9XG5cblx0ZnVuY3Rpb24gdWludDhUb0Jhc2U2NCAodWludDgpIHtcblx0XHR2YXIgaSxcblx0XHRcdGV4dHJhQnl0ZXMgPSB1aW50OC5sZW5ndGggJSAzLCAvLyBpZiB3ZSBoYXZlIDEgYnl0ZSBsZWZ0LCBwYWQgMiBieXRlc1xuXHRcdFx0b3V0cHV0ID0gXCJcIixcblx0XHRcdHRlbXAsIGxlbmd0aFxuXG5cdFx0ZnVuY3Rpb24gZW5jb2RlIChudW0pIHtcblx0XHRcdHJldHVybiBsb29rdXAuY2hhckF0KG51bSlcblx0XHR9XG5cblx0XHRmdW5jdGlvbiB0cmlwbGV0VG9CYXNlNjQgKG51bSkge1xuXHRcdFx0cmV0dXJuIGVuY29kZShudW0gPj4gMTggJiAweDNGKSArIGVuY29kZShudW0gPj4gMTIgJiAweDNGKSArIGVuY29kZShudW0gPj4gNiAmIDB4M0YpICsgZW5jb2RlKG51bSAmIDB4M0YpXG5cdFx0fVxuXG5cdFx0Ly8gZ28gdGhyb3VnaCB0aGUgYXJyYXkgZXZlcnkgdGhyZWUgYnl0ZXMsIHdlJ2xsIGRlYWwgd2l0aCB0cmFpbGluZyBzdHVmZiBsYXRlclxuXHRcdGZvciAoaSA9IDAsIGxlbmd0aCA9IHVpbnQ4Lmxlbmd0aCAtIGV4dHJhQnl0ZXM7IGkgPCBsZW5ndGg7IGkgKz0gMykge1xuXHRcdFx0dGVtcCA9ICh1aW50OFtpXSA8PCAxNikgKyAodWludDhbaSArIDFdIDw8IDgpICsgKHVpbnQ4W2kgKyAyXSlcblx0XHRcdG91dHB1dCArPSB0cmlwbGV0VG9CYXNlNjQodGVtcClcblx0XHR9XG5cblx0XHQvLyBwYWQgdGhlIGVuZCB3aXRoIHplcm9zLCBidXQgbWFrZSBzdXJlIHRvIG5vdCBmb3JnZXQgdGhlIGV4dHJhIGJ5dGVzXG5cdFx0c3dpdGNoIChleHRyYUJ5dGVzKSB7XG5cdFx0XHRjYXNlIDE6XG5cdFx0XHRcdHRlbXAgPSB1aW50OFt1aW50OC5sZW5ndGggLSAxXVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKHRlbXAgPj4gMilcblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSgodGVtcCA8PCA0KSAmIDB4M0YpXG5cdFx0XHRcdG91dHB1dCArPSAnPT0nXG5cdFx0XHRcdGJyZWFrXG5cdFx0XHRjYXNlIDI6XG5cdFx0XHRcdHRlbXAgPSAodWludDhbdWludDgubGVuZ3RoIC0gMl0gPDwgOCkgKyAodWludDhbdWludDgubGVuZ3RoIC0gMV0pXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUodGVtcCA+PiAxMClcblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSgodGVtcCA+PiA0KSAmIDB4M0YpXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUoKHRlbXAgPDwgMikgJiAweDNGKVxuXHRcdFx0XHRvdXRwdXQgKz0gJz0nXG5cdFx0XHRcdGJyZWFrXG5cdFx0fVxuXG5cdFx0cmV0dXJuIG91dHB1dFxuXHR9XG5cblx0ZXhwb3J0cy50b0J5dGVBcnJheSA9IGI2NFRvQnl0ZUFycmF5XG5cdGV4cG9ydHMuZnJvbUJ5dGVBcnJheSA9IHVpbnQ4VG9CYXNlNjRcbn0odHlwZW9mIGV4cG9ydHMgPT09ICd1bmRlZmluZWQnID8gKHRoaXMuYmFzZTY0anMgPSB7fSkgOiBleHBvcnRzKSlcbiIsImV4cG9ydHMucmVhZCA9IGZ1bmN0aW9uKGJ1ZmZlciwgb2Zmc2V0LCBpc0xFLCBtTGVuLCBuQnl0ZXMpIHtcbiAgdmFyIGUsIG0sXG4gICAgICBlTGVuID0gbkJ5dGVzICogOCAtIG1MZW4gLSAxLFxuICAgICAgZU1heCA9ICgxIDw8IGVMZW4pIC0gMSxcbiAgICAgIGVCaWFzID0gZU1heCA+PiAxLFxuICAgICAgbkJpdHMgPSAtNyxcbiAgICAgIGkgPSBpc0xFID8gKG5CeXRlcyAtIDEpIDogMCxcbiAgICAgIGQgPSBpc0xFID8gLTEgOiAxLFxuICAgICAgcyA9IGJ1ZmZlcltvZmZzZXQgKyBpXTtcblxuICBpICs9IGQ7XG5cbiAgZSA9IHMgJiAoKDEgPDwgKC1uQml0cykpIC0gMSk7XG4gIHMgPj49ICgtbkJpdHMpO1xuICBuQml0cyArPSBlTGVuO1xuICBmb3IgKDsgbkJpdHMgPiAwOyBlID0gZSAqIDI1NiArIGJ1ZmZlcltvZmZzZXQgKyBpXSwgaSArPSBkLCBuQml0cyAtPSA4KTtcblxuICBtID0gZSAmICgoMSA8PCAoLW5CaXRzKSkgLSAxKTtcbiAgZSA+Pj0gKC1uQml0cyk7XG4gIG5CaXRzICs9IG1MZW47XG4gIGZvciAoOyBuQml0cyA+IDA7IG0gPSBtICogMjU2ICsgYnVmZmVyW29mZnNldCArIGldLCBpICs9IGQsIG5CaXRzIC09IDgpO1xuXG4gIGlmIChlID09PSAwKSB7XG4gICAgZSA9IDEgLSBlQmlhcztcbiAgfSBlbHNlIGlmIChlID09PSBlTWF4KSB7XG4gICAgcmV0dXJuIG0gPyBOYU4gOiAoKHMgPyAtMSA6IDEpICogSW5maW5pdHkpO1xuICB9IGVsc2Uge1xuICAgIG0gPSBtICsgTWF0aC5wb3coMiwgbUxlbik7XG4gICAgZSA9IGUgLSBlQmlhcztcbiAgfVxuICByZXR1cm4gKHMgPyAtMSA6IDEpICogbSAqIE1hdGgucG93KDIsIGUgLSBtTGVuKTtcbn07XG5cbmV4cG9ydHMud3JpdGUgPSBmdW5jdGlvbihidWZmZXIsIHZhbHVlLCBvZmZzZXQsIGlzTEUsIG1MZW4sIG5CeXRlcykge1xuICB2YXIgZSwgbSwgYyxcbiAgICAgIGVMZW4gPSBuQnl0ZXMgKiA4IC0gbUxlbiAtIDEsXG4gICAgICBlTWF4ID0gKDEgPDwgZUxlbikgLSAxLFxuICAgICAgZUJpYXMgPSBlTWF4ID4+IDEsXG4gICAgICBydCA9IChtTGVuID09PSAyMyA/IE1hdGgucG93KDIsIC0yNCkgLSBNYXRoLnBvdygyLCAtNzcpIDogMCksXG4gICAgICBpID0gaXNMRSA/IDAgOiAobkJ5dGVzIC0gMSksXG4gICAgICBkID0gaXNMRSA/IDEgOiAtMSxcbiAgICAgIHMgPSB2YWx1ZSA8IDAgfHwgKHZhbHVlID09PSAwICYmIDEgLyB2YWx1ZSA8IDApID8gMSA6IDA7XG5cbiAgdmFsdWUgPSBNYXRoLmFicyh2YWx1ZSk7XG5cbiAgaWYgKGlzTmFOKHZhbHVlKSB8fCB2YWx1ZSA9PT0gSW5maW5pdHkpIHtcbiAgICBtID0gaXNOYU4odmFsdWUpID8gMSA6IDA7XG4gICAgZSA9IGVNYXg7XG4gIH0gZWxzZSB7XG4gICAgZSA9IE1hdGguZmxvb3IoTWF0aC5sb2codmFsdWUpIC8gTWF0aC5MTjIpO1xuICAgIGlmICh2YWx1ZSAqIChjID0gTWF0aC5wb3coMiwgLWUpKSA8IDEpIHtcbiAgICAgIGUtLTtcbiAgICAgIGMgKj0gMjtcbiAgICB9XG4gICAgaWYgKGUgKyBlQmlhcyA+PSAxKSB7XG4gICAgICB2YWx1ZSArPSBydCAvIGM7XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhbHVlICs9IHJ0ICogTWF0aC5wb3coMiwgMSAtIGVCaWFzKTtcbiAgICB9XG4gICAgaWYgKHZhbHVlICogYyA+PSAyKSB7XG4gICAgICBlKys7XG4gICAgICBjIC89IDI7XG4gICAgfVxuXG4gICAgaWYgKGUgKyBlQmlhcyA+PSBlTWF4KSB7XG4gICAgICBtID0gMDtcbiAgICAgIGUgPSBlTWF4O1xuICAgIH0gZWxzZSBpZiAoZSArIGVCaWFzID49IDEpIHtcbiAgICAgIG0gPSAodmFsdWUgKiBjIC0gMSkgKiBNYXRoLnBvdygyLCBtTGVuKTtcbiAgICAgIGUgPSBlICsgZUJpYXM7XG4gICAgfSBlbHNlIHtcbiAgICAgIG0gPSB2YWx1ZSAqIE1hdGgucG93KDIsIGVCaWFzIC0gMSkgKiBNYXRoLnBvdygyLCBtTGVuKTtcbiAgICAgIGUgPSAwO1xuICAgIH1cbiAgfVxuXG4gIGZvciAoOyBtTGVuID49IDg7IGJ1ZmZlcltvZmZzZXQgKyBpXSA9IG0gJiAweGZmLCBpICs9IGQsIG0gLz0gMjU2LCBtTGVuIC09IDgpO1xuXG4gIGUgPSAoZSA8PCBtTGVuKSB8IG07XG4gIGVMZW4gKz0gbUxlbjtcbiAgZm9yICg7IGVMZW4gPiAwOyBidWZmZXJbb2Zmc2V0ICsgaV0gPSBlICYgMHhmZiwgaSArPSBkLCBlIC89IDI1NiwgZUxlbiAtPSA4KTtcblxuICBidWZmZXJbb2Zmc2V0ICsgaSAtIGRdIHw9IHMgKiAxMjg7XG59O1xuIiwiXG4vKipcbiAqIGlzQXJyYXlcbiAqL1xuXG52YXIgaXNBcnJheSA9IEFycmF5LmlzQXJyYXk7XG5cbi8qKlxuICogdG9TdHJpbmdcbiAqL1xuXG52YXIgc3RyID0gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZztcblxuLyoqXG4gKiBXaGV0aGVyIG9yIG5vdCB0aGUgZ2l2ZW4gYHZhbGBcbiAqIGlzIGFuIGFycmF5LlxuICpcbiAqIGV4YW1wbGU6XG4gKlxuICogICAgICAgIGlzQXJyYXkoW10pO1xuICogICAgICAgIC8vID4gdHJ1ZVxuICogICAgICAgIGlzQXJyYXkoYXJndW1lbnRzKTtcbiAqICAgICAgICAvLyA+IGZhbHNlXG4gKiAgICAgICAgaXNBcnJheSgnJyk7XG4gKiAgICAgICAgLy8gPiBmYWxzZVxuICpcbiAqIEBwYXJhbSB7bWl4ZWR9IHZhbFxuICogQHJldHVybiB7Ym9vbH1cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGlzQXJyYXkgfHwgZnVuY3Rpb24gKHZhbCkge1xuICByZXR1cm4gISEgdmFsICYmICdbb2JqZWN0IEFycmF5XScgPT0gc3RyLmNhbGwodmFsKTtcbn07XG4iXX0=
