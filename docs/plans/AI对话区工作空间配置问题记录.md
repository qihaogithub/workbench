# AI 对话区工作空间配置问题记录

**创建日期**: 2026-04-06  
**问题状态**: 未解决（已进行初步修复但未生效）  
**影响范围**: Demo 编辑页 AI 对话区

---

## 问题描述

在 Demo 编辑页面的 AI 对话区中，询问 AI "你能读取哪些文件？"或"你的工作空间在哪里？"时，AI 回答其工作空间是：

```
E:\重要文件\Programming\1_Work\opencode工作台
```

这是项目的根目录，而不是预期的**临时工作空间**（session 目录）。

### 预期行为

AI 的工作空间应该是创建 Session 时生成的临时目录，即：

```
{sessionsDir}/{projectId}/{sessionId}/
```

该目录包含：
- `index.tsx` - React 组件代码
- `config.schema.json` - Demo 配置 Schema
- `.opencode/agents/demo-generator.md` - AI Agent 行为规则
- `.session.json` - Session 元数据

AI 应该只能看到和操作这两个文件（`index.tsx` 和 `config.schema.json`）。

---

## 问题分析

### 数据流链路

```
Demo 编辑页面 (page.tsx)
  ↓ workingDir prop
AIChat 组件 (ai-chat.tsx)
  ↓ stream.send(message, id, { workingDir })
AgentStream (agent-client/src/client.ts)
  ↓ WebSocket 消息
Agent Service WebSocket 路由 (websocket.ts)
  ↓ AgentConfig.workingDir
Agent 实例 (agent-manager)
  ↓ ACP session/new { cwd: ... }
Agent CLI (opencode/claude/codex)
```

### 已发现的三个断点

#### 断点 1: Demo 编辑页面未传递 tempWorkspace

**文件**: `packages/web/src/app/demo/[id]/edit/page.tsx`

**问题**: `workingDir` 参数硬编码为 `undefined`

**已修复**:
- 在 `CreateSessionResult` 接口添加 `tempWorkspace: string` 字段
- `createEditSession` 函数返回 `sessionPath` 作为 `tempWorkspace`
- 页面组件添加 `tempWorkspace` 状态并从 API 响应中获取
- 将 `workingDir={tempWorkspace || undefined}` 传递给 `AIChat` 组件

#### 断点 2: WebSocket 路由硬编码使用 process.cwd()

**文件**: `packages/agent-service/src/routes/websocket.ts`

**问题**: 在处理 WebSocket 消息时，Agent 配置的 `workingDir` 硬编码为：

```typescript
const config: AgentConfig = {
  sessionId,
  backend: 'opencode',
  workingDir: process.cwd(),  // ← 问题所在
};
```

这导致即使前端传递了 `workingDir`，WebSocket 路由也会忽略它并使用当前工作目录（项目根目录）。

**已修复**:
- 在 `ClientMessage` 接口添加 `workingDir?: string` 字段
- 修改 `message` 和 `resume` 处理器，使用 `message.workingDir`

#### 断点 3: AgentStream.send 方法未传递 workingDir

**文件**: `packages/agent-client/src/client.ts`

**问题**: `AgentStream.send()` 方法在构建 WebSocket 消息时没有包含 `workingDir` 参数

**已修复**:
- 在 `SendMessageOptions` 接口添加 `workingDir?: string`
- 修改 `send()` 方法，在消息体中包含 `workingDir: options?.workingDir`
- 修改 `AIChat` 组件的 `stream.send()` 调用，传递 `workingDir` 参数

---

## 当前状态

### 已完成的代码修改

| 文件 | 修改内容 | 状态 |
|------|---------|------|
| `packages/web/src/lib/session-manager.ts` | 添加 `tempWorkspace` 字段 | ✅ 已修改 |
| `packages/web/src/app/demo/[id]/edit/page.tsx` | 获取并传递 `tempWorkspace` | ✅ 已修改 |
| `packages/web/src/components/ai-elements/ai-chat.tsx` | 在 `stream.send` 和 `sendMessage` 中传递 `workingDir` | ✅ 已修改 |
| `packages/agent-service/src/routes/websocket.ts` | 支持 `workingDir` 参数 | ✅ 已修改 |
| `packages/agent-client/src/types.ts` | `SendMessageOptions` 添加 `workingDir` | ✅ 已修改 |
| `packages/agent-client/src/client.ts` | `send()` 方法传递 `workingDir` | ✅ 已修改 |

### 类型检查

✅ TypeScript 类型检查通过（`pnpm typecheck` 成功）

### 构建状态

✅ `agent-client` 包已重新构建（`pnpm build` 成功）

---

## 问题现状

**尽管已修复所有已知断点，用户反馈问题依然存在。** AI 仍然报告工作空间为项目根目录。

---

## 可能的原因分析

### 1. 服务未重启

修改后可能没有完全重启开发服务器，导致旧代码仍在运行。

**验证方法**: 确认 `pnpm dev` 已重启，并检查 agent-service 进程是否使用了新代码。

### 2. 前端缓存

