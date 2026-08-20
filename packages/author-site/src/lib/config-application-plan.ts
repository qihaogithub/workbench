export type ConfigEditorSource = "panel-edit" | "panel-create" | "visual-bind";
export type ConfigApplicationMode = "direct" | "ai_required" | "unsupported";
export type ConfigApplicationEffect = "schema_only" | "bind_and_apply";
export type ConfigPageRuntime = "prototype-html-css" | "high-fidelity-react" | "sketch-scene";

export interface ConfigApplicationPlanInput {
  source: ConfigEditorSource;
  runtimeType?: ConfigPageRuntime;
  scope: "page" | "project";
  /** A visual binding must carry the complete iframe node context, not merely a field key. */
  hasVisualTarget?: boolean;
  /** Set only after the runtime adapter dry-runs its source/schema transformation. */
  hasDirectPatch?: boolean;
  directFailureReason?: string;
  isBound?: boolean;
  typeChanged?: boolean;
  deleted?: boolean;
  needsValueMigration?: boolean;
}

export interface ConfigApplicationPlan {
  mode: ConfigApplicationMode;
  effect?: ConfigApplicationEffect;
  primaryLabel: "保存字段" | "保存并应用" | "交给 AI 应用" | "请求实现支持";
  reason: string;
}

/**
 * Resolves the user-facing operation only. Runtime adapters own the dry-run
 * that proves a direct patch is safe; the dialog must not infer it itself.
 */
export function resolveConfigApplicationPlan(
  input: ConfigApplicationPlanInput,
): ConfigApplicationPlan {
  if (input.source === "visual-bind") {
    if (input.runtimeType === "sketch-scene") {
      return {
        mode: "unsupported",
        primaryLabel: "请求实现支持",
        reason: "手绘页面尚未提供场景属性到配置字段的绑定能力。",
      };
    }
    if (input.scope === "project") {
      return {
        mode: "ai_required",
        primaryLabel: "交给 AI 应用",
        reason: "项目级字段需要同时改造页面消费方式，不能自动建立绑定。",
      };
    }
    if (!input.hasVisualTarget) {
      return {
        mode: "ai_required",
        primaryLabel: "交给 AI 应用",
        reason: "没有可验证的页面元素定位信息，无法安全建立绑定。",
      };
    }
    if (input.hasDirectPatch) {
      return {
        mode: "direct",
        effect: "bind_and_apply",
        primaryLabel: "保存并应用",
        reason: "已验证可安全建立页面绑定。",
      };
    }
    return {
      mode: "ai_required",
      primaryLabel: "交给 AI 应用",
      reason: input.directFailureReason || "当前页面结构无法安全自动改写。",
    };
  }

  if (input.deleted || input.typeChanged || input.needsValueMigration) {
    if (input.isBound || input.needsValueMigration) {
      return {
        mode: "ai_required",
        primaryLabel: "交给 AI 应用",
        reason: "此变更需要同步页面消费或迁移现有配置值。",
      };
    }
  }

  return {
    mode: "direct",
    effect: "schema_only",
    primaryLabel: "保存字段",
    reason: "仅更新字段定义，不会覆盖当前预览中的配置值。",
  };
}
