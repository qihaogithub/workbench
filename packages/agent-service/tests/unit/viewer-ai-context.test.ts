import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Project } from '@workbench/shared/contracts';
import { buildViewerAiPromptContext, buildViewerAiSystemPrompt } from '../../src/services/viewer-ai-context';
import { setSystemKnowledgeSnapshot } from '../../src/config/system-knowledge';

describe('viewer AI context', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-ai-context-'));
    fs.mkdirSync(path.join(tempDir, 'demos', 'home'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'knowledge'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, 'workspace-tree.json'),
      JSON.stringify({
        folders: [],
        pages: [{ id: 'home', name: '首页', order: 0, parentId: null }],
      }),
      'utf-8',
    );
    fs.writeFileSync(path.join(tempDir, 'demos', 'home', 'index.tsx'), 'export default function Demo() { return <div>欢迎</div>; }', 'utf-8');
    fs.writeFileSync(path.join(tempDir, 'demos', 'home', 'config.schema.json'), '{"properties":{"title":{"default":"欢迎"}}}', 'utf-8');
    fs.writeFileSync(path.join(tempDir, 'project.config.schema.json'), '{"properties":{"brand":{"default":"Workbench"}}}', 'utf-8');
    fs.writeFileSync(path.join(tempDir, 'memory.md'), '用户偏好：回答要简洁。', 'utf-8');
    fs.writeFileSync(
      path.join(tempDir, 'knowledge', 'manifest.json'),
      JSON.stringify({
        items: [{
          title: '使用说明',
          description: '解释项目用途',
          fileName: '使用说明.md',
          category: '说明',
          tags: ['viewer'],
        }],
      }),
      'utf-8',
    );
    setSystemKnowledgeSnapshot({
      version: 1,
      updatedAt: '2026-06-26T00:00:00.000Z',
      documents: [{
        id: 'sys_1',
        title: '配置系统参考',
        description: '系统配置说明',
        fileName: '配置系统参考.md',
        content: '系统知识正文',
        category: '配置',
        tags: ['schema'],
        enabled: true,
        sortOrder: 0,
        version: 1,
        contentHash: 'hash',
        aiSummary: '解释配置项怎么理解',
        aiKeywords: ['配置'],
        summaryStatus: 'ready',
        createdAt: '2026-06-26T00:00:00.000Z',
        updatedAt: '2026-06-26T00:00:00.000Z',
        sizeBytes: 6,
      }],
    });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('应构造包含项目、当前页面、配置、记忆和知识库索引的只读上下文', () => {
    const project: Project = {
      id: 'proj_1',
      name: '测试项目',
      description: '给使用者预览的项目',
      workspacePath: tempDir,
      demoPages: [],
      demoFolders: [],
      versions: [],
      createdAt: 1,
      updatedAt: 1,
    };

    const context = buildViewerAiPromptContext({
      project,
      activePageId: 'home',
      activeConfig: { title: '自定义标题' },
    });

    expect(context).toContain('测试项目');
    expect(context).toContain('当前页面：首页');
    expect(context).toContain('自定义标题');
    expect(context).toContain('用户偏好：回答要简洁。');
    expect(context).toContain('使用说明');
    expect(context).toContain('配置系统参考');
  });

  it('system prompt 应明确只读边界和非技术用户风格', () => {
    const prompt = buildViewerAiSystemPrompt();

    expect(prompt).toContain('只读、非技术用户');
    expect(prompt).toContain('不能修改、删除、保存、发布或执行命令');
  });
});
