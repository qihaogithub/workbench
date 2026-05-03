# AI 对话模型选择功能方案

> 版本：v1.0
> 创建日期：2026-05-03
> 状态：已实现

---

## 一、背景与目标

### 1.1 现状问题

当前 Web 端 AI 对话模块不支持模型选择：

- 用户无法知道当前会话使用的是哪个 AI 模型
- 用户无法切换不同模型（如 Claude、GPT-4o、Gemini 等）进行对比
- 不同 ACP 后端（Claude Code、Codex、Gemini 等）支持不同的模型列表，但前端未暴露此能力

### 1.2 目标

在 AI 对话输入区的**图片按钮、历史对话按钮旁边**，添加模型选择下拉框，支持：

1. **查看当前模型**：显示当前会话正在使用的模型名称
2. **切换模型**：从可用模型列表中选择并切换
3. **动态获取**：模型列表根据当前连接的 ACP 后端动态获取

### 1.3 设计决策

| 决策项 | 选择 | 说明 |
|:-------|:-----|:-----|
| 切换粒度 | 会话级 | 切换后该会话后续消息均使用新模型 |
| 模型列表来源 | 后端动态获取 | 通过 WebSocket `get_models` 获取，不同后端模型列表不同 |
| UI 形式 | Select 下拉框 | 复用已有的 `PromptInputSelect` 组件，与图片/历史按钮并列 |

---

## 二、现状分析

### 2.1 前端现状

**已有基础**：

- `packages/web/src/components/ai-elements/prompt-input.tsx` 已预导出 `PromptInputSelect` / `PromptInputSelectTrigger` / `PromptInputSelectContent` / `PromptInputSelectItem` / `PromptInputSelectValue` 等 Select 组件（基于 shadcn/ui 的 Select）
- `AIChat` 组件目前未接收任何与模型相关的 props

**输入区按钮布局**（`ai-chat.tsx`）：

```
[图片按钮] [历史对话按钮] [模型选择下拉框] [发送按钮]
```

### 2.2 后端现状

agent-service 已完整支持模型切换：

**WebSocket 消息类型**：

| 消息类型 | 方向 | 说明 |
|:---------|:-----|:-----|
| `get_models` | Client → Server | 获取当前可用模型列表 |
| `models` | Server → Client | 返回模型列表、当前模型 ID、是否可切换 |
| `set_model` | Client → Server | 切换模型，需传 `modelId` |

**服务端实现**：

- `packages/agent-service/src/routes/websocket.ts`（第 567-670 行）已处理 `set_model` 和 `get_models`
- `AcpConnection.setModel()` 通过 `session/set_model` JSON-RPC 调用向 ACP 后端发送切换请求

### 2.3 ACP 后端模型信息

- `buildAcpModelInfo()`（`packages/agent-service/src/acp/model-info.ts`）将原始配置转换为统一结构
- 优先从 `configOptions` 中 `category === 'model'` 的 select 选项提取
- 返回：当前模型 ID、当前模型标签、可用模型列表、是否可切换

---

## 三、架构设计

### 3.1 数据流

```
┌─────────────┐     get_models      ┌──────────────┐
│  AIChat     │ ──────────────────> │ agent-service│
│  组件       │   (modelStreamRef)  │ WebSocket    │
│             │ <────────────────── │ 路由         │
│             │     models消息       │              │
│  ┌──────────▼──────────┐         └──────┬───────┘
│  │ PromptInputSelect   │                 │
│  │ 模型选择下拉框       │                 │
│  └──────────┬──────────┘                 │
│             │ set_model (modelStreamRef)  │
│             └─────────────────────────────┘
│
│  [streamRef - 独立的聊天消息 WebSocket]
│
```

### 3.2 双 WebSocket 连接设计

**关键决策**：使用独立的 `modelStreamRef` 持久连接管理模型状态，与 per-message 的 `streamRef` 分离。

| 连接 | 用途 | 生命周期 |
|:-----|:-----|:---------|
| `modelStreamRef` | 模型列表获取、模型切换 | 随 `agentSessionId` 变化创建/销毁，持久保持 |
| `streamRef` | 发送消息、接收流式响应 | 每次发送消息时新建，完成后关闭 |

**原因**：
- 模型信息需要在发送任何消息前即可获取（解决"鸡生蛋"问题）
- 避免聊天消息流的频繁创建/关闭影响模型状态监听
- 支持会话切换时独立重置模型状态

### 3.3 组件关系

