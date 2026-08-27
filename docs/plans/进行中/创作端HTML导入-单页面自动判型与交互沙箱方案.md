# 创作端 HTML 导入：单页面自动判型与交互沙箱方案

> 日期：2026-08-20  
> 状态：隔离运行时与 presentation 导入工作台已实施，等待用户验收
> 范围：创作端导入单个 `.html` / `.htm` 文件  
> 核心决策：系统自动选择静态原型或隔离交互运行时；用户不选择模式；脚本不得被静默删除后降级

## 〇、新窗口目标模式执行协议

### 0.1 使用方式

本功能适合使用目标模式，但不适合设置一个覆盖全部阶段的巨型目标。推荐在同一个新窗口中依次运行四个目标：Phase 0 → Phase 1 → Phase 2a → Phase 2b。每个目标只有一个交付闭环和一个可验证停止条件；当前阶段完成后停止，由用户检查结果后再启动下一阶段。

这样处理的原因是：Phase 0 会冻结公共合同与安全边界；Phase 1 只交付静态导入；Phase 2a 才引入不可信脚本执行；Phase 2b 再扩大到截图、viewer 和发布。跨过阶段门禁会让目标同时改动过多安全与数据合同，难以证明完成。

新窗口首次启动时，复制以下命令：

```text
/goal 严格执行 docs/plans/进行中/创作端HTML导入-单页面自动判型与交互沙箱方案.md 的 Phase 0。先完整读取根 AGENTS.md、memory.md（若存在）、本方案和本阶段涉及包的 AGENTS.md，检查并保护现有未提交改动。只完成 Phase 0 的合同与安全 spike，不进入 Phase 1/2。持续工作到 Phase 0 全部退出条件满足、验证通过、方案中的当前状态账本已覆盖更新为 ready_for_review；然后停止并汇报证据。普通实现或测试问题自行诊断修复，只有触及本文规定的暂停条件时才请求用户决策。
```

后续阶段使用第十三章对应的 `/goal` 指令。不要在上一个阶段仍为 `in_progress`、`blocked` 或 `needs_decision` 时启动下一阶段。

### 0.2 新窗口首读顺序

1. 根 `AGENTS.md` 和 `memory.md`（若存在）。
2. 本方案全文，重点读取“当前状态账本”“当前 Phase”“退出条件”。
3. `docs/项目文档/INDEX.md`。
4. `docs/项目文档/创作端/04-配置与预览/INDEX.md` 及本阶段直接相关文档。
5. 修改某个 package 前，完整读取该 package 的 `AGENTS.md`；当前可能涉及 `author-site`、`project-core`、`project-cli`、`screenshot-service`、`agent-service`。
6. 读取上一阶段在账本中记录的验证证据和唯一下一步，不重新进行已经完成的全量调研。

实施基线优先从以下入口恢复：

- runtime 与快照：`packages/shared/src/workspace.ts`、`packages/shared/src/index.ts`
- 文件注册与领域服务：`packages/project-core/src/workspace-resource-registry.ts`、`packages/project-core/src/service.ts`
- live mutation：`packages/author-site/src/app/api/projects/[projectId]/demos/route.ts`
- 导入 UI：`packages/author-site/src/components/demo/ImportFromFigmaDialog.tsx`
- 预览分发：`packages/demo-ui/src/preview-stage-resolver.ts`
- 截图：`packages/screenshot-service/src/routes/screenshots.ts`
- 发布与 viewer：`packages/author-site/src/lib/publish-manager.ts`、`packages/viewer-site/src/lib/preview-stage-adapter.ts`

### 0.3 自治与权限边界

目标运行期间可以自主：

- 读取仓库、定位调用关系、修改本阶段范围内的代码、测试、fixture 和文档。
- 运行非破坏性的类型检查、单元测试、构建、E2E 和本地浏览器验证。
- 启动或重启本项目本地开发服务；修复由本阶段改动引起的普通类型、测试和集成问题。
- 使用边界明确的子任务并行做代码检索、实现或审查，但必须避免多个执行者同时修改同一公共合同文件。
- 覆盖更新本方案的当前状态账本，并按项目规则同步长期项目文档；修改 `docs/项目文档/` 时使用 `doc-maintainer` 技能。

未经用户授权不得：

- 提交、推送、部署、配置正式域名、写入外部系统或使用生产凭证。
- 删除或整理无关用户改动，执行不可恢复的数据迁移或破坏性 Git 操作。
- 提前实现下一阶段、外部资源下载、网络型应用、持久化状态或元素级交互编辑。
- 为通过测试而放宽 sandbox、CSP、Permissions Policy、输入限制或消息校验。

### 0.4 必须暂停与不应暂停

必须暂停并把状态记为 `needs_decision`：

- 需要改变已冻结的产品规则、runtime/file/API 公共合同或安全边界。
- 需要开放 `allow-same-origin`、外部网络、blob script、额外浏览器权限或裸 HTML 直达执行。
- 需要生产凭证、正式部署、外部基础设施写入或不可恢复迁移。
- 与用户已有修改发生无法安全绕开的同文件语义冲突。
- 阶段退出条件本身互相矛盾，且无法用更保守的本地实现满足。

下列情况不应暂停：路径尚未找到、类型错误、单元测试失败、普通依赖问题、索引过期、现有测试暴露局部回归。应先在当前范围内诊断、修复并继续验证。

`blocked` 只用于已经持续复现且无法在授权范围内继续推进的外部阻塞；不能因为任务困难、耗时或验证尚未完成就标记阻塞或完成。

### 0.5 当前状态账本（每个检查点覆盖更新）

> 这是新窗口和上下文压缩后的唯一恢复入口。只保留当前事实，不追加命令流水。

