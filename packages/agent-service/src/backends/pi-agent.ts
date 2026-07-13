import { IBackendAdapter, BackendStatus } from "./base";
import {
  AgentConfig,
  AgentEvent,
  FileAttachment,
  FileChange,
  ImageAttachment,
  MutationReceiptEntry,
  ProjectionAckEntry,
  RunSummary,
  UserChoiceResponse,
} from "../core/types";
import { createWorkbenchTools, type SubagentRunResult } from "./pi-tools";
import type { PreinstalledSkill } from "./preinstalled-skills";
import {
  formatPreinstalledSkillsForPrompt,
  getPreinstalledSkills,
} from "./preinstalled-skills";
import {
  ImageDescriber,
  type VisionDescribeRequest,
} from "../services/image-describer";
import { logger } from "../utils/logger";
import {
  getAgentHarness,
  getNodeExecutionEnv,
  getInMemorySessionRepo,
  loadPiAgentDeps,
} from "./managers/pi-agent-deps";
import { ModelManager, getServiceConfig } from "./managers/model-manager";
import { PermissionManager } from "./managers/permission-manager";
import { UserInteractionManager } from "./managers/user-interaction-manager";
import { ToolHookManager } from "./managers/tool-hook-manager";
import { EventMapper } from "./managers/event-mapper";
import {
  extractAssistantErrorMessage,
  extractAssistantText,
  summarizeAssistantMessageShape,
} from "./managers/assistant-text-utils";
import { normalizeImageAttachments } from "../utils/image-attachments";
import { serializeErrorForLog } from "../utils/error-utils";
import { listUploadedFileAttachments } from "../utils/uploaded-file-attachments";
import { resolveLiveWorkspaceMutationContext } from "../workspace/workspace-mutation-authority";

function formatRuntimeToolsForPrompt(
  activeTools: Array<{ name?: string; description?: string }>,
): string {
  if (!activeTools.length) return "";

  const lines = activeTools
    .filter(
      (tool) => typeof tool.name === "string" && tool.name.trim().length > 0,
    )
    .map((tool) => {
      const description =
        typeof tool.description === "string" && tool.description.trim()
          ? `：${tool.description.trim()}`
          : "";
      return `- \`${tool.name}\`${description}`;
    });

  if (!lines.length) return "";

  return [
    "## 当前实际可用工具",
    "",
    "以下列表由运行时 activeTools 自动注入，代表你本轮真正可以调用的工具；如果这里列出了 `delegateTask`，你就可以使用子 Agent。",
    "",
    ...lines,
  ].join("\n");
}

