# AI 工具集与 pi-agent 官方最佳实践差异分析

> 对比 `packages/agent-service/src/backends/pi-tools/` 与 `@earendil-works/pi-coding-agent` 官方参考实现，梳理不符合最佳实践的差距项。
> 仅分析，不修改代码。

---

## 对比基准

- **官方实现**：`docs/external/pi-reference/packages/coding-agent/src/core/tools/`（本地 clone，只读参考）
- **本项目实现**：`packages/agent-service/src/backends/pi-tools/`
- **框架层**：`@earendil-works/pi-agent-core`（`AgentTool` 接口）

官方提供 7 个工具：`read`、`write`、`edit`、`bash`、`grep`、`find`、`ls`。
本项目提供 20+ 工具（含项目特有工具如 sketch、knowledge、plan 等）。

> 官方参考代码已 clone 到 `docs/external/pi-reference/`，可直接 `Read`、`Grep`、`LSP` 查阅，无需网络。

---

## 差异项清单

### 1. readFile 缺少 offset/limit 分页读取

| 维度 | 官方 | 本项目 |
|------|------|--------|
| 参数 | `{path, offset?, limit?}` | `{path}` + 独立 `readFileWithLines` 工具 |
| 大文件处理 | `truncateHead` 截断 + `[Showing lines X-Y. Use offset=N to continue.]` 引导续读 | 返回完整内容，或用 `readFileWithLines` 手动指定行范围 |

**影响**：大文件读取时返回完整内容到对话历史，token 消耗高。模型无法按需分段读取。`readFileWithLines` 是独立工具增加了工具数量和理解成本。

**建议**：将 `offset`/`limit` 合并到 `readFile`，移除独立的 `readFileWithLines` 工具。

---

### 2. readFile 缺少输出截断

| 维度 | 官方 | 本项目 |
|------|------|--------|
| 截断策略 | 2000 行或 50KB（先到为准），截断后提示续读 | 无截断，返回完整文件内容 |
| 首行超限 | `[Line 1 is XKB, exceeds 50KB limit. Use bash: sed -n '1p' file | head -c 50000]` | 无处理 |

**影响**：大型文件（如打包后的 CSS/JS、长配置）的完整内容会占用大量 token，且可能导致上下文溢出。

**建议**：为 readFile 添加 `truncateHead` 截断，超限后提供续读引导。

---

### 3. bash 工具缺少 timeout 参数

| 维度 | 官方 | 本项目 |
|------|------|--------|
| 参数 | `{command, timeout?}` | `{command}` |
| 超时 | 可选秒数，无默认值 | 硬编码 30s |
| 超时反馈 | `Command timed out after N seconds` + 已收集的输出 | `Error executing command: ...`（通用错误） |

**影响**：模型无法为长时间运行的命令（如构建、测试）指定更长的超时。30s 硬限制可能导致合法的长命令被意外终止。

**建议**：添加可选 `timeout` 参数，调整默认值或上限。

---

### 4. bash 工具缺少输出截断

| 维度 | 官方 | 本项目 |
|------|------|--------|
| 截断策略 | `truncateTail` 保留最后 2000 行/50KB + 完整输出保存到临时文件 | `maxBuffer: 1MB`，超出后 exec 报错 |
| 截断反馈 | `[Showing lines X-Y of Z. Full output: /tmp/pi-bash-xxx]` | 无结构化提示 |

**影响**：大量输出的命令（如 `find`、`grep`、编译日志）可能溢出 buffer 导致错误，而非优雅截断。模型无法查看完整输出。

**建议**：添加 `truncateTail` 截断 + 临时文件保存机制。

---

### 5. 工具缺少 promptGuidelines

| 维度 | 官方 | 本项目 |
|------|------|--------|
| 机制 | 工具定义含 `promptGuidelines[]`，激活时自动追加到 system prompt 的 Guidelines 段 | 无此机制，编辑规则手动写在 `system-prompt.md` 中 |
| 示例 | read: `"Use read to examine files instead of cat or sed."` | 无 |
| | edit: `"Use edit for precise changes (edits[].oldText must match exactly)"` | 对应规则在 system-prompt.md |
| | write: `"Use write only for new files or complete rewrites."` | 对应规则在 system-prompt.md |

