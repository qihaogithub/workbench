---
covers:
  - OPS/CLI/src/commands/diagnostics.ts
  - OPS/CLI/src/commands/workspace-authority.ts
  - OPS/CLI/src/index.ts
  - OPS/CLI/README.md
  - OPS/CLI/package.json
  - package.json
  - packages/author-site/src/lib/editor-diagnostics/store.ts
  - packages/author-site/src/app/api/editor-diagnostics/export/route.ts
---

# Codex 查询 CLI 与导出包

> 更新日期：2026-07-10

本文描述创作端诊断事件的命令行查询入口、JSON 输出契约和导出包组成。事件采集和写入链路见 [创作端诊断事件系统](./01_创作端诊断事件系统.md)。

## CLI 定位

诊断 CLI 是给 Codex 和开发者使用的固定入口。它隐藏 SQLite、JSONL 和 AI run log 的内部路径，让排查时先问“某个项目或 trace 发生了什么”，而不是先猜日志文件在哪里。

CLI 实现在 `OPS/CLI`，根目录暴露稳定脚本别名。输出默认 JSON，便于 Codex 继续分析；`--format text` 只作为人工快速浏览辅助。文本模式遇到错误事件或 `*_failed` 事件时，会在基础时间线后追加 `workspace`、`page`、`phase`、`code` 和 `status` 摘要，方便直接识别同步失败停在哪个边界。

## 稳定命令

常用入口：

```bash
corepack pnpm diagnostics:recent -- --project <projectId>
corepack pnpm diagnostics:project -- --project <projectId> --since 24h
corepack pnpm diagnostics:session -- --editor-session <editorSessionId>
corepack pnpm diagnostics:trace -- --trace <traceId>
corepack pnpm diagnostics:operation -- --operation <operationId>
corepack pnpm diagnostics:autosave -- --project <projectId>
corepack pnpm diagnostics:collab -- --workspace <workspaceId>
corepack pnpm diagnostics:preview -- --project <projectId>
corepack pnpm diagnostics:export -- --project <projectId> --since 24h
corepack pnpm workspace-authority:status -- <projectId> <workspaceId> --session <sessionId>
corepack pnpm workspace-authority:preflight -- <projectId> <workspaceId> --session <sessionId>
corepack pnpm workspace-authority:bootstrap -- <projectId> <workspaceId> --session <sessionId>
corepack pnpm workspace-authority:reconcile-adopt -- <projectId> <workspaceId> --session <sessionId>
corepack pnpm workspace-authority:reconcile-restore -- <projectId> <workspaceId> --session <sessionId>
corepack pnpm workspace-authority:migrate -- --workspace <workspaceId> --json
```

正式环境查询仍使用同一组稳定别名，只是增加远程数据源参数。CLI 通过 SSH 在远端打包诊断文件快照，再回到本地解析 SQLite 和 JSONL，因此生产机不需要安装 OPS CLI 或 Node 依赖：

```bash
OPS_CLI_REMOTE_PASSWORD=<password> corepack pnpm diagnostics:autosave -- \
  --remote-host 10.130.33.131 \
  --remote-user qihao \
  --project <projectId> \
  --since 24h
```

远程模式默认只读取诊断主库、JSONL spool 和 AI run log 索引。`--remote-data-dir` 可指定生产 `data` 目录；未指定时按 `$DATA_DIR`、`/opt/opencode-workbench/data`、`/opt/workbench/data`、`/app/data` 和 `/data` 探测。密码只通过环境变量读取，不能写入命令文档、仓库文件或导出包。

OPS CLI 内部命令为：

```bash
corepack pnpm --filter @workbench/cli-tools exec tsx src/index.ts diagnostics <kind>
corepack pnpm --filter @workbench/cli-tools exec tsx src/index.ts workspace-authority-status <projectId> <workspaceId> --session <sessionId>
corepack pnpm --filter @workbench/cli-tools exec tsx src/index.ts workspace-authority-preflight <projectId> <workspaceId> --session <sessionId>
corepack pnpm --filter @workbench/cli-tools exec tsx src/index.ts workspace-authority-bootstrap <projectId> <workspaceId> --session <sessionId>
corepack pnpm --filter @workbench/cli-tools exec tsx src/index.ts workspace-authority-reconcile-adopt <projectId> <workspaceId> --session <sessionId>
corepack pnpm --filter @workbench/cli-tools exec tsx src/index.ts workspace-authority-reconcile-restore <projectId> <workspaceId> --session <sessionId>
```

