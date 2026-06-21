# Pi Agent 迁移到 AgentHarness 计划

> 版本：v2.0
> 创建日期：2026-06-05
> 更新日期：2026-06-05
> 状态：待实施
> 类型：迁移计划
> 关联：[Pi-Agent扩展能力集成方案 v3.0](./Pi-Agent扩展能力集成方案.md)

---

## 一、迁移目标

将 `PiAgentBackend` 从底层 `Agent` 类迁移到高层 `AgentHarness` 类，两者均在 `@earendil-works/pi-agent-core@0.76.0` 中。

**预期收益**：

| 收益 | 说明 |
|:-----|:-----|
| 消除 ~300 行自研代码 | 事件映射、getApiKey 回调链、beforeToolCall/afterToolCall 钩子、手动 waitForIdle + 消息提取可删除 |
| 获得内置 Compaction | `AgentHarness.compact()` — LLM 摘要压缩，自动管理切割点 |
| 获得内置 Skills | `loadSkills(env, dirs)` + `harness.skill()` — Markdown 声明式技能 |
| 获得会话树 | `harness.navigateTree(targetId)` — 分支切换、历史回溯 |
| 获得动态 System Prompt | 每次自动重新生成，支持注入上下文信息（env, session, model, thinkingLevel, activeTools, resources） |
| 获得 Hook 事件 | `on("tool_call")` — 可阻止/修改工具调用，替代 beforeToolCall |
| 获得流选项控制 | `streamOptions` — 超时、重试、缓存、自定义 headers |
| 获得队列消息 | `steer()`/`followUp()`/`nextTurn()` — 多种消息注入方式 |
| 工具零迁移 | AgentHarness 使用相同的 `AgentTool` 接口 |
| 零新增依赖 | AgentHarness 在已安装的 pi-agent-core 内 |

---

## 二、迁移范围

### 2.1 需要修改的文件

| 文件 | 变更类型 | 说明 |
|:-----|:--------|:-----|
| `backends/pi-agent.ts` | **重写** | 核心迁移：Agent → AgentHarness |
| `core/agent-manager.ts` | **简化** | hasConfigChanged 移除 model 检查 |
| `session/session-store.ts` | **不变** | MemorySessionStore 保留，管理应用层元数据 |
| `core/types.ts` | **修改** | 更新 PiAgentConfig（新增 thinkingLevel）、AgentEvent 类型 |
| `backends/pi-tools/permissions.ts` | **不变** | 权限逻辑不变，仅调用方式从 beforeToolCall 改为 hook |
| `backends/pi-tools/index.ts` | **不变** | 工具创建函数签名不变 |

### 2.2 无需修改的文件

| 文件 | 说明 |
|:-----|:-----|
| `backends/base.ts` | IBackendAdapter 接口不变 |
| `backends/pi-tools/*.ts`（9 个工具） | AgentTool 接口不变，工具实现不变 |
| `config/backend-providers.ts` | 保留，多供应商管理比 getApiKeyAndHeaders 更复杂 |
| `core/backend-agent.ts` | 适配层，接口不变 |
| `core/agent-factory.ts` | 工厂，接口不变 |
| 所有路由文件 | HTTP/WebSocket 接口不变 |
| `events/event-bus.ts` | 事件总线不变 |
| `session/session-store.ts` | 保留，管理应用层元数据（demoId、workspaceType 等） |

### 2.3 可删除的代码

| 代码 | 文件 | 行数 | 原因 |
|:-----|:-----|:-----|:------|
| 事件映射函数 setupEventMapping | pi-agent.ts | ~55 行 | AgentHarness 事件更直接，重写为更简洁的版本 |
| getApiKey 回调链 | pi-agent.ts | ~15 行 | 独立为 getApiKeyAndHeaders 方法 |
| beforeToolCall 钩子 | pi-agent.ts | ~70 行 | on("tool_call") hook 替代 |
| afterToolCall 钩子 | pi-agent.ts | ~10 行 | on("tool_result") hook 替代 |
| 手动 waitForIdle + 消息提取 | pi-agent.ts | ~25 行 | AgentHarness.prompt() 直接返回 AssistantMessage |
| 废弃的 buildSystemPrompt 模板 | pi-agent.ts | ~40 行 | v3.2 已迁至 author-site，可删除 |

---

## 三、已验证的 pi-agent-core API 参考

> 以下 API 均已从 `node_modules/@earendil-works/pi-agent-core@0.76.0/dist/*.d.ts` 验证，非推测。

### 3.1 导出路径

| 符号 | 导出路径 | 说明 |
|:-----|:---------|:-----|
| `AgentHarness` | `@earendil-works/pi-agent-core` | 主入口导出 |
| `InMemorySessionRepo` | `@earendil-works/pi-agent-core` | 主入口导出（注意：非 `MemorySessionRepo`） |
| `Session` | `@earendil-works/pi-agent-core` | 主入口导出 |
| `loadSkills` | `@earendil-works/pi-agent-core` | 主入口导出 |
| `NodeExecutionEnv` | `@earendil-works/pi-agent-core/node` | **子入口导出**，主入口不含 |

### 3.2 AgentHarnessOptions 构造参数

