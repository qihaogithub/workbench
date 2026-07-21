# AI 架构统一 — 创作端与浏览端模式驱动方案

## 当前状态

已实施完成（2026-07-21）。全部六个 Phase 落地：agent-client mode 支持、agent-service 统一路由（viewer-ai 专用路由已删除）、`@workbench/ai-chat-shared` 共享包（31 个组件 + 17 个 ui 原语 + ai-models/active-view-context）、viewer-site 流式接入（ViewerAiPanel）、author-site re-export 适配。

验证结论：agent-service 388 测试全绿（含新增 viewer-readonly-mode 测试）、author-site 909 测试全绿、viewer-site typecheck + next build 通过、agent-client / ai-chat-shared typecheck 通过、其余包级检查通过。`check:workspace-authority` 与 `check:project-cli` 两项失败经 HEAD worktree 复跑确认为既有问题（与本改造无关），已记录到《测试与工程质量问题沉淀》。

剩余事项：浏览端/创作端真实服务下的手动全流程回归（需启动 author/agent/viewer 服务）与 `pnpm test:e2e`；部署环境确认 agent-service `CORS_ORIGINS` 含 viewer origin。

## 当前结论

通过 `mode` 参数驱动实现三层统一（通信层、后端层、UI 层），消除创作端和浏览端 AI 功能的两套独立代码路径。

**核心原则：以创作端体验为基准，浏览端向创作端靠齐。** 当前创作端拥有更优的流式通信、完整的工具调用可视化和一致的交互体验，改造方向是在保持架构统一的前提下，让浏览端获得与之对等的能力（仅通过 mode 限制读写权限，不降低体验质量）。

**2026-07-21 校正摘要**（基于代码核对，原方案的主要修正点）：

1. ai-elements 实为 **31 个源文件、约 1.03 万行**（原文档写 43 个组件），并额外依赖 7 个 shadcn/ui 原语、`cn()`、`ai-models.ts`（738 行）、`active-view-context.ts`、`system-prompt.ts`。
2. `AgentStream.getModels` / `AgentClient.getModelInfo` **不存在**；模型列表实际通过 WS `get_models` 消息 → `models` 事件获取（`use-chat-models` 已封装，但用 `(stream as any).ws` hack，本次在 AgentStream 上补 `requestModels()` 方法消除）。
3. message-service **不是基于 localStorage**，而是调用 author-site 的 `/api/sessions/*` HTTP API 做服务端持久化；localStorage 仅存于 use-chat-models 的模型偏好。
4. 浏览端上下文改为**服务端注入**：mode=viewer-readonly 时由 agent-service 强制 systemPrompt/permissions/toolMode，并按 projectId 解析 workingDir、自动拼接 `buildViewerAiPromptContext`。客户端不再构建/回传上下文，原方案 2.4.3 中 viewer 侧 AiContextProvider（`fetchSimpleSystemPrompt`/`fetchViewerContext`）取消 —— 更简单且不给客户端伪造上下文的机会。
5. `system-prompt.ts` 依赖 `.md` 文件 import（webpack loader）和 `@workbench/preview-contract`，**留在 author-site**，通过注入接口传给共享包；`ai-models.ts` 与 `active-view-context.ts` 除 ai-elements 外几乎无引用，随包整体迁移。
6. `AgentConfig.toolMode`、`createWorkbenchTools({ mode: "viewer-readonly" })`、agent-manager 的 toolMode 变化重建逻辑**均已存在**，后端统一的地基比原方案预估的更成熟。
7. agent-service WS 在最后一个连接关闭时已自动销毁 agent 并清理临时工作空间（websocket.ts close handler），浏览端"关抽屉即清理"依赖该现有行为，`destroySession` 仅为兜底。
8. viewer-ai-context.ts 原地保留（agent-service 没有独立 prompt 模块，无需移动文件）。

---

## 1. 背景与动机

### 1.1 现状

创作端（author-site）和浏览端（viewer-site）都有 AI 对话功能，但实现方式完全不同：

