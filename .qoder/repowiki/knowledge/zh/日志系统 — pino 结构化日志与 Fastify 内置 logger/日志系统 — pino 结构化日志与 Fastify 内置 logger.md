---
kind: logging_system
name: 日志系统 — pino 结构化日志与 Fastify 内置 logger
category: logging_system
scope:
    - '**'
source_files:
    - packages/agent-service/src/utils/logger.ts
    - packages/agent-service/src/server.ts
    - packages/screenshot-service/src/server.ts
    - packages/agent-service/package.json
---

## 1. 使用的框架与工具
- **后端服务统一使用 pino**：`agent-service` 和 `screenshot-service` 均基于 Fastify，并通过 pino 输出结构化 JSON 日志。
- **开发/本地环境通过 `pino-pretty` 彩色可读输出**：两个服务的 Fastify 实例都配置了 `transport.target: 'pino-pretty'`，在本地终端打印带颜色、时间戳的易读日志。
- **生产构建时剥离 pretty 传输**：`agent-service` 的 `build:docker` 脚本将 `pino` 和 `pino-pretty` 标记为 external，意味着容器化部署后由运行时（如 Docker stdout）或上层编排处理日志收集。
- **作者站（author-site）未引入独立日志库**：Route Handler 中大量直接使用 `console.log / console.error / console.warn / console.info`，并配合 `[模块前缀]` 字符串做简单分类。
- **CLI 工具（OPS/CLI）使用 `chalk` + `console.log`**：面向运维人员的诊断命令以人类可读文本为主，不追求结构化字段。

## 2. 核心文件与位置
- `packages/agent-service/src/utils/logger.ts`：封装 pino 初始化、全局单例 `getLogger()`、自定义 `Logger` 接口（info/warn/error/debug），并通过 `LOG_LEVEL` 环境变量控制级别。
- `packages/agent-service/src/server.ts`：Fastify 启动入口，同时注入 pino transport 到 Fastify 实例，并在进程信号处理中使用该 logger。
- `packages/screenshot-service/src/server.ts`：Fastify 启动入口，直接通过 `logger.level` 与 `pino-pretty` transport 配置日志。
- `packages/agent-service/package.json`：声明 `pino` 与 `pino-pretty` 依赖，以及 esbuild docker 构建时将二者 external。
- `packages/author-site/src/app/api/**/*.ts`：Next.js Route Handler 中的 `console.*` 调用点（错误捕获、调试信息）。
- `OPS/CLI/src/commands/*.ts`：CLI 诊断命令中的 `chalk` + `console.log` 输出。

## 3. 架构与约定
- **分层策略**
  - 业务服务层（agent-service、screenshot-service）：全部走 pino，结构化字段 + 标准错误序列化（`err`/`error` → `pino.stdSerializers.err`）。
  - Next.js API 层（author-site）：尚未迁移至 pino，沿用 `console.*` + 模块前缀字符串；未来可考虑在 Route Handler 中接入 Fastify 的 `request.log` 或共享 logger。
  - CLI 工具：保持人类可读文本输出，便于运维人员直接阅读。
- **日志级别**
  - 通过环境变量 `LOG_LEVEL` 控制（默认 `info`），在 agent-service 的 `createLogger` 中读取；screenshot-service 通过 `config.logLevel` 传入 Fastify。
  - 常用级别：`debug`（详细追踪）、`info`（正常业务流程）、`warn`（可恢复异常）、`error`（失败路径）。
- **结构化字段约定**
  - 所有关键事件附带上下文对象作为第一个参数，例如 `{ workspaceAuthorityInstancePolicy }`、`{ elapsed, error }`、`{ workingDir, error }` 等。
  - 错误对象统一使用 `err` 或 `error` 键名，以便 pino 自动序列化为堆栈格式。
- **进程生命周期日志**
  - 启动成功、健康检查、SIGTERM/SIGINT 优雅关闭、浏览器池 warmup 结果等关键节点均有对应日志。
- **日志输出目标**
  - 本地开发：stdout → pino-pretty 彩色格式化。
  - 容器化部署：stdout JSON 行，交由 Docker/K8s 日志采集器（如 filebeat、fluentd）聚合。

## 4. 开发者应遵循的规则
- **在服务代码中一律通过 `getLogger()` 获取 logger 实例**，不要直接 `new pino()`；如需按模块区分命名空间，使用 `createLogger(name)`。
- **优先记录结构化日志**：先传对象字段，再传消息字符串，例如 `logger.info({ userId }, "user login")`。
- **错误必须用 `error` 级别**，并将 Error 对象放入 `err` 或 `error` 字段，确保堆栈被正确序列化。
- **敏感信息脱敏**：不要在日志中输出密码、token、用户隐私数据；必要时对长字符串截断。
- **Next.js Route Handler 暂维持现状**：若需结构化日志，可通过 `request.log` 或引入共享 logger 包逐步迁移。
- **CLI 命令保持人类可读**：使用 `chalk` 着色与 `console.log` 即可，无需引入 pino。
- **通过 `LOG_LEVEL` 控制输出粒度**：本地开发可设为 `debug`，生产环境保持 `info` 或更高。
