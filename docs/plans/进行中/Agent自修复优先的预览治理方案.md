# Agent 自修复优先的预览治理方案

## 背景

Opencode Workbench 的创作端定位是 AI 辅助开发者和设计师生成、修改页面代码，并通过实时预览验证结果。项目总览中明确了核心链路：开发者在临时工作空间中通过 AI 对话编辑页面，系统实时预览，保存时再合并到正式工作空间。

本次问题出现在项目 `proj_1782839405716_tqjl1f` 的编辑会话中。主项目工作空间里的 27 个页面可通过当前预览编译链路校验，但当前 session workspace 中的 `prototype-01` 被重复拼接成 2468 行，包含多份重复顶层声明和多个默认导出。该文件可以通过 TSX 转换阶段，但在浏览器模块导入阶段失败，典型错误为 `Identifier 'accentMap' has already been declared`。

需要特别说明的是，这次坏代码并不是创作端内置 Agent 直接写出的，而是通过 CLI / Project Admin CLI 工作流，由 Codex 写入项目数据后进入创作端预览链路。这意味着治理入口不能只放在创作端 AI 对话结束后；否则 CLI、Codex、导入脚手架、批量迁移和其他自动化写入仍会绕过质量闸门。

这个现象说明现有治理存在三个缺口：

- 系统能约束部分 AI 写入路径，但没有在所有页面写入入口之后立即判断页面是否能被预览运行时接受。
- 预览错误虽已有自动修复任务机制，但触发点偏后，常常等到 iframe 运行失败后才回流给 AI。
- 保存和自动快照可以作为最后防线，但如果只在保存、发布或打开创作端后才失败，修复责任会被转嫁给用户或后续使用者，违背 AI 辅助创作平台的产品定位。

因此，本方案不以“给 AI 增加更多禁止规则”为主要手段，而是建立系统级质量闸门，让系统在页面源码被任何入口写入后自动发现问题，并按来源把诊断交给对应执行者处理：创作端 Agent 走自动修复任务，CLI / Codex 写入走命令结果和事务校验反馈，普通用户侧继续保持轻量预览状态。

同时，本方案不把预览链路改造成重型发布流水线。创作端预览的首要价值仍是快速反馈，模型能力也会持续提升；系统治理只拦截确定会导致预览失败的低成本硬错误。更完整的诊断、截图、回归和多轮修复放到后台或关键动作前执行，避免因为少数坏例牺牲正常创作体验。

相关背景文档：

- [项目总览](../../项目文档/项目总览.md)
- [实时预览机制](../../项目文档/创作端/04-配置与预览/技术/02_实时预览机制.md)
- [AI 行为约束机制](../../项目文档/创作端/05-AI对话/技术/03_AI行为约束机制.md)
- [预览失败自动修复体验优化](../已完成/预览失败自动修复体验优化.md)

## 目标

- 页面代码通过创作端 Agent、CLI、Codex 自动化、导入脚手架或协同草稿写入后，系统自动判断页面是否可被预览运行时接受。
- 校验失败时，技术诊断直接回流给当前写入执行者；创作端 Agent 自动修复，CLI / Codex 命令返回机器可读诊断，普通用户侧只看到轻量状态。
- 用户侧只看到轻量状态，例如“正在检查生成结果”“检测到预览问题，正在自动修复”“预览已恢复”。
- 坏代码未通过校验前，不替换当前可见预览，避免白屏或长期加载态。
- 自动 checkpoint、手动保存和发布继续作为最后防线，阻止坏 session 污染正式版本。
- 即时预览链路保持低延迟：只校验本轮变更相关页面，目标预算为 100-200ms；超出预算时不得长期阻塞用户看到预览反馈。

## 范围

### 范围内

- AI 生成代码后的页面质量校验。
- CLI、Codex 自动化和项目导入写入后的页面质量校验。
- 页面源码 contract、TSX/JSX 编译、ESM 模块导入预检。
- Agent 写入工具的早期 validation 反馈。
- Project Admin CLI / project-core 事务校验和机器可读 diagnostics。
- 创作端自动修复任务的触发条件和隐藏诊断内容。
- 预览层在坏代码出现时保持最近可见结果。
- 自动 checkpoint 和保存前的严格校验。
- 即时 fast gate 与关键动作 strict gate 的分层策略。

