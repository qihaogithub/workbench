# ACP 协议消息处理

> 从历史开发文档中提取的 ACP 协议相关经验

---

## 一、消息类型映射

ACP 协议到 WebSocket 事件的完整映射关系：

| ACP 事件 | WebSocket 事件 | 用途 |
|---------|---------------|------|
| `agent_message_chunk` | `stream` | Agent 回复文本 |
| `agent_thought_chunk` | `thought` | Agent 思考过程 |
| `tool_call` | `tool_call` | 工具调用开始 |
| `tool_call_update` | `tool_call_update` | 工具调用状态更新 |
| `session/request_permission` | `permission_request` | 权限请求 |
| `fs/read_text_file` | `file_operation` | 文件读取通知 |
| `fs/write_text_file` | `file_operation` | 文件写入通知 |

**关键发现**：`agent-service` 层已完整实现 ACP→WebSocket 转换，前端问题通常是**未消费已存在的事件**。

---

## 二、前端消息聚合策略

一条完整的 Assistant 消息可能包含多个事件，需要动态聚合：

```
[thought] → [tool_call] → [tool_call_update] → [stream] → [finish]
```

**聚合规则**：
- `thought` 事件 → 累积到 `reasoning.content`
- `tool_call` 事件 → 添加到 `tools` 数组，状态 `'running'`
- `tool_call_update` 事件 → 更新对应 tool 状态（`'completed'` 或 `'error'`）
- `stream` 事件 → 累积到 `content`
- `finish` 事件 → 完成消息并添加到消息列表

---

## 三、工具调用状态映射

| ACP 原始状态 | UI 状态 | 说明 |
|-------------|---------|------|
| `pending` | `running` | 等待执行 |
| `in_progress` | `running` | 执行中 |
| `completed` | `completed` | 执行成功 |
| `failed` | `error` | 执行失败 |

---

## 四、工具调用语义化

将原始 JSON 参数转换为用户友好的展示：

| 工具类型 | 语义化标签 | 图标 |
|---------|-----------|------|
| `read` | 📖 读取文件 | FileText |
| `write` | ✍️ 写入文件 | FileEdit |
| `edit` | ✏️ 编辑代码 | Code |
| `execute/bash` | ⚡ 执行命令 | Terminal |
| `search` | 🔍 搜索内容 | Search |
| `glob` | 📁 查找文件 | FolderSearch |

---

## 五、Timeline 时间轴组件设计

将 Agent 的"思考→工具调用→观察结果→再次思考"过程组织为时间轴：

```tsx
<Timeline title="处理过程">
  <TimelineItem status="completed" icon={Brain}>
    第一次思考...
  </TimelineItem>
  <TimelineItem status="completed" icon={FileText}>
    读取文件 config.js
  </TimelineItem>
  <TimelineItem status="error" icon={Terminal}>
    执行命令失败：路径不存在
  </TimelineItem>
  <TimelineItem status="completed" icon={Brain}>
    第二次思考（修复方案）...
  </TimelineItem>
</Timeline>
```

---

## 六、多次独立思考支持

当 Agent 进行多轮迭代时，将思考过程分割为独立条目：

```typescript
// 分割策略：当最后一个 reasoning 超过 500 字符时，创建新条目
if (lastReasoning.content.length > 500) {
  reasonings.push({ content: '', timestamp: Date.now() });
} else {
  lastReasoning.content += event.content;
}
```
