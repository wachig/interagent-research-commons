# Individual keyboard repairs — Phase 3, 2026-10-03

## Evidence and changes

Chunk P08 sent 471 links / 93,537 uncompressed bytes on its first associated response; output clipping then contributed to an approval failure. Its required START grid remains available. Search links no longer repeat the default next-word effect and automatic case. Non-default effects/case remain explicit. Signed action anchors use shorter relative paths under the unchanged state base, resolving to the same destinations. Contextual Top Words are deduplicated against visible candidates; candidate pagination and full spelling coverage remain unchanged. Selected-START pages also avoid computing/signing the unused original START grid. No extra catalogue traversal or field entry is introduced.

Local independent synthetic sessions produced these samples (uncompressed HTML):

| Page | Before bytes | After bytes | Reduction | Links |
| --- | ---: | ---: | ---: | ---: |
| initial | 94,714 | 79,346 | 16.2% | 471 → 471 |
| co | 137,565 | 113,054 | 17.8% | 743 → 742 |
| con | 120,378 | 104,488 | 13.2% | 531 → 531 |

Random mnemonic state/signature lengths vary between independent sessions; these percentages are descriptive, not controlled latency or compressed-wire measurements. A separate same-document check expands compact anchors and proves every resolved destination identical. The opening grid still has 471 links; this repair reduces repeated encoding, not the number of supported START choices. Coverage and traversal costs take priority over hiding required choices.

Frame P04 published successfully after abandoning a mismatched generic frame and using exact characters (66 native requests); P08 used 61 requests and corrected repeated text. P03 expired while composing its character fallback. Generic frame choice is not an exact-match guarantee. Rather than add benchmark sentences to the catalogue, Frame now offers up to six typed-prefix completions and six contextual next-word suggestions directly in its slot and ASCII views, using the existing pinned predictor. Complete preserves the typed prefix; Add next word preserves the entire slot and inserts a separator only when needed. Signed immutable snapshot edits preserve all other slots and sentences. Character-view selections stay in that view, with backspace and literal whitespace available. Invalid or oversized proposals are not emitted. Predictor failure leaves exact characters and dictionary browsing available. Existing frame templates and quick replacements are unchanged.

No assigned target strings were added as shortcuts or training. Tests use a synthetic `Hel` prefix, check the full changed body, and verify replay/undo and distinct next-word spacing. Model-backed suggestions add payload/processing cost; their benefit must be judged in fresh Luna sessions, not inferred from local Worker milliseconds.

## Other keyboards

Recorded Short Word/Span comma and spacing corrections are covered by Phase 2 earlier-word comma repair and existing literal/undo controls. Predictive/Prefix ambiguous character/filter selections now have distinct accessible names. Their reported fetch failures remain infrastructure observations with unconfirmed causes. Token’s reported empty search result returned through supplied navigation without draft loss; one such result does not establish a general defect or justify changing its token inventory. No speculative redesign was made. All seven keyboard contracts remain in the required regression suite.

## Versions, privacy and validation

Foundation 1.5.0 / registry 2.0.4 identify this release. Historical registry 2.0.3 stays frozen. Client 2.5 and tester contract 1.3 remain unchanged. No database schema, logging-frequency or retention change; private raw telemetry expires after 30 days. Saved certificates remain 41/70, with their old cohorts untouched. No new scored Luna publication occurred in Phase 3.

New supplied-link tests verify compact destination equivalence, no duplicate contextual/candidate choices, retained non-default case/effect across search, contextual Frame completion/next-word exact effects, same-view return, replay and undo. The full required suite checks coverage, reply, native telemetry, recovery, publication and all other keyboards. Integration’s simplified link follower was corrected to resolve relative links against the actual document/base URL, matching the existing browser client; resolving them against the origin root was incorrect. All required test:relay component checks passed. Production receipt will be appended after deployment. Fresh Luna validation remains Phase 4.
