# 部署与 CORS 配置 - 实现设计

> 版本：v2.0
> 创建日期：2026-05-04
> 更新日期：2026-05-29

---

```yaml
covers:
  - packages/viewer-site/next.config.js
  - packages/viewer-site/.env.local
  - packages/viewer-site/package.json
  - packages/agent-service/src/server.ts
  - packages/web/src/middleware.ts
```

---

## 一、部署拓扑

使用端在开发环境中与另外两个服务协同工作：

```
┌─────────────────────────────────────────────────────────────────┐
│                        开发环境                                  │
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │  viewer-site    │  │  web 创作端      │  │  agent-service  │ │
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
- 新架构：使用端嵌入创作端的 `/viewer/` 端点，无 postMessage

## 二、环境变量配置

使用端通过 `.env.local` 文件配置环境变量：

| 变量                            | 示例值                  | 说明                                           |
| :------------------------------ | :---------------------- | :--------------------------------------------- |
| `NEXT_PUBLIC_WEB_URL`           | `http://localhost:3200` | web 创作端地址，用于生成 viewer iframe URL     |
| `NEXT_PUBLIC_AGENT_SERVICE_URL` | `http://localhost:3201` | agent-service 地址，用于调用项目列表和详情 API |

这些变量以 `NEXT_PUBLIC_` 前缀开头，Next.js 会将其注入到客户端代码中，API 客户端可直接读取。

## 三、CORS 配置

使用端（3300）需要跨域访问 web 创作端（3200）和 agent-service（3201）的 API，因此两个服务都需要配置 CORS 允许使用端的来源。

### 3.1 agent-service CORS 配置

agent-service 使用 Fastify 的 `@fastify/cors` 插件，通过 `CORS_ORIGINS` 环境变量配置允许的来源：

- 默认允许：`http://localhost:3200`、`http://127.0.0.1:3200`（创作端）
- 使用端新增：`http://localhost:3300`、`http://127.0.0.1:3300`
- 生产环境通过 `CORS_ORIGINS` 环境变量统一配置

### 3.2 web 创作端 CORS 配置

web 创作端使用 Next.js 中间件处理 CORS，针对 API 路由和 viewer 路由设置响应头：

- 仅对 `/api/` 和 `/viewer/` 路由添加 CORS 头
- 允许的来源：`http://localhost:3300`、`http://127.0.0.1:3300`
- 设置 `Access-Control-Allow-Credentials: true` 支持 Cookie 传递

## 四、开发命令

| 命令              | 说明                                                        |
| :---------------- | :---------------------------------------------------------- |
| `pnpm dev:viewer` | 仅启动使用端开发服务器                                      |
| `pnpm dev`        | 同时启动 author-site + agent-service + viewer-site 三个服务 |

## 五、Next.js 配置

使用端的 `next.config.js` 需要配置：

- **transpilePackages**：将 `@opencode-workbench/shared` 加入转译列表，确保 workspace 依赖正常工作
- **无自定义 webpack 配置**：保持与创作端一致的构建行为
