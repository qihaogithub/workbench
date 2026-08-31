# AGENTS.md - workbench

> 面向 AI 编码代理的项目工作指南。目标是让后续代理能快速判断改动边界、选择正确工具、运行合适验证，并避免被历史目录或过期脚本误导。

## 设备记忆

根目录 `memory.md` 是设备级记忆文件，不在 git 中追踪（已在 `.gitignore`）。每台设备从 `memory.example.md` 复制并填入本地特有内容（命令别名、已知坑点、个人偏好等）。

AI agent 在启动任务前应优先读取 `memory.md`（如果存在），以获取本机特有上下文。

<!-- CODEGRAPH_START -->

## CodeGraph

本仓库已配置 CodeGraph MCP server（`codegraph_*` tools）。CodeGraph 是基于 tree-sitter 的代码知识图谱，适合回答结构性问题：符号定义、调用关系、影响范围、文件结构和相关源码上下文。

优先使用 CodeGraph 的场景：

| 问题                            | 工具                |
| ------------------------------- | ------------------- |
| 查找文件或目录结构              | `codegraph_files`   |
| 查找符号定义                    | `codegraph_search`  |
| 理解某个功能、架构或 bug 上下文 | `codegraph_context` |
| 查看多个相关符号源码            | `codegraph_explore` |
| 查看单个符号签名、位置或源码    | `codegraph_node`    |
| 查看调用者                      | `codegraph_callers` |
| 查看被调用项                    | `codegraph_callees` |
| 评估变更影响                    | `codegraph_impact`  |
| 检查索引状态                    | `codegraph_status`  |

使用规则：

- 结构性探索先用 CodeGraph，不要先 grep。
- “X 怎么工作”“这个 bug 可能在哪”这类问题，先调 `codegraph_context`，必要时再调一次 `codegraph_explore`。
- 不要循环调用 `codegraph_node` 读取一串符号；用一次 `codegraph_explore` 聚合上下文。
- 字符串字面量、日志文本、注释或配置项搜索才使用 `rg`。
- 文件刚改完时 CodeGraph 可能有约 500ms 索引延迟，不要立刻依赖它验证刚写入的内容。

如果 `.codegraph/` 不存在或工具提示未初始化，先询问用户是否运行 `codegraph init -i`。

<!-- CODEGRAPH_END -->

## 快速判断

- **项目阶段：未上线，不需要向后兼容。** 可以直接做破坏性变更（重命名接口、删除字段、修改数据格式等），无需迁移脚本或兼容层。不要为了兼容旧数据格式（如旧版 config.schema.json 的字段写法、废弃的类型键、历史 AI 生成的非标准 schema 等）添加额外代码分支或映射逻辑——修复数据本身比在代码层兜底更干净。
- 包管理器：`pnpm@8.15.0`
- Node 要求：`node >=24.0.0 <25`（统一使用 Node 24 LTS）
- `.npmrc`：`shamefully-hoist=true`
- Workspace：`packages/*` 和 `OPS/CLI`
- 前端：Next.js 16 App Router、React 19、Tailwind CSS、shadcn/ui、lucide-react
- 后端：Fastify
- 共享包：`@workbench/shared`
- 数据目录：默认 `data/`，可由 `DATA_DIR` 覆盖
- 环境变量文件：`.env` 被 git 忽略，`.env.docker` 用于 Docker 部署覆盖
- OPS 工程上下文入口：`OPS/AGENTS.md`
- Codex 定时任务上下文：`OPS/automations/`
- `CLAUDE.md` 仅包含 `@AGENTS.md` 转引，根目录 `AGENTS.md` 是主要工作指南。

## 工作流程

1. 先确认改动范围。涉及 `packages/agent-service/` 时，必须先阅读 `packages/agent-service/AGENTS.md`；涉及 `OPS/` 时，必须先阅读 `OPS/AGENTS.md`，再按子目录规则继续。
2. 若任务需要记录排查过程、根因、验证证据或后续事项，优先更新 `docs/plans/进行中/` 下对应功能模块的固定沉淀文档；不要因为单次修复或单个 bug 新建文档。
3. 用 CodeGraph 获取结构上下文；只有在查找字面文本时用 `rg`。
4. 涉及功能新增、功能调整、产品行为、业务流程、架构边界或接口契约时，优先读取 `docs/项目文档/` 中的相关模块文档，先确认既有语义和约束。
5. 保持改动局部化，遵循现有模块边界和导入风格。
6. 修改过程中按需同步更新对应模块沉淀文档的当前状态、关键结论、待办、验证状态和风险；简单局部修复可不写计划文档。
7. 每次功能改动完成后，必须同步更新 `docs/项目文档/` 中对应需求、技术或模块索引文档，确保项目文档与代码行为一致；若确认没有对应项目文档可更新，需要在最终回复中说明原因。
8. 修改后运行与改动范围匹配的验证命令。优先使用根目录 `check:*` 脚本，无法覆盖时再使用包级命令。
9. 不要回滚或整理与当前任务无关的用户改动。
10. **独立思考，不要刻意迎合用户。** 当用户提出的方案存在技术缺陷、违背最佳实践或不适合当前架构时，应明确指出问题并给出更优替代方案，而不是盲目执行。对于用户提出的需求要独立思考其合理性和可行性，给出客观专业的判断。
11. **主动维护 AGENTS.md。** 在完成每次任务后，如果发现新的约定、工具、流程、架构信息或常见陷阱值得沉淀，应主动更新 `AGENTS.md`、`packages/agent-service/AGENTS.md` 或 `OPS/AGENTS.md` 中对应的内容，使后续代理能从中受益。不要让好经验只留在这一次对话中。

### 子智能体模型路由

- 主智能体继续使用用户在 Codex 界面中选择的模型，不修改全局默认模型配置。
- 对于调查、代码检索、日志梳理，以及边界明确、方案完善且验收标准清晰的实施任务，优先派发已配置的 `LunaWorker` 子智能体（`gpt-5.6-luna`）。任务可以跨多个文件或篇幅较大；只要不需要在执行中重新作关键决策，就不以“简单”或“低风险”为限制。它尤其适合需要消耗较多上下文或 token 的高吞吐任务。
- `LunaWorker` 不独立承担未决的架构、产品、安全或接口契约决策，也不处理破坏性操作、视觉验收或难以复现的疑难问题；主智能体先明确方案后，可将其余实现部分交给 `LunaWorker`。
- DeepSeek 子智能体仅在已实际配置并通过验收后才可作为纯文本研究/审查的优先路由；当前未配置时不得假定可用。
- 只有在任务确实需要更高推理能力，或 Luna 无法完成时，才升级子任务模型，并在进度或最终说明中注明原因。

## 创作端问题诊断优先入口

遇到创作端编辑页、协同、自动保存、AI 对话、预览、发布或重新打开复原类问题时，先使用结构化诊断入口建立时间线，再读源码或手工 `rg data/editor-diagnostics`：

