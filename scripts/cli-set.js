'use strict';
const yaml = require('js-yaml'),
    fs = require("fs");
const colorRed = '\x1b[31m',
    colorCyan = '\x1b[36m',
    colorReset = '\x1b[0m';

module.exports = function (args) {
    if (!checkArgs(args)) {
        return;
    }

    let cmd = args.state,
        waveId = args.waveId;

    if (cmd == 'divert') {
        divertTest(waveId, args.recipe);
    }
    else {
        setTestState(waveId, cmd, args);
    }
}

function setTestState(waveId, cmd, args) {
    let test;
    try {
        test = yaml.load(fs.readFileSync(`lib/waves/${waveId}/config.yml`, 'utf8'));
    }
    catch (e) {
        setTimeout(function () {
            console.error(`${colorRed}%s${colorReset}`, `Failed to read lib/waves/${waveId}/config.yml: ${e.message}`);
        });
        throw new Error(`Failed to read lib/waves/${waveId}/config.yml: ${e.message}`);
    }

    test.state = cmd;
    // change sampleRate to 1 for 'live', 0 for 'staging'
    if (cmd == 'live') {
        test.sampleRate = 1;
        // traffic 
        if (args.traffic != null) {
            let traffic = parseFloat(args.traffic);
            if (isNaN(traffic) || (traffic <= 0 || traffic > 1)) {
                setTimeout(function () {
                    console.error(`${colorRed}%s${colorReset}`, `Traffic must be in range (0, 1].`);
                });
                throw new Error(`Traffic must be in range (0, 1].`);
            }
            test.sampleRate = traffic;
        }
    }
    else if (cmd == 'staging') {
        test.sampleRate = 0;
    }

    fs.writeFileSync(`lib/waves/${waveId}/config.yml`, yaml.dump(test));
    setTimeout(function () {
        console.log(
            `%s${colorCyan}%s${colorReset}%s${colorCyan}%s${colorReset}%s`, 'Test ', waveId, ' has been changed to ', cmd, ' successfully:', `./lib/waves/${waveId}/config.yml`);
    });
}

function divertTest(waveId, recipe) {
    let test;
    try {
        test = yaml.load(fs.readFileSync(`lib/waves/${waveId}/config.yml`, 'utf8'));
    }
    catch (e) {
        setTimeout(function () {
            console.error(`${colorRed}%s${colorReset}`, `Failed to read lib/waves/${waveId}/config.yml: ${e.message}`);
        });
        throw new Error(`Failed to read lib/waves/${waveId}/config.yml: ${e.message}`);
    }

    // test must be live
    if (test.state != 'live') {
        setTimeout(function () {
            console.error(`${colorRed}%s${colorReset}`, `Test must be live.`);
        });
        throw new Error(`Test must be live.`);
    }

    // recipe existence
    let recipeObject;
    for (let p in test.recipes) {
        if (p == recipe) {
            recipeObject = test.recipes[p];
        }
    }

    if (!recipeObject) {
        setTimeout(function () {
            console.error(`${colorRed}%s${colorReset}`, `The recipe ${recipe} doesn't exist.`);
        });
        throw new Error(`The recipe ${recipe} doesn't exist.`);
    }

    test.divertTo = recipe;
    fs.writeFileSync(`lib/waves/${waveId}/config.yml`, yaml.dump(test));
    setTimeout(function () {
        console.log(
            `%s${colorCyan}%s${colorReset}%s${colorCyan}%s${colorReset}%s`, 'Test ', waveId, ' has been diverted to ', `${recipe} (${recipeObject.name})`, ' successfully:', `./lib/waves/${waveId}/config.yml`);
    });
}

function checkArgs(args) {
    let keys = Object.keys(args),
        cmd = args.state;

    if (cmd == 'divert' || cmd == 'live') {
        if (keys.length > 3) {
            usage();
            throw new Error(`Invalid parameters.`);
        }
    }
    else if (keys.length > 2) {
        usage();
        throw new Error(`Invalid parameters.`);
    }

    if (cmd != 'live' && cmd != 'staging' && cmd != 'inactive' && cmd != 'divert') {
        usage();
        throw new Error(`Invalid state: ${cmd}.`);
    }

    // wave id validation
    let waveId = args.waveId;
    if (waveId == null || /[<>:"|?*]/.test(waveId)) {
        console.warn(`${colorRed}%s${colorReset}`, 'Please specify an valid wave id.');
        throw new Error(`Please specify an valid wave id.`);
    }

    // wave existence
    if (!fs.existsSync(`lib/waves/${waveId}/config.yml`)) {
        console.warn(`${colorRed}%s${colorReset}`, `Wave id ${waveId} doesn't exist.`);
        throw new Error(`Wave id ${waveId} doesn't exist.`);
    }

    // divert recipe
    if (cmd == 'divert' && args['recipe'] == null) {
        console.warn(`${colorRed}%s${colorReset}`, 'Please specify a recipe id.');
        throw new Error(`Please specify a recipe id.`);
    }

    return true;
}

function usage() {
    console.log(`${colorRed}%s${colorReset}`, 'Invalid parameters.');
    console.warn('Usage:');
    console.warn('  npm run set -- live --waveId {{wave id}} --traffic {{simple rate}}');
    console.warn('  npm run set -- staging --waveId {{wave id}}');
    console.warn('  npm run set -- inactive --waveId {{wave id}}');
    console.warn('  npm run set -- divert --waveId {{wave id}} --recipe {{recipe id}}');
}