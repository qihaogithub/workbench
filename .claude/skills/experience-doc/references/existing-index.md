# 已有文档索引

> 用于去重检查，写入新文档后需同步更新此文件

## 代码级经验文档（docs/plans/归档/经验/）

| 文档 | 覆盖范围 | 关键词 |
|------|---------|--------|
| `ACP协议消息处理.md` | ACP 协议映射、消息聚合、工具调用语义化 | ACP, WebSocket, 消息聚合, tool_call |
| `React高频事件状态覆盖.md` | React 受控模式 Bug、useRef 同步追踪 | useRef, 受控模式, 流式数据, 状态覆盖 |
| `Sandpack集成经验.md` | Sandpack 配置陷阱、依赖管理方案 | Sandpack, externalResources, @dependency |
| `配置与工作空间管理.md` | 配置单一来源、workingDir 链路、文件同步 | config.schema.json, workingDir, 工作空间隔离 |
| `Streamdown集成经验.md` | Tailwind v3/v4 语法混用、data-streamdown 选择器、flex 子元素溢出 | streamdown, Tailwind content, data-streamdown, min-width |
| `SWR与RSC协作经验.md` | SSR fallbackData 与 isLoading 互斥、fallbackData 形态匹配、RSC 预取最小模板 | SWR, fallbackData, isLoading, RSC, SSR |

## 架构级复盘文档（docs/复盘文档/）

| 目录 | 文档 | 覆盖范围 | 关键词 |
|------|------|---------|--------|
| `React组件与事件/` | `事件传递与状态同步.md` | Context 驱动状态分发、回调链路三层传递、状态穷举 | Context, 回调链路, 状态机, PromptInput |
| `Session与文件系统/` | `Session状态与原子操作.md` | Session 状态机、防御式目录确保、跨平台文件锁 | Session, 状态机, ensureWorkspace, 文件锁 |
| `配置系统/` | `Schema生成与控件联动.md` | Schema 驱动表单生成、Props→Schema 映射、扩展字段保留 | JSON Schema, ui:widget, 表单生成 |
| `预览引擎/` | `iframe沙箱与动态CDN编译策略.md` | iframe 沙箱隔离、esm.sh 动态依赖、双通道 postMessage | iframe, sandbox, esm.sh, postMessage, sucrase |
