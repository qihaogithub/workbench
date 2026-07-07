# 部署与 CORS 配置 - 实现设计

> 版本：v2.0
> 创建日期：2026-05-04
> 更新日期：2026-07-07

---

```yaml
covers:
  - docker-compose.yml
  - docker/viewer-site/nginx.conf
  - scripts/deploy.sh
  - packages/viewer-site/next.config.js
  - packages/viewer-site/.env.local
  - packages/viewer-site/package.json
  - packages/viewer-site/public/preview-runtime/manifest.json
  - packages/viewer-site/src/app/api/preview-runtime/shell/route.ts
  - packages/agent-service/src/server.ts
  - packages/author-site/src/middleware.ts
```

---

## 一、部署拓扑

使用端在开发环境中与另外两个服务协同工作：

```
┌─────────────────────────────────────────────────────────────────┐
│                        开发环境                                  │
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │  viewer-site    │  │  author-site     │  │  agent-service  │ │
│  │  :3300          │──│  :3200          │  │  :3201          │ │
│  │                 │  │                 │  │                 │ │
│  │  项目列表页     │  │  viewer 端点     │  │  项目列表 API   │ │
│  │  预览页(iframe) │  │  配置接口       │  │  项目详情 API   │ │
│  │                 │  │  Demo 接口      │  │  版本 API       │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│         │                     │                      │          │
│         │ API 调用            │ iframe 嵌入          │ API 调用 │
│         └─────────────────────┴──────────────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

**与旧架构的区别**：

- 旧架构：使用端调用创作端的 `/embed/` 端点 + postMessage 通信
- 当前架构：使用端嵌入创作端的 `/viewer/` 端点，无 postMessage

## 二、环境变量配置

使用端通过 `.env.local` 文件配置环境变量：

| 变量                            | 示例值                  | 说明                                           |
| :------------------------------ | :---------------------- | :--------------------------------------------- |
| `NEXT_PUBLIC_WEB_URL`           | `http://localhost:3200` | author-site 创作端地址，用于生成 viewer iframe URL |
| `NEXT_PUBLIC_AGENT_SERVICE_URL` | `http://localhost:3201` | agent-service 地址，用于使用端只读 AI 问答 API |
| `NEXT_PUBLIC_DATA_BASE`         | 空字符串 / `http://localhost:3200` | viewer-site 读取项目数据的基址；同源静态部署保持为空，本地开发跨 author-site 读取时设为 author-site 地址 |
| `PREVIEW_RUNTIME_SOURCE`        | `local`                 | viewer 预览 iframe 的 runtime 来源；仅诊断时设为 `cdn` |
| `PREVIEW_SHELL_MODE`            | `inline`                | viewer 生产静态导出默认 inline shell，开发环境默认 fixed shell |

这些变量以 `NEXT_PUBLIC_` 前缀开头，Next.js 会将其注入到客户端代码中，API 客户端可直接读取。

## 三、CORS 配置

使用端（3300）需要跨域访问 author-site 创作端（3200）和 agent-service（3201）的 API，因此两个服务都需要配置 CORS 允许使用端的来源。

### 3.1 agent-service CORS 配置

agent-service 使用 Fastify 的 `@fastify/cors` 插件，通过 `CORS_ORIGINS` 环境变量配置允许的来源：

- 默认允许：`http://localhost:3200`、`http://127.0.0.1:3200`（创作端）
- 使用端新增：`http://localhost:3300`、`http://127.0.0.1:3300`
- 生产环境通过 `CORS_ORIGINS` 环境变量统一配置

使用端 AI 问答由浏览器直接请求 agent-service 的只读接口，因此生产环境的 `CORS_ORIGINS` 也必须包含 viewer-site 实际访问域名。

Docker Compose 会把 `.env.docker` 中的 `CORS_ORIGINS` 注入到 agent-service；如果新增正式访问域名，需要先更新 `.env.docker`，再通过部署脚本上线。

### 3.2 author-site 创作端 CORS 配置

author-site 创作端使用 Next.js 中间件处理 CORS，针对 API 路由和 viewer 路由设置响应头：

