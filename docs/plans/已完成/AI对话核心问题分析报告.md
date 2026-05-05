# AI 对话核心问题分析报告

> 分析日期：2026-05-05
> 合并自：《AI修改文件卡住问题分析报告》+《AI工作空间隔离与文件认知问题分析报告》
> 严重程度：高（核心功能阻塞 + AI 行为偏离预期）

---

## 1. 问题背景

### 1.1 问题描述

用户在通过 AI 对话请求创建或修改界面时，遇到三类严重问题：

1. **修改文件卡住**：AI 在执行到"修改文件"步骤时长时间卡住（超过 2 分钟），前端无进度反馈，用户无法判断 AI 是仍在处理还是已死锁
2. **目录认知错误**：AI 认为当前工作目录是 `packages/agent-service`，能看到 `packages/web`、`packages/shared` 等目录，试图去修改这些不相关的文件
3. **文件认知错误**：AI 不知道应该修改 `demos/{demoId}/index.tsx` 和 `demos/{demoId}/config.schema.json`，反而询问用户"标题在哪个文件中"

### 1.2 预期行为 vs 实际行为

| 维度 | 预期行为 | 实际行为 |
|------|---------|---------|
| **响应时间** | AI 应在合理时间内完成文件修改并继续后续步骤 | 文件修改步骤耗时极长，无进度反馈 |
| **工作目录** | AI 应在临时工作空间中操作 | AI 认为自己在 `packages/agent-service` 目录 |
| **可见范围** | AI 只能看到工作空间内的 `demos/` 和 `project.config.schema.json` | AI 能看到整个 monorepo 的 packages 结构 |
| **文件认知** | AI 知道要修改 `demos/{demoId}/index.tsx`（代码）和 `config.schema.json`（配置） | AI 不知道要改哪个文件，反问用户 |
| **页面管理** | AI 可通过自然语言创建新页面 | AI 不知道可以创建页面 |

### 1.3 涉及系统组件

| 组件 | 职责 |
|:-----|:-----|
| **前端 AIChat 组件** | 接收 `workingDir` prop，通过 WebSocket 发送给 agent-service |
| **StreamService** | 将 `workingDir` 放入 WebSocket message payload |
| **agent-service WebSocket 路由** | 接收 `workingDir`，创建 AgentConfig，管理超时 |
| **AgentManager / BackendAgent** | 根据 `workingDir` 创建 Agent，转发消息和事件 |
| **OpenCodeAcpBackend** | 使用 `workingDir` 启动 ACP 子进程 |
| **AcpConnection** | 将 `workingDir` 作为 `cwd` 传递给 opencode CLI，管理超时和 keepalive |
| **opencode CLI** | 在 `cwd` 目录下运行，决定 AI 能看到什么文件 |
| **demo-generator.template.md** | AI 代理的系统提示词，告知 AI 工作空间结构和目标文件 |
| **session-guard.ts** | 文件访问验证，检查路径安全性和文件名合法性 |

---

## 2. 根因分析

### 2.1 问题一：修改文件卡住 — 超时机制存在但不够精细

#### 证据 1：WebSocket 层有 10 分钟超时，但粒度过粗

**文件**：[websocket.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/agent-service/src/routes/websocket.ts) L28, L437-L457

```typescript
const MESSAGE_TIMEOUT_MS = 600000; // 10 分钟

// 在 handleMessage 中：
const timeoutPromise = new Promise<AgentResult>((resolve) => {
  timeoutHandle = setTimeout(() => {
    logger.warn({ sessionId, timeoutMs: MESSAGE_TIMEOUT_MS }, "Agent sendMessage timed out, cancelling");
    agent.cancel();
    resolve({ success: false, error: { code: "MESSAGE_TIMEOUT", message: `消息处理超时（${Math.round(MESSAGE_TIMEOUT_MS / 1000)}s 无响应），已自动取消`, retryable: true } });
  }, MESSAGE_TIMEOUT_MS);
});

const result = await Promise.race([sendPromise, timeoutPromise]);
```

WebSocket 层**确实存在** 10 分钟超时机制，使用 `Promise.race` 实现。但 10 分钟对用户来说太长，期间前端完全无反馈。

#### 证据 2：ACP 连接层的 silence-based 超时会被持续重置

**文件**：[connection.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/agent-service/src/acp/connection.ts) L88-L92, L521-L537, L539-L562