```bash
corepack pnpm diagnostics:recent -- --project <projectId>
corepack pnpm diagnostics:project -- --project <projectId> --since 24h
corepack pnpm diagnostics:preview -- --project <projectId> --since 24h
corepack pnpm diagnostics:autosave -- --project <projectId> --since 24h
corepack pnpm diagnostics:collab -- --workspace <workspaceId> --since 24h
corepack pnpm diagnostics:session -- --editor-session <editorSessionId>
corepack pnpm diagnostics:trace -- --trace <traceId>
corepack pnpm diagnostics:export -- --project <projectId> --since 24h
```

使用规则：

- 先看输出中的 `diagnostics` 完整性字段，确认 SQLite、JSONL fallback、event gap 和 warning，再下结论。
- 若 CLI 返回缺失、不可用或事件缺口，再降级读取 `data/editor-diagnostics/*.jsonl`，并在结论中说明使用了兜底数据。
- 预览错误优先按 `preview` 分组判断失败来自编译、iframe 加载、运行时错误还是自动修复；自动保存/复原问题优先同时看 `collab`、`autosave` 和 `ai` 分组。
- 如果排查中发现诊断事件缺字段、命令不可用、fallback 误判或导出包缺口，应同步维护 `OPS/CLI`、`OPS/automations/diagnostics/` 和 `docs/项目文档/创作端/11-诊断与日志/`，不要只在当前 bug 文档里记录。

## 计划与问题沉淀文档

`docs/plans/进行中/` 用于记录排查过程、问题根因、修复经验、测试缺口和后续事项。默认不要因为每次修复问题就新建文档；优先按功能模块维护少量固定文档，让同类问题持续沉淀在同一个位置。

优先更新已有模块沉淀文档，例如：

- `docs/plans/进行中/创作端编辑与协同问题沉淀.md`
- `docs/plans/进行中/创作端项目编辑页预览区问题沉淀.md`
- `docs/plans/进行中/项目管理与CLI问题沉淀.md`
- `docs/plans/进行中/AI对话与Agent问题沉淀.md`
- `docs/plans/进行中/部署与运维问题沉淀.md`
- `docs/plans/进行中/测试与工程质量问题沉淀.md`

如果对应模块文档不存在，优先创建模块级沉淀文档，而不是为单个 bug 创建一次性文档。文件名必须体现功能模块边界，不要使用单个 bug、单次排查或一次任务名称。模块沉淀文档应按问题条目追加或更新，条目建议包含：现象、影响范围、当前结论、修复摘要、验证状态、后续事项和相关文件/命令。

模块沉淀文档维护规则：

- `docs/plans/进行中/` 只保留当前仍有价值的信息：未解决问题、待验证事项、可复用根因、验证结论和后续动作。
- 不要记流水账。避免逐次追加“做了什么命令、改了哪些细节、每次尝试的完整输出”；只保留影响判断和后续接手的证据。
- 每次更新前先整理同一模块文档：合并重复条目，删除已失效描述，压缩已完成事项，把长过程改写成短结论。
- 已完成且没有复用价值的工作记录应从 `进行中` 文档删除，不为保留历史而保留历史。
- 已完成但值得追溯的问题，可归档到 `docs/plans/已完成/`，并在模块沉淀文档中只保留一条简短索引链接和最终结论。
- 如果修复结果改变了项目当前事实，应更新 `docs/项目文档/` 对应需求、技术或模块索引文档；`进行中` 文档只保留指向项目文档的链接，不重复维护事实正文。
- 当模块沉淀文档已经过长，应优先清理已完成条目和过期过程；仍然过长时，再按子模块或主题拆分为少量固定文档，避免重新退化为“一问题一文档”。

需要临时独立计划文档的例外情况：

- 涉及多个包、多个服务、跨前后端或跨模块数据流。
- 涉及产品行为、业务流程、权限边界、接口契约、状态机或部署方式变化。
- 需要分阶段排查、设计、实现、验证，或预计会产生多次文件改动。
- 用户明确要求追踪、跟进、验收或产出方案/计划。
- 现有模块沉淀文档无法承载该问题，或单独成文能明显降低后续接手成本。

临时独立计划文档要求：

- 文件名仍需先体现功能模块边界，再体现任务主题，例如 `AI对话与Agent-空回复排查方案.md`；不要使用只有单个 bug 或一次任务的泛标题。
- 文档至少包含：背景、目标、范围、方案、任务清单、进度记录、验证方式、风险与待确认事项。
- 任务清单使用可勾选列表，执行过程中及时更新状态，而不是结束后一次性补写。
- 进度记录要保留关键时间点、关键发现、方案调整、阻塞点和验收结果，便于后续代理接手。
- 若任务最终完成，应压缩为短归档移动到 `docs/plans/已完成/`，或把可复用结论合并回对应模块沉淀文档后删除临时文档。

## 项目文档知识库

`docs/项目文档/` 是长期项目知识库，用来沉淀产品需求、模块设计、架构决策和接口约定等当前事实。涉及功能改动时，agent 应优先按需读取相关文档，并在代码修改完成后同步更新对应事实；不应在每次任务中全量读取，也不要把排查过程、修复经验或临时问题记录写入项目文档。

读取顺序：

1. 先读 `docs/项目文档/INDEX.md` 判断相关模块。
2. 再读对应模块的 `INDEX.md` 或 `README.md`。
3. 最后只读取与当前任务直接相关的需求文档和技术文档。

需要读取项目文档的场景：

- 每次新增或修改功能前，优先确认是否已有相关模块文档。
- 新增或调整用户可见功能。
- 修改鉴权、项目管理、AI 对话、配置预览、嵌入 API、管理后台等既有模块。
- 改动跨服务接口、数据流、状态机、权限边界或部署方式。
- 代码现状与预期行为不清楚，需要确认产品语义。

需要维护项目文档的场景：

- 每次功能改动完成后，必须更新相关项目文档，使需求、技术说明、接口契约或模块索引与代码同步。
- 功能行为、业务规则、接口契约或配置策略发生变化。
- 架构边界、数据流向、状态流转或模块职责发生变化。
- 新增模块或移除旧模块。
- 修复导致项目当前事实发生变化，例如接口契约、配置策略、模块职责、业务规则或状态流转被调整。

维护规则：

- 修改 `docs/项目文档/` 下文档时使用 `doc-maintainer` 技能；修改 `docs/plans/` 时按对应目录 `AGENTS.md` 执行，不使用该技能。
- 需求文档只写“做什么”和“为什么”。
- 技术文档只写“怎么做”，避免粘贴大段源码。
- 更新模块文档时同步更新对应 `INDEX.md`。
- 当前项目文档入口是 `docs/项目文档/INDEX.md`；`doc-maintainer` 技能里提到的 `docs/INDEX.md` 在本项目中映射为 `docs/项目文档/INDEX.md`，除非后续专门建立全局 `docs/INDEX.md`。
- `docs/plans/进行中/` 是任务追踪区，新增或更新计划文档不需要同步 `docs/项目文档/INDEX.md`；任务完成后按 `docs/plans/已完成/README.md` 的归档规则移动。

