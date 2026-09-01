---
covers:
  - packages/shared/src/markdown-reference/*
  - packages/project-core/src/markdown-references/*
  - packages/author-site/src/lib/markdown-references.ts
  - packages/author-site/src/lib/publish-markdown-references.ts
  - packages/viewer-site/src/lib/api.ts
---

# 项目页面文档引用协议 ADR

## 状态

已接受（2026-09-01）。该决策由 shared、project-core、author-site、demo-ui 和 viewer-site 的实现共同约束；后续变更应同步更新协议、索引和发布快照测试。

## 决策

1. 用户可见的项目、页面和知识文档引用统一使用标准 Markdown 链接承载 `wb://` v1 URI。URI 只包含稳定 ID，显示标签是快照，不作为身份。
2. 解析器使用 `@workbench/shared/markdown-reference` 内的轻量扫描器。它在识别 fenced/inline code、HTML 属性、嵌套括号和转义后解析 `wb://`，不引入 Markdown AST 运行时依赖，避免把编辑器首屏包体和服务端索引绑定到特定 Markdown 实现。Markdown-it、Streamdown 和 Milkdown 只消费共享解析结果或各自的薄渲染适配器。
3. 权限和实体存在性不在 parser 中判断；`project-core` 的 `ResourceDirectory/EntityResolver` 负责同项目解析，并将无权获知的状态投影为 `unavailable`。
4. outgoing/backlinks 使用位于 `DATA_DIR/derived/markdown-links.sqlite` 的可重建 generation 索引。Authority receipt 的 revision/root hash 只用于拒绝旧投影；正文和 manifest 不依赖索引才能读取。
5. 发布只公开同一不可变快照中实际存在的页面和用户知识文档。页面需求、知识文档和 DesignSpec 内嵌 Markdown 中无法映射到该快照的链接统一降级为纯标签，同时在 `markdownReferences.unresolvedCount` 中保留审计计数。Viewer 只读取发布快照，不访问 live workspace。

## 不采用的方案

- 不把文件名、标题或 `[[wikilink]]` 名称写成长期身份；名称只参与候选搜索和显示。
- 不让每个保存 handler 直接更新索引；后续 Authority committed-event projector/outbox 应保持唯一投影入口。
- 不把 `wb://` 交给浏览器原生导航，也不把 session、绝对路径或执行 ticket 写入 Markdown。

## 验证证据

- shared parser fixture 覆盖 canonical/legacy、中文和转义标签、代码块排除、malformed URI。
- project-core 覆盖目录权限投影、SQLite generation、增量更新、损坏缓存恢复、outgoing/backlinks 和未链接提及。
- publish helper 覆盖同快照目标目录、不可用链接降级，以及 DesignSpec JSON 内嵌 Markdown 的同步清理。
