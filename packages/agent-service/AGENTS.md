# AGENTS.md — @opencode-workbench/agent-service

> 本文件为 AI 编码代理提供在此包中工作的指南。

## 包概览

`@opencode-workbench/agent-service` 是一个独立的 Agent 服务包，基于 **Pi Agent**（`@earendil-works/pi-agent-core`）进程内嵌入实现，与单个 LLM 通信。

> **历史**：本包早期基于 ACP (Agent Client Protocol) 协议支持 14 种后端（OpenCode、Claude、Codex、Gemini、Qwen、Goose、Auggie、Kimi、Copilot、Qoder、Vibe、自定义等）。经评估后于 2026-06 全面迁移至 Pi Agent，移除了多后端支持（见 `docs/plans/进行中/全面迁移至Pi-Agent并移除多后端支持方案.md`）。

## 目录结构

```
src/
├── backends/               # Agent 后端适配器
│   ├── base.ts             # 后端适配器接口（IBackendAdapter）
│   ├── pi-agent.ts         # Pi Agent 后端实现
│   ├── pi-tools/           # Pi Agent 工具集
│   │   ├── index.ts        # 工具导出与能力集版本
│   │   ├── file-tools.ts   # 文件操作工具
│   │   ├── read-file-lines-tool.ts # 带行号读取文件
│   │   ├── edit-file-tool.ts # 精确编辑文件（old_string/new_string 替换）
│   │   ├── bash-tool.ts    # Shell 白名单（11 个只读命令）
│   │   ├── schema-tool.ts  # config.schema.json 校验
│   │   ├── save-image-tool.ts # 图片保存工具（图床 + SHA256 去重）
│   │   ├── console-tool.ts # 页面控制台日志获取工具
│   │   ├── list-images-tool.ts # 项目图片清单查询
│   │   ├── screenshot-tool.ts # 页面截图捕获工具
│   │   ├── web-read-tool.ts # 公开网页正文读取工具（默认开启，可关闭）
│   │   ├── web-search-tool.ts # Brave Search 联网搜索工具（默认关闭）
│   │   └── subagent-tool.ts # 子 Agent 委派工具
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
├── unit/                   # 单元测试
└── integration/            # 集成测试
```

## Pi Agent 通信架构

```
┌─────────────────────┐                    ┌─────────────────────┐
│   agent-service     │    函数调用        │  @earendil-works/   │
│   (Fastify)         │ ────────────────► │  pi-agent-core      │
│                     │    (进程内嵌入)    │                     │
└─────────────────────┘                    └─────────────────────┘
```

**关键点：**
- **进程内嵌入**：Pi Agent 核心以 npm 依赖方式嵌入，无需独立进程或端口
- **动态导入**：`pi-agent.ts` 通过 `await import('@earendil-works/pi-agent-core')` 动态加载，避免 ESM/CJS 兼容问题
- **流式响应**：`Agent.subscribe(event)` 推送 `message_update`、`tool_execution_start/end`、`agent_end` 事件
- **工具拦截**：`beforeToolCall`（路径校验）+ `afterToolCall`（文件变更捕获）

## Pi Agent 工具集

`src/backends/pi-tools/` 默认暴露 25 个工具；`PI_AGENT_WEB_SEARCH_ENABLED=true` 时额外注册 `webSearch`：

| 工具 | 用途 |
|:-----|:-----|
| `readFile` | 读取工作空间内文件 |
| `readFileWithLines` | 带行号读取文件，支持行范围选择 |
| `editFile` | 精确编辑文件（old_string/new_string 替换） |
| `writeFile` | 写入工作空间内文件（变更会被捕获） |
| `listFiles` | 列出目录文件 |
| `bash` | Shell 命令（白名单：npm/node/npx/ls/cat/head/tail/grep/find/wc/echo） |
| `schemaValidate` | 校验 config.schema.json 格式 |
| `saveImage` | 保存图片到图床（SHA256 去重，返回绝对 URL `/api/images/{hash}-{filename}`） |
| `listImages` | 查询当前项目已上传的图片清单 |
| `getConsoleLogs` | 获取页面控制台日志 |
| `captureScreenshot` | 捕获页面截图 |
| `readPreinstalledSkill` | 按名称读取 agent-service 内置的预装 Skill 全文 |
| `webRead` | 读取公开 HTTP/HTTPS 网页正文，拒绝本机、内网、保留地址和非文本内容 |
| `webSearch` | 使用 Brave Search API 查询公开互联网搜索结果（默认关闭，需要 `BRAVE_SEARCH_API_KEY`） |
| `listPages` | 查询工作空间页面清单 |
| `deletePage` | 删除单个页面（需要权限确认） |
| `deletePages` | 批量删除页面（需要权限确认） |
| `delegateTask` | 将独立任务委派给短生命周期子 Agent，子 Agent 可读写允许范围内文件，结果和文件变更回传主 Agent |

### Shell 白名单

当前默认白名单在 `pi-tools/permissions.ts`：`node`、`ls`、`cat`、`head`、`tail`、`grep`、`find`、`wc`、`echo`；`npm`、`npx`、`node -e`、`rm`、`mv` 等默认拒绝。

`pi-tools/bash-tool.ts:10` 定义 11 个允许的命令：`['npm', 'node', 'npx', 'ls', 'cat', 'head', 'tail', 'grep', 'find', 'wc', 'echo']`。
注：`npm install` / `npx` 可写文件系统；`echo` 可重定向。但未含 `rm` / `mv` 等高危命令。

