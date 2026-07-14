# 独立 Agent 服务层 - 文档索引

> 版本：v2.12
> 创建日期：2026-04-05
> 更新日期：2026-07-14

---

## 文档概览

本系列文档用于指导 `@workbench/agent-service`、`@workbench/agent-client` 与 `@workbench/screenshot-service` 的开发工作。当前服务层已经从历史多后端方案收敛为 **Pi Agent 单后端**：Fastify 负责 HTTP/WebSocket、Session、工作空间与项目管理，Pi Agent 负责模型调用、工具执行和流式事件，并通过 session 级配置接收当前用户的外部工具授权。活动 live Workspace 的所有写入收敛到 **Workspace Mutation Authority** 单写者事务，旧直接写入路径已删除。

核心原则：

- 只注册 `pi-agent` 后端，不恢复 workbench、Claude、Codex、Gemini 等历史多后端适配器。
- 通过 `@earendil-works/pi-agent-core` 进程内嵌入，不依赖外部 workbench Server 或 CLI 子进程。
- 前端消费层只处理 UI 和状态呈现，Agent 服务层负责会话生命周期、文件变更、工具权限和事件流。
- 截图能力由独立 `screenshot-service` 提供，供创作端预览快照和 Pi Agent 截图工具复用。

---

## 文档列表

| 文档                                             | 说明                                                                                                                      | 阅读顺序 | 状态     |
| :----------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------ | :------- | :------- |
| [01-架构设计.md](./01-架构设计.md)               | Fastify 服务、Pi Agent 单后端、Workspace Authority 单写者事务、工具权限、工作空间与截图服务协作                           | 1        | 已更新   |
| [02-接口规范.md](./02-接口规范.md)               | REST API、WebSocket 消息、Workspace Authority API、使用端只读 AI、内部配置同步、校验与模型接口                            | 2        | 已更新   |
| [03-核心模块设计.md](./03-核心模块设计.md)       | Core、Backend、Routes、Session、Workspace、WorkspaceMutationAuthority、Pi Tools、图片资源工具边界、预装 Skills 等模块职责 | 3        | 已更新   |
| [04_SSE_Drain机制.md](./04_SSE_Drain机制.md)     | 历史 workbench SSE drain 问题记录，当前仅作迁移背景参考                                                                   | 4        | 历史参考 |
| [05-快照服务.md](./05-快照服务.md)               | Git/snapshot 双模式、变更比较、丢弃回滚、Session 生命周期                                                                 | 5        | 已完成   |
| [06-Pi-Agent子Agent.md](./06-Pi-Agent子Agent.md) | Pi Agent 子 Agent 委派、生命周期与权限边界                                                                                | 6        | 已完成   |

---

## 快速导航

### 架构设计

