# 表单渲染器：数组对象与判别联合类型支持

## 1. 背景

当前创作端表单渲染器（`packages/demo-ui/src/ConfigForm.tsx`）在遇到 `type: "array"` 且 `items.type: "object"` 的 schema 时，降级为原始 JSON 文本框，用户必须手动编写 JSON。同时不支持 JSON Schema 的 `oneOf` 判别联合类型。

这导致配置面板无法为"模块列表"这类需求提供结构化表单（每个模块类型有不同配置字段，支持增删和排序）。

**目标**：让表单渲染器原生支持 JSON Schema 2020-12 的 `oneOf`（判别联合类型）和数组对象的逐项表单渲染，用标准 schema 表达复杂配置，不再发明新的 `ui:*` 扩展。

## 2. 文件拆分

当前 `ConfigForm.tsx` 1602 行，本次一并拆分：

```
packages/demo-ui/src/
├── ConfigForm.tsx          ← 主组件（~800 行）：状态管理、布局编排、OrderControl/PositionControl
├── schema-parser.ts        ← 纯函数：parseSchemaToFields() + oneOf 解析
├── FieldRenderer.tsx       ← 拆出字段渲染器：按类型/format/widget 分派
├── ArrayFieldGroup.tsx     ← 新增：数组对象编辑组件
├── OrderControl.tsx        ← 可选：OrderControl + PositionControl 逻辑（本次可选）
├── ImageListWidget.tsx     ← 不动
├── widgets.tsx             ← 不动
├── types.ts                ← 扩展 FieldConfig 接口
└── validator.ts            ← 不动
```

**必须拆**：`schema-parser.ts`（纯函数易测试）、`ArrayFieldGroup.tsx`（全新组件）
**建议拆**：`FieldRenderer.tsx`（已内聚 ~340 行，拆出后 ConfigForm 从 1600 → ~800 行）
**暂不拆**：`OrderControl` / `PositionControl`（与 ConfigForm 状态紧耦合，拆出需引入过多 props）

## 3. Schema 设计

核心策略：用 JSON Schema 2020-12 的 `oneOf` + `const` 表达判别联合类型，用 `items.properties` 表达数组内对象字段。不新增任何 `ui:*` 扩展。

### 3.1 无判别联合的数组对象（简单场景）

```json
{
  "properties": {
    "links": {
      "type": "array",
      "title": "友情链接",
      "items": {
        "type": "object",
        "properties": {
          "label": { "type": "string", "title": "名称" },
          "url": { "type": "string", "title": "链接" }
        }
      },
      "default": [{ "label": "GitHub", "url": "https://github.com" }]
    }
  }
}
```

渲染：每个 item 为折叠面板，展开后显示 "名称" 和 "链接" 两个输入框。

### 3.2 判别联合的数组对象（完课活动页场景）

```json
{
  "properties": {
    "modules": {
      "type": "array",
      "title": "模块列表",
      "items": {
        "oneOf": [
          {
            "title": "图片模块",
            "properties": {
              "type": { "const": "image" },
              "imageUrl": { "type": "string", "format": "image", "title": "图片" }
            },
            "required": ["type"]
          },
          {
            "title": "视频模块",
            "properties": {
              "type": { "const": "video" },
              "videoBg": { "type": "string", "format": "image", "title": "视频背景" },
              "videoCover": { "type": "string", "format": "image", "title": "视频封面" }
            },
            "required": ["type"]
          },
          {
            "title": "进度模块",
            "properties": {
              "type": { "const": "progress" },
              "progressBgTop": { "type": "string", "format": "image", "title": "进度背景-上" },
              "progressBgMiddle": { "type": "string", "format": "image", "title": "进度背景-中(可重复)" },
              "progressBgBottom": { "type": "string", "format": "image", "title": "进度背景-下" }
            },
            "required": ["type"]
          }
        ]
      },
      "default": [
        { "type": "image", "imageUrl": "../../assets/images/example.png" },
        { "type": "progress", "progressBgTop": "...", "progressBgMiddle": "...", "progressBgBottom": "..." },
        { "type": "image", "imageUrl": "../../assets/images/example2.png" },
        { "type": "video", "videoBg": "...", "videoCover": "..." }
      ]
    }
  }
}
```

渲染：
- 每个 item 先显示类型选择器（下拉框，选项为 `oneOf[].title`）
- 根据选中类型动态显示对应字段（复用现有 `FileUploadWidget` / `ColorPicker` / `Input` 等）
- 类型切换时**保留旧值**（不显示但存在对象中），切回时恢复

### 3.3 解析规则

`parseSchemaToFields()` 新增逻辑：

