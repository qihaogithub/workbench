---
name: page-runtime-conversion
description: 页面运行时类型转换（prototype ↔ high-fidelity-react）的完整规范：以源页面视觉为 ground truth、逐元素还原、禁用 @preview/sdk 通用组件替换、分运行时细则、自检清单。触发词：转换页面运行时、切换为 React 页、切换为原型页、prototype-html-css、high-fidelity-react。仅在用户显式触发运行时切换操作（UI 按钮或命令）时使用，不适用于新建或重写页面。
---

# 页面运行时类型转换

## 核心约束

以源页面当前渲染效果为视觉 ground truth，逐元素逐样式还原。不得擅自用 @preview/sdk 通用组件（Button/Card/Modal/Icon 等）替换源页面自定义视觉。只有源页面的某个视觉效果在当前目标运行时确实无法实现时，才允许替换，并需说明原因。

## prototype → React 转换规范

1. 读取源文件：`prototype.html`、`prototype.css`、`config.schema.json`
2. 理解视觉结构后重写为 `index.tsx`
3. 必须保留的视觉要素：
   - 背景（background-image/color/gradient）
   - 阴影（box-shadow/text-shadow）
   - 圆角、边框全部属性
   - 装饰元素
   - 字体（font-family/size/weight/line-height）
   - 颜色
   - 布局（position/z-index/transform/flex/grid）
   - 资源引用（项目内相对路径，不得丢弃或替换为占位图）
4. 允许用 Tailwind CSS 表达样式，但以视觉还原为准
5. 保留 `prototype.html` 和 `prototype.css` 作为降级备份

## React → prototype 转换规范

1. 读取 `index.tsx` 和 `config.schema.json`
2. 从 React 组件渲染逻辑中提取静态 HTML 结构和内联 CSS
3. 写入 `prototype.html` 和 `prototype.css`
4. 不得包含 script、iframe、远程资源、javascript: 链接、form[action]
5. 必须保留所有视觉要素（同上述清单）

## 文件操作

- 修改前先读目标文件确认当前状态
- 使用 writeFile 写完整文件
- 更新 `workspace-tree.json` 中 `runtimeType` 字段
- 验证 `config.schema.json` 在两个运行时下 schema 兼容（字段名/类型/默认值一致）

## 转换后自检清单

- 目标文件已写入且内容完整
- `workspace-tree.json` 中 `runtimeType` 已更新
- `config.schema.json` 未丢失字段
- 项目内资源引用路径正确
- 未引入脚本/iframe/远程资源违规
