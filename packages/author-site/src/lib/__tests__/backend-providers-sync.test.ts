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
  healthReachable?: boolean;
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
  jest.doMock("@/lib/runtime-config", () => ({
    getServerAgentServiceUrl: () => "http://localhost:3201",
    getInternalApiToken: () => "test-token",
  }));

  // Mock global fetch for health check
  const originalFetch = global.fetch;
  let healthReachable = options.healthReachable !== false;
  const mockFetch = jest.fn(
    (url: string | URL | Request, init?: RequestInit) => {
      const urlStr =
        typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (urlStr.endsWith("/health")) {
        if (healthReachable) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({}),
          } as unknown as globalThis.Response);
        }
        return Promise.reject(new Error("fetch failed"));
      }
      return originalFetch(url, init);
    },
  );
  global.fetch = mockFetch as typeof fetch;

  return {
    readDbConfigWithMeta,
    pushBackendProvidersToAgent,
    fetchBackendProvidersFromAgent,
    mockFetch,
    setHealthReachable: (v: boolean) => {
      healthReachable = v;
    },
    restoreFetch: () => {
      global.fetch = originalFetch;
    },
  };
}

describe("backend providers sync", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
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
      attemptCount: 0,
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
      attemptCount: 0,
      lastSource: "retry",
      lastResult: { ok: true, message: "ok after retry" },
    });
    expect(getBackendProvidersSyncStateSnapshot().nextRetryAt).toBeUndefined();
  });

  it("returns database, runtime sync and agent summaries", async () => {
    mockBackendProvidersModules({});
    const { getBackendProvidersSyncStatus } =
      await import("@/lib/backend-providers-sync");

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

  it("starts recovery monitoring after retries exhausted and auto-syncs when agent recovers", async () => {
    jest.useFakeTimers();
    const failResult = { ok: false, message: "fetch failed" };
    const mocks = mockBackendProvidersModules({
      pushResults: Array(8)
        .fill(failResult)
        .concat([{ ok: true, message: "recovered" }]),
      healthReachable: false,
    });
    const {
      getBackendProvidersSyncStateSnapshot,
      syncStoredBackendProvidersToAgent,
      _recoveryTick,
      _stopRecoveryMonitoring,
    } = await import("@/lib/backend-providers-sync");

    // Exhaust all retries
    await syncStoredBackendProvidersToAgent("save", {
      scheduleRetryOnFailure: true,
    });
    for (let i = 0; i < 7; i++) {
      await jest.advanceTimersByTimeAsync(60_000);
    }

    expect(mocks.pushBackendProvidersToAgent).toHaveBeenCalledTimes(8);
    expect(getBackendProvidersSyncStateSnapshot().lastResult?.ok).toBe(false);

    // Now simulate agent-service recovery
    mocks.setHealthReachable(true);

    // Directly call recoveryTick to simulate the health check cycle
    await _recoveryTick();
    // Allow the triggered sync (fire-and-forget) to complete
    await jest.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }

    // Should have triggered one more sync attempt (the recovery one)
    expect(mocks.pushBackendProvidersToAgent).toHaveBeenCalledTimes(9);
    expect(getBackendProvidersSyncStateSnapshot()).toMatchObject({
      attemptCount: 0,
      lastSource: "recovery",
      lastResult: { ok: true, message: "recovered" },
    });

    _stopRecoveryMonitoring();
    mocks.restoreFetch();
  });
});
