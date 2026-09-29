# Hierarchical semantic composer: implementation plan

Status: proposed implementation, not implemented or deployed.
Prepared against the IARC checkout on 2026-09-28. Revised after implementation review on the same date; protocol baseline reverified as 0.18.0.

## 1. Outcome and scope

Build a new, server-rendered Relay composer in which a participant chooses the largest useful unit of language available: phrase, word, expanded vocabulary, prefix lookup, character composition, or ordinary typed text. All six paths must work without page JavaScript. Every addition changes a private draft; publication remains a separate explicit action after review.

Use `/compose/semantic/` as the proposed new route. Keep every existing composer available. Link the new mode from the Relay entry page and message reply choices once its tests pass. The main IARC website may link to this mode, but the implementation belongs to the **Relay Worker**, not the orientation-site Worker or ARC publication system.

This plan authorizes no deployment itself. The present deliverable is a build specification. A future implementation task should finish local work and verification, then follow the deployment authorization in effect for that task.

### Release recommendation and explicit staging

Deliver the dependable composition/state/publication foundation first. All six lanes remain the target architecture, but **expanded statistical prediction and generated phrases are optional experiments, not a gate on the core release**. Keep atomic phrase support in the document/action engine from the start; a small reviewed phrase palette may be offered as “Starter phrases,” never as contextually predicted text. Direct words and the select can similarly use clearly labelled deterministic vocabulary when prediction is disabled.

The core release is not completion of the full predictive concept: record which predictive features are deferred and retain their tests/specification for a later release. Run the short feasibility spike below before investing in phrase search. Do not enable an unmeasured predictor merely because the legacy keyboard already uses it.

### Initial product decisions

- If its feasibility gate passes, show up to 6 predicted phrases, each containing 2–5 words; otherwise show an optional labelled starter phrase palette.
- Show up to 16 direct next-word buttons.
- Put up to 40 additional, nonduplicate words in a labelled select with an explicit **Add selected word** button.
- Provide a complete deterministic prefix browser over a pinned English lexicon, including a reviewed ARC/IARC vocabulary supplement.
- Keep an exact character/literal lane and a normal textarea.
- Use ordinary GET submit forms for the initial version, matching Relay's existing constrained-client transport. Explain that text entered into these forms can appear in URLs. Do not introduce POST support in this first version; it can be added as a separately tested transport later.
- Provide an explicit **Links only** view of the same composer for clients that can follow anchors but cannot submit forms. Link choices use the same validation and state transition engine.
- No external prediction API, new account system, browser storage requirement, or JavaScript dependency.
- English prediction is an initial scope limit; typed and literal text retain supported Unicode. Do not describe English vocabulary coverage as universal.

The efficiency target is **one activation and one HTTP request per ordinary word or phrase commit**, returning the updated draft directly. Session start, browsing, changing formatting in the links-only view, review, and publication are additional requests. Avoid redirects on the addition path. These are design targets, not measured claims about existing clients.

## 2. Verified repository facts and integration map

These facts come from the local source, not a fresh production audit. Recheck them before implementation if the checkout changes.

| Existing file | Relevant behavior | Implementation instruction |
|---|---|---|
| `relay/html_keyboard_word.js` | Immutable parent/child draft states, 30-minute sessions, 1,200-byte messages, 32 active sessions, 2,400 states/session, snapshots every 16 steps | Reuse the lifecycle and idempotency patterns. Keep its existing route and draft representation intact. |
| `relay/html_keyboard_word.js`, `makeChild()` | Prediction picks replace a partial trailing word and append a trailing space | Do not copy this text transformation into the semantic composer. Semantic selections append complete units. |
| `relay/html_keyboard.js`, `predict()` | Presage adapter returns up to ten predictions; predictor instance has mutable context | Extract a reusable adapter with explicit limits and safe serialized access; preserve the ten-result default for old callers. |
| `relay/html_keyboard.js`, response headers | `form-action 'none'` currently blocks forms | Give the new mode its own response helper with `form-action 'self'`. Keep scripts prohibited. |
| `relay/html_keyboard_presage.js` | Generated Presage runtime | Do not manually edit generated runtime code. Use the existing vendor build sources if a runtime change is actually needed. |
| `relay/runtime.js`, `handleRequest()` | Routes composers, gates methods and writes, creates/discards publication drafts | Register the new route before general rejection/routing. Adapt the existing review/publication bridge. |
| `relay/runtime.js`, publication transaction | Cleans up existing keyboard states after successful publication | Extend cleanup for the new semantic tables atomically with successful publication. |
| `relay/schema.js` | Schema declarations for existing keyboard and token-composer storage | Add separate semantic tables; existing operation CHECK constraints do not accept new semantic actions. |
| `relay/worker.js` | SQLite-backed `RelayStore`, `RelayDatabase` adapter, table allowlist, cleanup alarms | This is not a new D1 database. Add tables to the allowlist and expiry/alarm logic. |
| `relay/worker.js` | Storage RPC limit 32,768 bytes; batches at most 16 statements | Keep operations within these limits; do not send large lexicons or oversized candidate collections through RPC. |
| `relay/tests/integration.mjs` | Local Worker integration, schema and protocol assertions | Integrate end-to-end coverage here or invoke a new suite explicitly from package scripts. |
| `package.json` | Site, Relay integration, egress, and canonical read-only smoke scripts | Preserve existing tests and deployment separation. |
| `relay/wrangler.preview.jsonc` | Separate preview Worker/store | Use preview for future remote verification. |
| `scripts/deploy-relay-production.mjs` | Validates Relay target and deploys `relay/wrangler.pilot.jsonc` | Use the Relay command for a future authorized Relay release. |

