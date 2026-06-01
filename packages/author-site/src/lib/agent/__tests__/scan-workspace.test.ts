import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { scanWorkspaceContext } from '../scan-workspace';

describe('scanWorkspaceContext', () => {
  let tmpDir: string;

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
    const demosDir = path.join(tmpDir, 'demos');
    fs.mkdirSync(path.join(demosDir, 'home'), { recursive: true });
    fs.mkdirSync(path.join(demosDir, 'about'), { recursive: true });
    const ctx = scanWorkspaceContext(tmpDir);
    expect(ctx.pageCount).toBe(2);
    expect(ctx.pageList).toContain('home');
    expect(ctx.pageList).toContain('about');
  });

  it('解析 .demo.json 中的 name 字段', () => {
    const pageDir = path.join(tmpDir, 'demos', 'home');
    fs.mkdirSync(pageDir, { recursive: true });
    fs.writeFileSync(
      path.join(pageDir, '.demo.json'),
      JSON.stringify({ name: '我的首页', id: 'home' })
    );
    const ctx = scanWorkspaceContext(tmpDir);
    expect(ctx.pageList).toContain('我的首页');
  });

  it('.demo.json 解析失败时回退到目录名', () => {
    const pageDir = path.join(tmpDir, 'demos', 'broken');
    fs.mkdirSync(pageDir, { recursive: true });
    fs.writeFileSync(path.join(pageDir, '.demo.json'), 'invalid json{');
    const ctx = scanWorkspaceContext(tmpDir);
    expect(ctx.pageList).toContain('broken');
  });

  it('不存在的 demos/ 目录应正常处理（pageCount=0）', () => {
    const ctx = scanWorkspaceContext(tmpDir);
    expect(ctx.pageCount).toBe(0);
    expect(ctx.pageList).toBe('（暂无页面）');
  });

  it('页面列表按顺序编号', () => {
    const demosDir = path.join(tmpDir, 'demos');
    fs.mkdirSync(path.join(demosDir, 'a'), { recursive: true });
    fs.mkdirSync(path.join(demosDir, 'b'), { recursive: true });
    fs.mkdirSync(path.join(demosDir, 'c'), { recursive: true });
    const ctx = scanWorkspaceContext(tmpDir);
    expect(ctx.pageList).toMatch(/^1\./);
    expect(ctx.pageList).toMatch(/2\./);
    expect(ctx.pageList).toMatch(/3\./);
  });
});
