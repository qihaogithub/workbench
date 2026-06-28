# 创作端预览加载中 - Preview SDK Data URL 分析与修复报告

## 背景

- 项目：`proj_1782286923644`
- 项目名称：测试
- 异常页面：
  - `external-guide_k7m2`：站外引导页
  - `age-confirmation_q8n5`：年龄确认弹窗
  - `ended-pending_k8m2`：已截止冠军待揭晓
- 现象：单页预览和画布模式都停留在加载中，页面内容不显示。
- 排查时间：2026-06-26 17:26:41 CST

## 目标

- 确认三个页面是否存在项目数据缺失、编译失败或 iframe 运行时错误。
- 修复 `@preview/sdk` 页面在 iframe 动态 import 阶段失败的问题。
- 验证三个异常页面在真实编译 API 与浏览器运行时中可加载。

## 范围

- 排查项目数据、页面代码、预览编译接口和 iframe 运行路径。
- 修改 author-site 预览编译器的 import URL 字符串生成逻辑。
- 修改预览运行时策略版本和回归测试。
- 未修改项目页面代码，未提交项目编辑事务。

## 任务清单

- [x] 使用 Project Admin CLI 确认项目与页面清单。
- [x] 检查项目 workspace 与 v6 快照中文件是否存在。
- [x] 运行项目 CLI 静态预览校验。
- [x] 调用 author-site `/api/compile` 对比异常页与正常页。
- [x] 使用浏览器执行编译产物，捕获 runtime error。
- [x] 定位代码层根因并整理报告。
- [x] 修复编译器写入 CDN/data URL import specifier 的转义方式。
- [x] 增加 `@preview/sdk` data URL 不被单引号截断的回归断言。
- [x] 复核三个异常页面的真实 `/api/compile` 输出。
- [x] 使用 Chrome 动态 import 复核三个异常页面的编译产物。
- [x] 运行 author-site 定向测试与类型检查。

## 进度记录

### 2026-06-26 17:10

`ow doctor` 通过，数据目录为 `data/`，当前操作者为 admin。项目 `proj_1782286923644` 存在 9 个页面，三个异常页面都在项目页面清单中。

### 2026-06-26 17:14

确认三个异常页面的 `index.tsx` 和 `config.schema.json` 都存在于：

- `data/projects/proj_1782286923644/workspace/demos/`
- `data/snapshots/proj_1782286923644/v6/demos/`

因此不是页面目录或文件缺失。

### 2026-06-26 17:17

打开只读用途编辑事务 `edit_1782465753067_lmrl0k`，基线版本为 `v6`。执行 `preview compile edit_1782465753067_lmrl0k --json` 通过，结果为：

- `ok: true`
- `issues: []`
- 警告：CLI 静态校验不等于 author-site `/api/compile` 完整编译

排查后已执行 `edit discard edit_1782465753067_lmrl0k --json`，结果 `discarded: true`，审计 ID 为 `audit_1782466013074_pzrzgx`。

### 2026-06-26 17:21

直接调用 `http://localhost:3200/api/compile`：

- `external-guide_k7m2`：HTTP 200，`success: true`
- `age-confirmation_q8n5`：HTTP 200，`success: true`
- `ended-pending_k8m2`：HTTP 200，`success: true`
- 对照页 `activity-loading_x4p1`：HTTP 200，`success: true`
- 对照页 `preheat-home_m4kq`：HTTP 200，`success: true`

说明外层加载中不是服务端编译失败导致。

### 2026-06-26 17:24

使用系统 Chrome 执行编译产物：

- `external-guide_k7m2`：runtime 失败，`SyntaxError: Unexpected identifier 'https'`
- `age-confirmation_q8n5`：runtime 失败，`SyntaxError: Unexpected identifier 'https'`
- `ended-pending_k8m2`：runtime 失败，`SyntaxError: Unexpected identifier 'https'`
- `activity-loading_x4p1`：可渲染
- `preheat-home_m4kq`：可渲染

异常页共同点是都 import 了 `@preview/sdk`。对照页 `activity-loading_x4p1` 使用 `lucide-react`，`preheat-home_m4kq` 无 npm 依赖，均可渲染。

## 根因分析

`PreviewPanel` 只有收到 iframe 发出的 `LOADED` 消息后才会把 `contentLoaded` 置为 `true` 并隐藏加载覆盖层。异常页的编译产物在 iframe 动态 import 阶段抛出语法错误，因此不会发出 `LOADED`，单页和画布模式都会停留在加载中。

直接错误来自编译产物中的 `@preview/sdk` import。当前编译输出片段类似：

```ts
import { Icon } from 'data:application/javascript;charset=utf-8,%0Aimport%20React%20from%20'https%3A%2F%2Fesm.sh%2Freact%4018.3.1'%3B...';
```

