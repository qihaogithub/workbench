# 图片子 Agent 异步绘图方案

> 让创作端 Agent 具备文生图 + 抠图能力，通过专用图片子 Agent 异步执行，主 Agent 专注页面设计。

## 背景

### 现状

创作端 Agent（agent-service，Pi Agent）在建页面时只能"用"图，不能"造"图：
- `saveImage` 支持从 URL / base64 / assetId 保存图片到全局图床
- `listImages` 可查项目图片清单，`readUserImage` 可回读
- `design-taste-frontend` 预装 skill 的 4.8 节已明确要求"优先使用图像生成工具"，但当前环境里根本没有这个工具

### 需要解决的问题

| 问题 | 后果 |
|------|------|
| 主 Agent 没有图像生成能力 | 页面用纯文字或占位符，效果差 |
| 图像生成耗时（10-30s） | 阻塞主 Agent，长时间等待 |
| 没有质量闭环 | 生成的图没人评判，不好就不好 |
| 没有图像处理能力 | 不能抠图、裁剪、处理素材 |

## 架构

### 先评估的简化备选方案（前置批量生成）

正式实现异步延迟 URL 前，先对比一个能大幅降低复杂度的替代方案：

**相位模型**：子 Agent 在页面设计"前置阶段"**并行批量生成全部图片**，主 Agent 之后直接引用真实 imageId，不出现临时 URL。

| 维度 | 前置批量生成（简化） | 延迟 URL（本方案） |
|------|--------------------|--------------------|
| 临时 URL | 无 | 有，需 finalize 重写 |
| 跨服务状态解析 | 无 | 需要（见下文属主约定） |
| 主 Agent 阻塞 | 前置阶段一次性等待 | 不阻塞，边设计边水合 |
| 适用场景 | 图片量与生成顺序在设计前可确定 | 设计过程中图片需求动态涌现 |

**判断标准**：若"建页面"任务中图片素材清单在动工前即可由主 Agent 规划齐全（绝大多数场景），优先用简化方案；仅当确实需要"边设计边动态补图"时才启用延迟 URL。本方案文档按延迟 URL 展开，但实现前必须先做上述取舍。

### 跨服务状态归置约定（先行要件）

- **任务状态属主**：agent-service 的 DrawingManager 单例。
- **结果清单落盘位置**：全局共享数据目录 `data/image-agent-results/{taskId}.json`（与 `data/image-store` 同级，author-site 与 agent-service 均按 `DATA_DIR` 读取，双方天然可访问），**不写入工作区 `assets/`** —— 工作区路径 author-site 无法可靠读取。
- **author-site 解析方式**：`GET /api/images/gen/{taskId}/{artboardName}` 直接读对应 `data/image-agent-results/{taskId}.json`，按 `artboard` 字段取 imageId；未完成则根据 `status` 返回占位。**不依赖代理 agent-service HTTP 查询**，读共享文件即可，避免新增 RPC 依赖。
- 子 Agent 的 `writeFile` 作用域限制为 `data/image-agent-results/`，在 PermissionManager 增加该路径约束（当前 writeFile 为全局，需收紧）。

```
主 Agent（设计页面）                   图片子 Agent（图像专家）
    │                                        │
    │  delegateImageTask({需求})              │
    │ ─────────────────────────────────────►  │
    │  [立即返回 taskId + 延迟 URL]            │
    │  [继续设计页面，写入延迟 URL 到页面]       │
    │                                        │
    │                                        │  ┌─ generateImage（文生图）
    │                                        │  ├─ extractImageElement（抠图）
    │                                        │  ├─ readUserImage（自我评判）
    │                                        │  ├─ 不满意→改 prompt→重试
    │                                        │  ├─ 满意→保存→继续下一张
    │                                        │  └─ 写结果清单
    │                                        │
    │  读取结果清单，下一轮验证质量              │
    │ ◄─────────────────────────────────────  │
    │                                        │
    │  前端：预览页自动轮询延迟 URL              │
    │  未就绪→占位图  就绪→自动切换显示          │
```

### 核心组件

#### DrawingManager（agent-service 单例）

管理所有异步绘图任务的调度和执行。

```
注册表: taskId → {
  status: 'pending' | 'running' | 'completed' | 'failed',
  projectId: string,
  artboards: Array<{name, prompt, size, filename, imageId?, retryCount}>,
  createdAt: number,
  completedAt?: number,
}

队列: FIFO
并发池: 默认 2
配额: 每会话最大生成数（IMAGE_GEN_MAX_PER_SESSION）
```

#### 图片子 Agent harness

**不能直接复用 `runSubagent`。** `runSubagent` 是 `PiAgentBackend` 的实例方法，强耦合 `permissionManager/toolHookManager/modelManager/imageDescriber`，且是同步 `await harness.prompt(...)` 语义；图像子 Agent 必须比主 Agent 会话活得更久（主会话可能随时被 `destroy`），因此生命周期必须解耦。