```
AIChat (新增模型状态管理)
├── PromptInput
│   ├── PromptInputTools
│   │   ├── PromptInputAddImage (图片按钮)     ← 已有
│   │   ├── [历史对话按钮]                      ← 已有
│   │   └── PromptInputModelSelect (模型选择)   ← 新增
│   └── PromptInputSubmit (发送按钮)
├── HistoryDialog (历史对话弹窗)               ← 已有
└── Conversation (消息列表)
```

---

## 四、详细设计

### 4.1 PromptInputModelSelect 组件

**文件**：`packages/web/src/components/ai-elements/prompt-input.tsx`（第 560-622 行）

```typescript
interface PromptInputModelSelectProps {
  currentModelId: string;
  models: Array<{ id: string; label: string }>;
  canSwitch: boolean;
  onModelChange: (modelId: string) => void;
  isLoading: boolean;
}

export function PromptInputModelSelect({
  currentModelId,
  models,
  canSwitch,
  onModelChange,
  isLoading,
}: PromptInputModelSelectProps) {
  const context = usePromptInput();

  const currentModel = models.find((m) => m.id === currentModelId);
  const displayLabel = isLoading
    ? '模型...'
    : currentModel?.label || currentModelId || '选择模型';

  // 不可切换时：禁用按钮 + Tooltip 提示
  if (!canSwitch && !isLoading) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 px-2 text-xs ..." disabled>
              <span className="truncate max-w-[120px]">{displayLabel}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <span>当前后端不支持切换模型</span>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <PromptInputSelect
      value={currentModelId}
      onValueChange={onModelChange}
      disabled={!canSwitch || isLoading || context.status !== 'idle'}
    >
      <PromptInputSelectTrigger className="text-xs">
        <span className="truncate max-w-[120px]">{displayLabel}</span>
      </PromptInputSelectTrigger>
      <PromptInputSelectContent>
        {models.map((model) => (
          <PromptInputSelectItem key={model.id} value={model.id}>
            {model.label}
          </PromptInputSelectItem>
        ))}
      </PromptInputSelectContent>
    </PromptInputSelect>
  );
}
```

**行为**：

- **初始状态**：显示 "模型..."
- **加载完成**：显示当前模型名称，点击展开下拉列表
- **不可切换时**：禁用选择，显示当前模型（Tooltip 提示"当前后端不支持切换模型"）
- **流式输出时**：`context.status !== 'idle'` 禁用下拉框，防止切换
- **切换时**：显示加载状态，切换成功后更新显示

### 4.2 AIChat 状态扩展

**文件**：`packages/web/src/components/ai-elements/ai-chat.tsx`

```typescript
// 模型状态定义（第 229-239 行）
const [modelState, setModelState] = useState<{
  currentModelId: string;
  models: Array<{ id: string; label: string }>;
  canSwitch: boolean;
  isLoading: boolean;
}>({
  currentModelId: '',
  models: [],
  canSwitch: false,
  isLoading: true,
});

// 持久模型连接 ref（第 219 行）
const modelStreamRef = useRef<AgentStream | null>(null);
```

**生命周期**（第 297-345 行）：

```typescript
// agentSessionId 变化时建立持久连接，提前获取模型列表
useEffect(() => {
  if (!agentSessionId) return;

  const setupModelStream = async () => {
    const { getAgentClient } = await import("@/lib/agent-client");
    const agentClient = getAgentClient();
    const stream = agentClient.stream(agentSessionId);
    modelStreamRef.current = stream;

    let connected = false;
    stream.on("status", (event: StreamEvent) => {
      if (event.status === "connected" && !connected) {
        connected = true;
        const ws = (stream as any).ws;
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "get_models" }));
        }
      }
    });

    // 关键：使用函数式更新保留先前值（后端响应可能只返回部分字段）
    stream.on("models", (event: StreamEvent) => {
      setModelState((prev) => ({
        currentModelId: event.currentModelId || prev.currentModelId,
        models: event.models ?? prev.models,
        canSwitch: event.canSwitch ?? prev.canSwitch,
        isLoading: false,
      }));
    });

    stream.on("error", (event: StreamEvent) => {
      const isModelError =
        event.error?.code === "SESSION_NOT_FOUND" ||
        event.error?.code === "GET_MODELS_ERROR";
      if (isModelError) {
        setModelState((prev) => ({ ...prev, isLoading: false }));
      }
    });
  };

  setupModelStream();

  return () => {
    if (modelStreamRef.current) {
      modelStreamRef.current.close();
      modelStreamRef.current = null;
    }
  };
}, [agentSessionId]);
```

