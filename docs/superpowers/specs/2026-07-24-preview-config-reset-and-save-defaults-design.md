# 预览区配置重置修复 + 保存为默认值

## 背景

创作端编辑页存在配置状态不一致问题：用户在配置面板修改配置后，预览区正常显示；但当 agent 修改页面代码触发编译刷新后，预览区配置回退为 schema 默认值，而配置面板仍显示用户修改后的值。用户继续修改配置后，预览区又恢复正确。

同时缺少将当前运行时配置持久化回 schema 默认值的能力。

## 目标

1. 消除 agent 编辑代码后预览区配置重置的 bug
2. 在配置面板增加"保存为默认值"按钮

## 方案决策

- **策略**：确保 iframe 初始化 HTML 始终包含当前运行时配置（`configDataRef.current`），并在 iframe 加载完成后发送 `UPDATE_CONFIG` 作为兜底同步。

## 1. 预览区配置重置修复

### 1.1 根因

1. **iframe 初始配置为空**：`PreviewPanel.tsx` 的 `useEffect`（line 1389）创建 iframe `src` 时，调用 `generateIframeHtml` **未传入 `configData`**，导致 iframe 初始 HTML 中 `currentConfig = {}`。
2. **无加载后同步**：iframe 没有 `onLoad` 处理器在加载完成后同步配置，完全依赖后续的 `UPDATE_CODE` postMessage 带配置数据。若 `UPDATE_CODE` 到达时 iframe 尚未就绪或消息丢失，则配置丢失。
3. **编译期 contentLoaded 置 false**：代码变更时 `contentLoaded` 被设为 `false`（opacity 0），用户看到 iframe 隐藏。当 `contentLoaded` 恢复为 `true` 时，iframe 可能已渲染空配置内容。

### 1.2 修改点

#### `packages/demo-ui/src/PreviewPanel.tsx`

**A. 创建 iframe src 时传入当前配置**

在 `useEffect`（line 1389-1420）中，将 `configDataRef.current` 传入 `generateIframeHtml`：

- 仅在内联 HTML 降级路径（data:text/html）生效。固定 shell 路径（`/api/preview-runtime/shell`）不受此变更影响，因为 shell 由服务端生成。
- `configDataRef` 不能加入 useEffect 的依赖数组（会导致每次配置变更都重新创建 src），直接在回调内读取 ref 即可。

**B. 增加 iframe onLoad 处理器**

给 `<iframe>` 元素添加 `onLoad` 回调：

- 发送 `UPDATE_CONFIG` postMessage，携带 `configDataRef.current`、`appStateRef.current`、`routeParamsRef.current`
- 将 `iframeReadyRef.current` 设为 `true`
- 若有 `pendingCompileResultRef`，立即 flush（发送 pending 的编译结果）

#### `packages/demo-ui/src/iframe-template.ts`

无需修改。`generateIframeHtml` 已支持可选的 `configData` 参数（`IframeTemplateOptions.configData`），直接传入即可。

### 1.3 边界情况

- **初次加载**：iframe onLoad 触发 UPDATE_CONFIG，与后续 UPDATE_CODE 中的 configData 一致，无冲突。
- **代码变更编译**：配置面板修改 - agent 改代码 - 预览编译 - 发送 UPDATE_CODE 带正确 configData。onLoad 不触发（iframe 未重新创建）。
- **手动刷新预览**：iframe 重创，onLoad 发送 UPDATE_CONFIG，后续代码编译完成再发 UPDATE_CODE。配置始终保持一致。
- **多页面切换**：onLoad 确保切回页面时配置正确。

### 1.4 不涉及

- 不修改 `/api/preview-runtime/shell` 端点的逻辑
- 不修改 `applyDemoSnapshot` 或 `handleCodeUpdate` 的配置合并逻辑
- 不修改 `configDataMap` 状态管理

## 2. 保存为默认值

### 2.1 功能描述

在 PageConfigPanel 的"本页配置"区域标题行右侧增加"保存为默认值"按钮。点击后弹出确认对话框，确认后将当前页面配置值写入对应页面的 schema `default` 字段。

### 2.2 交互流程

1. 用户点击"保存为默认值"按钮
2. 弹出确认对话框，文案："将使用当前本页配置覆盖默认配置，新项目或新增页面将使用新默认值。确认保存？"
3. 用户点击"确认"：执行保存逻辑，成功后关闭对话框并提示成功
4. 用户点击"取消"：关闭对话框，无操作

按钮仅在非 readonly 模式下显示。若页面无 schema 或当前配置为空，按钮置灰。

### 2.3 修改点

#### `packages/demo-ui/src/PageConfigPanel.tsx`

- 在"本页配置"标题行右侧增加"保存为默认值"按钮（使用 `Save` 图标，lucide-react）
- 增加确认对话框（使用现有 shadcn/ui `AlertDialog`）
- Props 新增：`onSaveAsDefaults?: (pageId: string) => void`

#### `packages/author-site/src/app/demo/[id]/edit/page.tsx`

- 实现 `handleSaveAsDefaults` 回调：
  1. 从 `pageSchemaMap` 获取当前页面的 schema
  2. 从 `configDataMap` 获取当前页面的运行时配置
  3. 解析 schema JSON，遍历 `properties`，将每个有对应运行时值的 prop 的 `default` 更新为当前值
  4. 将更新后的 schema 通过 `handlePageSchemaChange` 写回（通过 collab 同步到磁盘）
  5. toast 提示成功/失败
- 将回调传入 `PageConfigPanel.onSaveAsDefaults`

### 2.4 注意事项

- 仅更新存在对应运行时值的字段的 `default`，不新增或删除字段
- `__order`、`__orderH`、`__positions` 等元数据字段不写入 schema
- 保持 schema 的 `$demo` 等扩展字段不变
- 若 schema 中存在嵌套结构（`children`/`oneOf`），当前实现仅处理一级 `properties`，嵌套字段的默认值更新留待后续支持

### 2.5 不涉及

- 不修改项目共享配置（project config）的默认值
- 不提供批量保存多个页面默认值的功能
- 不影响预览区的配置显示逻辑

## 3. 测试验证

### 3.1 预览重置修复验证

1. 打开项目编辑页，修改配置面板中的配置项
2. 观察预览区是否正确显示修改后的配置
3. 通过 AI 对话让 agent 修改页面代码（非 schema）
4. 观察编译刷新后预览区是否仍显示修改后的配置（不应重置为默认值）

### 3.2 保存为默认值验证

1. 修改配置面板中的配置项
2. 点击"保存为默认值"按钮
3. 确认对话框中点击"确认"
4. 查看 toast 提示成功
5. 刷新页面或重新打开，确认配置默认值已更新为新值

### 3.3 回归验证

- `pnpm check:author` 通过
- `pnpm --filter @workbench/demo-ui typecheck` 通过
