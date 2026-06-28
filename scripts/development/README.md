# development 脚本说明

本目录存放开发期使用的临时验证、回归排查和质量评估脚本。它们不是线上运行逻辑，也不是默认构建流程的一部分；主要用于复现具体问题、生成诊断报告，或在修复后做针对性回归验证。

所有脚本都应在仓库根目录执行。

## 脚本总览

| 脚本 | 根目录快捷命令 | 用途 |
|---|---|---|
| `detect-sync-status-flap.mjs` | `pnpm test:sync-status-flap` | 用 Playwright 打开编辑页，持续采样页面上的协同同步状态，检测“连接中”和“离线待同步”之间是否反复抖动。 |
| `knowledge-validation-suite.mjs` | `pnpm test:knowledge-validation` / `pnpm test:knowledge-validation:run` | 通过 Project CLI 构造知识库验证场景、创建模板、实例化项目，并可选调用 Agent 评估知识库回答质量。 |
| `test-ai-workspace-refresh.mjs` | `pnpm test:ai-workspace-refresh` | 验证 AI 写入 `demos/` 文件后，author-site 是否能刷新工作区状态，并运行相关 agent-service 单测。 |

## 回归用例维护位置

正式回归用例不要维护在本目录。本目录只用于开发期诊断、问题复现、状态采样和报告生成脚本。

如果某个脚本已经具备稳定的通过/失败判断，并且需要作为长期回归保障，应迁移或补写到 `test/` 目录：

- Playwright E2E 回归用例维护在 `test/创作端E2E回归测试/`，写成 `.spec.ts`。
- 包级单元或集成回归用例维护在对应包的测试目录，例如 `packages/agent-service/tests/`。
- 根目录 `package.json` 只保留清晰的运行入口，例如 `pnpm test:e2e` 或更聚焦的回归命令。

判断标准：能稳定自动断言、需要长期保留的放 `test/`；只用于定位问题、采样页面状态或生成诊断报告的放 `scripts/development/`。

## detect-sync-status-flap.mjs

### 功能

该脚本用于排查编辑页右上角或页面可见区域中的协同同步状态是否发生异常抖动。脚本会：

1. 使用 Playwright Chromium 打开目标编辑页。
2. 如果被重定向到登录页，则调用登录 API 完成登录。
3. 按固定间隔采样页面中可见的同步状态文案。
4. 统计状态出现次数和状态切换记录。
5. 生成 JSON 报告和页面截图。
6. 如果检测到“连接中”和“离线待同步”之间多次来回切换，则以失败退出。

### 运行方式

```bash
pnpm test:sync-status-flap
```

也可以直接运行：

```bash
node scripts/development/detect-sync-status-flap.mjs
```

### 常用环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `SYNC_STATUS_URL` | `http://localhost:3200/demo/proj_1782286923644/edit` | 要检测的编辑页地址。 |
| `SYNC_STATUS_SAMPLE_MS` | `500` | 采样间隔，单位毫秒。 |
| `SYNC_STATUS_DURATION_MS` | `20000` | 总采样时长，单位毫秒。 |
| `HEADLESS` | 非 `0` 时无头运行 | 设置为 `0` 可打开可视浏览器窗口。 |
| `E2E_USER` | `qihao` | 自动登录用户名。 |
| `E2E_PASSWORD` | `130015` | 自动登录密码。 |

### 输出

- 报告：`tmp/sync-status-flap/report.json`
- 截图：`tmp/sync-status-flap/last-page.png`

## knowledge-validation-suite.mjs

### 功能

该脚本是知识库链路的开发验证套件，主要面向项目模板、知识库文档、画布节点和 Agent 回答质量的回归检查。它会通过 `packages/project-cli/src/index.ts` 操作项目数据，并生成验证报告。

脚本支持多个子命令：

