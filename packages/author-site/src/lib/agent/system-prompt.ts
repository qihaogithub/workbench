import SYSTEM_PROMPT from './prompts/system-prompt.md';
import { WORKSPACE_STATUS_TEMPLATE } from '../agent-prompts/workspace-status.template';

export interface SystemPromptContext {
  projectName: string;
  projectConfigStatus: '已设置' | '未设置';
  pageCount: number;
  pageList: string;
  workspacePath: string;
}

export interface ToolCapabilitiesForPrompt {
  toolNames?: string[];
}

function render(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replace(new RegExp(`{{${k}}}`, 'g'), v),
    template,
  );
}

function buildDeletePageRules(toolNames?: string[]): string {
  const tools = new Set(toolNames || []);
  const hasTransactionalDelete =
    tools.has('previewDeletePages') && tools.has('executeDeletePagePlan');
  const hasBatchDelete = tools.has('deletePages');

  if (hasTransactionalDelete) {
    return `### 删除页面

删除页面前必须先调用 \`listPages\` 获取当前工作区页面清单，并使用清单中精确的 \`id\`。不要根据页面名称、显示顺序或路径片段猜测页面 ID。

删除单个明确页面可使用 \`deletePage\`。批量删除、按条件删除、删除所有某类页面时，必须先调用 \`previewDeletePages\` 生成删除计划，再调用 \`executeDeletePagePlan\` 执行该计划。执行工具会在聊天区域展示确认卡，用户确认后才真正删除。

\`\`\`typescript
deletePage({
  pageId: "homepage_a3f2",
  pageName: "首页",
});
\`\`\`

\`\`\`typescript
previewDeletePages({
  mode: "nameIncludes",
  query: "副本",
});
\`\`\`

\`\`\`typescript
executeDeletePagePlan({
  planId: "delete_plan_xxx",
});
\`\`\`

注意事项：
- 当用户说"删除所有……页面"、"删除这些页面"、"批量删除"或目标数量大于 1 时，只能走 \`previewDeletePages\` → \`executeDeletePagePlan\`，不要循环调用 \`deletePage\`
- \`executeDeletePagePlan\` 只接受 \`previewDeletePages\` 返回的 \`planId\`，不得自己拼页面 ID 或 planId
- 删除失败、页面 ID 不存在、页面名称有歧义或用户取消时，必须明确告诉用户删除失败，不要声称已经删除
- 如果 \`deletePage\` 返回候选页面 ID，只能提示用户或用候选 ID 重新发起删除，不能把“不存在”当成“已删除”
- 可以删除最后一个页面；删除后项目会变为空项目
- 如果用户在确认卡中点击取消，删除不会执行
- 页面删除只能通过 \`deletePage\` / \`previewDeletePages\` / \`executeDeletePagePlan\` 完成，不要用 \`bash\`、\`node\`、\`writeFile\` 或 \`editFile\` 手动删除页面目录或修改 \`workspace-tree.json\``;
  }

  if (hasBatchDelete) {
    return `### 删除页面

当前 Agent Service 尚未提供事务化删除工具。删除页面前必须先调用 \`listPages\` 获取当前工作区页面清单，并使用清单中精确的 \`id\`。

删除单个页面使用 \`deletePage\`。批量删除多个页面使用 \`deletePages\`，一次传入所有页面 ID，不要循环调用 \`deletePage\`。

\`\`\`typescript
deletePages({
  pageIds: ["page_a", "page_b"],
});
\`\`\`

注意事项：
- 不要根据页面名称、显示顺序或路径片段猜测页面 ID
- 删除失败、页面 ID 不存在、页面名称有歧义或用户取消时，必须明确告诉用户删除失败，不要声称已经删除
- 可以删除最后一个页面；删除后项目会变为空项目
- 页面删除只能通过 \`deletePage\` / \`deletePages\` 完成，不要用 \`bash\`、\`node\`、\`writeFile\` 或 \`editFile\` 手动删除页面目录或修改 \`workspace-tree.json\``;
  }

  return `### 删除页面

当前 Agent Service 没有提供页面删除工具。你不能删除页面，也不能声称已经删除页面。

如果用户要求删除页面，请明确告诉用户：当前 Agent Service 版本过旧或工具未加载，需要重启 agent-service 并刷新创作端页面后再试。不要用 \`bash\`、\`node\`、\`writeFile\` 或 \`editFile\` 手动删除页面目录或修改 \`workspace-tree.json\`。`;
}

/**
 * 构建静态 system prompt（L2 行为约束层）。
 *
 * 删除页面规则会根据 agent-service 实际可用工具分支生成，避免 prompt 要求调用不存在的工具。
 */
export function buildStaticSystemPrompt(capabilities?: ToolCapabilitiesForPrompt): string {
  return SYSTEM_PROMPT.replace(
    /### 删除页面[\s\S]*?(?=\n## 项目级配置管理)/,
    buildDeletePageRules(capabilities?.toolNames),
  );
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

/**
 * 将知识库索引格式化为 L3 前缀（紧接页面列表之后）
 */
export function buildKnowledgeIndexPrefix(content: string): string {
  return `\n\n${content}\n`;
}
