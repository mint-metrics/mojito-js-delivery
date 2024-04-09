const CleanCSS = require('clean-css');
const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const zlib = require('zlib');
const { minify } = require('terser');
const cliTable = require('cli-table');
const config = require('../config');
const sendLifecycleEventsFn = require('./cli-send-lifecycle-events');

let args,
    builtWaves = {},
    changedConfigFiles = {},
    comparingCommits;
/**
 * build a test object
 * @param {String} configFile, config file path
 * @param {Object} buildResult, build result
 * @returns {String} final file contents
 */
function buildTest(configFile, buildResult) {
    let contents,
        testObject,
        dirname;

    dirname = path.dirname(configFile);
    testObject = yaml.load(fs.readFileSync(configFile, 'utf8'));
    sendLifecycleEvents(testObject, configFile);

    testObject = tokenizePaths(testObject);

    // skip inactive tests
    if (testObject.state == 'inactive') {
        return;
    }

    // prevent duplicated waves
    if (builtWaves[testObject.id]) {
        throw new Error(`Mojito Building - Duplicated waves "${testObject.id}" found in ${builtWaves[testObject.id]} and ${dirname}${path.sep}config.yml`);
    }

    builtWaves[testObject.id] = `${dirname}${path.sep}config.yml`;

    // remove private data from publishing
    if (testObject.private) {
        delete testObject.private;
    }

    buildResult[testObject.id] = {
        name: testObject.name,
        state: testObject.state
    };

    if (testObject.state == 'live' && testObject.divertTo != null) {
        buildResult[testObject.id].state = 'divert';
    }

    contents = JSON.stringify(testObject, null, 4);
    // inject file contents
    // shared js and css
    if (testObject.js) {
        contents = injectJSFile(testObject.js, contents, dirname);
    }

    if (testObject.css) {
        contents = injectCSSFile(testObject.css, contents, dirname);
    }

    // trigger
    if (testObject.trigger) {
        contents = injectJSFile(testObject.trigger, contents, dirname);
    }

    // recipes
    var recipes = testObject.recipes || {},
        recipe;
    for (var key in recipes) {
        recipe = recipes[key];

        if (recipe.js) {
            contents = injectJSFile(recipe.js, contents, dirname);
        }

        if (recipe.css) {
            contents = injectCSSFile(recipe.css, contents, dirname);
        }
    }

    contents = 'Mojito.addTest(' + contents + ');';
    buildResult[testObject.id].size = contents.length;

    return contents;
}

/**
 * tokenizing the file path, from "1.js" to "{{1.js}}"
 * @param {Object} testObject 
 * @returns {Object} tokenized object
 */
function tokenizePaths(testObject) {
    // shared js and css
    if ('js' in testObject) {
        if (testObject.js != '') {
            testObject.js = '{{' + testObject.js + '}}';
        }
        else {
            delete testObject.js;
        }
    }

    if ('css' in testObject) {
        if (testObject.css != '') {
            testObject.css = '{{' + testObject.css + '}}';
        }
        else {
            delete testObject.css;
        }
    }

    // trigger. TODO: throw error if trigger is undefined?
    if ('trigger' in testObject) {
        if (testObject.trigger != '') {
            testObject.trigger = '{{' + testObject.trigger + '}}';
        }
        else {
            delete testObject.trigger;
        }
    }

    // recipes
    var recipes = testObject.recipes || {},
        recipe;
    for (var key in recipes) {
        recipe = recipes[key];

        if ('js' in recipe) {
            if (recipe.js != '') {
                recipe.js = '{{' + recipe.js + '}}';
            }
            else {
                delete recipe.js;
            }
        }

        if ('css' in recipe) {
            if (recipe.css != '') {
                recipe.css = '{{' + recipe.css + '}}';
            }
            else {
                delete recipe.css;
            }
        }
    }

    return testObject;
}

/**
 * injecting JS file contents into test object
 * @param {String} jsPath, js file path 
 * @param {String} contents, current test object contents
 * @param {String} dirname, dirname of current config file
 * @returns {String} injected contents 
 */
