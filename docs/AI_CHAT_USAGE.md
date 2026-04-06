# AI 对话区使用指南

## 🎯 快速开始

### 1. 启动开发服务器

```bash
pnpm dev
```

### 2. 访问编辑页面

- **Demo 编辑页**: `http://localhost:3000/demo/[demo-id]/edit`
- **项目编辑页**: `http://localhost:3000/projects/[project-id]/edit?sessionId=xxx&basedOn=xxx`

## 🧪 测试功能

### Markdown 渲染测试

在 AI 对话中输入以下指令测试 Markdown 功能：

```
请用 Markdown 格式帮我创建一个任务列表：
- [ ] 完成任务一
- [x] 完成任务二
- [ ] 完成任务三

并添加一个表格：
| 功能 | 状态 | 优先级 |
|------|------|--------|
| Markdown | ✅ | 高 |
| 代码高亮 | ✅ | 高 |
```

### 代码块测试

```
请帮我写一个 React 组件示例，包含以下代码：

```tsx
import { useState } from 'react'

export function Counter() {
  const [count, setCount] = useState(0)
  
  return (
    <button onClick={() => setCount(count + 1)}>
      点击次数：{count}
    </button>
  )
}
```
```

### 思考过程测试

某些 Agent 后端（如 Claude、Gemini）会返回思考过程：

1. 发送一个复杂的问题
2. 观察是否出现"思考过程"折叠区域
3. 点击展开查看详细的推理过程

### 工具调用测试

如果 Agent 使用了工具（如文件操作、搜索等），会自动显示工具调用状态：

- 🟡 运行中 - 工具正在执行
- 🟢 已完成 - 工具执行成功
- 🔴 错误 - 工具执行失败
- 🔵 等待确认 - 需要用户确认

## 📸 功能截图说明

### 消息展示

**用户消息**（右侧对齐）:
- 蓝色背景
- 右对齐布局
- 圆角气泡

**AI 消息**（左侧对齐）:
- 灰色背景
- 支持 Markdown 渲染
- 代码块高亮显示
- 悬停显示操作按钮

### 操作按钮

AI 消息悬停时显示：
- 📋 复制 - 复制消息内容
- 👍 点赞 - 正面反馈
- 👎 点踩 - 负面反馈  
- 🔄 重新生成 - 重新生成回复

### 加载状态

**流式响应**:
- 实时显示生成的文本
- Markdown 即时渲染
- 代码块自动高亮

**等待响应**:
- 三点跳动动画
- 紫色渐变头像

### 特殊内容

**思考过程**:
- 可折叠区域
- 显示思考耗时
- 紫色圆点标识

**工具调用**:
- 状态颜色区分
- 参数可展开查看
- 结果可视化

## ⌨️ 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Enter` | 发送消息 |
| `Shift + Enter` | 换行 |

## 🐛 常见问题

### Q: Markdown 没有渲染？
A: 确保 AI 回复中包含标准的 Markdown 语法。streamdown 库会自动处理。

### Q: 代码块没有高亮？
A: 代码块需要使用标准的 Markdown 代码块语法（```language）。

### Q: 流式响应不流畅？
A: 检查 Agent Service 是否正常运行，WebSocket 连接是否稳定。

### Q: 图片无法显示？
A: 检查图片 URL 是否可访问，`allowedImagePrefixes` 配置是否正确。

### Q: 文件下载无法工作？
A: 确保文件 URL 是有效的下载链接。

## 🎨 自定义样式

### 修改消息气泡颜色

编辑 `src/components/ai-elements/message.tsx`:

```tsx
// 用户消息颜色
className={cn(
  'rounded-2xl px-4 py-3 text-sm',
  isUser
    ? 'bg-primary text-primary-foreground' // 修改这里
    : 'bg-muted text-muted-foreground'
)}
```

### 修改思考过程样式

编辑 `src/components/ai-elements/reasoning.tsx`:

```tsx
// 思考过程背景色
<div className="bg-muted/30 border border-muted">
  {/* ... */}
</div>
```

### 添加工具调用主题色

编辑 `src/components/ai-elements/tool.tsx`:

```tsx
const statusConfig = {
  running: {
    color: 'text-yellow-500',  // 修改颜色
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/20',
  },
  // ...
}
```

## 📊 性能优化建议

### 1. 虚拟滚动
如果消息数量很大，建议实现虚拟滚动：

```tsx
import { useVirtualizer } from '@tanstack/react-virtual'

// 在 ConversationContent 中使用
```

### 2. 消息分页
加载历史消息时实现分页：

```tsx
const loadMoreMessages = async () => {
  // 加载更多逻辑
}
```

### 3. 缓存优化
使用 SWR 缓存对话历史：

```tsx
import useSWR from 'swr'

const { data: messages } = useSWR(`/api/chat/${sessionId}`)
```

## 🔐 安全注意事项

### 图片加载安全
- 默认只允许同源图片
- 外部图片需要配置 `allowedImagePrefixes`

### Markdown 安全
- streamdown 默认启用 XSS 防护
- 不要在 Markdown 中渲染用户输入的脚本

### 文件下载安全
- 验证文件 URL 的合法性
- 限制可下载的文件类型

## 🚀 最佳实践

### 1. 初始化 Agent 会话
```tsx
// 在页面加载时创建 Agent 会话
useEffect(() => {
  const initAgentSession = async () => {
    const agentClient = getAgentClient()
    const sessionId = `demo-${demoId}-${Date.now()}`
    setAgentSessionId(sessionId)
  }
  initAgentSession()
}, [demoId])
```

### 2. 处理代码更新
```tsx
// 监听 AI 回复中的代码块
const handleCodeUpdate = (newCode: string) => {
  setCode(newCode)
  // 同步到编辑器
  setEditorContent(buildFigmaText(newCode, schema))
}
```

### 3. 追踪文件变更
```tsx
// 实时显示文件变更
const handleFilesChange = (files) => {
  setFileChanges(files.length)
  // 可以在这里更新文件列表 UI
}
```

## 📞 获取帮助

- 查看 [优化总结文档](./AI_CHAT_OPTIMIZATION.md)
- 查看 [AGENTS.md](../../AGENTS.md) 了解项目架构
- 在 GitHub Issues 中提问

---

**最后更新**: 2026年4月6日
