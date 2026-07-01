# AGENTS.md - OPS CLI

`OPS/CLI/` 是 `@opencode-workbench/cli-tools` 包，面向开发和 AI 代理的工程诊断工具。它用于脱离 Web 端测试 Agent Service、会话、工作区、文件读取、日志、健康检查和 WebSocket 流式响应。

## 读取顺序

修改本目录前按顺序读取：

1. 根目录 `AGENTS.md`。
2. `OPS/AGENTS.md`。
3. 本文件。
4. `README.md` 和 `QUICKSTART.md`。
5. `package.json`、`src/index.ts`、`src/types.ts`、`src/utils.ts`。
6. 与目标命令对应的 `src/commands/*.ts`。

## 代码边界

- CLI 只做工程诊断、测试和运维辅助，不承载产品业务逻辑。
- 新增或修改命令时，同步检查 `src/index.ts` 的命令注册、共享类型、工具函数和 README 命令说明。
- 涉及 Agent Service 接口时，优先复用现有请求、WebSocket、输出格式和错误处理风格。
- 输出面向命令行读者，保持明确、可复制、低噪声；需要机器消费的结果应提供稳定字段或 JSON 选项，而不是解析彩色文本。
- 不在 CLI 中写入真实 token、密钥、`.env`、生产数据或不可复现的本地绝对路径。
- 不把一次性调试脚本混入 CLI；临时复现放到 `scripts/development/`，长期诊断能力再进入 `OPS/CLI/`。

## 文档与账本

- 修改用户可见命令、参数、默认值或输出结构时，同步更新 `README.md` 和必要的快速开始说明。
- 新增长期工程工具能力时，检查是否需要同步 `OPS/automations/registry/tools.json` 或相关自动任务 context。
- 如果 CLI 改动暴露了业务规则、接口契约或架构边界变化，应更新 `docs/项目文档/` 对应模块。

## 验证

优先验证：

```bash
corepack pnpm check:project-cli
```

只改 Markdown 指南时可以不运行构建测试。修改命令实现时至少运行 `corepack pnpm check:project-cli`；涉及 Agent Service 真实链路时，先确认服务和环境变量，再选择性运行 CLI 命令冒烟。
