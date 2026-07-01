import * as LucideIcons from "lucide-react";
import * as ts from "typescript";
import { PREVIEW_DEPENDENCY_POLICY } from "./rules.js";
export {
  PREVIEW_CONTRACT_VERSION,
  PREVIEW_DEPENDENCY_POLICY,
  generatePreviewAuthoringRules,
  type PreviewDependencyDefinition,
  type PreviewDependencyKind,
} from "./rules.js";

export type PreviewSourceMode = "authoring" | "compiled";

export type RuntimeContractStage =
  | "source_contract"
  | "dependency_import"
  | "component_export"
  | "render_contract"
  | "schema_contract"
  | "compile_transform"
  | "module_parse";

export interface ImportDeclaration {
  moduleName: string;
  namedImports: string[];
}

export interface RuntimeContractIssue {
  stage: RuntimeContractStage;
  code:
    | "UNKNOWN_NPM_IMPORT"
    | "RELATIVE_IMPORT_UNSUPPORTED"
    | "INVALID_LUCIDE_IMPORT"
    | "AUTHORING_RUNTIME_IMPORT_UNSUPPORTED"
    | "NO_RENDERABLE_COMPONENT"
    | "EMPTY_RENDER_RISK"
    | "COMPILE_TRANSFORM_FAILED"
    | "MODULE_PARSE_FAILED"
    | "DUPLICATE_TOP_LEVEL_DECLARATION"
    | "MULTIPLE_DEFAULT_EXPORTS"
    | "FILE_READ_ERROR"
    | "INVALID_JSON";
  severity: "error" | "warning";
  moduleName?: string;
  importName?: string;
  message: string;
  instruction: string;
}

export interface RuntimeContractValidation {
  ok: boolean;
  issues: RuntimeContractIssue[];
}

export type PreviewGenerationDiagnostic = RuntimeContractIssue;

export interface ValidatePreviewPageSourceOptions {
  mode?: PreviewSourceMode;
}

export class PreviewRuntimeContractError extends Error {
  readonly issues: RuntimeContractIssue[];

  constructor(issues: RuntimeContractIssue[]) {
    super("页面运行时契约校验失败");
    this.name = "PreviewRuntimeContractError";
    this.issues = issues;
  }
}

const LUCIDE_EXPORTS = new Set(Object.keys(LucideIcons));

const MODULE_PARSE_TARGET = ts.ScriptTarget.ES2022;
const MODULE_PARSE_KIND = ts.ModuleKind.ESNext;

function removeComments(code: string): string {
  return code
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

function isCssImport(moduleName: string): boolean {
  return moduleName.endsWith(".css") || moduleName.endsWith(".scss") || moduleName.endsWith(".less");
}

export function isNpmPackage(moduleName: string): boolean {
  return !moduleName.startsWith(".") && !moduleName.startsWith("/");
}

function getPolicyPackageName(moduleName: string): string {
  if (moduleName === "react" || moduleName.startsWith("react/")) return "react";
  if (moduleName === "react-dom" || moduleName.startsWith("react-dom/")) return "react-dom";
  return moduleName;
}

export function isPreviewDependencyAllowed(moduleName: string): boolean {
  if (isCssImport(moduleName)) return true;
  return PREVIEW_DEPENDENCY_POLICY[getPolicyPackageName(moduleName)] !== undefined;
}

function splitNamedImports(namedBlock: string): string[] {
  return namedBlock
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.replace(/\s+as\s+\w+$/u, "").trim())
    .filter(Boolean);
}

