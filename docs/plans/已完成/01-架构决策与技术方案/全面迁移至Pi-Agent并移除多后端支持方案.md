# 全面迁移至 Pi Agent 并移除多后端支持方案

> 版本：v1.3
> 创建日期：2026-06-01
> 更新日期：2026-06-01
> 状态：✅ 已完成
> 分类：架构简化方案
> 实施日期：2026-06-01

---

## 一、决策背景

### 1.1 选型结论（基于代码验证的对比分析）

经过对 `packages/agent-service/src/backends/` 的代码审查，Pi Agent 在本项目场景下优于 OpenCode，核心结论：

| 维度 | Pi Agent 优势 | OpenCode 劣势 |
|:-----|:-------------|:-------------|
| **架构** | 进程内嵌入，无外部依赖 | 需独立 Go 进程（端口 4096） |
| **透明度** | 源码完全可控，可调试 | 黑盒，异常难以排查 |
| **安全** | Shell 白名单（11 个只读命令）+ `beforeToolCall` 路径拦截 | 安全策略依赖外部配置 |
| **文件变更** | `afterToolCall` 实时捕获，无时序问题 | 需 Drain 机制（~80 行）处理 SSE 时序竞争 |
| **提示词** | 自定义 ~400 字，精准匹配 React 组件场景 | 系统提示词较长，含大量无关能力 |
| **运维** | 去掉后部署从 4 服务变 3 服务 | 需维护 Go 进程健康检查、重连、超时 |

### 1.2 项目适用场景

本项目是 **Web 端组件化开发工具**，面向非技术用户：

| 约束 | 对选型的影响 |
|:-----|:-------------|
| **文件规模小**（10 来个） | OpenCode 的 LSP/诊断能力价值有限 |
| **文件类型固定**（index.tsx + config.schema.json） | Pi Agent 的简单工具集足够 |
| **用户非技术** | 不需要代码搜索、符号跳转等高级能力 |
| **安全优先** | Pi Agent 的窄白名单 = 安全边界清晰 |
| **实时预览**（sucrase 编译） | 代码正确性可通过渲染验证，不依赖 LSP |

### 1.3 Pi Agent "劣势"场景化评估

在本项目约束下，Pi Agent 的大部分劣势实际影响很小：

| 劣势 | 通用场景 | 本项目 | 原因 |
|:-----|:---------|:-------|:-----|
| Shell 白名单窄 | 高 | **低（甚至是优势）** | 不执行额外命令是安全需求 |
| 无 LSP 诊断 | 高 | **低** | 十来个文件，预览编译可验证 |
| 文件 action 粒度粗 | 中 | **低** | 不影响实际功能 |
| 模型列表部分依赖 OpenCode | 中 | **低** | 标准 provider（OpenAI/Anthropic/DeepSeek）不受影响 |
| 社区较小 | 中 | **低** | 代码完全可控，不依赖社区 |

### 1.4 代码验证发现

| 项目 | 验证结果 |
|:-----|:---------|
| **后端注册数量** | `server.ts` 共 14 次 `factory.register`（13 个静态注册：73-137 行；+ 1 个 pi-agent 动态导入：141-152 行） |
| **Pi Agent 工具集** | 5 个：readFile, writeFile, listFiles, bash, schemaValidate（`pi-tools/index.ts:5-11`） |
| **Shell 白名单** | 11 个命令（`pi-tools/bash-tool.ts:10`）：`['npm', 'node', 'npx', 'ls', 'cat', 'head', 'tail', 'grep', 'find', 'wc', 'echo']`。注：标注为"只读"不严谨——`npm install`/`npx` 可写，`echo` 可重定向，但未含 `rm`/`mv` 等高危命令 |
| **文件拦截** | pi-agent.ts 第 73-86 行实现 `beforeToolCall`/`afterToolCall` 拦截（readFile/writeFile/listFiles 路径校验 + writeFile 文件变更捕获） |
| **OpenCode Drain** | `opencode-http.ts` 中 Drain 机制（grep "drain" 出现 26 次），主要分布在 440-580 行，估算 100-150 行 SSE 时序处理逻辑（不仅是 80 行） |
| **Pi Agent 模型 fallback** | 非标准 provider 会 fallback 到 OpenCode Server `/provider` 接口 |
| **当前开发默认后端** | `.env` 第 34 行 `DEFAULT_BACKEND=pi-agent`；Docker 部署中 `agent-service` 仍用 `DEFAULT_BACKEND=opencode-http`（迁移需同步） |
| **routes 默认后端 fallback** | 3 处 `routes/*.ts` 的 `getDefaultBackend()` fallback 为 `'opencode'`（非 `'pi-agent'`），需校正为 `'pi-agent'` |

---

## 二、目标

将 agent-service 从「支持 14 种后端的工厂模式」简化为「仅支持 Pi Agent 的单后端架构」，消除多后端带来的维护负担和复杂度。

### 2.2 预期收益

