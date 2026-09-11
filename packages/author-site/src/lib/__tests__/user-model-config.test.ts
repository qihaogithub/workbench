import fs from "fs";
import os from "os";
import path from "path";

describe("user model config", () => {
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
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ow-user-model-"));
    process.env.DATA_DIR = dataDir;
    process.env.MODEL_CONFIG_ENCRYPTION_KEY = "test-model-config-secret";
  });

  afterEach(async () => {
    const { closeDb } = await import("@/lib/db");
    closeDb();
    fs.rmSync(dataDir, { recursive: true, force: true });
    delete process.env.DATA_DIR;
    delete process.env.MODEL_CONFIG_ENCRYPTION_KEY;
  });

  it("saves encrypted API key and returns only safe config", async () => {
    const {
      upsertUserModelConfig,
      readUserModelConfig,
      readUserBackendProvidersConfig,
    } = await import("@/lib/user-model-config");
    await createUser("u1");

    upsertUserModelConfig("u1", {
      id: "custom",
      name: "Custom",
      baseURL: "https://api.example.com/v1",
      apiKey: "sk-test",
      models: ["gpt-4o", "gpt-4o-mini"],
    });

    const safe = readUserModelConfig("u1");
    expect(safe?.provider.apiKey).toBe("");
    expect(safe?.provider.hasApiKey).toBe(true);
    expect(safe?.provider.defaultModel).toBeUndefined();
    expect("encryptedApiKey" in (safe?.provider || {})).toBe(false);

    const backend = readUserBackendProvidersConfig("u1");
    expect(backend?.providers[0].apiKey).toBe("sk-test");
    expect(backend?.activeModelId).toBeUndefined();
  });

  it("keeps existing API key when saving an empty key", async () => {
    const { upsertUserModelConfig, readUserBackendProvidersConfig } =
      await import("@/lib/user-model-config");
    await createUser("u1");

    upsertUserModelConfig("u1", {
      baseURL: "https://api.example.com/v1",
      apiKey: "sk-original",
      models: ["model-a"],
    });
    upsertUserModelConfig("u1", {
      baseURL: "https://api.example.com/v1",
      models: ["model-b"],
      keepExistingApiKey: true,
    });

    const backend = readUserBackendProvidersConfig("u1");
    expect(backend?.providers[0].apiKey).toBe("sk-original");
    expect(backend?.providers[0].models).toEqual(["model-b"]);
  });

  it("merges user provider before admin providers without persisting an active model", async () => {
    const { upsertUserModelConfig, readUserBackendProvidersConfig } =
      await import("@/lib/user-model-config");
    await createUser("u1");

    upsertUserModelConfig("u1", {
      id: "custom",
      name: "Custom",
      baseURL: "https://api.example.com/v1",
      apiKey: "sk-user",
      models: ["user-model"],
    });

    const backend = readUserBackendProvidersConfig("u1", {
      providers: [
        {
          id: "admin",
          name: "Admin",
          baseURL: "https://admin.example.com/v1",
          apiKey: "sk-admin",
          models: ["admin-model"],
          defaultModel: "admin-model",
          enabled: true,
        },
      ],
      activeProviderId: "admin",
      activeModelId: "admin/admin-model",
    });

    expect(backend?.providers.map((provider) => provider.id)).toEqual([
      "custom",
      "admin",
    ]);
    expect(backend?.activeProviderId).toBe("custom");
    expect(backend?.activeModelId).toBeUndefined();
  });

  it("gets OpenAI-compatible catalog entries without saving the supplied API key", async () => {
    const { fetchUserModelCatalog } = await import("@/lib/user-model-config");
    await createUser("u1");
    const fetchMock = jest.fn(async () =>
      new Response(JSON.stringify({ data: [{ id: "model-a" }, { id: "model-a" }, { id: "model-b" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    global.fetch = fetchMock as typeof fetch;

    await expect(
      fetchUserModelCatalog("u1", {
        baseURL: "https://api.example.com/v1/",
        apiKey: "sk-unsaved",
      }),
    ).resolves.toEqual(["model-a", "model-b"]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/v1/models",
      expect.objectContaining({ headers: { Authorization: "Bearer sk-unsaved" } }),
    );
  });

  it("returns admin providers when user has no personal config", async () => {
    const { readUserBackendProvidersConfig } =
      await import("@/lib/user-model-config");

    const fallback = {
      providers: [
        {
          id: "admin",
          name: "Admin",
          baseURL: "https://admin.example.com/v1",
          apiKey: "sk-admin",
          models: ["admin-model"],
          defaultModel: "admin-model",
          enabled: true,
        },
      ],
      activeProviderId: "admin",
      activeModelId: "admin/admin-model",
    };

    expect(readUserBackendProvidersConfig("u1", fallback)).toBe(fallback);
  });

  it("clears config", async () => {
    const {
      upsertUserModelConfig,
      deleteUserModelConfig,
      readUserModelConfig,
    } = await import("@/lib/user-model-config");
    await createUser("u1");

    upsertUserModelConfig("u1", {
      baseURL: "https://api.example.com/v1",
      apiKey: "sk-test",
      models: ["model-a"],
    });
    deleteUserModelConfig("u1");

    expect(readUserModelConfig("u1")).toBeNull();
  });
});
