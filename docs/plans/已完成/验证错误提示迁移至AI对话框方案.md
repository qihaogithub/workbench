# 验证错误提示迁移至 AI 对话框方案

## 一、问题背景

### 1.1 当前问题

当前验证错误信息展示在**配置面板**顶部，存在以下问题：

| 问题 | 现状 | 影响 |
|------|------|------|
| 错误信息过于技术化 | "未找到 DemoProps 接口定义，无法校验 props 一致性" | 用户完全依赖 AI 编码，看不懂这些技术术语 |
| 展示位置不直观 | 错误在右侧配置面板，AI 在左侧 | 用户需要左右切换视线，操作路径不连贯 |
| 修复建议不可操作 | "修复建议"仅为静态文本展示 | 用户无法一键触发修复，需要手动复制粘贴 |

### 1.2 目标用户画像

- **非技术用户**：完全依赖 AI 进行编码，不理解代码层面的技术概念
- **操作习惯**：看到错误 → 告诉 AI → AI 自动修复
- **期望体验**：错误提示通俗易懂 + 一键发送给 AI 修复

---

## 二、方案设计

### 2.1 整体思路

将验证错误从**配置面板**迁移至**AI 对话框上方**，实现：

1. **错误提示通俗化**：将技术术语转化为用户能理解的自然语言
2. **操作路径缩短**：错误提示与 AI 输入框相邻，一键发送
3. **修复流程闭环**：用户点击"让 AI 修复"→ 自动将错误上下文发送给 AI → AI 自动修复代码

### 2.2 错误提示位置变更

```
变更前：
┌──────────────┬──────────────┬──────────────────────────┐
│   AI 对话框   │    预览区     │      配置面板             │
│              │              │  ┌────────────────────  │
│              │              │  │ 验证结果 1警告      │  │  ← 错误在这里
│              │              │  │  未找到DemoProps...│  │
│              │              │  └────────────────────┘  │
│              │              │  [配置表单]               │
──────────────┴──────────────┴──────────────────────────┘

变更后：
┌──────────────┬──────────────┬──────────────┐
│ 左面板        │    预览区     │   配置面板    │
│ ┌──────────────────────────┐│              │
│ │ ⚠ 当前代码有错误...       ││              │  ← 错误移到这里
│ │ [让 AI 修复]              ││              │    (Tabs 上方)
│ └──────────────────────────┘│              │
│ ┌──────────────────────────┐│              │
│ │ Tabs: [AI 对话] [页面]    ││              │
│ ├──────────────────────────┤│              │
│ │ AI 对话消息区域            ││              │
│ └──────────────────────────┘│              │
│ [输入框] [发送]              │              │
──────────────┴──────────────┴──────────────┘
```

> **说明**：当前左面板使用 Tabs 组件（"AI 对话" / "页面"两个标签页），ErrorBanner 位于 Tabs 上方（`ResizablePanel` 内部、`<Tabs>` 之前），确保切换标签页时横幅始终可见。

### 2.3 错误消息通俗化映射

| 原技术消息（`validator.ts` 中定义） | 通俗化消息 | 严重级别 |
|-----------|-----------|---------|
| `未找到 DemoProps 接口定义，无法校验 props 一致性` | `代码缺少配置项定义，AI 需要补充接口声明` | 警告 |
| `代码中的 props "xxx" 未在 Schema 的 properties 中定义` | `代码使用了配置项 "xxx"，但配置表中没有注册` | 警告 |
| `Schema 中的 property "xxx" 未在代码的 DemoProps 中定义` | `配置表中有 "xxx"，但代码中没有使用它` | 提示 |
| `JSON 语法错误: ...` | `配置文件格式有误，AI 可以帮你修复` | 错误 |
| `无法解析 Schema 中的 properties` | `配置文件格式有误，AI 可以帮你修复` | 错误 |
| `required 字段 "xxx" 未在 properties 中定义` | `必填项 "xxx" 缺少定义，AI 需要补充` | 错误 |

> **实现方式**：通过 `ValidationError.type` 字段匹配（不依赖具体 message 文本匹配）：
> - `"json_syntax"` → 配置文件格式有误
> - `"interface_not_found"` → 代码缺少配置项定义
> - `"props_code_not_in_schema"` → 代码使用了未注册的配置项
> - `"props_schema_not_in_code"` → 配置表中有未使用的配置项
> - `"required_missing"` → 必填项缺少定义

### 2.4 错误聚合策略