```yaml
overall_status: ready_for_review
current_phase: presentation_workbench
phase_status: ready_for_review
current_goal: "等待用户验收 HTML 尺寸识别、确认工作台与统一 presentation 闭环"
scope_in:
  - "HTML 自动判型、原子导入与四 runtime 公共合同"
  - "创作端、截图、viewer、发布、embed、CLI、Agent 和 diagnostics"
  - "安全回归、包级检查、项目文档与长期约定"
  - "prepare/commit/cancel 私有 draft、尺寸置信度分析、集中工作台与导入后视口设置"
scope_out:
  - "外部资源本地化、配置绑定、持久状态与元素级视觉编辑"
locked_decisions:
  - "runtime=sandboxed-html"
  - "source=sandbox.html"
  - "metadata=html-import.meta.json"
  - "inline module 仅允许无外部 import"
  - "blob script 首期禁用"
  - "空首帧和一般 runtime error 为兼容性状态，不回滚导入"
  - "相对/远程资源与其他受限能力可导入，但强制进入无网络权限的 sandbox；data URL 超限则拒绝整个导入"
  - "保留现有 Workbench Export Markdown 兼容入口，不在本功能中删除"
  - "analysisVersion=1；sandboxPolicyVersion=1"
  - "输入上限 2 MiB；单 data URL 1 MiB；data URL 累计 2 MiB"
  - "capability registry 位于 shared，未知 runtime fail-closed"
  - "sandbox 执行要求独立 origin、受控 wrapper，顶层直达拒绝"
  - "sandbox 截图使用专用 Browser 实例和每任务 BrowserContext"
  - "config.schema.json.$demo.presentation 是展示唯一真值，不保留旧 previewSize/meta 尺寸读取分支"
  - "Figma 高置信度固定画板可自动提交；其他 HTML 默认推荐 1440x900 并要求确认"
  - "画布卡片几何、单页临时设备与页面持久化视口是三个独立概念"
completed:
  - "Phase 0/1：判型合同、19 类 fixture、静态导入、live/branch 原子提交与旧入口兼容已完成"
  - "Phase 2a：sandboxed-html 文件协议、capability registry、受控 ticket/wrapper、专用 renderer 与安全 E2E 已完成"
  - "Phase 2b：snapshot/hash、专用 Chromium 截图、私有发布源、viewer/embed 动态签发与 diagnostics 已完成"
  - "Embed 签发改为服务端完成后 307 跳转，保持 allow-scripts-only opaque origin"
  - "项目需求、技术、预览、截图、发布、CLI、viewer 文档与 AGENTS.md 已同步"
  - "2026-08-25：用户要求尽力导入所有单页面 HTML；受限能力改为 sandbox 兼容性提示，不再拒绝整份文档"
  - "2026-08-25：live Workspace 的 HTML 正文经 Authority staging 后以受管 staged-text mutation 原子提交，避免默认 JSON body limit 返回 413，同时保留 demos 文本资源约束"
  - "2026-08-25：画布调度将 sandboxed-html 纳入有界 execution iframe 运行池；截图未就绪时不再停留在灰色加载态，仍不暴露原始 HTML"
  - "2026-08-26：修复画布内容加载器默认 fetch 适配器丢弃 RequestInit，确保 execution ticket 请求真实发送 POST，避免 Next 405 空响应触发 Response.json 解析失败"
  - "2026-08-26：完成 PagePresentationProfile、尺寸置信度分析、prepare/commit/cancel draft 协议与宽版导入工作台"
  - "2026-08-26：单页临时设备切换与显式设为默认、fixed/content 高度行为、截图指纹、发布 manifest、viewer/embed 统一 resolver 已接通"
  - "2026-08-26：数据目录 1573 份 Schema 已执行直接迁移，1571 份写入 presentation，2 份原始 JSON 无效未改写"
changed_files:
  - "packages/shared、project-core、project-cli、demo-ui"
  - "packages/author-site、screenshot-service、viewer-site、agent-service"
  - "OPS/CLI、OPS/automations/diagnostics、test/创作端E2E回归测试"
  - "docs/项目文档/创作端/04-配置与预览 及关联模块；AGENTS.md"
checks:
  - "corepack pnpm check:contracts：通过"
  - "corepack pnpm check:project-core：通过，11 files / 148 tests"
  - "corepack pnpm check:demo-ui：通过，28 files / 141 tests"
  - "corepack pnpm check:screenshot：通过，4 files / 23 tests"
  - "corepack pnpm check:viewer：通过，5 files / 14 tests"
  - "corepack pnpm check:project-cli：通过（沙箱外临时监听 127.0.0.1）"
  - "author 任务相关 9 suites / 63 tests 与 typecheck 通过"
  - "agent 任务相关 7 suites / 70 tests 与 typecheck 通过"
  - "HTML sandbox Chrome E2E：4/4 通过"
  - "corepack pnpm test:e2e：HTML sandbox 4/4 通过；其他 13 项因 localhost:3200 未启动而 ECONNREFUSED，与本任务无关"
  - "check:author 全量：1192/1200 通过；8 项剩余失败只涉及 dev-bundler、ConfigForm 与 AI chat 的既有工作树改动"
  - "check:agent 全量：510/512 通过；2 项工具总数断言为既有基线失败"
  - "check:project-scaffold：既有 shared CommonJS/ESM named export 运行时基线失败，与 HTML 导入改动无关"
  - "corepack pnpm check:workspace-authority：当前工作树与纯净 HEAD 均以相同 5 项既有问题失败；失败文件均未被本任务修改"
  - "corepack pnpm check:all：在同一 workspace-authority 基线失败处停止，之前 preview-contract 通过"
  - "presentation 本次回归：author 聚焦 11 suites / 72 tests 通过，author/viewer/screenshot/agent/project-core/demo-ui typecheck 通过"
  - "project-core：11 files / 149 tests 通过；demo-ui：28 files / 143 tests 通过；screenshot：4 files / 23 tests 通过"
  - "agent 相关：3 files / 39 tests 通过；数据迁移脚本：2 tests 通过"
blockers: []
decisions_needed: []
next_action: "用户在创作端验收 Figma 直接拖入、普通 dashboard 选电脑视口导入与设为页面默认；验收后压缩归档"
updated_at: "2026-08-26"
```

更新规则：

- 开始阶段时写明预计修改包、范围和当前唯一动作。
- 合同冻结时更新 `locked_decisions`，不得维护第二份重复合同。
- 每个检查点只记录已验证结论、关键改动文件、命令和结果摘要。
- 达到阶段退出条件后设为 `ready_for_review`，不自动写成 `complete` 或进入下一阶段。
- 用户确认启动下一阶段时，把上一阶段设为 `complete`，再覆盖 `current_phase`、范围和唯一下一步。
- 全部 Phase 完成且第十八章最终验收通过后，才可把 `overall_status` 设为 `complete`。

## 一、结论与建议

支持“任意单页面 HTML”在产品上可行，但“任意”应解释为尽可能兼容单文件、自包含页面，而不是承诺浏览器所有能力都可用。

建议采用两条运行时路径：

- 无可执行脚本：进入现有 `prototype-html-css`，保留视觉编辑、配置绑定和轻量预览。
- 含可执行脚本、事件属性或 `javascript:` URL：进入新增 `sandboxed-html`，只在受控 iframe 中运行。
- 命中受限结构或外部依赖：保留源码并进入隔离运行时，返回结构化兼容性提示，不静默损失交互。

这不是导入对话框的局部改动。新增 `sandboxed-html` 会影响共享类型、页面文件协议、编辑预览、Workspace 写入、截图、发布、viewer、CLI、Agent 扫描和诊断。完成静态导入约需 1.5–2 周；交互运行时全链路 MVP 约需再投入 3–4 周，总体建议按 **4–6 周**规划。

复杂交互的建议是“保留页面内部、自包含的前端交互；不继承宿主权限，不支持外部网络型应用”。Tab、轮播、弹层、定时动画和 Canvas 通常可保留；依赖 API、第三方 SDK、登录态、跨页面路由或浏览器敏感权限的页面首期不支持。

## 二、现状与约束

当前 Figma HTML 导入实质上会创建 `prototype-html-css` 页面：前端读取 HTML，创建页面后写入 `prototype.html`，预览端通过 Shadow DOM 渲染。

现有边界：

1. `prototype-html-css` 是静态运行时。project-core gate 会拒绝任意 `<script>`、内联事件、`javascript:`、iframe/embed/object 和提交行为。
2. 现有高保真 React iframe 面向可信编译产物，默认包含 `allow-same-origin`，还会接收宿主配置消息，不适合承载上传的任意 HTML。
3. `DemoPageRuntimeType`、页面快照、截图请求和发布结构目前只有原型、React、草图三类。新增运行时是跨包合同变更。
4. 实时 Workspace 通过 Workspace Authority 提交 operations；本地 branch 由 project-core 直接写文件。两者不能用同一个“事务实现”概括。

主要代码入口：

- HTML 识别与旧 Figma 元数据提取：`packages/author-site/lib/markdown-parser.ts`
- 导入 UI：`packages/author-site/src/components/demo/ImportFromFigmaDialog.tsx`
- 页面运行时类型：`packages/shared/src/workspace.ts`
- 原型 gate 与页面写入：`packages/project-core/src/service.ts`
- 静态预览：`packages/shared/src/demo/prototype-preview.ts`、`packages/demo-ui/src/PrototypePagePreview.tsx`
- 可信 React iframe：`packages/demo-ui/src/IframePreviewFrame.tsx`、`packages/demo-ui/src/PreviewPanel.tsx`
- 截图：`packages/screenshot-service/src/routes/screenshots.ts`
- 发布：`packages/author-site/src/lib/publish-manager.ts`
- 外部页面净化参考：`tools/page-export/bin/normalize.mjs`

## 三、目标与非目标

### 3.1 目标

1. 导入单个通用 HTML 文件，不要求来源为 Figma。
2. 系统自动判型，界面不展示运行模式选择。
3. 静态页面继续复用现有原型能力。
4. 交互页面与宿主 DOM、身份、存储、内部 API 和业务消息隔离。
5. 判型结构化、确定、可解释、可测试。
6. 导入失败不留下空页面、半成品目录或 Workspace 脏数据。
7. 编辑、截图、viewer 和发布使用同一运行时与安全策略版本。

### 3.2 首期非目标

- 多页面、站点路由、ZIP 或同目录资源包。
- 外部 script、模块依赖、远程 CSS、字体、媒体或后端 API。
- Cookie、项目 Session、localStorage、IndexedDB 或宿主配置继承。
- iframe/embed/object、弹窗、下载、真实表单提交、顶层导航和敏感权限。
- 交互页的元素级 DOM 直接写回、配置绑定和完整视觉编辑。
- 对任意脚本提供 CPU、内存或执行时长的强隔离保证。
- 绝对网络零出站保证。浏览器内 iframe + CSP 只能限制已覆盖的请求类型；脚本仍可能尝试子 frame 自导航等通道。

## 四、产品规则

### 4.1 自动选择，不让用户选模式

