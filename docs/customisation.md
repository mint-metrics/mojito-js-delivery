# Customising Mojito

Previous: [setting up experiments with Mojito JS](./setup.md).

## Container shared code

JS defined in `repo/lib/shared-code.js` can be accessed by any experiment in the container. It's also used to define Mojito's optional parameters, e.g. [Custom storage adaptors](#tracking-data-collection-&-error-handling), [Debug mode](#debug-mode) and [Exclusion rules](#default-exclusion-rule).

### Tracking, data collection & error handling

Mojito provides hooks for 3 key events:

1. Exposure (typically when users are assigned to a test)
2. Failure (JS error thrown)
3. Veil timeout (if hiding the contents of the page temporarily before variants are revealed but the timeout is reached)

In your shared code, specify your own tracking and error handling functions. Just like this example for Google Tag Manager:

```js
Mojito.options.storageAdapter = {

    onExposure: function(obj){

        dataLayer.push({
            'event': 'mojito_exposure 1-0-0',
            'gaExpId': obj.options.gaExperimentId,
            'gaExpVar': obj.chosenRecipe.id,
            'mojito': {
                'waveId': obj.options.id,
                'waveName': obj.options.name,
                'recipe': obj.chosenRecipe.name
            }
        });
    },

    onVeilTimeout: function(){},

    onRecipeFailure: function(obj, err){

        dataLayer.push({
            'event': 'mojito_failure 1-0-0',
            'mojito': {
                'waveId': obj.options.id,
                'waveName': obj.options.name,
                'component': obj.chosenRecipe.name || 'trigger',
                'error': err
            }
        });

        // Refresh the page unless we're in a trigger or preview mode
        var preview = document.location.search.indexOf('mojito_' + obj.options.id + '=' + obj.chosenRecipe.id) > -1;
        if (obj.chosenRecipe.name && !obj.options.divertTo && !preview) 
        {
            // Disable the experiment on future page loads, and refresh
            Mojito.Cookies.set('_mojito_' + obj.options.id + (obj.options.state === 'live'?'':'-staging'), '0.0');
            setTimeout(function(){
                window.location.reload();
            }, 500);
        }

    }

};
```

The whole test object is passed into the `storageAdapter` functions, allowing you to track custom values for your experiment (e.g. Google Optimize tracking, Google Analytics Custom Dimensions and experiment versions). In the example above, we expose  `gaExperimentId` on the root of the test object and we're able to access it via `obj.options.gaExperimentId`.

### Default exclusion rule

Let's face it, we need to exclude IE and other ancient browsers from being bucketed. They lack so many features of modern browsers that your experiments are likely to break for these useragents.

To exclude a useragent from being bucketed, you need to set `Mojito.options.excluded` to `true` for those you want excluded. We recommend setting the value from the output of a function, like so:

```js
Mojito.options.excluded = (function(){
    // Exclude troublesome browsers across all experiments
    return (!navigator.cookieEnabled || 
            navigator.userAgent.indexOf('MSIE') > -1 ||
            !(window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver) ||
            !document.documentElement.classList
    );
})();
```

### Debug mode

To enable console logging from the Mojito library, you'll need to set `Mojito.options.debug` to `true`:

```js
Mojito.options.debug = true; // false to disable
```

## Next steps

Finished customising your setup?

Next, [build your Mojito container and launch some experiments](./preview_launch.md)!