```typescript
private promptTimeoutMs: number = 300000; // 默认 5 分钟
private static readonly KEEPALIVE_INTERVAL_MS = 60000; // keepalive 60 秒

// 每收到一条 SESSION_UPDATE → 重置 5 分钟计时器
private resetSessionPromptTimeouts(): void {
  for (const [id, request] of this.pendingRequests) {
    if (request.method === ACP_METHODS.SESSION_PROMPT && !request.isPaused && request.timeoutId) {
      clearTimeout(request.timeoutId);
      request.startTime = Date.now();
      request.timeoutId = setTimeout(() => { /* ... */ }, request.timeoutDuration);
    }
  }
}

// keepalive 每 60 秒检查，如果请求在原始 5 分钟窗口内，也重置
private startPromptKeepalive(): void {
  this.promptKeepaliveInterval = setInterval(() => {
    const hasEligibleRequest = [...this.pendingRequests.values()].some(
      (r) => r.method === ACP_METHODS.SESSION_PROMPT && now - r.promptOriginTime < r.timeoutDuration,
    );
    if (hasEligibleRequest) {
      this.resetSessionPromptTimeouts();
    }
  }, AcpConnection.KEEPALIVE_INTERVAL_MS);
}
```

**问题**：AI 在"修改文件"期间，如果持续输出 `tool_call_update`（如进度更新），计时器**不断重置**，永不触发。即使 AI 完全卡死（无任何输出），最坏情况下也需要约 5-10 分钟才会触发超时。

#### 证据 3：WebSocket 心跳只检测 TCP 连接存活，不检测业务活跃度

**文件**：[websocket.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/agent-service/src/routes/websocket.ts) L107-L108

```typescript
const HEARTBEAT_INTERVAL = 30000;
const HEARTBEAT_TIMEOUT = 60000;
```

WebSocket 心跳只能检测 TCP 连接是否存活，不能检测 AI 业务是否在处理。AI 卡死时 WebSocket 连接仍然正常，前端继续等待。

#### 证据 4：BackendAgent.cancel() 实际会调用 cancelPrompt()

**文件**：[backend-agent.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/agent-service/src/core/backend-agent.ts) L80-L83

```typescript
cancel(): void {
  this.backend.cancelPrompt?.();  // ← 会调用 AcpConnection.cancelPrompt()
  this.busy = false;
  this.setStatus('ready');
}
```

`cancel()` **确实会**调用 `cancelPrompt()`，后者会发送 `SESSION_CANCEL` 通知给 ACP 子进程并清除 pending requests。但问题是：前端没有提供"取消"按钮让用户主动触发此操作，且 WebSocket 层的 10 分钟超时才会自动调用 `cancel()`。

#### 证据 5：ACP 协议文件操作通知存在 content 缺失问题

**文件**：[connection.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/agent-service/src/acp/connection.ts) L378-L398

```typescript
private async handleWriteOperation(params: {
  path: string;
  content: string;
  sessionId?: string;
}): Promise<void> {
  if (!params.content) {
    logger.warn("[ACP Connection] WRITE_TEXT_FILE notification received WITHOUT content");
  }
  this.onFileOperation?.({
    method: "fs/write_text_file",
    path: resolvedPath,
    content: params.content,  // 可能为 undefined
  });
}
```

当 `content` 缺失时，前端 `file_operation` 事件到达但 `content` 为 `undefined`，`onCodeUpdate` 不被调用，预览不更新。

#### 证据 6：edit 工具绕过 ACP 通知

**文件**：[opencode-acp.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/agent-service/src/backends/opencode-acp.ts) L160-L204

```typescript
private async detectFileChangesAfterEdit(): Promise<void> {
  if (this.files.length === 0) {
    logger.info("[OpenCode Backend] No file_operation events captured, edit tool may have been used");
    // 这里暂时无法做更多，因为 ACP 协议没有提供直接读取文件的机制
  }
}
```

AI 使用 `edit` 工具（原地修改文件）时，ACP 协议**不发送 `WRITE_TEXT_FILE` 通知**，前端完全收不到该文件的变更事件。

#### 卡顿触发路径

```
用户发送消息（如"创建星空许愿页"）
    ↓
前端 stream.send(content, id, { stream: true, workingDir })
    ↓
WebSocket → websocket.ts handleMessage("message")
    ↓
agent = manager.getOrCreate(sessionId, config)
    ↓
await Promise.race([agent.sendMessage(...), setTimeout(10min)])  ← 10 分钟超时
    ↓
BackendAgent.sendMessage → busy=true → backend.sendMessage
    ↓
OpenCodeAcpBackend.sendMessage → connection.sendPrompt
    ↓
AI 开始处理 → 调用工具（fs/write_text_file 或 edit）
    ↓
【卡住位置】文件操作期间：
  - 如果持续有 tool_call_update → ACP 超时计时器不断重置 → 永不超时
  - 如果完全无输出 → keepalive 维持 → 约 5-10 分钟后才超时
  - WebSocket 层 10 分钟超时兜底
    ↓
前端持续显示"修改文件"，2 分钟无新输出...
```

