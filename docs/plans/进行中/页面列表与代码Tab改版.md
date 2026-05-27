# 项目编辑页左侧栏改版方案 - 新增代码 Tab

> 版本:v1.0  
> 创建日期:2026-05-27  
> 状态:待实施

---

## 一、需求概述

### 1.1 变更目标

在现有项目编辑页左侧栏的 **[💬 AI 对话]** 和 **[📄 页面]** 两个 Tab 基础上,新增 **[📁 代码]** Tab,提供项目文件的可视化管理和编辑能力。

### 1.2 核心价值

| 价值点 | 说明 |
| --- | --- |
| 全文件可见 | 用户可浏览整个 workspace 目录结构,理解项目组织 |
| 精准编辑 | 区分只读和可编辑文件,避免误修改关键文件 |
| 编辑体验优化 | 使用 CodeMirror 6 替换现有编辑器,解决光标错位问题 |
| 三模操作 | AI 对话(自然语言)+ 页面管理(可视化)+ 代码编辑(源码级) |

---

## 二、UI 布局设计

### 2.1 左侧栏 Tab 结构

**优化前**:
```
[💬 AI 对话]  [📄 页面]
```

**优化后**:
```
[💬 AI 对话]  [📄 页面]  [📁 代码]
```

### 2.2 代码 Tab 布局

```
┌─ 代码 Tab ──────────────────────────────────────────────┐
│                                                          │
│  📁 workspace/                                           │
│  ┌─ 文件树(可展开/折叠)────────────────────────────────┐│
│  │                                                      ││
│  │  📁 demos/                              ▼  (可编辑) ││
│  │  📁   demo_001/                         ▼           ││
│  │  📄     index.tsx                      👁 ✏️        ││
│  │  📄     config.schema.json              👁 ✏️        ││
│  │  📄     .demo.json                     👁           ││
│  │  📁   demo_002/                         ▶           ││
│  │  📁 src/                                ▶           ││
│  │  📁 node_modules/                       ▶           ││
│  │  📄 project.config.schema.json          👁 ✏️        ││
│  │  📄 package.json                        👁           ││
│  │  📄 tsconfig.json                       👁           ││
│  │  ...                                                   ││
│  │                                                      ││
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  💡 点击文件可查看代码,可编辑文件支持保存修改            │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**图标说明**:
- 👁 = 只读文件(只能查看)
- 👁 ✏️ = 可编辑文件(查看 + 编辑 + 保存)

---

## 三、文件树功能

### 3.1 数据获取

**API 接口**:
```
GET /api/sessions/{sessionId}/workspace/files
```

**响应格式**:
```typescript
interface WorkspaceFileTree {
  path: string;          // 文件相对路径
  type: 'file' | 'directory';
  name: string;          // 文件名/文件夹名
  children?: WorkspaceFileTree[];  // 子项(仅目录)
  size?: number;         // 文件大小(字节)
}
```

### 3.2 文件编辑权限判定

```typescript
function isFileEditable(filePath: string): boolean {
  // 可编辑文件模式
  const editablePatterns = [
    /^demos\/[^/]+\/index\.tsx$/,              // 页面组件代码
    /^demos\/[^/]+\/config\.schema\.json$/,    // 页面配置 Schema
    /^project\.config\.schema\.json$/,         // 项目全局配置 Schema
  ];
  
  return editablePatterns.some(pattern => pattern.test(filePath));
}
```

### 3.3 文件树交互规则

| 操作 | 行为 | 视觉反馈 |
| --- | --- | --- |
| **展开文件夹** | 点击文件夹图标或名称 | 图标从 📁▶ 变为 📁▼ |
| **折叠文件夹** | 点击已展开的文件夹 | 图标从 📁▼ 变为 📁▶ |
| **查看文件** | 点击文件名 | 弹窗展示代码(只读模式) |
| **编辑文件** | 点击可编辑文件的编辑图标 | 弹窗展示代码(编辑模式) |
| **懒加载** | 首次展开文件夹时加载子项 | 显示加载动画 |

---

## 四、代码编辑窗口优化

### 4.1 技术选型:CodeMirror 6

**选择理由**:
- 轻量级核心(~25KB gzipped),比 Monaco Editor 小 10 倍
- 光标定位准确,解决现有 `react-simple-code-editor` 的光标错位问题
- 支持 TypeScript/JSON 语法高亮
- API 简洁,易于集成只读/编辑模式切换
- 性能优秀,支持大文件渲染

**依赖安装**:
```bash
pnpm add @codemirror/lang-javascript @codemirror/lang-json @codemirror/state @codemirror/view @uiw/codemirror-theme-vscode
```

### 4.2 弹窗布局

```
┌─ 查看代码 - {文件路径} ───────────────────────────────┐
│                                                        │
│  [只读模式 | 编辑模式]                     [📋 复制]  │
│  ┌──────────────────────────────────────────────────┐│
│  │                                                  ││
│  │  import React from 'react';                      ││
│  │  interface DemoProps { ... }                     ││
│  │  export default function Demo(...) { ... }       ││
│  │                                                  ││
│  │  (CodeMirror 6 编辑器)                            ││
│  │                                                  ││
│  └──────────────────────────────────────────────────┘│
│                                                        │
│                                  [关闭]  [保存]        │
└────────────────────────────────────────────────────────┘
```

### 4.3 模式切换逻辑

| 文件类型 | 默认模式 | 可切换 | 保存按钮 |
| --- | --- | --- | --- |
| index.tsx | 编辑模式 | 否 | 显示 |
| config.schema.json | 编辑模式 | 否 | 显示 |
| project.config.schema.json | 编辑模式 | 否 | 显示 |
| 其他文件 | 只读模式 | 否 | 隐藏 |

### 4.4 CodeMirror 6 配置

```typescript
import { EditorView, basicSetup } from 'codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';

interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language: 'typescript' | 'json';
  readOnly?: boolean;
}

function CodeEditor({ value, onChange, language, readOnly }: CodeEditorProps) {
  const extensions = [
    basicSetup,
    language === 'typescript' ? javascript({ typescript: true, jsx: true }) : json(),
    vscodeDark,
    readOnly ? EditorView.editable.of(false) : [],
    onChange ? EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChange(update.state.doc.toString());
      }
    }) : [],
  ];
  
  return <ReactCodeMirror value={value} extensions={extensions} />;
}
```

---

## 五、数据流设计

### 5.1 文件树加载流程

```
用户切换到【代码】Tab
      │
      ▼
GET /api/sessions/{sessionId}/workspace/files?path=/
      │
      ▼
返回根目录文件树(仅第一层)
      │
      ▼
渲染文件树(文件夹默认折叠)
      │
      ▼
用户点击展开文件夹
      │
      ▼
GET /api/sessions/{sessionId}/workspace/files?path={folderPath}
      │
      ▼
合并到文件树中
```

### 5.2 文件查看/编辑流程

```
用户点击文件
      │
      ├─ 只读文件?
      │   │
      │   ▼
      │   GET /api/sessions/{sessionId}/workspace/files/{filePath}
      │   │
      │   ▼
      │   弹窗展示(CodeMirror 只读模式)
      │
      └─ 可编辑文件?
          │
          ▼
          GET /api/sessions/{sessionId}/workspace/files/{filePath}
          │
          ▼
          弹窗展示(CodeMirror 编辑模式)
          │
          ▼
          用户修改代码
          │
          ▼
          点击"保存" → PUT /api/sessions/{sessionId}/workspace/files/{filePath}
          │
          ▼
          更新文件内容,关闭弹窗
```

---

## 六、前端组件架构

### 6.1 新增组件

| 组件 | 职责 |
| --- | --- |
| `WorkspaceFileTree` | 文件树容器,管理展开状态、懒加载、文件点击 |
| `WorkspaceFileTreeItem` | 单个文件/文件夹项,集成图标、名称、操作按钮 |
| `WorkspaceCodeDialog` | 代码查看/编辑弹窗,集成 CodeMirror 6 |

### 6.2 组件拆分

**WorkspaceFileTree**:
```typescript
interface WorkspaceFileTreeProps {
  sessionId: string;
  onFileSelect: (filePath: string, editable: boolean) => void;
}
```

**WorkspaceFileTreeItem**:
```typescript
interface WorkspaceFileTreeItemProps {
  file: WorkspaceFileTree;
  depth: number;
  onExpand: (path: string) => void;
  onFileSelect: (filePath: string) => void;
  expandedFolders: Set<string>;
}
```

**WorkspaceCodeDialog**:
```typescript
interface WorkspaceCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filePath: string;
  content: string;
  editable: boolean;
  onSave: (content: string) => Promise<void>;
}
```

### 6.3 Tab 结构更新

**文件**: `packages/author-site/src/app/demo/[id]/edit/page.tsx`

```typescript
// 现有 Tab
const [tabValue, setTabValue] = useState("ai");

// 新增 Tab 触发器
<TabsList>
  <TabsTrigger value="ai">💬 AI 对话</TabsTrigger>
  <TabsTrigger value="pages">📄 页面</TabsTrigger>
  <TabsTrigger value="code">📁 代码</TabsTrigger>  {/* 新增 */}
</TabsList>

