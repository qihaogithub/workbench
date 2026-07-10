import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventMapper } from '../../src/backends/managers/event-mapper';
import { ToolHookManager } from '../../src/backends/managers/tool-hook-manager';
import type { AgentConfig, AgentEvent } from '../../src/core/types';

describe('EventMapper', () => {
  const config: AgentConfig = {
    sessionId: 'test-session',
    workingDir: '/tmp/workspace',
  };

  let events: AgentEvent[];
  let toolHookManager: ToolHookManager;
  let mapper: EventMapper;
  let harness: any;

  beforeEach(() => {
    events = [];
    toolHookManager = new ToolHookManager(config);
    mapper = new EventMapper('test-session', (e) => events.push(e), toolHookManager);

    const handlers = new Map<string, (event: any) => any>();
    let subscriber: ((event: any) => void) | undefined;
    harness = {
      on: vi.fn((type: string, handler: (event: any) => any) => {
        handlers.set(type, handler);
        return vi.fn();
      }),
      subscribe: vi.fn((cb: (event: any) => void) => {
        subscriber = cb;
        return vi.fn();
      }),
      emit(event: any) {
        subscriber?.(event);
      },
    };
  });

  it('register 应调用 harness.subscribe 并返回取消函数', () => {
    const unsub = mapper.register(harness);
    expect(harness.subscribe).toHaveBeenCalledTimes(1);
    expect(typeof unsub).toBe('function');
    unsub();
  });

  it('message_update 的 text_delta 应映射为 stream 事件', () => {
    mapper.register(harness);
    harness.emit({
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', delta: 'hello' },
    });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('stream');
    expect((events[0] as any).content).toBe('hello');
  });

  it('message_update 的 thinking_delta 应映射为 thought 事件', () => {
    mapper.register(harness);
    harness.emit({
      type: 'message_update',
      assistantMessageEvent: { type: 'thinking_delta', delta: '思考中' },
    });
    expect(events[0].type).toBe('thought');
    expect((events[0] as any).content).toBe('思考中');
  });

  it('tool_execution_start 应映射为 tool_call 事件', () => {
    mapper.register(harness);
    harness.emit({
      type: 'tool_execution_start',
      toolCallId: 'tc_1',
      toolName: 'writeFile',
      args: { path: 'a.ts' },
    });
    expect(events[0].type).toBe('tool_call');
    expect((events[0] as any).toolCallId).toBe('tc_1');
    expect((events[0] as any).title).toBe('writeFile');
    expect((events[0] as any).status).toBe('in_progress');
  });

  it('真实形状的 tool_execution_end 不应承担文件变更捕获', () => {
    mapper.register(harness);
    harness.emit({
      type: 'tool_execution_end',
      toolCallId: 'tc_2',
      result: { content: 'done' },
    });
    expect(events).toHaveLength(0);
    expect(toolHookManager.getFiles()).toHaveLength(0);
  });

  it('tool_result 工具出错时应映射为 failed 状态', () => {
    mapper.register(harness);
    harness.emit({
      type: 'tool_result',
      toolCallId: 'tc_3',
      toolName: 'writeFile',
      input: { path: 'c.ts' },
      isError: true,
      content: '写入失败',
      details: { error: 'disk full' },
    });
    expect((events[0] as any).status).toBe('failed');
    expect((events[0] as any).error?.message).toBe('写入失败');
  });

  it('agent_end 应映射为 finish 事件', () => {
    mapper.register(harness);
    harness.emit({ type: 'agent_end' });
    expect(events[0].type).toBe('finish');
    expect((events[0] as any).result.success).toBe(true);
  });

  it('session_compact 应映射为 status 事件', () => {
    mapper.register(harness);
    harness.emit({ type: 'session_compact' });
    expect(events[0].type).toBe('status');
    expect((events[0] as any).status).toBe('processing');
  });

  it('save_point 事件应被忽略', () => {
    mapper.register(harness);
    harness.emit({ type: 'save_point' });
    expect(events).toHaveLength(0);
  });

  it('无 eventCallback 时应安全忽略所有事件', () => {
    const silentMapper = new EventMapper('test-session', undefined, toolHookManager);
    silentMapper.register(harness);
    expect(() => {
      harness.emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'x' } });
      harness.emit({ type: 'agent_end' });
    }).not.toThrow();
  });

  it('setSessionId 应更新后续事件的 sessionId', () => {
    mapper.register(harness);
    mapper.setSessionId('new-session');
    harness.emit({
      type: 'tool_execution_start',
      toolCallId: 'tc_4',
      toolName: 'bash',
      args: {},
    });
    expect((events[0] as any).sessionId).toBe('new-session');
  });
});