export function extractImportDeclarations(code: string): ImportDeclaration[] {
  const cleanCode = removeComments(code);
  const declarations: ImportDeclaration[] = [];

  const fromImportRegex = /import\s+(?:type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
  let fromMatch: RegExpExecArray | null;
  while ((fromMatch = fromImportRegex.exec(cleanCode)) !== null) {
    const clause = fromMatch[1] || "";
    const moduleName = fromMatch[2];
    const namedBlockMatch = clause.match(/\{([\s\S]*?)\}/);
    declarations.push({
      moduleName,
      namedImports: namedBlockMatch ? splitNamedImports(namedBlockMatch[1]) : [],
    });
  }

  const sideEffectImportRegex = /import\s+['"]([^'"]+)['"]/g;
  let sideEffectMatch: RegExpExecArray | null;
  while ((sideEffectMatch = sideEffectImportRegex.exec(cleanCode)) !== null) {
    declarations.push({
      moduleName: sideEffectMatch[1],
      namedImports: [],
    });
  }

  return declarations;
}

export function wrapPreviewPageSource(source: string): string {
  if (/\bexport\s+default\b/.test(removeComments(source))) {
    return source;
  }

  const trimmed = source.trim();
  if (trimmed.startsWith("<")) {
    return `export default function __AutoComponent__() {\n  return (\n${source}\n  );\n}`;
  }

  const componentMatch = source.match(/(?:const|let|var|function)\s+([A-Z]\w*)\s*[=({]/);
  if (componentMatch) {
    return `${source}\nexport default ${componentMatch[1]};\n`;
  }

  return source;
}

export function validatePreviewPageSource(
  source: string,
  options: ValidatePreviewPageSourceOptions = {},
): RuntimeContractValidation {
  const mode = options.mode ?? "authoring";
  const wrappedSource = wrapPreviewPageSource(source);
  const issues: RuntimeContractIssue[] = [];
  const declarations = extractImportDeclarations(wrappedSource);

  for (const declaration of declarations) {
    const { moduleName } = declaration;
    if (isCssImport(moduleName)) continue;

    if (mode === "authoring" && moduleName === "react/jsx-runtime") {
      issues.push({
        stage: "source_contract",
        code: "AUTHORING_RUNTIME_IMPORT_UNSUPPORTED",
        severity: "error",
        moduleName,
        message: "页面源码不应直接导入 react/jsx-runtime",
        instruction: "请保留原始 JSX 交给创作端预览编译器转换，不要提交已经预编译的 JSX runtime 代码。",
      });
      continue;
    }

    if (!isNpmPackage(moduleName)) {
      issues.push({
        stage: "dependency_import",
        code: "RELATIVE_IMPORT_UNSUPPORTED",
        severity: "error",
        moduleName,
        message: `预览运行时不支持相对源码导入 ${moduleName}`,
        instruction: "页面代码必须保持单文件；图片请使用配置数据或 ImageAsset，通用能力请使用 @preview/sdk。",
      });
      continue;
    }

    if (!isPreviewDependencyAllowed(moduleName)) {
      issues.push({
        stage: "dependency_import",
        code: "UNKNOWN_NPM_IMPORT",
        severity: "error",
        moduleName,
        message: `预览运行时未登记依赖 ${moduleName}`,
        instruction: "请改用 @preview/sdk 暴露的受控能力，或由开发团队先将该依赖加入 preview dependency policy。",
      });
      continue;
    }

    if (moduleName === "lucide-react") {
      for (const importName of declaration.namedImports) {
        if (!LUCIDE_EXPORTS.has(importName)) {
          issues.push({
            stage: "dependency_import",
            code: "INVALID_LUCIDE_IMPORT",
            severity: "error",
            moduleName,
            importName,
            message: `lucide-react@${PREVIEW_DEPENDENCY_POLICY["lucide-react"].version} 不提供 ${importName} 导出`,
            instruction: "请改用 @preview/sdk 的 Icon 语义名称，或替换为 lucide-react 中存在的图标。",
          });
        }
      }
    }
  }

  if (!/\bexport\s+default\b/.test(removeComments(wrappedSource))) {
    issues.push({
      stage: "component_export",
      code: "NO_RENDERABLE_COMPONENT",
      severity: "error",
      message: "页面源码没有可推断的默认渲染组件",
      instruction: "请提供 export default React 组件，或提供可自动导出的首字母大写组件。",
    });
  }

  if (/\breturn\s+null\s*;?/.test(removeComments(wrappedSource))) {
    issues.push({
      stage: "render_contract",
      code: "EMPTY_RENDER_RISK",
      severity: "error",
      message: "组件存在 return null，可能导致预览空白",
      instruction: "请返回可见 DOM；需要等待状态时使用加载占位，而不是返回 null。",
    });
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

function diagnosticMessageTextToString(message: ts.Diagnostic["messageText"]): string {
  return typeof message === "string"
    ? message
    : ts.flattenDiagnosticMessageText(message, "\n");
}

function createCompileIssue(message: string): RuntimeContractIssue {
  return {
    stage: "compile_transform",
    code: "COMPILE_TRANSFORM_FAILED",
    severity: "error",
    message: `页面源码无法完成 TSX/JSX 转换：${message}`,
    instruction: "请修复 TSX/JSX 语法错误，保留一个完整的 React 组件模块后重新生成。",
  };
}

export function createCompileTransformIssue(error: unknown): RuntimeContractIssue {
  if (error instanceof Error && error.message.trim()) {
    return createCompileIssue(error.message.trim());
  }
  return createCompileIssue("未知编译错误");
}

function createModuleParseIssue(message: string): RuntimeContractIssue {
  return {
    stage: "module_parse",
    code: "MODULE_PARSE_FAILED",
    severity: "error",
    message: `编译产物无法作为 ESM 模块解析：${message}`,
    instruction: "请保留一个完整 React 组件模块，删除破损或重复拼接的源码片段后重新生成。",
  };
}

function createDuplicateTopLevelDeclarationIssue(name: string): RuntimeContractIssue {
  return {
    stage: "module_parse",
    code: "DUPLICATE_TOP_LEVEL_DECLARATION",
    severity: "error",
    message: `顶层声明 ${name} 重复，浏览器会拒绝导入该模块`,
    instruction: "请保留一个完整 React 组件模块，删除重复拼接块，确保每个顶层变量、函数或导入名称只声明一次。",
  };
}

function createMultipleDefaultExportsIssue(): RuntimeContractIssue {
  return {
    stage: "module_parse",
    code: "MULTIPLE_DEFAULT_EXPORTS",
    severity: "error",
    message: "页面模块包含多个 default export，浏览器会拒绝导入该模块",
    instruction: "请只保留一个 export default React 组件，删除重复导出的组件块。",
  };
}

function collectBindingNames(name: ts.BindingName, names: string[]): void {
  if (ts.isIdentifier(name)) {
    names.push(name.text);
    return;
  }
  for (const element of name.elements) {
    if (ts.isBindingElement(element)) {
      collectBindingNames(element.name, names);
    }
  }
}

function addBindingName(
  names: Map<string, number>,
  issues: RuntimeContractIssue[],
  name: string | undefined,
): void {
  if (!name) return;
  const count = names.get(name) ?? 0;
  if (count === 1) {
    issues.push(createDuplicateTopLevelDeclarationIssue(name));
  }
  names.set(name, count + 1);
}

function hasDefaultModifier(node: ts.Node): boolean {
  return ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword);
}

export function validateCompiledPreviewModule(compiledCode: string): RuntimeContractValidation {
  const transpiled = ts.transpileModule(compiledCode, {
    compilerOptions: {
      allowJs: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: MODULE_PARSE_KIND,
      target: MODULE_PARSE_TARGET,
    },
    reportDiagnostics: true,
  });
  const issues: RuntimeContractIssue[] = [];
  for (const diagnostic of transpiled.diagnostics ?? []) {
    if (diagnostic.category === ts.DiagnosticCategory.Error) {
      issues.push(createModuleParseIssue(diagnosticMessageTextToString(diagnostic.messageText)));
    }
  }

  const sourceFile = ts.createSourceFile(
    "preview-module.mjs",
    compiledCode,
    MODULE_PARSE_TARGET,
    true,
    ts.ScriptKind.JS,
  );
  const topLevelNames = new Map<string, number>();
  let defaultExportCount = 0;

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      const importClause = statement.importClause;
      addBindingName(topLevelNames, issues, importClause?.name?.text);
      const namedBindings = importClause?.namedBindings;
      if (namedBindings && ts.isNamedImports(namedBindings)) {
        for (const element of namedBindings.elements) {
          addBindingName(topLevelNames, issues, element.name.text);
        }
      }
      continue;
    }

    if (ts.isExportAssignment(statement)) {
      defaultExportCount += 1;
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const names: string[] = [];
        collectBindingNames(declaration.name, names);
        for (const name of names) {
          addBindingName(topLevelNames, issues, name);
        }
      }
      continue;
    }

    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
      if (hasDefaultModifier(statement)) {
        defaultExportCount += 1;
      }
      addBindingName(topLevelNames, issues, statement.name?.text);
    }
  }

  if (defaultExportCount > 1) {
    issues.push(createMultipleDefaultExportsIssue());
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

export function assertPreviewRuntimeContract(
  source: string,
  options: ValidatePreviewPageSourceOptions = {},
): void {
  const validation = validatePreviewPageSource(source, options);
  if (!validation.ok) {
    throw new PreviewRuntimeContractError(validation.issues);
  }
}

export function assertCompiledPreviewModule(compiledCode: string): void {
  const validation = validateCompiledPreviewModule(compiledCode);
  if (!validation.ok) {
    throw new PreviewRuntimeContractError(validation.issues);
  }
}

export function extractImports(code: string): string[] {
  const imports: string[] = [];
  const seen = new Set<string>();
  for (const declaration of extractImportDeclarations(code)) {
    if (!seen.has(declaration.moduleName)) {
      seen.add(declaration.moduleName);
      imports.push(declaration.moduleName);
    }
  }
  return imports;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toImportSpecifier(moduleName: string): string {
  return JSON.stringify(moduleName);
}

export function rewriteImportsWithResolver(
  compiledCode: string,
  dependencies: string[],
  resolveDependencyUrl: (specifier: string) => string,
): string {
  let result = compiledCode;

  for (const dependency of dependencies) {
    if (!isNpmPackage(dependency) || isCssImport(dependency)) continue;

    const runtimeUrl = resolveDependencyUrl(dependency);
    const fromPattern = new RegExp(`from\\s+(['"])${escapeRegex(dependency)}\\1`, "g");
    result = result.replace(fromPattern, `from ${toImportSpecifier(runtimeUrl)}`);

    const importPattern = new RegExp(`import\\s+(['"])${escapeRegex(dependency)}\\1`, "g");
    result = result.replace(importPattern, `import ${toImportSpecifier(runtimeUrl)}`);
  }

  return result;
}
