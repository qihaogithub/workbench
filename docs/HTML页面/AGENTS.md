# 单 HTML 改造项目

本项目将原有的 Vue 组件化项目改造为单 HTML 文件结构，每个页面都是独立的 HTML 文件，便于 AI 编程时的增删改操作。项目基于 DaisyUI 和 Tailwind CSS，所有资源通过 CDN 引入，无本地文件依赖。

## 文件结构

```
单HTML改造/
├── square.html           # 广场页面
├── bottom-pop-up.html    # 底部弹窗页面
├── pop-up.html           # 通用弹窗页面
├── after-class.html      # 课后服务页面
├── bandu-ad.html         # 伴读广告页面
├── mine.html             # 我的页面
├── task-card.html        # 任务卡片页面
├── kuoke.html            # 扩科页面
├── niankexuefei.html     # 年课续费页面
├── 单HTML改造项目文档.md  # 项目改造方案文档
├── README.md             # 项目说明文档
└── square.html           # 广场页面
```

## 技术架构

- **CSS 框架**: Tailwind CSS + DaisyUI
- **组件库**: DaisyUI (纯 CSS 组件，无 JS 依赖)
- **资源引入**: CDN (无本地依赖)
- **开发方式**: 单 HTML 文件 (所有代码在一个文件内)

## 开发规范

### DaisyUI 类名使用规范

- 所有输入组件使用 `input-bordered`
- 所有选择组件使用 `select-bordered`
- 所有复选框使用 `checkbox-bordered` (如果存在)
- 所有文件上传使用 `file-input-bordered`
- 所有文本域使用 `textarea-bordered`
- 所有按钮使用 `btn-bordered` (如需要)

### 样式规范

- 所有 CSS 写在 `<style>` 标签内
- 全局统一样式包括间距、字体、颜色等
- 使用 Tailwind CSS 和 DaisyUI 的类名系统
- 避免使用自定义 CSS 类名，优先使用 DaisyUI 提供的样式

## 功能实现

- 资源管理: 使用 `<input type="file">` 和 JavaScript 实现
- 图片预览: 使用 FileReader API 实现
- 图片验证: 通过 JavaScript 验证尺寸要求
- 事件处理: 使用 JavaScript 原生事件系统
- 响应式设计: 使用 Tailwind CSS 的响应式类名

## AI 编程友好性

1. 单文件结构：AI 可以直接处理整个页面的所有内容
2. 无依赖：无需考虑模块导入导出
3. 标准化：使用标准 HTML/CSS/JS，AI 更容易理解
4. 组件化：虽然在单文件内，但保持组件化的逻辑结构

## 部署方式

- 直接上传 HTML 文件到静态服务器
- 支持 CDN 分发
- 无需构建步骤
- 即传即用