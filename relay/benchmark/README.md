# Controlled keyboard benchmark infrastructure (2.0)

This is a client-side engineering harness. It adds no participant tracking or production routes. Real publication on the live Relay was owner-authorized, but local contract checks are the default first stage. The original forty-slot pilot and its limitations remain in `docs/relay-benchmark-2026-10-01/`; never regenerate its freeze or replace a failed/interrupted attempt.

## Local verification

Use the ignored private dependency directory; `requirements.txt` pins tiktoken, and new manifests record the actual installed dependency versions as well.

```sh
python3 -m pip install --target relay/benchmark/.private-deps -r relay/benchmark/requirements.txt
npm run test:relay:benchmark
```

The four suites cover recorder boundaries, storage/scoring/control invariants, offline export/privacy checks, and nine expanded recovery cases against disposable localhost Worker/SQLite fixtures. Near-limit/Unicode drafts are seeded in the fixture database; these checks measure recovery contracts, not transcription efficiency or agent speed. No production messages are created. Existing `test:relay:recovery` additionally covers quota, stale-review conflicts, discarded permissions, and session expiry.

## New cohort workflow

Use separate ignored private storage per cohort. Set `RELAY_BENCH_TOKENIZER_PATH` if using dependencies outside `.private-deps`. A freeze requires a new output directory and refuses to overwrite an existing one.

```sh
export RELAY_BENCH_RUNS="$PWD/relay/benchmark/.private-runs/regression-2"
node relay/benchmark/freeze.mjs --output docs/relay-benchmark-regression-2 --plan relay/benchmark/plan-next.json --reply-parent docs/relay-benchmark-2026-10-01/reply-parent.json
node relay/benchmark/manage.mjs preflight --manifest docs/relay-benchmark-regression-2
node relay/benchmark/manage.mjs pilot --manifest docs/relay-benchmark-regression-2
node relay/benchmark/broker.mjs docs/relay-benchmark-regression-2
```

Freeze records the plan, registry/protocol/policy snapshots, service and harness source hashes, Node/Python, installed tokenizer dependency versions, and live release. Optional `--deployed-commit` records owner-supplied provenance; HTTP release headers are not cryptographic source attestations. Preparation, broker startup and navigation validate frozen conditions. Changing any frozen file requires a new cohort.

Preflight reads the assigned entry and follows bounded redirects, without publication. Compatibility is distinct from coverage: Prefix's observed GET-form word discovery is incompatible with the strict supplied-link profile and belongs in a separate form-capable study. The current recorder supports strict links only; it does not manufacture a form-capable score. The next regression plan retains Chunk, Predictive and Token, with two initial targets per keyboard and three optional expansion targets. These are regression targets from the pilot, not a new held-out corpus.

Prepare one unique task–method slot at a time:

```sh
node relay/benchmark/prepare.mjs --manifest docs/relay-benchmark-regression-2 --run r2-t01-chunk-word --method chunk-word --task T01
node relay/benchmark/cohort.mjs docs/relay-benchmark-regression-2
```

Reply preparation also requires `--reply IARC-M-… --conversation IARC-C-…` from the verified public parent record frozen as the common parent. The example uses the retained calibration metadata; verify that parent is still available before a live cohort. A reservation that is interrupted before initialization remains spent; inspect and close it explicitly. Never reuse it as an unrecorded fresh attempt. Fresh Luna testers receive only their target, assigned method, common instructions and `client.mjs` commands. General shell/source access remains a trusted experimental restriction, not an OS sandbox supplied by this harness.

The small pilot permits six slots, one concurrent slot, 600 activations/HTTP attempts, and one hour of aggregate active-run wall time. Each run retains its 300-activation/20-minute boundary. Dispatch delay is separate from the run's active budget. The counters include retries and redirects; fragments consume activations without HTTP requests. Repeated service/transport errors (threshold two) persistently pause requests and dispatch. Success on a lightweight route does not clear that pause. Retry allowances are bounded; failures and spent costs remain in their original slot.

Resume a service-error pause only after inspecting it, using a successful probe of the affected composition/search operation:

```sh
node relay/benchmark/manage.mjs resume --manifest docs/relay-benchmark-regression-2 --operation 'PRIVATE_OBSERVED_OPERATION_URL'
```

This operation must remain on Relay and cannot publish. A changed/unverified successful release stops the individual run persistently; it cannot be resumed into a different release. Spending-limit pauses require a newly authorized cohort. Small-pilot expansion requires all six slots closed, no recorded service/transport failure, and an explicit evidence review (`--review PRIVATE_REVIEW.json`) identifying the cohort/manifest, `infrastructure_stable`, `comparable_evidence`, `reason`, and `evidence_sha256` of the exported `comparison.json`. At least one completed pair must exist. The manifest fixes the optional targets and expanded limits before any testing. The `expand` command is a director decision, not an automatic rerun or automatic claim of a winner.

## Telemetry and provider usage