#### 根本原因总结

| 层级 | 现状 | 问题 |
|:-----|:-----|:-----|
| **前端** | `sendMessage` 无客户端超时 | 用户无法在合理时间内得到超时反馈 |
| **WebSocket 层** | `MESSAGE_TIMEOUT_MS = 600000`（10 分钟） | 超时时间过长，用户等待体验极差 |
| **ACP 连接层** | silence-based 超时 + keepalive 自维持 | 文件操作期间超时不断重置，5-10 分钟才触发 |
| **ACP 协议层** | write_text_file content 可能缺失；edit 工具不通知 | 前端收不到文件变更，无法更新预览 |

**核心问题**：整个链路**没有"文件操作级"的超时和反馈机制**。所有超时都是"会话级"的，且会被文件操作期间的任何输出重置。10 分钟的 WebSocket 超时虽然存在，但对用户体验来说太长。

---

### 2.2 问题二：AI 访问错误目录 — workingDir 传递链断裂

#### 证据 1：前端正确传入了 workingDir

**文件**：[page.tsx](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/web/src/app/projects/[id]/edit/page.tsx) L199-L202

```typescript
<AIChat
  sessionId={sessionInfo.sessionId}
  agentSessionId={agentSessionId}
  workingDir={sessionInfo.tempWorkspace}  // ← 正确传入临时工作空间路径
/>
```

#### 证据 2：AIChat → StreamService 正确传递

**文件**：[stream-service.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/web/src/components/ai-elements/chat/services/stream-service.ts) L111-L118

```typescript
sendMessage(message: string, workingDir?: string): void {
  this.stream.send(message, `msg-${Date.now()}`, {
    stream: true,
    workingDir,  // ← 放入 WebSocket payload
  });
}
```

#### 证据 3：WebSocket 路由正常场景正确接收 workingDir

**文件**：[websocket.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/agent-service/src/routes/websocket.ts) L311-L322

```typescript
const config: AgentConfig = {
  sessionId,
  backend: "opencode",
  workingDir: message.workingDir,  // ← 从 WebSocket message 读取
};
```

#### 证据 4（关键 Bug）：`get_models` 场景硬编码 `process.cwd()`

**文件**：[websocket.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/agent-service/src/routes/websocket.ts) L651-L656

```typescript
case "get_models": {
  try {
    let agent = manager.get(sessionId);
    if (!agent) {
      const config: AgentConfig = {
        sessionId,
        backend: "opencode",
        workingDir: process.cwd(),  // ← 硬编码为 agent-service 目录！
      };
      agent = manager.getOrCreate(sessionId, config);
```

**这是导致 AI 看到错误目录的最直接原因**。前端有两处发送 `{ type: "get_models" }` 消息时**不携带 workingDir**：

1. **[use-chat-models.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/web/src/components/ai-elements/chat/hooks/use-chat-models.ts) L52**：WebSocket 连接建立时**自动发送** `{ type: "get_models" }`，且 `useChatModels` hook 不接收 `workingDir` 参数
2. **[stream-service.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/web/src/components/ai-elements/chat/services/stream-service.ts) L141-145**：`requestModels()` 方法也不携带 `workingDir`

**会话污染机制**：`use-chat-models.ts` 在组件挂载时自动发送 `get_models`，触发 `getOrCreate` 用 `process.cwd()` 创建 Agent。之后用户发送消息时，即使携带了正确 workingDir，`getOrCreate` 仍返回已被错误 workingDir 创建的 Agent（因为 `getOrCreate` 对已存在的 sessionId 直接返回，忽略新 config）。这意味着**每次打开 AI 对话都会触发此 bug**。

#### 证据 5：OpenCodeAcpBackend 的回退逻辑

**文件**：[opencode-acp.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/agent-service/src/backends/opencode-acp.ts) L37, L64

```typescript
// initialize() 方法：
this.connection = new AcpConnection("opencode", this.config.workingDir || process.cwd());

// start() 方法：
const workingDir = this.config.workingDir || process.cwd();
this.connection = new AcpConnection("opencode", workingDir);
```

如果 `config.workingDir` 为 `undefined` 或空字符串，会回退到 `process.cwd()`（即 `packages/agent-service`）。

