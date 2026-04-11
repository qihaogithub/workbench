# 多 Agent 后端支持方案

> **文档状态**：方案设计  
> **创建日期**：2026-04-08  
> **适用范围**：packages/web、packages/agent-service

---

## 1. 背景与目标

### 1.1 现状

当前 Web 工作台在与 Agent Service 通信时，**硬编码使用 `opencode` 作为默认 Agent 后端**。用户无法选择或切换不同的 AI Agent（如 Claude、Codex、Gemini、Qwen 等）。

### 1.2 目标

实现**多 Agent 后端支持**，允许用户/开发者在代码层面配置使用哪个 Agent 后端，包括：

- 通过环境变量配置默认 Agent
- API 路由支持在请求中指定 Agent 类型
- 前端组件可传递 Agent 类型参数
- 保持向后兼容（默认仍使用 `opencode`）

### 1.3 支持的 Agent 后端列表

| Backend | CLI 命令 | ACP 参数 | 状态 |
|---------|----------|----------|------|
| `opencode` | `opencode` | `['acp']` | ✅ 默认 |
| `claude` | `claude` | `['--experimental-acp']` | ✅ 已注册 |
| `codex` | `codex` | `[]` | ✅ 已注册 |
| `gemini` | `gemini` | `['--experimental-acp']` | ✅ 已注册 |
| `qwen` | `qwen` | `['--acp']` | ✅ 已注册 |
| `goose` | `goose` | `['acp']` | ✅ 已注册 |
| `auggie` | `auggie` | `['--acp']` | ✅ 已注册 |
| `kimi` | `kimi` | `['--acp']` | ✅ 已注册 |
| `copilot` | `copilot` | `['--acp']` | ✅ 已注册 |
| `qoder` | `qoder` | `['--acp']` | ✅ 已注册 |
| `vibe` | `vibe` | `['--acp']` | ✅ 已注册 |
| `custom` | 自定义 | 自定义 | ✅ 已注册 |

> **注意**：实际可用的 Agent 取决于系统中是否已安装对应的 CLI 工具。

---

## 2. 架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                        Web 前端层                            │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ AIChat   │  │ DemoEditPage │  │ 其他使用 Agent 的组件 │  │
│  │ Component│  │   Component  │  │                      │  │
│  └────┬─────┘  └──────┬───────┘  └──────────┬───────────┘  │
│       │               │                      │              │
│       └───────────────┴──────────────────────┘              │
│                           │                                 │
│                  ┌────────▼────────┐                        │
│                  │  API Routes     │                        │
│                  │  /api/ai/chat   │                        │
│                  │  /api/sessions  │                        │
│                  └────────┬────────┘                        │
│                           │                                 │
│                  ┌────────▼────────┐                        │
│                  │  Agent Client   │                        │
│                  │  (SDK 封装)     │                        │
│                  └────────┬────────┘                        │
└───────────────────────────┼─────────────────────────────────┘
                            │ HTTP / WebSocket
┌───────────────────────────▼─────────────────────────────────┐
│                    Agent Service 层                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Fastify HTTP Server                      │  │
│  │         POST /api/agent/:sessionId/message            │  │
│  └──────────────────────┬───────────────────────────────┘  │
│                           │                                 │
│                  ┌────────▼────────┐                        │
│                  │  AgentManager   │                        │
│                  │  getOrCreate()  │                        │
│                  └────────┬────────┘                        │
│                           │                                 │
│                  ┌────────▼────────┐                        │
│                  │  AgentFactory   │                        │
│                  │  create(config) │                        │
│                  └────────┬────────┘                        │
│                           │                                 │
│          ┌────────────────┼────────────────┐               │
│          ▼                ▼                ▼               │
│   ┌─────────────┐ ┌─────────────┐ ┌─────────────┐        │
│   │ OpenCode    │ │  Claude     │ │   Codex     │  ...   │
│   │ Backend     │ │  Backend    │ │  Backend    │        │
│   └─────────────┘ └─────────────┘ └─────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Agent 类型传递路径

```
用户配置/请求
    │
    ├─ 环境变量 AGENT_BACKEND（全局默认）
    │
    ├─ API 请求体 backend 字段（单次请求）
    │
    └─ 前端组件 props backend（组件级）
         │
         ▼
    Web API Route
         │
         ▼
    AgentClient.sendMessage(options.backend)
         │
         ▼
    Agent Service POST /api/agent/:sessionId/message
         │
         ▼
    AgentConfig.backend → AgentFactory → 具体 Backend 实现
```

### 2.3 关键约束

**Agent 类型在 Session 首次创建时固定，后续消息无法更改。**

