# 配置系统：Schema生成与控件联动

> 从配置系统图片上传功能方案中提取的配置系统架构与扩展经验

---

## 一、核心定位与设计哲学

**解决的最核心问题**：如何让AI生成的React组件与配置面板自动联动，实现非技术人员可理解的可视化配置。

**铁律**：配置面板是AI组件与用户之间的唯一桥梁。Schema必须与组件Props保持同步，不能有任何脱节。

---

## 二、架构机制与正确方向

### 2.1 Schema驱动的表单生成

JSON Schema作为配置面板的数据模型，通过`ui:widget`和`ui:options`扩展字段控制控件类型和行为。

**标准字段**：
```json
{
  "type": "string",
  "title": "标题",
  "description": "描述"
}
```

**扩展字段**：
```json
{
  "ui:widget": "file",
  "ui:options": {
    "accept": "image/*",
    "maxSize": 5242880,
    "placeholder": "点击选择图片"
  }
}
```

### 2.2 组件Props到Schema的自动映射

`/api/generate-schema`接口从TSX代码中提取Props类型，生成JSON Schema：

| TS类型 | Schema映射 |
|:-------|:-----------|
| `string` | `{ type: 'string' }` |
| `number` | `{ type: 'number' }` |
| `boolean` | `{ type: 'boolean' }` |
| `'a' \| 'b'` | `{ type: 'string', enum: ['a', 'b'] }` |
| `Props` interface | 展开为object schema |

### 2.3 Schema与组件的同步策略

**触发时机**：
1. AI完成一次代码修改（`UPDATE_CODE`成功返回后）
2. 用户手动保存代码时

**同步原则**：
- 保留现有Schema中已配置的`ui:widget`、`default`等扩展字段（不覆盖）
- 新增字段使用类型默认值作为`default`
- 删除字段时，对应配置数据自动清理

---

## 三、反模式与历史避坑

### 3.1 组件改了但Schema没改

**❌ 错误场景**：AI修改了组件props（如新增`imageUrl`字段），但配置面板仍然使用旧的Schema，导致新字段无法配置。

**根因**：Schema生成不是自动触发的，与代码修改脱节。

**✅ 正确做法**：代码变更后必须触发Schema重新生成，或在`UPDATE_CODE`成功后自动调用`/api/generate-schema`。

### 3.2 覆盖已有配置

**❌ 错误场景**：Schema重新生成时，用类型推导的值覆盖用户已设置的`ui:widget`、`default`等扩展配置。

**根因**：Schema生成逻辑没有检查扩展字段是否已存在。

**✅ 正确做法**：生成Schema时，对于已存在的字段，只更新类型相关的部分（如`type`、`enum`），保留`ui:*`扩展字段。

### 3.3 控件与数据模型不匹配

**❌ 错误场景**：Schema定义`type: 'array'`，但控件实现为单图上传。

**根因**：控件注册时widget key与Schema类型没有对应关系。

**✅ 正确做法**：
| Schema配置 | Widget Key | 控件类型 |
|:-----------|:-----------|:---------|
| `ui:widget: "file"` | `file` | ImageUploadWidget |
| `ui:widget: "imageList"` | `imageList` | ImageListWidget（URL模式） |
| `ui:widget: "imageListUpload"` | `imageListUpload` | ImageListUploadWidget（上传模式） |

---

## 四、核心指标与安全边界

### 4.1 文件上传限制

| 配置项 | 默认值 | 说明 |
|:-------|:-------|:-----|
| `accept` | `image/*` | MIME类型或扩展名 |
| `maxSize` | 5242880 (5MB) | 单文件最大大小 |
| `maxItems` | 10 | 最多上传数量（array类型） |

### 4.2 存储策略

**存储位置**：Session工作空间的`assets/images/`目录

```
session/{sessionId}/
├── index.tsx
├── config.schema.json
├── .session.json
└── assets/
    └── images/
        └── img_{timestamp}_{random}.png
```

**访问方式**：通过`/api/sessions/[sessionId]/assets/[filepath]`路由访问

**清理策略**：Session过期或被丢弃时，`assets/`目录一并删除。

---

## 五、关键配置常量

| 常量 | 值 | 说明 |
|:-----|:---|:-----|
| 单文件最大大小 | 5MB | 超过提示`FILE_TOO_LARGE` |
| 最多上传数量 | 10 | 达到后禁止添加 |
| 文件命名格式 | `img_{timestamp}_{random}.{ext}` | 避免冲突 |

---

## 六、关键教训

### 6.1 配置单一来源

组件Props、JSON Schema、配置面板表单必须三者同步。任何一方的变更都需要触发另外两方的更新。

### 6.2 扩展字段不可丢失

`ui:widget`、`ui:options`等扩展字段是用户的配置意图，重新生成Schema时必须保留，不能被类型推导覆盖。

### 6.3 资源与Session绑定

上传的文件资源与Session目录绑定，Session清理时资源一并清理，避免孤立文件残留。
