import type {
  CanvasPageData,
  CanvasPageLayout,
  CanvasPageRenderMode,
  CanvasViewportState,
} from "./types";
import {
  DEFAULT_MAX_ACTIVE_CANVAS_IFRAMES,
  DEFAULT_MAX_SLEEPING_CANVAS_IFRAMES,
  computeCanvasRenderModes,
} from "./canvas-render-scheduler";

export type PreviewRuntimePoolMode = CanvasPageRenderMode;

export interface PreviewRuntimePoolInput {
  pages: CanvasPageData[];
  layouts: Record<string, CanvasPageLayout>;
  visiblePageIds: Set<string>;
  viewport: CanvasViewportState;
  containerWidth: number;
  containerHeight: number;
  editingPageId?: string;
  screenshotUrls?: Record<string, string>;
  recentRuntimeAccess: Map<string, number>;
  maxActiveRuntimes?: number;
  maxSleepingRuntimes?: number;
}

export interface PreviewRuntimePoolPlan {
  modes: Record<string, PreviewRuntimePoolMode>;
  activePageIds: string[];
  sleepingPageIds: string[];
  retainedRuntimePageIds: string[];
}

export function computePreviewRuntimePoolPlan({
  recentRuntimeAccess,
  maxActiveRuntimes = DEFAULT_MAX_ACTIVE_CANVAS_IFRAMES,
  maxSleepingRuntimes = DEFAULT_MAX_SLEEPING_CANVAS_IFRAMES,
  ...input
}: PreviewRuntimePoolInput): PreviewRuntimePoolPlan {
  const result = computeCanvasRenderModes({
    ...input,
    recentIframeAccess: recentRuntimeAccess,
    maxActiveIframes: maxActiveRuntimes,
    maxSleepingIframes: maxSleepingRuntimes,
  });

  return {
    ...result,
    retainedRuntimePageIds: [
      ...result.activePageIds,
      ...result.sleepingPageIds,
    ],
  };
}
