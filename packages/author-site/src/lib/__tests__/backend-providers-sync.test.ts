import type { BackendProvidersConfig } from "@workbench/shared";

const savedConfig: BackendProvidersConfig = {
  providers: [
    {
      id: "custom",
      name: "Custom",
      baseURL: "https://api.example.com/v1",
      apiKey: "sk-test",
      models: ["model-a"],
      defaultModel: "model-a",
      enabled: true,
    },
  ],
  activeProviderId: "custom",
  activeModelId: "custom/model-a",
};

function mockBackendProvidersModules(options: {
  dbConfig?: BackendProvidersConfig | null;
  pushResults?: Array<{ ok: boolean; message: string }>;
  agentConfig?: BackendProvidersConfig;
}) {
  const readDbConfigWithMeta = jest.fn(() => {
    if (options.dbConfig === null) return null;
    return {
      config: { backendProviders: options.dbConfig ?? savedConfig },
      updatedAt: 1782870000000,
      updatedBy: "admin",
    };
  });
  const pushBackendProvidersToAgent = jest.fn();
  for (const result of options.pushResults || [{ ok: true, message: "ok" }]) {
    pushBackendProvidersToAgent.mockResolvedValueOnce(result);
  }
  const fetchBackendProvidersFromAgent = jest.fn().mockResolvedValue({
    ok: true,
    config: options.agentConfig ?? savedConfig,
  });

  jest.doMock("@/lib/db-config", () => ({
    readDbConfigWithMeta,
  }));
  jest.doMock("@/lib/agent-providers", () => ({
    pushBackendProvidersToAgent,
    fetchBackendProvidersFromAgent,
  }));

  return {
    readDbConfigWithMeta,
    pushBackendProvidersToAgent,
    fetchBackendProvidersFromAgent,
  };
}

describe("backend providers sync", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("pushes the stored backend providers config and records success state", async () => {
    const { pushBackendProvidersToAgent } = mockBackendProvidersModules({});
    const {
      getBackendProvidersSyncStateSnapshot,
      syncStoredBackendProvidersToAgent,
    } = await import("@/lib/backend-providers-sync");

    const result = await syncStoredBackendProvidersToAgent("manual");

    expect(result.ok).toBe(true);
    expect(pushBackendProvidersToAgent).toHaveBeenCalledWith(savedConfig);
    expect(getBackendProvidersSyncStateSnapshot()).toMatchObject({
      inProgress: false,
      attemptCount: 1,
      lastSource: "manual",
      lastProviderCount: 1,
      lastActiveProviderId: "custom",
      lastActiveModelId: "custom/model-a",
      lastResult: { ok: true, message: "ok" },
    });
    expect(getBackendProvidersSyncStateSnapshot().lastSuccessAt).toEqual(
      expect.any(Number),
    );
  });

  it("does not push when the database has no backendProviders config", async () => {
    const { pushBackendProvidersToAgent } = mockBackendProvidersModules({
      dbConfig: null,
    });
    const {
      getBackendProvidersSyncStateSnapshot,
      syncStoredBackendProvidersToAgent,
    } = await import("@/lib/backend-providers-sync");

    const result = await syncStoredBackendProvidersToAgent("startup");

    expect(result.ok).toBe(false);
    expect(result.message).toBe("数据库中没有 backendProviders 配置");
    expect(pushBackendProvidersToAgent).not.toHaveBeenCalled();
    expect(getBackendProvidersSyncStateSnapshot().nextRetryAt).toBeUndefined();
  });

  it("schedules a retry after a failed push and clears retry state after success", async () => {
    jest.useFakeTimers();
    const { pushBackendProvidersToAgent } = mockBackendProvidersModules({
      pushResults: [
        { ok: false, message: "agent-service 响应 401" },
        { ok: true, message: "ok after retry" },
      ],
    });
    const {
      getBackendProvidersSyncStateSnapshot,
      syncStoredBackendProvidersToAgent,
    } = await import("@/lib/backend-providers-sync");

    const result = await syncStoredBackendProvidersToAgent("save", {
      scheduleRetryOnFailure: true,
    });

    expect(result.ok).toBe(false);
    expect(getBackendProvidersSyncStateSnapshot().nextRetryAt).toEqual(
      expect.any(Number),
    );

    await jest.advanceTimersByTimeAsync(2000);

    expect(pushBackendProvidersToAgent).toHaveBeenCalledTimes(2);
    expect(getBackendProvidersSyncStateSnapshot()).toMatchObject({
      attemptCount: 2,
      lastSource: "retry",
      lastResult: { ok: true, message: "ok after retry" },
    });
    expect(getBackendProvidersSyncStateSnapshot().nextRetryAt).toBeUndefined();
  });

  it("returns database, runtime sync and agent summaries", async () => {
    mockBackendProvidersModules({});
    const { getBackendProvidersSyncStatus } = await import(
      "@/lib/backend-providers-sync"
    );

    const status = await getBackendProvidersSyncStatus();

    expect(status.dbConfig).toMatchObject({
      exists: true,
      updatedAt: 1782870000000,
      providerCount: 1,
      activeProviderId: "custom",
      activeModelId: "custom/model-a",
    });
    expect(status.agentConfig).toMatchObject({
      reachable: true,
      providerCount: 1,
      activeProviderId: "custom",
      activeModelId: "custom/model-a",
    });
  });
});