当存在多个错误时，不逐一展示技术细节，而是**聚合为一条通俗提示**：

```
┌────────────────────────────────────────────────────────┐
│ ⚠ 当前代码有 3 处需要调整，AI 可以帮你一键修复           │
│                                                        │
│ • 配置文件格式有误                                      │
│ • 2 个配置项未正确注册                                  │
│                                                        │
│ [让 AI 修复]  [查看详情（可选）]                         │
└────────────────────────────────────────────────────────┘
```

---

## 三、技术实现

### 3.1 新增组件：ErrorBanner

**文件位置**：`packages/author-site/src/components/demo/ErrorBanner.tsx`

```tsx
import type { ValidationError } from "../../../lib/validator";

interface ErrorBannerProps {
  errors: ValidationError[];
  disabled?: boolean;       // AI 正在输出时禁用按钮
  onSendToAI: (context: ErrorContext) => void;
}

interface ErrorContext {
  summary: string;          // 通俗化摘要
  details: string;          // 技术详情（供 AI 参考）
  code: string;             // 当前代码
  schema: string;           // 当前 Schema
}
```

**UI 结构**：
- 顶部横幅样式，位于 Tabs 上方（左面板 `ResizablePanel` 内部）
- 显示通俗化错误摘要
- "让 AI 修复"按钮点击后调用 `onSendToAI`，`disabled` 时不可点击
- 可选的"查看详情"折叠面板（展示原始技术信息，供需要时参考）

### 3.2 错误消息转换层

**文件位置**：`packages/author-site/lib/error-mapper.ts`（新建，与现有 `validator.ts` 同目录）

```typescript
import type { ValidationError } from "./validator";

interface UserFriendlyError {
  summary: string;
  count: number;
  canAutoFix: boolean;
}

// 按严重程度分类并生成通俗摘要
export function mapToUserFriendly(errors: ValidationError[]): UserFriendlyError {
  const hasJsonError = errors.some(e => e.type === "json_syntax");
  const propsErrors = errors.filter(e => e.type === "props_code_not_in_schema" || e.type === "props_schema_not_in_code");
  const interfaceErrors = errors.filter(e => e.type === "interface_not_found");
  const requiredErrors = errors.filter(e => e.type === "required_missing");

  const parts: string[] = [];
  if (hasJsonError) parts.push("配置文件格式有误");
  if (interfaceErrors.length > 0) parts.push("代码缺少配置项定义");
  if (propsErrors.length > 0) parts.push(`${propsErrors.length} 个配置项未正确注册`);
  if (requiredErrors.length > 0) parts.push(`${requiredErrors.length} 个必填项缺少定义`);

  // 生成完整的原始错误详情（供 AI 参考）
  const details = errors.map(e => `- [${e.severity}] ${e.message}${e.fixSuggestion ? `\n  建议: ${e.fixSuggestion.description}` : ""}`).join("\n");

  return {
    summary: parts.length > 0 ? parts.join("，") : `当前代码有 ${errors.length} 处需要调整`,
    details,
    count: errors.length,
    canAutoFix: true,
  };
}
```

> **注意**：该文件位于 `packages/author-site/lib/`（非 `src/lib/`），与现有 `validator.ts` 同目录。在 `page.tsx` 中通过相对路径 `import { mapToUserFriendly } from "../../../../../lib/error-mapper"` 引入。

### 3.3 AI 对话集成

**修改文件**：`packages/author-site/src/app/demo/[id]/edit/page.tsx`

#### 3.3.1 新增状态

```typescript
const [errorBannerVisible, setErrorBannerVisible] = useState(false);
const [tabValue, setTabValue] = useState("ai");             // 新增：控制 Tab 切换
const [triggerAutoSend, setTriggerAutoSend] = useState<string | null>(null); // 新增：触发 AI 自动发送
const [repairFailureCount, setRepairFailureCount] = useState(0); // 新增：连续修复失败计数
```

> **`tabValue`** 替代 Tabs 的 `defaultValue="ai"` 为 `value={tabValue}` + `onValueChange={setTabValue}`，实现编程式切换标签页。
>
> **`triggerAutoSend`** 传递给 AIChat 新增的 `triggerAutoSend` prop（见 3.3.5），当设为非 null 字符串时 AIChat 自动发送该消息。

#### 3.3.2 AI Chat 消息发送机制

当前 AIChat 内部的 `handleSend`（`useChatStream` 返回）仅通过 `ChatInput.onSubmit` 触发，未暴露给父组件。需增加自动发送能力：

