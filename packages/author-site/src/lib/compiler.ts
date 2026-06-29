import { transform } from 'sucrase';
import { createHash } from 'crypto';
import {
  readProjectMeta,
  getSessionMeta,
  getWorkspaceDemoPageFiles,
} from './fs-utils';
import {
  PREVIEW_DEPENDENCY_POLICY,
  PREVIEW_DEPENDENCY_POLICY_VERSION,
  assertPreviewRuntimeContract,
  getPreviewDependencyUrl,
  isNpmPackage,
} from './preview-dependency-policy';
import type { PreviewRuntimeResolveOptions } from './preview-runtime-manifest';

export interface CompileResult {
  compiledCode: string;
  dependencies: string[];
  cssImports: string[];
  moduleHash: string;
  moduleUrl?: string;
}

// 服务端编译缓存
const compileCache = new Map<string, CompileResult>();
const MAX_CACHE_SIZE = 100;

/**
 * 生成代码内容的 hash，用于缓存 key
 */
function getCodeHash(code: string): string {
  return createHash('md5').update(code).digest('hex');
}

/**
 * 移除代码中的注释（单行和多行），避免正则误判
 */
function removeComments(code: string): string {
  return code
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * 从代码中提取 import 语句的模块名
 * 返回所有 import 的源模块，包括 npm 包和相对路径
 */
export function extractImports(code: string): string[] {
  const cleanCode = removeComments(code);
  const imports: string[] = [];
  const seen = new Set<string>();

  // 匹配: import ... from 'module' 或 import 'module'
  const regex = /import\s+(?:(?:[^'"]*\s+from\s+)?['"]([^'"]+)['"]|['"]([^'"]+)['"])/g;
  let match;

  while ((match = regex.exec(cleanCode)) !== null) {
    const moduleName = match[1] || match[2];
    if (moduleName && !seen.has(moduleName)) {
      seen.add(moduleName);
      imports.push(moduleName);
    }
  }

  return imports;
}

/**
 * 判断一个 import 是否是 CSS 导入
 */
function isCssImport(moduleName: string): boolean {
  return moduleName.endsWith('.css') || moduleName.endsWith('.scss') || moduleName.endsWith('.less');
}

/**
 * 将 npm 包名映射到 esm.sh CDN URL
 * 只允许使用 previewDependencyPolicy 中登记的固定版本或虚拟模块
 */
function toRuntimeUrl(
  packageName: string,
  options?: PreviewRuntimeResolveOptions,
): string {
  return getPreviewDependencyUrl(packageName, options);
}

/**
 * 转义正则表达式特殊字符
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toImportSpecifier(moduleName: string): string {
  return JSON.stringify(moduleName);
}

/**
 * 将编译后代码中的 npm 包 import 路径替换为 CDN URL
 * 保留相对路径和 CSS 导入不变（由调用方单独处理）
 */
export function rewriteImportsToCdn(
  compiledCode: string,
  dependencies: string[],
  _lockedDependencies?: Record<string, string>,
  runtimeOptions?: PreviewRuntimeResolveOptions,
): string {
  let result = compiledCode;

  for (const dep of dependencies) {
    if (!isNpmPackage(dep) || isCssImport(dep)) continue;

    const cdnUrl = toRuntimeUrl(dep, runtimeOptions);
    
    // 替换 from 'package' 和 from "package"
    const fromPattern = new RegExp(
      `from\\s+(['"])${escapeRegex(dep)}\\1`,
      'g'
    );
    result = result.replace(fromPattern, `from ${toImportSpecifier(cdnUrl)}`);

    // 替换 import 'package' 和 import "package"（副作用导入）
    const importPattern = new RegExp(
      `import\\s+(['"])${escapeRegex(dep)}\\1`,
      'g'
    );
    result = result.replace(importPattern, `import ${toImportSpecifier(cdnUrl)}`);
  }

  return result;
}

/**
 * Figma 导入的代码是裸 JSX（无 export default），iframe 无法渲染。
 * 此函数检测并自动包装：裸 JSX → export default function() { return (...) }
 * 有组件变量但无 export default → 追加 export default Xxx
 */
function autoWrapIfNoDefaultExport(code: string): string {
  if (/\bexport\s+default\b/.test(removeComments(code))) {
    return code;
  }

  const trimmed = code.trim();

  if (trimmed.startsWith('<')) {
    return `export default function __AutoComponent__() {\n  return (\n${code}\n  );\n}`;
  }

  const componentMatch = code.match(/(?:const|let|var|function)\s+([A-Z]\w*)\s*[=({]/);
  if (componentMatch) {
    return `${code}\nexport default ${componentMatch[1]};\n`;
  }

  return code;
}

/**
 * 编译代码，返回编译结果（含 CSS 导入列表）
 * 编译后代码中的 npm 包 import 路径已被替换为 CDN URL
 */
export function compileCode(
  code: string,
  lockedDependencies?: Record<string, string>,
  runtimeOptions?: PreviewRuntimeResolveOptions,
): CompileResult {
  const wrappedCode = autoWrapIfNoDefaultExport(code);
  assertPreviewRuntimeContract(wrappedCode);

  const cacheKey = getCodeHash(
    wrappedCode +
      PREVIEW_DEPENDENCY_POLICY_VERSION +
      JSON.stringify(lockedDependencies || {}) +
      JSON.stringify(runtimeOptions || {}),
  );
  const cached = compileCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // 1. 使用 sucrase 编译：只转换 TypeScript 和 JSX，保留 ESM import/export
  const result = transform(wrappedCode, {
    transforms: ['typescript', 'jsx'],
    jsxRuntime: 'automatic',
    production: true,
  });

  // 2. 从编译后的代码中提取依赖（包括自动添加的 react/jsx-runtime）
  const dependencies = extractImports(result.code);

  // 3. 分类处理
  const cssImports = dependencies.filter(isCssImport);

  // 4. 将 npm 包 import 路径替换为 CDN URL
  const compiledCode = rewriteImportsToCdn(
    result.code,
    dependencies,
    lockedDependencies,
    runtimeOptions,
  );
  const moduleHash = createHash('sha256').update(compiledCode).digest('hex');

  const compileResult: CompileResult = {
    compiledCode,
    dependencies,
    cssImports,
    moduleHash,
  };

  // 5. 写入缓存
  if (compileCache.size >= MAX_CACHE_SIZE) {
    const firstKey = compileCache.keys().next().value;
    if (firstKey !== undefined) {
      compileCache.delete(firstKey);
    }
  }
  compileCache.set(cacheKey, compileResult);

  return compileResult;
}

/**
 * 异步解析 npm 包在 esm.sh 上的实际版本 URL
 * 通过 HEAD 请求获取重定向后的 URL
 */
export async function resolveDependencyVersion(
  packageName: string,
): Promise<string | null> {
  if (!isNpmPackage(packageName) || isCssImport(packageName)) {
    return null;
  }

  // 预览依赖策略已有固定版本，不需要通过 CDN 重定向解析。
  if (PREVIEW_DEPENDENCY_POLICY[packageName]) {
    return null;
  }

  return null;
}

/**
 * 批量解析依赖版本并返回锁定映射
 */
export async function resolveDependencyVersions(
  dependencies: string[],
): Promise<Record<string, string>> {
  const locks: Record<string, string> = {};

  for (const dep of dependencies) {
    const resolved = await resolveDependencyVersion(dep);
    if (resolved) {
      locks[dep] = resolved;
    }
  }

  return locks;
}

/**
 * 从 Session/Workspace 读取代码并编译
 * 自动读取关联项目的依赖版本锁定
 * @param sessionId Session ID
 * @param demoId 多页面模式下必填，指定要编译的页面
 */
export function compileSession(
  sessionId: string,
  demoId?: string,
  runtimeOptions?: PreviewRuntimeResolveOptions,
): CompileResult | null {
  let code: string | undefined;

  // 多页面模式：通过 workspace 读取指定页面
  if (demoId) {
    const sessionMeta = getSessionMeta(sessionId);
    if (sessionMeta?.workspaceId) {
      const files = getWorkspaceDemoPageFiles(sessionMeta.workspaceId, demoId);
      if (files) {
        code = files.code;
      }
    }
  }

  if (!code) {
    return null;
  }

  // 尝试读取项目元数据中的锁定依赖
  let lockedDependencies: Record<string, string> | undefined;
  try {
    const sessionMeta = getSessionMeta(sessionId);
    if (sessionMeta?.demoId) {
      const project = readProjectMeta(sessionMeta.demoId);
      if (project?.lockedDependencies) {
        lockedDependencies = project.lockedDependencies;
      }
    }
  } catch {
    // 忽略元数据读取错误，使用默认版本
  }

  const result = compileCode(code, lockedDependencies, runtimeOptions);

  return result;
}
