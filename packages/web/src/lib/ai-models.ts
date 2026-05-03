/**
 * AI 模型前端配置表
 *
 * 维护规则:
 * - 添加新模型:在 MODEL_CONFIGS 中追加一条,matcher 用正则覆盖日期/版本变体
 * - 禁用某家族:在配置中加 `enabled: false`
 * - 自定义展示名:在配置中加 `alias`
 * - 标记多模态:在配置中加 `supportsImages: true`
 *
 * 后端返回但未在此处配置的模型:
 * - 默认显示在下拉框中(`enabled = true`)
 * - 默认按非多模态处理(`supportsImages = false`)
 */

export type ModelMatcher = RegExp | string;

export type ModelConfig = {
  /** 匹配后端原始 model id 的正则,或字符串前缀 */
  matcher: ModelMatcher;
  /** 是否在下拉框中展示,默认 true */
  enabled?: boolean;
  /** 自定义展示名,缺省时使用后端 label */
  alias?: string;
  /** 是否支持图片输入,默认 false */
  supportsImages?: boolean;
};

export const UNCONFIGURED_DEFAULT = {
  enabled: true,
  supportsImages: false,
} as const;

export type ResolvedModel = {
  id: string;
  label: string;
  supportsImages: boolean;
};

/**
 * 模型配置表 — 维护此数组以管控前端可见模型
 *
 * 列表顺序即匹配优先级,首个命中的配置生效。
 */
export const MODEL_CONFIGS: ModelConfig[] = [
  // === Claude 系列(全部多模态)===
  { matcher: /^claude-sonnet-4-5/, alias: "Claude Sonnet 4.5", supportsImages: true },
  { matcher: /^claude-opus-4-7/, alias: "Claude Opus 4.7", supportsImages: true },
  { matcher: /^claude-haiku-4-5/, alias: "Claude Haiku 4.5", supportsImages: true },

  // === OpenAI 系列 ===
  { matcher: /^gpt-4o/, alias: "GPT-4o", supportsImages: true },
  { matcher: /^gpt-5/, alias: "GPT-5", supportsImages: true },
  // o1 暂不启用(无 ACP 后端稳定支持)
  { matcher: /^o1$|^o1-/, enabled: false },

  // === Gemini 系列 ===
  { matcher: /^gemini-2/, alias: "Gemini 2", supportsImages: true },

  // === 国内多模态 ===
  { matcher: /^qwen-vl|^qwen3-vl/, alias: "Qwen VL", supportsImages: true },
  { matcher: /^kimi-vl/, alias: "Kimi VL", supportsImages: true },
];

export function matchesId(matcher: ModelMatcher, id: string): boolean {
  if (typeof matcher === "string") return id.startsWith(matcher);
  return matcher.test(id);
}

export function resolveModelConfig(rawId: string): {
  config: ModelConfig | null;
  enabled: boolean;
  alias: string | undefined;
  supportsImages: boolean;
} {
  const config = MODEL_CONFIGS.find((c) => matchesId(c.matcher, rawId)) ?? null;
  return {
    config,
    enabled: config?.enabled ?? UNCONFIGURED_DEFAULT.enabled,
    alias: config?.alias,
    supportsImages: config?.supportsImages ?? UNCONFIGURED_DEFAULT.supportsImages,
  };
}

export function applyModelConfigs(
  raw: Array<{ id: string; label: string }>,
): ResolvedModel[] {
  const result: ResolvedModel[] = [];
  for (const m of raw) {
    const r = resolveModelConfig(m.id);
    if (!r.enabled) continue;
    result.push({
      id: m.id,
      label: r.alias ?? m.label,
      supportsImages: r.supportsImages,
    });
  }
  return result;
}
