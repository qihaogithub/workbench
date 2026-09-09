import { createAuthorCommentApi } from "./comment-api-client";

function response(data: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => ({ success: ok, data }),
  } as Response;
}

describe("author comment participant adapter", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("registers the cookie user before loading candidates", async () => {
    const calls: string[] = [];
    global.fetch = jest.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push(`${String(input)}:${init?.method ?? "GET"}`);
        return calls.length === 1
          ? response({
              participant: { id: "p1", name: "张三", lastParticipatedAt: 1 },
            })
          : response({
              participants: [{ id: "p1", name: "张三", lastParticipatedAt: 1 }],
            });
      },
    ) as typeof fetch;

    const result =
      await createAuthorCommentApi("project/1").listMentionCandidates?.();
    expect(result).toEqual([{ id: "p1", name: "张三", type: "user" }]);
    expect(calls).toEqual([
      "/api/projects/project%2F1/comment-participants:POST",
      "/api/projects/project%2F1/comment-participants:GET",
    ]);
  });

  it("continues candidate loading when registration fails", async () => {
    const calls: string[] = [];
    global.fetch = jest.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push(`${String(input)}:${init?.method ?? "GET"}`);
        return calls.length === 1
          ? response({}, false)
          : response({
              participants: [{ id: "p2", name: "李四", lastParticipatedAt: 2 }],
            });
      },
    ) as typeof fetch;

    const result =
      await createAuthorCommentApi("project-2").listMentionCandidates?.();
    expect(result).toEqual([{ id: "p2", name: "李四", type: "user" }]);
    expect(
      calls.map((call) => (call.endsWith(":POST") ? "POST" : "GET")),
    ).toEqual(["POST", "GET"]);
  });
});
