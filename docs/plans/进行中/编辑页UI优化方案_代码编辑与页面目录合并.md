# 编辑页UI优化方案：代码编辑与页面目录合并

> 版本：v1.0
> 创建日期：2026-05-04

---

## 一、当前问题分析

### 1.1 代码编辑与页面目录分离

**现状**：编辑页左侧有三个独立 Tab：
- Tab 1：AI 对话
- Tab 2：代码编辑
- Tab 3：页面

**问题**：
- "代码编辑"和"页面"在功能上高度相关（都是页面内容相关）
- 切换 Tab 时需要额外操作，打断工作流
- 页面目录中已经包含页面切换功能，与代码编辑 Tab 的页面选择器功能重复

### 1.2 项目配置展示位置不当

**现状**："项目配置"区域展示在页面列表中，包含一个"添加配置/编辑配置"按钮。

**问题**：
- 项目配置当前不支持用户直接编辑（点击后弹出 toast 提示"高级功能，请通过 AI 对话管理"）
- 将不可操作的配置展示在页面列表中，占用空间且造成困惑
- 项目配置与页面列表属于不同层级，混在一起不符合信息架构原则

### 1.3 页面操作入口不明显

**现状**：页面列表项只显示名称和"当前"标签。

**问题**：
- 缺少页面级操作入口（查看代码、重命名、删除、复制）
- 用户需要通过其他方式（如 AI 对话）才能执行这些操作
- 操作效率低

---

## 二、优化目标

1. **简化 Tab 结构**：将"代码编辑"与"页面"合并为一个 Tab，减少切换成本
2. **移除不可操作的项目配置**：从页面列表中移除项目配置区域，避免误导
3. **增强页面操作能力**：为每个页面提供便捷的本地操作入口

---

## 三、优化方案

### 3.1 Tab 结构重构

**优化后结构**：
```
┌─────────────────────────────────────────┐
│  [AI 对话]  [页面]  [预览]              │
─────────────────────────────────────────┘
```

**说明**：
- 将"代码编辑"和"页面"合并为"页面"一个 Tab
- 保留"AI 对话"作为独立 Tab
- 移除独立的"代码编辑" Tab

### 3.2 "页面"Tab 布局

```
┌─ 页面与代码 Tab ──────────────────────────────────────────────────┐
│                                                                     │
│  📄 页面列表                                          [+ 新建页面] │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ 1  默认页面                                    ⋮ [当前]     │ │
│  │ 2  登录页面                                  ⋮              │ │
│  │ 3  商品详情                                ⋮                │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ───────────────── 分隔线 ─────────────────                         │
│                                                                     │
│  💡 提示：你也可以通过 AI 对话直接管理页面和项目配置                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**关键变化**：
- 移除"项目配置"区域
- 每个页面右侧增加"更多"图标（⋮，三个竖点）
- 点击"更多"图标弹出操作气泡

### 3.3 页面操作气泡

**气泡内容**：
```
┌─────────────────┐
│   查看代码    │
│  ✏️ 重命名      │
│   复制页面    │
│  🗑️ 删除页面    │
─────────────────┘
```

**操作说明**：

| 操作 | 行为 | 注意事项 |
|------|------|----------|
| 查看代码 | 弹窗展示当前页面的完整代码（只读） | 使用 Monaco Editor 或代码高亮组件 |
| 重命名 | 弹出输入框，用户输入新名称后确认 | 需校验名称唯一性 |
| 复制页面 | 复制当前页面为"页面名称 - 副本" | 复制 index.tsx、config.schema.json、.demo.json |
| 删除页面 | 弹出确认对话框，确认后删除 | 最后一个页面不允许删除 |

### 3.4 查看代码弹窗

**弹窗布局**：
```
┌─ 查看代码 - 默认页面 ───────────────────────────────────┐
│                                                          │
│   index.tsx          [📋 config.schema.json]           │
│  ┌──────────────────────────────────────────────────── │
│  │  import React from 'react';                        │ │
│  │  interface DemoProps { ... }                       │ │
│  │  export default function Demo(...) { ... }         │ │
│  │                                                    │ │
│  │  （代码内容，可编辑模式）                          │ │
│  │                                                    │ │
│  └──────────────────────────────────────────────────── │
│                                                          │
│                                          [保存] [关闭]   │
──────────────────────────────────────────────────────────┘
```

**功能说明**：
- 弹窗标题显示页面名称
- Tab 切换查看 index.tsx 和 config.schema.json
- 代码使用可编辑模式（支持直接修改代码）
- 支持代码语法高亮
- 支持一键复制代码
- 支持保存修改到后端

---

## 四、技术实现要点

### 4.1 移除项目配置区域

**位置**：`packages/web/src/app/demo/[id]/edit/page.tsx` 第 884-901 行

```tsx
// 删除以下代码块：
{/* 项目配置 */}
<div className="rounded-lg border bg-card p-3">
  <div className="flex items-center justify-between mb-2">
    <h3 className="text-sm font-medium">📋 项目配置</h3>
    <Button variant="ghost" size="sm" className="h-7 text-xs"
      onClick={() => {
        toast({ title: "项目配置编辑", description: "高级功能，请通过 AI 对话管理项目配置" });
      }}
    >
      {projectConfigSchema ? "编辑配置" : "添加配置"}
    </Button>
  </div>
  <p className="text-xs text-muted-foreground">
    {projectConfigSchema ? "已设置项目级共享配置" : "未设置项目级共享配置"}
  </p>
