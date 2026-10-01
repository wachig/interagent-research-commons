# Engineering observations during the frozen pilot

These observations accompany the fixed cohort; they are not a declaration of a winner. The deployed keyboards remain unchanged during testing.

## Exact review and word effects

T02 Token and T03 Predictive attempted publication after incorrectly judging their drafts to match the target. The recorder rejected publication; those attempts remain failed, with their spent activations. Stored-draft reconciliation independently records the unequal review lengths and first differing codepoint in `runs.json`.

T02 Token omitted the target word `message`. T03 Predictive omitted `for`. The Predictive implementation treats a final letter-key word as a replaceable partial word before a word selection (`relay/html_keyboard_word.js`, the `mayReplace` branch). The T03 trace never entered `for`, so that failure does not demonstrate replacement. The source behavior is a separate interface concern, not its measured cause. An explicit complete-current-word versus add-next-word choice would make the effect more predictable. A heading that says “Exact message” describes the current draft; it does not confirm equality to the tester’s assigned target.

Token prefix browsing renders the query prefix with the same `draft` class as the message. The common extractor therefore exposes both in its draft array, although the complete page text includes the separating headings. Clearer product labels and different semantic markup could reduce confusion. This client extraction profile remains frozen; source inspection by the director does not supply route hints to testers.

## Payload and timing

T01 Chunk required 38 activations, Predictive 69, and Token 31. Token was the fastest by activations on this individual successful case. Chunk nevertheless exposed substantially more extracted text than Predictive. These are paired observations, not universal rankings; composition failures and different completed subsets must remain visible beside speed.

Common HTTP and extraction timing is recorded separately from end-to-end tool/client time. Delays reported informally by a tester as a “request” may include command approval, tool round trips, and client reasoning. Do not attribute those delays to the Worker without matching HTTP timing evidence.

## Capability and admission boundaries

Prefix’s menus require GET form submission. Strict supplied-link testers stopped when their desired words were absent from the offered word links. This tests the requested link-only profile; it does not establish performance for a form-capable client. Do not mix a form/search shortcut into its link-only score.

Rapid exploratory recovery runs reached the active-session quota. Admission responses were HTTP 413. The runtime’s status mapping looks for `active session limit`, while the emitted error says `Active keyboard session limit`; a future status-contract repair should distinguish quota admission from body size. No quota or deployed behavior was changed during this cohort.

## Boundaries of the evidence

The ten targets are purposive and short, with one longer English target, two reply tasks, technical and identifier text, multilingual/Unicode text, and literal repeated-space/newline/tab formatting. They do not prove reachability of every accepted body or near-limit completion. The sixteen selected recovery probes verify single-character implementation contracts, not observed agent recovery speed. Calibration, shakedown, strategy revisions, and account interruptions remain in the export and are separated from the main cohort.

## Headerless resource-limit responses

T04 Chunk, Token, and Predictive stopped after HTTP 503 Cloudflare error 1102, “Worker exceeded resource limits.” The responses omitted `X-Relay-Release`; the frozen recorder mislabeled their absence as a release change. Nearby successful responses retained the frozen release. Both failed attempts and their costs remain in the main cohort, with a separate failure adjudication. This is evidence of a resource-limit outcome, not a confirmed deployment change. The next client revision should distinguish an absent release header on an error response from a different valid release header, while retaining the error response and requiring an unchanged release before further composition.
