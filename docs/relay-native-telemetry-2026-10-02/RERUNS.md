# Targeted reruns

Four corrective trials: Chunk, Predictive, Span and Token on `Can you help me with this?`. Preserve the original failures and retain the three original valid completions as historical observations. If this checkpoint works, run all seven on `Where should we meet at 3:30?`. Maximum eleven new trials, one attempt per condition, no silent retries.

The new client is a compact text browser. Its tester interface exposes only read and follow-current-link commands. It makes GET requests to actual supplied same-origin hrefs, honors redirects and fragment-only navigation, renders exact draft text, and uses revision-bound handles to reject stale choices. It does not construct search URLs, submit forms, accept typed text, plan composition or check target equality. All choices remain the tester's. Cloudflare/Relay collect native telemetry unchanged. The client keeps only current navigation state, privately in a temporary directory; each state expires after five minutes and is deleted by the supervisor at trial closure. It keeps no action log or client measurement recorder.

Client representation differs from the earlier Chrome UI. Cross-client times cannot establish a winner. First-round counts are descriptive observed routes; the second phrase uses one common client across all seven. Capability exposure is enforced by this client's API, while tester compliance with using only this client is separately checked. Agent tool availability itself is not configurable by the current spawn API.

Fresh GPT-6 Luna tester per trial; two concurrent at most. Flag at two minutes, stop at five. Inspect current native run progress and actual public body. Stop the batch if a repeated workflow failure prevents reliable testing. Publication remains separately reviewed and authorized by the owner; there is no hidden target gate. Before publication the tester must explicitly compare the displayed review with the assigned exact target. Public JSON is independently verified afterward. Count failures and spent requests; keep unknown attribution explicit.

Review copy now says `Cancel this review and continue editing`. Cancellation invalidates the staged publish permission while preserving composition, as verified by the existing recovery suite and the new client test.

## Corrective checkpoint results

Release `1bfaaecd-03d2-4142-a47d-9d62fd5ec1f4`, source `af6e326`. All four testers were explicitly spawned as `gpt-6-luna`. No second-phrase cohort was launched.

| Method | Outcome | Recorded run GETs | Measured interval |
|---|---|---:|---:|
| Chunk | Wrong word order caught at review; cancelled safely; later draft `A`; unpublished | 24 | 213.33 s entry to last recorded request |
| Predictive | Exact link-only publication, independently verified | 26 through publication | 264.59 s entry to publication |
| Span | Correctable `Cae` draft; premature abandonment | 5 | 54.36 s entry to last recorded request |
| Token | Blank start blocked by automatic approval review; built-in demo selected instead; unpublished | 9 | 104.42 s entry to last recorded request |

Predictive public message: `IARC-M-80197caa-7973-41d0-a124-f399a3089e43`, body `Can you help me with this?`. All four runs had neither event nor choice truncation. Request intervals exclude discovery and are not total trial wall time; unpublished last-request time is not a verified timeout.

Span admitted that it had not checked a clock before claiming the five-minute limit. Token also claimed a hard cap without evidence; supervisor clock was about three minutes after dispatch. Numeric link handles still produced off-by-one selection errors. Token's automatic review reason classified the blank/free-generation start as outside the requested exact-transcription scope. The supplied exact-transcription demo specifies `Relay token test.`, not the owner's target. The supervisor stopped the batch and closed its temporary navigation states; failed trials remain preserved. The owner subsequently explicitly authorized Token’s blank/free-generation start for the assigned exact phrase.

The checkpoint did not establish a complete comparison. Further agent testing is held. Useful driver improvements identified by actual failures are semantic link selection, explicit remaining wall time supplied by the client, and one persistent read/follow process to avoid repeated per-link shell approval overhead. These require mechanical validation before another small canary. Do not classify client-index mistakes or premature abandonment as proof of keyboard text-coverage failure.


## Driver correction after the failed checkpoint

The persistent client accepts only JSON `read` and `follow` commands. Follow selects an exact displayed link name, with its heading section or aria label used to disambiguate different effects. Unknown and ambiguous names perform no request; there is no form/text-entry API. This removes numeric-index translation while retaining supplied-link navigation. Each response includes actual remaining seconds, and the process terminates at the five-minute deadline. One initial authorized process replaces repeated per-link shell invocations; no client telemetry log is introduced. Atomic temporary-file replacement preserves current navigation state if interrupted. Tests cover rejected field input, semantic matching, unknown/stale links, actual clock reporting and review recovery.

One additional GPT-6 Luna Token canary is authorized following the owner’s explicit blank-start permission. The full second-phrase cohort remains held; this canary is a driver check, not a silently replaced score or a keyboard winner claim.
