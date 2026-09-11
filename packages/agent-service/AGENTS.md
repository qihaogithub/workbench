# AGENTS.md — @workbench/agent-service

> 本文件为 AI 编码代理提供在此包中工作的指南。

## 包概览

`@workbench/agent-service` 是一个独立的 Agent 服务包，基于 **Pi Agent**（`@earendil-works/pi-agent-core`）进程内嵌入实现，与单个 LLM 通信。

> **历史**：本包早期基于 ACP (Agent Client Protocol) 协议支持 14 种后端（workbench、Claude、Codex、Gemini、Qwen、Goose、Auggie、Kimi、Copilot、Qoder、Vibe、自定义等）。经评估后于 2026-06 全面迁移至 Pi Agent，移除了多后端支持（见 `docs/plans/进行中/全面迁移至Pi-Agent并移除多后端支持方案.md`）。

## 目录结构

```
src/
├── backends/               # Agent 后端适配器
│   ├── base.ts             # 后端适配器接口（IBackendAdapter）
│   ├── pi-agent.ts         # Pi Agent 后端实现（协调者，委托各管理器）
│   ├── managers/           # PiAgentBackend 的专职管理器（职责分离）
│   │   ├── pi-agent-deps.ts          # 动态依赖加载器（pi-agent-core/pi-ai）
│   │   ├── assistant-text-utils.ts   # Assistant 消息解析工具函数
│   │   ├── model-manager.ts          # 模型管理（解析、API密钥、提供商配置）
│   │   ├── permission-manager.ts     # 权限管理（路径校验、知识库保护、确认机制）
│   │   ├── tool-hook-manager.ts      # 工具钩子（文件变更捕获、文件操作事件、计划更新）
│   │   └── event-mapper.ts           # 事件映射（AgentHarness 事件 → 应用层 AgentEvent）
│   ├── pi-tools/           # Pi Agent 工具集
│   │   ├── index.ts        # 工具导出与能力集版本
│   │   ├── file-tools.ts   # 文件操作工具
│   │   ├── read-file-lines-tool.ts # 带行号读取文件
│   │   ├── edit-file-tool.ts # 精确编辑文件（old_string/new_string 替换）
│   │   ├── bash-tool.ts    # Shell 白名单（11 个只读命令）
│   │   ├── schema-tool.ts  # config.schema.json 校验
│   │   ├── save-image-tool.ts # 图片保存工具（图床 + SHA256 去重）
│   │   ├── generate-image-tool.ts # 文生图工具（IMAGE_GEN_* API，仅图片子 Agent）
│   │   ├── extract-image-element-tool.ts # 语义抠图工具（CLIPSeg + sharp，仅图片子 Agent）
│   │   ├── image-segmenter.ts # CLIPSeg 懒加载单例（零样本文本-图像分割）
│   │   ├── image-store-register.ts # 图片注册到项目 manifest 的共享 helper
│   │   ├── console-tool.ts # 页面控制台日志获取工具
│   │   ├── list-images-tool.ts # 项目图片清单查询
│   │   ├── screenshot-tool.ts # 页面截图捕获工具
│   │   ├── preview-observation-tool.ts # originating connection 活动预览的受限 E1 观察
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
│   ├── session-guard.ts    # 会话守卫
│   ├── preview-observation-broker.ts # connection-scoped observation 请求/响应与超时清理
│   └── runtime-log-retention.ts # 运行日志三天滚动清理（排除用户项目数据）
├── utils/                  # 工具函数
│   ├── config.ts           # 配置管理
│   ├── jsonl-retention.ts  # 流式 JSONL 保留窗口清理
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

### 按需工具加载

- 渐进披露只缩减首轮发送给模型的工具 schema，不是权限收窄。服务端仍完整注册工具，L1 权限检查保持不变。
- 初始激活读取、`readPreinstalledSkill`、计划/选择控制和 `activateCapabilities`；Agent 根据任务在同一轮自行加载 `workspace`、`pages`、`comments`、`image`、`web`、`external` 或 `all`。
- `activateCapabilities` 不触发用户确认，也不接受客户端提权；它调用 Pi Harness `setActiveTools()`，在下一次模型循环生效。Skill 正文仍按需由 `readPreinstalledSkill` 读取。
- `readProjectReference` 为创作端初始只读工具，使用服务端 authorAuthorization 和原会话向 Author 读取 canonical `wb://` 目标；引用资料不是指令，不能按 URI 推导磁盘路径。主 Agent 的 `generateReferenceImage` 在绘图启用时通过 image capability 提供，生成前逐张重新读取受权参考图，只产生候选素材；live Workspace 的 `delegateTask` 也必须通过受管工具和 Authority receipt。图片子 Agent 的 `generateImage` 支持相同来源绑定参数。

