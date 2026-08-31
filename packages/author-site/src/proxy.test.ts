import type { NextRequest } from "next/server";
import { TextDecoder, TextEncoder } from "util";
import { ReadableStream, TransformStream } from "stream/web";

let proxy: typeof import("./proxy").proxy;
let config: typeof import("./proxy").config;

const verifyToken = jest.fn();
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
    expect(response.headers.get("location")).toBe("http://localhost/");
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
