# 创作端"公约"功能设计

## 概述

为创作端新增"公约"功能，用户维护项目级和页面级约定，Agent 必须遵守。公约在每条消息中注入，是"项目法律"，区别于 Memory（Agent 自维护）和知识库（按需查阅）。

## 设计决策汇总

| 维度 | 决策 |
|------|------|
| 名称 | 中文"公约"，文件 `convention.md` |
| 存储 | `workspace/convention.md`（项目级）+ `demos/{pageId}/convention.md`（页面级） |
| 注入层 | L2 system prompt 末尾 |
| 注入范围 | 项目公约 + 当前页面公约（全部注入） |
| 页面公约未设置 | 显示"（本页面暂未设置公约）" |
| 超长截断 | 8000 字符截断 + 提示 |
| Agent 写权限 | Prompt 禁止主动修改，用户明确要求时放开 |
| 文件权限 | 不硬拦截 |
| UI 入口 | KnowledgePanel 横幅 + 页面右键菜单 |
| 编辑器 | 复用 MemoryMarkdownEditor |
| 项目创建 | 自动创建空的 `workspace/convention.md` |
| 页面创建 | 不自动创建页面公约，首次编辑时写入 |
| gitignore | `convention.md` 不入库 |

## 数据存储

### 文件路径

| 级别 | 路径 | 说明 |
|------|------|------|
| 项目级 | `workspace/convention.md` | workspace 根目录，和 `memory.md` 并列 |
| 页面级 | `demos/{demoId}/convention.md` | 页面目录内，和 `config.schema.json`、`index.tsx` 并列 |

### 初始化

- `workspace/convention.md` 在 workspace 初始化时自动创建（通过 `ensureWorkspaceFiles()`），初始内容为空白模板
- 页面公约**不自动创建**，用户首次编辑某个页面的公约时才写入，避免无公约页面产生空壳文件

### gitignore

`convention.md` 不入版本控制，和 `memory.md` 一致。

## Agent 行为约束

### 系统提示词新增内容

在 `system-prompt.md` 中 `## 项目记忆 (memory.md)` 段落后新增：

```
## 项目公约 (convention.md)

- 项目公约是用户维护的项目法律，AI 必须严格遵守
- 每条消息都会自动注入项目公约（workspace/convention.md）和当前操作页面的公约（demos/{pageId}/convention.md）
- 项目公约优先于本 prompt 中的通用规范（公约有明确要求时，以公约为准）

### 公约修改限制

- ❌ 禁止自动修改、整理、压缩、删除公约文件
- ❌ 禁止在未收到用户明确指令时写入 convention.md
- ✅ 仅在用户明确要求时（如"帮我写条公约"、"整理页面公约"、"润色这条公约"）才可编辑公约文件
- 编辑公约时仅修改用户指定的部分，不要擅自改动其他内容
```

### Memory 与 Convention 的对比

| | Memory（记忆） | Convention（公约） |
|------|------|------|
| 维护者 | Agent 主动维护 | 用户维护 |
| Agent 写权限 | 可主动更新 | 仅用户明确要求时可写 |
| 文件 | `workspace/memory.md` | `workspace/convention.md` + `demos/{pageId}/convention.md` |
| 注入层级 | L4，仅首条消息 | L2 system prompt，每条消息 |
| 语义 | "AI 学到的东西" | "项目必须遵守的法律" |

## 上下文注入

### 注入位置

system prompt 末尾，在静态 `system-prompt.md` 和 `generatePreviewAuthoringRules()` 之后运行时拼接。

### 注入内容

```
## 项目公约（必须遵守）

{workspace/convention.md 内容}

## 当前页面公约（必须遵守）

{demos/{pageId}/convention.md 内容}
```

- 项目公约文件不存在或无内容时，该段不显示
- 页面公约文件不存在或无内容时，显示"（本页面暂未设置公约）"
- 公约总长度超过 8000 字符时截断，尾部附加 `（公约内容已截断，完整公约请读取对应 convention.md）`

### 刷新时机

用户编辑公约保存后，前端需要触发 `updateSystemPrompt` 重传 system prompt，确保 Agent 立即感知公约变更。

### 实现路径

1. `scan-workspace.ts` 新增 `readConventionContent(workingDir)` 和 `readPageConventionContent(workingDir, pageId)`
2. `system-prompt.ts` 新增 `buildConventionPrefix(content)` 和 `buildPageConventionPrefix(content)`
3. `buildStaticSystemPrompt()` 接受可选的公约内容参数，拼接到 system prompt 末尾
4. `fetchContextPrefix()` 在 `ai-chat-setup.ts` 中同时读取公约内容，随 L3/L4 一并返回
5. `stream-service.ts` 在 `sendMessage` 时将公约内容传递给 `buildStaticSystemPrompt()`，由 author-site 侧拼接完成后发送给 agent-service

### 与现有 L3 上下文的关系

公约走 L2 system prompt 路径（和静态 system prompt 一起发送），不走 L3 用户消息前缀路径（和 Memory 不同）。原因：
- 公约每条消息都必须存在，适合 system prompt
- L3 是用户消息前缀，影响 LLM 的 prompt caching
- system prompt 内容稳定度高于用户消息，公约变动频率低，适合放 system prompt

