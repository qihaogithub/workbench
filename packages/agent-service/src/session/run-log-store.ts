import fs from 'fs';
import path from 'path';

import { createEditorDiagnosticEvent, type EditorDiagnosticEvent } from '@workbench/shared';

import { AgentError, AgentEvent, AgentResult, RunSummary } from '../core/types';
import { logger } from '../utils/logger';
import { isPreviewObservationResult } from '@workbench/shared/demo/preview-observation';

export type RunLogLevel = 'info' | 'warn' | 'error';
export type RunLogSource = 'model' | 'tool' | 'subagent' | 'file' | 'system';

export interface AgentRunLogStartOptions {
  sessionId: string;
  messageId: string;
  conversationId?: string;
  runId?: string;
  assistantMessageId?: string;
  contentLength: number;
  workingDir?: string;
  demoId?: string;
  model?: string;
}

export type RunProjectionStatus = 'not_verified' | 'applied' | 'failed';

export interface AgentRunMetrics {
  runDurationMs: number;
  firstThoughtMs: number | null;
  firstToolMs: number | null;
  firstTextMs: number | null;
  finishMs: number;
  thoughtEventCount: number;
  thoughtCharCount: number;
  toolCallCount: number;
  toolResultCount: number;
  toolDurationSumMs: number;
  toolIntervalMs: number;
  capabilityActivationCount: number;
  capabilityActivationDurationMs: number;
  mutationCommitted: boolean;
  runtimeValidationOk: boolean | null;
  projectionStatus: RunProjectionStatus;
  model?: string;
  provider?: string;
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
  conversationId: string;
  runId: string;
  assistantMessageId: string;
  toolCallId?: string;
  payload?: unknown;
}

interface PendingLogEntry {
  line: RunLogEntry;
  diagnostic?: EditorDiagnosticEvent;
  droppable: boolean;
}

const LOG_FLUSH_INTERVAL_MS = 25;
const MAX_PENDING_LOG_ENTRIES = 256;

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

function redactPreviewInput(parameters: unknown): unknown {
  if (!isRecord(parameters)) return undefined;
  const target = isRecord(parameters.target) ? parameters.target : undefined;
  const assertions = Array.isArray(parameters.assertions)
    ? parameters.assertions
        .filter(isRecord)
        .slice(0, 32)
        .map((assertion) => ({
          type: typeof assertion.type === 'string' ? assertion.type : 'unknown',
        }))
    : [];
  return {
    pageId: typeof parameters.pageId === 'string' ? parameters.pageId : undefined,
    detail: typeof parameters.detail === 'string' ? parameters.detail : undefined,
    includeAncestors:
      typeof parameters.includeAncestors === 'boolean'
        ? parameters.includeAncestors
        : undefined,
    timeoutMs: nonNegativeFiniteNumber(parameters.timeoutMs),
    targetKind: target
      ? target.nodeId
        ? 'nodeId'
        : target.sourceFile
          ? 'source-location'
          : target.selectedElement === true
            ? 'selected-element'
            : 'unknown'
      : undefined,
    assertionTypes: assertions,
  };
}

function summarizePreviewDetails(details: unknown): unknown {
  if (!isPreviewObservationResult(details)) {
    return {
      availability: 'unavailable',
      readiness: 'partial',
      assertionStatus: 'not-requested',
      assertionTypes: [],
      evidence: { kind: 'runtime-structure', precision: 'layout' },
      reasons: ['observation-tool-error'],
    };
  }
  const identity = details.identity;
  const detailRecord = isRecord(details) ? details : undefined;
  const metrics = isRecord(detailRecord?._observationMetrics)
    ? detailRecord?._observationMetrics
    : undefined;
  return {
    availability: details.availability,
    readiness: details.readiness,
    identity: identity
      ? {
          schemaVersion: identity.schemaVersion,
          projectId: identity.projectId,
          workspaceId: identity.workspaceId,
          pageId: identity.pageId,
          runtimeType: identity.runtimeType,
          surface: identity.surface,
          previewInstanceId: identity.previewInstanceId,
          renderGeneration: identity.renderGeneration,
          revision: identity.revision,
          ...(identity.rootHash ? { rootHash: identity.rootHash } : {}),
        }
      : undefined,
    assertionStatus: details.assertionStatus,
    assertionTypes: details.assertions.slice(0, 32).map((assertion) => ({
      type: assertion.type,
      status: assertion.status,
    })),
    evidence: details.evidence,
    observedAt: details.observedAt,
    latencyMs: nonNegativeFiniteNumber(metrics?.latencyMs),
    payloadBytes: nonNegativeFiniteNumber(metrics?.payloadBytes),
    reasons: details.reasons?.slice(0, 16),
  };
}

function nonNegativeFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function resolveProviderId(model?: string): string | undefined {
  if (!model) return undefined;
  const separator = model.indexOf('/');
  return separator > 0 ? model.slice(0, separator) : undefined;
}

function calculateIntervalUnion(
  intervals: Array<{ startMs: number; endMs: number }>,
  finishAtMs: number,
): number {
  const sorted = intervals
    .map((interval) => ({
      startMs: interval.startMs,
      endMs: Math.max(interval.startMs, interval.endMs || finishAtMs),
    }))
    .sort((left, right) => left.startMs - right.startMs);
  if (sorted.length === 0) return 0;

  let unionStart = sorted[0].startMs;
  let unionEnd = sorted[0].endMs;
  let total = 0;
  for (const interval of sorted.slice(1)) {
    if (interval.startMs <= unionEnd) {
      unionEnd = Math.max(unionEnd, interval.endMs);
    } else {
      total += unionEnd - unionStart;
      unionStart = interval.startMs;
      unionEnd = interval.endMs;
    }
  }
  return Math.max(0, total + unionEnd - unionStart);
}

export class AgentRunLog {
  readonly filePath: string;

  private readonly sessionId: string;
  private readonly messageId: string;
  private readonly conversationId: string;
  private readonly runId: string;
  private readonly assistantMessageId: string;
  private streamLength = 0;
  private finishContentLength = 0;
  private toolResultCount = 0;
  private subagentResultCount = 0;
  private hasModelOutput = false;
  private toolNames = new Map<string, string>();
  private diagnosticSequence = 0;
  private readonly demoId?: string;
  private readonly workingDir?: string;
  private readonly model?: string;
  private pendingEntries: PendingLogEntry[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  private writeChain: Promise<void> = Promise.resolve();
  private droppedIncrementalEntries = 0;
  private readonly startedAtMs = Date.now();
  private firstThoughtMs: number | null = null;
  private firstToolMs: number | null = null;
  private firstTextMs: number | null = null;
  private thoughtEventCount = 0;
  private thoughtCharCount = 0;
  private toolCallCount = 0;
  private toolDurationSumMs = 0;
  private toolIntervals = new Map<string, { startMs: number; endMs: number }>();
  private capabilityActivationCount = 0;
  private capabilityActivationDurationMs = 0;
  private mutationCommitted = false;
  private runtimeValidationOk: boolean | null = null;
  private projectionStatus: RunProjectionStatus = 'not_verified';

  constructor(options: AgentRunLogStartOptions) {
    this.sessionId = options.sessionId;
    this.messageId = options.messageId;
    this.conversationId = options.conversationId || options.sessionId;
    this.runId = options.runId || options.messageId;
    this.assistantMessageId = options.assistantMessageId || options.messageId;
    this.demoId = options.demoId;
    this.workingDir = options.workingDir;
    this.model = options.model;

    const dir = path.join(getRunLogRoot(), safePathPart(options.sessionId));
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
      { sessionId: options.sessionId, messageId: options.messageId, runId: this.runId, conversationId: this.conversationId, logPath: this.filePath },
      'Agent run log created',
    );
  }

