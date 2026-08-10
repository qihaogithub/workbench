import type { ImageGenConfig } from "@/lib/agent-providers";

const savedConfig: ImageGenConfig = {
  enabled: true,
  apiKey: "sk-test",
  baseUrl: "https://api.test/v1",
  model: "gpt-image-1",
  timeoutMs: 60000,
  maxPerSession: 30,
  maxRetries: 3,
  concurrency: 2,
  maxPromptLen: 1000,
};

function mockImageGenModules(options: {
  dbConfig?: ImageGenConfig | null;
  pushResults?: Array<{ ok: boolean; message: string }>;
}) {
  const readDbConfigWithMeta = jest.fn(() => {
    if (options.dbConfig === null) return null;
    return {
      config: { imageGen: options.dbConfig ?? savedConfig },
      updatedAt: 1782870000000,
      updatedBy: "admin",
    };
  });
  const pushImageGenConfig = jest.fn();
  for (const result of options.pushResults || [{ ok: true, message: "ok" }]) {
    pushImageGenConfig.mockResolvedValueOnce(result);
  }

  jest.doMock("@/lib/db-config", () => ({
    readDbConfigWithMeta,
  }));
  jest.doMock("@/lib/agent-providers", () => ({
    pushImageGenConfig,
  }));

  return {
    readDbConfigWithMeta,
    pushImageGenConfig,
  };
}

describe("image gen sync", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("pushes the stored imageGen config and records success state", async () => {
    const { pushImageGenConfig } = mockImageGenModules({});
    const {
      getImageGenSyncStateSnapshot,
      syncStoredImageGenToAgent,
    } = await import("@/lib/image-gen-sync");

    const result = await syncStoredImageGenToAgent("startup");

    expect(result.ok).toBe(true);
    expect(pushImageGenConfig).toHaveBeenCalledWith(savedConfig);
    expect(getImageGenSyncStateSnapshot()).toMatchObject({
      inProgress: false,
      attemptCount: 0,
      lastSource: "startup",
      lastResult: { ok: true, message: "ok" },
    });
    expect(getImageGenSyncStateSnapshot().lastSuccessAt).toEqual(
      expect.any(Number),
    );
  });

  it("does not push when the database has no imageGen config", async () => {
    const { pushImageGenConfig } = mockImageGenModules({
      dbConfig: null,
    });
    const {
      getImageGenSyncStateSnapshot,
      syncStoredImageGenToAgent,
    } = await import("@/lib/image-gen-sync");

    const result = await syncStoredImageGenToAgent("startup");

    expect(result.ok).toBe(false);
    expect(pushImageGenConfig).not.toHaveBeenCalled();
    expect(getImageGenSyncStateSnapshot().nextRetryAt).toBeUndefined();
  });

  it("schedules a retry after a failed push and clears retry state after success", async () => {
    jest.useFakeTimers();
    const { pushImageGenConfig } = mockImageGenModules({
      pushResults: [
        { ok: false, message: "agent-service 响应 503" },
        { ok: true, message: "ok after retry" },
      ],
    });
    const {
      getImageGenSyncStateSnapshot,
      syncStoredImageGenToAgent,
    } = await import("@/lib/image-gen-sync");

    const result = await syncStoredImageGenToAgent("save");

    expect(result.ok).toBe(false);
    expect(getImageGenSyncStateSnapshot().nextRetryAt).toEqual(
      expect.any(Number),
    );

    await jest.advanceTimersByTimeAsync(2000);

    expect(pushImageGenConfig).toHaveBeenCalledTimes(2);
    expect(getImageGenSyncStateSnapshot()).toMatchObject({
      attemptCount: 0,
      lastSource: "retry",
      lastResult: { ok: true, message: "ok after retry" },
    });
    expect(getImageGenSyncStateSnapshot().nextRetryAt).toBeUndefined();
  });

  it("hasStoredImageGenConfig reflects db presence", async () => {
    mockImageGenModules({ dbConfig: null });
    const { hasStoredImageGenConfig } = await import("@/lib/image-gen-sync");
    expect(hasStoredImageGenConfig()).toBe(false);
  });
});