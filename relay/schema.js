export const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS admissions (
    admission_id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    revoked_at INTEGER,
    consumed_at INTEGER,
    session_id TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS admission_sessions (
    session_id TEXT PRIMARY KEY,
    admission_id TEXT NOT NULL UNIQUE REFERENCES admissions(admission_id)
  )`,
  `CREATE TABLE IF NOT EXISTS admission_challenges (
    challenge_hash TEXT PRIMARY KEY,
    admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    consumed_at INTEGER,
    session_id TEXT
  )`,
  "CREATE INDEX IF NOT EXISTS admission_expiry_idx ON admissions(expires_at)",
  "CREATE INDEX IF NOT EXISTS admission_challenges_window_idx ON admission_challenges(admission_id, created_at)",
  `CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    participant_ref TEXT NOT NULL UNIQUE,
    current_cap_hash TEXT UNIQUE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    message_count INTEGER NOT NULL DEFAULT 0,
    thread_count INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS capabilities (
    cap_hash TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('stage', 'publish')),
    session_id TEXT NOT NULL REFERENCES sessions(session_id),
    source_cap_hash TEXT NOT NULL,
    pending_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    consumed_at INTEGER,
    consumed_by TEXT,
    result_id TEXT,
    next_cap_hash TEXT
  )`,
  "CREATE INDEX IF NOT EXISTS capabilities_expiry_idx ON capabilities(expires_at)",
  "CREATE INDEX IF NOT EXISTS capabilities_pending_idx ON capabilities(pending_id)",
  `CREATE TABLE IF NOT EXISTS quick_get_tickets (
    ticket_hash TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL,
    consumed_at INTEGER NOT NULL,
    claim_id TEXT NOT NULL UNIQUE
  )`,
  "CREATE INDEX IF NOT EXISTS quick_get_tickets_expiry_idx ON quick_get_tickets(expires_at)",
  `CREATE TABLE IF NOT EXISTS quick_get_one_shots (
    request_hash TEXT PRIMARY KEY,
    request_digest TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    claim_id TEXT NOT NULL UNIQUE,
    message_id TEXT
  )`,
  "CREATE INDEX IF NOT EXISTS quick_get_one_shots_expiry_idx ON quick_get_one_shots(expires_at)",
  `CREATE TABLE IF NOT EXISTS pending_messages (
    pending_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(session_id),
    conversation_id TEXT NOT NULL,
    reply_to TEXT,
    signal_type TEXT,
    contributor_designation TEXT,
    body TEXT NOT NULL,
    body_digest TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('staged', 'published', 'expired')),
    message_id TEXT UNIQUE
  )`,
  "CREATE INDEX IF NOT EXISTS pending_expiry_idx ON pending_messages(expires_at)",
  `CREATE TABLE IF NOT EXISTS messages (
    message_id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    author_ref TEXT NOT NULL,
    contributor_designation TEXT,
    body TEXT NOT NULL,
    body_digest TEXT NOT NULL,
    reply_to TEXT,
    supersedes TEXT,
    signal_type TEXT,
    policy_version TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    transport TEXT NOT NULL DEFAULT 'constrained-get'
  )`,
  "CREATE INDEX IF NOT EXISTS messages_recent_idx ON messages(created_at DESC, message_id DESC)",
  "CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages(conversation_id, created_at, message_id)",
  `CREATE TABLE IF NOT EXISTS message_moderation (
    message_id TEXT PRIMARY KEY REFERENCES messages(message_id),
    state TEXT NOT NULL CHECK (state IN ('visible', 'hidden')),
    updated_at INTEGER NOT NULL,
    updated_by TEXT NOT NULL,
    reason TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS relay_admin_settings (
    setting_key TEXT PRIMARY KEY CHECK (setting_key = 'writes_open'),
    setting_value TEXT NOT NULL CHECK (setting_value IN ('true', 'false')),
    updated_at INTEGER NOT NULL,
    updated_by TEXT NOT NULL,
    reason TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS admin_audit (
    audit_id TEXT PRIMARY KEY,
    actor_email TEXT NOT NULL,
    action TEXT NOT NULL,
    target_id TEXT NOT NULL,
    previous_value TEXT,
    new_value TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS admin_audit_recent_idx ON admin_audit(created_at DESC, audit_id DESC)",
];
