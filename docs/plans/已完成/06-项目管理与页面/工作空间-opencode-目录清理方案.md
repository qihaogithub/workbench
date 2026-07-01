# 工作空间 .opencode 目录清理方案

> 版本：v1.1
> 创建日期：2026-06-03
> 更新日期：2026-06-03
> 状态：📝 待评审
> 分类：架构清理方案
> 背景：Pi Agent 全面迁移后遗留的 OpenCode 配置清理

---

## 一、问题分析

### 1.1 背景

根据《[全面迁移至Pi-Agent并移除多后端支持方案](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/docs/plans/已完成/全面迁移至Pi-Agent并移除多后端支持方案.md)》（已完成），系统 Agent 后端已从 OpenCode 全面迁移至 Pi Agent（`@earendil-works/pi-agent-core`），核心变化：

| 维度             | OpenCode 时期                                                    | Pi Agent 时期                                           |
| :--------------- | :--------------------------------------------------------------- | :------------------------------------------------------ |
| **架构**         | 外部 Go 进程（端口 4096）                                        | 进程内嵌入（无外部依赖）                                |
| **配置方式**     | `.opencode/opencode.json` + `.opencode/agents/demo-generator.md` | author-site 端通过 `buildStaticSystemPrompt()` 静态注入 |
| **提示词加载**   | 读取 `.opencode/agents/demo-generator.md` 文件                   | 从 `@opencode-workbench/shared/agent-prompts` 导入模板  |
| **运行时上下文** | 写入 `.opencode/agents/demo-generator.md` 占位符替换             | 通过 `buildDynamicContextPrefix()` 动态构建 L3 前缀     |

### 1.2 当前 .opencode 目录的作用（代码验证）

#### 1.2.1 author-site 端注入逻辑

