# 代码校验迁移至 AI Agent 工具方案

> **日期**: 2026-05-26
> **类型**: 架构重构
> **状态**: 待评审

---

## 一、现状分析

### 1.1 当前校验机制

当前校验功能由 `validateAll()` 驱动，在前端被调用了 **15 处**：

| 触发场景 | 行号 | 触发时机 |
|----------|------|----------|
| AI 流结束 | 169 | `useEffect` 监听 `aiIsStreaming` 变化 |
| 页面初始加载 | 346 | `loadDemo()` 完成时 |
| 编辑器手动编辑 | 407 | `handleEditorChange()` |
| AI 代码更新 | 598 | `handleCodeUpdate()` |
| AI Schema 更新 | 736 | `handleSchemaUpdate()` |
| 新建对话 | 897 | 创建 AI 会话时 |
| 选择页面 | 1004 | 页面树切换 |
| 删除页面后切换 | 1098 | 删除后自动加载下一页 |
| 查看代码 | 1130 | `onViewCode` |
| 预览下拉切换 | 1188 | Select 下拉框 |
| 宫格预览点击 | 1299 | PreviewGrid 点击 |
| 代码查看对话框保存 | 1401 / 1411 | 保存代码或 Schema |

### 1.2 已发现的问题

- **重复调用**：`use-chat-stream.ts` 的 `onFinish` 中，`processRealtimeFiles()` 和 `extractCodeAndSchemaUpdates()` 都触发了 `onCodeUpdate/onSchemaUpdate`，导致 `handleCodeUpdate/handleSchemaUpdate` 执行两次
- **中间状态误报**：AI 同时更新代码和 Schema 时，`handleCodeUpdate` 用旧 Schema 校验新代码，产生临时误报
- **React await 边界触发**：`setIsStreaming(false)` 后的 `await persistMessages()` 导致中间 re-render，触发无效校验
- **死状态**：`repairFailureCount` 声明并递增，但从未被消费
- **正则局限**：`extractPropsFromCode` 的 `[^}]+` 无法处理嵌套类型

### 1.3 校验范围评估

当前 `validateAll()` 只检查三类问题，**覆盖范围很窄**：

| 检查项 | 能发现什么 | 漏掉什么 |
|--------|-----------|---------|
| Schema JSON 语法 | 括号/引号不闭合 | — |
| Props ↔ Properties 一致性 | 字段增减不一致 | 编译错误、类型错误、运行时错误 |
| required 完整性 | 指向不存在的字段 | 打包问题、样式问题、逻辑错误 |

### 1.4 结论

校验功能有一定价值（尤其是一键修复的交互闭环），但被过度调用、触发时机混乱。核心问题是"被动触发"模式导致大量冗余和误报。

---

## 二、目标

1. **消除所有前端主动校验触发**：删除 15 处 `validateAll()` 调用
2. **将校验做成 AI 工具**：AI 完成任务后自行调用，拿到结果可在同轮对话中修复
3. **保持用户体验不降级**：保留 ErrorBanner 展示，但数据来源从"前端主动触发"改为"用户手动触发或 AI 自动触发"
4. **前端大幅简化**：删除冗余的状态管理和回调逻辑

---

## 三、方案设计

### 3.1 架构变化

```
[当前架构]
  AI 流结束 / 页面切换 / 编辑器编辑 ...
       │
       ▼ (15 个触发点)
  validateAll(code, schema)
       │
       ▼
  setValidationResult(result)
       │
       ▼
  ErrorBanner / ValidationPanel (展示)

[目标架构]
  AI 完成所有文件修改
       │
       └─→ 调用 validate_demo 工具 (仅一次，最终校验)
               │
               ▼  Agent Service 读文件 + 执行检查项
               │
               ▼  返回结构化结果 { passed, checks[] }
               │
          ┌────┴────┐
          ▼         ▼
       有问题     全部通过
       │           │
  AI 修复后    告知用户完成
  直接结束     (无需再校验)
  (信任 AI)

  前端:
    - 页面加载时不再自动校验
    - 提供"检查代码"手动按钮（兜底）
    - ErrorBanner 只展示由 AI 工具带回来的结果
```

### 3.2 Agent Service 新增工具

在 `packages/agent-service/` 中注册新 MCP 工具：

**工具名**: `validate_demo`

**参数**:

| 参数 | 类型 | 说明 |
|------|------|------|
| `sessionId` | string | 会话 ID |
| `demoId` | string | 页面 ID（可选，默认当前页面） |

**实现逻辑**:
1. 通过 `sessionId` 找到 workspace 路径
2. 读取 `demos/{demoId}/index.tsx`（代码文件）
3. 读取 `demos/{demoId}/config.schema.json`（Schema 文件）
4. 调用 `validateAll()`（复用 `packages/author-site/lib/validator.ts` 逻辑，迁移到 `shared` 包或直接在后端实现）
5. 返回结构化结果

**返回格式**：

