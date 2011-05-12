// node-cask
// implements simplest reading of bitcask
// the specified filename will be a directory

var fs = require('fs');
var mmap = require('mmap');
//var msgpack = require('node-msgpack');

var KLEN = 1,
    VLEN = 5,
    HEADER = 9;

function pad(str, len) {
    return Array(len + 1 - str.length).join('0') + str;
}

function extend(buffer) {
    buffer.writeint = function(value, cursor) {
        buffer[cursor  ] = value>>24;
        buffer[cursor+1] = value>>16;
        buffer[cursor+2] = value>> 8;
        buffer[cursor+3] = value    ;
    };
    buffer.readint = function(cursor) {
        return (buffer[cursor]<<24) + (buffer[cursor+1]<<16) + (buffer[cursor+2]<<8) + (buffer[cursor+3]);
    };
}

function open(filename) {
    var index = {},
        files = [],
        buffers = [],
        cursor = 0,
        filesize = 1<<26;
    
    _open();
    
    function _open() {
        cursor = filesize;
        try {
            var f = fs.readdirSync(filename).sort();
            for(var i=0; i<f.length; i++) {
                if(/cask[0-9a-z]{5}/.test(f[i])) {
                    cursor = read(filename + '/' + f[i]);
                }
            }
        } catch (e) {
            fs.mkdirSync(filename, 16877);
        }
    }
    
    function read(filename) {
        var file = fs.openSync(filename, 'r+'),
            buffer = mmap.map(filesize, mmap.PROT_READ | mmap.PROT_WRITE, mmap.MAP_SHARED, file, 0),
            cursor = 0;
        extend(buffer);
        files.push(file);
        buffers.push(buffer);
        while(cursor < filesize && buffer[cursor] > 0) {
            var sizes = readSizes(buffer, cursor),
                key = buffer.toString('utf8', cursor + sizes.header, cursor + sizes.header + sizes.key);
            index[key] = {
                file: files.length - 1,
                start: cursor + sizes.header + sizes.key,
                end: cursor + sizes.header + sizes.key + sizes.value,
            };
            cursor += sizes.header + sizes.key + sizes.value;
        }
        return cursor;
    }
    
    function newfile() {
        var name = filename + '/cask' + pad(files.length.toString(36), 5),
            file = fs.openSync(name, 'w+');
        fs.writeSync(file, 'z', filesize-1);
        
        var buffer = mmap.map(filesize, mmap.PROT_READ | mmap.PROT_WRITE, mmap.MAP_SHARED, file, 0);
        extend(buffer);
        
        files.push(file);
        buffers.push(buffer);
        cursor = 0;
    }
    
    function readSizes(buffer, start) {
        return {
            key:    buffer.readint(start + KLEN),
            value:  buffer.readint(start + VLEN),
            header: HEADER,
        };
    }
    
    function close() {
        index = {};
        buffers = [];
        for(var i=0; i<files.length; i++) {
            fs.closeSync(files[i]);
        }
        files = [];
    }

    function find(start, end) {
        if (typeof start === 'function') {
            return Object.keys(index).filter(start);
        } else {
            return Object.keys(index).slice(start, end != null ? end : (start||0)+100);
        }
    }

    function get(key) {
        var meta = index[key];
        //return meta ? msgpack.unpack(buffers[meta.file].slice(meta.start, meta.end)) : null;
        return meta ? JSON.parse(buffers[meta.file].toString('utf8', meta.start, meta.end)) : null;
    }

    function set(key, obj) {
        //var value = msgpack.pack(obj),
        //    klen = Buffer.byteLength(key),
        //    vlen = value.length;
        var value = JSON.stringify(obj),
            klen = Buffer.byteLength(key),
            vlen = Buffer.byteLength(value);
        
        if(HEADER + klen + vlen > filesize) {
            console.log('cannot allocate such large key and value');
            close();
            process.exit(314159);
        }
        if(cursor + HEADER + klen + vlen > filesize) {
            newfile();
        }
        
        var buffer = buffers[buffers.length - 1];
        index[key] = {
            file: files.length - 1,
            start: cursor + HEADER + klen,
            end: cursor + HEADER + klen + vlen,
        };
        buffer[cursor] = 0xff;
        buffer.writeint(klen, cursor + KLEN);
        buffer.writeint(vlen, cursor + VLEN);
        //buffer.write(key, cursor + HEADER, 'utf8');
        //value.copy(buffer, cursor + HEADER + klen);
        buffer.write(key + value, cursor + HEADER, 'utf8');
        cursor += HEADER + klen + vlen;
        buffer[cursor] = 0;
    }
    
    return {
        close: close,
        get: get,
        set: set,
        find: find,
    }
}

exports.open = open;
