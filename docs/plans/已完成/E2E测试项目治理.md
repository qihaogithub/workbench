# E2E 测试项目治理

## 背景

不同创作端 E2E 回归脚本会新建各自的测试项目。脚本失败、浏览器中断或清理逻辑遗漏时，测试项目会残留在 `data/projects/`，并继续出现在创作端首页，干扰日常开发和人工验收。

## 目标

- 为 E2E 测试项目建立统一命名空间。
- 将项目创建、登记和清理逻辑集中到统一 helper。
- 通过 Playwright 全局 setup/teardown 自动清理本轮项目和过期残留项目。
- 保持创作端业务 API 与首页产品行为不变。

## 范围

- 修改 `test/创作端E2E回归测试/` 下 Playwright 配置、回归脚本和测试说明。
- 新增 E2E 测试内部 helper 与全局 setup/teardown。
- 不改 `/api/demos` 等创作端业务接口。
- 不自动清理历史非 `__e2e__` 分类测试项目，避免误删人工数据。

## 方案

- 统一使用 `category: "__e2e__"` 标记测试项目。
- 统一使用 `E2E:<runId>:<caseName>` 生成测试项目名称。
- `globalSetup` 写入本轮 `runId` 和项目登记文件。
- `globalTeardown` 先清理登记项目，再扫描并清理超过 24 小时的 `__e2e__` 项目。
- 普通业务回归通过 helper 直接调用 API 创建项目；专门验证 UI 新建项目的用例继续走 UI，并在创建后登记和补写分类。

## 任务清单

- [x] 确认现有 `/api/demos` 创建、更新和删除接口能力。
- [x] 新增 E2E run 状态、项目登记和清理 helper。
- [x] 接入 Playwright `globalSetup` / `globalTeardown`。
- [x] 改造现有 E2E 回归脚本。
- [x] 更新 E2E 测试说明文档。
- [x] 运行验证并记录结果。

## 进度记录

- 2026-06-29：确认 `/api/demos` 支持 `category`，`DELETE /api/demos/:id` 内部完成 preview + execute，不需要测试侧传确认 token。
- 2026-06-29：确认当前会话未暴露 CodeGraph 工具，改用只读文件检查定位相关实现。
- 2026-06-29：新增 `support/e2e-projects.ts`，集中处理 E2E 项目命名、登记、补分类、删除和过期判定。
- 2026-06-29：Playwright 配置接入全局 setup/teardown；普通回归改为 API 创建测试项目，完整流程保留 UI 创建并补写 `__e2e__` 分类。
- 2026-06-29：普通回归补充统一表单登录 helper，避免 API 创建路径依赖编辑页跳转触发登录。
- 2026-06-29：验证结果：Playwright `--list` 通过；`check:author` 的 typecheck 通过但 Jest 受本地 `better-sqlite3` Node ABI 不匹配阻塞；`test:e2e:core-flow` 受当前 author-site 登录接口返回 `AGENT_SERVICE_ERROR/登录失败` 阻塞。

## 验证方式

- 运行 `pnpm check:author`。
- 尝试运行 `pnpm test:e2e:core-flow`；若本地 author-site 未启动或环境不满足，在最终结果中说明。
- 检查全局 setup 生成 `e2e-run.json`，项目登记文件记录本轮创建项目，teardown 后登记项目被删除。

## 验证结果

- `./node_modules/.bin/playwright test --config test/创作端E2E回归测试/playwright.config.ts --list`：通过，列出 4 个 E2E 用例。
- `corepack pnpm run check:author`：typecheck 通过；Jest 失败，原因是本地 `better-sqlite3.node` 使用 `NODE_MODULE_VERSION 115` 编译，而当前 Node 需要 `NODE_MODULE_VERSION 137`。
- `./node_modules/.bin/playwright test --config test/创作端E2E回归测试/playwright.config.ts author-core-flow-regression.spec.ts`：失败于登录阶段，`/api/auth/login` 返回 `AGENT_SERVICE_ERROR/登录失败`；本次用例尚未进入测试项目创建阶段。

## 风险与待确认事项

- `globalTeardown` 依赖当前 `/api/demos` 未受登录保护；若后续 middleware 收紧 API 鉴权，需要改为复用登录态或测试专用管理凭据。
- 过期清理只触碰 `category === "__e2e__"` 的项目，不清理历史前缀类测试项目。
