import { IBackendAdapter, BackendStatus } from './base';
import { AgentConfig, AgentEvent } from '../core/types';
import { logger } from '../utils/logger';
import EventSource from 'eventsource';

const OPENCODE_SERVER_URL = process.env.OPENCODE_SERVER_URL || 'http://localhost:4096';

interface SSEEvent {
  type: string;
  content?: {
    text?: string;
  };
  toolCallId?: string;
  title?: string;
  kind?: string;
  status?: string;
  done?: boolean;
  error?: string;
  files?: Array<{
    path: string;
    action: 'created' | 'modified' | 'deleted';
    content?: string;
  }>;
  permissionRequest?: {
    permissionId: string;
    toolCallId: string;
    title?: string;
    kind?: string;
    options: Array<{ optionId: string; name: string }>;
  };
}

export class OpenCodeHttpBackend implements IBackendAdapter {
  readonly name = 'opencode-http';
  private config: AgentConfig;
  private status: BackendStatus = 'idle';
  private eventCallback?: (event: AgentEvent) => void;
  private sessionId: string | null = null;
  private fullContent = '';
  private files: Array<{
    path: string;
    action: 'created' | 'modified' | 'deleted';
    content?: string;
  }> = [];
  private eventSource: EventSource | null = null;
  private pendingPermissions = new Map<string, (optionId: string) => void>();
  private streamDone: {
    resolve: (value: string) => void;
    reject: (reason: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  } | null = null;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.status === 'ready' || this.status === 'initializing') {
      return;
    }

    this.status = 'initializing';
    logger.info('Initializing OpenCode HTTP backend');

