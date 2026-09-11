/**
 * AI 模型前端配置表(白名单模式)
 *
 * 维护规则:
 * - 添加新模型:在 catch-all 之前追加一条,matcher 用正则覆盖 id 变体
 * - 标记思考深度:在条目中加 `supportsThinkingDepth: true`,前端会自动检测 -low/-medium/-high 变体并分组
 * - 自定义展示名:在条目中加 `alias`(否则去掉前缀后使用后端 label)
 * - 末尾的 catch-all `{ matcher: /.*\//, enabled: false }` 禁用所有未列入白名单的模型
 *
 * 配置读取:
 * - 优先使用服务端返回的 canonical frontend policy
 * - API 不可用时使用当前 agent session 已提供的模型列表
 */

export type ModelMatcher = RegExp | string;

export type AutoEnableRule =
  | { type: "prefix"; value: string }
  | { type: "nameFilter"; value: string };

export interface FrontendModelPolicy {
  enabledModels: string[];
  autoEnableRules: AutoEnableRule[];
  excludedModels: string[];
}

export type ThinkingDepth = "low" | "medium" | "high";

export const THINKING_DEPTHS: ThinkingDepth[] = ["low", "medium", "high"];

export const THINKING_DEPTH_LABELS: Record<ThinkingDepth, string> = {
  low: "低",
  medium: "中",
  high: "高",
};

const DEPTH_PATTERN = /-(low|medium|high)$/;

export type ModelConfig = {
  /** 匹配后端原始 model id 的正则,或字符串前缀 */
  matcher: ModelMatcher;
  /** 是否在下拉框中展示,默认 true */
  enabled?: boolean;
  /** 自定义展示名,缺省时去掉前缀后使用后端 label */
  alias?: string;
  /** 是否支持思考深度选择(后端需提供 -low/-medium/-high 变体),默认 false */
  supportsThinkingDepth?: boolean;
};

export const UNCONFIGURED_DEFAULT = {
  enabled: true,
  supportsThinkingDepth: false,
} as const;

export type ResolvedModel = {
  /** 基础模型 id(不含思考深度后缀) */
  id: string;
  /** 展示名 */
  label: string;
  /** 分组名(从 id 前缀提取,如 "sensenova") */
  group: string;
  supportsThinkingDepth: boolean;
  /** 可用的思考深度选项 */
  availableDepths: ThinkingDepth[];
  /** 思考深度 → 完整模型 id 的映射 */
  depthVariantIds: Record<string, string>;
};

export function resolveDefaultModelId(
  models: ResolvedModel[],
  enabledModels: string[] = [],
): string | null {
  if (models.length === 0) return null;
  for (const modelId of enabledModels) {
    for (const model of models) {
      if (model.id === modelId) return model.id;
      if (Object.values(model.depthVariantIds).includes(modelId)) return model.id;
    }
  }
  return models[0].id;
}

/**
 * 模型配置表 — 按分组放行
 *
 * 列表顺序即匹配优先级,首个命中的配置生效;最后一条 catch-all 禁用其余所有模型。
 * 分组即模型 id 中 `/` 前的前缀,如 `workbench/nemotron-3-super` 的分组为 `workbench`。
 *
 * 动态 provider 规则由服务端 canonical policy 注入；共享包本身不读取
 * NEXT_PUBLIC 模型过滤变量。
 */
export function buildModelConfigs(): ModelConfig[] {
  return [
    // === 内置分组:始终放行 ===
    { matcher: "workbench/" },
    { matcher: "jojo/" },

    // === 其他分组全部禁用 ===
    { matcher: /.*/, enabled: false },
  ];
}

export const MODEL_CONFIGS: ModelConfig[] = buildModelConfigs();

export function matchesId(matcher: ModelMatcher, id: string): boolean {
  if (typeof matcher === "string") return id.startsWith(matcher);
  return matcher.test(id);
}

export function resolveModelConfig(rawId: string): {
  config: ModelConfig | null;
  enabled: boolean;
  alias: string | undefined;
  supportsThinkingDepth: boolean;
} {
  const config = MODEL_CONFIGS.find((c) => matchesId(c.matcher, rawId)) ?? null;
  return {
    config,
    enabled: config?.enabled ?? UNCONFIGURED_DEFAULT.enabled,
    alias: config?.alias,
    supportsThinkingDepth:
      config?.supportsThinkingDepth ??
      UNCONFIGURED_DEFAULT.supportsThinkingDepth,
  };
}