```typescript
interface AgentHarnessOptions<TSkill, TPromptTemplate, TTool> {
  env: ExecutionEnv;                    // 必填：执行环境
  session: Session;                     // 必填：会话对象
  tools?: TTool[];                      // 可选：工具列表
  resources?: AgentHarnessResources;    // 可选：Skills + PromptTemplates
  systemPrompt?: string | ((context: {  // 可选：静态字符串或动态函数
    env: ExecutionEnv;
    session: Session;
    model: Model<any>;
    thinkingLevel: ThinkingLevel;
    activeTools: TTool[];
    resources: AgentHarnessResources;
  }) => string | Promise<string>);
  getApiKeyAndHeaders?: (model: Model<any>) => Promise<{
    apiKey: string;
    headers?: Record<string, string>;
  } | undefined>;
  streamOptions?: AgentHarnessStreamOptions;  // 可选：超时/重试/缓存/headers
  model: Model<any>;                     // 必填：模型配置
  thinkingLevel?: ThinkingLevel;          // 可选：思考级别
  activeToolNames?: string[];             // 可选：启用的工具子集
  steeringMode?: QueueMode;               // 可选：steer 队列模式
  followUpMode?: QueueMode;               // 可选：followUp 队列模式
}
```

### 3.3 AgentHarness 方法

| 方法 | 签名 | 说明 |
|:-----|:-----|:-----|
| `prompt` | `(text: string, options?: { images?: ImageContent[] }) => Promise<AssistantMessage>` | 发送消息，直接返回结果 |
| `skill` | `(name: string, additionalInstructions?: string) => Promise<AssistantMessage>` | 调用已加载的技能 |
| `promptFromTemplate` | `(name: string, args?: string[]) => Promise<AssistantMessage>` | 从模板生成 prompt |
| `steer` | `(text: string, options?) => Promise<void>` | 插入引导消息 |
| `followUp` | `(text: string, options?) => Promise<void>` | 插入后续消息 |
| `nextTurn` | `(text: string, options?) => Promise<void>` | 排队下一轮消息 |
| `compact` | `(customInstructions?: string) => Promise<CompactResult>` | 上下文压缩 |
| `navigateTree` | `(targetId: string, options?) => Promise<NavigateTreeResult>` | 会话树分支切换 |
| `setModel` | `(model: Model<any>) => Promise<void>` | 运行时切换模型 |
| `setThinkingLevel` | `(level: ThinkingLevel) => Promise<void>` | 运行时切换思考级别 |
| `setActiveTools` | `(toolNames: string[]) => Promise<void>` | 运行时切换工具子集 |
| `setTools` | `(tools: TTool[], activeToolNames?: string[]) => Promise<void>` | 运行时替换工具集 |
| `setResources` | `(resources) => Promise<void>` | 运行时更新 Skills/Templates |
| `setStreamOptions` | `(streamOptions) => Promise<void>` | 运行时更新流选项 |
| `abort` | `() => Promise<AbortResult>` | 中止当前操作（返回 Promise） |
| `waitForIdle` | `() => Promise<void>` | 等待空闲 |
| `subscribe` | `(listener) => () => void` | 观察事件（返回取消订阅函数） |
| `on` | `(type, handler) => () => void` | 注册 hook（返回取消订阅函数） |

### 3.4 Hook 事件类型与返回值

**`on("tool_call")` hook**：

```typescript
// 事件结构
interface ToolCallEvent {
  type: "tool_call";
  toolCallId: string;
  toolName: string;           // 注意：是 toolName，不是 tool.name
  input: Record<string, unknown>; // 注意：是 input，不是 args
}

// 返回值
interface ToolCallResult {
  block?: boolean;   // 注意：是 block，不是 cancel
  reason?: string;
}
// 返回 { block: true, reason: '...' } 阻止工具调用
// 返回 undefined 放行
```

**`on("tool_result")` hook**：

```typescript
// 事件结构
interface ToolResultEvent {
  type: "tool_result";
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  content: Array<TextContent | ImageContent>;
  details: unknown;
  isError: boolean;           // 直接在事件上，不是 result.isError
}

// 返回值
interface ToolResultPatch {
  content?: Array<TextContent | ImageContent>;
  details?: unknown;
  isError?: boolean;
  terminate?: boolean;
}
```

### 3.5 AgentHarnessOwnEvent 完整列表

| 事件类型 | 数据结构 | hook 返回值 |
|:---------|:---------|:-----------|
| `tool_call` | `ToolCallEvent` | `ToolCallResult \| undefined` |
| `tool_result` | `ToolResultEvent` | `ToolResultPatch \| undefined` |
| `before_agent_start` | `{ prompt, images?, systemPrompt, resources }` | `{ messages?, systemPrompt? } \| undefined` |
| `context` | `{ messages }` | `{ messages } \| undefined` |
| `before_provider_request` | `{ model, sessionId, streamOptions }` | `{ streamOptions? } \| undefined` |
| `before_provider_payload` | `{ model, payload }` | `{ payload } \| undefined` |
| `after_provider_response` | `{ status, headers }` | `undefined`（只读） |
| `session_before_compact` | `{ preparation, branchEntries, customInstructions?, signal }` | `{ cancel?, compaction? } \| undefined` |
| `session_compact` | `{ compactionEntry, fromHook }` | `undefined`（只读） |
| `session_before_tree` | `{ preparation, signal }` | `{ cancel?, summary? } \| undefined` |
| `session_tree` | `{ newLeafId, oldLeafId, summaryEntry?, fromHook? }` | `undefined`（只读） |
| `model_select` | `{ model, previousModel, source }` | `undefined`（只读） |
| `thinking_level_select` | `{ level, previousLevel }` | `undefined`（只读） |
| `resources_update` | `{ resources, previousResources }` | `undefined`（只读） |
| `save_point` | `{ hadPendingMutations }` | `undefined`（只读） |
| `queue_update` | `{ steer, followUp, nextTurn }` | `undefined`（只读） |
| `abort` | `{ clearedSteer, clearedFollowUp }` | `undefined`（只读） |
| `settled` | `{ nextTurnCount }` | `undefined`（只读） |

