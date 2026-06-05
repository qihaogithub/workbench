# Pi Agent 迁移到 AgentHarness 计划

> 版本：v1.0
> 创建日期：2026-06-05
> 状态：待实施
> 类型：迁移计划
> 关联：[Pi-Agent扩展能力集成方案 v3.0](./Pi-Agent扩展能力集成方案.md)

---

## 一、迁移目标

将 `PiAgentBackend` 从底层 `Agent` 类迁移到高层 `AgentHarness` 类，两者均在 `@earendil-works/pi-agent-core@0.76.0` 中。

**预期收益**：

| 收益 | 说明 |
|:-----|:-----|
| 消除 ~800 行自研代码 | AgentManager、MemorySessionStore 的大部分逻辑可删除 |
| 获得内置 Compaction | `AgentHarness.compact()` — LLM 摘要压缩，自动管理切割点 |
| 获得内置 Skills | `loadSkills()` + `skill()` — Markdown 声明式技能 |
| 获得会话树 | `navigateTree()` — 分支切换、历史回溯 |
| 获得动态 System Prompt | 每次自动重新生成，支持注入上下文信息 |
| 获得 Hook 事件 | `on("tool_call")` — 可阻止/修改工具调用，替代 beforeToolCall |
| 工具零迁移 | AgentHarness 使用相同的 `AgentTool` 接口 |
| 零新增依赖 | AgentHarness 在已安装的 pi-agent-core 内 |

---

## 二、迁移范围

### 2.1 需要修改的文件

| 文件 | 变更类型 | 说明 |
|:-----|:--------|:-----|
| `backends/pi-agent.ts` | **重写** | 核心迁移：Agent → AgentHarness |
| `core/agent-manager.ts` | **简化** | 保留框架，内部调用改为 AgentHarness API |
| `session/session-store.ts` | **简化** | SessionMeta 保留，底层存储迁移到 MemorySessionRepo |
| `core/types.ts` | **修改** | 更新 PiAgentConfig、AgentEvent 类型 |
| `backends/pi-tools/permissions.ts` | **小改** | 权限逻辑保留，接入方式改为 hook |
| `backends/pi-tools/index.ts` | **小改** | 工具创建函数签名可能微调 |

### 2.2 无需修改的文件

| 文件 | 说明 |
|:-----|:-----|
| `backends/base.ts` | IBackendAdapter 接口不变 |
| `backends/pi-tools/*.ts`（11 个工具） | AgentTool 接口不变，工具实现不变 |
| `config/backend-providers.ts` | 保留，多供应商管理比 getApiKeyAndHeaders 更复杂 |
| `core/backend-agent.ts` | 适配层，接口不变 |
| `core/agent-factory.ts` | 工厂，接口不变 |
| 所有路由文件 | HTTP/WebSocket 接口不变 |
| `events/event-bus.ts` | 事件总线不变 |

### 2.3 可删除的代码

| 代码 | 文件 | 行数 | 原因 |
|:-----|:-----|:-----|:-----|
| AgentManager 中的会话复用逻辑 | agent-manager.ts | ~40 行 | AgentHarness + Session 内置管理 |
| MemorySessionStore 过期清理 | session-store.ts | ~60 行 | SessionRepo 内置生命周期 |
| 事件映射函数 | pi-agent.ts | ~80 行 | AgentHarness 事件更直接 |
| getApiKey 回调链 | pi-agent.ts | ~30 行 | getApiKeyAndHeaders 更简洁 |
| beforeToolCall/afterToolCall 钩子 | pi-agent.ts | ~60 行 | on("tool_call")/on("tool_result") hook 替代 |
| 手动 waitForIdle + 消息提取 | pi-agent.ts | ~30 行 | AgentHarness.prompt() 直接返回结果 |

---

## 三、分步迁移计划

### Step 1：创建 ExecutionEnv 适配器

**目标**：实现 `ExecutionEnv` 接口，桥接当前项目的文件系统和 Shell 操作。

**方案选择**：

| 方案 | 说明 | 推荐 |
|:-----|:-----|:-----|
| A. 直接使用 `NodeExecutionEnv` | pi-agent-core 内置，零开发量 | ✅ 推荐 |
| B. 自定义 `WorkbenchExecutionEnv` | 包装 NodeExecutionEnv，注入权限检查 | 备选 |