| 维度 | 创作端 | 浏览端 |
|------|--------|--------|
| 通信方式 | WebSocket 流式 + HTTP fallback | HTTP POST 同步 |
| UI 组件 | 31 个源文件约 1.03 万行（`ai-elements/`） | 1 个组件（`ViewerAiDrawer.tsx`，771 行） |
| Client SDK | `@workbench/agent-client` | 裸 `fetch` |
| 后端路由 | `/api/agent/:sessionId/*` | `/api/viewer-ai/chat` |
| 工具集 | 27+ 工具（toolMode=workbench） | 3 个只读工具（readFile/listFiles/knowledgeReport） |
| 会话管理 | 服务端持久化（`/api/sessions/*`） | 每次临时 sessionId + 客户端回传 history |
| 流式输出 | 支持 | 不支持 |
| 工具调用可视化 | 完整（思维链、计划面板、工具卡片） | 无 |
| 模型列表获取 | WS `get_models` → `models` 事件 | HTTP `GET /models` |

### 1.2 问题

- 两套独立代码路径，维护成本翻倍
- 浏览端体验远落后于创作端（无流式、无工具展示）
- 未来新增 AI 能力需要在两端各自实现
- 实际差异仅在于"可读写 vs 只读"，不应产生如此大的架构分叉

### 1.3 目标

**以创作端体验为基准，全栈统一：** 仅通过 `mode: "workbench" | "viewer-readonly"` 一个参数区分行为，其余全部共享。浏览端获得与创作端对等的流式输出、工具调用可视化和模型切换能力，仅在工具权限层面受限于只读。

---

## 2. 方案设计

### 2.1 架构总览

```
创作端 (author-site)                    浏览端 (viewer-site)
mode: "workbench"                       mode: "viewer-readonly"
        │                                       │
        └───────────────┬───────────────────────┘
                        │
              ┌─────────▼─────────┐
              │ @workbench/       │
              │ ai-chat-shared    │  ← 新建共享 UI 包
              │ (React 组件)       │
              └─────────┬─────────┘
              ┌─────────▼─────────┐
              │ @workbench/       │
              │ agent-client      │  ← 改造：新增 mode 参数
              │ (WS + HTTP SDK)   │
              └─────────┬─────────┘
              ┌─────────▼─────────┐
              │ agent-service     │  ← 统一路由，mode 决定工具集
              │ (Fastify)         │
              └───────────────────┘
```

三层改造：

| 层 | 改什么 | 目标 |
|----|--------|------|
| `@workbench/agent-client` | 新增 `mode` 配置参数 + `requestModels()` | 两端统一使用同一种通信方式 |
| `agent-service` | 去掉 `/api/viewer-ai/chat` 专用路由，统一走 `/api/agent/*` | 消除后端路由分叉 |
| `@workbench/ai-chat-shared` | 新建共享 UI 包 | 两端统一 UI 组件 |

### 2.2 `@workbench/agent-client` 改造

当前 `AgentClientConfig` 只有 `baseUrl`/`apiKey`。改造：

```typescript
export interface AgentClientConfig {
  baseUrl: string;
  apiKey?: string;
  mode?: "workbench" | "viewer-readonly"; // 默认 "workbench"
}
```

mode 影响的行为（client 层只透传，不做逻辑分支）：

- `sendMessage()` 请求体自动注入 `mode` 字段
- `stream()` 在 WebSocket URL 上附加 `?mode=` query param（连接级默认值，服务端对 `get_models` 等无消息体字段的指令也能拿到 mode）
- `AgentStream.send()` 的每条消息体带 `mode` 与可选 `viewerContext`（`SendMessageOptions` 扩展）

**同步补齐：** `AgentStream.requestModels(options?)` 方法，封装现有 `get_models` WS 消息（消除 use-chat-models 中 `(stream as any).ws` 的越界访问）。

**不需要改的：** AgentStream 的事件类型（`stream/thought/tool_call/tool_call_update/plan/permission_request/user_choice_request/models`）两端共用；浏览端同样会收到 `tool_call` 和 `thought` 事件，只是工具限定为只读工具。

### 2.3 agent-service 后端统一

#### 2.3.1 路由合并

**移除：** `POST /api/viewer-ai/chat` 及 `registerViewerAiRoutes`（`routes/viewer-ai.ts` 整个文件、`routes/index.ts` 的注册）。

