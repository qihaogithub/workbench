import { createHash } from "node:crypto";
import { transform } from "sucrase";

import {
  assertPreviewRuntimeContract,
  assertCompiledPreviewModule,
  createCompileTransformIssue,
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
}

export interface CompilePreviewPageSourceOptions {
  resolveDependencyUrl: (specifier: string) => string;
}

function isCssImport(moduleName: string): boolean {
  return moduleName.endsWith(".css") || moduleName.endsWith(".scss") || moduleName.endsWith(".less");
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
    throw new PreviewRuntimeContractError([createCompileTransformIssue(error)]);
  }
  const dependencies = extractImports(transformed.code);
  const cssImports = dependencies.filter(isCssImport);
  const compiledCode = rewriteImportsWithResolver(
    transformed.code,
    dependencies,
    options.resolveDependencyUrl,
  );
  assertCompiledPreviewModule(compiledCode);

  return {
    compiledCode,
    dependencies,
    cssImports,
    moduleHash: createHash("sha256").update(compiledCode).digest("hex"),
  };
}
