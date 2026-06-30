# 失败模式知识库

本文件记录自动任务和 AI 排查中可复用的失败模式。它不是问题流水账；只保留能帮助下一次快速分类的模式。

## check:repo 根目录临时产物 warning

现象：

- `corepack pnpm check:repo` 通过，但输出 `根目录存在临时/诊断产物` warning。
- 常见文件名包含 `tmp-*.png`、`position*.yaml`、`*verification*.png`。

判断：

- 通常不是代码失败，而是仓库卫生提示。
- 自动任务不应直接删除，除非确认文件是本次任务产生且无保留价值。

处理：

- 在报告中说明 warning 数量。
- 若连续出现且影响判断，创建单独清理计划。
- 不要把它当成业务回归。

## check:automation registry 路径失效

现象：

- `corepack pnpm check:automation` 报 registry 中 `path`、`docs` 或 root script 不存在。

判断：

- 优先视为工具账本漂移。
- 如果对应工具已删除，更新 registry。
- 如果工具仍存在但路径变化，修正 registry 和相关 README。

处理：

- 低风险情况下可自动修复 registry 路径。
- 若工具删除会影响测试覆盖，先记录测试工具治理缺口。

## E2E 服务前置缺失

现象：

- Playwright 报连接失败、页面打不开或 baseURL 无响应。

判断：

- 优先归类为环境阻塞，不直接改测试或业务代码。

处理：

- 报告缺少 author-site 等服务前置条件。
- 只在服务确认运行后再判断是否为产品回归。
