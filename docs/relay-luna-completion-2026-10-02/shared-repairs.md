# Shared interaction repairs — Phase 2, 2026-10-03

## Product changes

All seven keyboard HTML renderers expose accessible action names. Character additions and dictionary filters have distinct names, including `Find word prefix …`. Existing explicit names remain authoritative; destinations and effects remain unchanged. The supplied-link client reports actual displayed disambiguation choices rather than an unhelpful ambiguity alone.

Chunk, Predictive, Prefix, Short Word and Span share conservative automatic casing. A Titlecased candidate that is an ordinary lowercase word in the pinned SUBTLEX usage inventory becomes lowercase within a sentence. Sentence-initial casing and explicit exact/as-is modes remain authoritative. Acronyms, mixed-case tokens, canonical names and unknown names remain unchanged. This is a heuristic, not a universal proper-name detector. The reproducible inventory contains 3,767 entries: FREQcount >= 500 and FREQlow/FREQcount > 0.5. `relay/semantic/build-automatic-case.py` verifies the source SHA and byte-identical artifact; no assigned benchmark phrase was used to select words.

Those same five text keyboards now have **Repair words and punctuation**, including from their literal lane. A read-only panel shows up to 20 draft words per page. Signed links change an earlier word's case, or insert/remove its following comma, while preserving every other character. Actions create ordinary immutable unpublished branches: replay returns the same branch, undo restores the earlier body, review and cancellation preserve the repair. UTF-8 and saved-state limits still apply. Frame retains its slot edits and Token its literal byte/token controls; neither is claimed to have this word-repair panel.

## Measurement and evidence integrity

Adding accessible attributes exposed a brittle native Token receipt extractor. It now accepts attributes after the receipt href, preserving public-message association and complete native receipt accounting. Tests verify all seven methods. Database schema, retention and logging frequency are unchanged; private raw telemetry expires after 30 days.

Regression tests previously rewrote two historical evaluation artifacts during ordinary test runs. They now require explicit `--write-evidence`; historical source artifacts were restored. The Phase 2 deployment also restores their published copies. Old benchmark records, certificates and release cohorts remain frozen.

Method registry 2.0.3 declares foundation 1.4.0. The explicit historical 2.0.2 route remains frozen. The bounded service bootstrap remains within its 4,096-byte budget. Future local client pin is semantic-link-browser/2.5; generic tester contract stays 1.3. No client recorder, script execution, field entry, path coaching or automatic action retry was introduced.

## Failure investigation and limits

One hundred local warm model-backed requests passed without an HTTP error. Production health after the first deployment passed, but an operator fetch encountered a transient no-response failure first. The historical Worker 1101/1102 and specific Predictive action failure root causes remain unconfirmed; these checks do not prove them repaired. Client failures now preserve safe network cause codes when available, distinguish response absence from server HTTP errors, and retain the last successful supplied page. Failures must remain in scored evidence, including unlogged network work.

## Validation

`npm run test:relay` exercises the browser boundary, seven-method native accounting and 30-day cleanup, all displayed typography, shared publication/reply boundaries, Short Word/Span/Frame behavior, local optimization contracts, integration, recovery, exact text, lexicon and egress. New supplied-link fixtures exercise all five case/comma panels, preserving full suffixes, undo/replay/review, tampered-signature rejection and no publication. The casing inventory is independently reproducible. Fresh Luna validation is still pending; no new scored publication occurred during this repair phase. The saved total remains 41/70.
