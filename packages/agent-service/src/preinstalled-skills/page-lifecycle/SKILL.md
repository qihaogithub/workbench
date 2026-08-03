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
   - `config.schema.json` — 页面配置定义（JSON Schema 格式）；如果用户没有明确要求配置项，必须写入空配置，不能从页面内容中自行抽取配置字段

### 默认 runtime 选择策略

- HTML/CSS 原型页是创作端 AI 的默认实现方式
- 只有当用户明确要求 React/高保真实现，或需求必须依赖原型页禁止/不支持的能力（例如任意 JavaScript 执行、复杂第三方 JS 播放器、需要 React 状态组件生态的交互）时，才创建或切换为 `high-fidelity-react`
- 选择 `high-fidelity-react` 时，目录中创建 `index.tsx` 和 `config.schema.json`；不要同时保留同一轮生成的 `prototype.html/css` 作为有效页面源码

### 默认 config.schema.json 模板

用户没有明确提出配置项时，`config.schema.json` 使用空配置对象：

```json
{
  "$demo": {
    "previewSize": { "width": 375, "height": 812 }
  },
  "type": "object",
  "properties": {},
  "required": []
}
```

`previewSize` 的宽高由你根据页面目标设备和内容自行判断填写。

如果用户明确要求配置项，使用以下格式定义字段（按分组组织）：

```json
{
  "$demo": {
    "previewSize": { "width": 375, "height": 812 }
  },
  "type": "object",
  "properties": {
    "分组名称": {
      "type": "object",
      "title": "分组名称",
      "properties": {
        "fieldName": { "type": "string", "title": "显示名称", "default": "默认值" },
        "count": { "type": "number", "title": "数量", "default": 0 },
        "enabled": { "type": "boolean", "title": "启用", "default": true },
        "bgColor": { "type": "string", "title": "背景颜色", "format": "color", "default": "#ffffff" },
        "logo": { "type": "string", "title": "Logo", "format": "image", "accept": "image/*" },
        "mode": { "type": "string", "title": "模式", "enum": ["a", "b"], "enumNames": ["模式A", "模式B"], "default": "a" },
        "tags": { "type": "string", "title": "标签", "enum": ["tech", "design"], "enumNames": ["技术", "设计"], "multiple": true, "default": ["tech"] },
        "region": { "type": "cascade", "title": "地区", "default": ["zhejiang", "hangzhou"], "options": [{ "value": "zhejiang", "label": "浙江", "children": [{ "value": "hangzhou", "label": "杭州" }] }] }
      },
      "required": []
    },
    "列表": {
      "type": "object",
      "title": "列表",
      "properties": {
        "items": {
          "type": "array",
          "title": "列表项",
          "variants": {
            "text": {
              "title": "文本项",
              "properties": {
                "content": { "type": "text", "title": "文本内容", "default": "" }
              }
            },
            "image": {
              "title": "图片项",
              "properties": {
                "pic": { "type": "image", "title": "图片" },
                "caption": { "type": "string", "title": "说明", "default": "" }
              }
            },
            "colorBlock": {
              "title": "色块",
              "properties": {
                "label": { "type": "string", "title": "标签", "default": "" },
                "value": { "type": "color", "title": "颜色", "default": "#6366f1" }
              }
            }
          },
          "default": []
        }
      },
      "required": []
    }
  },
  "required": []
}
```

支持的类型：`string`、`number`、`integer`、`boolean`、`text`（长文本）、`color`、`image`、`imageList`、`richtext`、`enum`、`cascade`、`array`。

**枚举多选**：`type: "enum"` 添加 `multiple: true` 即可切换为多选模式（checkbox 组），`default` 值为 `string[]`，页面 props 中该字段值为 `string[]`。

**级联选择**：`type: "cascade"` 用于层级数据选择（如省市区），通过 `options` 声明嵌套选项树，`default` 为 `string[]`（从根到叶值路径），页面 props 中该字段值为 `string[]`。第一期只支持 2 级。

**图片列表（imageList）**：`type: "array"` + `items: { "type": "string" }`，`default` 为 `string[]`（图片 URL 数组），页面 props 中该字段值为 `string[]`。不要写成 `type: "imageList"`。

**所有 12 种配置类型均可作为 `variants` 变体键值**，每个变体可以包含任意数量和组合的类型字段。常用模块变体示例：字符串模块（`label: string` + `value: string`）、数字模块（`label: string` + `value: number`）、开关模块（`label: string` + `value: boolean`）、颜色模块（`label: string` + `value: color`）、选项模块（`label: string` + `value: enum`）、富文本模块（`content: richtext`）、多图模块（`items: imageList`）、定位模块（`text`/`pic` + `x/y` 坐标）。

### 空标题约定

分组和字段显式声明 `"title": ""` 时，配置面板不渲染该分组标题或字段标签。适用于希望面板直接显示控件而不带标题的场景。未写 `title` 的字段/分组仍按现状兜底显示（字段显示 key 格式化名，分组显示 key 名或自动归组名）。

### 配置类型与运行时支持边界

不同页面运行时对配置类型的支持能力不同。HTML 原型页（`prototype-html-css`）只能消费标量类型的配置值，高保真 React 页（`high-fidelity-react`）支持所有类型。

**原型页可消费（标量类型，通过 `{{fieldKey}}` 插值或 `data-bind-*` 绑定）：**
- `string`、`number`、`integer`、`boolean`
- `text`（长文本）、`color`、`image`
- `enum` 单选（不含 `multiple: true`）

**必须升级高保真页才能使用的配置类型（需结构化消费）：**
- `array`（含 `variants` 模块数组，以及 `$demo.sortable`、`$demo.maxItems` 等扩展）
- `imageList`、`richtext`、`cascade`
- `enum` 多选（`multiple: true`）
- `type: "position"`（坐标定位字段）
- `$demo.orderable`、`$demo.orderableHorizontal`、`$demo.positionable`（根级排序/定位声明）

**规则：** 给原型页添加复合类型配置项前，应先通过 `page-runtime-conversion` 规范升级为 `high-fidelity-react` 页。升级时保留 `config.schema.json` 字段不变，重写 `index.tsx` 保留视觉，更新 `workspace-tree.json` 的 `runtimeType`。能用标量类型表达的配置诉求保持原型页，不为升级而升级。

### 条件表单（visibleWhen）

字段可以通过 `visibleWhen` 声明条件显隐，当另一个字段的值等于指定值时，该字段才显示：

```json
{
  "样式配置": {
    "type": "object",
    "title": "样式配置",
    "properties": {
      "mode": { "type": "enum", "title": "展示模式", "enum": ["text", "image"], "enumNames": ["文本", "图片"], "default": "text" },
      "textContent": { "type": "string", "title": "文本内容", "default": "", "visibleWhen": { "field": "mode", "equals": "text" } },
      "imageUrl": { "type": "image", "title": "图片地址", "visibleWhen": { "field": "mode", "equals": "image" } }
    },
    "required": []
  }
}
```

规则：
- `visibleWhen` 不是配置数据，不注入页面 props，仅控制配置面板中的字段显隐
- 适用于 enum 联动、boolean 开关联动等场景
- 被隐藏字段的当前值不会丢失，重新显示后恢复

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
