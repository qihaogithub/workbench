import type { ProjectAdminActor } from "@workbench/project-core";
import { getAuthCookie, getAuthCookieName, verifyToken, type UserPayload } from "@/lib/auth/jwt";
import { findUserById, type User } from "@/lib/user";

export async function getCurrentUser(): Promise<User | null> {
  const token = await getAuthCookie();
  if (!token) return null;
  const payload = await verifyToken(token);
  return payload ? findUserById(payload.userId) : null;
}

export async function getCurrentUserFromRequest(request: Request): Promise<User | null> {
  const authorization = request.headers.get("authorization");
  let token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
  if (!token) {
    const cookie = request.headers.get("cookie") ?? "";
    const cookieName = getAuthCookieName().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    token = cookie.match(new RegExp(`(?:^|;\\s*)${cookieName}=([^;]+)`))?.[1];
  }
  if (!token) return null;
  const payload = await verifyToken(token);
  return payload ? findUserById(payload.userId) : null;
}

export function toProjectAdminActor(user: Pick<User, "id" | "username" | "role">): ProjectAdminActor {
  return {
    id: user.id,
    name: user.username,
    role: user.role === "admin" ? "admin" : "creator",
    source: "author-site",
  };
}

/** Resolve the authenticated caller for project-domain APIs. */
export async function getCurrentProjectActor(): Promise<ProjectAdminActor | null> {
  const user = await getCurrentUser();
  return user ? toProjectAdminActor(user) : null;
}

export function isAdminUser(user: Pick<User, "role"> | null | undefined): boolean {
  return user?.role === "admin";
}

export type { UserPayload };