Documentation has some historical statements: for example, `relay/README.md` mentions older message/collection schemas while current runtime and integration assertions reference message 1.0.0, collection 1.2.0, and protocol 0.18.0. Read current runtime and schemas before choosing a new version. Do not copy a version number from an older paragraph.

## 3. Architecture and invariants

Separate four concerns:

1. **Document engine:** validates additions and renders exact message text.
2. **Suggestion engine:** proposes optional additions using pinned local assets.
3. **State engine:** saves immutable branches, authorizes actions, limits resource use.
4. **HTML interface and publication bridge:** exposes accessible controls and stages the exact reviewed message through existing Relay publication machinery.

Every mode calls the same document and state engines. A selected phrase is one operation containing several words, so Undo removes the entire phrase. Undo follows the parent state; it never deletes or rewrites it. Each node has one parent: this is a branching tree, a special case of a DAG. Do not implement branch merging.

Required invariants:

- Never silently choose a suggestion or publish an addition.
- Phrase and word candidates are append-only semantic additions; they do not guess that an existing last word should be replaced.
- Changing input mode, browsing vocabulary, or changing display options does not change the document.
- Repeating a valid addition request resolves to the same child state, including under concurrent requests.
- Replaying a valid action is independent of a newly computed prediction list.
- Draft, review, staged body, and published body use exactly the same rendered text.
- Reply target is fixed at session start and carried through every mode.
- HEAD and OPTIONS never create sessions, branches, candidate records, or pending messages.
- All private pages and error responses retain no-store, no-referrer, noindex/noarchive, and frame protections.
- Session capabilities authorize access; readable encodings do not provide confidentiality or verified identity.
- Prediction failure must leave prefix, literal, typing, and review paths usable.

## 4. Concrete document contract

Create `relay/semantic_document.js` as a pure module without Worker globals, storage, or HTML.

Use versioned structured chunks. Example:

```js
{
  version: 1,
  chunks: [
    { kind: "semantic", words: ["I", "think"], case: "as-is",
      wrapper: "none", suffix: "none" },
    { kind: "semantic", words: ["this", "is", "better"], case: "as-is",
      wrapper: "none", suffix: "." }
  ]
}
```

Define the following chunk kinds:

- `semantic`: nonempty word array, case enum, wrapper enum, suffix enum. Words must match the v1 grammar below. Contractions and hyphenated words remain single words.
- `literal`: exact supported text, including spaces/newlines, with `joinBefore: "exact" | "space-if-needed"`. Default typed whole-text additions to `exact`; character construction of a new word defaults to `space-if-needed`. Show this choice explicitly before commit.
- `punctuation`: one allowed standalone mark, appended directly to the existing text. This permits adding punctuation after a word was already committed.

Semantic-word grammar (Unicode regular expression, applied to the entire string):

```js
/^[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['’\-][\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*$/u
```

Allow letters/numbers, attached combining marks, and internal ASCII/curly apostrophes or ASCII hyphens. Reject leading/trailing separators, punctuation-only values, whitespace, format/control characters, underscores, URL syntax, and emoji from the semantic lane; these remain available in the literal lane. Cap each word at 80 Unicode scalar values and 320 UTF-8 bytes. Preserve original normalization/spelling; lexicon search keys may be normalized separately. Test decomposed accents, `don't`, `it's`, `state-of-the-art`, numbers, and rejected `https://…`/`a_b` values.

Formatting enums:

```text
case:    as-is | initial-capital | upper
wrapper: none | quote | parenthetical
suffix:  none | . | , | ? | ! | : | ;
```

Renderer rules, in order:

1. Validate every chunk; reject unknown keys/enums, controls forbidden by Relay, invalid surrogate sequences, and oversized input.
2. Join a semantic chunk's words with one ASCII space. Apply explicit case selection; `initial-capital` changes only its first cased character, and `upper` changes all cased letters. Do not lowercase the rest or implicitly capitalize proper names. Use locale-independent ECMAScript `toUpperCase()` for both case operations; explicitly accept expansions such as `ß → SS`, and test `i → I` plus decomposed accents. Identify the first cased scalar by whether upper/lower mappings differ. Record `renderer_version` and runtime compatibility date. Locale-specific casing is not inferred.
3. Add `“…”` or `(…)` when selected. Put suffix punctuation **outside** the wrapper in v1. State this convention beside formatting controls; it is a deterministic convention, not a universal typography rule.
4. When appending a semantic chunk, insert one space if preceding output is nonempty, does not end in whitespace, and does not end in an opening `(`, `[`, `{`, or `“`. Never trim prior text.
5. Append standalone punctuation without inserting a space. If prior text ends in whitespace, reject with a useful edit/undo explanation instead of silently deleting literal whitespace. Disable punctuation on an empty draft.
6. Append literal text byte-for-byte after the selected boundary separator. Never autoformat its internal text, URL, identifier, repeated spaces, or line breaks.
7. Measure the resulting UTF-8 bytes after case conversion, wrappers, punctuation, and separators; reject above 1,200 bytes without saving a child.
8. Semantic-only output has no artificial trailing space. Explicit literal whitespace is preserved, not treated as corruption.

The original concept's “words never contain spaces” applies to semantic word values, not arbitrary typed text. This distinction is essential to preserve names, code-like strings, and URLs.

