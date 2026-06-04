# AI 删除页面能力方案

## 背景

创作端的 AI 助手目前**无法删除页面**。系统提示词明确要求 AI「提示用户在界面中执行删除操作（当前工具不支持删除目录）」。用户手动删除页面的前端 UI 和后端 API 均已完备，但 AI 侧缺少调用入口。

## 目标

授予 AI 删除页面的能力，操作前必须通过流式确认弹窗获得用户确认。

## 现状分析

### 已有能力

| 组件 | 状态 | 说明 |
|------|------|------|
| 后端删除 API | ✅ 已就绪 | `DELETE /api/projects/[projectId]/demos/[demoId]`，含完整认证链 |
| 前端 PermissionDialog | ✅ 已就绪 | 流式确认弹窗组件，位于 `components/ai-elements/permission-dialog.tsx` |
| 前端 StreamService | ✅ 已就绪 | 已监听 `permission_request` 事件，已实现 `sendPermissionResponse()` |
| 前端 useChatStream | ✅ 已就绪 | 已管理 `pendingPermissionRequest` 状态，已集成 PermissionDialog |
| 项目 API 客户端 | ✅ 已就绪 | `ProjectApiClient.deleteDemoPage()` 方法 |
| ServerMessage 类型 | ✅ 已就绪 | `ws-event-router.ts` 中 `permissionRequest` 字段已定义 |
| 前端删除逻辑 | ✅ 已就绪 | 含 `confirm()` 确认、sessionId 校验、级联删除 |

### 缺失部分

| 组件 | 状态 | 说明 |
|------|------|------|
| 专用 `deletePage` 工具 | ❌ 不存在 | pi-tools 中无删除工具；bash 白名单不含 `rm` |
| `AgentEvent` 类型 | ❌ 缺少 | `types.ts` 的 `AgentEvent` 联合类型不含 `permission_request` |
| `EventMap` 类型 | ❌ 缺少 | `agent.ts` 的 `EventMap` 不含 `permission_request` |
| `AGENT_EVENT_TYPES` | ❌ 缺少 | `ws-event-router.ts` 的事件数组不含 `permission_request` |
| `handleEvent` 路由 | ❌ 缺少 | `ws-event-router.ts` 的 switch 不处理 `permission_request` |
| `ClientMessage` 类型 | ❌ 缺少 | `websocket.ts` 不含 `permission_response` 消息类型 |
| WebSocket 处理 | ❌ 缺少 | `websocket.ts` 不处理 `permission_response` 消息 |
| `beforeToolCall` 权限流 | ❌ 缺少 | `pi-agent.ts` 仅做路径校验，无交互式权限确认 |
| `BackendAgent` 转发 | ❌ 缺少 | `backend-agent.ts` 无 `resolvePermission` 方法 |

## 方案设计

### 整体思路

新增 `deletePage` 专用工具 + 补齐 `permission_request` / `permission_response` 全链路。

```
用户: "帮我删除首页"
   → AI 解析意图，调用 deletePage 工具
     → pi-agent beforeToolCall 钩子：检测到 deletePage → 发出 permission_request 事件
       → BackendAgent 转发 → WebSocketEventRouter 推送到前端 → PermissionDialog 弹窗
         → 用户点击确认 → 前端 sendPermissionResponse → WebSocket 发回 permission_response
           → websocket.ts 接收 → BackendAgent.resolvePermission → PiAgentBackend 解除等待
             → beforeToolCall 返回 undefined（放行）→ deletePage 工具执行 → 调用 DELETE API
               → 返回结果给 AI → AI 告知用户完成
```

### 改动清单

#### 1. 新增 `PermissionRequestEvent` 类型（agent-service）

**文件**：`packages/agent-service/src/core/types.ts`

- 新增 `PermissionRequestEvent` 接口
- 添加到 `AgentEvent` 联合类型
- 添加到 `EventType` 联合类型

#### 2. 新增 `EventMap` 条目（agent-service）

**文件**：`packages/agent-service/src/core/agent.ts`

- 在 `EventMap` 接口中添加 `permission_request` 事件

#### 3. 新增 `deletePage` 工具（agent-service）

**文件**：`packages/agent-service/src/backends/pi-tools/delete-page-tool.ts`（新建）

- 工具名：`deletePage`
- 输入参数：
  - `pageId`：页面 ID（demo 目录名）
  - `pageName`：页面名称（用于确认弹窗展示）
