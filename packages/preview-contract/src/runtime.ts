import * as ts from "typescript";
import { PREVIEW_DEPENDENCY_POLICY } from "./rules.js";

let _LUCIDE_EXPORTS: Set<string> | undefined;

function getLucideExports(): Set<string> {
  if (_LUCIDE_EXPORTS) return _LUCIDE_EXPORTS;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const LucideIcons = require("lucide-react");
    _LUCIDE_EXPORTS = new Set(Object.keys(LucideIcons));
  } catch {
    // lucide-react 不在当前运行时可用（如 agent-service 后端上下文），回退空集合
    _LUCIDE_EXPORTS = new Set<string>();
  }
  return _LUCIDE_EXPORTS;
}
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
  typeOnly?: boolean;
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
    | "GENERATED_MODULE_BINDING_CONFLICT"
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

export interface ValidateCompiledPreviewModuleOptions {
  generated?: boolean;
}

export class PreviewRuntimeContractError extends Error {
  readonly issues: RuntimeContractIssue[];

  constructor(issues: RuntimeContractIssue[]) {
    super("页面运行时契约校验失败");
    this.name = "PreviewRuntimeContractError";
    this.issues = issues;
  }
}

const LUCIDE_EXPORTS = getLucideExports();

const MODULE_PARSE_TARGET = ts.ScriptTarget.ES2022;
const MODULE_PARSE_KIND = ts.ModuleKind.ESNext;

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

export function extractImportDeclarations(code: string): ImportDeclaration[] {
  const sourceFile = ts.createSourceFile(
    "preview-source.tsx",
    code,
    MODULE_PARSE_TARGET,
    true,
    ts.ScriptKind.TSX,
  );
  const declarations: ImportDeclaration[] = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    const moduleName = statement.moduleSpecifier.text;
    const importClause = statement.importClause;
    const namedImports: string[] = [];
    const namedBindings = importClause?.namedBindings;
    if (namedBindings && ts.isNamedImports(namedBindings)) {
      for (const element of namedBindings.elements) {
        if (!element.isTypeOnly) {
          namedImports.push(element.name.text);
        }
      }
    }
    declarations.push({
      moduleName,
      namedImports,
      typeOnly: Boolean(importClause?.isTypeOnly),
    });
  }

  return declarations;
}

function hasDefaultExport(source: string): boolean {
  const sourceFile = ts.createSourceFile(
    "preview-source.tsx",
    source,
    MODULE_PARSE_TARGET,
    true,
    ts.ScriptKind.TSX,
  );
  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement)) return true;
    if (hasDefaultModifier(statement)) return true;
    if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      if (statement.exportClause.elements.some((element) => element.name.text === "default")) {
        return true;
      }
    }
  }
  return false;
}

function isNullExpression(expression: ts.Expression | undefined): boolean {
  return expression?.kind === ts.SyntaxKind.NullKeyword;
}

function bodyDirectlyReturnsNull(body: ts.ConciseBody | ts.Block | undefined): boolean {
  if (!body) return false;
  if (!ts.isBlock(body)) {
    return isNullExpression(body);
  }

  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (node !== body && (ts.isFunctionLike(node) || ts.isClassLike(node))) {
      return;
    }
    if (ts.isReturnStatement(node) && isNullExpression(node.expression)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return found;
}

function classRenderReturnsNull(node: ts.ClassDeclaration | ts.ClassExpression): boolean {
  for (const member of node.members) {
    if (
      ts.isMethodDeclaration(member) &&
      ts.isIdentifier(member.name) &&
      member.name.text === "render" &&
      bodyDirectlyReturnsNull(member.body)
    ) {
      return true;
    }
  }
  return false;
}

function declarationReturnsNull(statement: ts.Statement, name: string): boolean {
  if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) {
    return bodyDirectlyReturnsNull(statement.body);
  }

  if (ts.isClassDeclaration(statement) && statement.name?.text === name) {
    return classRenderReturnsNull(statement);
  }

  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== name) continue;
      const initializer = declaration.initializer;
      if (!initializer) continue;
      if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
        return bodyDirectlyReturnsNull(initializer.body);
      }
      if (ts.isClassExpression(initializer)) {
        return classRenderReturnsNull(initializer);
      }
    }
  }

  return false;
}

function hasDefaultRenderableReturnNull(source: string): boolean {
  const sourceFile = ts.createSourceFile(
    "preview-source.tsx",
    source,
    MODULE_PARSE_TARGET,
    true,
    ts.ScriptKind.TSX,
  );

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && hasDefaultModifier(statement)) {
      return bodyDirectlyReturnsNull(statement.body);
    }

    if (ts.isClassDeclaration(statement) && hasDefaultModifier(statement)) {
      return classRenderReturnsNull(statement);
    }

    if (ts.isExportAssignment(statement)) {
      const expression = statement.expression;
      if (isNullExpression(expression)) return true;
      if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) {
        return bodyDirectlyReturnsNull(expression.body);
      }
      if (ts.isClassExpression(expression)) {
        return classRenderReturnsNull(expression);
      }
      if (ts.isIdentifier(expression)) {
        return sourceFile.statements.some((candidate) => declarationReturnsNull(candidate, expression.text));
      }
    }
  }

  return false;
}

