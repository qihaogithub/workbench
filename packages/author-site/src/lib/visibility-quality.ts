import type { AppGraph } from "@workbench/shared";
import type { CanvasState } from "@workbench/demo-ui";

export interface VisibilityDeadLinkIssue {
  code: "VISIBILITY_DEAD_LINK" | "VISIBILITY_NO_AVAILABLE_PAGE";
  severity: "warning" | "error";
  source: "project" | "canvas-navigation" | "app-graph-entry" | "app-graph-action";
  sourcePageId?: string;
  targetPageId?: string;
  message: string;
}
/**
 * Finds navigation edges that would point at a page hidden by a published
 * visibility snapshot.  This is intentionally a quality gate only; it does
 * not mutate graph/canvas state and does not replace server-side auth.
 */
export function findVisibilityDeadLinks(input: {
  hiddenPageIds: Iterable<string>;
  availablePageIds?: Iterable<string>;
  pageIds: Iterable<string>;
  canvasState?: CanvasState;
  appGraph?: AppGraph;
}): VisibilityDeadLinkIssue[] {
  const hidden = new Set(input.hiddenPageIds);
  const pages = new Set(input.pageIds);
  const issues: VisibilityDeadLinkIssue[] = [];
  const seen = new Set<string>();
  const add = (issue: VisibilityDeadLinkIssue) => {
    const key = `${issue.source}:${issue.sourcePageId ?? ""}:${issue.targetPageId ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push(issue);
  };

  if (pages.size > 0 && input.availablePageIds && new Set(input.availablePageIds).size === 0) {
    add({
      code: "VISIBILITY_NO_AVAILABLE_PAGE",
      severity: "error",
      source: "project",
      message: "当前发布配置会使项目没有任何可用页面",
    });
  }

  for (const connection of Object.values(input.canvasState?.navigation?.connections ?? {})) {
    const sourcePageId = connection.source?.pageId;
    const targetPageId = connection.target?.pageId;
    if (!sourcePageId || !targetPageId || !pages.has(targetPageId) || !hidden.has(targetPageId)) continue;
    add({
      code: "VISIBILITY_DEAD_LINK",
      severity: "warning",
      source: "canvas-navigation",
      sourcePageId,
      targetPageId,
      message: `画布导航从页面「${sourcePageId}」指向已隐藏页面「${targetPageId}」`,
    });
  }

  const graph = input.appGraph;
  if (!graph) return issues;
  const pageByRoute = new Map(Object.entries(graph.pages).map(([routeKey, page]) => [routeKey, page.pageId]));
  const entryPageId = graph.entry ? pageByRoute.get(graph.entry) : undefined;
  if (entryPageId && hidden.has(entryPageId)) {
    add({
      code: "VISIBILITY_DEAD_LINK",
      severity: "warning",
      source: "app-graph-entry",
      targetPageId: entryPageId,
      message: `应用入口指向已隐藏页面「${entryPageId}」`,
    });
  }
  for (const action of graph.actions) {
    const sourcePageId = pageByRoute.get(action.from);
    for (const routeKey of [action.to, action.fallback]) {
      if (!routeKey) continue;
      const targetPageId = pageByRoute.get(routeKey);
      if (!targetPageId || !hidden.has(targetPageId)) continue;
      add({
        code: "VISIBILITY_DEAD_LINK",
        severity: "warning",
        source: "app-graph-action",
        ...(sourcePageId ? { sourcePageId } : {}),
        targetPageId,
        message: `应用动作「${action.from}.${action.event}」指向已隐藏页面「${targetPageId}」`,
      });
    }
  }
  return issues;
}
