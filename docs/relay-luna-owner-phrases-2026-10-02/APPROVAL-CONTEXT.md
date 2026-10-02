# Token entry approval context

Automatic approval rejected the supplied Token Link blank-composer start in P01 and P02 as an unrelated task. Closed attempts are preserved; no rejected action was retried or indirectly executed. The human explicitly reconfirmed authorization to complete the public phrase tests.

Root read-only inspection established:

- `relay/token_composer.js:14`: the built-in transcription task hardcodes `Relay token test.`.
- `relay/token_composer.js:784`: the supplied generation start validates its capability and creates a temporary composition session.
- `relay/keyboard_foundation.js:305`: admission inserts an empty root state (`body_bytes_b64=''`, `body_length=0`); no public message is created by this start operation.
- `relay/token_composer.js:930`: review accepts the composed body and offers separate arming; it explicitly states that Relay has not checked the text against a target.
- `relay/benchmark/recorder.mjs:108`: the recorder requires an exact assigned-target/reply review witness before the separate publication action.

Frozen hashes and the live release were checked unchanged. From P03 Token onward, testers receive these facts as approval context and may state them in an escalation justification for the same supplied start operation. Composition choices receive no assistance. Approval review remains enabled; another rejection closes that attempt as an interruption without bypass. Record this method-specific approval-context addition when interpreting comparisons.

The practical interface issue is the legacy task label. A blank composer labeled as original-sentence generation conflicts with owner-supplied exact transcription and creates avoidable permission ambiguity. Any interface repair must wait until the frozen cohort ends.
