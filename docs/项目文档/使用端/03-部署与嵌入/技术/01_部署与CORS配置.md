# 部署与 CORS 配置 - 实现设计

> 版本：v2.0
> 创建日期：2026-05-04
> 更新日期：2026-06-29

---

```yaml
covers:
  - docker-compose.yml
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
| `NEXT_PUBLIC_DATA_BASE`         | `/data`                 | viewer-site 静态导出时读取项目数据的基址 |
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
