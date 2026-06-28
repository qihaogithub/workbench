# AI 行为约束机制完善方案

> 版本：v3.2
> 创建日期：2026-05-27
> 更新日期：2026-06-01
> 状态：📋 计划中（待实施）
> 关联文档：[03_AI行为约束机制.md](../../../项目文档/创作端/05-AI对话/技术/03_AI行为约束机制.md)、[全面迁移至Pi-Agent并移除多后端支持方案.md](../01-架构决策与技术方案/全面迁移至Pi-Agent并移除多后端支持方案.md)、[packages/agent-service/AGENTS.md](../../../../packages/agent-service/AGENTS.md)
>
> **v3.2 重大变更**（基于 LLM API 缓存优化分析）：
> 1. **L3 从 system prompt 移至 user message 前缀**：v3.1 设计中 L3 变化导致整个 system prompt 失效，缓存命中率 ≈ 0
> 2. **system prompt 100% 静态**：仅含 L2（规则）+ L4（说明），L3 不再混入 → Anthropic / OpenAI prompt caching 持续命中
> 3. **L3 实时性保持**：通过 user message 前缀注入，每次 sendMessage 重新渲染，L3 仍为最新
> 4. **`buildSystemPrompt` 拆分为两个函数**：`buildStaticSystemPrompt()` + `buildDynamicContextPrefix()`
> 5. **成本节省估算**：多轮对话中 system prompt 缓存命中 → token 成本降低 ~70%
>
> **v3.1 变更回顾**：L3 渲染上移到 author-site 端（解决 v3.0 中 system prompt 固定不变问题）。
> **v3.0 变更回顾**：删除原 v2.0 的 OpenCode 后端方案（OC-1~OC-4），适配 Pi Agent 单后端架构。

---

## 一、现状分析

### 1.1 四层约束实现状态

| 层级 | 设计 | 实现 | 实际生效 | 说明 |
| :--- | :--- | :--- | :------- | :--- |
| **L1** 文件系统权限 | ✅ | 🟡 部分 | 🟡 部分 | `pi-agent.ts:86-95` `beforeToolCall` 仅做 workingDir 边界检查；`bash-tool.ts:10` 11 个命令白名单；缺统一的 `permissions.ts` 模块（无路径白名单/黑名单、无命令黑名单） |
| **L2** 行为规则 | ✅ | ✅ | ✅ | `pi-agent.ts:387-430` `buildSystemPrompt()` 内置规则（角色/工作空间规则/代码规范/工作流程）；`demo-generator.template.md` 是外置 L2 模板（待迁移到 agent-service 端） |
| **L3** 工作空间现状 | ✅ | ❌ | ❌ | 无 L3 模板，无运行时注入机制；`demo-generator.template.md` 中"页面信息"章节本属 L3 但未拆出；`buildSystemPrompt()` 硬编码不含动态上下文 |
| **L4** 用户确认 | ✅ | ✅ | ✅ | `PermissionDialog` 组件 + `permission_request` 事件，已正常工作 |

### 1.2 关键断裂点

| 位置 | 问题 | 影响 |
| :--- | :--- | :--- |
| `pi-tools/permissions.ts` | **不存在** | L1 权限散落在 `bash-tool.ts`（硬编码白名单）和 `pi-agent.ts`（路径边界检查），无统一管理 |
| `file-tools.ts` 的 readFile/writeFile/listFiles | 无精细路径白名单/黑名单 | AI 可读 `.env`、可写工作空间内任意文件，缺细粒度控制 |
| `bash-tool.ts` | 只有 allowedCommands，无 deniedCommands | `npm install` / `npx` / `echo > file` 等命令可写文件系统但无显式禁止规则 |
| `buildSystemPrompt()` | 硬编码字符串，无 L2/L3 拆分 | AI 不感知当前工作空间的项目名/页面列表/项目配置状态 |
| `demo-generator.template.md` | 包含"页面信息"章节（{{PROJECT_NAME}} 等占位符），属 L3 内容 | 模板未拆分，L2 规则与 L3 现状混杂；该模板当前**未被任何代码使用**（迁移后无消费者） |
| `permission-config.ts` | 仍定义 `OPENCODE_CONFIG_TEMPLATE` 和 `AGENTS_MD_TEMPLATE` | 迁移后已无 OpenCode CLI 消费者，遗留死代码 |

### 1.3 L2 与 L3 的职责定义

| 层级 | 定位 | 内容 | 类比 |
| :--- | :--- | :--- | :--- |
| **L2** | 任务手册 | 怎么做、能做什么、不能做什么 | 员工手册（规则不变） |
| **L3** | 工作空间现状 | 当前工作空间有什么、是什么样 | 今日工作简报（动态变化） |

**当前问题**：`demo-generator.template.md` 的内容混杂了行为规则（属于 L2）和工作空间描述（属于 L3，"页面信息"章节含 `{{PROJECT_NAME}}` / `{{PAGE_COUNT}}` / `{{PAGE_LIST}}` 占位符），需要拆分并独立管理 L3 模板。

### 1.4 当前 `buildSystemPrompt()` 实现

`packages/agent-service/src/backends/pi-agent.ts:387-430`，硬编码字符串数组拼装：

```typescript
private buildSystemPrompt(): string {
  return [
    '你是 Workbench 的 AI 编码助手，负责生成和修改 React 组件代码。',
    '',
    '## 角色定位',
    '- 你是一个专业的 React 开发工程师',
    // ... 静态规则 ...
    '',
    '## 可用依赖',
    '- react, react-dom',
    // ...
  ].join('\n');
}
```

**缺失**：
- 无 L2 模板文件读取（`demo-generator.template.md` 当前未被使用）
- 无 L3 工作空间现状注入（项目名/页面列表/项目配置状态）
- 无 L4 权限确认说明
- 模板变量未集中管理

---

## 二、目标

完善 AI 行为约束的 L1（文件系统权限）和 L3（工作空间现状）两层，使四层约束机制全部生效：

- **L1**：建立统一权限配置模块，对文件读写（路径白/黑名单）和命令执行（命令白/黑名单）实施硬限制
- **L3**：建立动态工作空间现状描述机制（项目名/页面列表/项目配置状态），让 AI 了解所处环境
- **L2/L3 拆分**：将 `demo-generator.template.md` 中混杂的内容按职责分离（L2=规则，L3=现状），分别管理
- **Pi Agent 优先**：所有约束机制以 Pi Agent 后端为唯一目标，移除 v2.0 中 OpenCode 后端相关任务

---

## 三、约束机制架构设计

### 3.1 整体架构

