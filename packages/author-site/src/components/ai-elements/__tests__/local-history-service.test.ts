import {
  deleteLocalChatSession,
  deriveLocalChatTitle,
  LOCAL_CHAT_HISTORY_TTL_MS,
  readLocalChatSessions,
  writeLocalChatSession,
} from "@workbench/ai-chat-shared/chat/services/local-history-service";
import {
  deriveConversationTitle,
  deriveConversationTitleFromMessages,
  normalizeConversationTitle,
} from "@workbench/ai-chat-shared";

describe("浏览端 AI 本地历史", () => {
  beforeEach(() => window.localStorage.clear());

  it("按项目保存、恢复和删除历史", () => {
    const now = Date.now();
    writeLocalChatSession({
      projectId: "project-a",
      sessionId: "session-1",
      title: "第一条问题",
      createdAt: now - 2_000,
      updatedAt: now - 1_000,
      messages: [{ role: "user", content: "第一条问题" }],
    });
    writeLocalChatSession({
      projectId: "project-b",
      sessionId: "session-2",
      title: "另一个项目",
      createdAt: now - 4_000,
      updatedAt: now - 3_000,
      messages: [{ role: "user", content: "另一个项目" }],
    });

    expect(readLocalChatSessions("project-a")).toHaveLength(1);
    expect(readLocalChatSessions("project-a")[0].sessionId).toBe("session-1");
    expect(readLocalChatSessions("project-b")[0].sessionId).toBe("session-2");

    deleteLocalChatSession("project-a", "session-1");
    expect(readLocalChatSessions("project-a")).toEqual([]);
  });

  it("不把图片 base64 写进 localStorage，并从首条用户消息生成标题", () => {
    const now = Date.now();
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
      createdAt: now - 2_000,
      updatedAt: now - 1_000,
      messages,
    });

    const [saved] = readLocalChatSessions("project-a");
    expect(saved.title).toBe("分析设计稿并给出建议");
    expect(saved.messages[0].parts).toEqual([]);
    expect(window.localStorage.getItem("workbench:viewer-ai-history:project-a"))
      .not.toContain("base64");
  });

  it("读取历史时清理超过 7 天未活动的会话", () => {
    const now = Date.now();
    const sessions = [
      {
        projectId: "project-a",
        sessionId: "recent",
        title: "最近对话",
        createdAt: now - 1_000,
        updatedAt: now - 1_000,
        messages: [],
      },
      {
        projectId: "project-a",
        sessionId: "stale",
        title: "旧对话",
        createdAt: now - LOCAL_CHAT_HISTORY_TTL_MS - 2_000,
        updatedAt: now - LOCAL_CHAT_HISTORY_TTL_MS - 1_000,
        messages: [],
      },
    ];
    window.localStorage.setItem(
      "workbench:viewer-ai-history:project-a",
      JSON.stringify(sessions),
    );

    expect(readLocalChatSessions("project-a").map((session) => session.sessionId)).toEqual([
      "recent",
    ]);
    expect(
      JSON.parse(
        window.localStorage.getItem("workbench:viewer-ai-history:project-a") || "[]",
      ),
    ).toHaveLength(1);
  });

  it("生成短标题时清理 Markdown、标点并限制长度", () => {
    expect(deriveConversationTitle("## 优化按钮颜色！！！\n请给出建议")).toBe(
      "优化按钮颜色",
    );
    expect(deriveConversationTitle("Fix the login redirect bug in the viewer")).toBe(
      "Fix the login redirect",
    );
    expect(normalizeConversationTitle("修复 viewer login bug")).toBe(
      "修复 viewer login bug",
    );
    expect(normalizeConversationTitle("```json\n{\"title\":\"对话\"}\n```")).toBe(
      "新对话",
    );
    expect(normalizeConversationTitle("Here is a concise title: 优化登录流程")).toBe(
      "优化登录流程",
    );
    expect(normalizeConversationTitle("我建议使用优化登录流程作为标题")).toBe(
      "新对话",
    );
    expect(normalizeConversationTitle("标题")).toBe("新对话");
  });

  it("忽略可视化修改等隐藏上下文，使用首条真实用户消息", () => {
    expect(
      deriveConversationTitleFromMessages([
        {
          role: "user",
          content: "调整按钮颜色",
          visualProperty: {
            title: "按钮颜色",
            summary: "结构化属性更新",
            hiddenPrompt: "内部属性变更指令",
          },
        },
        { role: "user", content: "请整理登录流程" },
      ]),
    ).toBe("整理登录流程");
  });
});
