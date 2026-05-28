# 多 Agent 后端支持方案

> **文档状态**：方案设计 + 实施中  
> **创建日期**：2026-04-08  
> **更新日期**：2026-05-28  
> **适用范围**：packages/author-site、packages/agent-service、packages/agent-client

---

## 1. 背景与目标

### 1.1 现状

当前 Web 工作台在与 Agent Service 通信时，**未支持用户选择或切换不同的 AI Agent 后端**。backend 参数在 API 层和组件层均未透传，实际使用 agent-service 的 `DEFAULT_BACKEND` 环境变量（默认值 `opencode`）。

### 1.2 目标

实现**多 Agent 后端支持**，允许用户/开发者在代码层面配置使用哪个 Agent 后端，包括：

- 通过环境变量配置默认 Agent
- API 路由支持在请求中指定 Agent 类型
- 前端组件可传递 Agent 类型参数
- 保持向后兼容（默认使用 `opencode-http`）

### 1.3 支持的 Agent 后端列表

| Backend | CLI 命令 | ACP 参数 | 状态 |
|---------|----------|----------|------|
| `opencode-http` | HTTP 直连 | N/A | ✅ **推荐默认** |
| `opencode` | `opencode` | `['acp']` | ⚠️ 已注册（@deprecated） |
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

> **注意**：
> 1. 实际可用的 Agent 取决于系统中是否已安装对应的 CLI 工具
> 2. `opencode` (ACP stdio) 已标记为 `@deprecated`，推荐使用 `opencode-http` (HTTP 直连)
> 3. 完整注册代码见 `packages/agent-service/src/server.ts:65-80`

---

## 2. 架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                      author-site 前端层                      │
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
│                           │                                 │
│                  ┌────────▼────────┐                        │
│                  │  agent-client   │                        │
│                  │  npm package    │                        │
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
│   │ Http/Acp    │ │  Backend    │ │  Backend    │        │
│   └─────────────┘ └─────────────┘ └─────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Agent 类型传递路径

```
用户配置/请求
    │
    ├─ 环境变量 DEFAULT_BACKEND（agent-service 全局默认，默认值 opencode）
    │
    ├─ API 请求体 backend 字段（单次请求，当前未实现）
    │
    └─ 前端组件 props backend（组件级，当前未实现）
         │
         ▼
    author-site API Route（当前未透传 backend）
         │
         ▼
    agent-client.sendMessage(options.backend)（支持，但调用方未传）
         │
         ▼
    Agent Service POST /api/agent/:sessionId/message（支持 backend 参数）
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

## 3. 当前代码实现状态

### 3.1 环境变量配置

**文件**：`packages/agent-service/src/routes/agent.ts` (第 18 行)

```typescript
const DEFAULT_BACKEND = process.env.DEFAULT_BACKEND || 'opencode';
```

**当前状态**：
- ✅ agent-service 已支持 `DEFAULT_BACKEND` 环境变量
- ❌ author-site 未配置或读取此环境变量
- ❌ 环境变量名是 `DEFAULT_BACKEND`，不是文档原描述的 `AGENT_BACKEND`

### 3.2 Agent Client SDK 支持 backend 参数

**文件**：`packages/agent-client/src/client.ts`

已实现功能：

```typescript
// AgentClient.sendMessage 已支持 backend 参数（第 54-76 行）
async sendMessage(
  sessionId: string,
  content: string,
  options?: {
    demoId?: string;
    backend?: AgentType;  // ✅ 已支持
    workingDir?: string;
    customWorkspace?: boolean;
    options?: SendMessageOptions;
  },
): Promise<ApiResponse<AgentResult>>
```

**当前状态**：SDK 层已支持，但 author-site 调用方未传递此参数。

> **注意**：文档原描述的 `sendAgentMessage()`、`getDefaultAgentBackend()` 等辅助函数在 `packages/author-site/src/lib/agent-client.ts` 中**并不存在**。当前仅导出基础的 `AgentClient` 类。

### 3.3 API 路由 backend 参数支持状态

**文件**：`packages/author-site/src/app/api/ai/chat/route.ts`

**当前实现**（第 8-31 行）：

```typescript
// ❌ 当前未读取 backend 参数
const { message, sessionId: localSessionId, demoId } = body as {
  message: string;
  sessionId?: string;
  demoId?: string;
  // backend?: AgentType;  ← 缺失
};

