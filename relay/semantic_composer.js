import { applyAddition, renderDocument, validateDocument } from "./semantic_document.js";
import { semanticActionPayload, signSemanticAction, verifySemanticAction } from "./semantic_actions.js";

const PREFIX = "/compose/semantic";
const VERSION = "hierarchical-semantic-composer-0.1.0";
const CONDITION = "semantic-english-literal-v1";
const RENDERER = "semantic-document-v1";
const LEXICON = "fluenttyper-9d4826d5-en_US-hunspell-base-1";
const MODEL = "disabled-until-worker-benchmark";
const SESSION_TTL_MS = 30 * 60_000;
const START_TTL_MS = 15 * 60_000;
const MAX_SESSIONS = 32;
const MAX_STATES = 512;
const MAX_SESSION_BYTES = 4 * 1024 * 1024;
const MAX_AGGREGATE_BYTES = 80 * 1024 * 1024;
const SNAPSHOT_BYTES = 12 * 1024;
const MAX_ROW_BYTES = 4 * 1024;
const MAX_URL_LENGTH = 8_000;
const SNAPSHOT_INTERVAL = 16;
const encoder = new TextEncoder();
const NO_STORE = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
};
const STARTER_WORDS = ["I", "we", "the", "a", "this", "it", "agent", "Relay", "can", "would", "please", "thanks", "is", "will", "because", "message"];
const STARTER_PHRASES = ["I think", "This is useful", "Thanks for the message", "I agree", "Can you explain", "The Relay works"];
const KEYBOARD_CHARS = [..."abcdefghijklmnopqrstuvwxyz0123456789.,?!'’-():;\"/ " ];

function esc(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function page(title, content, status = 200) {
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)} · IARC Relay</title><style>*{box-sizing:border-box}body{margin:0;background:#f5f7f3;color:#172527;font:16px/1.5 system-ui,sans-serif}main{max-width:760px;margin:auto;padding:20px}h1{font-size:1.6rem;line-height:1.15}h2{font-size:1.05rem;margin:1.4rem 0 .55rem}a,button{color:#006f68}a{overflow-wrap:anywhere}.notice{font-size:.9rem;color:#526466}.panel{background:white;border:1px solid #cbd8d7;border-radius:9px;padding:16px;margin:14px 0}.draft{white-space:pre-wrap;overflow-wrap:anywhere;min-height:3.5rem;padding:12px;background:#fff;border:1px solid #cbd8d7}.choices{display:flex;flex-wrap:wrap;gap:8px}.choices a,.choices button,.control{display:inline-flex;min-height:44px;align-items:center;justify-content:center;padding:8px 12px;border:1px solid #9cbab7;border-radius:6px;background:#fff;font:inherit;font-weight:650;text-decoration:none;cursor:pointer}.choices button:hover,.choices a:hover,.control:hover{background:#e9f4f1}.choices button:focus-visible,.choices a:focus-visible,.control:focus-visible{outline:3px solid #9c532c;outline-offset:2px}form{margin:.75rem 0}label{display:block;font-weight:650;margin:.4rem 0}textarea{width:100%;min-height:7rem;padding:10px;border:1px solid #9bb0b0;border-radius:5px;font:inherit}select{max-width:100%;min-height:44px;font:inherit}small{color:#526466}.letters{display:grid;grid-template-columns:repeat(auto-fit,minmax(44px,1fr));gap:6px}.letters a{min-height:44px;display:grid;place-items:center;border:1px solid #cbd8d7;border-radius:5px;text-decoration:none}.toolbar{display:flex;gap:14px;flex-wrap:wrap;margin:1rem 0}pre{white-space:pre-wrap;overflow-wrap:anywhere}@media(max-width:420px){main{padding:12px}.panel{padding:12px}}</style></head><body><main>${content}</main></body></html>`;
  return new Response(body, { status, headers: { ...NO_STORE, "Content-Type": "text/html; charset=utf-8" } });
}

function problem(title, detail, status = 400) {
  return page(title, `<h1>${esc(title)}</h1><p>${esc(detail)}</p><p><a href="${PREFIX}/">Return to semantic composer</a></p>`, status);
}

function params(url, allowed) {
  const result = new Map();
  for (const [key, value] of url.searchParams) {
    if (!allowed.has(key) || result.has(key)) throw new TypeError(`Invalid or repeated parameter: ${key}`);
    result.set(key, value);
  }
  return result;
}

function b64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

async function digest(text) {
  return b64(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text))));
}

function compactChunk(chunk) {
  if (chunk.kind === "semantic") return ["s", chunk.words, ["as-is", "initial-capital", "upper"].indexOf(chunk.case), ["none", "quote", "parenthetical"].indexOf(chunk.wrapper), ["none", ".", ",", "?", "!", ":", ";"].indexOf(chunk.suffix)];
  if (chunk.kind === "literal") return ["l", chunk.text, chunk.joinBefore === "exact" ? 0 : 1];
  return ["p", chunk.value];
}

function expandChunk(compact) {
  if (compact?.[0] === "s" && Array.isArray(compact[1])) return { kind: "semantic", words: compact[1], case: ["as-is", "initial-capital", "upper"][compact[2]], wrapper: ["none", "quote", "parenthetical"][compact[3]], suffix: ["none", ".", ",", "?", "!", ":", ";"][compact[4]] };
  if (compact?.[0] === "l" && typeof compact[1] === "string") return { kind: "literal", text: compact[1], joinBefore: compact[2] === 0 ? "exact" : "space-if-needed" };
  if (compact?.[0] === "p" && typeof compact[1] === "string") return { kind: "punctuation", value: compact[1] };
  throw new TypeError("Stored semantic operation is invalid.");
}

function packDocument(document) {
  validateDocument(document);
  return JSON.stringify({ v: 1, c: document.chunks.map(compactChunk) });
}

function unpackDocument(value) {
  const parsed = JSON.parse(value);
  if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.c)) throw new TypeError("Stored semantic snapshot is invalid.");
  return validateDocument({ version: 1, chunks: parsed.c.map(expandChunk) });
}

async function loadDocument(env, state) {
  const operations = [];
  let current = state;
  while (current.snapshot_json === null && current.parent_state_id && operations.length < SNAPSHOT_INTERVAL) {
    operations.push(JSON.parse(current.operation_json).addition);
    current = await env.RELAY_DB.prepare("SELECT * FROM semantic_states WHERE state_id = ? AND session_id = ?").bind(current.parent_state_id, state.session_id).first();
    if (!current) throw new Error("An earlier draft state is unavailable.");
  }
  if (current.snapshot_json === null) throw new Error("Draft history cannot be reconstructed safely; start a new session.");
  const document = unpackDocument(current.snapshot_json);
  for (const operation of operations.reverse()) document.chunks.push(expandChunk(operation));
  return validateDocument(document);
}

