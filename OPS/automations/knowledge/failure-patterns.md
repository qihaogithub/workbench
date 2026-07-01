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

## check:repo 计划文档 Markdown 坏链

现象：

- `corepack pnpm check:repo` 通过，但输出 `Markdown 链接不存在` warning。
- 常见于 `docs/plans/进行中/`、`docs/plans/已完成/` 的历史相对路径引用。

判断：

- 优先视为文档迁移后的引用漂移，而不是代码或测试回归。
- 如果 warning 与根目录临时产物同时出现，需要单独分类，避免误以为仓库卫生状态无变化。

处理：

- 在 `docs/plans/进行中/` 新建或更新具体坏链清理文档。
- state 中记录命中文件和 warning 数量，不在 state 里维护长清单。
- 修复前不要把它归类为“仅剩临时产物 warning”。

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

## E2E 沙箱权限阻塞

现象：

- `corepack pnpm test:e2e` 或 `corepack pnpm test:e2e:core-flow` 在 Codex 沙箱内失败。
- Playwright 请求本地站点时报 `apiRequestContext.get: connect EPERM ::1:3200`。
- Chromium 日志出现 `MachPortRendezvousServer ... Permission denied (1100)` 并在启动阶段退出。

判断：

- 如果 `author-site` 等前置服务端口已监听，优先视为 Codex/macOS 权限限制，不直接归类为业务回归或测试脚本失效。
- 只有在非沙箱复跑仍失败时，才继续按 `E2E 失败` 诊断包区分测试问题或代码回归。

处理：

- 先确认 `3200` 等目标端口已监听。
- 用相同命令做一次非沙箱复跑。
- 若非沙箱复跑通过，在报告中标记为环境权限阻塞，并记录 HTML 报告或错误上下文路径，不创建业务缺陷计划。
