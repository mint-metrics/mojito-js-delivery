'use strict';
const setCli = require('./cli-set');
const colorRed = '\x1b[31m',
    colorReset = '\x1b[0m';
    
// Start/Stop/Archive a test
module.exports = function (args, cb)
{
    if (!checkArgs(args, cb)) {
        return;
    }

    let argsSet = {};
    argsSet[args.state] = args.waveId;

    if (args.state == 'live')
    {
        argsSet.traffic = args.traffic
    }

    if (args.state == 'divert')
    {
        argsSet.recipe = args.recipe
    }

    setCli(argsSet, cb);
}

function checkArgs(args, cb)
{
    let keys = Object.keys(args),
        waveId = args.waveId;
    
    if (!waveId)
    {
        usage();
        cb(new Error('Invalid wave id.'));
        return false;
    }

    let state = args.state;

    if (state != 'live' && state != 'staging' && state != 'inactive' && state != 'divert') {
        usage();
        cb(new Error(`Invalid state: ${state}.`));
        return false;
    }

    if (state == 'divert' || state == 'live') {
        if (keys.length < 3) {
            usage();
            cb(new Error('Invalid parameters.'));
            return false;
        }
    }

    return true;
}

function usage()
{
    console.log(`${colorRed}%s${colorReset}`, 'Invalid parameters.');
    console.warn('Usage:');
    console.warn('  gulp ssa --state staging|live|inactive|divert --waveId {{wave id}} --traffic {{simple rate}} --recipe {{recipe id}}');
}