**实现**：把 `runSubagent` 中创建 harness 的段落（`loadPiAgentDeps` → env/session/harness → 定向工具集 → vision 模型）抽成可复用的独立工厂，由 **DrawingManager 自己创建并持有子 Agent 的 harness + AbortController**，不依赖 PiAgentBackend 实例存续；DrawingManager 在任务完成后主动销毁。复用现有 harness 基础设施，但生命周期归属改为 DrawingManager：

| 维度 | 现有 `delegateTask` | 图片子 Agent |
|------|--------------------|-------------|
| 调用方式 | 同步（await） | 异步（fire-and-forget） |
| 模型 | 继承主 Agent 或 vision | 固定用 `IMAGE_DESCRIPTION_MODEL` |
| 工具集 | 全量 workbench 工具 | 仅图像工具（见下） |
| 生命周期 | 单次 prompt 后销毁，随主会话 | DrawingManager 独立持有，可存活于主会话之后 |
| 结果回传 | 直接返回 | 写结果清单（共享数据目录）+ 事件 |

#### 结果清单文件

路径：`data/image-agent-results/{taskId}.json`（全局共享数据目录，非工作区，author-site 与 agent-service 均按 `DATA_DIR` 读取）

```json
{
  "taskId": "img_abc123",
  "status": "completed",
  "images": [
    {
      "artboard": "hero",
      "imageId": "img_xyz789",
      "url": "/api/images/img_xyz789",
      "alt": "蓝色几何抽象背景，现代 SaaS 风格",
      "width": 1792,
      "height": 1024,
      "retryCount": 1,
      "finalPrompt": "A modern SaaS hero background with blue geometric shapes..."
    }
  ],
  "createdAt": 1722840000000,
  "completedAt": 1722840030000
}
```

主 Agent 下一轮用 `readFile` 读取此文件，看到结果后验证质量，不满意可要求重做。

## 工具集

### 主 Agent 工具

#### `delegateImageTask`

```typescript
{
  task: string,           // 自然语言任务描述
  artboards: Array<{      // 需要生成的素材列表
    name: string,         // 素材标识，如 "hero"、"feature-1"
    prompt: string,       // 图像生成提示词
    size?: string,        // 1024x1024 / 1024x1792 / 1792x1024
    filename: string,     // 输出文件名，如 "hero.png"
  }>,
  context?: string,       // 可选的页面设计上下文参考
}
```

返回：

```typescript
{
  taskId: string,                     // 如 "img_abc123"
  deferredUrl: string,                // 如 "/api/images/gen/img_abc123/hero"
  estimatedSeconds: number,           // 预估完成时间
}
```

行为：**非阻塞，立即返回**。主 Agent 用延迟 URL 写 `<img src="/api/images/gen/img_abc123/hero">` 到页面，继续设计。

### 图片子 Agent 工具集

以下工具**仅注册给图片子 Agent**，主 Agent 工具集中不包含。

| 工具 | 用途 | 实现 |
|------|------|------|
| `generateImage` | 文生图，调 `POST /v1/images/generations` | 内部调 `IMAGE_GEN_*` API，b64_json→全局图床 |
| `extractImageElement` | 语义抠图，抠出指定元素 | `@xenova/transformers` + CLIPSeg + `sharp` |
| `saveImage` | 保存外部图片到图床 | 复用现有 `save-image-tool.ts` |
| `listImages` | 查看项目已有图片 | 复用现有 `list-images-tool.ts` |
| `readUserImage` | 回看图片（用于自我评判质量） | 复用现有 `read-user-image-tool.ts` |
| `readFile` | 读页面上下文 / 设计方向 | 复用现有 `read-file-tool.ts` |
| `writeFile` | 写结果清单（仅限 `data/image-agent-results/`，PermissionManager 收紧作用域） | 复用现有 `write-file-tool.ts` |

#### `generateImage` 工具详情

**参数**：
```typescript
{
  prompt: string,           // 画面描述，最长 1000 字符
  filename: string,         // 文件名，如 "hero.png"
  size?: '1024x1024' | '1024x1792' | '1792x1024',  // 默认 1024x1024
  n?: number,               // 变体数，默认 1，最大 4
}
```

**流程**：
1. 校验启用开关、API Key、配额
2. `fetch` 调 `POST {IMAGE_GEN_BASE_URL}/images/generations`
3. 解析响应：优先 `b64_json` → Buffer，无则回退 `url` 下载
4. `uploadToGlobalImageStore(sourceType='ai_generated')` → 全局图床
5. 注册项目清单（同 `saveImage`）
6. 返回 `{imageId, url, alt, width, height}`

