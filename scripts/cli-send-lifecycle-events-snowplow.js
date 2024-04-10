const config = require('../config');
const snowplow = require('@snowplow/node-tracker');

module.exports = function sendLifecycleEvents(args, payload) {
	console.log('sending lifecycle event to snowplow...');
    let configData = JSON.parse(JSON.stringify(payload.testObject));

	let snowplowConf = config.lifecycleEvents.analytics.snowplow;
    let emitter = snowplow.gotEmitter(
        snowplowConf.collectorUrl,
        snowplowConf.collectorProtocol||snowplow.HttpProtocol.HTTPS,
        snowplowConf.collectorPort||443,
        snowplowConf.collectorPayload||snowplow.HttpMethod.GET,
        1
    );

    let tracker = snowplow.tracker([emitter], 'mojito-js-delivery', snowplowConf.appId);
    tracker.track(snowplow.buildStructEvent({
        category: 'mojito wave lifecycle event',
        action: payload.configFilePath,
        label: payload.comparingCommits
    }),
    [
        {
            schema: 'iglu:io.mintmetrics.mojito/mojito_wave_configuration/jsonschema/1-0-0',
            data: configData
        },
        {
            schema: 'iglu:io.mintmetrics.mojito/mojito_container_metadata/jsonschema/1-0-0',
            data: {
                name: config.containerName,
                version: process.env.npm_package_version,
                commit: args.commitHash
            }
        }
    ]);
}