---
covers:
  - apps/plugin/plugin-src/code.ts
  - apps/plugin/ui-src/App.tsx
  - apps/plugin/ui-src/messaging.ts
  - packages/backend/src/messaging.ts
  - packages/types/src/types.ts
---

# Figma 插件架构

> 插件整体架构设计，包括主线程与 UI 线程的通信机制

---

## 架构概览

Figma 插件采用**双线程架构**：

```
┌─────────────────────────────────────────────────────────────┐
│                      Figma 桌面应用                          │
│  ┌─────────────────────┐      ┌─────────────────────────┐  │
│  │   主线程 (Main)      │      │    UI 线程 (iframe)      │  │
│  │   plugin-src/code.ts │◄────►│    ui-src/App.tsx        │  │
│  │                     │      │                         │  │
│  │ • 访问 Figma API    │      │ • React 应用            │  │
│  │ • 读取/修改文档     │      │ • 用户界面              │  │
│  │ • 导出图片          │      │ • 事件处理              │  │
│  │ • 代码生成          │      │                         │  │
│  └─────────────────────┘      └─────────────────────────┘  │
│           ▲                              │                  │
│           │      figma.ui.postMessage    │                  │
│           └──────────────────────────────┘                  │
│                        window.onmessage                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 线程职责

### 主线程 (Main Thread)

**文件位置**: `apps/plugin/plugin-src/code.ts`

**核心职责**:
- 初始化插件设置
- 监听 Figma 选区变化
- 调用代码生成引擎
- 与 UI 线程通信

**生命周期**:
```
插件启动
    │
    ▼
getUserSettings() ──→ 从 clientStorage 读取配置
    │
    ▼
showUI() ──→ 显示插件界面
    │
    ▼
注册事件监听:
  - selectionchange ──→ 选区变化时重新生成代码
  - currentpagechange ──→ 页面切换时更新
  - 消息监听 ──→ 处理来自 UI 的指令
```

### UI 线程 (UI Thread)

**文件位置**: `apps/plugin/ui-src/App.tsx`

**核心职责**:
- 渲染 React 应用
- 处理用户交互
- 向主线程发送指令
- 展示代码生成结果

**启动流程**:
```
main.tsx 入口
    │
    ▼
创建 React Root
    │
    ▼
渲染 <App /> 组件
    │
    ▼
App 组件:
  - 注册 message 监听
  - 初始化状态
  - 渲染 PluginUI
```

---

## 通信机制

### 消息类型定义

```typescript
// 主线程 → UI 线程
interface ConversionData {
  code: string;
  htmlPreview: HTMLPreview;
  warnings: Warning[];
  settings: PluginSettings;
}

type ConversionMessage = {
  type: "code";
  data: ConversionData;
};

type EmptyMessage = {
  type: "empty";
};

type ErrorMessage = {
  type: "error";
  error: string;
};

type UpdateSelectionTagsMessage = {
  type: "update-selection-tags";
  data: {
    currentTag: { type: string; id: string };
    aiInstruction: string;
    isStatic: boolean;
    autoLayoutMode: string;
    nodeType: string;
    nodeName: string;
    nodeId: string;
  };
};

type CheckLayersResultMessage = {
  type: "check-layers-result";
  data: { warnings: Warning[] };
};

type DocumentChangedMessage = {
  type: "document-changed";
};

type LockedPreviewUpdateMessage = {
  type: "locked-preview-update";
  htmlPreview: HTMLPreview;
};

// UI 线程 → 主线程
type ApplyTagMessage = {
  type: "apply-tag";
  tag: string;
};

type ToggleStaticMessage = {
  type: "toggle-static";
};

type SetLayoutModeMessage = {
  type: "set-layout-mode";
  mode: string;
};

type UpdateAIInstructionMessage = {
  type: "update-ai-instruction";
  text: string;
};

type CheckLayersMessage = {
  type: "check-layers";
};

type SelectLayerByIdMessage = {
  type: "select-layer-by-id";
  nodeId: string;
};

type SelectLayerByWarningMessage = {
  type: "select-layer-by-warning";
  warning: string;
};

type ReconvertNodeMessage = {
  type: "reconvert-node";
  nodeId: string;
};

type UpdateSettingsMessage = {
  type: "update-settings";
  key: keyof PluginSettings;
  value: any;
};
```

### 通信流程示例

#### 场景 1: 选区变化触发代码生成

```
用户在 Figma 中选中图层
    │
    ▼
主线程: on("selectionchange")
    │
    ▼
主线程: run(settings) ──→ 生成代码
    │
    ▼
主线程: figma.ui.postMessage({ type: "code", data: {...} })
    │
    ▼
