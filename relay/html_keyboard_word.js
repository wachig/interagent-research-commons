import { decodeCommonWordRouteToken, encodeCommonWordRouteToken, signCommonWordRoute } from "./token_composer.js";
import { escapeHtml, predictRanked, response } from "./html_keyboard.js";
import { isPresentablePhrase } from "./phrase_safety.js";
import { PREFIX_VOCABULARY } from "./prefix_keyboard_vocabulary.js";

const PREFIX = "/predictive-keyboard/html/word-links";
const PREFIX_KEYBOARD = "/predictive-keyboard/html/prefix-keyboard";
const CHUNK_KEYBOARD = "/predictive-keyboard/html/chunk-keyboard";
const APPROVED_PREFIXES = new Set(Object.values(PREFIX_VOCABULARY.prefixes).flat());
const PREFIX_KEYBOARD_INITIAL_WORDS = ["i", "you", "we", "the", "this", "that", "it", "a", "here", "can", "what", "how", "could", "please", "thanks", "yes", "no", "hi", "if", "when", "why", "would", "do", "is", "there", "let", "also", "but", "so", "sorry", "my", "your", "have", "should", "which", "okay"];
const MAX_BODY_BYTES = 1_200;
const SESSION_TTL_MS = 30 * 60 * 1_000;
const START_TTL_MS = 15 * 60 * 1_000;
const MAX_SESSIONS = 32;
const MAX_STATES_PER_SESSION = 2_400;
const SNAPSHOT_INTERVAL = 16;
const WORD = /^[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['’\-][\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*$/u;
const PUNCTUATION = new Set(["", ".", ",", "?", "!", ":", ";"]);
const CASE = new Set(["as-is", "auto", "capitalize", "upper"]);
const WRAPPER = new Set(["none", "quote", "parenthetical"]);
const DICTIONARY_CACHE = new Map();
let LEXICON_MANIFEST_PROMISE;
let LEXICON_START_PAIRS_PROMISE;
const COMMONS_WORDS = ["agent", "agents", "commons", "IARC", "interagent", "Relay", "research", "researcher", "researching", "really", "reason", "recursive", "recursion", "reply", "message", "participation", "policy", "accessibility", "token", "tokenizer", "predictive", "prediction", "composer"];
const CANONICAL_CASE = new Map([["iarc", "IARC"], ["arc", "ARC"], ["openai", "OpenAI"], ["cloudflare", "Cloudflare"], ["github", "GitHub"], ["presage", "Presage"], ["hunspell", "Hunspell"], ["wrangler", "Wrangler"]]);
const MIN_PHRASE_TOKEN_SHARE = 0.12;
const MIN_PHRASE_JOINT_SHARE = 0.14;
const NO_STORE = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
};

function page(title, body, status = 200) {
  return response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)} · IARC Relay</title><meta name="robots" content="noindex,nofollow,noarchive"><style>*{box-sizing:border-box}body{margin:0;background:#f5f7f3;color:#172527;font:16px/1.4 system-ui,sans-serif}main{max-width:680px;margin:auto;padding:20px}h1{font-size:1.35rem;margin:.2rem 0 1rem}.notice{font-size:.82rem;color:#526466;margin:.4rem 0 1.2rem}section{margin:1rem 0}h2{font-size:.9rem;margin:.4rem 0}.draft{min-height:3.4rem;border:1px solid #ccd6df;background:#fff;padding:.65rem;white-space:pre-wrap;overflow-wrap:anywhere;margin:0}.choices{display:flex;flex-wrap:wrap;gap:.4rem}.choices a{display:inline-block;min-width:2.2rem;padding:.45rem .65rem;border:1px solid #ccd6df;border-radius:5px;background:#fff;color:#086b62;text-align:center;text-decoration:none}.choices a:focus-visible,.key:focus-visible{outline:3px solid #7c3b25;outline-offset:2px}.key-grid{display:flex;flex-direction:column;gap:.4rem}.keyrow{display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:.35rem}.keyrow.indented{margin-inline:5%}.keyrow.third{grid-template-columns:repeat(11,minmax(0,1fr))}.keyrow.symbols{grid-template-columns:repeat(10,minmax(0,1fr))}.keyrow.bottom{grid-template-columns:repeat(10,minmax(0,1fr))}.key{min-width:0;min-height:46px;display:flex;align-items:center;justify-content:center;padding:.35rem .15rem;border:1px solid #ccd6df;border-radius:6px;background:#f8fafb;color:#25343b;text-decoration:none;font-weight:650;box-shadow:0 2px 0 #d6dfe2}.key.wide{grid-column:span 2}.key.space{grid-column:span 4}.key.spacer{visibility:hidden}.controls{display:flex;gap:1rem;flex-wrap:wrap}.controls a{color:#086b62}.primary{display:inline-block;padding:.65rem .9rem;border:1px solid #086b62;border-radius:5px;color:#086b62;font-weight:700}@media(max-width:380px){main{padding:12px}.keyrow,.keyrow.third{gap:.2rem}.key{font-size:.82rem;min-height:44px}}</style></head><body><main>${body}</main></body></html>`, status);
}

function fail(message, status = 400) {
  return page("Keyboard unavailable", `<h1>Keyboard unavailable</h1><p>${escapeHtml(message)}</p><p><a href="${PREFIX}/">Start a new draft</a></p>`, status);
}