## OPS 工程与自动任务上下文

`OPS/` 用于维护项目内工程诊断工具、Codex 定时任务和维护型自动任务上下文。进入 `OPS/` 前先读 `OPS/AGENTS.md`，再根据实际子目录读取 `OPS/CLI/AGENTS.md` 或 `OPS/automations/AGENTS.md`。

## 页面导出工具（tools/page-export/）

`tools/page-export/` 是把开发项目（Next.js/Vite/React SPA）页面批量导出为创作端原型页的独立工具，与 `OPS/`、`packages/` 平级。方案文档见 `docs/plans/远期规划/创作端开发项目模式方案/页面导出工具方案.md`，使用说明见 `tools/page-export/README.md`，项目级 skill 在 `.agents/skills/export-pages/`。

关键事实：

- 渲染引擎是 `single-file-cli@2.0.83`（AGPL 许可，仅内部评审流程使用），驱动系统 Chrome；依赖已声明在根 `package.json` 与 `tools/page-export/package.json`。
- 受保护页面登录 cookie 必须用 `--browser-cookies-file`（JSON，只给 `url`），不能用逗号串格式（`domain`+`url` 冲突导致 cookie 不生效）。
- 大 SPA 页面必须开 single-file 的 `--remove-unused-styles` / `--remove-unused-fonts` / `--remove-hidden-elements`，否则 CSS 超 `MAX_PROTOTYPE_CSS_LENGTH`（120KB）。
- 导入 `ow project import-prototype` 需显式 `--data-dir <repo>/data`，否则在 `--source` 目录运行时 dataDir 解析错误。
- normalize 进度日志走 stderr，stdout 只输出 JSON。
- 评审意见回流用 `bin/export-opinions.mjs`：读 `data/projects/<projectId>/comments.json`，按 routeKey（来自 demoPages / `data-route` 锚点）导出意见 JSON，agent 在开发项目按 routeKey 定位源码消费。
- 纯静态 HTML/CSS 项目走 B 路径：`export.mjs --static <html-dir>`（跳过 single-file 渲染，直接净化源码，复用 normalize 净化规则）；`import-prototype` 已支持按 pageId 覆盖更新既有原型页。

## 高保真页面快照插件（tools/page-export-extension/）

`tools/page-export-extension/` 是 Chrome / Edge Manifest V3 内部技术原型，把用户当前标签导出为包含可执行内容的 Editable Snapshot Bundle v1；纯函数拆包核心位于 `packages/editable-snapshot-core/`。它与 `tools/page-export/` 的静态原型净化链路互斥：不得把高保真 bundle 直接导入创作端原型运行时，也不得用 prototypeGate 规则覆盖 faithful 原件。

关键约束：

- 构建入口：`corepack pnpm check:page-export-extension`；解压扩展产物在 `tools/page-export-extension/dist/`。
- 插件构建期展开 `single-file-cli@2.0.83` 内置的 SingleFile Core 1.5.68 静态脚本，运行时禁止 `eval`；升级版本必须同时复核采集选项、浏览器夹具和 AGPL notice。
- 当前许可状态仅允许内部原型，禁止商店发布或外部分发；完成 AGPL 兼容发布决策或商业许可后才能产品化。
- `activeTab` hook 在用户点击后注入，无法回溯所有 document-start 状态；capture report 必须保留该降级，不能宣称通用交互完全还原。
- 大 HTML 走 256KB Port 分块、sequence/checksum、后台串行转发与 offscreen 聚合；不要改回单条 runtime message。
- Bundle 包含脚本、iframe 和事件，必须标记 `executableContent: true`，默认用隔离 runner 离线预览；不得读取或导出 Cookie、浏览器 storage 数据库或 history。
- offscreen 生成 ZIP 后必须进入 `review_required`，由 Popup/Side Panel 展示安全与 fidelity 摘要；用户批准前不得调用 downloads，取消/失败/批准后需撤销 Blob URL。
- Side Panel 的批量捕获先按需申请可选 `tabs`，再为用户逐项选择的标签申请按 scheme 与 host 限定的权限；Chrome host match pattern 不能区分端口，必须在 UI/报告中如实说明该边界。不得默认全选、自动激活标签或把当前可见截图冒充非活动标签。
- fidelity 回放使用 script-disabled/offline iframe + html2canvas DOM/CSS 渲染。不要改回 SVG `foreignObject` 绘制：Chrome 会把包含 HTML 的 canvas 标为 origin-unclean，`toBlob` 必然失败。报告必须继续声明近似渲染不证明交互等价。
- 执行文件保持原字节，Prettier 只写 `workspace/readable/`；外部 source map/source 只能经已授权 scheme-and-host、无凭证 GET 拉取，并拒绝跨 origin 重定向。Agent 修改后用 bundle 内 `runner/repack.mjs` 追加 workspace 内容哈希历史。

## HTML sandbox 长期约定

- HTML 自动判型由共享 runtime capability registry 统一维护；当前四类 runtime 为 `prototype-html-css`、`sandboxed-html`、`high-fidelity-react`、`sketch-scene`，未知 runtime 必须 fail-closed。
- 页面持久化展示只读取 `config.schema.json.$demo.presentation`；导入 meta 只保留来源/哈希审计，不得恢复 `$demo.previewSize`、`prototype.meta.json` 或 `html-import.meta.json` 尺寸回退。renderer 内部 `previewSize` 只是 presentation 或单页临时设备的投影。
- HTML 导入使用 prepare/commit/cancel 私有 draft 协议：prepare 不创建页面，commit 在一次 Authority mutation 中写入 runtime 文件、presentation 和页面树；取消、移除或过期必须同时清理 draft 和 execution ticket。
- 固定 Figma 画板使用 `fixed-canvas + fixed`；普通 HTML 使用 `responsive-page + content`。单页临时设备切换、画布卡片几何和页面持久化视口三者必须保持独立。
- `sandboxed-html` 页面 canonical 文件是 `sandbox.html` 与 `html-import.meta.json`；`sourceHash` 表示原始输入，`normalizedHash` 表示持久化归一化源码，禁止交换语义或把源码作为公开静态资源。
- 交互预览、viewer/embed 和发布都必须使用独立 sandbox origin、5 分钟 opaque execution ticket、`allow-scripts`、CSP/Permissions-Policy/referrer/no-store；不得把 ticket、源码或宿主会话注入页面。
- screenshot-service 对 sandbox 使用每任务独立 Chromium context，并在超时/错误时有界清理与强杀兜底。sandbox 降低权限但不承诺绝对断网、CPU/内存硬隔离或任意脚本业务等价。
- 发布只公开 manifest 摘要，源码保存在服务端私有源，由 viewer/embed 动态签发 ticket；诊断只记录脱敏摘要，禁止记录 execution ticket、HTML 原文或用户代码。

