/**
 * 无进展超时：连续 N 毫秒无“实质性输出”事件则自动 abort。
 * “实质性输出”仅包括 stream / tool_call / tool_call_update，
 * thought/reasoning 不算活动（见 backend-agent.ts activityEvents）。
 * 前端 use-chat-stream.ts 的 markActivity() 必须与此处定义保持一致，
 * 否则前端 silence 提示与后端超时行为会不对齐。
 */
export const INACTIVITY_TIMEOUT_MS =
  Number(process.env.AGENT_INACTIVITY_TIMEOUT_MS) || 5 * 60 * 1000;

/** processing 状态兜底超时：agent 处于 processing 超过此时间则强制 kill */
export const PROCESSING_MAX_TIMEOUT_MS =
  Number(process.env.AGENT_PROCESSING_MAX_TIMEOUT_MS) || 10 * 60 * 1000;

/** sendMessage 绝对超时上限：无论是否有进展，超过此时间一律 abort */
export const ABSOLUTE_TIMEOUT_MS =
  Number(process.env.AGENT_ABSOLUTE_TIMEOUT_MS) || 15 * 60 * 1000;
