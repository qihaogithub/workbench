# Pi Agent 后端集成方案 - 实施记录

> **实施日期**：2026-05-28
> **实施人**：祁昊
> **状态**：全部完成

---

## 一、实施概览

### 1.1 目标回顾

在现有 agent-service 中新增 Pi Agent 作为可选后端，与 OpenCode HTTP 后端并行运行，支持随时切换和回退。

### 1.2 完成状态

| 阶段 | 内容 | 状态 | 说明 |
|:-----|:-----|:-----|:-----|
| **阶段 1** | 基础框架 | ✅ 完成 | PiAgentBackend 可注册、可接收消息 |
| **阶段 2** | 核心工具集 | ✅ 完成 | 文件读写、bash、Schema 校验可用 |
| **阶段 3** | 事件对接 | ✅ 完成 | 流式响应、文件变更追踪正常 |
| **阶段 4** | 配置优化 | ✅ 完成 | 环境变量、系统提示词、超时控制完善 |

---

## 二、实施内容

### 2.1 安装依赖

```bash
pnpm add @earendil-works/pi-agent-core@0.76.0 @earendil-works/pi-ai@0.76.0
```

**依赖说明**：
- `@earendil-works/pi-agent-core`：Agent 运行时核心库，提供状态管理、工具执行、事件系统
- `@earendil-works/pi-ai`：统一 LLM API 层，支持 Anthropic、OpenAI、Google 等多家模型

### 2.2 类型定义

**文件**：`packages/agent-service/src/core/types.ts`

新增内容：
```typescript
// AgentType 新增 "pi-agent"
export type AgentType = "opencode" | "opencode-http" | "claude" | "codex" | "gemini" | "pi-agent" | string;

// Pi Agent 配置接口
export interface PiAgentConfig {
  apiKey?: string;
  model?: string;
  provider?: string;  // "anthropic" | "openai" | "google"
  timeout?: number;
}

// AgentConfig 新增 piAgent 字段
export interface AgentConfig {
  // ... 现有字段
  piAgent?: PiAgentConfig;
}
```

### 2.3 PiAgentBackend 类

**文件**：`packages/agent-service/src/backends/pi-agent.ts`（新建，264 行）

**核心功能**：
- 实现 `IBackendAdapter` 接口，与现有后端架构兼容
- 使用 `pi-agent-core` 的 `Agent` 类作为运行时
- 使用 `pi-ai` 的 `streamSimple` 作为流式函数
- 支持事件映射（Pi Agent 事件 → AgentEvent）
- 支持文件变更追踪
- 支持路径白名单校验

**关键方法**：
| 方法 | 功能 |
|:-----|:-----|
| `initialize()` | 创建 Agent 实例，配置工具和系统提示词 |
| `sendMessage()` | 发送消息并等待响应 |
| `onStream()` | 注册流式回调，转发事件 |
| `cancelPrompt()` | 取消当前操作 |
| `getFiles()` | 获取文件变更列表 |

### 2.4 工具集

**目录**：`packages/agent-service/src/backends/pi-tools/`

| 文件 | 行数 | 功能 |
|:-----|:-----|:-----|
| `file-tools.ts` | 116 | 文件读写操作（readFile, writeFile, listFiles） |
| `bash-tool.ts` | 60 | Shell 命令执行（受限命令白名单） |
| `schema-tool.ts` | 78 | JSON Schema 校验 |
| `index.ts` | 15 | 工具注册入口 |

**工具列表**：
| 工具名 | 功能 | 权限控制 |
|:-------|:-----|:---------|
| `readFile` | 读取临时空间文件 | 白名单校验，禁止读取 workspace 外文件 |
| `writeFile` | 写入临时空间文件 | 白名单校验，触发实时预览编译 |
| `listFiles` | 列出目录内容 | 限定在临时空间内 |
| `bash` | 执行 shell 命令 | 受限命令白名单（npm, node, ls, cat 等） |
| `schemaValidate` | 校验 JSON Schema | 写入 config.schema.json 前自动调用 |

### 2.5 后端注册

**文件**：`packages/agent-service/src/server.ts`

```typescript
import { PiAgentBackend } from './backends/pi-agent';

// 注册 pi-agent 后端
factory.register('pi-agent', (agentConfig) => 
  new BackendAgent(agentConfig, new PiAgentBackend(agentConfig)));
```

### 2.6 单元测试

**文件**：`packages/agent-service/tests/unit/pi-agent.test.ts`（新建，163 行）

**测试用例**：
| 测试用例 | 说明 |
|:---------|:-----|
| 应正确创建后端实例 | 验证实例创建和名称 |
| 初始状态应为 idle | 验证初始状态 |
| 应返回正确的 workingDir | 验证配置读取 |
| 应返回正确的 session ID | 验证会话管理 |
| 应返回当前模型信息 | 验证模型信息获取 |
| 初始时应返回空文件列表 | 验证文件列表初始化 |
| 应设置超时时间 | 验证超时配置 |
| 未初始化时取消不应抛出错误 | 验证取消操作安全性 |
| 未初始化时健康检查应返回 false | 验证健康检查 |
| 销毁后状态应为 idle | 验证资源清理 |
| 应创建所有必要的工具 | 验证工具集创建 |
| 每个工具应有 label 和 execute 方法 | 验证工具接口 |

---

## 三、事件映射

Pi Agent 事件 → 现有 AgentEvent 映射：

| Pi Agent 事件 | → | AgentEvent |
|:--------------|:--|:-----------|
| `message_update` (text_delta) | → | `stream` |
| `message_update` (thinking_delta) | → | `thought` |
| `tool_execution_start` | → | `tool_call` |
| `tool_execution_end` | → | `tool_call_update` |
| `agent_end` | → | `finish` |