function extractGroup(id: string): string {
  const idx = id.indexOf("/");
  return idx >= 0 ? id.slice(0, idx) : "";
}

function stripPrefix(label: string): string {
  return label.replace(/^[^/]+\//, "");
}

function parseDepthSuffix(id: string): {
  baseId: string;
  depth?: ThinkingDepth;
} {
  const match = id.match(DEPTH_PATTERN);
  if (match) {
    return {
      baseId: id.slice(0, -match[0].length),
      depth: match[1] as ThinkingDepth,
    };
  }
  return { baseId: id };
}

export function applyModelConfigs(
  raw: Array<{ id: string; label: string }>,
): ResolvedModel[] {
  return applyModelConfigsWithData(raw);
}

/**
 * 浏览端直接展示 agent-service 已按当前会话返回的可用模型。
 * 该列表已经过服务端供应商配置约束，不应再依赖 viewer-site 不存在的
 * author-site `/api/models/config` 接口做第二次过滤。
 */
export function applyViewerModelConfigs(
  raw: Array<{ id: string; label: string }>,
): ResolvedModel[] {
  return applyModelConfigsWithFullData(raw, {
    configs: [{ matcher: /.*/ }],
    excludedModels: new Set<string>(),
  });
}

/**
 * 异步版本: 通过 API 从数据库读取 canonical frontend policy 并应用
 * 通过 HTTP API 读取,避免客户端直接依赖 Node.js 模块
 * Fallback 到环境变量配置
 *
 * @param raw 原始模型列表
 */
export async function applyModelConfigsAsync(
  raw: Array<{ id: string; label: string }>,
): Promise<ResolvedModel[]> {
  let configData: {
    enabledModels: string[];
    autoEnableRules: AutoEnableRule[];
    excludedModels: string[];
  };

  try {
    const res = await fetch("/api/models/config");
    if (res.ok) {
      const { data } = await res.json();
      configData = {
        enabledModels: Array.isArray(data.frontend?.enabledModels)
          ? data.frontend.enabledModels
          : [],
        autoEnableRules: Array.isArray(data.frontend?.autoEnableRules)
          ? data.frontend.autoEnableRules
          : [],
        excludedModels: Array.isArray(data.frontend?.excludedModels)
          ? data.frontend.excludedModels
          : [],
      };
    } else {
      configData = getEnvFallbackConfig();
    }
  } catch {
    configData = getEnvFallbackConfig();
  }

  return applyModelConfigsWithFullData(raw, {
    configs: [{ matcher: /.*/ }],
    excludedModels: new Set(configData.excludedModels),
    enabledModels: configData.enabledModels,
    autoEnableRules: configData.autoEnableRules,
  });
}

/**
 * 环境变量 fallback 配置 (当 API 不可用时使用)
 */
function getEnvFallbackConfig() {
  return {
    enabledModels: [],
    autoEnableRules: [],
    excludedModels: [],
  };
}

/**
 * 使用完整配置数据应用模型过滤
 *
 * 支持两种模式:
 * 1. 启用列表模式 (enabledModels 存在时):
 *    - 放行 enabledModels 中的模型,按列表顺序返回
 *    - 非空 enabledModels 允许 autoEnableRules 追加新发现模型
 *    - enabledModels 为空数组表示管理员未启用任何模型
 * 2. 静态配置模式 (enabledModels 未提供时):
 *    - 使用调用方提供的 configs 过滤
 *
 * @param raw 原始模型列表
 * @param data 完整的配置数据
 */
export function applyModelConfigsWithFullData(
  raw: Array<{ id: string; label: string }>,
  data: {
    configs: ModelConfig[];
    excludedModels: Set<string>;
    enabledModels?: string[];
    autoEnableRules?: AutoEnableRule[];
  },
): ResolvedModel[] {
  const {
    configs,
    excludedModels,
    enabledModels,
    autoEnableRules,
  } = data;

  const useEnabledList = Array.isArray(enabledModels);
  const enabledSet = useEnabledList ? new Set(enabledModels) : null;
  // An explicitly empty list is an intentional "disable all" choice. For a
  // non-empty list, auto-enable rules admit newly discovered models without
  // changing the administrator's ordering of explicitly enabled models.
  const applyAutoEnableRules =
    useEnabledList && (enabledModels?.length ?? 0) > 0;

  const matchesAutoEnableRule = (
    model: { id: string; label: string },
    rule: { type: "prefix" | "nameFilter"; value: string },
  ): boolean => {
    if (rule.type === "prefix") {
      return model.id.startsWith(rule.value);
    }

    const separator = rule.value.indexOf(":");
    if (separator < 0) return false;
    const group = rule.value.slice(0, separator).trim();
    const keyword = rule.value.slice(separator + 1).trim().toLowerCase();
    if (!group || !keyword || extractGroup(model.id) !== group) {
      return false;
    }

    return (
      model.id.toLowerCase().includes(keyword) ||
      model.label.toLowerCase().includes(keyword)
    );
  };

  const parsed: Array<{
    rawId: string;
    rawLabel: string;
    baseId: string;
    depth?: ThinkingDepth;
    group: string;
    alias: string | undefined;
    supportsThinkingDepth: boolean;
  }> = [];

  for (const m of raw) {
    // 启用列表模式下严格以管理员启用列表为准。
    // 非空启用列表允许自动规则追加新发现的模型；空列表仍表示明确禁用全部模型。
    if (useEnabledList) {
      const inEnabledList = enabledSet!.has(m.id);
      const autoEnabled =
        applyAutoEnableRules &&
        autoEnableRules?.some((rule) => matchesAutoEnableRule(m, rule));
      if (!inEnabledList && !autoEnabled) continue;
    } else {
      // 没有远程 canonical policy 时使用调用方的静态配置。
      const config = configs.find((c) => matchesId(c.matcher, m.id)) ?? null;
      const enabled = config?.enabled ?? UNCONFIGURED_DEFAULT.enabled;
      if (!enabled) continue;
    }

    // 获取 config 用于解析展示名和思考深度 (即使在启用列表模式下也需要)
    const config = configs.find((c) => matchesId(c.matcher, m.id)) ?? null;

    const group = extractGroup(m.id);
    let baseId = m.id;
    let depth: ThinkingDepth | undefined;
    const supportsThinkingDepth =
      config?.supportsThinkingDepth ??
      UNCONFIGURED_DEFAULT.supportsThinkingDepth;

    if (supportsThinkingDepth) {
      const parsed2 = parseDepthSuffix(m.id);
      baseId = parsed2.baseId;
      depth = parsed2.depth;
    }

    parsed.push({
      rawId: m.id,
      rawLabel: m.label,
      baseId,
      depth,
      group,
      alias: config?.alias,
      supportsThinkingDepth,
    });
  }

  const baseMap = new Map<string, typeof parsed>();
  for (const p of parsed) {
    const key = p.supportsThinkingDepth ? p.baseId : p.rawId;
    if (!baseMap.has(key)) baseMap.set(key, []);
    baseMap.get(key)!.push(p);
  }

  // 保留原始顺序的 result (用于后续按 enabledModels 重排)
  const unorderedResult: ResolvedModel[] = [];

  for (const [, entries] of baseMap) {
    const first = entries[0];
    const label = first.alias || stripPrefix(first.rawLabel);

    if (first.supportsThinkingDepth) {
      const availableDepths: ThinkingDepth[] = [];
      const depthVariantIds: Record<string, string> = {};

      for (const entry of entries) {
        if (entry.depth) {
          availableDepths.push(entry.depth);
          depthVariantIds[entry.depth] = entry.rawId;
        }
      }

      availableDepths.sort(
        (a, b) => THINKING_DEPTHS.indexOf(a) - THINKING_DEPTHS.indexOf(b),
      );

      unorderedResult.push({
        id: first.baseId,
        label,
        group: first.group,
        supportsThinkingDepth: availableDepths.length >= 2,
        availableDepths,
        depthVariantIds,
      });
    } else {
      unorderedResult.push({
        id: first.rawId,
        label,
        group: first.group,
        supportsThinkingDepth: false,
        availableDepths: [],
        depthVariantIds: {},
      });
    }
  }

  // excludedModels 是持续排除规则，始终优先于显式启用和自动规则。
  const filtered = unorderedResult.filter((model) => {
    if (excludedModels.has(model.id)) return false;
    for (const variantId of Object.values(model.depthVariantIds)) {
      if (excludedModels.has(variantId)) return false;
    }
    return true;
  });

  // 启用列表模式: 显式启用模型按 enabledModels 顺序排列，自动启用模型追加到末尾。
  if (useEnabledList && enabledModels) {
    const orderMap = new Map<string, number>();
    enabledModels.forEach((id, idx) => orderMap.set(id, idx));

    const explicitlyEnabled = filtered.filter((model) => orderMap.has(model.id));
    const autoEnabled = filtered.filter((model) => !orderMap.has(model.id));

    explicitlyEnabled.sort(
      (a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0),
    );

    return [...explicitlyEnabled, ...autoEnabled];
  }

  return filtered;
}

/**
 * 应用模型配置 (支持数据库配置)
 *
 * @param raw 原始模型列表
 * @param configData 配置数据 (从数据库或环境变量)
 */
export function applyModelConfigsWithData(
  raw: Array<{ id: string; label: string }>,
  configData: { excludedModels?: string[] } = {},
): ResolvedModel[] {
  const parsed: Array<{
    rawId: string;
    rawLabel: string;
    baseId: string;
    depth?: ThinkingDepth;
    group: string;
    alias: string | undefined;
    supportsThinkingDepth: boolean;
  }> = [];

  for (const m of raw) {
    const r = resolveModelConfig(m.id);
    if (!r.enabled) continue;

    const group = extractGroup(m.id);

    let baseId = m.id;
    let depth: ThinkingDepth | undefined;

    if (r.supportsThinkingDepth) {
      const parsed2 = parseDepthSuffix(m.id);
      baseId = parsed2.baseId;
      depth = parsed2.depth;
    }

    parsed.push({
      rawId: m.id,
      rawLabel: m.label,
      baseId,
      depth,
      group,
      alias: r.alias,
      supportsThinkingDepth: r.supportsThinkingDepth,
    });
  }

  const baseMap = new Map<string, typeof parsed>();
  for (const p of parsed) {
    const key = p.supportsThinkingDepth ? p.baseId : p.rawId;
    if (!baseMap.has(key)) baseMap.set(key, []);
    baseMap.get(key)!.push(p);
  }

  const result: ResolvedModel[] = [];

  for (const [, entries] of baseMap) {
    const first = entries[0];
    const label = first.alias || stripPrefix(first.rawLabel);

    if (first.supportsThinkingDepth) {
      const availableDepths: ThinkingDepth[] = [];
      const depthVariantIds: Record<string, string> = {};

      for (const entry of entries) {
        if (entry.depth) {
          availableDepths.push(entry.depth);
          depthVariantIds[entry.depth] = entry.rawId;
        }
      }

      availableDepths.sort(
        (a, b) => THINKING_DEPTHS.indexOf(a) - THINKING_DEPTHS.indexOf(b),
      );

      result.push({
        id: first.baseId,
        label,
        group: first.group,
        supportsThinkingDepth: availableDepths.length >= 2,
        availableDepths,
        depthVariantIds,
      });
    } else {
      result.push({
        id: first.rawId,
        label,
        group: first.group,
        supportsThinkingDepth: false,
        availableDepths: [],
        depthVariantIds: {},
      });
    }
  }

  const excludedModels = new Set(configData.excludedModels ?? []);

  return result.filter((model) => {
    if (excludedModels.has(model.id)) return false;
    for (const variantId of Object.values(model.depthVariantIds)) {
      if (excludedModels.has(variantId)) return false;
    }

    return true;
  });
}

export function resolveCurrentModel(
  fullModelId: string,
  models: ResolvedModel[],
): { baseModelId: string; depth?: ThinkingDepth } | null {
  const directMatch = models.find((m) => m.id === fullModelId);
  if (directMatch) {
    return { baseModelId: directMatch.id };
  }

  for (const model of models) {
    for (const [depth, variantId] of Object.entries(model.depthVariantIds)) {
      if (variantId === fullModelId) {
        return { baseModelId: model.id, depth: depth as ThinkingDepth };
      }
    }
  }

  return null;
}

export function buildFullModelId(
  baseModelId: string,
  depth: ThinkingDepth | undefined,
  models: ResolvedModel[],
): string {
  if (!depth) return baseModelId;
  const model = models.find((m) => m.id === baseModelId);
  if (!model) return baseModelId;
  return model.depthVariantIds[depth] || baseModelId;
}
