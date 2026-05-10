import { getDb } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import crypto from 'crypto';

export interface User {
  id: string;
  username: string;
  createdAt: number;
}

export interface CreateUserInput {
  username: string;
  password: string;
}

/**
 * 创建用户
 */
export async function createUser(input: CreateUserInput): Promise<User> {
  const db = getDb();
  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(input.password);
  const now = Date.now();

  db.prepare(`
    INSERT INTO users (id, username, password_hash, created_at)
    VALUES (?, ?, ?, ?)
  `).run(id, input.username, passwordHash, now);

  return { id, username: input.username, createdAt: now };
}

/**
 * 根据用户名查找用户
 */
export function findUserByUsername(username: string): User | null {
  const db = getDb();
  return (db.prepare(
    'SELECT id, username, created_at as createdAt FROM users WHERE username = ?'
  ).get(username) as User) || null;
}

/**
 * 根据 ID 查找用户
 */
export function findUserById(id: string): User | null {
  const db = getDb();
  return (db.prepare(
    'SELECT id, username, created_at as createdAt FROM users WHERE id = ?'
  ).get(id) as User) || null;
}

/**
 * 验证用户密码
 */
export async function verifyUserPassword(username: string, password: string): Promise<User | null> {
  const db = getDb();
  const row = db.prepare(
    'SELECT id, username, password_hash FROM users WHERE username = ?'
  ).get(username) as { id: string; username: string; password_hash: string } | undefined;

  if (!row) return null;

  const valid = await verifyPassword(password, row.password_hash);
  if (!valid) return null;

  return { id: row.id, username: row.username, createdAt: 0 };
}