```
┌──────────────────────────────────────────────────────────────────────────┐
│           AI Agent 约束机制架构（Pi Agent 后端，v3.2 静态/动态分离）       │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────┐                                             │
│  │  author-site 端        │  (业务上下文拥有者)                          │
│  │  ──────────────        │                                             │
│  │  • 扫描工作空间         │  ← 每次 sendMessage 前执行                  │
│  │  • 渲染 L3 模板         │                                             │
│  │  • 拼装 user content    │  (L3 拼到用户消息前缀)                       │
│  └─────────┬──────────────┘                                             │
│            │                                                            │
│            │  ┌──────────────────────────────────────────────────┐      │
│            │  │ 静态 System Prompt 构建管道（author-site 端）     │      │
│            │  │ ──────────────────────────────────────────       │      │
│            │  │  • 应用启动时一次性构建，缓存到 module scope       │      │
│            │  │  • 100% 静态 → 持续命中 LLM API 缓存              │      │
│            │  └──────────────────────────────────────────────────┘      │
│            │                       │                                     │
│            │                       ↓                                     │
│            │  buildStaticSystemPrompt()                                  │
│            │    = L2 模板 (shared) + L4 说明 (author-site 常量)          │
│            │                       │                                     │
│            │    ┌──────────────────┴──────────────────┐                  │
│            │    │                                     │                  │
│            │    ↓                                     ↓                  │
│            │  POST /api/agent/:sessionId/message    POST content        │
│            │    systemPrompt (静态)                  (L3 前缀 + 原始)   │
│            │    │                                     │                  │
└────────────┼────┼─────────────────────────────────────┼──────────────────┘
             │    │                                     │
             │    ↓                                     ↓
┌──────────────────────────────────────────────────────────────────────────┐
│              agent-service 端（透明代理）                                │
│                                                                          │
│  PiAgentBackend.updateSystemPrompt(staticPrompt)  ← 实际静态部分不变    │
│    → this.agent.state.systemPrompt = staticPrompt                       │
│    → 复用 Agent 实例，保留对话历史                                       │
│                                                                          │
│  agent.sendMessage(contentWithL3Prefix)  ← 完整 user 消息已含 L3         │
│    → Pi Agent 拼装：systemPrompt + [user, assistant, ..., user]          │
└────────────┬─────────────────────────────────────────────────────────────┘
             │
             ↓
┌──────────────────────────────────────────────────────────────────────────┐
│              L1 权限控制层（agent-service 端，统一模块）                  │
│  ┌──────────────────────────────────────────────────┐                   │
│  │  pi-tools/permissions.ts                         │                   │
│  │  ─────────────────────────────────              │                   │
│  │  • DEFAULT_WORKSPACE_PERMISSIONS                │                   │
│  │  • isPathAllowed(target, workingDir, config)    │                   │
│  │  • isCommandAllowed(command, config)            │                   │
│  └──────────────────────────────────────────────────┘                   │
│                       ↓                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                   │
│  │ file-tools   │  │ bash-tool    │  │ pi-agent.ts  │                   │
│  │ readFile/    │  │ 白名单+      │  │ beforeTool   │                   │
│  │ writeFile/   │  │ 黑名单校验   │  │ Call 拦截    │                   │
│  │ listFiles    │  │              │  │              │                   │
│  └──────────────┘  └──────────────┘  └──────────────┘                   │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│              前端 L4 确认层（后端无关）                                   │
│              PermissionDialog 组件                                        │
└──────────────────────────────────────────────────────────────────────────┘
```

### 3.2 约束机制分层

| 层级 | 名称 | 实现位置 | 职责 |
|:---:|:---|:---|:---|
| **L1** | 硬限制 | `agent-service/src/backends/pi-tools/permissions.ts` + `file-tools.ts` + `bash-tool.ts` + `pi-agent.ts beforeToolCall` | 文件读写路径白/黑名单 + 命令白/黑名单 |
| **L2** | 行为规则 | `shared/src/agent-prompts/demo-generator.template.ts`（TS 字符串常量） | 怎么做、能做什么、不能做什么 |
| **L3** | 工作空间现状 | `author-site/src/lib/agent-prompts/workspace-status.template.ts`（author-site 端每次 sendMessage 前动态渲染） | 当前项目名、页面列表、项目配置状态 |
| **L4** | 用户确认 | `PermissionDialog` 组件 + `permission_request` 事件 | 需要用户授权的操作 |

### 3.3 L2/L3 模板分离原则（v3.1 调整，v3.2 进一步拆分渲染函数）

**L2 模板**：`packages/shared/src/agent-prompts/demo-generator.template.ts`（TS 字符串常量导出）

- 由 `packages/author-site/src/lib/agent-prompts/demo-generator.template.md` **转换**而来（`# → \n#` 字符串转义）
- 内容：AI 角色定义、页面管理操作、项目级配置管理、代码质量标准、React 版本约束、禁止行为、文件修改决策规则
- **不含**任何 `{{...}}` 占位符（纯静态规则）
- 放 shared 包原因：author-site 和 agent-service 都需要消费（author-site 拼装 systemPrompt，agent-service 作为默认 fallback）

**L3 模板**：`packages/author-site/src/lib/agent-prompts/workspace-status.template.ts`（TS 字符串常量）

- 内容：项目信息（项目名、项目配置状态）、页面列表（运行时渲染）
- 含 `{{PROJECT_NAME}}` / `{{PROJECT_CONFIG_STATUS}}` / `{{WORKSPACE_PATH}}` / `{{PAGE_COUNT}}` / `{{PAGE_LIST}}` 占位符
- **只在 author-site 端使用**（agent-service 不感知业务上下文）

**L4 说明**：硬编码在 `author-site/src/lib/agent/system-prompt.ts` 内部（小段说明文本，无需外置模板）

> 📝 **v3.2 进一步拆分**（位置仍如上所述）：L2 + L4 由 `buildStaticSystemPrompt()` 在应用启动时一次性拼接（**完全静态 → 持续命中 LLM API 缓存**）；L3 由 `buildDynamicContextPrefix(context)` 在每次 sendMessage 前渲染后拼到 user message 前缀（**不进 system prompt**）。详见 4.3 PI-3 与 4.4 PI-4。

### 3.4 L2/L3 内容归属拆分表

| 内容 | 当前位置 | 目标位置 | 渲染时机 | 原因 |
| :--- | :--- | :--- | :--- | :--- |
| AI 角色定义 | `author-site/.../demo-generator.template.md` | **L2**（shared 包 TS 字符串） | 应用启动时一次性加载 | 属于规则 |
| 工作空间结构（静态模板） | `author-site/.../demo-generator.template.md` | **L3**（author-site 端 TS 字符串） | 每次 sendMessage 前重新渲染 | 属于现状描述 |
| 页面信息（运行时注入） | `author-site/.../demo-generator.template.md`（"页面信息"章节） | **L3**（author-site 端动态渲染） | 每次 sendMessage 前重新渲染 | 属于现状描述 |
| 页面管理操作流程 | `author-site/.../demo-generator.template.md` | **L2**（shared 包 TS 字符串） | 应用启动时一次性加载 | 属于"怎么做" |
| 项目配置管理流程 | `author-site/.../demo-generator.template.md` | **L2**（shared 包 TS 字符串） | 应用启动时一次性加载 | 属于"怎么做" |
| 代码质量标准 | `author-site/.../demo-generator.template.md` | **L2**（shared 包 TS 字符串） | 应用启动时一次性加载 | 属于"怎么做" |
| 文件修改决策规则 | `author-site/.../demo-generator.template.md` | **L2**（shared 包 TS 字符串） | 应用启动时一次性加载 | 属于"怎么做" |
| 禁止行为清单 | `author-site/.../demo-generator.template.md` | **L2**（shared 包 TS 字符串） | 应用启动时一次性加载 | 属于"不能做什么" |
| 项目名 / 页面列表 / 项目配置状态 | （缺失） | **L3**（author-site 端动态渲染） | 每次 sendMessage 前重新渲染 | 属于现状描述 |
| 权限确认说明 | （缺失） | **L4**（author-site 端常量） | 应用启动时一次性加载 | 属于交互规则 |

---

## 四、技术方案：Pi Agent 后端

### 4.1 Task PI-1：创建权限配置模块

**目标**：建立统一的权限配置结构，支持 Pi Agent 工具层校验。

**新建文件**：`packages/agent-service/src/backends/pi-tools/permissions.ts`

**核心要点**：
- 与当前 `bash-tool.ts:10` 已有的 11 个命令白名单保持一致
- 路径校验：先检查 `deniedPatterns`（黑名单优先），再检查 `allowedPaths`（白名单）
- 命令校验：先检查 `deniedCommands`，再检查 `allowedCommands`

