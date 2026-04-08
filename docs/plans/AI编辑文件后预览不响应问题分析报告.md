# 问题分析报告：AI 编辑文件后预览区和配置面板不立即响应

## 一、问题描述

### 1.1 现象

在使用 Web 工作台与 AI 对话时，当 AI 编辑以下文件后：
- **`index.tsx`**（组件代码文件）
- **`config.schema.json`**（配置 Schema 文件）

出现的症状：
1. **预览区（PreviewPanel）** 不会自动刷新显示最新的代码效果
2. **配置面板（ConfigForm）** 不会根据新的 schema 更新表单字段
3. 用户需要手动刷新页面或重新加载才能看到变更

### 1.2 影响范围

- 用户体验严重受损，AI 编辑功能失去实时预览的核心价值
- 配置面板无法响应 schema 变更，导致用户无法及时调整配置参数
- 与"所见即所得"的设计理念背道而驰

---

## 二、根因分析

### 2.1 核心问题概览

| 问题编号 | 问题描述 | 根本原因 | 代码位置 |
|---------|---------|---------|---------|
| P1 | `onSchemaUpdate` 从未被调用 | AI Chat 组件只提取 code，未提取 schema | `ai-chat.tsx:121-128` |
| P2 | 配置面板不响应 schema 变更 | `useState` 初始值不响应 props 变化 | `ConfigFormNew.tsx:394` |
| P3 | `configData` 与 schema 不同步 | schema 更新后未调用 `getDefaultValues` | `edit/page.tsx:227-233` |
| P4 | `editorContent` 可能混合新旧值 | 回调独立触发，闭包捕获旧值 | `edit/page.tsx:221-233` |
| P5 | 无文件系统监听机制 | 前端完全依赖回调，无轮询或事件监听 | 全局架构问题 |

---

### 2.2 详细根因

#### P1: `onSchemaUpdate` 回调从未被调用

**代码位置**: `packages/web/src/components/demo/ai-chat.tsx`

**问题代码**（第 121-128 行）:
```tsx
// 尝试从内容中提取代码和 schema 更新
try {
  const codeMatch = accumulatedContent.match(/```(?:tsx?|typescript|javascript)?\n([\s\S]*?)```/)
  if (codeMatch && onCodeUpdate) {
    onCodeUpdate(codeMatch[1].trim())  // ✅ 只调用了 onCodeUpdate
  }
} catch {
  // 忽略解析错误
}
```

**问题分析**:
- `onSchemaUpdate` 作为 prop 接收（第 21 行声明），但**整个文件中没有任何代码调用它**
- 正则表达式只匹配了一个代码块，无法区分 code 和 schema
- AI 输出可能包含多个代码块（一个 index.tsx，一个 config.schema.json），但当前逻辑只提取第一个

**影响**: 即使 AI 在回复中输出了新的 schema，配置面板也永远收不到更新通知

---

#### P2: 配置面板 `initialData` 不响应 props 变化

**代码位置**: `packages/web/src/components/demo/ConfigFormNew.tsx`

**问题代码**（第 394 行）:
```tsx
const [formData, setFormData] = useState<Record<string, unknown>>(initialData || {});
```

**问题分析**:
- `useState` 的初始值**仅在组件首次渲染时生效**
- 当父组件传入的 `initialData` prop 变化时，`formData` 状态不会自动更新
- 虽然 `fieldGroups` 使用 `useMemo` 依赖 `[schema]` 会重新解析字段定义，但：
  - 已有的表单数据保持不变（可能是旧 schema 的值）
  - 新增字段显示为 `undefined`
  - 已删除的字段可能仍保留在 `formData` 中

**影响**: AI 修改 schema 后，配置面板字段不会同步更新，可能出现：
- 字段类型与 schema 定义不匹配
- 新增字段无默认值
- 废弃字段残留旧值

---

#### P3: `configData` 与 schema 不同步

**代码位置**: `packages/web/src/app/demo/[id]/edit/page.tsx`

**问题代码**（第 227-233 行）:
```tsx
const handleSchemaUpdate = (newSchema: string) => {
  setSchema(newSchema)
  setEditorContent(buildFigmaText(code, newSchema))  // 使用了闭包中的旧 code
  const size = getPreviewSize(newSchema)
  setPreviewSize(size)
  // ❌ 缺少：更新 configData
}
```

