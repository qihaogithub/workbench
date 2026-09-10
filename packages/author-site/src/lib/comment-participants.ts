import crypto from "crypto";
import { getDb } from "./db";
import { getDataDir } from "./fs-utils";
import fs from "fs";
import path from "path";
import type { CommentMention, ProjectCommentParticipant } from "@workbench/shared";

export type CommentParticipant = ProjectCommentParticipant;
const id = () => `participant_${crypto.randomUUID()}`;
const now = () => Date.now();

export function registerCommentParticipant(projectId: string, userId: string): CommentParticipant | null {
  const db = getDb();
  const corpId = process.env.DINGTALK_CORP_ID;
  if (!corpId) return null;
  const identity = db.prepare("SELECT corp_id, dingtalk_user_id, union_id, name FROM user_dingtalk_identities WHERE user_id=? AND corp_id=? ORDER BY last_login_at DESC LIMIT 1").get(userId, corpId) as any;
  if (!identity) return null;
  const stamp = now();
  db.prepare(`INSERT INTO comment_participants(participant_id,project_id,user_id,corp_id,dingtalk_user_id,union_id,display_name,created_at,updated_at,last_seen_at)
    VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(project_id,corp_id,dingtalk_user_id) DO UPDATE SET user_id=excluded.user_id,display_name=excluded.display_name,updated_at=excluded.updated_at,last_seen_at=excluded.last_seen_at`)
    .run(id(), projectId, userId, identity.corp_id, identity.dingtalk_user_id, identity.union_id ?? null, identity.name || userId, stamp, stamp, stamp);
  const row = db.prepare("SELECT participant_id,display_name FROM comment_participants WHERE project_id=? AND corp_id=? AND dingtalk_user_id=?").get(projectId, identity.corp_id, identity.dingtalk_user_id) as any;
  return row ? { id: row.participant_id, name: row.display_name, lastParticipatedAt: stamp } : null;
}

function published(projectId: string): boolean {
  const root = path.join(getDataDir(), "published", projectId);
  return fs.existsSync(path.join(root, "project.json"));
}

export function searchCommentParticipants(projectId: string, query: string, authenticated: boolean): CommentParticipant[] {
  if (!authenticated && !published(projectId)) return [];
  const db = getDb();
  const q = query.trim();
  if (!authenticated && q.length < 1) return [];
  const corpId = process.env.DINGTALK_CORP_ID;
  if (!corpId) return [];
  const escaped = q.replace(/[\\%_]/g, "\\$&");
  const rows = db.prepare(`SELECT participant_id, display_name, last_seen_at FROM comment_participants
    WHERE project_id=? AND corp_id=? AND (?='' OR display_name LIKE ? ESCAPE '\\') ORDER BY last_seen_at DESC LIMIT ?`).all(projectId, corpId, q, `%${escaped}%`, authenticated ? 20 : 10) as any[];
  return rows.map((r) => ({ id: r.participant_id, name: r.display_name, lastParticipatedAt: r.last_seen_at }));
}

export function normalizeCommentMentions(projectId: string, mentions: CommentMention[] | undefined, max: number): CommentMention[] | undefined {
  if (!mentions) return undefined;
  const users = mentions.filter((m) => m?.type === "user");
  if (users.length > max) throw new Error("TOO_MANY_MENTIONS");
  if (new Set(users.map((mention) => mention.id)).size !== users.length) throw new Error("DUPLICATE_MENTION");
   const db = getDb();
  const corpId = process.env.DINGTALK_CORP_ID;
  if (!corpId && users.length) throw new Error("INVALID_MENTION");
  const result: CommentMention[] = [];
  for (const mention of mentions) {
    if (mention.type === "agent") { result.push({ type: "agent", id: "agent", name: "AI 助手" }); continue; }
    const row = db.prepare("SELECT participant_id,display_name FROM comment_participants WHERE project_id=? AND participant_id=? AND corp_id=? AND last_seen_at > ?").get(projectId, mention.id, corpId, now() - 365 * 86400000) as any;
    if (!row) throw new Error("INVALID_MENTION");
    result.push({ type: "user", id: row.participant_id, name: row.display_name });
  }
  return result;
}

export function participantIdentity(projectId: string, participantId: string): { dingtalkUserId: string; corpId: string } | null {
  const row = getDb().prepare("SELECT dingtalk_user_id,corp_id FROM comment_participants WHERE project_id=? AND participant_id=?").get(projectId, participantId) as any;
  return row ? { dingtalkUserId: row.dingtalk_user_id, corpId: row.corp_id } : null;
}
