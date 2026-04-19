# 解决方案：AI 生成代码时依赖缺失问题

> **文档版本**: v3.0（最终方案）  
> **创建时间**: 2026-04-12  
> **状态**: ✅ 待实施

---

## 一、问题分析

### 1.1 现象

AI 生成代码后，Sandpack 预览区报错：

```
Could not find dependency: 'clsx' relative to '/Demo.tsx'
```

### 1.2 根本原因

**三层信息断裂**：

```
┌─────────────────────────────────────────────────────────┐
│ 断裂层 1: AI 系统提示词                                  │
│ ❌ 未声明可用依赖清单                                     │
│ ❌ AI 不知道哪些包已预装                                  │
├─────────────────────────────────────────────────────────┤
│ 断裂层 2: 工作目录                                       │
│ ❌ 缺少 package.json                                     │
│ ❌ AI 无法读取项目依赖信息                                │
├─────────────────────────────────────────────────────────┤
│ 断裂层 3: Sandpack 配置                                  │
│ ❌ 依赖列表硬编码且不完整                                 │
│ ❌ 无法动态添加 AI 声明的新依赖                           │
└─────────────────────────────────────────────────────────┘
```

### 1.3 影响范围

- **当前**：仅 `clsx` 和 `tailwind-merge`（已手动添加）
- **潜在**：AI 可能使用动画库、图标库等未声明的包

---

## 二、解决方案

### 2.1 方案架构

```
┌──────────────────────────────────────────────────────┐
│ 第一层：预声明常用依赖（覆盖 85% 场景）                 │
│ 文件: PreviewPanel.tsx                                │
│ 动作: 扩展 customSetup.dependencies                   │
├──────────────────────────────────────────────────────┤
│ 第二层：AI 提示词增强（解决根源问题）                   │
│ 文件: 各后端 buildSystemPrompt() 方法                  │
│ 动作: 注入可用依赖清单 + @dependency 注释规范          │
├──────────────────────────────────────────────────────┤
│ 第三层：注释解析提取（支持动态依赖）                    │
│ 文件: sandpack-deps.ts（新建）                        │
│ 动作: 解析 // @dependency 注释，自动添加依赖           │
└──────────────────────────────────────────────────────┘
```

### 2.2 方案对比

| 维度 | 原方案（依赖图谱） | 最终方案（分层渐进） |
|------|-------------------|---------------------|
| 代码量 | 800+ 行 | 80 行 |
| 实施时间 | 4-7 天 | 2 小时 - 1 天 |
| 维护成本 | 高（映射表、脚本） | 低（依赖列表、提示词） |
| 技术风险 | 高（Sandpack API 限制） | 低（成熟方案） |
| 推荐度 | ❌ 弃用 | ✅ 采用 |

---

## 三、实施步骤

### 3.1 第一层：预声明常用依赖

**目标**：覆盖 shadcn/ui 生态常用包，解决 85% 场景。

**文件**：`packages/web/components/demo/PreviewPanel.tsx`

**修改位置**：第 127-136 行

```typescript
// 当前代码
customSetup={{
  dependencies: {
    react: "^18.0.0",
    "react-dom": "^18.0.0",
    clsx: "^2.1.0",
    "tailwind-merge": "^2.2.0",
  },
}}

// 修改为
customSetup={{
  dependencies: {
    // 核心依赖
    react: "^18.0.0",
    "react-dom": "^18.0.0",
    
    // shadcn/ui 工具库
    clsx: "^2.1.0",
    "tailwind-merge": "^2.2.0",
    "class-variance-authority": "^0.7.0",
    
    // UI 库
    "lucide-react": "^0.323.0",
    
    // 动画库
    "framer-motion": "^10.0.0",
  },
}}
```

**依赖清单说明**：

