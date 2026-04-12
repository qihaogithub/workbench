# 配置面板用户体验优化方案

## Why

当前配置面板存在以下用户体验问题：

1. **图片列表显示异常** - 数组类型的图片资源显示为 `[object Object]`，用户无法查看和管理图片
2. **滑块缺少实时数值** - 切换间隔滑块没有显示当前选中的具体数值
3. **视觉层次不清晰** - 分组标题与配置项之间的视觉区分不够明显
4. **开关状态冗余** - 开关组件旁边有"开启/关闭"文字标签，与开关本身的状态重复
5. **缺少配置说明** - 用户不理解某些配置项的具体作用

## What Changes

### 高优先级优化

1. **修复图片列表显示**

   * 将 `[object Object]` 显示改为图片缩略图网格

   * 支持添加、删除、替换图片

   * 显示图片数量统计

   * 支持拖拽排序

2. **滑块添加实时数值显示**

   * 在滑块旁边实时显示当前数值

   * 添加单位显示（如：3000ms）

   * 支持点击数值直接输入

### 中优先级优化

1. **优化开关组件**

   * 移除冗余的"开启/关闭"文字标签

   * 使用颜色区分状态（绿色=开启，灰色=关闭）

   * 添加平滑的切换动画

2. **增强视觉层次**

   * 使用卡片样式包裹每个分组

   * 添加分组图标增强识别性

   * 优化分组标题样式

3. **添加配置项说明**

   * 鼠标悬停显示详细说明（已部分实现，需完善）

   * 在必填项旁添加红色星号

### 低优先级优化

1. **数组类型通用优化**

   * 支持数组类型的添加/删除操作

   * 数组项可折叠/展开

   * 支持拖拽排序

2. **实时预览联动**

   * 配置变更时预览区实时更新（已支持）

   * 添加配置变更的视觉反馈

## Impact

* **受影响文件**：

  * `packages/web/components/demo/ConfigFormNew.tsx` - 主要修改

  * `packages/web/components/demo/widgets.tsx` - 新增/修改组件

  * `packages/web/components/demo/types.ts` - 类型定义扩展

* **受影响功能**：

  * Demo 编辑页面的配置面板

  * 所有使用 ConfigForm 的组件

## ADDED Requirements

### Requirement: 图片列表组件

The system SHALL provide a visual image list component for array-type image resources.

#### Scenario: 显示图片列表

* **GIVEN** Schema 中定义了图片数组类型的字段

* **WHEN** 配置面板渲染该字段

* **THEN** 显示图片缩略图网格而非 `[object Object]`

#### Scenario: 管理图片

* **GIVEN** 图片列表组件已显示

* **WHEN** 用户点击"添加"按钮

* **THEN** 弹出输入框允许输入图片 URL

* **AND** 添加后显示图片缩略图

#### Scenario: 删除图片

* **GIVEN** 图片列表中有图片

* **WHEN** 用户点击删除按钮

* **THEN** 从列表中移除该图片

* **AND** 触发 onChange 更新配置数据

### Requirement: 滑块数值显示

The system SHALL display the current value next to the slider component.

#### Scenario: 显示滑块数值

* **GIVEN** Schema 中定义了 number/integer 类型且有 minimum/maximum 的字段

* **WHEN** 配置面板渲染滑块组件

* **THEN** 在滑块旁边显示当前数值

* **AND** 数值随滑块拖动实时更新

#### Scenario: 数值带单位

* **GIVEN** Schema 中定义了带有单位说明的字段

* **WHEN** 显示滑块数值时

* **THEN** 在数值后显示单位（如：ms、px、%）

### Requirement: 开关组件优化

The system SHALL provide a clean switch component without redundant text labels.

#### Scenario: 简化开关显示

* **GIVEN** Schema 中定义了 boolean 类型的字段

* **WHEN** 配置面板渲染开关组件

* **THEN** 只显示开关本身，不显示"开启/关闭"文字

* **AND** 使用颜色区分状态

## MODIFIED Requirements

### Requirement: 分组视觉样式

The system SHALL use card-style containers for field groups with enhanced visual hierarchy.

#### Scenario: 分组卡片样式

* **GIVEN** 配置面板有多个字段分组

* **WHEN** 渲染分组时

* **THEN** 每个分组使用卡片样式包裹

* **AND** 分组标题使用图标+文字的形式

* **AND** 分组之间有明显的视觉分隔

## REMOVED Requirements

无移除需求。

## 技术实现要点

### 1. 图片列表组件实现

```typescript
// 新增 ImageListWidget 组件
interface ImageListWidgetProps {
  value: Array<{ url: string; alt?: string }>;
  onChange: (value: Array<{ url: string; alt?: string }>) => void;
  maxItems?: number;
}
```

### 2. 滑块数值显示

```typescript
// 修改 Slider 渲染逻辑
<div className="space-y-2">
  <div className="flex items-center gap-2">
    <Slider {...sliderProps} />
    <span className="text-sm font-mono min-w-[60px]">
      {value}{unit}
    </span>
  </div>
</div>
```

### 3. 开关组件简化

```typescript
// 移除 Badge 显示，只保留 Switch
<div className="flex items-center justify-between">
  <Label>{field.title}</Label>
  <Switch 
    checked={value} 
    onCheckedChange={onChange}
    className="data-[state=checked]:bg-green-500"
  />
</div>
```

### 4. 分组卡片样式

```typescript
// 使用 Card 组件包裹分组
<Card className="overflow-hidden">
  <CardHeader className="py-3 px-4 bg-muted/30">
    <div className="flex items-center gap-2">
      <GroupIcon className="w-4 h-4" />
      <CardTitle className="text-sm font-semibold">{group.title}</CardTitle>
      <Badge variant="secondary">{group.fields.length}</Badge>
    </div>
  </CardHeader>
  <CardContent className="p-4 space-y-4">
    {group.fields.map(field => <FieldRenderer ... />)}
  </CardContent>
</Card>
```

## 验收标准

1. **图片列表**

   * [ ] 图片数组正确显示为缩略图网格

   * [ ] 支持添加新图片（输入 URL）

   * [ ] 支持删除已有图片

   * [ ] 图片数量正确显示

2. **滑块数值**

   * [ ] 滑块旁边显示当前数值

   * [ ] 数值随滑块拖动实时更新

   * [ ] 数值显示单位（如 ms、px）

3. **开关优化**

   * [ ] 开关旁边没有"开启/关闭"文字

   * [ ] 开关使用颜色区分状态

   * [ ] 开关切换有平滑动画

4. **视觉层次**

   * [ ] 分组使用卡片样式

   * [ ] 分组标题有图标

   * [ ] 分组之间有明显分隔

5. **测试覆盖**

   * [ ] 新增组件有单元测试

   * [ ] 现有测试用例通过

   * [ ] 手动测试验证通过

