### Opencode Workbench 后端 Agent 选型对比分析报告（v2 — 长期最优方案评估）

#### 一、 前言

针对 **Opencode Workbench** 的架构设计与应用场景（局域网企业内部工具，AI 模型通过云端 API 交互，完全采用 Vibe Coding 研发模式），本报告旨在对比评估 **Pi Agent (earendil-works/pi)** 与 **OpenCode Server (`opencode serve`)** 两个技术方案。

**评估原则**：不考虑已有实现的改造成本，纯粹从系统长期最优架构出发进行评估。

**评估重点**：
1. **长期架构可控性** — 系统是否能随业务需求灵活演进
2. **Vibe Coding 友好度** — AI 助手能否高效理解和修改系统
3. **编码质量保障** — 生成代码的可靠性与自我纠错能力
4. **运维复杂度** — 长期维护的成本与风险

---

### 二、 现有系统架构分析

当前 `agent-service` 已实现的架构：

```
┌──────────────────────────────────────────────────────────────────┐
│  agent-service (Fastify, 端口 3201)                               │
│                                                                    │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────────────┐  │
│  │ API Gateway │───▶│ AgentManager │───▶│ AgentFactory        │  │
│  │ (路由/中间件)│    │ (生命周期)    │    │ (后端注册/创建)     │  │
│  └─────────────┘    └──────────────┘    └──────────┬──────────┘  │
│                                                      │              │
│                    ┌─────────────────────────────────┤              │
│                    │                                 │              │
│              ┌─────▼─────┐  ┌────────────┐  ┌───────▼────────┐  │
│              │ opencode-  │  │ claude/    │  │ custom/...     │  │
│              │ http       │  │ codex/gemini│  │ (可扩展)       │  │
│              │ (默认后端)  │  │ (ACP stdio) │  │                │  │
│              └─────┬─────┘  └──────┬─────┘  └───────┬────────┘  │
│                    │               │                  │            │
└────────────────────┼───────────────┼──────────────────┼────────────┘
                     │               │                  │
                     ▼               ▼                  ▼
              opencode serve    Agent CLI         自定义后端
              (HTTP/SSE)        (stdio)            (任意)
```

**关键接口 `IBackendAdapter`**（`backends/base.ts`）：

```typescript
interface IBackendAdapter {
  readonly name: string;
  initialize(): Promise<void>;
  sendMessage(content: string, options?: { stream?: boolean }): Promise<string>;
  onStream(callback: (event: AgentEvent) => void): void;
  getStatus(): Promise<BackendStatus>;
  destroy(): Promise<void>;
  checkHealth(): Promise<boolean>;
  start?(options?: { resumeSessionId?: string }): Promise<void>;
  setModel?(modelId: string): Promise<void>;
  getModelInfo?(): ModelInfo | null;
  getCurrentSessionId?(): string | null;
  getFiles?(): FileChange[];
  setPromptTimeout?(seconds: number): void;
  cancelPrompt?(): void;
}
```

**当前数据流**（OpenCode HTTP 后端）：

```
创作端 UI ──HTTP──▶ agent-service ──HTTP/SSE──▶ opencode serve ──API──▶ 云端 LLM
                              │                         │
                              │                    工作目录:临时空间
                              │                    (自动执行 AST/LSP)
                              │
                         读取变更文件
                         注入 .opencode 配置
                         推送前端更新
```

---

### 三、 方案深度对比

#### 3.1 方案 A：基于 Pi Agent 的模块化集成 (`@earendil-works/pi-agent-core`)

Pi 是一个面向构建者的 **AI Agent 工具包**，采用分层架构：

