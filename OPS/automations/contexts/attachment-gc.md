# 聊天附件 GC 上下文

## 目标

自动清理过期的聊天附件（`.ai-attachments/`），释放磁盘空间。

## 存储位置

`data/projects/{projectId}/.ai-attachments/{attachmentId}/`

每个 attachment 目录包含：
- `manifest.json` — 含 `createdAt` (ISO 8601) 字段
- `text.txt` — 提取的文本
- 原始上传文件

## 清理规则

- 保留期：**30 天**（基于 `manifest.json.createdAt`）
- 不清理：30 天内的附件、`createdAt` 缺失的附件
- 清理方式：删除整个 `{attachmentId}/` 目录

## 判断规则

```bash
# 扫描所有项目
for project_dir in data/projects/*/; do
  attachments_dir="${project_dir}.ai-attachments"
  if [ -d "$attachments_dir" ]; then
    # 遍历每个 attachment
    for attachment_dir in "$attachments_dir"/*/; do
      manifest="${attachment_dir}manifest.json"
      if [ -f "$manifest" ]; then
        # 读取 createdAt，判断是否超过 30 天
      fi
    done
  fi
done
```

## 停机条件

- `DATA_DIR` 未正确解析
- `manifest.json` 缺少 `createdAt` 字段（保守处理，不删除）
- 路径遍历风险（每个路径段必须通过正则校验）

## 输出位置

- 状态更新：`OPS/automations/state/attachment-gc-current.md`
- 报告模板：`OPS/automations/templates/attachment-gc-report.md`
