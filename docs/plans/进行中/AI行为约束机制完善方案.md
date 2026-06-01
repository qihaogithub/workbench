# AI 行为约束机制完善方案

> 版本：v3.0
> 创建日期：2026-05-27
> 更新日期：2026-06-01
> 状态：📋 计划中（待实施）
> 关联文档：[03_AI行为约束机制.md](../../项目文档/创作端/05-AI对话/技术/03_AI行为约束机制.md)、[全面迁移至Pi-Agent并移除多后端支持方案.md](./全面迁移至Pi-Agent并移除多后端支持方案.md)、[packages/agent-service/AGENTS.md](../../packages/agent-service/AGENTS.md)
>
> **v3.0 重大变更**：删除原 v2.0 的 OpenCode 后端方案（OC-1~OC-4），适配已完成 Pi Agent 单后端架构（2026-06-01 迁移完成）。原 Pi Agent 方案（PI-1~PI-4）经现状校验后保留并优化。

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
┌─────────────────────────────────────────────────────────────────┐
│                    AI Agent 约束机制架构（Pi Agent 后端）          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              System Prompt 构建管道                      │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │   │
│  │  │ L2 模板       │  │ L3 现状      │  │ L4 说明      │  │   │
│  │  │ demo-generator│ +│ workspace-   │ +│ 权限确认说明 │  │   │
│  │  │ .template.md  │  │ status       │  │              │  │   │
│  │  │ (静态规则)    │  │ .template.md │  │              │  │   │
│  │  │              │  │ (动态注入)   │  │              │  │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │   │
│  │                          ↓                                 │   │
│  │                   buildSystemPrompt()                     │   │
│  │                       (context: {                        │   │
│  │                         projectName,                     │   │
│  │                         pageCount, pageList,             │   │
│  │                         projectConfigStatus,             │   │
│  │                         workingDir                       │   │
│  │                       })                                 │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              L1 权限控制层（统一模块）                    │   │
│  │                                                         │   │
│  │  ┌──────────────────────────────────────────────────┐   │   │
│  │  │  pi-tools/permissions.ts                         │   │   │
│  │  │  ─────────────────────────────────              │   │   │
│  │  │  • DEFAULT_WORKSPACE_PERMISSIONS                │   │   │
│  │  │  • isPathAllowed(target, workingDir, config)    │   │   │
│  │  │  • isCommandAllowed(command, config)            │   │   │
│  │  └──────────────────────────────────────────────────┘   │   │
│  │                       ↓                                 │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │   │
│  │  │ file-tools   │  │ bash-tool    │  │ pi-agent.ts  │  │   │
│  │  │ readFile/    │  │ 白名单+      │  │ beforeTool   │  │   │
│  │  │ writeFile/   │  │ 黑名单校验   │  │ Call 拦截    │  │   │
│  │  │ listFiles    │  │              │  │              │  │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              前端 L4 确认层（后端无关）                  │   │
│  │              PermissionDialog 组件                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 约束机制分层

| 层级 | 名称 | 实现位置 | 职责 |
|:---:|:---|:---|:---|
| **L1** | 硬限制 | `pi-tools/permissions.ts` + `file-tools.ts` + `bash-tool.ts` + `pi-agent.ts beforeToolCall` | 文件读写路径白/黑名单 + 命令白/黑名单 |
| **L2** | 行为规则 | `pi-agent/templates/demo-generator.template.md` → `buildSystemPrompt()` L2 部分 | 怎么做、能做什么、不能做什么 |
| **L3** | 工作空间现状 | `pi-agent/templates/workspace-status.template.md` → `buildSystemPrompt()` L3 部分 | 当前项目名、页面列表、项目配置状态 |
| **L4** | 用户确认 | `PermissionDialog` 组件 + `permission_request` 事件 | 需要用户授权的操作 |

### 3.3 L2/L3 模板分离原则

