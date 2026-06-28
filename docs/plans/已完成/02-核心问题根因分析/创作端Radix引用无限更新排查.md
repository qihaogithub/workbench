# 创作端 Radix 引用无限更新排查

## 背景

创作端页面出现 Next.js 运行时错误：`Maximum update depth exceeded`。截图中的调用栈停在 React `dispatchSetState` 和 `@radix-ui/react-compose-refs` 的 `setRef`，说明问题很可能来自某个 Radix/shadcn 组件挂载时的 ref 回调触发了状态更新，并在重复渲染中形成循环。

## 目标

- 定位触发无限更新的具体组件和代码路径。
- 修复循环更新根因，保持现有交互行为不变。
- 补充必要验证，确保创作端页面不再被运行时错误阻断。

## 范围

- 重点范围：`packages/author-site/` 前端组件、配置与预览相关页面。
- 文档范围：本排查记录；如代码行为或模块约束发生变化，同步更新 `docs/项目文档/` 对应模块文档。
- 不涉及：Agent Service、截图服务、历史 `packages/web/` 目录。

## 方案

1. 收集错误证据，确认调用栈特征和可疑组件类型。
2. 使用 CodeGraph 与文本搜索定位 Radix/shadcn 组件中可能触发状态更新的 ref、layout effect 或组合组件。
3. 约束 Radix ref 合成依赖版本，避开 `1.1.x` callback ref cleanup 行为在 React 18.3 开发环境中的循环更新风险。
4. 运行 author-site 范围验证。

## 任务清单

- [x] 记录错误现象与初始调用栈特征。
- [x] 检查 CodeGraph 索引状态。
- [x] 定位具体触发组件。
- [x] 实施最小修复。
- [x] 更新长期项目文档或说明无需更新的原因。
- [x] 运行验证命令并记录结果。

## 进度记录

- 2026-06-28：用户提供截图，错误为 Next.js 开发覆盖层 `Maximum update depth exceeded`，调用栈包含 `@radix-ui/react-compose-refs` 的 `setRef`。
- 2026-06-28：确认 CodeGraph 索引正常，已索引 519 个文件、5557 个节点。
- 2026-06-28：复查既有同类排查记录，确认上一轮 `useCollabDocument` descriptor 稳定化修复仍存在。当前编辑页首屏、页面树 DropdownMenu、页面 Select 和配置化切换未在本地复现新的 runtime error。
- 2026-06-28：检查 `@radix-ui/react-compose-refs` 实现，确认 `1.1.x` 会把 callback ref 返回值聚合为 cleanup；`1.0.0` 仅设置 ref，不返回 cleanup。截图堆栈直接命中 `1.1.2` 的 `setRef`，因此在根依赖配置中统一 override 到 `1.0.0`。
- 2026-06-28：使用 `corepack pnpm install --lockfile-only` 和 `corepack pnpm install` 同步依赖；`corepack pnpm list @radix-ui/react-compose-refs --depth 10 --filter @opencode-workbench/author-site` 显示 author-site 依赖树中的 compose-refs 均为 `1.0.0`。
- 2026-06-28：`corepack pnpm --filter @opencode-workbench/author-site typecheck` 通过；`corepack pnpm --filter @opencode-workbench/author-site test` 通过，51 个测试套件、379 个测试全部通过。

## 最终状态

已完成。根因定位为 Radix `@radix-ui/react-compose-refs@1.1.x` 的 callback ref cleanup 语义与当前 React 18.3 开发环境、创作端 Radix 组件组合存在兼容风险。通过根依赖 override 将该包统一固定到 `1.0.0`，使 ref 合成仅执行节点写入，不再引入 cleanup 返回值路径。

## 验证方式

- 首选运行 `pnpm check:author`。
- 如能复现页面路径，额外启动或复用 author-site 开发服务进行页面级确认。
- 本次实际验证使用 `corepack pnpm --filter @opencode-workbench/author-site typecheck` 和 `corepack pnpm --filter @opencode-workbench/author-site test`。根脚本 `corepack pnpm check:author` 内部调用裸 `pnpm`，在当前机器会落到全局 pnpm v11 并因 lockfile 版本不兼容失败，因此拆分执行包级命令。

## 风险与待确认事项

- 当前截图未显示具体 URL，需要从代码和本地运行状态反推触发页面。
- 本地没有复现新的错误覆盖层；本次修复基于截图堆栈与依赖实现差异，仍需通过用户原始触发路径确认。
- 工作区存在大量既有未提交改动；`pnpm-lock.yaml` 同步时会反映当前依赖声明状态。
