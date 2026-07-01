# 配置功能 E2E 回归覆盖

## 背景

创作端项目编辑页的右侧配置栏近期出现过画布选择联动和项目级配置显示回归。需要补充一个稳定的回归用例，覆盖配置相关核心路径，避免页面级、项目级、画布模式和持久化链路再次脱节。

## 目标

- 新增创作端配置功能 Playwright E2E 回归测试。
- 覆盖项目级共享配置、页面级配置、画布页面点击进入配置详情、画布空白点击回到一级页面列表。
- 覆盖配置数据保存后重新打开仍可读回。

## 范围

- 测试目录：`test/创作端E2E回归测试/`
- 相关前端：创作端项目编辑页、共享 `PreviewCanvas`、`PageConfigPanel`
- 相关接口：项目、session、页面文件、项目配置、保存与删除

## 方案

- 使用现有 Playwright 配置和测试账号。
- 每次测试通过 UI 新建临时项目，使用真实接口写入测试页面、项目级 schema 和页面级 schema。
- 在编辑页通过 UI 验证配置面板显示和画布联动。
- 修改配置项后保存版本，创建新 session 读取页面文件和项目配置，确认配置字段持久化。
- finally 中删除临时项目，避免污染本地数据。

## 任务清单

- [x] 阅读现有 E2E 规范和已有测试模式
- [x] 实现配置功能回归 spec
- [x] 运行 Playwright 发现测试和目标 E2E 验证
- [x] 记录验证结果和剩余风险

## 进度记录

- 2026-06-28：确认现有 E2E 位于 `test/创作端E2E回归测试/`，并采用 h5-test 标记和真实接口清理策略。
- 2026-06-28：新增 `config-panel-regression.spec.ts`，覆盖项目级配置、页面级配置、schema 冲突、保存后读回、单页配置表单、画布页面选中联动和空白画布回到一级页面列表。
- 2026-06-28：执行 `playwright test --config test/创作端E2E回归测试/playwright.config.ts --grep "配置功能回归"`，新增用例通过。

## 验证方式

- `tsc --noEmit`
- `playwright test --config test/创作端E2E回归测试/playwright.config.ts <新增 spec>`

已执行：

- `playwright test --config test/创作端E2E回归测试/playwright.config.ts --list`
- `playwright test --config test/创作端E2E回归测试/playwright.config.ts --grep "配置功能回归"`

## 风险与待确认事项

- E2E 需要 author-site 服务可访问 `E2E_BASE_URL`，默认 `http://localhost:3200`。
- 当前项目本地 `pnpm` 命令存在 lockfile 兼容性问题，必要时直接使用包内可执行文件或已安装 Playwright。