**L2 模板**：`packages/agent-service/src/backends/pi-agent/templates/demo-generator.template.md`

- 由 `demo-generator.template.md`（位于 author-site 端）**迁移**而来
- 内容：AI 角色定义、页面管理操作、项目级配置管理、代码质量标准、React 版本约束、禁止行为、文件修改决策规则
- **不含**任何 `{{...}}` 占位符（纯静态规则）

**L3 模板**：`packages/agent-service/src/backends/pi-agent/templates/workspace-status.template.md`（新建）

- 内容：项目信息（项目名、项目配置状态）、页面列表（运行时渲染）
- 含 `{{PROJECT_NAME}}` / `{{PROJECT_CONFIG_STATUS}}` / `{{PAGE_COUNT}}` / `{{PAGE_LIST}}` 占位符

**L4 说明**：硬编码在 `buildSystemPrompt()` 内部（小段说明文本，无需外置模板）

### 3.4 L2/L3 内容归属拆分表

| 内容 | 当前位置 | 目标位置 | 原因 |
| :--- | :--- | :--- | :--- |
| AI 角色定义 | `demo-generator.template.md` | L2（保留） | 属于规则 |
| 工作空间结构（静态模板） | `demo-generator.template.md` | **L3（移出）** | 属于现状描述 |
| 页面信息（运行时注入） | `demo-generator.template.md`（"页面信息"章节） | **L3（移出）** | 属于现状描述 |
| 页面管理操作流程 | `demo-generator.template.md` | L2（保留） | 属于"怎么做" |
| 项目配置管理流程 | `demo-generator.template.md` | L2（保留） | 属于"怎么做" |
| 代码质量标准 | `demo-generator.template.md` | L2（保留） | 属于"怎么做" |
| 文件修改决策规则 | `demo-generator.template.md` | L2（保留） | 属于"怎么做" |
| 禁止行为清单 | `demo-generator.template.md` | L2（保留） | 属于"不能做什么" |
| 项目名 / 页面列表 / 项目配置状态 | （缺失） | **L3（新增）** | 属于现状描述 |
| 权限确认说明 | （缺失） | **L4（新增）** | 属于交互规则 |

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

### 4.3 Task PI-3：System Prompt 构建（L2 + L3 合并）

**目标**：实现 L2 模板读取 + L3 动态渲染 + L4 说明注入的 system prompt 构建管道。

**新建文件**：
- `packages/agent-service/src/backends/pi-agent/templates/demo-generator.template.md`（从 `packages/author-site/src/lib/agent-prompts/demo-generator.template.md` 迁移并拆分 L3 内容）
- `packages/agent-service/src/backends/pi-agent/templates/workspace-status.template.md`（新建，L3 模板）
- `packages/agent-service/src/backends/pi-agent/system-prompt.ts`（构建管道）

**L2 模板**（`pi-agent/templates/demo-generator.template.md`）— **从 author-site 端迁移 + 拆分**：

迁移路径：
- 源文件：`packages/author-site/src/lib/agent-prompts/demo-generator.template.md`
- 移除原文件中"## 工作空间结构"和"## 页面信息"两个章节（含 `{{PROJECT_NAME}}` 等占位符的内容）
- 目标文件：`packages/agent-service/src/backends/pi-agent/templates/demo-generator.template.md`
- 迁移后 `packages/author-site/src/lib/agent-prompts/` 目录可删除

迁移后内容（保持原文件中除"工作空间结构"和"页面信息"章节外的所有内容）：

```markdown
# Demo Generator Agent

你是 OpenCode Workbench 的项目 Demo 生成专家。
你的工作区是一个完整的项目工作空间，包含多个 Demo 页面。

## 页面内容编辑
（... 与原文件相同 ...）

## 页面管理操作
（... 与原文件相同 ...）

## 项目级配置管理（运行时注入，简化约束）
（... 与原文件相同 ...）

## 代码质量标准（每个页面内）
（... 与原文件相同 ...）

## React 版本约束
（... 与原文件相同 ...）

# 参考文件
（... 与原文件相同 ...）

## 禁止行为
（... 与原文件相同 ...）

## 文件修改决策规则
（... 与原文件相同 ...）
```