**改造：** `POST /api/agent/:sessionId/message` 的 `SendMessageBody` 与 WS `/api/agent/:sessionId/stream` 的 `ClientMessage` 扩展：

```typescript
{
  mode?: "workbench" | "viewer-readonly";   // 默认 workbench
  viewerContext?: {                          // 仅 viewer-readonly 使用
    activePageId?: string;
    activeConfig?: Record<string, unknown>;
  };
}
```

WS 连接 URL 支持 `?mode=` query 作为连接级默认；单条消息体里的 `mode` 优先。`message` 与 `get_models` 两个分支都按 mode 构建 AgentConfig。

#### 2.3.2 mode → AgentConfig 映射（服务端强制，不信任客户端）

`mode === "viewer-readonly"` 时：

- `workingDir`：**忽略客户端传入**，由 `projectId` 经 `projectWorkspaceManager.getProject()` 解析出 `project.workspacePath`（缺 projectId 即报错）
- `toolMode: "viewer-readonly"`（`createWorkbenchTools` 已支持，只注册 readFile/listFiles/knowledgeReport）
- `toolVersion`：`getViewerReadonlyToolCapabilities().toolVersion`
- `permissions`：沿用现 viewer-ai.ts 的清单——allowedPaths: `workspace-tree.json`、`project.config.schema.json`、`memory.md`、`demos`、`demos/**`、`knowledge`、`knowledge/**`；deniedPatterns: `**/*.env`、`**/*.env.*`、`**/.git`、`**/.git/**`、`**/node_modules`、`**/node_modules/**`、`**/.session.json`、`**/.workspace.json`；`allowedCommands: []`、`deniedCommands: ["*"]`
- systemPrompt：**忽略客户端传入的 `systemPrompt` 字段**，强制 `buildViewerAiSystemPrompt()`
- 上下文：服务端每条消息自动调用 `buildViewerAiPromptContext({ project, activePageId, activeConfig })` 拼接到 content 前（与现有 HTTP 行为一致；`history` 字段不再需要——WS 会话存续期间 Pi Agent 自身保留对话历史）

`mode === "workbench"`（或缺省）保持现有逻辑完全不变。

**安全边界说明：** mode 由客户端声明。现状下 agent-service 的 `/api/agent/*` 本就无鉴权直连（CORS 只约束浏览器），viewer-readonly 是"客户端自愿降权"，统一路由不引入比现状更大的攻击面；正式上线前的服务端鉴权/网关校验是独立课题。

#### 2.3.3 保留与移除

| 项 | 处理 |
|----|------|
| `services/viewer-ai-context.ts`（`buildViewerAiPromptContext` / `buildViewerAiSystemPrompt`） | **原地保留**，调用方从专用路由改为统一路由；`ViewerAiHistoryMessage` 类型与 history 拼接逻辑随 HTTP 模式废弃可删 |
| `getViewerReadonlyToolCapabilities()` | 保留，统一路由使用 |
| `routes/viewer-ai.ts` | 删除 |
| viewer-site 直接调 `GET /models` | 删除，浏览端改用 WS `get_models`（`use-chat-models` Hook 已封装该流程）；`GET /models` 路由本身保留（他处仍可用） |
| `tests/unit/viewer-ai-context.test.ts` | 保留（context 构建逻辑未变） |

### 2.4 `@workbench/ai-chat-shared` 共享 UI 包

#### 2.4.1 包内容（迁移自 author-site）

`packages/author-site/src/components/ai-elements/` 全部 31 个源文件按原目录结构迁移（`__tests__/` 除外），并内聚以下依赖：

