### 错误写法（原代码）
```tsx
// 在配置对象中直接存储 JSX 元素
const weatherMap = {
  sunny: {
    icon: <Sun className="w-16 h-16 text-yellow-300" />,  // ❌ 存储 JSX 实例
  }
};

// 渲染时
{weather.icon}  // ❌ 可能渲染为对象而非组件
```

当 JSX 元素被存储在对象中并在某些情况下（如通过 props 传递、序列化等）使用时，React 可能无法正确识别它为有效的 React 元素，导致抛出 `Error #31`。

### 正确写法
```tsx
// 存储组件类型（函数引用）
const weatherMap = {
  sunny: {
    icon: Sun,  // ✅ 存储组件类型
    iconColor: "text-yellow-300",
  }
};

// 渲染时动态创建 JSX
<weather.icon className={`w-16 h-16 ${weather.iconColor}`} />  // ✅ 正确渲染
```

## 核心原则

1. **存储组件类型，而非 JSX 实例**：将 `Sun` 而不是 `<Sun />` 存储在配置中
2. **在渲染时创建 JSX**：使用 `<weather.icon />` 动态创建元素
3. **分离样式配置**：将 `className` 等属性作为字符串单独存储

## 是不是系统提示词的问题？

**不是系统提示词的问题**。这是 AI 生成代码时的一个常见陷阱：

- AI 倾向于直接在数据结构中写 JSX（`<Sun className="..." />`），这在简单场景下可以工作
- 但当组件被封装、传递或序列化时，预创建的 JSX 元素可能失效
- 正确的模式是存储**组件引用**，在渲染时**动态创建** JSX

这是一个 React 开发中的**最佳实践问题**，需要在系统提示词中加入相关指导，提醒 AI 在存储图标/组件时存储组件类型而非 JSX 实例。