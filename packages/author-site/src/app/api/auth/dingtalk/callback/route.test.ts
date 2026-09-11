import { NextRequest } from "next/server";

jest.mock("@/lib/dingtalk-login", () => ({
  exchangeDingtalkBrowserAuthCode: jest.fn(),
}));

describe("DingTalk browser OAuth callback route", () => {
  const envKeys = [
    "DINGTALK_LOGIN_TARGET_ID",
    "DINGTALK_LOGIN_HANDOFF_SECRET",
    "DINGTALK_LOGIN_TARGETS_JSON",
  ];
  const previousValues = new Map<string, string | undefined>();

  beforeEach(() => {
    jest.resetModules();
    for (const key of envKeys) previousValues.set(key, process.env[key]);
    process.env.DINGTALK_LOGIN_TARGET_ID = "hub";
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
  });

  it("rejects a callback whose signed OAuth state is invalid", async () => {
    const { GET } = await import("./route");
    const request = new NextRequest(
      "http://localhost:4200/api/auth/dingtalk/callback?authCode=code&state=wrong",
    );

    const response = await GET(request);
    expect(response.status).toBe(400);
  });

  it("exchanges the code and hands the safe profile to the target environment", async () => {
    const { GET } = await import("./route");
    const { exchangeDingtalkBrowserAuthCode } = await import(
      "@/lib/dingtalk-login"
    );
    const {
      createDingtalkOAuthState,
      verifyDingtalkLoginHandoff,
    } = await import("@/lib/dingtalk-login-handoff");

    (exchangeDingtalkBrowserAuthCode as jest.Mock).mockResolvedValue({
      corpId: "ding-corp",
      dingtalkUserId: "openid-1",
      unionId: "union-1",
      name: "Ding User",
      raw: { accessToken: "must-not-leak" },
    });
    process.env.DINGTALK_LOGIN_TARGET_ID = "dev";
    const { state } = await createDingtalkOAuthState("/demo/project-1");
    process.env.DINGTALK_LOGIN_TARGET_ID = "hub";

    const request = new NextRequest(
      `http://localhost:4200/api/auth/dingtalk/callback?authCode=browser-code&state=${encodeURIComponent(state)}`,
    );
    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.origin + location.pathname).toBe(
      "http://10.0.0.11:4200/api/auth/dingtalk/complete",
    );
    const handoff = location.searchParams.get("handoff");
    expect(handoff).toBeTruthy();
    await expect(
      verifyDingtalkLoginHandoff(handoff!, "dev"),
    ).resolves.toMatchObject({
      targetId: "dev",
      redirectPath: "/demo/project-1",
      profile: {
        corpId: "ding-corp",
        unionId: "union-1",
        dingtalkUserId: "openid-1",
        name: "Ding User",
      },
    });
    expect(exchangeDingtalkBrowserAuthCode).toHaveBeenCalledWith(
      "browser-code",
    );
  });
});
