import {
  getModelConfigSync,
  normalizeFrontendModelConfig,
} from "@/lib/model-config";

jest.mock("@/lib/db-config", () => ({
  readDbConfig: jest.fn(),
}));

describe("model configuration fallback", () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...savedEnv };
    delete process.env.PI_AGENT_PROVIDERS;
    delete process.env.PI_AGENT_PROVIDER;
    delete process.env.PI_AGENT_MODEL;
    delete process.env.PI_AGENT_BASE_URL;
  });

  afterAll(() => {
    process.env = savedEnv;
  });

  it("builds a complete frontend fallback from provider JSON", () => {
    process.env.PI_AGENT_PROVIDERS = JSON.stringify([
      {
        id: "vendor",
        baseURL: "https://vendor.test/v1",
        models: ["model-a", "model-b"],
        defaultModel: "model-b",
      },
    ]);

    expect(getModelConfigSync()).toMatchObject({
      frontend: {
        enabledModels: ["vendor/model-a", "vendor/model-b"],
        autoEnableRules: [{ type: "prefix", value: "vendor/" }],
        excludedModels: [],
      },
      backendProviders: { providers: [{ id: "vendor" }] },
    });
  });

  it("builds a complete fallback from one provider/model pair", () => {
    process.env.PI_AGENT_PROVIDER = "vendor";
    process.env.PI_AGENT_MODEL = "model-a";

    expect(getModelConfigSync().frontend).toEqual({
      enabledModels: ["vendor/model-a"],
      autoEnableRules: [{ type: "prefix", value: "vendor/" }],
      excludedModels: [],
    });
  });

  it("returns only the canonical frontend policy", () => {
    expect(
      normalizeFrontendModelConfig({
        enabledModels: ["vendor/model-a"],
        autoEnableRules: [],
        excludedModels: ["vendor/model-b"],
        staleField: ["must-not-be-reintroduced"],
      }),
    ).toEqual({
      enabledModels: ["vendor/model-a"],
      autoEnableRules: [],
      excludedModels: ["vendor/model-b"],
    });
  });
});
