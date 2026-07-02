import fs from "fs";
import os from "os";
import path from "path";

describe("external auth config", () => {
  let dataDir: string;

  async function createUser(id: string): Promise<void> {
    const { getDb } = await import("@/lib/db");
    getDb()
      .prepare(
        "INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)",
      )
      .run(id, `user-${id}`, "hash", Date.now());
  }

  beforeEach(() => {
    jest.resetModules();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ow-external-auth-"));
    process.env.DATA_DIR = dataDir;
    process.env.JWT_SECRET = "test-secret";
    delete process.env.MODEL_CONFIG_ENCRYPTION_KEY;
  });

  afterEach(async () => {
    const { closeDb } = await import("@/lib/db");
    closeDb();
    fs.rmSync(dataDir, { recursive: true, force: true });
    jest.restoreAllMocks();
    Reflect.deleteProperty(global, "fetch");
    delete process.env.DATA_DIR;
    delete process.env.FIGMA_OAUTH_CLIENT_ID;
    delete process.env.FIGMA_OAUTH_CLIENT_SECRET;
  });

  it("returns disconnected provider statuses by default", async () => {
    const { readExternalAuthStatuses } = await import("@/lib/external-auth");
    await createUser("u1");

    expect(readExternalAuthStatuses("u1")).toEqual([
      { provider: "figma", status: "disconnected" },
      { provider: "dingtalk", status: "disconnected" },
    ]);
  });

  it("encrypts Figma credentials and exposes only safe status", async () => {
    const {
      readExternalAuthSessionConfig,
      readExternalAuthStatuses,
      upsertExternalAuthConfig,
    } = await import("@/lib/external-auth");
    const { getDb } = await import("@/lib/db");
    await createUser("u1");

    const expiresAt = Date.now() + 60_000;
    upsertExternalAuthConfig("u1", {
      provider: "figma",
      status: "connected",
      accountLabel: "Designer",
      expiresAt,
      credential: {
        accessToken: "figma-access-token",
        refreshToken: "figma-refresh-token",
        expiresAt,
      },
    });

    const safe = readExternalAuthStatuses("u1").find(
      (provider) => provider.provider === "figma",
    );
    expect(safe).toMatchObject({
      provider: "figma",
      status: "connected",
      accountLabel: "Designer",
      expiresAt,
    });

    const raw = getDb()
      .prepare(
        "SELECT config_json FROM user_external_auth_configs WHERE user_id = ? AND provider = ?",
      )
      .get("u1", "figma") as { config_json: string };
    expect(raw.config_json).not.toContain("figma-access-token");
    expect(raw.config_json).not.toContain("figma-refresh-token");

    const sessionConfig = readExternalAuthSessionConfig("u1");
    expect(sessionConfig.figma).toMatchObject({
      enabled: true,
      accessToken: "figma-access-token",
      expiresAt,
      accountLabel: "Designer",
    });
  });

  it("stores dws config dir as encrypted credential and clears on delete", async () => {
    const {
      deleteExternalAuthConfig,
      readExternalAuthSessionConfig,
      readExternalAuthStatuses,
      upsertExternalAuthConfig,
    } = await import("@/lib/external-auth");
    await createUser("u1");

    upsertExternalAuthConfig("u1", {
      provider: "dingtalk",
      status: "connected",
      accountLabel: "Ding User",
      credential: { configDir: "/tmp/dws-user-config" },
    });

    expect(readExternalAuthSessionConfig("u1").dingtalk).toMatchObject({
      enabled: true,
      configDir: "/tmp/dws-user-config",
      accountLabel: "Ding User",
    });

    deleteExternalAuthConfig("u1", "dingtalk");
    expect(readExternalAuthSessionConfig("u1").dingtalk).toBeUndefined();
    expect(readExternalAuthStatuses("u1").find(
      (provider) => provider.provider === "dingtalk",
    )).toEqual({ provider: "dingtalk", status: "disconnected" });
  });

  it("refreshes near-expiry Figma credentials before building session config", async () => {
    const {
      readExternalAuthSessionConfig,
      readExternalAuthSessionConfigWithRefresh,
      upsertExternalAuthConfig,
    } = await import("@/lib/external-auth");
    const { getDb } = await import("@/lib/db");
    await createUser("u1");
    process.env.FIGMA_OAUTH_CLIENT_ID = "figma-client";
    process.env.FIGMA_OAUTH_CLIENT_SECRET = "figma-secret";

    const expiresAt = Date.now() + 30_000;
    upsertExternalAuthConfig("u1", {
      provider: "figma",
      status: "connected",
      accountLabel: "Designer",
      expiresAt,
      credential: {
        accessToken: "old-token",
        refreshToken: "refresh-token",
        expiresAt,
      },
    });

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "new-token",
        refresh_token: "new-refresh-token",
        expires_in: 3600,
        token_type: "bearer",
        scope: "file_content:read",
      }),
    } as Response);
    (global as typeof globalThis & { fetch: typeof fetchMock }).fetch = fetchMock;

    const sessionConfig = await readExternalAuthSessionConfigWithRefresh("u1");

    expect(sessionConfig.figma?.accessToken).toBe("new-token");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.figma.com/v1/oauth/refresh",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Basic /),
        }),
      }),
    );
    const raw = getDb()
      .prepare(
        "SELECT config_json FROM user_external_auth_configs WHERE user_id = ? AND provider = ?",
      )
      .get("u1", "figma") as { config_json: string };
    expect(raw.config_json).not.toContain("new-token");
    expect(readExternalAuthSessionConfig("u1").figma?.accessToken).toBe("new-token");
  });
});
