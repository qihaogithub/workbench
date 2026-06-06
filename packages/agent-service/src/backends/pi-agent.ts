import { IBackendAdapter, BackendStatus } from './base';
import { AgentConfig, AgentEvent, FileChange, ImageAttachment } from '../core/types';
import { createWorkbenchTools, type PermissionHandler } from './pi-tools';
import { PERMISSION_TIMEOUT } from './pi-tools/delete-page-tool';
import { logger } from '../utils/logger';
import { loadConfig, type ServiceConfig } from '../utils/config';
import { getBackendProvidersManager } from '../config/backend-providers';
import { isPathAllowed, DEFAULT_WORKSPACE_PERMISSIONS } from './pi-tools/permissions';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * 判断文件路径是否属于知识库目录（knowledge/）
 * 统一为相对路径再判断，兼容绝对路径和相对路径输入
 */
function isKnowledgeBasePath(filePath: string, workingDir: string): boolean {
  const resolved = path.resolve(workingDir, filePath);
  const relative = path.relative(workingDir, resolved);
  const normalized = relative.replace(/\\/g, '/');
  return normalized === 'knowledge' ||
         normalized.startsWith('knowledge/') ||
         normalized.startsWith('knowledge\\');
}

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
let AgentHarness: any;
let NodeExecutionEnv: any;
let InMemorySessionRepo: any;
let getModel: any;
let getModels: any;

async function loadPiAgentDeps() {
  if (!AgentHarness) {
    const piAgentCore = await import('@earendil-works/pi-agent-core');
    AgentHarness = piAgentCore.AgentHarness;
    InMemorySessionRepo = piAgentCore.InMemorySessionRepo;

    // NodeExecutionEnv 从 /node 子入口导入
    const piAgentCoreNode = await import('@earendil-works/pi-agent-core/node');
    NodeExecutionEnv = piAgentCoreNode.NodeExecutionEnv;

    const piAi = await import('@earendil-works/pi-ai');
    getModel = piAi.getModel;
    getModels = piAi.getModels;
  }
}

export class PiAgentBackend implements IBackendAdapter {
  readonly name = "pi-agent";

  private harness: any = null;
  private env: any = null;
  private session: any = null;
  private sessionRepo: any = null;
  private config: AgentConfig;
  private status: BackendStatus = "idle";
  private eventCallback?: (event: AgentEvent) => void;
  private files: FileChange[] = [];
  private readKnowledgeFiles: Set<string> = new Set();
  private timeout?: number;
  private sessionId: string | null = null;
  private currentSystemPrompt: string = '';
  private unsubFns: Array<() => void> = [];
  private pendingPermissions: Map<string, { resolve: (approved: boolean) => void; reject: (error: Error) => void }> = new Map();

  constructor(config: AgentConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.status === "ready" || this.status === "initializing") {
      return;
    }

    this.status = "initializing";
    logger.info("Initializing Pi Agent backend (AgentHarness)");