> 注意：`AgentHarnessEvent = AgentEvent | AgentHarnessOwnEvent`，`subscribe()` 接收所有事件（含底层 Agent 的 `message_update`、`agent_end` 等），`on()` 只接收 `AgentHarnessOwnEvent`。

### 3.6 InMemorySessionRepo

```typescript
class InMemorySessionRepo implements SessionRepo<SessionMetadata, { id?: string }, void> {
  create(options?: { id?: string }): Promise<Session<SessionMetadata>>;
  open(metadata: SessionMetadata): Promise<Session<SessionMetadata>>;
  list(): Promise<SessionMetadata[]>;
  delete(metadata: SessionMetadata): Promise<void>;
  fork(sourceMetadata: SessionMetadata, options: { entryId?, position?, id? }): Promise<Session<SessionMetadata>>;
}
```

### 3.7 NodeExecutionEnv

```typescript
class NodeExecutionEnv implements ExecutionEnv {
  constructor(options: { cwd: string; shellPath?: string; shellEnv?: NodeJS.ProcessEnv });
  // 完整的 FileSystem + Shell 接口实现
  cleanup(): Promise<void>;
}
```

---

## 四、分步迁移计划

### Step 1：更新动态导入

**目标**：在 `loadPiAgentDeps()` 中增加 AgentHarness 相关依赖的导入。

**具体操作**：

```typescript
// 现有
let Agent: any; let streamSimple: any; let getModel: any; let getModels: any;

// 新增
let AgentHarness: any; let NodeExecutionEnv: any;
let InMemorySessionRepo: any; let Session: any;
let loadSkills: any;

async function loadPiAgentDeps() {
  if (!Agent) {
    const piAgentCore = await import('@earendil-works/pi-agent-core');
    Agent = piAgentCore.Agent;
    AgentHarness = piAgentCore.AgentHarness;
    InMemorySessionRepo = piAgentCore.InMemorySessionRepo;  // 注意：非 MemorySessionRepo
    Session = piAgentCore.Session;
    loadSkills = piAgentCore.loadSkills;

    // NodeExecutionEnv 从 /node 子入口导入
    const piAgentCoreNode = await import('@earendil-works/pi-agent-core/node');
    NodeExecutionEnv = piAgentCoreNode.NodeExecutionEnv;

    const piAi = await import('@earendil-works/pi-ai');
    streamSimple = piAi.streamSimple;
    getModel = piAi.getModel;
    getModels = piAi.getModels;
  }
}
```

**关键修正**：
- `NodeExecutionEnv` 从 `@earendil-works/pi-agent-core/node` 子入口导入，**不在主入口**
- 类名是 `InMemorySessionRepo`，**不是** `MemorySessionRepo`

---

### Step 2：创建 Session 管理层

**目标**：用 pi-agent-core 的 `Session` + `InMemorySessionRepo` 管理 Agent 层会话状态。

**迁移策略**：**保留 MemorySessionStore 管理应用层元数据，新增 Session 管理 Agent 层会话状态**。

```
当前：MemorySessionStore → SessionMeta（应用层元数据）
迁移后：MemorySessionStore → SessionMeta（应用层元数据，保留不变）
        + InMemorySessionRepo → Session（Agent 层会话状态，新增）
```

**原因**：`SessionMeta` 包含 `demoId`、`workspaceType`、`snapshotMode` 等应用层概念，pi-agent-core 的 `Session` 不了解这些。两层各管各的。

**具体操作**：

1. 在 `PiAgentBackend` 中新增属性：
```typescript
private harness: any = null;       // AgentHarness 实例
private env: any = null;           // NodeExecutionEnv 实例
private session: any = null;       // pi-agent-core Session 对象
private sessionRepo: any = null;   // InMemorySessionRepo
private currentSystemPrompt: string = '';  // 动态 system prompt 存储
private unsubFns: Array<() => void> = [];  // subscribe/on 返回的取消订阅函数
```

2. 在 `initialize()` 中创建 Session：
```typescript
// 创建 InMemorySessionRepo（内存模式，与当前行为一致）
this.sessionRepo = new InMemorySessionRepo();

// 创建 Session（参数极简，仅可选 id）
this.session = await this.sessionRepo.create();
```

3. 保留 `MemorySessionStore` 不变，继续管理应用层元数据

**已验证**：`InMemorySessionRepo.create()` 参数为 `options?: { id?: string }`，极简。

---

### Step 3：重写 PiAgentBackend.initialize()

**目标**：将 `new Agent({...})` 替换为 `new AgentHarness({...})`。