// ❌ 未传递 backend 给 agent-client
const result = await agentClient.sendMessage(agentSessionId, message, {
  demoId,
  workingDir: localSessionId ? getSessionPath(localSessionId) : undefined,
  // backend: agentBackend,  ← 缺失
  options: { timeout: 120000, stream: false },
});
```

**需要修改**：参考文档第 5 节的实施方案。

### 3.4 前端组件 backend Props 支持状态

**文件**：`packages/author-site/src/components/ai-elements/ai-chat.tsx`

**当前实现**（第 20-48 行）：

```typescript
interface AIChatProps {
  sessionId: string;
  agentSessionId: string;
  workingDir?: string;
  projectId?: string;
  demoId?: string;
  workspaceId?: string;
  // backend?: AgentType  ← ❌ 缺失
  onCodeUpdate?: (code: string) => void;
  // ...
}
```

**当前状态**：AIChat 组件**未支持** backend prop，需后续添加。

> **注意**：AIChat 组件实际使用 `useChatStream` hook → `StreamService` → `AgentClient.stream()` 进行 WebSocket 通信，而非直接调用 `sendMessage()`。

---

## 4. Agent Service 侧的实现（已就绪）

### 4.1 AgentFactory 注册机制

**文件**：`packages/agent-service/src/server.ts` (第 65-80 行)

```typescript
const factory = getAgentFactory();

// @deprecated ACP 后端仅保留兼容，推荐使用 opencode-http
factory.register('opencode', (agentConfig) => new BackendAgent(agentConfig, new OpenCodeAcpBackend(agentConfig)));
factory.register('opencode-http', (agentConfig) => new BackendAgent(agentConfig, new OpenCodeHttpBackend(agentConfig)));
factory.register('claude', (agentConfig) => new BackendAgent(agentConfig, new ClaudeBackend(agentConfig)));
factory.register('codex', (agentConfig) => new BackendAgent(agentConfig, new CodexBackend(agentConfig)));
factory.register('gemini', (agentConfig) => new BackendAgent(agentConfig, new GeminiBackend(agentConfig)));
factory.register('qwen', (agentConfig) => new BackendAgent(agentConfig, new QwenBackend(agentConfig)));
factory.register('goose', (agentConfig) => new BackendAgent(agentConfig, new GooseBackend(agentConfig)));
factory.register('auggie', (agentConfig) => new BackendAgent(agentConfig, new AuggieBackend(agentConfig)));
factory.register('kimi', (agentConfig) => new BackendAgent(agentConfig, new KimiBackend(agentConfig)));
factory.register('copilot', (agentConfig) => new BackendAgent(agentConfig, new CopilotBackend(agentConfig)));
factory.register('qoder', (agentConfig) => new BackendAgent(agentConfig, new QoderBackend(agentConfig)));
factory.register('vibe', (agentConfig) => new BackendAgent(agentConfig, new VibeBackend(agentConfig)));
factory.register('custom', (agentConfig) => new BackendAgent(agentConfig, new CustomBackend(agentConfig)));
```

### 4.2 路由接收 backend 参数

**文件**：`packages/agent-service/src/routes/agent.ts` (第 25-36 行)

```typescript
interface SendMessageBody {
  content: string;
  demoId?: string;
  backend?: AgentType;  // ✅ 支持
  workingDir?: string;
  customWorkspace?: boolean;
  model?: string;
  options?: {
    timeout?: number;
    stream?: boolean;
  };
}
```

**使用**（第 90 行）：

```typescript
const config: AgentConfig = {
  sessionId,
  backend: backend || DEFAULT_BACKEND,  // ✅ 使用请求参数或默认值
  demoId,
  workingDir: workspaceInfo?.path || workingDir,
};