    try {
      // 动态加载 ESM 依赖
      await loadPiAgentDeps();

      // 1. 创建 ExecutionEnv
      this.env = new NodeExecutionEnv({ cwd: this.config.workingDir ?? process.cwd() });

      // 2. 创建 Session
      this.sessionRepo = new InMemorySessionRepo();
      this.session = await this.sessionRepo.create();

      // 3. 创建工具（传入 deletePage 权限确认回调）
      const tools = createWorkbenchTools(this.config, (toolCallId, pageName) => this.requestPermission(toolCallId, pageName));

      // 4. 获取模型
      const model = this.getModel();

      logger.info({ modelId: model.id, provider: model.provider, baseUrl: model.baseUrl }, "Pi Agent model configured");

      // 5. 创建 AgentHarness
      this.harness = new AgentHarness({
        env: this.env,
        session: this.session,
        tools,
        model,
        systemPrompt: (context: any) => this.buildSystemPrompt(context),
        getApiKeyAndHeaders: (model: any) => this.getApiKeyAndHeaders(model),
        thinkingLevel: 'off',
      });

      // 6. 注册 Hook 事件（替代 beforeToolCall/afterToolCall）
      this.setupHooks();

      // 7. 注册观察事件（替代 setupEventMapping）
      this.setupEventMapping();

      this.status = "ready";
      logger.info("Pi Agent backend (AgentHarness) initialized");
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
        // 若 backendProviders 配置了 apiKey,附加到 model 对象上
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

  /**
   * AgentHarness 的 getApiKeyAndHeaders 回调
   * 参数从 provider: string 改为 model: Model<any>
   * 返回值从 string | undefined 改为 { apiKey, headers? } | undefined
   */
  private async getApiKeyAndHeaders(model: any): Promise<{ apiKey: string; headers?: Record<string, string> } | undefined> {
    const provider = model.provider;
    const providersManager = getBackendProvidersManager();

    // 优先级：backendProviders.apiKey > model.apiKey > piAgent.apiKey > env var > serviceConfig
    const providerConfig = providersManager.getProvider(provider);
    const apiKey =
      providerConfig?.apiKey ||
      model.apiKey ||
      this.config.piAgent?.apiKey ||
      process.env[`${provider.toUpperCase()}_API_KEY`] ||
      getServiceConfig().piAgent.apiKey;

    logger.info({ provider, apiKeyLength: apiKey?.length }, "Pi Agent getApiKeyAndHeaders called");

    if (!apiKey) return undefined;

    return { apiKey };
  }

  /**
   * 注册 Hook 事件（替代 beforeToolCall/afterToolCall）
   */
  private setupHooks(): void {
    // 替代 beforeToolCall — 权限检查
    const unsubToolCall = this.harness.on("tool_call", (event: any) => {
      const { toolName, input } = event;

      // 1. 路径权限校验
      if (['readFile', 'writeFile', 'listFiles'].includes(toolName)) {
        const targetPath = (input as any).path || (input as any).filePath;
        if (targetPath && !isPathAllowed(targetPath, this.config.workingDir ?? '', this.config.permissions ?? DEFAULT_WORKSPACE_PERMISSIONS)) {
          return { block: true, reason: `Access denied: path "${targetPath}" is not allowed by workspace permissions` };
        }
      }

      // 2. 知识库写保护
      if (toolName === 'writeFile') {
        const targetPath = (input as any).path;
        if (targetPath && isKnowledgeBasePath(targetPath, this.config.workingDir ?? '')) {
          return { block: true, reason: '知识库文件由用户管理，AI 不可修改。如需更新请提示用户在知识库面板中操作。' };
        }
      }

      // 3. Schema 修改前置校验：必须先读配置系统参考
      if (toolName === 'writeFile' || toolName === 'editFile') {
        const schemaPath = (input as any).path;
        if (schemaPath && String(schemaPath).replace(/\\/g, '/').endsWith('config.schema.json')) {
          if (!this.readKnowledgeFiles.has('配置系统参考.md')) {
            return {
              block: true,
              reason: '修改 config.schema.json 前，请先用 readFile 读取 knowledge/配置系统参考.md，了解系统支持的控件类型、扩展字段和配置规范，避免生成无效 schema。',
            };
          }
        }
      }

      // 注意：deletePage 权限确认已移至工具 execute 内部（通过 permissionHandler 回调），
      // 因为 on("tool_call") hook 是同步的，无法 await 用户确认

      return undefined; // 允许工具调用
    });
    this.unsubFns.push(unsubToolCall);

    // 替代 afterToolCall — 捕获文件变更
    const unsubToolResult = this.harness.on("tool_result", (event: any) => {
      const { toolName, input, isError } = event;

      if (toolName === 'writeFile' && !isError) {
        this.files.push({
          path: (input as any).path,
          action: 'modified',
          content: (input as any).content,
        });
      }

      // 追踪知识文件读取
      if ((toolName === 'readFile' || toolName === 'readFileWithLines') && !isError) {
        const readPath = (input as any).path;
        if (readPath && isKnowledgeBasePath(readPath, this.config.workingDir ?? '')) {
          const basename = path.basename(readPath);
          this.readKnowledgeFiles.add(basename);
        }
      }
      return undefined; // 不修改结果
    });
    this.unsubFns.push(unsubToolResult);
  }

  /**
   * deletePage 权限确认：发出 permission_request 事件，等待用户确认或超时
   * 此方法由 deletePage 工具的 execute 函数调用（异步等待）
   */
  private requestPermission(toolCallId: string, pageName: string): Promise<boolean> {
    const sessionId = this.sessionId ?? this.config.sessionId;

    logger.info({ toolCallId, pageName }, 'deletePage: requesting permission');

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
            title: `删除页面: ${pageName}`,
            kind: 'execute',
          },
        },
      });
    }

    // 等待用户确认或超时
    return new Promise<boolean>((resolve) => {
      this.pendingPermissions.set(toolCallId, { resolve, reject: (err: Error) => resolve(false) });

      // 超时自动拒绝
      setTimeout(() => {
        if (this.pendingPermissions.has(toolCallId)) {
          this.pendingPermissions.delete(toolCallId);
          logger.warn({ toolCallId }, 'deletePage: permission request timed out');
          resolve(false);
        }
      }, PERMISSION_TIMEOUT);
    });
  }

  /**
   * 事件映射：将 AgentHarness 事件映射为应用层 AgentEvent
   */
  private setupEventMapping(): void {
    const unsub = this.harness.subscribe((event: any) => {
      if (!this.eventCallback) return;

      const sessionId = this.sessionId ?? this.config.sessionId;

      switch (event.type) {
        // 流式文本（来自底层 Agent）
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

        // Agent 结束（来自底层 Agent）
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

        // 工具调用（来自 AgentHarness 自有事件）
        case 'tool_call':
          this.eventCallback({
            type: 'tool_call',
            sessionId,
            toolCallId: event.toolCallId,
            status: 'in_progress',
            title: event.toolName,
            kind: 'execute',
          });
          break;

        // 工具结果（来自 AgentHarness 自有事件）
        case 'tool_result':
          this.eventCallback({
            type: 'tool_call_update',
            sessionId,
            toolCallId: event.toolCallId,
            status: event.isError ? 'failed' : 'completed',
          });
          break;

        // 上下文压缩完成
        case 'session_compact':
          this.eventCallback({
            type: 'status',
            sessionId,
            status: 'processing',
          });
          break;

        // 保存点（可用于持久化会话状态）
        case 'save_point':
          // 未来可在此持久化 Session
          break;
      }
    });
    this.unsubFns.push(unsub);
  }

  async sendMessage(content: string, options?: { stream?: boolean; images?: ImageAttachment[] }): Promise<string> {
    if (!this.harness) throw new Error("Agent not initialized");
    this.status = "busy";
    this.files = [];

    const images = options?.images;
    const model = this.getModel();
    const modelSupportsImages = Array.isArray(model?.input) && model.input.includes('image');

    let promptContent = content;
    let imageContent: any[] | undefined;

    if (images && images.length > 0) {
      if (modelSupportsImages) {
        // 多模态模型：直接传图片（适配 AgentHarness 的 ImageContent 格式）
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
      // harness.prompt() 直接返回 AssistantMessage，无需 waitForIdle + 手动消息提取
      const result = await this.harness.prompt(promptContent, { images: imageContent });
      this.status = "ready";

      // result 是 AssistantMessage，直接提取文本
      const text = result.content
        ?.filter((c: any) => c.type === 'text')
        ?.map((c: any) => c.text)
        ?.join('') || '';

      logger.info({ resultLength: text.length }, "Pi Agent response extracted");
      return text;
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
    // 取消所有订阅
    for (const unsub of this.unsubFns) {
      unsub();
    }
    this.unsubFns = [];

    // 中止 harness
    if (this.harness) {
      await this.harness.abort();
      this.harness = null;
    }

    // 清理 ExecutionEnv
    if (this.env) {
      await this.env.cleanup();
      this.env = null;
    }

    this.session = null;
    this.sessionRepo = null;
    this.files = [];
    this.status = "idle";
    logger.info("Pi Agent backend destroyed");
  }

  async checkHealth(): Promise<boolean> {
    return this.harness !== null;
  }

  async start(options?: { resumeSessionId?: string }): Promise<void> {
    this.sessionId = options?.resumeSessionId ?? null;
    if (!this.harness) {
      await this.initialize();
    }
  }

  async setModel(modelId: string): Promise<void> {
    if (!this.harness) throw new Error("Agent not initialized");
    const [provider, id] = modelId.split('/');
    this.config.piAgent = {
      ...this.config.piAgent,
      provider: provider || this.config.piAgent?.provider,
      model: id || modelId,
    };
    // 使用 harness.setModel() 运行时切换，无需重建
    const model = this.getModel();
    await this.harness.setModel(model);
    logger.info({ modelId }, "Model switched at runtime");
  }

  async getModelInfo(): Promise<{ currentModelId: string | null; availableModels: Array<{ id: string; label: string }>; canSwitch: boolean } | null> {
    const svc = getServiceConfig();
    const providersManager = getBackendProvidersManager();

    // 优先级: 推送的 activeModelId > this.config.piAgent > serviceConfig 默认
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

    // 1) 当前激活 provider: 优先使用 backendProviders 中声明的模型列表
    const providerModels = providersManager.getProviderModels(provider);
    if (providerModels.length > 0) {
      for (const m of providerModels) {
        add(m.id, m.label);
      }
      logger.info(
        { provider, modelCount: providerModels.length },
        "Using backendProviders for active provider model list",
      );
    } else {
      // pi-ai 内置 KnownProvider 回退
      try {
        if (getModels) {
          const models = getModels(provider);
          if (models.length > 0) {
            for (const m of models) {
              add(`${provider}/${m.id}`, m.name || m.id);
            }
          }
        }
      } catch (error) {
        logger.warn({ error, provider }, "Failed to get available models from pi-ai");
      }
    }

    // 2) 遍历其他 backendProviders, 把每个 provider 的每个模型都加入列表
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

    // 3) 终极 fallback: 若仍为空, 用当前 model 配置构造一个
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
    if (this.harness) {
      // abort() 返回 Promise，但 cancelPrompt 是同步方法
      // 用 void 忽略 Promise，避免未处理的 rejection
      void this.harness.abort();
    }
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

  /**
   * 动态 System Prompt 函数 — 利用 AgentHarness 提供的丰富上下文
   */
  private buildSystemPrompt(context: {
    env: any;
    session: any;
    model: any;
    thinkingLevel: any;
    activeTools: any[];
    resources: any;
  }): string {
    return this.currentSystemPrompt || '# Workbench AI 编码助手\n\n等待 system prompt 注入...';
  }

  /**
   * 运行时更新 system prompt
   * 存储到 currentSystemPrompt，动态函数自动读取，无需重建 AgentHarness
   */
  async updateSystemPrompt(newPrompt: string): Promise<void> {
    this.currentSystemPrompt = newPrompt;
    logger.info({ promptLength: newPrompt.length }, 'System prompt updated');
  }
}
