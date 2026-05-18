import {
  applyModelConfigs,
  matchesId,
  resolveModelConfig,
  resolveCurrentModel,
  buildFullModelId,
  MODEL_CONFIGS,
} from "@/lib/ai-models";

describe("matchesId", () => {
  it("字符串 matcher 走前缀匹配", () => {
    expect(matchesId("opencode/", "opencode/nemotron-3-super")).toBe(true);
    expect(matchesId("opencode/", "sensenova/nemotron-3-super")).toBe(false);
  });

  it("正则 matcher 走 .test()", () => {
    expect(matchesId(/.*/, "any-model")).toBe(true);
    expect(matchesId(/nemotron/i, "opencode/Nemotron-3-Super")).toBe(true);
  });
});

describe("resolveModelConfig", () => {
  it("opencode 分组下的模型应启用", () => {
    for (const id of [
      "opencode/nemotron-3-super",
      "opencode/deepseek-v4-flash",
      "opencode/any-model",
    ]) {
      const r = resolveModelConfig(id);
      expect(r.enabled).toBe(true);
    }
  });

  it("jojo 分组下的模型应启用", () => {
    for (const id of [
      "jojo/some-model",
      "jojo/another-model",
    ]) {
      const r = resolveModelConfig(id);
      expect(r.enabled).toBe(true);
    }
  });

  it("不在白名单分组内的模型命中 catch-all,enabled 为 false", () => {
    for (const id of [
      "sensenova/deepseek-v4-flash",
      "claude-sonnet-4-5",
      "gpt-4o",
      "unknown/model",
    ]) {
      const r = resolveModelConfig(id);
      expect(r.config).not.toBeNull();
      expect(r.enabled).toBe(false);
    }
  });
});

describe("applyModelConfigs", () => {
  it("仅保留 opencode 和 jojo 分组的模型", () => {
    const result = applyModelConfigs([
      { id: "opencode/nemotron-3-super", label: "opencode/Nemotron 3 Super" },
      { id: "jojo/some-model", label: "jojo/Some Model" },
      { id: "sensenova/deepseek-v4-flash", label: "sensenova/DeepSeek V4 Flash" },
      { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
    ]);
    expect(result.map((m) => m.id)).toEqual([
      "opencode/nemotron-3-super",
      "jojo/some-model",
    ]);
  });

  it("去掉前缀后使用后端 label", () => {
    const result = applyModelConfigs([
      { id: "opencode/deepseek-v4-flash", label: "opencode/DeepSeek V4 Flash" },
    ]);
    expect(result[0].label).toBe("DeepSeek V4 Flash");
  });

  it("未配置 alias 且无前缀时使用原始 label", () => {
    const original = [...MODEL_CONFIGS];
    MODEL_CONFIGS.splice(0, MODEL_CONFIGS.length - 1);
    MODEL_CONFIGS.unshift({ matcher: /some-model/i });
    try {
      const result = applyModelConfigs([
        { id: "opencode/some-model", label: "Some Model" },
      ]);
      expect(result[0].label).toBe("Some Model");
    } finally {
      MODEL_CONFIGS.splice(0, MODEL_CONFIGS.length, ...original);
    }
  });

  it("从 id 前缀提取 group", () => {
    const result = applyModelConfigs([
      { id: "opencode/deepseek-v4-flash", label: "opencode/DeepSeek V4 Flash" },
      { id: "jojo/some-model", label: "jojo/Some Model" },
    ]);
    expect(result[0].group).toBe("opencode");
    expect(result[1].group).toBe("jojo");
  });

  it("思考深度变体合并为一条,availableDepths 按顺序排列", () => {
    const original = [...MODEL_CONFIGS];
    MODEL_CONFIGS.splice(0, MODEL_CONFIGS.length - 1);
    MODEL_CONFIGS.unshift({
      matcher: /nemotron/i,
      supportsThinkingDepth: true,
    });
    try {
      const result = applyModelConfigs([
        { id: "opencode/nemotron-3-super-high", label: "opencode/Nemotron 3 Super High" },
        { id: "opencode/nemotron-3-super-low", label: "opencode/Nemotron 3 Super Low" },
        { id: "opencode/nemotron-3-super-medium", label: "opencode/Nemotron 3 Super Medium" },
      ]);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("opencode/nemotron-3-super");
      expect(result[0].supportsThinkingDepth).toBe(true);
      expect(result[0].availableDepths).toEqual(["low", "medium", "high"]);
      expect(result[0].depthVariantIds).toEqual({
        low: "opencode/nemotron-3-super-low",
        medium: "opencode/nemotron-3-super-medium",
        high: "opencode/nemotron-3-super-high",
      });
    } finally {
      MODEL_CONFIGS.splice(0, MODEL_CONFIGS.length, ...original);
    }
  });

  it("白名单模型默认 supportsImages 为 false", () => {
    const result = applyModelConfigs([
      { id: "opencode/model-a", label: "opencode/Model A" },
      { id: "jojo/model-b", label: "jojo/Model B" },
    ]);
    for (const m of result) {
      expect(m.supportsImages).toBe(false);
    }
  });

  it("空数组输入返回空数组", () => {
    expect(applyModelConfigs([])).toEqual([]);
  });
});

describe("resolveCurrentModel", () => {
  const models = applyModelConfigs([
    { id: "opencode/deepseek-v4-flash", label: "opencode/DeepSeek V4 Flash" },
    { id: "opencode/minimax-m2-5", label: "opencode/MiniMax M2.5" },
  ]);

  it("无思考深度的模型直接匹配", () => {
    const result = resolveCurrentModel("opencode/deepseek-v4-flash", models);
    expect(result).toEqual({ baseModelId: "opencode/deepseek-v4-flash" });
  });

  it("未匹配的模型返回 null", () => {
    const result = resolveCurrentModel("unknown-model", models);
    expect(result).toBeNull();
  });
});

describe("buildFullModelId", () => {
  const models = applyModelConfigs([
    { id: "opencode/deepseek-v4-flash", label: "opencode/DeepSeek V4 Flash" },
  ]);

  it("无深度时返回基础 id", () => {
    expect(buildFullModelId("opencode/deepseek-v4-flash", undefined, models)).toBe(
      "opencode/deepseek-v4-flash",
    );
  });

  it("模型不存在时返回基础 id", () => {
    expect(buildFullModelId("unknown", "high", models)).toBe("unknown");
  });
});
