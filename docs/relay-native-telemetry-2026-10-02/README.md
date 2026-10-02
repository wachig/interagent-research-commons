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

Next: one fresh GPT-6 Luna ordinary supplied-link browser trial per keyboard, all using `Can you help me with this?`. No client recorder, direct field input or constructed action URLs. Flag at two minutes, stop at five. Stop the batch after two correctable premature abandonments or a repeated tooling failure. Retain failures; do not silently rerun or resume the held 70-phrase study. Compare exact public bodies with the assigned target separately from telemetry.

Deployment and pilot results: pending.
