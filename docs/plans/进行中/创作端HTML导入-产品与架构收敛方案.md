# 创作端 HTML 导入：产品与架构收敛方案

> 日期：2026-08-26  
> 状态：方案待确认  
> 范围：产品语义、导入工作台、领域提交、隔离运行时、资源策略、发布与诊断  
> 相关需求：[HTML 导入需求](../../项目文档/创作端/04-配置与预览/HTML导入_需求文档.md)  
> 现有实施记录：[单页面自动判型与交互沙箱方案](./创作端HTML导入-单页面自动判型与交互沙箱方案.md)

## 一、结论

保留现有的双运行时、两阶段导入、统一 presentation 和私有 sandbox 源码；不推翻重做。需要收敛的不是页面渲染方式，而是以下五个边界：

1. 用“运行时”回答如何执行，用独立的“兼容性结果”回答导入质量，两者不再混用。
2. 将 commit 从“前端计算页面树后写文件”收敛为 Workspace Authority 内的幂等领域命令。
3. 为内联、相对和远程资源建立明确策略，不再用一句“可能缺失”概括。
4. 将 sandbox 安全承诺改写为可验证的能力边界，并对独立 origin 做启动期强校验。
5. 导入状态、预览状态、提交状态分开建模，并接入脱敏诊断。

完成 P0/P1 后，该能力可作为长期架构继续演进；资源本地化、ZIP/文件夹导入应放在独立的 P2，不与本次正确性收敛绑定。

## 二、产品定义

### 2.1 用户承诺

产品不承诺“任意网站离线运行”，而是承诺：

> 将单个 HTML 文档导入为可继续管理、预览、截图和发布的页面；尽可能保留其自包含视觉与交互，并在提交前明确告知无法保留的内容。

用户不选择 `prototype-html-css` 或 `sandboxed-html`，这是系统内部决策。用户只需要理解导入质量：

| 结果 | 含义 | 默认动作 |
| :-- | :-- | :-- |
| 完整 | 核心视觉和可识别交互可保留 | 一键导入 |
| 部分兼容 | 页面可显示，但存在将被阻断的资源或能力 | 必须显式确认 |
| 不可导入 | 格式、体积、安全门禁或最小可渲染性不满足 | 禁止提交，给出可操作原因 |

“部分兼容”不是新 runtime，也不改变 runtime 的唯一事实源。它是分析报告中可版本化、可重算的质量结果。
兼容性摘要在导入后仍可从页面详情重新查看，不得只出现在一次性提示中。

默认不在拖入后静默创建页面。唯一例外是已由 `.figma-export` 标记和有效固定尺寸验证的可信 Figma 导出物：用户选择或拖入文件即构成明确导入动作，可直接创建页面；其他高置信度文件仍须在工作台执行“导入”主操作。

### 2.2 产品范围

首期正式支持：

- 自包含 HTML/CSS，以及 data URL 形式的图片、字体和媒体。
- 无脚本的静态原型。
- 只依赖文档内脚本的 Tab、轮播、弹层、动画、timer 和 Canvas。
- 固定 Figma 画板与普通响应式单页面。

允许用户显式确认后降级导入：

- 引用相对路径或远程图片、CSS、字体、媒体。
- 引用外部脚本、模块 import、iframe、Worker、后端 API、真实表单提交、弹窗或下载。

上述能力在首期必须默认阻断，工作台应展示影响数量、位置和修复方向。如果阻断会使页面无可见内容或主要内容不可辨识，结果应为“不可导入”，而不是用无意义的成功页面污染项目。

### 2.3 资源策略

| 资源 | P0/P1 处理 | 工作台呈现 | P2 演进 |
| :-- | :-- | :-- | :-- |
| 文档内联文本/CSS/JS | 保留，按 runtime 执行 | 不额外打扰 | 继续保留 |
| `data:` 图片/字体/媒体 | 在大小上限内保留 | 显示体积摘要 | 可转为项目资产 |
| `blob:` | 默认阻断 | 高风险提示 | 只在明确威胁模型下评估 |
| 相对路径 | 单文件模式无法解析，阻断 | 指明路径与元素位置 | ZIP/文件夹导入并重写 |
| 远程图片/CSS/字体/媒体 | 默认阻断 | 按类型汇总及逐项展开 | 用户授权后的受控本地化 |
| 外部 JS/module | 阻断 | 说明交互可能失效 | 不与普通资源代理混用，单独审查 |
| iframe/API/表单/Worker/下载 | 阻断 | 说明隔离原因 | 按能力单独建模，不设默认开关 |

