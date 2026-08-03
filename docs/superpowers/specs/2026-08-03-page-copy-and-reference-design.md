# 跨项目页面复制与引用功能设计

## 背景

创作端用户需要在不同项目之间复用页面。当前同一项目内复制/粘贴已有基本实现（localStorage 剪贴板），但存在配置数据承载缺陷，且不支持跨项目引用——引用页在目标项目中只读展示源页面最新内容。

## 目标

1. 修复跨项目复制粘贴的配置数据（schema）承载问题
2. 支持粘贴时选择"复制"（可编辑克隆）或"引用"（只读实时链接）
3. 引用页在目标项目画布中只读展示源页面最新内容，允许调整画布位置/大小
4. 源页面/项目删除时，引用页显示"断开引用"占位

## 数据模型变更

### CanvasPageData（`packages/demo-ui/src/types.ts`）

增加 schema 字段，用于携带源页面的 config.schema.json 原始内容：

```typescript
export interface CanvasPageData {
  // ... 现有字段不变
  schema?: string;                    // config.schema.json 原始 JSON 字符串
  isReference?: boolean;              // 是否为引用页
  sourceProjectId?: string;           // 引用页的源项目 ID
}
```

### DemoPageMeta（`packages/shared/src/workspace.ts`）

增加可选 reference 字段，标记该页面为引用页：

```typescript
export interface DemoPageMeta {
  // ... 现有字段不变
  reference?: {
    sourceProjectId: string;   // 源项目 ID
    sourcePageId: string;      // 源页面 ID
  };
}
```

引用页的 runtimeType 保持原页面类型，但内容通过 API 从源项目加载。

### CanvasClipboardData（`packages/demo-ui/src/canvas-clipboard.ts`）

格式不变，CanvasPageData 新增的 schema 字段已覆盖复制需求。

## 复制流程修复

### 当前问题

复制时 CanvasPageData 只携带运行时 configData（配置值），config.schema.json（配置定义）未被携带。粘贴代码错误地把 configData 当 schema 写入。

### 修复方案

1. **复制时**：在 PreviewCanvas 的 copy 逻辑中，将源页面的 config.schema.json 原始内容放入 CanvasPageData.schema 字段，configData 保持原样
2. **粘贴时（handlePastePages）**：修正文件写入逻辑，分离 schema 和 values：
   - `schema` → 写入 `config.schema.json`
   - `configData` → 通过独立字段写入（项目级或页面级配置值）
3. **sketchScene 数据**：保留现有行为，复制时按 code 字段携带

## 引用创建流程

### 粘贴交互

1. 用户在项目 A 选中页面，Ctrl/Cmd+C 或右键菜单"复制"→ 写入 localStorage 剪贴板
2. 用户切换到项目 B 画布，Ctrl/Cmd+V 或右键菜单"粘贴"
3. 检测到剪贴板 sourceProjectId 与当前项目不同 → 弹出粘贴选项选择器
4. 同项目粘贴直接走复制流程，不弹选择器

### 粘贴选项选择器

简单的 Modal 组件，两个操作按钮：
- **[复制]**：走现有 handlePastePages 流程（修复 schema 写入）
- **[引用]**：走新引用创建流程

### 引用创建 API

`POST /api/projects/{projectId}/reference-pages`

请求体：
```json
{
  "sourceProjectId": "proj_xxx",
  "sourcePageIds": ["page_1", "page_2"],
  "sessionId": "sess_xxx"
}
```

服务端逻辑：
1. 校验 sourcePageIds 对应的每个页面都是真实页面（非引用页）
2. 为每个源页面生成新的 pageId
3. 在目标项目的 workspace-tree.json 中追加 DemoPageMeta 条目，每条带 reference 字段
4. 不创建物理页面目录（demos/{pageId}/ 不存在），不复制文件
5. 返回新创建引用页的 DemoPageMeta[]（含新 pageId、name、order 等）

### 引用创建后画布处理

1. 画布从 API 返回的引用页 meta 构建 CanvasPageData
2. CanvasPageData.isReference = true, sourceProjectId = sourceProjectId
3. 引用页的布局数据从剪贴板携带，偏移后写入画布状态
4. 引用页内容通过渲染 API 异步加载

## 引用页渲染

### 内容加载 API

`GET /api/projects/{projectId}/reference-page/{pageId}?sessionId=xxx`

服务端逻辑：
1. 从 workspace-tree 读取引用页的 reference 元数据
2. 从源项目读取页面文件（code, schema, config values, 等）
3. 返回 { code, schema, configData, runtimeType, 等 }

响应示例：
```json
{
  "success": true,
  "data": {
    "code": "...",
    "schema": "...",
    "configData": { ... },
    "runtimeType": "high-fidelity-react"
  }
}
```

### 渲染态处理

