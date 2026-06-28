import { getDb } from "./index";

export function initializeDatabase(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

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
