---
kind: frontend_style
name: 基于 Tailwind CSS + shadcn/ui 的原子化样式体系
slug: frontend_style
category: frontend_style
scope:
    - '**'
---

## 系统概述
Workbench 采用 **Tailwind CSS + shadcn/ui** 作为统一的前端样式方案，配合 Radix UI 无头组件与 class-variance-authority (CVA) 实现可组合、可主题化的原子化样式体系。所有前端站点（author-site、viewer-site）共享同一套设计令牌与组件约定。

## 核心架构
- **CSS 框架**: Tailwind CSS v4，通过 `postcss.config.js` 启用 tailwindcss + autoprefixer
- **组件库**: shadcn/ui 源码级集成，每个站点在 `src/components/ui/` 下维护一份可定制的组件副本
- **变体引擎**: class-variance-authority (`cva`) 管理组件 variant/size 状态
- **工具函数**: `@/lib/utils.ts` 中的 `cn()` 合并 className，避免重复类名冲突
- **主题系统**: CSS 自定义属性（HSL 值）定义语义化设计令牌，通过 `darkMode: 'class'` 切换明暗主题
- **动画插件**: `tailwindcss-animate` 提供 accordion/collapsible 等基础动画

## 关键文件与位置
- 作者站点配置: `packages/author-site/tailwind.config.ts`, `packages/author-site/postcss.config.js`
- 预览站点配置: `packages/viewer-site/tailwind.config.ts`, `packages/viewer-site/postcss.config.js`
- 全局样式入口: `packages/author-site/src/app/globals.css`, `packages/viewer-site/src/app/globals.css`
- 基础组件: `packages/author-site/src/components/ui/*.tsx`（button/dialog/select 等 26 个组件）
- 设计令牌: `globals.css` 中 `:root` 下的 HSL 变量（background/foreground/primary/accent 等）

## 设计令牌规范
所有颜色使用 HSL 格式并通过 CSS 变量暴露：
- 语义色: `--background`, `--foreground`, `--primary`, `--secondary`, `--accent`, `--destructive`
- 中性色: `--muted`, `--muted-foreground`
- 边框与输入: `--border`, `--input`, `--ring`
- 容器色: `--card`, `--card-foreground`, `--popover`, `--popover-foreground`
- 圆角: `--radius` 控制统一圆角尺度

## 样式隔离策略
针对预览 iframe 场景，实现了四层防御的 `.preview-scope` 样式隔离体系：
1. 安全回退：设置 `color-scheme: normal` 让 AI Demo 自主决定主题
2. 显式重置：覆盖继承自 body 的关键 CSS 属性
3. 变量重写：将 shadcn/ui 核心 CSS 变量恢复为浅色默认值
4. Portal 兜底：对 `[data-radix-popper-content-wrapper]` 单独处理
支持通过 `.preview-scope--dark` 类切换深色模式。

## 开发者约定
- 组件必须通过 `cva` 定义变体，禁止硬编码样式类
- 使用 `cn()` 合并 className，确保变体与外部传入类正确合并
- 通过 `@/components/ui/*` 引用基础组件，禁止直接引入第三方 UI 库
- 主题色必须使用 CSS 变量映射的语义类（如 `bg-primary`），禁止硬编码颜色值
- 新增组件需遵循 shadcn/ui 组件结构，包含完整的 variant/size 定义
- 预览区内容需包裹在 `.preview-scope` 容器中以保证样式隔离