---
kind: error_handling
name: 多包错误处理体系：领域错误码 + 结构化异常类 + AI 错误归一化
category: error_handling
scope:
    - '**'
source_files:
    - packages/shared/src/contracts.ts
    - packages/shared/src/ai-error-normalizer.ts
    - packages/agent-client/src/types.ts
    - packages/author-site/src/lib/workspace-authority-client.ts
    - packages/screenshot-service/src/utils/errors.ts
---

## 1. 整体方案概述
本仓库采用「共享契约错误码 + 领域 Error 子类 + 运行时归一化」三层模式，覆盖跨包 API、Agent 通信、截图服务与作者站等所有子模块。
- 共享层（@workbench/shared）集中定义 Workspace Authority / Agent 的 ErrorCode 枚举与校验器；
- 各业务包按职责抛出各自的 `Error` 子类，携带 code/status/details 等结构化字段；
- 面向用户的 AI 错误通过 `normalizeAiError` 统一归类为 connection/timeout/auth/quota/busy/cancelled/server/unknown 八类，并输出用户可读消息。

## 2. 核心文件与位置
- 共享契约与错误码
  - `packages/shared/src/contracts.ts` — Workspace Mutation / Authority 的 `WorkspaceAuthorityApiErrorCode`、`isWorkspaceAuthorityApiErrorCode` 校验器、以及资源路径断言抛出的 `WORKSPACE_INVALID_OPERATION`。
  - `packages/shared/src/ai-error-normalizer.ts` — `AiErrorCategory` 分类与 `NormalizedAiError` 结构，提供 `normalizeAiError()`。
- Agent 客户端契约
  - `packages/agent-client/src/types.ts` — `ErrorCode` 联合类型、`AgentError`、`ApiError` 响应体结构。
- 领域错误类（各包自维护）
  - `packages/author-site/src/lib/workspace-authority-client.ts` — `WorkspaceAuthorityClientError(code, message, status)`，封装对 Workspace Authority 的 HTTP 调用失败。
  - `packages/screenshot-service/src/utils/errors.ts` — `ScreenshotError(code, message, cause?)` 及 `getScreenshotErrorCode()` 兜底分类。
  - `packages/preview-contract/src/runtime.ts` — `PreviewRuntimeContractError`。
  - `packages/project-cli/src/workspace-authority-client.ts` — `ProjectWorkspaceAuthorityClientError`。
  - `packages/agent-service/src/services/image-describer.ts` — `ImageDescriptionError`。
  - `packages/agent-service/src/workspace/workspace-mutation-authority.ts` — `WorkspaceMutationAuthorityError`。
  - `packages/author-site/src/components/ai-elements/chat/services/stream-service.ts` — `MissingTransactionalDeleteToolsError`。
  - `packages/author-site/src/lib/client-workspace-flush.ts` — `ClientWorkspaceFlushError`。
  - `packages/author-site/src/lib/runtime-props.ts` — `SchemaConflictError`。
  - `packages/author-site/src/lib/workspace-flush.ts` — `WorkspaceFlushError`。
- CLI 诊断脚本（纯 throw new Error）
  - `OPS/CLI/src/commands/diagnostics.ts` 等命令中直接 `throw new Error(...)` 作为快速失败入口。

## 3. 架构与约定
- 错误码来源分层
  - 协议层：`packages/shared/src/contracts.ts` 中的 `WorkspaceAuthorityApiErrorCode` 列表由 `isWorkspaceAuthorityApiErrorCode` 做白名单校验，避免非法 code 穿透到上层。
  - 客户端层：`WorkspaceAuthorityClientError` 在 `requestAuthorityJson` 中统一把 fetch 失败包装为 `WORKSPACE_AUTHORITY_NOT_READY`，并把远端返回的 `body.error.code` 透传回调用方。
  - 工具层：`ScreenshotError` 配合 `getScreenshotErrorCode` 将未知错误降级为 `SCREENSHOT_ERROR`，保证下游只看到已知码。
  - Agent 层：`agent-client` 的 `ErrorCode` 与 `ApiError.success: false` 结构是前后端统一的错误信封。
- AI 错误归一化策略
  - `normalizeAiError` 从任意 `string | Error | object` 中提取 `code/name/message`，按关键词匹配归类为 8 个 `AiErrorCategory`，并返回固定格式的 `NormalizedAiError`，其中 `userMessage` 已翻译为中文提示，`technicalMessage` 保留原始堆栈信息供日志记录。
- 传播方式
  - 同步路径：各包内使用自定义 `Error` 子类向上抛出，调用方通过 `instanceof` 或检查 `.code` 字段区分分支。
  - 异步/HTTP 路径：Route Handler 与 client wrapper 捕获网络异常后转为领域错误类，再交由 Next.js Route Handler 默认 JSON 错误格式返回。
  - 静默降级：大量 `catch(() => undefined)` / `.catch((err) => {})` 用于清理副作用（如 abort、kill），不阻断主流程。
- 无全局中间件/panic-recover
  - 未发现 Express/Koa 风格的全局 error middleware，也未见 `try { ... } catch (e) { if (e instanceof SomeError) ... }` 之外的 panic/recover 模式；错误以返回值 + 结构化 Error 为主。

## 4. 开发者应遵循的规则
1. **对外暴露的错误必须带 code**：无论是 `WorkspaceAuthorityApiErrorCode`、`ScreenshotErrorCode` 还是 `agent-client` 的 `ErrorCode`，都使用预定义联合类型，禁止手写字符串。
2. **跨进程边界用信封结构**：HTTP/WS 返回统一 `{ success: boolean, data?, error?: { code, message, details? } }`，参考 `ApiSuccess` / `ApiError` 与 `AuthorityEnvelope`。
3. **AI 错误一律走 `normalizeAiError`**：任何来自外部模型服务的异常先归一化，再根据 `category` 决定重试/取消/提示策略。
4. **不要吞掉可恢复错误**：仅对“清理副作用”的场景使用 `.catch(() => undefined)`；业务错误应包装为领域 Error 类继续上抛。
5. **新增错误码需更新共享清单**：修改 `WorkspaceAuthorityApiErrorCode` 或 `WORKSPACE_AUTHORITY_API_ERROR_CODES` 数组时，确保 `isWorkspaceAuthorityApiErrorCode` 仍为 true，否则会被降级为 fallback code。