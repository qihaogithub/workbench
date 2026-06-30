# 预览不更新诊断包

## 现象关键词

- 保存后预览仍显示旧内容
- iframe 不刷新
- 画布切换后仍旧页面
- 编译缓存命中异常
- 发布或使用端看到旧数据

## 必读

1. `docs/项目文档/创作端/04-配置与预览/`
2. `docs/项目文档/创作端/03-项目管理/`
3. `scripts/development/README.md`
4. `OPS/automations/state/issue-triage-current.md`

## 先判断

| 判断 | 依据 |
|:-----|:-----|
| 保存未成功 | 保存接口失败、版本未创建、工作区未写入 |
| 编译未触发 | `/api/compile` 没有被调用或使用旧输入 |
| iframe 未刷新 | 前端状态未更新 key 或 URL |
| 缓存异常 | 编译缓存、截图缓存或发布数据未失效 |
| 数据源错位 | 页面 ID、项目 ID、session ID 或 workspace 路径串用 |

## 低副作用命令

```bash
corepack pnpm check:automation
corepack pnpm check:repo
```

涉及 author-site 改动后：

```bash
corepack pnpm check:author
```

## 可用诊断工具

- `scripts/development/detect-sync-status-flap.mjs`
- `scripts/development/test-ai-workspace-refresh.mjs`
- E2E 核心流程用例

运行开发诊断脚本前先确认它是否会读取或修改默认项目数据。

## 常见根因

- 保存成功但前端没有重新读取工作区。
- 页面配置或代码写入了 session workspace，但正式项目未同步。
- 预览 iframe 的刷新 key 没有随版本或内容变化。
- 编译缓存键缺少影响输出的输入字段。
- 多页面或多 session 场景下读到了旧页面 ID。

## 修复后验证

| 修复类型 | 验证 |
|:---------|:-----|
| author 页面状态 | `corepack pnpm check:author` |
| 项目读写领域服务 | `corepack pnpm check:project-core` |
| E2E 关键流程 | `corepack pnpm test:e2e:core-flow` |

## 停机条件

- 需要清理真实项目数据。
- 需要改变保存、发布或版本语义。
- 无法确认当前 session/workspace 是否属于测试现场。