  recordAgentEvent(event: AgentEvent): void {
    const eventAtMs = Date.now();
    switch (event.type) {
      case 'stream':
        this.streamLength += event.content.length;
        if (!this.hasModelOutput && event.content.length > 0) {
          this.hasModelOutput = true;
          this.firstTextMs = Math.max(0, eventAtMs - this.startedAtMs);
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
        this.thoughtEventCount += 1;
        this.thoughtCharCount += event.content.length;
        if (this.firstThoughtMs === null && event.content.length > 0) {
          this.firstThoughtMs = Math.max(0, eventAtMs - this.startedAtMs);
        }
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
        this.toolCallCount += 1;
        if (this.firstToolMs === null) {
          this.firstToolMs = Math.max(0, eventAtMs - this.startedAtMs);
        }
        this.toolIntervals.set(event.toolCallId, {
          startMs: eventAtMs,
          endMs: eventAtMs,
        });
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
            parameters:
              event.title === 'observePreview'
                ? redactPreviewInput(event.parameters)
                : event.parameters,
          },
        });
        break;
      }

      case 'tool_call_update': {
        this.toolResultCount += 1;
        const durationMs = nonNegativeFiniteNumber(event.durationMs);
        const interval = this.toolIntervals.get(event.toolCallId);
        if (interval) {
          if (durationMs !== undefined) {
            interval.startMs = Math.min(interval.startMs, eventAtMs - durationMs);
          }
          interval.endMs = Math.max(interval.endMs, eventAtMs);
        } else {
          this.toolIntervals.set(event.toolCallId, {
            startMs: durationMs === undefined ? eventAtMs : eventAtMs - durationMs,
            endMs: eventAtMs,
          });
        }
        if (durationMs !== undefined) this.toolDurationSumMs += durationMs;
        this.observeToolDetails(event.details);
        const eventToolName = (event as unknown as { toolName?: unknown })
          .toolName;
        const toolName =
          typeof eventToolName === 'string'
            ? eventToolName
            : this.toolNames.get(event.toolCallId);
        const isSubagent = isSubagentTool(toolName);
        const isPreviewObservation = toolName === 'observePreview';
        if (isSubagent) this.subagentResultCount += 1;
        this.append({
          level: event.status === 'failed' ? 'error' : 'info',
          source: isSubagent ? 'subagent' : 'tool',
          eventType: 'tool_call_update',
          title: isSubagent ? 'Subagent task finished' : 'Tool call finished',
          summary: isPreviewObservation
            ? event.status === 'failed'
              ? 'Preview observation unavailable'
              : 'Preview observation recorded'
            : event.error?.message || event.content,
          toolCallId: event.toolCallId,
          payload: {
            toolName,
            status: event.status,
            content: isPreviewObservation ? undefined : event.content,
            result: isPreviewObservation ? undefined : event.result,
            details: isPreviewObservation
              ? summarizePreviewDetails(event.details)
              : event.details,
            durationMs: event.durationMs,
            // Observation failures can carry page/model-authored text in the
            // error message. Keep only a bounded code in the durable log.
            error: isPreviewObservation
              ? isRecord(event.error) &&
                typeof (event.error as Record<string, unknown>).code === 'string'
                ? {
                    code: String(
                      (event.error as Record<string, unknown>).code,
                    ).slice(0, 64),
                  }
                : undefined
              : event.error,
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

      case 'context_compacted':
        this.append({
          level: 'info',
          source: 'system',
          eventType: 'context_compacted',
          title: 'Conversation context compacted',
          summary: `reason=${event.reason}, tokensBefore=${event.tokensBefore}`,
          payload: {
            reason: event.reason,
            tokensBefore: event.tokensBefore,
            contextWindow: event.contextWindow,
            durationMs: event.durationMs,
          },
        });
        break;

      case 'capability_activation': {
        this.capabilityActivationCount += 1;
        const activationDurationMs = nonNegativeFiniteNumber(event.durationMs);
        if (activationDurationMs !== undefined) {
          this.capabilityActivationDurationMs += activationDurationMs;
        }
        this.append({
          level: event.status === 'failed' ? 'warn' : 'info',
          source: 'system',
          eventType: 'capability_activation',
          title: event.status === 'completed'
            ? 'Task capabilities activated'
            : 'Task capability activation failed',
          summary: `capabilities=${event.capabilities.join(',')}, tools=${event.previousActiveToolCount}->${event.activeToolCount}, durationMs=${event.durationMs}`,
          payload: {
            status: event.status,
            capabilityGroups: event.capabilities,
            previousActiveToolCount: event.previousActiveToolCount,
            activeToolCount: event.activeToolCount,
            durationMs: event.durationMs,
            errorMessage: event.error?.message,
          },
        });
        break;
      }

      case 'run_summary':
        this.observeRunSummary(event.runSummary);
        break;
    }
  }

  recordFinish(result: AgentResult): void {
    const finishAtMs = Date.now();
    this.finishContentLength = result.content?.length || 0;
    if (result.metadata?.runSummary) this.observeRunSummary(result.metadata.runSummary);
    const metrics = this.buildMetrics(finishAtMs);
    this.append({
      level: result.success && this.finishContentLength > 0 ? 'info' : result.success ? 'warn' : 'error',
      source: 'system',
      eventType: 'finish',
      title: 'AI run finished',
      summary: `durationMs=${metrics.runDurationMs}, stream=${this.streamLength}, finish=${this.finishContentLength}, tools=${this.toolResultCount}, subagents=${this.subagentResultCount}`,
      payload: {
        success: result.success,
        finishContentLength: this.finishContentLength,
        accumulatedStreamLength: this.streamLength,
        toolResultCount: this.toolResultCount,
        subagentResultCount: this.subagentResultCount,
        fileCount: result.files?.length || 0,
        metrics,
        error: result.error,
        metadata: result.metadata,
      },
    });
  }

  private observeToolDetails(details: unknown): void {
    if (!isRecord(details)) return;
    const receipt = details.receipt;
    if (isRecord(receipt) && receipt.committed === true) {
      this.mutationCommitted = true;
    }
    const runtimeValidation = details.runtimeValidation;
    if (!isRecord(runtimeValidation) || typeof runtimeValidation.ok !== 'boolean') return;
    this.runtimeValidationOk = this.runtimeValidationOk === false
      ? false
      : runtimeValidation.ok;
  }

  private observeRunSummary(summary: RunSummary): void {
    for (const projection of summary.projections) {
      if (projection.status === 'failed') {
        this.projectionStatus = 'failed';
      } else if (projection.status === 'applied' && this.projectionStatus !== 'failed') {
        this.projectionStatus = 'applied';
      }
    }
  }

  private buildMetrics(finishAtMs: number): AgentRunMetrics {
    const runDurationMs = Math.max(0, finishAtMs - this.startedAtMs);
    return {
      runDurationMs,
      firstThoughtMs: this.firstThoughtMs,
      firstToolMs: this.firstToolMs,
      firstTextMs: this.firstTextMs,
      finishMs: runDurationMs,
      thoughtEventCount: this.thoughtEventCount,
      thoughtCharCount: this.thoughtCharCount,
      toolCallCount: this.toolCallCount,
      toolResultCount: this.toolResultCount,
      toolDurationSumMs: this.toolDurationSumMs,
      toolIntervalMs: calculateIntervalUnion(
        Array.from(this.toolIntervals.values()),
        finishAtMs,
      ),
      capabilityActivationCount: this.capabilityActivationCount,
      capabilityActivationDurationMs: this.capabilityActivationDurationMs,
      mutationCommitted: this.mutationCommitted,
      runtimeValidationOk: this.runtimeValidationOk,
      projectionStatus: this.projectionStatus,
      model: this.model,
      provider: resolveProviderId(this.model),
    };
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

  recordContextRestore(input: {
    success: boolean;
    restoredMessageCount: number;
    durationMs: number;
    errorCode?: string;
  }): void {
    this.append({
      level: input.success ? 'info' : 'error',
      source: 'system',
      eventType: input.success ? 'context_restore_succeeded' : 'context_restore_failed',
      title: input.success ? 'Agent context restored' : 'Agent context restore failed',
      payload: {
        status: input.success ? 'succeeded' : 'failed',
        restoredMessageCount: input.restoredMessageCount,
        durationMs: input.durationMs,
        errorCode: input.errorCode,
      },
    });
  }

  /** Flush queued diagnostics before a run is discarded. */
  async drain(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    await this.flush();
    await this.writeChain;
  }

  private createDiagnosticEvent(line: RunLogEntry): EditorDiagnosticEvent | undefined {
    const eventTypeByRunLog: Record<string, string> = {
      run_start: 'ai.run_started',
      tool_call: 'ai.tool_call_started',
      tool_call_update: 'ai.tool_call_finished',
      finish: 'ai.run_finished',
      error: 'ai.run_failed',
      agent_error: 'ai.run_failed',
      cancel: 'ai.run_failed',
      context_restore_succeeded: 'ai.context_restore_succeeded',
      context_restore_failed: 'ai.context_restore_failed',
      capability_activation: 'ai.capability_activated',
    };
    const eventType = eventTypeByRunLog[line.eventType];
    if (!eventType) return undefined;

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
        runId: this.runId,
        conversationId: this.conversationId,
        assistantMessageId: this.assistantMessageId,
        toolCallId: line.toolCallId,
        demoId: this.demoId,
        workingDir: this.workingDir,
        model: this.model,
        errorMessage: line.level === 'error' ? line.summary || line.title : undefined,
      },
    });
    this.diagnosticSequence += 1;

    return diagnostic;
  }

  private append(entry: Omit<RunLogEntry, 'timestamp' | 'sessionId' | 'messageId' | 'conversationId' | 'runId' | 'assistantMessageId'>): void {
    const line: RunLogEntry = {
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      messageId: this.messageId,
      conversationId: this.conversationId,
      runId: this.runId,
      assistantMessageId: this.assistantMessageId,
      ...entry,
      payload: sanitizePayload(entry.payload),
    };

    const droppable = line.eventType === 'thought' || line.eventType === 'status';
    if (this.pendingEntries.length >= MAX_PENDING_LOG_ENTRIES) {
      const firstDroppable = this.pendingEntries.findIndex((item) => item.droppable);
      if (firstDroppable >= 0) {
        this.pendingEntries.splice(firstDroppable, 1);
        this.droppedIncrementalEntries += 1;
      } else if (droppable) {
        this.droppedIncrementalEntries += 1;
        return;
      }
    }
    this.pendingEntries.push({
      line,
      diagnostic: this.createDiagnosticEvent(line),
      droppable,
    });

    // Terminal and mutation-related events should begin flushing immediately,
    // without making the WebSocket event path wait on filesystem I/O.
    if (!droppable) {
      void this.flush();
      return;
    }
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      void this.flush();
    }, LOG_FLUSH_INTERVAL_MS);
    this.flushTimer.unref?.();
  }

  private async flush(): Promise<void> {
    if (this.pendingEntries.length === 0) return;
    const batch = this.pendingEntries.splice(0);
    const droppedIncrementalEntries = this.droppedIncrementalEntries;
    this.droppedIncrementalEntries = 0;

    this.writeChain = this.writeChain
      .catch(() => undefined)
      .then(async () => {
        try {
          await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true });
          const lines = batch.map((item) => JSON.stringify(item.line)).join('\n');
          await fs.promises.appendFile(this.filePath, `${lines}\n`, 'utf-8');

          const diagnostics = batch
            .map((item) => item.diagnostic)
            .filter((item): item is EditorDiagnosticEvent => Boolean(item));
          if (diagnostics.length > 0) {
            const diagnosticPath = getDiagnosticsJsonlPath();
            await fs.promises.mkdir(path.dirname(diagnosticPath), { recursive: true });
            await fs.promises.appendFile(
              diagnosticPath,
              `${diagnostics.map((item) => JSON.stringify(item)).join('\n')}\n`,
              'utf-8',
            );
          }
          if (droppedIncrementalEntries > 0) {
            logger.warn(
              { sessionId: this.sessionId, messageId: this.messageId, droppedIncrementalEntries },
              'Agent run log queue dropped incremental events',
            );
          }
        } catch (error) {
          logger.warn(
            { error, logPath: this.filePath },
            'Failed to flush agent run log queue',
          );
        }
      });
    await this.writeChain;
  }
}

export function createAgentRunLog(options: AgentRunLogStartOptions): AgentRunLog {
  return new AgentRunLog(options);
}