```text
选择单个 HTML
  → 结构解析与规则分析
  → 选择 prototype-html-css / sandboxed-html，或拒绝
  → 生成候选产物并运行对应 gate
  → 原子提交
  → 打开页面并展示必要警告
```

用户只看到“导入 HTML”。成功时通常提示“已导入 HTML 页面”；检测到脚本时补充“页面脚本将在隔离环境中运行”。

### 4.2 不静默降级

检测到可执行脚本、事件属性或 `javascript:` 后必须进入交互运行时。交互路径不兼容时明确失败或警告，不删除脚本后伪装为静态成功。

只允许不改变交互语义的规范化：补全文档外壳、移除无效编辑器标记、规范化编码、处理系统元数据。任何资源下载、脚本改写或行为降级都必须由明确合同约束。

### 4.3 运行时是唯一事实源

成功页面只持久化 canonical `runtimeType`：

```ts
type HtmlImportRuntime = "prototype-html-css" | "sandboxed-html";

type HtmlImportOutcome =
  | { status: "accepted"; runtimeType: HtmlImportRuntime }
  | { status: "rejected"; code: HtmlImportRejectionCode };
```

不再同时持久化 `static_prototype`、`interactive_sandbox` 等重复状态。分析信号用于解释判定，不成为第二个运行时事实。

## 五、自动判型合同

### 5.1 分析结果

分析器由 project-core 提供纯函数式、无网络的共享合同：

```ts
interface HtmlImportAnalysis {
  analysisVersion: number;
  outcome:
    | { status: "accepted"; runtimeType: HtmlImportRuntime }
    | { status: "rejected"; code: HtmlImportRejectionCode };
  signals: HtmlImportSignal[];
  unsupportedCapabilities: HtmlUnsupportedCapability[];
  resourceReferences: HtmlResourceReference[];
  warnings: HtmlImportWarning[];
  detectedTitle?: string;
  detectedViewport?: { width: number; height: number };
  sourceHash: string;
}
```

原因码和集合顺序必须稳定。判型基于 HTML 结构，不尝试理解任意 JavaScript 的业务语义。

### 5.2 静态判定

以下条件同时成立时选择 `prototype-html-css`：

- 不含可执行 `<script>`。
- 不含 `on*` 事件属性。
- 不含 `javascript:` URL。
- 不命中硬拒绝规则。

下列能力本身不触发交互运行时：

- `<details>/<summary>`。
- CSS `:hover`、`:focus`、`:checked`、`:target`。
- checkbox、radio、select 等非提交控件。
- 页面内 `#fragment` 锚点。
- 原生音视频 controls。

`application/json`、`application/ld+json`、`text/plain` 等非可执行 script 不触发交互运行时，但规范化时应删除或转存为不可执行数据，避免与现有 prototype gate 冲突；不得把任意 `<script>` 带入 Shadow DOM。

静态 `<form>` 即使没有 `action` 也可能默认提交，首期应移除提交能力或拒绝，而不是只检查 `action` 属性。

### 5.3 交互判定

存在任一结构信号时选择 `sandboxed-html`：

- 可执行 classic script。
- 无 `src` 的 inline module script。
- 任意 `on*` 事件属性。
- `javascript:` URL。

不需要扫描脚本文本来证明它使用了 DOM 事件、timer 或 Canvas；只要存在未知可执行脚本，就保守进入沙箱。脚本文本扫描只产生兼容性信号或明确拒绝项，不承担安全证明。

inline module 首期不得包含静态或动态外部 import。`blob:` script 是否允许由 Phase 0 样本决定；默认策略是不允许，减少不必要能力。

### 5.4 硬拒绝与软警告

导入前硬拒绝：

- 文件为空、编码不可解析、超过输入上限或不能形成 HTML 文档。
- iframe/embed/object 等嵌套执行上下文。
- 外部 script、外部 module import、远程 CSS `@import`。
- 相对路径或远程字体、媒体等首期无法解析的关键依赖。
- 明确要求真实表单提交、Worker/Service Worker、弹窗、下载或敏感权限。
- 无法生成符合文件协议和运行时 gate 的候选产物。

只作为警告，不作为通用硬拒绝：

- 首帧为空、没有可见节点或只绘制 Canvas。
- 页面尺寸持续变化或持续动画。
- runtime error、unhandled rejection 或部分受限 API 被调用。
- 页面可能在用户操作后才显示内容。

运行时崩溃或超时可以让预览进入失败占位，但不应因为启发式“未产生可见页面”自动删除已成功导入的页面。

### 5.5 实现要求

- 使用 HTML parser 构建文档树，统一处理标签、属性和 MIME 大小写。
- 结构检查覆盖 URL 属性、`<base>`、meta refresh、script 类型、资源引用和嵌套上下文。
- 脚本文本检查仅用于明确的 import/Worker 等兼容性信号。
- 保存 parser 规范化后的候选产物，再由现有 runtime gate 校验；不要把现有正则 sanitizer 当作判型器。
- 同一分析器由 author API、CLI 和 Agent 工具复用；viewer、截图和发布只消费已持久化 runtimeType，不重新猜测。

## 六、页面与文件协议

### 6.1 新运行时

```ts
type DemoPageRuntimeType =
  | "prototype-html-css"
  | "sandboxed-html"
  | "high-fidelity-react"
  | "sketch-scene";
```

新增运行时之前，先建立集中式 runtime capability registry，避免继续散落字符串判断：

```ts
interface PageRuntimeCapabilities {
  sourceKind: "prototype" | "sandbox-html" | "react" | "sketch";
  supportsScripts: boolean;
  supportsVisualEdit: boolean;
  supportsConfigBinding: boolean;
  previewRenderer: string;
  screenshotRenderer: string;
  publishRenderer: string;
}
```

所有 runtime union、验证器和分支必须通过编译期穷尽检查。Phase 0 应先输出消费者矩阵，至少覆盖 shared、project-core、author API/UI、demo-ui、viewer、publish、screenshot、CLI、workspace-file-utils、Agent 扫描和 diagnostics。

### 6.2 文件合同

不同安全语义使用不同文件，避免交互源码误入静态 sanitizer：

| runtimeType | 源码文件 | 元数据 |
|---|---|---|
| `prototype-html-css` | `prototype.html`、`prototype.css` | `prototype.meta.json` |
| `sandboxed-html` | `sandbox.html` | `html-import.meta.json` |

`prototype.meta.json` 只保存静态原型展示信息。`html-import.meta.json` 只保存最小审计信息，例如：

```json
{
  "source": "html-import",
  "analysisVersion": 1,
  "sourceHash": "...",
  "normalizedHash": "...",
  "sandboxPolicyVersion": 1
}
```

完整 signals 和 warnings 由导入响应及 diagnostics 返回；除非确有审计需求，不在文件中重复持久化可重新计算的大对象。

### 6.3 重新判型

- 首次导入和“替换完整 HTML”必须重新分析。
- 普通文本或样式 patch 不重新分析。
- 静态页被写入脚本时，gate 返回“需切换运行时”，应用服务自动生成完整 runtime switch 操作。
- 交互页移除脚本后不自动降回静态页，避免隐式删除文件或能力；后续提供显式、安全的静态化维护动作。
- runtime switch 必须删除旧运行时专属文件，测试不得允许残留双份源码。

## 七、交互执行与安全边界

### 7.1 专用执行组件

新增 `SandboxedHtmlFrame`，不得把现有 `IframePreviewFrame` 仅通过传入不同 sandbox 属性复用。专用组件不发送 `UPDATE_CONFIG`、项目配置、资产凭证或任何宿主业务消息，也不处理 `APP_ACTION`。

iframe 基线：

```html
<iframe
  sandbox="allow-scripts"
  referrerpolicy="no-referrer"
  allow="camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'; clipboard-read 'none'; clipboard-write 'none'"
/>
```

不得开放 `allow-same-origin`、forms、popups、downloads、top-navigation、modals、presentation 或 pointer-lock。

### 7.2 受控执行包装页

`sandbox.html` 是不可执行源码数据，不提供裸 HTML 直达 URL。所有编辑预览、viewer、发布和截图统一通过服务端生成的受控执行响应：

```text
sandbox.html
  → 系统移除上传内容中的 CSP、base 和 meta refresh
  → 系统生成固定 wrapper / 执行响应
  → 注入桥接与策略版本
  → 固定安全响应头
  → 由 sandbox="allow-scripts" iframe 加载
```

