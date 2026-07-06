# 本机 OrbStack Docker 回归修复归档

## 结论

已完成 2026-07-06 本机 OrbStack Docker 回归测试发现的 AI、浏览端、发布资源与交互状态问题。

本次修复后的当前事实：

- 创作端与浏览端 AI 统一使用共享错误归一化能力，连接失败、超时、鉴权/配额、服务端异常、取消和未知错误都会转成面向普通用户的中文提示，技术细节保留给日志和诊断。
- 创作端 AI 模型选择按编辑上下文持久化，组件重挂载、切换 tab 或预览视图后继续使用用户选择的模型。
- 创作端 AI 发送时会携带最近对话历史，流式完成、错误和连接断开分支都会恢复发送状态。
- 浏览端只读 AI 支持模型选择、同一抽屉内对话历史、图片发送和统一错误提示；模型选择会传给 agent-service。
- 发布流程会扫描 HTML/CSS/配置中的外部图片 URL，经过 SSRF 防护、大小限制、content-type 校验和去重后下载到发布目录，并把发布产物引用改写为本项目服务路径；失败时阻断发布并返回可理解错误。

## 影响范围

- 共享包：`@workbench/shared` 新增 AI 错误归一化入口。
- 创作端：AI 对话 hook、模型选择持久化、发布资源扫描与本地化、发布错误响应。
- 浏览端：AI 抽屉、agent-service 调用客户端、模型目录加载和图片附件。
- agent-service：浏览端 AI 路由支持模型切换、图片附件和统一错误归一化。
- 项目文档：已同步更新创作端 AI、使用端 AI、错误处理和发布资源本地化相关需求、技术文档及索引。

## 验证

已通过：

- `corepack pnpm --filter @workbench/author-site test -- --testPathPatterns='ai-error-normalizer.test.ts|image-scanner.test.ts|image-processor.test.ts|use-chat-models.test.tsx|use-chat-stream-auto-repair.test.tsx'`
- `corepack pnpm --filter @workbench/author-site typecheck`
- `corepack pnpm --filter @workbench/viewer-site typecheck`
- `corepack pnpm --filter @workbench/agent-service typecheck`
- `corepack pnpm --filter @workbench/agent-service test -- tests/unit/viewer-ai-context.test.ts tests/unit/model-catalog-service.test.ts`
- `corepack pnpm check:author`
- `corepack pnpm check:viewer`
- `corepack pnpm check:agent`
- `corepack pnpm check:screenshot`
- `corepack pnpm check:docker-build`
- `corepack pnpm docker:orbstack:verify`
- `scripts/docker-orbstack-up.sh --no-build`

Docker/OrbStack 当前状态：

- `docker compose ps` 显示 `agent-service`、`author-site`、`viewer-site` 均已运行；`agent-service` 与 `author-site` 为 healthy。
- `scripts/docker-orbstack-up.sh --no-build` 复用当前镜像启动成功，并通过 author-site HTTP 200、agent-service status=ok、viewer-site HTTP 200 验证。

## 注意事项

- `corepack pnpm check:author` 第一次运行时 `home-page.test.tsx` 出现超时；单独重跑该测试通过，随后完整 `check:author` 重跑通过。
- `corepack pnpm docker:orbstack` 在一次带 `--build` 的服务启动过程中返回 130，但容器已被替换并启动；随后 `docker:orbstack:verify` 和 `scripts/docker-orbstack-up.sh --no-build` 均通过。独立的 `check:docker-build` 已完整通过。
- Docker build 仍输出既有 Next/jose Edge Runtime、React Hook、图片元素等 lint warning；本次未改动这些既有警告。

## 项目文档索引

- [创作端 AI 对话](../../项目文档/创作端/05-AI对话/INDEX.md)
- [使用端 AI 问答](../../项目文档/使用端/04-AI问答/INDEX.md)
- [创作端错误处理](../../项目文档/创作端/06-基础设施/技术/02_错误处理.md)
- [发布资源本地化](../../项目文档/创作端/03-项目管理/技术/12_发布资源本地化.md)