**推荐方案 A**：直接使用 `NodeExecutionEnv`，权限检查通过 `on("tool_call")` hook 实现，而非在 ExecutionEnv 层拦截。

**具体操作**：

1. 在 `pi-agent.ts` 的动态导入中增加 `NodeExecutionEnv`：
```typescript
// 现有
let Agent: any; let streamSimple: any; let getModel: any; let getModels: any;

// 新增
let AgentHarness: any; let NodeExecutionEnv: any;
let Session: any; let MemorySessionRepo: any;
let loadSkills: any;

async function loadPiAgentDeps() {
  const piAgentCore = await import('@earendil-works/pi-agent-core');
  Agent = piAgentCore.Agent;
  AgentHarness = piAgentCore.AgentHarness;       // 新增
  NodeExecutionEnv = piAgentCore.NodeExecutionEnv; // 新增
  Session = piAgentCore.Session;                   // 新增（从 harness 子模块导出）
  MemorySessionRepo = piAgentCore.MemorySessionRepo; // 新增
  loadSkills = piAgentCore.loadSkills;             // 新增

  const piAi = await import('@earendil-works/pi-ai');
  streamSimple = piAi.streamSimple;
  getModel = piAi.getModel;
  getModels = piAi.getModels;
}
```

2. 验证 `NodeExecutionEnv` 的导出路径（可能在 `/node` 子入口）

**验证点**：
- [ ] 确认 `AgentHarness`、`NodeExecutionEnv`、`Session`、`MemorySessionRepo`、`loadSkills` 的正确导入路径
- [ ] 确认 `NodeExecutionEnv` 的构造参数（`{ cwd, shellPath?, shellEnv? }`）满足需求

---

### Step 2：创建 Session 管理层

**目标**：用 pi-agent-core 的 `Session` + `MemorySessionRepo` 替代自研的 `MemorySessionStore`。

**当前 MemorySessionStore 的职责**：
- 存储 `SessionMeta`（sessionId, demoId, workingDir, status 等）
- 过期清理（2 小时超时，5 分钟检查）
- 按 status/demoId 过滤列表

**迁移策略**：**保留 MemorySessionStore 管理应用层元数据，新增 Session 管理 Agent 层会话状态**。

```
当前：MemorySessionStore → SessionMeta（应用层元数据）
迁移后：MemorySessionStore → SessionMeta（应用层元数据，保留）
        + SessionRepo → Session（Agent 层会话状态，新增）
```

**原因**：`SessionMeta` 包含 `demoId`、`workspaceType`、`snapshotMode` 等应用层概念，pi-agent-core 的 `Session` 不了解这些。两层各管各的。

**具体操作**：

1. 在 `PiAgentBackend` 中新增 `session` 属性：
```typescript
private session: any = null;      // pi-agent-core Session 对象
private sessionRepo: any = null;   // pi-agent-core SessionRepo
```

2. 在 `initialize()` 中创建 Session：
```typescript
// 创建 SessionRepo（内存模式，与当前行为一致）
this.sessionRepo = new MemorySessionRepo();

// 创建 Session
this.session = await this.sessionRepo.create({
  // Session 创建选项，需确认 MemorySessionRepo 的 create 参数
});
```

3. 保留 `MemorySessionStore` 不变，继续管理应用层元数据

**验证点**：
- [ ] 确认 `MemorySessionRepo.create()` 的参数格式
- [ ] 确认 Session 与 AgentHarness 的绑定方式
- [ ] 确认 Session 的 `metadata` 泛型是否可以存储自定义数据

---

### Step 3：重写 PiAgentBackend.initialize()

**目标**：将 `new Agent({...})` 替换为 `new AgentHarness({...})`。

