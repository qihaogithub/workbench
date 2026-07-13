---
kind: frontend_style
name: Tailwind + CSS 变量主题体系与 shadcn/ui 组件库
category: frontend_style
scope:
    - '**'
source_files:
    - packages/author-site/tailwind.config.ts
    - packages/viewer-site/tailwind.config.ts
    - packages/sketch-playground/tailwind.config.ts
    - packages/author-site/postcss.config.js
    - packages/viewer-site/postcss.config.js
    - packages/author-site/src/app/globals.css
    - packages/viewer-site/src/app/globals.css
    - packages/author-site/src/components/ui/button.tsx
    - packages/author-site/src/components/ui/dialog.tsx
    - packages/author-site/src/components/ui/select.tsx
    - packages/author-site/src/components/ui/toast-provider.tsx
---

## 1. 系统/方法概述
- 样式框架：全仓库统一采用 Tailwind CSS，通过 PostCSS（tailwindcss + autoprefixer）在 Next.js App Router 项目中编译。
- 主题方案：基于 CSS 自定义属性（CSS Variables）的 HSL 色板，所有语义化颜色、圆角等通过 :root 下的 --background、--foreground、--primary、--radius 等变量集中管理，实现暗色默认主题与可切换能力。
- 组件库：以 shadcn/ui 风格自建基础 UI 组件集，位于各包的 src/components/ui 目录，按原子功能拆分为独立文件（button、dialog、select、toast 等），并通过 Tailwind 类名组合复用。
- 动画与动效：使用 tailwindcss-animate 插件提供 accordion/collapsible 等通用动画，配合 @keyframes 自定义业务动效（如 logo 光泽、AI 工作点矩阵）。

## 2. 关键文件与包
- 站点级配置
  - packages/author-site/tailwind.config.ts：作者站 Tailwind 主题扩展、content 扫描范围、动画 keyframes 与 animation 映射。
  - packages/viewer-site/tailwind.config.ts：预览端 Tailwind 配置，与 author-site 保持色板一致。
  - packages/sketch-playground/tailwind.config.ts：Playground 轻量配置，仅覆盖必要语义色。
  - packages/*/postcss.config.js：统一启用 tailwindcss + autoprefixer。
- 全局样式入口
  - packages/author-site/src/app/globals.css：定义 :root 暗色主题变量、.preview-scope 隔离层、Streamdown 表格/代码块覆盖、Prism 高亮主题、Markdown 编辑器排版等。
  - packages/viewer-site/src/app/globals.css：复用同一套 CSS 变量，保证预览端与创作端视觉一致。
- 基础 UI 组件（shadcn 风格）
  - packages/author-site/src/components/ui/*.tsx：button、card、dialog、select、toast、tooltip、tabs、switch、slider、badge、avatar、separator、skeleton、resizable、scroll-area、input、label、textarea、toggle、collapsible、popover、dropdown-menu、alert、chat-bubble 等。
  - packages/viewer-site/src/components/ui/*.tsx：精简版 UI 组件集合，与 author-site 保持一致 API。

## 3. 架构与约定
- 设计令牌（Design Tokens）
  - 所有颜色、圆角、阴影等视觉常量均以 hsl(var(--xxx)) 形式消费，禁止在组件中硬编码具体色值；主题切换只需修改 :root 下变量。
  - 圆角通过 --radius 派生 lg/md/sm 三级，确保一致性。
- 主题模式
  - darkMode: ['class'] 配合 data-theme/theme 属性或 .preview-scope--dark 类切换明暗主题。
  - 预览沙箱通过 .preview-scope 重置并注入浅色默认变量，使 AI 生成的 Demo 内容不受宿主暗色主题污染，同时支持显式深色模式。
- 样式作用域与隔离
  - 预览区采用四层防御策略：color-scheme 回退 → 关键继承属性 reset → shadcn 变量中性覆盖 → 布局属性强制，避免第三方/用户代码破坏宿主样式。
  - Streamdown 渲染产物通过 [data-streamdown="*"] 选择器精准覆盖，不侵入全局。
- 组件组织
  - 基础 UI 组件遵循 shadcn 单文件导出模式，每个组件一个 .tsx，内部仅依赖 Tailwind 类名与 React props，无额外 CSS 文件。
  - 业务组件放在 components/<domain>/ 下，组合基础 UI 组件完成页面级逻辑。
- 构建与扫描
  - Tailwind content 明确声明扫描路径，包含本地 src/**、共享包 @workbench/shared、@workbench/demo-ui 以及 streamdown 相关依赖，确保动态类名被正确生成。

## 4. 开发者应遵守的规则
- 颜色与尺寸一律通过 Tailwind 语义类（bg-background、text-foreground、rounded-lg 等）或 CSS 变量引用，禁止直接写十六进制色值。
- 新增主题色时，先在 globals.css 的 :root 中定义新变量，再在 tailwind.config.ts 的 extend.colors 中暴露语义别名。
- 为预览沙箱编写样式时，优先使用 .preview-scope 内的局部规则，避免影响宿主应用。
- 基础 UI 组件必须保持纯 Tailwind 驱动，新增交互效果优先复用 tailwindcss-animate 提供的 keyframe，必要时在 globals.css 中以 @layer utilities 追加。
- 禁止在原型页中使用 @import 引入外部 CSS（平台已在 preview-validation 与 project-core 中做安全拦截），如需全局样式应在项目内聚合后由构建流程处理。
- 跨包复用的样式逻辑应下沉到 @workbench/shared 或 @workbench/demo-ui，并在各站点 tailwind.config.ts 的 content 中纳入扫描范围。