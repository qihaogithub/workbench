# AI 对话与 Agent：增量页面创建与预览

## 目标

AI 批量创建页面时，每一页在完整持久化后立即进入页面树与画布预览；不等待整轮对话结束，也不打断用户当前查看的页面或画布视口。

## 当前方案

- `createPage` 作为新建页面的唯一 Agent 工具，在一次 Workspace Mutation Authority 提交中写入运行时文件、Schema 和 `workspace-tree.json`。
- 编辑页从 Authority 的同一 revision snapshot 投影页面树与页面内容；不会拼接不同 revision 的磁盘或 Session 文件读取。
- AI 工具完成时只消费 Authority receipt。含页面树或页面资源的 receipt 进入串行投影队列；高 revision 优先，完成态仍保留对话结束和 Authority 轮询兜底。
- 已有活动页时只增量加入新页面；空项目的首个页面才自动成为活动页。

## 验收与后续

- Agent 未结束时，页面应在对应 receipt 到达后显示；失败的创建不得显示半成品。
- 连续 receipt、慢 snapshot、重连或事件遗漏后，预览最终收敛到最高 Authority revision，不可回滚。
- 实施完成后，将本文件压缩归档到 `docs/plans/已完成/`，长期事实维护在项目文档中的 AI 对话和配置预览模块。
