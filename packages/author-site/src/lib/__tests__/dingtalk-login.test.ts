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
});
