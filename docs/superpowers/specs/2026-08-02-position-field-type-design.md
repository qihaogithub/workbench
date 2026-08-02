# position 字段类型设计

> 日期: 2026-08-02

## 背景

当前坐标配置通过全局 `$demo.positionable`（页面根级）或 variant `_positionable`（数组项级）声明，数据存储在独立的 `__positions` 扁平映射中。它们和元素配置数据分离，且渲染在配置面板的"元素定位"独立分组或数组项内的独立控件区，与字段流脱节。

用户希望的形态：坐标就是普通配置参数，像 `pic`、`caption` 一样是元素自身的一个字段，渲染在字段流中的自然位置，输入框 + 拖动按钮即可。

## 目标

- 新增 `type: "position"` 作为一等字段类型
- 配置面板渲染为紧凑的 x/y 数字输入 + 拖动按钮（无缩略画布）
- 预览区拖动时，所有 position 字段对应元素同时可拖，一次性进入编辑模式
- 数据直接存在数组项内，每个实例独立拥有坐标

## 非目标

- 不保留旧的全局 `$demo.positionable` / variant `_positionable` / `__positions` 机制（直接移除）
- 不实现 position 字段的旋转、缩放等其他变换属性
- 不实现拖动边界约束（已有独立设计）

## 设计

### 1. config.ts 声明

```ts
image: {
  title: "图片",
  pic: { type: "image", title: "图片资源" },
  position: {
    type: "position",
    key: "bannerImage",
    title: "位置",
    size: { width: 375, height: 300 },
    default: { x: 20, y: 20 }
  }
}
```

| 属性 | 必填 | 说明 |
|------|------|------|
| `type` | 是 | `"position"` |
| `key` | 否 | 对应预览区 DOM 的 `data-pos-key`，默认用字段名 |
| `title` | 否 | 字段标签，默认 `"位置"` |
| `size` | 否 | 坐标容器尺寸（width/height），默认用 `$preview` 的宽高 |
| `default` | 否 | 初始坐标 `{ x, y }`，默认 `{ x: 0, y: 0 }` |

### 2. Schema 编译

`type: "position"` 编译为 JSON Schema：

```json
"position": {
  "type": "object",
  "title": "位置",
  "properties": {
    "x": { "type": "number", "default": 20 },
    "y": { "type": "number", "default": 30 }
  },
  "$demo": { "positionable": { "key": "bannerImage", "size": { "width": 375, "height": 300 } } }
}
```

- 编译为 `type: "object"` 的 JSON Schema，确保 position 是标准对象字段
- 若有 `size` 或 `default`，生成 `$demo.positionable` 标记字段
- `$demo.positionable.key` 来自 config.ts 的 `key` 属性，无声明时用字段名
- 无 `$demo.positionable.items`（只有一个坐标目标）

### 3. 运行时数据

```json
{
  "type": "image",
  "pic": "/api/images/img_xxx",
  "caption": "示例配图",
  "position": { "x": 40, "y": 80 }
}
```

`position` 与 `pic`、`caption` 平级，删除元素时坐标自动消失。

### 4. 页面代码使用

```tsx
blocks.map(block => {
  if (block.type === "image") {
    const { pic, position } = block;
    return (
      <img
        src={pic}
        style={{ position: "absolute", left: position.x, top: position.y }}
      />
    );
  }
})
```

不再需要 `__positions` prop。

### 5. 配置面板渲染

`type: "position"` 字段渲染为紧凑行：

```
位置   X [  20]   Y [  30]   [拖动]
```

- 两个数字输入框（x、y），含 min/max 约束
- 一个"拖动"按钮，点击后进入预览区编辑模式
- 无可视画布缩略图
- 字段出现在字段流的自然位置，不在独立分组

### 6. 预览区拖动

- 点击任意 position 字段的"拖动"按钮 → 进入预览编辑模式
- 进入时收集所有 position 字段的信息：字段路径、当前坐标、容器尺寸
- 通过 `ENTER_POSITION_EDIT` 消息发送给预览 iframe
- 所有具有 `data-pos-key` 属性的 DOM 元素进入可拖拽状态
- 拖动结束后通过 `POSITION_CHANGE` 消息返回：`{ posKey: { x, y }, ... }`
- ConfigForm 根据 posKey → 字段路径映射，更新对应 `position.x/y`

**posKey 映射方案**：position 字段声明时可选指定 `key` （作为 `data-pos-key` 值），若不指定则用字段名。页面代码中对应元素写 `data-pos-key="<key>"` 标记。

### 7. 移除的旧机制

| 移除项 | 位置 |
|--------|------|
| 全局 `$demo.positionable` + `PositionControl` 组件 | `validator.ts` / `ConfigForm.tsx` |
| Variant `_positionable` / `$demo.positionable` | `config-compiler.ts` / `schema-parser.ts` |
| `__positions` 扁平映射 | `runtime-props.ts` / `validator.ts` |
| `PositionConfigContext` 全局上下文 | `ConfigForm.tsx` |
| `getVariantPositionableItemSet` | `validator.ts` |
| `ArrayFieldGroup` 中的 inline position controls | `ArrayFieldGroup.tsx` |

### 8. 数据流

```
用户拖动元素
  → iframe postMessage { type: "POSITION_CHANGE", positions }
  → PreviewPanel 回调
  → ConfigForm onChange({ "blocks[0].position": { x, y } })
  → formData 更新
  → 预览 iframe 收到 UPDATE_CONFIG，重新渲染
```

不再经过 `__positions` 扁平映射或 `PositionConfigContext`。

### 9. 受影响的文件

| 包 | 文件 | 改动类型 |
|---|---|---|
| shared | `config-compiler.ts` | 新增 `type: "position"` → JSON Schema 编译；移除 variant `_positionable` |
| shared | `config-compiler.test.ts` | 新增测试用例 |
| demo-ui | `types.ts` | 可能的新增类型（如 `PositionFieldConfig`） |
| demo-ui | `schema-parser.ts` | 识别 `$demo.positionable` 标记的 object 字段；移除 variant positionable 解析 |
| demo-ui | `validator.ts` | 移除 `getVariantPositionableItemSet`；清理 `getDefaultValues` 中的 `__positions` |
| demo-ui | `ConfigForm.tsx` | 移除 `PositionControl`、`PositionConfigContext`、`getVariantPositionableItemSet` 调用 |
| demo-ui | `FieldRenderer.tsx` | 新增 position 字段渲染分支（x/y 输入 + 拖动按钮） |
| demo-ui | `ArrayFieldGroup.tsx` | 移除 variant positionable 和内联定位控件逻辑 |
| demo-ui | `PreviewPanel.tsx` | 拖动回调适配新数据路径，发送字段路径而非扁平 key |
| author-site | `runtime-props.ts` | 移除 `__positions` 合并逻辑 |
| author-site | 项目文件 | 迁移现有 positionable 配置为 `type: "position"` |

## 风险

- 旧项目迁移需手动更新 `config.ts`（全局 `$positionable` → 对应数组项的 `position` 字段）
- 预览区拖动同一时刻可能有多个 position 字段，需要确保消息传递字段路径作为标识
