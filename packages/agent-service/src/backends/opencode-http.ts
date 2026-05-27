import { IBackendAdapter, BackendStatus } from './base';
import { AgentConfig, AgentEvent } from '../core/types';
import { logger } from '../utils/logger';
import { EventSource } from 'eventsource';

const OPENCODE_SERVER_URL = process.env.OPENCODE_SERVER_URL || 'http://localhost:4096';

/**
 * OpenCode Server SSE event format.
 * Each event has a `type` and `properties` with session-specific data.
 */
interface FileDiff {
  file: string;
  before: string;
  after: string;
  additions: number;
  deletions: number;
}

interface OpenCodeSSEEvent {
  id: string;
  type: string;
  properties: {
    sessionID?: string;
    messageID?: string;
    partID?: string;
    field?: string;
    delta?: string;
    part?: {
      type: string;
      text?: string;
      reason?: string;
      id?: string;
      messageID?: string;
      sessionID?: string;
    };
    info?: {
      id?: string;
      role?: string;
      modelID?: string;
      providerID?: string;
      finish?: string;
      tokens?: { total?: number; input?: number; output?: number; reasoning?: number };
    };
    status?: { type: string };
    model?: { id: string; providerID: string; variant?: string };
    diff?: Array<FileDiff>;
    file?: string;
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
    const body: Record<string, unknown> = {
      parts: [{ type: 'text', text: content }],
    };
    if (this.config.model) {
      body.model = this.config.model;
    }
    const response = await fetch(`${OPENCODE_SERVER_URL}/session/${this.sessionId}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeout || 120000),
    });

    if (!response.ok) {
      throw new Error(`Failed to send message: ${await response.text()}`);
    }

    const data = await response.json() as {
      info?: { modelID?: string; providerID?: string; tokens?: { total?: number } };
      parts?: Array<{ type: string; text?: string; reason?: string }>;
    };

    // Extract text from parts (OpenCode Server response format)
    const textParts = data.parts?.filter((p) => p.type === 'text' && p.text) || [];
    this.fullContent = textParts.map((p) => p.text || '').join('');

    if (this.eventCallback && this.fullContent) {
      this.eventCallback({
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
    // Connect SSE first to avoid missing early events
    this.connectSSE();

    const body: Record<string, unknown> = {
      parts: [{ type: 'text', text: content }],
    };
    if (this.config.model) {
      body.model = this.config.model;
    }
    const response = await fetch(`${OPENCODE_SERVER_URL}/session/${this.sessionId}/prompt_async`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeout || 120000),
    });

    if (!response.ok) {
      this.closeSSE();
      throw new Error(`Failed to send async message: ${await response.text()}`);
    }

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

    // Reset diagnostic tracking for new SSE session
    this.sseEventLog = [];
    this.sessionDiffReceived = false;
    this.sessionIdleReceived = false;

    this.eventSource = new EventSource(`${OPENCODE_SERVER_URL}/event?sessionId=${this.sessionId}`);

    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as OpenCodeSSEEvent;
        this.handleSSEEvent(data);
      } catch (error) {
        logger.error({ error, data: event.data }, 'Failed to parse SSE event');
      }
    };

    this.eventSource.onerror = () => {
      logger.error({ sessionId: this.sessionId }, 'SSE connection error');
      // Don't immediately set error status - SSE reconnects automatically
      // Only treat as error if we have a pending stream
      if (this.streamDone) {
        this.status = 'error';
        this.closeSSE();
        clearTimeout(this.streamDone.timeout);
        this.streamDone.reject(new Error('SSE connection error'));
        this.streamDone = null;
      }
    };

    this.eventSource.onopen = () => {
      logger.info({ sessionId: this.sessionId }, 'SSE connection established');
    };
  }

  private handleSSEEvent(data: OpenCodeSSEEvent): void {
    const props = data.properties;

    // Diagnostic: log every SSE event type with timestamp for ordering analysis
    this.sseEventLog.push({ type: data.type, ts: Date.now() });
    logger.debug(
      { eventType: data.type, sessionId: this.sessionId, seq: this.sseEventLog.length },
      '[SSE-DIAG] Event received',
    );

    switch (data.type) {
      // Streaming text delta (incremental chunk)
      case 'message.part.delta': {
        if (props.field === 'text' && props.delta) {
          // Determine if this is reasoning or text based on part type context
          // We track part types from message.part.updated events
          const partId = props.partID || '';
          const isReasoning = this.reasoningParts.has(partId);

          if (isReasoning) {
            this.eventCallback?.({
              type: 'thought',
              sessionId: this.config.sessionId,
              content: props.delta,
              done: false,
            });
          } else {
            this.fullContent += props.delta;
            this.eventCallback?.({
              type: 'stream',
              sessionId: this.config.sessionId,
              content: props.delta,
              done: false,
            });
          }
        }
        break;
      }

      // Part updated (completed or started)
      case 'message.part.updated': {
        if (props.part) {
          const partType = props.part.type;
          const partId = props.part.id || '';

          if (partType === 'reasoning') {
            this.reasoningParts.add(partId);
          } else if (partType === 'text' && props.part.text) {
            // Full text part completed - but we already streamed via deltas
          } else if (partType === 'step-start') {
            // AI step started - could indicate tool use
            this.eventCallback?.({
              type: 'tool_call',
              sessionId: this.config.sessionId,
              toolCallId: partId,
              title: 'Processing...',
              kind: 'execute',
              status: 'pending',
            });
          } else if (partType === 'step-finish') {
            this.eventCallback?.({
              type: 'tool_call_update',
              sessionId: this.config.sessionId,
              toolCallId: partId,
              status: 'completed',
            });
          }
        }
        break;
      }

      // Session became idle = AI finished responding
      case 'session.idle': {
        this.sessionIdleReceived = true;
        const diffBeforeIdle = this.sessionDiffReceived;
        logger.info(
          {
            sessionId: this.sessionId,
            diffReceivedBeforeIdle: diffBeforeIdle,
            filesCount: this.files.length,
            eventSequence: this.sseEventLog.map(e => e.type).join(' → '),
          },
          '[SSE-DIAG] session.idle received — closing SSE',
        );
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
      }

      // Session status updates
      case 'session.status': {
        if (props.status?.type === 'idle' && this.streamDone) {
          this.status = 'ready';
          this.closeSSE();
          clearTimeout(this.streamDone.timeout);
          this.streamDone.resolve(this.fullContent);
          this.streamDone = null;
        }
        break;
      }

      // Session diff (file changes) — emit file_operation events and populate files
      case 'session.diff': {
        const idleBeforeDiff = this.sessionIdleReceived;
        const diffCount = Array.isArray(props.diff) ? props.diff.length : 0;
        this.sessionDiffReceived = true;

        if (idleBeforeDiff) {
          logger.warn(
            {
              sessionId: this.sessionId,
              diffCount,
              eventSequence: this.sseEventLog.map(e => e.type).join(' → '),
            },
            '[SSE-DIAG] ⚠️ session.diff arrived AFTER session.idle — SSE may already be closed!',
          );
        }

        if (diffCount === 0) {
          logger.warn(
            { sessionId: this.sessionId },
            '[SSE-DIAG] ⚠️ session.diff received with EMPTY diff[] — check OpenCode Server snapshot config',
          );
        }

        if (props.diff && Array.isArray(props.diff) && props.diff.length > 0) {
          logger.info(
            {
              diffCount: props.diff.length,
              sessionId: this.sessionId,
              idleBeforeDiff,
              files: props.diff.map((d: { file?: string }) => d.file),
            },
            '[SSE-DIAG] session.diff received — processing file diffs',
          );

          for (const fileDiff of props.diff) {
            if (fileDiff.file && fileDiff.after !== undefined) {
              // Emit file_operation event for real-time frontend updates
              this.eventCallback?.({
                type: 'file_operation',
                sessionId: this.config.sessionId,
                fileOperation: {
                  method: 'fs/write_text_file',
                  path: fileDiff.file,
                  content: fileDiff.after,
                },
              });

              // Populate this.files for finish event
              const existingIndex = this.files.findIndex(f => f.path === fileDiff.file);
              if (existingIndex >= 0) {
                this.files[existingIndex].content = fileDiff.after;
              } else {
                this.files.push({
                  path: fileDiff.file,
                  action: fileDiff.before ? 'modified' : 'created',
                  content: fileDiff.after,
                });
              }
            }
          }
        }
        break;
      }

      // File edited event — log for diagnostics
      case 'file.edited': {
        if (props.file) {
          logger.info({ file: props.file, sessionId: this.sessionId }, 'File edited event received');
        }
        break;
      }

      // Model switched
      case 'session.next.model.switched': {
        if (props.model) {
          logger.info(
            { model: props.model.id, provider: props.model.providerID },
            'Model switched in session'
          );
        }
        break;
      }

      // Heartbeat and other ignorable events
      case 'server.heartbeat':
      case 'server.connected':
      case 'session.updated':
      case 'message.updated':
        break;

      default:
        logger.debug({ eventType: data.type }, 'Unhandled SSE event type');
    }
  }

  private reasoningParts = new Set<string>();

  // ── Diagnostic tracking for SSE event ordering ──
  private sseEventLog: Array<{ type: string; ts: number }> = [];
  private sessionDiffReceived = false;
  private sessionIdleReceived = false;

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
    this.reasoningParts.clear();
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
    this.modelInfoCache = null;
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
    try {
      // Get current model from session info
      let currentModelId = this.config.model || null;
      if (this.sessionId) {
        try {
          const sessionResp = await fetch(`${OPENCODE_SERVER_URL}/session/${this.sessionId}`, {
            method: 'GET',
            signal: AbortSignal.timeout(5000),
          });
          if (sessionResp.ok) {
            const sessionData = await sessionResp.json() as {
              model?: { id?: string; providerID?: string };
            };
            if (sessionData.model?.id) {
              currentModelId = `${sessionData.model.providerID}/${sessionData.model.id}`;
            }
          }
        } catch {
          // Ignore session fetch errors
        }
      }

      // Get available models from /provider endpoint
      const response = await fetch(`${OPENCODE_SERVER_URL}/provider`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const data = await response.json() as {
          all?: Array<{
            id: string;
            name?: string;
            models?: Record<string, { id: string; name?: string }>;
          }>;
        };

        const models: Array<{ id: string; label: string }> = [];
        for (const provider of data.all || []) {
          for (const [, modelInfo] of Object.entries(provider.models || {})) {
            models.push({
              id: `${provider.id}/${modelInfo.id}`,
              label: modelInfo.name || modelInfo.id,
            });
          }
        }

        this.modelInfoCache = { models, currentModelId };
      }
    } catch (error) {
      logger.error({ error }, 'Failed to fetch models from OpenCode Server');
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
