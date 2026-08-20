import { extractCodeConfigBindingKeys, extractPrototypeConfigBindingKeys } from "@workbench/demo-ui/config-binding-utils";
import { parsePageRequirementsRefs } from "@workbench/shared/demo/page-requirements";
import type { SchemaDefinitionMutation } from "@workbench/shared";

export interface ConfigImpactPageSource {
  pageId: string;
  pageName: string;
  runtimeType?: string;
  code?: string;
  prototypeHtml?: string;
  requirements?: string;
}

export interface ConfigDefinitionImpactReport {
  changedKeys: string[];
  boundPages: Array<{ pageId: string; pageName: string; keys: string[] }>;
  requirementRefs: Array<{ pageId: string; pageName: string; key: string }>;
  risk: "none" | "metadata" | "ai_required";
}

/**
 * Derives an explainable impact report from live workspace sources. It does not
 * persist state: refreshes can safely recompute it after a collaboration update.
 */
export function analyzeConfigDefinitionImpact(input: {
  mutation: SchemaDefinitionMutation;
  scope: "project" | "page";
  pageId?: string;
  pages: ConfigImpactPageSource[];
}): ConfigDefinitionImpactReport {
  const changedKeys = [...new Set([
    ...input.mutation.diff.added,
    ...input.mutation.diff.updated,
    ...input.mutation.diff.deleted,
  ])];
  const candidatePages = input.scope === "project"
    ? input.pages
    : input.pages.filter((page) => page.pageId === input.pageId);
  const boundPages = candidatePages.flatMap((page) => {
    const keys = page.runtimeType === "prototype-html-css"
      ? extractPrototypeConfigBindingKeys(page.prototypeHtml)
      : extractCodeConfigBindingKeys(page.code, changedKeys);
    const matches = keys.filter((key) => changedKeys.includes(key));
    return matches.length ? [{ pageId: page.pageId, pageName: page.pageName, keys: matches }] : [];
  });
  const requirementRefs = candidatePages.flatMap((page) =>
    parsePageRequirementsRefs(page.requirements ?? "")
      .filter((ref) => changedKeys.includes(ref.key))
      .map((ref) => ({ pageId: page.pageId, pageName: page.pageName, key: ref.key })),
  );
  const requiresAi = boundPages.length > 0 && (
    input.mutation.diff.deleted.length > 0 || input.mutation.diff.typeChanged.length > 0
  );
  return {
    changedKeys,
    boundPages,
    requirementRefs,
    risk: requiresAi ? "ai_required" : boundPages.length || requirementRefs.length ? "metadata" : "none",
  };
}
