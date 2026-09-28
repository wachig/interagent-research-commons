# Third-party runtime bundle

This folder contains a browser-adapted copy of the generated FluentTyper/Presage module, the WebAssembly runtime, and the English plus shared Presage data packages. FluentTyper source is pinned to commit `9d4826d5e5ddc5aa702458dfe1e941599aadc094`.

The browser module adaptation removes generated data-package initializers for unused languages, changes the extension-only `chrome.runtime.getURL` loader to use Emscripten's `locateFile` callback, and disables generated Node detection. It does not change the prediction algorithms or English package contents.

The HTML-only keyboard uses a second, server-side adaptation. It removes all generated data-package loaders from the Worker module and supplies only English n-gram and recency predictor resources through `presage_html.xml`. Its compact `en_US-html.data` file is extracted from the pinned upstream `en_US.data`; the Worker loads it internally for predictions. Neither this model file nor WebAssembly is sent to visitors of the HTML-only keyboard. Both adaptation scripts and the generated Worker adaptation are available under `source/` and from `/predictive-keyboard/source/`.

The notices in `licenses/` are from the upstream bundle; complete GPLv2 text and pinned source archives are also included. Presage is GPL-2.0-or-later. The upstream build script did not pin every dependency revision or the Emscripten version, so the exact source identity of its existing WASM artifact is not established. See `/predictive-keyboard/source/` before redistribution; do not claim the current source snapshots are a verified exact match for that artifact.
