import { NextRequest } from "next/server";

describe("DingTalk browser OAuth start route", () => {
  const envKeys = [
    "DINGTALK_LOGIN_ENABLED",
    "DINGTALK_CORP_ID",
    "DINGTALK_APP_KEY",
    "DINGTALK_APP_SECRET",
    "DINGTALK_LOGIN_REDIRECT_URI",
    "DINGTALK_LOGIN_TARGET_ID",
    "DINGTALK_LOGIN_HANDOFF_SECRET",
  ];
  const previousValues = new Map<string, string | undefined>();

  beforeEach(() => {
    jest.resetModules();
    for (const key of envKeys) previousValues.set(key, process.env[key]);
    process.env.DINGTALK_LOGIN_ENABLED = "true";
    process.env.DINGTALK_CORP_ID = "ding-corp";
    process.env.DINGTALK_APP_KEY = "app-key";
    process.env.DINGTALK_APP_SECRET = "app-secret";
    process.env.DINGTALK_LOGIN_REDIRECT_URI =
      "http://localhost:4200/api/auth/dingtalk/callback";
    process.env.DINGTALK_LOGIN_TARGET_ID = "dev";
    process.env.DINGTALK_LOGIN_HANDOFF_SECRET =
      "test-handoff-secret-with-at-least-32-bytes";
  });

  afterEach(() => {
    for (const key of envKeys) {
      const value = previousValues.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("redirects to DingTalk with signed state and stores its browser nonce", async () => {
    const { GET } = await import("./route");
    const { verifyDingtalkOAuthState } = await import(
      "@/lib/dingtalk-login-handoff"
    );
    const request = new NextRequest(
      "http://localhost:4200/api/auth/dingtalk/start?redirect=%2Fdemo%2Fproject-1",
    );

    const response = await GET(request);
    const location = response.headers.get("location");
    expect(response.status).toBe(307);
    expect(location).toBeTruthy();

    const authorizationUrl = new URL(location!);
    expect(authorizationUrl.origin + authorizationUrl.pathname).toBe(
      "https://login.dingtalk.com/oauth2/auth",
    );
    expect(authorizationUrl.searchParams.get("client_id")).toBe("app-key");
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(
      "http://localhost:4200/api/auth/dingtalk/callback",
    );
    const state = authorizationUrl.searchParams.get("state");
    expect(state).toBeTruthy();
    const verifiedState = await verifyDingtalkOAuthState(state!);
    expect(verifiedState).toMatchObject({
      targetId: "dev",
      redirectPath: "/demo/project-1",
    });
    expect(response.headers.get("set-cookie")).toContain(
      `dingtalk_oauth_state=${verifiedState.nonce}`,
    );
  });

  it("rejects browser OAuth when the callback URI is missing", async () => {
    delete process.env.DINGTALK_LOGIN_REDIRECT_URI;
    const { GET } = await import("./route");
    const response = await GET(
      new NextRequest("http://localhost:4200/api/auth/dingtalk/start"),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: "INTERNAL_ERROR" },
    });
  });

  it("rejects browser OAuth when the multi-environment handoff is missing", async () => {
    delete process.env.DINGTALK_LOGIN_HANDOFF_SECRET;
    const { GET } = await import("./route");
    const response = await GET(
      new NextRequest("http://localhost:4200/api/auth/dingtalk/start"),
    );

    expect(response.status).toBe(503);
  });
});
