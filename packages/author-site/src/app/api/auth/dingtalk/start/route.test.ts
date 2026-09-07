import { NextRequest } from "next/server";

describe("DingTalk browser OAuth start route", () => {
  const envKeys = [
    "DINGTALK_LOGIN_ENABLED",
    "DINGTALK_CORP_ID",
    "DINGTALK_APP_KEY",
    "DINGTALK_APP_SECRET",
    "DINGTALK_LOGIN_REDIRECT_URI",
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
  });

  afterEach(() => {
    for (const key of envKeys) {
      const value = previousValues.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("redirects to DingTalk and stores state plus a safe post-login path", async () => {
    const { GET } = await import("./route");
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
    expect(authorizationUrl.searchParams.get("state")).toBeTruthy();
    expect(response.headers.get("set-cookie")).toContain(
      "dingtalk_oauth_state=",
    );
    expect(response.headers.get("set-cookie")).toContain(
      "dingtalk_oauth_redirect=%2Fdemo%2Fproject-1",
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
});
