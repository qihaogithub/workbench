import type { NextRequest } from "next/server";

jest.mock("@/lib/agent-providers", () => ({
  pushSessionExternalAuthToAgent: jest.fn(),
}));

jest.mock("@/lib/external-auth", () => ({
  readExternalAuthSessionConfigWithRefresh: jest.fn(),
  upsertExternalAuthConfig: jest.fn(),
}));

jest.mock("@/lib/session-manager", () => ({
  listActiveSessionsForUser: jest.fn(() => []),
}));

class TestResponse {
  status: number;
  headers: Headers;
  private readonly body: BodyInit | null | undefined;

  constructor(body?: BodyInit | null, init?: ResponseInit) {
    this.status = init?.status ?? 200;
    this.headers = new Headers(init?.headers);
    this.body = body;
  }

  async json(): Promise<unknown> {
    if (typeof this.body !== "string") return null;
    return JSON.parse(this.body);
  }

  static json(body: unknown, init?: ResponseInit): TestResponse {
    return new TestResponse(JSON.stringify(body), init);
  }
}

describe("Figma OAuth callback route", () => {
  const originalResponse = global.Response;
  const previousRedirectUri = process.env.FIGMA_OAUTH_REDIRECT_URI;
  const previousPostAuthOrigin = process.env.FIGMA_OAUTH_POST_AUTH_ORIGIN;

  beforeEach(() => {
    jest.resetModules();
    global.Response = TestResponse as unknown as typeof Response;
  });

  afterEach(() => {
    if (previousRedirectUri === undefined) {
      delete process.env.FIGMA_OAUTH_REDIRECT_URI;
    } else {
      process.env.FIGMA_OAUTH_REDIRECT_URI = previousRedirectUri;
    }
    if (previousPostAuthOrigin === undefined) {
      delete process.env.FIGMA_OAUTH_POST_AUTH_ORIGIN;
    } else {
      process.env.FIGMA_OAUTH_POST_AUTH_ORIGIN = previousPostAuthOrigin;
    }
    global.Response = originalResponse;
  });

  it("redirects back to the configured public origin after tunnel callbacks", async () => {
    process.env.FIGMA_OAUTH_REDIRECT_URI =
      "https://figma-oauth.example.com/api/user/external-auth/figma/callback";

    const { GET } = await import("./route");
    const requestUrl = "https://localhost:3200/api/user/external-auth/figma/callback";
    const response = await GET(
      {
        url: requestUrl,
        nextUrl: new URL(requestUrl),
      } as NextRequest,
      { params: { provider: "figma" } },
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://figma-oauth.example.com/?externalAuth=failed",
    );
  });

  it("prefers the configured post-auth origin for local development", async () => {
    process.env.FIGMA_OAUTH_REDIRECT_URI =
      "https://figma-oauth.example.com/api/user/external-auth/figma/callback";
    process.env.FIGMA_OAUTH_POST_AUTH_ORIGIN = "http://localhost:3200";

    const { GET } = await import("./route");
    const requestUrl = "https://localhost:3200/api/user/external-auth/figma/callback";
    const response = await GET(
      {
        url: requestUrl,
        nextUrl: new URL(requestUrl),
      } as NextRequest,
      { params: { provider: "figma" } },
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3200/?externalAuth=failed",
    );
  });
});
