# AI 对话与 Agent 问题沉淀

## 图片附件上传被浏览器拦截（2026-08-12）

- 现象：创作端 Docker 编辑页添加图片后提示“附件上传失败：无法连接 AI 服务”。
- 影响范围：浏览器直连 `agent-service` 的图片与 multipart 附件上传；普通同源页面请求不受影响。
- 根因：两项 CORS 配置同时缺失。服务未允许 `X-API-Key` 预检头；更关键的是 Docker Compose 复用了根 `.env` 的 `CORS_ORIGINS`，把容器 `3200/3300` 的实际来源覆盖成 `pnpm dev` 使用的 `4200/4300`，预检没有返回 `Access-Control-Allow-Origin`，浏览器未发送上传 POST。
- 修复摘要：agent-service CORS 允许 `X-API-Key`；Docker 改用 `DOCKER_CORS_ORIGINS` 并在容器内映射为 `CORS_ORIGINS`，从根 `.env` 开发端口配置隔离。
- 验证状态：已重建 agent-service、author-site 和 screenshot-service 容器；`http://localhost:3200` 的预检返回允许来源和 `X-API-Key`；隔离浏览器在项目 `proj_1779608460372` 上传图片并发送到 AI 对话成功，消息进入“AI 正在处理”。
- 相关事实：长期配置说明见 [使用端部署与 CORS 配置](../../项目文档/使用端/03-部署与嵌入/技术/01_部署与CORS配置.md) 与 [Docker 部署方案](../../项目文档/创作端/06-基础设施/技术/03_Docker部署方案.md)。
