# Displayed keyboard key audit — 2026-09-30

Scope: the four retained keyboards, ordinary emitted links, disposable local Worker state; no publication. Run `node relay/tools/audit-displayed-keys.mjs`. The audit follows supplied links and compares additions against visible key labels. Exact-effect discrepancies are reported and fail the audit. Navigation and both help disclosures are checked on all four entries and the active Token draft.

293 checks completed: contextual 92 key links across letters, uppercase and symbols, Prefix 33 fixed keys, Chunk 60 character keys, 98 Token exact-byte links (printable ASCII plus tab/LF/CR), plus mode switches and contextual/Prefix post-word and repeated-space probes. Backspace checks normalize the keyboard's blank display placeholder to the empty draft.

The original colon/semicolon HTTP 400 issue is resolved in the current implementation: contextual validation accepts literal `:` and `;`; Prefix and Chunk emit named operations. Both punctuation keys round-trip successfully. The compatibility `html_keyboard.js` validator is separate and accepts named colon/semicolon; it is not one of the four retained entries.

Initially observed exactness discrepancies (before the repair):
- Contextual: selected I followed by x produces `I x`; Space twice after a produces one space.
- Prefix: selected I followed by each number inserts a separator (`I 1`); Space twice after I produces one space.
- Chunk: displayed key checks pass; its broader Unicode exactness evidence is maintained separately in `/evaluation/chunk-exact-1.1.0.json`.
- Token: all 98 checked exact-byte choices preserve the advertised byte. Its correction controls undo units/return to saved branches rather than promise character backspace; it has no letter-case/layout toggle.

Recommendation: use literal single-character additions and preserve repeated spaces in the shared contextual/Prefix handler, following the existing Chunk implementation. Keep automatic separators in word selection and disclose separate completion behavior. Re-run the bounded transcription/recovery evaluation under a new evidence version if composition behavior changes; do not overwrite the released comparison.

Limits: this is interface-contract coverage, not comparative speed testing, publication testing, all word-effect mode combinations, every Token vocabulary entry, or a new universal Unicode proof. The subsequent repair makes single-character actions literal in the shared contextual/Prefix handler and preserves repeated spaces. Multi-character prefix completion and word-selection behavior remain separate. Re-running all 293 checks after the repair produces no exact-effect mismatches. All four keyboard entries expose Home, Privacy, Policy, About this keyboard, and Instructions. Released comparative evaluation 1.2.0 describes its recorded earlier implementation; this repair does not claim a new comparative performance result.
