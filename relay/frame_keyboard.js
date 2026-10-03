import { frameWordAddition } from './frame_suggestions.js';
import { COMMON_PUNCTUATION } from './common_punctuation.js';
import { appendFrame, appendFrameSlotText, backspaceFrameSlot, changeLastFrame, convertFrameToPlainText, createFrameDocument, fillFrameSlot, frameIsComplete, renderFrameDocument, validateFrameDocument, FRAME_CATALOGUE, FRAME_CATALOGUE_VERSION } from "./frame_document.js";
import { appendDelta, createSession, findState, keyboardErrorStatus, loadDraft, MAX_BODY_BYTES, retainedReply, reviewTextDraft, saveTextChild, unicodeChoices } from "./keyboard_foundation.js";
import { decodeCommonWordRouteToken, encodeCommonWordRouteToken, signCommonWordRoute } from "./token_composer.js";
import { escapeHtml, response, predictRanked } from "./html_keyboard.js";

const PREFIX = "/predictive-keyboard/html/frame-keyboard";
const START_TTL_MS = 15 * 60_000;
const SLOT_CHOICES = Object.freeze({
  item: ["the second file", "the east entrance", "that blue cable", "my account", "the warning label", "the upper setting", "a printed copy", "the small connector"],
  state: ["ready for review", "still active", "near the entrance", "almost complete", "open after noon", "out of date", "under the desk", "back in place"],
  subject: ["the timer", "the scanner", "the main display", "the printer", "the new version", "the third window", "the status light"],
  action: ["restart the device", "check the last step", "close the side panel", "print two copies", "save a local copy", "replace the cable", "turn on captions", "open the settings"],
  topic: ["first diagram", "report", "west door", "display", "next release", "blue marker", "final section"],
  correction: ["the smaller connector", "the final paragraph", "the lower setting", "the blue marker", "the second diagram", "the older attachment"],
  event: ["checking the readings", "reviewing the diagram", "sending the archive copy", "printing the labels", "updating the device", "testing the new layout"],
});
const ASCII_KEYS = [...COMMON_PUNCTUATION.map(([cp])=>String.fromCodePoint(cp)).filter(ch=>ch!=="’"), ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,?!'’\"-_:;()/@#$%&+=[]{}<>\\|~` ", "\t", "\n", "\r"];
const MANIFEST_URL = "/semantic-lexicon/manifest.json";
const SHARD_CACHE = new Map();
let manifestPromise;
const encoder = new TextEncoder();
const NO_STORE = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

function page(title, body, status = 200) {
  return response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)} · IARC Relay</title><meta name="robots" content="noindex,nofollow,noarchive"><style>*{box-sizing:border-box}body{margin:0;background:#ffffff;color:#17263a;font:16px/1.45 system-ui,sans-serif}main{max-width:1040px;margin:auto;padding:18px}.top{display:grid;grid-template-columns:1fr 1fr;gap:1rem}.panel{border:1px solid #ccd6df;border-radius:8px;background:white;padding:14px;margin:.8rem 0}.draft{white-space:pre-wrap;overflow-wrap:anywhere;min-height:3.5rem;padding:10px;border:1px solid #ccd6df;background:#f8fafb}.notice,.hint{color:#536176;font-size:.88rem}.choices{display:flex;flex-wrap:wrap;gap:.4rem}.choices a,.control{display:inline-flex;min-height:40px;align-items:center;justify-content:center;padding:.42rem .65rem;border:1px solid #ccd6df;border-radius:5px;background:#fff;color:#2457a7;text-decoration:none}.choices a:hover,.control:hover{background:#eef3fb}.keys{display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:.3rem}.keys a{min-height:40px;display:grid;place-items:center;border:1px solid #ccd6df;border-radius:5px;background:white;color:#2457a7;text-decoration:none}.tools{display:flex;gap:.8rem;flex-wrap:wrap;margin:.6rem 0}.row{padding:.55rem 0;border-bottom:1px solid #ccd6df}.row:last-child{border:0}.row strong{margin-right:.5rem}.active{outline:2px solid #2457a7}.danger{color:#835700}@media(max-width:720px){main{padding:12px}.top{grid-template-columns:1fr}}</style></head><body><main>${body}</main></body></html>`, status, NO_STORE);
}

