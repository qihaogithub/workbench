# 全局图床与 AI 图片使用能力设计

> 状态：已更新 | 创建：2026-07-23 | 更新：2026-07-24

## 背景

当前 AI 代理可以「看到」用户在对话中上传的图片（通过视觉模型或图片描述器），但无法将这些图片用于页面创作。核心矛盾在于：

- 用户消息中的图片（base64 data URI）能到达 LLM 视觉层，但原始数据从未持久化到 AI 工具可访问的地方
- `saveImage` 工具需要显式传入 base64 数据或 session asset URL，但用户消息附带的图片数据不在工具能触及的上下文里
- 图片散落在 session 临时目录、项目 workspace `assets/images/`、废弃的 `data/images/` 等多处，缺乏统一管理和稳定引用

## 目标

1. **自动入库**：用户在对话中上传图片后，AI 无需额外操作即可在页面中引用该图片
2. **全局图床**：建立跨项目共享的统一图片存储层，每张图片拥有全局唯一 ID 和稳定访问 URL
3. **轻量链接**：项目通过 `images.json` 引用全局图片 ID，不复制物理文件
4. **统一引用**：页面代码和 `config.schema.json` 默认值中统一使用 `/api/images/{imageId}` 绝对路径，消除相对路径解析的两段式复杂度

## 范围

| 包含 | 不包含 |
|------|--------|
| 全局图片存储与 API | 外部 OSS/S3 对接（后续可扩展） |
| 用户上传自动入库 | 图片编辑/裁剪/压缩 |
| AI `saveImage` 工具迁移 | 视频、音频等非图片媒体 |
| 会话消息中图片的自动持久化 | 存量 session assets 迁移（低优先级） |

---

## 设计

### 1. 存储架构

```
data/
├── image-store/                    # 全局图床根目录
│   ├── blobs/                     # 物理图片文件
│   │   └── {sha256[:16]}.{ext}   # SHA256 前16位命名，天然去重
│   └── manifest.json              # 全局注册表
├── projects/{projectId}/
│   ├── images.json                # 项目级引用清单（包含 imageId 字段）
│   └── workspace/assets/images/   # 存量文件保留不动，新图不再写入此目录
```

#### manifest.json 结构

```typescript
interface ImageStoreEntry {
  id: string;              // 全局唯一 ID，格式 "img_" + nanoid(10)
  sha256: string;          // 完整 SHA256 哈希
  filename: string;        // 原始文件名
  mimeType: string;        // 如 "image/png"
  sizeBytes: number;
  width?: number;          // 图片尺寸（入库时从文件头解析）
  height?: number;
  sourceType: "user_upload" | "ai_generated" | "remote_url" | "session_asset";
  sourceUrl?: string;      // 原始来源 URL（remote_url 时记录）
  createdAt: number;       // Unix 毫秒时间戳
  createdBy: string;       // userId 或 "ai-agent"
  projectRefs: string[];   // 引用了此图的项目 ID 列表（用于追踪和清理）
}
```

#### 去重逻辑

1. 入库时先计算 SHA256
2. 查 `manifest.json` 中是否存在相同 SHA256
3. 存在 → 不写文件，返回已有 `imageId`，在 `projectRefs` 中追加当前 projectId
4. 不存在 → 写入 `blobs/{sha256[:16]}.{ext}`，新建 manifest 条目

---

### 2. API 层

#### 新增端点

**`POST /api/images/upload`** — 全局图床上传入口

支持两种请求格式：
- **Multipart**：`FormData` 含 `file` 字段，适合前端 FileUploadWidget
- **JSON**：`{ data: string, filename: string, mimeType: string, projectId?: string }`，适合 AI 工具调用

```
响应:
{
  success: true,
  data: {
    imageId: string;
    url: string;              // /api/images/{imageId}
    sha256: string;
    width?: number;
    height?: number;
    deduplicated: boolean;    // 是否命中已有图片
  }
}
```

**`GET /api/images/[imageId]`** — 按 ID 提供图片

- 从全局 `blobs/` 读取对应文件
- 设置正确的 `Content-Type` + `Cache-Control: public, max-age=31536000, immutable`
- 不校验鉴权（图片为公开资源）

**`GET /api/images/[imageId]/info`** — 查询图片元信息

- 返回 manifest 中该条目

**`POST /api/projects/:projectId/images/link`** — 将全局图片链接到项目

```
请求:  { imageId: string }
响应:
{
  success: true,
  data: {
    imageId: string;
    url: string;          // /api/images/{imageId}
  }
}
```

- 在项目 `images.json` 中添加引用条目（含 `imageId` 字段）
- 更新全局 manifest 中 `projectRefs`

**`POST /api/images/batch-upload`** — 批量上传

- 参数：`items: Array<{ data, filename, mimeType }>`
- 用于 AI 工具批量入库优化

#### 改造现有端点

**`POST /api/sessions/:sessionId/assets/upload`** — 内部走全局图床