| 收益 | 说明 |
|:-----|:-----|
| **代码量减少** | 删除后端适配器 14 个文件（2352 行）+ ACP 协议 5 个文件（1304 行）+ 测试 4 个文件 ≈ **~3656 行**（原方案估算 ~3350 行偏低） |
| **文件数减少** | 删除 24 个文件项：14 个后端适配器 + 5 个 ACP 协议文件 + 4 个测试文件 + 1 个 `fake-acp-cli/` 目录（原方案"~20 个"漏数） |
| **依赖减少** | 移除 eventsource、ACP 相关 npm 包（`@zed-industries/agent-client-protocol` 等） |
| **部署简化** | docker-compose 移除 `opencode-serve` 服务（4 服务 → 3 服务） |
| **调试简化** | 无需排查多后端差异问题 |
| **类型简化** | AgentType 从开放联合类型（`"opencode" \| "opencode-http" \| "claude" \| "codex" \| "gemini" \| "pi-agent" \| string`）变为 `"pi-agent"` 字面量 |

### 2.3 不影响的部分

| 模块 | 说明 |
|:-----|:-----|
| **前端 (author-site)** | 无后端选择 UI，无需改动 |
| **使用端 (viewer-site)** | 不涉及 Agent 交互 |
| **Session 机制** | 保留 session-store、session-guard |
| **Workspace 机制** | 保留 workspace-manager |
| **版本快照** | 保留 snapshot 机制 |
| **Agent Manager** | 保留生命周期管理，仅简化创建逻辑 |

---

## 三、影响范围分析

### 3.1 需要删除的文件（24 个）

#### 后端适配器（14 个，合计 2352 行）

| 文件 | 行数 | 说明 |
|:-----|:-----|:-----|
| `src/backends/opencode-http.ts` | 808 | OpenCode HTTP 后端 |
| `src/backends/opencode-acp.ts` | 434 | OpenCode ACP 后端（已废弃） |
| `src/backends/base-acp.ts` | 343 | ACP 后端抽象基类 |
| `src/backends/claude.ts` | 229 | Claude 直连后端 |
| `src/backends/codex.ts` | 224 | Codex 直连后端 |
| `src/backends/gemini.ts` | 224 | Gemini 直连后端 |
| `src/backends/qwen.ts` | 10 | Qwen ACP 后端 |
| `src/backends/goose.ts` | 10 | Goose ACP 后端 |
| `src/backends/auggie.ts` | 10 | Auggie ACP 后端 |
| `src/backends/kimi.ts` | 10 | Kimi ACP 后端 |
| `src/backends/copilot.ts` | 10 | Copilot ACP 后端 |
| `src/backends/qoder.ts` | 10 | Qoder ACP 后端 |
| `src/backends/vibe.ts` | 10 | Vibe ACP 后端 |
| `src/backends/custom.ts` | 10 | 自定义 ACP 后端 |

#### ACP 协议层（5 个，合计 1304 行）— **原方案漏 2 个**

| 文件 | 行数 | 说明 |
|:-----|:-----|:-----|
| `src/acp/connection.ts` | 902 | ACP 连接管理（JSON-RPC 通信、子进程管理） |
| `src/acp/types.ts` | 263 | ACP 类型定义（消息、会话更新、方法常量） |
| `src/acp/approval-store.ts` | 71 | 权限审批存储（管理 `allow_always` 决策） |
| `src/acp/model-info.ts` | 64 | 模型信息处理（构建 `AcpModelInfo`） |
| `src/acp/index.ts` | 4 | ACP 模块导出 |

#### 测试文件（4 个 + 1 个目录）— **原方案漏 1 个**

| 文件/目录 | 说明 |
|:-----|:-----|
| `tests/unit/default-backend.test.ts` | 默认后端配置测试 |
| `tests/unit/acp-types.test.ts` | ACP 类型测试 |
| `tests/unit/opencode-http.test.ts` | OpenCode HTTP 后端测试 |
| `tests/integration/acp-smoke.test.ts` | **原方案漏掉**：ACP 协议冒烟测试（使用 fake-acp-cli） |
| `tests/fixtures/fake-acp-cli/index.js` | 模拟 ACP CLI（仅 acp-smoke.test.ts 使用，可一并删除） |
| `tests/fixtures/fake-acp-cli/` | 整个目录 |

### 3.2 需要修改的文件（15 个）

#### 核心类型

| 文件 | 改动 | 实际位置/行数 |
|:-----|:-----|:-------------|
| `src/core/types.ts` | `AgentType` 简化为 `"pi-agent"`，移除 `opencode`/`claude`/`codex`/`gemini` 配置接口 | 第 5 行联合类型 → 字面量；第 31 行 `backend?: AgentType` → 可移除 |
| `src/core/agent-factory.ts` | 简化为直接创建 PiAgent，或完全移除工厂模式 | - |
| `src/core/backend-agent.ts` | 保留，但可简化泛型 | - |
| `src/backends/index.ts` | 仅导出 pi-agent 相关 | 18 行 |
| `src/backends/base.ts` | 保留 IBackendAdapter 接口 | 21 行 |