function duration(ms) {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

async function signedView(env, deriveCapability, sessionId, stateId, expiresAt) {
  return deriveCapability(env, "semantic-view-v1", sessionId, stateId, expiresAt);
}

function viewUrl(sessionId, stateId, view, layout = "buttons", format = {}) {
  const query = new URLSearchParams({ session: sessionId, state: stateId, view, layout, case: format.case || "as-is", wrapper: format.wrapper || "none", suffix: format.suffix || "none" });
  return `${PREFIX}/state?${query}`;
}

async function signedAction(env, deriveCapability, session, stateId, kind, data, now = Date.now()) {
  return signSemanticAction(env, deriveCapability, semanticActionPayload({ sessionId: session.session_id, stateId, kind, data, expiresAt: Math.min(session.expires_at, now + 5 * 60_000) }));
}

function linkOnlyChoice(href, label) {
  return `<a href="${esc(href)}">${esc(label)}</a>`;
}

async function choiceMarkup(env, deriveCapability, session, stateId, additions, layout, format) {
  const controls = [];
  const buttons = [];
  for (const addition of additions) {
    const cap = await signedAction(env, deriveCapability, session, stateId, "append", addition);
    const label = addition.kind === "semantic" ? addition.words.join(" ") : addition.kind === "punctuation" ? addition.value : addition.text;
    const href = `${PREFIX}/add?${new URLSearchParams({ state: stateId, view: await signedView(env, deriveCapability, session.session_id, stateId, session.expires_at), action: cap, layout, case: format.case, wrapper: format.wrapper, suffix: format.suffix })}`;
    if (layout === "links") controls.push(linkOnlyChoice(href, label));
    else buttons.push(`<button type="submit" name="action" value="${esc(cap)}">${esc(label)}</button>`);
  }
  if (layout === "links") return `<div class="choices">${controls.join("")}</div>`;
  const view = await signedView(env, deriveCapability, session.session_id, stateId, session.expires_at);
  return `<form method="get" action="${PREFIX}/add"><input type="hidden" name="session" value="${esc(session.session_id)}"><input type="hidden" name="state" value="${esc(stateId)}"><input type="hidden" name="view" value="${esc(view)}"><button type="submit" name="action" value="refresh">Refresh options (does not add text)</button><div class="choices">${buttons.join("")}</div><input type="hidden" name="layout" value="${esc(layout)}"><input type="hidden" name="case" value="${esc(format.case)}"><input type="hidden" name="wrapper" value="${esc(format.wrapper)}"><input type="hidden" name="suffix" value="${esc(format.suffix)}"></form>`;
}

async function bumpQuota(env, sessionId, kind, now = Date.now()) {
  const column = kind === "addition" ? "addition_count" : kind === "prediction" ? "prediction_count" : "request_count";
  const maximum = kind === "addition" ? 60 : kind === "prediction" ? 20 : 120;
  const allowedStatus = kind === "addition" ? "status = 'editing'" : "status IN ('editing','review-staging','review-ready')";
  const changed = await env.RELAY_DB.prepare(`UPDATE semantic_sessions SET
      rate_window_start = CASE WHEN rate_window_start <= ? THEN ? ELSE rate_window_start END,
      request_count = CASE WHEN rate_window_start <= ? THEN 0 ELSE request_count END,
      addition_count = CASE WHEN rate_window_start <= ? THEN 0 ELSE addition_count END,
      prediction_count = CASE WHEN rate_window_start <= ? THEN 0 ELSE prediction_count END,
      ${column} = CASE WHEN rate_window_start <= ? THEN 1 ELSE ${column} + 1 END
    WHERE session_id = ? AND expires_at > ? AND ${allowedStatus}
      AND CASE WHEN rate_window_start <= ? THEN 1 ELSE ${column} + 1 END <= ? RETURNING session_id`)
    .bind(now - 60_000, now, now - 60_000, now - 60_000, now - 60_000, now - 60_000, sessionId, now, now - 60_000, maximum).first();
  const row = await env.RELAY_DB.prepare("SELECT rate_window_start, status, expires_at FROM semantic_sessions WHERE session_id = ?").bind(sessionId).first();
  if (!row || row.expires_at <= now || row.status === "expired") throw Object.assign(new Error("This semantic composer session expired. Start a new one."), { status: 410 });
  if (!changed && row.status === "editing" || !changed && row.status === "review-staging" || !changed && row.status === "review-ready") {
    const current = await env.RELAY_DB.prepare(`SELECT ${column} AS count FROM semantic_sessions WHERE session_id = ?`).bind(sessionId).first();
    const inWindow = row.rate_window_start > now - 60_000;
    if (kind === "addition" && row.status !== "editing") throw Object.assign(new Error("This draft is locked while its reviewed publication is pending."), { status: 409 });
    if (inWindow && current?.count >= maximum) throw Object.assign(new Error("Request limit reached for this session; wait one minute and retry."), { status: 429 });
    throw Object.assign(new Error("This session is unavailable for that operation."), { status: 409 });
  }
  if (row.status !== "editing" && kind === "addition") throw Object.assign(new Error("This draft is locked while its reviewed publication is pending."), { status: 409 });
}

async function getSessionState(env, deriveCapability, sessionId, stateId, viewToken, now = Date.now()) {
  if (typeof viewToken !== "string" || viewToken.length !== 43) throw new TypeError("The state link is invalid.");
  const row = await env.RELAY_DB.prepare("SELECT s.*, m.expires_at AS session_expires_at, m.reply_to, m.status, m.review_state_id, m.review_attempt_id, m.review_generation, m.review_lease_until, m.created_at AS session_created_at, m.state_count, m.logical_bytes FROM semantic_states s JOIN semantic_sessions m USING (session_id) WHERE s.state_id = ? AND s.session_id = ?")
    .bind(stateId, sessionId).first();
  if (!row || row.session_expires_at <= now || row.status === "expired") throw Object.assign(new Error("This draft has expired or is unavailable."), { status: 410 });
  const expected = await signedView(env, deriveCapability, sessionId, stateId, row.session_expires_at);
  if (expected !== viewToken) throw new TypeError("The state link signature is invalid.");
  if (await digest(row.rendered_text) !== row.body_digest) throw new Error("Stored draft integrity check failed; no publication was staged.");
  return row;
}

async function loadLexicon(env, request, prefix) {
  if (!env.ASSETS) throw new Error("The local spelling vocabulary is unavailable; use the character or typed-text lane.");
  const manifestResponse = await env.ASSETS.fetch(new Request(new URL("/semantic-lexicon-hunspell-base-1/manifest.json", request.url)));
  if (!manifestResponse.ok) throw new Error("The spelling vocabulary index is unavailable; use the character or typed-text lane.");
  const manifest = await manifestResponse.json();
  if (manifest.lexicon_version !== LEXICON || !Array.isArray(manifest.shards)) throw new Error("The spelling vocabulary version is invalid.");
  const shards = manifest.shards.filter((shard) => shard.prefix.normalize("NFC").toLowerCase().startsWith(prefix) || prefix.startsWith(shard.prefix.normalize("NFC").toLowerCase()));
  const words = [];
  for (const shard of shards) {
    const response = await env.ASSETS.fetch(new Request(new URL(`/semantic-lexicon-hunspell-base-1/${shard.path}`, request.url)));
    if (!response.ok) throw new Error("A spelling vocabulary shard is unavailable; use another input lane.");
    const text = await response.text();
    const canonical = text.endsWith("\n") ? text.slice(0, -1) : text;
    const bytes = encoder.encode(canonical);
    const actualHash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    if (bytes.byteLength !== shard.bytes || actualHash !== shard.sha256) throw new Error("A spelling vocabulary shard failed its integrity check.");
    const items = JSON.parse(canonical);
    if (!Array.isArray(items) || items.length !== shard.count) throw new Error("A spelling vocabulary shard failed its integrity check.");
    for (const word of items) if (word.normalize("NFC").toLowerCase().startsWith(prefix)) words.push(word);
  }
  return [...new Set(words)].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
}

function formattingPage(sessionId, stateId, viewToken, current) {
  const groups = [
    ["Case", "case", [["as-is", "As shown"], ["initial-capital", "Initial capital"], ["upper", "Uppercase"]]],
    ["Wrapper", "wrapper", [["none", "No wrapper"], ["quote", "Curly quotes"], ["parenthetical", "Parentheses"]]],
    ["Ending", "suffix", [["none", "No punctuation"], [".", "Period"], [",", "Comma"], ["?", "Question mark"], ["!", "Exclamation mark"], [":", "Colon"], [";", "Semicolon"]]],
  ].map(([label, key, options]) => `<h2>${label}</h2><div class="choices">${options.map(([value, name]) => {
    const format = { ...current, [key]: value };
    return `<a class="control" href="${esc(viewUrl(sessionId, stateId, viewToken, "buttons", format))}">${esc(name)}${current[key] === value ? " · selected" : ""}</a>`;
  }).join("")}</div>`).join("");
  return page("Semantic composer formatting", `<h1>Format next addition</h1><p>These choices affect future additions only. Existing draft bytes stay unchanged. Suffix punctuation appears outside selected quotes or parentheses.</p>${groups}<p><a href="${esc(viewUrl(sessionId, stateId, viewToken, "buttons", current))}">Return to draft</a></p>`);
}

async function renderVocab(request, env, url, deps, session, state, viewToken, prefix = "") {
  const cleanPrefix = prefix.normalize("NFC").toLowerCase();
  if ([...cleanPrefix].length > 20 || /[^\p{L}\p{N}'’-]/u.test(cleanPrefix)) return problem("Prefix unavailable", "Use up to 20 letters, numbers, apostrophes, or hyphens.");
  let words = [];
  let error = "";
  if (cleanPrefix) {
    try { words = await loadLexicon(env, request, cleanPrefix); }
    catch (reason) { error = reason.message; }
  }
  const offset = Number(url.searchParams.get("offset") || 0);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset % 24 !== 0) return problem("Page unavailable", "The vocabulary page cursor is invalid.");
  const current = words.slice(offset, offset + 24);
  const letters = cleanPrefix ? [...new Set(words.map((word) => [...word.normalize("NFC").toLowerCase().slice(cleanPrefix.length)][0]).filter(Boolean))].sort() : [..."abcdefghijklmnopqrstuvwxyz"];
  const currentUrl = (nextPrefix, nextOffset = 0) => `${PREFIX}/vocab?${new URLSearchParams({ session: session.session_id, state: state.state_id, view: viewToken, prefix: nextPrefix, offset: String(nextOffset) })}`;
  const additions = [];
  for (const candidate of current) {
    const action = await signedAction(env, deps.deriveCapability, session, state.state_id, "append", { kind: "semantic", words: [candidate], case: "as-is", wrapper: "none", suffix: "none" });
    const href = `${PREFIX}/add?${new URLSearchParams({ state: state.state_id, view: viewToken, action })}`;
    additions.push(linkOnlyChoice(href, candidate));
  }
  let content = `<h1>Vocabulary</h1><p class="notice">A pinned spelling list. This is not a prediction or a frequency ranking. Choosing a word adds it to the draft. Prefix navigation does not change the draft. Source archive and license: <a href="/predictive-keyboard/vendor/source/fluenttyper-presage-inputs-9d4826d5.tar.gz">source</a> · <a href="/predictive-keyboard/vendor/licenses/LICENSE.aspell">LGPL-2.1 text</a>.</p><p><a href="${esc(viewUrl(session.session_id, state.state_id, viewToken))}">Return to draft</a></p>${error ? `<p role="status">${esc(error)}</p>` : ""}`;
  if (!cleanPrefix) content += `<h2>First letter</h2><div class="letters">${letters.map((letter) => `<a href="${esc(currentUrl(letter))}">${esc(letter.toUpperCase())}</a>`).join("")}</div>`;
  else {
    content += `<p>Prefix: <strong>${esc(cleanPrefix)}</strong> · ${words.length} matches</p><h2>Continue prefix</h2><div class="letters">${letters.map((letter) => `<a href="${esc(currentUrl(cleanPrefix + letter))}">${esc(letter.toUpperCase())}</a>`).join("") || "<small>No child prefixes.</small>"}</div><h2>Matching words</h2><div class="choices">${additions.join("") || "<small>No words on this page.</small>"}</div>`;
    if (offset > 0) content += `<p><a href="${esc(currentUrl(cleanPrefix, offset - 24))}">Previous words</a></p>`;
    if (offset + 24 < words.length) content += `<p><a href="${esc(currentUrl(cleanPrefix, offset + 24))}">Next words</a></p>`;
  }
  return page("Semantic composer vocabulary", content);
}

async function renderCharacters(request, env, url, deps, session, state, viewToken) {
  let buffer = "";
  const encoded = url.searchParams.get("buffer") || "";
  if (encoded) {
    const split = encoded.lastIndexOf(".");
    if (split < 1 || split > 1_600) return problem("Character buffer unavailable", "The temporary character buffer link is invalid.");
    const payload = encoded.slice(0, split);
    const signature = encoded.slice(split + 1);
    const expected = await deps.deriveCapability(env, "semantic-buffer-v1", session.session_id, state.state_id, payload, session.expires_at);
    if (signature !== expected) return problem("Character buffer unavailable", "The temporary character buffer signature is invalid.");
    try {
      const decodedBytes = Uint8Array.from(atob(payload.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - payload.length % 4) % 4)), (char) => char.charCodeAt(0));
      const decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decodedBytes));
      if (typeof decoded.text !== "string" || encoder.encode(decoded.text).byteLength > 128) throw new Error();
      buffer = decoded.text;
    } catch { return problem("Character buffer unavailable", "The temporary character buffer is invalid or too large."); }
  }
  const writeBuffer = async (text) => {
    const payload = b64(encoder.encode(JSON.stringify({ text })));
    const signature = await deps.deriveCapability(env, "semantic-buffer-v1", session.session_id, state.state_id, payload, session.expires_at);
    return `${payload}.${signature}`;
  };
  const bufferUrl = async (text) => `${PREFIX}/characters?${new URLSearchParams({ session: session.session_id, state: state.state_id, view: viewToken, buffer: await writeBuffer(text) })}`;
  const codepointInput = url.searchParams.get("cp");
  if (codepointInput) {
    const hex = codepointInput.replace(/^0x/iu, "");
    const point = /^[0-9a-f]{1,6}$/iu.test(hex) ? Number.parseInt(hex, 16) : -1;
    if (point < 0 || point > 0x10FFFF || (point >= 0xD800 && point <= 0xDFFF)) return problem("Code point unavailable", "Enter a valid Unicode scalar value in hexadecimal; surrogate values are not characters.");
    buffer += String.fromCodePoint(point);
    if (encoder.encode(buffer).byteLength > 128) return problem("Character buffer full", "The temporary character buffer is limited to 128 UTF-8 bytes.", 413);
  }
  const choices = [];
  for (const char of KEYBOARD_CHARS) choices.push(`<a href="${esc(await bufferUrl(buffer + char))}">${esc(char === " " ? "space" : char)}</a>`);
  const segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter("en", { granularity: "grapheme" }) : null;
  const clusters = segmenter ? [...segmenter.segment(buffer)].map((part) => part.segment) : [...buffer];
  const undoBuffer = buffer ? `<a class="control" href="${esc(await bufferUrl(clusters.slice(0, -1).join("")))}">Backspace</a>` : "";
  const clearBuffer = buffer ? `<a class="control" href="${esc(await bufferUrl(""))}">Clear buffer</a>` : "";
  const addCap = buffer ? await signedAction(env, deps.deriveCapability, session, state.state_id, "append", { kind: "literal", text: buffer, joinBefore: "space-if-needed" }) : "";
  const addLink = buffer ? `<a class="control" href="${esc(`${PREFIX}/add?${new URLSearchParams({ state: state.state_id, view: viewToken, action: addCap })}`)}">Add buffer as a new word</a>` : "";
  const codepointForm = `<form method="get" action="${PREFIX}/characters"><input type="hidden" name="session" value="${esc(session.session_id)}"><input type="hidden" name="state" value="${esc(state.state_id)}"><input type="hidden" name="view" value="${esc(viewToken)}"><input type="hidden" name="buffer" value="${esc(encoded)}"><label for="cp">Add Unicode code point (hex)</label><input id="cp" name="cp" inputmode="text" pattern="(?:0x)?[0-9A-Fa-f]{1,6}" maxlength="8"><button type="submit">Add character</button></form>`;
  return page("Semantic composer characters", `<h1>Character composition</h1><p class="notice">The buffer is encoded in a signed temporary URL; it is not encrypted. It does not change the draft until you add it. Unicode is available by entering a code point in hexadecimal.</p><div class="draft">${esc(buffer || "(empty buffer)")}</div><p>${undoBuffer} ${clearBuffer} ${addLink}</p><div class="letters">${choices.join("")}</div>${codepointForm}<p><a href="${esc(viewUrl(session.session_id, state.state_id, viewToken))}">Return to draft</a></p>`);
}

