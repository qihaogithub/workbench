# Figma 导入图片自动本地化设计

> 状态：设计完成，待实现
> 日期：2026-07-28

## 背景

创作端从 Figma 插件导入 HTML 时，代码中嵌入的图片仍指向 Figma CDN 外链（如 `https://figma-alpha-api.s3.*.amazonaws.com/...`），这些链接会过期失效。需要在导入时自动将所有图片资源转存到项目图床，替换为本地链接。

## 范围

- **仅覆盖创作端 HTML 粘贴/上传导入流程**（`ImportFromFigmaDialog` → `updateDemoPageFiles`），不涉及 AI Agent 通过 Figma MCP 导入的场景。
- **不做**：其他 runtime type（React/sketch）的图片本地化、存量已导入页面回填。

## 设计决策

| 决策 | 结论 | 理由 |
|------|------|------|
| 处理时机 | 导入时一次性完成 | 用户诉求，避免后续手动操作 |
| 处理位置 | 服务端（`updateDemoPageFiles` 路由内） | 无 CORS 限制，可直接操作 `image-store` |
| 图片存储 | 复用现有全局图床 `data/image-store/` | SHA-256 去重、10MB 限制、现有 API 不新增存储 |
| 失败策略 | 部分失败继续导入，事后提示 | 不阻塞用户正常使用 |
| 并发控制 | 最多同时下载 5 张 | 与 agent `saveImage` 工具一致 |

## 架构

### 数据流

```
ImportFromFigmaDialog (前端)
  └─ handleImport()
       ├─ createDemoPage()                    → POST /api/projects/{id}/demos
       ├─ [新增状态] 显示 "正在本地化图片..."
       └─ updateDemoPageFiles({ localizeImages: true })
            └─ PUT /api/sessions/{id}/files/{demoId}
                 ├─ [新增] localizeHtmlImages(html, projectId)
                 │    ├─ extractImageReferences(html)
                 │    ├─ 并行下载 + storeImageFromUrl / storeImageFromBase64
                 │    └─ rewriteHtml(html, replacements) → 新 HTML
                 ├─ [现有] 写入文件到 workspace
                 └─ 返回 { data: { imageLocalization: {...} } }
       └─ 前端解析 imageLocalization，失败时 toast
```

### 模块拆解

**`packages/author-site/src/lib/image-localizer.ts`（新增）**

| 导出函数 | 职责 |
|---------|------|
| `extractImageReferences(html: string)` | 解析 HTML，返回 `ImageRef[]`（url、type、position） |
| `localizeHtmlImages(html, projectId)` | 批量下载+存储+重写 HTML，返回 `{ html, result }` |
| `storeImageFromUrl(url, projectId)` | 下载图片 → 调用 `uploadImage` 存入图床 |
| `storeImageFromBase64(dataUri, filename, projectId)` | 解码 Base64 → 调用 `uploadImage` 存入图床 |

**`packages/author-site/src/lib/image-store.ts`（无改动）**

- 直接复用现有 `uploadImage(buffer, ...)`，不做变更。下载和 Base64 解码逻辑属于 localizer 职责。

**`packages/author-site/src/app/api/sessions/[sessionId]/files/[demoId]/route.ts`（改动）**

- `PUT` handler 中，当 `prototypeHtml` 存在且 `localizeImages !== false` 时，先调用 `localizeHtmlImages` 处理，再用处理后的 HTML 写入
- 将 `imageLocalization` 结果附加到响应 `data` 中

**`packages/author-site/src/components/demo/ImportFromFigmaDialog.tsx`（改动）**

- `handleImport` 中 `updateDemoPageFiles` 调用增加 `localizeImages: true`
- 提交按钮文案改为分阶段显示
- 响应中解析 `imageLocalization`，失败时显示 toast（含失败数量和原因摘要）

### 图片引用提取规则

| HTML 模式 | 提取方式 | 示例 |
|-----------|---------|------|
| `<img src="...">` | 提取 `src` 属性 | `<img src="https://figma.com/img/abc.png">` |
| `<source srcset="...">` | 提取 `srcset` 中逗号分隔的第一个 URL | `<source srcset="x.png 1x, x@2x.png 2x">` |
| `style="...url(...)..."` | 提取 `url()` 内容 | `style="background-image: url(...)"` |
| `<image href="...">` (SVG) | 提取 `href` 属性 | `<image href="https://..." />` |
| CSS `<style>` 块内 `url()` | 正则在 `<style>` 内容中匹配 `url(...)` | `url(https://...)` |