**问题分析**:
- 当 schema 更新后，应该重新计算默认配置值
- 当前代码没有调用 `getDefaultValues(newSchema)` 来更新 `configData`
- 导致预览区使用的 `configData` 与新的 schema 不匹配

**影响**: 即使预览区刷新了，传入 Demo 组件的配置参数也可能是：
- 旧 schema 的字段（新 schema 已删除）
- 缺少新 schema 的新增字段
- 字段类型不匹配导致运行时错误

---

#### P4: `editorContent` 可能混合新旧值

**代码位置**: `packages/web/src/app/demo/[id]/edit/page.tsx`

**问题代码**（第 221-233 行）:
```tsx
const handleCodeUpdate = (newCode: string) => {
  setCode(newCode)
  setEditorContent(buildFigmaText(newCode, schema))  // ← 使用闭包中的旧 schema
}

const handleSchemaUpdate = (newSchema: string) => {
  setSchema(newSchema)
  setEditorContent(buildFigmaText(code, newSchema))  // ← 使用闭包中的旧 code
}
```

**问题分析**:
- 两个回调是独立触发的，各自使用闭包捕获的状态
- 当 AI 同时更新 code 和 schema 时，可能出现竞态条件
- `buildFigmaText` 组合后的内容可能混合新旧值

**影响**: 编辑器显示的内容可能与实际状态不一致，导致后续编辑基于错误的上下文

---

#### P5: 无文件系统监听机制

**架构问题**: 全局性设计缺陷

**问题分析**:
- 前端完全依赖回调函数传递文件变更，没有任何文件监听或轮询机制
- SWR 仅用于 Demo 列表数据获取（`/api/demos`），且禁用了 `revalidateOnFocus`
- 编辑页面使用一次性 `useEffect` 加载文件（第 59-108 行），仅在 `demoId` 变化时重新加载

**当前数据流**:
```
AI 对话 → 回调函数 → 更新 state → props 传递给子组件
```

**缺失的环节**:
- 没有从 AI Chat 的 `event.files` 中直接读取文件内容
- 没有轮询机制检测文件变更
- 没有文件系统事件监听（前端无法直接监听，但可以通过后端 API 推送）

---

## 三、修复方案

### 3.1 修复优先级

| 优先级 | 问题 | 修复难度 | 影响范围 |
|-------|------|---------|---------|
| 🔴 P0 | P1: 调用 `onSchemaUpdate` | 低 | 核心功能 |
| 🔴 P0 | P2: 同步 `initialData` | 低 | 核心功能 |
| 🟡 P1 | P3: 更新 `configData` | 中 | 数据一致性 |
| 🟡 P1 | P4: 修复闭包陷阱 | 中 | 编辑器状态 |
| 🟢 P2 | P5: 增加文件监听 | 高 | 架构改进 |

---

### 3.2 具体修复方案

#### 修复 P1: 正确提取并调用 schema 更新

**文件**: `packages/web/src/components/demo/ai-chat.tsx`

**方案 A: 从 AI 回复中区分代码块**（推荐）

要求 AI 输出时使用明确的标记：
````
```tsx
// index.tsx 内容
```

```json:schema
// config.schema.json 内容
```
````

修改提取逻辑：
```tsx
// 提取 index.tsx
const codeMatch = accumulatedContent.match(/```tsx?\n([\s\S]*?)```/)
if (codeMatch && onCodeUpdate) {
  onCodeUpdate(codeMatch[1].trim())
}

// 提取 config.schema.json
const schemaMatch = accumulatedContent.match(/```json:schema\n([\s\S]*?)```/)
if (schemaMatch && onSchemaUpdate) {
  try {
    const schemaObj = JSON.parse(schemaMatch[1].trim())
    onSchemaUpdate(JSON.stringify(schemaObj, null, 2))
  } catch (e) {
    console.error('Failed to parse schema update:', e)
  }
}
```

**方案 B: 从 `event.files` 中读取**（更可靠）

AI Chat 已接收文件变更事件，可以直接读取：
```tsx
// 在 handleStreamUpdate 中
if (event.files) {
  for (const [filePath, fileContent] of Object.entries(event.files)) {
    if (filePath.includes('index.tsx') && onCodeUpdate) {
      onCodeUpdate(fileContent as string)
    }
    if (filePath.includes('config.schema.json') && onSchemaUpdate) {
      onSchemaUpdate(fileContent as string)
    }
  }
}
```

