describe("DingTalk multi-environment login handoff", () => {
  const envKeys = [
    "DINGTALK_LOGIN_TARGET_ID",
    "DINGTALK_LOGIN_HANDOFF_SECRET",
    "DINGTALK_LOGIN_TARGETS_JSON",
  ];
  const previousValues = new Map<string, string | undefined>();

  beforeEach(() => {
    jest.resetModules();
    for (const key of envKeys) previousValues.set(key, process.env[key]);
    process.env.DINGTALK_LOGIN_TARGET_ID = "dev";
    process.env.DINGTALK_LOGIN_HANDOFF_SECRET =
      "test-handoff-secret-with-at-least-32-bytes";
    process.env.DINGTALK_LOGIN_TARGETS_JSON = JSON.stringify({
      dev: "http://10.0.0.11:4200",
      test: "http://10.0.0.12:4200",
      prod: "https://oneflow.example.com",
    });
  });

  afterEach(() => {
    for (const key of envKeys) {
      const value = previousValues.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("round-trips a signed OAuth state and normalizes its redirect path", async () => {
    const {
      createDingtalkOAuthState,
      verifyDingtalkOAuthState,
    } = await import("@/lib/dingtalk-login-handoff");

    const created = await createDingtalkOAuthState("https://evil.example.com");
    const verified = await verifyDingtalkOAuthState(created.state);

    expect(created.targetId).toBe("dev");
    expect(created.nonce).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(verified).toEqual({
      targetId: "dev",
      redirectPath: "/workbench",
      nonce: created.nonce,
    });
  });

  it("creates a short-lived handoff without DingTalk raw payloads", async () => {
    const {
      createDingtalkLoginHandoff,
      createDingtalkOAuthState,
      verifyDingtalkLoginHandoff,
      verifyDingtalkOAuthState,
    } = await import("@/lib/dingtalk-login-handoff");

    const created = await createDingtalkOAuthState("/demo/project-1");
    const state = await verifyDingtalkOAuthState(created.state);
    const token = await createDingtalkLoginHandoff(state, {
      corpId: "ding-corp",
      dingtalkUserId: "openid-1",
      unionId: "union-1",
      name: "Ding User",
      avatar: "https://example.test/avatar.png",
      raw: { accessToken: "must-not-leak" },
    });

    const verified = await verifyDingtalkLoginHandoff(token, "dev");
    expect(verified).toEqual({
      targetId: "dev",
      redirectPath: "/demo/project-1",
      nonce: created.nonce,
      profile: {
        corpId: "ding-corp",
        dingtalkUserId: "openid-1",
        unionId: "union-1",
        name: "Ding User",
        avatar: "https://example.test/avatar.png",
      },
    });
    expect(token).not.toContain("must-not-leak");
  });

  it("binds a handoff to its configured target environment", async () => {
    const {
      createDingtalkLoginHandoff,
      createDingtalkOAuthState,
      verifyDingtalkLoginHandoff,
      verifyDingtalkOAuthState,
    } = await import("@/lib/dingtalk-login-handoff");

    const created = await createDingtalkOAuthState("/workbench");
    const state = await verifyDingtalkOAuthState(created.state);
    const token = await createDingtalkLoginHandoff(state, {
      corpId: "ding-corp",
      dingtalkUserId: "openid-1",
      raw: {},
    });

    await expect(
      verifyDingtalkLoginHandoff(token, "test"),
    ).rejects.toThrow();
  });

  it("resolves only explicitly allowlisted target origins", async () => {
    const { resolveDingtalkLoginTargetOrigin } = await import(
      "@/lib/dingtalk-login-handoff"
    );

    expect(resolveDingtalkLoginTargetOrigin("dev")).toBe(
      "http://10.0.0.11:4200",
    );
    expect(() => resolveDingtalkLoginTargetOrigin("unknown")).toThrow(
      "not allowlisted",
    );
  });

  it("rejects short shared secrets and unsafe target URLs", async () => {
    const {
      createDingtalkOAuthState,
      resolveDingtalkLoginTargetOrigin,
    } = await import("@/lib/dingtalk-login-handoff");

    process.env.DINGTALK_LOGIN_HANDOFF_SECRET = "too-short";
    await expect(createDingtalkOAuthState("/workbench")).rejects.toThrow(
      "at least 32 bytes",
    );

    process.env.DINGTALK_LOGIN_TARGETS_JSON = JSON.stringify({
      dev: "javascript:alert(1)",
    });
    expect(() => resolveDingtalkLoginTargetOrigin("dev")).toThrow(
      "http or https origin",
    );
  });
});
