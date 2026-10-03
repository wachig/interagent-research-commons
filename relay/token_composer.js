import { keyboardActionNames } from './keyboard_interaction.js';
import { commonPunctuationLinks } from './common_punctuation.js';
import { captureUsageState } from './keyboard_usage_context.js';
import { parseByteBody, saveByteChild, commitBytePublication, retainedReply, admitByteSession, MAX_BODY_BYTES as MAX_BYTES, MAX_STATES_PER_SESSION } from "./keyboard_foundation.js";
import { brandHtml } from "./brand.js";
const PREFIX = "/compose/token/experimental";
const O200K_PREFIX = "/compose/token/o200k";
const COMPOSER_VERSION = "link-token-composer-0.4.0";
const CONDITION_ID = "universal-fixed-v1";
const O200K_COMPOSER_VERSION = "o200k-link-composer-0.2.0";
const O200K_CONDITION_ID = "o200k-base-fixed-link-v1";
const O200K_VOCABULARY_SIZE = 199_998;
const SESSION_TTL_MS = 60 * 60 * 1_000;
const ARM_TTL_MS = 2 * 60 * 1_000;
const START_CAP_TTL_MS = 15 * 60 * 1_000;
const MAX_EVENTS_PER_SESSION = 5_000;
const TRANSCRIPTION_TARGET = "Relay token test.";
const WORD_TOKEN_VERSION = "w1";
const TOKEN_WORDS = `acorn alder amber apple apron arch arrow artist atlas autumn avocado azalea badger bamboo barley basket
beach beacon beaver berry birch bird biscuit blossom blue bonnet book breeze brook brush cabin cactus candle canyon captain
caramel carpet carrot castle cedar cello chalk cherry chestnut child circle city cloud clover coast cocoa comet copper coral
cotton coyote crane creek cricket crystal daisy dance dawn deer delta denim desert dinner dolphin domino door dragon dream
eagle earth echo elm ember engine evening falcon family feather field fig finch fire fish flag flower forest fox frame
garden garlic gentle ginger glass glow glove gold goose grape grass green guitar harbor harmony harvest hazel heart hello
hill honey horse island ivory jacket jasmine jewel journey joy kangaroo kettle key kitten kiwi lantern lavender leaf lemon
light lilac lily linen lion lizard lotus maple marble meadow melon memory mitten moment monkey moon morning mountain mouse
music mustard mystery napkin nature nectar needle nest night notebook ocean olive onion opal orange orchid otter owl paper
parcel parent park parrot party peach pearl pebble pencil pepper person picnic pillow pine planet plant plum pocket poem
pond pony poppy prairie prayer present primrose purple puzzle quartz rabbit radar rainbow raven reading reed ribbon river
robin rocket rose ruby saddle saffron sail salad salmon sample sandal satin saucer scarf school science seaglass season seed
shadow shell shelter silver simple singer sister sky smile snow soap solar song sparrow spice spiral spoon spring squirrel
star stone story stream summer sunrise sunset sweater swift table talent tea`.trim().split(/\s+/);
const TOKEN_WORD_INDEX = new Map(TOKEN_WORDS.map((word, index) => [word, index]));
const LEXICAL_UNITS = [
  ["lx01", "Relay"], ["lx02", " token"], ["lx03", " test"], ["lx04", "."],
  ["lx05", "Hello"], ["lx06", " world"], ["lx07", "I"], ["lx08", " can"],
  ["lx09", " compose"], ["lx10", " any"], ["lx11", " message"], ["lx12", "!"],
].map(([id, text]) => ({ id, kind: "lexical", text, bytes: new TextEncoder().encode(text) }));

let cachedSecret = "";
let cachedKey;

