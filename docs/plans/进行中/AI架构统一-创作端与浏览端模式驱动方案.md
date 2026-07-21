# AI 架构统一 — 创作端与浏览端模式驱动方案

## 当前状态

方案设计完成，待评审后实施。

## 当前结论

通过 `mode` 参数驱动实现三层统一（通信层、后端层、UI 层），消除创作端和浏览端 AI 功能的两套独立代码路径。

**核心原则：以创作端体验为基准，浏览端向创作端靠齐。** 当前创作端拥有更优的流式通信、完整的工具调用可视化和一致的交互体验，改造方向是在保持架构统一的前提下，让浏览端获得与之对等的能力（仅通过 mode 限制读写权限，不降低体验质量）。

---

## 1. 背景与动机

### 1.1 现状

创作端（author-site）和浏览端（viewer-site）都有 AI 对话功能，但实现方式完全不同：

| 维度 | 创作端 | 浏览端 |
|------|--------|--------|
| 通信方式 | WebSocket 流式 + HTTP fallback | HTTP POST 同步 |
| UI 组件 | 43 个组件（`ai-elements/`） | 1 个组件（`ViewerAiDrawer.tsx`） |
| Client SDK | `@workbench/agent-client` | 裸 `fetch` |
| 后端路由 | `/api/agent/:sessionId/*` | `/api/viewer-ai/chat` |
| 工具集 | 27+ 工具 | 3 个只读工具 |
| 会话管理 | 服务端持久化 | 每次临时 sessionId |
| 流式输出 | 支持 | 不支持 |
| 工具调用可视化 | 完整（思维链、计划面板、工具卡片） | 无 |

### 1.2 问题

- 两套独立代码路径，维护成本翻倍
- 浏览端体验远落后于创作端（无流式、无工具展示、无模型切换）
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
| `@workbench/agent-client` | 新增 `mode` 配置参数 | 两端统一使用同一种通信方式 |
| `agent-service` | 去掉 `/api/viewer-ai/chat` 专用路由，统一走 `/api/agent/*` | 消除后端路由分叉 |
| `@workbench/ai-chat-shared` | 新建共享 UI 包 | 两端统一 UI 组件 |

### 2.2 `@workbench/agent-client` 改造

当前 `AgentClient` 和 `AgentStream` 没有 mode 概念。改造目标：

```typescript
// AgentClientConfig 扩展
export interface AgentClientConfig {
  baseUrl: string;
  apiKey?: string;
  mode?: "workbench" | "viewer-readonly"; // 默认 "workbench"
}

// AgentClient 构造函数透传 mode
constructor(config: AgentClientConfig) {
  this.baseUrl = config.baseUrl.replace(/\/+$/, "");
  this.apiKey = config.apiKey;
  this.mode = config.mode ?? "workbench";
}

// mode 影响行为：
// - sendMessage 时自动注入 mode 字段到请求体
// - stream() 时在 WebSocket URL 上附加 mode query param
// - AgentStream 根据 mode 过滤不应出现的事件日志级别
```

**不需要改的：**
- AgentStream 的事件类型（`stream/thought/tool_call/tool_call_update/plan/permission_request/user_choice_request`）两端共用
- AgentClient 的 API 方法签名不变

**关键点：** mode 只影响后端行为，client 层只是透传。浏览端同样会收到 `tool_call` 和 `thought` 事件，只是工具内容限定为只读工具。

### 2.3 agent-service 后端统一

#### 2.3.1 路由合并

**移除：** `POST /api/viewer-ai/chat` 及 `registerViewerAiRoutes` 整个函数。

**改造：** 现有的 `POST /api/agent/:sessionId/message` 和 WebSocket `/api/agent/:sessionId/stream` 接收 `mode` 参数：

```typescript
// POST /api/agent/:sessionId/message 请求体扩展
interface SendMessageBody {
  content: string;
  mode?: "workbench" | "viewer-readonly";
  demoId?: string;
  workingDir?: string;
  model?: string;
  images?: ImageAttachment[];
  // ... 现有字段不变
}
```

#### 2.3.2 mode → AgentConfig 映射

在 agent 创建/配置时根据 mode 分发：

