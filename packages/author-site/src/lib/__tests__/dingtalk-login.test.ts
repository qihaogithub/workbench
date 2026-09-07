import fs from "fs";
import os from "os";
import path from "path";

describe("DingTalk enterprise login", () => {
  let dataDir: string;

  beforeEach(() => {
    jest.resetModules();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ow-dingtalk-login-"));
    process.env.DATA_DIR = dataDir;
    process.env.JWT_SECRET = "test-secret";
    process.env.DINGTALK_LOGIN_ENABLED = "true";
    process.env.DINGTALK_CORP_ID = "ding-corp";
    process.env.DINGTALK_APP_KEY = "app-key";
    process.env.DINGTALK_APP_SECRET = "app-secret";
    process.env.DINGTALK_LOGIN_REDIRECT_URI =
      "http://localhost:4200/api/auth/dingtalk/callback";
  });

  afterEach(async () => {
    const { closeDb } = await import("@/lib/db");
    closeDb();
    fs.rmSync(dataDir, { recursive: true, force: true });
    jest.restoreAllMocks();
    Reflect.deleteProperty(global, "fetch");
    delete process.env.DATA_DIR;
    delete process.env.JWT_SECRET;
    delete process.env.DINGTALK_LOGIN_ENABLED;
    delete process.env.DINGTALK_CORP_ID;
    delete process.env.DINGTALK_APP_KEY;
    delete process.env.DINGTALK_APP_SECRET;
    delete process.env.DINGTALK_LOGIN_REDIRECT_URI;
  });

  it("exchanges auth code and reuses the same local user", async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1.0/oauth2/accessToken")) {
        return {
          ok: true,
          json: async () => ({ accessToken: "app-token", expireIn: 7200 }),
        } as Response;
      }
      if (url.includes("/topapi/v2/user/getuserinfo")) {
        return {
          ok: true,
          json: async () => ({
            errcode: 0,
            result: {
              userid: "ding-user-1",
              unionid: "union-1",
            },
          }),
        } as Response;
      }
      if (url.includes("/topapi/v2/user/get")) {
        return {
          ok: true,
          json: async () => ({
            errcode: 0,
            result: {
              userid: "ding-user-1",
              unionid: "union-1",
              name: "Ding User",
              avatar: "https://example.test/avatar.png",
            },
          }),
        } as Response;
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    (global as typeof globalThis & { fetch: typeof fetch }).fetch =
      fetchMock as unknown as typeof fetch;

    const { exchangeDingtalkAuthCode } = await import("@/lib/dingtalk-login");
    const { findOrCreateUserByDingtalkIdentity, findDingtalkIdentityByUserId } =
      await import("@/lib/user");

    const profile = await exchangeDingtalkAuthCode("auth-code");
    expect(profile).toMatchObject({
      corpId: "ding-corp",
      dingtalkUserId: "ding-user-1",
      unionId: "union-1",
      name: "Ding User",
    });

    const first = await findOrCreateUserByDingtalkIdentity({
      corpId: profile.corpId,
      unionId: profile.unionId,
      dingtalkUserId: profile.dingtalkUserId,
      name: profile.name,
      avatar: profile.avatar,
      raw: profile.raw,
    });
    const second = await findOrCreateUserByDingtalkIdentity({
      corpId: profile.corpId,
      unionId: profile.unionId,
      dingtalkUserId: profile.dingtalkUserId,
      name: profile.name,
      avatar: profile.avatar,
      raw: profile.raw,
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.user.id).toBe(first.user.id);
    expect(second.user.username).toMatch(/^dt_/);
    expect(findDingtalkIdentityByUserId(first.user.id)).toMatchObject({
      corpId: "ding-corp",
      dingtalkUserId: "ding-user-1",
      unionId: "union-1",
      name: "Ding User",
    });
  });

  it("builds the browser OAuth authorization URL with the configured callback", async () => {
    const { createDingtalkOAuthAuthorizationUrl, readDingtalkLoginConfig } =
      await import("@/lib/dingtalk-login");

    const url = new URL(
      createDingtalkOAuthAuthorizationUrl(
        readDingtalkLoginConfig(),
        "state-value",
      ),
    );

    expect(url.origin + url.pathname).toBe(
      "https://login.dingtalk.com/oauth2/auth",
    );
    expect(url.searchParams.get("client_id")).toBe("app-key");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:4200/api/auth/dingtalk/callback",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("openid");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("state")).toBe("state-value");
  });

  it("exchanges a browser OAuth authCode through the user token API", async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1.0/oauth2/userAccessToken")) {
        return {
          ok: true,
          json: async () => ({ accessToken: "user-token" }),
        } as Response;
      }
      if (url.includes("/v1.0/contact/users/me")) {
        return {
          ok: true,
          json: async () => ({
            unionId: "union-browser-1",
            openId: "openid-browser-1",
            name: "Browser User",
            avatarUrl: "https://example.test/browser-avatar.png",
          }),
        } as Response;
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    (global as typeof globalThis & { fetch: typeof fetch }).fetch =
      fetchMock as unknown as typeof fetch;

    const { exchangeDingtalkBrowserAuthCode } =
      await import("@/lib/dingtalk-login");
    await expect(exchangeDingtalkBrowserAuthCode("browser-code")).resolves.toMatchObject({
      corpId: "ding-corp",
      dingtalkUserId: "openid-browser-1",
      unionId: "union-browser-1",
      name: "Browser User",
      avatar: "https://example.test/browser-avatar.png",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.dingtalk.com/v1.0/oauth2/userAccessToken",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          clientId: "app-key",
          clientSecret: "app-secret",
          code: "browser-code",
          grantType: "authorization_code",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.dingtalk.com/v1.0/contact/users/me",
      expect.objectContaining({
        headers: { "x-acs-dingtalk-access-token": "user-token" },
      }),
    );
  });
});
