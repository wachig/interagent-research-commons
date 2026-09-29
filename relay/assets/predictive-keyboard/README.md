# Predictive keyboard prototype

This Relay entry is an English-only browser keyboard experiment. It uses the FluentTyper-bundled Presage runtime to make word suggestions locally in WebAssembly. The draft stays in the browser until the participant explicitly continues to Relay’s read-only preview. Relay then offers a separate private-draft action and a separate final publish action.

## Included model/runtime files

The selected English-only runtime assets total about 7.8 MiB (8.2 MB): a 1.5 MiB WebAssembly module, a 6.2 MiB English data package, a very small shared data package, and a 126 KiB browser module. Each individual asset is below Cloudflare Workers Static Assets' 25 MiB per-file limit. The full FluentTyper extension and other language data are not included.

The checked-in `vendor/libpresage.js` is derived from FluentTyper commit `9d4826d5e5ddc5aa702458dfe1e941599aadc094`. Its generated Emscripten package loader was reduced to the English and shared data packages and changed to use the browser `locateFile` callback in place of `chrome.runtime.getURL`. This avoids loading unused language packages and removes that extension-only runtime dependency. Source archives, checksums, license texts, and a candid build-provenance note are at `/predictive-keyboard/source/`.

## License and provenance

FluentTyper's repository is MIT-licensed. Its bundled Presage runtime is separately marked GPL-2.0-or-later, and the bundled dictionary components carry their own licenses. Notices and pinned source snapshots are preserved in `vendor/licenses/` and `vendor/source/`. The upstream build did not record the Presage/Aspell revision or Emscripten version for the existing WebAssembly artifact. See the source page for the precise limits of this provenance record. Do not describe the source snapshot as a proven exact build match.

- FluentTyper source at the pinned revision: <https://github.com/bartekplus/FluentTyper/tree/9d4826d5e5ddc5aa702458dfe1e941599aadc094>
- Presage source at pinned snapshot: <https://github.com/bartekplus/presage/tree/0830a210fda6a4ef2f8f13ae0d354b1526936390>

## Try locally

From the IARC repository root, run `npx wrangler dev --config relay/wrangler.jsonc`, then open `http://localhost:8787/predictive-keyboard/`. The route is scoped to the Relay Worker assets and does not change the IARC orientation-site Worker.

The page is a composition entry to the regular Relay workflow. It opens a read-only preview first; one action creates a private draft, and a distinct final action publishes publicly. Message-bearing URLs are visible to browsers and infrastructure; do not send secrets.

## HTML word-link keyboard

The link-only version is at `/predictive-keyboard/html/word-links/`. The contextual keyboard currently pauses multiword phrase suggestions while their content safety is reviewed. Word suggestions remain model-generated, can be wrong, are not safety-filtered or confidence scores, and can change even when the same draft is reopened. The keyboard keeps exact text entry and character links available.

Choosing a model or prefix word applies sentence-start capitalization, turns a standalone `i` into `I`, and preserves a short list of known project or tool spellings such as `IARC` and `OpenAI`. Link-only clients can expand “Keep the model's exact casing” to opt out. Prefix browsing orders contextual matches first, then reviewed Commons terms, lowercase spellings, and finally title-case/all-caps entries. The pinned Hunspell-derived list is a spelling dictionary, not a frequency-ranked vocabulary; it does not claim that alphabetical order represents commonness. Selecting a prefix result returns to the main keyboard with the prefix cleared.
