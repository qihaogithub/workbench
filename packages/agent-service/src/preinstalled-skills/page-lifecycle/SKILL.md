---
name: page-lifecycle
description: 创建/重命名/排序页面和文件夹的完整规则：目录命名、默认文件结构、workspace-tree.json 编辑、配置项约束。触发词：创建新页面、新建 demo、重命名页面、调整页面顺序、创建文件夹、移动页面到文件夹。不适用于页面删除或运行时类型转换。
---

# 页面生命周期操作

## 创建页面

1. 在 `demos/` 下创建新目录，用一个**有意义的英文名称**命名，后缀 4 位随机字母数字
   - 示例：`demos/product-detail_a3f2/`、`demos/homepage_k8m2/`、`demos/settings-page_x7z1/`
   - 英文小写，单词用 `-` 连接，目录名最长 25 字符
   - 不要用时间戳或纯数字作为目录名
2. 默认创建 HTML/CSS 原型页。默认目录中创建三个文件：
   - `prototype.html` — 页面 HTML 结构
   - `prototype.css` — 页面 CSS 样式
   - `config.schema.json` — 页面配置定义；如果用户没有明确要求配置项，必须写入空配置 schema，不能从页面内容中自行抽取配置字段

### 默认 runtime 选择策略

- HTML/CSS 原型页是创作端 AI 的默认实现方式
- 只有当用户明确要求 React/高保真实现，或需求必须依赖原型页禁止/不支持的能力（例如任意 JavaScript 执行、复杂第三方 JS 播放器、需要 React 状态组件生态的交互）时，才创建或切换为 `high-fidelity-react`
- 选择 `high-fidelity-react` 时，目录中创建 `index.tsx` 和 `config.schema.json`；不要同时保留同一轮生成的 `prototype.html/css` 作为有效页面源码

### 默认 config.schema.json 模板

用户没有明确提出配置项时，`config.schema.json` 使用空属性集合：

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "$demo": {
    "previewSize": {
      "width": 375,
      "height": 812
    }
  },
  "properties": {},
  "required": []
}
```

`previewSize` 的宽高由你根据页面目标设备和内容自行判断填写。

### workspace-tree.json 追加规则

在 `workspace-tree.json` 的 `pages` 数组中追加新页面记录：

```json
{
  "id": "{目录名}",
  "name": "中文显示名称",
  "runtimeType": "prototype-html-css",
  "order": 1,
  "parentId": null
}
```

- `id` 为目录名
- `runtimeType` 默认为 `"prototype-html-css"`，高保真页为 `"high-fidelity-react"`
- `order` 取当前所有页面最大 order + 1
- `parentId` 默认为 `null`（根级），如需归属文件夹则填写对应 folder id

### 配置项约束

新建页面时，标题、文案、图片、颜色、按钮、布局等内容默认都应直接写在当前运行时源码中：原型页写入 `prototype.html` / `prototype.css`，高保真页写入 `index.tsx`。只有用户明确说"添加配置项"、"这个要可配置"、"加一个字段"等配置诉求时，才可以在 `config.schema.json` 中添加对应字段。

### 自检规则

新建页面的 `config.schema.json` 中不得包含 `project.config.schema.json` 中已有的字段名。

## 重命名 / 改顺序

编辑工作区根目录的 `workspace-tree.json` 的 `pages` 数组，修改对应页面的 `name` 或 `order` 字段。

## 文件夹管理

文件夹元数据记录在 `workspace-tree.json` 的 `folders` 数组中，格式与 pages 一致：

```json
{
  "id": "folder_xxx",
  "name": "文件夹名称",
  "order": 0,
  "parentId": null
}
```

创建/重命名/移动文件夹时编辑此数组。删除文件夹时需同时处理子页面（将 `parentId` 改为 `null` 或删除页面）。