```typescript
import path from "path";

export interface PermissionConfig {
  allowedPaths: string[];
  deniedPatterns: string[];
  allowedCommands: string[];
  deniedCommands: string[];
}

export const DEFAULT_WORKSPACE_PERMISSIONS: PermissionConfig = {
  allowedPaths: [
    "demos/*/index.tsx",
    "demos/*/config.schema.json",
    "demos/*/.demo.json",
    "project.config.schema.json",
    "AGENTS.md",
    "index.tsx",
    "config.schema.json",
  ],
  deniedPatterns: [
    "**/*.env",
    "**/*.env.*",
    "**/.git/**",
    "**/node_modules/**",
    "**/packages/**",
    "**/.opencode/**",
    "**/.workspace.json",
    "**/.session.json",
  ],
  // 与 pi-tools/bash-tool.ts:10 保持一致
  allowedCommands: ["npm", "node", "npx", "ls", "cat", "head", "tail", "grep", "find", "wc", "echo"],
  deniedCommands: ["rm", "rmdir", "mv", "cp", "mkdir", "sudo", "chmod", "chown"],
};

export function isPathAllowed(
  targetPath: string,
  workingDir: string,
  config: PermissionConfig
): boolean { /* ... 与 v2.0 相同 ... */ }

export function isCommandAllowed(
  command: string,
  config: PermissionConfig
): boolean { /* ... 与 v2.0 相同 ... */ }

function matchGlob(filePath: string, pattern: string): boolean { /* ... 与 v2.0 相同 ... */ }
```

> 📝 **实现说明**：本节代码结构与 v2.0 PI-1 完全一致，仅修正了 `allowedCommands` 列表（与现有 `bash-tool.ts:10` 对齐）和补充了 `import path` 缺失。完整代码可参考附录 A 权限配置模板。

---

### 4.2 Task PI-2：权限感知的工具实现

**目标**：在 `file-tools.ts` 和 `bash-tool.ts` 中集成 `permissions.ts` 的校验逻辑。

**修改文件**：
- `packages/agent-service/src/backends/pi-tools/file-tools.ts`（readFile/writeFile/listFiles）
- `packages/agent-service/src/backends/pi-tools/bash-tool.ts`（bash）
- `packages/agent-service/src/backends/pi-agent.ts`（beforeToolCall 也调用 `isPathAllowed`）

**改造要点**：

1. **扩展 `AgentConfig`**：在 `core/types.ts` 中给 `AgentConfig` 添加 `permissions?: PermissionConfig` 字段

```typescript
// core/types.ts
import type { PermissionConfig } from "../backends/pi-tools/permissions";

export interface AgentConfig {
  // ... 现有字段
  permissions?: PermissionConfig;
}
```

2. **file-tools.ts 改造**：在 `readFile` / `writeFile` / `listFiles` 三个工具的 `execute` 开头添加 `isPathAllowed` 校验

```typescript
// file-tools.ts
import { isPathAllowed, DEFAULT_WORKSPACE_PERMISSIONS } from "./permissions";

export function createReadFileTool(config: AgentConfig): AgentTool<typeof ReadFileParams> {
  const permissions = config.permissions ?? DEFAULT_WORKSPACE_PERMISSIONS;

  return {
    name: 'readFile',
    // ... 其他字段不变
    execute: async (toolCallId, args) => {
      if (!isPathAllowed(args.path, config.workingDir ?? '', permissions)) {
        return {
          content: [{ type: 'text', text: `Error: path "${args.path}" is not allowed by workspace permissions` }],
          details: { path: args.path, error: 'permission denied' },
          isError: true,
        };
      }
      // ... 原有读取逻辑
    },
  };
}

// createWriteFileTool / createListFilesTool 同理
```

3. **bash-tool.ts 改造**：把硬编码 `ALLOWED_COMMANDS` 替换为从 `config.permissions` 读取

```typescript
// bash-tool.ts
import { isCommandAllowed, DEFAULT_WORKSPACE_PERMISSIONS } from "./permissions";

export function createBashTool(config: AgentConfig): AgentTool<typeof BashParams> {
  const permissions = config.permissions ?? DEFAULT_WORKSPACE_PERMISSIONS;

  return {
    name: 'bash',
    execute: async (toolCallId, args) => {
      if (!isCommandAllowed(args.command, permissions)) {
        return {
          content: [{ type: 'text', text: `Error: command not allowed. Allowed: ${permissions.allowedCommands.join(', ')}. Denied: ${permissions.deniedCommands.join(', ')}` }],
          details: { command: args.command, error: 'permission denied' },
          isError: true,
        };
      }
      // ... 原有执行逻辑
    },
  };
}
```

4. **pi-agent.ts 改造**：`beforeToolCall` 中已有 workingDir 检查，替换为 `isPathAllowed` 调用

```typescript
// pi-agent.ts 第 86-95 行替换
beforeToolCall: async (context: any) => {
  const toolName = context.toolCall.name;
  if (toolName === 'readFile' || toolName === 'writeFile' || toolName === 'listFiles') {
    const args = context.args as { path?: string };
    if (args.path && !isPathAllowed(args.path, this.config.workingDir ?? '', this.config.permissions ?? DEFAULT_WORKSPACE_PERMISSIONS)) {
      return { block: true, reason: `Access denied: path "${args.path}" is not allowed by workspace permissions` };
    }
  }
  return undefined;
},
```

> 📝 **决策点**：当前 `pi-agent.ts:86-95` 的 `beforeToolCall` 是第一道防线（直接返回 `block: true`），文件工具内部的 `isPathAllowed` 是第二道防线（返回 `isError: true`）。两道防线都需要保留：`beforeToolCall` 防止 AI 调用工具；工具内部校验防止编程错误绕过。

---

### 4.3 Task PI-3：System Prompt 构建（v3.2 静态/动态拆分）

**目标**：在 `author-site` 端实现 L2 + L4 静态 system prompt 构建 + L3 动态 user message 前缀生成，使 LLM API 缓存命中率最大化。

**变更范围**：

| 操作 | 文件 | 说明 |
|:---|:---|:---|
| 新建 | `packages/shared/src/agent-prompts/demo-generator.template.ts` | L2 模板（TS 字符串常量，跨包共享） |
| 新建 | `packages/author-site/src/lib/agent-prompts/workspace-status.template.ts` | L3 模板（TS 字符串常量） |
| 新建 | `packages/author-site/src/lib/agent/system-prompt.ts` | **拆分**为 `buildStaticSystemPrompt()` + `buildDynamicContextPrefix(context)` + `SystemPromptContext` 类型 |
| **删除** | `packages/author-site/src/lib/agent-prompts/demo-generator.template.md` | 转换为 TS 字符串常量（更类型安全） |
| **删除** | `packages/author-site/src/lib/agent-prompts/references/` | 仅文档参考，无代码引用 |

**L2 模板**（`shared/src/agent-prompts/demo-generator.template.ts`）— **从 markdown 转换为 TS 字符串**：

转换规则：将原 markdown 文件内容用 TS 反引号字符串包裹，`# Demo Generator Agent` 前的任何 markdown 元数据移除。源文件 `packages/author-site/src/lib/agent-prompts/demo-generator.template.md` 在转换前需手动删除"## 工作空间结构"和"## 页面信息"两个 L3 章节。

```typescript
// packages/shared/src/agent-prompts/demo-generator.template.ts
export const DEMO_GENERATOR_TEMPLATE = `# Demo Generator Agent

你是 OpenCode Workbench 的项目 Demo 生成专家。
你的工作区是一个完整的项目工作空间，包含多个 Demo 页面。

## 页面内容编辑
（... 与原 markdown 文件相同，移除 L3 章节后 ...）

## 页面管理操作
（... 与原 markdown 文件相同 ...）

## 项目级配置管理（运行时注入，简化约束）
（... 与原 markdown 文件相同 ...）

## 代码质量标准（每个页面内）
（... 与原 markdown 文件相同 ...）

## React 版本约束
（... 与原 markdown 文件相同 ...）

# 参考文件
（... 与原 markdown 文件相同 ...）

## 禁止行为
（... 与原 markdown 文件相同 ...）

## 文件修改决策规则
（... 与原 markdown 文件相同 ...）
`;
```