`OPS/automations/` 用于维护 Codex 定时任务和维护型自动任务的运行上下文，包括 context、runbook 和当前状态账本。它的目标读者是自动任务中的 AI，优先保证可执行、可复查和低噪声更新。

维护规则：

- `OPS/CLI/` 是长期工程诊断 CLI 和 Agent Service 测试工具，修改前读取 `OPS/CLI/AGENTS.md`、`OPS/CLI/README.md` 和 `OPS/CLI/package.json`。
- `OPS/automations/` 不属于 `docs/项目文档/` 知识库，不套用需求文档/技术文档拆分规范。
- 修改 `OPS/automations/` 时优先读取 `OPS/automations/AGENTS.md` 和 `OPS/automations/README.md`。
- `contexts/` 放长期任务上下文，`runbooks/` 放按触发频率组织的执行手册，`state/` 放覆盖式当前状态。
- `state/` 只保留当前仍成立的结论，不追加逐次流水账。
- 自动任务发现业务规则、接口契约或架构边界变化时，仍需更新 `docs/项目文档/` 对应模块。
- 自动任务发现具体缺陷、测试缺口或实施事项时，记录到 `docs/plans/进行中/`，不要只写在 `OPS/automations/state/`。

## Monorepo 结构

当前有效 workspace 包：

| 包名                            | 路径                           | 类型                                                   | 端口 | 测试                     |
| ------------------------------- | ------------------------------ | ------------------------------------------------------ | ---- | ------------------------ |
| `@workbench/author-site`        | `packages/author-site/`        | Next.js 16 App Router                                  | 4200 | Jest + Testing Library   |
| `@workbench/viewer-site`        | `packages/viewer-site/`        | Next.js 16 App Router                                  | 4300 | 无包内测试脚本           |
| `@workbench/demo-ui`            | `packages/demo-ui/`            | 创作端与使用端共享预览组件                             | -    | Vitest + Testing Library |
| `@workbench/shared`             | `packages/shared/`             | 共享类型和常量                                         | -    | 无测试脚本               |
| `@workbench/sketch-core`        | `packages/sketch-core/`        | 草图页协议、校验、patch、几何、只读渲染                | -    | Vitest                   |
| `@workbench/whiteboard-core`    | `packages/whiteboard-core/`    | 白板 v2 envelope、受限 HTML/CSS bridge、语义 action reducer | -    | Vitest                   |
| `@workbench/sketch-react`       | `packages/sketch-react/`       | 草图页 React SDK：画布、工具栏、图层、属性栏和编辑状态 | -    | Vitest + Testing Library |
| `@workbench/sketch-playground`  | `packages/sketch-playground/`  | Whiteboard Studio：白板 SDK 独立开发、性能与交互验证   | 3400 | TypeScript + Playwright  |
| `@workbench/agent-service`      | `packages/agent-service/`      | Fastify + Pi Agent                                     | 4201 | Vitest                   |
| `@workbench/agent-client`       | `packages/agent-client/`       | Client SDK                                             | -    | 无测试脚本               |
| `@workbench/screenshot-service` | `packages/screenshot-service/` | Fastify + Puppeteer                                    | 4202 | Vitest                   |
| `@workbench/knowledge-core`     | `packages/knowledge-core/`     | 知识库领域模型与权限规则                               | -    | Vitest                   |
| `@workbench/knowledge-service`  | `packages/knowledge-service/`  | Basic 检索、阅读地图、索引任务、知识报告               | 4203 | Vitest                   |
| `@workbench/project-core`       | `packages/project-core/`       | 项目读写领域服务，供 Web API 与 CLI 复用               | -    | Vitest                   |
| `@workbench/project-scaffold`   | `packages/project-scaffold/`   | 本地项目包协议与脚手架转换器                           | -    | Node/tsx 命令            |
| `@workbench/project-cli`        | `packages/project-cli/`        | 项目管理 JSON-first CLI                                | -    | Node/tsx 命令            |
| `@workbench/cli-tools`          | `OPS/CLI/`                     | CLI 测试工具，ESM                                      | -    | Node/tsx 命令            |

端口说明：本地 dev 端口是 4200-4300 段（author 4200 / agent 4201 / screenshot 4202 / knowledge 4203 / viewer 4300），全部默认绑定 `0.0.0.0` 支持局域网访问；Docker 部署使用 3200-3300 段，见 `docker-compose.yml`，不要混用。

viewer-site dev 端口注意：`next dev` 在加载 `.env` 之前解析端口，`.env` 里的 `PORT=4300` 不生效，必须显式 `-p 4300`（已写在 dev 脚本中）；`.env` 的 PORT 仅作约定记录。

Next 开发编译性能约束：

- author-site、viewer-site 与 sketch-playground 均使用 Next.js 16.2.12 / React 19.2.3。author-site 的日常 `dev` 默认使用 Turbopack，`dev:webpack` 保留为诊断回退；生产 `build` 仍显式使用 Webpack。viewer-site 与 sketch-playground 的 `dev` / `build` 继续使用 Webpack，两者的 Turbopack 脚本仅用于专项验证。
- author-site Turbopack 已通过 Markdown raw-text rule 与 NodeNext workspace 源码 `.js`→`.ts/.tsx` 精确重写支持；规则只可覆盖 `knowledge-*`、`preview-contract` 与 `project-*` 的源码目录，不能扩展到所有 workspace 文件，否则会破坏共享包的导出分析。
- `tailwind.config.ts` 在 Next 16 的 ESM 加载环境中不得调用 CommonJS `require()`；插件使用标准 ESM import。Markdown 资源必须同时保留 Webpack 的 `asset/source` 和 Turbopack raw-text rule，二者缺一会让编辑页的系统 prompt 首编译失败。
- Next 16 的 Playwright 开发服务若以 `127.0.0.1` 访问，应用 `next.config.js` 必须将其加入 `allowedDevOrigins`；否则 HMR 资源会被安全策略阻断，表现为画布交互用例无法完成。
- 编辑页和根布局不得从 `@workbench/demo-ui`、`@workbench/ai-chat-shared` 或 `date-fns/locale` 桶入口获取单个轻量能力；优先使用 package exports 公开的精确子路径，并维护高频路由静态导入测试。
- 编辑页不得直接动态引用 `author-ai-chat`；保留 `deferred-author-ai-chat` 二级延迟边界，只在初始页面文件就绪后挂载 AI 对话，避免 Mermaid、Shiki 等富文本依赖与预览区争抢首屏资源。
- author 校验适配器必须从 `@workbench/shared/validator` 精确子路径导入；`PreviewStage` 必须保留 `PreviewCanvas` 按 canvas 模式懒加载边界，不得让初始单页模式解析完整画布、Markdown 与几何子树。
- Session Bootstrap 向 agent-service 推送模型配置与外部授权时应并发执行、共同完成后再返回；评论等 effect 的 target 对象必须使用稳定引用，并在资源 ID 就绪前禁用网络链路，避免启动期重复 REST/WS。
- Docker 编辑页延迟诊断不能只看某一时刻的 `docker stats`；同时核对 author-site 容器 `cpu.stat` 的 `nr_throttled / nr_periods`、`RestartCount`、V8 heap OOM 日志和启动日志中的 Next.js 版本，避免周期性限流或重启被当前 `healthy` 状态掩盖。
- 采集冷编译基线前必须关闭仍指向 author-site 的旧浏览器标签，再清理 `.next` 和重启服务；旧页面会自动重连并发起 Authority/会话请求，污染模块数和编译时间。
- 被 `useEffect` / `useCallback` 依赖的可选数组或对象 props 不得在函数参数中使用 `=[]` / `={}` 这类每次渲染创建新引用的默认值；使用模块级稳定常量，避免请求 effect 循环。
- 草图画布测试在 hover、选择或拖拽等状态提交后，必须重新查询 `dangerouslySetInnerHTML` 生成的 SVG 节点；React 19 重渲染会替换这些 DOM 节点，不能向已脱离文档的旧引用派发后续 PointerEvent。

