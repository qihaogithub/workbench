# 新建-编辑-保存项目测试

> 本文件为 AI 编码代理提供关于此 E2E 测试脚本的指南。

## 测试脚本位置

```
test/新建-编辑-保存项目测试/
├── e2e-test-project-flow.spec.ts    # 主测试脚本
├── playwright.config.ts              # Playwright 配置文件
└── AGENTS.md                         # 本文件
```

## 测试流程

测试脚本实现以下完整流程：

1. **打开首页** - 导航至 `http://localhost:3200`
2. **新建项目** - 点击新建项目按钮，填写项目名称
3. **打开编辑页** - 进入项目编辑页面
4. **粘贴代码** - 将预设模板代码粘贴到代码编辑区
5. **保存** - 点击保存按钮
6. **生成日志** - 在 `test-logs/` 目录生成完整测试日志

## 运行测试

### 前置条件

1. 确保开发服务器已启动：
   ```bash
   pnpm dev
   # 或仅启动 web 服务
   pnpm dev:web
   ```

2. 安装 Playwright 浏览器（首次运行）：
   ```bash
   pnpm playwright install chromium
   ```

### 执行命令

```bash
# 安装依赖
pnpm install

# 运行测试（无头模式）
pnpm playwright test

# 有头模式运行（可见浏览器）
pnpm playwright test --headed

# UI 模式运行（交互式调试）
pnpm playwright test --ui

# 运行特定测试文件
pnpm playwright test test/新建-编辑-保存项目测试/e2e-test-project-flow.spec.ts

# 运行特定测试用例
pnpm playwright test -t "完整流程"
```

## 日志与报告

### 测试日志

日志文件保存在项目根目录的 `test-logs/` 目录：

| 文件 | 说明 |
|------|------|
| `test-log-*.txt` | 测试执行日志，包含每个步骤的详细信息 |
| `01-homepage-*.png` | 首页截图 |
| `02-edit-page-*.png` | 编辑页截图 |
| `03-code-pasted-*.png` | 粘贴代码后截图 |
| `04-saved-*.png` | 保存后截图 |
| `error-*.png` | 测试失败时的错误截图 |

### HTML 报告

测试报告生成在 `test-reports/` 目录：

```bash
# 查看 HTML 报告
# 报告文件：test-reports/index.html
```

## 调试测试

### 使用 Playwright CLI 调试

```bash
# 打开浏览器并逐步执行
playwright-cli open http://localhost:3200

# 查看页面快照（获取元素引用）
playwright-cli snapshot

# 点击元素
playwright-cli click <element-ref>

# 截图
playwright-cli screenshot
```

### 元素定位

测试脚本使用多种定位策略查找元素：

| 元素 | 定位策略 |
|------|----------|
| 新建项目按钮 | `getByRole('button', { name: /新建/i })` 或包含"新建"的文本 |
| 项目名称输入框 | `getByPlaceholder(/项目.*名称/i)` 或第一个文本输入框 |
| 创建确认按钮 | `getByRole('button', { name: /创建/i })` |
| 编辑按钮 | `getByRole('button', { name: /编辑/i })` |
| 代码编辑器 | `.cm-editor`, `.cm-content`, `textarea`, `[contenteditable]` |
| 保存按钮 | `getByRole('button', { name: /保存/i })` |

### 等待策略

- `waitUntil: 'networkidle'` - 等待网络空闲
- `waitForLoadState('domcontentloaded')` - 等待 DOM 加载
- `waitForTimeout(1000-2000)` - 等待过渡动画

## 自定义模板代码

如需修改测试中使用的模板代码，编辑 `e2e-test-project-flow.spec.ts` 文件顶部的 `TEMPLATE_CODE` 常量：

```typescript
const TEMPLATE_CODE = `=== DEMO CODE ===
// 你的代码...
=== DEMO SCHEMA ===
// 你的 JSON Schema...
=== END ===`;
```

## 常见问题

### 测试超时

如果测试因网络缓慢超时，可修改 `playwright.config.ts` 中的超时设置：

```typescript
timeout: 120000,  // 增加到 2 分钟
expect: {
  timeout: 30000   // 断言超时 30 秒
}
```

### 元素未找到

如果 UI 元素定位失败，脚本会抛出 "未找到代码编辑器" 错误。可使用 `playwright-cli` 工具探索实际页面结构，并更新脚本中的定位选择器。

### 截图目录不存在

日志目录 `test-logs/` 会在首次运行时自动创建，无需手动创建。