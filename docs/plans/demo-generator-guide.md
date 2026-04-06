# Demo Generator Agent 使用指南

## 概述

Demo Generator Agent 是 OpenCode Workbench 的专用 AI 代理，负责按照统一标准生成 Demo 文件。通过约束 AI 行为，确保生成的 `index.tsx` 和 `config.schema.json` 文件符合系统规范，可直接运行和使用。

**重要**：`.opencode` 配置属于 **Session 临时工作区**，在创建 Session 时自动注入，不影响原始 Demo 文件。

---

## 架构说明

### 目录结构

```
sessions/
└── session-{timestamp}-{random}/        # Session 临时工作区
    ├── index.tsx                        # 组件代码副本（可编辑）
    ├── config.schema.json               # 配置定义副本（可编辑）
    ├── .session.json                    # 会话元数据（系统文件）
    └── .opencode/                       # OpenCode 代理配置（自动注入）
        ├── opencode.json                # OpenCode 项目配置
        └── agents/
            └── demo-generator.md        # AI 代理提示词
```

### 生命周期

```
创建 Session ──→ 注入 .opencode ──→ 用户/AI 编辑 ──→ 保存/删除 Session
                                                   │
                                                   └──→ .opencode 被清理
```

---

## 快速开始

### 1. 自动注入（推荐）

在 Web 界面中点击"编辑 Demo"，系统自动：
- 创建 Session 临时工作区
- 注入 `.opencode` 代理配置
- 打开 OpenCode 即可使用

### 2. 手动注入（调试用）

```powershell
.\scripts\init-demo-agent.ps1 -SessionPath ".\sessions\session-xxx"
```

---

## 配置说明

### opencode.json