**当前 initialize() 核心逻辑**（简化）：
```typescript
async initialize() {
  await loadPiAgentDeps();
  const tools = createWorkbenchTools(this.config);
  const model = this.getModel();

  this.agent = new Agent({
    initialState: { model, systemPrompt: '...', tools },
    streamFn: streamSimple,
    getApiKey: (provider) => this.getApiKey(provider),
    beforeToolCall: (toolCall) => this.beforeToolCall(toolCall),
    afterToolCall: (toolCall, result) => this.afterToolCall(toolCall, result),
  });

  this.setupEventMapping();
}
```

**迁移后 initialize() 核心逻辑**：
```typescript
async initialize() {
  await loadPiAgentDeps();

  // 1. 创建 ExecutionEnv
  this.env = new NodeExecutionEnv({ cwd: this.config.workingDir ?? process.cwd() });

  // 2. 创建 Session
  this.sessionRepo = new InMemorySessionRepo();
  this.session = await this.sessionRepo.create();

  // 3. 创建工具
  const tools = createWorkbenchTools(this.config);

  // 4. 获取模型
  const model = this.getModel();

  // 5. 创建 AgentHarness
  this.harness = new AgentHarness({
    env: this.env,
    session: this.session,
    tools,
    model,
    systemPrompt: (context) => this.buildSystemPrompt(context),
    getApiKeyAndHeaders: (model) => this.getApiKeyAndHeaders(model),
    thinkingLevel: 'off',
  });

  // 6. 注册 Hook 事件（替代 beforeToolCall/afterToolCall）
  this.setupHooks();

  // 7. 注册观察事件（替代 setupEventMapping）
  this.setupEventMapping();
}
```

**关键变更映射**：

| 当前（Agent） | 迁移后（AgentHarness） | 说明 |
|:-------------|:---------------------|:-----|
| `initialState.model` | `model` | 直接传给构造函数 |
| `initialState.systemPrompt` | `systemPrompt: (ctx) => string` | 改为动态函数，ctx 含 env/session/model/thinkingLevel/activeTools/resources |
| `initialState.tools` | `tools` | 直接传给构造函数 |
| `streamFn: streamSimple` | **删除** | AgentHarness 内部自动使用 streamSimple |
| `getApiKey(provider)` | `getApiKeyAndHeaders(model)` | 参数从 provider 字符串改为 Model 对象，返回值从 string 改为 `{ apiKey, headers? }` |
| `beforeToolCall` | `on("tool_call", handler)` | hook 模式，返回 `{ block: true, reason? }` 阻止 |
| `afterToolCall` | `on("tool_result", handler)` | hook 模式，可修改 content/details/isError/terminate |

---

### Step 4：重写 getApiKeyAndHeaders

**目标**：将当前的 `getApiKey(provider)` 回调迁移为 `getApiKeyAndHeaders(model)`。

**当前 getApiKey 逻辑**（在 initialize 中内联）：
```typescript
getApiKey: async (provider: string) => {
  // 解析链：backendProviders > model.apiKey > piAgent.apiKey > env var > serviceConfig
  const providerConfig = getBackendProvidersManager().getProvider(provider);
  if (providerConfig?.apiKey) return providerConfig.apiKey;
  // ... 更多 fallback
  return process.env.PI_AGENT_API_KEY;
}
```

**迁移后 getApiKeyAndHeaders**：
```typescript
private async getApiKeyAndHeaders(model: any): Promise<{ apiKey: string; headers?: Record<string, string> } | undefined> {
  // 从 model 对象提取 provider
  const provider = model.provider;
  const providersManager = getBackendProvidersManager();

  // 优先级：backendProviders.apiKey > model.apiKey > piAgent.apiKey > env var > serviceConfig
  const providerConfig = providersManager.getProvider(provider);
  const apiKey =
    providerConfig?.apiKey ||
    model.apiKey ||
    this.config.piAgent?.apiKey ||
    process.env[`${provider.toUpperCase()}_API_KEY`] ||
    getServiceConfig().piAgent.apiKey;

  if (!apiKey) return undefined;

  const result: { apiKey: string; headers?: Record<string, string> } = { apiKey };

  // 若 backendProviders 配置了额外 headers，可附加
  if (providerConfig?.headers) {
    result.headers = providerConfig.headers;
  }

  return result;
}
```

**变更点**：
- 参数从 `provider: string` 改为 `model: Model<any>`（可从 model.provider 获取 provider）
- 返回值从 `string | undefined` 改为 `{ apiKey, headers? } | undefined`
- 支持返回 headers（为 OAuth 等场景预留）

**保留 BackendProvidersManager 的原因**：
- 它管理多供应商配置（API Key、Base URL、模型列表）
- 支持运行时热更新（author-site 推送）
- `getApiKeyAndHeaders` 只需从 BackendProvidersManager 读取数据

---

### Step 5：迁移权限系统到 Hook

**目标**：将 `beforeToolCall` 中的权限检查迁移到 `on("tool_call")` hook，`afterToolCall` 迁移到 `on("tool_result")` hook。

**当前 beforeToolCall 逻辑**（3 类拦截）：
1. 知识库写保护（拦截 writeFile 对 knowledge/ 的写入）
2. 路径权限校验（readFile/writeFile/listFiles）
3. deletePage 人工确认（发出 permission_request 事件，等待 60 秒）