## JSON 输出契约

JSON 输出必须包含查询元信息、诊断完整性状态、事件列表、Workspace revision 链路、性能分位和 AI run log 索引。核心结构如下：

```json
{
  "success": true,
  "query": {
    "kind": "trace",
    "trace": "trace-xxx",
    "since": "2026-07-02T00:00:00.000Z"
  },
  "diagnostics": {
    "sqliteUsed": true,
    "jsonlFallbackUsed": false,
    "dbUnavailable": false,
    "eventGapDetected": false,
    "warnings": []
  },
  "events": [],
  "workspaceFlows": [],
  "performance": {
    "unit": "ms",
    "metrics": {}
  },
  "agentRunLogs": []
}
```

`diagnostics` 是排查可信度判断入口：

| 字段 | 含义 |
|:-----|:-----|
| `sqliteUsed` | 是否从主事件库读到数据 |
| `jsonlFallbackUsed` | 是否启用 JSONL 兜底 |
| `dbUnavailable` | SQLite 缺失、锁定、只读或不可打开 |
| `eventGapDetected` | 是否存在事件缺口风险 |
| `warnings` | 面向 Codex 和开发者的可读警告 |

当 SQLite 不可用、缺失或查询不到可用数据时，CLI 会扫描 `data/editor-diagnostics/*.jsonl`。对 autosave、collab、preview、project 和 export 这些 Workspace 关联查询，即使 SQLite 有数据也会同时读取 agent-service spool，因为 mutation/projection 与 canonical 事件可能分居两种存储。合并事件按 ID 去重，JSONL 原始匹配片段仍保留在 `fallbackEvents`。正常合并 spool 只会使 `jsonlFallbackUsed=true`；只有 SQLite 缺失或不可用等真实完整性风险才使 `eventGapDetected=true`。

远程查询结果的 `query.source` 为 `remote`，`query.dataDir` 保留远端真实数据目录，`query.remote` 记录主机、用户和端口。`diagnostics.warnings` 会标记本次使用了远程只读快照，方便后续区分本地数据和生产数据。

专项查询必须在 SQLite 主库和 JSONL spool 保持相同过滤语义。`diagnostics:autosave`、`diagnostics:collab` 和 `diagnostics:preview` 都会返回 `autosave`、`collab`、`preview`、`workspace` 四组事件，让一次查询能从草稿/flush 串到 mutation、projection 和 canonical。`workspaceFlows` 仅对 Workspace 事件按 Workspace ID + Authority revision 分组；先用 committed 事件建立 mutation ID 到 revision 的映射，再纳入 received/prepared、projection 和 canonical 阶段，避免把前端自增草稿版本误当成 Authority revision。

`performance.metrics` 固定输出以下八项，单位均为毫秒：autosave debounce wait、queue wait、commit latency、remote update latency、draft preview latency、projection latency、reconnect convergence 和 canonical lag。每项包含 `count`、`min`、`p50`、`p95`、`p99`、`max` 和 `average`；无样本时 `count=0`，其余数值为 `null`。canonical lag 在事件未显式携带时，由同 Workspace、同 revision 的 mutation committed 到 canonical materialization succeeded 时间差派生。未产生某类埋点时必须保留空样本，不能用其他耗时伪装。

`workspace-authority-status` 是只读 Workspace Authority 观测入口。命令通过 agent-service 的 health 接口读取 `ready`、revision/rootHash、实际 rootHash、external drift、queue depth、active lease、prepared/recovery pending 事务数、recovery state、持久 mutation 冲突数、当前 committed-event 订阅者数、staging 数、committed backup 数及缺失数、receipt 数、journal 条数和 projection ack 条数；它需要有效 Session 做访问校验，不触发 bootstrap、不获取写 lease，也不修改业务文件。冲突数从 journal 派生，订阅者数是当前 agent-service 进程内同一 `DATA_DIR` 的即时值。JSON 输出会额外给出 `warnings` 数组，供 Codex 或自动任务判断是否需要先处理漂移、遗留 lease、未恢复事务或备份缺口。agent-service 全局 `/health` 还会输出启动恢复扫描摘要，用于确认服务在监听前已收敛 prepared 事务。

