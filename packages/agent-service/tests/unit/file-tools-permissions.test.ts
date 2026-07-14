import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createReadFileTool, createWriteFileTool, createListFilesTool } from '../../src/backends/pi-tools/file-tools';
import { createEditFileTool } from '../../src/backends/pi-tools/edit-file-tool';
import { createReadFileLinesTool } from '../../src/backends/pi-tools/read-file-lines-tool';
import { createBashTool } from '../../src/backends/pi-tools/bash-tool';
import { setSystemKnowledgeSnapshot } from '../../src/config/system-knowledge';
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
  execFile: vi.fn(),
}));

const mockConfig: AgentConfig = {
  sessionId: 'test',
  workingDir: '/tmp/test-workspace',
};

describe('createReadFileTool - 权限感知', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSystemKnowledgeSnapshot({
      version: 1,
      updatedAt: '2026-06-26T00:00:00.000Z',
      documents: [
        {
          id: 'kb_sys_test',
          title: '配置系统参考',
          description: '测试系统知识',
          fileName: '配置系统参考.md',
          content: '# 配置系统参考\n\n系统知识正文',
          category: '配置与预览',
          tags: ['config.schema.json'],
          enabled: true,
          sortOrder: 0,
          version: 1,
          contentHash: 'hash',
          aiSummary: '摘要',
          aiKeywords: ['配置'],
          summaryStatus: 'ready',
          createdAt: '2026-06-26T00:00:00.000Z',
          updatedAt: '2026-06-26T00:00:00.000Z',
          sizeBytes: 20,
        },
      ],
    });
  });

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

  it('系统知识库虚拟文件应无需物理文件即可读取', async () => {
    const tool = createReadFileTool(mockConfig);
    const result = await tool.execute('id', { path: 'knowledge/配置系统参考.md' } as any);
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('系统知识正文');
    expect(fs.promises.readFile).not.toHaveBeenCalled();
  });

  it('系统知识库虚拟文件应支持按行读取', async () => {
    const tool = createReadFileLinesTool(mockConfig);
    const result = await tool.execute('id', {
      path: 'knowledge/配置系统参考.md',
      startLine: 1,
      endLine: 1,
    } as any);
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('File: knowledge/配置系统参考.md');
    expect(result.content[0].text).toContain('1→# 配置系统参考');
    expect(fs.promises.readFile).not.toHaveBeenCalled();
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

  it('node -e 搴旇鎷掔粷', async () => {
    const tool = createBashTool(mockConfig);
    const result = await tool.execute('id', { command: 'node -e "console.log(1)"' } as any);
    expect(result.isError).toBe(true);
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

  it('写入坏页面代码后应返回非阻塞预览诊断', async () => {
    (fs.promises.mkdir as any).mockResolvedValue(undefined);
    (fs.promises.writeFile as any).mockResolvedValue(undefined);
    const tool = createWriteFileTool(mockConfig);
    const result = await tool.execute('id', {
      path: 'demos/home/index.tsx',
      content: [
        "const accentMap = { primary: 'red' };",
        "export default function Demo(){ return <div />; }",
        "const accentMap = { primary: 'blue' };",
      ].join('\n'),
    } as any);

    expect(result.isError).toBeFalsy();
    expect(fs.promises.writeFile).toHaveBeenCalled();
    expect(result.content[0].text).toContain('Preview validation failed');
    expect(result.details?.runtimeValidation).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: 'DUPLICATE_TOP_LEVEL_DECLARATION' })],
    });
  });
});

