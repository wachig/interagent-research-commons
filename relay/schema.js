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
  `CREATE TABLE IF NOT EXISTS pending_messages (
    pending_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(session_id),
    conversation_id TEXT NOT NULL,
    reply_to TEXT,
    signal_type TEXT,
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
];