#### 证据 6：AcpConnection 将 workingDir 作为 cwd 传递给子进程

**文件**：[connection.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/agent-service/src/acp/connection.ts) L151-L155

```typescript
this.child = spawn(actualCommand, actualArgs, {
  cwd: this.workingDir,  // ← 子进程的工作目录
  env: { ...cleanEnv, ...this.config?.env },
  stdio: ["pipe", "pipe", "pipe"],
  shell: useShell,
});
```

opencode CLI 以此 `cwd` 为基础扫描项目结构。如果 `cwd` 是 `packages/agent-service`，CLI 会看到整个 monorepo。

---

### 2.3 问题三：AI 不知道该修改哪个文件 — 提示词约束不足

#### 证据 1：当前提示词已包含多 Demo 结构和页面创建指令

**文件**：[demo-generator.template.md](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/web/src/lib/agent-prompts/demo-generator.template.md)

提示词已包含：
- 工作空间结构描述（`demos/{demoId}/` 目录）
- 页面信息注入（`{{PAGE_LIST}}` 占位符）
- 页面创建指令（生成 demoId、创建三个文件）
- 项目级配置管理规则
- "禁止行为"列表

#### 证据 2：提示词缺少关键约束 — 文件系统可见范围限制

提示词中**没有任何内容**告知 AI：
- "你只能访问当前工作空间目录下的文件"
- "不能访问上级目录或其他 package"
- "禁止访问 `packages/agent-service`、`packages/web` 等目录"

当前的"禁止行为"只限制修改系统文件和重复定义字段，**不限制文件系统的可见范围**。

#### 证据 3：提示词的文件修改决策逻辑不够明确

提示词说"如果需要操作某个页面，请在 `demos/{id}/` 目录下编辑 `index.tsx` 或 `config.schema.json`"，但没有明确告诉 AI：
- 样式修改 → 修改 `index.tsx`
- 配置项修改 → 修改 `config.schema.json`
- **不要询问用户要修改哪个文件，直接执行**

当用户说"标题改为红色"时，AI 无法确定这是要修改 `index.tsx` 中的样式，还是修改 `config.schema.json` 中的配置字段。

#### 证据 4：permission-config.ts 的外部目录配置与隔离矛盾

**文件**：[permission-config.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/web/src/lib/templates/permission-config.ts) L1-L58

```typescript
export const OPENCODE_CONFIG_TEMPLATE = {
  permission: {
    edit: {
      '*': 'deny',
      'index.tsx': 'allow',
      'config.schema.json': 'allow',
      'AGENTS.md': 'allow',
    },
    read: {
      '*': 'allow',  // ← 允许读取所有文件！
    },
    external_directory: {
      '**/packages/shared/sdk/**': 'allow',  // ← 允许访问 packages/shared/sdk
      '**/demos/**': 'allow',
    },
  },
};
```

`read: { '*': 'allow' }` 允许 AI 读取所有文件，`external_directory` 甚至显式允许访问 `packages/shared/sdk`。这与"AI 只能访问临时工作空间"的隔离要求直接矛盾。

---

### 2.4 问题四：路径安全验证不完整

#### 证据 1：validateFileAccess 只验证文件名，不验证路径范围

**文件**：[session-guard.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/agent-service/src/session/session-guard.ts) L8-L28

```typescript
const ALLOWED_FILES = ['index.tsx', 'config.schema.json', 'AGENTS.md', '.session.json'];

export function validateFileAccess(workingDir: string, filePath: string): FileValidationResult {
  const relativePath = path.relative(workingDir, filePath);
  const isAllowed = ALLOWED_FILES.some(
    (allowed) => relativePath === allowed || relativePath.endsWith('/' + allowed)
  );
  if (!isAllowed) {
    violations.push(`非法访问：${relativePath}`);
  }
}
```

**问题**：
1. `ALLOWED_FILES` 列表不包含 `project.config.schema.json`、`.demo.json` 等多 Demo 架构新增的文件
2. 只验证文件名是否在允许列表中，**不验证路径是否在工作空间内**
3. 如果 AI 请求访问 `/Users/.../packages/web/src/.../index.tsx`，只要文件名是 `index.tsx`，就会被允许

#### 证据 2：validatePath 函数存在但未被文件操作处理器调用

**文件**：[session-guard.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/agent-service/src/session/session-guard.ts) L70-L95

