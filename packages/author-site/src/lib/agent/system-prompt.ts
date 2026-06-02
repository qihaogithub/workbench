import { DEMO_GENERATOR_TEMPLATE } from '@opencode-workbench/shared/agent-prompts';
import { WORKSPACE_STATUS_TEMPLATE } from '../agent-prompts/workspace-status.template';

export interface SystemPromptContext {
  projectName: string;
  projectConfigStatus: '已设置' | '未设置';
  pageCount: number;
  pageList: string;
  workspacePath: string;
}

const MEMORY_MAINTENANCE_RULES = `## 项目记忆维护 (memory.md)

工作区根目录存在 \`memory.md\` 文件，用于记录跨会话的长期记忆：
- **用户可读可编辑**：用自然语言描述，非技术人员也能看懂
- **AI 自动维护**：对话中发现重要信息时自动更新
- **跨会话持久化**：切换对话后 AI 仍能通过阅读此文件了解上下文

### 何时读取 memory.md

- 每次对话开始时，memory.md 内容会自动注入到首条消息中，无需手动读取
- 用户问及项目信息时，可主动读取 memory.md 查找答案

### 何时更新 memory.md

在以下情况应使用 writeFile 工具更新 memory.md：

| 触发条件 | 示例 | 应更新章节 |
|---|---|---|
| 用户明确要求记住 | "请记住这个"、"以后都这样做" | 按内容放入对应章节 |
| 表达个人偏好 | "我不喜欢……"、"我更习惯……"、"遇到这种情况先问我" | 我的偏好 |
| 做出关键决策 | "那就用……吧"、"我们决定……" | 关键决策 |

### 不应记录什么

- 一次性操作（如"帮我调大这个按钮"）
- 讨论过程中的试探和犹豫（如"要不试试 Redux？算了还是 Zustand 吧"）—— 只记最终决定
- 可以从代码里直接看到的信息
- 密码、密钥、Token 等敏感信息
- 系统提示词中已有的编码规范（如目录结构、TypeScript、Tailwind、shadcn/ui 等）

### 如何更新

1. 更新前必须先用 readFile 读取当前 memory.md 完整内容
2. 只修改需要更新的章节，其他章节保持原样
3. 保留用户手写内容：如果某章节的措辞、格式与 AI 风格不同，不要覆盖，只追加新内容
4. 新增内容前先确认是否已有类似信息，避免重复
5. 每次修改后更新顶部「最后更新」日期
6. 极简表达：每条决策一句话说清，用「——」分隔决定和原因；偏好每条不超过 15 字
7. 字数接近 1500 时先压缩：合并同类项、删过时信息、精简表达

### 更新频率

- 同一对话中同一条信息只更新一次
- 不是每轮对话都要更新，只在发现值得记录的新信息时才写
- 简单问答或代码调试不需要更新

### memory.md 文件模板

\`\`\`markdown
# 项目记忆

> AI 自动维护 · 最后更新：YYYY-MM-DD

## 我的偏好

- 写代码前先说明思路，不要直接动手
- 拿不准时先问，不要自行决定

## 关键决策

- 首页用轮播 banner 而非静态图 —— 更有动感，素材有多张可用
\`\`\``;

const USER_CONFIRMATION_NOTICE = `## 权限确认

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
 * 构建静态 system prompt（L2 行为约束层，100% 静态）
 *
 * 调用时机：应用启动时缓存到 module 顶部，运行时直接复用
 * 缓存收益：每次 sendMessage 都不变 → LLM API prompt caching 100% 命中
 */
export function buildStaticSystemPrompt(): string {
  return [DEMO_GENERATOR_TEMPLATE, MEMORY_MAINTENANCE_RULES, USER_CONFIRMATION_NOTICE].join('\n\n---\n\n');
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
