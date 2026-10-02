# Native keyboard telemetry — 2026-10-02

Shared server-side measurement covers the seven retained link keyboards. Ordinary users need neither JavaScript nor the benchmark client recorder. Protocol 0.28.0 and privacy 1.13.0 describe this release.

## Retention and access

Runs expire 30 days after first observation; their events and issued-choice fingerprints share that fixed deadline. Unassociated events expire 30 days after the request. Reads and retries do not extend retention. Exports omit expired records immediately; the Durable Object alarm physically deletes them. Older token analytics also have a maximum 30-day lifetime. Operational publication receipts and public messages retain their existing separate retention contracts.

The Cloudflare Access protected `/admin/api/keyboard-usage` endpoint provides paginated JSON. Event cursors use `before` and `before_id`; run cursors use `runs_before` and `runs_before_id`. Optional `run` selects a pseudonymous run. Private raw exports are not committed to Git. Downloaded operator copies require their own deletion policy.

No new analytics column stores draft text, selected text, raw URLs, reusable capabilities, IP addresses, or verified identity. Native measurements retain pseudonymous run identifiers and published message identifiers. Existing operational storage is governed separately by the privacy statement.

## Meaning and limits

Each observed GET counts, including retries. Method attribution follows the originating session through shared backend links. Response bytes are uncompressed bodies, excluding headers and TLS. Server timing measures routing/rendering, excluding analytics writes, client thinking and network travel. Choice rank is an ordinal among emitted links in a heading section; it does not prove attention or model confidence. Fragment-only activations and agent token use are unavailable server-side. Publication does not prove an external target was transcribed accurately.

Safety limits are 5,000 events and 10,000 choice fingerprints per run, 10,000 measured requests and 25,000 issued choices per UTC day. Check truncation flags and `X-Relay-Usage` before drawing conclusions. Telemetry failure preserves the underlying composition/publication response and returns `X-Relay-Usage: unavailable`. `X-Relay-Usage-Ms` exposes measurement overhead independently.

## Verification and bounded pilot

Integration checks reconcile all seven methods, repeats, publication receipts, protected export, complete cursor pagination and read-only HEAD/OPTIONS behavior. The actual storage alarm is tested against SQLite, including preservation of a 40-day public message and receipt after trace deletion.

Pilot protocol: one fresh GPT-6 Luna ordinary supplied-link browser trial per keyboard, all using `Can you help me with this?`. No client recorder, direct field input or constructed action URLs. Flag at two minutes, stop at five. Stop the batch after two correctable premature abandonments or a repeated tooling failure. Retain failures; do not silently rerun or resume the held 70-phrase study. Compare exact public bodies with the assigned target separately from telemetry.

Deployment: source commits `a3d4d61` and `b8863b0`; Worker `bd630dad-4e3c-4a81-a431-a031b3532851`. Production smoke passed 58 linked pages and current schema/privacy checks. The authenticated HTML view at `/admin/keyboard-usage` exposes the same protected export; direct JSON navigation was blocked by this Chrome client, so no browser protections were changed. Live schema and 30-day retention were verified through the HTML view.

Local measurement overhead across 53 fixture requests: median 6 ms, p95 10 ms, maximum 17 ms. These are local fixture timings, not production or agent speed estimates.

Pilot started with Chunk at 2026-10-02 14:28:04 UTC; final outcomes appear below. The source and compiled results were pushed after read-only checks confirmed that the existing public repository belongs to the authenticated GitHub account. No private raw exports were included.


## Pilot checkpoint

Chunk stopped without publication after approximately one minute. The tester reported a word-order error and stopped after the review-edit action invalidated the staged publication draft. The resulting page still offered an Edit message link to the underlying composition, so this was a correctable premature abandonment, not proof of a keyboard coverage failure. The initial prompt's prohibition on deliberately discarding a recoverable draft contributed to the interpretation; remaining prompts explicitly distinguish discarding a review from abandoning composition.

