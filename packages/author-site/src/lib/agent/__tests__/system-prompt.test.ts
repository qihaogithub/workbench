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
    expect(prompt).toContain('页面生命周期操作');
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
    expect(prompt).not.toContain('## 页面信息');
    expect(prompt).not.toMatch(/包含 \{\{PAGE_COUNT\}\} 个页面/);
  });

  it('多次调用返回相同结果（确定性）', () => {
    const a = buildStaticSystemPrompt();
    const b = buildStaticSystemPrompt();
    expect(a).toBe(b);
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
    // 创建页面的详细配置约束已移入 page-lifecycle skill，基座保留 Tier 1 配置规则
    expect(prompt).toContain('默认在 `demos/` 下创建 HTML/CSS 原型页目录');
    expect(prompt).toContain('runtimeType: "prototype-html-css"');
    expect(prompt).toContain('properties` 必须为空对象');
    expect(prompt).toContain('required` 必须为空数组');
    expect(prompt).toContain('不得因生成页面、样式调整、组件修改、素材替换等原因自行增删配置字段');
  });

  it('默认 schema 模板 previewSize 已迁移到 page-lifecycle skill', () => {
    const prompt = buildStaticSystemPrompt();
    // previewSize 模板完整定义已移入 page-lifecycle skill，基座仅保留配置项约束规则
    expect(prompt).toContain('config.schema.json');
    expect(prompt).toContain('页面生命周期操作');
  });

  it('明确说明 HTML/CSS 原型页支持页面级配置绑定', () => {
    const prompt = buildStaticSystemPrompt();
    expect(prompt).toContain('HTML/CSS 原型页和高保真 React 页都支持配置项');
    expect(prompt).toContain('不得声称原型页不支持配置注入');
    expect(prompt).toContain('原型页不通过 React Props 注入配置');
    expect(prompt).toContain('data-bind-text');
    expect(prompt).toContain('data-bind-src');
    expect(prompt).toContain('{{fieldKey}}');
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
    expect(prompt).toContain('readFile');
    expect(prompt).toContain('不要一次性读取全部知识库');
  });

  it('外部协作工具（Figma/钉钉）规则保留在基座 Tier 1', () => {
    const prompt = buildStaticSystemPrompt();
    expect(prompt).toContain('外部协作工具');
    expect(prompt).toContain('Figma MCP');
    expect(prompt).toContain('钉钉 dws');
    expect(prompt).toContain('不要改用全局 token');
  });

  it('包含按需 Skill 参考章节', () => {
    const prompt = buildStaticSystemPrompt();
    expect(prompt).toContain('按需 Skill 参考');
    expect(prompt).toContain('page-lifecycle');
    expect(prompt).toContain('page-deletion');
    expect(prompt).toContain('react-high-fidelity');
    expect(prompt).toContain('page-runtime-conversion');
    expect(prompt).toContain('image-handling');
    expect(prompt).toContain('preview-tools');
    expect(prompt).toContain('memory-maintenance');
  });

  it('Tier 2 页面生命周期操作包含显式 readPreinstalledSkill 加载指令', () => {
    const prompt = buildStaticSystemPrompt();
    expect(prompt).toContain("readPreinstalledSkill({ name: 'page-lifecycle' })");
    expect(prompt).toContain("readPreinstalledSkill({ name: 'page-deletion' })");
    expect(prompt).toContain("readPreinstalledSkill({ name: 'react-high-fidelity' })");
    expect(prompt).toContain("readPreinstalledSkill({ name: 'page-runtime-conversion' })");
  });

  it('Tier 2 页面运行时转换包含不适用场景说明', () => {
    const prompt = buildStaticSystemPrompt();
    expect(prompt).toContain('此规则仅适用于用户显式触发运行时类型切换');
    expect(prompt).toContain('不适用于新建或重写页面');
  });

  it('高保真 React 页规范包含与转换场景的互斥声明', () => {
    const prompt = buildStaticSystemPrompt();
    expect(prompt).toContain('本规范仅适用于「新建」或「重写」React 页');
    expect(prompt).toContain('页面运行时类型转换（prototype ↔ high-fidelity-react）不适用本规范');
    expect(prompt).toContain('转换场景见 `page-runtime-conversion` skill');
  });

  it('不包含已迁移到 skill 的完整规则详情', () => {
    const prompt = buildStaticSystemPrompt();
    // 不再硬编码完整的删除页面规则（如 previewDeletePages 参数用法）
    expect(prompt).not.toContain('mode: "nameIncludes"');
    // 不再硬编码完整的画布管理规则
    expect(prompt).not.toContain('arrangeCanvasPages({');
    // 不再硬编码预览调试工具详情
    expect(prompt).not.toContain('getConsoleLogs({ level:');
    // 不再硬编码截图工具详情
    expect(prompt).not.toContain('captureScreenshot({ width:');
  });

  it('页面删除基座保留最小约束', () => {
    const prompt = buildStaticSystemPrompt();
    expect(prompt).toContain('删除前必须先调 `listPages` 获取精确 ID');
    expect(prompt).toContain('不要根据名称猜测');
    expect(prompt).toContain('不要用 `bash`/`writeFile`/`editFile` 手动删除');
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
