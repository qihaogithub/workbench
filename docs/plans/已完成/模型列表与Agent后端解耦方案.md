# 模型列表与 Agent 后端解耦方案

> **状态**：已完成
> **日期**：2026-05-29
> **关联**：Pi Agent 后端集成方案

---

## 一、问题描述

### 1.1 问题现象

切换 `DEFAULT_BACKEND=pi-agent` 后，管理后台和编辑页的模型列表仍然显示 OpenCode 的模型，而非 Pi Agent 的模型。

### 1.2 问题根因

`GET /models` 端点硬编码调用 OpenCode Server，与 `DEFAULT_BACKEND` 环境变量无关。

**问题代码：** `packages/agent-service/src/routes/models.ts:64-68`

```typescript
// 问题代码：硬编码调用 OpenCode Server
const response = await fetch(
  `${OPENCODE_SERVER_URL}/config/providers`,  // ← 始终调用 OpenCode Server
  { method: "GET", signal: AbortSignal.timeout(10000) },
);
```

### 1.3 影响范围

| 路径 | 数据来源 | 与 DEFAULT_BACKEND 的关系 |
|-----|---------|------------------------|
| `GET /models` (管理后台) | OpenCode Server `/config/providers` | ❌ 无关 |
| WebSocket `get_models` (编辑页) | `agent.getModelInfo()` | ✅ 有关 |

---

## 二、修复方案

### 2.1 方案核心思路

**让 `GET /models` 端点通过 AgentManager 获取模型信息，而不是硬编码调用 OpenCode Server。**

```
GET /models (models.ts)
  → 根据 DEFAULT_BACKEND 创建临时 agent
    → 调用 agent.getModelInfo()
      → 返回该后端的模型列表
```

### 2.2 方案优势

| 对比项 | 修复前 | 修复后 |
|-------|---------|-----------|
| 数据源 | 硬编码 OpenCode Server | 各后端自治 |
| 扩展性 | 新增后端需改 models.ts | 新增后端只需实现 `getModelInfo()` |
| 一致性 | 与编辑页 WebSocket 数据源不一致 | 统一通过 agent 获取 |
| 维护成本 | 高 | 低 |

---

## 三、代码修改

### 3.1 修改文件清单

| 文件路径 | 修改内容 |
|---------|---------|
| `packages/agent-service/src/routes/models.ts` | 重构：通过 AgentManager 获取模型信息 |
| `packages/agent-service/src/backends/pi-agent.ts` | 增强：`getModelInfo()` 返回可用模型列表 |

### 3.2 models.ts 修改详情

**修改前：**
```typescript
const OPENCODE_SERVER_URL = process.env.OPENCODE_SERVER_URL || "http://localhost:4096";

fastify.get("/models", async (_request, reply) => {
  const response = await fetch(`${OPENCODE_SERVER_URL}/config/providers`, ...);
  // ...
});
```

**修改后：**
```typescript
import { getAgentManager } from "../core/agent-manager";
import { AgentConfig } from "../core/types";

const DEFAULT_BACKEND = process.env.DEFAULT_BACKEND || "opencode";

fastify.get("/models", async (_request, reply) => {
  const manager = getAgentManager();
  const tempSessionId = `__models_probe_${Date.now()}`;
  
  const config: AgentConfig = {
    sessionId: tempSessionId,
    backend: DEFAULT_BACKEND,  // 使用环境变量
  };
  
  const agent = manager.getOrCreate(tempSessionId, config);
  await agent.start();
  const modelInfo = await agent.getModelInfo?.();
  await manager.destroy(tempSessionId);  // 清理临时 agent
  
  return reply.send({ success: true, data: modelInfo });
});
```

### 3.3 pi-agent.ts 修改详情

**修改前：**
```typescript
let Agent: any;
let streamSimple: any;
let getModel: any;

async function loadPiAgentDeps() {
  if (!Agent) {
    const piAgentCore = await import('@earendil-works/pi-agent-core');
    const piAi = await import('@earendil-works/pi-ai');
    Agent = piAgentCore.Agent;
    streamSimple = piAi.streamSimple;
    getModel = piAi.getModel;
  }
}

getModelInfo() {
  return {
    currentModelId: `${provider}/${modelId}`,
    availableModels: [],  // ← 空数组
    canSwitch: true,
  };
}
```

