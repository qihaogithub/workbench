# 页面视觉语义理解 — 设计文档

> 日期：2026-07-31
> 最后更新：2026-08-03
> 状态：Phase A3 实施中

## 背景

用户用视觉语言描述页面（"那个蓝色横幅"、"右下角按钮"），Agent 只能看到代码（`<img src="abc123-banner.png">`、`<div className="flex...">`），存在语义鸿沟。尤其当页面内容是大量图片时，纯代码无法让 Agent 准确理解页面。

此外，纯文本模型无法直接"看到"截图和图片内容，需要视觉模型代劳理解。

## 目标

让 Agent 从"用户看到的"视角理解页面，而非仅从代码视角。

## 方案概述

采用三阶段方案：

- **Phase A：图片语义理解** — 图片保存时自动生成 alt、图片列表展示 alt、`describeImage` 工具让 AI 主动分析任意图片
- **Phase B：无障碍树视图** — 用 `readPageStructure` 获取页面布局文本化视图
- **Phase C：系统提示词** — 统一指引 Agent 何时使用哪个工具

```
Phase A                          Phase B
━━━━━━━━━━━━━━━━━━━━            ━━━━━━━━━━━━━━━━━━━━
saveImage(图片)                  readPageStructure(pageId)
describeImage(url)                  │
    │                                 ├─ 编译页面
    ├─ 调用视觉模型                     ├─ Puppeteer 渲染
    ├─ 返回文字描述                     ├─ CDP getFullAXTree
    │                                 └─ 压缩格式化
    ▼                                       ▼
alt: "蓝色横幅"              [image] 蓝色横幅，白字"欢迎"
                             [button] 立即体验
                             [heading 1] 我们的产品
                             [text] 这是产品简介文字...
```

## Phase A：图片语义理解

### A1. `saveImage` 流程改造（已实施）

当前流程：
```
saveImage(base64/url/assetId) → 存图床 / 本地 assets → 返回 URL
```

改造后：
```
saveImage(base64/url/assetId)
  ├── 存入图床 / 本地 assets
  ├── 调用识图模型 → 生成 alt 描述（同步，~1-2 秒）
  └── 返回 { url, imageId, alt: "蓝色横幅，白字'欢迎'" }
```

- 同步生成 alt，确保 Agent 立即可用，避免异步竞态
- 复用现有 `image-describer.ts` 识图基础设施
- 图片内容不变（SHA-256 哈希相同）则 alt 永远有效，不会重复生成（缓存命中时 <50ms）
- alt 生成使用专用提示词，输出中文、30 字以内、聚焦内容描述而非艺术评价

#### alt 生成提示词（示例）

```
简要描述这张图片的内容，用于网页无障碍 alt 文本。
- 30 字以内
- 使用中文
- 只描述画面中的客观内容（主体、动作、场景），不做艺术评价
- 如果图片包含文字，引用原文
```

### A2. `listImages` 增强（已实施）

返回增加 `alt` 字段：

```
当前：{ hash, url, filename, mimeType, sourceType }
增强：{ hash, url, filename, mimeType, sourceType, alt: "蓝色横幅，白字'欢迎'" }
```

### A3. `describeImage` 工具（本次实施）

新增工具 `describeImage(imageUrl)`，让 AI 能主动调用视觉模型分析任意图片。

#### 工具定义

```typescript
工具名: describeImage
参数: { imageUrl: string }
描述: "使用视觉模型分析图片内容，返回文字描述。适用于：纯文本模型无法直接看图时分析截图内容、识别图片中的文字和 UI 元素。"
```

#### 执行流程

```
AI 调用 describeImage({ imageUrl: "http://screenshot-service/..." })
  ├── 1. 通过 imageUrl 下载图片
  ├── 2. 构造 ImageAttachment
  ├── 3. 调用 ImageDescriber.describe() 获取描述
  └── 4. 返回文字描述
```

#### 条件注册

- **主模型为多模态**（`input` 包含 `"image"`）：不注册 `describeImage`，模型直接看截图
- **主模型为纯文本 + ImageDescriber 已配置视觉模型**：注册 `describeImage`，AI 可主动调用
- **主模型为纯文本 + ImageDescriber 未配置**：不注册，无法看图

#### 交互流程

```
多模态模型场景：
  captureScreenshot → 返回 {type:"image"} + 截图 URL
  → 模型直接看图片 → 回复用户

纯文本模型场景：
  captureScreenshot → 返回文字 + 截图 URL → 模型看不到图片
  → 主动调用 describeImage({imageUrl:"..."}) → 视觉模型描述 → 回复用户
```

#### 涉及文件

| 文件 | 改动 |
|------|------|
| `packages/agent-service/src/backends/pi-tools/describe-image-tool.ts` | 新建，工具实现 |
| `packages/agent-service/src/backends/pi-tools/index.ts` | 条件注册新工具 |
| `packages/agent-service/src/backends/pi-tools/screenshot-tool.ts` | 返回截图 URL |
| `packages/agent-service/src/backends/pi-agent.ts` | 根据模型能力传入 ImageDescriber |
| `packages/author-site/src/lib/agent/prompts/system-prompt.md` | 增加视觉工具指引 |

### A4. 系统提示词更新（本次实施）

参见系统提示词调整章节。

## Phase B：无障碍树工具 `readPageStructure`（待实施）

### B1. 工具定义