**影响**：当前通过 system-prompt.md 手动维护等价规则，功能上等效。但缺少自动机制意味着工具增减时需要同步手动更新 prompt，维护成本高且容易遗漏。

**评估**：pi-agent-core 的 `AgentTool` 接口**不支持** `promptGuidelines`（这是 pi-coding-agent 的 `ToolDefinition` 扩展层的特性）。如需对齐，需要：
- 要么在 `pi-agent.ts` 的 system prompt 构建中手动拼接工具的 guidelines
- 要么继续当前的 system-prompt.md 手动维护方式（功能等价，但非自动化）

**建议**：短期可接受现状。中期可考虑在工具注册时收集 guidelines 并自动注入 system prompt。

---

### 6. editFile 缺少 prepareArguments 健壮性处理

| 维度 | 官方 | 本项目 |
|------|------|--------|
| JSON 字符串修复 | 模型（Opus 4.6, GLM-5.1）发送 `edits` 为 JSON 字符串时自动 `JSON.parse` | 无处理，依赖 schema 验证报错 |
| 参数预处理 | 通过 `prepareArguments` 在 schema 验证前修正参数 | 无预处理 |

**影响**：部分模型可能在 tool call 中将 `edits` 数组序列化为字符串而非数组，导致 schema 验证失败。

**评估**：`pi-agent-core` 的 `AgentTool` 接口**支持** `prepareArguments`（`prepareArguments?: (args: unknown) => Static<TParameters>`）。这是可以直接利用的能力。

**建议**：为 editFile 添加 `prepareArguments`，处理 `edits` 为 JSON 字符串的边界情况。

---

### 7. editFile 缺少 diff/patch 结构化输出

| 维度 | 官方 | 本项目 |
|------|------|--------|
| 返回值 details | `{diff: string, patch: string, firstChangedLine: number}` | `{path, lineNumber, editCount, oldLineCount, newLineCount, usedFuzzyMatch}` |
| 用途 | TUI 渲染 diff 视图、编辑器导航到变更位置 | 日志和调试 |

**影响**：无 TUI diff 渲染需求（我们是 Web 前端），但 `firstChangedLine` 对前端定位变更位置有价值。`patch`（unified diff format）可用于版本历史对比。

**建议**：低优先级。如需在创作端 UI 中展示 diff，可后续添加。

---

### 8. 缺少 grep/find/ls 探索工具

| 维度 | 官方 | 本项目 |
|------|------|--------|
| 工具列表 | `grep`（正则搜索）、`find`（文件名/路径搜索）、`ls`（目录列表） | 仅 `listFiles`（目录列表） |
| 搜索能力 | 专用工具，有截断、权限控制、结构化输出 | 模型需通过 `bash` 执行 `grep`/`find` |

**影响**：模型通过 bash 执行搜索命令，输出不如专用工具结构化。bash 的权限限制可能阻止部分搜索操作。

**评估**：本项目的 workspace 模型（Yjs 协同 + Authority snapshot）与纯文件系统不同。`grep`/`find` 需要在 snapshot 资源上实现，而非直接 `fs` 操作。实现成本较高。

**建议**：中优先级。如果模型频繁通过 bash 搜索文件内容，可考虑添加基于 snapshot 的 `grepContent` 工具。

---

### 9. 缺少 file-mutation-queue

| 维度 | 官方 | 本项目 |
|------|------|--------|
| 并发保护 | `withFileMutationQueue` 确保同一文件的 edit/write 串行执行 | 依赖 Workspace Mutation Authority 的 `expectedHash` 乐观锁 |
| 竞态处理 | 队列排队，后写等待前写完成 | 冲突时 `WORKSPACE_EXTERNAL_DRIFT` 重试 |

**影响**：本项目的 Authority 机制在功能上等价且更完备（含 revision 追踪、冲突检测、projection ack），不算是差距。

**评估**：非差距项，本项目方案更适合协同编辑场景。

---

### 10. 工具名称冗长

| 官方 | 本项目 | 差异 |
|------|--------|------|
| `read` | `readFile` | +4 chars |
| `write` | `writeFile` | +4 chars |
| `edit` | `editFile` | +4 chars |
| — | `readFileWithLines` | 无对应，独立工具 |
| `bash` | `bash` | 相同 |