资源本地化不应在用户选择文件后默默发生。它涉及 SSRF、类型伪装、重定向、授权与版权，必须是可审计的独立步骤。

### 2.4 产品指标

- 已判定“完整”的页面，导入后首屏可见成功率≥99%。
- 已判定“部分兼容”的页面，导入前必须告知所有高影响阻断项。
- 重试、双击或网络超时不得创建重复页面。
- 并发导入不得丢失页面树、产生孤儿目录或覆盖其他修改。
- 所有导入结果必须在诊断中以脱敏结构化事件结束。

## 三、交互方案

### 3.1 工作台信息架构

采用宽版三区主从布局，预览区获得最大空间：

```text
┌ 导入 HTML ───────────────────────────────────┐
│ 文件队列           │ 安全预览               │ 分析与设置       │
│ 名称·主状态·副标记 │ 视口·缩放·重载         │ 页面名称·默认视口   │
│ 追加、移除、重选     │ ready/incomplete/error │ 兼容性摘要·逐项详情 │
├──────────────────────────────────────────┤
│ 已就绪 n  需确认 n  不可导入 n        [取消] [导入可导入项] │
└──────────────────────────────────────────┘
```

普通导入不展示“静态/沙箱”选择。仅在兼容性详情中用用户语言说明“脚本将在隔离环境运行”。

### 3.2 单文件状态机

```text
queued
  → analyzing
      → ready
      → needs_confirmation
      → blocked
ready / needs_confirmation
  → committing
      → succeeded
      → retryable_failure
      → terminal_failure
queued / analyzing / ready / needs_confirmation / retryable_failure
  → cancelled
prepared states
  → expired
```

实现上不存储一个不断膨胀的综合 `status`，而是分开保存四条状态轴：

| 状态轴 | 典型值 | 职责 |
| :-- | :-- | :-- |
| 准备 | queued / preparing / prepared / rejected / expired / cancelled | 文件与 draft 是否可用 |
| 确认 | not-required / required / confirmed / invalid | 名称、视口和重要限制是否已确认 |
| 预览 | unavailable / loading / ready / incomplete / runtime-error / timeout / ticket-expired | 安全预览健康状态 |
| 提交 | not-started / queued / committing / succeeded / retryable-failure / terminal-failure | Workspace 变更结果 |

列表主状态由四条状态轴推导，不反向写回。预览失败不能覆盖导入分析结果；预览成功或任一终态到达后必须取消 timeout，旧 generation 的计时器和消息不得覆盖新状态。

### 3.3 用户流程

1. 用户选择或拖入一个/多个 HTML，系统立即列出每个文件。
2. 各文件独立分析，列表可持续操作，不因单个大文件阻塞整体。
3. 默认选中第一个需要处理的文件；详情区展示推荐视口、预览、保留能力和阻断项。
4. 完整且高置信度项可直接就绪；部分兼容项要求勾选“我知道以上内容将不可用”；系统不在用户未确认时静默创建页面。
5. 批量提交只处理 ready 或已确认项。成功项保留，失败项留在工作台并显示可重试原因。
6. 完成后展示成功、失败、跳过数；单个成功时打开该页面，批量成功时保持当前上下文并提供“查看新页面”。

关闭或移除文件时，前端可立即退出，但服务端必须以 session-scoped cleanup + TTL 作为真正清理保证，不将正确性寄托在页面卸载时的网络请求。

### 3.4 视觉与可用性规则

- 采用编辑器现有中性工具风格，不新建一套高彩度语言。
- 结果优先使用文字+图标，颜色仅作辅助；正文对比度至少 4.5:1。
- 所有文件行、展开项、视口控件和底部按钮支持键盘聚焦与明确 focus ring。
- 分析与提交进度向辅助技术公告；批量结果使用 `aria-live` 的简短摘要，避免逐帧噪声。
- hover/focus/pressed 状态保持 150–200ms 轻量过渡，并遵守 `prefers-reduced-motion`。
- 宽度不足时转为页签或上下分区，不将多栏压缩到无法阅读；至少验证 375、768、1024 和 1440 宽度。

## 四、目标技术架构

### 4.1 边界与 owner