### 范围外

- 不禁止 TSX 类型语法。当前预览编译器应继续支持 TSX。
- 不把技术错误直接展示给普通用户。
- 不为未知 npm 依赖提供静默 stub，避免预览与发布能力脱节。
- 不改变 Pi Agent 单后端架构。
- 不把宽容预览能力扩展到发布、使用端正式浏览、iframe 嵌入或模板产出。
- 不在 AI 每次写入后执行全项目扫描、截图、真实浏览器冒烟或多轮回归。

## 需求

### 用户体验需求

- 用户不需要理解模块导入、重复声明、依赖白名单等技术错误。
- AI 生成结果异常时，用户应看到系统正在处理，而不是空白页面或完整错误堆栈。
- 自动修复失败时，用户看到非技术提示，并可继续要求 AI 调整。
- 预览区优先保持最近一次成功结果，避免坏代码一写入就让画布或单页预览消失。

### Agent 协作需求

- Agent 写入 `demos/*/index.tsx` 或 `config.schema.json` 后，应尽早拿到 validation 结果。
- 如果写入后页面不可预览，工具结果应明确提示 Agent 继续修复，不要结束任务。
- 自动修复任务的 hidden prompt 应包含页面、文件、失败阶段、错误摘要、修复指引和可用上下文。
- 同一问题自动修复最多连续执行 2 轮，避免无限循环。

### CLI / Codex 协作需求

- CLI 或 Codex 自动化写入页面后，应在同一事务或命令结果中拿到 preview contract diagnostics。
- CLI 输出应保持 JSON-first，便于 Codex 根据 `stage`、`code`、`file`、`message` 和 `instruction` 自动继续修复。
- CLI 写入失败与预览校验失败需要区分：文件事务可成功落盘，但命令应能标记 `runtimeValidation.ok = false`，阻止发布、导出或标记为正常完成。
- 批量导入或迁移时，历史未改页面可先作为 warning，当前事务新增或修改页面必须作为 blocking diagnostics。

### 系统治理需求

- source contract、compile transform、module parse/import preflight 三层校验必须复用统一实现。
- `@opencode-workbench/preview-contract` 是统一规则源；author-site、project-core、project-cli、Agent 工具和 Codex 自动化不得复制第二套运行契约。
- 编译阶段能通过但模块导入阶段失败的问题，必须在预览切换前被识别。
- checkpoint、保存、发布必须严格校验；未修复的坏 session 不能创建正常版本。
- session workspace 与项目主 workspace 分叉时，系统优先让 Agent 修 session 文件，而不是要求用户手动处理版本。
- 质量闸门不得阻止 Workspace 写入。坏代码应保留在当前 Workspace 供 Agent 和用户检查，禁止提升为当前可见预览产物或正式版本即可。

## 方案

### 1. 新增轻量页面生成质量闸门

新增内部校验能力 `validateChangedPreviewPages`，用于页面源码写入后和保存前的统一检查。它只检查本轮变更关联页面，避免全项目大规模扫描影响交互。

即时预览链路采用 fast gate，只做低成本硬错误检查：

| 层级 | 目的 | 示例问题 |
| --- | --- | --- |
| source contract | 判断页面源码是否符合创作端源码契约 | 相对 import、未知依赖、无默认导出、`return null` |
| compile transform | 判断源码能否被 TSX/JSX 编译器转换 | TSX/JSX 语法错误 |
| module preflight | 判断编译产物是否能通过 ESM 静态解析和 early-error 检查 | 重复顶层声明、多个默认导出、重复拼接块 |

`module preflight` 只能做静态 parse，不能通过动态 `import()` 或 iframe 执行用户页面代码。它的目标是提前发现浏览器在模块解析阶段必然失败的问题，而不是替代真实渲染测试。

当前坏例应在 module preflight 层被识别，并返回可修复诊断：

- `stage`: `module_parse`
- `code`: `DUPLICATE_TOP_LEVEL_DECLARATION`
- `message`: 顶层声明 `accentMap` 重复
- `instruction`: 保留一个完整 React 组件模块，删除重复拼接块，确保只有一个默认导出

fast gate 的产品预算：

