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

  console.log("[Database] Database initialized (users + system_configs)");
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
