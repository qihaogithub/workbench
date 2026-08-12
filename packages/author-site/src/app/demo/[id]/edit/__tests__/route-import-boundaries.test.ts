import fs from "fs";
import path from "path";

function readAuthorFile(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf-8");
}

describe("编辑路由导入边界", () => {
  it("首屏同步链路只使用轻量 package 子路径", () => {
    const page = readAuthorFile("src/app/demo/[id]/edit/page.tsx");
    const validator = readAuthorFile("lib/validator.ts");
    const aiChatSetup = readAuthorFile("src/lib/ai-chat-setup.ts");
    const knowledgeDialog = readAuthorFile(
      "src/components/demo/KnowledgeDocDialog.tsx",
    );

    expect(page).toContain('from "date-fns/locale/zh-CN"');
    expect(page).not.toContain('from "date-fns/locale"');

    expect(validator).toContain('from "@workbench/demo-ui/types"');
    expect(validator).toContain('from "@workbench/demo-ui/validator"');
    expect(validator).not.toContain('from "@workbench/demo-ui"');

    expect(aiChatSetup).toContain(
      'from "@workbench/ai-chat-shared/config"',
    );
    expect(aiChatSetup).not.toContain('from "@workbench/ai-chat-shared"');

    expect(knowledgeDialog).toContain(
      'from "@workbench/demo-ui/DocumentEditor"',
    );
    expect(knowledgeDialog).not.toContain('from "@workbench/demo-ui"');
  });
});
