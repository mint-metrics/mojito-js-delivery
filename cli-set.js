const yaml = require('js-yaml'),
	fs = require("fs");
const colorRed = '\x1b[31m',
    colorCyan = '\x1b[36m',
	colorReset = '\x1b[0m';

module.exports = function(args, cb)
{
    if (!checkArgs(args, cb))
    {
        return;
    }

    let cmd = Object.keys(args)[0],
        waveId = args[cmd];
    
    if (cmd == 'divert')
    {
        divertTest(waveId, args.recipe, cb);
    }
    else
    {
        setTestState(waveId, cmd, cb);
    }
}

function setTestState(waveId, cmd, cb)
{
    let test;
    try 
    {
        test = yaml.safeLoad(fs.readFileSync(`lib/waves/${waveId}/config.yml`, 'utf8'));
    } 
    catch (e) 
    {
        setTimeout(function(){
            console.error(`${colorRed}%s${colorReset}`, `Failed to read lib/waves/${waveId}/config.yml: ${e.message}`);
        });
        cb();
    }

    test.state = cmd;
    // change sampleRate to 1 for 'live', 0 for 'staging'
    if (cmd == 'live')
    {
        test.sampleRate = 1;
    }
    else if (cmd == 'staging')
    {
        test.sampleRate = 0;
    }

    fs.writeFileSync(`lib/waves/${waveId}/config.yml`, yaml.dump(test));
    setTimeout(function(){
        console.log(
            `%s${colorCyan}%s${colorReset}%s${colorCyan}%s${colorReset}%s`, 'Test ', waveId, ' has been changed to ', cmd, ' successfully.');
    });
    cb();
}

function divertTest(waveId, recipe, cb)
{
    let test;
    try 
    {
        test = yaml.safeLoad(fs.readFileSync(`lib/waves/${waveId}/config.yml`, 'utf8'));
    } 
    catch (e) 
    {
        setTimeout(function(){
            console.error(`${colorRed}%s${colorReset}`, `Failed to read lib/waves/${waveId}/config.yml: ${e.message}`);
        });
        cb();
        return;
    }

    // recipe existence
    let recipeObject;
    for (let p in test.recipes)
    {
        if (p == recipe)
        {
            recipeObject = test.recipes[p];
        }
    }

    if (!recipeObject)
    {
        setTimeout(function(){
            console.error(`${colorRed}%s${colorReset}`, `The recipe ${recipe} doesn't exist.`);
        });
        cb();
        return;
    }

    test.divertTo = recipe;
    fs.writeFileSync(`lib/waves/${waveId}/config.yml`, yaml.dump(test));
    setTimeout(function(){
        console.log(
            `%s${colorCyan}%s${colorReset}%s${colorCyan}%s${colorReset}%s`, 'Test ', waveId, ' has been diverted to ', `${recipe} (${recipeObject.name})`, ' successfully.');
    });
    cb();
}

function checkArgs(args, cb)
{
	let keys = Object.keys(args),
		cmd = keys[0];

	if (cmd == 'divert')
	{
		if (keys.length > 2)
		{
			setTimeout(usages);
			cb();
			return false;
		}
	}
	else if (keys.length > 1)
    {
        setTimeout(usages);
        cb();
        return false;
    }

    if (cmd != 'live' && cmd != 'staging' && cmd != 'inactive' && cmd != 'divert')
    {
        setTimeout(usages);
        cb();
        return false;
    }

	// wave id validation
	let waveId = args[cmd];
    if (waveId == null || /[<>:"|?*]/.test(waveId))
    {
        setTimeout(function(){
            console.warn(`${colorRed}%s${colorReset}`, 'Please specify a valid wave id.');
        });
        cb();
        return false;
	}
	
	// wave existence
	if (!fs.existsSync(`lib/waves/${waveId}/config.yml`))
	{
		setTimeout(function(){
            console.warn(`${colorRed}%s${colorReset}`, `Wave id ${waveId} doesn't exist.`);
        });
        cb();
        return false;
    }
    
    // divert recipe
    if (cmd == 'divert' && args['recipe'] == null)
    {
        setTimeout(function(){
            console.warn(`${colorRed}%s${colorReset}`, 'Please specify a recipe id.');
        });
        cb();
        return false;
    }

    return true;
}

function usages()
{
    console.log(`${colorRed}%s${colorReset}`, 'Invalid parameters.');
    console.warn('Usages:');
    console.warn('  gulp set -live {{wave id}}');
    console.warn('  gulp set -staging {{wave id}}');
	console.warn('  gulp set -inactive {{wave id}}');
	console.warn('  gulp set -divert {{wave id}} -recipe {{recipe id}}');
}