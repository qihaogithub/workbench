import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BaseAgent } from '../../src/core/agent';
import { AgentConfig, AgentEvent, AgentResult } from '../../src/core/types';
import { ServerMessage, WebSocketEventRouter } from '../../src/routes/ws-event-router';

class TestAgent extends BaseAgent {
  constructor(config: AgentConfig) {
    super(config);
  }

  async start(): Promise<void> {
    return undefined;
  }

  async sendMessage(): Promise<AgentResult> {
    return { success: true, content: '' };
  }

  cancel(): void {
    return undefined;
  }

  async kill(): Promise<void> {
    return undefined;
  }

  updateConfig(): void {
    return undefined;
  }

  fire(event: AgentEvent): void {
    this.emit(event.type, event);
  }
}

describe('WebSocketEventRouter', () => {
  let tempLogDir: string;
  let tempDataDir: string;
  let originalRunLogDir: string | undefined;
  let originalDataDir: string | undefined;

  beforeEach(() => {
    originalRunLogDir = process.env.AGENT_RUN_LOG_DIR;
    originalDataDir = process.env.DATA_DIR;
    tempLogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-run-logs-'));
    tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-diagnostics-data-'));
    process.env.AGENT_RUN_LOG_DIR = tempLogDir;
    process.env.DATA_DIR = tempDataDir;
  });

  afterEach(() => {
    if (originalRunLogDir === undefined) {
      delete process.env.AGENT_RUN_LOG_DIR;
    } else {
      process.env.AGENT_RUN_LOG_DIR = originalRunLogDir;
    }
    if (originalDataDir === undefined) {
      delete process.env.DATA_DIR;
    } else {
      process.env.DATA_DIR = originalDataDir;
    }
    fs.rmSync(tempLogDir, { recursive: true, force: true });
    fs.rmSync(tempDataDir, { recursive: true, force: true });
  });

  it('应完整转发工具调用入参、结果详情、耗时和错误信息', () => {
    const messages: ServerMessage[] = [];
    const router = new WebSocketEventRouter('session-1', (message) => {
      messages.push(message);
    });
    const agent = new TestAgent({ sessionId: 'session-1' });

    router.bindAgent(agent);
    router.startMessage('message-1');

    agent.fire({
      type: 'tool_call',
      sessionId: 'session-1',
      toolCallId: 'delegate-1',
      status: 'in_progress',
      title: 'delegateTask',
      kind: 'execute',
      parameters: { task: '检查重复页面', context: '当前项目' },
    });
    agent.fire({
      type: 'tool_call_update',
      sessionId: 'session-1',
      toolCallId: 'delegate-1',
      status: 'completed',
      content: '发现 2 个重复页面',
      result: { content: '发现 2 个重复页面' },
      details: {
        success: true,
        files: [{ path: 'workspace-tree.json', action: 'modified' }],
      },
      durationMs: 1234,
    });
    agent.fire({
      type: 'tool_call_update',
      sessionId: 'session-1',
      toolCallId: 'delegate-2',
      status: 'failed',
      error: { message: 'Subagent timed out' },
      details: { success: false, error: 'Subagent timed out' },
      durationMs: 5000,
    });

    expect(messages).toEqual([
      expect.objectContaining({
        type: 'tool_call',
        id: 'message-1',
        toolCallId: 'delegate-1',
        parameters: { task: '检查重复页面', context: '当前项目' },
      }),
      expect.objectContaining({
        type: 'tool_call_update',
        id: 'message-1',
        toolCallId: 'delegate-1',
        content: '发现 2 个重复页面',
        result: { content: '发现 2 个重复页面' },
        details: {
          success: true,
          files: [{ path: 'workspace-tree.json', action: 'modified' }],
        },
        durationMs: 1234,
      }),
      expect.objectContaining({
        type: 'tool_call_update',
        id: 'message-1',
        toolCallId: 'delegate-2',
        error: { message: 'Subagent timed out' },
        details: { success: false, error: 'Subagent timed out' },
        durationMs: 5000,
      }),
    ]);
  });

  it('应在转发 Agent 事件时通知活动回调', () => {
    const activities: AgentEvent[] = [];
    const router = new WebSocketEventRouter(
      'session-1',
      () => undefined,
      (event) => activities.push(event),
    );
    const agent = new TestAgent({ sessionId: 'session-1' });

    router.bindAgent(agent);
    router.startMessage('message-1');

    const thoughtEvent: AgentEvent = {
      type: 'thought',
      sessionId: 'session-1',
      content: 'still working',
      done: false,
    };
    agent.fire(thoughtEvent);

    expect(activities).toEqual([thoughtEvent]);
  });

  it('应转发用户单选确认请求', () => {
    const messages: ServerMessage[] = [];
    const router = new WebSocketEventRouter('session-1', (message) => {
      messages.push(message);
    });
    const agent = new TestAgent({ sessionId: 'session-1' });

    router.bindAgent(agent);
    router.startMessage('message-1');

    agent.fire({
      type: 'user_choice_request',
      sessionId: 'session-1',
      userChoiceRequest: {
        requestId: 'choice-1',
        sessionId: 'session-1',
        question: '选择布局？',
        options: [
          { optionId: 'option_1', label: '左右布局' },
          { optionId: 'option_2', label: '上下布局' },
        ],
        allowCustom: true,
      },
    });

    expect(messages).toEqual([
      expect.objectContaining({
        type: 'user_choice_request',
        id: 'message-1',
        sessionId: 'session-1',
        userChoiceRequest: expect.objectContaining({
          requestId: 'choice-1',
          question: '选择布局？',
        }),
      }),
    ]);
  });

  it('应将本轮执行事件保存到 JSONL 日志文件', () => {
    const router = new WebSocketEventRouter('session-1', () => undefined);
    const agent = new TestAgent({ sessionId: 'session-1' });

    router.bindAgent(agent);
    router.startMessage('message-1', {
      contentLength: 8,
      workingDir: '/tmp/workspace',
      demoId: 'demo-1',
      model: 'deepseek-v4-pro',
    });

    agent.fire({
      type: 'stream',
      sessionId: 'session-1',
      content: 'hello',
      done: false,
    });
    agent.fire({
      type: 'tool_call',
      sessionId: 'session-1',
      toolCallId: 'delegate-1',
      status: 'in_progress',
      title: 'delegateTask',
      kind: 'execute',
      parameters: { task: '检查页面', apiKey: 'secret-key' },
    });
    agent.fire({
      type: 'tool_call_update',
      sessionId: 'session-1',
      toolCallId: 'delegate-1',
      status: 'completed',
      details: {
        success: true,
        content: '完成',
        files: [{ path: 'workspace-tree.json', action: 'modified' }],
        durationMs: 1200,
      },
      durationMs: 1200,
    });
    router.recordFinish({
      success: true,
      content: '',
      files: [{ path: 'workspace-tree.json', action: 'modified' }],
    });

    const logPath = path.join(tempLogDir, 'session-1', 'message-1.jsonl');
    const entries = fs
      .readFileSync(logPath, 'utf-8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));

    expect(entries.map((entry) => entry.eventType)).toEqual([
      'run_start',
      'stream_start',
      'tool_call',
      'tool_call_update',
      'finish',
    ]);
    expect(entries[2]).toEqual(
      expect.objectContaining({
        source: 'subagent',
        title: 'Subagent task started',
        summary: '检查页面',
      }),
    );
    expect(entries[2].payload.parameters.apiKey).toBe('[REDACTED]');
    expect(entries[4].payload).toEqual(
      expect.objectContaining({
        finishContentLength: 0,
        accumulatedStreamLength: 5,
        toolResultCount: 1,
        subagentResultCount: 1,
        fileCount: 1,
      }),
    );

    const diagnosticPath = path.join(tempDataDir, 'editor-diagnostics', 'agent-service.jsonl');
    const diagnostics = fs
      .readFileSync(diagnosticPath, 'utf-8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));

    expect(diagnostics.map((entry) => entry.eventType)).toEqual([
      'ai.run_started',
      'ai.tool_call_started',
      'ai.tool_call_finished',
      'ai.run_finished',
    ]);
    expect(diagnostics[1].payload).toEqual(
      expect.objectContaining({
        messageId: 'message-1',
        runId: 'message-1',
        toolCallId: 'delegate-1',
        toolName: 'delegateTask',
        status: 'in_progress',
      }),
    );
    expect(diagnostics[1].payload.parameters).toBeUndefined();
  });
});
