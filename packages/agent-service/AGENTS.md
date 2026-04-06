# AGENTS.md — @opencode-workbench/agent-service

> 本文件为 AI 编码代理提供在此包中工作的指南。

## 包概览

`@opencode-workbench/agent-service` 是一个独立的 Agent 服务包，实现了 **ACP (Agent Client Protocol)** 协议，用于与各种 AI Agent CLI 进行标准化通信。

## ACP 协议说明

### 什么是 ACP？

**ACP (Agent Client Protocol，智能体客户端协议)** 是由 **Zed Industries** 主导发起的**行业开放标准**，于 2025 年 9 月正式发布。它定义了编辑器/IDE（Client）与 AI 编程 Agent（Server）之间的标准通信规范。

**官方资源：**
- 🌐 官网：[https://www.jetbrains.com/acp/](https://www.jetbrains.com/acp/)
- 📦 NPM 包：[@zed-industries/agent-client-protocol](https://www.npmjs.com/package/@zed-industries/agent-client-protocol)
- 📖 Zed 文档：[External Agents](https://github.com/zed-industries/zed/blob/main/docs/src/ai/external-agents.md)

### 本包的角色

本包是 **ACP 协议的客户端实现**，负责：
1. 启动 Agent CLI 子进程
2. 通过 stdio 进行 JSON-RPC 通信
3. 管理会话生命周期
4. 处理流式响应和权限请求

## 目录结构

```
src/
├── acp/                    # ACP 协议实现
│   ├── types.ts            # ACP 类型定义（JSON-RPC 消息、会话更新等）
│   ├── connection.ts       # ACP 连接管理（进程通信、消息处理）
│   ├── approval-store.ts   # 权限审批存储（管理 allow_always 决策）
│   ├── model-info.ts       # 模型信息处理（构建和汇总模型信息）
│   └── index.ts            # 模块导出
├── backends/               # Agent 后端适配器
│   ├── base.ts             # 后端适配器基类接口
│   ├── base-acp.ts         # ACP 后端基类
│   ├── claude.ts           # Claude Code 后端
│   ├── codex.ts            # Codex 后端
│   ├── gemini.ts           # Gemini 后端
│   ├── qwen.ts             # Qwen Code 后端
│   ├── goose.ts            # Goose 后端
│   ├── auggie.ts           # Augment Code 后端
│   ├── kimi.ts             # Kimi CLI 后端
│   ├── copilot.ts          # GitHub Copilot 后端
│   ├── qoder.ts            # Qoder CLI 后端
│   ├── vibe.ts             # Mistral Vibe 后端
│   ├── opencode-acp.ts     # OpenCode ACP 后端
│   ├── custom.ts           # 自定义 Agent 后端
│   └── index.ts            # 模块导出
├── core/                   # 核心逻辑
│   ├── agent.ts            # Agent 基类
│   ├── backend-agent.ts    # 后端 Agent 实现
│   ├── agent-factory.ts    # Agent 工厂
│   ├── agent-manager.ts    # Agent 生命周期管理
│   └── types.ts            # 核心类型定义
├── events/                 # 事件系统
│   └── event-bus.ts        # 事件总线
├── routes/                 # HTTP/WebSocket 路由
│   ├── agent.ts            # Agent API 路由
│   ├── websocket.ts        # WebSocket 路由
│   └── index.ts            # 路由注册
├── session/                # 会话管理
│   ├── session-store.ts    # 会话存储
│   └── session-guard.ts    # 会话守卫
├── utils/                  # 工具函数
│   ├── config.ts           # 配置管理
│   └── logger.ts           # 日志工具
└── server.ts               # Fastify 服务器入口

tests/
├── fixtures/
│   └── fake-acp-cli/
│       └── index.js        # 模拟 ACP CLI（用于测试）
├── unit/
│   ├── approval-store.test.ts  # 权限存储单元测试
│   ├── model-info.test.ts      # 模型信息单元测试
│   └── acp-types.test.ts       # 类型定义单元测试
└── integration/
    └── acp-smoke.test.ts       # ACP 协议冒烟测试
```

## ACP 通信架构

```
┌─────────────────────┐                    ┌─────────────────────┐
│                     │   stdin (JSON)     │                     │
│   agent-service     │ ──────────────────►│   Agent CLI         │
│   (ACP Client)      │                    │   (ACP Server)      │
│                     │ ◄────────────────── │                     │
└─────────────────────┘   stdout (JSON)    └─────────────────────┘
```

**关键点：**
- **stdio 通信**：通过子进程的标准输入/输出进行通信
- **JSON-RPC 格式**：每行一个 JSON 消息，以换行符分隔
- **双向通信**：客户端发送请求，Agent 返回响应或通知

## 支持的后端

从 `src/acp/types.ts` 中定义的后端配置：

| Backend | CLI 命令 | ACP 参数 | 需要认证 |
|---------|----------|----------|----------|
| `opencode` | `opencode` | `['acp']` | 否 |
| `claude` | `claude` | `['--experimental-acp']` | 是 |
| `codex` | `codex` 或 `npx @zed-industries/codex-acp@0.9.5` | `[]` | 是 |
| `gemini` | `gemini` | `['--experimental-acp']` | 是 |
| `qwen` | `qwen` 或 `npx @qwen-code/qwen-code` | `['--acp']` | 是 |
| `goose` | `goose` | `['acp']` | 否 |
| `auggie` | `auggie` | `['--acp']` | 否 |
| `kimi` | `kimi` | `['acp']` | 否 |
| `copilot` | `copilot` | `['--acp', '--stdio']` | 否 |
| `qoder` | `qodercli` | `['--acp']` | 否 |
| `vibe` | `vibe-acp` | `[]` | 否 |
| `custom` | 自定义 | `[]` | 否 |

## 核心 API

### AcpConnection 类

```typescript
import { AcpConnection } from './acp/connection';

// 创建连接
const connection = new AcpConnection('claude', '/path/to/workspace');

// 连接到 Agent
await connection.connect();

// 创建会话
const session = await connection.createSession({ model: 'claude-sonnet-4' });

// 加载已有会话
const loadedSession = await connection.loadSession('existing-session-id');

// 创建或恢复会话
const sessionId = await connection.createOrResumeSession('existing-session-id', { model: 'claude-sonnet-4' });

// 发送消息
const result = await connection.sendPrompt('你好，请帮我写一个函数', {
  onSessionUpdate: (update) => {
    // 处理流式更新
  },
  onPermissionRequest: async (request) => {
    // 处理权限请求
    return 'allow_once';
  },
});

// 设置模型
await connection.setModel('claude-sonnet-4');

// 设置配置选项
await connection.setConfigOption('optionId', 'value');

// 设置会话模式
await connection.setSessionMode('modeId');

// 获取模型信息
const modelInfo = connection.getModelInfo();

// 获取配置选项
const configOptions = connection.getConfigOptions();

// 获取审批存储
const approvalStore = connection.getApprovalStore();

// 断开连接
await connection.disconnect();
```

### JSON-RPC 消息类型

```typescript
// 请求 - 需要响应
interface AcpRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown> | unknown[];
}

// 响应 - 对请求的回复
interface AcpResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// 通知 - 单向消息
interface AcpNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown> | unknown[];
}
```

### ACP 方法

```typescript
export const ACP_METHODS = {
  INITIALIZE: 'initialize',              // 初始化协议
  AUTHENTICATE: 'authenticate',          // 认证
  SESSION_NEW: 'session/new',            // 创建会话
  SESSION_LOAD: 'session/load',          // 加载会话
  SESSION_PROMPT: 'session/prompt',      // 发送消息
  SESSION_CANCEL: 'session/cancel',      // 取消消息
  SESSION_UPDATE: 'session/update',      // 会话更新通知
  REQUEST_PERMISSION: 'session/request_permission',  // 权限请求
  SET_CONFIG_OPTION: 'session/set_config_option',   // 设置配置
  SET_MODEL: 'session/set_model',        // 设置模型
  SET_MODE: 'session/set_mode',          // 设置模式
  READ_TEXT_FILE: 'fs/read_text_file',   // 读取文件
  WRITE_TEXT_FILE: 'fs/write_text_file', // 写入文件
} as const;
```

### Session Update 类型

```typescript
type SessionUpdateType =
  | 'agent_message_chunk'      // Agent 回复的文本片段
  | 'agent_thought_chunk'      // Agent 的思考过程
  | 'tool_call'                // 工具调用开始
  | 'tool_call_update'         // 工具调用状态更新
  | 'plan'                     // 执行计划更新
  | 'available_commands_update' // 可用命令更新
  | 'user_message_chunk'       // 用户消息片段
  | 'config_option_update'     // 配置选项更新
  | 'usage_update';            // Token 使用量更新
```

### IBackendAdapter 接口

```typescript
export interface IBackendAdapter {
  readonly name: string;
  initialize(): Promise<void>;
  sendMessage(content: string, options?: { stream?: boolean }): Promise<string>;
  onStream(callback: (event: AgentEvent) => void): void;
  getStatus(): Promise<BackendStatus>;
  destroy(): Promise<void>;
  checkHealth(): Promise<boolean>;
  start?(options?: { resumeSessionId?: string }): Promise<void>;
  setModel?(modelId: string): Promise<void>;
  getModelInfo?(): { currentModelId: string | null; availableModels: Array<{ id: string; label: string }>; canSwitch: boolean } | null;
  getCurrentSessionId?(): string | null;
  getFiles?(): Array<{ path: string; action: 'created' | 'modified' | 'deleted'; content?: string }>;
  setPromptTimeout?(seconds: number): void;
}
```

### AcpApprovalStore 类

用于管理权限审批决策，支持 `allow_always` 自动审批：

```typescript
import { AcpApprovalStore, createAcpApprovalKey } from './acp/approval-store';

const store = new AcpApprovalStore();

// 存储审批决策
store.put(toolCallKey, 'allow_always');

// 检查是否已审批
const isApproved = store.isApprovedForSession(toolCallKey);

// 清空存储
store.clear();
```

### AcpModelInfo 类型

用于处理模型信息：

```typescript
export interface AcpModelInfo {
  currentModelId: string | null;
  currentModelLabel: string | null;
  availableModels: Array<{ id: string; label: string }>;
  canSwitch: boolean;
  source: 'configOption' | 'models';
  configOptionId?: string;
}
```

## HTTP API 路由

### POST /api/agent/:sessionId/message
发送消息到指定会话。

**请求体：**
```typescript
{
  content: string;
  demoId?: string;
  backend?: AgentType;
  workingDir?: string;
  options?: {
    timeout?: number;
    stream?: boolean;
  };
}
```

### GET /api/agent/:sessionId
获取会话信息。

### DELETE /api/agent/:sessionId
销毁指定会话。

### GET /api/agent/:sessionId/files
获取会话中修改的文件列表。

### GET /api/sessions
列出所有会话。

**查询参数：**
- `status`: 按状态过滤
- `limit`: 限制数量
- `offset`: 偏移量

### POST /api/agent/:sessionId/rollback
回滚文件修改。

### GET /health
健康检查端点。

### GET /backends
获取已注册的后端列表。

## 构建 / 测试 / 开发命令

```bash
# 开发模式（热重载）
pnpm dev

# 构建
pnpm build

# 生产模式运行
pnpm start

# 运行所有测试（使用 fake-acp-cli，快速可靠）
pnpm test

# 测试监听模式
pnpm test:watch

# 测试覆盖率报告
pnpm test:coverage

# 真实后端冒烟测试（需要安装对应 CLI 并设置环境变量）
ACP_SMOKE_REAL=1 pnpm test:smoke

# ESLint 检查
pnpm lint

# TypeScript 类型检查
pnpm typecheck
```

## 测试策略

### 分层测试架构

| 测试类型 | 描述 | 文件位置 |
|:---------|:-----|:---------|
| **单元测试** | 纯逻辑测试，无需外部依赖 | `tests/unit/*.test.ts` |
| **集成测试** | 使用 fake-acp-cli 模拟真实 CLI | `tests/integration/*.test.ts` |
| **真实后端测试** | 可选，测试真实 CLI（需设置环境变量） | `ACP_SMOKE_REAL=1` |

### fake-acp-cli

`tests/fixtures/fake-acp-cli/index.js` 是一个模拟 ACP 协议的 CLI，用于测试：

- 支持 `initialize`、`session/new`、`session/prompt` 等方法
- 模拟流式响应（`agent_message_chunk`、`agent_thought_chunk`）
- 模拟工具调用（`tool_call`、`tool_call_update`）
- 返回模型信息和配置选项

### Agent 友好的测试方式

1. **fake-acp-cli** - 模拟真实 ACP 协议，无需真实后端
2. **纯单元测试** - 测试核心逻辑，无需进程启动
3. **可选真实测试** - 通过环境变量控制，不影响 CI

## 代码风格与约定

### TypeScript 配置
- **严格模式**：`strict: true`
- **目标版本**：ES2020
- **模块系统**：NodeNext

### 命名约定
- **类/接口**：PascalCase（`AcpConnection`, `AgentConfig`）
- **函数/变量**：camelCase（`sendPrompt`, `createSession`）
- **常量**：UPPER_SNAKE_CASE（`ACP_METHODS`, `JSONRPC_VERSION`）
- **类型别名**：PascalCase（`AgentType`, `ErrorCode`）

### 导入顺序
1. Node.js 内置模块
2. 外部库（fastify, pino 等）
3. 内部模块（相对路径）

### 错误处理
- 使用自定义 `ErrorCode` 枚举
- 错误消息使用中文
- 所有异步操作使用 try/catch

### 日志规范
- 使用 pino 日志库
- 通过 `src/utils/logger.ts` 统一导出
- 日志级别：`debug`, `info`, `warn`, `error`

```typescript
import { logger } from './utils/logger';

logger.info({ backend: 'claude' }, 'ACP connection established');
logger.error({ error: err }, 'Failed to connect');
```

## 注意事项

- **进程隔离**：每个 Agent 运行在独立子进程中
- **超时处理**：`session/prompt` 默认超时 5 分钟，其他方法 1 分钟；可通过 `setPromptTimeout()` 调整
- **权限控制**：敏感操作需要通过 `onPermissionRequest` 回调确认；支持 `allow_always` 自动审批
- **流式响应**：通过 `session/update` 通知实现实时更新
- **会话恢复**：支持通过 `loadSession` 或 `createOrResumeSession` 恢复已有会话
- **模型切换**：支持运行时切换模型（`setModel`）
- **文件操作**：支持通过 `fs/read_text_file` 和 `fs/write_text_file` 通知进行文件操作

## 相关文档

- [ACP 协议详解](../../docs/AionUI/ACP协议.md)
- [Zed External Agents 文档](https://github.com/zed-industries/zed/blob/main/docs/src/ai/external-agents.md)
