---
kind: configuration_system
name: Workbench 多源配置系统：环境变量 + JSON Schema + SQLite 动态配置分层
category: configuration_system
scope:
    - '**'
source_files:
    - .env.example
    - packages/author-site/src/lib/runtime-config.ts
    - packages/author-site/src/lib/db-config.ts
    - packages/author-site/src/lib/model-config.ts
    - packages/author-site/src/lib/project-config.ts
    - packages/author-site/src/lib/config-merge.ts
    - packages/author-site/src/lib/runtime-props.ts
    - packages/author-site/src/lib/user-model-config.ts
    - packages/author-site/src/lib/visual-configurator.ts
    - packages/author-site/src/lib/schema-defaults.ts
---

## 1. 体系概览

Workbench 的配置系统围绕「运行时环境 → 平台级动态配置 → 项目/用户级持久化配置 → 前端可视化 Schema」四层展开，通过统一的读取 API 与 Schema 驱动的前端表单完成加载、合并与持久化。

- **运行时层**：Next.js 环境变量（`.env` / `NEXT_PUBLIC_*`）提供服务地址、密钥、路径等不可变参数。
- **平台级动态配置**：SQLite `system_configs` 表存储全局可热更新的配置项（如模型白名单），带内存缓存与 env fallback。
- **项目级配置**：每个 workspace 根目录的 `project.config.schema.json` + `project.config.values.json`，由 JSON Schema 定义字段、默认值与 UI 元信息，values 文件持久化用户修改。
- **用户级配置**：SQLite `user_model_configs` 表存储当前用户的自定义 LLM 后端（含 AES-GCM 加密的 apiKey）。
- **Schema 驱动 UI**：所有可编辑配置均基于 JSON Schema（draft 2020-12），配合 `visual-configurator.ts` 自动生成表单字段与代码变更。

## 2. 核心文件与职责

| 文件 | 职责 |
|---|---|
| `.env.example` | 全平台环境变量清单与注释，按 author-site / agent-service / screenshot-service / viewer-site 分组 |
| `packages/author-site/src/lib/runtime-config.ts` | 统一的环境变量解析器：服务 URL、内部 token、模型过滤 CSV 列表、超时等，区分 NEXT_PUBLIC_ 与服务端专用变量 |
| `packages/author-site/src/lib/db-config.ts` | `system_configs` 表的通用 CRUD 封装，供管理后台动态配置使用 |
| `packages/author-site/src/lib/model-config.ts` | 模型配置聚合层：优先读 DB，失败回退到 env；维护 1 分钟进程内缓存；兼容新旧两种结构（enabledModels/autoEnableRules ↔ allowedPrefixes/blacklist/defaultModelIds/nameFilters） |
| `packages/author-site/src/lib/project-config.ts` | 项目级配置的磁盘读写：`project.config.schema.json` 与 `project.config.values.json` 的路径构造与 I/O |
| `packages/author-site/src/lib/config-merge.ts` | Schema 升级合并算法：保留用户修改值、删除已移除字段、用新 default 填充新增字段、处理 `__order`/`__positions` 等保留键 |
| `packages/author-site/src/lib/runtime-props.ts` | 渲染前合并项目级与页面级 Schema 的 default 值，检测字段冲突并抛出 `SchemaConflictError` |
| `packages/author-site/src/lib/user-model-config.ts` | 用户级 LLM 后端配置：AES-GCM 加密存储 apiKey，支持 read/upsert/delete，返回安全脱敏对象 |
| `packages/author-site/src/lib/visual-configurator.ts` | 可视化配置生成器：从选中 DOM 节点推断文本/图片/颜色候选，自动注入 Props 解构、类型声明与样式绑定，同步更新 Schema |
| `packages/author-site/src/lib/schema-defaults.ts` | 轻量工具：从 JSON Schema properties 中提取 default 值映射 |
| `packages/author-site/src/lib/db/schema.ts` | SQLite 建表 DDL，包含 `system_configs`、`user_model_configs` 等配置相关表 |

## 3. 架构与约定

### 3.1 环境变量命名约定
- 服务端专用：无前缀（如 `AGENT_SERVICE_URL`、`INTERNAL_API_TOKEN`、`ADMIN_SECRET`、`DATA_DIR`）
- 客户端可见：`NEXT_PUBLIC_` 前缀（如 `NEXT_PUBLIC_AGENT_SERVICE_URL`、`NEXT_PUBLIC_ALLOWED_MODEL_PREFIXES`）
- 多值字段统一采用逗号分隔字符串，由 `parseCsvEnv` 解析为数组
- 布尔开关使用字符串 `"true"` / `"false"` 比较

### 3.2 平台级动态配置（system_configs）
- 每条记录以唯一 `id` 标识（如 `model_config`），`config_json` 存任意 JSON
- 读取流程：进程内缓存（60s TTL）→ SQLite → env fallback
- 写入走 `ON CONFLICT(id) DO UPDATE` 幂等插入
- 管理后台通过 `/api/admin/model-config` 暴露 REST 接口

### 3.3 项目级配置（workspace 根）
- Schema 文件：`project.config.schema.json`，遵循 JSON Schema draft 2020-12，支持 `$demo.orderable`、`$demo.positionable` 等扩展元信息
- Values 文件：`project.config.values.json`，仅保存用户修改后的值
- 存在性判定：Schema 文件不存在即表示无项目级配置，不在 `project.json` 中额外标记
- 合并策略：Schema 升级时调用 `mergeConfigWithUserValues`，对比旧/新 default 判断是否为用户修改

### 3.4 用户级配置（user_model_configs）
- 每条记录对应一个 `user_id`，存储单个自定义 LLM Provider 配置
- apiKey 使用 AES-256-GCM 加密，密钥派生自 `MODEL_CONFIG_ENCRYPTION_KEY` → `JWT_SECRET` → 硬编码兜底
- 对外只暴露脱敏对象（`apiKey: ""` + `hasApiKey: boolean`）

### 3.5 Schema 驱动的可视化配置
- 通过 `buildVisualConfigCandidates` 从选中节点推断可配置项（文本、图片、颜色）
- `applyVisualConfiguration` 同时产出三样东西：修改后的源码、更新后的 Schema、配置 patch
- 字段 key 自动生成（中文转驼峰 + 拼音回退），禁止以 `__` 开头，避免与保留键冲突

## 4. 开发者应遵循的规则

1. **新增环境变量**：在 `.env.example` 中添加条目与注释，区分 `NEXT_PUBLIC_` 与服务端专用，必要时在 `runtime-config.ts` 增加解析函数。
2. **新增平台级动态配置**：在 `db-config.ts` 中使用 `initDefaultConfig` 初始化默认值，在 `model-config.ts` 风格中实现读取/缓存/fallback 逻辑。
3. **新增项目级配置字段**：在 Schema 的 `properties` 中声明 `default`，升级时依赖 `mergeConfigWithUserValues` 自动迁移用户值。
4. **避免字段冲突**：项目级与页面级 Schema 不得出现同名字段（除 `__order`/`__orderH`/`__positions`），否则运行时抛 `SchemaConflictError`。
5. **敏感信息不落地明文**：用户配置中的 apiKey 必须通过 `user-model-config.ts` 的加解密接口存取，禁止直接写库。
6. **Schema 元信息规范**：使用 `$demo.orderable`、`$demo.positionable`、`ui:options.category` 等约定控制表单布局与分类。
7. **环境变量解析集中化**：不要在各处散落 `process.env.X`，统一通过 `runtime-config.ts` 提供的 getter 访问，保证默认值与 trim 行为一致。
