# 原型页升级死锁与 AI 工具链问题沉淀

## 状态总览

| 问题 | 状态 | 摘要 |
| --- | --- | --- |
| 原型→高保真升级后残留文件无法清理 | 🔴 未修复 | AI 缺少 deleteFile 工具，bash 只读，清空触发校验死锁 |
| 原型页校验死锁：高保真页仍检查原型文件非空 | 🔴 未修复 | `runtimeType=high-fidelity-react` 时仍校验 prototype.html 非空 |
| bash 沙箱 `node` 允许/拒绝矛盾 | 🔴 未修复 | 错误信息列出 node 在 allowed 列表但实际拒绝；可通过 `process.mainModule.require` 绕过 |
| WORKSPACE_EXTERNAL_DRIFT 导致 listPages 失败 | 🟡 待确认 | 系统自动修改 workspace-tree.json 后 AI baseRevision 过期 |
| AI 自动修复循环产生 DUPLICATE_TOP_LEVEL_DECLARATION | 🟡 已有沉淀 | writeFile 内容拼接导致重复声明 |
| 截图服务不可用 | 🟡 待确认 | captureScreenshot 返回 fetch failed 或 missing_context |
| 推荐方案：`transform: translateZ(0)` 解除 fixed 限制 | 💡 待实施 | 一行 CSS 让原型页支持 position: fixed，从根源消除升级场景 |

---

## 问题来源

Session `session-1784014997128-f76zqwsec`，用户请求"新建一个儿童教育手机页面"。AI 创建原型页后因 `position: fixed`（底部导航）触发升级为 high-fidelity-react，但升级后无法清理原型文件，陷入死循环。Revision 从 118 变化到 132（14 次文件变更），用户感知为"卡住"。

---

## P1：原型→高保真升级后残留文件无法清理

### 现象

AI 先创建 `prototype.html` + `prototype.css`，prototype gate 检测后要求升级为 `high-fidelity-react`。AI 创建 `index.tsx` 后尝试清理原型文件，连续 7 次删除操作全部失败：

| 尝试 | 命令 | 结果 |
| --- | --- | --- |
| 1 | `mkdir -p` | permission denied |
| 2 | `rm` | permission denied |
| 3 | `node -e "fs.unlinkSync(...)"` | permission denied（矛盾：错误信息列出 node 在 allowed 中） |
| 4 | `find -delete` | WORKSPACE_AUTHORITY_REQUIRED |
| 5-6 | 再次 `node -e` | permission denied |
| 7 | `writeFile` 清空为空内容 | 触发 PROTOTYPE_HTML_EMPTY 校验错误 |

### 根因

1. **AI 工具链缺少 `deleteFile` 工具**：`writeFile` 只能写不能删，`bash` 是只读模式
2. **bash 沙箱矛盾**：错误信息说 "Allowed: node, ls, cat..." 但实际 `node -e` 也被拒绝
3. **原型→高保真升级路径缺少清理机制**：系统检测到需要升级时，没有提供清理原型文件的原子操作

### 影响

- AI 陷入死循环，反复尝试不同删除方式，浪费 token 和时间
- 用户感知为"卡住"
- 最终残留空 prototype.css 和占位 prototype.html

### 相关代码

| 组件 | 文件 | 说明 |
| --- | --- | --- |
| bash 沙箱限制 | `packages/agent-service/src/backends/pi-tools/` | bash 工具只读模式，rm/mkdir/node -e 被拒 |
| writeFile 工具 | `packages/agent-service/src/backends/pi-tools/` | 只有写文件能力，无删除能力 |
| 原型页清理规则 | Agent prompt 中的 contract rule | "不要同时保留同一轮生成的 prototype.html/css 作为有效页面源码" |

---

## P2：原型文件清空的校验死锁

### 现象

AI 用 `writeFile` 将 `prototype.html` 写为空内容，系统返回：

```
PROTOTYPE_HTML_EMPTY → decision: repair_prototype
```

### 根因

当页面已升级为 `runtimeType: high-fidelity-react` 时，校验器仍然检查 `prototype.html` 文件并要求其非空。但规则明确要求不保留原型文件。

### 矛盾链

1. 规则要求删除原型文件
2. 工具不允许删除文件
3. 清空文件触发校验错误
4. 保留原文件也不对

这是**校验逻辑与工具能力的死锁**。

### 相关代码

| 组件 | 文件 | 说明 |
| --- | --- | --- |
| 原型页空文件校验 | `packages/project-core/src/service.ts` ~L5500 | 检查 prototype.html 是否为空 |
| Agent 侧校验 | `packages/agent-service/src/backends/pi-tools/preview-validation.ts` | 同步的空文件检查逻辑 |

---

## P3：bash 沙箱 `node` 允许/拒绝矛盾

### 现象

AI 执行 `node -e "require('fs').unlinkSync(...)"` 时，错误信息为：

```
Error: command "node" is not allowed. Allowed: node, ls, cat, head, tail, grep, find, wc, echo.
Denied: rm, rmdir, mv, cp, mkdir, sudo, chmod, chown
```

`node` 同时出现在 "Allowed" 列表和 "not allowed" 结果中。

### 根因

bash 沙箱的命令过滤逻辑存在两层检查：第一层白名单列出 node，第二层对 `node -e` 的写文件操作做了额外拦截，但错误信息没有区分这两种情况。

### `node -e` 沙箱绕过方案

Node.js 沙箱可以通过 `process.mainModule.require` 绕过限制，直接获取 `fs` 模块执行文件操作：