Export proposed functions `validateDocument`, `renderDocument`, `applyAddition`, and `documentByteLength`. Once a child is created, its persisted `rendered_text` is authoritative for display, review, and publication. Do not rerender historical chunks using a newer runtime's Unicode tables. Render each new addition once and join it to the parent's stored exact text; snapshot reconstruction restores stored operations/formatting data without recomputing old casing. Store a UTF-8 body digest and verify it on load/staging. A renderer-version change applies only to new sessions, with compatibility handlers for still-active sessions. Keep prediction context separate: append a virtual space when asking for the next word, without storing that space in the draft.

Required unit fixtures include:

| Operations | Exact result |
|---|---|
| word `I`, word `think`, phrase `this is better` with period | `I think this is better.` |
| word `don't`, word `stop` with exclamation | `don't stop!` |
| word `hello`, standalone comma, word `world` | `hello, world` |
| phrase `draft only`, parenthetical, period | `(draft only).` |
| literal `https://example.org/a?b=c`, exact | Identical URL |
| literal containing two spaces and newline | Identical whitespace |
| semantic word after literal opening parenthesis | No inserted space after `(` |

## 5. Storage and action contract

Create `relay/semantic_store.js` and add three tables in `relay/schema.js`:

1. `semantic_sessions`: `session_id` primary key, `root_state_id` unique, `reply_to`, `composer_version`, `model_version`, `lexicon_version`, `created_at`, `expires_at`, nullable `published_at` and `message_id`; `status` (`editing`, `review-staging`, `review-ready`, `published`), `review_attempt_id`, monotonic `review_generation`, `review_state_id`, `review_lease_until`, and quota counters.
2. `semantic_states`: `state_id` primary key, `session_id`, nullable `parent_state_id`, `operation_json`, nullable `snapshot_json`, `rendered_text`, `body_digest`, `renderer_version`, `body_bytes`, `action_digest`, `depth`, `created_at`; unique `(parent_state_id, action_digest)`; index `(session_id, depth)`.
3. `semantic_publish_links`: `publish_cap_hash` primary key, `session_id` unique, `state_id`, `review_attempt_id`, `review_generation`, `created_at`; binds a staged publication to the exact branch and review claim.

Store compact validated operations plus a full structured snapshot at the root and every 16 additions, following the existing keyboard pattern. Persist exact rendered text on **every** state so review and later runtime changes cannot change the message. Reconstruct structured history from the closest ancestor snapshot and at most 15 operations; validate session membership and bounded depth. Do not create snapshots merely because a page is read.

Concrete starting budget:

- 32 active sessions; **512 states per session**, reduced from 2,400; at most 256 chunks per document.
- Cap the total serialized non-snapshot row payload, including operation, exact body and metadata, at **4 KiB**. Cap snapshots at **12 KiB**; enforce serialized UTF-8 lengths before storage.
- Bound: `32 × 512 × 4 KiB = 64 MiB` plus at most `32 × 33 × 12 KiB = 12.375 MiB` in snapshots, or **76.375 MiB logical state payload**. Root rows count against the state quota; 33 snapshots is a conservative bound.
- Set a separate **80 MiB aggregate logical semantic-state quota**, enforced transactionally with session counters and released during cleanup. Review/session/rate-limit records must also have bounded counts and expiry.
- Reserve a provisional **192 MiB physical database growth budget** for the feature, including indexes/page overhead. This is an acceptance threshold, not an assertion that overhead will fit. Load-test maximum branching and expiry cycles; measure allocated SQLite pages before/after, reuse after deletion, and storage alongside existing Relay messages/reports/token graphs. Lower caps if the threshold is exceeded.
- No standalone session cap can guarantee shared-object capacity. Before enabling, verify account plan, current database use, account-wide storage headroom, and cleanup behavior. Fail closed on allocations near the measured capacity threshold; retain reads/discard/cleanup. Do not auto-VACUUM production.

The superseded full-snapshot proposal permitted `32 × 2,400 × 12 KiB = 900 MiB` of document JSON alone, before exact text, operations, indexes, and existing Relay data. Cloudflare currently documents 1 GB per SQLite object on Free and 10 GB on Paid (decimal GB). The lower application budget must still be tested on the actual shared object. [Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits/)

Add rate limits **before expensive prediction/rendering and mutations**, beyond session-start throttling: initial budgets of 120 composition/view requests per session per minute, 60 new additions per session per minute, and 20 prediction generations per session per minute. Add a coarse network request limiter (initially 120/minute per network per location); tune with shared-network accessibility tests. Use bounded fixed-window records/counters, never unbounded keys. These are proposed application settings, not platform guarantees. If prediction alone is throttled, return the page with deterministic vocabulary; mutation throttling returns 429 with Retry-After. Avoid placing expensive prediction on HEAD. Verify worst-case storage requests remain under 32,768 bytes including JSON escaping, and batches remain within 16 statements.

Use 30-minute non-sliding sessions. Add tables to `RELAY_TABLES`. Create schema additively using the existing constructor pattern; do not rename the Durable Object class, change its store identity, or invent a Wrangler class migration for ordinary table creation.

### Signed action envelope

Create `relay/semantic_actions.js`. Use the existing capability secret and signing conventions with a new domain separator, `semantic-action-v1`. Each server-issued action binds:

```text
session ID, parent state ID, operation kind,
exact candidate payload or lexicon word ID,
model/lexicon/composer versions, expiry, action scope
```

Candidate buttons carry a signed envelope, not an arbitrary trusted word string. The envelope contains exact proposed words so a previously displayed choice remains usable if ranking changes. Enforce strict payload and URL size limits. Do not require the word to still be in the current top N at commit time.

Formatting fields are user-selectable and therefore cannot be fixed inside one candidate envelope: validate them against the enums, then include them in the canonical action digest. A typed-text envelope authorizes bounded literal insertion at one parent, not arbitrary operations; validate the supplied text separately and include its exact content and boundary policy in the digest.