> 📝 **决策点 - 模板格式**：使用 TS 反引号字符串而非 .md 文件的原因：
> 1. **类型安全**：编译期常量，无文件 IO 失败风险
> 2. **包导出友好**：shared 包直接 `export const`，消费方 `import { DEMO_GENERATOR_TEMPLATE } from "@opencode-workbench/shared"`
> 3. **bundler 友好**：不需要 markdown loader 配置
> 4. **运行时性能**：常量内联，无 IO 开销

**L3 模板**（`author-site/src/lib/agent-prompts/workspace-status.template.ts`）— **新建**：

```typescript
// packages/author-site/src/lib/agent-prompts/workspace-status.template.ts
export const WORKSPACE_STATUS_TEMPLATE = `## 当前工作空间

**项目**: {{PROJECT_NAME}}
**项目配置**: {{PROJECT_CONFIG_STATUS}}
**工作空间**: \`{{WORKSPACE_PATH}}\`
**页面数量**: {{PAGE_COUNT}}

{{PAGE_LIST}}
`;
```

**system-prompt.ts 实现**（v3.2 拆分静态/动态）：

```typescript
// packages/author-site/src/lib/agent/system-prompt.ts
import { DEMO_GENERATOR_TEMPLATE } from '@opencode-workbench/shared';
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

  // 用 [当前工作空间] 标记开头，便于 LLM 识别
  return `[当前工作空间]\n${l3}\n\n---\n\n`;
}
```

**工作空间扫描工具函数**（author-site 端复用）：

```typescript
// packages/author-site/src/lib/agent/scan-workspace.ts
import * as fs from 'fs';
import * as path from 'path';

export async function scanWorkspaceContext(workingDir: string): Promise<SystemPromptContext> {
  // 1. 扫描 demos/ 目录
  const demosDir = path.join(workingDir, 'demos');
  const pages: Array<{ id: string; name: string }> = [];
  if (fs.existsSync(demosDir)) {
    for (const entry of fs.readdirSync(demosDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const demoJsonPath = path.join(demosDir, entry.name, '.demo.json');
        let name = entry.name;
        if (fs.existsSync(demoJsonPath)) {
          try {
            const meta = JSON.parse(fs.readFileSync(demoJsonPath, 'utf-8'));
            name = meta.name || entry.name;
          } catch { /* 解析失败用目录名 */ }
        }
        pages.push({ id: entry.name, name });
      }
    }
  }

  // 2. 检测项目级配置存在性
  const hasProjectConfig = fs.existsSync(path.join(workingDir, 'project.config.schema.json'));

  // 3. 渲染 L3 页面列表
  const pageList = pages.length > 0
    ? pages.map((p, i) => `${i + 1}. **${p.name}** (\`demos/${p.id}/\`)`).join('\n')
    : '（暂无页面）';

  // 4. 项目名（暂时用工作空间目录名）
  const projectName = path.basename(workingDir);

  return {
    projectName,
    projectConfigStatus: hasProjectConfig ? '已设置' : '未设置',
    pageCount: pages.length,
    pageList,
    workspacePath: workingDir,
  };
}
```

> 📝 **决策点 - L3 渲染上移到 author-site 端**（v3.1 关键变更）：
>
> 1. **业务上下文归属清晰**：项目名/页面列表怎么解析是 author-site 业务知识（"如何扫描 demos 目录"），agent-service 不应知道
> 2. **每次对话自动最新**：author-site 在 sendMessage 前重新扫描 + 渲染 → 拼到 user message 前缀 → LLM 立即看到最新
> 3. **无跨包文件读取**：L2 模板放 shared 包（TS 字符串常量），L3 模板只在 author-site 端
> 4. **性能可接受**：扫描 `demos/` 目录 + 解析 `.demo.json` < 10ms（几十个文件场景）
> 5. **与 Pi Agent core 兼容**：`AgentState.systemPrompt` 是可写字段，运行时赋值即可
>
> 📝 **决策点 - L3 拆分到 user message 前缀**（v3.2 关键变更）：
>
> 1. **LLM API 缓存命中率最大化**：system prompt 100% 静态 → Anthropic Prompt Caching / OpenAI 自动前缀缓存持续命中
> 2. **成本节省**：多轮对话中 system prompt 部分 token 成本降低 ~70%（cache_read ≈ 10% 写入价）
> 3. **L3 实时性保持**：user message 前缀每次重新拼装，LLM 看到的内容仍是最新
> 4. **实现简单**：author-site 端仅需把 `dynamicContext` 拼到 `content` 前面
> 5. **副作用可忽略**：L3 视为"用户消息"对 LLM 行为影响极小（事实陈述，非指令）

---

### 4.4 Task PI-4：PiAgentBackend 集成（v3.2 静态/动态职责分离）

**目标**：删除 `pi-agent.ts` 中硬编码的 `buildSystemPrompt()` 方法，新增 `updateSystemPrompt()` 方法。**v3.2 关键变更**：`updateSystemPrompt()` 只接收**静态部分**（L2 + L4），L3 动态部分由 author-site 端拼装到 user message 前缀（不进 system prompt）。

**修改文件**：
- `packages/agent-service/src/backends/pi-agent.ts`（核心改造）
- `packages/agent-service/src/routes/agent.ts`（API 端接收 systemPrompt 字段）
- `packages/agent-service/src/routes/websocket.ts`（WebSocket 端同步处理）

**变更点**：

1. **删除内联 `buildSystemPrompt()` 方法**（`pi-agent.ts:387-430`）：

```typescript
// 删除整个方法（约 44 行）
// private buildSystemPrompt(): string { ... }
```

2. **使用占位 systemPrompt 初始化**（`pi-agent.ts:67-72` 改造）：

```typescript
// 改造前
this.agent = new Agent({
  initialState: {
    model: model,
    systemPrompt: this.buildSystemPrompt(),  // ← 删除
    tools: tools,
  },
  // ...
});

// 改造后：使用占位 systemPrompt（author-site 端 updateSystemPrompt 会覆盖）
this.agent = new Agent({
  initialState: {
    model: model,
    systemPrompt: '# Workbench AI 编码助手\n\n等待 system prompt 注入...',  // ← 占位
    tools: tools,
  },
  // ...
});
```

3. **新增 `updateSystemPrompt()` 方法**（仅更新静态部分，运行时调用）：

```typescript
// pi-agent.ts 新增
import { buildStaticSystemPrompt } from '@opencode-workbench/shared/agent-prompts';
// 或直接在 agent-service 端从 shared 导入 L2 + L4 常量

/**
 * 运行时更新 system prompt（不重建 Agent，保留对话历史）
 *
 * v3.2 变更：仅接收静态部分（L2 + L4），L3 走 user message 前缀
 * 关键：依赖 Pi Agent core 的 AgentState.systemPrompt 是可写字段
 * 引用：node_modules/@earendil-works/pi-agent-core/dist/types.d.ts:278-280
 *
 * 调用频率：可低频（静态部分实际上一次都不变），保留接口以备规则更新
 */
async updateSystemPrompt(newPrompt: string): Promise<void> {
  if (!this.agent) {
    logger.warn('updateSystemPrompt called before agent initialized, ignoring');
    return;
  }
  this.agent.state.systemPrompt = newPrompt;
  logger.debug({ promptLength: newPrompt.length }, 'System prompt updated');
}
```

4. **`routes/agent.ts` 接收 `systemPrompt` 字段（v3.2 仅静态部分）**：

```typescript
// routes/agent.ts SendMessageBody 接口扩展
interface SendMessageBody {
  content: string;          // ← v3.2: author-site 端已把 L3 拼到 content 前面
  demoId?: string;
  workingDir?: string;
  customWorkspace?: boolean;
  model?: string;
  systemPrompt?: string;    // ← 新增：仅静态部分（L2 + L4）
  options?: { timeout?: number; stream?: boolean };
}

