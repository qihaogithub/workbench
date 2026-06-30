# 发布 SESSION_NOT_FOUND 诊断包

## 现象关键词

- 发布时报 `SESSION_NOT_FOUND`
- 保存后发布失败
- 项目发布接口找不到 session
- 发布使用旧 workspace
- 发布状态异常

## 必读

1. `docs/项目文档/创作端/03-项目管理/`
2. `docs/项目文档/创作端/04-配置与预览/`
3. `docs/plans/进行中/发布SESSION_NOT_FOUND排查与修复.md`
4. `OPS/automations/state/issue-triage-current.md`

## 先判断

| 判断 | 依据 |
|:-----|:-----|
| session 未创建 | 编辑页没有有效 sessionId |
| session 已过期 | session 文件或记录过期 |
| 保存未同步 | 正式项目没有拿到 workspace 修改 |
| 发布接口参数缺失 | API route 未拿到 session 或 projectId |
| 工作区路径错位 | session workspace 与项目目录不一致 |

## 低副作用命令

```bash
corepack pnpm check:automation
corepack pnpm check:author
```

如果涉及项目领域服务：

```bash
corepack pnpm check:project-core
```

## 常见根因

- 发布接口过度依赖短期 session，而不是已保存的正式项目状态。
- 编辑页 session 过期后仍允许触发发布。
- 保存和发布之间的状态流转没有明确同步边界。
- 前端保存成功状态与后端真实持久化结果不一致。

## 修复后验证

| 修复类型 | 验证 |
|:---------|:-----|
| author publish API | `corepack pnpm check:author` |
| project-core 持久化 | `corepack pnpm check:project-core` |
| 关键流程 | `corepack pnpm test:e2e:core-flow` |

## 停机条件

- 需要改变发布语义。
- 需要清理真实 session、workspace 或项目数据。
- 需要判断线上历史发布数据是否可修复。
