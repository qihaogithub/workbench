# 编辑页 Session 创建失败 — 问题分析报告

## 一、问题背景

### 问题描述

用户在切换电脑后，打开同一个 opencode-workbench 项目。在编辑页面内，通过左侧页面树（DemoPageTree）或预览模式下拉框切换到其他 Demo 页面时，页面提示"创建 Session 失败"。

### 发生场景

| 项目 | 内容 |
|------|------|
| 操作环境 | 新电脑，本地开发服务器（localhost:3200） |
| 触发操作 | 进入编辑页后，切换页面（从 `proj_1776526720347` 切换到另一个子页面） |
| 浏览器日志文件 | `localhost-1778852422425.log` |

### 预期行为

切换 Demo 页面后，页面应正常加载新页面的代码和配置，Session 创建成功。

### 实际行为

切换到另一个 Demo 页面后，`POST /api/sessions` 返回 **404 (Not Found)**，前端 catch 抛出 `"创建 Session 失败"` 错误，页面停留在加载状态。

### 错误信息

```
page.tsx:335 POST http://localhost:3200/api/sessions 404 (Not Found)
page.tsx:537 [loadDemo] Session API 响应状态: 404
```

---

## 二、根因分析

### 调查过程

#### 1. 日志分析（A 级证据）

读取浏览器日志 [localhost-1778852422425.log](file:///e:/%E9%87%8D%E8%A6%81%E6%96%87%E4%BB%B6/Programming/1_Work/opencode-workbench/docs/plans/%E8%BF%9B%E8%A1%8C%E4%B8%AD/%E7%BC%96%E8%BE%91%E9%A1%B5%E6%89%93%E5%BC%80%E5%A4%B1%E8%B4%A5/localhost-1778852422425.log) 可知：

```
// ✅ 第一次加载成功：使用项目 ID
L2:  [loadDemo] 开始加载 demo: proj_1776526720347
L5:  [loadDemo] Session API JSON: {success: true, data: {...}}
L6:  [loadDemo] Session 创建成功, sessionId: session-1778858095119-tpifkx5bq

// 用户切换页面...
L332: [PreviewPanel] 清理 iframe Blob URL

// ❌ 第二次加载失败：使用页面 ID
L333: [loadDemo] 开始加载 demo: demo_1778077850198_fjxwmf
L335: POST http://localhost:3200/api/sessions 404 (Not Found)
L537: [loadDemo] Session API 响应状态: 404
```

首次打开的 `proj_1776526720347` 是**项目 ID**（`proj_` 前缀），Session 创建成功。第二次打开的 `demo_1778077850198_fjxwmf` 是**页面 ID**（`demo_` 前缀），Session 创建返回 404。

#### 2. 路由导航分析（A 级证据）

编辑页面内有两处代码在切换页面时将 URL 替换为页面 ID：

- [page.tsx:L873](file:///e:/%E9%87%8D%E8%A6%81%E6%96%87%E4%BB%B6/Programming/1_Work/opencode-workbench/packages/author-site/src/app/demo/%5Bid%5D/edit/page.tsx#L873) — DemoPageTree 的 `onPageSelect` 回调
- [page.tsx:L1035](file:///e:/%E9%87%8D%E8%A6%81%E6%96%87%E4%BB%B6/Programming/1_Work/opencode-workbench/packages/author-site/src/app/demo/%5Bid%5D/edit/page.tsx#L1035) — 预览模式下拉框的 `onValueChange` 回调

两处都执行：

```typescript
router.replace(`/demo/${pageId}/edit`);
```

其中 `pageId` 是页面 ID（格式 `demo_{timestamp}_{random6}`）。

**补充：双重加载逻辑竞争**

`onPageSelect` 回调（page.tsx L870-L893）实际包含两套加载逻辑：

1. **直接加载**（L876-L888）：通过 `/api/sessions/${sessionId}/files/${pageId}` 直接读取页面文件，这是正确的路径，复用已有 sessionId
2. **URL 替换触发**（L873）：`router.replace` 改变 URL → Next.js 更新 `params.id` → `demoId` 变化 → `useEffect([demoId])` 重新触发 `loadDemo` → 重新创建 Session（错误路径）

两套逻辑同时运行，形成竞争。直接加载能正确获取页面内容，但 `loadDemo` 的重新执行会因页面 ID 不被识别为项目 ID 而失败，覆盖了正确的结果并显示错误。预览模式下拉框的回调（page.tsx L1033-L1049）存在相同的双重逻辑竞争。

#### 3. Session API 处理分析（A 级证据）

当页面因 URL 变化重新加载时，`loadDemo` 函数将 URL 中的 `demoId` 直接传给 Session API：

```typescript
// page.tsx:L206-L209
const sessionRes = await fetch("/api/sessions", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ demoId }),
});
```

Session API 路由 [sessions/route.ts:L35](file:///e:/%E9%87%8D%E8%A6%81%E6%96%87%E4%BB%B6/Programming/1_Work/opencode-workbench/packages/author-site/src/app/api/sessions/route.ts#L35) 将 `demoId` 重命名为 `projectId`：

```typescript
const { demoId: projectId, forceNew, workspaceId } = body;
```

#### 4. 项目存在性检查（A 级证据）

`createEditSession` [session-manager.ts:L192-L194](file:///e:/%E9%87%8D%E8%A6%81%E6%96%87%E4%BB%B6/Programming/1_Work/opencode-workbench/packages/author-site/src/lib/session-manager.ts#L192-L194) 调用 `projectExists`：

```typescript
if (!projectExists(projectId)) {
  throw new Error(`Project "${projectId}" 不存在`);
}
```

`projectExists` [fs-utils.ts:L173-L176](file:///e:/%E9%87%8D%E8%A6%81%E6%96%87%E4%BB%B6/Programming/1_Work/opencode-workbench/packages/author-site/src/lib/fs-utils.ts#L173-L176) 检查文件系统：

```typescript
export function projectExists(projectId: string): boolean {
  const projectPath = getProjectPath(projectId);  // → data/projects/{projectId}
  return fs.existsSync(projectPath) && fs.statSync(projectPath).isDirectory();
}
```

#### 5. 数据目录验证（B 级证据 — 文件系统）

实际项目目录结构如下：

```
data/projects/
  ├── proj_1776526720347/         ← 项目 ID 对应的目录（✅ 存在）
  │   └── workspace/demos/
  │       ├── demo_1777965200000_x8k2p9/         ← 页面 ID（子页面）
  │       ├── demo_1778077850198_fjxwmf/         ← 页面 ID（子页面）★ 被导航的目标
  │       └── demo_1778751411983_7h2rpo/         ← 页面 ID（子页面）
```

页面 `demo_1778077850198_fjxwmf` 是项目 `proj_1776526720347` 下的一个子页面，并非独立项目。因此 `data/projects/demo_1778077850198_fjxwmf/` 不存在。

#### 6. 错误返回（A 级证据）

API catch 块 [sessions/route.ts:L97-L101](file:///e:/%E9%87%8D%E8%A6%81%E6%96%87%E4%BB%B6/Programming/1_Work/opencode-workbench/packages/author-site/src/app/api/sessions/route.ts#L97-L101)：

```typescript
if (error instanceof Error && error.message.includes("不存在")) {
  return NextResponse.json(createApiError("PROJECT_NOT_FOUND"), { status: 404 });
}
```

#### 7. 环境诊断（B 级证据 — CLI 诊断）

`ops-cli system --json` 输出显示 agent-service 未运行（`"running": false`），但这不影响 Session 创建的本地文件系统操作。WebSocket 连接（日志 L43）失败是由于 agent-service 未启动，与 404 错误是独立问题。

### 根本原因

**路由 `/demo/[id]/edit` 同时承载"项目 ID"（`proj_` 前缀）和"页面 ID"（`demo_` 前缀）两种 ID 类型，但 Session 创建 API 只认项目 ID。当用户在编辑页内通过 DemoPageTree 或页面选择器切换页面时，`router.replace` 将浏览器 URL 替换为页面 ID，导致页面重载后 `loadDemo` 将页面 ID 当作项目 ID 传入 Session API，引发 `projectExists` 检查失败，最终返回 404。**

### 完整执行路径

```
用户初始加载:  URL = /demo/proj_1776526720347/edit  ← 项目 ID
  → loadDemo("proj_1776526720347")
  → POST /api/sessions { demoId: "proj_1776526720347" }
  → projectExists("proj_1776526720347") → true ✅
  → Session 创建成功

用户切换页面（DemoPageTree.onPageSelect）:
  → router.replace(`/demo/demo_1778077850198_fjxwmf/edit`)

页面重载:      URL = /demo/demo_1778077850198_fjxwmf/edit  ← 页面 ID
  → loadDemo("demo_1778077850198_fjxwmf")
  → POST /api/sessions { demoId: "demo_1778077850198_fjxwmf" }
  → sessions/route.ts L35: const { demoId: projectId } = body;
  → createEditSession(userId, "demo_1778077850198_fjxwmf")
  → projectExists("demo_1778077850198_fjxwmf")
  → fs.existsSync("data/projects/demo_1778077850198_fjxwmf/") → false ❌
  → throw Error('Project "demo_1778077850198_fjxwmf" 不存在')
  → sessions/route.ts L97-L99: catch → return 404
  → page.tsx L214-L215: sessionRes.ok 为 false → throw Error("创建 Session 失败")
  → page.tsx L293-L297: toast("加载失败", "创建 Session 失败")
```

---

## 三、解决方案

### 方案一（推荐）：切换页面时不替换 URL，改为前端局部加载

让 `onPageSelect` 和页面选择器只切换 `activeDemoId` 状态并加载新页面内容，不执行 `router.replace`。这样 URL 保持为项目 ID，`loadDemo` 的 `useEffect` 不会因 URL 变化而重新触发，Session 复用已有的 session。

**做法**：删除两处 `router.replace` 调用，仅保留 `setActiveDemoId` 和文件加载逻辑。

**优点**：
- 改动最小，只修改前端行为
- 避免不必要的页面重载
- 保持 URL 一直是项目 ID，语义清晰

**风险**：
- 刷新页面时会回到项目的主页面（而非当前子页面），但 URL 中的项目 ID 仍能正确加载
- 如果需要在 URL 中反映当前页面状态，可以考虑使用 URL 查询参数而非路径参数

### 方案二：Session API 增加页面 ID → 项目 ID 的解析能力

在 `POST /api/sessions` 中，当 `projectExists(demoId)` 返回 false 时，遍历 `data/projects/` 下的所有项目，查找哪个项目的 `workspace/demos/` 下包含以 `demoId` 命名的子目录，自动解析为对应项目 ID。

**缺点**：
- 需要遍历文件系统，性能较差
- 逻辑复杂，增加 API 的职责
- 治标不治本，根本问题是导航逻辑缺陷

### 方案三：路由改为两级 `/demo/[projectId]/[pageId]/edit`

将路由结构改为支持项目和页面两级参数，从架构层面区分项目 ID 和页面 ID。

**缺点**：
- 改动范围大，涉及所有导航链接
- `loadDemo` 需要适配新的参数结构

### 推荐方案

**方案一**。切换页面是客户端操作，不应该通过 URL 变更来触发，保持 URL 指向项目级别即可。

---

## 四、相关代码路径

| 环节 | 文件 | 行号 | 作用 |
|------|------|------|------|
| 页面树触发导航 | [page.tsx](file:///e:/%E9%87%8D%E8%A6%81%E6%96%87%E4%BB%B6/Programming/1_Work/opencode-workbench/packages/author-site/src/app/demo/%5Bid%5D/edit/page.tsx) | L873 | `router.replace` 将 URL 替换为页面 ID |
| 预览模式选择器触发导航 | [page.tsx](file:///e:/%E9%87%8D%E8%A6%81%E6%96%87%E4%BB%B6/Programming/1_Work/opencode-workbench/packages/author-site/src/app/demo/%5Bid%5D/edit/page.tsx) | L1035 | 同上 |
| loadDemo 发送请求 | [page.tsx](file:///e:/%E9%87%8D%E8%A6%81%E6%96%87%E4%BB%B6/Programming/1_Work/opencode-workbench/packages/author-site/src/app/demo/%5Bid%5D/edit/page.tsx) | L206-L210 | 将 URL 参数中的 ID 直接传给 API |
| 错误提示用户 | [page.tsx](file:///e:/%E9%87%8D%E8%A6%81%E6%96%87%E4%BB%B6/Programming/1_Work/opencode-workbench/packages/author-site/src/app/demo/%5Bid%5D/edit/page.tsx) | L293-L297 | catch 块用 toast 显示"创建 Session 失败" |
| API 路由处理 | [sessions/route.ts](file:///e:/%E9%87%8D%E8%A6%81%E6%96%87%E4%BB%B6/Programming/1_Work/opencode-workbench/packages/author-site/src/app/api/sessions/route.ts) | L35 | 将 `demoId` 重命名为 `projectId` |
| createEditSession | [session-manager.ts](file:///e:/%E9%87%8D%E8%A6%81%E6%96%87%E4%BB%B6/Programming/1_Work/opencode-workbench/packages/author-site/src/lib/session-manager.ts) | L192-L194 | 检查项目是否存在 |
| projectExists | [fs-utils.ts](file:///e:/%E9%87%8D%E8%A6%81%E6%96%87%E4%BB%B6/Programming/1_Work/opencode-workbench/packages/author-site/src/lib/fs-utils.ts) | L173-L176 | 检查文件系统目录 |
| 404 返回 | [sessions/route.ts](file:///e:/%E9%87%8D%E8%A6%81%E6%96%87%E4%BB%B6/Programming/1_Work/opencode-workbench/packages/author-site/src/app/api/sessions/route.ts) | L97-L101 | 识别"不存在"错误返回 404 |

### 相关日志

- 浏览器日志：[localhost-1778852422425.log](file:///e:/%E9%87%8D%E8%A6%81%E6%96%87%E4%BB%B6/Programming/1_Work/opencode-workbench/docs/plans/%E8%BF%9B%E8%A1%8C%E4%B8%AD/%E7%BC%96%E8%BE%91%E9%A1%B5%E6%89%93%E5%BC%80%E5%A4%B1%E8%B4%A5/localhost-1778852422425.log)

### 环境信息

| 项目 | 内容 |
|------|------|
| Node.js | 22.14.0 |
| pnpm | 未安装 |
| 项目根目录 | `E:\重要文件\Programming\1_Work\opencode-workbench` |
| Agent Service | 未运行（端口 3101） |
| Agent Service URL | `http://localhost:3201`（默认配置） |
| 数据目录 | `data/`（项目根目录下） |
| 项目文件 | `data/projects/` 下有 2 个项目 |
| 登录用户 | `a5862615-26bb-4688-924d-7fd68c132e21` |
| 环境变量文件 | `.env` 不存在（使用默认值） |

---

*分析日期：2026-05-15*
*分析工具：dev-problem-analyzer skill + CLI diagnostics + 代码搜索*