原因：
- `AgentManager.getOrCreate()` 会缓存已创建的 Agent 实例
- 同一 `sessionId` 的后续消息会复用已有实例，忽略新的 `backend` 参数
- 这是设计上的合理行为，避免状态不一致

---

## 3. 已完成的改动

### 3.1 环境变量配置

**文件**：`packages/web/.env.example`

```env
# Agent 后端类型（可选）
# 支持的值：opencode（默认）, claude, codex, gemini, qwen, goose, auggie, kimi, copilot, qoder, vibe
# 注意：此配置仅在首次创建 session 时生效，后续消息会复用已创建的 agent
AGENT_BACKEND=opencode
```

### 3.2 Agent Client 封装增强

**文件**：`packages/web/src/lib/agent-client.ts`

新增功能：

```typescript
// 1. 读取默认 Agent 后端配置
const AGENT_BACKEND = (process.env.AGENT_BACKEND || 'opencode') as AgentType;

// 2. 获取默认 Agent 后端的辅助函数
export function getDefaultAgentBackend(): AgentType {
  return AGENT_BACKEND;
}

// 3. 封装的发送消息方法（自动使用默认/指定的 backend）
export async function sendAgentMessage(
  sessionId: string,
  message: string,
  options?: {
    demoId?: string;
    workingDir?: string;
    backend?: AgentType;  // 可选：覆盖默认
    timeout?: number;
    stream?: boolean;
  }
): Promise<AgentResult> {
  const client = getAgentClient();
  return client.sendMessage(sessionId, message, {
    demoId: options?.demoId,
    workingDir: options?.workingDir,
    backend: options?.backend || AGENT_BACKEND,  // 使用默认或指定的 backend
    options: {
      timeout: options?.timeout || 120000,
      stream: options?.stream || false,
    },
  });
}
```

### 3.3 API 路由支持 backend 参数

**文件**：`packages/web/src/app/api/ai/chat/route.ts`

改动要点：

```typescript
// 1. 从请求体中读取 backend 参数
const { message, sessionId: localSessionId, demoId, backend } = body as {
  message: string;
  sessionId?: string;
  demoId?: string;
  backend?: AgentType;
};

// 2. 使用请求中的 backend 或默认值
const agentBackend = backend || getDefaultAgentBackend();

// 3. 传递给 agent-client
const result = await agentClient.sendMessage(agentSessionId, message, {
  demoId,
  backend: agentBackend,  // ← 新增
  workingDir: localSessionId ? getSessionPath(localSessionId) : undefined,
  options: { timeout: 120000, stream: false },
});
```

### 3.4 前端组件支持 backend Props

**文件**：`packages/web/src/components/ai-elements/ai-chat.tsx`

改动要点：

```typescript
// 1. 新增 backend prop
interface AIChatProps {
  sessionId: string
  agentSessionId: string
  workingDir?: string
  backend?: AgentType  // ← 新增
  onCodeUpdate?: (code: string) => void
  onSchemaUpdate?: (schema: string) => void
  onFilesChange?: (files: Array<...>) => void
}

// 2. 在降级到非流式 HTTP 时使用 backend 参数
const result = await agentClient.sendMessage(agentSessionId, userMessage, {
  workingDir,
  backend: backend || getDefaultAgentBackend(),  // ← 新增
  options: { timeout: 120000, stream: false },
})
```

---

## 4. 使用方式

### 4.1 方式一：环境变量（全局默认）

在 `packages/web/.env.local` 中配置：

```env
# 使用 Claude 作为默认 Agent
AGENT_BACKEND=claude

# 或使用 Qwen
AGENT_BACKEND=qwen
```

**适用场景**：开发/部署时固定使用某个 Agent

### 4.2 方式二：API 请求时指定（单次覆盖）

调用 `/api/ai/chat` 时传递 `backend` 参数：

```typescript
const response = await fetch('/api/ai/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: '请帮我写一个轮播图组件',
    sessionId: 'session-123',
    demoId: 'my-demo',
    backend: 'claude',  // ← 本次请求使用 Claude
  }),
});
```

**适用场景**：需要根据用户选择动态切换 Agent

### 4.3 方式三：组件 Props 传递（组件级）

在使用 `AIChat` 组件时传递 `backend`：

```tsx
import { AIChat } from '@/components/ai-elements/ai-chat';

<AIChat
  sessionId={sessionId}
  agentSessionId={agentSessionId}
  workingDir={workspacePath}
  backend="gemini"  // ← 该组件使用 Gemini
  onCodeUpdate={handleCodeUpdate}
  onSchemaUpdate={handleSchemaUpdate}
/>
```

