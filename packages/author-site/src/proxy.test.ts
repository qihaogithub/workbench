import type { NextRequest } from "next/server";
import { TextDecoder, TextEncoder } from "util";
import { ReadableStream, TransformStream } from "stream/web";

let proxy: typeof import("./proxy").proxy;
let config: typeof import("./proxy").config;

const verifyToken = jest.fn();
const findUserById = jest.fn();
jest.mock("@/lib/user", () => ({ findUserById }));
const getAuthCookieName = jest.fn(() => "auth_token");
const extractBearerToken = jest.fn((authorization: string | null | undefined) => {
  const match = authorization?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1];
});
const verifyAdminSecret = jest.fn();
const hashSecret = jest.fn(async (secret: string) => `hash:${secret}`);
const getAdminSecret = jest.fn(() => "admin-secret");

jest.mock("@/lib/auth/jwt", () => ({
  getAuthCookieName,
  extractBearerToken,
  verifyToken,
}));

jest.mock("@/lib/admin-auth", () => ({
  verifyAdminSecret,
  setAdminCookie: jest.fn(),
  hashSecret,
  getAdminSecret,
}));

function request(
  path: string,
  options: {
    method?: string;
    origin?: string;
    cookie?: string;
    authorization?: string;
  } = {},
) {
  const headers = new Headers();
  if (options.origin) headers.set("origin", options.origin);
  if (options.cookie) headers.set("cookie", options.cookie);
  if (options.authorization) headers.set("authorization", options.authorization);
  const url = new URL(path, "http://localhost");
  return {
    cookies: {
      get: (name: string) => {
        const value = options.cookie
          ?.split(";")
          .map((part) => part.trim().split("="))
          .find(([cookieName]) => cookieName === name)?.[1];
        return value ? { name, value } : undefined;
      },
    },
    headers,
    method: options.method ?? "GET",
    nextUrl: url,
    url: url.toString(),
  } as unknown as NextRequest;
}

