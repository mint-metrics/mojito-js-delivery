'use strict';
const yaml = require('js-yaml'),
    fs = require("fs");
const colorRed = '\x1b[31m',
    colorCyan = '\x1b[36m',
    colorReset = '\x1b[0m';

module.exports = function (args, cb)
{
    if (!checkArgs(args, cb)) {
        return;
    }

    let cmd = Object.keys(args)[0],
        waveId = args[cmd];

    if (cmd == 'divert') {
        divertTest(waveId, args.recipe, cb);
    }
    else {
        setTestState(waveId, cmd, args, cb);
    }
}

function setTestState(waveId, cmd, args, cb)
{
    let test;
    try {
        test = yaml.safeLoad(fs.readFileSync(`lib/waves/${waveId}/config.yml`, 'utf8'));
    }
    catch (e) {
        setTimeout(function ()
        {
            console.error(`${colorRed}%s${colorReset}`, `Failed to read lib/waves/${waveId}/config.yml: ${e.message}`);
        });
        cb(new Error(`Failed to read lib/waves/${waveId}/config.yml: ${e.message}`));
    }

    test.state = cmd;
    // change sampleRate to 1 for 'live', 0 for 'staging'
    if (cmd == 'live') {
        test.sampleRate = 1;
        // traffic 
        if (args.traffic != null)
        {
            let traffic = parseFloat(args.traffic);
            if (isNaN(traffic) || (traffic <=0 || traffic > 1))
            {
                setTimeout(function ()
                {
                    console.error(`${colorRed}%s${colorReset}`, `Traffic must be in range (0, 1].`);
                });
                cb(new Error(`Traffic must be in range (0, 1].`));

                return;
            }
            test.sampleRate = traffic;
        }
    }
    else if (cmd == 'staging') {
        test.sampleRate = 0;
    }

    fs.writeFileSync(`lib/waves/${waveId}/config.yml`, yaml.dump(test));
    setTimeout(function ()
    {
        console.log(
            `%s${colorCyan}%s${colorReset}%s${colorCyan}%s${colorReset}%s`, 'Test ', waveId, ' has been changed to ', cmd, ' successfully.');
    });
    cb();
}

function divertTest(waveId, recipe, cb)
{
    let test;
    try {
        test = yaml.safeLoad(fs.readFileSync(`lib/waves/${waveId}/config.yml`, 'utf8'));
    }
    catch (e) {
        setTimeout(function ()
        {
            console.error(`${colorRed}%s${colorReset}`, `Failed to read lib/waves/${waveId}/config.yml: ${e.message}`);
        });
        cb(new Error(`Failed to read lib/waves/${waveId}/config.yml: ${e.message}`));
        return;
    }

    // test must be live
    if (test.state != 'live')
    {
        setTimeout(function ()
        {
            console.error(`${colorRed}%s${colorReset}`, `Test must be live.`);
        });
        cb(new Error(`Test must be live.`));
        return;
    }

    // recipe existence
    let recipeObject;
    for (let p in test.recipes) {
        if (p == recipe) {
            recipeObject = test.recipes[p];
        }
    }

    if (!recipeObject) {
        setTimeout(function ()
        {
            console.error(`${colorRed}%s${colorReset}`, `The recipe ${recipe} doesn't exist.`);
        });
        cb(new Error(`The recipe ${recipe} doesn't exist.`));
        return;
    }

    test.divertTo = recipe;
    fs.writeFileSync(`lib/waves/${waveId}/config.yml`, yaml.dump(test));
    setTimeout(function ()
    {
        console.log(
            `%s${colorCyan}%s${colorReset}%s${colorCyan}%s${colorReset}%s`, 'Test ', waveId, ' has been diverted to ', `${recipe} (${recipeObject.name})`, ' successfully.');
    });
    cb();
}

function checkArgs(args, cb)
{
    let keys = Object.keys(args),
        cmd = keys[0];

    if (cmd == 'divert' || cmd == 'live') {
        if (keys.length > 2) {
            usage();
            cb(new Error(`Invalid parameters.`));
            return false;
        }
    }
    else if (keys.length > 1) {
        usage();
        cb(new Error(`Invalid parameters.`));
        return false;
    }

    if (cmd != 'live' && cmd != 'staging' && cmd != 'inactive' && cmd != 'divert') {
        usage();
        cb(new Error(`Invalid state: ${cmd}.`));
        return false;
    }

    // wave id validation
    let waveId = args[cmd];
    if (waveId == null || /[<>:"|?*]/.test(waveId)) {
        console.warn(`${colorRed}%s${colorReset}`, 'Please specify an valid wave id.');
        cb(new Error(`Please specify an valid wave id.`));
        return false;
    }

    // wave existence
    if (!fs.existsSync(`lib/waves/${waveId}/config.yml`)) {
        console.warn(`${colorRed}%s${colorReset}`, `Wave id ${waveId} doesn't exist.`);
        cb(new Error(`Wave id ${waveId} doesn't exist.`));
        return false;
    }

    // divert recipe
    if (cmd == 'divert' && args['recipe'] == null) {
        console.warn(`${colorRed}%s${colorReset}`, 'Please specify a recipe id.');
        cb(new Error(`Please specify a recipe id.`));
        return false;
    }

    return true;
}

function usage()
{
    console.log(`${colorRed}%s${colorReset}`, 'Invalid parameters.');
    console.warn('Usage:');
    console.warn('  gulp set --live {{wave id}} --traffic {{simple rate}}');
    console.warn('  gulp set --staging {{wave id}}');
    console.warn('  gulp set --inactive {{wave id}}');
    console.warn('  gulp set --divert {{wave id}} -recipe {{recipe id}}');
}