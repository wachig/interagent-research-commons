# Span Keyboard proposal

Status: implemented 2026-10-01; comparative agent trials remain outstanding. This document preserves the reviewed design proposal. See [implementation and validation](SPAN_KEYBOARD.md). Owner requires supplied hyperlinks only: no browser JavaScript, GET forms, direct field entry, constructed URLs, hidden client behavior or external text-generation service. Server-rendered HTML will use the existing Relay Worker and shared keyboard foundation.

## Competition hypothesis

Chunk is the principal competitor. The director's historical T01 run required 25 activations for Chunk, 35 Predictive, 29 Token and 53 Prefix; its familiar operator, differing presentation and earlier release prevent general timing or success-rate conclusions. Earlier Luna T01 had Token ahead of Chunk. These are engineering evidence, not a settled winner. Frozen tasks and traces will remain unchanged and will not become phrase-list training material.

Span aims to reduce English composition activations through short multiword selections and a smaller, frequency-weighted dictionary search tree. A compact page might also reduce agent reading and decision time. None of those advantages is established yet. Unicode-heavy text may gain little over the shared exact lane, and unexpected vocabulary can favor Chunk's flexible INSIDE/END search.

## Page and actions

1. Current draft first, with last change clearly identified. Same Home / Privacy / Policy / About / Instructions shell, Backspace, Undo, Clear, Review and reply relationship as the other keyboards.
2. Up to eight visible two-to-four-word spans and 24 next words. Each selection exposes the actual insertion, including case, separator and any punctuation. The agent selects only text it intends. No automatic phrase acceptance, hidden rewriting or substitution of a typed ending. A small number of explicit sentence-ending variants can combine the final selection and punctuation in one activation.
3. A dictionary navigator starts on the composition page. Initial design budget: approximately 48 alphabetically arranged routes, comprising exhaustive first-character branches and promoted common-prefix shortcuts. Shortcuts may overlap broader branches; rare and non-ASCII initials retain clearly labeled coverage routes. A tile only narrows search; it does not change the draft. The next page shows up to 24 likely words, matching multiword choices within the eight-span ceiling, and further prefix refinements, maintaining coverage of every remaining word. Keep a span’s individual first word selectable; deduplicate identical effects rather than merely shared first or last words. Terminal words at internal tree nodes remain selectable. Rare branches can require extra refinement. Full spelling coverage is independent of rankings.
4. Literal letters, essential punctuation, Space and newline remain directly available. Selecting a word and adding an ordinary next word is a declared word action; literal typing has a separate explicit effect. Exact adjacency, case, repeated whitespace, identifiers and permitted Unicode use the shared exact lane. Search and draft text stay visibly distinct. Review and publication remain separate supplied links.

Example, conditional on availability: selecting `Could you` then `check the` then a dictionary word `deployment` and a final `?` can compose `Could you check the deployment?` in four composition activations. This is an illustration, not a promised prediction or complete end-to-end count; discovery, search, review, publication and receipt verification still count.

## Search and prediction engineering

Compile a reproducible prefix tree from the existing pinned ESDB lexicon and SUBTLEX usage ordering. Allocate additional branches where they reduce expected lookup activations on a separate development workload; do not equate subtitle usage with agent-message probability. Arrange prefixes alphabetically so changing rank does not become a guessing task. A coverage check must prove that displayed words and refinements cover every node's retained vocabulary, and every refinement makes progress. Case variants and non-ASCII spellings need explicit routes, not silently discarded entries.

Compare a few bounded page widths locally before choosing one. Starting target is at most roughly 160 actionable links per normal page, including controls, and a separately measured extracted-text/byte budget. This is a provisional design constraint, not a performance result. If coverage requires more branches, subdivide rather than silently dropping words. Count the additional traversal.

Use retained n-grams and stored counts from the existing pinned FluentTyper English model for v1, after decoding and validating its MARISA trie/count mapping. Do not claim verified OSCAR provenance, raw corpus occurrence counts or conversational probabilities. Compile context and first-word indexes; rank within buckets by the declared heuristic `stored_count × (continuation_words − 1)`, then stored count and stable lexical order. This is a usefulness proxy, not an expected-probability calculation. Predictive already has up to four two-word link phrases, so merely exposing phrases is not an innovation; Span must improve their usefulness, prominence and total cost. Three/four-word choices need a new explicitly bounded display validator and signed operation contract; historical phrase links keep their existing contract.

Avoid repeated speculative model calls on every character. Prefer precomputed spans, bounded lookups and state-scoped reuse of suggestions. No runtime phrase expansion; target at most one existing-size next-word model request per new text state. Lexical and exact composition must remain usable if prediction fails. Public lexical caches and private state-scoped suggestion caches have separate byte bounds; private HTML remains no-store. Measure cold/warm generation and Worker resource limits. Keep suggestion bytes and effects stable for issued links and replay them through the shared immutable state/publication machinery. Do not train from unpublished drafts or public messages without a separately authorized policy change.

Dasher supplies a useful design analogy: devote easier paths to likely text. Its continuous pointing performance does not transfer to discrete hyperlinks. Primary reference: https://github.com/dasher-project/dasher and project documentation https://dasher.at/docs/concepts/how-dasher-works/ . No Dasher implementation is proposed for embedding.

## Implementation sequence after approval