**适用场景**：不同页面/组件使用不同的 Agent

### 4.4 方式四：使用封装的辅助函数

```typescript
import { sendAgentMessage, getDefaultAgentBackend } from '@/lib/agent-client';

// 使用默认 backend
const result = await sendAgentMessage('session-123', '你好');

// 覆盖默认 backend
const result = await sendAgentMessage('session-123', '你好', {
  backend: 'qwen',
  workingDir: '/path/to/workspace',
});
```

---

## 5. 后续待完善的功能

### 5.1 优先级 P0（核心功能）

#### 5.1.1 Session 创建时传递 backend

**当前问题**：`createEditSession()` 在 `session-manager.ts` 中创建本地 session 时，**没有将 backend 信息传递给 agent-service**。

**需要修改**：

```typescript
// packages/web/src/lib/session-manager.ts
export async function createEditSession(
  projectId: string,
  options?: { backend?: AgentType }  // ← 新增
): Promise<CreateSessionResult> {
  // ... 现有逻辑 ...

  // 首次调用 agent-service 时传递 backend
  // 需要在某个地方触发 agent-service 的 session 初始化
  // 并传入 backend 参数
}
```

**解决方案选项**：

**选项 A**：在 `createEditSession` 中主动调用 agent-service 初始化 session
```typescript
// 优点：session 创建时就初始化好 agent
// 缺点：增加创建时间，可能失败
```

**选项 B**：保持当前隐式创建模式，在首次发送消息时传递 backend
```typescript
// 优点：简单，不改变现有流程
// 缺点：需要确保首次消息一定携带 backend
// 推荐：✅ 采用此方案
```

#### 5.1.2 AIChat 组件首次消息传递 backend

**当前问题**：AIChat 组件使用 WebSocket 流式通信，但 `stream.send()` **不支持传递 backend 参数**。

**分析**：
- WebSocket 流只是建立连接，真正的 session 初始化发生在首次 HTTP 请求
- 如果 session 已经通过 HTTP 初始化过，WebSocket 只是复用
- 如果 session 未初始化，首次使用 WebSocket 发送消息时，agent-service 会使用默认 backend

**解决方案**：

**方案 A**：在使用 WebSocket 前，先发送一个空的 HTTP 请求初始化 session
```typescript
// 初始化 session
await fetch('/api/ai/chat', {
  method: 'POST',
  body: JSON.stringify({
    message: '',  // 空消息
    sessionId: agentSessionId,
    backend: backend || getDefaultAgentBackend(),
  }),
});

// 然后再建立 WebSocket 连接
const stream = agentClient.stream(agentSessionId);
stream.send(userMessage, ...);
```
**优点**：确保 backend 正确  
**缺点**：多一次 HTTP 请求，用户体验可能有延迟

**方案 B**：在 agent-service 侧支持 WebSocket 握手时传递 backend
```typescript
// 修改 agent-client 的 stream 方法
stream(agentSessionId, { backend?: AgentType })
```
**优点**：优雅，一次连接  
**缺点**：需要修改 agent-service 的 WebSocket 路由

**方案 C（推荐）**：首次消息使用 HTTP，后续使用 WebSocket
```typescript
let sessionInitialized = false;

const handleSend = async () => {
  if (!sessionInitialized) {
    // 首次使用 HTTP，传递 backend
    const result = await agentClient.sendMessage(agentSessionId, userMessage, {
      backend: backend || getDefaultAgentBackend(),
      workingDir,
    });
    sessionInitialized = true;
    // 处理结果...
  } else {
    // 后续使用 WebSocket
    const stream = agentClient.stream(agentSessionId);
    stream.send(userMessage, ...);
  }
};
```
**优点**：简单，不需要修改 agent-service  
**缺点**：首次和后续消息的通信方式不一致

### 5.2 优先级 P1（体验优化）

#### 5.2.1 Agent 状态检测与提示

**需求**：检测系统中已安装的 Agent CLI 工具，并在 UI 中显示可用选项。

**实现思路**：

```typescript
// 新增 API 路由：/api/agent/available
export async function GET() {
  const agentClient = getAgentClient();
  
  // 调用 agent-service 的健康检查或专门的检测接口
  const available = await agentClient.getAvailableBackends();
  
  return NextResponse.json({ success: true, data: available });
}
```

**UI 展示**：

```tsx
// Agent 选择器组件
<AgentSelector
  available={['opencode', 'claude', 'gemini']}
  selected={currentBackend}
  onChange={setBackend}
/>
```

#### 5.2.2 Agent 切换 UI

**需求**：在设置页面或聊天界面中提供 Agent 切换控件。

