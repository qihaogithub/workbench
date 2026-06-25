# Pi Agent 扩展能力集成方案

> 版本：v3.0
> 创建日期：2026-06-05
> 最后更新：2026-06-05
> 状态：方案已过期（核心迁移已由 AgentHarness 方案吸收）
> 类型：架构决策

> 2026-06-21 整理评估：当前代码已经使用 `AgentHarness` 初始化 Pi Agent，原文的核心推荐路径不再是待实施事项；剩余 MCP、任务管理等扩展属于可选探索，不应继续作为“进行中”计划推进。保留本文仅作历史决策记录，后续若重启扩展能力，应基于当前 AgentHarness 代码另写小范围方案。

---

## 一、背景与问题

### 1.1 用户原始需求

用户在研究 Pi Agent 生态时，对以下扩展产生兴趣：

| 扩展 | 功能描述 |
|:-----|:---------|
| `pi-universal-view` | 通用文件读取，支持 PDF/DOCX/XLSX/PPT/EPUB/CSV/音频/ZIP/网页，依赖 markit-ai（云端 LLM 转换） |
| `pi-docparser` | 文档解析专家，支持 PDF/Office/图片，依赖 `@llamaindex/liteparse` v2（本地解析，无需 API Key） |
| `pi-subagents` | 子代理任务委派，支持链式/并行执行、TUI 确认 |
| `pi-web-access` | 网页搜索、URL 获取、GitHub 克隆、PDF 提取、YouTube 理解、本地视频分析 |
| `context-mode` | MCP 插件，节省 98% 上下文窗口，沙盒代码执行、FTS5 知识库、意图驱动搜索 |
| `pi-mcp-adapter` | MCP 适配器，通过单个约 200 token 的代理工具连接任何 MCP 服务器 |

### 1.2 核心疑问

用户提出关键问题：**"是否应该嵌入 Pi CLI 而不是核心？"**

---

## 二、当前架构分析

### 2.1 项目使用的 Pi 架构

| 组件 | 包 | 版本 | 用途 |
|:-----|:---|:-----|:-----|
| `pi-ai` | `@earendil-works/pi-ai` | 0.76.0 | LLM API 适配层（统一接口给 Anthropic/OpenAI/Google/Mistral/AWS Bedrock） |
| `pi-agent-core` | `@earendil-works/pi-agent-core` | 0.76.0 | Agent 运行时（Agent 类、**AgentHarness 类**、Session、Skills、Compaction、AgentTool 类型） |
| `pi-coding-agent` | 未使用 | — | CLI 应用 + CLI 扩展系统（jiti、.pi/ 目录、pi.registerTool()） |

### 2.2 v3.0 关键修正：能力归属表

> v1.0/v2.0 错误地将 Skills/Session/Compaction 等归为 pi-coding-agent 的能力。实际调查发现，**这些能力已在 pi-agent-core v0.76.0 中**。

| 功能 | v2.0 归属（错误） | v3.0 归属（修正） | 当前项目使用 |
|:-----|:-----------------|:-----------------|:------------|
| `Agent` 类 | pi-agent-core | pi-agent-core | ✅ 使用中 |
| **`AgentHarness` 类** | — | **pi-agent-core** | ❌ 未使用 |
| **`Session` + `SessionRepo`** | pi-coding-agent | **pi-agent-core** | ❌ 未使用 |
| **Skills 加载** | pi-coding-agent | **pi-agent-core** | ❌ 未使用 |
| **Compaction（上下文压缩）** | pi-coding-agent | **pi-agent-core** | ❌ 未使用 |
| **Prompt Templates** | pi-coding-agent | **pi-agent-core** | ❌ 未使用 |
| **`NodeExecutionEnv`** | — | **pi-agent-core** | ❌ 未使用 |
| **会话树导航** | — | **pi-agent-core** | ❌ 未使用 |
| ExtensionAPI (`pi.registerTool()`) | pi-coding-agent | pi-coding-agent | ❌ 不需要 |
| jiti 运行时编译 | pi-coding-agent | pi-coding-agent | ❌ 不需要 |
| `.pi/` 目录自动发现 | pi-coding-agent | pi-coding-agent | ❌ 不需要 |

**结论**：项目当前只使用了 pi-agent-core 的底层 `Agent` 类，**遗漏了同一包内的高层 `AgentHarness` 类**。AgentHarness 已提供 Session、Skills、Compaction、会话树等高级能力，无需引入 pi-coding-agent。

### 2.3 当前项目的自研实现 vs pi-agent-core 内置能力