```
对每个 property:
  if prop.type === "array" && prop.items.type === "object":
    if prop.items.oneOf 存在:
      找到判别属性名 = prop.items.oneOf[0].properties 中第一个带 "const" 的 key
      构建 variants[]：
        for each variant in oneOf:
          title = variant.title
          value = variant.properties[discriminator].const
          fields = parseProperties(variant.properties)  // 递归，跳过 discriminator 字段
      → FieldConfig.oneOf = { discriminator, variants }
    else:
      → FieldConfig.children = parseProperties(prop.items.properties)
```

`parseProperties()` 复用现有逻辑，将 `{ key: propDef }` 转为 `FieldConfig[]`。

### 3.4 FieldConfig 接口扩展

```typescript
interface FieldConfig {
  key: string;
  title: string;
  type: string;
  description?: string;
  required?: boolean;
  default?: unknown;
  enum?: unknown[];
  enumNames?: string[];
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  format?: string;
  uiWidget?: string;
  uiOptions?: Record<string, unknown>;
  category?: string;
  visibleWhen?: VisibleWhenCondition;
  note?: string;
  itemsType?: string;

  // === 新增 ===
  children?: FieldConfig[];        // 数组 item 的子字段（非 oneOf 场景）
  oneOf?: OneOfConfig;             // 判别联合配置（互斥于 children）
}

interface OneOfConfig {
  discriminator: string;           // 判别属性名，如 "type"
  variants: OneOfVariant[];
}

interface OneOfVariant {
  title: string;                   // 变体名，如 "图片模块"
  value: string | number;          // 判别值，如 "image"
  fields: FieldConfig[];           // 该变体下的字段列表
}
```

`children` 和 `oneOf` 互斥。

## 4. ArrayFieldGroup 组件设计

### 4.1 布局结构

```
┌─ 模块列表 ────────────────────────────────────┐
│                                               │
│ ┌─ ≡ 图片模块 ─────────────────────── [×] ─┐ │  ← header: 拖拽手柄 + 标题 + 删除
│ │ ▸ 类型: [图片模块 ▼]                       │ │  ← 折叠状态
│ └───────────────────────────────────────────┘ │
│                                               │
│ ┌─ ≡ 进度模块 ─────────────────────── [×] ─┐ │
│ │ ▾ 类型: [进度模块 ▼]                       │ │  ← 展开状态
│ │                                            │ │
│ │   进度背景-上                               │ │
│ │   ┌────────────────────────────────────┐   │ │  ← FileUploadWidget
│ │   │   🖼 上传                           │   │ │
│ │   └────────────────────────────────────┘   │ │
│ │                                            │ │
│ │   进度背景-中(可重复)                        │ │
│ │   ┌────────────────────────────────────┐   │ │
│ │   │   🖼 上传                           │   │ │
│ │   └────────────────────────────────────┘   │ │
│ │                                            │ │
│ │   进度背景-下                               │ │
│ │   ┌────────────────────────────────────┐   │ │
│ │   │   🖼 上传                           │   │ │
│ │   └────────────────────────────────────┘   │ │
│ └───────────────────────────────────────────┘ │
│                                               │
│          ┌─ + 添加模块 ─┐                     │  ← AddButton
│          └──────────────┘                     │
└───────────────────────────────────────────────┘
```

### 4.2 交互规则

#### Header 标题

| 场景 | 标题内容 |
|------|---------|
| oneOf 数组 | 当前选中 variant 的 `title`（如 "图片模块"） |
| 非 oneOf 数组 | 从 `items.title` 推断或使用 "项目 ${index + 1}" |

#### 添加按钮

- 只有一个 variant → 直接追加该 variant 默认值
- 多个 variant → 展开 popover，列出所有 variant title，用户点击选择

默认值优先级：
1. `items.default` 中同类型的第一项
2. variant.properties 中各字段的 `default`
3. 空字符串

#### 删除

item header 右侧 [×] 按钮，直接移除该项。

#### 拖拽排序

header 左侧 `≡` 手柄，复用现有 `@dnd-kit/core` + `@dnd-kit/sortable`（与 OrderControl 相同依赖）。

#### 折叠/展开

点击 header 区域切换，使用 `Collapsible` 组件（与 FieldGroupSection 保持一致）。

#### 类型切换（oneOf 场景）

用户通过下拉框切换 variant：
- 修改 item 对象中的 discriminator 字段（如 `type`）
- 保留旧 variant 的字段值在对象中（不显示）
- 切回旧 variant 时，之前的字段值自动恢复
- 新 variant 首次渲染时使用 variant 字段默认值

示例数据流：
```
// item 从 image 切到 progress 再切回 image
{ type: "image", imageUrl: "a.png" }
→ { type: "progress", imageUrl: "a.png", progressBgTop: "", progressBgMiddle: "", progressBgBottom: "" }
→ { type: "image", imageUrl: "a.png", progressBgTop: "top.png", progressBgMiddle: "mid.png", progressBgBottom: "bot.png" }
```