独立、无认证态的专用 origin 是纵深防御，不替代 iframe sandbox。该 origin 必须：

- 不与 author/viewer 共享 Cookie 或登录态。
- 不提供可写同源管理 API。
- 不注册 Service Worker，不依赖持久化 Storage。
- 资产与执行响应分离，且都不暴露宿主秘密。

直接打开执行 URL 时不应得到未沙箱的用户页面；可以拒绝、下载源码或返回系统包装页。

### 7.3 CSP 与响应头

首期建议从更小能力开始：

```text
default-src 'none';
script-src 'unsafe-inline';
script-src-elem 'unsafe-inline';
script-src-attr 'unsafe-inline';
style-src 'unsafe-inline';
img-src data: blob:;
font-src data:;
media-src data: blob:;
connect-src 'none';
frame-src 'none';
object-src 'none';
worker-src 'none';
form-action 'none';
base-uri 'none';
```

说明：

- `unsafe-inline` 是兼容任意单文件内联脚本和事件属性的功能让步，不是安全防线；不得加入 `unsafe-eval`。
- 若 Phase 0 证明可无损改写事件属性与脚本，可升级为 nonce 模式；不要在尚未验证时把复杂 AST 重写设为 MVP 前提。
- 默认不允许 `blob:` script；仅在真实样本证明必要并完成风险测试后加入。
- 上传 HTML 中的 CSP、`<base>` 和 meta refresh 由规范化器删除，系统响应头是唯一策略源，避免输入自带策略导致不可预测兼容问题。
- 单文件首期只接受内联和 data/blob 资源，不引入 `<sandbox-asset-origin>`；未来资产域需单独设计固定资源 ID、无任意 query/path、无重定向的只读服务。

同时设置 `Permissions-Policy`、`Referrer-Policy: no-referrer`、`X-Content-Type-Options: nosniff`。COOP/COEP 是否启用由 Phase 0 验证，不能在未验证嵌入关系前直接冻结。

### 7.4 网络边界的准确承诺

`connect-src 'none'` 可以阻止 fetch、XHR、WebSocket、EventSource 和 Beacon 等受该指令约束的连接；各资源指令限制图片、脚本、字体和媒体请求。它不等价于浏览器级网络隔离，也不能仅靠 sandbox 阻止子 frame 导航到外部页面。

因此首期安全合同是：

- 不向交互页面提供任何宿主秘密、身份或项目配置。
- 结构分析移除或拒绝已知外部 URL 和导航入口。
- CSP 与 iframe sandbox 限制已覆盖的请求、顶层导航、弹窗、表单和嵌套上下文。
- 剩余的动态子 frame 自导航被限制在 iframe 内；宿主检测 load/navigation 异常后显示占位并允许恢复，不能宣称运行时代码能绝对阻止。
- 如业务要求“硬性零出站”，必须使用带网络代理/防火墙和资源配额的远程浏览器、容器或解释器；该能力不属于本 MVP。

### 7.5 消息协议

允许的消息仅限遥测：`READY`、`RESIZE`、`RUNTIME_ERROR`、受限 `CONSOLE_LOG`。

父端必须校验：

- `event.source === 当前 iframe.contentWindow`。
- 当前加载代次和 channel id。
- 消息类型、字段、嵌套深度、单条大小、总量和频率。

opaque-origin iframe 的 `event.origin` 通常是 `"null"`，不能把 origin 当作身份校验。channel id 对页面脚本可见，只用于关联当前加载、防止旧 iframe 串台，不是秘密或授权凭证。所有消息都视为不可信输入，永不触发宿主业务动作。

### 7.6 资源与拒绝服务

浏览器 iframe 不能提供 CPU/内存配额。同步死循环、大量 DOM、高频 RAF/Canvas、MutationObserver 或内存分配可能阻塞同一渲染进程；父端超时与重载也可能无法及时执行。

编辑端缓解措施：按需挂载、离屏卸载、限制重载次数、失败占位、默认画布截图。截图/预检应使用一次性 BrowserContext；高风险验证优先使用独立 Chromium 进程，并在超时后终止 page/context 或进程，而不是只移除 iframe。

这是残余风险，不应包装成“已完全隔离”。

## 八、资源与交互兼容矩阵

### 8.1 首期支持

- 内联 HTML/CSS/JavaScript。
- data URL 图片、字体、媒体，受总大小与单资源上限限制。
- 页面内部 DOM 事件、timer、RAF、Canvas 和内存状态。
- 页面内 fragment 锚点。
- Tab、轮播、弹层、表单联动但不提交等自包含交互。

### 8.2 首期拒绝或受限

- 相对路径资源：单文件上传无法取得同目录文件。
- 任意远程资源和服务器侧静默抓取。
- 外部 script/module、远程 CSS、字体、媒体和第三方 iframe。
- fetch/XHR/WebSocket/Beacon、Worker/Service Worker。
- 真实表单提交、弹窗、下载、宿主/顶层导航。
- 依赖登录态、Storage、第三方 SDK 或跨页面路由的应用。

未来若支持远程资源，应设计独立的资产导入流程，明确 SSRF、重定向、私网/IP、MIME、大小、超时、内容扫描、staging 与失败回滚；不能简单放开运行时 `https:`。

## 九、导入事务与模块边界

### 9.1 原子导入流程

```text
解析 → 分析 → 规范化 → runtime gate → 生成 mutation plan → 原子提交
```

- Live Workspace：author-site 应用/API 层负责鉴权与 Session，调用纯分析/规范化服务，构造完整 `put_text`/tree operations，经 Workspace Authority 一次提交。
- Branch/本地项目：project-core 在临时 staging 目录生成全部文件，校验成功后原子替换或提交；失败清理 staging。
- 若未来引入二进制资产，资产 staging 与 Workspace mutation 必须有明确回滚/孤儿清理协议。

“原子”分别指 live 的单次 Authority mutation 和本地的 staging commit，不假设 project-core 直接拥有实时 Workspace 写权限。

### 9.2 模块职责

| 模块 | 职责 |
|---|---|
| author-site UI | 选择文件、进度与结果展示，不判型 |
| author-site 应用/API | 鉴权、Session、调用分析器、构造 live mutation、返回 diagnostics |
| project-core | 纯分析、规范化、runtime gate、branch staging、mutation plan |
| shared | runtime union、capability registry、文件/快照/发布合同 |
| demo-ui | 静态 renderer 与独立 `SandboxedHtmlFrame` |
| screenshot-service | sandbox 专用渲染分支、请求拦截、一次性上下文/进程超时 |
| publish-manager | 生成 sandbox manifest 与受控执行路由，不把 sandbox 当 React 编译 |
| viewer-site | 按 persisted runtimeType 选择 renderer，不重新判型 |
| CLI / Agent | 复用 project-core 分析和导入计划，不复制规则 |

### 9.3 API

建议新增专用入口：

```text
POST /api/projects/:projectId/imports/html
```

输入包含 Session、文件名和 HTML 文本；成功返回页面、`HtmlImportAnalysis` 和 warnings；失败返回 `error.code`、结构化分析结果及可执行提示。UI 不编排“先创建、再更新”的两步写入。

## 十、编辑、截图与发布

### 10.1 静态页

保持 Shadow DOM、元素选择、属性编辑、配置绑定、批注、截图和现有发布路径。

### 10.2 交互页

- 单页预览按需启动专用 iframe。
- 画布默认使用最新截图或占位，不常驻执行脚本。
- 支持完整源码/AI 修改和页面级评论。
- 首期不提供元素级写回和配置绑定。
- iframe 发生外部自导航、崩溃或资源超限时显示失败占位，可重新加载原始受控执行响应。

### 10.3 截图与发布

- `PageSnapshotInput`、截图 schema/hash/render 分支显式新增 sandbox 类型，不能让未知 runtime 落入 sketch 或 React 默认分支。
- screenshot-service 使用受控 wrapper 和一致策略，记录被阻断请求、超时和 runtime diagnostics。
- 发布结构显式包含 sandbox 源码路径/manifest 与 `sandboxPolicyVersion`。
- viewer 与 embed 只加载受控执行路由；不公开可裸执行的 `sandbox.html`。
- 编辑、截图和发布共享策略定义，但允许发布策略更严格；差异必须版本化和测试。

## 十一、错误与反馈