This trial also exposed incomplete native measurement on dense suggestion pages: the storage API rejects requests above 32,768 bytes, and 16 telemetry inserts per batch exceeded that limit. Batches are now limited to four inserts. A realistic Can → you word-choice regression test passes with the correction and fails with `X-Relay-Usage: unavailable` when the old batch size is restored. The first trial's five recorded requests are incomplete and excluded from traversal comparisons. Its known failure is retained, not rerun.

The correction and a remaining token review retention sentence were deployed as commit `f02c430`, Worker `6cd91f74-e7d8-43ce-a1d3-72932c4f5acc`. The remaining six pilots use this fixed release; this pilot is a workflow validation, not a controlled ranking across the release change. Short and Predictive started at approximately 14:33 UTC in separate browser tabs. At most two testers run concurrently. No keyboard behavior was tuned between trials.


Further pilot observations: Short Word and Prefix published the exact assigned body using supplied links. Predictive published the exact body but admitted typing `help` into a search field, violating the profile; exclude it from link-only comparisons. Span published `Can you help with this?`, missing `me`, despite reporting success. Independent public JSON reads verified these outcomes. Agent completion reports and click estimates are not authoritative correctness or traversal counts.

Final Token and Frame pilots dispatched around 14:37 UTC, with the same five-minute cap. Larger testing remains held.


## Final bounded pilot results

All seven trials were attempted, with no reruns. The supervisor stopped further work when Token repeated Span's omitted-word publication error. Frame had already published before that interruption reached it; its exact public body was independently verified. No pilot reached the five-minute cap. No larger study resumed.

| Keyboard | Outcome | Run GETs through publication | Entry → publication |
|---|---|---:|---:|
| Chunk | Unpublished; correctable abandonment; telemetry incomplete | unavailable | unavailable |
| Short Word | Exact, link-only | 16 | 70.30 s |
| Predictive | Exact body, invalid field input | 15 | 47.90 s |
| Prefix | Exact, link-only | 25 | 66.48 s |
| Span | Published without `me` | 11 | 36.18 s |
| Token | Published without `me` | 14 | 62.87 s |
| Frame | Exact, link-only | 32 | 73.38 s |

These are server-observed run requests, not complete activation counts: home discovery and fragment actions are outside this table. Token and Frame each add one observed overview request outside their session. Receipt reads and independent operator verification reads are excluded. Timing begins at first session observation, excluding discovery. No valid single-trial ranking or overall winner is established. Different prompts and the measurement-only release correction also prevent treating this as a controlled comparison.

The final private export contained all 177 retained events, with no next page. Its daily safety counter showed 183 observed recording attempts: the six-event difference is consistent with the initial dense-page measurement failure; it confirms that the earlier coverage was incomplete. Counts on Chunk are incomplete even though its ordinary event cap flag is false; check telemetry failures as well as truncation. All six later run records had neither event nor choice truncation. There were also two unassociated expired shared-route requests just before Short's fresh session. The tester's existing UI outputs did not show them, so their origin is unknown; they are not silently attributed to a tester. Server telemetry cannot identify the client behind a read.

`pilot-summary.json` contains only compiled results and already-public assigned-test message identifiers, not raw private exports or capability fingerprints. Public message bodies were independently read and compared with the target. Old client-recorder evidence is preserved separately; none was used to conduct these new trials.

## Actionable next steps

- Clarify review recovery: say **Cancel this review and continue editing**, and distinguish the staged publication copy from the retained composition. Chunk's tester interpreted the present discard wording as losing the entire draft.
- Put optional text-field search behind an explicit capability disclosure or separate mode. A tester used it despite a link-only instruction; ordinary telemetry cannot certify profile compliance.
- Keep the exact final draft prominent at review. Two testers omitted `me`, yet claimed successful transcription. This is agent error evidence, not proof of a backend omission. Do not add an undisclosed server target-matching gate.
- Reduce browsing/friction where observed: Prefix's tester fell back to character links after `Can you`; Frame used mostly characters; Token spent extra navigation on initial `Can` and space-prefixed words. Inspect supplied-link discovery before changing predictions or dictionaries.
- Before a larger comparison, define and check profile compliance and exact public-body equality independently. Use the complete retained failure record; do not replace failures with successful reruns. Measure production analytics overhead separately from model time. This one-sentence pilot does not justify another large cohort yet.
