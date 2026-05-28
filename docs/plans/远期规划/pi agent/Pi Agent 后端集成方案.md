# Pi Agent 后端集成方案

> **目标**：在现有 agent-service 中新增 Pi Agent 作为可选后端，与 OpenCode HTTP 后端并行运行，支持随时切换和回退。

---

## 一、背景与动机

### 1.1 当前状态

agent-service 已支持 13 种后端，但实际只使用了 `opencode-http`（默认）。OpenCode 方案的优势是开箱即用，但存在黑盒风险——Agent 内部的规划状态机复杂，底层异常难以排查，且无法深度定制工具集和执行流程。

### 1.2 为什么要做 Pi Agent 后端

| 动机 | 说明 |
|:-----|:-----|
| **架构可控性** | Pi 的 Agent 运行时完全在进程内，每行代码可调试 |
| **工具定制** | 可精确定义文件读写、Schema 校验、权限控制等工具 |
| **上下文注入** | `transformContext` 可注入项目特定上下文（.opencode 配置、Schema 等） |
| **Token 效率** | 无内置复杂工作流提示词，长期运营成本更低 |
| **Vibe Coding 友好** | 代码量小、逻辑透明，AI 助手可高效理解和修改 |

### 1.3 设计原则

1. **非侵入式** — 不修改现有 OpenCode 后端的任何代码
2. **并行运行** — 两套后端同时注册，通过环境变量切换
3. **渐进式** — 先实现核心功能，后续迭代增强
4. **可回退** — 随时可切回 OpenCode 后端

---

## 二、架构设计

### 2.1 整体架构

```
agent-service (Fastify)
├── 现有后端（保持不变）
│   ├── opencode-http (默认)
│   ├── claude / codex / gemini / ...
│   └── ...
│
├── 新增 Pi Agent 后端
│   ├── pi-agent.ts (实现 IBackendAdapter)
│   │   ├── 导入 @earendil-works/pi-agent-core
│   │   ├── 导入 @earendil-works/pi-ai
│   │   ├── 定义 Workbench 专用工具集
│   │   └── 对接现有事件系统
│   │
│   └── pi-tools/ (工具集目录)
│       ├── file-tools.ts  (文件操作)
│       ├── bash-tool.ts   (Shell 执行)
│       ├── schema-tool.ts (Schema 校验)
│       └── index.ts       (工具注册)
│
├── BackendAgent (桥接层)
│   └── 包装 IBackendAdapter，桥接 AgentEvent 与上层系统
│
└── AgentFactory
    └── factory.register('pi-agent', (config) => new BackendAgent(config, new PiAgentBackend(config)))
```

### 2.2 数据流对比

**OpenCode 方案（现有）**：

```
创作端 ──▶ agent-service ──HTTP/SSE──▶ opencode serve ──▶ 云端 LLM
                   │                         │
              API 桥接                  黑盒内部处理
```

**Pi Agent 方案（新增）**：

```
创作端 ──▶ agent-service ──进程内调用──▶ pi-agent-core ──API──▶ 云端 LLM
                   │                         │
              事件转发                  工具执行（可控）
              文件同步                  状态管理（透明）
```

### 2.3 工具集设计

Pi Agent 需要以下工具来适配 Workbench 的业务逻辑：

| 工具名 | 功能 | 权限控制 |
|:-------|:-----|:---------|
| `readFile` | 读取临时空间文件 | 白名单校验，禁止读取 workspace 外文件 |
| `writeFile` | 写入临时空间文件 | 白名单校验，触发实时预览编译 |
| `listFiles` | 列出目录内容 | 限定在临时空间内 |
| `bash` | 执行 shell 命令 | 受限命令白名单（npm, node 等） |
| `schemaValidate` | 校验 JSON Schema | 写入 config.schema.json 前自动调用 |

### 2.4 事件映射

Pi Agent 事件 → 现有 AgentEvent 映射：

| Pi Agent 事件 | → | AgentEvent |
|:--------------|:--|:-----------|
| `message_update` (text_delta) | → | `stream` |
| `message_update` (thinking_delta) | → | `thought` |
| `tool_execution_start` | → | `tool_call` |
| `tool_execution_end` | → | `tool_call_update` |
| `agent_end` | → | `finish` |

### 2.5 AgentEvent 类型定义

所有后端向上传递事件的联合类型（定义在 `src/core/types.ts`）：

