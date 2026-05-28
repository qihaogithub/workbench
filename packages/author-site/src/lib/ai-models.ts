/**
 * AI 模型前端配置表(白名单模式)
 *
 * 维护规则:
 * - 添加新模型:在 catch-all 之前追加一条,matcher 用正则覆盖 id 变体
 * - 标记多模态:在条目中加 `supportsImages: true`
 * - 标记思考深度:在条目中加 `supportsThinkingDepth: true`,前端会自动检测 -low/-medium/-high 变体并分组
 * - 自定义展示名:在条目中加 `alias`(否则去掉前缀后使用后端 label)
 * - 末尾的 catch-all `{ matcher: /.*\//, enabled: false }` 禁用所有未列入白名单的模型
 *
 * 配置读取:
 * - 优先使用数据库配置 (通过管理后台动态配置)
 * - Fallback 到环境变量 (保持向后兼容)
 * - 使用 model-config.ts 中的 getModelConfig() 函数
 */

export type ModelMatcher = RegExp | string;

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
  /** 是否支持图片输入,默认 false */
  supportsImages?: boolean;
  /** 是否支持思考深度选择(后端需提供 -low/-medium/-high 变体),默认 false */
  supportsThinkingDepth?: boolean;
};

export const UNCONFIGURED_DEFAULT = {
  enabled: true,
  supportsImages: false,
  supportsThinkingDepth: false,
} as const;

export type ResolvedModel = {
  /** 基础模型 id(不含思考深度后缀) */
  id: string;
  /** 展示名 */
  label: string;
  /** 分组名(从 id 前缀提取,如 "sensenova") */
  group: string;
  supportsImages: boolean;
  supportsThinkingDepth: boolean;
  /** 可用的思考深度选项 */
  availableDepths: ThinkingDepth[];
  /** 思考深度 → 完整模型 id 的映射 */
  depthVariantIds: Record<string, string>;
};

/**
 * 从配置数据解析动态白名单前缀
 *
 * 格式: 前缀数组,如 ["deepseek/", "qwen/", "custom/"]
 * 未设置时默认为空(不额外放行任何分组)
 */
function parseDynamicPrefixesFromConfig(prefixes: string[]): ModelConfig[] {
  if (!prefixes || prefixes.length === 0) return [];
  return prefixes.map((prefix) => ({ matcher: prefix }));
}

/**
 * 从环境变量 NEXT_PUBLIC_ALLOWED_MODEL_PREFIXES 解析动态白名单前缀
 *
 * 格式: 逗号分隔的前缀列表,如 "deepseek/,qwen/,custom/"
 * 未设置时默认为空(不额外放行任何分组)
 *
 * @deprecated 使用 parseDynamicPrefixesFromConfig 替代
 */
