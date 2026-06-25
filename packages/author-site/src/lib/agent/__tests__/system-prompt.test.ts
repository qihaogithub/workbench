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
  it('delete page rules use transactional tools when available', () => {
    const prompt = buildStaticSystemPrompt({
      toolNames: ['listPages', 'previewDeletePages', 'executeDeletePagePlan', 'deletePage', 'deletePages'],
    });
    expect(prompt).toContain('listPages');
    expect(prompt).toContain('不要根据页面名称、显示顺序或路径片段猜测页面 ID');
    expect(prompt).toContain('previewDeletePages');
    expect(prompt).toContain('executeDeletePagePlan');
    expect(prompt).toContain('mode: "nameIncludes"');
    expect(prompt).toContain('目标数量大于 1 时，只能走 `previewDeletePages` → `executeDeletePagePlan`');
    expect(prompt).toContain('可以删除最后一个页面');
    expect(prompt).not.toContain('无法删除最后一个页面');
  });

  it('delete page rules fall back to deletePages when transaction tools are unavailable', () => {
    const prompt = buildStaticSystemPrompt({
      toolNames: ['listPages', 'deletePage', 'deletePages'],
    });

    expect(prompt).toContain('当前 Agent Service 尚未提供事务化删除工具');
    expect(prompt).toContain('deletePages({');
    expect(prompt).not.toContain('previewDeletePages({');
    expect(prompt).toContain('可以删除最后一个页面');
    expect(prompt).not.toContain('项目至少保留一个页面');
  });

  it('delete page rules disable deletion when delete tools are unavailable', () => {
    const prompt = buildStaticSystemPrompt({
      toolNames: ['listPages'],
    });

    expect(prompt).toContain('当前 Agent Service 没有提供页面删除工具');
    expect(prompt).toContain('你不能删除页面，也不能声称已经删除页面');
    expect(prompt).not.toContain('executeDeletePagePlan({');
  });

  it('明确告知创作端 agent 可以委派子 Agent', () => {
    const prompt = buildStaticSystemPrompt();
    expect(prompt).toContain('子 Agent 委派');
    expect(prompt).toContain('delegateTask');
    expect(prompt).toContain('子 Agent 不能继续创建子 Agent');
  });

  it('约束新建页面时不得自行添加配置项', () => {
    const prompt = buildStaticSystemPrompt();
    expect(prompt).toContain('如果用户没有明确要求配置项，必须写入空配置 schema');
    expect(prompt).toContain('不能从页面内容中自行抽取配置字段');
    expect(prompt).toContain('标题、文案、图片、颜色、按钮、布局等内容默认都应直接写在 `index.tsx` 中');
    expect(prompt).toContain('"properties": {}');
    expect(prompt).toContain('"required": []');
    expect(prompt).toContain('如果 schema 没有配置字段，Props 必须为空');
    expect(prompt).toContain('不得因生成页面、样式调整、组件修改、素材替换等原因自行增删配置字段');
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
