# AI 对话模型选择功能方案

> 版本：v1.0
> 创建日期：2026-05-03
> 状态：方案设计中

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
[图片按钮] [历史对话按钮] [发送按钮]
         ↑
    模型选择下拉框插入位置
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
│  组件       │                     │ WebSocket    │
│             │ <────────────────── │ 路由         │
│             │     models消息       │              │
│             │                     └──────┬───────┘
│             │                            │
│  ┌──────────▼──────────┐                 │
│  │ PromptInputSelect   │                 │
│  │ 模型选择下拉框       │                 │
│  └──────────┬──────────┘                 │
│             │ set_model                  │
│             └────────────────────────────┘
```

### 3.2 组件关系

```
AIChat (新增模型状态管理)
├── PromptInput
│   ├── PromptInputTools
│   │   ├── PromptInputAddImage (图片按钮)  ← 已有
│   │   ├── PromptInputModelSelect (模型选择) ← 新增
│   │   └── [历史对话按钮]                   ← 已有
│   └── PromptInputSubmit (发送按钮)
├── HistoryDialog (历史对话弹窗)            ← 已有
└── Conversation (消息列表)
```

---

## 四、详细设计

### 4.1 组件设计

#### 4.1.1 PromptInputModelSelect（新增）

```typescript
interface PromptInputModelSelectProps {
  // 当前选中的模型 ID
  currentModelId: string;
  // 可用模型列表
  models: Array<{ id: string; label: string }>;
  // 是否可切换（后端返回）
  canSwitch: boolean;
  // 切换回调
  onModelChange: (modelId: string) => void;
  // 是否正在加载模型列表
  isLoading: boolean;
}
```

**行为**：

- **初始状态**：显示 "加载中..." 或默认文案
- **加载完成**：显示当前模型名称，点击展开下拉列表
- **不可切换时**：禁用选择，显示当前模型（ Tooltip 提示"当前后端不支持切换模型"）
- **切换时**：显示加载状态，切换成功后更新显示

#### 4.1.2 AIChat 状态扩展

```typescript
// 新增模型相关状态
interface ModelState {
  currentModelId: string;
  models: Array<{ id: string; label: string }>;
  canSwitch: boolean;
  isLoading: boolean;
}
```

**生命周期**：

1. WebSocket 连接成功后，发送 `get_models` 消息
2. 收到 `models` 消息后，更新 `ModelState`
3. 用户选择新模型时，发送 `set_model` 消息
4. 收到确认后更新当前模型 ID

### 4.2 WebSocket 消息格式

#### 4.2.1 获取模型列表

**请求**：

```json
{
  "type": "get_models"
}
```

**响应**：

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

#### 4.2.2 切换模型

**请求**：

```json
{
  "type": "set_model",
  "modelId": "claude-opus-4-7"
}
```

**响应**（成功）：

```json
{
  "type": "models",
  "models": [...],
  "currentModelId": "claude-opus-4-7",
  "canSwitch": true
}
```

### 4.3 UI 交互设计

#### 4.3.1 位置

在输入工具栏中，**图片按钮和历史对话按钮之间**插入模型选择下拉框：

```
[📎 图片] [🤖 模型选择] [💬 历史] [发送]
```

#### 4.3.2 状态展示

| 状态 | 展示 |
|:-----|:-----|
| 加载中 | "模型..." 或骨架屏 |
| 正常 | 显示模型名称（如 "Claude Sonnet"） |
| 不可切换 | 禁用态，显示当前模型 |
| 切换中 | 下拉框禁用，显示 "切换中..." |

#### 4.3.3 下拉框内容

```
┌─────────────────────┐
│ ▼ Claude Sonnet 4.6 │
├─────────────────────┤
│ Claude Sonnet 4.6   │ ← 当前选中（高亮）
│ Claude Opus 4.7     │
│ Claude Haiku 4.5    │
└─────────────────────┘
```

---

## 五、状态管理

### 5.1 AIChat 组件内部状态

```typescript
const [modelState, setModelState] = useState<ModelState>({
  currentModelId: '',
  models: [],
  canSwitch: false,
  isLoading: true,
});
```

### 5.2 WebSocket 消息处理

```typescript
// 连接成功后获取模型列表
useEffect(() => {
  if (wsConnected) {
    sendMessage({ type: 'get_models' });
  }
}, [wsConnected]);