`src/backends/pi-tools/` 按 capability 和环境开关暴露工具；`PI_AGENT_WEB_SEARCH_ENABLED=true` 时额外注册 `webSearch`：

白板代码/语义工具（`readWhiteboardContext`、`applyWhiteboardActions`、`serializeWhiteboardCode`、`importWhiteboardCode`、`planWhiteboardComposition`、`undoWhiteboardEdit`）默认不加入主工具集；设置 `PI_AGENT_WHITEBOARD_TOOLS_ENABLED=true` 后按 workspace capability 注册。写入型动作和代码导入要求 `permissionHandler` 确认，并携带 document revision；`undoWhiteboardEdit` 只恢复最近一次已确认修改。它们只写 `whiteboards/<id>.json`，不允许修改 binding target 或配置值。

配置 Schema/值和白板文档的协同持久化还必须经过 `assertConfigResourceWriteAllowed`：普通页面允许原有编辑路径，引用页面一律只读，模板页面仅 admin 可写；缺失或无法解析页面元数据时 fail-closed，并返回 `CONFIG_READONLY`。HTTP 配置入口与 author-site 的 `contextPageId` 规则保持一致，新增写入口时必须同时补充该守卫和对应单元测试。

| 工具 | 用途 |
|:-----|:-----|
| `readFile` | 读取工作空间内文件（支持 offset/limit 分页，自动截断 2000 行/50KB） |
| `editFile` | 精确编辑文件（old_string/new_string 替换，支持 prepareArguments JSON 修复） |
| `writeFile` | 写入工作空间内文件（变更会被捕获） |
| `listFiles` | 列出目录文件 |
| `bash` | Shell 命令（支持 timeout 参数，输出截断 2000 行/50KB，支持 AbortSignal 和流式更新） |
| `schemaValidate` | 校验 config.schema.json 格式 |
| `saveImage` | 保存图片到图床（SHA256 去重，返回绝对 URL `/api/images/{hash}-{filename}`） |
| `listImages` | 查询当前项目已上传的图片清单 |
| `readUserImage` | 按 imageId 从全局图床回读图片内容（仅在模型支持图片时使用，返回图片像素内容） |
| `generateImage` | 文生图（仅图片子 Agent 工具集）：复用共享生成服务，校验模型能力并将 b64 图片写入全局图床，支持尺寸/多变体/配额/重试 |
| `extractImageElement` | 语义抠图（仅图片子 Agent 工具集）：CLIPSeg 零样本文本-图像分割 + sharp 合成透明 PNG，支持 softEdge/invert/threshold |
| `getConsoleLogs` | 获取页面控制台日志 |
| `captureScreenshot` | 捕获页面截图 |
| `observePreview` | 通过 originating WebSocket connection 观察活动单页的受限 E1 DOM/runtime facts；仅支持声明式 target/assertion，不执行任意页面脚本或跨标签页读取 |
| `readPreinstalledSkill` | 按名称读取 agent-service 内置的预装 Skill 全文 |
| `webRead` | 读取公开 HTTP/HTTPS 网页正文，拒绝本机、内网、保留地址和非文本内容 |
| `webSearch` | 使用 Brave Search API 查询公开互联网搜索结果（默认关闭，需要 `BRAVE_SEARCH_API_KEY`） |
| `listPages` | 查询工作空间页面清单 |
| `inspectConfigVisibility` / `validateConfigVisibility` | 读取稳定页面/区域和配置上下文，严格校验候选 v1 联动规则 |
| `explainConfigVisibility` / `repairConfigVisibility` / `migrateConfigVisibility` | 只读解释、规范化修复和 legacy 规则迁移；均不直接写入工作区 |
| `prepareConfigVisibilityDraft` / `commitConfigVisibilityDraft` | 以基线 revision/rootHash 准备多文件配置联动草稿，并在用户批准实际草稿后通过 Authority receipt 原子提交 |
| `deletePage` | 删除单个页面（需要权限确认） |
| `deletePages` | 批量删除页面（需要权限确认） |
| `delegateTask` | 将独立任务委派给短生命周期子 Agent，子 Agent 可读写允许范围内文件，结果和文件变更回传主 Agent；live Workspace 下通过 Authority 受管工具写入，使用 child runId 与 `subagent` actor。`subagentType: "image"` 时启动定向图片子 Agent（仅图像工具 + vision 模型），用于前置批量生成/抠图 |

