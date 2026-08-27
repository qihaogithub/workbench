import fs from "node:fs";
import path from "node:path";

const authorSiteRoot = path.resolve(__dirname, "../../..");
const workspaceRoot = path.resolve(authorSiteRoot, "../..");

describe("author AI chat bundle boundary", () => {
  it("编辑页通过二级延迟边界加载 AIChat，不把富文本依赖放进首屏路由", () => {
    const editorPage = fs.readFileSync(
      path.join(authorSiteRoot, "src/app/demo/[id]/edit/page.tsx"),
      "utf8",
    );
    const deferredBoundary = fs.readFileSync(
      path.join(
        authorSiteRoot,
        "src/components/ai-elements/deferred-author-ai-chat.tsx",
      ),
      "utf8",
    );

    expect(editorPage).toContain(
      'import("@/components/ai-elements/deferred-author-ai-chat")',
    );
    expect(editorPage).not.toContain(
      'import("@/components/ai-elements/author-ai-chat")',
    );
    expect(deferredBoundary).toContain(
      'import("@/components/ai-elements/author-ai-chat")',
    );
    expect(deferredBoundary).not.toContain('from "@workbench/ai-chat-shared"');
  });

  it("宿主入口只注入创作端配置并从共享包 AIChat 子路径导出", () => {
    const hostEntry = fs.readFileSync(
      path.join(
        authorSiteRoot,
        "src/components/ai-elements/author-ai-chat.tsx",
      ),
      "utf8",
    );

    expect(hostEntry).toContain('import "@/lib/ai-chat-setup"');
    expect(hostEntry).toContain(
      'export { AIChat } from "@workbench/ai-chat-shared/ai-chat"',
    );
    expect(hostEntry).not.toContain('from "@workbench/ai-chat-shared"');
  });

  it("共享包公开 AIChat 与编辑页类型的精确子路径", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(
        path.join(workspaceRoot, "packages/ai-chat-shared/package.json"),
        "utf8",
      ),
    ) as { exports?: Record<string, string> };

    expect(packageJson.exports).toMatchObject({
      "./ai-chat": "./src/ai-chat.tsx",
      "./message": "./src/message.tsx",
      "./stream-service": "./src/chat/services/stream-service.ts",
      "./active-view-context": "./src/lib/active-view-context.ts",
      "./element-selection": "./src/chat/element-selection-chip.tsx",
    });
  });

  it("消息列表延迟加载富文本消息渲染器", () => {
    const chatMessages = fs.readFileSync(
      path.join(
        workspaceRoot,
        "packages/ai-chat-shared/src/chat/chat-messages.tsx",
      ),
      "utf8",
    );

    expect(chatMessages).toContain('dynamic(() => import("../message")');
    expect(chatMessages).toContain('import("../assistant-message")');
    expect(chatMessages).not.toContain(
      'import { Message, type ChatMessage } from "../message"',
    );
    expect(chatMessages).not.toContain(
      'import { AssistantMessage } from "../assistant-message"',
    );
  });

  it("编辑页同步依赖不经过 demo-ui 全量入口", () => {
    const sourceFiles = [
      "src/app/demo/[id]/edit/page.tsx",
      "src/app/demo/[id]/edit/hooks/useVisualEditState.ts",
      "src/app/demo/[id]/edit/components/VisualEditSidebar.tsx",
      "src/components/demo/useCanvasWorkspace.ts",
      "src/lib/runtime-props.ts",
      "src/lib/prototype-visual-editor.ts",
      "src/lib/visual-configurator.ts",
      "src/lib/comment-api-client.ts",
    ];

    for (const relativePath of sourceFiles) {
      const source = fs.readFileSync(
        path.join(authorSiteRoot, relativePath),
        "utf8",
      );
      expect(source).not.toMatch(/from ["']@workbench\/demo-ui["']/);
      expect(source).not.toMatch(/import\(["']@workbench\/demo-ui["']\)/);
      expect(source).not.toMatch(/components\/demo["']/);
    }
  });

  it("demo-ui 公开画布持久化与图层树精确子路径", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(
        path.join(workspaceRoot, "packages/demo-ui/package.json"),
        "utf8",
      ),
    ) as { exports?: Record<string, string> };

    expect(packageJson.exports).toMatchObject({
      "./canvas-utils": "./src/canvas-utils.ts",
      "./LayerTreeMenu": "./src/LayerTreeMenu.tsx",
    });
  });
});
