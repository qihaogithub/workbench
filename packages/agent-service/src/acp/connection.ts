import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import {
  AcpRequest,
  AcpResponse,
  AcpNotification,
  AcpSessionUpdate,
  AcpPermissionRequest,
  AcpBackendConfig,
  AcpBackend,
  AcpInitializeResult,
  AcpSessionNewResult,
  AcpPromptResult,
  AcpSessionConfigOption,
  AcpSessionModels,
  ACP_BACKENDS,
  ACP_METHODS,
  JSONRPC_VERSION,
} from './types';
import { AcpApprovalStore, createAcpApprovalKey } from './approval-store';
import { buildAcpModelInfo, AcpModelInfo } from './model-info';
import { logger } from '../utils/logger';

/**
 * 清理环境变量（参考 AionUi 做法）
 * 防止父进程环境变量干扰子进程
 */
function prepareCleanEnv(): Record<string, string> {
  const env = { ...process.env } as Record<string, string>;

  // 删除可能干扰子进程的 Node.js 相关变量
  delete env.NODE_OPTIONS;
  delete env.NODE_INSPECT;
  delete env.NODE_DEBUG;
  delete env.NODE_ENV;

  // 删除 npm 生命周期变量
  for (const key of Object.keys(env)) {
    if (key.startsWith('npm_')) {
      delete env[key];
    }
  }

  return env;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeoutId?: NodeJS.Timeout;
  method: string;
  isPaused: boolean;
  startTime: number;
  timeoutDuration: number;
  promptOriginTime: number;
}

type SessionUpdateHandler = (update: AcpSessionUpdate) => void;
type PermissionHandler = (request: AcpPermissionRequest) => Promise<{ optionId: string }>;
type DisconnectHandler = (error: { code: number | null; signal: NodeJS.Signals | null }) => void;
type FileOperationHandler = (operation: { method: string; path: string; content?: string; sessionId: string }) => void;

export class AcpConnection extends EventEmitter {
  private child: ChildProcess | null = null;
  private backend: AcpBackend | null = null;
  private config: AcpBackendConfig | null = null;
  private nextRequestId = 1;
  private pendingRequests = new Map<number, PendingRequest>();
  private buffer = '';
  private isInitialized = false;
  private sessionId: string | null = null;
  private workingDir: string;
  private isSetupComplete = false;
  private isDetached = false;

  private configOptions: AcpSessionConfigOption[] | null = null;
  private models: AcpSessionModels | null = null;

  private promptTimeoutMs: number = 300000;
  private promptKeepaliveInterval: NodeJS.Timeout | null = null;
  private static readonly KEEPALIVE_INTERVAL_MS = 60000;

  private approvalStore: AcpApprovalStore;

  public onSessionUpdate?: SessionUpdateHandler;
  public onPermissionRequest?: PermissionHandler;
  public onDisconnect?: DisconnectHandler;
  public onFileOperation?: FileOperationHandler;
  public onEndTurn?: () => void;

  constructor(backend: AcpBackend, workingDir: string) {
    super();
    this.backend = backend;
    this.config = ACP_BACKENDS[backend];
    if (!this.config) {
      throw new Error(`Unknown ACP backend: ${backend}`);
    }
    this.workingDir = workingDir;
    this.approvalStore = new AcpApprovalStore();
  }

  setPromptTimeout(seconds: number): void {
    this.promptTimeoutMs = Math.max(30, seconds) * 1000;
  }

  async connect(cliPath?: string, customEnv?: Record<string, string>): Promise<void> {
    if (this.child) {
      await this.disconnect();
    }

    const command = cliPath || this.config?.cliCommand || this.config?.defaultCliPath;
    if (!command) {
      throw new Error(`CLI path is required for ${this.backend} backend`);
    }

    const args = [...(this.config?.acpArgs || [])];
    logger.info({ backend: this.backend, command, args }, 'Starting ACP process');

    const isWindows = process.platform === 'win32';
    const useShell = isWindows || command.startsWith('npx ') || command.includes(' ');
    const actualCommand = useShell ? command.split(' ')[0] : command;
    const actualArgs = useShell ? [...command.split(' ').slice(1), ...args] : args;

    // 清理环境变量（参考 AionUi 做法）
    const cleanEnv = prepareCleanEnv();
    if (customEnv) {
      Object.assign(cleanEnv, customEnv);
    }

    this.child = spawn(actualCommand, actualArgs, {
      cwd: this.workingDir,
      env: { ...cleanEnv, ...this.config?.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: useShell,
    });

    await this.setupChildProcessHandlers();
    await this.initialize();
    this.isSetupComplete = true;
    logger.info({ backend: this.backend }, 'ACP connection established');
  }

  private async setupChildProcessHandlers(): Promise<void> {
    if (!this.child) return;

    let stderrBuffer = '';

    this.child.stdout?.on('data', (data: Buffer) => {
      this.buffer += data.toString();
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          try {
            const message = JSON.parse(line);
            this.handleMessage(message);
          } catch (error) {
            logger.debug({ line, error }, 'Failed to parse ACP message');
          }
        }
      }
    });