#### `extractImageElement` 工具详情

**参数**：
```typescript
{
  imageId: string,           // 来源图，全局图床中的 imageId
  element: string,           // 语义描述，如 "the red car on the left"、"这个人"
  output: string,            // 输出文件名，如 "extracted-car.png"
  softEdge?: number,         // 边缘羽化像素，默认 0
  invert?: boolean,          // 反选：抠出除 element 外的所有内容，默认 false
  threshold?: number,        // mask 阈值 0-1，默认 0.5
}
```

**流程**：
1. `readGlobalImageById(imageId)` → Buffer + 尺寸
2. `sharp` 解码 → 获取原始宽高
3. `image-segmenter.ts`（CLIPSeg 懒加载单例）→ 推理 → mask Buffer（8-bit，原图尺寸）
4. mask 全黑？→ 返回"未找到指定元素"
5. `softEdge>0` → `sharp.GaussianBlur`；`invert` → `sharp.negate`
6. `sharp.joinChannel`：原图 RGB + mask 作为 Alpha → 透明 PNG
7. `uploadToGlobalImageStore(sourceType='ai_generated')` → 图床
8. 返回 `{imageId, url, alt, width, height, sourceImageId, element}`

**依赖**：`sharp`（图像处理） + `@xenova/transformers`（CLIPSeg 推理）

**模型**：`Xenova/clipseg-rd64-refined`（零样本文本-图像分割模型，~340MB）

**加载策略**：懒加载，首次调用时下载并缓存，进程内复用。

### 图片子 Agent 自主循环示例

```
1. readFile(页面上下文) → 理解设计方向
2. generateImage({prompt:"Modern SaaS hero...", size:"1792x1024", filename:"hero.png"})
   → 得到 imageId: img_xxx
3. readUserImage({imageId: "img_xxx"}) → 视觉模型看到图片
4. 评判："颜色偏暗，几何形状不够丰富"
5. 重试：generateImage({prompt:"Brighter blues, more geometric shapes..."})
   → 新 imageId: img_yyy
6. readUserImage({imageId: "img_yyy"}) → 评判："满意"
7. 如果需求包含抠图：
   extractImageElement({imageId:"img_yyy", element:"the main geometric shape", output:"hero-shape.png"})
8. writeFile("data/image-agent-results/{taskId}.json", {results})
```

## 延迟 URL 与自动显示

### 端点 `GET /api/images/gen/{taskId}/{artboardName}`

由 author-site 提供。

| 状态 | 响应 |
|------|------|
| 任务未存在 | 404 |
| 任务进行中 | 200 + 轻量占位图（淡色 SVG 或"生成中"指示） |
| 任务已完成 | 302 → `/api/images/{imageId}` |
| 任务失败 | 200 + 失败占位图 |

该端点直接读 `data/image-agent-results/{taskId}.json` 解析 imageId（不 proxy agent-service）。所有响应加 `Cache-Control: no-store`，避免浏览器/代理缓存过期 302 导致轮询拿到旧结果。

### 发布 finalize（必须）

延迟 URL 会被主 Agent 烧进持久化页面源码，但**发布后的页面没有预览运行时去自动换 src**。因此 publish 流程必须增加 finalize 步骤：

- 发布前扫描页面中所有 `/api/images/gen/{taskId}/{artboardName}` 引用，查 `data/image-agent-results/`。
- 任务已完成 → 重写为真实 `/api/images/{imageId}`；任务未完成/失败 → 发布失败并提示用户（或等任务完成后再发布）。
- 未 finalize 不得发布，避免正式页面带死链临时 URL。

### 运行时自动显示

预览运行时在 `<body>` 末尾注入轻量脚本（<1KB，零依赖）：

```javascript
// 轮询所有 img[data-gen-task] 的延迟 URL
// 当端点返回非占位响应时，替换 img.src 为真实 URL
// 无需刷新页面，无需重写 HTML
```

主 Agent 写完页面即稳定，子 Agent 完成后自动更新。

## 配置

```bash
# 图像子 Agent 总开关
IMAGE_GEN_ENABLED=false

# 图像生成 API（OpenAI 兼容 /v1/images/generations）
IMAGE_GEN_API_KEY=sk-...
IMAGE_GEN_BASE_URL=https://xxx/v1
IMAGE_GEN_MODEL=dall-e-3
IMAGE_GEN_TIMEOUT_MS=60000

# 配额与限制
IMAGE_GEN_MAX_PER_SESSION=30
IMAGE_GEN_MAX_RETRIES=3
IMAGE_GEN_CONCURRENCY=2
IMAGE_GEN_MAX_PROMPT_LEN=1000

# 推理模型（图片子 Agent 的 LLM，用于规划/评判/重试决策）
# 复用 IMAGE_DESCRIPTION_MODEL，无需额外配置
IMAGE_DESCRIPTION_MODEL=jojo/gpt-4o
```

