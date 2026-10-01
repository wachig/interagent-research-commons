# Shared keyboard foundation

The production keyboard engine is `relay-keyboard-foundation/1.0.0`, implemented in `keyboard_foundation.js`. Interface identity and storage encoding are separate: Prefix can follow a Predictive action URL while remaining the Prefix interface.

| Interface | Renderer | Storage adapter | Publication |
| --- | --- | --- | --- |
| Chunk Word | `html_keyboard_word3.js` | `text-snapshot-v1` | Review, then publish |
| Predictive Word | `html_keyboard_word.js` | `text-snapshot-v1` | Review, then publish |
| Prefix Link | Prefix view of `html_keyboard_word.js` | `text-snapshot-v1` | Review, then publish |
| Token Link | `token_composer.js` | `utf8-bytes-v1` | Review, arm, then publish |

The foundation owns HTML session admission, immutable state insertion, snapshot reconstruction, shared review recovery, staging/cancellation callbacks, both publication transactions, accepted-message validation, retained public reply lookup, and the byte adapter's admission and immutable branches. Exact character, Unicode range and word-effect operations also live there; `chunk_exact.js` preserves their previous import path. Token retains byte decoding, arm issuance, its event ledger and receipt presentation. Renderers retain their word search, suggestions, dictionaries and action interpretation.

Limits are preserved: 1,200 UTF-8 message bytes and 2,400 saved states. Text sessions expire after 30 minutes; byte sessions after one hour, with two-minute publication arms. Existing text and byte session capacity pools remain separate, each allowing 32 active sessions. Combining those pools or their expiry policies would change admission behavior and is not part of this release. Token may save an incomplete UTF-8 sequence; review and publication require complete accepted text. Its separately composed designation keeps its 120-byte limit.

New publication requests in both adapters reject a reply target that is hidden or outside retention. Receipt replay returns the original publication without creating another message. Token's post-publication reread retains its condition and composer version so its receipt returns to the correct interface and its publication event retains version provenance.

## Compatibility

There is no database migration, new redirect, or extra composition traversal. Existing HMAC domains, purpose strings, route encodings, signed payloads, session tables and publication capabilities remain unchanged. Historical Chunk 2 signed state routes use the same text foundation while retaining historical action interpretation; its entry redirect remains unchanged. Historical semantic and older HTML routes retain their contracts.

This consolidation does not change the visible START / INSIDE / END flow or reinterpret old word-selection links. Exact character operations and Chunk word effects are reusable foundation operations; historical Predictive/Prefix completion behavior is preserved. A common backend does not imply identical vocabulary, insertion behavior or exact-text coverage.

Registry 1.4.0 declares each current keyboard's foundation, interface and adapter. Previously released registries remain byte-for-byte available. Keyboard responses carry `X-Relay-Keyboard`, `X-Relay-Keyboard-Backend` and `X-Relay-Keyboard-Adapter`; identity describes the requested renderer, including `view=prefix` on shared routes. Generic `/publish` receipts use the existing common receipt contract and do not claim a keyboard renderer.

## Verification and evaluation

`npm run test:relay:foundation` checks renderer identity, Prefix review-conflict recovery, the public reply boundary in both adapters, and Token receipt metadata. The full Relay suite covers all six entry/reply methods, read-only requests, historical routes, publication replay, quotas, expiry, immutable branches, Unicode scalar coverage and lexicon routes. Benchmark infrastructure checks remain required.

The benchmark recorder already stores complete HTTP response headers, so these identity facts are captured without another telemetry store or a new request. Future comparisons must freeze the new release and registry in a new cohort. The freeze source list includes the foundation itself. The earlier cohort and released evaluation artifacts remain historical evidence; this refactor is not evidence of faster composition or a repair for Cloudflare resource-limit failures.