### Shell 白名单

当前默认白名单在 `pi-tools/permissions.ts`：`node`、`ls`、`cat`、`head`、`tail`、`grep`、`find`、`wc`、`echo`；`npm`、`npx`、`node -e`、`rm`、`mv` 等默认拒绝。

如果当前 `workingDir` 是 `scope=live` Workspace，`bash-tool` 会追加单写者防线：拒绝 `node`、`npm`、`npx`、重定向、heredoc、管道、命令连接符、命令替换、`tee` 和 `xargs` 等可能产生写副作用或绕过 Authority 的命令；需要写入时必须走受管工具或 Workspace Mutation Authority。拒绝结果保留 `WORKSPACE_AUTHORITY_REQUIRED` 总类，同时通过 `details.reason` 区分 Shell 组合语法、脚本运行时和其它只读限制，并给模型返回单命令替代提示；不要把管道被拒绝描述成所有只读命令均不可用。

live Workspace 的 `writeFile`/`editFile` 及其它 Agent 文件工具不得再尝试 Yjs 写入后静默 fallback；它们先读取 Authority snapshot，提交时由 `AgentFileQueue` 按 `dataDir + workspaceId + normalizedPath` 对同一资源串行化，并由 Authority 校验 `expectedHash`/`expectedAbsent`。不同资源可以并行，冲突必须返回 `WORKSPACE_RESOURCE_CONFLICT`。每轮消息更新 `AgentConfig.runId`，子 Agent 使用独立 child runId 和 `mutationActor: "subagent"`；Authority receipt 和诊断保留 sessionId/runId，便于多人、多 Agent 交错时追踪和恢复。

`schemaValidate` 不只检查 JSON 语法，还递归检查 Workbench 配置契约；`visibleWhen` 必须使用 `{ field, equals }`，只能引用当前对象作用域内的兄弟字段，并覆盖 `items.oneOf` / `variants`。新 Schema 推荐直接在字段上声明 `visibleWhen`，但运行时同样支持 `ui:options.visibleWhen`；不要重复或冲突声明，也不得把两种位置之间的移动当作功能修复。工具结果固定返回 `validationScope=schema_contract` 和 `uiBehaviorVerified=false`：Schema 合法不等于当前配置面板行为已验证。用户要求实际 UI 效果时，必须完成真实界面验收；否则只报告“修改已写入、效果待验证”。

配置驱动页面状态统一使用共享 v1 `visibility-rules` 协议；支持 `oneOf`、`all`/`any`、不可用/备用页/替代区域策略和服务端非特权 role 只读上下文，公开规则禁止 user ID。组合条件只在 predicate 内声明来源；备用页不得成环，替代区域仅限目标页内的专用区域。普通 Schema/配置值写入不依赖计划审批，但 Authority 会校验 JSON、Schema/值契约、资源引用和现有 visibility 引用完整性；`project.visibility-rules.json` 只能通过 `visibility-draft` workflow，并在用户批准实际草稿后原子提交。prepare 失败时保留按 workspace 隔离的短期诊断草稿。页面代码已变更但没有规则提交 receipt 时，完成报告会被 `tool-hook-manager` 标记为未完成。

如果当前 `workingDir` 是 `scope=live` Workspace，`delegateTask` 可以启动受管子 Agent runner，但子 Agent 的文件工具必须继续走 Authority、文件级队列、expectedHash/expectedAbsent 和 durable receipt；bash 仍保持只读旁路防线，且子 Agent 不能继续委派。禁止把短生命周期 Agent 直接暴露给裸 Workspace 写权限。

## 配置（环境变量）