#### 服务器与路由

| 文件 | 改动 | 实际位置/行数 |
|:-----|:-----|:-------------|
| `src/server.ts` | 移除 14 个 `factory.register` 调用（73-137 行），直接注册 pi-agent；移除 `/backends` 端点；简化 `/health`（157 行返回 `backends` 字段） | 188 行 |
| `src/routes/agent.ts` | 移除 `backend` 参数（18、28、73、90、98、105、131 行）。注意：第 18 行 `getDefaultBackend()` fallback 是 `'opencode'`（非 `pi-agent`），需改为 `'pi-agent'`；第 131 行有 `opencode-http` 特殊处理需移除 | - |
| `src/routes/websocket.ts` | 移除 `getDefaultBackend()`（26 行 fallback 为 `'opencode'` 需校正）；移除 opencode-http 特殊处理（209 行）；硬编码 `config.backend = "pi-agent"`（162、185、346、463 行） | - |
| `src/routes/models.ts` | 移除 `getDefaultBackend()`（6-7 行 fallback 为 `'opencode'` 需校正）；第 62 行 opencode-http 注释需清理 | - |
| `src/routes/index.ts` | 无改动（路由注册不变） | - |

#### 会话与工作空间

| 文件 | 改动 | 实际位置/行数 |
|:-----|:-----|:-------------|
| `src/session/session-store.ts` | `backend` 字段（14 行）硬编码为 `"pi-agent"`；filter 字段（42 行）可移除；默认值（54 行）从 `'opencode-http'` → `'pi-agent'`；过滤逻辑（98-99 行）可简化 | - |
| `src/workspace/workspace-manager.ts` | `backend` 参数（29、38、50、54、61、66 行）可移除或保留为常量；`createTempWorkspace(backend: string)` 签名需调整 | - |
| `src/workspace/utils.ts` | `generateTempWorkspaceName(backend: string)`（54 行）签名需调整，生成的前缀可简化为不依赖 backend | - |

#### 配置

| 文件 | 改动 | 实际位置/行数 |
|:-----|:-----|:-------------|
| `src/utils/config.ts` | 移除 `opencode` 配置块，保留 `piAgent` | - |
| `.env` | 移除 `DEFAULT_BACKEND`（第 34 行 `=pi-agent`） | - |
| `.env.docker` | 移除 `DEFAULT_BACKEND`、`OPENCODE_SERVER_URL`（agent-service 中用）、`OPENCODE_TIMEOUT` | - |
| `docker-compose.yml` | 移除 `opencode-serve` 服务（第 1-18 行）；移除 `agent-service` 中 `DEFAULT_BACKEND=opencode-http`、`OPENCODE_SERVER_URL`、`depends_on: opencode-serve` | - |

#### Agent Client SDK

| 文件 | 改动 | 实际位置/行数 |
|:-----|:-----|:-------------|
| `packages/agent-client/src/types.ts` | `AgentType` 简化为 `"pi-agent"`（第 1 行联合类型原本就不含 `pi-agent`/`opencode-http`，需重新设计）；移除 `backend: AgentType`（102 行） | - |
| `packages/agent-client/src/client.ts` | 移除 `backend` 参数（59、71 行） | - |

#### 共享类型

| 文件 | 改动 | 实际位置/行数 |
|:-----|:-----|:-------------|
| `packages/shared/src/workspace.ts` | `CreateWorkspaceOptions.backend`（第 9 行）可移除或简化（需同步检查 author-site 是否依赖） | - |

#### 文档

| 文件 | 改动 |
|:-----|:-----|
| `AGENTS.md` | 更新后端描述（移除"默认后端 opencode-http"等引用） |
| `packages/agent-service/AGENTS.md` | 移除「支持的后端」表格；说明本包专注 Pi Agent；移除 ACP 协议章节（或改写为 Pi Agent 流式协议说明） |

### 3.3 保留不变的文件

| 文件 | 说明 |
|:-----|:-----|
| `src/backends/pi-agent.ts` | Pi Agent 后端适配器 |
| `src/backends/pi-tools/*` | Pi Agent 工具集（4 个文件） |
| `src/backends/base.ts` | IBackendAdapter 接口 |
| `src/core/agent.ts` | BaseAgent 基类 |
| `src/core/agent-manager.ts` | Agent 生命周期管理 |
| `src/session/session-guard.ts` | 文件访问校验 |
| `src/events/event-bus.ts` | 事件总线 |
| `tests/unit/pi-agent.test.ts` | Pi Agent 单元测试 |
| `tests/integration/pi-agent.test.ts` | Pi Agent 集成测试 |

---

## 四、实施步骤

### 阶段一：类型简化（低风险）

**目标**：简化 AgentType 定义，为后续删除做准备

