---
kind: configuration_system
name: Workbench 多服务配置系统：环境变量 + 数据库动态配置 + 运行时推送
category: configuration_system
scope:
    - '**'
source_files:
    - .env.example
    - .env.docker
    - packages/agent-service/src/utils/config.ts
    - packages/agent-service/src/config/backend-providers.ts
    - packages/agent-service/src/config/session-model-configs.ts
    - packages/author-site/src/lib/runtime-config.ts
    - packages/author-site/src/lib/db-config.ts
    - packages/author-site/src/lib/model-config.ts
---

## 体系概览

本仓库采用「环境变量（启动期）+ SQLite 数据库（运行期）+ 进程间推送（热更新）」三层配置体系，覆盖作者站点、Agent 服务、截图服务与预览站点等多个子进程。核心思路是：

- **启动期**：通过 `.env` / `.env.docker` 等文件注入 `process.env`，由每个服务的配置加载器解析为结构化对象；
- **运行期**：管理后台通过 author-site 的 `system_configs` 表持久化模型白名单、后端供应商等动态配置；
- **热更新**：author-site 将最新配置通过内部 HTTP 接口推送到 agent-service，实现无需重启的动态生效。

## 关键文件与包

- 根级环境模板与容器覆盖：`.env.example`、`.env.docker`
- Agent Service 配置加载与后端供应商管理：
  - `packages/agent-service/src/utils/config.ts` — `loadConfig()` 从 `process.env` 解析 `ServiceConfig`
  - `packages/agent-service/src/config/backend-providers.ts` — `BackendProvidersManager` 单例，支持 `.env PI_AGENT_PROVIDERS` 启动 fallback 与运行时 `setConfig()` 推送
  - `packages/agent-service/src/config/session-model-configs.ts` — 会话级模型配置内存缓存
- Author Site 配置层：
  - `packages/author-site/src/lib/runtime-config.ts` — 统一读取 `NEXT_PUBLIC_*` / `AGENT_SERVICE_URL` / `SCREENSHOT_SERVICE_URL` 等环境变量
  - `packages/author-site/src/lib/db-config.ts` — `system_configs` 表的 CRUD 封装
  - `packages/author-site/src/lib/model-config.ts` — 模型配置读取层，优先读 DB（1 分钟缓存），fallback 到环境变量，并兼容新旧结构字段
- 共享契约类型：`@workbench/shared/contracts` 中的 `BackendProvider`、`BackendProvidersConfig` 等跨进程共享

## 架构与分层约定

### 1. 环境变量命名规范

| 前缀 | 作用域 | 示例 |
|------|--------|------|
| `NEXT_PUBLIC_` | 编译时注入浏览器 | `NEXT_PUBLIC_AGENT_SERVICE_URL` |
| 无前缀 | 仅 Node 服务端 | `AGENT_SERVICE_URL`、`INTERNAL_API_TOKEN` |
| `PI_AGENT_*` | Agent 服务专用 | `PI_AGENT_PROVIDER`、`PI_AGENT_MODEL`、`PI_AGENT_PROVIDERS` |
| `E2E_*` | E2E 测试 | `E2E_BASE_URL`、`E2E_USER` |

- 所有敏感值（JWT_SECRET、ADMIN_SECRET、INTERNAL_API_TOKEN、OSS_*）必须放入 `.env` 或 `.env.docker`，且被 `.gitignore` / `.dockerignore` 排除。
- 开发默认值集中在 `.env.example`，部署覆盖使用 `.env.docker`。

### 2. 配置加载优先级

- **Agent Service 后端供应商**：
  1. 运行时通过 `POST /internal/backend-providers` 接收 author-site 推送（最高优先级）
  2. 启动时从 `process.env.PI_AGENT_PROVIDERS` JSON 解析
  3. 空 providers 列表作为极简场景默认

- **Author Site 模型配置**：
  1. 从 SQLite `system_configs` 表读取（带 1 分钟内存缓存）
  2. 失败或未设置时 fallback 到 `NEXT_PUBLIC_ALLOWED_MODEL_PREFIXES`、`NEXT_PUBLIC_MODEL_NAME_FILTERS` 等环境变量
  3. 新结构 `enabledModels` / `autoEnableRules` 与旧结构 `allowedPrefixes` / `blacklist` 双向兼容转换

### 3. 进程间配置同步

author-site 在写入 `system_configs` 后，主动调用 agent-service 的内部 API 推送最新 `BackendProvidersConfig`，agent-service 的 `BackendProvidersManager.setConfig()` 直接替换内存中的全局单例，已存在的 Agent 会话会感知变更但不会崩溃。

### 4. 数据持久化

- 动态配置存储在 author-site 使用的 SQLite 数据库 `data/users.db` 中，表名 `system_configs`，字段包括 `id`、`config_json`、`updated_at`、`updated_by`。
- 静态服务地址、CORS、端口等通过环境变量注入，不落地磁盘。

## 开发者应遵循的规则

1. **新增环境变量**：在 `.env.example` 中补充注释说明，并在对应服务的配置加载器中提供默认值；生产覆盖统一放在 `.env.docker`。
2. **动态配置**：如需可运行时修改的配置，优先走 `db-config.ts` 的 `readDbConfig` / `writeDbConfig` 通道，并通过 model-config 层的缓存失效机制保证一致性。
3. **跨进程配置**：需要影响其他进程的运行时配置，应在 author-site 写入 DB 后调用对应服务的内部推送接口，避免直接访问数据库。
4. **向后兼容**：对已有配置结构做演进时，必须在 normalize 逻辑中同时支持新旧字段，确保存量实例不受影响。
5. **安全边界**：`NEXT_PUBLIC_` 前缀变量会被打包进浏览器 bundle，严禁存放密钥；敏感值一律使用无前缀环境变量。