const agent = manager.getOrCreate(sessionId, config);
```

### 4.3 WebSocket 流式通信的 backend 处理

**文件**：`packages/agent-service/src/routes/websocket.ts`

**当前实现**：WebSocket 消息不支持传递 `backend` 参数，使用默认值：

```typescript
const DEFAULT_BACKEND = process.env.DEFAULT_BACKEND || "opencode";

// 多处使用（第 160, 183, 341, 458 行）
backend: DEFAULT_BACKEND,
```

**影响**：通过 WebSocket 流式发送的消息**无法指定 backend**，只能使用 agent-service 的默认配置。

---

## 5. 待实施方案

### 5.1 优先级 P0（核心功能）

#### 5.1.1 author-site API 路由支持 backend 参数

**需要修改**：`packages/author-site/src/app/api/ai/chat/route.ts`

```typescript
// 1. 从请求体中读取 backend 参数
const { message, sessionId: localSessionId, demoId, backend } = body as {
  message: string;
  sessionId?: string;
  demoId?: string;
  backend?: AgentType;  // ← 新增
};

// 2. 传递给 agent-client
const result = await agentClient.sendMessage(agentSessionId, message, {
  demoId,
  backend,  // ← 新增（可选，agent-service 会使用 DEFAULT_BACKEND 作为兜底）
  workingDir: localSessionId ? getSessionPath(localSessionId) : undefined,
  options: { timeout: 120000, stream: false },
});
```

**工作量**：约 30 分钟

#### 5.1.2 AIChat 组件支持 backend Props

**需要修改**：

1. **AIChat 组件** (`packages/author-site/src/components/ai-elements/ai-chat.tsx`)

```typescript
interface AIChatProps {
  // ... 现有 props
  backend?: AgentType;  // ← 新增
}
```

2. **useChatStream hook** - 需要将 backend 传递给 StreamService

3. **StreamService** (`packages/author-site/src/components/ai-elements/chat/services/stream-service.ts`)

**挑战**：当前 `StreamService.sendMessage()` 通过 WebSocket 发送消息，而 WebSocket 协议不支持传递 backend 参数（见 4.3 节）。

**解决方案选项**：

**方案 A（推荐）**：首次消息使用 HTTP 初始化 session（携带 backend），后续使用 WebSocket

```typescript
let sessionInitialized = false;