## 白板独立开发边界

- `@workbench/sketch-core` 是白板协议、几何、操作与只读渲染内核；`@workbench/sketch-react` 是可嵌入编辑器 UI 和状态层；两者不得依赖 `author-site` 的路由、项目数据、登录会话、AI 或截图服务。
- `@workbench/sketch-playground` 是 Whiteboard Studio，使用 `pnpm dev:whiteboard` 单独启动（端口 3400）；`pnpm dev:sketch` 是兼容同义命令。白板的交互、性能、工具栏和布局优化应先在 Studio 的 fixtures 与性能面板中完成。
- `author-site` 只保留白板入口、document/binding 持久化、PNG 导出和配置回填适配。只有宿主尺寸、权限、写回冲突或集成契约问题才应在创作端编辑页修改。
- `@workbench/whiteboard-core` 只处理白板 document、受限代码 bridge 和语义 action；agent-service 的白板上下文、代码、计划、候选资产与撤销工具默认关闭，需显式设置 `PI_AGENT_WHITEBOARD_TOOLS_ENABLED=true`。AI action/代码导入只能产生私有 draft，必须由宿主渲染 PNG 后通过 WhiteboardCommit 一次提交 document、binding 与配置值；不得单独持久化 document、修改 binding target 或配置值。
- non-live 白板 Commit 必须复用 `@workbench/project-core` 的 `writeWhiteboardTransaction`，不能手写 read-check-rename；该事务以排他锁、哈希 CAS 和可恢复 journal 保证恢复语义。
- 创作端配置图片统一通过 `demo-ui` 的 `ImageInputActions` 暴露上传和白板绘图两个悬浮入口；AI 绘图只在白板内部提供，不在图片上传控件或 author-site 暴露独立生成接口。该入口不复用于聊天附件、文档编辑器或白板内部素材上传。
- 白板能力稳定后，先运行 Studio 的类型检查与相关 E2E，再补充创作端对话框的回填集成验证；不要把创作端业务 API 或 Workspace 写入逻辑复制到 Studio。

`.next/`、`node_modules/`、`coverage/`、`dist/`、`out/`、`test/**/test-outputs/` 都是生成物或依赖目录，不作为源码入口。

`packages/shared/src/index.ts` 是共享类型入口。`@workbench/shared` 由 author-site、agent-service、screenshot-service 等包通过 `workspace:*` 引用。

## 常用命令

人工开发命令示例使用 `pnpm ...`；Codex 定时任务和 `OPS/automations/` runbook 优先使用 `corepack pnpm ...`，确保包管理器版本一致。

根目录命令：

```bash
pnpm dev
pnpm dev:author
pnpm dev:agent
pnpm dev:viewer
pnpm dev:screenshot
pnpm dev:preview
pnpm dev:sketch
pnpm dev:whiteboard
pnpm build
pnpm build:viewer
pnpm lint
pnpm typecheck
pnpm typecheck:viewer
pnpm check:author
pnpm check:demo-ui
pnpm check:agent
pnpm check:screenshot
pnpm check:sketch-core
pnpm check:whiteboard-core
pnpm check:sketch-react
pnpm check:sketch-playground
pnpm check:knowledge-core
pnpm check:knowledge-service
pnpm check:project-core
pnpm check:project-scaffold
pnpm check:project-cli
pnpm check:viewer
pnpm check:all
pnpm test:e2e
pnpm test:e2e:sketch-playground
pnpm test:e2e:ui
pnpm test:e2e:headed
```

注意：`pnpm dev` 会并行启动 author、agent、knowledge、viewer、screenshot 和 sketch Playground，并启用编辑页自动截图；`pnpm dev:lite` 保持相同六服务拓扑，但暂停自动截图以降低日常资源占用。两者启动前都会释放 3400、4200–4203、4300 端口。当前正式截图服务是 `packages/screenshot-service/`。

包级验证：

```bash
# author-site
pnpm --filter @workbench/author-site test
pnpm --filter @workbench/author-site test -- --testPathPatterns="file.test.ts"
pnpm --filter @workbench/author-site test:watch
pnpm --filter @workbench/author-site db:init

# agent-service
pnpm --filter @workbench/agent-service test
pnpm --filter @workbench/agent-service test:watch
pnpm --filter @workbench/agent-service test:coverage
pnpm --filter @workbench/agent-service test:smoke
pnpm --filter @workbench/agent-service typecheck

# screenshot-service
pnpm --filter @workbench/screenshot-service test
pnpm --filter @workbench/screenshot-service typecheck

# sketch-core / sketch-react / sketch-playground
pnpm --filter @workbench/sketch-core typecheck
pnpm --filter @workbench/sketch-core test
pnpm --filter @workbench/whiteboard-core typecheck
pnpm --filter @workbench/whiteboard-core test
pnpm --filter @workbench/sketch-react typecheck
pnpm --filter @workbench/sketch-react test
pnpm --filter @workbench/sketch-playground typecheck

# viewer-site
pnpm --filter @workbench/viewer-site typecheck
pnpm --filter @workbench/viewer-site build

# demo-ui
pnpm --filter @workbench/demo-ui typecheck
pnpm --filter @workbench/demo-ui test

# project-core
pnpm --filter @workbench/project-core typecheck
pnpm --filter @workbench/project-core test

# project-scaffold
pnpm --filter @workbench/project-scaffold typecheck
pnpm --filter @workbench/project-scaffold test

# project-cli
pnpm --filter @workbench/project-cli typecheck
pnpm --filter @workbench/project-cli test
```

`test:smoke` 需要 `ACP_SMOKE_REAL=1`，只在明确需要真实集成冒烟时运行。

## Playwright E2E

