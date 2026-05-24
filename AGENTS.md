# AGENTS.md — opencode-workbench

> AI Agent 工作指南。只包含从文件系统和配置验证过的事实。

## Monorepo 结构

pnpm workspaces (`pnpm@8.15.0`, `node >=18`, `shamefully-hoist=true`), 6 个包：

| 包名 | 路径 | 类型 | 端口 | 测试框架 | 构建 |
|---|---|---|---|---|---|
| `@opencode-workbench/author-site` | `packages/author-site/` | Next.js 14 (App Router) | 3200 | Jest + Testing Library | `next build` |
| `@opencode-workbench/viewer-site` | `packages/viewer-site/` | Next.js 14 (App Router) | 3300 | — | `next build` |
| `@opencode-workbench/shared` | `packages/shared/` | 共享类型/常量 | — | — | — |
| `@opencode-workbench/agent-service` | `packages/agent-service/` | Fastify 服务 | 3201 | **vitest** | `tsc` / `esbuild` |
| `@opencode-workbench/agent-client` | `packages/agent-client/` | Client SDK | — | — | `tsc` |
| `@opencode-workbench/cli-tools` | `OPS/CLI/` | CLI 测试工具 (ESM) | — | — | `tsc` |

## 开发者命令

```bash
pnpm dev                              # 并行启动 author + agent + viewer
pnpm dev:author / dev:agent / dev:viewer  # 单服务
pnpm lint                             # ESLint (author-site next lint)
pnpm typecheck / typecheck:viewer     # tsc --noEmit
pnpm test:e2e                         # Playwright (test/新建-编辑-保存项目测试/)
```

### 包级测试

```bash
# author-site
pnpm --filter @opencode-workbench/author-site test
pnpm --filter @opencode-workbench/author-site test -- --testPathPattern="file.test.ts"
pnpm --filter @opencode-workbench/author-site test:watch

# agent-service (vitest, 伪 ACP CLI — 无需真实后端)
pnpm --filter @opencode-workbench/agent-service test
pnpm --filter @opencode-workbench/agent-service test:watch
pnpm --filter @opencode-workbench/agent-service test:coverage
pnpm --filter @opencode-workbench/agent-service test:smoke  # 需要 ACP_SMOKE_REAL=1
```

## Agent 后端配置

**默认后端是 `opencode-http`** (HTTP 直连 `OPENCODE_SERVER_URL`). 旧 ACP `opencode` 后端已废弃, 仅在 `server.ts:62` 保留兼容注册.

完整后端列表见 `packages/agent-service/src/server.ts:62-` 的 `factory.register` 调用. ACP 后端 (claude, codex, gemini 等) 通过 stdio 子进程通信.

## 关键架构细节

- **Auth**: JWT (`jose`), `middleware.ts` 保护 `/demo`, `/projects` (重定向到 `/login`) 和 `/api/sessions` (返回 401 JSON). `JWT_SECRET` 环境变量.
- **数据存储**: 文件系统 `data/` 目录 — `data/projects/`, `data/sessions/`, `data/workspaces/`, `data/snapshots/` + SQLite `data/users.db`. 通过 `DATA_DIR` 环境变量覆盖.
- **Session**: 2 小时过期 (`SESSION_EXPIRY_MS = 2 * 60 * 60 * 1000`). API 路由在 `packages/author-site/src/app/api/`.
- **CORS**: 同时由 `middleware.ts` (author-site → viewer 跨域) 和 agent-service `server.ts:47` 管理.

## Docker 部署

`docker-compose.yml` 4 服务: opencode-serve (4096), agent-service (3201), author-site (3200), viewer-site (3300). viewer-site 需要 `--profile viewer`. 部署脚本: `scripts/deploy.sh`.

## 代码约定

- strict: true, 禁止 `as any`/`@ts-ignore`/`@ts-expect-error`
- 路径别名: `@/` = `./src/*`, `@opencode-workbench/shared` = `../shared/src`
- API 响应: `{ success: true, data: T }` / `{ success: false, error: { code, message } }` — `createApiSuccess`/`createApiError` (`packages/author-site/src/lib/fs-utils.ts`)
- 组件: shadcn/ui + Tailwind CSS + lucide-react + `class-variance-authority` + `cn()` (clsx + tailwind-merge). 禁止其他 UI 库.
- 数据获取: SWR (`@/lib/api.ts`)
- 测试描述: 中文
- **agent-service**: `@/` 别名映射到 `./src/` (vitest.config.ts). 导入顺序: Node 内置 → 外部 → 内部相对路径.