- 只检查当前 AI 回复、CLI 事务、导入任务或协同变更影响到的页面。
- 正常情况下在 100-200ms 内完成。
- 若校验服务超时或异常，不应让预览长期卡死；系统可继续按既有预览链路尝试加载，并把校验异常记录为内部诊断。
- 全项目扫描、截图、浏览器冒烟和回归样例只在后台治理或关键动作前执行。

### 2. 诊断回流给 Agent，不直接展示给用户

将 `ActiveViewContext.previewRuntimeError` 泛化为 `previewDiagnostic`，承载 source contract、compile、module parse、runtime、render 等阶段问题。该上下文明确用于 Agent 自修复，不作为用户可见错误。

自动修复触发来源扩展为：

- `post_generation_validation`：AI 生成后校验失败。
- `cli_runtime_validation`：CLI / Codex 自动化写入后校验失败。
- `preview_runtime`：iframe 运行时失败。
- `checkpoint_guard`：保存或自动快照前校验失败。

用户侧消息仍使用系统自动修复卡片：

- 运行中：检测到预览问题，正在自动修复。
- 成功：预览已恢复。
- 失败：AI 暂时未能恢复该页面，可继续让 AI 调整。

卡片默认不展开技术详情；完整诊断仅作为 hidden prompt 发送给 Agent。

CLI / Codex 场景没有正在运行的创作端 Agent 时，不应伪造创作端自动修复任务。此时 diagnostics 应回到 CLI JSON 输出或 Project Admin 事务结果，由 Codex 在当前命令行任务中继续修复；只有当用户打开创作端编辑页并存在可用 Session 时，才由创作端创建系统自动修复卡片。

### 3. Agent 修复闭环

创作端 AI 写入完成后，前端在提升预览产物前触发质量闸门：

1. AI 回复结束，文件变更同步完成。
2. 收集本轮变更页面。
3. 执行 `validateChangedPreviewPages`。
4. 若通过，生成或复用新的 preview artifact，并更新预览和配置状态。
5. 若失败，Workspace 和编辑器仍保留真实坏代码，但不把该源码提升为当前可见预览产物，并创建系统自动修复任务。
6. Agent 修复后重新执行同一校验。
7. 最多连续 2 轮；仍失败则保留 fallback 预览并结束自动循环。

为了减少二次自动任务，Agent 文件写入工具也应在写入页面文件后返回 validation 附加结果。这样 Agent 在同一轮对话中就能知道自己写入的页面不可预览，并继续修复。

工具级 validation 必须是非阻塞反馈：`writeFile` 或 `editFile` 写入成功后，即使页面不可预览，也应返回“文件已写入 + validation failed”的结构化结果，而不是回滚写入或拒绝写入。否则会破坏 Agent 渐进式修复流程。

### 4. CLI / Codex 写入闭环

CLI / Codex 是本次问题的实际来源，因此需要与创作端共用同一套 preview contract，但反馈形态不同：

1. Codex 或 Project Admin CLI 完成页面写入事务。
2. project-core 计算本事务新增或修改的页面集合。
3. 调用与创作端相同的 `validateChangedPreviewPages` 或底层 preview-contract 校验能力。
4. 若通过，CLI 返回正常成功结果。
5. 若失败，文件可保持落盘，但 CLI 返回 `runtimeValidation.ok = false` 和 blocking diagnostics。
6. Codex 读取 diagnostics 后继续修复同一事务或发起下一次编辑。
7. 发布、导出、模板产出等关键命令必须在 diagnostics 清零前阻断。

这样可以避免“CLI 写入坏代码，创作端打开后才发现”的延迟暴露，也避免把所有修复责任推给创作端内置 Agent。

### 5. 预览层保持可见

坏代码未通过 fast gate 前，不应替换当前 iframe 中的可见预览。预览源优先级：

1. 当前页面最近一次成功编译结果。
2. 当前项目正式 workspace 中同页面源码。
3. 最近一个严格通过的 named version 或 snapshot。

如果系统使用 fallback，用户只看到轻量修复状态，不展示 fallback 细节；Agent hidden prompt 中可包含 fallback 来源摘要，帮助它理解当前 session 与项目主版本的差异。

