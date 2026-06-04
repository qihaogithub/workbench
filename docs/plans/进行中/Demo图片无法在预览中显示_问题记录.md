---
# Demo 组件中图片无法在预览区显示

**文档版本**：v3.0
**创建日期**：2026-06-03
**更新日期**：2026-06-04
**状态**：方案设计中

---

## 1. 问题本质

预览区跑在 `blob:` URL 的 iframe 里，没有文件系统。代码中任何相对路径（`./images/xxx.png`、`../../images/xxx.png`）都无法解析。

**根因**：缺乏一个统一的图片访问入口——无论从哪个页面、哪个 iframe、哪个路径上下文访问图片，都应该用同一个绝对 URL。

---

## 2. 方案：API 图床 + 绝对 URL

### 2.1 架构

```
┌──────────────────────────────────────────────────┐
│  AI 保存图片                                      │
│    │                                              │
│    ├─ saveImage 工具                              │
│    │   ├─ 存到 data/images/{hash}.png             │
│    │   ├─ 返回 /api/images/{hash}.png（绝对URL）   │
│    │   └─ 写入项目图片清单 images.json             │
│    │                                              │
│    └─ AI 直接在代码中使用绝对 URL                   │
│        <img src="/api/images/{hash}.png" />       │
│                                                  │
│  预览区（任何 iframe、任何页面）直接加载 ✅          │
└──────────────────────────────────────────────────┘
```

### 2.2 与现状对比

| | 现状（rewrite 方案） | 图床方案 |
|:--|:--|:--|
| saveImage 返回 | 相对路径 `../../images/xxx.png` | 绝对 URL `/api/images/{hash}.png` |
| AI 写入代码 | 相对路径，需 rewrite 转换 | 绝对 URL，**直接可用** |
| rewrite 层 | 必须参与 | **不需要处理图片** |
| 路径依赖 | 依赖 demo 位置（`demos/{id}/`） | **任何位置都能访问** |
| AI 心智模型 | 需要理解目录结构 | 拿到 URL 直接用 |

### 2.3 去重策略

- saveImage 对图片内容计算 SHA256，生成 `{sha256前12位}-{filename}` 作为文件名
- 保存前检查 `data/images/` 下是否已有同名文件 → 有则直接复用，跳过写入
- 不同项目引用同一张图片，共享同一个文件和 URL

### 2.4 项目图片清单

`data/projects/{projectId}/images.json`：

```json
{
  "images": [
    {
      "id": "a1b2c3d4",
      "filename": "hero.png",
      "url": "/api/images/a1b2c3d4-hero.png",
      "size": 245760,
      "format": "png",
      "createdAt": 1780542778787,
      "createdBy": "user"  // "user" | "ai" | "figma"
    }
  ]
}
```

**用途**：
- AI 可以通过读取这个清单了解项目已有哪些图片，避免重复上传
- 用户可以在资源管理界面查看、删除已上传图片
- saveImage 去重：同名文件对比 hash，相同则直接返回已有 URL

---

## 3. 实施计划

### 3.1 新建：API 图床路由

**文件**：`packages/author-site/src/app/api/images/[...path]/route.ts`

- GET：读取 `data/images/{path}`，返回二进制 + Content-Type
- 不依赖 sessionId、workspaceId——**全局可访问**
- Cache-Control: immutable（hash 文件名天然支持）

### 3.2 重写：saveImage 工具

**文件**：`packages/agent-service/src/backends/pi-tools/save-image-tool.ts`

改动：
- 图片统一保存到 `{DATA_DIR}/images/{hash}-{filename}`
- 返回消息改为绝对 URL：
  > Image saved: `/api/images/a1b2c3d4-hero.png`
- 写入项目图片清单 `images.json`

### 3.3 新建：项目图片清单管理

**文件**：`packages/author-site/src/lib/project-images.ts`

- `addProjectImage(projectId, image)` — 新增记录
- `getProjectImages(projectId)` — 查询清单
- `getImageByHash(projectId, hash)` — 去重查询

### 3.4 新增：AI 图片查询工具（可选）

**文件**：`packages/agent-service/src/backends/pi-tools/list-images-tool.ts`

- Agent 新增 `listImages` 工具，可查询项目已有图片
- AI 对话中自动感知已上传图片，减少重复上传

### 3.5 清理：移除 rewrite 层的图片处理

- `rewrite-local-paths.ts`：移除图片路径改写逻辑（保留非图片的路径处理）
- `compiler.ts`、`compile/route.ts`：移除 `rewriteLocalAssetPaths` 对图片的调用
- `workspace/[...path]/route.ts`：简化 fallback 逻辑（图片已走图床，不再需要复杂回退）

---

## 4. 文件清单

| 文件 | 操作 | 说明 |
|:-----|:-----|:-----|
| `packages/author-site/src/app/api/images/[...path]/route.ts` | 新建 | 图床服务 API |
| `packages/author-site/src/lib/project-images.ts` | 新建 | 项目图片清单管理 |
| `packages/agent-service/src/backends/pi-tools/save-image-tool.ts` | 重写 | 保存到图床，返回绝对 URL |
| `packages/agent-service/src/backends/pi-tools/list-images-tool.ts` | 新建 | AI 查询已有图片 |
| `packages/author-site/src/lib/rewrite-local-paths.ts` | 清理 | 移除图片路径改写 |
| `packages/author-site/src/lib/compiler.ts` | 清理 | 移除 rewrite 图片调用 |
| `packages/author-site/src/app/api/compile/route.ts` | 清理 | 移除 rewrite 图片调用 |
| `packages/agent-service/src/backends/pi-tools/index.ts` | 修改 | 注册 listImages 工具 |
| `packages/author-site/src/app/api/sessions/[sessionId]/workspace/[...path]/route.ts` | 简化 | 移除图片 fallback |

---

## 5. AI 使用示例

```
用户: 帮我上传这张图片并放到页面里

AI:
  1. saveImage(filename="hero.png", data="iVBOR...")
     → 返回: Image saved: /api/images/a1b2c3-hero.png
  
  2. 修改 demo 代码:
     <img src="/api/images/a1b2c3-hero.png" />

  3. 预览区直接渲染 ✅（绝对 URL，无需 rewrite）
```
