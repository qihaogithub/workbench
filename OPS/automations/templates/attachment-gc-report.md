# 聊天附件 GC 报告

**执行时间**：{{timestamp}}

## 扫描结果

| 项目 | 附件总数 | 过期数 | 磁盘占用 |
|------|---------|--------|---------|
|      |         |        |         |

## 过期附件明细

{{#expired}}
| projectId | attachmentId | name | createdAt |
|-----------|-------------|------|-----------|
{{/expired}}

## 操作结果

- 已清理：{{cleaned}} 个附件
- 磁盘释放：{{freed}} bytes
- 保留：{{kept}} 个附件（30 天内）

## 异常

{{#issues}}
- {{message}}
{{/issues}}
