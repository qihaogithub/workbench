import type {
  CanvasPageData,
  CanvasPageLayout,
  CanvasPageRenderMode,
  CanvasViewportState,
} from "./types";

export const DEFAULT_MAX_ACTIVE_CANVAS_IFRAMES = 12;
export const DEFAULT_MAX_SLEEPING_CANVAS_IFRAMES = 12;
export const MIN_CANVAS_SCREENSHOT_PAGE_COUNT = 6;

interface ComputeCanvasRenderModesInput {
  pages: CanvasPageData[];
  layouts: Record<string, CanvasPageLayout>;
  visiblePageIds: Set<string>;
  viewport: CanvasViewportState;
  containerWidth: number;
  containerHeight: number;
  editingPageId?: string;
  screenshotUrls?: Record<string, string>;
  recentIframeAccess: Map<string, number>;
  maxActiveIframes?: number;
  maxSleepingIframes?: number;
}

export interface CanvasRenderModeResult {
  modes: Record<string, CanvasPageRenderMode>;
  activePageIds: string[];
  sleepingPageIds: string[];
}

function getPageDistanceToViewportCenter(
  layout: CanvasPageLayout | undefined,
  viewportCenter: { x: number; y: number },
): number {
  if (!layout) return Number.MAX_SAFE_INTEGER;
  const pageCenterX = layout.x + layout.width / 2;
  const pageCenterY = layout.y + layout.height / 2;
  return (
    (pageCenterX - viewportCenter.x) ** 2 +
    (pageCenterY - viewportCenter.y) ** 2
  );
}

export function computeCanvasRenderModes({
  pages,
  layouts,
  visiblePageIds,
  viewport,
  containerWidth,
  containerHeight,
  editingPageId,
  screenshotUrls,
  recentIframeAccess,
  maxActiveIframes = DEFAULT_MAX_ACTIVE_CANVAS_IFRAMES,
  maxSleepingIframes = DEFAULT_MAX_SLEEPING_CANVAS_IFRAMES,
}: ComputeCanvasRenderModesInput): CanvasRenderModeResult {
  const modes: Record<string, CanvasPageRenderMode> = {};
  const prototypePageIds = new Set(
    pages
      .filter((page) => page.runtimeType === "prototype-html-css")
      .map((page) => page.id),
  );
  for (const pageId of prototypePageIds) {
    modes[pageId] = "prototype";
  }
  const runtimePages = pages.filter((page) => !prototypePageIds.has(page.id));

  if (runtimePages.length < MIN_CANVAS_SCREENSHOT_PAGE_COUNT) {
    const activePageIds = runtimePages.map((page) => page.id);
    for (const pageId of activePageIds) {
      modes[pageId] = "iframe";
    }
    return {
      modes,
      activePageIds,
      sleepingPageIds: [],
    };
  }

  const zoom = viewport.zoom || 1;
  const viewportCenter = {
    x: (-viewport.x + containerWidth / 2) / zoom,
    y: (-viewport.y + containerHeight / 2) / zoom,
  };
  const activePageIds: string[] = [];
  const iframeCandidates: Array<{ id: string; distance: number }> = [];

  for (const page of runtimePages) {
    if (!visiblePageIds.has(page.id)) {
      modes[page.id] = "loading";
      continue;
    }

    if (editingPageId === page.id) {
      modes[page.id] = "iframe";
      activePageIds.push(page.id);
      continue;
    }

    if (screenshotUrls?.[page.id]) {
      modes[page.id] = "screenshot";
      continue;
    }

    iframeCandidates.push({
      id: page.id,
      distance: getPageDistanceToViewportCenter(
        layouts[page.id],
        viewportCenter,
      ),
    });
  }

  iframeCandidates.sort((a, b) => a.distance - b.distance);
  const activeBudget = Math.max(0, maxActiveIframes - activePageIds.length);
  const activeCandidateIds = new Set(
    iframeCandidates.slice(0, activeBudget).map((item) => item.id),
  );

  for (const { id } of iframeCandidates) {
    if (activeCandidateIds.has(id)) {
      modes[id] = "iframe";
      activePageIds.push(id);
    }
  }

  const sleepingPageIds = iframeCandidates
    .filter(({ id }) => !activeCandidateIds.has(id))
    .filter(({ id }) => recentIframeAccess.has(id))
    .sort(
      (a, b) =>
        (recentIframeAccess.get(b.id) ?? 0) -
        (recentIframeAccess.get(a.id) ?? 0),
    )
    .slice(0, maxSleepingIframes)
    .map(({ id }) => id);

  const sleepingPageIdSet = new Set(sleepingPageIds);
  for (const { id } of iframeCandidates) {
    if (modes[id]) continue;
    modes[id] = sleepingPageIdSet.has(id) ? "sleeping-iframe" : "loading";
  }

  return {
    modes,
    activePageIds,
    sleepingPageIds,
  };
}