**方案**：AIChat 新增 `triggerAutoSend` prop

当 `triggerAutoSend` 变化为非空字符串且 `!isStreaming` 时，AIChat 内部通过 `useEffect` 调用 `handleSend(triggerAutoSend)`，发送后父组件将 `triggerAutoSend` 重置为 `null`。

```typescript
// handleSendErrorToAI 回调实现
const handleSendErrorToAI = useCallback((context: ErrorContext) => {
  const aiPrompt = `你是一个前端组件开发助手。当前组件存在以下配置问题，请帮我修复：

【问题摘要】
${context.summary}

【技术详情】
${context.details}

【当前代码】
\`\`\`tsx
${context.code}
\`\`\`

【当前配置】
\`\`\`json
${context.schema}
\`\`\`

请：
1. 分析上述问题
2. 修改代码和/或配置文件来修复问题
3. 保持组件的原有功能不变`;

  setTabValue("ai");              // 切换到 AI 对话标签页
  setTriggerAutoSend(aiPrompt);    // 触发 AI 自动发送
}, []);
```

#### 3.3.3 布局调整

当前左面板结构（`page.tsx` 第 757 行起）：
```
<ResizablePanel>
  <Tabs defaultValue="ai">     ← 改为 value={tabValue}
    <TabsList>
      <TabsTrigger value="ai">AI 对话</TabsTrigger>
      <TabsTrigger value="pages">页面</TabsTrigger>
    </TabsList>
    <TabsContent value="ai">
      <AIChat ... />
    </TabsContent>
    <TabsContent value="pages">
      <DemoPageTree ... />
    </TabsContent>
  </Tabs>
</ResizablePanel>
```

变更后：ErrorBanner 置于 Tabs 上方，与 AIChat 新增的 `triggerAutoSend` prop 对接：

```tsx
<ResizablePanel className="flex flex-col border-r bg-card">
  {/* 错误横幅 - 新增：位于 Tabs 上方，不受标签页切换影响 */}
  {errorBannerVisible && validationResult.errors.length > 0 && (
    <ErrorBanner
      errors={validationResult.errors}
      disabled={aiIsStreaming}
      onSendToAI={handleSendErrorToAI}
    />
  )}

  <Tabs
    value={tabValue}
    onValueChange={setTabValue}
    className="flex-1 flex flex-col min-h-0 [&>[data-state=active]]:flex-1 [&>[data-state=active]]:flex [&>[data-state=active]]:flex-col [&>[data-state=active]]:min-h-0"
  >
    <TabsList className="w-full justify-start rounded-none border-b px-2 h-12 bg-transparent">
      <TabsTrigger value="ai" className="gap-2">
        <Bot className="h-4 w-4" />
        AI 对话
      </TabsTrigger>
      <TabsTrigger value="pages" className="gap-2">
        <Layers className="h-4 w-4" />
        页面
        {demoPages.length > 0 && (
          <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1">
            {demoPages.length}
          </Badge>
        )}
      </TabsTrigger>
    </TabsList>

    <TabsContent value="ai" className="flex-1 flex flex-col mt-0 min-h-0 min-w-0 data-[state=inactive]:hidden">
      <AIChat
        sessionId={sessionId}
        agentSessionId={agentSessionId}
        workingDir={tempWorkspace || undefined}
        projectId={demoId}
        demoId={activeDemoId}
        workspaceId={workspaceId || undefined}
        onCodeUpdate={handleCodeUpdate}
        onSchemaUpdate={handleSchemaUpdate}
        externalMessages={aiMessages}
        externalIsStreaming={aiIsStreaming}
        externalStreamContent={aiStreamContent}
        externalCurrentMessage={aiCurrentMessage}
        onMessagesChange={setAiMessages}
        onIsStreamingChange={setAiIsStreaming}
        onStreamContentChange={setAiStreamContent}
        onCurrentMessageChange={setAiCurrentMessage}
        currentSessionId={sessionId}
        triggerAutoSend={triggerAutoSend}       // 新增：自动发送触发
        onTriggerAutoSendHandled={() => setTriggerAutoSend(null)}  // 新增：发送后重置
        onNewSession={async (existingWorkspaceId) => { ... }}
        onSelectSession={async (newSessionId) => { ... }}
      />
    </TabsContent>

    <TabsContent value="pages" className="flex-1 flex flex-col mt-0 min-h-0 min-w-0 data-[state=inactive]:hidden">
      <DemoPageTree ... />
    </TabsContent>
  </Tabs>