- 配置文件在 `test/创作端E2E回归测试/playwright.config.ts`，不是根目录默认配置。
- baseURL 是 `http://localhost:4200`。
- 前置条件：author-site 等相关服务已启动；首次运行需要 `pnpm playwright install chromium`。
- 运行命令：`pnpm test:e2e`、`pnpm test:e2e:ui`、`pnpm test:e2e:headed`。根脚本已显式指定 Playwright 配置文件。
- 草图 SDK playground 的独立浏览器冒烟使用 `pnpm test:e2e:sketch-playground`，配置在 `test/sketch-playground/playwright.config.ts`，会自动启动 `pnpm dev:sketch`。
- 正式回归用例必须维护在 `test/` 下的 Playwright 测试目录中，优先放入 `test/创作端E2E回归测试/` 并写成 `.spec.ts`。
- `scripts/development/` 只放开发期诊断、复现、采样和报告生成脚本；脚本可以调用 Playwright，但不作为正式回归用例的长期维护位置。
- 当某个 `scripts/development/` 脚本需要长期纳入回归验证时，应迁移或补写为 `test/` 下的 Playwright spec，并通过根目录 `package.json` 暴露清晰的测试命令。

## 浏览器自动化工具

**优先使用 ego-lite / ego-browser，不再使用 Playwright 进行日常浏览器自动化。**

- 需要浏览器访问、截图、数据抓取、表单操作、登录态复用等任务时，使用 `ego-browser`。
- Playwright 仅保留给现有的 E2E 回归测试套件（`test/创作端E2E回归测试/`、`test/sketch-playground/`），不用于新的浏览器自动化任务。
- `ego-browser` 命令由 macOS App `ego lite` 提供，位于 `~/.local/bin/ego-browser`。
- **环境要求**：确保 `~/.local/bin` 在 PATH 中。验证命令：`export PATH="$HOME/.local/bin:$PATH" && command -v ego-browser`。
- **基本调用方式**：通过 `Bash` 工具执行 `ego-browser nodejs <<'EOF' ... EOF` heredoc。所有 helpers（`useOrCreateTaskSpace`、`snapshotText`、`click`、`fillInput`、`captureScreenshot`、`js`、`cdp` 等）在 heredoc 中预加载。
- 技能文档位于 `~/.local/share/ego/ego-skills/SKILL.md`（通过 `~/.agents/skills/ego-browser` 链接），包含完整的 helper 列表和工作流说明。
- ego-browser 的优势：复用用户登录态、独立 Task Space 不干扰前台标签、代码优先（JavaScript 函数直接调用）比 CLI 驱动更快。

## 关键架构

Markdown 编辑器（DocumentEditor）：

- `packages/demo-ui/src/DocumentEditor.tsx` 是项目唯一的 Markdown 富文本编辑器，基于 **Milkdown Crepe v7**；Markdown 即主线模型，实现实时渲染输入。**已不再使用 TipTap、自研 Milkdown native-ui 或 prosemirror-markdown**，勿再引用旧实现。
- Crepe 统一提供 `/` 块菜单、选中文本浮动格式条、块拖拽、链接、图片、表格、代码块、列表、光标与占位体验；项目能力通过 `packages/demo-ui/src/markdown/crepe-config.ts` 的 `BlockEdit.buildMenu` 追加配置引用、视频和附件，图片上传复用 `ImageBlock` 配置。TopBar 已启用，Latex 和 Crepe AI 明确关闭。
- `DocumentEditor` 直接管理单一 Crepe 实例；受控 `value`/`onChange` 用 `lastEmittedRef` 防回环，外部同步用底层 Milkdown `replaceAll`，只读切换用 `crepe.setReadonly`，卸载必须销毁实例。
- 若可编辑的 `DocumentEditor` 消费方拥有 Session 上下文，必须传入 `localizeRemoteImage`；快捷键粘贴网页外网图片时，该处理器调用当前 Session 的资源本地化接口，成功后才写入图床地址，不能让外链直接落入 Markdown。
- 图片缩放以持久化目标像素宽度为准，渲染时仅用正文容器作为上限；`@milkdown/components@7.22.0` 的 `patches/@milkdown__components@7.22.0.patch` 负责 Markdown 编解码和拖拽写回。升级该依赖时必须复核此补丁，历史比例型图片会在再次调整尺寸后迁移为目标宽度。
- 设计规范说明的 `PageRequirements` 是 MarkdownIt 轻量只读渲染器，不经过 Crepe；它必须同步识别图片宽度元数据，并为未迁移的历史图片保留 560px 阅读上限，避免浏览端绕过编辑器策略而铺满宽屏。
- 主题只导入 Crepe common 结构样式，项目色彩、排版、浮层与响应式规则集中在 `packages/demo-ui/src/markdown/crepe-theme.css`，通过宿主 CSS tokens 自动适配明暗主题。
- 桌面端 Markdown 阅读排版统一为 15px 正文、1.75 行高与约 760px 文本列：`DocumentEditor` 的 880px 正文盒包含左右编辑沟槽，`PageRequirements`（设计规范的轻量只读渲染器）直接使用 760px 居中阅读列；浏览端设计规范的已绑定配置表也必须放入同一列，避免表格与说明左右边缘不齐；不要让浏览端回退到 `text-xs` 等紧凑 UI 字号。
- TopBar 的“更多”恢复入口必须挂在 `[data-document-editor="crepe"]` React 外层宿主，与 `.crepe` 滚动/裁切容器平级，且层级高于原生 TopBar；不得挂回 `.crepe`、`.milkdown-top-bar` 或 `.top-bar-inner`。Crepe/Vue 会在初次创建后替换 TopBar DOM，溢出适配器必须持续核对并重绑定当前 `.top-bar-inner`；被收纳节点的 `[hidden]` 语义不得被主题 `display` 规则覆盖。恢复菜单的克隆 SVG 位于 `.milkdown` 选择器作用域外，必须显式承接原 TopBar 的默认与悬停 `color` / `fill`，否则深色菜单中会回退为黑色图标。
- 消费方（author-site/viewer-site/ai-chat-shared）统一以 Markdown 传 `value`，已无 `format`/`htmlSanitizer` 参数。
- **prosemirror 双实例**：milkdown 与 prosemirror-adapter 各带不同 `prosemirror-view`/`prosemirror-model`，根 `package.json` `overrides` 已强制统一单一版本，勿手动改回。
- **测试 ESM 坑**：`@milkdown/*`、`@prosemirror-adapter/*` 均为 ESM-only，author-site 的 Jest（CJS）无法解析，靠 `packages/author-site/jest-milkdown-mock.js` + jest.config `moduleNameMapper` 全局映射兜底；demo-ui 用 Vitest 直接跑真实 Milkdown（roundtrip 幂等 + 集成渲染测试）。`codemirror`/`@codemirror/*` 自带 CJS 构建，Jest 可直接解析、无需 mock。
- **Node 24 + vitest 1.6.1 不兼容**：会报 `Cannot set property testPath`，demo-ui 已升级 vitest 2.1.9；其它包若在 Node 24 下跑 vitest 报此错，同样需升级 vitest。

Auth：

