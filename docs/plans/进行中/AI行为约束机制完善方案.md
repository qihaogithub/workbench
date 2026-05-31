# AI 行为约束机制完善方案

> 版本：v2.0
> 创建日期：2026-05-27
> 更新日期：2026-05-31
> 关联文档：[03_AI行为约束机制.md](../../项目文档/创作端/05-AI对话/技术/03_AI行为约束机制.md)、[Pi Agent 后端集成方案.md](../../远期规划/pi%20agent/Pi%20Agent%20后端集成方案.md)

---

## 一、现状分析

### 1.1 四层约束实现状态

| 层级 | 设计 | 实现 | 实际生效 | 说明 |
| :--- | :--- | :--- | :------- | :--- |
| **L1** 文件系统权限 | ✅ | ❌ | ❌ | `OPENCODE_CONFIG_TEMPLATE` 已定义在 `permission-config.ts`，但未注入工作空间 |
| **L2** System Prompt | ✅ | ✅ | ✅ | `demo-generator.template.md` → `.opencode/agents/demo-generator.md`，定义 AI 怎么做、能做什么、不能做什么 |
| **L3** 工作空间现状 | ✅ | ❌ | ❌ | `AGENTS_MD_TEMPLATE` 已定义在 `permission-config.ts`，但未注入工作空间，应描述当前工作空间的目录结构、页面列表、配置现状 |
| **L4** 用户确认 | ✅ | ✅ | ✅ | `PermissionDialog` 组件 + `permission_request` 事件，已正常工作 |

### 1.2 关键断裂点

| 位置 | 问题 | 影响 |
| :--- | :--- | :--- |
| `workspace-manager.ts` 的 `injectOpencodeAgentConfig()` | 只注入 `demo-generator.md`（L2），未注入权限配置（L1）和 AGENTS.md（L3） | AI 行为无硬限制，无工作空间现状感知 |
| `opencode.json` 生成逻辑 | 只包含 `agent`/`default_agent`/`instructions` 字段，缺少 `permission` 字段 | opencode CLI 无法应用文件读写/命令执行权限 |
| `AGENTS_MD_TEMPLATE` 与 `demo-generator.template.md` | 两者内容存在重叠，且职责定位不清 | 职责边界不清晰，维护困难 |

### 1.3 L2 与 L3 的职责定义

| 层级 | 定位 | 内容 | 类比 |
| :--- | :--- | :--- | :--- |
| **L2** | 任务手册 | 怎么做、能做什么、不能做什么 | 员工手册（规则不变） |
| **L3** | 工作空间现状 | 当前工作空间有什么、是什么样 | 今日工作简报（动态变化） |

**当前问题**：`AGENTS_MD_TEMPLATE` 的内容混杂了行为规则（属于 L2）和工作空间描述（属于 L3），需要拆分。

### 1.4 当前 opencode.json 生成内容

```json
{
  "$schema": "https://opencode.ai/config.json",
  "agent": {
    "demo-generator": {
      "file": ".opencode/agents/demo-generator.md",
      "description": "专门用于生成 OpenCode Demo 文件的 AI 代理",
      "tools": { "write": true, "edit": true, "bash": false, "fetch": false }
    }
  },
  "default_agent": "demo-generator",
  "instructions": [".opencode/agents/demo-generator.md"]
}
```

**缺失**：没有 `permission` 字段，opencode CLI 不知道哪些文件可以/不可以编辑。

---

## 二、目标

完善 AI 行为约束的 L1（文件系统权限）和 L3（工作空间现状）两层，使四层约束机制全部生效：

- **L1**：提供硬限制，强制执行文件读写和命令执行权限
- **L3**：提供当前工作空间的现状描述（目录结构、页面列表、配置状态），让 AI 了解所处环境
- **L2/L3 拆分**：将现有混杂的内容按职责分离（L2=规则，L3=现状）
- **双后端支持**：同时支持 OpenCode 和 Pi Agent 两种后端方案

