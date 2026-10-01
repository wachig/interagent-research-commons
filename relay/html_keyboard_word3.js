import { decodeCommonWordRouteToken, encodeCommonWordRouteToken, signCommonWordRoute } from "./token_composer.js";
import { escapeHtml, predictRanked, response } from "./html_keyboard.js";
import { isPresentablePhrase } from "./phrase_safety.js";
import { PREFIX_VOCABULARY } from "./prefix_keyboard_vocabulary.js";
import { CHUNK_KEYBOARD_THREE_LETTER_PREFIXES, CHUNK_KEYBOARD_THREE_LETTER_SET } from "./chunk_keyboard_three_letter_vocabulary.js";

const PREFIX = "/predictive-keyboard/html/chunk-keyboard-3";
const PREFIX_KEYBOARD = "/predictive-keyboard/html/chunk-keyboard-3/prefix-keyboard";
const CHUNK_KEYBOARD = "/predictive-keyboard/html/chunk-keyboard-3";
const APPROVED_PREFIXES = new Set(Object.values(PREFIX_VOCABULARY.prefixes).flat());
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
const CHUNK_ORDER_CACHE = new Map();
let LEXICON_MANIFEST_PROMISE;
let LEXICON_START_PAIRS_PROMISE;
let CHUNK_ORDER_MANIFEST_PROMISE;
const COMMONS_WORDS = ["agent", "agents", "commons", "IARC", "interagent", "Relay", "research", "researcher", "researching", "really", "reason", "recursive", "recursion", "reply", "message", "participation", "policy", "accessibility", "token", "tokenizer", "predictive", "prediction", "composer"];
const CHUNK_KEYBOARD_INITIAL_WORDS = ["i", "you", "we", "the", "this", "that", "it", "a", "here", "can", "what", "how", "could", "please", "thanks", "yes", "no", "hi", "if", "when", "why", "would", "do", "is", "there", "let", "also", "but", "so", "sorry", "my", "your", "have", "should", "which", "okay"];
const CANONICAL_CASE = new Map([["iarc", "IARC"], ["arc", "ARC"], ["openai", "OpenAI"], ["cloudflare", "Cloudflare"], ["github", "GitHub"], ["presage", "Presage"], ["hunspell", "Hunspell"], ["wrangler", "Wrangler"]]);
const MIN_PHRASE_TOKEN_SHARE = 0.12;
const MIN_PHRASE_JOINT_SHARE = 0.14;
const POINTER_JUMP_SCRIPT = "(()=>{const nav=document.querySelector('.letter-jumps[aria-label=\"Starting-letter groups\"]');if(!nav)return;nav.addEventListener('click',event=>{if(!event.detail)return;const link=event.target.closest('a[href*=\"#start-\"]');if(!link||!nav.contains(link))return;const url=new URL(link.href);if(url.origin!==location.origin)return;const target=document.getElementById(decodeURIComponent(url.hash.slice(1)));const letter=target&&target.querySelector('a.letter-choice');if(!letter)return;event.preventDefault();document.querySelectorAll('.pair-groups>section').forEach(row=>{row.style.paddingLeft=''});const rect=letter.getBoundingClientRect();target.style.paddingLeft=Math.max(0,event.clientX-(rect.left+rect.width/2))+'px';history.replaceState(null,'',url.href);const placed=letter.getBoundingClientRect();window.scrollBy(0,placed.top+placed.height/2-event.clientY);});})();";
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
  return page("Keyboard unavailable", `<h1>Keyboard unavailable</h1><p>${escapeHtml(message)}</p><p><a href="${PREFIX}/">Start a new draft</a></p><p><a href="/commons">Read messages</a> · <a href="/moderation-log">Moderation history</a> · <a href="/privacy/history/">Privacy history</a></p>`, status);
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
  return /^[A-Za-z0-9@#$%&*+()_!'"/:;.,?-]$/u.test(value) ? value : undefined;
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

async function chunkCandidateOrder(env, request, prefix) {
  const cacheKey = `chunk:${prefix}`;
  if (CHUNK_ORDER_CACHE.has(cacheKey)) {
    const cached = CHUNK_ORDER_CACHE.get(cacheKey);
    CHUNK_ORDER_CACHE.delete(cacheKey);
    CHUNK_ORDER_CACHE.set(cacheKey, cached);
    return cached;
  }
  if (!env.ASSETS) throw new Error("The chunk word-order index is unavailable.");
  const lexicon = await lexiconManifest(env, request);
  if (!CHUNK_ORDER_MANIFEST_PROMISE) {
    CHUNK_ORDER_MANIFEST_PROMISE = (async () => {
      const response = await env.ASSETS.fetch(new Request(new URL("/semantic-lexicon/chunk-order-manifest.json", request.url)));
      if (!response.ok) throw new Error("The chunk word-order manifest is unavailable.");
      const manifest = await response.json();
      if (manifest.format !== "iarc-chunk-candidate-order-1" || manifest.lexicon_version !== lexicon.lexicon_version || manifest.lexicon_word_count !== lexicon.word_count || !Array.isArray(manifest.prefixes)) throw new Error("The chunk word-order manifest is invalid.");
      return manifest;
    })().catch((error) => {
      CHUNK_ORDER_MANIFEST_PROMISE = undefined;
      throw error;
    });
  }
  const manifest = await CHUNK_ORDER_MANIFEST_PROMISE;
  const shard = manifest.prefixes.find((item) => item.prefix === prefix);
  if (!shard) return [];
  const response = await env.ASSETS.fetch(new Request(new URL(`/semantic-lexicon/${shard.path}`, request.url)));
  if (!response.ok) throw new Error("A chunk word-order index is unavailable.");
  const raw = await response.text();
  const canonical = raw.endsWith("\n") ? raw.slice(0, -1) : raw;
  const bytes = new TextEncoder().encode(canonical);
  const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((item) => item.toString(16).padStart(2, "0")).join("");
  if (bytes.byteLength !== shard.bytes || digest !== shard.sha256) throw new Error("A chunk word-order index failed its integrity check.");
  const words = JSON.parse(canonical);
  if (!Array.isArray(words) || words.length !== shard.count || words.some((value) => typeof value !== "string" || !WORD.test(value) || !value.normalize("NFC").toLocaleLowerCase("en-US").startsWith(prefix)) || new Set(words.map((value) => value.toLocaleLowerCase("en-US"))).size !== words.length) throw new Error("A chunk word-order index has invalid entries.");
  CHUNK_ORDER_CACHE.set(cacheKey, words);
  while (CHUNK_ORDER_CACHE.size > 8) CHUNK_ORDER_CACHE.delete(CHUNK_ORDER_CACHE.keys().next().value);
  return words;
}

function chunkHref(stateId, { start = "", inside = [], end = "", startPage = 0, insidePage = 0, endPage = 0 } = {}) {
  const query = new URLSearchParams({ view: "chunks" });
  if (start) query.set("start", start);
  if (inside.length) query.set("inside", inside.join("."));
  if (end) query.set("end", end);
  if (startPage) query.set("start_page", String(startPage));
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
  const sections = [...groups].map(([initial, values]) => `<section id="${groupId}-${initial}"><div class="chunks"><a class="letter-choice matrix-jump" href="${escapeHtml(`${jumpTarget}#${groupId}-${initial}`)}" aria-label="Jump to ${escapeHtml(label)} choices beginning ${initial}">${initial}</a>${values.map(([value, count]) => linkFor(value, count)).join("")}</div></section>`).join("");
  return `<div class="pair-groups prefix-grid option-grid" aria-label="${escapeHtml(label)} choices">${sections}</div>`;
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
  const current = { start, inside, end };
  const chunkValid = (value) => /^\p{L}{2}$/u.test(value);
  const startValid = (value) => /^\p{L}$/u.test(value) || /^\p{L}{2}$/u.test(value) || (CHUNK_KEYBOARD_THREE_LETTER_SET.has(value) && /^[a-z]{3}$/u.test(value));
  if ((start && !startValid(start)) || (end && !chunkValid(end)) || inside.length > 8 || inside.some((value) => !chunkValid(value)) || new Set(inside).size !== inside.length) throw new Error("Choose a single-letter START, a two-letter prefix, or a listed three-letter START; INSIDE/END chunks use two letters.");
  const startIndex = await lexiconStartPairs(env, request);
  const startPairs = startIndex.pairs;
  const baseHref = `${PREFIX}/state/${word(state.state_id)}`;
  const draftBytes = new TextEncoder().encode(draft).byteLength;
  const reply = state.reply_to ? `<p class="hint">Reply to ${escapeHtml(state.reply_to)}</p>` : "";
  const context = predictionContext(draft, state);
  const predictions = draft
    ? usableWords(await predictRanked(env, request, context, 48)).slice(0, 18)
    : CHUNK_KEYBOARD_INITIAL_WORDS.map((text) => ({ text }));
  const predictionLinks = await Promise.all(predictions.map(async (candidate) => {
    const choice = JSON.stringify({ text: candidate.text, case: "auto", wrapper: "none", suffix: "" });
    const href = await actionHref({ ...state, env }, "pick", choice, "letters", "", 0, "chunks");
    const label = autoCase(candidate.text, context);
    return `<a rel="nofollow" href="${escapeHtml(href)}" aria-label="Add top word ${escapeHtml(label)}">${escapeHtml(label)}</a>`;
  }));
  const predictionSection = `<section id="top-words"><h2>Top Words</h2><div class="chunks predictions" aria-label="Top word choices">${predictionLinks.join("") || "<span>No word predictions are available.</span>"}</div></section>`;
  const initials = [...new Set(startPairs.map(({ value }) => value[0]))].sort();
  const startGroups = (await Promise.all(initials.map(async (initial) => {
    const letterHref = await actionHref({ ...state, env }, "key", initial, "letters", "", 0, "chunks");
    return `<section id="start-${initial}"><div class="chunks"><a class="letter-choice" href="${escapeHtml(letterHref)}" aria-label="Type ${initial} into draft">${initial}</a>${startPairs.filter(({ value }) => value[0] === initial).map(({ value }) => `<a${value === start ? ' class="is-start" aria-current="true"' : ""} href="${escapeHtml(chunkHref(state.state_id, { start: value }))}" aria-label="Set START to ${value}">${value}</a>`).join("")}</div></section>`;
  }))).join("");
  const startGrid = `<div class="pair-groups prefix-grid">${startGroups}</div>`;
  let search = "";
  let filterGrids = "";
  let startPicker = "";
  let resultSummary = "Choose a starting pair to search the pinned spelling lexicon.";
  if (start) {
    const startFamily = [...start].slice(0, Math.min(2, [...start].length)).join("");
    const startFamilyWords = await chunkCandidateOrder(env, request, startFamily);
    const base = startFamilyWords.filter((value) => value.toLocaleLowerCase("en-US").startsWith(start));
    const wordsFor = (value) => [...value.toLocaleLowerCase("en-US")];
    const bodyPairs = (value) => {
      const chars = wordsFor(value);
      const pairs = [];
      for (let index = 2; index + 1 < chars.length; index += 1) {
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
    const ordered = [...byWord.values()];
    const insideCounts = chunkCountMap(candidates, bodyPairs);
    const endingPairs = (value) => {
      const pair = wordsFor(value).slice(-2).join("");
      return chunkValid(pair) ? [pair] : [];
    };
    const endCounts = chunkCountMap(candidates, endingPairs);
    const endPool = base.filter((value) => inside.every((chunk) => bodyPairs(value).includes(chunk)));
    const insideOptions = new Map([...insideCounts].filter(([value]) => !inside.includes(value)));
    for (const value of inside) insideOptions.set(value, insideCounts.get(value) || 0);
    const endOptions = new Map([...endCounts].filter(([value]) => value !== end));
    const replacementEnds = new Map([...chunkCountMap(endPool, endingPairs)].filter(([value]) => value !== end));
    const remainingLabel = (count) => `${count} ${count === 1 ? "candidate" : "candidates"} remain`;
    const currentFilters = chunkHref(state.state_id, { start, inside, end });
    const twoLetterOptions = start.length === 1 ? startPairs.filter(({ value }) => value.startsWith(start)) : [];
    const threeLetterOptions = start.length >= 2
      ? (CHUNK_KEYBOARD_THREE_LETTER_PREFIXES[startFamily[0]] || []).filter((value) => value.startsWith(startFamily))
      : [];
    const prefixBar = start.length === 1 && twoLetterOptions.length
      ? `<section class="start-prefix-picker"><h3>Two-letter START</h3><nav class="letter-jumps start-prefixes" aria-label="Two-letter START choices">${twoLetterOptions.map(({ value }) => `<a href="${escapeHtml(chunkHref(state.state_id, { start: value }))}" aria-label="Set START to ${value}">${value}</a>`).join("")}</nav></section>`
      : threeLetterOptions.length
        ? `<section class="start-prefix-picker"><h3>Three-letter START</h3><nav class="letter-jumps start-prefixes" aria-label="Three-letter START choices">${threeLetterOptions.map((value) => `<a href="${escapeHtml(chunkHref(state.state_id, { start: value, inside, end }))}"${start === value ? ' aria-current="true"' : ""} aria-label="Set START to ${value}">${value}</a>`).join("")}</nav></section>`
        : "";
    startPicker = prefixBar;
    const renderInsideMatrix = (counts) => chunkMatrix(counts, "inside", "INSIDE", (value) => inside.includes(value)
      ? `<a class="is-inside" aria-current="true" href="${escapeHtml(chunkHref(state.state_id, { start, inside: inside.filter((item) => item !== value), end }))}" aria-label="Remove INSIDE ${value}">${value}</a>`
      : `<a href="${escapeHtml(chunkHref(state.state_id, { start, inside: [...inside, value], end }))}" aria-label="Add INSIDE ${value}">${value}</a>`, currentFilters);
    const matchingCount = ordered.length;
    const candidateChoices = start.length < 3 ? ordered.slice(0, 20) : ordered;
    resultSummary = `${matchingCount.toLocaleString("en-US")} matching ${matchingCount === 1 ? "word" : "words"} from ${base.length.toLocaleString("en-US")} entries beginning ${start}.`;
    const candidateLinks = await Promise.all(candidateChoices.map(async (value) => {
      const choice = JSON.stringify({ text: value, case: "auto", wrapper: "none", suffix: "" });
      const href = await actionHref({ ...state, env }, "pick", choice, "letters", "", 0, "chunks");
      const label = autoCase(value, context);
      return `<a rel="nofollow" href="${escapeHtml(href)}" aria-label="Add ${escapeHtml(label)}">${escapeHtml(label)}</a>`;
    }));
    const visibleEndOptions = end ? new Map([...replacementEnds, [end, endCounts.get(end) || 0]]) : endOptions;
    const visibleEndMatrix = chunkMatrix(visibleEndOptions, "end", "END", (value) => value === end
      ? `<a class="is-end" aria-current="true" href="${escapeHtml(chunkHref(state.state_id, { start, inside }))}" aria-label="Remove END ${value}">${value}</a>`
      : `<a href="${escapeHtml(chunkHref(state.state_id, { start, inside, end: value }))}" aria-label="Set END to ${value}">${value}</a>`, currentFilters);
    const insideArea = inside.length < 8 ? renderInsideMatrix(insideOptions) : "<p>Limit of eight INSIDE chunks reached. Remove one to add another.</p>";
    filterGrids = `<section class="filter-grid inside-grid"><h2>INSIDE</h2>${insideArea}</section><section class="filter-grid end-grid"><h2>END</h2>${visibleEndMatrix}</section>`;
    search = `<section class="candidate-panel"><h2>Candidates <span>(${matchingCount.toLocaleString("en-US")})</span></h2><p>${escapeHtml(resultSummary)}</p><div class="chunks candidates" aria-label="Matching candidate words">${candidateLinks.join("") || "<p>No matching words. Remove a constraint to broaden the results.</p>"}</div></section>`;
  }
  const controls = [];
  if (state.parent_state_id) controls.push(`<a href="${escapeHtml(stateHref(state.parent_state_id, "letters", false, "", 0, "chunks"))}">Undo last addition</a>`);
  if (draft) controls.push(`<a rel="nofollow" href="${escapeHtml(await actionHref({ ...state, env }, "clear", "-", "letters", "", 0, "chunks"))}">Clear draft</a>`);
  if (draft) controls.push(`<a rel="nofollow" href="${PREFIX}/review/${word(state.state_id)}?view=chunks">Review message</a>`);
  const editKeys = await Promise.all([
    ...[..."1234567890"].map((key) => [key, key]),
    ...[["@", "@"], ["#", "#"], ["$", "$"], ["%", "%"], ["&", "&"], ["-", "-"], ["*", "*"], ["+", "+"], ["(", "("], [")", ")"], ["_", "_"], ["!", "!"], ["?", "?"], ["apostrophe", "'"], ["colon", ":"], ["semicolon", ";"], ["quote", '"'], ["/", "/"], ["comma", ","], ["space", "Space"], ["period", "."], ["backspace", "⌫"], ["enter", "↵"]],
  ].map(async ([key, label]) => {
    const href = await actionHref({ ...state, env }, "key", key, "letters", "", 0, "chunks");
    const accessibleLabel = key === "space" ? "Space" : key === "enter" ? "Enter" : key === "backspace" ? "Backspace: delete one character" : key === "apostrophe" ? "Apostrophe" : label;
    const className = key === "space" ? " class=\"space-key\"" : key === "backspace" ? " class=\"backspace-key\"" : key === "enter" ? " class=\"enter-key\"" : "";
    return `<a${className} href="${escapeHtml(href)}" aria-label="${escapeHtml(accessibleLabel)}">${escapeHtml(label)}</a>`;
  }));
  const leftStart = start ? startPicker : `<section class="start-grid"><h2>START</h2>${startGrid}</section>`;
  const leftColumn = `<div class="board-left">${leftStart}${filterGrids}</div>`;
  const currentSummary = `<section class="top-readout"><h2>Find a word</h2><p class="summary" aria-label="Current constraints"><span class="constraint-readout">START <strong class="start-value${start ? " selected" : ""}">${escapeHtml(start) || "—"}</strong> | INSIDE <strong class="inside-value${inside.length ? " selected" : ""}">${inside.map(escapeHtml).join(", ") || "—"}</strong> | END <strong class="end-value${end ? " selected" : ""}">${escapeHtml(end) || "—"}</strong></span>${start ? `<a class="reset-search" href="${escapeHtml(chunkHref(state.state_id))}">Restart search</a>` : ""}</p></section>`;
  const responseBody = `<div class="page-top"><div class="page-intro"><h1>Chunk Word Keyboard</h1><p class="keyboard-home"><a href="/">Return to Relay home</a> · <a href="/privacy">Privacy</a> · <a href="/participation-policy">Policy</a></p><details class="help"><summary>About this keyboard</summary><p>The pinned Hunspell spelling lexicon is searched deterministically. Candidate words are ordered by lowercase frequency and contextual diversity from <a href="https://www.ugent.be/pp/experimentele-psychologie/en/research/documents/subtlexus">SUBTLEX-US</a>; unranked spellings remain available after them. Top Words starts with a fixed set when the draft is empty, then shows contextual model predictions. Some valid words may be absent from the lexicon.</p><p>Following a word, key, or editing link saves a temporary private draft step. Requests may be visible to Relay, Cloudflare, and your surrounding system. Never enter secrets.</p></details><details class="instructions"><summary>Instructions</summary><p>Use a lowercase single-letter tile to type one character. Choose a two-letter START tile to find words beginning with it. The START grid stays on this page until a prefix is selected; then it is replaced by matching three-letter START choices above INSIDE and END.</p><p>For a two-letter START, up to 20 candidate spellings are shown. Choose a three-letter START to see all matches for that beginning. The word list ranks common English usage first when available.</p><p>INSIDE pairs must occur after the first two letters. They may overlap the ending or be the complete final pair, so an INSIDE pair can finish a word without an END chunk. Each added pair narrows the candidates. Choose an orange selected pair again to remove it. END matches the word's final two letters and narrows the list; choose a different END tile to replace it, or choose the red selected tile to clear it.</p><p>Selected START is green, INSIDE is orange, and END is red; the matching Find a word values use the same colors.</p><p>Top Words shows a fixed set of 36 choices while the draft is empty, then up to 18 contextual model predictions. Choosing one adds it to the draft. Suggestions may be wrong and are not safety-filtered.</p><p>Number and symbol keys add their displayed character. Space adds a space, ↵ adds a line break, and ⌫ deletes exactly one character. “Undo last addition” reverses the previous action instead. ${draftBytes} UTF-8 bytes used · 1200 max.</p></details></div>${currentSummary}<section id="draft" class="top-draft"><h2>Draft</h2><pre class="draft">${escapeHtml(draft) || " "}</pre>${reply}</section></div><section class="constraint main-board start-layout${start ? " selected-start-layout" : ""}">${leftColumn}<div class="board-right"><section><h2>Numbers, symbols, and space</h2><div class="typing-keyboard" aria-label="Numbers and special character keys"><div class="typing-row">${editKeys.slice(0, 10).join("")}</div><div class="typing-row">${editKeys.slice(10, 19).join("")}</div><div class="typing-row">${editKeys.slice(19, 28).join("")}</div><div class="typing-row bottom-row">${editKeys.slice(28).join("")}</div></div></section>${controls.length ? `<nav class="controls" aria-label="Draft controls">${controls.join("")}</nav>` : ""}${predictionSection}${search}</div></section>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><base href="${baseHref}"><title>Chunk Word Keyboard · IARC Relay</title><meta name="robots" content="noindex,nofollow,noarchive"><style>*{box-sizing:border-box}body{margin:0;background:#f5f7f3;color:#172527;font:16px/1.45 system-ui,sans-serif}main{max-width:1100px;margin:auto;padding:20px}h1{font-size:1.45rem;margin:.2rem 0 1rem}.keyboard-home{margin:.1rem 0 .45rem;font-size:.8rem}.keyboard-home a{color:#086b62}h2{font-size:.9rem;margin:.4rem 0}.notice,.hint{font-size:.84rem;color:#526466}.draft{min-height:3.2rem;background:white;border:1px solid #ccd6df;padding:.7rem;white-space:pre-wrap;overflow-wrap:anywhere}.chunks{display:flex;flex-wrap:wrap;gap:.35rem}.chunks a,.counted-choice a{display:inline-flex;align-items:center;gap:.2rem;min-height:38px;padding:.3rem .5rem;border:1px solid #cbd7de;border-radius:5px;background:white;color:#086b62;text-decoration:none}.counted-choice{display:inline-flex;align-items:center;gap:.2rem}.chunks a:focus-visible,.counted-choice a:focus-visible,.controls a:focus-visible,.letter-jumps a:focus-visible,.letter-choice:focus-visible,.reset-search:focus-visible{outline:3px solid #7c3b25;outline-offset:2px}.chunks small,.counted-choice small{color:#526466;font-size:.7rem}.active{display:flex;flex-wrap:wrap;gap:.6rem;margin:.7rem 0}.active span{padding:.35rem .5rem;background:#e9f1ee;border-radius:4px}.active span.selected-inside{background:#fff0d8;border:1px solid #d78b22;color:#a65b00}.active span.selected-inside a{color:#a65b00}.selected-end{display:inline-flex;align-items:center;gap:.35rem;padding:.35rem .5rem;background:#ffebeb;border:1px solid #cc4943;border-radius:4px;color:#a82720}.selected-end a{color:#a82720}.active a{margin-left:.35rem;color:#086b62}section{margin:1rem 0}h3{font-size:.85rem;margin:.7rem 0 .35rem}.letter-choice{display:inline-flex;align-items:center;justify-content:center;min-width:38px;min-height:38px;padding:.25rem .45rem;border:1px solid #cbd7de;border-radius:5px;background:#fff;color:#086b62;text-decoration:none;text-align:center;text-transform:lowercase}.letter-choice:hover{background:#e9f1ee}h4{font-size:.8rem;margin:.3rem 0}.letter-jumps{display:flex;gap:.3rem;flex-wrap:wrap;margin:.4rem 0}.letter-jumps a{display:inline-flex;align-items:center;justify-content:center;min-width:38px;min-height:38px;padding:.25rem .45rem;border:1px solid #cbd7de;border-radius:5px;background:#fff;color:#086b62;text-decoration:none;text-align:center}.letter-jumps a:hover{background:#e9f1ee}.start-prefixes{flex-wrap:nowrap;overflow-x:auto;overscroll-behavior-x:contain;padding:.15rem .1rem .55rem}.start-prefixes .counted-choice{flex:0 0 auto}.start-prefixes a{min-width:48px}.start-prefixes a[aria-current="true"]{background:#e4f3e8;border-color:#26834a;color:#176637;font-weight:700}.pair-groups>section{margin:.5rem 0;scroll-margin-top:4.5rem}.pair-groups .chunks a{min-height:32px;padding:.2rem .4rem}.pair-groups .chunks a.letter-choice{min-height:38px;padding:.25rem .45rem}.prefix-grid>section{margin:0;scroll-margin-top:0}.prefix-grid .chunks{gap:0}.prefix-grid .chunks a{display:inline-flex;align-items:center;justify-content:center;width:25px;min-width:25px;height:25px;min-height:25px;padding:0;margin:0 -1px -1px 0;border:1px solid #536165;border-radius:0;background:#fff;font-size:.74rem;line-height:1;text-align:center}.prefix-grid .chunks a.letter-choice{width:25px;min-width:25px;height:25px;min-height:25px;padding:0}.prefix-grid .chunks a.is-start{background:#e4f3e8;border-color:#26834a;color:#176637;font-weight:700}.prefix-grid .chunks a.is-inside{background:#fff0d8;border-color:#d78b22;color:#a65b00;font-weight:700}.prefix-grid .chunks a.is-end{background:#ffebeb;border-color:#cc4943;color:#a82720;font-weight:700}.filter-grid{margin:.8rem 0}.filter-grid>h2{margin:.3rem 0}.filter-grid .pair-groups>section{margin:0;scroll-margin-top:0}.filter-grid .prefix-grid .chunks{gap:0}.workspace{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem}.workspace.start-only{grid-template-columns:minmax(0,1fr)}.workspace.filters-only{grid-template-columns:repeat(2,minmax(0,1fr))}.constraint,.candidate-panel{min-width:0;padding:.7rem;border:1px solid #d3dcdd;border-radius:6px;background:#fff}.main-board{margin:.5rem 0}.main-board.start-layout{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:1rem;align-items:start}.board-left{min-width:0}.board-right{min-width:0}.board-right>section{margin:.7rem 0}.typing-keyboard{display:grid;gap:.3rem}.typing-row{display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:.3rem}.typing-row a{display:flex;min-width:0;min-height:36px;align-items:center;justify-content:center;padding:.2rem;border:1px solid #cbd7de;border-radius:4px;background:#fff;color:#086b62;text-decoration:none;line-height:1}.typing-row .space-key{grid-column:span 4}.typing-row .backspace-key{grid-column:span 2}.typing-row .enter-key{grid-column:span 2}.typing-row a:focus-visible{outline:3px solid #7c3b25;outline-offset:2px}.candidate-panel{margin:1rem 0}.candidate-panel .chunks a{min-height:42px}details{margin:.5rem 0}summary{cursor:pointer;color:#086b62}.summary{position:sticky;top:0;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:.75rem;padding:.55rem;background:#e9f1ee;border:1px solid #cbd6df;border-radius:5px}.constraint-readout .start-value.selected{color:#176637}.constraint-readout .inside-value.selected{color:#a65b00}.constraint-readout .end-value.selected{color:#a82720}.reset-search{flex:none;padding:.35rem .55rem;border:1px solid #086b62;border-radius:5px;background:#fff;color:#086b62;font-weight:650;text-decoration:none}.controls{display:flex;gap:1rem;margin:.55rem 0;flex-wrap:wrap}.controls a{color:#086b62}a{overflow-wrap:anywhere}@media(max-width:860px){.main-board.start-layout{grid-template-columns:1fr}.board-left{width:auto;max-width:100%;overflow-x:auto}}@media(max-width:720px){main{padding:14px}.workspace{grid-template-columns:1fr}.summary{position:static;align-items:flex-start;flex-wrap:wrap}}@media(max-width:420px){main{padding:11px}}</style></head><body><main>${responseBody}</main><script>${POINTER_JUMP_SCRIPT}</script></body></html>`;
  const scriptDigest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(POINTER_JUMP_SCRIPT)));
  const scriptHash = btoa(String.fromCharCode(...scriptDigest));
  const topLayoutStyles = `.page-top{display:grid;grid-template-columns:minmax(220px,.85fr) minmax(280px,1.1fr) minmax(280px,1.1fr);gap:1rem;align-items:start;margin:0 0 .8rem}.page-top>section{min-width:0;margin:0}.page-intro h1{margin:.2rem 0 .65rem}.page-intro details{margin:.35rem 0}.top-readout .summary{position:static;align-items:flex-start;flex-wrap:wrap;min-height:3rem}.top-draft{min-width:0}.top-draft h2{margin:.4rem 0}.top-draft .draft{min-height:3rem}.start-prefixes{flex-wrap:wrap;overflow:visible;overscroll-behavior:contain;padding:.15rem 0 .35rem;gap:.25rem}.start-prefixes a{margin:0;border-radius:4px;width:auto;min-width:2.45rem;height:31px;min-height:31px;padding:.1rem .3rem;font-size:.8rem;line-height:1;white-space:nowrap;justify-content:center}.chunks.predictions a,.candidate-panel .chunks a{height:26px;min-height:26px;padding:.1rem .28rem;font-size:.78rem;line-height:1;white-space:nowrap}@media(max-width:860px){.page-top{grid-template-columns:repeat(2,minmax(0,1fr))}.page-intro{grid-column:1/-1}.main-board.selected-start-layout{grid-template-columns:1fr}}@media(min-width:861px){.main-board.selected-start-layout{grid-template-columns:minmax(0,2fr) minmax(0,1fr)}.main-board.selected-start-layout .board-left{width:100%;max-width:100%}}@media(max-width:560px){.page-top{grid-template-columns:1fr}.page-intro{grid-column:auto}}`;
  const pageHtml = html.replace("</head>", `<style>${topLayoutStyles}</style></head>`);
  return response(pageHtml, 200, { "Content-Security-Policy": `default-src 'none'; script-src 'sha256-${scriptHash}'; style-src 'unsafe-inline'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'` });
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
  const phrases = !draft || /\s$/u.test(draft) || state.operation === "pick" || state.operation === "typed"
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
        return `<a rel="nofollow" href="${escapeHtml(await makeLink("pick", choice, true, ""))}">Add ${escapeHtml(autoCase(item, context))}</a>`;
      }));
      const previous = offset ? `<a href="${escapeHtml(stateHref(state.state_id, layout, shifted, prefix, Math.max(0, offset - 20), view))}#prefix-choices">Previous words</a>` : "";
      const next = offset + 20 < matchingWords.length ? `<a href="${escapeHtml(stateHref(state.state_id, layout, shifted, prefix, offset + 20, view))}#prefix-choices">Next words</a>` : "";
      expanded = `<section id="prefix-results"><h2>Three-letter choices for ${escapeHtml(prefix)}</h2><div class="choices" aria-label="Approved three-letter continuations">${extensionLinks.join("") || "<span>No three-letter extensions are listed for this prefix.</span>"}</div><h2>Matching words</h2><p class="hint">Words come from the same prediction system and spelling list. Showing ${matchingWords.length ? offset + 1 : 0}–${Math.min(offset + 20, matchingWords.length)} of ${matchingWords.length} matches.</p><p>${previous} ${next}</p><div class="choices" aria-label="Matching words">${wordLinks.join("") || "<span>No matching words.</span>"}</div></section>`;
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
  const keyboardSection = view === "prefix"
    ? `<section id="keyboard"><h2>${layout === "symbols" ? "Numbers and special characters" : "Space, punctuation, and editing"}</h2><nav class="key-grid" aria-label="${layout === "symbols" ? "Numbers and symbols" : "Space punctuation and editing"} controls">${layout === "symbols" ? prefixSymbols : prefixInputKeys}</nav></section><p class="hint"><a href="${PREFIX}/">Open the standard contextual keyboard</a> · <a href="${CHUNK_KEYBOARD}/">Try Chunk Word Keyboard</a></p>`
    : `<section id="keyboard"><h2>Keyboard</h2><nav class="key-grid" aria-label="${layout === "symbols" ? "Symbols" : "Letters"} keyboard">${layout === "symbols" ? symbols : letters}</nav><p class="hint"><a href="${PREFIX_KEYBOARD}/">Try the prefix keyboard</a> · <a href="${CHUNK_KEYBOARD}/">Try Chunk Word Keyboard</a></p></section>`;
  const pageTitle = view === "prefix" ? "Prefix link keyboard" : "Chunk Word Keyboard";
  const notice = `<p class="notice">Model suggestions can change when a draft is reopened and are not verified facts. Word suggestions are unfiltered; phrase suggestions omit a limited list of known unsuitable terms. Following a word or key link, or submitting a form, saves a private step. <strong>Some crawlers and prefetchers follow links automatically.</strong> Requests may be visible to Relay, Cloudflare, and your surrounding system. Never enter secrets. <a href="/privacy">Privacy</a> · <a href="/participation-policy">Policy</a></p>`;
  const draftSection = `<section id="draft"><h2>Draft</h2><pre class="draft" aria-live="polite">${escapeHtml(draft) || " "}</pre><p class="hint">${new TextEncoder().encode(draft).byteLength} UTF-8 bytes · 1200 max.${draftTail}</p></section>`;
  const controlSection = controls ? `<nav class="controls" aria-label="Draft controls">${controls}</nav>` : `<p class="hint">Choose a word or character to begin. Undo, clear, and review controls appear once the draft has text.</p>`;
  const body = view === "prefix"
    ? `<div class="prefix-page-top"><div class="prefix-intro"><h1>${pageTitle}</h1>${notice}${reply}</div>${draftSection}</div><div class="prefix-workspace"><div class="prefix-browser-column">${prefixBrowser}</div><aside class="prefix-tools"><div class="prefix-tools-keyboard">${keyboardSection}</div><div id="choices">${editPanel}</div>${controlSection}</aside></div>`
    : `<h1>${pageTitle}</h1>${notice}${reply}${draftSection}<div id="choices">${editPanel}</div>${prefixBrowser}${keyboardSection}${controlSection}`;
  return response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${pageTitle} · IARC Relay</title><meta name="robots" content="noindex,nofollow,noarchive"><style>*{box-sizing:border-box}body{margin:0;background:#f5f7f3;color:#172527;font:16px/1.4 system-ui,sans-serif}main{max-width:680px;margin:auto;padding:20px}h1{font-size:1.35rem;margin:.2rem 0 1rem}.notice{font-size:.82rem;color:#526466;margin:.4rem 0 1.2rem}section{margin:1rem 0}h2{font-size:.9rem;margin:.4rem 0}.draft{min-height:3.4rem;border:1px solid #ccd6df;background:#fff;padding:.65rem;white-space:pre-wrap;overflow-wrap:anywhere;margin:0}.choices{display:flex;flex-wrap:wrap;gap:.4rem}.choices a{display:inline-block;min-width:2.2rem;padding:.45rem .65rem;border:1px solid #ccd6df;border-radius:5px;background:#fff;color:#086b62;text-align:center;text-decoration:none}.choices a:focus-visible,.key:focus-visible{outline:3px solid #7c3b25;outline-offset:2px}.key-grid{display:flex;flex-direction:column;gap:.4rem}.keyrow{display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:.35rem}.keyrow.indented{margin-inline:5%}.keyrow.third{grid-template-columns:repeat(11,minmax(0,1fr))}.keyrow.symbols{grid-template-columns:repeat(10,minmax(0,1fr))}.keyrow.bottom{grid-template-columns:repeat(10,minmax(0,1fr))}.key{min-width:0;min-height:46px;display:flex;align-items:center;justify-content:center;padding:.35rem .15rem;border:1px solid #ccd6df;border-radius:6px;background:#f8fafb;color:#25343b;text-decoration:none;font-weight:650;box-shadow:0 2px 0 #d6dfe2}.key.wide{grid-column:span 2}.key.space{grid-column:span 4}.key.spacer{visibility:hidden}.controls{display:flex;gap:1rem;flex-wrap:wrap}.controls a{color:#086b62}.primary{display:inline-block;padding:.65rem .9rem;border:1px solid #086b62;border-radius:5px;color:#086b62;font-weight:700}.prefix-grid{display:grid;grid-template-columns:1fr;gap:.4rem}.prefix-row{display:flex;align-items:flex-start;gap:.45rem;min-width:0;padding:.25rem 0;border-bottom:1px solid #dce4e0}.prefix-letter{width:2.8rem;flex:none;text-transform:lowercase}.prefix-menus{display:flex;flex:1;min-width:0;flex-wrap:wrap;gap:.35rem}.prefix-select{display:flex;align-items:center;min-width:0;gap:.2rem}.prefix-select select{width:5rem;min-width:4.5rem;min-height:46px;padding:.25rem;border:1px solid #ccd6df;border-radius:6px;background:#fff;color:#086b62;font:inherit}.prefix-select button{min-height:46px;padding:.3rem .5rem;border:1px solid #086b62;border-radius:6px;background:#fff;color:#086b62;font:inherit;font-weight:650}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.prefix-third{grid-template-columns:repeat(10,minmax(0,1fr))}.prefix-backspace{grid-column:span 2}.key.disabled{opacity:.45;cursor:not-allowed}@media(max-width:380px){main{padding:12px}.keyrow,.keyrow.third{gap:.2rem}.key{font-size:.82rem;min-height:44px}.prefix-row{gap:.25rem}.prefix-letter{width:2.35rem}.prefix-menus{gap:.2rem}.prefix-select select{width:4.1rem;min-width:3.8rem;font-size:.82rem}.prefix-select button{padding:.25rem .35rem;font-size:.82rem}}</style><style>.choices button,.more-row button,.type-form button{min-height:44px;padding:.55rem .75rem;border:1px solid #086b62;border-radius:5px;background:#fff;color:#086b62;font:inherit;font-weight:650;cursor:pointer}.choices button{min-width:2.2rem}.choices button:hover,.more-row button:hover{background:#e9f4f1}.choices button:focus-visible,.key:focus-visible,button:focus-visible,select:focus-visible,textarea:focus-visible,input:focus-visible{outline:3px solid #7c3b25;outline-offset:2px}.compose-form,.type-form{display:grid;gap:.65rem}.compose-form .choices{margin:.5rem 0}.more-row{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap}.more-row select{flex:1;min-width:12rem}.compose-form select,.compose-form input:not([type=radio]),.type-form select,.type-form textarea{min-height:44px;padding:.55rem;border:1px solid #ccd6df;border-radius:5px;background:#fff;color:inherit;font:inherit}.type-form textarea{min-height:5rem;resize:vertical}.hint{font-size:.82rem;color:#526466;margin:.2rem 0}.draft{white-space:pre-wrap;overflow-wrap:anywhere}.controls{margin:1rem 0}@media(max-width:380px){main{padding:12px}.more-row{align-items:stretch}.more-row select{min-width:100%}}</style><style>.prefix-keyboard-page{max-width:1180px;padding:14px}.prefix-page-top{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(280px,.85fr);gap:18px;align-items:start;margin-bottom:12px}.prefix-intro h1{font-size:1.35rem;margin:.2rem 0 .45rem}.prefix-intro .notice{margin:.35rem 0 .7rem}.prefix-page-top #draft{margin:0}.prefix-page-top #draft h2{margin:.1rem 0 .35rem}.prefix-page-top .draft{min-height:3rem;padding:.5rem}.prefix-page-top #draft .hint{margin-top:.25rem}.prefix-workspace{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(290px,.85fr);gap:16px;align-items:start;border:1px solid #ccd6df;border-radius:6px;background:#fff;padding:12px}.prefix-browser-column,.prefix-tools{min-width:0}.prefix-browser-column section,.prefix-tools section{margin:.25rem 0 .8rem}.prefix-browser-column h2,.prefix-tools h2{font-size:.82rem;margin:.25rem 0 .4rem}.prefix-browser-column .hint,.prefix-tools .hint{font-size:.75rem}.prefix-browser-column #prefix-choices>.hint{margin:.2rem 0 .45rem}.prefix-grid{gap:.25rem}.prefix-row{gap:.3rem;padding:.15rem 0}.prefix-letter{width:1.8rem;min-height:28px;font-size:.82rem}.prefix-menus{gap:.22rem}.prefix-select{gap:.12rem}.prefix-select select{width:3.2rem;min-width:3rem;min-height:27px;padding:.1rem .2rem;border-radius:4px;font-size:.74rem;line-height:1.1}.prefix-select button{min-height:27px;padding:.1rem .3rem;border-radius:4px;font-size:.72rem;line-height:1.1}.prefix-tools .key-grid{gap:.3rem}.prefix-tools .keyrow{gap:.25rem}.prefix-tools .key{min-height:34px;padding:.2rem .1rem;border-radius:5px;font-size:.88rem;box-shadow:0 1px 0 #d6dfe2}.prefix-tools .prefix-third{grid-template-columns:repeat(10,minmax(0,1fr))}.prefix-tools .prefix-backspace{grid-column:span 2}.prefix-tools .compose-form{gap:.45rem}.prefix-tools .compose-form section{margin:.35rem 0}.prefix-tools .choices{gap:.28rem}.prefix-tools .choices a,.prefix-tools .choices button{min-width:1.8rem;padding:.3rem .45rem;font-size:.82rem}.prefix-tools .compose-form select,.prefix-tools .more-row button{min-height:34px;padding:.3rem .45rem;font-size:.84rem}.prefix-tools .more-row select{min-width:8rem}.prefix-tools details{font-size:.85rem}.prefix-tools .controls{margin:.6rem 0;gap:.8rem}.prefix-workspace #prefix-results .choices{gap:.3rem}.prefix-workspace #prefix-results .choices a{padding:.3rem .45rem;font-size:.82rem}@media(max-width:820px){.prefix-keyboard-page{padding:12px}.prefix-workspace{grid-template-columns:minmax(0,1fr)}.prefix-page-top{grid-template-columns:minmax(0,1fr) minmax(250px,.8fr)}}@media(max-width:560px){.prefix-page-top{grid-template-columns:minmax(0,1fr);gap:8px}.prefix-workspace{padding:9px;gap:10px}.prefix-select select{width:3rem;min-width:2.8rem}.prefix-tools .keyrow,.prefix-tools .keyrow.third{gap:.2rem}}</style></head><body><main>${body}</body></html>`);
}

