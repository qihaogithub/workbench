import { describe, expect, it } from "vitest";

import { compilePreviewPageSource } from "./compiler.js";
import {
  generatePreviewAuthoringRules,
  validateCompiledPreviewModule,
  validatePreviewPageSource,
} from "./runtime.js";

const resolveDependencyUrl = (specifier: string) => `/runtime/${specifier}.js`;

describe("preview contract", () => {
  it("接受原始 JSX 页面源码", () => {
    const validation = validatePreviewPageSource("export default function Demo(){ return <div>Hello</div>; }");

    expect(validation.ok).toBe(true);
  });

  it("支持 TSX 类型语法并编译为 runtime import", () => {
    const compiled = compilePreviewPageSource(
      "interface Props { title: string }\nexport default function Demo({ title }: Props){ return <h1>{title}</h1>; }",
      { resolveDependencyUrl },
    );

    expect(compiled.compiledCode).toContain("/runtime/react/jsx-runtime.js");
    expect(compiled.dependencies).toContain("react/jsx-runtime");
  });

  it("阻止相对源码导入", () => {
    const validation = validatePreviewPageSource("import X from './x';\nexport default function Demo(){ return <X/>; }");

    expect(validation.ok).toBe(false);
    expect(validation.issues[0]?.code).toBe("RELATIVE_IMPORT_UNSUPPORTED");
  });

  it("阻止未登记 npm 依赖", () => {
    const validation = validatePreviewPageSource("import dayjs from 'dayjs';\nexport default function Demo(){ return <div>{dayjs().format()}</div>; }");

    expect(validation.ok).toBe(false);
    expect(validation.issues[0]?.code).toBe("UNKNOWN_NPM_IMPORT");
  });

  it("阻止 authoring 源码手写 react/jsx-runtime", () => {
    const validation = validatePreviewPageSource("import { jsx } from 'react/jsx-runtime';\nexport default function Demo(){ return jsx('div', {}); }");

    expect(validation.ok).toBe(false);
    expect(validation.issues[0]?.code).toBe("AUTHORING_RUNTIME_IMPORT_UNSUPPORTED");
  });

  it("compiled 模式允许 react/jsx-runtime", () => {
    const validation = validatePreviewPageSource(
      "import { jsx } from 'react/jsx-runtime';\nexport default function Demo(){ return jsx('div', {}); }",
      { mode: "compiled" },
    );

    expect(validation.ok).toBe(true);
  });

  it("阻止 return null", () => {
    const validation = validatePreviewPageSource("export default function Demo(){ return null; }");

    expect(validation.ok).toBe(false);
    expect(validation.issues[0]?.code).toBe("EMPTY_RENDER_RISK");
  });

  it("裸 JSX 可自动包装", () => {
    const compiled = compilePreviewPageSource("<div>hello</div>", { resolveDependencyUrl });

    expect(compiled.compiledCode).toContain("function __AutoComponent__");
  });

  it("module preflight 识别重复顶层声明", () => {
    const validation = validateCompiledPreviewModule(
      "const accentMap = {};\nconst accentMap = {};\nexport default function Demo(){ return null; }",
    );

    expect(validation.ok).toBe(false);
    expect(validation.issues[0]?.stage).toBe("module_parse");
    expect(validation.issues[0]?.code).toBe("DUPLICATE_TOP_LEVEL_DECLARATION");
    expect(validation.issues[0]?.message).toContain("accentMap");
  });

  it("module preflight 识别多个默认导出", () => {
    const validation = validateCompiledPreviewModule(
      "export default function First(){}\nexport default function Second(){}",
    );

    expect(validation.ok).toBe(false);
    expect(validation.issues.some((issue) => issue.code === "MULTIPLE_DEFAULT_EXPORTS")).toBe(true);
  });

  it("module preflight 不执行用户页面代码", () => {
    const validation = validateCompiledPreviewModule(
      "globalThis.__previewPreflightExecuted = true;\nexport default function Demo(){ return null; }",
    );

    expect(validation.ok).toBe(true);
    expect((globalThis as { __previewPreflightExecuted?: boolean }).__previewPreflightExecuted).toBeUndefined();
  });

  it("生成 Agent 创作规则", () => {
    const rules = generatePreviewAuthoringRules();

    expect(rules).toContain("创作端页面运行契约");
    expect(rules).toContain("react/jsx-runtime");
  });
});
