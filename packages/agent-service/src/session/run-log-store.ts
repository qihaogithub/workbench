import fs from 'fs';
import path from 'path';

import { createEditorDiagnosticEvent, type EditorDiagnosticEvent } from '@opencode-workbench/shared';

import { AgentError, AgentEvent, AgentResult } from '../core/types';
import { logger } from '../utils/logger';

export type RunLogLevel = 'info' | 'warn' | 'error';
export type RunLogSource = 'model' | 'tool' | 'subagent' | 'file' | 'system';

export interface AgentRunLogStartOptions {
  sessionId: string;
  messageId: string;
  contentLength: number;
  workingDir?: string;
  demoId?: string;
  model?: string;
}

interface RunLogEntry {
  timestamp: string;
  level: RunLogLevel;
  source: RunLogSource;
  eventType: string;
  title: string;
  summary?: string;
  sessionId: string;
  messageId: string;
  toolCallId?: string;
  payload?: unknown;
}

function findProjectRoot(cwd: string): string {
  let current = path.resolve(cwd);
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, 'pnpm-workspace.yaml'))) {
      return current;
    }
    current = path.dirname(current);
  }
  return cwd;
}

function getRunLogRoot(): string {
  return (
    process.env.AGENT_RUN_LOG_DIR ||
    path.join(
      process.env.DATA_DIR || path.join(findProjectRoot(process.cwd()), 'data'),
      'agent-run-logs',
    )
  );
}

function getDiagnosticsJsonlPath(): string {
  const root = process.env.DATA_DIR || path.join(findProjectRoot(process.cwd()), 'data');
  return path.join(root, 'editor-diagnostics', 'agent-service.jsonl');
}

function safePathPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 160) || 'unknown';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizePayload(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[MaxDepth]';
  if (typeof value === 'string') {
    return value.length > 4000 ? `${value.slice(0, 4000)}\n...[truncated]` : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizePayload(item, depth + 1));
  }
  if (!isRecord(value)) return value;

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const lower = key.toLowerCase();
    if (
      lower.includes('apikey') ||
      lower.includes('api_key') ||
      lower.includes('token') ||
      lower.includes('authorization') ||
      lower.includes('password') ||
      lower.includes('secret')
    ) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = sanitizePayload(item, depth + 1);
    }
  }
  return result;
}

function isSubagentTool(toolName?: string): boolean {
  const name = (toolName || '').toLowerCase();
  return name.includes('delegatetask') || name.includes('subagent');
}

function getToolTask(parameters: unknown): string | undefined {
  return isRecord(parameters) && typeof parameters.task === 'string'
    ? parameters.task
    : undefined;
}

export class AgentRunLog {
  readonly filePath: string;

  private readonly sessionId: string;
  private readonly messageId: string;
  private streamLength = 0;
  private finishContentLength = 0;
  private toolResultCount = 0;
  private subagentResultCount = 0;
  private fileOperationCount = 0;
  private hasModelOutput = false;
  private toolNames = new Map<string, string>();
  private diagnosticSequence = 0;
  private readonly demoId?: string;
  private readonly workingDir?: string;
  private readonly model?: string;

  constructor(options: AgentRunLogStartOptions) {
    this.sessionId = options.sessionId;
    this.messageId = options.messageId;
    this.demoId = options.demoId;
    this.workingDir = options.workingDir;
    this.model = options.model;

    const dir = path.join(getRunLogRoot(), safePathPart(options.sessionId));
    fs.mkdirSync(dir, { recursive: true });
    this.filePath = path.join(dir, `${safePathPart(options.messageId)}.jsonl`);

    this.append({
      level: 'info',
      source: 'system',
      eventType: 'run_start',
      title: 'AI run started',
      payload: {
        contentLength: options.contentLength,
        workingDir: options.workingDir,
        demoId: options.demoId,
        model: options.model,
        logPath: this.filePath,
      },
    });

    logger.info(
      { sessionId: options.sessionId, messageId: options.messageId, logPath: this.filePath },
      'Agent run log created',
    );
  }

