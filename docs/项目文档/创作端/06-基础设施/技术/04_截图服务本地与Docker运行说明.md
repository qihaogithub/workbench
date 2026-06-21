---
covers:
  - package.json
  - docker-compose.yml
  - packages/author-site/src/app/api/screenshots/
  - packages/author-site/src/lib/screenshot-service.ts
  - packages/screenshot-service/src/server.ts
  - packages/screenshot-service/src/utils/browser-pool.ts
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

## 4. 代理配置

author-site 服务端通过 `SCREENSHOT_SERVICE_URL` 定位 screenshot-service。

| 环境 | 推荐值 | 说明 |
| :--- | :--- | :--- |
| 本地多服务开发 | `http://localhost:3202` | author-site 和 screenshot-service 均运行在开发机 |
| Docker Compose | `http://screenshot-service:3202` | author-site 容器通过 Compose 服务名访问截图服务 |

不要在浏览器端使用 `localhost:3202` 直连截图服务。浏览器只请求 author-site 的 `/api/screenshots/*`，这样可以保持同源、避免 CORS 和容器内外网络地址混淆。

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

## 6. 浏览器路径探测

screenshot-service 启动 Chromium 时按以下优先级查找浏览器：

1. `PUPPETEER_EXECUTABLE_PATH`
2. macOS 常见 Chrome 路径
3. Linux 常见 Chromium/Chrome 路径
4. Windows Chrome/Edge 默认安装路径

Windows 本地开发不强制配置浏览器路径；如果默认路径不可用，再通过 `PUPPETEER_EXECUTABLE_PATH` 显式指定。

## 7. 离线降级策略

截图服务不可达时，author-site 的截图代理返回：

```text
SCREENSHOT_SERVICE_UNAVAILABLE
```

前端收到该错误后不应把画布页面渲染为阻塞错误态，而应：

- 保留已有截图 URL，避免画布闪烁。
- 没有可用截图时，使用实时 iframe 预览。
- 在工具栏或页面状态区显示非阻塞离线提示。
- 保留重试入口，服务恢复后可重新生成截图。

画布降级状态的前端细节见 [07_截图服务与画布降级机制.md](../../04-配置与预览/技术/07_截图服务与画布降级机制.md)。
