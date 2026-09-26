import protocolRuntime from "./runtime.js";
import { SCHEMA_STATEMENTS } from "./schema.js";

const DEFAULT_RELAY_OBJECT_NAME = "iarc-relay-local-prototype-global-v1";
const MAX_STORAGE_RPC_BYTES = 32_768;
const ADMISSION_THROTTLE_WINDOW_MS = 10 * 60 * 1_000;
const RELAY_TABLES = new Set(["admissions", "admission_sessions", "admission_challenges", "sessions", "capabilities", "pending_messages", "messages", "message_moderation", "relay_admin_settings", "admin_audit"]);

function jsonResponse(value, status = 200) {
  return new Response(`${JSON.stringify(value)}\n`, {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function validateStatement(statement, { allowRun = true } = {}) {
  if (!statement || typeof statement !== "object" || Array.isArray(statement)) throw new TypeError("invalid storage statement");
  const { query, values, mode } = statement;
  if (typeof query !== "string" || query.length > 4_096 || query.includes(";")) throw new TypeError("invalid storage query");
  if (!Array.isArray(values) || values.length > 64 || values.some((value) => value !== null && !["string", "number", "boolean"].includes(typeof value))) throw new TypeError("invalid storage values");
  if (!(mode === "first" || mode === "all" || (allowRun && mode === "run"))) throw new TypeError("invalid storage operation");
  if (!/^\s*(?:SELECT|INSERT|UPDATE|DELETE)\b/i.test(query) || /\b(?:ATTACH|DETACH|PRAGMA|CREATE|DROP|ALTER|VACUUM|REINDEX)\b/i.test(query)) throw new TypeError("storage statement is outside the relay data API");
  const referencedTables = [...query.matchAll(/\b(?:FROM|JOIN|INTO|UPDATE)\s+([a-z_][a-z0-9_]*)/gi)].map((match) => match[1].toLowerCase());
  if (referencedTables.length === 0 || referencedTables.some((table) => !RELAY_TABLES.has(table))) throw new TypeError("storage statement references a non-relay table");
  return { query, values, mode };
}

export class RelayDatabase {
  constructor(namespace, objectName = DEFAULT_RELAY_OBJECT_NAME) {
    this.namespace = namespace;
    this.objectName = objectName;
  }

  async execute(statement) {
    return this.#send({ operation: "execute", statement: validateStatement(statement) });
  }

  async batch(statements) {
    if (!Array.isArray(statements) || statements.length < 1 || statements.length > 16) throw new TypeError("invalid storage batch");
    return this.#send({ operation: "batch", statements: statements.map((statement) => validateStatement({ ...statement, mode: "run" })) });
  }

  async #send(payload) {
    const id = this.namespace.idFromName(this.objectName);
    const stub = this.namespace.get(id);
    const response = await stub.fetch(new Request("https://relay-storage.internal/sql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }));
    const result = await response.json();
    if (!response.ok) throw new Error(result?.detail || "relay storage operation failed");
    return result;
  }
}

export class RelayStore {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.sql = ctx.storage.sql;
    const retentionSeconds = Number(env?.RELAY_MESSAGE_RETENTION_SECONDS);
    this.messageRetentionMs = Number.isInteger(retentionSeconds) && retentionSeconds >= 1 && retentionSeconds <= 90 * 24 * 60 * 60
      ? retentionSeconds * 1_000
      : 90 * 24 * 60 * 60 * 1_000;
    for (const statement of SCHEMA_STATEMENTS) this.sql.exec(statement);
  }

  #first(query, ...values) {
    return this.sql.exec(query, ...values).toArray()[0] || null;
  }

  #run(query, ...values) {
    this.sql.exec(query, ...values).toArray();
  }

  async fetch(request) {
    if (request.method !== "POST" || new URL(request.url).pathname !== "/sql") return jsonResponse({ detail: "not found" }, 404);
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_STORAGE_RPC_BYTES) return jsonResponse({ detail: "storage request too large" }, 413);
    let payload;
    try { payload = JSON.parse(body); }
    catch { return jsonResponse({ detail: "invalid storage request" }, 400); }

    try {
      if (payload.operation === "execute") {
        const statement = validateStatement(payload.statement);
        if (statement.mode === "first") return jsonResponse(this.#first(statement.query, ...statement.values));
        if (statement.mode === "all") return jsonResponse({ results: this.sql.exec(statement.query, ...statement.values).toArray() });
        this.#run(statement.query, ...statement.values);
        await this.ctx.storage.setAlarm(Date.now() + 60_000);
        return jsonResponse({ success: true });
      }
      if (payload.operation === "batch" && Array.isArray(payload.statements) && payload.statements.length >= 1 && payload.statements.length <= 16) {
        const statements = payload.statements.map((statement) => validateStatement(statement));
        this.ctx.storage.transactionSync(() => {
          for (const statement of statements) this.#run(statement.query, ...statement.values);
        });
        await this.ctx.storage.setAlarm(Date.now() + 60_000);
        return jsonResponse({ success: true });
      }
      return jsonResponse({ detail: "invalid storage operation" }, 400);
    } catch (error) {
      return jsonResponse({ detail: error instanceof Error ? error.message : "storage operation rejected" }, 400);
    }
  }

  async alarm() {
    this.ctx.storage.transactionSync(() => {
      this.#run("UPDATE pending_messages SET state = 'expired', body = '', body_digest = '' WHERE state = 'staged' AND expires_at <= ?", Date.now());
      this.#run("DELETE FROM capabilities WHERE expires_at <= ?", Date.now());
      this.#run("DELETE FROM pending_messages WHERE session_id IN (SELECT session_id FROM sessions WHERE expires_at <= ?)", Date.now());
      this.#run("DELETE FROM sessions WHERE expires_at <= ?", Date.now());
      this.#run("DELETE FROM admission_challenges WHERE created_at <= ?", Date.now() - ADMISSION_THROTTLE_WINDOW_MS);
      this.#run("DELETE FROM admission_sessions WHERE session_id NOT IN (SELECT session_id FROM sessions)");
      this.#run("DELETE FROM admissions WHERE revoked_at IS NOT NULL AND session_id IS NULL");
      this.#run("DELETE FROM admissions WHERE expires_at <= ? OR (session_id IS NOT NULL AND session_id NOT IN (SELECT session_id FROM sessions))", Date.now());
      this.#run("DELETE FROM messages WHERE created_at <= ?", Date.now() - this.messageRetentionMs);
    });
    const sessions = this.#first("SELECT COUNT(*) AS count FROM sessions");
    if (sessions?.count > 0) {
      await this.ctx.storage.setAlarm(Date.now() + 60_000);
      return;
    }
    const deadlines = [
      this.#first("SELECT MIN(expires_at) AS at FROM admissions WHERE session_id IS NULL AND revoked_at IS NULL")?.at,
      this.#first("SELECT MIN(created_at + ?) AS at FROM admission_challenges", ADMISSION_THROTTLE_WINDOW_MS)?.at,
      this.#first("SELECT MIN(created_at + ?) AS at FROM messages", this.messageRetentionMs)?.at,
    ].filter((value) => Number.isSafeInteger(value));
    if (!deadlines.length) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    await this.ctx.storage.setAlarm(Math.max(Date.now() + 1_000, Math.min(...deadlines)));
  }
}

export default {
  async fetch(request, env, ctx) {
    if (!env.RELAY_STORE) return jsonResponse({ type: "about:blank", title: "Relay unavailable", status: 503 }, 503);
    const relayEnv = { ...env, RELAY_DB: new RelayDatabase(env.RELAY_STORE, env.RELAY_STORE_OBJECT_NAME || DEFAULT_RELAY_OBJECT_NAME) };
    return protocolRuntime.fetch(request, relayEnv, ctx);
  },
};
