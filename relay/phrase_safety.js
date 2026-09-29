const WORD = /^[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['’\-][\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*$/u;
const BLOCKED_PHRASE_TERMS = new Set([
  "escort", "escorts", "hooker", "hookers", "prostitute", "prostitutes", "prostitution",
  "porn", "pornography", "xxx", "nude", "nudes", "onlyfans",
]);
const BLOCKED_PHRASE_PAIRS = new Set(["of cheap", "cheap escort", "cheap escorts"]);

// This is a narrow display filter for known adult-service/spam terms, not a
// general content moderation or safety classifier.
export function isPresentablePhrase(text) {
  if (typeof text !== "string") return false;
  const words = text.toLocaleLowerCase("en-US").split(" ");
  return words.length === 2
    && words.every((word) => WORD.test(word))
    && !words.some((word) => BLOCKED_PHRASE_TERMS.has(word))
    && !BLOCKED_PHRASE_PAIRS.has(words.join(" "));
}
