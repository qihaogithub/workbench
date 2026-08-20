---
covers:
  - packages/shared/src/page-runtime-capabilities.ts
  - packages/shared/src/workspace.ts
  - packages/shared/src/index.ts
  - packages/project-core/src/html-import-contract.ts
  - packages/project-core/src/html-import.ts
  - packages/project-core/src/service.ts
  - packages/author-site/src/app/api/projects/[projectId]/imports/html/route.ts
  - packages/author-site/src/app/api/projects/[projectId]/demos/[demoId]/html-execution/route.ts
  - packages/author-site/src/app/api/html-sandbox/executions/[executionId]/route.ts
  - packages/author-site/src/lib/html-sandbox-execution.ts
  - packages/author-site/src/lib/publish-manager.ts
  - packages/author-site/src/components/demo/ImportFromFigmaDialog.tsx
  - packages/author-site/src/components/demo/useScreenshotGeneration.ts
  - packages/demo-ui/src/SandboxedHtmlFrame.tsx
  - packages/demo-ui/src/sandboxed-html-protocol.ts
  - packages/screenshot-service/src/utils/sandbox-browser-runner.ts
  - packages/viewer-site/src/lib/api.ts
  - packages/viewer-site/src/lib/preview-stage-adapter.ts
  - packages/project-cli/src/index.ts
---

# HTML 导入与隔离运行时

> 更新日期：2026-08-20
> 当前范围：单页面自动判型、静态原型导入与可执行 HTML 隔离运行时 v1

## 1. 运行时能力注册表

页面运行时由共享 capability registry 统一声明，而不是由各入口自行判断。当前注册四类运行时：`prototype-html-css`、`sandboxed-html`、`high-fidelity-react` 和 `sketch-scene`。注册表同时定义来源文件、编辑能力、创作端预览 renderer、截图 renderer 和发布 renderer；未知运行时 fail-closed，不能通过默认分支进入渲染或发布。

HTML 导入分析器只负责确定输入属于静态原型还是可执行 HTML，并返回固定版本、稳定原因码、资源信号和哈希。它不推测 JavaScript 业务意图，也不把执行能力误降级为静态页。静态页继续遵循[配置与预览模块的原型规则](../预览系统_需求文档.md)；交互页使用本文件定义的 sandbox 链路。

## 2. 文件与哈希合同

交互页的 canonical page 目录包含四个文件：`sandbox.html`、`html-import.meta.json`、`config.schema.json` 和 `tree.json`。页面元数据中的 `runtimeType` 为 `sandboxed-html`，`html-import.meta.json` 的 `sourceHash` 是用户原始输入字节的哈希，`normalizedHash` 是写入 `sandbox.html` 的归一化源码哈希；二者不能混用。归一化、分析、元数据生成和页面树写入由同一事务完成，失败不留下半页。

静态原型使用 `prototype.html`、`prototype.css`、`prototype.meta.json`，React 和草图运行时沿用各自的 canonical 文件。运行时切换先校验目标产物，再原子替换目标文件并删除旧运行时文件；混合或未知文件集合会被拒绝。

## 3. 导入、保存与编辑预览

导入 API、文件保存 API、CLI 和 project-core 共用同一分析与归一化入口。live Workspace 的写入通过一次 Authority mutation，branch Workspace 通过 staging 后原子提交。分析、gate、元数据一致性或写入任一环节失败，当前页面和页面树保持原样。

创作端单页预览不会把 sandbox 源码直接作为父页面 HTML，也不会让 iframe 继承创作端 origin。服务端为每次加载签发不透明 execution ticket：默认有效期 5 分钟，ticket 只在独立 sandbox origin 下通过 iframe-only GET 读取；响应使用 CSP、Permissions-Policy、`Referrer-Policy: no-referrer`、`Cache-Control: no-store`，且禁止顶层导航。iframe 仅使用 `sandbox="allow-scripts"`，不开放同源、表单、弹窗、下载、指针锁定等能力。

父子页面只通过固定 channel、随机 channelId 和 load generation 的 `postMessage` 协议交换 READY、尺寸和受限错误信息。父页面严格检查 `source`、channel、generation、消息深度、消息大小和频率；不接受配置写回、任意动作或源码请求。编辑页画布使用截图或占位状态，避免保留大量可执行 iframe。

