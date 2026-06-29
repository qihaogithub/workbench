import type { CanvasState } from "./types";

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
