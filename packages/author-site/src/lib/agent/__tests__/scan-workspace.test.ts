import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { scanWorkspaceContext } from '../scan-workspace';

describe('scanWorkspaceContext', () => {
  let tmpDir: string;

  function createDemoPage(id: string, code = '// code', schema = '{}') {
    const pageDir = path.join(tmpDir, 'demos', id);
    fs.mkdirSync(pageDir, { recursive: true });
    fs.writeFileSync(path.join(pageDir, 'index.tsx'), code);
    fs.writeFileSync(path.join(pageDir, 'config.schema.json'), schema);
    return pageDir;
  }

  function normalizeSeparators(value: string): string {
    return value.replace(/\\/g, '/');
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-workspace-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('空工作空间返回 pageCount=0 与"未设置"配置', () => {
    const ctx = scanWorkspaceContext(tmpDir);
    expect(ctx.pageCount).toBe(0);
    expect(ctx.projectConfigStatus).toBe('未设置');
    expect(ctx.projectName).toBe(path.basename(tmpDir));
    expect(ctx.workspacePath).toBe(tmpDir);
  });

  it('存在 project.config.schema.json 时 projectConfigStatus="已设置"', () => {
    fs.writeFileSync(path.join(tmpDir, 'project.config.schema.json'), '{}');
    const ctx = scanWorkspaceContext(tmpDir);
    expect(ctx.projectConfigStatus).toBe('已设置');
  });

  it('扫描 demos/ 目录下子目录作为页面', () => {
    createDemoPage('home');
    createDemoPage('about');
    const ctx = scanWorkspaceContext(tmpDir);
    expect(ctx.pageCount).toBe(2);
    expect(ctx.pageList).toContain('home');
    expect(ctx.pageList).toContain('about');
  });

  it('解析 workspace-tree.json 中的页面 name 字段', () => {
    createDemoPage('home');
    fs.writeFileSync(
      path.join(tmpDir, 'workspace-tree.json'),
      JSON.stringify({ folders: [], pages: [{ id: 'home', name: '我的首页', order: 0, parentId: null }] })
    );
    const ctx = scanWorkspaceContext(tmpDir);
    expect(ctx.pageList).toContain('我的首页');
  });

  it('workspace-tree.json 损坏时回退到目录扫描', () => {
    createDemoPage('broken');
    fs.writeFileSync(path.join(tmpDir, 'workspace-tree.json'), 'invalid json{');
    const ctx = scanWorkspaceContext(tmpDir);
    expect(ctx.pageList).toContain('broken');
  });

  it('不存在的 demos/ 目录应正常处理（pageCount=0）', () => {
    const ctx = scanWorkspaceContext(tmpDir);
    expect(ctx.pageCount).toBe(0);
    expect(ctx.pageList).toBe('（暂无页面）');
  });

  it('页面列表展示每个页面的 index.tsx 和 config.schema.json 路径', () => {
    createDemoPage('a');
    createDemoPage('b');
    const ctx = scanWorkspaceContext(tmpDir);
    const pageList = normalizeSeparators(ctx.pageList);
    expect(pageList).toMatch(/^- a$/m);
    expect(pageList).toMatch(/id: `a`/);
    expect(pageList).toMatch(/demos\/a\/index\.tsx/);
    expect(pageList).toMatch(/demos\/a\/config\.schema\.json/);
    expect(pageList).toMatch(/^- b$/m);
    expect(pageList).toMatch(/demos\/b\/index\.tsx/);
  });

  it('每个页面列出 index.tsx 和 config.schema.json 精确路径', () => {
    createDemoPage('home');
    const ctx = scanWorkspaceContext(tmpDir);
    const pageList = normalizeSeparators(ctx.pageList);
    expect(pageList).toContain('demos/home/index.tsx');
    expect(pageList).toContain('id: `home`');
    expect(pageList).toContain('demos/home/config.schema.json');
  });

  it('页面数 ≤ 2 时，pageList 包含 index.tsx 和 config.schema.json 的文件内容', () => {
    const demosDir = path.join(tmpDir, 'demos');
    const aDir = path.join(demosDir, 'a');
    fs.mkdirSync(aDir, { recursive: true });
    fs.writeFileSync(path.join(aDir, 'index.tsx'), 'export default function A() { return <div>A</div>; }');
    fs.writeFileSync(path.join(aDir, 'config.schema.json'), '{"type":"object"}');
    const ctx = scanWorkspaceContext(tmpDir);
    expect(ctx.pageList).toContain('export default function A()');
    expect(ctx.pageList).toContain('"type":"object"');
  });

  it('页面数 > 2 时，pageList 不包含文件内容（避免 L3 过大）', () => {
    const demosDir = path.join(tmpDir, 'demos');
    for (const id of ['a', 'b', 'c']) {
      const dir = path.join(demosDir, id);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'index.tsx'), `// code for ${id}`);
      fs.writeFileSync(path.join(dir, 'config.schema.json'), `{"id":"${id}"}`);
    }
    const ctx = scanWorkspaceContext(tmpDir);
    expect(ctx.pageList).not.toContain('// code for a');
    expect(ctx.pageList).not.toContain('// code for b');
    expect(ctx.pageList).not.toContain('// code for c');
    const pageList = normalizeSeparators(ctx.pageList);
    expect(pageList).toContain('demos/a/index.tsx');
    expect(pageList).toContain('demos/c/config.schema.json');
  });

  it('页面数恰好为 2 时仍嵌入文件内容', () => {
    for (const id of ['x', 'y']) {
      createDemoPage(id, `// ${id}-code`);
    }
    const ctx = scanWorkspaceContext(tmpDir);
    expect(ctx.pageList).toContain('// x-code');
    expect(ctx.pageList).toContain('// y-code');
  });
});
