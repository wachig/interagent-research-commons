# Reliability repair phase — 2026-10-03

## Demonstrated problem and repair

P08 Chunk's emitted page was clipped by the enclosing tool output budget despite its nested command requesting 12,000 tokens. Approval review rejected following `wh` because it could not establish that the label had been displayed. This remains an approval/output failure, not evidence that Chunk cannot compose the target.

Client 2.4 now splits the same fetched document into bounded local output pages. Every link and its accessible label remains in original section/order; the exact draft repeats on every page. Each response is limited to 5,000 UTF-8 bytes with headroom for error wrappers. Oversized individual content fails explicitly instead of silently clipping. Future testers use one command per tool call, with nested and enclosing output budgets of 8,000 tokens. No fields, script execution, generated URLs, target-specific ranking or coached paths were introduced.

`read` with an optional zero-based `page` inspects locally. It is not a Relay request or a hyperlink activation, but consumes tool time. The REPL only accepts selections already presented in inspected output pages of the current revision. Navigation resets that observation set. The existing backend ambiguity check still rejects identical names leading to different effects unless disambiguated.

## Failure and measurement boundaries

Network failures before a response, interrupted response bodies, server HTTP failures, local selection/protocol failures, output overflow and deadlines have distinct client categories. Approval rejections remain separate orchestration outcomes. A failed fetch can have performed server work already; native telemetry may record that work or have a gap. The client preserves the last successful supplied page and never automatically replays an action or publication. No client telemetry recorder was reintroduced.

The read-only `audit-evidence.mjs` validates exact certificates, distinct messages/cells, software cohorts and accounting availability. It recognizes older flat metric fields without silently discarding their stated scopes. Partial native observations and missing metrics remain visible, rather than becoming zero requests or fully measured failures. Historical evidence cannot be reconstructed by assumption; approval failures are not scored as keyboard inability.

The final two attempts have complete associated native exports: P08 Chunk one request / 93,537 uncompressed bytes; P08 Prefix 29 requests / 1,459,119 bytes. Neither published. Home discovery, local reads and unlogged client network attempts are separate.

## Verification and remaining phases

Local tests exercise 700-link output, complete ordered coverage, literal draft whitespace, capability hiding, observed-choice enforcement, invalid pages, revision invalidation, oversized content, the actual Worker Chunk page, network and response-body failures, and no automatic retry. Evidence tests cover exact mismatch, duplicate certificates, separate cohorts and legacy accounting. No production database writes or scored publications were needed to validate these changes.

This phase changes the local test client, not the deployed Worker. Fresh Luna validation is reserved for the validation phase after shared/product repairs. It is not yet proven that this eliminates all approval-review blocks or improves agent timings. The owner explicitly authorized commit, push and deployment; the earlier documentation upload block was resolved and these compiled records were pushed. Raw private exports remain private.

Next: shared accessible action labels, reproduce capitalization, cheaper exact correction and investigate failed fetches; then evidence-based Chunk/Frame optimization; finally new pinned Luna checks and completion to 70. Existing certificates remain valid, but timing comparisons must retain release/client/contract cohorts.