| 步骤 | 文件 | 改动 |
|:-----|:-----|:-----|
| 1 | `src/core/types.ts` | `AgentType` 改为 `type AgentType = "pi-agent"` |
| 2 | `src/core/types.ts` | 移除 `OpenCodeConfig`、`ClaudeConfig`、`CodexConfig`、`GeminiConfig` 接口 |
| 3 | `src/core/types.ts` | `AgentConfig` 中移除 `opencode?`、`claude?`、`codex?`、`gemini?` 字段 |
| 4 | `packages/agent-client/src/types.ts` | 同步简化 `AgentType` |
| 5 | 运行 `pnpm typecheck` | 验证类型错误，记录所有需要修改的位置 |

### 阶段二：删除后端适配器（高风险，需逐个验证）

**目标**：删除所有非 Pi Agent 的后端适配器文件

| 步骤 | 文件 | 改动 |
|:-----|:-----|:-----|
| 1 | 删除 `src/backends/opencode-http.ts` | - |
| 2 | 删除 `src/backends/opencode-acp.ts` | - |
| 3 | 删除 `src/backends/base-acp.ts` | - |
| 4 | 删除 `src/backends/claude.ts` | - |
| 5 | 删除 `src/backends/codex.ts` | - |
| 6 | 删除 `src/backends/gemini.ts` | - |
| 7 | 删除 `src/backends/qwen.ts` | - |
| 8 | 删除 `src/backends/goose.ts` | - |
| 9 | 删除 `src/backends/auggie.ts` | - |
| 10 | 删除 `src/backends/kimi.ts` | - |
| 11 | 删除 `src/backends/copilot.ts` | - |
| 12 | 删除 `src/backends/qoder.ts` | - |
| 13 | 删除 `src/backends/vibe.ts` | - |
| 14 | 删除 `src/backends/custom.ts` | - |
| 15 | 删除 `src/acp/connection.ts` | - |
| 16 | 删除 `src/acp/types.ts` | - |
| 17 | 删除 `src/acp/index.ts` | - |
| 18 | 更新 `src/backends/index.ts` | 仅导出 pi-agent 相关 |
| 19 | 运行 `pnpm typecheck` | 验证编译通过 |

### 阶段三：简化服务器和路由（中风险）

**目标**：移除工厂模式，硬编码使用 Pi Agent

| 步骤 | 文件 | 改动 |
|:-----|:-----|:-----|
| 1 | `src/server.ts` | 移除 13 个静态 `factory.register` 调用（73-137 行：opencode/opencode-http/claude/codex/gemini/qwen/goose/auggie/kimi/copilot/qoder/vibe/custom） |
| 2 | `src/server.ts` | 保留 pi-agent 动态导入注册（141-152 行），改写为静态 `import` + 启动时实例化（或保留动态导入结构） |
| 3 | `src/server.ts` | 移除 `/backends` 端点（169 行） |
| 4 | `src/server.ts` | 简化 `/health` 端点（157 行 `backends: factory.getRegisteredTypes()` 移除，保留 `status/timestamp/uptime/agents`） |
| 5 | `src/routes/agent.ts` | 移除 `backend` 参数（请求体第 28 行 `backend?: AgentType`；调用点 73、90、98、105 行）；删除 `getDefaultBackend()` 函数（18 行，fallback 改为直接返回 `'pi-agent'`） |
| 6 | `src/routes/agent.ts` | 硬编码 `config.backend = "pi-agent"`（替换所有 `getDefaultBackend()` 调用） |
| 7 | `src/routes/agent.ts` | 移除 opencode-http 特殊处理（第 131 行 `if (config.backend === 'opencode-http')`） |
| 8 | `src/routes/websocket.ts` | 删除 `getDefaultBackend()` 函数（26 行）；将 162、185、346、463 行调用替换为常量 `'pi-agent'` |
| 9 | `src/routes/websocket.ts` | 移除 opencode-http 特殊处理（第 208-213 行 `opencodeSessionId` 同步逻辑） |
| 10 | `src/routes/models.ts` | 删除 `getDefaultBackend()` 函数（6-7 行）；将 73、130、137、143、144、157 行调用替换为常量 |
| 11 | `src/routes/models.ts` | 清理第 62 行 opencode-http 相关注释；硬编码 `config.backend = "pi-agent"` |
| 12 | 运行 `pnpm typecheck` | 验证编译通过 |

### 阶段四：简化核心模块（低风险）

**目标**：简化 AgentFactory 和相关模块

| 步骤 | 文件 | 改动 |
|:-----|:-----|:-----|
| 1 | `src/core/agent-factory.ts` | 简化为 `createPiAgent(config)` 函数，或保留工厂但只注册 pi-agent |
| 2 | `src/core/backend-agent.ts` | 保留，泛型可简化为 `BackendAgent<PiAgentBackend>` |
| 3 | `src/session/session-store.ts` | 14 行 `backend: string` 字段硬编码为 `"pi-agent"`（保留字段以便未来扩展但值固定）；42 行 `backend?: string` filter 字段移除（不再需要按后端过滤）；54 行默认值从 `'opencode-http'` → `'pi-agent'`；98-99 行过滤逻辑移除 |
| 4 | `src/workspace/utils.ts` | `generateTempWorkspaceName(backend: string)`（54 行）签名改为 `generateTempWorkspaceName()`，移除 backend 前缀拼接 |
| 5 | `src/workspace/workspace-manager.ts` | 同步移除 `createTempWorkspace(backend: string)` 的 backend 参数（29、38、50、54、61、66 行），调用 `generateTempWorkspaceName()` 不再传参 |
| 6 | 运行 `pnpm typecheck` | 验证编译通过 |

