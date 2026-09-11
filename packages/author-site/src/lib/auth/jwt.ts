import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { requireSecret } from "@workbench/runtime-config/secrets";

function getSecret(): Uint8Array {
  return new TextEncoder().encode(requireSecret("JWT_SECRET"));
}

export function getAuthCookieName(): string {
  return process.env.AUTH_COOKIE_NAME || "auth_token";
}

/**
 * Extract a JWT from a standard Bearer authorization header.
 *
 * Remote clients use this form so that authentication does not depend on the
 * browser cookie name configured by the target author-site deployment.
 */
export function extractBearerToken(
  authorization: string | null | undefined,
): string | undefined {
  const match = authorization?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1];
}

/** token 有效期，createToken、cookie maxAge 与 CLI 返回的 expiresAt 共用同一来源 */
export const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function getAuthCookieOptions() {
  const isProduction = process.env.NODE_ENV === "production";
  const useSecureCookie =
    isProduction && process.env.USE_SECURE_COOKIE !== "false";

  return {
    httpOnly: true,
    secure: useSecureCookie,
    sameSite: "lax" as const,
    maxAge: TOKEN_TTL_MS / 1000,
    path: "/",
  };
}

export interface UserPayload {
  userId: string;
  username: string;
  role?: "admin" | "editor";
}

/**
 * 创建 JWT token（TOKEN_TTL_MS 过期）
 */
export async function createToken(payload: UserPayload): Promise<string> {
  return new SignJWT(payload as any)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor((Date.now() + TOKEN_TTL_MS) / 1000))
    .sign(getSecret());
}

/**
 * 验证 JWT token
 */
export async function verifyToken(token: string): Promise<UserPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as UserPayload;
  } catch {
    return null;
  }
}

/**
 * 设置认证 Cookie（httpOnly，7 天）
 *
 * Secure 标志说明：
 * - 生产环境默认启用 secure（需要 HTTPS）
 * - 可通过 USE_SECURE_COOKIE=false 禁用（适用于 HTTP 内网部署）
 * - 示例：USE_SECURE_COOKIE=false docker-compose up -d
 */
export async function setAuthCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(getAuthCookieName(), token, getAuthCookieOptions());
}

/** Attach the browser auth cookie to a response such as an OAuth redirect. */
export function setAuthCookieOnResponse(
  response: { cookies: { set: (name: string, value: string, options: ReturnType<typeof getAuthCookieOptions>) => void } },
  token: string,
): void {
  response.cookies.set(getAuthCookieName(), token, getAuthCookieOptions());
}

/**
 * 获取请求认证 Token。
 *
 * Browser requests continue to use the configured httpOnly cookie.  Remote
 * CLI requests can use Authorization: Bearer when no cookie is present.  The
 * cookie remains authoritative to preserve existing browser semantics.
 */
export async function getAuthCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(getAuthCookieName())?.value;
  if (cookieToken) return cookieToken;

  const requestHeaders = await headers();
  return extractBearerToken(requestHeaders.get("authorization"));
}

/**
 * 清除认证 Cookie（登出）
 */
export async function clearAuthCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(getAuthCookieName());
}
