# 问题分析报告：AI 生成代码时依赖缺失（长期根治方案）

## 一、问题描述

**现象**：AI 修改代码后，预览区（Sandpack）报错提示缺少依赖。

**具体案例**：
```
Could not find dependency: 'clsx' relative to '/Demo.tsx' (2:0)

  1 | import React from 'react';
> 2 | import { clsx, type ClassValue } from 'clsx';
      ^
  3 | import { twMerge } from 'tailwind-merge';
```

**影响范围**：AI 生成使用了未声明依赖的代码时，预览区会编译失败。

---

## 二、问题根因分析

### 核心问题：Sandpack 沙箱是独立环境，依赖需要显式声明

#### 2.1 技术架构

```
主项目 (opencode-workbench)
├── packages/web
│   ├── package.json          ← 包含所有依赖
│   └── node_modules/          ← 依赖安装位置
│
└── 预览区 (Sandpack)
    ├── 独立的虚拟文件系统
    ├── 独立的编译环境
    └── dependencies 配置     ← 需要显式声明依赖
```

**关键点**：
- Sandpack 运行在浏览器中的独立沙箱环境
- 不会继承主项目的 `node_modules`
- 必须通过 `customSetup.dependencies` 显式声明依赖
- Sandpack 会自动从 npm 安装这些依赖

#### 2.2 数据流断裂点

```
AI 生成代码
    │
    ▼
代码包含 import 语句（如 import { clsx } from 'clsx'）
    │
    ▼
代码传递给 PreviewPanel
    │
    ▼
PreviewPanel 构建 files 对象
    │
    ▼
SandpackProvider 接收 files 和 dependencies 配置
    │
    ├─ dependencies 中包含 clsx ✅
    │   → Sandpack 安装依赖，编译成功
    │
    └─ dependencies 中缺少 clsx ❌
        → Sandpack 报错：Could not find dependency
```

#### 2.3 当前状态

**文件**：`packages/web/components/demo/PreviewPanel.tsx` 第 148-157 行

```typescript
customSetup={{
  dependencies: {
    react: "^18.0.0",
    "react-dom": "^18.0.0",
    tailwindcss: "^3.4.1",
    autoprefixer: "^10.4.17",
    postcss: "^8.4.33",
    clsx: "^2.1.0",            // ← 刚刚手动添加
    "tailwind-merge": "^2.2.0", // ← 刚刚手动添加
  },
}}
```

**问题**：
- ✅ 基础依赖已声明（react, tailwindcss 等）
- ✅ 刚添加了 clsx 和 tailwind-merge
- ❌ **无法覆盖所有可能的 npm 包**
- ❌ **AI 可能使用任何 npm 包，依赖列表会不断增长**
- ❌ **间接依赖无法识别**（如 `@/lib/utils` 内部引用了 `clsx`）

---

## 三、方案对比与选择

### 3.1 方案对比矩阵

| 方案 | 覆盖率 | 性能 | 维护成本 | 实施难度 | 推荐度 |
|------|--------|------|----------|----------|--------|
| **1. 预声明常用依赖** | 60% | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐ | ⭐⭐⭐ |
| **2. 正则检测 import** | 70% | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| **3. 项目级依赖配置** | 90% | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **4. 依赖图谱 + 自动化** | 95%+ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

### 3.2 推荐方案：依赖图谱 + 自动化管理（长期根治）

**核心思路**：
1. 构建项目依赖图谱，自动识别直接依赖和间接依赖
2. 实现自动化脚本，从 `package.json` 生成 Sandpack 依赖配置
3. 在 `config.schema.json` 中扩展 `dependencies` 字段，允许 AI 显式声明特殊依赖
4. 实现错误监控和动态重试机制

**优势**：
- ✅ **自动化**：无需手动维护依赖列表
- ✅ **完整性**：覆盖间接依赖和嵌套依赖
- ✅ **可维护性**：依赖版本与主项目保持一致
- ✅ **可扩展性**：支持 AI 动态添加新依赖
- ✅ **性能优化**：仅安装代码实际使用的依赖

---

## 四、长期根治方案设计

### 4.1 架构设计