**推荐**: 方案 B 更可靠，因为它直接读取文件系统写入的实际内容，而不是从 AI 回复文本中提取

---

#### 修复 P2: 同步 `initialData` 变化

**文件**: `packages/web/src/components/demo/ConfigFormNew.tsx`

**修复代码**:
```tsx
const [formData, setFormData] = useState<Record<string, unknown>>(initialData || {});

// ✅ 添加同步 effect
useEffect(() => {
  if (initialData && Object.keys(initialData).length > 0) {
    setFormData(prev => {
      // 保留用户已修改的值，但添加新字段的默认值
      const merged = { ...prev };
      for (const [key, value] of Object.entries(initialData)) {
        if (!(key in merged)) {
          merged[key] = value;
        }
      }
      return merged;
    });
  }
}, [initialData]);

// ✅ 当 schema 变化时，重新初始化表单
useEffect(() => {
  if (schema && initialData) {
    // 解析新 schema 的默认值
    const newDefaults = parseSchemaDefaults(schema);
    setFormData(prev => ({
      ...newDefaults,
      ...prev, // 保留用户已修改的值
    }));
  }
}, [schema]);
```

---

#### 修复 P3: 更新 `configData`

**文件**: `packages/web/src/app/demo/[id]/edit/page.tsx`

**修复代码**:
```tsx
const handleSchemaUpdate = useCallback((newSchema: string) => {
  setSchema(newSchema)
  
  // ✅ 使用函数式更新避免闭包陷阱
  setEditorContent(prev => {
    const codePart = extractCodeFromFigma(prev) || code;
    return buildFigmaText(codePart, newSchema);
  })
  
  const size = getPreviewSize(newSchema)
  setPreviewSize(size)
  
  // ✅ 更新 configData 为新的默认值
  try {
    const schemaObj = JSON.parse(newSchema);
    const newConfigData = getDefaultValues(schemaObj);
    setConfigData(prev => ({
      ...newConfigData,
      ...prev, // 保留用户已修改的配置
    }));
  } catch (e) {
    console.error('Failed to parse schema for default values:', e);
  }
}, []);
```

---

#### 修复 P4: 修复闭包陷阱

**文件**: `packages/web/src/app/demo/[id]/edit/page.tsx`

**方案: 使用 `useCallback` 和函数式更新**

```tsx
const handleCodeUpdate = useCallback((newCode: string) => {
  setCode(newCode)
  setEditorContent(prev => buildFigmaText(newCode, extractSchemaFromFigma(prev) || schema))
  // ✅ 同时触发验证
  if (schema) {
    const result = validateAll(newCode, schema)
    setValidationResult(result)
  }
}, [schema])

const handleSchemaUpdate = useCallback((newSchema: string) => {
  setSchema(newSchema)
  setEditorContent(prev => buildFigmaText(extractCodeFromFigma(prev) || code, newSchema))
  const size = getPreviewSize(newSchema)
  setPreviewSize(size)
  // ✅ 更新 configData
  const defaults = getDefaultValues(newSchema)
  setConfigData(prev => ({ ...defaults, ...prev }))
}, [])
```

---

#### 修复 P5: 增加文件变更监听（可选，长期方案）

**方案 A: 后端推送文件变更事件**

修改 Session API，在文件写入后通过 WebSocket 推送变更通知：
```typescript
// agent-service/src/routes/session.ts
ws.on('file_change', (data) => {
  if (data.files) {
    // 通知前端文件已变更
    ws.send(JSON.stringify({
      type: 'files_updated',
      files: data.files,
    }))
  }
})
```

**方案 B: 前端轮询**（简单但不优雅）

```tsx
// 在 edit/page.tsx 中
useEffect(() => {
  const interval = setInterval(async () => {
    const filesRes = await fetch(`/api/sessions/${sessionId}/files`)
    const { code: latestCode, schema: latestSchema } = await filesRes.json()
    
    if (latestCode !== code) setCode(latestCode)
    if (latestSchema !== schema) setSchema(latestSchema)
  }, 2000) // 每 2 秒检查一次
  
  return () => clearInterval(interval)
}, [sessionId, code, schema])
```

**推荐**: 方案 A 更高效且符合实时通信的最佳实践

---