**当前 initialize() 核心逻辑**（简化）：
```typescript
async initialize() {
  await loadPiAgentDeps();
  const tools = createWorkbenchTools(this.config);
  const model = await this.getModel();

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
  this.env = new NodeExecutionEnv({ cwd: this.config.workingDir });

  // 2. 创建 Session
  this.sessionRepo = new MemorySessionRepo();
  this.session = await this.sessionRepo.create({ /* ... */ });

  // 3. 创建工具
  const tools = createWorkbenchTools(this.config);

  // 4. 获取模型
  const model = await this.getModel();

  // 5. 创建 AgentHarness
  this.harness = new AgentHarness({
    env: this.env,
    session: this.session,
    tools,
    model,
    systemPrompt: (context) => this.buildSystemPrompt(context),
    getApiKeyAndHeaders: (model) => this.getApiKeyAndHeaders(model),
    thinkingLevel: 'off',  // 默认关闭思考
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
| `initialState.systemPrompt` | `systemPrompt: (ctx) => string` | 改为动态函数 |
| `initialState.tools` | `tools` | 直接传给构造函数 |
| `streamFn: streamSimple` | **删除** | AgentHarness 内部使用 streamSimple |
| `getApiKey(provider)` | `getApiKeyAndHeaders(model)` | 参数和返回值变化 |
| `beforeToolCall` | `on("tool_call", handler)` | hook 模式，可返回 `{ cancel: true }` |
| `afterToolCall` | `on("tool_result", handler)` | hook 模式，可修改结果 |

**验证点**：
- [ ] 确认 AgentHarness 构造函数是否需要 `streamFn` 参数
- [ ] 确认 `systemPrompt` 动态函数的调用时机和参数
- [ ] 确认 `getApiKeyAndHeaders` 返回 `undefined` 时的行为

---

### Step 4：重写 getApiKeyAndHeaders

**目标**：将当前的 `getApiKey(provider)` 回调迁移为 `getApiKeyAndHeaders(model)`。

**当前 getApiKey 逻辑**（在 initialize 中内联）：
```typescript
getApiKey: async (provider: string) => {
  // 解析链：backendProviders > model.apiKey > config.piAgent.apiKey > env var > serviceConfig
  const providerConfig = backendProviders.getProvider(activeProviderId);
  if (providerConfig?.apiKey) return providerConfig.apiKey;
  // ... 更多 fallback
  return process.env.PI_AGENT_API_KEY;
}
```

**迁移后 getApiKeyAndHeaders**：
```typescript
private async getApiKeyAndHeaders(model: any): Promise<{ apiKey: string; headers?: Record<string, string> } | undefined> {
  // 复用 BackendProvidersManager 的解析逻辑
  const providerConfig = this.backendProviders.getProvider(this.backendProviders.getActiveProviderId());
  if (providerConfig?.apiKey) {
    return { apiKey: providerConfig.apiKey };
  }
  // ... 更多 fallback（与当前逻辑相同）
  const apiKey = process.env.PI_AGENT_API_KEY;
  return apiKey ? { apiKey } : undefined;
}
```

**变更点**：
- 参数从 `provider: string` 改为 `model: Model<any>`
- 返回值从 `string | undefined` 改为 `{ apiKey, headers? } | undefined`
- 支持返回 headers（为 OAuth 等场景预留）

**保留 BackendProvidersManager 的原因**：
- 它管理多供应商配置（API Key、Base URL、模型列表）
- 支持运行时热更新（author-site 推送）
- `getApiKeyAndHeaders` 只需从 BackendProvidersManager 读取数据

---

### Step 5：迁移权限系统到 Hook

**目标**：将 `beforeToolCall` 中的权限检查迁移到 `on("tool_call")` hook。

**当前 beforeToolCall 逻辑**（3 类拦截）：
1. 知识库写保护（拦截 writeFile 对 knowledge/ 的写入）
2. 路径权限校验（readFile/writeFile/listFiles）
3. deletePage 人工确认（发出 permission_request 事件，等待 60 秒）

**迁移后**：
```typescript
private setupHooks() {
  // 替代 beforeToolCall — 权限检查
  this.harness.on("tool_call", (event) => {
    const { tool, args } = event;

    // 1. 路径权限校验
    if (['readFile', 'writeFile', 'listFiles'].includes(tool.name)) {
      const targetPath = args.path || args.filePath;
      if (!isPathAllowed(targetPath, this.config.workingDir, this.config.permissions)) {
        return { cancel: true };  // 阻止工具调用
      }
    }

    // 2. 知识库写保护
    if (tool.name === 'writeFile' && args.path?.includes('knowledge/')) {
      return { cancel: true };
    }

    // 3. deletePage 人工确认 — 不在 hook 中处理
    //    改为在 deletePage 工具内部发出 permission_request 事件
    //    （与当前行为一致，只是触发方式不同）

    return undefined;  // 允许工具调用
  });

  // 替代 afterToolCall — 捕获文件变更
  this.harness.on("tool_result", (event) => {
    if (event.tool.name === 'writeFile' && !event.result?.isError) {
      this.files.push({
        path: event.tool.args.path,
        action: 'modified',
        content: event.tool.args.content,
      });
    }
    return undefined;  // 不修改结果
  });
}
```

**关键差异**：
- `beforeToolCall` 返回 `true` 表示跳过工具，`on("tool_call")` 返回 `{ cancel: true }` 表示阻止
- `afterToolCall` 只能观察结果，`on("tool_result")` 可以修改 `content`/`details`/`isError`/`terminate`
- deletePage 的权限确认逻辑保留在工具内部（通过 permission_request 事件），不在 hook 中处理

---

### Step 6：重写事件映射

**目标**：将 Agent 事件映射迁移为 AgentHarness 事件映射。

**当前事件映射**：
| Pi Agent 事件 | 内部事件 |
|:---|:---|
| `message_update.text_delta` | `stream` |
| `message_update.thinking_delta` | `thought` |
| `tool_execution_start` | `tool_call` |
| `tool_execution_end` | `tool_call_update` |
| `agent_end` | `finish` |

**迁移后事件映射**：
```typescript
private setupEventMapping() {
  this.harness.subscribe((event: any) => {
    switch (event.type) {
      // 流式文本
      case 'message_update':
        if (event.data?.type === 'text_delta') {
          this.emitAgentEvent({ type: 'stream', content: event.data.text });
        } else if (event.data?.type === 'thinking_delta') {
          this.emitAgentEvent({ type: 'thought', content: event.data.thinking });
        }
        break;

      // 工具调用
      case 'tool_execution_start':
        this.emitAgentEvent({
          type: 'tool_call',
          toolName: event.data.toolName,
          args: event.data.args,
        });
        break;

      case 'tool_execution_end':
        this.emitAgentEvent({
          type: 'tool_call_update',
          toolName: event.data.toolName,
          result: event.data.result,
        });
        break;

      // Agent 结束
      case 'agent_end':
        this.emitAgentEvent({ type: 'finish' });
        break;

      // 新增：AgentHarness 特有事件
      case 'session_compact':
        this.emitAgentEvent({
          type: 'status',
          message: '上下文已压缩',
        });
        break;

      case 'save_point':
        // 可用于持久化会话状态
        break;
    }
  });
}
```

**新增可利用的事件**（AgentHarness 特有）：
| 事件 | 用途 |
|:-----|:-----|
| `save_point` | turn 结束后的保存点，可用于持久化 |
| `session_compact` | 上下文压缩完成通知 |
| `before_provider_request` | 可修改 provider 请求参数 |
| `resources_update` | Skills/Templates 变更通知 |

---

### Step 7：重写 sendMessage

**目标**：将 `agent.prompt()` + `waitForIdle()` + 手动消息提取替换为 `harness.prompt()`。

**当前 sendMessage 核心逻辑**（简化）：
```typescript
async sendMessage(content, options) {
  // 图片处理
  const promptContent = content;
  const imageContent = this.processImages(options?.images);

  // 发送
  await this.agent.prompt(promptContent, imageContent);
  await this.agent.waitForIdle();

  // 提取最后一条 assistant 消息
  const messages = this.agent.state.messages;
  const lastAssistant = messages.filter(m => m.role === 'assistant').pop();
  return lastAssistant?.content?.[0]?.text || '';
}
```

**迁移后 sendMessage**：
```typescript
async sendMessage(content, options) {
  // 图片处理（逻辑不变）
  const images = this.processImages(options?.images);

  // 发送并直接获取结果
  const result = await this.harness.prompt(content, { images });

  // result 是 AssistantMessage，直接返回文本
  return result.content?.[0]?.text || '';
}
```

**关键简化**：
- `harness.prompt()` 返回 `Promise<AssistantMessage>`，无需手动 `waitForIdle()` 和消息提取
- 图片参数从 `prompt(content, imageContent)` 改为 `prompt(content, { images })`
- 错误处理：`harness.prompt()` 在 agent 错误时抛异常，需 try-catch

---

### Step 8：重写其他方法

| 方法 | 当前实现 | 迁移后 |
|:-----|:--------|:-------|
| `updateSystemPrompt(prompt)` | `this.agent.state.systemPrompt = prompt` | 存储到 `this.currentSystemPrompt`，动态函数自动读取 |
| `cancelPrompt()` | `this.agent.abort()` | `this.harness.abort()` |
| `destroy()` | `this.agent.abort()` + 清理 | `this.harness.abort()` + `this.env.cleanup()` + Session 清理 |
| `setModel(modelId)` | 重建 Agent 实例 | `this.harness.setModel(model)` |
| `getModelInfo()` | 多来源聚合 | 保留（BackendProvidersManager 逻辑不变） |

**updateSystemPrompt 变更**：
```typescript
private currentSystemPrompt: string = '';

