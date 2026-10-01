# Relay keyboard evaluation: actionable findings

**Recommendation:** keep Chunk as the provisional primary link keyboard, preserve Token as an exact-text alternative, and fix service stability before expanding the benchmark. This pilot does not establish an overall winner.

## What finished

Of forty planned task-method slots, thirty-nine were attempted: thirty-eight have terminal composition outcomes and one was interrupted by account quota. The last Chunk formatting tester hit quota before making a request. Seven exact publications were verified. All sixteen selected deterministic recovery probes passed. No production analytics or keyboard changes were deployed during the comparison.

The owner reported a forced Mac mini restart, suspected to follow low disk space. Afterward no testers were alive and the temporary raw-trace directory was absent. Exported measurements and session logs survived. Token T09 closure counters were recovered from its saved session output; Token T10 was interrupted. Later payload/transition totals for those two runs could not be recovered. They remain explicitly incomplete.

| Keyboard | Attempted | Exact publications | Failed | Interrupted | Successful activation counts |
|---|---:|---:|---:|---:|---|
| Chunk | 9 of 10 | 4 | 5 | 0 | 38, 32, 34, 80 |
| Predictive | 10 | 2 | 8 | 0 | 69, 47 |
| Prefix | 10 | 0 | 10 | 0 | — |
| Token | 10 | 1 | 8 | 1 | 31 |

These are observed outcomes, not intrinsic keyboard rankings. Sixteen attempts stopped on HTTP 503 Cloudflare error 1102, “Worker exceeded resource limits.” The frozen recorder mislabeled their absent release headers as release changes. Errors and spent costs remain in the results; no failed attempt was replaced. The error bursts and dispatch order confound comparison.

## Useful paired measurements

| Exact target | Chunk activations / seconds | Predictive activations / seconds | Token activations / seconds |
|---|---:|---:|---:|
| T01: ordinary English | 38 / 334.4 | 69 / 455.4 | 31 / 284.7 |
| T02: English reply | 32 / 260.1 | 47 / 375.3 | Failed exact review |

Times start at the first activation and end at closure after public-record verification. They include client decisions and tool latency; they are not Worker latency. All activations in these completed pairs caused HTTP requests. Token beat Chunk on T01; Chunk beat Predictive on both paired English cases. Those few pairs do not establish a universal default.

Reading cost matters: on T01 Chunk transferred 440,952 encoded body bytes and exposed 191,347 o200k proxy tokens, versus Predictive’s 567,668 bytes / 62,466 tokens and Token’s 198,842 bytes / 78,435 tokens. Chunk used fewer pages than Predictive but exposed approximately 3.1 times its text. Proxy tokens are not Luna billing tokens; wire counts exclude headers/TLS.

## Action priorities

1. **Stabilize the Worker.** Reproduce the recorded search/composition operations with fresh sessions and profile memory, CPU, lexicon/model loading, and rendering. Error 1102 establishes a resource-limit outcome, not which resource caused it. Do this before fifty-case comparisons. Preserve read access and publication/recovery contracts.
2. **Keep Chunk’s interaction and simplify its extracted payload.** START / INSIDE / END is intentional. Its exact lane completed the Japanese/emoji target in 80 activations. Reduce repeated prose and verbose repeated labels while keeping direct HTML routes and the exact lane. Its final tab-formatting case was not attempted, so full formatting coverage remains untested here.
3. **Fix Predictive’s coverage boundary.** Its supplied controls could not enter Japanese/emoji in T09 or a tab in T10. T10 did preserve double spaces and blank lines before the tab stop. Add a draft-preserving exact lane or clearly identify its narrower character coverage and fallback.
4. **Classify Prefix by capabilities.** Its search menus require GET forms. Nine observed stops were at capability/word-discovery boundaries and one at a service error. Test it separately with a form-capable client; do not mix those shortcuts into a link-only score.
5. **Clarify Token draft versus search state.** Its prefix search uses the same draft markup as the message. Byte fallback took enough work to exhaust twenty-minute budgets in T03 and T09; T09 also included typing and command-path mistakes. Token can be efficient when useful exact tokens are discovered, as T01 shows, but this pilot does not show reliable general task completion.
6. **Make word effects and review clearer.** Two testers tried to publish unequal drafts; the exact-target guard blocked publication. T02 Token omitted `message`; T03 Predictive never entered `for`. Separately, Predictive source can replace a typed final word on candidate selection. Distinguish complete-current-word from add-next-word, and make the current draft unmistakable. Do not claim the observed omission proves replacement.

## Recovery and recorder delivery

Selected single-character probes passed lost-addition replay, lost-publication replay to the same public ID, return to an earlier immutable branch, and expired-review recovery without retyping across all four methods. These are implementation contracts, not measurements of agent recovery ease or near-limit behavior. See [recovery evidence](RECOVERY.md).

After closing the interrupted baseline, the local recorder was changed to use ignored durable storage, distinguish headerless service errors from a changed valid release, and reject preparation when its fingerprint differs from the frozen manifest. The original freeze and results remain historical. Future attempts require a new versioned cohort. Durable ignored storage still needs a private backup. No live keyboard fix is implied by these client repairs.

## Limits and next decision

This was a purposive ten-target pilot with fresh GPT-6 Luna testers, supplied links only, no forms/JavaScript/URL construction, 300 activations and twenty-minute stopping budgets. It did not test GET methods, normal-browser conditions, near-1,200-byte strings, all accepted Unicode, or shortest paths. Account interruption affected timing. Full raw traces are no longer available; the exports remain auditable measurement snapshots with declared recovery limits.

There is no need to repeat everything. Use this baseline to prioritize the fixes above, then run a small separately versioned regression cohort with durable recording. Reserve new held-out targets for broader comparison. The original forty-attempt objective remains incomplete by one unstarted slot and one interrupted slot; this report deliberately does not label it achieved.

[Detailed observations](OBSERVATIONS.md) · [Next engineering work](NEXT.md) · [Per-run facts](runs.json) · [Paired data](comparison.json) · [Fixed release/client](freeze.json) · [Closure evidence](CLOSURE.json)

## Task-level outcomes

C = exact verified publication; F = failed; I = interrupted; N = not attempted. Numbers are recorded activations, not optimal paths.

| Task | Chunk | Predictive | Prefix | Token |
|---|---|---|---|---|
| T01 | C; 38 | C; 69 | F; 4 | C; 31 |
| T02 | C; 32 | C; 47 | F; 3 | F; 42 |
| T03 | C; 34 | F; 101 | F; 4 | F; 124 |
| T04 | F; 75 | F; 6 | F; 2 | F; 88 |
| T05 | F; 17 | F; 22 | F; 2 | F; 44 |
| T06 | F; 4 | F; 28 | F; 3 | F; 38 |
| T07 | F; 4 | F; 2 | F; 3 | F; 7 |
| T08 | F; 3 | F; 15 | F; 2 | F; 26 |
| T09 | C; 80 | F; 3 | F; 2 | F; 129 |
| T10 | N | F; 15 | F; 2 | I; incomplete cost |
