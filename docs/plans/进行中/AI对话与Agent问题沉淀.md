# AI 对话与 Agent 问题沉淀

## 项目清单永久“生成中”与文档来源不一致（2026-09-11）

- 现象：项目清单长期显示项目/页面“生成中”，并出现多条“未命名文档”；文档目录反而显示为空。
- 影响范围：行内新建知识文档、文档列表一致性、项目清单派生快照、Knowledge Service 启动恢复与前端轮询。
- 根因：新建入口在用户确认标题前持久化空文档；列表读取任一缺失正文就整体失败且前端吞错；fallback 的 pending 没有真实 job 仍被映射为生成中；派生快照未校验 Authority revision/rootHash；共享 SQLite 损坏使服务在监听前 reconcile 退出。
- 修复摘要：新建改为提交标题后单次创建；列表返回 `{ items, issues }` 并支持 Authority 清理 manifest 孤儿；清单拆分 projection freshness 与 generation activity，仅真实 active job 轮询；治理文档独立分组；SQLite 启动前整体隔离 DB/WAL/SHM，先监听再后台重建，备份写后校验。
- 验证状态：目标项目 6 条误创建记录已逐条经 Authority 删除到 revision 14，5 个零字节文件已移除；当前为 0 个项目文档、1 个治理分组 AI 记忆、0 个来源异常，项目与页面任务均进入 ready，界面停止轮询。旧 workspace 状态记录了一份正文 hash，但对应 Authority backup blob 已缺失，因此只保留状态证据且未自动恢复正文。
- 相关事实：[文档应用层](../../项目文档/创作端/09-知识库/技术/05_文档应用层与项目子资源API.md)、[项目清单与语义索引](../../项目文档/创作端/05-AI对话/技术/12_项目资源清单与语义索引.md)、[知识库服务整体架构](../../项目文档/独立知识库服务/技术/01_整体架构设计.md)。

## 图片附件上传被浏览器拦截（2026-08-12）

- 现象：创作端 Docker 编辑页添加图片后提示“附件上传失败：无法连接 AI 服务”。
- 影响范围：浏览器直连 `agent-service` 的图片与 multipart 附件上传；普通同源页面请求不受影响。
- 根因：两项 CORS 配置同时缺失。服务未允许 `X-API-Key` 预检头；更关键的是 Docker Compose 复用了根 `.env` 的 `CORS_ORIGINS`，把容器 `3200/3300` 的实际来源覆盖成 `pnpm dev` 使用的 `4200/4300`，预检没有返回 `Access-Control-Allow-Origin`，浏览器未发送上传 POST。
- 修复摘要：agent-service CORS 允许 `X-API-Key`；Docker 改用 `DOCKER_CORS_ORIGINS` 并在容器内映射为 `CORS_ORIGINS`，从根 `.env` 开发端口配置隔离。
- 验证状态：已重建 agent-service、author-site 和 screenshot-service 容器；`http://localhost:3200` 的预检返回允许来源和 `X-API-Key`；隔离浏览器在项目 `proj_1779608460372` 上传图片并发送到 AI 对话成功，消息进入“AI 正在处理”。
- 相关事实：长期配置说明见 [使用端部署与 CORS 配置](../../项目文档/使用端/03-部署与嵌入/技术/01_部署与CORS配置.md) 与 [Docker 部署方案](../../项目文档/创作端/06-基础设施/技术/03_Docker部署方案.md)。
