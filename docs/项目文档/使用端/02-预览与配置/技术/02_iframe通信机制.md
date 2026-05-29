# iframe 通信机制 - 实现设计

> ⚠️ **已废弃** (v2.0)
>
> 本文档描述的是旧架构中的 iframe 通信机制，适用于 v1.0 版本。
> 新架构（v2.0）中，使用端不再与 iframe 进行 postMessage 通信，所有功能由创作端 viewer 内部处理。
>
> 请见 [新架构设计](./01_架构设计.md)。

> 版本：v1.0
> 创建日期：2026-05-04
> **状态**：已废弃

---

## 历史文档（保留参考）

本文档保留作为历史参考，描述 v1.0 架构中使用端如何通过 `postMessage` 与 iframe 通信。

### 原始内容摘要

- **消息格式**：`{ type: "UPDATE_CONFIG", payload: { config: {...} } }`
- **发送策略**：iframe 加载完成后首次发送，配置变更时增量发送
- **安全约束**：`sandbox="allow-scripts allow-same-origin"`，`targetOrigin` 使用实际域名

> 完整历史内容已归档，新开发请参考创作端 viewer 的内部通信机制。