<TabsContent value="code">  {/* 新增 */}
  <WorkspaceFileTree
    sessionId={sessionId}
    onFileSelect={handleWorkspaceFileSelect}
  />
</TabsContent>
```

---

## 七、API 接口扩展

### 7.1 工作空间文件管理

| 方法 | 路由 | 说明 |
| --- | --- | --- |
| `GET` | `/api/sessions/{sessionId}/workspace/files?path={path}` | 获取目录文件列表(支持懒加载) |
| `GET` | `/api/sessions/{sessionId}/workspace/files/{filePath}` | 获取单个文件内容 |
| `PUT` | `/api/sessions/{sessionId}/workspace/files/{filePath}` | 更新文件内容(仅限可编辑文件) |

### 7.2 请求/响应示例

**获取目录**:
```
GET /api/sessions/{sessionId}/workspace/files?path=/demos/demo_001
```

**响应**:
```json
{
  "success": true,
  "data": {
    "path": "/demos/demo_001",
    "type": "directory",
    "children": [
      { "path": "index.tsx", "type": "file", "size": 2048 },
      { "path": "config.schema.json", "type": "file", "size": 512 },
      { "path": ".demo.json", "type": "file", "size": 256 }
    ]
  }
}
```

**获取文件**:
```
GET /api/sessions/{sessionId}/workspace/files/demos/demo_001/index.tsx
```

**响应**:
```json
{
  "success": true,
  "data": {
    "path": "demos/demo_001/index.tsx",
    "content": "import React from 'react';\n...",
    "editable": true
  }
}
```

**更新文件**:
```
PUT /api/sessions/{sessionId}/workspace/files/demos/demo_001/index.tsx
Content-Type: application/json

{
  "content": "import React from 'react';\n..."
}
```

---

## 八、后端实现要点

### 8.1 文件树扫描逻辑

```typescript
// packages/agent-service/src/routes/workspace.ts
async function scanDirectory(
  basePath: string,
  relativePath: string,
  maxDepth: number = 1,
): Promise<WorkspaceFileTree> {
  const fullPath = path.join(basePath, relativePath);
  const stats = await fs.stat(fullPath);
  
  if (stats.isFile()) {
    return {
      path: relativePath,
      type: 'file',
      name: path.basename(relativePath),
      size: stats.size,
    };
  }
  
  if (stats.isDirectory()) {
    const children = maxDepth > 0
      ? (await fs.readdir(fullPath)).map(async (name) => {
          const childPath = path.join(relativePath, name);
          return scanDirectory(basePath, childPath, maxDepth - 1);
        })
      : [];
    
    return {
      path: relativePath,
      type: 'directory',
      name: path.basename(relativePath) || 'workspace',
      children: await Promise.all(children),
    };
  }
}
```

### 8.2 文件编辑权限校验

```typescript
// 后端需校验可编辑文件白名单
function isFileEditable(filePath: string): boolean {
  const editablePatterns = [
    /^demos\/[^/]+\/index\.tsx$/,
    /^demos\/[^/]+\/config\.schema\.json$/,
    /^project\.config\.schema\.json$/,
  ];
  
  return editablePatterns.some(pattern => pattern.test(filePath));
}

// PUT 接口需校验
router.put('/workspace/files/:filePath', async (req, res) => {
  const { filePath } = req.params;
  
  if (!isFileEditable(filePath)) {
    return res.status(403).json({
      success: false,
      error: { code: 'FILE_NOT_EDITABLE', message: '该文件不可编辑' }
    });
  }
  
  // 执行文件写入...
});
```

---

## 九、状态管理

### 9.1 代码 Tab 状态

```typescript
// 文件树状态
const [fileTree, setFileTree] = useState<WorkspaceFileTree | null>(null);
const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());

// 代码弹窗状态
const [codeDialogOpen, setCodeDialogOpen] = useState(false);
const [codeDialogContent, setCodeDialogContent] = useState({
  filePath: '',
  content: '',
  editable: false,
});
```

### 9.2 懒加载缓存策略

```typescript
// 已加载的目录内容缓存(避免重复请求)
const [loadedPaths, setLoadedPaths] = useState<Set<string>>(new Set());

