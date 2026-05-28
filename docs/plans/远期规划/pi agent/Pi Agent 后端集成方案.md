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
│   └── pi-agent.ts (实现 IBackendAdapter)
│       ├── 导入 @earendil-works/pi-agent-core
│       ├── 导入 @earendil-works/pi-ai
│       ├── 定义 Workbench 专用工具集
│       └── 对接现有事件系统
│
└── AgentFactory
    └── factory.register('pi-agent', createPiAgent)
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

实现 `IBackendAdapter` 接口，核心结构：

```typescript
export class PiAgentBackend implements IBackendAdapter {
  readonly name = "pi-agent";
  private agent: Agent | null = null;
  private config: AgentConfig;
  private status: BackendStatus = "idle";
  private eventCallback?: (event: AgentEvent) => void;
  private files: FileChange[] = [];

  constructor(config: AgentConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    // 创建 Pi Agent 实例，注入工具集
  }

  async sendMessage(content: string, options?: { stream?: boolean }): Promise<string> {
    // 调用 agent.prompt()，订阅事件转发
  }

  onStream(callback: (event: AgentEvent) => void): void {
    this.eventCallback = callback;
  }

  // ... 其他接口方法
}
```

#### 任务 1.3：注册到 AgentFactory

**文件**：`packages/agent-service/src/server.ts`（修改）

```typescript
import { PiAgentBackend } from './backends/pi-agent';

// 在现有注册代码后添加
factory.register('pi-agent', (agentConfig) => new PiAgentBackend(agentConfig));
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

| 测试用例 | 说明 |
|:---------|:-----|
| `should initialize agent` | 验证 Agent 实例创建 |
| `should send message and receive stream` | 验证消息发送和流式响应 |
| `should collect file changes` | 验证文件变更收集 |
| `should validate file path whitelist` | 验证文件路径白名单 |
| `should cancel prompt` | 验证取消操作 |

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
