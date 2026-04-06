import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { validatePath, validatePaths, safeResolvePath } from '../../src/session/session-guard';

describe('SessionGuard', () => {
  let workspaceDir: string;

  beforeEach(() => {
    workspaceDir = path.join(os.tmpdir(), 'test-workspace-guard', `workspace-${Date.now()}`);
    fs.mkdirSync(workspaceDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(workspaceDir)) {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  describe('validatePath', () => {
    it('应允许工作空间内的路径', () => {
      const result = validatePath(workspaceDir, 'src/index.ts');
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('应拒绝路径遍历攻击', () => {
      const result = validatePath(workspaceDir, '../outside-file.ts');
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it('应拒绝绝对路径指向工作空间外', () => {
      const outsidePath = path.join(os.tmpdir(), 'outside-workspace', 'file.ts');
      const result = validatePath(workspaceDir, outsidePath);
      expect(result.valid).toBe(false);
    });
  });

  describe('validatePaths', () => {
    it('应批量验证路径', () => {
      const paths = ['src/index.ts', 'lib/utils.ts', '../outside.ts'];
      const result = validatePaths(workspaceDir, paths);
      
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it('应通过所有有效路径', () => {
      const paths = ['src/index.ts', 'lib/utils.ts', 'README.md'];
      const result = validatePaths(workspaceDir, paths);
      
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('safeResolvePath', () => {
    it('应返回解析后的路径', () => {
      const resolved = safeResolvePath(workspaceDir, 'src/index.ts');
      expect(resolved).toBe(path.resolve(workspaceDir, 'src/index.ts'));
    });

    it('应在无效路径时抛出错误', () => {
      expect(() => safeResolvePath(workspaceDir, '../outside.ts')).toThrow();
    });
  });
});