```
packages/ai-chat-shared/
├── package.json              # @workbench/ai-chat-shared
├── tsconfig.json
└── src/
    ├── index.ts              # 原 ai-elements/index.ts 导出面 + 配置入口
    ├── config.ts             # configureAiChatShared() 宿主注入点（见 2.4.3）
    ├── lib/
    │   ├── utils.ts          # cn()（自带，不依赖宿主 @/lib/utils）
    │   ├── ai-models.ts      # 整体迁自 author-site/src/lib/ai-models.ts（738 行，含 NEXT_PUBLIC_* 环境变量读取，transpilePackages 下正常内联）
    │   └── active-view-context.ts  # 迁自 author-site/src/lib/agent/active-view-context.ts（纯类型+纯函数）
    ├── ui/                   # 自带 shadcn 原语：button/dialog/collapsible/textarea/badge/avatar/toast-provider（复制自 author-site）
    ├── ai-chat.tsx           # + 31 个组件文件，目录结构保持：
    ├── assistant-message.tsx #   message/conversation/chain-of-thought/reasoning/tool/
    ├── ...                   #   timeline/agent-process-group/user-choice-card/chat-card/
    └── chat/                 #   history-dialog/attachments/prompt-input/permission-dialog/
        ├── chat-messages.tsx #   mutation-status-badge/split-by-fenced-code/split-content-renderer
        ├── chat-input.tsx    #   chat/{chat-messages,chat-input,chat-plan,model-select-with-guard,types}
        ├── ...               #   chat/hooks/{use-chat-stream,use-chat-messages,use-chat-models}
        └── ...               #   chat/services/{stream-service,message-service}
                              #   chat/utils/{chat-stream-utils,chat-file-utils}
```

**不迁移、留在 author-site 的：** `lib/agent/system-prompt.ts`（依赖 `.md` import 与 `@workbench/preview-contract`）→ 经注入接口传入；`ai-elements/__tests__/`（15 个测试文件）→ 留在 author-site jest 体系内，改 import 路径。

#### 2.4.2 组件 mode 适配

`AIChat` 新增 `mode?: "workbench" | "viewer-readonly"` prop（默认 workbench），随 use-chat-stream → StreamService → AgentStream 消息体透传。

**设计原则：** 组件不做 `mode === "workbench" ? <X/> : null` 式条件渲染，依赖后端不发送相应事件自然隐藏（viewer 模式后端不会发 permission_request、不会有文件变更）。仅以下纯前端行为按 mode 分支：

| mode 分支点 | workbench | viewer-readonly |
|------------|-----------|-----------------|
| 输入框附件 | 文件+图片 | 仅图片 |
| 消息持久化（message-service 调 `/api/sessions/*`） | 执行 | 跳过（viewer 无此 API，会话即弃） |
| 创作端上下文构建（workspace-context 拉取 + 静态 systemPrompt） | 执行 | 跳过（服务端注入） |

后端行为差异（自然生效，无需前端分支）：计划面板、权限弹窗、文件变更列表在 viewer 模式不会收到对应事件；模型切换、对话历史（会话内）两端一致。

#### 2.4.3 宿主注入机制

共享包不 import 任何 `@/...` 宿主路径。模块级配置一次注入：

```typescript
// ai-chat-shared/src/config.ts
export interface AiChatSharedConfig {
  getAgentClient: () => AgentClient;          // 必配：stream-service 建连/查询能力用
  authorContext?: {                            // 仅 author-site 配置
    buildStaticSystemPrompt(toolCapabilities?): string;
    fetchContextPrefix(workingDir): Promise<{ l3; memory; knowledgeIndex }>;
  };
}
export function configureAiChatShared(config: AiChatSharedConfig): void;
```

- author-site 在模块初始化处调用，传入 `getAgentClient()`（带 apiKey）与 system-prompt 构建函数
- viewer-site 只传 `getAgentClient()`（mode: viewer-readonly 的实例）
- `authorContext` 未配置时 stream-service 走"无静态 prompt、无 L3 前缀"路径（即 viewer 模式）

### 2.5 viewer-site 改造

#### 2.5.1 新增依赖与构建配置

- `package.json` dependencies：`@workbench/agent-client`、`@workbench/ai-chat-shared`（`workspace:*`）
- `next.config.js` transpilePackages：追加上述两个包
- `tailwind.config.ts` content：追加 `./node_modules/@workbench/ai-chat-shared/src/**/*.{js,ts,jsx,tsx,mdx}`（已有 shared/demo-ui 先例）
- 环境变量：复用 `NEXT_PUBLIC_AGENT_SERVICE_URL`；模型过滤如需与创作端一致可配 `NEXT_PUBLIC_ALLOWED_MODEL_PREFIXES` 等（ai-models.ts 读取）

#### 2.5.2 替换 ViewerAiDrawer

