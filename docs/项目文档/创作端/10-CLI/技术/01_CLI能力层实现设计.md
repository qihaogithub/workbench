---
covers:
  - packages/project-cli/bin/ow.mjs
  - packages/project-cli/scripts/build.mjs
  - packages/project-cli/scripts/run-tests.mjs
  - packages/project-cli/package.json
  - packages/project-cli/src/index.ts
  - packages/project-cli/src/cli.test.ts
  - packages/project-cli/src/cli-all-commands.test.ts
  - packages/project-cli/AGENTS.md
  - packages/project-core/src/service.ts
  - packages/project-core/src/types.ts
  - packages/preview-contract/src/index.ts
  - package.json
---

# CLI 能力层实现设计

> 更新日期：2026-07-02

## 技术定位

`@opencode-workbench/project-cli` 是创作端项目管理能力的命令行适配层。它把 `project-core` 的项目服务能力包装成 shell 命令，并把结果整理成代理可稳定解析的 JSON。

CLI 不复制业务规则。项目、模板、事务、版本、权限、审计和发布状态仍由 `project-core` 处理；CLI 负责把参数变成领域服务调用，把领域服务结果变成终端输出。

页面预览运行契约也不在 CLI 中复制。CLI 通过 `project-core` 调用 `@opencode-workbench/preview-contract`，使用与 author-site 编译入口一致的源码契约和依赖策略。

## 稳定入口与命令注册

CLI 包暴露两个命令名：`ow` 和 `opencode-project-admin`。两者指向同一个稳定入口，用于兼容不同使用习惯。

稳定入口位于 `packages/project-cli/bin/ow.mjs`，它是普通 Node.js 脚本。入口启动后会检查 `packages/project-cli/dist/index.mjs` 是否存在或过期；如果需要更新，就调用 `packages/project-cli/scripts/build.mjs` 用 esbuild 把 TypeScript 源码打包成单个 ESM 文件，再导入打包产物执行 `runCli`。这样日常使用不再依赖 `tsx` 这类源码运行器，也不会在受限 shell 环境中触发源码运行器自己的 IPC 行为。

根目录提供 `pnpm --silent ow ...` 作为统一入口；包内仍保留 `pnpm --filter @opencode-workbench/project-cli dev ...` 给开发者调试源码。面向用户和代理的稳定路径是 `ow`、`opencode-project-admin` 或根目录 `pnpm --silent ow`，不是直接执行 `src/index.ts`。需要机器解析 JSON 时必须使用 `--silent`，避免包管理器输出脚本头。

命令注册集中在 `packages/project-cli/src/index.ts`。每个命令都有名称、说明、别名和处理函数。注册时会自动提供下划线别名，例如 `project list` 同时可以通过 `project_list` 调用，便于代理在不方便处理空格命令时使用。

`commands` 命令会返回机器可读的命令清单。代理不确定可用能力时，应先调用这个命令，而不是猜测命令名称。

## 能力分组

CLI 命令按能力域分组：

| 分组 | 说明 |
|:-----|:-----|
| `admin` | 查看能力、项目锁定和解锁 |
| `doctor` / `commands` | 环境诊断和命令自检 |
| `project` | 项目列表、详情、创建、拉取、更新、复制、封面和删除 |
| `template` | 模板列表、详情、创建、更新、健康检查、推荐、实例化、本地初始化和提交 |
| `edit` | 编辑事务打开、状态、diff、校验、提交、丢弃和续期 |
| `page` / `folder` | 页面、文件夹、排序、删除预览和恢复历史版本 |
| `config` | 项目级 Schema、页面 Schema 校验、合并校验和视觉补丁 |
| `asset` | 资产列表、上传、删除预览、删除执行和替换 |
| `preview` | 编译预检、预览 URL、截图服务状态、控制台日志、运行时错误和健康检查 |
| `publish` | 发布前检查、正式发布、发布状态、回滚和产物摘要 |
| `ai` | AI 会话摘要、运行日志、工作区上下文和在线消息发送 |
| `audit` | 审计列表和审计详情 |

本地项目包相关的 `validate`、`diff`、`upgrade` 和 `submit` 放在顶层命令，便于代理进入脚手架目录后直接执行。

## 页面运行契约校验

CLI 提供两个显式 runtime contract 校验入口：

```bash
ow page validate-runtime <editId> <pageId> --json
ow project validate-runtime <projectId> --json
```

`page validate-runtime` 面向编辑事务内的单页，用于页面写入后立即确认该页是否符合创作端预览运行契约。`project validate-runtime` 面向项目当前版本，用于发布前或历史项目巡检。

`preview compile <editId> [pageId] --json` 不再只是返回静态提示，而是复用同一份 contract 对目标页面返回 pageId 级 issues。CLI 不直接启动 author-site 或截图服务；浏览器渲染、截图缓存和发布产物仍由 author-site/screenshot-service 负责最终验证。

