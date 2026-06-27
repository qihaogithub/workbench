# author-site Jest 既有失败记录

## 背景

在实施“实时保存与多人协同编辑”以及“自动保存草稿、手动创建版本”的过程中，`author-site` 的 TypeScript 类型检查可以通过，但完整 `check:author` 会被既有 Jest 单元测试失败挡住。

这些失败项不是当前协同编辑主路径改动直接验证出的回归，但会影响后续把 `pnpm check:author` 作为绿色质量门禁。

## 目标

- 记录当前已知 Jest 失败项，避免后续代理重复排查。
- 区分“阻塞协同功能验收”的问题和“需要单独清理的测试债务”。
- 给出后续修复优先级和建议验证方式。

## 范围

本记录仅覆盖 `packages/author-site` Jest 失败，不包含：

- agent-service 协同 WebSocket 验收。
- project-core 类型检查。
- Playwright 双会话协同验收。
- 其他未运行或未复现的测试失败。

## 已清理失败项

### `src/lib/__tests__/session-manager-save.test.ts`

原现象：

- 原子复制失败场景的断言不一致。
- 测试期望失败结果为 `false`，实际返回为 `true`。

处理结果：

- 原测试通过 `chmod 000` 模拟复制失败；在 Windows/管理员环境下该失败注入不稳定，导致实际保存成功。
- 已改为对 `fs.cpSync` 的 `workspace.tmp` 复制步骤做确定性失败注入，继续验证“复制失败时正式 workspace 不被破坏”。

当前影响：

- 已不再阻塞 `pnpm check:author`。

### `components/demo/__tests__/PreviewPanel.test.tsx`

原现象：

- 预览编译错误相关断言与实际行为不匹配。

处理结果：

- 当前 PreviewPanel 会读取 `response.headers.get("content-type")` 后再解析响应。
- 测试 mock 的 Response 缺少 `headers.get`，导致显示 TypeError 而不是 mock 编译错误；已补齐 JSON Response mock。

当前影响：

- 已不再阻塞 `pnpm check:author`。

### `src/components/demo/preview-canvas-interaction-mode.test.tsx`

原现象：

- 测试期望的 label 文本是乱码，但实际 DOM 中渲染的是正常中文。

处理结果：

- 测试文件中的 label、标题和部分坐标断言来自历史编码遗留或旧交互行为。
- 已将断言恢复为当前 DOM 的正常中文 label，并同步文字节点落点坐标。

当前影响：

- 已不再阻塞 `pnpm check:author`。

## 已通过验证

- `corepack pnpm@8.15.0 --filter @opencode-workbench/author-site typecheck`
- `corepack pnpm@8.15.0 --filter @opencode-workbench/author-site test -- --testPathPatterns="preview-canvas-interaction-mode.test.tsx"`
- `corepack pnpm@8.15.0 --filter @opencode-workbench/author-site test -- --testPathPatterns="PreviewPanel.test.tsx"`
- `corepack pnpm@8.15.0 --filter @opencode-workbench/author-site test -- --testPathPatterns="session-manager-save.test.ts"`
- `corepack pnpm@8.15.0 check:author`
- `corepack pnpm@8.15.0 check:agent`
- `corepack pnpm@8.15.0 --filter @opencode-workbench/project-core typecheck`
- Chromium/Playwright 双会话协同验收：
  - 页面代码协同同步与 flush 落盘。
  - `workspace-tree.json` 协同同步与 flush 落盘。
  - `.canvas-layout.json` 协同同步与 flush 落盘。

## 风险判断

- 当前记录中的三组失败已清理，`check:author` 已恢复为可用质量门禁。
- 这些问题最终确认为测试基线老化或失败注入不稳定，不是协同编辑实现入口的产品回归。

## 修复顺序

1. 已修 `preview-canvas-interaction-mode.test.tsx` 的乱码文本断言和过期坐标断言。
2. 已修 `PreviewPanel.test.tsx` 的 Response mock。
3. 已修 `session-manager-save.test.ts` 的原子复制失败注入方式。

## 验证方式

单项修复时优先运行对应测试文件：

```bash
corepack pnpm@8.15.0 --filter @opencode-workbench/author-site test -- --testPathPattern="preview-canvas-interaction-mode.test.tsx"
corepack pnpm@8.15.0 --filter @opencode-workbench/author-site test -- --testPathPattern="PreviewPanel.test.tsx"
corepack pnpm@8.15.0 --filter @opencode-workbench/author-site test -- --testPathPattern="session-manager-save.test.ts"
```

全部修复后运行：

```bash
corepack pnpm@8.15.0 check:author
```

## 当前状态

- 状态：已修复并验证。
- 处理建议：后续继续使用 `corepack pnpm@8.15.0 check:author` 作为 author-site 质量门禁。