```bash
node -e "process.mainModule.require('fs').unlinkSync('path/to/file')"
```

**原理**：`process.mainModule` 是 Node.js 内部属性，指向当前主模块。通过它的 `require` 方法可以直接加载内置模块（如 `fs`），绕过沙箱对 `require` 的限制。

**影响**：
- 如果 bash 沙箱依赖 Node.js 的 `require` 拦截来阻止文件写操作，这个绕过方式意味着沙箱的安全边界不完整
- AI Agent 理论上可以用这种方式删除文件、读写任意文件，突破只读模式限制
- 需要评估这是否是预期行为（沙箱应该阻止什么级别的写操作）

### 相关代码

| 组件 | 文件 | 说明 |
| --- | --- | --- |
| bash 命令白名单 | `packages/agent-service/src/backends/pi-tools/` | bash 工具的命令过滤逻辑 |
| node -e 沙箱绕过 | N/A | `process.mainModule.require('fs')` 可绕过 require 限制 |

---

## P4：WORKSPACE_EXTERNAL_DRIFT 导致 listPages 失败

### 现象

AI 在 revision 123 写入 `workspace-tree.json` 后，调用 `listPages` 返回 `WORKSPACE_EXTERNAL_DRIFT`。

### 根因

系统在 AI 写入后自动修改了 `workspace-tree.json`（添加了 `routeKey: "page"` 字段），导致 revision 从 123 跳变到 125，AI 的 baseRevision 与当前 revision 不一致，触发 drift 检测。

### 影响

AI 无法通过 `listPages` 验证页面注册是否成功。

---

## P5：AI 自动修复循环 — DUPLICATE_TOP_LEVEL_DECLARATION

### 现象

对话最后系统自动修复消息检测到：

```
阶段: module_parse
代码: DUPLICATE_TOP_LEVEL_DECLARATION
错误: 顶层声明 Icon 重复，浏览器会拒绝导入该模块
```

### 根因

`index.tsx` 中 `import { Icon } from "@preview/sdk"` 被重复拼接。这是 AI 在之前的自动修复循环中，将旧内容与新内容拼接导致的。

### 已有沉淀

该问题的完整根因分析已在 `创作端项目编辑页预览区问题沉淀.md` 附带发现中引用，完整根因在 `创作端编辑与协同问题沉淀.md` P3 条目。

---

## P6：截图服务不可用

### 现象

- 第一次 `captureScreenshot`：`missing_context`（demoId 未绑定）
- 第二次 `captureScreenshot`：`fetch failed`（网络错误）

### 可能根因

截图服务（端口 3202）未启动或不可达；或者 session 上下文中 demoId 未正确传递。

---

## 推荐方案：`transform: translateZ(0)` 解除 fixed 限制

### 核心思路

CSS 规范行为：**当祖先元素设置了 `transform`（即使是 `translateZ(0)`），`position: fixed` 的后代以该祖先为包含块，而非视口。**

当前原型页渲染容器 `.prototype-root` 已有 `overflow: hidden` 做裁剪，只需加一行 `transform: translateZ(0)` 即可让 `position: fixed` 被容器捕获，不再逃逸到编辑器 UI。

### 改动范围

| 改动 | 文件 | 说明 |
| --- | --- | --- |
| 渲染容器加 transform | `packages/shared/src/demo/prototype-preview.ts` L310-317 | `.prototype-root` 加 `transform: translateZ(0)` |
| 移除 fixed 校验（project-core） | `packages/project-core/src/service.ts` ~L5608 | 删除 `PROTOTYPE_FIXED_POSITION_REQUIRES_ISOLATION` 检查 |
| 移除 fixed 校验（agent-service） | `packages/agent-service/src/backends/pi-tools/preview-validation.ts` ~L84 | 同步删除 |
| 更新测试 | `packages/project-core/src/__tests__/service.test.ts` | 移除 fixed 相关断言 |
| 更新测试 | `packages/agent-service/tests/unit/preview-validation.test.ts` | 同步移除 |
| 更新文档 | `docs/项目文档/创作端/04-配置与预览/技术/02_实时预览机制.md` L138 | 更新 prototype gate 红线列表 |

### 效果

| 场景 | 当前 | 改后 |
| --- | --- | --- |
| 底部导航用 `position: fixed` | 强制升级 high-fidelity | 正常渲染在原型页内 |
| fixed 元素逃逸编辑器 UI | 靠禁止 fixed 防止 | 靠 transform 包含块防止 |
| AI 创建带底部导航的页面 | 先创建原型→校验失败→升级→清理残留死锁 | 一次成功，无需升级 |
| 本会话的死锁问题 | 存在 | 从根源消除 |

### 额外收益

`transform: translateZ(0)` 触发 GPU 合成层，原型页渲染性能更好。

---

## 验证状态

- 方案已设计，待实施
- 需要验证：`transform: translateZ(0)` 在各种浏览器中对 `position: fixed` 的包含块行为
- 需要验证：对已有原型页的影响（是否引入回归）

## 风险

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| `transform: translateZ(0)` 在某些浏览器中可能影响 `position: sticky` 行为 | sticky 定位失效 | 测试覆盖 sticky 场景；如有问题改用 `contain: strict` |
| 移除 fixed 校验后，AI 可能在原型页中创建更复杂的 fixed 布局 | 原型页复杂度增加 | 原型页仍有 XSS/脚本等安全限制，fixed 布局本身在容器内可正常工作 |
| 其他依赖"原型页无 transform"的行为 | 未知 | 全量回归原型页预览 |
