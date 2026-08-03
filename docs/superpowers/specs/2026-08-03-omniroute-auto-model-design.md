# OmniRoute 自动模型选择设计

> 在 pi-agent 模型选择中增加「自动」模式，通过 OmniRoute 网关的路由引擎实现自动选模型与自动 fallback。

## 背景

当前 pi-agent 的模型选择需要用户手动指定具体模型（如 `claude-sonnet-4-20250514`）。部署了 OmniRoute 网关后，可以利用其 `auto/*` 变体（`auto/best-coding`、`auto/chat`、`auto/vision` 等）实现自动路由——由 OmniRoute 根据健康度、配额、成本、延迟等 12 因子实时评分，自动选择最优 provider 和模型，并在配额耗尽时自动 fallback。

## 设计决策

| 决策 | 选项 | 结论 |
|---|---|---|
| OmniRoute 角色 | 统一网关 / 仅自动走 OmniRoute | **仅「自动」走 OmniRoute**，手动选模型保持现有直连 |
| 自动选项粒度 | 单个自动 / 变体分组 / 单个+设置 | **单个「自动」选项**，映射到 `auto/best-coding` |
| 默认值 | 自动是默认 / 保持现状 | **自动是默认选择**（新会话无偏好时自动选中） |
| 后台任务 | 跟随默认 / 保持固定 | **跟随用户当前选择**，评论任务触发时携带模型 |
| 查看端 | 两端都显示 / 仅创作端 | **两端都显示**（共享组件自动生效） |
| 配置存放 | 按现有 provider 机制 / 独立 env | **按现有 provider 机制**，OmniRoute 注册为普通 provider |

## 架构

```
┌─────────────────────────────────────────────────────┐
│  author-site / viewer-site                          │
│  ┌──────────────────────────────────────────────┐  │
│  │  ai-chat-shared (共享组件)                    │  │
│  │  ┌────────────────────┐  ┌────────────────┐  │  │
│  │  │ PromptInputModelSelect  │ useChatModels │  │  │
│  │  │ • 自动 (omniroute/  │  │ • WS get_models│  │  │
│  │  │   auto/best-coding) │  │ • set_model    │  │  │
│  │  │ • 其他现有模型      │  │ • localStorage │  │  │
│  │  └────────────────────┘  └────────────────┘  │  │
│  └──────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────┐  │
│  │  /api/models/config → 白名单含 omniroute/  │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
         │ WS models / set_model / message
         ▼
┌─────────────────────────────────────────────────────┐
│  agent-service                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │  BackendProvidersManager                     │  │
│  │  • omniroute provider (baseURL, key, models) │  │
│  │  • 其他现有 provider                         │  │
│  │  • activeProviderId=omniroute (默认)         │  │
│  └──────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────┐  │
│  │  ModelManager                                │  │
│  │  • resolveProviderAndModel() 自动解析        │  │
│  │  • getModel() → pi-agent AgentHarness        │  │
│  └──────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────┐  │
│  │  comment-ai-task (model 来自请求体)          │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
         │ Anthropic /v1/messages (auto/best-coding)
         ▼
┌─────────────────────────────────────────────────────┐
│  OmniRoute (http://10.131.75.39:20128)              │
│  • auto/best-coding → 自动路由 + fallback           │
│  • 542 个模型，290+ providers                        │
└─────────────────────────────────────────────────────┘
```

## 后端改动

### 1. Provider 注册

`PI_AGENT_PROVIDERS` env 预置一个 omniroute provider：

```json
{
  "providers": [
    {
      "id": "omniroute",
      "name": "OmniRoute",
      "baseURL": "http://10.131.75.39:20128",
      "apiKey": "sk-...",
      "defaultModel": "auto/best-coding",
      "models": [
        { "id": "auto/best-coding", "label": "自动" }
      ],
      "enabled": true
    }
  ],
  "activeProviderId": "omniroute",
  "activeModelId": "omniroute/auto/best-coding"
}
```

