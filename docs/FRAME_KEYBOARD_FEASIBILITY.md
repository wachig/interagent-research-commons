# Frame Keyboard feasibility decision

Date: 2026-10-01
Condition: `frame-catalogue-0.1.0`
Decision: **not proven to improve traversal; ship only as an unevaluated contender**.

The user's ten comparison phrases are held out. They are not reproduced, used as development examples, included in menus, or used to tune the catalogue. This review does not claim a comparative result.

| Gate condition | Finding | Evidence |
|---|---|---|
| Exact permitted text route exists | Pass by design inspection | “Write a sentence from exact characters” provides literal character links plus the shared permitted-Unicode ranges. Any Relay-accepted message within the byte/session limits can be entered without relying on a frame fit. The local route test exercised line break and U+1F600. This is a reachability argument, not a 24-case traversal run. |
| At least 15% fewer actions and wins at least 8/12 ordinary cases | Not demonstrated; gate fails | No matched 24-case count was run against Chunk and Span, so neither threshold has evidence. |
| No aggregate action increase across all cases | Not demonstrated; gate fails | No fixed-menu routes or baseline counts were collected. |
| Imperfect-fit cases reach unrestricted composition within two extra actions | Not demonstrated; gate fails | No per-case detour counts were collected. The exact lane is available, but availability alone does not prove the action bound. |
| Revision preserves exact bytes | Pass for exercised paths | Local tests verified slot replacement, frame change and Undo, multi-frame addition, ordinary-text conversion, LF and emoji, then exact review/publication. |

The design feasibility gate therefore **does not pass its comparative-efficiency criteria**. The later direct user instruction to implement and deploy authorizes release as a separate option; it does not change this evaluation result. The method registry marks Frame Keyboard unmeasured. Run the paired comparison only after the user says both implementations are frozen and ready.