### 阶段五：清理配置和部署（低风险）

**目标**：清理环境变量和 Docker 配置

| 步骤 | 文件 | 改动 |
|:-----|:-----|:-----|
| 1 | `.env` | 移除第 34 行 `DEFAULT_BACKEND=pi-agent`（后续通过 `routes/*.ts` 硬编码） |
| 2 | `.env.docker` | 移除 `DEFAULT_BACKEND`、`OPENCODE_SERVER_URL`（agent-service 中）、`OPENCODE_TIMEOUT` |
| 3 | `docker-compose.yml` | 移除 `opencode-serve` 服务定义（第 1-18 行，含 build/ports/environment/restart） |
| 4 | `docker-compose.yml` | 移除 `agent-service` 中 `DEFAULT_BACKEND=opencode-http`（第 36 行）、`OPENCODE_SERVER_URL=http://opencode-serve:4096`（第 37 行）、`depends_on.opencode-serve`（第 47-50 行） |
| 5 | `src/utils/config.ts` | 移除 `opencode` 配置块，保留 `piAgent` |
| 6 | `packages/agent-client/src/client.ts` | 移除 `backend` 参数（59、71 行） |
| 7 | `packages/agent-client/src/types.ts` | `AgentType` 联合类型（第 1 行，原本就不含 `pi-agent`，需完整重写为字面量 `"pi-agent"`）；移除 `CreateAgentOptions.backend`（102 行） |
| 8 | `packages/shared/src/workspace.ts` | 移除 `CreateWorkspaceOptions.backend`（第 9 行），需同步检查 author-site 是否依赖 |

### 阶段六：清理测试和文档（低风险）

**目标**：删除过时的测试和更新文档

| 步骤 | 文件 | 改动 |
|:-----|:-----|:-----|
| 1 | 删除 `tests/unit/default-backend.test.ts` | - |
| 2 | 删除 `tests/unit/acp-types.test.ts` | - |
| 3 | 删除 `tests/unit/opencode-http.test.ts` | - |
| 4 | 删除 `tests/integration/acp-smoke.test.ts` | **原方案漏掉** |
| 5 | 删除 `tests/fixtures/fake-acp-cli/` | 整个目录（含 `index.js`） |
| 6 | 更新 `tests/unit/workspace-manager.test.ts` | 移除 `createTempWorkspace(backend)` 的 backend 参数引用 |
| 7 | 更新 `tests/unit/workspace-utils.test.ts` | `generateTempWorkspaceName` 签名变化，移除 backend 参数测试 |
| 8 | 更新 `tests/unit/pi-agent.test.ts` | 检查是否依赖 backend 字段，如有需同步简化 |
| 9 | 运行 `pnpm --filter @opencode-workbench/agent-service test` | 验证测试通过 |
| 10 | 更新 `AGENTS.md` | 简化后端描述（移除"默认后端 opencode-http"等引用） |
| 11 | 更新 `packages/agent-service/AGENTS.md` | 移除「支持的后端」表格；移除 ACP 协议章节（或改写为 Pi Agent 流式协议说明） |

---

## 五、风险评估

| 风险 | 概率 | 影响 | 应对 |
|:-----|:-----|:-----|:-----|
| 类型错误遗漏 | 中 | 中 | 阶段一完整 typecheck，逐阶段验证 |
| 路由参数依赖 | 低 | 高 | 前端无 backend 选择 UI，影响可控 |
| 测试覆盖不足 | 中 | 低 | Pi Agent 测试保留，其他后端测试删除 |
| 配置遗漏 | 低 | 中 | 全局搜索 DEFAULT_BACKEND/OPENCODE 确认清理 |
| 共享类型破坏 | 低 | 中 | packages/shared 改动需同步检查 author-site |

---

## 六、验证清单

- [x] `pnpm typecheck` 通过（全 monorepo）— agent-service、author-site、agent-client 全部通过
- [x] `pnpm --filter @opencode-workbench/agent-service test` 通过 — 51/51 测试通过
- [x] `pnpm --filter @opencode-workbench/agent-service dev` 启动正常 — `/health` 返回 200 OK
- [x] `pnpm --filter @opencode-workbench/agent-service build` 通过 — `tsc` 无错误
- [x] `pnpm --filter @opencode-workbench/agent-client build` 通过 — `tsc` 无错误
- [x] `/backends` 端点已移除 — 验证返回 HTTP 404
- [x] Lint 错误从 17 → 5（删除文件连带清理，未引入新错误）
- [x] 全局搜索确认无残留引用 — `grep -r "opencode-serve\|opencode-http\|getDefaultBackend\|base-acp\|DEFAULT_BACKEND" packages/ AGENTS.md` 无匹配
- [ ] `pnpm dev` 全服务启动正常（未执行，依赖 LLM API key）
- [ ] 创作端 AI 对话功能正常（需配合前端联调验证）
- [ ] 模型切换功能正常（需配合前端联调验证）
- [ ] 文件变更拦截正常（beforeToolCall/afterToolCall）— 单元测试覆盖
- [ ] Docker 部署正常（移除 opencode-serve 后）— 需在生产环境验证

