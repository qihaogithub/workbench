import fs from "fs";
import path from "path";

import type { AgentConfig } from "../../core/types";
import { logger } from "../../utils/logger";

export type AiMutationCategory =
  | "template_page"
  | "workspace_tree"
  | "convention"
  | "design_spec"
  | "config_definition"
  | "config_visibility"
  | "unverified";

export interface AiMutationDecision {
  allowed: boolean;
  category?: AiMutationCategory;
  message?: string;
}

function normalized(relativePath: string): string {
  return relativePath.replace(/\\/g, "/").replace(/^\.?\//, "");
}

function isConfigSchemaPath(filePath: string): boolean {
  return filePath === "project.config.schema.json"
    || /^demos\/[^/]+\/config\.schema\.json$/.test(filePath);
}

function isConfigValuesPath(filePath: string): boolean {
  return filePath === "project.config.values.json"
    || /^demos\/[^/]+\/config\.values\.json$/.test(filePath);
}

function isVisibilityRulesPath(filePath: string): boolean {
  return filePath === "project.visibility-rules.json";
}

export function isVisibilityPlanText(planMarkdown: string): boolean {
  const text = planMarkdown.toLowerCase();
  return text.includes("config-driven-behavior")
    || text.includes("visibility")
    || (text.includes("配置") && (text.includes("联动") || text.includes("可见性")));
}

export function hasApprovedVisibilityPlan(config: AgentConfig): boolean {
  const approval = config.visibilityPlanApproval;
  return Boolean(approval && approval.expiresAt > Date.now() && isVisibilityPlanText(approval.planMarkdown));
}

function deny(config: AgentConfig, category: AiMutationCategory): AiMutationDecision {
  const auth = config.authorAuthorization;
  logger.warn(
    {
      projectId: config.projectId,
      sessionId: config.sessionId,
      role: auth?.role ?? null,
      category,
      entry: auth?.source ?? "legacy",
    },
    "AI mutation denied by author authorization policy",
  );
  return {
    allowed: false,
    category,
    message: "FILE_ACCESS_DENIED: 当前角色无权通过 AI 修改此资源。",
  };
}

function readTree(workingDir: string | undefined): { pages?: Array<{ id?: string; isTemplatePage?: unknown }> } | null {
  if (!workingDir) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(workingDir, "workspace-tree.json"), "utf8")) as {
      pages?: Array<{ id?: string; isTemplatePage?: unknown }>;
    };
  } catch {
    return null;
  }
}

function templatePageIds(tree: ReturnType<typeof readTree>): Set<string> | null {
  if (!tree || !Array.isArray(tree.pages)) return null;
  const ids = new Set<string>();
  for (const page of tree.pages) {
    // isTemplatePage predates the permission policy and is optional in old
    // workspaces; absent means ordinary. Any other malformed value fails
    // closed rather than becoming a template bypass.
    if (typeof page?.id !== "string" || (page.isTemplatePage !== undefined && typeof page.isTemplatePage !== "boolean")) return null;
    if (page.isTemplatePage === true) ids.add(page.id);
  }
  return ids;
}

function templateBoundWhiteboardIds(workingDir: string | undefined, templateIds: Set<string> | null): Set<string> | null {
  if (!workingDir || !templateIds) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(workingDir, "whiteboards", "bindings.json"), "utf8")) as {
      bindings?: Array<{ whiteboardId?: unknown; target?: { scope?: unknown; pageId?: unknown } }>;
    };
    // No bindings file is a valid, unbound workspace.  A malformed one must
    // never make it possible to mutate a template-bound scene by guessing an ID.
    if (parsed.bindings === undefined) return new Set();
    if (!Array.isArray(parsed.bindings)) return null;
    const ids = new Set<string>();
    for (const binding of parsed.bindings) {
      if (typeof binding?.whiteboardId !== "string" || !binding.target ||
        (binding.target.scope !== "project" && binding.target.scope !== "page") ||
        (binding.target.scope === "page" && typeof binding.target.pageId !== "string")) return null;
      if (binding.target.scope === "page" && templateIds.has(binding.target.pageId as string)) ids.add(binding.whiteboardId);
    }
    return ids;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Set();
    return null;
  }
}

/**
 * Central policy for every AI mutation tool. Absence of authorization is kept
 * as a legacy/system mode; authoring HTTP/WS and comment tasks always receive
 * a non-null binding from their server route, including an unverified binding.
 */
