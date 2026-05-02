# 预览引擎：iframe沙箱与动态CDN编译策略

> 从分层预览架构方案、分层预览架构-二期优化方案、预览系统动态编译替换Sandpack方案中提取的架构决策与避坑经验

---

## 一、核心定位与设计哲学

**解决的最核心问题**：AI生成的代码（TSX）如何在预览环境中安全、高效地执行，同时支持任意npm依赖。

**铁律**：AI生成的代码即最终发布代码，不存在"已验证可以放心直接渲染"的中间态。预览系统必须对任何AI输出保持零信任的隔离姿态。

---

## 二、架构机制与正确方向

### 2.1 统一iframe沙箱隔离

所有预览场景（AI创作调试、跨系统嵌入）统一使用iframe作为隔离边界，不维护Direct渲染模式。

**隔离决策矩阵**：

| 场景 | 渲染模式 | 依赖加载 | 隔离性 |
|:-----|:---------|:---------|:-------|
| AI创作/调试 | iframe沙箱 | 动态CDN按需 | DOM/JS/CSS完全隔离 |
| 跨系统嵌入 | iframe沙箱 | 静态预编译HTML | DOM/JS/CSS完全隔离 |

**iframe安全属性配置**：
```html
<iframe sandbox="allow-scripts allow-same-origin" />
```
- `allow-scripts`：必须，否则JS不执行
- `allow-same-origin`：必须，否则Blob URL模式下的ES Module行为异常
- 来源验证：父窗口通过`event.source === iframe.contentWindow`验证；iframe内通过`event.source === window.parent`验证

### 2.2 动态CDN依赖解析（esm.sh）

服务端编译时从TSX代码中提取import语句，将npm包路径替换为CDN URL，浏览器直接通过ES Module加载已打包资源。

**编译后代码转换示例**：
```
源码：import { format } from 'date-fns'
     import { motion } from 'framer-motion'

编译后：
     from 'https://esm.sh/react@18.3.1/jsx-runtime'
     from 'https://esm.sh/date-fns'
     from 'https://esm.sh/framer-motion'
```

**为什么不用Sandpack**：Sandpack的2-5s冷启动在AI实时调试场景不可接受。动态CDN方案首次1-2s，后续代码变更几乎瞬时（依赖已缓存）。

### 2.3 双通道postMessage协议

| 通道 | 触发时机 | 延迟 | 是否重新编译 | 是否重置状态 |
|:---|:---|:---|:---|:---|
| `UPDATE_CODE` | AI修改代码 | ~200ms | ✅ | ✅（useState/useRef归零） |
| `UPDATE_CONFIG` | 用户修改配置 | ~16ms | ❌ | ❌ |

配置面板操作走专用通道，仅更新props，不触发重新编译和依赖加载。

### 2.4 服务端 sucrase 编译

- 编译耗时约50ms
- 必须从**编译后**的代码提取import（sucrase会自动添加`react/jsx-runtime`导入）
- 使用正则提取前需移除注释避免误判

---

## 三、反模式与历史避坑

### 3.1 白名单CSS属性重置是无限打地鼠

**❌ 错误做法**：通过`PreviewScope`白名单式CSS属性重置隔离污染

**根因**：AI生成代码的组合是无限的，而CSS Reset只能在已知属性列表上打补丁。

**✅ 正确做法**：iframe完全隔离，任何全局样式都无法穿透。

### 3.2 浏览器端打包严重拖慢冷启动

**❌ 错误做法**：使用Sandpack在浏览器端打包（browserify/webpack）

**根因**：每次代码变更都需重新打包2-5s，而浏览器端打包是纯计算开销，无法缓存。

**✅ 正确做法**：服务端预编译 + 浏览器直接下载已打包的CDN资源。省去打包计算，仅保留下载开销。

### 3.3 配置变更触发重新编译

**❌ 错误做法**：`configData`变更时重新调用`/api/compile`

**根因**：配置面板操作高频（如拖动slider），每次重新编译严重浪费。

**✅ 正确做法**：配置变更走`UPDATE_CONFIG`通道，仅更新props到已编译组件，~16ms响应。

### 3.4 深路径导入未做importmap映射

**❌ 错误做法**：importmap仅映射顶级包名

```json
{ "imports": { "date-fns": "https://esm.sh/date-fns" } }
```

**根因**：AI可能写`import { format } from 'date-fns/format'`，顶级映射无法处理子路径。

**✅ 正确做法**：importmap需支持子路径精确映射：
```json
{ "imports": { "date-fns/format": "https://esm.sh/date-fns/format" } }
```

---

## 四、核心指标与安全边界

### 4.1 延迟预算

| 阶段 | 耗时 | 说明 |
|:-----|:-----|:-----|
| 服务端编译（sucrase） | ~50ms | 代码越短越快 |
| 依赖分析+ImportMap生成 | ~10ms | AST提取import语句 |
| iframe创建 | ~50ms | 可复用已有iframe |
| CDN下载公共依赖 | ~200-500ms | 首次，后续缓存 |
| CDN下载业务依赖 | ~100-300ms/个 | 首次，后续缓存 |
| 代码执行+渲染 | ~50-100ms | 取决于组件复杂度 |
| **首次冷启动** | **~1-2s** | 可接受 |
| **代码变更（依赖已缓存）** | **~200ms** | 几乎瞬时 |

### 4.2 CDN资源缓存策略

- 浏览器自动缓存`esm.sh`资源
- 服务端可对编译结果做缓存（代码hash → 编译结果）
- 首次编译时锁定依赖版本到demo数据中，后续复用锁定版本

### 4.3 列表页预览策略

| 页面 | 预览方式 | 原因 |
|:-----|:---------|:-----|
| Demo列表页 | 静态缩略图（保存时生成） | 卡片多、无需交互、性能优先 |
| Demo使用页 | 实时iframe（PreviewPanel） | 需要交互、配置联动 |
| AI编辑工作台 | 实时iframe | 需要实时预览代码变更 |
| 跨系统嵌入 | 实时iframe（独立URL） | 外部系统需要实时渲染 |

缩略图生成时机：用户点击"保存"时服务端截图，使用`playwright`或`html-to-image`。

### 4.4 内网环境限制

内网无法访问外网CDN时的应对策略（按优先级）：

1. **内网npm代理**：verdaccio/nexus搭建，替换esm.sh URL
2. **预置高频依赖**：React、Tailwind、lucide-react等预置到本地
3. **混合方案**：公共依赖本地预置，业务依赖CDN

---

## 五、关键配置常量

| 常量 | 值 | 说明 |
|:-----|:---|:-----|
| 服务端编译超时 | 5s | sucrase处理复杂TSX |
| iframe沙箱属性 | `allow-scripts allow-same-origin` | 必需属性组合 |
| 编译结果客户端缓存上限 | 50条 | FIFO淘汰 |
| 缩略图生成触发时机 | 保存时 | 非实时，节省资源 |

---

## 六、依赖解析边界情况

### 6.1 sucrase不支持的语法

编译器无法处理某些TypeScript高级特性（如复杂泛型、条件类型）。**应对**：提示用户简化代码或接入`@babel/parser`作为备选。

### 6.2 CDN资源加载失败

iframe内捕获`error`事件，回传失败依赖名称。**降级**：跳过该依赖继续渲染（可能部分功能缺失），或完全失败并提示。

### 6.3 React渲染错误

iframe内Error Boundary捕获，通过`postMessage`回传错误详情。父窗口显示友好错误提示，不清空上一个成功渲染结果。
