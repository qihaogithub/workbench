## ACP 协议详解

### 1. 什么是 ACP？

**ACP (Agent Client Protocol，智能体客户端协议)** 是由 **Zed Industries** 主导发起的**行业开放标准**，于 **2025 年 9 月** 正式发布，**JetBrains** 也参与了协作开发。它定义了编辑器/IDE（Client）与 AI 编程 Agent（Server）之间的标准通信规范。

> "就像 LSP 把语言智能从单体 IDE 中解放出来，ACP 的目标是让开发者在不换编辑器的情况下自由切换 Agent。"
> —— Zed CEO Nathan Sobo

**官方资源：**
- 🌐 官网：[https://www.jetbrains.com/acp/](https://www.jetbrains.com/acp/)
- 📦 NPM 包：[@zed-industries/agent-client-protocol](https://www.npmjs.com/package/@zed-industries/agent-client-protocol)
- 📖 Zed 文档：[External Agents](https://github.com/zed-industries/zed/blob/main/docs/src/ai/external-agents.md)
- 📝 博客：[Bring Your Own Agent to Zed](https://zed.dev/blog/bring-your-own-agent-to-zed)

### 2. 设计理念

ACP 的设计类比于 **LSP (Language Server Protocol)**：

| 协议 | 创建者 | 解决的问题 |
|------|--------|-----------|
| **LSP** | Microsoft (2016) | 标准化编辑器与语言服务器之间的通信（代码补全、跳转、报错） |
| **ACP** | Zed Industries + JetBrains (2025) | 标准化编辑器与 AI Agent 之间的通信（代码生成、工具调用、权限请求） |

**没有 ACP 时：**
```
N 个编辑器 × M 个 Agent = N×M 套独立集成
```

**有了 ACP 后：**
```
N 个编辑器 + M 个 Agent = N+M 套实现（各自只需实现一次 ACP 接口）
```

### 3. 已支持 ACP 的生态系统

**Agent 端（部分）：**
- Gemini CLI（Google 官方参考实现）
- Claude Agent / Claude Code
- Codex (OpenAI)
- GitHub Copilot
- Cursor
- Mistral Vibe
- OpenCode
- Kimi CLI
- Qwen Code
- Factory Droid
- Cline
- Kiro CLI

**客户端：**
- Zed（原生支持）
- JetBrains IDEs（原生支持）
- Neovim（通过插件）
- **AionUi**（实现了 ACP 客户端）

### 4. 核心通信架构

```
┌─────────────────┐                    ┌─────────────────────┐
│                 │   stdin (JSON)     │                     │
│   AionUi        │ ──────────────────►│   Agent CLI         │
│   (ACP Client)  │                    │   (ACP Server)      │
│                 │ ◄────────────────── │                     │
└─────────────────┘   stdout (JSON)    └─────────────────────┘
```

**关键点：**
- **stdio 通信**：通过子进程的标准输入/输出进行通信
- **JSON-RPC 格式**：每行一个 JSON 消息，以换行符分隔
- **双向通信**：客户端发送请求，Agent 返回响应或通知
- **角色模型**：编辑器是 Client（发起请求），Agent 是 Server（响应请求）

### 5. JSON-RPC 消息类型

从 [acpTypes.ts:637-658](file:///e:\重要文件\Programming\1_Work\opencode工作台\AionUi\src\common\types\acpTypes.ts#L637-L658) 可以看到三种消息类型：

```typescript
// 1. 请求 (Request) - 需要响应
interface AcpRequest {
  jsonrpc: "2.0";
  id: number;        // 请求ID，用于匹配响应
  method: string;    // 方法名，如 "session/prompt"
  params?: Record<string, unknown>;
}

// 2. 响应 (Response) - 对请求的回复
interface AcpResponse {
  jsonrpc: "2.0";
  id: number;        // 对应请求的ID
  result?: unknown;  // 成功结果
  error?: { code: number; message: string; };  // 错误信息
}

// 3. 通知 (Notification) - 单向消息，无需响应
interface AcpNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}
```

### 6. `session/prompt` 方法详解

这是最核心的方法，用于向 Agent 发送用户消息。从 [AcpConnection.ts:1005-1023](file:///e:\重要文件\Programming\1_Work\opencode工作台\AionUi\src\process\agent\acp\AcpConnection.ts#L1005-L1023)：

```typescript
async sendPrompt(prompt: string): Promise<AcpResponse> {
  // 构造 JSON-RPC 请求
  return await this.sendRequest('session/prompt', {
    sessionId: this.sessionId,
    prompt: [{ type: 'text', text: prompt }],
  });
}
```

发送的消息格式：
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "session/prompt",
  "params": {
    "sessionId": "xxx-xxx-xxx",
    "prompt": [{ "type": "text", "text": "你好，请帮我写一个函数" }]
  }
}
```

### 7. 完整通信流程

```
┌──────────────────────────────────────────────────────────────────┐
│                        ACP 通信生命周期                           │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. 启动 CLI 进程                                                │
│     AionUi spawn: npx @zed-industries/claude-agent-acp          │
│                                                                  │
│  2. 初始化协议                                                   │
│     Client → Agent: { "method": "initialize", ... }             │
│     Agent → Client: { "result": { "protocolVersion": 1, ... } } │
│                                                                  │
│  3. 创建会话                                                     │
│     Client → Agent: { "method": "session/new", ... }            │
│     Agent → Client: { "result": { "sessionId": "xxx", ... } }   │
│                                                                  │
│  4. 发送消息 (循环)                                              │
│     Client → Agent: { "method": "session/prompt", ... }         │
│                                                                  │
│     Agent → Client (流式通知):                                   │
│       { "method": "session/update", "params": { ... } }         │
│       { "method": "session/update", "params": { ... } }         │
│       ...                                                        │
│                                                                  │
│     Agent → Client (最终响应):                                   │
│       { "id": 1, "result": { "stopReason": "end_turn" } }       │
│                                                                  │
│  5. 权限请求 (可选)                                              │
│     Agent → Client: { "method": "session/request_permission" }  │
│     Client → Agent: { "id": 2, "result": { "optionId": "allow" }}
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 8. 流式响应机制

从 [AcpConnection.ts:432-458](file:///e:\重要文件\Programming\1_Work\opencode工作台\AionUi\src\process\agent\acp\AcpConnection.ts#L432-L458) 可以看到如何处理流式消息：

```typescript
child.stdout?.on('data', (data: Buffer) => {
  const dataStr = data.toString();
  buffer += dataStr;
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';  // 保留不完整的行

  for (const line of lines) {
    if (line.trim()) {
      const message = JSON.parse(line) as AcpMessage;
      this.handleMessage(message);  // 处理每条消息
    }
  }
});
```

### 9. session/update 通知类型

Agent 会发送各种 `session/update` 通知来更新 UI：

| sessionUpdate 类型 | 说明 |
|-------------------|------|
| `agent_message_chunk` | Agent 回复的文本片段 |
| `agent_thought_chunk` | Agent 的思考过程 |
| `tool_call` | 工具调用开始 |
| `tool_call_update` | 工具调用状态更新 |
| `plan` | 执行计划更新 |
| `usage_update` | Token 使用量更新 |
| `config_option_update` | 配置选项更新 |

### 10. 权限请求流程

当 Agent 需要执行敏感操作时：

```typescript
// Agent 发送权限请求
{
  "method": "session/request_permission",
  "params": {
    "toolCall": {
      "toolCallId": "xxx",
      "title": "Execute Command",
      "rawInput": { "command": "rm -rf /" }
    },
    "options": [
      { "optionId": "allow_once", "name": "Allow Once" },
      { "optionId": "reject_once", "name": "Reject" }
    ]
  }
}

// 用户选择后，客户端返回结果
{
  "id": 3,
  "result": { "optionId": "reject_once" }
}
```

### 11. 支持的 ACP 方法

从 [acpTypes.ts:962-968](file:///e:\重要文件\Programming\1_Work\opencode工作台\AionUi\src\common\types\acpTypes.ts#L962-L968)：

```typescript
export const ACP_METHODS = {
  SESSION_UPDATE: 'session/update',           // 会话更新通知
  REQUEST_PERMISSION: 'session/request_permission',  // 权限请求
  READ_TEXT_FILE: 'fs/read_text_file',        // 读取文件
  WRITE_TEXT_FILE: 'fs/write_text_file',      // 写入文件
  SET_CONFIG_OPTION: 'session/set_config_option',  // 设置配置
};
```

### 12. 进程启动示例

从 [acpConnectors.ts:298-332](file:///e:\重要文件\Programming\1_Work\opencode工作台\AionUi\src\process\agent\acp\acpConnectors.ts#L298-L332)：

```typescript
// 启动 Claude ACP 进程
spawn('npx', [
  '--yes',
  '--prefer-offline',  // 优先使用缓存
  '@zed-industries/claude-agent-acp@0.21.0',
  '--experimental-acp'  // 启用 ACP 模式
], {
  cwd: workingDir,
  stdio: ['pipe', 'pipe', 'pipe'],  // stdin/stdout/stderr 都用管道
  env: cleanEnv,
});
```

### 13. AionUi 的角色

AionUi 是 **ACP 协议的客户端实现者**，而不是协议的创建者。通过实现 ACP 协议，AionUi 可以：

1. **无缝接入** 所有支持 ACP 的 AI Agent
2. **保持一致性** 的用户交互体验
3. **避免重复开发** 每个 Agent 的专属集成

```typescript
// AionUi 使用 Zed Industries 发布的 ACP 桥接包
import { CLAUDE_ACP_NPX_PACKAGE } from '@/common/types/acpTypes';
// 值为: '@zed-industries/claude-agent-acp@0.21.0'
```

### 总结

ACP 协议的核心设计：

| 特性 | 说明 |
|------|------|
| **标准化** | 基于 JSON-RPC 2.0，易于实现和调试 |
| **开放性** | 由 Zed Industries + JetBrains 主导的开源协议 |
| **流式响应** | 通过 `session/update` 通知实现实时 UI 更新 |
| **双向通信** | 支持请求-响应和通知两种模式 |
| **权限控制** | 敏感操作需要用户确认 |
| **进程隔离** | 每个 Agent 运行在独立子进程中，通过 stdio 通信 |

这种设计使得 AionUi 可以统一支持多种 AI Agent 后端，同时保持良好的用户体验和安全性。正如 Zed 博客所言：

> "We believe the best tools come from openness. Just as the Language Server Protocol opened up IDEs to specialized tools, ACP creates space for an ecosystem of agents tailored to every developer's workflow."