```typescript
function buildAgentConfig(mode: "workbench" | "viewer-readonly"): Partial<AgentConfig> {
  if (mode === "viewer-readonly") {
    return {
      toolMode: "viewer-readonly",
      permissions: {
        allowedPaths: ["workspace-tree.json", "project.config.schema.json", "memory.md", "demos/**", "knowledge/**"],
        deniedPatterns: ["**/*.env", "**/.git/**", "**/node_modules/**", "**/.session.json", "**/.workspace.json"],
        allowedCommands: [],
        deniedCommands: ["*"],
      },
    };
  }
  // workbench 模式保持现有逻辑
  return {
    toolMode: "workbench",
    // 现有权限配置不变
  };
}
```

#### 2.3.3 System Prompt 选择

根据 mode 选择不同的 prompt 构建策略：

| mode | system prompt 构建 | 上下文构建 |
|------|-------------------|-----------|
| `workbench` | 创作端多层体系（L2 静态 + L3 动态工作空间 + L4 用户约束 + L5 能力约束） | 工作空间扫描 + 活跃视图 |
| `viewer-readonly` | `buildViewerAiSystemPrompt()`（现有函数保留，只是调用入口从专用路由改为通用路由） | `buildViewerAiPromptContext()`（现有函数保留） |

#### 2.3.4 移除内容

| 移除项 | 说明 |
|--------|------|
| `registerViewerAiRoutes` | 整个函数及 `viewer-ai.ts` 路由文件 |
| `POST /api/viewer-ai/chat` 路由 | 统一到 `/api/agent/:sessionId/message` |
| viewer-site 直接调用 `/models` 获取模型列表 | 浏览端通过 agent-client 的 `AgentStream.getModels` 事件或 `AgentClient.getModelInfo` 获取 |

#### 2.3.5 保留内容

| 保留项 | 说明 |
|--------|------|
| `buildViewerAiPromptContext()` | viewer-readonly 的上下文构建逻辑，移动到通用 prompt 构建模块 |
| `buildViewerAiSystemPrompt()` | viewer-readonly 的系统提示词 |
| `getViewerReadonlyToolCapabilities()` | 只读工具集能力声明，由 toolMode 参数触发 |
| `createWorkbenchTools(..., { mode: "viewer-readonly" })` | 工具集按 mode 分支，已存在 |

### 2.4 `@workbench/ai-chat-shared` 共享 UI 包

#### 2.4.1 包结构

```
packages/ai-chat-shared/
├── package.json              # @workbench/ai-chat-shared
├── tsconfig.json
├── src/
│   ├── index.ts              # 统一导出
│   ├── ai-chat.tsx            # AIChat 主组件（从 author-site 迁移）
│   ├── assistant-message.tsx   # AI 助手消息气泡
│   ├── message.tsx            # 通用消息
│   ├── conversation.tsx       # 对话容器
│   ├── chain-of-thought.tsx   # 思维链展示
│   ├── reasoning.tsx          # 推理过程折叠
│   ├── tool.tsx               # 工具调用卡片
│   ├── timeline.tsx           # 执行时间线
│   ├── agent-process-group.tsx # 执行阶段组
│   ├── user-choice-card.tsx   # 用户选择题卡片
│   ├── chat-card.tsx          # 对话历史卡片
│   ├── history-dialog.tsx     # 对话历史管理
│   ├── attachments.tsx        # 附件预览
│   ├── prompt-input.tsx       # 通用输入框
│   ├── chat/
│   │   ├── chat-messages.tsx   # 消息列表
│   │   ├── chat-input.tsx     # 输入框
│   │   ├── chat-plan.tsx      # 计划面板
│   │   ├── hooks/
│   │   │   ├── use-chat-stream.ts    # WebSocket 流式 Hook
│   │   │   ├── use-chat-messages.ts  # 消息状态管理
│   │   │   └── use-chat-models.ts    # 模型选择
│   │   ├── services/
│   │   │   ├── stream-service.ts     # StreamService 类
│   │   │   └── message-service.ts    # 消息持久化
│   │   └── utils/
│   │       ├── chat-stream-utils.ts  # 流式消息工具
│   │       └── chat-file-utils.ts    # 文件变更工具
│   └── permission-dialog.tsx # 权限确认弹窗
```