```typescript
export type EventType =
  | "stream"          // 流式文本
  | "thought"         // 思考过程
  | "tool_call"       // 工具调用开始
  | "tool_call_update"// 工具调用状态更新
  | "plan"            // 执行计划
  | "error"           // 错误
  | "finish"          // 完成
  | "status";         // 状态变化

export type AgentEvent =
  | StreamEvent          // { type: "stream", sessionId, content, done }
  | ThoughtEvent         // { type: "thought", sessionId, content, done }
  | ToolCallEvent        // { type: "tool_call", sessionId, toolCallId, status, title, kind }
  | ToolCallUpdateEvent  // { type: "tool_call_update", sessionId, toolCallId, status }
  | PlanEvent            // { type: "plan", sessionId, content }
  | ErrorEvent           // { type: "error", sessionId, error: AgentError }
  | FinishEvent          // { type: "finish", sessionId, result: AgentResult }
  | StatusEvent          // { type: "status", sessionId, status: AgentStatus }
  | FileOperationEvent;  // { type: "file_operation", sessionId, fileOperation: { method, path, content } }
```

### 2.6 IBackendAdapter 接口（完整定义）

定义在 `src/backends/base.ts`，每个后端必须实现：

```typescript
export type BackendStatus = 'idle' | 'initializing' | 'ready' | 'busy' | 'error';

export interface IBackendAdapter {
  readonly name: string;                                              // 后端名称
  initialize(): Promise<void>;                                        // 初始化（创建连接/会话）
  sendMessage(content: string, options?: { stream?: boolean }): Promise<string>;  // 发送消息
  onStream(callback: (event: AgentEvent) => void): void;             // 注册流式回调
  getStatus(): Promise<BackendStatus>;                                // 获取状态
  destroy(): Promise<void>;                                          // 销毁
  checkHealth(): Promise<boolean>;                                    // 健康检查
  // --- 以下为可选方法 ---
  start?(options?: { resumeSessionId?: string }): Promise<void>;     // 启动/恢复会话
  setModel?(modelId: string): Promise<void>;                         // 切换模型
  getModelInfo?(): { currentModelId: string | null; availableModels: Array<{ id: string; label: string }>; canSwitch: boolean } | null | Promise<{ ... } | null>;
  getCurrentSessionId?(): string | null;                             // 获取当前会话 ID
  getFiles?(): Array<{ path: string; action: 'created' | 'modified' | 'deleted'; content?: string }>;  // 获取修改的文件
  setPromptTimeout?(seconds: number): void;                          // 设置超时
  cancelPrompt?(): void;                                             // 取消当前提示
  getWorkingDir?(): string | null;                                   // 获取工作目录
}
```

### 2.7 pi-agent-core API 假设

以下为假设的 pi-agent-core API，需在实现前验证：

```typescript
// 假设 pi-agent-core 提供以下 API
interface PiAgentConfig {
  tools: PiAgentTool[];
  systemPrompt: string;
  model?: string;
  provider?: 'anthropic' | 'openai' | 'google';
}

interface PiAgent {
  prompt(message: string, options?: { timeout?: number }): Promise<string>;
  subscribe(callback: (event: PiAgentEvent) => void): void;
  setModel(modelId: string): Promise<void>;
  getModelInfo(): { currentModelId: string | null; availableModels: Array<{ id: string; label: string }>; canSwitch: boolean } | null;
  abort(): void;
  destroy(): void;
}

// 假设的事件类型
type PiAgentEvent =
  | { type: 'message_update'; delta: string; kind: 'text' | 'thinking' }
  | { type: 'tool_execution_start'; toolCallId: string; toolName: string; params: Record<string, unknown> }
  | { type: 'tool_execution_end'; toolCallId: string; result: unknown; success: boolean }
  | { type: 'agent_end'; result: string };
```

---

## 三、实现任务分解

### 阶段 1：基础框架（预计 1 周）

#### 任务 1.1：安装依赖

**文件**：`packages/agent-service/package.json`

```bash
pnpm add @earendil-works/pi-agent-core @earendil-works/pi-ai
```

#### 任务 1.2：创建 PiAgentBackend 类

**文件**：`packages/agent-service/src/backends/pi-agent.ts`（新建）

实现 `IBackendAdapter` 接口，完整结构：