| 依赖 | 用途 | 必要性 | 来源 |
|------|------|--------|------|
| react, react-dom | React 核心 | 🔴 必需 | 项目 package.json |
| clsx, tailwind-merge | 样式类名合并 | 🔴 必需 | shadcn/ui 标配 |
| class-variance-authority | 组件变体系统 | 🟡 高概率 | shadcn/ui 组件使用 |
| lucide-react | 图标库 | 🟡 高概率 | shadcn/ui 图标使用 |
| framer-motion | 动画库 | 🟢 可能使用 | AI 可能生成动画 |

**验证**：
```bash
# 启动开发服务器
pnpm dev:web

# 测试现有 demo 是否正常
# 访问 http://localhost:3100/demo/[id]/edit
```

---

### 3.2 第二层：AI 提示词增强

**目标**：从根源解决 AI 不知道依赖的问题。

**影响范围**：所有 ACP 后端（共 6 个文件）

| 文件 | 后端名称 | 修改位置 |
|------|---------|---------|
| `packages/agent-service/src/backends/claude.ts` | Claude | 第 68-76 行 |
| `packages/agent-service/src/backends/codex.ts` | Codex | 第 67-75 行 |
| `packages/agent-service/src/backends/gemini.ts` | Gemini | 第 65-73 行 |
| `packages/agent-service/src/backends/qwen.ts` | Qwen | 需确认 |
| `packages/agent-service/src/backends/qoder.ts` | Qoder | 需确认 |
| `packages/agent-service/src/backends/kimi.ts` | Kimi | 需确认 |

**修改内容**：替换 `buildSystemPrompt()` 方法

```typescript
private buildSystemPrompt(): string {
  const parts = [
    '你是专业的全栈开发助手，负责生成 React 组件代码。',
    '',
    '## 可用依赖',
    '以下依赖已在预览环境中预装，可直接使用：',
    '',
    '### 核心依赖',
    '- react, react-dom（React 框架）',
    '- tailwindcss（样式系统，通过 CDN 加载）',
    '',
    '### 工具库',
    '- clsx, tailwind-merge（样式类名合并）',
    '- class-variance-authority（组件变体系统）',
    '',
    '### UI 库',
    '- lucide-react（图标库）',
    '- framer-motion（动画库）',
    '',
    '## 代码规范',
    '- 使用 TypeScript',
    '- 使用 Tailwind CSS 样式',
    '- 默认导出 React 组件',
    '- 使用 clsx + tailwind-merge 处理动态类名',
    '',
    '## 使用非常规依赖',
    '如需使用上述列表外的 npm 包，请在代码顶部用注释声明：',
    '```typescript',
    '// @dependency package-name',
    '// @dependency another-package@^1.0.0',
    '',
    'import React from \'react\';',
    '// ... 你的代码',
    '```',
  ];

  if (this.config.workingDir) {
    parts.push('', `Working directory: ${this.config.workingDir}`);
  }

  return parts.join('\n');
}
```

**关键点**：
- ✅ 明确声明可用依赖清单
- ✅ 提供 `@dependency` 注释规范
- ✅ 包含代码规范指引
- ✅ 保留原有工作目录信息

**验证**：
```bash
# 启动 agent-service
pnpm dev:agent

# 测试 AI 生成代码是否正确声明依赖
# 观察 AI 生成代码的注释部分
```

---

### 3.3 第三层：注释解析提取

**目标**：解析 AI 声明的 `@dependency` 注释，自动添加依赖。

#### 步骤 1：创建工具模块

**文件**：`packages/web/lib/sandpack-deps.ts`（新建）

```typescript
/**
 * 从代码注释中提取 @dependency 声明
 * 
 * 支持格式：
 *   // @dependency package-name
 *   // @dependency package@^1.0.0
 *   // @dependency @scope/package
 *   // @dependency @scope/package@^1.0.0
 */
export function extractDependenciesFromComments(code: string): Record<string, string> {
  const depRegex = /\/\/\s*@dependency\s+([^\n]+)/g;
  const deps: Record<string, string> = {};
  let match;

  while ((match = depRegex.exec(code)) !== null) {
    const depString = match[1].trim();
    const { name, version } = parseDependencyString(depString);
    
    if (name) {
      deps[name] = version;
    }
  }

  return deps;
}

