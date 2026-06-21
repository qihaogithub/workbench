import { IBackendAdapter, BackendStatus } from './base';
import { AgentConfig, AgentEvent, FileChange, ImageAttachment } from '../core/types';
import { createWorkbenchTools, type PermissionHandler, type SubagentRunResult } from './pi-tools';
import { PERMISSION_TIMEOUT } from './pi-tools/delete-page-tool';
import { logger } from '../utils/logger';
import { loadConfig, type ServiceConfig } from '../utils/config';
import { getBackendProvidersManager } from '../config/backend-providers';
import { isPathAllowed, DEFAULT_WORKSPACE_PERMISSIONS } from './pi-tools/permissions';
import type { BackendProvider, BackendProvidersConfig } from '@opencode-workbench/shared';
import { ImageDescriber, type VisionDescribeRequest } from '../services/image-describer';
import * as path from 'path';

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

function findProvider(
  config: BackendProvidersConfig | undefined,
  providerId: string,
): BackendProvider | undefined {
  return config?.providers.find((provider) => provider.id === providerId && provider.enabled !== false);
}

function getActiveModelId(config: BackendProvidersConfig | undefined): string | undefined {
  if (!config) return undefined;
  if (config.activeModelId) return config.activeModelId;

  const provider =
    (config.activeProviderId ? findProvider(config, config.activeProviderId) : undefined) ||
    config.providers.find((item) => item.enabled !== false);
  if (!provider) return undefined;

  const model = provider.defaultModel || provider.models[0];
  return model ? `${provider.id}/${model}` : undefined;
}

function splitFullModelId(fullModelId: string | undefined): { provider?: string; model?: string } {
  if (!fullModelId) return {};
  const [provider, ...modelParts] = fullModelId.split('/');
  const model = modelParts.join('/');
  return provider && model ? { provider, model } : {};
}

function getToolResultDetails(event: any): any {
  return event?.details ?? event?.result?.details ?? event?.output?.details ?? event?.toolResult?.details;
}

function getDeletedPagesFromToolResult(event: any): Array<{ pageId: string; deletedPaths?: string[] }> {
  const details = getToolResultDetails(event);
  if (!details || !Array.isArray(details.deletedPages)) return [];
  return details.deletedPages.filter((page: any) => typeof page?.pageId === 'string');
}