**L3 模板**（`pi-agent/templates/workspace-status.template.md`）— **新建**：

```markdown
## 当前工作空间

**项目**: {{PROJECT_NAME}}
**项目配置**: {{PROJECT_CONFIG_STATUS}}
**工作空间**: `{{WORKSPACE_PATH}}`
**页面数量**: {{PAGE_COUNT}}

{{PAGE_LIST}}
```

**system-prompt.ts 实现**：

```typescript
// packages/agent-service/src/backends/pi-agent/system-prompt.ts
import * as fs from 'fs';
import * as path from 'path';

export interface SystemPromptContext {
  projectName: string;
  projectConfigStatus: '已设置' | '未设置';
  pageCount: number;
  pageList: string;
  workspacePath: string;
}

const TEMPLATES_DIR = path.join(__dirname, 'templates');
const L2_TEMPLATE_PATH = path.join(TEMPLATES_DIR, 'demo-generator.template.md');
const L3_TEMPLATE_PATH = path.join(TEMPLATES_DIR, 'workspace-status.template.md');

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

export function buildSystemPrompt(context: SystemPromptContext): string {
  const l2 = fs.readFileSync(L2_TEMPLATE_PATH, 'utf-8');
  const l3Template = fs.readFileSync(L3_TEMPLATE_PATH, 'utf-8');
  const l3 = render(l3Template, {
    PROJECT_NAME: context.projectName,
    PROJECT_CONFIG_STATUS: context.projectConfigStatus,
    WORKSPACE_PATH: context.workspacePath,
    PAGE_COUNT: String(context.pageCount),
    PAGE_LIST: context.pageList || '（暂无页面）',
  });

  return [l2, l3, L4_NOTICE].join('\n\n---\n\n');
}
```

> 📝 **决策点 - 模板位置**：L2/L3 模板放在 `agent-service` 端而非 `author-site` 端的原因：
> 1. **职责清晰**：`author-site` 负责前端业务（HTTP 路由、页面渲染），不参与 system prompt 组装
> 2. **避免跨包读文件**：`author-site` 端读取 `agent-service` 端文件会引入包依赖方向问题
> 3. **模板与后端强耦合**：L2 模板定义了 Pi Agent 的能力边界，与 L1 权限配置、L4 事件类型紧密相关
>
> 副作用：`packages/author-site/src/lib/agent-prompts/demo-generator.template.md` 迁移后该文件不再被任何代码引用，可同步删除（连同 `agent-prompts/` 目录）。

---

### 4.4 Task PI-4：PiAgentBackend 集成

**目标**：在 `PiAgentBackend` 中使用新的 system prompt 构建管道 + 权限配置。

**修改文件**：`packages/agent-service/src/backends/pi-agent.ts`

**变更点**：

1. **导入新模块**：

```typescript
import { buildSystemPrompt, type SystemPromptContext } from './pi-agent/system-prompt';
import {
  DEFAULT_WORKSPACE_PERMISSIONS,
} from './pi-tools/permissions';
import { isPathAllowed } from './pi-tools/permissions';
```

2. **添加 `context` 字段**：

```typescript
export class PiAgentBackend implements IBackendAdapter {
  private context: SystemPromptContext | null = null;

  setContext(ctx: SystemPromptContext): void {
    this.context = ctx;
  }
  // ... 其他字段不变
}
```

3. **改造 `initialize()`**：