核心配置文件，包含以下关键字段：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "agent": {
    "demo-generator": {
      "file": ".opencode/agents/demo-generator.md",
      "description": "专门用于生成 OpenCode Demo 文件的 AI 代理",
      "tools": {
        "write": true,      // 允许写入文件
        "edit": true,       // 允许编辑文件
        "bash": false,      // 禁止执行 shell 命令
        "fetch": false      // 禁止网络请求
      }
    }
  },
  "default_agent": "demo-generator",
  "instructions": [".opencode/agents/demo-generator.md"]
}
```

**字段说明**：
- `agent.demo-generator.file`：代理提示词文件路径
- `agent.demo-generator.tools`：权限控制，限制 AI 行为
- `default_agent`：设置默认代理，OpenCode 启动时自动激活
- `instructions`：注入到 AI 上下文的指令文件

### demo-generator.md

AI 代理的系统提示词，包含：

1. **角色定位**：定义 AI 的专业领域和行为准则
2. **核心规则**：文件操作要求、代码质量标准、禁止行为
3. **工作流程**：理解需求 → 设计 Schema → 实现组件 → 验证输出
4. **自检清单**：生成前的最终验证项

---

## 使用场景

### 场景 1：创建新 Demo

**用户需求**："创建一个产品展示卡片，包含图片、标题、描述和价格"

**AI 工作流程**：
1. 分析需求，确定需要的配置项：
   - `imageUrl`（图片 URL）
   - `title`（标题）
   - `description`（描述）
   - `price`（价格）
   
2. 生成 `config.schema.json`：
   ```json
   {
     "$schema": "https://json-schema.org/draft/2020-12/schema",
     "title": "Product Card",
     "type": "object",
     "properties": {
       "imageUrl": {
         "type": "string",
         "format": "uri",
         "title": "产品图片",
         "default": "https://picsum.photos/400/300"
       },
       "title": {
         "type": "string",
         "title": "产品名称",
         "default": "精美产品"
       },
       "description": {
         "type": "string",
         "title": "产品描述",
         "default": "高质量、高性价比"
       },
       "price": {
         "type": "number",
         "title": "产品价格",
         "default": 99.99
       }
     },
     "required": ["imageUrl", "title", "price"],
     "ui:options": {
       "preview": {
         "width": "100%",
         "height": "500px"
       }
     }
   }
   ```

3. 生成 `index.tsx`：
   ```tsx
   import React from 'react';
   import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
   import { Button } from '@/components/ui/button';

   interface ProductCardProps {
     imageUrl: string;
     title: string;
     description: string;
     price: number;
   }

   export default function ProductCard({
     imageUrl,
     title,
     description,
     price
   }: ProductCardProps) {
     return (
       <Card className="w-full max-w-md">
         <CardHeader>
           <img
             src={imageUrl}
             alt={title}
             className="w-full h-48 object-cover rounded-t-lg"
           />
         </CardHeader>
         <CardContent>
           <CardTitle className="text-xl mb-2">{title}</CardTitle>
           <p className="text-gray-600 mb-4">{description}</p>
           <div className="flex items-center justify-between">
             <span className="text-2xl font-bold text-red-600">
               ¥{price.toFixed(2)}
             </span>
             <Button size="lg">立即购买</Button>
           </div>
         </CardContent>
       </Card>
     );
   }
   ```

### 场景 2：修改现有 Demo

**用户需求**："在 Banner Demo 中添加一个按钮，点击后跳转到活动页面"

**AI 工作流程**：
1. 在 Schema 中添加按钮相关配置：
   ```json
   "showButton": {
     "type": "boolean",
     "title": "显示按钮",
     "default": true
   },
   "buttonText": {
     "type": "string",
     "title": "按钮文本",
     "default": "立即参与"
   },
   "buttonLink": {
     "type": "string",
     "format": "uri",
     "title": "按钮链接",
     "default": "/activity"
   }
   ```

2. 更新组件代码：
   ```tsx
   interface BannerDemoProps {
     // ... 原有属性
     showButton: boolean;
     buttonText: string;
     buttonLink: string;
   }

   export default function BannerDemo({
     // ... 原有参数
     showButton,
     buttonText,
     buttonLink
   }: BannerDemoProps) {
     return (
       <div>
         {/* 原有内容 */}
         {showButton && (
           <Button asChild className="mt-6">
             <a href={buttonLink}>{buttonText}</a>
           </Button>
         )}
       </div>
     );
   }
   ```

---

## 自定义配置

### 修改 AI 行为

编辑 `.opencode/agents/demo-generator.md` 文件可以自定义 AI 行为规则：

1. **添加新的代码规范**：
   ```markdown
   ### 额外规范
   - 使用 React.memo 优化性能
   - 添加错误边界处理
   ```

2. **修改禁止行为**：
   ```markdown
   ### 禁止行为
   - ❌ 使用 localStorage
   - ❌ 发送网络请求
   ```

### 调整权限控制

编辑 `.opencode/opencode.json` 中的 `tools` 字段：

```json
{
  "agent": {
    "demo-generator": {
      "tools": {
        "write": true,      // 允许写入
        "edit": true,       // 允许编辑
        "bash": true,       // 允许执行命令（谨慎开启）
        "fetch": true       // 允许网络请求
      }
    }
  }
}
```

**注意**：修改权限前请确保了解潜在风险。

---

## 常见问题

### Q1: AI 没有按照规则生成文件？

**A**: 检查以下几点：
1. 确认 `.opencode` 目录存在且配置正确
2. 确认 `default_agent` 设置为 `"demo-generator"`
3. 重启 OpenCode 会话使配置生效
4. 在对话中明确说明"请按照 Demo 生成规则创建文件"

### Q2: 如何验证生成的文件是否符合规范？

**A**: 使用系统内置的校验器：
- JSON 语法校验：验证 `config.schema.json` 格式
- Props 一致性校验：检查组件 Props 与 Schema 是否匹配
- 类型检查：运行 `pnpm typecheck` 验证 TypeScript

### Q3: `.opencode` 会影响原始 Demo 文件吗？

**A**: 不会。`.opencode` 只在 Session 临时工作区中，保存 Session 时会被清理，不影响原始 Demo。

### Q4: 可以在已有项目中添加此配置吗？

**A**: 可以。使用调试脚本手动注入：
```powershell
.\scripts\init-demo-agent.ps1 -SessionPath ".\sessions\session-xxx"
```

### Q5: 调试脚本可以重复执行吗？

**A**: 可以。脚本支持幂等操作：
- 首次执行：创建配置
- 再次执行：提示已存在，跳过
- 使用 `-Force`：覆盖已有配置

---

## 最佳实践

### 1. 明确需求描述
向 AI 提供清晰、具体的需求，包括：
- Demo 的功能和用途
- 需要哪些可配置参数
- UI 布局和交互方式
- 特殊要求（如主题、颜色等）

**示例**：
```
创建一个产品展示卡片，包含：
- 产品图片（URL）
- 产品名称和描述
- 价格显示
- 购买按钮
使用卡片布局，浅色主题
```

### 2. 利用自检清单
AI 在生成文件前会执行自检，确保：
- 只修改必要的文件
- 代码符合 TypeScript 严格模式
- Schema 符合 JSON Schema 规范
- 所有属性都有合理的默认值

### 3. 验证生成结果
生成后务必检查：
- 运行 `pnpm typecheck` 验证类型
- 在预览系统中查看渲染效果
- 测试配置修改是否正常联动

### 4. 迭代优化
如果生成结果不理想：
- 向 AI 提供更详细的需求说明
- 参考已有的代码示例
- 必要时手动调整代码

---

## 技术参考

### 相关文件
- [OpenCode 配置文档](https://opencode.ai/docs/zh-cn/config/)
- [OpenCode 规则文档](https://opencode.ai/docs/zh-cn/rules/)
- [JSON Schema 规范](https://json-schema.org/)
- [Tailwind CSS 文档](https://tailwindcss.com/)
- [shadcn/ui 组件库](https://ui.shadcn.com/)

### 项目文件
- `packages/web/src/lib/session-manager.ts` - Session 管理器（包含注入逻辑）
- `scripts/init-demo-agent.ps1` - 调试脚本
- `packages/web/lib/validator.ts` - 校验器
- `packages/web/lib/parser.ts` - 分隔符解析器

---

## 更新日志

### v1.0.0 (2026-04-06)
- ✅ 初始版本发布
- ✅ 实现 Session 注入逻辑
- ✅ 编写完整的代理提示词
- ✅ 提供调试脚本
- ✅ 添加详细使用文档
