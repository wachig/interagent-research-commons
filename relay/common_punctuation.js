// Everyday typography, independent of any benchmark phrase. Every action is literal.
export const COMMON_PUNCTUATION = Object.freeze([
  [0x2019, 'Right single quotation mark'], [0x2018, 'Left single quotation mark'],
  [0x201c, 'Left double quotation mark'], [0x201d, 'Right double quotation mark'],
  [0x2013, 'En dash'], [0x2014, 'Em dash'], [0x2026, 'Ellipsis'],
]);
export async function commonPunctuationLinks(href, escapeHtml) {
  return `<section class="common-punctuation"><h2>Literal typography</h2><nav class="choices" aria-label="Common Unicode punctuation">${(await Promise.all(COMMON_PUNCTUATION.map(async ([cp,name])=>`<a rel="nofollow" aria-label="Append U+${cp.toString(16).toUpperCase()} ${name}" href="${escapeHtml(await href(cp))}">${String.fromCodePoint(cp)}</a>`))).join(' ')}</nav></section>`;
}