```json
{
  "passed": false,
  "checks": [
    {
      "name": "json_syntax",
      "passed": true,
      "issues": []
    },
    {
      "name": "props_consistency",
      "passed": false,
      "issues": [
        {
          "severity": "warning",
          "message": "代码中的 props \"bgColor\" 未在 Schema 的 properties 中定义",
          "location": { "file": "demos/{demoId}/index.tsx", "line": 42 },
          "fix_suggestion": "在 config.schema.json 的 properties 中添加 \"bgColor\" 字段"
        },
        {
          "severity": "info",
          "message": "Schema 中的 property \"subtitle\" 未在代码的 DemoProps 中定义",
          "location": { "file": "demos/{demoId}/config.schema.json" },
          "fix_suggestion": "在 DemoProps 中添加 subtitle 字段声明，或从 Schema 中移除"
        }
      ]
    },
    {
      "name": "required_integrity",
      "passed": true,
      "issues": []
    },
    {
      "name": "component_structure",
      "passed": true,
      "issues": []
    }
  ]
}
```

每项检查独立报告，AI 可以清楚地知道哪项没过、在哪、怎么修。`fix_suggestion` 字段是关键——AI 直接照着指令修。**全程只调一次**，AI 修复后不再二次校验。

### 3.3 System Prompt 调整

在 AI 的 system prompt 中加入：

```
## 编码规范
- 必须为每个组件定义 `interface DemoProps { ... }` 或 `type DemoProps = { ... }`
- **所有文件修改完成后，最后调用一次 `validate_demo` 工具**，确认代码与 Schema 配置一致性
- 如果 `validate_demo` 返回错误，修复后直接结束，**不需要再次调用**校验工具
- 注意：`validate_demo` 只作为最终确认，过程中无需调用
```

### 3.4 前端修改

#### 删除项

| 位置 | 删除内容 |
|------|---------|
| `page.tsx:166-172` | `useEffect([aiIsStreaming])` 中的 `validateAll` 调用 |
| `page.tsx:346` | `loadDemo()` 中的 `validateAll` |
| `page.tsx:407` | `handleEditorChange()` 中的 `validateAll` |
| `page.tsx:597-600` | `handleCodeUpdate()` 中的 `validateAll` 和 `setValidationResult` |
| `page.tsx:673-676` | Schema 自动生成后的 `validateAll` |
| `page.tsx:734-744` | `handleSchemaUpdate()` 中的 `validateAll` 和 `isRepairAttemptRef` |
| `page.tsx:897` | 新建对话时的 `validateAll` |
| `page.tsx:1004` | 页面选择时的 `validateAll` |
| `page.tsx:1098` | 删除页面切换后的 `validateAll` |
| `page.tsx:1130` | `onViewCode`（本身没调，但关联的逻辑可简化） |
| `page.tsx:1188` | 预览下拉切换时的 `validateAll` |
| `page.tsx:1299` | 宫格预览点击时的 `validateAll` |
| `page.tsx:1401,1411` | 代码查看对话框保存后的 `validateAll` |
| `page.tsx:602-607,739-744` | `isRepairAttemptRef` 和 `repairFailureCount` 相关逻辑 |

#### 保留/修改项

- **`validationResult` 状态**：保留，但只通过 `onSchemaUpdate`/`onCodeUpdate` 回传结果时更新，不再主动触发
- **`ErrorBanner`**：保留，但增加一个"检查代码"按钮（手动触发 `validate_demo`）
- **`handleSendErrorToAI`**：保留，用户手动点"让 AI 修复"时使用
- **`ValidationPanel`**：保留展示，调用方式改为接收 AI 工具返回的结果
- **`handleSave` 中的错误检查**：改为**不阻止保存**，仅展示 toast 提示（因为不校验也能保存是合理的）

#### 需要新增

- **`validate_demo` 调用函数**：封装对 Agent Service 的 HTTP 请求
- **手动验证按钮**：在 ErrorBanner 或工具栏上加"检查代码"按钮
- **`onFinish` 中带回校验结果**：如果 AI 调用了 `validate_demo`，通过流事件把结果带回前端

### 3.5 数据流对比

```
[当前]
  AI 修改文件 → onCodeUpdate → validateAll → setValidationResult(result) → ErrorBanner 展示
  AI 修改文件 → onSchemaUpdate → validateAll → setValidationResult(result) → ErrorBanner 展示
  AI 流结束 → useEffect → validateAll → setValidationResult(result) → ErrorBanner 展示
  页面切换 → fetch + validateAll → setValidationResult(result) → ErrorBanner 展示
  ...

[目标]
  AI 完成所有文件修改 → 调用 validate_demo（仅一次，最终校验）
       │
       ▼
  Agent Service 读文件 → 执行多项检查 → 返回结构化结果
       │
       ▼
  AI 看到结果 → 有错则修复 → 直接结束（无需二次校验）
       │
  流结束时通知前端 → 前端展示最终 validationResult
       │
  (用户也可以手动点"检查代码"兜底)
```

---

## 四、实施步骤

### Step 1：提取校验逻辑为共享模块

`validator.ts` 目前位于 `packages/author-site/lib/`。需要将其移到 `packages/shared/` 中，同时让 author-site 和 agent-service 都能引用。

或者直接在 agent-service 中重新实现（逻辑简单，仅 410 行）。

