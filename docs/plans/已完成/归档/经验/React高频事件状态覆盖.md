# React 高频事件状态覆盖 Bug

> 从历史开发文档中提取的 React 状态管理经验

---

## 一、问题现象

WebSocket 收到流式数据时，UI 出现**反复闪烁、消失又出现**的现象。

---

## 二、根因分析

**受控模式（Controlled Mode）的状态更新漏洞**：

```tsx
// ❌ 错误写法
const setCurrentMessage = currentMessageControlled
  ? (updater) => {
      const newMessage = typeof updater === "function"
        ? updater(externalCurrentMessage || DEFAULT_CURRENT_MESSAGE) // 根因
        : updater;
      onCurrentMessageChange?.(newMessage);
    }
  : setInternalCurrentMessage;
```

**发生了什么**：
1. WebSocket 流式数据速度极快（1ms 内连续触发多个事件）
2. 第一个事件触发 `setCurrentMessage`，基于 `externalCurrentMessage` 计算新状态
3. 父组件还没来得及重新渲染，第二个事件已到达
4. 第二个事件再次读取 `externalCurrentMessage`，**仍是旧值**
5. 旧状态覆盖新状态，导致数据踩踏和 UI 闪烁

---

## 三、修复方案

使用 `useRef` 作为**同步追踪器**：

```tsx
// ✅ 正确写法
const currentMessageRef = useRef(currentMessage);
useEffect(() => {
  currentMessageRef.current = currentMessage;
}, [currentMessage]);

const setCurrentMessage = useCallback(
  (updater) => {
    if (currentMessageControlled) {
      const prev = currentMessageRef.current || DEFAULT_CURRENT_MESSAGE; // 从 ref 读取
      const newMessage = typeof updater === "function" ? updater(prev) : updater;
      currentMessageRef.current = newMessage; // 立即同步更新 ref
      onCurrentMessageChange?.(newMessage);
    } else {
      setInternalCurrentMessage((prev) => {
        const newMessage = typeof updater === "function" ? updater(prev) : updater;
        currentMessageRef.current = newMessage;
        return newMessage;
      });
    }
  },
  [currentMessageControlled, onCurrentMessageChange]
);
```

---

## 四、核心原则

高频事件场景下，**永远从 ref 读取最新值**，而非依赖可能滞后的 prop。

**适用场景**：
- WebSocket 流式数据接收
- 高频定时器更新
- 快速用户输入（如搜索框防抖前的实时搜索）
- 任何可能在 React 渲染周期内连续触发的事件
