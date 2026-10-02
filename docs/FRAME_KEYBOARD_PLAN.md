# Frame Keyboard implementation plan

Status: implemented as an unmeasured public contender under the user's direct instruction to implement and deploy. The ten user-selected comparison phrases remain evaluation-only and are not included in this document, the catalogue, tests, or menu tuning. The fixed-menu action-savings gate has not been passed; see [the feasibility decision](FRAME_KEYBOARD_FEASIBILITY.md). No comparative performance claim is made.

## Interaction boundary

Frame is an authored, deterministic sentence-frame composer. Its unit of composition is an editable grammatical frame with one or more named slots. It does not rank or insert corpus phrases. The first page presents a small frame catalogue grouped by communicative function, so function labels organize choices without adding a mandatory navigation step. A selected frame displays the exact current rendering, its required and optional slots, and the active slot. Slot selection, frame inspection, and vocabulary browsing do not mutate the draft. Slot replacement, frame change, and conversion to ordinary text are explicit immutable actions.

The ten user-selected comparison phrases are locked evaluation data. They are not stored here, used as development examples, included in menus, or used to tune the catalogue. Any later comparison must disclose that the implementer has seen the task descriptions and must treat the task wording as held out from keyboard assets and tuning.

## State and publication model

Reuse Relay's shared keyboard session, immutable branch, signed action, exact rendered-text snapshot, review, reply, expiry, and publication bridge. Each immutable frame document saves its full template definition beside slot identity and completion, and saves the exact rendered text in the same state row. Historical branches do not depend on a future catalogue render. Start and frame-change actions bind to the catalogue version. Review rejects unfinished required slots. Ordinary-text conversion materializes exact current text into a free-text frame.

The frame layer must not silently repair agreement, tense, capitalization, spacing, or punctuation. Offer explicit alternatives where a frame has grammatical variants. Restrict the prototype to one active frame at a time; no nesting, automatic paraphrase, contextual prediction, or model-generated text. Frame slots need ordinary supplied-link composition and an escape to the existing exact-text/character path; no JavaScript, typed form field, or constructed URL is required for the link-only path.

## Offline feasibility gate

Before building the public interface, freeze 24 separately authored development examples: two for each of six broad communication functions, eight deliberately imperfect fits (including negation, tense, identifiers, quotation, multilingual text, whitespace, multi-sentence output, and exact escape), and four revision cases (replace a slot, change intent, undo, abandon a frame). The examples must not copy user comparison phrases. Keep the fixture, frame catalogue, strategy, and outputs versioned; do not tune the catalogue after seeing evaluation outcomes.

For each example, count the complete route from entry through exact reviewed/publication outcome: frame discovery/selection, slot navigation, slot lookup or spelling, frame revision, ordinary-text conversion, punctuation, correction, review, publication, and public receipt verification. Record links exposed/inspected, HTML bytes, extracted text, HTTP requests, and estimated/observed elapsed time separately. Report both a target-aware shortest-path bound and a fixed visible-menu strategy that cannot inspect future content. Compare to Chunk and Span using the same example, capability boundary, publication/reply context, and counting policy. An offline graph is a design estimate, never an agent-speed result.

The feasibility decision is split between reachability and efficiency. Frame and its exact-character/Unicode path provide an unrestricted route for Relay-accepted text; the local end-to-end check covers representative frames, replacement, undo, conversion, line breaks, a supplementary-plane Unicode scalar, review, discard, publication, and expiry recovery. This does not constitute a 24-case traversal run. The specified 24-example comparison and its 15%/8-of-12 thresholds have not been measured against Chunk and Span, so the efficiency gate is **not passed** and Frame is documented as unevaluated. The user subsequently instructed direct implementation and production deployment, so the efficiency gate is recorded as a release limitation rather than a deployment veto. Do not describe Frame as faster, more accurate, or a winner until the separately authorized paired evaluation is run.

## Scope boundary and sequence

The older Semantic Composer plan shares infrastructure concepts but describes append-only semantic chunks, optional prediction, and multiple composition lanes. Span offers complete word/span insertions and lexical navigation. Frame's distinct behavior is user-authored sentence structure with editable named slots and explicit revision. Reuse proven state/publication patterns, not the older proposal's broad scope or Span's predictor.

1. Recheck the shared keyboard state schema and publication callbacks; Frame uses their existing temporary session/state tables.
2. Ship the separate no-JavaScript `/predictive-keyboard/html/frame-keyboard/` route with a versioned method-registry entry; no compatibility keyboard or existing menu entry is removed.
3. Verify immutable slot edits and frame changes, exact rendering, Unicode, review rejection for incomplete slots, reply, expiry, publication, and recovery.
4. Keep Frame labeled unevaluated. Run the 24-example paired comparison with the held-out user phrases only after the user signals that the competing keyboard is frozen and ready.
