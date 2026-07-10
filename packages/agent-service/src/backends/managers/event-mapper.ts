import type { AgentEvent } from '../../core/types';
import {
  getToolResultContent,
  getToolResultDetails,
  getToolResultPayload,
} from './assistant-text-utils';
import type { ToolHookManager } from './tool-hook-manager';

/**
 * 事件映射器
 *
 * 将 AgentHarness 的底层事件映射为应用层 AgentEvent，
 * 委托 ToolHookManager 处理工具结果中的文件变更和计划更新。
 */
export class EventMapper {
  constructor(
    private sessionId: string,
    private eventCallback: ((event: AgentEvent) => void) | undefined,
    private toolHookManager: ToolHookManager,
  ) {}

  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  setEventCallback(callback: ((event: AgentEvent) => void) | undefined): void {
    this.eventCallback = callback;
  }

  /**
   * 注册 harness.subscribe 监听，返回取消订阅函数。
   */
  register(harness: any): () => void {
    const unsub = harness.subscribe((event: any) => {
      if (!this.eventCallback) return;

      const sessionId = this.sessionId;

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
              files: this.toolHookManager.getFiles().length > 0 ? this.toolHookManager.getFiles() : undefined,
            },
          });
          break;

        // 底层 Agent loop 工具开始事件
        case 'tool_execution_start':
          this.eventCallback({
            type: 'tool_call',
            sessionId,
            toolCallId: event.toolCallId,
            status: 'in_progress',
            title: event.toolName,
            kind: 'execute',
            parameters: event.args,
          });
          break;

        case 'tool_execution_end': {
          const details = getToolResultDetails(event);
          // pi-agent-core 的底层 tool_execution_end 只保证 toolCallId + result，
          // 不保证携带 toolName / input。文件变更必须由随后带完整参数的
          // AgentHarness tool_result 钩子处理，否则 editFile 虽写入成功，
          // 前端却收不到 file_operation，旧的内存快照会再次覆盖磁盘文件。
          if (typeof event.toolName === 'string') {
            this.emitToolCallUpdate(event.toolCallId, event.toolName, event.isError, event, details);
          }
          break;
        }

        // 工具调用（来自 AgentHarness 自有事件）
        case 'tool_call':
          this.eventCallback({
            type: 'tool_call',
            sessionId,
            toolCallId: event.toolCallId,
            status: 'in_progress',
            title: event.toolName,
            kind: 'execute',
            parameters: event.input ?? event.arguments ?? event.parameters,
          });
          break;

        // 工具结果（来自 AgentHarness 自有事件）
        case 'tool_result': {
          const details = getToolResultDetails(event);
          this.toolHookManager.updatePlanFromToolResult(event.toolName, event.isError, event, sessionId);
          this.emitToolCallUpdate(event.toolCallId, event.toolName, event.isError, event, details);
          break;
        }

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
    return unsub;
  }

  private emitToolCallUpdate(
    toolCallId: string,
    toolName: string,
    isError: boolean,
    event: any,
    details: any,
  ): void {
    if (!this.eventCallback) return;

    this.eventCallback({
      type: 'tool_call_update',
      sessionId: this.sessionId,
      toolCallId,
      status: isError ? 'failed' : 'completed',
      content: getToolResultContent(event),
      result: getToolResultPayload(event),
      details,
      durationMs: typeof details?.durationMs === 'number' ? details.durationMs : undefined,
      error: isError
        ? {
            message:
              getToolResultContent(event) ||
              (typeof details?.error === 'string' ? details.error : undefined) ||
              'Tool execution failed',
          }
        : undefined,
    });
  }
}