async function addState(env, deps, session, parent, addition, now = Date.now()) {
  const document = await loadDocument(env, parent);
  const next = applyAddition(document, parent.rendered_text, addition);
  const operation = { addition: compactChunk(addition) };
  const operationJson = JSON.stringify(operation);
  const depth = parent.depth + 1;
  const snapshot = depth % SNAPSHOT_INTERVAL === 0 ? packDocument(next.document) : null;
  const operationBytes = encoder.encode(operationJson).byteLength;
  const rowBytes = operationBytes + encoder.encode(next.rendered_text).byteLength + 220;
  if (rowBytes > MAX_ROW_BYTES) throw Object.assign(new RangeError("This addition exceeds the per-state storage limit; use a shorter addition."), { status: 413 });
  const snapshotBytes = snapshot ? encoder.encode(snapshot).byteLength : 0;
  if (snapshotBytes > SNAPSHOT_BYTES) throw Object.assign(new RangeError("This draft history exceeds the snapshot limit; start a shorter composition."), { status: 413 });
  const logicalBytes = rowBytes + snapshotBytes;
  const actionDigest = await digest(JSON.stringify({ parent: parent.state_id, addition }));
  const stateId = `sem_${await deps.deriveCapability(env, "semantic-state-id-v1", session.session_id, parent.state_id, actionDigest)}`;
  const bodyDigest = await deps.bodyDigest(next.rendered_text);
  await env.RELAY_DB.prepare(`INSERT INTO semantic_states (state_id, session_id, parent_state_id, operation_json, snapshot_json, rendered_text, body_digest, renderer_version, body_bytes, logical_bytes, action_digest, depth, created_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    WHERE EXISTS (SELECT 1 FROM semantic_sessions m WHERE m.session_id = ? AND m.status = 'editing' AND m.expires_at > ? AND m.state_count < ? AND m.logical_bytes + ? <= ?)
      AND NOT EXISTS (SELECT 1 FROM semantic_states WHERE parent_state_id = ? AND action_digest = ?)
      AND (SELECT logical_bytes FROM semantic_storage_usage WHERE singleton = 1) + ? <= ?`)
    .bind(stateId, session.session_id, parent.state_id, operationJson, snapshot, next.rendered_text, bodyDigest, RENDERER, next.body_bytes, logicalBytes, actionDigest, depth, now, session.session_id, now, MAX_STATES, logicalBytes, MAX_SESSION_BYTES, parent.state_id, actionDigest, logicalBytes, MAX_AGGREGATE_BYTES).run();
  const created = await env.RELAY_DB.prepare("SELECT * FROM semantic_states WHERE session_id = ? AND parent_state_id = ? AND action_digest = ?").bind(session.session_id, parent.state_id, actionDigest).first();
  if (created) return created;
  const status = await env.RELAY_DB.prepare("SELECT status, state_count, logical_bytes FROM semantic_sessions WHERE session_id = ?").bind(session.session_id).first();
  if (status?.status !== "editing") throw Object.assign(new Error("This draft is locked while its reviewed publication is pending."), { status: 409 });
  if (status?.state_count >= MAX_STATES || status?.logical_bytes + logicalBytes > MAX_SESSION_BYTES) throw Object.assign(new Error("The session storage limit has been reached. Review the current draft or start a new session."), { status: 429 });
  throw Object.assign(new Error("The semantic state could not be saved; no new draft state was created."), { status: 503 });
}

