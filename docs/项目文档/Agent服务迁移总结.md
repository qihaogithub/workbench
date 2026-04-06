# Agent 服务层迁移总结

> 日期：2026-04-06
> 状态：✅ 已完成

---

## 一、迁移概述

成功将 Agent 相关逻辑从 Next.js 应用中剥离，接入独立 agent 服务层。现在 Web 前端通过 `@opencode-workbench/agent-client` SDK 与独立的 Agent 服务通信。

---

## 二、架构变更

### 2.1 迁移前

```
┌─────────────────────────────────────────┐
│          Next.js Web 应用                 │
│  ┌───────────────────────────────────┐  │
│  │  API Routes                       │  │
│  │  • /api/ai/chat                   │  │
│  │  • /api/sessions                  │  │
│  │                                   │  │
│  │  直接调用 OpenCode Server         │  │
│  │  • opencode-client.ts             │  │
│  │  • session-manager.ts             │  │
│  │  • session-guard.ts               │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
          ↓ 直接调用
┌─────────────────────────────────────────┐
│        OpenCode Server (4096)            │
└─────────────────────────────────────────┘
```

### 2.2 迁移后

```
┌─────────────────────────────────────────┐
│          Next.js Web 应用                 │
│  ┌───────────────────────────────────┐  │
│  │  API Routes (代理层)               │  │
│  │  • /api/ai/chat                   │  │
│  │  • /api/sessions                  │  │
│  │                                   │  │
│  │  使用 Agent Client SDK            │  │
│  │  • agent-client.ts (封装)          │  │
│  └──────────┬────────────────────────┘  │
└─────────────┼───────────────────────────┘
              ↓ HTTP/WebSocket
┌─────────────────────────────────────────┐
│       Agent Service (3001)               │
│  ┌───────────────────────────────────┐  │
│  │  • AgentManager                   │  │
│  │  • AgentFactory                   │  │
│  │  • Backends (OpenCode/Claude/...) │  │
│  │  • Session Guard                  │  │
│  └───────────────────────────────────┘  │
└─────────────┬───────────────────────────┘
              ↓ 调用
┌─────────────────────────────────────────┐
│        OpenCode Server (4096)            │
└─────────────────────────────────────────┘
```

---

## 三、文件变更清单

### 3.1 新增文件

| 文件 | 说明 |
|:-----|:-----|
| `packages/web/src/lib/agent-client.ts` | Agent 服务客户端封装 |

### 3.2 修改文件

| 文件 | 变更内容 |
|:-----|:---------|
| `packages/web/package.json` | 添加 `@opencode-workbench/agent-client` 依赖 |
| `packages/web/.env.example` | 更新环境变量配置，移除 OPENCODE_SERVER_URL |
| `packages/web/src/app/api/sessions/route.ts` | GET 方法改用 agentClient.listSessions() |
| `packages/web/src/app/api/sessions/[sessionId]/save/route.ts` | 改用 agentClient.destroySession() |
| `packages/web/src/app/api/sessions/cleanup/route.ts` | 改用 agentClient.health() |
| `packages/web/src/app/api/ai/chat/route.ts` | 改用 agentClient.sendMessage() |
| `packages/web/src/lib/session-manager.ts` | 移除 OpenCode 相关逻辑 |
| `packages/shared/src/index.ts` | 添加 AGENT_SERVICE_ERROR 错误码 |
| `packages/shared/src/types.ts` | 添加 AGENT_SERVICE_ERROR 错误码 |

### 3.3 删除文件

| 文件 | 原因 |
|:-----|:-----|
| `packages/web/src/lib/opencode-client.ts` | 已由 agent-client 包替代 |
| `packages/web/src/lib/session-guard.ts` | 文件校验逻辑已移至 agent-service |

---

## 四、API 路由变更

### 4.1 `/api/sessions`