| 领域 | 唯一 owner | 职责 |
| :-- | :-- | :-- |
| 分析与规范化 | `project-core` | 版本化分析、runtime 判型、资源/能力报告、哈希 |
| runtime 能力 | `shared` capability registry | canonical 文件、编辑、预览、截图、发布能力与 fail-closed |
| draft 生命周期 | author service | 归属、TTL、预览 ticket、取消、提交收据 |
| 提交一致性 | Workspace Authority | 当前 revision 内分配 page/route/order，原子写入页面树与文件 |
| sandbox 策略 | author execution service | origin 校验、ticket、执行文档、CSP、诊断 |
| 渲染 | `demo-ui` resolver | 仅消费 capability 决策与 execution URL，不重新判型 |
| 截图 | screenshot service | 独立浏览器任务、断网、超时和有界清理 |
| 发布/viewer/embed | publish + viewer | 私有源、manifest 复验、动态 ticket，不公开 raw HTML |

其他入口（UI、CLI、Agent）只做协议适配，不复制分析、runtime 或安全规则。

### 4.2 分析合同

分析结果分成四个正交维度：

```ts
interface HtmlImportAnalysis {
  analysisVersion: number;
  runtimeType: "prototype-html-css" | "sandboxed-html";
  compatibility: "complete" | "degraded" | "blocked";
  presentationRecommendation: HtmlImportPresentationRecommendation;
  capabilities: CapabilityFinding[];
  resources: ResourceFinding[];
  sourceHash: string;
  normalizedHash: string;
}
```

- `runtimeType` 只决定执行方式。
- `compatibility` 决定产品流程和是否要求确认。
- presentation 只决定默认展示，不参与 runtime 判型。
- capabilities/resources 是可解释证据，不变成第二个 runtime 事实源。

普通外链图片、CSS、字体或缺失的相对资源只影响 resource/compatibility，不能单独将页面切换为 `sandboxed-html`。只有脚本、事件、JavaScript URL 等需要可执行隔离的能力决定 sandbox runtime，避免 runtime 变成承接所有兼容问题的“杂物箱”。

`html-import.meta.json` 可保留 analysis/policy/resource-policy 版本、原始与规范化哈希以及脱敏兼容性摘要；不保留 presentation、raw URL 全量、runtime 副本或用户 HTML。规范化 HTML 和本地化资源进入私有内容寻址 Artifact Store，draft 只保存 `artifactRef + normalizedHash`，不在 draft 和 execution ticket 中重复整份源码。

### 4.3 draft 与幂等提交

draft 为服务端状态机：

```text
prepared → committing → committed
    └────────→ cancelled
    └────────→ expired
committing → prepared     # 可重试失败
```

每个 draft 在 prepare 时生成稳定的 `commitKey`，但不在 Authority 之外预算最终 page id/order/route。commit 必须变为 Authority 领域命令：

```text
commit_html_import_draft(
  commitKey,
  workspaceId,
  sessionId,
  requestedName,
  parentId,
  normalizedSourceReceipt,
  analysisContract,
  presentation
)
```

Authority 在串行区内：

1. 读取当前 workspace revision 和页面树。
2. 重新校验 draft 归属、源码 receipt、分析版本、哈希和 presentation 组合。
3. 基于当前树分配 page id、routeKey 和 order。
4. 在一个原子提交中写 canonical runtime 文件、meta、Schema 和页面树。
5. 以 `commitKey` 保存 receipt，包含 page id 和 committed revision。
6. 相同 `commitKey` 的双击、并发请求或超时重试返回同一 receipt，不再执行。

非 live workspace 不得继续使用无版本的整仓目录 swap 作为并发提交。可选方案是复用同一领域命令、引入 workspace revision/CAS 锁，或明确将该路径限定为单写者。

### 4.4 presentation 不变量

- `$demo.presentation` 继续是持久化唯一真值。
- 画布几何、单页临时设备、导入推荐不得互相回写。
- 服务端验证不仅检查字段范围，还要检查语义组合：高置信固定画板允许 `fixed-canvas + fixed`；普通 HTML 默认 `responsive-page + content`。
- 如果产品允许用户改变 mode/heightBehavior，必须在需求中显式定义，不能只因 API 当前接受任意合法组合而偶然成立。

### 4.5 sandbox 安全合同

可对外承诺：

- 导入页不获得 author/viewer 同源权限、Cookie、Storage、宿主 Session 或业务消息。
- iframe 不获得表单提交、弹窗、下载、Worker、嵌套 frame、顶层导航等 sandbox 能力。
- 当前执行文档的 CSP 阻断 connect 和非允许资源。
- 源码不通过稳定公开静态 URL 暴露，执行 URL 是短时、不透明的 bearer URL。