```bash
# 必填
PI_AGENT_API_KEY=sk-...

# 选填（有默认值）
PI_AGENT_PROVIDER=jojo                # anthropic / openai / google / 自定义 provider
PI_AGENT_MODEL=deepseek-v4-flash      # 模型 ID
PI_AGENT_BASE_URL=https://token.xjjj.co/v1  # 自定义 API 基础地址（OpenAI 兼容格式）
PI_AGENT_TIMEOUT=120000               # 超时时间（毫秒）
SCREENSHOT_SERVICE_URL=http://localhost:4202  # 本地截图服务地址（Docker 内显式注入 3202）
PI_AGENT_SUBAGENTS_ENABLED=true       # 是否启用 delegateTask 子 Agent 工具
PI_AGENT_WHITEBOARD_TOOLS_ENABLED=false # 是否注册白板 document/代码/语义 action、计划与撤销工具
PI_AGENT_SUBAGENT_TIMEOUT=120000      # 子 Agent 单次任务超时时间（毫秒）
PI_AGENT_WEB_READ_ENABLED=true        # 是否启用 webRead 网页读取工具
PI_AGENT_WEB_READ_TIMEOUT_MS=10000    # webRead 单次请求超时
PI_AGENT_WEB_READ_MAX_BYTES=1000000   # webRead 最大响应体积
PI_AGENT_WEB_SEARCH_ENABLED=false     # 是否启用 webSearch 联网搜索工具
BRAVE_SEARCH_API_KEY=                 # Brave Search API key（免费额度方案）
PI_AGENT_WEB_SEARCH_TIMEOUT_MS=10000  # webSearch 单次请求超时
PI_AGENT_WEB_SEARCH_CACHE_TTL_MS=600000 # webSearch 进程内缓存 TTL
PI_AGENT_PREINSTALLED_SKILLS_DIR=     # 可选：覆盖预装 Skill 目录，默认使用随包发布的 preinstalled-skills

# 图像子 Agent（文生图/抠图，`generateImage`/`extractImageElement` 工具）
# 配置来源：管理后台「绘图配置」优先（PUT /internal/image-gen 覆盖内存），
# 以下环境变量仅作未配置时的默认值
IMAGE_GEN_ENABLED=false               # 总开关（默认关闭）
IMAGE_GEN_API_KEY=sk-...              # 图像生成 API key（OpenAI 兼容）
IMAGE_GEN_BASE_URL=https://xxx/v1     # 图像生成 baseURL（OpenAI 兼容 /v1，默认 OpenAI）
IMAGE_GEN_MODEL=dall-e-3             # 图像生成模型
IMAGE_GEN_API_PROFILE=auto            # auto/gpt-image/dall-e-3/generation-only 能力档案
IMAGE_GEN_TIMEOUT_MS=60000            # 单次生成超时
IMAGE_GEN_MAX_PER_SESSION=30          # 每会话最大生成数
IMAGE_GEN_MAX_RETRIES=3               # 失败重试次数
IMAGE_GEN_CONCURRENCY=2               # 并发池（当前图片子 Agent 走 delegateTask 同步，暂未使用）
IMAGE_GEN_MAX_PROMPT_LEN=1000         # prompt 最大字符数
```

完整配置加载逻辑见 `src/utils/config.ts`。

### 运行日志与 Authority journal

