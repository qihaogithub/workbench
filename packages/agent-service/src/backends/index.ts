export type { IBackendAdapter, BackendStatus } from "./base";
export { BaseAcpBackend } from "./base-acp";

export { OpenCodeAcpBackend } from "./opencode-acp";
export { OpenCodeHttpBackend } from "./opencode-http";
export { ClaudeBackend } from "./claude";
export { CodexBackend } from "./codex";
export { GeminiBackend } from "./gemini";
export { QwenBackend } from "./qwen";
export { GooseBackend } from "./goose";
export { AuggieBackend } from "./auggie";
export { KimiBackend } from "./kimi";
export { CopilotBackend } from "./copilot";
export { QoderBackend } from "./qoder";
export { VibeBackend } from "./vibe";
export { CustomBackend } from "./custom";
// PiAgentBackend 使用动态导入 (ESM-only 依赖 @earendil-works/pi-agent-core)
// 在 server.ts 中通过动态 import 注册