```typescript
export function validatePath(workingDir: string, targetPath: string): FileValidationResult {
  const resolvedPath = resolveWorkspacePath(workingDir, targetPath);
  if (!isPathInsideWorkspace(resolvedPath, workingDir)) {
    violations.push(`路径遍历攻击检测: ${targetPath} 尝试访问工作空间外目录`);
  }
  // ... 符号链接检测 ...
}
```

`validatePath` **确实有**路径遍历检测逻辑，但它**没有被 `handleWriteOperation` / `handleReadOperation` 调用**。路径验证和文件操作之间缺少集成。

---

### 2.5 问题五：agent-service 工作空间创建时未注入 .opencode 配置

#### 证据：agent-service 的 WorkspaceManager 只创建空目录

**文件**：[workspace-manager.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/agent-service/src/workspace/workspace-manager.ts) L54-L68

```typescript
private async createTempWorkspace(backend: string): Promise<string> {
  const workspaceName = generateTempWorkspaceName(backend);
  const workspacePath = path.join(tempDir, workspaceName);
  await fs.promises.mkdir(workspacePath, { recursive: true });
  // ← 只创建空目录，不注入 .opencode 配置！
  return workspacePath;
}
```

而前端的 `injectOpencodeAgentConfig`（[workspace-manager.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/web/src/lib/workspace-manager.ts) L28-L127）会注入 `.opencode/agents/demo-generator.md` 提示词，但**只在 web 端的 `createWorkspace` 流程中调用**。

如果 AI 通过 agent-service 的 API 创建工作空间，**没有注入 demo-generator 提示词**，导致 AI 不知道应该修改什么文件。

---

## 3. 解决方案

### 方案 A：修复 workingDir 传递链（紧急，解决目录认知错误）

#### A1：修复 get_models 场景的硬编码 process.cwd()

**文件**：[websocket.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/agent-service/src/routes/websocket.ts) L647-L656

```typescript
// ❌ 当前代码
const config: AgentConfig = {
  sessionId,
  backend: "opencode",
  workingDir: process.cwd(),
};

// ✅ 修复后
const config: AgentConfig = {
  sessionId,
  backend: "opencode",
  workingDir: message.workingDir || process.cwd(),
};
```

前端需要修复两处 `get_models` 发送逻辑，携带 `workingDir`：

**文件 1**：[use-chat-models.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/web/src/components/ai-elements/chat/hooks/use-chat-models.ts) L52

```typescript
// ❌ 当前代码
ws.send(JSON.stringify({ type: "get_models" }));

// ✅ 修复后
ws.send(JSON.stringify({ type: "get_models", workingDir }));
```

同时 `useChatModels` hook 需要接收 `workingDir` 参数：

```typescript
// ❌ 当前代码
interface UseChatModelsOptions {
  agentSessionId: string;
  onSessionChange?: () => void;
}

// ✅ 修复后
interface UseChatModelsOptions {
  agentSessionId: string;
  workingDir?: string;
  onSessionChange?: () => void;
}
```

**文件 2**：[stream-service.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/web/src/components/ai-elements/chat/services/stream-service.ts) L141-145

```typescript
// ❌ 当前代码
requestModels(): void {
  ws.send(JSON.stringify({ type: "get_models" }));
}

// ✅ 修复后
requestModels(workingDir?: string): void {
  ws.send(JSON.stringify({ type: "get_models", workingDir }));
}
```

**文件 3**：[ai-chat.tsx](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/web/src/components/ai-elements/ai-chat.tsx) L97

```typescript
// ❌ 当前代码
} = useChatModels({ agentSessionId });

// ✅ 修复后
} = useChatModels({ agentSessionId, workingDir });
```

#### A2：在 OpenCodeAcpBackend 中添加 workingDir 缺失警告

**文件**：[opencode-acp.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/agent-service/src/backends/opencode-acp.ts) L36, L64

```typescript
// ❌ 当前代码
this.connection = new AcpConnection("opencode", this.config.workingDir || process.cwd());

// ✅ 修复后：缺失时记录警告而非抛异常（避免阻断 get_models 等非关键路径）
const workingDir = this.config.workingDir;
if (!workingDir) {
  logger.warn("[OpenCode ACP Backend] workingDir is not set, falling back to process.cwd() — AI may see incorrect directory");
}
this.connection = new AcpConnection("opencode", workingDir || process.cwd());
```

### 方案 B：强化 AI 代理提示词（重要，解决文件认知错误）

#### B1：在 demo-generator.template.md 中添加文件系统可见范围约束

在"禁止行为"部分添加：