function parseDynamicPrefixes(): ModelConfig[] {
  const raw = process.env.NEXT_PUBLIC_ALLOWED_MODEL_PREFIXES || "";
  if (!raw.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((prefix) => ({ matcher: prefix }));
}

/**
 * 从配置数据解析黑名单模型 ID 集合
 *
 * 格式: 完整模型 ID 数组,如 ["xjjj/old-model", "xjjj/test-model"]
 * 黑名单中的模型会在白名单过滤之后被排除
 */
function parseBlacklistFromConfig(blacklist: string[]): Set<string> {
  if (!blacklist || blacklist.length === 0) return new Set();
  return new Set(blacklist);
}

/**
 * 从环境变量 NEXT_PUBLIC_MODEL_BLACKLIST 解析黑名单模型 ID 集合
 *
 * 格式: 逗号分隔的完整模型 ID,如 "xjjj/old-model,xjjj/test-model"
 * 黑名单中的模型会在白名单过滤之后被排除
 *
 * @deprecated 使用 parseBlacklistFromConfig 替代
 */
function parseBlacklist(): Set<string> {
  const raw = process.env.NEXT_PUBLIC_MODEL_BLACKLIST || "";
  if (!raw.trim()) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/**
 * 从配置数据解析分组名称过滤器
 *
 * 格式: "分组:关键词" 数组,如 ["opencode:Free", "othergroup:Pro"]
 * 配置后,该分组下仅保留模型名称中包含指定关键词的模型
 * 大小写不敏感;未配置的分组不受限制
 */
function parseNameFiltersFromConfig(
  filters: string[],
): Array<{ group: string; keyword: string }> {
  if (!filters || filters.length === 0) return [];
  return filters
    .map((entry) => {
      const idx = entry.indexOf(":");
      if (idx < 0) return { group: entry, keyword: "" };
      return {
        group: entry.slice(0, idx).trim(),
        keyword: entry
          .slice(idx + 1)
          .trim()
          .toLowerCase(),
      };
    })
    .filter((f) => f.keyword.length > 0);
}

/**
 * 从环境变量 NEXT_PUBLIC_MODEL_NAME_FILTERS 解析分组名称过滤器
 *
 * 格式: 逗号分隔的 "分组:关键词" 条目,如 "opencode:Free,othergroup:Pro"
 * 配置后,该分组下仅保留模型名称中包含指定关键词的模型
 * 大小写不敏感;未配置的分组不受限制
 *
 * @deprecated 使用 parseNameFiltersFromConfig 替代
 */
function parseNameFilters(): Array<{ group: string; keyword: string }> {
  const raw = process.env.NEXT_PUBLIC_MODEL_NAME_FILTERS || "";
  if (!raw.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const idx = entry.indexOf(":");
      if (idx < 0) return { group: entry, keyword: "" };
      return {
        group: entry.slice(0, idx).trim(),
        keyword: entry
          .slice(idx + 1)
          .trim()
          .toLowerCase(),
      };
    })
    .filter((f) => f.keyword.length > 0);
}

/**
 * 从环境变量 NEXT_PUBLIC_DEFAULT_MODEL_IDS 解析默认模型 ID 列表
 *
 * 格式: 逗号分隔的完整模型 ID,按优先级从高到低排列
 * 如 "xjjj/deepseek-v4-flash,xjjj/gpt-model"
 * 未设置时为空数组
 */
function parseDefaultModelIds(): string[] {
  const raw = process.env.NEXT_PUBLIC_DEFAULT_MODEL_IDS || "";
  if (!raw.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isModelBlacklisted(id: string): boolean {
  return parseBlacklist().has(id);
}

/**
 * 解析默认模型 ID
 *
 * 按优先级顺序尝试匹配默认模型列表中的每个 ID:
 *   1. 先精确匹配 id
 *   2. 再尝试匹配深度变体 (depthVariantIds)
 * 如果默认列表中的所有模型都未在可用模型中找到,
 * 则回退到可用模型列表的第一个模型。
 *
 * 返回最终选定的模型基础 ID,如果可用模型列表为空则返回 null
 */
export function resolveDefaultModelId(models: ResolvedModel[]): string | null {
  if (models.length === 0) return null;

  const defaultIds = parseDefaultModelIds();
  for (const defaultId of defaultIds) {
    for (const model of models) {
      if (model.id === defaultId) return defaultId;
      for (const variantId of Object.values(model.depthVariantIds)) {
        if (variantId === defaultId) return model.id;
      }
    }
  }

  return models[0].id;
}

/**
 * 模型配置表 — 按分组放行
 *
 * 列表顺序即匹配优先级,首个命中的配置生效;最后一条 catch-all 禁用其余所有模型。
 * 分组即模型 id 中 `/` 前的前缀,如 `opencode/nemotron-3-super` 的分组为 `opencode`。
 *
 * 动态前缀通过环境变量 NEXT_PUBLIC_ALLOWED_MODEL_PREFIXES 注入,
 * 无需修改代码即可支持用户自定义的供应商名称。
 */
export function buildModelConfigs(): ModelConfig[] {
  return [
    // === 内置分组:始终放行 ===
    { matcher: "opencode/" },
    { matcher: "jojo/" },

    // === 动态分组:通过环境变量注入的用户自定义供应商前缀 ===
    ...parseDynamicPrefixes(),

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
  supportsImages: boolean;
  supportsThinkingDepth: boolean;
} {
  const config = MODEL_CONFIGS.find((c) => matchesId(c.matcher, rawId)) ?? null;
  return {
    config,
    enabled: config?.enabled ?? UNCONFIGURED_DEFAULT.enabled,
    alias: config?.alias,
    supportsImages:
      config?.supportsImages ?? UNCONFIGURED_DEFAULT.supportsImages,
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
  return applyModelConfigsWithData(raw, {
    blacklist: [],
    nameFilters: [],
  });
}

/**
 * 异步版本: 通过 API 从数据库读取完整配置并应用
 *
 * 包含白名单前缀、黑名单、名称过滤器等全部配置
 * 通过 HTTP API 读取,避免客户端直接依赖 Node.js 模块
 * Fallback 到环境变量配置
 *
 * @param raw 原始模型列表
 */
export async function applyModelConfigsAsync(
  raw: Array<{ id: string; label: string }>,
): Promise<ResolvedModel[]> {
  let configData: {
    allowedPrefixes: string[];
    blacklist: string[];
    nameFilters: string[];
    multimodalModels: string[];
  };

  try {
    const res = await fetch("/api/models/config");
    if (res.ok) {
      const { data } = await res.json();
      configData = {
        allowedPrefixes: data.frontend?.allowedPrefixes ?? [],
        blacklist: data.frontend?.blacklist ?? [],
        nameFilters: data.frontend?.nameFilters ?? [],
        multimodalModels: data.multimodalModels ?? [],
      };
    } else {
      configData = getEnvFallbackConfig();
    }
  } catch {
    // API 不可用时 fallback 到环境变量
    configData = getEnvFallbackConfig();
  }

  // 从配置构建完整的模型配置表(含动态白名单前缀)
  const configs = buildModelConfigsFromData(configData.allowedPrefixes);
  const blacklist = parseBlacklistFromConfig(configData.blacklist);
  const nameFilters = parseNameFiltersFromConfig(configData.nameFilters);
  const multimodalSet = new Set(configData.multimodalModels);

  return applyModelConfigsWithFullData(raw, {
    configs,
    blacklist,
    nameFilters,
    multimodalSet,
  });
}

/**
 * 环境变量 fallback 配置 (当 API 不可用时使用)
 */
function getEnvFallbackConfig() {
  return {
    allowedPrefixes: (process.env.NEXT_PUBLIC_ALLOWED_MODEL_PREFIXES || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    blacklist: (process.env.NEXT_PUBLIC_MODEL_BLACKLIST || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    nameFilters: (process.env.NEXT_PUBLIC_MODEL_NAME_FILTERS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    multimodalModels: [] as string[],
  };
}

/**
 * 从配置数据构建模型配置表(含动态白名单前缀)
 */
function buildModelConfigsFromData(prefixes: string[]): ModelConfig[] {
  return [
    // 内置分组:始终放行
    { matcher: "opencode/" },
    { matcher: "jojo/" },
    // 动态分组:从数据库或环境变量注入
    ...parseDynamicPrefixesFromConfig(prefixes),
    // 其他分组全部禁用
    { matcher: /.*/, enabled: false },
  ];
}

/**
 * 使用完整配置数据应用模型过滤
 *
 * @param raw 原始模型列表
 * @param data 完整的配置数据(含 configs、blacklist、nameFilters、multimodalSet)
 */
export function applyModelConfigsWithFullData(
  raw: Array<{ id: string; label: string }>,
  data: {
    configs: ModelConfig[];
    blacklist: Set<string>;
    nameFilters: Array<{ group: string; keyword: string }>;
    multimodalSet?: Set<string>;
  },
): ResolvedModel[] {
  const { configs, blacklist, nameFilters, multimodalSet } = data;

  const parsed: Array<{
    rawId: string;
    rawLabel: string;
    baseId: string;
    depth?: ThinkingDepth;
    group: string;
    alias: string | undefined;
    supportsImages: boolean;
    supportsThinkingDepth: boolean;
  }> = [];

  for (const m of raw) {
    // 使用传入的 configs 而非静态 MODEL_CONFIGS
    const config = configs.find((c) => matchesId(c.matcher, m.id)) ?? null;
    const enabled = config?.enabled ?? UNCONFIGURED_DEFAULT.enabled;
    if (!enabled) continue;

    const group = extractGroup(m.id);
    let baseId = m.id;
    let depth: ThinkingDepth | undefined;
    const supportsImages =
      config?.supportsImages ?? UNCONFIGURED_DEFAULT.supportsImages;
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
      supportsImages,
      supportsThinkingDepth,
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
        supportsImages: first.supportsImages,
        supportsThinkingDepth: availableDepths.length >= 2,
        availableDepths,
        depthVariantIds,
      });
    } else {
      result.push({
        id: first.rawId,
        label,
        group: first.group,
        supportsImages: first.supportsImages,
        supportsThinkingDepth: false,
        availableDepths: [],
        depthVariantIds: {},
      });
    }
  }

  // 标记多模态模型
  if (multimodalSet && multimodalSet.size > 0) {
    for (const model of result) {
      if (multimodalSet.has(model.id)) {
        model.supportsImages = true;
      }
    }
  }

  return result.filter((model) => {
    if (blacklist.has(model.id)) return false;
    for (const variantId of Object.values(model.depthVariantIds)) {
      if (blacklist.has(variantId)) return false;
    }

    for (const filter of nameFilters) {
      if (model.group === filter.group) {
        const nameLower = model.id.toLowerCase();
        const labelLower = model.label.toLowerCase();
        if (
          !nameLower.includes(filter.keyword) &&
          !labelLower.includes(filter.keyword)
        ) {
          return false;
        }
      }
    }

    return true;
  });
}

/**
 * 应用模型配置 (支持数据库配置)
 *
 * @param raw 原始模型列表
 * @param configData 配置数据 (从数据库或环境变量)
 */
export function applyModelConfigsWithData(
  raw: Array<{ id: string; label: string }>,
  configData: {
    blacklist?: string[];
    nameFilters?: string[];
  } = {},
): ResolvedModel[] {
  const parsed: Array<{
    rawId: string;
    rawLabel: string;
    baseId: string;
    depth?: ThinkingDepth;
    group: string;
    alias: string | undefined;
    supportsImages: boolean;
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
      supportsImages: r.supportsImages,
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
        supportsImages: first.supportsImages,
        supportsThinkingDepth: availableDepths.length >= 2,
        availableDepths,
        depthVariantIds,
      });
    } else {
      result.push({
        id: first.rawId,
        label,
        group: first.group,
        supportsImages: first.supportsImages,
        supportsThinkingDepth: false,
        availableDepths: [],
        depthVariantIds: {},
      });
    }
  }

  // 优先使用传入的配置,否则从环境变量读取
  const blacklist = configData.blacklist
    ? parseBlacklistFromConfig(configData.blacklist)
    : parseBlacklist();
  const nameFilters = configData.nameFilters
    ? parseNameFiltersFromConfig(configData.nameFilters)
    : parseNameFilters();

  return result.filter((model) => {
    if (blacklist.has(model.id)) return false;
    for (const variantId of Object.values(model.depthVariantIds)) {
      if (blacklist.has(variantId)) return false;
    }

    for (const filter of nameFilters) {
      if (model.group === filter.group) {
        const nameLower = model.id.toLowerCase();
        const labelLower = model.label.toLowerCase();
        if (
          !nameLower.includes(filter.keyword) &&
          !labelLower.includes(filter.keyword)
        ) {
          return false;
        }
      }
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
