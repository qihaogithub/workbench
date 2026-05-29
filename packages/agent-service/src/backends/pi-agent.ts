import { IBackendAdapter, BackendStatus } from './base';
import { AgentConfig, AgentEvent, FileChange } from '../core/types';
import { createWorkbenchTools } from './pi-tools';
import { logger } from '../utils/logger';
import { loadConfig } from '../utils/config';

const serviceConfig = loadConfig();

// 动态导入 ESM-only 依赖
let Agent: any;
let streamSimple: any;
let getModel: any;
let getModels: any;

async function loadPiAgentDeps() {
  if (!Agent) {
    const piAgentCore = await import('@earendil-works/pi-agent-core');
    const piAi = await import('@earendil-works/pi-ai');
    Agent = piAgentCore.Agent;
    streamSimple = piAi.streamSimple;
    getModel = piAi.getModel;
    getModels = piAi.getModels;
  }
}

export class PiAgentBackend implements IBackendAdapter {
  readonly name = "pi-agent";
  
  private agent: any = null;
  private config: AgentConfig;
  private status: BackendStatus = "idle";
  private eventCallback?: (event: AgentEvent) => void;
  private files: FileChange[] = [];
  private timeout?: number;
  private sessionId: string | null = null;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.status === "ready" || this.status === "initializing") {
      return;
    }

    this.status = "initializing";
    logger.info("Initializing Pi Agent backend");

    try {
      // 动态加载 ESM 依赖
      await loadPiAgentDeps();
      
      const tools = createWorkbenchTools(this.config);
      const model = this.getModel();
      
      logger.info({ modelId: model.id, provider: model.provider, baseUrl: model.baseUrl }, "Pi Agent model configured");
      
      this.agent = new Agent({
        initialState: {
          model: model,
          systemPrompt: this.buildSystemPrompt(),
          tools: tools,
        },
        streamFn: streamSimple,
        getApiKey: async (provider: string) => {
          const apiKey = this.config.piAgent?.apiKey || 
                 process.env[`${provider.toUpperCase()}_API_KEY`] ||
                 serviceConfig.piAgent.apiKey;
          logger.info({ provider, apiKeyLength: apiKey?.length }, "Pi Agent getApiKey called");
          return apiKey;
        },
        beforeToolCall: async (context: any) => {
          const toolName = context.toolCall.name;
          if (toolName === 'readFile' || toolName === 'writeFile' || toolName === 'listFiles') {
            const args = context.args as { path?: string };
            if (args.path && !this.isPathAllowed(args.path)) {
              return { block: true, reason: `Access denied: path outside working directory` };
            }
          }
          return undefined;
        },
        afterToolCall: async (context: any) => {
          if (context.toolCall.name === 'writeFile' && !context.isError) {
            const args = context.args as { path: string; content: string };
            this.files.push({
              path: args.path,
              action: 'modified',
              content: args.content,
            });
          }
          return undefined;
        },
      });

      this.setupEventMapping();
      this.status = "ready";
      logger.info("Pi Agent backend initialized");
    } catch (error) {
      this.status = "error";
      logger.error({ error }, "Failed to initialize Pi Agent backend");
      throw error;
    }
  }

  private getModel() {
    const provider = this.config.piAgent?.provider || serviceConfig.piAgent.provider;
    // 优先使用 piAgent 配置的 model，不要使用 OpenCode 的 config.model
    const modelId = this.config.piAgent?.model || serviceConfig.piAgent.model;
    const baseUrl = this.config.piAgent?.baseUrl || serviceConfig.piAgent.baseUrl;
    
    logger.info({ modelId, provider, baseUrl }, "Pi Agent getModel");
    
    // 如果有自定义 baseUrl，创建自定义模型
    if (baseUrl) {
      return {
        id: modelId,
        name: modelId,
        api: 'openai-completions' as const,
        provider: provider,
        baseUrl: baseUrl,
        reasoning: false,
        input: ['text'] as const,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 4096,
      };
    }
    
    // 否则使用预定义模型
    return getModel(provider, modelId);
  }

  private isPathAllowed(filePath: string): boolean {
    if (!this.config.workingDir) return true;
    const resolvedPath = require('path').resolve(this.config.workingDir, filePath);
    return resolvedPath.startsWith(this.config.workingDir);
  }

  async sendMessage(content: string, options?: { stream?: boolean }): Promise<string> {
    if (!this.agent) throw new Error("Agent not initialized");
    this.status = "busy";
    this.files = [];
    
    logger.info({ content: content.substring(0, 100) }, "Pi Agent sending message");
    
    try {
      await this.agent.prompt(content);
      logger.info("Pi Agent prompt sent, waiting for idle");
      await this.agent.waitForIdle();
      logger.info("Pi Agent idle, extracting response");
      this.status = "ready";
      
      // 检查错误消息
      if (this.agent.state.errorMessage) {
        logger.error({ errorMessage: this.agent.state.errorMessage }, "Pi Agent error message");
      }
      
      const lastAssistantMessage = this.agent.state.messages
        .filter((m: any) => m.role === 'assistant')
        .pop();
      
      if (lastAssistantMessage && 'content' in lastAssistantMessage) {
        // 检查消息是否有错误
        if ('errorMessage' in lastAssistantMessage && lastAssistantMessage.errorMessage) {
          logger.error({ errorMessage: lastAssistantMessage.errorMessage }, "Pi Agent assistant message error");
        }
        
        const result = lastAssistantMessage.content
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text)
          .join('');
        logger.info({ resultLength: result.length }, "Pi Agent response extracted");
        return result;
      }
      
      logger.warn("No assistant message found");
      return '';
    } catch (error) {
      this.status = "error";
      logger.error({ error }, "Failed to send message");
      throw error;
    }
  }

  onStream(callback: (event: AgentEvent) => void): void {
    this.eventCallback = callback;
  }

  async getStatus(): Promise<BackendStatus> {
    return this.status;
  }

  async destroy(): Promise<void> {
    this.agent?.abort();
    this.agent = null;
    this.files = [];
    this.status = "idle";
    logger.info("Pi Agent backend destroyed");
  }

  async checkHealth(): Promise<boolean> {
    return this.agent !== null;
  }

  async start(options?: { resumeSessionId?: string }): Promise<void> {
    this.sessionId = options?.resumeSessionId ?? null;
    if (!this.agent) {
      await this.initialize();
    }
  }

  async setModel(modelId: string): Promise<void> {
    if (!this.agent) throw new Error("Agent not initialized");
    const [provider, id] = modelId.split('/');
    this.config.piAgent = {
      ...this.config.piAgent,
      provider: provider || this.config.piAgent?.provider,
      model: id || modelId,
    };
    logger.info({ modelId }, "Model set for Pi Agent backend");
  }

  async getModelInfo(): Promise<{ currentModelId: string | null; availableModels: Array<{ id: string; label: string }>; canSwitch: boolean } | null> {
    const provider = this.config.piAgent?.provider || serviceConfig.piAgent.provider;
    const modelId = this.config.piAgent?.model || serviceConfig.piAgent.model;

    // getModels(provider) returns Array<{ id, name, provider, ... }>
    const availableModels: Array<{ id: string; label: string }> = [];
    try {
      if (getModels) {
        const models = getModels(provider);
        for (const m of models) {
          availableModels.push({
            id: `${provider}/${m.id}`,
            label: m.name || m.id,
          });
        }
      }
    } catch (error) {
      logger.warn({ error, provider }, "Failed to get available models from pi-ai");
    }

    // Fallback: for custom providers not known by pi-ai, fetch from OpenCode Server
    if (availableModels.length === 0) {
      try {
        const opencodeUrl = process.env.OPENCODE_SERVER_URL || 'http://localhost:4096';
        const response = await fetch(`${opencodeUrl}/provider`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });
        if (response.ok) {
          const data = await response.json() as {
            all?: Array<{ id: string; models?: Record<string, { id: string; name?: string }> }>;
          };
          const providerInfo = data.all?.find((p) => p.id === provider);
          if (providerInfo?.models) {
            for (const [modelKey, modelInfo] of Object.entries(providerInfo.models)) {
              availableModels.push({
                id: `${provider}/${modelInfo.id || modelKey}`,
                label: modelInfo.name || modelInfo.id || modelKey,
              });
            }
          }
        }
      } catch (error) {
        logger.warn({ error, provider }, "Failed to fetch models from OpenCode Server");
      }
    }

    return {
      currentModelId: `${provider}/${modelId}`,
      availableModels,
      canSwitch: true,
    };
  }

  getCurrentSessionId(): string | null {
    return this.sessionId;
  }

  getFiles(): Array<{ path: string; action: 'created' | 'modified' | 'deleted'; content?: string }> {
    return this.files;
  }

  setPromptTimeout(seconds: number): void {
    this.timeout = seconds * 1000;
    logger.debug({ timeout: this.timeout }, "Pi Agent prompt timeout set");
  }

  cancelPrompt(): void {
    this.agent?.abort();
  }

  getWorkingDir(): string | null {
    return this.config.workingDir ?? null;
  }

  private setupEventMapping(): void {
    this.agent!.subscribe((event: any) => {
      if (!this.eventCallback) return;
      
      const sessionId = this.sessionId ?? this.config.sessionId;

      switch (event.type) {
        case 'message_update': {
          const assistantEvent = event.assistantMessageEvent;
          if (assistantEvent.type === 'text_delta') {
            this.eventCallback({
              type: 'stream',
              sessionId,
              content: assistantEvent.delta,
              done: false,
            });
          } else if (assistantEvent.type === 'thinking_delta') {
            this.eventCallback({
              type: 'thought',
              sessionId,
              content: assistantEvent.delta,
              done: false,
            });
          }
          break;
        }
        case 'tool_execution_start':
          this.eventCallback({
            type: 'tool_call',
            sessionId,
            toolCallId: event.toolCallId,
            status: 'in_progress',
            title: event.toolName,
            kind: 'execute',
          });
          break;
        case 'tool_execution_end':
          this.eventCallback({
            type: 'tool_call_update',
            sessionId,
            toolCallId: event.toolCallId,
            status: event.isError ? 'failed' : 'completed',
          });
          break;
        case 'agent_end':
          this.eventCallback({
            type: 'finish',
            sessionId,
            result: {
              success: true,
              content: '',
              files: this.files.length > 0 ? this.files : undefined,
            },
          });
          break;
      }
    });
  }

  private buildSystemPrompt(): string {
    return [
      '你是 Workbench 的 AI 编码助手，负责生成和修改 React 组件代码。',
      '',
      '## 角色定位',
      '- 你是一个专业的 React 开发工程师',
      '- 你专注于生成高质量、可维护的 TypeScript 代码',
      '- 你遵循最佳实践和代码规范',
      '',
      '## 工作空间规则',
      `- 工作目录: ${this.config.workingDir}`,
      `- 只能读写工作目录内的文件`,
      `- 修改 config.schema.json 后需校验格式`,
      `- 不能执行危险的系统命令（如 rm -rf、chmod 等）`,
      '',
      '## 可用依赖',
      '- react, react-dom',
      '- tailwindcss',
      '- clsx, tailwind-merge, class-variance-authority (cva)',
      '- lucide-react (图标)',
      '- framer-motion (动画)',
      '',
      '## 代码规范',
      '- 使用 TypeScript 编写类型安全的代码',
      '- 使用 Tailwind CSS 进行样式设计',
      '- 默认导出 React 组件',
      '- 使用 clsx + tailwind-merge 处理动态类名',
      '- 组件文件使用 .tsx 扩展名',
      '- 工具函数使用 .ts 扩展名',
      '',
      '## 工作流程',
      '1. 理解用户需求',
      '2. 设计组件结构',
      '3. 编写代码实现',
      '4. 确保代码可编译',
      '5. 如有需要，更新 config.schema.json',
      '',
      '## 质量要求',
      '- 代码必须是类型安全的',
      '- 组件应该是可复用的',
      '- 样式应该是响应式的',
      '- 遵循 React 最佳实践',
    ].join('\n');
  }
}