```
┌─────────────────────────────────────────────────────────┐
│                   依赖管理系统                           │
├─────────────────────────────────────────────────────────┤
│  1. 依赖图谱生成器（构建时）                              │
│     - 扫描 package.json                                  │
│     - 分析模块依赖关系                                   │
│     - 生成 sandpack-deps.json                           │
├─────────────────────────────────────────────────────────┤
│  2. 运行时依赖解析器（PreviewPanel）                      │
│     - 静态分析代码中的 import                            │
│     - 匹配依赖图谱                                       │
│     - 展开间接依赖                                       │
│     - 合并 config.schema.json 中的依赖声明               │
├─────────────────────────────────────────────────────────┤
│  3. 错误监控与重试                                       │
│     - 捕获 Sandpack 缺失依赖错误                         │
│     - 自动添加缺失依赖                                   │
│     - 开发环境日志输出                                   │
├─────────────────────────────────────────────────────────┤
│  4. 配置扩展（config.schema.json）                       │
│     - 新增 $demo.dependencies 字段                      │
│     - AI 可声明特殊依赖                                  │
│     - 版本验证与冲突解决                                 │
└─────────────────────────────────────────────────────────┘
```

### 4.2 实施步骤

#### 步骤 1：创建依赖管理模块

**文件**：`packages/web/lib/sandpack-deps.ts`

```typescript
import fs from 'fs';
import path from 'path';

/**
 * Sandpack 依赖配置
 * 从 package.json 自动生成，支持手动扩展
 */
export interface SandpackDependencyConfig {
  // 基础依赖（始终安装）
  base: Record<string, string>;
  // 可选依赖（按需检测）
  optional: Record<string, string>;
  // 内部路径到外部依赖的映射（间接依赖）
  pathMappings: Record<string, string[]>;
}

/**
 * 默认基础依赖（Sandpack 运行必需）
 */
export const BASE_DEPENDENCIES: Record<string, string> = {
  react: "^18.0.0",
  "react-dom": "^18.0.0",
  tailwindcss: "^3.4.1",
  autoprefixer: "^10.4.17",
  postcss: "^8.4.33",
};

/**
 * 可选依赖池（从 package.json 提取）
 * 会根据代码中的 import 语句动态选择
 */
export function buildOptionalDependencies(): Record<string, string> {
  // 读取 package.json
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  
  const allDeps = {
    ...packageJson.dependencies,
    // 不包含 devDependencies，因为 Sandpack 不需要
  };
  
  // 移除基础依赖和内部包
  const excludePackages = [
    'react', 'react-dom', 'next', 'tailwindcss', 
    'autoprefixer', 'postcss', '@opencode-workbench/*'
  ];
  
  const filtered: Record<string, string> = {};
  
  for (const [pkg, version] of Object.entries(allDeps)) {
    const shouldExclude = excludePackages.some(
      pattern => pattern.endsWith('/*') 
        ? pkg.startsWith(pattern.slice(0, -2))
        : pkg === pattern
    );
    
    if (!shouldExclude) {
      filtered[pkg] = version;
    }
  }
  
  return filtered;
}

/**
 * 内部路径到外部依赖的映射
 * 用于处理间接依赖（如 @/lib/utils 引用了 clsx）
 */
export const PATH_DEPENDENCY_MAP: Record<string, string[]> = {
  '@/lib/utils': ['clsx', 'tailwind-merge'],
  '@/components/ui/button': ['lucide-react'],
  '@/components/ui/input': ['lucide-react'],
  // 可根据实际情况扩展
};

/**
 * 从代码中提取 import 语句，识别直接依赖
 */
export function extractDirectDependencies(code: string): string[] {
  const imports = new Set<string>();
  
  // 匹配所有 import 语句（包括 type import 和 require）
  const patterns = [
    /import\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /import\s*\(['"]([^'"]+)['"]\)/g,
    /require\(['"]([^'"]+)['"]\)/g,
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(code)) !== null) {
      const importPath = match[1];
      
      // 跳过相对路径和内部模块
      if (importPath.startsWith('.') || importPath.startsWith('/')) {
        continue;
      }
      
      // 提取包名
      let pkgName: string;
      if (importPath.startsWith('@')) {
        const parts = importPath.split('/');
        pkgName = parts.slice(0, 2).join('/');
      } else {
        pkgName = importPath.split('/')[0];
      }
      
      imports.add(pkgName);
    }
  }
  
  return Array.from(imports);
}

/**
 * 解析间接依赖
 * 根据代码中的内部路径导入，展开对应的外部依赖
 */
export function resolveIndirectDependencies(code: string): string[] {
  const indirectDeps = new Set<string>();
  
  // 匹配内部路径导入
  const internalImportRegex = /import\s+(?:.*?\s+from\s+)?['"](@\/[^'"]+)['"]/g;
  let match;
  
  while ((match = internalImportRegex.exec(code)) !== null) {
    const importPath = match[1];
    
    // 在映射表中查找对应的依赖
    for (const [mappedPath, deps] of Object.entries(PATH_DEPENDENCY_MAP)) {
      if (importPath === mappedPath || importPath.startsWith(mappedPath + '/')) {
        deps.forEach(dep => indirectDeps.add(dep));
      }
    }
  }
  
  return Array.from(indirectDeps);
}

/**
 * 合并依赖
 * @param directDeps 直接从代码中提取的依赖
 * @param indirectDeps 间接依赖
 * @param configDeps 配置文件声明的依赖
 * @param optionalPool 可选依赖池
 * @returns 最终的依赖配置
 */
export function mergeDependencies(
  directDeps: string[],
  indirectDeps: string[],
  configDeps: Record<string, string>,
  optionalPool: Record<string, string>
): Record<string, string> {
  const merged: Record<string, string> = { ...BASE_DEPENDENCIES };
  
  // 合并直接依赖
  for (const dep of directDeps) {
    if (optionalPool[dep]) {
      merged[dep] = optionalPool[dep];
    } else if (configDeps[dep]) {
      // 如果在可选依赖池中找不到，但配置文件声明了，使用配置文件的版本
      merged[dep] = configDeps[dep];
    }
  }
  
  // 合并间接依赖
  for (const dep of indirectDeps) {
    if (!merged[dep]) {
      merged[dep] = optionalPool[dep] || 'latest';
    }
  }
  
  // 合并配置文件声明的依赖
  Object.assign(merged, configDeps);
  
  return merged;
}

/**
 * 完整的依赖解析流程
 */
export function resolveAllDependencies(
  code: string,
  configDeps: Record<string, string> = {}
): Record<string, string> {
  const directDeps = extractDirectDependencies(code);
  const indirectDeps = resolveIndirectDependencies(code);
  const optionalPool = buildOptionalDependencies();
  
  return mergeDependencies(directDeps, indirectDeps, configDeps, optionalPool);
}
```

