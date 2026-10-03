# Relay database usage audit

Owner paused the Luna evaluation at9/70 and requested database-efficiency work, including other services sharing allowances. No tester processes or new scored publications ran during this audit. Hourly automation remains deleted.

## Live account evidence

Read from the signed-in Cloudflare dashboard on2026-10-02, before the UTC rollover:

- Account Durable Object usage, displayed October2 window: approximately6.34million SQL rows read,119.81thousand written,16.79thousand object requests and10.78MB stored. Object requests include internal storage calls and alarms; they are not published-message counts or visitor page views.
- Production namespace `iarc-relay-invited-pilot_RelayStore`, bound to `iarc-relay`: one active instance, `iarc-relay-pilot-global-v1`,16,789requests. Its namespace charts showed approximately6million reads/120thousand writes and333alarm invocations in the last24hours.
- The only other Durable Object namespace, `iarc-relay-public-preview_RelayStore`, showed0requests/0errors and417.79kB storage. No other active Durable Object consumer appeared in this account inventory.
- ARC's separate `arc-search-analytics` D1 database showed1query,1row read,0written and28.67kB storage over the last24hours. Its only displayed query was scheduled expiry cleanup. ARC source uses one upsert per search and daily cleanup; this was not the exhausted Relay allowance. ARC source/deployment was not changed.
- IARC's main orientation Worker and Alpha Cortex's observatory configuration have no Cloudflare database binding. Soria/local SQLite stores do not consume this Cloudflare Durable Object allowance.

Cloudflare Free documents5million reads and100,000written rows per UTC day. Index changes, deletions and alarm writes also count. Source: https://developers.cloudflare.com/durable-objects/platform/pricing/ and https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/ . The provider documents midnightUTC reset, but actual production record reads continued to fail after midnight. A later no-cache read of the saved `Hi.` record returned200 during this audit; recovery was established by that response, not by elapsed time.

## Demonstrated causes

The previous logger persisted each displayed eligible link, including unselected choices. A saved application snapshot showed23,424choice allocations and655observed requests. That application allocation count is not an exact provider-write total: old duplicate allocations, indexes, events, state writes, alarm activity and earlier traffic contribute separately.

Per-run choice counting lacked an index and scanned the growing choices table. Earlier repairs added the index, removed duplicate allocations, skipped installed schema DDL and coalesced alarm writes. This audit replaced the source of amplification rather than relying on a smaller choice cap.

A700-action local SQL-cursor probe also identified repeated Token event-history counting:403count queries read60,904rows in that probe. Ordinary keyboard state counts and repeated state loads remain measurable costs, but do not show the same cross-run choice-table amplification. Current diagnostics expose their actual costs for future evidence-based work.

## Repair

Telemetry2.0 stores zero new per-displayed-choice rows. Word/span/frame choices and correction/review/publication controls carry bounded authenticated attribution in their supplied links. Metadata binds the unchanged target URL, originating run, expiry, section, ordinal and action. It cannot authorize editing or publication. The transport parameter is removed before existing route/capability validation. Altered metadata cannot fabricate attribution or break an otherwise valid capability. Legacy untagged links and stored choice rows remain supported until their original expiry.

Character and filter requests still produce normal request events; their individual presentation ranks are not recorded, matching the earlier selective attribution scope. Overview/documentation/public-record links remain canonical. Emitted relative links respect HTML's base URL. There is no added JavaScript, form entry or extra page traversal. Metadata adds80URL characters only to the eligible action links; larger character/filter grids are not inflated with it.

Native request counts now use an atomic per-run reservation counter, with one indexed backfill for historical runs. Token's existing event cap uses a session counter maintained only for actual event inserts, including idempotent duplicates. Its historical sessions backfill once. The counters preserve existing event limits and retention; their existence does not prove an external transcription target match.

Private operator exports include SQL-cursor row costs and query-template aggregates without parameter values. The instance diagnostic scope is explicit. Persistent daily counters survive object reload and account for their own writes with one-write lag. They exclude budget-loading reads, alarm API writes, other namespaces and unobserved failures; provider totals remain authoritative. Counter data is excluded at its30-day deadline and cleaned up physically.

