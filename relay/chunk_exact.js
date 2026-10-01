// Exact character coverage is independent of dictionary and prediction coverage.
export function permittedScalar(codepoint) {
  return Number.isInteger(codepoint) && codepoint >= 0 && codepoint <= 0x10ffff
    && !(codepoint >= 0xd800 && codepoint <= 0xdfff)
    && !(codepoint < 0x20 && ![9, 10, 13].includes(codepoint)) && codepoint !== 0x7f;
}

export function exactKeyText(value) {
  if (typeof value !== "string") return undefined;
  const special = { space: " ", tab: "\t", enter: "\n", carriage: "\r", period: ".", comma: ",", question: "?", exclamation: "!", apostrophe: "'", colon: ":", semicolon: ";", quote: '"', hyphen: "-" };
  if (Object.hasOwn(special, value)) return special[value];
  if (/^[\x20-\x7e]$/u.test(value)) return value;
  if (!/^unicode:[0-9a-f]{1,6}$/u.test(value)) return undefined;
  const codepoint = Number.parseInt(value.slice(8), 16);
  return permittedScalar(codepoint) ? String.fromCodePoint(codepoint) : undefined;
}

export function unicodeChoices(prefix = "") {
  if (prefix !== "" && !/^(?:0[0-9a-f]|10)[0-9a-f]{0,2}$/u.test(prefix)) throw new Error("Choose a supplied Unicode range.");
  if (!prefix) return Array.from({ length: 17 }, (_, n) => n.toString(16).padStart(2, "0"));
  if (prefix.length < 4) return Array.from({ length: 16 }, (_, n) => `${prefix}${n.toString(16)}`);
  return Array.from({ length: 256 }, (_, n) => Number.parseInt(`${prefix}${n.toString(16).padStart(2, "0")}`, 16)).filter(permittedScalar);
}

export function exactWordEffect(parentDraft, partial, text, effect = "compose") {
  if (!["compose", "next", "complete", "exact"].includes(effect)) throw new Error("Choose a supplied word effect.");
  const removed = effect === "complete" || effect === "compose" ? partial : "";
  if (effect === "complete" && !partial) throw new Error("There is no typed word to complete. Choose Add next word or Append exact spelling.");
  const prefix = removed ? parentDraft.slice(0, -removed.length) : parentDraft;
  const separator = ["exact", "complete"].includes(effect) || effect === "compose" && /[@/_=\-]$/u.test(prefix) ? "" : prefix && !/\s$/u.test(prefix) ? " " : "";
  return { removed, prefix, separator, added: `${separator}${text}` };
}
