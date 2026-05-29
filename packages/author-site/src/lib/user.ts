import { getDb } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import crypto from "crypto";

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

  db.prepare(
    `
    INSERT INTO users (id, username, password_hash, created_at)
    VALUES (?, ?, ?, ?)
  `,
  ).run(id, input.username, passwordHash, now);

  return { id, username: input.username, createdAt: now };
}

/**
 * 根据用户名查找用户
 */
export function findUserByUsername(username: string): User | null {
  const db = getDb();
  return (
    (db
      .prepare(
        "SELECT id, username, created_at as createdAt FROM users WHERE username = ?",
      )
      .get(username) as User) || null
  );
}

/**
 * 根据 ID 查找用户
 */
export function findUserById(id: string): User | null {
  const db = getDb();
  return (
    (db
      .prepare(
        "SELECT id, username, created_at as createdAt FROM users WHERE id = ?",
      )
      .get(id) as User) || null
  );
}

/**
 * 验证用户密码
 */
export async function verifyUserPassword(
  username: string,
  password: string,
): Promise<User | null> {
  const db = getDb();
  const row = db
    .prepare("SELECT id, username, password_hash FROM users WHERE username = ?")
    .get(username) as
    | { id: string; username: string; password_hash: string }
    | undefined;

  if (!row) return null;

  const valid = await verifyPassword(password, row.password_hash);
  if (!valid) return null;

  return { id: row.id, username: row.username, createdAt: 0 };
}

/**
 * 获取所有用户列表
 */
export function listAllUsers(): User[] {
  const db = getDb();
  return db
    .prepare(
      "SELECT id, username, created_at as createdAt FROM users ORDER BY created_at ASC",
    )
    .all() as User[];
}

/**
 * 更新用户密码
 */
export async function updateUserPassword(
  userId: string,
  newPassword: string,
): Promise<boolean> {
  const db = getDb();
  const passwordHash = await hashPassword(newPassword);
  const result = db
    .prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .run(passwordHash, userId);
  return result.changes > 0;
}

/**
 * 删除用户
 */
export function deleteUser(userId: string): boolean {
  const db = getDb();
  // 先删除该用户的密码重置日志
  db.prepare("DELETE FROM password_reset_logs WHERE user_id = ?").run(userId);
  // 再删除用户
  const result = db.prepare("DELETE FROM users WHERE id = ?").run(userId);
  return result.changes > 0;
}

/**
 * 记录密码重置日志
 */
export function logPasswordReset(
  userId: string,
  resetBy: string,
  resetMethod: "admin_reset" | "self_change",
): void {
  const db = getDb();
  const id = crypto.randomUUID();
  db.prepare(
    `
    INSERT INTO password_reset_logs (id, user_id, reset_by, reset_method, created_at)
    VALUES (?, ?, ?, ?, ?)
  `,
  ).run(id, userId, resetBy, resetMethod, Date.now());
}
