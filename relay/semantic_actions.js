const encoder = new TextEncoder();
const TOKEN_LIMIT = 7_500;

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function decodeBase64url(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/u.test(value)) throw new TypeError("Action capability is malformed.");
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4);
  const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export async function signSemanticAction(env, deriveCapability, payload) {
  const encoded = base64url(encoder.encode(JSON.stringify(payload)));
  const signature = await deriveCapability(env, "semantic-action-v1", encoded);
  const token = `${encoded}.${signature}`;
  if (token.length > TOKEN_LIMIT) throw new RangeError("This action link is too large. Choose a shorter addition.");
  return token;
}

export async function verifySemanticAction(env, deriveCapability, token, now = Date.now()) {
  if (typeof token !== "string" || token.length > TOKEN_LIMIT) throw new TypeError("Action capability is missing or too long.");
  const split = token.lastIndexOf(".");
  if (split < 1) throw new TypeError("Action capability is malformed.");
  const encoded = token.slice(0, split);
  const supplied = token.slice(split + 1);
  if (!/^[A-Za-z0-9_-]{43}$/u.test(supplied)) throw new TypeError("Action signature is malformed.");
  const expected = await deriveCapability(env, "semantic-action-v1", encoded);
  if (!constantTimeEqual(supplied, expected)) throw new TypeError("Action signature is invalid.");
  let payload;
  try { payload = JSON.parse(decodeBase64url(encoded)); }
  catch { throw new TypeError("Action payload is invalid."); }
  if (!payload || payload.version !== 1 || typeof payload.session_id !== "string" || typeof payload.state_id !== "string" || typeof payload.kind !== "string" || !Number.isSafeInteger(payload.expires_at) || payload.expires_at <= now) {
    throw new TypeError("Action capability is expired or invalid.");
  }
  return payload;
}

export function semanticActionPayload({ sessionId, stateId, kind, data, expiresAt }) {
  return { version: 1, session_id: sessionId, state_id: stateId, kind, data, expires_at: expiresAt };
}
