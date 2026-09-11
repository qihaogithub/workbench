import { NextRequest } from "next/server";

jest.mock("@/lib/auth/jwt", () => ({
  createToken: jest.fn(),
  setAuthCookieOnResponse: jest.fn(),
}));
jest.mock("@/lib/user", () => ({
  findOrCreateUserByDingtalkIdentity: jest.fn(),
}));

describe("DingTalk multi-environment login completion", () => {
  const envKeys = [
    "DINGTALK_CORP_ID",
    "DINGTALK_LOGIN_TARGET_ID",
    "DINGTALK_LOGIN_HANDOFF_SECRET",
    "DINGTALK_LOGIN_TARGETS_JSON",
  ];
  const previousValues = new Map<string, string | undefined>();

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    for (const key of envKeys) previousValues.set(key, process.env[key]);
    process.env.DINGTALK_CORP_ID = "ding-corp";
    process.env.DINGTALK_LOGIN_TARGET_ID = "dev";
    process.env.DINGTALK_LOGIN_HANDOFF_SECRET =
      "test-handoff-secret-with-at-least-32-bytes";
    process.env.DINGTALK_LOGIN_TARGETS_JSON = JSON.stringify({
      dev: "http://10.0.0.11:4200",
    });
  });

  afterEach(() => {
    for (const key of envKeys) {
      const value = previousValues.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    jest.restoreAllMocks();
  });

  async function createHandoff() {
    const {
      createDingtalkLoginHandoff,
      createDingtalkOAuthState,
      verifyDingtalkOAuthState,
    } = await import("@/lib/dingtalk-login-handoff");
    const created = await createDingtalkOAuthState("/demo/project-1");
    const state = await verifyDingtalkOAuthState(created.state);
    const handoff = await createDingtalkLoginHandoff(state, {
      corpId: "ding-corp",
      dingtalkUserId: "openid-1",
      unionId: "union-1",
      name: "Ding User",
      raw: {},
    });
    return { handoff, nonce: created.nonce };
  }

  it("creates the local session only after the browser nonce matches", async () => {
    const { handoff, nonce } = await createHandoff();
    const { findOrCreateUserByDingtalkIdentity } = await import("@/lib/user");
    const { createToken, setAuthCookieOnResponse } = await import(
      "@/lib/auth/jwt"
    );
    (findOrCreateUserByDingtalkIdentity as jest.Mock).mockResolvedValue({
      created: true,
      identity: { id: "identity-1" },
      user: { id: "user-1", username: "dt_user_1", role: "editor" },
    });
    (createToken as jest.Mock).mockResolvedValue("jwt-token");

    const { GET } = await import("./route");
    const request = new NextRequest(
      "http://10.0.0.11:4200/api/auth/dingtalk/complete?handoff=" +
        encodeURIComponent(handoff),
      { headers: { cookie: "dingtalk_oauth_state=" + nonce } },
    );
    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://10.0.0.11:4200/demo/project-1",
    );
    expect(findOrCreateUserByDingtalkIdentity).toHaveBeenCalledWith({
      corpId: "ding-corp",
      unionId: "union-1",
      dingtalkUserId: "openid-1",
      name: "Ding User",
      avatar: undefined,
      raw: undefined,
    });
    expect(createToken).toHaveBeenCalledWith({
      userId: "user-1",
      username: "dt_user_1",
      role: "editor",
    });
    expect(setAuthCookieOnResponse).toHaveBeenCalledWith(response, "jwt-token");
    expect(response.headers.get("set-cookie")).toContain(
      "dingtalk_oauth_state=;",
    );
  });

  it("redirects to the configured browser target instead of the Docker binding origin", async () => {
    process.env.DINGTALK_LOGIN_TARGETS_JSON = JSON.stringify({
      dev: "http://localhost:3200",
    });
    const { handoff, nonce } = await createHandoff();
    const { findOrCreateUserByDingtalkIdentity } = await import("@/lib/user");
    const { createToken } = await import("@/lib/auth/jwt");
    (findOrCreateUserByDingtalkIdentity as jest.Mock).mockResolvedValue({
      created: true,
      identity: { id: "identity-1" },
      user: { id: "user-1", username: "dt_user_1", role: "editor" },
    });
    (createToken as jest.Mock).mockResolvedValue("jwt-token");

    const { GET } = await import("./route");
    const request = new NextRequest(
      "http://0.0.0.0:3200/api/auth/dingtalk/complete?handoff=" +
        encodeURIComponent(handoff),
      {
        headers: {
          cookie: "dingtalk_oauth_state=" + nonce,
          host: "localhost:3200",
        },
      },
    );

    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3200/demo/project-1",
    );
  });

  it("rejects a handoff when the browser nonce does not match", async () => {
    const { handoff } = await createHandoff();
    const { findOrCreateUserByDingtalkIdentity } = await import("@/lib/user");
    const { GET } = await import("./route");
    const request = new NextRequest(
      "http://10.0.0.11:4200/api/auth/dingtalk/complete?handoff=" +
        encodeURIComponent(handoff),
      { headers: { cookie: "dingtalk_oauth_state=wrong" } },
    );

    const response = await GET(request);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain(
      "http://10.0.0.11:4200/login?",
    );
    expect(findOrCreateUserByDingtalkIdentity).not.toHaveBeenCalled();
  });

  it("rejects a handoff issued for a different DingTalk enterprise", async () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    const { handoff, nonce } = await createHandoff();
    process.env.DINGTALK_CORP_ID = "another-corp";
    const { findOrCreateUserByDingtalkIdentity } = await import("@/lib/user");
    const { GET } = await import("./route");
    const request = new NextRequest(
      "http://10.0.0.11:4200/api/auth/dingtalk/complete?handoff=" +
        encodeURIComponent(handoff),
      { headers: { cookie: "dingtalk_oauth_state=" + nonce } },
    );

    const response = await GET(request);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain(
      "http://10.0.0.11:4200/login?",
    );
    expect(findOrCreateUserByDingtalkIdentity).not.toHaveBeenCalled();
  });
});