</div>
```

### 4.2 页面列表项增加操作入口

**位置**：`packages/web/src/app/demo/[id]/edit/page.tsx` 第 945-986 行

```tsx
// 新增组件：页面操作气泡
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Eye, Edit, Copy, Trash } from "lucide-react";

// 页面列表项修改：
<div className="flex items-center justify-between px-3 py-2 rounded-md text-sm cursor-pointer transition-colors">
  <div className="flex items-center gap-2">
    <span className="text-xs text-muted-foreground w-5">{index + 1}</span>
    <span className="font-medium">{page.name}</span>
  </div>
  <div className="flex items-center gap-1">
    {activeDemoId === page.id && (
      <Badge variant="secondary" className="text-[10px] h-5">当前</Badge>
    )}
    
    {/* 新增：更多操作按钮 */}
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleViewCode(page)}>
          <Eye className="mr-2 h-4 w-4" />
          查看代码
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleRename(page)}>
          <Edit className="mr-2 h-4 w-4" />
          重命名
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleCopyPage(page)}>
          <Copy className="mr-2 h-4 w-4" />
          复制页面
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => handleDeletePage(page)}
          className="text-destructive"
        >
          <Trash className="mr-2 h-4 w-4" />
          删除页面
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</div>
```

### 4.3 新增页面操作函数

```tsx
// 查看代码
const handleViewCode = async (page: DemoPage) => {
  if (!sessionId) return;
  try {
    const res = await fetch(`/api/sessions/${sessionId}/files/${page.id}`);
    const data = await res.json();
    if (data.success) {
      setViewCodeDialogOpen(true);
      setViewCodeData({
        code: data.data.code,
        schema: data.data.schema,
        pageName: page.name,
      });
    }
  } catch (err) {
    toast({ title: "加载失败", variant: "destructive" });
  }
};

// 重命名
const handleRename = async (page: DemoPage) => {
  const newName = prompt("请输入新页面名称:", page.name);
  if (!newName || newName === page.name) return;
  
  try {
    const res = await fetch(`/api/projects/${demoId}/demos/${page.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    });
    const data = await res.json();
    if (data.success) {
      setDemoPages((prev) =>
        prev.map((p) => (p.id === page.id ? { ...p, name: newName } : p))
      );
      toast({ title: "重命名成功" });
    }
  } catch (err) {
    toast({ title: "重命名失败", variant: "destructive" });
  }
};

// 复制页面
const handleCopyPage = async (page: DemoPage) => {
  if (!sessionId) return;
  
  try {
    const res = await fetch(`/api/projects/${demoId}/demos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        sessionId, 
        name: `${page.name} - 副本`,
        sourcePageId: page.id // 可选：传递源页面 ID 用于复制文件
      }),
    });
    const data = await res.json();
    if (data.success) {
      setDemoPages((prev) => [...prev, data.data].sort((a, b) => a.order - b.order));
      toast({ title: "页面复制成功" });
    }
  } catch (err) {
    toast({ title: "复制失败", variant: "destructive" });
  }
};

