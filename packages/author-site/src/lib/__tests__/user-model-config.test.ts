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
    process.env.JWT_SECRET = "test-secret";
    delete process.env.MODEL_CONFIG_ENCRYPTION_KEY;
  });

  afterEach(async () => {
    const { closeDb } = await import("@/lib/db");
    closeDb();
    fs.rmSync(dataDir, { recursive: true, force: true });
    delete process.env.DATA_DIR;
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
      defaultModel: "gpt-4o",
    });

    const safe = readUserModelConfig("u1");
    expect(safe?.provider.apiKey).toBe("");
    expect(safe?.provider.hasApiKey).toBe(true);
    expect("encryptedApiKey" in (safe?.provider || {})).toBe(false);

    const backend = readUserBackendProvidersConfig("u1");
    expect(backend?.providers[0].apiKey).toBe("sk-test");
    expect(backend?.activeModelId).toBe("custom/gpt-4o");
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

  it("merges user provider before admin providers and keeps user default active", async () => {
    const { upsertUserModelConfig, readUserBackendProvidersConfig } =
      await import("@/lib/user-model-config");
    await createUser("u1");

    upsertUserModelConfig("u1", {
      id: "custom",
      name: "Custom",
      baseURL: "https://api.example.com/v1",
      apiKey: "sk-user",
      models: ["user-model"],
      defaultModel: "user-model",
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
    expect(backend?.activeModelId).toBe("custom/user-model");
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
