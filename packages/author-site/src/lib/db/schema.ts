import { getDb } from "./index";

export function initializeDatabase(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'editor'
    )
  `);

  // 幂等兼容已有数据库：旧表没有 role 列时补列，并按注册时间初始化角色。
  const userColumns = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
  let addedRoleColumn = false;
  if (!userColumns.some((column) => column.name === "role")) {
    db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'editor'");
    addedRoleColumn = true;
  }
  db.prepare(`
    UPDATE users SET role = CASE
      WHEN id = (SELECT id FROM users ORDER BY created_at ASC, rowid ASC LIMIT 1)
        THEN 'admin'
      ELSE 'editor'
    END
    WHERE ? OR role IS NULL OR role NOT IN ('admin', 'editor')
  `).run(addedRoleColumn ? 1 : 0);

  db.exec(`
    CREATE TABLE IF NOT EXISTS system_configs (
      id TEXT PRIMARY KEY,
      config_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      updated_by TEXT
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_model_configs (
      user_id TEXT PRIMARY KEY,
      config_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_authoring_preferences (
      user_id TEXT PRIMARY KEY,
      preferences_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_external_auth_configs (
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      config_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, provider),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_dingtalk_identities (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      corp_id TEXT NOT NULL,
      union_id TEXT,
      dingtalk_user_id TEXT NOT NULL,
      name TEXT,
      avatar TEXT,
      raw_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_login_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_dingtalk_identity_corp_union
    ON user_dingtalk_identities(corp_id, union_id)
    WHERE union_id IS NOT NULL
  `);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_dingtalk_identity_corp_user
    ON user_dingtalk_identities(corp_id, dingtalk_user_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_dingtalk_identity_user
    ON user_dingtalk_identities(user_id)
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS comment_participants (
      participant_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, user_id TEXT,
      corp_id TEXT NOT NULL, dingtalk_user_id TEXT NOT NULL, union_id TEXT,
      display_name TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL, UNIQUE(project_id, corp_id, dingtalk_user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_comment_participants_project ON comment_participants(project_id, last_seen_at DESC);
    CREATE TABLE IF NOT EXISTS comment_notification_outbox (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, thread_id TEXT NOT NULL, reply_id TEXT,
      participant_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', task_id TEXT,
      intent_id TEXT, author_label TEXT, content_text TEXT, target_json TEXT,
      lease_until INTEGER,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_comment_outbox_pending ON comment_notification_outbox(status, updated_at);
    CREATE TABLE IF NOT EXISTS comment_notification_attempts (
      id TEXT PRIMARY KEY, outbox_id TEXT NOT NULL, status TEXT NOT NULL, error_code TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS comment_guest_rate_events (
      id TEXT PRIMARY KEY, bucket TEXT NOT NULL, project_id TEXT NOT NULL, participant_id TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_comment_guest_rate ON comment_guest_rate_events(bucket, project_id, created_at);
  `);
  const outboxColumns = db.prepare("PRAGMA table_info(comment_notification_outbox)").all() as Array<{ name: string }>;
  for (const [name, type] of [
    ["intent_id", "TEXT"],
    ["author_label", "TEXT"],
    ["content_text", "TEXT"],
    ["target_json", "TEXT"],
    ["lease_until", "INTEGER"],
  ] as const) {
    if (!outboxColumns.some((column) => column.name === name)) {
      db.exec(`ALTER TABLE comment_notification_outbox ADD COLUMN ${name} ${type}`);
    }
  }
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_comment_outbox_intent ON comment_notification_outbox(intent_id) WHERE intent_id IS NOT NULL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS password_reset_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      reset_by TEXT NOT NULL,
      reset_method TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_reset_logs_user ON password_reset_logs(user_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_reset_logs_created ON password_reset_logs(created_at)
  `);

  console.log(
    "[Database] Database initialized (users + system_configs + user auth configs)",
  );
}

export function getUserCount(): number {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) as count FROM users").get() as {
    count: number;
  };
  return row.count;
}
