---

# Demo 组件中图片无法在预览区显示

**文档版本**：v1.0
**创建日期**：2026-06-03
**状态**：待修复

---

## 1. 问题描述

用户通过 AI 对话上传图片，AI 调用 `saveImage` 工具保存图片后，在 demo 组件中正常引用图片路径（如 `<img src="./images/xxx.png" />`），编译通过无报错，但预览区中图片无法显示。

**现象**：
- AI 成功保存图片，代码编译无错误
- 代码在 iframe 中正常渲染，但图片区域空白/裂图
- 浏览器开发者工具中看到图片请求失败（404 或无请求）

---

## 2. 根因分析

### 2.1 Demo 预览渲染架构

```
┌─────────────────────────────────────────────────┐
│  author-site (localhost:3200)                    │
│                                                  │
│  PreviewPanel                                    │
│    │                                             │
│    ├─ 调用 /api/compile → 编译 TSX → JS          │
│    │                                             │
│    ├─ generateIframeHtml() → 创建 blob: URL      │
│    │   blob:http://localhost:3200/{uuid}          │
│    │                                             │
│    └─ postMessage → iframe 执行编译后的 JS        │
│         │                                        │
│         └─ blob: URL 上下文，无文件系统            │
│            相对路径 ./images/xxx.png 无法解析       │
└─────────────────────────────────────────────────┘
```

### 2.2 两个层面的问题

| 层面 | 问题 | 说明 |
|:-----|:-----|:-----|
| 文件位置 | 图片保存位置与 demo 引用路径不匹配 | 原 `saveImage` 默认存到 `workspace/images/`，但 demo 在 `workspace/demos/{demoId}/`，`./images/xxx.png` 指向错误位置 |
| URL 解析 | blob: URL iframe 无法解析相对路径 | 浏览器在 blob URL 上下文中无法将 `./images/xxx.png` 映射到文件系统或 API |

---

## 3. 已实施的修复（2026-06-03）

### 3.1 新建：Workspace 文件服务 API

**文件**：`packages/author-site/src/app/api/sessions/[sessionId]/workspace/[...path]/route.ts`

提供 GET 端点，从 session 的 workspace 目录下以二进制形式读取文件，返回正确的 Content-Type（如 `image/png`），并设置 CORS + Cache-Control 头。

URL 格式：`/api/sessions/{sessionId}/workspace/{workspaceRelativePath}`

### 3.2 新建：编译时路径改写

**文件**：`packages/author-site/src/lib/rewrite-local-paths.ts`

函数 `rewriteLocalAssetPaths(code, basePath, sessionId)` 在编译后的 JS 代码中：
- 查找字符串字面量中的相对图片路径（`'./images/xxx.png'`、`"../assets/xxx.jpg"`）
- 查找 CSS `url()` 引用（`url(./images/bg.png)`）
- 按 `basePath`（demo 在 workspace 中的路径，如 `demos/{demoId}/`）解析
- 替换为 `/api/sessions/{sessionId}/workspace/{resolvedPath}`

**集成位置**：
- `packages/author-site/src/lib/compiler.ts` — `compileSession()` 函数
- `packages/author-site/src/app/api/compile/route.ts` — 编译 API 路由

### 3.3 修改：saveImage 默认保存目录

**文件**：`packages/agent-service/src/backends/pi-tools/save-image-tool.ts`

当 AgentConfig 包含 `demoId` 时，默认 `directory` 从 `images/` 改为 `demos/{demoId}/images/`，使 `./images/xxx.png` 从 demo 组件视角直接可用。

### 3.4 测试覆盖

| 测试集 | 用例数 | 状态 |
|:-------|:------:|:----:|
| rewrite-local-paths.test.ts | 12 | 通过 |
| save-image-tool.test.ts | 11 | 通过 |
| agent-service 全量 | 103 | 通过 |
| author-site publish 相关 | 24 | 通过 |
| TypeScript typecheck | — | 通过 |

---

## 4. 修复后仍未生效——待排查的方向

重启 `pnpm dev` 后图片仍未显示，以下是需要进一步排查的可能原因：

### 4.1 路径改写是否被实际调用

需要验证的代码路径：
- `PreviewPanel` → `fetch("/api/compile", ...)` → 返回的 `compiledCode` 是否已包含改写后的路径？
- `compileSession()` 在 server 端被调用时，`demoId` 是否正确传入？
- 是否存在**客户端侧编译**路径绕过了服务端的路径改写？（`PreviewPanel` 中是否有本地编译逻辑？）

**验证方法**：在浏览器 Network 面板查看 `/api/compile` 的响应，确认 `compiledCode` 中是否包含 `/api/sessions/{sessionId}/workspace/...` 路径。

### 4.2 API 路由是否可访问

`/api/sessions/[sessionId]/workspace/[...path]` 可能被其他路由拦截：
- `middleware.ts` 中是否有对 `/api/sessions/` 路径的过滤或重定向？
- Next.js `[...path]` catch-all 路由是否正确处理多级路径？
- workspace 目录下文件是否存在（`getSessionWorkspacePath` 返回 null 会导致 404）

**验证方法**：直接用浏览器访问 `/api/sessions/{真实的sessionId}/workspace/demos/{demoId}/images/{文件名}.png`，检查是否返回图片。

### 4.3 iframe 沙箱限制

iframe 使用 `sandbox="allow-scripts allow-same-origin"`：
- `allow-same-origin` 理论上允许同源请求，但 blob URL 的 origin 行为各浏览器可能不同
- 图片 `<img>` 标签不受 CORS 限制（仅 fetch/XHR 受限），理论上不需要 CORS 头
- 但仍需确认浏览器实际行为

**验证方法**：在 iframe 内部渲染一个已知可达的图片 URL（如 `/favicon.ico`）确认 iframe 内图片加载能力正常。

### 4.4 编译产物缓存

`compiler.ts` 中有服务端编译缓存（`compileCache`），基于代码内容 hash。如果路径改写后的代码被缓存，后续请求可能复用旧的未改写缓存。

**验证方法**：检查 `compileCache` 的 key 是否考虑了路径改写结果。

---

## 5. 相关文件清单

| 文件 | 角色 |
|:-----|:-----|
| `packages/author-site/src/app/api/sessions/[sessionId]/workspace/[...path]/route.ts` | 图片服务 API（新建） |
| `packages/author-site/src/lib/rewrite-local-paths.ts` | 路径改写工具（新建） |
| `packages/author-site/src/lib/__tests__/rewrite-local-paths.test.ts` | 路径改写测试（新建） |
| `packages/author-site/src/lib/compiler.ts` | 编译集成（修改） |
| `packages/author-site/src/app/api/compile/route.ts` | 编译 API 集成（修改） |
| `packages/shared/src/demo/PreviewPanel.tsx` | 预览面板（未修改，可能需要确认编译调用路径） |
| `packages/shared/src/demo/iframe-template.ts` | iframe HTML 模板（未修改） |
| `packages/agent-service/src/backends/pi-tools/save-image-tool.ts` | saveImage 工具（修改默认目录） |

---

## 6. 建议修复顺序

1. **先确认路径改写是否生效**——在 `/api/compile` 返回的 `compiledCode` 中搜索 `/api/sessions/` 关键字
2. **再确认 API 路由是否可访问**——直接浏览器访问图片 API URL
3. **排查编译缓存**——清除 `compileCache` 或给 cache key 加入 session 上下文
4. **排查 iframe 沙箱**——测试 iframe 内图片加载能力
5. **排查其他编译路径**——确认是否所有路径都经过 `compileSession` 或 compile API 路由
