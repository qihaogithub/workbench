import { DEMO_GENERATOR_TEMPLATE } from '@opencode-workbench/shared/agent-prompts';
import { WORKSPACE_STATUS_TEMPLATE } from '../agent-prompts/workspace-status.template';

export interface SystemPromptContext {
  projectName: string;
  projectConfigStatus: '已设置' | '未设置';
  pageCount: number;
  pageList: string;
  workspacePath: string;
}

const L4_NOTICE = `## 权限确认

以下操作需要用户确认（系统会自动发送确认请求给用户）：
- 创建新页面目录
- 删除页面文件
- 修改项目级共享配置（project.config.schema.json）

收到 \`permission_request\` 事件后等待用户授权，不要直接继续操作。`;

function render(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replace(new RegExp(`{{${k}}}`, 'g'), v),
    template,
  );
}

/**
 * 构建静态 system prompt（L2 + L4，100% 静态）
 *
 * 调用时机：应用启动时缓存到 module 顶部，运行时直接复用
 * 缓存收益：每次 sendMessage 都不变 → LLM API prompt caching 100% 命中
 */
export function buildStaticSystemPrompt(): string {
  return [DEMO_GENERATOR_TEMPLATE, L4_NOTICE].join('\n\n---\n\n');
}

/**
 * 构建动态 L3 上下文前缀（每次 sendMessage 前重新渲染）
 *
 * 调用时机：每次 sendMessage 前
 * 注入方式：拼接到 user message 头部（不进入 system prompt）
 * 缓存表现：user message 前缀也支持缓存，但每次 L3 变化会失效（可接受）
 */
export function buildDynamicContextPrefix(context: SystemPromptContext): string {
  const l3 = render(WORKSPACE_STATUS_TEMPLATE, {
    PROJECT_NAME: context.projectName,
    PROJECT_CONFIG_STATUS: context.projectConfigStatus,
    WORKSPACE_PATH: context.workspacePath,
    PAGE_COUNT: String(context.pageCount),
    PAGE_LIST: context.pageList || '（暂无页面）',
  });

  return `[当前工作空间]\n${l3}\n\n---\n\n`;
}