```typescript
async initialize(): Promise<void> {
  this.status = "initializing";
  await loadPiAgentDeps();

  // 注入权限配置
  this.config.permissions = this.config.permissions ?? DEFAULT_WORKSPACE_PERMISSIONS;

  // 构建 system prompt（若 context 未设置，使用占位）
  const systemPrompt = buildSystemPrompt(
    this.context ?? {
      projectName: '未知项目',
      projectConfigStatus: '未设置',
      pageCount: 0,
      pageList: '',
      workspacePath: this.config.workingDir ?? '',
    },
  );

  // 工具自动从 this.config.permissions 读取（PI-2 已改造）
  const tools = createWorkbenchTools(this.config);
  const model = this.getModel();

  this.agent = new Agent({
    initialState: {
      model: model,
      systemPrompt,
      tools,
    },
    // ... 其他配置不变
  });

  this.status = "ready";
}
```

4. **改造现有硬编码 `buildSystemPrompt()`**：删除 `pi-agent.ts:387-430` 的内联实现，替换为对 `system-prompt.ts buildSystemPrompt()` 的调用

**L3 上下文来源**（`author-site` 端）：

> 📝 **决策点 - 上下文传递路径**：
>
> `author-site` 在调用 `POST /api/agent/:sessionId/message` 之前，需要先组装 L3 上下文数据（项目名/页面列表/项目配置状态），并通过 API 扩展字段传给 agent-service。
>
> **建议实现路径**（不在本方案范围内，需在 `author-site` 端独立实现）：
> 1. `author-site` 调用 message API 前，从工作空间目录读取 `demos/` 列表 + `project.config.schema.json` 存在性
> 2. 组装 `context: { projectName, pageCount, pageList, projectConfigStatus, workingDir }`
> 3. 通过 message API 的新字段（如 `context`）传入
> 4. `agent-service` 的 `routes/agent.ts` 在创建 `PiAgentBackend` 后调用 `backend.setContext(ctx)` 注入
>
> **当前状态**：上述 API 扩展不在本方案任务清单内，作为 **Phase 2 依赖** 单独跟踪。Phase 1 可先用占位 `context` 推进 L1/L2/L4 实施。

---

## 五、实施任务总览

### 5.1 Pi Agent 后端任务

| 顺序 | 任务 | 工作量 | 依赖 |
|:---:|:---|:---:|:---:|
| PI-1 | 创建 `pi-tools/permissions.ts` | 1h | 无 |
| PI-2 | 权限感知工具改造（file-tools + bash-tool + pi-agent beforeToolCall） | 2h | PI-1 |
| PI-3 | L2 模板迁移 + L3 模板新建 + `system-prompt.ts` 实现 | 1.5h | 无 |
| PI-4 | `PiAgentBackend` 集成（注入 permissions + 调用 buildSystemPrompt） | 2h | PI-1, PI-3 |
| 验证 | 单元测试 + 集成测试 + E2E | 2h | PI-1~4 |

**总计**：~8.5 小时

### 5.2 实施阶段

**Phase 1：L1 权限 + L2 模板（无 L3 依赖）**

```
PI-1 ──→ PI-2 ──→ PI-4(部分) ──→ 验证
              │
              └─→ PI-3 ──→ PI-4(完整集成) ──→ 验证
```

**Phase 2：L3 上下文接入（author-site 端 API 扩展）**

> 📝 **Phase 2 不在本方案任务清单内**，作为独立跟踪项：
> - author-site 端：message API 调用前组装 L3 context，通过新字段传入
> - agent-service 端：`routes/agent.ts` 调用 `backend.setContext(ctx)` 注入
> - 预期工作量：1-2h（author-site）+ 0.5h（agent-service）

### 5.3 实施顺序建议

**推荐：自底向上分层实施**

```
PI-1（permissions 模块）
   ↓
PI-2（工具层接入）
   ↓
PI-3（system prompt 管道，与 PI-1/PI-2 并行可行）
   ↓
PI-4（PiAgentBackend 集成）
   ↓
统一验证
```