**迁移策略：**

1. 从 `packages/author-site/src/components/ai-elements/` 完整复制组件到新包
2. 将 author-site 特定的依赖（如 `@/lib/agent/system-prompt`）参数化，通过 props 或 context 注入
3. author-site 和 viewer-site 从 `@workbench/ai-chat-shared` 导入组件，删除原 `ai-elements/` 目录或改为 re-export

#### 2.4.2 组件 mode 适配

共享组件接收 `mode` prop 控制行为差异：

```typescript
interface AIChatProps {
  mode: "workbench" | "viewer-readonly";
  agentClient: AgentClient;
  sessionId: string;
  // ... 通用 props
}
```

**mode 控制的 UI 差异：**

| UI 元素 | workbench | viewer-readonly |
|---------|-----------|-----------------|
| 计划面板（PlanPanel） | 显示 | 显示（只读工具也会有简单计划） |
| 权限确认弹窗 | 显示 | 永远不会触发（后端不发出该事件，组件保持可渲染即可） |
| 工具调用详情 | 显示全部工具 | 显示（仅 readFile/listFiles/knowledgeReport） |
| 文件变更列表 | 显示 | 不会出现 |
| 输入框附件 | 支持文件+图片 | 仅支持图片 |
| 模型切换 | 支持 | 支持 |
| 对话历史管理 | 支持 | 支持（标签页生命周期） |

**设计原则：** 组件不根据 mode 做条件渲染（`mode === "workbench" ? <PlanPanel /> : null`），而是依赖后端不发送相应事件来自然隐藏。只有输入框附件这种纯粹前端行为才需要 mode 判断。

#### 2.4.3 Context 注入机制

author-site 和 viewer-site 的 system prompt 构建逻辑完全不同，通过 `AiContextProvider` 注入：

```typescript
// ai-chat-shared 定义接口
interface AiContextProvider {
  getSystemPrompt(): Promise<string>;
  getDynamicContext(): Promise<string>;
}

// author-site 实现
const authorContextProvider: AiContextProvider = {
  getSystemPrompt: () => buildStaticSystemPrompt(),
  getDynamicContext: () => buildDynamicContextPrefix(workingDir),
};

// viewer-site 实现
const viewerContextProvider: AiContextProvider = {
  getSystemPrompt: () => fetchSimpleSystemPrompt(),  // 调用 agent-service 获取
  getDynamicContext: () => fetchViewerContext(projectId, activePageId),
};
```

### 2.5 viewer-site 改造

#### 2.5.1 新增依赖

```json
{
  "dependencies": {
    "@workbench/agent-client": "workspace:*",
    "@workbench/ai-chat-shared": "workspace:*"
  }
}
```

#### 2.5.2 替换 ViewerAiDrawer

当前 `ViewerAiDrawer.tsx`（771 行自包含组件）替换为使用 `@workbench/ai-chat-shared` 的 `AIChat` 组件。

`ViewerApp.tsx` 中 AI 抽屉的引用改为：

```tsx
import { AIChat } from "@workbench/ai-chat-shared";
import { AgentClient } from "@workbench/agent-client";

const agentClient = new AgentClient({
  baseUrl: process.env.NEXT_PUBLIC_AGENT_SERVICE_URL || "",
  mode: "viewer-readonly",
});

// 在触发 AI 时创建 sessionId
const sessionId = `viewer-${projectId}-${Date.now()}`;

<AIChat
  mode="viewer-readonly"
  agentClient={agentClient}
  sessionId={sessionId}
  projectId={projectId}
  contextProvider={viewerContextProvider}
/>
```

#### 2.5.3 会话生命周期

- 打开抽屉时创建 sessionId
- 关闭抽屉时销毁 session（调用 `agentClient.destroySession(sessionId)`）
- 历史消息通过 `use-chat-messages` Hook 缓存在内存中，标签页刷新即丢失
- 不需要 localStorage 持久化

#### 2.5.4 删除内容