---

## 三、约束机制架构设计

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    AI Agent 约束机制架构                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              System Prompt 构建管道                      │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │   │
│  │  │ L2 模板       │  │ L3 现状      │  │ L4 规则      │  │   │
│  │  │ demo-generator│ +│ AGENTS.md    │ +│ 权限确认说明 │  │   │
│  │  │ .template.md  │  │ (动态生成)   │  │              │  │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │   │
│  │                          ↓                                 │   │
│  │                   buildSystemPrompt()                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              L1 权限控制层（后端差异化实现）              │   │
│  │                                                         │   │
│  │  ┌─────────────────────┐  ┌─────────────────────┐      │   │
│  │  │  OpenCode 后端       │  │  Pi Agent 后端       │      │   │
│  │  │  ──────────────      │  │  ──────────────      │      │   │
│  │  │  opencode.json       │  │  pi-tools/           │      │   │
│  │  │  permission 字段     │  │  permissions.ts      │      │   │
│  │  │  + CLI 强制执行      │  │  + 工具层白名单校验   │      │   │
│  │  └─────────────────────┘  └─────────────────────┘      │   │
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

| 层级 | 名称 | OpenCode 方案 | Pi Agent 方案 | 职责 |
|:---:|:---|:---|:---|:---|
| **L1** | 硬限制 | `opencode.json.permission` | `pi-tools/permissions.ts` | 文件读写/命令执行白名单 |
| **L2** | 行为规则 | `demo-generator.md` | `buildSystemPrompt()` L2 部分 | 怎么做、不能做什么 |
| **L3** | 工作空间现状 | `AGENTS.md` 注入 | `buildSystemPrompt()` L3 部分 | 当前有什么、什么样 |
| **L4** | 用户确认 | `PermissionDialog` 组件 | `PermissionDialog` 组件 | 需要用户授权的操作 |

### 3.3 L2/L3 模板分离（通用）

**L2 模板**：`agent-prompts/demo-generator.template.md`

```markdown
# Demo Generator Agent

你是 OpenCode Workbench 的项目 Demo 生成专家。
你的工作区是一个完整的项目工作空间，包含多个 Demo 页面。

## 工作空间结构

workspace/
├── project.config.schema.json
└── demos/
    ├── {demoId}/
    │   ├── index.tsx
    │   ├── config.schema.json
    │   └── .demo.json

## 页面管理操作

[操作流程...]

## 代码质量标准

[规范...]

## 禁止行为

- ❌ 访问当前工作空间外的文件
- ❌ 修改系统文件
```

**L3 模板**：`agent-prompts/workspace-status.template.md`

```markdown
## 当前工作空间

**项目**: {{PROJECT_NAME}}
**项目配置**: {{PROJECT_CONFIG_STATUS}}
**页面数量**: {{PAGE_COUNT}}

{{PAGE_LIST}}
```

---

## 四、技术方案：OpenCode 后端

### 4.1 Task OC-1：L1 权限配置注入

**目标**：将 `OPENCODE_CONFIG_TEMPLATE.permission` 合并到工作空间的 `opencode.json` 中。

**修改文件**：`packages/author-site/src/lib/workspace-manager.ts`

**变更点**：

1. 导入 `OPENCODE_CONFIG_TEMPLATE`：

```typescript
import { OPENCODE_CONFIG_TEMPLATE } from "./templates/permission-config";
```

2. 在 `injectOpencodeAgentConfig()` 中合并权限配置：

```typescript
const opencodeJson = {
  $schema: "https://opencode.ai/config.json",
  agent: {
    /* 现有 agent 配置不变 */
  },
  default_agent: "demo-generator",
  instructions: [".opencode/agents/demo-generator.md"],
  permission: OPENCODE_CONFIG_TEMPLATE.permission, // ← 新增
};
```

