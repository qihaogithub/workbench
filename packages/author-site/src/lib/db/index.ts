import Database from 'better-sqlite3';
import path from 'path';
import { getDataDir } from '@/lib/fs-utils';
import { initializeDatabase } from './schema';

const DB_PATH = path.join(getDataDir(), 'users.db');

let db: Database.Database | null = null;
let initialized = false;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');  // 提升并发性能
    db.pragma('foreign_keys = ON');

    if (!initialized) {
      initializeDatabase();
      initialized = true;
    }
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
