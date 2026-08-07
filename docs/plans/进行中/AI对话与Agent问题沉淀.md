# AI 对话与 Agent 问题沉淀

## 当前问题

### P0：原型页静默注册失败 + 工具链零反馈死锁

- **现象**：AI 创建原型页（`prototype.html` + `prototype.css` + `config.schema.json`），`writeFile` 返回 `runtimeValidation: { ok: true }`，但 `listPages` 从未列出该页面。AI 在无诊断信息的情况下重试 4 个不同页面 ID、数十次工具调用，全部失败。
- **影响范围**：所有新建原型页场景。AI 无法感知失败原因，进入重试循环，任务严重延迟。
- **当前结论**：两阶段校验（agent-service 即时校验 + project-core 异步注册）之间存在信息断层。即时校验返回 `ok: true` 但注册阶段可能因 schema 类型语义问题（如 `type: "text"`）静默拒绝。
- **修复摘要**：待定位根因并实施
- **验证状态**：未修复
- **后续事项**：复现定位注册失败根因；增加跨阶段诊断通道；消除 listPages 异步快照延迟
- **相关文档**：[原型页静默注册失败与工具链反馈缺失问题分析](./AI对话与Agent-原型页静默注册失败与工具链反馈缺失问题分析.md)

### P1：captureScreenshot 绑定用户 UI 焦点而非 workspace 状态

- **现象**：AI 清理画布布局后，`captureScreenshot` 仍加载用户 UI 焦点页（已删除的旧页面），报 `preview code file not found`
- **影响范围**：当用户 UI 焦点停留在无效页面时，AI 无法通过截图验证工作结果
- **当前结论**：截图工具与用户前端焦点强绑定，与 workspace 后台状态解耦
- **后续事项**：考虑支持指定 pageId 截图，不依赖用户焦点

### P2：workspace-tree.json 无效时系统全量覆盖重写

- **现象**：`workspace-tree.json` 变为无效 JSON 时，系统完全重写文件（包括修改已有页面的 `name`、`order`、`routeKey`），而非拒绝写入或增量修正
- **当前结论**：加剧 WORKSPACE_EXTERNAL_DRIFT 问题；增加 AI 恢复上下文难度
- **相关**：已有 P4 EXTERNAL_DRIFT 沉淀（`原型页升级死锁与AI工具链问题沉淀.md`）

### P3：listPages 异步快照延迟

- **现象**：系统后台扫描已注册页面，但 `listPages` 返回旧快照，导致 AI 误判创建失败
- **追踪**：需测量延迟量级并提供"扫描中"状态标记

---

## 已完成 / 已有沉淀（仅索引）

- 识图子代理 "404 No active credentials for provider: gemini"（2026-08）：`visionModelId` 存储为 `providerId/modelId`，但供应商模型列表中的完整 ID 带内部前缀（如 `OmniRoute/jojo/Qwen3.6-35B-A3B-FP8`）。`getVisionModel` 剥离首段后得到裸模型 ID `Qwen3.6-35B-A3B-FP8`，网关对图片请求无法识别，回退到无凭据的 gemini 上游。**已修复**：`getVisionModel` 按后缀匹配回写为供应商模型列表中的完整 ID（`model-manager.ts` 的 `resolveListedModelId`），并加单测覆盖。排查要点：用真实供应商 apiKey 与裸/完整模型 ID 直连网关 `/chat/completions` 复现；`visionModelId` 正确格式应为 `providerId/完整模型ID`。
- 附件上传 "Failed to fetch"（2026-08）：Docker 容器误用 `.env`（dev 端口 CORS 白名单）启动而非 `.deploy.env`，agent-service CORS 预检不返回 `access-control-allow-origin`，非图片附件（HTTP POST `/api/agent/:sessionId/attachments`）被浏览器拦截；图片/文字走 WebSocket 不受影响。**已于 2026-08-05 复发**（`docker compose up` 自动读取根 `.env` 覆盖了 compose 默认 3200/3300 白名单）。已用 `docker compose --env-file .deploy.env up -d` 重建容器修复并浏览器实测通过。防回归措施：根 `.env` 的 CORS_ORIGINS 已合并为 dev(4200/4300)+Docker(3200/3300) 全量列表；`AGENTS.md` 已沉淀 Docker 栈必须用 `--env-file .env.docker` 启动的坑点。排查要点：curl 预检看 `access-control-allow-origin`；`docker inspect <容器> | grep CORS_ORIGINS` 核对实际生效值
- EXTERNAL_DRIFT 自动重试 → `原型页升级死锁与AI工具链问题沉淀.md` P4
- 自动修复循环 + DUPLICATE_TOP_LEVEL_DECLARATION → 已有修复
- bash 沙箱 `node -e` 矛盾 → 已有修复
- 原型→高保真升级后残留文件清理 → 已有修复（`deleteFile` 工具）
- P4：引用元素 label/context 恒为空 → `inline-tag-input.tsx` `insertTag` 补充 `dataset.tagType/tagLabel/tagContext` 写入（`check:ai-chat-shared` 通过）
- P5：截图 dependency_import（编译缓存与模块 TTL 不一致）→ `compile-cache.ts` 加 25min TTL + `screenshots.ts` dependency_import 重试（`check:screenshot` 通过）
- 复盘报告：`docs/plans/已完成/对话记录分析-session-1785731809479.md`
- 附件「我发的是什么」复述爆炸 + 聊天文件在文件栏不显示（2026-08-06）：三层根因——附件按项目级累积且不清理、`saveUploadedFileAttachment` 不上内容去重（同一文档重复 5 份）、`formatUploadedFilesForPrompt` 每轮全量注入历史附件且提示词误导模型把历史当本轮复述。**已修复**：① 附件按 sha256 内容去重复用既有 attachmentId；② prompt 拆分「本轮上传/历史附件」、历史去重+裁剪（上限 20）+「以本轮为准作答」指令；③ 文件栏展示聊天附件（`lib/ai-attachments.ts` + `/api/sessions/:id/attachments`），`chat-attachments-updated` 事件驱动文档/代码视图刷新；④ 支持剪切转知识库。验证 `check:agent`(450)、`check:author`(1003) 通过。方案见 `docs/plans/进行中/创作端-聊天文件展示与转知识库-实现方案.md`