删除 `ViewerAiDrawer.tsx`（771 行），新建薄壳 `ViewerAiPanel.tsx`：抽屉容器 + 头部由 viewer 自持，内容区渲染共享包 `AIChat`：

```tsx
const agentClient = new AgentClient({
  baseUrl: process.env.NEXT_PUBLIC_AGENT_SERVICE_URL || "",
  mode: "viewer-readonly",
});
configureAiChatShared({ getAgentClient: () => agentClient });

// 打开抽屉时生成，关闭即弃
const sessionId = `viewer-${projectId}-${Date.now()}`;

<AIChat
  mode="viewer-readonly"
  sessionId={sessionId}
  agentSessionId={sessionId}
  projectId={projectId}
  viewerContext={{ activePageId, activeConfig }}
/>
```

`ViewerApp.tsx` 现有集成点（`open/projectId/project/activePageId/activeConfig/onOpenChange`）替换为新组件。

#### 2.5.3 会话生命周期

- 打开抽屉时创建 sessionId 并建立 WS
- 关闭抽屉时关闭 WS —— agent-service 在最后一个连接关闭时**已有**自动清理逻辑（销毁 agent、清理临时 workspace、会话元数据）；`destroySession()` 调用作为兜底
- 历史消息仅存组件内存，刷新即丢；不做 localStorage 持久化，不保留旧 `ViewerAiChatHistory` localStorage 数据（未上线，无兼容负担）

#### 2.5.4 删除内容

| 删除项 | 说明 |
|--------|------|
| `packages/viewer-site/src/components/ViewerAiDrawer.tsx` | 完整删除 771 行 |
| `api.ts` 中 `askViewerAi`、`getViewerAiModels` 及 `ViewerAiChatRequest`/`ViewerAiChatResponse`/`ViewerAiHistoryMessage`/`ViewerAiModel` 类型、`AGENT_SERVICE_BASE` 常量 | 替换为 agent-client |

### 2.6 author-site 适配

#### 2.6.1 组件迁移后的引用处理

- `src/components/ai-elements/` 目录删除组件源文件，保留 `index.ts` 作为 re-export（`export * from "@workbench/ai-chat-shared"`），目录内 `__tests__/` 原地保留
- 深路径 import 共 5 个文件 7 处（`edit/page.tsx`、`useVisualEditState.ts`、`useConsoleBuffer.ts(+test)`、`sanitize-hydrated-messages.ts` 及 `edit/page.tsx` 对 `ai-chat`/`stream-service` 的子路径引用）改为从 `@workbench/ai-chat-shared` 导入
- `src/lib/ai-models.ts`、`src/lib/agent/active-view-context.ts` 删除，引用处（`edit/page.tsx`、`app/api/ai/chat/route.ts`、`lib/__tests__/ai-models.test.ts`）改从共享包导入
- `__tests__/` 内 `@/components/ai-elements/...`、`@/lib/agent/active-view-context` 等 import/mock 路径同步更新
- jest 配置：确认 `@workbench/ai-chat-shared` 可被解析与转换（moduleNameMapper 或 transformIgnorePatterns，与现有 `@workbench/agent-client` 的处理方式对齐）

#### 2.6.2 注入与显式 mode

```typescript
// packages/author-site/src/lib/agent-client.ts
clientInstance = new AgentClient({
  baseUrl: getAgentServiceUrl(),
  apiKey: getAgentServiceApiKey(),
  mode: "workbench", // 显式声明
});
```

在 author-site 聊天入口（或 lib 初始化处）调用 `configureAiChatShared({ getAgentClient, authorContext: { buildStaticSystemPrompt, fetchContextPrefix } })`，其中 fetchContextPrefix 封装现有 `/api/agent/workspace-context` 拉取（该函数从 stream-service 中移出到 author-site 侧）。

---

## 3. 数据流

### 3.1 浏览端 AI 对话（新模式）

