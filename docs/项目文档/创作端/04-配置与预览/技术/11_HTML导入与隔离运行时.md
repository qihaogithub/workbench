---
covers:
  - packages/shared/src/page-runtime-capabilities.ts
  - packages/shared/src/workspace.ts
  - packages/shared/src/index.ts
  - packages/shared/src/demo/page-presentation.ts
  - packages/project-core/src/html-import-contract.ts
  - packages/project-core/src/html-import.ts
  - packages/shared/src/workspace-path.ts
  - packages/project-core/src/service.ts
  - packages/author-site/src/app/api/projects/[projectId]/imports/html/prepare/route.ts
  - packages/author-site/src/app/api/projects/[projectId]/imports/html/commit/route.ts
  - packages/author-site/src/app/api/projects/[projectId]/imports/html/cancel/route.ts
  - packages/author-site/src/app/api/projects/[projectId]/demos/[demoId]/html-execution/route.ts
  - packages/author-site/src/app/api/html-sandbox/executions/[executionId]/route.ts
  - packages/author-site/src/lib/html-sandbox-execution.ts
  - packages/author-site/src/lib/html-import-draft.ts
  - packages/author-site/src/lib/publish-manager.ts
  - packages/author-site/src/components/demo/ImportFromFigmaDialog.tsx
  - packages/author-site/src/components/demo/DemoPageTree.tsx
  - packages/author-site/src/app/demo/[id]/edit/page.tsx
  - packages/author-site/src/components/demo/HtmlFileDropZone.tsx
  - packages/author-site/src/components/demo/useScreenshotGeneration.ts
  - packages/demo-ui/src/SandboxedHtmlFrame.tsx
  - packages/demo-ui/src/PreviewCanvas.tsx
  - packages/demo-ui/src/SinglePagePreview.tsx
  - packages/demo-ui/src/PreviewStage.tsx
  - packages/demo-ui/src/html-import-clipboard.ts
  - packages/demo-ui/src/canvas-render-scheduler.ts
  - packages/demo-ui/src/sandboxed-html-protocol.ts
  - packages/screenshot-service/src/utils/sandbox-browser-runner.ts
  - packages/viewer-site/src/lib/api.ts
  - packages/viewer-site/src/lib/preview-stage-adapter.ts
  - packages/project-cli/src/index.ts
  - scripts/migrate-page-presentation.mjs
---

# HTML 导入与隔离运行时

> 更新日期：2026-08-27 当前范围：自动判型、尺寸确认、两阶段导入与可执行 HTML 隔离运行时 v2

## 1. 运行时能力注册表

页面运行时由共享 capability registry 统一声明，而不是由各入口自行判断。当前注册四类运行时：`prototype-html-css`、`sandboxed-html`、`high-fidelity-react` 和 `sketch-scene`。注册表同时定义来源文件、编辑能力、创作端预览 renderer、截图 renderer 和发布 renderer；未知运行时 fail-closed，不能通过默认分支进入渲染或发布。

HTML 导入分析器只负责确定输入属于静态原型还是需要隔离的 HTML，并返回固定版本、资源信号、受限能力和哈希。格式无效、输入过大或 data URL 超限才拒绝；外部/相对资源、嵌入页、表单、Worker 等其余受限能力会强制页面进入 sandbox，并在导入结果中逐项提示。它不推测 JavaScript 业务意图，也不把执行能力误降级为静态页。静态页继续遵循[配置与预览模块的原型规则](../预览系统_需求文档.md)；交互页使用本文件定义的 sandbox 链路。

导入生成的 `pageId` 使用共享 Workspace 路径段契约：允许中文等 Unicode 字符，但拒绝空值、`.`/`..`、路径分隔符、控制字符和孤立代理项。页面 ID 是磁盘目录与 Authority 资源路径的一部分，展示路由另使用稳定 `routeKey`；导入、创建、扫描、上传、Agent 页面工具和预览路由不得各自维护 ASCII 正则。

## 2. 文件与哈希合同

交互页的 canonical page 目录包含 `sandbox.html`、`html-import.meta.json` 和 `config.schema.json`；项目页面树单独持久化。页面元数据中的 `runtimeType` 为 `sandboxed-html`，`sourceHash` 是原始输入哈希，`normalizedHash` 是归一化源码哈希；二者不能混用。`html-import.meta.json` 和 `prototype.meta.json` 只保留来源判定与审计信息，不再提供展示尺寸。

