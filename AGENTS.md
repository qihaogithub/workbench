# AGENTS.md — opencode-workbench

> AI Agent 工作指南。只包含从文件系统和配置验证过的事实。

## Monorepo 结构

pnpm workspaces (`pnpm@8.15.0`, `node >=18`, `shamefully-hoist=true`), 7 个包：

| 包名 | 路径 | 类型 | 端口 | 测试框架 |
|---|---|---|---|---|
| `@opencode-workbench/author-site` | `packages/author-site/` | Next.js 14 (App Router) | 3200 | Jest + Testing Library |
| `@opencode-workbench/viewer-site` | `packages/viewer-site/` | Next.js 14 (App Router) | 3300 | — |
| `@opencode-workbench/shared` | `packages/shared/` | 共享类型/常量 | — | — |
| `@opencode-workbench/agent-service` | `packages/agent-service/` | Fastify 服务 | 3201 | **vitest** |
| `@opencode-workbench/agent-client` | `packages/agent-client/` | Client SDK | — | — |
| `@opencode-workbench/cli-tools` | `OPS/CLI/` | CLI 测试工具 (ESM) | — | — |
| `@opencode-workbench/screenshot-service` | `packages/screenshot-service/` | Fastify 服务 (Puppeteer) | 3202 | **vitest** |

`packages/web/` 存在于文件系统但**不是 workspace 成员**（无 package.json），不应引入或修改。

`packages/shared/src/index.ts` 是共享类型的入口，`@opencode-workbench/shared` 被 author-site 和 agent-service 通过 `workspace:*` 引用。`CLAUDE.md` 仅包含 `@AGENTS.md` 一行引用。

`packages/agent-service/AGENTS.md` 包含 Pi Agent 后端的架构说明和工具集 — 修改 agent-service 前应阅读。

## 开发者命令

```bash
pnpm dev                              # 并行启动 author + agent + viewer + snapshot + screenshot
pnpm dev:author / dev:agent / dev:viewer / dev:screenshot  # 单服务启动
pnpm build                            # next build author-site
pnpm build:viewer                     # next build viewer-site
pnpm lint                             # ESLint (author-site next lint)
pnpm typecheck / typecheck:viewer     # tsc --noEmit
pnpm test:e2e                         # Playwright (test/新建-编辑-保存项目测试/)
pnpm test:e2e:ui / test:e2e:headed    # Playwright UI/有头模式
```

### 包级测试

```bash
# author-site (Jest)
pnpm --filter @opencode-workbench/author-site test
pnpm --filter @opencode-workbench/author-site test -- --testPathPattern="file.test.ts"
pnpm --filter @opencode-workbench/author-site test:watch

# agent-service (vitest, 伪 ACP CLI — 无需真实后端)
pnpm --filter @opencode-workbench/agent-service test
pnpm --filter @opencode-workbench/agent-service test:watch
pnpm --filter @opencode-workbench/agent-service test:coverage
pnpm --filter @opencode-workbench/agent-service test:smoke  # 需要 ACP_SMOKE_REAL=1
```

### 其他

```bash
pnpm --filter @opencode-workbench/author-site db:init  # 初始化 SQLite users.db
```

## Screenshot 服务

Puppeteer 截图服务（`packages/screenshot-service/`），端口 3202。依赖 author-site 的 `/api/compile` 端点和本地 Chrome。截图存储于 `data/screenshots/`。支持同步单页截图和异步批量截图，使用 LRU 编译缓存和文件系统截图缓存。

## Playwright E2E 测试

Playwright config 在 `test/新建-编辑-保存项目测试/playwright.config.ts`（不在根目录）。前置条件：`pnpm dev` 运行中，`pnpm playwright install chromium`（首次）。测试 baseURL 为 `http://localhost:3200`。

## 构建与 CI

`turbo.json` 中 `lint` 依赖 `^build`，意味着上游包必须先构建。无 GitHub Actions 工作流。

## Agent 后端配置

**仅支持 Pi Agent 后端**（`@earendil-works/pi-agent-core` 进程内嵌入）。无外部服务依赖（不依赖 OpenCode Server 或其他 CLI 子进程）。模型配置通过 `PI_AGENT_*` 环境变量提供。完整后端实现见 `packages/agent-service/src/backends/pi-agent.ts` 和 `pi-tools/`。

## 关键架构细节

- **Auth**: JWT (`jose`), `middleware.ts` 保护 `/demo`, `/projects` (重定向到 `/login`) 和 `/api/sessions` (返回 401 JSON)。`JWT_SECRET` 环境变量。
- **数据存储**: 文件系统 `data/` 目录 — `data/projects/`, `data/sessions/`, `data/workspaces/`, `data/snapshots/` + SQLite `data/users.db`。通过 `DATA_DIR` 环境变量覆盖。
- **Session**: 2 小时过期 (`SESSION_EXPIRY_MS = 2 * 60 * 60 * 1000`)。API 路由在 `packages/author-site/src/app/api/`。
- **CORS**: 同时由 `middleware.ts` (author-site → viewer 跨域) 和 agent-service `server.ts:47` 管理。`.env` 的 `CORS_ORIGINS` 控制 agent-service CORS。
- **环境变量**: `.env` 配置 LLM API (provider, api key, models), `.env.docker` 用于 Docker 部署的覆盖版本。`.env` 已被 `.gitignore` 忽略，不在提交中。

## Docker 部署

`docker-compose.yml` 3 服务: agent-service (3201), author-site (3200), viewer-site (3300)。viewer-site 需要 `--profile viewer`。部署脚本: `scripts/deploy.sh`。

## 代码约定

- `strict: true`, 禁止 `as any`/`@ts-ignore`/`@ts-expect-error`
- 路径别名: `@/` = `./src/*` (author-site), `@opencode-workbench/shared` = `../shared/src`
- API 响应: `{ success: true, data: T }` / `{ success: false, error: { code, message } }` — `createApiSuccess`/`createApiError` (`packages/author-site/src/lib/fs-utils.ts`)
- 组件: shadcn/ui + Tailwind CSS + lucide-react + `class-variance-authority` + `cn()` (clsx + tailwind-merge)。禁止其他 UI 库。
- 数据获取: SWR (`@/lib/api.ts`)
- 测试描述: 中文
- **agent-service**: `@/` 别名映射到 `./src/` (vitest.config.ts)。导入顺序: Node 内置 → 外部 → 内部相对路径。