function formatRuntimeToolsForPrompt(activeTools: Array<{ name?: string; description?: string }>): string {
  if (!activeTools.length) return '';

  const lines = activeTools
    .filter((tool) => typeof tool.name === 'string' && tool.name.trim().length > 0)
    .map((tool) => {
      const description = typeof tool.description === 'string' && tool.description.trim()
        ? `：${tool.description.trim()}`
        : '';
      return `- \`${tool.name}\`${description}`;
    });

  if (!lines.length) return '';

  return [
    '## 当前实际可用工具',
    '',
    '以下列表由运行时 activeTools 自动注入，代表你本轮真正可以调用的工具；如果这里列出了 `delegateTask`，你就可以使用子 Agent。',
    '',
    ...lines,
  ].join('\n');
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
  private selectedModel: { provider: string; modelId: string } | null = null;
  private imageDescriber: ImageDescriber;
  private activeSubagents: Set<any> = new Set();

  constructor(config: AgentConfig) {
    this.config = config;
    this.imageDescriber = new ImageDescriber(
      {},
      (request) => this.describeImageWithVisionModel(request),
    );
  }

  private areSubagentsEnabled(): boolean {
    const configured = this.config.piAgent?.subagentsEnabled;
    return configured ?? getServiceConfig().piAgent.subagentsEnabled;
  }

  private getSubagentTimeoutMs(): number {
    return this.config.piAgent?.subagentTimeout ?? getServiceConfig().piAgent.subagentTimeout;
  }

  private getSessionProvidersConfig(): BackendProvidersConfig | undefined {
    return this.config.backendProviders;
  }

  private getProviderConfig(providerId: string): BackendProvider | undefined {
    return (
      findProvider(this.getSessionProvidersConfig(), providerId) ||
      getBackendProvidersManager().getProvider(providerId)
    );
  }

  private resolveProviderAndModel(): { provider: string; modelId: string } {
    const svc = getServiceConfig();
    const selected = this.selectedModel;
    const sessionActive = splitFullModelId(getActiveModelId(this.getSessionProvidersConfig()));
    const managerActive = splitFullModelId(getBackendProvidersManager().getActiveModelId());

    return {
      provider:
        selected?.provider ||
        sessionActive.provider ||
        this.config.piAgent?.provider ||
        managerActive.provider ||
        svc.piAgent.provider,
      modelId:
        selected?.modelId ||
        sessionActive.model ||
        this.config.piAgent?.model ||
        managerActive.model ||
        svc.piAgent.model,
    };
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
      const tools = createWorkbenchTools(
        this.config,
        (toolCallId, pageName) => this.requestPermission(toolCallId, pageName),
        {
          includeDelegateTask: this.areSubagentsEnabled(),
          subagentRunner: (params, signal) => this.runSubagent(params, signal),
        },
      );

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
    const { provider, modelId } = this.resolveProviderAndModel();
    // 优先使用 piAgent 配置的 model，不要使用 OpenCode 的 config.model

    // 1) 优先从 backendProviders 拿 baseURL/apiKey（运行时动态配置）
    const providerConfig = this.getProviderConfig(provider);
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

  private getVisionModel(fullModelId: string) {
    const svc = getServiceConfig();
    const parsed = splitFullModelId(fullModelId);
    const provider = parsed.provider || this.resolveProviderAndModel().provider;
    const modelId = parsed.model || fullModelId;

    const providerConfig = this.getProviderConfig(provider);
    const baseUrl = providerConfig?.baseURL || this.config.piAgent?.baseUrl || svc.piAgent.baseUrl;
    const apiKeyFromProvider = providerConfig?.apiKey;

    if (baseUrl) {
      return {
        id: modelId,
        name: modelId,
        api: 'openai-completions' as const,
        provider,
        baseUrl,
        ...(apiKeyFromProvider ? { apiKey: apiKeyFromProvider } : {}),
        reasoning: false,
        input: ['text', 'image'] as const,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 1024,
      };
    }

    const model = getModel(provider, modelId);
    return {
      ...model,
      input: Array.from(new Set([...(model.input || []), 'image'])),
    };
  }

  private async describeImageWithVisionModel(request: VisionDescribeRequest): Promise<string> {
    await loadPiAgentDeps();

    const model = this.getVisionModel(request.modelId);
    if (model.baseUrl) {
      const auth = await this.getApiKeyAndHeaders(model);
      if (!auth?.apiKey) {
        throw new Error(`Vision model provider "${model.provider}" missing API key`);
      }

      const response = await fetch(`${model.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.apiKey}`,
          ...(auth.headers || {}),
        },
        body: JSON.stringify({
          model: model.id,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: request.prompt },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${request.image.mimeType};base64,${request.image.data}`,
                  },
                },
              ],
            },
          ],
          max_tokens: 300,
        }),
        signal: request.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Vision model request failed: ${response.status} ${body}`);
      }

      const payload = await response.json() as {
        choices?: Array<{
          message?: {
            content?: string | Array<{ type?: string; text?: string }>;
          };
        }>;
      };
      const content = payload.choices?.[0]?.message?.content;
      if (typeof content === 'string') {
        return content;
      }
      if (Array.isArray(content)) {
        return content
          .filter((item) => item.type === 'text' && item.text)
          .map((item) => item.text)
          .join('');
      }
      return '';
    }

    const env = new NodeExecutionEnv({ cwd: this.config.workingDir ?? process.cwd() });
    const sessionRepo = new InMemorySessionRepo();
    const session = await sessionRepo.create();
    const harness = new AgentHarness({
      env,
      session,
      tools: [],
      model,
      systemPrompt: '你是图片内容描述助手。只输出图片内容描述，不要寒暄，不要添加 Markdown。',
      getApiKeyAndHeaders: (model: any) => this.getApiKeyAndHeaders(model),
      thinkingLevel: 'off',
    });

    const abort = () => {
      void harness.abort();
    };
    request.signal.addEventListener('abort', abort, { once: true });

    try {
      const result = await harness.prompt(request.prompt, {
        images: [
          {
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: request.image.mimeType,
              data: request.image.data,
            },
          },
        ],
      });

      return result.content
        ?.filter((item: any) => item.type === 'text')
        ?.map((item: any) => item.text)
        ?.join('')
        .trim() || '';
    } finally {
      request.signal.removeEventListener('abort', abort);
      await harness.abort().catch(() => undefined);
      await env.cleanup();
    }
  }

  private recordToolFileChange(toolName: string, input: any, isError: boolean, event: any): void {
    if (isError) return;

    if (toolName === 'writeFile') {
      this.files.push({
        path: input.path,
        action: 'modified',
        content: input.content,
      });
      return;
    }

    if (toolName === 'editFile') {
      this.files.push({
        path: input.path,
        action: 'modified',
      });
      return;
    }

    if (toolName === 'deletePage' || toolName === 'deletePages' || toolName === 'executeDeletePagePlan') {
      const deletedPages = getDeletedPagesFromToolResult(event);
      const changedPaths = new Set<string>();
      for (const page of deletedPages) {
        changedPaths.add(`demos/${page.pageId}/`);
        for (const deletedPath of page.deletedPaths || []) {
          changedPaths.add(deletedPath);
        }
      }
      if (deletedPages.length > 0) {
        changedPaths.add('workspace-tree.json');
      }
      for (const changedPath of changedPaths) {
        this.files.push({
          path: changedPath,
          action: changedPath === 'workspace-tree.json' ? 'modified' : 'deleted',
        });
      }
    }
  }

  private setupToolHooks(harness: any, unsubStore: Array<() => void>): void {
    const unsubToolCall = harness.on("tool_call", (event: any) => {
      const { toolName, input } = event;

      if (['readFile', 'readFileWithLines', 'writeFile', 'editFile', 'listFiles'].includes(toolName)) {
        const targetPath = (input as any).path || (input as any).filePath;
        if (targetPath && !isPathAllowed(targetPath, this.config.workingDir ?? '', this.config.permissions ?? DEFAULT_WORKSPACE_PERMISSIONS)) {
          return { block: true, reason: `Access denied: path "${targetPath}" is not allowed by workspace permissions` };
        }
      }

      if (toolName === 'writeFile' || toolName === 'editFile') {
        const targetPath = (input as any).path;
        if (targetPath && isKnowledgeBasePath(targetPath, this.config.workingDir ?? '')) {
          return { block: true, reason: 'Knowledge base files are user-managed; AI agents may read them but must not modify them.' };
        }
      }

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

      return undefined;
    });
    unsubStore.push(unsubToolCall);

    const unsubToolResult = harness.on("tool_result", (event: any) => {
      const { toolName, input, isError } = event;

      this.recordToolFileChange(toolName, input as any, isError, event);

      if ((toolName === 'readFile' || toolName === 'readFileWithLines') && !isError) {
        const readPath = (input as any).path;
        if (readPath && isKnowledgeBasePath(readPath, this.config.workingDir ?? '')) {
          const basename = path.basename(readPath);
          this.readKnowledgeFiles.add(basename);
        }
      }
      return undefined;
    });
    unsubStore.push(unsubToolResult);
  }

  private buildSubagentSystemPrompt(): string {
    const basePrompt = this.currentSystemPrompt || '# Workbench AI 编码助手';
    return `${basePrompt}

# Subagent Mode

You are a short-lived subagent working for the main agent in the same workspace.
Complete only the delegated task. You may read and edit allowed workspace files, but you must not spawn another subagent.
Keep the final response concise: summarize what you changed, what you verified, and any remaining risks.`;
  }

  /**
   * AgentHarness 的 getApiKeyAndHeaders 回调
   * 参数从 provider: string 改为 model: Model<any>
   * 返回值从 string | undefined 改为 { apiKey, headers? } | undefined
   */
  private async getApiKeyAndHeaders(model: any): Promise<{ apiKey: string; headers?: Record<string, string> } | undefined> {
    const provider = model.provider;

    // 优先级：backendProviders.apiKey > model.apiKey > piAgent.apiKey > env var > serviceConfig
    const providerConfig = this.getProviderConfig(provider);
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
    this.setupToolHooks(this.harness, this.unsubFns);
    return;

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

      if ((toolName === 'deletePage' || toolName === 'deletePages' || toolName === 'executeDeletePagePlan') && !isError) {
        const deletedPages = getDeletedPagesFromToolResult(event);
        const changedPaths = new Set<string>();
        for (const page of deletedPages) {
          changedPaths.add(`demos/${page.pageId}/`);
          for (const deletedPath of page.deletedPaths || []) {
            changedPaths.add(deletedPath);
          }
        }
        if (deletedPages.length > 0) {
          changedPaths.add('workspace-tree.json');
        }
        for (const changedPath of changedPaths) {
          this.files.push({
            path: changedPath,
            action: changedPath === 'workspace-tree.json' ? 'modified' : 'deleted',
          });
        }
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
  private requestPermission(toolCallId: string, request: Parameters<PermissionHandler>[1]): Promise<boolean> {
    const sessionId = this.sessionId ?? this.config.sessionId;

    logger.info({ toolCallId, request }, 'deletePage: requesting permission');

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
            title: request.title,
            kind: 'execute',
            summary: request.summary,
            planId: request.planId,
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

  private async runSubagent(
    params: { task: string; context?: string },
    signal?: AbortSignal,
  ): Promise<SubagentRunResult> {
    if (!this.areSubagentsEnabled()) {
      throw new Error('Subagents are disabled');
    }

    await loadPiAgentDeps();

    const startedAt = Date.now();
    const startFileIndex = this.files.length;
    const timeoutMs = this.getSubagentTimeoutMs();
    const controller = new AbortController();
    const env = new NodeExecutionEnv({ cwd: this.config.workingDir ?? process.cwd() });
    const sessionRepo = new InMemorySessionRepo();
    const session = await sessionRepo.create();
    const unsubs: Array<() => void> = [];
    let harness: any = null;
    let timeoutHit = false;

    const abortSubagent = () => {
      if (!controller.signal.aborted) {
        controller.abort();
      }
      if (harness) {
        void harness.abort();
      }
    };

    if (signal?.aborted) {
      abortSubagent();
    }
    signal?.addEventListener('abort', abortSubagent, { once: true });

    const timeoutId = setTimeout(() => {
      timeoutHit = true;
      abortSubagent();
    }, timeoutMs);
    timeoutId.unref?.();

    try {
      const tools = createWorkbenchTools(
        this.config,
        (toolCallId, pageName) => this.requestPermission(toolCallId, pageName),
        { includeDelegateTask: false },
      );
      const model = this.getModel();

      harness = new AgentHarness({
        env,
        session,
        tools,
        model,
        systemPrompt: () => this.buildSubagentSystemPrompt(),
        getApiKeyAndHeaders: (model: any) => this.getApiKeyAndHeaders(model),
        thinkingLevel: 'off',
      });
      this.activeSubagents.add(harness);
      this.setupToolHooks(harness, unsubs);

      if (controller.signal.aborted) {
        await harness.abort().catch(() => undefined);
        throw new Error(timeoutHit ? 'Subagent timed out' : 'Subagent aborted');
      }

      const prompt = [
        '# Delegated Task',
        params.task,
        params.context ? `\n# Additional Context\n${params.context}` : '',
        '\nReturn a concise summary of what you did, including any files changed.',
      ].filter(Boolean).join('\n\n');

      const abortPromise = new Promise<never>((_, reject) => {
        controller.signal.addEventListener(
          'abort',
          () => reject(new Error(timeoutHit ? 'Subagent timed out' : 'Subagent aborted')),
          { once: true },
        );
      });

      const result = await Promise.race([
        harness.prompt(prompt),
        abortPromise,
      ]);

      const content = result.content
        ?.filter((item: any) => item.type === 'text')
        ?.map((item: any) => item.text)
        ?.join('')
        .trim() || '';
      const files = this.files.slice(startFileIndex);

      return {
        success: true,
        content,
        files: files.length > 0 ? files : undefined,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        content: message,
        files: this.files.slice(startFileIndex),
        durationMs: Date.now() - startedAt,
      };
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abortSubagent);
      for (const unsub of unsubs) {
        unsub();
      }
      if (harness) {
        this.activeSubagents.delete(harness);
        await harness.abort().catch(() => undefined);
      }
      await env.cleanup();
    }
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
        if (!this.imageDescriber.isAvailable()) {
          logger.warn(
            { modelId: model.id, imageCount: images.length },
            'Image sent to non-vision model but image description is not configured',
          );
          throw new Error(
            '当前模型不支持图片处理。请联系管理员配置识图模型以启用图片理解功能。',
          );
        }

        logger.info(
          { imageCount: images.length, modelId: model.id },
          'Triggering image pre-description for non-vision model',
        );

        const imageDescription = await this.imageDescriber.describe(images);
        promptContent = `【图片内容】${imageDescription}\n\n【用户问题】${content}`;
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

    for (const subagent of this.activeSubagents) {
      await subagent.abort().catch(() => undefined);
    }
    this.activeSubagents.clear();

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
    const [provider, ...modelParts] = modelId.split('/');
    const id = modelParts.join('/');
    this.config.piAgent = {
      ...this.config.piAgent,
      provider: provider || this.config.piAgent?.provider,
      model: id || modelId,
    };
    this.selectedModel = {
      provider: provider || this.config.piAgent.provider || '',
      modelId: id || modelId,
    };
    // 使用 harness.setModel() 运行时切换，无需重建
    const model = this.getModel();
    await this.harness.setModel(model);
    logger.info({ modelId }, "Model switched at runtime");
  }

  async getModelInfo(): Promise<{ currentModelId: string | null; availableModels: Array<{ id: string; label: string }>; canSwitch: boolean } | null> {
    const sessionProviders = this.getSessionProvidersConfig();

    // 优先级: 推送的 activeModelId > this.config.piAgent > serviceConfig 默认
    const resolved = this.resolveProviderAndModel();
    const provider = resolved.provider;
    const modelId = resolved.modelId;

    const availableModels: Array<{ id: string; label: string }> = [];
    const seen = new Set<string>();
    const add = (id: string, label: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      availableModels.push({ id, label });
    };

    // 1) 当前激活 provider: 优先使用 backendProviders 中声明的模型列表
    const providerConfig = this.getProviderConfig(provider);
    const providerModels = providerConfig
      ? providerConfig.models.map((model) => ({
          id: `${providerConfig.id}/${model}`,
          label: model,
        }))
      : [];
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
    const allProviders =
      sessionProviders?.providers || getBackendProvidersManager().getConfig().providers;
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

  updateConfig(config: Partial<AgentConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      piAgent: {
        ...this.config.piAgent,
        ...config.piAgent,
      },
    };
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
    for (const subagent of this.activeSubagents) {
      void subagent.abort();
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
    const basePrompt = this.currentSystemPrompt || '# Workbench AI 编码助手\n\n等待 system prompt 注入...';
    const runtimeTools = formatRuntimeToolsForPrompt(context.activeTools || []);
    return runtimeTools ? `${basePrompt}\n\n${runtimeTools}` : basePrompt;
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
