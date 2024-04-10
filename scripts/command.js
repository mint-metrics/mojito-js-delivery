const path = require('path');
const fs = require('fs');
const mojitoBuild = require('./cli-build');
const runTests = require('./run-tests');
const publish = require('./cli-publish');
const newCli = require('./cli-new');
const setCli = require('./cli-set');

// Check whether config exists & create it if not.
for (const file of [path.join(process.cwd(), 'config.js'), path.join(process.cwd(), 'lib', 'shared-code.js')]) {
    !fs.existsSync(file) && 
    fs.existsSync(file.replace('.js', '.example.js')) && 
    fs.copyFileSync(file.replace('.js', '.example.js'), file);
}

const colorRed = '\x1b[31m',
    colorReset = '\x1b[0m';
const validCommands = ['build', 'test', 'publish', 'deploy', 'new', 'set'];

function parseCLIArgs(defaultNull) {
    let validTestStates = {
        inactive: 1,
        staging: 1,
        live: 1,
        divert: 1
    };

    let argList = process.argv;
    let args = {}, i, opt, thisOpt, curOpt;
    for (i = 0; i < argList.length; i++) {
        thisOpt = argList[i].trim();
        opt = thisOpt.replace(/^\-+/, '');

        if (opt === thisOpt) {
            // argument value
            if (curOpt) {
                args[curOpt] = opt;
            } else {
                if (defaultNull && validTestStates[opt]) {
                    args['state'] = opt;
                }
            }

            curOpt = null;
        }
        else {
            // argument name
            curOpt = opt;
            args[curOpt] = defaultNull ? null : true;
        }
    }

    if (defaultNull) {
        delete args.command;
    }

    return args;
}

function usage() {
    console.warn(`${colorRed}%s${colorReset}`, 'Invalid parameters.');
    console.warn('Usage:');
    console.warn('  npm run build');
    console.warn('  npm run test');
    console.warn('  npm run publish');
    console.warn('  npm run deploy');
    console.warn('  npm run new');
    console.warn('  npm run set');
}

async function runCommand() {
    let args = parseCLIArgs();
    let command = args.command||'build';
    if (validCommands.indexOf(command) < 0) {
        usage();
        return;
    }
    
    switch (command) {
        case 'build':
            mojitoBuild(args);
            break;
        case 'test':
            runTests();
            break;
        case 'publish':
            publish(args);
            break;
        case 'deploy':
            await mojitoBuild();
            await publish(args);
            break;
        case 'new':
            newCli(parseCLIArgs(true));
            break;
        case 'set':
            setCli(parseCLIArgs(true));
            break;
    }
}

runCommand();