```typescript
import { IBackendAdapter, BackendStatus } from './base';
import { AgentConfig, AgentEvent, FileChange } from '../core/types';
import { PiAgent, PiAgentEvent } from '@earendil-works/pi-agent-core';
import { createWorkbenchTools } from './pi-tools';

export class PiAgentBackend implements IBackendAdapter {
  readonly name = "pi-agent";
  
  private agent: PiAgent | null = null;
  private config: AgentConfig;
  private status: BackendStatus = "idle";
  private eventCallback?: (event: AgentEvent) => void;
  private files: FileChange[] = [];
  private timeout?: number;
  private sessionId: string | null = null;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    this.status = "initializing";
    const tools = createWorkbenchTools(this.config);
    this.agent = new PiAgent({
      tools,
      systemPrompt: this.buildSystemPrompt(),
    });
    this.status = "ready";
  }

  async sendMessage(content: string, options?: { stream?: boolean }): Promise<string> {
    if (!this.agent) throw new Error("Agent not initialized");
    this.status = "busy";
    
    this.setupEventMapping();
    const result = await this.agent.prompt(content, { timeout: this.timeout });
    
    this.status = "ready";
    return result;
  }

  onStream(callback: (event: AgentEvent) => void): void {
    this.eventCallback = callback;
  }

  async getStatus(): Promise<BackendStatus> {
    return this.status;
  }

  async destroy(): Promise<void> {
    this.agent?.abort();
    this.agent = null;
    this.status = "idle";
  }

  async checkHealth(): Promise<boolean> {
    return this.agent !== null;
  }

  async start(options?: { resumeSessionId?: string }): Promise<void> {
    this.sessionId = options?.resumeSessionId ?? null;
  }

  async setModel(modelId: string): Promise<void> {
    await this.agent?.setModel(modelId);
  }

  getModelInfo() {
    return this.agent?.getModelInfo() ?? null;
  }

  getCurrentSessionId(): string | null {
    return this.sessionId;
  }

  getFiles(): Array<{ path: string; action: 'created' | 'modified' | 'deleted'; content?: string }> {
    return this.files;
  }

  setPromptTimeout(seconds: number): void {
    this.timeout = seconds * 1000;
  }

  cancelPrompt(): void {
    this.agent?.abort();
  }

  getWorkingDir(): string | null {
    return this.config.workingDir ?? null;
  }

  private setupEventMapping(): void {
    this.agent!.subscribe((event: PiAgentEvent) => {
      if (!this.eventCallback) return;
      
      switch (event.type) {
        case 'message_update':
          if (event.kind === 'text') {
            this.eventCallback({
              type: 'stream',
              sessionId: this.sessionId ?? '',
              content: event.delta,
              done: false,
            });
          } else if (event.kind === 'thinking') {
            this.eventCallback({
              type: 'thought',
              sessionId: this.sessionId ?? '',
              content: event.delta,
              done: false,
            });
          }
          break;
        case 'tool_execution_start':
          this.eventCallback({
            type: 'tool_call',
            sessionId: this.sessionId ?? '',
            toolCallId: event.toolCallId,
            status: 'running',
            title: event.toolName,
            kind: event.toolName,
          });
          break;
        case 'tool_execution_end':
          this.eventCallback({
            type: 'tool_call_update',
            sessionId: this.sessionId ?? '',
            toolCallId: event.toolCallId,
            status: event.success ? 'completed' : 'failed',
          });
          break;
        case 'agent_end':
          this.eventCallback({
            type: 'finish',
            sessionId: this.sessionId ?? '',
            result: {
              content: event.result,
              files: this.files,
            },
          });
          break;
      }
    });
  }

  private buildSystemPrompt(): string {
    return [
      '你是 Workbench 的 AI 编码助手，负责生成和修改 React 组件代码。',
      '',
      '## 工作空间规则',
      `- 工作目录: ${this.config.workingDir}`,
      `- 只能读写工作目录内的文件`,
      `- 修改 config.schema.json 后需校验格式`,
      '',
      '## 可用依赖',
      '- react, react-dom, tailwindcss',
      '- clsx, tailwind-merge, class-variance-authority',
      '- lucide-react, framer-motion',
      '',
      '## 代码规范',
      '- TypeScript + Tailwind CSS',
      '- 默认导出 React 组件',
      '- 使用 clsx + tailwind-merge 处理动态类名',
    ].join('\n');
  }
}
```

#### 任务 1.3：注册到 AgentFactory

**文件**：`packages/agent-service/src/server.ts`（修改）

