# AI 删除页面能力方案

## 背景

创作端的 AI 助手目前**无法删除页面**。系统提示词明确要求 AI「提示用户在界面中执行删除操作（当前工具不支持删除目录）」。用户手动删除页面的前端 UI 和后端 API 均已完备，但 AI 侧缺少调用入口。

## 目标

授予 AI 删除页面的能力，操作前必须通过流式确认弹窗获得用户确认。

## 现状分析

### 已有能力

| 组件 | 状态 | 说明 |
|------|------|------|
| 后端删除 API | ✅ 已就绪 | `DELETE /api/projects/[projectId]/demos/[demoId]` |
| 前端 PermissionDialog | ✅ 已就绪 | 流式确认弹窗组件，位于 `chat/permission-dialog.tsx` |
| WebSocket 协议 | ✅ 已就绪 | `permission_request` / `permission_response` 事件类型已定义 |
| 项目 API 客户端 | ✅ 已就绪 | `ProjectApiClient.deleteDemoPage()` 方法 |
| 前端删除逻辑 | ✅ 已就绪 | 含 `confirm()` 确认、sessionId 校验、级联删除 |

### 缺失部分

| 组件 | 状态 | 说明 |
|------|------|------|
| 专用 `deletePage` 工具 | ❌ 不存在 | pi-tools 中无删除工具；bash 白名单不含 `rm` |
| `permission_request` 事件触发 | ❌ 不存在 | `pi-agent.ts` 的 `setupEventMapping()` 未映射权限事件 |

## 方案设计

### 整体思路

新增 `deletePage` 专用工具 + 补齐 `permission_request` 事件触发链路。

```
用户: "帮我删除首页"
   → AI 解析意图，调用 deletePage 工具
     → pi-agent beforeToolCall 钩子：检测到 deletePage → 发出 permission_request 事件
       → WebSocket 推送到前端 → PermissionDialog 弹窗
         → 用户点击确认 → permission_response 发回后端
           → pi-agent 执行删除逻辑 → 调用已有 DELETE API
             → 返回结果给 AI → AI 告知用户完成
```

### 改动清单

#### 1. 新增 `deletePage` 工具（agent-service）

**文件**：`packages/agent-service/src/backends/pi-tools/delete-page-tool.ts`（新建）

- 工具名：`deletePage`
- 输入参数：
  - `projectId`：项目 ID
  - `pageId`：页面 ID（demo ID）
  - `pageName`：页面名称（用于确认弹窗展示）
  - `sessionId`：当前会话 ID
- 执行逻辑：调用 `ProjectApiClient.deleteDemoPage()` 或直接请求 `DELETE /api/projects/{projectId}/demos/{pageId}?sessionId={sessionId}`
- 注意：工具应直接调用内部 API 而非通过 HTTP（agent-service 与 author-site 运行于同一进程/网络）

#### 2. 注册工具（agent-service）

**文件**：`packages/agent-service/src/backends/pi-tools/index.ts`

- 在工具数组中导入并添加 `deletePageTool`

#### 3. 补齐 `permission_request` 事件触发（agent-service）

**文件**：`packages/agent-service/src/backends/pi-agent.ts`

- 在 `beforeToolCall` 钩子中增加判断：当工具名为 `deletePage` 时，发出 `permission_request` 事件
- 事件 payload：`{ toolCallId, toolName: 'deletePage', pageName, pageId }`
- 等待前端返回 `permission_response` 后再继续执行

#### 4. 更新系统提示词（author-site）

**文件**：`packages/author-site/src/lib/agent/prompts/system-prompt.md`

- 删除或修改第 60-62 行「删除页面」部分：
  - 移除「当前工具不支持删除目录」的限制说明
  - 添加 `deletePage` 工具的使用说明：参数、调用方式、确认流程
- 可选：为文件夹级联删除添加使用指引

#### 5. 注册 `permission_request` 事件类型（agent-service）

**文件**：`packages/agent-service/src/backends/ws-event-router.ts`

- 确认 `permission_request` 在事件类型联合中已定义（现有代码第 27 行似乎包含）

### 涉及文件总览

| 文件 | 操作 | 内容 |
|------|------|------|
| `packages/agent-service/src/backends/pi-tools/delete-page-tool.ts` | 新建 | deletePage 工具定义 |
| `packages/agent-service/src/backends/pi-tools/index.ts` | 修改 | 注册新工具 |
| `packages/agent-service/src/backends/pi-agent.ts` | 修改 | beforeToolCall 中触发 permission_request |
| `packages/author-site/src/lib/agent/prompts/system-prompt.md` | 修改 | 更新提示词 |

### 安全措施

- 删除操作必须携带有效 sessionId，后端 API 会做完整的 7 步认证链校验（JWT → session 所有权 → 未过期）
- 仅在 `beforeToolCall` 阶段触发确认，用户取消则工具不执行
- 工具内部仅调用已验证的 API，不走文件系统直接操作
- 不放开 bash 白名单中的 `rm`/`rmdir`

### 边界情况

- **删除最后一个页面**：前端已有检查（至少保留一个页面），AI 应同样遵守此规则
- **文件夹级联删除**：调用已有 `deleteWorkspaceDemoPage` 的级联逻辑，与手动删除行为一致
- **session 过期**：API 端会返回认证错误，AI 应给出友好提示
- **页面不存在**：API 端返回 404，AI 应告知用户

## 验收标准

- [ ] 用户在聊天中要求 AI 删除指定页面，AI 能正确调用 `deletePage` 工具
- [ ] 触发删除时，聊天气泡内弹出 PermissionDialog，显示页面名称
- [ ] 用户点击「确认」后，页面被成功删除，AI 回复确认消息
- [ ] 用户点击「取消」后，页面不被删除，AI 回复操作已取消
- [ ] 删除文件夹时，子页面一并被删除（级联删除）
- [ ] 项目只有一个页面时，AI 拒绝删除并给出提示
- [ ] session 失效或页面不存在时，AI 给出合理的错误提示

## 不纳入范围

- 不恢复已删除页面的「撤销删除」能力
- 不新增批量删除多个页面
- 不修改 bash 白名单