| 删除项 | 说明 |
|--------|------|
| `packages/viewer-site/src/components/ViewerAiDrawer.tsx` | 完整删除 771 行 |
| `packages/viewer-site/src/lib/api.ts` 中的 `askViewerAi`、`getViewerAiModels` 及 `ViewerAiChatRequest`/`ViewerAiChatResponse`/`ViewerAiHistoryMessage`/`ViewerAiModel` 类型 | 替换为 agent-client |
| `packages/viewer-site/src/lib/api.ts` 中的 `AGENT_SERVICE_BASE` 常量 | 替换为 agent-client 的 baseUrl |

### 2.6 author-site 适配

#### 2.6.1 组件迁移

`packages/author-site/src/components/ai-elements/` 中的组件迁移到 `@workbench/ai-chat-shared` 后：

1. author-site 从 `@workbench/ai-chat-shared` 重新导入
2. `ai-elements/` 目录改为 re-export：
   ```typescript
   // packages/author-site/src/components/ai-elements/index.ts
   export * from "@workbench/ai-chat-shared";
   ```
   或直接删除目录、更新所有 import 路径。

#### 2.6.2 agent-client 适配

给 `getAgentClient()` 传入 `mode: "workbench"`：

```typescript
// packages/author-site/src/lib/agent-client.ts
clientInstance = new AgentClient({
  baseUrl: getAgentServiceUrl(),
  apiKey: getAgentServiceApiKey(),
  mode: "workbench", // 显式声明
});
```

---

## 3. 数据流

### 3.1 浏览端 AI 对话（新模式）

```
用户点击"AI 问答"
  → viewer-site 创建 AgentClient(mode: "viewer-readonly")
  → 生成 sessionId: "viewer-{projectId}-{timestamp}"
  → 渲染 AIChat(mode: "viewer-readonly")

用户输入问题并发送
  → AIChat → StreamService → AgentStream WS 连接
      ws://agent-service/api/agent/{sessionId}/stream?mode=viewer-readonly
  → agent-service 检查 mode === "viewer-readonly"
      → toolMode = "viewer-readonly"
      → tools = [readFile, listFiles, knowledgeReport]
      → permissions = { deniedCommands: ["*"], allowedPaths: [...] }
      → systemPrompt = buildViewerAiSystemPrompt()
  → Pi Agent 开始处理
      → WebSocket 事件流回传:
          thought → 思考过程
          tool_call(readFile) → 读取文件
          tool_result → 读取结果
          stream → 流式文本输出
  → AIChat 组件渲染：消息气泡、思维链、工具调用卡片、流式文本

用户关闭抽屉
  → destroySession(sessionId)
  → agent-service 清理会话资源
```

### 3.2 创作端 AI 对话（保持不变）

```
用户输入 → AIChat(mode: "workbench") → AgentStream → 
agent-service(toolMode: "workbench", 27 tools) → 
Pi Agent → 完整事件流 → AIChat 渲染
```

---

## 4. 实施任务清单

### Phase 1: agent-client 改造

- [ ] `agent-client` 新增 `mode` 配置参数（`AgentClientConfig.mode`）
- [ ] `AgentClient.sendMessage()` 请求体中携带 `mode`
- [ ] `AgentClient.stream()` WebSocket URL 附加 `mode` query param
- [ ] TypeScript 类型更新
- [ ] agent-client typecheck 通过

### Phase 2: agent-service 统一

- [ ] `POST /api/agent/:sessionId/message` 路由接收 `mode` 参数
- [ ] WebSocket `/api/agent/:sessionId/stream` 连接接收 `mode` 参数
- [ ] 根据 mode 构建 AgentConfig（toolMode、permissions、prompt context）
- [ ] viewer-readonly 的 context 构建逻辑移到通用 prompt 模块
- [ ] 删除 `registerViewerAiRoutes` 和 `viewer-ai.ts`
- [ ] 删除 `POST /api/viewer-ai/chat` 路由
- [ ] agent-service 所有测试通过
- [ ] agent-service typecheck 通过

### Phase 3: 共享 UI 包