function frameOrientation(replyTo = "") {
  return `<p><a href="/">Return to Relay home</a> · <a href="/privacy">Privacy</a> · <a href="/participation-policy">Policy</a></p><details><summary>About this keyboard</summary><p>Hand-authored sentence structures with editable slots. Shortcuts are fixed replacements, not model predictions. Drafts are temporary and unpublished until review and publication. URLs may be logged; do not enter secrets. <a href="${escapeHtml(frameHome(replyTo))}">Start a new Frame draft</a>.</p></details><details><summary>Instructions</summary><p>Choose a frame, then select a sentence and slot to edit. Quick choices replace the selected slot; words append with a separator when needed; characters append literally. Browsing does not change the draft. Character actions and Backspace keep the exact lane open. Return to frame to review, undo or change a slot. Required slots must be filled before review. Publication is a separate action.</p></details>`;
}

function token(value) { return encodeCommonWordRouteToken(value); }
function readToken(value) {
  const decoded = decodeCommonWordRouteToken(value);
  if (!decoded || decoded.length !== 22) throw new TypeError("This Frame Keyboard link is malformed.");
  return decoded;
}
const frameHome = (replyTo = "") => `${PREFIX}/${replyTo ? `?${new URLSearchParams({ reply_to: replyTo })}` : ""}`;
function stateHref(stateId, params = {}) {
  const query = new URLSearchParams();
  if (params.frame !== undefined) query.set("frame", String(params.frame));
  if (params.slot) query.set("slot", params.slot);
  if (params.search) query.set("search", params.search);
  if (params.offset) query.set("offset", String(params.offset));
  if (params.unicode) query.set("unicode", params.unicode);
  return `${PREFIX}/state/${token(stateId)}${query.size ? `?${query}` : ""}`;
}
function displayChar(value) {
  return value === " " ? "Space" : value === "\t" ? "Tab" : value === "\n" ? "Line break" : value === "\r" ? "Return" : value;
}
function exactCharLink(value, href) { return `<a href="${escapeHtml(href)}" aria-label="Append ${escapeHtml(displayChar(value))}">${escapeHtml(displayChar(value))}</a>`; }
function pathUrl(pathname, values = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== "") query.set(key, String(value));
  return `${PREFIX}${pathname}${query.size ? `?${query}` : ""}`;
}

function stateDocument(state) {
  if (state.operation === "root") return { version: 1, catalogue: "frame-catalogue-0.1.0", frames: [] };
  if (state.operation !== "pick") throw new Error("Frame history contains an unsupported text action.");
  let value;
  try { value = JSON.parse(state.value); } catch { throw new Error("Frame state could not be read safely."); }
  if (value?.v !== "frame-state-1") throw new Error("This state does not belong to Frame Keyboard.");
  return validateFrameDocument(value.document);
}

function selectedSlot(document, frameIndex, slotId) {
  const frame = document.frames[frameIndex];
  if (!frame) return null;
  if (slotId && Object.hasOwn(frame.slots, slotId)) return slotId;
  return frame.active_slot || Object.keys(frame.slots)[0] || null;
}