- author-site 使用 JWT（`jose`）。
- `proxy.ts` 保护 `/demo`、`/projects` 和 `/api/sessions`。
- 页面路由未登录时重定向到 `/login`；API 路由返回 401 JSON。
- 需要 `JWT_SECRET` 环境变量。

数据存储：

- 文件系统目录：`data/projects/`、`data/sessions/`、`data/workspaces/`、`data/snapshots/`、`data/screenshots/`。
- SQLite：`data/users.db`。
- `DATA_DIR` 可覆盖默认数据目录。

Session：

- author-site session 默认 2 小时过期：`SESSION_EXPIRY_MS = 2 * 60 * 60 * 1000`。
- author-site API 位于 `packages/author-site/src/app/api/`。

CORS：

- author-site 的跨域逻辑在 `proxy.ts`。
- agent-service 的 CORS 在 `packages/agent-service/src/server.ts`。
- agent-service 使用 `.env` 中的 `CORS_ORIGINS`。

Agent 后端：

- 当前仅支持 Pi Agent 后端。
- 后端实现位于 `packages/agent-service/src/backends/pi-agent.ts` 和 `packages/agent-service/src/backends/pi-tools/`。
- Pi Agent 通过 `@earendil-works/pi-agent-core` 进程内嵌入，不依赖 workbench Server 或外部 CLI 子进程。
- 模型配置通过 `PI_AGENT_*` 环境变量提供。
- 编辑重发时，前端通过 WS 消息 `resync_history` 触发服务端历史重同步：销毁旧 agent → 重建 → 逐条调 `appendHistoryMessage(role, content)` 写入 session。`IBackendAdapter`、`BaseAgent`、`BackendAgent` 均有 `appendHistoryMessage` 方法。

Screenshot 服务：

- 服务路径：`packages/screenshot-service/`。
- 端口：3202。
- 依赖 author-site 的 `/api/compile` 端点和本地 Chrome。
- 截图存储在 `data/screenshots/`。
- 支持同步单页截图、异步批量截图、LRU 编译缓存和文件系统截图缓存。

Spine 动画运行时（`@preview/sdk` 的 `SpinePlayer`）：

- **双运行时版本自动适配**：Spine 4.2 与 4.3 的二进制/JSON 素材格式互不兼容，单一 runtime 无法覆盖。根 `package.json` 同时依赖 `@esotericsoftware/spine-webgl@4.3.13`（vendor `spine-webgl.js`）与别名 `@esotericsoftware/spine-webgl-42`（`npm:@esotericsoftware/spine-webgl@4.2.112`，vendor `spine-webgl-42.js`）。`SpinePlayer` 先 fetch 骨架嗅探版本（JSON 读 `skeleton.spine`；二进制读字节 [8] 长度 + 后续版本串），按 `4.2` 前缀动态 `import('@esotericsoftware/spine-webgl-42')`，否则 `import('@esotericsoftware/spine-webgl')`。
- **加载与渲染要点**：二进制骨架（`.skel`/`.skel.bytes`）必须用 `assetManager.loadBinary`（`loadText` 会按 UTF-8 破坏二进制）；JSON 用 `loadText` 后以字符串解析；图集用 `assetManager.loadTextureAtlas(atlas)`（手动构造 `TextureAtlas` 的 loader 无法绑定纹理）；渲染用 `SceneRenderer`（`begin/drawSkeleton/end`），并给 `skeleton.updateWorldTransform(delta)` 传帧 delta（4.2 需要，否则抛 `physics is undefined`）。
- **素材命名**：支持标准 `.skel`/`.atlas`/`.json` 与 Flutter/Unity 导出的 `.skel.bytes`/`.atlas.txt`。zip 上传由 `app/api/sessions/[sessionId]/assets/upload/extract-spine-package.ts` 的 `selectSpinePackage` 按图集引用纹理 + 骨架前缀匹配选出自洽三元组。
- SDK 源码三处事实源需同步：`scripts/build-preview-runtime.mjs` 的 `sdkSource`、`packages/author-site/src/lib/preview-dependency-policy.ts`（data-URI 兜底）、构建产物 `public/preview-runtime/vendor/preview-sdk.js`（由 `pnpm build:preview-runtime` 重生成，勿手改）。

Docker：

- `docker-compose.yml` 包含 agent-service、author-site、screenshot-service、viewer-site、knowledge-service。
- viewer-site 当前没有配置 profile，默认随 compose 一起启动。
- 部署脚本：`scripts/deploy.sh`。
- Docker 环境：OrbStack（macOS）。国内 Docker Hub 直连不通，需通过 Clash 代理拉取镜像。

数据目录双向同步（本地 ↔ 正式），统一入口 `scripts/data-sync.sh`：

```bash
scripts/data-sync.sh prod2local            # 正式 → 覆盖本地（自动备份本地，交互确认）
scripts/data-sync.sh prod2local --dry-run  # 只读预检
scripts/data-sync.sh local2prod            # 本地 → 覆盖正式（高风险，自动备份正式）
scripts/data-sync.sh local2prod --yes      # 跳过交互确认
```

- 底层复用 `scripts/sync-production-data-to-local.sh`（prod2local）与 `scripts/deploy-author-with-data.sh`（local2prod），环境变量（`SERVER_IP`/`SERVER_USER`/`SSH_PASSWORD` 等）可覆盖透传。
- 覆盖前自动备份；正式备份 `/Users/jojo/workbench-data-backups`，本地备份 `../workbench-data-backups`。
- 注意：覆盖只改磁盘 data，已运行的 Docker 容器需重新构建/重启才生效。

OrbStack 代理配置（开发必备）：

OrbStack `network_proxy` 如果在 VM 启动前就指向宿主机桥接 IP（`192.168.139.3`），会导致 VM 启不动（桥接由 OrbStack 自己创建，启动时尚未就绪，死锁）。使用 launchd 自动代理守护进程根治：

```bash
# 查看代理守护状态
launchctl list | grep orbstack-proxy

# 日志
tail -f ~/.local/state/orbstack-proxy-watch.log
```

工作原理：
- `~/Library/LaunchAgents/com.workbench.orbstack-proxy.plist` 注册了 launchd 用户代理
- `~/.local/bin/orbstack-proxy-watch.sh` 每 5 秒检测 `~/.orbstack/run/docker.sock`
- Docker 运行时 → 自动设置 `network_proxy`；Docker 停止时 → 自动恢复 `none`
- 避免 VM 重启时因持久化代理配置导致死锁

手动覆盖代理（临时）：
```bash
# 临时关闭（10 秒内自动恢复）
orb config set network_proxy none

# 临时切换代理地址
orb config set network_proxy "http://192.168.139.3:7890"
```

前提条件：
- Clash（mihomo-party）必须开启 Allow LAN，监听 `0.0.0.0:7890`（混合端口，需支持 HTTPS CONNECT）
- `~/.orbstack/config/docker.json` 应保持干净（`{}`），不要混入 `http-proxy` 字段（OrbStack 不会用 Docker daemon 级代理配置）
- 所有国内免费 Docker Hub 镜像源（daocloud、dockerhub.icu、163、aliyun、1ms.run 等）已全部失效，不要折腾