function formatUploadedFilesForPrompt(
  files?: FileAttachment[],
  currentFileIds = new Set<string>(),
): string {
  if (!files || files.length === 0) return "";

  const lines = files.map((file, index) => {
    const status = file.textExtracted ? "可读取" : "未提取到文本";
    const source = currentFileIds.has(file.id)
      ? "本轮上传"
      : "当前会话历史附件";
    const preview = file.textPreview
      ? `\n  预览：${file.textPreview.replace(/\s+/g, " ").slice(0, 240)}`
      : "";
    return [
      `${index + 1}. ${file.name}`,
      `  attachmentId: ${file.id}`,
      `  来源: ${source}`,
      `  MIME: ${file.mimeType || "unknown"}`,
      `  大小: ${file.size} bytes`,
      `  文本状态: ${status}`,
      file.lineCount ? `  行数: ${file.lineCount}` : "",
      file.truncated ? "  注意：提取文本已截断" : "",
      preview,
    ]
      .filter(Boolean)
      .join("\n");
  });

  return [
    "【上传文件】",
    "当前会话已有以下只读文件附件（包含本轮和之前消息上传的文件）。需要查看文件内容时，必须调用 `readUploadedFile`，传入对应 attachmentId；不要使用文件名猜 attachmentId，也不要猜测未读取的文件内容。这些附件不是项目素材，也不在 workspace 中。",
    "",
    ...lines,
    "",
    "【用户问题】",
  ].join("\n");
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
  private timeout?: number;
  private sessionId: string | null = null;
  private currentSystemPrompt: string = "";
  private unsubFns: Array<() => void> = [];
  private imageDescriber: ImageDescriber;
  private activeSubagents: Set<any> = new Set();
  private lastResponseDebug: unknown;
  private lastRunSummary: RunSummary | null = null;

  // 管理器
  private modelManager: ModelManager;
  private permissionManager: PermissionManager;
  private userInteractionManager: UserInteractionManager;
  private toolHookManager: ToolHookManager;
  private eventMapper: EventMapper;

  constructor(config: AgentConfig) {
    this.config = config;
    this.modelManager = new ModelManager(this.config);
    this.permissionManager = new PermissionManager(this.config);
    this.userInteractionManager = new UserInteractionManager(this.config);
    this.toolHookManager = new ToolHookManager(this.config);
    this.eventMapper = new EventMapper(
      this.config.sessionId,
      undefined,
      this.toolHookManager,
    );
    this.imageDescriber = new ImageDescriber({}, (request) =>
      this.describeImageWithVisionModel(request),
    );
  }

  private areSubagentsEnabled(): boolean {
    const configured = this.config.piAgent?.subagentsEnabled;
    return configured ?? getServiceConfig().piAgent.subagentsEnabled;
  }

  private getSubagentTimeoutMs(): number {
    return (
      this.config.piAgent?.subagentTimeout ??
      getServiceConfig().piAgent.subagentTimeout
    );
  }

  private syncEventCallback(): void {
    this.eventMapper.setEventCallback(this.eventCallback);
    this.permissionManager.setEventCallback(this.eventCallback);
    this.userInteractionManager.setEventCallback(this.eventCallback);
    this.toolHookManager.setEventCallback(this.eventCallback);
  }

  async initialize(): Promise<void> {
    if (this.status === "ready" || this.status === "initializing") {
      return;
    }

    this.status = "initializing";
    logger.info("Initializing Pi Agent backend (AgentHarness)");

    try {
      await loadPiAgentDeps();

      const NodeExecutionEnvCtor = getNodeExecutionEnv();
      const InMemorySessionRepoCtor = getInMemorySessionRepo();
      const AgentHarnessCtor = getAgentHarness();

      // 1. 创建 ExecutionEnv
      this.env = new NodeExecutionEnvCtor({
        cwd: this.config.workingDir ?? process.cwd(),
      });

      // 2. 创建 Session
      this.sessionRepo = new InMemorySessionRepoCtor();
      this.session = await this.sessionRepo.create();

      // 3. 创建工具（传入 deletePage 权限确认回调 + 计划审批回调 + 子 Agent runner）
      const tools = createWorkbenchTools(
        this.config,
        this.permissionManager.requestPermission,
        {
          mode: this.config.toolMode,
          includeDelegateTask: this.areSubagentsEnabled(),
          subagentRunner: (params, signal) => this.runSubagent(params, signal),
          planApprovalHandler: this.permissionManager.requestPlanApproval,
          userChoiceHandler: this.userInteractionManager.requestUserChoice,
        },
      );

      // 4. 获取模型
      const model = this.modelManager.getModel();
      const resources = { skills: getPreinstalledSkills() };

      logger.info(
        { modelId: model.id, provider: model.provider, baseUrl: model.baseUrl },
        "Pi Agent model configured",
      );

      // 5. 创建 AgentHarness
      this.harness = new AgentHarnessCtor({
        env: this.env,
        session: this.session,
        tools,
        resources,
        model,
        systemPrompt: (context: any) => this.buildSystemPrompt(context),
        getApiKeyAndHeaders: (model: any) =>
          this.modelManager.getApiKeyAndHeaders(model),
        thinkingLevel: "off",
      });

      // 6. 注册 Hook 事件（工具调用拦截 + 工具结果处理）
      this.setupHooks();

      // 7. 注册观察事件（AgentHarness 事件 → 应用层 AgentEvent）
      this.setupEventMapping();

      this.status = "ready";
      logger.info("Pi Agent backend (AgentHarness) initialized");
    } catch (error) {
      this.status = "error";
      logger.error({ error }, "Failed to initialize Pi Agent backend");
      throw error;
    }
  }

  private async describeImageWithVisionModel(
    request: VisionDescribeRequest,
  ): Promise<string> {
    await loadPiAgentDeps();

    const model = this.modelManager.getVisionModel(request.modelId);
    if (model.baseUrl) {
      const auth = await this.modelManager.getApiKeyAndHeaders(model);
      if (!auth?.apiKey) {
        throw new Error(
          `Vision model provider "${model.provider}" missing API key`,
        );
      }

      const response = await fetch(
        `${model.baseUrl.replace(/\/$/, "")}/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${auth.apiKey}`,
            ...(auth.headers || {}),
          },
          body: JSON.stringify({
            model: model.id,
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: request.prompt },
                  {
                    type: "image_url",
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
        },
      );

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `Vision model request failed: ${response.status} ${body}`,
        );
      }

      const payload = (await response.json()) as {
        choices?: Array<{
          message?: {
            content?: string | Array<{ type?: string; text?: string }>;
          };
        }>;
      };
      const content = payload.choices?.[0]?.message?.content;
      if (typeof content === "string") {
        return content;
      }
      if (Array.isArray(content)) {
        return content
          .filter((item) => item.type === "text" && item.text)
          .map((item) => item.text)
          .join("");
      }
      return "";
    }

    const NodeExecutionEnvCtor = getNodeExecutionEnv();
    const InMemorySessionRepoCtor = getInMemorySessionRepo();
    const AgentHarnessCtor = getAgentHarness();

    const env = new NodeExecutionEnvCtor({
      cwd: this.config.workingDir ?? process.cwd(),
    });
    const sessionRepo = new InMemorySessionRepoCtor();
    const session = await sessionRepo.create();
    const harness = new AgentHarnessCtor({
      env,
      session,
      tools: [],
      model,
      systemPrompt:
        "你是图片内容描述助手。只输出图片内容描述，不要寒暄，不要添加 Markdown。",
      getApiKeyAndHeaders: (model: any) =>
        this.modelManager.getApiKeyAndHeaders(model),
      thinkingLevel: "off",
    });

    const abort = () => {
      void harness.abort();
    };
    request.signal.addEventListener("abort", abort, { once: true });

    try {
      const result = await harness.prompt(request.prompt, {
        images: [
          {
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: request.image.mimeType,
              data: request.image.data,
            },
          },
        ],
      });

      const text = extractAssistantText(result);
      if (!text) {
        logger.warn(
          summarizeAssistantMessageShape(result),
          "Vision model AgentHarness response did not contain extractable text",
        );
      }
      return text;
    } finally {
      request.signal.removeEventListener("abort", abort);
      await harness.abort().catch(() => undefined);
      await env.cleanup();
    }
  }

  private setupHooks(): void {
    // tool_call hook：权限校验（委托 PermissionManager）
    const unsubToolCall = this.harness.on("tool_call", (event: any) => {
      const { toolName, input } = event;
      return this.permissionManager.validateToolCall(toolName, input as any);
    });
    this.unsubFns.push(unsubToolCall);

    // tool_result hook：文件变更摘要捕获、知识库读取追踪
    const unsubToolResult = this.harness.on("tool_result", (event: any) => {
      const { toolName, input, isError } = event;
      const sessionId = this.sessionId ?? this.config.sessionId;
      this.toolHookManager.handleToolResult(
        toolName,
        input as any,
        isError,
        event,
        sessionId,
      );
      return undefined;
    });
    this.unsubFns.push(unsubToolResult);
  }

  /**
   * 事件映射：将 AgentHarness 事件映射为应用层 AgentEvent（委托 EventMapper）
   */
  private setupEventMapping(): void {
    const sessionId = this.sessionId ?? this.config.sessionId;
    this.eventMapper.setSessionId(sessionId);
    this.eventMapper.setEventCallback(this.eventCallback);
    const unsub = this.eventMapper.register(this.harness);
    this.unsubFns.push(unsub);
  }

  private buildSubagentSystemPrompt(context?: {
    resources?: { skills?: PreinstalledSkill[] };
  }): string {
    const basePrompt = this.currentSystemPrompt || "# Workbench AI 编码助手";
    const preinstalledSkills = formatPreinstalledSkillsForPrompt(
      context?.resources?.skills || [],
    );
    return [
      basePrompt,
      preinstalledSkills,
      `# Subagent Mode

You are a short-lived subagent working for the main agent in the same workspace.
Complete only the delegated task. You may read and edit allowed workspace files, but you must not spawn another subagent.
Keep the final response concise: summarize what you changed, what you verified, and any remaining risks.`,
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  private async runSubagent(
    params: { task: string; context?: string },
    signal?: AbortSignal,
  ): Promise<SubagentRunResult> {
    if (!this.areSubagentsEnabled()) {
      throw new Error("Subagents are disabled");
    }

    await loadPiAgentDeps();

    const NodeExecutionEnvCtor = getNodeExecutionEnv();
    const InMemorySessionRepoCtor = getInMemorySessionRepo();
    const AgentHarnessCtor = getAgentHarness();

    const startedAt = Date.now();
    const timeoutMs = this.getSubagentTimeoutMs();
    const subagentFiles: FileChange[] = [];
    const controller = new AbortController();
    const env = new NodeExecutionEnvCtor({
      cwd: this.config.workingDir ?? process.cwd(),
    });
    const sessionRepo = new InMemorySessionRepoCtor();
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
    signal?.addEventListener("abort", abortSubagent, { once: true });

    const timeoutId = setTimeout(() => {
      timeoutHit = true;
      abortSubagent();
    }, timeoutMs);
    timeoutId.unref?.();

    try {
      const tools = createWorkbenchTools(
        this.config,
        this.permissionManager.requestPermission,
        {
          includeDelegateTask: false,
          includePlanApproval: false,
          includeUserChoice: false,
        },
      );
      const model = this.modelManager.getModel();
      const resources = { skills: getPreinstalledSkills() };

      harness = new AgentHarnessCtor({
        env,
        session,
        tools,
        resources,
        model,
        systemPrompt: (context: {
          resources?: { skills?: PreinstalledSkill[] };
        }) => this.buildSubagentSystemPrompt(context),
        getApiKeyAndHeaders: (model: any) =>
          this.modelManager.getApiKeyAndHeaders(model),
        thinkingLevel: "off",
      });
      this.activeSubagents.add(harness);

      // 子 Agent 的工具钩子：权限校验 + 文件变更捕获
      const unsubToolCall = harness.on("tool_call", (event: any) => {
        const { toolName, input } = event;
        return this.permissionManager.validateToolCall(toolName, input as any);
      });
      unsubs.push(unsubToolCall);

      const unsubToolResult = harness.on("tool_result", (event: any) => {
        const { toolName, input, isError } = event;
        const sessionId = this.sessionId ?? this.config.sessionId;
        this.toolHookManager.handleToolResult(
          toolName,
          input as any,
          isError,
          event,
          sessionId,
          {
            onFileChanges: (changes) => {
              for (const change of changes) {
                const duplicate = subagentFiles.some(
                  (item) =>
                    item.path === change.path &&
                    item.action === change.action &&
                    item.content === change.content,
                );
                if (!duplicate) subagentFiles.push(change);
              }
            },
          },
        );
        return undefined;
      });
      unsubs.push(unsubToolResult);

      if (controller.signal.aborted) {
        await harness.abort().catch(() => undefined);
        throw new Error(timeoutHit ? "Subagent timed out" : "Subagent aborted");
      }

      const prompt = [
        "# Delegated Task",
        params.task,
        params.context ? `\n# Additional Context\n${params.context}` : "",
        "\nReturn a concise summary of what you did, including any files changed.",
      ]
        .filter(Boolean)
        .join("\n\n");

      const abortPromise = new Promise<never>((_, reject) => {
        controller.signal.addEventListener(
          "abort",
          () =>
            reject(
              new Error(timeoutHit ? "Subagent timed out" : "Subagent aborted"),
            ),
          { once: true },
        );
      });

      const result = await Promise.race([harness.prompt(prompt), abortPromise]);

      const errorMessage = extractAssistantErrorMessage(result);
      const content = extractAssistantText(result);
      if (errorMessage) {
        logger.warn(
          summarizeAssistantMessageShape(result),
          "Subagent response contained an error message",
        );
        return {
          success: false,
          content: errorMessage,
          files: subagentFiles.length > 0 ? subagentFiles : undefined,
          durationMs: Date.now() - startedAt,
        };
      }
      if (!content) {
        logger.warn(
          summarizeAssistantMessageShape(result),
          "Subagent response did not contain extractable text",
        );
      }

      return {
        success: true,
        content,
        files: subagentFiles.length > 0 ? subagentFiles : undefined,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        content: message,
        files: subagentFiles,
        durationMs: Date.now() - startedAt,
      };
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", abortSubagent);
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

  async sendMessage(
    content: string,
    options?: {
      stream?: boolean;
      images?: ImageAttachment[];
      files?: FileAttachment[];
    },
  ): Promise<string> {
    if (!this.harness) throw new Error("Agent not initialized");
    this.status = "busy";
    this.toolHookManager.resetForNewMessage();

    const images = normalizeImageAttachments(options?.images);
    const model = this.modelManager.getModel();
    const modelSupportsImages =
      Array.isArray(model?.input) && model.input.includes("image");

    const currentFiles = options?.files || [];
    const currentFileIds = new Set(currentFiles.map((file) => file.id));
    let sessionFiles: FileAttachment[] = [];
    if (this.config.sessionId) {
      try {
        sessionFiles = await listUploadedFileAttachments(this.config.sessionId);
      } catch (error) {
        logger.warn(
          {
            error: serializeErrorForLog(error),
            sessionId: this.config.sessionId,
          },
          "Failed to list uploaded file attachments for prompt context",
        );
      }
    }
    const uploadedFiles = [
      ...currentFiles,
      ...sessionFiles.filter((file) => !currentFileIds.has(file.id)),
    ];
    const uploadedFilesPrefix = formatUploadedFilesForPrompt(
      uploadedFiles,
      currentFileIds,
    );
    let promptContent = uploadedFilesPrefix
      ? `${uploadedFilesPrefix}${content}`
      : content;
    let imageContent: any[] | undefined;

    if (images && images.length > 0) {
      if (modelSupportsImages) {
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
            "Image sent to non-vision model but image description is not configured",
          );
          throw new Error(
            "当前模型不支持图片处理。请联系管理员配置识图模型以启用图片理解功能。",
          );
        }

        logger.info(
          { imageCount: images.length, modelId: model.id },
          "Triggering image pre-description for non-vision model",
        );

        const imageDescription = await this.imageDescriber.describe(images);
        promptContent = uploadedFilesPrefix
          ? `【图片内容】${imageDescription}\n\n${uploadedFilesPrefix}${content}`
          : `【图片内容】${imageDescription}\n\n【用户问题】${content}`;
      }
    }

    logger.info(
      {
        contentLength: promptContent.length,
        imageCount: images?.length || 0,
        fileCount: currentFiles.length,
        sessionFileCount: uploadedFiles.length,
        modelSupportsImages,
      },
      "Pi Agent sending message",
    );

    try {
      const result = await this.harness.prompt(promptContent, {
        images: imageContent,
      });
      this.status = "ready";
      this.lastResponseDebug = summarizeAssistantMessageShape(result);

      const runSummary = await this.buildRunSummary();
      this.lastRunSummary = runSummary;
      if (runSummary && this.eventCallback) {
        this.eventCallback({
          type: "run_summary",
          sessionId: this.sessionId ?? this.config.sessionId,
          runSummary,
        });
      }

      const errorMessage = extractAssistantErrorMessage(result);
      if (errorMessage) {
        logger.warn(
          summarizeAssistantMessageShape(result),
          "Pi Agent response contained an error message",
        );
        throw new Error(errorMessage);
      }

      const text = extractAssistantText(result);
      if (!text) {
        logger.warn(
          summarizeAssistantMessageShape(result),
          "Pi Agent response did not contain extractable text",
        );
        const files = this.toolHookManager.getFiles();
        if (files.length > 0) {
          return `已完成，修改了 ${files.length} 个文件。`;
        }
        throw new Error(
          "模型返回了空内容，且没有产生工具结果或文件变更。请检查模型配置或后端运行日志。",
        );
      }

      logger.info({ resultLength: text.length }, "Pi Agent response extracted");
      return text;
    } catch (error) {
      this.status = "error";
      logger.error(
        {
          errorInfo: serializeErrorForLog(error),
          responseDebug: this.lastResponseDebug,
        },
        "Failed to send message",
      );
      throw error;
    }
  }

  onStream(callback: (event: AgentEvent) => void): void {
    this.eventCallback = callback;
    this.syncEventCallback();
  }

  getLastResponseDebug(): unknown {
    return this.lastResponseDebug;
  }

  getLastRunSummary(): RunSummary | null {
    return this.lastRunSummary;
  }

  async getStatus(): Promise<BackendStatus> {
    return this.status;
  }

  async destroy(): Promise<void> {
    for (const unsub of this.unsubFns) {
      unsub();
    }
    this.unsubFns = [];

    if (this.harness) {
      await this.harness.abort();
      this.harness = null;
    }

    for (const subagent of this.activeSubagents) {
      await subagent.abort().catch(() => undefined);
    }
    this.activeSubagents.clear();

    if (this.env) {
      await this.env.cleanup();
      this.env = null;
    }

    this.session = null;
    this.sessionRepo = null;
    this.toolHookManager.resetForNewMessage();
    this.permissionManager.clearPendingPermissions();
    this.userInteractionManager.clearPendingChoices();
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
    this.modelManager.applyModelSwitch(modelId);
    const model = this.modelManager.getModel();
    await this.harness.setModel(model);
    logger.info({ modelId }, "Model switched at runtime");
  }

  async getModelInfo(): Promise<{
    currentModelId: string | null;
    availableModels: Array<{ id: string; label: string }>;
    canSwitch: boolean;
  } | null> {
    return this.modelManager.getModelInfo();
  }

  getCurrentSessionId(): string | null {
    return this.sessionId;
  }

  getFiles(): Array<{
    path: string;
    action: "created" | "modified" | "deleted";
    content?: string;
  }> {
    return this.toolHookManager.getFiles();
  }

  updateConfig(config: Partial<AgentConfig>): void {
    this.modelManager.updateConfig(config);
    if (config.workingDir !== undefined) {
      this.config.workingDir = config.workingDir;
    }
    if (config.permissions !== undefined) {
      this.config.permissions = config.permissions;
    }
  }

  setPromptTimeout(seconds: number): void {
    this.timeout = seconds * 1000;
    logger.debug({ timeout: this.timeout }, "Pi Agent prompt timeout set");
  }

  cancelPrompt(): void {
    if (this.harness) {
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
  resolvePermission(
    toolCallId: string,
    approved: boolean,
    responseContent?: string,
  ): void {
    this.permissionManager.resolvePermission(
      toolCallId,
      approved,
      responseContent,
    );
  }

  resolveUserChoice(requestId: string, choice: UserChoiceResponse): void {
    this.userInteractionManager.resolveUserChoice(requestId, choice);
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
    resources: { skills?: PreinstalledSkill[] };
  }): string {
    const basePrompt =
      this.currentSystemPrompt ||
      "# Workbench AI 编码助手\n\n等待 system prompt 注入...";
    const runtimeTools = formatRuntimeToolsForPrompt(context.activeTools || []);
    const preinstalledSkills = formatPreinstalledSkillsForPrompt(
      context.resources?.skills || [],
    );
    return [basePrompt, runtimeTools, preinstalledSkills]
      .filter(Boolean)
      .join("\n\n");
  }

  async updateSystemPrompt(newPrompt: string): Promise<void> {
    this.currentSystemPrompt = newPrompt;
    logger.info({ promptLength: newPrompt.length }, "System prompt updated");
  }

  private async buildRunSummary(): Promise<RunSummary | null> {
    const receipts = this.toolHookManager.getMutationReceipts();
    if (receipts.length === 0) return null;

    const mutations: MutationReceiptEntry[] = receipts;
    const projections: ProjectionAckEntry[] = [];

    if (this.config.workingDir) {
      const liveWorkspace = resolveLiveWorkspaceMutationContext(
        this.config.workingDir,
      );
      if (liveWorkspace) {
        try {
          const minRevision = Math.min(
            ...receipts.map((receipt) => receipt.revision),
          );
          const acks = await liveWorkspace.authority.getProjectionAcks(
            liveWorkspace.projectId,
            liveWorkspace.workspaceId,
            minRevision - 1,
          );
          for (const ack of acks) {
            projections.push({
              revision: ack.revision,
              surface: ack.surface,
              status: ack.status === "applied" ? "applied" : "failed",
            });
          }
        } catch (error) {
          logger.warn(
            { error },
            "Failed to query projection acks for run summary",
          );
        }
      }
    }

    return { mutations, projections };
  }
}