**设计要点**：
- 显示当前使用的 Agent
- 显示可用的 Agent 列表
- 切换时提示"新 session 生效"（因为 backend 在 session 创建时固定）

#### 5.2.3 Session 信息中展示 backend

**需求**：在 Session 列表/详情中显示该 Session 使用的 Agent 类型。

**当前状态**：`AgentInfo` 类型已包含 `backend` 字段：
```typescript
export interface AgentInfo {
  sessionId: string;
  status: AgentStatus;
  backend: AgentType;  // ← 已有
  createdAt: string;
  lastActivityAt: string;
  messageCount: number;
  workingDir?: string;
}
```

只需在 UI 组件中展示即可。

### 5.3 优先级 P2（高级功能）

#### 5.3.1 按项目/演示配置默认 Agent

**需求**：在项目配置或 Demo 元数据中指定默认 Agent。

```json
// demo.json
{
  "id": "my-demo",
  "title": "轮播图",
  "defaultAgent": "claude"
}
```

#### 5.3.2 Agent 性能监控与对比

**需求**：记录不同 Agent 的响应时间、Token 消耗等指标，帮助用户选择。

**实现思路**：
- 在 `AgentResult.metadata` 中收集指标
- 存储到本地或上报到监控服务
- 提供对比视图

#### 5.3.3 自动降级策略

**需求**：当首选 Agent 不可用时，自动降级到备选 Agent。

```typescript
const BACKEND_PRIORITY = ['claude', 'gemini', 'opencode'];

async function sendMessageWithFallback(message: string) {
  for (const backend of BACKEND_PRIORITY) {
    try {
      return await sendAgentMessage(sessionId, message, { backend });
    } catch (error) {
      console.warn(`Agent ${backend} 失败，尝试下一个`);
    }
  }
  throw new Error('所有 Agent 都不可用');
}
```

---

## 6. 技术细节

### 6.1 Agent Service 侧的实现（已就绪）

Agent Service 已完整支持多 Agent 后端，关键代码：

#### 6.1.1 AgentFactory 注册机制

```typescript
// packages/agent-service/src/server.ts
const factory = getAgentFactory();

factory.register('opencode', (config) => 
  new BackendAgent(config, new OpenCodeAcpBackend(config)));
factory.register('claude', (config) => 
  new BackendAgent(config, new ClaudeBackend(config)));
factory.register('codex', (config) => 
  new BackendAgent(config, new CodexBackend(config)));
// ... 其他后端
```

#### 6.1.2 路由接收 backend 参数

```typescript
// packages/agent-service/src/routes/agent.ts
interface SendMessageBody {
  content: string;
  demoId?: string;
  backend?: AgentType;  // ← 支持
  workingDir?: string;
  customWorkspace?: boolean;
  options?: { timeout?: number; stream?: boolean; };
}

// 使用
const config: AgentConfig = {
  sessionId,
  backend: backend || "opencode",  // ← 默认为 opencode
  demoId,
  workingDir: workspaceInfo?.path || workingDir,
};

const agent = manager.getOrCreate(sessionId, config);
```

### 6.2 WebSocket 流式通信的限制

**问题**：`AgentClient.stream().send()` 不支持传递 `backend` 参数。

**原因**：
- WebSocket 连接建立时只传递 sessionId
- 真正的 session 初始化在 agent-service 侧完成
- 流式消息只是向已初始化的 session 发送消息

**验证方法**：

```typescript
// 查看 agent-client/src/client.ts 的 stream 方法
stream(sessionId: string): AgentStream {
  const ws = new WebSocket(`${this.baseUrl}/ws/agent/${sessionId}`);
  // ...
  // 没有传递 backend 的地方
}
```

### 6.3 Session 生命周期

```
创建流程：
1. 前端调用 POST /api/sessions（创建本地 session 文件）
2. 前端调用 POST /api/ai/chat（首次消息）
3. Web API 调用 Agent Service POST /api/agent/:sessionId/message
4. Agent Service 检测到新 session，调用 workspaceManager.create()
5. 使用 config.backend 创建 Agent 实例
6. 后续消息复用该实例

销毁流程：
1. 前端调用 DELETE /api/sessions/:sessionId
2. Web API 调用 Agent Service DELETE /api/agent/:sessionId
3. Agent Service 销毁 Agent 实例和工作区
```

---

## 7. 测试策略

### 7.1 单元测试

