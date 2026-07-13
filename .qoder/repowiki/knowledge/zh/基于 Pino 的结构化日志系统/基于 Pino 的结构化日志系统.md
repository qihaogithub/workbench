---
kind: logging_system
name: 基于 Pino 的结构化日志系统
slug: logging_system
category: logging_system
scope:
    - '**'
---

## 系统概述
Workbench 多包 Monorepo 在后端服务层统一采用 **Pino** 作为结构化日志框架，通过 `pino-pretty` 在开发环境输出彩色可读日志。前端站点（Next.js）未集成专用日志库，主要依赖浏览器控制台与 E2E 测试输出。

## 核心实现
- **agent-service**: 通过 `packages/agent-service/src/utils/logger.ts` 提供全局 logger 单例，支持 `info/warn/error/debug` 四个级别，默认级别由 `LOG_LEVEL` 环境变量控制；Fastify 启动时注入 `pino-pretty` transport 并设置 `colorize: true`、`translateTime: 'SYS:standard'`。
- **screenshot-service**: 直接通过 Fastify 内置 logger 实例（`fastify.log`），同样配置 `pino-pretty` transport，使用 `config.logLevel` 控制级别。
- **CLI (ops-cli)**: 使用 `chalk` + `console.log/console.error` 进行人类可读的终端输出，无结构化日志需求。

## 日志级别约定
| 级别 | 用途 | 示例场景 |
|------|------|----------|
| debug | 调试追踪 | 请求参数、内部状态流转 |
| info | 正常业务事件 | 会话创建、Agent 初始化、健康检查 |
| warn | 可恢复异常 | 权限请求超时、模型获取失败 |
| error | 严重错误 | 后端初始化失败、未捕获异常 |

## 结构化字段规范
所有结构化日志均遵循 `{ key: value, message }` 形式，关键字段包括：
- `toolCallId` / `requestId` — 关联跨调用链的请求标识
- `provider` / `backend` — 标识具体后端来源
- `error` — 通过 `pino.stdSerializers.err` 序列化 Error 对象
- `elapsed` — 耗时指标（如 warmup 完成时间）

## 日志输出位置
- **开发环境**: 标准输出（stdout），经 `pino-pretty` 渲染为彩色文本
- **生产环境**: 容器 stdout/stderr，由 Docker/K8s 收集器采集
- **诊断数据**: `data/editor-diagnostics/*.jsonl`、`data/agent-run-logs/session-*/msg-*.jsonl` 等 JSONL 文件用于离线分析

## 开发者规则
1. 优先使用 `logger.info({ fields }, "message")` 结构化格式，避免纯字符串拼接
2. 错误日志必须包含 `error` 字段并使用 `logger.error({ error }, ...)`
3. 跨进程链路通过 `toolCallId` / `requestId` 字段关联上下文
4. 敏感信息（如 API Key）仅记录长度或脱敏值，禁止明文输出
5. CLI 工具无需引入 pino，直接使用 `chalk` + `console.*` 即可