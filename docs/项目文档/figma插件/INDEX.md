# Figma 插件模块索引

> **模块路径**: `figma-plugin/`
> **模块职责**: 将 Figma 设计稿转化为 DSLP 协议的 React 代码

---

## 📋 文档导航

### 需求文档
| 文档 | 说明 |
|------|------|
| [Figma插件.md](./Figma插件.md) | 产品需求文档 (PRD) - 功能定义与业务规则 |

### 技术实现文档
| 文档 | 覆盖范围 | 说明 |
|------|----------|------|
| [技术/Figma插件架构.md](./技术/Figma插件架构.md) | `apps/plugin/*`, `packages/types/*` | 插件整体架构与通信机制 |
| [技术/UI组件与交互.md](./技术/UI组件与交互.md) | `packages/plugin-ui/src/*` | 插件界面组件与状态管理 |
| [技术/代码生成引擎.md](./技术/代码生成引擎.md) | `packages/backend/src/*` | 核心代码生成逻辑，HTML/Tailwind 双引擎 |
| [技术/标记系统.md](./技术/标记系统.md) | `packages/plugin-ui/src/components/PreviewToolbar.tsx`, `TaggingPanel.tsx` | DSLP 标记解析与应用 |
| [技术/资源处理与上传.md](./技术/资源处理与上传.md) | `packages/backend/src/common/images.ts`, `r2-asset-worker/*` | 图片导出、R2 上传、CDN 管理 |
| [技术/Figma插件-警告说明文档.md](./技术/Figma插件-警告说明文档.md) | - | 设计师版警告说明与优化建议 |

---

## 🏗️ 模块架构概览

```
figma-plugin/
├── apps/
│   ├── debug/              # 调试用的 Next.js 应用
│   └── plugin/             # Figma 插件主程序
│       ├── plugin-src/     # 插件主线程代码 (code.ts)
│       └── ui-src/         # 插件 UI 代码 (React)
├── packages/
│   ├── backend/            # 代码生成核心引擎
│   │   ├── src/html/       # HTML 代码生成器
│   │   ├── src/tailwind/   # Tailwind/React 代码生成器
│   │   ├── src/common/     # 通用工具与转换逻辑
│   │   └── src/altNodes/   # Figma 节点转换
│   ├── plugin-ui/          # UI 组件库
│   │   ├── src/components/ # React 组件
│   │   ├── src/lib/        # 工具函数（优化建议等）
│   │   └── src/PluginUI.tsx # 主容器
│   └── types/              # TypeScript 类型定义
├── r2-asset-worker/        # Cloudflare Worker 资源上传服务
└── manifest.json           # Figma 插件清单
```

---

## 🔗 关联模块

- **[创作端](../创作端/)** - 接收生成的 React 代码进行 AI 处理与预览
- **[使用端](../使用端/)** - 预览生成的 Demo 效果

---

## 📝 最近更新

| 日期 | 更新内容 |
|------|----------|
| 2026-05-11 | 全面更新技术文档：修正文件路径、补充 PreviewToolbar/优化建议/预览锁定/代码格式切换等新功能 |
| 2026-02-23 | 更新 PRD/标记系统/代码生成引擎文档，补充 Props 自动生成与"未生成 Props"排查说明 |
| 2026-02-23 | 建立模块索引，拆分技术实现文档 |
