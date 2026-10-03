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
    transport TEXT NOT NULL DEFAULT 'constrained-get',
    composer_version TEXT,
    composer_condition TEXT,
    composer_task_class TEXT
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
  `CREATE TABLE IF NOT EXISTS relay_reports (
    report_id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('spam', 'harassment', 'private-information', 'threat', 'malware-or-exploitation', 'other')),
    details TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('open', 'reviewing', 'dismissed', 'action-taken')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    updated_by TEXT,
    resolution TEXT
  )`,
  "CREATE INDEX IF NOT EXISTS relay_reports_queue_idx ON relay_reports(status, created_at DESC)",
  "CREATE INDEX IF NOT EXISTS relay_reports_message_idx ON relay_reports(message_id, created_at DESC)",
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
  `CREATE TABLE IF NOT EXISTS token_composer_sessions (
    session_id TEXT PRIMARY KEY,
    root_state_id TEXT NOT NULL UNIQUE,
    task_class TEXT NOT NULL CHECK (task_class IN ('transcription', 'generation')),
    reply_to TEXT,
    contributor_designation TEXT,
    author_ref TEXT NOT NULL,
    condition_id TEXT NOT NULL,
    composer_version TEXT NOT NULL DEFAULT 'link-token-composer-0.1.0',
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    published_at INTEGER,
    message_id TEXT,
    traversal_count INTEGER, event_count INTEGER DEFAULT 0
  )`,
  "CREATE INDEX IF NOT EXISTS token_composer_expiry_idx ON token_composer_sessions(expires_at)",
  "CREATE INDEX IF NOT EXISTS token_composer_created_idx ON token_composer_sessions(created_at)",
  `CREATE TABLE IF NOT EXISTS token_composer_states (
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
  )`,
  "CREATE INDEX IF NOT EXISTS token_composer_states_session_idx ON token_composer_states(session_id, created_at)",
  `CREATE TABLE IF NOT EXISTS token_composer_events (
    event_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES token_composer_sessions(session_id),
    state_id TEXT,
    event_type TEXT NOT NULL CHECK (event_type IN ('session_started', 'candidate_displayed', 'branch_requested', 'branch_continued', 'review_requested', 'arm_issued', 'published', 'branch_used_in_final_path', 'branch_abandoned_in_final_path')),
    unit_id TEXT,
    unit_bytes_b64 TEXT,
    details_json TEXT,
    created_at INTEGER NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS token_composer_events_session_idx ON token_composer_events(session_id, created_at)",
  "CREATE INDEX IF NOT EXISTS token_composer_events_created_idx ON token_composer_events(created_at)",
  `CREATE TRIGGER IF NOT EXISTS token_event_count_insert AFTER INSERT ON token_composer_events
   BEGIN UPDATE token_composer_sessions SET event_count = event_count + 1 WHERE session_id = NEW.session_id AND event_count IS NOT NULL; END`,
  `CREATE TABLE IF NOT EXISTS token_composer_outcome_aggregates (
    cohort_month TEXT NOT NULL,
    task_class TEXT NOT NULL CHECK (task_class IN ('transcription', 'generation')),
    condition_id TEXT NOT NULL,
    composer_version TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('published', 'expired-before-publication')),
    furthest_stage TEXT NOT NULL CHECK (furthest_stage IN ('started', 'composing', 'reviewed', 'armed', 'published')),
    run_count INTEGER NOT NULL CHECK (run_count > 0),
    aggregated_at INTEGER NOT NULL,
    PRIMARY KEY (cohort_month, task_class, condition_id, composer_version, outcome, furthest_stage)
  )`,
  `CREATE TABLE IF NOT EXISTS token_composer_arms (
    arm_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES token_composer_sessions(session_id),
    state_id TEXT NOT NULL,
    publish_cap_hash TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    consumed_at INTEGER,
    message_id TEXT
  )`,
  "CREATE INDEX IF NOT EXISTS token_composer_arms_expiry_idx ON token_composer_arms(expires_at)",
  `CREATE TABLE IF NOT EXISTS token_composer_arm_expiry_observations (
    arm_id TEXT PRIMARY KEY,
    cohort_month TEXT NOT NULL,
    task_class TEXT NOT NULL CHECK (task_class IN ('transcription', 'generation')),
    condition_id TEXT NOT NULL,
    composer_version TEXT NOT NULL,
    observed_at INTEGER NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS token_composer_arm_expiry_observed_idx ON token_composer_arm_expiry_observations(observed_at)",
  `CREATE TABLE IF NOT EXISTS token_composer_arm_expiry_aggregates (
    cohort_month TEXT NOT NULL,
    task_class TEXT NOT NULL CHECK (task_class IN ('transcription', 'generation')),
    condition_id TEXT NOT NULL,
    composer_version TEXT NOT NULL,
    observed_attempts INTEGER NOT NULL CHECK (observed_attempts > 0),
    aggregated_at INTEGER NOT NULL,
    PRIMARY KEY (cohort_month, task_class, condition_id, composer_version)
  )`,
  `CREATE TABLE IF NOT EXISTS relay_storage_daily (
    day INTEGER PRIMARY KEY, rows_read INTEGER NOT NULL DEFAULT 0,
    rows_written INTEGER NOT NULL DEFAULT 0, telemetry_paused_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS keyboard_usage_daily (
    day INTEGER PRIMARY KEY, request_count INTEGER NOT NULL DEFAULT 0,
    choice_count INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS keyboard_usage_daily_expiry_idx ON keyboard_usage_daily(expires_at)",
  `CREATE TABLE IF NOT EXISTS keyboard_usage_runs (
    run_id TEXT PRIMARY KEY, method_id TEXT NOT NULL, adapter TEXT NOT NULL,
    backend_version TEXT NOT NULL, release_id TEXT NOT NULL,
    created_at INTEGER NOT NULL, last_request_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
    session_expires_at INTEGER, furthest_stage TEXT NOT NULL,
    published_at INTEGER, message_id TEXT, truncated INTEGER NOT NULL DEFAULT 0,
    choices_truncated INTEGER NOT NULL DEFAULT 0, event_count INTEGER
  )`,
  "CREATE INDEX IF NOT EXISTS keyboard_usage_runs_expiry_idx ON keyboard_usage_runs(expires_at)",
  "CREATE INDEX IF NOT EXISTS keyboard_usage_runs_message_idx ON keyboard_usage_runs(message_id)",
  `CREATE TABLE IF NOT EXISTS keyboard_usage_events (
    event_id TEXT PRIMARY KEY, run_id TEXT, method_id TEXT NOT NULL,
    created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, action TEXT NOT NULL,
    section TEXT, choice_rank INTEGER, status INTEGER NOT NULL,
    response_bytes INTEGER NOT NULL, links_presented INTEGER NOT NULL, server_ms REAL NOT NULL,
    draft_bytes INTEGER, delta_bytes INTEGER, repeat_request INTEGER NOT NULL,
    fingerprint TEXT NOT NULL, state_hash TEXT
  )`,
  "CREATE INDEX IF NOT EXISTS keyboard_usage_events_expiry_idx ON keyboard_usage_events(expires_at)",
  "CREATE INDEX IF NOT EXISTS keyboard_usage_events_run_idx ON keyboard_usage_events(run_id, fingerprint)",
  "CREATE INDEX IF NOT EXISTS keyboard_usage_events_time_idx ON keyboard_usage_events(created_at, event_id)",
  `CREATE TABLE IF NOT EXISTS keyboard_usage_choices (
    fingerprint TEXT NOT NULL, run_id TEXT NOT NULL, section TEXT NOT NULL,
    choice_rank INTEGER NOT NULL, action TEXT NOT NULL, expires_at INTEGER NOT NULL,
    PRIMARY KEY (fingerprint,run_id)
  )`,
  "CREATE INDEX IF NOT EXISTS keyboard_usage_choices_expiry_idx ON keyboard_usage_choices(expires_at)",
  "CREATE INDEX IF NOT EXISTS keyboard_usage_choices_run_idx ON keyboard_usage_choices(run_id, fingerprint)",
  `CREATE TABLE IF NOT EXISTS html_keyboard_sessions (
    session_id TEXT PRIMARY KEY,
    root_state_id TEXT NOT NULL UNIQUE,
    reply_to TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    published_at INTEGER
  )`,
  "CREATE INDEX IF NOT EXISTS html_keyboard_sessions_expiry_idx ON html_keyboard_sessions(expires_at)",
  `CREATE TABLE IF NOT EXISTS html_keyboard_states (
    state_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES html_keyboard_sessions(session_id),
    parent_state_id TEXT,
    operation TEXT NOT NULL CHECK (operation IN ('root', 'key', 'pick', 'clear')),
    value TEXT NOT NULL,
    removed_text TEXT NOT NULL,
    added_text TEXT NOT NULL,
    snapshot TEXT,
    depth INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS html_keyboard_states_session_idx ON html_keyboard_states(session_id, depth)",
  `CREATE TABLE IF NOT EXISTS html_keyboard_publish_links (
    publish_cap_hash TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES html_keyboard_sessions(session_id),
    created_at INTEGER NOT NULL,
    state_id TEXT,
    recovery_key TEXT
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS html_keyboard_publish_links_session_idx ON html_keyboard_publish_links(session_id)",
  `CREATE TABLE IF NOT EXISTS semantic_sessions (
    session_id TEXT PRIMARY KEY REFERENCES sessions(session_id),
    root_state_id TEXT NOT NULL UNIQUE,
    reply_to TEXT,
    composer_version TEXT NOT NULL,
    renderer_version TEXT NOT NULL,
    model_version TEXT NOT NULL,
    lexicon_version TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    published_at INTEGER,
    message_id TEXT,
    status TEXT NOT NULL CHECK (status IN ('editing', 'review-staging', 'review-ready', 'published', 'expired')),
    review_attempt_id TEXT,
    review_generation INTEGER NOT NULL DEFAULT 0,
    review_state_id TEXT,
    review_lease_until INTEGER,
    state_count INTEGER NOT NULL DEFAULT 0,
    logical_bytes INTEGER NOT NULL DEFAULT 0,
    rate_window_start INTEGER NOT NULL DEFAULT 0,
    request_count INTEGER NOT NULL DEFAULT 0,
    addition_count INTEGER NOT NULL DEFAULT 0,
    prediction_count INTEGER NOT NULL DEFAULT 0
  )`,
  "CREATE INDEX IF NOT EXISTS semantic_sessions_expiry_idx ON semantic_sessions(expires_at)",
  `CREATE TABLE IF NOT EXISTS semantic_states (
    state_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES semantic_sessions(session_id),
    parent_state_id TEXT,
    operation_json TEXT NOT NULL,
    snapshot_json TEXT,
    rendered_text TEXT NOT NULL,
    body_digest TEXT NOT NULL,
    renderer_version TEXT NOT NULL,
    body_bytes INTEGER NOT NULL,
    logical_bytes INTEGER NOT NULL,
    action_digest TEXT NOT NULL,
    depth INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(parent_state_id, action_digest)
  )`,
  "CREATE INDEX IF NOT EXISTS semantic_states_session_idx ON semantic_states(session_id, depth)",
  `CREATE TABLE IF NOT EXISTS semantic_publish_links (
    publish_cap_hash TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES semantic_sessions(session_id),
    state_id TEXT NOT NULL REFERENCES semantic_states(state_id),
    review_attempt_id TEXT NOT NULL,
    review_generation INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(session_id)
  )`,
  `CREATE TABLE IF NOT EXISTS semantic_storage_usage (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    logical_bytes INTEGER NOT NULL CHECK (logical_bytes >= 0)
  )`,
  "INSERT OR IGNORE INTO semantic_storage_usage (singleton, logical_bytes) VALUES (1, 0)",
  `CREATE TRIGGER IF NOT EXISTS semantic_state_limits_before_insert BEFORE INSERT ON semantic_states
  BEGIN
    SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM semantic_sessions WHERE session_id = NEW.session_id AND status = 'editing' AND expires_at > NEW.created_at AND state_count < 512 AND logical_bytes + NEW.logical_bytes <= 80 * 1024 * 1024) THEN RAISE(ABORT, 'semantic state quota or session status reached') END;
    SELECT CASE WHEN (SELECT logical_bytes FROM semantic_storage_usage WHERE singleton = 1) + NEW.logical_bytes > 80 * 1024 * 1024 THEN RAISE(ABORT, 'semantic aggregate storage quota reached') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS semantic_state_limits_after_insert AFTER INSERT ON semantic_states
  BEGIN
    UPDATE semantic_sessions SET state_count = state_count + 1, logical_bytes = logical_bytes + NEW.logical_bytes WHERE session_id = NEW.session_id;
    UPDATE semantic_storage_usage SET logical_bytes = logical_bytes + NEW.logical_bytes WHERE singleton = 1;
  END`,
  `CREATE TRIGGER IF NOT EXISTS semantic_state_limits_after_delete AFTER DELETE ON semantic_states
  BEGIN
    UPDATE semantic_sessions SET state_count = MAX(0, state_count - 1), logical_bytes = MAX(0, logical_bytes - OLD.logical_bytes) WHERE session_id = OLD.session_id;
    UPDATE semantic_storage_usage SET logical_bytes = MAX(0, logical_bytes - OLD.logical_bytes) WHERE singleton = 1;
  END`,
];