**生成结果**（opencode.json）：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "agent": {
    "demo-generator": {
      "file": ".opencode/agents/demo-generator.md",
      "description": "专门用于生成 OpenCode Demo 文件的 AI 代理",
      "tools": { "write": true, "edit": true, "bash": false, "fetch": false }
    }
  },
  "default_agent": "demo-generator",
  "instructions": [".opencode/agents/demo-generator.md"],
  "permission": {
    "edit": {
      "*": "deny",
      "index.tsx": "allow",
      "config.schema.json": "allow",
      "project.config.schema.json": "allow",
      ".demo.json": "allow",
      "AGENTS.md": "allow"
    },
    "read": { "*": "allow", "*.env": "deny", "*.env.*": "deny" },
    "bash": {
      "*": "ask",
      "ls *": "allow",
      "cat *": "allow",
      "grep *": "allow",
      "rm *": "deny",
      "mv *": "deny",
      "cp *": "deny",
      "mkdir *": "deny"
    },
    "external_directory": {}
  }
}
```

**验证方式**：

1. 新建一个项目，检查 `data/workspaces/{userId}/{projectId}/{workspaceId}/.opencode/opencode.json` 是否包含 `permission` 字段
2. 让 AI 尝试编辑非白名单文件（如 `.workspace.json`），确认是否被拒绝
3. 让 AI 尝试执行 `rm` 命令，确认是否被拒绝

### 4.2 Task OC-2：L3 AGENTS.md 注入

**目标**：重构 `AGENTS_MD_TEMPLATE` 内容为纯工作空间现状描述，并注入到工作空间。

**修改文件**：

- `packages/author-site/src/lib/templates/permission-config.ts`（重构模板内容）
- `packages/author-site/src/lib/workspace-manager.ts`（添加注入逻辑）

**重构后的 `AGENTS_MD_TEMPLATE`**：

```markdown
# 当前工作空间

## 项目信息

当前项目：「{{PROJECT_NAME}}」
{{PROJECT_CONFIG_LINE}}

## 目录结构

workspace/
├── project.config.schema.json ← 项目级共享配置（已设置/未设置）
└── demos/
├── home/
│   ├── index.tsx
│   ├── config.schema.json
│   └── .demo.json
└── ...

## 已有页面

包含 {{PAGE_COUNT}} 个页面：
{{PAGE_LIST}}
```

**注入逻辑**：

```typescript
// 注入 AGENTS.md（L3 工作空间现状层）
const agentsMd = AGENTS_MD_TEMPLATE.replace(
  /\{\{PROJECT_NAME\}\}/g,
  projectName,
)
  .replace(/\{\{PROJECT_CONFIG_LINE\}\}/g, projectConfigLine)
  .replace(/\{\{PAGE_COUNT\}\}/g, String(pageCount))
  .replace(/\{\{PAGE_LIST\}\}/g, pageList || "（暂无页面）");