| 自研模块 | 代码量 | pi-agent-core 内置替代 | 差异 |
|:---------|:-------|:----------------------|:-----|
| `AgentManager` | 180 行 | `AgentHarness` + `Session` | AgentHarness 内置会话生命周期，Session 支持持久化和分支 |
| `MemorySessionStore` | 157 行 | `Session` + `MemorySessionRepo` | Session 支持树状结构、压缩条目、模型变更记录 |
| `BackendProvidersManager` | 187 行 | `AgentHarness.getApiKeyAndHeaders` | AgentHarness 支持动态 headers（OAuth），当前实现只支持静态 apiKey |
| 事件映射 | ~80 行 | `AgentHarness.subscribe()` + `on()` | AgentHarness 事件更丰富（16 种 hook 事件），支持行为修改 |
| 无上下文压缩 | — | `AgentHarness.compact()` | 内置 LLM 摘要压缩，自动管理切割点 |
| 无技能系统 | — | `loadSkills()` + `AgentHarness.skill()` | Markdown 声明式技能，按需加载 |
| 无会话持久化 | — | `JsonlSessionRepo` | JSONL 文件持久化，支持重启恢复 |
| 权限系统 | 98 行 | 无内置 | 需保留自研，通过 `on("tool_call")` hook 接入 |

**总计**：自研约 **800+ 行**基础设施代码，其中大部分可用 AgentHarness 内置能力替代。

### 2.4 当前项目的工具系统

项目自行实现了 **11 个工具**（通过 `AgentTool` 类型接口与 pi-agent-core 集成）：

| 工具名 | 功能 |
|:-------|:-----|
| `readFile` / `readFileWithLines` | 读取文件（含带行号读取） |
| `writeFile` | 写入文件 |
| `editFile` | 精确编辑（old_string/new_string 替换） |
| `listFiles` | 列出目录 |
| `bash` | Shell 命令（白名单 11 个命令） |
| `schemaValidate` | JSON Schema 校验 |
| `saveImage` / `listImages` | 图片管理 |
| `getConsoleLogs` | 获取 iframe 控制台日志 |
| `deletePage` | 删除页面（需用户确认） |

> 工具系统无需重写。AgentHarness 使用相同的 `AgentTool` 接口，11 个工具可直接复用。

---

## 三、方案重新评估（v3.0 核心变更）

> v2.0 的核心结论是"不推荐 SDK 模式，保持当前架构"。v3.0 发现 AgentHarness 已在 pi-agent-core 中，**无需引入 pi-coding-agent 即可获得大部分高级能力**，这彻底改变了方案选择。

### 3.1 四种方案对比

| 方案 | 架构 | 高级能力 | 新增依赖 | 迁移成本 | 长期可迭代 |
|:-----|:-----|:---------|:---------|:---------|:-----------|
| **A. 当前：`Agent` 类** | 进程内 | ❌ 无 Session/Compaction/Skills | 无 | 无 | 低 |
| **D. `AgentHarness` 类（v3.0 新增）** | 进程内 | ✅ Session/Compaction/Skills/会话树 | **无** | 中等 | **高** |
| **C. `pi-coding-agent` SDK** | 进程内 | ✅ 全部 + CLI 扩展系统 | +17 依赖 | 高 | 中 |
| **B. Pi CLI 子进程** | RPC | ✅ 全部 | +1 依赖 | 高 | 低 |

### 3.2 方案 D：迁移到 AgentHarness（推荐）

**核心优势**：
- **零新增依赖**：AgentHarness 在 `@earendil-works/pi-agent-core` 内，项目已安装
- **消除 ~800 行自研代码**：AgentManager、MemorySessionStore 的大部分逻辑可删除
- **获得内置高级能力**：Compaction、Skills、会话树、动态 System Prompt、Hook 事件系统
- **工具零迁移**：AgentHarness 使用相同的 `AgentTool` 接口，11 个工具无需改动
- **长期可迭代**：AgentHarness 是 pi-agent-core 的正式 API，跟随版本更新获得新能力

**迁移成本**：
- 需重写 `PiAgentBackend`（641 行 → 预计 ~400 行，更简洁）
- 需实现 `ExecutionEnv` 接口（或直接使用 `NodeExecutionEnv`）
- 需适配事件映射（AgentHarness 事件更丰富，映射更直接）
- `BackendProvidersManager` 保留（比 `getApiKeyAndHeaders` 更复杂，需要多供应商管理）

### 3.3 为什么不选 pi-coding-agent SDK

