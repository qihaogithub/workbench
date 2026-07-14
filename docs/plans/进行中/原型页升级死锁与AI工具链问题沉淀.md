# 原型页升级死锁与 AI 工具链问题沉淀

## 状态总览

| 问题                                                 | 状态          | 摘要                                                                                      |
| ---------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------- |
| 原型→高保真升级后残留文件无法清理                    | 🔴 未修复     | AI 缺少 deleteFile 工具，bash 只读，清空触发校验死锁                                      |
| 原型页校验死锁：高保真页仍检查原型文件非空           | 🔴 未修复     | agent-service 侧 `validatePreviewFileWrite` 不检查 runtimeType，每次写入均触发原型校验    |
| bash 沙箱 `node` 允许/拒绝矛盾                       | 🔴 未修复     | `node` 在白名单但 `node -e` 被特殊拦截（`permissions.ts` L88-90），错误信息不区分两种情况 |
| WORKSPACE_EXTERNAL_DRIFT 导致 listPages 失败         | ✅ 设计预期   | file-tools 已有 drift 自动重试（L195-224, L260-316），系统自动修改后 AI 重试即可恢复      |
| AI 自动修复循环产生 DUPLICATE_TOP_LEVEL_DECLARATION  | 🟡 已有沉淀   | writeFile 内容拼接检测（file-tools.ts L230-257）已缓解                                    |
| 截图服务不可用                                       | ✅ 非代码 bug | `missing_context` 是 demoId 未绑定时预期行为；`fetch failed` 是截图服务未启动的环境问题   |
| 推荐方案：`transform: translateZ(0)` 解除 fixed 限制 | 💡 待实施     | 一行 CSS 让原型页支持 position: fixed，从根源消除升级场景                                 |

---

## 问题来源

Session `session-1784014997128-f76zqwsec`，用户请求"新建一个儿童教育手机页面"。AI 创建原型页后因 `position: fixed`（底部导航）触发升级为 high-fidelity-react，但升级后无法清理原型文件，陷入死循环。Revision 从 118 变化到 132（14 次文件变更），用户感知为"卡住"。

---

## P1：原型→高保真升级后残留文件无法清理

### 现象

AI 先创建 `prototype.html` + `prototype.css`，prototype gate 检测后要求升级为 `high-fidelity-react`。AI 创建 `index.tsx` 后尝试清理原型文件，多次删除操作全部失败：

| 尝试 | 命令                           | 结果                                                       |
| ---- | ------------------------------ | ---------------------------------------------------------- |
| 1    | `rm`                           | permission denied                                          |
| 2    | `node -e "fs.unlinkSync(...)"` | permission denied（矛盾：错误信息列出 node 在 allowed 中） |
| 3    | `find -delete`                 | WORKSPACE_AUTHORITY_REQUIRED                               |
| 4–5  | 再次 `node -e`                 | permission denied                                          |
| 6    | `writeFile` 清空为空内容       | 触发 PROTOTYPE_HTML_EMPTY 校验错误                         |

### 根因

1. **AI 工具链缺少 `deleteFile` 工具**：`writeFile` 只能写不能删，`bash` 是只读模式。但 WMA 底层已支持 `delete_path` 操作（`workspace-mutation-authority.ts` L734/L784），`delete-page-tool.ts` L447-451 已使用该操作删除页面文件。新增 `deleteFile` 工具只需复用同一模式。
2. **bash 沙箱矛盾**：错误信息说 "Allowed: node, ls, cat..." 但实际 `node -e` 也被拒绝
3. **原型→高保真升级路径缺少清理机制**：系统检测到需要升级时，没有提供清理原型文件的原子操作

### 影响

- AI 陷入死循环，反复尝试不同删除方式，浪费 token 和时间
- 用户感知为"卡住"
- 最终残留空 prototype.css 和占位 prototype.html

### 相关代码

