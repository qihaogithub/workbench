---
kind: dependency_management
name: pnpm Workspace + Turbo 多包依赖管理
category: dependency_management
scope:
    - '**'
source_files:
    - pnpm-workspace.yaml
    - turbo.json
    - .npmrc
    - package.json
    - packages/shared/package.json
    - packages/author-site/package.json
    - packages/agent-service/package.json
---

## 系统概览

Workbench 采用 **pnpm workspace + Turbo** 作为多包依赖管理与构建编排的核心方案，通过 `pnpm-workspace.yaml` 声明子包、`turbo.json` 定义任务缓存与依赖图，配合根级 `package.json` 的脚本聚合，实现跨包的依赖解析、版本统一与增量构建。

## 关键文件与职责

- `pnpm-workspace.yaml`：声明工作区成员（`packages/*`、`OPS/CLI`），并通过 `allowBuilds` 白名单允许原生模块编译，通过顶层 `overrides` 强制统一第三方包版本。
- `turbo.json`：定义 `build`、`dev`、`lint`、`clean` 等任务的执行顺序与缓存策略，其中 `build` 依赖上游包的 `^build`，确保依赖链按拓扑顺序构建。
- 根 `package.json`：集中声明 Node 引擎要求（`>=18.0.0`）、pnpm 版本（`8.15.0`）以及跨包脚本入口（如 `check:all`、`dev:services`）。
- `.npmrc`：启用 `shamefully-hoist=true`，将依赖提升到根 `node_modules`，兼容部分需要 hoist 行为的工具链。
- 各子包 `packages/*/package.json`：以 `workspace:*` 引用同仓库内其他包，形成显式的内部依赖图；对外部依赖使用精确或范围版本声明。

## 架构与约定

1. **内部包依赖**：所有 `@workbench/*` 包之间通过 `workspace:*` 协议引用，避免硬编码版本号，保证类型与运行时一致性。
2. **外部依赖版本治理**：
   - 根级 `pnpm overrides` 强制统一易冲突包（如 `@radix-ui/react-compose-refs` 固定为 `1.0.0`）。
   - 共享 UI 库（React、Tailwind、Radix UI、Lucide 等）在各包中保持相同版本区间，减少重复安装。
3. **原生模块白名单**：`pnpm-workspace.yaml` 的 `allowBuilds` 显式放行 bcrypt、better-sqlite3、esbuild 等含 C++ 扩展的包，避免 pnpm 默认拒绝编译。
4. **构建编排**：Turbo 负责跨包任务调度，`build` 任务依赖上游 `^build`，`dev` 任务禁用缓存并标记为 persistent，适配热重载场景。
5. **脚本聚合**：根 `package.json` 通过 `corepack pnpm --filter <pkg>` 调用子包脚本，提供 `dev:services`、`check:all` 等一键命令，屏蔽子包差异。

## 开发者应遵循的规则

- **新增内部包**：在 `pnpm-workspace.yaml` 的 `packages` 列表中注册，并在其 `package.json` 中使用 `workspace:*` 引用其他内部包。
- **升级共享依赖**：优先在根 `package.json` 或 `pnpm overrides` 中统一版本，避免各包各自维护导致分裂。
- **引入原生模块**：如需添加含 native addon 的依赖，必须在 `pnpm-workspace.yaml` 的 `allowBuilds` 中添加对应包名。
- **编写跨包脚本**：使用 `corepack pnpm --filter <pkg>` 而非直接 `cd packages/<pkg>`，确保在任意目录下可执行。
- **提交锁文件**：始终提交 `pnpm-lock.yaml`，禁止手动修改，以保证 CI 与本地环境一致。
- **引擎约束**：新增包需满足根 `engines.node >= 18.0.0` 的要求，必要时在子包 `package.json` 中再次声明。

## 补充说明

- 未使用私有 npm registry 或 GOPRIVATE 等机制，所有依赖均来自公共 npm 源。
- 未使用 vendoring 策略，依赖通过 pnpm store 缓存，符合现代 monorepo 实践。
- Docker 镜像构建阶段复用已安装的 node_modules，不重新拉取依赖，提升构建速度。