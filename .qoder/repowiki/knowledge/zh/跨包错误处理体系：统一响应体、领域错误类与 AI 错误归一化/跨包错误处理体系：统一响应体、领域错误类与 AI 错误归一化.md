---
kind: error_handling
name: 跨包错误处理体系：统一响应体、领域错误类与 AI 错误归一化
slug: error_handling
category: error_handling
scope:
    - '**'
---

## 1. 整体方案概述

Workbench 在多包 monorepo 中采用「统一 API 响应体 + 领域错误类 + 客户端错误归一化」三层策略，贯穿 author-site（Next.js Route Handler）、agent-service（HTTP/WS 服务）、screenshot-service（Fastify 服务）以及共享类型库。核心目标是让调用方通过 `success` 字段区分成功/失败，再通过 `error.code` 做业务分支，同时为 AI 外部错误提供面向用户的中文提示。

## 2. 关键文件与位置

- 共享 API 契约与全局错误码
  - `packages/shared/src/types.ts` — 定义 `ApiSuccessResponse<T>` / `ApiErrorResponse` / `ApiResponse<T>` 联合类型，以及全局 `ErrorCode` 字面量 union 和 `ERROR_MESSAGES` 映射表。
- Agent 客户端/服务端错误模型
  - `packages/agent-client/src/types.ts` — 定义 `AgentError`、`ErrorCode`（如 `SESSION_NOT_FOUND`、`MESSAGE_SEND_ERROR` 等）以及 `ApiSuccess` / `ApiError` 联合类型，作为 agent-client 与 agent-service 之间的错误契约。
- AI 错误归一化器
  - `packages/shared/src/ai-error-normalizer.ts` — 将任意来源的 AI 错误（字符串、Error、嵌套 `{ error: { message } }`）归类为 `connection/timeout/auth/quota/busy/cancelled/server/unknown` 并生成 `userMessage`。
- Screenshot 服务专用错误类
  - `packages/screenshot-service/src/utils/errors.ts` — 定义 `ScreenshotErrorCode` union、`ScreenshotError extends Error` 以及 `getScreenshotErrorCode` 推断函数。
- Agent 服务领域错误类
  - `packages/agent-service/src/services/image-describer.ts` — `ImageDescriptionError extends Error`，携带 `code`。
  - `packages/agent-service/src/workspace/workspace-mutation-authority.ts` — `WorkspaceMutationAuthorityError extends Error`，携带 `code` 与可选 `details`。

## 3. 架构与约定

### 3.1 统一响应体结构

所有 HTTP 接口（author-site Route Handler、agent-client SDK、screenshot-service）均返回如下联合类型之一：

```ts
// shared
type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
interface ApiSuccessResponse<T> { success: true; data: T; }
interface ApiErrorResponse { success: false; error: { code: string; message: string; details?: unknown }; }

// agent-client
type ApiResponse<T> = ApiSuccess<T> | ApiError;
interface ApiSuccess<T> { success: true; data: T; }
interface ApiError { success: false; error: { code: ErrorCode; message: string; details?: unknown }; }
```

- 成功路径：`response.success === true`，读取 `data`。
- 失败路径：`response.success === false`，读取 `error.code` 与 `error.message`；部分接口还附带 `error.details`。

### 3.2 错误码分层

| 层级 | 定义位置 | 示例 |
|------|----------|------|
| 全局业务错误码 | `packages/shared/src/types.ts` 中的 `ErrorCode` | `DEMO_NOT_FOUND`、`UNAUTHORIZED`、`INTERNAL_ERROR`、`WORKSPACE_STALE` |
| Agent 客户端/服务端错误码 | `packages/agent-client/src/types.ts` 中的 `ErrorCode` | `SESSION_NOT_FOUND`、`MESSAGE_SEND_ERROR`、`BACKEND_UNAVAILABLE` |
| 截图服务内部错误码 | `packages/screenshot-service/src/utils/errors.ts` 中的 `ScreenshotErrorCode` | `COMPILE_ERROR`、`RENDER_TIMEOUT`、`EMPTY_RENDER` |
| 领域异常类 | `ImageDescriptionError`、`WorkspaceMutationAuthorityError`、`ScreenshotError` | 继承 `Error`，额外携带 `code` 与可选 `details` |

各层错误码互不覆盖，由各自服务在抛出或构造响应时选用。

### 3.3 错误传播链路

1. **底层抛出**：领域方法直接 `throw new XxxError(code, message)`（如 `WorkspaceMutationAuthorityError`、`ImageDescriptionError`、`ScreenshotError`）。
2. **服务层捕获并标准化**：Route Handler / Fastify 路由捕获异常，将其转换为 `{ success: false, error: { code, message } }` 响应体。
3. **客户端消费**：调用方根据 `error.code` 做分支逻辑（如 CLI 命令打印“错误代码”），或通过 `normalizeAiError` 将 AI 错误转为用户可读消息。

### 3.4 AI 错误归一化

`normalizeAiError(error, options)` 从任意来源提取 `code` 与 `message`，按关键词匹配分类到 `connection/timeout/auth/quota/busy/cancelled/server/unknown`，并返回固定结构的 `NormalizedAiError`，其中 `userMessage` 是面向最终用户的中文提示，`technicalMessage` 保留原始技术信息用于日志。

## 4. 开发者应遵循的规则

1. **对外 API 一律使用 `ApiResponse<T>` 联合类型**，禁止直接抛原生 `Error` 给客户端。
2. **错误码使用字面量 union**：优先复用 `shared` 中的 `ErrorCode`；仅在服务内部新增 `ScreenshotErrorCode` 这类细粒度码。
3. **领域异常必须带 `code`**：自定义 `extends Error` 的类需显式设置 `code`，便于上层统一转换。
4. **AI 相关错误走 `normalizeAiError`**：在 author-site 的 `/api/ai/chat/route.ts` 等入口处，先归一化再转发，保证用户看到一致的中文提示。
5. **不要混用 `throw new Error(...)` 与结构化错误**：对可恢复的业务错误使用领域错误类；仅对不可预期的编程错误才抛原生 `Error`。
6. **CLI 与测试依赖 `error.code` 做断言**：新增错误码后同步更新 `OPS/CLI` 与对应 `.test.ts` 中的期望值。
