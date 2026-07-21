import type { AgentClient } from "@workbench/agent-client";

/**
 * 创作端专属集成：静态 system prompt 构建与 L3/L4 上下文拉取。
 * viewer-site 不配置该项 —— viewer-readonly 的系统提示词与上下文由 agent-service 服务端注入。
 */
export interface AuthorContextIntegration {
  /** 构建 L2+L5 静态 system prompt（author-site 的 buildStaticSystemPrompt） */
  buildStaticSystemPrompt(toolCapabilities: { toolNames?: string[] }): string;
  /**
   * 拉取并构建 L3 动态上下文前缀、L4 记忆前缀与知识库索引前缀
   * （author-site 侧封装 workspace-context API 与各 build*Prefix 函数）。
   * 三项均为可直接拼接到 user content 前的最终字符串。
   */
  fetchContextPrefix(workingDir: string): Promise<{
    l3: string;
    memoryPrefix: string | null;
    knowledgePrefix: string | null;
  }>;
}

export interface AiChatSharedConfig {
  /** 宿主提供 AgentClient 实例（author-site 带 apiKey，viewer-site 为 viewer-readonly 模式） */
  getAgentClient: () => AgentClient;
  /** 创作端专属集成；viewer-site 不配置 */
  authorContext?: AuthorContextIntegration;
}

let sharedConfig: AiChatSharedConfig | null = null;

/** 宿主应用在使用共享聊天组件前调用一次 */
export function configureAiChatShared(config: AiChatSharedConfig): void {
  sharedConfig = config;
}

export function getConfiguredAgentClient(): AgentClient {
  if (!sharedConfig) {
    throw new Error(
      "ai-chat-shared 未配置：请先调用 configureAiChatShared({ getAgentClient })",
    );
  }
  return sharedConfig.getAgentClient();
}

export function getAuthorContextIntegration(): AuthorContextIntegration | null {
  return sharedConfig?.authorContext ?? null;
}