fs.writeFileSync(path.join(workspacePath, "AGENTS.md"), agentsMd, "utf-8");
```

### 4.3 Task OC-3：L2/L3 职责拆分

**目标**：将 `demo-generator.template.md`（L2）和 `AGENTS_MD_TEMPLATE`（L3）的内容按职责重新划分。

**拆分方案**：

| 内容 | 当前位置 | 目标位置 | 原因 |
| :--- | :--- | :--- | :--- |
| AI 角色定义 | L2 | L2（保留） | 属于规则 |
| 工作空间结构（静态模板） | L2 | **L3（移出）** | 属于现状描述 |
| 页面信息（运行时注入） | L2 | **L3（移出）** | 属于现状描述 |
| 页面管理操作流程 | L2 | L2（保留） | 属于"怎么做" |
| 项目配置管理流程 | L2 | L2（保留） | 属于"怎么做" |
| 代码质量标准 | L2 | L2（保留） | 属于"怎么做" |
| 文件修改决策规则 | L2 | L2（保留） | 属于"怎么做" |
| 禁止行为清单 | L2 | L2（保留） | 属于"不能做什么" |
| 核心约束（白名单/禁止操作） | L3 | **L2（移入）** | 属于规则 |
| 目录结构 + 页面列表 | L3 | L3（保留） | 属于现状描述 |

**具体修改**：

1. **`demo-generator.template.md`（L2）**：
   - 移除"工作空间结构"和"页面信息"章节（移到 L3）
   - 保留所有任务流程和规则
   - 补充从 L3 移入的核心约束

2. **`AGENTS_MD_TEMPLATE`（L3）**：
   - 移除行为规则内容
   - 保留并强化工作空间现状描述

### 4.4 Task OC-4：instructions 包含 AGENTS.md

**目标**：确保 opencode CLI 能读取 AGENTS.md。

```typescript
const opencodeJson = {
  $schema: "https://opencode.ai/config.json",
  agent: { /* ... */ },
  default_agent: "demo-generator",
  instructions: [
    ".opencode/agents/demo-generator.md",
    "AGENTS.md", // ← 新增
  ],
};
```

---

## 五、技术方案：Pi Agent 后端

### 5.1 Task PI-1：创建权限配置模块

**目标**：建立统一的权限配置结构，支持 Pi Agent 工具层校验。

**新建文件**：`packages/agent-service/src/backends/pi-tools/permissions.ts`

```typescript
import type { AgentConfig } from "../../core/types";

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
  allowedCommands: ["ls", "cat", "grep", "find", "node", "npm", "pnpm", "git"],
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

  if (!resolved.startsWith(workDirResolved)) {
    return false;
  }

  const relativePath = path.relative(workDirResolved, resolved);

  for (const pattern of config.deniedPatterns) {
    if (matchGlob(relativePath, pattern) || matchGlob(fullPath, pattern)) {
      return false;
    }
  }

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

### 5.2 Task PI-2：权限感知的工具实现

**目标**：在文件读写和 bash 工具中添加白名单校验。

**修改文件**：`packages/agent-service/src/backends/pi-tools/file-tools.ts`

```typescript
import { isPathAllowed, DEFAULT_WORKSPACE_PERMISSIONS, type PermissionConfig } from "./permissions";

export interface FileToolConfig extends AgentConfig {
  permissions?: PermissionConfig;
}

export function createReadFileTool(config: FileToolConfig) {
  const permissions = config.permissions ?? DEFAULT_WORKSPACE_PERMISSIONS;

  return {
    name: "readFile",
    description: "读取文件内容。文件必须在工作空间目录内。",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "文件路径（相对于工作空间）" },
      },
      required: ["path"],
    },
    execute: async (params: { path: string }) => {
      if (!isPathAllowed(params.path, config.workingDir ?? "", permissions)) {
        throw new Error(`无权限读取: ${params.path}`);
      }

      const fullPath = path.join(config.workingDir ?? "", params.path);
      return fs.readFileSync(fullPath, "utf-8");
    },
  };
}

export function createWriteFileTool(config: FileToolConfig) {
  const permissions = config.permissions ?? DEFAULT_WORKSPACE_PERMISSIONS;

  return {
    name: "writeFile",
    description: "写入文件到工作空间。文件必须在白名单内。",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "文件路径" },
        content: { type: "string", description: "文件内容" },
      },
      required: ["path", "content"],
    },
    execute: async (params: { path: string; content: string }) => {
      if (!isPathAllowed(params.path, config.workingDir ?? "", permissions)) {
        throw new Error(`无权限写入: ${params.path}`);
      }

      const fullPath = path.join(config.workingDir ?? "", params.path);
      fs.writeFileSync(fullPath, params.content, "utf-8");

      return { success: true, path: params.path };
    },
  };
}

export function createBashTool(config: FileToolConfig) {
  const permissions = config.permissions ?? DEFAULT_WORKSPACE_PERMISSIONS;

  return {
    name: "bash",
    description: "执行 Shell 命令（受限命令白名单）",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "要执行的命令" },
      },
      required: ["command"],
    },
    execute: async (params: { command: string }) => {
      if (!isCommandAllowed(params.command, permissions)) {
        throw new Error(`禁止执行命令: ${params.command}`);
      }

      const result = await execAsync(params.command, {
        cwd: config.workingDir,
        timeout: 30000,
      });

      return result.stdout + result.stderr;
    },
  };
}
```