## 文件读写权限

### Agent 侧

- 可 `readFile` 读取 `convention.md`（文件在 workspace 内，天然可达）
- Prompt 层面禁止 `writeFile` / `editFile` 操作公约文件（见"Agent 行为约束"节）
- 不做文件工具层的硬拦截，避免阻塞"帮我写条公约"等合法用户请求

### 创作端 API 侧

- `isFileEditable()` 白名单中增加 `convention.md`
- 现有 workspace files API 自然覆盖公约文件的读写

### 知识库写保护

`memory-maintenance` Skill 文档中增加说明：公约文件与记忆的区别，避免 Agent 用记忆维护逻辑触碰公约。

## API 变更

### `GET /api/agent/workspace-context`

新增返回字段：

```ts
{
  success: true,
  data: {
    // ...现有字段
    conventionContent: string | null,       // workspace/convention.md 内容
    pageConventionContent: string | null,   // demos/{pageId}/convention.md 内容
  }
}
```

新增 query 参数 `pageId`（可选），用于请求页面级公约。

### `GET/POST /api/sessions/[sessionId]/workspace/files/[...filePath]`

无需改动。`convention.md` 在 workspace 目录内，已有读写 API 自然覆盖。

## UI 设计

### KnowledgePanel 入口

在现有"AI 记忆"横幅下方新增"项目公约"横幅：

- 图标：`ScrollText`（lucide-react）
- 标题："项目公约"
- 描述："定义项目必须遵守的约定"
- 点击行为：打开公约 Markdown 编辑器（复用现有 `MemoryMarkdownEditor`）

编辑器组件建议重命名为 `WorkspaceMarkdownEditor`，同时服务记忆和公约。

### 页面公约入口

在页面树中增加页面公约入口（右键菜单或页面设置区域），点击后打开对应 `demos/{pageId}/convention.md` 的编辑器。

### 编辑器

复用现有 `MemoryMarkdownEditor`，更名为 `WorkspaceMarkdownEditor` 后同时用于 Memory 和 Convention 的编辑。

## 生命周期

| 事件 | 行为 |
|------|------|
| 项目创建（新建/从模板） | `ensureWorkspaceFiles()` 自动创建空的 `workspace/convention.md` |
| 页面创建 | 不自动创建页面公约，首次编辑时写入 |
| 页面删除 | `deletePage` 流程自然删除 `demos/{pageId}/` 目录，公约文件随之一同删除 |
| 项目克隆/模板复制 | 和 `memory.md` 一样，公约文件不参与克隆 |
| 用户编辑保存 | 前端触发 `updateSystemPrompt` 重传 |
| 项目无公约 | 注入段不显示（不显示空模板） |
| 页面无公约 | 注入段显示"（本页面暂未设置公约）" |

## 实现文件清单

| 文件 | 改动类型 | 说明 |
|------|------|------|
| `packages/author-site/src/lib/fs-utils.ts` | 修改 | 新增 `CONVENTION_FILENAME` 常量、`ensureConventionFile()` |
| `packages/author-site/src/lib/workspace-file-utils.ts` | 修改 | `isFileEditable()` 增加 `convention.md` |
| `packages/author-site/src/lib/agent/scan-workspace.ts` | 修改 | 新增 `readConventionContent()`、`readPageConventionContent()` |
| `packages/author-site/src/lib/agent/system-prompt.ts` | 修改 | 新增 `buildConventionPrefix()`，`buildStaticSystemPrompt()` 接受公约参数 |
| `packages/author-site/src/lib/agent/prompts/system-prompt.md` | 修改 | 新增"项目公约"段落 |
| `packages/author-site/src/lib/ai-chat-setup.ts` | 修改 | `fetchContextPrefix()` 返回公约字段 |
| `packages/author-site/src/app/api/agent/workspace-context/route.ts` | 修改 | 返回公约内容，新增 `pageId` 参数 |
| `packages/ai-chat-shared/src/chat/services/stream-service.ts` | 修改 | 注入公约到 system prompt |
| `packages/author-site/src/components/demo/KnowledgePanel.tsx` | 修改 | 新增"项目公约"横幅 |
| `packages/author-site/src/components/demo/MemoryMarkdownEditor.tsx` | 重命名 | → `WorkspaceMarkdownEditor.tsx` |
| `packages/author-site/src/app/demo/[id]/edit/page.tsx` | 修改 | 新增公约选择/编辑 handler |

## 验证策略

1. **类型检查**：`pnpm check:author`
2. **单元测试**：`scan-workspace.ts` 中新函数的测试
3. **集成验证**：启动 dev server，确认公约文件创建、编辑、注入全链路
4. **E2E**：可选，核心流程通过 `pnpm check:author` 验证

## 风险与边界

- **System prompt 体积膨胀**：8000 字符截断 + 仅注入当前页面公约，控制总体积。后续可改为仅注入"当前页面公约 + 项目公约摘要"模式
- **公约与知识库语义重叠**：公约是"法律"（每条消息强制可见），知识库是"参考"（需要时查阅），语义明确不冲突。如用户把公约写成知识库文档，需引导迁移
- **并发编辑**：不处理并发编辑（和 memory.md 一致，单机单用户场景）