| 方法 | 迁移前 | 迁移后 |
|:-----|:-------|:-------|
| POST | 创建本地 Session | 保持不变（本地 Session 创建） |
| GET | 返回 Demo 列表 | 调用 Agent 服务获取 Session 列表 |

### 4.2 `/api/sessions/[sessionId]/save`

| 方法 | 迁移前 | 迁移后 |
|:-----|:-------|:-------|
| POST | 合并 Session 到 Demo | 调用 Agent 服务销毁 Session |

### 4.3 `/api/sessions/cleanup`

| 方法 | 迁移前 | 迁移后 |
|:-----|:-------|:-------|
| POST | 清理过期本地 Session | 调用 Agent 服务健康检查 |

### 4.4 `/api/ai/chat`

| 方法 | 迁移前 | 迁移后 |
|:-----|:-------|:-------|
| POST | 直接调用 OpenCode Server | 通过 Agent Client 发送消息 |

---

## 五、环境变量

### 5.1 新增变量

| 变量 | 说明 | 默认值 |
|:-----|:-----|:-------|
| `AGENT_SERVICE_URL` | Agent 服务地址 | `http://localhost:3001` |
| `AGENT_SERVICE_API_KEY` | Agent 服务 API Key（可选） | - |

### 5.2 移除变量

| 变量 | 原因 |
|:-----|:-----|
| `OPENCODE_SERVER_URL` | 由 Agent 服务管理，Web 端不再直接调用 |

---

## 六、验证结果

### 6.1 类型检查

```bash
✅ pnpm typecheck - 通过
```

### 6.2 Lint 检查

```bash
✅ pnpm lint - 通过（仅有已有的 warning）
```

### 6.3 编译

```bash
✅ 编译成功
```

### 6.4 构建

```bash
✅ pnpm build - 构建成功
```

构建输出：
```
Route (app)                              Size     First Load JS
┌ ○ /                                    26.3 kB         147 kB
├ ○ /_not-found                          888 B          85.4 kB
├ λ /api/ai/chat                         0 B                0 B
├ λ /api/sessions                        0 B                0 B
└ ...
```

### 6.5 修复的问题

**问题**: `localStorage is not defined`

**原因**: `theme-provider.tsx` 在 `useState` 初始化时直接访问 `localStorage`，在 SSR 时导致错误

**解决方案**: 添加 `typeof window !== 'undefined'` 检查，确保仅在客户端访问 `localStorage`

**文件**: `packages/web/src/components/providers/theme-provider.tsx`

---

## 七、后续工作

### 7.1 必需

1. **启动 Agent 服务**：确保 `packages/agent-service` 已启动并运行
2. **配置环境变量**：设置正确的 `AGENT_SERVICE_URL`

### 7.2 可选优化

1. **WebSocket 流式支持**：在前端组件中使用 `AgentStream` 实现实时响应
2. **错误重试机制**：利用 agent-client 的自动重连功能
3. **Session 管理 UI**：展示 Agent 服务返回的 Session 状态和文件变更

### 7.3 已知问题

无（所有问题已修复）

---

## 八、架构优势

### 8.1 解耦

- Web 前端不再直接依赖 OpenCode Server
- Agent 服务可独立部署和扩展

### 8.2 多后端支持

- Agent 服务支持多种 AI 后端（OpenCode、Claude、Codex、Gemini）
- 前端无需关心后端实现细节

### 8.3 可扩展性

- Agent 服务可独立扩缩容
- 支持 WebSocket 实时推送
- 内置 Session 管理和文件校验

### 8.4 易维护

- 清晰的职责分离
- 统一的错误处理
- 完善的类型定义

---

## 九、参考文档

- [独立 Agent 服务层 - 架构设计](../../docs/项目文档/独立Agent服务层/01-架构设计.md)
- [独立 Agent 服务层 - 接口规范](../../docs/项目文档/独立Agent服务层/02-接口规范.md)
- [独立 Agent 服务层 - 核心模块设计](../../docs/项目文档/独立Agent服务层/03-核心模块设计.md)