    this.child.stderr?.on('data', (data: Buffer) => {
      stderrBuffer += data.toString();
      logger.debug({ stderr: data.toString() }, 'ACP stderr');
    });

    this.child.on('exit', (code, signal) => {
      logger.info({ backend: this.backend, code, signal }, 'ACP process exited');
      if (this.isSetupComplete) {
        this.handleProcessExit(code, signal);
      }
    });

    this.child.on('error', (error) => {
      logger.error({ backend: this.backend, error }, 'ACP process error');
      this.emit('error', error);
    });

    await new Promise((resolve) => setImmediate(resolve));
  }

  private handleProcessExit(code: number | null, signal: NodeJS.Signals | null): void {
    this.stopPromptKeepalive();

    for (const [_id, request] of this.pendingRequests) {
      if (request.timeoutId) {
        clearTimeout(request.timeoutId);
      }
      request.reject(new Error(`ACP process exited unexpectedly (code: ${code}, signal: ${signal})`));
    }
    this.pendingRequests.clear();

    this.sessionId = null;
    this.isInitialized = false;
    this.isSetupComplete = false;
    this.isDetached = false;
    this.child = null;

    this.onDisconnect?.({ code, signal });
    this.emit('disconnect', { code, signal });
  }

  private handleMessage(message: AcpResponse | AcpNotification): void {
    if ('method' in message) {
      this.handleNotification(message);
    } else if ('id' in message && message.id !== undefined) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        this.pendingRequests.delete(message.id);
        if (pending.timeoutId) {
          clearTimeout(pending.timeoutId);
        }
        if ('error' in message && message.error) {
          pending.reject(new Error(message.error.message));
        } else {
          if (message.result && typeof message.result === 'object') {
            const result = message.result as Record<string, unknown>;
            if (result.stopReason === 'end_turn') {
              this.onEndTurn?.();
            }
          }
          pending.resolve(message.result);
        }
      }
    }
  }

  private handleNotification(notification: AcpNotification): void {
    switch (notification.method) {
      case ACP_METHODS.SESSION_UPDATE:
        this.resetSessionPromptTimeouts();
        if (notification.params) {
          const params = notification.params as Record<string, unknown>;
          if (params.update && (params.update as Record<string, unknown>).sessionUpdate === 'config_option_update') {
            const updatePayload = params.update as { configOptions?: AcpSessionConfigOption[] };
            if (Array.isArray(updatePayload.configOptions)) {
              this.configOptions = updatePayload.configOptions;
            }
          }
          this.onSessionUpdate?.(notification.params as unknown as AcpSessionUpdate);
        }
        this.emit('sessionUpdate', notification.params);
        break;

      case ACP_METHODS.REQUEST_PERMISSION:
        if (notification.params) {
          this.handlePermissionRequest(notification.params as unknown as AcpPermissionRequest);
        }
        break;

      case ACP_METHODS.READ_TEXT_FILE:
        if (notification.params) {
          this.handleReadOperation(notification.params as { path: string; sessionId?: string });
        }
        break;

      case ACP_METHODS.WRITE_TEXT_FILE:
        if (notification.params) {
          this.handleWriteOperation(notification.params as { path: string; content: string; sessionId?: string });
        }
        break;

      default:
        logger.debug({ method: notification.method }, 'Unhandled ACP notification');
    }
  }

  private async handlePermissionRequest(request: AcpPermissionRequest): Promise<void> {
    this.pauseSessionPromptTimeouts();

    try {
      const toolCallKey = createAcpApprovalKey(request.toolCall);

      if (this.approvalStore.isApprovedForSession(toolCallKey)) {
        await this.sendPermissionResponse(request.sessionId, 'allow_always');
        return;
      }

      if (this.onPermissionRequest) {
        const response = await this.onPermissionRequest(request);

        if (response.optionId === 'allow_always') {
          this.approvalStore.put(toolCallKey, 'allow_always');
        }

        await this.sendPermissionResponse(request.sessionId, response.optionId);
      } else {
        await this.sendPermissionResponse(request.sessionId, 'reject_once');
      }
    } catch (error) {
      logger.error({ error }, 'Permission request failed');
      await this.sendPermissionResponse(request.sessionId, 'reject_once');
    } finally {
      this.resumeSessionPromptTimeouts();
    }
  }

  private async sendPermissionResponse(sessionId: string, optionId: string): Promise<void> {
    const outcome = optionId.includes('reject') ? 'rejected' : 'selected';
    const message: AcpNotification = {
      jsonrpc: JSONRPC_VERSION,
      method: ACP_METHODS.REQUEST_PERMISSION,
      params: { sessionId, optionId },
    };
    this.sendMessage(message as unknown as AcpRequest);
  }

  private async handleReadOperation(params: { path: string; sessionId?: string }): Promise<void> {
    const resolvedPath = this.resolveWorkspacePath(params.path);
    this.onFileOperation?.({
      method: 'fs/read_text_file',
      path: resolvedPath,
      sessionId: params.sessionId || '',
    });
  }

  private async handleWriteOperation(params: { path: string; content: string; sessionId?: string }): Promise<void> {
    const resolvedPath = this.resolveWorkspacePath(params.path);
    this.onFileOperation?.({
      method: 'fs/write_text_file',
      path: resolvedPath,
      content: params.content,
      sessionId: params.sessionId || '',
    });
  }

  private resolveWorkspacePath(targetPath: string): string {
    if (!targetPath) return this.workingDir;
    if (path.isAbsolute(targetPath)) {
      return targetPath;
    }
    return path.join(this.workingDir, targetPath);
  }

  private sendRequest<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = this.nextRequestId++;
      const message: AcpRequest = {
        jsonrpc: JSONRPC_VERSION,
        id,
        method,
        ...(params && { params }),
      };

      const timeoutDuration = method === ACP_METHODS.SESSION_PROMPT ? this.promptTimeoutMs : 120000;
      const startTime = Date.now();

      const timeoutId = setTimeout(() => {
        const request = this.pendingRequests.get(id);
        if (request && !request.isPaused) {
          this.handlePromptTimeout(id, request);
        }
      }, timeoutDuration);

      const pendingRequest: PendingRequest = {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeoutId,
        method,
        isPaused: false,
        startTime,
        timeoutDuration,
        promptOriginTime: startTime,
      };

      this.pendingRequests.set(id, pendingRequest);
      this.sendMessage(message);
    });
  }

  private handlePromptTimeout(requestId: number, request: PendingRequest): void {
    this.pendingRequests.delete(requestId);
    if (request.method === ACP_METHODS.SESSION_PROMPT) {
      this.cancelPrompt();
    }
    request.reject(
      new Error(
        request.method === ACP_METHODS.SESSION_PROMPT
          ? `LLM request timed out after ${request.timeoutDuration / 1000} seconds`
          : `Request ${request.method} timed out after ${request.timeoutDuration / 1000} seconds`
      )
    );
  }

  private pauseRequestTimeout(requestId: number): void {
    const request = this.pendingRequests.get(requestId);
    if (request && !request.isPaused && request.timeoutId) {
      clearTimeout(request.timeoutId);
      request.isPaused = true;
      request.timeoutId = undefined;
    }
  }

  private resumeRequestTimeout(requestId: number): void {
    const request = this.pendingRequests.get(requestId);
    if (request && request.isPaused) {
      request.startTime = Date.now();
      request.promptOriginTime = Date.now();
      request.timeoutId = setTimeout(() => {
        if (this.pendingRequests.has(requestId) && !request.isPaused) {
          this.handlePromptTimeout(requestId, request);
        }
      }, request.timeoutDuration);
      request.isPaused = false;
    }
  }

  private pauseSessionPromptTimeouts(): void {
    for (const [id] of this.pendingRequests) {
      if (this.pendingRequests.get(id)?.method === ACP_METHODS.SESSION_PROMPT) {
        this.pauseRequestTimeout(id);
      }
    }
  }

  private resumeSessionPromptTimeouts(): void {
    for (const [id, request] of this.pendingRequests) {
      if (request.method === ACP_METHODS.SESSION_PROMPT && request.isPaused) {
        this.resumeRequestTimeout(id);
      }
    }
  }

  private resetSessionPromptTimeouts(): void {
    for (const [id, request] of this.pendingRequests) {
      if (request.method === ACP_METHODS.SESSION_PROMPT && !request.isPaused && request.timeoutId) {
        clearTimeout(request.timeoutId);
        request.startTime = Date.now();
        request.timeoutId = setTimeout(() => {
          if (this.pendingRequests.has(id) && !request.isPaused) {
            this.handlePromptTimeout(id, request);
          }
        }, request.timeoutDuration);
      }
    }
  }

  private isChildAlive(): boolean {
    return this.child !== null && !this.child.killed && this.child.exitCode === null && this.child.signalCode === null;
  }

  private startPromptKeepalive(): void {
    this.stopPromptKeepalive();
    this.promptKeepaliveInterval = setInterval(() => {
      if (!this.isChildAlive()) return;
      const now = Date.now();
      const hasEligibleRequest = [...this.pendingRequests.values()].some(
        (r) => r.method === ACP_METHODS.SESSION_PROMPT && now - r.promptOriginTime < r.timeoutDuration
      );
      if (hasEligibleRequest) {
        this.resetSessionPromptTimeouts();
      }
    }, AcpConnection.KEEPALIVE_INTERVAL_MS);
  }

  private stopPromptKeepalive(): void {
    if (this.promptKeepaliveInterval) {
      clearInterval(this.promptKeepaliveInterval);
      this.promptKeepaliveInterval = null;
    }
  }

  private sendMessage(message: AcpRequest): void {
    if (!this.child?.stdin) {
      throw new Error('ACP process not running');
    }
    const lineEnding = process.platform === 'win32' ? '\r\n' : '\n';
    const json = JSON.stringify(message) + lineEnding;
    this.child.stdin.write(json);
    logger.debug({ method: message.method, id: message.id }, 'Sent ACP request');
  }

  private async initialize(): Promise<AcpInitializeResult> {
    const result = await this.sendRequest<AcpInitializeResult>(ACP_METHODS.INITIALIZE, {
      protocolVersion: 1,
      clientCapabilities: {
        fs: {
          readTextFile: true,
          writeTextFile: true,
        },
      },
    });
    this.isInitialized = true;
    return result;
  }

  async createSession(options?: {
    model?: string;
    resumeSessionId?: string;
    forkSession?: boolean;
  }): Promise<AcpSessionNewResult> {
    if (!this.isInitialized) {
      throw new Error('ACP connection not initialized');
    }

    const normalizedCwd = this.normalizeCwdForAgent(this.workingDir);

    logger.info({ cwd: this.workingDir, normalizedCwd }, 'Creating ACP session')

    const params: Record<string, unknown> = {
      cwd: normalizedCwd,
      mcpServers: [],
    };

    if (options?.model) {
      params.model = options.model;
    }

    if (options?.resumeSessionId) {
      params.resumeSessionId = options.resumeSessionId;
    }

    if (options?.forkSession) {
      params.forkSession = options.forkSession;
    }

    const result = await this.sendRequest<AcpSessionNewResult>(ACP_METHODS.SESSION_NEW, params);
    this.sessionId = result.sessionId;

    if (result.configOptions) {
      this.configOptions = result.configOptions;
    }
    if (result.models) {
      this.models = result.models;
    }

    logger.info({ sessionId: this.sessionId }, 'ACP session created');
    return result;
  }

  async loadSession(sessionId: string): Promise<AcpSessionNewResult> {
    if (!this.isInitialized) {
      throw new Error('ACP connection not initialized');
    }

    const normalizedCwd = this.normalizeCwdForAgent(this.workingDir);

    const result = await this.sendRequest<AcpSessionNewResult & { sessionId?: string }>(ACP_METHODS.SESSION_LOAD, {
      sessionId,
      cwd: normalizedCwd,
    });

    this.sessionId = result.sessionId || sessionId;

    if (result.configOptions) {
      this.configOptions = result.configOptions;
    }
    if (result.models) {
      this.models = result.models;
    }

    logger.info({ sessionId: this.sessionId }, 'ACP session loaded');
    return result;
  }

  async createOrResumeSession(resumeSessionId?: string, options?: { model?: string }): Promise<string> {
    if (resumeSessionId) {
      try {
        const result = await this.loadSession(resumeSessionId);
        return result.sessionId;
      } catch (error) {
        logger.warn({ error, resumeSessionId }, 'Failed to resume session, creating new one');
      }
    }
    const result = await this.createSession(options);
    return result.sessionId;
  }

  async sendPrompt(
    prompt: string | Array<{ type: 'text' | 'image'; text?: string; data?: string; mimeType?: string }>,
    handlers?: {
      onSessionUpdate?: SessionUpdateHandler;
      onPermissionRequest?: PermissionHandler;
    }
  ): Promise<AcpPromptResult> {
    if (!this.sessionId) {
      throw new Error('No active session');
    }

    this.onSessionUpdate = handlers?.onSessionUpdate;
    this.onPermissionRequest = handlers?.onPermissionRequest;

    const promptArray = typeof prompt === 'string' ? [{ type: 'text' as const, text: prompt }] : prompt;

    this.startPromptKeepalive();
    try {
      const result = await this.sendRequest<AcpPromptResult>(ACP_METHODS.SESSION_PROMPT, {
        sessionId: this.sessionId,
        prompt: promptArray,
      });
      return result;
    } finally {
      this.stopPromptKeepalive();
    }
  }

  cancelPrompt(): void {
    if (!this.sessionId) return;

    const message: AcpNotification = {
      jsonrpc: JSONRPC_VERSION,
      method: ACP_METHODS.SESSION_CANCEL,
      params: { sessionId: this.sessionId },
    };
    this.sendMessage(message as unknown as AcpRequest);

    for (const [id, request] of this.pendingRequests) {
      if (request.method === ACP_METHODS.SESSION_PROMPT) {
        if (request.timeoutId) {
          clearTimeout(request.timeoutId);
        }
        this.pendingRequests.delete(id);
        request.resolve(null);
      }
    }
  }

  async setModel(modelId: string): Promise<void> {
    if (!this.sessionId) {
      throw new Error('No active session');
    }

    await this.sendRequest(ACP_METHODS.SET_MODEL, {
      sessionId: this.sessionId,
      modelId,
    });

    if (this.models) {
      this.models = { ...this.models, currentModelId: modelId };
    }

    if (this.configOptions) {
      this.configOptions = this.configOptions.map((opt) =>
        opt.category === 'model' ? { ...opt, currentValue: modelId, selectedValue: modelId } : opt
      );
    }
  }

  async setConfigOption(optionId: string, value: string): Promise<void> {
    if (!this.sessionId) {
      throw new Error('No active session');
    }
    await this.sendRequest(ACP_METHODS.SET_CONFIG_OPTION, {
      sessionId: this.sessionId,
      optionId,
      value,
    });
  }

  async setSessionMode(modeId: string): Promise<void> {
    if (!this.sessionId) {
      throw new Error('No active session');
    }
    await this.sendRequest(ACP_METHODS.SET_MODE, {
      sessionId: this.sessionId,
      modeId,
    });
  }

  getModelInfo(): AcpModelInfo | null {
    return buildAcpModelInfo(this.configOptions, this.models);
  }

  getConfigOptions(): AcpSessionConfigOption[] | null {
    return this.configOptions;
  }

  getModels(): AcpSessionModels | null {
    return this.models;
  }

  private normalizeCwdForAgent(cwd?: string): string {
    const defaultPath = '.';
    if (!cwd) return defaultPath;

    if (this.backend === 'copilot' || this.backend === 'codex') {
      return path.resolve(cwd);
    }

    try {
      const workspaceRoot = path.resolve(this.workingDir);
      const requested = path.resolve(cwd);

      const relative = path.relative(workspaceRoot, requested);
      const isInsideWorkspace = relative && !relative.startsWith('..') && !path.isAbsolute(relative);

      if (isInsideWorkspace) {
        return relative.length === 0 ? defaultPath : relative;
      }
    } catch (error) {
      logger.warn({ error }, 'Failed to normalize cwd for agent');
    }

    return defaultPath;
  }

  async disconnect(): Promise<void> {
    this.stopPromptKeepalive();

    if (this.child) {
      this.child.kill();
      this.child = null;
    }

    this.sessionId = null;
    this.isInitialized = false;
    this.isSetupComplete = false;
    this.isDetached = false;

    for (const [_id, request] of this.pendingRequests) {
      if (request.timeoutId) {
        clearTimeout(request.timeoutId);
      }
      request.reject(new Error('Connection closed'));
    }
    this.pendingRequests.clear();

    this.approvalStore.clear();
    this.configOptions = null;
    this.models = null;

    logger.info({ backend: this.backend }, 'ACP connection closed');
  }

  get isConnected(): boolean {
    return this.isInitialized && this.child !== null && !this.child.killed;
  }

  get hasActiveSession(): boolean {
    return this.sessionId !== null;
  }

  get currentSessionId(): string | null {
    return this.sessionId;
  }

  get currentBackend(): AcpBackend | null {
    return this.backend;
  }

  getApprovalStore(): AcpApprovalStore {
    return this.approvalStore;
  }
}
