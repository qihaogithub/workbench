import {
  applyModelConfigs,
  matchesId,
  resolveModelConfig,
  UNCONFIGURED_DEFAULT,
} from "@/lib/ai-models";

describe("matchesId", () => {
  it("字符串 matcher 走前缀匹配", () => {
    expect(matchesId("claude-", "claude-sonnet-4-5")).toBe(true);
    expect(matchesId("claude-", "anthropic/claude-sonnet")).toBe(false);
  });

  it("正则 matcher 走 .test()", () => {
    expect(matchesId(/^claude-sonnet/, "claude-sonnet-4-5")).toBe(true);
    expect(matchesId(/^claude-sonnet/, "claude-opus-4-7")).toBe(false);
  });
});

describe("resolveModelConfig", () => {
  it("匹配到的模型返回 alias 与 supportsImages", () => {
    const r = resolveModelConfig("claude-sonnet-4-5-20250929");
    expect(r.config).not.toBeNull();
    expect(r.alias).toBe("Claude Sonnet 4.5");
    expect(r.supportsImages).toBe(true);
    expect(r.enabled).toBe(true);
  });

  it("未匹配的模型返回 UNCONFIGURED_DEFAULT", () => {
    const r = resolveModelConfig("brand-new-llm-2099");
    expect(r.config).toBeNull();
    expect(r.alias).toBeUndefined();
    expect(r.enabled).toBe(UNCONFIGURED_DEFAULT.enabled);
    expect(r.supportsImages).toBe(UNCONFIGURED_DEFAULT.supportsImages);
  });

  it("enabled:false 的家族应被禁用", () => {
    const r = resolveModelConfig("o1-preview");
    expect(r.enabled).toBe(false);
  });
});

describe("applyModelConfigs", () => {
  it("过滤掉 enabled:false 的模型", () => {
    const result = applyModelConfigs([
      { id: "claude-sonnet-4-5", label: "Sonnet" },
      { id: "o1-preview", label: "O1 Preview" },
    ]);
    expect(result.map((m) => m.id)).toEqual(["claude-sonnet-4-5"]);
  });

  it("匹配到的模型 label 替换为 alias", () => {
    const result = applyModelConfigs([
      { id: "claude-sonnet-4-5", label: "Backend Sonnet Label" },
    ]);
    expect(result[0].label).toBe("Claude Sonnet 4.5");
  });

  it("未配置的模型保留后端原始 label", () => {
    const result = applyModelConfigs([
      { id: "future-model-x", label: "Future Model X" },
    ]);
    expect(result[0].label).toBe("Future Model X");
    expect(result[0].supportsImages).toBe(false);
  });

  it("注入 supportsImages 字段:已知多模态 → true,未配置 → false", () => {
    const result = applyModelConfigs([
      { id: "claude-sonnet-4-5", label: "Sonnet" },
      { id: "future-model-x", label: "Future" },
    ]);
    expect(result[0].supportsImages).toBe(true);
    expect(result[1].supportsImages).toBe(false);
  });

  it("空数组输入返回空数组", () => {
    expect(applyModelConfigs([])).toEqual([]);
  });
});