- 当前行为：写入 `workspace/assets/images/` → 注册项目 `images.json`
- 改造后：调用全局图床上传 → 链接到项目 → 返回 `/api/images/{imageId}` URL
- 前端 FileUploadWidget 调用方无变化

**`POST /api/sessions/:sessionId/assets/localize`** — 内部走全局图床

- 当前行为：base64/URL → 写入 `workspace/assets/images/` → 注册项目 `images.json`
- 改造后：base64/URL → 调用全局图床上传 → 链接到项目 → 返回相同格式的响应

**`GET /api/sessions/:sessionId/workspace/[...path]`** — 增加 fallback 服务层

- 当前逻辑：查文件系统 → 目录级 fallback → 404
- 新增步骤：文件系统未命中 → 解析路径提取可能的图片文件名 → 查项目 `images.json` 找对应 `imageId` → 从全局图床 `blobs/` 提供
- 这样存量项目（文件系统有文件）和增量项目（仅 images.json 有引用）都能正确服务

---

### 3. AI 工具变更

#### saveImage 工具改造

内部实现从「写 workspace 文件系统」改为「上传全局图床 + 链接到项目」：

| 维度 | 当前 | 改造后 |
|------|------|--------|
| 存储目标 | `workspace/assets/images/` | `data/image-store/blobs/` |
| 返回字段 | `{ path, url, relativePathFromPage }` | `{ imageId, path, url, relativePathFromPage }` |
| 主引用 URL | `../../assets/images/{hash}-{name}.png` | `/api/images/{imageId}` |
| 参数兼容 | `assetId` / `sessionAsset` / `base64` / `url` | 不变 |
| source=url | 下载后写入 workspace | 下载后上传全局图床 → 链接到项目 |
| source=base64 | 解码后写入 workspace | 上传全局图床 → 链接到项目 |
| source=sessionAsset | 读取 session 文件 → 写入 workspace | 读取 → 上传全局图床 → 链接到项目 |
| source=assetId | 返回项目中已有图片引用 | 返回 `/api/images/{imageId}` |

工具描述更新为告知 AI 使用 `/api/images/{imageId}` 引用图片，不再使用相对路径。

#### listImages 工具

输出中新增 `imageId` 字段，格式：

```
{ imageId, filename, url, size, format }
```

#### 消息自动入库

在 `packages/agent-service/src/backends/pi-agent.ts` 的 `sendMessage()` 方法中，发送消息给 LLM **之前**，新增：

```
用户消息含 ImageAttachment[]
  ↓
遍历每张图片:
  1. 调用图床上传服务（写入全局 image-store）
  2. 链接到当前项目
  3. 收集入库结果
  ↓
构建上下文注入文本:
  [图片已自动入库]
  - imageId: img_xxx, 引用: /api/images/img_xxx
  - imageId: img_yyy, 引用: /api/images/img_yyy
  你可以在页面代码和 config.schema.json 中直接使用这些 URL 引用图片。
  ↓
追加到用户消息末尾或作为独立的 system message
  ↓
正常发送给 LLM
```

关键行为：
- 入库失败不阻塞消息发送，记录告警日志，AI 不会收到该图片的上下文
- 去重命中时 `deduplicated: true`，不重复写物理文件
- 图片超过 10MB 或格式不支持则跳过，返回错误信息给前端

---

### 4. 预览路径解析流程

采用全局图床 URL 后，路径解析大幅简化：

```
AI 写入页面代码:
  <img src="/api/images/img_abc123" />

config.schema.json 默认值:
  "default": "/api/images/img_abc123"

  ↓ 浏览器/运行时直接加载（同源绝对路径）
  
GET /api/images/img_abc123
  → 查 manifest.json 找到 sha256
  → 从 blobs/{sha256[:16]}.{ext} 读取
  → 返回图片（immutable 缓存）
```

不需要 `resolvePreviewConfigAssetUrls` 的图片路径重写分支，不需要 `rewriteLocalAssetPaths` 的图片路径重写。

移除的代码路径：
- `resolvePreviewConfigAssetUrls` 中相对图片路径（`../`、`./`）的解析分支 —— 保留仅用于存量项目兼容
- `rewriteLocalAssetPaths` 中图片字符串的 workspace proxy 重写 —— 保留仅用于存量项目兼容

已工作无需改动的部分：
- `FileUploadWidget` 的 `<img src={value}>` —— `/api/images/{imageId}` 是合法绝对路径，直接可显示
- `resolvePreviewConfigAssetUrls` 的 `/api/sessions/` 前缀处理 —— 与图片无关，保持不动
- `PrototypePagePreview` 组件 —— 不修改

---

### 5. 迁移策略