不应承诺：

- 浏览器 iframe 对 CPU/内存的硬隔离。
- 源码对有权查看该页面的用户保密；用户可在 DevTools 中观察已获取文档。
- 阻断所有 iframe 自身导航尝试。当脚本使子 frame 离开受控执行文档时，宿主应将其判定为“已离开导入页”并提供重载，不宣称绝对零出站。

启动和健康检查必须验证：

- sandbox 使用 HTTPS（本地开发例外）。
- sandbox origin 不等于 author、viewer、embed 任一 trusted origin。
- sandbox 不处在会被宿主宽 `Domain` Cookie 覆盖的边界内。
- `frame-ancestors` 是结构化 allowlist，不接受任意原始字符串。
- 未满足上述条件时，sandbox 预览和发布 fail-closed。

ticket 长期应保存 source reference、audience、policy version、TTL 和有界使用信息，而不在每张票据中复制整份 HTML。`Sec-Fetch-Dest: iframe` 是防误用信号，不是身份认证。

### 4.6 发布、viewer 与 embed

- resolver 首先根据 runtime capability registry 决策，不允许“有 iframe URL 就优先渲染”。
- sandbox 页面的公开 manifest 只包含 presentation、renderer、policy version 和脱敏摘要。
- viewer/embed 服务端校验 project/version/page/source hash/policy 后动态签发 ticket。
- 发布验证明确拒绝 sandbox 页面出现稳定公开 `iframeHtmlPath`、raw source path 或其他可绕过 execution service 的字段。

### 4.7 诊断

建立一条不包含 HTML 原文、raw URL、draft id 或 ticket 的诊断链：

```text
import.prepare.started/completed/failed
import.commit.started/completed/failed/idempotent_replay
sandbox.preview.ready/incomplete/runtime_error/timeout/left_document
sandbox.request.blocked
sandbox.screenshot.completed/failed/context_cleanup
sandbox.execution.issued/expired/revoked
```

事件只携带 runtime、analysis/policy version、能力/资源计数、耗时、错误码、不可逆 ID 摘要和 cleanup 结果。每个请求都必须以成功、失败、取消或超时终结。

## 五、分阶段交付

### P0：正确性与安全合同

- [x] 将 HTML commit 收敛为 Authority 内的幂等领域命令。
- [x] 并发、双击、超时重试、同名页面和文件夹冲突用例通过。
- [x] commit 重新验证源码 receipt、规范化哈希、分析版本与 runtime 结果。
- [x] 修复 sandbox preview 终态与 timeout 相互覆盖。
- [x] 启动期验证 sandbox origin/frame ancestor/cookie 边界。
- [x] 修正需求对网络、导航和源码私密性的过度承诺。
- [x] 统一使用端 resolver 文档与 capability registry。

退出条件：数据不丢失、提交可幂等、生产错误配置 fail-closed、安全合同可由浏览器测试证明。

### P1：产品语义与工作台

- [x] 分析合同新增 complete/degraded/blocked 兼容性结果。
- [x] 按资源策略输出类型、影响和可修复建议。
- [x] 工作台将文件、预览、分析、确认和提交状态分开呈现。
- [x] 实现部分兼容显式确认和最小可渲染性拒绝。
- [x] 诊断覆盖 prepare/commit/preview/screenshot/execution 终态。
- [x] 按 runtime capability matrix 收敛预览系统需求，明确 sandbox 不支持配置绑定和视觉编辑。

退出条件：用户在提交前能准确回答“会保留什么、会丢失什么、导入后如何显示”，且批量部分失败可恢复。

### P2：资源完整性

- [x] 设计 ZIP/文件夹 bundle 协议，安全解包并重写相对资源。
- [x] 评估远程静态资源的用户授权本地化，包含 SSRF、redirect、MIME、大小和许可策略。
- [x] 建立内容寻址的项目资产引用，避免每页重复资源。
- [x] 对“外部 JS”保持独立产品和安全评审，不随静态资源本地化默认开放。

退出条件：资源导入是显式、可审计、可限额、可取消的独立过程，不扩张 sandbox 宿主权限。

## 六、验证方式

### 产品与交互验收

- 自包含静态 HTML、自包含交互 HTML、远程图片、相对 CSS、外部 JS、空页面、运行错误和超大 data URL 八类样本均有可预期结果。
- 键盘、读屏、缩放、低宽布局、减少动画和非颜色状态区分通过。
- 批量中混合完整、部分兼容、拒绝与提交失败项时，总结和重试结果准确。

