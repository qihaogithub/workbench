import type { ChatMessage } from "@/components/ai-elements";

const VALID_AUTO_REPAIR_STATUSES = new Set(["running", "completed", "failed"]);

/**
 * 对从 API 加载的历史消息做防御性清洗，防止旧消息格式不兼容导致渲染崩溃。
 */
export function sanitizeHydratedMessages(raw: unknown[]): ChatMessage[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((msg): msg is Record<string, unknown> => {
      if (!msg || typeof msg !== "object") return false;
      const role = (msg as Record<string, unknown>).role;
      return role === "user" || role === "assistant" || role === "system";
    })
    .map((msg) => {
      const sanitized: Record<string, unknown> = { ...msg };

      // 确保 parts 为数组
      if (!Array.isArray(sanitized.parts)) {
        sanitized.parts = [];
      }

      // 归一化 autoRepair.status
      // 对于从历史加载的消息，"running" 状态不可能仍在执行，标记为 failed
      if (sanitized.autoRepair && typeof sanitized.autoRepair === "object") {
        const ar = sanitized.autoRepair as Record<string, unknown>;
        if (
          typeof ar.status === "string" &&
          (!VALID_AUTO_REPAIR_STATUSES.has(ar.status) ||
            ar.status === "running")
        ) {
          sanitized.autoRepair = { ...ar, status: "failed" };
        }
      }

      return sanitized as unknown as ChatMessage;
    });
}