静态原型使用 `prototype.html`、`prototype.css`、`prototype.meta.json`，React 和草图运行时沿用各自的 canonical 文件。运行时切换先校验目标产物，再原子替换目标文件并删除旧运行时文件；混合或未知文件集合会被拒绝。

## 3. 导入、保存与编辑预览

导入 API、CLI 和 project-core 共用分析与归一化入口，创作端则使用 `prepare` 和 `commit` 两阶段协议。`prepare` 验证用户、项目、Session 和 Workspace，分析运行时与尺寸信号，然后写入绑定当前上下文、有限时的私有 draft；该阶段不创建页面、不修改 Workspace。响应返回分析摘要、置信度、推荐 presentation、是否必须确认和独立 sandbox execution URL。

`commit` 重新校验 draft 归属、TTL、Session、Workspace、原始输入哈希与归一化源码哈希。原始 HTML 先以 Authority 暂存收据提交；Authority 在串行区再次分析它、验证 runtime 与哈希，再在同一次 mutation 中写入规范化后的运行时文件、页面 Schema 中的 presentation 和页面树。每个文件原子提交；批量失败不回滚成功项，失败 draft 保留供重试。`cancel` 和 TTL 清理同时撤销 execution ticket 与私有源码引用。

导入分析会把来源资格与兼容性分开保存。只有 `.figma-export` 标记和有效固定画板尺寸同时成立的 HTML 才记为可信 Figma 导出物。页面树文件选择、预览区拖入，以及画布或单页面预览根容器的剪贴板 HTML 都会先进行 prepare：可信 Figma 直接以该 draft 的推荐展示配置 commit，不挂载工作台；普通 HTML 会撤销预判 draft 后交给工作台重新准备。画布只在原生粘贴事件中处理内部节点/页面剪贴板；单页面预览在空白容器获得焦点后使用同一套 HTML 提取器。二者都不抢占输入控件和 iframe 内部事件，因此系统 HTML 与文件优先进入导入分流，残留的内部剪贴板不会抢占它。这样接入层像分流闸门，只有可信 Figma 走直达通道，其他 HTML 仍完整保留预览、设置、确认和重试体验。直接提交失败会撤销 draft 并给出错误提示；含受限资源的成功项会提示数量，但资源仍依既有策略被阻断。其他页面的数字 viewport 属于中置信度；`device-width`、响应式或冲突信号属于低置信度，推荐 `1440×900` 电脑视口，且仍需要确认。移除文件、取消工作台或 draft 过期都会清理私有状态。

`$demo.presentation` 是持久化展示的唯一真值：固定 Figma 画板使用 `fixed-canvas + fixed`，普通 HTML 使用 `responsive-page + content`。视口预设为电脑 `1440×900`、平板 `768×1024`、手机 `390×844`，自定义宽高经共享边界校验。单页预览直接使用已保存的 presentation；画布卡片几何独立持久化，不反向改写 presentation。

单页与画布预览都以 execution URL 和 channel ID 创建 `allow-scripts` 的隔离 iframe；画布不得把交互 HTML 落入 React 代码预览。画布截图只是性能层，截图尚未生成或生成失败时仍由该 iframe 显示页面内容。

创作端单页预览不会把 sandbox 源码直接作为父页面 HTML，也不会让 iframe 继承创作端 origin。服务端为每次加载签发不透明 execution ticket：默认有效期 5 分钟，ticket 只在独立 sandbox origin 下通过 iframe-only GET 读取；响应使用 CSP、Permissions-Policy、`Referrer-Policy: no-referrer`、`Cache-Control: no-store`，且禁止顶层导航。iframe 仅使用 `sandbox="allow-scripts"`，不开放同源、表单、弹窗、下载、指针锁定等能力。

父子页面只通过固定 channel、随机 channelId 和 load generation 的 `postMessage` 协议交换 READY、尺寸和受限错误信息。父页面严格检查 `source`、channel、generation、消息深度、消息大小和频率；不接受配置写回、任意动作或源码请求。编辑页画布将 `sandboxed-html` 纳入与 React 页共用的有界 iframe 运行池：有截图时可作为性能层展示；截图缺失、失败或尚未生成时，当前可运行页使用同一张受控 execution iframe 显示内容。页面离开运行池后按既有截图/加载规则回收，绝不以原始 HTML 作为 iframe 地址。