```markdown
## 禁止行为（补充）

- ❌ 访问当前工作空间目录外的任何文件（包括上级目录、packages/、node_modules/ 等）
- ❌ 访问或修改 `packages/agent-service`、`packages/web`、`packages/shared` 等目录
- ❌ 询问用户"要修改哪个文件"，你应该根据以下规则自主判断
```

#### B2：在提示词中明确文件修改决策逻辑

```markdown
## 文件修改决策规则

当用户请求修改界面时，按以下规则判断要修改哪个文件：

1. **样式修改**（颜色、大小、布局等）→ 修改 `demos/{demoId}/index.tsx`
2. **配置项修改**（添加/删除/修改配置字段）→ 修改 `demos/{demoId}/config.schema.json`
3. **组件结构修改**（添加按钮、卡片等）→ 修改 `demos/{demoId}/index.tsx`
4. **项目级共享配置**（Logo、品牌色等）→ 修改 `project.config.schema.json`
5. **创建新页面** → 在 `demos/` 下创建新目录，含 `index.tsx` + `config.schema.json` + `.demo.json`

**不要询问用户要修改哪个文件，直接执行。**
```

#### B3：修复 permission-config.ts 的权限配置

```typescript
// ❌ 当前代码
edit: {
  '*': 'deny',
  'index.tsx': 'allow',
  'config.schema.json': 'allow',
  'AGENTS.md': 'allow',
},
read: {
  '*': 'allow',
  '*.env': 'deny',
  '*.env.*': 'deny',
},
external_directory: {
  '**/packages/shared/sdk/**': 'allow',
  '**/demos/**': 'allow',
},

// ✅ 修复后
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
external_directory: {},  // 清空，不允许访问工作空间外的目录
```

**说明**：`read: { '*': 'allow' }` 保留（工作空间内文件 AI 需要读取），仅清除 `external_directory`（阻止 AI 访问 `packages/shared/sdk` 等工作空间外目录）。同时补充 `edit` 权限中缺失的 `project.config.schema.json` 和 `.demo.json`。

#### B4：更新 AGENTS_MD_TEMPLATE 适配多 Demo 架构

当前 `AGENTS_MD_TEMPLATE`（[permission-config.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/web/src/lib/templates/permission-config.ts) L32-58）仍引用旧的单 Demo 结构（"你只能修改以下文件：index.tsx, config.schema.json, AGENTS.md"），需更新为多 Demo 架构描述。

### 方案 C：修复路径安全验证（中期）

#### C1：更新 ALLOWED_FILES 列表，适配多 Demo 架构

**文件**：[session-guard.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/agent-service/src/session/session-guard.ts) L3

```typescript
// ❌ 当前代码
const ALLOWED_FILES = ['index.tsx', 'config.schema.json', 'AGENTS.md', '.session.json'];

// ✅ 修复后
const ALLOWED_FILES = [
  'index.tsx',
  'config.schema.json',
  'project.config.schema.json',
  '.demo.json',
  'AGENTS.md',
  '.session.json',
];
```

#### C2：在 validateFileAccess 中集成路径范围验证

```typescript
export function validateFileAccess(workingDir: string, filePath: string): FileValidationResult {
  const violations: string[] = [];

  // 1. 验证路径在工作空间内（复用已有的 validatePath 逻辑）
  const pathValidation = validatePath(workingDir, filePath);
  if (!pathValidation.valid) {
    violations.push(...pathValidation.violations);
  }

  // 2. 验证文件名在允许列表中
  const relativePath = path.relative(workingDir, filePath);
  const isAllowed = ALLOWED_FILES.some(
    (allowed) => relativePath === allowed || relativePath.endsWith('/' + allowed)
  );
  if (!isAllowed) {
    violations.push(`非法访问：${relativePath}`);
  }

  return { valid: violations.length === 0, violations };
}
```

#### C3：在 handleWriteOperation / handleReadOperation 中调用验证

**文件**：[connection.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/agent-service/src/acp/connection.ts)

```typescript
private async handleWriteOperation(params: { path: string; content: string; sessionId?: string }): Promise<void> {
  const resolvedPath = this.resolveWorkspacePath(params.path);
  const validation = validateFileAccess(this.workingDir, resolvedPath);
  if (!validation.valid) {
    logger.warn({ path: params.path, violations: validation.violations }, "File operation blocked by security policy");
    return;
  }
  // ... 原有逻辑
}
```

### 方案 D：改善超时与反馈机制（中期，解决卡住问题）

#### D1：缩短 WebSocket 层超时时间

**文件**：[websocket.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/agent-service/src/routes/websocket.ts) L109

