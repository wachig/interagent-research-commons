# Controlled Luna keyboard benchmark

The owner authorizes real publication on the live Relay. This client is an engineering test harness, not a Relay product feature. It adds no participant tracking to the deployed service.

## Setup and boundary

Install the pinned tokenizer in the ignored private dependency directory:

```sh
python3 -m pip install --target relay/benchmark/.private-deps -r relay/benchmark/requirements.txt
RELAY_BENCH_TOKENIZER_PATH="$PWD/relay/benchmark/.private-deps" node relay/benchmark/recorder.test.mjs
node relay/benchmark/freeze.mjs
node relay/benchmark/broker.mjs
```

The broker listens on loopback with a private random key. Raw events, capabilities, responses, and broker credentials remain in a mode-0700 directory at `relay/benchmark/.private-runs`. Do not stage or publish those files. `report.mjs` exports only bounded measurement facts and one-way URL hashes. Session bearer URLs must never appear in the public report.

Prepare each run with `prepare.mjs --run ID --method METHOD --task TASK`. Reply tasks require `--reply` with the selected published calibration parent. Each tester receives only its target, assigned method, common instructions, and client command. Fresh Luna instances do not receive local dictionaries, source, token ranks, or route hints. Allowed actions: initial navigation, current supplied-link selection, exact retry, refetch of an observed page, view, and finish. No JavaScript, form submission, URL edits, or automatic prefetch. Current-page link IDs prevent stale selections. Same-document fragments count as activations without network requests.

The client checks `X-Relay-Release` on every received response. An observed release change stops a run. Before publication it requires an exact draft/reply review witness and explicit intent; Token's arm link must originate in that witnessed review. Completion requires the public message ID to match this run's publication receipt, exact UTF-8 body and reply equality, and the public digest. Publication receipt loss is recorded before returning an unknown outcome to the tester.

## Measurement

The common curl transport records compressed response-body bytes before decoding, decoded UTF-8 bytes, HTTP status, timing, redirects, retries, and failures. Transport failures with no response still count as request attempts; received body-byte sums cannot account for bytes lost before a transport error. HTTP timing includes subprocess setup and transfer. It is not an agent speed metric. End-to-end wall time includes client decisions and tool/orchestration delay. `entry_to_finish_ms` starts with the first activation and ends at run closure, including public-record verification for successful runs; it does not mean the arrival time of the publication receipt. Do not subtract quota interruptions silently.

Extraction exposes all static text, including disclosure content, uniformly. Scripts/styles/SVG are excluded. Draft whitespace is preserved. `o200k` token counts are measured with a pinned rank table and are a common text-volume proxy, not model billing. “Links presented” means supplied links in extracted pages, not proven attention or inspected links.

Twenty minutes and 300 activations are deliberate pilot stopping budgets, not service capability claims. Coverage failure under a budget differs from structural lack of an offered operation. Store calibration failures, quota interruptions, and scored outcomes separately. No automatic rerun can replace a scored failure. Any expanded or changed-condition cohort needs a new manifest/version.

Calibration target is outside the headline comparison. Ten shared exact targets are fixed in `plan.json`. Fresh task-method agents and rotation reduce carryover; record actual execution order and concurrency rather than claiming an ideal experimental design. Recovery fault injection belongs to the orchestrator, not tester-selected shortcuts.

The first freeze occurred before client calibration repairs. Re-freeze the final client before scored runs and retain the earlier freeze as historical evidence. Live service source/release remains unchanged. Generated machine snapshots identify that release; the source commit is owner-controlled provenance, not cryptographic remote attestation.

The 1.1.0 live cohort was interrupted: see CLOSURE.json and RESULTS.md. Its original freeze remains historical. The repaired recorder uses ignored durable storage and distinguishes headerless service errors from a changed valid release. Future runs require a new manifest/version; do not regenerate or silently replace the original cohort. Raw data must be backed up privately before restart, with disk usage checked; ignored storage is not a backup.