async function renderState(request, env, url, deps, sessionId, stateId, viewToken) {
  const state = await getSessionState(env, deps.deriveCapability, sessionId, stateId, viewToken);
  if (request.method !== "HEAD") await bumpQuota(env, sessionId, "request");
  const session = await env.RELAY_DB.prepare("SELECT * FROM semantic_sessions WHERE session_id = ?").bind(sessionId).first();
  const layout = url.searchParams.get("layout") === "links" ? "links" : "buttons";
  const format = {
    case: url.searchParams.get("case") || "as-is",
    wrapper: url.searchParams.get("wrapper") || "none",
    suffix: url.searchParams.get("suffix") || "none",
  };
  if (!new Set(["as-is", "initial-capital", "upper"]).has(format.case) || !new Set(["none", "quote", "parenthetical"]).has(format.wrapper) || !new Set(["none", ".", ",", "?", "!", ":", ";"]).has(format.suffix)) return problem("Formatting unavailable", "Choose one of the displayed formatting options.");
  const bytes = encoder.encode(state.rendered_text).byteLength;
  const rootView = await signedView(env, deps.deriveCapability, sessionId, session.root_state_id, session.expires_at);
  const typedUrl = `${PREFIX}/type?${new URLSearchParams({ session: sessionId, state: stateId, view: viewToken })}`;
  const vocabUrl = `${PREFIX}/vocab?${new URLSearchParams({ session: sessionId, state: stateId, view: viewToken })}`;
  const charactersUrl = `${PREFIX}/characters?${new URLSearchParams({ session: sessionId, state: stateId, view: viewToken })}`;
  const layoutUrl = viewUrl(sessionId, stateId, viewToken, layout === "links" ? "buttons" : "links", format);
  const choices = [];
  for (const value of STARTER_WORDS) choices.push({ kind: "semantic", words: [value], ...format });
  for (const value of STARTER_PHRASES) choices.push({ kind: "semantic", words: value.split(" "), ...format });
  for (const value of [".", ",", "?", "!", ":", ";"]) choices.push({ kind: "punctuation", value });
  let content = `<p class="notice">Semantic composer · English spelling choices and exact text lanes. Contextual predictions are disabled pending a measured Worker benchmark. GET actions create private state; URLs can appear in browser history and infrastructure logs. Never enter secrets. <a href="/privacy">Privacy</a> · <a href="/participation-policy">Policy</a></p><h1>Semantic composer</h1><section class="panel"><h2>Draft · ${bytes} UTF-8 bytes</h2><div class="draft">${esc(state.rendered_text || "(empty)")}</div><p><small>State ${esc(state.state_id)} · expires in about ${esc(duration(state.session_expires_at - Date.now()))}</small></p></section>`;
  if (session.status === "review-ready" && session.review_state_id === state.state_id) {
    const action = await signedAction(env, deps.deriveCapability, session, stateId, "discard", { attempt_id: session.review_attempt_id, generation: session.review_generation });
    const link = `${PREFIX}/discard?${new URLSearchParams({ state: stateId, view: viewToken, action })}`;
    content += `<section class="panel"><h2>Reviewed draft waiting to publish</h2><p>New additions are locked until you discard this private draft or publish it.</p><p><a class="control" href="${esc(link)}">Discard private draft and edit</a></p></section>`;
  } else {
    if (state.parent_state_id) {
      const parent = await env.RELAY_DB.prepare("SELECT state_id FROM semantic_states WHERE state_id = ? AND session_id = ?").bind(state.parent_state_id, sessionId).first();
      const parentView = await signedView(env, deps.deriveCapability, sessionId, parent.state_id, session.expires_at);
      content += `<p><a class="control" href="${esc(viewUrl(sessionId, parent.state_id, parentView, layout, format))}">Undo last addition</a></p>`;
    }
    content += `<section class="panel"><h2>Starter phrases · fixed choices, not predictions</h2>${await choiceMarkup(env, deps.deriveCapability, session, stateId, choices.filter((item) => item.words?.length > 1), layout, format)}</section>`;
    content += `<section class="panel"><h2>Word choices · fixed palette, not predictions</h2>${await choiceMarkup(env, deps.deriveCapability, session, stateId, choices.filter((item) => item.words && item.words.length === 1), layout, format)}</section>`;
    content += `<section class="panel"><h2>Punctuation</h2>${await choiceMarkup(env, deps.deriveCapability, session, stateId, choices.filter((item) => item.kind === "punctuation"), layout, format)}</section>`;
    const formatUrl = `${PREFIX}/format?${new URLSearchParams({ session: sessionId, state: stateId, view: viewToken, case: format.case, wrapper: format.wrapper, suffix: format.suffix })}`;
    content += `<nav class="toolbar"><a class="control" href="${esc(vocabUrl)}">Browse all words</a><a class="control" href="${esc(typedUrl)}">Type exact text</a><a class="control" href="${esc(charactersUrl)}">Compose characters</a><a class="control" href="${esc(formatUrl)}">Format next addition</a><a class="control" href="${esc(layoutUrl)}">${layout === "links" ? "Use button view" : "Use links-only view"}</a></nav>`;
    const review = await signedAction(env, deps.deriveCapability, session, stateId, "review", {});
    content += `<section class="panel"><h2>Review and publish</h2><p>Review shows the exact bytes that will be published. Publication is a separate explicit GET action.</p><p><a class="control" href="${esc(`${PREFIX}/review?${new URLSearchParams({ state: stateId, view: viewToken, action: review })}`)}">Review this draft</a></p></section>`;
  }
  content += `<p class="notice">Reply target: ${esc(session.reply_to || "new conversation")} · <a href="${esc(viewUrl(sessionId, session.root_state_id, rootView))}">Rebuild from start</a></p>`;
  return page("Semantic composer", content);
}

