/**
 * 评论 API 鉴权辅助
 *
 * 评论 API 支持两种身份来源：
 * 1. Cookie auth_token（author-site 本站请求）
 * 2. X-Auth-Token header（viewer-site 跨域请求）
 *
 * 未登录用户以匿名身份参与（body 中携带 anonymousId + displayName）。
 */
import type { NextRequest } from "next/server";
import type { CommentAuthor } from "@workbench/shared";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import type { UserPayload } from "@/lib/auth/jwt";
import { findUserById, type UserRole } from "@/lib/user";

/**
 * 从请求中解析已登录用户（Cookie 优先，其次 X-Auth-Token header）
 */
export async function resolveUser(
  request: NextRequest,
): Promise<UserPayload | null> {
  const cookieToken = await getAuthCookie();
  if (cookieToken) {
    const payload = await verifyToken(cookieToken);
    if (payload) return payload;
  }

  const headerToken = request.headers.get("x-auth-token");
  if (headerToken) {
    const payload = await verifyToken(headerToken);
    if (payload) return payload;
  }

  return null;
}

export interface CommentAuthorResult {
  author: CommentAuthor;
  /** 已登录用户 ID（用于权限判断） */
  userId?: string;
  /** 始终由数据库读取，不能信任 JWT 或请求体中的角色。 */
  role?: UserRole;
}

/**
 * 从请求 + body 解析评论作者身份。
 *
 * 已登录 → 使用 JWT 中的 userId/username；
 * 未登录 → 要求 body 提供 anonymousId（可选 displayName）。
 */
export async function resolveCommentAuthor(
  request: NextRequest,
  body: { anonymousId?: string; displayName?: string },
): Promise<CommentAuthorResult | null> {
  const user = await resolveUser(request);
  if (user) {
    const currentUser = findUserById(user.userId);
    if (!currentUser) return null;
    return {
      author: {
        id: currentUser.id,
        name: currentUser.username,
        isAnonymous: false,
      },
      userId: currentUser.id,
      role: currentUser.role,
    };
  }

  // 匿名用户
  if (!body.anonymousId || typeof body.anonymousId !== "string") {
    return null;
  }

  const displayName =
    typeof body.displayName === "string" && body.displayName.trim()
      ? body.displayName.trim()
      : "匿名用户";

  return {
    author: {
      id: body.anonymousId,
      name: displayName,
      isAnonymous: true,
    },
  };
}

/**
 * 判断操作者是否有权删除/编辑（作者本人或管理员）
 */
export function canModify(
  operator: CommentAuthorResult,
  targetAuthorId: string,
): boolean {
  // 匿名用户：仅本人可操作
  if (!operator.userId) {
    return operator.author.id === targetAuthorId;
  }
  // 已登录用户：本人或管理员均可操作（当前系统所有登录用户均有管理权限，后续可细化）
  return true;
}

/** 编辑正文或删除评论时只允许评论发送者本人，管理员也不绕过此边界。 */
export function canEditOrDeleteComment(
  operator: CommentAuthorResult,
  targetAuthorId: string,
): boolean {
  return Boolean(operator.author.id && targetAuthorId && operator.author.id === targetAuthorId);
}