const handleSend = async () => {
  if (!sessionInitialized) {
    // 首次使用 HTTP，传递 backend
    const result = await agentClient.sendMessage(agentSessionId, userMessage, {
      backend: backend || 'opencode-http',
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

**方案 B**：修改 agent-service WebSocket 路由支持 backend 参数

需要修改 `packages/agent-service/src/routes/websocket.ts`，在 WebSocket 消息中支持 backend 字段。

**工作量**：方案 A 约 2 小时，方案 B 约 4 小时

### 5.2 优先级 P1（体验优化）

#### 5.2.1 Agent 状态检测与提示

**需求**：检测系统中已安装的 Agent CLI 工具，并在 UI 中显示可用选项。

**实现思路**：

```typescript
// 新增 API 路由：/api/agent/available
export async function GET() {
  const agentClient = getAgentClient();
  
  // 调用 agent-service 的 /backends 接口
  const response = await fetch(`${AGENT_SERVICE_URL}/backends`);
  const backends = await response.json();
  
  return NextResponse.json({ success: true, data: backends });
}
```

> **注意**：agent-service 已提供 `/backends` 接口（`server.ts:97-99`），返回已注册的后端类型列表。

**UI 展示**：

```tsx
// Agent 选择器组件
<AgentSelector
  available={['opencode-http', 'claude', 'gemini']}
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
const BACKEND_PRIORITY = ['opencode-http', 'claude', 'gemini'];

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

### 6.1 WebSocket 流式通信的限制

**问题**：`AgentClient.stream().send()` 不支持传递 `backend` 参数。

**原因**：
- WebSocket 连接建立时只传递 sessionId
- 真正的 session 初始化在 agent-service 侧完成
- 流式消息只是向已初始化的 session 发送消息

**代码验证**：`packages/agent-client/src/client.ts` 第 189-192 行

```typescript
stream(sessionId: string): AgentStream {
  const wsUrl = this.baseUrl.replace(/^http/, "ws");
  return new AgentStream(`${wsUrl}/api/agent/${sessionId}/stream`);
  // 没有传递 backend 的地方
}
```

### 6.2 Session 生命周期

```
创建流程：
1. 前端调用 POST /api/sessions（创建本地 session 文件）
2. 前端调用 POST /api/ai/chat（首次消息）
3. author-site API 调用 Agent Service POST /api/agent/:sessionId/message
4. Agent Service 检测到新 session，调用 workspaceManager.create()
5. 使用 config.backend 创建 Agent 实例
6. 后续消息复用该实例

销毁流程：
1. 前端调用 DELETE /api/sessions/:sessionId
2. author-site API 调用 Agent Service DELETE /api/agent/:sessionId
3. Agent Service 销毁 Agent 实例和工作区
```

---

## 7. 测试策略

### 7.1 单元测试

```typescript
describe('agent-client', () => {
  it('应在 sendMessage 中使用指定的 backend', async () => {
    const mockSendMessage = jest.fn();
    // ... mock 实现
    
    await agentClient.sendMessage('session-1', 'test', { backend: 'gemini' });
    
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
  it('应在请求中透传 backend 参数', async () => {
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

// 应在 author-site 侧捕获并展示友好提示
```

### 8.4 环境变量作用域

- `DEFAULT_BACKEND` 环境变量在 agent-service 侧生效
- author-site 有独立的环境变量配置
- 如果需要全局配置，需在两个包中同步设置

---

## 9. 实施路线图

### Phase 1：基础支持（当前进度：⚠️ 30%）

- [x] agent-service 支持 backend 参数（已完成）
- [x] agent-client SDK 支持 backend 参数（已完成）
- [ ] author-site API 路由透传 backend（P0，待实施）
- [ ] AIChat 组件支持 backend prop（P0，待实施）
- [ ] 首次消息使用 HTTP 初始化 session 传递 backend（P0，待实施）

**预计剩余工作量**：3-4 小时

### Phase 2：体验优化（P1）

- [ ] Agent 可用性检测 API（利用现有 /backends 接口）
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

**A**：可以调用 agent-service 的 `/backends` 接口获取已注册的后端类型列表。但实际可用性取决于系统中是否已安装对应的 CLI 工具。

### Q3：默认使用 opencode 会影响性能吗？

**A**：`opencode` (ACP stdio) 已标记为 `@deprecated`，推荐使用 `opencode-http` (HTTP 直连)。性能差异取决于各自的实现和网络状况。

### Q4：可以同时使用多个 Agent 吗？

**A**：可以。创建多个 Session，每个 Session 使用不同的 Agent。它们之间是隔离的。

### Q5：WebSocket 流式通信为什么不支持传递 backend？

**A**：WebSocket 连接建立时只传递 sessionId，真正的 session 初始化发生在首次 HTTP 消息或 WebSocket 首次发送消息时。当前设计中，backend 参数只在 HTTP 请求中有效。需要通过方案 A（首次 HTTP 初始化）或方案 B（修改 WebSocket 协议）解决。

---

## 11. 参考资料

- [Agent Service AGENTS.md](packages/agent-service/AGENTS.md)
- [Agent Client SDK](packages/agent-client/)
- [ACP 协议规范](https://github.com/zed-industries/zed/acp)
- [支持的 Agent 后端列表](packages/agent-service/src/backends/)
- [agent-service server.ts](packages/agent-service/src/server.ts)
- [author-site ai-chat.tsx](packages/author-site/src/components/ai-elements/ai-chat.tsx)
- [author-site chat route.ts](packages/author-site/src/app/api/ai/chat/route.ts)

---

**文档维护**：请在实施过程中持续更新此文档，记录设计决策、遇到的问题和解决方案。

**更新日志**：
- 2026-05-28：根据代码现状修正文档错误
  - 修正包名：`packages/web` → `packages/author-site`
  - 修正默认后端：`opencode` → `opencode-http`（推荐）
  - 修正环境变量名：`AGENT_BACKEND` → `DEFAULT_BACKEND`
  - 修正实现状态：标记未完成的功能
  - 删除不存在的辅助函数描述
  - 补充 WebSocket backend 限制说明
