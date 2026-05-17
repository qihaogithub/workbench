# 嵌入 API - 需求文档

> 版本：v1.0
> 更新日期：2026-05-17

---

## 1. 概述

### 1.1 背景与目标

创作端提供嵌入 API 接口，允许外部系统通过 iframe 方式将创作端开发的 Demo 组件嵌入到自身业务系统中，实现组件的即插即用。

### 1.2 核心能力

- **一键嵌入**：通过 iframe src 即可快速嵌入 Demo 组件
- **配置驱动**：支持通过 Schema 配置组件属性
- **双向通信**：支持父页面与 iframe 的实时通信
- **样式隔离**：iframe 沙箱环境确保样式不污染

---

## 2. 功能需求

### 2.1 嵌入模式

#### 2.1.1 Demo 嵌入

外部系统通过指定 Demo ID 获取嵌入代码：

```
GET /embed/{demoId}
```

返回嵌入页面，包含：
- 嵌入代码片段（iframe 代码）
- 实时预览区域

#### 2.1.2 iframe 内容服务

```
GET /embed/{demoId}/iframe
```

返回完整的 HTML 文档，包含：
- React 运行时（CDN 加载）
- 编译后的组件代码
- 配置数据
- 通信脚本

#### 2.1.3 项目级嵌入

```
GET /api/embed/{projectId}
```

支持嵌入整个项目，支持：
- 指定页面（`?page=xxx`）
- 多页面项目
- 项目级 + 页面级 Schema 合并

### 2.2 通信协议

#### 2.2.1 父页面 → iframe

| 消息类型 | 说明 | 数据结构 |
|:---------|:-----|:---------|
| `UPDATE_CODE` | 更新组件代码 | `{ type, code, configData, cssImports }` |
| `UPDATE_CONFIG` | 更新配置数据 | `{ type, configData }` |

#### 2.2.2 iframe → 父页面

| 消息类型 | 说明 | 数据结构 |
|:---------|:-----|:---------|
| `READY` | iframe 就绪 | `{ type }` |
| `LOADED` | 组件加载成功 | `{ type }` |
| `RESIZE` | 高度变化 | `{ type, height }` |
| `RUNTIME_ERROR` | 运行时错误 | `{ type, error, stack? }` |

### 2.3 运行时能力

#### 2.3.1 自动高度调整

使用 ResizeObserver 监听 body 高度变化，自动通知父页面调整 iframe 高度。

#### 2.3.2 错误边界

- React ErrorBoundary 捕获组件渲染错误
- window.onerror 捕获全局脚本错误
- unhandledrejection 捕获未处理的 Promise 错误

所有错误统一通过 `RUNTIME_ERROR` 消息上报给父页面。

#### 2.3.3 CDN 依赖

默认使用 jsDelivr CDN 加载：
- React 18.3.1
- ReactDOM 18.3.1
- Tailwind CSS 3.4.10

---

## 3. 非功能需求

### 3.1 性能要求

- iframe 内容缓存：5 分钟（`Cache-Control: public, max-age=300`）
- 组件热更新：无需刷新页面

### 3.2 安全性

- iframe sandbox 属性：`allow-scripts allow-same-origin`
- 消息来源校验：`event.source !== window.parent`
- 不允许跨域访问

### 3.3 兼容性

- 目标浏览器：Chrome 90+、Firefox 90+、Safari 15+
- ES2017+ 语法支持

---

## 4. 使用流程

### 4.1 嵌入 Demo 步骤

1. 访问 `/embed/{demoId}` 获取嵌入代码
2. 将 iframe 代码复制到目标页面
3. 可选：配置 postMessage 监听处理通信

### 4.2 代码示例

```html
<iframe
  src="https://your-domain/embed/demo-123/iframe"
  sandbox="allow-scripts allow-same-origin"
  style="width: 100%; border: none;"
  id="demo-iframe"
/>

<script>
  const iframe = document.getElementById('demo-iframe');

  // 监听 iframe 消息
  window.addEventListener('message', (event) => {
    switch (event.data.type) {
      case 'READY':
        console.log('Demo 已就绪');
        break;
      case 'LOADED':
        console.log('组件加载成功');
        break;
      case 'RESIZE':
        iframe.style.height = event.data.height + 'px';
        break;
      case 'RUNTIME_ERROR':
        console.error('运行时错误:', event.data.error);
        break;
    }
  });

  // 动态更新组件代码（如需要）
  iframe.contentWindow.postMessage({
    type: 'UPDATE_CODE',
    code: 'export default function() { return <div>New Version</div> }',
    configData: {},
    cssImports: []
  }, '*');
</script>
```

---

## 5. 错误处理

### 5.1 错误码

| 错误信息 | HTTP 状态码 | 说明 |
|:---------|:------------|:-----|
| Demo not found | 404 | Demo 不存在 |
| Component code not found | 404 | 组件代码文件缺失 |
| No demo pages found | 404 | 项目中没有 Demo 页面 |
| Schema 字段冲突 | 400 | 项目级与页面级 Schema 存在同名字段 |
| Internal error | 500 | 服务器内部错误 |

### 5.2 运行时错误

运行时错误通过 `RUNTIME_ERROR` 消息类型上报，包含：
- `error`：错误消息
- `stack`：错误堆栈（可选）

---

## 6. 未来扩展

- [ ] 支持 Web Components 封装
- [ ] 支持更多 CDN 提供商（unpkg、skypack）
- [ ] 支持自定义主题切换
- [ ] 支持权限控制（Token 校验）
