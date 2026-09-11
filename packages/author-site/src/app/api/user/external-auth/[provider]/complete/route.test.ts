import type { NextRequest } from "next/server";

jest.mock("@/lib/auth/jwt", () => ({
  getAuthCookie: jest.fn().mockResolvedValue(null),
  verifyToken: jest.fn(),
}));

jest.mock("@/lib/figma-oauth-handoff", () => ({
  getFigmaOAuthCallbackOrigin: jest.fn(),
  getFigmaOAuthHandoffSecret: jest.fn(),
  getFigmaOAuthPostAuthOrigin: jest.fn(() => "http://10.131.75.39:3200"),
  getFigmaOAuthTargetId: jest.fn(),
}));

jest.mock("@/lib/external-auth", () => ({
  readExternalAuthSessionConfigWithRefresh: jest.fn(),
  upsertExternalAuthConfig: jest.fn(),
}));

jest.mock("@/lib/session-manager", () => ({
  listActiveSessionsForUser: jest.fn(() => []),
}));

jest.mock("@/lib/agent-providers", () => ({
  pushSessionExternalAuthToAgent: jest.fn(),
}));

describe("Figma OAuth completion redirect", () => {
  const previousPostAuthOrigin = process.env.FIGMA_OAUTH_POST_AUTH_ORIGIN;

  beforeEach(() => {
    jest.resetModules();
    process.env.FIGMA_OAUTH_POST_AUTH_ORIGIN = "http://10.131.75.39:3200";
  });

  afterEach(() => {
    if (previousPostAuthOrigin === undefined) {
      delete process.env.FIGMA_OAUTH_POST_AUTH_ORIGIN;
    } else {
      process.env.FIGMA_OAUTH_POST_AUTH_ORIGIN = previousPostAuthOrigin;
    }
  });

  it("does not redirect the browser to the wildcard bind address", async () => {
    const { GET } = await import("./route");
    const requestUrl =
      "http://0.0.0.0:3200/api/user/external-auth/figma/complete?handoff=ticket";
    const response = await GET(
      {
        url: requestUrl,
        nextUrl: new URL(requestUrl),
        cookies: { get: () => undefined },
      } as unknown as NextRequest,
      { params: Promise.resolve({ provider: "figma" }) },
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://10.131.75.39:3200/workbench?externalAuth=failed",
    );
  });
});
