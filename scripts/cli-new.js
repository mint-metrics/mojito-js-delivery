'use strict';
const yaml = require('js-yaml'),
    fs = require('fs');
const colorRed = '\x1b[31m',
    colorCyan = '\x1b[36m',
    colorReset = '\x1b[0m';

module.exports = function (args) {
    if (!checkArgs(args)) {
        return;
    }

    let cmd = Object.keys(args)[0],
        waveId = args[cmd];

    createTest(cmd, waveId);
}

function testExists(waveId) {
    // lib/waves/{wave id} folder must be empty
    let baseFolder = 'lib/waves/';
    if (!fs.existsSync(baseFolder)) {
        return false;
    }

    let waveFolder = baseFolder + waveId,
        folderExist = fs.existsSync(waveFolder);
    if (folderExist && fs.readdirSync(waveFolder).length) {
        setTimeout(function () {
            console.warn(`${colorRed}%s${colorReset}`, `The folder ${waveFolder} already exists.`);
        });
        return true;
    }

    // scan each config.yml file to make sure there are no clashing waveIds defined in the YAML
    let waves = fs.readdirSync(baseFolder),
        test,
        exist = false,
        wave;

    for (wave of waves) {
        if (!fs.existsSync(`${baseFolder}${wave}/config.yml`)) {
            continue;
        }

        try {
            test = yaml.safeLoad(fs.readFileSync(`${baseFolder}${wave}/config.yml`, 'utf8'));
        }
        catch (e) {
            continue;
        }

        if (test.state == 'inactive' || test.id != waveId) {
            continue;
        }

        exist = true;
        break;
    }

    if (exist) {
        setTimeout(function () {
            console.warn(`${colorRed}%s${colorReset}`, `Duplicated wave ${waveId} found in ${baseFolder}${wave}/config.yml.`);
        });
    }

    return exist;
}

function createTest(cmd, waveId) {
    // lib/waves/{wave id} folder must be empty
    let waveFolder = 'lib/waves/' + waveId;
    if (testExists(waveId)) {
        return;
    }

    if (!fs.existsSync(waveFolder)) {
        fs.mkdirSync(waveFolder, { recursive: true });
    }

    if (cmd == 'ab') {
        createABTest(waveId);
    }
    else if (cmd == 'demo') {
        createDemoTest(waveId);
    }
    else if (cmd == 'aa') {
        createAATest(waveId);
    }
}

function createABTest(waveId) {
    let waveFolder = 'lib/waves/' + waveId;
    // config.yml
    let test = {
        state: 'staging',
        sampleRate: 0,
        id: waveId,
        name: waveId + ' scaffold',
        recipes: {
            '0': {
                name: 'Control'
            },
            '1': {
                name: 'Treatment',
                js: '1.js'
            }
        },
        trigger: 'trigger.js'
    };

    fs.writeFileSync(waveFolder + '/config.yml', yaml.dump(test));
    // recipe js
    let content =
        `function treatment (test) {
    console.log('Test id: ' + test.options.id, ', name: ' + test.options.name, ', chosen recipe: ' + test.chosenRecipe.id);
}`;
    fs.writeFileSync(waveFolder + '/1.js', content);

    // trigger
    content =
        `function trigger (test) {
    Mojito.utils.domReady(test.activate);
}`;
    fs.writeFileSync(waveFolder + '/trigger.js', content);

    setTimeout(function () {
        console.log(`%s${colorCyan}%s${colorReset}%s`, 'Test ', waveId, ` has been created successfully.`);
    });
}

function createDemoTest(waveId) {
    let waveFolder = 'lib/waves/' + waveId;
    // config.yml
    let test = {
        state: 'staging',
        sampleRate: 0,
        id: waveId,
        name: waveId + ' scaffold',
        recipes: {
            '0': {
                name: 'Control'
            },
            '1': {
                name: 'Treatment',
                js: '1.js',
                css: '1.css'
            }
        },
        trigger: 'trigger.js'
    };

    fs.writeFileSync(waveFolder + '/config.yml', yaml.dump(test));
    // recipe js
    let content =
        `function treatment (test) {
    console.log('Test id: ' + test.options.id, ', name: ' + test.options.name, ', chosen recipe: ' + test.chosenRecipe.id);
}`;
    fs.writeFileSync(waveFolder + '/1.js', content);
    // recipe css
    content =
        `body {
    letter-spacing: 2px;
}`;
    fs.writeFileSync(waveFolder + '/1.css', content);

    // trigger
    content =
        `function trigger (test) {
    Mojito.utils.domReady(test.activate);
}`;
    fs.writeFileSync(waveFolder + '/trigger.js', content);

    setTimeout(function () {
        console.log(`%s${colorCyan}%s${colorReset}%s`, 'Test ', waveId, ` has been created successfully.`);
    });
}

function createAATest(waveId) {
    let waveFolder = 'lib/waves/' + waveId;
    // config.yml
    let test = {
        state: 'staging',
        sampleRate: 0,
        id: waveId,
        name: waveId + ' scaffold',
        recipes: {
            '0': {
                name: 'Control'
            },
            '1': {
                name: 'Treatment'
            }
        },
        trigger: 'trigger.js'
    };

    fs.writeFileSync(waveFolder + '/config.yml', yaml.dump(test));
    // trigger
    let content =
        `function trigger (test) {
    test.activate();
}`;
    fs.writeFileSync(waveFolder + '/trigger.js', content);

    setTimeout(function () {
        console.log(`%s${colorCyan}%s${colorReset}%s`, 'Test ', waveId, ` has been created successfully.`);
    });
}

function checkArgs(args) {
    let keys = Object.keys(args);
    if (keys.length > 1) {
        setTimeout(usage);
        return false;
    }

    let paraName = keys[0];
    if (paraName != 'ab' && paraName != 'demo' && paraName != 'aa') {
        setTimeout(usage);
        return false;
    }

    // wave id validation
    if (args[paraName] == null || /[<>:"|?*]/.test(args[paraName])) {
        setTimeout(function () {
            console.warn(`${colorRed}%s${colorReset}`, 'Please specify an valid wave id.');
        });
        return false;
    }

    return true;
}

function usage() {
    console.warn(`${colorRed}%s${colorReset}`, 'Invalid parameters.');
    console.warn('Usage:');
    console.warn('  npm run new -- --ab {{wave id}}');
    console.warn('  npm run new -- --demo {{wave id}}');
    console.warn('  npm run new -- --aa {{wave id}}');
}