| 组件           | 文件                                                                           | 说明                                                           |
| -------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| bash 沙箱限制  | `packages/agent-service/src/backends/pi-tools/bash-tool.ts` + `permissions.ts` | bash 工具只读模式，rm/mkdir 被拒；`node -e` 被特殊拦截         |
| writeFile 工具 | `packages/agent-service/src/backends/pi-tools/file-tools.ts`                   | 只有写文件能力，无删除能力                                     |
| 原型页清理规则 | Agent prompt 中的 contract rule                                                | "不要同时保留同一轮生成的 prototype.html/css 作为有效页面源码" |

---

## P2：原型文件清空的校验死锁

### 现象

AI 用 `writeFile` 将 `prototype.html` 写为空内容，系统返回：

```
PROTOTYPE_HTML_EMPTY → decision: repair_prototype
```

### 根因

当页面已升级为 `runtimeType: high-fidelity-react` 时，**agent-service 侧**的 `validatePreviewFileWrite`（`preview-validation.ts` L227-302，原型页分支 L269-270）仍然对 `prototype.html` 写入执行完整原型页校验，不检查页面 runtimeType。而 `project-core` 服务端的 `validatePageFilesRuntime`（`service.ts` L5558）已正确按 runtimeType 分支（L5563），只在 `prototype-html-css` 时进入 `validatePrototypePageSource`（L5592）原型校验。两侧行为不一致，导致 agent 工具层面清空 prototype.html 时仍被拦截。

### 矛盾链

1. 规则要求删除原型文件
2. 工具不允许删除文件
3. 清空文件触发校验错误
4. 保留原文件也不对

这是**校验逻辑与工具能力的死锁**。

### 相关代码

| 组件             | 文件                                                                                                                                                                                                     | 说明                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 原型页空文件校验 | `packages/project-core/src/service.ts` L5592（`validatePrototypePageSource` 方法，L5617 检查 html 是否为空；仅 `runtimeType === "prototype-html-css"` 时由 `validatePageFilesRuntime` L5558/L5563 进入） | 检查 prototype.html 是否为空                                                     |
| Agent 侧校验     | `packages/agent-service/src/backends/pi-tools/preview-validation.ts` L227-302（`validatePreviewFileWrite`，原型页分支 L269-270）                                                                         | agent-service 侧对每次 `prototype.html` 写入执行校验，**不检查页面 runtimeType** |

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

bash 沙箱的命令过滤存在两层检查：`isCommandAllowed`（`permissions.ts` L75-94）先将 `node` 列入白名单（L36），但随后对 `node -e` / `node --eval` 做了特殊拦截（L88-90），直接返回 false。然而 `bash-tool.ts` L35 的错误信息只输出基础命令名（`node`），不区分是白名单拒绝还是子参数拦截，导致错误信息中 `node` 同时出现在 "Allowed" 列表和 "not allowed" 结果中。

### `node -e` 沙箱绕过方案

Node.js 沙箱可以通过 `process.mainModule.require` 绕过限制，直接获取 `fs` 模块执行文件操作：

```bash
node -e "process.mainModule.require('fs').unlinkSync('path/to/file')"
```

**原理**：`process.mainModule` 是 Node.js 内部属性，指向当前主模块。通过它的 `require` 方法可以直接加载内置模块（如 `fs`），绕过沙箱对 `require` 的限制。

**影响**：

- 当前沙箱已在命令层拦截 `node -e`，上述绕过方式实际不可触发
- 但如果未来放开 `node -e` 的部分场景（如允许只读脚本），需要评估 `process.mainModule.require` 的安全边界
- 需要评估沙箱应该阻止什么级别的写操作（命令级 vs 操作级）

### 相关代码

| 组件             | 文件                                                                      | 说明                                                                                                       |
| ---------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| bash 命令白名单  | `packages/agent-service/src/backends/pi-tools/permissions.ts` L36, L88-90 | `node` 在白名单中，但 `node -e` / `node --eval` 被特殊拦截；错误信息不区分两种情况                         |
| node -e 沙箱绕过 | N/A                                                                       | `process.mainModule.require('fs')` 可绕过 require 限制（但当前沙箱已在命令层拦截 `node -e`，实际不可触发） |