**文件**：[packages/author-site/src/lib/workspace-manager.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/author-site/src/lib/workspace-manager.ts#L49-L128)

```typescript
function injectReferences(workspacePath: string): void {
  const refsDir = path.join(workspacePath, "references");
  if (!fs.existsSync(refsDir)) {
    fs.mkdirSync(refsDir, { recursive: true });
  }

  // 源目录：author-site/src/lib/agent-prompts/references/*.md
  const sourceDir = path.join(
    process.cwd(),
    "src",
    "lib",
    "agent-prompts",
    "references",
  );
  if (!fs.existsSync(sourceDir)) return;

  for (const file of fs.readdirSync(sourceDir)) {
    if (!file.endsWith(".md")) continue;
    fs.copyFileSync(path.join(sourceDir, file), path.join(refsDir, file));
  }
}

function injectOpencodeAgentConfig(
  workspacePath: string,
  projectId: string,
): void {
  // 1. 创建 .opencode/agents/ 目录
  const opencodeDir = path.join(workspacePath, ".opencode");
  const agentsDir = path.join(opencodeDir, "agents");

  // 2. 注入 references/ 目录（配置系统参考文档）
  injectReferences(workspacePath);

  // 3. 写入 opencode.json（OpenCode 配置文件）
  // 4. 读取模板并替换占位符，写入 demo-generator.md
  // ... (代码省略)
}
```

**调用时机**：

- `createWorkspace()` 创建新工作空间时（L149）
- 仅在 **author-site 前端** 的工作空间创建流程中调用

#### 1.2.2 Pi Agent 端实际使用情况

**文件**：[packages/agent-service/src/backends/pi-agent.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/agent-service/src/backends/pi-agent.ts#L68-L76)

```typescript
this.agent = new Agent({
  initialState: {
    model: model,
    systemPrompt: '# Workbench AI 编码助手\n\n等待 system prompt 注入...',  // ← 占位符
    tools: tools,  // ← 使用 pi-tools（readFile/writeFile/listFiles/bash/schemaValidate）
  },
  ...
});
```

**System Prompt 注入路径**：

1. **L2 行为约束层**：[author-site/src/lib/agent/system-prompt.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/author-site/src/lib/agent/system-prompt.ts#L97-L99)
   - `buildStaticSystemPrompt()` → 从 `@opencode-workbench/shared/agent-prompts` 导入 `DEMO_GENERATOR_TEMPLATE`
   - 100% 静态，应用启动时缓存，LLM API prompt caching 100% 命中

2. **L3 动态上下文**：`buildDynamicContextPrefix()` → 每次 sendMessage 前渲染项目状态（项目名称、页面列表、配置状态）

3. **L4 记忆前缀**：`buildMemoryPrefix()` → 格式化 memory.md 内容

**关键发现**：

- ✅ Pi Agent **完全不读取** `.opencode/opencode.json` 配置文件
- ✅ Pi Agent **完全不读取** `.opencode/agents/demo-generator.md` 提示词文件
- ✅ System Prompt 由 author-site 端通过 API 直接传递（不再依赖文件系统）
- ✅ `references/` 目录已存在于项目工作空间模板中（`data/projects/*/workspace/references/`），包含 `config-system.md`
- ⚠️ `injectReferences()` 函数期望的源目录 `src/lib/agent-prompts/references` **当前不存在**（代码中未使用，但保留以兼容未来扩展）

#### 1.2.3 过滤与清理逻辑

**文件验证**：系统已在多处过滤 `.opencode` 目录

| 文件                                                                                                                                                      | 位置      | 过滤逻辑                                            |
| :-------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------- | :-------------------------------------------------- |
| [workspace-file-utils.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/author-site/src/lib/workspace-file-utils.ts#L36-L43)         | L37       | `HIDDEN_ENTRIES` 包含 `".opencode"`（文件树中隐藏） |
| [session-guard.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/agent-service/src/session/session-guard.ts#L64)                     | L64       | 快照保存时跳过 `opencode.json`                      |
| [snapshot-service.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/agent-service/src/session/snapshot-service.ts#L84)               | L84, L188 | 快照保存/恢复时跳过 `opencode.json`                 |
| [permissions.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/agent-service/src/backends/pi-tools/permissions.ts#L30-L31)           | L30-L31   | Pi Agent 权限白名单排除 `**/.opencode`              |
| [demo-generator.template.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/shared/src/agent-prompts/demo-generator.template.ts#L144) | L144      | 系统提示词禁止 AI 修改 `.opencode/`                 |

### 1.3 问题总结

| 问题                 | 影响                                                                                            | 严重程度 |
| :------------------- | :---------------------------------------------------------------------------------------------- | :------- |
| **配置冗余**         | `.opencode/opencode.json` 和 `.opencode/agents/demo-generator.md` 已无实际作用，Pi Agent 不读取 | 🔴 高    |
| **存储浪费**         | 每个工作空间多出 `.opencode/` 目录（含 JSON + MD 文件）                                         | 🟡 中    |
| **用户认知混淆**     | 工作空间目录包含 OpenCode 相关配置，但系统已迁移至 Pi Agent                                     | 🟡 中    |
| **维护成本**         | `injectOpencodeAgentConfig()` 函数仍需维护模板替换逻辑                                          | 🟡 中    |
| **references/ 依赖** | 提示词引用 `references/config-system.md`，该目录仍由 `injectReferences()` 注入                  | 🟢 保留  |

---

## 二、方案设计

### 2.1 核心决策

**决策**：清理 `.opencode/` 目录，同时清理 `injectReferences()` 函数（源目录不存在，已无实际作用）

**理由**：

1. `.opencode/opencode.json` → OpenCode 专属配置文件，Pi Agent 不使用
2. `.opencode/agents/demo-generator.md` → 提示词已迁移至 `@opencode-workbench/shared/agent-prompts`，由 author-site 端静态注入
3. `injectReferences()` → 源目录 `src/lib/agent-prompts/references` 当前不存在，函数实际为无效代码
4. `references/` 目录 → 已存在于项目工作空间模板中（`data/projects/*/workspace/references/`），随 `fs.cpSync()` 自动复制到新工作空间

**验证**：

```bash
# 验证源目录不存在
ls packages/author-site/src/lib/agent-prompts/
# 输出：workspace-status.template.ts  （无 references/ 子目录）

# 验证项目模板包含 references/
ls data/projects/proj_1779608460378/workspace/references/
# 输出：config-system.md
```

### 2.2 影响范围

#### 2.2.1 需要修改的文件

| 文件                                                           | 改动类型 | 说明                                                                                              |
| :------------------------------------------------------------- | :------- | :------------------------------------------------------------------------------------------------ |
| `packages/author-site/src/lib/workspace-manager.ts`            | 重构     | 移除 `injectOpencodeAgentConfig()` 函数及 `injectReferences()` 函数，`createWorkspace()` 不再调用 |
| `packages/author-site/src/lib/workspace-file-utils.ts`         | 简化     | `HIDDEN_ENTRIES` 移除 `".opencode"`（不再需要隐藏）                                               |
| `packages/shared/src/agent-prompts/demo-generator.template.ts` | 微调     | L144 禁止行为中移除 `.opencode/` 相关条目（已不存在）                                             |

#### 2.2.2 不需要修改的文件

| 文件                                                          | 原因                                           |
| :------------------------------------------------------------ | :--------------------------------------------- |
| `packages/agent-service/src/session/session-guard.ts`         | 保留 `opencode.json` 过滤（兼容历史工作空间）  |
| `packages/agent-service/src/session/snapshot-service.ts`      | 保留快照过滤逻辑（兼容历史工作空间）           |
| `packages/agent-service/src/backends/pi-tools/permissions.ts` | 保留权限拦截（防御性编程，防止 AI 尝试创建）   |
| 历史工作空间 `data/projects/*/workspace/.opencode/`           | 无需主动删除（自然淘汰，新建工作空间不再生成） |

### 2.3 实施步骤

#### 阶段一：移除 .opencode 注入逻辑（核心改动）

**目标**：工作空间创建时不再注入 `.opencode/` 目录，同时清理 `injectReferences()` 函数（源目录不存在，已无实际作用）

| 步骤 | 文件                           | 改动                                                                                     |
| :--- | :----------------------------- | :--------------------------------------------------------------------------------------- |
| 1    | `workspace-manager.ts` L27-128 | 移除 `injectReferences()` 函数（L27-47）和 `injectOpencodeAgentConfig()` 函数（L49-128） |
| 2    | `workspace-manager.ts` L162    | 移除 `injectOpencodeAgentConfig(workspacePath, projectId);` 调用                         |
| 3    | 验证 `references/` 自动复制    | 确认项目模板 `data/projects/*/workspace/references/` 随 `fs.cpSync()` 自动复制到工作空间 |
| 4    | 运行 `pnpm typecheck`          | 验证编译通过                                                                             |

**重构后代码**：

```typescript
// 移除 injectReferences() 和 injectOpencodeAgentConfig() 两个函数
// createWorkspace() 中删除调用：
// - injectOpencodeAgentConfig(workspacePath, projectId);
// references/ 目录随 fs.cpSync(projectWorkspacePath, workspacePath) 自动复制
```

#### 阶段二：清理前端隐藏规则

**目标**：文件树不再需要隐藏 `.opencode`（因为不再生成）

| 步骤 | 文件                             | 改动                                   |
| :--- | :------------------------------- | :------------------------------------- |
| 1    | `workspace-file-utils.ts` L36-43 | 从 `HIDDEN_ENTRIES` 移除 `".opencode"` |
| 2    | 验证文件树渲染                   | 确认无异常                             |

#### 阶段三：更新系统提示词

**目标**：禁止行为列表中移除 `.opencode/` 相关条目

| 步骤 | 文件                              | 改动                                                                             |
| :--- | :-------------------------------- | :------------------------------------------------------------------------------- |
| 1    | `demo-generator.template.ts` L144 | 移除 `❌ 修改 \`.session.json\`、\`.opencode/\`、\`.workspace.json\` 等系统文件` |
| 2    | 改为                              | `❌ 修改 \`.session.json\`、\`.workspace.json\` 等系统文件`                      |
| 3    | 运行 `pnpm typecheck`             | 验证编译通过                                                                     |

#### 阶段四：验证与测试

| 步骤 | 操作                | 预期结果                                            |
| :--- | :------------------ | :-------------------------------------------------- |
| 1    | `pnpm dev` 启动服务 | 无报错                                              |
| 2    | 创建新项目          | 工作空间目录包含 `references/`，不包含 `.opencode/` |
| 3    | AI 对话测试         | System Prompt 正常注入，AI 行为无异常               |
| 4    | 文件树渲染          | 不显示 `.opencode`（因为不存在）                    |
| 5    | 快照保存/恢复       | 正常（兼容历史工作空间）                            |
| 6    | `pnpm test:e2e`     | 全部通过                                            |

---

## 三、历史工作空间处理策略

### 3.1 方案选择

**决策**：不主动删除历史工作空间的 `.opencode/` 目录

**理由**：

1. **兼容性**：session-guard、snapshot-service 已包含过滤逻辑，不会出错
2. **安全性**：主动删除可能影响正在进行的会话
3. **自然淘汰**：新建/重建工作空间时不再生成，旧目录随项目清理自然消失
4. **用户无感知**：`.opencode/` 已在文件树中隐藏，不影响使用体验

### 3.2 兼容保障

| 场景                 | 现有逻辑                                            | 是否受影响  |
| :------------------- | :-------------------------------------------------- | :---------- |
| 历史工作空间 AI 对话 | Pi Agent 不读取 `.opencode/`                        | ❌ 不受影响 |
| 快照保存             | session-guard/snapshot-service 跳过 `opencode.json` | ❌ 不受影响 |
| 文件树渲染           | `isHiddenEntry(".opencode")` 返回 true              | ❌ 不受影响 |
| 权限拦截             | pi-tools 排除 `**/.opencode`                        | ❌ 不受影响 |

---

## 四、预期收益

| 收益             | 说明                                                                                    |
| :--------------- | :-------------------------------------------------------------------------------------- |
| **代码量减少**   | 删除 ~102 行无效代码（`injectReferences` L27-47 + `injectOpencodeAgentConfig` L49-128） |
| **存储节省**     | 每个新工作空间减少 ~2KB（opencode.json + demo-generator.md）                            |
| **架构一致性**   | 工作空间目录不再包含废弃的 OpenCode 配置                                                |
| **维护简化**     | 移除模板占位符替换逻辑（projectName/pageCount/pageList 等）及无效函数                   |
| **用户认知清晰** | 工作空间目录结构与实际使用的 Pi Agent 架构一致                                          |

---

## 五、风险与缓解

| 风险                       | 概率 | 影响 | 缓解措施                                                                          |
| :------------------------- | :--- | :--- | :-------------------------------------------------------------------------------- |
| **references/ 复制遗漏**   | 极低 | 高   | 验证项目模板包含 `references/config-system.md`，`fs.cpSync()` 自动复制            |
| **历史工作空间异常**       | 极低 | 中   | 不主动删除，保留所有过滤/兼容逻辑                                                 |
| **System Prompt 注入失败** | 极低 | 高   | Pi Agent 使用 `buildStaticSystemPrompt()`，与 `.opencode/` 无关，已有缓存机制保障 |
| **E2E 测试失败**           | 低   | 中   | 阶段四运行 `pnpm test:e2e`，根据失败调整                                          |

---

## 六、实施记录

> 实施完成后在此记录实际变更、偏差和问题。

### 6.1 实施日期

- 计划：待定
- 实际：待填写

### 6.2 实际变更

| 文件   | 改动行数 | 说明 |
| :----- | :------- | :--- |
| 待填写 | -        | -    |

### 6.3 偏差说明

| 项     | 方案描述 | 实际选择 | 原因 |
| :----- | :------- | :------- | :--- |
| 待填写 | -        | -        | -    |

### 6.4 验证结果

| 测试项           | 预期            | 实际   | 状态 |
| :--------------- | :-------------- | :----- | :--- |
| `pnpm typecheck` | 通过            | 待验证 | ⏳   |
| `pnpm test:e2e`  | 通过            | 待验证 | ⏳   |
| 新工作空间创建   | 无 `.opencode/` | 待验证 | ⏳   |
| AI 对话功能      | 正常            | 待验证 | ⏳   |

---

## 七、附录

### 7.1 相关文档

- [全面迁移至Pi-Agent并移除多后端支持方案](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/docs/plans/已完成/全面迁移至Pi-Agent并移除多后端支持方案.md) - Pi Agent 迁移方案（已完成）
- [草稿工作区 v2](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/docs/项目文档/创作端/03-项目管理/技术/03_项目工作区_v2.md) - 工作空间架构文档
- [工作空间对话解耦](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/docs/项目文档/创作端/03-项目管理/技术/07_工作空间对话解耦.md) - workspace-manager 设计

### 7.2 关键代码路径

#### System Prompt 注入链

```
author-site/src/lib/agent/system-prompt.ts
  ├─ buildStaticSystemPrompt()  ← L2 行为约束（静态，缓存）
  │   └─ @opencode-workbench/shared/agent-prompts/demo-generator.template.ts
  ├─ buildDynamicContextPrefix()  ← L3 动态上下文（每次 sendMessage 渲染）
  │   └─ agent-prompts/workspace-status.template.ts
  └─ buildMemoryPrefix()  ← L4 记忆前缀（memory.md 格式化）
       ↓
author-site/src/lib/agent-client.ts  ← 通过 API 传递给 agent-service
       ↓
agent-service/src/backends/pi-agent.ts  ← updateSystemPrompt 更新 Agent 状态
```

#### 工作空间创建链

```
author-site/src/lib/workspace-manager.ts
  ├─ createWorkspace()  ← 创建工作空间
  │   ├─ fs.cpSync(projectWorkspacePath, workspacePath)  ← 复制项目文件（含 references/）
  │   ├─ 写入 .workspace.json  ← 元数据
  │   └─ 移除：injectOpencodeAgentConfig()  ← 重构后不再调用
  └─ 返回 { workspaceId, workspacePath, demos }
```

### 7.3 术语表

| 术语                          | 说明                                                                                     |
| :---------------------------- | :--------------------------------------------------------------------------------------- |
| `.opencode/`                  | OpenCode Agent 的配置目录，包含 opencode.json 和 agents/ 子目录                          |
| `references/`                 | 工作空间参考文件目录，包含 config-system.md 等配置系统文档（已存在于项目模板）           |
| `injectReferences()`          | 原函数，从 `src/lib/agent-prompts/references` 复制参考文件（源目录不存在，已无实际作用） |
| `injectOpencodeAgentConfig()` | 原函数，负责注入 .opencode 配置和提示词（重构后移除）                                    |
| L2/L3/L4                      | System Prompt 分层：L2=静态行为约束，L3=动态上下文，L4=记忆前缀                          |
| Pi Agent                      | `@earendil-works/pi-agent-core`，进程内嵌入的 Agent 后端                                 |
| OpenCode                      | 已废弃的外部 Go 进程 Agent 后端（端口 4096）                                             |
