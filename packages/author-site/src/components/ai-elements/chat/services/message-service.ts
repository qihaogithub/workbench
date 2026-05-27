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
    const url = `/api/sessions/${sessionId}/files`;
    console.log("[fetchSessionFiles] 请求:", url, "demoId:", demoId);
    const filesRes = await fetch(url);
    console.log("[fetchSessionFiles] 响应状态:", filesRes.status);
    if (filesRes.ok) {
      const filesData = await filesRes.json();
      console.log(
        "[fetchSessionFiles] 响应数据 keys:",
        filesData.data ? Object.keys(filesData.data) : "null",
        "success:",
        filesData.success,
      );
      if (filesData.success && filesData.data) {
        const data = filesData.data;
        if (data.demos && typeof data.demos === "object") {
          const demoIds = Object.keys(data.demos);
          const targetId = demoId || demoIds[0];
          console.log(
            "[fetchSessionFiles] MultiDemo 格式, demoIds:",
            demoIds,
            "targetId:",
            targetId,
          );
          if (targetId && data.demos[targetId]) {
            const result = {
              code: data.demos[targetId].code,
              schema: data.demos[targetId].schema,
            };
            console.log(
              "[fetchSessionFiles] 返回: code=",
              result.code?.length ?? 0,
              "chars, schema=",
              result.schema?.length ?? 0,
              "chars",
            );
            return result;
          }
        }
        if (data.code || data.schema) {
          console.log(
            "[fetchSessionFiles] 返回: code=",
            data.code?.length ?? 0,
            "chars, schema=",
            data.schema?.length ?? 0,
            "chars",
          );
          return { code: data.code, schema: data.schema };
        }
        console.log("[fetchSessionFiles] ⚠️ 响应数据中无 code/schema");
      }
    }
  } catch (error) {
    console.error("[fetchSessionFiles] Error fetching files via HTTP:", error);
  }
  return null;
}
