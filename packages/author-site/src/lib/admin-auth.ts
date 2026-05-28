/**
 * Admin Secret 鉴权模块
 *
 * 提供管理后台的访问控制,通过独立的 Admin Secret 进行验证
 * 支持 URL 参数和 Cookie 两种验证方式
 *
 * 注意: 此模块在 Edge Runtime (middleware) 中运行,不能使用 Node.js 的 crypto 模块
 */

import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const ADMIN_COOKIE_NAME = "admin_token";
const ADMIN_COOKIE_MAX_AGE = 2 * 60 * 60; // 2 小时

/**
 * 获取 Admin Secret (从环境变量)
 */
export function getAdminSecret(): string {
  return process.env.ADMIN_SECRET || "admin-change-this-to-random-string";
}

/**
 * 简单的哈希函数 (Edge Runtime 兼容)
 * 使用 Web Crypto API 替代 Node.js crypto
 */
export async function hashSecret(secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(secret);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * 验证 Admin Secret (从 URL 参数或 Cookie)
 */
export async function verifyAdminSecret(
  request: NextRequest,
): Promise<boolean> {
  const secretParam = request.nextUrl.searchParams.get("secret");
  const adminCookie = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  const expectedHash = await hashSecret(getAdminSecret());

  // 优先验证 URL 参数
  if (secretParam) {
    return hashSecret(secretParam).then((hash) => hash === expectedHash);
  }

  // 其次验证 Cookie
  if (adminCookie) {
    return adminCookie === expectedHash;
  }

  return false;
}

/**
 * 验证 API 请求 (从 Authorization header 或 Cookie)
 */
export async function verifyAdminRequest(request: Request): Promise<boolean> {
  const authHeader = request.headers.get("authorization");
  const cookieHeader = request.headers.get("cookie");
  const expectedHash = await hashSecret(getAdminSecret());

  // 验证 Bearer Token
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const tokenHash = await hashSecret(token);
    return tokenHash === expectedHash;
  }

  // 验证 Cookie
  if (cookieHeader) {
    const cookieMatch = cookieHeader.match(
      new RegExp(`${ADMIN_COOKIE_NAME}=([^;]+)`),
    );
    if (cookieMatch && cookieMatch[1] === expectedHash) {
      return true;
    }
  }

  return false;
}

/**
 * 设置 Admin Cookie (验证通过后)
 */
export async function setAdminCookie(): Promise<void> {
  const cookieStore = cookies();
  const hash = await hashSecret(getAdminSecret());
  cookieStore.set(ADMIN_COOKIE_NAME, hash, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: ADMIN_COOKIE_MAX_AGE,
    path: "/",
  });
}

/**
 * 清除 Admin Cookie (登出)
 */
export function clearAdminCookie(): void {
  cookies().delete(ADMIN_COOKIE_NAME);
}

/**
 * Middleware 辅助: 验证并设置 Cookie 或返回 401
 */
export async function withAdminAuth(
  request: NextRequest,
  handler: () => NextResponse | Promise<NextResponse>,
): Promise<NextResponse> {
  const isAdmin = await verifyAdminSecret(request);

  if (!isAdmin) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "未授权访问" },
      },
      { status: 401 },
    );
  }

  // 如果是通过 URL 参数验证的,设置 Cookie
  const secretParam = request.nextUrl.searchParams.get("secret");
  if (secretParam) {
    await setAdminCookie();
  }

  return handler();
}
