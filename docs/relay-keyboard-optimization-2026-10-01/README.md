# Keyboard improvement release

This implements the six engineering priorities identified from the first forty attempts. It does not rerun that cohort or establish a new overall keyboard winner. Historic results and released evidence files remain preserved.

- Resource hazards: release WASM prediction-result containers and any row handles on success or failure; share concurrent HMAC key-import work; bound Chunk candidate rendering and Token jump-page rendering.
- Draft clarity: Token displays a raw preformatted current draft. Search prefixes and proposed additions have separate markup. Current draft byte counts and whitespace details are visible; review asks the participant to check their intended text without claiming target validation.
- Token exact typing: direct ASCII in a persistent exact lane; byte additions preserve its selected range. Review and token choices remain directly discoverable. Incomplete UTF-8 remains unpublished. A leading UTF-8 BOM is preserved during decoding.
- Predictive coverage and word choices: persistent literal ASCII/Unicode browser, including Tab/LF/CR. Direct Top Words links now appear alongside the draft, using suggestions already calculated by the existing model. These new links add a next word without replacing typed text; historical completion actions keep their interpretation.
- Chunk payload and recovery: bounded 20/40-word candidate pages, retained START/INSIDE/END filtering, shorter help, explicit distinction between resetting search and editing text, and a link to restore the parent draft after clearing. Missing spellings remain reachable through the persistent exact lane.
- Prefix positioning: word-discovery menus explicitly require GET forms. The complete exact lane is available through ordinary links, retaining Prefix identity on shared routes. The registry no longer suggests that a strict supplied-link client can operate the form menus.

## Measured engineering outcomes

On the local `con` path, HTML fell from approximately 1,029 KB to 118 KB (88.6% reduction). Extracted-text token proxy fell from 21,720 to 3,839 (82.3% reduction); links fell from 2,342 to 524. The initial Chunk page's proxy fell from 4,098 to 3,456. These are page measurements, not agent billing tokens.

Token's eight-character `abc  \t\nZ` check uses eight activations after entering the exact lane. Its previous byte-browser pattern required opening the browser, choosing a range and appending a byte. The new exact entry page is larger because it exposes direct ASCII choices; this is an explicit payload/traversal tradeoff. Predictive's page is also larger because previously hidden direct word choices are now present.

The focused contracts publish exact Unicode/formatting replies through all four keyboards in localhost fixtures, verify receipt replay, separate Token search markup from the sole current draft, check bounded candidate pages with preserved constraints, and exercise 100 repeated model-backed requests without an HTTP error. They also check prediction-result disposal when row reading throws. The full Relay and benchmark recovery suites cover expiry, quotas, lost responses, branches, incomplete UTF-8 and near-limit messages.

[Raw measurements](MEASUREMENTS.json) retain all five HTTP samples per path. Local elapsed time is not Worker CPU time, client thinking time or WAN latency; no speed significance or confidence intervals are claimed. Historic Cloudflare 1102 responses do not identify which resource was exhausted. These repairs remove concrete hazards, but proving production stability and real agent improvement still requires a fresh release-frozen cohort. No model-ranking change is inferred from the earlier heavy character use.

The release uses method registry 1.5.0, protocol 0.27.0 and foundation 1.1.0. Earlier registry/schema routes and signed operations remain supported.