#### 步骤 2：扩展 config.schema.json 结构

**新增字段**：在 `$demo` 中添加 `dependencies` 字段

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$demo": {
    "previewSize": {
      "width": 375,
      "height": 667
    },
    "dependencies": {
      "framer-motion": "^10.0.0",
      "@react-spring/web": "^9.7.0"
    }
  },
  "title": "Demo 配置",
  "type": "object",
  "properties": {
    // ... 现有配置项
  }
}
```

**类型定义更新**：`packages/web/components/demo/types.ts`

```typescript
export interface DemoMeta {
  previewSize?: PreviewSize;
  dependencies?: Record<string, string>;  // 新增
  [key: string]: unknown;
}
```

#### 步骤 3：更新 PreviewPanel 组件

**文件**：`packages/web/components/demo/PreviewPanel.tsx`

```typescript
"use client";

import {
  SandpackProvider,
  SandpackLayout,
  SandpackPreview,
} from "@codesandbox/sandpack-react";
import { useEffect, useMemo, useState } from "react";
import type { PreviewPanelProps, PreviewSize } from "./types";
import { resolveAllDependencies } from "@/lib/sandpack-deps";

// 默认预览尺寸
const DEFAULT_PREVIEW_SIZE: PreviewSize = {
  width: 375,
  height: 667,
};

