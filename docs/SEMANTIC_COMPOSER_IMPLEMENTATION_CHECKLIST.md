# Semantic Composer implementation checklist

Status: local core implemented; not deployed. Contextual prediction remains disabled. The current build offers fixed starter choices and a pinned deterministic vocabulary while preserving literal and typed entry lanes.

## Implemented locally

- [x] Read repository architecture and preserve the pre-existing plan documents.
- [x] Pure versioned document model with Unicode validation, exact stored-text continuity, formatting rules, UTF-8 byte ceiling, and unit tests.
- [x] Additive SQLite tables, state and aggregate logical-storage quotas, cleanup/alarm handling, signed action envelopes, and immutable idempotent branches.
- [x] No-JavaScript overview, start, state, word/prefix, literal-character, exact-text, formatting, review, discard, and publication flows.
- [x] Atomic review claim/finalization and integration with the existing Relay publish transaction.
- [x] Preserve link-only layout after a choice; direct branch response, undo, publication replay, graph retirement, and discard are covered by local integration checks.
- [x] Pinned Hunspell-derived English lexicon, reproducible build script, integrity-checked shards, source/license links, and deterministic prefix navigation.
- [x] Protocol 0.19.0, collection 1.3.0, message 1.1.0 schemas; historical schema routes retained; privacy notice 1.8.0 and historical notice 1.7.0 link; protocol, entry brief, service bootstrap, reply chooser, and change ledger updated.
- [x] Feature gate enabled only in local/preview configs; production pilot remains disabled.
- [x] Pure document tests passed.
- [x] `npm run test:relay:integration` passed locally with Wrangler bound to localhost.
- [x] Bootstrap measured at 1,960 bytes against its 4 KiB target.

## Required before production enablement

- [x] Coarse network-wide limiter: Cloudflare rate-limit binding allows 120 composer GET requests per source network per minute per location; public-beta configuration fails closed when the binding is absent. The source address is not persisted in Relay application tables.
- [ ] Measure physical SQLite growth under maximum branching, concurrent use, cleanup, and reuse; compare against the 192 MiB feature budget and shared Relay object headroom. Logical limits are implemented, but physical usage is not proven.
- [ ] Browser-test GET form behavior and link-only traversal in a real browser, including at least one second browser engine; verify implicit submission and no accidental duplicate actions.
- [ ] Exercise expiry and concurrent race behavior under sustained integration/load conditions; basic idempotent/replay/discard paths pass the existing local integration run.
- [x] Run the full repository suite (`npm test`): site checks, Relay integration (including concurrent identical branch replay), and egress sandbox probe all passed.
- [ ] Audit final preview binding and production gate values immediately before any separately authorized deployment.

## Deliberately deferred

- [ ] Benchmark Presage or another predictor in an isolated preview for CPU, memory, candidate quality, and overlapping contexts. No generated word/phrase predictions are enabled; no performance claim is made.
- [ ] Only after benchmark evidence and explicit production-readiness review, consider independently enabling word and phrase prediction.

No preview or production deployment, Git commit, or push has been performed as part of this implementation task.
