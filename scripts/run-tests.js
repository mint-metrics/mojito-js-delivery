'use strict';
const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const chromeLauncher = require('chrome-launcher');
const serverPort = 12300;

module.exports = async function ()
{
	// Chrome do not support cookies for local files (file://), so we need to start a local web server to host the test suite file.
    let localServer = startLocalServer();
	let chromePath = chromeLauncher.getChromePath();

	const browser = await puppeteer.launch({
        ignoreHTTPSErrors: true,
        headless: true,
        executablePath: chromePath
    });

    const page = await browser.newPage();
	await page.exposeFunction('onTestResult', outputTestResult);

	var addListener = function(type) 
	{
		return page.evaluateOnNewDocument((type) => {
			document.addEventListener(type, (e) => {
				window.onTestResult({type, detail: e.detail});
			});
		}, type);
	};

	await addListener('testResult');
    await page.goto(`http://127.0.0.1:${serverPort}/tests/test_suite.html`);
	// wait for Mocha tests complete
	const watcher = page.waitForFunction(() => {return window.testCompleted == true});

	await watcher;
	await browser.close();

	return localServer.close();
}

function startLocalServer()
{
	const server = http.createServer((req, res) => {
		let reqPath = url.parse(req.url).pathname;
		reqPath = path.join(process.cwd(), reqPath);

		try 
		{
			let stats = fs.statSync(reqPath);
			if (stats.isFile()) 
			{
				let file = fs.readFileSync(reqPath);
				res.end(file);
			} 
			else 
			{
				res.end();
			}
		} 
		catch (err) 
		{
			res.writeHead(404, "Not Found");
			res.end();
		}
	});
	
	const hostname = '127.0.0.1';
	server.listen(serverPort, hostname);

	return server;
}

let lastSuite;
let passCount = 0;
let failCount = 0;
let duration = 0;
function outputTestResult(e)
{
	let detail = e.detail;
	if (detail.suite && lastSuite != detail.suite)
	{
		if (lastSuite)
		{
			console.log();
		}

		console.log('  ' + detail.suite||'');
		lastSuite = detail.suite;
	}

	if (detail.type == 'pass')
	{
		console.log(`    ✓ ${detail.title}`);

		passCount ++;
		duration += detail.duration;
	}
	else if (detail.type == 'fail')
	{
		console.log(`    X ${detail.title}`);
		console.log(`      ${detail.error.message}`);
		console.log(`      ${detail.error.stack}`);

		failCount ++;
	}
	else if (detail.type == 'end')
	{
		console.log();
		console.log(`  ${passCount} passing (${Math.ceil(duration/1000)}s)`);
		failCount&&console.log(`  ${failCount} failing`);
	}
}