- [ ] 新建 `packages/ai-chat-shared/` 包（`@workbench/ai-chat-shared`）
- [ ] 从 author-site `ai-elements/` 迁移核心组件到新包
- [ ] 参数化 author-site 特定依赖（system prompt 构建、context provider）
- [ ] 定义 `AiContextProvider` 接口
- [ ] 新增 `AIChat.mode` prop
- [ ] ai-chat-shared typecheck 通过

### Phase 4: viewer-site 改造

- [ ] 添加 `@workbench/agent-client` 和 `@workbench/ai-chat-shared` 依赖
- [ ] 实现 viewer-site 的 `AiContextProvider`
- [ ] 删除 `ViewerAiDrawer.tsx`
- [ ] 删除 `api.ts` 中 AI 相关函数和类型
- [ ] `ViewerApp.tsx` 集成 `AIChat` 组件
- [ ] viewer-site typecheck + build 通过

### Phase 5: author-site 适配

- [ ] 删除 `packages/author-site/src/components/ai-elements/` 目录
- [ ] 更新所有 import 指向 `@workbench/ai-chat-shared`
- [ ] `getAgentClient()` 显式传入 `mode: "workbench"`
- [ ] 实现 author-site 的 `AiContextProvider`
- [ ] author-site typecheck + test 通过

### Phase 6: 全栈验证

- [ ] 创作端全流程回归（打开项目 → AI 对话 → 文件修改 → 权限确认 → 预览）
- [ ] 浏览端全流程验证（浏览项目 → AI 问答 → 流式输出 → 工具调用展示 → 关闭抽屉清理）
- [ ] `pnpm check:all` 全仓通过
- [ ] `pnpm test:e2e` 回归通过
- [ ] 确认 agent-service 日志中无 `/api/viewer-ai/chat` 残留调用

---

## 5. 风险与待确认

### 5.1 风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| ai-elements 组件迁移到新包时发现隐含的 author-site 依赖 | 迁移工作量大 | 先做依赖分析，对耦合紧密的组件优先重构接口 |
| viewer-readonly context 构建依赖 projectWorkspaceManager 的文件读取 | 合并路由后需确保 workspaces 仍可访问 | 在通用路由中保留 projectId → workingDir 映射 |
| 共享 UI 包的 message-service 基于 localStorage 实现 | viewer-site 不需要持久化 | 通过 props 注入持久化策略或默认不持久化 |

### 5.2 待确认

- `@workbench/ai-chat-shared` 是否需要依赖 `@workbench/shared`（类型复用）
- viewer-site 的 AgentStream 连接是否需要与 author-site 不同的心跳/超时配置
- 是否需要保留 `ViewerAiChatHistory` localStorage 兼容（平滑过渡）

---

## 6. 文件变更清单

| 操作 | 文件 |
|------|------|
| **修改** | `packages/agent-client/src/client.ts` — 新增 mode 参数 |
| **修改** | `packages/agent-client/src/types.ts` — 类型扩展 |
| **修改** | `packages/agent-client/package.json` — 版本号 bump |
| **修改** | `packages/agent-service/src/routes/agent.ts` — 接收 mode 参数 |
| **修改** | `packages/agent-service/src/routes/websocket.ts` — 接收 mode 参数 |
| **修改** | `packages/agent-service/src/routes/index.ts` — 移除 viewer-ai 路由注册 |
| **删除** | `packages/agent-service/src/routes/viewer-ai.ts` |
| **移动** | `packages/agent-service/src/services/viewer-ai-context.ts` → promopt 模块内（保留逻辑） |
| **新建** | `packages/ai-chat-shared/` — 完整新包 |
| **修改** | `packages/author-site/src/lib/agent-client.ts` — 显式 mode |
| **删除** | `packages/author-site/src/components/ai-elements/` — 迁移到共享包 |
| **修改** | `packages/author-site/package.json` — 新增依赖 |
| **修改** | `packages/viewer-site/package.json` — 新增依赖 |
| **删除** | `packages/viewer-site/src/components/ViewerAiDrawer.tsx` |
| **修改** | `packages/viewer-site/src/components/ViewerApp.tsx` — 集成 AIChat |
| **修改** | `packages/viewer-site/src/lib/api.ts` — 移除 AI 相关代码 |
| **修改** | `pnpm-lock.yaml` — 锁文件更新 |