  recordAgentEvent(event: AgentEvent): void {
    switch (event.type) {
      case 'stream':
        this.streamLength += event.content.length;
        if (!this.hasModelOutput && event.content.length > 0) {
          this.hasModelOutput = true;
          this.append({
            level: 'info',
            source: 'model',
            eventType: 'stream_start',
            title: 'Model output started',
            summary: `firstChunkLength=${event.content.length}`,
            payload: { firstChunkLength: event.content.length },
          });
        }
        break;

      case 'thought':
        this.append({
          level: 'info',
          source: 'model',
          eventType: 'thought',
          title: 'Model thought event',
          summary: `contentLength=${event.content.length}`,
          payload: { contentLength: event.content.length, done: event.done },
        });
        break;

      case 'tool_call': {
        this.toolNames.set(event.toolCallId, event.title);
        const isSubagent = isSubagentTool(event.title);
        this.append({
          level: 'info',
          source: isSubagent ? 'subagent' : 'tool',
          eventType: 'tool_call',
          title: isSubagent ? 'Subagent task started' : `Tool call: ${event.title}`,
          summary: getToolTask(event.parameters),
          toolCallId: event.toolCallId,
          payload: {
            toolName: event.title,
            kind: event.kind,
            status: event.status,
            parameters: event.parameters,
          },
        });
        break;
      }

      case 'tool_call_update': {
        this.toolResultCount += 1;
        const toolName = this.toolNames.get(event.toolCallId);
        const isSubagent = isSubagentTool(toolName);
        if (isSubagent) this.subagentResultCount += 1;
        this.append({
          level: event.status === 'failed' ? 'error' : 'info',
          source: isSubagent ? 'subagent' : 'tool',
          eventType: 'tool_call_update',
          title: isSubagent ? 'Subagent task finished' : 'Tool call finished',
          summary: event.error?.message || event.content,
          toolCallId: event.toolCallId,
          payload: {
            toolName,
            status: event.status,
            content: event.content,
            result: event.result,
            details: event.details,
            durationMs: event.durationMs,
            error: event.error,
          },
        });
        break;
      }

      case 'permission_request':
        this.append({
          level: 'warn',
          source: 'system',
          eventType: 'permission_request',
          title: 'Permission requested',
          toolCallId: event.permissionRequest.toolCall.toolCallId,
          payload: event.permissionRequest,
        });
        break;

      case 'user_choice_request':
        this.append({
          level: 'info',
          source: 'system',
          eventType: 'user_choice_request',
          title: 'User choice requested',
          payload: event.userChoiceRequest,
        });
        break;

      case 'file_operation':
        this.fileOperationCount += 1;
        this.append({
          level: 'info',
          source: 'file',
          eventType: 'file_operation',
          title: event.fileOperation.path
            ? `File operation: ${event.fileOperation.path}`
            : 'File operation',
          summary: event.fileOperation.method,
          payload: {
            method: event.fileOperation.method,
            path: event.fileOperation.path,
            contentLength: event.fileOperation.content?.length,
          },
        });
        break;

      case 'plan':
        this.append({
          level: 'info',
          source: 'system',
          eventType: 'plan',
          title: 'Plan event',
          summary: `contentLength=${event.content.length}`,
          payload: { contentLength: event.content.length },
        });
        break;

      case 'error':
        this.recordError(event.error, 'agent_error');
        break;

      case 'status':
        this.append({
          level: 'info',
          source: 'system',
          eventType: 'status',
          title: `Agent status: ${event.status}`,
          payload: { status: event.status },
        });
        break;
    }
  }

  recordFinish(result: AgentResult): void {
    this.finishContentLength = result.content?.length || 0;
    this.append({
      level: result.success && this.finishContentLength > 0 ? 'info' : result.success ? 'warn' : 'error',
      source: 'system',
      eventType: 'finish',
      title: 'AI run finished',
      summary: `stream=${this.streamLength}, finish=${this.finishContentLength}, tools=${this.toolResultCount}, subagents=${this.subagentResultCount}`,
      payload: {
        success: result.success,
        finishContentLength: this.finishContentLength,
        accumulatedStreamLength: this.streamLength,
        toolResultCount: this.toolResultCount,
        subagentResultCount: this.subagentResultCount,
        fileOperationCount: this.fileOperationCount,
        fileCount: result.files?.length || 0,
        error: result.error,
        metadata: result.metadata,
      },
    });
  }

  recordError(error: AgentError | { code?: string; message?: string; details?: unknown }, eventType = 'error'): void {
    this.append({
      level: 'error',
      source: 'system',
      eventType,
      title: error.message || 'AI run error',
      payload: error,
    });
  }

  recordCancel(): void {
    this.append({
      level: 'warn',
      source: 'system',
      eventType: 'cancel',
      title: 'AI run cancelled',
    });
  }

  private appendDiagnosticEvent(line: RunLogEntry): void {
    const eventTypeByRunLog: Record<string, string> = {
      run_start: 'ai.run_started',
      tool_call: 'ai.tool_call_started',
      tool_call_update: 'ai.tool_call_finished',
      file_operation: 'ai.file_change_detected',
      finish: 'ai.run_finished',
      error: 'ai.run_failed',
      agent_error: 'ai.run_failed',
      cancel: 'ai.run_failed',
    };
    const eventType = eventTypeByRunLog[line.eventType];
    if (!eventType) return;

    const diagnostic: EditorDiagnosticEvent = createEditorDiagnosticEvent({
      id: `ai-${this.sessionId}-${this.messageId}-${this.diagnosticSequence}`,
      ts: line.timestamp,
      source: 'ai-run',
      level: line.level,
      eventGroup: 'ai',
      eventType,
      sessionId: this.sessionId,
      operationId: this.messageId,
      traceId: this.messageId,
      message: line.title,
      payload: {
        ...(line.payload && typeof line.payload === 'object'
          ? line.payload as Record<string, unknown>
          : {}),
        messageId: this.messageId,
        runId: this.messageId,
        toolCallId: line.toolCallId,
        demoId: this.demoId,
        workingDir: this.workingDir,
        model: this.model,
        errorMessage: line.level === 'error' ? line.summary || line.title : undefined,
      },
    });
    this.diagnosticSequence += 1;

    const filePath = getDiagnosticsJsonlPath();
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.appendFileSync(filePath, `${JSON.stringify(diagnostic)}\n`, 'utf-8');
    } catch (error) {
      logger.warn({ error, filePath }, 'Failed to append agent diagnostic event');
    }
  }

  private append(entry: Omit<RunLogEntry, 'timestamp' | 'sessionId' | 'messageId'>): void {
    const line: RunLogEntry = {
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      messageId: this.messageId,
      ...entry,
      payload: sanitizePayload(entry.payload),
    };

    try {
      fs.appendFileSync(this.filePath, `${JSON.stringify(line)}\n`, 'utf-8');
    } catch (error) {
      logger.warn({ error, logPath: this.filePath }, 'Failed to append agent run log');
    }
    this.appendDiagnosticEvent(line);
  }
}

export function createAgentRunLog(options: AgentRunLogStartOptions): AgentRunLog {
  return new AgentRunLog(options);
}
