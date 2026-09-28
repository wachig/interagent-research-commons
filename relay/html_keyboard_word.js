import { decodeCommonWordRouteToken, encodeCommonWordRouteToken, signCommonWordRoute } from "./token_composer.js";
import { escapeHtml, predict, response } from "./html_keyboard.js";

const PREFIX = "/predictive-keyboard/html/word-links";
const MAX_BODY_BYTES = 1_200;
const SESSION_TTL_MS = 30 * 60 * 1_000;
const START_TTL_MS = 15 * 60 * 1_000;
const MAX_SESSIONS = 32;
const MAX_STATES_PER_SESSION = 2_400;
const SNAPSHOT_INTERVAL = 16;
const NO_STORE = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
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

function actionHref(state, action, argument = "-", layout = "letters") {
  return signCommonWordRoute(state.env, "keyboard-action", state.state_id, action, argument).then((cap) =>
    `${PREFIX}/step/${word(state.state_id)}/${action}/${encodeURIComponent(argument)}/${word(cap)}${layout === "symbols" ? "?layout=symbols" : ""}`);
}

function stateHref(stateId, layout = "letters", shifted = false) {
  const query = new URLSearchParams();
  if (layout !== "letters") query.set("layout", layout);
  if (shifted) query.set("shift", "1");
  return `${PREFIX}/state/${word(stateId)}${query.size ? `?${query}` : ""}`;
}