```typescript
// ❌ 当前代码
const MESSAGE_TIMEOUT_MS = 600000; // 10 分钟

// ✅ 修复后
const MESSAGE_TIMEOUT_MS = 300000; // 5 分钟
```

**说明**：3 分钟对复杂文件操作可能过短，5 分钟是更合理的平衡点。

#### D2：前端添加客户端超时兜底

**文件**：[stream-service.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/web/src/components/ai-elements/chat/services/stream-service.ts)

```typescript
private messageTimeoutId?: ReturnType<typeof setTimeout>;

sendMessage(message: string, workingDir?: string): void {
  // ... existing code ...

  this.messageTimeoutId = setTimeout(() => {
    this.handlers.onError?.({
      message: 'AI 响应超时，请重试',
      code: 'CLIENT_TIMEOUT',
    });
    this.close();
  }, 120000); // 2 分钟客户端超时
}

// 收到任何消息时清除超时
private handleAnyMessage(): void {
  if (this.messageTimeoutId) {
    clearTimeout(this.messageTimeoutId);
    this.messageTimeoutId = undefined;
  }
}
```

#### D3：修复 ACP 文件操作通知缺失问题

1. 在 `handleWriteOperation` 中，当 `content` 缺失时，主动读取文件内容补充
2. 在 `detectFileChangesAfterEdit` 中，使用 `fs.readFile` 读取变更后的文件内容并发出事件

### 方案 E：确保 .opencode 配置正确注入（中期）

#### E1：在 agent-service 的 WorkspaceManager 中注入配置

**文件**：[workspace-manager.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/agent-service/src/workspace/workspace-manager.ts) L28-L52

将 `injectOpencodeAgentConfig` 逻辑迁移到 `packages/shared` 或 `packages/agent-service`，确保工作空间创建时无论通过哪个入口都能正确注入配置。

---

## 4. 相关代码路径

### 4.1 workingDir 传递链

| 文件 | 行号 | 说明 |
|:-----|:-----|:-----|
| `packages/web/src/app/projects/[id]/edit/page.tsx` | L199-L202 | 传入 `workingDir={sessionInfo.tempWorkspace}` |
| `packages/web/src/components/ai-elements/ai-chat.tsx` | L107-L110 | AIChat 传递 workingDir 到 useChatStream |
| `packages/web/src/components/ai-elements/chat/hooks/use-chat-stream.ts` | L381, L394 | 传递 workingDir 到 StreamService 和 HTTP fallback |
| `packages/web/src/components/ai-elements/chat/services/stream-service.ts` | L111-L118 | sendMessage 将 workingDir 放入 WebSocket payload |
| `packages/agent-service/src/routes/websocket.ts` | L311-L322 | 正常场景接收 message.workingDir |
| `packages/agent-service/src/routes/websocket.ts` | **L651-L656** | **get_models 硬编码 `process.cwd()` 的 bug** |
| `packages/agent-service/src/core/agent-manager.ts` | L52-L57 | 使用 workingDir 创建 Agent |
| `packages/agent-service/src/backends/opencode-acp.ts` | L37, L64 | `workingDir \|\| process.cwd()` 回退逻辑 |
| `packages/agent-service/src/acp/connection.ts` | L151-L155 | 使用 workingDir 作为子进程 cwd |

### 4.2 超时与反馈机制

| 文件 | 行号 | 说明 |
|:-----|:-----|:-----|
| `packages/agent-service/src/routes/websocket.ts` | L28, L437-L457 | `MESSAGE_TIMEOUT_MS = 600000`（10 分钟） |
| `packages/agent-service/src/core/backend-agent.ts` | L80-L83 | `cancel()` 调用 `cancelPrompt()` + 翻转 busy |
| `packages/agent-service/src/acp/connection.ts` | L88-L92 | `promptTimeoutMs = 300000`（5 分钟） |
| `packages/agent-service/src/acp/connection.ts` | L521-L537 | `resetSessionPromptTimeouts()` 每次收到更新重置 |
| `packages/agent-service/src/acp/connection.ts` | L539-L562 | `startPromptKeepalive()` 每 60 秒重置 |
| `packages/agent-service/src/acp/connection.ts` | L740-L758 | `cancelPrompt()` 发送 SESSION_CANCEL |

### 4.3 提示词与权限配置

| 文件 | 说明 |
|:-----|:-----|
| `packages/web/src/lib/agent-prompts/demo-generator.template.md` | AI 代理系统提示词模板（已含多 Demo 结构） |
| `packages/web/src/lib/templates/permission-config.ts` | opencode 权限配置模板（read: '*': 'allow' 有问题） |
| `packages/web/src/lib/workspace-manager.ts` | `injectOpencodeAgentConfig()` 实现位置 |
| `packages/agent-service/src/workspace/workspace-manager.ts` | agent-service 的 WorkspaceManager，**未注入 .opencode 配置** |