| 理由 | 说明 |
|:-----|:-----|
| CLI 扩展系统对 Web 服务无价值 | `pi.registerTool()`、jiti 运行时、`.pi/` 目录发现是为 CLI 用户设计的 |
| 依赖膨胀 | 17+ 直接依赖（含 jiti、pi-tui），在 Web 服务场景下冗余 |
| AgentHarness 已提供所需能力 | Session、Compaction、Skills、Hook 事件全在 pi-agent-core 中 |
| 社区扩展的底层库可直接集成 | `@llamaindex/liteparse`、`@modelcontextprotocol/sdk` 直接 npm install |

### 3.4 Agent vs AgentHarness 关键差异

| 维度 | Agent（当前） | AgentHarness（目标） |
|:-----|:-------------|:-------------------|
| Session 管理 | 内部维护 `messages[]` 数组 | 外部 `Session` 对象，支持持久化、分支、压缩 |
| 执行环境 | 无抽象，直接用 Node.js | `ExecutionEnv` 接口，可替换为远程/沙箱环境 |
| API Key | `getApiKey(provider: string)` | `getApiKeyAndHeaders(model: Model)` 支持 headers |
| System Prompt | `state.systemPrompt` 静态字符串 | 支持动态函数，每次 turn 重新生成 |
| 工具管理 | `state.tools` 数组 | `tools` Map + `activeToolNames` 子集，支持运行时切换 |
| 上下文压缩 | 无 | `compact()` 方法 + LLM 摘要生成 |
| 会话树 | 无 | `navigateTree()` 支持分支切换 |
| Skills | 无 | `loadSkills()` + `skill()` 方法 |
| 事件系统 | `subscribe()` 单一观察 | `subscribe()` 观察 + `on()` hook 可修改行为 |
| 运行状态 | `state.isStreaming` | `phase: "idle" \| "turn" \| "compaction" \| ...` |
| 消息队列 | steer/followUp | steer/followUp + nextTurn |
| Provider 钩子 | 无 | before_provider_request/payload + after_provider_response |

---

## 四、MCP 依赖链澄清

### 4.1 MCP SDK 的真实来源

```
packages/agent-service
  └── @earendil-works/pi-agent-core@0.76.0
        ├── 直接依赖: pi-ai, ignore, typebox, yaml
        └── transitivePeerDependencies: @modelcontextprotocol/sdk
              │
              └── @earendil-works/pi-ai@0.76.0
                    ├── 直接依赖: @google/genai, openai, @anthropic-ai/sdk, ...
                    └── transitivePeerDependencies: @modelcontextprotocol/sdk
                          │
                          └── @google/genai@1.52.0
                                └── peerDependencies: @modelcontextprotocol/sdk ^1.25.2 (optional: true)
```

**关键事实**：
- `@modelcontextprotocol/sdk` 是 `@google/genai` 的 **optional peerDependency**
- 当前项目**未安装** `@modelcontextprotocol/sdk`
- 安装后需自建 MCP 客户端工具桥接到 AgentTool

### 4.2 Pi 官方对 MCP 的立场

Pi 的设计哲学是**故意不内置 MCP 支持**，原因：
- MCP 工具定义冗长，单个服务器可能消耗 10k+ token
- 连接多个 MCP 服务器会迅速耗尽上下文窗口

社区通过 `pi-mcp-adapter` 扩展解决：用单个约 200 token 的代理工具桥接所有 MCP 服务器，按需发现和调用工具。迁移到 AgentHarness 后，MCP 工具仍需自建，但可通过 `on("tool_call")` hook 实现更精细的控制。

---

## 五、扩展能力分析

### 5.1 各扩展在 AgentHarness 架构下的集成路径

| 扩展 | 功能 | AgentHarness 架构下的实现 | 工作量 |
|:-----|:-----|:------------------------|:-------|
| `pi-universal-view` | 通用文件读取 | 直接集成 `markit-ai` 或 `@llamaindex/liteparse` 为 AgentTool | 中等 |
| `pi-docparser` | 文档解析 | 直接集成 `@llamaindex/liteparse` 为 AgentTool | 中等 |
| `pi-subagents` | 子代理委派 | 多个 `AgentHarness` 实例 + 消息传递 | 简单 |
| `pi-web-access` | 网页访问 | 通过 MCP 服务器（brave-search 等） | 中等 |
| `context-mode` | 上下文优化 | AgentHarness 内置 `compact()` + 自建 FTS5 知识库 | 简单（核心已有） |
| `pi-mcp-adapter` | MCP 客户端 | 集成 `@modelcontextprotocol/sdk`，参考按需发现模式 | 中等 |

### 5.2 AgentHarness 带来的"免费"能力