### 5.3 Task PI-3：System Prompt 合并

**目标**：在 Pi Agent 中实现 L2+L3 模板合并。

**新建文件**：`packages/agent-service/src/backends/pi-agent/system-prompt.ts`

```typescript
import path from "path";
import fs from "fs";

export interface SystemPromptContext {
  projectName: string;
  projectConfigStatus: "已设置" | "未设置";
  pageCount: number;
  pageList: string;
  workspacePath: string;
}

const L2_TEMPLATE_PATH = path.join(
  process.cwd(),
  "src",
  "lib",
  "agent-prompts",
  "demo-generator.template.md"
);

const L3_TEMPLATE = `## 当前工作空间

**项目**: {{PROJECT_NAME}}
**项目配置**: {{PROJECT_CONFIG_STATUS}}
**工作空间**: \`{{WORKSPACE_PATH}}\`
**页面数量**: {{PAGE_COUNT}}

{{PAGE_LIST}}`;

const L4_NOTICE = `## 权限确认

以下操作需要用户确认：
- 创建新页面目录
- 删除页面文件
- 修改项目级共享配置

系统会自动发送确认请求给用户。`;

export async function buildSystemPrompt(
  context: SystemPromptContext
): Promise<string> {
  const parts: string[] = [];

  const l2Template = fs.existsSync(L2_TEMPLATE_PATH)
    ? fs.readFileSync(L2_TEMPLATE_PATH, "utf-8")
    : "# Demo Generator Agent\n\n你是 Workbench 的 AI 编码助手。";

  parts.push(l2Template);

  const l3Content = L3_TEMPLATE.replace(
    /\{\{PROJECT_NAME\}\}/g,
    context.projectName
  )
    .replace(/\{\{PROJECT_CONFIG_STATUS\}\}/g, context.projectConfigStatus)
    .replace(/\{\{WORKSPACE_PATH\}\}/g, context.workspacePath)
    .replace(/\{\{PAGE_COUNT\}\}/g, String(context.pageCount))
    .replace(/\{\{PAGE_LIST\}\}/g, context.pageList || "（暂无页面）");

  parts.push(l3Content);

  parts.push(L4_NOTICE);

  return parts.join("\n\n---\n\n");
}
```

### 5.4 Task PI-4：PiAgentBackend 集成

**目标**：在 PiAgentBackend 中使用 L2+L3 合并的 system prompt 和权限工具。

**修改文件**：`packages/agent-service/src/backends/pi-agent.ts`

```typescript
import { buildSystemPrompt, type SystemPromptContext } from "./pi-agent/system-prompt";
import {
  createReadFileTool,
  createWriteFileTool,
  createBashTool,
  DEFAULT_WORKSPACE_PERMISSIONS,
} from "./pi-tools/file-tools";

export class PiAgentBackend implements IBackendAdapter {
  // ... 现有代码 ...

