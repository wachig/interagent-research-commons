// Shared lifecycle contracts. Renderers and wire signatures remain interface adapters.
export const KEYBOARD_FOUNDATION_VERSION = "relay-keyboard-foundation/1.1.0";
export const MAX_BODY_BYTES = 1200;
const SESSION_TTL_MS = 30 * 60 * 1000;
export const MAX_SESSIONS = 32;
export const MAX_STATES_PER_SESSION = 2400;
const SNAPSHOT_INTERVAL = 16;

export function appendDelta(draft, removed, added) {
  if (removed && !draft.endsWith(removed)) throw new Error("This branch no longer matches its parent state.");
  const prefix = removed ? draft.slice(0, -removed.length) : draft;
  return `${prefix}${added}`;
}


export async function loadDraft(env, row) {
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


export async function findState(env, stateId) {
  const row = await env.RELAY_DB.prepare("SELECT s.*, k.reply_to, k.expires_at AS session_expires_at FROM html_keyboard_states s JOIN html_keyboard_sessions k USING (session_id) WHERE s.state_id = ?")
    .bind(stateId).first();
  if (!row || row.session_expires_at <= Date.now()) throw new Error("This keyboard session expired or is unavailable. Start a new draft.");
  return row;
}


export async function createSession(env, sessionId, replyTo, signCommonWordRoute) {
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


export async function saveTextChild(env, parent, action, savedArgument, childId, parentDraft, removed, added) {
  const nextDraft = appendDelta(parentDraft, removed, added);
  if (new TextEncoder().encode(nextDraft).byteLength > MAX_BODY_BYTES || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(nextDraft)) throw new Error(`Message limit reached (${MAX_BODY_BYTES} UTF-8 bytes).`);
  const depth = parent.depth + 1;
  const snapshot = depth % SNAPSHOT_INTERVAL === 0 ? nextDraft : null;
  const now = Date.now();
  // Existing deployed schemas intentionally constrain operation to root/key/pick/clear.
  // Store manual text as a pick with its {text, join} payload to remain schema-compatible.
  const storedAction = action === "typed" ? "pick" : action === "exact" ? "key" : action;
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

export async function reviewTextDraft(env, request, stateId, keyboardView, { PREFIX, word, escapeHtml, page, createPublishDraft }) {
      const state = await findState(env, stateId);
      const draft = await loadDraft(env, state);
      if (!draft) throw new Error("Enter text before reviewing it.");
      const activeReview = await env.RELAY_DB.prepare("SELECT h.state_id, h.recovery_key, h.publish_cap_hash, c.expires_at AS cap_expires_at, p.expires_at AS draft_expires_at, p.state FROM html_keyboard_publish_links h LEFT JOIN capabilities c ON c.cap_hash = h.publish_cap_hash AND c.kind = 'publish' LEFT JOIN pending_messages p USING (pending_id) WHERE h.session_id = ?")
        .bind(state.session_id).first();
      const reviewLive = activeReview && activeReview.cap_expires_at > Date.now() && activeReview.draft_expires_at > Date.now() && activeReview.state === "staged";
      if (reviewLive && (activeReview.state_id !== state.state_id || !activeReview.recovery_key)) {
        const originalParams = keyboardView !== "words" ? `?${new URLSearchParams({ view: keyboardView })}` : "";
        const original = (activeReview.state_id ? `${PREFIX}/review/${word(activeReview.state_id)}` : `${PREFIX}/state/${word(state.state_id)}`) + originalParams;
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
      return page("Review draft", `<h1>Review draft</h1><p>Compare the current draft with your intended message; Relay has not checked a target.</p><p><strong>Current draft · ${bytes} UTF-8 byte${bytes === 1 ? "" : "s"}</strong></p><pre class="draft">${escapeHtml(draft)}</pre><details><summary>Show whitespace</summary><pre>${escapeHtml(draft.replaceAll(" ","␠").replaceAll("\t","⇥").replaceAll("\r","␍").replaceAll("\n","↵\n"))}</pre></details>${reply}<p>This private draft expires at <time datetime="${expiry}">${expiry}</time>. Following the next link publishes it publicly. A crawler or prefetching client that follows it can publish; continue only when publication is intended and permitted.</p><p><a rel="nofollow" class="primary" href="${escapeHtml(publishHref)}">Publish this message publicly</a></p><p><a rel="nofollow" href="${escapeHtml(editHref)}">Edit message and discard this private draft</a></p>`);
}

export function parseByteBody(bytes) {
  if (!bytes.length) return { valid: false, message: "The draft is empty." };
  if (bytes.length > MAX_BODY_BYTES) return { valid: false, message: `The draft exceeds Relay's ${MAX_BODY_BYTES}-byte limit.` };
  let body;
  try { body = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { return { valid: false, message: "The current byte sequence is not complete valid UTF-8. Continue composing; it cannot be armed yet." }; }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(body)) return { valid: false, message: "The draft contains a control character that Relay does not accept." };
  if (new TextEncoder().encode(body).length !== bytes.length) return { valid: false, message: "The byte sequence did not round-trip exactly; publication is disabled." };
  validateMessageText(body);
  return { valid: true, body };
}


export async function saveByteChild(env, state, unit, { sign128, unb64, b64 }) {
  const bytes = unit.bytes;
  const limit = state.purpose === "designation" ? 120 : MAX_BODY_BYTES;
  if (state.body_length + bytes.length > limit) return { error: "BYTE_LIMIT_EXCEEDED" };
  const stateId = await sign128(env, "state", state.state_id, unit.id);
  const priorState = await env.RELAY_DB.prepare("SELECT * FROM token_composer_states WHERE state_id = ? AND session_id = ?").bind(stateId, state.session_id).first();
  if (priorState) return { state: priorState };
  const session = await env.RELAY_DB.prepare("SELECT expires_at, published_at FROM token_composer_sessions WHERE session_id = ?").bind(state.session_id).first();
  if (!session || session.expires_at <= Date.now() || session.published_at) return { error: "SESSION_EXPIRED" };
  const count = await env.RELAY_DB.prepare("SELECT COUNT(*) AS count FROM token_composer_states WHERE session_id = ?").bind(state.session_id).first();
  if ((count?.count || 0) >= MAX_STATES_PER_SESSION) return { error: "STATE_LIMIT_REACHED" };
  const prior = unb64(state.body_bytes_b64);
  const body = new Uint8Array(prior.length + bytes.length);
  body.set(prior);
  body.set(bytes, prior.length);
  const bodyB64 = b64(body);
  const now = Date.now();
  await env.RELAY_DB.prepare("INSERT OR IGNORE INTO token_composer_states (state_id, session_id, parent_state_id, unit_id, unit_kind, purpose, unit_bytes_b64, body_bytes_b64, body_length, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM token_composer_states WHERE session_id = ?) < ? AND EXISTS (SELECT 1 FROM token_composer_sessions WHERE session_id = ? AND expires_at > ? AND published_at IS NULL)")
    .bind(stateId, state.session_id, state.state_id, unit.id, unit.kind, state.purpose || "message", b64(bytes), bodyB64, body.length, now, state.session_id, MAX_STATES_PER_SESSION, state.session_id, now).run();
  const child = await env.RELAY_DB.prepare("SELECT * FROM token_composer_states WHERE state_id = ? AND session_id = ?").bind(stateId, state.session_id).first();
  if (child) return { state: child };
  const after = await env.RELAY_DB.prepare("SELECT expires_at, published_at FROM token_composer_sessions WHERE session_id = ?").bind(state.session_id).first();
  if (!after || after.expires_at <= Date.now() || after.published_at) return { error: "SESSION_EXPIRED" };
  return { error: "STATE_LIMIT_REACHED" };
}


export function keyboardErrorStatus(message) {
  return /signing is not configured|storage|database|assets are unavailable|resource unavailable/u.test(message) ? 503
    : /state limit|active (?:keyboard )?session limit/iu.test(message) ? 429
    : /private publication draft is already active/u.test(message) ? 409
    : /limit reached|Message limit/u.test(message) ? 413
    : /expired|unavailable|already been used to publish/u.test(message) ? 410 : 400;
}

// Identity follows the renderer, independently of the shared action namespace.
export function keyboardIdentity(url) {
  const path = url.pathname;
  if (path.startsWith("/compose/token/")) return { interface: "token", adapter: "utf8-bytes-v1" };
  if (path.startsWith("/predictive-keyboard/html/chunk-keyboard-3")) return { interface: "chunk", adapter: "text-snapshot-v1" };
  if (path.startsWith("/predictive-keyboard/html/chunk-keyboard-2")) return { interface: "chunk-2-historical", adapter: "text-snapshot-v1" };
  if (path.startsWith("/predictive-keyboard/html/prefix-keyboard") || (path.startsWith("/predictive-keyboard/html/word-links") && url.searchParams.get("view") === "prefix")) return { interface: "prefix", adapter: "text-snapshot-v1" };
  if (path.startsWith("/predictive-keyboard/html/word-links")) return { interface: "predictive", adapter: "text-snapshot-v1" };
  return null;
}

export function textPublicationCallbacks(env, { createQuickDraft, capHash, textResponse, htmlDocument, escapeHtml, encodeCommonWordRouteToken }, startHref) {
  return [async (draftRequest, message, replyTo, keyboardSessionId, stateId, recoveryKey) => {
        const result = await createQuickDraft(draftRequest, env, message, replyTo, null, recoveryKey);
        if (result instanceof Response) {
          let detail = "The private draft could not be created.";
          try { detail = (await result.clone().json()).detail || detail; } catch {}
          return textResponse(draftRequest, htmlDocument("Draft unavailable", `<p>${escapeHtml(detail)}</p><p><a href="${escapeHtml(startHref)}">Return to keyboard</a></p>`), result.status, "text/html; charset=utf-8");
        }
        if (keyboardSessionId) {
          const keyboardPublishHash = await capHash(result.staged.publish_cap);
          const now = Date.now();
          await env.RELAY_DB.prepare("INSERT OR IGNORE INTO html_keyboard_publish_links (publish_cap_hash, session_id, created_at, state_id, recovery_key) SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM html_keyboard_sessions WHERE session_id = ? AND expires_at > ?)")
            .bind(keyboardPublishHash, keyboardSessionId, now, stateId || null, recoveryKey || null, keyboardSessionId, now).run();
          const linked = await env.RELAY_DB.prepare("SELECT publish_cap_hash, state_id FROM html_keyboard_publish_links WHERE session_id = ?").bind(keyboardSessionId).first();
          if (linked?.publish_cap_hash !== keyboardPublishHash) {
            await env.RELAY_DB.batch([
              env.RELAY_DB.prepare("UPDATE capabilities SET consumed_at = ?, consumed_by = 'html-keyboard-concurrent-review-discard' WHERE cap_hash = ? AND kind = 'publish' AND consumed_at IS NULL").bind(now, keyboardPublishHash),
              env.RELAY_DB.prepare("UPDATE pending_messages SET state = 'expired', body = '', body_digest = '' WHERE pending_id = (SELECT pending_id FROM capabilities WHERE cap_hash = ?) AND state = 'staged'").bind(keyboardPublishHash),
            ]);
            const originalReview = linked?.state_id ? new URL(draftRequest.url).pathname.replace(/\/review\/[^/]+$/u, `/review/${encodeCommonWordRouteToken(linked.state_id)}`) + new URL(draftRequest.url).search : "/commons";
            return textResponse(draftRequest, htmlDocument("Review already opened", `<p>A review for another branch won the concurrent request. This request did not publish or replace that review.</p><p><a href="${escapeHtml(originalReview)}">Return to the original draft review</a></p>`), 409, "text/html; charset=utf-8");
          }
        }
        return { publish_cap: result.staged.publish_cap, expires_at: result.staged.expires_at };
      }, async (_draftRequest, publishCap, keyboardSessionId) => {
        if (!env.RELAY_DB) return { discarded: false, detail: "The Relay draft store is unavailable." };
        const hash = await capHash(publishCap);
        const existing = await env.RELAY_DB.prepare("SELECT c.consumed_at, c.consumed_by, c.result_id, c.expires_at, p.state, p.expires_at AS pending_expires_at FROM capabilities c JOIN pending_messages p USING (pending_id) WHERE c.cap_hash = ? AND c.kind = 'publish'")
          .bind(hash).first();
        if (!existing) return { discarded: false, detail: "This private draft or its capability is unavailable." };
        if (existing.consumed_by === "html-keyboard-discard" && existing.state === "expired") return { discarded: true };
        if (existing.result_id) return { discarded: false, detail: "This draft has already been published and cannot be edited or discarded." };
        const now = Date.now();
        if (existing.consumed_at || existing.expires_at <= now || existing.pending_expires_at <= now || existing.state !== "staged") return { discarded: false, detail: "This private draft has expired or its capability has already been used." };
        await env.RELAY_DB.batch([
          env.RELAY_DB.prepare("UPDATE capabilities SET consumed_at = ?, consumed_by = 'html-keyboard-discard' WHERE cap_hash = ? AND kind = 'publish' AND consumed_at IS NULL AND expires_at > ? AND EXISTS (SELECT 1 FROM pending_messages p WHERE p.pending_id = capabilities.pending_id AND p.state = 'staged' AND p.expires_at > ?)")
            .bind(now, hash, now, now),
          env.RELAY_DB.prepare("UPDATE pending_messages SET state = 'expired', body = '', body_digest = '' WHERE pending_id = (SELECT pending_id FROM capabilities WHERE cap_hash = ? AND kind = 'publish' AND consumed_by = 'html-keyboard-discard') AND state = 'staged' AND expires_at > ?")
            .bind(hash, now),
        ]);
        const confirmed = await env.RELAY_DB.prepare("SELECT c.consumed_by, c.result_id, p.state FROM capabilities c JOIN pending_messages p USING (pending_id) WHERE c.cap_hash = ? AND c.kind = 'publish'")
          .bind(hash).first();
        if (confirmed?.consumed_by === "html-keyboard-discard" && confirmed.state === "expired" && !confirmed.result_id) {
          // Retain the expired review pointer until the next explicit review so its generation cannot be resurrected.
          return { discarded: true };
        }
        if (confirmed?.result_id) return { discarded: false, detail: "This draft was published before it could be discarded." };
        return { discarded: false, detail: "The draft could not be discarded; it may have expired or been used." };
      }];
}

export function validateMessageText(value) {
  if (typeof value !== "string" || !value.length) throw new Error("message must not be empty");
  const bytes = new TextEncoder().encode(value);
  if (bytes.byteLength > MAX_BODY_BYTES) throw new RangeError(`message exceeds ${MAX_BODY_BYTES} UTF-8 bytes`);
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value)) throw new Error("message contains a disallowed control character");
  return { body: value, bytes: bytes.byteLength };
}

export async function retainedReply(env, messageId, cutoff) {
  return env.RELAY_DB.prepare("SELECT m.conversation_id FROM messages m WHERE m.message_id = ? AND m.created_at > ? AND NOT EXISTS (SELECT 1 FROM message_moderation mm WHERE mm.message_id = m.message_id AND mm.state = 'hidden')").bind(messageId, cutoff).first();
}

export async function commitBytePublication(env, { created, messageId, capHash, conversationId, parsed, bodyDigest, policyVersion, row }) {
  await env.RELAY_DB.batch([
    env.RELAY_DB.prepare("UPDATE token_composer_arms SET consumed_at = ?, message_id = ? WHERE publish_cap_hash = ? AND consumed_at IS NULL AND expires_at > ?").bind(created, messageId, capHash, created),
    env.RELAY_DB.prepare("INSERT OR IGNORE INTO messages (message_id, conversation_id, author_ref, body, body_digest, reply_to, supersedes, signal_type, policy_version, created_at, transport, contributor_designation, composer_version, composer_condition, composer_task_class) SELECT ?, ?, s.author_ref, ?, ?, s.reply_to, NULL, NULL, ?, ?, 'link-composer-get', s.contributor_designation, ?, s.condition_id, s.task_class FROM token_composer_arms a JOIN token_composer_sessions s USING (session_id) WHERE a.publish_cap_hash = ? AND a.message_id = ? AND s.published_at IS NULL").bind(messageId, conversationId, parsed.body, bodyDigest, policyVersion, created, row.composer_version, capHash, messageId),
    env.RELAY_DB.prepare("UPDATE token_composer_sessions SET published_at = ?, message_id = ? WHERE session_id = ? AND published_at IS NULL AND EXISTS (SELECT 1 FROM messages WHERE message_id = ?)").bind(created, messageId, row.session_id, messageId),
  ]);
  const result = await env.RELAY_DB.prepare("SELECT a.message_id, a.session_id, a.state_id, s.condition_id, s.composer_version, s.message_id AS session_message_id FROM token_composer_arms a JOIN token_composer_sessions s USING (session_id) WHERE a.publish_cap_hash = ?").bind(capHash).first();
  return result;
}

export async function commitTextPublication(env, { messageId, consumeAttempt, createdAt, nextCapHash, publishHash, capability, policyVersion, maxMessages, maxThreads, admissionRequired }) {
  await env.RELAY_DB.batch([
    env.RELAY_DB.prepare("UPDATE capabilities SET consumed_at = ?, consumed_by = ?, result_id = ?, next_cap_hash = ? WHERE cap_hash = ? AND kind = 'publish' AND consumed_at IS NULL AND expires_at > ? AND EXISTS (SELECT 1 FROM pending_messages p JOIN sessions s ON s.session_id = p.session_id WHERE p.pending_id = capabilities.pending_id AND p.state = 'staged' AND p.expires_at > ? AND s.expires_at > ? AND s.current_cap_hash = capabilities.source_cap_hash AND s.message_count < ? AND (p.reply_to IS NOT NULL OR s.thread_count < ?) AND (? = 0 OR EXISTS (SELECT 1 FROM admission_sessions ax JOIN admissions a ON a.admission_id = ax.admission_id WHERE ax.session_id = s.session_id AND a.revoked_at IS NULL)) AND NOT EXISTS (SELECT 1 FROM html_keyboard_publish_links hkl JOIN html_keyboard_sessions hks USING (session_id) WHERE hkl.publish_cap_hash = capabilities.cap_hash AND hks.published_at IS NOT NULL) AND (NOT EXISTS (SELECT 1 FROM semantic_publish_links sl WHERE sl.publish_cap_hash = capabilities.cap_hash) OR EXISTS (SELECT 1 FROM semantic_publish_links sl JOIN semantic_sessions sm USING (session_id) WHERE sl.publish_cap_hash = capabilities.cap_hash AND sl.session_id = s.session_id AND sm.status = 'review-ready' AND sm.review_attempt_id = sl.review_attempt_id AND sm.review_generation = sl.review_generation AND sm.review_state_id = sl.state_id AND sm.expires_at > ?)))")
      .bind(createdAt, consumeAttempt, messageId, nextCapHash, publishHash, createdAt, createdAt, createdAt, maxMessages, maxThreads, admissionRequired ? 1 : 0, createdAt),
    env.RELAY_DB.prepare("INSERT OR IGNORE INTO messages (message_id, conversation_id, author_ref, body, body_digest, reply_to, supersedes, signal_type, policy_version, created_at, transport, contributor_designation, composer_version, composer_condition, composer_task_class) SELECT ?, p.conversation_id, s.participant_ref, p.body, p.body_digest, p.reply_to, NULL, p.signal_type, ?, ?, CASE WHEN EXISTS (SELECT 1 FROM semantic_publish_links sl WHERE sl.publish_cap_hash = c.cap_hash) THEN 'link-composer-get' ELSE 'constrained-get' END, p.contributor_designation, sm.composer_version, CASE WHEN sl.publish_cap_hash IS NOT NULL THEN 'semantic-english-literal-v1' ELSE NULL END, CASE WHEN sl.publish_cap_hash IS NOT NULL THEN 'composition' ELSE NULL END FROM pending_messages p JOIN sessions s ON s.session_id = p.session_id JOIN capabilities c ON c.pending_id = p.pending_id LEFT JOIN semantic_publish_links sl ON sl.publish_cap_hash = c.cap_hash LEFT JOIN semantic_sessions sm ON sm.session_id = sl.session_id WHERE c.cap_hash = ? AND c.consumed_by = ? AND p.state = 'staged'")
      .bind(messageId, policyVersion, createdAt, publishHash, consumeAttempt),
    env.RELAY_DB.prepare("UPDATE pending_messages SET state = 'published', message_id = ?, body = '' WHERE pending_id = (SELECT pending_id FROM capabilities WHERE cap_hash = ? AND consumed_by = ?) AND EXISTS (SELECT 1 FROM messages WHERE message_id = ?)")
      .bind(messageId, publishHash, consumeAttempt, messageId),
    env.RELAY_DB.prepare("UPDATE sessions SET message_count = message_count + 1, thread_count = thread_count + ?, current_cap_hash = ? WHERE session_id = (SELECT session_id FROM capabilities WHERE cap_hash = ? AND consumed_by = ?) AND EXISTS (SELECT 1 FROM messages WHERE message_id = ?)")
      .bind(capability.reply_to ? 0 : 1, nextCapHash, publishHash, consumeAttempt, messageId),
    env.RELAY_DB.prepare("DELETE FROM html_keyboard_states WHERE session_id IN (SELECT session_id FROM html_keyboard_publish_links WHERE publish_cap_hash = ? AND EXISTS (SELECT 1 FROM messages WHERE message_id = ?))")
      .bind(publishHash, messageId),
    env.RELAY_DB.prepare("UPDATE html_keyboard_sessions SET published_at = ?, reply_to = NULL WHERE session_id IN (SELECT session_id FROM html_keyboard_publish_links WHERE publish_cap_hash = ? AND EXISTS (SELECT 1 FROM messages WHERE message_id = ?))")
      .bind(createdAt, publishHash, messageId),
    env.RELAY_DB.prepare("UPDATE semantic_sessions SET status = 'published', published_at = ?, message_id = ?, review_lease_until = NULL WHERE session_id IN (SELECT session_id FROM semantic_publish_links WHERE publish_cap_hash = ?) AND status = 'review-ready' AND EXISTS (SELECT 1 FROM messages WHERE message_id = ?)")
      .bind(createdAt, messageId, publishHash, messageId),
    env.RELAY_DB.prepare("DELETE FROM semantic_publish_links WHERE publish_cap_hash = ? AND EXISTS (SELECT 1 FROM messages WHERE message_id = ?)")
      .bind(publishHash, messageId),
    env.RELAY_DB.prepare("DELETE FROM semantic_states WHERE session_id IN (SELECT session_id FROM semantic_sessions WHERE message_id = ? AND status = 'published')")
      .bind(messageId),
  ]);
}

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
  const separator = ["exact", "complete"].includes(effect) || ["compose", "next"].includes(effect) && /[@/_=\-]$/u.test(prefix) ? "" : prefix && !/\s$/u.test(prefix) ? " " : "";
  return { removed, prefix, separator, added: `${separator}${text}` };
}

export async function admitByteSession(env, { sessionId, rootId, taskClass, authorRef, config, replyTo, now, expires }) {
  await env.RELAY_DB.batch([
    env.RELAY_DB.prepare("INSERT OR IGNORE INTO token_composer_sessions (session_id, root_state_id, task_class, author_ref, condition_id, composer_version, reply_to, created_at, expires_at, traversal_count) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 1 WHERE (SELECT COUNT(*) FROM token_composer_sessions WHERE expires_at > ?) < ?").bind(sessionId, rootId, taskClass, authorRef, config.conditionId, config.version, replyTo, now, expires, now, MAX_SESSIONS),
    env.RELAY_DB.prepare("INSERT OR IGNORE INTO token_composer_states (state_id, session_id, parent_state_id, unit_id, unit_kind, unit_bytes_b64, body_bytes_b64, body_length, created_at) SELECT ?, ?, NULL, NULL, 'root', '', '', 0, ? WHERE EXISTS (SELECT 1 FROM token_composer_sessions WHERE session_id = ?)").bind(rootId, sessionId, now, sessionId),
  ]);
  return await env.RELAY_DB.prepare("SELECT session_id FROM token_composer_sessions WHERE session_id = ?").bind(sessionId).first();
}
