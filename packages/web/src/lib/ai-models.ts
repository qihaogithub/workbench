/**
 * AI 模型前端配置表(白名单模式)
 *
 * 维护规则:
 * - 添加新模型:在 catch-all 之前追加一条,matcher 用正则覆盖 id 变体
 * - 标记多模态:在条目中加 `supportsImages: true`
 * - 自定义展示名:在条目中加 `alias`(否则使用后端 label)
 * - 末尾的 catch-all `{ matcher: /.*\/, enabled: false }` 禁用所有未列入白名单的模型
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
 * 模型配置表 — 仅放行白名单内的模型
 *
 * 列表顺序即匹配优先级,首个命中的配置生效;最后一条 catch-all 禁用其余所有模型。
 */
export const MODEL_CONFIGS: ModelConfig[] = [
  // === OpenCode Zen 白名单 ===
  // Nemotron 3 Super(含 low/medium/high 推理变体)
  { matcher: /nemotron/i, alias: "Nemotron 3 Super" },
  // MiniMax M2.5
  { matcher: /minimax/i, alias: "MiniMax M2.5" },
  // Hy3 preview(含 low/medium/high 推理变体)
  { matcher: /hy3/i, alias: "Hy3 preview" },

  // === 其他全部禁用 ===
  { matcher: /.*/, enabled: false },
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

function stripPrefix(label: string): string {
  return label.replace(/^OpenCode Zen\//i, "");
}

function buildLabel(alias: string, rawLabel: string): string {
  const stripped = stripPrefix(rawLabel);
  // 去掉 stripped 中与 alias 重复的前缀部分
  const aliasLower = alias.toLowerCase();
  const strippedLower = stripped.toLowerCase();
  if (strippedLower.startsWith(aliasLower)) {
    const remainder = stripped.slice(alias.length).trim();
    return remainder ? `${alias} ${remainder}` : alias;
  }
  return stripped;
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
      label: r.alias ? buildLabel(r.alias, m.label) : m.label,
      supportsImages: r.supportsImages,
    });
  }
  return result;
}