/**
 * 解析依赖字符串
 * 
 * @example
 * parseDependencyString('lodash')           // { name: 'lodash', version: 'latest' }
 * parseDependencyString('lodash@^4.0.0')   // { name: 'lodash', version: '^4.0.0' }
 * parseDependencyString('@scope/pkg@^1.0') // { name: '@scope/pkg', version: '^1.0' }
 */
function parseDependencyString(depString: string): { name?: string; version: string } {
  if (!depString) {
    return { version: 'latest' };
  }

  // 处理 scoped package: @scope/package@version
  if (depString.startsWith('@')) {
    const atIndex = depString.indexOf('@', 1); // 从第 2 个字符开始查找
    if (atIndex === -1) {
      return { name: depString, version: 'latest' };
    }
    return {
      name: depString.substring(0, atIndex),
      version: depString.substring(atIndex + 1) || 'latest',
    };
  }

  // 处理普通 package: package@version
  const atIndex = depString.indexOf('@');
  if (atIndex === -1) {
    return { name: depString, version: 'latest' };
  }
  return {
    name: depString.substring(0, atIndex),
    version: depString.substring(atIndex + 1) || 'latest',
  };
}
```

#### 步骤 2：集成到 PreviewPanel

**文件**：`packages/web/components/demo/PreviewPanel.tsx`

**修改位置**：第 1 行（添加导入）

```typescript
import { extractDependenciesFromComments } from "@/lib/sandpack-deps";
```

**修改位置**：第 92-107 行（files 定义之后）

```typescript
// 在 files 定义后添加依赖解析
const previewStyle = buildPreviewStyle(previewSize);

// 从代码注释中提取依赖声明
const declaredDependencies = isValidCode ? extractDependenciesFromComments(code) : {};

// 合并依赖
const mergedDependencies = {
  // 核心依赖
  react: "^18.0.0",
  "react-dom": "^18.0.0",
  
  // shadcn/ui 工具库
  clsx: "^2.1.0",
  "tailwind-merge": "^2.2.0",
  "class-variance-authority": "^0.7.0",
  
  // UI 库
  "lucide-react": "^0.323.0",
  
  // 动画库
  "framer-motion": "^10.0.0",
  
  // AI 声明的额外依赖
  ...declaredDependencies,
};
```

**修改位置**：第 127-145 行（SandpackProvider 配置）

```typescript
<SandpackProvider
  key={code}
  template="react-ts"
  files={files}
  customSetup={{
    dependencies: mergedDependencies, // ← 使用合并后的依赖
  }}
  externalResources={["https://cdn.tailwindcss.com#tailwind.js"]}
  theme={{
    colors: {
      surface1: "#ffffff",
      surface2: "#f7f7f7",
      surface3: "#e8e8e8",
    },
  }}
>
```

**添加开发环境日志**（可选）：

```typescript
// 在组件中添加调试日志
useEffect(() => {
  if (process.env.NODE_ENV === 'development' && isValidCode) {
    const declaredDeps = extractDependenciesFromComments(code);
    if (Object.keys(declaredDeps).length > 0) {
      console.log('[PreviewPanel] 检测到依赖声明:', declaredDeps);
    }
  }
}, [code, isValidCode]);
```

#### 步骤 3：添加单元测试

**文件**：`packages/web/lib/__tests__/sandpack-deps.test.ts`（新建）

```typescript
import { extractDependenciesFromComments } from '../sandpack-deps';

