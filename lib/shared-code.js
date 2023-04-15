/**
 * Shared Code
 * Specify your defaults and add any helper functions you need here.
 * https://mojito.mx/docs/js-delivery-customisation#__docusaurus
 */


/**
 * Default Exclusion Rule
 * Exclude users from all experiments by default
 * https://mojito.mx/docs/js-delivery-customisation#default-exclusion-rule
 */
/*
Mojito.options.excluded = (function () {
    return (!navigator.cookieEnabled
        || navigator.userAgent.indexOf('MSIE') > -1
        || !(window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver)
        || !document.documentElement.classList);
}());
*/


/**
 * Storage Adapter
 * Define your experiment tracking through the storage adapter
 * https://mojito.mx/docs/js-delivery-api-storage-adapter#__docusaurus
 */
/*
Mojito.options.storageAdapter = {
    onExposure: function (obj) {
        dataLayer.push({
            event: 'mojito_exposure 1-0-0',
            mojito: {
                waveId: obj.options.id,
                waveName: obj.options.name,
                recipe: obj.chosenRecipe.name
            },
            // Track Mojito experiments into Google Optimize:
            // https://mintmetrics.io/web-analytics/track-your-optimizely-vwo-tests-inside-google-optimize/
            gaExpId: obj.options.gaExperimentId,
            gaExpVar: obj.chosenRecipe.id
        });
    },
    onRecipeFailure: function (obj, err) {
        dataLayer.push({
            event: 'mojito_failure 1-0-0',
            mojito: {
                waveId: obj.options.id,
                waveName: obj.options.name,
                component: obj.chosenRecipe.name || 'trigger',
                error: err
            }
        });

        // Refresh the page unless we're in a trigger or preview mode
        var preview = document.location.search.indexOf('mojito_' + obj.options.id + '=' + obj.chosenRecipe.id) > -1;
        if (obj.chosenRecipe.name && !obj.options.divertTo && !preview) {
            // Disable the test in staging mode or live mode
            Mojito.Cookies.set('_mojito_' + obj.options.id + (obj.options.state === 'live'?'':'-staging'), '0.0');
            setTimeout(function () {
                window.location.reload();
            }, 500);
        }
    }
};
var dataLayer = dataLayer||[];
*/


/**
 * You can add your own helper functions
 * After this section, your test objects will be included.
 */