### 4.3 空状态

```
┌─────────────────────────────────┐
│         暂无模块                 │
│   点击下方按钮添加第一个模块      │
│                                 │
│     ┌─ + 添加模块 ─┐            │
│     └──────────────┘            │
└─────────────────────────────────┘
```

### 4.4 组件接口

```typescript
interface ArrayFieldGroupProps {
  field: FieldConfig;                              // 包含 oneOf 或 children
  value: Record<string, unknown>[];                // 当前数组值
  onChange: (value: Record<string, unknown>[]) => void;
  sessionId?: string;
  readonly?: boolean;
}
```

ArrayFieldGroup 内部通过 `field.oneOf` 判断是否为判别联合。渲染 item 字段时使用当前 `FieldRenderer` 组件（提取后从 `FieldRenderer.tsx` 导入）。

## 5. 数据流与状态管理

### 5.1 formData 中的数组值

每个数组字段的值是一个 `Record<string, unknown>[]`（对象数组）。`ArrayFieldGroup` 通过 `onChange` 回调向上传递整个数组的新值。

```typescript
// ConfigForm 中：
const handleArrayFieldChange = useCallback(
  (key: string, value: Record<string, unknown>[]) => {
    const newData = { ...formDataRef.current, [key]: value };
    setFormData(newData);
    onChange({ [key]: value });
  },
  [onChange]
);
```

### 5.2 ArrayFieldGroup 内部状态

`ArrayFieldGroup` 是受控组件——`value` 来自父组件 `formData[field.key]`，变更通过 `onChange` 上报。内部不维护独立状态。

操作实现：

```typescript
// 添加
const handleAdd = (variantValue?: string) => {
  const newItem = variantValue
    ? createItemFromVariant(variantValue, field.oneOf!)
    : createItemFromChildren(field.children!);
  onChange([...value, newItem]);
};

// 删除
const handleRemove = (index: number) => {
  onChange(value.filter((_, i) => i !== index));
};

// 排序（使用 @dnd-kit arrayMove）
const handleDragEnd = (event: DragEndEvent) => {
  const { active, over } = event;
  if (!over || active.id === over.id) return;
  const oldIndex = Number(active.id);
  const newIndex = Number(over.id);
  onChange(arrayMove(value, oldIndex, newIndex));
};

// 类型切换
const handleTypeChange = (index: number, newType: string) => {
  const item = { ...value[index] };
  const variant = field.oneOf!.variants.find(v => v.value === newType);
  item[field.oneOf!.discriminator] = newType;
  // 为新 variant 字段补默认值（已有值不覆盖）
  for (const f of variant!.fields) {
    if (item[f.key] === undefined) {
      item[f.key] = f.default ?? "";
    }
  }
  const newValue = [...value];
  newValue[index] = item;
  onChange(newValue);
};
```

### 5.3 初始值与默认值

- 如果 `formData[field.key]` 已存在值（来自 initialData 或用户之前输入），使用该值
- 否则使用 `field.default`（schema 中的 default 数组）
- 如果都没有，渲染空数组 + 空状态

### 5.4 visibleWhen 在数组 item 内

数组 item 内的字段不支持 `visibleWhen`（当前 `visibleWhen` 基于顶层 `formData` 字段）。本次不做此功能。如未来需要，可在 `ArrayFieldGroup` 内部传递 item 对象作为上下文。

## 6. FieldRenderer 拆分

### 6.1 拆分策略

`FieldRenderer` 函数（当前 line 311-648）从 `ConfigForm.tsx` 移到 `FieldRenderer.tsx`。ConfigForm 中只保留调用：

```typescript
import { FieldRenderer } from "./FieldRenderer";
```

`FieldRenderer` 的 props 保持不变，新增 `children` 和 `oneOf` 类型的处理分支（分发到 `ArrayFieldGroup`）。

### 6.2 FieldRenderer 新增分支

在现有 `field.type === "array"` 分支中（line 418-465）：

```typescript
if (field.type === "array") {
  if (field.oneOf || field.children) {
    // 新增：数组对象的结构化渲染
    return (
      <ArrayFieldGroup
        field={field}
        value={(value as Record<string, unknown>[]) || []}
        onChange={(newValue) => onChange(newValue)}
        sessionId={sessionId}
        readonly={readonly}
      />
    );
  }
  if (field.itemsType === "object") {
    // 保留：无 children/oneOf 的 object 数组仍降级为 JSON 文本框
    // （兼容旧的未定义 items.properties 的 schema）
    return <Textarea ... />;
  }
  // 现有：ImageListWidget 路径
  ...
}
```

