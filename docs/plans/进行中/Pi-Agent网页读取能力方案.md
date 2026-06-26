# Pi Agent 网页读取能力方案

## 背景

当前 Pi Agent 已具备 `webSearch` 联网搜索能力，但搜索工具只返回搜索结果列表，不抓取网页正文。用户需要 Agent 能直接读取指定网页内容，用于理解公开页面资料。

## 目标

- 新增 `webRead` Pi Tool，读取公开 HTTP/HTTPS 网页并返回可供模型消费的文本。
- 保持服务端安全边界，阻止本机、内网、链路本地等非公开地址访问。
- 控制网页读取的超时、体积和输出长度，避免长页面拖垮会话。
- 同步更新工具能力版本、测试和项目文档。

## 范围

- 涉及 `packages/agent-service/` 的 Pi Tools、单元测试和配置示例。
- 同步根 `.env.example`、`docker-compose.yml` 和 `docs/项目文档/独立Agent服务层/`。
- 不修改 `.env`，不写入任何真实密钥。
- 不调整使用端只读 AI 工具集。

## 方案

- 新增 `web-read-tool.ts`，复用已有 `undici` 依赖发起 GET 请求。
- 参数接收 URL 和可选最大输出字符数；服务端固定 User-Agent、超时、最大响应体积和内容类型限制。
- URL 只允许 `http:` 与 `https:`，并拒绝 localhost、私有网段、保留网段、链路本地地址和凭证型 URL。
- HTML 响应提取 title、description、canonical URL 和正文文本；纯文本响应按长度截断返回。
- 通过 `PI_AGENT_WEB_READ_ENABLED=false` 可关闭工具，默认注册到工作台 Pi Tools；不注册到 viewer-readonly 模式。

## 任务清单

- [x] 建立任务文档并确认实现边界。
- [x] 实现 `webRead` 工具。
- [x] 接入工具工厂、能力集版本和环境配置示例。
- [x] 增加工具单元测试和工厂注册测试。
- [x] 同步长期项目文档。
- [x] 运行 agent-service 验证。

## 进度记录

- 2026-06-26：确认现有 `webSearch` 只搜索不读取正文，决定新增独立 `webRead` 工具，并对 URL 做 SSRF 防护。
- 2026-06-26：完成 `webRead` 工具实现，默认注册到工作台工具集，`WORKBENCH_TOOL_VERSION` 提升到 10；工具逐跳校验跳转 URL，拒绝本机、内网、保留地址、凭证型 URL、非文本内容和过大响应。
- 2026-06-26：完成 `.env.example`、`docker-compose.yml`、包级 AGENTS 指南和长期项目文档同步。
- 2026-06-26：根 `pnpm check:agent` 因当前 PATH 上 pnpm 11 与仓库锁文件不兼容而失败，未进入验证子命令；改用 `corepack pnpm --filter @opencode-workbench/agent-service typecheck` 和 `corepack pnpm --filter @opencode-workbench/agent-service test` 完成验证，均通过。

## 验证方式

- `pnpm check:agent`
- 如根命令受本地 pnpm 版本影响，则使用等价包级验证：
  - `corepack pnpm --filter @opencode-workbench/agent-service typecheck`
  - `corepack pnpm --filter @opencode-workbench/agent-service test`

## 风险与待确认事项

- 网页正文提取使用轻量规则，不追求完整浏览器渲染；需要 JavaScript 执行的站点可能只能读到初始 HTML。
- 工具默认读取公开网络；部署环境若需完全禁用外网读取，可设置 `PI_AGENT_WEB_READ_ENABLED=false`。
- 测试使用 mock，不访问真实公网。
- 当前工作树存在大量本任务之外的未提交改动，本任务未回滚或整理这些改动。
