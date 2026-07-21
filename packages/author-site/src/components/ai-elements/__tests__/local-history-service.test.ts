import {
  deleteLocalChatSession,
  deriveLocalChatTitle,
  readLocalChatSessions,
  writeLocalChatSession,
} from "@workbench/ai-chat-shared/chat/services/local-history-service";

describe("浏览端 AI 本地历史", () => {
  beforeEach(() => window.localStorage.clear());

  it("按项目保存、恢复和删除历史", () => {
    writeLocalChatSession({
      projectId: "project-a",
      sessionId: "session-1",
      title: "第一条问题",
      createdAt: 10,
      updatedAt: 20,
      messages: [{ role: "user", content: "第一条问题" }],
    });
    writeLocalChatSession({
      projectId: "project-b",
      sessionId: "session-2",
      title: "另一个项目",
      createdAt: 30,
      updatedAt: 40,
      messages: [{ role: "user", content: "另一个项目" }],
    });

    expect(readLocalChatSessions("project-a")).toHaveLength(1);
    expect(readLocalChatSessions("project-a")[0].sessionId).toBe("session-1");
    expect(readLocalChatSessions("project-b")[0].sessionId).toBe("session-2");

    deleteLocalChatSession("project-a", "session-1");
    expect(readLocalChatSessions("project-a")).toEqual([]);
  });

  it("不把图片 base64 写进 localStorage，并从首条用户消息生成标题", () => {
    const messages = [
      {
        role: "user" as const,
        content: "请分析这张设计稿并给出建议",
        parts: [
          { type: "image" as const, url: "data:image/png;base64,AAAA" },
        ],
      },
    ];
    writeLocalChatSession({
      projectId: "project-a",
      sessionId: "session-image",
      title: deriveLocalChatTitle(messages),
      createdAt: 10,
      updatedAt: 20,
      messages,
    });

    const [saved] = readLocalChatSessions("project-a");
    expect(saved.title).toBe("请分析这张设计稿并给出建议");
    expect(saved.messages[0].parts).toEqual([]);
    expect(window.localStorage.getItem("workbench:viewer-ai-history:project-a"))
      .not.toContain("base64");
  });
});