// 处理 models 消息
useEffect(() => {
  if (lastMessage?.type === 'models') {
    setModelState({
      currentModelId: lastMessage.currentModelId,
      models: lastMessage.models,
      canSwitch: lastMessage.canSwitch,
      isLoading: false,
    });
  }
}, [lastMessage]);
```

### 5.3 切换模型处理

```typescript
const handleModelChange = useCallback((modelId: string) => {
  if (modelId === modelState.currentModelId) return;
  
  setModelState(prev => ({ ...prev, isLoading: true }));
  sendMessage({ type: 'set_model', modelId });
}, [modelState.currentModelId, sendMessage]);
```

---

## 六、错误处理

| 场景 | 处理策略 |
|:-----|:---------|
| 获取模型列表失败 | 显示错误提示，提供"重试"按钮 |
| 切换模型失败 | 保持原模型选中，Toast 提示错误原因 |
| 后端不支持切换 | 禁用下拉框，Tooltip 说明原因 |
| WebSocket 断开 | 模型选择禁用，重连后自动刷新 |

---

## 七、实现步骤

### Step 1：扩展 WebSocket 类型定义

在 `packages/web/src/components/ai-elements/ai-chat.tsx` 中新增模型相关消息类型：

```typescript
type ModelInfo = {
  id: string;
  label: string;
};

type ModelsMessage = {
  type: 'models';
  models: ModelInfo[];
  currentModelId: string;
  canSwitch: boolean;
};

type SetModelMessage = {
  type: 'set_model';
  modelId: string;
};

type GetModelsMessage = {
  type: 'get_models';
};
```

### Step 2：创建 PromptInputModelSelect 组件

在 `packages/web/src/components/ai-elements/prompt-input.tsx` 中新增：

```typescript
export function PromptInputModelSelect({
  currentModelId,
  models,
  canSwitch,
  onModelChange,
  isLoading,
}: PromptInputModelSelectProps) {
  // 使用 PromptInputSelect 基础组件封装
}
```

### Step 3：AIChat 组件集成

1. 添加 `modelState` 状态
2. 在 WebSocket 连接成功后发送 `get_models`
3. 处理 `models` 消息更新状态
4. 在 `PromptInputTools` 中插入 `PromptInputModelSelect`
5. 实现 `handleModelChange` 回调

### Step 4：样式调整

- 确保模型选择下拉框宽度自适应内容
- 与相邻按钮间距保持一致
- 移动端适配（模型名称过长时截断）

---

## 八、兼容性考虑

### 8.1 向后兼容

- 不修改现有 WebSocket 消息格式，仅新增类型处理
- `AIChat` 组件新增可选 props，不传时不影响现有调用

### 8.2 不同后端差异

| 后端 | canSwitch | 说明 |
|:-----|:----------|:-----|
| Claude Code | true | 支持 `session/set_model` |
| Codex | true | 支持 `session/set_model` |
| Gemini | true | 支持 `session/set_model` |
| 自定义后端 | 视实现而定 | 按后端实际能力返回 |

---

## 九、测试要点

1. **模型列表获取**：连接 WebSocket 后是否正确获取并展示模型列表
2. **模型切换**：选择新模型后是否正确发送 `set_model` 消息
3. **状态同步**：切换成功后 UI 是否正确更新
4. **错误处理**：后端返回错误时是否保持原状态并提示
5. **不可切换场景**：`canSwitch = false` 时是否正确禁用
6. **重连场景**：WebSocket 断开后重连是否自动刷新模型列表

---

## 十、相关文件

| 文件 | 变更类型 | 说明 |
|:-----|:---------|:-----|
| `packages/web/src/components/ai-elements/ai-chat.tsx` | 修改 | 添加模型状态管理和消息处理 |
| `packages/web/src/components/ai-elements/prompt-input.tsx` | 修改 | 新增 `PromptInputModelSelect` 组件 |
| `packages/web/src/components/ai-elements/index.ts` | 修改 | 导出新增组件（如需要） |

---

## 附录：参考接口

### ACP 后端模型信息结构

```typescript
// packages/agent-service/src/acp/model-info.ts
interface AcpModelInfo {
  currentModelId: string;
  currentModelLabel: string;
  models: Array<{ id: string; label: string }>;
  canSwitch: boolean;
}
```

### WebSocket 路由已有实现

```typescript
// packages/agent-service/src/routes/websocket.ts
// set_model 处理：第 567-615 行
// get_models 处理：第 618-670 行
```