**修改后：**
```typescript
let Agent: any;
let streamSimple: any;
let getModel: any;
let getModels: any;   // 新增
let getProviders: any; // 新增

async function loadPiAgentDeps() {
  if (!Agent) {
    const piAgentCore = await import('@earendil-works/pi-agent-core');
    const piAi = await import('@earendil-works/pi-ai');
    Agent = piAgentCore.Agent;
    streamSimple = piAi.streamSimple;
    getModel = piAi.getModel;
    getModels = piAi.getModels;      // 新增
    getProviders = piAi.getProviders; // 新增
  }
}

getModelInfo() {
  // 获取当前 provider 的可用模型列表
  const availableModels: Array<{ id: string; label: string }> = [];
  try {
    const providers = getProviders();
    const providerInfo = providers.find((p: any) => p.id === provider);
    if (providerInfo?.models) {
      for (const [id, modelInfo] of Object.entries(providerInfo.models)) {
        availableModels.push({
          id: `${provider}/${id}`,
          label: (modelInfo as any).name || id,
        });
      }
    }
  } catch (error) {
    logger.warn({ error, provider }, "Failed to get available models");
  }

  return {
    currentModelId: `${provider}/${modelId}`,
    availableModels,  // ← 返回可用模型列表
    canSwitch: true,
  };
}
```

---

## 四、数据流对比

### 4.1 修复前

```
管理后台页面
  → GET /api/admin/available-models (author-site)
    → GET /models (agent-service)
      → GET ${OPENCODE_SERVER_URL}/config/providers (OpenCode Server)
        → 返回 OpenCode 模型列表（与 DEFAULT_BACKEND 无关）
```

### 4.2 修复后

```
管理后台页面
  → GET /api/admin/available-models (author-site)
    → GET /models (agent-service)
      → 根据 DEFAULT_BACKEND 创建临时 agent
        → 调用 agent.getModelInfo()
          → 返回对应后端的模型列表
```

---

## 五、测试验证

### 5.1 测试结果

```bash
pnpm test

Test Files  11 passed (11)
Tests  115 passed | 4 skipped (119)
```

### 5.2 验证步骤

1. 修改 `.env` 文件：
   ```bash
   DEFAULT_BACKEND=pi-agent
   PI_AGENT_PROVIDER=openai
   PI_AGENT_API_KEY=your-api-key
   PI_AGENT_MODEL=deepseek-v4-flash
   PI_AGENT_BASE_URL=https://api.example.com/v1
   ```

2. 重启服务：
   ```bash
   pnpm dev:agent
   ```

3. 访问管理后台：
   ```
   http://localhost:3200/admin?secret=admin-change-this-to-random-string
   ```

4. 点击「拉取模型」，确认显示的是 Pi Agent 的模型列表

---

## 六、相关代码路径

| 文件 | 说明 |
|-----|------|
| `packages/agent-service/src/routes/models.ts` | 模型列表 HTTP 端点 |
| `packages/agent-service/src/routes/websocket.ts` | WebSocket `get_models` 消息处理 |
| `packages/agent-service/src/backends/pi-agent.ts` | Pi Agent 后端实现 |
| `packages/agent-service/src/backends/opencode-http.ts` | OpenCode HTTP 后端实现 |
| `packages/agent-service/src/backends/base.ts` | 后端适配器接口定义 |
| `packages/agent-service/src/core/agent-manager.ts` | Agent 生命周期管理 |
| `packages/agent-service/src/core/types.ts` | 核心类型定义 |
| `packages/author-site/src/app/api/admin/available-models/route.ts` | 管理后台模型 API |
| `packages/author-site/src/app/admin/model-config/page.tsx` | 管理后台模型配置页面 |
| `packages/author-site/src/components/ai-elements/chat/hooks/use-chat-models.ts` | 编辑页模型选择 Hook |

---

## 七、后续演进

### 7.1 可选优化

1. **模型能力信息**：当前 `getModelInfo()` 返回的基础模型列表不包含 `supportsImages`、`supportsThinkingDepth` 等能力信息，后续可增强

2. **多 Provider 支持**：Pi Agent 可支持多个 Provider 的模型列表聚合（如同时配置 anthropic 和 openai）

3. **模型列表缓存**：可对模型列表进行缓存，减少重复调用

### 7.2 扩展指南

如需为新后端添加模型列表支持，只需在该后端的 `getModelInfo()` 方法中返回正确的模型列表即可，无需修改 `models.ts`。
