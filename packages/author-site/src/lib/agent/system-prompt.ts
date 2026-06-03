import SYSTEM_PROMPT from './prompts/system-prompt.md';
import { WORKSPACE_STATUS_TEMPLATE } from '../agent-prompts/workspace-status.template';

export interface SystemPromptContext {
  projectName: string;
  projectConfigStatus: '已设置' | '未设置';
  pageCount: number;
  pageList: string;
  workspacePath: string;
}

function render(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replace(new RegExp(`{{${k}}}`, 'g'), v),
    template,
  );
}

/**
 * 构建静态 system prompt（L2 行为约束层，100% 静态）
 *
 * 内容来源：prompts/system-prompt.md（webpack asset/source 构建时嵌入）
 * 调用时机：应用启动时缓存到 module 顶部，运行时直接复用
 * 缓存收益：每次 sendMessage 都不变 → LLM API prompt caching 100% 命中
 */
export function buildStaticSystemPrompt(): string {
  return SYSTEM_PROMPT;
}

/**
 * 构建动态 L3 上下文前缀（每次 sendMessage 前重新渲染）
 *
 * 调用时机：每次 sendMessage 前
 * 注入方式：拼接到 user message 头部（不进入 system prompt）
 * 缓存表现：user message 前缀也支持缓存，但每次 L3 变化会失效（可接受）
 *
 * 返回的字符串直接作为 L3 全文（WORKSPACE_STATUS_TEMPLATE 内部已含 [系统自动注入...] 标记和 [系统上下文结束] 标记）
 */
export function buildDynamicContextPrefix(context: SystemPromptContext): string {
  return render(WORKSPACE_STATUS_TEMPLATE, {
    PROJECT_NAME: context.projectName,
    PROJECT_CONFIG_STATUS: context.projectConfigStatus,
    WORKSPACE_PATH: context.workspacePath,
    PAGE_COUNT: String(context.pageCount),
    PAGE_LIST: context.pageList || '（暂无页面）',
  });
}

/**
 * 将 memory.md 原始内容格式化为 L4 记忆前缀（含字数统计）
 */
export function buildMemoryPrefix(content: string): string {
  const charCount = content.replace(/\s/g, '').length;
  return `\n\n## 项目记忆（跨会话长期记忆）\n\n${content}\n\n[系统：当前 memory.md 共 ${charCount} 字]\n`;
}
