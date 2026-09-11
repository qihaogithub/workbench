import {
  hydrateBackendProviders,
  hydrateImageGen,
  sanitizeModelConfig,
  sealModelConfig,
} from "../global-model-secrets";
import { DEFAULT_IMAGE_GEN_CONFIG, type ModelConfigData } from "../model-config";

describe("global model credentials", () => {
  const originalKey = process.env.MODEL_CONFIG_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.MODEL_CONFIG_ENCRYPTION_KEY = "test-global-model-secret";
  });

  afterAll(() => {
    if (originalKey === undefined) delete process.env.MODEL_CONFIG_ENCRYPTION_KEY;
    else process.env.MODEL_CONFIG_ENCRYPTION_KEY = originalKey;
  });

  function config(apiKey = "provider-secret", imageKey = "image-secret"): ModelConfigData {
    return {
      frontend: { enabledModels: ["custom/model"], autoEnableRules: [], excludedModels: [] },
      backendProviders: {
        providers: [{
          id: "custom",
          name: "Custom",
          baseURL: "https://api.example.com/v1",
          apiKey,
          models: ["model"],
        }],
      },
      imageGen: { ...DEFAULT_IMAGE_GEN_CONFIG, apiKey: imageKey },
    };
  }

  it("encrypts stored keys and hydrates them only for server-side use", () => {
    const sealed = sealModelConfig(config());
    expect(JSON.stringify(sealed)).not.toContain("provider-secret");
    expect(JSON.stringify(sealed)).not.toContain("image-secret");
    expect(hydrateBackendProviders(sealed.backendProviders)?.providers[0].apiKey)
      .toBe("provider-secret");
    expect(hydrateImageGen(sealed.imageGen)?.apiKey).toBe("image-secret");
  });

  it("returns only hasApiKey and preserves encrypted keys on an empty update", () => {
    const first = sealModelConfig(config());
    const second = sealModelConfig(config("", ""), first);
    const safe = sanitizeModelConfig({
      ...config("", ""),
      backendProviders: hydrateBackendProviders(second.backendProviders),
      imageGen: hydrateImageGen(second.imageGen),
    });
    expect(JSON.stringify(safe)).not.toContain("provider-secret");
    expect(JSON.stringify(safe)).not.toContain("image-secret");
    expect(safe).toMatchObject({
      backendProviders: { providers: [{ hasApiKey: true }] },
      imageGen: { hasApiKey: true },
    });
  });

  it("refuses historical plaintext credentials", () => {
    expect(() => hydrateBackendProviders({
      providers: [{ id: "legacy", apiKey: "plaintext" }],
    })).toThrow(/历史明文凭据/);
  });
});