    try {
      await this.createSession();
      this.status = 'ready';
      logger.info({ sessionId: this.sessionId }, 'OpenCode HTTP backend initialized');
    } catch (error) {
      this.status = 'error';
      logger.error({ error }, 'Failed to initialize OpenCode HTTP backend');
      throw error;
    }
  }

  async start(options?: { resumeSessionId?: string }): Promise<void> {
    if (options?.resumeSessionId) {
      this.sessionId = options.resumeSessionId;
      this.status = 'ready';
      logger.info({ sessionId: this.sessionId }, 'OpenCode HTTP backend started with resumed session');
    } else {
      await this.initialize();
    }
  }

  private async createSession(): Promise<void> {
    const response = await fetch(`${OPENCODE_SERVER_URL}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: this.config.sessionId || `session-${Date.now()}`,
        model: this.config.model,
        workingDir: this.config.workingDir,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Failed to create OpenCode session: ${await response.text()}`);
    }

    const data = await response.json() as { id: string };
    this.sessionId = data.id;
    logger.info({ sessionId: this.sessionId }, 'Created OpenCode session');
  }

  async sendMessage(content: string, options?: { stream?: boolean }): Promise<string> {
    if (!this.sessionId) {
      await this.initialize();
    }

    if (!this.sessionId) {
      throw new Error('Session ID is not available');
    }

    this.status = 'busy';
    this.fullContent = '';
    this.files = [];

    try {
      if (options?.stream) {
        return await this.sendMessageStream(content);
      } else {
        return await this.sendMessageSync(content);
      }
    } catch (error) {
      this.status = 'error';
      logger.error({ error, sessionId: this.sessionId }, 'Failed to send message');
      throw error;
    }
  }

  private async sendMessageSync(content: string): Promise<string> {
    const response = await fetch(`${OPENCODE_SERVER_URL}/session/${this.sessionId}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parts: [{ type: 'text', text: content }],
      }),
      signal: AbortSignal.timeout(this.config.timeout || 120000),
    });

    if (!response.ok) {
      throw new Error(`Failed to send message: ${await response.text()}`);
    }

    const data = await response.json() as { parts?: Array<{ type: string; text: string }> };
    
    const textParts = data.parts?.filter((p) => p.type === 'text') || [];
    this.fullContent = textParts.map((p) => p.text).join('');

    if (this.eventCallback && this.fullContent) {
      this.eventCallback?.({
        type: 'stream',
        sessionId: this.config.sessionId,
        content: this.fullContent,
        done: true,
      });
    }

    this.status = 'ready';
    return this.fullContent;
  }

  private async sendMessageStream(content: string): Promise<string> {
    const response = await fetch(`${OPENCODE_SERVER_URL}/session/${this.sessionId}/prompt_async`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parts: [{ type: 'text', text: content }],
      }),
      signal: AbortSignal.timeout(this.config.timeout || 120000),
    });

    if (!response.ok) {
      throw new Error(`Failed to send async message: ${await response.text()}`);
    }

    this.connectSSE();

    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.streamDone = null;
        this.closeSSE();
        reject(new Error('SSE stream timeout'));
      }, this.config.timeout || 120000);

      this.streamDone = { resolve, reject, timeout };
    });
  }

  private connectSSE(): void {
    if (this.eventSource) {
      this.closeSSE();
    }

    const EventSourceClass = globalThis.EventSource || EventSource;
    this.eventSource = new EventSourceClass(`${OPENCODE_SERVER_URL}/event?sessionId=${this.sessionId}`) as EventSource;

    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as SSEEvent;
        this.handleSSEEvent(data);
      } catch (error) {
        logger.error({ error, data: event.data }, 'Failed to parse SSE event');
      }
    };

    this.eventSource.onerror = (error) => {
      logger.error({ error, sessionId: this.sessionId }, 'SSE connection error');
      this.status = 'error';
      this.closeSSE();
      if (this.streamDone) {
        clearTimeout(this.streamDone.timeout);
        this.streamDone.reject(new Error('SSE connection error'));
        this.streamDone = null;
      }
    };

    this.eventSource.onopen = () => {
      logger.info({ sessionId: this.sessionId }, 'SSE connection established');
    };

    // Trigger onopen for mocks
    if (this.eventSource.onopen && !this.eventSource.readyState) {
      setTimeout(() => {
        if (this.eventSource?.onopen) {
          this.eventSource.onopen({} as Event);
        }
      }, 0);
    }
  }

  private handleSSEEvent(data: SSEEvent): void {
    switch (data.type) {
      case 'agent_message_chunk': {
        const chunk = data.content?.text || '';
        this.fullContent += chunk;
        this.eventCallback?.({
          type: 'stream',
          sessionId: this.config.sessionId,
          content: chunk,
          done: false,
        });
        break;
      }

      case 'agent_thought_chunk':
        this.eventCallback?.({
          type: 'thought',
          sessionId: this.config.sessionId,
          content: data.content?.text || '',
          done: false,
        });
        break;

      case 'agent_message_done':
        this.eventCallback?.({
          type: 'stream',
          sessionId: this.config.sessionId,
          content: '',
          done: true,
        });
        this.status = 'ready';
        this.closeSSE();
        if (this.streamDone) {
          clearTimeout(this.streamDone.timeout);
          this.streamDone.resolve(this.fullContent);
          this.streamDone = null;
        }
        break;

      case 'tool_call':
        this.eventCallback?.({
          type: 'tool_call',
          sessionId: this.config.sessionId,
          toolCallId: data.toolCallId || '',
          title: data.title || '',
          kind: (data.kind as 'read' | 'edit' | 'execute') || 'execute',
          status: 'pending',
        });
        break;

      case 'tool_call_update':
        this.eventCallback?.({
          type: 'tool_call_update',
          sessionId: this.config.sessionId,
          toolCallId: data.toolCallId || '',
          status: data.status === 'completed' ? 'completed' : 'failed',
        });
        break;

      case 'file_operation':
        if (data.files) {
          for (const file of data.files) {
            this.files.push(file);
            this.eventCallback?.({
              type: 'file_operation',
              sessionId: this.config.sessionId,
              fileOperation: {
                method: 'fs/write_text_file',
                path: file.path,
                content: file.content,
              },
            });
          }
        }
        break;

      case 'permission_request':
        if (data.permissionRequest) {
          this.handlePermissionRequest(data.permissionRequest);
        }
        break;

      case 'error':
        this.eventCallback?.({
          type: 'error',
          sessionId: this.config.sessionId,
          error: {
            code: 'MESSAGE_SEND_ERROR',
            message: data.error || 'Unknown error',
            retryable: true,
          },
        });
        this.status = 'error';
        this.closeSSE();
        if (this.streamDone) {
          clearTimeout(this.streamDone.timeout);
          this.streamDone.reject(new Error(data.error || 'Stream ended with error'));
          this.streamDone = null;
        }
        break;

      default:
        logger.debug({ eventType: data.type }, 'Unhandled SSE event type');
    }
  }

  private handlePermissionRequest(request: {
    permissionId: string;
    toolCallId: string;
    title?: string;
    kind?: string;
    options: Array<{ optionId: string; name: string }>;
  }): void {
    const allowAlways = request.options.find((o) => o.name === 'allow_always');
    const allowOnce = request.options.find((o) => o.name === 'allow_once');
    const selected = allowAlways || allowOnce;

    if (selected) {
      logger.info(
        { toolCallId: request.toolCallId, option: selected.name },
        'Auto-approving permission'
      );
      this.respondToPermission(request.permissionId, selected.optionId);
    } else {
      logger.warn(
        { toolCallId: request.toolCallId },
        'No allow option found for permission request'
      );
      this.respondToPermission(request.permissionId, request.options[0]?.optionId || 'reject_once');
    }
  }

  private async respondToPermission(permissionId: string, optionId: string): Promise<void> {
    try {
      const response = await fetch(
        `${OPENCODE_SERVER_URL}/session/${this.sessionId}/permissions/${permissionId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ optionId }),
          signal: AbortSignal.timeout(10000),
        }
      );

      if (!response.ok) {
        logger.error(
          { permissionId, optionId, status: response.status },
          'Failed to respond to permission request'
        );
      }
    } catch (error) {
      logger.error({ error, permissionId }, 'Error responding to permission request');
    }
  }

  private closeSSE(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
      logger.info({ sessionId: this.sessionId }, 'SSE connection closed');
    }
  }

  onStream(callback: (event: AgentEvent) => void): void {
    this.eventCallback = callback;
  }

  async getStatus(): Promise<BackendStatus> {
    return this.status;
  }

  async destroy(): Promise<void> {
    if (this.streamDone) {
      clearTimeout(this.streamDone.timeout);
      this.streamDone.reject(new Error('Backend destroyed'));
      this.streamDone = null;
    }
    this.closeSSE();
    this.sessionId = null;
    this.status = 'idle';
    this.fullContent = '';
    this.files = [];
    this.pendingPermissions.clear();
    logger.info({ sessionId: this.config.sessionId }, 'OpenCode HTTP backend destroyed');
  }

  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${OPENCODE_SERVER_URL}/global/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  getCurrentSessionId(): string | null {
    return this.sessionId;
  }

  async setModel(modelId: string): Promise<void> {
    this.config.model = modelId;
    logger.info({ modelId, sessionId: this.sessionId }, 'Model set for OpenCode HTTP backend');
  }

  private modelInfoCache: {
    models: Array<{ id: string; label: string }>;
    currentModelId: string | null;
  } | null = null;

  async getModelInfo(): Promise<{
    currentModelId: string | null;
    availableModels: Array<{ id: string; label: string }>;
    canSwitch: boolean;
  } | null> {
    if (!this.modelInfoCache) {
      try {
        const response = await fetch(`${OPENCODE_SERVER_URL}/models`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
          const data = await response.json() as {
            models?: Array<{ id: string; label?: string; name?: string }>;
            currentModelId?: string;
          };

          this.modelInfoCache = {
            models: (data.models || []).map((m) => ({
              id: m.id,
              label: m.label || m.name || m.id,
            })),
            currentModelId: data.currentModelId || this.config.model || null,
          };
        }
      } catch (error) {
        logger.error({ error }, 'Failed to fetch models from OpenCode Server');
      }
    }

    return {
      currentModelId: this.modelInfoCache?.currentModelId || this.config.model || null,
      availableModels: this.modelInfoCache?.models || [],
      canSwitch: true,
    };
  }

  getFiles(): Array<{
    path: string;
    action: 'created' | 'modified' | 'deleted';
    content?: string;
  }> {
    return this.files;
  }

  setPromptTimeout(seconds: number): void {
    if (this.config.opencode) {
      this.config.opencode.timeout = seconds * 1000;
    }
  }

  cancelPrompt(): void {
    logger.info({ sessionId: this.sessionId }, 'Cancel prompt requested for OpenCode HTTP backend');
    this.closeSSE();
    this.status = 'ready';
    if (this.streamDone) {
      clearTimeout(this.streamDone.timeout);
      this.streamDone.resolve(this.fullContent);
      this.streamDone = null;
    }
  }
}
