# First-phrase checkpoint — 7 of 70 slots closed

Dispatch is paused pending explicit authorization for the remaining 63 public test posts. There is no active tester. Raw responses, durable journals, state checkpoints and director helpers remain in ignored private storage, with a separate private backup after broker shutdown. No keyboard changes or service deployments occurred during these tests.

All seven attempts used target `Hi.`. Each was a fresh requested GPT-6 Luna context. P01 prompt variants and subsequent uniform clarifications are disclosed in README and TESTER-PROMPT; conclusions should also be checked with P01 excluded. The optional second round has not begun.

| Keyboard | Activations / HTTP attempts | Observed result |
|---|---:|---|
| Chunk Word | 8 / 8 | Exact publication and public record verified |
| Short Word | 9 / 9 | Published after exact review; tester followed service bootstrap instead of message record; completion failed |
| Span | 6 / 6 | Review draft omitted period; publication gate blocked |
| Predictive Word | 5 / 5 | Review draft omitted period; publication gate blocked |
| Prefix Link | 8 / 8 | Exact publication and public record verified |
| Token Link | 2 / 2 | Automatic approval rejected blank-composer start; recorded failed, separately adjudicated as environment interruption |
| Frame | 11 / 11 | Exact review reached; automatic approval rejected publication; recorded failed, separately adjudicated as environment interruption |

These are spent activations, including failed attempts, not comparable successful-transcription scores. Chunk and Prefix tie on this one successful paired case; it is insufficient to rank keyboards. The other five results do not establish keyboard inability. Frame also corrected an uppercase `I` to lowercase `i` using Backspace before exact review.

The immediate usability questions are whether review makes punctuation sufficiently noticeable and whether the publication receipt makes the public message record easy to distinguish from service-level Machine entry. Changes must wait until the frozen evaluation closes. Approval-environment blocks belong in separate accounting and must not be treated as keyboard failure rates.

Reproduce safe exports with `report.mjs` using this cohort's private root, then run `analyze-round-1.mjs` in this directory. `round-1-comparison.json` scopes the unchanged frozen plan to the required 70 slots; `comparison.json` includes the optional 70 second-round slots and therefore currently reports 140 planned. Missing slots are unattempted, not failed. Actual provider usage/cost and exact provider model build remain unmeasured; extracted o200k tokens are a page-content proxy.

Resume only after explicit publication authorization: retain the same frozen release and sources, remove the private director authorization guard, restart the broker using the existing cohort, and follow up the director with instructions to continue the next untouched slot. Do not rerun or replace these seven attempts. A production release change requires a new cohort rather than silently mixing conditions.
