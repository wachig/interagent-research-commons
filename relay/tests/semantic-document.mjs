import assert from "node:assert/strict";
import { applyAddition, documentByteLength, renderDocument, validateDocument } from "../semantic_document.js";

const word = (value, formatting = {}) => ({ kind: "semantic", words: [value], case: formatting.case || "as-is", wrapper: formatting.wrapper || "none", suffix: formatting.suffix || "none" });
const phrase = (words, formatting = {}) => ({ kind: "semantic", words, case: formatting.case || "as-is", wrapper: formatting.wrapper || "none", suffix: formatting.suffix || "none" });
const literal = (text, joinBefore = "exact") => ({ kind: "literal", text, joinBefore });
const punct = (value) => ({ kind: "punctuation", value });
function build(...chunks) {
  return renderDocument({ version: 1, chunks });
}

assert.equal(build(word("I"), word("think"), phrase(["this", "is", "better"], { suffix: "." })), "I think this is better.");
assert.equal(build(word("don't"), word("stop", { suffix: "!" })), "don't stop!");
assert.equal(build(word("hello"), punct(","), word("world")), "hello, world");
assert.equal(build(phrase(["draft", "only"], { wrapper: "parenthetical", suffix: "." })), "(draft only). ".trim());
assert.equal(build(literal("https://example.org/a?b=c")), "https://example.org/a?b=c");
assert.equal(build(literal("two  spaces\nand newline")), "two  spaces\nand newline");
assert.equal(build(literal("("), word("word")), "(word");
assert.equal(build(word(" ß ".trim(), { case: "upper" })), "SS");
assert.equal(build(word("e\u0301", { case: "initial-capital" })), "E\u0301");
assert.equal(build(word("i", { case: "upper" })), "I");
assert.equal(build(literal("draft "), literal("text", "space-if-needed")), "draft text");

assert.throws(() => validateDocument({ version: 1, chunks: [word("https://example.org")] }), /Use a word/u);
assert.throws(() => validateDocument({ version: 1, chunks: [word("a_b")] }), /Use a word/u);
assert.throws(() => validateDocument({ version: 1, chunks: [word("\uD800")] }), /surrogate/u);
assert.throws(() => build(punct(".")), /after text/u);
assert.throws(() => build(literal("draft "), punct(".")), /trailing whitespace/u);
assert.throws(() => build(literal("x".repeat(1_200)), word("x")), /1200-byte limit/u);
assert.throws(() => validateDocument({ version: 1, chunks: [word("x"), ...Array.from({ length: 256 }, () => word("x"))] }), /too large/u);

let document = { version: 1, chunks: [] };
let rendered = "";
for (const addition of [word("Hello", { case: "initial-capital" }), word("world", { suffix: "!" })]) {
  const next = applyAddition(document, rendered, addition);
  document = next.document;
  rendered = next.rendered_text;
}
assert.equal(rendered, "Hello world!");
assert.equal(documentByteLength(document), 12);
assert.equal(renderDocument(document), rendered);
const legacyDocument = { version: 1, chunks: [word("i")] };
const extendedLegacy = applyAddition(legacyDocument, "I", word("think"));
assert.equal(extendedLegacy.rendered_text, "I think", "extending an active draft preserves its stored historical bytes");

console.log("Semantic document tests passed.");