describe('Sandpack 依赖解析', () => {
  describe('extractDependenciesFromComments', () => {
    it('应解析简单的依赖声明', () => {
      const code = `
        // @dependency lodash
        // @dependency date-fns
        
        import React from 'react';
      `;
      const deps = extractDependenciesFromComments(code);
      expect(deps).toEqual({
        'lodash': 'latest',
        'date-fns': 'latest',
      });
    });

    it('应解析带版本的依赖声明', () => {
      const code = `
        // @dependency lodash@^4.0.0
        // @dependency date-fns@^3.0.0
        
        import React from 'react';
      `;
      const deps = extractDependenciesFromComments(code);
      expect(deps).toEqual({
        'lodash': '^4.0.0',
        'date-fns': '^3.0.0',
      });
    });

    it('应解析 scoped packages', () => {
      const code = `
        // @dependency @react-spring/web
        // @dependency @heroicons/react@^2.0.0
        
        import React from 'react';
      `;
      const deps = extractDependenciesFromComments(code);
      expect(deps).toEqual({
        '@react-spring/web': 'latest',
        '@heroicons/react': '^2.0.0',
      });
    });

    it('应忽略非依赖注释', () => {
      const code = `
        // 这是一个注释
        import React from 'react';
        // @dependency lodash
      `;
      const deps = extractDependenciesFromComments(code);
      expect(deps).toEqual({
        'lodash': 'latest',
      });
    });

    it('应处理空代码', () => {
      const deps = extractDependenciesFromComments('');
      expect(deps).toEqual({});
    });
  });
});
```

**运行测试**：
```bash
# 运行测试
pnpm --filter @opencode-workbench/web test

# 监听模式
pnpm --filter @opencode-workbench/web test:watch
```

---

## 四、完整实施清单

### 4.1 立即可做（30 分钟）

- [ ] **修改 PreviewPanel.tsx**
  - 文件：`packages/web/components/demo/PreviewPanel.tsx`
  - 位置：第 127-136 行
  - 动作：扩展 `customSetup.dependencies`

- [ ] **验证现有功能**
  - 测试现有 demo 是否正常
  - 确认无回归问题

### 4.2 短期优化（1-2 小时）

- [ ] **修改 Claude 后端**
  - 文件：`packages/agent-service/src/backends/claude.ts`
  - 位置：第 68-76 行
  - 动作：替换 `buildSystemPrompt()` 方法

- [ ] **修改 Codex 后端**
  - 文件：`packages/agent-service/src/backends/codex.ts`
  - 位置：第 67-75 行
  - 动作：替换 `buildSystemPrompt()` 方法

- [ ] **修改 Gemini 后端**
  - 文件：`packages/agent-service/src/backends/gemini.ts`
  - 位置：第 65-73 行
  - 动作：替换 `buildSystemPrompt()` 方法

- [ ] **检查其他后端**
  - 文件：`qwen.ts`, `qoder.ts`, `kimi.ts`
  - 动作：确认是否有 `buildSystemPrompt()` 方法
  - 如有，按相同模式修改

- [ ] **验证 AI 生成代码**
  - 测试 AI 是否正确声明依赖
  - 确认 `@dependency` 注释格式正确

### 4.3 按需实施（1 天）

- [ ] **创建 sandpack-deps.ts**
  - 文件：`packages/web/lib/sandpack-deps.ts`
  - 动作：新建文件，实现 `extractDependenciesFromComments()`

- [ ] **集成到 PreviewPanel**
  - 文件：`packages/web/components/demo/PreviewPanel.tsx`
  - 位置：第 1 行（导入）、第 92-107 行（依赖合并）
  - 动作：添加依赖解析逻辑

- [ ] **添加单元测试**
  - 文件：`packages/web/lib/__tests__/sandpack-deps.test.ts`
  - 动作：新建文件，实现测试用例

- [ ] **运行完整测试**
  ```bash
  pnpm --filter @opencode-workbench/web test
  pnpm typecheck
  pnpm lint
  ```

---

## 五、验证与测试

### 5.1 手动测试

**测试用例 1：使用预声明依赖**

```typescript
// AI 生成此代码（无需声明依赖）
import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export default function Demo() {
  return <div className={twMerge(clsx('text-red-500'))}>Hello</div>;
}
```

**预期**：✅ 编译成功，无报错

**测试用例 2：使用 @dependency 声明新依赖**

```typescript
// @dependency date-fns@^3.0.0

import React from 'react';
import { format } from 'date-fns';

