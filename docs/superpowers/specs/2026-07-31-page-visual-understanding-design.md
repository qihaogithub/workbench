# 页面视觉语义理解 — 设计文档

> 日期：2026-07-31
> 状态：已确认，待实施

## 背景

用户用视觉语言描述页面（"那个蓝色横幅"、"右下角按钮"），Agent 只能看到代码（`<img src="abc123-banner.png">`、`<div className="flex...">`），存在语义鸿沟。尤其当页面内容是大量图片时，纯代码无法让 Agent 准确理解页面。

## 目标

让 Agent 从"用户看到的"视角理解页面，而非仅从代码视角。

## 方案概述

采用行业最佳实践组合：图片 `alt` 自动生成（Phase A）+ 无障碍树视图（Phase B），分两阶段落地。

两阶段天然衔接：Phase A 产生的 `alt` 文本在 Phase B 的无障碍树中自动表现为图片节点的 `name` 字段，Agent 无论走代码阅读还是走无障碍树视图，都能看到图片语义。

```
Phase A                          Phase B
━━━━━━━━━━━━━━━━━━━━            ━━━━━━━━━━━━━━━━━━━━
saveImage(图片)                  readPageStructure(pageId)
    │                                 │
    ├─ 同步返回 URL                   ├─ 编译页面
    └─ 异步 → 识图模型                ├─ Puppeteer 渲染
            │                        ├─ CDP getFullAXTree
            ▼                        └─ 压缩格式化
        alt: "蓝色横幅"                     │
            │                              ▼
            └──────────────→    [image] 蓝色横幅，白字"欢迎"
                               [button] 立即体验
                               [heading 1] 我们的产品
                               [text] 这是产品简介文字...
```

## Phase A：图片 `alt` 自动生成

### A1. `saveImage` 流程改造

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

### A2. `listImages` 增强

返回增加 `alt` 字段：

```
当前：{ hash, url, filename, mimeType, sourceType }
增强：{ hash, url, filename, mimeType, sourceType, alt: "蓝色横幅，白字'欢迎'" }
```

### A3. 系统提示词更新

- **生成新页面时**：Agent 写入 `<img>` 必须带 `alt` 属性，值从 `saveImage` 返回或 `listImages` 查询获取
- **读取现有页面时**：Agent 读到无 `alt` 的 `<img>`，先调 `listImages` 查图片内容

### A4. 存量图片回填

可选单次脚本：对现有项目中无 `alt` 的图片跑视觉模型补全。

### A5. 涉及文件

| 文件 | 改动 |
|------|------|
| `packages/agent-service/src/backends/pi-tools/save-image-tool.ts` | 增加异步 alt 生成逻辑 |
| `packages/agent-service/src/backends/pi-tools/list-images-tool.ts` | 返回增加 `alt` 字段 |
| `packages/agent-service/src/backends/pi-tools/project-image-manifest.ts` | 元数据增加 `alt` 字段 |
| `packages/agent-service/src/services/image-describer.ts` | 复用，无需改动 |
| `packages/author-site/src/lib/agent/prompts/system-prompt.md` | 增加 `<img alt>` 规则 |

## Phase B：无障碍树工具 `readPageStructure`

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

三个视觉相关工具的定位在系统提示词中明确区分：

| 工具 | 适用场景 | 输出 |
|------|----------|------|
| `readFile(index.tsx)` | 需要读代码逻辑、修改代码 | 完整源码 |
| `readPageStructure(pageId)` | 需要快速了解页面布局和元素 | 结构化文本 ~500 token |
| `captureScreenshot` | 需要精确视觉确认、检查样式细节 | base64 图片 |

Agent 行为指引：
- 用户描述视觉特征（"那个蓝色按钮"、"第一张图"）→ 先调 `readPageStructure`
- `<img>` 无 `alt` 属性 → 调 `listImages` 查图片内容描述
- 需要精确定位或颜色/间距等细节 → 调 `captureScreenshot` 查看实际渲染

## 兼容性与破坏性变更

- 无破坏性变更
- 对已有 Agent 行为透明：新增工具，不修改已有工具签名
- 截图工具 `captureScreenshot` 保留作为视觉确认兜底

## 验证方式

| 阶段 | 验证 |
|------|------|
| Phase A | `pnpm check:agent` + 单元测试验证 `saveImage` 异步 alt 生成 + `listImages` 返回 alt |
| Phase B | `pnpm check:screenshot` + `pnpm check:agent` + 集成测试验证 `readPageStructure` 端到端流程 |

## 实施顺序

1. Phase A：`alt` 自动生成
2. Phase B：`readPageStructure` 工具
3. 系统提示词更新（两阶段统一调整）