其中 `data:` URL 被包在单引号里，但 URL 内容仍包含未转义的单引号，例如 `from%20'https...` 中的 `'`。浏览器解析 ESM import 时，字符串在 `from%20'` 处提前结束，后面的 `https` 被当成源码标识符，最终抛出 `Unexpected identifier 'https'`。

相关代码链路：

- `packages/author-site/src/lib/compiler.ts`：`rewriteImportsToCdn` 将依赖 URL 写成单引号 import 字符串。
- `packages/author-site/src/lib/preview-dependency-policy.ts`：`getPreviewDependencyUrl("@preview/sdk")` 返回 `data:application/javascript;charset=utf-8,${encodeURIComponent(createPreviewSdkSource())}`。
- `packages/author-site/src/lib/preview-dependency-policy.ts`：`createPreviewSdkSource` 内部生成的 SDK 源码使用单引号 import React 和 lucide。
- `packages/shared/src/demo/PreviewPanel.tsx`：只有 iframe 回传 `LOADED` 才关闭加载态。
- `packages/shared/src/demo/iframe-template.ts`：动态 import 失败时回传 `RUNTIME_ERROR`，不会回传 `LOADED`。

## 解决方案

推荐修复：让 `@preview/sdk` 的 `data:` URL 在写入 ESM import 字符串前彻底转义引号。

可选做法：

- 在 `getPreviewDependencyUrl("@preview/sdk")` 返回值中追加转义，例如对 `encodeURIComponent` 结果再替换 `'` 为 `%27`。
- 或让 `rewriteImportsToCdn` 在生成 import 字符串时使用 `JSON.stringify(cdnUrl)`，避免手写单引号字符串。

建议优先用 `JSON.stringify(cdnUrl)` 统一处理所有 CDN/data URL，因为它能覆盖单引号、双引号、反斜杠等字符串边界问题。

### 2026-06-26 23:06

已实施修复：

- `packages/author-site/src/lib/compiler.ts`：`rewriteImportsToCdn` 不再手写单引号 import 字符串，改为用 JS 字符串字面量序列化 CDN/data URL。
- `packages/author-site/src/lib/preview-dependency-policy.ts`：预览依赖策略版本提升到 `2026-06-preview-runtime-v3`，让服务端编译缓存随修复失效。
- `packages/author-site/src/lib/compiler-client.ts`：浏览器端编译缓存 key 加入同版本号，避免同一页面会话继续命中修复前的坏产物。
- `packages/author-site/src/lib/__tests__/preview-runtime-policy.test.ts`：补充 `@preview/sdk` 编译产物必须使用双引号 data URL 且不得输出单引号 data URL 的断言。

真实 `/api/compile` 复核结果：

- `external-guide_k7m2`：HTTP 200，`success: true`，`doubleData=true`，`singleData=false`
- `age-confirmation_q8n5`：HTTP 200，`success: true`，`doubleData=true`，`singleData=false`
- `ended-pending_k8m2`：HTTP 200，`success: true`，`doubleData=true`，`singleData=false`

Chrome 动态 import 复核结果：

- `external-guide_k7m2`：`ok=true`，`hasDefault=true`
- `age-confirmation_q8n5`：`ok=true`，`hasDefault=true`
- `ended-pending_k8m2`：`ok=true`，`hasDefault=true`

修复后建议增加测试：

- `compileCode` 编译 `import { Icon } from "@preview/sdk"` 后，产物应可被浏览器动态 import。
- 至少覆盖一个 `@preview/sdk` 页面和一个 `lucide-react` 页面，防止回归。

## 验证方式

已完成的验证：

- Project Admin CLI `doctor`、`project list`、`project get`
- Project Admin CLI `preview compile edit_1782465753067_lmrl0k`
- author-site `/api/compile` 实际接口
- 系统 Chrome 动态 import 并渲染编译产物

本次修复验证：

- `packages/author-site` 包内运行 `../../node_modules/.bin/jest src/lib/__tests__/preview-runtime-policy.test.ts --runInBand`：通过，4 个测试通过。
- `packages/author-site` 包内运行 `../../node_modules/.bin/tsc --noEmit`：通过。
- 真实 author-site `/api/compile` 验证三个异常页均返回新格式 data URL。
- 系统 Chrome 动态 import 验证三个异常页编译产物均可加载默认组件。

## 风险与待确认事项

- 当前 author-site 进程运行在 3200，验证依赖本地服务状态；服务端编译返回 200 的证据来自当前运行实例。
- 浏览器端 `compiler-client` 的缓存 key 已加入本次策略版本；如果用户当前页面仍停留在旧坏产物，刷新创作端页面即可加载新的前端模块并重新请求编译。
- 本次已同步更新 `docs/项目文档/创作端/04-配置与预览/技术/02_实时预览机制.md`。
