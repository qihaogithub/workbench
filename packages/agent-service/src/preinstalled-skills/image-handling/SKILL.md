---
name: image-handling
description: 图片资源保存、引用和路径规则。触发词：保存图片、上传图片、使用图片、图片引用、素材。
---

# 图片资源处理

## 保存用户上传的图片

使用 `saveImage` 工具可将图片保存到工作区，支持两种来源：

### 来源 1：文件上传（Base64）

1. 消息的 `images` 字段包含 `{ data: Base64字符串, name: 文件名 }`
2. 调用 `saveImage`（source="base64"）保存到工作区
3. `data` 字段不含 `data:image/xxx;base64,` 前缀，直接传入即可
4. 保存后图片位于项目本地 `assets/images/{hash}-{filename}`；在 `demos/{pageId}/` 内的页面文件中引用时使用 `../../assets/images/{hash}-{filename}`

```typescript
saveImage({
  source: "base64",
  data: "iVBORw0KGgo...",
  filename: "product.png",
});
```

### 来源 2：图片 URL

1. 调用 `saveImage`（source="url"）下载并保存
2. 工具会自动下载、验证并保存到工作区
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