export function assertAiMutationAllowed(
  config: AgentConfig,
  relativePath: string,
  options: { content?: string; pageIds?: string[]; workflow?: "visibility-draft" } = {},
): AiMutationDecision {
  const auth = config.authorAuthorization;
  if (auth === undefined) return { allowed: true };
  if (!auth || auth.expiresAt <= Date.now()) return deny(config, "unverified");
  if (auth.role === "admin") {
    const filePath = normalized(relativePath);
    if (isVisibilityRulesPath(filePath) && (options.workflow !== "visibility-draft" || !hasApprovedVisibilityPlan(config))) return deny(config, "config_visibility");
    if (isConfigSchemaPath(filePath) && (options.workflow !== "visibility-draft" || !hasApprovedVisibilityPlan(config))) return deny(config, "config_definition");
    if (isConfigValuesPath(filePath) && !hasApprovedVisibilityPlan(config)) return deny(config, "config_definition");
    return { allowed: true };
  }
  if (auth.role !== "editor") return deny(config, "unverified");

  const filePath = normalized(relativePath);
  if (isVisibilityRulesPath(filePath)) {
    if (options.workflow !== "visibility-draft" || !hasApprovedVisibilityPlan(config)) return deny(config, "config_visibility");
  }
  if (isConfigSchemaPath(filePath) && (options.workflow !== "visibility-draft" || !hasApprovedVisibilityPlan(config))) return deny(config, "config_definition");
  if (isConfigValuesPath(filePath) && !hasApprovedVisibilityPlan(config)) return deny(config, "config_definition");
  if (filePath === "convention.md" || /^demos\/[^/]+\/convention\.md$/.test(filePath)) {
    return deny(config, "convention");
  }
  if (filePath === "design-spec" || filePath.startsWith("design-spec/")) {
    return deny(config, "design_spec");
  }

  const tree = readTree(config.workingDir);
  const templateIds = templatePageIds(tree);
  if (filePath === "workspace-tree.json") {
    // An editor may still arrange non-template pages, but must neither erase
    // nor alter any template marker. Invalid tree data fails closed.
    if (!options.content || !tree || !templateIds) return deny(config, "workspace_tree");
    try {
      const next = JSON.parse(options.content) as { pages?: Array<{ id?: string; isTemplatePage?: unknown }> };
      const nextIds = templatePageIds(next);
      if (!nextIds || nextIds.size !== templateIds.size || [...templateIds].some((id) => !nextIds.has(id))) {
        return deny(config, "workspace_tree");
      }
    } catch {
      return deny(config, "workspace_tree");
    }
    return { allowed: true };
  }

  const whiteboardId = /^whiteboards\/([^/]+)\.json$/.exec(filePath)?.[1];
  if (whiteboardId) {
    const templateBoundIds = templateBoundWhiteboardIds(config.workingDir, templateIds);
    if (!templateBoundIds || templateBoundIds.has(whiteboardId)) return deny(config, "template_page");
  }
  if (filePath === "whiteboards/bindings.json") {
    // Binding records are the indirection between a whiteboard scene and a
    // page config. Editors may maintain ordinary-page bindings, but every
    // existing or submitted template-page binding must remain untouched.
    const templateBoundIds = templateBoundWhiteboardIds(config.workingDir, templateIds);
    if (!options.content || !templateBoundIds || templateBoundIds.size > 0) return deny(config, "template_page");
    try {
      const next = JSON.parse(options.content) as { bindings?: Array<{ whiteboardId?: unknown; target?: { scope?: unknown; pageId?: unknown } }> };
      if (!Array.isArray(next.bindings)) return deny(config, "template_page");
      for (const binding of next.bindings) {
        if (typeof binding?.whiteboardId !== "string" || !binding.target ||
          (binding.target.scope !== "project" && binding.target.scope !== "page") ||
          (binding.target.scope === "page" && typeof binding.target.pageId !== "string")) return deny(config, "template_page");
        if (binding.target.scope === "page" && templateIds?.has(binding.target.pageId as string)) return deny(config, "template_page");
      }
    } catch {
      return deny(config, "template_page");
    }
  }

  const pageId = /^demos\/([^/]+)\//.exec(filePath)?.[1];
  const targetedIds = options.pageIds ?? (pageId ? [pageId] : []);
  if (targetedIds.length > 0) {
    // For resource or deletion mutations a malformed authoritative tree must
    // not turn into a permission bypass.
    if (!templateIds) return deny(config, "template_page");
    if (targetedIds.some((id) => templateIds.has(id))) return deny(config, "template_page");
  }
  return { allowed: true };
}

export function aiMutationDeniedResult(decision: AiMutationDecision, path: string) {
  return {
    content: [{ type: "text" as const, text: decision.message ?? "FILE_ACCESS_DENIED" }],
    details: { path, error: "FILE_ACCESS_DENIED", category: decision.category },
    isError: true,
  };
}
