# Mojito utility functions

We've baked a series of utility functions into Mojito which we think are handy for a wide range of experiments. We often encounter race conditions or are waiting for an element to exist before we can do something on the page. These utilities will allow you to overcome the majority of these issues.

## Table of contents

- [`Mojito.utils.domReady()`](#mojito.utils.domready) - detect when DOM Content Loaded.
- [`Mojito.utils.waitForElement()`](#mojito.utils.waitforelement) - wait for a single element to exist before performing an action.
- [`Mojito.utils.waitUntil()`](#mojito.utils.waituntil) - wait until a condition is satisfied before performing an action.
- [`Mojito.utils.observeSelector()`](#mojito.utils.observeselector) - wait for elements to exist before performing an action.
- [`Mojito.utils.watchElement()`](#mojito.utils.watchelement) - watch for element mutations before performing an action.

## Mojito.utils.domReady()

### Description

A polyfill method to detect DOM Content Loaded, inspired by https://github.com/requirejs/domReady. Often used in trigger functions to delay activation until the DOM is ready.

### Syntax

`Mojito.utils.domReady(callback);`

Parameter | &nbsp;
--|--
**callback** <br> Type: *function* <br> *Required* | A function that's executed when the DOM is loaded.

Return value | &nbsp;
--|--
Type: *function* | This function returns itself, allowing for chaining.

### Example

Imagine you place the Mojito library inside the page header, but you need to Manipulate the DOM further down the page, you can delay experiment activation until DOM Content Loaded has fired.

```js
function(test){
    // If users are from Google, wait until Mojito.domReady() fires before activation
    if (document.referrer.indexOf('google.com') > -1) Mojito.utils.domReady(function(){
        test.activate();
    })
}
```

## Mojito.utils.waitForElement()

### Description

A function that executes a callback once the first selected DOM element is detected on the page. Under the hood, it's a simple wrapper of `Mojito.utils.observeSelector()`. Commonly used to wait for a specific element to exist before manipulating it or activating an experiment.

### Syntax

`Mojito.utils.waitForElement(selector, callback, timeout);`

Parameter | &nbsp;
--|--
**selector** <br> Type: *CSS selector* <br> *Required* | A CSS selector specifying the DOM element to wait for.
**callback** <br> Type: *function* <br> *Required* | A function that's executed once first matched element exists.
**timeout** <br> Type: *integer* or *null* <br> *Optional* | Time in milliseconds which the function will wait for the selected element to exist. Defaults to `Mojtio.options.defaultWaitTimeout` (2000ms by default). Set to `null` for no timeout.

Return value | &nbsp;
--|--
N/A | &nbsp;

### Example

Let's say you are transforming many elements on a page and one of the elements is injected by another script some time after DOM Content Loaded. We can delay activation until the moment the element gets injected.

```js
function(test){
    // Wait up to 4 seconds for an element to exist before activating experiment
    Mojito.utils.waitForElement('.someDelayedElement', test.activate, 4000);
}
```

## Mojito.utils.waitUntil()

### Description

A utility that executes a callback once a polled condition function returns true. Commonly used to run functions off the back of actions or changes on a page that can be detected with JS.

### Syntax

`Mojito.utils.waitUntil(conditionFunction, callback, timeout);`

Parameter | &nbsp;
--|--
**conditionFunction** <br> Type: *function* <br> *Required* | A function that returns a boolean. `true` if a condition is matched and `false` if a condition not yet matched.
**callback** <br> Type: *function* <br> *Required* | A function that's executed once **conditionFunction** returns `true`
**timeout** <br> Type: *integer*  <br> *Optional* | Total time in milliseconds which the function will poll the **conditionFunction**. Defaults to `Mojtio.options.defaultWaitTimeout` (2000ms by default). Polling interval defaults to `Mojito.options.waitInterval` (50ms by default).

Return value | &nbsp;
--|--
N/A | &nbsp;

### Example

Imagine that your experiment leverages a JS framework, e.g. jQuery, but Mojito is loaded before the framework. Premature activation will likely result in JS errors on the jQuery calls. We can delay the experiment from activating until jQuery has been included on the page.

```js
function(test){
    // Wait until jQuery exists on the page before activating
    Mojito.utils.waitUntil(function() {
        if(window.jQuery) {
            return true;
        }
        else {
            return false;
        }
    }, test.activate);
}
```

## Mojito.utils.observeSelector()

### Description

A wrapper of [MutationObserver](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver/observe) which is set to only observe the selected element being added to the DOM, and executing a callback once that happens. Commonly used to detect and manipulate elements that are dynamically injected independent of initial page load.

### Syntax

`Mojito.utils.observeSelector(selector, callback, options);`

Parameter | &nbsp;
--|--
**selector** <br> Type: *CSS Selector* <br> *Required* | A CSS selector specifying the DOM element to observe.
**callback** <br> Type: *function* <br> *Required* | A function that's executed once the matched element is added to the page. The first argument of the function is the matched element.
**options** <br> Type: *object*  <br> *Optional* | Three options can be specified: <br> `timeout` - Type: *integer or null* - Time in milliseconds to observe. Defaults to `null` (no timeout). <br> `once` - Type: *boolean* - If `true`, callback is invoked only on the first match, if `false` (default), callback is invoked on every match. <br> `onTimeout` - Type: *function* - Callback function if timeout is specified and no elements matched within given timeout.

Return value | &nbsp;
--|--
N/A | &nbsp;

### Example

Imagine you have a list of cross sell products on an ecommerce product page. You want to experiment with the styling of some of the products but its DOM elements are intermittently destroyed and created by some third party script. MutationObservers are an ideal way to deal with this scenario.

```js
function treatment() {
    function styleProduct(element) {
        // do some styling to certain products
    }
    // observe cross sell item nodes and style
    Mojtio.utils.observeSelector('#crossSellList .crossSellItem', styleProduct);
}
```

## Mojito.utils.watchElement()

### Description

A wrapper of [MutationObserver](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver/observe) which can be customised to observe specific mutations on the selected element, and executing a callback once the mutation(s) occur. Useful to detect DOM text node changes or attribute changes.

### Syntax

`Mojito.utils.watchElement(selectorOrElement, callback, options);`

Parameter | &nbsp;
--|--
**selectorOrElement** <br> Type: *CSS Selector or DOM element* <br> *Required* | A CSS selector or DOM element specifying the element to watch.
**callback** <br> Type: *function* <br> *Required* | A function that's executed once the matched element changes. The first argument of the function is an array of [`MutationRecord`s](https://developer.mozilla.org/en-US/docs/Web/API/MutationRecord).
**options** <br> Type: *object*  <br> *Optional* | An optional [`MutationObserverInit`](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserverInit) object providing options that describe what DOM mutations should be reported. Defaults: <br> ```{ childList: true, subtree: true, characterData: true, attributes: true }```

Return value | &nbsp;
--|--
N/A | &nbsp;

### Example

A DOM element houses intrinsic data via an attribute. You want to experiment with manipulating the element based on the attribute value but it's subject to dynamic updates from a third party script. Variant code will need to be able to handle when these values change.

```js
function treatment() {
    var priceElement = document.getElementById('foo');

    function transformElement(mutations) {
        // do something to the element
    }

    Mojito.utils.watchElement(element, transformElement, 
        {   
            // only watch for specific attribute changes
            childList: false,
            subtree: false,
            characterData: false,
            attributes: true,
            attributeFilter: ['data-unit-price-val']
        }
    );
}
```

## All done?

You may want to return to the main portion of the documentation.

 * [Back to experiment setup](./setup.md)
 * [Back to home](../README.md)

## Get involved

We'd be keen to see some PRs and your suggestions for additional functionality we can add to the Mojito utilities library!

* [Open an issue on Github](https://github.com/mint-metrics/mojito-js-delivery/issues/new)
* [Mint Metrics' website](https://mintmetrics.io/)