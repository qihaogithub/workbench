/**
 * AI 模型前端配置表(白名单模式)
 *
 * 维护规则:
 * - 添加新模型:在 catch-all 之前追加一条,matcher 用正则覆盖 id 变体
 * - 标记多模态:在条目中加 `supportsImages: true`
 * - 标记思考深度:在条目中加 `supportsThinkingDepth: true`,前端会自动检测 -low/-medium/-high 变体并分组
 * - 自定义展示名:在条目中加 `alias`(否则去掉前缀后使用后端 label)
 * - 末尾的 catch-all `{ matcher: /.*\/, enabled: false }` 禁用所有未列入白名单的模型
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
 * 从环境变量 NEXT_PUBLIC_ALLOWED_MODEL_PREFIXES 解析动态白名单前缀
 *
 * 格式: 逗号分隔的前缀列表,如 "deepseek/,qwen/,custom/"
 * 未设置时默认为空(不额外放行任何分组)
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
    supportsImages: config?.supportsImages ?? UNCONFIGURED_DEFAULT.supportsImages,
    supportsThinkingDepth: config?.supportsThinkingDepth ?? UNCONFIGURED_DEFAULT.supportsThinkingDepth,
  };
}

export const DEFAULT_MODEL_ID = "sensenova/deepseek-v4-flash";

function extractGroup(id: string): string {
  const idx = id.indexOf("/");
  return idx >= 0 ? id.slice(0, idx) : "";
}

function stripPrefix(label: string): string {
  return label.replace(/^[^/]+\//, "");
}

function parseDepthSuffix(id: string): { baseId: string; depth?: ThinkingDepth } {
  const match = id.match(DEPTH_PATTERN);
  if (match) {
    return { baseId: id.slice(0, -match[0].length), depth: match[1] as ThinkingDepth };
  }
  return { baseId: id };
}

export function applyModelConfigs(
  raw: Array<{ id: string; label: string }>,
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

  return result;
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