`src/session/runtime-log-retention.ts` 在启动及每 30 分钟清理三天前的 Agent run log、诊断 spool 和 Authority journal/ack。`projects/`、`workspaces/`、`collab-state/`、`sessions/`、`screenshots/`、`preview-modules/` 与 `audit/` 等用户项目数据始终排除。Authority `journal.jsonl` 的 `prepared` 行只记录元数据摘要；真正用于恢复的 `prepared/`、`backups/` 和 `receipts/` 不由该日志策略替代。`observePreview` 的 run log 只保存 identity/状态/断言类型/证据类型/耗时/大小等脱敏摘要；工具失败、超时、断连或缺失终态按固定 `unavailable` 记录，不持久化 observation 原文、节点文本、URL 或原始错误消息。

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
  appendHistoryMessage?(role: string, content: string): Promise<void>;
}
```

## 运行取消状态

- `BackendAgent` 在取消、无进展超时或绝对超时后先进入 `cancelling`，此时仍保持 busy，禁止把 Agent 复用于下一条消息。
- `cancelPrompt()` 可以异步；只有底层 prompt 实际收束后，`sendMessage()` 才释放 busy 并转为 `ready`。WebSocket 的 `cancel` 指令只能推送 `cancelling`，不得提前伪报 `ready`。

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
| **管理器单元测试** | 各管理器（Model/Permission/ToolHook/EventMapper）独立测试 | `tests/unit/{model,permission,tool-hook,event-mapper}-manager.test.ts` |
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
- **进程内嵌入**：`@earendil-works/pi-agent-core` 以动态导入方式加载（统一由 `managers/pi-agent-deps.ts` 管理）
- **超时处理**：`MESSAGE_TIMEOUT_MS = 300000`（5 分钟）— `src/routes/websocket.ts:59`
- **管理器架构**：`PiAgentBackend` 作为协调者，将职责委托给 `managers/` 下的专职管理器：
  - `ModelManager`：模型解析、API 密钥获取、提供商配置、模型切换
  - `PermissionManager`：路径权限校验、知识库写保护、deletePage 权限确认、计划审批
  - `ToolHookManager`：文件变更捕获、文件操作事件发射、计划更新、知识库读取追踪
  - `EventMapper`：AgentHarness 底层事件 → 应用层 AgentEvent 的映射
- **文件操作**：`ToolHookManager` 在 `tool_result` hook 中捕获 `writeFile/editFile` 变更
- **路径安全**：`PermissionManager.validateToolCall` 拦截 `readFile/writeFile/listFiles` 的越权访问
- **编辑重发与重新生成**：浏览器不得回传历史数组，`resync_history` 协议已删除。author-site 通过 Conversation Ledger 的 `supersede/retry` 和 revision 提交结构变更，agent-service 在 run start 时从权威账本恢复上下文。
- **上下文压缩**：`PiAgentBackend` 在 `harness.prompt()` 前按模型 `contextWindow`、`maxTokens`、16k 压缩预留和安全余量预检；达到阈值后调用 `harness.compact()`。供应商仍返回上下文超限时，最多压缩并重发同一请求一次。完成时通过 `context_compacted` 事件通知 UI，绝不将压缩摘要或原始消息写入事件日志。
- **图片上下文策略**：用户上传的图片仅在发送当轮以原始像素进入当前 LLM 上下文；之后每轮通过 `context` hook（`stripExpiredImageParts`，`src/utils/image-context-strip.ts`）剥离所有历史消息（含 user、assistant、toolResult）中的 image part，仅保留入库 URL 引用文本。`readUserImage` 工具可让模型按需从全局图床重新加载历史图片。
- **图片子 Agent**：`delegateTask` 支持 `subagentType: "image"` 启动定向图片子 Agent，工具集仅含 generateImage/extractImageElement/saveImage/listImages/readUserImage/readFile/writeFile（`createWorkbenchTools({ imageSubagent: true })`），继承当前多模态模型并通过专属 system prompt 自我评判（generateImage → readUserImage → 不满意重试 → 满意继续）。**两个图像工具仅注册给图片子 Agent，主 Agent 工具集中不包含。** **可见性门控**：`delegateTask` 的 `subagentType: "image"` 参数/描述仅在绘图配置启用时对主 Agent 暴露（`createDelegateTaskTool` 的 `imageSubagentEnabled` 来自 `getImageGenConfig().enabled`）；未启用时主 Agent 不知道图片子 Agent，模型强行传入会被工具层拒绝（`image_subagent_disabled`）。
- **绘图配置来源**：图像生成配置（`src/services/image-gen-config.ts` 运行时单例）由管理后台「绘图配置」推送（`PUT /internal/image-gen`，`src/routes/internal-config.ts`）覆盖内存，环境变量仅作默认值。`IMAGE_GEN_API_PROFILE` 用于选择 `auto`、`gpt-image`、`dall-e-3` 或保守的 `generation-only` 能力档案；未知模型不得自动获得参考图、多图或高分辨率能力。`generateImage`/`extractImageElement` 缺席配置时返回明确错误。
- **共享图像生成服务**：`src/services/image-generation-service.ts` 统一处理能力、参数、配额、重试、超时、取消与响应解析；图片子 Agent 和受内部令牌保护的 `/internal/image-gen/capabilities`、`/internal/image-gen/generate` 必须复用它。无参考图走 `/images/generations` JSON，有参考图且档案允许时走 `/images/edits` multipart；供应商 URL 响应不得由该服务直接下载。

## 相关文档

- [迁移方案](../../docs/plans/进行中/全面迁移至Pi-Agent并移除多后端支持方案.md)