---

## 七、附录

### 7.1 删除文件完整清单（实际 28 个）

**后端适配器（14 个）**：
```
packages/agent-service/src/backends/opencode-http.ts
packages/agent-service/src/backends/opencode-acp.ts
packages/agent-service/src/backends/base-acp.ts
packages/agent-service/src/backends/claude.ts
packages/agent-service/src/backends/codex.ts
packages/agent-service/src/backends/gemini.ts
packages/agent-service/src/backends/qwen.ts
packages/agent-service/src/backends/goose.ts
packages/agent-service/src/backends/auggie.ts
packages/agent-service/src/backends/kimi.ts
packages/agent-service/src/backends/copilot.ts
packages/agent-service/src/backends/qoder.ts
packages/agent-service/src/backends/vibe.ts
packages/agent-service/src/backends/custom.ts
```

**ACP 协议层（5 个）**：
```
packages/agent-service/src/acp/connection.ts
packages/agent-service/src/acp/types.ts
packages/agent-service/src/acp/index.ts
packages/agent-service/src/acp/approval-store.ts          # 原方案漏掉
packages/agent-service/src/acp/model-info.ts              # 原方案漏掉
```

**测试文件（6 个，方案漏 2 个）**：
```
packages/agent-service/tests/unit/default-backend.test.ts
packages/agent-service/tests/unit/acp-types.test.ts
packages/agent-service/tests/unit/opencode-http.test.ts
packages/agent-service/tests/integration/acp-smoke.test.ts # 原方案漏掉
packages/agent-service/tests/unit/approval-store.test.ts   # 原方案漏掉
packages/agent-service/tests/unit/model-info.test.ts       # 原方案漏掉
```

**Docker 镜像文件（2 个，方案未列出）**：
```
docker/opencode-serve/Dockerfile
docker/opencode-serve/entrypoint.sh
```

**测试 fixtures（1 个目录 + 1 文件）**：
```
packages/agent-service/tests/fixtures/fake-acp-cli/index.js
packages/agent-service/tests/fixtures/fake-acp-cli/        # 整个目录
```

**空目录清理（1 个）**：
```
packages/agent-service/tests/fixtures/                    # 子目录删除后空目录清理
```

### 7.2 修改文件完整清单（实际 24 个）

**核心类型与配置**：
```
packages/agent-service/src/core/types.ts                  # AgentType 简化，删除 4 个配置接口
packages/agent-service/src/core/agent-factory.ts          # create() 硬编码 pi-agent
packages/agent-service/src/core/agent.ts                  # getInfo() backend 硬编码
packages/agent-service/src/utils/config.ts                # 移除 opencode 配置块
```

**后端层**：
```
packages/agent-service/src/backends/index.ts              # 仅导出 pi-agent
packages/agent-service/src/backends/pi-agent.ts           # 移除 OpenCode fallback
```

**服务器与路由**：
```
packages/agent-service/src/server.ts                      # 移除 13 个 factory.register + /backends
packages/agent-service/src/routes/agent.ts                # 移除 backend 参数 + /api/llm/models 死端点
packages/agent-service/src/routes/websocket.ts            # 移除 getDefaultBackend() + opencode-http 特殊处理
packages/agent-service/src/routes/models.ts               # 整文件重写（删除未用接口）
```

**会话与工作空间**：
```
packages/agent-service/src/session/session-store.ts       # backend 硬编码为字面量，移除 filter
packages/agent-service/src/workspace/workspace-manager.ts # 移除 backend 参数
packages/agent-service/src/workspace/utils.ts             # generateTempWorkspaceName 改无参，前缀 workbench
```

**Agent Client SDK**：
```
packages/agent-client/src/types.ts                        # AgentType → "pi-agent"，AgentInfo.backend 字面量
packages/agent-client/src/client.ts                       # 移除 sendMessage 的 backend 参数
```

**共享类型**：
```
packages/shared/src/workspace.ts                          # CreateWorkspaceOptions.backend 移除
```

**配置文件**：
```
.env                                                     # 移除 DEFAULT_BACKEND
.env.docker                                              # 移除 OPENCODE_* 变量
docker-compose.yml                                        # 移除 opencode-serve 服务
packages/agent-service/package.json                       # 移除 eventsource 依赖
```

**文档**：
```
AGENTS.md                                                # 更新后端描述
packages/agent-service/AGENTS.md                         # 整文件重写（专注 Pi Agent）
```