function buildPreviewStyle(size?: PreviewSize): React.CSSProperties {
  const effectiveSize = size ?? DEFAULT_PREVIEW_SIZE;

  const style: React.CSSProperties = {
    width: effectiveSize.width,
    height: effectiveSize.height,
    minHeight: effectiveSize.minHeight ?? "400px",
    margin: "0 auto",
    border: "1px solid #e5e7eb",
    borderRadius: "8px",
    overflow: "hidden",
  };

  if (effectiveSize.maxHeight !== undefined) {
    style.maxHeight = effectiveSize.maxHeight;
  }

  if (effectiveSize.scale !== undefined) {
    style.transform = `scale(${effectiveSize.scale})`;
    style.transformOrigin = "top center";
  }

  return style;
}

export function PreviewPanel({
  code,
  configData,
  sdkFiles,
  onError,
  className,
  previewSize,
}: PreviewPanelProps) {
  const [extraDeps, setExtraDeps] = useState<Record<string, string>>({});

  useEffect(() => {
    console.log(
      "[PreviewPanel] code prop changed, length:",
      code?.length,
      "isValid:",
      typeof code === "string" && code.length > 0,
    );
  }, [code]);

  useEffect(() => {
    console.log(
      "[PreviewPanel] sdkFiles:",
      sdkFiles ? Object.keys(sdkFiles) : "undefined",
    );
  }, [sdkFiles]);

  const isValidCode =
    typeof code === "string" &&
    code.trim().length > 0 &&
    (code.includes("import") ||
      code.includes("function") ||
      code.includes("export") ||
      code.includes("<")) &&
    !code.match(/^[A-Z]:\\/) &&
    !code.includes("\\重要文件\\");

  const entryCode = `
import React from 'react';
import './src/globals.css';
import Demo from './Demo';

export default function App() {
  return <Demo {...${JSON.stringify(configData)}} />;
}
`;

  const tailwindConfig = `module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
}`;

  const postcssConfig = `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}`;

  const globalsCss = `
@tailwind base;
@tailwind components;
@tailwind utilities;
`;

  const files: Record<string, string> = isValidCode
    ? {
        "/Demo.tsx": code,
        "/App.tsx": entryCode,
        "/tailwind.config.js": tailwindConfig,
        "/postcss.config.js": postcssConfig,
        "/src/globals.css": globalsCss,
        ...sdkFiles,
      }
    : {
        "/Demo.tsx": `export default function Demo() { return <div>代码加载失败</div>; }`,
        "/App.tsx": entryCode,
        "/tailwind.config.js": tailwindConfig,
        "/postcss.config.js": postcssConfig,
        "/src/globals.css": globalsCss,
        ...sdkFiles,
      };

  // 从 configData 中提取配置文件声明的依赖
  const configDeps = (configData as any)?.$demo?.dependencies || 
                     (configData as any)?.dependencies || {};

  // 使用 useMemo 缓存依赖解析结果
  const resolvedDependencies = useMemo(() => {
    if (!isValidCode) {
      return {};
    }
    
    const deps = resolveAllDependencies(code, configDeps);
    
    // 开发环境输出日志
    if (process.env.NODE_ENV === 'development') {
      console.log('[PreviewPanel] Resolved dependencies:', deps);
    }
    
    return deps;
  }, [code, configDeps, isValidCode]);

  // 合并额外依赖（用于错误重试）
  const mergedDependencies = {
    ...resolvedDependencies,
    ...extraDeps,
  };

  const previewStyle = buildPreviewStyle(previewSize);

  // Sandpack 错误处理
  const handleSandpackError = (error: Error) => {
    const errorMessage = error.message || '';
    
    // 检测是否为依赖缺失错误
    const missingDepMatch = errorMessage.match(/Could not find dependency: '([^']+)'/);
    
    if (missingDepMatch) {
      const missingPkg = missingDepMatch[1];
      
      // 自动添加缺失依赖
      setExtraDeps(prev => ({
        ...prev,
        [missingPkg]: 'latest',
      }));
      
      console.warn(`[PreviewPanel] Auto-added missing dependency: ${missingPkg}`);
      return; // 不向上传递，等待重新渲染
    }
    
    // 其他错误向上传递
    onError?.(error);
  };

  return (
    <div className={className || "h-full w-full"}>
      {!isValidCode && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg mb-4">
          <p className="text-red-800 font-medium">⚠️ 代码加载失败</p>
          <p className="text-red-600 text-sm mt-1">
            检测到无效的代码文件（可能是文件路径而非代码内容）
          </p>
        </div>
      )}
      <SandpackProvider
        key={code}
        template="react-ts"
        files={files}
        customSetup={{
          dependencies: mergedDependencies,
        }}
        onError={handleSandpackError}
        theme={{
          colors: {
            surface1: "#ffffff",
            surface2: "#f7f7f7",
            surface3: "#e8e8e8",
          },
        }}
      >
        <SandpackLayout>
          <SandpackPreview
            showNavigator={false}
            showRefreshButton={true}
            style={previewStyle}
          />
        </SandpackLayout>
      </SandpackProvider>
    </div>
  );
}
```

#### 步骤 4：创建自动化脚本

**文件**：`packages/web/scripts/update-sandpack-deps.ts`

```typescript
/**
 * 自动更新 Sandpack 依赖配置脚本
 * 从 package.json 提取依赖并生成 sandpack-deps.ts 的可选依赖池
 * 
 * 使用方式：
 * npx tsx packages/web/scripts/update-sandpack-deps.ts
 */

