import { NextResponse } from "next/server";
import { findUserById } from "@/lib/user";
import {
  getCurrentUserFromRequest,
  toProjectAdminActor,
} from "@/lib/auth/current-user";
import { requireConversationInternalToken } from "@/lib/conversation/internal-auth";
import type { ProjectAdminActor } from "@workbench/project-core";

export interface TransferAuthorization {
  actor: ProjectAdminActor;
  userId: string;
}

export async function authorizeBrowser(
  request: Request,
): Promise<TransferAuthorization | NextResponse> {
  const user = await getCurrentUserFromRequest(request);
  if (!user)
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "未登录" } },
      { status: 401 },
    );
  return { actor: toProjectAdminActor(user), userId: user.id };
}

export async function authorizeInternal(
  request: Request,
  targetProjectId: string,
): Promise<TransferAuthorization | NextResponse> {
  const tokenError = requireConversationInternalToken(request);
  if (tokenError) return tokenError;
  const body = (await request
    .clone()
    .json()
    .catch(() => ({}))) as Record<string, unknown>;
  const headerAuth = request.headers.get("x-author-authorization");
  let headerValue: unknown;
  try {
    headerValue = headerAuth ? JSON.parse(headerAuth) : undefined;
  } catch {
    headerValue = undefined;
  }
  const auth = body.authorAuthorization ?? headerValue;
  if (!auth || typeof auth !== "object")
    return NextResponse.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "authorAuthorization 缺失" },
      },
      { status: 401 },
    );
  const value = auth as Record<string, unknown>;
  if (
    value.projectId !== targetProjectId ||
    typeof value.userId !== "string" ||
    typeof value.expiresAt !== "number" ||
    value.expiresAt <= Date.now() ||
    (value.role !== "admin" && value.role !== "editor")
  )
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "authorAuthorization 与目标项目不匹配或已过期",
        },
      },
      { status: 403 },
    );
  const user = findUserById(value.userId);
  if (!user)
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: "用户不存在" } },
      { status: 403 },
    );
  return { actor: toProjectAdminActor(user), userId: user.id };
}