Safety reserves:

- Optional native and legacy Token telemetry pauses at50,000metered writes or3million reads; native event collection also caps at3,000requests/day. Normal keyboard actions remain usable at this telemetry boundary.
- Cleanup defers to the next UTC allowance after60,000writes or3.5million reads. Native expired-event/choice/run cleanup uses500-row batches. Existing parent/child cleanup relationships remain unchanged. Logical expiry exclusion remains immediate; physical deletion can be delayed by the reserve.
- New storage mutations stop at90,000writes or4.5million reads, leaving a reserve for ordinary record reads and overhead. Daily-counter persistence also pauses at that write boundary so read-only traffic does not keep spending writes. This is a measured-object safeguard, not a promise of unlimited traffic or an account-global billing controller. One operation may consume more than one row; schema installation and other namespaces require headroom as well.
- `budget-paused` response headers and exported pause timestamps/`budget_possible_gap` prevent an interrupted measurement from appearing complete. Benchmark analysis must inspect these fields and client evidence. Optional telemetry must not determine whether a reviewed publication succeeds.

No new storage namespace, billing upgrade, authentication bypass or user-data migration is involved. Public messages retain their existing retention, up to90days; private analytics remain30days.

## Verification

The full `npm run test:relay` suite passed, including all-seven reply/publication, retry/expiry/capability, exact Unicode, lexicon, protected export and egress checks. Targeted native-usage checks additionally passed after final safety-boundary changes: malformed attribution, zero new issued-choice rows, denied-write reads, persistent-budget reload, blocked mutation with no new row, cleanup deferral and UTC-day recovery. Local stress data is in `storage-profile.json`; rerun with `node relay/tools/profile-storage.mjs`.

Final mechanical probe:100literal `a` activations on each of seven keyboards,700actions total, no public publication and no Luna benchmark trial. Six methods used1,201written rows per100actions, including a final operator export; Token used2,896. Token reads fell from73,811in the intermediate pre-counter probe to13,713after the counter repair. The small additional counter writes are included. These are local SQL cursor measurements, not production billing totals, WAN timings or an agent keyboard ranking. Filtered attribution also avoids the payload growth of the rejected all-link instrumentation variant.

## Released and checked live

Production Worker release `aeec3798-10d7-4de8-9a17-79d6f046e2d9` was deployed from local commit `f38b7cd` on2026-10-03UTC, using the same Worker, namespace and global object. The release completed. After explicit owner authorization, the repair and verification commits were pushed to the established public GitHub origin.

At00:36:11UTC, an operator-only unpublished canary read the saved `Hi.` message exactly (HTTP200), entered Chunk (HTTP200), and followed the displayed `You` word link (HTTP200). The resulting draft was exactly `You`; both responses reported recorded native telemetry. This is not a Luna trial or benchmark success slot.

The protected export independently confirmed telemetry2.0,30-day retention, zero new choice allocations for the current UTC day, the deployed release on the canary run, two events, no truncation and no budget gap. The selected event reported `word-or-span`, `top-words`, rank11, three draft/delta bytes and status200. Private cursor diagnostics showed5,338reads/1,866writes since the object loaded, including the one-time index installation (3,633reads/1,811writes). Daily budget accounting was available and unpaused. These are measured-object diagnostics with the exclusions described above, not provider account totals.

The evaluation remains owner-paused at9/70. No new public message was published. Future evaluation dispatch requires an owner resume and a fresh headroom check; historical attempts and certificates are preserved.

At00:39UTC (17:39October2 in Whitehorse), the account dashboard showed the new October3UTC daily window:57.18kreads and22.19kwrites, approximately98.9%read and77.8%write allowance remaining. A fresh unpublished health check returned200 for the saved record and keyboard entry with recorded native telemetry. Recovery is confirmed; the counters are fresh-day usage, not a lingering previous-day lockout. Provider totals include activity before this repair was installed; the new instance counters cannot retroactively measure that earlier cost. Keep that difference in the headroom check before restarting evaluation.