`workspace-authority-preflight` 是只读 Workspace Authority 机器判定入口。命令同样只读取 health，不写业务文件；JSON 输出包含 `passed`、`issues`、`status` 和 `warnings`。默认阻断 Workspace 缺失、Authority state 缺失、external drift、active/stale write lease、prepared 事务和 committed backup 不完整；`--fail-on-queue` 与 `--fail-on-staging` 可把 mutation queue 积压和 staging 文件残留纳入失败条件。发布、导出、模板创建、canonical 物化和部署前检查应优先消费 `passed/issues`，而不是解析文本 warnings。

`workspace-authority-bootstrap`、`workspace-authority-reconcile-adopt` 和 `workspace-authority-reconcile-restore` 是受控修复入口，默认 dry-run。bootstrap 在未发现 Authority state 时只返回 `would_bootstrap`，加 `--apply` 后才建立 Authority state 与首份 committed backup；该操作不修改业务文件。reconcile adopt 在检测到 external drift 时只返回 `would_adopt`，加 `--apply` 后才显式把当前磁盘受管内容接纳为新 revision，并更新 committed backup。reconcile restore 默认只返回 `would_restore`、`restore_blocked` 或 `noop`；加 `--apply` 后才在写 lease 下丢弃外部漂移并恢复最后 committed 内容。restore 使用 Authority 内部的内容寻址备份，备份缺失或损坏时保持 fail-closed，且恢复过程自身具有崩溃回滚记录。

`workspace-authority:migrate` 是离线、幂等的历史 live Workspace 注册入口，支持 `--workspace`、`--project` 或 `--all` 三种互斥选择器。默认只输出 `would_bootstrap` / `would_repair_backups`；`--apply` 只写 Authority 内部 state 与 committed backup，不修改 Workspace 业务文件。发现漂移、lease 或 prepared 事务时返回 `blocked`，要求先显式收敛。

## 导出包组成

导出包用于异步复盘和复现，不替代项目备份。推荐包含：

- 事件库中相关事件 JSON。
- 对应 JSONL fallback/spool 原始诊断片段。
- 按 Workspace/revision 关联的 `workspaceFlows`。
- 八项延迟指标的样本数与 p50/p95/p99 摘要。
- AI run log 索引和工具调用摘要。
- 当前 Workspace 元数据。
- 关键资源的 hash、长度和 mtime。
- 预览错误摘要和截图索引。
- 诊断完整性状态和 warning。

导出包只保存摘要和索引。SQLite 事件是主账本，JSONL 只作为 fallback/spool 片段单独呈现。完整源码、完整 prompt、完整模型回复、完整工具结果、密钥、token、cookie、上传文件正文和数据库快照都不得进入导出包。

## 排查顺序

排查“AI 已修复但重新打开复原”时，优先按项目查看最近时间线，再按 trace 或 operation 聚焦单次 AI 回复：

1. 查看 `project.opened`、`session.created/reused`、`workspace.bound`。
2. 查看 `ai.run_started`、工具调用、文件变更和 `ai.run_finished`。
3. 查看 `collab.snapshot_received`、`autosave.flush_succeeded` 和持久化结果。
4. 查看重新打开时的首个快照和工作区绑定来源。

排查“同步失败”或 `WORKSPACE_STALE` 时，优先看 `autosave.*_failed` 的 `phase`、`errorCode` 和 `httpStatus`。如果失败发生在 canonical 物化边界，继续查看同项目同 workspace 附近的 `workspace.canonical_materialization_failed`，用 `reason` 判断是缺少 active 指针、请求工作区不匹配、物化工作区缺失、baseVersion 落后，还是项目基准工作区写入失败。如果 mutation 已 committed 但预览仍旧，沿同 mutation/trace 查看 `workspace.projection_applied/failed/gap_detected`。

排查预览错误时，优先按 `preview` 分组判断失败来自编译、iframe 加载、运行时错误还是自动修复请求。
