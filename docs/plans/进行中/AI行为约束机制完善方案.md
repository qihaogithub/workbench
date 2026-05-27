# AI 行为约束机制完善方案

> 版本：v1.0
> 创建日期：2026-05-27
> 关联文档：[03_AI行为约束机制.md](../../项目文档/创作端/05-AI对话/技术/03_AI行为约束机制.md)

---

## 一、现状分析

### 1.1 四层约束实现状态

| 层级 | 设计 | 实现 | 实际生效 | 说明 |
|:-----|:-----|:-----|:---------|:-----|
| **L1** 文件系统权限 | ✅ | ❌ | ❌ | `OPENCODE_CONFIG_TEMPLATE` 已定义在 `permission-config.ts`，但未注入工作空间 |
| **L2** System Prompt | ✅ | ✅ | ✅ | `demo-generator.template.md` → `.opencode/agents/demo-generator.md`，已正常工作 |
| **L3** 运行时规则 | ✅ | ❌ | ❌ | `AGENTS_MD_TEMPLATE` 已定义在 `permission-config.ts`，但未注入工作空间 |
| **L4** 用户确认 | ✅ | ✅ | ✅ | `PermissionDialog` 组件 + `permission_request` 事件，已正常工作 |

### 1.2 关键断裂点

| 位置 | 问题 | 影响 |
|:-----|:-----|:-----|
| `workspace-manager.ts` 的 `injectOpencodeAgentConfig()` | 只注入 `demo-generator.md`（L2），未注入权限配置（L1）和 AGENTS.md（L3） | AI 行为无硬限制，无工作空间级行为规范 |
| `opencode.json` 生成逻辑 | 只包含 `agent`/`default_agent`/`instructions` 字段，缺少 `permission` 字段 | opencode CLI 无法应用文件读写/命令执行权限 |
| `AGENTS_MD_TEMPLATE` 与 `demo-generator.template.md` | 两者内容存在重叠（禁止行为、文件修改决策规则） | 职责边界不清晰，维护困难 |

### 1.3 当前 opencode.json 生成内容

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

完善 AI 行为约束的 L1（文件系统权限）和 L3（运行时规则）两层，使四层约束机制全部生效，形成完整的安全防护体系：

- **L1**：提供硬限制，opencode CLI 强制执行文件读写和命令执行权限
- **L3**：提供工作空间级行为规范的软约束，与 L2 职责分离（L3 画红线，L2 教做事）

---

## 三、技术方案

### 3.1 Task 1：L1 权限配置注入

**目标**：将 `OPENCODE_CONFIG_TEMPLATE.permission` 合并到工作空间的 `opencode.json` 中。

**修改文件**：`packages/author-site/src/lib/workspace-manager.ts`

**方案**：在 `injectOpencodeAgentConfig()` 函数中，将 `OPENCODE_CONFIG_TEMPLATE.permission` 合并到现有的 `opencodeJson` 对象。

**变更点**：

1. 导入 `OPENCODE_CONFIG_TEMPLATE`：

```typescript
import { OPENCODE_CONFIG_TEMPLATE } from "./templates/permission-config";
```

2. 在 `injectOpencodeAgentConfig()` 中合并权限配置：

```typescript
const opencodeJson = {
  $schema: "https://opencode.ai/config.json",
  agent: { /* 现有 agent 配置不变 */ },
  default_agent: "demo-generator",
  instructions: [".opencode/agents/demo-generator.md"],
  permission: OPENCODE_CONFIG_TEMPLATE.permission,  // ← 新增
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
      "ls *": "allow", "cat *": "allow", "grep *": "allow",
      "rm *": "deny", "mv *": "deny", "cp *": "deny", "mkdir *": "deny"
    },
    "external_directory": {}
  }
}
```

**验证方式**：
1. 新建一个项目，检查 `data/workspaces/{userId}/{projectId}/{workspaceId}/.opencode/opencode.json` 是否包含 `permission` 字段
2. 让 AI 尝试编辑非白名单文件（如 `.workspace.json`），确认是否被拒绝
3. 让 AI 尝试执行 `rm` 命令，确认是否被拒绝

### 3.2 Task 2：L3 AGENTS.md 注入

**目标**：将 `AGENTS_MD_TEMPLATE` 注入到工作空间根目录的 `AGENTS.md`。

**修改文件**：`packages/author-site/src/lib/workspace-manager.ts`

**方案**：在 `injectOpencodeAgentConfig()` 函数末尾，添加 AGENTS.md 的写入逻辑。

**变更点**：

1. 导入 `AGENTS_MD_TEMPLATE`：

```typescript
import {
  OPENCODE_CONFIG_TEMPLATE,
  AGENTS_MD_TEMPLATE,
} from "./templates/permission-config";
```

2. 在 `injectOpencodeAgentConfig()` 末尾写入 AGENTS.md：

