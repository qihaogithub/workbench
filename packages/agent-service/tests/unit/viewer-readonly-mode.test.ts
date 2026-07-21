import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Project } from '@workbench/shared/contracts';
import {
  buildViewerReadonlyContent,
  normalizeAgentMode,
  VIEWER_READONLY_PERMISSIONS,
} from '../../src/services/viewer-readonly-mode';

function createProject(workspacePath: string): Project {
  return {
    id: 'proj_viewer',
    name: '浏览端项目',
    description: '',
    workspacePath,
    demoPages: [],
    demoFolders: [],
    versions: [],
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('viewer-readonly mode', () => {
  it('normalizeAgentMode 只接受 viewer-readonly，其余一律回退 workbench', () => {
    expect(normalizeAgentMode('viewer-readonly')).toBe('viewer-readonly');
    expect(normalizeAgentMode('workbench')).toBe('workbench');
    expect(normalizeAgentMode(undefined)).toBe('workbench');
    expect(normalizeAgentMode('')).toBe('workbench');
    expect(normalizeAgentMode('admin')).toBe('workbench');
    expect(normalizeAgentMode(123)).toBe('workbench');
  });

  it('只读权限应禁止全部命令且不放行敏感文件', () => {
    expect(VIEWER_READONLY_PERMISSIONS?.deniedCommands).toEqual(['*']);
    expect(VIEWER_READONLY_PERMISSIONS?.allowedCommands).toEqual([]);
    expect(VIEWER_READONLY_PERMISSIONS?.deniedPatterns).toContain('**/*.env');
    expect(VIEWER_READONLY_PERMISSIONS?.deniedPatterns).toContain('**/.git/**');
    expect(VIEWER_READONLY_PERMISSIONS?.allowedPaths).toContain('demos/**');
    expect(VIEWER_READONLY_PERMISSIONS?.allowedPaths).toContain('knowledge/**');
  });

  it('buildViewerReadonlyContent 应拼接系统上下文与使用者问题', () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'viewer-readonly-mode-'),
    );
    try {
      fs.writeFileSync(
        path.join(tempDir, 'workspace-tree.json'),
        JSON.stringify({
          folders: [],
          pages: [{ id: 'home', name: '首页', order: 0, parentId: null }],
        }),
        'utf-8',
      );

      const content = buildViewerReadonlyContent(
        createProject(tempDir),
        { activePageId: 'home', activeConfig: { title: '标题值' } },
        '这个项目是做什么的？',
      );

      expect(content).toContain('浏览端项目');
      expect(content).toContain('当前页面：首页');
      expect(content).toContain('标题值');
      expect(content).toContain('## 当前使用者问题');
      expect(content).toContain('这个项目是做什么的？');
      expect(content.indexOf('[系统上下文结束]')).toBeLessThan(
        content.indexOf('## 当前使用者问题'),
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('viewerContext 缺省时仍能构建内容', () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'viewer-readonly-mode-'),
    );
    try {
      const content = buildViewerReadonlyContent(
        createProject(tempDir),
        undefined,
        '你好',
      );
      expect(content).toContain('## 当前使用者问题\n你好');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
