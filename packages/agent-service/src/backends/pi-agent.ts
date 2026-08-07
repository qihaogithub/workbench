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
import { stripExpiredImageParts } from "../utils/image-context-strip";
import type { PreinstalledSkill } from "./preinstalled-skills";
import {
  formatPreinstalledSkillsForPrompt,
  getPreinstalledSkills,
} from "./preinstalled-skills";
import {
  ImageDescriber,
  type ImageDescriberConfig,
  type VisionDescribeRequest,
} from "../services/image-describer";
import { setImageAltDescriber } from "../services/image-alt-generator";

let _imageDescriberConfigUpdater: ((config: Partial<ImageDescriberConfig>) => void) | null = null;
let _latestImageDescriberConfig: Partial<ImageDescriberConfig> = {};

export function updateImageDescriberConfig(config: Partial<ImageDescriberConfig>): void {
  _latestImageDescriberConfig = { ..._latestImageDescriberConfig, ...config };
  _imageDescriberConfigUpdater?.(config);
}

export function getImageDescriberConfig(): ImageDescriberConfig | null {
  return _imageDescriberConfigUpdater
    ? _currentImageDescriberConfig
    : null;
}

let _currentImageDescriberConfig: ImageDescriberConfig | null = null;
import { logger } from "../utils/logger";
import { withLlmRetry } from "../utils/retry-utils";
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
import {
  listUploadedFileAttachments,
  type StoredUploadedFileAttachment,
} from "../utils/uploaded-file-attachments";
import { resolveLiveWorkspaceMutationContext } from "../workspace/workspace-mutation-authority";
import { loadConfig } from "../utils/config";
import {
  readGlobalImageById,
  uploadToGlobalImageStore,
} from "./pi-tools/global-image-store";
import {
  addProjectImageManifestEntry,
  resolveProjectImageManifestProjectId,
  type ProjectImageEntry,
} from "./pi-tools/project-image-manifest";

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

function resolveUrlPathname(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.pathname;
    }
  } catch {
    // not a valid absolute URL — treat as relative path
  }
  return url;
}

const MAX_HISTORICAL_FILES_FOR_PROMPT = 20;

