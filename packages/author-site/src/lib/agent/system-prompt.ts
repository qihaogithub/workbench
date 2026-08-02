import { generatePreviewAuthoringRules } from '@workbench/preview-contract/rules';

import SYSTEM_PROMPT from './prompts/system-prompt.md';
import { WORKSPACE_STATUS_TEMPLATE } from '../agent-prompts/workspace-status.template';

export interface SystemPromptContext {
  projectName: string;
  projectConfigStatus: '已设置' | '未设置';
  pageCount: number;
  pageList: string;
  canvasTextSummary: string;
  workspacePath: string;
}

function render(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replace(new RegExp(`{{${k}}}`, 'g'), v),
    template,
  );
}

/**
 * 构建静态 system prompt（L2 行为约束层）。
 *
 * system-prompt.md 是纯静态内容，不再包含动态分支（删除/画布规则已迁移为内置 skill）。
 */
export function buildStaticSystemPrompt(): string {
  return `${SYSTEM_PROMPT}\n\n${generatePreviewAuthoringRules()}`;
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
    CANVAS_TEXT_SUMMARY: context.canvasTextSummary || '（暂无画布文本节点）',
  });
}

/**
 * 将 memory.md 原始内容格式化为 L4 记忆前缀（含字数统计）
 */
export function buildMemoryPrefix(content: string): string {
  const charCount = content.replace(/\s/g, '').length;
  return `\n\n## 项目记忆（跨会话长期记忆）\n\n${content}\n\n[系统：当前 memory.md 共 ${charCount} 字]\n`;
}

/**
 * 将知识库索引格式化为 L3 前缀（紧接页面列表之后）
 */
export function buildKnowledgeIndexPrefix(content: string): string {
  return `\n\n${content}\n`;
}

const MAX_CONVENTION_LENGTH = 8000;

/**
 * 将项目公约内容格式化为 L2 system prompt 后缀
 * 内容为空时返回 null，超长时截断
 */
export function buildConventionPrefix(content: string | null): string | null {
  if (!content || !content.trim()) return null;
  let text = `\n\n## 项目公约（必须遵守）\n\n${content}`;
  if (text.length > MAX_CONVENTION_LENGTH) {
    text = text.slice(0, MAX_CONVENTION_LENGTH);
    text += "\n\n（公约内容已截断，完整公约请读取对应 convention.md）";
  }
  return text;
}

/**
 * 将页面公约内容格式化为 L2 system prompt 后缀
 * 内容为空时返回提示文本
 */
export function buildPageConventionPrefix(
  content: string | null,
): string | null {
  if (!content || !content.trim()) {
    return "\n\n## 当前页面公约（必须遵守）\n\n（本页面暂未设置公约）";
  }
  let text = `\n\n## 当前页面公约（必须遵守）\n\n${content}`;
  if (text.length > MAX_CONVENTION_LENGTH) {
    text = text.slice(0, MAX_CONVENTION_LENGTH);
    text += "\n\n（公约内容已截断，完整公约请读取对应 convention.md）";
  }
  return text;
}
