# 聊天附件每日 GC Runbook

## 目标

每日扫描并报告过期聊天附件，清理 30 天前的 `.ai-attachments/` 目录。

## 读取

1. `OPS/automations/AGENTS.md`
2. `contexts/attachment-gc.md`
3. `state/attachment-gc-current.md`

## 执行步骤

1. 解析 `DATA_DIR`（默认 `data/`，可由 `DATA_DIR` 环境变量覆盖）。
2. 扫描 `{DATA_DIR}/projects/*/` 下所有项目目录。
3. 对每个项目，检查 `{projectDir}/.ai-attachments/` 是否存在。
4. 遍历 `.ai-attachments/` 下的所有 attachment 目录。
5. 读取每个 attachment 的 `manifest.json`，获取 `createdAt`。
6. 比较 `createdAt` 与当前时间：超过 30 天标记为过期。
7. 输出报告：列出过期附件（projectId、attachmentId、name、createdAt）。

## 可操作对象

- 过期（>30 天）的 attachment 目录，且 `manifest.json.createdAt` 字段存在且可解析。

## 不自动操作

- 30 天内的附件。
- `createdAt` 字段缺失或无法解析的附件（保守保留，人工排查）。
- `manifest.json` 不存在的目录。
- 路径校验失败的目录。

## 输出

更新：
- `OPS/automations/state/attachment-gc-current.md`（记录本次扫描结果、已清理数量、磁盘释放量）

报告采用 `templates/attachment-gc-report.md` 格式。

## 自动化等级

`report-only` — 先只报告不自动删除，待验证稳定后升级为 `auto-fix-low-risk`。