UI 线程: window.onmessage 接收
    │
    ▼
UI 线程: 更新状态 → 重新渲染
```

#### 场景 2: 用户应用标记

```
用户在 PreviewToolbar 点击 [配置项] → 选择类型 → 输入 ID
    │
    ▼
UI 线程: parent.postMessage({ type: "apply-tag", tag: "#slot:img:avatar" }, "*")
    │
    ▼
主线程: onmessage 接收
    │
    ▼
主线程: 修改选中节点名称
    │
    ▼
主线程: 触发 selectionchange → 重新生成代码
```

#### 场景 3: 预览锁定与重转换

```
用户点击预览锁定按钮
    │
    ▼
UI 线程: 设置锁定状态，记录当前节点 ID
    │
    ▼
Figma 文档发生变化
    │
    ▼
主线程: figma.on("documentchange") 触发
    │
    ▼
主线程: postMessage({ type: "document-changed" }) 到 UI
    │
    ▼
UI 线程: 节流处理后发送 reconvert-node 消息
    │
    ▼
主线程: 重新转换锁定节点，返回 locked-preview-update
    │
    ▼
UI 线程: 更新锁定预览内容
```

---

## 项目结构

```
apps/
├── debug/                     # 调试应用 (Next.js)
│   ├── app/
│   │   ├── layout.tsx
│   │   └── page.tsx
│   └── package.json
│
└── plugin/                    # Figma 插件主程序
    ├── plugin-src/            # 主线程代码
    │   └── code.ts            # 入口文件
    │
    ├── ui-src/                # UI 线程代码
    │   ├── App.tsx            # React 应用入口
    │   ├── main.tsx           # React 渲染入口
    │   ├── index.html         # HTML 模板
    │   └── messaging.ts       # 消息处理
    │
    ├── dist/                  # 构建输出
    ├── manifest.json          # 插件清单
    └── vite.config.ts         # 构建配置

packages/
├── backend/                   # 代码生成引擎
│   ├── src/
│   │   ├── html/              # HTML 代码生成器
│   │   ├── tailwind/          # Tailwind/React 代码生成器
│   │   ├── common/            # 通用工具与转换逻辑
│   │   └── altNodes/          # Figma 节点转换
│   └── package.json
│
├── plugin-ui/                 # UI 组件库
│   ├── src/
│   │   ├── components/        # React 组件
│   │   ├── lib/               # 工具函数
│   │   ├── PluginUI.tsx       # 主容器
│   │   └── codegenPreferenceOptions.ts  # 偏好配置
│   └── package.json
│
├── types/                     # TypeScript 类型定义
│   └── src/
│       └── types.ts
│
└── tsconfig/                  # 共享 TS 配置

r2-asset-worker/               # Cloudflare Worker 资源上传服务
├── src/
│   └── index.ts
└── wrangler.jsonc
```

---

## 类型系统

共享类型定义位于 `packages/types/src/`：

```typescript
// types.ts 核心类型
export type Framework = "Tailwind";

export interface PluginSettings extends TailwindSettings {
  framework: Framework;
  useOldPluginVersion2025: boolean;
  responsiveRoot: boolean;
}

export interface AssetUploadSettings {
  enableAssetUpload: boolean;
  uploadEndpoint: string;
  maxConcurrentUploads: number;
  // ...
}
```

类型通过 TypeScript Project References 共享：
```json
// tsconfig.json
{
  "references": [
    { "path": "../../packages/types" },
    { "path": "../../packages/backend" }
  ]
}
```

---

## 构建与部署

### 开发模式

```bash
# 启动 UI 开发服务器
cd apps/plugin
npm run dev

# 在 Figma 中添加开发插件
# 选择 manifest.json 路径
```

### 生产构建

```bash
# 构建整个插件
cd apps/figma-plugin
npm run build

# 输出到 apps/plugin/dist/
# 包含: code.js, index.html
```

### 发布流程

1. 构建生产版本
2. 在 Figma 开发者面板创建新版本
3. 上传 `dist/` 目录内容
4. 提交审核或内部分发

---

## 调试技巧

### 主线程调试

```typescript
// 在 code.ts 中使用
console.log("[DEBUG] 变量值:", variable);
figma.notify("提示信息");  // Figma 原生通知
```

### UI 线程调试

```typescript
// 在 App.tsx 中使用
console.log("[UI] 状态:", state);
// 使用浏览器 DevTools (右键插件 → Inspect Plugin)
```

### 消息调试

```typescript
// 在 messaging.ts 中统一添加日志
export const postMessage = (msg: Message) => {
  console.log("[→ UI]", msg);
  figma.ui.postMessage(msg);
};
```