---

## P4：WORKSPACE_EXTERNAL_DRIFT 导致 listPages 失败

### 现象

AI 在 revision 123 写入 `workspace-tree.json` 后，调用 `listPages` 返回 `WORKSPACE_EXTERNAL_DRIFT`。

### 根因

系统在 AI 写入后自动修改了 `workspace-tree.json`（添加了 `routeKey: "page"` 字段），导致 revision 从 123 跳变到 125，AI 的 baseRevision 与当前 revision 不一致，触发 drift 检测。

### 结论：设计预期行为

`file-tools.ts` 的 `readFile`（L79-107）、`writeFile`（L195-224 getSnapshot, L260-316 mutate）、`listFiles`（L402-431）均已实现 EXTERNAL_DRIFT 自动重试：捕获 `WORKSPACE_EXTERNAL_DRIFT` 后调用 `reconcileAdopt` 对齐 revision，然后重试操作。AI 在 drift 后重试即可恢复正常，不影响数据一致性。

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

### 结论：非代码 bug

- **`missing_context`**：`screenshot-tool.ts` L258-272 在 `config.demoId` 为空时返回此错误。AI 在页面注册完成前调用截图，demoId 尚未绑定，属于调用时序问题而非 bug。
- **`fetch failed`**：截图服务（端口 3202）未启动或不可达，属于本地开发环境问题。

---

## 推荐方案：`transform: translateZ(0)` 解除 fixed 限制

### 核心思路

CSS 规范行为：**当祖先元素设置了 `transform`（即使是 `translateZ(0)`），`position: fixed` 的后代以该祖先为包含块，而非视口。**

当前原型页渲染容器 `.prototype-root` 在编辑器预览面板场景下已有 `overflow: hidden` 做裁剪（`prototype-preview.ts` L285：`shouldScaleToPreviewSize` 为 true 时 overflow 为 `hidden`），只需加一行 `transform: translateZ(0)` 即可让 `position: fixed` 被容器捕获，不再逃逸到编辑器 UI。

### 改动范围

| 改动                             | 文件                                                                          | 说明                                                                                                 |
| -------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 渲染容器加 transform             | `packages/shared/src/demo/prototype-preview.ts` L310-317                      | `.prototype-root` 加 `transform: translateZ(0)`                                                      |
| 移除 fixed 校验（project-core）  | `packages/project-core/src/service.ts` L5701-5710                             | 删除 `PROTOTYPE_FIXED_POSITION_REQUIRES_ISOLATION` 检查（位于 `validatePrototypePageSource` 方法内） |
| 移除 fixed 校验（agent-service） | `packages/agent-service/src/backends/pi-tools/preview-validation.ts` L178-185 | 同步删除（位于 `toPrototypeToolValidation` 函数内）                                                  |
| 更新测试                         | `packages/project-core/src/__tests__/service.test.ts`                         | 移除 fixed 相关断言                                                                                  |
| 更新测试                         | `packages/agent-service/tests/unit/preview-validation.test.ts`                | 当前无 fixed 相关用例，无需修改；若后续新增用例需同步覆盖                                            |
| 更新文档                         | `docs/项目文档/创作端/04-配置与预览/技术/02_实时预览机制.md` L138             | 更新 prototype gate 红线列表（`position: fixed` 从运行时隔离红线中移除）                             |

### 效果

| 场景                         | 当前                                  | 改后                    |
| ---------------------------- | ------------------------------------- | ----------------------- |
| 底部导航用 `position: fixed` | 强制升级 high-fidelity                | 正常渲染在原型页内      |
| fixed 元素逃逸编辑器 UI      | 靠禁止 fixed 防止                     | 靠 transform 包含块防止 |
| AI 创建带底部导航的页面      | 先创建原型→校验失败→升级→清理残留死锁 | 一次成功，无需升级      |
| 本会话的死锁问题             | 存在                                  | 从根源消除              |

