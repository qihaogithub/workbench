import type { CanvasState } from "./types";

const CANVAS_TITLE_SCREEN_FONT_SIZE = 12;
const CANVAS_TITLE_MIN_COMPENSATED_ZOOM = 0.5;
const CANVAS_TITLE_SCREEN_GAP = 8;
const CANVAS_SECTION_TITLE_SCREEN_HEIGHT = 28;
const CANVAS_SECTION_TITLE_SCREEN_HORIZONTAL_PADDING = 8;

/** Keeps canvas titles readable until the canvas reaches overview scale. */
export function resolveCanvasTitleMetrics(zoom: number) {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const compensationZoom = Math.max(safeZoom, CANVAS_TITLE_MIN_COMPENSATED_ZOOM);

  return {
    fontSize: CANVAS_TITLE_SCREEN_FONT_SIZE / compensationZoom,
    topOffset:
      (CANVAS_TITLE_SCREEN_FONT_SIZE + CANVAS_TITLE_SCREEN_GAP) /
      compensationZoom,
    sectionHeight: CANVAS_SECTION_TITLE_SCREEN_HEIGHT / compensationZoom,
    sectionHorizontalPadding:
      CANVAS_SECTION_TITLE_SCREEN_HORIZONTAL_PADDING / compensationZoom,
  };
}

interface CanvasLayoutApiResponse {
  success: boolean;
  data?: {
    state?: CanvasState | null;
  };
  error?: {
    message?: string;
  };
}

export async function loadCanvasLayout(
  sessionId: string,
): Promise<CanvasState | null> {
  const response = await fetch(`/api/sessions/${sessionId}/canvas-layout`);
  const result = (await response.json()) as CanvasLayoutApiResponse;

  if (!response.ok || !result.success) {
    throw new Error(result.error?.message || "加载画布布局失败");
  }

  return result.data?.state ?? null;
}

export async function saveCanvasLayout(
  sessionId: string,
  projectId: string,
  state: CanvasState,
): Promise<void> {
  const response = await fetch(`/api/sessions/${sessionId}/canvas-layout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, version: 1, state }),
  });
  const result = (await response.json()) as CanvasLayoutApiResponse;

  if (!response.ok || !result.success) {
    throw new Error(result.error?.message || "保存画布布局失败");
  }
}
