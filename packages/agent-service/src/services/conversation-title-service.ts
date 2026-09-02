import type { BackendProvidersConfig, ExternalAuthSessionConfig } from "@workbench/shared/contracts";

import type { AgentConfig } from "../core/types";
import { ModelManager } from "../backends/managers/model-manager";
import {
  getComplete,
  loadPiAgentDeps,
} from "../backends/managers/pi-agent-deps";

const TITLE_SYSTEM_PROMPT = [
  "你是会话标题生成器。",
  "请根据用户的首条消息生成一个简洁、准确的中文短标题。",
  "优先使用 3-12 个中文字符；中英文混合时控制在 6-24 个字符。",
  "只能输出标题本身，不要引号、标点、Markdown、前缀或解释。",
].join("\n");

export const CONVERSATION_TITLE_TIMEOUT_MS = 8_000;

export interface ConversationTitleRequest {
  sessionId: string;
  content: string;
  model?: string;
  backendProviders?: BackendProvidersConfig;
  externalAuth?: ExternalAuthSessionConfig;
}

function readTextContent(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const content = (message as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (item): item is { type: "text"; text: string } =>
        Boolean(item) &&
        typeof item === "object" &&
        (item as { type?: unknown }).type === "text" &&
        typeof (item as { text?: unknown }).text === "string",
    )
    .map((item) => item.text)
    .join("")
    .trim();
}

export async function generateConversationTitle(
  request: ConversationTitleRequest,
): Promise<string> {
  const content = request.content.trim();
  if (!content) throw new Error("标题内容不能为空");

  await loadPiAgentDeps();
  const modelConfig = {
    sessionId: request.sessionId,
    model: request.model?.trim() || undefined,
    backendProviders: request.backendProviders,
    externalAuth: request.externalAuth,
  } satisfies AgentConfig;

  let modelManager = new ModelManager(modelConfig);
  let model: any;
  try {
    model = modelManager.getModel();
  } catch (error) {
    // 客户端可能携带已经从模型列表移除的旧 ID；标题生成应回退到服务端当前激活模型，
    // 不影响首条消息和本地即时标题。
    if (!modelConfig.model) throw error;
    modelManager = new ModelManager({ ...modelConfig, model: undefined });
    model = modelManager.getModel();
  }
  const credentials = await modelManager.getApiKeyAndHeaders(model);
  const complete = getComplete();
  if (typeof complete !== "function") {
    throw new Error("标题模型不可用");
  }

  const abortController = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        abortController.abort();
        reject(new Error("标题生成超时"));
      }, CONVERSATION_TITLE_TIMEOUT_MS);
    });
    const result = await Promise.race([
      complete(
        model,
        {
          systemPrompt: TITLE_SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content,
              timestamp: Date.now(),
            },
          ],
          tools: [],
        },
        {
          apiKey: credentials?.apiKey,
          headers: credentials?.headers,
          maxTokens: 64,
          temperature: 0.2,
          timeoutMs: CONVERSATION_TITLE_TIMEOUT_MS,
          maxRetries: 0,
          signal: abortController.signal,
        },
      ),
      timeout,
    ]);

    const title = readTextContent(result);
    if (!title) throw new Error("标题模型未返回文本");
    return title;
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}