</ResizablePanel>
```

#### 3.3.4 验证结果变化时更新 ErrorBanner

当 `validationResult` 变化时，自动更新 `errorBannerVisible` 和 `repairFailureCount`：

```typescript
// 已有：validationResult 在多个位置被 setValidationResult 更新
// 新增：用一个 useEffect 监听 validationResult 变化，控制横幅显隐

useEffect(() => {
  const hasErrors = !validationResult.isValid && validationResult.errors.length > 0;
  setErrorBannerVisible(hasErrors);
}, [validationResult]);

// 修复后仍有错误时: 在 handleCodeUpdate / handleSchemaUpdate 回调中，
// AI 修复触发 setValidationResult 后，如果 !isValid 则 repairFailureCount++
// 但需要在 AI 修复触发时标记"这是一次修复尝试"
```

#### 3.3.5 AIChat 组件修改

**文件**：`packages/author-site/src/components/ai-elements/ai-chat.tsx`

新增两个 props：

```typescript
interface AIChatProps {
  // ... 现有 props ...
  /** 外部触发的自动发送消息，设为非空字符串时 AI 自动发送 */
  triggerAutoSend?: string | null;
  /** 自动发送处理完成后回调，父组件用于重置 triggerAutoSend */
  onTriggerAutoSendHandled?: () => void;
}
```

AIChat 内部新增 `useEffect`：

```typescript
useEffect(() => {
  if (triggerAutoSend && !isStreaming) {
    handleSend(triggerAutoSend);
    onTriggerAutoSendHandled?.();
  }
}, [triggerAutoSend]);
```

### 3.4 配置面板清理

**修改文件**：`packages/author-site/src/app/demo/[id]/edit/page.tsx`（第 1249-1251 行）

当前代码：
```tsx
// page.tsx 第 1249-1251 行
{!validationResult.isValid && validationResult.errors.length > 0 && (
  <ValidationPanel errors={validationResult.errors} />
)}
```

变更后：删除上述 3 行代码，配置面板仅保留配置表单部分。

> `ValidationPanel` 组件文件（`packages/author-site/src/components/demo/ValidationPanel.tsx`）**保留不删除**（经代码搜索确认当前仅 `page.tsx` 使用它，保留供后续回滚或未来页面使用）。

---

## 四、AI 修复流程

### 4.1 用户操作流程

```
1. 用户看到错误横幅："当前代码有错误，AI 可以帮你修复"
         ↓
2. 用户点击 [让 AI 修复] 按钮
         ↓
3. 系统自动完成：
   - 切换到 "AI 对话" 标签页
   - 构造修复指令（通俗化摘要 + 技术详情 + 当前代码/Schema 快照）
   - 通过 AIChat 的 triggerAutoSend prop 自动发送
         ↓
4. AI 分析问题并自动修改代码文件
         ↓
5. 文件变更触发 onCodeUpdate / onSchemaUpdate 回调
         ↓
6. 回调中执行 validateAll → setValidationResult
         ↓
7. 如果仍有错误，横幅继续显示（更新错误内容）；如果修复成功，横幅消失
```

### 4.2 AI 指令模板

```
你是一个前端组件开发助手。当前组件存在以下配置问题，请帮我修复：

【问题摘要】
{user_friendly_summary}

【技术详情】
{technical_details_line_by_line}

【当前代码】
```tsx
{code}
```

【当前配置】
```json
{schema}
```

