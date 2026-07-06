# 创作端 CLI - Project Admin 使用体验优化归档

## 结论

已完成 Project Admin CLI 面向 Agent 的使用体验优化。CLI 继续定位为 Agent 使用的本地项目入口、安全项目管理层、批量自动化入口和结构化证据输出层；Web 创作端继续定位为人类的可视化编辑、预览、确认和协作界面。

本轮实现覆盖两条 Agent 路径：

- 本地项目包模式：`project pull -> pnpm dev/build/preview:check -> validate/diff -> submit`。
- 直接事务模式：`edit begin -> page/asset/config/import/verify -> diff/validate -> commit`。

## 已落地能力

- 高噪声命令支持摘要输出：`asset list --summary`、`edit diff --summary`、`page list --summary`、`diff --summary`、`project validate-runtime --summary`。
- 输入契约固定：`@file` 仅在 `@/abs/path`、`@./rel/path`、`@../rel/path` 形态下展开；CSS at-rule 按普通内容处理；`help input` 暴露规则。
- 批量命令：`asset upload-dir` 和 `page update-prototypes`。
- 项目级原型导入 workflow：`project import-prototype`，显式 `--commit` 才提交。
- 聚合验证命令：`edit verify` 和 `project verify`。
- 页面效果检查链路：`project visual-check`，本地项目包脚手架新增 `pnpm preview:check` 和 `pnpm preview:screenshot`。
- Agent 证据包和配方：`report agent-run`、`recipe list`、`recipe show`。
- 文档同步：CLI 项目文档、能力清单、用户指南和故障排查已更新。

## 验证状态

- `corepack pnpm check:project-cli`：通过。
- `corepack pnpm check:project-core`：通过。
- `corepack pnpm check:project-scaffold`：通过。
- `corepack pnpm check:author`：通过，85 个 test suites、579 个 tests 全部通过。

## 相关文档

- [CLI 能力需求文档](../../项目文档/创作端/10-CLI/CLI能力_需求文档.md)
- [CLI 能力层实现设计](../../项目文档/创作端/10-CLI/技术/01_CLI能力层实现设计.md)
- [本地项目包与脚手架同步](../../项目文档/创作端/10-CLI/技术/02_本地项目包与脚手架同步.md)
- [CLI 能力自动化清单](../../项目文档/创作端/10-CLI/技术/05_CLI能力自动化清单.md)
- [Project Admin CLI 使用指南](../../用户指南/Project-Admin-CLI使用指南.md)
- [Project Admin CLI 故障排查](../../用户指南/Project-Admin-CLI故障排查.md)

## 剩余风险

- `project visual-check` 当前提供离线检查报告和 SVG 截图工件，不冒充 author-site/screenshot-service 的真实浏览器渲染结果；正式发布前仍应按需要运行浏览器级复验。
