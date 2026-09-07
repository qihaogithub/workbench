import { NextRequest } from "next/server";

jest.mock("@/lib/auth/jwt", () => ({
  createToken: jest.fn(),
  setAuthCookieOnResponse: jest.fn(),
}));
jest.mock("@/lib/user", () => ({
  findOrCreateUserByDingtalkIdentity: jest.fn(),
}));
jest.mock("@/lib/dingtalk-login", () => ({
  exchangeDingtalkBrowserAuthCode: jest.fn(),
}));

describe("DingTalk browser OAuth callback route", () => {
  const previousState = process.env.DINGTALK_LOGIN_REDIRECT_URI;

  beforeEach(() => {
    jest.resetModules();
    process.env.DINGTALK_LOGIN_REDIRECT_URI =
      "http://localhost:4200/api/auth/dingtalk/callback";
  });

  afterEach(() => {
    if (previousState === undefined) delete process.env.DINGTALK_LOGIN_REDIRECT_URI;
    else process.env.DINGTALK_LOGIN_REDIRECT_URI = previousState;
  });

  it("rejects a callback whose OAuth state does not match the saved state", async () => {
    const { GET } = await import("./route");
    const request = new NextRequest(
      "http://localhost:4200/api/auth/dingtalk/callback?authCode=code&state=wrong",
      {
        headers: {
          cookie:
            "dingtalk_oauth_state=expected; dingtalk_oauth_redirect=%2Fworkbench",
        },
      },
    );

    const response = await GET(request);
    const location = response.headers.get("location");
    expect(response.status).toBe(307);
    expect(location).toBe(
      "http://localhost:4200/login?redirect=%2Fworkbench&dingtalkError=%E9%92%89%E9%92%89%E6%8E%88%E6%9D%83%E7%8A%B6%E6%80%81%E5%B7%B2%E5%A4%B1%E6%95%88%EF%BC%8C%E8%AF%B7%E9%87%8D%E6%96%B0%E7%99%BB%E5%BD%95",
    );
  });

  it("creates a local session and returns to the saved path after OAuth", async () => {
    const { GET } = await import("./route");
    const { exchangeDingtalkBrowserAuthCode } = await import(
      "@/lib/dingtalk-login"
    );
    const { createToken, setAuthCookieOnResponse } = await import(
      "@/lib/auth/jwt"
    );
    const { findOrCreateUserByDingtalkIdentity } = await import("@/lib/user");

    (exchangeDingtalkBrowserAuthCode as jest.Mock).mockResolvedValue({
      corpId: "ding-corp",
      dingtalkUserId: "openid-1",
      unionId: "union-1",
      name: "Ding User",
      raw: {},
    });
    (findOrCreateUserByDingtalkIdentity as jest.Mock).mockResolvedValue({
      created: true,
      identity: { id: "identity-1" },
      user: { id: "user-1", username: "dt_user_1", role: "editor" },
    });
    (createToken as jest.Mock).mockResolvedValue("jwt-token");

    const request = new NextRequest(
      "http://localhost:4200/api/auth/dingtalk/callback?authCode=browser-code&state=expected",
      {
        headers: {
          cookie:
            "dingtalk_oauth_state=expected; dingtalk_oauth_redirect=%2Fdemo%2Fproject-1",
        },
      },
    );

    const response = await GET(request);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:4200/demo/project-1",
    );
    expect(exchangeDingtalkBrowserAuthCode).toHaveBeenCalledWith(
      "browser-code",
    );
    expect(findOrCreateUserByDingtalkIdentity).toHaveBeenCalledWith(
      expect.objectContaining({
        corpId: "ding-corp",
        unionId: "union-1",
        dingtalkUserId: "openid-1",
      }),
    );
    expect(createToken).toHaveBeenCalledWith({
      userId: "user-1",
      username: "dt_user_1",
      role: "editor",
    });
    expect(setAuthCookieOnResponse).toHaveBeenCalledWith(response, "jwt-token");
  });
});