这里的“保持可见”只约束预览 iframe 的运行源，不代表编辑器或 Workspace 回滚。用户和 Agent 仍应能看到当前真实文件内容，避免隐藏问题来源。

### 6. 保存和快照作为最后防线

自动 checkpoint、手动保存、merge、导出和发布前继续执行 strict gate。关键动作必须先 flush Workspace 当前态，再校验落盘后的真实内容。如果 session workspace 仍有不可预览页面：

- 不创建正常版本快照。
- 不覆盖正式 workspace。
- 触发 `checkpoint_guard` 来源的 Agent 自动修复任务。
- 用户侧看到“正在修复后再保存”或类似轻量状态。

保存严格不是主交互路径，而是防止坏内容进入正式版本的最后防线。若需要保留回退线索，可以创建带 diagnostic 标记的内部检查点；这类检查点不能作为发布、模板产出或使用端正式浏览的来源。

### 7. 分阶段落地策略

为避免过度工程化，本方案按收益和风险分阶段推进：

1. 第一阶段只补公共 fast gate：在 `@opencode-workbench/preview-contract` 中扩展 module preflight 和统一诊断类型，并让 project-core / project-cli 能对当前事务变更页返回 blocking diagnostics。
2. 第二阶段补创作端预览提升策略：`PreviewPanel` 使用最近一次成功 preview artifact，失败时保持可见预览并触发系统修复卡片。
3. 第三阶段补 Agent 工具反馈：`writeFile`、`editFile` 对页面代码和 schema 写入返回非阻塞 validation 结果。
4. 第四阶段补 strict gate：命名版本、自动 checkpoint、导出和发布前先 flush 再严格校验。

第一阶段即可覆盖当前重复拼接导致的 `Identifier has already been declared` 问题；后续阶段按体验收益和实现复杂度逐步推进。

## 相关代码路径

### 预览契约与编译

- `packages/preview-contract/src/runtime.ts`：页面源码契约、依赖策略、Agent 创作规则。
- `packages/preview-contract/src/compiler.ts`：TSX/JSX 编译入口。
- `packages/preview-contract/src/index.test.ts`：preview contract 单元测试。
- `packages/author-site/src/lib/compiler.ts`：author-site 服务端编译封装。
- `packages/author-site/src/app/api/compile/route.ts`：编译 API。
- `packages/author-site/src/lib/preview-dependency-policy.ts`：预览依赖 URL 和虚拟模块策略。
- `packages/author-site/src/lib/preview-runtime-manifest.ts`：同源 preview runtime manifest。

### 创作端预览与自动修复

- `packages/demo-ui/src/PreviewPanel.tsx`：单页预览 iframe 编译、加载、错误回流。
- `packages/demo-ui/src/iframe-template.ts`：iframe runtime、模块 import、运行时错误上报。
- `packages/demo-ui/src/iframe-types.ts`：iframe postMessage 类型。
- `packages/author-site/src/app/demo/[id]/edit/page.tsx`：编辑页状态、`applyDemoSnapshot()`、预览错误触发自动修复。
- `packages/author-site/src/lib/agent/active-view-context.ts`：注入给 Agent 的当前视图和预览诊断上下文。
- `packages/author-site/src/components/ai-elements/ai-chat.tsx`：AI 对话入口和自动发送触发。
- `packages/author-site/src/components/ai-elements/chat/hooks/use-chat-stream.ts`：系统自动修复任务发送和状态更新。
- `packages/author-site/src/components/ai-elements/message.tsx`：自动修复系统任务卡片渲染。

### Agent 工具与工作空间

- `packages/agent-service/src/backends/pi-tools/`：Agent 文件读写工具与权限边界。
- `packages/agent-service/src/backends/pi-tools/permissions.ts`：工作空间路径权限。
- `packages/agent-service/src/collab/workspace-file-persistence.ts`：协同编辑文件持久化。
- `packages/author-site/src/app/api/sessions/[sessionId]/files/[demoId]/route.ts`：session 页面文件写入接口。
- `packages/author-site/src/app/api/sessions/[sessionId]/checkpoint/route.ts`：自动 checkpoint。
- `packages/author-site/src/lib/session-manager.ts`：session 保存、merge、版本写入。
- `packages/author-site/src/lib/fs-utils.ts`：项目快照和版本历史工具。