// message 路由 handler 中
const { content, demoId, workingDir, customWorkspace, model, systemPrompt, options } = request.body;

// ... (workspace 创建逻辑不变) ...

const agent = manager.getOrCreate(sessionId, config);

// 若 author-site 传入了静态 systemPrompt，运行时更新
// 注：实际静态部分永远不变，可省略；但保留接口以备规则调整
if (systemPrompt) {
  await agent.updateSystemPrompt(systemPrompt);
}

// ... (后续 sendMessage 逻辑不变，content 已含 L3 前缀) ...
const result = await agent.sendMessage(content, options);
```

5. **`routes/websocket.ts` 同步处理**（与 routes/agent.ts 类似）：

```typescript
// websocket message 处理器中
const { content, systemPrompt } = parsedMessage.payload;
if (systemPrompt) {
  await agent.updateSystemPrompt(systemPrompt);
}
const result = await agent.sendMessage(content);
```

6. **修改 `IBackendAdapter` 接口**（`core/types.ts`）：

```typescript
// core/types.ts
export interface IBackendAdapter {
  // ... 现有方法
  updateSystemPrompt?(newPrompt: string): Promise<void>;  // ← 新增（可选）
}
```

> 📝 **决策点 - 运行时更新 vs 重建 Agent**：
>
> - **运行时更新**（采用）：`agent.state.systemPrompt = newPrompt`
>   - 优点：保留对话历史（messages 数组不变），无重建开销
>   - 依据：Pi Agent core `types.d.ts:280` 注释 "System prompt sent with each model request" — 每次请求读取最新值
>   - 风险：极低（已有 Pi Agent 内部 setter 语义）
>
> - **重建 Agent**（备选）：`agent.destroy() → new PiAgentBackend() → agent.initialize(newPrompt)`
>   - 优点：状态完全重置
>   - 缺点：丢失对话历史（用户体验差），初始化开销 ~100ms
>   - 不采用
>
> 📝 **决策点 - v3.2 静态/动态职责分离**：
>
> - **静态 system prompt**（system prompt 字段）：L2 + L4，100% 不变 → 持续命中 LLM API 缓存
> - **动态 L3 上下文**（user message 前缀）：每次 sendMessage 前 author-site 端拼装 → LLM 看到的内容仍是最新
> - **API 边界**：`systemPrompt` 字段仅承载静态部分（实际上永远不变），L3 通过 `content` 字段头部传入
> - **向后兼容**：未来若 L2/L4 规则更新（如新增"禁止行为"），可通过 `updateSystemPrompt` 推送到所有 session

**author-site 端集成（v3.2 关键改造）**：

```typescript
// packages/author-site/src/lib/agent/client.ts（v3.2 改造）
import {
  buildStaticSystemPrompt,
  buildDynamicContextPrefix,
} from './system-prompt';
import { scanWorkspaceContext } from './scan-workspace';
import type { AgentClient } from '@opencode-workbench/agent-client';

// 静态 system prompt 可在 module 顶部缓存（启动后不再变）
const STATIC_SYSTEM_PROMPT = buildStaticSystemPrompt();

export async function sendAgentMessage(
  client: AgentClient,
  sessionId: string,
  content: string,
  workingDir: string,
): Promise<void> {
  // 1. 扫描工作空间 → 渲染 L3
  const context = await scanWorkspaceContext(workingDir);
  const dynamicContext = buildDynamicContextPrefix(context);

  // 2. 拼装最终 user content（L3 前缀 + 原始内容）
  const finalContent = `${dynamicContext}${content}`;

  // 3. 发送（静态 systemPrompt 实际不变，但传过去无害）
  await client.sendMessage(sessionId, {
    content: finalContent,
    workingDir,
    systemPrompt: STATIC_SYSTEM_PROMPT,  // 100% 静态，缓存友好
  });
}
```

**最终 LLM 看到的内容结构**：

```
┌─────────────────────────────────────────────────────────────┐
│ system prompt（每次 API 调用固定不变 → 持续命中缓存）         │
│ ─────────────────────────────────────────                   │
│ # Demo Generator Agent                                      │
│ （L2 规则，~5KB）                                            │
│ ---                                                         │
│ ## 权限确认                                                 │
│ （L4 说明，~200B）                                           │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ messages[0]（user，含动态 L3 前缀）                          │
│ ─────────────────────────────────────────                   │
│ [当前工作空间]                                              │
│ ## 当前工作空间                                             │
│ **项目**: MyProject                                         │
│ **页面数量**: 3                                             │
│ 1. **首页** (`demos/home/`)                                  │
│ 2. **关于** (`demos/about/`)                                 │
│ 3. **设置** (`demos/settings/`)                              │
│ ---                                                         │
│                                                             │
│ 帮我修改首页的标题颜色为蓝色                                  │ ← 原始 content
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ messages[1..N]（多轮对话历史）                                │
│ ─────────────────────────────────────────                   │
│ assistant: ...                                              │
│ user: ...                                                   │
│ ...                                                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 五、实施任务总览

### 5.1 任务清单（v3.2 调整）

| 顺序 | 任务 | 工作量 | 依赖 |
|:---:|:---|:---:|:---:|
| PI-1 | 创建 `pi-tools/permissions.ts` | 1h | 无 |
| PI-2 | 权限感知工具改造（file-tools + bash-tool + pi-agent beforeToolCall） | 2h | PI-1 |
| PI-3 | L2 模板转 TS 字符串（shared 包）+ L3 模板新建（author-site）+ **`buildStaticSystemPrompt` + `buildDynamicContextPrefix`** + `scanWorkspaceContext` | 2h | 无 |
| PI-4 | `PiAgentBackend.updateSystemPrompt()` + 路由接收 systemPrompt 字段 + author-site client 集成（L3 拼到 user message 前缀） | 2.5h | PI-3 |
| 验证 | 单元测试 + 集成测试 + E2E（含多轮对话 L3 实时性 + **LLM API 缓存命中验证**） | 2.5h | PI-1~4 |

**总计**：~10 小时（与 v3.1 相同；v3.2 拆分静态/动态渲染函数实现复杂度相近）

### 5.2 实施阶段（v3.2 调整）

**Phase 1：L1 权限 + L2 静态模板 + L3 动态渲染基础（无 agent-service 依赖）**

```
PI-1 ──→ PI-2 ───────────────────────────┐
                                         │
PI-3 ──→ PI-4(部分：agent-service 端) ──→ PI-4(完整：author-site 端) ──→ 验证
```

**关键依赖关系**：
- PI-1 → PI-2：权限模块是工具改造的前置
- PI-3 无前置（与 PI-1/PI-2 并行可行）
- PI-4 依赖 PI-1（注入 permissions）和 PI-3（接收 systemPrompt 字段 + 拆分渲染函数）

### 5.3 实施顺序建议

**推荐：双线并行 + 后端集成**

```
主线 A（L1）：PI-1 → PI-2 ──────────────────────┐
                                                │
主线 B（L2/L3）：PI-3 (模板 + 拆分渲染) ──→ PI-4 集成 ┴─→ 统一验证
```

- **主线 A**：纯 agent-service 端，无前端依赖
- **主线 B**：跨端（author-site + agent-service + shared），可与主线 A 并行
- 两条主线在 PI-4 汇合

### 5.4 关键里程碑

| 里程碑 | 验收标准 |
|:---|:---|
| **M1**：L1 权限生效 | `pi-tools/permissions.ts` 单元测试通过，工具层接入 `isPathAllowed` / `isCommandAllowed`，beforeToolCall 工作 |
| **M2**：L2/L3 模板与渲染函数就绪 | L2 字符串常量在 shared 包导出，L3 字符串在 author-site 导出，`buildStaticSystemPrompt` + `buildDynamicContextPrefix` + `scanWorkspaceContext` 单元测试通过 |
| **M3**：运行时更新 + 静态/动态分离生效 | `PiAgentBackend.updateSystemPrompt()` 单元测试通过；多轮对话 L3 实时反映工作空间变更；**LLM API 缓存命中率验证通过** |
| **M4**：完整集成 | 端到端测试：AI 写文件 → 下一轮对话 L3 含新页面；system prompt 持续命中 LLM API 缓存 |

