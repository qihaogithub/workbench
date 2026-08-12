# 创作端编辑页加载性能优化设计

**日期：** 2026-08-11  
**状态：** 设计方向已确认，待书面审阅  
**范围：** 创作端 `/demo/[id]/edit` 首次打开链路

## 背景

当前编辑页打开时存在两类可确认的首载开销：

1. 前端依次等待项目列表与用户偏好、Session 创建、Session 全量文件三个阶段，全屏加载态直到所有页面源码到达后才解除。
2. 生产构建中编辑页 First Load JS 为 972 kB。配置面板工具函数与手绘状态 hook 的同步导入，使 Milkdown、ProseMirror 和 `@workbench/sketch-react` 进入普通页面的首载依赖图。

本地现有数据中，最大工作区的可编辑文本资源约为 3.7 MB。新建 Session 的响应已经包含全量 `demos`，而前端未消费该数据，随后又请求一次全量 `/files`。

## 目标

- 编辑页首次打开只传输页面目录、项目级配置和当前页文件，不传输其他页面文件。
- 项目其他页面的代码、Schema、原型和手绘场景在用户切换到该页时才加载。
- 项目元数据到达后即展示编辑器框架，当前页资源未就绪时只阻塞预览区。
- 普通 React/HTML 页面首载不包含 Markdown 富文本编辑器和手绘编辑 SDK。
- 不改变现有保存、协同、预览、AI 对话和单页文件接口契约。

## 非目标

- 本批次不优化首页项目卡片的截图元数据请求。
- 不把编辑页整体改造为 Server Component 或服务端流式页面。
- 不调整 Workspace Authority、Yjs 资源路径或 Session 生命周期语义。
- 不为旧版非标准数据增加新的兼容分支。

## 方案选择

### 未采用：直接复用全量 Session 响应

该方案只需删除第二次 `/files` 请求，但仍会在首屏传输整个项目源码，性能会随页面数量和单页体积线性恶化。

### 已采用：轻量 Bootstrap + 单页按需加载

Session 创建响应作为编辑页唯一元数据 Bootstrap 数据源，只携带编辑器框架所需的项目与目录信息，以及当前页标识。Bootstrap 成功后，当前页和其他页面统一通过现有单页 files API 按需读取。该方案不改变编辑期写入协议，同时消除重复响应和全量首载。

### 暂不采用：服务端流式编辑器壳层

该方案需要重新划分客户端状态与 Session 创建边界，会同时牵动鉴权、协同初始化和 AI 对话恢复，不适合作为第一批性能优化。

## 数据契约

`POST /api/sessions` 增加可选的 `activePageId`。成功响应保留已有 Session 字段，并提供一个明确的 Bootstrap 结构：

- 项目摘要：名称、封面、项目级创作偏好。
- 工作区摘要：页面目录、文件夹目录、项目级配置 Schema 和配置值。
- 当前页标识：根据 `activePageId` 选择；无匹配时使用目录中第一页；无页面时返回 `null`。

响应不再返回整个 `demos` 字典，也不返回当前页的代码、Schema、原型或手绘内容。项目处于已有活跃 Session 和创建新 Session 两种分支时，必须使用同一 Bootstrap 结构。

## 客户端加载流程

1. 编辑页并发请求 Session Bootstrap 和用户创作偏好。
2. Bootstrap 到达后设置 Session、Workspace、项目摘要、页面目录与当前页 ID，并立即请求当前页的单页 files API。
3. 编辑器框架在 Bootstrap 到达后立即可见；预览区在当前页文件到达前展示局部加载态。
4. 协同连接、评论、AI 会话和预览只在 Session、Workspace 和当前页 ID 就绪后启动。
5. 用户切换到未缓存页面时，调用单页 files API；已缓存页面直接切换。

Bootstrap 失败时显示页面级错误与重试入口。用户偏好失败不阻塞编辑器，按默认偏好继续。单页加载失败只影响目标页，不清空已缓存页面。

## 客户端包边界

### 配置绑定解析

`extractCodeConfigBindingKeys` 与 `extractPrototypeConfigBindingKeys` 迁移到独立纯 TypeScript 模块，并由 `@workbench/demo-ui` 公开轻量子路径。该模块不得导入 React、ConfigForm、RichTextEditor 或样式文件。

`PageConfigPanel` 本身仍保持动态导入，只在配置面板真实挂载时加载表单和 Markdown 编辑器依赖。

### 手绘编辑子树

主编辑页只保留运行时类型判断和手绘编辑开关。`useSketchEditorState` 及所有 `@workbench/sketch-react` UI 必须位于同一个动态加载的子树内，不再由主页面同步调用 hook。

子树仅在当前页类型为 `sketch-scene` 且用户进入手绘编辑态时挂载。退出手绘编辑后卸载子树，但不丢失已通过回调写回主页面的 scene 数据。

## 测试与验收

### 自动化验证

- Session API 测试覆盖新 Session、复用活跃 Session、指定有效当前页、指定无效当前页和空项目。
- 断言 Bootstrap 响应不包含全量 `demos` 或任何页面源文件，且客户端使用 Bootstrap 选定的当前页 ID 请求单页 files API。
- 配置绑定解析工具保留现有语义，并可从轻量子路径单独导入。
- 普通页面不挂载手绘编辑子树；手绘页进入编辑态后仍可编辑 scene 并同步回主页面。
- 运行 `pnpm check:author` 和 `pnpm check:demo-ui`。

### 性能验收

- 生产构建成功，记录优化后 `/demo/[id]/edit` First Load JS 并与 972 kB 基线比较。
- 编辑页初始化不再请求 `/api/sessions/:sessionId/files` 全量端点。
- Session Bootstrap 不包含页面源文件；初始单页 files 负载只随当前页大小变化，不再随整个项目所有页面的总大小线性增长。
- 无 Chrome DevTools MCP 时，本批次不把 FCP、LCP、INP 作为完成门禁；浏览器指标留给后续实机验收。

## 风险与约束

- 初始页选择必须与现有页面目录排序一致，不能因文件系统遍历顺序变化。
- 协同 hook 只能在 Session 和 Workspace 就绪后创建，避免以空资源路径发起连接。
- 已缓存页面的非空 Schema 不得被协同初始化期的临时空值覆盖。
- 模型配置和外部授权推送如果从 Session 响应关键路径移出，必须保留 AI 首次发送前的 readiness 门禁；第一批实施可以保留当前同步推送，不为了扩大收益而引入竞态。
- 当前工作区存在用户未提交改动，实施时只修改本设计明确列出的文件，不整理其他差异。

## 项目文档同步

实施完成后更新：

- `docs/项目文档/创作端/06-基础设施/技术/07_开发环境路由编译性能.md`：记录轻量 Bootstrap、单页按需读取和新的包边界。
- `docs/项目文档/创作端/03-项目管理/会话管理_需求文档.md`：如 Session 初始数据契约对用户可见加载行为产生变化，补充当前事实，不记录实施过程。
- 对应模块 `INDEX.md`：仅在文档摘要或新增文档链接需要变化时更新。