// 动态 System Prompt 函数
private buildSystemPrompt(context: any): string {
  return this.currentSystemPrompt || 'You are a helpful assistant.';
}

// 更新 System Prompt（不再直接写 state）
async updateSystemPrompt(newPrompt: string) {
  this.currentSystemPrompt = newPrompt;
  // 下次 turn 自动使用新 prompt，无需重建 AgentHarness
}
```

**setModel 变更**：
```typescript
async setModel(modelId: string) {
  const model = await this.getModel(modelId);
  await this.harness.setModel(model);
  // 无需重建 AgentHarness
}
```

---

### Step 9：更新 AgentManager

**目标**：简化 AgentManager，利用 AgentHarness 的内置能力。

**当前 AgentManager 职责**：
- 按 sessionId 查找/创建 Agent
- 配置变化时更新 Agent
- 空闲清理（2 小时超时）
- 防止并发消息

**迁移后简化**：
- 保留 `getOrCreate()` 逻辑（sessionId → AgentHarness 实例映射）
- 保留 `sendMessage()` 的并发保护
- 保留空闲清理定时器
- **简化 `updateConfig()`**：模型切换用 `harness.setModel()`，无需重建实例
- **简化 `hasConfigChanged()`**：workingDir 变化仍需重建，model 变化不再需要

```typescript
// 简化后的配置变化检测
hasConfigChanged(oldConfig: AgentConfig, newConfig: AgentConfig): boolean {
  // 模型变化不再需要重建（可用 setModel 运行时切换）
  return oldConfig.workingDir !== newConfig.workingDir
      || oldConfig.demoId !== newConfig.demoId;
}
```

---

### Step 10：更新类型定义

**目标**：更新 `types.ts` 中的类型以适配 AgentHarness。

| 类型 | 变更 |
|:-----|:-----|
| `AgentType` | 保持 `"pi-agent"` 或改为 `"pi-harness"` |
| `PiAgentConfig` | 新增 `thinkingLevel?` 字段 |
| `AgentEvent` | 新增 `compact` 事件类型 |
| `PermissionConfig` | 不变 |
| `SendMessageOptions` | 不变 |

---

## 四、迁移风险与缓解

| 风险 | 影响 | 缓解措施 |
|:-----|:-----|:---------|
| AgentHarness 导出路径不确定 | 无法导入 | Step 1 首先验证导出路径，写测试脚本 |
| MemorySessionRepo.create() 参数不明确 | Session 创建失败 | 查看 .d.ts 类型定义，写测试脚本验证 |
| AgentHarness 构造函数参数与文档不一致 | 初始化失败 | 先写最小验证脚本，确认每个参数 |
| 事件类型名称不匹配 | 事件丢失 | 逐步迁移，先 subscribe 全部事件打印日志 |
| deletePage 权限确认机制不兼容 | 功能回归 | 保留 deletePage 工具内部的 permission_request 逻辑 |
| AgentHarness.prompt() 抛异常而非返回错误 | 错误处理差异 | 用 try-catch 包装，映射为 AgentError |
| ESM/CJS 动态导入问题 | 运行时错误 | 复用现有的 `loadPiAgentDeps()` 模式 |

---

## 五、验证计划

### 5.1 迁移前验证（Step 0）

在开始任何代码修改前，先写一个独立脚本验证 AgentHarness 的可用性：

```typescript
// test-harness.mjs（ESM 脚本，独立运行）
import { AgentHarness, NodeExecutionEnv, Session, MemorySessionRepo } from '@earendil-works/pi-agent-core';
import { streamSimple, getModel } from '@earendil-works/pi-ai';

