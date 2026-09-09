import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { CommentDeliverySummary, CommentMention, CommentReply, CommentTarget, CommentThread } from "@workbench/shared";
import { getDb } from "./db";
import { getDataDir } from "./fs-utils";
import { participantIdentity } from "./comment-participants";
import { getDingtalkAppAccessToken, readDingtalkLoginConfig } from "./dingtalk-login";
import { getInternalApiToken, getServerAgentServiceUrl } from "./runtime-config";

const uid = () => `dn_${crypto.randomUUID()}`;
const numberEnv = (key: string, fallback: number) => {
  const value = Number(process.env[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};
export type DeliveryStatus = "pending" | "submitted" | "failed" | "suppressed";

function hmac(value: string): string | null {
  const secret = process.env.DINGTALK_COMMENT_RATE_LIMIT_SECRET;
  return secret ? crypto.createHmac("sha256", secret).update(value).digest("hex") : null;
}

/** 仅信任由部署方明确启用、并由反向代理重写的客户端 IP 头。 */
export function anonymousIpDigest(request: { headers: Headers }): string | null {
  if (process.env.DINGTALK_COMMENT_TRUST_PROXY !== "true") return null;
  const header = process.env.DINGTALK_COMMENT_CLIENT_IP_HEADER || "x-forwarded-for";
  const raw = request.headers.get(header)?.split(",")[0]?.trim();
  return raw && raw.length <= 128 ? hmac(raw) : null;
}

function countBucket(bucket: string, projectId: string, since: number): number {
  return (getDb().prepare("SELECT COUNT(*) count FROM comment_guest_rate_events WHERE bucket=? AND project_id=? AND created_at>?").get(bucket, projectId, since) as { count: number }).count;
}
function recordBucket(bucket: string, projectId: string, participantId: string | null, stamp: number) {
  getDb().prepare("INSERT INTO comment_guest_rate_events(id,bucket,project_id,participant_id,created_at) VALUES(?,?,?,?,?)").run(uid(), bucket, projectId, participantId, stamp);
}

export function consumeAnonymousParticipantSearch(projectId: string, ipDigest: string | null): boolean {
  if (!ipDigest) return false;
  const stamp = Date.now();
  const bucket = `search-ip:${ipDigest}`;
  if (countBucket(bucket, projectId, stamp - 60_000) >= numberEnv("DINGTALK_COMMENT_SEARCH_PER_MINUTE_LIMIT", 30)) return false;
  recordBucket(bucket, projectId, null, stamp);
  getDb().prepare("DELETE FROM comment_guest_rate_events WHERE created_at<?").run(stamp - 86_400_000);
  return true;
}

const notificationsEnabled = () => process.env.DINGTALK_COMMENT_NOTIFICATIONS_ENABLED === "true";

function circuitOpen(stamp: number): boolean {
  const limit = numberEnv("DINGTALK_COMMENT_CIRCUIT_FAILURE_LIMIT", 20);
  const rows = getDb().prepare("SELECT status,created_at FROM comment_notification_attempts ORDER BY created_at DESC LIMIT ?").all(limit) as Array<{ status: string; created_at: number }>;
  if (rows.length < limit || rows.some((row) => row.status !== "failed")) return false;
  const newest = rows[0]!.created_at;
  const oldest = rows[rows.length - 1]!.created_at;
  return newest - oldest <= numberEnv("DINGTALK_COMMENT_CIRCUIT_WINDOW_MS", 300_000)
    && newest >= stamp - numberEnv("DINGTALK_COMMENT_CIRCUIT_OPEN_MS", 600_000);
}

function rateSuppressed(projectId: string, participantId: string, anonymous: boolean, anonymousId?: string, ipDigest?: string | null): boolean {
  if (!notificationsEnabled() || circuitOpen(Date.now())) return true;
  if (!anonymous) return false;
  const anonymousDigest = anonymousId ? hmac(anonymousId) : null;
  if (!ipDigest || !anonymousDigest) return true;
  const stamp = Date.now();
  const tenMinutes = numberEnv("DINGTALK_COMMENT_ANONYMOUS_10M_LIMIT", 10);
  const day = numberEnv("DINGTALK_COMMENT_ANONYMOUS_24H_LIMIT", 30);
  const buckets = {
    ip: `notify-ip:${ipDigest}`,
    anonymous: `notify-anon:${anonymousDigest}`,
    recipient: `notify-recipient:${participantId}`,
    project: "notify-project",
  };
  if (
    countBucket(buckets.ip, projectId, stamp - 600_000) >= tenMinutes ||
    countBucket(buckets.ip, projectId, stamp - 86_400_000) >= day ||
    countBucket(buckets.anonymous, projectId, stamp - 600_000) >= tenMinutes ||
    countBucket(buckets.anonymous, projectId, stamp - 86_400_000) >= day ||
    countBucket(buckets.recipient, projectId, stamp - 3_600_000) >= numberEnv("DINGTALK_COMMENT_RECIPIENT_HOURLY_LIMIT", 5) ||
    countBucket(buckets.project, projectId, stamp - 3_600_000) >= numberEnv("DINGTALK_COMMENT_PROJECT_HOURLY_LIMIT", 100)
  ) return true;
  Object.values(buckets).forEach((bucket) => recordBucket(bucket, projectId, participantId, stamp));
  getDb().prepare("DELETE FROM comment_guest_rate_events WHERE created_at<?").run(stamp - 86_400_000);
  return false;
}

export function deliverySummary(projectId: string, threadId: string, replyId?: string): CommentDeliverySummary {
  const empty: CommentDeliverySummary = { status: "submitted", total: 0, pending: 0, submitted: 0, failed: 0, suppressed: 0, retryable: false };
  // Keep the legacy comment store usable in isolated tests/tools that do not
  // initialize any DingTalk environment or SQLite-backed notification layer.
  if (process.env.DINGTALK_COMMENT_NOTIFICATIONS_ENABLED === undefined && !process.env.DINGTALK_CORP_ID) {
    return empty;
  }
  let rows: Array<{ status: DeliveryStatus; count: number }>;
  try {
    rows = getDb().prepare("SELECT status,COUNT(*) count FROM comment_notification_outbox WHERE project_id=? AND thread_id=? AND (reply_id IS ? OR reply_id=?) GROUP BY status").all(projectId, threadId, replyId ?? null, replyId ?? null) as Array<{ status: DeliveryStatus; count: number }>;
  } catch {
    return empty;
  }
  const out: CommentDeliverySummary = { status: "submitted", total: 0, pending: 0, submitted: 0, failed: 0, suppressed: 0, retryable: false };
  for (const row of rows) { out[row.status] = row.count; out.total += row.count; }
  if (out.pending) out.status = "pending";
  else if (out.failed) out.status = "failed";
  else if (out.suppressed && !out.submitted) out.status = "suppressed";
  out.retryable = out.failed > 0;
  return out;
}

function plainText(value: string, limit = 500): string {
  return value.replace(/!\[[^\]]*\]\([^)]*\)/g, "[图片]").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_~>#\[\]\\]/g, "\\$&").replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}

function readPublishedProject(projectId: string): Record<string, unknown> | null {
  try { return JSON.parse(fs.readFileSync(path.join(getDataDir(), "published", projectId, "project.json"), "utf8")) as Record<string, unknown>; }
  catch { return null; }
}
function containsStableId(value: unknown, id: string): boolean {
  if (typeof value === "string") return value === id;
  if (Array.isArray(value)) return value.some((item) => containsStableId(item, id));
  return Boolean(value && typeof value === "object" && Object.entries(value).some(([key, item]) => key === id || containsStableId(item, id)));
}
function targetExists(project: Record<string, unknown>, target: CommentTarget): boolean {
  if (target.kind === "page") return Array.isArray(project.demoPages) && project.demoPages.some((page) => (page as { id?: string }).id === target.pageId);
  if (target.kind === "document") return containsStableId({ knowledge: project.knowledge, designSpecs: project.designSpecs }, target.resourceId);
  if (target.scope === "page") {
    const page = Array.isArray(project.demoPages) ? project.demoPages.find((item) => (item as { id?: string }).id === target.pageId) : undefined;
    return Boolean(page && containsStableId(page, target.fieldKey));
  }
  return containsStableId(project.projectConfigSchema, target.fieldKey);
}
function viewerLink(row: Record<string, unknown>): string | null {
  const base = process.env.DINGTALK_COMMENT_VIEWER_BASE_URL?.replace(/\/$/, "");
  if (!base || !/^https:\/\/[^\s]+$/i.test(base)) return null;
  let target: CommentTarget;
  try { target = JSON.parse(String(row.target_json || "")) as CommentTarget; } catch { return null; }
  const project = readPublishedProject(String(row.project_id));
  if (!project || !targetExists(project, target)) return null;
  const pageId = target.kind === "page" ? target.pageId : target.kind === "config" ? target.pageId : undefined;
  const pathname = `/${encodeURIComponent(String(row.project_id))}${pageId ? `/${encodeURIComponent(pageId)}` : ""}`;
  const search = new URLSearchParams({ comment: String(row.thread_id) });
  if (row.reply_id) search.set("reply", String(row.reply_id));
  return `${base}${pathname}?${search}`;
}
function targetLabel(target: CommentTarget): string {
  if (target.kind === "page") return `页面 ${target.pageId}`;
  if (target.kind === "document") return `文档 ${target.resourceLabel}`;
  return `配置项 ${target.fieldTitleSnapshot || target.fieldKey}`;
}

async function broadcastDelivery(projectId: string, threadId: string, replyId?: string) {
  try {
    const token = getInternalApiToken();
    await fetch(`${getServerAgentServiceUrl()}/internal/comments/notify`, {
      method: "POST", headers: { "Content-Type": "application/json", ...(token ? { "X-Internal-Token": token } : {}) },
      body: JSON.stringify({ projectId, event: { type: "comment:dingtalk-status", threadId, replyId, delivery: deliverySummary(projectId, threadId, replyId) } }),
    });
  } catch { /* REST refresh remains authoritative. */ }
}

export function enqueueCommentNotifications(
  projectId: string, threadId: string, mentions: CommentMention[] | undefined,
  authorName: string, content: string, anonymous: boolean, target: CommentTarget,
  replyId?: string, anonymousId?: string, ipDigest?: string | null, intentIds?: string[],
) {
  const users = (mentions ?? []).filter((mention) => mention.type === "user");
  if (!users.length) return;
  if (process.env.DINGTALK_COMMENT_NOTIFICATIONS_ENABLED === undefined && !process.env.DINGTALK_CORP_ID) return;
  const db = getDb(); const stamp = Date.now();
  const insert = db.prepare(`INSERT OR IGNORE INTO comment_notification_outbox
    (id,project_id,thread_id,reply_id,participant_id,status,intent_id,author_label,content_text,target_json,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
  users.forEach((mention, index) => {
    const intentId = intentIds?.[index] ?? uid();
    if (db.prepare("SELECT 1 FROM comment_notification_outbox WHERE intent_id=?").get(intentId)) return;
    const status: DeliveryStatus = rateSuppressed(projectId, mention.id, anonymous, anonymousId, ipDigest) ? "suppressed" : "pending";
    insert.run(uid(), projectId, threadId, replyId ?? null, mention.id, status, intentId, anonymous ? "未登录访客" : plainText(authorName, 80), plainText(content), JSON.stringify(target), stamp, stamp);
  });
  // 即使记录已经存在，也要唤醒因进程中断而遗留的 pending Outbox。
  void dispatchPendingCommentNotifications(projectId, threadId, replyId).finally(() => broadcastDelivery(projectId, threadId, replyId));
}

/** 根据 comments.json 中的意图 ID 幂等补建因短暂双写间隙缺失的 Outbox。 */
export function reconcileCommentNotificationOutbox(thread: CommentThread) {
  for (const intent of thread.notificationIntents ?? []) {
    enqueueCommentNotifications(thread.projectId, thread.id, [{ type: "user", id: intent.participantId, name: "" }], thread.author.name, thread.content, thread.author.isAnonymous, thread.target, undefined, thread.author.isAnonymous ? thread.author.id : undefined, null, [intent.id]);
  }
  for (const reply of thread.replies) {
    for (const intent of reply.notificationIntents ?? []) {
      enqueueCommentNotifications(thread.projectId, thread.id, [{ type: "user", id: intent.participantId, name: "" }], reply.author.name, reply.content, reply.author.isAnonymous, thread.target, reply.id, reply.author.isAnonymous ? reply.author.id : undefined, null, [intent.id]);
    }
  }
}

function messagePayload(row: Record<string, unknown>, link: string | null) {
  const project = readPublishedProject(String(row.project_id));
  const projectName = plainText(typeof project?.name === "string" ? project.name : String(row.project_id), 80);
  let target: CommentTarget;
  try { target = JSON.parse(String(row.target_json)) as CommentTarget; } catch { target = { kind: "page", pageId: "" }; }
  const kind = row.reply_id ? "回复" : "评论";
  const markdown = `### OneFlow ${kind}提醒\n\n**${plainText(String(row.author_label || "评论参与者"), 80)}** 在「${projectName}」的${targetLabel(target)} @了你：\n\n${plainText(String(row.content_text || ""))}`;
  return link ? { msgtype: "action_card", action_card: { title: "OneFlow 评论提醒", markdown, single_title: "查看评论", single_url: link } }
    : { msgtype: "markdown", markdown: { title: "OneFlow 评论提醒", text: markdown } };
}

async function querySendResult(config: ReturnType<typeof readDingtalkLoginConfig>, token: string, agentId: string, taskId: string, userId: string): Promise<"submitted" | "failed" | "pending"> {
  const response = await fetch(`${config.oapiBaseUrl}/topapi/message/corpconversation/getsendresult?access_token=${encodeURIComponent(token)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agent_id: agentId, task_id: taskId }),
  });
  const result = await response.json() as Record<string, unknown>;
  if (!response.ok || result.errcode !== 0) return "pending";
  const sendResult = (result.send_result ?? result.result) as Record<string, unknown> | undefined;
  if (!sendResult) return "pending";
  const failed = ["failed_user_id_list", "invalid_user_id_list", "forbidden_user_id_list"].flatMap((key) => Array.isArray(sendResult[key]) ? sendResult[key] as string[] : []);
  return failed.includes(userId) ? "failed" : "submitted";
}

async function sendOne(row: Record<string, unknown>): Promise<string> {
  const identity = participantIdentity(String(row.project_id), String(row.participant_id));
  if (!identity) throw new Error("participant_missing");
  const config = readDingtalkLoginConfig(); const agentId = process.env.DINGTALK_AGENT_ID;
  if (!agentId || !config.corpId || identity.corpId !== config.corpId) throw new Error("dingtalk_not_configured");
  const token = await getDingtalkAppAccessToken();
  const response = await fetch(`${config.oapiBaseUrl}/topapi/message/corpconversation/asyncsend_v2?access_token=${encodeURIComponent(token)}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent_id: agentId, userid_list: identity.dingtalkUserId, msg: messagePayload(row, viewerLink(row)) }),
  });
  const result = await response.json() as Record<string, unknown>;
  if (!response.ok || result.errcode !== 0 || !result.task_id) throw new Error(String(result.errmsg || "send_failed"));
  const taskId = String(result.task_id);
  for (const delay of [1000, 2000, 4000]) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    const status = await querySendResult(config, token, agentId, taskId, identity.dingtalkUserId);
    if (status === "failed") throw new Error("recipient_delivery_failed");
    if (status === "submitted") break;
  }
  return taskId;
}