import fs from 'fs';
import path from 'path';

const PACKAGE_JSON_PATH = path.join(process.cwd(), 'package.json');
const OUTPUT_PATH = path.join(process.cwd(), 'lib', 'sandpack-deps.generated.ts');

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function main() {
  console.log('📦 开始生成 Sandpack 依赖配置...');
  
  // 读取 package.json
  const packageJson: PackageJson = JSON.parse(
    fs.readFileSync(PACKAGE_JSON_PATH, 'utf-8')
  );
  
  if (!packageJson.dependencies) {
    console.error('❌ 未找到 dependencies 字段');
    process.exit(1);
  }
  
  // 需要排除的基础依赖
  const EXCLUDE_DEPS = new Set([
    'react',
    'react-dom',
    'next',
    'tailwindcss',
    'autoprefixer',
    'postcss',
    '@opencode-workbench/shared',
    '@opencode-workbench/agent-client',
  ]);
  
  // 提取可选依赖
  const optionalDeps: Record<string, string> = {};
  
  for (const [pkg, version] of Object.entries(packageJson.dependencies)) {
    if (!EXCLUDE_DEPS.has(pkg)) {
      optionalDeps[pkg] = version;
    }
  }
  
  // 生成 TypeScript 代码
  const generatedCode = `// ⚠️ 此文件由脚本自动生成，请勿手动编辑
// 运行命令：npx tsx packages/web/scripts/update-sandpack-deps.ts

export const GENERATED_OPTIONAL_DEPS: Record<string, string> = ${JSON.stringify(optionalDeps, null, 2)};
`;
  
  // 写入文件
  fs.writeFileSync(OUTPUT_PATH, generatedCode, 'utf-8');
  
  console.log(`✅ 成功生成 ${Object.keys(optionalDeps).length} 个可选依赖`);
  console.log(`📄 输出文件：${OUTPUT_PATH}`);
}

main();
```

**添加到 package.json scripts**：

```json
{
  "scripts": {
    "update-sandpack-deps": "tsx scripts/update-sandpack-deps.ts",
    "prebuild": "npm run update-sandpack-deps"
  }
}
```

#### 步骤 5：添加单元测试

**文件**：`packages/web/lib/__tests__/sandpack-deps.test.ts`

```typescript
import {
  extractDirectDependencies,
  resolveIndirectDependencies,
  mergeDependencies,
  resolveAllDependencies,
  BASE_DEPENDENCIES,
  PATH_DEPENDENCY_MAP,
} from '../sandpack-deps';