export function formatUploadedFilesForPrompt(
  files?: FileAttachment[],
  currentFileIds = new Set<string>(),
): string {
  if (!files || files.length === 0) return "";

  const current: FileAttachment[] = [];
  const historical: FileAttachment[] = [];
  for (const file of files) {
    if (currentFileIds.has(file.id)) current.push(file);
    else historical.push(file);
  }

  // 历史附件按内容去重（sha256 优先，退化为 name+size）
  const seen = new Set<string>();
  const dedupedHistorical: FileAttachment[] = [];
  for (const file of historical) {
    const stored = file as StoredUploadedFileAttachment;
    const key = stored.sha256
      ? `sha:${stored.sha256}`
      : `${file.name}:${file.size}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedupedHistorical.push(file);
  }

  const renderFile = (file: FileAttachment, source: string, index: number) => {
    const status = file.textExtracted ? "可读取" : "未提取到文本";
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
  };

  const sections: string[] = [];
  if (current.length > 0) {
    sections.push(
      "【本轮上传】",
      ...current.map((file, index) => renderFile(file, "本轮上传", index)),
    );
  }

  if (dedupedHistorical.length > 0) {
    const capped = dedupedHistorical.slice(0, MAX_HISTORICAL_FILES_FOR_PROMPT);
    sections.push(
      "【历史附件】",
      "以下为项目之前上传的历史附件（已按内容去重，仅作引用参考，不是本轮用户发送的内容）。",
      ...capped.map((file, index) => renderFile(file, "历史附件", index)),
    );
    if (dedupedHistorical.length > MAX_HISTORICAL_FILES_FOR_PROMPT) {
      sections.push(
        `（另有 ${dedupedHistorical.length - MAX_HISTORICAL_FILES_FOR_PROMPT} 个历史附件未展示，需要时可通过 readUploadedFile 读取）`,
      );
    }
  }

  return [
    "【上传文件】",
    "当前项目存在以下只读文件附件。需要查看文件内容时，必须调用 `readUploadedFile`，传入对应 attachmentId；不要使用文件名猜 attachmentId，也不要猜测未读取的文件内容。这些附件不是项目素材，也不在 workspace 中。",
    "当用户问「我发了什么 / 复述一遍 / 本轮上传了什么」时，以【本轮上传】为准作答；【历史附件】是之前轮次上传的引用参考。",
    "",
    ...sections,
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
    if (Object.keys(_latestImageDescriberConfig).length > 0) {
      this.imageDescriber.updateConfig(_latestImageDescriberConfig);
    }
    _imageDescriberConfigUpdater = (config) => {
      this.imageDescriber.updateConfig(config);
      _currentImageDescriberConfig = this.imageDescriber.getConfig();
    };
    _currentImageDescriberConfig = this.imageDescriber.getConfig();

    setImageAltDescriber(async (image) => {
      const desc = await this.imageDescriber.describe([image]);
      return desc || null;
    });
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

      // 3. 获取模型
      const model = this.modelManager.getModel();
      const resources = { skills: getPreinstalledSkills() };

      logger.info(
        { modelId: model.id, provider: model.provider, baseUrl: model.baseUrl },
        "Pi Agent model configured",
      );

      // 4. 创建工具（传入 deletePage 权限确认回调 + 计划审批回调 + 子 Agent runner）

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

    const visionModelId = request.modelId.trim()
      ? request.modelId
      : this.modelManager.getModel().id;

    const model = this.modelManager.getVisionModel(visionModelId);
    if (model.baseUrl) {
      const auth = await this.modelManager.getApiKeyAndHeaders(model);
      if (!auth?.apiKey) {
        throw new Error(
          `Vision model provider "${model.provider}" missing API key`,
        );
      }

      const response = await withLlmRetry(
        async () => {
          const res = await fetch(
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

          if (!res.ok) {
            const body = await res.text().catch(() => "");
            throw Object.assign(
              new Error(`Vision model request failed: ${res.status} ${body}`),
              { status: res.status },
            );
          }

          return res;
        },
        {},
        (error, meta) => {
          if (request.signal.aborted) throw error;
          logger.warn(
            {
              attempt: meta.attempt + 1,
              maxRetries: meta.maxRetries,
              waitMs: meta.waitMs,
              error: error instanceof Error ? error.message : String(error),
            },
            "Vision model API error, retrying after backoff",
          );
        },
      );

      const payload = (await response.json()) as {
        choices?: Array<{
          message?: {
            content?: string | Array<{ type?: string; text?: string }>;
            reasoning?: string;
          };
        }>;
      };
      const msg = payload.choices?.[0]?.message;
      const content = msg?.content;
      if (typeof content === "string" && content) {
        return content;
      }
      if (Array.isArray(content)) {
        return content
          .filter((item) => item.type === "text" && item.text)
          .map((item) => item.text)
          .join("");
      }
      if (msg?.reasoning) {
        return msg.reasoning;
      }
      logger.warn(
        { modelId: model.id, samplePayload: JSON.stringify(msg).slice(0, 500) },
        "Vision model response content type unexpected",
      );
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
            data: request.image.data,
            mimeType: request.image.mimeType,
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

    const unsubContext = this.harness.on("context", (event: any) => ({
      messages: stripExpiredImageParts(event.messages),
    }));
    this.unsubFns.push(unsubContext);
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
    params: { task: string; context?: string; model?: "inherit" | "vision"; imageUrls?: string[] },
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
      let model: any;
      let imageParts: any[] | undefined;

      if (params.model === "vision") {
        const visionModelId = this.imageDescriber.getConfig().visionModelId;
        if (!visionModelId) {
          return {
            success: false,
            content: "识图模型未配置，请在管理后台设置识图模型",
            durationMs: Date.now() - startedAt,
          };
        }
        model = this.modelManager.getVisionModel(visionModelId);

        if (params.imageUrls && params.imageUrls.length > 0) {
          imageParts = [];
          const screenshotServiceUrl = loadConfig().screenshotServiceUrl.replace(/\/+$/, "");
          for (const url of params.imageUrls) {
            try {
              let buffer: Buffer;
              let mimeType: string;

              const urlPath = resolveUrlPathname(url);

              // /api/images/... → read from local global store (no HTTP)
              const imageMatch = urlPath.match(/^\/api\/images\/(.+)$/);
              if (imageMatch) {
                const result = readGlobalImageById(imageMatch[1]);
                if (!result.success) {
                  return {
                    success: false,
                    content: `下载图片失败: ${url} (${result.error})`,
                    durationMs: Date.now() - startedAt,
                  };
                }
                buffer = Buffer.from(result.data, "base64");
                mimeType = result.mimeType;
              } else {
                // /api/screenshots/file/... → resolve via screenshotServiceUrl
                const screenshotMatch = urlPath.startsWith("/api/screenshots/file/");
                const resolvedUrl = screenshotMatch
                  ? `${screenshotServiceUrl}${urlPath}`
                  : url;

                const fetchRes = await fetch(resolvedUrl, {
                  signal: controller.signal,
                });
                if (!fetchRes.ok) {
                  return {
                    success: false,
                    content: `下载图片失败: ${url} (HTTP ${fetchRes.status})`,
                    durationMs: Date.now() - startedAt,
                  };
                }
                buffer = Buffer.from(await fetchRes.arrayBuffer());
                mimeType =
                  fetchRes.headers.get("content-type") || "image/png";
              }

              imageParts.push({
                type: "image" as const,
                data: buffer.toString("base64"),
                mimeType: mimeType,
              });
            } catch (e) {
              const message =
                e instanceof Error ? e.message : "Unknown error";
              return {
                success: false,
                content: `下载图片失败: ${url} (${message})`,
                durationMs: Date.now() - startedAt,
              };
            }
          }
        }
      } else {
        model = this.modelManager.getModel();
      }

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

      const result = await withLlmRetry(
        () => Promise.race([harness.prompt(prompt, { images: imageParts }), abortPromise]),
        {},
        (error, meta) => {
          if (controller.signal.aborted) throw error;
          logger.warn(
            {
              attempt: meta.attempt + 1,
              maxRetries: meta.maxRetries,
              waitMs: meta.waitMs,
              error: error instanceof Error ? error.message : String(error),
            },
            "Subagent LLM API error, retrying after backoff",
          );
        },
      );

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
    if (this.config.projectId) {
      try {
        sessionFiles = await listUploadedFileAttachments(this.config.projectId);
      } catch (error) {
        logger.warn(
          {
            error: serializeErrorForLog(error),
            projectId: this.config.projectId,
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

    let autoPersistText = "";

    if (images && images.length > 0) {
      try {
        const projectId = resolveProjectImageManifestProjectId(this.config);
        const persisted: Array<{ imageId: string; url: string }> = [];
        const failedNames: string[] = [];

        for (let i = 0; i < images.length; i++) {
          const img = images[i];
          try {
            const buffer = Buffer.from(img.data, "base64");
            const ext = img.mimeType.replace("image/", "") === "jpeg" ? "jpg" : img.mimeType.replace("image/", "");
            const uploadResult = uploadToGlobalImageStore({
              buffer,
              filename: `image_${Date.now()}_${i}.${ext}`,
              sourceType: "user_upload",
              projectId: projectId ?? undefined,
              createdBy: "ai-agent",
            });

            if (uploadResult.success) {
              persisted.push({ imageId: uploadResult.imageId, url: uploadResult.url });

              if (projectId) {
                try {
                  const entry: ProjectImageEntry = {
                    id: uploadResult.sha256.slice(0, 12),
                    filename: uploadResult.filename,
                    url: uploadResult.url,
                    size: uploadResult.sizeBytes,
                    format: ext,
                    createdAt: Date.now(),
                    createdBy: "ai",
                    width: uploadResult.width,
                    height: uploadResult.height,
                    contentHash: uploadResult.sha256,
                    mimeType: uploadResult.mimeType,
                    sourceType: "upload",
                  };
                  addProjectImageManifestEntry(projectId, entry);
                } catch (manifestError) {
                  logger.warn({ projectId, error: manifestError }, "auto-persist: failed to update project image manifest");
                }
              }
            } else {
              logger.warn({ error: uploadResult.error, index: i }, "auto-persist: failed to save image to global store");
              failedNames.push(img.name || `#${i}`);
            }
          } catch (imgError) {
            logger.warn({ error: imgError, index: i }, "auto-persist: exception while persisting image");
            failedNames.push(img.name || `#${i}`);
          }
        }

        if (persisted.length > 0) {
          const lines = persisted.map((img) => `- imageId: ${img.imageId}, URL: ${img.url}`).join("\n");
          const hint = modelSupportsImages
            ? "需要重新查看图片内容时可调用 readUserImage 传入 imageId。\n"
            : "";
          autoPersistText = `[图片已自动入库] 用户上传的图片已自动保存到图床，无需调用 saveImage 再次保存。直接在代码中使用以下 URL 引用即可：\n${hint}\n${lines}\n\n`;
        }
        if (failedNames.length > 0) {
          const failedLines = failedNames.map((n) => `[图片 ${n} 未能自动入库]`).join("\n");
          autoPersistText = autoPersistText ? autoPersistText + failedLines + "\n\n" : failedLines + "\n\n";
        }
      } catch (persistError) {
        logger.warn({ error: persistError }, "auto-persist: overall process failed");
      }

      if (modelSupportsImages) {
        imageContent = images.map((img) => ({
          type: "image" as const,
          data: img.data,
          mimeType: img.mimeType,
        }));
        if (autoPersistText) {
          promptContent = promptContent + "\n" + autoPersistText;
        }
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
        const prefix = uploadedFilesPrefix
          ? `${uploadedFilesPrefix}${content}`
          : `【用户问题】${content}`;
        promptContent = `【图片内容】${imageDescription}\n\n${prefix}`;
        if (autoPersistText) {
          promptContent = promptContent + "\n\n" + autoPersistText;
        }
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

  async appendHistoryMessage(role: string, content: string): Promise<void> {
    if (!this.harness) throw new Error("Agent not initialized");
    await this.harness.appendMessage({
      role: role as "user" | "assistant",
      content: [{ type: "text", text: content }],
      timestamp: Date.now(),
    } as any);
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
    if (config.referencedProjects !== undefined) {
      this.config.referencedProjects = config.referencedProjects;
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
    const toolNames = (context.activeTools || [])
      .map((t: any) => t.name)
      .filter((n: unknown): n is string => typeof n === 'string');
    const preinstalledSkills = formatPreinstalledSkillsForPrompt(
      context.resources?.skills || [],
      toolNames,
    );
    const referenceGuidance = this.buildReferenceGuidance();
    return [basePrompt, referenceGuidance, runtimeTools, preinstalledSkills]
      .filter(Boolean)
      .join("\n\n");
  }

  /**
   * P0：引用自动注入指引。当用户引用了跨项目时，提示主 AI 通过
   * knowledgeReport 发现内容、readKnowledgeSource 读取原文，避免误用 readFile。
   */
  private buildReferenceGuidance(): string {
    const referenced = this.config.referencedProjects ?? [];
    if (referenced.length === 0) return "";
    const labels = referenced
      .map((r) => `${r.label || r.projectId}（${r.projectId}）`)
      .join("、");
    return [
      "## 引用项目读取指引",
      `用户在本轮引用了项目：${labels}。`,
      "这些项目的内容已作为可读知识通过 `knowledgeReport` 提供。如果需要读取被引用项目的页面/配置/知识原文：",
      "1. 先调用 `knowledgeReport` 检索被引用项目内容，报告会返回对应条目的 `sourceRef`。",
      "2. 再用 `readKnowledgeSource` 传入该 `sourceRef` 读取原文。",
      "**不要用 `readFile` 读取工作区外的路径（会被权限模型拒绝）。**",
    ].join("\n");
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
