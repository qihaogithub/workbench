import {
  applyModelConfigs,
  matchesId,
  resolveModelConfig,
  resolveCurrentModel,
  buildFullModelId,
  buildModelConfigs,
  MODEL_CONFIGS,
  applyModelConfigsWithFullData,
} from "@/lib/ai-models";

describe("matchesId", () => {
  it("字符串 matcher 走前缀匹配", () => {
    expect(matchesId("workbench/", "workbench/nemotron-3-super")).toBe(true);
    expect(matchesId("workbench/", "sensenova/nemotron-3-super")).toBe(false);
  });

  it("正则 matcher 走 .test()", () => {
    expect(matchesId(/.*/, "any-model")).toBe(true);
    expect(matchesId(/nemotron/i, "workbench/Nemotron-3-Super")).toBe(true);
  });
});

describe("buildModelConfigs", () => {
  it("无环境变量时只包含内置分组和 catch-all", () => {
    const configs = buildModelConfigs();
    const matchers = configs.map((c) => c.matcher);
    expect(matchers).toContain("workbench/");
    expect(matchers).toContain("jojo/");
    // 最后一条是 catch-all
    expect(configs[configs.length - 1].enabled).toBe(false);
  });
});

describe("resolveModelConfig", () => {
  it("workbench 分组下的模型应启用", () => {
    for (const id of [
      "workbench/nemotron-3-super",
      "workbench/deepseek-v4-flash",
      "workbench/any-model",
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

  it("动态前缀通过 MODEL_CONFIGS 注入后应启用", () => {
    // 模拟注入动态前缀：临时修改 MODEL_CONFIGS
    const original = [...MODEL_CONFIGS];
    const catchAll = MODEL_CONFIGS[MODEL_CONFIGS.length - 1];
    MODEL_CONFIGS.splice(MODEL_CONFIGS.length - 1, 0, { matcher: "custom/" });
    try {
      for (const id of ["custom/deepseek-v4-flash", "custom/any-model"]) {
        const r = resolveModelConfig(id);
        expect(r.enabled).toBe(true);
      }
    } finally {
      MODEL_CONFIGS.splice(0, MODEL_CONFIGS.length, ...original);
    }
  });
});

describe("applyModelConfigs", () => {
  it("仅保留白名单分组内的模型", () => {
    const result = applyModelConfigs([
      { id: "workbench/nemotron-3-super", label: "workbench/Nemotron 3 Super" },
      { id: "jojo/some-model", label: "jojo/Some Model" },
      { id: "sensenova/deepseek-v4-flash", label: "sensenova/DeepSeek V4 Flash" },
      { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
    ]);
    expect(result.map((m) => m.id)).toEqual([
      "workbench/nemotron-3-super",
      "jojo/some-model",
    ]);
  });

  it("去掉前缀后使用后端 label", () => {
    const result = applyModelConfigs([
      { id: "workbench/deepseek-v4-flash", label: "workbench/DeepSeek V4 Flash" },
    ]);
    expect(result[0].label).toBe("DeepSeek V4 Flash");
  });

  it("未配置 alias 且无前缀时使用原始 label", () => {
    const original = [...MODEL_CONFIGS];
    MODEL_CONFIGS.splice(0, MODEL_CONFIGS.length - 1);
    MODEL_CONFIGS.unshift({ matcher: /some-model/i });
    try {
      const result = applyModelConfigs([
        { id: "workbench/some-model", label: "Some Model" },
      ]);
      expect(result[0].label).toBe("Some Model");
    } finally {
      MODEL_CONFIGS.splice(0, MODEL_CONFIGS.length, ...original);
    }
  });

  it("从 id 前缀提取 group", () => {
    const result = applyModelConfigs([
      { id: "workbench/deepseek-v4-flash", label: "workbench/DeepSeek V4 Flash" },
      { id: "jojo/some-model", label: "jojo/Some Model" },
    ]);
    expect(result[0].group).toBe("workbench");
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
        { id: "workbench/nemotron-3-super-high", label: "workbench/Nemotron 3 Super High" },
        { id: "workbench/nemotron-3-super-low", label: "workbench/Nemotron 3 Super Low" },
        { id: "workbench/nemotron-3-super-medium", label: "workbench/Nemotron 3 Super Medium" },
      ]);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("workbench/nemotron-3-super");
      expect(result[0].supportsThinkingDepth).toBe(true);
      expect(result[0].availableDepths).toEqual(["low", "medium", "high"]);
      expect(result[0].depthVariantIds).toEqual({
        low: "workbench/nemotron-3-super-low",
        medium: "workbench/nemotron-3-super-medium",
        high: "workbench/nemotron-3-super-high",
      });
    } finally {
      MODEL_CONFIGS.splice(0, MODEL_CONFIGS.length, ...original);
    }
  });

  it("白名单模型默认 supportsImages 为 false", () => {
    const result = applyModelConfigs([
      { id: "workbench/model-a", label: "workbench/Model A" },
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

describe("applyModelConfigsWithFullData", () => {
  const rawModels = [
    { id: "deepseek/deepseek-v4-flash", label: "deepseek/DeepSeek V4 Flash" },
    { id: "deepseek/deepseek-v4-pro", label: "deepseek/DeepSeek V4 Pro" },
    { id: "jojo/deepseek-v4-flash", label: "jojo/DeepSeek V4 Flash" },
    { id: "jojo/kimi-k2.6", label: "jojo/Kimi K2.6" },
  ];

  const data = {
    configs: [
      { matcher: "deepseek/" },
      { matcher: "jojo/" },
      { matcher: /.*/, enabled: false },
    ],
    blacklist: new Set<string>(),
    nameFilters: [],
    autoEnableRules: [{ type: "prefix" as const, value: "jojo/" }],
  };

  it("存在 enabledModels 时严格只展示管理员启用的模型", () => {
    const result = applyModelConfigsWithFullData(rawModels, {
      ...data,
      enabledModels: [
        "deepseek/deepseek-v4-flash",
        "deepseek/deepseek-v4-pro",
      ],
    });

    expect(result.map((model) => model.id)).toEqual([
      "deepseek/deepseek-v4-flash",
      "deepseek/deepseek-v4-pro",
    ]);
  });

  it("enabledModels 为空数组时不回退展示全量或自动启用模型", () => {
    const result = applyModelConfigsWithFullData(rawModels, {
      ...data,
      enabledModels: [],
    });

    expect(result).toEqual([]);
  });

  it("没有 enabledModels 时保留旧前缀模式兼容", () => {
    const result = applyModelConfigsWithFullData(rawModels, data);

    expect(result.map((model) => model.id)).toEqual([
      "deepseek/deepseek-v4-flash",
      "deepseek/deepseek-v4-pro",
      "jojo/deepseek-v4-flash",
      "jojo/kimi-k2.6",
    ]);
  });
});

describe("resolveCurrentModel", () => {
  const models = applyModelConfigs([
    { id: "workbench/deepseek-v4-flash", label: "workbench/DeepSeek V4 Flash" },
    { id: "workbench/minimax-m2-5", label: "workbench/MiniMax M2.5" },
  ]);

  it("无思考深度的模型直接匹配", () => {
    const result = resolveCurrentModel("workbench/deepseek-v4-flash", models);
    expect(result).toEqual({ baseModelId: "workbench/deepseek-v4-flash" });
  });

  it("未匹配的模型返回 null", () => {
    const result = resolveCurrentModel("unknown-model", models);
    expect(result).toBeNull();
  });
});

describe("buildFullModelId", () => {
  const models = applyModelConfigs([
    { id: "workbench/deepseek-v4-flash", label: "workbench/DeepSeek V4 Flash" },
  ]);

  it("无深度时返回基础 id", () => {
    expect(buildFullModelId("workbench/deepseek-v4-flash", undefined, models)).toBe(
      "workbench/deepseek-v4-flash",
    );
  });

  it("模型不存在时返回基础 id", () => {
    expect(buildFullModelId("unknown", "high", models)).toBe("unknown");
  });
});
