# 配置系统参考手册

> 生成或修改 `config.schema.json` 时，必须参考本文件。

## 基本结构

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "$demo": {
    "previewSize": { "width": 375, "height": 812 }
  },
  "properties": {
    "字段名": { "type": "string", "title": "显示名", "default": "默认值" }
  },
  "required": ["必填字段名"]
}
```

## 控件映射规则（三层优先级）

生成 schema 字段时，按以下优先级选择控件：

1. **`ui:widget` 显式覆盖**（最高优先级）— 强制指定控件类型
2. **`format` 语义映射** — 根据值的语义自动匹配控件
3. **`type` 数据类型回退**（最低优先级）— 根据基本类型推断

**原则**：优先使用 `format`（标准语义声明），只在 `format` 无法满足时才用 `ui:widget` 覆盖。

## 可用控件速查表

### 基础类型（Layer 3: type 回退）

| type                 | 控件       | 说明                            |
| -------------------- | ---------- | ------------------------------- |
| `string`             | 文本输入框 | 最基础的文本输入                |
| `number` / `integer` | 数字滑块   | 支持 `minimum`、`maximum` 约束  |
| `boolean`            | 开关       | 真/假切换                       |
| `string` + `enum`    | 下拉选择器 | 配合 `enumNames` 提供中文选项名 |
| `array`              | 多图列表   | 默认渲染为图片列表编辑器        |

### 语义映射（Layer 2: format）

| format    | 控件       | 用法                              |
| --------- | ---------- | --------------------------------- |
| `"color"` | 颜色选择器 | 可视化选色 + 手动输入 HEX 值      |
| `"image"` | 图片上传   | 单图上传，支持 URL 输入和文件上传 |

### 显式覆盖（Layer 1: ui:widget）

| ui:widget     | 控件         | 何时使用                                           |
| ------------- | ------------ | -------------------------------------------------- |
| `"file"`      | 文件上传     | 等同于 `format: "image"`，旧写法                   |
| `"image"`     | 图片上传     | 等同于 `format: "image"`                           |
| `"imageList"` | 多图列表     | `type: "array"` 时使用，支持 `ui:options.maxItems` |
| `"richtext"`  | 富文本编辑器 | 需要格式化文本（HTML 输出）时                      |

### ui:options 配置项

| 选项          | 适用控件      | 说明                                      |
| ------------- | ------------- | ----------------------------------------- |
| `accept`      | 文件/图片上传 | 限制文件类型，如 `"image/*"`              |
| `maxSize`     | 文件/图片上传 | 最大文件大小（字节），如 `5242880`（5MB） |
| `placeholder` | 文本/文件上传 | 占位提示文案                              |
| `maxItems`    | 多图列表      | 最大图片数量，默认 20                     |

## 扩展字段（$demo）

### $demo.previewSize — 预览尺寸

控制预览区的渲染尺寸（放在 schema 根级别）：

```json
{
  "$demo": {
    "previewSize": { "width": 375, "height": 812 }
  }
}
```

常用尺寸：手机竖屏 `375×812`、平板横屏 `1024×768`、桌面 `1440×900`。

### $demo.orderable — 组件排序

声明哪些子组件支持用户拖拽排序（放在 schema 根级别）：

```json
{
  "$demo": {
    "orderable": ["header", "banner", "content", "footer"]
  },
  "properties": {
    "header": { "type": "object", "title": "头部区域", "properties": {...} },
    "banner": { "type": "object", "title": "横幅区域", "properties": {...} },
    "content": { "type": "object", "title": "内容区域", "properties": {...} },
    "footer": { "type": "object", "title": "底部区域", "properties": {...} }
  }
}
```

规则：

- 至少 2 项才会显示排序控件
- 排序结果以 `__order` 属性注入组件 props
- 组件代码读取 `props.__order` 决定渲染顺序
- 未在 `orderable` 中的属性不参与排序

### $demo.note — 属性级备注

为配置项添加富文本备注（放在各属性下）：

```json
{
  "properties": {
    "brandColor": {
      "type": "string",
      "format": "color",
      "title": "品牌色",
      "default": "#FF6B35",
      "$demo": {
        "note": "建议使用品牌规范中的主色值，<b>需与设计师确认</b>"
      }
    }
  }
}
```

## 完整示例

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "$demo": {
    "previewSize": { "width": 375, "height": 812 },
    "orderable": ["heroSection", "featureList", "testimonialSection"]
  },
  "properties": {
    "pageTitle": {
      "type": "string",
      "title": "页面标题",
      "default": "我的 Demo",
      "description": "页面顶部的主标题"
    },
    "brandColor": {
      "type": "string",
      "format": "color",
      "title": "品牌色",
      "default": "#FF6B35"
    },
    "heroImage": {
      "type": "string",
      "format": "image",
      "title": "主视觉图",
      "default": "https://picsum.photos/750/400",
      "ui:options": {
        "accept": "image/*",
        "maxSize": 5242880
      }
    },
    "layout": {
      "type": "string",
      "title": "布局方式",
      "enum": ["grid", "list", "carousel"],
      "enumNames": ["网格布局", "列表布局", "轮播布局"],
      "default": "grid"
    },
    "showBadge": {
      "type": "boolean",
      "title": "显示角标",
      "default": true
    },
    "itemCount": {
      "type": "number",
      "title": "展示数量",
      "default": 6,
      "minimum": 1,
      "maximum": 20
    },
    "galleryImages": {
      "type": "array",
      "title": "图片画廊",
      "ui:widget": "imageList",
      "ui:options": { "maxItems": 10 },
      "default": []
    },
    "heroSection": {
      "type": "object",
      "title": "首屏区域",
      "properties": {
        "title": { "type": "string", "title": "标题", "default": "欢迎" },
        "subtitle": {
          "type": "string",
          "title": "副标题",
          "default": "描述文字"
        }
      }
    },
    "featureList": {
      "type": "object",
      "title": "功能列表",
      "properties": {
        "items": {
          "type": "array",
          "title": "功能项",
          "items": {
            "type": "object",
            "properties": {
              "icon": { "type": "string", "title": "图标名" },
              "text": { "type": "string", "title": "说明文字" }
            }
          },
          "default": [
            { "icon": "star", "text": "功能一" },
            { "icon": "heart", "text": "功能二" }
          ]
        }
      }
    },
    "testimonialSection": {
      "type": "object",
      "title": "用户评价",
      "properties": {
        "enabled": { "type": "boolean", "title": "显示评价", "default": true },
        "content": {
          "type": "string",
          "title": "评价内容",
          "ui:widget": "richtext",
          "default": "<p>用户好评</p>"
        }
      }
    }
  },
  "required": ["pageTitle", "brandColor"]
}
```
