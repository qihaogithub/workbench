---
kind: external_dependency
name: Puppeteer 浏览器自动化
slug: puppeteer-浏览器自动化
category: external_dependency
scope:
    - '**'
---

### Puppeteer 浏览器自动化
- **角色**：截图服务的核心依赖，用于在无头模式下渲染页面并生成截图
- **集成点**：独立的 screenshot-service 微服务，通过 Fastify 暴露 HTTP API
- **平台约束**：Docker 环境下使用 `/usr/bin/chromium`，需要配置 `PUPPETEER_DISABLE_SANDBOX=true`
- **依赖关系**：依赖 author-site 的编译端点和本地 Chrome/Chromium 浏览器
- **性能考虑**：独立容器部署，CPU 限制 1.0，内存限制 1536m，共享内存 256m