export async function dispatchPendingCommentNotifications(projectId: string, threadId?: string, replyId?: string) {
  if (!notificationsEnabled()) return;
  const db = getDb();
  const now = Date.now();
  const rows = db.prepare("SELECT * FROM comment_notification_outbox WHERE project_id=? AND status='pending' AND (lease_until IS NULL OR lease_until<?) AND (? IS NULL OR thread_id=?) AND (? IS NULL OR reply_id=?)").all(projectId, now, threadId ?? null, threadId ?? null, replyId ?? null, replyId ?? null) as Array<Record<string, unknown>>;
  for (const row of rows) {
    const claimed = db.prepare("UPDATE comment_notification_outbox SET lease_until=?,updated_at=? WHERE id=? AND status='pending' AND (lease_until IS NULL OR lease_until<?)")
      .run(now + 60_000, now, row.id, now).changes;
    if (!claimed) continue;
    try {
      const taskId = await sendOne(row);
      db.prepare("UPDATE comment_notification_outbox SET status='submitted',task_id=?,lease_until=NULL,updated_at=? WHERE id=?").run(taskId, Date.now(), row.id);
      db.prepare("INSERT INTO comment_notification_attempts(id,outbox_id,status,error_code,created_at) VALUES(?,?,?,?,?)").run(uid(), row.id, "submitted", null, Date.now());
    } catch (error) {
      const code = error instanceof Error ? error.message : String(error);
      db.prepare("INSERT INTO comment_notification_attempts(id,outbox_id,status,error_code,created_at) VALUES(?,?,?,?,?)").run(uid(), row.id, "failed", code.slice(0, 80), Date.now());
      db.prepare("UPDATE comment_notification_outbox SET status='failed',lease_until=NULL,updated_at=? WHERE id=?").run(Date.now(), row.id);
    }
  }
}

