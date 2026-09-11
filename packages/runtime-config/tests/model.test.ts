import {
  DEFAULT_IMAGE_GEN_CONFIG,
  createDefaultGlobalModelConfig,
  normalizeBackendProvidersConfig,
  normalizeFrontendModelPolicy,
  normalizeGlobalModelConfig,
  normalizeImageGenConfig,
  validateFrontendModelPolicy,
} from "../src/model.js";

describe("model configuration", () => {
  it("normalizes the canonical frontend policy and rejects legacy fields", () => {
    const policy = normalizeFrontendModelPolicy({
      enabledModels: [" model-a ", "model-a"],
      autoEnableRules: [
        { type: "prefix", value: " vendor/ " },
        { type: "prefix", value: "vendor/" },
      ],
      excludedModels: [" model-b "],
    });
    expect(policy).toEqual({
      enabledModels: ["model-a"],
      autoEnableRules: [{ type: "prefix", value: "vendor/" }],
      excludedModels: ["model-b"],
    });
    expect(() => normalizeFrontendModelPolicy({ blacklist: [] })).toThrow(
      /unsupported field/,
    );
    expect(() => normalizeFrontendModelPolicy({})).toThrow(/required/);
    expect(() =>
      normalizeFrontendModelPolicy({
        enabledModels: ["same"],
        autoEnableRules: [],
        excludedModels: ["same"],
      }),
    ).toThrow(/disjoint/);
    expect(() => validateFrontendModelPolicy(policy)).not.toThrow();
  });

  it("provides image generation defaults without a key", () => {
    expect(DEFAULT_IMAGE_GEN_CONFIG).toEqual({
      enabled: false,
      baseUrl: "https://api.openai.com/v1",
      model: "dall-e-3",
      apiProfile: "auto",
      timeoutMs: 60_000,
      maxPerSession: 30,
      maxRetries: 3,
      concurrency: 2,
      maxPromptLen: 1_000,
    });
    expect(normalizeImageGenConfig()).toEqual(DEFAULT_IMAGE_GEN_CONFIG);
    expect(normalizeImageGenConfig({
      ...DEFAULT_IMAGE_GEN_CONFIG,
      baseUrl: "https://example.test/v1/",
      apiKey: " secret ",
    })).toMatchObject({
      baseUrl: "https://example.test/v1",
      apiKey: "secret",
    });
    expect(() => normalizeImageGenConfig({ timeoutMs: 0 })).toThrow(/timeoutMs/);
    expect(() => normalizeImageGenConfig({ baseUrl: "file:///tmp/key" })).toThrow(
      /baseUrl/,
    );
  });

  it("normalizes backend providers and the complete global shape", () => {
    const providers = normalizeBackendProvidersConfig({
      providers: [{
        id: "vendor",
        baseURL: "https://vendor.test/v1",
        models: ["model-a"],
        defaultModel: "model-a",
      }],
      activeProviderId: "vendor",
    });
    expect(providers.providers[0]).toMatchObject({
      id: "vendor",
      name: "vendor",
      apiKey: "",
      enabled: true,
    });
    expect(normalizeGlobalModelConfig({
      frontend: { enabledModels: [], autoEnableRules: [], excludedModels: [] },
      backendProviders: providers,
      imageGen: DEFAULT_IMAGE_GEN_CONFIG,
    })).toEqual({
      frontend: { enabledModels: [], autoEnableRules: [], excludedModels: [] },
      backendProviders: providers,
      imageGen: DEFAULT_IMAGE_GEN_CONFIG,
    });
    expect(createDefaultGlobalModelConfig().imageGen.apiKey).toBeUndefined();
    expect(() => normalizeBackendProvidersConfig({
      providers: [{
        id: "vendor",
        baseURL: "https://vendor.test",
        models: [],
        defaultModel: "missing",
      }],
    })).toThrow(/defaultModel/);
    expect(() => normalizeGlobalModelConfig({})).toThrow(/required/);
  });
});