describe('Sandpack 依赖解析', () => {
  describe('extractDirectDependencies', () => {
    it('应提取直接的 import 依赖', () => {
      const code = `
        import React from 'react';
        import { clsx } from 'clsx';
        import { twMerge } from 'tailwind-merge';
      `;
      const deps = extractDirectDependencies(code);
      expect(deps).toContain('react');
      expect(deps).toContain('clsx');
      expect(deps).toContain('tailwind-merge');
    });

    it('应跳过相对路径导入', () => {
      const code = `
        import { cn } from '@/lib/utils';
        import Button from './Button';
        import styles from '../styles.module.css';
      `;
      const deps = extractDirectDependencies(code);
      expect(deps).not.toContain('@/lib/utils');
      expect(deps).not.toContain('./Button');
    });

    it('应处理 scoped packages', () => {
      const code = `
        import { motion } from 'framer-motion';
        import { ArrowUpIcon } from '@heroicons/react/24/solid';
      `;
      const deps = extractDirectDependencies(code);
      expect(deps).toContain('framer-motion');
      expect(deps).toContain('@heroicons/react');
    });

    it('应处理动态 import', () => {
      const code = `
        const LazyComponent = import('./LazyComponent');
        const _ = await import('lodash');
      `;
      const deps = extractDirectDependencies(code);
      expect(deps).toContain('lodash');
    });
  });

  describe('resolveIndirectDependencies', () => {
    it('应解析间接依赖', () => {
      const code = `
        import { cn } from '@/lib/utils';
      `;
      const deps = resolveIndirectDependencies(code);
      expect(deps).toContain('clsx');
      expect(deps).toContain('tailwind-merge');
    });

    it('应处理嵌套路径', () => {
      const code = `
        import { Button } from '@/components/ui/button/variants';
      `;
      const deps = resolveIndirectDependencies(code);
      expect(deps).toContain('lucide-react');
    });
  });

  describe('mergeDependencies', () => {
    it('应合并直接依赖、间接依赖和配置依赖', () => {
      const direct = ['clsx', 'framer-motion'];
      const indirect = ['tailwind-merge'];
      const config = { 'react-spring': '^9.7.0' };
      const pool = {
        'clsx': '^2.1.0',
        'framer-motion': '^10.0.0',
        'tailwind-merge': '^2.2.0',
      };

      const merged = mergeDependencies(direct, indirect, config, pool);

      expect(merged['clsx']).toBe('^2.1.0');
      expect(merged['framer-motion']).toBe('^10.0.0');
      expect(merged['tailwind-merge']).toBe('^2.2.0');
      expect(merged['react-spring']).toBe('^9.7.0');
    });

    it('应包含基础依赖', () => {
      const merged = mergeDependencies([], [], {}, {});
      expect(merged['react']).toBeDefined();
      expect(merged['react-dom']).toBeDefined();
      expect(merged['tailwindcss']).toBeDefined();
    });
  });

  describe('resolveAllDependencies', () => {
    it('应完成完整的依赖解析流程', () => {
      const code = `
        import React from 'react';
        import { motion } from 'framer-motion';
        import { cn } from '@/lib/utils';
      `;
      
      const configDeps = { '@react-spring/web': '^9.7.0' };
      
      const resolved = resolveAllDependencies(code, configDeps);
      
      expect(resolved['react']).toBe(BASE_DEPENDENCIES['react']);
      expect(resolved['framer-motion']).toBeDefined();
      expect(resolved['clsx']).toBeDefined();
      expect(resolved['@react-spring/web']).toBe('^9.7.0');
    });
  });
});
```

---

## 五、相关文件清单

| 文件 | 路径 | 作用 | 状态 |
|------|------|------|------|
| 依赖管理模块 | `packages/web/lib/sandpack-deps.ts` | 核心依赖解析逻辑 | 🆕 新建 |
| 自动生成的依赖池 | `packages/web/lib/sandpack-deps.generated.ts` | 从 package.json 自动生成 | 🆕 新建 |
| 自动化脚本 | `packages/web/scripts/update-sandpack-deps.ts` | 更新依赖配置 | 🆕 新建 |
| 单元测试 | `packages/web/lib/__tests__/sandpack-deps.test.ts` | 依赖解析测试 | 🆕 新建 |
| 预览面板（主要修改） | `packages/web/components/demo/PreviewPanel.tsx` | 集成依赖解析 | ✏️ 修改 |
| 类型定义 | `packages/web/components/demo/types.ts` | 添加 dependencies 字段 | ✏️ 修改 |
| 配置 Schema 示例 | `demos/demo-example/config.schema.json` | 展示依赖字段用法 | ✏️ 修改 |

---

## 六、实施路线图

### 阶段 1：基础设施（1-2 天）🔴

**目标**：建立依赖管理基础设施

- [ ] 创建 `sandpack-deps.ts` 模块
- [ ] 实现基础依赖解析函数
- [ ] 构建 `PATH_DEPENDENCY_MAP` 初始映射
- [ ] 添加单元测试

**验收标准**：
- ✅ 单元测试覆盖率 > 80%
- ✅ 能正确解析直接依赖和间接依赖
- ✅ 性能测试：单次解析 < 10ms

### 阶段 2：集成 PreviewPanel（1 天）🟡

**目标**：在 PreviewPanel 中集成新的依赖解析逻辑

- [ ] 更新 PreviewPanel 组件
- [ ] 实现错误监控和自动重试
- [ ] 添加开发环境调试日志
- [ ] 更新类型定义

**验收标准**：
- ✅ 现有 demo 正常工作
- ✅ 新增依赖时自动识别
- ✅ 缺失依赖时自动重试
- ✅ 开发环境有清晰的日志输出

### 阶段 3：配置扩展（1 天）🟢

**目标**：支持 config.schema.json 声明依赖

- [ ] 更新 config.schema.json Schema
- [ ] 在 ConfigForm 中添加依赖编辑界面（可选）
- [ ] 更新 AI 提示词，指导 AI 声明依赖
- [ ] 添加依赖版本验证

**验收标准**：
- ✅ AI 能在配置中声明依赖
- ✅ 版本冲突时有明确提示
- ✅ 配置文件校验通过

### 阶段 4：自动化与优化（1-2 天）🔵

**目标**：实现自动化管理和性能优化

- [ ] 创建自动化脚本
- [ ] 添加到构建流程
- [ ] 性能优化（缓存、懒加载）
- [ ] 监控和指标收集

**验收标准**：
- ✅ 运行 `pnpm build` 前自动更新依赖
- ✅ 依赖解析使用 useMemo 缓存
- ✅ 有清晰的性能指标

### 阶段 5：文档与维护（持续）🟣

**目标**：完善文档和建立维护流程

- [ ] 更新开发者文档
- [ ] 编写使用指南
- [ ] 建立依赖映射维护流程
- [ ] 定期更新 PATH_DEPENDENCY_MAP

---

## 七、性能优化策略

### 7.1 缓存策略

```typescript
// 使用 WeakMap 缓存依赖解析结果
const dependencyCache = new WeakMap<string, Record<string, string>>();