function validReplyTarget(value) {
  return typeof value === "string" && /^IARC-M-[0-9a-f-]{36}$/iu.test(value);
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function word(value) {
  return encodeCommonWordRouteToken(value);
}

function readWord(value) {
  const decoded = decodeCommonWordRouteToken(value);
  if (!decoded || decoded.length !== 22) throw new Error("This word-link is malformed.");
  return decoded;
}

function actionHref(state, action, argument = "-", layout = "letters", prefix = "", offset = 0, view = "words") {
  const query = new URLSearchParams();
  if (layout === "symbols") query.set("layout", "symbols");
  if (prefix) query.set("prefix", prefix);
  if (offset) query.set("offset", String(offset));
  if (view !== "words") query.set("view", view);
  return signCommonWordRoute(state.env, "keyboard-action", state.state_id, action, argument).then((cap) =>
    `${PREFIX}/step/${word(state.state_id)}/${action}/${encodeURIComponent(argument).replaceAll("'", "%27")}/${word(cap)}${query.size ? `?${query}` : ""}`);
}

function stateHref(stateId, layout = "letters", shifted = false, prefix = "", offset = 0, view = "words") {
  const query = new URLSearchParams();
  if (layout !== "letters") query.set("layout", layout);
  if (shifted) query.set("shift", "1");
  if (prefix) query.set("prefix", prefix);
  if (offset) query.set("offset", String(offset));
  if (view !== "words") query.set("view", view);
  return `${PREFIX}/state/${word(stateId)}${query.size ? `?${query}` : ""}`;
}

function keyArgument(value) {
  if (value === "backspace") return "\u0008";
  if (value.startsWith("gram:")) {
    const sequence = value.slice(5);
    return /^[a-z']{1,3}$/u.test(sequence) ? sequence : undefined;
  }
  if (new Set(["space", "period", "comma", "question", "exclamation", "apostrophe", "colon", "hyphen", "semicolon", "quote", "enter"]).has(value)) {
    return new Map([["space", " "], ["period", "."], ["comma", ","], ["question", "?"], ["exclamation", "!"], ["apostrophe", "'"], ["colon", ":"], ["hyphen", "-"], ["semicolon", ";"], ["quote", '"'], ["enter", "\n"]]).get(value);
  }
  return /^[A-Za-z0-9@#$%&*+()_!'"/.,?-]$/u.test(value) ? value : undefined;
}

function appendDelta(draft, removed, added) {
  if (removed && !draft.endsWith(removed)) throw new Error("This branch no longer matches its parent state.");
  const prefix = removed ? draft.slice(0, -removed.length) : draft;
  return `${prefix}${added}`;
}

async function loadDraft(env, row) {
  let current = row;
  const actions = [];
  while (current.snapshot === null && current.parent_state_id && actions.length < SNAPSHOT_INTERVAL) {
    actions.push(current);
    current = await env.RELAY_DB.prepare("SELECT s.*, k.expires_at AS session_expires_at FROM html_keyboard_states s JOIN html_keyboard_sessions k USING (session_id) WHERE s.state_id = ?").bind(current.parent_state_id).first();
    if (!current) throw new Error("An earlier draft step is unavailable. Start a new draft.");
  }
  if (current.snapshot === null) throw new Error("Draft history has reached its reconstruction limit. Start a new draft.");
  let draft = current.snapshot;
  for (const action of actions.reverse()) draft = appendDelta(draft, action.removed_text, action.added_text);
  return draft;
}

function queryParams(url, allowed) {
  const result = new Map();
  for (const [key, value] of url.searchParams) {
    if (!allowed.has(key) || result.has(key)) throw new Error(`Invalid or repeated parameter: ${key}`);
    result.set(key, value);
  }
  return result;
}

async function dictionaryWords(env, request, prefix) {
  if (DICTIONARY_CACHE.has(prefix)) return DICTIONARY_CACHE.get(prefix);
  if (!env.ASSETS) throw new Error("The word browser is unavailable; use predictions, keys, or exact text.");
  const manifest = await lexiconManifest(env, request);
  const shards = manifest.shards.filter((shard) => shard.prefix.toLocaleLowerCase("en-US").startsWith(prefix) || prefix.startsWith(shard.prefix.toLocaleLowerCase("en-US")));
  const words = [];
  for (const shard of shards) {
    const result = await env.ASSETS.fetch(new Request(new URL(`/semantic-lexicon/${shard.path}`, request.url)));
    if (!result.ok) throw new Error("A word browser page is unavailable; use another input method.");
    const raw = await result.text();
    const canonical = raw.endsWith("\n") ? raw.slice(0, -1) : raw;
    const bytes = new TextEncoder().encode(canonical);
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((item) => item.toString(16).padStart(2, "0")).join("");
    if (bytes.byteLength !== shard.bytes || hash !== shard.sha256) throw new Error("A word browser page failed its integrity check.");
    const values = JSON.parse(canonical);
    if (!Array.isArray(values) || values.length !== shard.count) throw new Error("A word browser page failed its integrity check.");
    words.push(...values.filter((value) => value.toLocaleLowerCase("en-US").startsWith(prefix)));
  }
  const result = [...new Map(words.map((value) => [value.toLocaleLowerCase("en-US"), value])).values()]
    // The pinned spelling lexicon has no frequency data. Do not let all-caps names
    // outrank ordinary lowercase spellings merely because of codepoint order.
    .sort((left, right) => {
      const category = (value) => /^[\p{Lu}\p{M}\p{N}]+$/u.test(value) ? 2 : /^[\p{Lu}]/u.test(value) ? 1 : 0;
      return category(left) - category(right) || left.localeCompare(right, "en-US");
    });
  DICTIONARY_CACHE.set(prefix, result);
  while (DICTIONARY_CACHE.size > 8) DICTIONARY_CACHE.delete(DICTIONARY_CACHE.keys().next().value);
  return result;
}

async function lexiconManifest(env, request) {
  if (!env.ASSETS) throw new Error("The word browser is unavailable; use predictions, keys, or exact text.");
  if (!LEXICON_MANIFEST_PROMISE) {
    LEXICON_MANIFEST_PROMISE = (async () => {
      const result = await env.ASSETS.fetch(new Request(new URL("/semantic-lexicon/manifest.json", request.url)));
      if (!result.ok) throw new Error("The word browser index is unavailable; use predictions, keys, or exact text.");
      const manifest = await result.json();
      if (manifest.lexicon_version !== "fluenttyper-9d4826d5-en_US-hunspell-base-1" || !Array.isArray(manifest.shards)) throw new Error("The word browser index has an unsupported version.");
      return manifest;
    })().catch((error) => {
      LEXICON_MANIFEST_PROMISE = undefined;
      throw error;
    });
  }
  return LEXICON_MANIFEST_PROMISE;
}

async function lexiconStartPairs(env, request) {
  if (!LEXICON_START_PAIRS_PROMISE) {
    LEXICON_START_PAIRS_PROMISE = (async () => {
      const manifest = await lexiconManifest(env, request);
      const result = await env.ASSETS.fetch(new Request(new URL("/semantic-lexicon/start-pairs.json", request.url)));
      if (!result.ok) throw new Error("The two-letter word-search index is unavailable.");
      const index = await result.json();
      if (index.lexicon_version !== manifest.lexicon_version || !Array.isArray(index.pairs) || index.pairs.some((item) => !item || !/^\p{L}{2}$/u.test(item.value) || !Number.isSafeInteger(item.count) || item.count < 1) || !Array.isArray(index.short_characters) || index.short_characters.some((value) => !/^[\p{L}\p{N}]$/u.test(value)) || !Array.isArray(index.two_letter_words) || index.two_letter_words.some((value) => !/^\p{L}{2}$/u.test(value))) throw new Error("The two-letter word-search index is invalid.");
      return index;
    })().catch((error) => {
      LEXICON_START_PAIRS_PROMISE = undefined;
      throw error;
    });
  }
  return LEXICON_START_PAIRS_PROMISE;
}

function chunkHref(stateId, { start = "", inside = [], end = "", startPage = 0, wordPage = 0, insidePage = 0, endPage = 0 } = {}) {
  const query = new URLSearchParams({ view: "chunks" });
  if (start) query.set("start", start);
  if (inside.length) query.set("inside", inside.join("."));
  if (end) query.set("end", end);
  if (startPage) query.set("start_page", String(startPage));
  if (wordPage) query.set("word_page", String(wordPage));
  if (insidePage) query.set("inside_page", String(insidePage));
  if (endPage) query.set("end_page", String(endPage));
  return `?${query}`;
}

function chunkMatrix(counts, groupId, label, linkFor, jumpTarget = "?view=chunks") {
  const groups = new Map();
  for (const item of [...counts].sort(([left], [right]) => left.localeCompare(right, "en-US"))) {
    const initial = item[0][0];
    if (!groups.has(initial)) groups.set(initial, []);
    groups.get(initial).push(item);
  }
  if (!groups.size) return `<p>No compatible ${escapeHtml(label.toLocaleLowerCase("en-US"))} remain.</p>`;
  const jumps = [...groups.keys()].map((initial) => `<a href="${escapeHtml(`${jumpTarget}#${groupId}-${initial}`)}">${initial.toUpperCase()}</a>`).join("");
  const sections = [...groups].map(([initial, values]) => `<section id="${groupId}-${initial}"><h4>${initial.toUpperCase()}</h4><div class="chunks">${values.map(([value, count]) => linkFor(value, count)).join("")}</div></section>`).join("");
  return `<nav class="letter-jumps" aria-label="${escapeHtml(label)} letters">${jumps}</nav><div class="pair-groups">${sections}</div>`;
}

function chunkCountMap(words, selector) {
  const counts = new Map();
  for (const value of words) {
    for (const chunk of new Set(selector(value))) counts.set(chunk, (counts.get(chunk) || 0) + 1);
  }
  return counts;
}

async function renderChunkKeyboard(request, env, state, draft, url, params) {
  const start = (params.get("start") || "").normalize("NFC").toLocaleLowerCase("en-US");
  const inside = (params.get("inside") || "").split(".").filter(Boolean).map((value) => value.normalize("NFC").toLocaleLowerCase("en-US"));
  const end = (params.get("end") || "").normalize("NFC").toLocaleLowerCase("en-US");
  const pageValue = (name) => {
    const raw = params.get(name) || "0";
    const value = Number(raw);
    if (!/^\d+$/u.test(raw) || !Number.isSafeInteger(value) || value < 0 || value > 10_000) throw new Error("A chunk-choice page is invalid.");
    return value;
  };
  const current = { start, inside, end, wordPage: pageValue("word_page") };
  const chunkValid = (value) => /^\p{L}{2}$/u.test(value);
  if ((start && !chunkValid(start)) || (end && !chunkValid(end)) || inside.length > 8 || inside.some((value) => !chunkValid(value)) || new Set(inside).size !== inside.length) throw new Error("Choose distinct two-letter chunks from the displayed options.");
  const startIndex = await lexiconStartPairs(env, request);
  const startPairs = startIndex.pairs;
  const baseHref = `${PREFIX}/state/${word(state.state_id)}`;
  const shortPickCapability = await signCommonWordRoute(env, "keyboard-short-pick", state.state_id);
  const shortPickHref = (value) => `?view=chunks&pick_short=${encodeURIComponent(value)}&short_cap=${shortPickCapability}`;
  const draftBytes = new TextEncoder().encode(draft).byteLength;
  const reply = state.reply_to ? `<p class="hint">Reply to ${escapeHtml(state.reply_to)}</p>` : "";
  const context = predictionContext(draft, state);
  const shortLinks = startIndex.short_characters.map((value) => `<a rel="nofollow" href="${escapeHtml(shortPickHref(value))}">${escapeHtml(autoCase(value, context))}</a>`);
  const twoLetterLinks = startIndex.two_letter_words.map((value) => {
    const label = autoCase(value, context);
    return `<a rel="nofollow" href="${escapeHtml(shortPickHref(value))}">${escapeHtml(label)}</a>`;
  });
  const initials = [...new Set(startPairs.map(({ value }) => value[0]))].sort();
  const startGroups = initials.map((initial) => `<section id="start-${initial}"><h3>${initial.toUpperCase()}</h3><div class="chunks">${startPairs.filter(({ value }) => value[0] === initial).map(({ value, count }) => `<a href="${escapeHtml(chunkHref(state.state_id, { start: value }))}">${value}<small>${count}</small></a>`).join("")}</div></section>`).join("");
  const startJumps = initials.map((initial) => `<a href="?view=chunks#start-${initial}" aria-label="Jump to starting pairs beginning ${initial}">${initial.toUpperCase()}</a>`).join("");
  let search = `<div class="workspace"><section class="constraint"><h2>START</h2><p>Choose a known beginning. All ${startPairs.length} valid pairs are available directly.</p><nav class="letter-jumps" aria-label="Starting-letter groups">${startJumps}</nav><div class="pair-groups">${startGroups}</div><details><summary>Direct one- and two-letter words</summary><h3>One letter</h3><div class="chunks" aria-label="Direct one-letter word choices">${shortLinks.join("")}</div><h3>Two letters</h3><div class="chunks" aria-label="Direct two-letter word choices">${twoLetterLinks.join("")}</div><p class="hint">All matching entries remain included, including names and abbreviations.</p></details></section></div>`;
  let resultSummary = "Choose a starting pair to search the pinned spelling lexicon.";
  if (start) {
    const lexicon = await dictionaryWords(env, request, start);
    const base = lexicon.filter((value) => [...value.toLocaleLowerCase("en-US")].slice(0, 2).join("") === start);
    const wordsFor = (value) => [...value.toLocaleLowerCase("en-US")];
    const bodyPairs = (value) => {
      const chars = wordsFor(value);
      const pairs = [];
      for (let index = 2; index + 3 < chars.length; index += 1) {
        const pair = `${chars[index]}${chars[index + 1]}`;
        if (chunkValid(pair)) pairs.push(pair);
      }
      return pairs;
    };
    const matches = (value) => {
      const chars = wordsFor(value);
      const lower = value.toLocaleLowerCase("en-US");
      return (!end || lower.endsWith(end)) && inside.every((chunk) => bodyPairs(value).includes(chunk)) && chars.length >= 2;
    };
    const candidates = base.filter(matches);
    const byWord = new Map(candidates.map((value) => [value.toLocaleLowerCase("en-US"), value]));
    const category = (value) => /^[\p{Lu}\p{M}\p{N}]+$/u.test(value) ? 2 : /^[\p{Lu}]/u.test(value) ? 1 : 0;
    const ordered = [...byWord.values()].sort((left, right) => category(left) - category(right) || left.localeCompare(right, "en-US"));
    const insideCounts = chunkCountMap(candidates, bodyPairs);
    const endingPairs = (value) => {
      const pair = wordsFor(value).slice(-2).join("");
      return chunkValid(pair) ? [pair] : [];
    };
    const endCounts = chunkCountMap(candidates, endingPairs);
    const endPool = base.filter((value) => inside.every((chunk) => bodyPairs(value).includes(chunk)));
    const insideOptions = new Map([...insideCounts].filter(([value]) => !inside.includes(value)));
    const endOptions = new Map([...endCounts].filter(([value]) => value !== end));
    const replacementEnds = new Map([...chunkCountMap(endPool, endingPairs)].filter(([value]) => value !== end));
    const remainingLabel = (count) => `${count} ${count === 1 ? "candidate" : "candidates"} remain`;
    const currentFilters = chunkHref(state.state_id, { start, inside, end });
    const renderInsideMatrix = (counts) => chunkMatrix(counts, "inside", "INSIDE", (value, count) => `<a href="${escapeHtml(chunkHref(state.state_id, { start, inside: [...inside, value], end }))}">${value}<small>${count}</small></a>`, currentFilters);
    const endMatrix = chunkMatrix(endOptions, "end", "END", (value, count) => `<a href="${escapeHtml(chunkHref(state.state_id, { start, inside, end: value }))}">${value}<small>${count}</small></a>`, currentFilters);
    const replacementMatrix = chunkMatrix(replacementEnds, "replace-end", "replacement END", (value, count) => `<a href="${escapeHtml(chunkHref(state.state_id, { start, inside, end: value }))}">${value}<small>${count}</small></a>`, currentFilters);
    const matchingCount = ordered.length;
    resultSummary = `${matchingCount.toLocaleString("en-US")} matching ${matchingCount === 1 ? "word" : "words"} from ${base.length.toLocaleString("en-US")} entries beginning ${start}. Stable order: lowercase forms, title-case forms, then all-capital forms; none are omitted.`;
    const wordPage = current.wordPage;
    const pageWords = ordered.slice(wordPage * 20, wordPage * 20 + 20);
    const candidateLinks = await Promise.all(pageWords.map(async (value) => {
      const choice = JSON.stringify({ text: value, case: "auto", wrapper: "none", suffix: "" });
      const href = await actionHref({ ...state, env }, "pick", choice, "letters", "", 0, "chunks");
      const label = autoCase(value, context);
      return `<a rel="nofollow" href="${escapeHtml(href)}" aria-label="Add ${escapeHtml(label)}">${escapeHtml(label)}</a>`;
    }));
    const candidatePages = `${wordPage ? `<a href="${escapeHtml(chunkHref(state.state_id, { ...current, wordPage: wordPage - 1 }))}">Previous words</a>` : ""} ${(wordPage + 1) * 20 < ordered.length ? `<a href="${escapeHtml(chunkHref(state.state_id, { ...current, wordPage: wordPage + 1 }))}">More words</a>` : ""}`;
    const endArea = end ? `<p>Selected END <strong>${escapeHtml(end)}</strong> <a href="${escapeHtml(chunkHref(state.state_id, { start, inside }))}">Remove END ${escapeHtml(end)}</a></p><details><summary>Change END (replaces ${escapeHtml(end)})</summary><p>Replacement choices are computed before the current ending and may broaden the results.</p>${replacementMatrix}</details>` : endMatrix;
    const insideArea = inside.length < 8 ? renderInsideMatrix(insideOptions) : "<p>Limit of eight INSIDE chunks reached. Remove one to add another.</p>";
    const workspace = `<div class="workspace"><section class="constraint"><h2>START</h2><p><strong>${escapeHtml(start)}</strong> · ${base.length} entries</p><a href="${escapeHtml(chunkHref(state.state_id))}">Change START and reset dependent chunks</a></section><section class="constraint"><h2>INSIDE</h2><p>Pairs must fit fully between the first and last two letters. Add another pair to narrow the current candidates.</p><div class="active">${inside.map((value) => `<span><strong>${escapeHtml(value)}</strong> <a href="${escapeHtml(chunkHref(state.state_id, { start, inside: inside.filter((item) => item !== value), end }))}">Remove INSIDE ${escapeHtml(value)}</a></span>`).join("")}</div>${insideArea}</section><section class="constraint"><h2>END</h2><p>Each additive choice narrows the current candidates.</p>${endArea}</section></div>`;
    search = `<p class="summary" aria-label="Current constraints">START <strong>${escapeHtml(start)}</strong> | INSIDE <strong>${inside.map(escapeHtml).join(", ") || "—"}</strong> | END <strong>${escapeHtml(end) || "—"}</strong></p><section class="candidate-panel"><h2>Candidates <span>(${matchingCount.toLocaleString("en-US")})</span></h2><p>${escapeHtml(resultSummary)}</p><nav class="paging" aria-label="Candidate words">${candidatePages}</nav><div class="chunks candidates" aria-label="Matching candidate words">${candidateLinks.join("") || "<p>No matching words. Remove a constraint to broaden the search.</p>"}</div><nav class="paging" aria-label="Candidate words">${candidatePages}</nav></section>${workspace}`;
  }
  const controls = [];
  if (state.parent_state_id) controls.push(`<a href="${escapeHtml(stateHref(state.parent_state_id, "letters", false, "", 0, "chunks"))}">Undo last addition</a>`);
  if (draft) controls.push(`<a rel="nofollow" href="${escapeHtml(await actionHref({ ...state, env }, "clear", "-", "letters", "", 0, "chunks"))}">Clear draft</a>`);
  if (draft) controls.push(`<a rel="nofollow" href="${PREFIX}/review/${word(state.state_id)}?view=chunks">Review message</a>`);
  const editKeys = await Promise.all([["space", "Space"], ["period", "."], ["comma", ","], ["question", "?"], ["exclamation", "!"]].map(async ([key, label]) => `<a href="${escapeHtml(await actionHref({ ...state, env }, "key", key, "letters", "", 0, "chunks"))}">${escapeHtml(label)}</a>`));
  const responseBody = `<h1>Chunk word keyboard</h1><details class="help"><summary>About this keyboard</summary><p>The pinned Hunspell spelling lexicon is searched deterministically. No prediction call or model ranking is used in this entry. Names and abbreviations remain available and are ordered after lowercase spellings. Some valid words may be absent from the lexicon.</p><p>Following a word, key, or editing link saves a temporary private draft step. Requests may be visible to Relay, Cloudflare, and your surrounding system. Never enter secrets. <a href="/privacy">Privacy</a> · <a href="/participation-policy">Policy</a></p></details><section id="draft"><h2>Draft</h2><pre class="draft">${escapeHtml(draft) || " "}</pre><p class="hint">${draftBytes} UTF-8 bytes · 1200 max.</p>${reply}</section><section><h2>Find a word</h2>${!start ? `<p class="summary" aria-label="Current constraints">START <strong>—</strong> | INSIDE <strong>—</strong> | END <strong>—</strong></p>` : ""}${search}</section><section><h2>Space and punctuation</h2><div class="chunks" aria-label="Space and punctuation links">${editKeys.join("")}</div></section>${controls.length ? `<nav class="controls" aria-label="Draft controls">${controls.join("")}</nav>` : ""}<p><a href="${PREFIX}/">Open the standard contextual keyboard</a></p>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><base href="${baseHref}"><title>Chunk word keyboard · IARC Relay</title><meta name="robots" content="noindex,nofollow,noarchive"><style>*{box-sizing:border-box}body{margin:0;background:#f5f7f3;color:#172527;font:16px/1.45 system-ui,sans-serif}main{max-width:1100px;margin:auto;padding:20px}h1{font-size:1.45rem;margin:.2rem 0 1rem}h2{font-size:1rem;margin:.4rem 0}.notice,.hint{font-size:.84rem;color:#526466}.draft{min-height:3.2rem;background:white;border:1px solid #ccd6df;padding:.7rem;white-space:pre-wrap;overflow-wrap:anywhere}.chunks{display:flex;flex-wrap:wrap;gap:.35rem}.chunks a{display:inline-flex;align-items:center;gap:.2rem;min-height:38px;padding:.3rem .5rem;border:1px solid #cbd7de;border-radius:5px;background:white;color:#086b62;text-decoration:none}.chunks a:focus-visible,.controls a:focus-visible,.letter-jumps a:focus-visible{outline:3px solid #7c3b25;outline-offset:2px}.chunks small{color:#526466;font-size:.7rem}.active{display:flex;flex-wrap:wrap;gap:.6rem;margin:.7rem 0}.active span{padding:.35rem .5rem;background:#e9f1ee;border-radius:4px}.active a{margin-left:.35rem;color:#086b62}section{margin:1rem 0}h3{font-size:.85rem;margin:.7rem 0 .35rem}h4{font-size:.8rem;margin:.3rem 0}.letter-jumps{display:flex;gap:.3rem;flex-wrap:wrap;margin:.4rem 0}.letter-jumps a{padding:.2rem .35rem;color:#086b62}.pair-groups>section{margin:.5rem 0}.pair-groups .chunks a{min-height:32px;padding:.2rem .4rem}.workspace{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem}.constraint,.candidate-panel{min-width:0;padding:.7rem;border:1px solid #d3dcdd;border-radius:6px;background:#fff}.candidate-panel{margin:1rem 0}.candidate-panel .chunks a{min-height:42px}details{margin:.5rem 0}summary{cursor:pointer;color:#086b62}.summary{position:sticky;top:0;z-index:1;padding:.55rem;background:#e9f1ee;border:1px solid #cbd7de;border-radius:5px}.paging,.controls{display:flex;gap:1rem;margin:.55rem 0;flex-wrap:wrap}.paging a,.controls a{color:#086b62}a{overflow-wrap:anywhere}@media(max-width:720px){main{padding:14px}.workspace{grid-template-columns:1fr}.summary{position:static}}@media(max-width:420px){main{padding:11px}}</style></head><body><main>${responseBody}</main></body></html>`;
  return response(html, 200, { "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" });
}

async function findState(env, stateId) {
  const row = await env.RELAY_DB.prepare("SELECT s.*, k.reply_to, k.expires_at AS session_expires_at FROM html_keyboard_states s JOIN html_keyboard_sessions k USING (session_id) WHERE s.state_id = ?")
    .bind(stateId).first();
  if (!row || row.session_expires_at <= Date.now()) throw new Error("This keyboard session expired or is unavailable. Start a new draft.");
  return row;
}

async function createSession(env, sessionId, replyTo) {
  const existing = await env.RELAY_DB.prepare("SELECT root_state_id, expires_at, reply_to, published_at FROM html_keyboard_sessions WHERE session_id = ?").bind(sessionId).first();
  if (existing?.published_at) throw new Error("This start link has already been used to publish. Start a new draft.");
  if (existing) {
    if (existing.expires_at <= Date.now()) throw new Error("This keyboard session expired. Start a new draft.");
    return findState(env, existing.root_state_id);
  }
  const rootId = await signCommonWordRoute(env, "keyboard-root", sessionId);
  const now = Date.now();
  const expires = now + SESSION_TTL_MS;
  await env.RELAY_DB.batch([
    env.RELAY_DB.prepare("INSERT OR IGNORE INTO html_keyboard_sessions (session_id, root_state_id, reply_to, created_at, expires_at) SELECT ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM html_keyboard_sessions WHERE expires_at > ?) < ?")
      .bind(sessionId, rootId, replyTo, now, expires, now, MAX_SESSIONS),
    env.RELAY_DB.prepare("INSERT OR IGNORE INTO html_keyboard_states (state_id, session_id, parent_state_id, operation, value, removed_text, added_text, snapshot, depth, created_at) SELECT ?, ?, NULL, 'root', '', '', '', '', 0, ? WHERE EXISTS (SELECT 1 FROM html_keyboard_sessions WHERE session_id = ?)")
      .bind(rootId, sessionId, now, sessionId),
  ]);
  const session = await env.RELAY_DB.prepare("SELECT root_state_id, expires_at, reply_to FROM html_keyboard_sessions WHERE session_id = ?").bind(sessionId).first();
  if (!session) throw new Error("Active keyboard session limit reached. Wait a few minutes and try again.");
  return { ...await findState(env, session.root_state_id), reply_to: session.reply_to };
}

async function makeChild(env, request, parent, action, argument, childId, issuedCapability = false) {
  const parentDraft = await loadDraft(env, parent);
  let removed = "";
  let added = "";
  let savedArgument = argument;
  if (action === "key") {
    if (argument === "backspace") {
      removed = [...parentDraft].at(-1) || "";
    } else {
      const selected = keyArgument(argument);
      if (selected === undefined) throw new Error("Unknown keyboard key.");
      if (argument.startsWith("gram:")) {
        let overlap = 0;
        const draftChars = [...parentDraft];
        const sequenceChars = [...selected];
        for (let size = Math.min(draftChars.length, sequenceChars.length - 1); size > 0; size--) {
          if (draftChars.slice(-size).join("").toLocaleLowerCase("en-US") === sequenceChars.slice(0, size).join("")) { overlap = size; break; }
        }
        added = sequenceChars.slice(overlap).join("");
        if (parent.operation === "pick" && added && parentDraft && !/\s$/u.test(parentDraft)) added = ` ${added}`;
      } else {
        added = selected;
        if (parent.operation === "pick" && /[\p{L}\p{N}]/u.test(added) && parentDraft && !/\s$/u.test(parentDraft)) added = ` ${added}`;
        if (added === " " && /\s$/u.test(parentDraft)) added = "";
      }
    }
  } else if (action === "pick") {
    let choice = { text: argument, case: "as-is", wrapper: "none", suffix: "" };
    if (argument.startsWith("{")) {
      try { choice = JSON.parse(argument); }
      catch { throw new Error("The selected word action is malformed."); }
    }
    if (!choice || typeof choice.text !== "string" || !WORD.test(choice.text) && !choice.text.split(" ").every((part) => WORD.test(part))) throw new Error("Choose a word or phrase from the displayed predictions.");
    if (!CASE.has(choice.case) || !WRAPPER.has(choice.wrapper) || !PUNCTUATION.has(choice.suffix)) throw new Error("Choose a supported case, wrapper, and punctuation option.");
    const isPhrase = choice.text.includes(" ");
    if (isPhrase && !isPresentablePhrase(choice.text)) throw new Error("That phrase is not available as a prediction.");
    if (!issuedCapability) {
      const ranked = await predictRanked(env, request, predictionContext(parentDraft, parent), 48);
      const available = isPhrase
        ? (await predictPhrases(env, request, parentDraft, parent, ranked)).map((candidate) => candidate.text)
        : ranked.map((candidate) => candidate.text);
      const predicted = available.some((candidate) => candidate.toLocaleLowerCase("en-US") === choice.text.toLocaleLowerCase("en-US"));
      const dictionaryMatch = !isPhrase && !predicted && (await dictionaryWords(env, request, choice.text.toLocaleLowerCase("en-US"))).some((candidate) => candidate.toLocaleLowerCase("en-US") === choice.text.toLocaleLowerCase("en-US"));
      if (!predicted && !dictionaryMatch) throw new Error("That candidate is not in the current prediction or word browser. Choose a displayed option.");
    }
    const match = parentDraft.match(/[\p{L}\p{N}'’\-]*$/u);
    const mayReplace = parent.operation === "key" && WORD.test(match?.[0] || "") && /[\p{L}\p{N}'’\-]/u.test(keyArgument(parent.value) || "");
    if (mayReplace) removed = match?.[0] || "";
    const prefix = removed ? parentDraft.slice(0, -removed.length) : parentDraft;
    const separator = prefix && !/\s$/u.test(prefix) ? " " : "";
    let text = choice.text;
    if (choice.case === "auto") text = autoCase(text, `${prefix}${separator}`);
    else if (choice.case === "capitalize") text = text.charAt(0).toLocaleUpperCase("en-US") + text.slice(1);
    else if (choice.case === "upper") text = text.toLocaleUpperCase("en-US");
    if (choice.wrapper === "quote") text = `“${text}”`;
    else if (choice.wrapper === "parenthetical") text = `(${text})`;
    added = `${separator}${text}${choice.suffix}`;
    if (argument.startsWith("{")) savedArgument = JSON.stringify(choice);
  } else if (action === "typed") {
    let choice;
    try { choice = JSON.parse(argument); }
    catch { throw new Error("The typed-text action is malformed."); }
    if (!choice || typeof choice.text !== "string" || !["exact", "space-if-needed"].includes(choice.join)) throw new Error("Choose exact text or start a new word.");
    if (new TextEncoder().encode(choice.text).byteLength > MAX_BODY_BYTES) throw new Error(`Message limit reached (${MAX_BODY_BYTES} UTF-8 bytes).`);
    added = choice.join === "space-if-needed" && parentDraft && !/\s$/u.test(parentDraft) ? ` ${choice.text}` : choice.text;
    savedArgument = JSON.stringify(choice);
  } else if (action === "clear") {
    if (argument !== "-") throw new Error("Invalid clear action.");
    removed = parentDraft;
  } else {
    throw new Error("Unknown keyboard action.");
  }
  const nextDraft = appendDelta(parentDraft, removed, added);
  if (new TextEncoder().encode(nextDraft).byteLength > MAX_BODY_BYTES || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(nextDraft)) throw new Error(`Message limit reached (${MAX_BODY_BYTES} UTF-8 bytes).`);
  const depth = parent.depth + 1;
  const snapshot = depth % SNAPSHOT_INTERVAL === 0 ? nextDraft : null;
  const now = Date.now();
  // Existing deployed schemas intentionally constrain operation to root/key/pick/clear.
  // Store manual text as a pick with its {text, join} payload to remain schema-compatible.
  const storedAction = action === "typed" ? "pick" : action;
  await env.RELAY_DB.prepare("INSERT OR IGNORE INTO html_keyboard_states (state_id, session_id, parent_state_id, operation, value, removed_text, added_text, snapshot, depth, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM html_keyboard_sessions WHERE session_id = ? AND expires_at > ?) AND EXISTS (SELECT 1 FROM html_keyboard_states WHERE state_id = ? AND session_id = ?) AND (SELECT COUNT(*) FROM html_keyboard_states WHERE session_id = ?) < ?")
    .bind(childId, parent.session_id, parent.state_id, storedAction, savedArgument, removed, added, snapshot, depth, now, parent.session_id, now, parent.state_id, parent.session_id, parent.session_id, MAX_STATES_PER_SESSION).run();
  const childExists = await env.RELAY_DB.prepare("SELECT state_id FROM html_keyboard_states WHERE state_id = ? AND session_id = ?").bind(childId, parent.session_id).first();
  if (!childExists) {
    const active = await env.RELAY_DB.prepare("SELECT expires_at FROM html_keyboard_sessions WHERE session_id = ?").bind(parent.session_id).first();
    if (!active || active.expires_at <= Date.now()) throw new Error("This keyboard session expired or is unavailable. Start a new draft.");
    const stateCount = await env.RELAY_DB.prepare("SELECT COUNT(*) AS count FROM html_keyboard_states WHERE session_id = ?").bind(parent.session_id).first();
    if (Number(stateCount?.count || 0) >= MAX_STATES_PER_SESSION) throw new Error(`Keyboard session state limit reached (${MAX_STATES_PER_SESSION} saved steps). Start a new draft.`);
    throw new Error("This branch could not be saved. Return to the current draft and try again.");
  }
  const child = await findState(env, childId);
  if (child.session_id !== parent.session_id) throw new Error("This branch belongs to another keyboard session.");
  if (child.parent_state_id !== parent.state_id || child.operation !== storedAction || child.value !== savedArgument) throw new Error("This link does not match the saved draft branch.");
  return child;
}

function predictionContext(draft, state) {
  if (!draft || /\s$/u.test(draft)) return draft;
  const lastKey = state?.operation === "key" ? keyArgument(state.value) : "";
  const isPartialKeyboardWord = typeof lastKey === "string" && /^[\p{L}\p{N}'’\-]{1,3}$/u.test(lastKey);
  return isPartialKeyboardWord ? draft : `${draft} `;
}

function usableWords(candidates) {
  const seen = new Set();
  return candidates.filter(({ text }) => {
    const key = text.toLocaleLowerCase("en-US");
    if (!WORD.test(text) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function predictPhrases(env, request, draft, state, rankedWords) {
  const context = predictionContext(draft, state);
  const relativeSupport = (candidates) => {
    const total = candidates.reduce((sum, candidate) => sum + (candidate.score || 0), 0);
    return candidates.map((candidate) => ({
      ...candidate,
      support: total > 0 && candidate.score !== null ? candidate.score / total : 0,
    }));
  };
  const starters = relativeSupport(usableWords(rankedWords))
    .filter((candidate) => candidate.support >= MIN_PHRASE_TOKEN_SHARE)
    .slice(0, 4);
  if (!starters.length) return [];

  const branches = await Promise.all(starters.map(async (starter) => {
    const following = relativeSupport(usableWords(await predictRanked(env, request, `${context}${starter.text} `, 8)));
    return following
      .filter((candidate) => candidate.support >= MIN_PHRASE_TOKEN_SHARE)
      .filter((candidate) => candidate.text.toLocaleLowerCase("en-US") !== starter.text.toLocaleLowerCase("en-US"))
      .slice(0, 2)
      .map((candidate) => {
        const text = `${starter.text} ${candidate.text}`;
        return { text, score: Math.sqrt(starter.support * candidate.support), rank: starter.rank * 10 + candidate.rank };
      })
      .filter((candidate) => isPresentablePhrase(candidate.text));
  }));

  const phrases = branches.flat().filter((candidate) => candidate.score >= MIN_PHRASE_JOINT_SHARE);
  phrases.sort((left, right) => right.score - left.score || left.rank - right.rank || left.text.localeCompare(right.text, "en-US"));
  const seen = new Set();
  const seenSecondWords = new Set();
  return phrases.filter((phrase) => {
    const key = phrase.text.toLocaleLowerCase("en-US");
    const second = key.split(" ")[1];
    if (seen.has(key) || seenSecondWords.has(second)) return false;
    seen.add(key);
    seenSecondWords.add(second);
    return true;
  }).slice(0, 4);
}

function autoCase(text, precedingText) {
  let sentenceStart = !/[\p{L}\p{N}]/u.test(precedingText) || /[.!?][\s\p{Pe}\p{Pf}"'’”]*$/u.test(precedingText);
  return text.replace(/[\p{L}\p{N}][\p{L}\p{M}\p{N}'’\-]*/gu, (token) => {
    const lower = token.toLocaleLowerCase("en-US");
    let output = lower === "i" ? "I" : CANONICAL_CASE.get(lower) || token;
    if (sentenceStart && !CANONICAL_CASE.has(lower) && lower !== "i") output = output.charAt(0).toLocaleUpperCase("en-US") + output.slice(1);
    sentenceStart = false;
    return output;
  });
}

async function renderKeyboard(request, env, state, url) {
  const draft = await loadDraft(env, state);
  const modeParams = queryParams(url, new Set(["layout", "shift", "prefix", "offset", "view", "start", "inside", "end", "word_page", "inside_page", "end_page"]));
  const layout = modeParams.get("layout") || "letters";
  const view = modeParams.get("view") || "words";
  const shifted = modeParams.get("shift") === "1";
  const prefix = (modeParams.get("prefix") || "").normalize("NFC").toLocaleLowerCase("en-US");
  const offset = Number(modeParams.get("offset") || 0);
  if (modeParams.has("shift") && !new Set(["0", "1"]).has(modeParams.get("shift"))) throw new Error("Keyboard layout link is invalid.");
  if (!new Set(["letters", "symbols"]).has(layout) || (shifted && layout !== "letters") || !new Set(["words", "prefix", "chunks"]).has(view)) throw new Error("Keyboard layout link is invalid.");
  if ([...prefix].length > 20 || /[^\p{L}\p{N}'’\-]/u.test(prefix) || !Number.isSafeInteger(offset) || offset < 0 || offset % 20 !== 0) throw new Error("Word browser prefix or page is invalid.");
  if (view === "prefix" && prefix && !APPROVED_PREFIXES.has(prefix)) throw new Error("Choose a two-letter prefix from the supplied list.");
  if (view === "chunks") return await renderChunkKeyboard(request, env, state, draft, url, modeParams);
  const context = predictionContext(draft, state);
  const predictions = usableWords(await predictRanked(env, request, context, 48));
  const phrases = view !== "prefix" && (!draft || /\s$/u.test(draft) || state.operation === "pick" || state.operation === "typed")
    ? await predictPhrases(env, request, draft, state, predictions)
    : [];
  const directWords = predictions.slice(0, 12);
  const moreWords = predictions.slice(12, 44);
  const formAction = `${PREFIX}/form/${word(state.state_id)}`;
  const choiceFormAction = `${formAction}#choices`;
  const makeLink = (action, argument, resetView = false, nextPrefix = undefined) => actionHref({ ...state, env }, action, argument, layout, nextPrefix === undefined ? (resetView ? "" : prefix) : nextPrefix, resetView ? 0 : offset, view);
  const candidateToken = async (candidate) => {
    const issued = JSON.stringify({ text: candidate, case: "as-is", wrapper: "none", suffix: "" });
    return signCommonWordRoute(env, "keyboard-action", state.state_id, "pick", issued);
  };
  const candidateButton = async (kind, candidate, shown = candidate) => `<button type="submit" name="pick" value="${escapeHtml(`${kind}:${candidate}:${await candidateToken(candidate)}`)}">${escapeHtml(shown)}</button>`;
  const phraseButtons = (await Promise.all(phrases.map((candidate) => candidateButton("phrase", candidate.text, autoCase(candidate.text, context))))).join("");
  const directButtons = (await Promise.all(directWords.map((candidate) => candidateButton("word", candidate.text, shifted ? candidate.text.charAt(0).toLocaleUpperCase("en-US") + candidate.text.slice(1) : autoCase(candidate.text, context))))).join("");
  const moreOptions = (await Promise.all(moreWords.map(async (candidate) => `<option value="${escapeHtml(`${candidate.text}:${await candidateToken(candidate.text)}`)}">${escapeHtml(autoCase(candidate.text, context))}</option>`))).join("");
  const linkCandidates = [...phrases.map((item) => item.text), ...directWords.map((item) => item.text)];
  const linkChoices = await Promise.all(linkCandidates.map(async (candidate) => {
    const choice = JSON.stringify({ text: candidate, case: "auto", wrapper: "none", suffix: "" });
    return `<a rel="nofollow" href="${escapeHtml(await makeLink("pick", choice, true))}">${escapeHtml(autoCase(candidate, context))}</a>`;
  }));
  const key = async (value, label = value, extraClass = "") => {
    if (value === "backspace" && !draft) return `<span class="key ${extraClass} disabled" aria-disabled="true" aria-label="Backspace unavailable for an empty draft">${escapeHtml(label)}</span>`;
    const accessibleLabel = value === "backspace" ? "Backspace" : `Add ${label}`;
    return `<a class="key ${extraClass}" rel="nofollow" href="${escapeHtml(`${await makeLink("key", value, view === "prefix", "")}#keyboard`)}" aria-label="${escapeHtml(accessibleLabel)}">${escapeHtml(label)}</a>`;
  };
  const mode = (label, nextLayout, nextShifted = false, extraClass = "", accessible = label) => `<a class="key ${extraClass}" href="${escapeHtml(stateHref(state.state_id, nextLayout, nextShifted, prefix, offset, view))}" aria-label="${escapeHtml(accessible)}">${escapeHtml(label)}</a>`;
  const letters = `<div class="keyrow">${(await Promise.all("qwertyuiop".split("").map((letter) => key(shifted ? letter.toUpperCase() : letter, shifted ? `Uppercase ${letter}` : letter)))).join("")}</div><div class="keyrow indented">${(await Promise.all("asdfghjkl".split("").map((letter) => key(shifted ? letter.toUpperCase() : letter, shifted ? `Uppercase ${letter}` : letter)))).join("")}</div><div class="keyrow third">${mode("⇧", "letters", !shifted, "wide", shifted ? "Turn shift off" : "Turn shift on")} ${(await Promise.all("zxcvbnm".split("").map((letter) => key(shifted ? letter.toUpperCase() : letter, shifted ? `Uppercase ${letter}` : letter)))).join("")} <span class="key wide spacer" aria-hidden="true"></span></div><div class="keyrow bottom">${mode("?123", "symbols", false, "wide")} ${await key("comma", ",")} ${await key("space", "Space", "space")} ${await key("period", ".")} ${await key("question", "?", "wide")}</div>`;
  const symbols = `<div class="keyrow">${(await Promise.all("1234567890".split("").map((value) => key(value)))).join("")}</div><div class="keyrow symbols">${(await Promise.all(["@", "#", "$", "%", "&", "-", "*", "+", "("].map((value) => key(value)))).join("")}</div><div class="keyrow symbols">${(await Promise.all([" )", "_", "!", "?", "'", ":", ";", '"', "/"].map((value) => key(value.trim())))).join("")} <span class="key spacer" aria-hidden="true"></span></div><div class="keyrow bottom">${mode("ABC", "letters", false, "wide")} ${await key("comma", ",")} ${await key("space", "Space", "space")} ${await key("period", ".")} ${await key("enter", "↵", "wide")}</div>`;
  const prefixInputKeys = `<div class="keyrow bottom">${mode("?123", "symbols", false, "wide")} ${await key("comma", ",")} ${await key("space", "Space", "space")} ${await key("period", ".")} ${await key("backspace", "⌫", "prefix-backspace")}</div>`;
  const prefixSymbols = `<div class="keyrow">${(await Promise.all("1234567890".split("").map((value) => key(value)))).join("")}</div><div class="keyrow symbols">${(await Promise.all(["@", "#", "$", "%", "&", "-", "*", "+", "(", "/"].map((value) => key(value)))).join("")}</div><div class="keyrow symbols">${(await Promise.all([")", "_", "!", "?", "'", ":", ";", '"'].map((value) => key(value)))).join("")}${await key("backspace", "⌫", "prefix-backspace")}</div><div class="keyrow bottom">${mode("ABC", "letters", false, "wide")} ${await key("comma", ",")} ${await key("space", "Space", "space")} ${await key("period", ".")} ${await key("enter", "↵", "wide")}</div>`;
  const reviewHref = draft ? `${PREFIX}/review/${word(state.state_id)}${view !== "words" ? `?view=${encodeURIComponent(view)}` : ""}` : "";
  const reply = state.reply_to ? `<p class="notice">Reply to ${escapeHtml(state.reply_to)}</p>` : "";
  const undoHref = state.parent_state_id ? stateHref(state.parent_state_id, layout, shifted, "", 0, view) : "";
  const clearHref = draft ? await makeLink("clear", "-") : "";
  const controls = `${undoHref ? `<a href="${escapeHtml(undoHref)}">Undo last addition</a>` : ""}${clearHref ? `<a rel="nofollow" href="${escapeHtml(clearHref)}">Clear draft</a>` : ""}${reviewHref ? `<a rel="nofollow" href="${escapeHtml(reviewHref)}">Review message</a>` : ""}`;
  const moreSection = moreWords.length
    ? `<label for="more-words">More words</label><div class="more-row"><select id="more-words" name="more" aria-label="More words">${moreOptions}</select><button type="submit" name="action" value="more">Add selected word</button></div>`
    : `<p>No additional model suggestions are available for this context.</p>`;
  let prefixBrowser;
  let prefixCandidates = "";
  if (view === "prefix") {
      const rows = await Promise.all(Object.entries(PREFIX_VOCABULARY.prefixes).map(async ([letter, choices]) => {
        const letterHref = await makeLink("key", letter, true, "");
        const prefixMenus = await Promise.all(choices.map(async (choice) => {
          const selectId = `prefix-${choice.replaceAll("'", "-prime")}`;
          const extensions = (PREFIX_VOCABULARY.extensions[choice[0]] || []).filter((extension) => extension.startsWith(choice));
          const options = extensions.map((extension) => `<option value="${escapeHtml(extension)}">${escapeHtml(extension)}</option>`).join("");
          return `<form method="get" action="${formAction}" class="prefix-select"><input type="hidden" name="view" value="prefix"><input type="hidden" name="layout" value="${layout}"><input type="hidden" name="prefix" value="${escapeHtml(choice)}"><label class="sr-only" for="${selectId}">${escapeHtml(choice)} prefix and three-letter continuations</label><select id="${selectId}" name="selection" aria-label="${escapeHtml(choice)} prefix and three-letter continuations"><option value="${escapeHtml(choice)}" selected>${escapeHtml(choice)}</option>${options}</select><button type="submit" name="action" value="prefix" aria-label="Add ${escapeHtml(choice)} or selected continuation">Add</button></form>`;
        }));
        return `<div class="prefix-row"><a class="key prefix-letter" rel="nofollow" href="${escapeHtml(letterHref)}" aria-label="Add ${letter}">${letter}</a><div class="prefix-menus" aria-label="${letter.toUpperCase()} prefixes">${prefixMenus.join("")}</div></div>`;
      }));
    const letterRows = `<section id="prefix-choices"><h2>Letters and prefix menus</h2><p class="hint">Each letter has its own button. Every adjacent dropdown belongs to one two-letter prefix and contains only that prefix and its supplied three-letter continuations. Choose the prefix itself or a continuation, then press Add. Characters already at the end of the draft are added once.</p><div class="prefix-grid" aria-label="Letters with individual prefix menus">${rows.join("")}</div></section>`;
    let expanded = "";
    if (prefix) {
      const extensions = Object.values(PREFIX_VOCABULARY.extensions).flat().filter((value) => value.startsWith(prefix));
      const extensionLinks = await Promise.all(extensions.map(async (value) => `<a rel="nofollow" href="${escapeHtml(await makeLink("key", `gram:${value}`, false, prefix))}">${escapeHtml(value)}</a>`));
      const dictionary = await dictionaryWords(env, request, prefix);
      const modelPrefixMatches = usableWords(await predictRanked(env, request, `${context}${prefix}`, 48))
        .filter((item) => item.text.toLocaleLowerCase("en-US").startsWith(prefix));
      const modelMatches = [...new Map([...modelPrefixMatches, ...predictions]
        .map((item) => item.text)
        .filter((item) => item.toLocaleLowerCase("en-US").startsWith(prefix))
        .map((item) => [item.toLocaleLowerCase("en-US"), item])).values()].slice(0, 8);
      const seen = new Set(modelMatches.map((item) => item.toLocaleLowerCase("en-US")));
      const domainMatches = COMMONS_WORDS.filter((item) => item.toLocaleLowerCase("en-US").startsWith(prefix) && !seen.has(item.toLocaleLowerCase("en-US")));
      for (const item of domainMatches) seen.add(item.toLocaleLowerCase("en-US"));
      const matchingWords = [...modelMatches, ...domainMatches, ...dictionary.filter((item) => !seen.has(item.toLocaleLowerCase("en-US")))];
      const pageWords = matchingWords.slice(offset, offset + 20);
      const wordLinks = await Promise.all(pageWords.map(async (item) => {
        const choice = JSON.stringify({ text: item, case: "auto", wrapper: "none", suffix: "" });
        const label = autoCase(item, context);
        return `<a rel="nofollow" aria-label="Add ${escapeHtml(label)}" href="${escapeHtml(await makeLink("pick", choice, true, ""))}">${escapeHtml(label)}</a>`;
      }));
      const previous = offset ? `<a href="${escapeHtml(stateHref(state.state_id, layout, shifted, prefix, Math.max(0, offset - 20), view))}#prefix-choices">Previous words</a>` : "";
      const next = offset + 20 < matchingWords.length ? `<a href="${escapeHtml(stateHref(state.state_id, layout, shifted, prefix, offset + 20, view))}#prefix-choices">Next words</a>` : "";
      expanded = `<section id="prefix-results"><h2>Three-letter choices for ${escapeHtml(prefix)}</h2><div class="choices" aria-label="Approved three-letter continuations">${extensionLinks.join("") || "<span>No three-letter extensions are listed for this prefix.</span>"}</div></section>`;
      prefixCandidates = `<section id="prefix-candidates" class="candidate-panel"><h2>Candidates (${matchingWords.length.toLocaleString("en-US")})</h2><p>${matchingWords.length.toLocaleString("en-US")} matching ${matchingWords.length === 1 ? "word" : "words"} beginning ${escapeHtml(prefix)}. Showing ${matchingWords.length ? offset + 1 : 0}–${Math.min(offset + 20, matchingWords.length)}.</p><p>${previous} ${next}</p><div class="choices" aria-label="Matching candidate words">${wordLinks.join("") || "<span>No matching words.</span>"}</div></section>`;
    }
    prefixBrowser = `${letterRows}${expanded}`;
  } else if (!prefix) {
    const alphabet = await Promise.all("abcdefghijklmnopqrstuvwxyz".split("").map(async (letter) => `<a href="${escapeHtml(stateHref(state.state_id, layout, shifted, letter))}">${letter}</a>`));
    prefixBrowser = `<section><h2>Find another word</h2><p class="hint">Search by a word prefix. Results put model matches first, then reviewed Commons terms, then the spelling dictionary. Dictionary order is not a measure of word frequency.</p><form method="get" action="${PREFIX}/state/${word(state.state_id)}"><input type="hidden" name="layout" value="${layout}"><label for="word-prefix">Prefix</label><input id="word-prefix" name="prefix" maxlength="20" autocomplete="off"><button type="submit">Find words</button></form><div class="choices" aria-label="Browse by first letter">${alphabet.join("")}</div></section>`;
  } else {
    const dictionary = await dictionaryWords(env, request, prefix);
    const modelPrefixMatches = usableWords(await predictRanked(env, request, `${context}${prefix}`, 12));
    const modelMatches = [...new Map([...modelPrefixMatches, ...predictions]
      .map((item) => item.text)
      .filter((item) => item.toLocaleLowerCase("en-US").startsWith(prefix))
      .map((item) => [item.toLocaleLowerCase("en-US"), item])).values()].slice(0, 8);
    const seen = new Set(modelMatches.map((item) => item.toLocaleLowerCase("en-US")));
    const domainMatches = COMMONS_WORDS.filter((item) => item.toLocaleLowerCase("en-US").startsWith(prefix) && !seen.has(item.toLocaleLowerCase("en-US")));
    for (const item of domainMatches) seen.add(item.toLocaleLowerCase("en-US"));
    const ordered = [...modelMatches, ...domainMatches, ...dictionary.filter((item) => !seen.has(item.toLocaleLowerCase("en-US")))];
    const pageWords = ordered.slice(offset, offset + 20);
    const wordLinks = await Promise.all(pageWords.map(async (item) => {
      const choice = JSON.stringify({ text: item, case: "auto", wrapper: "none", suffix: "" });
      const href = await makeLink("pick", choice, true);
      return `<a rel="nofollow" href="${escapeHtml(href)}">Add ${escapeHtml(autoCase(item, context))}</a>`;
    }));
    const chars = [...new Set([...dictionary, ...domainMatches].map((item) => [...item.slice(prefix.length)][0]).filter(Boolean))].slice(0, 26);
    const childLinks = await Promise.all(chars.map(async (letter) => `<a href="${escapeHtml(stateHref(state.state_id, layout, shifted, prefix + letter))}">${escapeHtml(prefix + letter)}</a>`));
    const previous = offset ? `<a href="${escapeHtml(stateHref(state.state_id, layout, shifted, prefix, Math.max(0, offset - 20)))}">Previous</a>` : "";
    const next = offset + 20 < ordered.length ? `<a href="${escapeHtml(stateHref(state.state_id, layout, shifted, prefix, offset + 20))}">Next</a>` : "";
    prefixBrowser = `<section id="prefix-browser"><h2>Find another word · ${escapeHtml(prefix)}</h2><p class="hint">Context predictions first, reviewed Commons terms next, then ordinary spellings before proper names and acronyms. Showing ${ordered.length ? offset + 1 : 0}–${Math.min(offset + 20, ordered.length)} of ${ordered.length} matches.</p><form method="get" action="${PREFIX}/state/${word(state.state_id)}#prefix-browser"><input type="hidden" name="layout" value="${layout}"><label for="word-prefix">Prefix</label><input id="word-prefix" name="prefix" maxlength="20" value="${escapeHtml(prefix)}" autocomplete="off"><button type="submit">Find words</button></form><p>${previous} ${next}</p><div class="choices" aria-label="Matching words">${wordLinks.join("") || "<span>No matching words.</span>"}</div><h3>Continue prefix</h3><div class="choices" aria-label="Child prefixes">${childLinks.join("") || "<span>No longer matches.</span>"}</div><p><a href="${escapeHtml(stateHref(state.state_id, layout, shifted))}">Clear prefix</a></p></section>`;
  }
  const editPanel = `<form method="get" action="${choiceFormAction}" class="compose-form"><input type="hidden" name="view" value="${view}"><input type="hidden" name="layout" value="${layout}">${prefix ? `<input type="hidden" name="prefix" value="${escapeHtml(prefix)}">` : ""}${offset ? `<input type="hidden" name="offset" value="${offset}">` : ""}<section><h2>Likely continuation</h2><p class="hint">Short two-word continuations from the English model. A limited blocklist hides known unsuitable terms; suggestions can still be wrong.</p><div class="choices" aria-label="Likely phrase continuations">${phraseButtons || "<span>No phrase suggestions passed the filter for this draft.</span>"}</div></section><section><h2>Top 12 words</h2><p class="hint">The first 12 model suggestions for this draft. Choosing one adds that word. Suggestions may be wrong and are not safety-filtered.</p><div class="choices" aria-label="Top 12 word predictions">${directButtons || "<span>No word predictions are available.</span>"}</div></section><section><h2>More model choices</h2><p class="hint">Up to 32 more suggestions, ranked after the first 12. Available choices depend on the model output.</p>${moreSection}</section></form><details><summary>Choices for clients that can only follow links</summary><p class="hint">Each link adds one displayed word or phrase. The keyboard links below add characters and punctuation. This page also has forms, which work without JavaScript.</p><div class="choices" aria-label="Link-only predictions">${linkChoices.join("")}</div></details>`;
  const draftTail = draft.endsWith(" ") ? " Draft ends with a space." : draft.endsWith("\n") ? " Draft ends with a line break." : "";
  const prefixTypingKeys = await Promise.all([
    ...[..."1234567890"].map((value) => [value, value]),
    ...[["@", "@"], ["#", "#"], ["$", "$"], ["%", "%"], ["&", "&"], ["-", "-"], ["*", "*"], ["+", "+"], ["(", "("]],
    ...[[")", ")"], ["_", "_"], ["!", "!"], ["?", "?"], ["apostrophe", "'"], ["colon", ":"], ["semicolon", ";"], ["quote", '\"'], ["/", "/"]],
    ...[["comma", ","], ["space", "Space"], ["period", "."], ["backspace", "⌫"], ["enter", "↵"]],
  ].map(async ([value, label]) => {
    const accessible = value === "backspace" ? "Backspace: delete one character" : value === "enter" ? "Enter: add a line break" : label === "Space" ? "Space" : `Add ${label}`;
    if (value === "backspace" && !draft) return `<span class="typing-key backspace-key disabled" aria-disabled="true" aria-label="Backspace unavailable for an empty draft">${escapeHtml(label)}</span>`;
    const href = await makeLink("key", value, true, "");
    const className = label === "Space" ? " space-key" : value === "backspace" ? " backspace-key" : value === "enter" ? " enter-key" : "";
    return `<a class="typing-key${className}" rel="nofollow" href="${escapeHtml(href)}" aria-label="${escapeHtml(accessible)}">${escapeHtml(label)}</a>`;
  }));
  const prefixTypingKeyboard = `<section id="keyboard"><h2>Numbers, symbols, and space</h2><div class="typing-keyboard" aria-label="Numbers and special character keys"><div class="typing-row">${prefixTypingKeys.slice(0, 10).join("")}</div><div class="typing-row">${prefixTypingKeys.slice(10, 19).join("")}</div><div class="typing-row">${prefixTypingKeys.slice(19, 28).join("")}</div><div class="typing-row bottom-row">${prefixTypingKeys.slice(28).join("")}</div></div></section>`;
  const prefixTopWords = draft ? predictions.slice(0, 18) : PREFIX_KEYBOARD_INITIAL_WORDS.map((text) => ({ text }));
  const prefixTopWordLinks = await Promise.all(prefixTopWords.map(async (candidate) => {
    const choice = JSON.stringify({ text: candidate.text, case: "auto", wrapper: "none", suffix: "" });
    const label = autoCase(candidate.text, context);
    return `<a rel="nofollow" href="${escapeHtml(await makeLink("pick", choice, true, ""))}" aria-label="Add top word ${escapeHtml(label)}">${escapeHtml(label)}</a>`;
  }));
  const prefixTopWordsSection = `<section id="top-words"><h2>Top Words</h2><div class="choices" aria-label="Top word choices">${prefixTopWordLinks.join("") || "<span>No word predictions are available.</span>"}</div></section>`;
  const keyboardSection = view === "prefix"
    ? `<section id="keyboard"><h2>${layout === "symbols" ? "Numbers and special characters" : "Space, punctuation, and editing"}</h2><nav class="key-grid" aria-label="${layout === "symbols" ? "Numbers and symbols" : "Space punctuation and editing"} controls">${layout === "symbols" ? prefixSymbols : prefixInputKeys}</nav></section><p class="hint"><a href="${PREFIX}/">Open Predictive Word Keyboard</a></p>`
    : `<section id="keyboard"><h2>Keyboard</h2><nav class="key-grid" aria-label="${layout === "symbols" ? "Symbols" : "Letters"} keyboard">${layout === "symbols" ? symbols : letters}</nav><p class="hint"><a href="${PREFIX}/">Open Predictive Word Keyboard</a></p></section>`;
  const pageTitle = view === "prefix" ? "Prefix link keyboard" : "Predictive Word Keyboard";
  const notice = `<p class="notice">Model suggestions can change when a draft is reopened and are not verified facts. Word suggestions are unfiltered; phrase suggestions omit a limited list of known unsuitable terms. Following a word or key link, or submitting a form, saves a private step. <strong>Some crawlers and prefetchers follow links automatically.</strong> Requests may be visible to Relay, Cloudflare, and your surrounding system. Never enter secrets. <a href="/privacy">Privacy</a> · <a href="/participation-policy">Policy</a></p>`;
  const draftSection = `<section id="draft"><h2>Draft</h2><pre class="draft" aria-live="polite">${escapeHtml(draft) || " "}</pre><p class="hint">${new TextEncoder().encode(draft).byteLength} UTF-8 bytes · 1200 max.${draftTail}</p></section>`;
  const controlSection = controls ? `<nav class="controls" aria-label="Draft controls">${controls}</nav>` : `<p class="hint">Choose a word or character to begin. Undo, clear, and review controls appear once the draft has text.</p>`;
  const body = view === "prefix"
    ? `<div class="prefix-page-top"><div class="prefix-intro"><h1>${pageTitle}</h1>${notice}${reply}</div>${draftSection}</div><div class="prefix-workspace"><div class="prefix-browser-column">${prefixBrowser}</div><aside class="prefix-tools"><div class="prefix-tools-keyboard">${prefixTypingKeyboard}</div>${controls ? `<nav class="controls" aria-label="Draft controls">${controls}</nav>` : ""}${prefixTopWordsSection}${prefixCandidates}</aside></div>`
    : `<h1>${pageTitle}</h1>${notice}${reply}${draftSection}<div id="choices">${editPanel}</div>${prefixBrowser}${keyboardSection}${controlSection}`;
  return response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${pageTitle} · IARC Relay</title><meta name="robots" content="noindex,nofollow,noarchive"><style>*{box-sizing:border-box}body{margin:0;background:#f5f7f3;color:#172527;font:16px/1.4 system-ui,sans-serif}main{max-width:680px;margin:auto;padding:20px}h1{font-size:1.35rem;margin:.2rem 0 1rem}.notice{font-size:.82rem;color:#526466;margin:.4rem 0 1.2rem}section{margin:1rem 0}h2{font-size:.9rem;margin:.4rem 0}.draft{min-height:3.4rem;border:1px solid #ccd6df;background:#fff;padding:.65rem;white-space:pre-wrap;overflow-wrap:anywhere;margin:0}.choices{display:flex;flex-wrap:wrap;gap:.4rem}.choices a{display:inline-block;min-width:2.2rem;padding:.45rem .65rem;border:1px solid #ccd6df;border-radius:5px;background:#fff;color:#086b62;text-align:center;text-decoration:none}.choices a:focus-visible,.key:focus-visible{outline:3px solid #7c3b25;outline-offset:2px}.key-grid{display:flex;flex-direction:column;gap:.4rem}.keyrow{display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:.35rem}.keyrow.indented{margin-inline:5%}.keyrow.third{grid-template-columns:repeat(11,minmax(0,1fr))}.keyrow.symbols{grid-template-columns:repeat(10,minmax(0,1fr))}.keyrow.bottom{grid-template-columns:repeat(10,minmax(0,1fr))}.key{min-width:0;min-height:46px;display:flex;align-items:center;justify-content:center;padding:.35rem .15rem;border:1px solid #ccd6df;border-radius:6px;background:#f8fafb;color:#25343b;text-decoration:none;font-weight:650;box-shadow:0 2px 0 #d6dfe2}.key.wide{grid-column:span 2}.key.space{grid-column:span 4}.key.spacer{visibility:hidden}.controls{display:flex;gap:1rem;flex-wrap:wrap}.controls a{color:#086b62}.primary{display:inline-block;padding:.65rem .9rem;border:1px solid #086b62;border-radius:5px;color:#086b62;font-weight:700}.prefix-grid{display:grid;grid-template-columns:1fr;gap:.4rem}.prefix-row{display:flex;align-items:flex-start;gap:.45rem;min-width:0;padding:.25rem 0;border-bottom:1px solid #dce4e0}.prefix-letter{width:2.8rem;flex:none;text-transform:lowercase}.prefix-menus{display:flex;flex:1;min-width:0;flex-wrap:wrap;gap:.35rem}.prefix-select{display:flex;align-items:center;min-width:0;gap:.2rem}.prefix-select select{width:5rem;min-width:4.5rem;min-height:46px;padding:.25rem;border:1px solid #ccd6df;border-radius:6px;background:#fff;color:#086b62;font:inherit}.prefix-select button{min-height:46px;padding:.3rem .5rem;border:1px solid #086b62;border-radius:6px;background:#fff;color:#086b62;font:inherit;font-weight:650}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.prefix-third{grid-template-columns:repeat(10,minmax(0,1fr))}.prefix-backspace{grid-column:span 2}.key.disabled{opacity:.45;cursor:not-allowed}@media(max-width:380px){main{padding:12px}.keyrow,.keyrow.third{gap:.2rem}.key{font-size:.82rem;min-height:44px}.prefix-row{gap:.25rem}.prefix-letter{width:2.35rem}.prefix-menus{gap:.2rem}.prefix-select select{width:4.1rem;min-width:3.8rem;font-size:.82rem}.prefix-select button{padding:.25rem .35rem;font-size:.82rem}}</style><style>.choices button,.more-row button,.type-form button{min-height:44px;padding:.55rem .75rem;border:1px solid #086b62;border-radius:5px;background:#fff;color:#086b62;font:inherit;font-weight:650;cursor:pointer}.choices button{min-width:2.2rem}.choices button:hover,.more-row button:hover{background:#e9f4f1}.choices button:focus-visible,.key:focus-visible,button:focus-visible,select:focus-visible,textarea:focus-visible,input:focus-visible{outline:3px solid #7c3b25;outline-offset:2px}.compose-form,.type-form{display:grid;gap:.65rem}.compose-form .choices{margin:.5rem 0}.more-row{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap}.more-row select{flex:1;min-width:12rem}.compose-form select,.compose-form input:not([type=radio]),.type-form select,.type-form textarea{min-height:44px;padding:.55rem;border:1px solid #ccd6df;border-radius:5px;background:#fff;color:inherit;font:inherit}.type-form textarea{min-height:5rem;resize:vertical}.hint{font-size:.82rem;color:#526466;margin:.2rem 0}.draft{white-space:pre-wrap;overflow-wrap:anywhere}.controls{margin:1rem 0}@media(max-width:380px){main{padding:12px}.more-row{align-items:stretch}.more-row select{min-width:100%}}.prefix-keyboard-page{max-width:1180px;padding:14px}.prefix-page-top{display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,.85fr);gap:18px;align-items:start;margin-bottom:12px}.prefix-intro h1{font-size:1.35rem;margin:.2rem 0 .45rem}.prefix-intro .notice{font-size:.76rem;margin:.3rem 0 .55rem}.prefix-page-top #draft{margin:0}.prefix-page-top #draft h2{margin:.1rem 0 .35rem}.prefix-page-top .draft{min-height:3rem;padding:.5rem}.prefix-page-top #draft .hint{margin-top:.25rem}.prefix-workspace{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(290px,.85fr);gap:16px;align-items:start}.prefix-browser-column,.prefix-tools{min-width:0}.prefix-browser-column section,.prefix-tools section{margin:.25rem 0 .8rem}.prefix-browser-column h2,.prefix-tools h2{font-size:.82rem;margin:.25rem 0 .4rem}.prefix-browser-column .hint,.prefix-tools .hint{font-size:.75rem}.prefix-grid{gap:.25rem}.prefix-row{gap:.3rem;padding:.15rem 0}.prefix-letter{width:1.8rem;min-height:28px;font-size:.82rem}.prefix-menus{gap:.22rem}.prefix-select{gap:.12rem}.prefix-select select{width:3.2rem;min-width:3rem;min-height:27px;padding:.1rem .2rem;border-radius:4px;font-size:.74rem;line-height:1.1}.prefix-select button{min-height:27px;padding:.1rem .3rem;border-radius:4px;font-size:.72rem;line-height:1.1}.prefix-tools .key-grid{gap:.3rem}.prefix-tools .keyrow{gap:.25rem}.prefix-tools .key{min-height:34px;padding:.2rem .1rem;border-radius:5px;font-size:.88rem;box-shadow:0 1px 0 #d6dfe2}.prefix-tools .typing-keyboard{display:grid;gap:.3rem}.prefix-tools .typing-row{display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:.3rem}.prefix-tools .typing-row a,.prefix-tools .typing-row span{display:flex;min-width:0;min-height:36px;align-items:center;justify-content:center;padding:.2rem;border:1px solid #cbd7de;border-radius:4px;background:#fff;color:#086b62;text-decoration:none;line-height:1}.prefix-tools .typing-row a:focus-visible{outline:3px solid #7c3b25;outline-offset:2px}.prefix-tools .typing-row .space-key{grid-column:span 4}.prefix-tools .typing-row .backspace-key,.prefix-tools .typing-row .enter-key{grid-column:span 2}.prefix-tools .typing-row.bottom-row{grid-template-columns:repeat(10,minmax(0,1fr))}.prefix-tools .candidate-panel{min-width:0;padding:.7rem;border:1px solid #d3dcdd;border-radius:6px;background:#fff}.prefix-tools .compose-form{gap:.45rem}.prefix-tools .compose-form section{margin:.35rem 0}.prefix-tools .choices{gap:.28rem}.prefix-tools .choices a,.prefix-tools .choices button{min-width:1.8rem;padding:.3rem .45rem;font-size:.82rem}.prefix-tools .compose-form select,.prefix-tools .more-row button{min-height:34px;padding:.3rem .45rem;font-size:.84rem}.prefix-tools .more-row select{min-width:8rem}.prefix-tools details{font-size:.85rem}.prefix-tools .controls{margin:.6rem 0;gap:.8rem}.prefix-workspace #prefix-results .choices{gap:.3rem}.prefix-workspace #prefix-results .choices a{padding:.3rem .45rem;font-size:.82rem}@media(max-width:820px){.prefix-keyboard-page{padding:12px}.prefix-workspace{grid-template-columns:minmax(0,1fr)}.prefix-page-top{grid-template-columns:minmax(0,1fr) minmax(250px,.8fr)}}@media(max-width:560px){.prefix-page-top{grid-template-columns:minmax(0,1fr);gap:8px}.prefix-workspace{padding:9px;gap:10px}.prefix-select select{width:3rem;min-width:2.8rem}.prefix-tools .keyrow,.prefix-tools .keyrow.third{gap:.2rem}}</style></head><body><main class="${view === "prefix" ? "prefix-keyboard-page" : ""}">${body}</main></body></html>`);
}

export function isWordKeyboardPath(pathname) {
  return pathname === PREFIX || pathname === `${PREFIX}/` || pathname.startsWith(`${PREFIX}/`) || pathname === PREFIX_KEYBOARD || pathname === `${PREFIX_KEYBOARD}/` || pathname === CHUNK_KEYBOARD || pathname === `${CHUNK_KEYBOARD}/`;
}

export function isWordKeyboardStartPath(pathname) {
  return pathname === PREFIX || pathname === `${PREFIX}/` || pathname === PREFIX_KEYBOARD || pathname === `${PREFIX_KEYBOARD}/` || pathname === CHUNK_KEYBOARD || pathname === `${CHUNK_KEYBOARD}/` || pathname.includes(`${PREFIX}/start/`);
}

export function isWordKeyboardMutationPath(pathname) {
  return isWordKeyboardStartPath(pathname) || /\/(?:step|form|review|discard)\//u.test(pathname);
}

export async function handleWordKeyboard(request, env, url, createPublishDraft, discardPublishDraft) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...NO_STORE, Allow: "GET, OPTIONS" } });
  if (request.method === "HEAD") {
    const mutating = isWordKeyboardMutationPath(url.pathname);
    return new Response(null, { status: mutating ? 405 : 200, headers: { ...NO_STORE, Allow: mutating ? "GET, OPTIONS" : "GET, HEAD, OPTIONS" } });
  }
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: { ...NO_STORE, Allow: "GET, HEAD, OPTIONS" } });
  try {
    if (url.href.length > 8_000) return fail("Links may not exceed 8,000 characters.", 414);
    const path = url.pathname;
    if (path === CHUNK_KEYBOARD || path === `${CHUNK_KEYBOARD}/`) {
      return new Response(null, { status: 308, headers: { ...NO_STORE, Location: `/predictive-keyboard/html/chunk-keyboard-3/${url.search}` } });
    }
    if (path === PREFIX || path === `${PREFIX}/` || path === PREFIX_KEYBOARD || path === `${PREFIX_KEYBOARD}/`) {
      const isPrefixEntry = path === PREFIX_KEYBOARD || path === `${PREFIX_KEYBOARD}/`;
      const params = queryParams(url, new Set(["reply_to"]));
      const replyTo = params.get("reply_to") || "";
      if (replyTo && !validReplyTarget(replyTo)) throw new Error("Reply target is not a valid IARC message ID.");
      const state = await createSession(env, randomToken(), replyTo || null);
      const viewQuery = isPrefixEntry ? "?view=prefix" : "";
      return await renderKeyboard(request, env, state, new URL(`${PREFIX}/state/${word(state.state_id)}${viewQuery}`, url.origin));
    }
    const startMatch = path.match(/^\/predictive-keyboard\/html\/word-links\/start\/(\d{13})\/([^/]+)\/([^/]+)$/u);
    if (startMatch) {
      const params = queryParams(url, new Set(["reply_to"]));
      const issuedAt = Number(startMatch[1]);
      const sessionId = readWord(startMatch[2]);
      const cap = readWord(startMatch[3]);
      const replyTo = params.get("reply_to") || "";
      if (replyTo && !validReplyTarget(replyTo)) throw new Error("Reply target is not a valid IARC message ID.");
      if (!Number.isSafeInteger(issuedAt) || issuedAt > Date.now() + 60_000 || Date.now() - issuedAt > START_TTL_MS) throw new Error("This start link expired. Return to the overview for a fresh link.");
      if (await signCommonWordRoute(env, "keyboard-start", sessionId, replyTo, issuedAt) !== cap) throw new Error("This start link is invalid.");
      const state = await createSession(env, sessionId, replyTo || null);
      return await renderKeyboard(request, env, state, new URL(`${PREFIX}/state/${word(state.state_id)}`, url.origin));
    }
    const stateMatch = path.match(/^\/predictive-keyboard\/html\/word-links\/state\/([^/]+)$/u);
    if (stateMatch) {
      const stateParams = queryParams(url, new Set(["layout", "shift", "prefix", "offset", "view", "start", "inside", "end", "word_page", "inside_page", "end_page", "pick_short", "short_cap"]));
      const state = await findState(env, readWord(stateMatch[1]));
      if (stateParams.has("pick_short") || stateParams.has("short_cap")) {
        const value = stateParams.get("pick_short") || "";
        const supplied = stateParams.get("short_cap") || "";
        const index = await lexiconStartPairs(env, request);
        const allowed = new Set([...index.short_characters, ...index.two_letter_words].map((item) => item.toLocaleLowerCase("en-US")));
        if (!allowed.has(value.toLocaleLowerCase("en-US")) || await signCommonWordRoute(env, "keyboard-short-pick", state.state_id) !== supplied) throw new Error("This short-word choice was not issued for the current keyboard state.");
        const argument = JSON.stringify({ text: value, case: "auto", wrapper: "none", suffix: "" });
        const childId = await signCommonWordRoute(env, "keyboard-action", state.state_id, "pick", argument);
        const child = await makeChild(env, request, state, "pick", argument, childId, true);
        return await renderKeyboard(request, env, child, new URL(`${PREFIX}/state/${word(child.state_id)}?view=chunks#draft`, url.origin));
      }
      return await renderKeyboard(request, env, state, url);
    }
    const formMatch = path.match(/^\/predictive-keyboard\/html\/word-links\/form\/([^/]+)$/u);
    if (formMatch) {
      const values = queryParams(url, new Set(["action", "pick", "more", "suffix", "case", "wrapper", "text", "join", "layout", "prefix", "selection", "offset", "view"]));
      const state = await findState(env, readWord(formMatch[1]));
      const layout = values.get("layout") || "letters";
      if (!new Set(["letters", "symbols"]).has(layout)) throw new Error("Keyboard layout link is invalid.");
      if (values.has("action") && values.has("pick")) throw new Error("Choose one action at a time.");
      const action = values.get("action") || (values.has("pick") ? "pick" : "");
      const viewPrefix = values.get("prefix") || "";
      const viewOffset = values.get("offset") || "0";
      const keyboardView = values.get("view") || "words";
      if (action === "prefix") {
        const selection = values.get("selection") || "";
        const extensions = (PREFIX_VOCABULARY.extensions[viewPrefix[0]] || []).filter((extension) => extension.startsWith(viewPrefix));
        if (keyboardView !== "prefix" || !APPROVED_PREFIXES.has(viewPrefix) || (selection !== viewPrefix && !extensions.includes(selection))) throw new Error("Choose this dropdown's two-letter prefix or one of its supplied three-letter continuations.");
        const argument = `gram:${selection}`;
        const childId = await signCommonWordRoute(env, "keyboard-action", state.state_id, "key", argument);
        const child = await makeChild(env, request, state, "key", argument, childId, true);
        return await renderKeyboard(request, env, child, new URL(`${stateHref(child.state_id, layout, false, viewPrefix, 0, keyboardView)}#prefix-results`, url));
      }
      if (action === "typed") {
        const text = values.get("text");
        const join = values.get("join");
        if (typeof text !== "string" || !["exact", "space-if-needed"].includes(join)) throw new Error("Add text using the displayed boundary choice.");
        if (!text) throw new Error("Enter text before adding it.");
        if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(text)) throw new Error(`Text must be valid and no longer than ${MAX_BODY_BYTES} UTF-8 bytes.`);
        const argument = JSON.stringify({ text, join });
        const childId = await signCommonWordRoute(env, "keyboard-action", state.state_id, "typed", argument);
        const child = await makeChild(env, request, state, "typed", argument, childId);
        return await renderKeyboard(request, env, child, new URL(`${stateHref(child.state_id, layout, false, viewPrefix, Number(viewOffset), keyboardView)}#draft`, url));
      }
      let kind;
      let candidate;
      let issuedToken;
      if (action === "pick") {
        const raw = values.get("pick") || "";
        const first = raw.indexOf(":");
        const last = raw.lastIndexOf(":");
        if (first < 1 || last <= first) throw new Error("Choose one signed candidate from the displayed options.");
        kind = raw.slice(0, first);
        candidate = raw.slice(first + 1, last);
        issuedToken = raw.slice(last + 1);
      } else if (action === "more") {
        kind = "word";
        const raw = values.get("more") || "";
        const split = raw.lastIndexOf(":");
        if (split < 1) throw new Error("Choose one of the signed additional words shown.");
        candidate = raw.slice(0, split);
        issuedToken = raw.slice(split + 1);
      } else throw new Error("Choose a displayed phrase, word, or keyboard action.");
      if (!new Set(["word", "phrase"]).has(kind)) throw new Error("The selected candidate type is invalid.");
      if (kind === "word" && candidate.includes(" ")) throw new Error("Choose a single word.");
      if (kind === "phrase" && (!candidate.includes(" ") || !isPresentablePhrase(candidate))) throw new Error("Choose a displayed phrase without a blocked term.");
      const issuedArgument = JSON.stringify({ text: candidate, case: "as-is", wrapper: "none", suffix: "" });
      if (await signCommonWordRoute(env, "keyboard-action", state.state_id, "pick", issuedArgument) !== issuedToken) throw new Error("This candidate was not issued for the current draft.");
      const choice = { text: candidate, case: values.get("case") || "auto", wrapper: values.get("wrapper") || "none", suffix: values.get("suffix") || "" };
      const argument = JSON.stringify(choice);
      const childId = await signCommonWordRoute(env, "keyboard-action", state.state_id, "pick", argument);
      const child = await makeChild(env, request, state, "pick", argument, childId, true);
      return await renderKeyboard(request, env, child, new URL(`${stateHref(child.state_id, layout, false, viewPrefix, Number(viewOffset), keyboardView)}#draft`, url));
    }
    const stepMatch = path.match(/^\/predictive-keyboard\/html\/word-links\/step\/([^/]+)\/(key|pick|clear)\/([^/]+)\/([^/]+)$/u);
    if (stepMatch) {
      const parentId = readWord(stepMatch[1]);
      const action = stepMatch[2];
      let argument;
      try { argument = decodeURIComponent(stepMatch[3]); }
      catch { throw new Error("This keyboard choice is malformed."); }
      const childId = readWord(stepMatch[4]);
      if (await signCommonWordRoute(env, "keyboard-action", parentId, action, argument) !== childId) throw new Error("This keyboard action link is invalid.");
      const parent = await findState(env, parentId);
      const child = await makeChild(env, request, parent, action, argument, childId, true);
      const nextUrl = new URL(`${PREFIX}/state/${word(child.state_id)}`, url);
      const mode = queryParams(url, new Set(["layout", "prefix", "offset", "view"]));
      for (const [key, value] of mode) {
        if (action === "pick" && (key === "prefix" || key === "offset")) continue;
        nextUrl.searchParams.set(key, value);
      }
      return await renderKeyboard(request, env, child, nextUrl);
    }
    const reviewMatch = path.match(/^\/predictive-keyboard\/html\/word-links\/review\/([^/]+)$/u);
    if (reviewMatch) {
      const reviewParams = queryParams(url, new Set(["view"]));
      const keyboardView = reviewParams.get("view") || "words";
      const state = await findState(env, readWord(reviewMatch[1]));
      const draft = await loadDraft(env, state);
      if (!draft) throw new Error("Enter text before reviewing it.");
      const activeReview = await env.RELAY_DB.prepare("SELECT c.expires_at AS cap_expires_at, p.expires_at AS draft_expires_at, p.state FROM html_keyboard_publish_links h JOIN capabilities c ON c.cap_hash = h.publish_cap_hash AND c.kind = 'publish' JOIN pending_messages p USING (pending_id) WHERE h.session_id = ?")
        .bind(state.session_id).first();
      if (activeReview && activeReview.cap_expires_at > Date.now() && activeReview.draft_expires_at > Date.now() && activeReview.state === "staged") throw new Error("A private publication draft is already active for this keyboard session. Use its review page, or wait for it to expire before reviewing again.");
      await env.RELAY_DB.prepare("DELETE FROM html_keyboard_publish_links WHERE session_id = ?").bind(state.session_id).run();
      if (typeof createPublishDraft !== "function") throw new Error("The publication flow is unavailable.");
      const pending = await createPublishDraft(request, draft, state.reply_to, state.session_id);
      if (pending instanceof Response) return pending;
      const wordPublishCap = word(pending.publish_cap);
      const publishHref = `/publish?${new URLSearchParams({ cap: wordPublishCap })}`;
      const expiry = escapeHtml(pending.expires_at);
      const reply = state.reply_to ? `<p>Reply to <code>${escapeHtml(state.reply_to)}</code>.</p>` : "";
      const bytes = new TextEncoder().encode(draft).byteLength;
      const editParams = new URLSearchParams({ cap: wordPublishCap });
      if (keyboardView !== "words") editParams.set("view", keyboardView);
      const editHref = `${PREFIX}/discard/${word(state.state_id)}?${editParams}`;
      return page("Review draft", `<h1>Review draft</h1><p><strong>Exact message · ${bytes} UTF-8 byte${bytes === 1 ? "" : "s"}</strong></p><pre class="draft">${escapeHtml(draft)}</pre>${reply}<p>This private draft expires at <time datetime="${expiry}">${expiry}</time>. Following the next link publishes it publicly. A crawler or prefetching client that follows it can publish; continue only when publication is intended and permitted.</p><p><a rel="nofollow" class="primary" href="${escapeHtml(publishHref)}">Publish this message publicly</a></p><p><a rel="nofollow" href="${escapeHtml(editHref)}">Edit message and discard this private draft</a></p>`);
    }
    const discardMatch = path.match(/^\/predictive-keyboard\/html\/word-links\/discard\/([^/]+)$/u);
    if (discardMatch) {
      const params = queryParams(url, new Set(["cap", "view"]));
      const state = await findState(env, readWord(discardMatch[1]));
      const suppliedCapability = params.get("cap") || "";
      const capability = decodeCommonWordRouteToken(suppliedCapability) || suppliedCapability;
      if (!/^[A-Za-z0-9_-]{43}$/u.test(capability)) throw new Error("The private draft capability is malformed.");
      if (typeof discardPublishDraft !== "function") throw new Error("Draft cancellation is unavailable.");
      const discarded = await discardPublishDraft(request, capability, state.session_id);
      if (discarded instanceof Response) return discarded;
      if (!discarded?.discarded) throw new Error(discarded?.detail || "The private draft could not be discarded.");
      const keyboardView = params.get("view") || "words";
      return page("Private draft discarded", `<h1>Private draft discarded</h1><p>The unpublished draft was discarded and its publish link is invalid. Nothing was published.</p><p><a href="${escapeHtml(stateHref(state.state_id, "letters", false, "", 0, keyboardView))}">Edit message</a></p>`);
    }
    return fail("No word-link keyboard page has this address.", 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Keyboard request failed.";
    const status = /signing is not configured|storage|database|assets are unavailable|resource unavailable/u.test(message) ? 503 : /state limit|active session limit/u.test(message) ? 429 : /private publication draft is already active/u.test(message) ? 409 : /limit reached|Message limit/u.test(message) ? 413 : /expired|unavailable|already been used to publish/u.test(message) ? 410 : 400;
    return fail(message, status);
  }
}
