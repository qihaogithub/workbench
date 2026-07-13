---
kind: dependency_management
name: pnpm Monorepo 依赖管理与版本锁定体系
category: dependency_management
scope:
    - '**'
source_files:
    - package.json
    - pnpm-workspace.yaml
    - pnpm-lock.yaml
    - turbo.json
    - packages/shared/package.json
    - packages/author-site/package.json
    - packages/agent-service/package.json
---

## 系统概览

本仓库采用 pnpm workspace + Turbo 作为多包依赖管理与构建编排的核心方案，通过顶层 package.json、pnpm-workspace.yaml、pnpm-lock.yaml 与 turbo.json 形成完整的依赖声明、解析、锁定与增量构建闭环。

### 1. 使用的工具与框架
- 包管理器: pnpm（版本由根 packageManager 字段锁定为 8.15.0），配合 Corepack 在团队内统一安装
- 工作区: pnpm-workspace.yaml 声明 packages/* 与 OPS/CLI 两个目录下的子包
- 构建编排: Turbo (turbo.json) 负责跨包的 task 缓存与并行执行
- 依赖锁定: 根级 pnpm-lock.yaml 提供全仓库一致的依赖树快照
- 私有包注册: 未发现 .npmrc 或私有 registry 配置，所有依赖均从 npm 公共源拉取

### 2. 关键文件与职责
- package.json: 根脚本入口，定义 dev/build/test/lint 等命令，使用 --filter @workbench/* 精确调度子包任务；声明全局 overrides 与 engines
- pnpm-workspace.yaml: 声明工作区包集合，并通过 allowBuilds 白名单控制原生模块编译权限
- pnpm-lock.yaml: 全仓库依赖树锁定文件，保证 CI/CD 与本地环境一致
- turbo.json: 定义 build/dev/lint/clean 任务的依赖关系与输出缓存规则
- packages/*/package.json: 各子包独立声明依赖，内部包之间通过 workspace:* 引用

### 3. 架构与约定
#### 3.1 包命名与版本策略
- 所有子包统一以 @workbench/ scope 命名（如 @workbench/shared、@workbench/author-site）
- 子包间依赖一律使用 workspace:* 协议，确保开发时直接链接源码而非发布版本
- 第三方依赖使用语义化版本范围（如 ^6.4.2、18.3.1），由 pnpm 自动解析到具体版本并写入 lockfile

#### 3.2 依赖分层与共享契约
- @workbench/shared、@workbench/preview-contract、@workbench/sketch-core 等作为基础层被上层应用引用
- 应用层（author-site、agent-service、viewer-site）仅依赖其需要的子包，避免循环依赖
- 通过 TypeScript exports 字段与类型导出实现 API 契约约束

#### 3.3 原生模块与构建权限
- pnpm-workspace.yaml 的 allowBuilds 显式允许 bcrypt、better-sqlite3、esbuild、protobufjs 等需要编译的原生包在工作区内构建
- 其他未列入白名单的包默认禁止构建，防止意外引入 C++ 扩展导致环境问题

#### 3.4 版本覆盖与冲突解决
- 根 package.json 的 pnpm.overrides 将 @radix-ui/react-compose-refs 强制固定为 1.0.0，解决 Radix UI 生态中的版本冲突
- 根级 engines.node >= 18.0.0 约束运行环境

#### 3.5 构建与部署集成
- Docker 镜像构建基于 pnpm workspace，每个服务在 docker/<service>/Dockerfile 中独立定义多阶段构建
- scripts/docker-build-check.sh 等脚本用于验证容器化构建流程
- 未发现 vendoring 或私有 npm registry 配置，依赖全部来自 npm 公共源

### 4. 开发者应遵循的规则
1. 新增子包: 在 packages/ 下创建新目录并在其 package.json 中使用 @workbench/xxx 命名，内部依赖统一使用 workspace:*
2. 添加第三方依赖: 仅在具体子包的 package.json 中添加，不要修改根 devDependencies（除非是全局工具）
3. 原生模块: 如需引入需要编译的包，必须在 pnpm-workspace.yaml 的 allowBuilds 中显式声明
4. 版本冲突: 优先尝试在子包中调整版本范围，若需全局覆盖则修改根 pnpm.overrides
5. 锁文件同步: 提交代码时必须包含更新后的 pnpm-lock.yaml，确保团队与环境一致性
6. 构建任务: 使用根脚本 pnpm --filter <包名> <task> 调用子包任务，或直接使用已定义的 check:*、dev:* 等快捷命令
7. Turbo 缓存: 自定义 task 时参考 turbo.json 中已有的 dependsOn 与 outputs 模式，确保增量构建正确性