### 4.3 会话切换时重置模型状态

**文件**：`packages/web/src/components/ai-elements/ai-chat.tsx`（第 267-294 行）

```typescript
useEffect(() => {
  if (streamRef.current && streamSessionIdRef.current && streamSessionIdRef.current !== sessionId) {
    // ... 关闭旧流
    // 会话切换时重置模型状态
    setModelState({
      currentModelId: '',
      models: [],
      canSwitch: false,
      isLoading: true,
    });
  }
}, [sessionId]);
```

### 4.4 切换模型处理

**文件**：`packages/web/src/components/ai-elements/ai-chat.tsx`（第 1151-1163 行）

```typescript
const handleModelChange = useCallback(
  (modelId: string) => {
    if (modelId === modelState.currentModelId) return;

    setModelState((prev) => ({ ...prev, isLoading: true }));

    const ws = (modelStreamRef.current as any)?.ws;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "set_model", modelId }));
    }
  },
  [modelState.currentModelId],
);
```

### 4.5 UI 布局

**文件**：`packages/web/src/components/ai-elements/ai-chat.tsx`（第 1278-1304 行）

```tsx
<PromptInputFooter>
  <PromptInputTools>
    <PromptInputAddImage />
    <Button variant="ghost" size="icon" ...>
      <History className="h-4 w-4" />
    </Button>
    <PromptInputModelSelect
      currentModelId={modelState.currentModelId}
      models={modelState.models}
      canSwitch={modelState.canSwitch}
      onModelChange={handleModelChange}
      isLoading={modelState.isLoading}
    />
  </PromptInputTools>
  <PromptInputSubmit />
</PromptInputFooter>
```

---

## 五、后端实现

### 5.1 WebSocket 路由

**文件**：`packages/agent-service/src/routes/websocket.ts`

#### get_models 处理（第 618-686 行）

```typescript
case "get_models": {
  try {
    let agent = manager.get(sessionId);
    // 关键：如果 agent 不存在，自动创建（解决"鸡生蛋"问题）
    if (!agent) {
      const config: AgentConfig = {
        sessionId,
        backend: "opencode",
        workingDir: process.cwd(),
      };
      agent = manager.getOrCreate(sessionId, config);
      if (agent.status === "initializing") {
        sendMessage({ type: "status", sessionId, status: "initializing" });
        await agent.start();
      }
    }
    if (agent && "getModelInfo" in agent) {
      const modelInfo = await (agent as {...}).getModelInfo();
      if (modelInfo) {
        sendMessage({
          type: "models",
          sessionId,
          models: modelInfo.availableModels,
          currentModelId: modelInfo.currentModelId || undefined,
          canSwitch: modelInfo.canSwitch,
        });
      }
    }
  } catch (error) {
    sendMessage({
      type: "error",
      id: message.id,
      error: { code: "GET_MODELS_ERROR", message: ... },
    });
  }
}
```

#### set_model 处理（第 567-615 行）

```typescript
case "set_model": {
  if (!message.modelId) {
    sendMessage({ type: "error", ... });
    return;
  }

  try {
    const agent = manager.get(sessionId);
    if (agent && "setModel" in agent) {
      await (agent as { setModel: ... }).setModel(message.modelId);
      sendMessage({
        type: "models",
        sessionId,
        currentModelId: message.modelId,
      });
    }
  } catch (error) {
    sendMessage({
      type: "error",
      id: message.id,
      error: { code: "SET_MODEL_ERROR", message: ... },
    });
  }
}
```

### 5.2 ACP 模型信息构建

**文件**：`packages/agent-service/src/acp/model-info.ts`

```typescript
export interface AcpModelInfo {
  currentModelId: string | null;
  currentModelLabel: string | null;
  availableModels: Array<{ id: string; label: string }>;
  canSwitch: boolean;
  source: 'configOption' | 'models';
  configOptionId?: string;
}

export function buildAcpModelInfo(
  configOptions: AcpSessionConfigOption[] | null,
  models: AcpSessionModels | null
): AcpModelInfo | null {
  // 优先从 configOptions 中 category === 'model' 的 select 选项提取
  const modelOption = configOptions?.find((opt) => opt.category === 'model');
  if (modelOption && modelOption.type === 'select' && modelOption.options) {
    const activeValue = modelOption.currentValue || modelOption.selectedValue || null;
    return {
      currentModelId: activeValue,
      currentModelLabel: modelOption.options.find((o) => o.value === activeValue)?.name || activeValue,
      availableModels: modelOption.options.map((o) => ({ id: o.value, label: o.name || o.label || o.value })),
      canSwitch: modelOption.options.length > 1,
      source: 'configOption',
      configOptionId: modelOption.id,
    };
  }

  // 兜底：从 models 字段提取
  if (models) {
    const available = models.availableModels || [];
    return {
      currentModelId: models.currentModelId || null,
      currentModelLabel: available.find((m) => ...)?.name || models.currentModelId || null,
      availableModels: available.map((model) => ({ id: model.id || model.modelId || '', label: model.name || ... })),
      canSwitch: available.length > 1,
      source: 'models',
    };
  }

  return null;
}
```