```typescript
import { PiAgentBackend } from './backends/pi-agent';

// 在现有注册代码后添加
// 注意：必须使用 BackendAgent 包装，它是 BaseAgent 的实现，
// 负责桥接 IBackendAdapter 与上层 Agent 系统（AgentManager、EventBus 等）
factory.register('pi-agent', (agentConfig) => new BackendAgent(agentConfig, new PiAgentBackend(agentConfig)));
```

#### 任务 1.4：添加类型定义

**文件**：`packages/agent-service/src/core/types.ts`（修改）

```typescript
// AgentType 新增
export type AgentType = "opencode" | "opencode-http" | "claude" | ... | "pi-agent";

// AgentConfig 新增
export interface AgentConfig {
  // ... 现有字段
  piAgent?: PiAgentConfig;
}

export interface PiAgentConfig {
  apiKey?: string;
  model?: string;
  provider?: string;  // "anthropic" | "openai" | "google"
  timeout?: number;
}
```

---

### 阶段 2：核心工具集（预计 1-2 周）

#### 任务 2.1：文件操作工具

**文件**：`packages/agent-service/src/backends/pi-tools/file-tools.ts`（新建）

```typescript
// readFile 工具
// - 读取临时空间内的文件
// - 白名单校验
// - 错误处理

// writeFile 工具
// - 写入临时空间内的文件
// - 白名单校验
// - 触发 file_operation 事件
// - 收集到 files 数组

// listFiles 工具
// - 列出目录内容
// - 限定在 workingDir 内
```

#### 任务 2.2：Shell 执行工具

**文件**：`packages/agent-service/src/backends/pi-tools/bash-tool.ts`（新建）

```typescript
// bash 工具
// - 受限命令白名单 (npm, node, ls, cat 等)
// - 超时控制
// - 输出捕获
```

#### 任务 2.3：Schema 校验工具

**文件**：`packages/agent-service/src/backends/pi-tools/schema-tool.ts`（新建）

```typescript
// schemaValidate 工具
// - 读取 config.schema.json
// - 校验 JSON Schema 格式
// - 返回校验结果
```

#### 任务 2.4：工具注册

**文件**：`packages/agent-service/src/backends/pi-tools/index.ts`（新建）

```typescript
export function createWorkbenchTools(config: AgentConfig): AgentTool[] {
  return [
    createReadFileTool(config),
    createWriteFileTool(config),
    createListFilesTool(config),
    createBashTool(config),
    createSchemaValidateTool(config),
  ];
}
```

---

### 阶段 3：事件系统对接（预计 3-5 天）

#### 任务 3.1：事件映射

**文件**：`packages/agent-service/src/backends/pi-agent.ts`（修改）

```typescript
private setupEventMapping(): void {
  this.agent!.subscribe((event) => {
    switch (event.type) {
      case 'message_update':
        // 转发 stream / thought 事件
        break;
      case 'tool_execution_start':
        // 转发 tool_call 事件
        break;
      case 'tool_execution_end':
        // 转发 tool_call_update 事件
        break;
      case 'agent_end':
        // 转发 finish 事件，附带 files
        break;
    }
  });
}
```

#### 任务 3.2：文件变更追踪

**文件**：`packages/agent-service/src/backends/pi-agent.ts`（修改）

```typescript
// 在 writeFile 工具的 afterToolCall 钩子中收集文件变更
afterToolCall: async ({ toolCall, result }) => {
  if (toolCall.name === 'writeFile') {
    this.files.push({
      path: toolCall.params.path,
      action: 'modified',
      content: toolCall.params.content,
    });
  }
}
```

---

### 阶段 4：配置与优化（预计 3-5 天）

#### 任务 4.1：环境变量配置

**文件**：`.env`（修改）

```bash
# Pi Agent 配置
PI_AGENT_PROVIDER=anthropic
PI_AGENT_API_KEY=your-api-key
PI_AGENT_MODEL=claude-sonnet-4-20250514
```

#### 任务 4.2：系统提示词优化

**文件**：`packages/agent-service/src/backends/pi-agent.ts`（修改）

```typescript
private buildSystemPrompt(): string {
  return [
    '你是 Workbench 的 AI 编码助手，负责生成和修改 React 组件代码。',
    '',
    '## 工作空间规则',
    `- 工作目录: ${this.config.workingDir}`,
    `- 只能读写工作目录内的文件`,
    `- 修改 config.schema.json 后需校验格式`,
    '',
    '## 可用依赖',
    '- react, react-dom, tailwindcss',
    '- clsx, tailwind-merge, class-variance-authority',
    '- lucide-react, framer-motion',
    '',
    '## 代码规范',
    '- TypeScript + Tailwind CSS',
    '- 默认导出 React 组件',
    '- 使用 clsx + tailwind-merge 处理动态类名',
  ].join('\n');
}
```