function resolveAllDependenciesWithCache(
  code: string,
  configDeps: Record<string, string> = {}
): Record<string, string> {
  const cacheKey = code + JSON.stringify(configDeps);
  
  if (dependencyCache.has(cacheKey)) {
    return dependencyCache.get(cacheKey)!;
  }
  
  const result = resolveAllDependencies(code, configDeps);
  dependencyCache.set(cacheKey, result);
  
  return result;
}
```

### 7.2 懒加载策略

```typescript
// 仅在代码变更时重新解析
const resolvedDependencies = useMemo(() => {
  if (!isValidCode) return {};
  return resolveAllDependencies(code, configDeps);
}, [code, configDeps, isValidCode]); // 仅在依赖变化时重新计算
```

### 7.3 依赖预加载

```typescript
// 在 Sandpack 初始化时预加载常用依赖
const PRELOADED_PACKAGES = new Set([
  'clsx',
  'tailwind-merge',
  'lucide-react',
]);

// Sandpack 会优先使用预加载的包
```

---

## 八、监控与指标

### 8.1 开发环境监控

```typescript
// 在开发环境下输出详细日志
if (process.env.NODE_ENV === 'development') {
  console.group('[Sandpack 依赖解析]');
  console.log('直接依赖:', directDeps);
  console.log('间接依赖:', indirectDeps);
  console.log('配置依赖:', configDeps);
  console.log('最终依赖:', mergedDependencies);
  console.groupEnd();
}
```

### 8.2 错误追踪

```typescript
// 记录依赖缺失事件
function trackMissingDependency(packageName: string) {
  // 发送到分析服务（可选）
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'missing_dependency', {
      package_name: packageName,
      timestamp: Date.now(),
    });
  }
}
```

### 8.3 性能指标

```typescript
// 测量依赖解析耗时
const startTime = performance.now();
const resolved = resolveAllDependencies(code, configDeps);
const duration = performance.now() - startTime;