describe('createEditFileTool - 预览校验反馈', () => {
  it('编辑坏页面代码后应返回非阻塞预览诊断', async () => {
    (fs.promises.readFile as any).mockResolvedValue(
      "export default function Demo(){ return <div />; }\n",
    );
    (fs.promises.writeFile as any).mockResolvedValue(undefined);
    const tool = createEditFileTool(mockConfig);
    const result = await tool.execute('id', {
      path: 'demos/home/index.tsx',
      old_string: "export default function Demo(){ return <div />; }\n",
      new_string: [
        "const accentMap = { primary: 'red' };",
        "export default function Demo(){ return <div />; }",
        "const accentMap = { primary: 'blue' };",
      ].join('\n'),
    } as any);

    expect(result.isError).toBeFalsy();
    expect(fs.promises.writeFile).toHaveBeenCalled();
    expect(result.content[0].text).toContain('Preview validation failed');
    expect(result.details?.runtimeValidation).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: 'DUPLICATE_TOP_LEVEL_DECLARATION' })],
    });
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

  it('npm 应被拒绝，避免绕过专用工具写入工作区', async () => {
    const { exec } = await import('child_process');
    const execMock = exec as any;
    execMock.mockImplementation((cmd: string, opts: any, cb: any) => {
      cb(null, { stdout: 'ok', stderr: '' });
    });
    const tool = createBashTool(mockConfig);
    const result = await tool.execute('id', { command: 'npm install foo' } as any);
    expect(result.isError).toBe(true);
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
  const originalWebSearchEnabled = process.env.PI_AGENT_WEB_SEARCH_ENABLED;
  const originalWebReadEnabled = process.env.PI_AGENT_WEB_READ_ENABLED;

  beforeEach(() => {
    delete process.env.PI_AGENT_WEB_SEARCH_ENABLED;
    delete process.env.PI_AGENT_WEB_READ_ENABLED;
  });

  afterEach(() => {
    if (originalWebSearchEnabled === undefined) {
      delete process.env.PI_AGENT_WEB_SEARCH_ENABLED;
    } else {
      process.env.PI_AGENT_WEB_SEARCH_ENABLED = originalWebSearchEnabled;
    }
    if (originalWebReadEnabled === undefined) {
      delete process.env.PI_AGENT_WEB_READ_ENABLED;
    } else {
      process.env.PI_AGENT_WEB_READ_ENABLED = originalWebReadEnabled;
    }
  });

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
    const tools = createWorkbenchTools(customConfig, undefined, {
      subagentRunner: async () => ({
        success: true,
        content: 'ok',
        durationMs: 1,
      }),
    });
    expect(tools).toHaveLength(28);
    expect(tools.some(t => t.name === 'readUploadedFile')).toBe(true);
    expect(tools.some(t => t.name === 'webRead')).toBe(true);
    expect(tools.some(t => t.name === 'webSearch')).toBe(false);
    expect(tools.some(t => t.name === 'readPreinstalledSkill')).toBe(true);
    expect(tools.some(t => t.name === 'requestUserChoice')).toBe(true);
    expect(tools.some(t => t.name === 'readSketchScene')).toBe(false);
    expect(tools.some(t => t.name === 'patchSketchScene')).toBe(false);
    // 通过读取工具验证：custom/path.ts 应被允许
    const readTool = tools.find(t => t.name === 'readFile')!;
    const ok = await readTool.execute('id', { path: 'custom/path.ts' } as any);
    expect(ok.isError).toBeFalsy();
    const denied = await readTool.execute('id', { path: 'forbidden/x.ts' } as any);
    expect(denied.isError).toBe(true);
  });

  it('启用联网搜索时应注册 webSearch 工具', async () => {
    process.env.PI_AGENT_WEB_SEARCH_ENABLED = 'true';
    const { createWorkbenchTools } = await import('../../src/backends/pi-tools');
    const tools = createWorkbenchTools(mockConfig, undefined, {
      subagentRunner: async () => ({
        success: true,
        content: 'ok',
        durationMs: 1,
      }),
    });

    expect(tools).toHaveLength(29);
    expect(tools.some(t => t.name === 'webSearch')).toBe(true);
    expect(tools.some(t => t.name === 'readUploadedFile')).toBe(true);
    expect(tools.some(t => t.name === 'readPreinstalledSkill')).toBe(true);
    expect(tools.some(t => t.name === 'requestUserChoice')).toBe(true);
  });

  it('关闭网页读取时不注册 webRead 工具', async () => {
    process.env.PI_AGENT_WEB_READ_ENABLED = 'false';
    const { createWorkbenchTools } = await import('../../src/backends/pi-tools');
    const tools = createWorkbenchTools(mockConfig, undefined, {
      subagentRunner: async () => ({
        success: true,
        content: 'ok',
        durationMs: 1,
      }),
    });

    expect(tools.some(t => t.name === 'webRead')).toBe(false);
  });

  it('viewer-readonly 模式不注册 webSearch 工具', async () => {
    process.env.PI_AGENT_WEB_SEARCH_ENABLED = 'true';
    const { createWorkbenchTools } = await import('../../src/backends/pi-tools');
    const tools = createWorkbenchTools(mockConfig, undefined, {
      mode: 'viewer-readonly',
    });

    expect(tools.some(t => t.name === 'webRead')).toBe(false);
    expect(tools.some(t => t.name === 'webSearch')).toBe(false);
  });
});