  async initialize(): Promise<void> {
    this.status = "initializing";

    const context: SystemPromptContext = {
      projectName: this.config.projectName ?? "未知项目",
      projectConfigStatus: this.hasProjectConfig ? "已设置" : "未设置",
      pageCount: this.demoPages.length,
      pageList: this.formatPageList(),
      workspacePath: this.config.workingDir ?? "",
    };

    const systemPrompt = await buildSystemPrompt(context);

    const tools = [
      createReadFileTool({
        ...this.config,
        permissions: DEFAULT_WORKSPACE_PERMISSIONS,
      }),
      createWriteFileTool({
        ...this.config,
        permissions: DEFAULT_WORKSPACE_PERMISSIONS,
      }),
      createBashTool({
        ...this.config,
        permissions: DEFAULT_WORKSPACE_PERMISSIONS,
      }),
    ];

    this.agent = new PiAgent({
      tools,
      systemPrompt,
    });

    this.status = "ready";
  }
}
```

---

## 六、实施任务总览

### 6.1 OpenCode 后端任务

| 顺序 | 任务 | 工作量 | 依赖 |
|:---:|:---|:---:|:---:|
| OC-1 | L1 权限配置注入 | 1h | 无 |
| OC-2 | L3 AGENTS.md 注入 | 1h | OC-1 |
| OC-3 | L2/L3 职责拆分 | 2h | OC-2 |
| OC-4 | instructions 包含 AGENTS.md | 0.5h | OC-2 |
| 验证 | 测试 | 2h | OC-1~4 |

### 6.2 Pi Agent 后端任务

| 顺序 | 任务 | 工作量 | 依赖 |
|:---:|:---|:---:|:---:|
| PI-1 | 创建 permissions.ts | 1h | 无 |
| PI-2 | 权限感知工具实现 | 2h | PI-1 |
| PI-3 | System Prompt 合并 | 1h | 无 |
| PI-4 | PiAgentBackend 集成 | 2h | PI-1~3 |
| 验证 | 测试 | 2h | PI-1~4 |

### 6.3 实施顺序建议

**方案 A：先 OpenCode 后 Pi Agent**

```
OpenCode 完成 → Pi Agent 实现 → 双后端并行验证
```

**方案 B：两条线并行**

```
OpenCode 任务 ──────────────────────────────┐
                                           ├→ 统一验证
