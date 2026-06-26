---
covers:
  - packages/project-cli/src/index.ts
  - packages/project-cli/src/cli.test.ts
  - packages/project-cli/AGENTS.md
  - packages/project-scaffold/src/index.ts
  - packages/project-scaffold/src/scaffold.test.ts
  - packages/project-scaffold/src/project-package.schema.json
  - packages/project-scaffold/AGENTS.md
  - packages/author-site/src/app/api/projects/[projectId]/scaffold/route.ts
  - packages/author-site/src/app/api/projects/[projectId]/scaffold/route.test.ts
  - packages/project-core/src/service.ts
  - packages/project-core/src/types.ts
  - packages/shared/src/workspace.ts
  - package.json
---

# Project Admin CLI 能力层

> 更新日期：2026-06-26

Project Admin CLI 是项目管理模块面向编码代理的本地 shell 入口。它直接调用 `project-core`，让 Agent 通过普通终端命令完成项目、模板、页面、配置、资产、发布、审计和 AI 会话管理。

## 协作边界

能力层分两层：

- `project-core`：统一项目服务层，继续负责文件系统读写、事务、校验、审计、模板健康检查、发布状态和权限判断。
- `project-scaffold`：本地项目包转换层，负责线上项目导出、本地校验、sync-state diff、提交回写和模板本地化工作流。
- `project-cli`：CLI 适配层，负责命令解析、JSON 输出、复杂参数读取、错误码透传和 Agent 友好的下一步提示。

项目语义仍以 [项目管理架构设计](./01_架构设计.md)、[版本管理](./04_版本管理.md)、[项目模板库](./08_项目模板库.md) 为准。CLI 不重新定义业务规则，只把这些规则暴露到 shell。

## 命令能力

CLI 覆盖项目管理能力，包括项目、模板、编辑事务、页面、文件夹、配置、资产、预览、发布、AI 会话、审计和管理员锁定。为了降低迁移成本，CLI 同时提供分组命令和 snake_case 名称；例如 Agent 可以使用 `project list` 这类 shell 风格，也可以使用 `project_list` 这类紧凑命令名。

发布命令有两条路径。配置 `AUTHOR_SITE_URL` 与 `AUTHOR_SITE_AUTH_TOKEN` 时，`publish project` 会调用 author-site 的正式发布 API，由 Web 侧完成页面编译、图片处理、发布目录写入和可选 Cloudflare 同步；未配置时，CLI 退回到 `project-core` 的本地发布状态更新，并在输出中提示这是降级路径。无论走哪条路径，JSON 结果都会返回 `artifactSummary` 和 `accessUrls`：前者描述发布页面数量与可识别的产物入口，后者给出 viewer、数据文件和页面 iframe 的访问地址，避免 Agent 再解析人类提示文本。

本地项目包能力已经进入 `project-scaffold` 并由 CLI 调用。项目包契约由 `project-package.schema.json` 描述；`project pull` 会把线上项目导出为 `opencode.project.json`、页面源码、Schema、资产目录、应用逻辑图和 `.opencode/sync-state.json`；`validate` 校验项目包结构、页面入口、Schema 和应用逻辑图入口文件；`diff` 基于 sync-state 输出创建、修改和删除文件摘要；`submit` 会在一个 `project-core` 事务内同步页面新增、页面删除、文件夹变化、页面代码、页面 Schema、页面元信息、项目级 Schema 和资产增删改，提交成功后生成新版本并刷新本地基线。

页面项会保留 `routeKey`，manifest 通过 `appGraph` 指向 `src/app.graph.json`。应用逻辑图来源于项目工作区，与页面列表一起导出；旧项目缺失图文件时，`project-core` 会根据当前页面生成只包含入口和页面节点的默认图，避免本地工程输入包只留下页面代码而丢失页面流程语义。

默认脚手架会写出自己的 `package.json` 和 `scripts/dev-server.mjs`。`pnpm dev` 由脚手架脚本启动本地预览服务，CLI 不封装 dev server；`pnpm build` 做本地项目包可启动性检查。预览服务读取项目级和页面级 Schema 默认值，按项目级默认值先进入、页面级默认值覆盖的顺序合并，这与 viewer 和发布链路的配置数据合并方向保持一致。本地预览的 `/api/project` 同时返回应用逻辑图，便于 Agent 或人工检查页面流程。

`ow upgrade` 只升级脚手架托管文件，包括 `package.json`、`scripts/dev-server.mjs`、`opencode.project.json` 的 `scaffoldVersion` 和 sync-state 中的版本元数据。它不会重写页面源码、页面 Schema 或资产文件；升级完成后会同步 manifest 的基线哈希，避免脚手架升级本身污染业务 diff。

Web 下载脚手架 zip 也复用同一个转换器。author-site 的项目脚手架下载接口只负责登录校验、调用 `project-scaffold` 生成文件条目和 zip 响应，不在 Web 层重新拼装项目包结构。

模板本地开发通过 `template init` 和 `template submit` 复用同一转换器。`template init` 先从模板创建一个项目，再拉取为本地项目包；`template submit` 先提交本地项目包，再把提交后的项目保存为新的线上模板快照。这样模板工作流仍走项目事务、版本和审计，不直接修改模板内部目录。

`doctor` 和 `commands` 是 CLI 自身的辅助命令。前者返回当前数据目录、操作者、Node 版本和后续建议；后者列出可用命令与别名，方便 Agent 自检。

## JSON 与参数输入

所有命令都支持 `--json`。JSON 输出沿用 `ProjectAdminResult` 结构，成功时包含 `ok` 和 `data`，失败时包含稳定 `error.code`、`error.message` 与可恢复提示。CLI 输出归一化层会为所有失败结果补齐 `nextActions`，业务命令可以提供更具体的建议；没有具体建议时回退到 `ow commands --json` 和 `ow doctor --json`。Agent 只应依赖 JSON 字段，不解析人类可读文本。

复杂参数有三种输入方式：`--input-json` 合并一段 JSON 对象，`--stdin` 从标准输入读取 JSON 对象，字符串参数使用 `@file` 读取文件内容。页面代码、配置 Schema、视觉补丁、排序数组和资产上传都可以通过这些方式传入，避免命令行转义变成主要复杂度。

资产命令额外支持 `--file`。CLI 会读取本地文件并转换为 `project-core` 需要的 base64 数据，业务侧仍由 `project-core` 校验类型、大小、路径和引用更新。

## 审计与事务

CLI 的默认 actor source 是 `project-admin-cli`。通过 CLI 打开的编辑事务使用 `cli_` workspace 前缀，便于后续排查审计记录和临时工作区。

高风险操作仍使用原有两阶段策略：先生成预览计划和 confirm token，再执行删除、回滚或批量影响操作。CLI 不绕过 `project-core` 的权限、锁定、dry-run、校验和审计规则。

## 入口边界

CLI 是 Agent 主入口。新增能力应优先进入 `project-core` 和 `project-cli`，不再新增另一套工具协议。Web 端继续负责普通用户管理、登录态和可视化编辑，CLI 负责编码代理和本地开发流程。

## 验证

CLI 包提供 `typecheck` 和 JSON 契约测试，根目录通过 `pnpm check:project-cli` 统一运行。项目包转换器通过 `pnpm check:project-scaffold` 验证。Web 下载接口通过 author-site route 测试覆盖。涉及 `project-core` 行为变化时，同时运行 `pnpm check:project-core`。
