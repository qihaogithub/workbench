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

  // 系统配置表 (用于管理后台动态配置)
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
    CREATE TABLE IF NOT EXISTS system_knowledge_documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      file_name TEXT UNIQUE NOT NULL,
      content TEXT NOT NULL,
      category TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      version INTEGER NOT NULL DEFAULT 1,
      content_hash TEXT NOT NULL,
      ai_summary TEXT NOT NULL DEFAULT '',
      ai_keywords_json TEXT NOT NULL DEFAULT '[]',
      summary_status TEXT NOT NULL DEFAULT 'stale',
      summary_error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      updated_by TEXT
    )
  `);

  // 密码重置日志表
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
    "[Database] Database initialized (users + system_configs + system_knowledge_documents + password_reset_logs)",
  );
}

/**
 * 获取用户总数（用于首次访问检测）
 */
export function getUserCount(): number {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) as count FROM users").get() as {
    count: number;
  };
  return row.count;
}