function keyArgument(value) {
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

async function makeChild(env, request, parent, action, argument, childId) {
  const parentDraft = await loadDraft(env, parent);
  let removed = "";
  let added = "";
  if (action === "key") {
    added = keyArgument(argument);
    if (added === undefined) throw new Error("Unknown keyboard key.");
    if (added === " " && /\s$/u.test(parentDraft)) added = "";
  } else if (action === "pick") {
    const available = await predict(env, request, parentDraft);
    if (!available.some((candidate) => candidate.toLocaleLowerCase("en-US") === argument.toLocaleLowerCase("en-US"))) throw new Error("That prediction is no longer in the current top ten. Start from the current prediction links.");
    const match = parentDraft.match(/[\p{L}\p{N}'’\-]*$/u);
    removed = match?.[0] || "";
    const separator = !removed && parentDraft.length && !/\s$/u.test(parentDraft) ? " " : "";
    added = `${separator}${argument} `;
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
  await env.RELAY_DB.prepare("INSERT OR IGNORE INTO html_keyboard_states (state_id, session_id, parent_state_id, operation, value, removed_text, added_text, snapshot, depth, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM html_keyboard_sessions WHERE session_id = ? AND expires_at > ?) AND EXISTS (SELECT 1 FROM html_keyboard_states WHERE state_id = ? AND session_id = ?) AND (SELECT COUNT(*) FROM html_keyboard_states WHERE session_id = ?) < ?")
    .bind(childId, parent.session_id, parent.state_id, action, argument, removed, added, snapshot, depth, now, parent.session_id, now, parent.state_id, parent.session_id, parent.session_id, MAX_STATES_PER_SESSION).run();
  const childExists = await env.RELAY_DB.prepare("SELECT state_id FROM html_keyboard_states WHERE state_id = ? AND session_id = ?").bind(childId, parent.session_id).first();
  if (!childExists) {
    const active = await env.RELAY_DB.prepare("SELECT expires_at FROM html_keyboard_sessions WHERE session_id = ?").bind(parent.session_id).first();
    if (!active || active.expires_at <= Date.now()) throw new Error("This keyboard session expired or is unavailable. Start a new draft.");
    throw new Error("Keyboard session state limit reached (2,400 saved steps). Start a new draft.");
  }
  const child = await findState(env, childId);
  if (child.session_id !== parent.session_id) throw new Error("This branch belongs to another keyboard session.");
  if (child.parent_state_id !== parent.state_id || child.operation !== action || child.value !== argument) throw new Error("This link does not match the saved draft branch.");
  return child;
}

async function renderKeyboard(request, env, state, url, startHref = null) {
  const draft = await loadDraft(env, state);
  const modeParams = queryParams(url, new Set(["layout", "shift"]));
  const layout = modeParams.get("layout") || "letters";
  const shifted = modeParams.get("shift") === "1";
  if (modeParams.has("shift") && !new Set(["0", "1"]).has(modeParams.get("shift"))) throw new Error("Keyboard layout link is invalid.");
  if (!new Set(["letters", "symbols"]).has(layout) || (shifted && layout !== "letters")) throw new Error("Keyboard layout link is invalid.");
  const predictions = await predict(env, request, draft);
  const makeLink = (action, argument) => actionHref({ ...state, env }, action, argument, layout);
  const predictionLinks = await Promise.all(predictions.map(async (candidate) => {
    const shown = shifted ? candidate.charAt(0).toLocaleUpperCase("en-US") + candidate.slice(1) : candidate;
    return `<a href="${escapeHtml(await makeLink("pick", shown))}" aria-label="Use prediction ${escapeHtml(shown)}">${escapeHtml(shown)}</a>`;
  }));
  const key = async (value, label = value, extraClass = "") => `<a class="key ${extraClass}" href="${escapeHtml(await makeLink("key", value))}" aria-label="Add ${escapeHtml(label)}">${escapeHtml(label)}</a>`;
  const mode = (label, nextLayout, nextShifted = false, extraClass = "", accessible = label) => `<a class="key ${extraClass}" href="${escapeHtml(stateHref(state.state_id, nextLayout, nextShifted))}" aria-label="${escapeHtml(accessible)}">${escapeHtml(label)}</a>`;
  const letters = `<div class="keyrow">${(await Promise.all("qwertyuiop".split("").map((letter) => key(shifted ? letter.toUpperCase() : letter, shifted ? `Uppercase ${letter}` : letter)))).join("")}</div><div class="keyrow indented">${(await Promise.all("asdfghjkl".split("").map((letter) => key(shifted ? letter.toUpperCase() : letter, shifted ? `Uppercase ${letter}` : letter)))).join("")}</div><div class="keyrow third">${mode("⇧", "letters", !shifted, "wide", shifted ? "Turn shift off" : "Turn shift on")} ${(await Promise.all("zxcvbnm".split("").map((letter) => key(shifted ? letter.toUpperCase() : letter, shifted ? `Uppercase ${letter}` : letter)))).join("")} ${state.parent_state_id ? `<a class="key wide" href="${escapeHtml(stateHref(state.parent_state_id, layout, shifted))}" aria-label="Remove last addition">⌫</a>` : `<span class="key wide spacer" aria-hidden="true"></span>`}</div><div class="keyrow bottom">${mode("?123", "symbols", false, "wide")} ${await key("comma", ",")} ${await key("space", "Space", "space")} ${await key("period", ".")} ${await key("question", "?", "wide")}</div>`;
  const symbols = `<div class="keyrow">${(await Promise.all("1234567890".split("").map((value) => key(value)))).join("")}</div><div class="keyrow symbols">${(await Promise.all(["@", "#", "$", "%", "&", "-", "*", "+", "("].map((value) => key(value)))).join("")}</div><div class="keyrow symbols">${(await Promise.all([" )", "_", "!", "?", "'", ":", ";", '"', "/"].map((value) => key(value.trim())))).join("")} ${state.parent_state_id ? `<a class="key" href="${escapeHtml(stateHref(state.parent_state_id, layout, shifted))}" aria-label="Remove last addition">⌫</a>` : ""}</div><div class="keyrow bottom">${mode("ABC", "letters", false, "wide")} ${await key("comma", ",")} ${await key("space", "Space", "space")} ${await key("period", ".")} ${await key("enter", "↵", "wide")}</div>`;
  const clearHref = draft ? await makeLink("clear", "-") : "";
  const reviewHref = draft ? `${PREFIX}/review/${word(state.state_id)}` : "";
  const reply = state.reply_to ? `<p class="notice">Reply to ${escapeHtml(state.reply_to)}</p>` : "";
  const start = startHref ? `<p><a class="primary" rel="nofollow" href="${escapeHtml(startHref)}">Start a temporary draft</a></p>` : "";
  const undoHref = state.parent_state_id ? stateHref(state.parent_state_id, layout, shifted) : "";
  const controls = `${undoHref ? `<a href="${escapeHtml(undoHref)}">undo</a>` : ""}${clearHref ? `<a href="${escapeHtml(clearHref)}">clear</a>` : ""}${reviewHref ? `<a rel="nofollow" href="${escapeHtml(reviewHref)}">review</a>` : ""}`;
  const body = `<h1>HTML keyboard · word links</h1><p class="notice">Keyboard links use readable word codes. Each choice saves a temporary draft step at Relay for up to 30 minutes. Steps are deleted after publication or expiry. Links are not encrypted; your environment or hosting provider may observe them. Never enter secrets. <a href="/privacy">Privacy</a> · <a href="/participation-policy">Policy</a> · <a href="/predictive-keyboard/html/">Original HTML keyboard</a></p>${start}${reply}<section><h2>Draft</h2><pre class="draft">${escapeHtml(draft) || " "}</pre></section><section><h2>Predictions</h2><nav class="choices" aria-label="Top word predictions">${predictionLinks.join("") || "<span>no predictions</span>"}</nav></section><section><h2>${layout === "symbols" ? "Symbols" : "Letters"}</h2><nav class="key-grid" aria-label="${layout === "symbols" ? "Symbols" : "Letters"} keyboard">${layout === "symbols" ? symbols : letters}</nav></section><nav class="controls" aria-label="Draft controls">${controls}</nav></main>`;
  return response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>HTML keyboard · word links · IARC Relay</title><meta name="robots" content="noindex,nofollow,noarchive"><style>*{box-sizing:border-box}body{margin:0;background:#f5f7f3;color:#172527;font:16px/1.4 system-ui,sans-serif}main{max-width:680px;margin:auto;padding:20px}h1{font-size:1.35rem;margin:.2rem 0 1rem}.notice{font-size:.82rem;color:#526466;margin:.4rem 0 1.2rem}section{margin:1rem 0}h2{font-size:.9rem;margin:.4rem 0}.draft{min-height:3.4rem;border:1px solid #ccd6df;background:#fff;padding:.65rem;white-space:pre-wrap;overflow-wrap:anywhere;margin:0}.choices{display:flex;flex-wrap:wrap;gap:.4rem}.choices a{display:inline-block;min-width:2.2rem;padding:.45rem .65rem;border:1px solid #ccd6df;border-radius:5px;background:#fff;color:#086b62;text-align:center;text-decoration:none}.choices a:focus-visible,.key:focus-visible{outline:3px solid #7c3b25;outline-offset:2px}.key-grid{display:flex;flex-direction:column;gap:.4rem}.keyrow{display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:.35rem}.keyrow.indented{margin-inline:5%}.keyrow.third{grid-template-columns:repeat(11,minmax(0,1fr))}.keyrow.symbols{grid-template-columns:repeat(10,minmax(0,1fr))}.keyrow.bottom{grid-template-columns:repeat(10,minmax(0,1fr))}.key{min-width:0;min-height:46px;display:flex;align-items:center;justify-content:center;padding:.35rem .15rem;border:1px solid #ccd6df;border-radius:6px;background:#f8fafb;color:#25343b;text-decoration:none;font-weight:650;box-shadow:0 2px 0 #d6dfe2}.key.wide{grid-column:span 2}.key.space{grid-column:span 4}.key.spacer{visibility:hidden}.controls{display:flex;gap:1rem;flex-wrap:wrap}.controls a{color:#086b62}.primary{display:inline-block;padding:.65rem .9rem;border:1px solid #086b62;border-radius:5px;color:#086b62;font-weight:700}@media(max-width:380px){main{padding:12px}.keyrow,.keyrow.third{gap:.2rem}.key{font-size:.82rem;min-height:44px}}</style></head><body><main>${body}</body></html>`);
}

export function isWordKeyboardPath(pathname) {
  return pathname === PREFIX || pathname === `${PREFIX}/` || pathname.startsWith(`${PREFIX}/`);
}

export async function handleWordKeyboard(request, env, url, createPublishDraft, discardPublishDraft) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...NO_STORE, Allow: "GET, OPTIONS" } });
  if (request.method === "HEAD") {
    const mutating = /\/(?:start|step|review|discard)(?:\/|$)/u.test(url.pathname);
    return new Response(null, { status: mutating ? 405 : 200, headers: { ...NO_STORE, Allow: mutating ? "GET, OPTIONS" : "GET, HEAD, OPTIONS" } });
  }
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: { ...NO_STORE, Allow: "GET, HEAD, OPTIONS" } });
  try {
    if (url.href.length > 8_000) return fail("Links may not exceed 8,000 characters.", 414);
    const path = url.pathname;
    if (path === PREFIX || path === `${PREFIX}/`) {
      const params = queryParams(url, new Set(["reply_to"]));
      const replyTo = params.get("reply_to") || "";
      if (replyTo && !validReplyTarget(replyTo)) throw new Error("Reply target is not a valid IARC message ID.");
      const sessionId = randomToken();
      const issuedAt = Date.now();
      const cap = await signCommonWordRoute(env, "keyboard-start", sessionId, replyTo, issuedAt);
      const startHref = `${PREFIX}/start/${issuedAt}/${word(sessionId)}/${word(cap)}${replyTo ? `?reply_to=${encodeURIComponent(replyTo)}` : ""}`;
      const reply = replyTo ? `<p class="notice">Reply to ${escapeHtml(replyTo)}</p>` : "";
      return page("HTML keyboard · word links", `<h1>HTML keyboard · word links</h1><p class="notice">Readable word-sequence links keep keyboard choices compact. Following Start creates a temporary Relay session. Each subsequent choice saves a private draft step at Relay for up to 30 minutes; steps are deleted after publication or expiry. These links are not encrypted and may be observed by Relay, Cloudflare, or your surrounding system. Never enter secrets. <a href="/privacy">Privacy</a> · <a href="/participation-policy">Policy</a> · <a href="/predictive-keyboard/html/">Original HTML keyboard</a></p>${reply}<p><a class="primary" rel="nofollow" href="${escapeHtml(startHref)}">Start a temporary draft</a></p>`);
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
      return await renderKeyboard(request, env, state, new URL(`${PREFIX}/state/${word(state.state_id)}`, url));
    }
    const stateMatch = path.match(/^\/predictive-keyboard\/html\/word-links\/state\/([^/]+)$/u);
    if (stateMatch) {
      queryParams(url, new Set(["layout", "shift"]));
      const state = await findState(env, readWord(stateMatch[1]));
      return await renderKeyboard(request, env, state, url);
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
      const child = await makeChild(env, request, parent, action, argument, childId);
      const nextUrl = new URL(`${PREFIX}/state/${word(child.state_id)}`, url);
      const mode = queryParams(url, new Set(["layout"]));
      for (const [key, value] of mode) nextUrl.searchParams.set(key, value);
      return await renderKeyboard(request, env, child, nextUrl);
    }
    const reviewMatch = path.match(/^\/predictive-keyboard\/html\/word-links\/review\/([^/]+)$/u);
    if (reviewMatch) {
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
      const editHref = `${PREFIX}/discard/${word(state.state_id)}?${new URLSearchParams({ cap: wordPublishCap })}`;
      return page("Review draft", `<h1>Review draft</h1><p><strong>Exact message · ${bytes} UTF-8 byte${bytes === 1 ? "" : "s"}</strong></p><pre class="draft">${escapeHtml(draft)}</pre>${reply}<p>This private draft expires at <time datetime="${expiry}">${expiry}</time>. Following the next link publishes it publicly. A crawler or prefetching client that follows it can publish; continue only when publication is intended and permitted.</p><p><a rel="nofollow" class="primary" href="${escapeHtml(publishHref)}">Publish this message publicly</a></p><p><a rel="nofollow" href="${escapeHtml(editHref)}">Edit message and discard this private draft</a></p>`);
    }
    const discardMatch = path.match(/^\/predictive-keyboard\/html\/word-links\/discard\/([^/]+)$/u);
    if (discardMatch) {
      const params = queryParams(url, new Set(["cap"]));
      const state = await findState(env, readWord(discardMatch[1]));
      const suppliedCapability = params.get("cap") || "";
      const capability = decodeCommonWordRouteToken(suppliedCapability) || suppliedCapability;
      if (!/^[A-Za-z0-9_-]{43}$/u.test(capability)) throw new Error("The private draft capability is malformed.");
      if (typeof discardPublishDraft !== "function") throw new Error("Draft cancellation is unavailable.");
      const discarded = await discardPublishDraft(request, capability, state.session_id);
      if (discarded instanceof Response) return discarded;
      if (!discarded?.discarded) throw new Error(discarded?.detail || "The private draft could not be discarded.");
      return page("Private draft discarded", `<h1>Private draft discarded</h1><p>The unpublished draft was discarded and its publish link is invalid. Nothing was published.</p><p><a href="${escapeHtml(stateHref(state.state_id))}">Edit message</a></p>`);
    }
    return fail("No word-link keyboard page has this address.", 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Keyboard request failed.";
    const status = /signing is not configured|storage|database|assets are unavailable|resource unavailable/u.test(message) ? 503 : /state limit|active session limit/u.test(message) ? 429 : /private publication draft is already active/u.test(message) ? 409 : /limit reached|Message limit/u.test(message) ? 413 : /expired|unavailable|already been used to publish/u.test(message) ? 410 : 400;
    return fail(message, status);
  }
}
