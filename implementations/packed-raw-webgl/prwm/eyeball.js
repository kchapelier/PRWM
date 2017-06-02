"use strict";

var PREPARED_ANSI_CHARSET = [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, '.', '!', '\"', '#', '$', '%', '&', '\'', '(', ')', '*', '+', ',', '-', '.', '/', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', ':', ';', '<', '=', '>', '?', '@', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '[', '\\', ']', '^', '_', '`', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', '{', '|', '}', '~', '.', '?', '.', '?', '?', '?', '?', '?', '?', '?', '?', '?', '?', '?', '.', '?', '.', '.', '?', '?', '?', '?', '?', '?', '?', '?', '?', '?', '?', '?', '.', '?', '?', '.', '¡', '¢', '£', '¤', '¥', '¦', '§', '¨', '©', 'ª', '«', '¬', '.', '®', '¯', '°', '±', '²', '³', '´', 'µ', '¶', '·', '¸', '¹', 'º', '»', '¼', '½', '¾', '¿', 'À', 'Á', 'Â', 'Ã', 'Ä', 'Å', 'Æ', 'Ç', 'È', 'É', 'Ê', 'Ë', 'Ì', 'Í', 'Î', 'Ï', 'Ð', 'Ñ', 'Ò', 'Ó', 'Ô', 'Õ', 'Ö', '×', 'Ø', 'Ù', 'Ú', 'Û', 'Ü', 'Ý', 'Þ', 'ß', 'à', 'á', 'â', 'ã', 'ä', 'å', 'æ', 'ç', 'è', 'é', 'ê', 'ë', 'ì', 'í', 'î', 'ï', 'ð', 'ñ', 'ò', 'ó', 'ô', 'õ', 'ö', '÷', 'ø', 'ù', 'ú', 'û', 'ü', 'ý', 'þ', 'ÿ'];

function displayBinary (buffer, binary) {
    var array = new Uint8Array(buffer),
        str = '',
        i;

    for(i = 0; i < array.length; i++) {
        if (i % 8 === 0) {
            if (i > 0) {
                process.stdout.write(' - ' + str);
                str = '';
            }
            process.stdout.write('\n' + ('0000' + i.toString(16)).substr(-4) + ' -');
        }

        str += array[i] < 127 && PREPARED_ANSI_CHARSET[array[i]] !== null ? PREPARED_ANSI_CHARSET[array[i]] : '.';

        if (binary) {
            process.stdout.write(' ' + ('00000000' + array[i].toString(2)).substr(-8));
        } else {
            process.stdout.write(' ' + ('00' + array[i].toString(16).toUpperCase()).substr(-2));
        }
    }

    var padding = (8 - i % 8) % 8;
    for (i = 0; i < padding; i++) {
        if (binary) {
            process.stdout.write(' ________');
        } else {
            process.stdout.write(' __');
        }
    }
    process.stdout.write(' - ' + str);

    process.stdout.write('\n\n');
}

var lib = require('./index');

var arrayBuffer = lib.encodePrwm(
    {
        abcde: {
            cardinality: 1,
            values: new Int16Array([0, 1, 3])
        },
        defgh: {
            cardinality: 2,
            values: new Uint16Array([0, 1, 3, 7, 15, 14])
        }
    },
    new Uint16Array([0,1,2,0,3,1]),
    true
);

displayBinary(arrayBuffer, true);

console.log(lib.decodePrwm(arrayBuffer));