| 阶段 | 内容 | 风险 |
|------|------|------|
| **Phase 1** | 实现全局图床核心（存储 + manifest + API），更新 saveImage 工具 | 新图不再写入 workspace 文件系统 |
| **Phase 2** | 改造 `POST /api/sessions/:sessionId/assets/upload` 走全局图床 | FileUploadWidget 返回 `/api/images/{id}` URL |
| **Phase 3** | 实现消息自动入库 | 需确保图床 API 已上线 |
| **Phase 4** | 后台迁移脚本：扫描所有 `workspace/assets/images/` → SHA256 → 入全局图床 → images.json 加 `imageId` | 旧文件不删，双写期间可能重复引用 |
| **Phase 5** | 全量验证后，清理旧 `workspace/assets/images/` 文件和可简化的路径重写代码 | 需确保所有引用已迁移 |

---

### 6. 错误处理

| 场景 | 处理 |
|------|------|
| 图床存储不可用（磁盘满、权限错误） | 上传 API 返回 507；消息自动入库记录告警，不阻塞对话 |
| 图片超过 10MB | 返回 413 + 明确错误信息 `{ code: "ASSET_TOO_LARGE", message: "图片大小超过 10MB 限制" }` |
| 不支持的格式 | 返回 415 + `{ code: "UNSUPPORTED_FORMAT", allowedTypes: [...] }` |
| SHA256 碰撞（极低概率） | 告警日志记录，作为独立条目写入（两个不同图片有相同 hash 需人工核实） |
| 项目 `images.json` 写入失败 | 全局图床上传已成功，返回部分成功；后续重试链接操作 |
| manifest.json 损坏 | 启动时校验 JSON 结构，损坏时从 `blobs/` 目录重建（扫描文件 + 重新计算 SHA256） |

---

### 7. 实现顺序

```
1. 全局图床核心
   ├── data/image-store/ 目录结构与 manifest 管理服务
   ├── POST /api/images/upload
   ├── GET /api/images/[imageId]
   └── GET /api/images/[imageId]/info

2. AI 工具迁移
   ├── saveImage 工具改用全局图床（一次完成，无需分步）
   └── listImages 输出加 imageId

3. 前端上传改造
   ├── POST /api/sessions/:sessionId/assets/upload 走全局图床
   └── POST /api/sessions/:sessionId/assets/localize 走全局图床

4. 消息自动入库
   └── pi-agent.ts sendMessage() 中 auto-persist

5. 工作区代理增强（可选，存量兼容）
   └── GET .../workspace/[...path] fallback 到全局图床

6. 存量迁移脚本
   └── 扫描 workspace/assets/images → 入全局图床

7. 清理（可选）
   ├── 移除旧 workspace/assets/images/ 文件
   └── 移除 resolvePreviewConfigAssetUrls 和 rewriteLocalAssetPaths 中图片路径重写分支
```

---

### 补充设计决策

**统一使用 `/api/images/{imageId}` 作为唯一图片引用**：相比相对路径 `../../assets/images/...`，绝对 URL 消除了配置面板与页面预览之间路径解析不一致的问题，AI 也不需要理解两段式路径模型。`FileUploadWidget` 的 `<img src>` 直接可用，`resolvePreviewConfigAssetUrls` 无需额外处理。

**图片尺寸检测**：入库时同步从文件头解析（PNG IHDR / JPEG SOF / GIF Logical Screen Descriptor），不异步。解析失败时 width/height 为空，不阻塞入库。

**工作区代理 fallback 匹配逻辑**：代理路径 `/workspace/assets/images/{hash}-{filename}` → 提取 `{hash}-{filename}` 部分 → 在项目 `images.json` 中按 `filename` 字段匹配 → 找到对应 `imageId` → 从全局图床提供。若 `filename` 匹配多条（不同 hash 但同名），选最近创建的。

**blob 命名**：使用 SHA256 前 16 位（`{sha256[:16]}.{ext}`）以保证存储层去重安全。

## 远期规划（不做入本次）

- 全局图床图片删除策略（基于 projectRefs 引用计数）
- 图片访问统计
- 大图自动压缩

## 相关文件

| 文件 | 作用 |
|------|------|
| `packages/author-site/src/lib/image-store.ts` | 全局图床核心逻辑（新增） |
| `packages/author-site/src/app/api/images/upload/route.ts` | 上传 API（新增） |
| `packages/author-site/src/app/api/images/[imageId]/route.ts` | 按 ID 获取图片 API（新增） |
| `packages/agent-service/src/backends/pi-tools/save-image-tool.ts` | saveImage 工具实现 |
| `packages/agent-service/src/backends/pi-agent.ts` | 消息发送管道 + 自动入库 |
| `packages/agent-service/src/backends/pi-tools/project-image-manifest.ts` | 项目 images.json 管理 |
| `packages/author-site/src/app/api/sessions/[sessionId]/assets/upload/route.ts` | 前端图片上传 |
| `packages/author-site/src/app/api/sessions/[sessionId]/assets/localize/route.ts` | 前端图片本地化 |
| `packages/author-site/src/app/api/sessions/[sessionId]/workspace/[...path]/route.ts` | 工作区文件代理 |
| `packages/author-site/src/lib/project-images.ts` | 创作端 images.json 操作 |
| `packages/project-core/src/service.ts` | 项目级资产 CRUD |
| `packages/project-core/src/constants.ts` | 资产相关常量 |
