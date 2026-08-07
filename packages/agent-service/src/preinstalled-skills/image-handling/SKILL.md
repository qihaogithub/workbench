---
name: image-handling
description: 图片资源保存、引用和路径规则。触发词：保存图片、上传图片、使用图片、图片引用、素材。
---

# 图片资源处理

## 保存用户上传的图片

用户通过聊天内联上传/粘贴的图片，**系统会自动保存到图床**。系统提示中会包含 `[图片已自动入库]` 文本，列出每张图片的 `imageId` 和引用 URL（`/api/images/img_xxx`）。**无需调用 `saveImage` 保存这些图片**，直接使用提示中的 URL 即可。

如果需要在页面中引用图片，使用系统提示中提供的 `/api/images/img_xxx` URL；如需回顾图片内容，调用 `readUserImage` 并传入 `imageId`。

`saveImage` 工具仅在以下场景使用：

### 来源 1：从外部 URL 下载图片

1. 调用 `saveImage`（source="url"）下载并保存到图床
2. 工具会自动下载、验证并保存
3. URL 来源仅允许 http/https 协议，下载超时 10 秒，最大 10MB，会校验 Content-Type

```typescript
saveImage({
  source: "url",
  data: "https://example.com/photo.png",
  filename: "hero.png",
});
```

## 图片内容描述（alt 文本）

`saveImage` 保存图片时会自动生成图片内容的文字描述，并返回在响应的 `alt` 字段和文本中（如 `图片内容：蓝色横幅，白字"欢迎"`）。

**写入 `<img>` 标签时，必须携带 `alt` 属性**：
- 新保存的图片：从 `saveImage` 返回的 `alt` 值填入 `<img alt="..." />`
- 存量的图片：调用 `listImages` 查看图片清单，从对应条目的"内容："获取描述

```html
<!-- ✅ 正确 -->
<img src="../../assets/images/abc123-banner.png" alt="蓝色横幅，白字'欢迎'" />

<!-- ❌ 错误 -->
<img src="../../assets/images/abc123-banner.png" />
```

**读取已有页面时**：遇到没有 `alt` 属性的 `<img>` 标签，先调用 `listImages` 查找该图片的内容描述，据此理解图片语义。

## 发布时自动处理

发布项目时，系统会自动：
1. 扫描所有页面中的本地图片引用
2. 把图片复制到发布产物的本地资源目录
3. 替换发布产物中的路径为本项目 `/data/{projectId}/assets/images/...` URL

**无需手动处理**，只需确保代码中使用本地相对路径即可。