### 额外收益

`transform: translateZ(0)` 触发 GPU 合成层，原型页渲染性能更好。

---

## 分阶段修复方案

### Phase 1：错误信息修复（P3）— 最低风险

**目标**：让 bash 沙箱错误信息准确反映拒绝原因。

**改动**：`bash-tool.ts` L31-38，区分白名单拒绝和子参数拦截两种情况，输出不同错误信息。

**验证**：`pnpm check:agent`

### Phase 2：校验死锁修复（P2）— 中低风险

**目标**：agent-service 侧校验与 project-core 保持一致，按 runtimeType 分支。

**改动**：

- `preview-validation.ts`：扩展 `validatePreviewFileWrite` 签名，增加可选 `runtimeType` 参数
- `file-tools.ts` L317-320：调用方传入当前页面 runtimeType（从 workspace-tree.json 读取）
- 当 `runtimeType !== 'prototype-html-css'` 时，跳过原型页校验

**验证**：`pnpm check:agent` + 新增测试用例

### Phase 3：deleteFile 工具（P1）— 中等风险

**目标**：为 AI 工具链增加单文件删除能力，复用 WMA `delete_path` 操作。

**改动**：

- 新建 `delete-file-tool.ts`，参照 `writeFile` 模式实现（isPathAllowed + Authority mutate + drift 重试）
- 复用 `delete-page-tool.ts` L438-459 的 `delete_path` 模式
- 限制：禁止删除 `workspace-tree.json`（页面删除走 `deletePage`）和 `index.tsx`
- `index.ts` 注册新工具

**验证**：`pnpm check:agent` + 新增单元测试

### Phase 4：transform 方案 — 需回归测试

**目标**：一行 CSS 让原型页支持 `position: fixed`，从根源消除升级场景。

**改动**：见上方「推荐方案」章节。

### 依赖关系

```
Phase 1（P3）→ 独立，无依赖
Phase 2（P2）→ 独立，无依赖
Phase 3（P1）→ 建议在 Phase 2 之后（避免删除后仍触发校验）
Phase 4（transform）→ 建议在 Phase 2/3 之后
```

Phase 1 和 Phase 2 可并行实施。

---

## 被否决的替代方案

| 方案                                                         | 否决原因                                                                                                          |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| 升级时系统自动清理原型文件                                   | 增加系统隐式行为，违反"AI 显式控制文件"原则；与 WMA 审计 trail 冲突                                               |
| bash 沙箱放开 `node -e` 只读模式                             | 安全风险大，`node -e` 可执行任意代码；不如用 deleteFile 工具精确控制                                              |
| `contain: strict` 替代 `transform: translateZ(0)`            | `contain: strict` 包含 size/layout/paint 限制，可能影响原型页内正常渲染；`translateZ(0)` 只创建包含块，副作用更小 |
| 在 `validatePreviewFileWrite` 中检查磁盘文件推断 runtimeType | 增加 IO 开销且与 project-core 的推断逻辑重复；不如显式传入 runtimeType                                            |

---

## 验证状态

- Phase 1-4 方案已设计，待实施
- 需要验证：`transform: translateZ(0)` 在各种浏览器中对 `position: fixed` 的包含块行为
- 需要验证：对已有原型页的影响（是否引入回归）

## 风险

| 风险                                                                      | 影响             | 缓解                                                            |
| ------------------------------------------------------------------------- | ---------------- | --------------------------------------------------------------- |
| `transform: translateZ(0)` 在某些浏览器中可能影响 `position: sticky` 行为 | sticky 定位失效  | 测试覆盖 sticky 场景；如有问题改用 `contain: strict`            |
| 移除 fixed 校验后，AI 可能在原型页中创建更复杂的 fixed 布局               | 原型页复杂度增加 | 原型页仍有 XSS/脚本等安全限制，fixed 布局本身在容器内可正常工作 |
| 其他依赖"原型页无 transform"的行为                                        | 未知             | 全量回归原型页预览                                              |
