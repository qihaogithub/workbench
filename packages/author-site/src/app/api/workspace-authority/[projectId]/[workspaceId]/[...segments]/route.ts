import { NextResponse } from "next/server";

import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { createApiError } from "@/lib/fs-utils";
import { getServerAgentServiceUrl } from "@/lib/runtime-config";
import { getEditSession } from "@/lib/session-manager";

interface RouteContext {
  params: { projectId: string; workspaceId: string; segments: string[] };
}

const GET_ENDPOINTS = new Set(["state", "snapshot", "health", "events", "projection-acks"]);
const POST_ENDPOINTS = new Set(["mutate", "staging", "projection-ack", "reconcile/adopt", "reconcile/restore"]);

function endpointPath(segments: string[]): string | null {
  if (segments.length === 0 || segments.some((segment) => !segment || segment === "." || segment === "..")) return null;
  const joined = segments.join("/");
  if (GET_ENDPOINTS.has(joined) || POST_ENDPOINTS.has(joined)) return joined;
  if (segments[0] === "resources" && segments.length > 1) return joined;
  return null;
}

async function proxy(request: Request, context: RouteContext, method: "GET" | "POST") {
  const token = getAuthCookie();
  const user = token ? await verifyToken(token) : null;
  if (!user) return NextResponse.json(createApiError("UNAUTHORIZED", "未登录或登录已过期"), { status: 401 });

  const endpoint = endpointPath(context.params.segments);
  const allowed = endpoint && (method === "GET"
    ? GET_ENDPOINTS.has(endpoint) || endpoint.startsWith("resources/")
    : POST_ENDPOINTS.has(endpoint));
  if (!endpoint || !allowed) return NextResponse.json(createApiError("INVALID_REQUEST", "Authority endpoint 不受支持"), { status: 400 });

  const contentType = request.headers.get("content-type") ?? "";
  const bodyBytes = method === "POST" ? new Uint8Array(await request.arrayBuffer()) : undefined;
  let bodySessionId: string | undefined;
  if (bodyBytes && contentType.includes("application/json")) {
    try {
      const body = JSON.parse(new TextDecoder().decode(bodyBytes)) as { sessionId?: unknown };
      if (typeof body.sessionId === "string") bodySessionId = body.sessionId;
    } catch {
      return NextResponse.json(createApiError("INVALID_REQUEST", "请求 JSON 无效"), { status: 400 });
    }
  }
  const incomingUrl = new URL(request.url);
  const sessionId = incomingUrl.searchParams.get("sessionId") ?? bodySessionId;
  if (!sessionId) return NextResponse.json(createApiError("SESSION_NOT_FOUND"), { status: 401 });

  const session = getEditSession(sessionId);
  if (!session) return NextResponse.json(createApiError("SESSION_NOT_FOUND"), { status: 404 });
  if (session.userId && session.userId !== user.userId) {
    return NextResponse.json(createApiError("FORBIDDEN", "无权访问其他用户的 Session"), { status: 403 });
  }
  if (session.demoId !== context.params.projectId || session.workspaceId !== context.params.workspaceId) {
    return NextResponse.json(createApiError("INVALID_REQUEST", "Session 与项目或 Workspace 不匹配"), { status: 400 });
  }

  const upstreamPath = context.params.segments.map(encodeURIComponent).join("/");
  const upstreamUrl = new URL(
    `${getServerAgentServiceUrl()}/api/workspace-authority/projects/${encodeURIComponent(context.params.projectId)}`
      + `/workspaces/${encodeURIComponent(context.params.workspaceId)}/${upstreamPath}`,
  );
  incomingUrl.searchParams.forEach((value, key) => upstreamUrl.searchParams.append(key, value));
  if (!upstreamUrl.searchParams.has("sessionId") && sessionId) upstreamUrl.searchParams.set("sessionId", sessionId);

  try {
    const upstream = await fetch(upstreamUrl, {
      method,
      headers: method === "POST" && contentType ? { "Content-Type": contentType } : undefined,
      body: bodyBytes,
      cache: "no-store",
    });
    return new Response(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
    });
  } catch (error) {
    return NextResponse.json(
      createApiError("WORKSPACE_AUTHORITY_NOT_READY", error instanceof Error ? error.message : "Workspace Authority 不可用"),
      { status: 503 },
    );
  }
}

export async function GET(request: Request, context: RouteContext) {
  return proxy(request, context, "GET");
}

export async function POST(request: Request, context: RouteContext) {
  return proxy(request, context, "POST");
}
