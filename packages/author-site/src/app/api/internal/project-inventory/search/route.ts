import { NextRequest, NextResponse } from "next/server";
import { decodeMarkdownReferenceUri, type InventoryQuery, type InventoryQueryResult } from "@workbench/shared";
import { KnowledgeServiceClient } from "@workbench/knowledge-service/client";
import { createApiError, createApiSuccess, getSessionMeta, isSessionExpired } from "@/lib/fs-utils";
import { findUserById } from "@/lib/user";
import { toProjectAdminActor } from "@/lib/auth/current-user";
import { getProjectAdminService } from "@/lib/project-admin-service";
import { requireConversationInternalToken } from "@/lib/conversation/internal-auth";
import { resolveMarkdownReferenceWorkspace } from "@/lib/markdown-references";
import { getProjectInventory, queryProjectInventory, redactUnavailableInventoryEntry } from "@/lib/agent/project-inventory";

export const dynamic = "force-dynamic";

const knowledgeService = new KnowledgeServiceClient();
const RESOURCE_TYPES = new Set(["project", "page", "document", "config"]);
const SCOPES = new Set(["local", "referenced"]);

function response(body: unknown, status = 200): NextResponse {
  const result = NextResponse.json(body, { status });
  result.headers.set("Cache-Control", "no-store");
  return result;
}

function invalid(message = "清单查询参数无效") {
  return response(createApiError("INVALID_REQUEST", message), 400);
}

function queryFromBody(value: unknown): (InventoryQuery & { projectId: string }) | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (typeof body.projectId !== "string" || !body.projectId || body.projectId.length > 256) return null;
  if (body.query !== undefined && (typeof body.query !== "string" || body.query.length > 512)) return null;
  if (body.cursor !== undefined && (typeof body.cursor !== "string" || body.cursor.length > 256)) return null;
  if (body.limit !== undefined && (!Number.isSafeInteger(body.limit) || (body.limit as number) < 1 || (body.limit as number) > 100)) return null;
  for (const [key, allowed] of [["resourceTypes", RESOURCE_TYPES], ["scopes", SCOPES]] as const) {
    const value = body[key];
    if (value !== undefined && (!Array.isArray(value) || value.length > 16 || value.some((item) => typeof item !== "string" || !allowed.has(item)))) return null;
  }
  return {
    projectId: body.projectId,
    ...(typeof body.query === "string" ? { query: body.query } : {}),
    ...(Array.isArray(body.resourceTypes) ? { resourceTypes: body.resourceTypes as InventoryQuery["resourceTypes"] } : {}),
    ...(Array.isArray(body.scopes) ? { scopes: body.scopes as InventoryQuery["scopes"] } : {}),
    ...(typeof body.limit === "number" ? { limit: body.limit } : {}),
    ...(typeof body.cursor === "string" ? { cursor: body.cursor } : {}),
  };
}

export async function POST(request: NextRequest) {
  const tokenError = requireConversationInternalToken(request);
  if (tokenError) return tokenError;
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > 64 * 1024) return invalid("请求体过大");
  const rawBody = await request.text().catch(() => "");
  if (Buffer.byteLength(rawBody, "utf8") > 64 * 1024) return invalid("请求体过大");
  let body: unknown;
  try { body = JSON.parse(rawBody || "null") as unknown; } catch { return invalid(); }
  const query = queryFromBody(body);
  if (!query) return invalid();

  const sessionId = typeof (body as Record<string, unknown> | null)?.sessionId === "string"
    ? (body as Record<string, unknown>).sessionId as string
    : request.headers.get("x-agent-session-id") ?? "";
  if (!sessionId || sessionId.length > 256) return invalid("会话参数无效");
  const authHeader = request.headers.get("x-author-authorization");
  let auth: Record<string, unknown> | null = null;
  try {
    const parsed = authHeader ? JSON.parse(authHeader) : null;
    auth = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch { auth = null; }
  if (!auth || auth.projectId !== query.projectId || typeof auth.userId !== "string" || typeof auth.expiresAt !== "number" || auth.expiresAt <= Date.now()) {
    return response(createApiError("UNAUTHORIZED", "清单访问授权无效"), 401);
  }
  const user = findUserById(auth.userId);
  if (!user) return response(createApiError("FORBIDDEN", "清单不可用"), 403);
  const session = getSessionMeta(sessionId);
  if (!session || session.userId !== user.id || session.demoId !== query.projectId || !session.workspaceId) return response(createApiError("SESSION_NOT_FOUND", "会话不可用"), 404);
  if (isSessionExpired(session)) return response(createApiError("SESSION_EXPIRED", "会话已过期"), 410);

  const actor = toProjectAdminActor(user);
  const access = getProjectAdminService().getProject(query.projectId, actor);
  if (!access.ok) return response(createApiError("FORBIDDEN", "清单不可用"), 403);
  const context = resolveMarkdownReferenceWorkspace(
    new NextRequest(`${request.nextUrl.origin}${request.nextUrl.pathname}?sessionId=${encodeURIComponent(sessionId)}`),
    query.projectId,
    user.id,
  );
  if (!context) return response(createApiError("FILE_READ_ERROR", "工作空间不可用"), 404);

  let result: InventoryQueryResult;
  try {
    result = await knowledgeService.searchInventory(query);
  } catch {
    const fallback = await getProjectInventory(context);
    result = queryProjectInventory(fallback.snapshot, query);
  }
  const targetAccess = new Map<string, boolean>();
  const service = getProjectAdminService();
  const entries = result.entries.map((entry) => {
    if (entry.scope === "local") return { ...entry, targetAvailability: "available" as const };
    const target = decodeMarkdownReferenceUri(entry.canonicalUri);
    if (!target) return redactUnavailableInventoryEntry(entry);
    let allowed = targetAccess.get(target.projectId);
    if (allowed === undefined) {
      allowed = service.getProject(target.projectId, actor).ok;
      targetAccess.set(target.projectId, allowed);
    }
    return allowed ? { ...entry, targetAvailability: "available" as const } : redactUnavailableInventoryEntry(entry);
  });
  return response(createApiSuccess({ ...result, entries }));
}
