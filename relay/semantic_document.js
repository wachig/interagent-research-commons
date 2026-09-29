const encoder = new TextEncoder();
const MAX_BODY_BYTES = 1_200;
const MAX_CHUNKS = 256;
const MAX_WORD_BYTES = 320;
const MAX_WORD_SCALARS = 80;

const WORD = /^[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['’\-][\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*$/u;
const CASES = new Set(["as-is", "initial-capital", "upper"]);
const WRAPPERS = new Set(["none", "quote", "parenthetical"]);
const SUFFIXES = new Set(["none", ".", ",", "?", "!", ":", ";"]);
const PUNCTUATION = new Set([".", ",", "?", "!", ":", ";"]);
const FORBIDDEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;

function assertScalarString(value, label) {
  if (typeof value !== "string") throw new TypeError(`${label} must be text.`);
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xD800 && unit <= 0xDBFF) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xDC00 && next <= 0xDFFF)) throw new TypeError(`${label} contains an invalid Unicode surrogate.`);
      index += 1;
    } else if (unit >= 0xDC00 && unit <= 0xDFFF) {
      throw new TypeError(`${label} contains an invalid Unicode surrogate.`);
    }
  }
}

function byteLength(value) {
  return encoder.encode(value).byteLength;
}

function validateWord(value) {
  assertScalarString(value, "Semantic word");
  if (!value || byteLength(value) > MAX_WORD_BYTES || [...value].length > MAX_WORD_SCALARS || !WORD.test(value) || FORBIDDEN.test(value)) {
    throw new TypeError("Use a word with letters or numbers; put URLs, symbols, and exact text in the literal lane.");
  }
  return value;
}

function validateChunk(chunk) {
  if (!chunk || typeof chunk !== "object" || Array.isArray(chunk)) throw new TypeError("Document chunk is invalid.");
  if (chunk.kind === "semantic") {
    if (Object.keys(chunk).some((key) => !["kind", "words", "case", "wrapper", "suffix"].includes(key))) throw new TypeError("Document chunk has an unknown field.");
    if (!Array.isArray(chunk.words) || chunk.words.length < 1 || chunk.words.length > 16) throw new TypeError("A semantic addition must contain 1 to 16 words.");
    for (const word of chunk.words) validateWord(word);
    if (!CASES.has(chunk.case) || !WRAPPERS.has(chunk.wrapper) || !SUFFIXES.has(chunk.suffix)) throw new TypeError("Formatting choice is invalid.");
    return;
  }
  if (chunk.kind === "literal") {
    if (Object.keys(chunk).some((key) => !["kind", "text", "joinBefore"].includes(key))) throw new TypeError("Document chunk has an unknown field.");
    assertScalarString(chunk.text, "Literal text");
    if (!chunk.text || FORBIDDEN.test(chunk.text) || byteLength(chunk.text) > MAX_BODY_BYTES || !["exact", "space-if-needed"].includes(chunk.joinBefore)) throw new TypeError("Literal text or boundary choice is invalid.");
    return;
  }
  if (chunk.kind === "punctuation") {
    if (Object.keys(chunk).some((key) => !["kind", "value"].includes(key))) throw new TypeError("Document chunk has an unknown field.");
    if (!PUNCTUATION.has(chunk.value)) throw new TypeError("Punctuation mark is not supported.");
    return;
  }
  throw new TypeError("Document chunk type is unsupported.");
}

export function validateDocument(document) {
  if (!document || typeof document !== "object" || Array.isArray(document) || document.version !== 1 || !Array.isArray(document.chunks) || document.chunks.length > MAX_CHUNKS) {
    throw new TypeError("Document format is invalid or too large.");
  }
  if (Object.keys(document).some((key) => !["version", "chunks"].includes(key))) throw new TypeError("Document has an unknown field.");
  for (const chunk of document.chunks) validateChunk(chunk);
  return document;
}

function firstCased(value) {
  for (const scalar of value) {
    if (scalar.toUpperCase() !== scalar.toLowerCase()) return scalar;
  }
  return "";
}