管理后台可编辑 URL/key/模型，优先级高于 env（现有 `backend-providers.ts` 逻辑不变）。

### 2. 模型解析

`model-manager.ts` 的 `resolveProviderAndModel()` 优先级链无需改动——`activeModelId` 指向 `omniroute/auto/best-coding` 时自动解析。

**实现期验证点**：
- 模型 id `omniroute/auto/best-coding` 含多斜杠，验证 `providerId / modelId` 拆分逻辑的鲁棒性
- 跨 provider 运行时切换（jojo → omniroute）时 `harness.setModel()` 正确携带新 provider 的 baseURL/apiKey

### 3. 评论 AI 任务模型跟随

`comment-ai-task.ts`：

- `POST /internal/comments/ai-task` 请求体增加可选字段 `model?: string`
- 收到 `model` 时直接作为 Agent 会话模型 ID（含 `omniroute/auto/best-coding`）
- 未传入时回退现有 env 默认
- author-site 触发侧在创建评论任务时传入用户的当前模型选择

## 前端改动

### 1. 放行表

`ai-models.ts` 的 `buildModelConfigs()` 增加内置放行：

```typescript
{ matcher: "omniroute/" },
```

与 `workbench/`、`jojo/` 并列，不依赖 `NEXT_PUBLIC_ALLOWED_MODEL_PREFIXES`。

### 2. 下拉呈现

「自动」选项通过 WS models 事件自然流入——provider 声明了 `label: "自动"`，`PromptInputModelSelect` 直接渲染。无思考深度变体 → 深度切换不显示。

### 3. 偏好恢复

`use-chat-models.ts` 现有逻辑不变：localStorage 已有偏好的用户恢复原选择；新用户落入后端默认（`omniroute/auto/best-coding`）。

### 4. 管理后台

OmniRoute 作为普通 provider 出现在供应商管理页，可改 URL/key/模型。「默认供应商/模型」选到 omniroute/自动 即完成默认切换。

## 部署迁移

### .env 新增

```
PI_AGENT_PROVIDERS=...追加omniroute provider...
```

### DB 配置迁移（现有部署）

现有 `system_configs.model_config.backendProviders` 需合并 omniroute provider 并更新 `activeProviderId`。两种方式：

1. **管理后台手动操作**：供应商列表添加 OmniRoute → 设定默认供应商/模型
2. **迁移脚本**：读取现有 DB 配置 → 追加 omniroute provider → 写回

### 新部署

env 预置好即可，无需额外步骤。

## 测试与验证

### 单元测试

| 测试 | 位置 | 验证 |
|---|---|---|
| backend-providers 解析 omniroute | `backend-providers.test.ts` | env + DB 配置正确解析，默认激活 |
| model-manager 多斜杠 model id | `model-manager.test.ts` | `omniroute/auto/best-coding` 拆分正确 |
| 前端放行 omniroute/ 前缀 | `ai-models.test.ts` | 模型出现在下拉、无深度变体 |
| 评论任务 model 透传 | `comment-ai-task.test.ts` | 请求体 model 字段正确传递 |

### PoC 验证（手动）

1. 启动 agent-service，配置 `PI_AGENT_PROVIDERS` 含 omniroute provider，`activeModelId=omniroute/auto/best-coding`
2. `POST /api/agent/:sessionId/message` 发送消息，确认：
   - 模型路由到 OmniRoute（响应头 `X-OmniRoute-Decision`）
   - tool calling 正常（`auto/best-coding` 声明了 `tool_calling: true`）
   - thinking block 正常解析
3. 运行时切换模型（jojo → omniroute），确认 `set_model` 走通

### 类型检查

```bash
pnpm check:agent
pnpm check:author
pnpm check:viewer
```

## 后续可扩展方向

- 暴露更多 `auto/*` 变体（`auto/vision`、`auto/cheap`、`auto/reasoning`）作为下拉分组
- 用户级模型偏好从 localStorage 迁移到服务端存储
- OmniRoute 作为统一网关（全部流量走它），此时 provider 管理可简化