- 仅对 `/api/` 和 `/viewer/` 路由添加 CORS 头
- 默认允许的使用端来源：`http://localhost:3300`、`http://127.0.0.1:3300`
- 生产环境允许来源通过 `CORS_ORIGINS` 注入，必须包含 viewer-site 实际访问地址
- 设置 `Access-Control-Allow-Credentials: true` 支持 Cookie 传递
- 对允许来源发起的 `OPTIONS` 预检请求，在认证和具体 API 路由处理之前返回 `204 No Content`

生产环境验证示例：

```bash
curl -i -X OPTIONS \
  -H 'Origin: http://10.130.33.131:3300' \
  -H 'Access-Control-Request-Method: GET' \
  http://10.130.33.131:3200/api/templates
```

预期响应包含 `Access-Control-Allow-Origin: http://10.130.33.131:3300`，状态码为 `204`。

### 3.3 screenshot-service CORS 配置

screenshot-service 也通过 Docker Compose 接收 `CORS_ORIGINS`。author-site 服务端调用截图服务使用 Docker 内网地址 `http://screenshot-service:3202`，浏览器端公开地址由 `NEXT_PUBLIC_SCREENSHOT_SERVICE_URL` 控制。

## 四、开发命令

| 命令              | 说明                                                        |
| :---------------- | :---------------------------------------------------------- |
| `pnpm dev:viewer` | 仅启动使用端开发服务器                                      |
| `pnpm dev`        | 同时启动 author-site + agent-service + viewer-site + screenshot-service |

## 五、Next.js 配置

使用端的 `next.config.js` 需要配置：

- **transpilePackages**：将 `@workbench/shared` 加入转译列表，确保 workspace 依赖正常工作
- **preview runtime env**：将 `PREVIEW_RUNTIME_SOURCE`、`PREVIEW_SHELL_MODE` 和 `CDN_BASE_URL` 注入到共享 PreviewPanel，默认使用同源 runtime
- **静态导出 shell 策略**：开发环境可使用 `/api/preview-runtime/shell` 固定 shell；生产静态导出没有动态 route，因此默认使用 inline shell，并把 runtime base 绑定到当前 viewer origin

正式环境的 viewer-site 采用静态导出镜像，`NEXT_PUBLIC_AGENT_SERVICE_URL` 和 `NEXT_PUBLIC_DATA_BASE` 需要在 Docker build 阶段通过 build args 注入。构建脚本会先执行 `build:preview-runtime`，把 `preview-runtime/manifest.json` 和 vendor chunks 写入 viewer-site public 目录，使发布 iframe 可以从 viewer 同源加载 React、lucide、framer 和 `@preview/sdk`。

### 5.1 published 数据静态映射

Docker viewer 镜像通过 nginx 把宿主 `data/published` 只读挂载到 `/data`：

- `/data/projects.json` 映射到 `data/published/projects-index.json`，供项目列表读取。
- `/data/{projectId}/project.json` 和 `/data/{projectId}/demos/{pageId}/iframe.html` 走 HTML/JSON 静态映射并返回 `Cache-Control: no-store`，确保重新发布后浏览端能立即读到最新项目数据和 iframe shell。
- 截图、schema、图片资源走通用 `/data/` 静态映射。
- `/data/{projectId}/demos/{pageId}/compiled.js` 走单独的正则映射并设置长期不可变缓存。该 location 必须用正则捕获拼出 alias 目标，不能在同一个正则 location 中组合 `alias` 和 `rewrite`；否则 nginx 会在请求 demo JS 时返回 500，导致发布 iframe 空白。

发布 iframe 中的页面模块通过 `/data/{projectId}/demos/{pageId}/compiled.js?v={publishBatch}` 直接 dynamic import，和 `project.json` 中的 `compiledJsPath` 保持一致；`iframeHtmlPath` 同样带发布批次参数。文件落盘路径不包含查询参数，查询参数只用于让浏览器绕开上一版 iframe 与 JS 的缓存。`compiled.js` 必须能从 viewer 同源返回 `application/javascript`，并带 `Access-Control-Allow-Origin: *`，以支持 iframe 和外部嵌入场景。