---

## 六、关键问题与解决方案

### 6.1 "Session not found" 错误

**现象**：发送 `get_models` 时返回 "Session not found" 错误。

**根因**：前端在 WebSocket 连接后立即发送 `get_models`，但此时后端尚未创建 agent（agent 仅在收到 `message` 类型消息时创建）。

**解决方案**（双重保障）：

1. **前端**：创建独立的持久 `modelStreamRef`，在 `agentSessionId` 变化时建立连接，连接成功后发送 `get_models`
2. **后端**：`get_models` 处理器中，如果 agent 不存在则自动创建并启动（`packages/agent-service/src/routes/websocket.ts` 第 621-636 行）

### 6.2 选择模型后下拉框置灰

**现象**：选择模型后，下拉框立刻置灰且无法再次修改。

**根因**：后端 `set_model` 响应只返回 `currentModelId`，不返回 `models` 和 `canSwitch`，导致前端状态被覆盖为 `undefined`。

**解决方案**：使用函数式状态更新，用 nullish coalescing (`??`) 保留先前值：

```typescript
setModelState((prev) => ({
  currentModelId: event.currentModelId || prev.currentModelId,
  models: event.models ?? prev.models,           // 保留旧值
  canSwitch: event.canSwitch ?? prev.canSwitch,   // 保留旧值
  isLoading: false,
}));
```

### 6.3 模型选择位置

**最终布局**：`[图片按钮] [历史对话按钮] [模型选择] [发送按钮]`

模型选择下拉框位于历史对话按钮右侧、发送按钮左侧。

---

## 七、导出声明

**文件**：`packages/web/src/components/ai-elements/index.ts`

```typescript
export {
  PromptInputModelSelect,
  // ... 其他已有导出
} from "./prompt-input";
```

---

## 八、测试要点

1. **模型列表获取**：`agentSessionId` 变化后是否正确获取并展示模型列表
2. **模型切换**：选择新模型后是否正确发送 `set_model` 消息
3. **状态同步**：切换成功后 UI 是否正确更新（下拉框不禁用）
4. **会话切换**：切换会话后模型状态是否正确重置
5. **错误处理**：后端返回错误时是否保持原状态
6. **不可切换场景**：`canSwitch = false` 时是否正确禁用并显示 Tooltip
7. **流式输出时**：AI 输出过程中下拉框是否正确禁用

---

## 九、相关文件

| 文件 | 变更类型 | 说明 |
|:-----|:---------|:-----|
| `packages/web/src/components/ai-elements/prompt-input.tsx` | 修改 | 新增 `PromptInputModelSelect` 组件（第 560-622 行） |
| `packages/web/src/components/ai-elements/ai-chat.tsx` | 修改 | 添加 `modelStreamRef`、`modelState`、模型事件处理、布局集成 |
| `packages/web/src/components/ai-elements/index.ts` | 修改 | 导出 `PromptInputModelSelect` |
| `packages/agent-service/src/routes/websocket.ts` | 修改 | `get_models` 自动创建 agent |
| `packages/agent-service/src/acp/model-info.ts` | 已有 | `buildAcpModelInfo()` 模型信息构建 |

---

## 附录：参考接口

### WebSocket 消息格式

**获取模型列表请求**：
```json
{ "type": "get_models" }
```

**模型列表响应**：
```json
{
  "type": "models",
  "models": [
    { "id": "claude-sonnet-4-6", "label": "Claude Sonnet 4.6" },
    { "id": "claude-opus-4-7", "label": "Claude Opus 4.7" }
  ],
  "currentModelId": "claude-sonnet-4-6",
  "canSwitch": true
}
```

**切换模型请求**：
```json
{ "type": "set_model", "modelId": "claude-opus-4-7" }
```