---

## 近期行为变更

### Vision 子代理图片 URL 解析策略（2026-08-05）

- **变更内容**：子代理 vision 下载路径不再裸 `fetch(url)`，改为：
  - `/api/images/...` → `readGlobalImageById(imageId)` 本地图床读取，零 HTTP。
  - `/api/screenshots/file/...` → 用 `screenshotServiceUrl` 归一化成绝对地址后 fetch（服务端内部）。
  - 其他 http(s) URL → 保持 fetch，加 `AbortSignal` 超时。
- **根因**：平台暴露给 Agent 的图床 URL 全是相对路径，但 delegateTask vision `images` 参数标为"必须绝对"（`subagent-tool.ts:26`），system-prompt 示例硬编码 `http://localhost:4202`。纯文本主模型被迫拼 host，先猜 `localhost:4202`（容器内无服务）、`screenshot-service:3202`（404），最后幻觉出 `image-service:3202` → `fetch failed`。
- **设计不变式**：模型上下文里出现的图片/截图 URL 一律用相对路径（`/api/images/...`、`/api/screenshots/file/...`），由浏览器按用户实际访问的源解析。绝对 URL（含 localhost、Docker 内网 host）只用于服务端内部取数，绝不暴露给模型和用户。
- **相关文件**：
  - `src/backends/pi-agent.ts`（新增 `resolveUrlPathname`，vision 下载路径重构）
  - `src/backends/pi-tools/screenshot-tool.ts`（截图 URL 从绝对改为相对）
  - `src/backends/pi-tools/subagent-tool.ts`（`images` 参数描述移除"must be absolute"）
  - `packages/author-site/src/lib/agent/prompts/system-prompt.md`（删除 `localhost:4202` 示例，补充相对路径规则）
- **验证状态**：`pnpm check:agent` 全部通过（52 文件 439 测试），含 4 个新增 vision 下载路径测试。

### Vision 模型图片上下文策略（2026-08）

- **变更内容**：用户上传图片仅在发送当轮以原始 base64 进入 LLM 上下文，之后每轮通过 `context` hook 剥离所有历史消息（含 user / assistant / toolResult）中的 image part，仅保留入库 URL 引用文本。
- **新增工具**：`readUserImage` — 模型可按需从全局图床回读历史图片内容。
- **修复 bug**：vision 路径 `autoPersistText` 从未拼入 promptContent；非 vision 路径 URL 文本被 `【图片内容】` 前缀覆盖丢失。
- **相关文件**：`src/utils/image-context-strip.ts`、`src/backends/pi-agent.ts`、`src/backends/pi-tools/read-user-image-tool.ts`、`src/backends/pi-tools/global-image-store.ts`（新增 `readGlobalImageById`）。
- **验证状态**：`pnpm check:agent` 全部通过。`WORKBENCH_TOOL_VERSION` 24 → 25。