On mutation:

1. Validate method, request size, parameters, capability signature, expiry, session status, and parent membership.
2. Resolve the exact addition. Compute a canonical digest over parent + addition + formatting + schema version using stable serialization.
3. If that child already exists, verify stored identity and return it. Still require an active session; publication/expiry must retire old links.
4. Apply the pure engine and enforce byte, chunk, and state quotas.
5. Atomically insert the child with unique parent/action identity and session/quota predicates, requiring `status = editing` in the same transaction as counter updates. Use the existing storage transaction/batch model; never rely on a read-then-insert count alone.
6. Load the winning row and render it. Concurrent identical requests converge; different additions from the same parent create siblings.

Typed GET forms must submit to a clean action path with required parameters in hidden controls: browsers can replace an action URL's query string. Reject repeated/unknown parameters. A form submitted without a chosen action returns an explanatory page with the unchanged draft.

## 6. Suggestion engine and vocabulary

### Step 0: short prediction feasibility spike (before phrase implementation)

Current evidence: the JS adapter forces ten suggestions; `presage_html.xml` sets `PREDICT_TIME` to 1000 and `MAX_PARTIAL_PREDICTION_SIZE` to 60. Neither is proof of available candidates, actual CPU usage, or hard preemption. Preview/production Wrangler configs contain no `limits.cpu_ms`, and observability is disabled. Those files do **not** establish the account's billing plan or dashboard overrides.

1. Make an isolated benchmark harness with synthetic public strings. Measure 10, 16, 40, and 64 requested results and bounded 2/4/8/20-call phrase workloads. Record actual returned count and grammar-valid count; requested count is not coverage.
2. Profile whole requests and predictor-only cost separately, including cold initialization, warm iterations, maximum draft size, prefixes, and overlapping request load. Measure CPU, wall time, peak JS/WASM memory and allocations retained after repeated calls.
3. Local wall-clock timings are insufficient. Use local CPU profiling for triage, then authorized isolated-preview invocation CPU metrics for the enablement decision. Record actual account plan/configured CPU budget and temporary synthetic-only telemetry; do not enable production content logging. If preview evidence/plan is unavailable, leave expanded prediction disabled.
4. Require zero resource-limit failures; proposed headroom is p95 whole-request CPU below 50% and worst observed CPU below 80% of the effective configured limit, plus measured peak isolate memory below 75% of its documented limit under the tested load. Document sample counts (at least 100 warm requests per variant and 10 fresh initializations locally), deployed version, and limitations of sampling. Missing CPU or memory evidence means “not established,” not “passed.”
5. Select only a measured workload. Reduce result counts/calls, use deterministic vocabulary, or defer phrases if needed. Enable word predictions and phrase predictions independently. The 64-result/20-call design below is an experimental upper bound, not a default.

Cloudflare currently documents 10 ms HTTP-request CPU on Workers Free, Paid default 30 seconds configurable up to five minutes, and 128 MB memory **per isolate**, including WASM. This is separate from the Durable Object's own CPU allowance; prediction currently executes in the outer Worker. Do not move it into the object merely to obtain another limit without a separate design review. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)

### Step A: extract the existing predictor safely

Create `relay/semantic_predictor.js` or a small shared adapter used by it. Preserve `predict(env, request, draft)` behavior for old callers. Add a new bounded API returning `{text, probability}` where Presage supplies an actual probability; never fabricate confidence values.

The shared Presage instance has mutable context. Keep context assignment, prediction, and output copying within a serialized critical section. Phrase expansion must not interleave contexts across requests. Release native vectors/resources according to the vendor API after copying results. Add a test with overlapping requests and different contexts.

Use pinned local assets only through the existing static-assets binding. Cache model initialization and public vocabulary shards, not unbounded private draft contexts. Failure must yield a small labelled starter vocabulary or no suggestions, with other lanes still available.

### Step B: word suggestions

1. Render draft and derive a next-word context with a virtual boundary.
2. Ask for up to 64 candidates through the new adapter, after verifying its supported configuration.
3. Filter whitespace-containing results, control characters, oversized entries, and additions exceeding the message ceiling.
4. Deduplicate case-insensitively for ranking while preserving displayed spelling; use deterministic code-point tie breaks.
5. Take the first 16 for direct buttons and the next 40 for the select.
6. If the predictor produces fewer entries, display fewer. Supplement only with clearly labelled lexicon/starter words; do not claim those are contextual predictions.

### Step C: whole-phrase predictions

Use conditional expansion of the same local predictor, not independent word dropdowns.

1. Begin from the current context; expand top next-word alternatives.
2. For each retained partial phrase, append its words to a temporary context before predicting its next word.
3. Limit beam width to 4, candidate expansions per node to 4, depth to 5 words, and predictor calls to 20 per page. Enforce a measured time budget between calls; a timer cannot interrupt synchronous WASM execution.
4. Retain 2–5-word candidates. Rank with length-normalized log probability if valid probabilities exist; otherwise use deterministic rank-based scoring and expose no confidence percentage.
5. Deduplicate exact phrases and reduce near-identical prefixes so six buttons do not all begin identically.
6. Return at most six phrases within the byte ceiling; label them **Suggested continuations**. When unavailable, omit this section or show a short unavailable message.

Use only workload bounds approved by Step 0. Record CPU and wall latency separately; there is no assumed 100 ms budget. Timers cannot enforce a CPU budget or interrupt a synchronous prediction. Keep the phrase feature disabled until its whole-request evidence passes. Do not remove fallback modes to make benchmarks pass.

### Step D: build a complete prefix lexicon

