# pnpm lockfile 运行时阻塞修复

> 最终状态：已完成
> 完成日期：2026-06-28

## 背景

[Codex 开发模式下项目维护性剩余优化任务拆分](./Codex开发模式下项目维护性优化建议.md) 将“修复 pnpm/lockfile 运行时阻塞”列为 P1-1。当前直接运行 Node 脚本和本地 `tsc` 可以验证，但通过 `pnpm --filter ...` 执行时会被 pnpm 的 lockfile/runtime 兼容性检查阻塞。

## 目标

- 确认当前实际执行的 pnpm 版本与项目声明的 `pnpm@8.15.0` 是否一致。
- 找到 `pnpm check:repo`、`pnpm check:viewer` 被阻塞的原因。
- 采用低风险方式恢复根脚本可执行性。

## 范围

- `package.json`
- `pnpm-lock.yaml`
- `.npmrc`
- `pnpm-workspace.yaml`
- 维护治理文档

## 方案

1. 先诊断版本和 lockfile，不直接刷新依赖。
2. 优先选择不重写 lockfile、不删除 `node_modules` 的修复方式。
3. 如果必须变更 lockfile，先记录原因和影响，再执行。

## 任务清单

- [x] 读取 pnpm 版本、lockfileVersion、packageManager 和 `.npmrc`。
- [x] 复现 `pnpm check:repo` 阻塞并定位调用链。
- [x] 实施修复。
- [x] 验证 `corepack pnpm check:repo` 和 `corepack pnpm check:viewer`。
- [x] 更新维护治理文档与本记录。

## 进度记录

- 2026-06-28：创建任务文档，开始诊断 pnpm 运行时阻塞。
- 2026-06-28：确认裸 `pnpm` 实际版本为 11.7.0，项目声明为 `pnpm@8.15.0`，lockfileVersion 为 `6.0`。
- 2026-06-28：确认 `corepack pnpm --version` 为 8.15.0，可正确匹配项目声明。
- 2026-06-28：确认 `corepack pnpm check:viewer` 初次失败原因是根脚本内部递归调用裸 `pnpm`，仍命中 11.7.0。
- 2026-06-28：将根 `package.json` 中递归调用 workspace 的 `pnpm` 改为 `corepack pnpm`。
- 2026-06-28：验证 `corepack pnpm check:repo` 通过，保留 133 条 warning；验证 `corepack pnpm check:viewer` 通过。

## 验证方式

- `corepack pnpm check:repo`：通过。
- `corepack pnpm check:viewer`：通过。
- `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"`：通过。

## 风险与待确认事项

- 当前工作区存在大量与本任务无关的未提交改动，本任务不回滚、不清理。
- 裸 `pnpm` 在当前 Codex runtime PATH 下仍会命中 11.7.0；项目内推荐入口改为 `corepack pnpm`，避免修改全局环境。
- 本次未重写 lockfile，未删除或重装 `node_modules`。
