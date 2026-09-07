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

### SQLite 损坏恢复

若出现 `database disk image is malformed`，先停写并将 `data/diagnostics/editor-events.db`、存在的 WAL/SHM 和 `data/editor-diagnostics/*.jsonl` 备份到仓库外。仅在副本上执行 SQLite `.recover`，按当前事件表结构导入可读完整事件，再使用共享事件归一化规则导入 JSONL、按事件 ID 去重；无法归属的碎片保留在恢复副本中，不推测补造事件。新库通过 `PRAGMA integrity_check` 后再替换，最后验证真实 API 写入和诊断 CLI 查询。查询的 `eventGapDetected=false` 只表示当前数据源可用，不能证明历史事件已完整恢复。禁止将修复后的数据库或恢复 SQL 提交到 Git。

| 判断 | 依据 |
|:-----|:-----|
| 事件源是否可信 | 输出 `diagnostics.sqliteUsed`、`jsonlFallbackUsed`、`dbUnavailable`、`eventGapDetected` 和 `warnings` |
| revision 链路是否收敛 | 先看 `workspaceFlows` 的 mutation、projection、canonical 阶段和最终 `status` |
| 延迟是否异常 | 看 `performance.metrics` 各项的 `count/p50/p95/p99/max`；`count=0` 表示本次查询无可用样本 |
| 打开项目链路 | `project.opened`、`session.created/reused`、`workspace.bound` |
| 协同是否覆盖 | `collab.snapshot_received`、`snapshot.apply`、外部文件变更命中或遗漏 |
| 保存是否落盘 | `autosave.flush_*`、`persist-workspace`、退出前保存结果 |
| 手绘保存 patch 校验 | `page.sketch_patch_validated`、`page.sketch_patch_rejected`；查看 payload 的 `targetSource` 区分 `server_patch` 回放和 `client_scene` 校验 |
| AI 是否改写 | `ai.run_started`、工具调用摘要、文件变更、`ai.run_finished` |
| 预览错误来源 | `preview.error`、`post_generation_validation`、iframe runtime 或自动修复事件 |

### sandbox HTML 运行时闭环

对交互 HTML 先执行：

```bash
corepack pnpm diagnostics:preview -- --project <projectId> --since 24h --format text
corepack pnpm diagnostics:preview -- --project <projectId> --since 24h
```

检查 JSON 的 `sandbox` 摘要和 `preview.sandbox_*` 事件：

| 现象 | 首要字段/判断 | 处理路径 |
|:-----|:--------------|:---------|
| policy mismatch | `sandbox.policyMismatch`、`failureCodes`；通常为 `SANDBOX_POLICY_MISMATCH` | 对照页面 `html-import.meta.json` 的 policy/version 与当前 renderer；重新签发前先确认源码 hash 和分析版本一致，不能直接放宽 CSP |
| expired ticket | `sandbox.expiredTicket` 或 `EXPIRED_EXECUTION_TICKET` | 票据仅短时、一次性使用；重新打开/刷新页面重新申请执行票据，检查客户端是否缓存旧 URL；不要把 execution ID 写入日志或复制到工单 |
| blocked request | `sandbox.blockedRequestCount` 与 runtime failed/screenshot completed 的 `blockedRequestCount` | 确认是否为预期的跨源、表单、顶层导航或能力阻断；保留 blocked 次数和策略版本即可，不允许为恢复页面而增加 `connect-src` 或 `allow-same-origin` |
| timeout | `sandbox.timeoutCount`、`sandbox.timeoutMs` 的 p50/p95/p99 与 `errorCode` | 区分页面脚本挂起、截图超时和服务响应超时；先看 `contextClosed`/`browserRestarted`，再按超时阶段定位，不把 timeout 改成无限等待 |
| process/context recovery | `sandbox.contextRecovery.contextClosed`、`browserRestarted`、`recovered` | `browserRestarted=true` 只代表执行器完成恢复尝试，不代表业务成功；结合后续 `sandbox_execution_issued`、`sandbox_screenshot_completed` 或仍未收敛的失败事件判断。连续恢复失败时停机并人工确认 |

诊断摘要只包含 runtime 类型、策略版本、renderer、错误码、超时数值、阻断计数和恢复布尔量。源码、原始 execution ID、channel ID 不应出现在事件 payload、CLI text、JSON 导出包或自动任务账本中；若发现，应立即按“诊断系统自身缺口”处理并停止传播该导出包。

`diagnostics:autosave`、`diagnostics:collab` 和 `diagnostics:preview` 不再只返回单一事件组；它们同时带出 autosave/collab/preview/workspace 事件，便于在一次查询中从草稿 flush 追到 mutation receipt、projection ack 和 canonical materialization。

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
- 手绘 patch 保存成功但诊断 payload 缺少 `targetSource=server_patch`，说明诊断白名单或写入链路没有保留目标来源，无法判断服务端是否真的从 patch 回放生成最终 scene。
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
