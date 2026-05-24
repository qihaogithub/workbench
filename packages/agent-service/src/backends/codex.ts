import { IBackendAdapter, BackendStatus } from "./base";
import { AgentConfig, AgentEvent } from "../core/types";
import { request } from "undici";
import { logger } from "../utils/logger";

const DEFAULT_MODEL = "gpt-4o";
const DEFAULT_TIMEOUT = 120000;
const API_URL = "https://api.openai.com/v1/chat/completions";

export class CodexBackend implements IBackendAdapter {
  readonly name = "codex";
  private config: AgentConfig;
  private apiKey: string;
  private model: string;
  private timeout: number;
  private status: BackendStatus = "idle";
  private eventCallback?: (event: AgentEvent) => void;
  private conversationHistory: Array<{ role: string; content: string }> = [];

  constructor(config: AgentConfig) {
    this.config = config;
    this.apiKey = config.codex?.apiKey || process.env.OPENAI_API_KEY || "";
    this.model = config.codex?.model || DEFAULT_MODEL;
    this.timeout = config.codex?.timeout || DEFAULT_TIMEOUT;
  }

  async initialize(): Promise<void> {
    if (!this.apiKey) {
      throw new Error(
        "OpenAI API key is required. Set OPENAI_API_KEY environment variable.",
      );
    }
    this.status = "ready";
    logger.info(
      { sessionId: this.config.sessionId },
      "Codex backend initialized",
    );
  }

  async sendMessage(
    content: string,
    options?: { stream?: boolean },
  ): Promise<string> {
    this.status = "busy";
    this.conversationHistory.push({ role: "user", content });

    try {
      const response = await request(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: this.buildSystemPrompt() },
            ...this.conversationHistory,
          ],
          stream: true,
        }),
        signal: AbortSignal.timeout(this.timeout),
      });

      const resultContent = await this.parseStreamResponse(response);
      this.conversationHistory.push({
        role: "assistant",
        content: resultContent,
      });
      this.status = "ready";
      return resultContent;
    } catch (error) {
      this.status = "error";
      throw error;
    }
  }

  private buildSystemPrompt(): string {
    const parts = [
      "你是专业的全栈开发助手,负责生成 React 组件代码。",
      "",
      "## 可用依赖",
      "以下依赖已在预览环境中预装,可直接使用:",
      "",
      "### 核心依赖",
      "- react, react-dom(React 框架)",
      "- tailwindcss(样式系统,通过 CDN 加载)",
      "",
      "### 工具库",
      "- clsx, tailwind-merge(样式类名合并)",
      "- class-variance-authority(组件变体系统)",
      "",
      "### UI 库",
      "- lucide-react(图标库)",
      "- framer-motion(动画库)",
      "",
      "## 代码规范",
      "- 使用 TypeScript",
      "- 使用 Tailwind CSS 样式",
      "- 默认导出 React 组件",
      "- 使用 clsx + tailwind-merge 处理动态类名",
      "",
      "## 使用非常规依赖",
      "如需使用上述列表外的 npm 包,请在代码顶部用注释声明:",
      "```typescript",
      "// @dependency package-name",
      "// @dependency another-package@^1.0.0",
      "",
      "import React from 'react';",
      "// ... 你的代码",
      "```",
      "",
      "## React 版本约束",
      "预览环境使用 React 18.3.1，所有第三方 React 依赖必须兼容此版本。",
      "禁止手动 import React（由 React JSX Runtime 自动处理）。",
      "使用第三方 React 库时，优先使用白名单中的库（lucide-react、framer-motion）。",
      "如需使用白名单外的库，请通过 // @dependency 注释声明。",
    ];

    if (this.config.workingDir) {
      parts.push("", `Working directory: ${this.config.workingDir}`);
    }

    return parts.join("\n");
  }

  private async parseStreamResponse(response: {
    body: unknown;
  }): Promise<string> {
    let fullContent = "";

    try {
      const reader = response.body as unknown as {
        getReader: () => ReadableStreamDefaultReader<Uint8Array>;
      };
      if (reader.getReader) {
        const streamReader = reader.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let done = false;

        while (!done) {
          const readResult = await streamReader.read();
          done = readResult.done;
          const value = readResult.value;
          if (!value) continue;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data:")) continue;

            const data = trimmed.slice(5).trim();
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data) as {
                type?: string;
                delta?: { text?: string; content?: string };
              };
              if (
                parsed.type === "response.output_text.delta" ||
                parsed.type === "response.content.delta"
              ) {
                const text = parsed.delta?.text || parsed.delta?.content || "";
                fullContent += text;
                if (this.eventCallback) {
                  this.eventCallback({
                    type: "stream",
                    sessionId: this.config.sessionId,
                    content: text,
                    done: false,
                  });
                }
              }
            } catch {
              // Ignore parse errors for individual chunks
            }
          }
        }
      }
    } catch {
      // Ignore stream reading errors
    }

    return fullContent;
  }

  onStream(callback: (event: AgentEvent) => void): void {
    this.eventCallback = callback;
  }

  async getStatus(): Promise<BackendStatus> {
    return this.status;
  }

  async destroy(): Promise<void> {
    this.conversationHistory = [];
    this.status = "idle";
    logger.info(
      { sessionId: this.config.sessionId },
      "Codex backend destroyed",
    );
  }

  async checkHealth(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const response = await request("https://api.openai.com/v1/models", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: AbortSignal.timeout(5000),
      });
      return response.statusCode === 200;
    } catch {
      return false;
    }
  }
}