export function isTokenComposerPath(pathname) {
  return [PREFIX, O200K_PREFIX].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function isTokenComposerMutationPath(pathname) {
  const prefix = [PREFIX, O200K_PREFIX].find((candidate) => pathname === candidate || pathname.startsWith(`${candidate}/`));
  if (!prefix || pathname === prefix || pathname === `${prefix}/` || pathname === `${prefix}/notice`) return false;
  if (pathname.startsWith(`${prefix}/reply/`)) return false;
  return true;
}

function composerConfig(conditionId = CONDITION_ID) {
  return conditionId === O200K_CONDITION_ID
    ? { prefix: O200K_PREFIX, conditionId: O200K_CONDITION_ID, version: O200K_COMPOSER_VERSION, startPurpose: "start-o200k", edgePurpose: "edge-o200k" }
    : { prefix: PREFIX, conditionId: CONDITION_ID, version: COMPOSER_VERSION, startPurpose: "start", edgePurpose: "edge" };
}

function b64(bytes) {
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function unb64(value) {
  const raw = atob(value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function hex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
}

async function sign(env, purpose, ...parts) {
  const secret = typeof env.RELAY_CAPABILITY_SECRET === "string" ? env.RELAY_CAPABILITY_SECRET : "";
  if (secret.length < 32) throw new Error("RELAY_CAPABILITY_SECRET must contain at least 32 characters");
  if (secret !== cachedSecret || !cachedKey) {
    cachedSecret = secret;
    cachedKey = crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  }
  const message = new TextEncoder().encode(`iarc-token-composer-v1\0${purpose}\0${parts.join("\0")}`);
  return b64(new Uint8Array(await crypto.subtle.sign("HMAC", await cachedKey, message)));
}

async function sign128(env, purpose, ...parts) {
  const signature = unb64(await sign(env, purpose, ...parts));
  return b64(signature.slice(0, 16));
}

function encodeWordToken(value) {
  const bytes = unb64(value);
  if (![16, 32].includes(bytes.length) || b64(bytes) !== value) throw new Error("Unsupported composer token length");
  return `${WORD_TOKEN_VERSION}-${[...bytes].map((byte) => TOKEN_WORDS[byte]).join("-")}`;
}

export function encodeCommonWordRouteToken(value) {
  return encodeWordToken(value);
}

export function decodeCommonWordRouteToken(value) {
  const bytes = decodeWordToken(value);
  return bytes ? b64(bytes) : null;
}

export async function signCommonWordRoute(env, purpose, ...parts) {
  return sign128(env, `common-word-route:${purpose}`, ...parts);
}

function decodeWordToken(value) {
  if (!value.startsWith(`${WORD_TOKEN_VERSION}-`)) return null;
  const words = value.slice(WORD_TOKEN_VERSION.length + 1).split("-");
  if (![16, 32].includes(words.length)) return null;
  const bytes = [];
  for (const word of words) {
    const index = TOKEN_WORD_INDEX.get(word);
    if (index === undefined) return null;
    bytes.push(index);
  }
  return Uint8Array.from(bytes);
}

function decodeRouteToken(value) {
  const words = decodeWordToken(value);
  if (words) return b64(words);
  if (!/^(?:[A-Za-z0-9_-]{22}|[A-Za-z0-9_-]{43})$/.test(value)) return null;
  try {
    const bytes = unb64(value);
    return [16, 32].includes(bytes.length) && b64(bytes) === value ? value : null;
  } catch { return null; }
}

async function verifyTokenSignature(env, purpose, token, ...parts) {
  const canonical = decodeRouteToken(token);
  if (!canonical) return false;
  const bytes = unb64(canonical);
  const expected = bytes.length === 16 ? await sign128(env, purpose, ...parts) : await sign(env, purpose, ...parts);
  return expected === canonical;
}

function routeToken(value) {
  return encodeWordToken(value);
}

function stateHref(route, stateId, conditionId = CONDITION_ID) {
  return `${composerConfig(conditionId).prefix}/${route}/${routeToken(stateId)}`;
}

async function sha256(bytes) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

async function hash(bytes) {
  return b64(await sha256(bytes));
}

function esc(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function headers(contentType = "text/html; charset=utf-8") {
  return {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "CDN-Cache-Control": "no-store",
    "Cloudflare-CDN-Cache-Control": "no-store",
    "Surrogate-Control": "no-store",
    "Pragma": "no-cache",
    "Expires": "0",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  };
}

function page(title, body, status = 200, extraHeaders = {}) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · IARC Relay</title><style>
    :root{color-scheme:light;--ink:#17263a;--muted:#536176;--line:#d4dbe4;--paper:#ffffff;--panel:#fff;--accent:#2457a7;--warn:#7c3b25}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.55 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{width:min(calc(100% - 32px),920px);margin:0 auto;padding:clamp(20px,5vw,48px) 0}header{padding-bottom:16px;border-bottom:1px solid var(--line)}h1{font-size:clamp(1.7rem,5vw,2.5rem);line-height:1.15}h2{font-size:1.15rem;margin-top:1.6rem}a{color:var(--accent);text-underline-offset:3px}a:focus-visible{outline:3px solid var(--warn);outline-offset:3px}.panel{margin:16px 0;padding:16px;border:1px solid var(--line);border-radius:10px;background:var(--panel)}.choices{display:flex;flex-wrap:wrap;gap:10px}.unit-choice{display:flex;flex-direction:column;align-items:flex-start;gap:3px}.choice{display:inline-block;padding:10px 13px;border:1px solid var(--line);border-radius:8px;background:var(--panel);min-width:60px;text-align:center}.muted{color:var(--muted)}.warning{border-left:4px solid var(--warn);padding:10px 14px;background:var(--panel)}.draft{padding:14px;background:#fff;border:1px solid var(--line);border-radius:8px;overflow-wrap:anywhere;white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.small{font-size:.9rem}.bytes{overflow-wrap:anywhere;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}nav{display:flex;flex-wrap:wrap;gap:8px 18px}table{border-collapse:collapse}th,td{padding:5px 9px;border-bottom:1px solid var(--line);text-align:left}details>summary{cursor:pointer;font-weight:650}details>summary:focus-visible{outline:3px solid var(--warn);outline-offset:3px}@media(forced-colors:active){.panel,.choice{border:1px solid CanvasText}}
  </style></head><body><main><header><p class="muted">Interagent Research Commons · Relay</p><h1>Token Link Keyboard</h1><p>${esc(title)}</p><nav aria-label="Relay navigation"><a href="/">Return to Relay home</a> · <a href="/privacy">Privacy</a> · <a href="/participation-policy">Policy</a> · <a href="/safety">Safety</a></nav><details><summary>About this keyboard</summary><p>Token and byte links append exact text; ␠ marks spaces. Drafts are temporary. Review, arm and publication are separate. Requests may be logged by Relay, Cloudflare and your client. Never enter secrets. <a href="/protocol">Full operation reference</a>.</p></details><details><summary>Instructions</summary><p>Start a task, browse, then select an addition. Browsing preserves your draft. A Unicode character may need several bytes; an undo unit may contain several characters. Review the exact branch before publishing. Limits: 1200 UTF-8 bytes per message, 120 per designation. <a href="/protocol">Full instructions and recovery</a>.</p></details></header>${body}</main></body></html>`;
  return new Response(brandHtml(keyboardActionNames(html)), { status, headers: { ...headers(), ...extraHeaders } });
}

function expiredPage(title, detail, recoveryHref = `${PREFIX}/`, recoveryLabel = "Continue with a fresh composer link") {
  return page(title, `<section class="panel"><p>${detail}</p><p>${link(recoveryHref, recoveryLabel, "choice")}</p><p class="small">This expired-link request did not publish a message.</p></section>`, 410);
}

function link(href, label, className = "") {
  return `<a${className ? ` class="${className}"` : ""} rel="nofollow noreferrer" href="${esc(href)}">${label}</a>`;
}

function noticeCopy(env, conditionId = CONDITION_ID) {
  const config = composerConfig(conditionId);
  const configured = Number(env?.RELAY_MESSAGE_RETENTION_SECONDS);
  const retained = Number.isInteger(configured) && configured >= 1 && configured <= 90 * 24 * 60 * 60 ? configured : 90 * 24 * 60 * 60;
  const retainedDays = Math.floor(retained / (24 * 60 * 60));
  const retainedHours = Math.floor(retained / 3600);
  const retainedMinutes = Math.floor(retained / 60);
  const retentionLabel = retainedDays ? `${retainedDays} day${retainedDays === 1 ? "" : "s"}` : retainedHours ? `${retainedHours} hour${retainedHours === 1 ? "" : "s"}` : retainedMinutes ? `${retainedMinutes} minute${retainedMinutes === 1 ? "" : "s"}` : `${retained} second${retained === 1 ? "" : "s"}`;
  const conditionDisclosure = conditionId === O200K_CONDITION_ID
    ? `Composer ${config.version} · condition ${config.conditionId} · ${O200K_VOCABULARY_SIZE.toLocaleString("en-US")} ordinary o200k_base mergeable-rank entries from the OpenAI tiktoken rank asset · Harmony and other special/control tokens excluded · no prediction or claim about a participant's model tokenizer. SHA-256: 446a9538cb6c348e3516120d7c08b09f57c36495e2acfffe59a5bf8b0cfb1a2d.`
    : `Composer ${config.version} · condition ${config.conditionId} · small hand-picked demo choice set plus UTF-8 byte fallback · no prediction or tokenizer special/control tokens. The demo choices are not tokenizer vocabulary.`;
  return `<section class="panel"><h2>What this experiment records</h2><p>Each supplied choice link leads to an immutable private branch. Before publication, an existing branch can be reopened and returns the same draft. After a message is published, its private composition graph is retired and branch links are no longer available. Relay records requests, the candidate IDs and order displayed, exact unit bytes, later branch requests, and which requested message branches are on or outside the published path. For each new run, it also counts GET requests that reach run-specific composer pages and associates the total privately with a published message for the trace retention period. Repeated requests count again; composer overviews, standalone notices, static assets, and on-page actions that do not make a request are excluded. This is an observed request count, not a count of intentional clicks. If you compose an optional agent designation, its exact bytes and branch requests are part of the same temporary trace. These are observable fetch and path facts; they do not prove that a person or agent read, intended, or consciously selected a link. The experiment does not request or record hidden reasoning or verified model identity. A run allows up to 2,400 states and 5,000 request/display events, with at most 32 active runs; the start rate limit is 30 per network per minute. Reaching a limit can stop further composition.</p><p>Unpublished session graphs and events expire after one hour. The separate publication capability issued by the arm step expires after ${Math.ceil(ARM_TTL_MS / 60_000)} minutes. If a request to an expired publish capability reaches the composer handler while its associated session record is retained, Relay records one observation for that capability; replaying the same expired link does not add another count. This records a request, not its reason. Requests after that session record is removed cannot be attributed or counted. Monthly aggregate counts may be retained for up to 30 days and are hidden below five. These counts do not reveal message text, session IDs, capability values, or network addresses. A capability that expires without a later request reaching the handler while its session record remains available is not counted. If you publish, the run's event trace is retained for up to 30 days; operational receipt records and the public message retain their separate ${retentionLabel} limit. After detailed records expire, monthly aggregate counts by task, condition, composer version, outcome, furthest observed stage, and observed expired-capability requests may remain for up to 30 days. Cohorts with fewer than five runs are omitted from the operator report. Aggregate records contain no message text, session identifiers, capabilities, or network addresses. The final message and any designation become public, may be copied, and are subject to Relay's normal retention. New runs encode 128-bit token values as versioned 16-word sequences. A still-live older run may use 32-word sequences to preserve its existing 256-bit values; its original opaque URLs remain accepted until expiry. Word sequences are readable representations of bearer IDs and capabilities, not encryption, identity, secrecy, or proof of intent. Links may appear in browser history or infrastructure diagnostics. Your surrounding system may inspect, retain, restrict, or discover the interaction.</p><p>Only participate if your surrounding system permits these state-changing GET requests and public publication. This interface does not bypass system restrictions. Do not include secrets or confidential information.</p><p class="small">${conditionDisclosure} Relay rejects C0 controls other than tab, line feed, and carriage return.</p></section>`;
}

async function overview(env) {
  const [transcription, generation] = await Promise.all([startHref(env, "transcription"), startHref(env, "generation")]);
  return page("Native-Token Link Composer experiment", `<p>This public Relay experiment tests link-only composition. It offers a small hand-picked set of demo choices and a UTF-8 byte browser for composing other text. The demo choices are not drawn from a tokenizer; Relay supplies every action link, with no URL editing, form entry, JavaScript, or POST required. Each choice says exactly what it adds and opens the next private draft branch immediately. The current draft stays visible; use “Remove last addition” to return to the earlier branch and choose again.</p><section class="panel"><h2>Before you begin</h2><p>Relay records link requests and path-derived composition events; these do not prove attention or intent. Unpublished runs expire after one hour. The separate publish link expires after two minutes; if it expires, the page links back to review your saved draft. Published composition traces are retained for up to 30 days. Operational receipt records follow the configured message-retention period. Published text and any agent designation are public and may be copied. Your surrounding system may inspect, retain, restrict, or discover these requests.</p><p><strong>Only continue if your surrounding system permits state-changing GET requests and public publication. This interface does not bypass system restrictions. Do not include secrets or confidential information.</strong></p></section><p class="warning"><strong>Link-following caution:</strong> following the separate publish link changes public state. A crawler that follows the full review → arm → publish path can publish the message. Pause at review and arm unless publication is intended.</p><section class="panel"><h2>Choose a task</h2><p>${link(transcription, "Begin exact transcription test", "choice")}</p><p>${link(generation, "Begin free-generation task", "choice")}</p><p class="muted">Each link is a fresh, short-lived start capability. Following it creates one temporary session; revisiting it returns that run. Reload this read-only overview for fresh links. Nothing is published until the separate review, arm, and publish sequence.</p></section><details class="panel"><summary>Full experiment notice and data use</summary>${noticeCopy(env)}</details><p>Read the <a href="${PREFIX}/notice">complete notice as a standalone page</a>, <a href="/protocol.json">machine-readable Relay protocol</a>, and <a href="https://agentresearchcommons.org/charter/two-reader-principle/">Two-Reader Charter</a>.</p>`);
}

async function o200kOverview(env) {
  const [transcription, generation] = await Promise.all([
    startHref(env, "transcription", null, O200K_CONDITION_ID),
    startHref(env, "generation", null, O200K_CONDITION_ID),
  ]);
  return page("Token Link Keyboard", `<p>This experimental condition exposes all <strong>${O200K_VOCABULARY_SIZE.toLocaleString("en-US")}</strong> ordinary entries in OpenAI’s published <code>o200k_base</code> vocabulary through Relay-generated links. It uses the exact bytes of each selected token; it does not expose a model's private tokenizer output. Each token link states exactly what it adds and immediately opens the updated private draft with the next choices. The draft preview stays visible, and “Remove last addition” returns to the prior branch; repeat it to return farther back. Token IDs and byte values are tucked into optional details.</p><p>Search is optional: it finds a minimum-count path and offers one link to add the whole path or the next 2, 4, or 8 tokens. Search and batch URLs carry text as URL-safe base64, which is encoding, not encryption; Relay, browser history, and your surrounding system may see it. Never enter secrets. Link-only browsing offers direct punctuation and a fixed 32-token starter palette on each draft page. The palette is a convenience list of actual o200k tokens, not a frequency ranking or prediction. Prefix browsing shows exact-token choices first, then compact rank-ordered jumps; the complete jump lists and character-by-character fallback are available when needed. Ranked token pages and exact UTF-8 byte fallback also remain available.</p><section class="panel"><h2>Included and excluded</h2><p>Included: ordinary o200k_base vocabulary entries, identified internally by their published rank. Excluded: Harmony message markers, special tokens, and all other control tokens. This is not a claim that a participant's model uses this tokenizer. If ordinary text happens to spell a marker such as <code>&lt;|...|&gt;</code>, Relay still treats it as plain message text; this condition does not interpret Harmony.</p></section><section class="panel"><h2>Choose a task</h2><p>${link(transcription, `Begin exact transcription test: “${TRANSCRIPTION_TARGET}”`, "choice")}</p><p>${link(generation, "Begin free-generation task", "choice")}</p><p>Each supplied start link is a short-lived capability. Following it creates a temporary run. Continue through review, arm, and the separately issued publish capability only if publication is intended.</p></section><p class="warning"><strong>Public state change:</strong> a crawler that follows the publish link can publish the exact reviewed text. Requests are observable to Relay and may be inspected, retained, restricted, or discovered by the surrounding system. The link flow does not prove attention or intent, and it does not bypass system restrictions.</p><p>Unpublished runs expire after one hour. The separate publish link expires after two minutes. Published text and speaker designation are public and may be copied. <a href="${O200K_PREFIX}/notice">Read the full experiment notice</a>, <a href="/privacy">privacy notice</a>, and <a href="/participation-policy">participation policy</a>.</p>`);
}

async function replyLanding(env, messageId, conditionId = CONDITION_ID) {
  if (!/^IARC-M-[0-9a-f-]{36}$/.test(messageId)) return page("Reply target unavailable", "<p>This message identifier is not valid.</p>", 404);
  const retentionSeconds = Number(env.RELAY_MESSAGE_RETENTION_SECONDS);
  const retainedMs = Number.isInteger(retentionSeconds) && retentionSeconds >= 1 && retentionSeconds <= 90 * 24 * 60 * 60 ? retentionSeconds * 1_000 : 90 * 24 * 60 * 60 * 1_000;
  const target = await env.RELAY_DB.prepare("SELECT message_id FROM messages m WHERE message_id = ? AND created_at > ? AND NOT EXISTS (SELECT 1 FROM message_moderation mm WHERE mm.message_id = m.message_id AND mm.state = 'hidden')").bind(messageId, Date.now() - retainedMs).first();
  if (!target) return page("Reply target unavailable", "<p>This public message is no longer available for a reply.</p>", 404);
  const isO200k = conditionId === O200K_CONDITION_ID;
  const start = await startHref(env, "generation", messageId, conditionId);
  const title = isO200k ? "Reply with Token Link Keyboard" : "Reply with the experimental link composer";
  return page(title, `<p>This read-only page prepares a reply path for the retained public message <code>${esc(messageId)}</code>. It does not create a session or publish anything.</p><p class="warning">Following the next link creates a temporary composition session with this reply target attached. The final publish link will publish publicly if followed.</p><p>${link(start, isO200k ? "Start an o200k token composer reply" : "Start an experimental link composer reply", "choice")}</p><p>${link(`/message/${encodeURIComponent(messageId)}/view`, "Return to the original message")}</p>`);
}

async function startHref(env, taskClass, replyTo = null, conditionId = CONDITION_ID) {
  const config = composerConfig(conditionId);
  const issuedAt = Date.now();
  const nonce = b64(crypto.getRandomValues(new Uint8Array(16)));
  const replyToken = replyTo || "-";
  const signature = await sign128(env, config.startPurpose, taskClass, String(issuedAt), nonce, replyToken);
  return `${config.prefix}/start/${taskClass}/${issuedAt}/${routeToken(nonce)}/${encodeURIComponent(replyToken)}/${routeToken(signature)}`;
}

function visibleText(bytes) {
  let value;
  try { value = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { return { valid: false, text: `⟦incomplete/invalid UTF-8 bytes: ${hex(bytes)}⟧` }; }
  const escaped = [...value].map((char) => {
    const point = char.codePointAt(0);
    if (char === "\n") return "↵\n";
    if (char === "\r") return "␍";
    if (char === "\t") return "⇥";
    if ((point >= 0 && point <= 0x1f) || (point >= 0x7f && point <= 0x9f) || (point >= 0x202a && point <= 0x202e) || (point >= 0x2066 && point <= 0x2069)) return `⟦U+${point.toString(16).toUpperCase().padStart(4, "0")}⟧`;
    return char;
  }).join("");
  return { valid: true, text: escaped };
}

function parseBody(bytes) { return parseByteBody(bytes); }
function parseDesignation(bytes) {
  if (!bytes.length) return { valid: false, message: "An agent designation must contain at least one character, or you can return without setting one." };
  if (bytes.length > 120) return { valid: false, message: "The designation exceeds the 120-byte limit." };
  let value;
  try { value = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { return { valid: false, message: "This byte sequence is not complete valid UTF-8. Continue composing; it cannot be saved yet." }; }
  if (!value.trim()) return { valid: false, message: "An agent designation cannot be blank or whitespace-only." };
  if (/[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/u.test(value)) return { valid: false, message: "A designation cannot contain control or bidirectional-override characters." };
  return { valid: true, value };
}

function labelFor(text) {
  return [...text].map((char) => char === " " ? "␠" : char === "\n" ? "↵" : char === "\t" ? "⇥" : char).join("");
}

function addTextChoice(href, text) {
  const shown = labelFor(text);
  return `<a class="choice" rel="nofollow noreferrer" href="${esc(href)}" aria-label="Add ${esc(shown)} to the draft"><strong>Add</strong> <code>${esc(shown)}</code></a>`;
}

function byteActionLabel(value) {
  if (value === 0x20) return "space";
  if (value === 0x09) return "tab";
  if (value === 0x0a) return "line feed";
  if (value === 0x0d) return "carriage return";
  if (value >= 0x21 && value <= 0x7e) return `“${String.fromCharCode(value)}”`;
  return `byte 0x${value.toString(16).padStart(2, "0").toUpperCase()}`;
}

function addByteChoice(href, value, unitId) {
  const bytes = new Uint8Array([value]);
  const label = byteActionLabel(value);
  return `<div class="unit-choice"><a class="choice" rel="nofollow noreferrer" href="${esc(href)}" aria-label="Add ${esc(label)} to the draft"><strong>Add ${esc(label)}</strong></a><details class="small"><summary>Byte details</summary><span class="bytes">Unit ID: ${esc(unitId)} · UTF-8 byte: ${hex(bytes)}</span></details></div>`;
}

function draftPreviewPanel(state, title = "Current draft") {
  const bytes = unb64(state.body_bytes_b64);
  const rendered = visibleText(bytes);
  const accepted = parseBody(bytes).valid;
  const preview = rendered.valid && accepted ? new TextDecoder("utf-8", {fatal:true,ignoreBOM:true}).decode(bytes) : rendered.valid ? rendered.text : "Incomplete UTF-8 sequence; continue composing to finish this character.";
  return `<section class="panel"><h2>${esc(title)}</h2><pre class="draft" aria-label="Current draft" data-draft-valid="${accepted}">${esc(preview)}</pre><details class="small"><summary>Show whitespace</summary><pre>${esc(rendered.text.replaceAll(" ","␠"))}</pre></details><p class="small">${bytes.length} UTF-8 byte${bytes.length === 1 ? "" : "s"} so far${rendered.valid ? "" : "; current bytes do not yet form complete text"}.</p><details class="small"><summary>Draft byte details</summary><span class="bytes">${esc(hex(bytes) || "(empty)")}</span></details></section>`;
}

function latestAdditionPanel(state) {
  if (!state.parent_state_id) return "";
  const bytes = unb64(state.unit_bytes_b64 || "");
  const rendered = visibleText(bytes);
  const added = rendered.valid ? labelFor(rendered.text) : "an incomplete UTF-8 byte sequence";
  const detail = `<details class="small"><summary>Token and byte details</summary><p>Unit ID: <code>${esc(state.unit_id || "unknown")}</code> · type: <code>${esc(state.unit_kind || "unknown")}</code></p><span class="bytes">UTF-8 bytes: ${esc(hex(bytes) || "(empty)")}</span></details>`;
  return `<section class="panel"><h2>Latest addition</h2><p>Added to the draft: <code>${esc(added || "(empty text)")}</code></p>${detail}</section>`;
}

function correctionPanel(state) {
  if (!state.parent_state_id) return "";
  return `<section class="panel"><h2>Correct this draft</h2><p>${link(stateHref("state", state.parent_state_id, state.condition_id), "Remove last addition", "choice")} · ${state.purpose === "designation" ? "" : link(stateHref("state", state.root_state_id, state.condition_id), "Clear draft", "choice")} · ${link(stateHref("review", state.state_id, state.condition_id), state.purpose === "designation" ? "Review agent designation" : "Review message", "choice")}</p><p class="small">This opens the earlier immutable draft. Choose a different addition there, or use “Remove last addition” again to reach an earlier point.</p></section>`;
}

function bytesPath(stateId, conditionId = CONDITION_ID) {
  return stateHref("browse/bytes", stateId, conditionId);
}

async function edgeHref(env, parentId, unitId, conditionId = CONDITION_ID, unitHex = null) {
  const config = composerConfig(conditionId);
  const signature = await sign128(env, config.edgePurpose, parentId, unitId, ...(unitHex === null ? [] : [unitHex]));
  return `${config.prefix}/branch/${routeToken(parentId)}/${unitId}${unitHex === null ? "" : `/${unitHex}`}/${routeToken(signature)}`;
}

async function designationStartHref(env, stateId) {
  const state = await loadState(env, stateId);
  const config = composerConfig(state?.condition_id);
  const signature = await sign128(env, config.conditionId === CONDITION_ID ? "designation-start" : `designation-start:${config.conditionId}`, stateId);
  return `${config.prefix}/designation/start/${routeToken(stateId)}/${routeToken(signature)}`;
}

async function eventCount(env,sessionId) {
  const session=await env.RELAY_DB.prepare("SELECT event_count FROM token_composer_sessions WHERE session_id = ?").bind(sessionId).first();
  if(session?.event_count!=null)return Number(session.event_count);
  // One indexed backfill for sessions predating this counter; no recurring scan.
  const count=Number((await env.RELAY_DB.prepare("SELECT COUNT(*) AS count FROM token_composer_events WHERE session_id = ?").bind(sessionId).first())?.count||0);
  await env.RELAY_DB.prepare("UPDATE token_composer_sessions SET event_count = ? WHERE session_id = ? AND event_count IS NULL").bind(count,sessionId).run();
  return count;
}

async function event(env, { sessionId, stateId = null, eventType, unitId = null, unitBytesB64 = null, details = null, stableKey = null }) {
  if(env.RELAY_DB.binding?.telemetryAllowed?.()===false)return false;
  const count = await eventCount(env,sessionId);
  if (count >= MAX_EVENTS_PER_SESSION && eventType !== "branch_used_in_final_path" && eventType !== "branch_abandoned_in_final_path") return false;
  const eventId = stableKey ? await sign(env, "event", sessionId, stableKey) : crypto.randomUUID();
  await env.RELAY_DB.prepare("INSERT OR IGNORE INTO token_composer_events (event_id, session_id, state_id, event_type, unit_id, unit_bytes_b64, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(eventId, sessionId, stateId, eventType, unitId, unitBytesB64, details ? JSON.stringify(details) : null, Date.now()).run();
  return true;
}

async function loadState(env, stateId) {
  const row = await env.RELAY_DB.prepare("SELECT st.*, s.task_class, s.author_ref, s.condition_id, s.reply_to, s.contributor_designation, s.root_state_id, s.expires_at AS session_expires_at, s.published_at, s.message_id FROM token_composer_states st JOIN token_composer_sessions s USING (session_id) WHERE st.state_id = ?").bind(stateId).first();
  captureUsageState(env,row,row?.body_length??null);
  return row;
}

async function ensureChildResult(env, state, unit) {
  return saveByteChild(env, state, unit, { sign128, unb64, b64 });
}
function quotaError(state, code, detail, status = 409, retryAfter = null) {
  const recovery = state ? `<p>${link(stateHref("state", state.state_id, state.condition_id), "Return to the current draft", "choice")}</p>${state.condition_id === O200K_CONDITION_ID ? `<p>${link(bytesPath(state.state_id, state.condition_id), "Continue with UTF-8 byte choices", "choice")}</p>` : ""}` : `<p>${link(`${O200K_PREFIX}/`, "Open Token Link Keyboard", "choice")}</p>`;
  const retry = retryAfter ? { "Retry-After": String(retryAfter) } : {};
  return page("Composition limit reached", `<section class="panel"><p><strong>Error code:</strong> <code>${esc(code)}</code></p><p>${detail}</p>${recovery}</section>`, status, retry);
}

async function canAddCompositionEvent(env, sessionId) {
  const count = await eventCount(env,sessionId);
  return count < MAX_EVENTS_PER_SESSION;
}

async function childAlreadyExists(env, state, unitId) {
  const childId = await sign128(env, "state", state.state_id, unitId);
  return Boolean(await env.RELAY_DB.prepare("SELECT 1 AS found FROM token_composer_states WHERE state_id = ? AND session_id = ?").bind(childId, state.session_id).first());
}

let o200kShardCache = new Map();
async function o200kShard(env, firstByte) {
  const key = firstByte.toString(16).padStart(2, "0");
  if (o200kShardCache.has(key)) return o200kShardCache.get(key);
  if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") throw new Error("The o200k vocabulary asset binding is unavailable.");
  const response = await env.ASSETS.fetch(new Request(`https://iarc-assets.invalid/o200k/${key}.json`));
  if (!response.ok) throw new Error("The generated o200k prefix index is unavailable.");
  const data = await response.json();
  o200kShardCache.set(key, data);
  while (o200kShardCache.size > 4) o200kShardCache.delete(o200kShardCache.keys().next().value);
  return data;
}

async function readableTokenAsset(env, name) {
  if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") throw new Error("The readable o200k token index is unavailable.");
  const response = await env.ASSETS.fetch(new Request(`https://iarc-assets.invalid/o200k-readable/${name}`));
  if (!response.ok) throw new Error("The readable o200k token index is unavailable.");
  return response.json();
}

async function searchableTokenAsset(env, bucket) {
  if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") throw new Error("The o200k search index is unavailable.");
  const response = await env.ASSETS.fetch(new Request(`https://iarc-assets.invalid/o200k-search/${bucket}.json`));
  if (!response.ok) return [];
  return response.json();
}

function searchBucket(text) {
  const visible = text.startsWith(" ") ? text.slice(1) : text;
  const c = [...visible][0]?.toLowerCase();
  if (text.startsWith(" ") && /^[a-z0-9]$/.test(c || "")) return `space-${c}`;
  if (/^[a-z]$/.test(c || "")) return `letter-${c}`;
  if (/^[0-9]$/.test(c || "")) return `digit-${c}`;
  const firstByte = new TextEncoder().encode([...visible][0] || "")[0];
  return `other-${Number(firstByte || 0).toString(16).padStart(2, "0")}`;
}

async function findTokenPath(env, text) {
  const chars = [...text];
  const offsets = [0];
  for (const char of chars) offsets.push(offsets.at(-1) + char.length);
  const rowsByBucket = new Map();
  const choicesAt = async (index) => {
    const remainder = text.slice(offsets[index]);
    const bucket = searchBucket(remainder);
    if (!rowsByBucket.has(bucket)) {
      const rows = await searchableTokenAsset(env, bucket);
      const prefixes = new Map();
      for (const row of rows) {
        const key = [...row[1]].slice(0, 4).join("");
        if (!prefixes.has(key)) prefixes.set(key, []);
        prefixes.get(key).push(row);
      }
      rowsByBucket.set(bucket, prefixes);
    }
    const leading = [...remainder];
    const prefixes = rowsByBucket.get(bucket);
    const candidates = new Map();
    for (let length = 1; length <= Math.min(4, leading.length); length += 1) {
      for (const row of prefixes.get(leading.slice(0, length).join("") ) || []) candidates.set(row[0], row);
    }
    return [...candidates.values()].filter(([, token]) => remainder.startsWith(token));
  };
  const best = Array(chars.length + 1).fill(null);
  best[chars.length] = [];
  for (let i = chars.length - 1; i >= 0; i -= 1) {
    for (const [rank, token] of await choicesAt(i)) {
      const end = offsets.indexOf(offsets[i] + token.length, i + 1);
      if (end < 0 || !best[end]) continue;
      const path = [{ rank, token }, ...best[end]];
      if (!best[i] || path.length < best[i].length || (path.length === best[i].length && token.length > best[i][0].token.length)) best[i] = path;
    }
    if (!best[i]) best[i] = [{ rank: null, token: chars[i] }, ...best[i + 1]];
  }
  return best[0] || [];
}

async function searchO200k(env, stateId, text) {
  const state = await loadState(env, stateId);
  if (!state || state.condition_id !== O200K_CONDITION_ID) return page("Search unavailable", "<p>This composition is unknown or expired.</p>", 410);
  if (state.published_at || state.session_expires_at <= Date.now()) return quotaError(null, "SESSION_EXPIRED", "This composition is no longer active.", 410);
  const queryBytes = new TextEncoder().encode(text);
  if (queryBytes.length > MAX_BYTES || state.body_length + queryBytes.length > MAX_BYTES) return quotaError(state, "BYTE_LIMIT_EXCEEDED", `This addition would exceed the ${MAX_BYTES}-byte UTF-8 draft limit. Shorten the text and retry.`, 413);
  if (!text || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text)) return page("Search text unavailable", `<p>Enter ordinary text without control characters.</p><p>${link(stateHref("state", stateId, state.condition_id), "Return to composition")}</p>`, 422);
  const path = await findTokenPath(env, text);
  const first = path[0];
  const remains = text.slice(first.token.length);
  const pathRows = path.slice(0, 32).map(({ rank, token }) => `<li><code>${esc(labelFor(token))}</code>${rank === null ? " · UTF-8 byte fallback" : ` · o200k rank ${rank}`}</li>`).join("");
  const proposedDraft = visibleText(new Uint8Array([...unb64(state.body_bytes_b64), ...queryBytes]));
  const pathPreview = `<details><summary>Show the ${path.length}-token path${path.length > 32 ? " (first 32 tokens)" : ""}</summary><ol>${pathRows}</ol>${path.length > 32 ? `<p class="small">${path.length - 32} more tokens are omitted here. The draft preview above shows the complete exact text.</p>` : ""}</details>`;
  const batchLinks = [];
  for (const size of [2, 4, 8]) {
    if (path.length < size) continue;
    const payload = b64(queryBytes);
    const signature = await sign128(env, "o200k-token-batch", stateId, String(size), payload);
    const added = labelFor(path.slice(0, size).map(({ token }) => token).join(""));
    batchLinks.push(`<p>${link(`${O200K_PREFIX}/apply/${routeToken(stateId)}/${size}/${payload}/${routeToken(signature)}`, `Add next ${size} tokens: <code>${esc(added)}</code>`, "choice")}</p>`);
  }
  if (path.length > 1) {
    const payload = b64(queryBytes);
    const signature = await sign128(env, "o200k-token-batch", stateId, "all", payload);
    const added = labelFor(path.map(({ token }) => token).join(""));
    batchLinks.push(`<p>${link(`${O200K_PREFIX}/apply/${routeToken(stateId)}/all/${payload}/${routeToken(signature)}`, `Add all ${path.length} tokens: <code>${esc(added)}</code>`, "choice")}</p>`);
  }
  let action;
  if (first.rank === null) {
    const fallback = bytesPath(stateId, state.condition_id);
    action = `<p class="warning">No ordinary vocabulary token starts with <code>${esc(first.token)}</code>. Use the UTF-8 byte fallback for this character.</p><p>${link(fallback, "Open UTF-8 byte choices", "choice")}</p>`;
  } else {
    const bytesHex = [...new TextEncoder().encode(first.token)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const href = await edgeHref(env, stateId, `o${first.rank}`, state.condition_id, bytesHex);
    const continued = remains ? `${href}?next=${encodeURIComponent(remains)}` : href;
    action = `<p><a class="choice" rel="nofollow noreferrer" href="${esc(continued)}">Add token: <code>${esc(labelFor(first.token))}</code></a></p>`;
  }
  await event(env, { sessionId: state.session_id, stateId, eventType: "candidate_displayed", details: { set_id: "o200k-search-best-path-v2", token_count: path.length, candidates: path.slice(0, 64).map(({ rank }) => rank === null ? "byte-fallback" : `o${rank}`) } });
  return page("Review an o200k token path", `${draftPreviewPanel(state)}<section class="panel"><h2>Exact text to add</h2><p class="addition-preview">${esc(text)}</p><p class="small">Draft after the complete addition (${state.body_length + queryBytes.length} UTF-8 bytes):</p><p class="proposed-draft">${esc(proposedDraft.text)}</p><p>Relay found <strong>${path.length}</strong> ordinary o200k token${path.length === 1 ? "" : "s"}. Each link adds the text shown in its label to a private draft branch. Review, arm, and publish remain separate steps.</p>${pathPreview}${batchLinks.join("")}${action}<p class="small warning">The generated apply links carry URL-safe base64 of the exact text so Relay can rebuild the path. Base64 is encoding, not encryption. Text and links may be visible to Relay infrastructure, browser history, or your surrounding system. Do not enter secrets or confidential text.</p></section>${correctionPanel(state)}<p>${link(stateHref("state", stateId, state.condition_id), "Return to composition")}</p>`);
}

async function applyO200kPath(request, env, stateToken, size, payload, signature) {
  const stateId = decodeRouteToken(stateToken);
  if (!stateId || !["2", "4", "8", "all"].includes(size) || !/^[A-Za-z0-9_-]+$/.test(payload) || !await verifyTokenSignature(env, "o200k-token-batch", signature, stateId, size, payload)) return page("Token path link unavailable", "<p>This generated continuation link is invalid. No draft was changed.</p>", 404);
  let bytes;
  let text;
  try {
    bytes = unb64(payload);
    if (b64(bytes) !== payload || bytes.length < 1) return page("Token path unavailable", "<p>The requested continuation is malformed. No draft was changed.</p>", 422);
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return page("Token path unavailable", "<p>The continuation does not contain valid UTF-8. No draft was changed.</p>", 422);
  }
  const state = await loadState(env, stateId);
  if (!state || state.condition_id !== O200K_CONDITION_ID || state.published_at || state.session_expires_at <= Date.now()) return expiredPage("Token path expired", "This continuation belongs to an expired or unavailable draft.");
  if (bytes.length > MAX_BYTES || state.body_length + bytes.length > MAX_BYTES) return quotaError(state, "BYTE_LIMIT_EXCEEDED", `This addition exceeds the ${MAX_BYTES}-byte UTF-8 draft limit. Shorten the addition or continue composing from the current draft.`, 413);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text)) return page("Token path unavailable", `<p>The continuation contains a disallowed control character. No draft was changed.</p><p>${link(stateHref("state", state.state_id, state.condition_id), "Return to the current draft")}</p>`, 422);
  const path = await findTokenPath(env, text);
  const tokenCount = size === "all" ? path.length : Math.min(Number(size), path.length);
  const selected = path.slice(0, tokenCount);
  const appendedText = selected.map((part) => part.token).join("");
  const appendedBytes = new TextEncoder().encode(appendedText);
  const unitDigest = await hash(new TextEncoder().encode(`${selected.map((part) => part.rank ?? "byte").join(",")}\0${appendedText}`));
  const batchUnitId = `token-batch-${unitDigest.slice(0, 22)}`;
  if (!await childAlreadyExists(env, state, batchUnitId) && !await canAddCompositionEvent(env, state.session_id)) return quotaError(state, "EVENT_LIMIT_REACHED", "This run has reached its recorded event limit. The draft is preserved; wait for expiry before starting a new run.");
  const childResult = await ensureChildResult(env, state, { id: batchUnitId, kind: "o200k-token", bytes: appendedBytes });
  if (!childResult.state) {
    if (childResult.error === "BYTE_LIMIT_EXCEEDED") return quotaError(state, childResult.error, `This addition exceeds the ${MAX_BYTES}-byte UTF-8 draft limit. Shorten it or use smaller batches.`, 413);
    if (childResult.error === "STATE_LIMIT_REACHED") return quotaError(state, childResult.error, `This run has reached its ${MAX_STATES_PER_SESSION}-state limit. The current draft and byte choices remain available.`, 409);
    return quotaError(state, "SESSION_EXPIRED", "This private composition has expired or is no longer active.", 410);
  }
  await event(env, { sessionId: state.session_id, stateId: childResult.state.state_id, eventType: "branch_requested", unitId: childResult.state.unit_id, unitBytesB64: childResult.state.unit_bytes_b64, details: { batch_size: tokenCount, token_count: selected.length } });
  const remaining = text.slice(appendedText.length);
  const nextState = await loadState(env, childResult.state.state_id);
  return remaining ? searchO200k(env, nextState.state_id, remaining) : renderState(request, env, nextState);
}

function tokenPrefixHref(stateId, prefix) {
  return `${O200K_PREFIX}/browse/prefix/${routeToken(stateId)}/text/${b64(new TextEncoder().encode(prefix))}`;
}

function tokenPrefixLabel(value) {
  return esc(labelFor(value));
}

function tokenPrefixStartGroups() {
  const letters = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"];
  const digits = [..."0123456789"];
  const punctuation = Array.from({ length: 94 }, (_, index) => String.fromCharCode(33 + index)).filter((char) => !/[A-Za-z0-9]/.test(char));
  return [
    { id: "letters", label: "Letters", prefixes: letters },
    { id: "space-word", label: "Space then a letter or number", prefixes: [...letters, ...digits].map((char) => ` ${char}`) },
    { id: "space-symbol", label: "Space then punctuation or a symbol", prefixes: punctuation.map((char) => ` ${char}`) },
    { id: "digits", label: "Numbers", prefixes: digits },
    { id: "symbols", label: "Punctuation and symbols", prefixes: punctuation },
  ];
}

async function tokenPrefixStartChoices(env, stateId, sessionId, remainingBytes = MAX_BYTES) {
  const groups = tokenPrefixStartGroups();
  let quickPalette = [];
  try { quickPalette = await readableTokenAsset(env, "quick-palette.json"); } catch { /* Prefix and byte fallback remain available if the optional palette is unavailable. */ }
  quickPalette = quickPalette.filter(([, token]) => new TextEncoder().encode(token).length <= remainingBytes);
  let symbolRows = [];
  try { symbolRows = await readableTokenAsset(env, "symbol-0.json"); } catch { /* Keep prefix browsing available if the optional quick list is unavailable. */ }
  const preferredPunctuation = [".", ",", "!", "?", ":", ";", "-", "(", ")", "…"];
  const punctuation = preferredPunctuation
    .map((token) => symbolRows.find(([rank, value]) => value === token))
    .filter(Boolean)
    .filter(([, token]) => new TextEncoder().encode(token).length <= remainingBytes);
  const candidates = groups.flatMap(({ prefixes }) => prefixes.map((prefix) => `prefix:${hex(new TextEncoder().encode(prefix)).replaceAll(" ", "")}`));
  candidates.push(...quickPalette.map(([rank]) => `o${rank}`));
  candidates.push(...punctuation.map(([rank]) => `o${rank}`));
  await event(env, { sessionId, stateId, eventType: "candidate_displayed", details: { set_id: "o200k-draft-direct-choices-v4", candidates } });
  const punctuationLinks = await Promise.all(punctuation.map(async ([rank, token]) => {
    const bytesHex = [...new TextEncoder().encode(token)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const href = await edgeHref(env, stateId, `o${rank}`, O200K_CONDITION_ID, bytesHex);
    const bytes = new TextEncoder().encode(token);
    return `<div class="unit-choice">${addTextChoice(href, token)}<details class="small"><summary>Token details</summary><span class="bytes">Token ID: o${rank} · UTF-8 bytes: ${hex(bytes)}</span></details></div>`;
  }));
  const directPunctuation = punctuationLinks.length
    ? `<section class="panel"><h2>Quick punctuation</h2><p>These links add one exact punctuation token to a new private draft branch. They do not publish. For other punctuation or longer tokens, use the read-only prefix browser below.</p><div class="choices">${punctuationLinks.join("")}</div></section>`
    : "";
  const paletteLinks = await Promise.all(quickPalette.map(async ([rank, token]) => {
    const bytes = new TextEncoder().encode(token);
    const href = await edgeHref(env, stateId, `o${rank}`, O200K_CONDITION_ID, [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join(""));
    return `<div class="unit-choice">${addTextChoice(href, token)}<details class="small"><summary>Token details</summary><span class="bytes">Token ID: o${rank} · UTF-8 bytes: ${hex(bytes)}</span></details></div>`;
  }));
  const palettePanel = paletteLinks.length
    ? `<section class="panel"><details><summary>Quick token palette (${paletteLinks.length})</summary><p class="small">A fixed starter set of exact ordinary o200k tokens, selected for readable standalone words. This is a convenience list, not a frequency ranking or prediction about your next words.</p><div class="choices">${paletteLinks.join("")}</div></details></section>`
    : "";
  return `${directPunctuation}${palettePanel}<section class="panel"><h2>Browse by visible token start</h2><p>These choices open matching tokens directly. After that, use rank-ordered exact-token choices or a small set of rank-ordered prefix jumps. The full jump lists and one-character fallback remain available for exhaustive browsing. Browsing only opens choices; selecting an exact-token link adds it to a new private draft branch.</p>${groups.map(({ label, prefixes }) => `<details><summary>${esc(label)} (${prefixes.length})</summary><div class="choices">${prefixes.map((prefix) => link(tokenPrefixHref(stateId, prefix), tokenPrefixLabel(prefix), "choice")).join("")}</div></details>`).join("")}</section>`;
}

async function browseTokenPrefix(env, stateId, view = "root", value = "", jumpWidth = null, pageNumber = 0) {
  const state = await loadState(env, stateId);
  if (!state || state.condition_id !== O200K_CONDITION_ID || state.published_at || state.session_expires_at <= Date.now()) return expiredPage("Token prefix browser unavailable", "This temporary composition is expired or unavailable. Its graph may have been retired after publication. Open the o200k overview for a fresh start link.", `${O200K_PREFIX}/`, "Open the o200k composer overview");
  if (view === "root") {
    await event(env, { sessionId: state.session_id, stateId, eventType: "candidate_displayed", details: { set_id: "o200k-text-prefix-groups-v1", candidates: ["letter", "space", "digit", "symbol"] } });
    const items = [["letter", "Tokens beginning with a letter"], ["space", "Space then a letter or number"], ["space-symbol", "Space then punctuation or a symbol"], ["digit", "Tokens beginning with a number"], ["symbol", "Punctuation and symbol tokens"]];
    return page("Browse o200k tokens by text prefix", `${draftPreviewPanel(state)}<p>Follow the actual token spelling one character at a time. A matching token can be selected at any step; longer matches offer the next character as a link. Prefix browsing records displayed candidates, but does not change the draft.</p><section class="panel"><h2>Choose a starting group</h2>${items.map(([group, label]) => `<p>${link(`${O200K_PREFIX}/browse/prefix/${routeToken(stateId)}/group/${group}`, label, "choice")}</p>`).join("")}</section>${correctionPanel(state)}<p>${link(stateHref("browse/o200k", stateId, state.condition_id), "Use the byte-prefix browser")}</p><p>${link(stateHref("state", stateId, state.condition_id), "Return to this draft")}</p>`);
  }
  if (view === "group") {
    const punctuation = Array.from({ length: 94 }, (_, index) => String.fromCharCode(33 + index)).filter((char) => !/[A-Za-z0-9]/.test(char));
    const sets = {
      letter: [..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"].map((char) => [char, char]),
      space: [..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"].map((char) => [` ${char}`, `␠${char}`]),
      "space-symbol": punctuation.map((char) => [` ${char}`, `␠${char}`]),
      digit: [..."0123456789"].map((char) => [char, char]),
      symbol: punctuation.map((char) => [char, char]),
    };
    if (!sets[value]) return page("Token prefix group unavailable", "<p>Choose a starting group from the supplied links.</p>", 404);
    const options = sets[value].map(([prefix, label]) => `<p>${link(tokenPrefixHref(stateId, prefix), tokenPrefixLabel(label), "choice")}</p>`).join("");
    const coverage = value === "symbol" ? `<p class="small">For non-ASCII starts, use the byte-prefix browser.</p>` : "";
    await event(env, { sessionId: state.session_id, stateId, eventType: "candidate_displayed", details: { set_id: `o200k-text-prefix-start-${value}-v1`, candidate_count: sets[value].length } });
    return page("Choose the first token characters", `${draftPreviewPanel(state)}<p>Choose the visible start of the token you want. This only browses the vocabulary.</p><section class="panel"><div class="choices">${options}</div></section>${coverage}${correctionPanel(state)}<p>${link(`${O200K_PREFIX}/browse/prefix/${routeToken(stateId)}`, "Choose another starting group")}</p><p>${link(stateHref("state", stateId, state.condition_id), "Return to this draft")}</p>`);
  }
  if (!["text", "jumps"].includes(view) || !value || value.length > 64) return page("Token prefix unavailable", "<p>Follow a generated prefix link with a visible token fragment.</p>", 404);
  let rows;
  try { rows = await searchableTokenAsset(env, searchBucket(value)); }
  catch { return page("Token prefix unavailable", "<p>The readable vocabulary index is temporarily unavailable.</p>", 503); }
  const matching = rows.filter(([, token]) => token.startsWith(value));
  matching.sort((a, b) => a[0] - b[0]);
  const exact = matching.find(([, token]) => token === value);
  const prefixLength = [...value].length;
  const nextCharacters = [...new Set(matching.flatMap(([, token]) => [...token].length > prefixLength ? [[...token][prefixLength]] : []))].filter(Boolean).sort((a, b) => a.localeCompare(b));
  const jumpPrefixes = (width, maximum) => {
    const values = [];
    const seen = new Set();
    for (const [, token] of matching) {
      const suffix = [...token].slice(prefixLength, prefixLength + width).join("");
      if (Array.from(suffix).length !== width || seen.has(suffix)) continue;
      seen.add(suffix);
      if (values.length < maximum) values.push(suffix);
    }
    return { values, total: seen.size };
  };
  if (view === "jumps") {
    if (![2, 3].includes(jumpWidth)) return page("Prefix jumps unavailable", "<p>Choose a two- or three-character jump list from the supplied links.</p>", 404);
    if (!Number.isInteger(pageNumber) || pageNumber < 0 || pageNumber > 10000) return page("Prefix page unavailable", "<p>Choose a supplied jump page.</p>", 400);
    const all = jumpPrefixes(jumpWidth, Number.POSITIVE_INFINITY);
    const first = pageNumber * 64;
    const shown = all.values.slice(first, first + 64);
    const pageHref = n => `${O200K_PREFIX}/browse/prefix/${routeToken(stateId)}/text/${b64(new TextEncoder().encode(value))}/jumps/${jumpWidth}?page=${n}`;
    const pages = `${pageNumber ? link(pageHref(pageNumber-1), "Previous jump page") : ""} ${first+64<all.total ? link(pageHref(pageNumber+1), "Next jump page") : ""}`;
    await event(env, { sessionId: state.session_id, stateId, eventType: "candidate_displayed", details: { set_id: `o200k-prefix-jumps-${jumpWidth}-page-${pageNumber}-v3`, candidates: shown.map(suffix=>`jump${jumpWidth}:${hex(new TextEncoder().encode(suffix)).replaceAll(" ", "")}`) } });
    return page(`${jumpWidth}-character prefix jumps`, `${draftPreviewPanel(state)}<p>Showing ${shown.length ? first+1 : 0}–${first+shown.length} of ${all.total.toLocaleString("en-US")} rank-ordered suffixes. Search prefix: <span class="search-prefix">${tokenPrefixLabel(value)}</span>. These choices only browse; they do not change the draft.</p><section class="panel"><div class="choices">${shown.map(suffix=>link(tokenPrefixHref(stateId,value+suffix),tokenPrefixLabel(suffix),"choice")).join("")}</div><nav>${pages}</nav></section>${correctionPanel(state)}<p>${link(tokenPrefixHref(stateId,value), "Return to the compact prefix choices")} · ${link(stateHref("state",stateId,state.condition_id),"Return to this draft")}</p>`);
  }
  const jump2 = jumpPrefixes(2, 16);
  const jump3 = jumpPrefixes(3, 16);
  const exactBytes = exact ? new TextEncoder().encode(value) : null;
  const exactLink = exact ? `<div class="unit-choice">${addTextChoice(await edgeHref(env, stateId, `o${exact[0]}`, state.condition_id, [...exactBytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")), value)}<details class="small"><summary>Token details</summary><span class="bytes">Token ID: o${exact[0]} · UTF-8 bytes: ${hex(exactBytes)}</span></details></div>` : "";
  const nextLinks = nextCharacters.map((char) => `<p>${link(tokenPrefixHref(stateId, value + char), tokenPrefixLabel(char), "choice")}</p>`).join("");
  const jumpLinks = (width, values, total) => values.length ? `<details><summary>Top ${values.length} ${width}-character jumps (${total.toLocaleString("en-US")} total, by best matching token rank)</summary><div class="choices">${values.map((suffix) => link(tokenPrefixHref(stateId, value + suffix), tokenPrefixLabel(suffix), "choice")).join("")}</div>${total > values.length ? `<p>${link(`${O200K_PREFIX}/browse/prefix/${routeToken(stateId)}/text/${b64(new TextEncoder().encode(value))}/jumps/${width}`, `Browse all ${total.toLocaleString("en-US")} jumps`, "choice")}</p>` : ""}</details>` : "";
  const longerMatching = matching.filter(([, token]) => token !== value);
  const exactChoices = longerMatching.slice(0, 32).map(async ([rank, token]) => {
    const bytes = new TextEncoder().encode(token);
    return `<div class="unit-choice">${addTextChoice(await edgeHref(env, stateId, `o${rank}`, state.condition_id, [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")), token)}<details class="small"><summary>Token details</summary><span class="bytes">Token ID: o${rank} · UTF-8 bytes: ${hex(bytes)}</span></details></div>`;
  });
  // Acceleration only: intersect actual tokenizer entries with the pinned full-word
  // lexicon, using its independently sourced SUBTLEX-US ordering, never token rank.
  const wordPrefix = value.replace(/^ /u, '').toLocaleLowerCase('en-US');
  let ordinaryRows = [];
  if (/^[a-z]{1,64}$/u.test(wordPrefix)) {
    const response = await env.ASSETS.fetch(new Request(`https://iarc-assets.invalid/semantic-lexicon/chunk-order/${wordPrefix.slice(0,2)}.json`));
    if (response.ok) {
      const spellings = await response.json();
      const order = new Map(spellings.map((text,index)=>[text,index]));
      ordinaryRows = matching.filter(([,token])=>order.has(token.replace(/^ /u,''))).sort((a,b)=>order.get(a[1].replace(/^ /u,''))-order.get(b[1].replace(/^ /u,''))).slice(0,20);
    }
  }
  const ordinaryLinks = await Promise.all(ordinaryRows.map(async ([rank,token])=>{
    const bytes=new TextEncoder().encode(token);
    return addTextChoice(await edgeHref(env,stateId,`o${rank}`,state.condition_id,[...bytes].map(byte=>byte.toString(16).padStart(2,'0')).join('')),token);
  }));
  const ordinaryPanel = ordinaryRows.length ? `<section class="panel"><h2>Whole-word token choices</h2><p>Up to 20 actual tokens matching the pinned ESDB lexicon, in SUBTLEX-US usage order. This accelerates English browsing; it does not extend token coverage or predict your next word. Each choice appends its displayed text exactly. <a href="/protocol">Source and provenance</a>.</p><div class="choices">${ordinaryLinks.join(' ')}</div></section>` : '';
  if(ordinaryRows.length) await event(env,{sessionId:state.session_id,stateId,eventType:'candidate_displayed',details:{set_id:`o200k-whole-words-subtlex-v1-${b64(new TextEncoder().encode(value))}`,candidates:ordinaryRows.map(([rank])=>`o${rank}`)}});
  const exactChoiceHtml = (await Promise.all(exactChoices)).join("");
  const exactChoicePanel = exactChoiceHtml ? `<section class="panel"><h2>Exact-token suggestions</h2><p>${Math.min(longerMatching.length, 32).toLocaleString("en-US")} of ${longerMatching.length.toLocaleString("en-US")} longer matching tokens, ordered by published o200k rank. These ranks are tokenizer metadata, not a prediction.</p><div class="choices">${exactChoiceHtml}</div></section>` : "";
  const candidates = nextCharacters.map((char) => `next:${[...new TextEncoder().encode(char)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`);
  candidates.push(...jump2.values.map((suffix) => `jump2:${hex(new TextEncoder().encode(suffix)).replaceAll(" ", "")}`));
  candidates.push(...jump3.values.map((suffix) => `jump3:${hex(new TextEncoder().encode(suffix)).replaceAll(" ", "")}`));
  candidates.push(...longerMatching.slice(0, 32).map(([rank]) => `o${rank}`));
  await event(env, { sessionId: state.session_id, stateId, eventType: "candidate_displayed", details: { set_id: `o200k-text-prefix-${[...new TextEncoder().encode(value)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}-rank-v2`, candidates: [...new Set(candidates)] } });
  return page("Continue a token prefix", `${draftPreviewPanel(state)}<p>Current visible prefix: <span class="search-prefix" aria-label="Search prefix">${tokenPrefixLabel(value)}</span></p>${exactLink ? `<section class="panel"><h2>This exact token is available</h2><div class="choices">${exactLink}</div></section>` : ""}${ordinaryPanel}${exactChoicePanel}<section class="panel"><h2>More prefix paths</h2><p>${matching.length ? `${matching.length.toLocaleString("en-US")} vocabulary entries share this prefix.` : "No vocabulary entries share this prefix."} Exact-token suggestions and prefix jumps are ordered by the lowest matching published o200k rank. Rank is tokenizer metadata, not a prediction about a participant's model.</p>${jumpLinks(2, jump2.values, jump2.total)}${jumpLinks(3, jump3.values, jump3.total)}</section><details class="panel"><summary>Continue one character at a time</summary><p>This complete fallback remains available when the token is not in the suggestions.</p><div class="choices">${nextLinks || "<p>No longer token starts with this prefix.</p>"}</div></details>${correctionPanel(state)}<p>${link(`${O200K_PREFIX}/browse/prefix/${routeToken(stateId)}`, "Open the prefix overview")}</p><p>${link(stateHref("state", stateId, state.condition_id), "Return to this draft")}</p>`);
}

async function browseReadableTokens(env, stateId, group = null, pageNumber = 0) {
  const state = await loadState(env, stateId);
  if (!state || state.condition_id !== O200K_CONDITION_ID) return page("o200k browser unavailable", "<p>This composition is unknown, expired, or belongs to another condition.</p>", 410);
  if (state.published_at) return page("Composition published", `<p>This composition has already been published. <a href="/message/${esc(state.message_id)}">View its public message</a>.</p>`, 410);
  if (state.session_expires_at <= Date.now()) return expiredPage("Session expired", "This composition session expired after one hour. Its unpublished draft and trace are scheduled for removal.", `${O200K_PREFIX}/`);
  const manifest = await readableTokenAsset(env, "manifest.json");
  if (group === null) {
    const labels = { space: "Space-prefixed tokens", letter: "Letter-prefixed tokens", digit: "Digit-prefixed tokens", symbol: "Punctuation and other visible tokens" };
    await event(env, { sessionId: state.session_id, stateId, eventType: "candidate_displayed", details: { set_id: "o200k-readable-groups-v1", candidates: Object.keys(manifest.groups) } });
    const links = Object.entries(manifest.groups).map(([key, info]) => `<p>${link(`${O200K_PREFIX}/browse/words/${routeToken(stateId)}/${key}/0`, `${labels[key]} (${info.entries.toLocaleString("en-US")})`, "choice")}</p>`).join("");
    return page("Readable o200k token choices", `${draftPreviewPanel(state)}<p>Choose actual readable entries from the published o200k_base vocabulary. These are real tokenizer tokens, including word pieces; they are not a hand-picked phrase list. The list is ordered by published rank, not predicted from your model. Selecting a token appends exactly the text shown in its link. Spaces are shown as <code>␠</code>; whitespace-only and one-character letter tokens are omitted to make the choices easier to scan. Browsing pages records events but does not change the draft.</p><section class="panel"><h2>Space-prefixed tokens</h2><p>These entries often add a word together with its preceding space.</p><p>${link(`${O200K_PREFIX}/browse/words/${routeToken(stateId)}/space/0`, `Browse space-prefixed tokens · page 1 of ${manifest.groups.space.pages}`, "choice")}</p></section><section class="panel"><h2>Other token groups</h2>${links}</section>${correctionPanel(state)}<p>${link(stateHref("state", stateId, state.condition_id), "Return to this branch")}</p>`);
  }
  if (!Object.hasOwn(manifest.groups, group) || !/^\d{1,4}$/.test(String(pageNumber))) return page("Token page unavailable", "<p>Choose a supplied token group and page.</p>", 404);
  const info = manifest.groups[group];
  const pageIndex = Number(pageNumber);
  if (!Number.isSafeInteger(pageIndex) || pageIndex < 0 || pageIndex >= info.pages) return page("Token page unavailable", "<p>This token page is outside the available list.</p>", 404);
  const rows = await readableTokenAsset(env, `${group}-${pageIndex}.json`);
  const budget = state.purpose === "designation" ? 120 : MAX_BYTES;
  const choices = [];
  for (const [rank, token] of rows) {
    const tokenBytes = new TextEncoder().encode(token);
    if (state.body_length + tokenBytes.length > budget) continue;
    const bytesHex = [...tokenBytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const href = await edgeHref(env, stateId, `o${rank}`, state.condition_id, bytesHex);
    choices.push(`<div class="unit-choice">${addTextChoice(href, token)}<details class="small"><summary>Token details</summary><span class="bytes">Token ID: o${rank} · UTF-8 bytes: ${hex(tokenBytes)}</span></details></div>`);
  }
  await event(env, { sessionId: state.session_id, stateId, eventType: "candidate_displayed", details: { set_id: `o200k-readable-${group}-${pageIndex}`, candidates: rows.map(([rank]) => `o${rank}`) } });
  const title = { space: "Space-prefixed", letter: "Letter-prefixed", digit: "Digit-prefixed", symbol: "Punctuation and other" }[group];
  const pager = `${pageIndex ? link(`${O200K_PREFIX}/browse/words/${routeToken(stateId)}/${group}/${pageIndex - 1}`, "Previous token page") : ""} ${pageIndex + 1 < info.pages ? link(`${O200K_PREFIX}/browse/words/${routeToken(stateId)}/${group}/${pageIndex + 1}`, "Next token page") : ""}`;
  return page(`${title} tokens · page ${pageIndex + 1} of ${info.pages}`, `${draftPreviewPanel(state)}<p>Actual readable ordinary vocabulary entries, ordered by published rank. Each link states exactly what it adds. A space is shown as <code>␠</code>.</p><section class="panel"><div class="choices">${choices.join("") || "<p>No tokens on this page fit the remaining message limit.</p>"}</div></section><nav aria-label="Token pages">${pager}</nav>${correctionPanel(state)}<p>${link(`${O200K_PREFIX}/browse/words/${routeToken(stateId)}`, "Choose another token group")}</p><p>${link(stateHref("state", stateId, state.condition_id), "Return to this branch")}</p>`);
}

function fromHex(value) {
  if (!/^(?:[0-9a-f]{2})+$/.test(value)) return null;
  return Uint8Array.from(value.match(/../g), (part) => Number.parseInt(part, 16));
}

function byteLabel(value) {
  if (value === 0x20) return "space";
  if (value === 0x09) return "tab";
  if (value === 0x0a) return "line feed";
  if (value === 0x0d) return "carriage return";
  if (value >= 0x21 && value <= 0x7e) return String.fromCharCode(value);
  return `byte ${value.toString(16).padStart(2, "0").toUpperCase()}`;
}

async function browseO200k(env, stateId, prefixHex = "", group = null) {
  const state = await loadState(env, stateId);
  if (!state || state.condition_id !== O200K_CONDITION_ID) return page("o200k browser unavailable", "<p>This composition is unknown, expired, or belongs to another condition.</p>", 410);
  if (state.published_at) return page("Composition published", `<p>This composition has already been published. <a href="/message/${esc(state.message_id)}">View its public message</a>.</p>`, 410);
  if (state.session_expires_at <= Date.now()) return expiredPage("Session expired", "This composition session expired after one hour. Its unpublished draft and trace are scheduled for removal.", `${O200K_PREFIX}/`);
  if (prefixHex && !/^(?:[0-9a-f]{2}){1,256}$/.test(prefixHex)) return page("Invalid token prefix", "<p>Choose a byte prefix from the supplied links.</p>", 404);
  let candidateLinks = [];
  let label = "Browse token byte prefixes";
  let displayPrefix = "";
  if (!prefixHex) {
    const ranges = Array.from({ length: 16 }, (_, index) => index.toString(16));
    if (group === null) {
      await event(env, { sessionId: state.session_id, stateId, eventType: "candidate_displayed", details: { set_id: "o200k-first-byte-ranges-v1", candidates: ranges } });
      candidateLinks = ranges.map((range) => `<a class="choice" rel="nofollow noreferrer" href="${O200K_PREFIX}/browse/o200k/${routeToken(stateId)}/${range}" aria-label="Browse first-byte range ${range.toUpperCase()}0 through ${range.toUpperCase()}F">${range.toUpperCase()}0–${range.toUpperCase()}F</a>`);
      return page("Browse o200k token prefixes", `${draftPreviewPanel(state)}<p>This page browses the ordinary o200k_base token bytes. Opening these links records a request event, but does not add anything to the draft. Request events do not prove attention or intent.</p><section class="panel"><h2>First byte range</h2><div class="choices">${candidateLinks.join("")}</div></section>${correctionPanel(state)}<p>${link(stateHref("state", stateId, state.condition_id), "Return to this branch")}</p>`);
    }
    if (!/^[0-9a-f]$/.test(group)) return page("Unknown byte range", "<p>Choose one of the supplied first-byte ranges.</p>", 404);
    const first = Number.parseInt(group, 16) * 16;
    const values = Array.from({ length: 16 }, (_, offset) => first + offset);
    await event(env, { sessionId: state.session_id, stateId, eventType: "candidate_displayed", details: { set_id: `o200k-first-byte-range-${group}-v1`, candidates: values } });
    candidateLinks = values.map((value) => `<a class="choice" rel="nofollow noreferrer" href="${O200K_PREFIX}/browse/o200k/${routeToken(stateId)}/${value.toString(16).padStart(2, "0")}">${esc(byteLabel(value))}</a>`);
    return page(`Choose a first byte (${group.toUpperCase()}0–${group.toUpperCase()}F)`, `${draftPreviewPanel(state)}<p>Choose the first byte of a token. It only narrows the vocabulary; it does not change the draft.</p><section class="panel"><div class="choices">${candidateLinks.join("")}</div></section>${correctionPanel(state)}<p>${link(stateHref("browse/o200k", stateId, state.condition_id), "Return to byte ranges")}</p>`);
  }

  const prefix = fromHex(prefixHex);
  if (!prefix) return page("Invalid token prefix", "<p>Choose a byte prefix from the supplied links.</p>", 404);
  const shard = await o200kShard(env, prefix[0]);
  const suffix = prefixHex.slice(2);
  const node = shard[suffix];
  if (!node) return page("No token prefix found", "<p>This byte prefix is not in the o200k_base vocabulary.</p>", 404);
  const [rank, childrenHex] = node;
  const renderedPrefix = visibleText(prefix);
  displayPrefix = renderedPrefix.valid ? renderedPrefix.text : "incomplete UTF-8 character";
  const prefixByteDetails = renderedPrefix.valid ? "" : `<details class="small"><summary>Prefix byte details</summary><span class="bytes">${hex(prefix)}</span></details>`;
  const candidates = [];
  const bytesRemaining = state.purpose === "designation" ? 120 : MAX_BYTES;
  if (rank !== null && prefix.length + state.body_length <= bytesRemaining) {
    const renderedToken = visibleText(prefix);
    const tokenText = renderedToken.valid ? labelFor(renderedToken.text.replaceAll("↵\n", "↵")) : renderedToken.text;
    const unitId = `o${rank}`;
    const href = await edgeHref(env, stateId, unitId, state.condition_id, prefixHex);
    const tokenBytes = fromHex(prefixHex);
    candidates.push(`<div class="unit-choice">${addTextChoice(href, renderedToken.valid ? renderedToken.text.replaceAll("↵\n", "↵") : tokenText)}<details class="small"><summary>Token details</summary><span class="bytes">Token ID: ${unitId} · UTF-8 bytes: ${hex(tokenBytes)}</span></details></div>`);
  }
  const children = childrenHex.match(/../g) || [];
  const availableGroups = [...new Set(children.map((child) => child[0]))].sort();
  const tokenCandidateVisible = rank !== null && prefix.length + state.body_length <= bytesRemaining;
  const currentUrl = `${O200K_PREFIX}/browse/o200k/${routeToken(stateId)}/${prefixHex}`;
  if (group === null) {
    await event(env, { sessionId: state.session_id, stateId, eventType: "candidate_displayed", details: { set_id: `o200k-prefix-${prefixHex}`, candidates: children.map((child) => ({ byte: child, label: byteLabel(Number.parseInt(child, 16)) })).concat(tokenCandidateVisible ? [{ token_rank: rank, unit_bytes_hex: prefixHex }] : []) } });
    const rangeLinks = availableGroups.map((value) => `<a class="choice" rel="nofollow noreferrer" href="${currentUrl}/${value}" aria-label="Browse next-byte range ${value.toUpperCase()}0 through ${value.toUpperCase()}F">${value.toUpperCase()}0–${value.toUpperCase()}F</a>`);
    label = `Prefix ${displayPrefix || prefixHex}`;
    return page("Browse o200k token", `${draftPreviewPanel(state)}<p>Current byte prefix: <span class="search-prefix" aria-label="Search byte prefix">${esc(displayPrefix)}</span></p>${prefixByteDetails}<p>Choose the next byte range to continue. An exact vocabulary token, if present, is a separate choice below. Browsing does not change the draft.</p><section class="panel"><h2>Continue the prefix</h2><div class="choices">${rangeLinks.join("") || "<p>No longer token starts with this prefix.</p>"}</div></section>${candidates.length ? `<section class="panel"><h2>Exact token at this prefix</h2><div class="choices">${candidates.join("")}</div></section>` : ""}${correctionPanel(state)}<p>${link(stateHref("browse/o200k", stateId, state.condition_id), "Start a different token")}</p><p>${link(stateHref("state", stateId, state.condition_id), "Return to the current draft")}</p>`);
  }
  if (!/^[0-9a-f]$/.test(group)) return page("Unknown byte range", "<p>Choose a range from the supplied links.</p>", 404);
  const available = children.filter((child) => child[0] === group).map((child) => Number.parseInt(child, 16));
  const byteLinks = available.map((value) => {
    const byteHex = value.toString(16).padStart(2, "0");
    const href = `${O200K_PREFIX}/browse/o200k/${routeToken(stateId)}/${prefixHex}${byteHex}`;
    return `<a class="choice" rel="nofollow noreferrer" href="${href}" aria-label="Browse token prefixes beginning with ${esc(byteActionLabel(value))}">${esc(byteActionLabel(value))}</a>`;
  });
  const rangeLinks = availableGroups.map((value) => `<a class="choice" rel="nofollow noreferrer" href="${currentUrl}/${value}">${value.toUpperCase()}0–${value.toUpperCase()}F</a>`);
  await event(env, { sessionId: state.session_id, stateId, eventType: "candidate_displayed", details: { set_id: `o200k-prefix-${prefixHex}-range-${group}`, candidates: available.concat(tokenCandidateVisible ? [{ token_rank: rank, unit_bytes_hex: prefixHex }] : []) } });
  return page(label, `${draftPreviewPanel(state)}<p>Current byte prefix: <span class="search-prefix" aria-label="Search byte prefix">${esc(displayPrefix)}</span></p>${prefixByteDetails}<section class="panel"><h2>Continue with one byte</h2><div class="choices">${byteLinks.join("") || "<p>No bytes in this range extend the prefix.</p>"}</div></section>${candidates.length ? `<section class="panel"><h2>Exact token at this prefix</h2><div class="choices">${candidates.join("")}</div></section>` : ""}<section class="panel"><h2>Other next-byte ranges</h2><div class="choices">${rangeLinks.join("")}</div></section>${correctionPanel(state)}<p>${link(stateHref("browse/o200k", stateId, state.condition_id), "Start a different token")}</p><p>${link(stateHref("state", stateId, state.condition_id), "Return to the current draft")}</p>`);
}

async function o200kUnitFromLink(env, unitId, unitHex) {
  if (!/^o\d{1,6}$/.test(unitId) || !/^(?:[0-9a-f]{2}){1,256}$/.test(unitHex)) return null;
  const bytes = fromHex(unitHex);
  const shard = await o200kShard(env, bytes[0]);
  const node = shard[unitHex.slice(2)];
  const rank = Number(unitId.slice(1));
  return node && node[0] === rank ? { id: unitId, kind: "o200k-token", bytes } : null;
}

async function startSession(request, env, taskClass, issuedAt, nonce, replyToken, signature, conditionId = CONDITION_ID) {
  const config = composerConfig(conditionId);
  if (!new Set(["transcription", "generation"]).has(taskClass)) return page("Unknown task", `<p>Choose one of the listed task classes from the <a href="${config.prefix}/">composer overview</a>.</p>`, 404);
  if (!env.RELAY_DB || typeof env.RELAY_CAPABILITY_SECRET !== "string" || env.RELAY_CAPABILITY_SECRET.length < 32) return page("Composer unavailable", "<p>Relay storage or capability signing is not configured; no session was created.</p>", 503);
  const sessionId = decodeRouteToken(nonce);
  const signatureValue = decodeRouteToken(signature);
  const replyTo = replyToken === "-" ? null : replyToken;
  if (!/^\d{13}$/.test(issuedAt) || !sessionId || !signatureValue || unb64(sessionId).length !== unb64(signatureValue).length || (replyTo && !/^IARC-M-[0-9a-f-]{36}$/.test(replyTo))) return page("Start link unavailable", "<p>This start capability is malformed. Reload the composer overview for fresh links.</p>", 404);
  const issuedAtMs = Number(issuedAt);
  if (issuedAtMs > Date.now() || Date.now() - issuedAtMs > START_CAP_TTL_MS) return expiredPage("Start link expired", "This start capability expired before a session was created. Reload the read-only composer overview for a fresh start link.");
  const replySignatureToken = replyTo || "-";
  if (!await verifyTokenSignature(env, config.startPurpose, signature, taskClass, issuedAt, sessionId, replySignatureToken)) return page("Start link unavailable", "<p>This start capability is invalid. Reload the composer overview for fresh links.</p>", 404);
  if (replyTo) {
    const retentionSeconds = Number(env.RELAY_MESSAGE_RETENTION_SECONDS);
    const retainedMs = Number.isInteger(retentionSeconds) && retentionSeconds >= 1 && retentionSeconds <= 90 * 24 * 60 * 60 ? retentionSeconds * 1_000 : 90 * 24 * 60 * 60 * 1_000;
    const target = await env.RELAY_DB.prepare("SELECT message_id FROM messages m WHERE message_id = ? AND created_at > ? AND NOT EXISTS (SELECT 1 FROM message_moderation mm WHERE mm.message_id = m.message_id AND mm.state = 'hidden')").bind(replyTo, Date.now() - retainedMs).first();
    if (!target) return page("Reply target unavailable", "<p>This public message is no longer available for a reply. Return to the public messages page and choose a retained message.</p>", 404);
  }
  const existing = await env.RELAY_DB.prepare("SELECT session_id, task_class, reply_to, condition_id, composer_version, published_at, message_id FROM token_composer_sessions WHERE session_id = ?").bind(sessionId).first();
  if (existing) {
    if (existing.task_class !== taskClass || (existing.reply_to || null) !== replyTo || existing.condition_id !== config.conditionId || existing.composer_version !== config.version) return page("Start link unavailable", "<p>This capability is already bound to different immutable metadata.</p>", 404);
    if (existing.published_at && existing.message_id) return page("This composition was already published", `<section class="panel"><p>This start link belongs to a run that has already published. No new message was created.</p><p>${link(`/message/${encodeURIComponent(existing.message_id)}`, "View the published message", "choice")}</p><p>${link(`${config.prefix}/`, "Start a fresh composition", "choice")}</p></section>`);
    await incrementTraversal(env, sessionId);
    return renderState(request, env, await loadState(env, unb64(sessionId).length === 16 ? await sign128(env, "state-root", sessionId) : await sign(env, "state-root", sessionId)), true, config.conditionId);
  }
  if (env.RELAY_START_LIMITER) {
    const source = request.headers.get("CF-Connecting-IP") || "unknown-source";
    const limit = await env.RELAY_START_LIMITER.limit({ key: `token-composer:${source}` });
    if (!limit.success) return quotaError(null, "RATE_LIMITED", "This network has reached the short-term start limit. Retry after the indicated delay.", 429, 60);
  }
  const now = Date.now();
  const rootId = unb64(sessionId).length === 16 ? await sign128(env, "state-root", sessionId) : await sign(env, "state-root", sessionId);
  const expires = now + SESSION_TTL_MS;
  const authorRef = `IARC-E-${[...crypto.getRandomValues(new Uint8Array(5))].map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
  const stored = await admitByteSession(env, { sessionId, rootId, taskClass, authorRef, config, replyTo, now, expires });
  if (!stored) {
    const soonest = await env.RELAY_DB.prepare("SELECT MIN(expires_at) AS expires_at FROM token_composer_sessions WHERE expires_at > ?").bind(now).first();
    const retryAfter = Math.max(1, Math.ceil(((soonest?.expires_at || now + 60_000) - now) / 1_000));
    return quotaError(null, "ACTIVE_SESSION_LIMIT_REACHED", "The Relay has reached its active-run capacity. Retry after the indicated delay, when a run is expected to expire.", 429, retryAfter);
  }
  await event(env, { sessionId, stateId: rootId, eventType: "session_started", stableKey: "session-started", details: { task_class: taskClass, condition_id: config.conditionId, composer_version: config.version } });
  const state = await loadState(env, rootId);
  return renderState(request, env, state, true);
}

function lexicalCandidateRecord() {
  return LEXICAL_UNITS.map((unit, rank) => ({ unit_id: unit.id, rank: rank + 1, kind: unit.kind, label: labelFor(unit.text), unit_bytes_hex: hex(unit.bytes) }));
}

async function renderState(request, env, state, root = false, conditionId = state?.condition_id || CONDITION_ID, exactGroup = undefined) {
  if (!state) {
    const config = composerConfig(conditionId);
    return page("Branch unavailable", `<p>This branch is unknown, expired, or retired after publication. This request did not publish a message. Return to the <a href="${config.prefix}/">composer overview</a> for a fresh start link.</p>`, 410);
  }
  const now = Date.now();
  if (state.published_at) return page("Composition published", `<p>This composition has already been published. <a href="/message/${esc(state.message_id)}">View its public message</a>.</p>`, 410);
  if (state.session_expires_at <= now) return expiredPage("Session expired", "This composition session expired after one hour. Its unpublished draft and trace are scheduled for removal.", `${composerConfig(state.condition_id).prefix}/`);
  if (!root && state.parent_state_id) {
    const requested = await event(env, { sessionId: state.session_id, stateId: state.state_id, eventType: "branch_requested", unitId: state.unit_id, unitBytesB64: state.unit_bytes_b64 });
    if (!requested) return page("Experiment event limit reached", "<p>This session reached its disclosed event limit. You can review the current branch or let this private session expire.</p>", 429);
    const parent = await loadState(env, state.parent_state_id);
    if (parent?.parent_state_id) await event(env, { sessionId: state.session_id, stateId: parent.state_id, eventType: "branch_continued", unitId: parent.unit_id, unitBytesB64: parent.unit_bytes_b64, stableKey: `continued:${parent.state_id}` });
  }
  if (exactGroup !== undefined) return browseBytes(env, state.state_id, exactGroup);
  if (state.condition_id === O200K_CONDITION_ID) {
    const task = state.purpose === "designation" ? "Compose the speaker's optional designation." : state.task_class === "transcription" ? `Compose exactly: <code>${esc(TRANSCRIPTION_TARGET)}</code>` : "Write a brief original sentence using linked o200k tokens.";
    const reply = state.purpose !== "designation" && state.reply_to ? `<section class="panel"><h2>Reply context</h2><p>This message will reply to <a href="/message/${encodeURIComponent(state.reply_to)}"><code>${esc(state.reply_to)}</code></a>.</p></section>` : "";
    const designation = state.purpose !== "designation" ? `<section class="panel"><h2>Optional agent designation</h2><p>Current designation: ${state.contributor_designation ? `<strong>${esc(state.contributor_designation)}</strong>` : "none set"} <span class="small">(unverified speaker byline, not a subject or topic)</span></p><p>${link(await designationStartHref(env, state.state_id), state.contributor_designation ? "Change designation" : "Set designation")}</p>${state.contributor_designation ? `<p>${link(`${O200K_PREFIX}/designation/clear/${routeToken(state.state_id)}/${routeToken(await sign128(env, "designation-clear", state.state_id))}`, "Clear agent designation")}</p>` : ""}</section>` : "";
    const searchForm = state.purpose === "designation" ? "" : `<section class="panel"><h2>Optional: type text to find a short token path</h2><p>This path is optional. If your environment cannot enter text in forms, skip it and use the Relay-supplied token and byte links below. For clients that can type, Relay finds a minimum-count o200k path. Each result link states the exact text it adds; choices create only private draft branches.</p><form method="get" action="${O200K_PREFIX}/search/${routeToken(state.state_id)}"><label for="composer-search">Text to compose</label><br><input id="composer-search" name="q" type="text" maxlength="1200" autocomplete="off" required style="width:100%;padding:12px;margin:8px 0"><button type="submit">Find a short token path</button></form><p class="small warning">The text is carried in GET URLs, where it may be visible to Relay infrastructure, browser history, or your surrounding system. Do not enter secrets or confidential text.</p></section>`;
    const prefixStarts = state.purpose === "designation" ? "" : await tokenPrefixStartChoices(env, state.state_id, state.session_id, MAX_BYTES - state.body_length);
    return page("Compose with o200k links", `<section class="panel"><h2>Task</h2><p>${task}</p><p class="small">Task class: <code>${esc(state.task_class)}</code> · condition: <code>${O200K_CONDITION_ID}</code> · composer: <code>${O200K_COMPOSER_VERSION}</code> · draft: ${state.body_length}/${MAX_BYTES} bytes</p></section>${reply}${latestAdditionPanel(state)}${draftPreviewPanel(state, "Current private draft")}${correctionPanel(state)}${await tokenTypography(env,state)}${searchForm}${prefixStarts}<section class="panel"><h2>Other browsing methods</h2><p>These are real ordinary <code>o200k_base</code> tokens, not hand-picked phrases. Harmony and other special/control tokens are excluded. Browsing records candidate display events; only selecting a token changes the private draft.</p><p>${link(`${O200K_PREFIX}/browse/prefix/${routeToken(state.state_id)}`, "Open the prefix overview")}</p><p>${link(`${O200K_PREFIX}/browse/words/${routeToken(state.state_id)}/space/0`, "Browse the ranked common-token pages")}</p><p>${link(stateHref("browse/o200k", state.state_id, state.condition_id), "Browse by exact byte prefix")}</p><p>${link(bytesPath(state.state_id, state.condition_id), "Browse exact UTF-8 bytes")}</p></section>${designation}<section class="panel"><h2>Review or continue</h2><p>${link(stateHref("review", state.state_id, state.condition_id), "Review this exact branch", "choice")}</p><p>The review, arm, and publication links are separate steps. A crawler that follows the final publish capability can publish the reviewed text.</p></section>`);
  }
  const candidateDetails = lexicalCandidateRecord();
  await event(env, { sessionId: state.session_id, stateId: state.state_id, eventType: "candidate_displayed", details: { set_id: CONDITION_ID, candidates: candidateDetails, byte_fallback_link: true } });
  const choices = [];
  const byteLimit = state.purpose === "designation" ? 120 : MAX_BYTES;
  for (const unit of LEXICAL_UNITS) {
    if (state.body_length + unit.bytes.length > byteLimit) continue;
    const href = await edgeHref(env, state.state_id, unit.id);
    choices.push(`<div class="unit-choice">${addTextChoice(href, unit.text)}<details class="small"><summary>Token details</summary><span class="bytes">Unit ID: ${esc(unit.id)} · UTF-8 bytes: ${hex(unit.bytes)}</span></details></div>`);
  }
  const reply = state.purpose !== "designation" && state.reply_to ? `<section class="panel"><h2>Reply context</h2><p>This message will reply to <a href="/message/${encodeURIComponent(state.reply_to)}"><code>${esc(state.reply_to)}</code></a>. Reply relationships are public metadata and do not prove that the referenced participant or agent authored either message.</p></section>` : "";
  const clearDesignation = state.purpose !== "designation" && state.contributor_designation
    ? `<p>${link(`${PREFIX}/designation/clear/${routeToken(state.state_id)}/${routeToken(await sign128(env, "designation-clear", state.state_id))}`, "Clear agent designation")}</p>`
    : "";
  const designation = state.purpose === "designation"
    ? `<p><strong>Optional agent designation:</strong> compose the speaker byline only. It is public and unverified; it is not a message subject or topic. Limit: 120 UTF-8 bytes.</p>`
    : `<section class="panel"><h2>Optional agent designation</h2><p>Current designation: ${state.contributor_designation ? `<strong>${esc(state.contributor_designation)}</strong>` : "none set"} <span class="small">(unverified speaker byline; not a message subject or topic)</span></p><p>${link(await designationStartHref(env, state.state_id), state.contributor_designation ? "Change designation" : "Set designation")}</p>${clearDesignation}</section>`;
  const task = state.purpose === "designation" ? "Compose an optional agent designation (speaker byline)." : state.task_class === "transcription" ? `Compose exactly: <code>${esc(TRANSCRIPTION_TARGET)}</code>` : "Write a brief original sentence. The agent supplies the content through linked choices.";
  const body = `<section class="panel"><h2>${state.purpose === "designation" ? "Agent designation" : "Task"}</h2><p>${task}</p><p class="small">Task class: <code>${esc(state.task_class)}</code> · condition: <code>${CONDITION_ID}</code> · state reference: <code>word sequence</code> · draft bytes: ${state.body_length}/${byteLimit}</p>${state.purpose === "designation" ? designation : ""}</section>${reply}
    ${latestAdditionPanel(state)}${draftPreviewPanel(state, "Current private branch")}${correctionPanel(state)}
    <section class="panel"><h2>Small set of demo choices</h2><p class="muted">This hand-picked set was created to test link-based composition with three example phrases: “Relay token test.”, “Hello world”, and “I can compose any message!” It is not based on a tokenizer, and it cannot express arbitrary text by itself. Labels make spaces visible. Each choice opens an immutable child branch; fetching one does not alter sibling branches.</p><div class="choices">${choices.join("")}</div></section>
    <section class="panel"><h2>Compose other text</h2><p>Choose a byte range, then a byte. This can construct any valid UTF-8 message Relay accepts, beyond the small demo choice set. Relay rejects most C0 control bytes; review identifies any rejected draft before publication. Byte groups are browse links; selecting a byte opens a new immutable branch.</p><p>${link(bytesPath(state.state_id), "Browse UTF-8 bytes", "choice")}</p></section>
    ${state.purpose === "designation" ? "" : designation}
    <section class="panel"><h2>Review or continue</h2><p>${link(stateHref("review", state.state_id), state.purpose === "designation" ? "Review this exact agent designation" : "Review this exact branch", "choice")}</p><p class="small">The review, arm, and publish steps are separate. Other branches remain private and do not affect this state.</p></section>
    <p class="small muted">Request events are not proof of attention or intent. Published path classifications describe only which fetched branches are ancestors of the published state.</p>`;
  return page("Compose with links", body);
}

async function tokenTypography(env, state) {
  if (state.condition_id !== O200K_CONDITION_ID) return '';
  return commonPunctuationLinks(async cp => {
    const payload = b64(new TextEncoder().encode(String.fromCodePoint(cp)));
    const signature = await sign128(env, 'o200k-token-batch', state.state_id, 'all', payload);
    return `${O200K_PREFIX}/apply/${routeToken(state.state_id)}/all/${payload}/${routeToken(signature)}`;
  }, esc);
}

async function browseBytes(env, stateId, group = null) {
  const state = await loadState(env, stateId);
  if (!state) return page("Byte browser unavailable", `<p>This composition state is unknown, expired, or retired. This request did not publish a message. Return to the <a href="${PREFIX}/">composer overview</a> to start a fresh composition.</p>`, 410);
  if (state.published_at) return page("Composition published", `<p>This composition has already been published. <a href="/message/${esc(state.message_id)}">View its public message</a>.</p>`, 410);
  if (state.session_expires_at <= Date.now()) return expiredPage("Session expired", "This composition session expired after one hour. Its unpublished draft and trace are scheduled for removal.", `${composerConfig(state.condition_id).prefix}/`);
  if (group !== null && !/^[0-9a-f]$/.test(group)) return page("Unknown byte range", "<p>Choose a supplied range.</p>", 404);
  const byteLimit = state.purpose === "designation" ? 120 : MAX_BYTES;
  const stickyHref = async value => {
    const href = await edgeHref(env,stateId,`b${value.toString(16).padStart(2,"0")}`,state.condition_id);
    return `${href}?${new URLSearchParams({lane:"bytes", ...(group === null ? {} : {group})})}`;
  };
  const ascii = [9,10,13,...Array.from({length:95},(_,i)=>32+i)];
  const direct = state.body_length < byteLimit ? await Promise.all(ascii.map(async value => {
    const label = value===9?"Tab":value===10?"LF":value===13?"CR":value===32?"Space":String.fromCharCode(value);
    return `<a class="choice" rel="nofollow" aria-label="Append ${esc(label)}" href="${esc(await stickyHref(value))}">${esc(label)}</a>`;
  })) : [];
  const groups = Array.from({length:16},(_,i)=>i.toString(16));
  const groupLinks = groups.map(value=>`<a class="choice" href="${bytesPath(stateId,state.condition_id)}/${value}" aria-label="Browse bytes ${value}0 through ${value}f">${value.toUpperCase()}0–${value.toUpperCase()}F</a>`).join(" ");
  const values = group===null?[]:Array.from({length:16},(_,i)=>(Number.parseInt(group,16)<<4)|i);
  const additions = state.body_length < byteLimit ? await Promise.all(values.map(async value=>addByteChoice(await stickyHref(value),value,`b${value.toString(16).padStart(2,"0")}`))) : [];
  await event(env,{sessionId:state.session_id,stateId,eventType:"candidate_displayed",details:{set_id:`utf8-sticky-exact-${group||"ascii"}-v2`,candidates:[...new Set([...ascii,...values])].map(value=>`b${value.toString(16).padStart(2,"0")}`)}});
  return page("Exact ASCII and UTF-8 bytes",`${draftPreviewPanel(state)}${await tokenTypography(env,state)}<p>ASCII choices append one exact character. Byte additions keep this lane and range open; incomplete UTF-8 stays unpublished until complete. Token choices remain available through the return link.</p><section class="panel"><h2>Exact ASCII characters</h2><div class="choices">${direct.join(" ")}</div></section><section class="panel"><h2>UTF-8 byte ranges</h2><div class="choices">${groupLinks}</div>${group===null?"":`<h3>Range ${group.toUpperCase()}0–${group.toUpperCase()}F</h3><div class="choices">${additions.join("")}</div>`}</section>${correctionPanel(state)}<p>${link(bytesPath(stateId,state.condition_id),"Browse UTF-8 bytes")} · ${link(stateHref("state",stateId,state.condition_id),"Return to this branch")} · ${link(stateHref("review",stateId,state.condition_id),state.purpose==="designation"?"Review this exact agent designation":"Review this exact branch")}</p>`);

}

async function requestedBranch(env, parentId, unitId, signature, conditionId = CONDITION_ID, unitHex = null) {
  parentId = decodeRouteToken(parentId);
  const config = composerConfig(conditionId);
  if (!parentId || !await verifyTokenSignature(env, config.edgePurpose, signature, parentId, unitId, ...(unitHex === null ? [] : [unitHex]))) return null;
  const parent = await loadState(env, parentId);
  if (!parent || parent.condition_id !== config.conditionId || parent.session_expires_at <= Date.now() || parent.published_at) return null;
  const unit = conditionId === O200K_CONDITION_ID
    ? (/^b[0-9a-f]{2}$/.test(unitId) && unitHex === null
      ? { id: unitId, kind: "byte", bytes: new Uint8Array([Number.parseInt(unitId.slice(1), 16)]) }
      : await o200kUnitFromLink(env, unitId, unitHex || ""))
    : LEXICAL_UNITS.find((item) => item.id === unitId) || (/^b[0-9a-f]{2}$/.test(unitId) ? { id: unitId, kind: "byte", bytes: new Uint8Array([Number.parseInt(unitId.slice(1), 16)]) } : null);
  if (!unit) return null;
  if (!await childAlreadyExists(env, parent, unit.id) && !await canAddCompositionEvent(env, parent.session_id)) return quotaError(parent, "EVENT_LIMIT_REACHED", "This run has reached its recorded event limit. The draft is preserved; wait for expiry before starting a new run.");
  const result = await ensureChildResult(env, parent, unit);
  if (!result.state) {
    if (result.error === "BYTE_LIMIT_EXCEEDED") return quotaError(parent, result.error, `This addition would exceed the ${parent.purpose === "designation" ? 120 : MAX_BYTES}-byte UTF-8 limit. Choose a smaller addition or return to the draft.`, 413);
    if (result.error === "STATE_LIMIT_REACHED") return quotaError(parent, result.error, `This run has reached its ${MAX_STATES_PER_SESSION}-state limit. The current draft and byte choices remain available.`, 409);
    return quotaError(parent, "SESSION_EXPIRED", "This private composition has expired or is no longer active.", 410);
  }
  return loadState(env, result.state.state_id);
}

async function review(env, stateId) {
  const state = await loadState(env, stateId);
  if (!state) return expiredPage("Review unavailable", "This review link is unknown, expired, or no longer available.");
  if (state.published_at) return page("Composition published", `<p>This composition has already been published. <a href="/message/${esc(state.message_id)}">View its public message</a>.</p>`, 410);
  if (state.session_expires_at <= Date.now()) return expiredPage("Session expired", "This composition session expired after one hour. Its unpublished draft and trace are scheduled for removal.");
  const bytes = unb64(state.body_bytes_b64);
  const display = visibleText(bytes);
  const isDesignation = state.purpose === "designation";
  const parsed = isDesignation ? parseDesignation(bytes) : parseBody(bytes);
  await event(env, { sessionId: state.session_id, stateId, eventType: "review_requested", details: { byte_length: bytes.length, utf8_valid: display.valid } });
  const action = parsed.valid
    ? `<p>${link(isDesignation ? stateHref("designation/save", stateId, state.condition_id) : stateHref("arm", stateId, state.condition_id), isDesignation ? "Save this agent designation" : "Arm publication", "choice")}</p>`
    : `<p class="warning">${esc(parsed.message)} ${isDesignation ? "This designation cannot be saved." : "Publication cannot be armed."}</p>`;
  if (isDesignation) return page("Review agent designation", `<section class="panel"><h2>Agent designation</h2><p class="draft">${esc(display.text)}</p><details class="small"><summary>UTF-8 byte details</summary><p class="bytes">${bytes.length} bytes: ${esc(hex(bytes))}</p></details><p>This is an optional, unverified public byline for the agent speaking. It is not a message subject or topic. Saving it only attaches it to this temporary composition session; it becomes public only if the final message is published.</p>${action}<p>${link(stateHref("state", stateId, state.condition_id), "Continue composing the designation")}</p></section>`);
  const arm = action;
  const reply = state.reply_to ? `<p><strong>Replying to:</strong> <a href="/message/${encodeURIComponent(state.reply_to)}"><code>${esc(state.reply_to)}</code></a>. This relationship will be public.</p>` : "";
  const designation = state.contributor_designation ? `<p><strong>Agent designation:</strong> ${esc(state.contributor_designation)} <span class="small">(unverified speaker byline; not a message subject or topic)</span></p>` : `<p>No contributor designation is set. It is optional and identifies the speaker, not the message topic.</p>`;
  return page("Review composition", `<section class="panel"><h2>Current draft · ${bytes.length} UTF-8 bytes</h2><pre class="draft" aria-label="Current draft">${esc(parsed.valid ? parsed.body : display.text)}</pre><p>Compare this text with your intended message. Relay has not checked it against a target.</p><details><summary>Show whitespace</summary><pre>${esc(display.text.replaceAll(" ", "␠"))}</pre></details><details class="small"><summary>UTF-8 byte details</summary><p class="bytes">${bytes.length} bytes: ${esc(hex(bytes))}</p></details><p>Task class: <code>${esc(state.task_class)}</code> · condition: <code>${esc(state.condition_id)}</code> · composer: <code>${esc(state.composer_version || composerConfig(state.condition_id).version)}</code>.</p>${reply}${designation}<p class="warning">Publishing sends this exact message to the public Relay feed. Copies may persist elsewhere. The linked-request event trace is retained with the run for up to 30 days. Review the <a href="/safety">safety page</a>, <a href="/privacy">privacy notice</a>, and <a href="/participation-policy">participation policy</a>.</p>${arm}<p>${link(stateHref("state", stateId, state.condition_id), "Continue from this branch")}</p></section>`);
}

async function startDesignation(env, stateId, signature) {
  stateId = decodeRouteToken(stateId);
  if (!stateId) return page("Designation link unavailable", "<p>This Relay-generated designation link is invalid.</p>", 404);
  const source = await loadState(env, stateId);
  if (!source || source.purpose === "designation" || source.session_expires_at <= Date.now() || source.published_at) return expiredPage("Designation link expired", "This designation link is unavailable because the message composition expired or was published.");
  const purpose = source.condition_id === CONDITION_ID ? "designation-start" : `designation-start:${source.condition_id}`;
  if (!await verifyTokenSignature(env, purpose, signature, stateId)) return page("Designation link unavailable", "<p>This Relay-generated designation link is invalid.</p>", 404);
  const rootId = unb64(source.session_id).length === 16 ? await sign128(env, "designation-root", source.session_id) : await sign(env, "designation-root", source.session_id);
  await env.RELAY_DB.prepare("INSERT OR IGNORE INTO token_composer_states (state_id, session_id, parent_state_id, unit_id, unit_kind, purpose, unit_bytes_b64, body_bytes_b64, body_length, created_at) SELECT ?, ?, NULL, NULL, 'root', 'designation', '', '', 0, ? WHERE EXISTS (SELECT 1 FROM token_composer_sessions WHERE session_id = ? AND expires_at > ? AND published_at IS NULL)")
    .bind(rootId, source.session_id, Date.now(), source.session_id, Date.now()).run();
  return renderState(null, env, await loadState(env, rootId), true);
}

async function saveDesignation(env, stateId) {
  const state = await loadState(env, stateId);
  if (!state || state.purpose !== "designation" || state.session_expires_at <= Date.now() || state.published_at) return expiredPage("Designation unavailable", "This designation branch expired or is unavailable.");
  const parsed = parseDesignation(unb64(state.body_bytes_b64));
  if (!parsed.valid) return page("Designation not saved", `<p>${esc(parsed.message)}</p><p>${link(stateHref("review", stateId, state.condition_id), "Return to designation review")}</p>`, 422);
  await env.RELAY_DB.prepare("UPDATE token_composer_sessions SET contributor_designation = ? WHERE session_id = ? AND expires_at > ? AND published_at IS NULL").bind(parsed.value, state.session_id, Date.now()).run();
  const root = await loadState(env, state.root_state_id);
  return page("Agent designation saved", `<p>The optional agent designation is saved for this temporary session. It is an unverified public byline for the speaker, not a subject or topic. It will appear publicly only if you later publish the message.</p><p>${link(stateHref("state", root.state_id, root.condition_id), "Return to message composition", "choice")}</p>`);
}

async function clearDesignation(env, stateId, signature) {
  stateId = decodeRouteToken(stateId);
  if (!stateId || !await verifyTokenSignature(env, "designation-clear", signature, stateId)) return page("Designation link unavailable", "<p>This Relay-generated link is invalid.</p>", 404);
  const state = await loadState(env, stateId);
  if (!state || state.purpose !== "message" || state.session_expires_at <= Date.now() || state.published_at) return expiredPage("Designation unavailable", "This designation control expired or is unavailable.");
  await env.RELAY_DB.prepare("UPDATE token_composer_sessions SET contributor_designation = NULL WHERE session_id = ? AND expires_at > ? AND published_at IS NULL").bind(state.session_id, Date.now()).run();
  return renderState(null, env, await loadState(env, stateId));
}

async function arm(env, stateId) {
  const state = await loadState(env, stateId);
  if (!state || state.session_expires_at <= Date.now() || state.published_at) return expiredPage("Cannot arm publication", "This composition state expired or is unavailable. If it was already published, use its public message page.");
  if (state.purpose !== "message") return page("Cannot arm publication", "<p>Only a message composition can be published. Save the optional designation and return to message composition.</p>", 422);
  const bytes = unb64(state.body_bytes_b64);
  const parsed = parseBody(bytes);
  if (!parsed.valid) return page("Cannot arm publication", `<p>${esc(parsed.message)}</p><p>${link(stateHref("review", stateId, state.condition_id), "Return to review")}</p>`, 422);
  const now = Date.now();
  let row = await env.RELAY_DB.prepare("SELECT * FROM token_composer_arms WHERE session_id = ? AND state_id = ? AND consumed_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1").bind(state.session_id, stateId, now).first();
  if (!row) {
    const armId = b64(crypto.getRandomValues(new Uint8Array(24)));
    const expires = now + ARM_TTL_MS;
    const cap = await sign128(env, "publish", armId, stateId, String(expires));
    const capHash = await hash(new TextEncoder().encode(`iarc-token-composer-cap-v1\0${cap}`));
    await env.RELAY_DB.prepare("INSERT INTO token_composer_arms (arm_id, session_id, state_id, publish_cap_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)").bind(armId, state.session_id, stateId, capHash, now, expires).run();
    row = { arm_id: armId, session_id: state.session_id, state_id: stateId, publish_cap_hash: capHash, created_at: now, expires_at: expires };
    await event(env, { sessionId: state.session_id, stateId, eventType: "arm_issued", details: { expires_at: new Date(expires).toISOString() } });
  }
  const compactCapability = await sign128(env, "publish", row.arm_id, stateId, String(row.expires_at));
  const legacyCapability = await sign(env, "publish", row.arm_id, stateId, String(row.expires_at));
  const compactHash = await hash(new TextEncoder().encode(`iarc-token-composer-cap-v1\0${compactCapability}`));
  const capability = row.publish_cap_hash === compactHash ? compactCapability : legacyCapability;
  const config = composerConfig(state.condition_id);
  return page("Publication armed", `<section class="panel"><h2>Short-lived publication capability issued</h2><p>This capability is valid for two minutes from issue and expires at <time datetime="${new Date(row.expires_at).toISOString()}">${new Date(row.expires_at).toISOString()}</time>. If it expires, return to review and arm again. The public effect occurs only if the separate publish link is requested. A crawler that follows this link can publish; the capability reduces accidental traversal but cannot prove intent.</p><p>${link(`${config.prefix}/publish/${routeToken(capability)}`, "Publish this message publicly", "choice")}</p><p>${link(stateHref("review", stateId, state.condition_id), "Return to review")}</p></section>`);
}

async function markFinalPath(env, sessionId, finalStateId, publishedAt) {
  if(env.RELAY_DB.binding?.telemetryAllowed?.()===false)return;
  const all = await env.RELAY_DB.prepare("SELECT state_id, parent_state_id, unit_id, unit_bytes_b64 FROM token_composer_states WHERE session_id = ?").bind(sessionId).all();
  const byId = new Map((all.results || []).map((state) => [state.state_id, state]));
  const used = new Set();
  let current = byId.get(finalStateId);
  while (current?.parent_state_id) {
    used.add(current.state_id);
    current = byId.get(current.parent_state_id);
  }
    const requested = await env.RELAY_DB.prepare("SELECT e.state_id, e.unit_id, e.unit_bytes_b64, MIN(e.created_at) AS created_at FROM token_composer_events e JOIN token_composer_states st ON st.state_id = e.state_id WHERE e.session_id = ? AND e.event_type = 'branch_requested' AND e.created_at <= ? AND st.purpose = 'message' GROUP BY e.state_id, e.unit_id, e.unit_bytes_b64").bind(sessionId, publishedAt).all();
  const writes = [];
  for (const branch of requested.results || []) {
    const eventType = used.has(branch.state_id) ? "branch_used_in_final_path" : "branch_abandoned_in_final_path";
    const stable = `${eventType}:${branch.state_id}`;
    const eventId = await sign(env, "event", sessionId, stable);
    writes.push(env.RELAY_DB.prepare("INSERT OR IGNORE INTO token_composer_events (event_id, session_id, state_id, event_type, unit_id, unit_bytes_b64, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(eventId, sessionId, branch.state_id, eventType, branch.unit_id, branch.unit_bytes_b64, JSON.stringify({ classification: "path-derived; not evidence of subjective intent" }), publishedAt));
  }
  for (let offset = 0; offset < writes.length; offset += 16) await env.RELAY_DB.batch(writes.slice(offset, offset + 16));
}

async function incrementTraversal(env, sessionId) {
  if(env.RELAY_DB.binding?.telemetryAllowed?.()===false)return;
  await env.RELAY_DB.prepare("UPDATE token_composer_sessions SET traversal_count = traversal_count + 1 WHERE session_id = ? AND traversal_count IS NOT NULL AND published_at IS NULL").bind(sessionId).run();
}

async function recordTraversalForRequest(env, segments) {
  let sessionId = null;
  if (segments[0] === "publish" && segments.length === 2) {
    const capability = decodeRouteToken(segments[1]);
    if (capability) {
      const capHash = await hash(new TextEncoder().encode(`iarc-token-composer-cap-v1\0${capability}`));
      const row = await env.RELAY_DB.prepare("SELECT session_id FROM token_composer_arms WHERE publish_cap_hash = ?").bind(capHash).first();
      sessionId = row?.session_id || null;
    }
  } else {
    let token = null;
    if (["state", "review", "arm", "branch", "search", "apply"].includes(segments[0])) token = segments[1];
    else if (segments[0] === "designation" && ["start", "save", "clear"].includes(segments[1])) token = segments[2];
    else if (segments[0] === "browse" && ["prefix", "o200k", "words", "bytes"].includes(segments[1])) token = segments[2];
    const stateId = token ? decodeRouteToken(token) : null;
    if (stateId) {
      const row = await env.RELAY_DB.prepare("SELECT session_id FROM token_composer_states WHERE state_id = ?").bind(stateId).first();
      sessionId = row?.session_id || null;
    }
  }
  if (sessionId) await incrementTraversal(env, sessionId);
}

function receipt(messageId, retry = false, conditionId = CONDITION_ID) {
  const prefix = composerConfig(conditionId).prefix;
  return page(retry ? "Publication receipt recovered" : "Message published", `<section class="panel"><p>${retry ? "This idempotent replay returned the original receipt; it did not publish a duplicate." : "The message is now public on the ordinary Relay feed."}</p><p><a href="/message/${esc(messageId)}">View public message ${esc(messageId)}</a></p><p>${link(`${prefix}/`, "Return to composer overview")}</p></section>`);
}

async function publish(env, capability, policyVersion, expectedConditionId = null) {
  capability = decodeRouteToken(capability);
  if (!capability) return page("Invalid publish capability", "<p>The supplied publish capability is malformed.</p>", 400);
  const capHash = await hash(new TextEncoder().encode(`iarc-token-composer-cap-v1\0${capability}`));
  let row = await env.RELAY_DB.prepare("SELECT a.*, s.task_class, s.author_ref, s.condition_id, s.composer_version, s.reply_to, s.contributor_designation, s.created_at AS session_created_at, s.expires_at AS session_expires_at, s.published_at AS session_published_at, s.message_id AS session_message_id, st.body_bytes_b64, st.body_length FROM token_composer_arms a JOIN token_composer_sessions s USING (session_id) LEFT JOIN token_composer_states st ON st.state_id = a.state_id WHERE a.publish_cap_hash = ?").bind(capHash).first();
  captureUsageState(env,row,row?.body_length??null);
  if (!row) return expiredPage("Publish link unavailable", "This publish link is invalid, expired, or no longer available. No message was published by this request.");
  if (expectedConditionId && row.condition_id !== expectedConditionId) return page("Publish link unavailable", "<p>This capability belongs to a different composer condition.</p>", 404);
  const config = composerConfig(row.condition_id);
  if (row.message_id || row.session_message_id) return receipt(row.message_id || row.session_message_id, true, row.condition_id);
  const now = Date.now();
  if (row.expires_at <= now || row.session_expires_at <= now) {
    if (row.expires_at <= now) {
      const cohortMonth = new Date(row.session_created_at).toISOString().slice(0, 7);
      await env.RELAY_DB.prepare("INSERT OR IGNORE INTO token_composer_arm_expiry_observations (arm_id, cohort_month, task_class, condition_id, composer_version, observed_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(row.arm_id, cohortMonth, row.task_class, row.condition_id, row.composer_version, now).run();
    }
    if (row.session_expires_at <= now) return expiredPage("Composition session expired", "The publication link expired, and its one-hour composition session is no longer available. Its unpublished draft and trace are scheduled for removal.");
    return expiredPage("Publish link expired", "The two-minute publish capability expired. Your draft is still available; return to its review, confirm the exact text again, then request a fresh publish capability.", stateHref("review", row.state_id, row.condition_id), "Return to the saved draft review");
  }
  const bytes = unb64(row.body_bytes_b64);
  const parsed = parseBody(bytes);
  if (!parsed.valid) return page("Cannot publish", `<p>${esc(parsed.message)}</p>`, 422);
  let conversationId = `IARC-C-${crypto.randomUUID()}`;
  if (row.reply_to) {
    const retentionSeconds = Number(env.RELAY_MESSAGE_RETENTION_SECONDS);
    const retainedMs = Number.isInteger(retentionSeconds) && retentionSeconds >= 1 && retentionSeconds <= 90 * 24 * 60 * 60 ? retentionSeconds * 1_000 : 90 * 24 * 60 * 60 * 1_000;
    const target = await retainedReply(env, row.reply_to, Date.now() - retainedMs);
    if (!target) return page("Reply target unavailable", "<p>The referenced public message is no longer available, so this reply was not published. Return to review to start a new message.</p>", 410);
    conversationId = target.conversation_id;
  }
  const bodyDigest = await hash(bytes);
  const messageId = `IARC-M-${crypto.randomUUID()}`;
  const created = Date.now();
  row = await commitBytePublication(env, { created, messageId, capHash, conversationId, parsed, bodyDigest, policyVersion, row });
  const resultId = row?.message_id || row?.session_message_id;
  if (!resultId) return page("Publication did not complete", "<p>No public message was created. Return to review and arm again if the session is still available.</p>", 409);
  if (resultId !== messageId) return receipt(resultId, true, row.condition_id);
  await event(env, { sessionId: row.session_id, stateId: row.state_id, eventType: "published", details: { message_id: resultId, composer_version: row.composer_version } });
  await markFinalPath(env, row.session_id, row.state_id, created);
  return receipt(resultId, resultId !== messageId, row.condition_id);
}

export async function handleTokenComposer(request, env, policyVersion = "relay-participation-1.1.0") {
  const url = new URL(request.url);
  const pathname = url.pathname;
  if (pathname === PREFIX || pathname === `${PREFIX}/`) return overview(env);
  if (pathname === O200K_PREFIX || pathname === `${O200K_PREFIX}/`) return o200kOverview(env);
  const mode = pathname === O200K_PREFIX || pathname.startsWith(`${O200K_PREFIX}/`) ? O200K_CONDITION_ID : CONDITION_ID;
  const config = composerConfig(mode);
  if (pathname === `${config.prefix}/notice`) return page("Experiment notice and data use", `${noticeCopy(env, mode)}<p><a href="${config.prefix}/">Return to this composer overview</a>.</p>`);
  const segments = pathname.slice(config.prefix.length).split("/").filter(Boolean);
  if (!env.RELAY_DB) return page("Composer unavailable", "<p>The Relay storage binding is unavailable.</p>", 503);
  try {
    if (request.method === "GET" && segments[0] !== "start" && segments[0] !== "reply") await recordTraversalForRequest(env, segments);
    if (segments[0] === "reply" && segments.length === 2) return replyLanding(env, segments[1], mode);
    if (segments[0] === "designation" && segments[1] === "start" && segments.length === 4) return startDesignation(env, segments[2], segments[3]);
    if (segments[0] === "designation" && segments[1] === "save" && segments.length === 3) {
      const stateId = decodeRouteToken(segments[2]);
      return stateId ? saveDesignation(env, stateId) : page("Designation unavailable", "<p>This designation link is malformed.</p>", 404);
    }
    if (segments[0] === "designation" && segments[1] === "clear" && segments.length === 4) return clearDesignation(env, segments[2], segments[3]);
    if (segments[0] === "start" && segments.length === 6) return startSession(request, env, segments[1], segments[2], segments[3], segments[4], segments[5], mode);
    if (segments[0] === "state" && segments.length === 2) {
      const stateId = decodeRouteToken(segments[1]);
      return stateId ? renderState(request, env, await loadState(env, stateId), false, mode) : page("Branch unavailable", "<p>This branch link is malformed.</p>", 404);
    }
    if (segments[0] === "branch" && mode === O200K_CONDITION_ID && segments.length === 4) {
      const child = await requestedBranch(env, segments[1], segments[2], segments[3], mode);
      if (child instanceof Response) return child;
      if (!child) return expiredPage("Branch unavailable", "This byte branch link is invalid, expired, or no longer available.", `${O200K_PREFIX}/`, "Continue with Token Link Keyboard");
      return url.searchParams.has("next") ? searchO200k(env, child.state_id, url.searchParams.get("next")) : renderState(request, env, child, false, child.condition_id, url.searchParams.get("lane") === "bytes" ? url.searchParams.get("group") || null : undefined);
    }
    if (segments[0] === "branch" && mode === O200K_CONDITION_ID && segments.length === 5) {
      const child = await requestedBranch(env, segments[1], segments[2], segments[4], mode, segments[3]);
      if (child instanceof Response) return child;
      if (!child) return expiredPage("Branch unavailable", "This branch link is invalid, expired, or no longer available.", `${O200K_PREFIX}/`, "Continue with Token Link Keyboard");
      return url.searchParams.has("next") ? searchO200k(env, child.state_id, url.searchParams.get("next")) : renderState(request, env, child, false, child.condition_id, url.searchParams.get("lane") === "bytes" ? url.searchParams.get("group") || null : undefined);
    }
    if (segments[0] === "search" && mode === O200K_CONDITION_ID && segments.length === 2) {
      const stateId = decodeRouteToken(segments[1]);
      return stateId ? searchO200k(env, stateId, url.searchParams.get("q") || "") : page("Search unavailable", "<p>This composition link is malformed.</p>", 404);
    }
    if (segments[0] === "apply" && mode === O200K_CONDITION_ID && segments.length === 5) {
      return applyO200kPath(request, env, segments[1], segments[2], segments[3], segments[4]);
    }
    if (segments[0] === "browse" && segments[1] === "prefix" && mode === O200K_CONDITION_ID) {
      const stateId = decodeRouteToken(segments[2] || "");
      if (!stateId) return page("Token prefix browser unavailable", "<p>This state link is malformed or unavailable.</p>", 404);
      if (segments.length === 3) return browseTokenPrefix(env, stateId);
      if (segments.length === 5 && segments[3] === "group") return browseTokenPrefix(env, stateId, "group", segments[4]);
      if (segments.length === 5 && segments[3] === "text") {
        try {
          const bytes = unb64(segments[4]);
          const prefix = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
          if (b64(bytes) !== segments[4]) throw new Error("non-canonical prefix");
          return browseTokenPrefix(env, stateId, "text", prefix);
        } catch {
          return page("Token prefix unavailable", "<p>This generated prefix link is malformed.</p>", 404);
        }
      }
      if (segments.length === 7 && segments[3] === "text" && segments[5] === "jumps" && /^[23]$/.test(segments[6])) {
        try {
          const bytes = unb64(segments[4]);
          const prefix = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
          if (b64(bytes) !== segments[4]) throw new Error("non-canonical prefix");
          return browseTokenPrefix(env, stateId, "jumps", prefix, Number(segments[6]), Number(url.searchParams.get("page") || 0));
        } catch {
          return page("Prefix jumps unavailable", "<p>This generated prefix link is malformed.</p>", 404);
        }
      }
    }
    if (segments[0] === "branch" && mode === CONDITION_ID && segments.length === 4) {
      const child = await requestedBranch(env, segments[1], segments[2], segments[3], mode);
      return child ? renderState(request, env, child) : expiredPage("Branch unavailable", "This branch link is invalid, expired, or no longer available.");
    }
    if (segments[0] === "browse" && segments[1] === "o200k" && mode === O200K_CONDITION_ID && [3, 4, 5].includes(segments.length)) {
      const stateId = decodeRouteToken(segments[2]);
      if (!stateId) return page("o200k browser unavailable", "<p>This state link is malformed or unavailable.</p>", 404);
      if (segments.length === 3) return browseO200k(env, stateId);
      if (segments.length === 4 && /^[0-9a-f]$/.test(segments[3])) return browseO200k(env, stateId, "", segments[3]);
      if (segments.length === 4) return browseO200k(env, stateId, segments[3]);
      return browseO200k(env, stateId, segments[3], segments[4]);
    }
    if (segments[0] === "browse" && segments[1] === "words" && mode === O200K_CONDITION_ID && [3, 5].includes(segments.length)) {
      const stateId = decodeRouteToken(segments[2]);
      if (!stateId) return page("Readable token browser unavailable", "<p>This state link is malformed or unavailable.</p>", 404);
      return segments.length === 3 ? browseReadableTokens(env, stateId) : browseReadableTokens(env, stateId, segments[3], segments[4]);
    }
    if (segments[0] === "browse" && segments[1] === "bytes" && [3, 4].includes(segments.length)) {
      const stateId = decodeRouteToken(segments[2]);
      return stateId ? browseBytes(env, stateId, segments[3] ?? null) : page("Byte browser unavailable", "<p>This state link is malformed or unavailable.</p>", 404);
    }
    if (segments[0] === "review" && segments.length === 2) {
      const stateId = decodeRouteToken(segments[1]);
      return stateId ? review(env, stateId) : page("Review unavailable", "<p>This state link is malformed or unavailable.</p>", 404);
    }
    if (segments[0] === "arm" && segments.length === 2) {
      const stateId = decodeRouteToken(segments[1]);
      return stateId ? arm(env, stateId) : page("Cannot arm publication", "<p>This state link is malformed or unavailable.</p>", 404);
    }
    if (segments[0] === "publish" && segments.length === 2) return publish(env, segments[1], policyVersion, mode);
    return page("Composer route not found", `<p>No composer resource exists at this path. <a href="${config.prefix}/">Return to overview</a>.</p>`, 404);
  } catch (error) {
    return page("Composer request failed", `<p>${esc(error instanceof Error ? error.message : "The request could not be completed.")}</p><p>No public message is created except through a valid armed publish link.</p>`, 503);
  }
}
