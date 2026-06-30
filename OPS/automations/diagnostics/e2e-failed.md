# E2E 失败诊断包

## 现象关键词

- `pnpm test:e2e` 失败
- Playwright timeout
- 登录失败
- 找不到按钮、输入框或编辑器
- 测试项目未清理
- `test-outputs/` 有失败截图或报告

## 必读

1. `test/创作端E2E回归测试/AGENTS.md`
2. `test/创作端E2E回归测试/playwright.config.ts`
3. `test/创作端E2E回归测试/global-setup.ts`
4. `test/创作端E2E回归测试/global-teardown.ts`
5. `OPS/automations/contexts/test-tools-maintenance.md`

## 先判断

| 判断 | 依据 |
|:-----|:-----|
| 服务未启动 | 页面无法访问、连接被拒绝 |
| 登录失败 | 登录页停留、401、测试账号异常 |
| 定位失效 | 页面可见但 selector 找不到 |
| 数据污染 | 测试项目残留、分类不是 `__e2e__` |
| 业务回归 | 同一操作在页面上稳定失败 |

## 低副作用命令

```bash
corepack pnpm check:automation
corepack pnpm check:repo
```

如果确认服务已启动，再运行：

```bash
corepack pnpm test:e2e:core-flow
```

## 常见根因

- E2E 前置服务没有启动。
- UI 文案或结构变化导致定位策略失效。
- 测试项目创建后没有登记或分类。
- teardown 没有清理过期测试项目。
- 业务接口响应结构变化但测试仍按旧契约断言。

## 修复后验证

| 修复类型 | 验证 |
|:---------|:-----|
| 测试 helper 或 spec | `corepack pnpm test:e2e:core-flow` |
| author API 或页面逻辑 | `corepack pnpm check:author`，必要时追加 E2E |
| 测试治理文档 | `corepack pnpm check:repo` |

## 停机条件

- 需要真实账号、生产服务或密钥。
- 需要删除非 `__e2e__` 项目。
- 无法判断是产品回归还是测试定位失效。