### 一致性验收

- 同一 draft 并发 10 次 commit 只产生一个页面和一张 receipt。
- 不同 draft 并发提交不丢失页面、routeKey/order 不冲突、不产生孤儿目录。
- commit 超时后以同一 commitKey 重试，返回已提交 receipt。
- draft 过期、取消、Session 失效、Workspace 变更、分析版本失效均 fail-closed。

### 安全验收

- 同源配置、非 HTTPS 生产 origin、过宽 frame ancestor 在启动或健康检查中失败。
- Cookie、Storage、parent DOM、host message、connect、form、popup、download、worker、nested frame 用例均有浏览器回归。
- self-navigation 用例验证产品如实显示“已离开导入页”，不写成“网络绝对被阻断”。
- 公开 manifest、诊断、日志、错误和导出包不包含 HTML 原文、ticket、draft id 或 raw URL。

### 工程验收

- 分析合同、runtime registry、Authority、author、demo-ui、screenshot、viewer/embed 的包级检查通过。
- HTML sandbox 浏览器回归纳入正式 `test/` 套件，不只依赖开发脚本。
- 诊断完整性字段能证明每次 prepare/commit/preview/screenshot 的终态。

## 七、风险与待确认事项

1. **最小可渲染性判断**：建议将“没有可见内容”作为阻断条件，但不使用像素级视觉相似度作为导入硬门禁。
2. **降级导入的权限**：建议允许普通用户显式确认，但只要命中安全硬拒绝就不提供绕过按钮。
3. **远程资源本地化**：建议作为 P2 显式能力，不在 P1 导入过程中自动开网。
4. **外部脚本**：建议长期仍不跟随静态资源自动本地化；如果产品将来确实需要，应进入新 runtime/新威胁模型评审。

## 八、进度记录

- 2026-08-26：完成需求、实现、安全和关联文档的只读架构评审；确认现有双 runtime、两阶段导入与私有发布源方向可保留。
- 2026-08-26：形成本收敛方案，待确认后从 P0 开始实施。
- 2026-08-26：完成 Authority 内 HTML import command、稳定 commitKey receipt、并发页面树分配和 non-live fail-closed；覆盖同 key 重放、原始源码 receipt 篡改拒绝、不同 draft 并发、同名路由以及有效/缺失文件夹。
- 2026-08-26：完成 runtime/compatibility 分离、部分兼容确认、最小可渲染性门禁、私有 artifactRef、sandbox origin/CSP/导航终态与工作台四状态轴基础；受限资源现按分类、影响和安全建议呈现。截图/执行全链路诊断和发布路径仍待收敛。
- 2026-08-26：预览 resolver 已改为使用共享 runtime capability registry，未知 runtime fail-closed；sandbox 的配置绑定与视觉编辑能力均由该 registry 显式关闭。工作台 sandbox 预览状态已写入编辑页脱敏诊断；截图服务完成回调与 execution 票据终态仍待补齐。
- 2026-08-26：截图请求现仅在 screenshot-service 返回有效 batch receipt 后记录 queued，并以不可逆 batch 摘要关联诊断；服务间的最终 completed/failed 回调仍待设计。
- 2026-08-26：screenshot-service 以认证回调写入 batch completed/failed；execution ticket 在撤销和过期时以私有上下文写入 revoked/expired。所有诊断只保留哈希、计数和错误摘要。
- 2026-08-26：project-core 新增 ZIP/文件夹 bundle 规范化：惰性 ZIP 遍历、加密/路径穿越/重复/数量/声明体积与实际体积门禁、唯一 index 入口和相对资源 data URL 重写；输出的资源列表使用 SHA-256 内容引用。
- 2026-08-26：project-core 新增项目私有 HtmlImportAssetStore：按内容 SHA-256 落在 assets/html-import，重复内容只写一次，并按 committed 可达哈希集合安全回收。
- 2026-08-26：可信 Figma 导出物现以 `.figma-export` 标记与有效固定宽高为唯一判据，分析结果持久化来源资格；prepare、工作台和 commit 复用同一确认决策，且不放宽外链/相对资源的阻断策略。
- 2026-08-26：入口接入层改为先 prepare 再分流：可信 Figma 导出物直接 commit 并创建页面，不展示工作台；普通 HTML 撤销预判 draft 后进入原工作台。直接提交失败会清理 draft，受限资源继续阻断并在成功提示中汇总。