### 6.3 兼容性保证

- `itemsType === "object"` 但没有 `items.properties` 的老 schema → 仍降级为 JSON 文本框
- 所有现有非数组字段的渲染路径不变
- `ImageListWidget` 路径不变

## 7. 测试策略

### 7.1 单元测试：schema-parser.ts

```typescript
describe("parseSchemaToFields - oneOf", () => {
  it("应正确解析 oneOf 判别联合数组", () => {
    const schema = JSON.stringify({
      type: "object",
      properties: {
        modules: {
          type: "array",
          items: {
            oneOf: [
              { title: "图片", properties: { type: { const: "image" }, imageUrl: { type: "string", title: "图片" } } },
              { title: "视频", properties: { type: { const: "video" }, videoBg: { type: "string", title: "背景" } } }
            ]
          }
        }
      }
    });
    const groups = parseSchemaToFields(schema);
    const modulesField = groups[0].fields[0];
    expect(modulesField.oneOf).toBeDefined();
    expect(modulesField.oneOf!.discriminator).toBe("type");
    expect(modulesField.oneOf!.variants).toHaveLength(2);
  });

  it("应正确解析无 oneOf 的对象数组子字段", () => {
    const schema = JSON.stringify({
      type: "object",
      properties: {
        links: {
          type: "array",
          items: { type: "object", properties: { label: { type: "string" }, url: { type: "string" } } }
        }
      }
    });
    const groups = parseSchemaToFields(schema);
    const linksField = groups[0].fields[0];
    expect(linksField.children).toHaveLength(2);
    expect(linksField.oneOf).toBeUndefined();
  });
});
```

### 7.2 集成测试：ArrayFieldGroup

```typescript
describe("ArrayFieldGroup", () => {
  it("应渲染数组项并支持添加和删除", async () => { /* ... */ });
  it("应支持拖拽排序", async () => { /* ... */ });
  it("oneOf 场景应显示类型选择器", async () => { /* ... */ });
  it("类型切换应保留旧值并填充新字段默认值", async () => { /* ... */ });
  it("空数组应显示空状态", async () => { /* ... */ });
  it("应正确渲染 image 格式字段（FileUploadWidget）", async () => { /* ... */ });
});
```

### 7.3 回归测试

确保现有测试全部通过：
- `ConfigFormNew.test.tsx`（10 个测试）
- `page-config-panel.test.tsx`（12 个测试）
- `config-merge.test.ts`（10 个测试）
- `validator.test.ts`

## 8. 实施顺序

| 步骤 | 内容 | 依赖 |
|------|------|------|
| 1 | 创建 `schema-parser.ts`，扩展 `FieldConfig` 接口，实现 oneOf 解析 | — |
| 2 | 创建 `ArrayFieldGroup.tsx` 组件（渲染 + 增删排序 + 类型切换） | 步骤 1 |
| 3 | 创建 `FieldRenderer.tsx`，从 ConfigForm.tsx 拆出，新增 ArrayFieldGroup 分支 | 步骤 2 |
| 4 | 更新 ConfigForm.tsx，改为导入 FieldRenderer | 步骤 3 |
| 5 | 编写单元测试（schema-parser） | 步骤 1 |
| 6 | 编写集成测试（ArrayFieldGroup） | 步骤 2 |
| 7 | 运行全量回归测试 | 步骤 4 |
| 8 | 用完课活动页 schema 验证端到端效果 | 步骤 4 |

## 9. 风险与缓解

| 风险 | 缓解 |
|------|------|
| oneOf 解析遗漏边界 case（如嵌套 oneOf、无 const 的 oneOf 等） | 解析失败时 schema-parser 返回错误日志，字段降级为 JSON 文本框 |
| ArrayFieldGroup 拖拽与 OrderControl 拖拽冲突 | 使用独立的 DndContext 包裹 ArrayFieldGroup 内部（context 隔离） |
| FieldRenderer 拆分导致导入路径变更影响其他 consumer | demo-ui 通过 barrel 导出 `ConfigForm`，内部重构对 consumer 透明 |
| 大量数组项（>50）渲染性能 | 每项默认折叠，展开后才渲染字段控件 |
| 状态重设（父组件用 `key={schema}` 强制 remount）导致未保存数据丢失 | 这是现有行为，本次不改变 |

## 10. ui:options 扩展（可控）

数组对象 schema 可通过 `ui:options` 控制渲染行为，均为可选：

| 选项 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `ui:options.maxItems` | number | 无限制 | 数组最大项数 |
| `ui:options.collapsed` | boolean | true | 数组项默认折叠 |
| `ui:options.itemTitleField` | string | — | 指定 item 中用作标题的字段名（非 oneOf 场景） |
