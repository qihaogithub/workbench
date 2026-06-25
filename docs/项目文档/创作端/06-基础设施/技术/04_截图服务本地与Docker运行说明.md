---
covers:
  - package.json
  - docker-compose.yml
  - packages/author-site/src/app/api/screenshots/
  - packages/author-site/src/lib/screenshot-service.ts
  - packages/screenshot-service/src/server.ts
  - packages/screenshot-service/src/utils/browser-pool.ts
  - packages/screenshot-service/src/utils/errors.ts
---

# 截图服务本地与 Docker 运行说明

> 更新日期：2026-06-21  
> 适用模块：创作端基础设施、画布预览、截图服务代理

## 1. 服务职责

screenshot-service 是画布模式的截图生成服务，负责调用 Chromium 渲染预览页并生成静态截图。它是创作端画布预览的性能优化层，不是画布可用性的前置条件。

创作端浏览器不直接请求 screenshot-service。所有截图请求都先进入 author-site 的同源 API，再由 author-site 服务端代理到 screenshot-service。

```text
浏览器
  -> author-site /api/screenshots/*
  -> screenshot-service /api/screenshots/*
  -> Chromium/Puppeteer
  -> data/screenshots/
```

## 2. 本地开发启动

本地开发需要同时调试创作端和截图服务时，使用根目录脚本：

```bash
pnpm dev:preview
```

该脚本并发启动：

| 服务 | 默认端口 | 用途 |
| :--- | :--- | :--- |
| author-site | 3200 | 创作端页面与截图代理 API |
| screenshot-service | 3202 | 截图生成、批量任务、截图文件服务 |

只运行 `pnpm dev:author` 时，author-site 仍可启动；画布模式会通过 `/api/screenshots/health` 判断截图服务离线，并降级为实时 iframe 预览。

## 3. 健康检查

本地健康检查顺序：

```bash
curl http://localhost:3202/health
curl http://localhost:3200/api/screenshots/health
```

第一条验证 screenshot-service 是否独立可用。第二条验证 author-site 代理是否可达。前端只依赖第二条同源接口，不读取或拼接 screenshot-service 的浏览器端地址。

`/health` 默认返回服务存活、浏览器池状态、队列长度、编译缓存数量和最近错误。需要确认 Chromium 是否真的能打开页面并截图时，可以使用深度检查：

```bash
curl http://localhost:3202/health?deep=1
```

深度检查会执行一次最小页面渲染，适合 Docker healthcheck 或排查“服务在线但 Chromium 不可用”的问题。

## 4. 代理配置

author-site 服务端通过 `SCREENSHOT_SERVICE_URL` 定位 screenshot-service。

| 环境 | 推荐值 | 说明 |
| :--- | :--- | :--- |
| 本地多服务开发 | `http://localhost:3202` | author-site 和 screenshot-service 均运行在开发机 |
| Docker Compose | `http://screenshot-service:3202` | author-site 容器通过 Compose 服务名访问截图服务 |

不要在浏览器端使用 `localhost:3202` 直连截图服务。浏览器只请求 author-site 的 `/api/screenshots/*`，这样可以保持同源、避免 CORS 和容器内外网络地址混淆。

author-site 代理会为下游请求设置超时，并透传 `x-request-id`。超时会映射为 `SCREENSHOT_PROXY_TIMEOUT`，前端按截图服务暂不可用处理。

## 5. Docker 运行约定

Docker Compose 中 author-site 应配置：

```text
SCREENSHOT_SERVICE_URL=http://screenshot-service:3202
```

screenshot-service 容器应使用容器内 Chromium 路径：

```text
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
```

该配置保证 author-site 容器不会误连宿主机或浏览器机器的 `localhost:3202`。

当前 Docker healthcheck 使用 `/health?deep=1`，因此可以发现 Chromium 缺失、路径错误或无法启动，而不仅仅确认 Fastify 端口存活。

## 6. 稳定性相关环境变量

| 变量 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `SCREENSHOT_QUEUE_TIMEOUT_MS` | `30000` | 截图任务在队列中等待的最长时间 |
| `SCREENSHOT_TASK_TIMEOUT_MS` | `20000` | 单个 Chromium 渲染任务的最长执行时间 |
| `SCREENSHOT_BATCH_TTL_MS` | `300000` | 批量任务状态在内存中的保留时间 |
| `SCREENSHOT_DEEP_HEALTH` | `false` | 是否让普通 `/health` 也执行深度 Chromium 检查 |
| `SCREENSHOT_PROXY_TIMEOUT_MS` | `30000` | author-site 代理等待 screenshot-service 的最长时间 |

## 7. 浏览器路径探测

screenshot-service 启动 Chromium 时按以下优先级查找浏览器：

1. `PUPPETEER_EXECUTABLE_PATH`
2. macOS 常见 Chrome 路径
3. Linux 常见 Chromium/Chrome 路径
4. Windows Chrome/Edge 默认安装路径

Windows 本地开发不强制配置浏览器路径；如果默认路径不可用，再通过 `PUPPETEER_EXECUTABLE_PATH` 显式指定。

## 8. 离线降级策略

截图服务不可达时，author-site 的截图代理返回：

```text
SCREENSHOT_SERVICE_UNAVAILABLE
```

前端收到该错误后不应把画布页面渲染为阻塞错误态，而应：

- 清除与当前版本不一致的截图 URL，避免旧截图误导用户。
- 没有当前版本截图时，具备实时预览能力的消费方使用实时 iframe。
- 在工具栏或页面状态区显示非阻塞离线提示。
- 保留重试入口，服务恢复后可重新生成截图。

截图消费与回退状态的前端细节见 [07_截图服务与预览快照机制.md](../../04-配置与预览/技术/07_截图服务与预览快照机制.md)。
