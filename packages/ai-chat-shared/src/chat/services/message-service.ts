import { getAuthorContextIntegration } from "../../config";

/**
 * 会话持久化是创作端集成的一部分（依赖 author-site 的 /api/sessions API）。
 * 未配置 authorContext 的宿主（viewer-site）自动跳过，会话即用即弃。
 */
function isSessionPersistenceAvailable(): boolean {
  return getAuthorContextIntegration() !== null;
}

export async function updateSessionTitle(
  sessionId: string,
  title: string,
  isFirstMessage = true,
): Promise<void> {
  if (!isSessionPersistenceAvailable()) return;
  if (!isFirstMessage || !title.trim()) return;

  try {
    const response = await fetch(`/api/conversations/${sessionId}/title`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim() }),
    });
    if (!response.ok) throw new Error(`Conversation title update failed (${response.status})`);
  } catch (e) {
    console.warn("[MessageService] Failed to update session title:", e);
  }
}

export async function fetchSessionFiles(
  sessionId: string,
  demoId?: string,
): Promise<{ code?: string; schema?: string } | null> {
  if (!isSessionPersistenceAvailable()) return null;
  try {
    const url = `/api/sessions/${sessionId}/files`;
    const filesRes = await fetch(url);
    if (filesRes.ok) {
      const filesData = await filesRes.json();
      if (filesData.success && filesData.data) {
        const data = filesData.data;
        if (data.demos && typeof data.demos === "object") {
          const demoIds = Object.keys(data.demos);
          const targetId = demoId || demoIds[0];
          if (targetId && data.demos[targetId]) {
            return {
              code: data.demos[targetId].code,
              schema: data.demos[targetId].schema,
            };
          }
        }
        if (data.code || data.schema) {
          return { code: data.code, schema: data.schema };
        }
      }
    }
  } catch (error) {
    console.error("[fetchSessionFiles] Error fetching files via HTTP:", error);
  }
  return null;
}
