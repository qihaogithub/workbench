---
covers:
  - OPS/CLI/src/commands/diagnostics.ts
  - OPS/CLI/src/index.ts
  - OPS/CLI/README.md
  - OPS/CLI/package.json
  - package.json
  - packages/author-site/src/lib/editor-diagnostics/store.ts
  - packages/author-site/src/app/api/editor-diagnostics/export/route.ts
---

# Codex 查询 CLI 与导出包

> 更新日期：2026-07-09

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
```

## JSON 输出契约

JSON 输出必须包含查询元信息、诊断完整性状态、事件列表和 AI run log 索引。核心结构如下：

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

当 SQLite 不可用、缺失或查询不到可用数据时，CLI 会扫描 `data/editor-diagnostics/*.jsonl`。`diagnostics:export` 也会把匹配的 JSONL spool 作为独立兜底片段带出。兜底路径必须显式标记，不能静默混入主时间线。

远程查询结果的 `query.source` 为 `remote`，`query.dataDir` 保留远端真实数据目录，`query.remote` 记录主机、用户和端口。`diagnostics.warnings` 会标记本次使用了远程只读快照，方便后续区分本地数据和生产数据。

专项查询必须在 SQLite 主库和 JSONL 兜底路径保持相同过滤语义。`diagnostics:autosave` 只返回 `eventGroup=autosave`，`diagnostics:collab` 只返回 `eventGroup=collab`，`diagnostics:preview` 只返回 `eventGroup=preview`，避免协同状态快照等高频事件淹没目标时间线。

## 导出包组成

导出包用于异步复盘和复现，不替代项目备份。推荐包含：

- 事件库中相关事件 JSON。
- 对应 JSONL fallback/spool 原始诊断片段。
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

排查“同步失败”或 `WORKSPACE_STALE` 时，优先看 `autosave.*_failed` 的 `phase`、`errorCode` 和 `httpStatus`。如果 `phase=persist-workspace`，继续查看同项目同 workspace 附近的 `workspace.sync_failed`，用 `reason` 判断是缺少 active 指针、请求工作区不匹配、物化工作区缺失、baseVersion 落后，还是项目基准工作区写入失败。

排查预览错误时，优先按 `preview` 分组判断失败来自编译、iframe 加载、运行时错误还是自动修复请求。