```
用户点击"AI 问答"
  → viewer-site 创建 AgentClient(mode: "viewer-readonly")
  → 生成 sessionId: "viewer-{projectId}-{timestamp}"
  → 渲染 AIChat(mode: "viewer-readonly", viewerContext)

用户输入问题并发送
  → AIChat → StreamService → AgentStream WS 连接
      ws://agent-service/api/agent/{sessionId}/stream?mode=viewer-readonly
  → WS message 体: { content, mode: "viewer-readonly", projectId,
                     viewerContext: { activePageId, activeConfig }, images? }
  → agent-service 检查 mode === "viewer-readonly"
      → workingDir = projectWorkspaceManager.getProject(projectId).workspacePath
      → toolMode = "viewer-readonly"（tools = readFile/listFiles/knowledgeReport）
      → permissions = 只读白名单 + deniedCommands: ["*"]
      → systemPrompt = buildViewerAiSystemPrompt()（忽略客户端字段）
      → content = buildViewerAiPromptContext(...) + 用户问题
  → Pi Agent 处理，WS 事件流回传:
      thought → 思考过程
      tool_call(readFile) / tool_call_update → 工具卡片
      stream → 流式文本
      finish → 完成
  → AIChat 渲染：消息气泡、思维链、工具调用卡片、流式文本

模型列表/切换
  → AgentStream.requestModels() → models 事件；set_model 消息切换

用户关闭抽屉
  → 关闭 WS → agent-service 自动销毁 agent 并清理（现有行为）
```

### 3.2 创作端 AI 对话（保持不变）

```
用户输入 → AIChat(mode: "workbench") → StreamService（authorContext 注入
静态 systemPrompt + L3 前缀）→ AgentStream → agent-service(toolMode:
"workbench", 27+ tools) → Pi Agent → 完整事件流 → AIChat 渲染
```

---

## 4. 实施任务清单

### Phase 1: agent-client 改造

- [x] `AgentClientConfig.mode` 新增
- [x] `sendMessage()` 请求体携带 `mode`
- [x] `stream()` WebSocket URL 附加 `?mode=` query
- [x] `AgentStream.send()`/`SendMessageOptions` 支持 `mode`、`viewerContext`
- [x] `AgentStream.requestModels()` 封装 `get_models`
- [x] agent-client typecheck 通过

### Phase 2: agent-service 统一

- [x] WS `ClientMessage` 与 HTTP `SendMessageBody` 接收 `mode`/`viewerContext`；WS URL query 连接级 mode
- [x] viewer-readonly 分支：projectId→workingDir 解析、toolMode/permissions/toolVersion、强制 systemPrompt、服务端拼接上下文（`message` 与 `get_models` 分支）
- [x] 删除 `routes/viewer-ai.ts` 与注册
- [x] `viewer-ai-context.ts` 清理 history 相关（HTTP 模式遗留）
- [x] 新增统一路由 viewer-readonly 行为测试
- [x] `pnpm check:agent` 通过

### Phase 3: 共享 UI 包

- [x] 新建 `packages/ai-chat-shared/`（package.json/tsconfig）
- [x] 迁移 31 个组件文件 + 自带 ui 原语 + `lib/utils`/`ai-models`/`active-view-context`
- [x] `config.ts` 注入点：`getAgentClient` + `authorContext`
- [x] stream-service/message-service/use-chat-stream 去除 `@/` 依赖，接入注入与 mode 分支
- [x] `AIChat` 新增 `mode`/`viewerContext` props
- [x] 根 package.json 增加 `check:ai-chat-shared`；typecheck 通过

### Phase 4: viewer-site 改造

- [x] 依赖 + transpilePackages + tailwind content
- [x] `ViewerAiPanel.tsx` 集成 AIChat；`ViewerApp.tsx` 替换
- [x] 删除 `ViewerAiDrawer.tsx` 与 `api.ts` AI 相关代码
- [x] `pnpm check:viewer` + `pnpm build:viewer` 通过

### Phase 5: author-site 适配

- [x] `ai-elements/` 改 re-export，深路径引用与 lib 引用更新（7 处 + ai-models/active-view-context 引用处）
- [x] `getAgentClient()` 显式 `mode: "workbench"`；`configureAiChatShared` 注入
- [x] `__tests__` import/mock 路径更新；jest 解析共享包
- [x] `pnpm check:author` 通过

### Phase 6: 全栈验证

- [x] `pnpm check:all` 除两项既有失败（workspace-authority 门禁、project-cli 测试，均经 HEAD 复跑确认与本改造无关）外全部通过
- [ ] 创作端/浏览端手动或 E2E 回归（服务可用时：`pnpm test:e2e`）——待服务启动后执行
- [x] 确认 agent-service 无 `/api/viewer-ai/chat` 残留引用
- [x] 同步 `docs/项目文档/` 相关模块文档