| 子命令 | 作用 |
|---|---|
| `fixture` | 给指定项目补充一个圆形知识库验证页面，并写入画布布局中的知识文档节点。 |
| `template` | 基于项目创建模板，并执行模板健康检查。 |
| `instantiate` | 基于已有模板实例化新项目。 |
| `metrics` | 只收集静态指标，例如页面数量、知识文档数量、画布文档节点数量、模板阅读地图信息。 |
| `ai` | 调用 agent-service，让 Agent 根据知识库回答问题，并计算事实召回率、来源引用率和疑似幻觉标记。 |
| `run` | 串行执行 fixture、template、instantiate、metrics，并在提供 `--agent-url` 时追加 AI 指标。 |

### 运行方式

只收集静态指标：

```bash
pnpm test:knowledge-validation
```

执行完整本地验证链路：

```bash
pnpm test:knowledge-validation:run
```

直接调用并指定项目：

```bash
node scripts/development/knowledge-validation-suite.mjs metrics --project-id <projectId>
```

带 Agent 质量评估：

```bash
node scripts/development/knowledge-validation-suite.mjs ai --project-id <projectId> --agent-url http://localhost:3201
```

### 常用参数

| 参数 | 默认值 | 说明 |
|---|---|---|
| `--project-id` | `proj_1782547891917_g0e1l9` | 被验证的项目 ID。 |
| `--template-id` | 无 | `instantiate`、`metrics` 或 `run` 中可复用已有模板。 |
| `--instantiated-project-id` | 无 | `metrics` 中可指定已实例化项目。 |
| `--agent-url` | 无 | `ai` 或 `run` 中用于调用 agent-service。 |
| `--model` | `mydeepseek/deepseek-v4-flash` | Agent 评估时使用的模型名。 |
| `--name-suffix` | 当前时间戳 | 创建模板时追加到模板名称后的后缀。 |

### 输出

- 报告目录：`.tmp/knowledge-validation-suite/reports/`
- 临时 fixture 文件：`.tmp/knowledge-validation-suite/`

报告中会包含静态指标、可选 AI 指标、失败项列表和整体 `ok` 状态。若指标低于脚本内置阈值，脚本会以非零状态退出。

## test-ai-workspace-refresh.mjs

### 功能

该脚本用于验证 AI 文件写入后，前端编辑页是否能正确刷新工作区。它会执行三类检查：

1. 静态检查 `system-prompt.md`，确认提示词没有错误引用 `workspace/workspace-tree.json`。
2. 静态检查编辑页代码，确认 `demos/` 下的 AI 文件变更会触发工作区刷新。
3. 运行 agent-service 的相关单测：

```bash
pnpm --filter @opencode-workbench/agent-service test -- tests/unit/pi-agent.test.ts tests/unit/ws-event-router.test.ts
```

脚本还会扫描 `data/agent-run-logs/` 下最近的 JSONL 运行日志，并摘要其中的 `writeFile` 工具调用结果，方便排查 AI 写文件是否成功。

### 运行方式

```bash
pnpm test:ai-workspace-refresh
```

也可以直接运行：

```bash
node scripts/development/test-ai-workspace-refresh.mjs
```

### 输出

- 报告：`tmp/ai-workspace-refresh-test/report.json`

如果静态检查失败，或相关单测失败，脚本会以非零状态退出。

## 使用注意事项

- 这些脚本默认依赖本地开发数据，例如 `data/projects/`、`data/agent-run-logs/` 和默认项目 ID；在新环境中可能需要先准备对应项目。
- `detect-sync-status-flap.mjs` 需要 author-site 正在运行，并且目标 URL 可访问。
- `knowledge-validation-suite.mjs ai` 需要 agent-service 正在运行，并通过 `--agent-url` 指定服务地址。
- `knowledge-validation-suite.mjs fixture` 和 `run` 会通过 Project CLI 修改目标项目，请只在可接受修改测试项目数据时使用。
- `tmp/` 和 `.tmp/` 下的报告、截图和临时文件是诊断产物，不应提交到版本库。
