Mojito = (function ()
{
    // Enable debugging through the console
    var Options = {
        debug: false,
        // cookie duration (in days)
        cookieDuration: 60,
        // max length of error message
        maxErrorStackLength: 1000,
        // checking interval of utils.waitUntil
        waitInterval: 50,
        // default timeout of utils.waitUntil
        defaultWaitTimeout: 2000
    };

    // Test object states
    var OBJECT_STATES = {
        STAGING: 'staging',
        LIVE: 'live'
    };

    // The main test object
    var Test = (function ()
    {
        var cookiePrefix = '_mojito',
            p;

        var constructor = function (options)
        {

            this.options = Utils.extend({
                id: null,
                name: null,
                recipes: null,
                sampleRate: 1.0,
                storageAdapter: null,
                decisionAdapter: null,
                trigger: null
            }, options);

            this.recipes = Utils.keys(this.options.recipes);

            // Test object specified options
            if (options.options)
            {
                for (p in Options)
                {
                    if (!(p in options.options))
                    {
                        options.options[p] = Options[p];
                    }
                }
            }
            else
            {
                this.options.options = {};

                for (p in Options)
                {
                    this.options.options[p] = Options[p];
                }
            }

            // Check params
            if (this.options.id === null) throw new Error('An id for this test must be specified.');
            if (this.options.name === null) throw new Error('A name for this test must be specified.');
            if (this.options.recipes === null) throw new Error('Recipes must be specified for this test.');
            if (this.recipes.length < 2) throw new Error('You must specify at least 2 recipes for a test.');
            if (!this.options.trigger||!Utils.isFunction(this.options.trigger)) throw new Error('Specify a trigger function for this test.');
            if (this.options.sampleRate > 1) throw new Error('Sample rate must be less or equal to 1');

            // Test object state, set default value to 'staging'
            this.options.state = this.options.state || OBJECT_STATES.STAGING;

            var recipes = this.options.recipes,
                totalSimpleRate = 0,
                recipe,
                simpleRateSet;

            for (p in recipes)
            {
                recipe = recipes[p];
                recipe.id = p;

                if (recipe.sampleRate != null)
                {
                    totalSimpleRate += recipe.sampleRate;
                    simpleRateSet = true;
                }
            }

            if (simpleRateSet && totalSimpleRate != 1) throw new Error('The sum of all the simple rates must be equal to 1');
            
            // Storage adapter definition priority: 1) Test adapter; 2) Global adapter; 3) Default adapter
            if (!this.options.storageAdapter)
            {
                if (this.options.options && this.options.options.storageAdapter)
                {
                    this.options.storageAdapter = this.options.options.storageAdapter;
                }
                else
                {
                    this.options.storageAdapter = {
                        onExposure: function () {},
                        onRecipeFailure: function () {},
                        onTimeoutFailure: function () {}
                    };
                }
            }

            // Decision adapter definition priority: 1) Test adapter; 2) Global adapter; 3) Default adapter
            if (!this.options.decisionAdapter)
            {
                if (this.options.options && this.options.options.decisionAdapter)
                {
                    this.options.decisionAdapter = this.options.options.decisionAdapter;
                }
                else
                {
                    this.options.decisionAdapter = function(testObject)
                    {
                        return testObject.getSeededRNGRandom();
                    };
                }
            }

            // Call trigger
            this.activate = this.activate.bind(this);
            this.trackExposureEvent = this.trackExposureEvent.bind(this);
            this.options.trigger(this);
        };

        constructor.prototype = {
            /**
             * Activate a test
             * @returns {boolean}
             * true - test was activated successfully
             * false - test activated with errors
             */
            activate: function ()
            {
                // Exit if test has been activated
                if (this.activated)
                {
                    return false;
                }

                this.activated = true;

                // Determine if previewing via URL parameters and set the recipe
                var params = Utils.parseUrlParameters(window.location.search),
                    recipeId = params['mojito_' + this.options.id],
                    previewRecipe = this.options.recipes[recipeId],
                    success = false;

                // If previewing, run recipe and return
                if (previewRecipe != null)
                {
                    this.log('Forcing test [' + this.options.name + '][' + this.options.id + '] into recipe [' + previewRecipe.name + '][' + recipeId + ']');

                    this.setInTest(1);
                    this.setRecipe(previewRecipe.id);
                    success = this.runRecipe(previewRecipe);

                    return success;
                }

                // Determine whether user should be in a test & they're on a test page
                var inTest = this.inTest(),
                    newToThisTest = false,
                    excludeBySample = false,
                    divertTo = this.options.divertTo,
                    isLive = this.options.state.toLowerCase() == OBJECT_STATES.LIVE;

                // Handle 'divertTo': send all traffic to the specified treatment, disable tracking and return
                if (isLive && divertTo && Utils.arrayIndexOf(this.recipes, divertTo) >= 0)
                {
                    this.log("Test Object [" + this.options.name + "][" + this.options.id + "] was diverted to " + divertTo + ".");
                    this.options.isDivert = true;
                    success = this.runRecipe(this.options.recipes[divertTo]);

                    return success;
                }

                // Handle not previously bucketed user and live
                if (inTest === null && isLive)
                {
                    inTest = (this.options.sampleRate <= 0) ? false : (this.getRandom() <= this.options.sampleRate);

                    if (inTest)
                    {
                        newToThisTest = true;
                    }
                    else
                    {
                        excludeBySample = true;
                    }
                }

                // Assign recipes to bucketed users
                if (inTest)
                {
                    this.setInTest(1);

                    // TODO: optimise logic?
                    var chosenRecipe,
                        currentRecipe = this.getRecipe();

                    if (!currentRecipe)
                    {
                        chosenRecipe = this.chooseRecipe();
                    }
                    else
                    {
                        // Returning visitors see the same recipe as last time
                        chosenRecipe = currentRecipe;
                    }

                    this.setRecipe(chosenRecipe);

                    var chosenRecipeObject = this.options.recipes[chosenRecipe];

                    // Exclude user from test, if chosen recipe no longer exists
                    if (!chosenRecipeObject)
                    {
                        this.setInTest(0);
                        return success;
                    }

                    // Track exposure if manualExposure isn't enabled
                    if (!this.options.manualExposure)
                    {
                        this.trackExposureEvent(chosenRecipeObject);
                    }

                    // Run the recipe
                    success = this.runRecipe(chosenRecipeObject);
                }
                else
                {
                    // Exclude users due to sampling
                    if (excludeBySample)
                    {
                        this.setInTest(0);
                    }
                }

                return success;
            },
            /**
             * Run a recipe
             * @param recipe
             * @returns {boolean}
             * true - recipe executed successfully
             * false - recipe threw errors
             */
            runRecipe: function (recipe)
            {
                this.chosenRecipe = recipe;
                var success = false;

                // TODO: refactor following block, see comment below for recipe.js(this)
                // Assign an empty function if 'onChosen' is not defined
                if (!recipe.js)
                {
                    recipe.js = function () {};
                }

                try
                {
                    // Inject test level css
                    if (this.options.css)
                    {
                        this.injectCSS(this.options.css);
                    }
                    // Inject recipe level css
                    if (recipe.css)
                    {
                        this.injectCSS(recipe.css);
                    }

                    // TODO: refactor? if(receipe.js) recipe.js(this);
                    recipe.js(this);
                    success = true;

                    this.log("Test Object [" + this.options.name + "][" + this.options.id + "] recipe onChosen [" + recipe.name + "][" + recipe.id + "] run.");
                }
                catch(err)
                {
                    this.trackRecipeFailureEvent(err);
                    this.log("Test Object [" + this.options.name + "][" + this.options.id + "] recipe onChosen [" + recipe.name + "][" + recipe.id + "] failed, error: "+err.message||err, 'error');
                }

                return success;
            },
            /**
             * Track the recipe exposure event
             * @chosenRecipe optional, the chosen recipe object
             */
            trackExposureEvent: function(chosenRecipe)
            {
                if (chosenRecipe)
                {
                    this.chosenRecipe = chosenRecipe;
                }

                this.options.storageAdapter.onExposure(this);
            },
            /**
             * Track the recipe failure exposure event
             */
            trackRecipeFailureEvent: function(error)
            {
                this.options.storageAdapter.onRecipeFailure(this, error.stack?error.stack.substr(0, Options.maxErrorStackLength):(error.message||error));
            },
            /**
             * Choose recipe by random or percentage based random
             * If all recipe objects have 'sampleRate' property then use percentage based random
             * @returns recipe key
             */
            chooseRecipe: function ()
            {
                var recipes = this.options.recipes;
                var chosen_recipe, partitions, chosen_partition, sameRecipes;

                // check if sample property was set in recipe objects
                var samplesWasSet = true;
                for (var p in recipes)
                {
                    if (recipes[p].sampleRate == null)
                    {
                        samplesWasSet = false;
                        break;
                    }
                }

                // No sample set, just use pure random
                if (!samplesWasSet)
                {
                    partitions = 1.0 / this.recipes.length;
                    chosen_partition = Math.floor(this.getRandom() / partitions);
                    chosen_recipe = this.recipes[chosen_partition];
                }
                else
                {
                    var orderedRecipes = this.getOrderedBySampleRecipes();
                    var sameSimpleRateRecipes = this.getSameSimpleRateValueRecipes(orderedRecipes);

                    var weight = 0;
                    var lastSample = orderedRecipes[orderedRecipes.length - 1].sampleRate;

                    while (!chosen_recipe)
                    {
                        weight = this.getRandom();

                        for (var i = 0; i < orderedRecipes.length; i++)
                        {
                            if (weight <= orderedRecipes[i].sampleRate)
                            {
                                chosen_recipe = orderedRecipes[i].key;
                                sameRecipes = sameSimpleRateRecipes[orderedRecipes[i].sampleRate];

                                if (sameRecipes)
                                {
                                    partitions = 1.0 / sameRecipes.length;
                                    chosen_partition = Math.floor(this.getRandom() / partitions);
                                    chosen_recipe = sameRecipes[chosen_partition].key;
                                }

                                break;
                            }
                        }

                        if (!chosen_recipe && (weight - lastSample) <= (1 - lastSample))
                        {
                            chosen_recipe = orderedRecipes[orderedRecipes.length - 1].key;
                            sameRecipes = sameSimpleRateRecipes[orderedRecipes[orderedRecipes.length - 1].sampleRate];

                            if (sameRecipes)
                            {
                                partitions = 1.0 / sameRecipes.length;
                                chosen_partition = Math.floor(this.getRandom() / partitions);
                                chosen_recipe = sameRecipes[chosen_partition].key;
                            }
                        }
                    }
                }

                return chosen_recipe;
            },
            /**
             * Get random value from decisionAdapter
             */
            getRandom: function()
            {
                if (!('decisionIdx' in this.options))
                {
                    this.options.decisionIdx = 0;
                }

                var randomValue = this.options.decisionAdapter(this);
                this.options.decisionIdx++;

                return randomValue;
            },
            /**
             * Generate random value by seeded RNG (http://indiegamr.com/generate-repeatable-random-numbers-in-js/)
             * @private
             */
            getSeededRNGRandom: function ()
            {
                // initial seed
                var seededRNGSeed = (new Date()).getTime();
                var max = 1,
                    min = 0;

                seededRNGSeed = (seededRNGSeed * 9301 + 49297) % 233280;
                var rnd = seededRNGSeed / 233280;

                return min + rnd * (max - min);
            },
            getOrderedBySampleRecipes: function ()
            {
                var recipes = this.options.recipes;
                var orderedRecipes = [];

                for (var p in recipes)
                {
                    orderedRecipes.push({key: p, sampleRate: recipes[p].sampleRate});
                }

                orderedRecipes.sort(function (a, b)
                {
                    return a.sampleRate - b.sampleRate;
                });

                return orderedRecipes;
            },
            getSameSimpleRateValueRecipes: function (orderedRecipes)
            {
                var tempRecipes = {}, simpleRate;
                for (var i = 0, c = orderedRecipes.length; i < c; i++)
                {
                    simpleRate = orderedRecipes[i].sampleRate;
                    if (!tempRecipes[simpleRate])
                    {
                        tempRecipes[simpleRate] = [];
                        tempRecipes[simpleRate].push(orderedRecipes[i]);
                    }
                    else
                    {
                        tempRecipes[simpleRate].push(orderedRecipes[i]);
                    }
                }

                for (var p in tempRecipes)
                {
                    if (tempRecipes[p].length <= 1)
                    {
                        delete tempRecipes[p];
                    }
                }

                return tempRecipes;
            },
            inTest: function ()
            {
                var cookie = this.getCookie(),
                    inTest,
                    values;

                if (cookie != null)
                {
                    values = cookie.split('.');
                    inTest = values[0];
                }

                return inTest == null ? null : inTest == 1;
            },
            setInTest: function (val)
            {
                var cookie = this.getCookie(),
                    inTest,
                    values;

                if (cookie != null)
                {
                    values = cookie.split('.');
                    inTest = values[0];

                    // Return if inTest value is unchanged
                    if (inTest == val)
                    {
                        return;
                    }

                    if (values.length == 2)
                    {
                        this.setCookie('', val + '.' + values[1]);
                    }
                }
                else
                {
                    // Cookie doesn't exist yet
                    this.setCookie('', val);
                }
            },
            getRecipe: function ()
            {
                var cookie = this.getCookie(),
                    values;

                if (this.inTest())
                {
                    values = cookie.split('.');

                    if (values.length == 2)
                    {
                        return values[1];
                    }

                    return null;
                }
                else
                {
                    return null;
                }
            },
            setRecipe: function (recipe)
            {
                var cookie = this.getCookie(),
                    values;

                if (Utils.arrayIndexOf(this.recipes, recipe) == -1)
                {
                    return false;
                }
                else
                {
                    values = cookie.split('.');
                    // Return if recipe value is unchanged
                    if (values[1] == recipe)
                    {
                        return false;
                    }

                    this.setCookie('', values[0] + '.' + recipe);

                    return true;
                }
            },
            setCookie: function (name, value)
            {
                var cookieName = cookiePrefix + '_' + this.options.id;

                if (name && name.length)
                {
                    cookieName = cookieName + '_' + name;
                }

                if (this.options.state.toLowerCase() == OBJECT_STATES.STAGING)
                {
                    cookieName = cookieName + '-staging';
                }

                Cookies.set(cookieName, value, {expires: this.options.options.cookieDuration||Options.cookieDuration}, this.options.options.cookieDomain);
            },
            getCookie: function (name)
            {
                var cookieName = cookiePrefix + '_' + this.options.id;

                if (name && name.length)
                {
                    cookieName = cookieName + '_' + name;
                }

                if (this.options.state.toLowerCase() == OBJECT_STATES.STAGING)
                {
                    cookieName = cookieName + '-staging';
                }

                return Cookies.get(cookieName);
            },
            /**
             * Output logs to console
             * @param message, the message content
             * @param msgLevel, msgLevel can be 'log', 'error', 'warn', default is 'log'
             */
            log: function (message, msgLevel)
            {
                if (this.options.options.debug)
                {
                    Utils.log(message, msgLevel);
                }
            },
            /**
             * Inject css using css text
             */
            injectCSS: function (cssText)
            {
                var head = document.getElementsByTagName('head')[0],
                    styleNode = document.createElement('style');

                styleNode.innerText = cssText;
                head.appendChild(styleNode);
            }
        };

        return constructor;
    })();

    var Utils = {
        extend: function (destination, source)
        {
            for (var property in source)
                destination[property] = source[property];
            return destination;
        },
        keys: function (object)
        {
            var results = [];
            for (var property in object)
                results.push(property);
            return results;
        },
        log: function (message, msgLevel)
        {
            if (window['console'])
            {
                msgLevel = msgLevel||'log';

                if (console[msgLevel])
                {
                    console[msgLevel](message);
                }
            }
        },
        isObject: function (it)
        {
            return it !== undefined &&
                (it === null || typeof it == "object" );
        },
        isFunction: function (it)
        {
            var opts = Object.prototype.toString;
            return opts.call(it) === "[object Function]";
        },
        arrayIndexOf: function (array, item)
        {
            if (Array.prototype.indexOf)
            {
                return array.indexOf(item);
            }
            else
            {
                var idx = -1;

                for (var i = 0, c = array.length; i < c; i++)
                {
                    if (array[i] == item)
                    {
                        idx = i;
                        break;
                    }
                }

                return idx;
            }
        },
        parseUrlParameters: function (urlSearch)
        {
            if (urlSearch.substr(0, 1) == "?")
            {
                urlSearch = urlSearch.substr(1);
            }

            var segments = urlSearch.split("&"), parameters = {}, pair;

            for (var i = 0, c = segments.length; i < c; i++)
            {
                pair = segments[i].split("=");
                parameters[pair[0]] = pair[1];
            }

            return parameters;
        },
        /**
         * Validate the given css selector
         * @param selector
         * @returns {boolean}
         */
        isValidSelector: function (selector)
        {
            try
            {
                document.querySelector(selector);
                return true;
            }
            catch (e)
            {
                return false;
            }
        },
        /**
         * MutationObserver callback
         * @private
         */
        _observeCallback: function ()
        {
            var listener,
                elements,
                finishedListeners = [],
                listenerIdx,
                i,c;
            for (i=0,c=this.listeners.length;i<c;i++)
            {
                listener = this.listeners[i];
                if (!listener)
                {
                    continue;
                }

                elements = document.querySelectorAll(listener.selector);

                if (!elements.length)
                {
                    continue;
                }

                // Once: Only invoke the callback on the first match
                if (listener.options.once)
                {
                    finishedListeners.push(listener);
                    listener.fn(elements[0]);
                }
                else
                {
                    for (var j=0,jc=elements.length;j<jc;j++)
                    {
                        // Skip observed elements
                        if (elements[j]._observed)
                        {
                            continue;
                        }

                        elements[j]._observed = true;
                        listener.fn(elements[j]);
                    }
                }

                if (listener.timeoutHandle)
                {
                    window.clearTimeout(listener.timeoutHandle);
                }
            }

            // Remove "once" listeners
            for (i=0,c=finishedListeners.length;i<c;i++)
            {
                listenerIdx = this.listeners.indexOf(finishedListeners[i]);
                if (listenerIdx != -1)
                {
                    this.listeners.splice(listenerIdx, 1);
                }
            }
        },
        /**
         * Call onTimeout callback and remove the listener which timeout reached.
         * @param listener
         * @private
         */
        _observeTimeout: function (listener)
        {
            var idx = this.listeners.indexOf(listener);

            if (idx == -1)
            {
                return;
            }

            this.listeners.splice(idx, 1);

            // Call onTimeout callback
            if (listener.options.onTimeout && this.isFunction(listener.options.onTimeout))
            {
                listener.options.onTimeout();
            }
        },
        /**
         * Mutation observer wrapper, run a callback when element appears in DOM matching the given selector
         * @param selector: css selector
         * @param callback: callback function on match, e.g. function(matchedElement) {}
         * @param options: object, three options can be used
         *        timeout: number of milliseconds, default is null (no timeout)
         *        once: boolean, default is false
         *              true: only call the callback on the first match.
         *              false: call the callback on every match.
         *        onTimeout: callback function if timeout is specified and no elements matched within given timeout
         */
        observeSelector: function (selector, callback, options)
        {
            if (Options.debug)
            {
                if (!this.isValidSelector(selector))
                {
                    throw new Error('observeSelector: ' + selector + ' is not a valid css selector.');
                }

                if (!this.isFunction(callback))
                {
                    throw new Error('observeSelector: callback parameter must be a function.');
                }

                if (options && !this.isObject(options))
                {
                    throw new Error('observeSelector: options parameter must be an object.');
                }
            }

            if (!options)
            {
                options = {};
            }

            var self = this;
            // Use single observer for multi calls
            if (!this.domObserver)
            {
                this.listeners = [];
                var MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;
                this.domObserver = new MutationObserver(this._observeCallback.bind(this));
                this.domObserver.observe(document.documentElement, {
                    childList: true,
                    subtree: true
                });
            }

            var listener = {selector: selector, fn: callback, options: options};
            this.listeners.push(listener);

            var timeout = parseInt(options.timeout, 10);
            if (!isNaN(timeout))
            {
                listener.timeoutHandle = window.setTimeout(function() {
                    self._observeTimeout(listener);
                }, timeout);
            }

            // Trigger the first check
            this._observeCallback();
        },
        /**
         * Wrapper function of observeSelector
         * @param selector
         * @param callback
         * @param timeout, optional
         */
        waitForElement: function (selector, callback, timeout)
        {
            this.observeSelector(selector, callback, {timeout: timeout, once: true});
        },
        /**
         * Check each waitUntil listener
         * @private
         */
        _waitUntilChecker: function ()
        {
            var listener,
                finishedListeners = [],
                i,c;

            for (i=0,c=this.waitListeners.length;i<c;i++)
            {
                listener = this.waitListeners[i];
                if (listener.condition())
                {
                    finishedListeners.push(listener);
                    listener.callback();
                }
                else
                {
                    // Timeout reached?
                    if (listener.timeout && (((new Date()).getTime() - listener.start) >= listener.timeout))
                    {
                        finishedListeners.push(listener);
                    }
                }
            }

            // Remove finished listeners
            for (i=0,c=finishedListeners.length;i<c;i++)
            {
                this.waitListeners.splice(this.waitListeners.indexOf(finishedListeners[i]), 1);
            }

            if (this.waitListeners.length)
            {
                this.waitHandle = window.setTimeout(this._waitUntilChecker.bind(this), Options.waitInterval);
            }
            else
            {
                window.clearTimeout(this.waitHandle);
            }
        },
        /**
         * Wait until a condition returns true, then execute callback
         * @param conditionFunction, it should return true (condition matched) or false (condition not matched yet)
         * @param callback, will be called once the conditionFunction returns true
         * @param timeout, optional
         */
        waitUntil: function (conditionFunction, callback, timeout)
        {
            if (Options.debug)
            {
                if (!this.isFunction(conditionFunction))
                {
                    throw new Error('waitUntil: conditionFunction parameter must be a function.');
                }

                if (!this.isFunction(callback))
                {
                    throw new Error('waitUntil: callback parameter must be a function.');
                }
            }

            if (timeout != null)
            {
                timeout = parseInt(timeout, 10);

                if (isNaN(timeout) || timeout <= 0)
                {
                    throw new Error('waitUntil: timeout parameter must be an positive Integer.');
                }
            }
            else
            {
                timeout = Options.defaultWaitTimeout;
            }

            if (!this.waitListeners)
            {
                this.waitListeners = [];
            }

            // First check
            if (conditionFunction())
            {
                callback();
                return;
            }

            var listener = {condition: conditionFunction, callback: callback, timeout: timeout};
            this.waitListeners.push(listener);

            if (timeout)
            {
                listener.start = (new Date()).getTime();
            }

            this.waitHandle = window.setTimeout(this._waitUntilChecker.bind(this), Options.waitInterval);
        },
        /**
         * Run a callback when changes (subtree, childList, characterData and attributes) happen on elements matched given selector
         * @param selectorOrElement: css selector or dom element
         * @param callback: callback function on change, e.g. function(mutationsList) {}, mutationsList is an array of MutationRecord
         * @param watchOptions: An optional MutationObserverInit object providing options that describe what DOM mutations should be reported
         */
        watchElement: function (selectorOrElement, callback, watchOptions)
        {
            var isSelector = typeof(selectorOrElement) == 'string';
            if (Options.debug)
            {
                if (isSelector&&!this.isValidSelector(selectorOrElement))
                {
                    throw new Error('watchElement: ' + selectorOrElement + ' is not a valid css selector.');
                }

                if (!this.isFunction(callback))
                {
                    throw new Error('watchElement: callback parameter must be a function.');
                }
            }

            if (!this.domWatcher)
            {
                var MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;
                this.domWatcher = new MutationObserver(callback);
            }

            if (!watchOptions)
            {
                watchOptions = {
                    childList: true,
                    subtree: true,
                    characterData: true,
                    attributes: true
                };
            }

            var elements;
            if (isSelector)
            {
                elements = document.querySelectorAll(selectorOrElement);
            }
            else
            {
                elements = [selectorOrElement];
            }

            for (var i=0;i<elements.length;i++)
            {
                this.domWatcher.observe(elements[i], watchOptions);
            }
        }
    };

    // Adapted from dojo.cookie module
    var Cookies = {
        /**
         * Retrieve document.cookie string and break it into a hash with values decoded and unserialized
         *
         * @access public
         * @static
         * @return OBJECT - hash of cookies from document.cookie
         */
        parseCookies: function ()
        {
            var cookies = {}, i, pair, name, value, separated = document.cookie.split(';'), c = separated.length;
            for (i = 0; i < c; i++)
            {
                pair = separated[i].split('=');
                name = pair[0].replace(/^\s*/, '').replace(/\s*$/, '');
                value = decodeURIComponent(pair[1]) || null;
                cookies[name] = value;
            }
            return cookies;
        },
        /**
         * Get a cookie
         *
         * @access public
         * @paramater String cookieName - name of single cookie
         * @return String - Value of cookie as set
         */
        get: function (name)
        {
            var c = document.cookie, ret;
            var matches = c.match(new RegExp("(?:^|; )" + this.escapeString(name) + "=([^;]*)"));
            ret = matches ? decodeURIComponent(matches[1]) : null;

            return ret;
        },
        /**
         * Set or delete a cookie with desired options
         *
         * @access public
         * @paramater String name - name of cookie to set
         * @paramater String value - value of cookie to set. NULL to delete
         * @paramater Object props - optional list of cookie options to specify
         * @return void
         */
        set: function (name, value, props, domain)
        {
            props = props || {};
            props.path || (props.path = '/');
            var exp = props.expires, d;
            if (typeof exp == "number")
            {
                d = new Date();
                d.setTime(d.getTime() + exp * 24 * 60 * 60 * 1000);
                exp = props.expires = d;
            }

            if (exp && exp.toUTCString)
            {
                props.expires = exp.toUTCString();
            }

            value = encodeURIComponent(value);
            var updatedCookie = name + "=" + value, propName;

            if (!('domain' in props) && domain)
            {
                if (domain.indexOf('.') != 0)
                {
                    domain = '.' + domain;
                }

                props.domain = domain;
            }

            for (propName in props)
            {
                updatedCookie += "; " + propName;
                var propValue = props[propName];
                if (propValue !== true)
                {
                    updatedCookie += "=" + propValue;
                }
            }
            document.cookie = updatedCookie;
        },
        /**
         * Remove a cookie
         * @param name
         */
        remove: function (name)
        {
            document.cookie = name + '=;expires=Sat, 31 Jan 1970 16:00:00 GMT;path=/';
        },
        /**
         * Adds escape sequences for special characters in regular expressions
         * @param str
         * @returns string
         */
        escapeString: function (str)
        {
            return str.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, function (ch)
            {
                return "\\" + ch;
            });
        }
    };

    // Adapted from https://github.com/requirejs/domReady
    var domReadyUtil = (function ()
    {

        var readyCalls = [], isPageLoaded = false , scrollIntervalId,
            testDiv, isTop;

        // Call domReady event callbacks one by one
        function callReady()
        {
            var callbacks = readyCalls;

            if (isPageLoaded)
            {
                if (callbacks.length)
                {
                    var i;
                    for (i = 0; i < readyCalls.length; i += 1)
                    {
                        readyCalls[i]();
                    }
                    readyCalls = [];
                }
            }
        }

        // Detect when page is loaded
        function pageLoaded()
        {

            if (!isPageLoaded)
            {
                isPageLoaded = true;
                if (scrollIntervalId)
                {
                    clearInterval(scrollIntervalId);
                }

                callReady();
            }
        }

        if (document.addEventListener)
        {
            document.addEventListener("DOMContentLoaded", pageLoaded, false);
            window.addEventListener("load", pageLoaded, false);
        }
        else if (window.attachEvent)
        {
            document.attachEvent("onreadystatechange", function ()
            {
                if (document.readyState == "interactive" || document.readyState == "complete" || document.readyState == "loaded")
                {
                    pageLoaded('readaySate');
                }
            });

            window.attachEvent("onload", pageLoaded);

            testDiv = document.documentElement;
            try
            {
                isTop = window.frameElement === null;
            } catch (e)
            {
            }

            if (testDiv.doScroll && isTop && window.external)
            {
                scrollIntervalId = setInterval(function ()
                {
                    try
                    {
                        testDiv.doScroll();
                        pageLoaded("ie hack");
                    } catch (e)
                    {
                    }
                }, 2);
            }
        }

        if (document.readyState === "complete")
        {
            pageLoaded();
        }

        function domReady(callback)
        {
            if (isPageLoaded)
            {
                callback();
            }
            else
            {
                readyCalls.push(callback);
            }
            return domReady;
        }

        return domReady;
    })();

    Utils.domReady = domReadyUtil;

    // General Mojito exclude feature
    // Mojito.options.excluded can be a boolean value or a function
    Options.excluded = !navigator.cookieEnabled;

    return {
        testObjects: {},
        addTest: function (testConfig)
        {
            if (this.options.excluded != null)
            {
                if (Utils.isFunction(this.options.excluded))
                {
                    this.options.excluded = this.options.excluded();
                }

                if (this.options.excluded)
                {
                    Utils.log('Excluded from test by Mojito.options.excluded value.', 'warn');
                    return false;
                }
            }

            var testObject = new Test(testConfig);
            this.testObjects[testConfig.id] = testObject;

            return testObject;
        },
        getTest: function (id)
        {
            return this.testObjects[id];
        },
        Test: Test,
        Cookies: Cookies,
        options: Options,
        utils: Utils
    };
})();
