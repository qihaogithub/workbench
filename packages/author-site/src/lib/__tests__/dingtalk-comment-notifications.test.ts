import fs from "fs";
import os from "os";
import path from "path";

describe("comment participants and DingTalk work notifications", () => {
  let dataDir: string;

  beforeEach(() => {
    jest.resetModules();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ow-comment-dingtalk-"));
    Object.assign(process.env, {
      DATA_DIR: dataDir,
      DINGTALK_CORP_ID: "corp-1",
      DINGTALK_APP_KEY: "app-key",
      DINGTALK_APP_SECRET: "app-secret",
      DINGTALK_AGENT_ID: "agent-1",
      DINGTALK_COMMENT_RATE_LIMIT_SECRET: "rate-secret",
      DINGTALK_COMMENT_TRUST_PROXY: "true",
      DINGTALK_COMMENT_NOTIFICATIONS_ENABLED: "false",
    });
  });

  afterEach(async () => {
    jest.useRealTimers();
    const { closeDb } = await import("@/lib/db");
    closeDb();
    fs.rmSync(dataDir, { recursive: true, force: true });
    jest.restoreAllMocks();
    Reflect.deleteProperty(global, "fetch");
    for (const key of [
      "DATA_DIR", "DINGTALK_CORP_ID", "DINGTALK_APP_KEY", "DINGTALK_APP_SECRET",
      "DINGTALK_AGENT_ID", "DINGTALK_COMMENT_RATE_LIMIT_SECRET", "DINGTALK_COMMENT_TRUST_PROXY",
      "DINGTALK_COMMENT_NOTIFICATIONS_ENABLED", "DINGTALK_COMMENT_VIEWER_BASE_URL",
    ]) delete process.env[key];
  });

  async function seedParticipant() {
    const { getDb } = await import("@/lib/db");
    const db = getDb();
    const stamp = Date.now();
    db.prepare("INSERT INTO users(id,username,password_hash,created_at,role) VALUES(?,?,?,?,?)")
      .run("user-1", "alice", "hash", stamp, "editor");
    db.prepare(`INSERT INTO user_dingtalk_identities
      (id,user_id,corp_id,union_id,dingtalk_user_id,name,avatar,raw_json,created_at,updated_at,last_login_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
      .run("identity-1", "user-1", "corp-1", "union-1", "ding-user-1", "Alice", null, null, stamp, stamp, stamp);
    const { registerCommentParticipant } = await import("@/lib/comment-participants");
    return registerCommentParticipant("project-1", "user-1")!;
  }

  it("registers a project-scoped participant and never exposes enterprise ids", async () => {
    const participant = await seedParticipant();
    const { searchCommentParticipants, normalizeCommentMentions } = await import("@/lib/comment-participants");
    expect(searchCommentParticipants("project-1", "Ali", true)).toEqual([
      expect.objectContaining({ id: participant.id, name: "Alice" }),
    ]);
    expect(JSON.stringify(searchCommentParticipants("project-1", "Ali", true))).not.toContain("ding-user-1");
    expect(normalizeCommentMentions("project-1", [{ type: "user", id: participant.id, name: "forged" }], 20)).toEqual([
      { type: "user", id: participant.id, name: "Alice" },
    ]);
    expect(() => normalizeCommentMentions("other-project", [{ type: "user", id: participant.id, name: "Alice" }], 20)).toThrow("INVALID_MENTION");
  });

  it("keeps anonymous comments successful but suppresses notifications without a trusted IP", async () => {
    const participant = await seedParticipant();
    const notifications = await import("@/lib/dingtalk-comment-notifications");
    notifications.enqueueCommentNotifications(
      "project-1", "thread-1", [{ type: "user", id: participant.id, name: participant.name }],
      "spoofed name", "hello", true, { kind: "page", pageId: "page-1" }, undefined, "anon-1", null, ["intent-1"],
    );
    expect(notifications.deliverySummary("project-1", "thread-1")).toMatchObject({ total: 1, suppressed: 1, status: "suppressed" });
  });

  it("创作端评论→钉钉工作通知→免登录浏览端深链 E2E", async () => {
    jest.useFakeTimers();
    const participant = await seedParticipant();
    const publishedDir = path.join(dataDir, "published", "project-1");
    fs.mkdirSync(publishedDir, { recursive: true });
    fs.writeFileSync(path.join(publishedDir, "project.json"), JSON.stringify({ name: "Demo", demoPages: [{ id: "page-1" }] }));
    process.env.DINGTALK_COMMENT_VIEWER_BASE_URL = "https://viewer.example.com";
    process.env.DINGTALK_COMMENT_NOTIFICATIONS_ENABLED = "true";
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/v1.0/oauth2/accessToken")) return { ok: true, json: async () => ({ accessToken: "token", expireIn: 7200 }) } as Response;
      if (url.includes("/asyncsend_v2")) {
        return { ok: true, json: async () => ({ errcode: 0, task_id: 42 }) } as Response;
      }
      if (url.includes("/getsendresult")) return { ok: true, json: async () => ({ errcode: 0, send_result: { success_user_id_list: ["ding-user-1"] } }) } as Response;
      throw new Error(`unexpected ${url}`);
    });
    (global as typeof globalThis & { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
    const { createCommentThread, listComments, readCommentStore } = await import("@/lib/comment-store");
    const thread = await createCommentThread({
      projectId: "project-1",
      target: { kind: "page", pageId: "page-1" },
      content: "hello",
      author: { id: "user-1", name: "Author", isAnonymous: false },
      mentions: [{ type: "user", id: participant.id, name: participant.name }],
    });
    await jest.advanceTimersByTimeAsync(1000);
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(1);
    const asyncSendCall = fetchMock.mock.calls.find(([input]) => String(input).includes("/asyncsend_v2"));
    const sent = JSON.parse(String(asyncSendCall?.[1]?.body));
    expect(sent).toMatchObject({ userid_list: "ding-user-1", msg: { msgtype: "action_card" } });
    expect(sent.msg.action_card.single_url).toBe(`https://viewer.example.com/project-1/page-1?comment=${thread.id}`);
    expect(readCommentStore("project-1").threads[0]?.notificationIntents).toEqual([
      expect.objectContaining({ participantId: participant.id }),
    ]);
    const publicProjection = listComments("project-1", { pageId: "page-1" });
    expect(publicProjection[0]).toMatchObject({ id: thread.id, dingtalkDelivery: { total: 1, submitted: 1, status: "submitted" } });
    expect(JSON.stringify(publicProjection)).not.toContain("ding-user-1");
    expect(JSON.stringify(publicProjection)).not.toContain("notificationIntents");
  });
});
