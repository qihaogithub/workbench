import type { ImageDescriptionConfig } from "@/lib/agent-providers";

const savedConfig: ImageDescriptionConfig = {
  enabled: true,
  visionModelId: "xjjj/vision",
  describePrompt: "describe it",
  maxCacheSize: 500,
  timeout: 10000,
};

function mockImageDescriptionModules(options: {
  dbConfig?: ImageDescriptionConfig | null;
  pushResults?: Array<{ ok: boolean; message: string }>;
}) {
  const readDbConfigWithMeta = jest.fn(() => {
    if (options.dbConfig === null) return null;
    return {
      config: { imageDescription: options.dbConfig ?? savedConfig },
      updatedAt: 1782870000000,
      updatedBy: "admin",
    };
  });
  const pushImageDescriptionConfig = jest.fn();
  for (const result of options.pushResults || [{ ok: true, message: "ok" }]) {
    pushImageDescriptionConfig.mockResolvedValueOnce(result);
  }

  jest.doMock("@/lib/db-config", () => ({
    readDbConfigWithMeta,
  }));
  jest.doMock("@/lib/agent-providers", () => ({
    pushImageDescriptionConfig,
  }));

  return {
    readDbConfigWithMeta,
    pushImageDescriptionConfig,
  };
}

describe("image description sync", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("pushes the stored imageDescription config and records success state", async () => {
    const { pushImageDescriptionConfig } = mockImageDescriptionModules({});
    const {
      getImageDescriptionSyncStateSnapshot,
      syncStoredImageDescriptionToAgent,
    } = await import("@/lib/image-description-sync");

    const result = await syncStoredImageDescriptionToAgent("startup");

    expect(result.ok).toBe(true);
    expect(pushImageDescriptionConfig).toHaveBeenCalledWith(savedConfig);
    expect(getImageDescriptionSyncStateSnapshot()).toMatchObject({
      inProgress: false,
      attemptCount: 0,
      lastSource: "startup",
      lastResult: { ok: true, message: "ok" },
    });
    expect(getImageDescriptionSyncStateSnapshot().lastSuccessAt).toEqual(
      expect.any(Number),
    );
  });

  it("does not push when the database has no imageDescription config", async () => {
    const { pushImageDescriptionConfig } = mockImageDescriptionModules({
      dbConfig: null,
    });
    const {
      getImageDescriptionSyncStateSnapshot,
      syncStoredImageDescriptionToAgent,
    } = await import("@/lib/image-description-sync");

    const result = await syncStoredImageDescriptionToAgent("startup");

    expect(result.ok).toBe(false);
    expect(result.message).toBe("数据库中没有识图代理配置");
    expect(pushImageDescriptionConfig).not.toHaveBeenCalled();
    expect(getImageDescriptionSyncStateSnapshot().nextRetryAt).toBeUndefined();
  });

  it("schedules a retry after a failed push and clears retry state after success", async () => {
    jest.useFakeTimers();
    const { pushImageDescriptionConfig } = mockImageDescriptionModules({
      pushResults: [
        { ok: false, message: "agent-service 响应 503" },
        { ok: true, message: "ok after retry" },
      ],
    });
    const {
      getImageDescriptionSyncStateSnapshot,
      syncStoredImageDescriptionToAgent,
    } = await import("@/lib/image-description-sync");

    const result = await syncStoredImageDescriptionToAgent("save");

    expect(result.ok).toBe(false);
    expect(getImageDescriptionSyncStateSnapshot().nextRetryAt).toEqual(
      expect.any(Number),
    );

    await jest.advanceTimersByTimeAsync(2000);

    expect(pushImageDescriptionConfig).toHaveBeenCalledTimes(2);
    expect(getImageDescriptionSyncStateSnapshot()).toMatchObject({
      attemptCount: 0,
      lastSource: "retry",
      lastResult: { ok: true, message: "ok after retry" },
    });
    expect(getImageDescriptionSyncStateSnapshot().nextRetryAt).toBeUndefined();
  });

  it("startup schedule skips when there is no stored config", async () => {
    mockImageDescriptionModules({ dbConfig: null });
    const { _hasStoredConfig } = await import("@/lib/image-description-sync");
    expect(_hasStoredConfig()).toBe(false);
  });
});