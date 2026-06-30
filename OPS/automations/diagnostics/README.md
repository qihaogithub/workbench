# 诊断包索引

诊断包用于让 Codex 在日常开发问题中快速缩小范围。每个诊断包都应说明现象关键词、优先读取位置、优先命令、常见根因、验证方式和停机条件。

## 当前诊断包

| 问题 | 文档 | 适用场景 |
|:-----|:-----|:---------|
| E2E 失败 | [e2e-failed](./e2e-failed.md) | Playwright 用例失败、测试项目残留、登录或定位异常 |
| 预览不更新 | [preview-not-updating](./preview-not-updating.md) | 保存后预览旧内容、iframe 不刷新、编译缓存异常 |
| AI 会话失败 | [ai-session-failed](./ai-session-failed.md) | Agent 消息失败、空回复、stream 中断、工作区未同步 |
| 发布 SESSION_NOT_FOUND | [publish-session-not-found](./publish-session-not-found.md) | 发布流程找不到 session、保存后发布失败 |

## 使用规则

1. 先匹配现象关键词。
2. 读取对应诊断包。
3. 只运行诊断包中的低副作用命令。
4. 若涉及真实数据、发布、删除、权限或外部服务，停止并输出人工确认项。
5. 修复后把可复用规则沉淀到项目文档或失败模式知识库。