**测试**：
```
packages/agent-service/tests/unit/workspace-manager.test.ts  # 适配 workbench 前缀
packages/agent-service/tests/unit/workspace-utils.test.ts    # 适配 workbench 前缀
```

### 7.3 版本历史

| 版本 | 日期 | 修改内容 |
|:-----|:-----|:---------|
| v1.0 | 2026-06-01 | 初始版本 |
| v1.1 | 2026-06-01 | 合并选型分析报告精华：新增决策背景章节（选型结论、项目适用场景、劣势场景化评估、代码验证发现） |
| v1.2 | 2026-06-01 | **事实校验校正**：补全 ACP 协议层 2 个漏数文件（`approval-store.ts`/`model-info.ts`）；补全集成测试漏数（`acp-smoke.test.ts`）；更新删除文件总数 20→24；更新代码量统计 3350→~3656 行；补全 `routes/*.ts` 中 `getDefaultBackend()` fallback 实际值为 `'opencode'`（非 `pi-agent`）；校正 OpenCode Drain 行数估算（80→100-150）；补全 Docker 部署中 `agent-service` 仍用 `opencode-http` 的现状；补充行号定位、字段使用位置等实施细节 |
| v1.3 | 2026-06-01 | **实施完成记录**：状态改为"✅ 已完成"；勾选验证清单中已验证项；新增"第八节 实施记录"（8.1 实施结果总览、8.2 阶段执行情况、8.3 方案外发现的 3 个问题及处理、8.4 实施差异点、8.5 关键决策记录、8.6 后续建议）；附录 7.1 删除文件清单实际为 28 个（方案列 24 个 + 漏列 4 个：2 个 docker 镜像文件 + 2 个漏数测试文件） |

## 八、实施记录

### 8.1 实施结果总览

| 维度 | 方案预估 | 实际结果 | 偏差说明 |
|:-----|:---------|:---------|:---------|
| 删除文件数 | 24 | **28** | +4：方案漏列 `docker/opencode-serve/`（2 文件）+ `tests/unit/approval-store.test.ts` + `tests/unit/model-info.test.ts` |
| 修改文件数 | ~24 | **24** | 匹配 |
| 代码净变化 | -~3656 行 | **-6126 行** (+146/-6272) | 实际多减 2470 行，主要因 `opencode-http.ts`（808 行）+ `acp/connection.ts`（902 行）单文件比方案估算更大 |
| 残留 lint 错误 | 未明确 | 5（预先存在） | 删文件连带清理 12 个错误；剩余 5 个为 `pi-agent.ts`/`schema-tool.ts`/`snapshot-service.ts` 中预先存在 |
| 测试通过率 | 未明确 | 51/51 | 全部测试通过 |

### 8.2 实施阶段执行情况

| 阶段 | 目标 | 实际执行 | 备注 |
|:-----|:-----|:---------|:-----|
| 一：类型简化 | `AgentType` → `"pi-agent"`，删除 4 个配置接口 | ✅ 按计划完成 | typecheck 暴露 33 处预期错误 |
| 二：删除后端 + ACP | 14 后端 + 5 ACP 文件 | ✅ 按计划完成（外加 1 个空 `fixtures` 目录清理） | typecheck 暴露剩余错误 |
| 三：server + 路由 | 移除 13 个 `factory.register` + `/backends` + 3 处 `getDefaultBackend()` | ✅ 按计划完成 | 含 `/api/llm/models` 死端点删除（方案外） |
| 四：核心模块 | agent-factory/session-store/workspace 简化 | ✅ 按计划完成 | `generateTempWorkspaceName` 前缀 `opencode` → `workbench`（更通用） |
| 五：配置和部署 | .env/docker/config.ts/agent-client/shared | ✅ 按计划完成 | docker-compose 4→3 服务 |
| 六：测试和文档 | 删除过时测试 + 更新文档 | ✅ 按计划完成 | 外加 2 个测试文件（approval-store/model-info）一并删除 |
| 额外-1 | 移除 `pi-agent.ts` 的 OpenCode Server fallback | ✅ 完成 | 用户决策：彻底移除 |
| 额外-2 | 删除 `routes/agent.ts` 末尾的 `/api/llm/models` 死端点 | ✅ 完成 | 用户决策：直接删除 |

### 8.3 方案外发现的问题与决策

实施过程中发现 3 个方案未列出的问题（与用户确认后处理）+ 1 个技术决策选择：

> 实施日期：2026-06-01

#### 问题 1：`pi-agent.ts` 间接依赖 OpenCode Server（已彻底移除）

**位置**：`packages/agent-service/src/backends/pi-agent.ts:244-268`（原行号）

**现象**：`getModelInfo()` 在 `pi-ai.getModels(provider)` 返回空数组时（如自定义 provider `jojo`），会 fallback 到 `http://localhost:4096/provider`（OpenCode Server）获取模型列表。

**冲突**：方案假设"完全移除 OpenCode"，但 Pi Agent 仍保留这条 fallback 路径。