- 执行逻辑：通过 HTTP 请求 `DELETE /api/projects/{projectId}/demos/{pageId}?sessionId={sessionId}`
- `projectId` 从 `config.demoId` 获取，`sessionId` 从 `config.sessionId` 获取
- author-site URL 通过 `AUTHOR_SITE_URL` 环境变量配置，默认 `http://localhost:3200`

#### 4. 注册工具（agent-service）

**文件**：`packages/agent-service/src/backends/pi-tools/index.ts`

- 在工具数组中导入并添加 `createDeletePageTool`

#### 5. 补齐 `permission_request` 事件触发（agent-service）

**文件**：`packages/agent-service/src/backends/pi-agent.ts`

- 新增 `pendingPermissions` Map，存储 `{ resolve, reject }` 函数
- 在 `beforeToolCall` 钩子中增加判断：当工具名为 `deletePage` 时：
  - 通过 `this.eventCallback` 发出 `permission_request` 事件
  - 创建 Promise 并等待前端返回（60 秒超时）
  - 用户确认 → 返回 `undefined`（放行）；用户取消 → 返回 `{ block: true, reason }`
- 新增 `resolvePermission(toolCallId, approved)` 方法

#### 6. 新增 `BackendAgent.resolvePermission`（agent-service）

**文件**：`packages/agent-service/src/core/backend-agent.ts`

- 新增 `resolvePermission` 方法，转发到 `PiAgentBackend.resolvePermission`

#### 7. 补齐 `ws-event-router.ts` 事件路由（agent-service）

**文件**：`packages/agent-service/src/routes/ws-event-router.ts`

- 在 `AGENT_EVENT_TYPES` 数组中添加 `"permission_request"`
- 在 `handleEvent()` 的 switch 中添加 `permission_request` case

#### 8. 补齐 `websocket.ts` 消息处理（agent-service）

**文件**：`packages/agent-service/src/routes/websocket.ts`

- 在 `ClientMessage.type` 中添加 `"permission_response"`
- 新增 `permissionId` 和 `optionId` 字段
- 添加 `permission_response` case 处理：调用 `agent.resolvePermission()`

#### 9. 更新系统提示词（author-site）

**文件**：`packages/author-site/src/lib/agent/prompts/system-prompt.md`

- 修改「删除页面」部分：移除限制说明，添加 `deletePage` 工具使用说明
- 更新「权限确认」部分：明确删除页面需要确认的流程

### 涉及文件总览

| 文件 | 操作 | 内容 |
|------|------|------|
| `packages/agent-service/src/core/types.ts` | 修改 | 新增 PermissionRequestEvent |
| `packages/agent-service/src/core/agent.ts` | 修改 | EventMap 添加 permission_request |
| `packages/agent-service/src/backends/pi-tools/delete-page-tool.ts` | 新建 | deletePage 工具定义 |
| `packages/agent-service/src/backends/pi-tools/index.ts` | 修改 | 注册新工具 |
| `packages/agent-service/src/backends/pi-agent.ts` | 修改 | beforeToolCall 权限流 + resolvePermission |
| `packages/agent-service/src/core/backend-agent.ts` | 修改 | 新增 resolvePermission 方法 |
| `packages/agent-service/src/routes/ws-event-router.ts` | 修改 | 路由 permission_request 事件 |
| `packages/agent-service/src/routes/websocket.ts` | 修改 | 处理 permission_response 消息 |
| `packages/author-site/src/lib/agent/prompts/system-prompt.md` | 修改 | 更新提示词 |

### 安全措施

- 删除操作必须携带有效 sessionId，后端 API 会做完整的认证链校验（JWT → session 所有权 → 未过期）
- 仅在 `beforeToolCall` 阶段触发确认，用户取消则工具不执行
- 工具内部仅调用已验证的 API，不走文件系统直接操作
- 不放开 bash 白名单中的 `rm`/`rmdir`
- 权限等待设 60 秒超时，超时自动拒绝

### 边界情况

- **删除最后一个页面**：API 端已有检查（至少保留一个页面），AI 应告知用户
- **文件夹级联删除**：调用已有 DELETE API 的级联逻辑，与手动删除行为一致
- **session 过期**：API 端会返回认证错误，AI 应给出友好提示
- **页面不存在**：API 端返回 404，AI 应告知用户
- **权限超时**：60 秒无响应自动拒绝，AI 告知用户操作超时

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
