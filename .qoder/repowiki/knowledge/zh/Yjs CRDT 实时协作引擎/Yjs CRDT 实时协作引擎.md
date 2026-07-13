---
kind: external_dependency
name: Yjs CRDT 实时协作引擎
slug: yjs
category: external_dependency
category_hints:
    - framework_behavior
scope:
    - '**'
---

### Yjs CRDT 实时协作引擎
- **角色**：前端与后端的实时协作数据同步基础，支持多人同时编辑同一工作区
- **集成点**：agent-service 通过 WebSocket 传输 Yjs 操作，author-site 通过 y-websocket 客户端连接
- **编辑器集成**：通过 y-codemirror.next 与 CodeMirror 编辑器深度集成
- **过渡期状态**：当前与 Workspace Mutation Authority 共存，内容同步仍走 Yjs + scheduler，完全替换为 Authority-only 需要后续迭代
- **架构约束**：保留 useCollabDocument 用于 awareness/presence，但内容修改路径正在迁移到 Authority 模式