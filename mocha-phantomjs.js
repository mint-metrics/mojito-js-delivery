'use strict';
// based on https://github.com/mrhooray/gulp-mocha-phantomjs
const fs = require('fs');
const path = require('path');
const url = require('url');
const spawn = require('child_process').spawn;
const through = require('through2');
const PluginError = require('plugin-error');

const pluginName = 'mocha-phantomjs';

function extend() {
    let target = {};

    for (let i = 0; i < arguments.length; i++) {
        let source = arguments[i];

        for (let key in source) {
            if (source.hasOwnProperty(key)) {
                target[key] = source[key];
            }
        }
    }

    return target;
}

function mochaPhantomJS(options) {
    options = options || {};

    let scriptPath = lookup('mocha-phantomjs-core/mocha-phantomjs-core.js');

    if (!scriptPath) {
        throw new PluginError(pluginName, 'mocha-phantomjs-core.js not found', { showStack: true });
    }

    return through.obj(function (file, enc, cb) {
        let args = [
            scriptPath,
            toURL(file.path, options.mocha),
            options.reporter || 'spec',
            JSON.stringify(options.phantomjs || {})
        ];

        spawnPhantomJS(args, options, this, function (err) {
            if (err) {
                return cb(err);
            }

            this.push(file);

            cb();
        }.bind(this));
    });
}

function toURL(path, query) {
    let parsed = url.parse(path, true);

    parsed.query = extend(parsed.query, query);
    parsed.search = null;

    if (['http:', 'https:', 'file:'].indexOf(parsed.protocol) > -1) {
        return url.format(parsed);
    } else {
        return fileURL(url.format(parsed));
    }
}

function fileURL(str) {
    let pathName = path.resolve(str).replace(/\\/g, '/');

    // for windows
    if (pathName[0] !== '/') {
        pathName = '/' + pathName;
    }

    return encodeURI('file://' + pathName);
}

function spawnPhantomJS(args, options, stream, cb) {
    // in case npm is started with --no-bin-links
    let phantomjsPath = lookup('.bin/phantomjs', true) || lookup('phantomjs-prebuilt/bin/phantomjs', true);

    if (!phantomjsPath) {
        return cb(new PluginError(pluginName, 'PhantomJS not found', { showStack: true }));
    }

    let phantomjs = spawn(phantomjsPath, args);

    if (options.dump) {
        phantomjs.stdout.pipe(fs.createWriteStream(options.dump, {flags: 'a'}));
    }

    if (!options.suppressStdout) {
        phantomjs.stdout.pipe(process.stdout);
    }

    if (!options.suppressStderr) {
        phantomjs.stderr.pipe(process.stderr);
    }

    phantomjs.stdout.on('data', stream.emit.bind(stream, 'phantomjsStdoutData'));
    phantomjs.stdout.on('end', stream.emit.bind(stream, 'phantomjsStdoutEnd'));

    phantomjs.stderr.on('data', stream.emit.bind(stream, 'phantomjsStderrData'));
    phantomjs.stderr.on('end', stream.emit.bind(stream, 'phantomjsStderrEnd'));

    phantomjs.on('error', stream.emit.bind(stream, 'phantomjsError'));
    phantomjs.on('exit', stream.emit.bind(stream, 'phantomjsExit'));

    phantomjs.on('error', function (err) {
        cb(new PluginError(pluginName, err.message, { showStack: true }));
    });

    phantomjs.on('exit', function (code) {
        if (code === 0 || options.silent) {
            cb();
        } else {
            cb(new PluginError(pluginName, 'test failed. phantomjs exit code: ' + code, { showStack: true }));
        }
    });
}

function lookup(path, isExecutable) {
    for (let i = 0 ; i < module.paths.length; i++) {
        let absPath = require('path').join(module.paths[i], path);
        if (isExecutable && process.platform === 'win32') {
            absPath += '.cmd';
        }
        if (fs.existsSync(absPath)) {
            return absPath;
        }
    }
}

module.exports = mochaPhantomJS;