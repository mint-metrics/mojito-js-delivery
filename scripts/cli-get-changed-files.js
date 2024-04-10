const config = require('../config');
const getChangedFilesBitbucketPipelines = require('./cli-get-changed-files-bitbucket-pipelines');

const supportedCIs = ['bitbucket-pipelines'];
const supportedAnalytics = ['snowplow'];

let getChangedFilesFn;

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

function checkConfig() {
    let eventsConf = config.lifecycleEvents;
    if (!eventsConf) {
        throw new Error(`Mojito Lifecycle events - please specify lifecycleEvents configuration in config.js.`);
    }

    let ciEnv = 'bitbucket-pipelines';
    if (eventsConf.ci && eventsConf.ci.environment) {
        ciEnv = eventsConf.ci.environment;
    }

    if (!supportedCIs.includes(ciEnv)) {
        throw new Error(`Mojito Lifecycle events - unspported CI environment: ${ciEnv}.`);
    }

    // todo: support more CI environments
    if (ciEnv == 'bitbucket-pipelines') {
        getChangedFilesFn = getChangedFilesBitbucketPipelines;
    }

    let analyticsConf = eventsConf.analytics||{};
    if (Object.keys(analyticsConf) <= 0) {
        throw new Error(`Mojito Lifecycle events - please specify analytics configuration in config.js.`);
    }

    let analytics = Object.keys(analyticsConf)[0];
    if (!supportedAnalytics.includes(analytics)) {
        throw new Error(`Mojito Lifecycle events - unspported analytics: ${analytics}.`);
    }

    if (analytics == 'snowplow') {
        if (!analyticsConf.snowplow.collectorUrl) {
            throw new Error(`Mojito Lifecycle events - please specify snowplow collectorUrl in config.js.`);
        }
    }
}

async function getChangedFiles() {
    checkConfig();
	let args = parseCLIArgs();
	getChangedFilesFn(args);
}

getChangedFiles();
