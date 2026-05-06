# SWR 与 RSC 协作经验

> 从首页加载缓慢与卡片点击延迟问题分析中提取的 SWR + Next.js App Router 协作经验

---

## 一、SSR 中传 fallbackData 但骨架屏仍出现

### 问题现象

服务端组件（`page.tsx`）通过 `listProjects()` 直接预取数据，传给客户端组件（`HomePage`）作为 `initialDemos` prop。`HomePage` 内 `useDemos({ fallbackData: initialDemos })` 包装为 `ApiResponse` 形态。但浏览器 View Source 看到的首屏 HTML **仍然是骨架屏**，不是真实卡片。

RSC payload 中可见 `initialDemos` 已含完整项目数据，但 `<main>` 渲染输出仍是 `<div class="rounded-lg bg-muted animate-pulse">`。

### 根因分析

**SWR v2 的 `isLoading` 在 SSR 阶段不受 `fallbackData` 影响**：
- 即使 `fallbackData` 让 `data` 立即可用
- 在 SSR 渲染过程中，`isLoading` 仍可能返回 `true`
- 因此 `{isLoading ? <Skeleton /> : <RealContent />}` 这种判断会输出骨架屏

❌ 错误写法：依赖 `isLoading` 切换骨架屏

```typescript
export function HomePage({ initialDemos }: { initialDemos: DemoMeta[] }) {
  const { demos, isLoading } = useDemos({ fallbackData: initialDemos })

  return (
    <>
      {isLoading ? (
        // SSR 阶段 isLoading 仍可能为 true，HTML 输出骨架屏
        <SkeletonGrid />
      ) : (
        <DemoGrid demos={demos} />
      )}
    </>
  )
}
```

✅ 正确写法：直接以数据存在性切换

```typescript
export function HomePage({ initialDemos }: { initialDemos: DemoMeta[] }) {
  const { demos } = useDemos({ fallbackData: initialDemos })

  return (
    <>
      {demos.length === 0 ? (
        <EmptyState />
      ) : (
        <DemoGrid demos={demos} />
      )}
    </>
  )
}
```

### 核心原则

**当数据通过 RSC 预取传入客户端组件时，不要依赖 `isLoading` 判断渲染分支**——SSR 阶段 `fallbackData` 让 `data` 立即可用但 `isLoading` 仍可能为 `true`。改用 `data.length` 或 `data === undefined` 等"数据本身的状态"来切换 UI。

---

## 二、`fallbackData` 必须匹配 `fetcher` 的返回类型

### 问题现象

`fetcher` 返回 `ApiResponse<T>`（包含 `success` / `data` 嵌套），但 `fallbackData` 直接传裸数组 `T[]`，导致 `data?.success` 判断错误，下游 `demos` 永远为空数组。

### 根因分析

SWR 不会做形态转换。`fallbackData` 必须与 `fetcher` 的返回值结构完全一致。

❌ 错误写法：

```typescript
useSWR<ApiResponse<DemoMeta[]>>(
  '/api/demos',
  () => fetcher<DemoMeta[]>('/api/demos'),  // 返回 ApiResponse<DemoMeta[]>
  {
    fallbackData: initialDemos,  // 类型错位：DemoMeta[] vs ApiResponse<DemoMeta[]>
  }
)
```

✅ 正确写法：

```typescript
useSWR(
  '/api/demos',
  () => fetcher<DemoMeta[]>('/api/demos'),
  {
    fallbackData: { success: true as const, data: initialDemos },
  }
)
```

### 核心原则

**`fallbackData` 与 `fetcher` 返回值必须同形态**——若 `fetcher` 返回包装后的 `ApiResponse<T>`，`fallbackData` 也必须包装为同结构；不要传裸数据。

---

## 三、RSC 数据预取的最小改动模板

### 问题现象

页面采用纯客户端渲染（CSR），骨架屏期间用户看到的卡片不可点击，体验类似"页面卡死"。

### 根因分析

CSR 模式下，浏览器要走完"下载 JS → 水合 → 客户端 fetch API → 收到响应 → 重渲染"完整链路才能产出可交互的 DOM。任何一步慢都会让用户看到不可点击的占位符。

✅ 最小改造模板（3 文件改动）：

```typescript
// 1. page.tsx：改 async server component，预取数据
export const dynamic = 'force-dynamic'

export default async function Page() {
  const initialDemos = listProjects()  // 直接调 Node API
  return <HomePage initialDemos={initialDemos} />
}

// 2. home-page.tsx：接收 prop，透传给 SWR fallbackData
export function HomePage({ initialDemos }: { initialDemos: DemoMeta[] }) {
  const { demos } = useDemos({ fallbackData: initialDemos })
  return <DemoGrid demos={demos} />  // 不依赖 isLoading
}

// 3. api.ts：扩展 useDemos 签名
export function useDemos(options?: { fallbackData?: DemoMeta[] }) {
  return useSWR(
    '/api/demos',
    () => fetcher<DemoMeta[]>('/api/demos'),
    {
      fallbackData: options?.fallbackData
        ? { success: true as const, data: options.fallbackData }
        : undefined,
    }
  )
}
```

### 核心原则

**首屏 HTML 应自带数据**——服务端组件直接调 Node API 预取，通过 prop 传给客户端组件，客户端组件用 `fallbackData` 让 SWR 后台静默 revalidate；首屏的 `<a>` 链接立即可点击，无需等待 JS 水合。