```typescript
describe('agent-client', () => {
  it('应使用默认的 AGENT_BACKEND', async () => {
    process.env.AGENT_BACKEND = 'claude';
    const backend = getDefaultAgentBackend();
    expect(backend).toBe('claude');
  });

  it('应在 sendAgentMessage 中使用指定的 backend', async () => {
    const mockSendMessage = jest.fn();
    // ... mock 实现
    
    await sendAgentMessage('session-1', 'test', { backend: 'gemini' });
    
    expect(mockSendMessage).toHaveBeenCalledWith(
      'session-1',
      'test',
      expect.objectContaining({ backend: 'gemini' })
    );
  });
});
```

### 7.2 集成测试

```typescript
describe('AI Chat API', () => {
  it('应在请求中使用指定的 backend', async () => {
    const response = await request(app)
      .post('/api/ai/chat')
      .send({
        message: 'test',
        backend: 'qwen',
      });
    
    expect(response.status).toBe(200);
    // 验证 agent-service 收到的 backend 参数
  });
});
```

### 7.3 冒烟测试（真实后端）

```bash
# 启用真实后端测试
ACP_SMOKE_REAL=1 pnpm --filter @opencode-workbench/agent-service test:smoke

# 测试不同 Agent 后端
# 需要预先安装对应的 CLI 工具
```

---

## 8. 风险与注意事项

### 8.1 依赖项检查

不同 Agent 后端需要安装对应的 CLI 工具：

| Agent | 安装方式 |
|-------|----------|
| opencode | `npm install -g opencode` |
| claude | 安装 Claude CLI |
| codex | 安装 Codex CLI |
| gemini | 安装 Gemini CLI |
| qwen | 安装 Qwen CLI |
| ... | ... |

**建议**：在启动时检查 CLI 可用性，给出友好提示。

### 8.2 Session 隔离

- 不同 Agent 的 Session **不能混用**
- 一旦 Session 创建，其 backend 固定
- 切换 Agent 需要创建新 Session

### 8.3 错误处理

```typescript
// Agent Service 侧的错误消息示例
{
  error: "Unknown agent type: invalid-agent",
  code: "INTERNAL_ERROR"
}

// 应在 Web 侧捕获并展示友好提示
```

### 8.4 环境变量作用域

- `.env.local` 仅对 `web` 包生效
- `agent-service` 有独立的环境变量配置
- 如果需要全局配置，需在两个包中同步设置

---

## 9. 实施路线图

### Phase 1：基础支持（当前进度：✅ 已完成 70%）

- [x] 环境变量 AGENT_BACKEND 配置
- [x] agent-client.ts 封装增强
- [x] API 路由支持 backend 参数
- [x] AIChat 组件支持 backend prop
- [ ] AIChat 首次消息传递 backend（P0，待实现）

**预计剩余工作量**：1-2 小时

### Phase 2：体验优化（P1）

- [ ] Agent 可用性检测 API
- [ ] Agent 选择器 UI 组件
- [ ] Session 列表展示 backend 信息
- [ ] 切换 Agent 时的用户提示

**预计工作量**：半天

### Phase 3：高级功能（P2）

- [ ] 项目/演示级默认 Agent 配置
- [ ] Agent 性能监控
- [ ] 自动降级策略
- [ ] Agent 使用统计与报表

**预计工作量**：1-2 天

---

## 10. 常见问题 FAQ

### Q1：为什么不能在发送消息时随时切换 Agent？

**A**：Agent 实例在 Session 首次创建时初始化，后续消息复用该实例。这是为了保证状态一致性和避免资源泄漏。如需切换 Agent，请创建新的 Session。

### Q2：如何知道当前系统安装了哪些 Agent CLI？

**A**：可以调用 agent-service 的健康检查接口（待实现），或在终端中直接运行对应的 CLI 命令检查。

### Q3：默认使用 opencode 会影响性能吗？

**A**：不会。opencode 是默认的 ACP 兼容客户端，性能与其他 Agent 取决于各自的实现和网络状况。

### Q4：可以同时使用多个 Agent 吗？

**A**：可以。创建多个 Session，每个 Session 使用不同的 Agent。它们之间是隔离的。

### Q5：WebSocket 流式通信为什么不支持传递 backend？

**A**：WebSocket 连接建立时只传递 sessionId，真正的 session 初始化发生在首次 HTTP 消息或 WebSocket 首次发送消息时。当前设计中，backend 参数只在 HTTP 请求中有效。

---

## 11. 参考资料

- [Agent Service AGENTS.md](../../packages/agent-service/AGENTS.md)
- [Agent Client SDK 文档](../../packages/agent-client/README.md)
- [ACP 协议规范](https://github.com/zed-industries/zed/acp)
- [支持的 Agent 后端列表](../../packages/agent-service/src/backends/)

---

**文档维护**：请在实施过程中持续更新此文档，记录设计决策、遇到的问题和解决方案。