---

## 5. 风险与待确认

### 5.1 风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| ai-elements 内硬编码 author-site 相对路径 API（`/api/sessions/*` 持久化、`/api/agent/workspace-context`、`/api/agent/:id/rollback`） | viewer 环境下这些请求 404 | 持久化与上下文拉取按 mode/注入跳过；rollback 仅在文件变更 UI 触发，viewer 无文件变更事件，天然不触达 |
| use-chat-stream（1790 行）含大量创作端逻辑（auto-repair、console 转发、诊断事件、代码/схema 回传） | viewer 复用时空转或异常 | 这些均由可选 props/回调驱动，viewer 不传即为 no-op；迁移时逐一核对无硬依赖 |
| author-site 编辑页（核心功能）import 路径大迁移 | 回归风险 | 保留 `ai-elements/index.ts` re-export 壳，深路径引用仅 7 处；check:author + 全量 jest 兜底 |
| viewer-readonly 上下文每条消息重复拼接 | 多轮对话 token 膨胀（上限 12KB/条） | 与现状（HTTP 每次全量重发）一致，不劣化；后续可优化为首条全量+后续增量 |
| viewer-site 对 agent-service 的 CORS/WS 直连 | 部署环境 CORS_ORIGINS 未含 viewer origin 时失败 | 现有 viewer-ai HTTP 已同源直连（说明已配置）；验证清单确认 |

### 5.2 待确认（不阻塞实施的后续项）

- 共享包测试基建：15 个组件测试暂留 author-site jest，后续是否迁至共享包 Vitest（对齐 sketch-react 模式）
- 正式上线前 agent-service 的鉴权/网关层（mode 声明的信任边界收紧）
- viewer 多轮长对话的上下文注入增量化

---

## 6. 文件变更清单

| 操作 | 文件 |
|------|------|
| **修改** | `packages/agent-client/src/client.ts` — mode 参数、URL query、requestModels |
| **修改** | `packages/agent-client/src/types.ts` — SendMessageOptions 扩展 |
| **修改** | `packages/agent-service/src/routes/agent.ts` — SendMessageBody.mode/viewerContext |
| **修改** | `packages/agent-service/src/routes/websocket.ts` — ClientMessage.mode/viewerContext、连接级 query、viewer-readonly 分支 |
| **修改** | `packages/agent-service/src/routes/index.ts` — 移除 viewer-ai 注册 |
| **删除** | `packages/agent-service/src/routes/viewer-ai.ts` |
| **修改** | `packages/agent-service/src/services/viewer-ai-context.ts` — 原地保留，清理 history 遗留 |
| **新建** | `packages/ai-chat-shared/` — 完整新包（31 组件 + ui 原语 + lib） |
| **删除** | `packages/author-site/src/components/ai-elements/*` 组件源文件（保留 index.ts re-export 与 `__tests__/`） |
| **删除** | `packages/author-site/src/lib/ai-models.ts`、`src/lib/agent/active-view-context.ts`（迁入共享包） |
| **修改** | `packages/author-site/src/lib/agent-client.ts` — 显式 mode + configureAiChatShared |
| **修改** | author-site 深路径引用 5 文件、`app/api/ai/chat/route.ts`、相关测试 import |
| **修改** | `packages/author-site/package.json`、`next.config.js`、jest 配置 — 新依赖与转换 |
| **修改** | `packages/viewer-site/package.json`、`next.config.js`、`tailwind.config.ts` — 新依赖与扫描 |
| **删除** | `packages/viewer-site/src/components/ViewerAiDrawer.tsx` |
| **新建** | `packages/viewer-site/src/components/ViewerAiPanel.tsx` — AIChat 薄壳 |
| **修改** | `packages/viewer-site/src/components/ViewerApp.tsx` — 集成替换 |
| **修改** | `packages/viewer-site/src/lib/api.ts` — 移除 AI 相关代码 |
| **修改** | 根 `package.json` — check:ai-chat-shared 脚本；`pnpm-lock.yaml` |