新增工具 `readPageStructure(pageId)`，支持所有页面类型（`high-fidelity-react`、`prototype-html-css`、`sketch-scene`）。

输入：`pageId`

输出示例（压缩结构化文本）：
```
页面 "首页" (1200 x 800)
----------------------------------------
[image]         蓝色横幅，白字"欢迎"
[heading 1]     我们的产品
[text]          这是产品简介文字...
[image]         产品截图展示
[button]        立即体验
[link]          了解更多 →
[heading 2]     功能亮点
[list]
  [listitem]    极速渲染引擎
  [listitem]    拖拽式编辑
  [listitem]    一键发布
----------------------------------------
共 42 个可见元素，省略了 28 个装饰性元素
```

### B2. 生成流程

```
Agent 调 readPageStructure(pageId)
      │
      ▼
agent-service 
      │
      ▼
screenshot-service POST /api/accessibility/:projectId/:pageId
      │
      ├── 1. 编译页面（复用已有编译缓存）
      ├── 2. Puppeteer 页面渲染（复用已有 Chrome 实例）
      ├── 3. CDP: Page.enable + Accessibility.enable
      ├── 4. CDP: Accessibility.getFullAXTree
      └── 5. 压缩格式化 → 返回结构化文本
```

全部复用 `screenshot-service` 的 Puppeteer + Chrome + 编译缓存，只新增一个轻量端点。

#### API 契约

**请求** `POST /api/accessibility`
```json
{
  "projectId": "proj_xxx",
  "pageId": "page_xxx"
}
```

**响应**
```json
{
  "success": true,
  "data": {
    "pageName": "首页",
    "viewportSize": { "width": 1200, "height": 800 },
    "structure": "[image] 蓝色横幅...[button] 立即体验...",
    "elementCount": { "shown": 14, "omitted": 28 }
  }
}
```

### B3. 压缩策略

无障碍树原始输出高达几百行嵌套。对 Agent 有价值的子集：

- **保留**：按钮、链接、标题、图片、输入框、列表项、重要文本段落
- **省略**：纯布局容器（div、section）、SVG 路径、隐藏元素、空节点
- **text 节点合并**：连续文本合并为一行
- **位置简化**：只保留大致区域（左上/右上/中间），精确定位用 `captureScreenshot`

### B4. 性能

| 操作 | 耗时 |
|------|------|
| 编译页面（缓存命中） | ~5ms |
| Puppeteer 渲染 + AXTree 提取 | ~300ms |
| 格式化压缩 | ~10ms |
| **总计** | **~300-500ms** |

比 `captureScreenshot` 快（无图片编码和 base64 传输），输出是 token 友好的文本。

### B5. 涉及文件

| 文件 | 改动 |
|------|------|
| `packages/screenshot-service/src/` | 新增 `/api/accessibility` 端点 |
| `packages/agent-service/src/backends/pi-tools/` | 新增 `read-page-structure-tool.ts` |
| `packages/agent-service/src/backends/pi-tools/index.ts` | 注册新工具 |
| `packages/agent-service/src/utils/config.ts` | 可选开关配置 |
| `packages/author-site/src/lib/agent/prompts/system-prompt.md` | 增加工具使用指引 |

## 系统提示词调整

### 视觉工具使用指引

在系统提示词中新增段落，明确三种视觉相关工具的定位：

| 工具 | 适用场景 | 输出 |
|------|----------|------|
| `listImages` | 需要了解项目中已有图片的内容 | 图片列表 + alt 描述 |
| `describeImage` | 需要分析截图或任意图片的内容 | 文字描述 |
| `captureScreenshot` | 需要精确视觉确认 | 图片（多模态模型可直接看）+ 截图 URL |

Agent 行为指引：
- 如果你的模型支持看图（多模态），`captureScreenshot` 返回的图片可直接查看，无需额外工具
- 如果你的模型不支持看图（纯文本），截图后应调用 `describeImage` 分析截图内容
- `<img>` 无 `alt` 属性 → 调 `listImages` 查图片内容描述

### 按需 Skill 更新

`preview-tools` 描述增加 `describeImage`：
- **预览调试与画布管理**（`preview-tools`）：getConsoleLogs、captureScreenshot、describeImage、arrangeCanvasPages。触发词：调试预览、控制台日志、截图、整理画布、描述图片、分析截图。

## 兼容性与破坏性变更

- 无破坏性变更
- 对已有 Agent 行为透明：新增工具，不修改已有工具签名
- 截图工具 `captureScreenshot` 保留作为视觉确认兜底
- `describeImage` 工具在纯文本模型下注册，多模态模型下不注册

## 验证方式

| 阶段 | 验证 |
|------|------|
| Phase A1/A2 | `pnpm check:agent` + 单元测试验证 `saveImage` 异步 alt 生成 + `listImages` 返回 alt |
| Phase A3 | `pnpm check:agent` + 验证 `describeImage` 工具注册/描述准确性 |
| Phase B | `pnpm check:screenshot` + `pnpm check:agent` + 集成测试验证 `readPageStructure` 端到端流程 |

## 实施顺序

1. ✅ Phase A1：`alt` 自动生成（已实施）
2. ✅ Phase A2：`listImages` 增强（已实施）
3. 🔄 Phase A3：`describeImage` 工具（实施中）
4. 🔄 Phase A4：系统提示词更新（实施中）
5. ⏳ Phase B：`readPageStructure` 工具（待实施）