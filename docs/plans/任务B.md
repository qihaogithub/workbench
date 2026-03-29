## 🤖 任务 B：应用全局路由与核心布局（前端骨架）
**目标**：搭建 Next.js 前端骨架，完成路由导航和“首页 Demo 管理”的视图。
**前置说明**：API 尚未完成时，请使用 Mock 数组代替 `/api/demos` 的返回值。

### 1. 核心职责
*   **前端基建**：安装配置 Tailwind CSS, `shadcn/ui` 组件库（需包含 Button, Card, Dialog, Input, Toast 等基础组件）。
*   **路由结构**：
    *   `/`：首页（Demo 列表管理）。
    *   `/demo/[id]`：Demo 使用页面（占位，提供给任务C）。
    *   `/demo/[id]/edit`：AI 编辑工作台（占位，提供给任务D）。
*   **首页功能开发**：
    *   基于 Grid 布局的 Demo 卡片列表（显示名称、缩略图占位、更新时间）。
    *   顶部搜索栏（按 Demo 名称过滤）。
    *   新建 Demo 对话框（点击调用 Mock API，并路由跳转至 `/demo/[新建id]/edit`）。
    *   卡片操作菜单：使用、编辑、删除（删除需二次确认）。

### 2. DoD (完成标准)
*   所有路由跳转正常，页面 Layout（包含统一 Header、返回面包屑）渲染正常。
*   UI 还原现代化体验，响应式布局。
*   封装了对 `/api/demos` 的请求 Hooks（如使用 SWR 或 React Query），支持传入 mock fetcher。