// 1. 验证导出
console.log('AgentHarness:', typeof AgentHarness);
console.log('NodeExecutionEnv:', typeof NodeExecutionEnv);
console.log('MemorySessionRepo:', typeof MemorySessionRepo);

// 2. 验证创建
const env = new NodeExecutionEnv({ cwd: '/tmp' });
const repo = new MemorySessionRepo();
const session = await repo.create({ /* ... */ });
const model = getModel('anthropic', 'claude-sonnet-4-20250514');

const harness = new AgentHarness({
  env,
  session,
  tools: [],
  model,
  systemPrompt: 'You are a test assistant.',
});

// 3. 验证事件
harness.subscribe((event) => {
  console.log('Event:', event.type);
});

// 4. 验证 prompt（需要 API Key）
// const result = await harness.prompt('Hello!');
// console.log('Result:', result);
```

### 5.2 逐步验证（每个 Step 后）

| Step | 验证方法 |
|:-----|:---------|
| Step 1 | NodeExecutionEnv 创建成功，文件读写正常 |
| Step 2 | Session 创建成功，appendMessage 正常 |
| Step 3 | AgentHarness 创建成功，无构造错误 |
| Step 4 | getApiKeyAndHeaders 返回正确的 apiKey |
| Step 5 | on("tool_call") hook 正确拦截/放行工具调用 |
| Step 6 | 事件映射正确，前端收到 stream/thought/tool_call 事件 |
| Step 7 | sendMessage 返回正确的 assistant 消息 |
| Step 8 | updateSystemPrompt/setModel/cancelPrompt 正常工作 |
| Step 9 | AgentManager 生命周期管理正常 |
| Step 10 | 类型检查通过 |

### 5.3 集成验证（全部 Step 后）

1. **功能回归测试**：现有 vitest 测试全部通过
2. **端到端测试**：通过 author-site 发送消息，验证完整流程
3. **新能力验证**：
   - [ ] Compaction：长对话后自动压缩上下文
   - [ ] Skills：加载 SKILL.md 文件并调用
   - [ ] 会话树：navigateTree 分支切换
   - [ ] 动态 System Prompt：运行时更新生效

---

## 六、迁移顺序与依赖关系

```
Step 0: 验证 AgentHarness 可用性（前置，阻塞后续所有步骤）
  │
  ├── Step 1: 创建 ExecutionEnv ──────────────────┐
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

## 七、回滚方案

如果迁移遇到不可解决的问题，回滚策略：

1. **Git 分支策略**：在 `feature/agent-harness` 分支上开发，主分支不受影响
2. **渐进式迁移**：保留旧 `Agent` 代码（注释或条件分支），新旧可切换
3. **接口不变**：`IBackendAdapter` 接口不变，前端/路由层无需任何修改

---

## 八、后续扩展（迁移完成后）

迁移到 AgentHarness 后，以下能力可低成本获得：

| 能力 | 实现方式 | 依赖 |
|:-----|:--------|:-----|
| 上下文压缩 | `harness.compact()` | 无新增 |
| 技能系统 | `loadSkills(env, dirs)` + 动态 System Prompt | 无新增 |
| 会话持久化 | `JsonlSessionRepo` 替代 `MemorySessionRepo` | 无新增 |
| 会话分支 | `harness.navigateTree(targetId)` | 无新增 |
| 工具子集 | `harness.setActiveTools(names)` | 无新增 |
| MCP 支持 | 新建 `mcp-tool.ts` | `@modelcontextprotocol/sdk` |
| 文档解析 | 新建 `doc-parser-tool.ts` | `@llamaindex/liteparse` |