- **PI-1 → PI-2 → PI-4**：L1 硬限制主线
- **PI-3 → PI-4**：L2/L3/L4 system prompt 主线
- 两条主线可在 PI-2 与 PI-3 之间并行

---

## 六、修改文件清单

### 6.1 新建文件

| 文件 | 关联任务 | 说明 |
|:---|:---:|:---|
| `packages/agent-service/src/backends/pi-tools/permissions.ts` | PI-1 | 权限配置（`PermissionConfig` 接口、`DEFAULT_WORKSPACE_PERMISSIONS` 常量、`isPathAllowed` / `isCommandAllowed` / `matchGlob` 函数） |
| `packages/agent-service/src/backends/pi-agent/templates/demo-generator.template.md` | PI-3 | L2 模板（从 `author-site/src/lib/agent-prompts/demo-generator.template.md` 迁移） |
| `packages/agent-service/src/backends/pi-agent/templates/workspace-status.template.md` | PI-3 | L3 模板（新建） |
| `packages/agent-service/src/backends/pi-agent/system-prompt.ts` | PI-3 | System Prompt 构建管道（`buildSystemPrompt(context)` 函数、`SystemPromptContext` 接口） |

### 6.2 修改文件

| 文件 | 关联任务 | 说明 |
|:---|:---:|:---|
| `packages/agent-service/src/core/types.ts` | PI-2 | 给 `AgentConfig` 添加 `permissions?: PermissionConfig` 字段 |
| `packages/agent-service/src/backends/pi-tools/file-tools.ts` | PI-2 | `createReadFileTool` / `createWriteFileTool` / `createListFilesTool` 三个工具的 `execute` 开头添加 `isPathAllowed` 校验 |
| `packages/agent-service/src/backends/pi-tools/bash-tool.ts` | PI-2 | 删除硬编码 `ALLOWED_COMMANDS` 常量，替换为从 `config.permissions` 读取的 `isCommandAllowed` 校验 |
| `packages/agent-service/src/backends/pi-agent.ts` | PI-2, PI-4 | (PI-2) `beforeToolCall` 中 workingDir 检查替换为 `isPathAllowed`；(PI-4) 注入 `permissions`、删除内联 `buildSystemPrompt()`（387-430 行）、调用 `buildSystemPrompt`、添加 `setContext()` 方法 |
| `packages/agent-service/src/backends/pi-tools/index.ts` | PI-1, PI-2 | 在 `createWorkbenchTools` 中把 `permissions` 透传给所有工具（验证） |
| `packages/author-site/src/lib/agent-prompts/demo-generator.template.md` | PI-3 | **迁移**：移除"工作空间结构"和"页面信息"两个章节后，整个文件迁移到 `agent-service` 端 |
| `packages/author-site/src/lib/templates/permission-config.ts` | 清理 | **删除**：`OPENCODE_CONFIG_TEMPLATE` 和 `AGENTS_MD_TEMPLATE` 均为死代码 |
| `packages/author-site/src/lib/agent-prompts/` | PI-3 | **删除目录**：迁移后无消费者 |

### 6.3 不需要修改的文件

| 文件 | 原因 |
|:---|:---|
| `packages/author-site/src/components/ai-elements/*` | L4 前端组件不受影响（PermissionDialog 正常工作） |
| `packages/agent-service/src/backends/pi-tools/schema-tool.ts` | `schemaValidate` 工具无文件操作，不涉及权限 |
| `packages/agent-service/src/routes/*` | Phase 1 不修改（context 接入在 Phase 2） |
| `packages/agent-service/src/core/agent-factory.ts` | Pi Agent 工厂已硬编码，无需改动 |
| `packages/agent-service/src/core/agent.ts` | BaseAgent 不涉及 system prompt 组装 |

---

## 七、验证清单

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

