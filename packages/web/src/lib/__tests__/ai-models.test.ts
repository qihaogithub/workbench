import {
  applyModelConfigs,
  matchesId,
  resolveModelConfig,
} from "@/lib/ai-models";

describe("matchesId", () => {
  it("字符串 matcher 走前缀匹配", () => {
    expect(matchesId("nemotron-", "nemotron-3-super")).toBe(true);
    expect(matchesId("nemotron-", "opencode/nemotron-3-super")).toBe(false);
  });

  it("正则 matcher 走 .test()", () => {
    expect(matchesId(/nemotron/i, "opencode/Nemotron-3-Super")).toBe(true);
    expect(matchesId(/nemotron/i, "minimax-m2-5")).toBe(false);
  });
});

describe("resolveModelConfig", () => {
  it("白名单内的 nemotron 变体应启用", () => {
    for (const id of [
      "nemotron-3-super",
      "nemotron-3-super-low",
      "nemotron-3-super-medium",
      "nemotron-3-super-high",
    ]) {
      const r = resolveModelConfig(id);
      expect(r.enabled).toBe(true);
      expect(r.supportsImages).toBe(false);
    }
  });

  it("白名单内的 minimax 与 hy3 变体应启用", () => {
    expect(resolveModelConfig("minimax-m2-5").enabled).toBe(true);
    expect(resolveModelConfig("hy3-preview-low").enabled).toBe(true);
    expect(resolveModelConfig("hy3-preview-high").enabled).toBe(true);
  });

  it("未列入白名单的模型命中 catch-all,enabled 为 false", () => {
    for (const id of [
      "claude-sonnet-4-5",
      "gpt-4o",
      "o1-preview",
      "future-model-x",
    ]) {
      const r = resolveModelConfig(id);
      expect(r.config).not.toBeNull();
      expect(r.enabled).toBe(false);
    }
  });
});

describe("applyModelConfigs", () => {
  it("仅保留白名单内的模型", () => {
    const result = applyModelConfigs([
      { id: "opencode/nemotron-3-super-high", label: "Nemotron 3 Super High" },
      { id: "minimax-m2-5", label: "MiniMax M2.5" },
      { id: "hy3-preview-low", label: "Hy3 Preview Low" },
      { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
      { id: "gpt-4o", label: "GPT-4o" },
    ]);
    expect(result.map((m) => m.id)).toEqual([
      "opencode/nemotron-3-super-high",
      "minimax-m2-5",
      "hy3-preview-low",
    ]);
  });

  it("未配置 alias 时保留后端原始 label", () => {
    const result = applyModelConfigs([
      { id: "minimax-m2-5", label: "Backend MiniMax Label" },
    ]);
    expect(result[0].label).toBe("Backend MiniMax Label");
  });

  it("白名单模型默认 supportsImages 为 false", () => {
    const result = applyModelConfigs([
      { id: "nemotron-3-super-medium", label: "Nemotron" },
      { id: "minimax-m2-5", label: "MiniMax" },
      { id: "hy3-preview-high", label: "Hy3" },
    ]);
    for (const m of result) {
      expect(m.supportsImages).toBe(false);
    }
  });

  it("空数组输入返回空数组", () => {
    expect(applyModelConfigs([])).toEqual([]);
  });
});