上述边界降低了页面对宿主的权限，但浏览器 sandbox 不是绝对安全边界：实现不承诺绝对断网、CPU/内存硬隔离，也不宣称能够阻止任意脚本消耗资源。运行时错误、超时和上下文关闭必须结束为结构化失败状态并写入脱敏诊断。

## 4. 截图链路

截图服务对 `sandboxed-html` 使用专用 Chromium 渲染器。每个截图任务新建独立浏览器上下文，按同一份归一化 HTML 和元数据校验输入，在任务超时、页面错误或取消时关闭 context/page；清理有界，必要时强制终止浏览器进程，不能让失控页面拖住后续任务。

截图 hash 包含完整 presentation，不只包含宽高；修改 mode、height behavior、preset 或默认视口后旧截图必然失效。响应式 `content` 页按完整内容截图，固定 `fixed` 画板保持视口高度。sandbox 输入还包含归一化 HTML、`htmlImportMeta`、运行时类型和 `sandboxRendererVersion`。服务端再次验证策略版本和哈希；诊断不记录 execution ticket、draft ID、HTML 原文或用户代码。

完整的截图状态、hash 寻址、旧图淘汰和实时预览回退规则见[截图服务与预览快照机制](./07_截图服务与预览快照机制.md)。

## 5. 发布、使用端与嵌入

发布前由 capability registry 判断运行时，并再次读取 canonical sandbox 文件、归一化源码和元数据。发布的 `project.json` 携带每页 presentation、renderer、策略版本、元数据摘要和受控 execution path，不包含源码；归一化源码及服务端 manifest 放在私有发布源中。viewer 和 embed 都使用同一 presentation resolver 设置默认 iframe 视口，不从导入 meta 或画布卡片尺寸反推。

发布后的 viewer 或 author-site 嵌入 viewer 只能通过服务端动态签发短时 opaque ticket 获取执行文档。签发前校验项目、版本、页面、私有 manifest、sourceKey、源码哈希和策略版本；ticket 失效、来源未配置或 manifest 不一致时 fail-closed。浏览器端数据接口不返回 raw sandbox HTML，也不能把私有 source path 当作公开资源 URL。

使用端与嵌入 viewer 对 sandbox 只开放 `allow-scripts`，不向页面发送 React 专用 `UPDATE_CONFIG` 或任意 host action 消息；用户配置编辑不适用于 sandbox。发布源必须配置独立的 `HTML_SANDBOX_PUBLIC_ORIGIN`，未配置时不允许正式发布交互页。

使用端的 renderer 选择与动态签发细节见[使用端预览架构](../../../使用端/02-预览与配置/技术/01_架构设计.md)；发布资源与项目状态的通用语义见[发布资源本地化](../../03-项目管理/技术/12_发布资源本地化.md)。

## 6. CLI 与诊断

`ow page create`、`ow page switch-runtime` 和 `ow project validate-runtime` 接收 `sandboxHtml` 与 `htmlImportMeta`，但不复制判型、归一化或安全规则；CLI 只做 JSON 参数适配，最终校验仍在 project-core。发布 CLI 复用服务端发布链路，不能把 sandbox 源码作为普通静态资源上传。

诊断允许记录 runtime type、policy version、renderer、executionIdHash、blockedRequestCount、timeout、contextClosed 和 browserRestarted 等有限字段。execution ID 只保留不可逆摘要，原始 ticket、源码和用户输入不得进入 SQLite、JSONL、错误消息或导出包。查询与导出入口见[诊断与日志模块](../../11-诊断与日志/)。

## 7. 验证边界

project-core 测试覆盖判型、归一化、哈希合同、文件集合、原子写入、运行时切换和 fail-closed；demo-ui 测试覆盖 channel、generation、消息大小/深度/速率；author-site 与 screenshot-service 测试覆盖 ticket、CSP、发布 manifest、专用 Chromium 任务和超时清理；viewer/embed 测试覆盖动态签发、无源码响应和 `allow-scripts` 边界。浏览器回归测试验证脚本、事件、timer、canvas 能运行，同时验证网络、导航、弹窗、下载、表单、跨协议消息和卸载占位等拒绝行为。