| code | 场景 | 用户提示 |
|---|---|---|
| `HTML_IMPORT_INVALID` | 文件无效 | 无法读取有效 HTML |
| `HTML_IMPORT_TOO_LARGE` | 输入超限 | HTML 文件过大，请压缩后重试 |
| `HTML_IMPORT_INTERACTIVE_SELECTED` | 自动进入沙箱 | 检测到页面脚本，已在隔离环境中运行 |
| `HTML_IMPORT_EXTERNAL_RESOURCE_UNSUPPORTED` | 外部/相对依赖 | 当前仅支持自包含的单文件资源 |
| `HTML_IMPORT_EMBED_UNSUPPORTED` | iframe/embed/object | 当前不支持页面内嵌第三方内容 |
| `HTML_IMPORT_CAPABILITY_RESTRICTED` | 网络或敏感 API | 页面依赖当前不支持的浏览器能力 |
| `HTML_RUNTIME_FAILED` | 运行异常 | 页面已导入，但交互预览运行失败，可查看诊断或重载 |

运行错误与空首帧通常是导入后的兼容性状态，不默认回滚已通过结构分析和 gate 的页面。

## 十二、测试与安全验收

### 12.1 分析与合同

- 标签、属性、script MIME 大小写与畸形 HTML 归一化。
- JSON/LD+JSON/text/plain 不误判，并从静态产物删除或安全转存。
- classic/inline module、事件属性、`javascript:` 正确进入 sandbox。
- 外部 import、iframe、meta refresh、form、相对资源正确进入 sandbox 并产生兼容性提示。
- 属性顺序不影响分析；hash、reason code 和 analysis version 稳定。
- runtime switch 清除旧运行时专属文件。
- runtime union、snapshot、publish payload、resource registry 均有穷尽分支测试。

### 12.2 隔离与消息

- 无法读取父 DOM、Cookie、Storage、Session API 或项目配置。
- fetch/XHR/WebSocket/Beacon 和各类资源请求分别验证，不能只测试 `connect-src`。
- 顶层导航、弹窗、下载、表单、第三方嵌入被限制。
- 动态子 frame 自导航不会替换宿主，宿主可恢复原页面。
- 伪造 APP_ACTION、过大/过深/高频消息、旧 iframe 串台均不触发业务动作或拖垮宿主。
- 上传内容不能覆盖 sandbox、CSP、Permissions Policy 或响应头。

### 12.3 运行与性能样本

固定维护真实 fixture：静态营销页、details/CSS 页面、Tab、轮播、弹层、表单联动、Canvas、runtime error、空首帧、外部依赖、同步死循环、大量 DOM、无限 MutationObserver、高频 RAF/Canvas。

验证：

- 静态页无现有 Figma HTML 导入回归。
- 交互页离屏卸载，页面切换后旧 iframe 销毁。
- 截图等待有上限，持续动画不永久等待。
- 同步死循环时一次性上下文/独立进程可被回收。
- author、CLI、viewer、screenshot 和 publish 消费同一合同。

### 12.4 准确的安全验收口径

可以验收：宿主秘密未暴露；同源权限未开放；已覆盖的网络、权限、导航和消息通道受限；失败可诊断、可恢复。

不能宣称：iframe 提供 CPU/内存配额；CSP 等同完整网络隔离；独立 origin 自动等同无认证态或进程隔离；channel id 能认证页面脚本。

## 十三、实施阶段与成本

### Phase 0：合同与安全 spike（3–5 人日）

目标：冻结可直接实施的跨包合同和安全基线，不交付用户可见导入功能。

允许范围：

- runtime 消费者矩阵与集中式 capability registry 设计。
- `HtmlImportAnalysis`、原因码、版本/hash 规则和固定 fixture。
- parser/analyzer 原型与 iframe/CSP/opaque origin/导航/拒绝服务安全 spike。
- execution wrapper、独立无认证 origin、snapshot/publish contract 和截图隔离结论。
- 本方案状态账本与 Phase 0 证据。

禁止提前实现：导入 UI、Workspace 写入、正式 `sandboxed-html` union、viewer/publish/screenshot 接线、外部资源处理。

消费者矩阵至少覆盖：shared、project-core、author-site、demo-ui、viewer-site、screenshot-service、agent-service、project-cli、resource registry、viewer data route、publish manager、screenshot ensure route 和 diagnostics。

验证命令：

```bash
corepack pnpm check:contracts
corepack pnpm check:workspace-authority
corepack pnpm check:project-core
corepack pnpm check:prototype-core
```

退出条件：

- 消费者矩阵完整，公共合同、原因码、fixture 和策略版本已冻结。
- 安全 spike 有浏览器实证，明确 CSP/iframe 能保证与不能保证的边界。
- capability registry 的位置和字符串判断迁移方式确定。
- 独立 origin、wrapper 和截图隔离有可实施结论；不要求在 Phase 0 部署生产设施。
- 相关验证通过，账本为 `phase_0 / ready_for_review`，下一步唯一动作指向 Phase 1。

启动命令：

```text
/goal 严格执行本方案 Phase 0，只完成合同与安全 spike。持续工作到 Phase 0 全部退出条件和验证满足、当前状态账本更新为 ready_for_review；不要实现产品导入、Workspace 写入或 sandboxed-html 正式运行时，不要进入 Phase 1。普通工程问题自行解决；只有触及第 0.4 节暂停条件时请求决策。
```

### Phase 1：通用静态 HTML 导入（5–8 人日）

前置：Phase 0 已由用户确认并在账本中标记 `complete`。

目标：交付无脚本单页面 HTML 的自动静态导入闭环。含脚本页面在分析结果中明确需要 `sandboxed-html`，但在 Phase 2a 上线前拒绝创建，不得删脚本降级。

实施顺序：

1. 在 project-core 实现纯 parser/analyzer/normalizer 与 fixture 测试。
2. 用现有 prototype gate 校验静态候选产物。
3. 实现 branch staging 原子写入计划。
4. 在 author-site 新增专用 import application/API，live 路径一次提交 Workspace Authority operations。
5. UI 改为调用单一导入 API；保留现有 Figma/Workbench Export 兼容，不再由 UI 编排“创建后更新”。
6. CLI 复用同一 analyzer 和导入计划，不复制判型规则。

禁止提前实现：执行上传脚本、加入 `sandboxed-html` runtime、iframe wrapper、viewer/publish/screenshot sandbox 分支。

验证命令：

```bash
corepack pnpm check:project-core
corepack pnpm check:project-scaffold
corepack pnpm check:project-cli
corepack pnpm check:author
corepack pnpm check:workspace-authority
```

退出条件：

- 无脚本 HTML 自动创建 `prototype-html-css`。
- script、事件属性和 `javascript:` 产生交互判定且不创建静态页面。
- inert data script 不误判，并从静态执行上下文删除或安全转存。
- live mutation 或 branch staging 任一步失败不留下页面/目录半成品。
- 现有 Figma 和 Workbench Export 入口无回归。
- 项目文档已同步，账本为 `phase_1 / ready_for_review`。

启动命令：

```text
/goal 严格执行本方案 Phase 1，只实现无脚本单页面 HTML 的自动静态导入闭环。先确认账本中 Phase 0=complete；持续工作到 Phase 1 验证、原子性、兼容回归和项目文档同步全部完成，账本更新为 ready_for_review；不要执行上传脚本、加入 sandboxed-html runtime 或进入 Phase 2a。
```

### Phase 2a：交互预览 MVP（10–15 人日）

前置：Phase 0、Phase 1 已标记 `complete`。

目标：交付 `sandboxed-html` 在创作端的安全导入、文件持久化和按需交互预览，不接截图、viewer 与发布闭环。

实施顺序：

1. shared 增加 runtime/file 类型与 capability registry，并用穷尽检查消除未知 runtime 默认分支。
2. project-core 增加 resource registry、runtime inference、读写、switch 和 gate。
3. author-site 增加 sandbox 文件读写、import 接受路径和受控 execution route。
4. demo-ui 新增独立 `SandboxedHtmlFrame`，只接收受限遥测，不复用可信 React 协议。
5. 接入编辑单页预览、画布截图/占位、重载和失败状态。
6. 增加安全 E2E fixture，验证消息、导航、网络、权限与资源限制。

禁止提前实现：viewer、publish、embed、正式截图生成闭环、外部资源、配置绑定、元素级视觉编辑；不得放宽第七章策略。

验证命令：

