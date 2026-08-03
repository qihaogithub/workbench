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

- EXTERNAL_DRIFT 自动重试 → `原型页升级死锁与AI工具链问题沉淀.md` P4
- 自动修复循环 + DUPLICATE_TOP_LEVEL_DECLARATION → 已有修复
- bash 沙箱 `node -e` 矛盾 → 已有修复
- 原型→高保真升级后残留文件清理 → 已有修复（`deleteFile` 工具）
- P4：引用元素 label/context 恒为空 → `inline-tag-input.tsx` `insertTag` 补充 `dataset.tagType/tagLabel/tagContext` 写入（`check:ai-chat-shared` 通过）
- P5：截图 dependency_import（编译缓存与模块 TTL 不一致）→ `compile-cache.ts` 加 25min TTL + `screenshots.ts` dependency_import 重试（`check:screenshot` 通过）
- 复盘报告：`docs/plans/已完成/对话记录分析-session-1785731809479.md`