```typescript
// 注入 AGENTS.md（L3 运行时规则层）
const agentsMd = AGENTS_MD_TEMPLATE.replace(/\{demoId\}/g, "{demoId}");
// 注：AGENTS_MD_TEMPLATE 中的 {demoId} 是通用占位符，
// 因为工作空间可能包含多个 demo 页面，保留 {demoId} 让 AI 自行匹配
fs.writeFileSync(
  path.join(workspacePath, "AGENTS.md"),
  agentsMd,
  "utf-8",
);
```

**关于 `{demoId}` 占位符的处理策略**：

`AGENTS_MD_TEMPLATE` 中的 `{demoId}` 与 `demo-generator.template.md` 中的 `{{PROJECT_NAME}}` 不同：
- 后者在注入时可以替换为具体值（项目名已知）
- 前者不应替换为具体值，因为工作空间可能包含多个 demo 页面

**建议**：将模板中的 `{demoId}` 改为更具描述性的文本，例如 `<目标页面ID>`，避免 AI 将其视为需要替换的变量。

**AGENTS.md 与 opencode.json 的配合**：
- `opencode.json` 的 `instructions` 字段指向 `.opencode/agents/demo-generator.md`（L2）
- `AGENTS.md` 放在工作空间根目录，opencode CLI 会自动读取（如果支持）
- 如果 opencode CLI 不自动读取根目录 `AGENTS.md`，需要将其路径加入 `instructions` 数组

**验证方式**：
1. 新建项目后检查 `data/workspaces/.../AGENTS.md` 是否存在且内容正确
2. 在 AI 对话中验证 AI 是否遵守 AGENTS.md 中的禁止行为

### 3.3 Task 3：L2/L3 职责去重

**目标**：消除 `demo-generator.template.md`（L2）和 `AGENTS_MD_TEMPLATE`（L3）的内容重叠。

**职责划分原则**（参见记忆"L2与L3层级职责划分"）：
- **L2（demo-generator.md）= Agent 任务手册**：定义 AI 能做什么、怎么做
- **L3（AGENTS.md）= 安全边界规则**：定义 AI 不能做什么

**去重方案**：

| 内容 | 当前位置 | 目标位置 | 原因 |
|:-----|:---------|:---------|:-----|
| 工作空间结构 | L2 | L2（保留） | 属于任务上下文 |
| 页面信息（运行时注入） | L2 | L2（保留） | 属于任务上下文 |
| 页面管理操作流程 | L2 | L2（保留） | 属于"怎么做" |
| 代码质量标准 | L2 | L2（保留） | 属于"怎么做" |
| 文件修改决策规则 | L2 + L3 | **L2（保留），L3 移除** | 属于"怎么做" |
| 禁止行为清单 | L2 + L3 | **L3（保留），L2 简化引用** | 属于"不能做什么" |
| 核心约束（可操作文件白名单） | L3 | L3（保留） | 属于安全边界 |
| 参考其他 Demo 指导 | L3 | L3（保留） | 属于工作空间行为规范 |

**具体修改**：

1. **`demo-generator.template.md`（L2）**：
   - 保留"禁止行为"章节，但简化为引用 AGENTS.md 的方式
   - 例如：`## 安全约束\n请严格遵守工作空间根目录 AGENTS.md 中的所有规则。`

2. **`AGENTS_MD_TEMPLATE`（L3）**：
   - 移除"文件修改决策规则"章节（L2 已有详细描述）
   - 保留核心约束、可操作文件白名单、禁止操作清单

3. **`permission-config.ts`**：
   - 同步更新 `AGENTS_MD_TEMPLATE` 字符串常量

### 3.4 Task 4：确保 instructions 包含 AGENTS.md

**目标**：确保 opencode CLI 能读取 AGENTS.md。

**修改文件**：`packages/author-site/src/lib/workspace-manager.ts`

**方案**：在 `opencode.json` 的 `instructions` 数组中加入 `AGENTS.md` 的路径。

```typescript
const opencodeJson = {
  $schema: "https://opencode.ai/config.json",
  agent: { /* ... */ },
  default_agent: "demo-generator",
  instructions: [
    ".opencode/agents/demo-generator.md",
    "AGENTS.md",  // ← 新增
  ],
};
```

**前提条件**：需要确认 opencode CLI 是否支持读取 `instructions` 中指定的多个文件作为系统指令。如果只支持 `.opencode/agents/` 下的文件，则需要将 AGENTS.md 也放在该目录下（如 `.opencode/agents/workspace-rules.md`）。

**验证方式**：
1. 检查生成的 `opencode.json` 中 `instructions` 数组是否包含 AGENTS.md 路径
2. 在 AI 对话中验证 AI 是否能读取并遵守 AGENTS.md 中的规则

---

## 四、影响范围

### 4.1 修改文件清单