---

## 六、修改文件清单（v3.2 调整）

### 6.1 新建文件

| 文件 | 关联任务 | 所属包 | 说明 |
|:---|:---:|:---|:---|
| `packages/agent-service/src/backends/pi-tools/permissions.ts` | PI-1 | agent-service | 权限配置（`PermissionConfig` 接口、`DEFAULT_WORKSPACE_PERMISSIONS` 常量、`isPathAllowed` / `isCommandAllowed` / `matchGlob` 函数） |
| `packages/shared/src/agent-prompts/demo-generator.template.ts` | PI-3 | **shared** | L2 模板 TS 字符串常量（从 `author-site/.../demo-generator.template.md` 转换，移除 L3 章节） |
| `packages/shared/src/agent-prompts/index.ts` | PI-3 | shared | shared 包新增的 `agent-prompts` 目录导出 |
| `packages/author-site/src/lib/agent-prompts/workspace-status.template.ts` | PI-3 | author-site | L3 模板 TS 字符串常量（含 `{{PROJECT_NAME}}` 等占位符） |
| `packages/author-site/src/lib/agent/system-prompt.ts` | PI-3 | author-site | **v3.2 拆分**：`buildStaticSystemPrompt()` (L2 + L4) + `buildDynamicContextPrefix(context)` (L3 渲染) + `SystemPromptContext` 接口 + L4 常量 |
| `packages/author-site/src/lib/agent/scan-workspace.ts` | PI-3 | author-site | `scanWorkspaceContext(workingDir)` 函数，扫描 `demos/` 目录 + 解析 `.demo.json` |
| `packages/author-site/src/lib/agent/client.ts` | PI-4 | author-site | `sendAgentMessage()` 封装：**v3.2 改造**为扫描 → 渲染 L3 → 拼到 user content 前面 + 静态 systemPrompt 字段 |
| `packages/author-site/src/lib/agent/__tests__/system-prompt.test.ts` | 验证 | author-site | `buildStaticSystemPrompt` + `buildDynamicContextPrefix` + `scanWorkspaceContext` 单元测试 |

### 6.2 修改文件

| 文件 | 关联任务 | 说明 |
|:---|:---:|:---|
| `packages/agent-service/src/core/types.ts` | PI-2, PI-4 | (PI-2) 给 `AgentConfig` 添加 `permissions?: PermissionConfig` 字段；(PI-4) 给 `IBackendAdapter` 添加 `updateSystemPrompt?()` 可选方法 |
| `packages/agent-service/src/backends/pi-tools/file-tools.ts` | PI-2 | `createReadFileTool` / `createWriteFileTool` / `createListFilesTool` 三个工具的 `execute` 开头添加 `isPathAllowed` 校验 |
| `packages/agent-service/src/backends/pi-tools/bash-tool.ts` | PI-2 | 删除硬编码 `ALLOWED_COMMANDS` 常量，替换为从 `config.permissions` 读取的 `isCommandAllowed` 校验 |
| `packages/agent-service/src/backends/pi-agent.ts` | PI-2, PI-4 | (PI-2) `beforeToolCall` 中 workingDir 检查替换为 `isPathAllowed`；(PI-4) 删除内联 `buildSystemPrompt()`（387-430 行）、新增 `updateSystemPrompt()` 方法（**v3.2 仅接收静态部分**）、修改 `initialize()` 使用占位 systemPrompt |
| `packages/agent-service/src/backends/pi-tools/index.ts` | PI-1, PI-2 | 验证 `createWorkbenchTools` 把 `permissions` 透传给所有工具 |
| `packages/agent-service/src/routes/agent.ts` | PI-4 | `SendMessageBody` 接口添加 `systemPrompt?: string`（**v3.2 仅静态部分**）；message handler 在 `agent.sendMessage()` 前调用 `agent.updateSystemPrompt()` |
| `packages/agent-service/src/routes/websocket.ts` | PI-4 | WebSocket message handler 同步接收并应用 `systemPrompt` 字段 |
| `packages/agent-client/src/types.ts` | PI-4 | `SendMessageOptions` 添加 `systemPrompt?: string` 字段 |
| `packages/author-site/src/lib/agent-prompts/demo-generator.template.md` | PI-3 | **删除**：转换为 TS 字符串常量放 shared 包（手动迁移内容后删除） |
| `packages/author-site/src/lib/agent-prompts/references/` | PI-3 | **删除目录**：仅 markdown 参考文档，无代码引用 |
| `packages/author-site/src/lib/templates/permission-config.ts` | 清理 | **删除**：`OPENCODE_CONFIG_TEMPLATE` 和 `AGENTS_MD_TEMPLATE` 均为死代码（v3.0 已识别） |

### 6.3 不需要修改的文件

| 文件 | 原因 |
|:---|:---|
| `packages/author-site/src/components/ai-elements/*` | L4 前端组件不受影响（PermissionDialog 正常工作） |
| `packages/agent-service/src/backends/pi-tools/schema-tool.ts` | `schemaValidate` 工具无文件操作，不涉及权限 |
| `packages/agent-service/src/core/agent-factory.ts` | Pi Agent 工厂已硬编码，无需改动 |
| `packages/agent-service/src/core/agent.ts` | BaseAgent 不涉及 system prompt 组装 |
| `packages/agent-service/src/session/*` | session 机制与 system prompt 解耦，无需改动 |

---

## 七、验证清单（v3.2 调整）

### 7.1 L1 硬限制验证

- [ ] `pi-tools/permissions.ts` 单元测试：`isPathAllowed` / `isCommandAllowed` / `matchGlob` 覆盖白名单/黑名单/边界场景
- [ ] AI 尝试 `readFile('.env')` → `beforeToolCall` 拦截，返回 `block: true`；工具层也返回 `isError: true`（双保险）
- [ ] AI 尝试 `readFile('packages/agent-service/src/foo.ts')` → 越界访问被拒
- [ ] AI 尝试 `writeFile('demos/foo/.demo.json')` → 白名单内允许
- [ ] AI 尝试 `writeFile('.workspace.json')` → 黑名单拒绝
- [ ] AI 尝试 `bash('rm -rf demos')` → 命令黑名单拒绝
- [ ] AI 尝试 `bash('npm install xxx')` → allowedCommands 含 `npm`，允许执行
- [ ] AI 尝试 `bash('echo "x" > /tmp/test')` → allowedCommands 含 `echo`，允许（注意：echo 重定向可写文件系统，需结合 deniedCommands 或后续细化）

### 7.2 L2 行为规则验证

- [ ] `shared/src/agent-prompts/demo-generator.template.ts` 不含 `{{...}}` 占位符（纯静态）
- [ ] `shared/src/agent-prompts/demo-generator.template.ts` 不含"工作空间结构"和"页面信息"章节
- [ ] `shared` 包正确导出 `DEMO_GENERATOR_TEMPLATE` 常量
- [ ] author-site 端和 agent-service 端都能 `import` 消费
- [ ] L2 模板内容被 Pi Agent 正常注入到 system prompt
- [ ] AI 行为符合 L2 规则（如：不会主动修改其他 Demo 目录）

### 7.3 L3 工作空间现状验证（含**实时性验证** + **v3.2 LLM API 缓存命中验证**）