浏览器或 Next.js 可能缓存了旧的 JavaScript 包。

**验证方法**: 
- 硬刷新浏览器（Ctrl+Shift+R）
- 清除 `.next` 缓存：`rm -rf packages/web/.next`

### 3. agent-client 包未正确链接

pnpm workspace 可能没有正确链接更新后的 `agent-client` 包。

**验证方法**:
```bash
# 检查 dist 目录是否包含更新
cat packages/agent-client/dist/types.d.ts | grep workingDir

# 检查 web 包是否使用最新的 agent-client
ls -la packages/web/node_modules/@opencode-workbench/agent-client
```

### 4. workingDir 传递链路中仍有遗漏

可能存在其他代码路径没有正确处理 `workingDir`：

- **HTTP 降级路径**: AIChat 组件在 WebSocket 失败时会降级到 HTTP `sendMessage`，需要检查该路径是否正确传递 `workingDir`
- **Agent Service HTTP 路由**: `packages/agent-service/src/routes/agent.ts` 中的 HTTP 消息处理路径
- **Agent Manager**: `getOrCreate` 方法是否正确处理和传递 `workingDir`

### 5. ACP 协议层问题

即使 `AgentConfig.workingDir` 正确设置，ACP 连接实现可能没有正确将其传递给 CLI：

- **文件**: `packages/agent-service/src/acp/connection.ts`
- **方法**: `createSession()` 中的 `cwd` 参数

### 6. Opencode CLI 行为

如果使用的是 `opencode` 后端，它可能有自己的工作目录逻辑，忽略了 ACP 协议传递的 `cwd` 参数。

---

## 下一步排查计划

### Step 1: 确认服务已重启并使用新代码

1. 完全停止开发服务器
2. 清理缓存：
   ```bash
   rm -rf packages/web/.next
   pnpm --filter @opencode-workbench/agent-client build
   ```
3. 重新启动：`pnpm dev`
4. 测试前检查浏览器开发者工具 Network 面板，确认加载了最新的 JS 文件

### Step 2: 添加调试日志

在关键路径添加日志，追踪 `workingDir` 的传递情况：

**AIChat 组件** (`ai-chat.tsx`):
```typescript
console.log('[AIChat] Sending message with workingDir:', workingDir)
```

**WebSocket 路由** (`websocket.ts`):
```typescript
logger.info({ workingDir: message.workingDir }, 'WebSocket message received')
logger.info({ workingDir: config.workingDir }, 'Agent config created')
```

**Agent Manager** (`agent-manager.ts`):
```typescript
logger.info({ workingDir: config.workingDir }, 'Agent getOrCreate')
```

**ACP Connection** (`connection.ts`):
```typescript
logger.info({ cwd: this.workingDir }, 'Creating ACP session')
```

### Step 3: 使用浏览器和服务器日志追踪完整链路

1. 打开浏览器开发者工具 → Network → WS（WebSocket）
2. 发送一条消息给 AI
3. 检查 WebSocket 帧中是否包含 `workingDir`
4. 检查 agent-service 日志中的 `workingDir` 值
5. 询问 AI "你的工作空间在哪里？" 并观察日志

### Step 4: 检查 ACP 协议实现

如果 `workingDir` 正确传递到 Agent Service，但未传递给 CLI：

1. 检查 `connection.ts` 中 `createSession()` 方法的 `cwd` 参数
2. 检查 CLI 子进程启动时的环境变量和工作目录
3. 考虑是否需要在 spawn 时设置 `cwd` 选项

### Step 5: 验证临时工作空间内容

如果工作空间路径正确，但 AI 仍然看不到正确的文件：

1. 检查 session 目录是否包含 `index.tsx` 和 `config.schema.json`
2. 检查 `.opencode/agents/demo-generator.md` 是否正确注入
3. 验证 AI 是否能列出工作空间中的文件

---

## 相关文件清单

### Web 前端
- `packages/web/src/app/demo/[id]/edit/page.tsx` - Demo 编辑页面
- `packages/web/src/components/ai-elements/ai-chat.tsx` - AI 聊天组件
- `packages/web/src/lib/session-manager.ts` - Session 管理
- `packages/web/src/lib/agent-client.ts` - Agent 客户端封装

### Agent Client SDK
- `packages/agent-client/src/client.ts` - AgentClient 和 AgentStream 类
- `packages/agent-client/src/types.ts` - 类型定义

### Agent Service
- `packages/agent-service/src/routes/websocket.ts` - WebSocket 路由
- `packages/agent-service/src/routes/agent.ts` - HTTP 路由
- `packages/agent-service/src/core/agent-manager.ts` - Agent 管理器
- `packages/agent-service/src/core/backend-agent.ts` - Agent 基类
- `packages/agent-service/src/acp/connection.ts` - ACP 协议连接
- `packages/agent-service/src/workspace/workspace-manager.ts` - 工作空间管理

---

## 备注

- 所有代码修改已完成并通过类型检查，但问题仍未解决
- 需要通过调试日志和运行时日志进一步追踪问题
- 建议在下次排查时从 **Step 2: 添加调试日志** 开始
