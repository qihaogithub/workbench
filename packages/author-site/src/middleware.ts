import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth/jwt";
import {
  verifyAdminSecret,
  setAdminCookie,
  hashSecret,
  getAdminSecret,
} from "@/lib/admin-auth";

const PROTECTED_PAGE_ROUTES = ["/demo", "/cli"];
const PROTECTED_API_ROUTES = ["/api/sessions"];
const AUTH_ROUTES = ["/login", "/register"];
const ADMIN_ROUTES = ["/admin"];
const ADMIN_API_ROUTES = ["/api/admin/"];
const DEFAULT_CORS_ORIGINS = ["http://localhost:3300", "http://127.0.0.1:3300"];

function getAllowedCorsOrigins(): string[] {
  const configured = (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return Array.from(new Set([...DEFAULT_CORS_ORIGINS, ...configured]));
}

function applyCorsHeaders(headers: Headers, origin: string) {
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS",
  );
  headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );
  headers.set("Access-Control-Allow-Credentials", "true");
}

function applyPublicModuleCorsHeaders(headers: Headers) {
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
}

export async function middleware(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  const user = token ? await verifyToken(token) : null;
  const pathname = request.nextUrl.pathname;
  const origin = request.headers.get("origin");
  const isPreviewRuntimeModuleRoute =
    pathname.startsWith("/preview-runtime/") ||
    pathname.startsWith("/api/preview-modules/");
  const isApiOrEmbedRoute =
    pathname.startsWith("/api/") ||
    pathname.startsWith("/embed/") ||
    pathname.startsWith("/viewer/") ||
    pathname.startsWith("/data/");
  const allowedCorsOrigin =
    origin && isApiOrEmbedRoute && getAllowedCorsOrigins().includes(origin)
      ? origin
      : null;

  if (isPreviewRuntimeModuleRoute && request.method === "OPTIONS") {
    const headers = new Headers();
    applyPublicModuleCorsHeaders(headers);
    return new NextResponse(null, { status: 204, headers });
  }

  if (allowedCorsOrigin && request.method === "OPTIONS") {
    const headers = new Headers();
    applyCorsHeaders(headers, allowedCorsOrigin);
    return new NextResponse(null, { status: 204, headers });
  }

  if (user && AUTH_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // 对页面路由：未登录重定向到登录页
  if (
    !user &&
    PROTECTED_PAGE_ROUTES.some((route) => pathname.startsWith(route))
  ) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 对 API 路由：未登录返回 401 JSON，不重定向
  if (
    !user &&
    PROTECTED_API_ROUTES.some((route) => pathname.startsWith(route))
  ) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "未登录" } },
      { status: 401 },
    );
  }

  // Admin 路由鉴权
  if (
    ADMIN_ROUTES.some((route) => pathname.startsWith(route)) ||
    ADMIN_API_ROUTES.some((route) => pathname.startsWith(route))
  ) {
    const isAdmin = await verifyAdminSecret(request);

    if (!isAdmin) {
      // 未授权访问管理后台
      return NextResponse.json(
        {
          success: false,
          error: { code: "UNAUTHORIZED", message: "未授权访问管理后台" },
        },
        { status: 401 },
      );
    }

    // 验证通过,如果是通过 URL 参数访问的,设置 Cookie
    const secretParam = request.nextUrl.searchParams.get("secret");
    if (secretParam && pathname.startsWith("/admin")) {
      const response = NextResponse.next();
      // 设置 admin_token Cookie (异步)
      const cookieValue = await hashSecret(getAdminSecret());
      response.cookies.set("admin_token", cookieValue, {
        httpOnly: true,
        secure:
          process.env.NODE_ENV === "production" &&
          process.env.USE_SECURE_COOKIE !== "false",
        sameSite: "lax",
        maxAge: 2 * 60 * 60, // 2 小时
        path: "/",
      });
      return response;
    }
  }

  const response = NextResponse.next();

  if (isPreviewRuntimeModuleRoute) {
    applyPublicModuleCorsHeaders(response.headers);
  }

  if (allowedCorsOrigin) {
    applyCorsHeaders(response.headers, allowedCorsOrigin);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
