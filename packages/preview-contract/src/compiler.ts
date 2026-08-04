import { createHash } from "node:crypto";
import { transform } from "sucrase";

import {
  assertPreviewRuntimeContract,
  assertCompiledPreviewModule,
  createCompileTransformIssue,
  type CompileErrorContext,
  extractImports,
  PreviewRuntimeContractError,
  rewriteImportsWithResolver,
  wrapPreviewPageSource,
} from "./runtime.js";

export interface CompileResult {
  compiledCode: string;
  dependencies: string[];
  cssImports: string[];
  moduleHash: string;
  typeLimits?: Record<string, number>;
}

export interface CompilePreviewPageSourceOptions {
  resolveDependencyUrl: (specifier: string) => string;
}

function isCssImport(moduleName: string): boolean {
  return moduleName.endsWith(".css") || moduleName.endsWith(".scss") || moduleName.endsWith(".less");
}

function detectTypeLimits(code: string): Record<string, number> | undefined {
  const filterBlock = code.match(/\.filter\s*\(\s*\(?\w+\)?\s*=>\s*\{([\s\S]*?)\n\s*\}\)/);
  if (!filterBlock) return undefined;
  const body = filterBlock[1];
  if (!/return\s+false/.test(body)) return undefined;

  const dedupPattern = /(\w+)\.type\s*===?\s*["'](\w+)["']/g;
  const limits: Record<string, number> = {};
  let m: RegExpExecArray | null;
  while ((m = dedupPattern.exec(body)) !== null) {
    const trackerVar = m[1];
    const typeValue = m[2];
    const after = body.slice(m.index + m[0].length, m.index + m[0].length + 300);
    if (new RegExp(`if\\s*\\(\\s*${trackerVar}\\b`).test(after) && after.includes("return false")) {
      limits[typeValue] = 1;
    }
  }
  return Object.keys(limits).length > 0 ? limits : undefined;
}

export function compilePreviewPageSource(
  source: string,
  options: CompilePreviewPageSourceOptions,
): CompileResult {
  const wrappedSource = wrapPreviewPageSource(source);
  assertPreviewRuntimeContract(wrappedSource, { mode: "authoring" });

  let transformed: ReturnType<typeof transform>;
  try {
    transformed = transform(wrappedSource, {
      transforms: ["typescript", "jsx"],
      jsxRuntime: "automatic",
      production: true,
    });
  } catch (error) {
    const context: CompileErrorContext = { source: wrappedSource };
    throw new PreviewRuntimeContractError([createCompileTransformIssue(error, context)]);
  }
  const dependencies = extractImports(transformed.code);
  const cssImports = dependencies.filter(isCssImport);
  const compiledCode = rewriteImportsWithResolver(
    transformed.code,
    dependencies,
    options.resolveDependencyUrl,
  );
  assertCompiledPreviewModule(compiledCode, { generated: true });

  const typeLimits = detectTypeLimits(compiledCode);

  return {
    compiledCode,
    dependencies,
    cssImports,
    moduleHash: createHash("sha256").update(compiledCode).digest("hex"),
    ...(typeLimits ? { typeLimits } : {}),
  };
}
