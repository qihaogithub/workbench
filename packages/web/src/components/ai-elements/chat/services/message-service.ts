import type { ChatMessage } from "@/components/ai-elements";

export async function persistMessages(
  sessionId: string,
  messages: ChatMessage[],
): Promise<void> {
  try {
    const now = Date.now();
    const messagesToSave = messages.map((m, i) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: now - (messages.length - i) * 1000,
    }));
    await fetch(`/api/sessions/${sessionId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: messagesToSave }),
    });
  } catch (e) {
    console.warn("[MessageService] Failed to persist messages:", e);
  }
}

export async function updateSessionTitle(
  sessionId: string,
  userMessage: string,
  isFirstMessage: boolean,
): Promise<void> {
  if (!isFirstMessage || !userMessage.trim()) return;

  try {
    const title =
      userMessage.trim().slice(0, 50) +
      (userMessage.trim().length > 50 ? "..." : "");
    await fetch(`/api/sessions/${sessionId}/meta`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
  } catch (e) {
    console.warn("[MessageService] Failed to update session title:", e);
  }
}

export async function fetchSessionFiles(
  sessionId: string,
  demoId?: string,
): Promise<{ code?: string; schema?: string } | null> {
  try {
    const filesRes = await fetch(`/api/sessions/${sessionId}/files`);
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
    console.error("[MessageService] Error fetching files via HTTP:", error);
  }
  return null;
}