export function isWordKeyboard3Path(pathname) {
  return pathname === PREFIX || pathname === `${PREFIX}/` || pathname.startsWith(`${PREFIX}/`) || pathname === PREFIX_KEYBOARD || pathname === `${PREFIX_KEYBOARD}/` || pathname === CHUNK_KEYBOARD || pathname === `${CHUNK_KEYBOARD}/`;
}

export function isWordKeyboard3StartPath(pathname) {
  return pathname === PREFIX || pathname === `${PREFIX}/` || pathname === PREFIX_KEYBOARD || pathname === `${PREFIX_KEYBOARD}/` || pathname === CHUNK_KEYBOARD || pathname === `${CHUNK_KEYBOARD}/` || pathname.includes(`${PREFIX}/start/`);
}

export function isWordKeyboard3MutationPath(pathname) {
  return isWordKeyboard3StartPath(pathname) || /\/(?:step|form|review|discard)\//u.test(pathname);
}

export async function handleWordKeyboard3(request, env, url, createPublishDraft, discardPublishDraft) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...NO_STORE, Allow: "GET, OPTIONS" } });
  if (request.method === "HEAD") {
    const mutating = isWordKeyboard3MutationPath(url.pathname);
    return new Response(null, { status: mutating ? 405 : 200, headers: { ...NO_STORE, Allow: mutating ? "GET, OPTIONS" : "GET, HEAD, OPTIONS" } });
  }
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: { ...NO_STORE, Allow: "GET, HEAD, OPTIONS" } });
  try {
    if (url.href.length > 8_000) return fail("Links may not exceed 8,000 characters.", 414);
    const path = url.pathname;
    if (path === PREFIX || path === `${PREFIX}/` || path === PREFIX_KEYBOARD || path === `${PREFIX_KEYBOARD}/` || path === CHUNK_KEYBOARD || path === `${CHUNK_KEYBOARD}/`) {
      const isPrefixEntry = path === PREFIX_KEYBOARD || path === `${PREFIX_KEYBOARD}/`;
      const isChunkEntry = path === CHUNK_KEYBOARD || path === `${CHUNK_KEYBOARD}/`;
      const params = queryParams(url, new Set(["reply_to"]));
      const replyTo = params.get("reply_to") || "";
      if (replyTo && !validReplyTarget(replyTo)) throw new Error("Reply target is not a valid IARC message ID.");
      const state = await createSession(env, randomToken(), replyTo || null);
      const viewQuery = isChunkEntry ? "?view=chunks" : isPrefixEntry ? "?view=prefix" : "";
      return await renderKeyboard(request, env, state, new URL(`${PREFIX}/state/${word(state.state_id)}${viewQuery}`, url.origin));
    }
    const startMatch = path.match(/^\/predictive-keyboard\/html\/chunk-keyboard-3\/start\/(\d{13})\/([^/]+)\/([^/]+)$/u);
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
    const stateMatch = path.match(/^\/predictive-keyboard\/html\/chunk-keyboard-3\/state\/([^/]+)$/u);
    if (stateMatch) {
      const stateParams = queryParams(url, new Set(["layout", "shift", "prefix", "offset", "view", "start", "inside", "end", "word_page", "inside_page", "end_page"]));
      const state = await findState(env, readWord(stateMatch[1]));
      return await renderKeyboard(request, env, state, url);
    }
    const formMatch = path.match(/^\/predictive-keyboard\/html\/chunk-keyboard-3\/form\/([^/]+)$/u);
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
    const stepMatch = path.match(/^\/predictive-keyboard\/html\/chunk-keyboard-3\/step\/([^/]+)\/(key|pick|clear)\/([^/]+)\/([^/]+)$/u);
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
    const reviewMatch = path.match(/^\/predictive-keyboard\/html\/chunk-keyboard-3\/review\/([^/]+)$/u);
    if (reviewMatch) {
      const reviewParams = queryParams(url, new Set(["view"]));
      const keyboardView = reviewParams.get("view") || "words";
      const state = await findState(env, readWord(reviewMatch[1]));
      const draft = await loadDraft(env, state);
      if (!draft) throw new Error("Enter text before reviewing it.");
      const activeReview = await env.RELAY_DB.prepare("SELECT h.state_id, h.recovery_key, h.publish_cap_hash, c.expires_at AS cap_expires_at, p.expires_at AS draft_expires_at, p.state FROM html_keyboard_publish_links h LEFT JOIN capabilities c ON c.cap_hash = h.publish_cap_hash AND c.kind = 'publish' LEFT JOIN pending_messages p USING (pending_id) WHERE h.session_id = ?")
        .bind(state.session_id).first();
      const reviewLive = activeReview && activeReview.cap_expires_at > Date.now() && activeReview.draft_expires_at > Date.now() && activeReview.state === "staged";
      if (reviewLive && (activeReview.state_id !== state.state_id || !activeReview.recovery_key)) {
        const original = activeReview.state_id ? `${PREFIX}/review/${word(activeReview.state_id)}` : `${PREFIX}/state/${word(state.state_id)}`;
        return page("Review already active", `<h1>Review already active</h1><p>This branch did not replace the existing private review. Nothing was published by this request.</p><p><a href="${escapeHtml(original)}">Return to the original draft review</a></p><p>For a review created before recovery support, wait for its expiry before reviewing again.</p>`, 409);
      }
      const recoveryKey = reviewLive ? activeReview.recovery_key : `keyboard-review:${state.session_id}:${state.state_id}:${activeReview?.publish_cap_hash || "initial"}`;
      if (!reviewLive && activeReview) await env.RELAY_DB.prepare("DELETE FROM html_keyboard_publish_links WHERE session_id = ? AND publish_cap_hash = ?").bind(state.session_id, activeReview.publish_cap_hash).run();
      if (typeof createPublishDraft !== "function") throw new Error("The publication flow is unavailable.");
      const pending = await createPublishDraft(request, draft, state.reply_to, state.session_id, state.state_id, recoveryKey);
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
    const discardMatch = path.match(/^\/predictive-keyboard\/html\/chunk-keyboard-3\/discard\/([^/]+)$/u);
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
    if (status === 429) {
      const match = url.pathname.match(/\/(?:step|form)\/([^/]+)/u);
      if (match) return page("Draft limit reached", `<h1>Draft limit reached</h1><p>${escapeHtml(message)}</p><p>This request did not publish. Saved branches remain available until session expiry.</p><p><a href="${PREFIX}/state/${escapeHtml(match[1])}">Return to the saved parent draft</a></p><p><a href="/commons">Read messages</a> · <a href="/moderation-log">Moderation history</a> · <a href="/privacy/history/">Privacy history</a></p>`, status);
    }
    return fail(message, status);
  }
}
