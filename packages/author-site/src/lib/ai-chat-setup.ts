import { configureAiChatShared } from "@workbench/ai-chat-shared";
import { getAgentClient } from "@/lib/agent-client";
import {
  buildStaticSystemPrompt,
  buildDynamicContextPrefix,
  buildMemoryPrefix,
  buildKnowledgeIndexPrefix,
} from "@/lib/agent/system-prompt";

/**
 * 异步获取并构建 L3 上下文前缀、L4 记忆前缀与知识库索引前缀
 * （通过服务端 API 避免客户端打包 fs）。
 * 失败时返回空值（仍会发送，但 AI 无法感知页面列表/记忆）。
 */
async function fetchContextPrefix(workingDir: string): Promise<{
  l3: string;
  memoryPrefix: string | null;
  knowledgePrefix: string | null;
}> {
  try {
    const response = await fetch(
      `/api/agent/workspace-context?workingDir=${encodeURIComponent(workingDir)}`,
      { method: "GET" },
    );
    if (!response.ok) {
      console.warn(
        "[ai-chat-setup] workspace-context API 响应非 OK:",
        response.status,
        response.statusText,
      );
      return { l3: "", memoryPrefix: null, knowledgePrefix: null };
    }
    const json = await response.json();
    if (!json?.success || !json?.data) {
      console.warn("[ai-chat-setup] workspace-context 返回失败:", json);
      return { l3: "", memoryPrefix: null, knowledgePrefix: null };
    }
    const l3 = buildDynamicContextPrefix(json.data);
    const memoryPrefix = json.data.memoryContent
      ? buildMemoryPrefix(json.data.memoryContent)
      : null;
    const knowledgePrefix = json.data.knowledgeIndex
      ? buildKnowledgeIndexPrefix(json.data.knowledgeIndex)
      : null;
    return { l3, memoryPrefix, knowledgePrefix };
  } catch (error) {
    console.warn("[ai-chat-setup] fetchContextPrefix 失败:", error);
    return { l3: "", memoryPrefix: null, knowledgePrefix: null };
  }
}

// 模块加载即注入创作端集成：AgentClient（含 apiKey）+ 静态 system prompt + L3/L4 上下文
configureAiChatShared({
  getAgentClient,
  authorContext: {
    buildStaticSystemPrompt,
    fetchContextPrefix,
  },
});
