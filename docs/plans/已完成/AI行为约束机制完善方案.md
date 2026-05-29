# AI 行为约束机制完善方案

> 版本：v1.0
> 创建日期：2026-05-27
> 关联文档：[03_AI行为约束机制.md](../../项目文档/创作端/05-AI对话/技术/03_AI行为约束机制.md)

---

## 一、现状分析

### 1.1 四层约束实现状态

| 层级                 | 设计 | 实现 | 实际生效 | 说明                                                                                                                     |
| :------------------- | :--- | :--- | :------- | :----------------------------------------------------------------------------------------------------------------------- |
| **L1** 文件系统权限  | ✅   | ❌   | ❌       | `OPENCODE_CONFIG_TEMPLATE` 已定义在 `permission-config.ts`，但未注入工作空间                                             |
| **L2** System Prompt | ✅   | ✅   | ✅       | `demo-generator.template.md` → `.opencode/agents/demo-generator.md`，定义 AI 怎么做、能做什么、不能做什么                |
| **L3** 工作空间现状  | ✅   | ❌   | ❌       | `AGENTS_MD_TEMPLATE` 已定义在 `permission-config.ts`，但未注入工作空间，应描述当前工作空间的目录结构、页面列表、配置现状 |
| **L4** 用户确认      | ✅   | ✅   | ✅       | `PermissionDialog` 组件 + `permission_request` 事件，已正常工作                                                          |

### 1.2 关键断裂点

| 位置                                                    | 问题                                                                       | 影响                                       |
| :------------------------------------------------------ | :------------------------------------------------------------------------- | :----------------------------------------- |
| `workspace-manager.ts` 的 `injectOpencodeAgentConfig()` | 只注入 `demo-generator.md`（L2），未注入权限配置（L1）和 AGENTS.md（L3）   | AI 行为无硬限制，无工作空间现状感知        |
| `opencode.json` 生成逻辑                                | 只包含 `agent`/`default_agent`/`instructions` 字段，缺少 `permission` 字段 | opencode CLI 无法应用文件读写/命令执行权限 |
| `AGENTS_MD_TEMPLATE` 与 `demo-generator.template.md`    | 两者内容存在重叠，且职责定位不清                                           | 职责边界不清晰，维护困难                   |

### 1.3 L2 与 L3 的职责定义

| 层级   | 定位         | 内容                         | 类比                     |
| :----- | :----------- | :--------------------------- | :----------------------- |
| **L2** | 任务手册     | 怎么做、能做什么、不能做什么 | 员工手册（规则不变）     |
| **L3** | 工作空间现状 | 当前工作空间有什么、是什么样 | 今日工作简报（动态变化） |

**当前问题**：`AGENTS_MD_TEMPLATE` 的内容混杂了行为规则（属于 L2）和工作空间描述（属于 L3），需要拆分。

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

完善 AI 行为约束的 L1（文件系统权限）和 L3（工作空间现状）两层，使四层约束机制全部生效：

- **L1**：提供硬限制，opencode CLI 强制执行文件读写和命令执行权限
- **L3**：提供当前工作空间的现状描述（目录结构、页面列表、配置状态），让 AI 了解所处环境
- **L2/L3 拆分**：将现有混杂的内容按职责分离（L2=规则，L3=现状）

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

### 3.2 Task 2：L3 AGENTS.md 注入

**目标**：重构 `AGENTS_MD_TEMPLATE` 内容为纯工作空间现状描述，并注入到工作空间。

**修改文件**：

- `packages/author-site/src/lib/templates/permission-config.ts`（重构模板内容）
- `packages/author-site/src/lib/workspace-manager.ts`（添加注入逻辑）

**方案**：

1. **重构 `AGENTS_MD_TEMPLATE`**：移除行为规则（属于 L2），改为纯现状描述

重构后的 `AGENTS_MD_TEMPLATE` 应包含：

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
│ ├── index.tsx
│ ├── config.schema.json
│ └── .demo.json
└── detail/
└── ...

## 已有页面