**迁移后**：
```typescript
private setupHooks() {
  // 替代 beforeToolCall — 权限检查
  const unsubToolCall = this.harness.on("tool_call", (event) => {
    const { toolName, input } = event;  // 注意：是 toolName/input，不是 tool/args

    // 1. 路径权限校验
    if (['readFile', 'writeFile', 'listFiles'].includes(toolName)) {
      const targetPath = (input as any).path || (input as any).filePath;
      if (!isPathAllowed(targetPath, this.config.workingDir ?? '', this.config.permissions ?? DEFAULT_WORKSPACE_PERMISSIONS)) {
        return { block: true, reason: `Access denied: path "${targetPath}" is not allowed by workspace permissions` };
      }
    }

    // 2. 知识库写保护
    if (toolName === 'writeFile') {
      const targetPath = (input as any).path;
      if (targetPath && isKnowledgeBasePath(targetPath, this.config.workingDir ?? '')) {
        return { block: true, reason: '知识库文件由用户管理，AI 不可修改。如需更新请提示用户在知识库面板中操作。' };
      }
    }

    // 3. deletePage 人工确认 — 不在 hook 中处理
    //    保留在 deletePage 工具内部发出 permission_request 事件
    //    （与当前行为一致，只是触发方式不同）

    return undefined;  // 允许工具调用
  });
  this.unsubFns.push(unsubToolCall);

  // 替代 afterToolCall — 捕获文件变更
  const unsubToolResult = this.harness.on("tool_result", (event) => {
    const { toolName, input, isError } = event;  // 注意：isError 直接在 event 上

    if (toolName === 'writeFile' && !isError) {
      this.files.push({
        path: (input as any).path,
        action: 'modified',
        content: (input as any).content,
      });
    }
    return undefined;  // 不修改结果
  });
  this.unsubFns.push(unsubToolResult);
}
```

**关键差异**：
- `beforeToolCall` 返回 `{ block: true, reason }` 阻止工具，**不是** `{ cancel: true }`
- `ToolCallEvent` 的字段是 `toolName`/`input`，**不是** `tool`/`args`
- `ToolResultEvent` 的字段是 `toolName`/`input`/`isError`，**不是** `tool.name`/`tool.args`/`result.isError`
- `on()` 返回取消订阅函数，需在 `destroy()` 中调用
- deletePage 的权限确认逻辑保留在工具内部（通过 permission_request 事件），不在 hook 中处理

---

### Step 6：重写事件映射

**目标**：将 Agent 事件映射迁移为 AgentHarness 事件映射。

**事件架构理解**：

`AgentHarnessEvent = AgentEvent | AgentHarnessOwnEvent`

- `subscribe()` 接收**所有**事件（底层 Agent 事件 + Harness 自有事件）
- `on()` 只接收 `AgentHarnessOwnEvent`，可返回值修改行为
- 工具相关事件已通过 `on("tool_call")`/`on("tool_result")` hook 处理，`subscribe()` 中不再重复映射

**迁移后事件映射**：
```typescript
private setupEventMapping() {
  const unsub = this.harness.subscribe((event: any) => {
    if (!this.eventCallback) return;

    const sessionId = this.sessionId ?? this.config.sessionId;

    switch (event.type) {
      // 流式文本（来自底层 Agent）
      case 'message_update': {
        const assistantEvent = event.assistantMessageEvent;  // 注意：是 assistantMessageEvent，不是 data
        if (assistantEvent.type === 'text_delta') {
          this.eventCallback({
            type: 'stream',
            sessionId,
            content: assistantEvent.delta,  // 注意：是 delta，不是 text
            done: false,
          });
        } else if (assistantEvent.type === 'thinking_delta') {
          this.eventCallback({
            type: 'thought',
            sessionId,
            content: assistantEvent.delta,  // 注意：是 delta，不是 thinking
            done: false,
          });
        }
        break;
      }

      // Agent 结束（来自底层 Agent）
      case 'agent_end':
        this.eventCallback({
          type: 'finish',
          sessionId,
          result: {
            success: true,
            content: '',
            files: this.files.length > 0 ? this.files : undefined,
          },
        });
        break;

      // 工具调用（来自 AgentHarness 自有事件）
      case 'tool_call':
        this.eventCallback({
          type: 'tool_call',
          sessionId,
          toolCallId: event.toolCallId,
          status: 'in_progress',
          title: event.toolName,
          kind: 'execute',
        });
        break;

      // 工具结果（来自 AgentHarness 自有事件）
      case 'tool_result':
        this.eventCallback({
          type: 'tool_call_update',
          sessionId,
          toolCallId: event.toolCallId,
          status: event.isError ? 'failed' : 'completed',
        });
        break;

      // 上下文压缩完成
      case 'session_compact':
        this.eventCallback({
          type: 'status',
          sessionId,
          status: 'processing',
        });
        break;

      // 保存点（可用于持久化会话状态）
      case 'save_point':
        // 未来可在此持久化 Session
        break;
    }
  });
  this.unsubFns.push(unsub);
}
```

**与当前实现的关键差异**：
- `message_update` 事件结构：`event.assistantMessageEvent`（非 `event.data`），`assistantEvent.delta`（非 `text`/`thinking`）
- 工具事件使用 AgentHarness 自有的 `tool_call`/`tool_result`（非底层 Agent 的 `tool_execution_start`/`tool_execution_end`）
- `subscribe()` 返回取消订阅函数，需在 `destroy()` 中调用