- [ ] `author-site/src/lib/agent-prompts/workspace-status.template.ts` 包含 5 个占位符：`{{PROJECT_NAME}}` / `{{PROJECT_CONFIG_STATUS}}` / `{{WORKSPACE_PATH}}` / `{{PAGE_COUNT}}` / `{{PAGE_LIST}}`
- [ ] **v3.2 拆分后单元测试**：
  - [ ] `buildStaticSystemPrompt()` 正确返回 L2 + L4 拼接的纯静态字符串（**不含** `{{...}}` 占位符）
  - [ ] `buildDynamicContextPrefix(context)` 正确渲染所有占位符，返回仅 L3 部分
  - [ ] `scanWorkspaceContext(workingDir)` 正确扫描 demos 目录并解析 `.demo.json` 中的 name
- [ ] **v3.2 位置验证**：
  - [ ] L2 + L4 出现在 system prompt（每次 API 调用固定不变）
  - [ ] L3 出现在 user message 前缀（**不是** system prompt）
  - [ ] 最终 LLM 看到的内容结构符合 4.4 PI-4 末尾的 ASCII 图
- [ ] **🆕 多轮对话 L3 实时性验证**（核心）：
  - [ ] 场景 A（页面新增）：第 1 轮对话 user content 前缀 L3 显示 "包含 1 个页面" → AI 调用 `writeFile` 新建 `demos/page2/` → 第 2 轮对话 user content 前缀 L3 显示 "包含 2 个页面"
  - [ ] 场景 B（页面删除）：手动 `rm -rf demos/page2/` → 下一轮对话 user content 前缀 L3 显示 "包含 1 个页面"
  - [ ] 场景 C（项目配置）：新增 `project.config.schema.json` → 下一轮对话 user content 前缀 L3 显示 "项目配置: 已设置"
  - [ ] 场景 D（对话历史保留）：多轮 L3 更新后，AI 仍能引用之前对话中提到的内容（验证 `updateSystemPrompt` 不丢失 messages）
- [ ] **🆕 性能验证**：100 个文件工作空间，`scanWorkspaceContext` 耗时 < 50ms
- [ ] **🆕 v3.2 LLM API 缓存命中验证**（核心）：
  - [ ] **Anthropic Prompt Caching**：连续 3 轮对话，请求响应中 `usage.cached_tokens` 字段不为 0（说明 system prompt 命中缓存）；通过 `cache_creation_input_tokens` 仅在第 1 轮出现 > 0，后续 2 轮为 0
  - [ ] **OpenAI Auto Prefix Cache**（如使用）：连续 3 轮对话，观察 LLM provider 日志或 response metadata，确认 system prompt 100% 命中 prefix cache（OpenAI 不直接暴露该指标，可通过延迟降低 ~30% 间接验证）
  - [ ] **手动验证**：在 author-site 前端 UI 进行 3 轮连续对话 → 后端日志记录每次请求的 system prompt 长度 + hash → 3 次 hash 应完全一致
  - [ ] **回归验证**：在某轮对话中创建新页面（变更 L3）→ 第 2 轮 L3 内容更新 → 验证 system prompt hash **仍不变**（确认 L3 已从 system prompt 移出）

### 7.4 L4 用户确认验证

- [ ] `PermissionDialog` 组件正常工作（已实现）
- [ ] `permission_request` 事件正常触发
- [ ] L4 说明（创建新页面/删除页面/修改项目配置）出现在 system prompt 末尾

### 7.5 通用验证

- [ ] `pnpm typecheck` 通过（全 monorepo：author-site + agent-service + shared + agent-client）
- [ ] `pnpm test` 单元测试通过（author-site 新增 system-prompt.test.ts）
- [ ] `pnpm --filter @opencode-workbench/agent-service test` 51+/51+ 通过
- [ ] 端到端测试：创建项目 → AI 写文件 → 下一轮对话 L3 反映变更
- [ ] `author-site/src/lib/agent-prompts/demo-generator.template.md` 已删除
- [ ] `author-site/src/lib/agent-prompts/references/` 目录已删除
- [ ] `author-site/src/lib/templates/permission-config.ts` 死代码已删除
- [ ] `pi-agent.ts:387-430` 硬编码字符串已删除

---

## 八、风险与缓解（v3.2 调整）

### 8.1 Pi Agent 特有风险

| 风险 | 影响 | 缓解措施 |
|:---|:---|:---|
| 权限校验逻辑有漏洞（边界场景） | L1 不生效 | 单元测试覆盖：白名单/黑名单交集、相对路径 vs 绝对路径、`..` 越界、glob 边界 |
| `beforeToolCall` 与工具内部 `isPathAllowed` 双重拦截不一致 | 行为不一致 | PI-2 同时实现两道防线，统一调用 `isPathAllowed`，保证规则一致 |
| `AgentTool` 类型与 pi-agent-core 不兼容 | 工具不可用 | PI-2 沿用现有 `file-tools.ts` 的 `Type.Object` 模式（已验证可用） |
| **🆕 `AgentState.systemPrompt` 运行时赋值导致 Pi Agent 内部状态污染** | LLM 看到不一致的 system prompt | 验证 Pi Agent core 实现：仅修改字符串值，不影响 messages / tools；增加单元测试验证多轮 `updateSystemPrompt` 后 messages 数组保持不变 |
| **🆕 `updateSystemPrompt` 在 `sendMessage` 执行中被并发调用** | 数据竞争 | `routes/agent.ts` 在调用 `updateSystemPrompt` 后立即调用 `sendMessage`（同 promise chain 内），不暴露并发入口 |
| **🆕 L3 渲染扫描工作空间耗时过长** | 每次 sendMessage 延迟增加 | 实测验证：几十个文件 < 10ms；如超过 50ms 考虑加缓存（仅当工作空间 mtime 未变时复用） |
| **🆕 shared 包 L2 模板字符串过大（>50KB）** | 编译产物增大、system prompt 体积过大 | 当前 L2 约 5KB，无需处理；如未来增长可拆分为多个独立常量按需拼接 |
| L3 模板路径在打包后失效 | L3 不生效 | v3.1 已规避：L3 模板改为 TS 字符串常量（非 .md 文件），无路径问题 |
| L3 上下文未传入（v3.0 风险） | ~~AI 不感知工作空间现状~~ | **v3.1 已消除**：author-site 端强制扫描 + 渲染 + 注入，无 fallback 路径 |
| 模板转换（markdown → TS 字符串）遗漏内容 | AI 行为规则缺失 | 用 diff 工具对比原 markdown 与转换后 TS 字符串；拆分前逐项对照原文件 |
| **🆕 v3.2 L3 拼到 user message 前缀后，user message prefix cache 失效** | L3 变化时 user message 不命中缓存 | **可接受**（仅在 L3 变化时缓存失效；多数情况下 L3 频繁变化，user message 缓存本就命中率低）；user message 较短时缓存收益小于 system prompt；**核心收益**：system prompt 100% 静态 → 持续命中 LLM API 缓存，省 ~70% 输入 token 费用 |
| **🆕 v3.2 OpenAI 自动 prefix 缓存对 system prompt 长度有要求**（官方建议 ≥ 1024 token） | OpenAI 用户可能未触发缓存收益 | 当前 L2 + L4 约 1300 token（5KB ÷ 4 字节/token），**满足阈值**；如未来 L2 缩减到 < 1024 token 需重新评估 |
| **🆕 v3.2 author-site 端忘记在 LLM provider 不支持 prefix cache 时退化处理** | 部分 provider 无缓存收益但实现更复杂 | 当前所有支持的 LLM provider（Anthropic/OpenAI）都支持 prefix cache；如未来接入不支持缓存的 provider（如本地模型），需在 author-site 端加开关，把 L3 拼回 system prompt 字段 |

### 8.2 通用风险

