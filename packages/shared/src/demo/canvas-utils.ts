import { debounce } from "./utils";

const SAVE_DELAY = 500;

export const saveCanvasLayout = debounce(
  async (
    sessionId: string,
    projectId: string,
    layout: Record<string, { x: number; y: number; width: number; height: number }>,
  ) => {
    try {
      await fetch(`/api/sessions/${sessionId}/canvas-layout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, layout }),
      });
    } catch (error) {
      console.error("保存画布布局失败:", error);
    }
  },
  SAVE_DELAY,
);