**新增可利用的事件**（AgentHarness 特有）：
| 事件 | 用途 |
|:-----|:-----|
| `save_point` | turn 结束后的保存点，可用于持久化 |
| `session_compact` | 上下文压缩完成通知 |
| `before_provider_request` | 可修改 provider 请求参数（超时、headers 等） |
| `before_agent_start` | 可修改 system prompt 或注入消息 |
| `resources_update` | Skills/Templates 变更通知 |
| `model_select` | 模型切换通知 |
| `settled` | Agent 空闲通知 |

---

### Step 7：重写 sendMessage

**目标**：将 `agent.prompt()` + `waitForIdle()` + 手动消息提取替换为 `harness.prompt()`。

**当前 sendMessage 核心逻辑**（简化）：
```typescript
async sendMessage(content, options) {
  // 图片处理（多模态直接传，非多模态保存到图床）
  // ...
  await this.agent.prompt(promptContent, imageContent);
  await this.agent.waitForIdle();

  // 手动提取最后一条 assistant 消息
  const messages = this.agent.state.messages;
  const lastAssistant = messages.filter(m => m.role === 'assistant').pop();
  return lastAssistant?.content?.[0]?.text || '';
}
```

**迁移后 sendMessage**：
```typescript
async sendMessage(content: string, options?: { stream?: boolean; images?: ImageAttachment[] }): Promise<string> {
  if (!this.harness) throw new Error("Agent not initialized");
  this.status = "busy";
  this.files = [];

  // 图片处理逻辑保留（多模态直接传，非多模态保存到图床）
  const images = this.processImagesForHarness(options?.images);

  try {
    // 发送并直接获取结果
    const result = await this.harness.prompt(content, { images });
    this.status = "ready";

    // result 是 AssistantMessage，直接提取文本
    const text = result.content
      ?.filter((c: any) => c.type === 'text')
      ?.map((c: any) => c.text)
      ?.join('') || '';
    return text;
  } catch (error) {
    this.status = "error";
    logger.error({ error }, "Failed to send message");
    throw error;
  }
}
```

**关键简化**：
- `harness.prompt()` 返回 `Promise<AssistantMessage>`，无需手动 `waitForIdle()` 和消息提取
- 图片参数格式：`{ images: ImageContent[] }`，`ImageContent` 来自 `@earendil-works/pi-ai`
- 错误处理：`harness.prompt()` 在 agent 错误时抛异常，需 try-catch
- 图片预处理逻辑（非多模态保存到图床）保留不变，但输出格式需适配 `ImageContent`

---

### Step 8：重写其他方法

| 方法 | 当前实现 | 迁移后 |
|:-----|:--------|:-------|
| `updateSystemPrompt(prompt)` | `this.agent.state.systemPrompt = prompt` | 存储到 `this.currentSystemPrompt`，动态函数自动读取 |
| `cancelPrompt()` | `this.agent.abort()` | `await this.harness.abort()`（注意：返回 Promise） |
| `destroy()` | `this.agent.abort()` + 清理 | 调用所有 unsubFns + `await this.harness.abort()` + `await this.env.cleanup()` |
| `setModel(modelId)` | 仅更新 config，不实际切换 | `await this.harness.setModel(model)` — 运行时切换，无需重建 |
| `getModelInfo()` | 多来源聚合 | 保留（BackendProvidersManager 逻辑不变） |

**updateSystemPrompt 变更**：
```typescript
private currentSystemPrompt: string = '';

// 动态 System Prompt 函数 — 利用 AgentHarness 提供的丰富上下文
private buildSystemPrompt(context: {
  env: any;
  session: any;
  model: any;
  thinkingLevel: any;
  activeTools: any[];
  resources: any;
}): string {
  return this.currentSystemPrompt || 'You are a helpful assistant.';
}

// 更新 System Prompt（不再直接写 state）
async updateSystemPrompt(newPrompt: string): Promise<void> {
  this.currentSystemPrompt = newPrompt;
  // 下次 turn 自动使用新 prompt，无需重建 AgentHarness
  logger.info({ promptLength: newPrompt.length }, 'System prompt updated');
}
```

**setModel 变更**：
```typescript
async setModel(modelId: string): Promise<void> {
  if (!this.harness) throw new Error("Agent not initialized");
  const [provider, id] = modelId.split('/');
  this.config.piAgent = {
    ...this.config.piAgent,
    provider: provider || this.config.piAgent?.provider,
    model: id || modelId,
  };
  // 使用 harness.setModel() 运行时切换，无需重建
  const model = this.getModel();
  await this.harness.setModel(model);
  logger.info({ modelId }, "Model switched at runtime");
}
```

**destroy 变更**：
```typescript
async destroy(): Promise<void> {
  // 取消所有订阅
  for (const unsub of this.unsubFns) {
    unsub();
  }
  this.unsubFns = [];

  // 中止 harness
  if (this.harness) {
    await this.harness.abort();
    this.harness = null;
  }

  // 清理 ExecutionEnv
  if (this.env) {
    await this.env.cleanup();
    this.env = null;
  }

  this.session = null;
  this.sessionRepo = null;
  this.files = [];
  this.status = "idle";
  logger.info("Pi Agent backend destroyed");
}
```

---

### Step 9：更新 AgentManager