| 能力 | 原本需要 | AgentHarness 内置 |
|:-----|:--------|:-----------------|
| 上下文压缩 | 自研 RAG/摘要逻辑 | `compact()` — LLM 摘要压缩，自动管理切割点 |
| 会话持久化 | 自研文件存储 | `JsonlSessionRepo` — JSONL 文件持久化，重启恢复 |
| 会话分支 | 不支持 | `navigateTree()` — 分支切换、历史回溯 |
| 技能系统 | 不支持 | `loadSkills()` + `skill()` — Markdown 声明式技能 |
| 动态 System Prompt | 手动写入 `state.systemPrompt` | 动态函数，每次 turn 自动重新生成 |
| 工具子集激活 | 不支持 | `setActiveTools()` — 按场景启用/禁用工具 |
| Hook 事件 | 不支持 | `on("tool_call")` — 可阻止/修改工具调用行为 |

---

## 六、集成方案建议

### 6.1 推荐方案：迁移到 AgentHarness，按需集成扩展能力

**理由**：
- AgentHarness 在 pi-agent-core 内，**零新增依赖**即可获得 Session/Compaction/Skills/会话树
- 消除 ~800 行自研基础设施代码，降低维护成本
- 工具系统零迁移（AgentTool 接口不变）
- 项目未上线，迁移成本现在是最低的
- 长期可迭代：AgentHarness 是 pi-agent-core 的正式 API，跟随版本演进

### 6.2 各能力集成路径

| 能力 | 推荐实现 | 依赖 | 说明 |
|:-----|:--------|:-----|:-----|
| **Agent 核心** | `AgentHarness` 替代 `Agent` | 无新增 | 同包内升级，消除自研代码 |
| **会话管理** | `Session` + `MemorySessionRepo` 替代 `MemorySessionStore` | 无新增 | 支持持久化、分支、压缩 |
| **上下文压缩** | `AgentHarness.compact()` | 无新增 | 内置 LLM 摘要压缩 |
| **技能系统** | `loadSkills()` + 动态 System Prompt | 无新增 | Markdown 声明式技能 |
| **MCP 支持** | 集成 `@modelcontextprotocol/sdk` | 新增 | 按需发现模式，参考 pi-mcp-adapter |
| **网页搜索** | MCP 服务器（brave-search 等） | 新增 | 复用成熟生态 |
| **文档解析** | 集成 `@llamaindex/liteparse` | 新增 | 本地解析，无需 API Key |
| **子代理** | 多个 `AgentHarness` 实例 | 无新增 | 用 AgentHarness 替代 Agent |
| **权限系统** | 保留自研，通过 `on("tool_call")` hook 接入 | 无新增 | AgentHarness 无内置权限 |

### 6.3 MCP 集成技术方案

基于 AgentHarness 的工具注册模式，MCP 集成路径：

1. **安装依赖**：`pnpm --filter @opencode-workbench/agent-service add @modelcontextprotocol/sdk`
2. **创建 MCP 客户端工具**：新建 `pi-tools/mcp-tool.ts`，将 MCP 服务器的工具桥接为 `AgentTool`
3. **参考 pi-mcp-adapter 的按需发现模式**：用单个代理工具（~200 token）暴露 `mcp({ search })` 和 `mcp({ tool, args })`
4. **配置管理**：通过环境变量或配置文件指定要连接的 MCP 服务器
5. **生命周期管理**：MCP 客户端在 AgentHarness 初始化时建立连接，销毁时关闭

### 6.4 MCP 生态参考

| MCP 服务器 | 工具 | 用途 |
|:-----------|:-----|:-----|
| `@modelcontextprotocol/server-brave-search` | `brave_web_search` | 网页搜索 |
| `scrapeless-mcp-server` | `google_search`、`browser_*` | 搜索 + 浏览器自动化 |
| `@playwright/mcp` | 21 个浏览器工具 | 浏览器自动化 |
| `@modelcontextprotocol/server-github` | `search_repositories`、`get_file_contents` | GitHub 操作 |

---

## 七、决策建议

### 7.1 不推荐

| 方案 | 原因 |
|:-----|:-----|
| 保持当前 `Agent` 类 | 自研代码多、缺少 Compaction/Skills/会话树，长期维护成本高 |
| 切换到 pi-coding-agent SDK | CLI 扩展系统对 Web 服务无价值，17+ 冗余依赖 |
| Pi CLI 子进程（RPC 模式） | 开销大、复杂度高、需要管理子进程生命周期 |

### 7.2 推荐路径