### 项目管理与 CLI

- `packages/project-core/src/service.ts`：项目读写服务、运行时契约校验。
- `packages/project-cli/src/`：CLI 项目管理入口。
- `packages/project-scaffold/src/`：本地项目包协议。
- `OPS/CLI/`：Project Admin CLI 测试工具和自动化入口。

### 文档

- `docs/项目文档/项目总览.md`
- `docs/项目文档/创作端/04-配置与预览/技术/02_实时预览机制.md`
- `docs/项目文档/创作端/05-AI对话/技术/03_AI行为约束机制.md`
- `docs/plans/已完成/预览失败自动修复体验优化.md`
- `docs/plans/进行中/统一创作端页面契约实施方案.md`

## 任务清单

- [x] 在 `@opencode-workbench/preview-contract` 中设计并实现静态 module preflight 校验能力。
- [x] 新增 `PreviewGenerationDiagnostic` 等统一内部诊断类型，覆盖 source contract、compile、module parse、runtime、render。
- [x] 在 project-core / project-cli 事务后接入 `validateChangedPreviewPages`，只校验本轮新增或修改页面。
- [x] 在创作端 AI 生成后接入 `validateChangedPreviewPages`，只校验本轮变更相关页面。
- [x] 将 `previewRuntimeError` 泛化为 `previewDiagnostic`。
- [x] 扩展系统自动修复触发来源和 hidden prompt 内容。
- [x] 扩展 CLI JSON 输出，返回 `runtimeValidation.ok` 和 blocking diagnostics，供 Codex 自动修复。
- [x] 在 Agent 文件写入工具结果中附加非阻塞 validation 反馈。
- [x] 调整预览层，使坏代码未通过 fast gate 前不替换当前可见预览。
- [x] 在 checkpoint、命名版本、导出和发布前接入 flush 后 strict gate。
- [x] 补充单元测试、组件测试和当前坏 session 回归样例。
- [x] 更新长期项目文档中的实时预览机制和 AI 行为约束说明。

## 验证方式

- preview-contract 测试：
  - TSX 类型语法通过。
  - 重复拼接文件被 module preflight 识别。
  - 多个默认导出、重复顶层 `const` 返回可修复诊断。
  - module preflight 不执行用户页面代码。
- Agent 工具测试：
  - 写入坏 `index.tsx` 后返回 validation diagnostics。
  - 写入好页面后 validation ok。
  - 写入坏页面时文件仍真实落盘，不被 validation 回滚。
- CLI / Codex 测试：
  - CLI 写入重复拼接页面后返回 `runtimeValidation.ok = false`。
  - 当前事务新增或修改页面的 module preflight 失败作为 blocking diagnostics。
  - 历史未改页面的运行契约问题只作为 warning。
  - 发布、导出、模板产出在 blocking diagnostics 存在时被阻断。
- 创作端测试：
  - AI 生成坏代码后不切换到坏预览。
  - 自动创建系统修复任务，hidden prompt 包含诊断。
  - 修复成功后预览更新，系统卡片变为完成。
  - 连续 2 次失败后显示非技术失败状态，并保留最近成功预览。
  - 正常页面修改通过 fast gate 后仍能快速刷新预览。
- 保存与快照测试：
  - 坏 session 不创建 auto checkpoint。
  - Agent 修复通过后 checkpoint 正常创建。
  - 关键动作前先 flush Workspace，再基于落盘内容校验。
- 回归样例：
  - 当前坏 session 的 `prototype-01` 触发自动修复诊断。
  - 当前主 workspace 的 27 页全部通过校验。

## 风险与待确认事项

- module preflight 必须只做静态解析，不能执行用户页面代码。
- Agent 工具级 validation 不应阻塞临时 workspace 写入，否则可能破坏 AI 的渐进式修复流程。
- 自动修复循环必须有限，默认最多 2 轮。
- 预览 fallback 只能用于保持可见性，不能被保存为正式页面内容。
- 需要确认是否引入新的轻量 ESM parser 依赖；若不引入依赖，则需要评估基于现有工具链的静态检查能力是否足够。
- 需要避免过度工程化：即时链路只做 fast gate，重型校验、截图和全项目回归不得进入每次 AI 写入后的同步路径。
- 需要确认 fast gate 超时策略。建议超时后不阻断预览尝试，只记录内部诊断并让后续 runtime 错误回流兜底。
- 需要确认 CLI 默认策略：建议面向 Codex 的 JSON-first 命令默认把当前事务 runtime diagnostics 作为 blocking；人工批量迁移可通过显式参数降级为 report-only，但不能用于发布或导出。