async function makeActionLink(env, state, operation, label, params = {}, className = "") {
  const operationJson = JSON.stringify(operation);
  const childId = await signCommonWordRoute(env, "frame-child-state", state.state_id, operationJson);
  const signature = await signCommonWordRoute(env, "frame-action", state.state_id, childId, operationJson);
  const href = pathUrl(`/action/${token(state.state_id)}/${token(childId)}`, { op: operationJson, cap: signature });
  return `<a${className ? ` class="${className}"` : ""} rel="nofollow" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
}

async function loadSlotWords(env, request, prefix) {
  if (!env.ASSETS) throw new Error("The pinned word list is unavailable. Use exact character composition.");
  if (!manifestPromise) manifestPromise = env.ASSETS.fetch(new Request(new URL(MANIFEST_URL, request.url))).then(async (response) => {
    if (!response.ok) throw new Error("The pinned word-list index is unavailable.");
    const manifest = await response.json();
    if (manifest.lexicon_version !== "relay-esdb-1e5b7d3a-70-v1" || !Array.isArray(manifest.shards)) throw new Error("The pinned word-list index is invalid.");
    return manifest;
  }).catch((error) => { manifestPromise = undefined; throw error; });
  const manifest = await manifestPromise;
  const shards = manifest.shards.filter((shard) => !prefix || shard.prefix.normalize("NFC").toLowerCase().startsWith(prefix) || prefix.startsWith(shard.prefix.normalize("NFC").toLowerCase()));
  const found = [];
  for (const shard of shards) {
    let rows = SHARD_CACHE.get(shard.path);
    if (!rows) {
      const response = await env.ASSETS.fetch(new Request(new URL(`/semantic-lexicon/${shard.path}`, request.url)));
      if (!response.ok) throw new Error("A pinned word-list section could not be loaded.");
      const source = await response.text();
      const canonical = source.endsWith("\n") ? source.slice(0, -1) : source;
      const bytes = encoder.encode(canonical);
      const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
      rows = JSON.parse(canonical);
      if (bytes.byteLength !== shard.bytes || hash !== shard.sha256 || !Array.isArray(rows) || rows.length !== shard.count) throw new Error("A pinned word-list section failed its integrity check.");
      SHARD_CACHE.set(shard.path, rows);
      if (SHARD_CACHE.size > 12) SHARD_CACHE.delete(SHARD_CACHE.keys().next().value);
    }
    for (const word of rows) if (word.normalize("NFC").toLowerCase().startsWith(prefix)) found.push(word);
  }
  return [...new Set(found)].sort((a, b) => a.localeCompare(b, "en"));
}

async function createDocumentChild(env, state, oldDraft, document, operation, action = "Frame change") {
  validateFrameDocument(document);
  const text = renderFrameDocument(document, { placeholders: false });
  const payload = JSON.stringify({ v: "frame-state-1", action, document });
  const childId = await signCommonWordRoute(env, "frame-child-state", state.state_id, JSON.stringify(operation));
  return saveTextChild(env, state, "pick", payload, childId, oldDraft, oldDraft, text);
}

function startPage(env, replyTo) {
  return Promise.all(FRAME_CATALOGUE.map(async (frame) => {
    const sessionId = crypto.randomUUID();
    const expiresAt = Date.now() + START_TTL_MS;
  const payload = JSON.stringify({ session_id: sessionId, reply_to: replyTo || null, frame_id: frame.id, catalogue: FRAME_CATALOGUE_VERSION, expires_at: expiresAt });
    const signature = await signCommonWordRoute(env, "frame-start-v1", payload);
    const href = pathUrl(`/start/${sessionId}`, { payload, cap: signature });
    return `<a rel="nofollow" href="${escapeHtml(href)}">${escapeHtml(frame.group)} · ${escapeHtml(frame.label)}</a>`;
  })).then((links) => {
    const grouped = new Map();
    FRAME_CATALOGUE.forEach((frame, i) => { if (!grouped.has(frame.group)) grouped.set(frame.group, []); grouped.get(frame.group).push(links[i]); });
    const groups = [...grouped].map(([label, items]) => `<section><h3>${escapeHtml(label)}</h3><div class="choices">${items.join("")}</div></section>`).join("");
    return page("Frame Keyboard", `<header class="top"><div><h1>Frame Keyboard</h1>${frameOrientation(replyTo)}</div><section><h2>Choose a sentence frame</h2><p class="notice">Frames are grouped by communication purpose; select any structure directly. “Your own sentence” keeps the full character and word routes available.</p>${groups}</section></header>${replyTo ? `<p>Replying to <code>${escapeHtml(replyTo)}</code>.</p>` : ""}<p class="notice">${FRAME_CATALOGUE.length} authored frames · link-only · exact character route included · review and publication remain separate.</p>`);
  });
}

function slotRows(stateId, document, selectedFrame, selected) {
  const block = document.frames[selectedFrame];
  if (!block) return "";
  return Object.entries(block.slots).map(([id, slot]) => `<div class="row"><strong>${escapeHtml(slot.label)}:</strong> ${slot.value ? `<code>${escapeHtml(slot.value)}</code>` : "<em>not filled</em>"} ${selected === id ? "· editing" : `<a href="${escapeHtml(stateHref(stateId, { frame: selectedFrame, slot: id }))}" aria-label="Edit slot ${escapeHtml(slot.label)} in sentence ${selectedFrame + 1}">Edit slot</a>`}</div>`).join("");
}

async function slotSuggestions(request,env,state,document,fi,si,characters=false,range='') {
  const block=document.frames[fi],value=block.slots[si].value;
  let before='';for(const part of block.definition.segments){if(part.slot===si)break;before+=part.text??block.slots[part.slot].value;}
  const context=before+value;
  const partial=value.match(/[\p{L}\p{M}\p{N}'’\-]+$/u)?.[0]||'';
  const links=[];const seen=new Set();
  try {
    for(const mode of partial?['complete','next']:['next']) {
      const past=mode==='next'&&context&&!/\s$/u.test(context)?context+' ':context;
      const rows=await predictRanked(env,request,past,12);
      let modeCount=0;
      for(const row of rows) {
        const changed=frameWordAddition(value,row.text,mode,context);
        if(changed===null||changed===value||seen.has(changed))continue;
        try { fillFrameSlot(document,si,changed,fi); } catch { continue; }
        seen.add(changed);
        const label=mode==='complete'?`Complete current word: ${partial+changed.slice(value.length)}`:`Add next word: ${changed.slice(value.length).trimStart()}`;
        const op={type:'replace',frame:fi,slot:si,value:changed,...(characters?{return_view:'characters',unicode:range}:{})};
        links.push(await makeActionLink(env,state,op,label));
        if(++modeCount>=6)break;
      }
    }
  }catch{return '<p class="hint">Word suggestions unavailable; exact characters and word browsing remain available.</p>';}
  return `<section><h3>Word suggestions</h3><p class="hint">Complete preserves the typed prefix and adds its remaining letters. Add next word preserves the slot and inserts a separating space when needed. Neither publishes.</p><div class="choices">${links.join('')||'No suggestions; use exact characters or Browse words.'}</div></section>`;
}

async function renderState(request, env, state, extra = {}) {
  const draft = await loadDraft(env, state);
  const document = stateDocument(state);
  const requestedFrame = extra.frame == null ? document.frames.length - 1 : Number(extra.frame);
  if (document.frames.length && (!Number.isSafeInteger(requestedFrame) || requestedFrame < 0 || requestedFrame >= document.frames.length)) throw new TypeError("Choose a frame shown in this draft.");
  const frameIndex = Math.max(0, requestedFrame);
  const frame = document.frames[frameIndex];
  const slotId = frame ? selectedSlot(document, frameIndex, extra.slot || "") : "";
  const preview = document.frames.length ? renderFrameDocument(document) : "Choose a sentence frame to start.";
  const complete = frameIsComplete(document);
  const bytes = encoder.encode(draft).length;
  const stateToken = token(state.state_id);
  const undo = state.parent_state_id ? `<a class="control" href="${escapeHtml(stateHref(state.parent_state_id))}">Undo last change</a>` : "";
  let content = `<header class="top"><div><h1>Frame Keyboard</h1>${frameOrientation(state.reply_to || "")}</div><section><h2>Current draft · ${bytes} / ${MAX_BODY_BYTES} UTF-8 bytes</h2><pre class="draft">${escapeHtml(draft || "(empty)")}</pre><p class="notice">${state.reply_to ? `Reply to ${escapeHtml(state.reply_to)} · ` : ""}This frame preview may include unfinished slot markers; only the text above is stored.</p></section></header>`;
  if (document.frames.length) {
    const sentences = document.frames.length > 1 ? `<nav class="tools" aria-label="Sentence navigation">${document.frames.map((block, index) => index === frameIndex ? `<span aria-current="true">Editing sentence ${index + 1}</span>` : `<a href="${escapeHtml(stateHref(state.state_id, { frame: index }))}">Edit sentence ${index + 1} · ${escapeHtml(block.definition.label)}</a>`).join("")}</nav>` : "";
    content += `${sentences}<section class="panel"><h2>Frame preview</h2><pre class="draft">${escapeHtml(preview)}</pre><p class="hint">Select a slot to edit it. Required slots must be filled before review.</p><div>${slotRows(state.state_id, document, frameIndex, slotId)}</div></section>`;
    if (frame && slotId) {
      const value = frame.slots[slotId].value;
      const shortcuts = (SLOT_CHOICES[slotId] || []).map((choice) => makeActionLink(env, state, { type: "replace", frame: frameIndex, slot: slotId, value: choice }, choice, { frame: frameIndex, slot: slotId }));
      const quick = await Promise.all(shortcuts);
      const suggestions = await slotSuggestions(request,env,state,document,frameIndex,slotId);
      const wordUrl = pathUrl(`/words/${stateToken}`, { frame: frameIndex, slot: slotId });
      const charsUrl = pathUrl(`/characters/${stateToken}`, { frame: frameIndex, slot: slotId });
      const backspace = value ? await makeActionLink(env, state, { type: "backspace", frame: frameIndex, slot: slotId }, "Backspace one character") : "";
      content += `<section class="panel"><h2>Editing ${escapeHtml(frame.slots[slotId].label)}</h2><pre class="draft">${escapeHtml(value || "(empty)")}</pre><div class="tools"><a class="control" href="${escapeHtml(wordUrl)}">Browse words</a><a class="control" href="${escapeHtml(charsUrl)}">Compose exact text</a>${backspace}</div>${quick.length ? `<h3>Quick slot choices</h3><div class="choices">${quick.join("")}</div>` : ""}${suggestions}</section>`;
    }
    const replacements = await Promise.all(FRAME_CATALOGUE.map(async (candidate) => makeActionLink(env, state, { type: "change-frame", frame_id: candidate.id, catalogue: FRAME_CATALOGUE_VERSION }, `${candidate.group} · ${candidate.label}`)));
    content += `<details class="panel"><summary>Change current sentence frame</summary><p class="hint">This replaces the last frame as an undoable branch. Earlier complete sentences stay in the draft.</p><div class="choices">${replacements.join("")}</div></details>`;
    if (!complete) {
      const missing = document.frames.flatMap((item, index) => Object.entries(item.slots).filter(([, slot]) => !slot.value).map(([slot]) => ({ index, slot })));
      content += `<p class="notice danger">Fill ${missing.length} required slot${missing.length === 1 ? "" : "s"} before review.</p>`;
    } else {
      const newFrameLinks = FRAME_CATALOGUE.map(async (candidate) => {
        const a = await makeActionLink(env, state, { type: "new-frame", frame_id: candidate.id, catalogue: FRAME_CATALOGUE_VERSION }, `Add: ${candidate.label}`);
        return `<span>${a}</span>`;
      });
      content += `<section class="panel"><h2>Add another sentence</h2><div class="choices">${(await Promise.all(newFrameLinks)).join("")}</div></section>`;
    }
  } else {
    content += `<section class="panel"><h2>Choose a sentence frame</h2><div class="choices">${(await Promise.all(FRAME_CATALOGUE.map(async (item) => makeActionLink(env, state, { type: "new-frame", frame_id: item.id, catalogue: FRAME_CATALOGUE_VERSION }, `${item.group} · ${item.label}`)))).join("")}</div></section>`;
  }
  content += `<nav class="tools">${undo}${complete && draft ? `<a class="control" href="${escapeHtml(pathUrl(`/review/${stateToken}`))}">Review message</a>` : ""}${complete && draft && document.frames.some((block) => block.frame_id !== "free-text") ? await makeActionLink(env, state, { type: "convert" }, "Convert to ordinary text") : ""}<a class="control" href="${escapeHtml(frameHome(state.reply_to || ""))}">Start over</a></nav>`;
  return page("Frame Keyboard", content);
}

async function renderWords(request, env, state, params) {
  const draft = await loadDraft(env, state);
  const doc = stateDocument(state);
  const fi = params.frame === undefined ? doc.frames.length - 1 : Number(params.frame);
  if (!Number.isSafeInteger(fi) || fi < 0 || fi >= doc.frames.length) throw new TypeError("Choose a frame shown in this draft.");
  const si = params.slot || "";
  const block = doc.frames[fi];
  if (!block || !Object.hasOwn(block.slots, si)) throw new TypeError("Choose a slot before browsing words.");
  const prefix = params.prefix || "";
  if (prefix.length > 24 || /[^\p{L}\p{M}\p{N}'’\-]/u.test(prefix)) throw new TypeError("Use a word-search prefix of up to 24 letters or numbers.");
  const words = prefix ? await loadSlotWords(env, request, prefix.normalize("NFC").toLowerCase()) : [];
  const offset = Math.max(0, Number(params.offset || 0));
  if (!Number.isSafeInteger(offset) || offset % 24 !== 0) throw new TypeError("The word-list page is invalid.");
  const visible = words.slice(offset, offset + 24);
  const q = (next, nextOffset = 0) => pathUrl(`/words/${token(state.state_id)}`, { frame: fi, slot: si, prefix: next, offset: nextOffset || "" });
  let choices;
  if (!prefix) choices = [..."abcdefghijklmnopqrstuvwxyz"].map((letter) => `<a href="${escapeHtml(q(letter))}">${letter.toUpperCase()}</a>`).join("");
  else {
    const children = [...new Set(words.map((word) => [...word.normalize("NFC").toLowerCase()].slice(prefix.length, prefix.length + 1).join("")).filter(Boolean))].sort();
    const links = await Promise.all(visible.map((value) => makeActionLink(env, state, { type: "append-word", frame: fi, slot: si, value }, value, { frame: fi, slot: si })));
    choices = `<h3>Continue the prefix</h3><div class="choices">${children.map((letter) => `<a href="${escapeHtml(q(prefix + letter))}">${escapeHtml(letter)}</a>`).join("")}</div><h3>Matching words</h3><div class="choices">${links.join("")}</div><p>${offset ? `<a href="${escapeHtml(q(prefix, offset - 24))}">Previous words</a> · ` : ""}${offset + 24 < words.length ? `<a href="${escapeHtml(q(prefix, offset + 24))}">Next words</a>` : ""}</p>`;
  }
  return page("Frame Keyboard word search", `<h1>Browse words for ${escapeHtml(block.slots[si].label)}</h1>${frameOrientation(state.reply_to || "")}<p class="notice">Pinned spelling list. Prefix search does not change the draft. Missing words can be composed exactly.</p><p class="draft">${escapeHtml(draft || "(empty)")}</p><p><a href="${escapeHtml(stateHref(state.state_id, { frame: fi, slot: si }))}">Return to frame</a></p>${prefix ? `<p>Prefix <strong>${escapeHtml(prefix)}</strong> · ${words.length.toLocaleString("en-US")} matches</p>` : "<h2>Choose a starting letter</h2>"}${choices}`);
}

async function renderCharacters(request, state, extra) {
  const document = stateDocument(state);
  const fi = extra.frame == null ? document.frames.length - 1 : Number(extra.frame);
  if (!Number.isSafeInteger(fi) || fi < 0 || fi >= document.frames.length) throw new TypeError("Choose a frame shown in this draft.");
  const si = extra.slot || "";
  const block = document.frames[fi];
  if (!block || !Object.hasOwn(block.slots, si)) throw new TypeError("Choose a slot before composing characters.");
  const range = extra.unicode || "";
  const href = (value) => makeActionLink(state.env, state, { type: "append-char", frame: fi, slot: si, value, return_view: "characters", unicode: range }, displayChar(value), { frame: fi, slot: si });
  const backspace = block.slots[si].value ? await makeActionLink(state.env, state, { type: "backspace", frame: fi, slot: si, return_view: "characters", unicode: range }, "Backspace", { frame: fi, slot: si }) : "";
  const suggestions = !range ? await slotSuggestions(request,state.env,state,document,fi,si,true,range) : '';
  const ascii = !range ? (await Promise.all(ASCII_KEYS.map(href))).join("") : "";
  let unicode = "";
  if (!range) unicode = unicodeChoices("").map((prefix) => `<a href="${escapeHtml(pathUrl(`/characters/${token(state.state_id)}`, { frame: fi, slot: si, unicode: prefix }))}">${prefix.toUpperCase()}…</a>`).join("");
  else {
    const choices = unicodeChoices(range);
    unicode = choices.map((value) => Number.isInteger(value) ? href(String.fromCodePoint(value)) : `<a href="${escapeHtml(pathUrl(`/characters/${token(state.state_id)}`, { frame: fi, slot: si, unicode: value }))}">${escapeHtml(value.toUpperCase())}…</a>`);
    unicode = (await Promise.all(unicode)).join("");
  }
  return page("Frame Keyboard exact characters", `<h1>Exact characters for ${escapeHtml(block.slots[si].label)}</h1>${frameOrientation(state.reply_to || "")}<p class="notice">Each selected character is appended literally to this slot. This is a complete permitted-Unicode browser. Nothing is published here.</p><pre class="draft">${escapeHtml(block.slots[si].value || "(empty)")}</pre><nav class="tools">${backspace}<a href="${escapeHtml(stateHref(state.state_id, { frame: fi, slot: si }))}">Return to frame</a>${range ? `<a href="${escapeHtml(pathUrl(`/characters/${token(state.state_id)}`, { frame: fi, slot: si, unicode: range.length === 2 ? "" : range.slice(0, -1) }))}">Parent range</a>` : ""}</nav>${suggestions}${!range ? `<h2>ASCII, punctuation, whitespace</h2><div class="keys">${ascii}</div><h2>Unicode ranges</h2><div class="choices">${unicode}</div>` : `<h2>Unicode ${escapeHtml(range.toUpperCase())}</h2><div class="choices">${unicode}</div>`}`);
}

export function isFrameKeyboardPath(pathname) { return pathname === PREFIX || pathname.startsWith(`${PREFIX}/`); }
export function isFrameKeyboardMutationPath(pathname) { return /^\/predictive-keyboard\/html\/frame-keyboard\/(?:start|action|review|discard)\//u.test(pathname); }
export function isFrameKeyboardStartPath(pathname) { return /^\/predictive-keyboard\/html\/frame-keyboard\/start\//u.test(pathname); }

export async function handleFrameKeyboard(request, env, url, createPublishDraft, discardPublishDraft, retentionMs = 90 * 86_400_000) {
  if (url.href.length > 8_000) return page("Frame Keyboard", `<h1>Link too long</h1><p>Frame Keyboard links are limited to 8,000 characters.</p><a href="${PREFIX}/">Start over</a>`, 414);
  const path = url.pathname.replace(/\/$/u, "") || "/";
  try {
    if (path === PREFIX) {
      const replyTo = url.searchParams.get("reply_to") || "";
      if (url.searchParams.size > (replyTo ? 1 : 0) || url.searchParams.getAll("reply_to").length > 1 || (replyTo && !/^IARC-M-[0-9a-f-]{36}$/iu.test(replyTo))) throw new TypeError("Reply target is invalid.");
      if (replyTo && !await retainedReply(env, replyTo, Date.now() - retentionMs)) return page("Reply unavailable", `<h1>Reply unavailable</h1><p>No retained message has that identifier.</p><a href="/reply/${escapeHtml(replyTo)}">Choose another reply route</a>`, 404);
      return await startPage(env, replyTo);
    }
    const startMatch = path.match(/^\/predictive-keyboard\/html\/frame-keyboard\/start\/([0-9a-f-]{36})$/iu);
    if (startMatch) {
      const payload = url.searchParams.get("payload") || "";
      const signature = url.searchParams.get("cap") || "";
      if (url.searchParams.size !== 2 || url.searchParams.getAll("payload").length !== 1 || url.searchParams.getAll("cap").length !== 1 || await signCommonWordRoute(env, "frame-start-v1", payload) !== signature) throw new TypeError("Start link signature is invalid.");
      let start; try { start = JSON.parse(payload); } catch { throw new TypeError("Start link is invalid."); }
      if (start.session_id !== startMatch[1] || start.expires_at <= Date.now() || start.catalogue !== FRAME_CATALOGUE_VERSION || !FRAME_CATALOGUE.some((frame) => frame.id === start.frame_id)) return page("Start link expired", `<h1>Start link expired</h1><a href="${escapeHtml(frameHome(start.reply_to || ""))}">Choose a new frame</a>`, 410);
      const root = await createSession(env, start.session_id, start.reply_to, signCommonWordRoute);
      const operation = { type: "new-frame", frame_id: start.frame_id, catalogue: FRAME_CATALOGUE_VERSION };
      const state = await createDocumentChild(env, root, "", createFrameDocument(start.frame_id), operation, "Start frame");
      return await renderState(request, env, state);
    }
    const stateMatch = path.match(/^\/predictive-keyboard\/html\/frame-keyboard\/state\/([^/]+)$/u);
    if (stateMatch) {
      const state = await findState(env, readToken(stateMatch[1]));
      if ([...url.searchParams.keys()].some((key) => !["frame", "slot"].includes(key)) || ["frame", "slot"].some((key) => url.searchParams.getAll(key).length > 1)) throw new TypeError("Draft link has an unknown option.");
      await loadDraft(env, state);
      return await renderState(request, env, state, { frame: url.searchParams.get("frame"), slot: url.searchParams.get("slot") });
    }
    const wordsMatch = path.match(/^\/predictive-keyboard\/html\/frame-keyboard\/words\/([^/]+)$/u);
    if (wordsMatch) {
      const state = await findState(env, readToken(wordsMatch[1]));
      const allowed = new Set(["frame", "slot", "prefix", "offset"]);
      if ([...url.searchParams.keys()].some((key) => !allowed.has(key)) || [...allowed].some((key) => url.searchParams.getAll(key).length > 1)) throw new TypeError("Word-search link has an unknown option.");
      return await renderWords(request, env, state, Object.fromEntries(url.searchParams));
    }
    const charsMatch = path.match(/^\/predictive-keyboard\/html\/frame-keyboard\/characters\/([^/]+)$/u);
    if (charsMatch) {
      const state = await findState(env, readToken(charsMatch[1]));
      const allowed = new Set(["frame", "slot", "unicode"]);
      if ([...url.searchParams.keys()].some((key) => !allowed.has(key)) || [...allowed].some((key) => url.searchParams.getAll(key).length > 1)) throw new TypeError("Character link has an unknown option.");
      return await renderCharacters(request, { ...state, env }, Object.fromEntries(url.searchParams));
    }
    const actionMatch = path.match(/^\/predictive-keyboard\/html\/frame-keyboard\/action\/([^/]+)\/([^/]+)$/u);
    if (actionMatch) {
      const state = await findState(env, readToken(actionMatch[1]));
      const childId = readToken(actionMatch[2]);
      const raw = url.searchParams.get("op") || "";
      const cap = url.searchParams.get("cap") || "";
      const op = JSON.parse(raw);
      if (url.searchParams.size !== 2 || url.searchParams.getAll("op").length !== 1 || url.searchParams.getAll("cap").length !== 1 || await signCommonWordRoute(env, "frame-action", state.state_id, childId, raw) !== cap || await signCommonWordRoute(env, "frame-child-state", state.state_id, raw) !== childId) throw new TypeError("Frame action signature is invalid.");
      if (op.return_view !== undefined) {
        if (op.return_view !== "characters" || !["append-char", "backspace", "replace"].includes(op.type) || typeof op.unicode !== "string") throw new TypeError("Frame action return view is invalid.");
        unicodeChoices(op.unicode);
      }
      const oldDraft = await loadDraft(env, state);
      const doc = stateDocument(state);
      let next;
      if (["new-frame", "change-frame"].includes(op.type) && op.catalogue !== FRAME_CATALOGUE_VERSION) throw new Error("This frame catalogue changed. Start a new Frame draft.");
      if (op.type === "new-frame" && typeof op.frame_id === "string") next = appendFrame(doc, op.frame_id);
      else if (op.type === "change-frame" && typeof op.frame_id === "string") next = changeLastFrame(doc, op.frame_id);
      else if (op.type === "convert") next = convertFrameToPlainText(doc);
      else if (op.type === "replace" && Number.isSafeInteger(op.frame) && typeof op.slot === "string" && typeof op.value === "string") next = fillFrameSlot(doc, op.slot, op.value, op.frame);
      else if (op.type === "append-word" && Number.isSafeInteger(op.frame) && typeof op.slot === "string" && typeof op.value === "string") next = appendFrameSlotText(doc, op.slot, op.value, op.frame, { word: true });
      else if (op.type === "append-char" && Number.isSafeInteger(op.frame) && typeof op.slot === "string" && [...op.value].length === 1) next = appendFrameSlotText(doc, op.slot, op.value, op.frame);
      else if (op.type === "backspace" && Number.isSafeInteger(op.frame) && typeof op.slot === "string") next = backspaceFrameSlot(doc, op.slot, op.frame);
      else throw new TypeError("Frame action is not supported.");
      const state2 = await createDocumentChild(env, state, oldDraft, next.document, op, "Frame change");
      if (op.return_view === "characters") return await renderCharacters(request, { ...state2, env }, { frame: op.frame, slot: op.slot, unicode: op.unicode });
      return await renderState(request, env, state2, { frame: op.frame, slot: op.slot });
    }
    const reviewMatch = path.match(/^\/predictive-keyboard\/html\/frame-keyboard\/review\/([^/]+)$/u);
    if (reviewMatch) {
      if (url.search) throw new TypeError("Review links do not accept query options.");
      const state = await findState(env, readToken(reviewMatch[1]));
      const document = stateDocument(state);
      if (!frameIsComplete(document)) throw new Error("Fill every required frame slot before reviewing this message.");
      return await reviewTextDraft(env, request, state.state_id, "frame", { PREFIX, word: token, escapeHtml, page, createPublishDraft });
    }
    const discardMatch = path.match(/^\/predictive-keyboard\/html\/frame-keyboard\/discard\/([^/]+)$/u);
    if (discardMatch) {
      const state = await findState(env, readToken(discardMatch[1]));
      if (url.searchParams.getAll("cap").length !== 1 || url.searchParams.size !== (url.searchParams.has("view") ? 2 : 1) || (url.searchParams.has("view") && (url.searchParams.getAll("view").length !== 1 || url.searchParams.get("view") !== "frame"))) throw new TypeError("The private draft capability is invalid.");
      const capability = decodeCommonWordRouteToken(url.searchParams.get("cap")) || url.searchParams.get("cap");
      if (!/^[A-Za-z0-9_-]{43}$/u.test(capability) || typeof discardPublishDraft !== "function") throw new TypeError("The private draft capability is invalid.");
      const discarded = await discardPublishDraft(request, capability, state.session_id);
      if (discarded instanceof Response) return discarded;
      if (!discarded?.discarded) throw new Error(discarded?.detail || "The private draft could not be discarded.");
      return page("Review cancelled", `<h1>Review cancelled</h1><p>The publication review was cancelled and its publish link is invalid. Your composition is preserved. Nothing was published.</p><p><a href="${escapeHtml(stateHref(state.state_id))}">Edit message</a></p>`);
    }
    return page("Frame Keyboard unavailable", `<h1>Frame Keyboard link unavailable</h1><p>That page is not part of the supplied Frame Keyboard controls.</p><a href="${PREFIX}/">Start a new Frame draft</a>`, 404);
  } catch (error) {
    return page("Frame Keyboard unavailable", `<h1>Frame Keyboard unavailable</h1><p>${escapeHtml(error.message || "The requested Frame action could not be completed.")}</p><p><a href="${escapeHtml(frameHome())}">Start a new Frame draft</a></p>`, keyboardErrorStatus(error.message || ""));
  }
}
