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
    expect(prompt).toContain('OneFlow Authoring Agent');
    expect(prompt).toContain('OneFlow 创作工作流助手');
    expect(prompt).toContain('页面管理操作');
    expect(prompt).toContain('项目级配置管理');
    expect(prompt).toContain('禁止行为');
  });

  it('创作端 Agent 身份应覆盖完整创作工作流', () => {
    const prompt = buildStaticSystemPrompt();
    expect(prompt).toContain('你是一位 OneFlow 创作工作流助手');
    expect(prompt).toContain('活动原型、页面实现、配置资源、知识规范、视觉还原、预览验收和开发交接');
    expect(prompt).toContain('页面创作、配置管理、知识查阅、资源规范、画布整理、Vibe Coding 和开发上下文准备');
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

  it('canvas layout rules use arrangeCanvasPages when available', () => {
    const prompt = buildStaticSystemPrompt({
      toolNames: ['arrangeCanvasPages', 'listPages'],
    });

    expect(prompt).toContain('画布管理');
    expect(prompt).toContain('arrangeCanvasPages({');
    expect(prompt).toContain('不要用 `writeFile`、`editFile`、`bash` 或 `node` 直接创建、修改或覆盖 `.canvas-layout.json`');
    expect(prompt).toContain('页面 ID 必须来自 `listPages`');
  });

  it('canvas layout rules disable canvas changes when tool is unavailable', () => {
    const prompt = buildStaticSystemPrompt({
      toolNames: ['listPages'],
    });

    expect(prompt).toContain('当前 Agent Service 没有提供画布布局工具');
    expect(prompt).toContain('你不能整理、排列或修改画布中的页面位置和尺寸');
    expect(prompt).not.toContain('arrangeCanvasPages({');
  });

  it('明确告知创作端 agent 可以委派子 Agent', () => {
    const prompt = buildStaticSystemPrompt();
    expect(prompt).toContain('子 Agent 委派');
    expect(prompt).toContain('delegateTask');
    expect(prompt).toContain('子 Agent 不能继续创建子 Agent');
  });

  it('复杂任务审批计划前应先澄清关键问题', () => {
    const prompt = buildStaticSystemPrompt();
    expect(prompt).toContain('审批计划前的澄清规则');
    expect(prompt).toContain('先用普通回复向用户提出澄清问题');
    expect(prompt).toContain('未完成必要澄清前，不要调用 `requestPlanApproval`');
  });

  it('约束新建页面时不得自行添加配置项', () => {
    const prompt = buildStaticSystemPrompt();
    expect(prompt).toContain('如果用户没有明确要求配置项，必须写入空配置 schema');
    expect(prompt).toContain('不能从页面内容中自行抽取配置字段');
    expect(prompt).toContain('HTML/CSS 原型页是创作端 AI 的默认实现方式');
    expect(prompt).toContain('原型页写入 `prototype.html` / `prototype.css`，高保真页写入 `index.tsx`');
    expect(prompt).toContain('runtimeType: "prototype-html-css"');
    expect(prompt).toContain('"properties": {}');
    expect(prompt).toContain('"required": []');
    expect(prompt).toContain('如果 schema 没有配置字段，Props 必须为空');
    expect(prompt).toContain('不得因生成页面、样式调整、组件修改、素材替换等原因自行增删配置字段');
  });

  it('默认 schema 模板包含 $demo.previewSize', () => {
    const prompt = buildStaticSystemPrompt();
    expect(prompt).toContain('"previewSize"');
    expect(prompt).toContain('"width": 375');
    expect(prompt).toContain('"height": 812');
    expect(prompt).toContain('`previewSize` 的宽高由你根据页面目标设备和内容自行判断填写');
  });

  it('明确说明 HTML/CSS 原型页支持页面级配置绑定', () => {
    const prompt = buildStaticSystemPrompt();
    expect(prompt).toContain('HTML/CSS 原型页和高保真 React 页都支持配置项');
    expect(prompt).toContain('不得声称原型页不支持配置注入');
    expect(prompt).toContain('原型页不通过 React Props 注入配置');
    expect(prompt).toContain('data-bind-text');
    expect(prompt).toContain('data-bind-src');
    expect(prompt).toContain('{{fieldKey}}');
    expect(prompt).toContain('给原型页添加配置项时，应在 `config.schema.json` 中添加字段');
    expect(prompt).toContain('`prototype.html` 的目标元素上补齐对应 `data-bind-*` 或 `{{fieldKey}}` 绑定');
  });

  it('包含共享 preview contract 生成的页面运行规则', () => {
    const prompt = buildStaticSystemPrompt();
    expect(prompt).toContain('创作端高保真 React 页面运行契约');
    expect(prompt).toContain('以下规则仅适用于 `high-fidelity-react` 页面');
    expect(prompt).toContain('当前契约版本：');
    expect(prompt).toContain('react/jsx-runtime');
    expect(prompt).toContain('@preview/sdk');
  });

  it('知识库查阅规则要求按索引自主选择并按需读取', () => {
    const prompt = buildStaticSystemPrompt();
    expect(prompt).toContain('上下文中只会提供知识库索引，不会提供正文');
    expect(prompt).toContain('标题、描述、分类、标签');
    expect(prompt).toContain('readFileWithLines');
    expect(prompt).toContain('不要一次性读取全部知识库');
  });
});

describe('buildDynamicContextPrefix', () => {
  const baseContext: SystemPromptContext = {
    projectName: 'MyProject',
    projectConfigStatus: '已设置',
    workspacePath: '/tmp/workspace',
    pageCount: 2,
    pageList: '- 首页 — `demos/home/`\n- 关于 — `demos/about/`',
    canvasTextSummary: '（暂无画布文本节点）',
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