## 四、修复实施计划

### 阶段 1: 核心修复（P0 问题）

| 任务 | 文件 | 预计工作量 |
|------|------|----------|
| 1.1 实现 `onSchemaUpdate` 调用 | `ai-chat.tsx` | 30 分钟 |
| 1.2 同步 `initialData` | `ConfigFormNew.tsx` | 20 分钟 |

### 阶段 2: 数据一致性修复（P1 问题）

| 任务 | 文件 | 预计工作量 |
|------|------|----------|
| 2.1 更新 `configData` 逻辑 | `edit/page.tsx` | 30 分钟 |
| 2.2 修复闭包陷阱 | `edit/page.tsx` | 20 分钟 |

### 阶段 3: 架构改进（P2 问题，可选）

| 任务 | 文件 | 预计工作量 |
|------|------|----------|
| 3.1 后端文件变更推送 | `agent-service/src/routes/` | 2 小时 |
| 3.2 前端监听文件变更 | `edit/page.tsx` | 1 小时 |

---

## 五、测试验证

### 5.1 测试用例

| 测试场景 | 预期结果 |
|---------|---------|
| AI 修改 index.tsx | 预览区在 1 秒内刷新显示新效果 |
| AI 修改 config.schema.json | 配置面板立即显示新字段 |
| AI 同时修改两个文件 | 预览区和配置面板都正确更新 |
| 用户修改配置后 AI 再改 schema | 用户已修改的值保留，新增字段使用默认值 |

### 5.2 手动测试步骤

1. 启动开发服务器: `pnpm dev`
2. 打开任意 Demo 编辑页面
3. 在 AI 对话框输入: "修改按钮颜色为红色，并添加一个文本输入框配置"
4. 观察:
   - [ ] 预览区按钮颜色变红
   - [ ] 配置面板出现新的文本输入框配置项
   - [ ] 编辑器内容同步更新

---

## 六、总结

### 6.1 根本原因总结

问题的核心在于 **数据流不完整**：
1. AI 输出未能正确解析并分发到各个回调
2. 子组件状态未能响应父组件 props 变化
3. 关联数据（code、schema、configData）更新不同步

### 6.2 架构反思

当前架构依赖回调函数传递文件变更，存在以下问题：
- **脆弱性**: 任何回调遗漏都会导致状态不一致
- **竞态条件**: 多个独立回调可能捕获过时的闭包状态
- **可维护性**: 新增文件类型需要修改多处代码

**长期建议**:
- 引入全局状态管理（如 Zustand/Jotai）统一管理文件状态
- 使用后端推送机制替代回调模式
- 增加文件版本控制，避免状态漂移

---

## 附录

### A. 相关文件清单

| 文件路径 | 作用 |
|---------|------|
| `packages/web/src/components/demo/ai-chat.tsx` | AI 对话组件，负责提取代码/schema 更新 |
| `packages/web/src/components/demo/ConfigFormNew.tsx` | 配置面板组件，根据 schema 渲染表单 |
| `packages/web/src/components/demo/PreviewPanel.tsx` | 预览区组件，使用 Sandpack 渲染代码 |
| `packages/web/src/app/demo/[id]/edit/page.tsx` | 编辑页面主组件，管理所有状态和回调 |
| `packages/web/src/lib/fs-utils` | 文件系统工具，包含验证和默认值生成 |

### B. 关键数据流图

```
┌─────────────┐
│  AI Response │
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│  ai-chat.tsx        │ ← 问题 P1: 只提取 code
│  (提取代码/schema)   │
└──┬──────────────┬───┘
   │              │
   ▼              ▼
onCodeUpdate   onSchemaUpdate ← 问题 P1: 从未被调用
   │              │
   ▼              ▼
┌──────────────────────────┐
│  edit/page.tsx           │
│  handleCodeUpdate        │ ← 问题 P4: 闭包陷阱
│  handleSchemaUpdate      │ ← 问题 P3: 未更新 configData
└──┬───────────────────┬───┘
   │                   │
   ▼                   ▼
code/schema state   configData state ← 问题 P3: 不同步
   │                   │
   ▼                   ▼
┌─────────┐      ┌──────────────┐
│Preview  │      │ ConfigForm   │
│Panel    │      │ (initialData)│ ← 问题 P2: 不响应变化
└─────────┘      └──────────────┘
```