## 实现阶段

### Phase 0：方案取舍决策

- 与产品确认多数"建页面"场景是否可采用**前置批量生成**（图片需求在设计前可规划）。
- 若可，优先实现简化方案（前置并行生成 → 主 Agent 直接引用真实 imageId），跳过 Phase 3/4 的延迟 URL 复杂度。
- 若确需动态补图，再按本方案 Phase 3/4 推进。

### Phase 1：`generateImage` 工具 + 图床落库

- 新增 `generate-image-tool.ts`，调 `IMAGE_GEN_*` API，存到全局图床
- 注册到图片子 Agent 工具集（暂不实现异步，先验证工具本身）
- 新增依赖：无（直接 fetch 调 API）
- 测试：mock API 调用 + 图床写入

### Phase 2：`extractImageElement` 工具

- 新增 `extract-image-element-tool.ts` + `image-segmenter.ts`
- 新增依赖：`sharp`、`@xenova/transformers`
- 先确认本包 esbuild/Docker 已支持 `sharp`/`onnxruntime-node` 原生模块；否则评估独立轻服务路径
- 测试：mock CLIPSeg + sharp，覆盖正常/未找到/softEdge/invert

### Phase 3：DrawingManager + 异步子 Agent

- `DrawingManager` 单例（注册表、队列、并发池）
- 图片子 Agent harness：**从 `runSubagent` 抽出独立工厂，由 DrawingManager 持有多于主会话的生命周期**，定向工具集，vision 模型
- `delegateImageTask` 主 Agent 工具（非阻塞返回）
- 结果清单文件写入 `data/image-agent-results/{taskId}.json`（共享全局数据目录）
- PermissionManager 收紧子 Agent `writeFile` 作用域到 `data/image-agent-results/`
- 测试：子 Agent 自主循环、重试逻辑、配额、生命周期独立于主会话

### Phase 4：延迟 URL + 自动显示 + finalize

- author-site 路由 `/api/images/gen/{taskId}/{artboardName}`（读共享结果清单，响应 `Cache-Control: no-store`）
- 预览运行时注入轮询脚本
- **publish 前 finalize**：页面临时 URL 重写为真实 imageId，未完成则拒绝发布
- 端到端验证：主 Agent 发任务 → 子 Agent 生成 → 页面自动显示 → 发布重写

## 风险与边界

| 风险 | 缓解 |
|------|------|
| 跨服务状态解析 | 结果清单写共享全局数据目录 `data/image-agent-results/`，author-site 直接读文件，不 proxy RPC |
| 子 Agent 生命周期随主会话 | DrawingManager 独立持有 harness + AbortController，不依赖 PiAgentBackend 实例存续 |
| 发布页面带临时 URL | publish 前 finalize 重写为真实 imageId，未完成则拒绝发布 |
| 质量重做依赖"下一轮" | 自动水合只解决显示；重做需主 Agent 下轮回读清单，明确多轮 UX 预期 |
| CLIPSeg 340MB 模型下载 | 懒加载，不影响启动；首次调用后缓存 |
| CPU 推理慢（5-15s） | 工具设置 30s 超时，异步执行不阻塞主 Agent |
| low-res mask（352×352） | 缩放到原图尺寸时边缘锯齿用 softEdge 缓解 |
| 图片子 Agent 看不到生成结果 | 通过 `readUserImage` 回看，vision 模型评判 |
| 主 Agent 看不到图片就写进页面 | 下一轮回读结果清单验证，可要求重做 |
| 占位图显示 | 预览页有优雅占位，就绪后自动切换 |
| `sharp` 原生模块 | esbuild `--external:sharp`，Docker 需装 libvips |
| `onnxruntime-node` 原生模块 | esbuild `--external:onnxruntime-node`，Docker 需 build tools |
| CLIPSeg/ONNX 重依赖进 agent-service | 评估改为独立轻服务或托管 API；Phase 2 前先确认本包 esbuild/Docker 已支持原生模块 |

## 后续可扩展工具

| 工具 | 说明 | 实现方式 |
|------|------|----------|
| `editImage` | 裁剪/缩放/滤镜/调整 | `sharp` 参数化操作 |
| `composeImages` | 多图合成 | `sharp` 叠加合成 |
| `removeBackground` | 背景移除 | `briaai/RMBG-1.4`（~178MB，通过 `@xenova/transformers`） |
| `upscaleImage` | 图片放大 | 专用超分 API 或 ESRGAN 模型 |

这些工具注册给图片子 Agent 后，主 Agent 只需在任务里说"把 hero 图抠背景、叠加到渐变背景上"，子 Agent 自行调工具链完成。