# 用户级外部工具授权与 AI 集成方案

## 背景

创作端 AI 需要读取和写入外部协作系统：Figma 设计稿、钉钉文档、钉钉在线表格和钉钉知识库。外部能力必须使用当前创作端用户自己的授权，不使用部署者内置账号或全局 token，避免跨用户权限混用。

## 目标

- 用户在浏览器中完成 Figma 和钉钉授权。
- 授权成功后可在后续会话复用，避免每次使用重复授权。
- AI 会话只获得当前用户的外部系统权限。
- 外部写操作必须经过创作端确认卡确认。
- 未授权、授权过期或平台能力不可用时，AI 给出明确提示。

## 范围

- 创作端用户设置中的外部账号授权入口。
- 用户级外部授权状态存储与脱敏展示。
- author-site 到 agent-service 的 session 级外部授权配置推送。
- agent-service 内 Figma MCP 与钉钉 dws 受控工具。
- 相关项目文档、测试与验证。

不包含：

- 钉钉群聊、通讯录、审批、待办等非本期能力。
- 使用服务全局 Figma token 或全局钉钉账号兜底。
- 绕过 dws CLI 直接调用钉钉 HTTP API。

## 方案

1. author-site 新增用户外部授权配置能力，复用现有用户模型配置的加密策略保存敏感凭据或授权状态。
2. Figma 优先走官方 Figma MCP/OAuth 接入；若部署环境没有 MCP 客户端准入，工具返回明确不可用状态。
3. 钉钉使用 agent-service 容器内 dws，按用户隔离 `DWS_CONFIG_DIR`，通过 dws device flow 让用户在浏览器完成授权。
4. author-site 创建或恢复 session 时，将当前用户的外部授权摘要推送给 agent-service。
5. agent-service 注册 `figmaMcp` 与 `dingtalk` 工具，并在写操作前复用现有 `permission_request` 确认机制。
6. 系统提示同步说明授权入口、能力范围和禁止粘贴 token 的规则。

## 任务清单

- [x] 评估现有用户配置、session 推送和权限确认实现。
- [x] 新增用户外部授权存储、API 和设置弹窗入口。
- [x] 新增 agent-service 外部授权 session 配置和内部同步接口。
- [x] 新增 Figma MCP 工具与不可用/未授权状态处理。
- [x] 新增钉钉 dws 工具、产品白名单、用户级 `DWS_CONFIG_DIR` 和写操作确认。
- [x] 更新系统提示和工具 capabilities。
- [x] 更新项目文档。
- [x] 运行 author-site 与 agent-service 验证。
- [x] 将未授权场景改为聊天消息内授权卡片。
- [x] 修复 dws `authenticated:false` 被误判为已连接的问题。
- [x] 修复流式授权卡片已连接后无法自动继续的问题。
- [x] 补充会话创建/复用时复用外部授权配置的回归测试。

## 进度记录

