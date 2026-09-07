# 官网与用户手册模块

> 更新日期：2026-09-05

## 文档列表

### 需求文档

| 文档 | 说明 |
| :--- | :--- |
| [官网与用户手册_需求文档.md](./官网与用户手册_需求文档.md) | 管理层业务叙事、当前与未来宣传边界、试点引导、公开手册和导航验收要求 |

### 技术文档

| 文档 | 说明 |
| :--- | :--- |
| [01_路由与内容架构.md](./技术/01_路由与内容架构.md) | 静态首页叙事与路线图、App Router 路由边界、Proxy 鉴权、Markdown 内容模型、渲染安全和 SEO |

## 实现入口

- 官网页面：`packages/author-site/src/app/page.tsx`
- 工作台入口：`packages/author-site/src/app/workbench/page.tsx`
- 手册页面：`packages/author-site/src/app/manual/`
- 手册内容：`packages/author-site/src/content/manual/`
- 官网组件：`packages/author-site/src/components/marketing/`
- 手册组件：`packages/author-site/src/components/manual/`