function initialCapital(value) {
  const first = firstCased(value);
  if (!first) return value;
  const index = value.indexOf(first);
  return `${value.slice(0, index)}${first.toUpperCase()}${value.slice(index + first.length)}`;
}

function semanticCore(chunk) {
  let value = chunk.words.join(" ");
  if (chunk.case === "initial-capital") value = initialCapital(value);
  else if (chunk.case === "upper") value = value.toUpperCase();
  if (chunk.wrapper === "quote") value = `“${value}”`;
  if (chunk.wrapper === "parenthetical") value = `(${value})`;
  if (chunk.suffix !== "none") value += chunk.suffix;
  return value;
}

export function renderDocument(document) {
  validateDocument(document);
  let result = "";
  for (const chunk of document.chunks) {
    if (chunk.kind === "semantic") {
      const opening = result.endsWith("(") || result.endsWith("[") || result.endsWith("{") || result.endsWith("“");
      const separator = result && !/\s$/u.test(result) && !opening ? " " : "";
      result += separator + semanticCore(chunk);
    } else if (chunk.kind === "punctuation") {
      if (!result || /\s$/u.test(result)) throw new TypeError("Add punctuation after text without trailing whitespace; undo or continue the literal text first.");
      result += chunk.value;
    } else {
      const separator = chunk.joinBefore === "space-if-needed" && result && !/\s$/u.test(result) && !/[([{“]$/u.test(result) ? " " : "";
      result += separator + chunk.text;
    }
    if (FORBIDDEN.test(result) || byteLength(result) > MAX_BODY_BYTES) throw new RangeError(`The message would exceed Relay's ${MAX_BODY_BYTES}-byte limit.`);
  }
  return result;
}

export function applyAddition(document, renderedText, addition) {
  validateDocument(document);
  assertScalarString(renderedText, "Current draft");
  if (byteLength(renderedText) > MAX_BODY_BYTES || FORBIDDEN.test(renderedText)) throw new TypeError("Current draft is invalid.");
  validateChunk(addition);
  if (document.chunks.length >= MAX_CHUNKS) throw new RangeError(`A draft can contain at most ${MAX_CHUNKS} additions.`);
  const next = { version: 1, chunks: [...document.chunks, structuredClone(addition)] };
  // Existing rendered text is authoritative. Never reinterpret old chunks with
  // a newer runtime's Unicode/casing tables when extending an active session.
  let additionText;
  if (addition.kind === "semantic") {
    const opening = renderedText.endsWith("(") || renderedText.endsWith("[") || renderedText.endsWith("{") || renderedText.endsWith("“");
    const separator = renderedText && !/\s$/u.test(renderedText) && !opening ? " " : "";
    additionText = separator + semanticCore(addition);
  } else if (addition.kind === "punctuation") {
    if (!renderedText || /\s$/u.test(renderedText)) throw new TypeError("Add punctuation after text without trailing whitespace; undo or continue the literal text first.");
    additionText = addition.value;
  } else {
    const separator = addition.joinBefore === "space-if-needed" && renderedText && !/\s$/u.test(renderedText) && !/[([{“]$/u.test(renderedText) ? " " : "";
    additionText = separator + addition.text;
  }
  const full = renderedText + additionText;
  assertScalarString(full, "Updated draft");
  if (FORBIDDEN.test(full) || byteLength(full) > MAX_BODY_BYTES) throw new RangeError(`The message would exceed Relay's ${MAX_BODY_BYTES}-byte limit.`);
  const priorBytes = byteLength(renderedText);
  return { document: next, rendered_text: full, addition_text: additionText, body_bytes: byteLength(full), prior_bytes: priorBytes };
}

export function documentByteLength(document) {
  return byteLength(renderDocument(document));
}

export const SEMANTIC_DOCUMENT_LIMITS = Object.freeze({ maxBodyBytes: MAX_BODY_BYTES, maxChunks: MAX_CHUNKS, maxWordBytes: MAX_WORD_BYTES, maxWordScalars: MAX_WORD_SCALARS });