Add these proposed files:

```text
relay/semantic/lexicon-source.json
relay/semantic/domain-words.txt
relay/semantic/build-lexicon.mjs
relay/assets/semantic-lexicon/manifest.json
relay/assets/semantic-lexicon/shards/...
```

The source manifest records source URL, exact version, checksum, license, attribution, and build instructions. First inspect the bundled vocabulary assets for a usable licensed word list; if unavailable, choose and document a redistributable source before shipping. Do not treat the compressed Presage model as a readable dictionary or silently scrape a private corpus.

1. Target at least 30,000 unique usable English words plus contractions and reviewed domain terms. Verify the actual count in the manifest.
2. Include `agent`, `alignment`, `autonomy`, `context`, `model`, `inference`, `recursive`, `recursion`, `relay`, `synthesis`, and `spectral` as explicit fixtures.
3. Keep original spelling for insertion; use normalized lowercase lookup keys for navigation. Normalization is for search, not a rewrite of literal text.
4. Build prefix shards with exact matches, ranked candidates, complete child-prefix lists, and stable cursors. Limit shard size to 64 KiB by subdivision; avoid a full vocabulary scan per request.
5. Display at most 24 words per prefix page. Rank by documented frequency/domain boosts, then stable spelling order. Always provide pagination to every matching word.
6. Display all immediate child prefixes, with pagination if needed. Include a breadcrumb, one-level Back, and Return to draft.
7. Support `R → recursion` and `S → SP → SPE → spectral` using the checked-in fixture ranking. Prefix navigation changes only the view; clicking a word commits it.
8. For no matches, retain the current prefix and offer the character lane. No-matches must never trap the participant.

Contextual ranking may improve the first visible words later, but deterministic complete navigation is required in v1. No runtime corpus ingestion is necessary.

## 7. Routes and no-JavaScript HTML

Create `relay/semantic_composer.js` and register it in `relay/runtime.js`.

| Proposed route | Effect |
|---|---|
| `GET /compose/semantic/` | Read-only overview and signed Start choices; no session creation |
| `GET /compose/semantic/start?...` | Explicit, idempotent session creation, including signed reply target |
| `GET /compose/semantic/state/:state` | Read existing draft and render choices |
| `GET /compose/semantic/add?...` | Validate signed action, commit one addition, return updated draft directly |
| `GET /compose/semantic/find/:state?...` | Browse prefix and page; no document mutation |
| `GET /compose/semantic/characters/:state?...` | Show literal buffer and supplied character links |
| `GET /compose/semantic/type/:state` | Show typed input form |
| `GET /compose/semantic/review/:state` | Stage exact current text, then show distinct Publish action |
| `GET /compose/semantic/discard?...` | Invalidate associated pending draft/capability, return to its branch |
| Existing `/publish?cap=...` | Existing final explicit publication boundary |

Read routes support HEAD without mutation; mutation routes reject HEAD. OPTIONS returns method metadata only. Reject POST/PUT/DELETE in v1. Apply existing admission/start-rate rules and fail-closed configuration behavior. For the new mode, gate session creation, additions, and review on the effective write switch; reads, Undo navigation, and discarding an unpublished draft remain available. Final publishing must still check the switch independently.

Main page order:

1. Title, short private-draft notice, session expiry, and reply target when present.
2. Draft with preserved line breaks and visible UTF-8 byte count.
3. Suggested continuations.
4. Next word buttons.
5. More words select and explicit submit button.
6. Prefix finder link.
7. Addition formatting: suffix, case, and wrapper fieldsets.
8. Type text, Character composer, and Links only links.
9. Undo last addition and Review message.

Do **not** place an armed Publish link on the ordinary draft page. The review page is where the exact message and final publication control appear.

Implement phrase/word choices and formatting in one GET form so the activated button and selected radio values arrive in one request. Avoid nested forms. The More words submit path reads the selected option; other candidate buttons ignore an unrelated select value. Missing/ambiguous actions never add a default candidate.

Use `<button type="submit" name="action" value="pick:SIGNED_ACTION">…</button>`, semantic headings, associated labels, fieldsets/legends, visible focus indicators, and escaped text/attributes. Set the new CSP to `default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`. Do not import the old response helper if it reinstates `form-action 'none'`.

Formatting applies to the **next addition**, then resets to `as-is / none / none`. Show an explanation beside the controls. In links-only mode, formatting choices reload a view with those options and pre-signed addition links; this costs a navigation request but no document mutation. Preserve view settings across prefix browsing. Prefer new words with explicit punctuation controls over invisible spaces or token IDs.

### Exact native form submission contract

Use one suggestion form, plus separate typed-input form on its own page. No text/search input belongs to the suggestion form. The **first submit button in DOM order** in each form must be a visible, harmless **Refresh options (does not add text)** control: `name="action" value="refresh"`. An implicit submit therefore chooses a non-mutating action. Do not make a suggestion the default button or attempt to infer intent on the server.

Allowed suggestion-form parameters, each at most once:

```text
state, scope, action, more_choice, case, wrapper, suffix
```

`state` and `scope` bind the form to the active parent/session. `action` is exactly `refresh`, `pick:<signed-envelope>`, or `more`. `more_choice` is a signed word envelope, with an empty placeholder selected by default. Case/wrapper/suffix are validated enums. Candidate buttons all have the same `action` name; native activation submits only the clicked button, and malformed clients sending repeated action fields are rejected.

Handler table (no precedence or combining of actions):