请：
1. 分析上述问题
2. 修改代码和/或配置文件来修复问题
3. 保持组件的原有功能不变
```

---

## 五、文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `packages/author-site/src/components/demo/ErrorBanner.tsx` | **新建** | 错误横幅组件 |
| `packages/author-site/lib/error-mapper.ts` | **新建** | 错误消息转换层 |
| `packages/author-site/src/app/demo/[id]/edit/page.tsx` | **修改** | 集成 ErrorBanner，移除 ValidationPanel 渲染，新增 `tabValue`/`triggerAutoSend`/`repairFailureCount` 状态，新增 `handleSendErrorToAI` 回调，新增 `useEffect` 监听验证结果 |
| `packages/author-site/src/components/ai-elements/ai-chat.tsx` | **修改** | 新增 `triggerAutoSend` 和 `onTriggerAutoSendHandled` props，新增自动发送 `useEffect` |
| `packages/author-site/src/components/demo/ValidationPanel.tsx` | **保留** | 当前无其他使用者，保留供回滚或未来复用 |

---

## 六、边界情况处理

### 6.1 AI 修复后仍有错误

- 横幅继续显示，更新错误数量和内容
- 用户可再次点击"让 AI 修复"
- **避免无限循环**：连续 3 次修复失败后，在横幅中显示"AI 未能自动修复，请查看详情"提示，引导用户手动查看技术细节
- 实现：在 AI 代码/配置更新回调（`handleCodeUpdate`/`handleSchemaUpdate`）中，通过 `useRef` 标记"这是一次修复尝试"，若更新后 `!validationResult.isValid` 则 `repairFailureCount++`

### 6.2 AI 正在输出时出现错误

- 横幅显示但"让 AI 修复"按钮通过 `disabled={aiIsStreaming}` 禁用
- 按钮文案改为"请等待当前 AI 任务完成"
- 若 AI 输出导致新错误（通过 `onCodeUpdate`/`onSchemaUpdate` 中的 `validateAll` 触发），横幅内容自动更新

### 6.3 无错误时

- `errorBannerVisible` 为 `false`，横幅不渲染
- 配置面板仅显示配置表单，保持简洁

### 6.4 错误数量过多

- 横幅显示聚合摘要："当前代码有 N 处需要调整"
- "查看详情"可展开查看所有技术细节（原始 `ValidationError[]` 信息）

### 6.5 用户手动编码时

- 用户直接在编辑器中修改代码/Schema，`handleEditorChange` / `handleConfigChange` 触发 `validateAll`
- `useEffect` 监听 `validationResult` 变化，自动更新 `errorBannerVisible`
- 错误即时反馈，符合预期

---

## 七、实施计划

### 阶段一：基础组件（P0）

| 任务 | 文件 | 工作量 |
|------|------|--------|
| 创建 `error-mapper` 转换层 | `lib/error-mapper.ts` | 1h |
| 创建 ErrorBanner 组件 | `src/components/demo/ErrorBanner.tsx` | 2h |
| AIChat 新增 `triggerAutoSend` prop | `src/components/ai-elements/ai-chat.tsx` | 1h |

### 阶段二：集成与布局（P0）

| 任务 | 文件 | 工作量 |
|------|------|--------|
| 新增 tabValue / triggerAutoSend / repairFailureCount 状态 | `page.tsx` | 0.5h |
| Tabs 改为受控模式（`value` + `onValueChange`） | `page.tsx` | 0.5h |
| 在 Tabs 上方集成 ErrorBanner | `page.tsx` | 1h |
| 实现 handleSendErrorToAI 回调 | `page.tsx` | 1h |
| 新增 useEffect 监听 validationResult 控制横幅显隐 | `page.tsx` | 0.5h |
| 从配置面板移除 ValidationPanel 渲染 | `page.tsx` | 0.5h |

### 阶段三：AI 指令优化（P1）

| 任务 | 文件 | 工作量 |
|------|------|--------|
| 优化 AI 修复指令模板 | `page.tsx` | 1h |
| 添加连续修复失败检测与提示 | `page.tsx` | 1h |
| 添加 AI 输出中按钮禁用逻辑 | `page.tsx` | 0.5h |

### 阶段四：测试与验证（P1）

| 任务 | 工作量 |
|------|--------|
| 手动测试各类错误场景（JSON 错误、props 不匹配、接口缺失、必填缺失） | 2h |
| 验证 AI 修复成功率 | 1h |
| 回归测试配置面板功能 | 1h |
| 验证 Tabs 切换不影响 ErrorBanner 显示 | 0.5h |

---

## 八、验收标准

1. **错误不再显示在配置面板**：配置面板只展示配置表单，无验证结果区域
2. **错误横幅位置正确**：位于左面板 Tabs 上方，不受标签页切换影响
3. **消息通俗易懂**：所有错误消息使用自然语言，无技术术语
4. **一键修复可用**：点击"让 AI 修复"后自动切换到 AI 标签页并发送修复指令
5. **修复后横幅更新**：AI 修复代码后，横幅根据最新验证结果更新或消失
6. **AI 输出中按钮禁用**：AI 正在流式输出时，"让 AI 修复"按钮禁用并提示等待
7. **连续修复失败有反馈**：连续 3 次修复失败后，显示引导用户手动查看详情的提示

---

**文档版本**: v1.1
**创建日期**: 2026-05-24
**上次修改**: 2026-05-24（评审校正）
**状态**: 待评审