```
┌─────────────────────────────────────────────────────────────┐
│  Pi 生态                                                     │
│                                                               │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────┐ │
│  │ @earendil-works/ │  │ @earendil-works/ │  │ pi-web-ui  │ │
│  │ pi-ai           │  │ pi-agent-core    │  │ (可选)     │ │
│  │                 │  │                  │  └────────────┘ │
│  │ 统一 LLM API    │  │ Agent 运行时     │                  │
│  │ OpenAI/Anthropic │  │ 工具执行         │                  │
│  │ /Google/...     │  │ 状态管理         │                  │
│  └─────────────────┘  └──────────────────┘                  │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ @earendil-works/pi-coding-agent                          │ │
│  │ (CLI 应用，包含 read/bash/edit/write 等编码工具)         │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**核心 API**：

```typescript
import { Agent } from "@earendil-works/pi-agent-core";
import { getModel } from "@earendil-works/pi-ai";

const agent = new Agent({
  initialState: {
    systemPrompt: "...",
    model: getModel("anthropic", "claude-sonnet-4-20250514"),
    tools: [readFileTool, writeFileTool, bashTool, ...],
  },
  convertToLlm: (messages) => messages.filter(...),
  transformContext: async (messages) => pruneOldMessages(messages),
});

agent.subscribe((event) => { /* 流式事件 */ });
await agent.prompt("修改组件样式");
```

**与 Workbench 的集成方式**：

```
agent-service (Fastify)
├── 导入 @earendil-works/pi-agent-core
├── 导入 @earendil-works/pi-ai
├── 定义 Workbench 专用 Tools:
│   ├── readFile (受控读取临时空间)
│   ├── writeFile (受控写入 + 白名单校验)
│   ├── bash (受限 shell 执行)
│   └── schemaValidate (JSON Schema 校验)
├── 每个 Session 创建一个 Agent 实例
├── 通过 agent.subscribe() 转发流式事件
└── 通过 agent.state.tools 动态注入工具
```

**优势分析**：

| 维度 | 评价 | 说明 |
|:-----|:-----|:-----|
| **架构透明度** | ★★★★★ | Agent 运行时完全在进程内，无黑盒，每行代码可调试 |
| **工具定制能力** | ★★★★★ | 可精确定义每个工具的行为、权限、超时，完美适配 Workbench 的临时空间隔离需求 |
| **上下文控制** | ★★★★★ | `transformContext` 允许自定义消息裁剪策略，可注入 `.opencode` 配置 Schema 等项目上下文 |
| **多模型支持** | ★★★★☆ | `pi-ai` 统一 API 支持主流提供商，但需要自行维护 API Key 配置 |
| **Token 效率** | ★★★★★ | 无内置复杂工作流提示词，提示词体积最小化 |
| **Vibe Coding 可维护性** | ★★★★★ | 代码量小（预计 <500 行集成代码），AI 助手可完整理解并修改 |
| **编码任务质量** | ★★★☆☆ | 依赖云端模型自身能力，无内置 Plan/Build 多层规划 |
| **开发工作量** | ★★☆☆☆ | 需要手动构建工具集、文件操作、权限控制等 |

**劣势分析**：

| 维度 | 评价 | 说明 |
|:-----|:-----|:-----|
| **初始开发成本** | 中高 | 需要从零构建文件操作工具、权限校验、工作空间管理 |
| **编码质量保障** | 依赖模型 | 无内置的 AST 差异比对、LSP 校验、自我纠错循环 |
| **社区工具复用** | 有限 | 需要自行实现或适配 pi-coding-agent 的工具到 SDK 模式 |

---

#### 3.2 方案 B：基于 OpenCode Server 的非侵入式集成 (`opencode serve`)

OpenCode 是一个功能完备的开箱即用型 AI 编码代理，当前系统已通过 `opencode-http` 后端与其集成。

**当前集成状态**（`opencode-http.ts`，788 行）：

```typescript
// 已实现的核心功能:
// 1. Session 管理: createSession(), resumeSession()
// 2. 流式通信: SSE 事件流 (message.part.delta, session.idle, session.diff)
// 3. Drain 机制: 等待 session.diff 确保文件快照完整
// 4. 文件读取: readWorkspaceFiles() 兜底读取
// 5. 模型切换: getModelInfo(), setModel()
// 6. 取消操作: cancelPrompt()
```

**优势分析**：

| 维度 | 评价 | 说明 |
|:-----|:-----|:-----|
| **开箱即用** | ★★★★★ | 已内置完整的 Plan/Build 多层规划、AST 差异比对、LSP 校验 |
| **编码质量** | ★★★★★ | 多 Agent 协作流显著提升复杂编辑任务的成功率 |
| **初始开发成本** | ★★★★★ | agent-service 仅需 API 桥接代码，已实现并稳定运行 |
| **社区验证** | ★★★★★ | OpenCode 经过大规模社区使用和验证 |
| **Token 效率** | ★★☆☆☆ | 内置复杂工作流提示词，Token 消耗较高 |
| **架构透明度** | ★★☆☆☆ | Agent 内部为黑盒，无法直接调试或定制底层行为 |
| **工具定制能力** | ★☆☆☆☆ | 无法精确控制 Agent 的工具集和执行策略 |
| **Vibe Coding 可维护性** | ★★★☆☆ | 桥接代码简单，但黑盒内部问题难以排查 |

**劣势分析**：

| 维度 | 评价 | 说明 |
|:-----|:-----|:-----|
| **黑盒风险** | 高 | OpenCode 内部规划状态机复杂，底层异常难以通过 Vibe Coding 排查 |
| **定制受限** | 高 | 无法深度定制 Agent 的系统提示词、工具集、执行流程 |
| **依赖外部** | 中 | OpenCode 版本更新可能破坏 API 兼容性 |
| **Token 成本** | 高 | 内置多层规划机制导致每次交互的 Token 消耗显著增加 |
| **进程管理** | 中 | 需要管理 `opencode serve` 子进程的生命周期、崩溃恢复 |

---

### 四、 核心维度对比矩阵（长期最优视角）

| 评估维度 | 方案 A：Pi Agent (SDK) | 方案 B：OpenCode Server | 长期影响 |
|:---------|:----------------------|:------------------------|:---------|
| **架构可控性** | ★★★★★ 进程内运行，完全可控 | ★★☆☆☆ 黑盒服务，依赖外部 | Pi 方案更利于长期演进 |
| **工具定制精度** | ★★★★★ 可精确定义每个工具 | ★☆☆☆☆ 无法控制内置工具集 | Pi 方案更适配 Workbench 的隔离需求 |
| **上下文注入能力** | ★★★★★ transformContext 完全可控 | ★★☆☆☆ 仅能通过系统提示词间接影响 | Pi 方案可注入项目特定上下文 |
| **编码任务质量** | ★★★☆☆ 依赖模型自身能力 | ★★★★★ 多层规划提升成功率 | OpenCode 方案短期更优 |
| **Token 效率** | ★★★★★ 最小提示词体积 | ★★☆☆☆ 内置复杂工作流 | Pi 方案长期成本更低 |
| **Vibe Coding 友好度** | ★★★★★ 代码量小，完全透明 | ★★★☆☆ 桥接简单但黑盒难调 | Pi 方案更利于 AI 辅助维护 |
| **多模型适配** | ★★★★☆ pi-ai 统一 API | ★★★★★ 内置多提供商支持 | 两者均能满足需求 |
| **运维复杂度** | ★★★★☆ 单进程，易部署 | ★★★☆☆ 需管理子进程 | Pi 方案运维更简单 |
| **社区生态** | ★★★★☆ 活跃开源社区 | ★★★★★ 成熟的用户基础 | 两者均有社区支持 |
| **初始开发投入** | ★★☆☆☆ 需从零构建工具集 | ★★★★★ 开箱即用 | OpenCode 方案短期成本更低 |

---

### 五、 针对 Workbench 特定需求的适配性分析

#### 5.1 临时空间隔离

| 需求 | Pi 方案 | OpenCode 方案 |
|:-----|:--------|:-------------|
| **工作目录控制** | ★★★★★ 完全由 agent-service 控制，可精确定义读写范围 | ★★★☆☆ 通过 `--dir` 参数指定，但 Agent 内部行为不可控 |
| **文件白名单** | ★★★★★ 可在工具层精确校验每条文件操作 | ★★☆☆☆ 依赖 OpenCode 内部的权限系统 |
| **保存时合并** | ★★★★★ 可在 `afterToolCall` 钩子中拦截和处理 | ★★☆☆☆ 需要额外的文件同步逻辑 |
| **版本快照** | ★★★★★ 可在工具执行前后精确控制快照时机 | ★★☆☆☆ 依赖 OpenCode 的 session.diff 事件 |

#### 5.2 配置 Schema 联动

| 需求 | Pi 方案 | OpenCode 方案 |
|:-----|:--------|:-------------|
| **Schema 感知** | ★★★★★ 可通过 `transformContext` 注入 Schema 到上下文 | ★★☆☆☆ 需要通过 AGENTS.md 间接提示 |
| **实时校验** | ★★★★★ 可定义 `schemaValidate` 工具，每次写入前校验 | ★★☆☆☆ 依赖模型自行理解 Schema 规则 |
| **表单联动** | ★★★★★ 工具可返回结构化的校验结果供前端使用 | ★★☆☆☆ 需要额外的桥接层 |

#### 5.3 动态编译预览

| 需求 | Pi 方案 | OpenCode 方案 |
|:-----|:--------|:-------------|
| **编译触发** | ★★★★★ 工具执行后可直接触发编译 | ★★★☆☆ 依赖 SSE 事件流触发 |
| **错误反馈** | ★★★★★ 编译错误可直接注入 Agent 上下文 | ★★☆☆☆ 需要额外的错误回传机制 |
| **增量更新** | ★★★★★ 可精确控制每次更新的范围 | ★★★☆☆ 依赖 OpenCode 的 diff 机制 |

---

### 六、 长期演进路径分析

#### 6.1 方案 A（Pi）的演进路径

```
阶段 1: 基础集成
├── 导入 pi-agent-core + pi-ai
├── 实现基础工具集 (readFile, writeFile, bash)
├── 对接现有 IBackendAdapter 接口
└── 预计工作量: 2-3 周