- [ ] `pi-agent/templates/demo-generator.template.md` 不含 `{{...}}` 占位符（纯静态）
- [ ] `pi-agent/templates/demo-generator.template.md` 不含"工作空间结构"和"页面信息"章节
- [ ] `pi-agent.ts:387-430` 硬编码 `buildSystemPrompt()` 已删除，改为调用 `system-prompt.ts` 的 `buildSystemPrompt()`
- [ ] L2 模板内容被 Pi Agent 正常读取并注入到 system prompt
- [ ] AI 行为符合 L2 规则（如：不会主动修改其他 Demo 目录）

### 7.3 L3 工作空间现状验证

- [ ] `pi-agent/templates/workspace-status.template.md` 包含 4 个占位符：`{{PROJECT_NAME}}` / `{{PROJECT_CONFIG_STATUS}}` / `{{WORKSPACE_PATH}}` / `{{PAGE_COUNT}}` / `{{PAGE_LIST}}`
- [ ] 单元测试：`buildSystemPrompt(context)` 正确渲染所有占位符
- [ ] L3 模板内容出现在 system prompt 的 L2 之后、L4 之前
- [ ] **Phase 2**：context 接入后，AI 能正确识别当前项目名和页面列表

### 7.4 L4 用户确认验证

- [ ] `PermissionDialog` 组件正常工作（已实现）
- [ ] `permission_request` 事件正常触发
- [ ] L4 说明（创建新页面/删除页面/修改项目配置）出现在 system prompt 末尾

### 7.5 通用验证

- [ ] `pnpm typecheck` 通过（agent-service）
- [ ] `pnpm test` 51+/51+ 测试通过
- [ ] 页面创建/编辑/保存流程正常
- [ ] `author-site/src/lib/agent-prompts/` 目录已删除
- [ ] `author-site/src/lib/templates/permission-config.ts` 死代码已删除
- [ ] `pi-agent.ts:387-430` 硬编码字符串已删除

---

## 八、风险与缓解

### 8.1 Pi Agent 特有风险

| 风险 | 影响 | 缓解措施 |
|:---|:---|:---|
| 权限校验逻辑有漏洞（边界场景） | L1 不生效 | 单元测试覆盖：白名单/黑名单交集、相对路径 vs 绝对路径、`..` 越界、glob 边界 |
| `beforeToolCall` 与工具内部 `isPathAllowed` 双重拦截不一致 | 行为不一致 | PI-2 同时实现两道防线，统一调用 `isPathAllowed`，保证规则一致 |
| `AgentTool` 类型与 pi-agent-core 不兼容 | 工具不可用 | PI-2 沿用现有 `file-tools.ts` 的 `Type.Object` 模式（已验证可用） |
| L3 模板路径在打包后失效 | L3 不生效 | `system-prompt.ts` 使用 `__dirname` 而非 `process.cwd()` 定位 templates 目录 |
| L3 上下文未传入（Phase 2 未实施） | AI 不感知工作空间现状 | Phase 1 用占位 context；Phase 2 单独跟踪 |
| 模板迁移遗漏 L2 内容 | AI 行为规则缺失 | 迁移前逐项对照原文件，使用 diff 工具验证迁移后内容 |

### 8.2 通用风险

| 风险 | 影响 | 缓解措施 |
|:---|:---|:---|
| L1 权限过于严格，影响 AI 正常工作 | AI 无法完成合理任务 | 在测试环境用真实工作空间跑回归测试，确认白名单覆盖所有正常操作（`demos/*/index.tsx` / `config.schema.json` / `.demo.json` / `project.config.schema.json`） |
| L2/L3 拆分后遗漏关键内容 | AI 行为异常 | 拆分前逐项对照原文件（3.4 表格），确保每条内容都有归属 |
| `matchGlob` 实现的 glob 模式与 opencode glob 语义不一致 | 规则行为偏差 | 明确为"简化 glob"语义（`*` = 单层段，`**` = 多层），文档中说明 |

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

---

**文档状态**：v3.0（适配 Pi Agent 单后端架构）
**最后更新**：2026-06-01