```bash
corepack pnpm check:project-core
corepack pnpm check:author
corepack pnpm check:demo-ui
corepack pnpm check:contracts
corepack pnpm test:e2e -- --grep "HTML|sandbox|prototype|preview"
```

最后一条只在对应正式 E2E 已加入后执行。E2E 必须验证脚本/事件/timer/Canvas 可运行，同时验证宿主秘密不传入、APP_ACTION 不处理、遥测限流、外部连接、顶层导航、popup、download 和裸源码直达受限；动态子 frame 自导航必须可恢复。

退出条件：

- `sandboxed-html` 可原子导入并通过受控 wrapper 在创作端按需运行。
- 旧 runtime 无行为回归；所有 runtime union 和读写分支显式覆盖。
- 一般 runtime error、空首帧和超时进入可诊断失败状态，不破坏宿主或静默降级。
- 安全 E2E、包级检查和项目文档同步通过。
- 账本为 `phase_2a / ready_for_review`。

启动命令：

```text
/goal 严格执行本方案 Phase 2a，只完成 sandboxed-html 的安全导入、文件持久化和创作端交互预览。先确认 Phase 0/1=complete；持续工作到 Phase 2a 的安全 E2E、包级验证和文档同步全部通过，账本更新为 ready_for_review；不要接入 screenshot、viewer、publish/embed 或扩大 HTML 能力。
```

### Phase 2b：截图、viewer 与发布闭环（5–10 人日）

前置：Phase 0、Phase 1、Phase 2a 已标记 `complete`。

目标：让 sandbox 页面在截图、viewer、发布和 embed 中使用与编辑态一致的受控执行合同，完成全功能验收。

实施顺序：

1. 扩展 snapshot input、hash 和 screenshot render 分支。
2. 为不可信脚本建立一次性 BrowserContext；若恶意 fixture 证明共享进程无法可靠回收，升级为 sandbox 专用 Chromium 进程。
3. 扩展 screenshot ensure、publish manifest、viewer data 和 viewer adapter。
4. embed 只加载受控 execution route，不暴露裸 `sandbox.html`。
5. 接入 diagnostics，完成跨环境安全、超时回收和一致性回归。
6. 更新项目文档、AGENTS.md（仅沉淀确有长期价值的新约定）和本方案最终状态。

禁止范围：新增 HTML 能力、开放网络/权限、外部资源本地化、持久化状态、元素级编辑或正式部署。

验证命令：

```bash
corepack pnpm check:screenshot
corepack pnpm check:author
corepack pnpm check:viewer
corepack pnpm check:agent
corepack pnpm check:project-cli
corepack pnpm check:contracts
corepack pnpm check:workspace-authority
corepack pnpm test:e2e
corepack pnpm check:all
```

若 `check:all` 或全量 E2E 存在与本任务无关的基线失败，必须记录可复现证据并证明本任务相关检查通过；不能修改无关模块来掩盖失败。

退出条件：

- 编辑、截图、viewer、发布和 embed 共享 persisted runtimeType、文件协议与 policy version。
- snapshot hash、publish manifest、viewer data、超时/进程回收和禁止裸源码执行均有自动化测试。
- 第十八章全部最终验收通过，项目文档和索引同步完成。
- 账本为 `phase_2b / ready_for_review`，`overall_status=ready_for_review`；由用户验收后再标记整体 `complete` 并按计划文档规则归档。

启动命令：

```text
/goal 严格执行本方案 Phase 2b，完成 sandboxed-html 的截图、viewer、发布、embed 和 diagnostics 闭环。先确认 Phase 0/1/2a=complete；持续工作到全部自动化验证、最终验收和项目文档同步完成，账本更新为 phase_2b/ready_for_review 且 overall_status=ready_for_review；不要新增 HTML 能力、放宽安全策略、部署或处理外部资源。
```

Phase 0–2b 合计约 **4–6 周**，取决于独立 origin 和截图进程隔离基础设施是否已具备。外部资源本地化、第三方 SDK、持久化状态和交互页元素级视觉编辑不计入。

后续能力（另立 RFC/Backlog）：外部资产导入、节点采集/元素级批注、配置绑定、强网络/CPU 隔离。它们不属于当前导入验收闭环。

## 十四、任务清单

### 已冻结决策（不表示代码已实现）

- 仅支持单页面、自包含 HTML；用户不选择运行模式。
- 脚本、事件属性和 `javascript:` 自动进入 `sandboxed-html`，不得静默删脚本降级。
- 静态和交互使用独立 runtime 与文件合同：`prototype.html` / `sandbox.html`。
- 交互审计元数据使用 `html-import.meta.json`，不污染 `prototype.meta.json`。
- inline module 只允许无外部 import；首期禁用 blob script。
- 相对/远程资源首期拒绝；data URL 超限拒绝整个导入。
- 空首帧和一般 runtime error 是兼容性状态，不作为通用导入回滚条件。
- live 使用 Authority 单 mutation，branch 使用 staging commit。
- 保留现有 Figma/Workbench Export 兼容入口。
- 不承诺 CSP 绝对断网、iframe CPU/内存配额或 channel id 身份认证。

### Phase 0 验收项

- [x] 完成 runtime 消费者矩阵与 capability registry。
- [x] 固化 analyzer 类型、原因码、版本/hash 与 fixture 兼容矩阵。
- [x] 完成 opaque origin、CSP、消息、导航和拒绝服务 spike。
- [x] 形成独立 origin、wrapper、安全响应头和截图隔离结论。
- [x] Phase 0 任务相关验证通过，账本为 `ready_for_review`；`check:workspace-authority` 的既有 HEAD 基线失败已记录。

### Phase 1 验收项

- [x] 实现共享 parser/analyzer/normalizer/gate。
- [x] 实现 live 与 branch 两种原子提交路径。
- [x] UI/CLI 复用单一导入合同，静态导入与旧入口回归通过。
- [x] 项目文档同步，Phase 1 经用户连续完成授权标记为 complete。

### Phase 2a 验收项

- [x] 新增 runtime、文件与创作端预览协议。
- [x] 实现专用 `SandboxedHtmlFrame` 与遥测协议。
- [x] 完成创作端按需预览、失败占位、重载和安全 E2E。
- [x] 项目文档同步，账本为 `phase_2a / ready_for_review`。

### Phase 2b 与整体验收项

- [x] 实现截图、viewer、发布和 diagnostics 闭环。
- [x] 新增 snapshot 与发布协议并完成全部消费者接线。
- [x] 补齐 snapshot、manifest、viewer、进程回收、单元、集成和全量 E2E。
- [x] 更新 `docs/项目文档/` 对应需求、运行时、预览、CLI、发布和模块 INDEX。
- [x] 若实施发现新的长期约定或陷阱，更新根 `AGENTS.md`。
- [x] 第十八章全部通过，账本为 `overall_status=ready_for_review`。
- [ ] 用户验收后标记整体完成并压缩归档本计划。

### Presentation 导入工作台验收项

- [x] 实现 Figma 固定画板、数字 viewport、`device-width`、无尺寸与冲突信号的置信度分析。
- [x] 实现绑定用户/项目/Session/Workspace、有限时的 prepare/commit/cancel 私有 draft。
- [x] 实现响应式导入工作台、安全 iframe、设备预设、自定义边界、批量套用与失败重试。
- [x] 实现拖入高置信度 Figma 自动提交，普通/混合 HTML 进入工作台。
- [x] 实现单页临时设备切换与“设为页面默认”，并使截图、发布、viewer/embed 共用 presentation。
- [x] 删除旧单阶段导入接口、`$demo.previewSize` 持久化读取与原型 meta 尺寸回退，并完成现有 Schema 迁移。
- [x] 包级类型检查、相关单元/集成测试和项目文档同步通过。
- [ ] 用户完成真实 HTML 文件的界面验收。

## 十五、实施风险与关闭规则

以下是 Phase 0 必须用证据关闭的实施风险，不再作为开放式产品选择留给新窗口重复决策：

1. 独立无认证 origin 的本地、Docker 和正式环境配置方式；目标任务只实现代码与配置，不执行正式 DNS/部署。
2. screenshot-service 先验证一次性 BrowserContext；若恶意 fixture 证明无法可靠回收，则使用 sandbox 专用 Chromium 进程。这是测试驱动的实现分支，不需要重新询问产品策略。
3. capability registry 的具体文件落点可按依赖方向选择，但必须成为唯一能力表并逐步消除散落的默认分支。
4. 同步死循环、DOM/RAF/Canvas 资源消耗仍是浏览器内残余风险；不得通过文案把它描述成强隔离。
5. 正式环境若缺少独立 origin 或部署权限，代码可以完成并记录部署前置；不得擅自部署，也不得因此放宽同源隔离。

