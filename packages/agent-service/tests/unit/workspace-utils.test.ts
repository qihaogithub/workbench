import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import {
  isTemporaryWorkspace,
  getWorkspaceDisplayName,
  getLastDirectoryName,
  normalizeWorkspacePath,
  getSystemTempDir,
  generateTempWorkspaceName,
  isPathInsideWorkspace,
  resolveWorkspacePath,
} from '../../src/workspace/utils';

describe('Workspace Utils', () => {
  const tempBaseDir = path.join(os.tmpdir(), 'test-workspaces');

  beforeEach(() => {
    if (!fs.existsSync(tempBaseDir)) {
      fs.mkdirSync(tempBaseDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(tempBaseDir)) {
      fs.rmSync(tempBaseDir, { recursive: true, force: true });
    }
  });

  describe('isTemporaryWorkspace', () => {
    it('应识别临时工作空间', () => {
      const tempPath = path.join(tempBaseDir, 'workbench-temp-123456');
      expect(isTemporaryWorkspace(tempPath, tempBaseDir)).toBe(true);
    });

    it('应识别用户工作空间', () => {
      const userPath = '/home/user/my-project';
      expect(isTemporaryWorkspace(userPath, tempBaseDir)).toBe(false);
    });
  });

  describe('getWorkspaceDisplayName', () => {
    it('应从临时目录名提取显示名称', () => {
      const tempPath = path.join(tempBaseDir, 'workbench-temp-123456');
      expect(getWorkspaceDisplayName(tempPath)).toBe('workbench');
    });

    it('应返回普通目录的最后一级名称', () => {
      const userPath = '/home/user/my-project';
      expect(getWorkspaceDisplayName(userPath)).toBe('my-project');
    });
  });

  describe('getLastDirectoryName', () => {
    it('应返回路径的最后一级目录名', () => {
      expect(getLastDirectoryName('/home/user/my-project')).toBe('my-project');
    });

    it('应处理尾部斜杠', () => {
      expect(getLastDirectoryName('/home/user/my-project/')).toBe('my-project');
    });
  });

  describe('normalizeWorkspacePath', () => {
    it('应规范化路径', () => {
      const normalized = normalizeWorkspacePath('./test/../project');
      expect(normalized).not.toContain('..');
    });
  });

  describe('getSystemTempDir', () => {
    it('应返回系统临时目录下的 workbench-workspaces 目录', () => {
      const tempDir = getSystemTempDir();
      expect(tempDir).toContain('workbench-workspaces');
    });
  });

  describe('generateTempWorkspaceName', () => {
    it('应生成包含 workbench 前缀的临时目录名', () => {
      const name = generateTempWorkspaceName();
      expect(name).toContain('workbench');
      expect(name).toContain('-temp-');
    });
  });

  describe('isPathInsideWorkspace', () => {
    it('应识别工作空间内的路径', () => {
      const workspace = '/home/user/project';
      const target = '/home/user/project/src/index.ts';
      expect(isPathInsideWorkspace(target, workspace)).toBe(true);
    });

    it('应拒绝工作空间外的路径', () => {
      const workspace = '/home/user/project';
      const target = '/home/user/other-project/index.ts';
      expect(isPathInsideWorkspace(target, workspace)).toBe(false);
    });

    it('应检测路径遍历攻击', () => {
      const workspace = '/home/user/project';
      const target = '/home/user/project/../other-project/index.ts';
      expect(isPathInsideWorkspace(target, workspace)).toBe(false);
    });
  });

  describe('resolveWorkspacePath', () => {
    it('应正确解析相对路径', () => {
      const workspace = '/home/user/project';
      const relativePath = 'src/index.ts';
      const resolved = resolveWorkspacePath(workspace, relativePath);
      expect(resolved).toBe(path.resolve(workspace, relativePath));
    });

    it('应拒绝路径遍历攻击', () => {
      const workspace = '/home/user/project';
      const maliciousPath = '../other-project/index.ts';
      expect(() => resolveWorkspacePath(workspace, maliciousPath)).toThrow();
    });
  });
});
