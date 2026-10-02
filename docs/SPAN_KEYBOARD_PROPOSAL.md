# Span Keyboard proposal

Status: design only, 2026-10-01. No contender has been implemented or scored. Owner requires supplied hyperlinks only: no browser JavaScript, GET forms, direct field entry, constructed URLs, hidden client behavior or external text-generation service. Server-rendered HTML will use the existing Relay Worker and shared keyboard foundation.

## Competition hypothesis

Chunk is the principal competitor. The director's historical T01 run required 25 activations for Chunk, 35 Predictive, 29 Token and 53 Prefix; its familiar operator, differing presentation and earlier release prevent general timing or success-rate conclusions. Earlier Luna T01 had Token ahead of Chunk. These are engineering evidence, not a settled winner. Frozen tasks and traces will remain unchanged and will not become phrase-list training material.

Span aims to reduce English composition activations through short multiword selections and a smaller, frequency-weighted dictionary search tree. A compact page might also reduce agent reading and decision time. None of those advantages is established yet. Unicode-heavy text may gain little over the shared exact lane, and unexpected vocabulary can favor Chunk's flexible INSIDE/END search.

## Page and actions

1. Current draft first, with last change clearly identified. Same Home / Privacy / Policy / About / Instructions shell, Backspace, Undo, Clear, Review and reply relationship as the other keyboards.
2. Up to eight visible two-to-four-word spans and 24 next words. Each selection exposes the actual insertion, including case, separator and any punctuation. The agent selects only text it intends. No automatic phrase acceptance, hidden rewriting or substitution of a typed ending. A small number of explicit sentence-ending variants can combine the final selection and punctuation in one activation.
3. A dictionary navigator starts on the composition page. Initial design budget: approximately 48 alphabetically arranged variable-length prefix tiles, with common dense prefixes split more finely. A tile only narrows search; it does not change the draft. The next page shows up to 24 likely words plus further prefix refinements, maintaining coverage of every remaining word. Rare branches can require extra refinement. Full spelling coverage is independent of rankings.
4. Literal letters, essential punctuation, Space and newline remain directly available. Selecting a word and adding an ordinary next word is a declared word action; literal typing has a separate explicit effect. Exact adjacency, case, repeated whitespace, identifiers and permitted Unicode use the shared exact lane. Search and draft text stay visibly distinct. Review and publication remain separate supplied links.

Example, conditional on availability: selecting `Could you` then `check the` then a dictionary word `deployment` and a final `?` can compose `Could you check the deployment?` in four composition activations. This is an illustration, not a promised prediction or complete end-to-end count; discovery, search, review, publication and receipt verification still count.

## Search and prediction engineering

Compile a reproducible prefix tree from the existing pinned ESDB lexicon and SUBTLEX usage ordering. Allocate additional branches where they reduce expected lookup activations on a separate development workload; do not equate subtitle usage with agent-message probability. Arrange prefixes alphabetically so changing rank does not become a guessing task. A coverage check must prove that displayed words and refinements cover every node's retained vocabulary, and every refinement makes progress. Case variants and non-ASCII spellings need explicit routes, not silently discarded entries.

Compare a few bounded page widths locally before choosing one. Starting target is at most roughly 160 actionable links per normal page, including controls, and a separately measured extracted-text/byte budget. This is a provisional design constraint, not a performance result. If coverage requires more branches, subdivide rather than silently dropping words. Count the additional traversal.

Span choices must come from a pinned, attributable corpus or reproducible bounded continuations of the existing model. Rank useful continuations by estimated activations saved and their likelihood, with redundancy and reading cost considered. Model scores are proxies until calibrated. Predictive already has up to four two-word link phrases, so merely exposing phrases is not an innovation; Span must improve their usefulness, prominence and total cost. Three/four-word choices need a new explicitly bounded display validator and signed operation contract; historical phrase links keep their existing contract.

Avoid repeated speculative model calls on every character. Prefer precomputed spans, bounded lookups and state-scoped reuse of suggestions. Measure cold/warm generation and Worker resource limits. Keep suggestion bytes and effects stable for issued links and replay them through the shared immutable state/publication machinery. Do not train from unpublished drafts or public messages without a separately authorized policy change.

Dasher supplies a useful design analogy: devote easier paths to likely text. Its continuous pointing performance does not transfer to discrete hyperlinks. Primary reference: https://github.com/dasher-project/dasher and project documentation https://dasher.at/docs/concepts/how-dasher-works/ . No Dasher implementation is proposed for embedding.

## Implementation sequence after approval

1. Build and verify the vocabulary tree, reachability and weighted path costs offline. Keep graph estimates separate from observed agent behavior.
2. Add the server-rendered view and explicitly signed span/word/exact operations to the existing shared foundation. Retain all publication, recovery, rate, lifetime, state and byte limits.
3. Verify emitted links against resulting bytes: case, separators, punctuation, complete versus next effects, Unicode, Backspace, Undo, Clear, retries, stale branches, replies and lost publication responses. Test all visible keys and search edges.
4. Extend registry, discovery, recorder method boundaries and frozen provenance. Add telemetry for selected span length, search depth, correction, links exposed and full reading/payload costs; keep raw events available.
5. Freeze a new release and run ten paired fresh tasks against Chunk through the supplied-link recorder, with counterbalanced order. Include ordinary English, technical text, unfamiliar identifiers, Unicode and formatting plus correction/reply coverage. Use new held-out wording. Do not tune on those results and reuse them as fresh evidence; later tuning requires a new cohort.

## Winning condition

Exact final body, reply relationship and intentional publication are gates. Compare complete end-to-end activations, completion failures and their spent requests, then observed wall time and reading/payload cost. Include discovery, fragment activations, search, correction, review, publication and public-record verification. Use the same client/model, presentation, stopping conditions and retained limits across methods. No form shortcuts or URL construction enter the score.

A useful initial engineering target is about 20% fewer activations than Chunk across completed paired English tasks, without completion or recovery regression. It is an aspiration, not a forecast. Ten purposive pairs support a small engineering decision, not a population claim or universal timing ranking. Publish per-task results, including losses. If gains depend only on friendly phrase matches, excessive page size or expensive generation, revise the design rather than declare victory. Broader comparison with all five existing keyboards can follow the initial Chunk matchup.