### 4.4 安全验证路径

| 文件 | 行号 | 说明 |
|:-----|:-----|:-----|
| `packages/agent-service/src/session/session-guard.ts` | L3 | `ALLOWED_FILES` 列表缺少多 Demo 新增文件 |
| `packages/agent-service/src/session/session-guard.ts` | L8-L28 | `validateFileAccess` 只验证文件名，不验证路径范围 |
| `packages/agent-service/src/session/session-guard.ts` | L70-L95 | `validatePath` 有路径遍历检测，但未被文件操作调用 |
| `packages/agent-service/src/workspace/utils.ts` | L63-L70 | `isPathInsideWorkspace()` 路径范围检测工具函数 |

---

## 5. 建议实施顺序

### 紧急（立即）

1. **修复 `websocket.ts` L651-L656 的硬编码 `process.cwd()`** — 这是导致 AI 看到错误目录的最直接原因
2. **前端 `requestModels()` 携带 `workingDir`** — 配合上述修复

### 短期（本周）

3. **在 `OpenCodeAcpBackend` 中添加 `workingDir` 必填校验** — 防止回退到 process.cwd()
4. **强化 `demo-generator.template.md` 提示词** — 添加文件系统可见范围约束和文件修改决策规则
5. **修复 `permission-config.ts` 的 read 权限** — 从 `'*': 'allow'` 改为仅允许工作空间内文件
6. **缩短 WebSocket 层超时时间** — 从 10 分钟缩短到 3 分钟
7. **更新 `ALLOWED_FILES` 列表** — 添加 `project.config.schema.json`、`.demo.json`

### 中期（2 周内）

8. **前端添加客户端超时兜底** — 2 分钟无响应自动提示
9. **在 `validateFileAccess` 中集成路径范围验证** — 复用已有的 `validatePath` 逻辑
10. **在 `handleWriteOperation`/`handleReadOperation` 中调用路径验证**
11. **在 agent-service 的 WorkspaceManager 中注入 `.opencode` 配置**
12. **修复 ACP 文件操作通知缺失问题** — content 缺失时主动读取，edit 工具后检测变更

---

## 6. 补充说明

### 6.1 为什么 AI 能看到 packages/web、packages/agent-service

AI 回复中提到"当前目录 agent-service 是一个后端服务包"和"需要在 packages/web 包中进行修改"，说明 AI 认为自己的工作目录是 `packages/agent-service`。根因是 `get_models` 场景硬编码 `process.cwd()`，以及 `OpenCodeAcpBackend` 的 `workingDir || process.cwd()` 回退逻辑。

### 6.2 为什么 AI 不知道要修改 index.tsx

虽然提示词已描述了工作空间结构，但缺少两个关键约束：
1. **文件系统可见范围限制**：AI 不知道自己只能访问工作空间内的文件
2. **文件修改决策规则**：AI 不知道"样式修改→index.tsx，配置修改→config.schema.json"的映射关系

此外，如果工作空间通过 agent-service 创建（而非 web 端），`.opencode/agents/demo-generator.md` 提示词可能未被注入。

### 6.3 多 Demo 页面支持的影响

当前系统已支持多 Demo 页面架构（详见[项目多Demo页面支持方案.md](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/docs/plans/进行中/项目多Demo页面支持方案.md)），这意味着：

- AI 的工作空间包含 `demos/` 子目录，而非根目录下的 `index.tsx`
- AI 可以通过自然语言创建新页面（在 `demos/` 下创建新目录）
- AI 需要管理项目级配置 `project.config.schema.json`
- `ALLOWED_FILES` 和路径验证逻辑需要适配多 Demo 结构

### 6.4 与已有分析文档的关系

- [AI对话区卡顿问题分析.md](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/docs/plans/已完成/AI对话区卡顿问题分析.md) — 已分析前端 timeout 无效、后端 silence-based 超时等问题
- [AI编辑后预览不实时更新问题分析报告.md](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/docs/plans/已完成/AI编辑后预览不实时更新问题分析报告.md) — 已分析 file_operation content 缺失、edit 工具不通知等问题

本报告合并并纠正了上述文档中的部分不准确结论，并新增了工作空间隔离和文件认知问题的分析。

---

*报告完成。本报告仅分析问题，不提供代码修复。*
