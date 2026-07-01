import { compileCode, extractImports } from "../compiler";
import fs from "node:fs";
import path from "node:path";
import {
  PreviewRuntimeContractError,
  validatePreviewRuntimeContract,
} from "../preview-dependency-policy";
import { generateIframeHtml } from "@opencode-workbench/demo-ui/iframe-template";

describe("AI 页面预览运行时策略", () => {
  it("将 @preview/sdk 映射为受控虚拟模块", () => {
    const result = compileCode(`
      import { Icon, Button, trigger, useRouteParams } from "@preview/sdk";

      export default function Demo() {
        const params = useRouteParams();
        return <Button onClick={() => trigger("viewDetail", { productId: params.productId })}><Icon name="football" />参与活动</Button>;
      }
    `);

    expect(result.dependencies).toContain("@preview/sdk");
    expect(result.compiledCode).not.toContain("from '@preview/sdk'");
    expect(result.compiledCode).toContain('from "/preview-runtime/vendor/preview-sdk.js"');
    expect(result.moduleHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("为登记依赖生成同源 runtime URL", () => {
    const result = compileCode(`
      import { Trophy } from "lucide-react";

      export default function Demo() {
        return <Trophy />;
      }
    `);

    expect(result.compiledCode).toContain("/preview-runtime/vendor/lucide-react.js");
    expect(result.compiledCode).not.toContain("lucide-react?deps=");
  });

  it("本地 JSX runtime vendor 暴露 React 自动 JSX 转换需要的 named exports", () => {
    const runtimeDir = path.join(
      process.cwd(),
      "public",
      "preview-runtime",
      "vendor",
    );
    const jsxRuntime = fs.readFileSync(
      path.join(runtimeDir, "react-jsx-runtime.js"),
      "utf8",
    );
    const jsxDevRuntime = fs.readFileSync(
      path.join(runtimeDir, "react-jsx-dev-runtime.js"),
      "utf8",
    );

    expect(jsxRuntime).toContain(" as jsx");
    expect(jsxRuntime).toContain(" as jsxs");
    expect(jsxRuntime).toContain(" as Fragment");
    expect(jsxDevRuntime).toContain(" as jsxDEV");
    expect(jsxDevRuntime).toContain(" as Fragment");
  });

  it("iframe 可通过可视化编辑脚本采集正式图层树", () => {
    const html = generateIframeHtml();

    expect(html).toContain("collectVisualNodeTree: function()");
    expect(html).toContain("window.__VISUAL_EDIT__.collectVisualNodeTree()");
    expect(html).toContain("type === 'COLLECT_VISUAL_NODE_TREE'");
    expect(html).toContain("type: 'VISUAL_NODE_TREE_RESULT'");
  });

  it("支持紧急 CDN 回退", () => {
    const result = compileCode(
      `
        import { Trophy } from "lucide-react";

        export default function Demo() {
          return <Trophy />;
        }
      `,
      undefined,
      { preferCdn: true },
    );

    expect(result.compiledCode).toContain("lucide-react@0.323.0");
    expect(result.compiledCode).toContain("react@18.3.1");
  });

  it("拒绝未登记 npm 依赖", () => {
    expect(() =>
      compileCode(`
        import uniq from "lodash/uniq";

        export default function Demo() {
          return <div>{uniq([1, 1]).join(",")}</div>;
        }
      `),
    ).toThrow(PreviewRuntimeContractError);

    const validation = validatePreviewRuntimeContract('import uniq from "lodash/uniq";');
    expect(validation.issues[0]).toMatchObject({
      code: "UNKNOWN_NPM_IMPORT",
      moduleName: "lodash/uniq",
    });
  });

  it("拒绝页面源码手写 JSX runtime 编译产物", () => {
    expect(() =>
      compileCode(`
        import { jsx } from "react/jsx-runtime";

        export default function Demo() {
          return jsx("div", { children: "compiled" });
        }
      `),
    ).toThrow(PreviewRuntimeContractError);
  });

  it("允许页面使用 JSX runtime 常见生成名作为普通变量", () => {
    const result = compileCode(`
      const jsx = "user binding";

      export default function Demo() {
        return <div>{jsx}</div>;
      }
    `);

    expect(result.moduleHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.compiledCode).toContain("user binding");
  });

  it("提取依赖时不会把字符串中的双斜线当作注释", () => {
    const imports = extractImports(`
      const imageUrl = "https://example.com/a.png";
      import { Trophy } from "lucide-react";
      export default function Demo() {
        return <img src={imageUrl} alt="demo" />;
      }
    `);

    expect(imports).toEqual(["lucide-react"]);
  });

  it("提取依赖时忽略 type-only import", () => {
    const result = compileCode(`
      import type { Props } from "./types";

      export default function Demo(_props: Props) {
        return <div>Hello</div>;
      }
    `);

    expect(result.dependencies).not.toContain("./types");
    expect(result.moduleHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("拒绝当前 lucide-react 版本不存在的 named import", () => {
    const validation = validatePreviewRuntimeContract(`
      import { Soccer, Trophy } from "lucide-react";
    `);

    expect(validation.issues).toContainEqual(
      expect.objectContaining({
        code: "INVALID_LUCIDE_IMPORT",
        moduleName: "lucide-react",
        importName: "Soccer",
      }),
    );
  });
});
