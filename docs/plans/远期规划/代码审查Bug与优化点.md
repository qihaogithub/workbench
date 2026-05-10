# 项目代码审查报告：Bug、安全漏洞与优化点

> 审查日期：2026-05-10
> 审查范围：全部 5 个包（author-site、agent-service、viewer-site、shared、agent-client）+ 根配置
> 审查方式：静态代码分析，已验证代码引用准确性

---

## 一、严重 Bug（P0 — 需立即修复）

### 1.1 Git 命令注入漏洞

**文件**: [snapshot-service.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/agent-service/src/session/snapshot-service.ts#L236-L261)

`filePath` 直接拼接到 `execSync` 的 shell 命令中，攻击者可通过构造包含 shell 元字符的文件名执行任意命令。

```typescript
const content = execSync(`git show HEAD:"${filePath}"`, { cwd: workingDir });
execSync(`git add "${filePath}"`, { cwd: workingDir });
execSync(`git reset HEAD "${filePath}"`, { cwd: workingDir });
execSync(`git checkout HEAD -- "${filePath}"`, { cwd: workingDir });
```

**修复建议**: 使用 `execFileSync` 传递参数数组，或对 `filePath` 进行严格转义

---

### 1.2 compiler.ts 中 removeComments 误删字符串中的内容

**文件**: [compiler.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/author-site/src/lib/compiler.ts#L40-L44)

简单正则删除注释，会误删字符串字面量中的 `//` 和 `/* */`。例如 `const url = "https://example.com"` 会被截断为 `const url = "https:`。

```typescript
function removeComments(code: string): string {
  return code
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}
```

**修复建议**: 使用 AST 级别的注释移除（如 `@babel/parser` + `@babel/traverse`），或采用状态机方式跳过字符串/模板字面量

---

### 1.3 Rollback 端点是空操作

**文件**: [agent.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/agent-service/src/routes/agent.ts#L281-L295)

`/api/agent/:sessionId/rollback` 端点不执行任何回滚操作，只是原样返回请求的文件列表。调用方会误以为回滚成功。

```typescript
fastify.post('/api/agent/:sessionId/rollback', async (request, reply) => {
  const { files } = request.body || {};
  return reply.send({
    success: true,
    data: { sessionId, rolledBack: files || [] },
  });
});
```

**修复建议**: 实现真正的文件回滚逻辑，或移除该端点避免误导

---

### 1.4 sendMessage 返回错误错误码

**文件**: [agent-manager.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/agent-service/src/core/agent-manager.ts#L99-L108)

当 Agent 正忙时，错误码为 `AGENT_NOT_INITIALIZED`，但错误消息是 "Agent is currently processing a previous message"。错误码与消息语义不匹配，导致前端错误处理逻辑混乱。

```typescript
if (agent instanceof BackendAgent && agent.isBusy()) {
  return {
    success: false,
    error: {
      code: 'AGENT_NOT_INITIALIZED',
      message: 'Agent is currently processing a previous message',
      retryable: true,
    },
  };
}
```

**修复建议**: 错误码改为 `AGENT_BUSY`

---

### 1.5 cancelPrompt 用 null resolve Promise，类型不匹配

**文件**: [connection.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/agent-service/src/acp/connection.ts#L762-L771)

取消 prompt 时，pending request 被 resolve 为 `null`，但调用方期望 `AcpPromptResult` 类型。下游代码访问 `result.stopReason` 等属性会抛出 TypeError。

```typescript
cancelPrompt(): void {
  for (const [id, request] of this.pendingRequests) {
    if (request.method === ACP_METHODS.SESSION_PROMPT) {
      request.resolve(null);
    }
  }
}
```

**修复建议**: resolve 为符合 `AcpPromptResult` 类型的取消结果对象

---

### 1.6 WebSocket 权限响应未校验 permissionId 是否匹配原始请求

**文件**: [websocket.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/agent-service/src/routes/websocket.ts#L225-L237)

`handlePermissionResponse` 监听所有 `permission_response` 消息，仅检查 `message.permissionId` 是否存在（truthy），但未校验该 permissionId 是否匹配当前待审批的权限请求。多个并发权限请求时，后到的响应可能错误地 resolve 前一个请求的 Promise。

```typescript
if (message.type === "permission_response" && message.permissionId) {
  socket.off("message", handlePermissionResponse);
  resolve({ optionId: message.optionId });
}
```

**修复建议**: 校验 `message.permissionId` 是否与当前请求的 `permissionId` 匹配

---

### 1.7 compiler-client.ts 缓存 key 碰撞风险

**文件**: [compiler-client.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/author-site/src/lib/compiler-client.ts#L15-L17)

客户端编译缓存 key 仅使用 `code.length` + 前 200 字符，不同代码如果长度相同且前 200 字符相同就会产生缓存碰撞，返回错误的编译结果。

```typescript
function getCacheKey(code: string): string {
  return `${code.length}_${code.slice(0, 200)}`;
}
```

**修复建议**: 使用完整代码的 hash（如 MD5/SHA256）作为缓存 key

---

### 1.8 verifyUserPassword 返回硬编码 createdAt

**文件**: [user.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/author-site/src/lib/user.ts#L56-L68)

`verifyUserPassword` 返回的 `createdAt: 0` 是硬编码错误值，导致登录后用户信息中的创建时间始终为 0。

```typescript
return { id: row.id, username: row.username, createdAt: 0 };
```

**修复建议**: 从数据库读取真实的 `created_at` 字段

---

### 1.9 登录接口错误码使用不当

**文件**: [login/route.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/author-site/src/app/api/auth/login/route.ts#L19-L23)

用户名或密码错误返回 `VALIDATION_ERROR` 而非 `UNAUTHORIZED`，HTTP status code 是 401 但 error code 是 `VALIDATION_ERROR`，语义不一致。客户端难以区分是输入验证错误还是认证失败。

```typescript
if (!user) {
  return NextResponse.json(
    createApiError("VALIDATION_ERROR", "用户名或密码错误"),
    { status: 401 },
  );
}
```

**修复建议**: 使用 `UNAUTHORIZED` 错误码，保持语义一致

---

## 二、安全漏洞（P1）

### 2.1 JWT 密钥硬编码默认值

**文件**: [jwt.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/author-site/src/lib/auth/jwt.ts#L4-L5)

JWT 密钥有可预测的默认值 `"change-me-in-production"`，如果生产环境忘记设置 `JWT_SECRET` 环境变量，攻击者可以伪造任意用户的 JWT token。

```typescript
const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "change-me-in-production",
);
```

**修复建议**: 启动时检测并拒绝使用默认密钥，或在未设置时抛出致命错误

---

### 2.2 大量 API 路由缺少认证保护

**文件**: 多个 API 路由文件

以下关键操作没有认证保护：
- `POST /api/demos` — 任何人可以创建项目
- `PATCH/DELETE /api/demos/[id]` — 任何人可以修改/删除项目
- `POST /api/compile` — 任何人可以触发编译
- `POST /api/generate-schema` — 任何人可以生成 schema
- `POST /api/projects/[projectId]/restore` — 任何人可以恢复版本
- `POST /api/ai/chat` — 任何人可以调用 AI 服务（费用飙升风险）
- `GET /api/sessions/[sessionId]/files` — 任何人可读取 session 文件
- `GET /api/sessions/[sessionId]/assets/[filename]` — 任何人可读取 session 资源

**修复建议**: 在 middleware 中扩展 `PROTECTED_API_ROUTES`，或为每个路由添加认证检查

---

### 2.3 Asset 文件名路径遍历风险

**文件**: [fs-utils.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/author-site/src/lib/fs-utils.ts#L834-L844)

`getSessionAssetPath` 直接拼接用户可控的 `filename` 参数到路径中，未校验 `..` 等路径遍历字符。

```typescript
export function getSessionAssetPath(sessionId: string, filename: string): string | null {
  const assetsPath = getSessionAssetsPath(sessionId);
  if (!assetsPath) return null;
  const filePath = path.join(assetsPath, filename);
  if (!fs.existsSync(filePath)) return null;
  return filePath;
}
```

**修复建议**: 对 filename 做白名单校验（仅允许字母数字、`-`、`.`），并验证最终路径在 assets 目录内

---

### 2.4 Session meta PATCH 允许修改 workspaceId

**文件**: [sessions/[sessionId]/meta/route.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/author-site/src/app/api/sessions/[sessionId]/meta/route.ts#L51)

`allowedFields` 包含 `workspaceId`，允许客户端修改 session 关联的 workspaceId，可能导致越权访问其他用户的 workspace。

```typescript
const allowedFields = ["title", "opencodeSessionId", "status", "workspaceId"];
```

**修复建议**: 从 allowedFields 中移除 workspaceId

---

### 2.5 Gemini API Key 暴露在 URL 中

**文件**: [gemini.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/agent-service/src/backends/gemini.ts#L49)

API key 作为 URL 查询参数传递，会被记录在服务器访问日志、代理日志等中，增加泄露风险。

```typescript
const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:streamGenerateContent?key=${this.apiKey}`;
```

**修复建议**: 改用 HTTP Header `x-goog-api-key` 传递 API key

---

### 2.6 iframe sandbox 同时允许 allow-scripts 和 allow-same-origin

**文件**: [PreviewPanel.tsx](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/author-site/components/demo/PreviewPanel.tsx#L444), [viewer-site 页面组件](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/viewer-site/src/app/[projectId]/[demoId]/page.tsx#L17)

`sandbox="allow-scripts allow-same-origin"` 组合实际上几乎等同于没有 sandbox。脚本可以移除 sandbox 属性本身，完全逃逸沙箱限制。两个包中均存在此问题。

```html
<iframe sandbox="allow-scripts allow-same-origin" />
```

**修复建议**: 评估是否可以移除 `allow-same-origin`，或使用 `allow-same-origin` 但不使用 `allow-scripts`（通过 srcdoc 注入代码）

---

### 2.7 next.config.js 缺少安全 HTTP 头

**文件**: [next.config.js](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/author-site/next.config.js)

Next.js 配置中没有设置 `X-Frame-Options`、`Content-Security-Policy`、`X-Content-Type-Options` 等安全头。对于提供 iframe 嵌入和用户生成内容的应用，这些头非常重要。

**修复建议**: 在 next.config.js 中添加 `headers()` 函数配置安全头

---

### 2.8 agent-service 无认证/授权机制

**文件**: [agent.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/agent-service/src/routes/agent.ts), [websocket.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/agent-service/src/routes/websocket.ts), [projects.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/agent-service/src/routes/projects.ts)

所有 HTTP 和 WebSocket 端点都没有认证机制，任何能访问服务的客户端都可以创建/销毁 Agent、发送消息、访问/删除项目。

**修复建议**: 至少添加 API Key 认证或 IP 白名单

---

### 2.9 ALLOWED_FILES 白名单匹配策略不严谨

**文件**: [session-guard.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/agent-service/src/session/session-guard.ts#L5-L25)

`ALLOWED_FILES` 白名单使用 `endsWith` 匹配，任何子目录下的同名文件都会被允许。此外，匹配使用 `'/' + allowed` 而非 `path.sep + allowed`，在 Windows 上可能存在路径分隔符不一致问题。

```typescript
const ALLOWED_FILES = ['index.tsx', 'config.schema.json', 'project.config.schema.json', '.demo.json', 'AGENTS.md', '.session.json'];

const isAllowed = ALLOWED_FILES.some(
  (allowed) => relativePath === allowed || relativePath.endsWith('/' + allowed)
);
```

**修复建议**: 使用 `path.basename()` 精确匹配文件名，或限制匹配深度，或使用 glob 模式

---

### 2.10 生产环境日志泄露敏感信息

**文件**: [fs-utils.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/author-site/src/lib/fs-utils.ts#L104-L172)

`findSessionPath()`、`getSessionMeta()` 等函数包含大量 `console.log` / `console.error`，输出 session ID、文件绝对路径、`.session.json` 完整内容等敏感信息到生产日志。

```typescript
console.log(`[findSessionPath] 查找 session: ${sessionId}`);
console.log(`[findSessionPath] SESSIONS_DIR: ${SESSIONS_DIR}`);
console.log(`[getSessionMeta] .session.json 内容: ${content}`);
console.log(`[getSessionMeta] 解析后的元数据:`, meta);
```

**影响**: 攻击者通过日志可能获取文件路径结构、session 元数据，用于路径遍历攻击或会话劫持。

**修复建议**: 移除所有 `console.log`，或统一使用条件日志库（如 pino，仅保留 debug 级别）

---

### 2.11 postMessage 使用通配符 targetOrigin

**文件**: [PreviewPanel.tsx](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/author-site/components/demo/PreviewPanel.tsx#L173-L181)

`iframe.contentWindow.postMessage()` 使用 `"*"` 作为 targetOrigin，任何窗口都可以接收这个消息，攻击者可能通过恶意 iframe 拦截编译后的代码和配置数据。

```typescript
iframe.contentWindow.postMessage(
  { type: "UPDATE_CODE", code: result.compiledCode, configData: resolvedConfig, cssImports: result.cssImports },
  "*"
);
```

**修复建议**: 使用具体的 origin（如 `window.location.origin`），并在消息处理端验证 `event.origin`

---

## 三、内存泄漏与资源管理（P2）

### 3.1 stderrBuffer 无限增长

**文件**: [connection.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/agent-service/src/acp/connection.ts#L168-L189)

`stderrBuffer` 只追加不清理，长时间运行的 Agent 进程会导致内存持续增长。

```typescript
let stderrBuffer = "";
this.child.stderr?.on("data", (data: Buffer) => {
  stderrBuffer += data.toString();
});
```

**修复建议**: 限制 buffer 最大长度，或定期截断保留最近 N 行

---

### 3.2 心跳定时器永不清理

**文件**: [websocket.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/agent-service/src/routes/websocket.ts#L132)

`setInterval(heartbeat, HEARTBEAT_INTERVAL)` 创建的定时器从未被清理，即使服务器关闭也不会停止。

```typescript
setInterval(heartbeat, HEARTBEAT_INTERVAL);
```

**修复建议**: 保存 interval 引用并在关闭时 `clearInterval`

---

### 3.3 iframe-template.ts 中 Blob URL 未释放

**文件**: [iframe-template.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/author-site/src/lib/iframe-template.ts#L146-L147)

每次更新代码时创建新的 Blob URL，但从未调用 `URL.revokeObjectURL()` 释放旧的 URL，导致内存泄漏。

```typescript
const blob = new Blob([code], { type: 'application/javascript' });
const moduleUrl = URL.createObjectURL(blob);
// 从未调用 URL.revokeObjectURL(moduleUrl)
```

**修复建议**: 在创建新 URL 前 revoke 旧的 URL

---

### 3.4 AcpConnection 子进程泄漏

**文件**: [connection.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/agent-service/src/acp/connection.ts#L855-L881)

`disconnect()` 中调用 `this.child.kill()` 后立即置为 null，没有等待进程真正退出。如果进程未响应 SIGTERM，可能成为僵尸进程。

```typescript
async disconnect(): Promise<void> {
  if (this.child) {
    this.child.kill();
    this.child = null;
  }
}
```

**修复建议**: 使用 SIGTERM 后等待一段时间，必要时使用 SIGKILL

---

### 3.5 AgentStream.close() 未清理事件监听器

**文件**: [client.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/agent-client/src/client.ts#L359-L363)

`close()` 方法没有清理 `eventHandlers` Map，可能导致内存泄漏。

```typescript
close(): void {
  this.autoReconnect = false;
  this.ws?.close();
  this.ws = null;
  // 缺少: this.eventHandlers.clear()
}
```

**修复建议**: 在 close() 中调用 `this.eventHandlers.clear()`

---

### 3.6 MemorySessionStore 无持久化

**文件**: [session-store.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/agent-service/src/session/session-store.ts#L38-L98)

会话数据完全存储在内存中，服务重启后所有会话信息丢失。

**修复建议**: 考虑将关键会话元数据持久化到文件或数据库

---

## 四、竞态条件与状态同步（P3）

### 4.1 saveEditSession 原子性不足

**文件**: [session-manager.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/author-site/src/lib/session-manager.ts#L303-L428)

多步文件操作没有事务保护，如果中间步骤失败会导致数据不一致。

```typescript
fs.cpSync(workspacePath, snapshotPath, { ... });  // 步骤 1
fs.rmSync(workspacePath, { ... });                 // 步骤 2
fs.cpSync(sourcePath, workspacePath, { ... });     // 步骤 3
```

**修复建议**: 使用临时目录 + 原子替换模式

---

### 4.2 compile 路由中 lockedDependencies 竞态写入

**文件**: [compile/route.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/author-site/src/app/api/compile/route.ts#L74-L81)

后台异步写入 `lockedDependencies` 时，先读取 project 再写入，没有加锁。多个并发编译请求可能导致后写入的覆盖先写入的更新。

```typescript
resolveDependencyVersions(unresolvedDeps).then((newLocks) => {
  if (Object.keys(newLocks).length > 0) {
    project.lockedDependencies = { ...existingLocks, ...newLocks };
    writeProjectMeta(projectId, project);
  }
});
```

**修复建议**: 使用文件锁或串行化写入

---

### 4.3 cleanupIdleAgents 中的竞态条件

**文件**: [agent-manager.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/agent-service/src/core/agent-manager.ts#L135-L153)

清理空闲 Agent 时使用 `void` 忽略 `agent.kill()` 的 Promise，`agents.delete()` 在 `.then()` 回调中执行。在 kill 完成前，其他代码可能仍在访问该 agent，且 `cleaned` 计数不准确。

```typescript
if (isIdle && agent.status !== 'processing') {
  void agent.kill().then(() => {
    this.agents.delete(sessionId);
  });
  cleaned++;
}
```

**修复建议**: 先标记 agent 为 "destroying" 状态阻止后续操作，并改为 `await agent.kill()` 或使用 `Promise.allSettled()` 收集结果

---

### 4.4 saveProjectChanges 无文件锁

**文件**: [project-workspace-manager.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/agent-service/src/workspace/project-workspace-manager.ts#L330-L403)

读取项目元数据和写回之间没有文件锁保护，并发保存操作可能导致数据丢失。

**修复建议**: 引入文件锁或操作队列

---

### 4.5 BackendAgent.cancel() 无条件设置状态为 ready

**文件**: [backend-agent.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/agent-service/src/core/backend-agent.ts#L80-L84)

`cancel()` 无论 agent 当前处于什么状态，都强制设置为 'ready'。如果 agent 处于 'error' 状态，取消操作不应该将其恢复为 'ready'。

```typescript
cancel(): void {
  this.backend.cancelPrompt?.();
  this.busy = false;
  this.setStatus('ready');
}
```

**修复建议**: 仅在 `busy` 状态时设置为 'ready'，error 状态保持不变

---

### 4.6 useChatMessages 受控/非受控模式引用更新不一致

**文件**: [use-chat-messages.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/author-site/src/components/ai-elements/chat/hooks/use-chat-messages.ts#L36-L126)

`setMessages`、`setCurrentMessage` 等在受控模式下通过 ref 持有旧值但使用不同方式更新。`messagesRef` 在受控模式下追踪 `externalMessages`，但 `setMessages` 内部先读取 ref 再写 ref，如果外部状态更新与此操作并发，可能导致覆盖丢失。

```typescript
const setMessages = useCallback(
  (updater) => {
    if (isMessagesControlled) {
      const prev = messagesRef.current || [];
      const newMessages = typeof updater === "function" ? updater(prev) : updater;
      messagesRef.current = newMessages;
      onMessagesChange?.(newMessages);
    } else { ... }
  },
  [isMessagesControlled, onMessagesChange],
);
```

**影响**: 在快速连续调用场景（如流式消息更新）中，可能出现消息丢失或重复。

**修复建议**: 在受控模式下，函数式更新应该基于外部回调提供的值，而非内部 ref

---

### 4.7 useChatStream 会话切换时可能的竞态条件

**文件**: [use-chat-stream.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/author-site/src/components/ai-elements/chat/hooks/use-chat-stream.ts#L130-L147)

会话切换时的清理 effect 中，`handleSend` 是一个 `useCallback`，其闭包中的 `sessionId` 来自依赖数组。但 effect 清理和 callback 执行之间可能存在时序问题：旧会话的流事件可能在清理后才到达。

```typescript
useEffect(() => {
  if (streamServiceRef.current?.isActive && streamSessionIdRef.current &&
      streamSessionIdRef.current !== sessionId) {
    streamServiceRef.current.close();
    streamSessionIdRef.current = "";
    stopSilenceTracking();
    setIsStreaming(false);
    // ...
  }
}, [sessionId, ...]);
```

**影响**: 流式消息可能更新到错误会话的界面。

**修复建议**: 在事件处理回调中增加 sessionId 校验，确保只处理当前会话的事件

---

## 五、性能问题（P4）

### 5.1 findSessionPath / findWorkspacePath 全目录递归扫描

**文件**: [fs-utils.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/author-site/src/lib/fs-utils.ts#L104-L172)

`findSessionPath` 遍历 3 层嵌套目录（用户 → 项目 → 会话）+ 读取每个 `.session.json` 文件，`findWorkspacePath` 遍历 2 层。在最坏情况下时间复杂度为 O(用户数 × 项目数 × 会话数)，且被 `getSessionPath()`、`sessionExists()`、`getSessionMeta()` 等多个高频函数间接调用。每次 API 调用都触发全量扫描。

**修复建议**: 引入 session/workspace 路径索引缓存（如 `.index.json`），查找从 O(N×M×K) 降到 O(1)

---

### 5.2 大量同步文件系统操作在 API 路由中使用

**文件**: fs-utils.ts, session-manager.ts, workspace-manager.ts

所有文件操作都使用 `fs.readFileSync`、`fs.writeFileSync`、`fs.readdirSync` 等同步 API，在 Next.js API 路由中阻塞 Node.js 事件循环，高并发下严重影响性能。

**修复建议**: 逐步将关键路径上的同步 I/O 替换为异步版本（`fs.promises.readFile`、`fs.promises.writeFile` 等），特别是在 API 路由调用路径上

---

### 5.3 残留大量 console.log 调试日志

**文件**: [fs-utils.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/author-site/src/lib/fs-utils.ts#L104-L172), [compiler.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/author-site/src/lib/compiler.ts#L128-L151), [PreviewPanel.tsx](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/author-site/components/demo/PreviewPanel.tsx)

`findSessionPath` 中有 10+ 处 `console.log`，`getSessionMeta` 会打印 `.session.json` 完整内容（可能包含敏感信息），`rewriteImportsToCdn` 中有多处 `console.log`，`PreviewPanel.tsx` 中有约 16 处 `console.log`。

**修复建议**: 移除所有调试日志，或替换为可控的 logger

---

### 5.4 scanDirectory 将所有文件内容读入内存

**文件**: [snapshot-service.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/agent-service/src/session/snapshot-service.ts#L72-L106)

`createFileSnapshot` 将工作空间中所有文件的完整内容读入内存中的 Map，大型项目可能导致显著内存占用。

```typescript
const content = await fs.promises.readFile(fullPath, 'utf-8');
files.set(relativePath, { content, mtime: stat.mtimeMs });
```

**修复建议**: 使用文件 hash 代替完整内容，仅在需要 diff 时读取内容

---

### 5.5 compiler.ts 缓存淘汰策略过于简单

**文件**: [compiler.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/author-site/src/lib/compiler.ts#L193-L198)

编译缓存使用 FIFO 淘汰策略，不是最优的缓存淘汰算法。LRU 会更好，因为最近编译的代码更可能被再次编译。

```typescript
if (compileCache.size >= MAX_CACHE_SIZE) {
  const firstKey = compileCache.keys().next().value;
  if (firstKey !== undefined) {
    compileCache.delete(firstKey);
  }
}
```

**修复建议**: 改用 LRU 缓存淘汰策略

---

### 5.6 opencode-http.ts 模型信息缓存永不失效

**文件**: [opencode-http.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/agent-service/src/backends/opencode-http.ts#L441-L482)

`modelInfoCache` 一旦填充就永不刷新，如果 OpenCode Server 上的模型列表变化，缓存永远返回过期数据。

**修复建议**: 添加 TTL（如 5-10 分钟），过期后重新请求

---

### 5.7 Schema 冲突校验每次 PUT 都读取所有页面

**文件**: [sessions/[sessionId]/files/[demoId]/route.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/author-site/src/app/api/sessions/[sessionId]/files/[demoId]/route.ts#L176-L209)

每次保存页面 schema 时，都会读取 workspace 下所有页面的 `config.schema.json` 来做冲突校验，页面数量较多时产生大量文件 I/O。

**修复建议**: 缓存 workspace 下的 schema 信息，仅在文件变更时失效

---

### 5.8 编译请求无防抖

**文件**: [PreviewPanel.tsx](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/author-site/components/demo/PreviewPanel.tsx#L211-L281)

`code` 变化时立即触发编译 API 请求，无防抖（debounce）处理。快速连续修改代码时会发送大量编译请求，频繁网络请求和编译计算，浪费资源。

**修复建议**: 添加 300-500ms 的防抖延迟，减少不必要的编译请求

---

## 六、类型系统与接口一致性（P5）

### 6.1 shared 包 index.ts 与 types.ts 类型定义不一致

**文件**: [index.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/shared/src/index.ts) vs [types.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/shared/src/types.ts)

两个文件存在多个同名但定义不一致的接口：

| 接口 | index.ts | types.ts | 差异 |
|------|----------|----------|------|
| `DemoMeta` | 有 `demoCount?` | 无 `demoCount` | 字段缺失 |
| `SessionMeta` | 无 `title?` | 有 `title?` | 字段缺失 |
| `ErrorCode` | `const` 对象（22 个值） | `type` 联合类型（15 个值） | 类型形式和值数量均不同 |

此外，`shared` 和 `agent-service` 各有独立的 `SessionMeta` 类型定义，字段几乎无交集——shared 版本面向前端会话（有 `expiresAt`、`title`、`workspaceId`），agent-service 版本面向后端 Agent 会话（有 `backend`、`workingDir`、`status`）。

**修复建议**: 删除 types.ts 中的重复定义，统一使用 index.ts 作为单一来源；两个包的 SessionMeta 使用接口继承关系明确差异

---

### 6.2 agent-client 与 shared 包同名类型定义不一致

**文件**: [agent-client/src/types.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/agent-client/src/types.ts) vs [shared/src/workspace.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/shared/src/workspace.ts)

两个包独立定义了同名但结构不同的接口：

| 接口 | agent-client | shared | 差异 |
|------|-------------|--------|------|
| `WorkspaceInfo` | 有 `sessionId`, `displayName` | 有 `path`, `type`, `createdAt` | 完全不同 |
| `ErrorCode` | 8 个值 | 15 个值 | 完全不同 |
| `ApiResponse` | `ApiSuccess<T> \| ApiError` | `ApiSuccessResponse<T> \| ApiErrorResponse` | 命名不同 |

**修复建议**: agent-client 应从 shared 包导入共享类型，避免重复定义

---

### 6.3 AgentType 的 string 联合类型形同虚设

**文件**: [types.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/agent-client/src/types.ts#L1)

`AgentType = 'opencode' | 'claude' | 'codex' | 'gemini' | string` 等价于 `string`，完全失去了类型约束的意义。

```typescript
export type AgentType = 'opencode' | 'claude' | 'codex' | 'gemini' | string;
```

**修复建议**: 移除末尾的 `| string`，或使用泛型约束

---

### 6.4 isDemoFolder 基于命名约定的脆弱类型守卫

**文件**: [workspace.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/shared/src/workspace.ts#L93-L95)

`isDemoFolder` 通过 `item.id.startsWith("folder_")` 判断节点类型，基于命名约定而非结构化判断，非常脆弱。

```typescript
export function isDemoFolder(item: DemoPageItem): item is DemoFolderMeta {
  return item.id.startsWith("folder_");
}
```

**修复建议**: 在类型中增加 `type: 'folder' | 'page'` 判别字段

---

## 七、代码质量与设计优化（P6）

### 7.1 fs-utils.ts 文件过大（1500+ 行）

**文件**: [fs-utils.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/author-site/src/lib/fs-utils.ts)

单个文件包含项目元数据、session 管理、workspace 管理、demo 页面管理、文件夹管理、版本管理、asset 管理等多种职责，远超 300 行建议上限。

**修复建议**: 按职责拆分为 `project-fs.ts`、`session-fs.ts`、`workspace-fs.ts`、`demo-page-fs.ts`、`folder-fs.ts`、`version-fs.ts`、`asset-fs.ts`

---

### 7.2 认证逻辑大量重复

**文件**: 几乎所有 API 路由文件

几乎每个 API 路由都有相同的认证检查模式，代码高度重复（出现 20+ 次）：

```typescript
const token = getAuthCookie();
if (!token) {
  return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), { status: 401 });
}
const payload = await verifyToken(token);
if (!payload) {
  return NextResponse.json(createApiError("UNAUTHORIZED", "登录已过期"), { status: 401 });
}
```

**修复建议**: 提取为 `withAuth` 高阶函数或 Next.js 中间件

---

### 7.3 HTTP API 后端代码大量重复

**文件**: [claude.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/agent-service/src/backends/claude.ts), [codex.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/agent-service/src/backends/codex.ts), [gemini.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/agent-service/src/backends/gemini.ts)

三个 HTTP API 后端的 `buildSystemPrompt()`、`parseStreamResponse()`、`destroy()`、`checkHealth()` 等方法高度相似，修改系统提示词时需要同时修改三处。

**修复建议**: 提取为共享基类 `HttpApiBackend`，子类仅覆写差异部分

---

### 7.4 OpenCodeAcpBackend 与 BaseAcpBackend 大量重复

**文件**: [opencode-acp.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/agent-service/src/backends/opencode-acp.ts)

`OpenCodeAcpBackend` 几乎完全复制了 `BaseAcpBackend` 的代码，仅增加了 `ensureModel()` 和 `detectFileChangesAfterEdit()` 两个方法。

**修复建议**: 继承 `BaseAcpBackend` 并覆写必要方法

---

### 7.5 EventBus 定义但从未使用

**文件**: [event-bus.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/agent-service/src/events/event-bus.ts)

`EventBus` 类和 `getEventBus()` 函数已定义，但在整个代码库中没有任何地方使用，属于死代码。

**修复建议**: 删除或在实际场景中使用

---

### 7.6 agent-client 中 request 方法未检查 HTTP 状态码

**文件**: [client.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/agent-client/src/client.ts#L39-L52)

`request` 方法直接对 `response` 调用 `.json()` 而不检查 `response.ok`，非 2xx 响应会被错误地当作 `ApiResponse<T>` 处理。

```typescript
return response.json() as Promise<ApiResponse<T>>;
```

**修复建议**: 添加 `if (!response.ok)` 检查并抛出有意义的错误

---

### 7.7 WebSocket URL 替换逻辑有缺陷

**文件**: [client.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/agent-client/src/client.ts#L190)

`this.baseUrl.replace(/^http/, "ws")` 在 baseUrl 包含 `http` 子串时（如 `http://http-proxy.example.com`）会错误替换。

```typescript
const wsUrl = this.baseUrl.replace(/^http/, "ws");
// "http://http-proxy.example.com" -> "ws://ws-proxy.example.com" (错误！)
```

**修复建议**: 使用 `new URL(baseUrl)` 构造，将 `protocol` 从 `http:` 改为 `ws:`

---

### 7.8 viewer-site 中 WEB_URL 常量重复定义

**文件**: [api.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/viewer-site/src/lib/api.ts#L10), [[projectId]/page.tsx](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/viewer-site/src/app/[projectId]/page.tsx#L5), [[projectId]/[demoId]/page.tsx](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/viewer-site/src/app/[projectId]/[demoId]/page.tsx#L5)

`WEB_URL` 常量在三个文件中重复定义，违反 DRY 原则。

**修复建议**: 统一从 `api.ts` 的 `getWebUrl()` 导出并使用

---

### 7.9 viewer-site URL 参数未编码

**文件**: [api.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/viewer-site/src/lib/api.ts#L31-L34)

`projectId` 直接拼接到 URL 路径中，未使用 `encodeURIComponent`，特殊字符可能导致 URL 解析错误或路径遍历。

```typescript
return fetchApi<ProjectDetailResponse>(
  AGENT_SERVICE_URL,
  `/api/projects/${projectId}`,
);
```

**修复建议**: 使用 `encodeURIComponent(projectId)`

---

### 7.10 mock-api.ts 仍在代码库中

**文件**: [mock-api.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/author-site/src/lib/mock-api.ts)

包含硬编码的模拟数据和内存中的可变状态（`mockDemos.push`），是开发阶段的遗留物，且无其他文件导入它。

**修复建议**: 确认不再使用后删除

---

### 7.11 非流式回退路径代码大量重复

**文件**: [use-chat-stream.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/author-site/src/components/ai-elements/chat/hooks/use-chat-stream.ts#L401-L476)

当 WebSocket 连接失败时，回退到 HTTP 非流式模式的代码与 `onFinish` 回调高度重复：构建 assistantMessage、更新 messages、调用 persistMessages、处理文件变更、fetchSessionFiles 兜底。

**修复建议**: 提取共享的 "完成处理" 函数，减少重复

---

### 7.12 WebSocket 路由代码过长

**文件**: [websocket.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/agent-service/src/routes/websocket.ts)（829 行）

单个文件包含所有 WebSocket 消息处理逻辑，远超 300 行建议。消息处理、事件转发、超时管理等职责混杂。

**修复建议**: 按职责拆分为多个文件：
- 消息类型定义 → `ws-types.ts`
- 事件转发器 → `ws-event-forwarder.ts`
- 连接管理 → `ws-connection-manager.ts`

---

### 7.13 API 路由的 sessionStore 是局部变量

**文件**: [agent.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/agent-service/src/routes/agent.ts#L59)

`sessionStore` 在 `registerAgentRoutes()` 函数内部创建，每次调用都会新建。全局的 `AgentManager` 与会话存储之间缺乏明确的所有权关系。

```typescript
export async function registerAgentRoutes(fastify: FastifyInstance) {
  const manager = getAgentManager();
  const sessionStore = new MemorySessionStore();  // 局部变量
```

**修复建议**: 将会话存储作为模块级单例或注入到函数中

---

### 7.14 无效代码检测逻辑硬编码

**文件**: [PreviewPanel.tsx](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/author-site/components/demo/PreviewPanel.tsx#L91-L102)

`isValidCode()` 函数包含硬编码的路径匹配，`code.includes("\\重要文件\\")` 是环境特定值，不具备通用性。

```typescript
function isValidCode(code: string): boolean {
  return (
    // ...
    !code.match(/^[A-Z]:\\/) &&     // Windows 绝对路径
    !code.includes("\\重要文件\\")  // 硬编码中文路径
  );
}
```

**修复建议**: 移除 `code.includes("\\重要文件\\")` 硬编码检查，仅保留通用的路径格式检测

---

## 八、其他值得注意的问题（P7）

### 8.1 Windows 上 ACP 消息使用 \r\n 可能导致协议解析问题

**文件**: [connection.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/agent-service/src/acp/connection.ts#L587-L588)

在 Windows 上发送消息时使用 `\r\n` 作为行结束符，但 ACP 协议规范要求以 `\n` 分隔。某些 CLI 工具可能不处理 `\r`，导致消息解析失败。

```typescript
const lineEnding = process.platform === "win32" ? "\r\n" : "\n";
```

**修复建议**: 统一使用 `\n`，或在接收端 strip `\r`

---

### 8.2 generateSessionId / generateProjectId 仅使用时间戳，易冲突

**文件**: [project-workspace-manager.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/agent-service/src/workspace/project-workspace-manager.ts#L60-L62), [fs-utils.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/author-site/src/lib/fs-utils.ts#L437)

`generateSessionId` 使用 `session_${Date.now()}`，`createProject` 使用 `proj_${Date.now()}`，同一毫秒内创建多个会话/项目会产生 ID 冲突。

**修复建议**: 添加随机后缀（如 `Date.now()}_${Math.random().toString(36).slice(2)}`）或使用 `crypto.randomUUID()`

---

### 8.3 compareWithSnapshot 使用 entry.parentPath 兼容性问题

**文件**: [snapshot-service.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/agent-service/src/session/snapshot-service.ts#L190)

`entry.parentPath` 是 Node.js 18.17+ 才引入的属性，在 18.0.0 到 18.16.x 中不存在。

```typescript
const fullPath = path.join(entry.parentPath || entry.path, entry.name);
```

**修复建议**: 使用 `path.dirname(path.join(entry.path, entry.name))` 或在 package.json 中将 Node.js 要求提升到 >= 18.17

---

### 8.4 server.ts 缺少 SIGINT 处理器

**文件**: [server.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/agent-service/src/server.ts#L95)

只处理了 `SIGTERM` 信号，未处理 `SIGINT`（Ctrl+C）。开发时按 Ctrl+C 不会触发优雅关闭，子进程可能成为孤儿进程。

**修复建议**: 添加 `process.on('SIGINT', ...)` 处理器

---

### 8.5 AcpApprovalStore 静默忽略 reject_always 决策

**文件**: [approval-store.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/agent-service/src/acp/approval-store.ts#L41-L46)

`put` 方法只存储 `allow_always` 决策，`reject_always` 决策被静默丢弃。用户的拒绝决策不会被记住，每次都会重新询问。

```typescript
put(key: AcpApprovalKey, optionId: string): void {
  if (optionId === 'allow_always') {
    const serialized = serializeKey(key);
    this.map.set(serialized, optionId);
  }
}
```

**修复建议**: 同时存储 `reject_always` 决策

---

### 8.6 schema-generator.ts 正则解析 TypeScript 接口过于脆弱

**文件**: [schema-generator.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/author-site/src/lib/schema-generator.ts#L37-L76)

`extractInterfaceProperties` 使用简单正则解析 TypeScript 接口，无法处理嵌套类型、泛型、多行类型注解、联合类型等复杂情况。

```typescript
const interfacePattern = /interface\s+\w*Props\s*\{([\s\S]*?)\n\}/;
const match = trimmed.match(/^(\w+)(\?)?:\s*(.+?);?\s*$/);
```

**修复建议**: 使用 TypeScript Compiler API 解析接口定义

---

### 8.7 viewer-site 首页使用 "use client" 放弃了 RSC 优势

**文件**: [page.tsx](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/viewer-site/src/app/page.tsx#L1)

项目列表页标记为 `"use client"` 并使用 SWR 客户端获取数据，首屏渲染时会先显示"加载中..."，然后等客户端 JS 加载后才发起请求。使用 RSC 可以在服务端直接获取数据并渲染完整 HTML，显著改善 FCP/LCP。

**修复建议**: 将数据获取逻辑移到服务端组件

---

### 8.8 agent-client WebSocket 重连后不重新发送待处理消息

**文件**: [client.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/agent-client/src/client.ts#L260-L304)

WebSocket 断开并重连成功后，之前通过 `send()` 发送但可能未到达服务器的消息会丢失。`send()` 在未连接时直接报错，不缓存消息。

**修复建议**: 引入消息队列，断线期间缓存消息并在重连后重发

---

### 8.9 AgentStream 重连无指数退避上限

**文件**: [client.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/agent-client/src/client.ts#L246-L293)

WebSocket 重连延迟线性增长但无上限：`this.reconnectDelay * this.reconnectAttempts`（1s, 2s, 3s, 4s, 5s）。虽然最大 5 次重试限制了总等待时间，但若需要在第 5 次之后再失败，没有提供指数退避和更长的重试间隔策略。

**修复建议**: 使用指数退避算法（如 `min(this.reconnectDelay * 2 ** this.reconnectAttempts, 30000)`）

---

### 8.10 turbo.json 缺少 typecheck 和 test 任务配置

**文件**: [turbo.json](file:///e:/重要文件/Programming/1_Work/opencode工作台/turbo.json)

turbo.json 仅配置了 `build`、`dev`、`lint`、`clean` 四个任务，缺少 `typecheck` 和 `test`，尽管 `package.json` 中定义了 `pnpm typecheck` 和 `pnpm test:e2e` 等脚本。

**修复建议**: 添加 `typecheck` 和 `test` 任务配置，利用 Turbo 的缓存加速

---

### 8.11 .gitignore 不完整

**文件**: `.gitignore`（根目录）

未忽略 IDE 临时文件、日志文件等常见开发产物。

**修复建议**: 添加 `.vscode/`、`*.log`、`.env.local`、`coverage/`、`.turbo/` 等忽略规则

---

### 8.12 缺少环境变量文档

代码中引用了多个环境变量但无文档说明：

```typescript
const DATA_DIR = process.env.DATA_DIR || ...
const PROJECTS_DIR = process.env.PROJECTS_DIR || ...
const DEFAULT_MODEL_ID = process.env.DEFAULT_MODEL || "sensenova/deepseek-v4-flash"
const response = await fetch(`${process.env.OPENCODE_SERVER_URL || 'http://localhost:4096'}/models`, ...)
```

**修复建议**: 创建 `.env.example` 文件，列出所有环境变量及其用途和默认值

---

### 8.13 缺少请求限流机制

当前 API 路由（HTTP 和 WebSocket）均无限流保护，可能被滥用。

**修复建议**: 对关键路由（登录、注册、消息发送）添加速率限制

---

### 8.14 缺少请求体大小限制

部分 API 路由未限制请求体大小（如编译接口），可能接收超大 payload。

**修复建议**: 添加合理的请求体大小限制

---

### 8.15 文件操作缺少原子性保证

所有文件写入使用直接覆盖（`writeFileSync`），在写入过程中如果进程崩溃，可能导致文件损坏。

**修复建议**: 临时文件 + 原子重命名模式（先写入 `.tmp` 文件，成功后重命名）

---

### 8.16 代理健康检查端点不完整

`GET /health` 仅报告基本状态，未检查关键依赖（如 Agent 后端进程是否可达）。

**修复建议**: 添加深度健康检查，验证 Agent 后端连接状态

---

## 附录：问题统计与优先级

| 优先级 | 类别 | 数量 | 关键影响 |
|--------|------|------|----------|
| 🔴 P0 | 严重 Bug | 9 | 功能异常、命令注入、数据错误 |
| 🟠 P1 | 安全漏洞 | 11 | 认证缺失、路径遍历、信息泄露 |
| 🟡 P2 | 内存/资源泄漏 | 6 | 长时间运行后崩溃 |
| 🟢 P3 | 竞态条件 | 7 | 偶发性数据不一致 |
| 🔵 P4 | 性能问题 | 8 | 用户体验下降、扩展性差 |
| 🟣 P5 | 类型/接口一致性 | 4 | 跨包协作困难、运行时类型错误 |
| ⚪ P6 | 代码质量/优化 | 14 | 维护成本增加、代码冗余 |
| ⚪ P7 | 其他 | 16 | 兼容性、健壮性、基础设施 |

### 建议优先处理顺序

**第一阶段（P0 — 消除严重 Bug）**:
1. Git 命令注入漏洞（1.1）— 安全红线
2. removeComments 误删字符串（1.2）— 影响所有编译结果
3. Rollback 空操作（1.3）— 功能缺失误导用户
4. 缓存 key 碰撞（1.7）— 可能返回错误编译结果
5. verifyUserPassword 硬编码 createdAt（1.8）— 用户数据错误
6. 登录错误码不当（1.9）— 语义不一致

**第二阶段（P1 — 补全安全防护）**:
7. JWT 密钥默认值（2.1）
8. API 路由认证补全（2.2）
9. 路径遍历修复（2.3）
10. workspaceId 越权（2.4）
11. 日志泄露敏感信息（2.10）
12. postMessage targetOrigin（2.11）

**第三阶段（P2-P3 — 稳定性提升）**:
13. 内存泄漏修复（3.1-3.6）
14. 竞态条件修复（4.1-4.7）

**第四阶段（P4-P7 — 质量与性能优化）**:
15. 性能优化（5.1-5.8）
16. 类型系统统一（6.1-6.4）
17. 代码重构（7.1-7.14）
18. 基础设施完善（8.10-8.16）