// 删除页面
const handleDeletePage = async (page: DemoPage) => {
  if (demoPages.length <= 1) {
    toast({ title: "无法删除", description: "至少保留一个页面", variant: "destructive" });
    return;
  }
  
  const confirmed = confirm(`确定要删除"${page.name}"吗？此操作不可撤销。`);
  if (!confirmed) return;
  
  try {
    const res = await fetch(`/api/projects/${demoId}/demos/${page.id}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (data.success) {
      setDemoPages((prev) => prev.filter((p) => p.id !== page.id));
      if (activeDemoId === page.id) {
        // 切换到其他页面
        const next = demoPages.find((p) => p.id !== page.id);
        if (next) setActiveDemoId(next.id);
      }
      toast({ title: "删除成功" });
    }
  } catch (err) {
    toast({ title: "删除失败", variant: "destructive" });
  }
};
```

### 4.4 新增查看代码弹窗组件

```tsx
// 新建组件：packages/web/src/components/demo/code-view-dialog.tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Copy, Save } from "lucide-react";

interface CodeViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  code: string;
  schema: string;
  pageName: string;
  sessionId: string;
  demoId: string;
  onSave: (type: 'code' | 'schema', content: string) => Promise<void>;
}

export function CodeViewDialog({ open, onOpenChange, code, schema, pageName, sessionId, demoId, onSave }: CodeViewDialogProps) {
  const [activeCode, setActiveCode] = useState(code);
  const [activeSchema, setActiveSchema] = useState(schema);
  const [activeTab, setActiveTab] = useState('code');

  const handleCopyCode = () => {
    const content = activeTab === 'code' ? activeCode : activeSchema;
    navigator.clipboard.writeText(content);
    toast({ title: "代码已复制" });
  };

  const handleSave = async () => {
    try {
      await onSave(activeTab as 'code' | 'schema', activeTab === 'code' ? activeCode : activeSchema);
      toast({ title: "保存成功" });
      onOpenChange(false);
    } catch (err) {
      toast({ title: "保存失败", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>查看代码 - {pageName}</DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="code" className="flex-1 flex flex-col" onValueChange={setActiveTab}>
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="code">index.tsx</TabsTrigger>
              <TabsTrigger value="schema">config.schema.json</TabsTrigger>
            </TabsList>
            <Button variant="ghost" size="sm" onClick={handleCopyCode}>
              <Copy className="h-4 w-4 mr-1" />
              复制
            </Button>
          </div>
          
          <TabsContent value="code" className="flex-1 overflow-auto">
            <textarea
              className="w-full h-full text-sm bg-muted p-4 rounded-md font-mono resize-none"
              value={activeCode}
              onChange={(e) => setActiveCode(e.target.value)}
            />
          </TabsContent>
          
          <TabsContent value="schema" className="flex-1 overflow-auto">
            <textarea
              className="w-full h-full text-sm bg-muted p-4 rounded-md font-mono resize-none"
              value={activeSchema}
              onChange={(e) => setActiveSchema(e.target.value)}
            />
          </TabsContent>
        </Tabs>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={handleSave}>
            <Save className="h-4 w-4 mr-1" />
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

---

## 五、后端 API 支持

### 5.1 现有 API 端点

| 端点 | 方法 | 用途 | 状态 |
|------|------|------|------|
| `/api/projects/{projectId}/demos` | POST | 创建页面 | ✅ 已存在 |
| `/api/projects/{projectId}/demos/{demoId}` | DELETE | 删除页面 | ✅ 已存在 |
| `/api/projects/{projectId}/demos/{demoId}` | PATCH | 更新页面（重命名） | ✅ 已存在 |
| `/api/sessions/{sessionId}/files/{pageId}` | GET | 获取页面代码 | ✅ 已存在 |

### 5.2 复制页面 API 增强

**后端需要支持**：在创建页面时传递 `sourcePageId` 参数，用于复制源页面的文件内容。

```typescript
// packages/web/src/app/api/projects/[projectId]/demos/route.ts
// POST 处理逻辑增强
if (sourcePageId) {
  // 从源页面复制文件
  const sourceDir = path.join(workspaceRoot, "demos", sourcePageId);
  const newDir = path.join(workspaceRoot, "demos", newDemoId);
  await fs.cp(sourceDir, newDir, { recursive: true });
}
```

---

## 六、验收标准

- [ ] 编辑页左侧 Tab 从 3 个减少为 2 个（AI 对话 + 页面与代码）
- [ ] "页面与代码" Tab 中不再显示"项目配置"区域
- [ ] 每个页面右侧显示"更多"图标（三个竖点）
- [ ] 点击"更多"图标弹出气泡，包含 4 个操作选项
- [ ] "查看代码"功能：弹窗展示代码，支持 Tab 切换 index.tsx 和 config.schema.json
- [ ] "重命名"功能：弹出输入框，输入后确认重命名
- [ ] "复制页面"功能：复制页面及其所有文件
- [ ] "删除页面"功能：弹出确认对话框，确认后删除
- [ ] 最后一个页面不允许删除，给出提示

---

## 七、风险与注意事项

### 7.1 复制页面的后端支持

**风险**：现有创建页面 API 可能不支持 `sourcePageId` 参数。

**应对**：
- 先检查后端实现是否支持
- 如不支持，需要修改后端路由处理逻辑
- 复制时需同时复制 index.tsx、config.schema.json、.demo.json 三个文件

### 7.2 查看代码弹窗的性能

**风险**：大文件代码展示可能影响性能。

**应对**：
- 使用虚拟列表或延迟加载
- 限制单次加载的文件大小（如超过 1MB 提示用户）
- 考虑使用 Monaco Editor 的只读模式，提供更好的代码查看体验

### 7.3 页面删除后的状态恢复

**风险**：删除当前页面后，需要切换到其他页面，状态管理可能出错。

**应对**：
- 删除当前页面时，自动切换到第一个可用页面
- 确保所有状态（代码、schema、配置数据）同步更新
- 添加充分的错误处理

---

## 八、实施建议

### 8.1 分阶段实施

**阶段 1**（核心功能）：
- 合并 Tab 结构
- 移除项目配置区域
- 实现页面操作气泡（查看代码、删除）

**阶段 2**（增强功能）：
- 实现重命名功能
- 实现复制页面功能（需后端支持）

### 8.2 测试要点

- Tab 切换后页面状态正确恢复
- 页面操作后列表正确更新
- 删除最后一页时正确拦截
- 查看代码弹窗正确展示文件内容
- 重命名时正确处理特殊字符和长度限制
