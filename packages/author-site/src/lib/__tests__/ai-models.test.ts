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
    expect(matchesId("nemotron-", "nemotron-3-super")).toBe(true);
    expect(matchesId("nemotron-", "opencode/nemotron-3-super")).toBe(false);
  });

  it("正则 matcher 走 .test()", () => {
    expect(matchesId(/nemotron/i, "opencode/Nemotron-3-Super")).toBe(true);
    expect(matchesId(/nemotron/i, "minimax-m2-5")).toBe(false);
  });
});

describe("resolveModelConfig", () => {
  it("白名单内的 nemotron 变体应启用且支持思考深度", () => {
    for (const id of [
      "nemotron-3-super",
      "nemotron-3-super-low",
      "nemotron-3-super-medium",
      "nemotron-3-super-high",
    ]) {
      const r = resolveModelConfig(id);
      expect(r.enabled).toBe(true);
      expect(r.supportsImages).toBe(false);
      expect(r.supportsThinkingDepth).toBe(true);
    }
  });

  it("白名单内的 minimax 应启用但不支持思考深度", () => {
    const r = resolveModelConfig("minimax-m2-5");
    expect(r.enabled).toBe(true);
    expect(r.supportsThinkingDepth).toBe(false);
  });

  it("白名单内的 hy3 变体应启用且支持思考深度", () => {
    expect(resolveModelConfig("hy3-preview-low").enabled).toBe(true);
    expect(resolveModelConfig("hy3-preview-low").supportsThinkingDepth).toBe(true);
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
      "opencode/nemotron-3-super",
      "minimax-m2-5",
      "hy3-preview",
    ]);
  });

  it("alias 直接作为 label,不做前缀/后缀处理", () => {
    const result = applyModelConfigs([
      { id: "sensenova/minimax-m2-5", label: "sensenova/MiniMax M2.5" },
    ]);
    expect(result[0].label).toBe("MiniMax M2.5");
  });

  it("未配置 alias 时去掉前缀后使用后端 label", () => {
    const original = [...MODEL_CONFIGS];
    MODEL_CONFIGS.splice(0, MODEL_CONFIGS.length - 1);
    MODEL_CONFIGS.unshift({ matcher: /some-model/i });
    try {
      const result = applyModelConfigs([
        { id: "sensenova/some-model", label: "sensenova/Some Model" },
      ]);
      expect(result[0].label).toBe("Some Model");
    } finally {
      MODEL_CONFIGS.splice(0, MODEL_CONFIGS.length, ...original);
    }
  });

  it("从 id 前缀提取 group", () => {
    const result = applyModelConfigs([
      { id: "sensenova/deepseek-v4-flash", label: "sensenova/DeepSeek V4 Flash" },
      { id: "minimax-m2-5", label: "MiniMax M2.5" },
    ]);
    expect(result[0].group).toBe("sensenova");
    expect(result[1].group).toBe("");
  });

  it("思考深度变体合并为一条,availableDepths 按顺序排列", () => {
    const result = applyModelConfigs([
      { id: "sensenova/nemotron-3-super-high", label: "sensenova/Nemotron 3 Super High" },
      { id: "sensenova/nemotron-3-super-low", label: "sensenova/Nemotron 3 Super Low" },
      { id: "sensenova/nemotron-3-super-medium", label: "sensenova/Nemotron 3 Super Medium" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("sensenova/nemotron-3-super");
    expect(result[0].supportsThinkingDepth).toBe(true);
    expect(result[0].availableDepths).toEqual(["low", "medium", "high"]);
    expect(result[0].depthVariantIds).toEqual({
      low: "sensenova/nemotron-3-super-low",
      medium: "sensenova/nemotron-3-super-medium",
      high: "sensenova/nemotron-3-super-high",
    });
  });

  it("仅一个深度变体时 supportsThinkingDepth 为 false", () => {
    const result = applyModelConfigs([
      { id: "sensenova/nemotron-3-super-medium", label: "sensenova/Nemotron 3 Super Medium" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].supportsThinkingDepth).toBe(false);
    expect(result[0].availableDepths).toEqual(["medium"]);
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

describe("resolveCurrentModel", () => {
  const models = applyModelConfigs([
    { id: "sensenova/deepseek-v4-flash", label: "sensenova/DeepSeek V4 Flash" },
    { id: "sensenova/nemotron-3-super-low", label: "sensenova/Nemotron 3 Super Low" },
    { id: "sensenova/nemotron-3-super-medium", label: "sensenova/Nemotron 3 Super Medium" },
    { id: "sensenova/nemotron-3-super-high", label: "sensenova/Nemotron 3 Super High" },
    { id: "sensenova/minimax-m2-5", label: "sensenova/MiniMax M2.5" },
  ]);

  it("无思考深度的模型直接匹配", () => {
    const result = resolveCurrentModel("sensenova/deepseek-v4-flash", models);
    expect(result).toEqual({ baseModelId: "sensenova/deepseek-v4-flash" });
  });

  it("思考深度变体匹配到基础模型和深度", () => {
    const result = resolveCurrentModel("sensenova/nemotron-3-super-high", models);
    expect(result).toEqual({
      baseModelId: "sensenova/nemotron-3-super",
      depth: "high",
    });
  });

  it("未匹配的模型返回 null", () => {
    const result = resolveCurrentModel("unknown-model", models);
    expect(result).toBeNull();
  });
});

describe("buildFullModelId", () => {
  const models = applyModelConfigs([
    { id: "sensenova/nemotron-3-super-low", label: "sensenova/Nemotron 3 Super Low" },
    { id: "sensenova/nemotron-3-super-high", label: "sensenova/Nemotron 3 Super High" },
    { id: "sensenova/deepseek-v4-flash", label: "sensenova/DeepSeek V4 Flash" },
  ]);

  it("有深度时返回变体 id", () => {
    expect(buildFullModelId("sensenova/nemotron-3-super", "high", models)).toBe(
      "sensenova/nemotron-3-super-high",
    );
  });

  it("无深度时返回基础 id", () => {
    expect(buildFullModelId("sensenova/deepseek-v4-flash", undefined, models)).toBe(
      "sensenova/deepseek-v4-flash",
    );
  });

  it("模型不存在时返回基础 id", () => {
    expect(buildFullModelId("unknown", "high", models)).toBe("unknown");
  });
});