**目标**：简化 AgentManager，利用 AgentHarness 的运行时切换能力。

**当前 AgentManager 职责**：
- 按 sessionId 查找/创建 Agent
- 配置变化时更新 Agent
- 空闲清理（2 小时超时）
- 防止并发消息

**迁移后简化**：
- 保留 `getOrCreate()` 逻辑（sessionId → AgentHarness 实例映射）
- 保留 `sendMessage()` 的并发保护
- 保留空闲清理定时器
- **简化 `hasConfigChanged()`**：model 变化不再需要重建实例

```typescript
// 简化后的配置变化检测
hasConfigChanged(agent: BaseAgent, newConfig: AgentConfig): boolean {
  const current = agent.getConfig();
  // 模型变化不再需要重建（可用 harness.setModel() 运行时切换）
  return current.workingDir !== newConfig.workingDir
      || current.demoId !== newConfig.demoId;
}
```

---

### Step 10：更新类型定义

**目标**：更新 `types.ts` 中的类型以适配 AgentHarness。

| 类型 | 变更 |
|:-----|:-----|
| `AgentType` | 保持 `"pi-agent"`（内部实现变更，外部标识不变） |
| `PiAgentConfig` | 新增 `thinkingLevel?: string` 字段 |
| `AgentEvent` | 无需新增 compact 事件类型（session_compact 映射为现有 `status` 事件即可） |
| `PermissionConfig` | 不变 |
| `SendMessageOptions` | 不变 |

---

## 五、迁移风险与缓解

| 风险 | 影响 | 缓解措施 |
|:-----|:-----|:---------|
| NodeExecutionEnv 在 /node 子入口 | 导入失败 | 已验证：使用 `import('@earendil-works/pi-agent-core/node')` |
| InMemorySessionRepo 类名差异 | 导入失败 | 已验证：类名是 `InMemorySessionRepo`，非 `MemorySessionRepo` |
| hook 返回值格式差异 | 权限拦截失效 | 已验证：返回 `{ block: true }` 而非 `{ cancel: true }` |
| hook 事件字段名差异 | 运行时错误 | 已验证：`toolName`/`input` 而非 `tool`/`args`，`isError` 直接在 event 上 |
| message_update 事件结构差异 | 流式输出丢失 | 已验证：`event.assistantMessageEvent.delta` 而非 `event.data.text` |
| deletePage 权限确认机制不兼容 | 功能回归 | 保留 deletePage 工具内部的 permission_request 逻辑 |
| AgentHarness.prompt() 抛异常而非返回错误 | 错误处理差异 | 用 try-catch 包装，映射为 AgentError |
| abort() 返回 Promise | 未等待完成 | 确保使用 `await this.harness.abort()` |
| subscribe/on 返回取消订阅函数 | 内存泄漏 | 存储到 unsubFns，在 destroy() 中调用 |
| ESM/CJS 动态导入问题 | 运行时错误 | 复用现有的 `loadPiAgentDeps()` 模式 |
| ImageContent 类型不匹配 | 图片发送失败 | 需适配 `@earendil-works/pi-ai` 的 `ImageContent` 格式 |

---

## 六、验证计划

### 6.1 迁移前验证（Step 0）

在开始任何代码修改前，先写一个独立脚本验证 AgentHarness 的可用性：

```typescript
// test-harness.mjs（ESM 脚本，独立运行）
import { AgentHarness, InMemorySessionRepo, loadSkills } from '@earendil-works/pi-agent-core';
import { NodeExecutionEnv } from '@earendil-works/pi-agent-core/node';
import { getModel } from '@earendil-works/pi-ai';

// 1. 验证导出
console.log('AgentHarness:', typeof AgentHarness);
console.log('InMemorySessionRepo:', typeof InMemorySessionRepo);
console.log('NodeExecutionEnv:', typeof NodeExecutionEnv);
console.log('loadSkills:', typeof loadSkills);

// 2. 验证创建
const env = new NodeExecutionEnv({ cwd: '/tmp' });
const repo = new InMemorySessionRepo();
const session = await repo.create();
const model = getModel('anthropic', 'claude-sonnet-4-20250514');

const harness = new AgentHarness({
  env,
  session,
  tools: [],
  model,
  systemPrompt: 'You are a test assistant.',
});

// 3. 验证事件
const unsub = harness.subscribe((event) => {
  console.log('Event:', event.type);
});

// 4. 验证 hook
const unsubHook = harness.on("tool_call", (event) => {
  console.log('Tool call:', event.toolName, event.input);
  return undefined;
});

// 5. 验证 prompt（需要 API Key）
// const result = await harness.prompt('Hello!');
// console.log('Result:', result);

// 6. 清理
unsub();
unsubHook();
await harness.abort();
await env.cleanup();
```

### 6.2 逐步验证（每个 Step 后）

| Step | 验证方法 |
|:-----|:---------|
| Step 1 | 动态导入成功，所有符号非 undefined |
| Step 2 | InMemorySessionRepo.create() 返回有效 Session |
| Step 3 | AgentHarness 创建成功，无构造错误 |
| Step 4 | getApiKeyAndHeaders 返回正确的 `{ apiKey }` |
| Step 5 | on("tool_call") hook 正确拦截/放行工具调用（返回 `{ block: true }` 阻止） |
| Step 6 | 事件映射正确，前端收到 stream/thought/tool_call/finish 事件 |
| Step 7 | sendMessage 返回正确的 assistant 消息文本 |
| Step 8 | updateSystemPrompt/setModel/cancelPrompt/destroy 正常工作 |
| Step 9 | AgentManager 生命周期管理正常，model 变化不再重建 |
| Step 10 | 类型检查通过 |