function injectJSFile(jsPath, contents, dirname) {
    var filePath = jsPath.replace(/\{|\}/g, '');
    filePath = dirname + path.sep + filePath;

    if (!fileExists(filePath)) {
        throw new Error('Mojito Building - JS file not found, file name: ' + filePath);
    }

    try {
        var fileContents = fs.readFileSync(filePath, 'utf8');
        contents = contents.replace(new RegExp('"' + jsPath + '"', 'i'), function () {
            return fileContents;
        });

        return contents;
    }
    catch (error) {
        error.message = 'Mojito Building - Error occurred while reading file contents of ' + filePath + ' ' + error.message;
        throw error;
    }
}

/**
 * injecting and optimizing CSS file contents into test object
 * @param {String} cssPath, js file path 
 * @param {String} contents, current test object contents
 * @param {String} dirname, dirname of current config file
 * @returns {String} injected contents 
 */
function injectCSSFile(cssPath, contents, dirname) {
    var filePath = cssPath.replace(/\{|\}/g, '');
    filePath = dirname + path.sep + filePath;

    if (!fileExists(filePath)) {
        throw new Error('Mojito Building - CSS file not found, file name: ' + filePath);
    }

    try {
        var fileContents = fs.readFileSync(filePath, 'utf8');
        // optimizing CSS using clean-css
        fileContents = new CleanCSS({}).minify(fileContents).styles;
        // replace all '"' with '\"'
        fileContents = fileContents.replace(/"/g, '\\"');
        contents = contents.replace(new RegExp('"' + cssPath + '"', 'i'), function () {
            return '"' + fileContents + '"';
        });

        return contents;
    }
    catch (error) {
        error.message = 'Mojito Building - Error occurred while reading file contents of ' + filePath + ' ' + error.message;
        throw error;
    }
}

/**
 * check file existence
 * @param {String} pathname 
 * @returns {Boolean}
 */
function fileExists(pathname) {
    return fs.existsSync(pathname);
}

/**
 * output build result to the console
 */
function outputBuildResult (buildResult) {
    let table = new cliTable({
        head: ['ID', 'Name', 'State', 'Size (raw)', '% of container'],
        colAligns: ['left', 'left', 'left', 'left', 'right'],
        style: { head: ['white'] }
    });

    let experiments = buildResult.experiments||{},
        experiment,
        containerSize = buildResult.container.raw,
        experimentsCount = 0;
    for (let id in experiments) {
        experiment = experiments[id];
        table.push([
            id,
            experiment.name,
            experiment.state,
            (experiment.size/1024).toFixed(2) + 'kb',
            ((experiment.size/containerSize)*100).toFixed(1) + '%'
        ]);

        experimentsCount++;
    }

    if (buildResult.sharedCode) {
        table.push([
            '-',
            'Shared code',
            '-',
            (buildResult.sharedCode.size/1024).toFixed(2) + 'kb',
            ((buildResult.sharedCode.size/containerSize)*100).toFixed(1) + '%'
        ]);
    }
    
    table.push([
        '-',
        'Library code',
        '-',
        (buildResult.lib.size/1024).toFixed(2) + 'kb',
        ((buildResult.lib.size/containerSize)*100).toFixed(1) + '%'
    ]);

    console.log(table.toString());
    console.log();
    console.log('Container size (raw): ' + (containerSize/1024).toFixed(2) + 'kb');
    console.log('Container size (minified & gzipped): ' + (buildResult.container.minfiedAndGzipped/1024).toFixed(2) + 'kb');
    console.log('Experiments: ' + experimentsCount);
}

/**
 * insert duplicate container check
 * @param {String} content file
 */
function insertDuplicateContainerCheck(content) {
    if (config.allowMultiInstance) {
        return content;
    }

    let position = content.indexOf('Mojito =');
    if (position == -1) {
        position = content.indexOf('Mojito=');
    }

    content = content.substr(0, position) + 'if (!window.Mojito || !Mojito.testObjects || !Object.keys(Mojito.testObjects).length) {' + content.substring(position) + '}';
    
    return content;
}

function appendBuildInfo(containerData, content) {
    let buildInfo = '\nMojito.buildInfo=' + JSON.stringify(containerData) + ';';
    return content + '\r' + buildInfo;
}

function sendLifecycleEvents(testObject, configFile) {
    if (!args.trackLifecycleEvents || !(configFile in changedConfigFiles)) {
        return;
    }

    sendLifecycleEventsFn(args, {
        testObject: testObject,
        configFilePath: changedConfigFiles[configFile],
        comparingCommits: comparingCommits
    });
}

function parseChangedFileList(rootPath) {
    let changedFilePath = '/etc/mojito-changed-files.txt';
    let changedFleList = fs.readFileSync(changedFilePath, 'utf8').split('\n');

    let fileName;
    for (let i=0,c=changedFleList.length;i<c;i++) {
        fileName = path.join(rootPath, changedFleList[i].trim());
        if (fileName && fileName.endsWith('config.yml')) {
            changedConfigFiles[fileName] = changedFleList[i].trim();
        }
    }

    comparingCommits = fs.readFileSync('/etc/mojito-comparing-commits.txt', 'utf8');
}

/**
 * Mojito building - building test objects based on config.yml
 */
module.exports = async function build (cliArgs) {
    args = cliArgs||{};
    let containerName = config.containerName;
    let rootPath = process.cwd(),
        wavesPath = path.join(rootPath, 'lib', 'waves'),
        targetPath = path.join(rootPath, 'dist', 'assets', 'js');

    fs.rmSync(targetPath, { recursive: true, force: true });
    fs.mkdirSync(targetPath, { recursive: true });

    // is there a nuke.lock file?
    let hasNukeLock = fs.existsSync(path.join(rootPath, 'nuke.lock'));

    // list all config.yml files
    let configFiles = [];
    if (fileExists(wavesPath) && !hasNukeLock) {
        let waveFolders = fs.readdirSync(wavesPath),
            configFilePath;
        for (let i = 0, c = waveFolders.length; i < c; i++) {
            if (fs.statSync(path.join(wavesPath, waveFolders[i])).isFile()) {
                continue;
            }

            configFilePath = path.join(wavesPath, waveFolders[i], 'config.yml');
            if (!fileExists(configFilePath)) {
                continue;
            }

            configFiles.push(configFilePath);
        }

        if (args.trackLifecycleEvents) {
            parseChangedFileList(rootPath);
        }
    }

    let buildResult = {
        container: {},
        experiments: {}
    };

    let testObjectContents = [],
        content;
    for (let i = 0, c = configFiles.length; i < c; i++) {
        content = buildTest(configFiles[i], buildResult.experiments);
        if (content) {
            testObjectContents.push(content);
        }
    }

    let fileList = [
            {id: 'license', path: path.join(rootPath, 'license.txt')}, 
            {id: 'lib', putputFileSize: true, path: path.join(rootPath, 'lib', 'mojito.js')}, 
            {id: 'sharedCode', putputFileSize: true, path: path.join(rootPath, 'lib', 'shared-code.js')}
        ],
        targetContents = [];

    for (let i = 0, c = fileList.length; i < c; i++) {
        if (!fileExists(fileList[i].path)) {
            continue;
        }

        let fileContent = fs.readFileSync(fileList[i].path, 'utf8');
        targetContents.push(fileContent);

        if (fileList[i].putputFileSize) {
            buildResult[fileList[i].id] = {size: fileContent.length};
        }
    }

    if (testObjectContents.length) {
        targetContents.push(testObjectContents.join('\n'));
    }

    let targetContent = insertDuplicateContainerCheck(targetContents.join('\n'));
    buildResult['container'].raw = targetContent.length;

    let minifiedContent = await minify(targetContent, {output: {comments: false}});
    let finalContent = targetContents[0] + '\n' + minifiedContent.code;
    buildResult['container'].minfiedAndGzipped = zlib.gzipSync(finalContent, { level: 9 }).length;

    let containerData = {
        container: containerName,
        mojitoVersion: process.env.npm_package_version,
        size: {
            total: buildResult.container.raw,
            totalCompressed: buildResult.container.minfiedAndGzipped,
            lib: buildResult.lib.size,
            sharedCode: buildResult.sharedCode.size,
            experiments: {}
        },
        timestamp: (new Date()).toISOString()
    };

    for (let testId in buildResult.experiments) {
        containerData.size.experiments[testId] = buildResult.experiments[testId].size;
    }

    fs.writeFileSync(path.join(targetPath, containerName + '.pretty.js'), appendBuildInfo(containerData, targetContent));
    fs.writeFileSync(path.join(targetPath, containerName + '.js'), appendBuildInfo(containerData, finalContent));

    outputBuildResult(buildResult);
};