包含 {{PAGE_COUNT}} 个页面：
{{PAGE_LIST}}
```

2. 在 `injectOpencodeAgentConfig()` 末尾写入 AGENTS.md：

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

**与 L2 的关系**：L2 已经注入了页面信息（`demo-generator.md`），但这些信息也属于 L3 的职责。待 L3 实现后，L2 中的“工作空间结构”和“页面信息”章节应移除，改由 L3 提供。

**验证方式**：

1. 新建项目后检查 `data/workspaces/.../AGENTS.md` 是否存在且内容描述的是工作空间现状
2. 确认 AGENTS.md 中不包含行为规则（规则应在 L2 的 `demo-generator.md` 中）
3. 在 AI 对话中验证 AI 能感知当前工作空间有哪些页面

### 3.3 Task 3：L2/L3 职责拆分

**目标**：将 `demo-generator.template.md`（L2）和 `AGENTS_MD_TEMPLATE`（L3）的内容按职责重新划分。

**职责划分原则**：

- **L2（demo-generator.md）= Agent 任务手册**：怎么做、能做什么、不能做什么（规则）
- **L3（AGENTS.md）= 工作空间现状**：当前工作空间有什么、是什么样（现状）

**拆分方案**：

| 内容                        | 当前位置 | 目标位置       | 原因                          |
| :-------------------------- | :------- | :------------- | :---------------------------- |
| AI 角色定义                 | L2       | L2（保留）     | 属于规则                      |
| 工作空间结构（静态模板）    | L2       | **L3（移出）** | 属于现状描述                  |
| 页面信息（运行时注入）      | L2       | **L3（移出）** | 属于现状描述                  |
| 页面管理操作流程            | L2       | L2（保留）     | 属于“怎么做”                  |
| 项目配置管理流程            | L2       | L2（保留）     | 属于“怎么做”                  |
| 代码质量标准                | L2       | L2（保留）     | 属于“怎么做”                  |
| 文件修改决策规则            | L2       | L2（保留）     | 属于“怎么做”                  |
| 禁止行为清单                | L2       | L2（保留）     | 属于“不能做什么”              |
| React 版本约束              | L2       | L2（保留）     | 属于“规则”                    |
| 核心约束（白名单/禁止操作） | L3       | **L2（移入）** | 属于规则，L2 禁止行为章节补充 |
| 文件修改决策规则            | L3       | **删除**       | 与 L2 重复                    |
| 参考其他 Demo 指导          | L3       | **L2（移入）** | 属于“怎么做”                  |
| 目录结构 + 页面列表         | L3       | L3（保留）     | 属于现状描述                  |

**具体修改**：

1. **`demo-generator.template.md`（L2）**：
   - 移除“工作空间结构”和“页面信息”章节（移到 L3）
   - 保留所有任务流程和规则
   - 补充从 L3 移入的核心约束和参考指导

2. **`AGENTS_MD_TEMPLATE`（L3）**：
   - 移除行为规则内容（核心约束、文件修改决策规则、参考其他 Demo）
   - 保留并强化工作空间现状描述（动态目录结构、页面列表、项目配置状态）

3. **`permission-config.ts`**：
   - 同步更新 `AGENTS_MD_TEMPLATE` 字符串常量

**过渡方案**：由于 L3 尚未实现，L2 中的“工作空间结构”和“页面信息”暂时保留在 L2，待 L3 注入功能完成后再移除。

### 3.4 Task 4：确保 instructions 包含 AGENTS.md

**目标**：确保 opencode CLI 能读取 AGENTS.md（工作空间现状文件）。

**修改文件**：`packages/author-site/src/lib/workspace-manager.ts`

**方案**：在 `opencode.json` 的 `instructions` 数组中加入 `AGENTS.md` 的路径。

```typescript
const opencodeJson = {
  $schema: "https://opencode.ai/config.json",
  agent: {
    /* ... */
  },
  default_agent: "demo-generator",
  instructions: [
    ".opencode/agents/demo-generator.md",
    "AGENTS.md", // ← 新增
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

| 文件                                                                    | 修改类型 | 说明                                                       |
| :---------------------------------------------------------------------- | :------- | :--------------------------------------------------------- |
| `packages/author-site/src/lib/workspace-manager.ts`                     | 修改     | 扩展 `injectOpencodeAgentConfig()`                         |
| `packages/author-site/src/lib/templates/permission-config.ts`           | 修改     | 重构 `AGENTS_MD_TEMPLATE` 内容为工作空间现状               |
| `packages/author-site/src/lib/agent-prompts/demo-generator.template.md` | 修改     | 移除工作空间结构/页面信息（移到 L3），补充从 L3 移入的规则 |

### 4.2 不需要修改的文件

| 文件                                                | 原因                     |
| :-------------------------------------------------- | :----------------------- |
| `packages/agent-service/src/backends/*.ts`          | 后端适配层不涉及权限注入 |
| `packages/author-site/src/components/ai-elements/*` | L4 前端组件不受影响      |
| `packages/agent-service/src/acp/connection.ts`      | ACP 连接层不涉及权限配置 |

### 4.3 数据影响

- **已有工作空间**：不受影响（已有的 `opencode.json` 不会被更新）
- **新建工作空间**：自动获得完整的 L1+L2+L3+L4 约束

**如果需要更新已有工作空间**：可在 session 创建时重新调用 `injectOpencodeAgentConfig()`，或提供一个迁移脚本。

---

## 五、实施顺序

| 顺序 | Task                                | 依赖                    | 预计工作量 |
| :--- | :---------------------------------- | :---------------------- | :--------- |
| 1    | Task 1：L1 权限配置注入             | 无                      | 1 小时     |
| 2    | Task 4：instructions 包含 AGENTS.md | 无                      | 0.5 小时   |
| 3    | Task 2：L3 模板重构 + 注入          | Task 4（确定路径）      | 2 小时     |
| 4    | Task 3：L2/L3 职责拆分              | Task 2（L3 注入已工作） | 2 小时     |
| 5    | 验证与测试                          | Task 1-4                | 2 小时     |

**总计**：约 7.5 小时

---

## 六、验证清单

### 6.1 功能验证

- [ ] 新建项目后，`opencode.json` 包含 `permission` 字段
- [ ] 新建项目后，工作空间根目录存在 `AGENTS.md`
- [ ] AI 无法编辑非白名单文件（如 `.workspace.json`）—— L1 硬限制生效
- [ ] AI 无法执行 `rm`、`mv` 等禁止命令 —— L1 硬限制生效
- [ ] AI 无法读取 `.env` 文件 —— L1 硬限制生效
- [ ] AI 遵守 AGENTS.md 中的工作空间现状描述 —— L3 感知生效
- [ ] AI 遵守 demo-generator.md 中的行为规则 —— L2 规则不受影响
- [ ] AGENTS.md 中不包含行为规则（纯现状描述）
- [ ] demo-generator.md 中不包含工作空间结构/页面信息（已移到 L3）
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

| 风险                                            | 影响                | 缓解措施                                                 |
| :---------------------------------------------- | :------------------ | :------------------------------------------------------- |
| opencode CLI 不支持 `permission` 字段           | L1 不生效           | 先确认 opencode CLI 的 config schema 是否支持 permission |
| opencode CLI 不读取 `instructions` 中的额外文件 | L3 不生效           | 改为将 AGENTS.md 内容追加到 demo-generator.md 末尾       |
| L1 权限过于严格，影响 AI 正常工作               | AI 无法完成合理任务 | 先在测试环境验证，确认白名单覆盖所有正常操作             |
| L2/L3 拆分后遗漏关键内容                        | AI 行为异常         | 拆分前逐项对照，确保每条内容都有归属                     |
| 已有工作空间缺少新配置                          | 老项目无 L1/L3 约束 | 可接受（渐进式升级），或提供批量迁移脚本                 |

---

## 八、后续优化方向

1. **权限配置可视化编辑**：在创作端界面中提供权限配置的 UI 编辑入口，让非技术用户也能调整 AI 权限
2. **AGENTS.md 动态生成**：根据项目实际页面结构动态生成更精确的现状描述（如当前编辑的页面高亮标记）
3. **约束生效监控**：记录 L1/L2/L3/L4 各层的拦截次数和类型，用于优化权限配置
4. **Session 级权限缓存**：将 `allow_always` 决策持久化到 session 元数据，避免重复询问

---

**文档状态**：方案初版
**最后更新**：2026-05-27
