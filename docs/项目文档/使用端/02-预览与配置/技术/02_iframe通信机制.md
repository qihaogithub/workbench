# iframe 通信机制 - 实现设计

> 版本：v1.0
> 创建日期：2026-05-04

---

```yaml
covers:
  - packages/viewer-site/src/components/iframe-renderer.tsx
```

---

## 一、通信协议

使用端与 iframe 之间通过 `window.postMessage` 进行单向通信。使用端仅发送 `UPDATE_CONFIG` 消息，将配置面板的变更推送到 iframe 中的创作端嵌入页面。

### 1.1 消息格式

```json
{
  "type": "UPDATE_CONFIG",
  "payload": {
    "config": { "key1": "value1", "key2": 42 }
  }
}
```

### 1.2 消息类型说明

| 消息类型 | 方向 | 说明 |
|:---------|:-----|:-----|
| `UPDATE_CONFIG` | 使用端 → iframe | 配置变更时发送，payload 为完整配置对象 |

> 创作端嵌入页面支持的全部消息类型，请见 [创作端预览系统需求文档](../../创作端/04-配置与预览/预览系统_需求文档.md)。

## 二、iframe 渲染器设计

IframeRenderer 是一个受控组件，接收三个 props：

| Prop | 类型 | 说明 |
|:-----|:-----|:-----|
| `src` | `string` | iframe 的 URL，指向创作端嵌入端点 |
| `config` | `Record<string, unknown>` | 当前配置数据 |
| `className` | `string?` | 可选的样式类名 |

### 2.1 渲染流程

1. 组件挂载 → 创建 iframe 元素，设置 `src` 属性
2. iframe 加载完成（`onLoad` 事件）→ 标记为就绪状态
3. 配置变更 → 通过 `postMessage` 发送 `UPDATE_CONFIG` 消息
4. 页面切换 → 更新 `src`，iframe 重新加载

### 2.2 消息发送策略

- **首次发送**：iframe 加载完成后，立即发送当前配置
- **增量发送**：配置面板每次变更时，发送完整配置对象（非增量 diff）
- **目标窗口**：`iframeRef.current.contentWindow`，需确保 iframe 已加载

### 2.3 安全约束

- iframe 设置 `sandbox="allow-scripts allow-same-origin"` 属性
- `postMessage` 的 `targetOrigin` 使用创作端的实际域名（非 `*`）
- iframe URL 使用 `http://localhost:3200` 或环境变量配置的地址

## 三、URL 生成规则

iframe 的 URL 由 API 客户端的 `getEmbedIframeUrl()` 函数生成：

```
{NEXT_PUBLIC_WEB_URL}/embed/{projectId}/{demoId}
```

- `projectId`：从 URL 参数获取
- `demoId`：当前选中的 Demo 页面 ID，默认为项目第一个页面

当使用者切换 Demo 页面时，iframe 的 `src` 属性更新，触发页面重新加载。