async function startComposer(request, env, url, deps) {
  const values = params(url, new Set(["cap"]));
  const token = values.get("cap");
  if (!token) return problem("Start link missing", "Use a fresh Start link from the composer overview.");
  const split = token.lastIndexOf(".");
  if (split < 1) return problem("Start link invalid", "The start capability is malformed.");
  const encoded = token.slice(0, split);
  const supplied = token.slice(split + 1);
  const expected = await deps.deriveCapability(env, "semantic-start-v1", encoded);
  if (expected !== supplied) return problem("Start link invalid", "The start capability signature is invalid.");
  let payload;
  try { payload = JSON.parse(atob(encoded.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - encoded.length % 4) % 4))); }
  catch { return problem("Start link invalid", "The start capability payload is invalid."); }
  const now = Date.now();
  if (!payload || payload.v !== 1 || !/^[0-9a-f-]{36}$/iu.test(payload.session_id) || !/^[0-9a-f-]{36}$/iu.test(payload.root_state_id) || payload.expires_at <= now || (payload.reply_to !== null && !/^IARC-M-[0-9a-f-]{36}$/iu.test(payload.reply_to))) return problem("Start link expired", "Open the overview for a new single-use start link.", 410);
  const existing = await env.RELAY_DB.prepare("SELECT root_state_id, expires_at FROM semantic_sessions WHERE session_id = ?").bind(payload.session_id).first();
  if (existing) {
    if (existing.expires_at <= now) return problem("Start link expired", "This start link already created an expired session. Open the overview for a fresh link.", 410);
    const view = await signedView(env, deps.deriveCapability, payload.session_id, existing.root_state_id, existing.expires_at);
    return Response.redirect(new URL(viewUrl(payload.session_id, existing.root_state_id, view), request.url), 303);
  }
  const session = { session_id: payload.session_id, expires_at: Math.min(now + SESSION_TTL_MS, now + deps.relayLimits(env).sessionTtlMs), reply_to: payload.reply_to };
  const root = payload.root_state_id;
  const participantRef = deps.publicRef();
  const sessionCap = await deps.deriveCapability(env, "semantic-session-v1", session.session_id, root);
  const currentCapHash = await deps.capHash(sessionCap);
  const document = { version: 1, chunks: [] };
  const snapshot = packDocument(document);
  await env.RELAY_DB.batch([
    env.RELAY_DB.prepare("INSERT OR IGNORE INTO sessions (session_id, participant_ref, current_cap_hash, created_at, expires_at, message_count, thread_count) SELECT ?, ?, ?, ?, ?, 0, 0 WHERE (SELECT COUNT(*) FROM sessions WHERE expires_at > ?) < ? AND (SELECT COUNT(*) FROM semantic_sessions WHERE expires_at > ? AND status <> 'expired') < ?")
      .bind(session.session_id, participantRef, currentCapHash, now, session.expires_at, now, 256, now, MAX_SESSIONS),
    env.RELAY_DB.prepare("INSERT OR IGNORE INTO semantic_sessions (session_id, root_state_id, reply_to, composer_version, renderer_version, model_version, lexicon_version, created_at, expires_at, status) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 'editing' WHERE EXISTS (SELECT 1 FROM sessions WHERE session_id = ?) AND (SELECT COUNT(*) FROM semantic_sessions WHERE expires_at > ? AND status <> 'expired') < ?")
      .bind(session.session_id, root, session.reply_to, VERSION, RENDERER, MODEL, LEXICON, now, session.expires_at, session.session_id, now, MAX_SESSIONS),
    env.RELAY_DB.prepare("INSERT OR IGNORE INTO semantic_states (state_id, session_id, parent_state_id, operation_json, snapshot_json, rendered_text, body_digest, renderer_version, body_bytes, logical_bytes, action_digest, depth, created_at) SELECT ?, ?, NULL, '{\"root\":true}', ?, '', ?, ?, 0, ?, 'root', 0, ? WHERE EXISTS (SELECT 1 FROM semantic_sessions WHERE session_id = ? AND status = 'editing')")
      .bind(root, session.session_id, snapshot, await deps.bodyDigest(""), RENDERER, encoder.encode(snapshot).byteLength + 220, now, session.session_id),
  ]);
  const saved = await env.RELAY_DB.prepare("SELECT s.root_state_id, s.expires_at FROM semantic_sessions s JOIN sessions r USING (session_id) WHERE s.session_id = ?").bind(session.session_id).first();
  if (!saved) return problem("Session capacity reached", "The Relay could not allocate a semantic session. Wait briefly and retry.", 429);
  const view = await signedView(env, deps.deriveCapability, session.session_id, saved.root_state_id, saved.expires_at);
  return Response.redirect(new URL(viewUrl(session.session_id, saved.root_state_id, view), request.url), 303);
}