if (duration > 10) {
  console.warn(`[性能警告] 依赖解析耗时 ${duration.toFixed(2)}ms`);
}
```

---

## 九、扩展方案：AI 辅助依赖声明

### 9.1 AI 提示词模板

在 AI 生成代码时，添加依赖声明提示：

```
如果你在代码中使用了外部依赖，请在 config.schema.json 的 $demo.dependencies 中声明它们。

示例：
{
  "$demo": {
    "dependencies": {
      "framer-motion": "^10.0.0",
      "@react-spring/web": "^9.7.0"
    }
  }
}

这样可以确保 Sandpack 预览环境正确安装所需的依赖。
```

### 9.2 依赖验证规则

```typescript
/**
 * 验证配置文件中的依赖声明
 */
export function validateConfigDependencies(
  configDeps: Record<string, string>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  for (const [pkg, version] of Object.entries(configDeps)) {
    // 验证包名格式
    if (!/^[a-z0-9@][a-z0-9/_.-]*$/i.test(pkg)) {
      errors.push(`无效的包名格式: ${pkg}`);
    }
    
    // 验证版本号格式
    if (!/^[\^~>=<]*\d/.test(version)) {
      errors.push(`无效的版本号格式: ${pkg}@${version}`);
    }
    
    // 检查是否为危险操作（可选）
    if (version === '*' || version === 'latest') {
      errors.push(`不推荐使用通配符版本: ${pkg}`);
    }
  }
  
  return { valid: errors.length === 0, errors };
}
```

---

## 十、风险与缓解措施

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| 依赖版本冲突 | 预览失败 | 中 | 锁定版本号，使用与主项目相同的版本 |
| 依赖解析性能问题 | 加载缓慢 | 低 | 使用 useMemo 缓存，异步解析 |
| PATH_DEPENDENCY_MAP 不完整 | 间接依赖遗漏 | 中 | 定期扫描项目，更新映射表 |
| AI 声明错误的依赖 | 安装失败 | 低 | 添加验证逻辑和错误提示 |
| Sandpack 无法安装某些包 | 预览失败 | 低 | 错误监控 + 手动重试机制 |

---

## 十一、维护指南

### 11.1 定期更新

```bash
# 每月运行一次，更新依赖池
pnpm update-sandpack-deps

# 检查 PATH_DEPENDENCY_MAP 是否需要更新
# 扫描项目中新增的内部模块导入
```

### 11.2 依赖审计

```bash
# 定期检查 Sandpack 依赖与主项目版本是否一致
pnpm audit --prod

# 更新锁文件
pnpm install
```

### 11.3 问题排查流程

1. **检查日志**：开发环境下查看 `[PreviewPanel]` 日志
2. **验证依赖**：确认依赖是否在 `sandpack-deps.generated.ts` 中
3. **检查映射**：如果是间接依赖，确认 `PATH_DEPENDENCY_MAP` 是否正确
4. **手动测试**：在配置文件中手动声明依赖，测试是否生效

---

## 十二、总结

### 方案优势

1. ✅ **自动化**：无需手动维护依赖列表
2. ✅ **完整性**：覆盖直接依赖、间接依赖和配置依赖
3. ✅ **可维护性**：依赖版本与主项目保持一致
4. ✅ **可扩展性**：支持 AI 动态添加新依赖
5. ✅ **容错性**：缺失依赖时自动重试
6. ✅ **可观测性**：完善的日志和监控

### 与短期方案对比

| 维度 | 短期方案 | 长期方案 |
|------|----------|----------|
| 覆盖率 | 60-70% | 95%+ |
| 维护成本 | 高（手动更新） | 低（自动化） |
| 间接依赖 | ❌ 无法识别 | ✅ 自动解析 |
| 性能 | 一般 | 优化（缓存） |
| 扩展性 | 差 | 优秀 |

### 下一步行动

1. 🔴 **立即开始**：实施阶段 1（基础设施）
2. 🟡 **预计 3-4 天**：完成全部 5 个阶段
3. 🟢 **持续维护**：定期更新依赖映射

---

**报告创建时间**：2026-04-12  
**最后更新时间**：2026-04-12  
**创建人**：Qwen Code AI Agent  
**触发事件**：AI 删除 banner 后预览区报错缺少 clsx 依赖  
**方案状态**：✅ 长期根治方案（推荐实施）