export function wrapPreviewPageSource(source: string): string {
  if (hasDefaultExport(source)) {
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
    if (declaration.typeOnly) continue;
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

  issues.push(...collectTopLevelModuleIssues(wrappedSource, ts.ScriptKind.TSX));

  if (!hasDefaultExport(wrappedSource)) {
    issues.push({
      stage: "component_export",
      code: "NO_RENDERABLE_COMPONENT",
      severity: "error",
      message: "页面源码没有可推断的默认渲染组件",
      instruction: "请提供 export default React 组件，或提供可自动导出的首字母大写组件。",
    });
  }

  if (hasDefaultRenderableReturnNull(wrappedSource)) {
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

function createGeneratedModuleBindingConflictIssue(name: string): RuntimeContractIssue {
  return {
    stage: "module_parse",
    code: "GENERATED_MODULE_BINDING_CONFLICT",
    severity: "error",
    message: `预览编译生成模块的顶层绑定 ${name} 发生冲突，浏览器会拒绝导入该模块`,
    instruction: "这是预览编译生成产物与页面源码绑定名的冲突，请由系统侧调整编译隔离或生成绑定命名；不要把不同页面的同名普通变量当作重复拼接处理。",
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

type TopLevelBindingKind = "lexical" | "var";

interface TopLevelBindingState {
  lexicalCount: number;
  varCount: number;
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
  names: Map<string, TopLevelBindingState>,
  issues: RuntimeContractIssue[],
  name: string | undefined,
  kind: TopLevelBindingKind,
  options: { generated?: boolean } = {},
): void {
  if (!name) return;
  const state = names.get(name) ?? { lexicalCount: 0, varCount: 0 };
  const conflicts =
    kind === "var"
      ? state.lexicalCount > 0
      : state.lexicalCount > 0 || state.varCount > 0;
  if (conflicts) {
    issues.push(
      options.generated
        ? createGeneratedModuleBindingConflictIssue(name)
        : createDuplicateTopLevelDeclarationIssue(name),
    );
  }
  if (kind === "var") {
    state.varCount += 1;
  } else {
    state.lexicalCount += 1;
  }
  names.set(name, state);
}

function hasDefaultModifier(node: ts.Node): boolean {
  return ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword);
}

function collectTopLevelModuleIssues(
  source: string,
  scriptKind: ts.ScriptKind,
  options: ValidateCompiledPreviewModuleOptions = {},
): RuntimeContractIssue[] {
  const sourceFile = ts.createSourceFile(
    "preview-module.mjs",
    source,
    MODULE_PARSE_TARGET,
    true,
    scriptKind,
  );
  const issues: RuntimeContractIssue[] = [];
  const topLevelNames = new Map<string, TopLevelBindingState>();
  let defaultExportCount = 0;

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      const importClause = statement.importClause;
      if (!importClause || importClause.isTypeOnly) continue;
      addBindingName(topLevelNames, issues, importClause.name?.text, "lexical", options);
      const namedBindings = importClause.namedBindings;
      if (namedBindings && ts.isNamedImports(namedBindings)) {
        for (const element of namedBindings.elements) {
          if (!element.isTypeOnly) {
            addBindingName(topLevelNames, issues, element.name.text, "lexical", options);
          }
        }
      } else if (namedBindings && ts.isNamespaceImport(namedBindings)) {
        addBindingName(topLevelNames, issues, namedBindings.name.text, "lexical", options);
      }
      continue;
    }

    if (ts.isExportAssignment(statement)) {
      defaultExportCount += 1;
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      const kind =
        (statement.declarationList.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) !== 0
          ? "lexical"
          : "var";
      for (const declaration of statement.declarationList.declarations) {
        const names: string[] = [];
        collectBindingNames(declaration.name, names);
        for (const name of names) {
          addBindingName(topLevelNames, issues, name, kind, options);
        }
      }
      continue;
    }

    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
      if (hasDefaultModifier(statement)) {
        defaultExportCount += 1;
      }
      addBindingName(topLevelNames, issues, statement.name?.text, "lexical", options);
    }
  }

  if (defaultExportCount > 1) {
    issues.push(createMultipleDefaultExportsIssue());
  }

  return issues;
}

export function validateCompiledPreviewModule(
  compiledCode: string,
  options: ValidateCompiledPreviewModuleOptions = {},
): RuntimeContractValidation {
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

  issues.push(...collectTopLevelModuleIssues(compiledCode, ts.ScriptKind.JS, options));

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

export function assertCompiledPreviewModule(
  compiledCode: string,
  options: ValidateCompiledPreviewModuleOptions = {},
): void {
  const validation = validateCompiledPreviewModule(compiledCode, options);
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
