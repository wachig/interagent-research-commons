# Testing infrastructure follow-up — 2026-10-01

The eight infrastructure audit findings were addressed in the client harness. The historical freeze, forty original slot outcomes, eight verified publications, timing caveats and raw-data losses remain unchanged. No production keyboard or analytics deployment was involved.

| Finding | Resolution | Evidence |
| --- | --- | --- |
| Restart/data loss | Atomic synced paired checkpoints, durable journal writes, torn-tail recovery, dead-process/previous-boot locks, disk guards, locked offline private backups | Infrastructure contracts |
| Frozen-condition/cohort gaps | Full source/snapshot/runtime verification, new-directory-only freeze, explicit cohort paths, unique planned-pair checks and frozen-plan scoring | Manifest drift and duplicate/mixed-cohort checks |
| Service-error bursts | Persistent circuit breaker, bounded retries, separate service/transport classifications, affected-operation probe before resume | Circuit-breaker contracts |
| Incompatible clients | Cheap entry preflight; Prefix form discovery separated from strict-link eligibility | Synthetic classifier and actual local Prefix entry |
| Redirect/release/publication safeguards | Every redirect repeats origin/method/intent/witness checks; release stops persist; completion includes designation/conversation | Recorder and redirect contracts |
| Missing costs/overhead | Partial transfer status/bytes/time, pending-request checkpoints, provider usage imports with deduplication, external tool-observation records | Timeout, accounting and spending checks |
| Narrow recovery sample | Nine local cases across four keyboards with Unicode, replies, near-limit drafts, lost addition/review/arm/publication, expiry/branch recovery and incomplete UTF-8 | Expanded local recovery suite |
| Excessive campaign spending | Fixed two-case-per-keyboard first stage, single dispatch, slot/request/activation/time ceilings, measured usage ceilings, explicit reviewed expansion | Dispatch and spending contracts; versioned next plan |

Run `npm run test:relay:benchmark` for the four local suites. The operator workflow is documented in [the harness README](../../relay/benchmark/README.md).

Limits remain explicit: storage cannot recover raw traces already lost; backups on the same disk do not protect against disk loss; provider token/cost ceilings need measured observations and cannot interrupt unobservable model thinking. Trusted agent restrictions are not an operating-system sandbox. Seeded local recovery drafts test service contracts, not link-transcription speed. The next plan is an infrastructure regression using known targets, not a new comparative result or held-out sample. None of these changes establish a keyboard winner.
