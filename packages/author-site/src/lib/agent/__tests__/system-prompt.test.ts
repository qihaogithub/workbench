import { describe, it, expect } from '@jest/globals';
import {
  buildStaticSystemPrompt,
  buildDynamicContextPrefix,
  type SystemPromptContext,
} from '../system-prompt';

describe('buildStaticSystemPrompt', () => {
  it('返回非空字符串', () => {
    const prompt = buildStaticSystemPrompt();
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('L2 模板内容应包含核心规则章节', () => {
    const prompt = buildStaticSystemPrompt();
    expect(prompt).toContain('Demo Generator Agent');
    expect(prompt).toContain('页面管理操作');
    expect(prompt).toContain('项目级配置管理');
    expect(prompt).toContain('禁止行为');
  });

  it('L4 权限确认说明应拼接在末尾', () => {
    const prompt = buildStaticSystemPrompt();
    expect(prompt).toContain('权限确认');
  });

  it('不包含 L3 占位符（纯静态 → LLM API 缓存命中）', () => {
    const prompt = buildStaticSystemPrompt();
    expect(prompt).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  it('不包含 L3 章节（工作空间结构 / 页面信息）', () => {
    const prompt = buildStaticSystemPrompt();
    // L2 中"禁止行为"含"工作空间目录外"是合理的；这里只验证 L3 独有标题"页面信息"与"包含 N 个页面"占位结构
    expect(prompt).not.toContain('## 页面信息');
    expect(prompt).not.toMatch(/包含 \{\{PAGE_COUNT\}\} 个页面/);
  });

  it('多次调用返回相同结果（确定性）', () => {
    const a = buildStaticSystemPrompt();
    const b = buildStaticSystemPrompt();
    expect(a).toBe(b);
  });
});

describe('buildDynamicContextPrefix', () => {
  const baseContext: SystemPromptContext = {
    projectName: 'MyProject',
    projectConfigStatus: '已设置',
    workspacePath: '/tmp/workspace',
    pageCount: 2,
    pageList: '- 首页 — `demos/home/`\n- 关于 — `demos/about/`',
  };

  it('仅渲染页面列表，不包含冗余的项目元信息', () => {
    const out = buildDynamicContextPrefix(baseContext);
    expect(out).toContain('首页');
    expect(out).toContain('关于');
    expect(out).toContain('demos/home/');
    expect(out).toContain('demos/about/');
    // 不应包含项目名/工作空间路径/项目配置/页面数量（避免冗余干扰 AI）
    expect(out).not.toContain('MyProject');
    expect(out).not.toContain('/tmp/workspace');
    expect(out).not.toContain('已设置');
    expect(out).not.toContain('项目配置');
    expect(out).not.toContain('页面数量');
  });

  it('无页面时显示（暂无页面）', () => {
    const out = buildDynamicContextPrefix({ ...baseContext, pageCount: 0, pageList: '' });
    expect(out).toContain('暂无页面');
  });

  it('L3 前缀以"当前工作空间中的页面"开头便于 LLM 识别', () => {
    const out = buildDynamicContextPrefix(baseContext);
    expect(out).toMatch(/^当前工作空间中的页面/);
  });
});
