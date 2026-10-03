import protocolRuntime from "./runtime.js";
import { SCHEMA_STATEMENTS } from "./schema.js";

const DEFAULT_RELAY_OBJECT_NAME = "iarc-relay-local-prototype-global-v1";
const MAX_STORAGE_RPC_BYTES = 32_768;
const ADMISSION_THROTTLE_WINDOW_MS = 10 * 60 * 1_000;
const ADMIN_AUDIT_RETENTION_MS = 365 * 24 * 60 * 60 * 1_000;
const KEYBOARD_TELEMETRY_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
const REPORT_RETENTION_MS = 90 * 24 * 60 * 60 * 1_000;
// Execute expensive keyboard rendering beside its existing SQLite state.
export function keyboardExecutionPath(pathname) {
  return pathname.startsWith('/predictive-keyboard/html/') || pathname.startsWith('/compose/token/') || pathname.startsWith('/compose/span/') || pathname.startsWith('/compose/frame/') || pathname === '/publish' || pathname === '/admin' || pathname.startsWith('/admin/');
}
const RELAY_TABLES = new Set(["admissions", "admission_sessions", "admission_challenges", "sessions", "capabilities", "quick_get_tickets", "quick_get_one_shots", "pending_messages", "messages", "message_moderation", "relay_reports", "relay_admin_settings", "admin_audit", "token_composer_sessions", "token_composer_states", "token_composer_events", "token_composer_outcome_aggregates", "token_composer_arms", "token_composer_arm_expiry_observations", "token_composer_arm_expiry_aggregates", "html_keyboard_sessions", "html_keyboard_states", "html_keyboard_publish_links", "semantic_sessions", "semantic_states", "semantic_publish_links", "semantic_storage_usage", "keyboard_usage_runs", "keyboard_usage_events", "keyboard_usage_choices", "keyboard_usage_daily", "relay_storage_daily"]);

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
    this.env = env;
    this.sql = ctx.storage.sql;
    this.initializingStorage=true;this.storagePending=new Map();this.storageBudgets=new Map();this.storageDepth=0;
    this.storageStats={started_at:Date.now(),reads:0,writes:0,calls:0,by_query:new Map()};
    const retentionSeconds = Number(env?.RELAY_MESSAGE_RETENTION_SECONDS);
    this.messageRetentionMs = Number.isInteger(retentionSeconds) && retentionSeconds >= 1 && retentionSeconds <= 90 * 24 * 60 * 60
      ? retentionSeconds * 1_000
      : 90 * 24 * 60 * 60 * 1_000;
    // Existing schema must remain readable when the provider's write allowance
    // is exhausted. Even no-op CREATE statements can be classified as writes.
    const schemaRows=query=>{try{return this.#rows(query);}catch(error){throw new Error('Relay schema read failed: '+error.message);}};
    const installed=new Set(schemaRows("SELECT name FROM sqlite_master WHERE type IN ('table','index','trigger')").map(row=>row.name));
    for (const statement of SCHEMA_STATEMENTS) {
      const name=statement.match(/^\s*CREATE (?:UNIQUE )?(?:TABLE|INDEX|TRIGGER) IF NOT EXISTS (\w+)/i)?.[1];
      if (name && installed.has(name)) continue;
      if (/^INSERT OR IGNORE INTO semantic_storage_usage\b/i.test(statement) && schemaRows('SELECT singleton FROM semantic_storage_usage WHERE singleton=1').length) continue;
      this.#rows(statement);
    }
    for (const table of ["pending_messages", "messages", "token_composer_sessions", "token_composer_states", "html_keyboard_publish_links", "keyboard_usage_runs"]) {
      const columns = schemaRows(`SELECT name FROM pragma_table_info('${table}')`);
      if (["pending_messages", "messages"].includes(table) && !columns.some((column) => column.name === "contributor_designation")) this.#rows(`ALTER TABLE ${table} ADD COLUMN contributor_designation TEXT`);
      if (table === "keyboard_usage_runs" && !columns.some(column=>column.name=== "event_count")) this.#rows("ALTER TABLE keyboard_usage_runs ADD COLUMN event_count INTEGER");
      if (table === "token_composer_sessions") {
        if (!columns.some((column) => column.name === "composer_version")) this.#rows("ALTER TABLE token_composer_sessions ADD COLUMN composer_version TEXT NOT NULL DEFAULT 'link-token-composer-0.1.0'");
        if (!columns.some((column) => column.name === "reply_to")) this.#rows("ALTER TABLE token_composer_sessions ADD COLUMN reply_to TEXT");
        if (!columns.some((column) => column.name === "contributor_designation")) this.#rows("ALTER TABLE token_composer_sessions ADD COLUMN contributor_designation TEXT");
        if (!columns.some(column=>column.name=== "event_count")) this.#rows("ALTER TABLE token_composer_sessions ADD COLUMN event_count INTEGER");
        if (!columns.some((column) => column.name === "traversal_count")) this.#rows("ALTER TABLE token_composer_sessions ADD COLUMN traversal_count INTEGER");
      }
      if (table === "token_composer_states" && !columns.some((column) => column.name === "purpose")) this.#rows("ALTER TABLE token_composer_states ADD COLUMN purpose TEXT NOT NULL DEFAULT 'message'");
      if (table === "html_keyboard_publish_links") {
        for (const column of ["state_id", "recovery_key"]) if (!columns.some((item) => item.name === column)) this.#rows(`ALTER TABLE html_keyboard_publish_links ADD COLUMN ${column} TEXT`);
      }
      if (table === "messages") {
        for (const column of ["composer_version", "composer_condition", "composer_task_class"]) {
          if (!columns.some((item) => item.name === column)) this.#rows(`ALTER TABLE messages ADD COLUMN ${column} TEXT`);
        }
      }
    }
    const composerStatesSchema = schemaRows("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'token_composer_states'")[0]?.sql || "";
    if (!composerStatesSchema.includes("'o200k-token'")) {
      this.ctx.storage.transactionSync(() => {
        this.#rows(`CREATE TABLE token_composer_states_new (
          state_id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES token_composer_sessions(session_id),
          parent_state_id TEXT,
          unit_id TEXT,
          unit_kind TEXT NOT NULL CHECK (unit_kind IN ('root', 'lexical', 'byte', 'o200k-token')),
          purpose TEXT NOT NULL DEFAULT 'message' CHECK (purpose IN ('message', 'designation')),
          unit_bytes_b64 TEXT NOT NULL,
          body_bytes_b64 TEXT NOT NULL,
          body_length INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          UNIQUE(parent_state_id, unit_id)
        )`);
        this.#rows(`INSERT INTO token_composer_states_new
          (state_id, session_id, parent_state_id, unit_id, unit_kind, purpose, unit_bytes_b64, body_bytes_b64, body_length, created_at)
          SELECT state_id, session_id, parent_state_id, unit_id, unit_kind, purpose, unit_bytes_b64, body_bytes_b64, body_length, created_at
          FROM token_composer_states`);
        this.#rows("DROP TABLE token_composer_states");
        this.#rows("ALTER TABLE token_composer_states_new RENAME TO token_composer_states");
        this.#rows("CREATE INDEX IF NOT EXISTS token_composer_states_session_idx ON token_composer_states(session_id, created_at)");
      });
    }
    this.initializingStorage=false;
  }

  #rows(query,...values) {
    const day=Math.floor(Date.now()/86400000)*86400000;
    if(!this.initializingStorage) {
      const budget=this.#storageBudget(day);
      if(!/^\s*SELECT\b/i.test(query)&&(budget.writes>=90000||budget.reads>=4500000))throw Error('Relay daily storage safety budget reached; no new storage mutation was performed.');
    }
    return this.#meter(query,values,day);
  }

  #meter(query,values,day) {
    const cursor=this.sql.exec(query,...values),rows=cursor.toArray();
    const reads=Number(cursor.rowsRead)||0,writes=Number(cursor.rowsWritten)||0;
    const pending=this.storagePending.get(day)||{reads:0,writes:0};pending.reads+=reads;pending.writes+=writes;this.storagePending.set(day,pending);
    const budget=this.storageBudgets.get(day);if(budget){budget.reads+=reads;budget.writes+=writes;}
    const stats=this.storageStats;stats.reads+=reads;stats.writes+=writes;stats.calls++;
    // SQL templates only: never parameter values, text, URLs or capabilities.
    const key=query.replace(/\s+/g,' ').trim();
    if(stats.by_query.has(key)||stats.by_query.size<200) {
      const q=stats.by_query.get(key)||{query:key,calls:0,reads:0,writes:0};
      q.calls++;q.reads+=reads;q.writes+=writes;stats.by_query.set(key,q);
    }
    return rows;
  }

  #storageBudget(day=Math.floor(Date.now()/86400000)*86400000) {
    if(!this.storageBudgets.has(day)) {
      const row=this.sql.exec('SELECT rows_read,rows_written FROM relay_storage_daily WHERE day=?',day).toArray()[0];
      const pending=this.storagePending.get(day)||{reads:0,writes:0};
      this.storageBudgets.set(day,{reads:(row?.rows_read||0)+pending.reads,writes:(row?.rows_written||0)+pending.writes});
    }
    return this.storageBudgets.get(day);
  }

  telemetryAllowed() {
    const b=this.#storageBudget();return b.writes<50000&&b.reads<3000000;
  }

  #flushStorageBudget() {
    if(this.storageDepth)return;
    if(this.#storageBudget().writes>=90000){this.storageAccountingPaused=true;return;}
    this.storageAccountingPaused=false;
    for(const [day,pending] of this.storagePending) {
      if(!pending.reads&&!pending.writes)continue;
      const {reads,writes}=pending;pending.reads=0;pending.writes=0;
      try {
        // Account for this accounting write itself; a safety reserve covers its
        // one-write lag. Flush once per rendered request, never per keyboard SQL.
        this.#meter('INSERT INTO relay_storage_daily (day,rows_read,rows_written,telemetry_paused_at) VALUES (?,?,?,?) ON CONFLICT(day) DO UPDATE SET rows_read=rows_read+excluded.rows_read,rows_written=rows_written+excluded.rows_written,telemetry_paused_at=COALESCE(telemetry_paused_at,excluded.telemetry_paused_at)',[day,reads,writes,(this.storageBudgets.get(day)?.writes>=50000||this.storageBudgets.get(day)?.reads>=3000000)?Date.now():null],Math.floor(Date.now()/86400000)*86400000);
      }catch {pending.reads+=reads;pending.writes+=writes;this.storageAccountingUnavailable=true;}
    }
  }

  storageStatistics() {
    const s=this.storageStats;
    return {scope:'SQL API cursors since this Durable Object instance loaded; includes schema SQL and cleanup SQL; excludes alarm API writes, budget-loading reads and other namespaces. Not account daily billing totals.',started_at:s.started_at,rows_read:s.reads,rows_written:s.writes,sql_calls:s.calls,daily_budget:{day:Math.floor(Date.now()/86400000)*86400000,...this.#storageBudget(),telemetry_pauses_at:{writes:50000,reads:3000000},mutations_pause_at:{writes:90000,reads:4500000},accounting_unavailable:Boolean(this.storageAccountingUnavailable),accounting_paused:Boolean(this.storageAccountingPaused)},queries:[...s.by_query.values()].sort((a,b)=>b.reads+b.writes-a.reads-a.writes)};
  }

  #first(query, ...values) {
    return this.#rows(query, ...values)[0] || null;
  }

  #run(query, ...values) {
    this.#rows(query, ...values);
  }

  async #scheduleMaintenance() {
    const now=Date.now(),at=now+60_000;
    if (this.maintenanceAlarmAt>now) return;
    const scheduled=await this.ctx.storage.getAlarm?.();
    if (scheduled>now && scheduled<=at) { this.maintenanceAlarmAt=scheduled; return; }
    await this.ctx.storage.setAlarm(at);
    this.maintenanceAlarmAt=at;
  }

  async fetch(request) {
    if (keyboardExecutionPath(new URL(request.url).pathname)) {
      const invoke = async payload => {
        const response = await this.fetch(new Request('https://relay-storage.internal/sql', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}));
        const result = await response.json();
        if (!response.ok) throw new Error(result?.detail || 'relay storage operation failed');
        return result;
      };
      const database = {
        storageStatistics:()=>this.storageStatistics(),
        telemetryAllowed:()=>this.telemetryAllowed(),
        execute: statement => invoke({operation:'execute',statement}),
        batch: statements => invoke({operation:'batch',statements:statements.map(statement=>({...statement,mode:'run'}))}),
      };
      let response;this.storageDepth++;
      try {response=await protocolRuntime.fetch(request, {...this.env, RELAY_DB:database}, this.ctx);}
      finally {this.storageDepth--;this.#flushStorageBudget();}
      const headers = new Headers(response.headers);
      headers.set('X-Relay-Execution','durable-object');
      return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
    }
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
        if (statement.mode === "all") return jsonResponse({ results: this.#rows(statement.query, ...statement.values) });
        this.#run(statement.query, ...statement.values);
        await this.#scheduleMaintenance();
        return jsonResponse({ success: true });
      }
      if (payload.operation === "batch" && Array.isArray(payload.statements) && payload.statements.length >= 1 && payload.statements.length <= 16) {
        const statements = payload.statements.map((statement) => validateStatement(statement));
        this.ctx.storage.transactionSync(() => {
          for (const statement of statements) this.#run(statement.query, ...statement.values);
        });
        await this.#scheduleMaintenance();
        return jsonResponse({ success: true });
      }
      return jsonResponse({ detail: "invalid storage operation" }, 400);
    } catch (error) {
      return jsonResponse({ detail: error instanceof Error ? error.message : "storage operation rejected" }, 400);
    } finally {this.#flushStorageBudget();}
  }

  async alarm() {
    const budget=this.#storageBudget();
    if(budget.writes>=60000||budget.reads>=3500000) {
      // Expired data is already invisible by its expiry predicate. Reserve
      // capacity for public reads and intentional publication; resume physical
      // cleanup after the next UTC day rather than retrying quota failures.
      await this.ctx.storage.setAlarm(Math.floor(Date.now()/86400000)*86400000+86401000);return;
    }
    this.ctx.storage.transactionSync(() => {
      const now = Date.now();
      this.#run("DELETE FROM token_composer_events WHERE rowid IN (SELECT rowid FROM token_composer_events WHERE created_at <= ? LIMIT 500)", now - KEYBOARD_TELEMETRY_RETENTION_MS);
      this.#run("UPDATE token_composer_sessions SET traversal_count = NULL, event_count = NULL WHERE created_at <= ? AND (traversal_count IS NOT NULL OR event_count IS NOT NULL)", now - KEYBOARD_TELEMETRY_RETENTION_MS);
      this.#run("DELETE FROM keyboard_usage_daily WHERE rowid IN (SELECT rowid FROM keyboard_usage_daily WHERE expires_at <= ? LIMIT 500)", now);
      this.#run("DELETE FROM keyboard_usage_events WHERE rowid IN (SELECT rowid FROM keyboard_usage_events WHERE expires_at <= ? LIMIT 500)", now);
      this.#run("DELETE FROM keyboard_usage_choices WHERE rowid IN (SELECT rowid FROM keyboard_usage_choices WHERE expires_at <= ? LIMIT 500)", now);
      this.#run("DELETE FROM keyboard_usage_runs WHERE rowid IN (SELECT rowid FROM keyboard_usage_runs WHERE expires_at <= ? LIMIT 500)", now);
      this.#run("UPDATE pending_messages SET state = 'expired', body = '', body_digest = '' WHERE state = 'staged' AND expires_at <= ?", Date.now());
      this.#run("DELETE FROM capabilities WHERE expires_at <= ?", Date.now());
      this.#run("UPDATE semantic_sessions SET status = 'editing', review_attempt_id = NULL, review_state_id = NULL, review_lease_until = NULL WHERE status = 'review-staging' AND review_lease_until <= ? AND expires_at > ?", now, now);
      this.#run("UPDATE semantic_sessions SET status = 'editing', review_attempt_id = NULL, review_state_id = NULL, review_lease_until = NULL WHERE status = 'review-ready' AND expires_at > ? AND NOT EXISTS (SELECT 1 FROM semantic_publish_links l JOIN capabilities c ON c.cap_hash = l.publish_cap_hash JOIN pending_messages p ON p.pending_id = c.pending_id WHERE l.session_id = semantic_sessions.session_id AND c.expires_at > ? AND p.expires_at > ? AND p.state = 'staged')", now, now, now);
      this.#run("DELETE FROM semantic_publish_links WHERE session_id IN (SELECT session_id FROM semantic_sessions WHERE expires_at <= ?) OR NOT EXISTS (SELECT 1 FROM capabilities c JOIN pending_messages p ON p.pending_id = c.pending_id WHERE c.cap_hash = semantic_publish_links.publish_cap_hash AND c.expires_at > ? AND p.expires_at > ? AND p.state = 'staged')", now, now, now);
      this.#run("DELETE FROM semantic_states WHERE session_id IN (SELECT session_id FROM semantic_sessions WHERE expires_at <= ?)", now);
      this.#run("UPDATE semantic_sessions SET status = 'expired', review_attempt_id = NULL, review_state_id = NULL, review_lease_until = NULL WHERE expires_at <= ?", now);
      this.#run("DELETE FROM semantic_sessions WHERE expires_at <= ?", now);
      this.#run("DELETE FROM quick_get_tickets WHERE expires_at <= ?", Date.now());
      this.#run("DELETE FROM quick_get_one_shots WHERE expires_at <= ?", Date.now());
      this.#run("DELETE FROM pending_messages WHERE session_id IN (SELECT session_id FROM sessions WHERE expires_at <= ?)", Date.now());
      this.#run("DELETE FROM sessions WHERE expires_at <= ?", Date.now());
      this.#run("DELETE FROM admission_challenges WHERE created_at <= ?", Date.now() - ADMISSION_THROTTLE_WINDOW_MS);
      this.#run("DELETE FROM admission_sessions WHERE session_id NOT IN (SELECT session_id FROM sessions)");
      this.#run("DELETE FROM admissions WHERE revoked_at IS NOT NULL AND session_id IS NULL");
      this.#run("DELETE FROM admissions WHERE expires_at <= ? OR (session_id IS NOT NULL AND session_id NOT IN (SELECT session_id FROM sessions))", Date.now());
      this.#run("DELETE FROM message_moderation WHERE message_id IN (SELECT message_id FROM messages WHERE created_at <= ?)", Date.now() - this.messageRetentionMs);
      this.#run("DELETE FROM relay_reports WHERE created_at <= ?", Date.now() - Math.min(this.messageRetentionMs, REPORT_RETENTION_MS));
      this.#run("DELETE FROM messages WHERE created_at <= ?", Date.now() - this.messageRetentionMs);
      this.#run("DELETE FROM admin_audit WHERE created_at <= ?", Date.now() - ADMIN_AUDIT_RETENTION_MS);
      this.#run("UPDATE relay_admin_settings SET updated_by = 'expired', reason = 'Operator detail expired after 365 days' WHERE updated_at <= ?", Date.now() - ADMIN_AUDIT_RETENTION_MS);
      this.#run(`INSERT INTO token_composer_outcome_aggregates (cohort_month, task_class, condition_id, composer_version, outcome, furthest_stage, run_count, aggregated_at)
        SELECT strftime('%Y-%m', s.created_at / 1000, 'unixepoch') AS cohort_month, s.task_class, s.condition_id, s.composer_version,
          CASE WHEN s.published_at IS NULL THEN 'expired-before-publication' ELSE 'published' END AS outcome,
          CASE WHEN s.published_at IS NOT NULL THEN 'published'
            WHEN EXISTS (SELECT 1 FROM token_composer_events e WHERE e.session_id = s.session_id AND e.event_type = 'arm_issued') THEN 'armed'
            WHEN EXISTS (SELECT 1 FROM token_composer_events e WHERE e.session_id = s.session_id AND e.event_type = 'review_requested') THEN 'reviewed'
            WHEN EXISTS (SELECT 1 FROM token_composer_events e JOIN token_composer_states st ON st.state_id = e.state_id WHERE e.session_id = s.session_id AND e.event_type = 'branch_requested' AND st.purpose = 'message') THEN 'composing'
            ELSE 'started' END AS furthest_stage,
          COUNT(*), ?
        FROM token_composer_sessions s
        WHERE s.expires_at <= ? AND (s.published_at IS NULL OR s.published_at + ? <= ?) AND s.created_at > ?
        GROUP BY cohort_month, s.task_class, s.condition_id, s.composer_version, outcome, furthest_stage
        ON CONFLICT (cohort_month, task_class, condition_id, composer_version, outcome, furthest_stage)
        DO UPDATE SET run_count = token_composer_outcome_aggregates.run_count + excluded.run_count, aggregated_at = excluded.aggregated_at`, now, now, this.messageRetentionMs, now, now - KEYBOARD_TELEMETRY_RETENTION_MS);
      this.#run("DELETE FROM token_composer_outcome_aggregates WHERE strftime('%s', cohort_month || '-01') * 1000 + 2592000000 <= ?", now);
      this.#run(`INSERT INTO token_composer_arm_expiry_aggregates (cohort_month, task_class, condition_id, composer_version, observed_attempts, aggregated_at)
        SELECT cohort_month, task_class, condition_id, composer_version, COUNT(*), ?
        FROM token_composer_arm_expiry_observations WHERE observed_at <= ?
        GROUP BY cohort_month, task_class, condition_id, composer_version
        ON CONFLICT (cohort_month, task_class, condition_id, composer_version)
        DO UPDATE SET observed_attempts = token_composer_arm_expiry_aggregates.observed_attempts + excluded.observed_attempts, aggregated_at = excluded.aggregated_at`, now, now - 60_000);
      this.#run("DELETE FROM token_composer_arm_expiry_observations WHERE observed_at <= ?", now - 60_000);
      this.#run("DELETE FROM token_composer_arm_expiry_aggregates WHERE strftime('%s', cohort_month || '-01') * 1000 + 2592000000 <= ?", now);
      this.#run("DELETE FROM token_composer_arms WHERE session_id IN (SELECT session_id FROM token_composer_sessions WHERE expires_at <= ? AND (published_at IS NULL OR published_at + ? <= ?))", now, this.messageRetentionMs, now);
      this.#run("DELETE FROM token_composer_states WHERE session_id IN (SELECT session_id FROM token_composer_sessions WHERE published_at IS NOT NULL AND published_at <= ?)", now - KEYBOARD_TELEMETRY_RETENTION_MS);
      this.#run("DELETE FROM token_composer_states WHERE session_id IN (SELECT session_id FROM token_composer_sessions WHERE expires_at <= ? AND (published_at IS NULL OR published_at + ? <= ?))", now, this.messageRetentionMs, now);
      this.#run("DELETE FROM token_composer_events WHERE session_id IN (SELECT session_id FROM token_composer_sessions WHERE expires_at <= ? AND (published_at IS NULL OR published_at + ? <= ?))", now, this.messageRetentionMs, now);
      this.#run("DELETE FROM token_composer_sessions WHERE expires_at <= ? AND (published_at IS NULL OR published_at + ? <= ?)", now, this.messageRetentionMs, now);
      this.#run("DELETE FROM html_keyboard_states WHERE session_id IN (SELECT session_id FROM html_keyboard_sessions WHERE expires_at <= ?)", now);
      this.#run("DELETE FROM html_keyboard_publish_links WHERE session_id IN (SELECT session_id FROM html_keyboard_sessions WHERE expires_at <= ?)", now);
      this.#run("DELETE FROM html_keyboard_publish_links WHERE publish_cap_hash IN (SELECT c.cap_hash FROM capabilities c JOIN pending_messages p USING (pending_id) WHERE c.kind = 'publish' AND (c.expires_at <= ? OR p.expires_at <= ? OR p.state <> 'staged'))", now, now);
      this.#run("DELETE FROM html_keyboard_sessions WHERE expires_at <= ?", now);
    });
    this.#run("DELETE FROM relay_storage_daily WHERE day <= ?",Math.floor(Date.now()/86400000)*86400000-30*86400000);
    this.#flushStorageBudget();
    const sessions = this.#first("SELECT 1 AS count FROM sessions LIMIT 1");
    if (sessions?.count > 0) {
      await this.#scheduleMaintenance();
      return;
    }
    const deadlines = [
      this.#first("SELECT MIN(expires_at) AS at FROM keyboard_usage_daily")?.at,
      this.#first("SELECT MIN(expires_at) AS at FROM keyboard_usage_runs")?.at,
      this.#first("SELECT MIN(expires_at) AS at FROM keyboard_usage_events")?.at,
      this.#first("SELECT MIN(expires_at) AS at FROM keyboard_usage_choices")?.at,
      this.#first("SELECT MIN(expires_at) AS at FROM admissions WHERE session_id IS NULL AND revoked_at IS NULL")?.at,
      this.#first("SELECT MIN(created_at) + ? AS at FROM admission_challenges", ADMISSION_THROTTLE_WINDOW_MS)?.at,
      this.#first("SELECT MIN(created_at) + ? AS at FROM messages", this.messageRetentionMs)?.at,
      this.#first("SELECT MIN(created_at) + ? AS at FROM relay_reports", Math.min(this.messageRetentionMs, REPORT_RETENTION_MS))?.at,
      this.#first("SELECT MIN(created_at) + ? AS at FROM admin_audit", ADMIN_AUDIT_RETENTION_MS)?.at,
      this.#first("SELECT MIN(updated_at + ?) AS at FROM relay_admin_settings", ADMIN_AUDIT_RETENTION_MS)?.at,
      this.#first("SELECT MIN(CASE WHEN published_at IS NULL THEN expires_at ELSE published_at + ? END) AS at FROM token_composer_sessions", this.messageRetentionMs)?.at,
      this.#first("SELECT MIN(strftime('%s', cohort_month || '-01') * 1000 + 2592000000) AS at FROM token_composer_outcome_aggregates")?.at,
      this.#first("SELECT MIN(strftime('%s', cohort_month || '-01') * 1000 + 2592000000) AS at FROM token_composer_arm_expiry_aggregates")?.at,
      this.#first("SELECT MIN(observed_at + 60000) AS at FROM token_composer_arm_expiry_observations")?.at,
      this.#first("SELECT MIN(created_at) + 2592000000 AS at FROM token_composer_events")?.at,
      this.#first("SELECT MIN(published_at + 2592000000) AS at FROM token_composer_sessions WHERE published_at IS NOT NULL AND EXISTS (SELECT 1 FROM token_composer_states st WHERE st.session_id=token_composer_sessions.session_id)")?.at,
      this.#first("SELECT MIN(expires_at) AS at FROM html_keyboard_sessions")?.at,
      this.#first("SELECT MIN(expires_at) AS at FROM semantic_sessions")?.at,
      this.#first("SELECT MIN(review_lease_until) AS at FROM semantic_sessions WHERE status = 'review-staging'")?.at,
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
    if (keyboardExecutionPath(new URL(request.url).pathname)) {
      const id = env.RELAY_STORE.idFromName(env.RELAY_STORE_OBJECT_NAME || DEFAULT_RELAY_OBJECT_NAME);
      const stub = env.RELAY_STORE.get(id);
      return stub.fetch(request);
    }
    const relayEnv = { ...env, ASSETS: env.ASSETS, RELAY_DB: new RelayDatabase(env.RELAY_STORE, env.RELAY_STORE_OBJECT_NAME || DEFAULT_RELAY_OBJECT_NAME) };
    return protocolRuntime.fetch(request, relayEnv, ctx);
  },
};
