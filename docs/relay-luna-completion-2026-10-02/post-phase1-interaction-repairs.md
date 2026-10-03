# Post-Phase 1 interaction and transport repairs

The completed 70-cell campaign and its failures remain frozen. This repair changes product behavior and the local supplied-link client; it starts no comparative campaign and claims no measured speed gain.

## Product: repair an earlier space without deleting the suffix

Chunk, Predictive, Prefix, Short and Span now expose **Repair spacing** inside **Repair words and punctuation**. The read-only screen shows at most 20 character boundaries per page, contextual snippets, and signed links that insert exactly one ordinary space or remove exactly one existing ordinary space. Character positions count Unicode scalars, including supplementary characters. Repeated spaces, tabs, CR/LF, Unicode normalization and every other character remain untouched. Links create existing immutable unpublished branches; normal undo, replay, body/state limits and separate publication review remain authoritative.

This addresses an observed missing-space repair cost without guessing intended text or automatically rewriting an identifier. Frame retains its slot/fallback edits; Token retains its exact byte/token controls. Incorrect suggestion selection still requires exact review: no target-aware correction, dictionary-based rewriting or automatic approval is introduced.

## Local client 2.10

- Prefer IPv4 DNS ordering while retaining normal connection-family fallback and the existing minimum 1,500ms per-address attempt allowance. On this machine, a read-only bootstrap request succeeded over IPv4 in 465ms while IPv6 failed to connect. Six subsequent Node bootstrap requests with IPv4-first all returned 200 (496ms for the first, 99–116ms for later requests). This addresses the demonstrated local route problem; it does not prove all transient network errors resolved for this or other clients.
- Use one 20-second navigation timeout across redirects and response consumption; redirects no longer each get a fresh 20-second allowance. Release redirect response bodies. No HTTP action is retried automatically, including publication. Last successful supplied state remains available after failures.
- Return the actually inspected output page after a local guard, rather than resetting the error display to page zero. Supply a generic hint to prefer a displayed aria name and use its section when needed. All links remain in source order; uninspected or ambiguous actions are still refused.
- Responses identify client version and expose navigation/header/body timing plus literal inserted/removed text and unchanged prefix/suffix lengths. The change is calculated only from observed drafts, with no knowledge of assigned phrases. These are immediate response fields in the existing ephemeral client state, not a client recorder, extra requests or new server analytics. Tool/model latency remains outside navigation timing.

The process ceiling remains nine minutes, as in client 2.9; it is a maximum, never a required duration. Prior client versions and trial contracts in the Phase 1 ledger are unchanged. Native server telemetry still covers external clients, stays private and expires after 30 days. Database schema, logging frequency, quota guards, production storage identity and public retention are unchanged.

## Validation

Passed: supplied-link browser fixtures (inspected page recovery, Unicode middle-change feedback, one timeout across redirects, no action retries, bounded output, stale/uninspected links, no field input); shared spacing fixtures on all five adapters (middle insertion/removal, exact suffix preservation, signed replay, tampering rejection, undo and reviewed body); all seven keyboards' displayed punctuation; shared foundation/publication boundaries; Relay integration including all seven reply relationships and the 4,096-byte bootstrap ceiling.

Production deployment and an excluded unpublished canary are recorded below after verification. No successful comparative trials are claimed for this release.
