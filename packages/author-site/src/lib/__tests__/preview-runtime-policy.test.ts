import { compileCode } from "../compiler";
import {
  PreviewRuntimeContractError,
  validatePreviewRuntimeContract,
} from "../preview-dependency-policy";

describe("AI 页面预览运行时策略", () => {
  it("将 @preview/sdk 映射为受控虚拟模块", () => {
    const result = compileCode(`
      import { Icon, Button } from "@preview/sdk";

      export default function Demo() {
        return <Button><Icon name="football" />参与活动</Button>;
      }
    `);

    expect(result.dependencies).toContain("@preview/sdk");
    expect(result.compiledCode).not.toContain("from '@preview/sdk'");
    expect(result.compiledCode).toContain("data:application/javascript");
  });

  it("为登记依赖生成固定版本 CDN URL", () => {
    const result = compileCode(`
      import { Trophy } from "lucide-react";

      export default function Demo() {
        return <Trophy />;
      }
    `);

    expect(result.compiledCode).toContain("lucide-react@0.323.0");
    expect(result.compiledCode).not.toContain("lucide-react?deps=");
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

  it("拒绝当前 lucide-react 版本不存在的 named import", () => {
    const validation = validatePreviewRuntimeContract(`
      import { Soccer, Trophy } from "lucide-react";
    `);

    expect(validation.issues).toEqual([
      expect.objectContaining({
        code: "INVALID_LUCIDE_IMPORT",
        moduleName: "lucide-react",
        importName: "Soccer",
      }),
    ]);
  });
});