curl records encoded body bytes before decompression, decoded bytes, status, redirects and transport timing. Timeouts preserve available status, partial byte counts and elapsed time. Partial transfers remain lower bounds: the client cannot measure bytes it never received. Request counters and pending operations are checkpointed before transport; a crash during publication records an uncertain outcome, requiring exact retry rather than a guessed second publication.

All static HTML text, including closed disclosures, is extracted uniformly; scripts/styles/SVG are excluded and draft whitespace is preserved. o200k counts measure exposed text volume, not model billing. Links presented do not prove links inspected. End-to-end timing includes decisions/tools; curl timing is not agent speed.

The client cannot query provider billing itself. When the director has measured provider usage, import a private JSON record with unique `id`, `source`, optional `run`, `tokens`, and `cost` using `manage.mjs usage --file PATH`. Costs must use one consistently declared accounting unit. Imports are deduplicated and pause subsequent work at the plan's measured-token/cost ceiling. Unknown usage stays unknown; the request, slot and time caps still operate. Provider usage is checked at observation boundaries, so this does not interrupt a model already thinking. Do not claim a live provider-level spending cap.

Tool failures outside the broker (for example a failed shell invocation), tool time and orchestration details can be attached using `manage.mjs observe --run ID --file PATH`. Records need unique `id`/`source`; optional `tool_error_count` and `tool_ms` are exported. These observations are separate from recorder errors and are not inferred from extraction tokens. Keep source records private.

## Crash recovery and backups

Private storage is mode 0700; checkpoints/journals are mode 0600. Atomic synced checkpoints recover if the main state file is truncated. Journal repair accepts only a torn final entry and refuses interior corruption. Activation sequence reconciliation preserves a logged activation across a checkpoint interruption. Locks from a provably dead local process or previous boot can be reclaimed; unknown ownership requires inspection. Disk checks stop mutations when insufficient space remains for checkpoints.

Stop the broker before backup. Backup takes run locks and refuses to overwrite a destination:

```sh
node relay/benchmark/manage.mjs backup --destination "$PWD/relay/benchmark/.private-backups/regression-2-before-restart"
```

This copy contains bearer capabilities and raw messages. Never stage it or publish it. The same-disk copy protects against interrupted writes/restarts; make an additional private copy on another disk for disk-loss protection. Ignored storage is not a backup. SIGINT/SIGTERM remove the broker credentials; after a forced restart, inspect and remove a stale `broker.json` before an offline backup.

## Safe exports and scoring

```sh
node relay/benchmark/report.mjs docs/relay-benchmark-regression-2
node relay/benchmark/compare.mjs docs/relay-benchmark-regression-2
```

Exports require an explicit schema-2 cohort directory. They contain bounded facts and URL/source hashes, not raw responses, broker keys or bearer URLs. Scoring reads the frozen plan, filters its cohort/manifest/release, rejects duplicate/unplanned pairs and checks missing unique slots. Exact publication requires a same-run receipt, public visibility, exact body/digest/reply/designation and conversation checks. Incomplete costs are marked as lower bounds. Service errors, capability failures, interruptions and other failures must be adjudicated separately; all remain visible.

Completed-case medians use different subsets when completion differs; consult paired cases and completion rates together. Purposive regression targets support no population confidence intervals, universal coverage or shortest-path claim. Preserve the original pilot's exported evidence and documented lost raw traces. The older live recovery/audit scripts remain historical pilot tools; use the new local suites for infrastructure validation rather than rerunning those against production.

### Keyboard engine identity

From foundation 1.0.0 / method registry 1.4.0, keyboard responses declare `X-Relay-Keyboard`, `X-Relay-Keyboard-Backend`, and `X-Relay-Keyboard-Adapter`. The recorder already retains these headers in each HTTP event. Prefix keeps its identity on shared Predictive action routes; a shared route is not an interface switch. Generic `/publish` receipts have no renderer header. Keep URL admission guards as well as identity evidence. Freeze a new release/cohort for comparisons after this change; preserve the earlier cohort. See [keyboard architecture](../KEYBOARD_ARCHITECTURE.md).

The optimization release adds shared `/word-links/characters/…?view=prefix` links, persistent literal text/byte lanes, bounded Chunk candidate and Token jump pages, and separate draft/search markup. New freezes include both `keyboard_exact_view.js` and `prediction_results.js`. Prefix main word discovery declares GET forms required, even though its exact lane is usable with supplied links. Treat the engineering activation counts and payload measurements as separate from observed agent performance; do not replace the first cohort.

An explicitly declared `method_lanes["prefix-link"] = "supplied-links-with-exact-fallback"` permits a separate link-only fallback test only when that entry visibly supplies its identity-preserving exact route. Preflight retains `primary_discovery_status: incompatible`; default strict-link preflight still rejects Prefix form discovery. The one-run-per-keyboard director follow-up is preserved in `docs/relay-director-postfix-2026-10-01/` and is not a fresh Luna comparison.