---

## 四、文件清单

### 4.1 新建文件

| 文件路径 | 行数 | 说明 |
|:---------|:-----|:-----|
| `src/backends/pi-agent.ts` | 264 | Pi Agent 后端主类 |
| `src/backends/pi-tools/file-tools.ts` | 116 | 文件操作工具 |
| `src/backends/pi-tools/bash-tool.ts` | 60 | Shell 执行工具 |
| `src/backends/pi-tools/schema-tool.ts` | 78 | Schema 校验工具 |
| `src/backends/pi-tools/index.ts` | 15 | 工具注册入口 |
| `tests/unit/pi-agent.test.ts` | 163 | 单元测试 |
| **合计** | **696** | |

### 4.2 修改文件

| 文件路径 | 修改内容 |
|:---------|:---------|
| `package.json` | 添加 pi-agent-core, pi-ai 依赖 |
| `src/core/types.ts` | 新增 PiAgentConfig 类型，更新 AgentType |
| `src/backends/index.ts` | 导出 PiAgentBackend |
| `src/server.ts` | 注册 pi-agent 后端 |
| `pnpm-lock.yaml` | 依赖锁定文件 |

---

## 五、验证结果

### 5.1 类型检查

```bash
pnpm typecheck
# ✅ 通过
```

### 5.2 单元测试

```bash
pnpm test
# ✅ 107 个测试通过（包含 14 个新增 pi-agent 测试）
```

### 5.3 Git 提交

```bash
git commit -m "feat: implement Pi Agent backend integration"
# ✅ 提交成功，commit: 2fee69f
```

---

## 六、使用方式

### 6.1 切换到 Pi Agent 后端

```bash
# 环境变量配置
AGENT_BACKEND=pi-agent pnpm dev:agent

# Pi Agent 配置
PI_AGENT_PROVIDER=anthropic
PI_AGENT_API_KEY=your-api-key
PI_AGENT_MODEL=claude-sonnet-4-20250514
PI_AGENT_TIMEOUT=120000
```

### 6.2 切换回 OpenCode 后端

```bash
AGENT_BACKEND=opencode-http pnpm dev:agent
```

---

## 七、阶段 4 实施记录

### 7.1 环境变量配置完善

**文件**：`packages/agent-service/src/utils/config.ts`

新增配置项：
```typescript
export interface ServiceConfig {
  // ... 现有配置
  piAgent: {
    provider: string;      // LLM 提供商
    apiKey: string;        // API 密钥
    model: string;         // 模型名称
    timeout: number;       // 超时时间（毫秒）
  };
}
```

**环境变量**：
| 变量名 | 默认值 | 说明 |
|:-------|:-------|:-----|
| `PI_AGENT_PROVIDER` | `anthropic` | LLM 提供商（anthropic/openai/google） |
| `PI_AGENT_API_KEY` | 空 | API 密钥 |
| `PI_AGENT_MODEL` | `claude-sonnet-4-20250514` | 模型名称 |
| `PI_AGENT_TIMEOUT` | `120000` | 超时时间（毫秒） |

### 7.2 系统提示词优化

**文件**：`packages/agent-service/src/backends/pi-agent.ts`

优化内容：
1. 添加角色定位说明
2. 完善工作空间规则
3. 详细列出可用依赖
4. 明确代码规范
5. 描述工作流程
6. 定义质量要求

### 7.3 超时与取消机制完善

**改进内容**：
- 添加超时配置日志
- 完善错误处理
- 优化取消操作的安全性

### 7.4 集成测试编写

**文件**：`packages/agent-service/tests/integration/pi-agent.test.ts`

测试用例：
| 测试用例 | 说明 |
|:---------|:-----|
| 应该正确初始化和销毁 | 验证生命周期管理 |
| 应该正确注册事件回调 | 验证事件系统 |
| 应该返回正确的配置信息 | 验证配置读取 |
| 应该设置超时时间 | 验证超时配置 |
| 应该安全地取消操作 | 验证取消机制 |
| 应该设置和获取模型信息 | 验证模型管理 |
| 应该处理未初始化时的操作 | 验证错误处理 |
| 应该处理重复初始化 | 验证幂等性 |

---

## 八、待实施内容

### 8.1 后续演进

- [ ] 自定义 systemPrompt
- [ ] transformContext 上下文裁剪
- [ ] beforeToolCall 钩子
- [ ] afterToolCall 钩子
- [ ] 多模型适配
- [ ] 性能监控

- [ ] 自定义 systemPrompt
- [ ] transformContext 上下文裁剪
- [ ] beforeToolCall 钩子
- [ ] afterToolCall 钩子
- [ ] 多模型适配
- [ ] 性能监控

---

## 八、风险与缓解

| 风险 | 状态 | 说明 |
|:-----|:-----|:-----|
| **编码任务质量不足** | ⚠️ 待验证 | 需要实际使用验证生成代码质量 |
| **pi-ai API 变更** | ✅ 低风险 | 已锁定版本 0.76.0 |
| **工具集不完善** | ✅ 已实现 | 核心工具已实现，后续可扩展 |

---

## 九、总结

Pi Agent 后端集成方案已全部完成，包括：

1. ✅ 基础框架搭建
2. ✅ 核心工具集实现
3. ✅ 事件系统对接
4. ✅ 环境变量配置完善
5. ✅ 系统提示词优化
6. ✅ 超时与取消机制完善
7. ✅ 集成测试编写
8. ✅ 单元测试编写
9. ✅ 类型检查通过
10. ✅ Git 提交完成

**测试结果**：115 个测试通过，4 个跳过

**下一步**：进行实际使用测试，验证生成代码质量。