Pi Agent 任务 ──────────────────────────────┘
```

**推荐方案 B**：两条线可以并行开发，共享 L2/L3 模板文件，最大化代码复用。

---

## 七、修改文件清单

### 7.1 OpenCode 后端修改

| 文件 | 修改类型 | 说明 |
|:---|:---:|:---|
| `packages/author-site/src/lib/workspace-manager.ts` | 修改 | 注入 permission 和 AGENTS.md |
| `packages/author-site/src/lib/templates/permission-config.ts` | 修改 | 重构 AGENTS_MD_TEMPLATE |
| `packages/author-site/src/lib/agent-prompts/demo-generator.template.md` | 修改 | 移除 L3 内容，保留 L2 规则 |

### 7.2 Pi Agent 后端修改

| 文件 | 修改类型 | 说明 |
|:---|:---:|:---|
| `packages/agent-service/src/backends/pi-tools/permissions.ts` | 新建 | 权限配置和校验逻辑 |
| `packages/agent-service/src/backends/pi-tools/file-tools.ts` | 修改 | 添加权限校验 |
| `packages/agent-service/src/backends/pi-agent/system-prompt.ts` | 新建 | L2+L3 模板合并 |
| `packages/agent-service/src/backends/pi-agent.ts` | 修改 | 使用新 system prompt |

### 7.3 不需要修改的文件

| 文件 | 原因 |
|:---|:---|
| `packages/agent-service/src/backends/*.ts`（现有后端） | OpenCode 后端不在此实现 |
| `packages/author-site/src/components/ai-elements/*` | L4 前端组件不受影响 |
| `packages/agent-service/src/acp/connection.ts` | ACP 连接层不涉及权限配置 |

---

## 八、验证清单

### 8.1 OpenCode 后端验证

- [ ] 新建项目后，`opencode.json` 包含 `permission` 字段
- [ ] 新建项目后，工作空间根目录存在 `AGENTS.md`
- [ ] AI 无法编辑非白名单文件（如 `.workspace.json`）—— L1 硬限制生效
- [ ] AI 无法执行 `rm`、`mv` 等禁止命令 —— L1 硬限制生效
- [ ] AI 无法读取 `.env` 文件 —— L1 硬限制生效
- [ ] AI 遵守 AGENTS.md 中的工作空间现状描述 —— L3 感知生效
- [ ] AI 遵守 demo-generator.md 中的行为规则 —— L2 规则不受影响
- [ ] AGENTS.md 中不包含行为规则（纯现状描述）
- [ ] demo-generator.md 中不包含工作空间结构/页面信息（已移到 L3）

### 8.2 Pi Agent 后端验证

- [ ] Pi Agent 只能读写工作空间内的白名单文件
- [ ] Pi Agent 无法执行禁止命令（rm, mv, cp, mkdir）
- [ ] Pi Agent 无法读取 `.env` 等敏感文件
- [ ] System Prompt 包含 L2 规则和 L3 现状
- [ ] 工具执行时权限校验正常工作

### 8.3 通用验证

- [ ] L4 权限确认对话框正常工作 —— 两种后端通用
- [ ] 页面创建/编辑/保存流程正常
- [ ] 三个 ACP 后端（claude/codex/gemini）的 `buildSystemPrompt()` 不受影响

---

## 九、风险与缓解

### 9.1 OpenCode 特有风险

| 风险 | 影响 | 缓解措施 |
|:---|:---|:---|
| opencode CLI 不支持 `permission` 字段 | L1 不生效 | 先确认 opencode CLI 的 config schema 是否支持 permission |
| opencode CLI 不读取 `instructions` 中的额外文件 | L3 不生效 | 改为将 AGENTS.md 内容追加到 demo-generator.md 末尾 |

### 9.2 Pi Agent 特有风险

| 风险 | 影响 | 缓解措施 |
|:---|:---|:---|
| 权限校验逻辑有漏洞 | L1 不生效 | 严格测试边界场景 |
| 工具定义格式与 pi-agent-core 不兼容 | 功能不可用 | 先验证 pi-agent-core API |

### 9.3 通用风险

| 风险 | 影响 | 缓解措施 |
|:---|:---|:---|
| L1 权限过于严格，影响 AI 正常工作 | AI 无法完成合理任务 | 先在测试环境验证，确认白名单覆盖所有正常操作 |
| L2/L3 拆分后遗漏关键内容 | AI 行为异常 | 拆分前逐项对照，确保每条内容都有归属 |

---

## 十、后续优化方向

1. **权限配置可视化编辑**：在创作端界面中提供权限配置的 UI 编辑入口
2. **双后端统一测试**：建立自动化测试，同时验证 OpenCode 和 Pi Agent 的约束效果
3. **约束生效监控**：记录 L1/L2/L3/L4 各层的拦截次数和类型，用于优化权限配置
4. **动态权限调整**：根据项目类型自动调整权限白名单

---

## 附录 A：权限配置模板

```typescript
export const OPENCODE_CONFIG_TEMPLATE = {
  $schema: 'https://opencode.ai/config.json',
  permission: {
    edit: {
      '*': 'deny',
      'index.tsx': 'allow',
      'config.schema.json': 'allow',
      'project.config.schema.json': 'allow',
      '.demo.json': 'allow',
      'AGENTS.md': 'allow',
    },
    read: {
      '*': 'allow',
      '*.env': 'deny',
      '*.env.*': 'deny',
    },
    bash: {
      '*': 'ask',
      'ls *': 'allow',
      'cat *': 'allow',
      'grep *': 'allow',
      'rm *': 'deny',
      'mv *': 'deny',
      'cp *': 'deny',
      'mkdir *': 'deny',
    },
    external_directory: {},
  },
};

export const PI_AGENT_PERMISSIONS: PermissionConfig = {
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
  allowedCommands: ["ls", "cat", "grep", "find", "node", "npm", "pnpm", "git"],
  deniedCommands: ["rm", "rmdir", "mv", "cp", "mkdir", "sudo", "chmod", "chown"],
};
```

---

**文档状态**：v2.0（支持双后端）
**最后更新**：2026-05-31
