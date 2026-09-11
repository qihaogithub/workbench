const getAuthCookie = jest.fn();
const verifyToken = jest.fn();
const getModelConfig = jest.fn();
const readUserBackendProvidersConfig = jest.fn();

jest.mock("@/lib/auth/jwt", () => ({ getAuthCookie, verifyToken }));
jest.mock("@/lib/model-config", () => ({ getModelConfig }));
jest.mock("@/lib/user-model-config", () => ({
  readUserBackendProvidersConfig,
}));

describe("GET /api/models/config", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.PI_AGENT_PROVIDER;
    delete process.env.PI_AGENT_MODEL;
    delete process.env.PI_AGENT_PROVIDERS;
    getAuthCookie.mockResolvedValue("token");
    verifyToken.mockResolvedValue({ userId: "user-1" });
    getModelConfig.mockResolvedValue({
      frontend: {
        enabledModels: ["admin/default"],
        autoEnableRules: [],
        excludedModels: [],
      },
    });
  });

  it("adds the current user's personal models to an exact enabled-model list", async () => {
    readUserBackendProvidersConfig.mockReturnValue({
      providers: [
        {
          id: "deepseek",
          models: ["deepseek-v4-flash-vision-exp"],
          enabled: true,
        },
      ],
    });
    const { GET } = await import("./route");

    const response = await GET();
    const body = await response.json();

    expect(body).toMatchObject({
      success: true,
      data: {
        frontend: {
          enabledModels: [
            "admin/default",
            "deepseek/deepseek-v4-flash-vision-exp",
          ],
          autoEnableRules: [{ type: "prefix", value: "deepseek/" }],
        },
      },
    });
    expect(readUserBackendProvidersConfig).toHaveBeenCalledWith("user-1");
  });

  it("keeps global model configuration available when a personal API key can no longer be decrypted", async () => {
    readUserBackendProvidersConfig.mockImplementation(() => {
      throw new Error("Unsupported state or unable to authenticate data");
    });
    const { GET } = await import("./route");

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        frontend: {
          enabledModels: ["admin/default"],
          excludedModels: [],
        },
      },
    });
  });

  it("adds the runtime provider prefix so env-backed models are not filtered out", async () => {
    process.env.PI_AGENT_PROVIDER = "mydeepseek";
    process.env.PI_AGENT_MODEL = "deepseek-v4-flash";
    getModelConfig.mockResolvedValue({
      frontend: {
        enabledModels: ["admin/default"],
        autoEnableRules: [],
        excludedModels: [],
      },
      backendProviders: { providers: [] },
    });

    const { GET } = await import("./route");
    const response = await GET();
    const body = await response.json();

    expect(body.data.frontend.autoEnableRules).toContainEqual({
      type: "prefix",
      value: "mydeepseek/",
    });
    delete process.env.PI_AGENT_PROVIDER;
    delete process.env.PI_AGENT_MODEL;
  });
});
