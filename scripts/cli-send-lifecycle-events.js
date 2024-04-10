const config = require('../config');
const sendLifecycleEventsSnowplow = require('./cli-send-lifecycle-events-snowplow');

let sendLifecycleEventsFn;
let analytics;
if (config.lifecycleEvents && config.lifecycleEvents.analytics) {
	analytics = Object.keys(config.lifecycleEvents.analytics)[0];
}

// todo: support more analytics
if (analytics == 'snowplow') {
	sendLifecycleEventsFn = sendLifecycleEventsSnowplow;
}

module.exports = sendLifecycleEventsFn;