import { afterEach, describe, expect, it, vi } from "vitest";

import { compileCode } from "../src/utils/compile-client";

describe("compile client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("向编译服务传递 sessionId 和 demoId", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      success: true,
      data: {
        compiledCode: "compiled",
        cssImports: [],
      },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await compileCode("source", "session_1", "page_1");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/compile"),
      expect.objectContaining({
        body: JSON.stringify({
          code: "source",
          sessionId: "session_1",
          demoId: "page_1",
        }),
      }),
    );
  });
});