阶段 2: Workbench 专用工具
├── schemaValidate 工具 (JSON Schema 校验)
├── configPreview 工具 (配置预览触发)
├── snapshotManager 工具 (版本快照管理)
└── 预计工作量: 1-2 周

阶段 3: 高级功能
├── 自定义 systemPrompt 注入项目上下文
├── transformContext 裁剪对话历史
├── beforeToolCall/afterToolCall 钩子
└── 预计工作量: 1 周

阶段 4: 持续优化
├── 根据使用反馈调整工具行为
├── 优化 Token 消耗
├── 扩展新的工具类型
└── 持续迭代
```

#### 6.2 方案 B（OpenCode）的演进路径

```
阶段 1: 维持现状
├── 继续使用 opencode-http 后端
├── 维护 API 桥接代码
└── 预计工作量: 0

阶段 2: 功能增强
├── 优化 Drain 机制
├── 增强文件同步逻辑
├── 改进错误处理
└── 预计工作量: 1 周

阶段 3: 深度定制（受限）
├── 尝试定制系统提示词
├── 尝试注入项目上下文
├── 遇到黑盒限制
└── 预计工作量: 不确定（可能受阻）

阶段 4: 长期维护
├── 跟进 OpenCode 版本更新
├── 处理 API 兼容性问题
├── 排查黑盒内部异常
└── 持续投入
```

---

### 七、 风险评估

#### 7.1 方案 A 风险

| 风险 | 概率 | 影响 | 缓解措施 |
|:-----|:-----|:-----|:---------|
| **编码任务质量不足** | 中 | 高 | 引入外部 LSP 校验工具；利用 pi-agent-core 的工具执行能力构建自定义校验链 |
| **开发周期超预期** | 中 | 中 | 分阶段交付；优先实现核心工具，渐进式扩展 |
| **pi-ai API 变更** | 低 | 中 | 锁定版本；pi-ai 是稳定的统一 API 层 |

#### 7.2 方案 B 风险

| 风险 | 概率 | 影响 | 缓解措施 |
|:-----|:-----|:-----|:---------|
| **OpenCode 版本破坏性更新** | 中 | 高 | 锁定版本；监控更新日志 |
| **黑盒内部异常无法排查** | 高 | 高 | 建立完善的日志和监控；准备回退方案 |
| **Token 成本持续上升** | 高 | 中 | 优化提示词；考虑缓存机制 |
| **定制需求无法满足** | 高 | 高 | 接受限制；或迁移到 Pi 方案 |

---

### 八、 综合评估结论

#### 8.1 长期最优方案：方案 A（Pi Agent SDK）

**理由**：

1. **架构可控性是长期基石** — Workbench 的核心价值在于"临时空间 + 快照合并 + 配置 Schema 联动"这套独特的业务逻辑。Pi 方案允许将这些逻辑精确地实现在工具层，而 OpenCode 方案只能依赖黑盒内部的行为。

2. **Vibe Coding 友好度决定维护成本** — 在完全采用 Vibe Coding 研发模式下，AI 助手对代码的理解深度直接影响开发效率。Pi 方案的代码量小（预计 <500 行集成代码）、逻辑透明，AI 助手可以高效地理解和修改。OpenCode 方案的黑盒内部问题一旦出现，Vibe Coding 的排错效率会显著下降。

3. **Token 效率影响长期运营成本** — Pi 方案的提示词体积最小化，每次交互的 Token 消耗显著低于 OpenCode 方案。在企业内部工具的长期运营中，这是一个不可忽视的成本因素。

4. **工具定制能力决定系统上限** — Workbench 未来可能需要实现更精细的文件操作控制、更智能的 Schema 校验、更紧密的编译预览联动。Pi 方案的工具定制能力为这些演进提供了无限可能。

#### 8.2 短期过渡建议

如果希望快速验证系统可行性，可以：

1. **短期**（1-2 个月）：继续使用 OpenCode Server 方案，快速迭代核心功能
2. **中期**（3-6 个月）：并行开发 Pi Agent 集成，作为可选后端
3. **长期**（6+ 个月）：根据使用反馈，逐步将默认后端切换为 Pi Agent

#### 8.3 最终建议

**如果只选一个方案且关注长期最优**：选择 **方案 A（Pi Agent SDK）**。

虽然初始开发成本较高，但其架构透明度、工具定制能力、Token 效率和 Vibe Coding 友好度，使其成为 Workbench 长期发展的更优选择。Pi 的模块化设计与 Workbench 的"临时空间 + 快照合并"架构天然契合，能够精确地实现业务需求，而不受外部黑盒的限制。

---

### 九、 附录：技术细节参考

#### 9.1 Pi Agent 核心包

| 包名 | 版本 | 用途 |
|:-----|:-----|:-----|
| `@earendil-works/pi-agent-core` | 0.75.5 | Agent 运行时、工具执行、状态管理 |
| `@earendil-works/pi-ai` | — | 统一 LLM API (OpenAI/Anthropic/Google/...) |
| `@earendil-works/pi-coding-agent` | 0.75.5 | CLI 应用（参考工具实现） |

#### 9.2 当前 OpenCode 集成代码

| 文件 | 行数 | 职责 |
|:-----|:-----|:-----|
| `opencode-http.ts` | 788 | HTTP/SSE 通信、Drain 机制、文件读取 |
| `opencode-acp.ts` | ~200 | ACP stdio 通信（已废弃） |
| `base.ts` | 21 | IBackendAdapter 接口定义 |
| `server.ts` | 116 | 服务入口、后端注册 |

#### 9.3 相关文档

- 项目总览：`docs/项目文档/项目总览.md`
- Agent 架构设计：`docs/项目文档/独立Agent服务层/01-架构设计.md`
- 接口规范：`docs/项目文档/独立Agent服务层/02-接口规范.md`
- SSE Drain 机制：`docs/项目文档/独立Agent服务层/04_SSE_Drain机制.md`
