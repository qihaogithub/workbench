# AI生成页面配置项约束方案

## 背景

用户希望创作端 AI 对话在生成页面时，不要自行添加配置项。配置项必须来自用户主动、明确的要求，AI 不能因为页面内容、样式、素材或交互设计而推断出配置字段。

## 目标

- AI 新建页面时默认不生成用户可编辑配置项。
- 只有用户明确提出添加、删除或修改配置项时，AI 才能按用户要求改动 `config.schema.json` 或 `project.config.schema.json`。
- 约束需要覆盖新建页面场景，而不只覆盖后续编辑配置项场景。

## 范围

- 创作端 AI 对话静态 System Prompt。
- 与 System Prompt 行为约束相关的测试。
- AI 对话模块长期技术文档。
- 不调整配置面板、可视化添加配置项、发布或预览运行时逻辑。

## 方案

1. 在“创建页面”规则中明确：新建页面必须创建 `config.schema.json` 文件，但默认 schema 只能是空属性集合，不得顺手抽取标题、图片、颜色、文案等配置字段。
2. 将“配置字段增删必须由用户明确指示”从项目级配置章节扩展到页面级和新建页面章节。
3. 调整 `config.schema.json` 要求：只有在用户明确要求配置项时，才要求 properties 与页面字段一一对应；否则保持空配置 schema。
4. 增加 System Prompt 单元测试，防止后续改 Prompt 时丢失该约束。

## 任务清单

- [x] 阅读 AI 对话与配置相关项目文档索引，确认模块边界。
- [x] 定位创作端 AI 对话 System Prompt 与现有测试。
- [x] 修改 System Prompt 中的新建页面配置项规则。
- [x] 增加/调整测试覆盖。
- [x] 更新 AI 对话模块长期技术文档。
- [x] 运行最小验证命令。
- [x] 记录最终验证结果和剩余风险。

## 进度记录

- 2026-06-25：确认现有 Prompt 已有“配置字段增删必须明确指示”，但创建页面和 schema 要求仍会暗示 AI 生成页面时顺手添加配置项。
- 2026-06-25：已将新建页面默认 schema 调整为空属性集合，并要求没有明确配置项时 Props 也保持为空。
- 2026-06-25：已增加 System Prompt 单元测试，锁定“不得自行抽取配置字段”和“默认空 schema”规则。
- 2026-06-25：已更新 `docs/项目文档/创作端/05-AI对话/技术/03_AI行为约束机制.md`，记录 v3.4.4 行为约束和新建页面场景。

## 验证方式

- 运行 `pnpm --filter @opencode-workbench/author-site test -- --testPathPatterns="system-prompt.test.ts"`。

## 验证结果

- 2026-06-25：`pnpm --filter @opencode-workbench/author-site test -- --testPathPatterns="system-prompt.test.ts"` 通过，14 个测试全部通过；更新长期项目文档后重跑仍通过。
- 备注：旧命令参数 `--testPathPattern` 在当前 Jest 版本中已被替换，首次运行未进入测试断言；已用 `--testPathPatterns` 重跑通过。

## 风险与待确认事项

- 本次优先通过 System Prompt 约束模型行为；如果后续仍出现模型绕过，需要在 Agent 服务工具层增加基于用户意图的 schema 字段变更硬拦截。
- 当前工作区已有大量与本任务无关的未提交改动，本次未整理或回滚。
