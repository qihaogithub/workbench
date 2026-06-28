import { getDb } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import crypto from "crypto";

export interface User {
  id: string;
  username: string;
  createdAt: number;
}

export interface DingtalkIdentity {
  id: string;
  userId: string;
  corpId: string;
  unionId?: string;
  dingtalkUserId: string;
  name?: string;
  avatar?: string;
  createdAt: number;
  updatedAt: number;
  lastLoginAt: number;
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

async function createPasswordlessUser(username: string): Promise<User> {
  const db = getDb();
  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(crypto.randomUUID());
  const now = Date.now();

  db.prepare(
    `
    INSERT INTO users (id, username, password_hash, created_at)
    VALUES (?, ?, ?, ?)
  `,
  ).run(id, username, passwordHash, now);

  return { id, username, createdAt: now };
}

function normalizeUsernamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 10) || "user";
}

function createDingtalkUsername(corpId: string, dingtalkUserId: string): string {
  const hash = crypto
    .createHash("sha256")
    .update(`${corpId}:${dingtalkUserId}`)
    .digest("hex")
    .slice(0, 8);
  return `dt_${normalizeUsernamePart(dingtalkUserId)}_${hash}`.slice(0, 20);
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

interface DingtalkIdentityRow {
  id: string;
  user_id: string;
  corp_id: string;
  union_id?: string | null;
  dingtalk_user_id: string;
  name?: string | null;
  avatar?: string | null;
  created_at: number;
  updated_at: number;
  last_login_at: number;
}

function toDingtalkIdentity(row: DingtalkIdentityRow): DingtalkIdentity {
  return {
    id: row.id,
    userId: row.user_id,
    corpId: row.corp_id,
    unionId: row.union_id || undefined,
    dingtalkUserId: row.dingtalk_user_id,
    name: row.name || undefined,
    avatar: row.avatar || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
  };
}

export function findDingtalkIdentity(
  corpId: string,
  input: { unionId?: string; dingtalkUserId?: string },
): DingtalkIdentity | null {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, user_id, corp_id, union_id, dingtalk_user_id, name, avatar,
              created_at, updated_at, last_login_at
       FROM user_dingtalk_identities
       WHERE corp_id = ?
         AND ((union_id IS NOT NULL AND union_id = ?) OR dingtalk_user_id = ?)
       LIMIT 1`,
    )
    .all(corpId, input.unionId ?? "", input.dingtalkUserId ?? "") as DingtalkIdentityRow[];

  return rows[0] ? toDingtalkIdentity(rows[0]) : null;
}

export function findDingtalkIdentityByUserId(userId: string): DingtalkIdentity | null {
  const row = getDb()
    .prepare(
      `SELECT id, user_id, corp_id, union_id, dingtalk_user_id, name, avatar,
              created_at, updated_at, last_login_at
       FROM user_dingtalk_identities
       WHERE user_id = ?
       ORDER BY last_login_at DESC
       LIMIT 1`,
    )
    .get(userId) as DingtalkIdentityRow | undefined;

  return row ? toDingtalkIdentity(row) : null;
}

export async function findOrCreateUserByDingtalkIdentity(input: {
  corpId: string;
  unionId?: string;
  dingtalkUserId: string;
  name?: string;
  avatar?: string;
  raw?: unknown;
}): Promise<{ user: User; identity: DingtalkIdentity; created: boolean }> {
  const db = getDb();
  const now = Date.now();
  const existing = findDingtalkIdentity(input.corpId, {
    unionId: input.unionId,
    dingtalkUserId: input.dingtalkUserId,
  });

  if (existing) {
    db.prepare(
      `UPDATE user_dingtalk_identities
       SET union_id = COALESCE(?, union_id),
           name = COALESCE(?, name),
           avatar = COALESCE(?, avatar),
           raw_json = ?,
           updated_at = ?,
           last_login_at = ?
       WHERE id = ?`,
    ).run(
      input.unionId,
      input.name,
      input.avatar,
      input.raw ? JSON.stringify(input.raw) : null,
      now,
      now,
      existing.id,
    );
    const user = findUserById(existing.userId);
    if (!user) {
      throw new Error("DingTalk identity points to a missing user");
    }
    return {
      user,
      identity: {
        ...existing,
        unionId: input.unionId ?? existing.unionId,
        name: input.name ?? existing.name,
        avatar: input.avatar ?? existing.avatar,
        updatedAt: now,
        lastLoginAt: now,
      },
      created: false,
    };
  }

  const user = await createPasswordlessUser(
    createDingtalkUsername(input.corpId, input.dingtalkUserId),
  );
  const identityId = crypto.randomUUID();
  db.prepare(
    `INSERT INTO user_dingtalk_identities (
       id, user_id, corp_id, union_id, dingtalk_user_id, name, avatar,
       raw_json, created_at, updated_at, last_login_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    identityId,
    user.id,
    input.corpId,
    input.unionId,
    input.dingtalkUserId,
    input.name,
    input.avatar,
    input.raw ? JSON.stringify(input.raw) : null,
    now,
    now,
    now,
  );

  return {
    user,
    identity: {
      id: identityId,
      userId: user.id,
      corpId: input.corpId,
      unionId: input.unionId,
      dingtalkUserId: input.dingtalkUserId,
      name: input.name,
      avatar: input.avatar,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    },
    created: true,
  };
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
