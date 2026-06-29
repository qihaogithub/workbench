import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as path from 'path';
import { PermissionManager, isKnowledgeBasePath } from '../../src/backends/managers/permission-manager';
import type { AgentConfig, AgentEvent } from '../../src/core/types';

// 权限校验依赖文件系统路径判断，mock fs 避免依赖真实目录
vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(() => ''),
}));

describe('PermissionManager', () => {
  const config: AgentConfig = {
    sessionId: 'test-session',
    workingDir: '/tmp/workspace',
  };

  let events: AgentEvent[];
  let manager: PermissionManager;

  beforeEach(() => {
    events = [];
    manager = new PermissionManager(config, (event) => events.push(event));
  });

  describe('validateToolCall', () => {
    it('对未列入校验范围的工具应放行', () => {
      expect(manager.validateToolCall('bash', { command: 'ls' })).toBeUndefined();
      expect(manager.validateToolCall('saveImage', {})).toBeUndefined();
    });

    it('当路径在工作空间内时应放行 readFile', () => {
      expect(manager.validateToolCall('readFile', { path: 'src/index.ts' })).toBeUndefined();
    });

    it('当路径逃逸工作空间时应拦截 readFile', () => {
      const result = manager.validateToolCall('readFile', { path: '../secret.env' });
      expect(result).toEqual({
        block: true,
        reason: expect.stringContaining('Access denied'),
      });
    });

    it('应拦截写向知识库目录的 writeFile', () => {
      const result = manager.validateToolCall('writeFile', { path: 'knowledge/rules.md' });
      expect(result?.block).toBe(true);
    });

    it('应拦截写向知识库目录的 editFile', () => {
      const result = manager.validateToolCall('editFile', { path: 'knowledge/guide.md' });
      expect(result?.block).toBe(true);
    });

    it('对工作空间内普通文件的写操作应放行', () => {
      expect(manager.validateToolCall('writeFile', { path: 'demos/page.tsx' })).toBeUndefined();
    });
  });

  describe('requestPermission / resolvePermission', () => {
    it('应发出 permission_request 事件并等待 resolve', async () => {
      const promise = manager.requestPermission('call_1', { title: '删除页面 X' });

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('permission_request');

      manager.resolvePermission('call_1', true);
      await expect(promise).resolves.toBe(true);
    });

    it('resolve false 应使 promise 解析为 false', async () => {
      const promise = manager.requestPermission('call_2', { title: '删除页面 Y' });
      manager.resolvePermission('call_2', false);
      await expect(promise).resolves.toBe(false);
    });

    it('对未知 toolCallId resolve 应安全无副作用', () => {
      expect(() => manager.resolvePermission('unknown', true)).not.toThrow();
    });

    it('hasPendingPermissions 应反映等待状态', async () => {
      expect(manager.hasPendingPermissions()).toBe(false);
      const promise = manager.requestPermission('call_3', { title: '删除' });
      expect(manager.hasPendingPermissions()).toBe(true);
      manager.resolvePermission('call_3', true);
      await promise;
      expect(manager.hasPendingPermissions()).toBe(false);
    });
  });

  describe('requestPlanApproval', () => {
    it('应发出带 editable 的 permission_request 事件', async () => {
      const promise = manager.requestPlanApproval('plan_1', {
        title: '执行重构计划',
        planMarkdown: '# 计划\n1. 步骤一',
      });

      const event = events[0] as any;
      expect(event.type).toBe('permission_request');
      expect(event.permissionRequest.toolCall.approvalKind).toBe('plan_approval');
      expect(event.permissionRequest.toolCall.editable).toBe(true);

      manager.resolvePermission('plan_1', true, '# 修改后计划');
      const result = await promise;
      expect(result.approved).toBe(true);
      expect(result.planMarkdown).toBe('# 修改后计划');
    });
  });
});

describe('isKnowledgeBasePath', () => {
  it('应识别 knowledge/ 前缀路径', () => {
    expect(isKnowledgeBasePath('knowledge/rules.md', '/tmp/ws')).toBe(true);
    expect(isKnowledgeBasePath('knowledge', '/tmp/ws')).toBe(true);
  });

  it('应识别绝对路径下的 knowledge 目录', () => {
    expect(isKnowledgeBasePath(path.resolve('/tmp/ws', 'knowledge/guide.md'), '/tmp/ws')).toBe(true);
  });

  it('不应误判普通目录', () => {
    expect(isKnowledgeBasePath('demos/page.tsx', '/tmp/ws')).toBe(false);
    expect(isKnowledgeBasePath('src/index.ts', '/tmp/ws')).toBe(false);
  });
});