### 6.3 集成验证（全部 Step 后）

1. **功能回归测试**：现有 vitest 测试全部通过
2. **端到端测试**：通过 author-site 发送消息，验证完整流程
3. **新能力验证**：
   - [ ] Compaction：长对话后自动压缩上下文
   - [ ] Skills：加载 SKILL.md 文件并调用
   - [ ] 会话树：navigateTree 分支切换
   - [ ] 动态 System Prompt：运行时更新生效
   - [ ] 运行时模型切换：setModel 无需重建

---

## 七、迁移顺序与依赖关系

```
Step 0: 验证 AgentHarness 可用性（前置，阻塞后续所有步骤）
  │
  ├── Step 1: 更新动态导入 ────────────────────────┐
  ├── Step 2: 创建 Session 管理层 ────────────────┤
  │                                               │
  │   ┌───────────────────────────────────────────┘
  │   │
  ├── Step 3: 重写 initialize()（依赖 Step 1, 2）
  │       │
  │       ├── Step 4: 重写 getApiKeyAndHeaders
  │       ├── Step 5: 迁移权限系统到 Hook
  │       ├── Step 6: 重写事件映射
  │       ├── Step 7: 重写 sendMessage
  │       └── Step 8: 重写其他方法
  │               │
  │               └── Step 9: 更新 AgentManager
  │                       │
  │                       └── Step 10: 更新类型定义
  │
  └── 集成验证
```

**建议实施顺序**：
1. 先完成 Step 0（验证脚本），确认 AgentHarness 可用
2. Step 1-2 可并行，无依赖
3. Step 3 是核心，依赖 Step 1-2
4. Step 4-8 是 Step 3 的子任务，可按需顺序实施
5. Step 9-10 在 Step 8 之后

---

## 八、回滚方案

如果迁移遇到不可解决的问题，回滚策略：

1. **Git 分支策略**：在 `feature/agent-harness` 分支上开发，主分支不受影响
2. **渐进式迁移**：保留旧 `Agent` 代码（注释或条件分支），新旧可切换
3. **接口不变**：`IBackendAdapter` 接口不变，前端/路由层无需任何修改

---

## 九、后续扩展（迁移完成后）

迁移到 AgentHarness 后，以下能力可低成本获得：

| 能力 | 实现方式 | 依赖 |
|:-----|:--------|:-----|
| 上下文压缩 | `harness.compact()` | 无新增 |
| 技能系统 | `loadSkills(env, dirs)` + `harness.skill()` + 动态 System Prompt | 无新增 |
| 会话持久化 | `JsonlSessionRepo` 替代 `InMemorySessionRepo` | 无新增 |
| 会话分支 | `harness.navigateTree(targetId)` | 无新增 |
| 工具子集 | `harness.setActiveTools(names)` | 无新增 |
| 运行时工具替换 | `harness.setTools(tools)` | 无新增 |
| 流选项控制 | `harness.setStreamOptions()` / `on("before_provider_request")` | 无新增 |
| 引导消息 | `harness.steer()` / `harness.followUp()` | 无新增 |
| MCP 支持 | 新建 `mcp-tool.ts` | `@modelcontextprotocol/sdk` |
| 文档解析 | 新建 `doc-parser-tool.ts` | `@llamaindex/liteparse` |

---

## 附录：v1.0 → v2.0 修正记录

| 项目 | v1.0（错误） | v2.0（已验证修正） |
|:-----|:------------|:-----------------|
| SessionRepo 类名 | `MemorySessionRepo` | `InMemorySessionRepo` |
| NodeExecutionEnv 导入路径 | 主入口 `@earendil-works/pi-agent-core` | 子入口 `@earendil-works/pi-agent-core/node` |
| on("tool_call") 阻止返回值 | `{ cancel: true }` | `{ block: true, reason?: string }` |
| ToolCallEvent 字段 | `{ tool, args }` | `{ toolName, input, toolCallId }` |
| ToolResultEvent 字段 | `event.tool.name`, `event.result?.isError`, `event.tool.args` | `event.toolName`, `event.isError`, `event.input` |
| message_update 事件结构 | `event.data?.type`, `event.data.text` | `event.assistantMessageEvent.type`, `event.assistantMessageEvent.delta` |
| abort() 返回值 | void | `Promise<AbortResult>` |
| subscribe()/on() 返回值 | 未提及 | 返回取消订阅函数 `() => void` |
| systemPrompt 动态函数上下文 | `(context: any) => string` | `(context: { env, session, model, thinkingLevel, activeTools, resources }) => string \| Promise<string>` |
| InMemorySessionRepo.create() 参数 | "需确认" | `options?: { id?: string }`（极简） |
| 可删除代码量估算 | ~800 行 | ~215 行（精确列出），其余在重写中自然简化 |
| session-store.ts 变更 | "简化" | "不变"（MemorySessionStore 保留管理应用层元数据） |
| AgentType | "保持或改为 pi-harness" | 保持 `"pi-agent"`（内部实现变更，外部标识不变） |
