import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { WorkspaceManager } from '../../src/workspace/workspace-manager';

describe('WorkspaceManager', () => {
  let manager: WorkspaceManager;
  const testTempDir = path.join(os.tmpdir(), 'test-workspace-manager');
  const userWorkspaceDir = path.join(os.tmpdir(), 'test-user-workspaces');

  beforeEach(() => {
    manager = new WorkspaceManager();
    (manager as unknown as { tempBaseDir: string }).tempBaseDir = testTempDir;

    if (!fs.existsSync(testTempDir)) {
      fs.mkdirSync(testTempDir, { recursive: true });
    }
    if (!fs.existsSync(userWorkspaceDir)) {
      fs.mkdirSync(userWorkspaceDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testTempDir)) {
      fs.rmSync(testTempDir, { recursive: true, force: true });
    }
    if (fs.existsSync(userWorkspaceDir)) {
      fs.rmSync(userWorkspaceDir, { recursive: true, force: true });
    }
  });

  describe('create', () => {
    it('应创建临时工作空间', async () => {
      const info = await manager.create({});

      expect(info.type).toBe('temp');
      expect(info.customWorkspace).toBe(false);
      expect(info.path).toContain('workbench-temp-');
      expect(fs.existsSync(info.path)).toBe(true);
    });

    it('应创建用户指定工作空间', async () => {
      const userPath = path.join(userWorkspaceDir, 'my-project');
      const info = await manager.create({
        workspace: userPath,
        customWorkspace: true,
      });

      expect(info.type).toBe('user');
      expect(info.customWorkspace).toBe(true);
      expect(info.path).toBe(path.resolve(userPath));
      expect(fs.existsSync(info.path)).toBe(true);
    });

    it('应自动推断 customWorkspace', async () => {
      const userPath = path.join(userWorkspaceDir, 'auto-project');
      const info = await manager.create({
        workspace: userPath,
      });

      expect(info.customWorkspace).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('应清理临时工作空间', async () => {
      const info = await manager.create({});
      expect(fs.existsSync(info.path)).toBe(true);

      await manager.cleanup(info.path);
      expect(fs.existsSync(info.path)).toBe(false);
    });

    it('不应清理用户工作空间', async () => {
      const userPath = path.join(userWorkspaceDir, 'user-project');
      const info = await manager.create({
        workspace: userPath,
        customWorkspace: true,
      });

      await manager.cleanup(info.path);
      expect(fs.existsSync(info.path)).toBe(true);
    });
  });

  describe('isTemporary', () => {
    it('应正确识别临时工作空间', async () => {
      const info = await manager.create({});
      expect(manager.isTemporary(info.path)).toBe(true);
    });

    it('应正确识别用户工作空间', async () => {
      const userPath = path.join(userWorkspaceDir, 'check-project');
      const info = await manager.create({
        workspace: userPath,
        customWorkspace: true,
      });
      expect(manager.isTemporary(info.path)).toBe(false);
    });
  });

  describe('getDisplayName', () => {
    it('应返回工作空间显示名称', async () => {
      const info = await manager.create({});
      expect(manager.getDisplayName(info.path)).toBe('workbench');
    });
  });
});
