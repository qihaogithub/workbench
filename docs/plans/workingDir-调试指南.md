# workingDir 调试指南

## 已添加的调试日志

### 1. 前端 (AIChat 组件)
**文件**: `packages/web/src/components/ai-elements/ai-chat.tsx`
**日志**: `console.log('[AIChat] Sending message with workingDir:', workingDir)`
**位置**: 发送消息前

### 2. WebSocket 路由
**文件**: `packages/agent-service/src/routes/websocket.ts`
**日志**: 
- `logger.info({ workingDir: message.workingDir }, 'WebSocket message received')`
- `logger.info({ workingDir: config.workingDir }, 'Agent config created')`
**位置**: 接收到消息并创建 Agent 配置时

### 3. Agent Manager
**文件**: `packages/agent-service/src/core/agent-manager.ts`
**日志**: `logger.info({ workingDir: config.workingDir }, 'Agent getOrCreate')`
**位置**: 创建或获取 Agent 实例时

### 4. ACP Connection
**文件**: `packages/agent-service/src/acp/connection.ts`
**日志**: `logger.info({ cwd: this.workingDir, normalizedCwd }, 'Creating ACP session')`
**位置**: 创建 ACP 会话时

### 5. OpenCode 后端
**文件**: `packages/agent-service/src/backends/opencode-acp.ts`
**日志**: `logger.info({ workingDir: this.config.workingDir, finalWorkingDir: workingDir }, 'OpenCode ACP backend starting')`
**位置**: 后端启动时

## 测试步骤

### Step 1: 确认服务已启动
```bash
pnpm dev
```

确保两个服务都在运行:
- Web 前端: http://localhost:3100
- Agent Service: http://localhost:3101

### Step 2: 打开浏览器开发者工具
1. 访问 Demo 编辑页面
2. 打开开发者工具 (F12)
3. 切换到 **Console** 标签
4. 查找 `[AIChat] Sending message with workingDir:` 日志

### Step 3: 发送测试消息
在 AI 对话区输入: "你的工作空间在哪里?"

### Step 4: 检查日志

#### 浏览器控制台 (Console)
应该看到:
```
[AIChat] Sending message with workingDir: <临时目录路径>
```

如果 `workingDir` 是 `undefined`,说明前端没有正确获取到临时工作空间路径。

#### Agent Service 日志
在终端中查看 agent-service 的日志,应该看到:

```
{"workingDir":"<临时目录路径>","level":"info","msg":"WebSocket message received"}
{"workingDir":"<临时目录路径>","level":"info","msg":"Agent config created"}
{"workingDir":"<临时目录路径>","level":"info","msg":"Agent getOrCreate"}
{"cwd":"<临时目录路径>","normalizedCwd":"<标准化路径>","level":"info","msg":"Creating ACP session"}
{"workingDir":"<临时目录路径>","finalWorkingDir":"<最终路径>","level":"info","msg":"OpenCode ACP backend starting"}
```

### Step 5: 验证 AI 回复

如果 workingDir 正确传递,AI 应该回答它的工作空间是临时目录,例如:
```
我的工作空间在: C:\Users\Administrator\AppData\Local\Temp\opencode-workbench\sessions\...
```

而不是项目根目录:
```
E:\重要文件\Programming\1_Work\opencode工作台
```

## 常见问题排查

### 问题 1: 前端 workingDir 为 undefined

**可能原因**:
- Demo 编辑页面没有正确从 API 获取 `tempWorkspace`
- Session 创建时没有返回 `sessionPath`

**排查方法**:
1. 检查 `page.tsx` 中的 `tempWorkspace` 状态
2. 检查 `createEditSession` API 响应
3. 在 Network 标签中查看 API 响应

### 问题 2: WebSocket 消息中没有 workingDir

**可能原因**:
- `AgentStream.send()` 方法没有正确传递
- WebSocket 消息格式不正确

**排查方法**:
1. 在 Network > WS 标签中查看 WebSocket 帧
2. 确认消息体包含 `workingDir` 字段

### 问题 3: Agent Service 收到 workingDir 但 AI 仍然看到项目根目录

**可能原因**:
- ACP 连接没有正确使用 `cwd` 参数
- CLI 子进程启动时没有设置正确的工作目录

**排查方法**:
1. 检查 ACP session/new 请求中的 `cwd` 参数
2. 检查 spawn 选项中的 `cwd` 设置

## 临时工作空间结构

正确的临时工作空间应该包含:

```
{sessionDir}/
├── index.tsx              # React 组件代码
├── config.schema.json     # Demo 配置 Schema
├── .session.json          # Session 元数据
└── .opencode/
    └── agents/
        └── demo-generator.md  # AI Agent 行为规则
```

你可以让 AI 执行以下操作来验证:
- "列出你工作空间中的所有文件"
- "读取 index.tsx 的内容"
- "读取 config.schema.json 的内容"

## 下一步

根据日志输出,确定 workingDir 在哪个断点丢失:

1. **前端未传递**: 检查 Demo 页面和 Session Manager
2. **WebSocket 未接收**: 检查 AgentStream 和 WebSocket 路由
3. **Agent 未使用**: 检查 Backend Agent 和 ACP Connection
4. **CLI 未识别**: 检查 ACP 协议实现和 CLI 参数

完成调试后,可以移除这些日志或将其改为 `debug` 级别。
