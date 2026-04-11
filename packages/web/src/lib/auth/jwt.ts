import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "change-me-in-production",
);

export interface UserPayload {
  userId: string;
  username: string;
}

/**
 * 创建 JWT token（7 天过期）
 */
export async function createToken(payload: UserPayload): Promise<string> {
  return new SignJWT(payload as any)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
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
 */
export function setAuthCookie(token: string): void {
  cookies().set("auth_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60,
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