上述边界降低了页面对宿主的权限，但浏览器 sandbox 不是绝对安全边界：实现不承诺绝对断网、CPU/内存硬隔离，也不宣称能够阻止任意脚本消耗资源。运行时错误、超时和上下文关闭必须结束为结构化失败状态并写入脱敏诊断。

## 4. 截图链路

截图服务对 `sandboxed-html` 使用专用 Chromium 渲染器。每个截图任务新建独立浏览器上下文，按同一份归一化 HTML 和元数据校验输入，在任务超时、页面错误或取消时关闭 context/page；清理有界，必要时强制终止浏览器进程，不能让失控页面拖住后续任务。

截图 hash 的输入至少包含 sandbox HTML、`htmlImportMeta`、预览尺寸、运行时类型和 `sandboxRendererVersion`。服务端再次验证 `sandboxPolicyVersion`、原始哈希格式与归一化哈希，拒绝伪造或过期元数据。截图完成、运行时失败、上下文关闭和浏览器重启等事件只记录脱敏摘要，不记录 execution ticket、HTML 原文或用户代码。

完整的截图状态、hash 寻址、旧图淘汰和实时预览回退规则见[截图服务与预览快照机制](./07_截图服务与预览快照机制.md)。

## 5. 发布、使用端与嵌入

发布前由 capability registry 判断运行时，并再次读取 canonical sandbox 文件、归一化源码和元数据。发布的 `project.json` 只包含 renderer、策略版本、元数据摘要和受控 execution path，不包含源码；归一化源码及服务端 manifest 放在数据目录之外的私有发布源中。

发布后的 viewer 或 author-site 嵌入 viewer 只能通过服务端动态签发短时 opaque ticket 获取执行文档。签发前校验项目、版本、页面、私有 manifest、sourceKey、源码哈希和策略版本；ticket 失效、来源未配置或 manifest 不一致时 fail-closed。浏览器端数据接口不返回 raw sandbox HTML，也不能把私有 source path 当作公开资源 URL。

使用端与嵌入 viewer 对 sandbox 只开放 `allow-scripts`，不向页面发送 React 专用 `UPDATE_CONFIG` 或任意 host action 消息；用户配置编辑不适用于 sandbox。发布源必须配置独立的 `HTML_SANDBOX_PUBLIC_ORIGIN`，未配置时不允许正式发布交互页。

使用端的 renderer 选择与动态签发细节见[使用端预览架构](../../../使用端/02-预览与配置/技术/01_架构设计.md)；发布资源与项目状态的通用语义见[发布资源本地化](../../03-项目管理/技术/12_发布资源本地化.md)。

## 6. CLI 与诊断

`ow page create`、`ow page switch-runtime` 和 `ow project validate-runtime` 接收 `sandboxHtml` 与 `htmlImportMeta`，但不复制判型、归一化或安全规则；CLI 只做 JSON 参数适配，最终校验仍在 project-core。发布 CLI 复用服务端发布链路，不能把 sandbox 源码作为普通静态资源上传。

诊断允许记录 runtime type、policy version、renderer、executionIdHash、blockedRequestCount、timeout、contextClosed 和 browserRestarted 等有限字段。execution ID 只保留不可逆摘要，原始 ticket、源码和用户输入不得进入 SQLite、JSONL、错误消息或导出包。查询与导出入口见[诊断与日志模块](../../11-诊断与日志/)。

## 7. 验证边界

project-core 测试覆盖判型、归一化、哈希合同、文件集合、原子写入、运行时切换和 fail-closed；demo-ui 测试覆盖 channel、generation、消息大小/深度/速率；author-site 与 screenshot-service 测试覆盖 ticket、CSP、发布 manifest、专用 Chromium 任务和超时清理；viewer/embed 测试覆盖动态签发、无源码响应和 `allow-scripts` 边界。浏览器回归测试验证脚本、事件、timer、canvas 能运行，同时验证网络、导航、弹窗、下载、表单、跨协议消息和卸载占位等拒绝行为。