#### 任务 4.3：超时与取消

**文件**：`packages/agent-service/src/backends/pi-agent.ts`（修改）

```typescript
setPromptTimeout(seconds: number): void {
  this.timeout = seconds * 1000;
}

cancelPrompt(): void {
  this.agent?.abort();
}
```

---

## 四、文件清单

### 4.1 新建文件

| 文件路径 | 说明 | 预计行数 |
|:---------|:-----|:---------|
| `src/backends/pi-agent.ts` | Pi Agent 后端主类 | ~300 |
| `src/backends/pi-tools/file-tools.ts` | 文件操作工具 | ~150 |
| `src/backends/pi-tools/bash-tool.ts` | Shell 执行工具 | ~80 |
| `src/backends/pi-tools/schema-tool.ts` | Schema 校验工具 | ~60 |
| `src/backends/pi-tools/index.ts` | 工具注册入口 | ~30 |

### 4.2 修改文件

| 文件路径 | 修改内容 |
|:---------|:---------|
| `package.json` | 添加 pi-agent-core, pi-ai 依赖 |
| `src/server.ts` | 注册 pi-agent 后端 |
| `src/core/types.ts` | 新增 PiAgentConfig 类型 |
| `src/backends/index.ts` | 导出 PiAgentBackend |

---

## 五、测试策略

### 5.1 单元测试

**文件**：`packages/agent-service/tests/unit/pi-agent.test.ts`（新建）

```typescript
import { PiAgentBackend } from '../../src/backends/pi-agent';
import { AgentConfig } from '../../src/core/types';

describe('PiAgentBackend', () => {
  const mockConfig: AgentConfig = {
    workingDir: '/tmp/test-workspace',
    backend: 'pi-agent',
    piAgent: {
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
    },
  };

  it('should initialize agent instance', async () => {
    const backend = new PiAgentBackend(mockConfig);
    await backend.initialize();
    expect(await backend.getStatus()).toBe('ready');
  });

  it('should send message and receive stream events', async () => {
    const backend = new PiAgentBackend(mockConfig);
    const events: AgentEvent[] = [];
    backend.onStream((event) => events.push(event));
    
    await backend.initialize();
    await backend.sendMessage('hello');
    
    expect(events.some(e => e.type === 'stream')).toBe(true);
  });

  it('should collect file changes from writeFile tool', async () => {
    const backend = new PiAgentBackend(mockConfig);
    await backend.initialize();
    await backend.sendMessage('create a hello world component');
    
    const files = backend.getFiles();
    expect(files.some(f => f.path.includes('HelloWorld'))).toBe(true);
  });

  it('should validate file path whitelist', async () => {
    const backend = new PiAgentBackend(mockConfig);
    await backend.initialize();
    
    // 尝试读取工作目录外的文件应被拒绝
    await expect(
      backend.sendMessage('read /etc/passwd')
    ).rejects.toThrow();
  });

  it('should cancel prompt', async () => {
    const backend = new PiAgentBackend(mockConfig);
    await backend.initialize();
    
    const promise = backend.sendMessage('long running task');
    backend.cancelPrompt();
    
    await expect(promise).rejects.toThrow();
  });

  it('should destroy agent instance', async () => {
    const backend = new PiAgentBackend(mockConfig);
    await backend.initialize();
    await backend.destroy();
    
    expect(await backend.getStatus()).toBe('idle');
  });
});
```

**测试用例说明**：

| 测试用例 | 说明 |
|:---------|:-----|
| `should initialize agent` | 验证 Agent 实例创建和状态转换 |
| `should send message and receive stream events` | 验证消息发送和流式响应事件转发 |
| `should collect file changes` | 验证文件变更收集 |
| `should validate file path whitelist` | 验证文件路径白名单安全机制 |
| `should cancel prompt` | 验证取消操作 |
| `should destroy agent instance` | 验证资源清理 |

### 5.2 集成测试

```bash
# 启动 agent-service，使用 pi-agent 后端
AGENT_BACKEND=pi-agent pnpm dev:agent

# 发送测试消息
curl -X POST http://localhost:3201/api/agent/test-session/message \
  -H "Content-Type: application/json" \
  -d '{"content": "创建一个 Hello World 组件"}'
```

