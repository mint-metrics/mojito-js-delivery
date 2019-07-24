# Build, preview, launch and takedown

Previous: [container settings & tracking customisation](customisation.md).

## Building the JS container

1. (Optional) Customise your Mojito container name in [`repo/config.js`](../config.js)
2. If you haven't done so already, install the necessary NPM packages: ```npm install```
3. Build your Mojito container: ```gulp scripts```

## Previewing experiments

Previewing experiments is accomplished by using URL parameters to force specific variants to render.

### Syntax

`mojito_{id}={variant_id}`

Token | &nbsp;
-- | --
`{id}` | Experiment id to be previewed
`{variant_id}` | Recipe/variant id to render

### Example

`https://mywebsite.com/?mojito_ex2=1`

This forces the treatment variant of our [simple experiment](setup.md#yaml-setup) to be displayed on `mywebsite.com`.

### Notes

- Forced variants **will** respect experiment trigger activation conditions

- Forced variants **will not** respect an experiment's `state`, i.e. forcing works in both live and staging mode

- Multiple experiments can be forced at the same time by stringing URL parameters, e.g. `https://mywebsite.com/?mojito_w1=1&mojito_w2=1`

- Forcing variants will cookie you to that variant across pages and sessions. To return to the control variant, you can:

    - Force the control variant using URL parameters as above,

    - Or delete the cookie: `_mojito_{id}-staging`

## Launch & takedown

### Launch

To launch an experiment, set its `state` parameter to `live` and check that `sampleRate` is set to a value greater than 0. E.g. `0.1` for 10% or `1` for 100%.

### Takedown

To takedown an experiment, set its `state` parameter to `staging` (to keep the test in the container) or `inactive` (to archive the test from the container).

[Read more about experiment parameters](docs/setup.md#experiment-parameters).

Following any changes, you’ll need to [build](#building-the-js-container) and publish your container.

## Next steps

To use Mojito in a production site, you'll likely need to host the container on a CDN before including it in your site's header. [Find out more about hosting and publishing](./hosting.md).

You might also want to check out [Mojito's JS utilities](./utilities.md) that are handy to get around some common experiment setup issues. 