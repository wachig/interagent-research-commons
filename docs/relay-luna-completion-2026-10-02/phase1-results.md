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

This is completion after retries, not a 70-for-70 first-attempt success rate. The ledger preserves all 133 attempt records, including 63 unsuccessful/infrastructure records. Twenty-three records are categorized by the evidence auditor as approval-related. That classification can overlap with draft errors and is not a keyboard-only failure count. No failures were replaced by successes or deleted.

## All seven P10 observations

Every keyboard has a verified P10 result. The previous report omitted Chunk and Short from this table because their runs used earlier conditions; that omission obscured the completed coverage. All seven results are shown below, with conditions visible.

**The campaign completed the transcription criterion, but did not deliver a clean seven-way performance comparison.** Keyboard releases and client instructions changed during the campaign, and earlier successful cells were not rerun under the final conditions. These observations can identify costs and failure modes, but do not establish a controlled overall winner.

P10: “Thanks for listening. I appreciate you.”

| Keyboard | Associated native requests | First associated request to public receipt | Client / contract | Release |
| --- | ---: | ---: | --- | --- |
| chunk-word | 21 | 145.472s | 2.3 / 1.2 | 365dcf75 |
| short-word | 32 | 268.455s | 2.3 / 1.2 | 365dcf75 |
| predictive-word | 17 | 117.513s | 2.8 / 1.8 | d0519e27 |
| prefix-link | 42 | 367.598s | 2.8 / 1.8 | d0519e27 |
| span | 17 | 138.718s | 2.8 / 1.8 | d0519e27 |
| token-link | 24 | 251.181s | 2.8 / 1.8 | d0519e27 |
| frame | 29 | 204.894s | 2.8 / 1.8 | d0519e27 |

The time column now uses the same server-observed start/end boundary for all seven rows. It includes intervening model/tool/inspection time but excludes pre-session discovery, startup and work after the receipt. It is neither Worker CPU time nor complete task wall time. Native counts include the associated run through tester public receipt and exclude later independent operator verification. Local reads and any unobserved network attempts are separate. These counts are not the complete owner link-activation budget.

Chunk and Short used release 365dcf75 / client 2.3 / contract 1.2; the other five used release d0519e27 / client 2.8 / contract 1.8. Keep that difference when interpreting the rows.

## All 70 successful cells: recorded associated request counts

This matrix exposes the full saved coverage, not a pooled ranking. Release/client pins and individual accounting scopes are retained in the ledger. A dash would mean an unavailable count, not zero. Failed attempts and their additional costs are separate from these successful-run counts.

| Phrase | Chunk | Short | Predictive | Prefix | Span | Token | Frame |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| P01 | 6 | 6 | 6 | 6 | 8 | 8 | 9 |
| P02 | 25 | 12 | 14 | 27 | 41 | 24 | 33 |
| P03 | 31 | 25 | 45 | 40 | 29 | 20 | 22 |
| P04 | 21 | 20 | 31 | 42 | 24 | 39 | 66 |
| P05 | 35 | 32 | 38 | 46 | 26 | 26 | 32 |
| P06 | 15 | 13 | 15 | 26 | 13 | 14 | 29 |
| P07 | 31 | 26 | 22 | 33 | 21 | 18 | 27 |
| P08 | 19 | 21 | 31 | 34 | 20 | 24 | 61 |
| P09 | 25 | 23 | 31 | 52 | 30 | 34 | 37 |
| P10 | 21 | 32 | 17 | 42 | 17 | 24 | 29 |

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

Subsequent changes are documented separately in [post-Phase 1 interaction repairs](post-phase1-interaction-repairs.md). They do not change these saved results or demonstrate a new performance ranking.