const handleExpandFolder = async (folderPath: string) => {
  if (loadedPaths.has(folderPath)) {
    // 已加载,直接切换展开状态
    toggleExpanded(folderPath);
    return;
  }
  
  // 懒加载
  setLoadingPaths(prev => new Set(prev).add(folderPath));
  const children = await fetchWorkspaceFiles(folderPath);
  setFileTree(mergeIntoTree(fileTree, folderPath, children));
  setLoadedPaths(prev => new Set(prev).add(folderPath));
  setLoadingPaths(prev => {
    const next = new Set(prev);
    next.delete(folderPath);
    return next;
  });
  toggleExpanded(folderPath);
};
```

---

## 十、实施计划

### 10.1 阶段一:基础设施

| 任务 | 文件 | 工作量 |
| --- | --- | --- |
| 安装 CodeMirror 6 依赖 | `package.json` | 0.5h |
| 封装 CodeEditor 组件 | `components/demo/CodeEditor.tsx` | 2h |
| 实现文件编辑权限判定工具 | `lib/workspace-file-utils.ts` | 1h |

### 10.2 阶段二:后端 API

| 任务 | 文件 | 工作量 |
| --- | --- | --- |
| 实现 GET /workspace/files 接口 | `agent-service/src/routes/workspace.ts` | 3h |
| 实现 PUT /workspace/files/{path} 接口 | `agent-service/src/routes/workspace.ts` | 2h |
| 添加文件权限校验中间件 | `agent-service/src/middleware/file-auth.ts` | 1h |
| 编写 API 测试 | `agent-service/src/__tests__/workspace.test.ts` | 2h |

### 10.3 阶段三:前端组件

| 任务 | 文件 | 工作量 |
| --- | --- | --- |
| 实现 WorkspaceFileTree 组件 | `components/demo/WorkspaceFileTree.tsx` | 3h |
| 实现 WorkspaceFileTreeItem 组件 | `components/demo/WorkspaceFileTreeItem.tsx` | 2h |
| 实现 WorkspaceCodeDialog 组件 | `components/demo/WorkspaceCodeDialog.tsx` | 2h |
| 集成到编辑页 Tab 结构 | `app/demo/[id]/edit/page.tsx` | 1h |

### 10.4 阶段四:测试与优化

| 任务 | 工作量 |
| --- | --- |
| 端到端测试文件树展开/折叠 | 1h |
| 测试可编辑文件保存流程 | 1h |
| 测试只读文件查看 | 0.5h |
| 性能优化(大目录懒加载) | 1h |

**总工作量**: ~19h (约 2.5 个工作日)

---

## 十一、验收标准

- [ ] 编辑页左侧栏显示 3 个 Tab:AI 对话、页面、代码
- [ ] 代码 Tab 展示完整的 workspace 文件树
- [ ] 文件夹支持展开/折叠,懒加载子项
- [ ] 点击文件弹出代码查看弹窗
- [ ] 可编辑文件(index.tsx、config.schema.json、project.config.schema.json)支持编辑和保存
- [ ] 其他文件仅支持只读查看
- [ ] CodeMirror 6 编辑器光标定位准确,无错位问题
- [ ] 支持 TypeScript 和 JSON 语法高亮
- [ ] 后端 API 校验文件编辑权限,拒绝非法修改
- [ ] 文件树加载性能良好(大目录不卡顿)

---

## 十二、技术风险与缓解

| 风险 | 影响 | 缓解措施 |
| --- | --- | --- |
| CodeMirror 6 体积过大 | 打包体积增加 | 按需加载语言包,使用 tree-shaking |
| 大文件树渲染性能 | 文件树卡顿 | 虚拟滚动 + 懒加载,限制首次加载深度 |
| 文件编辑冲突 | 数据丢失 | 后端校验文件版本,前端提示刷新 |
| 目录权限泄漏 | 安全风险 | 后端严格校验路径,禁止访问 workspace 外文件 |

---

## 十三、相关文档

### 13.1 现有文档

- [03_页面列表与代码查看.md](./03_页面列表与代码查看.md) - 当前页面列表功能设计
- [编辑页UI优化方案_代码编辑与页面目录合并.md](../../../../plans/已完成/UI优化/编辑页UI优化方案_代码编辑与页面目录合并.md)
- [页面列表拖拽排序与文件夹层级优化方案.md](../../../../plans/已完成/页面/页面列表拖拽排序与文件夹层级优化方案.md)

### 13.2 关联模块

- `packages/author-site/src/app/demo/[id]/edit/page.tsx` - 编辑页主组件
- `packages/author-site/src/components/demo/code-view-dialog.tsx` - 现有代码查看弹窗(需替换)
- `packages/agent-service/src/routes/` - Agent 服务路由(需新增 workspace 路由)

---

## 十四、未来优化方向

| 方向 | 说明 | 优先级 |
| --- | --- | --- |
| 文件搜索 | 支持文件名快速搜索 | P2 |
| 代码 diff | 显示文件修改前后对比 | P2 |
| 文件操作 | 支持新建、删除、重命名文件 | P3 |
| Git 集成 | 显示文件 Git 状态 | P3 |
| 多文件编辑 | 支持同时打开多个文件 | P3 |