```
当前架构（Agent 类 + 自研基础设施）
        │
        │  Phase 1: 迁移到 AgentHarness（零新增依赖）
        │  ├── Agent → AgentHarness
        │  ├── AgentManager → AgentHarness 生命周期管理
        │  ├── MemorySessionStore → Session + MemorySessionRepo
        │  ├── 事件映射 → AgentHarness.subscribe() + on()
        │  ├── 权限系统 → on("tool_call") hook
        │  └── 获得：Compaction + Skills + 会话树 + 动态 System Prompt
        │
        │  Phase 2: 集成 MCP 支持（新增 @modelcontextprotocol/sdk）
        │  ├── MCP 客户端工具（按需发现模式）
        │  ├── brave-search-mcp（网页搜索）
        │  └── 其他 MCP 服务器按需接入
        │
        │  Phase 3: 集成文档解析（新增 @llamaindex/liteparse）
        │  ├── PDF 解析
        │  ├── Office 文档
        │  └── 图片 OCR
        │
        └── Phase 4: 按需扩展
                ├── 子代理（多 AgentHarness 实例）
                └── FTS5 知识库（配合 compact()）
```

### 7.3 优先级建议

| 优先级 | 能力 | 理由 |
|:------:|:-----|:-----|
| **P0** | **迁移到 AgentHarness** | 零新增依赖，消除自研代码，获得 Compaction/Skills/会话树，项目未上线时迁移成本最低 |
| P1 | MCP 支持 | 最具扩展价值，可连接整个 MCP 生态 |
| P2 | 文档解析 | 项目中常有 PDF/Office 文档需求 |
| P3 | 网页搜索 | 需要最新信息时必须（可通过 MCP 服务器实现） |
| P3 | 子代理 | 复杂任务分解，用多 AgentHarness 实例实现 |

---

## 八、后续行动

- [ ] **Phase 1**：迁移 PiAgentBackend 从 Agent 到 AgentHarness（详见迁移计划）
- [ ] **Phase 2**：集成 `@modelcontextprotocol/sdk`，设计 MCP 客户端工具
- [ ] **Phase 2**：研究 pi-mcp-adapter 的按需发现模式
- [ ] **Phase 3**：评估 `@llamaindex/liteparse` 集成
- [ ] **Phase 4**：根据实际使用情况决定子代理和知识库实现

---

## 九、相关文档

- [Pi Agent 后端架构说明（AGENTS.md）](../../agent-service/AGENTS.md)
- [迁移计划方案](./Pi-Agent迁移到AgentHarness计划.md)
- [Pi Agent 官方扩展文档](https://pi.dev/docs/latest/extensions)
- [Pi MCP Adapter 官方文档](https://github.com/nicobailon/pi-mcp-adapter)
- [Pi Agent Core npm](https://www.npmjs.com/package/@earendil-works/pi-agent-core)

---

## 附录 A：版本变更记录

### v2.0 → v3.0

| 变更 | 说明 |
|:-----|:-----|
| **核心结论逆转** | v2.0 推荐"保持当前架构"，v3.0 推荐"迁移到 AgentHarness" |
| **能力归属修正** | v2.0 将 Skills/Session/Compaction 归为 pi-coding-agent，v3.0 修正为 pi-agent-core |
| **新增方案 D** | AgentHarness 方案：零新增依赖 + 消除自研代码 + 获得高级能力 |
| **自研代码统计** | v3.0 新增：量化了 ~800 行可消除的自研基础设施代码 |
| **Agent vs AgentHarness 对比** | v3.0 新增：12 维度详细对比 |
| **迁移优先级调整** | v2.0 的 P0 是 MCP 支持，v3.0 的 P0 是迁移到 AgentHarness |
| **pi-coding-agent SDK 仍不推荐** | 与 v2.0 一致，但理由更充分：AgentHarness 已覆盖其核心价值 |

### v1.0 → v2.0

| 变更 | 说明 |
|:-----|:-----|
| 方案 C 深度评估 | v1.0 标记为"待研究"，v2.0 完成深度评估：技术可行但性价比不高 |
| MCP 依赖链修正 | v1.0 隐含暗示 pi-agent-core 内置 MCP 支持，v2.0 澄清 MCP SDK 来自 @google/genai 的 optional peerDependency |
| Pi 官方 MCP 立场 | v2.0 新增：Pi 故意不内置 MCP，但 pi-mcp-adapter 提供了按需发现模式 |
| 工具数量更新 | v1.0 未提及当前工具数量，v2.0 补充了 11 个工具的完整列表 |
| SDK 模式风险 | v2.0 新增：依赖膨胀、版本耦合、概念映射复杂等风险分析 |
| MCP 集成技术方案 | v2.0 新增：基于现有工具注册模式的具体集成路径 |
| 不推荐 SDK 模式 | v2.0 新增：明确不推荐切换到 SDK 模式，与 v1.0 的"待研究"结论不同 |
