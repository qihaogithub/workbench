const path = require("path");
const Database = require("better-sqlite3");

function findProjectRoot(startDir) {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    if (require("fs").existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = path.dirname(dir);
  }
  return startDir;
}

const DATA_DIR = process.env.DATA_DIR || path.join(findProjectRoot(__dirname), "data");
const DB_PATH = path.join(DATA_DIR, "users.db");

console.log("[Init] Initializing database...");

try {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  db.close();
  console.log("[Init] Database initialized successfully");
} catch (error) {
  console.error("[Init] Failed to initialize database:", error);
  process.exit(1);
}
