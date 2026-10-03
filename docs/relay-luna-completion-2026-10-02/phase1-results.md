# Phase 1 results — complete

All 70 required success slots are independently certified: ten exact phrases on each of seven keyboards, one successful GPT-6 Luna supplied-link-only run per cell. Seventy distinct public message IDs, exact bodies and SHA-256 digests were checked; every successful runtime is independently confirmed GPT-6 Luna and all tester processes are closed. No Phase 2/3 run was started.

| Keyboard | Exact successful phrases |
| --- | ---: |
| chunk-word | 10/10 |
| short-word | 10/10 |
| predictive-word | 10/10 |
| prefix-link | 10/10 |
| span | 10/10 |
| token-link | 10/10 |
| frame | 10/10 |

This is completion after retries, not a70-for-70 first-attempt success rate. The ledger preserves all 133 attempt records, including 63 unsuccessful/infrastructure records. Twenty-three records are categorized by the evidence auditor as approval-related. That classification can overlap with draft errors and is not a keyboard-only failure count. No failures were replaced by successes or deleted.

## What the final unchanged-keyboard cohort shows

The following P10 observations share production d0519e27, client 2.8 and contract 1.8. They are single fresh-agent observations, not counterbalanced replicated estimates or shortest-path proofs. No Chunk/Short result exists in this cohort, so the table cannot rank all seven keyboards.

| P10 method | Associated native requests | Client time to public receipt |
| --- | ---: | ---: |
| predictive-word | 17 | 126s |
| span | 17 | 146s |
| frame | 29 | 221s |
| token-link | 24 | 265s |
| prefix-link | 42 | 378s |

Native counts include the associated run through tester public receipt and exclude later independent operator verification. Home/deep discovery and local output reads are separate; native requests are not the full owner link-activation budget. Client times include model/tool/inspection overhead in the process countdown scope. Do not pool different releases/client contracts into a speed winner.

Prefix P09 required two additional seven-minute deadline failures, followed by a separately pinned client 2.9 / contract 1.9 retry with a nine-minute maximum. Its exact successful run used 52 associated native requests, about 443 seconds from client startup to publication; associated server first-request-to-receipt time was 434.615 seconds. The cutoff change establishes completion, not an efficiency improvement.

## Actionable findings

- Prefix word-discovery menus currently require GET forms; strict link-only agents fell back heavily to individual character links. Making the word-discovery controls accessible as supplied links is a concrete optimization opportunity. This was not changed during the final completion pass.
- Client/model/tool round trips dominate wall time: even a successful low-request path can spend seconds between choices. Worker processing milliseconds are not a measure of useful agent speed. Final generic concise/1000ms-yield instructions reduced avoidable waiting without providing a coached path; single observations cannot prove causality.
- Spacing, incorrect suggestion selection and local label/section guards still cause corrections. Exact full-body review and independent public reads remain necessary; a tester’s claim of equality alone is insufficient.
- Transient EHOSTUNREACH and earlier ETIMEDOUT failures remain infrastructure evidence. Retained-state inspection avoided blind publication replay; unknown failed-fetch server work is not assigned zero cost.

## Evidence and operational boundary

[manifest.json](manifest.json) contains the exact corpus and Phase1 scope. [ledger.json](ledger.json) retains receipts, attempts, release/client/contract pins, failure costs and aggregate native metrics. [tester-instructions.md](tester-instructions.md) preserves profile rules and contract changes; the three repair documents and README checkpoints preserve the repair history.

The read-only evidence audit reports no certificate problems. Some older attempt records have only partial/unknown or legacy-scoped accounting; these remain explicit accounting limitations and do not mean zero requests. All final-pass recorded runs have complete associated native export accounting through their frozen cutoff, without export truncation or reported capture gaps. Raw telemetry was neither published nor committed and expires after 30 days. Public message retention is separate (up to 90 days).

At the completion export, the internal daily meter was 651,789 rows read / 49,724 rows written, 3,293 of 3,500 native observations, with telemetry still active. Its 50,000-write telemetry pause and 90,000-write mutation guard remain unchanged. These are internal object counters, not account-wide provider billing. Testing is stopped; do not launch another batch from this completed phase.

Production remains d0519e27-329d-4216-9e57-278f21d0a930; the final cutoff change is local test infrastructure only. Link-only browser security/behavior fixtures passed after that change.