## 进度记录

- 2026-07-01：创建方案文档，明确从“用户侧错误展示/保存阻断”调整为“AI 生成后系统诊断并驱动 Agent 自修复”的治理方向。
- 2026-07-01：根据方案合理性评估补充分层治理原则：即时链路仅做 100-200ms 预算内的 fast gate，坏代码保留在 Workspace 供 Agent 修复，但不提升为可见预览产物；重型诊断和严格校验放到后台或关键动作前执行，降低过度工程化风险。
- 2026-07-01：补充问题来源修正：当前坏代码来自 CLI / Codex 写入而非创作端内置 Agent，因此治理入口从“创作端 AI 生成后”扩展为“所有页面写入入口共用 preview contract”，CLI / Codex 通过 JSON diagnostics 自修复，创作端 Agent 通过系统修复任务自修复。
- 2026-07-01：完成实施。`@opencode-workbench/preview-contract` 新增 compile transform 与 module preflight 诊断，能识别重复顶层声明和多个 default export；project-core / project-cli 页面写入返回 `runtimeValidation`，提交、发布、项目包导出、模板产出和页面版本创建接入 strict gate。
- 2026-07-01：完成创作端闭环。`PreviewPanel` 在 fast gate 失败时保留最近成功预览，编辑页将编译、module preflight 与 iframe runtime 错误统一写入 `previewDiagnostic`，系统自动修复 hidden prompt 包含来源、阶段、错误代码和修复指引，同一页面最多连续触发 2 轮，成功加载后重置计数。
- 2026-07-01：完成 Agent 工具反馈。`writeFile` / `editFile` 写入 `demos/*/index.tsx` 或 `config.schema.json` 后附加非阻塞 `runtimeValidation`，文件仍真实落盘，Agent 依据工具结果继续修复。
- 2026-07-01：完成文档同步。更新 [实时预览机制](../../项目文档/创作端/04-配置与预览/技术/02_实时预览机制.md)、[AI 行为约束机制](../../项目文档/创作端/05-AI对话/技术/03_AI行为约束机制.md) 及对应模块索引。

## 实施摘要

- preview-contract 统一诊断现在覆盖 source contract、compile transform 和 module parse；module preflight 只做静态解析，不执行用户页面代码。
- project-core / project-cli 将当前事务新增或修改页面的 runtime diagnostics 作为 blocking，将历史未改页面的问题降级为 warning；页面写入命令返回 `runtimeValidation.ok = false` 供 Codex 继续修复。
- 创作端将 `previewRuntimeError` 兼容升级为 `previewDiagnostic`，预览失败时保留最近成功 iframe 结果，并用轻量自动修复卡片隐藏技术细节。
- Agent 文件工具在写入后返回 preview validation 结果，失败时提示继续修复但不回滚写入。
- checkpoint、页面命名版本、项目包导出、模板产出和发布前均接入严格校验。

## 验证结果

- `corepack pnpm check:author` 通过：63 个 Jest test suite、474 个测试通过。
- `corepack pnpm check:agent` 通过：31 个 Vitest test file、275 个测试通过。
- `corepack pnpm check:project-core` 通过：2 个 Vitest test file、23 个测试通过。
- `corepack pnpm check:project-cli` 通过：包含 preview-contract typecheck/test、project-cli typecheck/test。
- `corepack pnpm --filter @opencode-workbench/preview-contract test` 通过：12 个 preview contract 单元测试通过，覆盖 TSX、重复顶层声明、多个 default export 和 module preflight 不执行代码。

## 剩余风险

- 当前自动修复计数按页面在编辑页内存中维护，页面成功加载后重置；跨浏览器刷新不会保留失败轮次。
- module preflight 主要覆盖浏览器模块导入阶段的确定性硬错误，不替代真实截图、渲染冒烟或完整 E2E 回归。