| 风险 | 影响 | 缓解措施 |
|:---|:---|:---|
| L1 权限过于严格，影响 AI 正常工作 | AI 无法完成合理任务 | 在测试环境用真实工作空间跑回归测试，确认白名单覆盖所有正常操作（`demos/*/index.tsx` / `config.schema.json` / `.demo.json` / `project.config.schema.json`） |
| L2/L3 拆分后遗漏关键内容 | AI 行为异常 | 拆分前逐项对照原文件（3.4 表格），确保每条内容都有归属 |
| `matchGlob` 实现的 glob 模式与 opencode glob 语义不一致 | 规则行为偏差 | 明确为"简化 glob"语义（`*` = 单层段，`**` = 多层），文档中说明 |
| **🆕 agent-service 端 API 字段 `systemPrompt` 缺乏类型校验** | 注入恶意/格式错误字符串 | TypeScript 端类型约束 `string`；运行时长度限制（建议 < 100KB） |
| **🆕 v3.2 author-site 端把 L3 拼到 user content 时，UI 展示的"已发送消息"包含 L3 前缀** | 用户在对话历史中看到 L3 元信息，体验混乱 | author-site UI 端**仅渲染** `messages[i].content` 去除 L3 前缀的部分（用 `---` 分隔符或约定的前缀块识别）；或后端在 WebSocket 推送 `message` 事件时**剥离** L3 前缀（推荐：后端剥离更可靠） |

---

## 九、后续优化方向

1. **权限配置可视化编辑**：在创作端界面中提供权限配置的 UI 编辑入口（`PermissionConfig` JSON 编辑器）
2. **约束生效监控**：记录 L1/L2/L3/L4 各层的拦截次数和类型，用于优化权限配置
3. **动态权限调整**：根据项目类型自动调整权限白名单
4. **per-workspace 权限覆盖**：允许为不同项目配置不同的 `PermissionConfig`（如受限项目完全禁止 `npm install`）
5. **命令参数细粒度控制**：当前 `bash` 工具只控制命令名（如 `rm`），未来可解析参数（如 `--force` 标志）做精细化拦截

---

## 附录 A：权限配置模板

> 📝 **v3.0 变更**：删除原 v2.0 中 OpenCode 的 `OPENCODE_CONFIG_TEMPLATE`，仅保留 Pi Agent 的 `PermissionConfig`。

```typescript
// packages/agent-service/src/backends/pi-tools/permissions.ts
import path from "path";

export interface PermissionConfig {
  allowedPaths: string[];
  deniedPatterns: string[];
  allowedCommands: string[];
  deniedCommands: string[];
}

export const DEFAULT_WORKSPACE_PERMISSIONS: PermissionConfig = {
  allowedPaths: [
    "demos/*/index.tsx",
    "demos/*/config.schema.json",
    "demos/*/.demo.json",
    "project.config.schema.json",
    "AGENTS.md",
    "index.tsx",
    "config.schema.json",
  ],
  deniedPatterns: [
    "**/*.env",
    "**/*.env.*",
    "**/.git/**",
    "**/node_modules/**",
    "**/packages/**",
    "**/.opencode/**",
    "**/.workspace.json",
    "**/.session.json",
  ],
  // 与 pi-tools/bash-tool.ts:10 保持一致
  allowedCommands: ["npm", "node", "npx", "ls", "cat", "head", "tail", "grep", "find", "wc", "echo"],
  deniedCommands: ["rm", "rmdir", "mv", "cp", "mkdir", "sudo", "chmod", "chown"],
};

export function isPathAllowed(
  targetPath: string,
  workingDir: string,
  config: PermissionConfig
): boolean {
  const fullPath = targetPath.startsWith("/")
    ? targetPath
    : path.join(workingDir, targetPath);
  const resolved = path.resolve(fullPath);
  const workDirResolved = path.resolve(workingDir);

  // 1) 越界检查
  if (!resolved.startsWith(workDirResolved)) {
    return false;
  }

  const relativePath = path.relative(workDirResolved, resolved);

  // 2) 黑名单优先（deny 优先于 allow）
  for (const pattern of config.deniedPatterns) {
    if (matchGlob(relativePath, pattern) || matchGlob(fullPath, pattern)) {
      return false;
    }
  }

  // 3) 白名单匹配
  for (const pattern of config.allowedPaths) {
    if (matchGlob(relativePath, pattern) || matchGlob(fullPath, pattern)) {
      return true;
    }
  }

  return false;
}

export function isCommandAllowed(
  command: string,
  config: PermissionConfig
): boolean {
  const baseCmd = command.trim().split(/\s+/)[0];
  if (config.deniedCommands.includes(baseCmd)) {
    return false;
  }
  if (!config.allowedCommands.includes(baseCmd)) {
    return false;
  }
  return true;
}

/**
 * 简化 glob 匹配：
 * - `*` 匹配单层段（不含 `/`）
 * - `**` 匹配多层段（含 `/`）
 */
function matchGlob(filePath: string, pattern: string): boolean {
  const regex = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "{{DOUBLE_STAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/\{\{DOUBLE_STAR\}\}/g, ".*")
    .replace(/\?/g, ".");

  return new RegExp(`^${regex}$`).test(filePath);
}
```

---

## 附录 B：版本历史

| 版本 | 日期 | 修改内容 |
|:-----|:-----|:---------|
| v1.0 | 2026-05-27 | 初始版本（双后端支持：OpenCode + Pi Agent） |
| v2.0 | 2026-05-31 | 完善双后端实现细节（OC-1~OC-4 + PI-1~PI-4） |
| v3.0 | 2026-06-01 | **重大重构**：删除 OpenCode 后端方案（OC-1~OC-4），适配 Pi Agent 单后端架构；PI 任务基于代码现状校验后细化（含 PI-1 permissions 模块、PI-2 工具改造、PI-3 L2/L3 模板分离、PI-4 集成）；新增 Phase 1/Phase 2 划分（Phase 1：L1+L2+L4；Phase 2：L3 上下文接入，独立跟踪）；附录移除 OPENCODE_CONFIG_TEMPLATE |
| v3.1 | 2026-06-01 | **L3 实时性优化**（基于代码验证）：L3 渲染从 agent-service 端上移到 author-site 端；L2 模板从 markdown 转换为 TS 字符串常量放 shared 包；新增 `PiAgentBackend.updateSystemPrompt()` 运行时更新方法（基于 `AgentState.systemPrompt` 可写特性）；`routes/agent.ts` / `routes/websocket.ts` 接收 `systemPrompt` 字段；author-site 端新增 `scanWorkspaceContext` + `buildSystemPrompt` 函数；7.3 验证清单增加 4 个多轮对话 L3 实时性场景；6.1/6.2 文件清单重写（删除 agent-service 端 `system-prompt.ts` 和 `pi-agent/templates/`，新增 shared 包 + author-site 端多个文件） |
| v3.2 | 2026-06-01 | **LLM API 缓存命中率优化**（基于用户反馈的 LLM API 缓存意识）：将 v3.1 中完整 system prompt 拆分为**静态部分**（L2 + L4，100% 不变）与**动态部分**（L3 上下文）两路注入；4.3 PI-3 拆分渲染函数为 `buildStaticSystemPrompt()` + `buildDynamicContextPrefix(context)`；4.4 PI-4 author-site 端改造为"静态 systemPrompt 字段 + L3 拼到 user content 前缀"模式，使 system prompt 100% 命中 Anthropic Prompt Caching / OpenAI Auto Prefix Cache，预期节省 ~70% system prompt 部分输入 token 费用；5.x 任务清单/里程碑更新（拆分渲染函数实现复杂度相近，工时不变）；6.x 文件清单更新（`system-prompt.ts` 导出 2 个函数）；7.3 验证清单增加 LLM API 缓存命中验证（Anthropic `cached_tokens` 字段、3 轮 hash 一致性、L3 变更不影响 system prompt hash）；8.x 风险增加 3 项 v3.2 特有风险（user message prefix cache 失效/可接受、OpenAI ≥ 1024 token 阈值已满足、未来不支持缓存的 provider 需退化处理） |

---

**文档状态**：v3.2（适配 Pi Agent 单后端架构 + L3 实时性优化 + LLM API 缓存命中率优化）
**最后更新**：2026-06-01
