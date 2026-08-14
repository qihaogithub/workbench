import fs from "fs";
import {
  createCommentThread,
  createReply,
  readCommentStore,
  updateCommentThread,
  updateReply,
} from "./comment-store";
import type { CommentMention } from "@workbench/shared";

jest.mock("fs");
jest.mock("./paths", () => ({
  getProjectPath: (projectId: string) => `/data/projects/${projectId}`,
}));
jest.mock("./runtime-config", () => ({
  getServerAgentServiceUrl: () => "http://localhost:4201",
  getInternalApiToken: () => "test-token",
}));

const mockedFs = jest.mocked(fs);
const mockedWriteData: Record<string, string> = {};

function loadStore(projectId: string) {
  const raw = mockedWriteData[`/data/projects/${projectId}/comments.json`];
  return raw ? JSON.parse(raw) : { threads: [] };
}

const agentMention: CommentMention = { type: "agent", id: "agent", name: "AI 助手" };
const userMention: CommentMention = { type: "user", id: "u1", name: "张三" };

const author = { id: "u1", name: "张三", isAnonymous: false };

describe("createReply @AI 触发任务", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockedWriteData).forEach((k) => delete mockedWriteData[k]);
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockImplementation(((filePath: string) => {
      const raw = mockedWriteData[filePath as string];
      if (!raw) throw new Error("ENOENT");
      return raw;
    }) as typeof mockedFs.readFileSync);
    mockedFs.writeFileSync.mockImplementation(((filePath: string, data: string) => {
      mockedWriteData[filePath as string] = data;
      return undefined;
    }) as typeof mockedFs.writeFileSync);
    mockedFs.mkdirSync.mockImplementation((() => undefined) as unknown as typeof mockedFs.mkdirSync);
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;
  });

  function enqueueCalls() {
    const fetchMock = global.fetch as jest.Mock;
    return fetchMock.mock.calls.filter((c: [string]) =>
      (c[0] as string).includes("/internal/comments/ai-task"),
    );
  }

  async function createThread(mentions?: CommentMention[]) {
    return createCommentThread({
      projectId: "p1",
      target: { kind: "page", pageId: "page-1" },
      anchor: { domPath: "body > div", tagName: "div" },
      pin: { xRatio: 0.5, yRatio: 0.5 },
      content: "请修改按钮颜色",
      author,
      mentions,
    });
  }

  it("回复 @AI 时：线程 aiTaskStatus 置为 pending", async () => {
    const thread = await createThread([agentMention]);
    const result = await createReply({
      projectId: "p1",
      threadId: thread.id,
      content: "再改一下间距",
      author,
      mentions: [agentMention],
    });

    expect(result).not.toBeNull();
    const stored = loadStore("p1");
    const reloaded = stored.threads.find((t: { id: string }) => t.id === thread.id);
    expect(reloaded.aiTaskStatus).toBe("pending");
  });

  it("回复 @AI 时：调用 enqueueAiTask（POST /internal/comments/ai-task）", async () => {
    const thread = await createThread([agentMention]);
    await createReply({
      projectId: "p1",
      threadId: thread.id,
      content: "再改一下间距",
      author,
      mentions: [agentMention],
    });

    expect(enqueueCalls().length).toBeGreaterThan(0);
  });

  it("回复不 @AI 时：不置 pending、不入队", async () => {
    const thread = await createThread([agentMention]);
    await createReply({
      projectId: "p1",
      threadId: thread.id,
      content: "谢谢",
      author,
      mentions: [userMention],
    });

    const stored = loadStore("p1");
    const reloaded = stored.threads.find((t: { id: string }) => t.id === thread.id);
    // 未 @AI 的回复不改动原 aiTaskStatus（原为 pending，因线程创建时 @AI）
    expect(reloaded.aiTaskStatus).toBe("pending");
    // 仅创建线程时入队过一次，回复不入队
    expect(enqueueCalls().length).toBe(1);
  });

  it("回复 @AI 可重新入队已完成的线程", async () => {
    const thread = await createThread([agentMention]);
    const data = loadStore("p1");
    data.threads.find((t: { id: string }) => t.id === thread.id).aiTaskStatus = "done";
    mockedWriteData["/data/projects/p1/comments.json"] = JSON.stringify(data);

    await createReply({
      projectId: "p1",
      threadId: thread.id,
      content: "又发现新问题，请处理",
      author,
      mentions: [agentMention],
    });

    const stored2 = loadStore("p1");
    const reloaded = stored2.threads.find((t: { id: string }) => t.id === thread.id);
    expect(reloaded.aiTaskStatus).toBe("pending");
  });

  it("评论不存在时返回 null 且不抛错", async () => {
    const result = await createReply({
      projectId: "p1",
      threadId: "nonexistent",
      content: "hi",
      author,
      mentions: [agentMention],
    });
    expect(result).toBeNull();
  });
});

describe("readCommentStore 兜底", () => {
  it("文件不存在时返回空线程列表", () => {
    expect(readCommentStore("no-such")).toEqual({ threads: [] });
  });
});

describe("编辑评论与回复", () => {
  function enqueueCallsForEdit() {
    const fetchMock = global.fetch as jest.Mock;
    return fetchMock.mock.calls.filter((call: [string]) =>
      (call[0] as string).includes("/internal/comments/ai-task"),
    );
  }

  async function createThreadForEdit() {
    return createCommentThread({
      projectId: "p1",
      target: { kind: "page", pageId: "page-1" },
      anchor: { domPath: "body > div", tagName: "div" },
      pin: { xRatio: 0.5, yRatio: 0.5 },
      content: "请修改按钮颜色",
      author,
    });
  }

  it("保存主评论的正文和提及列表", async () => {
    const thread = await createThreadForEdit();
    const updated = await updateCommentThread("p1", thread.id, {
      content: "请改为深色 @AI 助手",
      mentions: [agentMention],
    });

    expect(updated).toMatchObject({
      content: "请改为深色 @AI 助手",
      mentions: [agentMention],
      aiTaskStatus: "pending",
    });
    expect(enqueueCallsForEdit()).toHaveLength(1);
  });

  it("保存回复的正文和提及列表", async () => {
    const thread = await createThreadForEdit();
    const created = await createReply({
      projectId: "p1",
      threadId: thread.id,
      content: "初始回复",
      author,
    });
    const updated = await updateReply("p1", thread.id, created!.reply.id, {
      content: "修改后的回复 @张三",
      mentions: [userMention],
    });

    expect(updated?.reply).toMatchObject({
      content: "修改后的回复 @张三",
      mentions: [userMention],
    });
  });
});