只有风险关闭方案需要改变第 0.5 节 `locked_decisions` 时，才转为 `needs_decision` 并暂停。

## 十六、规范依据

- [OpenAI Codex：Follow a goal](https://learn.chatgpt.com/use-cases/follow-goals)：目标应包含单一目标、可验证停止条件、首读上下文、检查点、验证证据和暂停边界。
- WHATWG HTML Standard：iframe `sandbox`、opaque origin、`allow-scripts` / `allow-same-origin` 与导航限制。
- W3C Content Security Policy Level 3：`connect-src`、各资源指令、`form-action`、`base-uri` 等指令的实际覆盖范围。

规范用于定义浏览器能提供的边界；仓库现有实现用于定义改造范围。Phase 0 还需用项目支持的浏览器版本做行为验证，不能仅凭规范文本推断所有运行结果。

## 十七、进度记录

### 2026-08-20 Phase 1–2b 完成结论

- Phase 1 完成单 HTML 结构分析、归一化、静态/交互自动判型与 live/branch 原子导入。
- Phase 2a 完成 `sandboxed-html` 文件协议、受控 execution ticket/wrapper、`SandboxedHtmlFrame` 和创作端安全预览；Chrome 安全 E2E 4/4 通过。
- Phase 2b 完成专用 Chromium 截图、发布私有源 + 公开 manifest、viewer/embed 动态签发、Agent/CLI 接线及 diagnostics 脱敏汇总。Embed 改为服务端签发后 307 跳转，避免 opaque iframe 因同源/CSP 限制而无法在浏览器内反调 API。
- 包级验证已覆盖 project-core、demo-ui、screenshot、viewer、project-cli 和任务相关 author/agent suites。全量 E2E 中 4 项 sandbox 用例通过；其他 13 项因本机 3200 测试服务未启动而 `ECONNREFUSED`，未暴露 HTML sandbox 失败。

### 2026-08-20 初稿

- 完成现有 Figma HTML 导入、原型 gate、Shadow DOM、iframe、截图和发布链路调研。
- 用户确认仅支持单页面，导入时由系统自动选择模式。
- 形成静态原型 / 交互沙箱 / 拒绝三类处理结果。

### 2026-08-20 复审

- 按现有 runtime、Workspace Authority、截图和发布合同完成架构复查。
- 修正“CSP 等同绝对断网”“channel token 可认证脚本”“独立 origin 可替代 sandbox”等过强表述。
- 将判型收敛为结构分析，不再试图静态理解任意脚本行为。
- 将交互源码从 `prototype.html` 拆为 `sandbox.html`，导入审计元数据拆为 `html-import.meta.json`。
- 增加 runtime capability registry、受控执行 wrapper、live/branch 双原子路径和全链路消费者矩阵。
- 将首屏空白与一般 runtime error 从通用硬拒绝降为兼容性状态。
- 将总体估算由 3–5 周调整为 4–6 周，并拆分交互预览与发布/截图闭环。
- 当前只更新方案文档，未修改产品行为或项目长期事实。

### 2026-08-20 目标模式适配

- 将一个巨型实施目标拆为 Phase 0、Phase 1、Phase 2a、Phase 2b 四个依赖明确的阶段目标。
- 为每个阶段补充前置、允许范围、禁止范围、实施顺序、验证命令、退出条件和可复制的 `/goal` 指令。
- 新增覆盖式当前状态账本、恢复入口、自治权限和必须暂停条件。
- 冻结 inline module、blob script、资源、空首帧、旧入口兼容等决策，避免新窗口重复询问。
- 当前 Phase 0 为 `ready_to_start`；本次仍只更新方案文档，没有创建目标或修改产品代码。

### 2026-08-20 Phase 0 合同与安全 spike

#### runtime 消费者矩阵

| 消费者 | 当前事实与默认分支 | `sandboxed-html` 后续接线门禁 |
|---|---|---|
| shared runtime / files | `packages/shared/src/workspace.ts` 只有三种 runtime；`DemoFiles`、`PageSnapshotInput`、`CollabResourceKind` 和 managed resource predicate 没有 sandbox 文件 | Phase 2a 同步增加 union、`sandboxHtml` / `htmlImportMeta`、collab kind；禁止未知 runtime 落入 React |
| project-core inference / CRUD | `utils.ts` 以 sketch → prototype → React 推断；`service.ts` 的 create/read/version/restore/switch/validate/screenshot 多处以 prototype、sketch、else React 分支 | Phase 2a 先引入 registry，再逐项改为穷尽分支；runtime switch 必须清除其他 runtime 源文件 |
| Workspace resource registry | `workspace-resource-registry.ts` 与 shared、agent-service 各自枚举现有页面文件 | Phase 2a 同时登记 `sandbox.html`、`html-import.meta.json`，不能只修改一处 allowlist |
| author-site 文件工具 | `fs-utils.ts`、`workspace-file-utils.ts` 和 canvas content loader 只读写 code/prototype/sketch；未知 runtime 归 React | Phase 2a 增加显式 sandbox 文件读取、推断和 fail-closed 分支 |
| author-site 导入/API | `ImportFromFigmaDialog.tsx` 当前由 UI 编排“创建页后写文件”，通用 HTML 没有单一原子 API | Phase 1 才新增静态导入 application/API；Phase 2a 才接受 sandbox 产物 |
| demo-ui | `preview-stage-resolver.ts` 的 renderer 顺序为 published iframe → prototype → sketch → compiled → author code → empty | Phase 2a 新增独立 `sandbox-html` renderer 与 `SandboxedHtmlFrame`，不复用可信 React 协议 |
| publish manager | `publish-manager.ts` 对 prototype/sketch 显式分支，其余默认 React 编译 | Phase 2b 新增 sandbox manifest/受控执行路径；禁止裸 `sandbox.html` 进入公开静态文件路由 |
| viewer data / adapter | viewer runtime union 只有三种；缺失/未知 runtime 默认 high-fidelity，adapter 只识别 prototype/sketch/compiled iframe | Phase 2b 显式消费 persisted runtime 和 execution URL，不重新判型 |
| screenshot ensure | author ensure route 用 workspace tree 或文件存在性推断三种 runtime，未知分支为 React | Phase 2b 新增 sandbox snapshot input，不得把 sandbox 源码送到 React compile |
| screenshot service | 请求 normalizer 和 hash/render 只有 prototype/sketch/else React；当前同一 Browser 上 `newPage()` + `setContent()` | Phase 2b 增加显式 hash/render 分支、sandbox 专用 BrowserContext 与请求拦截 |
| project-cli | `page create` / `switch-runtime` 转型当前 union；prototype import 路径硬编码 | Phase 1 复用 analyzer；Phase 2a 再开放 sandbox 文件合同，CLI 不复制规则 |
| agent-service | collab allowlist、entry-file 推断、preview validation 和预装 skill 都只识别现有 runtime；未知类型在不同位置分别退到 React 或 prototype | Phase 2a/2b 同步资源类型、完整性检查与 skill；所有未知 runtime 统一 fail-closed |
| diagnostics | event envelope 可扩展，但 payload sanitizer 没有 runtime/policy 字段 | Phase 2b 扩展允许字段与 CLI 展示，不需要新增事件存储模型 |

矩阵的高风险结论是：当前未知 runtime 在不同消费者中会分别落入 React、prototype 或 unmanaged file，不能先增加 union 再依赖默认分支逐步补齐。正式接线必须按上述矩阵分阶段完成，并用 `satisfies Record<DemoPageRuntimeType, ...>` 和穷尽 helper 阻断遗漏。

#### capability registry 冻结设计

- 唯一落点：`packages/shared/src/page-runtime-capabilities.ts`；Phase 2a 与正式 runtime union 同时加入，Phase 0 不提前改变现有 union。
- 唯一表：`PAGE_RUNTIME_CAPABILITIES satisfies Record<DemoPageRuntimeType, PageRuntimeCapabilities>`；消费者只能通过 `getPageRuntimeCapabilities(runtimeType)` 读取，helper 对未知字符串返回结构化错误，不提供默认 runtime。
- 固定字段：`sourceKind`、`sourceFiles`、`supportsScripts`、`supportsVisualEdit`、`supportsConfigBinding`、`previewRenderer`、`screenshotRenderer`、`publishRenderer`。
- 固定 renderer id：prototype=`prototype`，sandbox=`sandbox-html`，React=`react-module`，sketch=`sketch`；renderer id 是内部穷尽分发键，不作为第二个持久化 runtime。
- 迁移顺序：先 shared 类型/registry 编译门禁，再 project-core 与 resource registry，再 author/demo-ui；viewer/publish/screenshot 留到 Phase 2b。旧字符串判断只有在对应消费者接线和测试完成后删除。

#### analyzer 合同、原因码与 fixture

Phase 0 已在 `packages/project-core/src/html-import-contract.ts` 固化并从包入口导出公共合同；`html-import-analysis-spike.ts` 是未从包入口导出、未接写入链路的 parse5 结构分析原型。

- `analysisVersion=1`，`sandboxPolicyVersion=1`。
- 输入上限 2 MiB；单个 data URL 解码后上限 1 MiB；data URL 解码后累计上限 2 MiB，任一超限拒绝整个导入。
- `sourceHash` 是 analyzer 收到的字符串按原样 UTF-8 编码后的 SHA-256，不进行换行、Unicode 或 BOM 二次规范化；`normalizedHash` 对 parse5 序列化后的候选产物按同一算法计算。
- signals 固定为：`classic-script`、`inline-module-script`、`event-handler-attribute`、`javascript-url`、`inert-data-script`、`data-url-resource`。
- unsupported capability 固定为：`external-script`、`external-module-import`、`embedded-browsing-context`、`base-url`、`meta-refresh`、`relative-resource`、`remote-resource`、`form-submission`、`worker`、`service-worker`、`popup`、`download`、`sensitive-permission`、`blob-script`、`data-url-too-large`。
- warnings 固定为：`runtime-error-possible`、`empty-first-frame-possible`、`continuous-animation-possible`、`restricted-api-possible`。
- rejection code 固定为：`HTML_IMPORT_INVALID`、`HTML_IMPORT_TOO_LARGE`、`HTML_IMPORT_EXTERNAL_RESOURCE_UNSUPPORTED`、`HTML_IMPORT_EMBED_UNSUPPORTED`、`HTML_IMPORT_CAPABILITY_RESTRICTED`。交互成功提示和导入后运行失败继续使用第十一章的非拒绝 code。
- 集合稳定排序：signal/unsupported/warning 按 `code → path → detail`；resource 按 `path → attributeName → value`。属性顺序、标签/属性/MIME 大小写不影响判型。
- 静态 `<form>` 因默认提交能力而拒绝；已存在事件/script 信号、必然进入无 `allow-forms` 沙箱的表单联动页面可接受。真实 action/外部资源仍按资源规则拒绝。
- 固定 fixture 共 19 类：静态营销页、details/CSS、classic script、inline module、外部 module import、事件属性、`javascript:`、inert JSON、外部 script、嵌套 iframe、meta refresh、静态 form、沙箱内阻止提交的 form、相对资源、远程资源、data URL、Worker、runtime error、空首帧。另以浏览器 spike 覆盖消息洪泛、导航、网络、权限与同步死循环。

#### 受控 wrapper、独立 origin 与响应合同

- `sandbox.html` 仅是 canonical 源码数据，不注册为公开静态文件 MIME；编辑、viewer、发布与截图都调用同一个 server-safe wrapper/policy builder。
- 浏览器执行 URL 固定为独立 origin 下的 opaque execution id，不接受项目路径或任意 query 映射。反向代理只暴露 execution route，剥离 `Cookie` / `Authorization`，拒绝同 origin 的管理 API。
- 本地使用独立 loopback host/port，Docker 使用独立 service/vhost，正式环境要求 `HTML_SANDBOX_PUBLIC_ORIGIN`；Phase 0 不创建 DNS、不部署。缺少独立 origin 时 publish check fail-closed，不能退回 author/viewer 同源执行。
- route 仅接受 `Sec-Fetch-Dest: iframe` 的浏览器执行请求；顶层 document 请求返回 403/下载响应。`frame-ancestors` 只允许配置的 author/viewer/embed origins。
- wrapper 通过 HTML parser 移除输入 CSP、`base`、meta refresh，再注入固定桥接；输入内容不能拼接或覆盖响应头。响应固定设置第 7.3 节 CSP、Permissions Policy、`Referrer-Policy: no-referrer`、`X-Content-Type-Options: nosniff`、`Cache-Control: no-store`。Phase 0 结论是不启用 COOP/COEP，后续不得把它作为 sandbox 的替代安全边界。
- snapshot sandbox variant 固定包含 `runtimeType`、`sandboxHtml`、最小 `htmlImportMeta`；hash 至少覆盖源码、analysis/policy version、normalized hash、viewport 与 renderer version。
- publish manifest 固定包含 persisted runtime、非公开源码引用、execution path、analysis/policy version、source/normalized hash。只支持能提供受控 execution route 的发布目标；纯静态托管不能裸开 sandbox 源码。

#### 浏览器与拒绝服务实证

本机 Chrome 通过 `scripts/development/html-import-phase0-security-spike.mjs` 验证固定 header CSP 与 `<iframe sandbox="allow-scripts">`：

- 上传页内联脚本可运行，消息 `event.origin` 对应的页面序列化 origin 为 `null`。
- 父 DOM、Cookie、localStorage、`eval`、popup、顶层导航、fetch、Worker 和 microphone policy 均受限；输入自带放宽型 meta CSP 没有覆盖响应头策略；服务端网络探针请求数为 0。
- 父端以 `event.source`、channel/generation、类型、4 KiB、深度和每秒 10 条限制验证消息；错误 source、`APP_ACTION`、错误加载代次、6 KiB 消息和超频消息全部被拒绝。
- 以上结果只证明当前 Chrome 与已覆盖通道，不升级为“绝对断网”、CPU/内存配额或 channel 身份认证承诺。

`scripts/development/html-import-phase0-dos-spike.mjs` 在一次性 BrowserContext 中运行同步死循环：`setContent` 在 protocol deadline 后以 `ProtocolError` 终止，context 在 1.5 秒 host deadline 内成功关闭，总耗时约 4.0 秒，不需要杀进程。因此 Phase 2b 初始方案冻结为“sandbox 专用 Browser 实例 + 每任务独立 BrowserContext”；若 context close 超过 2 秒、Browser 断连或后续恶意 fixture 无法回收，则杀掉并重启该 sandbox 专用进程。sandbox 截图不得与可信 React/prototype 截图共用 Browser 实例。

#### Phase 0 未进入的范围

没有修改 `DemoPageRuntimeType`、Workspace resource/file contract、导入 UI/API、页面创建/写入、正式 iframe renderer、viewer、publish 或 screenshot runtime 分支。`html-import-analysis-spike.ts` 不从 package index 导出，Phase 1 需在其 fixture 约束下完成正式 normalizer、CSS/srcset 等资源覆盖和原子导入。

## 十八、最终验收标准

1. 上传无可执行脚本的单页 HTML，自动创建 `prototype-html-css`，无模式选择。
2. 上传含可执行 script、事件属性或 `javascript:` 的单页 HTML，自动创建 `sandboxed-html`，无模式选择。
3. 非可执行数据 script 不误触发沙箱，也不会进入静态 Shadow DOM 可执行上下文。
4. 交互页不接收宿主秘密、身份、项目配置或业务消息，无法读取父 DOM 和宿主存储。
5. sandbox、CSP、Permissions Policy 和响应头覆盖的请求、权限、顶层导航、弹窗、下载、表单与嵌套上下文按合同受限。
6. 动态子 frame 自导航、runtime error、空首帧和资源超限不会破坏宿主；页面可进入失败占位并恢复。
7. 静态页继续支持现有视觉编辑、配置绑定、批注、截图和发布。
8. 交互页可运行自包含 DOM 事件、timer、动画和 Canvas；画布离屏时不常驻。
9. 编辑、截图、viewer 和发布使用同一 persisted runtimeType、文件协议和 sandbox policy version。
10. live 与 branch 任一分析、gate 或提交失败均不遗留半成品。
11. 所有失败返回稳定原因码和用户可理解提示，不要求用户理解内部 runtimeType。
12. 文档与产品不宣称浏览器 iframe 能提供绝对断网或 CPU/内存强隔离。
