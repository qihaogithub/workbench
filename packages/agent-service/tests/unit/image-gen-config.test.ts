import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../src/utils/config", () => {
  const loadConfig = () => ({
    imageGen: {
      enabled: false,
      apiKey: "env-key",
      baseUrl: "https://env.test/v1",
      model: "env-model",
      timeoutMs: 60000,
      maxPerSession: 30,
      maxRetries: 3,
      concurrency: 2,
      maxPromptLen: 1000,
    },
  });
  return { loadConfig };
});

import {
  getImageGenConfig,
  updateImageGenConfig,
  resetImageGenConfig,
} from "../../src/services/image-gen-config";

describe("image-gen-config 运行时配置", () => {
  beforeEach(() => {
    resetImageGenConfig();
  });

  afterEach(() => {
    resetImageGenConfig();
  });

  it("未覆盖时返回环境变量默认值", () => {
    const c = getImageGenConfig();
    expect(c.enabled).toBe(false);
    expect(c.apiKey).toBe("env-key");
    expect(c.model).toBe("env-model");
  });

  it("updateImageGenConfig 覆盖内存配置", () => {
    const updated = updateImageGenConfig({
      enabled: true,
      apiKey: "admin-key",
      model: "admin-model",
    });
    expect(updated.enabled).toBe(true);
    expect(updated.apiKey).toBe("admin-key");
    expect(updated.model).toBe("admin-model");

    // 未覆盖字段保留
    const again = getImageGenConfig();
    expect(again.baseUrl).toBe("https://env.test/v1");
    expect(again.maxPromptLen).toBe(1000);
  });

  it("resetImageGenConfig 后回退到环境变量默认值", () => {
    updateImageGenConfig({ enabled: true, apiKey: "x" });
    resetImageGenConfig();
    const c = getImageGenConfig();
    expect(c.enabled).toBe(false);
    expect(c.apiKey).toBe("env-key");
  });
});