async function commitAction(env, deps, sessionId, stateId, viewToken, actionToken, typedText, joinBefore) {
  const state = await getSessionState(env, deps.deriveCapability, sessionId, stateId, viewToken);
  const session = await env.RELAY_DB.prepare("SELECT * FROM semantic_sessions WHERE session_id = ?").bind(sessionId).first();
  const action = await verifySemanticAction(env, deps.deriveCapability, actionToken);
  if (action.session_id !== sessionId || action.state_id !== stateId || action.kind !== "append") throw new TypeError("This addition link does not belong to the current draft.");
  let addition = action.data;
  if (addition?.kind === "typed") {
    if (typeof typedText !== "string" || !["exact", "space-if-needed"].includes(joinBefore)) throw new TypeError("Add typed text using the displayed boundary option.");
    addition = { kind: "literal", text: typedText, joinBefore };
  }
  await bumpQuota(env, sessionId, "addition");
  return addState(env, deps, session, state, addition);
}

async function reviewDraft(request, env, deps, sessionId, stateId, viewToken, actionToken) {
  const state = await getSessionState(env, deps.deriveCapability, sessionId, stateId, viewToken);
  const action = await verifySemanticAction(env, deps.deriveCapability, actionToken);
  if (action.kind !== "review" || action.session_id !== sessionId || action.state_id !== stateId) throw new TypeError("Review link is not valid for this draft.");
  const now = Date.now();
  const attempt = crypto.randomUUID();
  await env.RELAY_DB.prepare("UPDATE semantic_sessions SET status = 'review-staging', review_attempt_id = ?, review_generation = review_generation + 1, review_state_id = ?, review_lease_until = MIN(expires_at, ?) WHERE session_id = ? AND status = 'editing' AND expires_at > ? AND EXISTS (SELECT 1 FROM semantic_states WHERE state_id = ? AND session_id = semantic_sessions.session_id)")
    .bind(attempt, stateId, now + 30_000, sessionId, now, stateId).run();
  const claimed = await env.RELAY_DB.prepare("SELECT m.*, s.participant_ref, s.current_cap_hash, s.message_count, s.thread_count FROM semantic_sessions m JOIN sessions s USING (session_id) WHERE m.session_id = ? AND m.status = 'review-staging' AND m.review_attempt_id = ? AND m.review_state_id = ?")
    .bind(sessionId, attempt, stateId).first();
  if (!claimed) return problem("Draft locked", "Another review is already staging or this draft changed. Return to the draft and retry.", 409);
  const generation = claimed.review_generation;
  let conversationId;
  if (claimed.reply_to) {
    const parent = await env.RELAY_DB.prepare("SELECT conversation_id FROM messages WHERE message_id = ? AND created_at > ?").bind(claimed.reply_to, now - deps.messageRetentionMs(env)).first();
    if (!parent) {
      await env.RELAY_DB.prepare("UPDATE semantic_sessions SET status = 'editing', review_attempt_id = NULL, review_state_id = NULL, review_lease_until = NULL WHERE session_id = ? AND status = 'review-staging' AND review_attempt_id = ? AND review_generation = ?").bind(sessionId, attempt, generation).run();
      return problem("Reply target unavailable", "The public message this draft replies to is no longer available.", 404);
    }
    conversationId = parent.conversation_id;
  } else conversationId = deps.newId("IARC-C");
  const parsed = deps.plainMessage(state.rendered_text);
  const bodyHash = await deps.bodyDigest(parsed.body);
  if (bodyHash !== state.body_digest) throw new Error("Review integrity check failed.");
  const publishCap = await deps.deriveCapability(env, "semantic-publish-v1", sessionId, stateId, attempt, generation);
  const publishHash = await deps.capHash(publishCap);
  const pendingId = `IARC-P-${publishHash.slice(0, 32)}`;
  const expiresAt = Math.min(claimed.expires_at, now + deps.relayLimits(env).pendingTtlMs);
  const capExpiresAt = Math.min(expiresAt, now + deps.relayLimits(env).stageCapTtlMs);
  const publishedAction = await signSemanticAction(env, deps.deriveCapability, semanticActionPayload({ sessionId, stateId, kind: "discard", data: { attempt_id: attempt, generation, publish_cap: publishCap }, expiresAt: capExpiresAt }));
  await env.RELAY_DB.batch([
    env.RELAY_DB.prepare("INSERT INTO pending_messages (pending_id, session_id, conversation_id, reply_to, signal_type, contributor_designation, body, body_digest, created_at, expires_at, state) SELECT ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, 'staged' WHERE EXISTS (SELECT 1 FROM semantic_sessions WHERE session_id = ? AND status = 'review-staging' AND review_attempt_id = ? AND review_generation = ? AND review_state_id = ? AND review_lease_until > ?)")
      .bind(pendingId, sessionId, conversationId, claimed.reply_to, parsed.body, bodyHash, now, expiresAt, sessionId, attempt, generation, stateId, now),
    env.RELAY_DB.prepare("INSERT INTO capabilities (cap_hash, kind, session_id, source_cap_hash, pending_id, expires_at) SELECT ?, 'publish', ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM pending_messages p JOIN semantic_sessions m USING (session_id) WHERE p.pending_id = ? AND m.status = 'review-staging' AND m.review_attempt_id = ? AND m.review_generation = ? AND p.state = 'staged')")
      .bind(publishHash, sessionId, claimed.current_cap_hash, pendingId, capExpiresAt, pendingId, attempt, generation),
    env.RELAY_DB.prepare("INSERT INTO semantic_publish_links (publish_cap_hash, session_id, state_id, review_attempt_id, review_generation, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM capabilities c JOIN pending_messages p USING (pending_id) WHERE c.cap_hash = ? AND c.pending_id = ? AND p.state = 'staged')")
      .bind(publishHash, sessionId, stateId, attempt, generation, now, publishHash, pendingId),
    env.RELAY_DB.prepare("UPDATE semantic_sessions SET status = 'review-ready', review_lease_until = NULL WHERE session_id = ? AND status = 'review-staging' AND review_attempt_id = ? AND review_generation = ? AND review_state_id = ? AND review_lease_until > ? AND EXISTS (SELECT 1 FROM semantic_publish_links WHERE session_id = semantic_sessions.session_id AND publish_cap_hash = ? AND state_id = ? AND review_attempt_id = ? AND review_generation = ?)")
      .bind(sessionId, attempt, generation, stateId, now, publishHash, stateId, attempt, generation),
  ]);
  const ready = await env.RELAY_DB.prepare("SELECT status FROM semantic_sessions WHERE session_id = ? AND review_attempt_id = ? AND review_generation = ?").bind(sessionId, attempt, generation).first();
  if (ready?.status !== "review-ready") return problem("Review could not be staged", "The draft changed or expired during review. No publish action is available; return to the draft.", 409);
  const discardUrl = `${PREFIX}/discard?${new URLSearchParams({ state: stateId, action: publishedAction, view: viewToken })}`;
  const body = `<h1>Review semantic draft</h1><p class="notice">This private draft is stored by Relay until publication, discard, or expiry. Its URL and surrounding-system logs are not confidential.</p><section class="panel"><h2>Exact message · ${parsed.bytes} UTF-8 bytes</h2><pre>${esc(parsed.body)}</pre><p>Reply target: ${esc(claimed.reply_to || "new conversation")}</p><p>Composer: ${VERSION} · renderer: ${RENDERER}</p></section><p>A separate link below publishes this exact text publicly. A client that follows the link can publish it.</p><p><a class="control" rel="nofollow" href="/publish?${new URLSearchParams({ cap: publishCap })}">Publish this message publicly</a></p><p><a class="control" href="${esc(discardUrl)}">Discard private draft and edit</a></p>`;
  return page("Review semantic draft", body);
}