**推荐**：移入 `packages/shared/src/validator.ts`，两端复用。

### Step 2：Agent Service 注册 `validate_demo` 工具

在 `packages/agent-service/src/server.ts` 或新增工具注册文件中添加：

- 定义工具 schema（参数 + 返回格式）
- 实现 handler：读文件 → `validateAll()` → 返回结果
- 注册到工具工厂

### Step 3：更新 AI System Prompt

修改 prompt 模板，加入"**所有修改完成后，最终调用一次** validate_demo"的指令，明确要求过程中无需调用。

### Step 4：前端清理

逐项删除 15 处 `validateAll()` 触发点，删除 `isRepairAttemptRef` / `repairFailureCount` 相关逻辑。

### Step 5：ErrorBanner 扩展

- 添加"检查代码"手动按钮
- 支持来自 AI 工具的结果展示
- 调整保存行为（warning 不再阻止保存）

### Step 6：测试

- 测试 `validate_demo` 工具在 agent-service 中正常工作
- 测试 AI 多轮对话后能正确调用工具
- 测试前端 ErrorBanner 在手动/自动两种模式下正常展示
- 验证所有后端（opencode-http、ACP claude、ACP codex 等）都能正常调用 `validate_demo`

---

## 五、风险与应对

| 风险 | 等级 | 应对 |
|------|------|------|
| AI 不主动调用 `validate_demo` | 高 | 保留手动"检查代码"按钮兜底；system prompt 中强调；后续可加超时检测 |
| 不同后端对工具调用的支持不一致 | 中 | 先在 opencode-http 后端验证；ACP 后端需确认工具注册兼容性 |
| 迁移 validator 到 shared 包引入循环依赖 | 低 | validator.ts 无 author-site 特定依赖，迁移风险低 |
| 用户习惯变化（不再自动弹出错误） | 低 | 手动按钮 + AI 自动引入后，体验实际更流畅 |

---

## 六、校验范围扩展建议

当前 `validateAll()` 只检查三项（JSON 语法、Props 一致性、required 完整性），覆盖面较窄。建议作为 AI 工具后，逐步扩展检查项：

| 检查项 | 当前 | 建议 | 价值 |
|--------|------|------|------|
| JSON Schema 语法 | ✅ | — | 已有 |
| Props ↔ Properties 双向一致性 | ✅ | — | 已有 |
| required 完整性 | ✅ | — | 已有 |
| **组件结构标准** | ❌ | 检查 `export default function`、`interface DemoProps` 是否声明 | 高 — 防止 AI 写出非标结构 |
| **Schema 字段上游引用** | ❌ | 分析代码中实际使用的 `props.xxx` / 解构字段，与 Schema properties 正向比对 | 高 — 补充现有反向检查 |
| **TypeScript 编译** | ❌ | 对 workspace 运行 `tsc --noEmit` 或 esbuild 编译检查 | 最高 — 直接阻止编译错误 |
| **import 有效性** | ❌ | 检查 import 的模块是否在 package.json 中声明 | 中 — 减少运行时断裂 |
| **CSF 格式完整性** | ❌ | 检查 Figma 文本标记结构是否完整 | 中 — 防止编辑区显示异常 |

**原则**：不做通用 lint 工具，只针对"AI 改 Demo 最容易出错的地方"做精确检查。每项检查结果带具体 `fix_suggestion`，让 AI 可以直接照着修。

---

## 七、工具调用时机

**只调一次，在最后**：

1. AI 完成所有文件修改（可能涉及代码 + Schema + 其他资源）
2. AI 调用 `validate_demo` 进行最终校验
3. 有错则修，修复后直接结束（信任 AI，不二次校验）
4. 全部通过则直接告知用户完成

---

## 八、不做的方案（否决的替代方案）

### 方案 B：保持前端触发，只修重复调用
修复 `use-chat-stream.ts` 中 `onFinish` 的重复调用 + 修复 `handleCodeUpdate` 使用旧 schema 的问题。

→ **否决原因**：治标不治本，15 个触发点仍然存在，架构没有简化。

### 方案 C：完全去掉校验功能
删除所有校验逻辑和 UI。

→ **否决原因**：校验在开发中能帮助发现配置不一致问题，有实际价值；且一键修复的交互闭环已投入使用。

---

## 九、涉及文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `packages/shared/src/validator.ts` | **新建** | 从 author-site/lib/validator.ts 迁移 |
| `packages/shared/src/index.ts` | **修改** | 导出 validator |
| `packages/agent-service/src/server.ts` | **修改** | 注册 `validate_demo` 工具 |
| `packages/agent-service/src/tools/validate-demo.ts` | **新建** | 工具 handler 实现 |
| `packages/author-site/lib/validator.ts` | **删除** | 逻辑已迁移到 shared |
| `packages/author-site/src/app/demo/[id]/edit/page.tsx` | **修改** | 删除 15 处校验触发 + 死代码 |
| `packages/author-site/src/components/demo/ErrorBanner.tsx` | **修改** | 添加手动"检查代码"按钮 |
| AI System Prompt 模板 | **修改** | 加入 validate_demo 指令 |