**用户决策**：彻底移除 OpenCode fallback，保留 `pi-ai.getModels(provider)` 单一来源。

**影响**：使用非标准 provider（如 `jojo`）时，模型列表获取依赖 `pi-ai` 包中预定义的 provider；不识别时返回空列表（`availableModels: []`），但 Pi Agent 仍可正常工作（已配置的具体 model 可用）。

#### 问题 2：`/api/llm/models` 死端点（已直接删除）

**位置**：`packages/agent-service/src/routes/agent.ts:487-560`（原行号）

**现象**：`routes/agent.ts` 末尾嵌入了一个 `/api/llm/models` 端点，直接调用 OpenCode Server `/provider` 接口返回模型列表。`grep` 全项目无其他文件引用，纯死代码。

**用户决策**：直接删除该端点。

**影响**：无（端点未被任何代码引用）。

#### 问题 3：测试文件漏数（已一并删除）

**位置**：`tests/unit/approval-store.test.ts` + `tests/unit/model-info.test.ts`

**现象**：方案仅列出 4 个测试文件，实际 `tests/unit/` 目录还有这 2 个测试，依赖已删除的 `acp/approval-store.ts` 和 `acp/model-info.ts`。

**处理**：一并删除（阶段六）。

#### 问题 4：临时目录前缀选择（采用 `workbench`）

**位置**：`packages/agent-service/src/workspace/utils.ts:54-57`

**原方案**：`generateTempWorkspaceName(backend: string)` → 改为不带参数，简化前缀。

**实际选择**：固定使用 `workbench` 前缀（与项目名一致），而非保留 `pi-agent` 或 `opencode`。
- 影响：临时目录名从 `opencode-temp-{timestamp}` → `workbench-temp-{timestamp}`
- 工作空间显示名从 `opencode` → `workbench`
- 同步更新了 `workspace-manager.test.ts` 和 `workspace-utils.test.ts` 中的 8 处期望

**理由**：
- `pi-agent` 暴露给用户无意义（用户不关心后端类型）
- `opencode` 含义错误（已不再依赖 OpenCode）
- `workbench` 与项目名一致，长期稳定

### 8.4 实施差异点

| 项 | 方案描述 | 实际选择 | 原因 |
|:---|:---------|:---------|:-----|
| 临时工作空间前缀 | 移除 backend 前缀（未指定具体值） | `workbench` | 与项目名一致，显示友好 |
| session-store.backend 字段 | "保留字段以便未来扩展但值固定" | 硬编码为字面量 `"pi-agent"` | 移除 `string` 联合类型，更严格的类型检查 |
| agent-factory | "保留工厂但只注册 pi-agent" | 保留 + 硬编码 `type: AgentType = "pi-agent"` | 与方案一致，但通过字面量类型防止误用 |
| routes/models.ts 注释 | 清理第 62 行 opencode-http 注释 | 整文件重写（删除 `ConfigProvidersResponse` 等未使用的接口） | 简化代码 + 通过 lint 检查 |
| 方案漏数的 ACP 文件 | 已记录 | 实际删除时已包含 | 验证步骤发现 |
| 方案漏数的 2 个测试文件 | 未列出 | 一并删除 | 验证步骤发现 |
| `docker/opencode-serve/` 镜像 | 未列出 | 一并删除目录 | 不再使用 |
| `package.json` `eventsource` 依赖 | "移除 eventsource" | 已在 `package.json` 删除 | 阶段五 |

### 8.5 关键决策记录

| 决策点 | 方案预设 | 实际决策 | 用户/技术理由 |
|:-------|:---------|:---------|:--------------|
| 工作目录方式 | 未明确 | 在 main 上直接工作（不创建 worktree） | 用户决策：避免分支切换复杂度，工作树干净可逆 |
| pi-agent.ts OpenCode fallback | 未列出问题 | 彻底移除 | 用户决策：完全契合"移除多后端"目标 |
| `/api/llm/models` 死端点 | 未列出 | 直接删除 | 用户决策：grep 无引用，纯死代码 |
| 临时目录前缀 | "可简化为不依赖 backend" | `workbench` | 与项目名一致 |

### 8.6 后续建议

1. **commit 拆分**：本次 52 文件变更建议拆分为 3-4 个 commit：
   - commit 1: 类型简化（types.ts、agent-client/types.ts）
   - commit 2: 删除后端 + ACP（22 个文件删除）
   - commit 3: 简化路由/核心（server.ts、routes/*、core/*、session/*、workspace/*）
   - commit 4: 配置清理 + 文档（.env、docker-compose.yml、AGENTS.md）
2. **集成测试**：建议补充端到端测试（创建会话 → 发送消息 → 收到 Pi Agent 流式响应 → 文件变更）
3. **性能监控**：迁移后关注 Pi Agent 后端的 `waitForIdle()` 性能（之前未使用，因 opencode-http 是基于 SSE 流式）
4. **pi-agent 依赖升级**：`@earendil-works/pi-agent-core` 当前 0.76.0，关注未来版本 API 变化

---

