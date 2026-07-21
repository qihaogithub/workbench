import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "change-me-in-production",
);

/** token 有效期，createToken、cookie maxAge 与 CLI 返回的 expiresAt 共用同一来源 */
export const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface UserPayload {
  userId: string;
  username: string;
}

/**
 * 创建 JWT token（TOKEN_TTL_MS 过期）
 */
export async function createToken(payload: UserPayload): Promise<string> {
  return new SignJWT(payload as any)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor((Date.now() + TOKEN_TTL_MS) / 1000))
    .sign(SECRET);
}

/**
 * 验证 JWT token
 */
export async function verifyToken(token: string): Promise<UserPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
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
export function setAuthCookie(token: string): void {
  const isProduction = process.env.NODE_ENV === "production";
  const useSecureCookie =
    isProduction && process.env.USE_SECURE_COOKIE !== "false";

  cookies().set("auth_token", token, {
    httpOnly: true,
    secure: useSecureCookie,
    sameSite: "lax",
    maxAge: TOKEN_TTL_MS / 1000,
    path: "/",
  });
}

/**
 * 获取认证 Cookie
 */
export function getAuthCookie(): string | undefined {
  return cookies().get("auth_token")?.value;
}

/**
 * 清除认证 Cookie（登出）
 */
export function clearAuthCookie(): void {
  cookies().delete("auth_token");
}
