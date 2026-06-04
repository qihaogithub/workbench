import { IBackendAdapter, BackendStatus } from './base';
import { AgentConfig, AgentEvent, FileChange, ImageAttachment } from '../core/types';
import { createWorkbenchTools } from './pi-tools';
import { PERMISSION_TIMEOUT } from './pi-tools/delete-page-tool';
import { logger } from '../utils/logger';
import { loadConfig, type ServiceConfig } from '../utils/config';
import { getBackendProvidersManager } from '../config/backend-providers';
import { isPathAllowed, DEFAULT_WORKSPACE_PERMISSIONS } from './pi-tools/permissions';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// 惰性加载 serviceConfig:避免在 dotenv.config() 执行前读取环境变量
// (ES Module 中 import 在顶层代码前执行,直接 const serviceConfig = loadConfig() 会读到默认值)
let _serviceConfig: ServiceConfig | null = null;
function getServiceConfig(): ServiceConfig {
  if (!_serviceConfig) {
    _serviceConfig = loadConfig();
  }
  return _serviceConfig;
}

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
  private pendingPermissions: Map<string, { resolve: (approved: boolean) => void; reject: (error: Error) => void }> = new Map();

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
          // v3.2: 使用占位 systemPrompt，运行时由 author-site 端通过 updateSystemPrompt 注入
          // 这样 system prompt 100% 静态 → LLM API 缓存持续命中
          systemPrompt: '# Workbench AI 编码助手\n\n等待 system prompt 注入...',
          tools: tools,
        },
        streamFn: streamSimple,
        getApiKey: async (provider: string) => {
          // 优先级：backendProviders.apiKey > model.apiKey > piAgent.apiKey > env var > service config
          const providerConfig = getBackendProvidersManager().getProvider(provider);
          const apiKey =
            providerConfig?.apiKey ||
            (model as any).apiKey ||
            this.config.piAgent?.apiKey ||
            process.env[`${provider.toUpperCase()}_API_KEY`] ||
            getServiceConfig().piAgent.apiKey;
          logger.info({ provider, apiKeyLength: apiKey?.length }, "Pi Agent getApiKey called");
          return apiKey;
        },
        beforeToolCall: async (context: any) => {
          const toolName = context.toolCall.name;
          if (toolName === 'readFile' || toolName === 'writeFile' || toolName === 'listFiles') {
            const args = context.args as { path?: string };
            if (args.path && !isPathAllowed(args.path, this.config.workingDir ?? '', this.config.permissions ?? DEFAULT_WORKSPACE_PERMISSIONS)) {
              return { block: true, reason: `Access denied: path "${args.path}" is not allowed by workspace permissions` };
            }
          }
          if (toolName === 'deletePage') {
            const args = context.args as { pageId: string; pageName: string };
            const toolCallId = context.toolCall.id || `del_${Date.now()}`;
            const sessionId = this.sessionId ?? this.config.sessionId;

            logger.info({ toolCallId, pageId: args.pageId, pageName: args.pageName }, 'deletePage: requesting permission');

            // 发出 permission_request 事件，等待前端用户确认
            if (this.eventCallback) {
              this.eventCallback({
                type: 'permission_request',
                sessionId,
                permissionRequest: {
                  sessionId,
                  options: [
                    { optionId: 'allow_once', name: '确认删除' },
                    { optionId: 'reject_once', name: '取消' },
                  ],
                  toolCall: {
                    toolCallId,
                    title: `删除页面: ${args.pageName}`,
                    kind: 'execute',
                  },
                },
              });
            }

            // 等待用户确认或超时
            const approved = await new Promise<boolean>((resolve, reject) => {
              this.pendingPermissions.set(toolCallId, { resolve, reject });

              // 超时自动拒绝
              setTimeout(() => {
                if (this.pendingPermissions.has(toolCallId)) {
                  this.pendingPermissions.delete(toolCallId);
                  logger.warn({ toolCallId }, 'deletePage: permission request timed out');
                  resolve(false);
                }
              }, PERMISSION_TIMEOUT);
            });

            if (!approved) {
              logger.info({ toolCallId, pageId: args.pageId }, 'deletePage: permission denied');
              return { block: true, reason: `用户取消了删除页面「${args.pageName}」的操作` };
            }

            logger.info({ toolCallId, pageId: args.pageId }, 'deletePage: permission granted');
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
    const svc = getServiceConfig();
    const provider = this.config.piAgent?.provider || svc.piAgent.provider;
    // 优先使用 piAgent 配置的 model，不要使用 OpenCode 的 config.model
    const modelId = this.config.piAgent?.model || svc.piAgent.model;
    const providersManager = getBackendProvidersManager();

    // 1) 优先从 backendProviders 拿 baseURL/apiKey（运行时动态配置）
    const providerConfig = providersManager.getProvider(provider);
    const baseUrl = providerConfig?.baseURL || this.config.piAgent?.baseUrl || svc.piAgent.baseUrl;
    const apiKeyFromProvider = providerConfig?.apiKey;

    logger.info(
      { modelId, provider, baseUrl, hasProviderConfig: !!providerConfig },
      "Pi Agent getModel",
    );

    // 如果有自定义 baseUrl，创建自定义模型
    if (baseUrl) {
      return {
        id: modelId,
        name: modelId,
        api: 'openai-completions' as const,
        provider: provider,
        baseUrl: baseUrl,
        // 若 backendProviders 配置了 apiKey,附加到 model 对象上(供 Agent.getApiKey 使用)
        ...(apiKeyFromProvider ? { apiKey: apiKeyFromProvider } : {}),
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

  async sendMessage(content: string, options?: { stream?: boolean; images?: ImageAttachment[] }): Promise<string> {
    if (!this.agent) throw new Error("Agent not initialized");
    this.status = "busy";
    this.files = [];
    
    const images = options?.images;
    const model = this.agent.state.model;
    const modelSupportsImages = Array.isArray(model?.input) && model.input.includes('image');

    let promptContent = content;
    let imageContent: Array<{ type: string; source: { type: string; media_type: string; data: string } }> | undefined;

    if (images && images.length > 0) {
      if (modelSupportsImages) {
        // 多模态模型：直接传图片
        imageContent = images.map((img) => ({
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: img.mimeType,
            data: img.data,
          },
        }));
      } else {
        // 非多模态模型：自动保存图片到图床，返回绝对 URL
        const savedUrls: string[] = [];

        for (const img of images) {
          const filename = img.name || `image-${Date.now()}-${savedUrls.length + 1}.png`;

          try {
            const buffer = Buffer.from(img.data, 'base64');
            const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
            const hashPrefix = sha256.slice(0, 12);
            const storedFilename = `${hashPrefix}-${filename}`;
            const dataDir = process.env.DATA_DIR
              ? path.resolve(process.env.DATA_DIR)
              : (() => {
                  let current = path.resolve(process.cwd());
                  while (current !== path.dirname(current)) {
                    if (fs.existsSync(path.join(current, 'pnpm-workspace.yaml'))) {
                      return path.join(current, 'data');
                    }
                    current = path.dirname(current);
                  }
                  return path.join(process.cwd(), 'data');
                })();
            const imagesDir = path.join(dataDir, 'images');
            const storedPath = path.join(imagesDir, storedFilename);
            const publicUrl = `/api/images/${storedFilename}`;

            if (!fs.existsSync(imagesDir)) {
              fs.mkdirSync(imagesDir, { recursive: true });
            }

            if (!fs.existsSync(storedPath)) {
              await fs.promises.writeFile(storedPath, buffer);
            }

            savedUrls.push(publicUrl);
            logger.info({ publicUrl, size: buffer.length }, 'Auto-saved image to image server');
          } catch (error) {
            logger.error({ filename, error }, 'Failed to auto-save image');
          }
        }

        if (savedUrls.length > 0) {
          const urlList = savedUrls.map((u) => `- ${u}`).join('\n');
          promptContent = `${content}\n\n[已自动保存 ${savedUrls.length} 张图片到图床，绝对 URL 如下，可直接在页面中使用：\n${urlList}]`;
        }
      }
    }

    logger.info(
      { contentLength: promptContent.length, imageCount: images?.length || 0, modelSupportsImages },
      "Pi Agent sending message",
    );
    
    try {
      await this.agent.prompt(promptContent, imageContent);
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
    const svc = getServiceConfig();
    const providersManager = getBackendProvidersManager();

    // 优先级: 推送的 activeModelId > this.config.piAgent > serviceConfig 默认
    // 注意: split 可能在末尾产生空字符串 (e.g. "anthropic/" -> ["anthropic", ""]),
    //       此时应回退到 this.config.piAgent, 否则 modelId 变空
    const activeFromManager = providersManager.getActiveModelId();
    const [managerProvider, ...managerRest] = activeFromManager
      ? activeFromManager.split("/")
      : [];
    const managerModel = managerRest.length ? managerRest.join("/") : "";
    const useManager = !!(managerProvider && managerModel);

    const provider = useManager
      ? managerProvider
      : this.config.piAgent?.provider || svc.piAgent.provider;
    const modelId = useManager
      ? managerModel
      : this.config.piAgent?.model || svc.piAgent.model;

    const availableModels: Array<{ id: string; label: string }> = [];
    const seen = new Set<string>();
    const add = (id: string, label: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      availableModels.push({ id, label });
    };

    // 1) 当前激活 provider: 优先尝试 pi-ai 内置 KnownProvider
    let builtinHit = false;
    try {
      if (getModels) {
        const models = getModels(provider);
        if (models.length > 0) {
          builtinHit = true;
          for (const m of models) {
            add(`${provider}/${m.id}`, m.name || m.id);
          }
        }
      }
    } catch (error) {
      logger.warn({ error, provider }, "Failed to get available models from pi-ai");
    }

    // 2) 自定义 provider (内置未命中): 回退到 backendProviders 当前 provider 的模型
    if (!builtinHit) {
      const providerModels = providersManager.getProviderModels(provider);
      for (const m of providerModels) {
        add(m.id, m.label);
      }
      if (providerModels.length > 0) {
        logger.info(
          { provider, modelCount: providerModels.length },
          "Using backendProviders for active provider model list",
        );
      }
    }

    // 3) 遍历其他 backendProviders, 把每个 provider 的每个模型都加入列表
    //    修复前: 只返回当前 provider 的模型, 用户配置的其他供应商看不到
    const allProviders = providersManager.getConfig().providers;
    for (const p of allProviders) {
      if (p.id === provider) continue;
      if (p.enabled === false) continue;
      for (const m of p.models) {
        add(`${p.id}/${m}`, m);
      }
    }
    if (allProviders.length > 1) {
      logger.info(
        { totalProviders: allProviders.length, totalModels: availableModels.length },
        "Multi-provider model list assembled",
      );
    }

    // 4) 终极 fallback: 若仍为空 (没有 backendProviders 也没有 builtin), 用当前 model 配置构造一个
    if (availableModels.length === 0 && modelId) {
      add(`${provider}/${modelId}`, modelId);
      logger.info(
        { provider, modelId },
        "Using synthetic model from config (last-resort fallback)",
      );
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

  /**
   * 解除权限等待：前端用户确认或取消后调用
   */
  resolvePermission(toolCallId: string, approved: boolean): void {
    const pending = this.pendingPermissions.get(toolCallId);
    if (pending) {
      this.pendingPermissions.delete(toolCallId);
      pending.resolve(approved);
      logger.info({ toolCallId, approved }, 'deletePage: permission resolved');
    } else {
      logger.warn({ toolCallId }, 'deletePage: no pending permission found for toolCallId');
    }
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

  /**
   * v3.2: 运行时更新 system prompt（仅接收静态部分 L2 + L4）
   *
   * - 不重建 Agent 实例，保留对话历史（messages 数组不变）
   * - 依赖 Pi Agent core 的 AgentState.systemPrompt 是可写字段
   * - 调用频率：可低频（静态部分实际上一次都不变），保留接口以备规则更新
   */
  async updateSystemPrompt(newPrompt: string): Promise<void> {
    if (!this.agent) {
      logger.warn('updateSystemPrompt called before agent initialized, ignoring');
      return;
    }
    this.agent.state.systemPrompt = newPrompt;
    logger.info({ promptLength: newPrompt.length }, 'System prompt updated via updateSystemPrompt');
  }

  /**
   * @deprecated v3.2 拆分：硬编码 system prompt 模板已迁至 author-site 端
   * （packages/shared/src/agent-prompts/demo-generator.template.ts + author-site/src/lib/agent/system-prompt.ts）
   */
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