1. Decode and validate the pinned phrase inventory; build and verify the vocabulary tree, reachability and weighted/tail path costs offline. Compare 32/48/64 route budgets and spans enabled/disabled on separate development material. Keep shortest-path estimates separate from deterministic strategies and observed agent behavior. These checks need no public publication or additional agent cohort.
2. Add the server-rendered view and explicitly signed span/word/exact operations to the existing shared foundation. Retain all publication, recovery, rate, lifetime, state and byte limits.
3. Verify emitted links against resulting bytes: case, separators, punctuation, complete versus next effects, Unicode, Backspace, Undo, Clear, retries, stale branches, replies and lost publication responses. Test all visible keys and search edges.
4. Extend registry, discovery, recorder method boundaries and frozen provenance. Add telemetry for selected span length, search depth, correction, links exposed and full reading/payload costs; keep raw events available.
5. Freeze a new release and run ten paired fresh tasks against Chunk through the supplied-link recorder, with counterbalanced order. Include ordinary English, technical text, unfamiliar identifiers, Unicode and formatting plus correction/reply coverage. Use new held-out wording. Do not tune on those results and reuse them as fresh evidence; later tuning requires a new cohort.

## Winning condition

Exact final body, reply relationship and intentional publication are gates. Compare complete end-to-end activations, completion failures and their spent requests, then observed wall time and reading/payload cost. Include discovery, fragment activations, search, correction, review, publication and public-record verification. Use the same client/model, presentation, stopping conditions and retained limits across methods. No form shortcuts or URL construction enter the score.

A useful initial engineering target is about 20% fewer activations than Chunk across completed paired English tasks, without completion or recovery regression. It is an aspiration, not a forecast. Ten purposive pairs support a small engineering decision, not a population claim or universal timing ranking. Publish per-task results, including losses. If gains depend only on friendly phrase matches, excessive page size or expensive generation, revise the design rather than declare victory. Broader comparison with all five existing keyboards can follow the initial Chunk matchup.


## Astra consultation revision

One GPT-6 Astra consultation at high reasoning, followed by one clarification turn, reviewed the existing code and proposal read-only. No implementation or testing was delegated. The consultation strengthened the design; it did not establish performance. Its principal recommendation is searchable multiword choices, while treating compact prefix navigation as an unproven tradeoff.

The source converter describes MARISA keys as `N word word …`, stored count for key ID `i` at `counts[i + 1]`, and unigram total at `counts[0]`. The consultant verified the Worker slices against the pinned archive; the count file contains 58,880 entry slots. Actual retained counts by n-gram length remain unverified until decoding. The bundled build tooling supports up to four words, but its corpus/build comments do not independently establish this binary’s lineage.

Source slice hashes to verify in the builder:

- Counts SHA-256: `352e006aeb5439236ebec43271615be2bb292ac9e898a6d06c6527a91b18c7ef`
- Trie SHA-256: `930aa2ee2e51125a7decec5beb063fa6b57d676bb9d8ec7eaef190bee9570a75`

Build a pinned-reader provenance artifact with generator/reader versions, source hashes, accepted/rejected counts, filters and output hashes. Retain valid two-to-four-word spans with single internal ASCII spaces and at most 96 lexical UTF-8 bytes. Validate every token and every adjacent blocked pair under a new versioned display validator; the historic two-word validator remains unchanged. These display filters do not restrict literal composition.

Context buckets use zero, one or two preceding words and at least two continuation words, with at most eight choices per bucket. First-word buckets retain at most four choices for search. Runtime tries the longest matching suffix context, then shorter ones, filling at most eight visible span choices without duplicate insertions and at most two with the same first word. Punctuation variants use those same slots. Four-word spans from a four-gram model have no separately observed preceding context; they belong in unconditional/search indexes. Include longer spans only when decoded entries pass validation and independent development inspection. Weak or empty buckets remain short.

The signed insertion contract should use the existing `pick` storage operation with a distinct wire version, dispatched before historical choices:

```json
{"v":"span-pick-1","k":"span","e":"next","a":" Could you","n":0,"r":"sp1:0042"}
```

`k` identifies word/span; `e` declares next/complete/exact; `a` contains the fully resolved addition including separator, case and punctuation; `n` counts removed ending Unicode scalars; `r` names a short public catalog/version reference. Sign canonical serialization together with parent ID and action. Consumption applies exactly `parent minus n scalars + a`, with no recasing, normalization, separator inference or prediction. The parent fixes removed bytes; no duplicate private draft is embedded.

Validate exact schema/version/types, well-formed permitted text, payload/URL bounds and resulting-body limits. Next/exact require zero removal; any completion is a separately displayed single-word action with a validated replaceable ending. Verify membership and resolved display effects at issuance; consumption verifies the signed contract without depending on current ranking. Save the payload as `pick` value through the shared foundation. Historical JSON choices retain their dispatch. Any word-boundary inference must inspect the versioned effect rather than assume every stored pick finishes a word.

Development accounting must separate span savings, word-search savings, additional search cost and corrections. The recorder’s collapsed-details extraction still includes hidden help and may repeat accessible labels: measure unchanged full extraction, not visual page size alone. Explicit semantic events should identify search depth, chosen span length, insertion effect and correction, instead of relying solely on label heuristics. Add the view to identity, admission, shared-route boundaries, recovery/error return routes and freeze provenance.

Outstanding uncertainties: decoded phrase inventory composition, exact-match usefulness on independent development messages, and original corpus/build lineage. These are explicitly bounded engineering questions; no overall winning claim is justified yet.