`edit validate` 会全量扫描事务工作区页面，但只把本事务新增或修改过的页面 runtime error 视为 blocking。历史未改页面的 contract 问题降级为 warning，避免一次无关编辑被旧项目债务阻断，同时让代理能看到需要后续治理的页面。

runtime issue 的 JSON 字段包括 `pageId`、`severity`、`stage`、`code`、`message` 和 `instruction`。`severity: "error"` 表示显式 runtime 校验失败；映射到 `edit validate` 时，本次变更页变成 `blocking`，未改历史页变成 `warning`。

HTML/CSS 原型页通过同一套页面命令进入编辑事务。`page create` 支持 `runtimeType: "prototype-html-css"`，并接收 `prototypeHtml`、`prototypeCss` 和 `prototypeMeta`；`page update-prototype` 用于更新原型页内容，不复用 `page update-code`。原型页校验由 `project-core` 执行，只检查静态 HTML/CSS 安全边界，不进入 React 编译和 iframe runtime contract。CLI JSON 会保留 `prototypeGate`，让代理能区分继续修复原型页还是升级为高保真页。

`page switch-runtime` 用于在编辑事务内切换页面运行时类型。命令接收目标 `targetRuntimeType`，并可同时传入目标运行时需要的 `code`、`prototypeHtml`、`prototypeCss`、`prototypeMeta` 和 `schema`。`project-core` 会先按目标运行时校验产物；通过后才更新页面元数据和目标运行时文件，失败时返回 `VALIDATION_BLOCKED` 并保留原页面内容。旧运行时文件不会在切换时删除，用于失败回退、对比或后续 AI 继续转换。

## JSON 输出契约

关键命令支持 `--json`。JSON 输出沿用 `ProjectAdminResult` 风格：成功时返回 `ok: true` 和 `data`；失败时返回 `ok: false`、`error.code`、`error.message` 和 `nextActions`。

CLI 输出层会补齐失败结果的下一步建议。业务命令给出具体建议时优先使用业务建议；没有建议时回退到 `ow commands --json` 和 `ow doctor --json`。这样代理遇到未知失败时仍能继续自检。

人类可读输出只用于人工查看，不能作为代理判断依据。

## 参数输入

CLI 支持多种参数来源：

- 普通命令行参数用于短文本、标识符和布尔开关。
- `--input-json` 用于传入一段结构化对象。
- `--stdin` 用于从标准输入读取结构化对象。
- `@file` 用于把本地文件内容作为字符串参数传入。
- 资产相关命令通过 `--file` 读取本地图片文件，再交给 `project-core` 处理资产规则。

这些入口解决的是代理经常遇到的大段代码、Schema、排序数组和图片内容传参问题。CLI 只负责读取和组装参数，实际校验仍在领域服务层完成。

## 事务与高风险操作

CLI 打开的编辑事务使用 `cli_` 前缀标识工作区，审计 actor source 使用 `project-admin-cli`。这让审计记录能区分 Web 操作、AI 操作和 CLI 操作。

删除项目、删除页面、删除文件夹、删除资产和发布回滚等操作继续走预览计划与确认执行两阶段。CLI 不绕过 `project-core` 的 dry-run、confirm token、锁定检查和审计规则。

## 发布路径

`publish project` 优先调用 author-site 正式发布 API。该路径需要配置 `AUTHOR_SITE_URL` 和 `AUTHOR_SITE_AUTH_TOKEN`，由 Web 发布链路完成编译、产物写入和可选外部同步。

当远端发布配置缺失时，CLI 会退回到 `project-core` 的本地发布状态更新。这是降级路径，只能用于本地管理状态闭环；输出需要带上对应提示和产物摘要，避免代理误判为完整线上发布。

## 与其他模块的关系

CLI 的业务语义来自 [项目管理模块](../../03-项目管理/)；模板能力来自 [项目模板库](../../03-项目管理/技术/08_项目模板库.md)；配置相关命令依赖 [配置与预览模块](../../04-配置与预览/)；AI 会话命令依赖 [独立 Agent 服务层](../../../独立Agent服务层/)。

CLI 新增命令时，应先确认领域服务是否已有对应能力。如果没有，应先补 `project-core`，再在 CLI 层添加参数适配和 JSON 契约测试。

## 验证

CLI 验证优先使用根目录命令：

```bash
pnpm check:project-cli
```

该命令会先类型检查，再通过 `packages/project-cli/scripts/run-tests.mjs` 打包并执行 CLI 测试。测试运行器会覆盖稳定入口，确保核心流程不回退到 `tsx` 启动方式。

如果改动影响领域服务或本地项目包转换器，还需要同步运行：

```bash
pnpm check:project-core
pnpm check:project-scaffold
```