Docker 栈启动注意事项：

- 3200-3300 端口服务来自 Docker 构建产物，不会像 4200-4300 端口的本地 dev 服务一样反映当前源码。做 UI 验收时若 DOM 或 CSS 与工作区不一致，先确认端口并重建对应容器，不要把旧构建现象当成当前源码行为。
- `docker compose up` 默认读取根目录 `.env`，该文件是 dev 端口（4200-4300）的 CORS 白名单。**Docker 栈必须使用 `--env-file .env.docker` 启动**，否则 agent-service 的 CORS 白名单会错配为 dev 端口，导致浏览器端附件上传等跨域请求被拦截（"Failed to fetch"）。聊天正常是因为走 WebSocket（不受 CORS 限制）。
- 正确启动命令：`docker compose --env-file .env.docker up -d`（或经过 deploy.sh 生成的 `.deploy.env`）。
- 验证 CORS 是否生效：`docker inspect workbench-agent-service-1 | grep CORS_ORIGINS` 应含 3200/3300；curl 带 `Origin: http://localhost:3200` POST 附件应返回 `access-control-allow-origin`。

## 代码约定

- TypeScript 使用 `strict: true`。
- 禁止新增 `as any`、`@ts-ignore`、`@ts-expect-error`，除非用户明确要求并说明原因。
- author-site 路径别名：`@/` 指向 `packages/author-site/src/*`。
- agent-service 路径别名：`@/` 指向 `packages/agent-service/src/*`。
- 共享类型优先从 `@workbench/shared` 引入。
- API 响应使用 `{ success: true, data: T }` 或 `{ success: false, error: { code, message } }`。
- author-site API 响应 helper：`createApiSuccess`、`createApiError`，位于 `packages/author-site/src/lib/fs-utils.ts`。
- 前端组件使用 shadcn/ui、Tailwind CSS、lucide-react、`class-variance-authority` 和 `cn()`。
- 不要新增其他 UI 库。
- 数据获取使用 SWR（`packages/author-site/src/lib/api.ts`）。
- 测试描述使用中文。
- agent-service 导入顺序：Node 内置模块、外部依赖、内部相对路径。

## 前端改动

- 优先复用现有组件、Tailwind token 和 `cn()`。
- lucide-react 已可用，按钮图标优先用 lucide。
- 不要为单个页面引入新的状态管理或 UI 框架。
- 修改交互流时，同步检查 API client、SWR key、loading/error 状态和移动端布局。
- 涉及登录、项目、会话、模型配置时，要检查 middleware、API route 和前端调用是否一致。
- AI 对话内联图片：前端在 `onFinish` 时调用 `extractImageUrlsFromParts`（`packages/ai-chat-shared/src/chat/utils/chat-stream-utils.ts`）扫描 assistant 文本中的 `/api/images/` 和 `/api/screenshots/file/` URL，自动拆分为 `image` parts 内联渲染，不需要后端协议变更。`AssistantMessage` 和 `Message` 组件均已支持渲染 `image` part。系统提示词中已包含「使用 Markdown 图片语法展示图片」的指令，与前端后处理互补。

## 后端改动

- agent-service 改动前阅读 `packages/agent-service/AGENTS.md`。
- 不要恢复已移除的多后端架构；当前目标是 Pi Agent 单后端。
- 修改 Pi Agent 工具时，同时检查路径安全、文件变更捕获、事件流和测试。
- 修改 Fastify route 时，确认错误响应结构、CORS、WebSocket 事件和 session 生命周期。
- screenshot-service 改动要关注 Puppeteer、本地 Chrome、缓存键和截图文件路径。

## pi-agent 官方参考代码

`docs/external/pi-reference/` 是 pi-agent 官方仓库的本地 shallow clone（已加入 `.gitignore`，不入库），用于开发时直接查阅官方实现，无需网络抓取。

关键文件路径：

| 内容                | 路径                                                              |
| ------------------- | ----------------------------------------------------------------- |
| 工具实现（read/write/edit/bash/grep/find/ls） | `packages/coding-agent/src/core/tools/`                  |
| 输出截断（truncateHead/truncateTail）          | `packages/coding-agent/src/core/tools/truncate.ts`         |
| 文件变更队列（串行化同文件编辑）               | `packages/coding-agent/src/core/tools/file-mutation-queue.ts` |
| 系统提示词构建                                | `packages/coding-agent/src/core/system-prompt.ts`          |
| pi-agent-core 框架（AgentTool 接口、Harness）  | `packages/agent-core/src/`                                 |

使用规则：

- 修改 `packages/agent-service/src/backends/pi-tools/` 下的工具实现前，先用 `Read`/`Grep` 查阅官方对应工具的本地源码，确认行为对齐。
- 差异分析文档 `docs/plans/进行中/AI工具集与pi-agent官方最佳实践差异分析.md` 记录了当前已识别的差距项和优先级。
- 如需更新官方参考代码：`cd docs/external/pi-reference && git pull --depth 1`。

## 验证策略

选择最小但足够的验证：

- author-site UI 或 API：`pnpm check:author`；只需要类型检查时可用 `pnpm typecheck`。
- demo-ui：`pnpm check:demo-ui`；若改动共享预览入口，还需按消费者运行 `pnpm check:author` 和 `pnpm check:viewer`。
- viewer-site：`pnpm check:viewer`，必要时 `pnpm build:viewer`。
- sketch-core：`pnpm check:sketch-core`。
- whiteboard-core：`pnpm check:whiteboard-core`；HTML/CSS 仅可通过 bridge profile 转换，不能依赖浏览器 DOM/layout 或宿主 IO。
- sketch-react：`pnpm check:sketch-react`；如果改动影响 author-site 草图编辑态，也运行 `pnpm check:author` 和 `pnpm test:e2e -- sketch-page-regression.spec.ts`。
- sketch-playground：`pnpm check:sketch-playground`，涉及交互或 fixture 时运行 `pnpm test:e2e:sketch-playground`。
- agent-service：`pnpm check:agent`。
- screenshot-service：`pnpm check:screenshot`。
- knowledge-core：`pnpm check:knowledge-core`。
- knowledge-service：`pnpm check:knowledge-service`。
- project-core：`pnpm check:project-core`。
- project-scaffold：`pnpm check:project-scaffold`。
- project-cli：`pnpm check:project-cli`。
- shared：至少运行 `pnpm check:author`、`pnpm check:agent`、`pnpm check:screenshot`、`pnpm check:viewer`；如果改动影响项目读写类型，也运行 `pnpm check:project-core` 和 `pnpm check:project-scaffold`。
- 跨页面关键流程：确认服务运行后执行 `pnpm test:e2e`。
- 全仓轻量验证：`pnpm check:all`。该命令不包含真实 LLM、OSS、Docker 或浏览器 E2E。

如果没有运行测试，在最终回复中说明原因和剩余风险。