- **加载中**：复用 CanvasPageItem 的 loading 态（骨架屏/spinner）
- **正常**：与普通页面相同渲染管线（iframe/screenshot/prototype/sketch）
- **断开引用**（源项目/页面不存在或 404）：灰色占位框 + 断开链接图标 + "源页面不可用"文字，位置和大小保留
- **无权限**：显示"无权限访问源项目"占位

### 交互限制

- 引用页可拖动（改变 x/y）、可调整大小（改变 width/height）——属于 canvas layout 层面
- 双击引用页 → 不打开编辑面板，显示提示"此页面为引用，请在源项目中编辑"
- 右键菜单 → 布局操作保留，编辑/配置相关项隐藏；新增"查看源项目"、"转为副本"、"移除引用"
- 引用页在 CanvasPageItem 中增加锁定图标角标 + 轻微透明度降低的视觉标识

### 内容缓存

- 引用页内容在内存中按 key `${sourceProjectId}:${sourcePageId}` 缓存
- 会话级别缓存，页面刷新后重新加载，保证获取最新内容

## 错误处理与边界情况

### 跨项目权限

引用页渲染时，如果源项目是私有项目且当前用户无权限，显示"无权限访问源项目"占位。暂不实现跨项目鉴权穿透，依赖现有 session/API 鉴权机制。

### 引用规则

- **禁止**：引用一个引用页（sourcePageId 必须是真实页面）
- **允许**：跨项目不同页面之间的引用，即使形成项目级双向引用（例如项目 A 引用项目 B 的页面 X，项目 B 引用项目 A 的页面 Y，两者独立解析，不会产生死循环）

### 级联操作

- 删除源项目 → 引用页变为"断开引用"状态，不做自动清理
- 删除源页面 → 引用页变为"断开引用"状态
- 删除引用页本身 → 正常从 workspace-tree 移除，不影响源

### 项目级配置依赖

复制时如果源页面引用了 project.config.* 配置项，这些配置项不会自动复制到目标项目。粘贴为副本时只复制页面级内容，项目级配置需手动迁移。引用页通过源项目 API 加载时自动包含项目级配置解析。

### 画布布局持久化

引用页在目标项目的画布位置/大小写入 `.canvas-layout.json`，与普通页面一致。引用页的 pageLayout 数据在粘贴时从剪贴板携带，后续可独立调整。

## API 端点汇总

| 方法 | 路径 | 用途 | 类型 |
|------|------|------|------|
| POST | /api/projects/{projectId}/demos | 创建页面（修复 schema 写入） | 修改 |
| POST | /api/projects/{projectId}/reference-pages | 批量创建引用页 | 新增 |
| GET | /api/projects/{projectId}/reference-page/{pageId} | 解析引用页内容 | 新增 |
| PUT | /api/projects/{projectId}/demos/{pageId}/files | 更新页面文件（修复 schema+values 分离） | 修改 |
| DELETE | /api/projects/{projectId}/demos/{pageId} | 删除页面（引用页不清理物理文件） | 修改 |

## 快捷键与右键菜单

### 复制（已有+增强）

- 快捷键：Ctrl/Cmd + C（已有，验证选中态）
- 右键菜单："复制"（已有，画布和页面树均可用）
- 多选：选中多个页面后复制，携带所有选中页面数据

### 粘贴（已有+增强）

- 快捷键：Ctrl/Cmd + V（已有，增加跨项目检测）
- 右键菜单："粘贴"（已有，增加选择器弹窗）
- 跨项目时弹出选择器，同项目直接粘贴为副本

### 引用页右键菜单

- "查看源项目" → 跳转到源项目编辑页
- "转为副本" → 拉取当前内容，移除 reference 标记，创建物理文件
- "移除引用" → 从画布删除引用页
- 常规布局操作：位置调整、大小调整

## 测试策略

- 单元测试：剪贴板读写（已有 canvas-clipboard.test.ts，补充 schema 字段验证）
- 单元测试：引用创建 API 校验逻辑（引用页不可被引用 等）
- 集成测试：跨项目复制粘贴端到端（创建项目 A 页面 → 复制 → 切换项目 B → 粘贴为副本 → 验证内容）
- 集成测试：引用渲染流程（创建引用 → 加载 → 源页面更新 → 引用展示最新内容）
- 集成测试：断开引用处理（删除源页面 → 引用页显示占位）

## 实现顺序

1. 数据模型变更（CanvasPageData + DemoPageMeta）
2. 复制修复（schema 字段携带 + 粘贴写入分离）
3. 引用创建 API（POST /reference-pages + 校验逻辑）
4. 引用页渲染（GET /reference-page + CanvasPageItem 引用态）
5. 粘贴选择器 UI（Modal + 跨项目检测）
6. 引用页右键菜单（查看源项目/转为副本/移除引用）
7. 错误处理与边界情况兜底