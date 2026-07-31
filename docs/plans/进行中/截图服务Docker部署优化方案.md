# 截图服务 Docker 部署优化方案

## 背景

screenshot-service 在 Mac mini（M1, 8 核）上通过 Docker Compose 部署。经过代码和部署配置复查，存在若干可优化点，部分与 M1 硬件特性强相关。

## 实施结论

| 优先级 | 内容 | 决策 | 说明 |
|--------|------|------|------|
| P0 | 资源配置 + 并发环境变量化 | ✅ 已实施 | 2026-07-31 实施，通过 `pnpm check:screenshot` 验证 |
| P1 | 浏览器崩溃自动重连 | ❌ 不需实施 | `getBrowser()` 已有惰性重建机制，`disconnected` 时将 `this.browser` 置 null，下次调用自动 `launch()` |
| P2 | Page 对象池化 | ❌ 不值得 | 收益 20-80ms/次，引入状态泄漏风险和实现复杂度，ROI 不匹配 |
| P3 | HTML 构建缓存 | ❌ 不值得 | 字符串拼接开销可能低于 LRU+SHA256 缓存开销，无性能数据支撑 |
| P4 | 预热 + Chrome 标志 | ❌ 不值得 | `NetworkServiceInProcess` 在新版 Chrome 已废弃；`--num-raster-threads` Chrome 自动按核调优 |
| P5 | 请求限流 | ✅ 已实施 | 引入 `@fastify/rate-limit`，全局限流 60次/10秒/IP |

## 当前状态（实施后）

| 配置项 | 实施前 | 实施后 |
|--------|--------|--------|
| CPU 限制 | 1.0 核 | 2.5 核 |
| 内存限制 | 1536 MB | 2048 MB |
| 并发渲染页 | 3（硬编码） | 4（可通过 `SCREENSHOT_MAX_CONCURRENT_PAGES` 环境变量调整） |
| 请求限流 | 无 | 60 次/10秒/IP（`@fastify/rate-limit`） |

## P0 实施详情

### 1. docker-compose.yml

```yaml
# screenshot-service
cpus: "2.5"
mem_limit: 2048m
environment:
  - SCREENSHOT_MAX_CONCURRENT_PAGES=${SCREENSHOT_MAX_CONCURRENT_PAGES:-4}
```

### 2. config.ts — maxConcurrentPages 环境变量化

```typescript
maxConcurrentPages: parseInt(
  process.env.SCREENSHOT_MAX_CONCURRENT_PAGES || "4",
  10,
),
```

### 3. browser-pool.test.ts — 适配新默认值

- "并发超过上限"测试：任务数 4→5，上限断言 3→4
- "队列超时"测试：任务数 4→5，超时任务索引 3→4
- "优先级调度"测试：阻塞任务数 3→4，`waitFor` 期望长度 3→4

## P5 实施详情

### server.ts

```typescript
import rateLimit from "@fastify/rate-limit";

await fastify.register(rateLimit, {
  max: 60,
  timeWindow: "10 seconds",
  errorResponseBuilder: () => ({
    success: false,
    error: {
      code: "TOO_MANY_REQUESTS",
      message: "请求过于频繁，请稍后重试",
    },
  }),
});
```

### package.json — esbuild external

`build:docker` 增加 `--external:@fastify/rate-limit`。

## 未实施项及原因

### P1 浏览器崩溃自动重连 — 无需实施

`browser-pool.ts` 中 `disconnected` 事件（187-192 行）将 `this.browser = null`，而 `getBrowser()`（136-152 行）在 `this.browser` 为 null 时自动触发 `launch()`。惰性重建机制已正常工作，不需要微调。

### P2 Page 对象池化 — 不值得

单次 Page 创建/销毁开销 20-80ms，相比渲染总耗时占比低。池化引入的状态泄漏风险（cookies、localStorage、service workers）和实现复杂度远大于收益。

### P3 HTML 构建缓存 — 不值得

`buildPrototypePreviewDocumentHtml` 和 `buildSketchScenePreviewDocumentHtml` 是字符串拼接操作，LRU+SHA256 的缓存开销可能接近甚至超过构建开销。在无性能数据证明瓶颈前不应添加。

### P4 预热 + Chrome 标志 — 不值得

- `--enable-features=NetworkServiceInProcess`：新版 Chrome 已废弃此标志，且有安全隐患（网络服务在浏览器进程内运行）。
- `--num-raster-threads=4`：Chromium 已根据 CPU 核数自动调优光栅化线程数，手动指定可能适得其反。
- 预热中增加最小页面渲染属于低风险无害改动，但优先级不足以独立实施。

## M1 特有不建议的优化

- **GPU 加速（Metal）**：Chromium 运行在 Docker 内的 Linux ARM64 环境中，无法访问 macOS Metal API。`--disable-gpu` 是正确行为。
- **多浏览器实例**：单实例多 Page 在 4 并发以内效率最高。多实例浪费内存且增加进程管理复杂度。
- **水平扩展（replicas）**：单实例优化后 2.5 核 × 4 并发页已可覆盖小团队日常使用。

## 风险

- **CPU 提高到 2.5 核**：在 Mac mini 同时运行其他容器时需确保总量不超物理核数，否则可能触发 throttling。
