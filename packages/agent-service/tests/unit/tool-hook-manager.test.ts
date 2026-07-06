import { describe, it, expect, beforeEach, vi } from 'vitest';
import { collabRoomManager } from '../../src/collab/collab-room-manager';
import { ToolHookManager } from '../../src/backends/managers/tool-hook-manager';
import type { AgentConfig, AgentEvent, FileChange } from '../../src/core/types';

vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(() => 'file content'),
}));

vi.mock('../../src/collab/collab-room-manager', () => ({
  collabRoomManager: {
    applyExternalFileChanges: vi.fn(() => ({ reloadedRooms: 0 })),
  },
}));

describe('ToolHookManager', () => {
  const config: AgentConfig = {
    sessionId: 'test-session',
    workingDir: '/tmp/workspace',
  };

  let events: AgentEvent[];
  let manager: ToolHookManager;

  beforeEach(() => {
    events = [];
    vi.mocked(collabRoomManager.applyExternalFileChanges).mockClear();
    manager = new ToolHookManager(config, (event) => events.push(event));
  });

  describe('getFileChangesForTool', () => {
    it('工具出错时不应返回文件变更', () => {
      const changes = manager.getFileChangesForTool('writeFile', { path: 'a.ts' }, true, {});
      expect(changes).toEqual([]);
    });

    it('writeFile 应产生 modified 变更且包含 content', () => {
      const changes = manager.getFileChangesForTool(
        'writeFile',
        { path: 'demos/page.tsx', content: 'export default 1' },
        false,
        {},
      );
      expect(changes).toEqual([
        { path: 'demos/page.tsx', action: 'modified', content: 'export default 1' },
      ]);
    });

    it('editFile 应产生 modified 变更但不包含 content', () => {
      const changes = manager.getFileChangesForTool(
        'editFile',
        { path: 'src/index.ts' },
        false,
        {},
      );
      expect(changes).toEqual([{ path: 'src/index.ts', action: 'modified' }]);
    });

    it('writeFile 缺少 path 时应返回空', () => {
      expect(manager.getFileChangesForTool('writeFile', {}, false, {})).toEqual([]);
    });

    it('sketch patch 工具应捕获真实变更并忽略 no-op patch', () => {
      expect(
        manager.getFileChangesForTool(
          'patchSketchScene',
          { pageId: 'page-1' },
          false,
          { details: { patch: { changed: true } } },
        ),
      ).toEqual([{ path: 'demos/page-1/sketch.scene.json', action: 'modified' }]);

      expect(
        manager.getFileChangesForTool(
          'patchSketchScene',
          { pageId: 'page-1' },
          false,
          { details: { patch: { changed: false } } },
        ),
      ).toEqual([]);
    });

    it('未识别的工具应返回空变更', () => {
      expect(manager.getFileChangesForTool('bash', { command: 'ls' }, false, {})).toEqual([]);
    });
  });

  describe('recordToolFileChange', () => {
    it('应将变更推入文件列表', () => {
      manager.recordToolFileChange(
        'writeFile',
        { path: 'a.ts', content: 'a' },
        false,
        {},
      );
      expect(manager.getFiles()).toHaveLength(1);
      expect(manager.getFiles()[0].path).toBe('a.ts');
    });

    it('应去重相同 path/action/content 的变更', () => {
      manager.recordToolFileChange('writeFile', { path: 'a.ts', content: 'a' }, false, {});
      manager.recordToolFileChange('writeFile', { path: 'a.ts', content: 'a' }, false, {});
      expect(manager.getFiles()).toHaveLength(1);
    });
  });

  describe('resetForNewMessage', () => {
    it('应清空文件列表和已发射的操作键', () => {
      manager.recordToolFileChange('writeFile', { path: 'a.ts', content: 'a' }, false, {});
      expect(manager.getFiles()).toHaveLength(1);
      manager.resetForNewMessage();
      expect(manager.getFiles()).toEqual([]);
    });
  });

  describe('handleToolResult', () => {
    it('应捕获文件变更并通过 onFileChanges 回调通知', () => {
      const collected: FileChange[] = [];
      manager.handleToolResult(
        'writeFile',
        { path: 'b.ts', content: 'b' },
        false,
        {},
        'session-1',
        { onFileChanges: (changes) => collected.push(...changes) },
      );
      expect(collected).toHaveLength(1);
      expect(manager.getFiles()).toHaveLength(1);
    });

    it('文件写入成功后应通知协同房间重载外部变更', () => {
      manager.handleToolResult(
        'writeFile',
        { path: 'demos/page-1/index.tsx', content: 'fixed' },
        false,
        {},
        'session-1',
      );

      expect(collabRoomManager.applyExternalFileChanges).toHaveBeenCalledWith(
        '/tmp/workspace',
        [{ path: 'demos/page-1/index.tsx', action: 'modified', content: 'fixed' }],
      );
    });

    it('no-op sketch patch 不应通知协同房间重载外部变更', () => {
      manager.handleToolResult(
        'patchSketchScene',
        { pageId: 'page-1' },
        false,
        { details: { patch: { changed: false } } },
        'session-1',
      );

      expect(manager.getFiles()).toEqual([]);
      expect(collabRoomManager.applyExternalFileChanges).not.toHaveBeenCalled();
    });

    it('readFile 知识库路径时应记录到 readKnowledgeFiles', () => {
      manager.handleToolResult(
        'readFile',
        { path: 'knowledge/rules.md' },
        false,
        {},
        'session-1',
      );
      expect(manager.getReadKnowledgeFiles().has('rules.md')).toBe(true);
    });
  });

  describe('updatePlanFromToolResult', () => {
    it('非 updatePlan 工具应忽略', () => {
      manager.updatePlanFromToolResult('writeFile', false, {}, 'session-1');
      expect(events).toHaveLength(0);
    });

    it('updatePlan 且 items 合法时应发射 plan 事件', () => {
      manager.updatePlanFromToolResult(
        'updatePlan',
        false,
        { details: { items: [
          { id: '1', title: '步骤一', status: 'completed' },
          { id: '2', title: '步骤二', status: 'pending' },
        ] } },
        'session-1',
      );
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('plan');
    });

    it('items 缺失或非法时应忽略', () => {
      manager.updatePlanFromToolResult('updatePlan', false, { details: {} }, 'session-1');
      expect(events).toHaveLength(0);
    });
  });
});