- 2026-06-26：创建任务文档。已确认用户要求 Figma 与钉钉都必须使用具体登录用户自己的授权，授权交互应尽量在浏览器完成并可复用。
- 2026-06-26：完成用户级外部授权存储、设置入口、OAuth/device flow API、session 外部授权推送、agent-service 内存配置、Figma MCP 工具、钉钉 dws 工具和写操作确认接入。
- 2026-06-26：补充钉钉 device flow 授权后的状态刷新闭环；设置页刷新会查询 agent-service 中该用户隔离 dws 目录的登录态。
- 2026-06-26：新增 author-site 与 agent-service 单测，覆盖加密存储、未授权拒绝、产品白名单和写操作取消。
- 2026-06-26：补齐 Figma access token 临期刷新；session 注入前会刷新凭据，刷新失败则转为需重新授权。
- 2026-06-26：`pnpm check:author`、`pnpm check:agent` 均通过。author-site 共 47 个测试套件、340 个测试通过；agent-service 共 22 个测试文件、183 个测试通过。
- 2026-06-26：因新增 shared 类型，补跑 `pnpm check:all`，全仓检查通过。
- 2026-06-26：按新需求将 Figma/钉钉未授权结果改为结构化 `external_auth_required`，前端聊天消息列表直接渲染授权卡片，不再要求用户先去设置页。
- 2026-06-26：由于当前 PATH 的 pnpm 版本与仓库 lockfile 不兼容，使用 `corepack pnpm` 逐包执行 `check:all` 等价验证，全部通过。
- 2026-06-26：修复钉钉授权卡片点击后不自动跳转的问题：前端在用户点击时先同步打开占位页，授权 URL 返回后再跳转；agent-service 增强 dws device flow 输出解析，并最多等待 8 秒获取授权 URL 或 user code。
- 2026-06-26：继续修复授权体验：授权卡片不再被折叠进“执行过程”；点击连接不再预开空白页，拿到真实授权 URL 后触发链接点击，并保留“打开授权页”链接作为兜底。
- 2026-06-26：修复授权卡片已连接后仍显示“连接钉钉”导致点击无反馈的问题；已连接后按钮改为禁用的“已连接”，并在授权状态查询时对已连接 provider 也重新同步活跃 agent session。
- 2026-06-26：修复授权后 AI 不自动继续的问题；授权卡片检测到已连接后会通知聊天容器，复用重新生成逻辑自动重发上一条用户请求。
- 2026-06-26：定位钉钉反复授权根因：dws `auth status --format json` 会返回 `success:true` 表示命令执行成功，但同时可能返回 `authenticated:false` 表示未登录；原实现把 `success:true` 和文本中出现 `authenticated` 误判为已连接，导致前端显示已连接、工具执行仍未授权。
- 2026-06-26：修复 dws 状态判断，只以 `authenticated:true`、`loggedIn:true` 或明确已登录状态作为 connected；当 agent-service 返回未登录时，author-site 会把旧 connected 记录覆盖为需重新授权并同步当前 agent session。
- 2026-06-26：授权卡片向授权 API 传递当前 agent sessionId；Figma OAuth state 也携带该 sessionId，callback 成功后可直接热更新当前会话，不再只依赖活跃会话扫描。
- 2026-06-26：流式中的当前 assistant 消息新增稳定 id；授权卡片在流式消息里检测到 connected 后，可停止当前流并自动重发上一条用户请求。
- 2026-06-26：尝试为本机 `qihao` 用户的 dws 隔离目录执行 loopback 登录；浏览器授权未完成回调，dws 最终仍返回 `authenticated:false`。代码修复后不会再把该状态显示为已连接。
- 2026-06-26：使用 `corepack pnpm` 完成验证：author-site 类型检查通过，author-site 46 个测试套件/344 个测试通过；agent-service 类型检查通过，agent-service 22 个测试文件/186 个测试通过。
- 2026-06-26：补充 `POST /api/sessions` 回归测试，覆盖新建会话与复用活跃会话两条路径都会读取持久化外部授权配置，并推送到同名 agent-service session，确保授权一次后后续对话无需重新授权。
- 2026-06-26：新增 targeted 验证通过：`corepack pnpm --filter @opencode-workbench/author-site test -- --testPathPatterns=app/api/sessions/route.test.ts`。全量 author-site 测试当前被既有多 Demo/fs-utils 断言失败阻塞，失败点不涉及外部授权；author-site 类型检查当前被 `AppActionPayload` shared/demo 导出缺失阻塞，失败点不涉及外部授权。
- 2026-06-26：完成一次真实 Chrome 钉钉 OAuth 授权，dws loopback 返回“登录成功”；随后发现当前 dws `auth status` 仍返回 `authenticated:false`，但同一用户隔离 `DWS_CONFIG_DIR` 下 `dws doc list --format json` 可以成功读取文档列表，证明登录态真实可用而 status 命令不可信。
- 2026-06-26：agent-service 的钉钉状态判断改为 `auth status` 已登录或只读 `doc list` 探测成功任一成立即 connected，避免用户已授权后仍被反复要求授权。
- 2026-06-26：新增 targeted 验证通过：`corepack pnpm --filter @opencode-workbench/agent-service test -- tests/unit/external-auth-tools.test.ts`、`corepack pnpm --filter @opencode-workbench/agent-service typecheck`。
- 2026-06-26：修正只读探测命令为实际可用的 `dws doc list --format json --timeout 10`；本机用户隔离目录验证结果为 `success:true`、`nodeCount:30`。agent-service 全量测试通过：23 个测试文件、196 个测试通过。

## 验证方式

- `pnpm check:author`
- `pnpm check:agent`
- 若共享类型或 workspace 依赖变更，补充 `pnpm check:all`
- 持久复用专项：`corepack pnpm --filter @opencode-workbench/author-site test -- --testPathPatterns=app/api/sessions/route.test.ts`

## 风险与待确认事项

- Figma MCP 官方服务存在客户端准入限制；若当前部署未获准入，本期只能完成授权框架和清晰不可用提示。
- dws device flow 的输出格式需以当前 CLI 为准，集成时需要兼容非 JSON help/提示输出。
- 用户级 dws 登录态需要持久化目录；Docker 部署需确保该目录挂载到持久数据卷。
- Chrome 中已登录钉钉或 Figma 不等于 dws CLI 或 Figma OAuth 已授权；dws 必须完成 CLI OAuth 写入对应 `DWS_CONFIG_DIR`，Figma 必须完成当前平台配置的 OAuth 流程。
- 当前 dws CLI 的 `auth status` 在已能读取文档时仍可能返回 `authenticated:false`；状态判断必须保留只读文档探测兜底，不能只依赖 status 命令。
