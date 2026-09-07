# Whiteboard Studio

白板的独立开发宿主。它只依赖 `@workbench/sketch-core` 和
`@workbench/sketch-react`，不会读取创作端项目数据、登录会话或白板回填 API。
Studio 与配置图片白板对话框都通过 `SketchEditorSurface` 使用同一套可编辑
工作区，并统一使用 `profile="whiteboard"`；两者只在工作区外的页面外壳、尺寸和提交动作上有所不同。Studio 首次布局自动适配内容，宿主可通过共享视口参数恢复手动缩放和平移。

## 启动

```bash
pnpm dev:whiteboard
```

默认访问 `http://localhost:3400`。`pnpm dev:sketch` 是保留的同义命令。

## 职责边界

- 本应用：共享 `SketchEditorSurface` 的 fixtures、完整编辑器、Scene/配置数据调试和性能基线。
- `@workbench/sketch-core`：白板文档协议、几何、操作与只读渲染。
- `@workbench/sketch-react`：可嵌入的编辑器 UI 与交互状态。
- `@workbench/author-site`：仅负责项目内入口、白板 document/binding 持久化、PNG 导出和配置回填。

白板交互或性能优化应先在本应用完成验证；只有宿主尺寸、写回和权限相关问题才回到创作端编辑页处理。
