import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createReadFileTool, createWriteFileTool, createListFilesTool } from '../../src/backends/pi-tools/file-tools';
import { createBashTool } from '../../src/backends/pi-tools/bash-tool';
import type { AgentConfig } from '../../src/core/types';

vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    readdir: vi.fn(),
  },
}));

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

const mockConfig: AgentConfig = {
  sessionId: 'test',
  workingDir: '/tmp/test-workspace',
};

describe('createReadFileTool - 权限感知', () => {
  it('白名单内文件应正常读取', async () => {
    (fs.promises.readFile as any).mockResolvedValue('content');
    const tool = createReadFileTool(mockConfig);
    const result = await tool.execute('id', { path: 'demos/home/index.tsx' } as any);
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toBe('content');
  });

  it('黑名单中 .env 应被拒（isError）', async () => {
    const tool = createReadFileTool(mockConfig);
    const result = await tool.execute('id', { path: '.env' } as any);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not allowed');
  });

  it('packages 越界访问应被拒', async () => {
    const tool = createReadFileTool(mockConfig);
    const result = await tool.execute('id', { path: 'packages/agent-service/src/foo.ts' } as any);
    expect(result.isError).toBe(true);
  });

  it('.. 越界访问应被拒', async () => {
    const tool = createReadFileTool(mockConfig);
    const result = await tool.execute('id', { path: '../escape.ts' } as any);
    expect(result.isError).toBe(true);
  });
});

describe('createWriteFileTool - 权限感知', () => {
  it('白名单内文件应正常写入', async () => {
    (fs.promises.mkdir as any).mockResolvedValue(undefined);
    (fs.promises.writeFile as any).mockResolvedValue(undefined);
    const tool = createWriteFileTool(mockConfig);
    const result = await tool.execute('id', { path: 'workspace-tree.json', content: '{}' } as any);
    expect(result.isError).toBeFalsy();
  });

  it('.workspace.json 黑名单应被拒', async () => {
    const tool = createWriteFileTool(mockConfig);
    const result = await tool.execute('id', { path: '.workspace.json', content: '{}' } as any);
    expect(result.isError).toBe(true);
  });

  it('白名单外的随机文件可被 ** 允许写入', async () => {
    (fs.promises.mkdir as any).mockResolvedValue(undefined);
    (fs.promises.writeFile as any).mockResolvedValue(undefined);
    const tool = createWriteFileTool(mockConfig);
    // ** 允许工作空间内任意路径，敏感路径由 deny 拦截
    const result = await tool.execute('id', { path: 'demos/notes.txt', content: 'x' } as any);
    expect(result.isError).toBeFalsy();
  });
});

describe('createListFilesTool - 权限感知', () => {
  it('白名单路径允许列出', async () => {
    (fs.promises.readdir as any).mockResolvedValue([
      { name: 'home', isDirectory: () => true },
    ]);
    const tool = createListFilesTool(mockConfig);
    const result = await tool.execute('id', { path: 'demos' } as any);
    expect(result.isError).toBeFalsy();
  });

  it('node_modules 路径被拒', async () => {
    const tool = createListFilesTool(mockConfig);
    const result = await tool.execute('id', { path: 'node_modules' } as any);
    expect(result.isError).toBe(true);
  });
});

describe('createBashTool - 权限感知', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('白名单命令 npm 应放行', async () => {
    const { exec } = await import('child_process');
    const execMock = exec as any;
    execMock.mockImplementation((cmd: string, opts: any, cb: any) => {
      cb(null, { stdout: 'ok', stderr: '' });
    });
    const tool = createBashTool(mockConfig);
    const result = await tool.execute('id', { command: 'npm install foo' } as any);
    expect(result.isError).toBeFalsy();
  });

  it('黑名单命令 rm 应被拒', async () => {
    const tool = createBashTool(mockConfig);
    const result = await tool.execute('id', { command: 'rm -rf demos' } as any);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('rm');
  });

  it('未列入白名单的 curl 应被拒', async () => {
    const tool = createBashTool(mockConfig);
    const result = await tool.execute('id', { command: 'curl https://evil.com' } as any);
    expect(result.isError).toBe(true);
  });
});

describe('createWorkbenchTools - permissions 透传', () => {
  it('自定义 permissions 配置应被工具使用', async () => {
    const customConfig: AgentConfig = {
      ...mockConfig,
      permissions: {
        allowedPaths: ['custom/path.ts'],
        deniedPatterns: ['**/forbidden/**'],
        allowedCommands: ['echo'],
        deniedCommands: ['npm'],
      },
    };
    const { createWorkbenchTools } = await import('../../src/backends/pi-tools');
    const tools = createWorkbenchTools(customConfig);
    expect(tools).toHaveLength(7);
    // 通过读取工具验证：custom/path.ts 应被允许
    const readTool = tools.find(t => t.name === 'readFile')!;
    const ok = await readTool.execute('id', { path: 'custom/path.ts' } as any);
    expect(ok.isError).toBeFalsy();
    const denied = await readTool.execute('id', { path: 'forbidden/x.ts' } as any);
    expect(denied.isError).toBe(true);
  });
});