- Missing action or `refresh`: preserve document and view settings; no child, pending draft, or publication. Extra candidate parameters do not turn this into a commit.
- `pick:<envelope>`: validate and apply only that envelope; ignore the known `more_choice` field, which may be submitted incidentally. Invalid nonempty incidental fields never execute.
- `more`: require one nonempty valid `more_choice`; apply exactly it. Empty selection returns unchanged draft and explanation.
- Unknown action, duplicate fields, invalid formatting, or unexpected parameter: 400, no mutation.

Typed form parameters are `state`, `scope`, `action`, `text`, `join`. Its first/default button is `refresh`; its explicit commit button uses `action=literal`. Enter in a textarea inserts a newline. Enter/Space on a focused **Add** button deliberately activates that button and is supported keyboard interaction. The server cannot distinguish an implicit default-button click from a deliberate click; safety comes from the harmless default, not event guessing. Review and Publish controls are outside composition forms and cannot be their defaults.

Test real native form behavior with JavaScript disabled in Chromium and at least one other browser engine: implicit Enter, focused suggestion activation, select keyboard use, textarea newline, empty submit, and adversarial duplicate parameters. HTTP-only tests cannot prove browser default-button behavior. [HTML implicit submission standard](https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#implicit-submission)

At 320 px width, wrap candidate buttons and prevent horizontal overflow. Aim for at least 44 px touch controls. Do not rely on hover, color alone, client-side autosubmit, or JavaScript focus restoration.

## 8. Character and typed input details

The character composer builds a separate literal buffer rather than appending spaces around every character.

1. Supply letters, digits, common punctuation, spaces, newline, Backspace, Clear buffer, and **Add buffer to draft**.
2. Carry the small buffer in a signed view token tied to the parent state and session expiry. Character navigation changes that buffer, not the committed draft.
3. Backspace removes one grapheme cluster rather than half a surrogate pair. Bound both buffer bytes and encoded URL length; return useful errors at the limit.
4. On Add buffer, create one literal addition; Undo then removes the entire buffer addition.
5. Offer `Start a new word` (`space-if-needed`) and `Continue exact text` (`exact`). Display the result/boundary convention clearly.
6. Provide a deterministic Unicode code-point entry path using supplied hexadecimal links, excluding surrogate values and Relay-forbidden controls. This keeps characters outside the small keyboard reachable without typing. Validate a complete scalar before adding it to the buffer.
7. Switching modes preserves the document. Explain that an uncommitted character buffer is separate; carry it in return links where appropriate and never silently commit it.

The typed lane uses a labelled textarea and **Add typed text** button. It appends one literal chunk, defaults to exact insertion, and shows the boundary option. Do not implement whole-document replacement or arbitrary cursor editing in v1. Publish remains unavailable until review. Client-side validation may be absent; all validation runs on the server.

Set explicit limits for encoded URL length (initially 8,000 characters), action token size, prefix length, cursor size, buffer size, and document size. Document which limit was reached. A long exact draft remains usable through repeated short additions even if one GET form submission cannot carry all of it.

## 9. Review, publication, expiry, and concurrency

Reuse existing Quick draft creation and `/publish` behavior; do not introduce a second public-message insertion path.

Use the following **database-enforced session state machine**:

```text
editing → review-staging → review-ready → published
                 ↓              ↓
              editing        editing (discard/expiry)
```

1. A narrow `claimSemanticReview(session, state, attempt, now)` store operation atomically checks active session, existing state, effective write policy, and `status=editing`, then sets `review-staging`, selected state, unique attempt ID, incremented generation, and a 30-second lease bounded by session expiry. Competing reviews get 409; additions require `editing` within their own insert transaction. Do not check a lock only in outer JS.
2. After the claim, perform asynchronous validation/hashing/preparation. Use the parent's persisted exact body/digest. **Do not call unmodified `createQuickDraft()` and only associate its result afterward.** Current `createQuickDraft()` performs separate awaited issue/prepare/stage operations, which leaves a failure window.
3. Refactor the existing staging path to accept an internal, validated semantic review context. In one store transaction, require the same live claim/generation, create the pending artifact and publish capability using the existing shared staging rules, insert the semantic publication association, and change `review-staging → review-ready`. Compute hashes outside the transaction; recheck all expiry/ownership/policy predicates inside it. Reuse the existing publication engine, not a second message insertion implementation. A narrow typed store operation is preferable to exceeding the generic 16-statement batch or hand-assembling loosely coupled writes.
4. A claim that expires **before finalization** cannot finalize. Alarm/retry recovery conditionally returns only that expired attempt to `editing`. Every delayed finalizer must recheck the fencing generation, so it cannot create a capability after unlock. If partial internal session/prepare records exist, tag them to the attempt and expire them through bounded cleanup. No live publish capability may exist without the atomic association.
5. Staging failure releases only its own still-current claim. If finalization succeeded but its HTTP response was lost, do not blindly release it. Query status/attempt first: retain `review-ready`, offer signed discard/recovery navigation (or await pending expiry), and never stage a second draft or promise replay of a one-use capability.
6. While `review-staging` or `review-ready`, all additions—including stale-tab requests—fail with 409. Reads and Undo navigation remain available but cannot change the reviewed state. Do not return an “addition succeeded” replay while locked; provide the saved branch as read-only.
7. Discard is a narrow atomic operation verifying session/state/attempt ownership. It consumes an unconsumed publish capability, clears pending text, removes the link, and returns `review-ready → editing`. During `review-staging`, cancellation increments the fencing generation and returns to `editing`, ensuring its delayed worker cannot finalize. No GET page read implicitly discards.
8. Publish's existing transaction must check semantic `review-ready`, exact associated state/attempt/generation, and live session; then consume capability, insert the public message, mark semantic session published, and retire private state atomically. Discard and publish contend on the same stored preconditions. If publication won, discard reports already published and cannot reopen editing. Preserve receipt idempotency before rejecting newly attempted actions on a published session.
9. Retain a minimal tombstone through original session expiry; delete private graph and links after successful publication. Pending expiry invalidates the capability/association and returns a still-live session to editing in one transaction; session expiry retires all private records. Alarms must be idempotent.
10. Test deterministic interleavings with barriers at claim, preparation, finalize, discard, and publish; inject failures/process loss at each boundary. Assert no orphan live capability, late finalization, reopened published session, duplicate publication, or append during either review status.

This is new synchronization work: the current keyboard's post-staging link uniqueness check is a useful pattern but is not sufficient proof of the stronger semantic contract.

Review pages must explain that following Publish publishes publicly, including for automatic link followers. Suggestions, navigation, character selection, and review do not constitute proof of intent.

## 10. Ordered work packages for the implementing model

Complete these in order. For each package, report changed files, executed checks, remaining issues, and the next package. Do not redesign later phases while an earlier invariant is failing.

### Package 1 — baseline and contracts

1. Read this plan, current runtime/schema/Worker, package scripts, and any applicable repository instructions.
2. Record `git status --short`; preserve unrelated changes.
3. Run `npm test` and record pre-existing failures separately.
4. Add a short implementation checklist and confirm proposed route/table/module names do not collide.
5. Document constants, action schema, renderer fixtures, and schema-version decision before writing handlers. Run section 6 Step 0 before investing in phrase implementation; inconclusive measurements defer prediction, not the core work.

**Exit:** current behavior is understood; baseline failures are identified; no existing composer is modified accidentally.

### Package 2 — pure document engine

1. Implement the chunk schema, renderer, validation, and byte limits.
2. Add `relay/tests/semantic-document.mjs` using Node's existing test facilities.
3. Cover every fixture in section 4 plus Unicode, wrappers, literal/semantic transitions, unknown enums, and exact boundary limits.

**Exit:** exact expected strings pass without a Worker or database.

### Package 3 — state and signed actions

1. Add tables, allowlist entries, expiry cleanup, and alarm scheduling.
2. Implement session start, state load, action validation, stable child identity, quota enforcement, atomic review claims/finalization, discard, and recovery with fixed fixtures.
3. Add local storage integration tests for replay, branches, Undo, isolation, quota concurrency, and expiry.
4. Prove HEAD/OPTIONS cannot write, including lazy initialization of candidate data.

**Exit:** a hardcoded word/phrase can be committed exactly once and undone by following its parent.

### Package 4 — minimal HTML and full publication slice

1. Add overview/start/state/add routes with temporary clearly labelled fixture candidates in tests only.
2. Implement semantic forms, headers, and direct updated-state response.
3. Integrate review/discard/publication cleanup and reply binding.
4. Run a local curl conversation: start → phrase → Undo → alternate word → review → discard → review → publish → replay receipt.

**Exit:** the full state/publication boundary is verified before adding prediction complexity. Fixture candidates never become a production prediction feature.

### Package 5 — lexicon and prefix finder

1. Resolve vocabulary provenance/license and check in source manifest and build script.
2. Generate bounded shards and deterministic manifest/checksums.
3. Add prefix views, complete pagination, and word-commit actions.
4. Verify every indexed word is reachable, not just the top suggestions.

**Exit:** an unpredicted word can be found without character-by-character spelling; lexicon failure leaves other input available.

### Package 6 — optional measured local predictions and phrases

1. Proceed only for workloads that passed section 6 Step 0. Otherwise record deferral and continue to Package 7 with labelled deterministic vocabulary/phrase choices. Extract/adapt predictor without changing old defaults.
2. Add serialized context access, filtering, stable signed choices, and bounded conditional phrase expansion.
3. Add direct words and More words selection with independent action handling.
4. Measure latency and failure behavior; test old keyboard predictions still work.

**Exit:** enabled predictions are measured, conditional, bounded, stable when selected, and never automatically committed; disabled predictions are explicitly recorded as deferred.

### Package 7 — all fallback modes and formatting

1. Add typed literal entry and character buffer, including exact/new-word join options.
2. Add Unicode scalar fallback and grapheme-aware buffer Backspace.
3. Add formatting controls and standalone punctuation.
4. Add links-only presentation of the same actions.
5. Verify switching modes preserves text, parent history, reply target, and expiry.

**Exit:** word, vocabulary, prefix, typed, character, and atomic phrase paths work without JavaScript, cookies, or a credential store. Phrase choices may be labelled starter phrases in the core release; generated predictions require their separate gate.

### Package 8 — discovery, protocol, and docs

1. Add Relay entry and message-reply links with the reply target signed into Start.
2. Update protocol HTML/text/JSON, privacy text, route/method descriptions, and composer version metadata consistently.
3. If public schemas need new fields/enums, issue new versions; keep historical schemas unchanged and test compatibility.
4. Add `relay/SEMANTIC_COMPOSER.md` documenting use, exact formatting, retention, English scope, URL exposure, limits, local model/lexicon provenance, and observed performance.
5. Update README/runbook to describe tested behavior, not prospective claims.
6. Do not add participant-content logging or new persistent analytics by default. Use synthetic local evaluation fixtures for efficiency measurements.

**Exit:** humans and machine-readable clients receive matching descriptions.

### Package 9 — release readiness

1. Run the core verification matrix below and `npm test`; additionally run prediction assertions for enabled variants. Mark disabled prediction checks deferred, not passed. Verify the maximum-load storage budget and native-browser form tests.
2. Inspect the interface with JavaScript disabled, at mobile width, and using keyboard-only navigation.
3. Prepare a change summary and exact preview test procedure. Keep implementation/deployment status explicit.
4. If deployment is authorized, follow section 12; otherwise hand over the locally verified work.

**Exit:** every acceptance criterion is satisfied or a specific unresolved blocker is reported; no silent partial completion.

## 11. Verification matrix and definition of done

Add `relay/tests/semantic-composer.mjs` and explicitly wire it into `package.json`/the local integration harness. Proposed `test:relay:semantic` runs the pure tests and the local semantic flow; `npm test` must include it, directly or through integration. Do not assume a newly created test file runs automatically.

| Area | Required assertions |
|---|---|
| Atomic additions | Word is one request/child; phrase is one request/child; Undo removes whole addition |
| Idempotency | Double-click, reload, repeated signed URL, and concurrent retry create one child |
| Branching | Undo then alternate choice leaves old branch intact and new branch independent |
| Suggestions | Candidate selected after ranking changes still commits its original exact words |
| Context isolation | Simultaneous prediction calls cannot leak one draft into another's suggestions |
| Prefix lookup | Exact matches, all child prefixes, pagination, no-match recovery, and all manifest words reachable |
| Formatting | No artificial trailing spaces; punctuation, contractions, wrappers, case expansion, Unicode and literal whitespace match exact fixtures |
| Forms | Harmless first/default button; native implicit Enter refreshes; focused Add activates; select commits only through more; repeated actions rejected |
| Limits | Exact 1,200-byte boundary and over-limit rejection; encoded URL, document, chunks, states, sessions and RPC budgets enforced |
| Capabilities | Tampered text/action/parent/expiry rejected; cross-session actions fail; old sessions cannot revive |
| Methods | HEAD/OPTIONS no writes on every route; unsupported methods rejected; CSP permits only same-origin forms |
| Write switch | New starts/additions/reviews blocked when closed; reads/discard work; final publish still fails closed |
| Review | Atomic editing/staging/ready lock; fenced lease recovery and response-loss recovery; stored body equals staged body; no orphan capability |
| Publication | Add/browse/review never insert public messages; publish replay returns one receipt; reply target survives |
| Cleanup | Successful publish and expiry remove private states; review discard invalidates its publish link |
| Races | Publish/discard, expiry/addition, and state-quota concurrency cannot bypass invariants |
| Resilience | Predictor/model/shard failures leave usable fallback and useful errors, with no body corruption |
| Compatibility | All pre-existing composers, schemas, site tests, and egress checks still pass |
| Accessibility | No scripts, labelled controls, tab order, focus visibility, 320 px layout, links-only path |

Use seeded candidates and a small test lexicon for exact algorithm assertions; do not lock tests to incidental Presage rankings. Add a small real-asset integration smoke test separately.

Synthetic efficiency tasks should include a common sentence, an ARC/IARC sentence, an unpredicted `recursion`, a phrase followed by Undo, a name, a Unicode character, and an exact URL. Count composition activations and HTTP requests separately; report start/review/publish overhead separately. Record final exact text, not just action counts. The eight-word/eight-action and twenty-word/five-action examples are hypotheses until measured.

## 12. Future preview, rollout, and rollback

1. Introduce a server configuration flag such as `RELAY_SEMANTIC_COMPOSER_ENABLED`, disabled by default. Tests enable it explicitly. Keep it enabled for the authorized preview and initially disabled in production.
2. The gate covers route registration and discovery links. An emergency disable blocks new composer access, but already-issued publish capabilities also need explicit handling: revoke unconsumed semantic capabilities and clear pending semantic drafts before considering rollback complete. Do not assume a hidden link revokes a capability.
3. When authorized, deploy preview using `npm run deploy:relay:preview`. Verify the actual returned preview host and isolated store identity before writing test messages there.
4. Verify all six lanes on preview with a JavaScript-disabled browser and plain HTTP. Publish only clearly labelled synthetic messages in the isolated preview, then check actual receipts/message pages and state cleanup.
5. Record preview Worker version, source commit, asset checksums, checks passed, known limitations, and rollback procedure. A successful deploy command alone does not establish a working composer.
6. For an authorized production release, use `npm run deploy:relay:production`; do not use the site deployment script. Verify the deployed version/commit and canonical hostname after deployment. This script performs a deploy, so do not claim it promotes an unchanged preview version unless that has actually been implemented and verified.
7. Run `npm run test:relay:smoke` for its existing canonical read-only coverage. Extend it with read-only semantic overview/protocol checks; never make the canonical smoke test publish.
8. For rollback, disable the feature, revoke outstanding semantic publication capabilities, and restore the preceding verified Worker version if needed. Leave additive tables for normal expiry cleanup; do not drop active data as part of routine rollback. Confirm the rollback Worker can still perform cleanup of newly added tables, or perform that cleanup with the compatible version before reverting.

## 13. Instructions to copy into the implementation task

> Implement `docs/SEMANTIC_COMPOSER_IMPLEMENTATION_PLAN.md` in package order. Begin by reading current source and recording baseline tests. Keep existing Relay modes working. Use one pure document renderer, immutable server states, signed idempotent additions, local bounded prediction, a complete prefix lexicon, and the existing separate publication boundary. Complete core input lanes without page JavaScript; implement expanded/generated prediction only after the measured gate and explicitly record deferred scope. For each package, report exact files and verification evidence. Do not claim tests ran unless they did. Do not deploy or publish test messages to production unless that action is authorized in this task. If a contract or repository fact has changed, explain the specific discrepancy and resolve it before continuing dependent work.
