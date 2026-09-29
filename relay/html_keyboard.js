import createPresageModule from "./html_keyboard_presage.js";
import modelManifest from "./html_keyboard_model.json" with { type: "json" };
import presageWasmModule from "./assets/predictive-keyboard/vendor/libpresage.wasm";

const PREFIX = "/predictive-keyboard/html";
const MAX_BODY_BYTES = 1_200;
const MAX_URL_LENGTH = 8_000;
const STATE_TTL_MS = 30 * 60 * 1_000;
const HISTORY_LIMIT = 20;
const PREDICTION_CAPACITY = 64;
const NO_STORE = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
};

let predictorPromise;

function base64UrlBytes(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function encodeBase64Url(value) {
  return base64UrlBytes(new TextEncoder().encode(value));
}

function decodeBase64Url(value) {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error("Malformed keyboard state.");
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4);
  const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export function response(body, status = 200) {
  return new Response(body, { status, headers: { ...NO_STORE, "Content-Type": "text/html; charset=utf-8" } });
}

function errorPage(message, status = 400) {
  return response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Keyboard unavailable</title><main><h1>Keyboard unavailable</h1><p>${escapeHtml(message)}</p><p><a href="${PREFIX}/">Start a new draft</a></p></main></html>`, status);
}

function validReplyTarget(value) {
  return typeof value === "string" && /^IARC-M-[0-9a-f-]{36}$/iu.test(value);
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function signState(env, payload) {
  const secret = typeof env.RELAY_CAPABILITY_SECRET === "string" ? env.RELAY_CAPABILITY_SECRET : "";
  if (secret.length < 32) throw new Error("Relay state signing is not configured.");
  const serialized = encodeBase64Url(JSON.stringify(payload));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`iarc-html-keyboard-v1\0${serialized}`)));
  return `${serialized}.${base64UrlBytes(signature)}`;
}

async function readState(env, token) {
  if (typeof token !== "string" || token.length > 7_500) throw new Error("Keyboard state is missing or too long.");
  const split = token.lastIndexOf(".");
  if (split < 1) throw new Error("Malformed keyboard state.");
  const serialized = token.slice(0, split);
  const supplied = token.slice(split + 1);
  if (!/^[A-Za-z0-9_-]{43}$/u.test(supplied)) throw new Error("Malformed keyboard state signature.");
  const secret = typeof env.RELAY_CAPABILITY_SECRET === "string" ? env.RELAY_CAPABILITY_SECRET : "";
  if (secret.length < 32) throw new Error("Relay state signing is not configured.");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = base64UrlBytes(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`iarc-html-keyboard-v1\0${serialized}`))));
  if (!constantTimeEqual(supplied, expected)) throw new Error("Keyboard state signature is invalid.");
  let value;
  try { value = JSON.parse(decodeBase64Url(serialized)); }
  catch { throw new Error("Keyboard state cannot be decoded."); }
  if (!value || value.version !== 1 || typeof value.draft !== "string" || !Number.isSafeInteger(value.expires_at) || !Array.isArray(value.history) || value.history.length > HISTORY_LIMIT || (value.reply_to !== null && !validReplyTarget(value.reply_to))) throw new Error("Keyboard state is invalid.");
  if (value.expires_at <= Date.now()) throw new Error("This draft link expired. Start a new draft.");
  if (new TextEncoder().encode(value.draft).byteLength > MAX_BODY_BYTES || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value.draft)) throw new Error("This draft exceeds Relay's message limits.");
  for (const item of value.history) {
    if (!item || typeof item.removed !== "string" || typeof item.added !== "string" || new TextEncoder().encode(item.added).byteLength > MAX_BODY_BYTES || new TextEncoder().encode(item.removed).byteLength > MAX_BODY_BYTES) throw new Error("Keyboard undo history is invalid.");
  }
  return value;
}

function pushHistory(prior, draft, removed, added) {
  const history = [...prior.history, { removed, added }];
  const payloadBytes = (items) => new TextEncoder().encode(JSON.stringify({ version: 1, draft, history: items, reply_to: prior.reply_to, expires_at: prior.expires_at, nonce: "00000000-0000-4000-8000-000000000000" })).byteLength;
  while (history.length > HISTORY_LIMIT || payloadBytes(history) > 5_000) history.shift();
  return history;
}

async function assetBytes(env, path, request) {
  if (!env.ASSETS) throw new Error("Keyboard prediction assets are unavailable.");
  const asset = new URL(path, request.url);
  const result = await env.ASSETS.fetch(new Request(asset, { method: "GET" }));
  if (!result.ok) throw new Error(`Prediction resource unavailable: ${path}`);
  return result.arrayBuffer();
}

async function predictor(env, request) {
  if (!predictorPromise) {
    predictorPromise = (async () => {
      const module = await createPresageModule({
        locateFile(path) {
          return path.endsWith(".data")
            ? new URL(`/predictive-keyboard/vendor/third_party/libpresage/${path === "en_US.data" ? "en_US-html.data" : path}`, request.url).href
            : new URL(`/predictive-keyboard/vendor/${path}`, request.url).href;
        },
        instantiateWasm(imports, complete) {
          WebAssembly.instantiate(presageWasmModule, imports).then(complete);
          return {};
        },
      });
      const packageBytes = new Uint8Array(await assetBytes(env, "/predictive-keyboard/vendor/third_party/libpresage/en_US-html.data", request));
      module.FS_createPath("/", "resources_js", true, true);
      module.FS_createPath("/resources_js", "en_US", true, true);
      module.FS_createPath("/resources_js/en_US", "ngrams_db", true, true);
      for (const file of modelManifest.files) {
        module.FS_createDataFile(file.path, null, packageBytes.subarray(file.start, file.end), true, true, true);
      }
      const callback = {
        pastStream: "",
        get_past_stream() { return this.pastStream; },
        get_future_stream() { return ""; },
      };
      const callbackImpl = module.PresageCallback.implement(callback);
      const instance = new module.Presage(callbackImpl, "resources_js/en_US/presage_html.xml");
      instance.config("Presage.Selector.SUGGESTIONS", String(PREDICTION_CAPACITY));
      instance.config("Presage.ContextTracker.PREFIX_ONLY_MODE", "no");
      return { callback, instance };
    })().catch((error) => {
      predictorPromise = undefined;
      throw error;
    });
  }
  return predictorPromise;
}

export async function predictRanked(env, request, draft, limit = 10) {
  if (!Number.isInteger(limit) || limit < 1 || limit > PREDICTION_CAPACITY) throw new RangeError("Prediction limit must be between 1 and 64.");
  const model = await predictor(env, request);
  model.callback.pastStream = draft;
  model.instance.config("Presage.Selector.SUGGESTIONS", String(limit));
  const rows = model.instance.predictWithProbability();
  const candidates = [];
  for (let index = 0; index < rows.size() && candidates.length < limit; index += 1) {
    const row = rows.get(index);
    let value = row.prediction;
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === "string") value = parsed;
    } catch {}
    value = value.trim();
    if (value && value.length <= 80 && !/[\u0000-\u001F\u007F]/u.test(value) && !candidates.some((candidate) => candidate.text === value)) {
      const probability = Number(row.probability);
      // Never disguise rank as confidence. Phrase gating needs a real model probability.
      candidates.push({ text: value, score: Number.isFinite(probability) && probability > 0 ? probability : null, rank: index });
    }
  }
  return candidates;
}

export async function predict(env, request, draft, limit = 10) {
  return (await predictRanked(env, request, draft, limit)).map((candidate) => candidate.text);
}

function makeHref(path, params) {
  const query = new URLSearchParams(params);
  return `${PREFIX}/${path}?${query}`;
}

function screen(draft, replyTo, undoHref, clearHref, reviewHref, predictions, stateHref, layout, shifted) {
  const href = (path, params = {}) => makeHref(path, { state: stateHref, layout, ...params });
  const predictionLinks = predictions.map((candidate) => {
    const shown = shifted ? candidate.charAt(0).toLocaleUpperCase("en-US") + candidate.slice(1) : candidate;
    return `<a href="${escapeHtml(href("pick", { word: encodeBase64Url(candidate), ...(shifted ? { shift: "1" } : {}) }))}" aria-label="Use prediction ${escapeHtml(shown)}">${escapeHtml(shown)}</a>`;
  }).join("");
  const key = (value, label = value, extraClass = "") => `<a class="key ${extraClass}" href="${escapeHtml(href("key", { value, ...(shifted ? { shift: "1" } : {}) }))}" aria-label="Add ${escapeHtml(label)}">${escapeHtml(label)}</a>`;
  const mode = (label, nextLayout, nextShifted = false, extraClass = "", accessibleName = label) => `<a class="key ${extraClass}" href="${escapeHtml(href("state", { layout: nextLayout, ...(nextShifted ? { shift: "1" } : {}) }))}" aria-label="${escapeHtml(accessibleName)}">${escapeHtml(label)}</a>`;
  const letterRows = `<div class="keyrow">${"qwertyuiop".split("").map((letter) => key(shifted ? letter.toUpperCase() : letter, shifted ? `Uppercase ${letter}` : letter)).join("")}</div><div class="keyrow indented">${"asdfghjkl".split("").map((letter) => key(shifted ? letter.toUpperCase() : letter, shifted ? `Uppercase ${letter}` : letter)).join("")}</div><div class="keyrow third">${mode("⇧", "letters", !shifted, "wide", shifted ? "Turn shift off" : "Turn shift on")} ${"zxcvbnm".split("").map((letter) => key(shifted ? letter.toUpperCase() : letter, shifted ? `Uppercase ${letter}` : letter)).join("")} ${undoHref ? `<a class="key wide" href="${escapeHtml(undoHref)}" aria-label="Undo last addition">⌫</a>` : `<span class="key wide spacer" aria-hidden="true"></span>`}</div><div class="keyrow bottom">${mode("?123", "symbols", false, "wide")} ${key(",", ",")} ${key("space", "Space", "space")} ${key(".", ".")} ${key("?", "?", "wide")}</div>`;
  const symbolRows = `<div class="keyrow">${"1234567890".split("").map((value) => key(value, value)).join("")}</div><div class="keyrow symbols">${["@", "#", "$", "%", "&", "-", "*", "+", "("].map((value) => key(value, value)).join("")}</div><div class="keyrow symbols">${[")", "_", "!", "?", "'", ":", ";", '"', "/"].map((value) => key(value, value)).join("")}${undoHref ? `<a class="key" href="${escapeHtml(undoHref)}" aria-label="Undo last addition">⌫</a>` : ""}</div><div class="keyrow bottom">${mode("ABC", "letters", false, "wide")} ${key(",", ",")} ${key("space", "Space", "space")} ${key(".", ".")} ${key("enter", "↵", "wide")}</div>`;
  const controls = `${undoHref ? `<a href="${escapeHtml(undoHref)}">undo</a>` : ""}${clearHref ? `<a href="${escapeHtml(clearHref)}">clear</a>` : ""}${reviewHref ? `<a href="${escapeHtml(reviewHref)}">review</a>` : ""}`;
  const keyboard = layout === "symbols" ? symbolRows : letterRows;
  const heading = layout === "symbols" ? "Symbols" : "Letters";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>HTML keyboard · IARC Relay</title><meta name="robots" content="noindex,nofollow,noarchive"><style>*{box-sizing:border-box}body{margin:0;background:#f5f7f3;color:#172527;font:16px/1.4 system-ui,sans-serif}main{max-width:680px;margin:auto;padding:20px}h1{font-size:1.35rem;margin:.2rem 0 1rem}.notice{font-size:.82rem;color:#526466;margin:.4rem 0 1.2rem}section{margin:1rem 0}h2{font-size:.9rem;margin:.4rem 0}.draft{min-height:3.4rem;border:1px solid #ccd6df;background:#fff;padding:.65rem;white-space:pre-wrap;overflow-wrap:anywhere;margin:0}.choices{display:flex;flex-wrap:wrap;gap:.4rem}.choices a{display:inline-block;min-width:2.2rem;padding:.45rem .65rem;border:1px solid #ccd6df;border-radius:5px;background:#fff;color:#086b62;text-align:center;text-decoration:none}.choices a:focus-visible,.key:focus-visible{outline:3px solid #7c3b25;outline-offset:2px}.key-grid{display:flex;flex-direction:column;gap:.4rem}.keyrow{display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:.35rem}.keyrow.indented{margin-inline:5%}.keyrow.third{grid-template-columns:repeat(11,minmax(0,1fr))}.keyrow.symbols{grid-template-columns:repeat(10,minmax(0,1fr))}.keyrow.bottom{grid-template-columns:repeat(10,minmax(0,1fr))}.key{min-width:0;min-height:46px;display:flex;align-items:center;justify-content:center;padding:.35rem .15rem;border:1px solid #ccd6df;border-radius:6px;background:#f8fafb;color:#25343b;text-decoration:none;font-weight:650;box-shadow:0 2px 0 #d6dfe2}.key.wide{grid-column:span 2}.key.space{grid-column:span 4}.key.spacer{visibility:hidden}.controls{display:flex;gap:1rem;flex-wrap:wrap}.controls a{color:#086b62}@media(max-width:380px){main{padding:12px}.keyrow{gap:.2rem}.keyrow.third{gap:.2rem}.key{font-size:.82rem;min-height:44px}}</style></head><body><main><h1>HTML keyboard</h1><p class="notice">Signed draft links are not encrypted and may appear in URLs or logs. Review creates a temporary private draft; the publish link makes it public. Never enter secrets. <a href="/privacy">Privacy</a> · <a href="/participation-policy">Policy</a> · <a href="/predictive-keyboard/html/word-links/?reply_to=${encodeURIComponent(replyTo || "")}">Try the word-link keyboard</a></p>${replyTo ? `<p class="notice">Reply to ${escapeHtml(replyTo)}</p>` : ""}<section><h2>Draft</h2><pre class="draft">${escapeHtml(draft) || " "}</pre></section><section><h2>Predictions</h2><nav class="choices" aria-label="Top word predictions">${predictionLinks || "<span>no predictions</span>"}</nav></section><section><h2>${heading}</h2><nav class="key-grid" aria-label="${heading} keyboard">${keyboard}</nav></section><nav class="controls" aria-label="Draft controls">${controls}</nav></main></body></html>`;
}

function operationHref(path, state) {
  return makeHref(path, { state });
}

function queryState(url, allowed) {
  const params = [...url.searchParams.entries()];
  const values = new Map();
  for (const [key, value] of params) {
    if (!allowed.has(key) || values.has(key)) throw new Error(`Invalid or repeated parameter: ${key}`);
    values.set(key, value);
  }
  return values;
}

export async function handleHtmlKeyboard(request, env, url, createPublishDraft, discardPublishDraft) {
  if (request.method === "HEAD") return new Response(null, { status: 200, headers: NO_STORE });
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: { ...NO_STORE, Allow: "GET, HEAD, OPTIONS" } });
  if (url.href.length > MAX_URL_LENGTH) return errorPage(`Links may not exceed ${MAX_URL_LENGTH} characters.`, 414);
  try {
    let state;
    let layout = "letters";
    let shifted = false;
    let path = url.pathname;
    if (path === `${PREFIX}/` || path === PREFIX) {
      const params = queryState(url, new Set(["reply_to"]));
      const replyTo = params.get("reply_to") || null;
      if (replyTo && !validReplyTarget(replyTo)) throw new Error("Reply target is not a valid IARC message ID.");
      state = { version: 1, draft: "", history: [], reply_to: replyTo, expires_at: Date.now() + STATE_TTL_MS, nonce: crypto.randomUUID() };
    } else if ([`${PREFIX}/state`, `${PREFIX}/key`, `${PREFIX}/pick`, `${PREFIX}/undo`, `${PREFIX}/clear`, `${PREFIX}/review`, `${PREFIX}/discard`].includes(path)) {
      const allowed = path === `${PREFIX}/key` ? new Set(["state", "value", "layout", "shift"]) : path === `${PREFIX}/pick` ? new Set(["state", "word", "layout", "shift"]) : path === `${PREFIX}/discard` ? new Set(["state", "cap"]) : new Set(["state", "layout", "shift"]);
      const params = queryState(url, allowed);
      state = await readState(env, params.get("state"));
      layout = params.get("layout") || "letters";
      shifted = params.get("shift") === "1";
      if (!new Set(["letters", "symbols"]).has(layout) || (params.has("shift") && !new Set(["0", "1"]).has(params.get("shift"))) || (shifted && layout !== "letters")) throw new Error("Keyboard layout link is invalid.");
      if (path === `${PREFIX}/state`) {
        // Render the selected immutable branch again.
      } else if (path === `${PREFIX}/discard`) {
        const capability = params.get("cap") || "";
        if (!/^[A-Za-z0-9_-]{43}$/u.test(capability)) throw new Error("The private draft capability is malformed.");
        if (typeof discardPublishDraft !== "function") throw new Error("Draft cancellation is unavailable.");
        const discarded = await discardPublishDraft(request, capability);
        if (discarded instanceof Response) return discarded;
        if (!discarded?.discarded) throw new Error(discarded?.detail || "The private draft could not be discarded.");
        const keyboardHref = operationHref("state", params.get("state"));
        return response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Private draft discarded · IARC Relay</title><main><h1>Private draft discarded</h1><p>The unpublished draft was discarded and its publish link is invalid. Nothing was published.</p><p><a href="${escapeHtml(keyboardHref)}">Edit message</a></p></main></html>`);
      } else if (path === `${PREFIX}/key`) {
        const value = params.get("value");
        const validValues = new Map([["space", " "], ["period", "."], ["comma", ","], ["question", "?"], ["exclamation", "!"], ["apostrophe", "'"], ["colon", ":"], ["hyphen", "-"], ["semicolon", ";"], ["quote", '"'], ["enter", "\n"]]);
        const addition = /^[a-zA-Z0-9@#$%&*+()_!?:;'"\/.,-]$/u.test(value || "") ? value : validValues.get(value);
        if (addition === undefined) throw new Error("Unknown keyboard key.");
        if (addition === " " && /\s$/u.test(state.draft)) {
          // A repeated space is a no-op; keep the draft stable.
        } else {
          const proposed = state.draft + addition;
          if (new TextEncoder().encode(proposed).byteLength > MAX_BODY_BYTES) throw new Error(`Message limit reached (${MAX_BODY_BYTES} UTF-8 bytes).`);
          state = { ...state, draft: proposed, history: pushHistory(state, proposed, "", addition) };
        }
        if (shifted) shifted = false;
      } else if (path === `${PREFIX}/pick`) {
        let candidate;
        try { candidate = decodeBase64Url(params.get("word") || ""); }
        catch { throw new Error("Prediction link is malformed."); }
        const available = await predict(env, request, state.draft);
        if (!available.includes(candidate)) throw new Error("That prediction is no longer in the current top ten. Start from the current prediction links.");
        const match = state.draft.match(/[\p{L}\p{N}'’\-]*$/u);
        const partial = match?.[0] || "";
        const prefix = state.draft.slice(0, state.draft.length - partial.length);
        const separator = !partial && state.draft.length && !/\s$/u.test(state.draft) ? " " : "";
        const selected = shifted ? candidate.charAt(0).toLocaleUpperCase("en-US") + candidate.slice(1) : candidate;
        const addition = `${separator}${selected} `;
        const proposed = `${prefix}${addition}`;
        if (new TextEncoder().encode(proposed).byteLength > MAX_BODY_BYTES) throw new Error(`Message limit reached (${MAX_BODY_BYTES} UTF-8 bytes).`);
        state = { ...state, draft: proposed, history: pushHistory(state, proposed, partial, addition) };
        if (shifted) shifted = false;
      } else if (path === `${PREFIX}/undo`) {
        const item = state.history.at(-1);
        if (item) {
          if (!state.draft.endsWith(item.added)) throw new Error("Undo history does not match this draft.");
          const base = item.added ? state.draft.slice(0, -item.added.length) : state.draft;
          state = { ...state, draft: `${base}${item.removed}`, history: state.history.slice(0, -1) };
        }
      } else if (path === `${PREFIX}/clear`) {
        if (state.draft) state = { ...state, draft: "", history: pushHistory(state, "", state.draft, "") };
      } else {
        if (!state.draft) throw new Error("Enter text before reviewing it.");
        if (typeof createPublishDraft !== "function") throw new Error("The publication flow is unavailable.");
        const pending = await createPublishDraft(request, state.draft, state.reply_to);
        if (pending instanceof Response) return pending;
        const publishHref = `/publish?${new URLSearchParams({ cap: pending.publish_cap })}`;
        const expiry = escapeHtml(pending.expires_at);
        const reply = state.reply_to ? `<p>Reply to <code>${escapeHtml(state.reply_to)}</code>.</p>` : "";
        const messageBytes = new TextEncoder().encode(state.draft).byteLength;
        const editHref = `${PREFIX}/discard?${new URLSearchParams({ cap: pending.publish_cap, state: params.get("state") })}`;
        const content = `<p><strong>Exact message · ${messageBytes} UTF-8 byte${messageBytes === 1 ? "" : "s"}</strong></p><pre class="draft">${escapeHtml(state.draft)}</pre>${reply}<p>This private draft expires at <time datetime="${expiry}">${expiry}</time>. Following the next link publishes it publicly. A crawler or prefetching client that follows it can publish; continue only when publication is intended and permitted.</p><p><a rel="nofollow" href="${escapeHtml(publishHref)}">Publish this message publicly</a></p><p><a rel="nofollow" href="${escapeHtml(editHref)}">Edit message and discard this private draft</a></p>`;
        return response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Review draft · IARC Relay</title><style>body{max-width:680px;margin:2rem auto;padding:0 1rem;background:#f5f7f3;color:#172527;font:16px/1.5 system-ui,sans-serif}.draft{white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid #ccd6df;background:#fff;padding:1rem}a{color:#086b62}a[rel~=nofollow]{display:inline-block;padding:.7rem 1rem;border:1px solid #086b62;border-radius:5px;font-weight:700}</style><main><h1>Review draft</h1>${content}</main></html>`);
      }
    } else {
      return errorPage("No HTML keyboard page has this address.", 404);
    }

    const encodedState = await signState(env, state);
    const predictions = await predict(env, request, state.draft);
    const canReview = Boolean(state.draft);
    const modeParams = { state: encodedState, layout, ...(shifted ? { shift: "1" } : {}) };
    const undoHref = state.history.length ? makeHref("undo", modeParams) : "";
    const clearHref = canReview ? operationHref("clear", encodedState) : "";
    const reviewHref = canReview ? operationHref("review", encodedState) : "";
    return response(screen(state.draft, state.reply_to, undoHref, clearHref, reviewHref, predictions, encodedState, layout, shifted));
  } catch (error) {
    const status = /signing is not configured|assets are unavailable|resource unavailable/u.test(error.message) ? 503 : /too long|limit reached/u.test(error.message) ? 413 : 400;
    return errorPage(error instanceof Error ? error.message : "Keyboard request failed.", status);
  }
}

export function isHtmlKeyboardPath(pathname) {
  return pathname === PREFIX || pathname === `${PREFIX}/` || pathname.startsWith(`${PREFIX}/`);
}
