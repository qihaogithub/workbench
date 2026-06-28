# Pi Agent 联网搜索能力方案

## 背景

当前 Pi Agent 只能使用本地工作空间、截图、知识库和外部授权工具，无法主动查询公开互联网信息。用户需要在创作端对话中具备联网搜索能力，并要求使用免费方案。

## 目标

- 新增 `webSearch` Pi Tool，使用 Brave Search API 免费额度。
- 默认关闭联网搜索，只有显式配置后才注册工具。
- 第一版只返回搜索结果列表，不抓取网页正文。
- 保持现有 bash 权限边界，不通过命令白名单绕开工具权限。

## 范围

- 涉及 `packages/agent-service/` 的 Pi Tools、测试和配置示例。
- 同步 Docker 环境变量透传和独立 Agent 服务层文档。
- 不修改 `.env`，不写入真实 API key。
- 不调整前端 UI 和使用端只读 AI 工具集。

## 方案

- 新增 `web-search-tool.ts`，使用 `undici` 调用 Brave Web Search 固定接口。
- 参数只允许模型传入查询词和结果数量，服务端控制 endpoint、超时、缓存和 key。
- 通过 `PI_AGENT_WEB_SEARCH_ENABLED=true` 控制工具注册，通过 `BRAVE_SEARCH_API_KEY` 提供密钥。
- 增加进程内 TTL 缓存，降低重复查询对免费额度的消耗。
- `WORKBENCH_TOOL_VERSION` 递增，确保能力集变化能被前端和调试入口识别。

## 任务清单

- [x] 建立任务文档并确认实现边界。
- [x] 实现 `webSearch` 工具。
- [x] 接入工具工厂与能力集版本。
- [x] 增加工具单元测试和工厂注册测试。
- [x] 同步 `.env.example`、`docker-compose.yml` 和项目文档。
- [x] 完成 agent-service 等价验证。

## 进度记录

- 2026-06-26：确认采用 Brave Search API 免费额度方案，v1 只返回搜索结果列表。
- 2026-06-26：完成 `webSearch` 工具、环境变量开关、Docker 透传、单元测试和独立 Agent 服务层文档同步。
- 2026-06-26：根 `pnpm check:agent` 因当前 PATH 上 pnpm 11 与仓库 `pnpm@8.15.0` 锁文件不兼容，未进入子命令；改用 `corepack pnpm --filter @opencode-workbench/agent-service typecheck` 与 `corepack pnpm --filter @opencode-workbench/agent-service test` 完成等价验证，均通过。

## 验证方式

- `corepack pnpm --filter @opencode-workbench/agent-service typecheck`
- `corepack pnpm --filter @opencode-workbench/agent-service test`

## 风险与待确认事项

- Brave 免费额度需要用户自行申请 API key；未配置 key 时工具会返回配置错误。
- 网络调用在测试中使用 mock，不依赖真实 Brave 服务。
- v1 不读取网页正文，因此搜索摘要质量取决于 Brave 返回内容。
- 本次未修改 `.env`，部署前需要在实际环境配置 `BRAVE_SEARCH_API_KEY`。
