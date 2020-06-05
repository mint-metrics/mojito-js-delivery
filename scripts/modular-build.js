'use strict';
const through = require('through2');
const PluginError = require('plugin-error');
const CleanCSS = require('clean-css');
const path = require('path');
const fs = require("fs");
const PLUGIN_NAME = 'mojito-modular-build';

// Mojito building - building test objects based on config.yml
let waves = {};
module.exports = function (buildResult)
{
	return through.obj(function (file, enc, callback)
	{
		const stream = this;
		file.contents = buildTest(file, stream, buildResult);
		file.path = renameDestFile(file.path);
		stream.push(file);
		callback();
	});
};

/**
 * build a test object
 * @param {File} file, config file
 * @param {Stream} stream, gulp stream
 * @returns {Buffer} final file contents
 */
function buildTest(file, stream, buildResult)
{
	var contents,
		testObject,
		dirname;
	try
	{
		dirname = path.dirname(file.path);
		contents = String(file.contents);
		testObject = tokenizePaths(JSON.parse(contents));

		// skip inactive tests
		if (testObject.state == 'inactive')
		{
			buildResult.inactive ++;
			return Buffer.from('');
		}

		// prevent duplicated waves
		if (waves[testObject.id])
		{
			throw new Error(`Mojito Building - Duplicated waves "${testObject.id}" found in ${waves[testObject.id]} and ${dirname}${path.sep}config.yml`);
		}

		waves[testObject.id] = `${dirname}${path.sep}config.yml`;

		// remove private data from publishing
		if (testObject.private) {
			delete testObject.private;
		}

		if (testObject.state == 'live')
		{
			if (testObject.divertTo != null)
			{
				buildResult.divertList.push(testObject.id);
			}
			else 
			{
				buildResult.liveList.push(testObject.id);
			}
		}
		else
		{
			buildResult.stagingList.push(testObject.id);
		}
		
		contents = JSON.stringify(testObject, null, 4);
		// inject file contents
		// shared js and css
		if (testObject.js)
		{
			contents = injectJSFile(testObject.js, contents, dirname);
		}

		if (testObject.css)
		{
			contents = injectCSSFile(testObject.css, contents, dirname);
		}

		// trigger
		if (testObject.trigger)
		{
			contents = injectJSFile(testObject.trigger, contents, dirname);
		}

		// recipes
		var recipes = testObject.recipes||{},
			recipe;
		for (var key in recipes)
		{
			recipe = recipes[key];

			if (recipe.js)
			{
				contents = injectJSFile(recipe.js, contents, dirname);
			}

			if (recipe.css)
			{
				contents = injectCSSFile(recipe.css, contents, dirname);
			}
		} 

		contents = 'Mojito.addTest(' + contents + ');';
		return Buffer.from(contents);
	}
	catch (error)
	{
		stream.emit('error', getError(error));
		return Buffer.from('');
	}
}

/**
 * tokenizing the file path, from "1.js" to "{{1.js}}"
 * @param {Object} testObject 
 * @returns {Object} tokenized object
 */
function tokenizePaths(testObject)
{
	// shared js and css
	if ('js' in testObject)
	{
		if (testObject.js != '')
		{
			testObject.js = '{{' + testObject.js + '}}';
		}
		else
		{
			delete testObject.js;
		}
	}

	if ('css' in testObject)
	{
		if (testObject.css != '')
		{
			testObject.css = '{{' + testObject.css + '}}';
		}
		else
		{
			delete testObject.css;
		}
	}

	// trigger. TODO: throw error if trigger is undefined?
	if ('trigger' in testObject)
	{
		if (testObject.trigger != '')
		{
			testObject.trigger = '{{' + testObject.trigger + '}}';
		}
		else
		{
			delete testObject.trigger;
		}
	}

	// recipes
	var recipes = testObject.recipes||{},
		recipe;
	for (var key in recipes)
	{
		recipe = recipes[key];

		if ('js' in recipe)
		{
			if (recipe.js != '')
			{
				recipe.js = '{{' + recipe.js + '}}';
			}
			else
			{
				delete recipe.js;
			}
		}

		if ('css' in recipe)
		{
			if (recipe.css != '')
			{
				recipe.css = '{{' + recipe.css + '}}';
			}
			else
			{
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
function injectJSFile(jsPath, contents, dirname)
{
	var filePath = jsPath.replace(/\{|\}/g,'');
	filePath = dirname + path.sep + filePath;

	if (!fileExists(filePath))
	{
		throw new Error('Mojito Building - JS file not found, file name: ' + filePath);
	}

	try
	{
		var fileContents = fs.readFileSync(filePath, 'utf8');
		contents = contents.replace(new RegExp('"' + jsPath + '"', 'i'), function(){
			return fileContents;
		});
		
		return contents;
	}
	catch (error)
	{
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
function injectCSSFile(cssPath, contents, dirname)
{
	var filePath = cssPath.replace(/\{|\}/g,'');
	filePath = dirname + path.sep + filePath;

	if (!fileExists(filePath))
	{
		throw new Error('Mojito Building - CSS file not found, file name: ' + filePath);
	}

	try
	{
		var fileContents = fs.readFileSync(filePath, 'utf8');
		// optimizing CSS using clean-css
		fileContents = new CleanCSS({}).minify(fileContents).styles;
		// replace all '"' with '\"'
		fileContents = fileContents.replace(/"/g, '\\"');
		contents = contents.replace(new RegExp('"' + cssPath + '"', 'i'),function(){
			return '"' + fileContents + '"';
		});
		
		return contents;
	}
	catch (error)
	{
		error.message = 'Mojito Building - Error occurred while reading file contents of ' + filePath + ' ' + error.message;
		throw error;
	}
}

/**
 * check file existence
 * @param {String} pathname 
 * @returns {Boolean}
 */
function fileExists(pathname)
{
	return fs.existsSync(pathname);
}

/**
 * construct a PluginError from a js error object
 * @param {Error} error 
 * @returns {PluginError}
 */
function getError(error)
{
	return new PluginError(PLUGIN_NAME, error, { showStack: true });
}

/**
 * rename the file name to test-object.js
 * @param {String} current file path 
 * @returns {String} renamed path
 */
function renameDestFile(npath, ext)
{
	return path.join(path.dirname(npath), 'test-object.js');
}