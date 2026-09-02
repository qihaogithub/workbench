---
name: page-runtime-conversion
description: 页面运行时类型转换（prototype ↔ high-fidelity-react）的完整规范：以源页面视觉为 ground truth、逐元素还原、禁用 @preview/sdk 通用组件替换、分运行时细则、自检清单，并保留业务配置联动区域声明。触发词：转换页面运行时、切换为 React 页、切换为原型页、prototype-html-css、high-fidelity-react，或原型页新增必须由 React 消费的复合配置。仅在既有页面需要转换时使用，不适用于新建或重写页面。
---

# 页面运行时类型转换

除用户显式要求切换运行时外，当 `page-lifecycle` 规则要求原型页为复合配置（如 `format: "video"`）升级为 React 页时，也必须使用本规范。这是完成用户已明确配置诉求的必要实现步骤，不构成额外的审批理由。

## 核心约束

转换不得删除配置字段的 `ui:options.configType` / `$demo.configType` 语义，也不得移除源码中的稳定 `data-region-id`。跨页面可见性继续由项目根 `project.visibility-rules.json` 驱动。

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

### Spine 复合配置

- Spine 只能使用单个 `format: "spine"` 的原子素材字段，上传 `.zip` 或 Flutter 导出的 `.zip.flutter`；不得生成 `skeleton`、`atlas`、`texture` 三个独立上传字段，也不得使用 `type: "string" + format: "file" + accept: ".zip"`。
- 页面运行时使用 `<SpinePlayer src={spineAsset} animation={spineAnimation} loop={spineLoop} audioEnabled={spineAudioEnabled} />`。未上传时 `spineAsset` 保持缺失并使用页面 fallback；压缩包内的音频会由 Spine event 自动播放，三个文件 URL 是上传服务解析后的内部结果，不能写入作者 schema、值或源码。
