# 创作端编辑诊断事件诊断包

## 现象关键词

- 重新打开项目后旧内容复原
- AI 已修复但页面再次报同一错误
- 自动保存显示成功但项目当前态不一致
- 手绘保存无法判断是增量 patch 还是全量草稿 fallback
- 协同快照覆盖磁盘文件
- 预览异常自动修复反复触发
- 诊断导出包缺字段、缺事件或无法定位根因

## 必读

1. `docs/项目文档/创作端/11-诊断与日志/`
2. `docs/项目文档/创作端/03-项目管理/技术/11_实时保存与协同编辑.md`
3. `docs/项目文档/创作端/04-配置与预览/技术/02_实时预览机制.md`
4. `docs/项目文档/创作端/05-AI对话/技术/07_运行进度与事件日志.md`
5. `OPS/CLI/README.md`

## 优先命令

先从项目维度建立最近时间线：

```bash
corepack pnpm diagnostics:recent -- --project <projectId>
corepack pnpm diagnostics:project -- --project <projectId> --since 24h
```

按现象追加分组查询：

```bash
corepack pnpm diagnostics:preview -- --project <projectId> --since 24h
corepack pnpm diagnostics:autosave -- --project <projectId> --since 24h
corepack pnpm diagnostics:collab -- --workspace <workspaceId> --since 24h
corepack pnpm diagnostics:session -- --editor-session <editorSessionId>
corepack pnpm diagnostics:trace -- --trace <traceId>
corepack pnpm diagnostics:operation -- --operation <operationId>
```

需要异步复盘时导出摘要包：

```bash
corepack pnpm diagnostics:export -- --project <projectId> --since 24h --output /tmp/workbench-diagnostics-export.json
```

## 先判断

| 判断 | 依据 |
|:-----|:-----|
| 事件源是否可信 | 输出 `diagnostics.sqliteUsed`、`jsonlFallbackUsed`、`dbUnavailable`、`eventGapDetected` 和 `warnings` |
| 打开项目链路 | `project.opened`、`session.created/reused`、`workspace.bound` |
| 协同是否覆盖 | `collab.snapshot_received`、`snapshot.apply`、外部文件变更命中或遗漏 |
| 保存是否落盘 | `autosave.flush_*`、`persist-workspace`、退出前保存结果 |
| 手绘保存走 patch 还是 fallback | `page.sketch_patch_validated`、`page.sketch_patch_rejected`、`page.openpencil_full_draft_fallback`；查看 payload 的 `targetSource` 区分 `server_patch` 回放和兼容 `client_scene` 校验 |
| AI 是否改写 | `ai.run_started`、工具调用摘要、文件变更、`ai.run_finished` |
| 预览错误来源 | `preview.error`、`post_generation_validation`、iframe runtime 或自动修复事件 |

## 降级规则

只有在诊断 CLI 不可用、输出明确提示 fallback 缺口，或需要核对旧格式字段时，才直接读取：

```bash
rg -n "<projectId>|<editorSessionId>|<pageId>|<traceId>" data/editor-diagnostics
```

直接读取 JSONL 时，结论必须说明这是兜底数据，不能把缺失事件当成未发生。

## 常见根因

- 前端只记录了浏览器内存态，重新打开后自动修复计数或临时状态丢失。
- agent-service 活跃协同房间未收到外部文件变更，旧 Y.Doc 重新成为前端权威值。
- 自动保存 flush 成功但项目当前 workspace 未完成持久化。
- OpenPencil patch-only 保存成功但诊断 payload 缺少 `targetSource=server_patch`，说明诊断白名单或写入链路没有保留目标来源，无法判断服务端是否真的从 patch 回放生成最终 scene。
- OpenPencil dirty-state 缺少可验证 patch，保存成功但走 `page.openpencil_full_draft_fallback`，后续需要结合页面版本、协同和 patch 生成链路判断是否可收敛到增量保存。
- 预览 fast gate 返回结构化错误，但自动修复或诊断导出没有带上稳定 hash、pageId 或 traceId。
- SQLite 事件库不可用时，CLI fallback 没有明确标记数据缺口。

## 维护责任

发现诊断系统自身缺口时按层维护：

| 缺口 | 维护位置 |
|:-----|:---------|
| 缺少事件字段、脱敏规则或写入链路 | `packages/shared/src/diagnostics.ts`、`packages/author-site/src/lib/editor-diagnostics/` |
| CLI 查询、fallback 或导出包不可用 | `OPS/CLI/src/commands/diagnostics.ts`、`OPS/CLI/README.md` |
| 排查步骤或常见根因漂移 | 本诊断包和 `OPS/automations/knowledge/failure-patterns.md` |
| 行为契约变化 | `docs/项目文档/创作端/11-诊断与日志/` |
| 具体未解决问题 | 对应 `docs/plans/进行中/` 模块沉淀文档 |

## 修复后验证

| 修复类型 | 验证 |
|:---------|:-----|
| CLI 或自动任务文档 | `corepack pnpm check:automation` |
| author-site 诊断写入 | `corepack pnpm --filter @workbench/author-site typecheck` 和相关 Jest |
| agent-service run log | `corepack pnpm check:agent` 或定向 Vitest |
| 项目 runtime 状态 | `node packages/project-cli/bin/ow.mjs project validate-runtime <projectId> --json` |

## 停机条件

- 需要清理或修改真实项目数据。
- 需要打开生产服务、真实外部服务或密钥。
- 诊断输出无法判断事件完整性，且 JSONL fallback 也缺关键上下文。
- 同一自动修复或保存问题连续多次修复失败，需要人工决定产品行为。