## 配置（环境变量）

```bash
# 必填
PI_AGENT_API_KEY=sk-...

# 选填（有默认值）
PI_AGENT_PROVIDER=jojo                # anthropic / openai / google / 自定义 provider
PI_AGENT_MODEL=deepseek-v4-flash      # 模型 ID
PI_AGENT_BASE_URL=https://token.xjjj.co/v1  # 自定义 API 基础地址（OpenAI 兼容格式）
PI_AGENT_TIMEOUT=120000               # 超时时间（毫秒）
SCREENSHOT_SERVICE_URL=http://localhost:3202  # 截图服务地址（captureScreenshot 工具使用）
PI_AGENT_SUBAGENTS_ENABLED=true       # 是否启用 delegateTask 子 Agent 工具
PI_AGENT_SUBAGENT_TIMEOUT=120000      # 子 Agent 单次任务超时时间（毫秒）
PI_AGENT_WEB_READ_ENABLED=true        # 是否启用 webRead 网页读取工具
PI_AGENT_WEB_READ_TIMEOUT_MS=10000    # webRead 单次请求超时
PI_AGENT_WEB_READ_MAX_BYTES=1000000   # webRead 最大响应体积
PI_AGENT_WEB_SEARCH_ENABLED=false     # 是否启用 webSearch 联网搜索工具
BRAVE_SEARCH_API_KEY=                 # Brave Search API key（免费额度方案）
PI_AGENT_WEB_SEARCH_TIMEOUT_MS=10000  # webSearch 单次请求超时
PI_AGENT_WEB_SEARCH_CACHE_TTL_MS=600000 # webSearch 进程内缓存 TTL
PI_AGENT_PREINSTALLED_SKILLS_DIR=     # 可选：覆盖预装 Skill 目录，默认使用随包发布的 preinstalled-skills
```

完整配置加载逻辑见 `src/utils/config.ts`。

## HTTP API 路由

### POST /api/agent/:sessionId/message
发送消息到指定会话。

**请求体：**
```typescript
{
  content: string;
  demoId?: string;
  workingDir?: string;
  customWorkspace?: boolean;
  model?: string;
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

### GET /models
获取可用模型列表（创建临时 Pi Agent 实例调用 `getModelInfo()`）。

### GET /health
健康检查端点（返回 status/timestamp/uptime/agents）。

## IBackendAdapter 接口

```typescript
export interface IBackendAdapter {
  readonly name: string;
  initialize(): Promise<void>;
  sendMessage(content: string, options?: { stream?: boolean; images?: ImageAttachment[] }): Promise<string>;
  onStream(callback: (event: AgentEvent) => void): void;
  getStatus(): Promise<BackendStatus>;
  destroy(): Promise<void>;
  checkHealth(): Promise<boolean>;
  start?(options?: { resumeSessionId?: string }): Promise<void>;
  setModel?(modelId: string): Promise<void>;
  getModelInfo?(): { currentModelId: string | null; availableModels: Array<{ id: string; label: string }>; canSwitch: boolean } | null | Promise<{ currentModelId: string | null; availableModels: Array<{ id: string; label: string }>; canSwitch: boolean } | null>;
  getCurrentSessionId?(): string | null;
  getFiles?(): Array<{ path: string; action: 'created' | 'modified' | 'deleted'; content?: string }>;
  setPromptTimeout?(seconds: number): void;
  cancelPrompt?(): void;
  getWorkingDir?(): string | null;
}
```

## 构建 / 测试 / 开发命令

```bash
# 开发模式（热重载）
pnpm dev

# 构建
pnpm build

# 生产模式运行
pnpm start

# 运行所有测试
pnpm test

# 测试监听模式
pnpm test:watch

# 测试覆盖率报告
pnpm test:coverage

# ESLint 检查
pnpm lint

# TypeScript 类型检查
pnpm typecheck
```

## 测试策略

| 测试类型 | 描述 | 文件位置 |
|:---------|:-----|:---------|
| **单元测试** | 纯逻辑测试，无需外部依赖 | `tests/unit/*.test.ts` |
| **集成测试** | 测试 Pi Agent 后端初始化/事件/配置 | `tests/integration/*.test.ts` |

## 代码风格与约定

### TypeScript 配置
- **严格模式**：`strict: true`
- **目标版本**：ES2020
- **模块系统**：NodeNext

### 命名约定
- **类/接口**：PascalCase（`PiAgentBackend`, `AgentConfig`）
- **函数/变量**：camelCase（`sendPrompt`, `createSession`）
- **常量**：UPPER_SNAKE_CASE（`SESSION_EXPIRY_MS`）
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

## 注意事项

- **单后端架构**：仅支持 Pi Agent，无外部服务依赖
- **进程内嵌入**：`@earendil-works/pi-agent-core` 以动态导入方式加载
- **超时处理**：`MESSAGE_TIMEOUT_MS = 300000`（5 分钟）— `src/routes/websocket.ts:59`
- **文件操作**：`afterToolCall` 钩子捕获 `writeFile` 变更存入 `this.files`
- **路径安全**：`beforeToolCall` 拦截 `readFile/writeFile/listFiles` 的越权访问

## 相关文档

- [迁移方案](../../docs/plans/进行中/全面迁移至Pi-Agent并移除多后端支持方案.md)
