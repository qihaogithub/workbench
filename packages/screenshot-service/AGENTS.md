# AGENTS.md — @workbench/screenshot-service

> 本文件为 AI 编码代理提供在截图服务包中工作的指南。进入本包前仍需先阅读根目录 `AGENTS.md`。

## 包定位

`@workbench/screenshot-service` 是 Fastify + Puppeteer Core 截图服务，负责调用 author-site 编译接口、打开本地 Chrome/Chromium、生成页面截图并写入文件系统缓存。

## 关键目录

| 路径 | 说明 |
| --- | --- |
| `src/server.ts` | Fastify 服务入口 |
| `src/config.ts` | 端口、Chrome、author-site、数据目录配置 |
| `src/routes/screenshots.ts` | 同步/异步截图接口 |
| `src/utils/browser-pool.ts` | 浏览器池管理 |
| `src/utils/compile-client.ts` | author-site `/api/compile` 调用 |
| `src/utils/compile-cache.ts` | 编译缓存 |
| `src/utils/screenshot-store.ts` | 截图文件缓存和路径管理 |
| `tests/` | Vitest 测试 |

## 改动边界

- 改截图 API 时，同步检查 author-site 的 `src/lib/screenshot-service.ts` 和 `src/app/api/screenshots/*`。
- 改缓存键时，同时检查编译输入、配置 props、页面 ID 和截图尺寸是否都参与缓存判定。
- 改浏览器启动参数时，兼顾本地 Chrome 与 Docker Chromium。
- 截图输出属于运行产物，不要纳入提交，除非任务明确要求 fixture。

## 验证

优先使用根目录脚本：

```bash
pnpm check:screenshot
```

更小范围验证：

```bash
pnpm --filter @workbench/screenshot-service typecheck
pnpm --filter @workbench/screenshot-service test
```

