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
    expect(page).toContain(
      'import { PreviewStage } from "@workbench/demo-ui/PreviewStage";',
    );
    expect(page).not.toContain('import("@workbench/demo-ui/PreviewStage")');

    expect(validator).toContain('from "@workbench/demo-ui/types"');
    expect(validator).toContain('from "@workbench/demo-ui/validator"');
    expect(validator).not.toContain('from "@workbench/demo-ui"');

    expect(aiChatSetup).toContain('from "@workbench/ai-chat-shared/config"');
    expect(aiChatSetup).not.toContain('from "@workbench/ai-chat-shared"');

    expect(knowledgeDialog).toContain(
      'from "@workbench/demo-ui/DocumentEditor"',
    );
    expect(knowledgeDialog).not.toContain('from "@workbench/demo-ui"');
  });

  it("评论启动链维护项目级线程，并派生页面与配置项目标", () => {
    const page = readAuthorFile("src/app/demo/[id]/edit/page.tsx");

    expect(page).toMatch(
      /const\s+commentQueryTarget\s*=\s*useMemo<CommentTarget\s*\|\s*undefined>\s*\(\s*\(\)\s*=>\s*undefined,\s*\[\s*\],?\s*\);/,
    );
    expect(page).toMatch(
      /const commentsData = useComments\(\{[\s\S]*?target: commentQueryTarget,[\s\S]*?enabled: Boolean\(activeDemoId\),[\s\S]*?\}\);/,
    );
    expect(page).toContain("filterPageCommentThreads(commentsData.threads)");
    expect(page).toContain("countUnresolvedCommentThreadsByPage");
    expect(page).toContain("groupByPage");
    expect(page).toContain("focusedPageId={canvasEditingPageId}");
    expect(page).toContain(
      "<CommentUnreadDot count={unresolvedCommentCount} />",
    );
    expect(page).toContain("const configCommentController = useMemo<ConfigCommentController>");
    expect(page).toContain("configComments={configCommentController}");
    expect(page).not.toContain("<ConfigCommentDialog");
    expect(page).toMatch(
      /onCanvasClick: \(\) => \{[\s\S]*?setCanvasEditingPageId\(null\);/,
    );
    expect(page).not.toContain(
      'target: { kind: "page", pageId: activeDemoId },',
    );
  });
});