### 5.3 对比测试

同时启动两套后端，发送相同消息，对比：
- 响应质量
- Token 消耗
- 响应时间
- 文件变更准确性

### 5.4 错误处理策略

Pi Agent 后端需要处理以下错误场景：

| 错误类型 | 处理方式 | AgentEvent |
|:---------|:---------|:-----------|
| **初始化失败** | 抛出异常，状态设为 `error` | `error` 事件 |
| **消息发送超时** | 取消当前操作，返回超时错误 | `error` 事件 |
| **工具执行失败** | 记录错误，继续执行 | `tool_call_update` (status: failed) |
| **文件路径越权** | 拒绝操作，返回权限错误 | `error` 事件 |
| **API 密钥无效** | 初始化时检测，抛出配置错误 | 不触发事件 |
| **网络连接异常** | 重试或超时后报错 | `error` 事件 |

错误事件格式：
```typescript
{
  type: 'error',
  sessionId: string,
  error: {
    code: string;      // 错误码
    message: string;   // 错误信息
    details?: unknown; // 额外详情
  }
}
```

---

## 六、切换与回退

### 6.1 切换方式

**环境变量**（推荐）：

```bash
# 使用 OpenCode 后端（默认）
AGENT_BACKEND=opencode-http pnpm dev:agent

# 使用 Pi Agent 后端
AGENT_BACKEND=pi-agent pnpm dev:agent
```

**API 动态切换**（可选，需额外开发）：

```bash
# 创建会话时指定后端
POST /api/sessions
{
  "projectId": "xxx",
  "backend": "pi-agent"  // 或 "opencode-http"
}
```

### 6.2 回退方案

如果 Pi Agent 后端出现问题：

1. 修改 `.env` 中的 `AGENT_BACKEND=opencode-http`
2. 重启 agent-service
3. 现有会话不受影响（会话元数据中记录了 backend 类型）

### 6.3 并行运行

两套后端可同时注册，不同会话可使用不同后端：

```
会话 A → opencode-http
会话 B → pi-agent
会话 C → opencode-http
```

---

## 七、风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|:-----|:-----|:-----|:---------|
| **编码任务质量不足** | 中 | 高 | 引入外部 LSP 校验；利用 pi-agent-core 的工具执行能力构建自定义校验链 |
| **开发周期超预期** | 中 | 中 | 分阶段交付；优先实现核心工具，渐进式扩展 |
| **pi-ai API 变更** | 低 | 中 | 锁定版本；pi-ai 是稳定的统一 API 层 |
| **工具集不完善** | 中 | 中 | 先实现最小可用工具集，后续根据使用反馈迭代 |

---

## 八、时间线

| 阶段 | 内容 | 预计时间 | 产出 |
|:-----|:-----|:---------|:-----|
| **阶段 1** | 基础框架 | 1 周 | PiAgentBackend 可注册、可接收消息 |
| **阶段 2** | 核心工具集 | 1-2 周 | 文件读写、bash、Schema 校验可用 |
| **阶段 3** | 事件对接 | 3-5 天 | 流式响应、文件变更追踪正常 |
| **阶段 4** | 配置优化 | 3-5 天 | 系统提示词、超时控制完善 |
| **总计** | | **3-5 周** | Pi Agent 后端可用于生产 |

---

## 九、成功标准

| 指标 | 目标 |
|:-----|:-----|
| **功能完整性** | 支持文件读写、Schema 校验、流式响应 |
| **响应质量** | 生成的组件代码可正常编译和预览 |
| **Token 效率** | 相同任务的 Token 消耗 ≤ OpenCode 方案的 70% |
| **切换便捷性** | 一行配置切换后端，无需代码修改 |
| **回退能力** | 5 分钟内可回退到 OpenCode 后端 |

---

## 十、后续演进

完成基础集成后，可进一步增强：

| 功能 | 说明 |
|:-----|:-----|
| **自定义 systemPrompt** | 根据项目类型动态注入上下文 |
| **transformContext** | 智能裁剪对话历史，优化 Token 消耗 |
| **beforeToolCall 钩子** | 文件写入前自动校验 Schema |
| **afterToolCall 钩子** | 文件写入后自动触发编译预览 |
| **多模型适配** | 通过 pi-ai 支持 OpenAI/Google/本地模型 |
| **性能监控** | 记录每次交互的 Token 消耗、响应时间 |