**识别标准**：
- Figma CDN：`figma-alpha-api.s3.*.amazonaws.com` 或其他已知 Figma 域名
- Base64：`data:image/...;base64,...`
- 外部 URL：`http://` 或 `https://` 开头的非本站域名

**忽略规则**：
- 本站 URL（`/api/images/...`、同域路径）
- 相对路径（`./images/...`、`../assets/...`）
- 非图片 URL（无已知图片扩展名且非 data URI）

## API 设计

### 请求扩展（`PUT /api/sessions/{id}/files/{demoId}`）

```json
{
  "prototypeHtml": "...",
  "prototypeCss": "...",
  "prototypeMeta": {...},
  "schema": "...",
  "localizeImages": true    // 新增，可选，默认 true
}
```

### 响应扩展

```json
{
  "success": true,
  "data": {
    "runtimeValidation": {...},
    "imageLocalization": {
      "total": 5,
      "succeeded": 4,
      "failed": 1,
      "failures": [
        { "originalUrl": "https://...", "reason": "HTTP 403" }
      ]
    }
  }
}
```

`imageLocalization` 仅在 `localizeImages !== false` 且存在图片引用时出现。

## 错误处理

| 场景 | 行为 |
|------|------|
| 单张下载超时（10s） | 跳过，保留原 URL，记录原因 |
| HTTP 非 2xx | 跳过，保留原 URL，记录原因 |
| 网络错误 / DNS 失败 | 同上 |
| 图片超过 10MB | 跳过（`uploadImage` 拒绝），记录 `ASSET_TOO_LARGE` |
| 不支持的格式 | 跳过，记录 `UNSUPPORTED_FORMAT` |
| Base64 解码失败 | 跳过，记录原因 |
| SHA-256 去重命中 | 正常返回已有 imageId，不重复存储 |
| 全部图片失败 | 页面正常创建，`imageLocalization.succeeded = 0` |
| HTML 中无图片引用 | 跳过本地化，不返回 `imageLocalization` 字段 |
| `localizeImages: false` | 完全跳过，行为与现有逻辑一致 |

## 前端交互

### 导入按钮状态

```
"正在创建页面..." → "正在本地化图片..." → "正在保存页面..."
```

分三个阶段，可通过 `isImporting` 配合一个 `importPhase` state 实现。由于单次 API 调用目前无法在服务端区分「本地化」和「保存」阶段（它们在同一次请求中），首版简化为：

```
"正在导入..."（整个 createDemoPage + updateDemoPageFiles 期间）
```

未来可考虑 SSE 或拆分 API 实现分阶段进度。

### 导入完成后

- 部分失败：toast 提示「X 张图片未能本地化，仍使用原始链接。（查看详情）」
- 全部失败：toast 提示「图片本地化失败，所有图片仍指向外部链接。」
- 全部成功：不额外提示（现有「导入成功」toast 已涵盖）

## 测试

| 层级 | 内容 |
|------|------|
| 单元 | `image-localizer.test.ts` — `extractImageReferences` 各种 HTML 模式覆盖 |
| 单元 | `image-localizer.test.ts` — `storeImageFromUrl` mock fetch 成功/超时/403/大文件 |
| 单元 | `image-localizer.test.ts` — `storeImageFromBase64` 正常/非法 data URI |
| 集成 | `image-localizer.test.ts` — `localizeHtmlImages` 端到端：HTML 输入 → 图床存储 → HTML 输出验证 |
| API | `files-route.test.ts` — `localizeImages` 参数传递、响应包含 `imageLocalization` |
| E2E | 从 Figma 插件导出 HTML → 粘贴导入 → 验证页面中图片 URL 已替换为 `/api/images/...` |

## 影响范围

- **依赖**：复用 `uploadImage`（已存在），不新增 npm 依赖
- **破坏性变更**：无。`localizeImages` 默认 `true`，但可以通过显式传 `false` 恢复旧行为
- **性能**：导入耗时增加（取决于图片数量和网络），单次导入 5 张图片约增加 3-10s下载+存储的图片通过 SHA-256 去重，同项目重复导入不增加存储

## 后续

- 本次不处理 CSS `background-image` 中的外部 URL（仅 HTML 属性）
- 本次不处理存量已导入页面回填
- 若后续需要 AI Agent 导入场景，可将 `image-localizer` 模块复用给 `figma-mcp-tool`