- [整体架构](./01-架构设计.md#二整体架构)
- [单后端适配](./01-架构设计.md#31-单后端适配)
- [目录结构](./01-架构设计.md#四目录结构)
- [通信协议](./01-架构设计.md#六通信协议)
- [安全设计](./01-架构设计.md#七安全设计)

### Workspace Authority

- [Authority 架构层](./01-架构设计.md#二整体架构)
- [Authority API 路由](./02-接口规范.md#26-workspace-authority)
- [Authority 模块设计](./03-核心模块设计.md#63-workspacemutationauthority)

### 接口规范

- [REST API](./02-接口规范.md#二rest-api)
- [WebSocket API](./02-接口规范.md#三websocket-api)
- [内部配置同步](./02-接口规范.md#24-内部配置同步)
- [使用端只读 AI 问答](./02-接口规范.md#25-使用端只读-ai-问答)
- [类型定义](./02-接口规范.md#四类型定义)
- [错误处理](./02-接口规范.md#五错误处理)

### 核心模块

- [Core 层](./03-核心模块设计.md#二-core-层)
- [Pi Agent 后端层](./03-核心模块设计.md#三-pi-agent-后端层)
- [Pi Tools 工具层](./03-核心模块设计.md#四-pi-tools-工具层)
- [Session 与快照](./03-核心模块设计.md#五-session-与快照层)
- [路由与事件](./03-核心模块设计.md#七-路由与事件层)

### 快照与子 Agent

- [快照服务](./05-快照服务.md)
- [Pi Agent 子 Agent](./06-Pi-Agent子Agent.md)

---

## 当前代码入口

| 包                              | 路径                           | 职责                                                              |
| :------------------------------ | :----------------------------- | :---------------------------------------------------------------- |
| `@workbench/agent-service`      | `packages/agent-service/`      | Fastify Agent 服务、项目管理 API、Pi Agent 后端、WebSocket 事件流 |
| `@workbench/agent-client`       | `packages/agent-client/`       | 浏览器端 AgentClient/AgentStream SDK                              |
| `@workbench/screenshot-service` | `packages/screenshot-service/` | Fastify + Puppeteer 截图服务，支持同步单页和异步批量截图          |
| `@workbench/shared`             | `packages/shared/`             | 共享契约类型、校验器和预览 iframe 模板                            |
| `@workbench/demo-ui`            | `packages/demo-ui/`            | 创作端与使用端复用的 React 预览、配置和画布组件                   |

关键源码入口：

- `packages/agent-service/src/server.ts` - 服务启动、CORS、WebSocket、限流、Pi Agent 注册。
- `packages/agent-service/src/routes/` - Agent、项目、模型、校验、内部配置和 WebSocket 路由。
- `packages/agent-service/src/backends/pi-agent.ts` - Pi Agent 后端适配、模型配置、工具事件转换、文件变更捕获。
- `packages/agent-service/src/backends/pi-tools/` - 工作台工具集。
- `packages/agent-service/src/session/` - SessionStore、SessionGuard、SnapshotService。
- `packages/agent-service/src/workspace/` - 临时工作空间、项目工作空间管理和 Workspace Mutation Authority。
- `packages/screenshot-service/src/routes/screenshots.ts` - 截图生成、批量任务、缓存读取。

---

## 核心设计决策

| 决策           | 当前结论                                                                                                         |
| :------------- | :--------------------------------------------------------------------------------------------------------------- |
| 后端形态       | 只支持 Pi Agent 单后端，`AgentType` 固定为 `pi-agent`                                                            |
| Agent 运行方式 | 进程内动态导入 `@earendil-works/pi-agent-core` 和 node 子入口                                                    |
| 工具权限       | 由 Pi Tools 权限白名单、路径校验、用户确认和后端快照共同约束                                                     |
| 模型配置       | 通过 author-site 恢复的全局 backend providers、Session 级 model config 和 Pi Agent 环境变量组合生效              |
| 网页读取       | `webRead` 默认读取公开 HTTP/HTTPS 文本页面，并拒绝本机、内网、保留地址和非文本内容                               |
| 联网搜索       | `webSearch` 使用 Brave Search API 免费额度方案，默认关闭并由环境变量显式启用                                     |
| 外部授权       | Figma MCP 与钉钉 dws 只接收当前用户 session 级授权；agent-service 不持有平台全局外部账号                         |
| 预装 Skills    | agent-service 随包携带 `design-taste-frontend`，通过 `readPreinstalledSkill` 按需读取完整指令                    |
| 事件流         | WebSocket 通过 `ws-event-router.ts` 统一转发 stream、thought、tool、plan、permission、user choice、finish、error |
| 文件变更       | `snapshot-service` 同时支持 Git 仓库和普通目录快照模式                                                           |
| Workspace 写入 | 活动 live Workspace 所有写入必须经过 WorkspaceMutationAuthority 单写者事务提交，旧直接写入路径已删除             |
| 截图           | `screenshot-service` 使用 author-site `/api/compile` 编译并通过 Puppeteer 渲染                                   |

---

## 更新日志

| 日期       | 版本  | 更新内容                                                                       |
| :--------- | :---- | :----------------------------------------------------------------------------- |
| 2026-04-05 | v1.0  | 初始版本，完成独立服务层文档                                                   |
| 2026-04-05 | v1.1  | 添加早期 AionUi/workbench 参考                                                 |
| 2026-05-29 | v2.0  | 根据当时实现更新服务层文档                                                     |
| 2026-06-04 | v2.1  | 新增快照服务文档                                                               |
| 2026-06-21 | v2.2  | 新增 Pi Agent 子 Agent 实现文档                                                |
| 2026-06-26 | v2.3  | 按当前代码移除多后端主线叙述，更新为 Pi Agent 单后端索引                       |
| 2026-06-26 | v2.4  | 补充用户级外部工具授权的 session 注入与工具边界                                |
| 2026-06-26 | v2.5  | 新增 Pi Agent `webSearch` 联网搜索能力说明，采用 Brave Search API 免费额度方案 |
| 2026-06-26 | v2.6  | 新增 Pi Agent `webRead` 网页正文读取能力和公网 URL 安全边界                    |
| 2026-06-27 | v2.7  | 新增创作端 Agent 预装 `design-taste-frontend` Skill 与按需读取工具说明         |
| 2026-06-28 | v2.8  | 补充模型列表 route/service 分层和 shared/demo-ui 包边界                        |
| 2026-06-30 | v2.9  | 新增 `requestUserChoice` 需求确认卡片工具和 `user_choice_request` 事件说明     |
| 2026-07-01 | v2.10 | 补充全局 backend providers 的运行时副本定位和 author-site 启动恢复机制         |
| 2026-07-09 | v2.11 | 明确预览区选中图片由 author-site 先资产化，Pi Agent 图片工具消费受管资产路径   |
| 2026-07-14 | v2.12 | 补齐 Workspace Mutation Authority 架构层、API 路由、模块设计和核心决策         |
