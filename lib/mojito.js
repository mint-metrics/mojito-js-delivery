Mojito = (function () {
    var defaultOptions = {
        debug: false,
        cookieDuration: 60,
        maxErrorStackLength: 1000,
        waitInterval: 50,
        defaultWaitTimeout: 2000,
        storageAdapter: {
            onExposure: function () {},
            onRecipeFailure: function () {}
        },
        decisionAdapter: function (test) {
            return test.getSeededRNGRandom();
        },
        cookiePrefix: '_mojito',
        excluded: !navigator.cookieEnabled
    };

    // Test object states
    var OBJECT_STATES = {
        STAGING: 'staging',
        LIVE: 'live'
    };

    // initial seed
    var seededRNGSeed = (new Date()).getTime();

    // The main test object
    var Test = (function () {
        var constructor = function (options) {
            var p;

            this.options = Utils.extend({
                id: null,
                name: options.id,
                recipes: null,
                state: OBJECT_STATES.STAGING,
                sampleRate: 1.0,
                storageAdapter: null,
                decisionAdapter: null,
                trigger: null,
                options: {}
            }, options);
            this.recipes = Object.keys(this.options.recipes);

            // Set any defaults
            for (p in defaultOptions) {
                if (!this.options.options[p]) this.options.options[p] = defaultOptions[p];
            }
            this.options.storageAdapter = this.options.options.storageAdapter;
            this.options.decisionAdapter = this.options.options.decisionAdapter;

            // Check params
            if (this.options.id === null) throw new Error('An id for this test must be specified.');
            if (this.recipes && this.recipes.length < 2) throw new Error('You must specify at least 2 recipes for a test.');
            if (this.options.sampleRate > 1) throw new Error('Sample rate must be less or equal to 1');

            var recipes = this.options.recipes,
                totalSimpleRate,
                recipe;

            for (p in recipes) {
                recipe = recipes[p];
                recipe.id = p;

                if (recipe.sampleRate != null) {
                    totalSimpleRate += recipe.sampleRate;
                }
            }

            if (totalSimpleRate && totalSimpleRate !== 1) throw new Error('The sum of all the simple rates must be equal to 1');

            // Call trigger
            this.activate = this.activate.bind(this);
            this.trackExposureEvent = this.trackExposureEvent.bind(this);

            try {
                this.options.trigger(this);
            } catch (e) {
                this.chosenRecipe = {};
                this.trackRecipeFailureEvent(e);
                this.log('Test Object [' + this.options.name + '][' + this.options.id + '] trigger failed, error: ' + (e.message||e), 'error');
            }
        };

        constructor.prototype = {
            /**
             * Activate a test
             * @returns {boolean}
             * true - test was activated successfully
             * false - test activated with errors
             */
            activate: function () {
                // Exit if test has been activated
                if (this.activated) {
                    return false;
                }

                this.activated = true;

                // Determine if previewing via URL parameters and set the recipe
                var params = Utils.parseUrlParameters(window.location.search),
                    recipeId = params['mojito_' + this.options.id],
                    previewRecipe = this.options.recipes[recipeId],
                    success = false;

                // If previewing, run recipe and return
                if (previewRecipe != null) {
                    this.log('Forcing test [' + this.options.name + '][' + this.options.id + '] into recipe [' + previewRecipe.name + '][' + recipeId + ']');

                    this.setInTest('1');
                    this.setRecipe(previewRecipe.id);
                    success = this.runRecipe(previewRecipe);

                    return success;
                }

                // Determine whether user should be in a test & they're on a test page
                var inTest = this.inTest(),
                    newToThisTest = false,
                    divertTo = this.options.divertTo,
                    isLive = this.options.state.toLowerCase() === OBJECT_STATES.LIVE;

                // Handle 'divertTo': send all traffic to the specified treatment, disable tracking and return
                if (isLive && divertTo && this.recipes.indexOf(divertTo) >= 0) {
                    this.log('Test Object [' + this.options.name + '][' + this.options.id + '] was diverted to ' + divertTo + '.');
                    this.options.isDivert = true;
                    success = this.runRecipe(this.options.recipes[divertTo]);

                    return success;
                }

                // Handle not previously bucketed user and live
                if (inTest === null && isLive) {
                    inTest = (this.options.sampleRate <= 0) ? false : (this.getRandom() <= this.options.sampleRate);

                    if (inTest) newToThisTest = true;
                }

                this.options.newToThisTest = newToThisTest;

                // Assign recipes to users in test, else exclude them by test's sample rate
                if (inTest) {
                    this.setInTest('1');

                    var chosenRecipe = this.getRecipe() || this.chooseRecipe();
                    this.setRecipe(chosenRecipe);

                    // Exclude users from test if their chosen recipe no longer exists
                    var chosenRecipeObject = this.options.recipes[chosenRecipe];
                    if (!chosenRecipeObject) {
                        this.setInTest('0');
                        return success;
                    }

                    // Track exposure if manualExposure isn't enabled
                    if (!this.options.manualExposure) {
                        this.trackExposureEvent(chosenRecipeObject);
                    }

                    // Run the recipe
                    success = this.runRecipe(chosenRecipeObject);
                } else {
                    // Excluded by samplerate
                    this.setInTest('0');
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
            runRecipe: function (recipe) {
                this.chosenRecipe = recipe;
                var success = false;

                try {
                    // Inject test level css
                    if (this.options.css) {
                        this.injectCSS(this.options.css);
                    }
                    // Inject recipe level css
                    if (recipe.css) {
                        this.injectCSS(recipe.css);
                    }
                    // Recipe level js
                    if (recipe.js) {
                        recipe.js(this);
                    }

                    success = true;

                    this.log('Test Object [' + this.options.name + '][' + this.options.id + '] recipe onChosen [' + recipe.name + '][' + recipe.id + '] run.');
                } catch (err) {
                    this.trackRecipeFailureEvent(err);
                    this.log('Test Object [' + this.options.name + '][' + this.options.id + '] recipe onChosen [' + recipe.name + '][' + recipe.id + '] failed, error: ' + (err.message||err), 'error');
                }

                return success;
            },
            /**
             * Track the recipe exposure event
             * @chosenRecipe optional, the chosen recipe object
             */
            trackExposureEvent: function (chosenRecipe) {
                if (chosenRecipe) {
                    this.chosenRecipe = chosenRecipe;
                }

                this.options.storageAdapter.onExposure(this);
            },
            /**
             * Track the recipe failure exposure event
             */
            trackRecipeFailureEvent: function (error) {
                this.options.storageAdapter.onRecipeFailure(this, error.stack?error.stack.substr(0, defaultOptions.maxErrorStackLength):(error.message||error));
            },
            /**
             * Choose recipe by random or percentage based random
             * If all recipe objects have 'sampleRate' property then use percentage based random
             * @returns recipe key
             */
            chooseRecipe: function () {
                var recipes = this.options.recipes;
                var chosenRecipe, partitions, chosenPartition;

                // check if sample property was set in recipe objects
                var samplesSet = true;
                for (var p in recipes) {
                    if (recipes[p].sampleRate == null) {
                        samplesSet = false;
                        break;
                    }
                }

                // no sample was set, just use pure random
                if (!samplesSet) {
                    partitions = 1.0 / this.recipes.length;
                    chosenPartition = Math.floor(this.getRandom() / partitions);
                    chosenRecipe = this.recipes[chosenPartition];
                } else {
                    var orderedRecipes = this.getOrderedBySampleRecipes(),
                        checkedRecipeSamples = 0,
                        weight = this.getRandom();

                    for (var i = 0; i < orderedRecipes.length; i++) {
                        checkedRecipeSamples += orderedRecipes[i].sampleRate;
                        if (weight <= checkedRecipeSamples) {
                            chosenRecipe = orderedRecipes[i].key;
                            break;
                        }
                    }
                }

                return chosenRecipe;
            },
            /**
             * Get random value from decisionAdapter
             */
            getRandom: function () {
                if (!('decisionIdx' in this.options)) {
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
            getSeededRNGRandom: function () {
                var max = 1,
                    min = 0;

                seededRNGSeed = (seededRNGSeed * 9301 + 49297) % 233280;
                var rnd = seededRNGSeed / 233280;

                return min + rnd * (max - min);
            },
            getOrderedBySampleRecipes: function () {
                var recipes = this.options.recipes;
                var orderedRecipes = [];

                for (var p in recipes) {
                    orderedRecipes.push({ key: p, sampleRate: recipes[p].sampleRate });
                }

                orderedRecipes.sort(function (a, b) {
                    return a.sampleRate - b.sampleRate;
                });

                return orderedRecipes;
            },
            getStoredDecision: function () {
                if (!this.options.storedDecision) {
                    this.options.storedDecision = { inTest: null, recipe: null };
                    var cookie = this.getCookie();

                    if (cookie != null) {
                        values = cookie.split('.');
                        this.options.storedDecision.inTest = values[0] === '1';
                        this.options.storedDecision.recipe = values[1]||null;
                    }
                }

                return this.options.storedDecision;
            },
            inTest: function () {
                return this.getStoredDecision().inTest;
            },
            setInTest: function (val) {
                var storedDecision = this.getStoredDecision(),
                    inTest = val === '1';

                if (storedDecision.inTest !== inTest) {
                    if (storedDecision.recipe == null) {
                        this.setCookie('', val);
                    } else {
                        this.setCookie('', val + '.' + storedDecision.recipe);
                    }

                    storedDecision.inTest = inTest;
                }
            },
            getRecipe: function () {
                return this.getStoredDecision().recipe;
            },
            setRecipe: function (recipe) {
                if (this.recipes.indexOf(recipe) === -1) {
                    return;
                }

                var storedDecision = this.getStoredDecision();

                if (storedDecision.recipe !== recipe) {
                    this.setCookie('', '1.' + recipe);
                    storedDecision.recipe = recipe;
                }
            },
            setCookie: function (name, value) {
                var cookieName = this.options.options.cookiePrefix + '_' + this.options.id;

                if (name && name.length) {
                    cookieName = cookieName + '_' + name;
                }

                if (this.options.state.toLowerCase() === OBJECT_STATES.STAGING) {
                    cookieName += '-staging';
                }

                Cookies.set(cookieName, value, { expires: this.options.options.cookieDuration||defaultOptions.cookieDuration }, this.options.options.cookieDomain);
            },
            getCookie: function (name) {
                var cookieName = this.options.options.cookiePrefix + '_' + this.options.id;

                if (name && name.length) {
                    cookieName = cookieName + '_' + name;
                }

                if (this.options.state.toLowerCase() === OBJECT_STATES.STAGING) {
                    cookieName += '-staging';
                }

                return Cookies.get(cookieName);
            },
            /**
             * Output logs to console
             * @param message, the message content
             * @param msgLevel, msgLevel can be 'log', 'error', 'warn', default is 'log'
             */
            log: function (message, msgLevel) {
                if (this.options.options.debug) {
                    Utils.log(message, msgLevel);
                }
            },
            /**
             * Inject css using css text
             */
            injectCSS: function (cssText) {
                var head = document.getElementsByTagName('head')[0],
                    styleNode = document.createElement('style');

                styleNode.innerText = cssText;
                head.appendChild(styleNode);
            }
        };

        return constructor;
    }());

    var Utils = {
        extend: function (destination, source) {
            for (var property in source) destination[property] = source[property];
            return destination;
        },
        log: function (message, msgLevel) {
            if (window.console) {
                msgLevel = msgLevel||'log';

                if (console[msgLevel]) {
                    console[msgLevel](message);
                }
            }
        },
        isObject: function (it) {
            return it !== undefined
                && (it === null || typeof it === 'object');
        },
        isFunction: function (it) {
            var opts = Object.prototype.toString;
            return opts.call(it) === '[object Function]';
        },
        parseUrlParameters: function (urlSearch) {
            if (urlSearch.substr(0, 1) === '?') {
                urlSearch = urlSearch.substr(1);
            }

            var segments = urlSearch.split('&'), parameters = {}, pair;

            for (var i = 0, c = segments.length; i < c; i++) {
                pair = segments[i].split('=');
                parameters[pair[0]] = pair[1];
            }

            return parameters;
        },
        /**
         * Validate the given css selector
         * @param selector
         * @returns {boolean}
         */
        isValidSelector: function (selector) {
            try {
                document.querySelector(selector);
                return true;
            } catch (e) {
                return false;
            }
        },
        /**
         * MutationObserver callback
         * @private
         */
        _observeCallback: function () {
            var listener,
                elements,
                finishedListeners = [],
                listenerIdx,
                i, c;
            for (i=0, c=this.listeners.length; i<c; i++) {
                listener = this.listeners[i];
                if (!listener) {
                    continue;
                }

                elements = document.querySelectorAll(listener.selector);

                if (!elements.length) {
                    continue;
                }

                // Once: Only invoke the callback on the first match
                if (listener.options.once) {
                    finishedListeners.push(listener);
                    listener.fn(elements[0]);
                } else {
                    for (var j=0, jc=elements.length; j<jc; j++) {
                        // Skip observed elements
                        if (elements[j]['_observed' + listener.index]) {
                            continue;
                        }

                        elements[j]['_observed' + listener.index] = true;
                        listener.fn(elements[j]);
                    }
                }

                if (listener.timeoutHandle) {
                    window.clearTimeout(listener.timeoutHandle);
                }
            }

            // Remove "once" listeners
            for (i=0, c=finishedListeners.length; i<c; i++) {
                listenerIdx = this.listeners.indexOf(finishedListeners[i]);
                if (listenerIdx != -1) {
                    this.listeners.splice(listenerIdx, 1);
                }
            }
        },
        /**
         * Call onTimeout callback and remove the listener which timeout reached.
         * @param listener
         * @private
         */
        _observeTimeout: function (listener) {
            var idx = this.listeners.indexOf(listener);

            if (idx === -1) {
                return;
            }

            this.listeners.splice(idx, 1);

            // Call onTimeout callback
            if (listener.options.onTimeout && this.isFunction(listener.options.onTimeout)) {
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
        observeSelector: function (selector, callback, options) {
            if (defaultOptions.debug) {
                if (!this.isValidSelector(selector)) {
                    throw new Error('observeSelector: ' + selector + ' is not a valid css selector.');
                }

                if (!this.isFunction(callback)) {
                    throw new Error('observeSelector: callback parameter must be a function.');
                }

                if (options && !this.isObject(options)) {
                    throw new Error('observeSelector: options parameter must be an object.');
                }
            }

            if (!options) {
                options = {};
            }

            var self = this;
            // Use single observer for multi calls
            if (!this.domObserver) {
                this.listenerCount = 0;
                this.listeners = [];
                var MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;
                this.domObserver = new MutationObserver(this._observeCallback.bind(this));
                this.domObserver.observe(document.documentElement, {
                    childList: true,
                    subtree: true
                });
            }

            var listener = {
                selector: selector, fn: callback, options: options, index: ++this.listenerCount
            };
            this.listeners.push(listener);

            var timeout = parseInt(options.timeout, 10);
            if (!isNaN(timeout)) {
                listener.timeoutHandle = window.setTimeout(function () {
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
        waitForElement: function (selector, callback, timeout) {
            this.observeSelector(selector, callback, { timeout: timeout, once: true });
        },
        /**
         * Check each waitUntil listener
         * @private
         */
        _waitUntilChecker: function () {
            var listener,
                finishedListeners = [],
                i, c;

            for (i=0, c=this.waitListeners.length; i<c; i++) {
                listener = this.waitListeners[i];
                if (listener.condition()) {
                    finishedListeners.push(listener);
                    listener.callback();
                } else {
                    // Timeout reached?
                    if (listener.timeout && (((new Date()).getTime() - listener.start) >= listener.timeout)) {
                        finishedListeners.push(listener);
                    }
                }
            }

            // Remove finished listeners
            for (i=0, c=finishedListeners.length; i<c; i++) {
                this.waitListeners.splice(this.waitListeners.indexOf(finishedListeners[i]), 1);
            }

            if (this.waitListeners.length) {
                this.waitHandle = window.setTimeout(this._waitUntilChecker.bind(this), defaultOptions.waitInterval);
            } else {
                window.clearTimeout(this.waitHandle);
            }
        },
        /**
         * Wait until a condition returns true, then execute callback
         * @param conditionFunction, it should return true (condition matched) or false (condition not matched yet)
         * @param callback, will be called once the conditionFunction returns true
         * @param timeout, optional
         */
        waitUntil: function (conditionFunction, callback, timeout) {
            if (defaultOptions.debug) {
                if (!this.isFunction(conditionFunction)) {
                    throw new Error('waitUntil: conditionFunction parameter must be a function.');
                }

                if (!this.isFunction(callback)) {
                    throw new Error('waitUntil: callback parameter must be a function.');
                }
            }

            if (timeout != null) {
                timeout = parseInt(timeout, 10);

                if (isNaN(timeout) || timeout <= 0) {
                    throw new Error('waitUntil: timeout parameter must be an positive Integer.');
                }
            } else {
                timeout = defaultOptions.defaultWaitTimeout;
            }

            if (!this.waitListeners) {
                this.waitListeners = [];
            }

            // First check
            if (conditionFunction()) {
                callback();
                return;
            }

            var listener = { condition: conditionFunction, callback: callback, timeout: timeout };
            this.waitListeners.push(listener);

            if (timeout) {
                listener.start = (new Date()).getTime();
            }

            this.waitHandle = window.setTimeout(this._waitUntilChecker.bind(this), defaultOptions.waitInterval);
        },
        /**
         * Run a callback when changes (subtree, childList, characterData and attributes) happen on elements matched given selector
         * @param selectorOrElement: css selector or dom element
         * @param callback: callback function on change, e.g. function(mutationsList) {}, mutationsList is an array of MutationRecord
         * @param watchOptions: An optional MutationObserverInit object providing options that describe what DOM mutations should be reported
         */
        watchElement: function (selectorOrElement, callback, watchOptions) {
            var isSelector = typeof (selectorOrElement) === 'string';
            if (defaultOptions.debug) {
                if (isSelector&&!this.isValidSelector(selectorOrElement)) {
                    throw new Error('watchElement: ' + selectorOrElement + ' is not a valid css selector.');
                }

                if (!this.isFunction(callback)) {
                    throw new Error('watchElement: callback parameter must be a function.');
                }
            }

            var MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;
            var domWatcher = new MutationObserver(callback);

            if (!watchOptions) {
                watchOptions = {
                    childList: true,
                    subtree: true,
                    characterData: true,
                    attributes: true
                };
            }

            var elements;
            if (isSelector) {
                elements = document.querySelectorAll(selectorOrElement);
            } else {
                elements = [selectorOrElement];
            }

            for (var i=0; i<elements.length; i++) {
                domWatcher.observe(elements[i], watchOptions);
            }
        },
        /**
         * get user id (uuidv4)
         */
        getMojitoUserId: function () {
            var cookieName = '_mjo',
                expires = 730,
                userId = Cookies.get(cookieName);

            if (userId) {
                Cookies.set(cookieName, userId, { expires: expires });
                return userId;
            }

            /**
             * Fast UUID generator, RFC4122 version 4 compliant.
             * @author Jeff Ward (jcward.com).
             * @license MIT license
             * @link http://stackoverflow.com/questions/105034/how-to-create-a-guid-uuid-in-javascript/21963136#21963136
             **/
            var lut = [];
            for (var i = 0; i < 256; i++) {
                lut[i] = (i < 16 ? '0' : '') + (i).toString(16);
            }

            var randomFn = function () {
                var rand;
                try {
                    rand = crypto.getRandomValues(new Uint32Array(1))[0];
                } catch (e) {
                    rand = Math.random() * 0xffffffff;
                }

                return rand;
            };

            function e7 () {
                var d0 = randomFn() | 0;
                var d1 = randomFn() | 0;
                var d2 = randomFn() | 0;
                var d3 = randomFn() | 0;

                return lut[d0 & 0xff] + lut[d0 >> 8 & 0xff] + lut[d0 >> 16 & 0xff] + lut[d0 >> 24 & 0xff] + '-'
                    + lut[d1 & 0xff] + lut[d1 >> 8 & 0xff] + '-' + lut[d1 >> 16 & 0x0f | 0x40] + lut[d1 >> 24 & 0xff] + '-'
                    + lut[d2 & 0x3f | 0x80] + lut[d2 >> 8 & 0xff] + '-' + lut[d2 >> 16 & 0xff] + lut[d2 >> 24 & 0xff]
                    + lut[d3 & 0xff] + lut[d3 >> 8 & 0xff] + lut[d3 >> 16 & 0xff] + lut[d3 >> 24 & 0xff];
            }

            userId = e7();
            Cookies.set(cookieName, userId, { expires: expires });

            return userId;
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
        parseCookies: function () {
            var cookies = {}, i, pair, name, value, separated = document.cookie.split(';'), c = separated.length;
            for (i = 0; i < c; i++) {
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
        get: function (name) {
            var c = document.cookie, ret;
            var matches = c.match(new RegExp('(?:^|; )' + this.escapeString(name) + '=([^;]*)'));
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
        set: function (name, value, props, domain) {
            props = props || {};
            props.path || (props.path = '/');
            var exp = props.expires, d;
            if (typeof exp === 'number') {
                d = new Date();
                d.setTime(d.getTime() + exp * 24 * 60 * 60 * 1000);
                exp = props.expires = d;
            }

            if (exp && exp.toUTCString) {
                props.expires = exp.toUTCString();
            }

            value = encodeURIComponent(value);
            var updatedCookie = name + '=' + value, propName;

            if (!('domain' in props) && domain) {
                if (domain.indexOf('.') !== 0) {
                    domain = '.' + domain;
                }

                props.domain = domain;
            }

            for (propName in props) {
                updatedCookie += '; ' + propName;
                var propValue = props[propName];
                if (propValue !== true) {
                    updatedCookie += '=' + propValue;
                }
            }
            document.cookie = updatedCookie;
        },
        /**
         * Remove a cookie
         * @param name
         */
        remove: function (name) {
            document.cookie = name + '=;expires=Sat, 31 Jan 1970 16:00:00 GMT;path=/';
        },
        /**
         * Adds escape sequences for special characters in regular expressions
         * @param str
         * @returns string
         */
        escapeString: function (str) {
            return str.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, function (ch) {
                return '\\' + ch;
            });
        }
    };

    Utils.domReady = (function () {
        var fns = [],
            isPageLoaded = document.readyState === 'interactive' || document.readyState === 'complete' || document.readyState === 'loaded';

        function callReady () {
            isPageLoaded = true;
            while (fns.length) {
                fns.shift()();
            }
        }

        if (!isPageLoaded) {
            document.addEventListener('DOMContentLoaded', callReady);
        }

        function domReady (callback) {
            if (isPageLoaded) {
                callback();
            } else {
                fns.push(callback);
            }
        }

        return domReady;
    }());

    /*
     * JavaScript MD5
     * https://github.com/blueimp/JavaScript-MD5
     */
    (function ($) {
        function safeAdd (x, y) {
            var lsw = (x & 0xffff) + (y & 0xffff);
            var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
            return (msw << 16) | (lsw & 0xffff);
        }

        function bitRotateLeft (num, cnt) {
            return (num << cnt) | (num >>> (32 - cnt));
        }

        function md5cmn (q, a, b, x, s, t) {
            return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
        }

        function md5ff (a, b, c, d, x, s, t) {
            return md5cmn((b & c) | (~b & d), a, b, x, s, t);
        }

        function md5gg (a, b, c, d, x, s, t) {
            return md5cmn((b & d) | (c & ~d), a, b, x, s, t);
        }

        function md5hh (a, b, c, d, x, s, t) {
            return md5cmn(b ^ c ^ d, a, b, x, s, t);
        }

        function md5ii (a, b, c, d, x, s, t) {
            return md5cmn(c ^ (b | ~d), a, b, x, s, t);
        }

        function binlMD5 (x, len) {
            /* append padding */
            x[len >> 5] |= 0x80 << len % 32;
            x[(((len + 64) >>> 9) << 4) + 14] = len;

            var i;
            var olda;
            var oldb;
            var oldc;
            var oldd;
            var a = 1732584193;
            var b = -271733879;
            var c = -1732584194;
            var d = 271733878;

            for (i = 0; i < x.length; i += 16) {
                olda = a;
                oldb = b;
                oldc = c;
                oldd = d;

                a = md5ff(a, b, c, d, x[i], 7, -680876936);
                d = md5ff(d, a, b, c, x[i + 1], 12, -389564586);
                c = md5ff(c, d, a, b, x[i + 2], 17, 606105819);
                b = md5ff(b, c, d, a, x[i + 3], 22, -1044525330);
                a = md5ff(a, b, c, d, x[i + 4], 7, -176418897);
                d = md5ff(d, a, b, c, x[i + 5], 12, 1200080426);
                c = md5ff(c, d, a, b, x[i + 6], 17, -1473231341);
                b = md5ff(b, c, d, a, x[i + 7], 22, -45705983);
                a = md5ff(a, b, c, d, x[i + 8], 7, 1770035416);
                d = md5ff(d, a, b, c, x[i + 9], 12, -1958414417);
                c = md5ff(c, d, a, b, x[i + 10], 17, -42063);
                b = md5ff(b, c, d, a, x[i + 11], 22, -1990404162);
                a = md5ff(a, b, c, d, x[i + 12], 7, 1804603682);
                d = md5ff(d, a, b, c, x[i + 13], 12, -40341101);
                c = md5ff(c, d, a, b, x[i + 14], 17, -1502002290);
                b = md5ff(b, c, d, a, x[i + 15], 22, 1236535329);

                a = md5gg(a, b, c, d, x[i + 1], 5, -165796510);
                d = md5gg(d, a, b, c, x[i + 6], 9, -1069501632);
                c = md5gg(c, d, a, b, x[i + 11], 14, 643717713);
                b = md5gg(b, c, d, a, x[i], 20, -373897302);
                a = md5gg(a, b, c, d, x[i + 5], 5, -701558691);
                d = md5gg(d, a, b, c, x[i + 10], 9, 38016083);
                c = md5gg(c, d, a, b, x[i + 15], 14, -660478335);
                b = md5gg(b, c, d, a, x[i + 4], 20, -405537848);
                a = md5gg(a, b, c, d, x[i + 9], 5, 568446438);
                d = md5gg(d, a, b, c, x[i + 14], 9, -1019803690);
                c = md5gg(c, d, a, b, x[i + 3], 14, -187363961);
                b = md5gg(b, c, d, a, x[i + 8], 20, 1163531501);
                a = md5gg(a, b, c, d, x[i + 13], 5, -1444681467);
                d = md5gg(d, a, b, c, x[i + 2], 9, -51403784);
                c = md5gg(c, d, a, b, x[i + 7], 14, 1735328473);
                b = md5gg(b, c, d, a, x[i + 12], 20, -1926607734);

                a = md5hh(a, b, c, d, x[i + 5], 4, -378558);
                d = md5hh(d, a, b, c, x[i + 8], 11, -2022574463);
                c = md5hh(c, d, a, b, x[i + 11], 16, 1839030562);
                b = md5hh(b, c, d, a, x[i + 14], 23, -35309556);
                a = md5hh(a, b, c, d, x[i + 1], 4, -1530992060);
                d = md5hh(d, a, b, c, x[i + 4], 11, 1272893353);
                c = md5hh(c, d, a, b, x[i + 7], 16, -155497632);
                b = md5hh(b, c, d, a, x[i + 10], 23, -1094730640);
                a = md5hh(a, b, c, d, x[i + 13], 4, 681279174);
                d = md5hh(d, a, b, c, x[i], 11, -358537222);
                c = md5hh(c, d, a, b, x[i + 3], 16, -722521979);
                b = md5hh(b, c, d, a, x[i + 6], 23, 76029189);
                a = md5hh(a, b, c, d, x[i + 9], 4, -640364487);
                d = md5hh(d, a, b, c, x[i + 12], 11, -421815835);
                c = md5hh(c, d, a, b, x[i + 15], 16, 530742520);
                b = md5hh(b, c, d, a, x[i + 2], 23, -995338651);

                a = md5ii(a, b, c, d, x[i], 6, -198630844);
                d = md5ii(d, a, b, c, x[i + 7], 10, 1126891415);
                c = md5ii(c, d, a, b, x[i + 14], 15, -1416354905);
                b = md5ii(b, c, d, a, x[i + 5], 21, -57434055);
                a = md5ii(a, b, c, d, x[i + 12], 6, 1700485571);
                d = md5ii(d, a, b, c, x[i + 3], 10, -1894986606);
                c = md5ii(c, d, a, b, x[i + 10], 15, -1051523);
                b = md5ii(b, c, d, a, x[i + 1], 21, -2054922799);
                a = md5ii(a, b, c, d, x[i + 8], 6, 1873313359);
                d = md5ii(d, a, b, c, x[i + 15], 10, -30611744);
                c = md5ii(c, d, a, b, x[i + 6], 15, -1560198380);
                b = md5ii(b, c, d, a, x[i + 13], 21, 1309151649);
                a = md5ii(a, b, c, d, x[i + 4], 6, -145523070);
                d = md5ii(d, a, b, c, x[i + 11], 10, -1120210379);
                c = md5ii(c, d, a, b, x[i + 2], 15, 718787259);
                b = md5ii(b, c, d, a, x[i + 9], 21, -343485551);

                a = safeAdd(a, olda);
                b = safeAdd(b, oldb);
                c = safeAdd(c, oldc);
                d = safeAdd(d, oldd);
            }
            return [a, b, c, d];
        }

        function binl2rstr (input) {
            var i;
            var output = '';
            var length32 = input.length * 32;
            for (i = 0; i < length32; i += 8) {
                output += String.fromCharCode((input[i >> 5] >>> i % 32) & 0xff);
            }
            return output;
        }

        function rstr2binl (input) {
            var i;
            var output = [];
            output[(input.length >> 2) - 1] = undefined;
            for (i = 0; i < output.length; i += 1) {
                output[i] = 0;
            }
            var length8 = input.length * 8;
            for (i = 0; i < length8; i += 8) {
                output[i >> 5] |= (input.charCodeAt(i / 8) & 0xff) << i % 32;
            }
            return output;
        }

        function rstrMD5 (s) {
            return binl2rstr(binlMD5(rstr2binl(s), s.length * 8));
        }

        function rstr2hex (input) {
            var hexTab = '0123456789abcdef';
            var output = '';
            var x;
            var i;
            for (i = 0; i < input.length; i += 1) {
                x = input.charCodeAt(i);
                output += hexTab.charAt((x >>> 4) & 0x0f) + hexTab.charAt(x & 0x0f);
            }
            return output;
        }

        function str2rstrUTF8 (input) {
            return unescape(encodeURIComponent(input));
        }

        function hexMD5 (s) {
            return rstr2hex(rstrMD5(str2rstrUTF8(s)));
        }

        $.md5 = hexMD5;
    }(Utils));

    return {
        testObjects: {},
        addTest: function (testConfig) {
            if (this.options.excluded != null) {
                if (Utils.isFunction(this.options.excluded)) {
                    this.options.excluded = this.options.excluded();
                }

                if (this.options.excluded) {
                    Utils.log('Excluded from test by Mojito.options.excluded value.', 'warn');
                    return false;
                }
            }

            var testObject = new Test(testConfig);
            this.testObjects[testConfig.id] = testObject;

            return testObject;
        },
        getTest: function (id) {
            return this.testObjects[id];
        },
        Test: Test,
        Cookies: Cookies,
        options: defaultOptions,
        utils: Utils
    };
}());
