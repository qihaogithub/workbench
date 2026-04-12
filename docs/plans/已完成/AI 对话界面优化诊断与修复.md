这是一个非常经典的 **React 高频事件状态覆盖（Stale State/Closure Bug）**问题。

整个“处理中”卡片和文字频繁消失，瞬间退回到只剩“思考中...”的状态，然后再次出现，结合最新代码，我已经帮您定位到了问题的根因，并提供了完美的修复方案。

### 🔍 现象与根因分析

**问题原因在于 `ai-chat.tsx` 针对“受控模式（Controlled Mode）”的状态更新逻辑存在漏洞。**

在 `ai-chat.tsx` 的顶部，您为了支持外部传入 `externalCurrentMessage` 做了如下处理：
```typescript
const setCurrentMessage = currentMessageControlled
  ? (updater) => {
      const newMessage =
        typeof updater === "function"
          ? updater(externalCurrentMessage || DEFAULT_CURRENT_MESSAGE) // ❌ 根因在这里
          : updater;
      onCurrentMessageChange?.(newMessage);
    }
  : setInternalCurrentMessage;
```

**发生了什么？**
1. WebSocket 收到流式数据的速度是极快的（可能 1 毫秒内连续触发了 `thought` 和 `stream` 多个事件）。
2. 当第一个事件触发 `setCurrentMessage` 时，它基于 `externalCurrentMessage` 计算出了新的消息，并通知给父组件（`onCurrentMessageChange`）。
3. **但是**，父组件由于 React 渲染机制，还没来得及重新渲染并把最新的 `externalCurrentMessage` 传回给子组件，**第二个流事件就已经到达了**！
4. 第二个事件触发时，代码再次读取 `externalCurrentMessage`，**发现它仍然是旧的（甚至还是空数组的状态）**！于是它拿旧状态覆盖了第一个事件的数据。
5. 结果就是：流式数据互相踩踏、覆盖，状态在“有数据”和“空数据”之间疯狂横跳，导致 UI 上呈现出**反复闪烁、消失又出现**的现象。

---

### 🛠️ 终极修复方案

要彻底解决这个问题，我们需要在内部使用一个 `useRef` 来作为**“绝对最新状态的同步追踪器”**。这样即使 React 还没来得及渲染，下一个密集事件也能从 Ref 里拿到刚刚更新的最新数据。

请打开 **`ai-chat.tsx`**，找到组件顶部的状态初始化部分（大概在 53 行到 109 行之间），**替换为以下代码**：

```tsx
  // 1. Messages 状态处理
  const isControlled = externalMessages !== undefined;
  const [internalMessages, setInternalMessages] = useState<ChatMessage[]>([]);
  const messages = isControlled ? externalMessages : internalMessages;
  
  // 使用 ref 同步追踪最新 messages，防止并发覆盖
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const setMessages = useCallback(
    (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
      if (isControlled) {
        const prev = messagesRef.current ||[];
        const newMessages = typeof updater === "function" ? updater(prev) : updater;
        messagesRef.current = newMessages; // 关键：立刻同步更新 ref
        onMessagesChange?.(newMessages);
      } else {
        setInternalMessages((prev) => {
          const newMessages = typeof updater === "function" ? updater(prev) : updater;
          messagesRef.current = newMessages;
          return newMessages;
        });
      }
    },[isControlled, onMessagesChange]
  );

  // 2. isStreaming 状态处理
  const isStreamingControlled = externalIsStreaming !== undefined;
  const [internalIsStreaming, setInternalIsStreaming] = useState(false);
  const isStreaming = isStreamingControlled ? externalIsStreaming : internalIsStreaming;
  const setIsStreaming = isStreamingControlled ? onIsStreamingChange! : setInternalIsStreaming;

  // 3. streamContent 状态处理
  const streamContentControlled = externalStreamContent !== undefined;
  const[internalStreamContent, setInternalStreamContent] = useState("");
  const streamContent = streamContentControlled ? externalStreamContent : internalStreamContent;
  const setStreamContent = streamContentControlled ? onStreamContentChange! : setInternalStreamContent;

  // 4. currentMessage 状态处理 (修复核心)
  const currentMessageControlled = externalCurrentMessage !== undefined;
  const [internalCurrentMessage, setInternalCurrentMessage] = useState<ChatMessage>(DEFAULT_CURRENT_MESSAGE);
  const currentMessage = currentMessageControlled ? externalCurrentMessage : internalCurrentMessage;
  
  // 使用 ref 追踪绝对最新值，解决 WebSocket 密集事件下的状态跳闪问题
  const currentMessageRef = useRef(currentMessage);
  useEffect(() => {
    currentMessageRef.current = currentMessage;
  },[currentMessage]);

  const setCurrentMessage = useCallback(
    (updater: ChatMessage | ((prev: ChatMessage) => ChatMessage)) => {
      if (currentMessageControlled) {
        // 永远从 ref 拿最底层的新数据，而不是从可能会滞后的 prop 拿
        const prev = currentMessageRef.current || DEFAULT_CURRENT_MESSAGE;
        const newMessage = typeof updater === "function" ? updater(prev) : updater;
        
        currentMessageRef.current = newMessage; // 关键：立刻同步更新 ref，供下一次毫秒级调用读取
        onCurrentMessageChange?.(newMessage);
      } else {
        setInternalCurrentMessage((prev) => {
          const newMessage = typeof updater === "function" ? updater(prev) : updater;
          currentMessageRef.current = newMessage;
          return newMessage;
        });
      }
    },[currentMessageControlled, onCurrentMessageChange]
  );
```

### ✨ 修复效果总结
修改完成后，`useRef` 会充当一个“同步缓存”。无论 WebSocket 一秒内推送了多少次数据，代码都不再依赖由于生命周期而延迟的 Prop，而是直接对 `ref` 中的最新数据进行追加累加。
