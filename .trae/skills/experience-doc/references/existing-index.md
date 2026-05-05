# 已有文档索引

> 用于去重检查，写入新文档后需同步更新此文件

## 架构级复盘文档（docs/复盘文档/）

| 目录 | 文档 | 覆盖范围 | 关键词 |
|------|------|---------|--------|
| `React组件与事件/` | `事件传递与状态同步.md` | Context 驱动状态分发、回调链路三层传递、状态穷举 | Context, 回调链路, 状态机, PromptInput |
| `Session与文件系统/` | `Session状态与原子操作.md` | Session 状态机、防御式目录确保、跨平台文件锁 | Session, 状态机, ensureWorkspace, 文件锁 |
| `配置系统/` | `Schema生成与控件联动.md` | Schema 驱动表单生成、Props→Schema 映射、扩展字段保留 | JSON Schema, ui:widget, 表单生成 |
| `预览引擎/` | `iframe沙箱与动态CDN编译策略.md` | iframe 沙箱隔离、esm.sh 动态依赖、双通道 postMessage | iframe, sandbox, esm.sh, postMessage, sucrase |