export async function retryCommentNotifications(projectId: string, threadId: string, replyId?: string) {
  getDb().prepare("UPDATE comment_notification_outbox SET status='pending',lease_until=NULL,updated_at=? WHERE project_id=? AND thread_id=? AND (reply_id IS ? OR reply_id=?) AND status='failed'").run(Date.now(), projectId, threadId, replyId ?? null, replyId ?? null);
  await dispatchPendingCommentNotifications(projectId, threadId, replyId);
  await broadcastDelivery(projectId, threadId, replyId);
}
export function cancelCommentNotifications(projectId: string, threadId: string, replyId?: string) {
  const db = getDb();
  db.prepare("DELETE FROM comment_notification_attempts WHERE outbox_id IN (SELECT id FROM comment_notification_outbox WHERE project_id=? AND thread_id=? AND (? IS NULL OR reply_id=?) AND status IN ('pending','failed','suppressed'))").run(projectId, threadId, replyId ?? null, replyId ?? null);
  db.prepare("DELETE FROM comment_notification_outbox WHERE project_id=? AND thread_id=? AND (? IS NULL OR reply_id=?) AND status IN ('pending','failed','suppressed')").run(projectId, threadId, replyId ?? null, replyId ?? null);
}
export function attachDelivery<T extends CommentThread | CommentReply>(value: T, projectId: string, threadId: string, replyId?: string): T {
  value.dingtalkDelivery = deliverySummary(projectId, threadId, replyId); return value;
}