export default function Demo() {
  return <div>{format(new Date(), 'yyyy-MM-dd')}</div>;
}
```

**预期**：✅ 自动添加 `date-fns@^3.0.0`，编译成功

**测试用例 3：使用 scoped package**

```typescript
// @dependency @react-spring/web@^9.7.0

import React from 'react';
import { useSpring, animated } from '@react-spring/web';

export default function Demo() {
  const props = useSpring({ opacity: 1, from: { opacity: 0 } });
  return <animated.div style={props}>Fade In</animated.div>;
}
```

**预期**：✅ 自动添加 `@react-spring/web@^9.7.0`，编译成功

### 5.2 自动化测试

```bash
# 1. 单元测试
pnpm --filter @opencode-workbench/web test

# 2. 类型检查
pnpm typecheck

# 3. Lint 检查
pnpm lint

# 4. 开发服务器
pnpm dev:web

# 5. 访问测试页面
# http://localhost:3100/demo/[id]/edit
```

---

## 六、维护指南

### 6.1 依赖列表更新

**何时更新**：
- 引入新的 UI 组件库
- AI 频繁使用某个未声明的包
- 移除不再使用的包

**如何更新**：
1. 修改 `PreviewPanel.tsx` 中的 `mergedDependencies`
2. 同步更新各后端的 `buildSystemPrompt()` 方法
3. 在 PR 描述中说明变更原因

### 6.2 AI 提示词维护

**何时更新**：
- 新增常用依赖
- 代码规范变更
- 发现 AI 频繁误用某个包

**如何更新**：
1. 修改对应后端文件的 `buildSystemPrompt()` 方法
2. 测试 AI 生成代码是否符合新规范

### 6.3 问题排查

**问题**：AI 生成代码后预览区报错

**排查步骤**：
1. 检查错误信息是否为 "Could not find dependency"
2. 检查 AI 是否在注释中声明了该依赖
3. 检查依赖列表是否包含该包
4. 手动添加依赖并测试
5. 如问题持续，在 GitHub Issues 中记录

---

## 七、相关文件索引

### 前端文件

| 文件 | 路径 | 作用 |
|------|------|------|
| 预览面板 | `packages/web/components/demo/PreviewPanel.tsx` | 集成依赖配置 |
| 依赖工具 | `packages/web/lib/sandpack-deps.ts` | 解析依赖注释 |
| 类型定义 | `packages/web/components/demo/types.ts` | Props 类型 |
| 单元测试 | `packages/web/lib/__tests__/sandpack-deps.test.ts` | 测试覆盖 |

### 后端文件

| 文件 | 路径 | 修改位置 |
|------|------|---------|
| Claude | `packages/agent-service/src/backends/claude.ts` | 第 68-76 行 |
| Codex | `packages/agent-service/src/backends/codex.ts` | 第 67-75 行 |
| Gemini | `packages/agent-service/src/backends/gemini.ts` | 第 65-73 行 |
| Qwen | `packages/agent-service/src/backends/qwen.ts` | 需确认 |
| Qoder | `packages/agent-service/src/backends/qoder.ts` | 需确认 |
| Kimi | `packages/agent-service/src/backends/kimi.ts` | 需确认 |

---

## 八、总结

### 方案优势

| 优势 | 说明 |
|------|------|
| **简单直接** | 核心代码 80 行 vs 原方案 800+ 行 |
| **从根源解决** | 增强 AI 系统提示词，而非事后补救 |
| **无需维护映射表** | AI 主动声明依赖，避免人工维护成本 |
| **渐进式** | 三层方案按需实施，随时可停 |
| **可验证** | 每层都有明确验收标准 |

### 实施时间线

| 阶段 | 时间 | 交付物 |
|------|------|--------|
| 第一层 | 30 分钟 | 扩展依赖列表 |
| 第二层 | 1-2 小时 | 修改 AI 提示词 |
| 第三层 | 1 天 | 注释解析 + 测试 |

### 下一步

1. ✅ 实施第一层（立即）
2. ✅ 实施第二层（今天）
3. ⏳ 实施第三层（按需）

---

**文档状态**：✅ 已完成，待实施  
**最后更新**：2026-04-12