export function isSemanticComposerPath(pathname) {
  return pathname === PREFIX || pathname.startsWith(`${PREFIX}/`);
}

export function isSemanticMutationPath(pathname) {
  return new Set([`${PREFIX}/start`, `${PREFIX}/add`, `${PREFIX}/review`, `${PREFIX}/discard`]).has(pathname);
}

export async function handleSemanticComposer(request, env, url, deps) {
  if (url.href.length > MAX_URL_LENGTH) return problem("Request URL too long", `Semantic composer links are limited to ${MAX_URL_LENGTH} characters.`, 414);
  const pathname = url.pathname.replace(/\/$/u, "") || "/";
  if (pathname === PREFIX) {
    let replyTo = null;
    try {
      const values = params(url, new Set(["reply_to"]));
      replyTo = values.get("reply_to") || null;
      if (replyTo && !/^IARC-M-[0-9a-f-]{36}$/iu.test(replyTo)) throw new TypeError("Reply target is not a public Relay message ID.");
    } catch (error) { return problem("Reply target unavailable", error.message); }
    if (replyTo && !await env.RELAY_DB.prepare("SELECT message_id FROM messages WHERE message_id = ? AND created_at > ?").bind(replyTo, Date.now() - deps.messageRetentionMs(env)).first()) return problem("Reply target unavailable", "No retained public message has this identifier.", 404);
    const sessionId = crypto.randomUUID();
    const rootStateId = crypto.randomUUID();
    const expiresAt = Date.now() + START_TTL_MS;
    const payload = b64(encoder.encode(JSON.stringify({ v: 1, session_id: sessionId, root_state_id: rootStateId, reply_to: replyTo, expires_at: expiresAt })));
    const signature = await deps.deriveCapability(env, "semantic-start-v1", payload);
    const start = `${PREFIX}/start?${new URLSearchParams({ cap: `${payload}.${signature}` })}`;
    return page("Semantic composer", `<p class="notice">IARC Relay · experimental semantic composer</p><h1>Compose a message</h1><p>Choose fixed starter words, browse a pinned 48,262-word English spelling list, build characters, or add exact text. Contextual predictions are not enabled. The choices and composition actions use state-changing GET requests only when you follow their links or submit a form.</p><p class="notice">Relay stores temporary draft states for up to 30 minutes. Text in GET URLs can appear in browser history and infrastructure logs. Never enter secrets. <a href="/privacy">Privacy</a> · <a href="/participation-policy">Participation policy</a></p>${replyTo ? `<p>Replying to <code>${esc(replyTo)}</code>.</p><p><a href="/reply/${encodeURIComponent(replyTo)}">Other reply options</a></p>` : ""}<p><a class="control" href="${esc(start)}">Start a temporary draft</a></p><p><a href="/">Relay home</a></p>`);
  }
  if (pathname === `${PREFIX}/start`) return startComposer(request, env, url, deps);
  try {
    if (pathname === `${PREFIX}/state`) {
      const values = params(url, new Set(["session", "state", "view", "layout", "case", "wrapper", "suffix"]));
      return await renderState(request, env, url, deps, values.get("session"), values.get("state"), values.get("view"));
    }
    if (pathname === `${PREFIX}/format`) {
      const values = params(url, new Set(["session", "state", "view", "case", "wrapper", "suffix"]));
      const state = await getSessionState(env, deps.deriveCapability, values.get("session"), values.get("state"), values.get("view"));
      if (request.method !== "HEAD") await bumpQuota(env, values.get("session"), "request");
      const current = { case: values.get("case") || "as-is", wrapper: values.get("wrapper") || "none", suffix: values.get("suffix") || "none" };
      const valid = new Set(["as-is", "initial-capital", "upper"]).has(current.case) && new Set(["none", "quote", "parenthetical"]).has(current.wrapper) && new Set(["none", ".", ",", "?", "!", ":", ";"]).has(current.suffix);
      if (!valid) return problem("Formatting unavailable", "One or more formatting options are unsupported.");
      return formattingPage(values.get("session"), state.state_id, values.get("view"), current);
    }
    if (pathname === `${PREFIX}/add`) {
      const values = params(url, new Set(["session", "state", "view", "action", "text", "join", "layout", "case", "wrapper", "suffix"]));
      const format = { case: values.get("case") || "as-is", wrapper: values.get("wrapper") || "none", suffix: values.get("suffix") || "none" };
      const layout = values.get("layout") === "links" ? "links" : "buttons";
      if (values.get("action") === "refresh" || !values.has("action")) return Response.redirect(new URL(viewUrl(values.get("session"), values.get("state"), values.get("view"), layout, format), request.url), 303);
      const action = await verifySemanticAction(env, deps.deriveCapability, values.get("action"));
      const sessionId = values.get("session") || action.session_id;
      const stateId = values.get("state") || action.state_id;
      const child = await commitAction(env, deps, sessionId, stateId, values.get("view"), values.get("action"), values.get("text"), values.get("join"));
      const view = await signedView(env, deps.deriveCapability, sessionId, child.state_id, (await env.RELAY_DB.prepare("SELECT expires_at FROM semantic_sessions WHERE session_id = ?").bind(sessionId).first()).expires_at);
      return await renderState(request, env, new URL(viewUrl(sessionId, child.state_id, view, layout, format), request.url), deps, sessionId, child.state_id, view);
    }
    if (pathname === `${PREFIX}/type`) {
      const values = params(url, new Set(["session", "state", "view"]));
      const state = await getSessionState(env, deps.deriveCapability, values.get("session"), values.get("state"), values.get("view"));
      if (request.method !== "HEAD") await bumpQuota(env, values.get("session"), "request");
      const submit = await signedAction(env, deps.deriveCapability, { session_id: values.get("session"), expires_at: state.session_expires_at }, values.get("state"), "append", { kind: "typed" });
      const body = `<h1>Add exact text</h1><p class="notice">This GET form places the text in its URL and can expose it in browser history and infrastructure logs. Never include secrets.</p><div class="draft">${esc(state.rendered_text)}</div><form method="get" action="${PREFIX}/add"><input type="hidden" name="session" value="${esc(values.get("session"))}"><input type="hidden" name="state" value="${esc(values.get("state"))}"><input type="hidden" name="view" value="${esc(values.get("view"))}"><button type="submit" name="action" value="refresh">Refresh (does not add text)</button><label for="text">Text to add</label><textarea id="text" name="text" maxlength="1200"></textarea><label for="join">Boundary</label><select id="join" name="join"><option value="exact">Exact text</option><option value="space-if-needed">Start a new word</option></select><button type="submit" name="action" value="${esc(submit)}">Add typed text</button></form><p><a href="${esc(viewUrl(values.get("session"), values.get("state"), values.get("view")))}">Return to draft</a></p>`;
      return page("Add exact text", body);
    }
    if (pathname === `${PREFIX}/vocab`) {
      const values = params(url, new Set(["session", "state", "view", "prefix", "offset"]));
      const state = await getSessionState(env, deps.deriveCapability, values.get("session"), values.get("state"), values.get("view"));
      if (request.method !== "HEAD") await bumpQuota(env, values.get("session"), "request");
      const session = await env.RELAY_DB.prepare("SELECT * FROM semantic_sessions WHERE session_id = ?").bind(values.get("session")).first();
      return await renderVocab(request, env, url, deps, session, state, values.get("view"), values.get("prefix") || "");
    }
    if (pathname === `${PREFIX}/characters`) {
      const values = params(url, new Set(["session", "state", "view", "buffer", "cp"]));
      const state = await getSessionState(env, deps.deriveCapability, values.get("session"), values.get("state"), values.get("view"));
      if (request.method !== "HEAD") await bumpQuota(env, values.get("session"), "request");
      const session = await env.RELAY_DB.prepare("SELECT * FROM semantic_sessions WHERE session_id = ?").bind(values.get("session")).first();
      return renderCharacters(request, env, url, deps, session, state, values.get("view"));
    }
    if (pathname === `${PREFIX}/review`) {
      const values = params(url, new Set(["session", "state", "view", "action"]));
      const action = await verifySemanticAction(env, deps.deriveCapability, values.get("action"));
      const sessionId = values.get("session") || action.session_id;
      await bumpQuota(env, sessionId, "request");
      return await reviewDraft(request, env, deps, sessionId, values.get("state") || action.state_id, values.get("view"), values.get("action"));
    }
    if (pathname === `${PREFIX}/discard`) {
      const values = params(url, new Set(["session", "state", "view", "action"]));
      const action = await verifySemanticAction(env, deps.deriveCapability, values.get("action"));
      if (action.kind !== "discard") throw new TypeError("Discard action is invalid.");
      await bumpQuota(env, action.session_id, "request");
      const { attempt_id: attempt, generation } = action.data;
      if (typeof attempt !== "string" || !Number.isSafeInteger(generation)) throw new TypeError("Discard action is incomplete.");
      const current = await env.RELAY_DB.prepare("SELECT l.publish_cap_hash FROM semantic_publish_links l JOIN semantic_sessions m USING (session_id) WHERE l.session_id = ? AND l.state_id = ? AND l.review_attempt_id = ? AND l.review_generation = ? AND m.status = 'review-ready' AND m.review_state_id = ?")
        .bind(action.session_id, action.state_id, attempt, generation, action.state_id).first();
      if (!current?.publish_cap_hash) return problem("Reviewed draft unavailable", "The staged private draft is no longer eligible for discard.", 409);
      const capHash = current.publish_cap_hash;
      const now = Date.now();
      await env.RELAY_DB.batch([
        env.RELAY_DB.prepare("UPDATE capabilities SET consumed_at = ?, consumed_by = 'semantic-discard' WHERE cap_hash = ? AND kind = 'publish' AND consumed_at IS NULL AND expires_at > ? AND EXISTS (SELECT 1 FROM semantic_publish_links l JOIN semantic_sessions m USING (session_id) JOIN capabilities c ON c.cap_hash = l.publish_cap_hash JOIN pending_messages p ON p.pending_id = c.pending_id WHERE l.publish_cap_hash = capabilities.cap_hash AND l.review_attempt_id = ? AND l.review_generation = ? AND m.status = 'review-ready' AND m.review_attempt_id = ? AND m.review_generation = ? AND p.state = 'staged' AND p.expires_at > ?)")
          .bind(now, capHash, now, attempt, generation, attempt, generation, now),
        env.RELAY_DB.prepare("UPDATE pending_messages SET state = 'expired', body = '', body_digest = '' WHERE pending_id = (SELECT pending_id FROM capabilities WHERE cap_hash = ? AND consumed_by = 'semantic-discard') AND state = 'staged'").bind(capHash),
        env.RELAY_DB.prepare("DELETE FROM semantic_publish_links WHERE publish_cap_hash = ? AND EXISTS (SELECT 1 FROM capabilities WHERE cap_hash = ? AND consumed_by = 'semantic-discard')").bind(capHash, capHash),
        env.RELAY_DB.prepare("UPDATE semantic_sessions SET status = 'editing', review_attempt_id = NULL, review_state_id = NULL, review_lease_until = NULL WHERE session_id = ? AND status = 'review-ready' AND review_attempt_id = ? AND review_generation = ? AND EXISTS (SELECT 1 FROM capabilities WHERE cap_hash = ? AND consumed_by = 'semantic-discard')")
          .bind(action.session_id, attempt, generation, capHash),
      ]);
      const sessionId = action.session_id;
      const stateId = action.state_id;
      const session = await env.RELAY_DB.prepare("SELECT expires_at FROM semantic_sessions WHERE session_id = ?").bind(sessionId).first();
      if (!session || session.expires_at <= now) return problem("Draft unavailable", "The session expired before the private draft could be discarded.", 410);
      const view = await signedView(env, deps.deriveCapability, sessionId, stateId, session.expires_at);
      return Response.redirect(new URL(viewUrl(sessionId, stateId, view), request.url), 303);
    }
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : error instanceof RangeError ? 413 : 400;
    return problem("Semantic composer request failed", error.message || "The request could not be completed safely.", status);
  }
  return problem("Not found", "This semantic composer route is unavailable.", 404);
}

export const SEMANTIC_COMPOSER_METADATA = Object.freeze({ version: VERSION, condition: CONDITION, renderer: RENDERER, model: MODEL, lexicon: LEXICON, prediction_enabled: false });