| 文件 | 修改类型 | 说明 |
|:-----|:---------|:-----|
| `packages/author-site/src/lib/workspace-manager.ts` | 修改 | 扩展 `injectOpencodeAgentConfig()` |
| `packages/author-site/src/lib/templates/permission-config.ts` | 修改 | 更新 `AGENTS_MD_TEMPLATE` 内容（去重后） |
| `packages/author-site/src/lib/agent-prompts/demo-generator.template.md` | 修改 | 简化"禁止行为"章节，引用 AGENTS.md |

### 4.2 不需要修改的文件

| 文件 | 原因 |
|:-----|:-----|
| `packages/agent-service/src/backends/*.ts` | 后端适配层不涉及权限注入 |
| `packages/author-site/src/components/ai-elements/*` | L4 前端组件不受影响 |
| `packages/agent-service/src/acp/connection.ts` | ACP 连接层不涉及权限配置 |

### 4.3 数据影响

- **已有工作空间**：不受影响（已有的 `opencode.json` 不会被更新）
- **新建工作空间**：自动获得完整的 L1+L2+L3+L4 约束

**如果需要更新已有工作空间**：可在 session 创建时重新调用 `injectOpencodeAgentConfig()`，或提供一个迁移脚本。

---

## 五、实施顺序

| 顺序 | Task | 依赖 | 预计工作量 |
|:-----|:-----|:-----|:-----------|
| 1 | Task 1：L1 权限配置注入 | 无 | 1 小时 |
| 2 | Task 4：instructions 包含 AGENTS.md | 无 | 0.5 小时 |
| 3 | Task 2：L3 AGENTS.md 注入 | Task 4（确定路径） | 1 小时 |
| 4 | Task 3：L2/L3 职责去重 | Task 2（L3 注入已工作） | 2 小时 |
| 5 | 验证与测试 | Task 1-4 | 2 小时 |

**总计**：约 6.5 小时

---

## 六、验证清单

### 6.1 功能验证

- [ ] 新建项目后，`opencode.json` 包含 `permission` 字段
- [ ] 新建项目后，工作空间根目录存在 `AGENTS.md`
- [ ] AI 无法编辑非白名单文件（如 `.workspace.json`）—— L1 硬限制生效
- [ ] AI 无法执行 `rm`、`mv` 等禁止命令 —— L1 硬限制生效
- [ ] AI 无法读取 `.env` 文件 —— L1 硬限制生效
- [ ] AI 遵守 AGENTS.md 中的核心约束 —— L3 软约束生效
- [ ] AI 正常使用 `demo-generator.md` 的任务指导 —— L2 不受影响
- [ ] L4 权限确认对话框仍正常工作 —— L4 不受影响

### 6.2 回归验证

- [ ] 已有项目不受影响（不会自动注入新配置）
- [ ] 页面创建/编辑/保存流程正常
- [ ] AI 对话功能正常（System Prompt 注入不受影响）
- [ ] 快照功能正常（`opencode.json` 排除逻辑不受影响）
- [ ] 三个后端（claude/codex/gemini）的 `buildSystemPrompt()` 不受影响

### 6.3 边界场景

- [ ] AI 尝试编辑 `AGENTS.md` 自身 —— 应该允许（白名单内）
- [ ] AI 尝试创建新页面时 `mkdir` 被拒绝 —— 预期行为（提示用户在界面操作）
- [ ] 多页面项目的 AGENTS.md 内容正确 —— 不含特定 demoId 的硬编码

---

## 七、风险与注意事项

| 风险 | 影响 | 缓解措施 |
|:-----|:-----|:---------|
| opencode CLI 不支持 `permission` 字段 | L1 不生效 | 先确认 opencode CLI 的 config schema 是否支持 permission |
| opencode CLI 不读取 `instructions` 中的额外文件 | L3 不生效 | 改为将 AGENTS.md 内容追加到 demo-generator.md 末尾 |
| L1 权限过于严格，影响 AI 正常工作 | AI 无法完成合理任务 | 先在测试环境验证，确认白名单覆盖所有正常操作 |
| L2/L3 去重后遗漏关键规则 | AI 行为异常 | 去重前逐项对照，确保每条规则都有归属 |
| 已有工作空间缺少新配置 | 老项目无 L1/L3 约束 | 可接受（渐进式升级），或提供批量迁移脚本 |

---

## 八、后续优化方向

1. **权限配置可视化编辑**：在创作端界面中提供权限配置的 UI 编辑入口，让非技术用户也能调整 AI 权限
2. **AGENTS.md 动态生成**：根据项目实际页面结构动态生成更精确的行为规范（如当前编辑的页面 ID）
3. **约束生效监控**：记录 L1/L2/L3/L4 各层的拦截次数和类型，用于优化权限配置
4. **Session 级权限缓存**：将 `allow_always` 决策持久化到 session 元数据，避免重复询问

---

**文档状态**：方案初版
**最后更新**：2026-05-27
