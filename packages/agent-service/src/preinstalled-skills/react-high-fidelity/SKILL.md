---
name: react-high-fidelity
description: 高保真 React 页的完整编码规范：DemoProps 声明、@preview/sdk 优先导入、单一文件约束、依赖策略。触发词：高保真、React 页面、index.tsx、DemoProps。仅适用于新建或重写 React 页，不适用于页面运行时类型转换（prototype ↔ high-fidelity-react），转换场景使用 page-runtime-conversion。
---

# 高保真 React 页规范

每个页面的 `index.tsx` 要求：

- 使用 TypeScript，**必须**定义 `interface DemoProps` 或 `type DemoProps` 声明组件 Props（这是编码规范，用于代码-配置一致性校验）
- Props 接口**只**声明该页面 `config.schema.json` 中定义的字段；如果 schema 没有配置字段，Props 必须为空，不要为了页面内容自行添加 props
- 项目级字段不在 Props 接口中声明，使用时从 props 解构（运行时注入）
- 使用 Tailwind CSS 进行样式设计
- 页面图标、按钮、卡片、弹窗、图片、倒计时、进度条、常见动效、图表、庆祝效果、轮播等优先从 `@preview/sdk` 导入
- SVGA 动画使用 `SvgaPlayer`，Lottie 动画使用 `LottiePlayer`，Rive 动画使用 `RivePlayer`，Spine 动画使用 `SpinePlayer`
- 图标优先使用 `<Icon name="browser" />`、`<Icon name="football" />` 这类语义名称，不要臆造 `lucide-react` named import
- 导出默认组件
- 代码完整可运行，包含必要的 import
- 所有代码在单一文件中，不使用 `import './xxx'`
- 复合类型配置（`array`/`imageList`/`richtext`/`cascade`/`enum` 多选/`type: "position"`）只能由高保真页消费，原型页不支持

## DemoProps 接口示例

```tsx
interface DemoProps {}

export default function Demo(_props: DemoProps) {
  return <div>页面内容</div>;
}
```

只有当用户明确要求页面配置项时，才声明对应字段：

```tsx
interface DemoProps {
  title: string;
  description?: string;
  showBadge?: boolean;
}

export default function Demo({
  title,
  description,
  showBadge = false,
}: DemoProps) {
  // ...
}
```

## React 版本约束

预览环境使用 React 18.3.1，所有第三方 React 依赖必须兼容此版本。
禁止手动 import React（由 React JSX Runtime 自动处理）。
预览运行时只允许系统登记的受控能力和依赖。优先使用 `@preview/sdk`；短期兼容 `lucide-react`、`framer-motion`，但 named import 必须真实存在。

## 与页面运行时转换的边界

本规范仅适用于**新建或重写 React 页面**。当用户触发页面运行时类型转换（prototype ↔ high-fidelity-react）时，应使用 `page-runtime-conversion` skill，其规则与本规范不同：转换场景以源页面视觉为 ground truth，不得用 @preview/sdk 通用组件替换自定义视觉。

## 动画组件

### LottiePlayer

播放 Lottie `.json` 动画素材。素材通过配置字段上传。

```tsx
import { LottiePlayer } from "@preview/sdk";

<LottiePlayer
  src={lottieSrc}
  loop={true}
  autoplay={true}
  renderer="svg"
  fallback={<div>动画加载中...</div>}
/>
```

| Props | 类型 | 默认值 | 说明 |
|-------|------|--------|------|
| `src` | string | - | Lottie `.json` 素材 URL |
| `loop` | boolean | true | 是否循环 |
| `autoplay` | boolean | true | 自动播放 |
| `renderer` | string | "svg" | 渲染器类型 |
| `fallback` | ReactNode | null | 加载失败或 src 为空时展示 |
| `onError` | function | - | 加载失败回调 |
| `className` | string | - | 容器 class |
| `style` | object | - | 容器样式 |

Schema 配置示例（`mediaType` 枚举 + `FileUploadWidget`）：

```json
{
  "mediaType": { "type": "string", "enum": ["image", "lottie", "rive", "spine"], "default": "image" },
  "lottieSrc": { "type": "string", "format": "file", "ui:options": { "accept": ".json", "visibleWhen": { "field": "mediaType", "equals": "lottie" } } }
}
```

### RivePlayer

播放 Rive `.riv` 动画素材。素材通过配置字段上传。

```tsx
import { RivePlayer } from "@preview/sdk";

<RivePlayer
  src={riveSrc}
  fit="cover"
  alignment="center"
  autoplay={true}
  fallback={<div>动画加载中...</div>}
/>
```

| Props | 类型 | 默认值 | 说明 |
|-------|------|--------|------|
| `src` | string | - | Rive `.riv` 素材 URL |
| `fit` | string | "cover" | 填充方式 |
| `alignment` | string | "center" | 对齐方式 |
| `autoplay` | boolean | true | 自动播放 |
| `fallback` | ReactNode | null | 加载失败或 src 为空时展示 |
| `onError` | function | - | 加载失败回调 |
| `className` | string | - | 容器 class |
| `style` | object | - | 容器样式 |

### SpinePlayer

播放 Spine 骨骼动画。素材需打包为 `.zip` 上传（内含骨架 + 图集 + 纹理），上传后 zip 服务端自动解压返回各文件 URL。

支持的素材命名与版本：
- 骨架：`.skel`（二进制）、`.skel.bytes`（Flutter/Unity 导出）、`.json`（JSON 格式）。
- 图集：`.atlas`、`.atlas.txt`（Flutter/Unity 导出）。
- 纹理：`.png`。
- 版本：Spine Editor 4.2 与 4.3 素材格式不兼容，运行时自动按素材版本选择（4.2 用内置 `spine-webgl-42`，4.3 用 `spine-webgl`），无需用户/agent 干预。

```tsx
import { SpinePlayer } from "@preview/sdk";

<SpinePlayer
  skeleton={spineFiles.skeleton}
  atlas={spineFiles.atlas}
  texture={spineFiles.texture}
  animation="idle"
  loop={true}
  fallback={<div>动画加载中...</div>}
/>
```

| Props | 类型 | 默认值 | 说明 |
|-------|------|--------|------|
| `skeleton` | string | - | `.skel`/`.skel.bytes` 或 `.json` 骨架文件 URL |
| `atlas` | string | - | `.atlas`/`.atlas.txt` 图集文件 URL |
| `texture` | string | - | `.png` 纹理文件 URL |
| `animation` | string | - | 指定播放的动画名（不填默认第一条） |
| `loop` | boolean | true | 是否循环 |
| `fallback` | ReactNode | null | 加载失败或必填字段缺失时展示 |
| `onError` | function | - | 加载失败回调 |
| `className` | string | - | 容器 class |
| `style` | object | - | 容器样式 |

Schema 配置示例：

```json
{
  "spineSrc": { "type": "string", "format": "file", "ui:options": { "accept": ".zip", "visibleWhen": { "field": "mediaType", "equals": "spine" } } }
}
```