**影响**：每次 tool call 中工具名被重复传输，冗长名称增加 token 消耗。但在 Web API 场景下影响微小。

**建议**：低优先级。如需重命名需同步更新所有引用、测试和文档。

---

### 11. AbortSignal 未实际使用

| 维度 | 官方 | 本项目 |
|------|------|--------|
| 信号处理 | 所有工具检查 `signal.aborted`，支持取消进行中的操作 | 工具签名含 `signal` 参数但未使用 |

**影响**：用户中止（abort）一个正在运行的 agent 时，已启动的文件读写或 bash 命令会继续执行完毕，不会提前终止。

**建议**：中优先级。为 bash（长命令）和 readFile（大文件）添加 abort 检查。

---

### 12. bash 缺少 onUpdate 流式更新

| 维度 | 官方 | 本项目 |
|------|------|--------|
| 流式输出 | `onUpdate` 回调，100ms 节流推送部分结果 | 无流式更新，等待命令完成后一次性返回 |

**影响**：长时间运行的命令（构建、测试）在前端无实时输出反馈，用户需等待命令完成后才能看到结果。

**评估**：`pi-agent-core` 的 `AgentTool.execute` 签名**支持** `onUpdate` 回调（`onUpdate?: AgentToolUpdateCallback<TDetails>`）。这是可以直接利用的能力。

**建议**：中优先级。为 bash 工具添加 `onUpdate` 流式输出，提升用户体验。

---

## 优先级排序

| 优先级 | 差异项 | 理由 |
|--------|--------|------|
| **高** | #2 readFile 输出截断 | 大文件读取直接导致 token 爆炸，影响对话质量 |
| **高** | #4 bash 输出截断 | 大输出命令直接报错而非优雅降级 |
| **中** | #1 readFile offset/limit | 与 #2 配合，提供大文件分页读取能力 |
| **中** | #3 bash timeout 参数 | 长命令被 30s 硬限制切断 |
| **中** | #6 editFile prepareArguments | 防止部分模型的 JSON 字符串 edits 导致错误 |
| **中** | #8 grep/find 探索工具 | 减少模型通过 bash 搜索的间接路径 |
| **中** | #11 AbortSignal 实际使用 | 中止操作时避免无用的文件/命令执行 |
| **中** | #12 bash onUpdate 流式 | 长命令实时反馈 |
| **低** | #5 promptGuidelines | 当前 system-prompt.md 手动维护功能等价 |
| **低** | #7 diff/patch 输出 | 无 TUI 渲染需求 |
| **低** | #10 工具名称 | 影响微小 |
| **非差距** | #9 file-mutation-queue | Authority 方案更完备 |

---

## 建议实施路径

### 第一阶段（短期高收益）
- readFile 合并 offset/limit + 添加 truncateHead 截断
- bash 添加 truncateTail 截断 + timeout 参数
- editFile 添加 prepareArguments（JSON 字符串修复）
- 合并 readFileWithLines 到 readFile（减少工具数量）

### 第二阶段（中期增强）
- 为 bash 添加 AbortSignal 检查 + onUpdate 流式更新
- 评估添加 grep/find 工具的 ROI

### 第三阶段（长期优化）
- 评估 promptGuidelines 自动注入机制
- 评估 editFile diff/patch 输出对 UI 的价值

---

## 相关文件

| 文件 | 角色 |
|------|------|
| `packages/agent-service/src/backends/pi-tools/edit-file-tool.ts` | editFile 工具实现 |
| `packages/agent-service/src/backends/pi-tools/file-tools.ts` | readFile/writeFile/listFiles 工具实现 |
| `packages/agent-service/src/backends/pi-tools/read-file-lines-tool.ts` | readFileWithLines 工具（待合并） |
| `packages/agent-service/src/backends/pi-tools/bash-tool.ts` | bash 工具实现 |
| `packages/agent-service/src/backends/pi-tools/index.ts` | 工具注册入口 |
| `packages/agent-service/src/backends/pi-agent.ts` | harness 初始化 + system prompt 构建 |
| `packages/author-site/src/lib/agent/prompts/system-prompt.md` | System Prompt（含 File Editing Rules） |