describe("proxy authentication and CORS contract", () => {
  beforeAll(async () => {
    // Next's NextResponse module expects Request, while author-site's Jest
    // jsdom environment does not install the Node fetch globals.
    globalThis.TextEncoder = TextEncoder;
    globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
    globalThis.ReadableStream = ReadableStream as typeof globalThis.ReadableStream;
    globalThis.TransformStream = TransformStream as typeof globalThis.TransformStream;
    const {
      Request: NodeRequest,
      Response: NodeResponse,
      Headers: NodeHeaders,
    } = require("undici");
    globalThis.Request = NodeRequest;
    globalThis.Response = NodeResponse;
    globalThis.Headers = NodeHeaders;
    ({ proxy, config } = await import("./proxy"));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.CORS_ORIGINS;
    extractBearerToken.mockImplementation((authorization) => {
      const match = authorization?.match(/^Bearer\s+(\S+)$/i);
      return match?.[1];
    });
    verifyToken.mockResolvedValue(null);
    findUserById.mockReturnValue({ id: "u1", username: "alice", role: "editor" });
    verifyAdminSecret.mockResolvedValue(false);
  });

  it("redirects unauthenticated protected pages to login with the original path", async () => {
    const response = await proxy(request("/demo/project-1"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?redirect=%2Fdemo%2Fproject-1",
    );
  });

  it("redirects an authenticated user away from the login page", async () => {
    verifyToken.mockResolvedValue({ userId: "u1", username: "alice" });

    const response = await proxy(request("/login", { cookie: "auth_token=valid" }));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/workbench");
  });

  it("用户已不存在时清除 Cookie 并进入登录页，不再跳回工作台", async () => {
    verifyToken.mockResolvedValue({ userId: "deleted", username: "alice" });
    findUserById.mockReturnValue(null);
    const options = { cookie: "auth_token=valid" };
    const response = await proxy(request("/workbench?tab=templates", options));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?redirect=%2Fworkbench%3Ftab%3Dtemplates",
    );
    expect(response.cookies.get("auth_token")).toMatchObject({ value: "", path: "/" });
    const login = await proxy(request("/login?redirect=%2Fworkbench", options));
    expect(login.status).toBe(200);
    expect(login.headers.get("location")).toBeNull();
    expect(login.cookies.get("auth_token")?.expires).toEqual(new Date(0));
    expect(findUserById).toHaveBeenCalledWith("deleted");
  });

  it.each(["/", "/register"])("失效用户访问 %s 不跳转工作台", async (route) => {
    verifyToken.mockResolvedValue({ userId: "deleted" });
    findUserById.mockReturnValue(null);
    const response = await proxy(request(route, { cookie: "auth_token=valid" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("失效 Cookie 优先于有效 Bearer，不回退到另一身份", async () => {
    verifyToken.mockResolvedValue(null);
    const response = await proxy(request("/workbench", {
      cookie: "auth_token=expired", authorization: "Bearer valid",
    }));
    expect(response.status).toBe(307);
    expect(verifyToken).toHaveBeenCalledWith("expired");
    expect(findUserById).not.toHaveBeenCalled();
  });

  it("用户已不存在的 Bearer 请求返回 401，公开资源不查询用户", async () => {
    verifyToken.mockResolvedValue({ userId: "deleted" });
    findUserById.mockReturnValue(null);
    const response = await proxy(request("/api/sessions", { authorization: "Bearer valid" }));
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
    findUserById.mockClear();
    await proxy(request("/manual", { cookie: "auth_token=valid" }));
    expect(findUserById).not.toHaveBeenCalled();
  });

  it("redirects an unauthenticated workbench deep link with its query string", async () => {
    const response = await proxy(request("/workbench?tab=templates"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?redirect=%2Fworkbench%3Ftab%3Dtemplates",
    );
  });

  it("redirects an authenticated visitor from the public homepage to the workbench", async () => {
    verifyToken.mockResolvedValue({ userId: "u1", username: "alice" });

    const response = await proxy(request("/", { cookie: "auth_token=valid" }));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/workbench");
  });

  it("keeps the public manual available without authentication", async () => {
    const response = await proxy(request("/manual/quick-start"));

    expect(response.status).toBe(200);
  });

  it("returns the sessions API contract instead of redirecting", async () => {
    const response = await proxy(request("/api/sessions"));

    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: { code: "UNAUTHORIZED", message: "未登录" },
    });
  });

  it("accepts a Bearer token when the configured cookie is absent", async () => {
    extractBearerToken.mockReturnValue("bearer-token");
    verifyToken.mockResolvedValue({ userId: "u1", username: "alice" });

    const response = await proxy(
      request("/api/sessions", { authorization: "Bearer bearer-token" }),
    );

    expect(response.status).toBe(200);
    expect(extractBearerToken).toHaveBeenCalledWith("Bearer bearer-token");
    expect(verifyToken).toHaveBeenCalledWith("bearer-token");
  });

  it("sets the admin cookie when an admin page is authorized by secret", async () => {
    verifyAdminSecret.mockResolvedValue(true);

    const response = await proxy(request("/admin?secret=admin-secret"));

    expect(response.status).toBe(200);
    expect(response.cookies.get("admin_token")).toMatchObject({
      value: "hash:admin-secret",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 7200,
      path: "/",
    });
  });

  it("applies configured CORS headers to an allowed ordinary API origin", async () => {
    process.env.CORS_ORIGINS = "https://app.example.com";

    const response = await proxy(
      request("/api/projects", {
        origin: "https://app.example.com",
        method: "GET",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://app.example.com",
    );
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
    expect(response.headers.get("access-control-allow-methods")).toContain("PATCH");
  });

  it("handles preview module preflight with public module CORS", async () => {
    const response = await proxy(
      request("/api/preview-modules/react.js", {
        origin: "https://anything.example.com",
        method: "OPTIONS",
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
    expect(response.headers.get("access-control-allow-private-network")).toBe("true");
  });

  it("exposes preview module CORS on normal module responses", async () => {
    const response = await proxy(request("/preview-runtime/vendor/sdk.js"));

    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
  });

  it("keeps the broad proxy matcher while excluding Next internals and favicon", () => {
    expect(config.matcher).toEqual(["/((?!_next/static|_next/image|favicon.ico).*)"]);
  });
});
