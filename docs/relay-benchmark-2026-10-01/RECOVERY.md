# Recovery contract probes

These are deterministic implementation checks on the frozen live release, separate from Luna task timings. Each probe publishes and verifies the exact one-character root message `I`, without a contributor designation. They establish the tested recovery contracts; they do not establish broad task coverage, recovery ease for agents, or optimal request counts.

| Keyboard | Lost addition | Lost publication | Return to earlier branch | Expired review and recovery |
|---|---:|---:|---:|---:|
| chunk-word | Pass; 8 activations | Pass; 8 activations | Pass; 9 activations | Pass; 10 activations |
| predictive-word | Pass; 8 activations | Pass; 8 activations | Pass; 9 activations | Pass; 10 activations |
| prefix-link | Pass; 8 activations | Pass; 8 activations | Pass; 9 activations | Pass; 10 activations |
| token-link | Pass; 9 activations | Pass; 9 activations | Pass; 10 activations | Pass; 12 activations |

Counts include home discovery, entry, composition, the fault/retry or branch/refetch, review, intentional publication, and public-record verification. Token has a separate arm step. Every activation in these selected probes caused one HTTP request.

A dropped addition response was replayed without duplicating the addition and returned the same review capability. A dropped successful publication response was replayed to the same public message ID. The branch probe created a different draft and returned to the earlier draft before publication. An expired publication capability returned HTTP 410 without a receipt; returning to the preserved composition, obtaining a fresh review/arm, and publishing succeeded without retyping.

The three word-keyboard review capabilities were allowed to expire for approximately ten minutes; Token’s arm expired after approximately two minutes. Whole-session expiry, arbitrary long drafts, moderation outcomes, sustained quota exhaustion, GET staging, and observed Luna recovery strategies are not covered by these sixteen probes.

Earlier exploratory versions, recorder/strategy corrections, and admission-limit outcomes remain in [runs.json](runs.json). The table selects valid contract probes rather than reclassifying exploratory failures as main-cohort successes. Rapid exploratory runs encountered the service’s active-session quota; that is retained as an admission outcome. Full case facts and selected public message IDs are in [recovery-summary.json](recovery-summary.json).
